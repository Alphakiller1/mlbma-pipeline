@echo off
cd /d "%~dp0"
rem Force UTF-8 so Unicode prints (e.g. the "checkmark" status glyph) don't raise
rem UnicodeEncodeError under the Windows cp1252 console and abort steps like
rem scrape_lineups (which left Today_Lineups on a stale slate).
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

rem Resolve the Python interpreter. The repo has no local crawl_env\, so the old
rem "%~dp0crawl_env\Scripts\python.exe" path was broken and every run silently
rem failed -- that is why the slate went stale. Prefer a local venv if one is ever
rem created here, otherwise fall back to the shared user venv that actually has the
rem deps (pandas / playwright / PIL).
set "PYEXE=%~dp0crawl_env\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=%USERPROFILE%\crawl_env\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"

rem Use -m so the repo root is on sys.path; `python pipeline\main.py` puts only the
rem pipeline\ folder on the path and crashes with "No module named 'pipeline'".
rem pipeline.main also publishes bet-evaluator + sharp-money-tracker at the end.
rem For the alternate entry that skips MLBMA scrape: run_full_pipeline.bat --skip-scrape
"%PYEXE%" -u -m pipeline.main >> "%~dp0pipeline_log.txt" 2>&1
