# Versioned PostgreSQL migrations

## CURRENTLY IMPLEMENTED

The existing handwritten `pg` stack now has SQL migrations plus
[a small TypeScript runner](../backend/database/migrations.ts), without an ORM or
new dependency. Run compiled code with the supported Node 20.x baseline.

| File | Effect |
|---|---|
| `001_legacy_baseline.sql` | Adopt the unchanged idempotent five-table bootstrap, preserving populated legacy rows |
| `002_knowledge_foundation.sql` | Add domains, relational knowledge/evidence/durability structures, constraints/triggers/indexes and session ownership FK target |
| `003_junior_taxonomy.sql` | Seed only frozen `junior-se-v1`: eight roots and 24 children |
| `004_controlled_ingestion.sql` | Local adapters, reviewers, quarantine/candidates, experiences, append-only review audit and publication guards |
| `005_pgvector_retrieval.sql` | pgvector, 384d values, generations, eligibility views, identity/withdrawal guards and retrieval lineage snapshots |

Migration filenames use unique ordered `NNN_name.sql` sequences. The runner locks
the database using a fixed session advisory-lock key, creates `schema_migrations`,
checks that applied history is a checksummed prefix of the current files, and
applies each remaining file and history row in **one transaction**. Repeated or
concurrent invocations are no-ops after success. Missing/reordered/edited applied
files fail closed. Migration history creation may remain after a failed first
migration, but a failed migration's DDL/data/history row rolls back together.

The runner uses a 10-second lock timeout and 120-second per-statement timeout and
resets session settings before releasing the pool client. It releases the migration
lock on success/failure. These are bounded SQL operations, not a promise of a single
120-second deadline for a multi-statement migration. A database disconnect releases
its session lock; PostgreSQL rolls back any open transaction.

## Local commands

Configure backend database variables privately as in [SETUP.md](../SETUP.md).
Verify the intended database before applying migrations; commands use that backend
configuration, not an automatically chosen development database.

```bash
cd backend
npm run build
npm run db:migrate
npm run db:migrate  # expected: applied: none
```

The compiled runner locates SQL relative to its module, so deployment does not rely
on shell working-directory lookup. The backend Docker image now includes the
`migrations/` directory alongside `dist/`. The CLI loads backend `.env` when present;
never commit credentials or print connection strings. Output lists names/counts or
a migration filename and safe error code, not SQL/driver payloads.

## Disposable verification

```bash
# From the product root
docker compose -f compose.test.yml up -d --wait postgres redis
cd backend
npm run test:schema
npm run test:persistence
npm run test:smoke
cd ..
docker compose -f compose.test.yml down
```

Unset external database/Redis environment configuration before fixture suites.
`test:schema` rejects these variables, chooses only the fixed localhost fixture,
creates randomly named test databases, and drops only those databases afterward.
It tests clean installation, populated bootstrap adoption, twice/concurrent runs,
history/checksum mismatch, transactional DDL failure/recovery, the compiled CLI,
taxonomy/FKs/checks/immutability, owned CRUD and cascading deletion. Fake technical
references/answers exist only inside those temporary databases. No live provider
or scraped corpus is involved. Linux PostgreSQL CI is configured for the same suite;
existing Windows service checks remain.

## Production startup and forward-only recovery

**Startup continues to verify only the baseline bootstrap. It does not automatically
apply knowledge migrations.** A later reviewed release runs the built CLI before
deploying code that needs the new tables. No production migration/deployment was
performed in Phase 3. For production/staging the CLI requires an explicit command:

```bash
npm run db:migrate -- --apply
```

Use a migration role with appropriate DDL privileges, a verified backup/recovery
plan and a deliberate maintenance/release window. Do not run unreviewed files on a
production URL. Version history cannot determine whether old bootstrap columns were
manually drifted; adoption was verified against the committed baseline, not an
unknown production schema. Resolve detected drift explicitly before deployment.
Use PostgreSQL 16 for the verified baseline (`xid8`/transaction identity is required
for rubric sealing). Verify the managed database version before deployment. Run
migrations separately from simultaneous first-start bootstrap processes; the
migration lock coordinates runners, not the legacy bootstrap.

