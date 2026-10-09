import json
from unittest.mock import patch
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import main

from app.api.content_extraction import Request, extract, validate_result, ReviewRequest, review, validate_review_packet


def request():
    return Request(sourceText="They asked about SQL indexing.",role="Backend Developer",company=None,
                   occurredOn=None,datePrecision="unknown",roundType="technical",topics=["SQL indexing"],
                   allowedCompetencies=["dbms-sql.queries"])


def extraction_context(request_id="fixture-extraction-request"):
    return SimpleNamespace(headers={"x-request-id":request_id})


def candidate(**overrides):
    value={"question":"How can an index improve query performance?","role":"Backend Developer","company":None,
        "occurredOn":None,"datePrecision":"unknown","roundType":"technical","taxonomy":"dbms-sql.queries",
        "category":"conceptual-oral","difficulty":"standard","language":"en","topics":["SQL indexing"],
        "derivationType":"topic-derived","evidenceStart":17,"evidenceEnd":30,"evidenceText":"SQL indexing.","confidence":0.82}
    value.update(overrides)
    return value


def test_extract_returns_versioned_proposals_with_unknown_company_and_exact_evidence():
    payload={"contractVersion":"interview-extraction-v1","candidates":[candidate()]}
    with patch("app.api.content_extraction.call_editorial_ai",return_value=json.dumps(payload)) as call:
        result=extract(request(),extraction_context())
    assert result["contractVersion"]=="interview-extraction-v1"
    assert result["candidates"][0]["company"] is None
    assert call.call_args.kwargs["temperature"]==0
    assert "UNTRUSTED DATA" in call.call_args.args[0]
    assert call.call_args.kwargs["json_schema"]["properties"]["contractVersion"]["const"]=="interview-extraction-v1"


@pytest.mark.parametrize("overrides",[
    {"taxonomy":"unknown.root"},
    {"evidenceText":"Invented source quote"},
    {"company":"Invented employer"},
    {"occurredOn":"2025-03-01","datePrecision":"day"},
])
def test_hallucinated_taxonomy_evidence_company_or_date_is_rejected(overrides):
    with pytest.raises(ValueError):
        validate_result({"contractVersion":"interview-extraction-v1","candidates":[candidate(**overrides)]},request())


def test_server_derives_offsets_from_exact_evidence_quote():
    value={"contractVersion":"interview-extraction-v1","candidates":[candidate(evidenceStart=0,evidenceEnd=1)]}
    result=validate_result(value,request())
    assert result.candidates[0].evidenceStart==17
    assert result.candidates[0].evidenceEnd==30


def test_malformed_provider_json_returns_bounded_error_without_echoing_source():
    raw=request().sourceText
    with patch("app.api.content_extraction.call_editorial_ai",return_value=raw):
        with pytest.raises(HTTPException) as error:
            extract(request(),extraction_context())
    assert error.value.status_code==502
    assert error.value.detail=={"code":"malformed_model_json","category":"malformed_model_json","message":"AI returned an invalid extraction format."}


def test_model_schema_failure_has_a_distinct_safe_category():
    payload={"contractVersion":"interview-extraction-v1","candidates":[candidate(difficulty="advanced")]}
    with patch("app.api.content_extraction.call_editorial_ai",return_value=json.dumps(payload)) as call:
        with pytest.raises(HTTPException) as error:
            extract(request(),extraction_context())
    assert error.value.status_code==502
    assert call.call_count==2
    assert error.value.detail["code"]=="extraction_schema_validation_failed"
    assert error.value.detail["category"]=="schema_validation"
    assert "sourceText" not in json.dumps(error.value.detail)


def test_evidence_and_metadata_validation_failure_has_a_distinct_safe_category():
    payload={"contractVersion":"interview-extraction-v1","candidates":[candidate(evidenceText="invented text")]}
    with patch("app.api.content_extraction.call_editorial_ai",return_value=json.dumps(payload)) as call:
        with pytest.raises(HTTPException) as error:
            extract(request(),extraction_context())
    assert call.call_count==2
    assert error.value.detail["code"]=="extraction_semantic_validation_failed"
    assert error.value.detail["category"]=="semantic_validation"


def test_extraction_schema_failure_is_repaired_once_and_can_succeed(caplog):
    invalid={"contractVersion":"interview-extraction-v1","candidates":[candidate(difficulty="advanced")]}
    valid={"contractVersion":"interview-extraction-v1","candidates":[candidate()]}
    with patch("app.api.content_extraction.call_editorial_ai",side_effect=[json.dumps(invalid),json.dumps(valid)]) as call:
        result=extract(request(),extraction_context("request-extraction-repair"))
    assert result["candidates"][0]["difficulty"]=="standard"
    assert call.call_count==2
    assert call.call_args.kwargs["max_retries"]==0
    assert call.call_args.kwargs["json_schema"] is not None
    assert "request-extraction-repair" in caplog.text


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


def review_context(request_id="fixture-review-request"):
    return SimpleNamespace(headers={"x-request-id": request_id})


