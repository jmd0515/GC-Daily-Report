@echo off
echo ==========================================
echo   GC Daily Report Scraper
echo ==========================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

cd /d "%~dp0"

echo Running daily report scraper...
echo.
node scrape-daily.js

if %ERRORLEVEL% equ 0 (
    echo.
    echo SUCCESS: Daily report generated!
    echo Opening daily_report.html...
    start "" "daily_report.html"
) else (
    echo.
    echo WARNING: Scraper encountered an error.
    if exist daily_report.html (
        echo Opening last available report...
        start "" "daily_report.html"
    )
)

echo.
REM Only pause if run interactively (not from Task Scheduler)
if "%1"=="" pause
