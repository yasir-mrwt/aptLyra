# Lyra voice audition

Lyra defaults to `hannah` with `canopylabs/orpheus-v1-english`. Groq lists Hannah,
Autumn and Diana as supported English Orpheus voices in its [official voice documentation](https://console.groq.com/docs/text-to-speech/orpheus).
This verifies provider support, not subjective voice quality or physical playback.
Private `GROQ_TTS_VOICE` and `GROQ_TTS_MODEL` overrides still win. Existing ignored
environment files are not changed by the rebrand.

After accepting the model terms in the Groq console, audition each voice with the
same four phrases, in this order:

1. Welcome. I’m Lyra, your technical interviewer.
2. Take your time and explain your reasoning clearly.
3. That’s useful context. Let’s explore one part of your answer further.
4. We’ll move to the next question when you’re ready.

| Voice | Operator comparison |
| --- | --- |
| `hannah` (default) | Listen for calm pacing, clarity, neutral warmth and consistent pronunciation |
| `autumn` | Use the identical text and volume; compare warmth and pacing |
| `diana` | Use the identical text and volume; compare clarity and neutrality |

Record the date, voice, headphone/speaker conditions and preference only after
actually listening. No audible audition is claimed by automated tests.
Use a process-only override or edit only the non-secret voice selector in the
ignored AI environment; never commit credentials. Restart the AI service and use
a fresh question/session because runner audio is cached. Do not bypass provider
terms or retry them automatically. `tts_terms_required` remains a safe 503 and
the UI uses browser voice. Other provider failures retain their existing safe
mapping, request guards, mute preference and cache behavior.

Browser fallback keeps English voice selection and rate 0.95; pitch is now 1.0.
Its sound depends on the browser and operating system. This is a conservative
tone adjustment, not a guarantee that a particular browser voice sounds softer.
