#!/usr/bin/env python3
"""Local TTS engine for Hermes UI.

Speaks line-delimited JSON over stdio. One request per line, one response per
line. Same protocol as LSP/minimal JSON-RPC without the envelopes.

Request:
  {"id": "abc", "op": "synthesize", "text": "hello", "voice": "af_heart",
   "speed": 1.0, "lang": "en-us"}

Response (success):
  {"id": "abc", "ok": true, "audio_b64": "<base64 wav>", "sample_rate": 24000,
   "duration_ms": 1234, "engine": "kokoro"}

Response (error):
  {"id": "abc", "ok": false, "error": "text is empty"}

Notification (engine → Node, no id, may be sent at any time):
  {"event": "ready"}                                    # model loaded
  {"event": "download_progress", "received": 1234,
   "total": 9000000}                                    # bytes

Op "list_voices":
  {"id": "...", "op": "list_voices"} → {"id": "...", "ok": true, "voices": [...]}

Op "ping": always replies {"ok": true} — used by Node to confirm subprocess is alive.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any

# Lazy imports — these happen inside op handlers so the engine can boot even if
# the package install is incomplete; the error then surfaces in the first
# synthesize call instead of killing the subprocess at startup.
kokoro = None  # type: ignore[assignment]
KOKORO = None  # type: ignore[assignment]


def _model_paths() -> tuple[Path, Path]:
    """Resolve the on-disk Kokoro model + voices file paths.

    Override via HERMES_LOCAL_TTS_MODEL_DIR for tests / non-default layouts.
    """
    base = Path(os.environ.get("HERMES_LOCAL_TTS_MODEL_DIR", "")).expanduser()
    if not base:
        base = Path.home() / ".hermes-ui" / "local-tts" / "kokoro"
    return base / "kokoro-v1_0.pth", base / "voices"


def _emit(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _prime_voices(pipeline: Any, voices_path: Path) -> None:
    """Pre-load every voice .pt under voices_path into pipeline.voices.

    kokoro's KPipeline.load_voice() looks up by name first; if present in
    pipeline.voices[voice] it skips the HuggingFace download. We seed the
    dict from the locally downloaded files so the runtime doesn't need
    network access on first synth.
    """
    if not voices_path.exists():
        return
    import torch  # local import keeps startup cheap when no synth runs
    for entry in sorted(voices_path.iterdir()):
        if entry.suffix != ".pt":
            continue
        try:
            pipeline.voices[entry.stem] = torch.load(entry, weights_only=True)
        except Exception as exc:  # noqa: BLE001 — log and continue
            print(f"warning: failed to load voice {entry.name}: {exc}", file=sys.stderr)


def _ensure_engine() -> Any:
    """Lazy-import + warm the model once. Thread-safe."""
    global kokoro, KOKORO
    if KOKORO is not None:
        return KOKORO

    model_path, voices_path = _model_paths()
    if not model_path.exists() or not voices_path.exists():
        raise FileNotFoundError(
            f"Kokoro model not found at {model_path.parent}. "
            "Open Settings → Voice → Local TTS and click Download."
        )

    try:
        import kokoro as _kokoro  # noqa: WPS433 — lazy on purpose
        import torch  # noqa: WPS433 — voice tensors need torch.load
    except ImportError as import_err:
        raise ImportError(
            "kokoro package is not installed in this Python environment. "
            "Run `bash scripts/setup-local-tts.sh` from the repo root, or set "
            "HERMES_LOCAL_TTS_PYTHON to a Python with kokoro installed."
        ) from import_err

    # ponytail: silence the kokoro/torch startup noise (LSTM dropout warning,
    # weight_norm deprecation) so the stderr tail surfaces the real error
    # instead of being dominated by warnings.
    import warnings  # noqa: WPS433 — local on purpose
    warnings.filterwarnings("ignore", category=UserWarning)
    warnings.filterwarnings("ignore", category=FutureWarning)

    # ponytail: PyTorch 2.6+ defaults torch.load to weights_only=True, which
    # rejects the legacy pickle format Kokoro ships its .pth / .pt files in.
    # Force weights_only=False for local files we trust. The Kokoro package
    # itself calls torch.load with weights_only=True; without this patch the
    # model init fails with "weights only load failed".
    _orig_torch_load = torch.load
    def _hermes_torch_load(*args, **kwargs):  # noqa: ANN001, ANN201
        kwargs["weights_only"] = False
        return _orig_torch_load(*args, **kwargs)
    torch.load = _hermes_torch_load  # type: ignore[assignment]

    # ponytail: tee all stderr to a log file so a future failure is
    # readable in full even when the UI toast truncates the message.
    log_path = model_path.parent / "engine.log"
    try:
        _stderr_log = open(log_path, "a", encoding="utf-8", buffering=1)
        _stderr_log.write(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} init ---\n")
        _orig_stderr_write = sys.stderr.write
        def _tee_write(s):  # noqa: ANN001
            _orig_stderr_write(s)
            try: _stderr_log.write(s)
            except Exception: pass
        sys.stderr.write = _tee_write  # type: ignore[assignment]
    except Exception:
        _stderr_log = None  # type: ignore[assignment]

    # ponytail: surface the runtime context on every init so a future failure
    # is reproducible from stderr alone — the user shouldn't need to guess
    # which Python / torch / device the engine was using.
    print(
        f"hermes_tts_engine: python={sys.version.split()[0]} "
        f"torch={torch.__version__} cuda={torch.cuda.is_available()} "
        f"mps={getattr(torch.backends, 'mps', None) is not None and torch.backends.mps.is_available()} "
        f"VIRTUAL_ENV={os.environ.get('VIRTUAL_ENV', '<unset>')} "
        f"model={model_path}",
        file=sys.stderr,
    )
    sys.stderr.flush()

    kokoro = _kokoro
    _emit({"event": "loading_model", "path": str(model_path)})
    started = time.monotonic()
    try:
        # ponytail: kokoro 0.9.x dropped the legacy KPipeline(model=, voices=)
        # kwargs. Build a KModel from our local .pth and inject it, then pre-
        # populate pipeline.voices from our local voices/ dir so load_voice()
        # finds them without hitting HuggingFace.
        print("hermes_tts_engine: building KModel…", file=sys.stderr)
        sys.stderr.flush()
        kmodel = _kokoro.KModel(
            repo_id="hexgrad/Kokoro-82M",
            model=str(model_path),
        ).eval()
        print("hermes_tts_engine: KModel ready, building KPipeline…", file=sys.stderr)
        sys.stderr.flush()
        KOKORO = _kokoro.KPipeline(
            lang_code=os.environ.get("HERMES_LOCAL_TTS_LANG", "a"),  # 'a' = auto
            model=kmodel,
        )
        print(f"hermes_tts_engine: KPipeline ready (voices primed: "
              f"{len(KOKORO.voices)})", file=sys.stderr)
        sys.stderr.flush()
        _prime_voices(KOKORO, voices_path)
    except Exception as err:  # noqa: BLE001
        # ponytail: emit the full traceback to stderr so the Node side can
        # surface it. Otherwise KModel crashes look like "engine exited"
        # with no actionable info.
        import traceback
        print(f"hermes_tts_engine: init failed: {type(err).__name__}: {err}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        raise
    _emit({
        "event": "ready",
        "load_ms": int((time.monotonic() - started) * 1000),
        "model": str(model_path),
    })
    return KOKORO


def op_synthesize(req: dict[str, Any]) -> dict[str, Any]:
    text = (req.get("text") or "").strip()
    if not text:
        return {"id": req.get("id"), "ok": False, "error": "text is empty"}

    voice = req.get("voice") or "af_heart"
    try:
        speed = float(req.get("speed") or 1.0)
    except (TypeError, ValueError):
        speed = 1.0

    try:
        engine = _ensure_engine()
    except FileNotFoundError as err:
        return {"id": req.get("id"), "ok": False, "error": str(err)}
    except Exception as err:  # noqa: BLE001 — surface upstream import errors
        return {
            "id": req.get("id"),
            "ok": False,
            "error": f"failed to load Kokoro engine: {err}",
        }

    started = time.monotonic()
    try:
        # kokoro 0.9.x: KPipeline is invoked via __call__ and yields
        # KPipeline.Result dataclasses with .audio attributes.
        print(f"hermes_tts_engine: synthesizing {len(text)} chars voice={voice}", file=sys.stderr)
        sys.stderr.flush()
        generator = engine(text, voice=voice, speed=speed)
        chunks = [result.audio.numpy() if hasattr(result.audio, "numpy") else result.audio
                  for result in generator if result.audio is not None]
        print(f"hermes_tts_engine: synth produced {len(chunks)} chunks", file=sys.stderr)
        sys.stderr.flush()
    except Exception as err:  # noqa: BLE001
        # ponytail: full traceback to stderr (captured by engine.log) so
        # the user can cat the file when the Node-side error toast truncates.
        import traceback
        print(f"hermes_tts_engine: synthesize failed: {type(err).__name__}: {err}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        return {"id": req.get("id"), "ok": False, "error": f"synthesize failed: {err}"}

    if not chunks:
        return {"id": req.get("id"), "ok": False, "error": "engine produced no audio"}

    import numpy as np  # noqa: WPS433 — comes with kokoro

    audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
    sample_rate = int(getattr(engine, "sample_rate", 24000) or 24000)
    duration_ms = int(len(audio) / sample_rate * 1000)

    # Encode to WAV in-memory. soundfile is OUR engine's dependency — kokoro
    # does NOT declare it (its Requires-Dist omits soundfile); ensureKokoroInstalled
    # installs both kokoro and soundfile together. Wrapped so a missing soundfile
    # surfaces a precise, actionable message instead of "handler crashed".
    import io

    try:
        import soundfile as sf  # noqa: WPS433
    except ImportError as sf_err:
        raise ImportError(
            "soundfile is not installed in this Python environment "
            "(it is NOT a kokoro dependency and must be installed separately). "
            "Re-open Settings → Voice → Local TTS → Download to reinstall, or run: "
            "python -m pip install soundfile"
        ) from sf_err

    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV", subtype="PCM_16")
    audio_bytes = buf.getvalue()

    return {
        "id": req.get("id"),
        "ok": True,
        "audio_b64": base64.b64encode(audio_bytes).decode("ascii"),
        "sample_rate": sample_rate,
        "duration_ms": duration_ms,
        "engine": "kokoro",
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }


def op_list_voices(req: dict[str, Any]) -> dict[str, Any]:
    # Kokoro ships with a stable voice set; the model picks this up at load.
    # We list a curated subset for the UI — full list is 54 entries, too many
    # for a dropdown. The user can still type any voice id.
    voices = [
        {"id": "af_heart", "label": "Heart (en-US · Female)", "lang": "en-us"},
        {"id": "af_bella", "label": "Bella (en-US · Female)", "lang": "en-us"},
        {"id": "af_nicole", "label": "Nicole (en-US · Female)", "lang": "en-us"},
        {"id": "am_michael", "label": "Michael (en-US · Male)", "lang": "en-us"},
        {"id": "am_fenrir", "label": "Fenrir (en-US · Male)", "lang": "en-us"},
        {"id": "bf_emma", "label": "Emma (en-GB · Female)", "lang": "en-gb"},
        {"id": "bm_daniel", "label": "Daniel (en-GB · Male)", "lang": "en-gb"},
        {"id": "zf_xiaoxiao", "label": "Xiaoxiao (zh-CN · Female)", "lang": "zh-cn"},
        {"id": "zm_yunjian", "label": "Yunjian (zh-CN · Male)", "lang": "zh-cn"},
    ]
    return {"id": req.get("id"), "ok": True, "voices": voices}


def op_ping(req: dict[str, Any]) -> dict[str, Any]:
    return {"id": req.get("id"), "ok": True}


_OPS = {
    "synthesize": op_synthesize,
    "list_voices": op_list_voices,
    "ping": op_ping,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true",
                        help="Check that kokoro + the model are importable, then exit.")
    args = parser.parse_args()

    if args.probe:
        try:
            _ensure_engine()
            _emit({"event": "probe_ok"})
            return 0
        except Exception as err:  # noqa: BLE001
            _emit({"event": "probe_failed", "error": str(err)})
            return 2

    # Normal stdio loop. Lock protects kokoro pipeline (numpy isn't thread-safe
    # under all ops). Concurrent requests serialize, which is fine for chat UX.
    lock = threading.Lock()
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as err:
            _emit({"ok": False, "error": f"invalid json: {err}"})
            continue

        op = req.get("op")
        handler = _OPS.get(op or "")
        if handler is None:
            _emit({"id": req.get("id"), "ok": False, "error": f"unknown op: {op}"})
            continue

        with lock:
            try:
                _emit(handler(req))
            except Exception as err:  # noqa: BLE001 — last-resort guard
                _emit({"id": req.get("id"), "ok": False, "error": f"handler crashed: {err}"})

    return 0


if __name__ == "__main__":
    sys.exit(main())
