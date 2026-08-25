#Requires -Version 5.1
<#
.SYNOPSIS
Detection half of the Intune Remediation pair: is there an AppLocker policy on this
device that the cleanup should remove?

.DESCRIPTION
Exit 1 (non-compliant) when the device carries AppLocker state - rules in the
effective policy, or a tattooed SrpV2 registry key - so Intune runs
Clear-TunoAppLockerPolicy.ps1. Exit 0 (compliant) when the device is already clean.

Assign this pair to the devices being MIGRATED to the new policy, and only for the
window between unassigning the old profile and deploying the new one. Left assigned
alongside the NEW policy, it would report every correctly-policied device as
non-compliant and the remediation would remove the policy you just deployed.

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation detection script, SYSTEM, 64-bit PowerShell.
#>

$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10429

$ErrorActionPreference = 'SilentlyContinue'
$found = @()

# Rules in the effective policy - the thing that actually decides on the endpoint.
try {
    [xml]$eff = Get-AppLockerPolicy -Effective -Xml
    $n = @($eff.SelectNodes('/AppLockerPolicy/RuleCollection/*')).Count
    if ($n -gt 0) { $found += "$n rule(s) in the effective policy" }
}
catch { }

# The GPO/local tattoo. Present-but-empty still means something wrote here.
$SrpV2 = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\SrpV2'
if (Test-Path $SrpV2) {
    $kids = @(Get-ChildItem -Path $SrpV2 -Recurse)
    $found += "SrpV2 registry key present ($($kids.Count) subkey(s))"
}

if ($found.Count -gt 0) {
    Write-Output ("AppLocker state found: " + ($found -join '; '))
    exit 1
}
Write-Output 'No AppLocker policy on this device'
exit 0
