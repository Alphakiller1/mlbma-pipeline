@echo off
cd /d "%~dp0"
"%~dp0crawl_env\Scripts\python.exe" pipeline\main.py >> "%~dp0pipeline_log.txt" 2>&1
