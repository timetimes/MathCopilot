import numpy as np
from typing import Any


NAME = "visualize_function"
DESCRIPTION = "绘制数学函数曲线，生成离散点坐标数据用于可视化"


def function_to_points(func_expr: str, x_min: float = -10, x_max: float = 10, num_points: int = 200) -> list[dict[str, float]]:
    x_vals = np.linspace(x_min, x_max, num_points)
    safe_globals = {"__builtins__": {}, "np": np, "sin": np.sin, "cos": np.cos, "tan": np.tan,
                    "exp": np.exp, "log": np.log, "sqrt": np.sqrt, "pi": np.pi, "abs": abs}
    try:
        y_vals = eval(func_expr, safe_globals, {"x": x_vals})
        if isinstance(y_vals, (int, float)):
            y_vals = np.full_like(x_vals, y_vals)
    except Exception as e:
        # eval 失败时返回空列表，调用方处理错误信息
        return []

    points = [{"x": round(float(x), 4), "y": round(float(y), 4)}
              for x, y in zip(x_vals, y_vals) if not (np.isnan(y) or np.isinf(y))]
    return points


def run(params: dict[str, Any]) -> dict[str, Any]:
    expr = params.get("expression", "sin(x)")
    x_min = params.get("x_min", -10)
    x_max = params.get("x_max", 10)
    points = function_to_points(expr, x_min, x_max)
    result: dict[str, Any] = {
        "type": "function_plot",
        "expression": expr,
        "points": points,
        "x_range": [x_min, x_max],
    }
    if len(points) == 0:
        result["warning"] = f"表达式 '{expr}' 在范围 [{x_min}, {x_max}] 内没有生成有效数据点"
    return result
