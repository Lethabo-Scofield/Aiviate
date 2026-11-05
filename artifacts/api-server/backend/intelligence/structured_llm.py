"""One-shot structured (JSON) completions from whichever LLM is configured.

The operator chat in llm_chat.py returns prose. The email agent needs a machine-readable
answer it can validate, so this asks for a JSON object and refuses anything else. It picks
the provider the same way llm_chat does (OpenAI key, else a Google/Gemini key).
"""
import json
import os

import requests

from intelligence.llm_chat import LLMUnavailable, _google_key, _openai_key, _raise_clear_http_error
from runtime_env import dev_override

OPENAI_BASE = "https://api.openai.com/v1"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
TIMEOUT_SECONDS = 45


def is_configured():
    return bool(_openai_key() or _google_key())


def complete_json(system, payload, max_tokens=1500):
    """Ask the model for a JSON object. Returns (dict, model_name).

    Raises LLMUnavailable if no key is set, the provider fails, or the reply isn't a JSON
    object. Callers must still validate the contents: the model is not trusted.
    """
    if _openai_key():
        return _openai_json(system, payload, max_tokens)
    if _google_key():
        return _gemini_json(system, payload, max_tokens)
    raise LLMUnavailable("No LLM key is set for the backend process")


def _parse_object(content):
    try:
        data = json.loads(content)
    except (TypeError, ValueError) as exc:
        raise LLMUnavailable("The model did not return valid JSON") from exc
    if not isinstance(data, dict):
        raise LLMUnavailable("The model did not return a JSON object")
    return data


def _openai_json(system, payload, max_tokens):
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    response = requests.post(
        f"{dev_override('OPENAI_API_BASE', OPENAI_BASE)}/chat/completions",
        headers={"Authorization": f"Bearer {_openai_key()}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, default=str)},
            ],
        },
        timeout=TIMEOUT_SECONDS,
    )
    _raise_clear_http_error(response, "OpenAI")
    content = (response.json().get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    return _parse_object(content), model


def _gemini_json(system, payload, max_tokens):
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    response = requests.post(
        f"{dev_override('GEMINI_API_BASE', GEMINI_BASE)}/models/{model}:generateContent",
        params={"key": _google_key()},
        headers={"Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps(payload, default=str)}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json",
            },
        },
        timeout=TIMEOUT_SECONDS,
    )
    _raise_clear_http_error(response, "Gemini")
    parts = response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return _parse_object("".join(p.get("text", "") for p in parts).strip()), model
