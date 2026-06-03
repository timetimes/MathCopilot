"""
测试：Skills 模块
验证所有内置 Skill 的正确加载和功能。
"""

from pathlib import Path

import pytest

from backend.skills.skill_loader import load_all_skills, list_skills, get_skill, call_skill


# ── 测试夹具 ────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reload_skills():
    """每个测试前重新加载 Skills"""
    load_all_skills()
    yield


# ── Skill 加载测试 ──────────────────────────────────────────────────

def test_load_all_skills():
    """确保所有内置 Skill 被正确加载"""
    skills = list_skills()
    skill_names = [s["name"] for s in skills]

    assert "geometry_basics" in skill_names, "geometry_basics 未加载"
    assert "visualize_function" in skill_names, "visualize_function 未加载"
    assert "trigonometry" in skill_names, "trigonometry 未加载"
    assert "algebra" in skill_names, "algebra 未加载"
    assert len(skills) >= 4, f"至少应有 4 个 Skill，当前 {len(skills)}"


def test_skill_metadata():
    """验证 Skill 元数据"""
    skills = list_skills()
    for s in skills:
        assert "name" in s, f"Skill 缺少名称: {s}"
        assert "description" in s, f"Skill '{s['name']}' 缺少描述"
        assert len(s["name"]) > 0, "Skill 名称为空"
        assert len(s["description"]) > 0, f"Skill '{s['name']}' 描述为空"


def test_get_skill_by_name():
    """通过名称获取 Skill"""
    skill = get_skill("geometry_basics")
    assert skill is not None
    assert skill["name"] == "geometry_basics"
    assert callable(skill["run"])


def test_get_nonexistent_skill():
    """获取不存在的 Skill 应返回 None"""
    assert get_skill("nonexistent_skill") is None


# ── geometry_basics 测试 ────────────────────────────────────────────

class TestGeometryBasics:
    def test_distance(self):
        """两点间距离计算：3-4-5 三角形"""
        result = call_skill("geometry_basics", {
            "x1": 0, "y1": 0, "x2": 3, "y2": 4,
        })
        assert result["type"] == "geometry"
        assert result["metadata"]["distance"] == 5.0

    def test_distance_negative(self):
        """负坐标距离"""
        result = call_skill("geometry_basics", {
            "x1": -1, "y1": -1, "x2": 2, "y2": 3,
        })
        assert abs(result["metadata"]["distance"] - 5.0) < 0.001

    def test_midpoint(self):
        """中点坐标"""
        result = call_skill("geometry_basics", {
            "x1": 0, "y1": 0, "x2": 4, "y2": 6,
        })
        m = result["metadata"]["midpoint"]
        assert m["x"] == 2.0
        assert m["y"] == 3.0

    def test_visualization_elements(self):
        """验证可视化元素结构"""
        result = call_skill("geometry_basics", {})
        assert "elements" in result
        assert len(result["elements"]) >= 3
        assert result["elements"][0]["type"] == "point"
        assert result["elements"][0]["label"] == "A"


# ── visualize_function 测试 ─────────────────────────────────────────

class TestVisualizeFunction:
    def test_sin_function(self):
        """正弦函数绘图"""
        result = call_skill("visualize_function", {
            "expression": "sin(x)",
            "x_min": -10, "x_max": 10,
        })
        assert result["type"] == "function_plot"
        assert result["expression"] == "sin(x)"
        assert len(result["points"]) > 0

        # 找到最接近 x=0 的点，验证 sin(x) 接近 0
        origin = min(result["points"], key=lambda p: abs(p["x"]))
        assert abs(origin["y"]) < 0.06, f"sin(0) ≈ {origin['y']} 误差太大"

    def test_quadratic_function(self):
        """二次函数"""
        result = call_skill("visualize_function", {
            "expression": "x**2",
            "x_min": -5, "x_max": 5,
        })
        assert len(result["points"]) > 0
        origin = min(result["points"], key=lambda p: abs(p["x"]))
        assert abs(origin["y"]) < 0.01

    def test_invalid_expression(self):
        """无效表达式返回空数据点列表和警告"""
        result = call_skill("visualize_function", {
            "expression": "invalid@@@",
        })
        assert result["type"] == "function_plot"
        assert len(result["points"]) == 0, "无效表达式应返回空列表"
        assert "warning" in result, "应有警告信息"

    def test_empty_points_returns_list(self):
        """即使无有效点也返回列表"""
        result = call_skill("visualize_function", {
            "expression": "log(x)",
            "x_min": -10, "x_max": -1,
        })
        assert isinstance(result.get("points"), list)


