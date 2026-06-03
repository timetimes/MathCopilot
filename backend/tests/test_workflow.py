"""
测试：工作流模块
验证多角色模型路由、输入预处理、代码重试逻辑。
"""

import pytest
from backend.config import ModelRole, ModelConfig, resolve_role_config
from backend.agent.workflow import (
    pipe_input,
    _route_skill,
    _fallback_route,
    _parse_json_response,
)


# ── ModelConfig / resolve_role_config ───────────────────────────

class TestModelConfig:
    def test_resolve_none(self):
        """config_map 为 None 时回退到全局"""
        cfg = resolve_role_config(None, ModelRole.SOLUTION)
        assert cfg is not None
        assert cfg.provider in ("openai", "anthropic", "mock")

    def test_resolve_empty_dict(self):
        """空 config_map 回退全局"""
        cfg = resolve_role_config({}, ModelRole.SOLUTION)
        assert cfg is not None

    def test_resolve_role_specific(self):
        """角色特定配置覆盖 DEFAULT"""
        config_map = {
            "solution": {
                "provider": "openai",
                "model_name": "gpt-4o",
                "api_key": "sk-test-key",
                "base_url": "https://api.openai.com/v1",
            }
        }
        cfg = resolve_role_config(config_map, ModelRole.SOLUTION)
        assert cfg.model_name == "gpt-4o"
        assert cfg.api_key == "sk-test-key"

    def test_resolve_fallback_to_default(self):
        """角色无配置时使用 DEFAULT"""
        config_map = {
            "default": {
                "provider": "openai",
                "model_name": "gpt-4o-mini",
                "api_key": "sk-default-key",
                "base_url": "https://api.openai.com/v1",
            }
        }
        cfg = resolve_role_config(config_map, ModelRole.VIZ_CODE)
        assert cfg.model_name == "gpt-4o-mini"
        assert cfg.api_key == "sk-default-key"

    def test_build_llm_mock(self):
        """Mock provider 返回 None"""
        cfg = ModelConfig(provider="mock", model_name="mock", api_key="", base_url="")
        llm = cfg.build_llm()
        assert llm is None

    def test_is_effectively_empty(self):
        """空 API Key 被视为无效"""
        cfg = ModelConfig(api_key="")
        assert cfg.is_effectively_empty() is True

        cfg2 = ModelConfig(api_key="sk-real-key")
        assert cfg2.is_effectively_empty() is False

        cfg3 = ModelConfig(api_key="sk-your-key-here")
        assert cfg3.is_effectively_empty() is True


# ── _parse_json_response ──────────────────────────────────────

class TestParseJsonResponse:
    def test_parse_json_block(self):
        """解析 ```json ``` 代码块"""
        text = '```json\n{"hints": ["a", "b"]}\n```'
        result = _parse_json_response(text)
        assert result["hints"] == ["a", "b"]

    def test_parse_braces(self):
        """解析裸花括号"""
        text = '{"skill": "test", "params": {"x": 1}}'
        result = _parse_json_response(text)
        assert result["skill"] == "test"
        assert result["params"]["x"] == 1

    def test_parse_fallback(self):
        """无法解析时返回原始文本"""
        text = "纯文本回复"
        result = _parse_json_response(text)
        assert "explanation" in result
        assert result["explanation"] == text


# ── pipe_input ─────────────────────────────────────────────────

class TestPipeInput:
    def test_pipe_input_empty(self):
        """空输入直接返回"""
        result = pipe_input("")
        assert result["markdown"] == ""
        assert result["original_text"] == ""

    def test_pipe_input_fallback(self):
        """无 LLM 时（mock provider）原样返回"""
        result = pipe_input("求解方程 x^2 - 3x + 2 = 0")
        assert "求解方程" in result["markdown"]

    def test_pipe_input_preserves_original(self):
        """original_text 字段回显原文"""
        text = "测试输入"
        result = pipe_input(text)
        assert result["original_text"] == text


# ── _fallback_route / _route_skill ────────────────────────────

class TestFallbackRoute:
    def test_route_distance(self):
        """距离问题路由到 geometry_basics"""
        result = _fallback_route("计算两点间距离")
        assert result["skill_to_use"] == "geometry_basics"

    def test_route_function(self):
        """函数绘图路由到 visualize_function"""
        result = _fallback_route("绘制 y = sin(x)")
        assert result["skill_to_use"] == "visualize_function"

    def test_route_trig(self):
        """三角函数路由到 trigonometry"""
        result = _fallback_route("计算 sin(45度)")
        assert result["skill_to_use"] == "trigonometry"

    def test_route_algebra(self):
        """代数问题路由到 algebra"""
        result = _fallback_route("解方程")
        assert result["skill_to_use"] == "algebra"

    def test_route_unknown(self):
        """未知问题返回 None"""
        result = _fallback_route("今天天气怎么样")
        assert result["skill_to_use"] is None

    def test_route_with_config_map(self):
        """_route_skill 接受 config_map 参数"""
        result = _route_skill("计算两点间距离", {})
        assert result["skill_to_use"] is not None


# ── ModelRole enum ─────────────────────────────────────────────

class TestModelRole:
    def test_all_roles_present(self):
        """验证所有角色定义"""
        values = [r.value for r in ModelRole]
        assert "default" in values
        assert "input" in values
        assert "solution" in values
        assert "viz_code" in values
        assert "router" in values
        assert "formal_proof" in values
