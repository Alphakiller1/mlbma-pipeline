#!/usr/bin/env bash
# Cloud Agent install for the MLBMA / Chase Analytics repo.
#
# Idempotent repository bootstrap: prepares the Python toolchain the pipeline
# needs and the Playwright Chromium the dashboard runtime-smoke gate uses. Safe
# to run repeatedly (it reuses an existing venv and skips already-satisfied
# system packages). No secrets are read or written here.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Force UTF-8 so Unicode prints in the pipeline can't crash on a non-UTF-8 locale.
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

# --- System packages (stable, rarely change) -------------------------------
# The default image ships Python 3.12 but not the venv module; Playwright needs
# a set of shared libraries. Install both without failing if apt is unavailable.
if command -v sudo >/dev/null 2>&1; then
  sudo apt-get update -qq || true
  sudo apt-get install -y -qq python3.12-venv >/dev/null 2>&1 || true
fi

# --- Python virtualenv (repo convention: ./crawl_env) -----------------------
if [ ! -x "crawl_env/bin/python" ]; then
  python3 -m venv crawl_env
fi

./crawl_env/bin/python -m pip install --upgrade pip >/dev/null

# Pipeline deps (pinned by requirements.txt) plus Playwright for the dashboard
# runtime-smoke gate (scripts/dashboard_runtime_diag.py, scripts/platform_ui_diag.py).
./crawl_env/bin/pip install -r requirements.txt playwright

# Chromium + its system dependencies for the headless runtime-smoke checks.
./crawl_env/bin/python -m playwright install --with-deps chromium

echo "MLBMA install complete: $(./crawl_env/bin/python --version)"
