@echo off
REM Chase Analytics video graphics engine - props from the model, then render.
REM
REM For a whole game (every graphic: template, bars, lower thirds, duels, market-vs-model,
REM ranks, open, chapters, agenda, split frames, end screen, thumbnails, injury
REM illustrations) use the game pack instead - see video\README.md:
REM   python -m outputs.video_pack --league nfl --game DET@BUF --show "Thursday Night Football" --tag TNF --captures
REM   video\props\pack\<date>-DET-BUF\render.bat
REM Args pass straight through to outputs.video_props (same convention as content.bat):
REM   video --games NYM@TBR
REM   video --league nfl --games NE@SEA
REM   video --league nfl                          (whole board)
REM   video --games NYM@TBR --take "Manaea has to be near-perfect."
REM
REM Renders the full-frame cutaway for each game as ProRes 4444 with alpha,
REM ready to drop straight onto a DaVinci Resolve timeline. Output: video\out\.
REM
REM The overlays that are not data-driven - LowerThird, Sting - are authored in
REM Remotion Studio ("cd video && npm run dev"), where you type the text into the
REM props panel and render from there.
REM
REM BOARDS (rankings, model-vs-market, props, playoff odds) do NOT come through here.
REM They are captured by the still engine and animated from that same capture:
REM   content compose --artifacts nfl_edges --rows 10 --video --headline "..."
REM then run the npx line it prints. See docs/CONTENT_ENGINE_SPEC.md 10.1.
setlocal
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set "REPO=%~dp0"
set "PY=%REPO%crawl_env\Scripts\python.exe"
if not exist "%PY%" set "PY=%USERPROFILE%\crawl_env\Scripts\python.exe"
if not exist "%PY%" set "PY=python"
pushd "%REPO%"

REM Which league was asked for? Drives both the props folder and the composition.
set "LEAGUE=mlb"
echo %* | findstr /i /c:"--league nfl" >nul && set "LEAGUE=nfl"
set "COMP=MatchupCutaway"
if "%LEAGUE%"=="nfl" set "COMP=NflCutaway"

"%PY%" -m outputs.video_props %*
if errorlevel 1 goto :done

pushd "%REPO%video"
if not exist out mkdir out
for %%F in (props\%LEAGUE%\*.json) do (
  echo Rendering %COMP% %%~nF ...
  call npx remotion render %COMP% "out\%LEAGUE%-%%~nF.mov" --props="props\%LEAGUE%\%%~nxF"
)
popd

:done
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%
