"""Internal bounded embedding computation. Authentication is applied by main."""
from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator, model_validator

from app.services.embedding_runtime import CpuEncoder, EmbeddingFailure, manifest

router = APIRouter(prefix="/internal/embeddings", tags=["Internal embeddings"])
_lock = threading.Lock()
_encoder: CpuEncoder | None = None
DEADLINE_SECONDS = 10
logger = logging.getLogger(__name__)


class EmbeddingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["documents", "query"]
    texts: Annotated[list[Annotated[StrictStr, Field(min_length=1, max_length=4000)]],
                     Field(min_length=1, max_length=16)]

    @field_validator("texts")
    @classmethod
    def nonempty(cls, texts: list[str]) -> list[str]:
        if any(not t.strip() for t in texts):
            raise ValueError("invalid_input")
        return texts

    @model_validator(mode="after")
    def query_size(self) -> EmbeddingRequest:
        if self.mode == "query" and len(self.texts) != 1:
            raise ValueError("query_batch_limit")
        return self


class EmbeddingResponse(BaseModel):
    modelId: str
    modelRevision: str
    dimension: Literal[384] = 384
    normalization: Literal["l2"] = "l2"
    embeddingVersion: str
    vectors: list[list[Annotated[float, Field(strict=True, allow_inf_nan=False)]]]
    processingMs: float

    @field_validator("vectors")
    @classmethod
    def valid_vectors(cls, vectors: list[list[float]]) -> list[list[float]]:
        import math
        if not 1 <= len(vectors) <= 16 or any(len(v) != 384 or any(not math.isfinite(x) for x in v)
                                              or abs(sum(x*x for x in v) - 1) > 0.002 for v in vectors):
            raise ValueError("invalid_model_output")
        return vectors


def _compute(texts: list[str]) -> EmbeddingResponse:
    global _encoder
    start = time.perf_counter()
    try:
        spec = manifest()["models"][manifest()["selected"]]
        if _encoder is None:
            path = os.getenv("EMBEDDING_MODEL_DIR")
            if not path:
                raise EmbeddingFailure("model_directory_unconfigured")
            _encoder = CpuEncoder(Path(path), spec)
        vectors = _encoder.encode(texts)
        if len(vectors) != len(texts):
            raise EmbeddingFailure("invalid_model_output")
        return EmbeddingResponse(modelId=spec["id"], modelRevision=spec["revision"],
                                 embeddingVersion=spec["embeddingVersion"], vectors=vectors,
                                 processingMs=round((time.perf_counter() - start) * 1000, 3))
    finally:
        _lock.release()


@router.post("", response_model=EmbeddingResponse)
async def embeddings(request: EmbeddingRequest) -> EmbeddingResponse:
    # No unbounded work queue; a timed-out worker retains the lock until it exits.
    if not _lock.acquire(blocking=False):
        raise HTTPException(503, detail={"code": "model_busy"})
    future = asyncio.get_running_loop().run_in_executor(None, _compute, request.texts)
    try:
        return await asyncio.wait_for(asyncio.shield(future), timeout=DEADLINE_SECONDS)
    except TimeoutError:
        # Consume a later exception without releasing the running worker's lock.
        future.add_done_callback(lambda f: f.exception() if not f.cancelled() else None)
        raise HTTPException(504, detail={"code": "model_timeout"}) from None
    except EmbeddingFailure as exc:
        logger.warning("Embedding request failed: %s", exc.code)
        raise HTTPException(422 if exc.code in ("invalid_input", "input_token_limit") else 503,
                            detail={"code": exc.code}) from None
    except Exception:
        raise HTTPException(503, detail={"code": "invalid_model_output"}) from None
