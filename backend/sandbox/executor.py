"""
Math Copilot - 沙箱执行器
提供安全的 Python 代码执行环境，用于执行 LLM 生成的数学代码。
使用 ast 静态分析进行安全检查，在受限全局空间中执行代码。
"""

import ast
import sys
import traceback
from io import StringIO
from typing import Any

ALLOWED_MODULES = {"math", "numpy", "sympy", "json", "random", "itertools", "collections", "typing"}


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    """Allow imports only from the approved module list."""
    root = name.split(".")[0]
    if root not in ALLOWED_MODULES:
        raise SandboxError(f"涓嶅厑璁稿鍏ユā鍧? {name}")
    return __import__(name, globals, locals, fromlist, level)


class SandboxError(Exception):
    """沙箱安全检查失败"""
    pass


def _check_code_safety(code: str):
    """
    静态分析代码 AST，禁止：
    - 导入危险模块 (os, subprocess, sys, shutil, socket 等)
    - 使用危险内置函数 (exec, eval, __import__, open)
    - 文件操作
    """
    tree = ast.parse(code)

    for node in ast.walk(tree):
        # ── 检查方法调用 (obj.method()) ──────────────────────
        if isinstance(node, ast.Call):
            func = node.func
            # 直接调用危险内置函数
            if isinstance(func, ast.Name) and func.id in {"exec", "eval", "__import__", "open"}:
                raise SandboxError(f"危险的内置函数 '{func.id}' 不允许使用")
            if isinstance(func, ast.Name) and func.id in {"getattr", "setattr", "delattr"}:
                if len(node.args) >= 2:
                    second_arg = node.args[1]
                    if isinstance(second_arg, ast.Constant) and isinstance(second_arg.value, str):
                        if second_arg.value.startswith("__"):
                            raise SandboxError("不允许访问双下划线属性")
            # obj.__import__() / obj.exec() 等
            if isinstance(func, ast.Attribute):
                if isinstance(func.value, ast.Name):
                    if func.value.id in {"os", "subprocess", "sys", "shutil", "socket", "pathlib"}:
                        raise SandboxError(f"{func.value.id} 模块不允许在沙箱中使用")
                if func.attr.startswith("__"):
                    raise SandboxError("不允许访问双下划线属性")

        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise SandboxError("不允许访问双下划线属性")

        if isinstance(node, ast.Name) and node.id.startswith("__"):
            raise SandboxError("不允许访问双下划线名称")

        # ── 检查 import ──────────────────────────────────────
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_MODULES:
                    raise SandboxError(f"不允许导入模块: {alias.name}")

        # ── 检查 from ... import ─────────────────────────────
        if isinstance(node, ast.ImportFrom):
            if node.module:
                root = node.module.split(".")[0]
                if root not in ALLOWED_MODULES:
                    raise SandboxError(f"不允许导入模块: {node.module}")

    return True


def execute_math_code(code: str, input_data: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    安全执行数学代码。

    参数:
        code: 要执行的 Python 代码字符串
        input_data: 传递给 visualize 函数的关键字参数

    返回:
        {"success": bool, "stdout": str, "result": Any | None, "error": str | None}
    """
    result: dict[str, Any] = {
        "success": True,
        "stdout": "",
        "result": None,
        "error": None,
    }

    # ── 1. 安全检查 ──────────────────────────────────────────
    try:
        _check_code_safety(code)
    except SandboxError as e:
        result["success"] = False
        result["error"] = f"SandboxError: {e}"
        return result
    except SyntaxError as e:
        result["success"] = False
        result["error"] = f"语法错误: {e}"
        return result

    # ── 2. 构建安全的全局命名空间 ────────────────────────────
    safe_globals: dict[str, Any] = {
        "__builtins__": {
            # ── 必需：让 import 机制工作 ───────────────────────
            "__import__": _safe_import,
            # ── 数学与基础操作 ────────────────────────────────
            "abs": abs, "all": all, "any": any, "bool": bool,
            "dict": dict, "enumerate": enumerate, "float": float,
            "int": int, "isinstance": isinstance, "len": len,
            "list": list, "max": max, "min": min, "print": print,
            "range": range, "round": round, "str": str, "sum": sum,
            "tuple": tuple, "type": type, "zip": zip, "map": map,
            "filter": filter, "sorted": sorted, "reversed": reversed,
            "set": set, "complex": complex, "pow": pow,
            "hasattr": hasattr, "getattr": getattr, "setattr": setattr,
            "iter": iter, "next": next, "slice": slice,
            "divmod": divmod, "hex": hex, "oct": oct, "bin": bin,
            "ord": ord, "chr": chr, "repr": repr,
            "True": True, "False": False, "None": None,
            "Exception": Exception, "ValueError": ValueError,
            "TypeError": TypeError, "KeyError": KeyError,
            "IndexError": IndexError, "AttributeError": AttributeError,
            "ZeroDivisionError": ZeroDivisionError,
            "isinstance": isinstance, "issubclass": issubclass,
            "hasattr": hasattr, "getattr": getattr,
        },
        "__name__": "__sandbox__",
    }

    # ── 3. 重定向 stdout ─────────────────────────────────────
    output_capture = StringIO()
    old_stdout = sys.stdout
    sys.stdout = output_capture

    try:
        compiled = compile(code, "<sandbox>", "exec")
        exec(compiled, safe_globals)
        stdout = output_capture.getvalue()
        result["stdout"] = stdout

        # ── 4. 如果有 visualize 函数，调用它 ─────────────────
        if "visualize" in safe_globals and callable(safe_globals.get("visualize")):
            viz_result = safe_globals["visualize"](**(input_data or {}))
            result["result"] = viz_result

    except SyntaxError as e:
        result["success"] = False
        result["error"] = f"语法错误: {e}"
    except Exception as e:
        result["success"] = False
        result["error"] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
    finally:
        sys.stdout = old_stdout

    return result
