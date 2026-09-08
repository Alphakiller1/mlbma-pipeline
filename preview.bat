@echo off
REM Make H.264 preview copies of every ProRes render, for scrubbing on Windows.
REM
REM Windows Photos and Media Player cannot decode ProRes 4444 (ap4h) - that is a
REM missing decoder, not a bad file. Resolve reads the .mov natively; these .mp4
REM copies exist only so you can eyeball a render without opening an NLE.
REM
REM   preview                (convert everything in video\out)
REM   preview nfl-ATL-PIT    (convert one, name without extension)
REM
REM NOTE: H.264 has no alpha channel. The full-frame cutaways look correct here,
REM but transparent overlays (LowerThird, Sting, CornerBug, MatchupBar) will show
REM BLACK where they should be see-through. That is the preview, not the asset -
REM check those over real footage in Resolve.
setlocal
set "REPO=%~dp0"
pushd "%REPO%video"
if not exist out\preview mkdir out\preview

if "%~1"=="" (
  for %%F in (out\*.mov) do call :convert "%%~nF"
) else (
  call :convert "%~1"
)
echo.
echo Previews in: %REPO%video\out\preview
popd
exit /b 0

:convert
if not exist "out\%~1.mov" (
  echo SKIP %~1 - no such .mov
  exit /b 0
)
echo Converting %~1 ...
REM 540px wide keeps these small; -pix_fmt yuv420p is what Windows players want.
call npx remotion ffmpeg -y -i "out\%~1.mov" -c:v libx264 -preset veryfast -crf 22 ^
  -pix_fmt yuv420p -vf scale=540:-2 -an "out\preview\%~1.mp4" >nul 2>&1
if errorlevel 1 (echo   FAILED %~1) else (echo   ok)
exit /b 0
