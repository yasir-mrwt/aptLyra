"""
Groq LLM Service
================
Shared helpers for calling the Groq API (OpenAI-compatible chat completions).

Groq powers ALL LLM workloads in this service:
  - Interview question generation & answer evaluation
  - Resume parsing, analysis, scoring, recommendations and reports
  - JD matching and streaming feedback / cover letters
  - Whisper transcription lives separately in whisper_service.py
    (also Groq — `whisper-large-v3-turbo`).

Models (override via env):
  GROQ_MODEL        — text model        (default: llama-3.3-70b-versatile)
  GROQ_VISION_MODEL — multimodal model  (default: meta-llama/llama-4-scout-17b-16e-instruct)
"""

import requests
import os
import json
import logging
import time
import threading
from fastapi import HTTPException

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile"
DEFAULT_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


def _raise_provider_error(response, capability: str) -> None:
    """Classify capability failures without returning/logging provider request text."""
    try:
        error = response.json().get("error", {})
        provider_code = error.get("code") if isinstance(error, dict) else None
    except (ValueError, TypeError, AttributeError):
        provider_code = None
    status, code, retryable = 502, "provider_unavailable", True
    if provider_code == "model_terms_required" and capability == "tts":
        status, code, retryable = 503, "tts_terms_required", False
    elif provider_code == "model_not_found" or response.status_code == 404:
        status, code = 503, "provider_model_unavailable"
    elif response.status_code in (401, 403):
        status, code = 503, "provider_authentication"
    elif response.status_code == 429:
        status, code = 429, "provider_rate_limited"
    logging.warning("Groq capability=%s status=%s code=%s", capability, response.status_code, code)
    raise HTTPException(status, {"code": code, "message": "AI capability unavailable. Please retry or use the available fallback.", "retryable": retryable})

# ============================================================================
# Global Rate Limiter
# ============================================================================
# Groq's free tier allows ~30 RPM on the large models. One resume analysis
# fires 5-7 calls in quick succession; a small serialized gap keeps us safely
# under the limit without the multi-second stalls Gemini needed.
# ============================================================================

_rate_lock = threading.Lock()
_last_call_time: float = 0.0
# Minimum seconds between consecutive Groq API calls.
MIN_CALL_INTERVAL = float(os.getenv("GROQ_MIN_CALL_INTERVAL", "1"))

# ============================================================================
# API Key Failover (with per-key cooldowns)
# ============================================================================
# Provide multiple keys via GROQ_API_KEYS (comma-separated) or GROQ_API_KEY +
# GROQ_API_KEY_2. When a key hits a rate limit (429), it's put on cooldown for
# exactly as long as Groq says ("Please try again in 1h27m17s") and rotation
# skips it — so an exhausted daily quota doesn't get hammered with retries.
#
# IMPORTANT: keys only add quota if they belong to DIFFERENT Groq accounts —
# Groq limits are per ORGANIZATION, so multiple keys from one account share
# one pool.
# ============================================================================

import re as _re

_key_lock = threading.RLock()
_key_index = 0
_key_cooldowns: dict = {}  # key → unix timestamp until which it is rate-limited


def _get_api_keys() -> list:
    """All configured Groq keys, primary first, de-duplicated."""
    keys = []
    for key in [
        os.getenv("GROQ_API_KEY"),
        os.getenv("GROQ_API_KEY_2"),
        *[k.strip() for k in os.getenv("GROQ_API_KEYS", "").split(",")],
    ]:
        if key and key.strip() and key.strip() not in keys:
            keys.append(key.strip())
    return keys


