# Question review and practice readiness

The Interview Bank has three separate labels:

| Label | Requirements and evaluation |
| --- | --- |
| Aptlyra starter | The existing trusted 48-question path and its baseline evaluation. Starter questions do not enter the new-question Review Queue. |
| Practice ready · provisional | A human reviewer approved a valid new question and publication completed with a compatible embedding. Evidence and a scoring guide are optional. Ungrounded practice feedback is descriptive, low confidence, has no technical score, and is excluded from reviewed aggregate scores. |
| Reviewed · scoring ready | The question additionally has eligible reviewed technical evidence and an approved, hash-bound scoring guide. Reviewed evaluation remains subject to its normal evidence and confidence checks. |

## Simple flow

A linked, enabled human reviewer opens **Review Queue → Add question**, supplies question/topic/difficulty and authorship attestation, and optionally checks **Allow optional AI suggestions**. The question enters the queue. Choose **Review manually** or **Review with AI**, inspect the wording, then **Approve for practice**. **Edit** saves human-reviewed wording; **Reject** resolves an unsuitable candidate. Approved questions leave the queue and appear in the Interview Bank without an evidence or rubric requirement.

The bank's **Improve scoring quality** section contains the optional evidence and scoring-guide workflow. Add and review a technical reference, attach it to the question, draft or enter a guide, inspect it, then approve scoring. An AI draft is never a human approval. Invalid guide JSON is shown as an error rather than silently ignored. Repeated publication safely resumes embedding for the same published version after an embedding outage.

Edits preserve the reviewer’s explicit duplicate decision. Extraction only suggests semantic duplicate links at cosine similarity ≥0.9 (an engineering heuristic, not measured accuracy); unrelated nearest neighbours do not automatically become one family. Family propagation follows actual linked candidates.

A submission containing several questions can be reviewed one question at a time, including after another question from that submission has been published. The submission inbox only lists actual user submissions; authored question records are shown as candidates.

## Exact AI consent

`allowAi` from the authored-question form is persisted as `sources.model_processing_allowed` for the newly created, dedicated authored source. An unchecked box stays false. Review checks this exact source permission and the current candidate hash; false returns `403 source-ai-processing-disallowed`.

For an eligible locally authored question, a linked reviewer can explicitly click **Enable AI suggestions for this question**. `POST /api/content-intelligence/review/candidates/:id/enable-ai` verifies the expected hash, enabled/permitted source, local authored origin, and dedicated source identity, then records an audit event and changes only that source. The action is available in the queue and optional bank scoring section. Third-party sources and voluntary submissions cannot use this action to bypass their consent rules.

`POST /api/content-intelligence/review/candidates/:id/ai-review` reviews exactly one selected question per action. It records an immutable `editorial-review-v1` proposal tied to the current content hash. A proposal contains suggested wording, taxonomy, scope, expected concepts and evidence/rubric guidance. It does not approve or publish the question. `POST /api/content-intelligence/review/candidates/:id/approve-practice` applies existing human approval/publication gates and embeds the published version; responses report embedding readiness explicitly.

Editorial extraction, review and scoring-guide drafting default to local Ollama `llama3.2:3b`. Groq remains an explicit provider/fallback option; fallback is disabled by default. A browser retry is a new explicit review, not an automatic batch. Source text is untrusted model input. Technical evidence is checked by the backend; model assertions cannot promote their own output into reviewed evidence.

## Planner and evaluation

Approved dynamic practice questions are eligible without a recent-trends opt-in. The trusted starter retrieval stages remain unchanged. A final bounded structured lookup covers approved dynamic questions missed by a generic topic query's semantic threshold. It retains taxonomy, role, mode, difficulty, source/company/date permissions, active corpus, provenance and duplicate exclusions; it records a null similarity rather than inventing a semantic score.

The API exposes `PRACTICE_READY` and `REVIEWED_SCORING_READY` as display readiness over the existing persisted inventory classes. No new migration is needed. Practice without reviewed evidence/guide returns **Provisional** descriptive feedback with low confidence and no reviewed aggregate contribution. Internally an unavailable rubric remains unavailable and its numeric evaluation abstains; the UI does not misrepresent this as reviewed grading. Scoring-ready questions use the existing rubric evaluator.

## Collection and reviewer boundary

Collection remains limited to permission-reviewed enabled REST/JSON APIs and RSS/Atom feeds. No generic scraping or permission bypass is added. Scheduled collection requires the existing worker. Reviewer actions require both the appropriate application role and an enabled linked human-reviewer identity; an ordinary practice account cannot approve questions. Test-only reviewer identities, question approvals and evidence are confined to disposable local databases.
