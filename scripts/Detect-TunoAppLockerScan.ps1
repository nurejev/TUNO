#Requires -Version 5.1
<#
.SYNOPSIS
Detection half of the AppLocker scan pair: non-compliant when this device has no
scan bundle younger than the window, so Invoke-TunoAppLockerScan.ps1 runs again.

.DESCRIPTION
Intune Remediations run the remediation script only when detection exits 1. This
pair uses that as a schedule: the "remediation" is the device scan
(Invoke-TunoAppLockerScan.ps1 in its Remediation mode - SYSTEM, no parameters,
output under %ProgramData%\IT-TOOLS\LOGS\AppLockerScan, bundle uploaded to the
harvest site when one is configured). This detection looks for the newest
TunoAppLockerScan-*.json there and exits 1 when it is older than $MaxAgeDays or
there is none, exit 0 otherwise. So a daily detection schedule with the default
window scans each device about once a week, and a device whose scan fails keeps
trying daily.

KNOW WHAT THE CONSOLE SHOWS. "Issue fixed" here means "the scan ran", never
"the device is fine": the scan changes nothing on the device, it only writes a
bundle. Do not put this pair in a compliance report, and unassign it when the
evidence campaign ends. The events pair (Detect-/Get-TunoAppControlEvents.ps1)
is the daily pump for what ran; this pair is the weekly picture of what is
there.

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation detection script, SYSTEM, 64-bit PowerShell,
            paired with Invoke-TunoAppLockerScan.ps1 as the remediation script.
#>

$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10620

# How old the newest bundle may be before the scan runs again. Seven days is
# the house cadence; edit the number in a copy for a faster or slower ring.
$MaxAgeDays = 7

$ScanFolder = Join-Path $env:ProgramData 'IT-TOOLS\LOGS\AppLockerScan'
$LogFolder  = Join-Path $env:ProgramData 'IT-TOOLS\LOGS'
$LogFile    = Join-Path $LogFolder 'AppLockerScan-Detect.log'

function Write-DetectLog {
    param([string]$Message)
    try {
        if (-not (Test-Path -LiteralPath $LogFolder)) { New-Item -Path $LogFolder -ItemType Directory -Force | Out-Null }
        Add-Content -Path $LogFile -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message) -Force
    }
    catch { }
}

$newest = $null
if (Test-Path -LiteralPath $ScanFolder -PathType Container) {
    $newest = @(Get-ChildItem -LiteralPath $ScanFolder -Filter 'TunoAppLockerScan-*.json' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending) | Select-Object -First 1
}

if (-not $newest) {
    $msg = "No AppLocker scan bundle on $env:COMPUTERNAME yet ($ScanFolder) - the scan will run"
    Write-DetectLog ("Detection v{0} (build {1}): {2}" -f $script:ScriptVersion, $script:TunoBuild, $msg)
    Write-Output $msg
    exit 1
}

$age = [math]::Round(((Get-Date) - $newest.LastWriteTime).TotalDays, 1)
if ($age -gt $MaxAgeDays) {
    $msg = "Newest AppLocker scan bundle on $env:COMPUTERNAME is $age day(s) old ($($newest.Name)), window $MaxAgeDays - the scan will run"
    Write-DetectLog ("Detection v{0} (build {1}): {2}" -f $script:ScriptVersion, $script:TunoBuild, $msg)
    Write-Output $msg
    exit 1
}

$msg = "AppLocker scan bundle on $env:COMPUTERNAME is $age day(s) old ($($newest.Name)), within the $MaxAgeDays-day window - nothing to do"
Write-DetectLog ("Detection v{0} (build {1}): {2}" -f $script:ScriptVersion, $script:TunoBuild, $msg)
Write-Output $msg
exit 0
