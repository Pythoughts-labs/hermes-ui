#!/usr/bin/env bash
# ponytail: one-shot setup for the local TTS Python runtime in dev mode.
# Creates packages/desktop/.venv/, installs kokoro AND soundfile (soundfile is
# NOT a kokoro dep but hermes_tts_engine.py needs it to WAV-encode), and prints
# the HERMES_LOCAL_TTS_PYTHON line to put in your shell rc. Keep the dep list
# in sync with engine-manager.ts KOKORO_PACKAGES and install-hermes.mjs.
# Does NOT modify gitignored state outside the venv.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$REPO_ROOT/packages/desktop/.venv"
PY_BIN="${PY_BIN:-python3}"

if ! command -v "$PY_BIN" >/dev/null 2>&1; then
  echo "error: $PY_BIN not found in PATH" >&2
  exit 1
fi

if ! command -v espeak-ng >/dev/null 2>&1; then
  echo "warning: espeak-ng is not installed. kokoro's phonemizer needs it."
  echo "  install with: brew install espeak-ng  (macOS)"
  echo "                sudo apt install espeak-ng  (Debian/Ubuntu)"
  echo "continuing anyway; synth will fail at runtime until espeak-ng is present."
  echo
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "creating venv at $VENV_DIR"
  "$PY_BIN" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip --quiet
# ponytail: prefer uv (10-100x faster) when available; fall back to pip.
# uv pip install works on pipless venvs and is the cross-platform default.
if command -v uv >/dev/null 2>&1; then
  uv pip install --quiet --python "$(command -v python)" "kokoro>=0.9.4" "soundfile"
else
  python -m pip install --quiet "kokoro>=0.9.4" "soundfile"
fi

echo
echo "venv ready: $VENV_DIR"
# defensive: verify BOTH deps actually import before claiming success —
# a partial install crashes Test with "No module named 'soundfile'".
python -c 'import kokoro, soundfile; print("kokoro", getattr(kokoro, "__version__", "?"), "+ soundfile", soundfile.__version__, "installed")'
echo
echo "add to your shell rc (~/.zshrc, ~/.bashrc, etc.):"
echo "  export HERMES_LOCAL_TTS_PYTHON=\"$VENV_DIR/bin/python\""
echo
echo "then restart the dev server. the engine will pick up the venv python automatically."
