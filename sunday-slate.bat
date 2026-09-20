@echo off
rem ================================================================
rem  SUNDAY SLATE PACKS - Bengals @ Texans, Jaguars @ Broncos,
rem  Commanders @ Cowboys, Steelers @ Patriots.
rem
rem  Builds a game pack for each (formations, QB matchup, team
rem  compare, scheme diagrams, live lines, props). Then opens the
rem  recording booth; pick the game from the dropdown at the top.
rem  Keep this window open while the booth is running.
rem ================================================================
setlocal
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set "REPO=%~dp0"
set "PY=%REPO%crawl_env\Scripts\python.exe"
if not exist "%PY%" set "PY=%USERPROFILE%\crawl_env\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
pushd "%REPO%"

echo Building CIN@HOU ...
"%PY%" -m outputs.video_pack --league nfl --game CIN@HOU --show "Week 3 Sunday" --tag W3
if errorlevel 1 goto :fail
echo Building JAX@DEN ...
"%PY%" -m outputs.video_pack --league nfl --game JAX@DEN --show "Week 3 Sunday" --tag W3
if errorlevel 1 goto :fail
echo Building WSH@DAL ...
"%PY%" -m outputs.video_pack --league nfl --game WSH@DAL --show "Week 3 Sunday" --tag W3
if errorlevel 1 goto :fail
echo Building PIT@NE ...
"%PY%" -m outputs.video_pack --league nfl --game PIT@NE --show "Week 3 Sunday" --tag W3
if errorlevel 1 goto :fail

echo.
echo Packs ready. Opening the booth (pick the game in the dropdown).
cd /d "%REPO%video"
node scripts\booth.mjs --pack props/pack/2026-09-20-CIN-HOU
goto :done
:fail
echo.
echo A pack failed. Check the messages above.
:done
echo.
pause
popd
