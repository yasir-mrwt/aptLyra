# Interview planner

## Current behavior

The main dashboard setup now previews an owned persisted `planner-v1` plan before starting practice. Express runs `deterministic-v1`; FastAPI supplies the existing Phase 5 embeddings. Confirmation projects selected reviewed questions into the existing JSONB runner. Evaluation, follow-ups and reports retain their legacy behavior, visibly labeled in preview and runner. This phase adds no scoring, confidence, adaptive-probe policy, durable worker or final character redesign.

## Inputs and validation

Roles: Software Engineer, Backend Developer, Full Stack Developer. Level: junior (0–2 years). English only. Select 1–4 distinct active roots in `junior-se-v1`: dsa, oop, dbms-sql, os, networks, backend-web, design-lite, programming. Request 3–10 originals (at least as many as selected roots), 15–60 minutes, easy/standard/stretch difficulty, oral/coding/mixed mode and Python/JavaScript coding language. SQL questions use SQL. Both form and server validate; the server rejects unknown fields and arbitrary question IDs.

Modifiers are separate from mode. Company and valid occurrence-date bounds remain exact constraints in every stage. Capabilities list only eligible permitted dated reports; the current approved seed has none, so those form controls are unavailable. API requests with unavailable company/date evidence persist a visible non-confirmable shortage. Candidate changes to preferences create a new preview; there is no automatic relaxation. Resume/JD inputs are rejected rather than inferred. Design-lite permits at most one exercise, only in mixed mode. Existing untagged debugging questions remain spoken; executable debugging is not invented from category names.

## Retrieval and fallback

Each sorted root queries Phase 5 with role, taxonomy/root, category/mode, difficulty, prior selections, company/date and expected model/corpus identity. Stages are requested difficulty, adjacent junior difficulty, unchanged reviewed local seed, then deterministic approved templates. The latter are fixed external-key references to unchanged questions already covered by the exact Phase 4 seed approval, not new generated content or a new human approval. Seed identity is the exact approved ingestion input hash plus its authorized non-fixture authored source contract, rather than an operator-chosen registration label. Their internal structured-seed retrieval uses all Phase 5 eligibility, index, generation, provenance and duplicate controls, without a model request or fabricated similarity (similarity is NULL).

Retrieval operations are owned by the candidate/session and linked to the plan. Query text is not stored, only hashes. Item provenance comes from actual selected retrieval results; source quality and dates remain genuine editorial metadata. Provider errors are recorded as shortages; lack of an active compatible complete index is an error, not fabricated evidence. All sources and corpus identity are checked again under the editorial lock during persistence and confirmation. Withdrawn preview provenance is redacted on fresh reads. Confirmed runner reads redact unavailable originals; submission and speech reject those items. Historical persisted snapshots remain unchanged. A response already delivered cannot be recalled; complete stale-result/retention runtime work belongs to the later runtime phase.

Per stage: five returned candidates, pool of twenty duplicate groups. A 45-second elapsed-budget check occurs between retrieval calls; it is not hard cancellation of a running provider call. Browser preview timeout is 90 seconds. These are bounded requests in the API process, with no recovery/outbox guarantee.

## Deterministic allocation

Every selected root must receive an original question. Roots are sorted; slots alternate round-robin. Exclude repeated question families and indexed duplicate groups. Stable ordering considers desired difficulty, fallback stage, estimated minutes, real similarity when present, then question-version ID. Same validated setup and unchanged corpus produce the same versions, ordering and reasons; each independently created plan has its own UUID item identities.

Target requested difficulty count is `round(0.6 × effectiveCount)`, with the remainder adjacent: easy→standard, standard→easy, stretch→standard. For each proposed count, first search for that distribution, then an explicitly labeled difficulty shortfall. Reduce count from requested down to root count before sacrificing coverage. Search is bounded at 50,000 nodes; exhaustion is an explicit retry/error rather than an optimality claim. A mode/coverage failure or missing root yields a non-confirmable correction. Underfilled plans can be confirmed only if every requested root and core mode remain satisfied. Mixed requires actual coding/SQL and spoken/design items. Design-lite never becomes an implicit core mode.

## Time budget

| Item | Minutes |
|---|---:|
| Conceptual oral, scenario, spoken debugging | 3 |
| Coding | 8 |
| SQL | 5 |
| Design-lite | 8 |
| Setup/wrap-up | 2 |
| Probe reserve | 4 total |

Persist question minutes, overhead, total and slack; total must fit requested duration. Count is reduced before dropping coverage. Impossible minimum coverage needs a setup change. These frozen estimates do not enforce a wall-clock deadline or change legacy follow-up behavior. The reserved four minutes is preparatory; no Phase 7/8 probe policy is added.

## Persistence and API

Migration 006 extends Phase 3 relational `interview_plans`/`plan_items` and adds an owned session link. Store setup snapshot, version/model-corpus identity, coverage, difficulty, requested/effective count and duration, shortages, time budget and revision/status. Items have UUID identity, zero-based display position, immutable question version, actual retrieval ID and provenance, category/difficulty/origin/reason/minutes; rubric and parent-probe fields remain nullable and unused. Array positions serve only the existing runner transport, not durable plan identity.