def parse_retry_seconds(error_text: str) -> float:
    """Extract the wait from Groq's 'Please try again in 1h27m17.5s' message."""
    match = _re.search(r"try again in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s", error_text or "")
    if not match:
        return 0.0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = float(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def key_cooldown_remaining(key: str) -> float:
    """Seconds until this key is usable again (0 = usable now)."""
    with _key_lock:
        return max(0.0, _key_cooldowns.get(key, 0.0) - time.time())


def get_current_api_key() -> str:
    """
    The best key to use right now: the first key in rotation that is NOT on
    cooldown. If every key is cooling, returns the one that frees up soonest.
    """
    global _key_index
    keys = _get_api_keys()
    if not keys:
        return ""
    with _key_lock:
        n = len(keys)
        for offset in range(n):
            idx = (_key_index + offset) % n
            if key_cooldown_remaining(keys[idx]) <= 0:
                _key_index = idx
                return keys[idx]
        # Every key is cooling — pick the one that recovers first
        return min(keys, key=lambda k: _key_cooldowns.get(k, 0.0))


def rotate_api_key(failed_key: str, wait_seconds: float = 90.0) -> str:
    """
    Put `failed_key` on cooldown (default 90s; pass Groq's exact retry time
    when known) and return the best available key. Returns `failed_key`
    itself if nothing better exists yet.
    """
    keys = _get_api_keys()
    with _key_lock:
        _key_cooldowns[failed_key] = time.time() + max(wait_seconds, 5.0)
        nxt = get_current_api_key()

    if nxt != failed_key and failed_key in keys:
        cooldown_label = f"{int(wait_seconds)}s" if wait_seconds < 3600 else f"{wait_seconds / 3600:.1f}h"
        print(
            f"[KEY FAILOVER] Groq key #{keys.index(failed_key) + 1} rate-limited "
            f"(cooldown {cooldown_label}) — switching to key #{keys.index(nxt) + 1}"
        )
    return nxt


def _wait_for_rate_limit() -> None:
    """Block until at least MIN_CALL_INTERVAL seconds have elapsed since the last call."""
    global _last_call_time
    with _rate_lock:
        now = time.time()
        elapsed = now - _last_call_time
        if elapsed < MIN_CALL_INTERVAL:
            sleep_time = MIN_CALL_INTERVAL - elapsed
            print(
                f"[RATE LIMITER] Throttling — waiting {sleep_time:.1f}s before next Groq call"
            )
            time.sleep(sleep_time)
        _last_call_time = time.time()


def _resolve_model(image_base64: str = None) -> str:
    """Pick the right Groq model — vision model when an image is attached."""
    if image_base64:
        return os.getenv("GROQ_VISION_MODEL", DEFAULT_VISION_MODEL)
    return os.getenv("GROQ_MODEL", os.getenv("MODEL_NAME", DEFAULT_TEXT_MODEL))


def _build_messages(
    system_prompt: str,
    user_prompt: str,
    as_json: bool = False,
    image_base64: str = None,
) -> list:
    """Assemble OpenAI-style messages, attaching an inline image if provided."""
    # Groq's JSON mode requires the word "JSON" to appear in the conversation.
    if as_json and "json" not in (system_prompt + user_prompt).lower():
        user_prompt += "\n\nRespond ONLY with a valid JSON object."

    if image_base64:
        user_content = [
            {"type": "text", "text": user_prompt},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{image_base64}"},
            },
        ]
    else:
        user_content = user_prompt

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]


