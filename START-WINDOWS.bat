@echo off
setlocal
title Rahhal Local Preview
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-preview.ps1"
if errorlevel 1 (
  echo.
  echo Preview could not start. Open index.html for the standalone interactive version.
  pause
)
endlocal
