# Phase 9.5 Update — AI Editorial Source Workflow

## Phase Status

Completed.

## Goal

Add human-reviewed, AI-assisted editorial proposals for interview question content without allowing the model to approve, publish, or change scoring eligibility. Preserve the permission-first source collection workflow.

## Work Completed

- Added a bounded `editorial-review-v1` proposal contract to the AI service. It validates taxonomy/category allowlists, conservative verdict rules, and a required human-review flag.
- Added backend candidate review that checks reviewer authorization and the exact current content hash, limits evidence passed to AI according to source permissions and consent, derives reference eligibility from reviewed database state, and stores each proposal as an immutable version with an audit event.
- Exposed the latest proposal in the review queue and seed review data, and added review/rerun controls to the editorial console. These controls leave the existing human approval and publication gates unchanged.
- Added migration 013 for append-only AI review packet storage and the `ai-review-proposed` audit action.
- Documented the workflow, collection boundaries, and human review requirements in `docs/editorial-ai-review.md`.

## Files Created

- `backend/migrations/013_ai_editorial_review.sql` — immutable, content-hash-bound proposal storage and audit action support.
- `docs/editorial-ai-review.md` — workflow, permission, collection, and human-review documentation.
- `docs/phase-9a-update.md` — this completion report.

## Files Modified

- `ai-service/app/api/content_extraction.py` — proposal schema, safety validation, and AI review route.
- `ai-service/tests/test_content_extraction.py` — review contract and validation tests.
- `backend/contentIntelligence/editorial.ts` — authorized candidate review, persistence, audit, and proposal retrieval.
- `backend/contentIntelligence/sourceRegistry.ts` — source collection status returned to the editorial console.
- `backend/routes/contentIntelligenceRoutes.ts` — candidate AI-review endpoint.
- `backend/services/aiService.ts` — typed internal AI review request.
- `backend/tests/content-intelligence-e2e.mjs` — persistence, versioning, stale-hash, and review-safety coverage.
- `backend/tests/schema.test.mjs` — migration 013 schema and constraints coverage.
- `backend/tests/seed-publication.mjs` — seed review API and human-gate coverage.
- `docs/migrations.md` — migration 013 documentation.
- `frontend/src/pages/ContentEditorialConsole.tsx` — proposal display and rerun controls, plus source collection state.

## Database Changes

Migration 013 adds `candidate_ai_review_packets`, an index for latest exact-hash proposals, an append-only trigger, and the `ai-review-proposed` review event action. No external database was used; database suites ran against disposable local compose fixtures.

## API Changes

Added `POST /api/content-intelligence/review/candidates/:id/ai-review`. It requires a linked reviewer and the current candidate content hash. Each accepted request appends a proposal and audit event; it does not approve or publish content.

## Dependencies

No dependencies added, removed, or upgraded.

## Tests and Validation

- `npm run test:schema` — passed, 17 tests.
- `npm run test:content-intelligence` — passed, 10 tests.
- `npm run test:content-e2e` — passed, including proposal versioning and stale-hash rejection.
- `npm run test:seed` — passed; verified the 48-question seed review path without fabricating human approvals.
- `./.venv/bin/python -m pytest -q tests/test_content_extraction.py` from `ai-service/` — passed, 11 tests.
- `npm run build` and `npm run typecheck` from `backend/` — passed.
- `npm run build` from `frontend/` — passed; Vite reported the existing large-chunk warning.
- `git diff --check` — passed.

## Problems Found

The frontend build completes with a warning that some generated chunks exceed 500 kB. It does not block this phase and is outside its scope.

## Remaining Work

None for Phase 9.5. Human review, technical-reference approval, rubric approval, and embedding requirements remain separate gates by design.

## Git Diff Summary

Three files created for the migration, workflow documentation, and this report; eleven implementation/test/documentation files modified. No Phase 10 work started.

## Recommended Next Step

Proceed to Phase 10 only when explicitly requested.
