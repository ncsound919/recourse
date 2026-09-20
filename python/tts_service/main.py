"""
Recourse voice-clone sidecar (text + reference clip -> speech in that voice).

Zero-shot, STATELESS compute: Recourse sends the text to synthesize and the
reference voice clip with every request; the sidecar returns the generated
audio. It owns no corpus, stores nothing, and never fabricates a voice. If no
zero-shot TTS backend is installed, `/voice/clone` returns
`{ok: false, reason: "..."}` -- honestly unavailable rather than a different
voice pretending to be the reference.

Note on the Web Speech API: `window.speechSynthesis` cannot be given a custom
voice (there is no registration API) and its output cannot be captured, so the
browser cannot "wrap" a clone around it. Recourse therefore synthesizes here and
plays the returned audio -- see `src/lib/voiceClone.ts`.

Backends (auto-selected, first available wins):
    xtts    coqui-tts XTTS-v2   -- reference clip only (best zero-shot default)
    f5tts   f5-tts              -- reference clip + its transcript

Run:
    pip install -r requirements.txt
    uvicorn main:app --host 127.0.0.1 --port 8910
"""

from __future__ import annotations

import base64
import importlib.util
import io
import os
import tempfile
import time
import wave
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Recourse voice-clone sidecar", version="1.0.0")

MAX_REFERENCE_BYTES = 25 * 1024 * 1024  # 25 MB reference clip cap
MAX_TEXT_CHARS = 5000
MIN_REFERENCE_SEC = 3.0
MAX_REFERENCE_SEC = 120.0
# Reject oversized bodies before FastAPI buffers the whole JSON document. The
# base64 reference is ~1.33x its bytes, so this is generous headroom over
# MAX_REFERENCE_BYTES while still bounding memory on a hostile request.
MAX_BODY_BYTES = 40 * 1024 * 1024

DEFAULT_LANGUAGE = os.environ.get("TTS_LANGUAGE", "en")
XTTS_MODEL = os.environ.get("XTTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
F5_MODEL = os.environ.get("F5_TTS_MODEL", "F5TTS_v1_Base")

_model = None  # lazy singleton
_loaded_backend: Optional[str] = None


class CloneIn(BaseModel):
    text: str
    reference_base64: str
    reference_filename: Optional[str] = None
    reference_text: Optional[str] = None
    language: str = Field(default=DEFAULT_LANGUAGE)
    engine: Optional[str] = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class ReferenceIn(BaseModel):
    reference_base64: str
    reference_filename: Optional[str] = None


@app.middleware("http")
async def _cap_body_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "request body too large"})
    return await call_next(request)


def _has(module: str) -> bool:
    """Cheap availability probe.

    Uses `find_spec` rather than `__import__`: importing `TTS` pulls in torch
    (seconds of work), which would make `/health` exceed the client's 2s timeout
    and report a healthy sidecar as offline.
    """
    try:
        return importlib.util.find_spec(module) is not None
    except Exception:  # noqa: BLE001
        return False


def _xtts_available() -> bool:
    return _has("TTS")


def _f5tts_available() -> bool:
    return _has("f5_tts")


def _available_engines() -> list[str]:
    engines: list[str] = []
    if _xtts_available():
        engines.append("xtts")
    if _f5tts_available():
        engines.append("f5tts")
    return engines


def _decode_reference(data_b64: str) -> bytes:
    try:
        data = base64.b64decode(data_b64, validate=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"reference_base64 not valid base64: {e}")
    if not data:
        raise HTTPException(status_code=400, detail="reference clip is empty")
    if len(data) > MAX_REFERENCE_BYTES:
        raise HTTPException(status_code=413, detail="reference clip too large")
    return data


def _wav_info(data: bytes) -> tuple[Optional[int], Optional[float]]:
    """Parse (sample_rate, duration_sec) from WAV bytes; (None, None) if not WAV.

    Reads the header rather than assuming a 44-byte offset: real encoders (and
    the f5/XTTS writers) may insert extra chunks, which made the previous
    arithmetic `(len(data) - 44) / 2 / rate` silently wrong.
    """
    try:
        with wave.open(io.BytesIO(data), "rb") as wf:
            rate = wf.getframerate() or None
            frames = wf.getnframes()
            duration = round(frames / float(rate), 3) if rate else None
            return rate, duration
    except Exception:  # noqa: BLE001
        return None, None


def _probe_reference(data: bytes) -> dict[str, Any]:
    """Best-effort duration/samplerate probe; never fatal, never leaks a file.

    Parses straight from bytes (wave, then soundfile as a fallback for non-WAV
    containers) so no temporary file is created on this path.
    """
    info: dict[str, Any] = {"bytes": len(data), "duration_sec": None, "sample_rate": None, "channels": None}
    try:
        with wave.open(io.BytesIO(data), "rb") as wf:
            rate = wf.getframerate() or 1
            info["sample_rate"] = rate
            info["channels"] = wf.getnchannels()
            info["duration_sec"] = round(wf.getnframes() / float(rate), 3)
        return info
    except Exception:  # noqa: BLE001
        pass
    if _has("soundfile"):
        try:
            import soundfile as sf  # type: ignore

            meta = sf.info(io.BytesIO(data))
            info["sample_rate"] = meta.samplerate
            info["channels"] = meta.channels
            info["duration_sec"] = round(float(meta.duration), 3)
        except Exception:  # noqa: BLE001
            pass
    return info


