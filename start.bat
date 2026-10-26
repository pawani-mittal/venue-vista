@echo off
title Venue Vista - Event Pro Server
echo ========================================================
echo   VENUE VISTA: EVENT PRO TICKETING & VENUE MANAGEMENT
echo   Industry: Media & Entertainment
echo ========================================================
echo.
echo Starting Venue Vista server...
echo URL: http://localhost:3000
echo.
start http://localhost:3000
node --no-warnings server.js
pause
