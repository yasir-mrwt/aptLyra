# AI-assisted editorial review

Candidate questions, including the trusted 48-question seed corpus, can receive an `editorial-review-v1` proposal from the existing internal AI service. The input is limited to the exact question, allowlisted junior taxonomy and categories, known duplicate candidates, and an evidence excerpt only when model processing is permitted and (for interview reports) explicit AI-processing consent is present. The model is instructed to treat candidate text as untrusted data.

The packet records scope relevance, recommendation, child taxonomy (with its root supplied from the server taxonomy), category, difficulty, duplicate warning, wording issues, optional corrected wording, technical correctness, expected concepts, evidence status, rubric guidance, confidence, and review flags. The backend calculates eligible technical-reference status from the current reviewed references and permission hashes; the model cannot claim that its own answer or an interview report is an approved technical reference.

`POST /api/content-intelligence/review/candidates/:id/ai-review` requires a linked enabled human reviewer and the current question content hash. Each run creates a new immutable row in `candidate_ai_review_packets`; versions are scoped to a candidate and exact content hash. The packet hash and review event make each proposal auditable. A stale content hash is rejected. AI review never changes candidate state, reviewer attribution, publication status, rubric approval, or planner/scoring eligibility. The existing human Approve, Edit & Approve, Reject, reference-review, and rubric-approval actions remain independent gates.

The Review Queue and Seed Review views show the latest packet and expose `Re-run AI Review`. Re-running appends a version rather than replacing the previous proposal. AI confidence describes the proposal only; fresh/provisional content remains outside reviewed aggregate scoring until the existing human question, technical-reference, rubric, and embedding requirements are met.

## Collection boundary

The existing permission-first collector remains limited to approved REST/JSON APIs and RSS/Atom feeds. Seeds and user submissions enter through their existing paths; operator imports remain local/admin controlled. Generic HTML scraping, LinkedIn scraping, unofficial X scraping, and terms/authentication bypasses are not supported. The backend does not search the internet automatically. Only configured, permission-reviewed, enabled sources can be collected; `Sources (0)` means there is no external collection configured. Scheduled work requires the backend worker runtime to be running. The source console shows permission state, interval, next due time, last safe counts, health category, and manual enable/disable/collect/withdraw controls.

## Human review required

No real seed question was approved by this implementation and no human review was fabricated. A linked reviewer can now inspect seed proposals, then use the existing question/reference/scoring workflow. A question can become `reviewed/scoring-ready` only after the actual reviewer verifies the question, attaches eligible reviewed technical references, approves the exact rubric packet, and the compatible embedding is active. Test approvals use disposable synthetic users and databases only.
