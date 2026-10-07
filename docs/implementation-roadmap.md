# Implementation roadmap after scope freeze

## CURRENTLY IMPLEMENTED

Phase 0 audited/rebranded the product. Phase 1 stabilized existing contracts,
concurrency, speech failures, callback/fetch boundaries and functional Lyra states,
with deterministic and real-datastore verification. Phase 2 freezes scope and
documents the target; it implemented no intelligence pipeline or schema. Phase 3
now provides migrations, taxonomy, relational prerequisites, internal repositories
and real PostgreSQL verification, without intelligence execution or new user-facing
behavior. See [database schema](database-schema.md) and [migrations](migrations.md).

## PLANNED FOR LATER PHASE

The final domain is governed by [final scope](final-scope.md),
[target architecture](target-architecture.md), [taxonomy](competency-taxonomy.md),
[evaluation design](evaluation-design.md), and [data/privacy](data-and-privacy.md).
Each later phase still requires its own explicit prompt/authorization. This roadmap
does not authorize starting the next phase or adding dependencies now.

| Phase | Deliverable and boundary | Functional frontend / Lyra work in that phase | Required verification |
|---|---|---|---|
| 3 — Interview knowledge schema (implemented) | Versioned migrations, taxonomy and knowledge/rubric/plan/evidence/answer/embedding-metadata/operation/outbox/reward primitives; legacy JSONB preserved; vector/model deferred | No public contract or user-facing change; internal types/repositories only | Clean/adopted DB, repeat/concurrent migrations, rollback/checksum/CLI, ownership/version and legacy tests verified locally |
| 4 — Interview-data ingestion (implemented and verified locally) | Permitted adapters, PII/terms quarantine, review and source/question versions; approved seed corpus; no unrestricted scraping | Source quality/availability and submission consent/status when exposed | Permission, PII, dedupe, timestamp, review, withdrawal and injection fixtures |
| 5 — Embeddings + pgvector retrieval (implemented) | Pinned measured local CPU model, versioned vectors, filtered two-channel retrieval/provenance/evidence; cache deferred | Internal primitives only; no live interview/UI change | Real 48-question embedding, 32-query development benchmark, contract/filter/withdrawal fixtures and baseline regressions |
| 6 — Interview planner | Persisted deterministic coverage/count/time plan, constraints, source/fallback reasons, stable item IDs | Scoped setup choices, preview/shortage confirmation, planned progress and Ava preparing/transition states | Plan invariants, core-mode budgets, shortages and legacy transport compatibility |
| 7 — Rubric evaluation + confidence (implemented; live grading awaits reference/rubric curation) | Reviewed/provisional concepts/weights, answer/test evidence, scoring/abstention and distinct confidence semantics | Provisional labels, retry/abstention, question/competency report and delivery separation | Bounded/evidence-linked scores, withheld failures, reviewed aggregation, development-set agreement |
| 8 — End-to-end intelligence integration | Durable operations/outbox/recovery, complete retrieval→plan→answer→rubric→probe→report path; remove crash-stranded flags and reward-loss path | Complete functional Lyra turn states, reconnect/retry, probe/original distinction, consistent report/PDF and deletion lifecycle | Real SQL/Redis and provider-fixture E2E, restart/disconnect/idempotency/reward and stale-result tests |
| 9 — Final frontend/Lyra redesign and polish | Consistent layout, accessibility, responsive behavior and bundle/performance polish; preserve SVG Lyra and working contracts | Cohesive setup/runner/review experience; no delayed backend feature integration | Browser/mic fallback, keyboard/screen-reader, mobile/desktop and performance checks |
| 10 — Testing/security/hardening | Verify final release privacy/retention/delete, TLS, callbacks/replay, fetch trust, dependency risks and failure recovery | Clear consent/deletion/error/retention flows and any necessary security integration | Threat/failure matrix, bounded-load runs, required privacy gates, scoped dependency remediation only if approved |
| 11 — Evaluation/research results | Freeze held-out datasets; run retrieval, scoring, consistency, monotonicity, confidence, system and consented user studies | Study tasks and honest report explanations refined from findings | Publish measured denominators, uncertainty, unmet targets and limitations; no claims from fixture passes alone |
| 12 — Deployment/finalization | Verified production configuration, migration/recovery/runbooks, licensed corpus manifest and final FYP artifacts | Deployed workflow/help links and operational availability | Deployment smoke, backups/restore limits, secret handling, service health and final acceptance evidence |

Phase 9 is visual and interaction polish, not a holding phase for missing functional
UI. Basic consent/accessibility and accurate Lyra states accompany each feature.
Required privacy controls are implemented with affected flows and must all be
verified before release; they are not postponed until after a user study.

