# Detect-TunoWeeklyAppLockerHarvest.ps1  v1.0.0  (TUNO build 10695)
#Requires -Version 5.1
<#
.SYNOPSIS
Daily Intune detection; triggers a weekly AppLocker event harvest or pending retry.
.NOTES
T29; SYSTEM, 64-bit PowerShell. Exit 1 means collect/retry, not device noncompliance.
The success checkpoint moves only after SharePoint confirms the bundle upload.
#>
$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10695
$root = Join-Path $env:ProgramData 'TUNO\AppLockerHarvest'
$pending = @(Get-ChildItem -LiteralPath (Join-Path $root 'Pending') -Filter 'T29_AppLocker_*.json' -File -ErrorAction SilentlyContinue)
if ($pending.Count) { Write-Output 'Pending upload: retry on this daily pass'; exit 1 }
try {
    $checkpoint = Get-Content -LiteralPath (Join-Path $root 'Success.json') -Raw -ErrorAction Stop | ConvertFrom-Json
    $last = if ($checkpoint.collectedUtc -is [datetime]) { $checkpoint.collectedUtc.ToUniversalTime() } else { [datetime]::Parse([string]$checkpoint.collectedUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
    if ($last -le [datetime]::UtcNow -and $last -gt [datetime]::UtcNow.AddDays(-7)) {
        Write-Output ('Weekly upload current: {0:o}. This is a delivery checkpoint, not a security verdict.' -f $last)
        exit 0
    }
} catch { }
Write-Output 'Weekly AppLocker collection/upload is due'; exit 1