def call_groq(
    system_prompt: str,
    user_prompt: str,
    as_json: bool = False,
    image_base64: str = None,
    api_key: str = None,
    temperature: float = 0.6,
    max_retries: int = 5,
) -> str:
    """Shared helper to call the Groq chat completions API. Supports text and images.

    `temperature` defaults to 0.6 (unchanged for existing callers). Pass a higher
    value where more varied output is wanted, e.g. interview question generation.
    """
    model_name = _resolve_model(image_base64)

    body = {
        "model": model_name,
        "messages": _build_messages(system_prompt, user_prompt, as_json, image_base64),
        "max_completion_tokens": 8192,
        "temperature": temperature,
        **({"response_format": {"type": "json_object"}} if as_json else {}),
    }

    timeout = int(os.getenv("REQUEST_TIMEOUT", "60"))

    # Retry logic for Rate Limiting (429) and Server Errors (500, 503, 504)
    retry_delay = 5  # Groq rate-limit windows are short; start small

    resp = None  # ensure resp is defined for the post-loop code

    for attempt in range(max_retries + 1):
        # Enforce global rate limit before every attempt
        _wait_for_rate_limit()

        # Resolve the key per attempt — it may have rotated after a 429
        actual_api_key = api_key or get_current_api_key()
        if not actual_api_key:
            raise HTTPException(503, {"code": "provider_authentication", "message": "AI capability unavailable. Please retry later.", "retryable": True})
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {actual_api_key}",
        }

        try:
            resp = requests.post(GROQ_CHAT_URL, json=body, headers=headers, timeout=timeout)

            if resp.status_code == 429 and attempt < max_retries:
                # How long does Groq actually want us to wait?
                retry_after = resp.headers.get("Retry-After")
                wait_hint = (
                    parse_retry_seconds(resp.text)
                    or (float(retry_after) if retry_after and retry_after.replace(".", "").isdigit() else 0)
                    or retry_delay
                )

                # Failover: cool this key for exactly that long, grab the next one
                rotated_key = None if api_key else rotate_api_key(actual_api_key, wait_hint)
                if rotated_key and rotated_key != actual_api_key and key_cooldown_remaining(rotated_key) <= 0:
                    continue  # fresh key available — retry immediately

                # No usable key right now. Short (per-minute) waits are worth
                # sleeping through; long (daily-quota) waits should fail fast.
                if wait_hint > 60:
                    minutes = int(wait_hint // 60)
                    raise HTTPException(
                        status_code=429,
                        detail=(
                            f"All Groq API keys are rate-limited. The next key frees up in ~{minutes} min. "
                            "Tip: extra keys only add quota if they're from DIFFERENT Groq accounts."
                        ),
                    )
                print(
                    f"[RATE LIMIT] 429 — no fresh key, waiting {wait_hint:.0f}s... (Attempt {attempt+1}/{max_retries})"
                )
                time.sleep(min(wait_hint, 20))
                retry_delay = int(retry_delay * 1.5)  # Exponential backoff
                continue

            if resp.status_code in [500, 502, 503, 504] and attempt < max_retries:
                print(
                    f"[UPSTREAM ERROR] {resp.status_code} received. Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})"
                )
                time.sleep(retry_delay)
                retry_delay = int(retry_delay * 1.5)
                continue
        except requests.exceptions.RequestException as e:
            if attempt < max_retries:
                print("[RETRY] Provider network request failed. Retrying in 5s...")
                time.sleep(5)
                continue
            raise HTTPException(504, {"code": "provider_timeout", "message": "AI request timed out. Please retry.", "retryable": True}) from None

        if not resp.ok:
            _raise_provider_error(resp, "chat")
        break

    if resp is None:
        raise HTTPException(
            status_code=500, detail="No response received from AI service after retries"
        )

    data = resp.json()

    choices = data.get("choices", [])
    if not choices:
        raise HTTPException(
            status_code=500, detail="Groq returned an empty response (no choices)"
        )

    # Check for truncated responses
    finish_reason = choices[0].get("finish_reason", "unknown")
    if finish_reason not in ("stop", "end_turn"):
        print(
            f"!!! [WARNING] Groq finished with reason: {finish_reason}. Response may be truncated !!!"
        )

    return choices[0].get("message", {}).get("content", "") or ""


def parse_response(text_output: str):
    """Clean and parse JSON response from the model."""
    try:
        # First, try to strip common markdown code block markers
        cleaned = text_output.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        return json.loads(cleaned.strip())
    except Exception as e:
        logging.warning(
            f"Initial JSON parsing attempt failed: {e}. Falling back to brace matching."
        )
        pass

    # Fallback: attempt to extract a valid JSON object by single-pass brace counting
    try:
        start = text_output.find("{")
        if start != -1:
            brace_count = 0
            for i in range(start, len(text_output)):
                if text_output[i] == "{":
                    brace_count += 1
                elif text_output[i] == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        try:
                            return json.loads(text_output[start : i + 1])
                        except ValueError:
                            # if it fails, we keep looking for the next balanced block?
                            # Usually the first balanced block is the JSON.
                            pass
    except Exception as e:
        print(f"Failed to parse JSON: {str(e)}")

    return {}


def stream_groq(system_prompt: str, user_prompt: str, api_key: str = None):
    """Shared helper to call the Groq API with SSE streaming (with key failover)."""
    model_name = _resolve_model()

    body = {
        "model": model_name,
        "messages": _build_messages(system_prompt, user_prompt),
        "max_completion_tokens": 8192,
        "temperature": 0.6,
        "stream": True,
    }

    _wait_for_rate_limit()

    try:
        actual_api_key = api_key or get_current_api_key()
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {actual_api_key}",
        }
        resp = requests.post(GROQ_CHAT_URL, json=body, headers=headers, stream=True)

        # Rate limited before any bytes streamed → fail over once and retry
        if resp.status_code == 429 and not api_key:
            rotated = rotate_api_key(actual_api_key, parse_retry_seconds(resp.text) or 90)
            if rotated != actual_api_key and key_cooldown_remaining(rotated) <= 0:
                headers["Authorization"] = f"Bearer {rotated}"
                resp = requests.post(GROQ_CHAT_URL, json=body, headers=headers, stream=True)

        resp.raise_for_status()

        for line in resp.iter_lines():
            if line:
                decoded_line = line.decode("utf-8")
                if decoded_line.startswith("data:"):
                    data_str = decoded_line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data_json = json.loads(data_str)
                        choices = data_json.get("choices", [])
                        if choices:
                            text = choices[0].get("delta", {}).get("content", "")
                            if text:
                                yield text
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        print(f"!!! [CRITICAL] Groq Streaming API Failure: {str(e)} !!!")
        yield f"Error generating stream: {str(e)}"