def _reference_verdict(info: dict[str, Any]) -> tuple[bool, Optional[str]]:
    dur = info.get("duration_sec")
    if dur is None:
        return True, None  # cannot measure -- do not block, the backend will decide
    if dur < MIN_REFERENCE_SEC:
        return False, f"reference clip is {dur:.1f}s; {MIN_REFERENCE_SEC:.0f}s+ of clean speech is needed"
    if dur > MAX_REFERENCE_SEC:
        return False, f"reference clip is {dur:.0f}s; keep it under {MAX_REFERENCE_SEC:.0f}s"
    return True, None


def _load_xtts():
    global _model, _loaded_backend
    if _loaded_backend == "xtts" and _model is not None:
        return _model
    from TTS.api import TTS  # type: ignore

    device = os.environ.get("TTS_DEVICE", "cpu")
    _model = TTS(XTTS_MODEL).to(device)
    _loaded_backend = "xtts"
    return _model


def _load_f5():
    global _model, _loaded_backend
    if _loaded_backend == "f5tts" and _model is not None:
        return _model
    from f5_tts.api import F5TTS  # type: ignore

    _model = F5TTS(model=F5_MODEL)
    _loaded_backend = "f5tts"
    return _model


def _synthesize_xtts(text: str, ref_path: str, language: str, speed: float) -> bytes:
    model = _load_xtts()
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as fh:
            out_path = fh.name
        model.tts_to_file(
            text=text,
            speaker_wav=ref_path,
            language=language,
            file_path=out_path,
            speed=speed,
        )
        with open(out_path, "rb") as fh:
            return fh.read()
    finally:
        if out_path:
            try:
                os.unlink(out_path)
            except Exception:  # noqa: BLE001
                pass


def _synthesize_f5tts(text: str, ref_path: str, ref_text: str, speed: float) -> bytes:
    model = _load_f5()
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as fh:
            out_path = fh.name
        model.infer(
            ref_file=ref_path,
            ref_text=ref_text,
            gen_text=text,
            file_wave=out_path,
            speed=speed,
        )
        with open(out_path, "rb") as fh:
            return fh.read()
    finally:
        if out_path:
            try:
                os.unlink(out_path)
            except Exception:  # noqa: BLE001
                pass


@app.get("/health")
def health() -> dict[str, Any]:
    engines = _available_engines()
    return {
        "ok": True,
        "service": "tts",
        "engines": engines,
        "tts_available": bool(engines),
        "default_engine": engines[0] if engines else None,
        "xtts_model": XTTS_MODEL,
        "f5_model": F5_MODEL,
        "device": os.environ.get("TTS_DEVICE", "cpu"),
    }


@app.post("/voice/validate")
def validate_reference(inp: ReferenceIn) -> dict[str, Any]:
    data = _decode_reference(inp.reference_base64)
    info = _probe_reference(data)
    suitable, reason = _reference_verdict(info)
    return {"ok": True, "suitable": suitable, "reason": reason, **info}


@app.post("/voice/clone")
def clone(inp: CloneIn) -> dict[str, Any]:
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=413, detail=f"text exceeds {MAX_TEXT_CHARS} characters")

    engines = _available_engines()
    if not engines:
        return {
            "ok": False,
            "reason": (
                "no zero-shot TTS backend installed on the voice sidecar; "
                "install coqui-tts (XTTS-v2) or f5-tts to synthesize in the reference voice"
            ),
        }

    if inp.engine and inp.engine not in engines:
        return {
            "ok": False,
            "reason": f"engine '{inp.engine}' is not available on the voice sidecar; available: {', '.join(engines)}",
        }
    engine = inp.engine or engines[0]
    reference_text = (inp.reference_text or "").strip()
    # f5-tts conditions on the reference clip's transcript; without it, fall back
    # to XTTS when present, otherwise refuse rather than fail obscurely inside
    # the XTTS loader.
    if engine == "f5tts" and not reference_text:
        if "xtts" in engines:
            engine = "xtts"
        else:
            return {
                "ok": False,
                "reason": "f5-tts needs reference_text (the reference clip's transcript); provide it or install coqui-tts (XTTS-v2)",
            }

    data = _decode_reference(inp.reference_base64)
    info = _probe_reference(data)
    suitable, reason = _reference_verdict(info)
    if not suitable:
        return {"ok": False, "reason": reason, **info}

    ref_path = None
    started = time.time()
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as fh:
            fh.write(data)
            ref_path = fh.name

        if engine == "f5tts":
            audio = _synthesize_f5tts(text, ref_path, reference_text, inp.speed)
        else:
            audio = _synthesize_xtts(text, ref_path, inp.language or DEFAULT_LANGUAGE, inp.speed)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": f"{engine} synthesis failed: {e}"}
    finally:
        if ref_path:
            try:
                os.unlink(ref_path)
            except Exception:  # noqa: BLE001
                pass

    if not audio:
        return {"ok": False, "reason": f"{engine} returned no audio"}

    sample_rate, duration = _wav_info(audio)

    return {
        "ok": True,
        "engine": engine,
        "language": inp.language or DEFAULT_LANGUAGE,
        "mime": "audio/wav",
        "sample_rate": sample_rate,
        "duration_sec": duration,
        "chars": len(text),
        "latency_ms": int((time.time() - started) * 1000),
        "audio_base64": base64.b64encode(audio).decode("ascii"),
    }
