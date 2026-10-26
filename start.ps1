# Venue Vista - One-Click PowerShell Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  VENUE VISTA: EVENT PRO TICKETING & VENUE MANAGEMENT" -ForegroundColor Yellow
Write-Host "  Industry: Media & Entertainment" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening Venue Vista at: http://localhost:3000 ..." -ForegroundColor Green

Start-Process "http://localhost:3000"
node --no-warnings server.js
