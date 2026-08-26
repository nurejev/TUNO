#Requires -Version 5.1
<#
.SYNOPSIS
Creates the IT-TOOLS house folders with the ACL the standing AppLocker allows depend
on. Run BEFORE the policy lands - deploy as an Intune platform script or Remediation,
as SYSTEM.

.DESCRIPTION
Every policy TUNO generates carries standing allow rules for
%OSDRIVE%\ProgramData\IT-TOOLS\Apps and \Scripts. Those rules are safe on exactly one
condition: only SYSTEM and Administrators can write there.

THE TRAP THIS SCRIPT CLOSES. ProgramData's default ACL lets a STANDARD USER create
subfolders, and the creator of a folder owns it. So if the house folders do not exist
when the policy arrives, any user can create C:\ProgramData\IT-TOOLS\Apps themselves,
own it, and walk through the standing allow with whatever they drop there. The folders
must therefore exist WITH the right ACL before the first policy is assigned - which is
why provisioning is a script and not a hope.

WHAT IT DOES, idempotently:
  1. Creates %ProgramData%\IT-TOOLS, \Apps, \Scripts and \LOGS if missing.
  2. Sets an explicit ACL on IT-TOOLS and lets it inherit down:
        SYSTEM                 Full control
        BUILTIN\Administrators Full control
        BUILTIN\Users          Read & execute only
     Inheritance from ProgramData is DISABLED, so the Users create-folder right
     cannot leak in, and existing ACEs are replaced rather than appended.
  3. Verifies by re-reading the ACL, and exits 1 if any non-admin principal can
     still write - so an Intune Remediation reports the device rather than the wish.

  4. Proves SYSTEM can write by writing: appends a provisioning record to
     IT-TOOLS\LOGS\Initialize-TunoItToolsFolders.log. The house scripts (the
     AppLocker cleanup, this pair) log there as SYSTEM, so an ACL that verifies
     clean but cannot take a log line is still a failure - and it is found by
     doing the thing, not by reasoning about it.

The scan double-checks this on every run (a user-writable directory inside a house
folder raises its loudest warning); this script is what makes that check come back
quiet.

REMEDIATION HALF of the pair with Detect-TunoItToolsFolders.ps1, which evaluates
the same folders with the same write mask and trusted set - the two halves MUST
stay in agreement, or the pair loops (this half "fixes", detection still objects).
Unlike the AppLocker cleanup pair, this pair is a STANDING assignment: leave it
scheduled on the estate, because a folder that drifts writable after provisioning
is exactly what it exists to catch and re-tighten.

.NOTES
Version   : 1.1.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation remediation script (with Detect-TunoItToolsFolders.ps1
            as detection) or a standalone platform script, SYSTEM, 64-bit. Assign it
            BEFORE (or with) the AppLocker audit profile - never after the enforced
            one - and leave the pair assigned.
#>

[CmdletBinding()]
param(
    [string]$Root = "$env:ProgramData\IT-TOOLS"
)

# Same discipline as the other scripts: ScriptVersion is this file's history,
# TunoBuild the site build that served it, held to js/version.js by the guard.
$script:ScriptVersion = '1.1.0'
$script:TunoBuild = 9

$ErrorActionPreference = 'Stop'

# SIDs, not names - "BUILTIN\Administrators" does not exist on a non-English OS.
$sidSystem = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$sidAdmins = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
$sidUsers  = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545')

$folders = @($Root, (Join-Path $Root 'Apps'), (Join-Path $Root 'Scripts'), (Join-Path $Root 'LOGS'))
foreach ($f in $folders) {
    if (-not (Test-Path $f)) { New-Item -Path $f -ItemType Directory -Force | Out-Null }
}

# Build the ACL once and apply it to the root; the child ACEs below are marked to
# inherit, so Apps/Scripts/LOGS receive it without their own explicit entries.
$inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$prop = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow

$acl = New-Object System.Security.AccessControl.DirectorySecurity
# Protect: no inheritance from ProgramData (that is where the Users create-folder
# right would leak in from), and do not preserve what was there.
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($sidAdmins)
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, 'FullControl', $inherit, $prop, $allow)))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmins, 'FullControl', $inherit, $prop, $allow)))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidUsers, 'ReadAndExecute, Synchronize', $inherit, $prop, $allow)))
Set-Acl -Path $Root -AclObject $acl

# Children: explicitly reset each to inherit-only, so a folder a user created
# BEFORE this ran (owning it, with their own ACEs) is stripped back to the
# inherited admin-only set rather than keeping its private permissions.
foreach ($child in $folders | Select-Object -Skip 1) {
    $childAcl = New-Object System.Security.AccessControl.DirectorySecurity
    $childAcl.SetAccessRuleProtection($false, $false)   # inherit from IT-TOOLS, keep nothing explicit
    $childAcl.SetOwner($sidAdmins)
    Set-Acl -Path $child -AclObject $childAcl
}

# ── Verify by reading BACK, and tell the truth in the exit code ──────────────
$writeMask = [int][System.Security.AccessControl.FileSystemRights]::CreateFiles -bor
             [int][System.Security.AccessControl.FileSystemRights]::CreateDirectories -bor
             [int][System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
             [int][System.Security.AccessControl.FileSystemRights]::TakeOwnership
$trusted = @('S-1-5-18', 'S-1-5-32-544', 'S-1-3-0')   # SYSTEM, Administrators, CREATOR OWNER (admin-created content)
$bad = @()
foreach ($f in $folders) {
    $sec = Get-Acl -Path $f
    foreach ($ace in $sec.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
        if ($ace.AccessControlType -ne 'Allow') { continue }
        $sid = $ace.IdentityReference.Value
        if ($trusted -contains $sid) { continue }
        if (([int]$ace.FileSystemRights -band $writeMask) -ne 0) { $bad += "$f grants write to $sid" }
    }
}

# ── Prove SYSTEM can write by writing ────────────────────────────────────────
# The house scripts log to IT-TOOLS\LOGS as SYSTEM (the AppLocker cleanup, this
# pair). An ACL that reads back clean but cannot take a log line is still a
# broken deployment, so the check is a WRITE, not another read: append one
# provisioning record. Its failure is a finding like any other.
try {
    $who = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $line = "{0:yyyy-MM-dd HH:mm:ss}Z  Initialize-TunoItToolsFolders {1} (TUNO build {2}) ran as {3} - {4}" -f
        [DateTime]::UtcNow, $script:ScriptVersion, $script:TunoBuild, $who,
        $(if ($bad.Count -eq 0) { 'ACL verified clean' } else { 'ACL verification FAILED: ' + ($bad -join '; ') })
    Add-Content -LiteralPath (Join-Path $Root 'LOGS\Initialize-TunoItToolsFolders.log') -Value $line -Encoding UTF8 -ErrorAction Stop
}
catch {
    $bad += "LOGS write test failed for $((Join-Path $Root 'LOGS')): $($_.Exception.Message)"
}

if ($bad.Count -eq 0) {
    Write-Output "IT-TOOLS folders provisioned: $($folders -join ', ') - writes restricted to SYSTEM and Administrators, log line taken."
    exit 0
}
else {
    Write-Output ("IT-TOOLS provisioning INCOMPLETE: " + ($bad -join '; '))
    exit 1
}
