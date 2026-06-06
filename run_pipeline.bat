@echo off
cd /d "%~dp0"
rem Force UTF-8 so Unicode prints (e.g. the "checkmark" status glyph) don't raise
rem UnicodeEncodeError under the Windows cp1252 console and abort steps like
rem scrape_lineups (which left Today_Lineups on a stale slate).
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
"%~dp0crawl_env\Scripts\python.exe" pipeline\main.py >> "%~dp0pipeline_log.txt" 2>&1
