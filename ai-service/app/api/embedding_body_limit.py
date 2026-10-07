"""Bound request bytes before JSON parsing, scoped to the new internal route."""
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Scope, Receive, Send, Message


class EmbeddingBodyLimit:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or (scope["path"] != "/internal/embeddings" and not scope["path"].startswith("/internal/rubrics/")):
            await self.app(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 262144:
                await JSONResponse(status_code=413, content={"detail": {"code": "input_byte_limit"}})(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        sent = False

        async def bounded_receive() -> Message:
            nonlocal sent
            if sent:
                return await receive()
            sent = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, bounded_receive, send)
