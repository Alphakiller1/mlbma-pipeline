@echo off
REM Chase Analytics content engine — pass any content_engine command through.
REM   content preview --games CLE@CIN,TEX@TBR --headline "Two To Watch"
REM   content deep --games PHI@MIA --artifacts banner,radar,offense
REM   content breakdown --games PHI@MIA
REM   content full-card
REM   content rankings --type team --family winning --window L30
setlocal
set "REPO=%~dp0"
set "PY=%REPO%crawl_env\Scripts\python.exe"
if not exist "%PY%" set "PY=%USERPROFILE%\crawl_env\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
pushd "%REPO%"
"%PY%" -m outputs.content_engine %*
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%
