"""
Math Copilot - Pydantic 模型定义
所有 API 请求/响应的数据结构。
"""

from typing import Any, Optional

from pydantic import BaseModel


# ═══════════════════════════════════════════════════════════════════
#  聊天
# ═══════════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    """聊天请求"""
    message: str
    conversation_id: Optional[str] = None
    show_answer: bool = False
    # ── 多模型支持 ─────────────────────────────────────────────
    models_config: Optional[dict[str, Any]] = None  # X-Model-Config header 解码后的 JSON
    confirmed_markdown: Optional[str] = None        # 用户确认/编辑后的规范 Markdown


class ChatResponse(BaseModel):
    """聊天响应"""
    reply: str
    is_hint_only: bool = True
    conversation_id: Optional[str] = None
    skill_used: Optional[str] = None
    visualization_data: Optional[dict[str, Any]] = None
    suggested_skill: Optional[str] = None
    new_skill_generated: bool = False
    hints: Optional[list[str]] = None
    # ── 多模型支持 ─────────────────────────────────────────────
    viz_code_attempts: int = 0                      # 可视化代码重试次数
    viz_code_error: Optional[str] = None            # 最后一次代码执行错误
    suggest_model_upgrade: bool = False             # 是否建议升级模型
    input_markdown: Optional[str] = None            # 输入预处理后的 Markdown


# ═══════════════════════════════════════════════════════════════════
#  交互 & Skill
# ═══════════════════════════════════════════════════════════════════

class InteractionRequest(BaseModel):
    """可视化交互请求（拖动/缩放后回传后端重算）"""
    visualization_type: str
    params: dict[str, Any]


class SkillInfo(BaseModel):
    """Skill 信息"""
    name: str
    description: str


class GenerateSkillRequest(BaseModel):
    """生成 Skill 请求"""
    name: str
    description: str
    code: str


class ExecuteCodeRequest(BaseModel):
    """执行代码请求"""
    code: str
    input_data: dict[str, Any] = {}
