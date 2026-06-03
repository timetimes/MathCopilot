"""
Skills: Trigonometry
三角函数计算和可视化数据生成
"""

import math
from typing import Any

NAME = "trigonometry"
DESCRIPTION = "三角函数计算（sin/cos/tan）、角度弧度转换、三角恒等式验证"


def to_radians(degrees: float) -> float:
    """角度 → 弧度"""
    return math.radians(degrees)


def to_degrees(radians: float) -> float:
    """弧度 → 角度"""
    return math.degrees(radians)


def trig_values(angle_deg: float) -> dict[str, float | None]:
    """计算指定角度（度）的三角函数值"""
    rad = math.radians(angle_deg)
    cos_val = math.cos(rad)
    return {
        "angle_deg": angle_deg,
        "angle_rad": round(rad, 6),
        "sin": round(math.sin(rad), 6),
        "cos": round(cos_val, 6),
        "tan": round(math.tan(rad), 6) if abs(cos_val) > 1e-10 else None,
    }


def verify_identity(identity_type: str) -> dict[str, Any]:
    """
    验证三角恒等式，返回结果包含 identity_type 作为顶层键。
    identity_type: "pythagorean" | "sum_angle" | "double_angle"
    """
    sin30 = math.sin(math.radians(30))
    cos30 = math.cos(math.radians(30))
    sin45 = math.sin(math.radians(45))
    cos45 = math.cos(math.radians(45))
    sin60 = math.sin(math.radians(60))
    cos60 = math.cos(math.radians(60))

    identities = {
        "pythagorean": {
            "formula": "sin²θ + cos²θ = 1",
            "verified": True,
            "test_cases": [
                {"angle": "30°", "sin²+cos²": round(sin30**2 + cos30**2, 10), "expected": 1.0},
                {"angle": "45°", "sin²+cos²": round(sin45**2 + cos45**2, 10), "expected": 1.0},
                {"angle": "60°", "sin²+cos²": round(sin60**2 + cos60**2, 10), "expected": 1.0},
            ],
        },
        "sum_angle": {
            "formula": "sin(α+β) = sinα·cosβ + cosα·sinβ",
            "verified": True,
            "test_case": {
                "α": "30°",
                "β": "45°",
                "sin(α+β)": round(math.sin(math.radians(75)), 6),
                "sinα·cosβ+cosα·sinβ": round(
                    sin30 * cos45 + cos30 * sin45, 6
                ),
                "match": round(sin30 * cos45 + cos30 * sin45, 6) == round(math.sin(math.radians(75)), 6),
            },
        },
        "double_angle": {
            "formula": "sin(2θ) = 2·sinθ·cosθ",
            "verified": True,
            "test_case": {
                "θ": "30°",
                "sin(60°)": round(math.sin(math.radians(60)), 6),
                "2·sin30°·cos30°": round(2 * sin30 * cos30, 6),
                "match": round(2 * sin30 * cos30, 6) == round(math.sin(math.radians(60)), 6),
            },
        },
    }

    if identity_type not in identities:
        return {identity_type: {"error": f"未知恒等式: {identity_type}"}}

    return {identity_type: identities[identity_type]}


def run(params: dict[str, Any]) -> dict[str, Any]:
    angle = params.get("angle", 45.0)
    identity = params.get("identity")
    func_type = params.get("function", "sin")

    result: dict[str, Any] = {
        "type": "function_plot",
        "trig_values": trig_values(angle),
    }

    if identity:
        result["identity_verification"] = verify_identity(identity)

    # 生成函数曲线数据点
    import numpy as np
    xs = np.linspace(-360, 360, 300)
    rads = np.radians(xs)

    if func_type == "sin":
        ys = np.sin(rads)
    elif func_type == "cos":
        ys = np.cos(rads)
    elif func_type == "tan":
        ys = np.tan(rads)
        # 过滤不连续点 (渐近线)
        mask = np.abs(ys) < 50
        xs, ys = xs[mask], ys[mask]
    else:
        ys = np.sin(rads)

    result["points"] = [
        {"x": round(float(x), 4), "y": round(float(y), 4)}
        for x, y in zip(xs, ys) if not (np.isnan(y) or np.isinf(y))
    ]
    result["expression"] = f"{func_type}(x°) (x in degrees)"
    result["x_range"] = [-360, 360]

    return result
