@echo off
rem Chase Analytics — refresh + publish the whole stack (mlbma + bet-evaluator + sharp).
rem Double-click for a full daily run, or pass flags, e.g.:
rem     run_full_pipeline.bat --skip-scrape
rem     run_full_pipeline.bat --fetch-odds      (spends Odds-API credits)
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

set "PYEXE=%~dp0crawl_env\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=%USERPROFILE%\crawl_env\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"

"%PYEXE%" -u run_full_pipeline.py %*
echo.
pause
