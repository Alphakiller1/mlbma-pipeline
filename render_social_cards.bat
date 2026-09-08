@echo off
rem Chase Analytics — render today's social cards only (no scrape, no publish).
rem Double-click to regenerate images from the data already in data\, e.g. after
rem a lineup change. Output: outputs\social_cards\<today>\  (+ captions.txt)
rem Flags pass through, e.g.:
rem     render_social_cards.bat --all-sizes-per-game
rem     render_social_cards.bat --date 2026-07-29
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1

set "PYEXE=%~dp0crawl_env\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=%USERPROFILE%\crawl_env\Scripts\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"

"%PYEXE%" -m outputs.render_social_cards %*
echo.
if not errorlevel 1 start "" "outputs\social_cards"
pause
