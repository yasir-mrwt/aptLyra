# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in TechVera, please report it privately rather than opening a public issue. Email the maintainer with a description of the issue and steps to reproduce it. Reports are reviewed promptly, and fixes are prioritized based on severity.

Please do not disclose the vulnerability publicly until a fix has been released.

## Handling of Secrets

TechVera integrates with several third-party services, each of which requires credentials. These credentials must never be committed to the repository.

- All `.env` files are excluded from version control through `.gitignore`.
- Each service ships an `.env.example` that lists the required variable names with placeholder values only.
- Before pushing to a public repository, confirm that no real credentials are tracked:

  ```bash
  git ls-files | grep -E '\.env$'   # should return nothing
  ```

If a credential is ever exposed — in a commit, a screenshot, or a shared log — treat it as compromised and rotate it immediately. This applies to:

- The Neon PostgreSQL connection string
- The Upstash Redis URL and token
- All Groq API keys
- The Gemini API key
- The Google OAuth client secret
- JDoodle client credentials
- Cloudinary API secret
- The Gmail App Password
- The `JWT_SECRET` and `INTERNAL_API_KEY` values

## Application Security Measures

The project applies the following protections:

- **Authentication** — JWT stored in HttpOnly cookies, with rotating refresh tokens persisted server-side.
- **Password storage** — user passwords are hashed with bcrypt; plaintext passwords are never stored.
- **Email verification** — registration requires a one-time passcode; OTPs are stored hashed with a short expiry and a limited number of attempts.
- **Transport security** — cookies use `SameSite=None; Secure` in production; database and Redis connections use TLS.
- **Service-to-service calls** — requests between the backend and the AI service are authenticated with a shared internal API key.
- **Rate limiting** — authentication and OTP endpoints are rate limited to reduce abuse.
- **Input handling** — request payloads are validated, and uploaded files are checked by type and size before processing.

## Supported Versions

This project is maintained on its default branch. Security fixes are applied to the latest version only.

## Phase 1 boundaries

The Node resume callback requires `X-API-Key` before repository access. Both AI
success/failure deliveries and cached Node deliveries include the existing shared
internal key. Missing configuration fails closed. Comparisons use constant-time
primitives; logs do not include authentication headers or recognized transcripts.

AI resume callbacks must match the operator-configured `RESUME_CALLBACK_BASE_URL`
origin and the exact UUID callback path. Backend `BACKEND_URL` builds that path and
rejects credentials, paths, queries, unsupported schemes and production HTTP.
Local/private HTTP origins are trusted only when explicitly configured for
local development. Production uses HTTPS. Redirects are disabled; callback uploads,
responses and connection/read timeouts are bounded. Keep the shared key outside
Git and use distinct deployments' secrets.

Remote diagram fetches are limited to HTTPS Cloudinary image-upload PNG URLs. DNS
must resolve entirely to global addresses; URL credentials, unsafe paths/ports,
redirects, oversized content and non-PNG responses are rejected. Reads stream up
to 10 MiB with connect/read timeouts. Node AI calls also bound duration/response
size. A failed image/STT/provider response does not become a successful evaluation.

PostgreSQL transaction advisory locks protect cooperating interview writers.
Completion status and direct SQL completion rewards commit together; retries
cannot award completion XP again. The schema did not gain new tables/columns.

## Deliberately remaining limits

- The shared internal key has broad service privileges, with no signed body,
  timestamp, per-job token, replay protection or automated rotation. Authenticated
  resume callbacks can be repeated; callback delivery uses in-process FastAPI
  background tasks and has no durable retry/outbox. Those require a reviewed
  reliability/trust redesign. Public AI API documentation should remain internal.
- URL allowlisting and DNS checks narrow SSRF exposure but do not pin the connection
  to the checked IP. A compromised CDN/DNS or operator-controlled callback origin
  remains trusted. Use deployment egress restrictions for stronger network boundaries.
  The timeouts are per request/read operation, not a full slow-stream wall-clock cap.
- Interview generation/evaluation/follow-up tasks are not durable jobs. An API
  process crash can strand processing flags; automatic leases/recovery are deferred.
  PostgreSQL locks do not protect direct SQL writers that ignore the convention.
- Redis question XP get/delete and SQL persistence have a crash/rollback loss window.
  Completion XP is atomic SQL; broader exactly-once delivery would need an outbox.
- Existing database/Redis managed-TLS clients relax certificate verification. This
  phase preserves that connection policy; deployment certificate/egress policy
  still needs a separate review. Local `DATABASE_SSL=false` is ignored in
  production/staging.
- Existing dependencies retain audit findings (the Phase 1 backend installation
  reported 23: 1 low, 2 moderate, 20 high; the frontend clean install reported
  30: 1 low, 13 moderate, 16 high). Frontend installation also reports existing
  Excalidraw/Radix React peer-range warnings. No broad audit-fix upgrades were applied.
  Review supported dependency/security updates separately. The only runtime-driven
  replacement is `file-type` 22 → 21.3.4 for Node 20 compatibility.
- Fixtures verify contracts/state/errors, not provider quality, live quota,
  microphone hardware, production deployments or full accessibility. Keep those
  checks distinct from automated baseline verification.
