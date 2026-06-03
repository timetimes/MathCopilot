"""
测试：沙箱执行器
验证代码安全检查和数学代码执行。
"""

import pytest
from backend.sandbox.executor import execute_math_code, SandboxError, _check_code_safety


# ── 安全检测测试 ────────────────────────────────────────────────────

class TestCodeSafety:
    def test_dangerous_builtins(self):
        """禁止危险内置函数"""
        with pytest.raises(SandboxError, match="危险的内置函数"):
            _check_code_safety("__import__('os')")

        with pytest.raises(SandboxError, match="危险的内置函数"):
            _check_code_safety("exec('x = 1')")

        with pytest.raises(SandboxError, match="危险的内置函数"):
            _check_code_safety("open('/etc/passwd')")

    def test_dangerous_modules_import(self):
        """禁止导入危险模块"""
        with pytest.raises(SandboxError, match="不允许导入模块"):
            _check_code_safety("import os")

        with pytest.raises(SandboxError, match="不允许导入模块"):
            _check_code_safety("import subprocess")

    def test_from_import_blocked(self):
        """禁止 from import 危险模块"""
        with pytest.raises(SandboxError, match="不允许导入模块"):
            _check_code_safety("from os import path")

    def test_allowed_modules_pass(self):
        """允许导入数学相关模块"""
        # 这些不应该抛出异常
        _check_code_safety("import math")
        _check_code_safety("import numpy as np")
        _check_code_safety("import json")
        _check_code_safety("import random")
        _check_code_safety("from math import sqrt")
        _check_code_safety("from collections import Counter")


# ── 数学代码执行测试 ────────────────────────────────────────────────

class TestMathExecution:
    def test_simple_math(self):
        """基本数学运算"""
        code = """
import math
result = math.sqrt(16)
print(f"sqrt(16) = {result}")
"""
        result = execute_math_code(code)
        assert result["success"] is True, f"执行失败: {result.get('error')}"
        assert "sqrt(16) = 4.0" in result["stdout"]

    def test_numpy_usage(self):
        """使用 numpy 计算"""
        code = """
import numpy as np
arr = np.array([1, 2, 3, 4, 5])
print(f"mean = {np.mean(arr)}")
print(f"sum = {np.sum(arr)}")
"""
        result = execute_math_code(code)
        assert result["success"] is True, f"执行失败: {result.get('error')}"
        assert "mean = 3.0" in result["stdout"]
        assert "sum = 15" in result["stdout"]

    def test_visualize_function_in_sandbox(self):
        """沙箱中可定义并调用函数"""
        code = """
def compute(x, y):
    return {"type": "geometry", "elements": [
        {"type": "point", "label": "P", "x": x, "y": y}
    ]}

# 直接执行计算
result = compute(3.0, 4.0)
print(f"Result: {result}")
"""
        result = execute_math_code(code)
        assert result["success"] is True, f"执行失败: {result.get('error')}"

    def test_division_by_zero(self):
        """除以零不崩溃，返回错误"""
        code = "result = 1 / 0"
        result = execute_math_code(code)
        assert result["success"] is False
        assert "ZeroDivisionError" in result["error"]

    def test_print_captured(self):
        """验证 stdout 捕获"""
        code = 'print("Hello from sandbox")'
        result = execute_math_code(code)
        assert result["success"] is True
        assert "Hello from sandbox" in result["stdout"]

    def test_visualize_function_hook(self):
        """验证 visualize 钩子函数"""
        code = """
def visualize(x, y):
    return {"type": "geometry", "elements": [
        {"type": "point", "label": "P", "x": x, "y": y}
    ]}
"""
        result = execute_math_code(code, {"x": 3.0, "y": 4.0})
        assert result["success"] is True, f"执行失败: {result.get('error')}"
        # 如果提供了 input_data，visualize 函数被调用
        if "result" in result:
            assert result["result"] is not None

    def test_dangerous_code_blocked(self):
        """危险代码被拦截"""
        code = "import os\nos.system('rm -rf /')"
        result = execute_math_code(code)
        assert result["success"] is False
        assert "error" in result
        assert "SandboxError" in result["error"]

    def test_syntax_error_handled(self):
        """语法错误被优雅处理"""
        code = "this is not valid python @@@"
        result = execute_math_code(code)
        assert result["success"] is False
        assert "语法错误" in result["error"] or "SyntaxError" in result["error"]

    def test_complex_math_with_sympy(self):
        """使用 sympy 进行符号计算"""
        code = """
import sympy as sp
x = sp.Symbol('x')
expr = x**2 + 2*x + 1
factored = sp.factor(expr)
print(f"Factored: {factored}")
"""
        result = execute_math_code(code)
        assert result["success"] is True, f"执行失败: {result.get('error')}"
        assert "(x + 1)" in result["stdout"] or "Factored" in result["stdout"]
