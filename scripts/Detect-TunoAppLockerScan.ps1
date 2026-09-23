# Detect-TunoAppLockerScan.ps1  v1.1.0  (TUNO build 10627)
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

1.1.0: A BUNDLE THAT DID NOT REACH THE HARVEST SITE IS NOT DONE. The newest
bundle being young enough used to be the whole test, and the scanner treats an
upload failure as a warning with exit 0 - so a failed upload hid for a week
behind "within the 7-day window - nothing to do" while the device's folder on
the harvest site stayed empty. Now any bundle of the last $PendingDays days that
is still pending upload (a .harvest-pending marker from scanner 1.14.0, or a
pre-1.14.0 bundle whose transcript says 'harvest: upload FAILED') exits 1 with
the reason, and the remediation uploads it WITHOUT rescanning. The reason is in
the Intune console daily until it lands.

KNOW WHAT THE CONSOLE SHOWS. "Issue fixed" here means "the scan ran", never
"the device is fine": the scan changes nothing on the device, it only writes a
bundle. Do not put this pair in a compliance report, and unassign it when the
evidence campaign ends. The events pair (Detect-/Get-TunoAppControlEvents.ps1)
is the daily pump for what ran; this pair is the weekly picture of what is
there.

.NOTES
Version   : 1.1.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation detection script, SYSTEM, 64-bit PowerShell,
            paired with Invoke-TunoAppLockerScan.ps1 as the remediation script.
#>

$script:ScriptVersion = '1.1.0'
$script:TunoBuild = 10627

# How old the newest bundle may be before the scan runs again. Seven days is
# the house cadence; edit the number in a copy for a faster or slower ring.
$MaxAgeDays = 7
# KEEP EQUAL to $script:ScanWindowDays in Invoke-TunoAppLockerScan.ps1 (a test
# holds them to it): the scanner skips the rescan inside the same window.

# How far back a bundle that did not reach the harvest site is still chased.
# The scanner's housekeeping removes its own output after 30 days; this matches.
$PendingDays = 30

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

# ══════════════════════════════════════════════════════════════════════════════
# Pending harvest (1.14.0): which bundles of the last $Days did not land
#
# BYTE-IDENTICAL in Invoke-TunoAppLockerScan.ps1 and Detect-TunoAppLockerScan.ps1
# (tests/applocker/harvest.test.js holds them to it) - the detection flags what
# the remediation will retry, never a different list. Per bundle, oldest first:
# a .harvest-done marker beside it = landed (or no target any more), skip; a
# .harvest-pending marker = pending, its last line the reason; neither = a
# bundle from before 1.14.0, pending when the newest AppLockerScan-<stamp>.log
# at or before its own stamp carries 'harvest: upload FAILED'. Strict-mode safe.
# ══════════════════════════════════════════════════════════════════════════════
function Get-TunoPendingHarvest {
    param([string]$Folder, [int]$Days = 30)
    $list = New-Object System.Collections.Generic.List[object]
    if (-not $Folder -or -not (Test-Path -LiteralPath $Folder -PathType Container)) { return ,$list.ToArray() }
    $cutoff = (Get-Date).AddDays(-$Days)
    $logs = @(Get-ChildItem -LiteralPath $Folder -Filter 'AppLockerScan-*.log' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^AppLockerScan-\d{8}-\d{4}\.log$' } | Sort-Object Name -Descending)
    $bundles = @(Get-ChildItem -LiteralPath $Folder -Filter 'TunoAppLockerScan-*.json' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $cutoff } | Sort-Object LastWriteTime)
    foreach ($b in $bundles) {
        $base = $b.FullName.Substring(0, $b.FullName.Length - 5)
        if (Test-Path -LiteralPath ($base + '.harvest-done') -PathType Leaf) { continue }
        $pendingPath = $base + '.harvest-pending'
        if (Test-Path -LiteralPath $pendingPath -PathType Leaf) {
            $lines = @()
            $reason = 'upload pending'
            try { $lines = @(Get-Content -LiteralPath $pendingPath -ErrorAction Stop | Where-Object { ([string]$_).Trim() }) } catch { $reason = 'pending marker unreadable' }
            if ($lines.Count -gt 0) { $reason = ([string]$lines[$lines.Count - 1]).Trim() }
            $list.Add([pscustomobject]@{ Path = $b.FullName; Name = $b.Name; Written = $b.LastWriteTime; Source = 'marker'; Tries = $lines.Count; Reason = $reason })
            continue
        }
        $m = [regex]::Match($b.Name, '-(\d{8}-\d{4})\.json$')
        if (-not $m.Success) { continue }
        $stamp = $m.Groups[1].Value
        $log = $null
        foreach ($l in $logs) {
            if ([string]::CompareOrdinal($l.Name.Substring(14, 13), $stamp) -le 0) { $log = $l; break }
        }
        if (-not $log) { continue }
        $hit = @(Select-String -LiteralPath $log.FullName -SimpleMatch 'harvest: upload FAILED' -ErrorAction SilentlyContinue)
        if ($hit.Count -eq 0) { continue }
        $list.Add([pscustomobject]@{ Path = $b.FullName; Name = $b.Name; Written = $b.LastWriteTime; Source = 'transcript'; Tries = $hit.Count; Reason = ([string]$hit[$hit.Count - 1].Line).Trim() })
    }
    return ,$list.ToArray()
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

$pending = Get-TunoPendingHarvest -Folder $ScanFolder -Days $PendingDays
if ($pending.Count -gt 0) {
    $last = $pending[$pending.Count - 1]
    $why = [string]$last.Reason
    if ($why.Length -gt 180) { $why = $why.Substring(0, 180) + '...' }
    $msg = "AppLocker scan bundle on $env:COMPUTERNAME is $age day(s) old but $($pending.Count) bundle(s) did not reach the harvest site (newest $($last.Name); $why) - the upload will be retried, no rescan"
    Write-DetectLog ("Detection v{0} (build {1}): {2}" -f $script:ScriptVersion, $script:TunoBuild, $msg)
    Write-Output $msg
    exit 1
}

$msg = "AppLocker scan bundle on $env:COMPUTERNAME is $age day(s) old ($($newest.Name)), within the $MaxAgeDays-day window, nothing pending upload - nothing to do"
Write-DetectLog ("Detection v{0} (build {1}): {2}" -f $script:ScriptVersion, $script:TunoBuild, $msg)
Write-Output $msg
exit 0
