"""
Math Copilot - 主入口
FastAPI 应用，注册所有 API 路由和中间件。
"""

import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.models import (
    ChatRequest, ChatResponse, InteractionRequest,
    GenerateSkillRequest,
)
from backend.agent.workflow import generate_hint, solve
from backend.skills.skill_loader import load_all_skills, list_skills, generate_skill_file, get_skill, call_skill
from backend.sandbox.executor import execute_math_code
from backend.config import settings

# ── 日志 ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("math-copilot")


# ── 生命周期 ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动时加载所有 Skills"""
    logger.info(">>> Math Copilot 启动中...")
    load_all_skills()
    skills = list_skills()
    logger.info(f"已加载 {len(skills)} 个 Skill: {[s['name'] for s in skills]}")
    yield
    logger.info("Math Copilot 已关闭")


app = FastAPI(
    title="Math Copilot API",
    version="1.1.0",
    description="数学大模型约束工程软件后端 — 分步提示、代码生成、可视化交互",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 前端静态文件托管（在 API 路由之后挂载，不会覆盖 API） ────────
_frontend_dir = Path(__file__).parent.parent / "frontend" / "out"
_FRONTEND_ENABLED = _frontend_dir.is_dir()
if _FRONTEND_ENABLED:
    logger.info(f"前端静态文件已挂载: {_frontend_dir}")
else:
    logger.info(f"前端静态文件不存在 ({_frontend_dir})，仅 API 模式运行")
    logger.info("提示: cd frontend && npm install && npm run build 可生成前端")

# ── 对话存储（内存） ─────────────────────────────────────────────────
conversations: dict[str, list[dict]] = {}


# ── API 路由 ─────────────────────────────────────────────────────────

@app.get("/api/info")
def api_info():
    return {
        "service": "Math Copilot API",
        "version": "1.1.0",
        "status": "running",
        "frontend_enabled": _FRONTEND_ENABLED,
        "skills_count": len(list_skills()),
    }


@app.get("/api/health")
def health_check():
    return {"status": "ok", "skills_loaded": len(list_skills())}


@app.get("/api/skills")
def get_skills():
    return {"skills": list_skills()}


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    conv_id = req.conversation_id or str(uuid.uuid4())
    if conv_id not in conversations:
        conversations[conv_id] = []

    input_text = req.confirmed_markdown or req.message
    conversations[conv_id].append({"role": "user", "content": input_text})

    try:
        if req.show_answer:
            result = solve(input_text, models_config=req.models_config, enable_viz=req.enable_viz)
            reply = ChatResponse(
                reply=result.get("reply", "解答完成。"),
                is_hint_only=False,
                conversation_id=conv_id,
                skill_used=result.get("skill_used"),
                visualization_data=result.get("visualization_data"),
                new_skill_generated=result.get("new_skill_generated", False),
                viz_code_attempts=result.get("viz_code_attempts", 0),
                viz_code_error=result.get("viz_code_error"),
                suggest_model_upgrade=result.get("suggest_model_upgrade", False),
            )
        else:
            hint_result = generate_hint(input_text, models_config=req.models_config)
            hints = hint_result.get("hints", [])
            hints_text = "\n\n".join(f"**步骤 {i+1}：** {h}" for i, h in enumerate(hints))
            if hint_result.get("suggested_skill"):
                hints_text += f"\n\n* 建议使用 Skill: {hint_result['suggested_skill']}"
            reply = ChatResponse(
                reply=hints_text,
                is_hint_only=True,
                conversation_id=conv_id,
                suggested_skill=hint_result.get("suggested_skill"),
            )

        conversations[conv_id].append({"role": "assistant", "content": reply.reply})
        return reply
    except Exception as e:
        logger.exception("Chat 处理出错")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/solve")
def direct_solve(req: ChatRequest):
    conv_id = req.conversation_id or str(uuid.uuid4())
    try:
        input_text = req.confirmed_markdown or req.message
        result = solve(input_text, models_config=req.models_config, enable_viz=req.enable_viz)
        return {
            "reply": result.get("reply", ""),
            "skill_used": result.get("skill_used"),
            "visualization_data": result.get("visualization_data"),
            "conversation_id": conv_id,
            "new_skill_generated": result.get("new_skill_generated", False),
            "viz_code_attempts": result.get("viz_code_attempts", 0),
            "viz_code_error": result.get("viz_code_error"),
            "suggest_model_upgrade": result.get("suggest_model_upgrade", False),
        }
    except Exception as e:
        logger.exception("Solve 处理出错")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-skill")
def create_skill(req: GenerateSkillRequest):
    try:
        fpath = generate_skill_file(req.name, req.description, req.code)
        logger.info(f"新 Skill 已生成: {req.name} -> {fpath}")
        return {"message": f"Skill '{req.name}' 创建成功", "file_path": fpath}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/interact")
def interact(req: InteractionRequest):
    viz_type = req.visualization_type
    params = req.params
    try:
        if viz_type == "geometry":
            result = call_skill("geometry_basics", params)
        elif viz_type == "function_plot":
            result = call_skill("visualize_function", params)
        else:
            result = call_skill(viz_type, params)
        return {"visualization_data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/execute")
def execute_code(req: dict):
    code = req.get("code", "")
    input_data = req.get("input_data", {})
    result = execute_math_code(code, input_data)
    return result


# ── 挂载前端（在 API 路由之后，不会覆盖 API） ──────────────────
if _FRONTEND_ENABLED:
    app.mount("/", StaticFiles(directory=str(_frontend_dir), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    import socket

    host = settings.app_host
    port = settings.app_port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        in_use = s.connect_ex((host, port)) == 0

    if in_use and port == 8000:
        for alt_port in range(8001, 8021):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex((host, alt_port)) != 0:
                    logger.warning(f"端口 {port} 已被占用，自动切换到 {alt_port}")
                    port = alt_port
                    break
        else:
            logger.error(f"端口 {port} 已被占用，且 8001-8020 均不可用")
            exit(1)
    elif in_use:
        logger.error(f"端口 {port} 已被占用")
        exit(1)

    if _FRONTEND_ENABLED:
        logger.info(f"对话界面: http://localhost:{port}")
        logger.info(f"API 文档: http://localhost:{port}/docs")
    else:
        logger.info(f"API 文档: http://localhost:{port}/docs")
        logger.info("提示: 构建前端后可获得对话界面 (cd frontend && npm install && npm run build)")

    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=settings.debug,
    )
