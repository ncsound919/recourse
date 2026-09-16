"""
Recourse transcription sidecar (audio/video -> text).

Stateless compute: Recourse sends an audio/video URL or bytes and gets a
transcript back. The sidecar owns no corpus, stores nothing, and never
fabricates a transcript. If the ASR backend (faster-whisper) is not installed,
`/transcribe` returns `{ok: false, reason: "..."}` -- honestly unavailable
rather than invented text.

Bounds + SSRF defense mirror the PDF sidecar: http(s) only, private/loopback/
link-local destinations blocked (including on redirects), size caps enforced.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 127.0.0.1 --port 8900
"""

from __future__ import annotations

import base64
import ipaddress
import os
import socket
import tempfile
from typing import Any, Optional
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Recourse transcription sidecar", version="1.0.0")

MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024  # 100 MB media cap
MAX_ACCEPTED_BYTES = 120 * 1024 * 1024
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "base")

_model = None  # lazy singleton


def _is_blocked_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="url must be http(s)")
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="url must include a host")
    try:
        if _is_blocked_ip(host):
            raise HTTPException(status_code=400, detail="url host is a private/loopback/link-local address")
        return
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="url host does not resolve")
    for info in infos:
        if _is_blocked_ip(info[4][0]):
            raise HTTPException(status_code=400, detail="url host resolves to a private/loopback/link-local address")


class _SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        _assert_public_url(str(newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class TranscribeUrlIn(BaseModel):
    url: str
    language: Optional[str] = None
    model: str = Field(default=DEFAULT_MODEL)


class TranscribeBytesIn(BaseModel):
    data_base64: str
    filename: Optional[str] = None
    language: Optional[str] = None
    model: str = Field(default=DEFAULT_MODEL)


def _whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def _get_model(name: str):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel  # type: ignore

        _model = WhisperModel(name, device="cpu", compute_type="int8")
    return _model


def _transcribe_bytes(data: bytes, language: Optional[str], model_name: str) -> dict[str, Any]:
    if not _whisper_available():
        return {
            "ok": False,
            "reason": "faster-whisper is not installed on the transcription sidecar; install it to enable real transcription",
        }
    suffix = ".bin"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as fh:
            fh.write(data)
            tmp_path = fh.name
        model = _get_model(model_name)
        segments, info = model.transcribe(tmp_path, language=language)
        out_segments: list[dict[str, Any]] = []
        text_parts: list[str] = []
        for seg in segments:
            out_segments.append({"start": round(float(seg.start), 3), "end": round(float(seg.end), 3), "text": (seg.text or "").strip()})
            text_parts.append((seg.text or "").strip())
        text = " ".join(p for p in text_parts if p).strip()
        return {
            "ok": True,
            "language": getattr(info, "language", language),
            "duration": getattr(info, "duration", None),
            "segments": out_segments,
            "text": text,
            "chars": len(text),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": f"transcription failed: {e}"}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:  # noqa: BLE001
                pass


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "transcribe",
        "whisper_available": _whisper_available(),
        "default_model": DEFAULT_MODEL,
    }


@app.post("/transcribe/url")
def transcribe_url(inp: TranscribeUrlIn) -> dict[str, Any]:
    _assert_public_url(inp.url)
    opener = build_opener(_SafeRedirectHandler())
    try:
        req = Request(inp.url, headers={"User-Agent": "recourse-transcribe-sidecar/1.0"})
        with opener.open(req, timeout=60) as resp:
            data = resp.read(MAX_DOWNLOAD_BYTES + 1)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"download failed: {e}")
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise HTTPException(status_code=413, detail="media too large to download")
    return _transcribe_bytes(data, inp.language, inp.model)


@app.post("/transcribe/bytes")
def transcribe_bytes(inp: TranscribeBytesIn) -> dict[str, Any]:
    try:
        data = base64.b64decode(inp.data_base64, validate=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"data_base64 not valid base64: {e}")
    if len(data) > MAX_ACCEPTED_BYTES:
        raise HTTPException(status_code=413, detail="media bytes too large")
    return _transcribe_bytes(data, inp.language, inp.model)
