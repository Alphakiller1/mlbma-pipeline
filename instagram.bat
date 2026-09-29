@echo off
rem ================================================================
rem  INSTAGRAM - matchup posts for today's MLB slate (1080x1350).
rem    instagram.bat                         every game today
rem    instagram.bat --games PHI@ATL,BOS@NYY  just these
rem  Two images per game: probable starters, then the offenses vs the
rem  hand they face. Saves to video\out\instagram\DATE\ and opens it.
rem ================================================================
setlocal
cd /d "%~dp0"
python -m outputs.insta_matchup %*