Optional company/resume/design-lite functionality must fall back clearly to core
practice; missing optional evidence cannot block a valid core interview. Deferred
scope (3D avatar, advanced role banks, multilingual scoring, barge-in, hints) is not
quietly inserted into these phases.

Phase 3 ended with schema/repository verification. Phase 4 was subsequently
authorized and its implementation evidence is recorded below. This roadmap starts
no subsequent phase.

## Phase 4 implementation evidence

CURRENTLY IMPLEMENTED: controlled local import/review CLI, rights and exact-byte
permissions, bounded normalization/PII/injection screening, duplicate review,
versioned publication/withdrawal and consented experience-record storage. The 48
original seed questions have Muhammad Yasir's exact-scope approval and a verified
real-CLI disposable import across eight roots/24 children. See [ingestion](ingestion.md)
and [manifest](corpus-manifest.md). HTTP adapters, public submissions and automated
purge scheduling are deferred explicitly.

No candidate-facing Phase 4 behavior; reviewed corpus is preparatory for Phase 5/6.
Phase 4 required persistence/smoke verification subsequently passed in disposable
local fixtures. Phase 5 was explicitly authorized and its evidence is recorded below.


## Phase 5 implementation evidence

The real approved 48-question corpus was embedded through the FastAPI/backend CLI
in disposable pgvector; a repeat skipped all 48 compatible vectors. All 32 manually
defined development queries found their expected question in the top five; this is
not a held-out evaluation. Filters, mismatch/no-evidence, duplicate/family controls,
lineage and withdrawal were verified. CPU inference and PostgreSQL latency are
reported in [the benchmark](retrieval-benchmark.md). New AI typing passes; full
service typing retains 29 pre-existing errors confirmed at the Phase 4 commit.

No live interview behavior change in Phase 5; retrieval is ready for the Phase 6 planner.
Phase 6 was subsequently authorized; its implementation boundary is recorded below.

## Phase 6 implementation evidence

CURRENTLY IMPLEMENTED: deterministic retrieval-backed coverage/time/difficulty allocation; immutable owned plan/items/evidence, explicit fallbacks/shortages, scoped frontend setup and persisted preview/confirmation with truthful interviewer states. README now presents TechVera; required attribution and compatibility identifiers remain documented. Confirmed originals use the existing JSONB runner and legacy evaluator; this is not full runtime or scoring replacement. See [planner](interview-planner.md). This records the Phase 6 boundary. Phase 7 was subsequently authorized and is described below.

## Phase 7 implementation evidence

Versioned draft/review/rubric/concept/answer/evaluation/evidence linkage, separate evaluator confidence, low-confidence abstention, backend/SQL deterministic scoring, coverage-gated reviewed originals, coding execution evidence and bounded concept probes are implemented. Runner/review/PDF/analytics show truthful classifications and preserve legacy scores. Required regression suites use disposable SQL/Redis and strict provider fixtures; live scoring readiness still requires genuine reviewed technical references and rubrics. The existing 48-question approval covers question content only. [Operator readiness](rubric-evaluation.md) describes the remaining content work. No research/calibration conclusions follow from engineering tests. At Phase 7 completion, Phase 8 required explicit authorization; it was subsequently authorized and is recorded below.

## Pre-Phase-8 product identity decision

The current product is Aptlyra and its interviewer is Lyra. Earlier phase names in this document are historical evidence. This focused rebrand preserves the React/Vite, Express, FastAPI, PostgreSQL and Redis architecture, corpus approvals, scoring policy and persisted identifiers. Hannah is the default English Orpheus voice, with environment overrides and browser fallback retained. Metadata and email public origins are operator configured. See [branding operations and audit](branding.md) and [voice audition](voice-audition.md). This records the pre-Phase-8 rebrand boundary; the subsequently authorized Phase 8 work is recorded below.

## Phase 8 implementation evidence

The Aptlyra integration runtime is implemented: received claims, SQL-backed operations/outbox, BullMQ workers, lease/revision/current-evidence fencing, bounded retry/manual recovery, once-only extraction/pins, durable concept-probe reservations, immutable finishing/report snapshots, atomic SQL rewards and authoritative client recovery. Disposable tests cover real independent processes, duplicate delivery, SIGKILL, Redis flush, publication failure and finishing restart; provider/reference/rubric fixtures are explicitly fictional. Package/Compose application labels and the already-renamed Aptlyra origin are verified. Local folder rename remains the documented final manual action because the user constrained edits to `techvera/`. Current question-only corpus still abstains; no new scoring review is fabricated. See [runtime/recovery](runtime-recovery.md). Recommend Phase 9 only after explicit authorization; no Phase 9 work has begun.
