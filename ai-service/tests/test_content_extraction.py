import json
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main

from app.api.content_extraction import Request, extract, validate_result, ReviewRequest, review, validate_review_packet


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


def review_request(**overrides):
    value={"question":"What does a SQL index help a database do?","allowedCompetencies":["dbms-sql.queries"],
        "allowedCategories":["conceptual-oral","sql"],"evidenceText":"They asked about indexes.","similarQuestions":[]}
    value.update(overrides)
    return ReviewRequest(**value)


def packet(**overrides):
    value={"contractVersion":"editorial-review-v1","relevance":"relevant","verdict":"recommend-approve",
        "taxonomy":"dbms-sql.queries","category":"sql","difficulty":"standard","duplicateWarning":False,
        "wordingIssues":[],"correctedQuestion":None,"technicalCorrectness":"supported","expectedConcepts":["Indexes can reduce rows scanned"],
        "evidenceStatus":"weak","evidenceSummary":"Interview wording is a weak signal, not technical proof.",
        "rubricGuidance":["Explain lookup benefits and write/update costs."],"confidence":"medium","flags":["weak-evidence","needs-human-review"]}
    value.update(overrides)
    return value


def test_ai_review_returns_valid_proposal_and_never_approves():
    proposed=packet()
    with patch("app.api.content_extraction.call_groq",return_value=json.dumps(proposed)) as call:
        result=review(review_request())
    assert result["contractVersion"]=="editorial-review-v1"
    assert result["flags"][-1]=="needs-human-review"
    assert call.call_args.kwargs["temperature"]==0
    assert "UNTRUSTED DATA" in call.call_args.args[0]


def test_irrelevant_question_must_recommend_rejection_and_duplicate_is_flagged():
    request=review_request()
    assert validate_review_packet(packet(relevance="irrelevant",verdict="recommend-reject",flags=["irrelevant","needs-human-review"]),request)
    duplicate=validate_review_packet(packet(duplicateWarning=True,flags=["duplicate","needs-human-review"]),request)
    assert duplicate.duplicateWarning is True
    with pytest.raises(ValueError):
        validate_review_packet(packet(relevance="irrelevant"),request)


def test_ambiguous_or_suspicious_question_gets_a_human_edit_proposal():
    result=validate_review_packet(packet(verdict="recommend-edit",technicalCorrectness="suspicious",
        correctedQuestion="What trade-offs can an index introduce?",wordingIssues=["The original wording is ambiguous."],
        flags=["ambiguous","technically-suspicious","needs-human-review"]),review_request())
    assert result.verdict=="recommend-edit"
    assert result.correctedQuestion
    with pytest.raises(ValueError):
        validate_review_packet(packet(approved=True),review_request())
    with pytest.raises(ValueError):
        validate_review_packet(packet(technicalCorrectness="suspicious",verdict="recommend-approve"),review_request())


def test_review_rejects_unapproved_taxonomy_and_missing_human_review_flag():
    with pytest.raises(ValueError):
        validate_review_packet(packet(taxonomy="invented.taxonomy"),review_request())
    with pytest.raises(ValueError):
        validate_review_packet(packet(flags=["weak-evidence"]),review_request())
