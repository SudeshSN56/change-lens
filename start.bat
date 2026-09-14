@echo off
rem Double-click or run from cmd: sets up and starts Change Lens. Args pass through (e.g. start.bat -Dev).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
