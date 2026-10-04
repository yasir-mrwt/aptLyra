"""Bounded fetches: known diagram CDN and explicitly trusted callback origin."""
import ipaddress
import os
import re
import socket
from urllib.parse import urlsplit
import requests
from fastapi import HTTPException

MAX_IMAGE_BYTES = 10 * 1024 * 1024


def validate_callback_url(url: str) -> str:
    configured = os.getenv("RESUME_CALLBACK_BASE_URL")
    if not configured:
        raise HTTPException(503, "Resume callback origin is not configured")
    try:
        target, base = urlsplit(url), urlsplit(configured)
        origin = (target.scheme, target.hostname, target.port or (443 if target.scheme == "https" else 80))
        expected = (base.scheme, base.hostname, base.port or (443 if base.scheme == "https" else 80))
        valid = (origin == expected and target.scheme in ("http", "https") and target.hostname
                 and not target.username and not target.password and not target.query and not target.fragment
                 and not base.username and not base.password and not base.query and not base.fragment
                 and base.path in ("", "/")
                 and re.fullmatch(r"/api/resume/webhook/process-resume/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", target.path))
        if os.getenv("NODE_ENV", "production") != "development" and target.scheme != "https":
            valid = False
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(422, "Untrusted resume callback destination")
    return url


def fetch_diagram(url: str) -> bytes:
    try:
        target = urlsplit(url)
        if (target.scheme != "https" or target.hostname != "res.cloudinary.com" or target.port not in (None, 443)
                or target.username or target.password or target.fragment or target.query
                or not re.fullmatch(r"/[A-Za-z0-9_-]+/image/upload/[A-Za-z0-9_./-]+", target.path)
                or ".." in target.path):
            raise ValueError("Only uploaded Cloudinary diagrams are accepted")
        addresses = socket.getaddrinfo(target.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
            raise ValueError("Unsafe diagram destination")
        with requests.get(url, timeout=(5, 20), stream=True, allow_redirects=False) as response:
            if response.status_code != 200:
                raise ValueError("Diagram could not be fetched")
            # The existing whiteboard and Groq vision request use PNG.
            if response.headers.get("Content-Type", "").split(";")[0].lower() != "image/png":
                raise ValueError("Diagram must be PNG")
            if int(response.headers.get("Content-Length", "0")) > MAX_IMAGE_BYTES:
                raise ValueError("Diagram too large")
            chunks, size = [], 0
            for chunk in response.iter_content(64 * 1024):
                size += len(chunk)
                if size > MAX_IMAGE_BYTES:
                    raise ValueError("Diagram too large")
                chunks.append(chunk)
            content = b"".join(chunks)
            if not content.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid PNG diagram")
            return content
    except (ValueError, OSError, requests.RequestException):
        raise HTTPException(422, "Diagram unavailable or unsafe. Please upload it again.") from None
