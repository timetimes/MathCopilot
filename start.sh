#!/usr/bin/env bash
# =============================================================
# Math Copilot 快速启动脚本 (Linux/Mac/Windows Git Bash)
# =============================================================
# 用法:
#   ./start.sh                  # 默认 8000 端口
#   ./start.sh -p 9000          # 指定端口
#   ./start.sh --auto-port      # 端口被占用时自动切换
# =============================================================

set -e

PORT=8000
AUTO_PORT=false
RELOAD="--reload"

# 解析参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port) PORT="$2"; shift 2 ;;
        --auto-port) AUTO_PORT=true; shift ;;
        --no-reload) RELOAD=""; shift ;;
        -h|--help)
            echo "用法: $0 [-p PORT] [--auto-port] [--no-reload]"
            echo "  -p, --port PORT     指定端口 (默认: 8000)"
            echo "  --auto-port         端口被占用时自动切换"
            echo "  --no-reload         禁用热重载"
            exit 0 ;;
        *) echo "未知选项: $1"; exit 1 ;;
    esac
done

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# 检查 Python
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}❌ 未找到 python3${NC}"
    exit 1
fi

PY_VERSION=$(python3 --version 2>&1)
echo -e "${GREEN}✅ $PY_VERSION${NC}"

# 检查依赖
python3 -c "import fastapi" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  依赖未安装，正在安装...${NC}"
    pip install -r "$BACKEND_DIR/requirements.txt"
}

# 检查端口
check_port() {
    if command -v ss &>/dev/null; then
        ss -tln | grep -q ":$1 "
    elif command -v netstat &>/dev/null; then
        netstat -tln 2>/dev/null | grep -q ":$1 "
    else
        python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1',$1)); s.close()" 2>/dev/null
    fi
}

if check_port $PORT; then
    if $AUTO_PORT; then
        echo -e "${YELLOW}⚠️  端口 $PORT 被占用，将自动切换${NC}"
        python3 "$ROOT_DIR/manage.py" start --port $PORT --auto-port $RELOAD
    else
        echo -e "${RED}❌ 端口 $PORT 已被占用！${NC}"
        echo ""
        echo -e "${CYAN}  可用方案:${NC}"
        echo -e "    ./start.sh --auto-port         # 自动切换空闲端口"
        echo -e "    ./start.sh -p 9000              # 指定其他端口"
        echo -e "    python3 manage.py start --auto-port"
        exit 1
    fi
else
    echo -e "${CYAN}🚀 Math Copilot 启动中...${NC}"
    echo ""
    echo -e "${GREEN}   API:      http://localhost:$PORT${NC}"
    echo -e "${GREEN}   文档:     http://localhost:$PORT/docs${NC}"
    echo ""
    python3 "$ROOT_DIR/manage.py" start --port $PORT $RELOAD
fi
