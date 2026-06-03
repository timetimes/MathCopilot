"""
Security regression tests for sandbox, skill generation, and config defaults.
"""

from pathlib import Path

import pytest

from backend.config import ModelRole, settings
from backend.config import resolve_role_config
from backend.sandbox.executor import SandboxError, _check_code_safety
from backend.skills.skill_loader import call_skill, generate_skill_file


def test_sandbox_blocks_dunder_attribute_escape():
    with pytest.raises(SandboxError):
        _check_code_safety("print((1).__class__.__mro__[1].__subclasses__())")


def test_sandbox_blocks_globals_escape():
    with pytest.raises(SandboxError):
        _check_code_safety(
            "def f():\n    return 1\nprint(f.__globals__)"
        )


def test_generate_skill_file_escapes_description_and_stays_in_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.skills.skill_loader.SKILLS_DIR", str(tmp_path))

    fpath = generate_skill_file(
        "quoted_skill",
        'description with "quotes" and newline\nsecond line',
        '''
NAME = "quoted_skill"
DESCRIPTION = "description with quotes"

def run(params):
    return {"ok": True}
''',
    )

    resolved = Path(fpath).resolve()
    assert resolved.parent == tmp_path.resolve()
    assert call_skill("quoted_skill", {})["ok"] is True


def test_generate_skill_file_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.skills.skill_loader.SKILLS_DIR", str(tmp_path))

    with pytest.raises(ValueError):
        generate_skill_file(
            "../escape",
            "safe description",
            'NAME = "escape"\nDESCRIPTION = "safe"\n\ndef run(params):\n    return {}',
        )


def test_global_default_config_prefers_anthropic_key(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "anthropic")
    monkeypatch.setattr(settings, "llm_model_name", "claude-3-haiku-20240307")
    monkeypatch.setattr(settings, "openai_api_key", "sk-your-key-here")
    monkeypatch.setattr(settings, "anthropic_api_key", "anthropic-real-key")
    monkeypatch.setattr(settings, "openai_base_url", "https://api.anthropic.com")

    cfg = resolve_role_config(None, ModelRole.SOLUTION)

    assert cfg.provider == "anthropic"
    assert cfg.api_key == "anthropic-real-key"
