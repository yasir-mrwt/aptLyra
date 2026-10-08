import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main

from app.api.content_extraction import Request, extract, validate_result


def request():
    return Request(sourceText="They asked about SQL indexing.",role="Backend Developer",company=None,
                   occurredOn=None,datePrecision="unknown",roundType="technical",topics=["SQL indexing"],
                   allowedCompetencies=["dbms-sql.queries"])


def candidate(**overrides):
    value={"question":"How can an index improve query performance?","role":"Backend Developer","company":None,
        "occurredOn":None,"datePrecision":"unknown","roundType":"technical","taxonomy":"dbms-sql.queries",
        "category":"conceptual-oral","difficulty":"standard","language":"en","topics":["SQL indexing"],
        "derivationType":"topic-derived","evidenceStart":17,"evidenceEnd":30,"evidenceText":"SQL indexing.","confidence":0.82}
    value.update(overrides)
    return value


def test_extract_returns_versioned_proposals_with_unknown_company_and_exact_evidence():
    payload={"contractVersion":"interview-extraction-v1","candidates":[candidate()]}
    with patch("app.api.content_extraction.call_groq",return_value=json.dumps(payload)) as call:
        result=extract(request())
    assert result["contractVersion"]=="interview-extraction-v1"
    assert result["candidates"][0]["company"] is None
    assert call.call_args.kwargs["temperature"]==0
    assert "UNTRUSTED DATA" in call.call_args.args[0]


@pytest.mark.parametrize("overrides",[
    {"taxonomy":"unknown.root"},
    {"evidenceText":"Invented source quote"},
    {"company":"Invented employer"},
    {"occurredOn":"2025-03-01","datePrecision":"day"},
])
def test_hallucinated_taxonomy_evidence_company_or_date_is_rejected(overrides):
    with pytest.raises(ValueError):
        validate_result({"contractVersion":"interview-extraction-v1","candidates":[candidate(**overrides)]},request())


def test_malformed_provider_json_returns_bounded_error_without_echoing_source():
    raw=request().sourceText
    with patch("app.api.content_extraction.call_groq",return_value=raw):
        with pytest.raises(HTTPException) as error:
            extract(request())
    assert error.value.status_code==502
    assert error.value.detail=={"code":"invalid_extraction_output","message":"Structured content extraction unavailable."}


def test_internal_validation_error_does_not_echo_untrusted_submission(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY","content-contract-fixture")
    client=TestClient(main.create_app())
    raw="SECRET untrusted interview text"
    response=client.post("/internal/content/extract",headers={"X-API-Key":"content-contract-fixture"},json={"sourceText":raw})
    assert response.status_code==422
    assert raw not in response.text
    assert response.json()=={"detail":{"code":"invalid_input"}}
