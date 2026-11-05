"""Local stand-ins for Gmail/Google OAuth and an OpenAI-compatible LLM.

Real HTTP servers on 127.0.0.1, so the production code paths (URL building, auth headers,
token refresh, JSON parsing, timeouts, dropped connections) run for real. Nothing here
touches the network or any real account. Used by the tests and by the browser walkthrough.
"""
import base64
import email as email_lib
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse


class _Base:
    """A tiny HTTP server running in a thread, with a handler class built by the subclass."""

    def make_handler(self):  # pragma: no cover - overridden
        raise NotImplementedError

    def start(self):
        self.server = HTTPServer(("127.0.0.1", 0), self.make_handler())
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


def _json(handler, status, payload):
    body = json.dumps(payload).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def b64url(text):
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii").rstrip("=")


class FakeGoogle(_Base):
    """Gmail API (messages list/get/send) plus the OAuth token endpoint."""

    API = "/gmail/v1/users/me"

    def __init__(self):
        self.reset()

    def reset(self):
        self.messages = {}
        self.sent = []
        self.requests = []
        self.token_calls = 0
        self.valid_tokens = {"good-access"}
        self.refreshed_token = "fresh-access"
        self.send_mode = "ok"      # ok | forbidden | error | hangup
        self.list_status = 200

    @property
    def gmail_base(self):
        return f"{self.base}{self.API}"

    @property
    def token_url(self):
        return f"{self.base}/token"

    def add_message(self, message_id, sender, subject, body, *, thread=None, reply_to=None,
                    rfc_id=None, date="Mon, 3 Nov 2026 09:00:00 +0200"):
        headers = [
            {"name": "From", "value": sender},
            {"name": "Subject", "value": subject},
            {"name": "Message-ID", "value": rfc_id or f"<{message_id}@mail.example>"},
            {"name": "Date", "value": date},
        ]
        if reply_to:
            headers.append({"name": "Reply-To", "value": reply_to})
        self.messages[message_id] = {
            "id": message_id, "threadId": thread or f"thread-{message_id}", "snippet": body[:120],
            "payload": {"headers": headers, "body": {"data": b64url(body)}},
        }

    def set_header(self, message_id, name, value):
        for header in self.messages[message_id]["payload"]["headers"]:
            if header["name"].lower() == name.lower():
                header["value"] = value

    def make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _authorised(self):
                token = (self.headers.get("Authorization") or "").replace("Bearer ", "", 1)
                outer.requests.append((self.command, self.path, token))
                if token not in outer.valid_tokens:
                    _json(self, 401, {"error": {"code": 401, "message": "Invalid Credentials"}})
                    return False
                return True

            def do_GET(self):
                path = urlparse(self.path).path
                if not path.startswith(outer.API + "/messages"):
                    return _json(self, 404, {"error": {"code": 404}})
                if not self._authorised():
                    return
                if outer.list_status != 200:
                    return _json(self, outer.list_status, {"error": {"code": outer.list_status, "message": "backend error"}})
                tail = path[len(outer.API + "/messages"):].strip("/")
                if tail:
                    message = outer.messages.get(tail)
                    return _json(self, 200, message) if message else _json(self, 404, {"error": {"code": 404}})
                limit = int((parse_qs(urlparse(self.path).query).get("maxResults") or ["10"])[0])
                refs = [{"id": m["id"], "threadId": m["threadId"]} for m in outer.messages.values()][:limit]
                _json(self, 200, {"messages": refs, "resultSizeEstimate": len(refs)})

            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                raw = self.rfile.read(length) if length else b""
                path = urlparse(self.path).path
                if path == "/token":
                    outer.token_calls += 1
                    outer.valid_tokens.add(outer.refreshed_token)
                    return _json(self, 200, {"access_token": outer.refreshed_token, "expires_in": 3600})
                if path == outer.API + "/messages/send":
                    if not self._authorised():
                        return
                    if outer.send_mode == "hangup":
                        self.connection.shutdown(socket.SHUT_RDWR)
                        return
                    if outer.send_mode == "forbidden":
                        return _json(self, 403, {"error": {"code": 403, "message": "denied",
                                                           "errors": [{"reason": "insufficientPermissions"}]}})
                    if outer.send_mode == "error":
                        return _json(self, 500, {"error": {"code": 500, "message": "backend error"}})
                    payload = json.loads(raw or b"{}")
                    encoded = payload["raw"]
                    mime = email_lib.message_from_bytes(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
                    body = mime.get_payload(decode=True).decode("utf-8").replace(chr(13) + chr(10), chr(10)).rstrip(chr(10))  # MIME adds a closing line break
                    outer.sent.append({
                        "to": mime["To"], "subject": mime["Subject"], "in_reply_to": mime["In-Reply-To"],
                        "body": body, "thread_id": payload.get("threadId"), "token": (self.headers.get("Authorization") or ""),
                    })
                    return _json(self, 200, {"id": f"sent-{len(outer.sent)}", "threadId": payload.get("threadId")})
                _json(self, 404, {"error": {"code": 404}})

        return Handler


class FakeLLM(_Base):
    """An OpenAI-compatible /chat/completions endpoint whose answer the test scripts."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.requests = []
        self.reply = {"summary": "", "replies": [], "warnings": []}
        self.status = 200
        self.raw_content = None   # send this exact string instead of JSON (to test bad output)

    @property
    def openai_base(self):
        return f"{self.base}/v1"

    def make_handler(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                length = int(self.headers.get("Content-Length", 0))
                request = json.loads(self.rfile.read(length) or b"{}")
                outer.requests.append({"auth": self.headers.get("Authorization"), "json": request})
                if outer.status != 200:
                    return _json(self, outer.status, {"error": {"message": "provider is unhappy with sk-SECRET", "code": "boom"}})
                reply = outer.reply(request) if callable(outer.reply) else outer.reply
                content = outer.raw_content if outer.raw_content is not None else json.dumps(reply)
                _json(self, 200, {"choices": [{"message": {"role": "assistant", "content": content}}]})

        return Handler
