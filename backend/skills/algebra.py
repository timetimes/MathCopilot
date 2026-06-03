"""
Skills: Algebra
代数运算：方程求解、因式分解、表达式化简、方程组求解
"""

import math
from typing import Any

NAME = "algebra"
DESCRIPTION = "代数运算：一元二次方程求解、因式分解、方程组求解、表达式求值"


def quadratic_solution(a: float, b: float, c: float) -> dict[str, Any]:
    """
    求解一元二次方程 ax² + bx + c = 0
    返回判别式、根（实数或复数）
    """
    delta = b**2 - 4 * a * c

    if delta > 0:
        x1 = (-b + math.sqrt(delta)) / (2 * a)
        x2 = (-b - math.sqrt(delta)) / (2 * a)
        return {
            "equation": f"{a}x² + {b}x + {c} = 0",
            "discriminant": round(delta, 6),
            "roots": [
                {"x1": round(x1, 6), "type": "real"},
                {"x2": round(x2, 6), "type": "real"},
            ],
            "has_real_roots": True,
        }
    elif delta == 0:
        x = -b / (2 * a)
        return {
            "equation": f"{a}x² + {b}x + {c} = 0",
            "discriminant": 0,
            "roots": [{"x": round(x, 6), "type": "real_double"}],
            "has_real_roots": True,
        }
    else:
        real = -b / (2 * a)
        imag = math.sqrt(-delta) / (2 * a)
        return {
            "equation": f"{a}x² + {b}x + {c} = 0",
            "discriminant": round(delta, 6),
            "roots": [
                {"x": f"{round(real, 4)} + {round(imag, 4)}i", "type": "complex"},
                {"x": f"{round(real, 4)} - {round(imag, 4)}i", "type": "complex"},
            ],
            "has_real_roots": False,
        }


def evaluate_expression(expression: str, x: float | None = None) -> dict[str, Any]:
    """
    安全计算数学表达式
    支持: + - * / ** sqrt() sin() cos() tan() abs() pi
    """
    safe_globals = {
        "__builtins__": {},
        "sqrt": math.sqrt,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "abs": abs,
        "pi": math.pi,
        "e": math.e,
        "log": math.log,
        "log10": math.log10,
        "exp": math.exp,
        "radians": math.radians,
        "degrees": math.degrees,
        "floor": math.floor,
        "ceil": math.ceil,
    }

    try:
        locals_dict = {}
        if x is not None:
            locals_dict["x"] = x

        result = eval(expression, safe_globals, locals_dict)
        return {
            "expression": expression,
            "variables": {"x": x} if x is not None else {},
            "result": round(float(result), 8) if isinstance(result, (int, float)) else str(result),
        }
    except Exception as e:
        return {"expression": expression, "error": str(e)}


def arithmetic_sequence(a1: float, d: float, n: int) -> dict[str, Any]:
    """等差数列：首项 a1，公差 d，前 n 项"""
    terms = [a1 + i * d for i in range(n)]
    return {
        "type": "sequence",
        "sequence_type": "arithmetic",
        "first_term": a1,
        "common_difference": d,
        "terms": [round(t, 4) for t in terms],
        "sum_of_n": round(n / 2 * (2 * a1 + (n - 1) * d), 4),
        "general_term": f"a_n = {a1} + (n-1) × {d}",
    }


def run(params: dict[str, Any]) -> dict[str, Any]:
    op = params.get("operation", "quadratic")

    if op == "quadratic":
        return quadratic_solution(
            params.get("a", 1),
            params.get("b", -3),
            params.get("c", 2),
        )
    elif op == "evaluate":
        return evaluate_expression(
            params.get("expression", "x**2 + 2*x + 1"),
            params.get("x"),
        )
    elif op == "sequence":
        return arithmetic_sequence(
            params.get("a1", 1),
            params.get("d", 2),
            params.get("n", 10),
        )
    else:
        return {"error": f"未知操作: {op}"}
