# Baseline decisions

## Phase 1: stable baseline

- Keep Node 20.x (minimum 20.19; validated 20.20.2), Python 3.11 and the existing
  three-service stack. Use cloud inference; no GPU/model-download requirement.
  `file-type` 21.3.4 replaces 22 because 22 requires Node 22. Other dependency
  resolutions are preserved. npm synchronized stale root lockfile dependency/dev
  flags with the existing backend manifest; this does not change those versions.
- Retain `/transcribe` with a flat string response and use `/speech/analyze` for the
  runner. Provider failures are retryable processing errors. Missing ffmpeg means
  explicitly unavailable measurements, not guessed metrics.
- Use the existing shared internal key for both directions of resume communication.
  Bind callbacks to a configured backend origin and UUID path. Preserve Cloudinary
  whiteboards while rejecting general image URLs and private DNS destinations.
- Replace process-local interview mutexes with PostgreSQL transaction advisory locks.
  Persist completion rewards in the completion transaction; reserve follow-up capacity
  before provider work. Provider calls do not hold SQL locks.
- Keep Redis's question XP buffer and in-process interview/background resume tasks.
  Crash recovery, atomic Redis/SQL delivery, callback replay prevention and connection
  IP pinning are documented limitations, not claims of distributed exactly-once work.
- Keep Ava's identity and layout. Integrate functional loading/error/retry/listening/
  mute/completion behavior now; defer visual consistency, accessibility polish,
  responsive redesign, 3D avatars and bundle-performance work.
- Use localhost-only disposable Docker stores and deterministic provider fixtures.
  Real datastore verification is separate from live-provider or AI-quality verification.
- Stop after Phase 1. Knowledge storage, pgvector/RAG, recent-interview intelligence,
  planner/rubric changes, evaluator-confidence calibration and provenance remain future work.