def to_float(val, default: float = 0.0) -> float:
    """Safely coerce a value to float, handling formats like '8/10' or '8.5'."""
    try:
        return float(str(val).split("/")[0].strip())
    except (ValueError, TypeError):
        return default


# ============================================================================
# Text-to-Speech (Groq PlayAI)
# ============================================================================

GROQ_TTS_URL = "https://api.groq.com/openai/v1/audio/speech"
# Orpheus TTS (Canopy Labs) — requires one-time terms acceptance in the Groq
# console: https://console.groq.com/playground?model=canopylabs/orpheus-v1-english
DEFAULT_TTS_MODEL = "canopylabs/orpheus-v1-english"
DEFAULT_TTS_VOICE = "autumn"  # female interviewer voice (also: diana, hannah; male: austin, daniel, troy)


def call_groq_tts(text: str, voice: str = None, api_key: str = None) -> bytes:
    """
    Synthesize speech for the AI interviewer using Groq TTS (with key failover).
    Returns WAV audio bytes. Raises HTTPException on failure so callers
    can fall back to browser speechSynthesis.
    """
    # TTS input cap; interview questions are far shorter.
    trimmed = (text or "").strip()[:2000]
    if not trimmed:
        raise HTTPException(status_code=422, detail="No text provided for TTS")

    body = {
        "model": os.getenv("GROQ_TTS_MODEL", DEFAULT_TTS_MODEL),
        "voice": voice or os.getenv("GROQ_TTS_VOICE", DEFAULT_TTS_VOICE),
        "input": trimmed,
        "response_format": "wav",
    }

    timeout = int(os.getenv("REQUEST_TIMEOUT", "60"))

    try:
        actual_api_key = api_key or get_current_api_key()
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {actual_api_key}",
        }
        if not actual_api_key:
            raise HTTPException(503, {"code": "provider_authentication", "message": "Server voice unavailable. Use browser voice.", "retryable": False})
        resp = requests.post(GROQ_TTS_URL, json=body, headers=headers, timeout=timeout)

        # Rate limited → fail over once and retry with the next key
        if resp.status_code == 429 and not api_key:
            rotated = rotate_api_key(actual_api_key, parse_retry_seconds(resp.text) or 90)
            if rotated != actual_api_key and key_cooldown_remaining(rotated) <= 0:
                headers["Authorization"] = f"Bearer {rotated}"
                resp = requests.post(GROQ_TTS_URL, json=body, headers=headers, timeout=timeout)
    except requests.exceptions.RequestException:
        raise HTTPException(504, {"code": "provider_timeout", "message": "Server voice unavailable. Use browser voice.", "retryable": False}) from None

    if not resp.ok:
        _raise_provider_error(resp, "tts")

    audio = resp.content
    if len(audio) < 44 or len(audio) > 10 * 1024 * 1024 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        raise HTTPException(502, {"code": "invalid_provider_audio", "message": "Server voice unavailable. Use browser voice.", "retryable": False})

    return audio


