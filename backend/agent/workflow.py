"""
Math Copilot - 多角色模型工作流

工作流程：
  pipe_input()          : 非规范文字 → 规范 Markdown（Input Model）
  generate_hint()       : 第一阶段 → 分步提示（不输出答案）
  solve()              : 第二阶段 → Route → Solve → Viz Code

每个阶段可独立配置模型（通过 X-Model-Config header 传入）：
  router   → 轻量模型做 Skill 分类
  input    → 清理/规范用户输入
  solution → 强模型做解题推理
  viz_code → 代码生成模型（失败自动重试 3 次）
"""

import json
import logging
import re
from typing import Any, Optional

from backend.config import (
    ModelConfig, ModelRole, resolve_role_config, resolve_env_role_config, settings,
)
from backend.skills.skill_loader import (
    list_skills, call_skill, generate_skill_file,
    get_skill_tools_description,
)

logger = logging.getLogger("math-copilot.workflow")


# ═══════════════════════════════════════════════════════════════════
#  LLM 构建
# ═══════════════════════════════════════════════════════════════════

def _build_llm(model_cfg: ModelConfig | None = None, temperature: float = 0.3):
    """
    根据 ModelConfig 构建 LangChain LLM 实例。
    若 model_cfg 为 None 或无效，使用全局 settings。
    返回 None 时触发 fallback 逻辑。
    """
    if model_cfg is None:
        logger.info("_build_llm: model_cfg 为 None，使用全局配置")
        return _build_llm_from_globals(temperature)

    logger.info(f"_build_llm: provider={model_cfg.provider} model={model_cfg.model_name} "
                f"base_url={model_cfg.base_url} key={'***' + model_cfg.api_key[-4:] if len(model_cfg.api_key) > 4 else '(empty)'}")
    return model_cfg.build_llm(temperature=temperature)


def _build_llm_from_globals(temperature: float = 0.3):
    """兼容旧版：从全局 settings 构造 LLM"""
    provider = settings.llm_provider
    if provider == "mock":
        return None
    try:
        if provider == "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=settings.llm_model_name,
                openai_api_key=settings.openai_api_key,
                openai_api_base=settings.openai_base_url,
                temperature=temperature,
            )
        elif provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model=settings.llm_model_name,
                anthropic_api_key=settings.anthropic_api_key,
                temperature=temperature,
            )
    except Exception as e:
        logger.warning(f"全局 LLM 初始化失败: {e}")
        return None
    return None


# ═══════════════════════════════════════════════════════════════════
#  JSON 解析
# ═══════════════════════════════════════════════════════════════════

