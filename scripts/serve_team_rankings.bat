@echo off
cd /d "%~dp0..\dashboard"
echo Team Rankings: http://127.0.0.1:8765/team_rankings.html
echo Press Ctrl+C to stop.
start "" "http://127.0.0.1:8765/team_rankings.html"
python -m http.server 8765
