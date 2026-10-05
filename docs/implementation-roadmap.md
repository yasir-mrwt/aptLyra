# Implementation roadmap after scope freeze

## CURRENTLY IMPLEMENTED

Phase 0 audited/rebranded the product. Phase 1 stabilized existing contracts,
concurrency, speech failures, callback/fetch boundaries and functional Ava states,
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

| Phase | Deliverable and boundary | Functional frontend / Ava work in that phase | Required verification |
|---|---|---|---|
| 3 — Interview knowledge schema (implemented) | Versioned migrations, taxonomy and knowledge/rubric/plan/evidence/answer/embedding-metadata/operation/outbox/reward primitives; legacy JSONB preserved; vector/model deferred | No public contract or user-facing change; internal types/repositories only | Clean/adopted DB, repeat/concurrent migrations, rollback/checksum/CLI, ownership/version and legacy tests verified locally |
| 4 — Interview-data ingestion | Permitted adapters, PII/terms quarantine, review and source/question versions; approved seed corpus; no unrestricted scraping | Source quality/availability and submission consent/status when exposed | Permission, PII, dedupe, timestamp, review, withdrawal and injection fixtures |
| 5 — Embeddings + pgvector retrieval | Versioned embeddings, filtered retrieval/provenance and bounded caches; choose model/index from measurements | Honest evidence/no-evidence status and source attribution where applicable | Model/version mismatch, filters, relevance fixtures, withdrawal invalidation, latency |
| 6 — Interview planner | Persisted deterministic coverage/count/time plan, constraints, source/fallback reasons, stable item IDs | Scoped setup choices, preview/shortage confirmation, planned progress and Ava preparing/transition states | Plan invariants, core-mode budgets, shortages and legacy transport compatibility |
| 7 — Rubric evaluation + confidence | Reviewed/provisional concepts/weights, answer/test evidence, scoring/abstention and distinct confidence semantics | Provisional labels, retry/abstention, question/competency report and delivery separation | Bounded/evidence-linked scores, withheld failures, reviewed aggregation, development-set agreement |
| 8 — End-to-end intelligence integration | Durable operations/outbox/recovery, complete retrieval→plan→answer→rubric→probe→report path; remove crash-stranded flags and reward-loss path | Complete functional Ava turn states, reconnect/retry, probe/original distinction, consistent report/PDF and deletion lifecycle | Real SQL/Redis and provider-fixture E2E, restart/disconnect/idempotency/reward and stale-result tests |
| 9 — Final frontend/Ava redesign and polish | Consistent layout, accessibility, responsive behavior and bundle/performance polish; preserve SVG Ava and working contracts | Cohesive setup/runner/review experience; no delayed backend feature integration | Browser/mic fallback, keyboard/screen-reader, mobile/desktop and performance checks |
| 10 — Testing/security/hardening | Verify final release privacy/retention/delete, TLS, callbacks/replay, fetch trust, dependency risks and failure recovery | Clear consent/deletion/error/retention flows and any necessary security integration | Threat/failure matrix, bounded-load runs, required privacy gates, scoped dependency remediation only if approved |
| 11 — Evaluation/research results | Freeze held-out datasets; run retrieval, scoring, consistency, monotonicity, confidence, system and consented user studies | Study tasks and honest report explanations refined from findings | Publish measured denominators, uncertainty, unmet targets and limitations; no claims from fixture passes alone |
| 12 — Deployment/finalization | Verified production configuration, migration/recovery/runbooks, licensed corpus manifest and final FYP artifacts | Deployed workflow/help links and operational availability | Deployment smoke, backups/restore limits, secret handling, service health and final acceptance evidence |

Phase 9 is visual and interaction polish, not a holding phase for missing functional
UI. Basic consent/accessibility and accurate Ava states accompany each feature.
Required privacy controls are implemented with affected flows and must all be
verified before release; they are not postponed until after a user study.

Optional company/resume/design-lite functionality must fall back clearly to core
practice; missing optional evidence cannot block a valid core interview. Deferred
scope (3D avatar, advanced role banks, multilingual scoring, barge-in, hints) is not
quietly inserted into these phases.

Phase 3 ends with schema/repository verification. The sole recommended next step is
**Phase 4 — Interview-data ingestion**, after explicit authorization. Phase 4 is not
started by this roadmap.
