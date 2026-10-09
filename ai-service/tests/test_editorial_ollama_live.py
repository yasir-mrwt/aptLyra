"""Opt-in integration smoke test for a locally installed Ollama model."""
import os
from types import SimpleNamespace

import pytest

from app.api.content_extraction import Request as ExtractionRequest, ReviewRequest, extract, review
from app.api.rubric import DraftRequest, Reference, draft
from app.services.groq_service import editorial_ai_settings


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
