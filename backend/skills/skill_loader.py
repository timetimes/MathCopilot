import importlib
import inspect
import os
import sys
from typing import Any

from backend.config import SKILLS_DIR

_registry: dict[str, dict[str, Any]] = {}


def _import_module(filepath: str):
    rel_path = os.path.relpath(filepath, os.path.dirname(SKILLS_DIR))
    mod_name = rel_path.replace(os.sep, ".").replace(".py", "")
    if mod_name.startswith("."):
        mod_name = mod_name[1:]
    spec = importlib.util.spec_from_file_location(mod_name, filepath)
    if spec and spec.loader:
        mod = importlib.util.module_from_spec(spec)
        sys.modules[mod_name] = mod
        spec.loader.exec_module(mod)
        return mod
    return None


def load_all_skills():
    _registry.clear()
    if SKILLS_DIR not in sys.path:
        sys.path.insert(0, os.path.dirname(SKILLS_DIR))
    for fname in os.listdir(SKILLS_DIR):
        if fname == "__init__.py" or fname == "skill_loader.py":
            continue
        if fname.endswith(".py"):
            fpath = os.path.join(SKILLS_DIR, fname)
            mod = _import_module(fpath)
            if mod and hasattr(mod, "NAME") and hasattr(mod, "run"):
                _registry[mod.NAME] = {
                    "name": mod.NAME,
                    "description": getattr(mod, "DESCRIPTION", ""),
                    "module": mod,
                    "run": mod.run,
                }


def get_skill(name: str) -> dict[str, Any] | None:
    return _registry.get(name)


def list_skills() -> list[dict[str, str]]:
    return [{"name": s["name"], "description": s["description"]} for s in _registry.values()]


def get_skill_tools_description() -> str:
    if not _registry:
        return "当前没有已加载的 Skill。"
    lines = ["可用 Skill 列表："]
    for s in _registry.values():
        lines.append(f"- {s['name']}: {s['description']}")
    return "\n".join(lines)


def call_skill(name: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    skill = get_skill(name)
    if not skill:
        return {"error": f"Skill '{name}' 未找到"}
    return skill["run"](params or {})


def generate_skill_file(name: str, description: str, code: str) -> str:
    fpath = os.path.join(SKILLS_DIR, f"{name}.py")
    header = f"NAME = \"{name}\"\nDESCRIPTION = \"{description}\"\n\n"
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(header + code)
    load_all_skills()
    return fpath
