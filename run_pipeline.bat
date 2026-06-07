@echo off
cd /d "%~dp0"
rem Force UTF-8 so Unicode prints (e.g. the "checkmark" status glyph) don't raise
rem UnicodeEncodeError under the Windows cp1252 console and abort steps like
rem scrape_lineups (which left Today_Lineups on a stale slate).
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
rem Use -m so the repo root is on sys.path; `python pipeline\main.py` puts only the
rem pipeline\ folder on the path and crashes with "No module named 'pipeline'".
"%~dp0crawl_env\Scripts\python.exe" -u -m pipeline.main >> "%~dp0pipeline_log.txt" 2>&1
