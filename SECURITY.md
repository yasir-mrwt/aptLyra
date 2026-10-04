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
