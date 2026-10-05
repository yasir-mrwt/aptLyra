# Reviewed seed corpus manifest

## CURRENTLY IMPLEMENTED

48 locally authored, original AI-assisted TechVera questions have actual human editorial review from Muhammad Yasir (developer), dated 2026-10-05. The user approved the exact [review packet](seed-review.md), hash `be9d40c94f1941374a7332fd4b15cbe940ab6cc4e58495b4a0877c40cfb7b7cd`. It explicitly pins the JSON input hash `b85d0e09bb94eaf6751a0ae3a86ffb1f76169ee4faf6e314b60f579cee69e995`; all question text/context/category/difficulty/primary mappings were checked for concordance. The [attestation](../backend/data/ingestion/seed-review-attestation.json) preserves this exact scope. No approval for different bytes or other material is implied.

Verified through the real internal CLI on a fresh disposable PostgreSQL database: 48 documents/chunks, 48 published reviewed question versions, zero unreviewed publications, zero fixture candidates, zero company reports and zero rubric versions. That database was removed. This is a reproducible reviewed seed artifact and tested import, **not a claim that any production database has been populated**.

[Machine-readable result](corpus-manifest.json) records the real CLI manifest. Reviewed corpus content hash: `3879eff45a6ee10618b5ce4ec20c50100da42f0bc8934265f8502783264b31ea`. Candidate/source/document/chunk availability gates exclude withdrawals and fixtures. It is not a legal, external-source quality, retrieval relevance or scoring-validity measurement.

| Root | Reviewed questions | Children / questions each |
|---|---:|---|
| `backend-web` | 6 | 3 / 2 |
| `dbms-sql` | 6 | 3 / 2 |
| `design-lite` | 6 | 3 / 2 |
| `dsa` | 6 | 3 / 2 |
| `networks` | 6 | 3 / 2 |
| `oop` | 6 | 3 / 2 |
| `os` | 6 | 3 / 2 |
| `programming` | 6 | 3 / 2 |

### children

| Value | Count |
|---|---:|
| `backend-web.api-contracts` | 2 |
| `backend-web.auth-validation` | 2 |
| `backend-web.persistence-jobs` | 2 |
| `dbms-sql.modeling` | 2 |
| `dbms-sql.queries` | 2 |
| `dbms-sql.transactions-indexes` | 2 |
| `design-lite.reliability` | 2 |
| `design-lite.requirements` | 2 |
| `design-lite.service-data` | 2 |
| `dsa.complexity` | 2 |
| `dsa.search-sort` | 2 |
| `dsa.structures` | 2 |
| `networks.http-dns` | 2 |
| `networks.tls-basics` | 2 |
| `networks.transport` | 2 |
| `oop.composition` | 2 |
| `oop.encapsulation` | 2 |
| `oop.polymorphism` | 2 |
| `os.memory` | 2 |
| `os.process-thread` | 2 |
| `os.synchronization` | 2 |
| `programming.control-data` | 2 |
| `programming.debug-test` | 2 |
| `programming.error-handling` | 2 |

### categories

| Value | Count |
|---|---:|
| `coding` | 5 |
| `conceptual-oral` | 14 |
| `debugging` | 9 |
| `scenario` | 14 |
| `sql` | 2 |
| `system-design-lite` | 4 |

### difficulties

| Value | Count |
|---|---:|
| `easy` | 16 |
| `standard` | 24 |
| `stretch` | 8 |

### sourceClasses

| Value | Count |
|---|---:|
| `authored` | 48 |

### roles

| Value | Count |
|---|---:|
| `Backend Developer` | 48 |
| `Full Stack Developer` | 48 |
| `Software Engineer` | 48 |

### Review status

48 published with actual review; 0 pending/rejected/withdrawn in the isolated seed validation. No fabricated company attribution or recent-occurrence label. All roles have coverage, not a validated role-specific scoring benchmark. Context notes are editorial drafts, not reviewed expected concepts/rubrics.

### Reproduction

```bash
docker compose -f compose.test.yml up -d --wait postgres redis
npm --prefix backend run build
npm --prefix backend run corpus:seed-manifest
npm --prefix backend run test:seed
docker compose -f compose.test.yml down
```

Unset external datastore environment variables before tests. `corpus:seed-manifest` validates artifact binding and counts; `test:seed` validates actual permission/publication and SQL counts with the human attestation, then drops its random database. Fixture-only `test:ingestion` publishes the same question content with a fictional editor solely for control tests, excluded from real corpus counts. Neither suite approves changed material. For an intended persistent import, use the deliberate operator commands in [ingestion](ingestion.md) after separately validating the database/release.

## PLANNED FOR LATER PHASE

No embeddings, RAG, planner, live selection, scoring or confidence computation. Expected concepts/rubrics remain Phase 7 review work; no external company corpus is claimed. The only next recommended phase is Phase 5 after Phase 4 validation/review is complete.
