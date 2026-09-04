"""
Recourse PDF/paper text-extraction sidecar (PyMuPDF).

Pure stateless compute: Recourse sends a PDF (http/https URL, or bytes) and the
sidecar returns extracted text. It holds no corpus and owns no content. Honesty
contract mirrors Recourse intake: a download/parse failure returns a 4xx with a
structured error -- never fabricated text. Extraction is native PyMuPDF text
parsing only (no OCR, no execution), so it is honest about what it can do: text
extraction from born-digital pages; scanned/image-only PDFs yield empty text
and are reported as such, not invented.

Bounds: URL must be http/https; payload and page/text counts are capped so a
hostile or huge input cannot exhaust memory. Defaults are conservative.

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 127.0.0.1 --port 8600
"""

from __future__ import annotations

import base64
import io
import ipaddress
import socket
import urllib.request
from typing import Any, Optional
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

import pymupdf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Recourse PDF sidecar", version="1.0.0")

MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_PAGES = 400
MAX_PAGE_CHARS = 400_000  # ~2x a dense A4 page; keeps responses bounded
MAX_ACCEPTED_BYTES = 60 * 1024 * 1024  # 60 MB upload cap


def _is_blocked_ip(ip_str: str) -> bool:
    """True when an IP is not a safe public destination (SSRF guard)."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # not even an IP -> treat as unsafe
    # Normalize IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1) down to its embedded
    # IPv4 so a private address cannot hide behind the mapped form.
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
    """Reject http(s) URLs whose host is a literal private/loopback address, or
    whose DNS resolution yields any private/loopback/link-local address. This is
    the SSRF defense: the sidecar must never fetch cloud metadata, internal
    services, or localhost, no matter how the host is spelled."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="url must be http(s)")
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="url must include a host")

    # Literal IP host -> decide directly.
    try:
        if _is_blocked_ip(host):
            raise HTTPException(status_code=400, detail="url host is a private/loopback/link-local address")
        return
    except ValueError:
        pass  # host is a hostname, resolve below

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="url host does not resolve")

    resolved = {info[4][0] for info in infos}
    for ip in resolved:
        if _is_blocked_ip(ip):
            raise HTTPException(
                status_code=400,
                detail=f"url host resolves to a private/loopback/link-local address ({ip}) - blocked",
            )


class _SafeRedirectHandler(HTTPRedirectHandler):
    """Re-check the SSRF guard on every redirect target before following it, so
    a public page can never bounce the fetch onto an internal host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        _assert_public_url(str(newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class UrlIn(BaseModel):
    url: str
    max_pages: int = Field(default=MAX_PAGES, ge=1, le=MAX_PAGES)


class BytesIn(BaseModel):
    data_base64: str
    filename: Optional[str] = None
    max_pages: int = Field(default=MAX_PAGES, ge=1, le=MAX_PAGES)


class TextPage(BaseModel):
    page: int
    chars: int
    text: str


def _extract(data: bytes, max_pages: int) -> dict[str, Any]:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"not a readable PDF: {e}")

    pages: list[dict[str, Any]] = []
    total = 0
    for i in range(min(doc.page_count, max_pages)):
        try:
            text = doc[i].get_text()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"page {i} extraction failed: {e}")
        text = (text or "").strip()
        if len(text) > MAX_PAGE_CHARS:
            text = text[:MAX_PAGE_CHARS]
        pages.append({"page": i + 1, "chars": len(text), "text": text})
        total += len(text)

    meta: dict[str, Any] = {}
    try:
        md = doc.metadata or {}
        meta = {k: md.get(k) for k in ("title", "author", "subject", "creationDate", "modDate") if md.get(k)}
    except Exception:  # noqa: BLE001
        pass

    scanned = total == 0
    return {
        "ok": True,
        "page_count": doc.page_count,
        "pages_extracted": len(pages),
        "total_chars": total,
        "metadata": meta,
        "scanned_only_image_pdf": scanned,  # honest: empty text, not fabricated
        "pages": pages,
        "text": "\n\n".join(p["text"] for p in pages),
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "pdf", "pymupdf": pymupdf.__version__ if hasattr(pymupdf, "__version__") else "n/a"}


@app.post("/pdf/url")
def pdf_url(inp: UrlIn) -> dict[str, Any]:
    _assert_public_url(inp.url)
    opener = build_opener(_SafeRedirectHandler())
    try:
        req = Request(inp.url, headers={"User-Agent": "recourse-pdf-sidecar/1.0"})
        with opener.open(req, timeout=30) as resp:
            data = resp.read(MAX_DOWNLOAD_BYTES + 1)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"download failed: {e}")
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise HTTPException(status_code=413, detail="pdf too large to download")
    return _extract(data, inp.max_pages)


@app.post("/pdf/bytes")
def pdf_bytes(inp: BytesIn) -> dict[str, Any]:
    try:
        data = base64.b64decode(inp.data_base64, validate=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"data_base64 not valid base64: {e}")
    if len(data) > MAX_ACCEPTED_BYTES:
        raise HTTPException(status_code=413, detail="pdf bytes too large")
    return _extract(data, inp.max_pages)
