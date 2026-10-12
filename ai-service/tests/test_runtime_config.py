from app.runtime_config import load_runtime_config


def test_development_path_survives_stale_shell_and_reload(tmp_path, monkeypatch):
    monkeypatch.delenv("PYTHON_DOTENV_DISABLED", raising=False)
    (tmp_path / ".env").write_text("EMBEDDING_MODEL_DIR=../.model-cache/l3\n")
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.setenv("EMBEDDING_MODEL_DIR", "/tmp/stale-model")
    load_runtime_config(tmp_path)
    import os
    expected = str((tmp_path / "../.model-cache/l3").resolve())
    assert os.environ["EMBEDDING_MODEL_DIR"] == expected
    load_runtime_config(tmp_path)
    assert os.environ["EMBEDDING_MODEL_DIR"] == expected


def test_production_preserves_explicit_process_path(tmp_path, monkeypatch):
    monkeypatch.delenv("PYTHON_DOTENV_DISABLED", raising=False)
    (tmp_path / ".env").write_text("EMBEDDING_MODEL_DIR=../.model-cache/l3\n")
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("EMBEDDING_MODEL_DIR", "/operator/pinned-model")
    load_runtime_config(tmp_path)
    import os
    assert os.environ["EMBEDDING_MODEL_DIR"] == "/operator/pinned-model"


def test_expired_editorial_budget_does_not_start_another_model_call(monkeypatch):
    import time
    import pytest
    from fastapi import HTTPException
    from app.services import groq_service
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    def forbidden(*args, **kwargs):
        raise AssertionError("Expired review must not start another provider request")
    monkeypatch.setattr(groq_service.requests, "post", forbidden)
    token = groq_service.editorial_deadline.set(time.monotonic() - 1)
    try:
        with pytest.raises(HTTPException) as result:
            groq_service._call_ollama("fixture", "fixture", True, 0, None)
        assert result.value.status_code == 504
        assert result.value.detail["code"] == "provider_timeout"
    finally:
        groq_service.editorial_deadline.reset(token)
