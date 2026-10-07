# Aptlyra product identity and operations

Product: **Aptlyra**. Interviewer: **Lyra**. Temporary monogram: **A**.
Tagline: **Practice with evidence. Improve with confidence.**
Positioning: **Evidence-grounded AI technical interview practice for junior software engineers.**
Frontend identity lives in `src/constants/brand.ts`; backend email identity lives
in `config/brand.ts`. The AI service exposes the current product in its root and
OpenAPI title. The React/Vite, Express, FastAPI, PostgreSQL and Redis stack is unchanged.
The original rebrand preceded Phase 8. The current durable runtime is documented
in [runtime recovery](runtime-recovery.md); final visual design remains Phase 9 work.

## Email P diagnosis and sender operations

The application-controlled P was a literal initial in the shared transactional
HTML shell in `backend/services/emailService.ts`. It now uses the A monogram and
Aptlyra. OTP, verification, welcome, reset and password-changed subjects, text and
HTML share the current product identity. Welcome introduces Lyra. Nodemailer
parses the configured `EMAIL_FROM` mailbox, replaces only its display name with
Aptlyra, and preserves the SMTP mailbox fallback. Multiple mailboxes or injected
headers are rejected. Authentication token and expiration behavior is unchanged.

This code cannot change a Gmail/SMTP account photo, recipient contact photo, or
cached inbox avatar. If an inbox still shows P: in the sender Google account open
**Manage your Google Account → Personal info → Photo** and update its image;
update **Name** to the desired sender identity where appropriate. In Gmail open
**Settings → See all settings → Accounts and Import → Send mail as → Edit info**
and set the sender display to Aptlyra. For another SMTP provider, update its sender
identity/profile in that provider's dashboard. Recipient contact photos and
cached avatars may need separate updates. No provider account or inbox avatar
was changed or claimed verified by this phase. Test templates locally without
delivering real messages.

## Public origin and domain readiness

No domain ownership, purchase or trademark clearance is claimed. Preference order:

1. `aptlyra.com`
2. `aptlyra.app`
3. `getaptlyra.com`
4. `tryaptlyra.com`
5. `aptlyra.dev`

When a domain is selected, set frontend `VITE_PUBLIC_URL` to its HTTP(S) origin
and rebuild. Blank configuration omits canonical and OG URL tags. Credentials,
paths, queries and fragments are rejected. Title, description, Open Graph and
Twitter summary metadata use central truthful identity. Only the public landing
page has a canonical; auth and private routes use `noindex,nofollow` and never
include private session IDs in metadata. No PWA manifest or structured metadata
existed, so none was invented for this rebrand.

Set backend `PUBLIC_FRONTEND_URL` to the single public origin for welcome/reset
links; otherwise the first `FRONTEND_URL` origin remains the fallback. Keep backend
`FRONTEND_URL` as the configured CORS allowlist, frontend `VITE_API_URL` as the API
origin/path, and backend `AI_SERVICE_URL` and `BACKEND_URL` as the internal AI and
callback origins. Configure AI `ALLOWED_ORIGINS` accordingly. Update Google Cloud
OAuth client **Authorized JavaScript origins** for the chosen frontend and
provider redirect URIs only where the deployed integration requires them. The
current frontend uses credential-based Google sign-in; no new redirect route was
added. Configure HTTPS, DNS and provider settings separately before deployment.

## Compatibility and historical branding audit

Audit classes: A current product display; B current interviewer display;
C internal/compatibility; D legal attribution; E generated/cache/dependency;
F historical documentation/evidence. Current A/B occurrences were migrated.
Run `node scripts/branding-audit.mjs` from the product root to reject current
source leaks and verify protected artifacts against HEAD.

Intentionally retained old names:

