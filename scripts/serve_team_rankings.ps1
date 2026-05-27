# Serve dashboard over HTTP so browsers do not cache stale file:// scripts.
$root = Split-Path -Parent $PSScriptRoot
$dash = Join-Path $root "dashboard"
if (-not (Test-Path $dash)) {
  Write-Error "dashboard folder not found: $dash"
  exit 1
}
Set-Location $dash
$url = "http://127.0.0.1:8765/team_rankings.html"
Write-Host "Team Rankings: $url"
Write-Host "Press Ctrl+C to stop."
Start-Process $url
python -m http.server 8765
