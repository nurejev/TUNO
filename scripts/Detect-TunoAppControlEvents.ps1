#Requires -Version 5.1
<#
.SYNOPSIS
Detection half of the App Control events collection pair. Always reports
non-compliant - on purpose, because here the "remediation" IS the collection.

.DESCRIPTION
Intune Remediations run the remediation script only when detection exits 1. This
pair inverts the model: the work is the harvest (Get-TunoAppControlEvents.ps1
collecting CodeIntegrity and AppLocker events into reports and the T01 bundle),
and the harvest should run on EVERY scheduled pass. So this detection exits 1
unconditionally.

KNOW WHAT THAT DOES TO THE CONSOLE. Every device in the assigned ring shows as
"Issue fixed" on every pass - the Remediation's compliance numbers mean "the
collector ran", never "the device is fine". Do not put this pair in a compliance
report, and unassign it when the collection campaign ends: it is a pump, not a
health check.

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation detection script, SYSTEM, 64-bit PowerShell.
Replaces  : Detect_ACB.ps1 v3.9 - same always-trigger design, house conventions.
#>

$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10555

$LogFolder = "$env:ProgramData\IT-TOOLS\LOGS"
$LogFile   = Join-Path $LogFolder 'AppControlEvents-Detect.log'
try {
    if (-not (Test-Path $LogFolder)) { New-Item -Path $LogFolder -ItemType Directory -Force | Out-Null }
    Add-Content -Path $LogFile -Value ("[{0}] Detection v{1} (build {2}) on {3}: always non-compliant - triggering collection" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $script:ScriptVersion, $script:TunoBuild, $env:COMPUTERNAME) -Force
}
catch { }

Write-Output "App Control events collection will run on $env:COMPUTERNAME (this detection always triggers - the remediation IS the collection)"
exit 1
