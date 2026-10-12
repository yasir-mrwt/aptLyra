# Question review and practice readiness

The Interview Bank has three separate labels:

| Label | Requirements and evaluation |
| --- | --- |
| Aptlyra starter | The existing trusted 48-question path and its baseline evaluation. Starter questions do not enter the new-question Review Queue. |
| Practice ready · provisional | A human reviewer approved a valid new question and publication completed with a compatible embedding. Evidence and a scoring guide are optional. Ungrounded practice feedback is descriptive, low confidence, has no technical score, and is excluded from reviewed aggregate scores. |
| Reviewed · scoring ready | The question additionally has eligible reviewed technical evidence and an approved, hash-bound scoring guide. Reviewed evaluation remains subject to its normal evidence and confidence checks. |

## Simple flow

A linked, enabled human reviewer opens **Review Queue → Add question**, supplies question/topic/difficulty and authorship attestation, and optionally checks **Allow optional AI suggestions**. The question enters the queue. Choose **Review manually** or **Analyze with AI**, edit wording, expected answer and classification, then **Approve for Interview Bank**. **Save changes** stores an unapproved draft; **Reject** resolves an unsuitable candidate. Approved questions leave the queue and appear in the Interview Bank without an evidence or rubric requirement.

The bank's **Improve scoring quality** section contains the optional evidence and scoring-guide workflow. Add and review a technical reference, attach it to the question, draft or enter a guide, inspect it, then approve scoring. An AI draft is never a human approval. Invalid guide JSON is shown as an error rather than silently ignored. Repeated publication safely resumes embedding for the same published version after an embedding outage.

Edits preserve the reviewer’s explicit duplicate decision. Extraction only suggests semantic duplicate links at cosine similarity ≥0.9 (an engineering heuristic, not measured accuracy); unrelated nearest neighbours do not automatically become one family. Family propagation follows actual linked candidates.

A submission containing several questions can be reviewed one question at a time, including after another question from that submission has been published. The submission inbox only lists actual user submissions; authored question records are shown as candidates.

## Exact AI consent

`allowAi` from the authored-question form is persisted as `sources.model_processing_allowed` for the newly created, dedicated authored source. An unchecked box stays false. Review checks this exact source permission and the current candidate hash; false returns `403 source-ai-processing-disallowed`.

For an eligible locally authored question, a linked reviewer can explicitly click **Enable AI analysis**. `POST /api/content-intelligence/review/candidates/:id/enable-ai` verifies the expected hash, enabled/permitted source, local authored origin, and dedicated source identity, then records an audit event and changes only that source. The action is available in the queue and optional bank scoring section. Third-party sources and voluntary submissions cannot use this action to bypass their consent rules.

`POST /api/content-intelligence/review/candidates/:id/ai-review` reviews exactly one selected question per action. It records an immutable `editorial-review-v1` proposal tied to the current content hash. A proposal contains suggested wording, taxonomy, scope, expected concepts and evidence/rubric guidance. It does not approve or publish the question. `POST /api/content-intelligence/review/candidates/:id/approve-bank` binds the saved question and answer revision to human approval, commits publication and then indexes it. The legacy approve-practice endpoint is retained for compatibility; the normal UI uses the revision-bound editor.

Editorial extraction, review and scoring-guide drafting default to local Ollama `llama3.2:3b`. Groq remains an explicit provider/fallback option; fallback is disabled by default. A browser retry is a new explicit review, not an automatic batch. Source text is untrusted model input. Technical evidence is checked by the backend; model assertions cannot promote their own output into reviewed evidence.

## Planner and evaluation

Approved dynamic practice questions are eligible without a recent-trends opt-in. The trusted starter retrieval stages remain unchanged. A final bounded structured lookup covers approved dynamic questions missed by a generic topic query's semantic threshold. It retains taxonomy, role, mode, difficulty, source/company/date permissions, active corpus, provenance and duplicate exclusions; it records a null similarity rather than inventing a semantic score.

The API exposes `PRACTICE_READY` and `REVIEWED_SCORING_READY` as display readiness over the existing persisted inventory classes. No new migration is needed. Practice without reviewed evidence/guide returns **Provisional** descriptive feedback with low confidence and no reviewed aggregate contribution. Internally an unavailable rubric remains unavailable and its numeric evaluation abstains; the UI does not misrepresent this as reviewed grading. Scoring-ready questions use the existing rubric evaluator.

## Collection and reviewer boundary

Collection remains limited to permission-reviewed enabled REST/JSON APIs and RSS/Atom feeds. No generic scraping or permission bypass is added. Scheduled collection requires the existing worker. Reviewer actions require both the appropriate application role and an enabled linked human-reviewer identity; an ordinary practice account cannot approve questions. Test-only reviewer identities, question approvals and evidence are confined to disposable local databases.

## Simple question review

The normal flow is **Submit question → Review Queue → Analyze with AI or Review manually → Save/Approve → Interview Bank**. The 48 trusted starters are excluded from this flow. The existing ingestion candidates, source permissions, audit events and published question versions remain authoritative; this is not a second content store.

Normal users submit one question with optional role, topic and context. Right-to-share permission is required; AI consent is optional. Submission creates an unresolved candidate immediately. Only a linked, enabled human reviewer with reviewer/admin/owner access can review or publish it.

The same editor handles manual and AI-assisted review. It includes question, expected answer, taxonomy topic, difficulty and delivery mode. AI suggestions never approve content. Local Ollama `llama3.2:3b` remains the default; provider fallback is disabled by default. The generated answer is a draft that must be checked and can be replaced by the reviewer. Pure explanatory questions are proposed as oral; coding execution specifications are never invented.

`Save changes` persists a draft without approval. The review revision binds wording, answer and classification; stale edits are rejected. Approval stores the final human-approved answer in the immutable question version metadata and retains its review audit. Existing imported candidates can use the same editor. Legacy ingestion/extraction APIs remain compatible for operator imports; they are not additional normal-flow UI steps.

Publication commits before indexing. If embedding fails, approval remains saved and the card offers **Retry indexing**. This endpoint only rebuilds retrieval metadata; it does not edit, approve or republish the question. Successful questions leave Review Queue and enter Interview Bank as **Practice ready**. This does not claim reviewed scoring: evidence and detailed rubric work remain under the optional **Improve scoring quality** section in Interview Bank.

Review APIs (authenticated, linked reviewer required):

- `POST /api/content-intelligence/review/candidates/:id/save`: expected content hash, previous review revision and editable review fields.
- `POST /api/content-intelligence/review/candidates/:id/approve-bank`: exact saved hash/revision and any required duplicate decision.
- `POST /api/content-intelligence/review/candidates/:id/retry-indexing`: exact published content hash; no approval decision.

These use existing JSON metadata and audit storage. No migration or dependency change is needed. Question/answer drafts and approval snapshots are distinct; historical versions remain immutable.
