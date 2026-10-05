"""CPU-only masked-mean ONNX embeddings. No downloads, providers or database access."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


class EmbeddingFailure(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def manifest() -> dict[str, Any]:
    return json.loads(Path(__file__).with_name("embedding_models.json").read_text())


class CpuEncoder:
    def __init__(self, directory: Path, spec: dict[str, Any]):
        self.spec = spec
        try:
            for name, expected in spec["sha256"].items():
                if hashlib.sha256((directory / name).read_bytes()).hexdigest() != expected:
                    raise EmbeddingFailure("model_artifact_mismatch")
            self.tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
            self.tokenizer.no_truncation()
            self.tokenizer.enable_padding()
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            self.session = ort.InferenceSession(str(directory / "model.onnx"), options,
                                               providers=["CPUExecutionProvider"])
        except EmbeddingFailure:
            raise
        except Exception as exc:
            raise EmbeddingFailure("model_unavailable") from exc

    def encode(self, texts: list[str]) -> list[list[float]]:
        if not 1 <= len(texts) <= 16 or any(not t.strip() or len(t) > 4000 for t in texts):
            raise EmbeddingFailure("invalid_input")
        tokens = self.tokenizer.encode_batch(texts)
        if any(len(t.ids) > self.spec["maxTokens"] for t in tokens):
            raise EmbeddingFailure("input_token_limit")
        inputs = {"input_ids": np.array([t.ids for t in tokens], dtype=np.int64),
                  "attention_mask": np.array([t.attention_mask for t in tokens], dtype=np.int64),
                  "token_type_ids": np.array([t.type_ids for t in tokens], dtype=np.int64)}
        try:
            output = self.session.run(None, {k: inputs[k] for k in
                                            (i.name for i in self.session.get_inputs())})[0]
            mask = inputs["attention_mask"][..., None]
            pooled = (output * mask).sum(axis=1) / mask.sum(axis=1).clip(min=1)
            norms = np.linalg.norm(pooled, axis=1, keepdims=True)
            if np.any(norms < 1e-10):
                raise EmbeddingFailure("invalid_model_output")
            vectors = pooled / norms
            if vectors.shape != (len(texts), 384) or not np.isfinite(vectors).all():
                raise EmbeddingFailure("invalid_model_output")
            return vectors.tolist()
        except EmbeddingFailure:
            raise
        except Exception as exc:
            raise EmbeddingFailure("model_failure") from exc
