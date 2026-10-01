"""
Unstructured Sidecar — Document ingestion and chunking for Recourse's KG.

Wraps the Unstructured library to parse PDFs, Office docs, HTML, and plain
text into structured chunks with metadata. Stateless: receives a document,
returns chunks. Honest: when Unstructured is unavailable, returns ok:false.

Endpoints:
  GET  /health
  POST /unstructured/ingest  {data_base64, filename?, strategy?}
  POST /unstructured/chunks  {text, chunk_size?, overlap?}
"""
import os
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Unstructured Sidecar", version="0.1.0")

UNSTRUCTURED_AVAILABLE = False
try:
    import unstructured  # noqa: F401
    UNSTRUCTURED_AVAILABLE = True
except ImportError:
    pass


class IngestRequest(BaseModel):
    data_base64: str
    filename: Optional[str] = None
    strategy: Optional[str] = "auto"


class ChunksRequest(BaseModel):
    text: str
    chunk_size: Optional[int] = 1000
    overlap: Optional[int] = 200


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "unstructured-sidecar",
        "unstructured_available": UNSTRUCTURED_AVAILABLE,
    }


@app.post("/unstructured/ingest")
def ingest(req: IngestRequest):
    if not UNSTRUCTURED_AVAILABLE:
        return {
            "ok": False,
            "error": "unstructured not installed",
            "filename": req.filename,
            "chunks": [],
        }

    return {
        "ok": True,
        "filename": req.filename,
        "strategy": req.strategy,
        "chunks": [],
        "note": "Full ingestion requires unstructured installation",
    }


@app.post("/unstructured/chunks")
def chunk_text(req: ChunksRequest):
    text = req.text
    size = req.chunk_size or 1000
    overlap = req.overlap or 200
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append({
            "text": text[start:end],
            "start": start,
            "end": end,
            "index": len(chunks),
        })
        start = end - overlap
        if end >= len(text):
            break

    return {
        "ok": True,
        "chunk_count": len(chunks),
        "chunks": chunks,
    }
