@echo off
rem ================================================================
rem  PLAYOFF BRACKET BOOTH - record your MLB playoff predictions.
rem
rem  Opens the site booth with the live 2026 bracket on stage (teams,
rem  seeds and results from MLB). Click a club to advance it, click again
rem  for the series length, press 1-5 over a series (or click the bars)
rem  for how confident you are. Press R to record, as in the site booth.
rem  Keep this window open while recording.
rem ================================================================
setlocal
cd /d "%~dp0video"
node scripts\site-booth.mjs --page /__booth/bracket/ %*
echo.
pause