# ── trigonometry 测试 ───────────────────────────────────────────────

class TestTrigonometry:
    def test_sin_90(self):
        """sin(90°) = 1"""
        result = call_skill("trigonometry", {"angle": 90})
        assert abs(result["trig_values"]["sin"] - 1.0) < 0.001

    def test_cos_0(self):
        """cos(0°) = 1"""
        result = call_skill("trigonometry", {"angle": 0})
        assert abs(result["trig_values"]["cos"] - 1.0) < 0.001

    def test_tan_45(self):
        """tan(45°) ≈ 1"""
        result = call_skill("trigonometry", {"angle": 45})
        assert abs(result["trig_values"]["tan"] - 1.0) < 0.001

    def test_pythagorean_identity(self):
        """勾股恒等式 sin²+cos²=1"""
        result = call_skill("trigonometry", {"identity": "pythagorean"})
        assert "identity_verification" in result
        assert "pythagorean" in result["identity_verification"]
        py = result["identity_verification"]["pythagorean"]
        assert py["formula"] == "sin²θ + cos²θ = 1"
        # 所有测试用例都应验证通过
        for case in py["test_cases"]:
            assert case["sin²+cos²"] == 1.0, f"{case['angle']}: {case['sin²+cos²']} ≠ 1"


# ── algebra 测试 ────────────────────────────────────────────────────

class TestAlgebra:
    def test_quadratic_two_roots(self):
        """x² - 3x + 2 = 0 → x=1, x=2"""
        result = call_skill("algebra", {
            "operation": "quadratic",
            "a": 1, "b": -3, "c": 2,
        })
        assert result["has_real_roots"] is True

        # 提取所有根值
        root_values = []
        for r in result["roots"]:
            for key in ("x1", "x2", "x"):
                if key in r:
                    root_values.append(r[key])
                    break

        root_values = sorted(root_values)
        assert len(root_values) == 2
        assert abs(root_values[0] - 1.0) < 0.001, f"根1应为1.0，得到 {root_values[0]}"
        assert abs(root_values[1] - 2.0) < 0.001, f"根2应为2.0，得到 {root_values[1]}"

    def test_quadratic_no_real_roots(self):
        """x² + x + 1 = 0 → 无实数根"""
        result = call_skill("algebra", {
            "operation": "quadratic",
            "a": 1, "b": 1, "c": 1,
        })
        assert result["has_real_roots"] is False
        assert result["discriminant"] < 0

    def test_sequence(self):
        """等差数列 1,3,5,..."""
        result = call_skill("algebra", {
            "operation": "sequence",
            "a1": 1, "d": 2, "n": 5,
        })
        assert result["terms"] == [1, 3, 5, 7, 9]
        assert result["sum_of_n"] == 25.0


# ── Skill 生成测试 ──────────────────────────────────────────────────

def test_generate_skill_file(tmp_path, monkeypatch):
    """动态生成新 Skill"""
    from backend.skills.skill_loader import generate_skill_file, call_skill

    monkeypatch.setattr("backend.skills.skill_loader.SKILLS_DIR", str(tmp_path))

    name = "test_skill"
    description = "测试用 Skill"
    code = '''
NAME = "test_skill"
DESCRIPTION = "测试用 Skill"

def run(params):
    return {"result": params.get("x", 0) * 2}
'''
    fpath = generate_skill_file(name, description, code)

    assert Path(fpath).exists()
    assert name in fpath

    result = call_skill("test_skill", {"x": 21})
    assert result["result"] == 42


# ── Skill 调用错误处理 ──────────────────────────────────────────────

def test_call_nonexistent_skill():
    """调用不存在的 Skill 返回错误"""
    result = call_skill("this_does_not_exist", {})
    assert "error" in result
