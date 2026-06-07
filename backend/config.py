"""
Math Copilot - 配置模块
使用 pydantic-settings 从 backend/.env 加载配置，含合理默认值。

支持多角色模型路由：
  - 每个角色 (input/solution/viz_code/router) 可独立配置 provider/model/key/url
  - 未配置的角色自动回退到 DEFAULT 角色
  - DEFAULT 未配置则使用全局 env 配置
  - 所有配置均通过 backend/.env 管理
"""

import os
from enum import Enum
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, model_validator
from pydantic_settings import BaseSettings


# ═══════════════════════════════════════════════════════════════════
#  模型角色枚举
# ═══════════════════════════════════════════════════════════════════

class ModelRole(str, Enum):
    """定义系统中的模型角色"""
    DEFAULT = "default"
    INPUT = "input"          # 输入预处理（非规范文字→规范 Markdown）
    SOLUTION = "solution"    # 解题推理（思路 + 答案）
    VIZ_CODE = "viz_code"    # 可视化代码生成
    ROUTER = "router"        # Skill 路由选择（轻量模型）
    FORMAL_PROOF = "formal_proof"  # 形式化证明（预留）


# ═══════════════════════════════════════════════════════════════════
#  模型配置
# ═══════════════════════════════════════════════════════════════════

class ModelConfig(BaseModel):
    """单个角色的模型配置"""
    provider: Literal["openai", "anthropic", "mock"] = "openai"
    model_name: str = "gpt-4-turbo-preview"
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"

    def is_effectively_empty(self) -> bool:
        """判断此配置是否有效（是否需要 fallback）"""
        return not self.api_key or self.api_key == "sk-your-key-here"

    def build_llm(self, temperature: float = 0.3):
        """
        根据配置构建 LangChain LLM 实例。
        返回 None 时表示无法构建（应使用 fallback）。
        """
        if self.provider == "mock":
            return None

        try:
            if self.provider == "openai":
                from langchain_openai import ChatOpenAI
                return ChatOpenAI(
                    model=self.model_name,
                    openai_api_key=self.api_key,
                    openai_api_base=self.base_url,
                    temperature=temperature,
                )
            elif self.provider == "anthropic":
                from langchain_anthropic import ChatAnthropic
                return ChatAnthropic(
                    model=self.model_name,
                    anthropic_api_key=self.api_key,
                    temperature=temperature,
                )
            else:
                return None
        except ImportError as e:
            import logging
            logging.getLogger("math-copilot").warning(
                f"LLM 依赖未安装 ({e})，使用 fallback 模式"
            )
            return None
        except Exception as e:
            import logging
            logging.getLogger("math-copilot").error(f"LLM 初始化失败: {e}")
            return None


# ═══════════════════════════════════════════════════════════════════
#  角色配置解析
# ═══════════════════════════════════════════════════════════════════

def resolve_role_config(
    config_map: dict[str, Any] | None,
    role: ModelRole,
) -> ModelConfig:
    """
    从请求级 config_map 解析指定角色的配置。
    回退链：角色配置 → DEFAULT → 全局 env
    """
    if not config_map:
        return _global_default_config()

    # 尝试角色指定配置
    role_key = role.value
    if role_key in config_map and isinstance(config_map[role_key], dict):
        rc = config_map[role_key]
        cfg = ModelConfig(
            provider=rc.get("provider", "openai"),
            model_name=rc.get("model_name", "gpt-4-turbo-preview"),
            api_key=rc.get("api_key", ""),
            base_url=rc.get("base_url", "https://api.openai.com/v1"),
        )
        if not cfg.is_effectively_empty():
            return cfg

    # 尝试 DEFAULT 角色
    if "default" in config_map and isinstance(config_map["default"], dict):
        dc = config_map["default"]
        cfg = ModelConfig(
            provider=dc.get("provider", "openai"),
            model_name=dc.get("model_name", "gpt-4-turbo-preview"),
            api_key=dc.get("api_key", ""),
            base_url=dc.get("base_url", "https://api.openai.com/v1"),
        )
        if not cfg.is_effectively_empty():
            return cfg

    # 回退到全局 env
    return _global_default_config()


def _global_default_config() -> ModelConfig:
    """从全局 Settings 构造默认 ModelConfig"""
    s = settings
    return ModelConfig(
        provider=s.llm_provider,
        model_name=s.llm_model_name,
        api_key=s.anthropic_api_key if s.llm_provider == "anthropic" else (s.openai_api_key or s.anthropic_api_key),
        base_url=s.openai_base_url,
    )


# ═══════════════════════════════════════════════════════════════════
#  全局设置 (pydantic-settings)
# ═══════════════════════════════════════════════════════════════════

class Settings(BaseSettings):
    # ── LLM 全局配置（被 resolve_role_config 作为最终 fallback） ─
    llm_provider: Literal["openai", "anthropic", "mock"] = "openai"
    llm_model_name: str = "gpt-4-turbo-preview"
    openai_api_key: str = "sk-your-key-here"
    openai_base_url: str = "https://api.openai.com/v1"
    anthropic_api_key: str = ""

    # ── 应用 ───────────────────────────────────────────────────
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = True

    # ── 沙箱 ───────────────────────────────────────────────────
    sandbox_timeout: int = 30
    sandbox_mode: Literal["subprocess", "docker"] = "subprocess"

    # ── 路径 ───────────────────────────────────────────────────
    skills_dir: str = str(Path(__file__).parent / "skills")

    class Config:
        env_file = str(Path(__file__).parent / ".env")
        env_file_encoding = "utf-8"

    @model_validator(mode="after")
    def _resolve_relative_paths(self):
        """将相对路径解析为基于本文件位置的绝对路径，避免 CWD 影响。"""
        p = Path(self.skills_dir)
        if not p.is_absolute():
            self.skills_dir = str((Path(__file__).parent / p).resolve())
        return self


settings = Settings()

# 兼容旧版引用
LLM_API_KEY = settings.openai_api_key
LLM_BASE_URL = settings.openai_base_url
LLM_MODEL = settings.llm_model_name
SKILLS_DIR = settings.skills_dir
