@echo off
REM Chase Analytics content engine — pass any content_engine command through.
REM   content preview --games CLE@CIN,TEX@TBR --headline "Two To Watch"
REM   content deep --games PHI@MIA --artifacts banner,radar,offense
REM   content breakdown --games PHI@MIA
REM   content full-card
REM   content rankings --type team --family winning --window L30
REM
REM NFL (compose only - captures the hosted nfl-model board, no MLB slate needed):
REM   content compose --artifacts nfl_edges --rows 10 --headline "Widest Gaps"
REM   content compose --artifacts nfl_offense              (--rows-from 17 for 17-32)
REM   content compose --artifacts nfl_game_lines --games NE@SEA
REM   content keys                                         (every artifact + phrases)
REM
REM Add --video to any of the above to also write the Remotion props that animate
REM the same capture, then render it with the printed npx command.
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