Database guards enforce immutable snapshots/items after creation, owned compatible selected evidence, actual provenance and current availability, coverage/count/difficulty/time agreement, contiguous ordering, mode/category constraints and family/group uniqueness. Creation runs in one transaction; confirmation uses editorial→session lock order. Old contracts remain outside new planner-specific guards. Migrations 001–005 are unchanged.

| Authenticated owned endpoint | Behavior |
|---|---|
| GET `/api/interview-plans/capabilities` | Supported modifiers and eligible company labels |
| POST `/api/interview-plans/preview` | Strict setup; 201 persisted preview; no runnable questions before confirmation |
| GET `/api/interview-plans/:id` | Owned snapshot, metadata/coverage/time/shortages; no question text or answers |
| POST `/api/interview-plans/confirm` | `{planId, revision}` only; recheck compatibility/availability; atomically start linked session |

Cross-user IDs return 404. Authentication is the existing cookie middleware. Preview is limited to ten requests per fifteen minutes. Errors return safe codes/messages without private DB/provider details. Confirm increments revision once; retries at the original or confirmed revision return the same session. Stale unconfirmed plans must be previewed again. Deleting an owned draft/session cascades owned plans/evidence while preserving shared knowledge.

## Frontend and interviewer

Dashboard shows scoped setup; `/plans/:planId` reloads an owned preview. Coverage, effective count/time, distribution, fallback and unavailable evidence are shown before confirmation. No expected answers are exposed. Shortages requiring correction disable confirmation; reduced count/difficulty warnings remain explicit. Waiting reflects real network state with idle/preparing/plan-ready/transitioning/error-retry, disabled duplicate actions and retry paths. Navigation to `/interview/:sessionId` waits for successful server confirmation. Existing speaking/listening/evaluating states and SVG appearance remain.

Name-neutral `AIInterviewer`, `InterviewerState`, `InterviewerPanel`, `InterviewerAvatar` and existing voice hook share a central display profile. The display name remains Ava. Remaining direct character references are in the central profile, landing-page copy/demo hook/comments, welcome email copy and the legacy voice test description; final character changes belong to Phase 9. The landing demo's synthetic animation is still a demo, not planning progress.

## Branding and attribution

README now describes TechVera, distinguishes current planning/legacy evaluation from planned scoring/runtime work, and omits outdated screenshots. Assets remain. Every remaining source occurrence of the upstream name is classified here:

| Location / retained text | Class | Reason |
|---|---|---|
| `render.yaml` two `preptalk-*` service names | B | Existing deployment resource identifiers; renaming requires a deployment migration |
| `backend/controllers/userController.ts` `preptalk/avatars` | B | Existing Cloudinary asset namespace; preserve uploaded asset compatibility |
| `frontend/src/hooks/useInterviewerVoice.ts` `preptalk_interviewer_muted` | B | Persisted mute preference; preserve user settings |
| `frontend/src/hooks/baseline.test.tsx` same key | D | Regression asserting historical preference compatibility |
| `THIRD_PARTY_NOTICES.md` upstream PrepTalk title | C | Honest upstream attribution; original MIT copyright and permission stay in LICENSE |
| This audit's exact retained identifiers/name | D | Maintenance record justifying compatibility, rather than product branding |

Ignored backend/frontend build outputs contain generated copies of the retained asset namespace/preference key. Ignored Ruff caches contain historical paths. These are local artifacts, not staged product branding; dependency/cache/Git history matches are not rewritten. License remains byte-identical. Existing backend MIT/Arnab Dey metadata and external model Apache-2.0 license/NOTICE remain intact. No TechVera-only ownership or new human corpus review is asserted.

## Validation and limitations

Planner tests use the real approved seed, PostgreSQL/pgvector, Redis, authentication and HTTP routes with a controlled embedding fixture. They verify deterministic selection, persistence/invariants, ownership, preview/confirm separation and idempotency, stale and withdrawn data, shortages, fallback, budgets and legacy coexistence. Frontend tests verify setup, pending/retry, warnings, states and confirmation navigation. Regression suites cover ingestion/seed, retrieval, schema, persistence and server smoke. CPU model checks are functional measurements, not held-out quality research. External voice/grading providers and browser microphone/whiteboard interaction are not certified by fixture tests. Corpus coverage remains small and uneven; reviewed rubrics/company reports/technical-reference coverage is zero.

Functional local check: the selected pinned CPU model embedded all 48 approved questions. Two identical mixed-mode previews selected the same five versions/reasons with 36 estimated minutes and explicit difficulty/fallback shortages; measured previews took 2.522 and 2.544 seconds in that run. Confirmation/retry was idempotent. These two samples are not a p95, held-out retrieval evaluation or provider grading measurement.

## Phase 6 preview repair

A complete corpus imported under a different source label previously lost seed/template fallback because the planner and structured strategy assumed one fixed registration key. Seed selection now binds to the Phase 4 approved corpus input SHA-256 and its published ingestion records/authorized authored adapter, while preserving every role/root/company/date/availability/vector/provenance check. Labels do not grant publication authority. Semantic thresholds and planner budgets remain unchanged. Generation/completeness preflight is read in one SQL snapshot, duplicate metadata is read once per hit batch and bounded candidate evidence is inserted in one statement; existing per-row lineage/ownership constraints and transaction rollback remain in force. These changes reduce remote database round trips that could otherwise exhaust the between-stage planning budget. Existing plans, generations and migrations 001–006 are untouched.
