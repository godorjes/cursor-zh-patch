@echo off
setlocal
where pwsh >nul 2>&1
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch.ps1" -SetLocale -InstallLanguagePack %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch.ps1" -SetLocale -InstallLanguagePack %*
)
exit /b %ERRORLEVEL%
