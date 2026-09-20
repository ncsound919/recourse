"""Tests for the voice-clone sidecar's pure logic and HTTP contract.

Run from this directory:
    pytest test_main.py -q
"""
from __future__ import annotations

import base64
import io
import wave

import pytest
from fastapi.testclient import TestClient

import main


def make_wav(seconds: float = 3.0, sample_rate: int = 16000, channels: int = 1) -> bytes:
    frames = max(1, int(round(seconds * sample_rate)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * frames * channels)
    return buf.getvalue()


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


client = TestClient(main.app)


# --- pure helpers ---------------------------------------------------------


def test_wav_info_reads_header():
    rate, duration = main._wav_info(make_wav(seconds=4.0, sample_rate=16000))
    assert rate == 16000
    assert duration == pytest.approx(4.0, abs=0.01)


def test_wav_info_is_none_for_non_wav():
    assert main._wav_info(b"not a wav at all") == (None, None)


def test_probe_reference_parses_without_a_temp_file():
    info = main._probe_reference(make_wav(seconds=5.0, sample_rate=22050))
    assert info["sample_rate"] == 22050
    assert info["channels"] == 1
    assert info["duration_sec"] == pytest.approx(5.0, abs=0.01)
    assert info["bytes"] > 44


def test_probe_reference_is_safe_on_non_wav():
    info = main._probe_reference(b"garbage")
    assert info["duration_sec"] is None
    assert info["bytes"] == 7


@pytest.mark.parametrize(
    "duration,expected_suitable",
    [(1.0, False), (3.0, True), (60.0, True), (200.0, False)],
)
def test_reference_verdict_boundaries(duration, expected_suitable):
    suitable, reason = main._reference_verdict({"duration_sec": duration})
    assert suitable is expected_suitable
    if not expected_suitable:
        assert reason


def test_reference_verdict_allows_unmeasurable_clips():
    suitable, reason = main._reference_verdict({"duration_sec": None})
    assert suitable is True
    assert reason is None


def test_decode_reference_rejects_bad_base64_and_oversize(monkeypatch):
    with pytest.raises(Exception):
        main._decode_reference("!!!not-base64!!!")
    with pytest.raises(Exception):
        main._decode_reference("")
    monkeypatch.setattr(main, "MAX_REFERENCE_BYTES", 10)
    with pytest.raises(Exception):
        main._decode_reference(b64(make_wav(1.0)))


# --- HTTP contract --------------------------------------------------------


def test_health_reports_engines_honestly():
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["service"] == "tts"
    assert isinstance(body["engines"], list)
    assert body["tts_available"] is (len(body["engines"]) > 0)
    # No torch installed locally -> honestly reports nothing available.
    if not body["engines"]:
        assert body["default_engine"] is None


def test_validate_reports_suitable_for_a_good_clip():
    res = client.post("/voice/validate", json={"reference_base64": b64(make_wav(6.0))})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["suitable"] is True
    assert body["duration_sec"] == pytest.approx(6.0, abs=0.05)


def test_validate_rejects_a_too_short_clip():
    body = client.post("/voice/validate", json={"reference_base64": b64(make_wav(1.0))}).json()
    assert body["suitable"] is False
    assert "3s+" in body["reason"] or "3" in body["reason"]


def test_validate_400s_on_invalid_base64():
    assert client.post("/voice/validate", json={"reference_base64": "!!!"}).status_code == 400


def test_clone_refuses_without_a_backend(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: [])
    body = client.post(
        "/voice/clone",
        json={"text": "hello", "reference_base64": b64(make_wav(5.0))},
    ).json()
    assert body["ok"] is False
    assert "no zero-shot TTS backend" in body["reason"]


def test_clone_400s_on_blank_text():
    assert (
        client.post("/voice/clone", json={"text": "   ", "reference_base64": b64(make_wav(5.0))}).status_code
        == 400
    )


def test_clone_413s_on_oversized_text(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: ["xtts"])
    res = client.post(
        "/voice/clone",
        json={"text": "x" * (main.MAX_TEXT_CHARS + 1), "reference_base64": b64(make_wav(5.0))},
    )
    assert res.status_code == 413


def test_clone_rejects_an_unknown_engine(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: ["xtts"])
    body = client.post(
        "/voice/clone",
        json={"text": "hi", "reference_base64": b64(make_wav(5.0)), "engine": "bogus"},
    ).json()
    assert body["ok"] is False
    assert "not available" in body["reason"]


def test_clone_f5_without_transcript_falls_back_to_xtts(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: ["xtts", "f5tts"])
    monkeypatch.setattr(main, "_synthesize_xtts", lambda text, ref, lang, speed: make_wav(1.0, 24000))
    body = client.post(
        "/voice/clone",
        json={"text": "hi", "reference_base64": b64(make_wav(5.0)), "engine": "f5tts"},
    ).json()
    assert body["ok"] is True
    assert body["engine"] == "xtts"


def test_clone_f5_without_transcript_and_no_xtts_refuses_clearly(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: ["f5tts"])
    body = client.post(
        "/voice/clone",
        json={"text": "hi", "reference_base64": b64(make_wav(5.0)), "engine": "f5tts"},
    ).json()
    assert body["ok"] is False
    assert "reference_text" in body["reason"]


def test_clone_success_parses_header_and_returns_real_audio(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: ["xtts"])
    monkeypatch.setattr(main, "_synthesize_xtts", lambda text, ref, lang, speed: make_wav(2.0, 24000))
    body = client.post(
        "/voice/clone",
        json={"text": "hello world", "reference_base64": b64(make_wav(5.0))},
    ).json()
    assert body["ok"] is True
    assert body["engine"] == "xtts"
    assert body["sample_rate"] == 24000
    assert body["duration_sec"] == pytest.approx(2.0, abs=0.05)
    assert body["chars"] == len("hello world")
    # The returned audio is a real WAV, not an opaque blob.
    raw = base64.b64decode(body["audio_base64"])
    assert raw[:4] == b"RIFF" and raw[8:12] == b"WAVE"
    assert main._wav_info(raw)[1] == pytest.approx(2.0, abs=0.05)


def test_clone_fails_honestly_when_a_short_clip_is_used(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: ["xtts"])
    body = client.post(
        "/voice/clone",
        json={"text": "hi", "reference_base64": b64(make_wav(1.0))},
    ).json()
    assert body["ok"] is False
    assert body["duration_sec"] == pytest.approx(1.0, abs=0.05)


def test_clone_honest_failure_when_backend_raises(monkeypatch):
    def boom(*_args):
        raise RuntimeError("model exploded")

    monkeypatch.setattr(main, "_available_engines", lambda: ["xtts"])
    monkeypatch.setattr(main, "_synthesize_xtts", boom)
    body = client.post(
        "/voice/clone",
        json={"text": "hi", "reference_base64": b64(make_wav(5.0))},
    ).json()
    assert body["ok"] is False
    assert "model exploded" in body["reason"]


def test_clone_rejects_empty_audio_from_a_backend(monkeypatch):
    monkeypatch.setattr(main, "_available_engines", lambda: ["xtts"])
    monkeypatch.setattr(main, "_synthesize_xtts", lambda *a: b"")
    body = client.post(
        "/voice/clone",
        json={"text": "hi", "reference_base64": b64(make_wav(5.0))},
    ).json()
    assert body["ok"] is False
    assert "no audio" in body["reason"]


def test_body_size_cap_rejects_oversized_requests(monkeypatch):
    monkeypatch.setattr(main, "MAX_BODY_BYTES", 2048)
    res = client.post(
        "/voice/validate",
        json={"reference_base64": "A" * 8192},
    )
    assert res.status_code == 413
