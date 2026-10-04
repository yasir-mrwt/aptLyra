# TechVera — Deployment Guide

TechVera is deployed across three managed platforms. The frontend is hosted on Vercel, while the backend and the AI service run as independent web services on Render. The data tier (Neon PostgreSQL and Upstash Redis) and media storage (Cloudinary) are already serverless and require no additional hosting.

## Architecture

| Component | Platform | Rationale |
|---|---|---|
| Frontend (React / Vite) | Vercel | Static assets delivered over a global CDN |
| Backend (Express 5) | Render Web Service | Long-lived process for Socket.io and BullMQ workers |
| AI Service (FastAPI) | Render Web Service | Co-located with the backend, secured by an internal key |
| PostgreSQL | Neon | Serverless, reachable from any host |
| Redis | Upstash | Serverless, reachable from any host |
| Media storage | Cloudinary | Managed cloud storage |

## URL Placeholders

Render and Vercel each generate a public URL from the service or project name that you choose. Those URLs are unique to your account, so this guide uses the following placeholders. Substitute each one with the actual URL that the platform assigns after deployment.

| Placeholder | Meaning |
|---|---|
| `BACKEND_URL` | The URL Render assigns to the backend service |
| `AI_SERVICE_URL` | The URL Render assigns to the AI service |
| `FRONTEND_URL` | The URL Vercel assigns to the frontend project |

## Prerequisites

- The repository is pushed to GitHub. Render and Vercel both deploy directly from a connected repository.
- Environment files are excluded from version control. Confirm that no `.env` file is tracked before pushing.
- Production credentials are prepared. The complete list of environment variables for each service is documented in SETUP.md.

## 1. Backend (Render)

1. In the Render dashboard, create a new Web Service and connect the GitHub repository.
2. Configure the service:

   | Setting | Value |
   |---|---|
   | Name | Any name you prefer |
   | Root Directory | `backend` |
   | Runtime | Node (a Dockerfile is also provided) |
   | Build Command | `npm install && npm run build` |
   | Start Command | `npm start` |
   | Instance Type | Free |
   | Health Check Path | `/health` |

3. Add the environment variables from `backend/.env`, using the following production values:

   ```env
   NODE_ENV=production
   FRONTEND_URL=<your-frontend-url>     # the Vercel URL, no trailing slash
   AI_SERVICE_URL=<your-ai-service-url>
   BACKEND_URL=<your-backend-url>       # this service's own URL — required for the resume webhook callback
   # PORT is assigned by Render automatically — do not set it
   ```

   `BACKEND_URL` is important: resume analysis is asynchronous, and the AI service posts its results back to `BACKEND_URL/api/resume/webhook/...`. If it is unset, parsing may finish but the result never returns, leaving resumes stuck. Set it to this backend service's own Render URL after the first deploy.

   In addition, provide: `DATABASE_URL`, `UPSTASH_REDIS_URL`, `JWT_SECRET`, `INTERNAL_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JDOODLE_CLIENT_ID`, `JDOODLE_CLIENT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.

4. Deploy the service and record the URL that Render assigns. This is your `BACKEND_URL`.

> Note: `NODE_ENV=production` is required. Authentication cookies switch to `SameSite=None; Secure`, which is necessary for the cross-domain Vercel-to-Render setup.

## 2. AI Service (Render)

1. Create a second Web Service from the same repository.
2. Configure the service:

   | Setting | Value |
   |---|---|
   | Name | Any name you prefer |
   | Root Directory | `ai-service` |
   | Runtime | Python 3 (a Dockerfile is also provided) |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | Free |

3. Add the environment variables:

   ```env
   ALLOWED_ORIGINS=<your-backend-url>,<your-frontend-url>
   INTERNAL_API_KEY=<identical to the backend value>
   REQUEST_TIMEOUT=60
   GROQ_API_KEY=gsk_...          # plus GROQ_API_KEY_2 / GROQ_API_KEYS if available
   GROQ_MODEL=llama-3.3-70b-versatile
   GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
   GROQ_TTS_MODEL=canopylabs/orpheus-v1-english
   GROQ_TTS_VOICE=autumn
   GEMINI_API_KEY=...            # resume-analyzer fallback
   GEMINI_MODEL=gemini-2.5-flash
   ```

4. Deploy the service and record the URL that Render assigns. This is your `AI_SERVICE_URL`. Return to the backend and set its `AI_SERVICE_URL` variable to this exact value.

> Note: The repository includes a `render.yaml` blueprint. Selecting the Blueprint option in Render provisions both services in a single step; only the environment values need to be supplied.

## 3. Frontend (Vercel)

1. In the Vercel dashboard, create a new project and import the repository.
2. Configure the project:

   | Setting | Value |
   |---|---|
   | Root Directory | `frontend` |
   | Framework Preset | Vite |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. Add the environment variables:

   ```env
   VITE_API_URL=<your-backend-url>/api
   VITE_GOOGLE_CLIENT_ID=<your Google client ID>
   ```

4. Deploy the project. The `frontend/vercel.json` file is already included in the repository and handles the single-page-application rewrite for React Router deep links, as well as the `Cross-Origin-Opener-Policy` header required by the Google Login popup.

After the frontend URL is known, update the backend's `FRONTEND_URL` and the AI service's `ALLOWED_ORIGINS` with that URL, then redeploy both services.

## 4. Google OAuth

In the Google Cloud console, open APIs & Services, then Credentials, and select the OAuth client:

- Authorized JavaScript origins: add your `FRONTEND_URL`
- Authorized redirect URIs: add your `FRONTEND_URL`

Retain the localhost entries for local development. Changes take approximately five minutes to propagate.

## 5. Post-Deployment Verification

```bash
# Backend health and database connectivity
curl <your-backend-url>/health

