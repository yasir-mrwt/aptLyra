"""Deterministic local configuration, also applied in Uvicorn reload children."""
import logging
import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv


def load_runtime_config(directory: Path | None = None) -> None:
    if os.getenv("PYTHON_DOTENV_DISABLED") == "1":
        return
    directory = directory or Path(__file__).resolve().parents[1]
    env_file = directory / ".env"
    load_dotenv(env_file)
    # Production keeps normal process-env precedence. Only this local model path
    # is owned by the development file, avoiding stale inherited /tmp exports.
    local = dotenv_values(env_file) if env_file.is_file() else {}
    path = os.getenv("EMBEDDING_MODEL_DIR")
    if os.getenv("NODE_ENV") == "development" and local.get("EMBEDDING_MODEL_DIR"):
        configured = str(local["EMBEDDING_MODEL_DIR"])
        if path and path != configured:
            logging.warning("embedding_config: using development .env model path instead of inherited shell path")
        path = configured
    if path:
        resolved = Path(path).expanduser()
        if not resolved.is_absolute():
            resolved = directory / resolved
        os.environ["EMBEDDING_MODEL_DIR"] = str(resolved.resolve())
