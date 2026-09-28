@echo off
rem ================================================================
rem  SITE BOOTH - record a breakdown ON chase-analytics.com.
rem
rem  Opens the live site on a stage with your camera in a bubble.
rem  Click around the site as normal, draw markers over it, spotlight
rem  a row, zoom into a card, drop chapter markers - press R to record.
rem  Only the stage is recorded (use Chrome or Edge). Takes land in
rem  video\footage\site\ as an .mp4 plus NAME.chapters.txt for YouTube.
rem
rem  Options:  --origin http://localhost:8788   record a local build
rem            --port 8792                      another port
rem            --room CODE                      the phone mic link's room (kept after that)
rem  Keep this window open while recording.
rem ================================================================
setlocal
cd /d "%~dp0video"
node scripts\site-booth.mjs %*
echo.
pause