# AI service availability
curl <your-ai-service-url>/
```

In the browser, complete a full flow: register with email and confirm the OTP arrives, sign in with Google, run a short interview and confirm Ava speaks, and upload a resume.

## 6. Free-Tier Considerations

| Behavior | Effect | Recommendation |
|---|---|---|
| Render free services sleep after 15 minutes of inactivity | The first request takes roughly 50 seconds to wake the service | Acceptable for demos; a scheduled ping to `/health` every 10 minutes keeps it warm, or upgrade to a paid instance |
| Neon free tier suspends compute when idle | The first query adds a few seconds | The backend already retries on cold start |
| Groq free quota is enforced per account | All keys from one account share a single limit | Use keys from separate accounts, or rely on the automatic Gemini fallback in the resume analyzer |
| Render allocates 750 free hours per month | Two always-on services exceed the allowance | Both services sleep when idle, which normally stays within the limit |

## 7. Troubleshooting

| Symptom | Likely cause and resolution |
|---|---|
| The session drops immediately after login | `NODE_ENV` is not set to `production`, so cookies remain `SameSite=Lax` and are blocked cross-site |
| CORS errors appear in the browser console | `FRONTEND_URL` (backend) or `ALLOWED_ORIGINS` (AI service) does not exactly match the frontend URL; ensure there is no trailing slash |
| The Google button renders but the popup fails | The frontend URL is missing from the Authorized JavaScript origins |
| AI endpoints return HTTP 401 | The `INTERNAL_API_KEY` value differs between the backend and the AI service |
| Resume upload shows a `502 Bad Gateway` HTML page | The AI service is unreachable — asleep (cold start), crashed, or `AI_SERVICE_URL` is wrong. Confirm `curl <your-ai-service-url>/` returns JSON, and check the AI service's own Render logs. The backend now retries cold starts automatically. |
| Resume stays stuck on "processing" and never completes | `BACKEND_URL` is not set on the backend, so the AI service cannot post results back to the webhook. Set it to the backend's own URL. |
| The first request is slow | All three free-tier services are waking from idle; see section 6 |

## Phase 1 callback configuration

Set AI `NODE_ENV=production` and `RESUME_CALLBACK_BASE_URL` to the exact HTTPS
backend origin already configured as backend `BACKEND_URL` (no path/query). Both
services require the same `INTERNAL_API_KEY`. Resume callbacks now fail closed
when the origin/key is missing or mismatched. Docker now uses Python 3.11.
General remote diagram URLs are rejected; keep the existing Cloudinary PNG
whiteboard upload flow. This is configuration documentation, not a deployment
migration. See [SECURITY.md](SECURITY.md) for remaining reliability limits.