def test_ai_review_returns_valid_proposal_and_never_approves():
    proposed=packet()
    with patch("app.api.content_extraction.call_editorial_ai",return_value=json.dumps(proposed)) as call:
        result=review(review_request(),review_context())
    assert result["contractVersion"]=="editorial-review-v1"
    assert result["flags"][-1]=="needs-human-review"
    assert call.call_args.kwargs["temperature"]==0
    assert "UNTRUSTED DATA" in call.call_args.args[0]
    assert '"title":"ReviewPacket"' in call.call_args.args[0]
    assert '"additionalProperties":false' in call.call_args.args[0]
    assert '"enum":["dbms-sql.queries"]' in call.call_args.args[0]
    assert '"enum":["conceptual-oral","sql"]' in call.call_args.args[0]
    assert call.call_args.kwargs["as_json"] is True
    assert call.call_count==1


def test_schema_invalid_json_gets_one_bounded_repair_and_preserves_input():
    invalid=packet(confidence="certain")
    valid=packet()
    with patch("app.api.content_extraction.call_editorial_ai",side_effect=[json.dumps(invalid),json.dumps(valid)]) as call:
        result=review(review_request(),review_context())
    assert result["confidence"]=="medium"
    assert result["flags"][-1]=="needs-human-review"
    assert call.call_count==2
    repair_system,repair_user=call.call_args.args
    assert "Correct a prior editorial review proposal" in repair_system
    assert '"path": "confidence"' in repair_user
    assert "What does a SQL index help a database do?" in repair_user
    assert "They asked about indexes." in repair_user
    assert call.call_args.kwargs["max_retries"]==0


def test_repair_that_remains_schema_invalid_returns_typed_502_and_safe_diagnostics(caplog):
    invalid=packet(confidence="certain")
    with patch("app.api.content_extraction.call_editorial_ai",side_effect=[json.dumps(invalid),json.dumps(invalid)]) as call:
        with pytest.raises(HTTPException) as error:
            review(review_request(),review_context("request-schema-failed"))
    assert call.call_count==2
    assert error.value.status_code==502
    assert error.value.detail["code"]=="editorial_schema_validation_failed"
    assert error.value.detail["category"]=="schema_validation"
    assert "request-schema-failed" in caplog.text
    assert "field_paths=['confidence']" in caplog.text
    assert "contract=editorial-review-v1" in caplog.text
    assert "attempt=2" in caplog.text
    assert "certain" not in caplog.text


def test_malformed_json_is_typed_and_does_not_trigger_schema_repair():
    with patch("app.api.content_extraction.call_editorial_ai",return_value="not JSON {") as call:
        with pytest.raises(HTTPException) as error:
            review(review_request(),review_context())
    assert call.call_count==1
    assert error.value.status_code==502
    assert error.value.detail["code"]=="malformed_model_json"
    assert error.value.detail["category"]=="malformed_model_json"


def test_semantic_failure_gets_one_bounded_repair_and_logs_safe_rule(caplog):
    invalid=packet(taxonomy="invented.taxonomy")
    with patch("app.api.content_extraction.call_editorial_ai",side_effect=[json.dumps(invalid),json.dumps(packet())]) as call:
        result=review(review_request(),review_context("request-semantic-failed"))
    assert result["taxonomy"]=="dbms-sql.queries"
    assert call.call_count==2
    assert "unsupported_taxonomy" in caplog.text
    assert "taxonomy" in caplog.text
    assert "invented.taxonomy" not in caplog.text


def test_semantic_failure_after_single_repair_is_typed_502(caplog):
    invalid=packet(taxonomy="invented.taxonomy")
    with patch("app.api.content_extraction.call_editorial_ai",side_effect=[json.dumps(invalid),json.dumps(invalid)]) as call:
        with pytest.raises(HTTPException) as error:
            review(review_request(),review_context("request-semantic-failed"))
    assert call.call_count==2
    assert error.value.status_code==502
    assert error.value.detail["code"]=="editorial_semantic_validation_failed"
    assert error.value.detail["category"]=="semantic_validation"
    assert "unsupported_taxonomy" in caplog.text
    assert "taxonomy" in caplog.text
    assert "invented.taxonomy" not in caplog.text


def test_missing_human_review_flag_gets_one_repair_as_real_contract_regression(caplog):
    invalid=packet(flags=["weak-evidence"])
    with patch("app.api.content_extraction.call_editorial_ai",side_effect=[json.dumps(invalid),json.dumps(packet())]) as call:
        result=review(review_request(),review_context("request-human-review-flag"))
    assert "needs-human-review" in result["flags"]
    assert call.call_count==2
    assert "human_review_flag_required" in caplog.text
    assert "field_paths=['flags']" in caplog.text


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


def test_ai_auto_approval_claim_is_rejected_as_semantic_failure():
    with pytest.raises(ValueError,match="ai_attempted_human_approval"):
        validate_review_packet(packet(evidenceSummary="I approved this question and it is ready for interviews."),review_request())


def test_review_rejects_unapproved_taxonomy_and_missing_human_review_flag():
    with pytest.raises(ValueError):
        validate_review_packet(packet(taxonomy="invented.taxonomy"),review_request())
    with pytest.raises(ValueError):
        validate_review_packet(packet(flags=["weak-evidence"]),review_request())
