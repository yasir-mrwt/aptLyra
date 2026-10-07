# Remaining tracked and new-source branding inventory

Generated from case-insensitive source inspection after the focused rebrand. All current visible A/B identity was migrated. See [audit definitions and compatibility rationale](branding.md). This inventory excludes generated/ignored files, which are classified separately in the private completion report. Regression strings are internal test inputs/assertions, not displayed identity.

| File | Lines containing a former name or identifier | Class |
| --- | --- | --- |
| `.github/workflows/ci.yml` | 17, 18, 19, 23, 28, 29, 30, 34 | C |
| `ARCHITECTURE.md` | 169, 201, 214 | C |
| `DEPLOYMENT.md` | 140 | C |
| `SETUP.md` | 60, 61, 298, 376, 465 | C |
| `THIRD_PARTY_NOTICES.md` | 5 | D |
| `backend/controllers/userController.ts` | 525 | C |
| `backend/data/ingestion/seed-review-attestation.json` | 16 | F/C |
| `backend/data/ingestion/seed-source-contract.json` | 6, 9, 11 | F/C |
| `backend/database/migrations.ts` | 27, 64 | C |
| `backend/ingestion/seedManifest.ts` | 9, 29 | F/C |
| `backend/migrations/005_pgvector_retrieval.sql` | 4 | C |
| `backend/services/emailService.test.ts` | 18, 33 | C |
| `backend/tests/evaluation.test.mjs` | 43 | C |
| `backend/tests/ingestion.test.mjs` | 21, 22, 23, 32, 59, 280 | C |
| `backend/tests/persistence.test.mjs` | 11 | C |
| `backend/tests/pgvector-unavailable.mjs` | 7, 8, 9, 13 | C |
| `backend/tests/planner.test.mjs` | 16 | C |
| `backend/tests/retrieval-benchmark.mjs` | 12, 74 | C |
| `backend/tests/retrieval-fixture.mjs` | 8, 11, 12, 13, 33 | C |
| `backend/tests/retrieval.test.mjs` | 93 | C |
| `backend/tests/runtime-worker-child.mjs` | 5 | C |
| `backend/tests/schema.test.mjs` | 17, 18, 21, 22, 104, 137 | C |
| `backend/tests/seed-publication.mjs` | 35, 36, 37, 38, 53, 69 | C |
| `backend/tests/server-smoke.mjs` | 11, 13 | C |
| `compose.test.yml` | 6, 7, 9, 13, 30, 31, 32, 36, 55 | C |
| `docs/branding.md` | 73, 74, 83, 87, 108, 111, 121, 133 | F |
| `docs/corpus-manifest.md` | 5 | F |
| `docs/decisions.md` | 22, 48, 81, 166 | F |
| `docs/implementation-roadmap.md` | 26, 78, 90 | F |
| `docs/ingestion.md` | 92 | F |
| `docs/interview-planner.md` | 59, 63, 67, 68, 69, 71, 74 | F |
| `docs/source-policy.md` | 7 | F |
| `frontend/src/constants/brand.test.tsx` | 24 | C |
| `frontend/src/hooks/baseline.test.tsx` | 152 | C |
| `frontend/src/hooks/useInterviewerVoice.ts` | 14 | C |
| `render.yaml` | 4, 56 | C |
| `scripts/branding-audit.mjs` | 7, 18, 19 | C |

License/attribution, approved seed/review bytes, migrations and lockfile hashes are verified by `node scripts/branding-audit.mjs`. Broad `ava` substrings in ordinary words and binaries are not interviewer names. No environment contents or secret values appear in this inventory.
