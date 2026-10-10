# Interview answers, coding and interviewer voice

The runner uses the existing durable PostgreSQL/Redis execution path described in [runtime recovery](runtime-recovery.md). Trusted starter questions retain their baseline evaluator. Dynamic questions with reviewed evidence and a guide use rubric evaluation; practice questions without those prerequisites receive descriptive **Provisional** feedback with low confidence and no technical score or reviewed aggregate contribution.

## Answer input and retry

Oral and system-design questions accept a recording or **Type an answer instead**. Typed drafts use IndexedDB. Submit multipart `answerText` with `questionIndex`; typed text and a recording are mutually exclusive. Coding answers retain their draft code and chosen language. Planned executable coding supports both **JavaScript** and **Python**, including changing the original plan language. The language and final keystroke are preserved on run/submit and reload. SQL remains SQL.

The exact trusted binary-search exercise has identity-bound JavaScript and Python correctness harnesses. Other exercises must have supported tests before the UI can claim correctness; a successful generic execution alone is not a passing correctness suite. Ownership and question-version guards remain enforced. See the runtime and evaluation documents for durable retries, duplicate suppression and completion/reward persistence.

## Voice fallback

`/speak` uses the owned active session's server-selected question. Invalid indices, unowned sessions, inactive sessions and withdrawn evidence cannot invoke the provider. Valid provider WAV audio remains supported. Provider failure returns a safe HTTP 503 `tts_unavailable` response without raw upstream detail, allowing browser speech or reading the question.

The voice hook shares an in-flight request for the same question, caches decoded successful audio, and stops automatic server attempts after an intentional 503 for that session. Replay question also uses browser voice after that failure; it does not retry the unavailable server provider for that session. Late requests cannot play after a question/session/state change. Browser autoplay permission is handled at playback, after provider availability is known; a pending AudioContext activation cannot block fallback or permanently disable Replay. Browser synthesis waits up to two seconds for voices to load, selects a usable English voice, retains the utterance until completion and cancels stale playback. The UI shows **Browser voice** and a **Replay question** button; unsupported or stalled playback has a visible message. Browser voice availability still depends on the browser/platform. Questions and answer controls remain usable when voice cannot play.

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
