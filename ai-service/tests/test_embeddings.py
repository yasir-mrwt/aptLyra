"""Deterministic contract fixtures; these are not retrieval-quality measurements."""
import asyncio
import time
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

import main
from app.api import embeddings as endpoint
from app.services.embedding_runtime import CpuEncoder, EmbeddingFailure, manifest


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "embedding-contract-fixture")
    monkeypatch.setattr(endpoint, "_encoder", SimpleNamespace(encode=lambda texts: [[1.] + [0.] * 383 for _ in texts]))
    return TestClient(main.create_app())


def headers():
    return {"X-API-Key": "embedding-contract-fixture"}


def test_auth_and_contract(client):
    body = {"mode": "query", "texts": ["public example"]}
    assert client.post("/internal/embeddings", json=body).status_code == 401
    result = client.post("/internal/embeddings", json=body, headers=headers())
    assert result.status_code == 200
    value = result.json()
    spec = manifest()["models"][manifest()["selected"]]
    assert value["modelId"] == spec["id"]
    assert value["modelRevision"] == spec["revision"]
    assert value["dimension"] == 384 and value["normalization"] == "l2"
    assert len(value["vectors"][0]) == 384


@pytest.mark.parametrize("body", [
    {"mode": "documents", "texts": []}, {"mode": "documents", "texts": ["x"] * 17},
    {"mode": "query", "texts": ["x", "y"]}, {"mode": "query", "texts": [" "]},
    {"mode": "query", "texts": ["x" * 4001]}, {"mode": "query", "texts": [123]},
    {"mode": "tools", "texts": ["x"]}, {"mode": "query", "texts": ["x"], "modelId": "attacker"},
])
def test_strict_limits_without_echo(client, body):
    response = client.post("/internal/embeddings", json=body, headers=headers())
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "invalid_input"}}


def test_byte_limit_before_json_parsing(client):
    response = client.post("/internal/embeddings", content=b"x" * 262145, headers=headers())
    assert response.status_code == 413


@pytest.mark.parametrize("vector", [[0.] * 384, [1.] * 383, [float("nan")] + [0.] * 383,
                                    [float("inf")] + [0.] * 383])
def test_invalid_output(client, monkeypatch, vector):
    monkeypatch.setattr(endpoint, "_encoder", SimpleNamespace(encode=lambda _: [vector]))
    response = client.post("/internal/embeddings", json={"mode": "query", "texts": ["x"]}, headers=headers())
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "invalid_model_output"


def test_model_unavailable_and_artifact_hash(tmp_path):
    with pytest.raises(EmbeddingFailure, match="model_unavailable"):
        CpuEncoder(tmp_path, manifest()["models"]["l3"])
    (tmp_path / "model.onnx").write_bytes(b"corrupt")
    with pytest.raises(EmbeddingFailure, match="model_artifact_mismatch"):
        CpuEncoder(tmp_path, manifest()["models"]["l3"])


def test_pooling_padding_and_token_limit():
    encoder = CpuEncoder.__new__(CpuEncoder)
    encoder.spec = {"maxTokens": 3}
    encoder.tokenizer = SimpleNamespace(encode_batch=lambda _: [SimpleNamespace(ids=[1, 2], attention_mask=[1, 0], type_ids=[0, 0])])
    encoder.session = SimpleNamespace(get_inputs=lambda: [SimpleNamespace(name="input_ids"), SimpleNamespace(name="attention_mask")],
                                     run=lambda *_: [np.array([[[1.] + [0.] * 383, [0.] + [1.] * 383]])])
    assert encoder.encode(["x"])[0] == [1.] + [0.] * 383
    encoder.spec["maxTokens"] = 1
    with pytest.raises(EmbeddingFailure, match="input_token_limit"):
        encoder.encode(["x"])


@pytest.mark.asyncio
async def test_timeout_holds_worker_slot_until_completion(monkeypatch):
    monkeypatch.setattr(endpoint, "DEADLINE_SECONDS", 0.005)
    monkeypatch.setattr(endpoint, "_encoder", SimpleNamespace(encode=lambda _: (time.sleep(0.08) or [[1.] + [0.] * 383])))
    request = endpoint.EmbeddingRequest(mode="query", texts=["x"])
    with pytest.raises(main.HTTPException) as error:
        await endpoint.embeddings(request)
    assert error.value.status_code == 504
    with pytest.raises(main.HTTPException) as error:
        await endpoint.embeddings(request)
    assert error.value.detail["code"] == "model_busy"
    await asyncio.sleep(0.1)
    assert not endpoint._lock.locked()