Policy is **forward-only**: no down command or destructive automatic rollback after
a committed migration. On an unapplied failure, inspect the safe filename/code,
confirm that transaction rolled back, correct the unapplied migration/environment,
then rerun. Restore checksum-identical applied files if history differs. Once
released/applied in a durable environment, never edit an applied migration; use a
new numbered corrective migration. Earlier successful files stay committed when a
later file fails. Do not delete history rows to bypass checksum protection.

All Phase 3 migrations use transactional PostgreSQL DDL. Future operations that
cannot run transactionally (for example concurrent index creation) need an explicitly
reviewed runner/policy extension; do not silently place them in these files.

## PLANNED FOR LATER PHASE

Phase 4 now provides permitted local ingestion (see the addition below). Phase 5 now adds the selected model, compatible embedding values and pgvector
(see below). Phase 6 adds planner execution below; scoring execution and durable job/
outbox dispatch remain later work. These tables are prerequisites only. See
[database schema](database-schema.md) and [the roadmap](implementation-roadmap.md).

## Phase 4 migration — CURRENTLY IMPLEMENTED

`004_controlled_ingestion.sql` adds six import/review/experience/audit tables and
publication/audit gates. Earlier SQL files remain checksum-identical. It inserts
no corpus/questions/rubrics: reviewed data enters through the explicit CLI pipeline,
not startup or migrations. Clean/adopted/repeat/concurrent/rollback/immutability
regressions now test all four files. Test-only failure migration is numbered 005.
Run `test:ingestion` and `test:seed` alongside `test:schema` and baseline checks.
See [ingestion](ingestion.md). No production migration was performed in Phase 4.


## Phase 5 migration — CURRENTLY IMPLEMENTED

Use the checksum-safe explicit migration command after confirming target PG support.
`vector` must be installed on the server and the migrator must be allowed to enable
it. Migration 005 fails with SQLSTATE 55000 and a safe pgvector installation message
when unavailable; it never substitutes fake vectors. Stock PostgreSQL failure is
verified with the optional `without-vector` disposable fixture on port 15433.
Migrations 001–004 are unchanged. No cloud/production migration was performed.

The normal disposable fixture now uses `pgvector/pgvector:0.8.2-pg16` (PostgreSQL 16).
This is the test image pin, not an instruction to update a deployed PG version.
For native installation or supported hosted availability consult the
[official pgvector installation guide](https://github.com/pgvector/pgvector).
Dimension/model changes require a new reviewed forward migration/generation design;
do not edit applied files or reuse incompatible vector space. CLI creation of
embeddings is separate from DDL and publication. See [retrieval](retrieval.md).

## Phase 6 migration

`006_interview_planner.sql` is additive owned plan/session linkage, immutable setup/provenance snapshots and planner-specific invariant guards. Fresh and adopted databases apply six migrations; reapplication is a no-op. Failure-fixture migration is now 007. Migration checksums 001–005 remain unchanged. Rollout still requires the explicit reviewed migration command; no production/staging migration is performed. See [schema](database-schema.md) and [planner](interview-planner.md).

## Phase 7 migration

After the tested 001–006 baseline, explicitly apply `007_rubric_evaluation.sql` using `npm run db:migrate` (production/staging requires `--apply`). It adds immutable rubric draft/hash human approval records, session policy/summary, attempt grading/probe pins, grade classification/feedback/objective metadata and owned code execution evidence. Deferred and immediate constraints check review, confidence, deterministic five-dimension totals, complete concept evidence and consecutive reevaluation lineage. Default legacy policy preserves existing sessions. No corpus, seed, vector generation, permission or review is changed by the migration. Back up/review before release; no destructive rollback/reset is provided. Verify schema plus `test:evaluation` in the disposable fixture environment. [Review workflow](rubric-evaluation.md).