# ============================================================================
# Gemini Fallback (Resume Analyzer ONLY)
# ============================================================================
# When every Groq key is rate-limited, resume-analysis calls fall back to
# Google Gemini's free tier (~250k tokens/min vs Groq's 12k — perfect for the
# big resume prompts). Interview flows (questions, evaluation, follow-ups,
# TTS, Whisper) stay Groq-only and never touch this path.
# ============================================================================

GEMINI_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"


def call_gemini(system_prompt: str, user_prompt: str, as_json: bool = False) -> str:
    """Direct Gemini call — used only as the resume-analyzer fallback."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=429, detail="Groq rate-limited and no GEMINI_API_KEY configured for fallback")

    model = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
    url = GEMINI_URL_TEMPLATE.format(model=model)
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    body = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 8192,
            **({"responseMimeType": "application/json"} if as_json else {}),
        },
    }
    timeout = int(os.getenv("REQUEST_TIMEOUT", "60"))

    last_error = "unknown"
    for attempt in range(3):
        try:
            resp = requests.post(url, json=body, headers=headers, timeout=timeout)
        except requests.exceptions.RequestException as e:
            last_error = str(e)
            time.sleep(3)
            continue

        if resp.status_code == 429 and attempt < 2:
            # Gemini free tier ~10-15 RPM — short wait then retry
            time.sleep(7)
            continue
        if resp.status_code in (500, 503, 504) and attempt < 2:
            time.sleep(5)
            continue
        if not resp.ok:
            last_error = resp.text[:300]
            break

        data = resp.json()
        text_output = "".join(
            part.get("text", "")
            for candidate in data.get("candidates", [])
            for part in candidate.get("content", {}).get("parts", [])
        )
        if text_output:
            return text_output
        last_error = "empty response from Gemini"
        break

    raise HTTPException(status_code=502, detail=f"Gemini fallback failed: {last_error}")


def call_groq_with_fallback(
    system_prompt: str,
    user_prompt: str,
    as_json: bool = False,
    image_base64: str = None,
    api_key: str = None,
) -> str:
    """
    Groq first; if EVERY Groq key is rate-limited (429), fall back to Gemini.
    Import this in resume-analyzer services only — interview flows must keep
    using plain call_groq.
    """
    try:
        return call_groq(system_prompt, user_prompt, as_json=as_json, image_base64=image_base64, api_key=api_key)
    except HTTPException as e:
        if e.status_code == 429 and os.getenv("GEMINI_API_KEY") and not image_base64:
            print("[GEMINI FALLBACK] Saari Groq keys rate-limited — resume call Gemini se chala rahe hain")
            return call_gemini(system_prompt, user_prompt, as_json=as_json)
        raise
