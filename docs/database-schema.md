# Database schema — Phase 3 foundation

## CURRENTLY IMPLEMENTED

Three explicit SQL migrations and a checksum-verified TypeScript runner adopt the
five existing tables, add 27 preparatory knowledge/evidence/durability tables and
seed `junior-se-v1` (8 roots, 24 children). `schema_migrations` is an additional
runner-owned history table. Express/backend repositories own all durable writes;
FastAPI has no PostgreSQL credentials or schema access. The current interview path
still writes legacy session JSONB and uses its existing scores/background work.

No Phase 3 user-facing behavior change; schema is preparatory.

The executable schema is [002_knowledge_foundation.sql](../backend/migrations/002_knowledge_foundation.sql);
the unchanged baseline is [001_legacy_baseline.sql](../backend/migrations/001_legacy_baseline.sql),
and the only seed is [003_junior_taxonomy.sql](../backend/migrations/003_junior_taxonomy.sql).
Migration history is created by [the runner](../backend/database/migrations.ts).
See [migration operations](migrations.md) before applying anything.

## Entity ownership and relationships

| Table | Purpose and durable relationships |
|---|---|
| `schema_migrations` | Applied filename/SHA-256/time; runner writes once per successful transaction |
| `taxonomy_versions` | Reviewed hierarchy release identity and active/deprecated lifecycle |
| `competencies` | Versioned stable root/child IDs, names/descriptions, parent, ordering, timestamps and deprecation |
| `sources` | Editorial source identity/type/origin, permission/license/terms evidence, attribution, review and enabled/suspended state |
| `source_documents` | Stable external identity scoped to a source |
| `source_document_versions` | Immutable published content/hash, separate occurrence/publication/fetch/review dates, rights/PII/confidentiality/quality and withdrawal |
| `source_chunks` | Versioned bounded excerpts/hash/chunker/offsets; source-version relation and retirement/redaction |
| `interview_questions` | Stable family identity and primary child competency |
| `question_versions` | Text/category/difficulty/origin/hash, primary taxonomy, adaptation base, generation metadata and publication/review snapshot |
| `question_version_competencies` | Secondary child tags from the same taxonomy |
| `question_provenance` | Real document-version/optional same-document chunk lineage and origin/grounding/editorial relationship |
| `rubrics` | Stable rubric identity for a question family |
| `rubric_versions` | Exact question version, known/provisional kind, reviewed/provisional/retired status, policy, reviewer/time and fatal-rule metadata |
| `rubric_dimensions` | Six dimension anchors/applicability/weights and technical vs delivery aggregation kind |
| `expected_concepts` | Stable keys/IDs within rubric version, importance/essential/critical flags, alternatives and observable anchors |
| `concept_references` | Reviewed permitted technical-reference chunks supporting each concept |
| `interview_plans` | Owned session/configuration, contract/planner/taxonomy/corpus versions, counts/duration/distribution/coverage/modifiers/budgets/shortages and revision |
| `plan_competencies` | Selected root IDs from the plan's taxonomy |
| `plan_items` | Stable ordered question/rubric selections, pinned category/difficulty/origin, retrieval reason, estimated time, parent probe and lifecycle |
| `retrieval_evidence` | Operation identity, optional owned session/plan, bounded redacted query/hash/filters, model/corpus/policy metadata, outcome and cache-hit flag |
| `retrieval_results` | Ranked question-version or chunk hits with bounded similarity and selection/exclusion reason |
| `answer_attempts` | Owned item/attempt identity, bounded text/code and media references, processing and redaction/deletion status |
| `evaluations` | Answer/question/rubric/policy pins, revision/supersession, status, nullable technical score, confidence/reasons, dimensions, separate delivery and model/prompt metadata |
| `evaluation_evidence` | Same-rubric concept judgment, answer span/test/artifact explanation and permitted concept-reference chunk |
| `embedding_metadata` | Question-version or chunk identity plus purpose/model/revision/dimension/normalization/hash/generation/status; no vector values |
| `durable_operations` | Owned stable/idempotent operation identity, status/attempts/lease/deadline/hash/revision/error; no executor |
| `transactional_outbox` | Owned session event/revision/bounded payload/publication attempts; no dispatcher |
| `reward_ledger` | Owned session/reward-key uniqueness and amount; no changes to existing XP delivery |

Global knowledge writes are internal editorial primitives; a future authenticated
admin/ingestion boundary must enforce who may review sources. Private writes take
an explicit caller owner. Composite foreign keys enforce ownership independently
of repository checks: plan→owned session, item→plan/session/user, answer→item and
question, evaluation→answer/rubric/question/policy, evidence→evaluation/concept/rubric.
Scope ownership is not delegated to an LLM. These checks supplement cookie auth
when APIs are added later; this phase exposes no new routes.

## Enforced structural rules

- Each competency key is `(taxonomy_version,id)`. Children must use their root prefix
  and reference a root in that release. Questions use child IDs; plans select roots.
  Deprecation preserves foreign keys; no specialist seed or historical backfill.
- Source enabling needs permitted/approved status, terms/permission evidence and
  review identity/time. Publishing a document needs an enabled permitted reviewed
  source, approved document rights/review, completed PII/confidentiality review and
  reviewer/time. Dates stay nullable and are never inferred from fetch time.