def _parse_json_response(text: str) -> dict[str, Any]:
    """从 LLM 输出中解析 JSON"""
    # 优先匹配 ```json ... ``` 代码块
    json_match = re.search(r"```json\s*\n?(.*?)\n?```", text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    # 尝试匹配最外层花括号
    brace_match = re.search(r"\{[\s\S]*\}", text)
    if brace_match:
        try:
            return json.loads(brace_match.group())
        except json.JSONDecodeError:
            pass
    return {"explanation": text, "skill": None, "params": {}}


# ═══════════════════════════════════════════════════════════════════
#  角色提示词模板
# ═══════════════════════════════════════════════════════════════════

INPUT_SYSTEM_PROMPT = """你是一个数学输入预处理助手。你的任务是将用户的原始输入**规范化为干净的 Markdown 格式**。

## 规则
1. 将文字描述的数学问题转换为规范的 Markdown/LaTeX 格式。
2. 用 `$...$` 表示行内公式，`$$...$$` 表示独立公式。
3. 修正明显的 OCR 错误、错别字、不规范符号。
4. 保持所有数学信息完整，**不要遗漏任何条件**。
5. **绝对不要回答问题或给出解题思路**，只做格式规范化。
6. 如果输入已经是规范格式，原样返回。

## 输出
请直接输出规范后的 Markdown 文本，不要加任何额外说明。"""

HINT_SYSTEM_PROMPT = """你是一个数学教学助手。你的任务是**只给出分步解题思路（Hint）**。

## 规则
1. **绝对不要**直接给出最终答案或完整代码。
2. 将提示组织为清晰的步骤，引导学生自己思考。
3. 每个步骤应包含：思路引导 + 涉及的公式/定理名称。
4. 如果可用 Skill 中有适合的工具，在 Hint 末尾注明建议使用的 Skill。
5. **数学公式必须使用 `$...$` 或 `$$...$$` 分隔**，不要使用 `\\[...\\]` 或 `[ ... ]` 格式。

## 可用 Skill
{skills}

## 输出格式
请以 JSON 格式回复：
```json
{{"hints": ["步骤1...", "步骤2..."], "suggested_skill": "skill_name 或 null"}}
```"""

ROUTER_SYSTEM_PROMPT = """你是一个数学 Skill 路由助手。你的任务是从可用 Skills 中选择最合适的工具来解决问题。

## 可用 Skill
{skills}

## 规则
1. 如果问题匹配某个 Skill，直接返回它。
2. 如果不匹配但问题可以编写新 Skill，设置 `needs_new_skill: true`。
3. 如果都不行，`skill_to_use` 设为 null。

## 输出格式
```json
{{"skill_to_use": "skill_name", "params": {{...}}, "needs_new_skill": false}}
```"""

SOLVE_SYSTEM_PROMPT = """你是一个数学解题助手。你的任务是给出完整的解题过程和答案。

## 可用 Skill
{skills}

## 规则
1. 如果已有 Skill 被路由选中，基于它的结果生成解释。
2. 如果需要新 Skill，在 "generate_skill" 字段中提供。
3. Skill 代码必须包含 NAME, DESCRIPTION, run(params) 函数。
4. **数学公式必须使用 `$...$` 或 `$$...$$` 分隔**，不要使用 `\\[...\\]` 或 `[ ... ]` 格式。

## 输出格式
```json
{{"explanation": "完整的解题过程（Markdown）", "generate_skill": null 或 {{name, description, code}}}}
```"""

VIZ_CODE_SYSTEM_PROMPT = """你是一个数学可视化代码生成助手。你的任务是根据问题和解答，生成 Python 代码来创建可视化。

## 规则
1. 使用 `numpy` 计算数据点，用 `print()` 输出结果。
2. 代码会被安全沙箱执行，只允许使用: math, numpy, json, random。
3. 可视化数据应包含 "type" 字段：
   - "geometry": 几何图形，包含 points/segments/circles
   - "function_plot": 函数曲线，包含 points/expression/x_range
4. 必须定义一个 `visualize(**kwargs)` 函数，返回可视化数据字典。

## 输出格式
直接输出 Python 代码，不要额外说明。"""

VIZ_CODE_RETRY_PROMPT = """
## 错误修复
以上代码执行时出现以下错误：
```
{error}
```
请修复代码并重新生成。确保 fix 后的代码能正确运行。"""


# ═══════════════════════════════════════════════════════════════════
#  输入预处理
# ═══════════════════════════════════════════════════════════════════

def pipe_input(
    text: str,
    models_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    使用 Input Model 将非规范文字清洗为规范 Markdown。
    """
    if not text.strip():
        return {"markdown": text, "original_text": text}

    llm = _build_llm(resolve_role_config(models_config, ModelRole.INPUT))
    if llm is None:
        # fallback：直接返回原文
        return {"markdown": text, "original_text": text}

    try:
        messages = [
            ("system", INPUT_SYSTEM_PROMPT),
            ("human", f"请规范化以下数学输入：\n\n{text}"),
        ]
        response = llm.invoke(messages)
        markdown = response.content if hasattr(response, 'content') else str(response)
        # 去掉 LLM 可能的额外包装说明
        markdown = markdown.strip().strip('"').strip("'")
        return {"markdown": markdown, "original_text": text}
    except Exception as e:
        logger.exception("Input 处理失败")
        return {"markdown": text, "original_text": text}


# ═══════════════════════════════════════════════════════════════════
#  Skill 路由
# ═══════════════════════════════════════════════════════════════════

def _route_skill(
    message: str,
    models_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    使用 Router Model 选择最适合的 Skill。
    仅在显式配置了路由模型时使用 LLM，否则走关键词匹配。
    返回: {"skill_to_use": str|None, "params": dict, "needs_new_skill": bool}
    """

    # 判断是否显式配置了路由模型
    # 条件：config_map 中有 router 配置，或 .env 中有 ROUTER_MODEL_NAME
    has_router_config = (
        (models_config and ModelRole.ROUTER.value in models_config)
        or resolve_env_role_config(ModelRole.ROUTER) is not None
    )
    if not has_router_config:
        return _fallback_route(message)

    llm = _build_llm(
        resolve_role_config(models_config, ModelRole.ROUTER),
        temperature=0.2,
    )
    if llm is None:
        return _fallback_route(message)

    skills_info = get_skill_tools_description()
    prompt = ROUTER_SYSTEM_PROMPT.format(skills=skills_info)

    try:
        messages = [
            ("system", prompt),
            ("human", f"请为以下问题选择合适的 Skill：\n\n{message}"),
        ]
        response = llm.invoke(messages)
        raw = response.content if hasattr(response, 'content') else str(response)
        result = _parse_json_response(raw)

        # 验证返回的 skill 是否确实存在
        available = [s["name"] for s in list_skills()]
        skill_name = result.get("skill_to_use")
        if skill_name and skill_name not in available:
            # 路由返回了不存在的 skill，走 fallback
            return _fallback_route(message)

        return {
            "skill_to_use": result.get("skill_to_use"),
            "params": result.get("params", {}),
            "needs_new_skill": result.get("needs_new_skill", False),
        }
    except Exception as e:
        logger.warning(f"路由失败 ({e})，使用 fallback")
        return _fallback_route(message)


def _fallback_route(message: str) -> dict[str, Any]:
    """关键词匹配回退路由"""
    msg = message.lower()
    if any(kw in msg for kw in ["距离", "distance", "两点", "中点", "midpoint"]):
        return {"skill_to_use": "geometry_basics", "params": {}, "needs_new_skill": False}
    if any(kw in msg for kw in ["函数", "function", "plot", "绘制", "画图"]):
        return {"skill_to_use": "visualize_function", "params": {}, "needs_new_skill": False}
    if any(kw in msg for kw in ["sin", "cos", "tan", "三角"]):
        return {"skill_to_use": "trigonometry", "params": {}, "needs_new_skill": False}
    if any(kw in msg for kw in ["方程", "quadratic", "数列", "sequence", "代数"]):
        return {"skill_to_use": "algebra", "params": {}, "needs_new_skill": False}
    return {"skill_to_use": None, "params": {}, "needs_new_skill": False}


# ═══════════════════════════════════════════════════════════════════
#  可视化代码生成 + 自动重试
# ═══════════════════════════════════════════════════════════════════

def _generate_viz_code_with_retry(
    user_message: str,
    solution_context: str,
    models_config: dict[str, Any] | None = None,
    max_retries: int = 3,
) -> dict[str, Any]:
    """
    生成可视化代码 → 沙箱执行 → 失败重试（最多 3 次）。

    返回:
      {"code": str, "viz_data": dict|None, "attempts": int, "error": str|None}
    """
    from backend.sandbox.executor import execute_math_code

    llm = _build_llm(resolve_role_config(models_config, ModelRole.VIZ_CODE))

    if llm is None:
        return {"code": "", "viz_data": None, "attempts": 0, "error": "LLM 不可用"}

    prompt = VIZ_CODE_SYSTEM_PROMPT
    if solution_context:
        prompt += f"\n\n## 解题上下文\n{solution_context}"

    attempt = 0
    last_error = None

    while attempt < max_retries:
        attempt += 1
        try:
            # 构造 LLM 调用消息
            messages = [("system", prompt)]
            if last_error:
                messages.append((
                    "human",
                    f"修复以下代码错误（第 {attempt} 次尝试）：\n\n"
                    f"## 原始问题\n{user_message}\n\n"
                    f"## 错误信息\n{last_error}\n\n"
                    f"## 修复后的代码"
                ))
            else:
                messages.append((
                    "human",
                    f"请为以下问题生成可视化 Python 代码：\n\n{user_message}",
                ))

            response = llm.invoke(messages)
            code = response.content if hasattr(response, 'content') else str(response)

            # 提取代码块（如果被 markdown 包裹）
            code_match = re.search(r"```python\n?(.*?)```", code, re.DOTALL)
            if code_match:
                code = code_match.group(1)
            code = code.strip()

            # 沙箱执行
            result = execute_math_code(code, {})

            if result["success"]:
                # 尝试从输出中提取可视化数据
                viz_data = result.get("result")
                if viz_data is None:
                    # 尝试从 stdout 解析 JSON
                    stdout = result.get("stdout", "")
                    json_match = re.search(r"\{.*\}", stdout, re.DOTALL)
                    if json_match:
                        try:
                            viz_data = json.loads(json_match.group())
                        except json.JSONDecodeError:
                            pass

                return {
                    "code": code,
                    "viz_data": viz_data if isinstance(viz_data, dict) else None,
                    "attempts": attempt,
                    "error": None,
                }
            else:
                last_error = result.get("error", "未知错误")
                logger.info(f"可视化代码第 {attempt} 次执行失败: {last_error[:100]}...")

        except Exception as e:
            last_error = str(e)
            logger.warning(f"可视化代码生成第 {attempt} 次异常: {last_error[:100]}...")

    # 全部重试耗尽
    return {
        "code": "",
        "viz_data": None,
        "attempts": attempt,
        "error": last_error,
        "suggest_model_upgrade": True,
    }


# ═══════════════════════════════════════════════════════════════════
#  第一阶段：生成 Hint
# ═══════════════════════════════════════════════════════════════════

def generate_hint(
    user_message: str,
    models_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    第一阶段：分析问题，生成解题提示（绝对不输出答案）。
    使用 Solution Model 或全局 LLM。
    """
    llm = _build_llm(resolve_role_config(models_config, ModelRole.SOLUTION))
    if llm is None:
        logger.info("使用 fallback hint 生成器")
        return _fallback_hint(user_message)

    skills_info = get_skill_tools_description()
    prompt = HINT_SYSTEM_PROMPT.format(skills=skills_info)

    try:
        messages = [
            ("system", prompt),
            ("human", f"用户的问题：{user_message}\n\n请给出分步解题思路（JSON 格式）。"),
        ]
        response = llm.invoke(messages)
        raw = response.content if hasattr(response, 'content') else str(response)
        result = _parse_json_response(raw)

        hints = result.get("hints", [])
        if not hints:
            hints = _fallback_hint(user_message)["hints"]

        return {
            "hints": hints,
            "suggested_skill": result.get("suggested_skill"),
        }
    except Exception as e:
        logger.exception("Hint 生成失败")
        return _fallback_hint(user_message)


# ═══════════════════════════════════════════════════════════════════
#  第二阶段：完整解答
# ═══════════════════════════════════════════════════════════════════

def solve(
    user_message: str,
    models_config: dict[str, Any] | None = None,
    enable_viz: bool = True,
    skip_cleaning: bool = False,
) -> dict[str, Any]:
    """
    第二阶段：Route → Solve → Viz Code。
    使用多角色模型流水线。

    返回:
      {"reply": str, "skill_used": str|None, "visualization_data": dict|None,
       "viz_code_attempts": int, "viz_code_error": str|None,
       "suggest_model_upgrade": bool, "new_skill_generated": bool}
    """
    available_skills = list_skills()
    skills_info = get_skill_tools_description()

    # ── 0. 输入清洗（除非前端已清洗过） ──────────────────────────
    if not skip_cleaning:
        cleaned = pipe_input(user_message, models_config)
        input_text = cleaned.get("markdown", user_message)
    else:
        input_text = user_message

    # ── 1. 路由 ───────────────────────────────────────────────
    route_result = _route_skill(input_text, models_config)
    skill_name = route_result.get("skill_to_use")
    skill_params = route_result.get("params", {})

    # ── 2. 生成解答 ───────────────────────────────────────────
    solution_llm = _build_llm(resolve_role_config(models_config, ModelRole.SOLUTION))
    explanation = ""

    if solution_llm is None:
        # 无 LLM → 使用 fallback
        return _fallback_solve(input_text)
    else:
        prompt = SOLVE_SYSTEM_PROMPT.format(skills=skills_info)
        try:
            skill_context = ""
            if skill_name:
                skill_context = f"\n\n已选择 Skill: {skill_name}"
                if skill_params:
                    skill_context += f"\n参数: {skill_params}"

            messages = [
                ("system", prompt + skill_context),
                ("human", input_text),
            ]
            response = solution_llm.invoke(messages)
            raw = response.content if hasattr(response, 'content') else str(response)
            result = _parse_json_response(raw)
            explanation = result.get("explanation", "")

            # 检查是否需要生成新 Skill
            if result.get("generate_skill") and isinstance(result["generate_skill"], dict):
                gen = result["generate_skill"]
                fpath = generate_skill_file(
                    gen.get("name", "auto_skill"),
                    gen.get("description", ""),
                    gen.get("code", ""),
                )
                skill_name = gen.get("name", "auto_skill")
                skill_params = result.get("params", {})
                if skill_name:
                    skill_result = call_skill(skill_name, skill_params)
                    explanation = result.get("explanation", "") or f"已自动生成新 Skill「{skill_name}」并执行。"

                    viz_data = None
                    if isinstance(skill_result, dict) and "type" in skill_result:
                        viz_data = skill_result

                    return {
                        "reply": explanation,
                        "skill_used": skill_name,
                        "visualization_data": viz_data,
                        "viz_code_attempts": 0,
                        "viz_code_error": None,
                        "suggest_model_upgrade": False,
                        "new_skill_generated": True,
                        "skill_file": fpath,
                    }

        except Exception as e:
            logger.error(f"Solution LLM invoke 失败: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return _fallback_solve(input_text, error=str(e))

    # ── 3. 调用已有 Skill ─────────────────────────────────────
    if skill_name and any(s["name"] == skill_name for s in available_skills):
        skill_result = call_skill(skill_name, skill_params)
        viz_data = skill_result if isinstance(skill_result, dict) and "type" in skill_result else None

        # 如果 skill 返回了可视化数据，不需要额外生成 viz code
        if viz_data:
            return {
                "reply": explanation or "解答完成。",
                "skill_used": skill_name,
                "visualization_data": viz_data,
                "viz_code_attempts": 0,
                "viz_code_error": None,
                "suggest_model_upgrade": False,
            }

    # ── 4. 需要 Viz Code 生成可视化 ─────────────────────────
    if enable_viz and (skill_name or explanation):
        viz_result = _generate_viz_code_with_retry(
            user_message=input_text,
            solution_context=explanation,
            models_config=models_config,
        )
        return {
            "reply": explanation or "解答完成。",
            "skill_used": skill_name,
            "visualization_data": viz_result.get("viz_data"),
            "viz_code_attempts": viz_result.get("attempts", 0),
            "viz_code_error": viz_result.get("error"),
            "suggest_model_upgrade": viz_result.get("suggest_model_upgrade", False),
        }

    # ── 5. 无匹配 ─────────────────────────────────────────────
    return {
        "reply": explanation or "已分析问题，但没有匹配到合适的 Skill。",
        "skill_used": None,
        "visualization_data": None,
        "viz_code_attempts": 0,
        "viz_code_error": None,
        "suggest_model_upgrade": False,
    }


# ═══════════════════════════════════════════════════════════════════
#  Fallback 函数（无 LLM 时使用）
# ═══════════════════════════════════════════════════════════════════

def _fallback_hint(user_message: str) -> dict[str, Any]:
    """关键词回退 hint"""
    msg = user_message.lower()
    if "距离" in msg or "distance" in msg or "两点" in msg:
        return {"hints": [
            "📌 确定两点的坐标 (x₁, y₁) 和 (x₂, y₂)。",
            "📐 使用两点间距离公式：d = √[(x₂ - x₁)² + (y₂ - y₁)²]。",
            "✏️ 代入坐标值计算平方和，再开平方。",
        ], "suggested_skill": "geometry_basics"}
    if "中" in msg or "midpoint" in msg:
        return {"hints": [
            "📌 确定两点的坐标 (x₁, y₁) 和 (x₂, y₂)。",
            "📐 使用中点公式：M = ((x₁ + x₂)/2, (y₁ + y₂)/2)。",
            "✏️ 分别计算 x 和 y 的平均值。",
        ], "suggested_skill": "geometry_basics"}
    if "函数" in msg or "function" in msg or "plot" in msg or "绘制" in msg or "画图" in msg:
        return {"hints": [
            "📌 确定要绘制的函数表达式 f(x)。",
            "📐 选择合适的 x 取值范围。",
            "✏️ 计算关键点（零点、极值点）。",
        ], "suggested_skill": "visualize_function"}
    if "三角" in msg or "sin" in msg or "cos" in msg or "tan" in msg:
        return {"hints": [
            "📌 确定涉及的三角函数类型。",
            "📐 回忆三角函数的基本性质。",
            "✏️ 确定振幅、周期、相位偏移。",
        ], "suggested_skill": "visualize_function"}
    return {"hints": [
        "🤔 分析题目类型，确定涉及的数学概念。",
        "📝 回忆相关公式和定理。",
        "✏️ 将已知条件代入公式推导。",
        "✅ 检查结果是否符合题意。",
    ], "suggested_skill": None}


def _fallback_solve(user_message: str, error: str = "") -> dict[str, Any]:
    """关键词回退 solve（无 LLM 时使用）"""
    msg = user_message.lower()

    # 距离问题
    if "距离" in msg or ("两点" in msg and "坐标" in msg) or ("到" in msg and "(" in msg):
        import re
        coords = re.findall(r'[\(\（]\s*([-\d.]+)\s*[,，]\s*([-\d.]+)\s*[\)\）]', msg)
        if coords and len(coords) >= 2:
            try:
                x1, y1 = float(coords[0][0]), float(coords[0][1])
                x2, y2 = float(coords[1][0]), float(coords[1][1])
                viz = call_skill("geometry_basics", {"x1": x1, "y1": y1, "x2": x2, "y2": y2})
                d = viz["metadata"]["distance"]
                m = viz["metadata"]["midpoint"]
                reply = (
                    f"## 📐 两点间距离计算\n\n"
                    f"**A({x1},{y1}) 到 B({x2},{y2})：**\n\n"
                    f"d = √[({x2}-{x1})²+({y2}-{y1})²] = **{d}**\n"
                    f"中点 M({m['x']}, {m['y']})"
                )
                return {"reply": reply, "skill_used": "geometry_basics", "visualization_data": viz,
                        "viz_code_attempts": 0, "viz_code_error": None, "suggest_model_upgrade": False}
            except Exception:
                pass

    # 函数绘图
    if "函数" in msg or "plot" in msg or "绘制" in msg or "画图" in msg:
        import numpy as np
        expr = "sin(x)"
        xs = np.linspace(-10, 10, 200)
        ys = np.sin(xs)
        points = [{"x": round(float(x), 4), "y": round(float(y), 4)}
                  for x, y in zip(xs, ys) if not (np.isnan(y) or np.isinf(y))]
        reply = f"## 📈 函数绘图\n\n**y = {expr}** 在 x∈[-10,10] 的图像\n\n已生成 {len(points)} 个数据点。"
        return {"reply": reply, "skill_used": "visualize_function",
                "visualization_data": {"type": "function_plot", "expression": expr, "points": points, "x_range": [-10, 10]},
                "viz_code_attempts": 0, "viz_code_error": None, "suggest_model_upgrade": False}

    # 通用 fallback（带上具体错误信息方便诊断）
    err_detail = f"\n\n> 详细信息: {error}" if error else ""
    logger.warning(f"Fallback solve 被触发，错误: {error or '无 LLM 可用'}")
    return {
        "reply": f"## 解答\n\n无法连接到 LLM 服务，已使用内置逻辑尝试解答。\n\n> 请设置有效的 API Key 以启用 AI 解题能力。{err_detail}",
        "skill_used": None, "visualization_data": None,
        "viz_code_attempts": 0, "viz_code_error": None, "suggest_model_upgrade": False,
    }
