#!/usr/bin/env python3
"""
Math Copilot 管理脚本
统一管理：启动、测试、端口、Docker 等操作。

用法:
    python manage.py start              # 启动后端 (默认 8000)
    python manage.py start --port 9000  # 指定端口
    python manage.py test               # 运行测试
    python manage.py shell              # 打开 Python shell
    python manage.py list-skills        # 列出所有 Skill
    python manage.py check              # 环境检查
"""

import argparse
import os
import subprocess
import sys
import socket
from pathlib import Path


# ── 常量 ─────────────────────────────────────────────────────────
ROOT = Path(__file__).parent
BACKEND_DIR = ROOT / "backend"

# ASCII-only 标记（兼容 Windows GBK 终端）
OK     = "[OK]"
FAIL   = "[FAIL]"
WARN   = "[WARN]"
ROCKET = ">>>"
FLASK  = "[TEST]"


def port_in_use(port: int) -> bool:
    """检查端口是否被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def find_free_port(start: int = 8000, max_attempts: int = 20) -> int:
    """从 start 开始找第一个空闲端口"""
    for port in range(start, start + max_attempts):
        if not port_in_use(port):
            return port
    raise RuntimeError(f"无法找到空闲端口 ({start}-{start + max_attempts} 均被占用)")


def cmd_start(args):
    """启动后端服务"""
    port = args.port

    if port_in_use(port):
        if args.auto_port:
            new_port = find_free_port(port + 1)
            print(f"{WARN} 端口 {port} 已被占用，自动切换到端口 {new_port}")
            port = new_port
        else:
            print(f"{FAIL} 端口 {port} 已被占用。使用 --auto-port 自动切换，或 --port 指定其他端口。")
            sys.exit(1)

    # ── 检查/构建前端 ──────────────────────────────────────────
    frontend_out = ROOT / "frontend" / "out"
    if not frontend_out.is_dir():
        print(f"{WARN} 前端静态文件不存在，尝试自动构建...")
        # 检查 node/npm
        node_ok = subprocess.run(["node", "--version"], capture_output=True, text=True).returncode == 0
        npm_ok = subprocess.run(["npm", "--version"], capture_output=True, text=True).returncode == 0
        if node_ok and npm_ok:
            print("   正在安装前端依赖并构建...")
            subprocess.run(["npm", "install"], cwd=ROOT / "frontend", capture_output=True)
            build_result = subprocess.run(["npm", "run", "build"], cwd=ROOT / "frontend", capture_output=True, text=True)
            if build_result.returncode == 0:
                print(f"{OK} 前端构建成功")
            else:
                print(f"{WARN} 前端构建失败（仅 API 模式），错误:")
                for line in build_result.stderr.splitlines()[-5:]:
                    print(f"     {line}")
        else:
            print(f"{WARN} 未安装 Node.js/npm，仅 API 模式运行")
            print("   提示: 安装 Node.js 后执行: cd frontend && npm install && npm run build")
    else:
        print(f"{OK} 前端静态文件就绪")

    print(f"{ROCKET} Math Copilot 启动中...")
    print(f"   对话界面: http://localhost:{port}")
    print(f"   API 文档: http://localhost:{port}/docs")
    print(f"   健康检查: http://localhost:{port}/api/health")
    print()

    env = os.environ.copy()
    env.setdefault("APP_PORT", str(port))
    env.setdefault("DEBUG", "true")

    uvicorn_args = [
        sys.executable, "-m", "uvicorn",
        "backend.main:app",
        "--host", args.host,
        "--port", str(port),
    ]
    if args.reload:
        uvicorn_args.append("--reload")

    os.chdir(ROOT)
    subprocess.run(uvicorn_args, env=env)


def cmd_test(args):
    """运行测试"""
    print(f"{FLASK} 运行 Math Copilot 测试...")
    os.chdir(ROOT)
    pytest_args = [sys.executable, "-m", "pytest", "backend/tests/", "-v"]
    if args.coverage:
        pytest_args = [
            sys.executable, "-m", "pytest",
            "--cov=backend", "--cov-report=term-missing",
            "backend/tests/", "-v",
        ]
    subprocess.run(pytest_args)


def cmd_shell(args):
    """打开交互式 Python shell（含 app 上下文）"""
    os.chdir(BACKEND_DIR)
    sys.path.insert(0, str(BACKEND_DIR.parent))
    context = {
        "app": __import__("backend.main", fromlist=["app"]).app,
        "settings": __import__("backend.config", fromlist=["settings"]).settings,
        "skills": __import__("backend.skills.skill_loader", fromlist=["list_skills"]).list_skills,
        "call_skill": __import__("backend.skills.skill_loader", fromlist=["call_skill"]).call_skill,
    }
    try:
        from IPython import start_ipython
        start_ipython(argv=[], user_ns=context)
    except ImportError:
        import code
        code.interact(local=context)


def cmd_list_skills(args):
    """列出所有已加载的 Skill"""
    os.chdir(BACKEND_DIR)
    sys.path.insert(0, str(BACKEND_DIR.parent))
    from backend.skills.skill_loader import load_all_skills, list_skills
    load_all_skills()
    skills = list_skills()
    if not skills:
        print("没有加载任何 Skill")
        return
    print(f"已加载 {len(skills)} 个 Skill:")
    for s in skills:
        print(f"   {OK} {s['name']}: {s['description']}")


def cmd_check(args):
    """环境检查"""
    print("Math Copilot 环境检查\n")
    checks = []

    # Python
    v = sys.version_info
    ok = v.major >= 3 and v.minor >= 10
    checks.append(("Python >= 3.10", f"{v.major}.{v.minor}.{v.micro}", ok))

    # 依赖
    deps = [
        ("FastAPI", "fastapi"),
        ("LangChain", "langchain"),
        ("NumPy", "numpy"),
        ("SymPy", "sympy"),
        ("Pydantic", "pydantic"),
    ]
    for label, mod_name in deps:
        try:
            mod = __import__(mod_name)
            version = getattr(mod, "__version__", "?")
            checks.append((label, version, True))
        except ImportError:
            checks.append((label, "未安装", False))

    # LLM 配置
    from backend.config import settings
    has_openai = bool(settings.openai_api_key and settings.openai_api_key != "sk-your-key-here")
    has_anthropic = bool(settings.anthropic_api_key)
    llm_ok = settings.llm_provider == "mock" or has_openai or has_anthropic
    checks.append(("OpenAI API Key", "已配置" if has_openai else "未配置", llm_ok))
    checks.append(("Anthropic API Key", "已配置" if has_anthropic else "未配置", llm_ok))

    # 端口
    port = settings.app_port
    in_use = port_in_use(port)
    checks.append((f"端口 {port}", "被占用" if in_use else "空闲", not in_use))

    # Skills
    from backend.skills.skill_loader import load_all_skills, list_skills
    load_all_skills()
    skills = list_skills()
    checks.append(("Skills", f"{len(skills)} 个已加载", len(skills) > 0))

    # 输出结果
    for name, value, ok in checks:
        icon = OK if ok else FAIL
        print(f"  {icon}  {name}: {value}")

    print()
    if all(ok for _, _, ok in checks):
        print(f"{OK} 环境检查通过！运行 python manage.py start 启动。")
    else:
        print(f"{WARN} 部分检查未通过，请查看上方提示。")
        print("   提示: pip install -r backend/requirements.txt")


def main():
    parser = argparse.ArgumentParser(
        description="Math Copilot 管理工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python manage.py start                  # 启动后端
  python manage.py start --port 9000      # 指定端口
  python manage.py start --auto-port      # 端口被占自动切换
  python manage.py test                   # 运行测试
  python manage.py test --coverage        # 带覆盖率
  python manage.py check                  # 环境检查
  python manage.py list-skills            # 列出 Skill
  python manage.py shell                  # Python shell
        """,
    )
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # start
    start_parser = subparsers.add_parser("start", help="启动后端服务")
    start_parser.add_argument("--port", type=int, default=8000, help="端口号 (默认: 8000)")
    start_parser.add_argument("--host", type=str, default="0.0.0.0", help="监听地址 (默认: 0.0.0.0)")
    start_parser.add_argument("--auto-port", action="store_true", help="端口被占用时自动切换")
    start_parser.add_argument("--reload", action="store_true", default=True, help="启用热重载 (默认)")
    start_parser.add_argument("--no-reload", action="store_true", help="禁用热重载")

    # test
    test_parser = subparsers.add_parser("test", help="运行测试")
    test_parser.add_argument("--coverage", action="store_true", help="生成覆盖率报告")

    # shell
    subparsers.add_parser("shell", help="打开 Python shell")

    # list-skills
    subparsers.add_parser("list-skills", help="列出所有 Skill")

    # check
    subparsers.add_parser("check", help="环境检查")

    args = parser.parse_args()

    # 设置 reload 标志: --no-reload 优先于 --reload
    if hasattr(args, "no_reload") and args.no_reload:
        args.reload = False

    cmd_map = {
        "start": cmd_start,
        "test": cmd_test,
        "shell": cmd_shell,
        "list-skills": cmd_list_skills,
        "check": cmd_check,
    }

    cmd = cmd_map.get(args.command)
    if cmd:
        cmd(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