- Published question versions, lineage and secondary tags cannot be edited/deleted;
  content changes create another version. Available published provenance requires
  actual document-version links. Generated versions may explicitly lack provenance.
- Published source content/chunks are immutable except documented withdrawal or
  retirement with content redaction. IDs/hashes survive withdrawal for historical
  trace; withdrawn documents/retired chunks cannot be reactivated. This is a storage
  primitive, not a scheduled retention/withdrawal cache-cleanup pipeline.
- A rubric pins a published question version and has six distinct dimensions with
  anchors 0–4. Applicable technical weights sum to 100 at transaction commit;
  correctness/coverage/reasoning are applicable with positive weight. Communication
  clarity is delivery-only with weight zero. No application score calculation or
  hard-coded default weights were added.
- Known rubrics require reviewer/time; provisional rubrics cannot carry these human
  review fields. Concept review matches kind and every concept has a reviewed,
  permitted technical reference. A retired version keeps its original kind/review.
- Rubrics and children are created atomically. `creation_transaction` records the
  creation transaction's PostgreSQL `xid8`; children can be built only in that
  transaction. Later status retirement cannot unlock existing concepts/weights.
  Promotion or any content change creates a new rubric version.
- Plan item position is unique per plan. Question metadata and optional rubric must
  match the pinned question exactly. A probe has a same-plan original parent, at
  most one probe per original, and no recursive probe chain. Full time/coverage
  feasibility and the two-per-session adaptive policy remain later planner logic.
- Retrieval hits reference exactly one real question version or chunk; ranks are
  unique and 1–100, similarity −1..1. Personal session/plan context must match owner.
- Scores are nullable and 0–100. Succeeded evaluations need high/medium confidence;
  abstained evaluations need no score, low confidence and reasons; pending/failed
  evaluations cannot hold scores/confidence. Provisional rubrics cannot yield high
  confidence. Supersession stays within an answer and increases revision. Terminal
  evaluation rows cannot be changed; a new revision records reevaluation.
- Evaluation dimension values supplied are numeric 0–4 with known keys; concept
  evidence belongs to the same rubric, and cited reference chunks must support that
  concept. This validates stored shape, not semantic correctness/evidence sufficiency.

`knowledge_hash` requires lowercase 64-character SHA-256 syntax. `knowledge_json`
limits structured payloads to 64 KiB of PostgreSQL JSON text, with object/array checks
per field. Chunk excerpts are ≤16,000 bytes; question text ≤16,000 bytes; source
normalized text ≤1 MiB; answer/code text ≤200,000 bytes each. Media stays outside
PostgreSQL as bounded references. A format check does not verify a content hash or
remove PII; later ingestion/evaluation code must do that work.

Primary/unique keys, FK target uniques and named indexes support the relationships;
explicit indexes cover competency parents, source/document versions and hashes,
question selection/families/provenance, owned plans/retrieval/answers, evaluation
evidence, embedding entity/generation deduplication, leases and pending outbox rows.
They are access-path prerequisites, not measured performance claims. The private
Phase 3 report inventories every PostgreSQL-created constraint/index name; all
definitions are also present in SQL and the runner's history DDL.

## Legacy compatibility and private deletion

The five baseline tables and bootstrap SQL remain intact. The only baseline-table
alteration is `sessions`' redundant `(id,user_id)` unique constraint for composite
ownership foreign keys. No new session column is required: `sessionStorageKind`
returns `legacy` when an owned session has no relational plan, `versioned` when a
plan exists, or null for absent/unowned sessions. Real baseline creation never
creates plans, so current sessions remain legacy. The helper is internal only.

Existing JSONB questions/scores stay readable and unchanged, including older broad
roles/seniority. No source/rubric/confidence is invented. Later versioned flows will
write relational authority and compatible JSONB projections in the same database
transaction; future reports label legacy technical/delivery scoring separately.
Current report/API shapes and Ava behavior are unchanged, so no fake labels or
future controls were added now.

Session/user deletion cascades scoped plans/items/retrieval/answers/evaluations/
evidence/operations/outbox/rewards; shared questions, rubric and source history
remain. Answer redaction requires cleared text/code/artifact refs plus timestamp.
External files/provider data, browser drafts, backup erasure and minimal replay
tombstones need the later privacy workflow; cascade tests do not claim full erasure.

## PLANNED FOR LATER PHASE

No source corpus, questions or rubrics are seeded. No ingestion, vector search,
planner, scorer, evaluator-confidence computation, queue executor/dispatcher,
crash-safe XP migration or retention jobs exist. `embedding_metadata` stores metadata
only: stock disposable PostgreSQL 16.15 has no available `vector` extension. Actual
extension, dimension-specific column/index and embedding model remain Phase 5
decisions after availability/measurement review. No model is selected by this phase;
the test-only dimension/model placeholders are fixtures.

Full context/filter population, publish/review authorization, semantic/provenance
quality checks, plan completeness, confidence gates and recovery/deletion policies
remain governed by [the frozen design](target-architecture.md) and
[roadmap](implementation-roadmap.md). The storage foundation does not turn on those
capabilities. SQL administrators can disable triggers; use least-privilege application
and migration roles in the final deployment rather than treat schema checks as admin
security isolation.
