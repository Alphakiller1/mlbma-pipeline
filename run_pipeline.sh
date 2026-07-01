#!/usr/bin/env bash
# POSIX (macOS/Linux) equivalent of run_pipeline.bat.
# Force UTF-8 so Unicode prints (checkmarks, box-drawing, em-dash) can't crash a
# scraper step on a non-UTF-8 locale, mirroring the Windows cp1252 fix.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

PYTHON="crawl_env/bin/python"
if [ ! -x "$PYTHON" ]; then
  PYTHON="python3"
fi

# Use -m so the repo root is on sys.path; `python pipeline/main.py` puts only the
# pipeline/ folder on the path and crashes with "No module named 'pipeline'".
"$PYTHON" -u -m pipeline.main "$@" >> pipeline_log.txt 2>&1
