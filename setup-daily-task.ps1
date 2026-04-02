# setup-daily-task.ps1
# Sets up a scheduled task to run the Daily Report scraper
# every hour from 8:00 AM to 7:00 PM EST, 7 days a week.
# Right-click this file and choose "Run with PowerShell"

# ── Configuration ─────────────────────────────────────────────────────────────
$TaskName    = "SalonDailyReport"
$Description = "Scrapes Salondata daily report every hour 8AM-7PM and generates daily_report.html"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchFile   = Join-Path $ScriptDir "run-daily-scraper.bat"

# ── Create the task ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================"
Write-Host "  Daily Report - Scheduled Task Setup"
Write-Host "========================================"
Write-Host ""

if (-not (Test-Path $BatchFile)) {
    Write-Host "[ERROR] Could not find run-daily-scraper.bat at:"
    Write-Host "        $BatchFile"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[INFO] Setting up Task Scheduler..."
Write-Host "       Script: $BatchFile"
Write-Host "       Runs every hour, 8:00 AM - 7:00 PM, daily"
Write-Host ""

# Remove existing task if it exists
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[INFO] Removed existing task."
}

# Trigger: Daily at 8:00 AM, repeating every 1 hour for 11 hours (8AM through 7PM)
$Trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At "08:00"

# Add repetition: every 1 hour for 11 hours (8AM start + 11h = 7PM last run)
$Trigger.Repetition = (New-CimInstance -CimClass (Get-CimClass -ClassName MSFT_TaskRepetitionPattern -Namespace Root/Microsoft/Windows/TaskScheduler) -ClientOnly)
$Trigger.Repetition.Interval = "PT1H"
$Trigger.Repetition.Duration = "PT11H"
$Trigger.Repetition.StopAtDurationEnd = $false

# Action: run the batch file (without the pause at the end for automated runs)
$Action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c node scrape-daily.js" `
    -WorkingDirectory $ScriptDir

# Settings
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

# Register the task
Register-ScheduledTask `
    -TaskName $TaskName `
    -Description $Description `
    -Trigger $Trigger `
    -Action $Action `
    -Settings $Settings `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host ""
Write-Host "[SUCCESS] Task '$TaskName' created!"
Write-Host ""
Write-Host "  Schedule: Every hour from 8:00 AM to 7:00 PM, daily"
Write-Host "  Output:   daily_report.html (auto-refreshed)"
Write-Host ""
Write-Host "To verify:  Open Task Scheduler > look for '$TaskName'"
Write-Host "To run now: double-click run-daily-scraper.bat"
Write-Host ""
Read-Host "Press Enter to close"
