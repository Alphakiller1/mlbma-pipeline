@echo off
rem ================================================================
rem  THUMBNAIL - the series YouTube thumbnail (1280x720) for one game.
rem    thumbnail.bat --league mlb --game PHI@ATL
rem    thumbnail.bat --league mlb --game PHI@ATL --title "Luzardo vs Sale" --badge "Wild Card"
rem    thumbnail.bat --league nfl --game GB@DAL --section overview
rem  Saves to video\out	humbs\DATE-AWAY-HOME.png
rem ================================================================
setlocal
cd /d "%~dp0"
python -m outputs.video_thumb %*
