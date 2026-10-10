"""Opt-in integration smoke test for a locally installed Ollama model."""
import os
import json
from types import SimpleNamespace

import pytest
import requests

from app.api.content_extraction import Request as ExtractionRequest, ReviewRequest, extract, review
from app.api.rubric import DraftRequest, Reference, draft
from app.services.groq_service import editorial_ai_settings
from app.services import groq_service


@pytest.mark.skipif(os.getenv("RUN_LOCAL_OLLAMA_SMOKE") != "1", reason="requires an explicitly enabled local Ollama service")
def test_ollama_review_extraction_and_scoring_guide(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("AI_FALLBACK_ENABLED", "false")
    model = os.getenv("OLLAMA_MODEL", "").strip()
    assert model, "set OLLAMA_MODEL to a model detected by ollama list"
    assert editorial_ai_settings() == ("ollama", model)

    review_result = review(ReviewRequest(
        question="Explain how a database index can speed up lookups and add cost to writes.",
        allowedCompetencies=["dbms-sql.queries"],
        allowedCategories=["conceptual-oral"],
        evidenceText=None,
        similarQuestions=[],
    ), SimpleNamespace(headers={"x-request-id": "local-ollama-review"}))
    assert review_result["taxonomy"] == "dbms-sql.queries"
    assert "needs-human-review" in review_result["flags"]
    assert "approved" not in review_result

    source_text = "The interviewer asked: How does a database index speed up lookups, and why might it make inserts more expensive?"
    extraction_result = extract(ExtractionRequest(
        sourceText=source_text,
        role="Backend Developer",
        company=None,
        occurredOn=None,
        datePrecision="unknown",
        roundType="technical",
        topics=["database indexing"],
        allowedCompetencies=["dbms-sql.queries"],
    ), SimpleNamespace(headers={"x-request-id": "local-ollama-extraction"}))
    assert extraction_result["candidates"]
    for candidate in extraction_result["candidates"]:
        assert source_text[candidate["evidenceStart"]:candidate["evidenceEnd"]] == candidate["evidenceText"]
        assert candidate["taxonomy"] == "dbms-sql.queries"

    draft_result = draft(DraftRequest(
        question="Explain how a database index can improve lookup speed and affect write performance.",
        references=[Reference(id="local-reference", text=(
            "An index is an auxiliary data structure that helps locate rows without scanning every row. "
            "Maintaining an index adds storage and can make inserts or updates more expensive."
        ))],
    ), SimpleNamespace(headers={"x-request-id": "local-ollama-scoring-guide"}))
    assert draft_result["concepts"]
    assert all(set(concept["sourceIds"]) <= {"local-reference"} for concept in draft_result["concepts"])


@pytest.mark.skipif(os.getenv("RUN_LOCAL_OLLAMA_REVIEW_SMOKE") != "1", reason="requires explicit one-question local Ollama verification")
def test_one_authored_question_review_makes_one_ollama_request(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("AI_FALLBACK_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_MODEL", "llama3.2:3b")
    question = "Disposable local smoke question: explain one benefit and cost of a database index."
    requests_seen = []
    original_post = requests.post

    def counted_post(url, *args, **kwargs):
        if str(url).endswith("/api/chat"):
            body = kwargs.get("json") or {}
            requests_seen.append(body)
        return original_post(url, *args, **kwargs)

    monkeypatch.setattr(groq_service.requests, "post", counted_post)
    result = review(ReviewRequest(question=question, allowedCompetencies=["dbms-sql.queries"],
        allowedCategories=["conceptual-oral"], evidenceText=None, similarQuestions=[]),
        SimpleNamespace(headers={"x-request-id": "one-question-ollama-smoke"}))

    assert result["taxonomy"] == "dbms-sql.queries"
    assert "needs-human-review" in result["flags"]
    assert "approved" not in result
    assert len(requests_seen) == 1, "a valid single-click review should make one Ollama chat request"
    prompt = requests_seen[0]["messages"][1]["content"]
    decoded = json.loads(prompt)
    assert decoded["untrusted_review_input"]["question"] == question
    assert len(decoded["untrusted_review_input"]) == 5