| Files/occurrences | Class | Reason |
| --- | --- | --- |
| `frontend/src/hooks/useInterviewerVoice.ts`, baseline test: `preptalk_interviewer_muted` | C | Existing browser mute preference remains readable |
| `backend/controllers/userController.ts`: `preptalk/avatars` | C | Existing uploaded asset namespace |
| `render.yaml`: service names | C | Existing deployment resources; require separate migration |
| Backend migration runner's advisory-lock name, migrations 001–007 | C | Stable database coordination/history; never renamed |
| Disposable fixture database/user identifiers and earlier temporary paths | C | Stable fixture contracts; package names and the Compose project were migrated in Phase 8 |
| Reviewed ingestion JSON, source IDs, `seedManifest.ts`, corpus manifests, seed-review packet/attestation | F/C | Exact approved authorship/provenance and hashes; not reapproved or relabeled |
| Retrieval/ingestion/seed tests and migration-error assertions | C/F | Fixture provenance and stable migration behavior |
| Branding negative assertions and legacy-email test input | C | Regression checks intentionally exercise former names |
| `LICENSE`, `THIRD_PARTY_NOTICES.md`, original author/package metadata | D | Unchanged upstream copyright and attribution |
| Prior phase scope/planner/roadmap decisions, historical evidence JSON and screenshots | F | Factual old product names remain historical truth |
| Local folder paths and current commands | C | Local folder remains `techvera/` under the direct edit boundary; origin is now Aptlyra |
| This migration/audit documentation | F/C | Explains historical identity and retained compatibility |
| Ignored real environment files | C | Operator configuration stays private; sender display is normalized in code |
| `dist/`, `.venv/`, `node_modules/`, caches, binary dependencies | E | Rebuild generated outputs; never edit third-party/generated bytes manually |
| Broad `ava` substring matches in `available`, `JavaScript`, `avatar`, algorithms/dependencies | C/E | False positives, not interviewer identity |

The earlier planner document's classification letters describe its historical
Phase 6 audit; the A–F definitions above describe this migration. Required legal
and approved corpus artifacts remain byte-identical. No reset, reseed, re-embed,
schema change or scoring-policy change is part of the rebrand.

## Phase 8 repository and filesystem status

The user renamed the remote before this phase. `origin` is now
`https://github.com/yasir-mrwt/Aptlyra.git`; `git ls-remote origin HEAD` and
`git fetch origin` succeeded, and `main` tracks `origin/main`. No remote rename,
credential setup, commit or push was performed by the agent.

Package identities now use `aptlyra-backend` and `aptlyra-frontend`; only their
matching root lockfile names changed. Dependency versions/resolutions, license and
author metadata remain unchanged. The disposable Compose project uses
`aptlyra-baseline`; fixture database/user identifiers remain compatible. The CI
workflow uses Aptlyra and runs the additional runtime/E2E checks. Existing hosted
resource IDs and exact reviewed ingestion/source/migration identifiers remain unchanged.

No product-source filename is literally branded TechVera/Ava. The broad filename
search's `InterviewerAvatar`, `pgvector-unavailable`, JavaScript, availability and
dependency matches are generic words or generated dependencies. Do not rename them
as interviewer names. The current product folder is still `techvera/` because the
user explicitly restricted edits to that directory. A move to sibling `aptlyra/`
is the final manual action requiring a broader filesystem boundary; it was not
performed implicitly.

After all product processes are stopped and the target directory is confirmed
absent, the exact final manual move from the workspace parent is:

```sh
cd /Users/yasir/Developer/Shahab-fyp
mv techvera aptlyra
cd aptlyra
git remote -v
git branch -vv
git diff --check
```

Reopen the IDE/workspace at the new path. Review external absolute paths, storage
mounts, saved resume/media references and workspace-root instructions before
restarting; do not change credential values, approved source IDs or stored resource
identities. Relative `backend/`, `frontend/`, `ai-service/`, `.env` and uploads paths
remain relative to the product root. Current examples retain the working
`techvera/` path until this manual step. Historical evidence must retain its original
paths/names. This phase neither deploys nor begins Phase 9.
