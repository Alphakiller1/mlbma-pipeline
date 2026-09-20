@echo off
rem ================================================================
rem  LIVE STUDIO - double-click to open every graphic, any game.
rem
rem  This is Remotion Studio, not the recording booth. You get the
rem  full composition list (Studio, Edit, Show-Package, Cutaways,
rem  Data, Long-form, Tools) and a props panel so you can change
rem  teams, lines, and copy without rebuilding a game pack.
rem  Lands on Formation - the first of the new studio graphics.
rem
rem  Lions vs Bills numbers are SAMPLE defaults for preview only.
rem  Load a packed game from video\props\pack\<date>-AWAY-HOME\
rem  with the props panel, or pass a composition after this file:
rem     studio.bat PlayerCard
rem     studio.bat PropBoard
rem
rem  Keep this window open while Studio is running.
rem  The recording booth (camera + keys 1-9) is still booth.bat.
rem ================================================================
setlocal
cd /d "%~dp0video"
if not exist "node_modules\@remotion\cli" (
  echo Installing the video package ...
  call npm install
  if errorlevel 1 goto :done
)
if not exist "src\site\index.css" (
  echo Pulling the live site style ...
  call npm run sync-style
  if errorlevel 1 goto :done
)
set "COMP=%~1"
if "%COMP%"=="" set "COMP=Formation"
echo.
echo Opening live studio on %COMP% ...
echo Left: every composition. Right: change the game in the props panel.
echo Keep this window open.
echo.
call npx remotion studio "%COMP%" --port=3001
:done
echo.
pause
