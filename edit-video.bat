@echo off
rem ================================================================
rem  EDIT MY VIDEO - drag a recording onto this file, or double-click
rem  it to edit the newest video in video\footage\.
rem
rem  It cuts the pauses and any line you said "redo" after, captions
rem  every word, puts the graphic you are talking about in the middle
rem  of the frame and your camera in a small bubble, then renders:
rem     video\out\edit\NAME-vertical.mp4   (Reels / TikTok / Shorts)
rem     video\out\edit\NAME-wide.mp4       (YouTube)
rem  Graphics come from the newest game pack (outputs.video_pack).
rem  WHEN they appear comes from video\footage\NAME.cues.txt if it
rem  exists (the booth writes one - edit the times and run again);
rem  otherwise from what you said, saved as that cue sheet.
rem  Extra options go after the file, e.g.:  --format vertical
rem ================================================================
setlocal
cd /d "%~dp0video"
node scripts\edit.mjs %*
echo.
pause
