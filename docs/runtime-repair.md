# Phase 6 runtime: answers and interviewer voice

The existing runner evaluates answers through Express → authenticated FastAPI → Groq. Results remain **legacy evaluation**; reviewed rubric scoring and evaluator confidence are not implemented.

## Answer input and retry

Oral and system-design questions accept a recording or the **Type an answer instead** field. Typed drafts use the existing IndexedDB store. Submit multipart `answerText` with `questionIndex`; text is limited to 50,000 characters. A typed answer and recording are mutually exclusive. Coding questions still require code and retain the planned language; recorded explanations can accompany code. Diagrams remain optional for system design.

Typed input reaches `user_answer` directly and saves to the existing question's `userAnswerText` only after a valid evaluation. Speech still uses `/speech/analyze`; missing ffmpeg yields an explicit unavailable metrics status without fabricated pace or pauses. A provider failure restores the submitted flag for retry and saves no score. Existing session ownership, duplicate submission, follow-up capacity and completion/reward transaction guards remain in place. These are in-process tasks; this repair does not introduce durable jobs or crash-recovery architecture.

## Voice fallback

`/speak` uses the owned active session's server-selected question. Invalid indices, unowned sessions, inactive sessions and withdrawn evidence cannot invoke the provider. Valid provider WAV audio remains supported. Provider failure returns a safe HTTP 503 `tts_unavailable` response without raw upstream detail, allowing browser speech or reading the question.

The voice hook shares an in-flight request for the same question, caches decoded successful audio, and stops automatic server attempts after an intentional 503 for that session. A user-triggered Replay may make one new attempt. Late requests cannot play after a question/session/state change. Browser autoplay permission is handled at playback, after provider availability is known; a pending AudioContext activation cannot block fallback or permanently disable Replay. Browser voice availability still depends on the browser/platform. Questions and answer controls remain usable when voice cannot play.

## Operator diagnosis

Embedding readiness does not prove chat, transcription or TTS readiness. Check each capability with the configured account; never print keys or personalized provider response bodies.

| Internal safe code | Operator action |
|---|---|
| `provider_model_unavailable` | Verify `GROQ_MODEL` or `GROQ_VISION_MODEL` against the account's active, permitted models. Update the relevant local setting and restart/reload the AI service. A key change alone does not guarantee model access. |
| `tts_terms_required` | The account owner must review the configured TTS model's terms in the Groq console and accept them if desired. Browser fallback works while server TTS is unavailable. |
| `provider_authentication` | Verify provider key presence and capability permissions privately. Keep Express/FastAPI internal authentication enabled. |
| `provider_rate_limited` | Respect provider cooldown/quota; retries must not invent an evaluation or repeatedly request unavailable voice. |
| `provider_timeout` / `provider_unavailable` | Check provider reachability, timeout configuration and service health, then retry the retained answer draft. |
| `invalid_provider_audio` | Inspect provider format/configuration privately; do not send malformed bytes as successful audio. |

Relevant names: `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEYS`, `GROQ_MODEL`, `GROQ_VISION_MODEL`, `GROQ_TTS_MODEL`, `GROQ_TTS_VOICE`, `REQUEST_TIMEOUT`, `INTERNAL_API_KEY`. Provider errors log only capability/status/safe category on the repaired chat/TTS paths. Backend errors discard raw provider bodies before logging or responding.

For current model availability and TTS setup, consult [Groq supported models](https://console.groq.com/docs/models) and [Orpheus TTS documentation](https://console.groq.com/docs/text-to-speech/orpheus). Availability and account permissions can change; do not assume historical example selections remain accessible.

## Verification boundary

Runtime regression coverage includes real PostgreSQL/Redis failure/retry/duplicate side-effect checks, authenticated route tests, provider contract fixtures, and frontend fallback/typed/navigation tests. Controlled provider fixtures prove valid WAV and failure contracts; they do not certify live TTS permission or model quality. Live synthetic speech verifies provider processing without claiming microphone hardware validation. No schema, seed approval, corpus or index changes are required for this repair.
