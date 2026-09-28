"""Read-only voice briefings and conversations over a company's operations."""

import base64
import json
import os
import subprocess

from openai import OpenAI


def _client():
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    if not base_url or not key:
        raise RuntimeError("Voice AI is not configured")
    return OpenAI(base_url=base_url, api_key=key, timeout=45.0)


def business_briefing(snapshot):
    status = snapshot["operational_status"]
    total = status["total_deliveries"]
    def count(value, singular, plural=None):
        return f"{value} {singular if value == 1 else (plural or singular + 's')}"

    if total:
        progress = (
            f"I can see {count(total, 'delivery', 'deliveries')} recorded: {status['delivered']} delivered, "
            f"{status['active']} active and {status['pending']} still pending."
        )
    else:
        progress = "I don't see any deliveries recorded in this workspace yet."
    people = (
        f"There are {count(status['routes_active'], 'active route')} and "
        f"{count(status['drivers_available'], 'driver')} available."
    )
    issues = []
    if status["unresolved_exceptions"]:
        issues.append(count(status["unresolved_exceptions"], "unresolved exception"))
    if status["pending_approvals"]:
        issues.append(f"{count(status['pending_approvals'], 'approval')} waiting for you")
    attention = (
        f"The items needing attention are {' and '.join(issues)}."
        if issues else "Nothing is currently flagged for your approval or attention."
    )
    return f"Hey Boss, so today, here's the operation as it stands right now. {progress} {people} {attention} What would you like to look at?"


def _audio_response(messages):
    result = _client().chat.completions.create(
        model="gpt-audio",
        modalities=["text", "audio"],
        audio={"voice": "nova", "format": "mp3"},
        messages=messages,
    )
    message = result.choices[0].message
    audio = getattr(message, "audio", None)
    encoded = getattr(audio, "data", None)
    if not encoded:
        raise RuntimeError("Voice AI returned no audio")
    return {
        "audio": encoded,
        "mime_type": "audio/mpeg",
        "summary": getattr(audio, "transcript", None) or message.content or "",
    }


def speak_briefing(snapshot):
    text = business_briefing(snapshot)
    response = _audio_response([
        {"role": "system", "content": "You are a natural, warm South African business assistant. Read the supplied text exactly, without adding or changing facts. Speak clearly and conversationally."},
        {"role": "user", "content": f"Read this briefing aloud exactly: {text}"},
    ])
    response["summary"] = text
    return response


def convert_recording_to_wav(recording):
    if not recording or len(recording) > 4_000_000:
        raise ValueError("Record a short message under 4 MB")
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-t", "18", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"],
        input=recording, capture_output=True, timeout=22, check=False,
    )
    if process.returncode or len(process.stdout) < 1000:
        raise ValueError("Could not read that recording. Please try again.")
    return process.stdout


def answer_voice(recording, snapshot):
    wav = convert_recording_to_wav(recording)
    facts = {
        "status": snapshot["status"],
        "operational_status": snapshot["operational_status"],
        "activity": snapshot["activity"],
    }
    return _audio_response([
        {
            "role": "system",
            "content": (
                "You are Aiviate, a warm and concise business operations voice assistant. "
                "Only use this authenticated company's current snapshot for factual claims: "
                f"{json.dumps(facts)}. The snapshot includes all recorded work, not just today's work. "
                "Do not invent totals or claim access to live emails, suppliers or outside accounts. "
                "Voice mode is read-only: never claim to call, order, send, pay or change records. "
                "If asked to do so, explain that the operator must use an approved workflow. "
                "Answer the person's spoken question directly in one or two natural sentences."
            ),
        },
        {
            "role": "user",
            "content": [{
                "type": "input_audio",
                "input_audio": {"data": base64.b64encode(wav).decode("ascii"), "format": "wav"},
            }],
        },
    ])