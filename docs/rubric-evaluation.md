# Phase 7 rubric evaluation

Newly confirmed planner interviews use `rubric-v1`. Existing sessions retain their original legacy scores and labels, including previously confirmed Phase 6 plans. React remains the runner/report client; Express validates ownership, writes PostgreSQL and emits Socket.IO updates; FastAPI performs bounded computation without database credentials. Redis retains the existing reward/cache role. Durable interview operations and crash recovery are Phase 8 work.

## Scoring and confidence

Five technical dimensions always use 0–4 values: correctness 45%, concept coverage 20%, reasoning 20%, practical application 10%, trade-off awareness 5%. Express computes `25 * sum(weight * value) / 100`, rounded to one decimal. SQL independently checks the saved total and fixed dimension set. Provider weights/totals are rejected. Concept coverage is calculated from required/optional concept judgments weighted by importance (satisfied = 1, partial = 0.5, otherwise = 0). Communication is descriptive and contributes no weight. Phase 7 freezes this policy; earlier Phase 2 proposals for editable weights, omitted dimensions or a universal fatal-error cap are not active behavior.

Reviewed scoring requires a published exact question version, an immutable rubric with exact-hash human approval and currently available approved technical-reference chunks covering its concepts. High/medium evaluator confidence permits a score. High describes the available evidence basis; it is not a calibrated probability or an accuracy claim. Provisional or derived probe evaluation is capped at medium. Low confidence, unavailable required evidence/artifacts or absent grounding withholds the absolute score. Abstention preserves the candidate answer and a reason; it does not substitute a legacy score or zero. Provider failure is different: the attempt is marked failed, no grade/reward is produced, and the runner offers retry.

Reviewed aggregate includes only scored reviewed original questions with high/medium confidence. It excludes probes, provisional, abstained and legacy results. The frozen Phase 2 coverage gate also requires at least two eligible originals, 60% eligible original coverage and one eligible result for every planned competency root. Root means receive equal weight; insufficient coverage yields a nullable total and reasons. Session lists, reports and analytics use current evidence availability; withdrawn evidence is withheld publicly while the immutable original grade remains in audit history. Historical legacy trends remain separate.

## Concepts, coding and probes

Each immutable rubric version owns stable concept keys/IDs, observable descriptions, labels, required flags, importance and permitted reference chunk/version links. The evaluator must return exactly those concepts, allowed judgments, bounded Unicode code-point answer/code spans and only supplied supporting reference IDs. Persistence records judgments, explanations, spans/artifacts, policy, model and prompt version, answer attempt, question version and rubric lineage. Candidate text and source excerpts are explicitly untrusted prompt data. Strict schema validation rejects malformed, nonfinite, missing, invented or extra policy fields; this is resistance to injection, not a guarantee against every semantic model failure.

JDoodle remains the only execution integration. An owned active coding question can attach `sessionId`/`questionIndex` to the existing execution request. Express records exact code hash, language and reported runtime success/failure. A changed code/language cannot reuse that evidence. Runtime success does not establish reviewed test passage. No reviewed test bank is shipped; coding confidence is capped at medium and reports state that limitation. Hard objective failure sets correctness to zero and records an explicit reason; conceptual dimensions remain separate. Client assertions about passing tests are not trusted, and no autonomous execution is added.

A scored missing/partial/contradicted required concept can request a bounded probe. The existing generator receives the missing concept reason, and the projection pins parent evaluation/concept/question identity. Maximum two probes per interview; no probe of a probe. Derived probes are provisional and never alter the reviewed aggregate. Generation failure keeps the original evaluation without manufacturing a probe.

## Operator review workflow

Run the existing migration command before using fresh planner confirmation. Node 20.19–20.x is required. Build the backend before CLI operations. Production/staging mutation commands require a trailing `--apply`, performed by an authorized operator. Never infer rubric or reference approval from the 48-question seed approval.

```bash
cd backend
npm run build
npm run db:migrate
npm run rubrics -- seed-drafts /private/path/seed-rubric-drafts.json
npm run rubrics -- draft /private/path/question-rubric.json
npm run rubrics -- inspect DRAFT_ID
npm run rubrics -- provisional DRAFT_ID EXACT_CONTENT_HASH
npm run rubrics -- approve DRAFT_ID EXACT_CONTENT_HASH HUMAN_REVIEWER_ID
npm run rubrics -- retire RUBRIC_VERSION_ID
npm run rubrics -- reevaluate ANSWER_ATTEMPT_ID OWNER_ID
```

`seed-drafts` exports private, unpublished editorial proposals for the 48 published seed versions, not reviewed grading material. Replace each broad proposal with observable concepts and approved technical-reference chunk IDs. Draft packages contain `questionVersionId` and 1–20 `concepts`, each with `key`, `label`, `description`, positive `importance`, boolean `required`, and unique `sourceIds`. Empty references are allowed only in drafts; publication rejects them and limits the complete rubric to ten distinct references. Inspect the full canonical draft and its hash before attestation. The actual enabled human reviewer must review technical correctness, junior scope, observable evidence, completeness and the exact question/concept/reference mapping. Any content change requires a new immutable draft/version and review. Promotion appends a consecutive reviewed version in the same question-family policy lineage; it does not rewrite provisional history. AI-generated drafts can never attest human review.

Technical references use the existing ingestion/source permission workflow. After the permitted source contract and exact document are reviewed, an actual human may run `npm run ingestion -- approve-reference RECORD_ID HUMAN_REVIEWER_ID EXACT_CONTENT_HASH` before `publish-document`. The command records document review and technical-reference classification, rejects interview-experience material and cannot relabel already published editorial seed notes. Source permission/license, privacy/confidentiality and publication gates still apply. Index newly approved references through the existing retrieval operator workflow. This phase does not execute any such live approval or corpus re-indexing.

When approved technical references are retrieved but no reviewed rubric exists, the bounded draft endpoint can propose concepts using only those supplied IDs. Express publishes the result as provisional, caps confidence at medium and excludes it from reviewed aggregate. If the reference index is empty, the safe live outcome is `rubric_or_grounding_unavailable` abstention. The configured 48-question seed alone does not meet grading readiness.

Reevaluation appends a revision/supersession under the session lock using the pinned answer and rubric. It preserves original grades, session aggregate and rewards; it cannot restore erased answers or silently promote a rubric. A new published rubric requires explicit review and does not rewrite historical pins. Owned session deletion cascades private attempts/evaluations/evidence; shared knowledge/review history survives. Withdrawal/retirement prevents new use and changes public evidence availability without editing historical grades.

## Verification and limits

`npm run test:evaluation` uses only random disposable databases on `compose.test.yml` PostgreSQL/Redis. Its reviewed/reference assumptions are explicitly fictional. It verifies version/hash approval, evidence/ownership, retry/concurrent duplicate handling, single rewards, reevaluation, coding failures, bounded concept probes and withdrawal/deletion. Backend policy tests, FastAPI strict-output tests and frontend state tests complement the existing schema, persistence, planner, retrieval, ingestion and smoke suites. Never run destructive fixture suites against configured cloud stores.

No real reviewed technical-reference or rubric bank has been approved by this implementation. The previous human attestation covers only the exact Phase 4 question packet. Rubric/reference curation is an operator/content prerequisite, not an engineering fixture result. Persisted structured judgments make future AI–human comparison possible, but no MAE, correlation, agreement, confidence calibration, study or hiring-ranking claim is established. Research remains Phase 11; final visual polish remains Phase 9. Phase 8 has not been started.
