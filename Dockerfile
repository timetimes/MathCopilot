# =============================================================
# Math Copilot - Dockerfile (Backend)
# =============================================================
# 多阶段构建：
#   1. builder  — 安装 Python 依赖
#   2. runtime  — 运行 FastAPI 服务
# =============================================================

# ── Stage 1: Builder ──────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# 安装编译依赖（部分包需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制并安装依赖
COPY backend/requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt


# ── Stage 2: Runtime ─────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# 从 builder 复制已安装的包
COPY --from=builder /root/.local /root/.local

# 确保 PATH 包含用户安装的包
ENV PATH=/root/.local/bin:$PATH

# 复制后端代码
COPY backend/ /app/backend/
COPY manage.py /app/

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# 启动命令
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
