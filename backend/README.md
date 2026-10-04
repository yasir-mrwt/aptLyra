# TechVera Backend ⚙️

The core orchestrator for TechVera. This Node.js service manages the API, user authentication, session state, and coordinates communication between the frontend and the AI microservice.

## 🚀 Key Responsibilities

- **🔐 User Management**: Handles Google OAuth 2.0 and JWT-based session management using HttpOnly cookies.
- **🔄 Session Orchestration**: Manages the lifecycle of an interview session, from question generation to final evaluation. Forwards structured user resume context to the AI service.
- **💻 Remote Code Execution**: Bridges the frontend Monaco editor with the external JDoodle API to compile and execute 20+ programming languages securely.
- **🎮 Gamification & Analytics Engine**: Aggregates user performance metrics across sessions to calculate XP, streaks, achievements, and speech behavioral stats.
- **📡 Real-time Updates**: Uses Socket.io to provide live progress feedback during heavy AI processing tasks.
- **🛡️ Request Throttling**: Implements API rate limiting to prevent resource exhaustion and abuse.
- **💾 Data Persistence**: Manages user profiles, interview history, gamification states, and evaluation results in **Upstash Redis** (JSON blobs + ZSET indexes) — the single datastore for the whole platform.

## 🏗️ Tech Stack

- **Node.js & Express 5.x**: Fast and scalable web framework with modern async support.
- **Upstash Redis & ioredis**: Serverless Redis as the primary datastore (users, sessions, resumes, gamification, refresh tokens).
- **BullMQ**: High-performance background job queue on the same Redis instance.
- **Socket.io**: Real-time, bidirectional communication engine.
- **Cloudinary**: Media and file storage integration.
- **Mammoth**: DOCX extraction and parsing.
- **Passport.js**: Authentication middleware for Google OAuth.
- **JWT**: Secure token-based authorization.
- **Express-rate-limit**: Protective middleware against brute-force and DoS.
- **Jest & Supertest**: Robust API testing and assertions.

## 🛠️ Installation & Setup

### 1. Prerequisites
- **Node.js 18+**
- **npm** or **yarn**
- **Upstash Redis** database (free tier) — copy the `rediss://` TCP URL from the Upstash console

### 2. Environment Setup
```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install
```

### 3. Configuration
Create a `.env` file in this directory based on `.env.example`:
```env
PORT=5000
UPSTASH_REDIS_URL=rediss://default:password@your-endpoint.upstash.io:6379
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AI_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

## 🏃 Running the Server

```bash
# Development mode with hot-reload
npm run dev

# Production mode
npm start
```

## 📡 API Endpoints (Highlights)

- `GET /health`: Health check endpoint for cloud monitoring. Returns database connectivity status.
- `POST /api/sessions`: Create a new session (Rate limited: 5 req / 15 mins).
- `GET /api/sessions`: Retrieve paginated interview history.
- `POST /api/resume/upload`: Upload a resume PDF/DOCX for AI parsing. Spawns a BullMQ background job.
- `POST /api/resume/:id/cover-letter`: Generate a tailored cover letter from the parsed resume.
- `POST /api/auth/google`: OAuth login entry point.

## 📂 Internal Directory Structure

- `controllers/`: Logic for handling API requests.
- `models/`: Redis-backed repositories (Users, Sessions, Resumes, Gamification, RefreshTokens) with typed interfaces.
- `routes/`: Express route definitions.
- `services/`: External service integration (AI Service, Socket logic) and **Queue Workers**.
  - `queue/`: BullMQ worker definitions and Redis connection orchestration.
- `middleware/`: Auth, validation, and error handling filters.

---

## 🛡️ Security Features
- **HTTP-Only Cookies**: Secure storage for JWTs (mitigates XSS).
- **CORS Protection**: Hardened restricted origins for cross-domain safety.
- **Rate Limiting**: Automated IP-based throttling on sensitive creation endpoints.
- **Graceful Shutdown**: Handles process signals to close DB connections cleanly.

