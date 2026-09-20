@echo off
rem ================================================================
rem  RECORDING BOOTH - double-click to record with the graphics live.
rem  Canonical engine command (builds a pack when you name a game):
rem    content.bat booth --sport nfl --games IND@KC --show "Sunday Night Football"
rem
rem  A browser page opens showing the finished layout: the graphic in
rem  the middle, your camera in the bubble. Press R to record, press
rem  1-9 (or Space) to bring graphics up while you talk, R to stop,
rem  then "Make my video". Takes are saved to video\footage\ with a
rem  cue sheet (NAME.cues.txt) of when each graphic came up.
rem  Uses the newest game pack. Keep this window open while recording.
rem  For every graphic and any game (no camera), use studio.bat instead.
rem ================================================================
setlocal
cd /d "%~dp0video"
node scripts\booth.mjs %*
echo.
pause
