#Requires -Version 5.1
<#
.SYNOPSIS
Detection half of the Intune Remediation pair: do the IT-TOOLS house folders exist
with the ACL the standing AppLocker allows depend on?

.DESCRIPTION
Exit 1 (non-compliant) when any house folder is missing, when any principal outside
SYSTEM / Administrators / CREATOR OWNER can write inside them, or when SYSTEM itself
has lost write access - so Intune runs Initialize-TunoItToolsFolders.ps1. Exit 0
(compliant) when the folders exist and the ACL is exactly what the standing allow
rules assume.

THE THREE QUESTIONS, in the order they matter:
  1. Do %ProgramData%\IT-TOOLS, \Apps, \Scripts and \LOGS exist? A missing folder
     is the trap itself: ProgramData's default ACL lets a standard user create it,
     own it, and walk through the standing allow.
  2. Can anyone untrusted write there? Evaluated from the DACL the same way the
     remediation verifies - the two halves MUST agree, or the pair loops forever
     (remediation "fixes", detection still objects).
  3. Can SYSTEM still write there? The house scripts (the cleanup, this pair) log
     to IT-TOOLS\LOGS as SYSTEM; an over-tightened ACL that locks SYSTEM out breaks
     that silently, so it is detected rather than discovered.

Reads only - this half changes nothing, ever. Unlike the AppLocker cleanup pair,
this pair is a STANDING assignment: leave it scheduled on the estate, because its
whole point is catching a folder that drifted writable after provisioning.

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation detection script, SYSTEM, 64-bit PowerShell.
#>

[CmdletBinding()]
param(
    [string]$Root = "$env:ProgramData\IT-TOOLS"
)

$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10570

$ErrorActionPreference = 'SilentlyContinue'
$found = @()

$folders = @($Root, (Join-Path $Root 'Apps'), (Join-Path $Root 'Scripts'), (Join-Path $Root 'LOGS'))

# 1. Existence. Missing folders are the trap, not a lesser finding.
$missing = @($folders | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Container) })
if ($missing.Count -gt 0) {
    $found += "missing: $($missing -join ', ')"
}

# 2 + 3. The DACL, read the same way the remediation verifies it - same write
# mask, same trusted set - so a device the remediation just fixed always
# detects compliant, and a device it could not fix keeps being reported.
$writeMask = [int][System.Security.AccessControl.FileSystemRights]::CreateFiles -bor
             [int][System.Security.AccessControl.FileSystemRights]::CreateDirectories -bor
             [int][System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
             [int][System.Security.AccessControl.FileSystemRights]::TakeOwnership
$sysWriteMask = [int][System.Security.AccessControl.FileSystemRights]::CreateFiles -bor
                [int][System.Security.AccessControl.FileSystemRights]::CreateDirectories
$trusted = @('S-1-5-18', 'S-1-5-32-544', 'S-1-3-0')   # SYSTEM, Administrators, CREATOR OWNER

foreach ($f in ($folders | Where-Object { Test-Path -LiteralPath $_ -PathType Container })) {
    $sec = Get-Acl -Path $f
    if (-not $sec) { $found += "$f - DACL could not be read"; continue }
    $systemWrites = $false
    foreach ($ace in $sec.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
        $sid = $ace.IdentityReference.Value
        if ($ace.AccessControlType -eq 'Allow') {
            if ($sid -eq 'S-1-5-18' -and (([int]$ace.FileSystemRights -band $sysWriteMask) -ne 0)) { $systemWrites = $true }
            if ($trusted -contains $sid) { continue }
            if (([int]$ace.FileSystemRights -band $writeMask) -ne 0) { $found += "$f grants write to $sid" }
        }
        elseif ($sid -eq 'S-1-5-18' -and (([int]$ace.FileSystemRights -band $sysWriteMask) -ne 0)) {
            # A Deny on SYSTEM's write beats any Allow - logging is broken.
            $found += "$f denies SYSTEM write"
            $systemWrites = $false
        }
    }
    if (-not $systemWrites) { $found += "$f - SYSTEM cannot write (house scripts log here)" }
}

if ($found.Count -gt 0) {
    Write-Output ("IT-TOOLS folders non-compliant: " + ($found -join '; '))
    exit 1
}
Write-Output "IT-TOOLS folders present, writes restricted to SYSTEM and Administrators, SYSTEM can log."
exit 0
