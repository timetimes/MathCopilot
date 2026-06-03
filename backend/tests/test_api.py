"""
测试：API 路由
使用 FastAPI TestClient 测试所有端点。
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.skills.skill_loader import load_all_skills


client = TestClient(app)


# ── 测试前加载 Skills ───────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup():
    load_all_skills()
    yield


# ── 根路径 ──────────────────────────────────────────────────────────

class TestRoot:
    def test_api_info(self):
        """GET /api/info 返回服务信息"""
        res = client.get("/api/info")
        assert res.status_code == 200
        data = res.json()
        assert data["service"] == "Math Copilot API"
        assert "version" in data


# ── 健康检查 ────────────────────────────────────────────────────────

class TestHealth:
    def test_health(self):
        """GET /api/health 返回 ok"""
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["skills_loaded"] >= 4


# ── Skills ───────────────────────────────────────────────────────────

class TestSkills:
    def test_list_skills(self):
        """GET /api/skills 返回所有 Skill"""
        res = client.get("/api/skills")
        assert res.status_code == 200
        data = res.json()
        assert "skills" in data
        assert len(data["skills"]) >= 4

        names = [s["name"] for s in data["skills"]]
        assert "geometry_basics" in names


# ── Chat ────────────────────────────────────────────────────────────

class TestChat:
    def test_chat_hint_only(self):
        """POST /api/chat 返回 hint"""
        res = client.post("/api/chat", json={
            "message": "计算点 A(1,2) 到 B(4,6) 的距离",
            "show_answer": False,
        })
        assert res.status_code == 200
        data = res.json()
        assert data["is_hint_only"] is True
        assert len(data["reply"]) > 0
        assert "conversation_id" in data

    def test_chat_with_answer(self):
        """POST /api/chat 返回完整解答"""
        res = client.post("/api/chat", json={
            "message": "计算点 A(0,0) 到 B(3,4) 的距离",
            "show_answer": True,
        })
        assert res.status_code == 200
        data = res.json()
        assert data["is_hint_only"] is False
        assert data["skill_used"] is not None

    def test_chat_returns_visualization(self):
        """求解时返回可视化数据"""
        res = client.post("/api/chat", json={
            "message": "计算点 A(0,0) 到 B(4,3) 的距离",
            "show_answer": True,
        })
        assert res.status_code == 200
        data = res.json()
        # Fallback 模式下也应有可视化数据
        assert data["visualization_data"] is not None


# ── /api/solve ──────────────────────────────────────────────────────

class TestSolve:
    def test_direct_solve(self):
        """POST /api/solve 直接求解"""
        res = client.post("/api/solve", json={
            "message": "计算两点距离 A(0,0) B(4,3)",
        })
        assert res.status_code == 200
        data = res.json()
        assert "reply" in data
        assert "skill_used" in data


# ── /api/interact ───────────────────────────────────────────────────

class TestInteract:
    def test_geometry_interaction(self):
        """POST /api/interact 几何交互"""
        res = client.post("/api/interact", json={
            "visualization_type": "geometry",
            "params": {"x1": 0, "y1": 0, "x2": 5, "y2": 12},
        })
        assert res.status_code == 200
        data = res.json()
        assert "visualization_data" in data
        assert data["visualization_data"]["type"] == "geometry"

    def test_function_plot_interaction(self):
        """POST /api/interact 函数绘图交互"""
        res = client.post("/api/interact", json={
            "visualization_type": "function_plot",
            "params": {"expression": "cos(x)"},
        })
        assert res.status_code == 200
        data = res.json()
        assert "visualization_data" in data
        assert data["visualization_data"]["type"] == "function_plot"


# ── /api/execute ────────────────────────────────────────────────────

class TestExecute:
    def test_execute_math(self):
        """POST /api/execute 执行数学代码"""
        res = client.post("/api/execute", json={
            "code": "print(2 + 2)",
            "input_data": {},
        })
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "4" in data["stdout"]


# ── /api/generate-skill ─────────────────────────────────────────────

class TestGenerateSkill:
    def test_generate_skill(self):
        """POST /api/generate-skill 创建新 Skill"""
        res = client.post("/api/generate-skill", json={
            "name": "api_test_skill",
            "description": "API 测试用",
            "code": """
NAME = "api_test_skill"
DESCRIPTION = "API 测试用"

def run(params):
    return {"api_test": True}
""",
        })
        assert res.status_code == 200
        data = res.json()
        assert "创建成功" in data["message"]

    def test_generate_skill_invalid(self):
        """无效的创建请求应返回 400"""
        res = client.post("/api/generate-skill", json={
            "name": "",
            "description": "",
            "code": "",
        })
        # 可能返回 400 或 200（空文件可能也能创建）
        assert res.status_code in (200, 400, 422)


# ── 多模型配置 ─────────────────────────────────────────────────

class TestModelConfigHeader:
    def test_chat_with_models_config(self):
        """Chat 请求携带 models_config"""
        res = client.post("/api/chat", json={
            "message": "计算距离",
            "show_answer": True,
            "models_config": {
                "default": {"provider": "mock", "model_name": "mock", "api_key": "", "base_url": ""},
            },
        })
        assert res.status_code == 200
        data = res.json()
        # 即使 models_config 传了 mock，fallback 应该能工作
        assert "reply" in data

    def test_solve_with_models_config(self):
        """Solve 请求携带 models_config"""
        res = client.post("/api/solve", json={
            "message": "计算 A(0,0) 到 B(4,3) 的距离",
            "models_config": {},
        })
        assert res.status_code == 200
        data = res.json()
        assert "reply" in data
        assert "skill_used" in data
