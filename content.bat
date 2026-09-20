@echo off
REM Chase Analytics content engine — pass any content_engine command through.
REM Matchup posts capture chase-analytics.com as served today, in the site's own style.
REM   content preview --games CLE@CIN,TEX@TBR --headline "Two To Watch"
REM   content deep --games PHI@MIA --artifacts mlb_hero,mlb_radar,mlb_recent
REM   content breakdown --games PHI@MIA --aspects pitching,offense,bullpen
REM   content full-card
REM   content preview --sport nfl --games DET@BUF
REM   content breakdown --sport nfl --games DET@BUF --aspects availability,scheme
REM   content rankings --type team --family winning --window L30   (legacy page)
REM
REM NFL model board (compose - captures the hosted nfl-model board):
REM   content compose --artifacts nfl_edges --rows 10 --headline "Widest Gaps"
REM   content compose --artifacts nfl_offense              (--rows-from 17 for 17-32)
REM   content compose --artifacts nfl_game_lines --games NE@SEA
REM   content keys                                         (every artifact + phrases)
REM
REM Recording booth (live graphics + camera, one take):
REM   content booth --sport nfl --games IND@KC --show "Week 3 Sunday Night Football"
REM   content booth --sport nfl
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
