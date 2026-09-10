#Requires -Version 5.1
<#
.SYNOPSIS
Removes the AppLocker policy a device is currently carrying, so a new policy can be
deployed under a new grouping onto a clean slate. Built for Intune Remediations; runs
standalone too.

.DESCRIPTION
THE PROBLEM THIS SOLVES. Deploying an AppLocker policy does not clear what came
before - every delivery path ADDS. So a brownfield rollout is three deliberate steps,
in this order:

    1. UNASSIGN the old Intune profile (or unlink the old GPO). If you skip this,
       everything this script removes comes straight back at the next sync - cleanup
       without unassignment is a loop, not a fix.
    2. RUN THIS SCRIPT - it clears what unassignment leaves behind: the local policy,
       and the GPO tattoo under HKLM\SOFTWARE\Policies\Microsoft\Windows\SrpV2.
    3. DEPLOY the new policy under a NEW grouping (a GUID - see the checklist).

WHAT IT DELIBERATELY DOES NOT DO, and why - each of these was a defect in the script
this one replaces:

  * It does NOT clear the AppLocker event logs by default. Those 8003/8006 events are
    the audit evidence the whole rollout runs on; a cleanup that wipes them destroys
    the month of data that justified enforcing. Pass -ClearEventLogs if you truly want
    them gone, and they are exported to the log folder first even then.
  * It does NOT stop or disable the Application Identity service by default. The NEW
    policy you are about to deploy needs AppIDSvc running, or AppLocker neither blocks
    nor logs and the pilot reads clean while doing nothing. (On current Windows the
    service is protected anyway - Stop-Service fails quietly, which is how the old
    script "succeeded" at this step.) Pass -DisableAppIdService only if AppLocker is
    being retired for good, not replaced.
  * It does NOT exit 0 when verification fails. To Intune Remediations exit 0 means
    "remediated"; reporting a half-clean device as clean hides exactly the machines
    that need a human.

WHAT IT DOES:

  1. BACKS UP first: the effective policy and the local policy as XML, and the SrpV2
     registry key as a .reg export, into the log folder. Removal should be reversible.
  2. Applies an EMPTY policy (all five collections, NotConfigured, zero rules) via
     Set-AppLockerPolicy. Empty-and-NotConfigured is the one state that restricts
     nothing - see the checklist for why NotConfigured WITH rules is the opposite.
  3. Clears the GPO/local tattoo: rule GUIDs and EnforcementMode values under
     HKLM\SOFTWARE\Policies\Microsoft\Windows\SrpV2, then the key itself.
  4. VERIFIES: the effective policy must contain zero rules afterwards. Exit 0 only
     if that is true; exit 1 otherwise, so Intune reports the device, not the wish.

.PARAMETER LogFolder
Where the log and the backups go. Default %ProgramData%\IT-TOOLS\LOGS - the house
convention for everything IT writes on an endpoint.

.PARAMETER ClearEventLogs
Also clear the four AppLocker event logs - AFTER exporting them to the log folder.
Off by default: those events are the audit evidence.

.PARAMETER DisableAppIdService
Also stop AppIDSvc and set it to Manual. Off by default: the next policy needs it.
Use only when AppLocker is being retired, not replaced.

.PARAMETER RemoveMdmGroupings
ALSO delete the MDM-delivered grouping caches under %WINDIR%\System32\AppLocker\MDM.
Off by default, and read this first:

WHAT THIS SCRIPT CLEARS BY DEFAULT, AND WHAT IT DOES NOT. AppLocker policy reaches a
device down three roads, and they leave state in three different places:

    Local policy        cleared by the empty policy this script applies
    GPO                 tattooed under Policies\SrpV2 - cleared by this script
    Intune (CSP)        one cache per {grouping} under System32\AppLocker\MDM -
                        NOT deleted by default

The MDM groupings belong to their Intune profiles: unassigning the profile makes
Intune send the CSP Delete, which is the supported removal. A grouping this script
finds there while its profile is still assigned would simply RETURN at the next sync.

The exception is an ORPHANED grouping - one whose profile is gone but whose cache
survived, which is exactly the debris Microsoft's shared-grouping warning predicts
("Delete/unenrollment is not properly supported unless Grouping values are unique").
Those keep enforcing with nothing in the portal pointing at them, and
-RemoveMdmGroupings is for them: it deletes the cached grouping folders so the next
policy evaluation no longer merges them in. Every grouping found is LOGGED by name in
either mode, so the log answers "what was on this device" even when nothing is removed.
Expect a reboot to fully settle CSP state, and run it only after the old profiles are
unassigned - against an assigned profile it is a loop, not a fix.

.PARAMETER Force
Clean even when the marker says this generation already ran here. For a shell, by
hand, once. A Remediation never needs it: the detection half gates it by the marker.

.NOTES
Version   : 1.3.1
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation (pair with Detect-TunoAppLockerPolicy.ps1), run as
            SYSTEM, 64-bit PowerShell. Runs standalone in an elevated shell too.
Replaces  : the CloudFlow Remediate-AppLocker.ps1 - same intent, three defects fixed
            (event-log wipe by default, AppIDSvc disabled by default, exit 0 on
            failed verification).
Reboot    : clearing CSP-delivered policy via profile unassignment reboots the device
            (AppLocker CSP behaviour). This script itself does not reboot.
#>

[CmdletBinding()]
param(
    [string]$LogFolder = "$env:ProgramData\IT-TOOLS\LOGS",
    [switch]$ClearEventLogs,
    [switch]$DisableAppIdService,
    [switch]$RemoveMdmGroupings,
    [switch]$Force
)

# THE MARKER (1.3.0). When this script verifies the device clean it records that it
# ran - HKLM\SOFTWARE\TUNO\AppLockerCleanup and IT-TOOLS\LOGS\AppLocker-Cleanup.done -
# and Detect-TunoAppLockerPolicy.ps1 reads that marker first, so a device that
# received the NEW policy afterwards is never cleaned again by a pair left assigned.
# Raise CleanupGeneration in BOTH scripts to run a deliberate second campaign; pass
# -Force in a shell to clean a marked device once, by hand.
$script:CleanupGeneration = 1

# Two numbers, same discipline as the scan: ScriptVersion is this file's history,
# TunoBuild the site build that served it. Held to js/version.js by the guard.
$script:ScriptVersion = '1.3.1'
$script:TunoBuild = 10610

$ErrorActionPreference = 'Stop'
$SrpV2 = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\SrpV2'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $LogFolder 'AppLocker-Cleanup.log'

if (-not (Test-Path $LogFolder)) { New-Item -Path $LogFolder -ItemType Directory -Force | Out-Null }
function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Force
    Write-Output $line
}

Write-Log "========== TUNO AppLocker cleanup v$script:ScriptVersion (build $script:TunoBuild) =========="
Write-Log "Computer: $env:COMPUTERNAME  User: $env:USERNAME"
Write-Log "REMINDER: if the old Intune profile or GPO is still assigned, what this removes returns at the next sync. Unassign first."

$failures = 0

# ── What counts as "AppLocker state" (Clear 1.3.0 / Detect 1.1.0, Mihai's 8 Sep
# screenshot: three devices Recurred/Failed forever on "SrpV2 registry key
# present (5 subkeys)"). Two things live in SrpV2 and in the effective policy
# that are NOT legacy policy and must never fail the cleanup:
#   * the App Control MANAGED INSTALLER policy Intune keeps on the device - a
#     ManagedInstaller collection plus Exe/Dll stubs (AuditOnly, one Allow-*
#     path rule each), rewritten by Intune at every sync; and
#   * collection subkeys with NO rules in them - the empty policy this very
#     script applies creates five of those.
# So: count RULES, per collection, skipping the ManagedInstaller collection and
# the stub shape; report the key's existence as information, never as a fault.
function Get-TunoAppLockerState {
    $srp = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\SrpV2'
    $st = [pscustomobject]@{ effectiveRules = 0; effectiveDetail = @(); srpPresent = $false; srpRules = 0; srpDetail = @(); managedInstaller = $false; cmdletError = $null }
    $modeName = @{ '0' = 'NotConfigured'; '1' = 'Enabled'; '2' = 'AuditOnly' }
    # THE COMPANION RULE (Detect 1.1.1 / Clear 1.3.1, Mihai's 8 Sep output:
    # "Dll=AuditOnly/2, Exe=AuditOnly/2, ManagedInstaller=AuditOnly/1" counted
    # as 4 legacy rules, so the loop went on). The Managed Installer policy's
    # Exe/Dll companions are not always one allow-* rule. What IS always true:
    # an AuditOnly collection blocks nothing, and on a device that carries a
    # ManagedInstaller collection those two are Intune's. So when Managed
    # Installer is present, an AuditOnly Exe/Dll collection whose rules are all
    # Allow is a companion and counts 0 - and its rule names are printed, so
    # the day that assumption is wrong the output says which rule broke it.
    # Legacy state is: any Enabled collection with rules, any rule in
    # Msi/Script/Appx, any Deny, or Exe/Dll rules with no Managed Installer.
    $names = { param($rules) (@($rules | ForEach-Object { $n = $_.GetAttribute('Name'); if ($n.Length -gt 40) { $n.Substring(0, 39) + '…' } else { $n } }) -join ' | ') }
    try {
        [xml]$eff = Get-AppLockerPolicy -Effective -Xml -ErrorAction Stop
        $cols = @($eff.SelectNodes('/AppLockerPolicy/RuleCollection'))
        $mi = @($cols | Where-Object { $_.GetAttribute('Type') -eq 'ManagedInstaller' }).Count -gt 0
        if ($mi) { $st.managedInstaller = $true }
        foreach ($rc in $cols) {
            $t = $rc.GetAttribute('Type'); $mode = $rc.GetAttribute('EnforcementMode')
            $rules = @($rc.ChildNodes | Where-Object { $_.NodeType -eq 'Element' })
            $allAllow = ($rules.Count -gt 0) -and (@($rules | Where-Object { $_.GetAttribute('Action') -ne 'Allow' }).Count -eq 0)
            $companion = $mi -and ($t -in 'Exe', 'Dll') -and $mode -eq 'AuditOnly' -and $allAllow
            $counted = if ($t -eq 'ManagedInstaller' -or $companion) { 0 } else { $rules.Count }
            $st.effectiveRules += $counted
            $tag = if ($t -eq 'ManagedInstaller') { ' (Managed Installer, Intune)' } elseif ($companion) { ' (Managed Installer companion: ' + (& $names $rules) + ')' } elseif ($rules.Count) { ' [' + (& $names $rules) + ']' } else { '' }
            $st.effectiveDetail += ('{0}={1}/{2}{3}' -f $t, $mode, $rules.Count, $tag)
        }
    } catch { $st.cmdletError = $_.Exception.Message }
    if (Test-Path $srp) {
        $st.srpPresent = $true
        $srpCols = @(Get-ChildItem -Path $srp -ErrorAction SilentlyContinue)
        $mi = @($srpCols | Where-Object { $_.PSChildName -eq 'ManagedInstaller' }).Count -gt 0
        if ($mi) { $st.managedInstaller = $true }
        foreach ($col in $srpCols) {
            $t = $col.PSChildName
            $raw = ''; try { $raw = [string](Get-ItemProperty -Path $col.PSPath -Name EnforcementMode -ErrorAction SilentlyContinue).EnforcementMode } catch {}
            $mode = if ($modeName.ContainsKey($raw)) { $modeName[$raw] } elseif ($raw) { $raw } else { 'NotConfigured' }
            $ruleKeys = @(Get-ChildItem -Path $col.PSPath -ErrorAction SilentlyContinue)
            $ruleXml = @()
            foreach ($rk in $ruleKeys) { $v = ''; try { $v = [string](Get-ItemProperty -Path $rk.PSPath -Name Value -ErrorAction SilentlyContinue).Value } catch {}; $ruleXml += $v }
            $allAllow = ($ruleKeys.Count -gt 0) -and (@($ruleXml | Where-Object { $_ -notmatch 'Action="Allow"' }).Count -eq 0)
            $companion = $mi -and ($t -in 'Exe', 'Dll') -and $mode -eq 'AuditOnly' -and $allAllow
            $counted = if ($t -eq 'ManagedInstaller' -or $companion) { 0 } else { $ruleKeys.Count }
            $st.srpRules += $counted
            $rn = @($ruleXml | ForEach-Object { $m = [regex]::Match($_, 'Name="([^"]*)"'); if ($m.Success) { $n = $m.Groups[1].Value; if ($n.Length -gt 40) { $n.Substring(0, 39) + '…' } else { $n } } else { '?' } }) -join ' | '
            $tag = if ($t -eq 'ManagedInstaller') { ' (Managed Installer, Intune)' } elseif ($companion) { ' (Managed Installer companion: ' + $rn + ')' } elseif ($ruleKeys.Count) { ' [' + $rn + ']' } else { '' }
            $st.srpDetail += ('{0}={1}/{2}{3}' -f $t, $mode, $ruleKeys.Count, $tag)
        }
    }
    return $st
}

# ── 0. The marker - refuse to clean a device this generation already cleaned ──
$markerKey  = 'HKLM:\SOFTWARE\TUNO\AppLockerCleanup'
$markerFile = Join-Path $LogFolder 'AppLocker-Cleanup.done'
$markerGen = -1; $markerWhen = ''
try { if (Test-Path $markerKey) { $m = Get-ItemProperty -Path $markerKey; $markerGen = [int]$m.Generation; $markerWhen = [string]$m.RanUtc } } catch { }
if ($markerGen -lt 0 -and (Test-Path $markerFile)) {
    try { $line = Get-Content -Path $markerFile -TotalCount 1; if ($line -match 'Generation=(\d+)') { $markerGen = [int]$Matches[1] }; if ($line -match 'RanUtc=(\S+)') { $markerWhen = $Matches[1] } } catch { }
}
if ($markerGen -ge $script:CleanupGeneration -and -not $Force) {
    Write-Log ("STOP: cleanup generation {0} already ran on this device at {1}. Whatever AppLocker policy is here now arrived AFTER that and is the new one - not touching it. Pass -Force to clean once more by hand, or raise CleanupGeneration in both scripts for a new campaign." -f $markerGen, $markerWhen)
    Write-Output 'AppLocker cleanup already done on this device - nothing changed'
    exit 0
}
if ($markerGen -ge 0) { Write-Log ("INFO: an older cleanup marker is present (generation {0}, {1}); this run is generation {2}{3}." -f $markerGen, $markerWhen, $script:CleanupGeneration, $(if ($Force) { ', forced' } else { '' })) }

# ── 1. Backup - removal should be reversible ─────────────────────────────────
try {
    $effBak = Join-Path $LogFolder "AppLockerPolicy-Effective-$stamp.xml"
    Get-AppLockerPolicy -Effective -Xml | Out-File -FilePath $effBak -Encoding UTF8 -Force
    Write-Log "BACKUP: effective policy -> $effBak"
}
catch { Write-Log "WARN: could not back up the effective policy: $($_.Exception.Message)" }
try {
    $locBak = Join-Path $LogFolder "AppLockerPolicy-Local-$stamp.xml"
    Get-AppLockerPolicy -Local -Xml | Out-File -FilePath $locBak -Encoding UTF8 -Force
    Write-Log "BACKUP: local policy -> $locBak"
}
catch { Write-Log "WARN: could not back up the local policy: $($_.Exception.Message)" }
if (Test-Path $SrpV2) {
    $regBak = Join-Path $LogFolder "SrpV2-$stamp.reg"
    & reg.exe export 'HKLM\SOFTWARE\Policies\Microsoft\Windows\SrpV2' $regBak /y 2>$null | Out-Null
    if (Test-Path $regBak) { Write-Log "BACKUP: SrpV2 registry -> $regBak" }
    else { Write-Log 'WARN: reg export of SrpV2 failed - continuing, the XML backups above still allow a restore.' }
}

# ── 2. Empty local policy - all collections NotConfigured with ZERO rules ────
# The one genuinely inert state. NotConfigured with rules would be enforced.
$emptyPolicy = @'
<AppLockerPolicy Version="1">
  <RuleCollection Type="Appx" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Dll" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Exe" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Msi" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Script" EnforcementMode="NotConfigured" />
</AppLockerPolicy>
'@
try {
    $tempFile = Join-Path $env:TEMP 'TunoEmptyAppLockerPolicy.xml'
    $emptyPolicy | Out-File -FilePath $tempFile -Encoding UTF8 -Force
    Set-AppLockerPolicy -XmlPolicy $tempFile -ErrorAction Stop
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    Write-Log 'OK: local policy replaced with the empty (inert) policy'
}
catch {
    Write-Log "FAIL: Set-AppLockerPolicy: $($_.Exception.Message)"
    $failures++
}

# ── 3. Clear the SrpV2 tattoo (GPO/local remnants) ───────────────────────────
if (Test-Path $SrpV2) {
    foreach ($ruleType in @('Appx', 'Dll', 'Exe', 'Msi', 'Script')) {
        $path = Join-Path $SrpV2 $ruleType
        if (-not (Test-Path $path)) { continue }
        try {
            Get-ChildItem -Path $path -ErrorAction SilentlyContinue |
                ForEach-Object { Remove-Item -Path $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue }
            Remove-ItemProperty -Path $path -Name 'EnforcementMode' -Force -ErrorAction SilentlyContinue
            Write-Log "OK: cleared $ruleType rules from SrpV2"
        }
        catch { Write-Log "WARN: could not fully clear ${ruleType}: $($_.Exception.Message)" }
    }
    if (Test-Path (Join-Path $SrpV2 'ManagedInstaller')) {
        Write-Log 'INFO: SrpV2\ManagedInstaller is the App Control Managed Installer policy Intune keeps here - left in place, and the SrpV2 root stays for it.'
    }
    else {
        try {
            Remove-Item -Path $SrpV2 -Recurse -Force -ErrorAction Stop
            Write-Log 'OK: removed the SrpV2 key'
        }
        catch { Write-Log "WARN: could not remove the SrpV2 key itself: $($_.Exception.Message)" }
    }
}
else { Write-Log 'INFO: no SrpV2 key present - nothing tattooed' }

# ── 3b. MDM groupings - NAMED always, removed only on request ────────────────
# Intune-delivered policy is cached per {grouping} under System32\AppLocker\MDM.
# Those caches belong to their profiles: unassignment is the supported removal,
# and deleting one whose profile is still assigned just invites it back at the
# next sync. But an ORPHANED grouping - profile gone, cache surviving, which is
# the debris the CSP's shared-grouping delete bug leaves - keeps enforcing with
# nothing in the portal pointing at it. So: every grouping found is logged by
# name, and -RemoveMdmGroupings deletes them. Either way the verification below
# is the arbiter - if anything still merges into the effective policy, exit 1.
$mdmRoot = Join-Path $env:windir 'System32\AppLocker\MDM'
if (Test-Path $mdmRoot) {
    # Layout (Mihai's 7 Sep listing; 1.2.0 assumed three levels and named the
    # CSP area GUID as the grouping):
    #   MDM\<enrollment>\<CSP area GUID>\AppLocker\ApplicationLaunchRestrictions\<grouping>\<EXE|MSI|...>\Policy
    # So: find every Policy file, and the grouping is two folders above it.
    $names = @(Get-ChildItem -Path $mdmRoot -Recurse -File -Filter 'Policy' -ErrorAction SilentlyContinue |
        ForEach-Object { Split-Path -Leaf (Split-Path -Parent $_.DirectoryName) } | Sort-Object -Unique)
    if ($names.Count -gt 0) {
        Write-Log ("FOUND: {0} MDM grouping(s) cached on this device: {1}" -f $names.Count, ($names -join ', '))
        if ($RemoveMdmGroupings) {
            try {
                Get-ChildItem -Path $mdmRoot -Directory -ErrorAction SilentlyContinue |
                    ForEach-Object { Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction Stop }
                Write-Log 'OK: removed the cached MDM grouping folders. A reboot fully settles CSP state; if a profile is still ASSIGNED, its grouping returns at the next sync.'
            }
            catch {
                Write-Log "WARN: could not remove all MDM grouping caches: $($_.Exception.Message)"
                $failures++
            }
        }
        else {
            Write-Log 'INFO: MDM groupings are NOT removed by default - they belong to Intune profiles, and unassigning the profile is the supported removal. If these are ORPHANS (profile already gone), re-run with -RemoveMdmGroupings. Verification below fails this run if they still enforce.'
        }
    }
    else { Write-Log 'INFO: no MDM groupings cached' }
}
else { Write-Log 'INFO: no MDM AppLocker cache present on this device' }

# ── 4. Event logs - PRESERVED unless explicitly asked, exported even then ────
if ($ClearEventLogs) {
    $logNames = @(
        'Microsoft-Windows-AppLocker/EXE and DLL',
        'Microsoft-Windows-AppLocker/MSI and Script',
        'Microsoft-Windows-AppLocker/Packaged app-Deployment',
        'Microsoft-Windows-AppLocker/Packaged app-Execution'
    )
    foreach ($logName in $logNames) {
        $safe = ($logName -replace '[\\/ ]', '-') + "-$stamp.evtx"
        $evtxPath = Join-Path $LogFolder $safe
        & wevtutil.exe epl $logName $evtxPath 2>$null
        if (Test-Path $evtxPath) { Write-Log "BACKUP: $logName -> $evtxPath" }
        & wevtutil.exe cl $logName 2>$null
        Write-Log "OK: cleared $logName"
    }
}
else {
    Write-Log 'INFO: event logs PRESERVED (the 8003/8006 audit evidence). Pass -ClearEventLogs to remove them - they are exported first even then.'
}

# ── 5. AppIDSvc - LEFT ALONE unless AppLocker is being retired outright ──────
if ($DisableAppIdService) {
    try {
        Set-Service -Name 'AppIDSvc' -StartupType Manual -ErrorAction Stop
        Write-Log 'OK: AppIDSvc set to Manual (AppLocker retired, not replaced)'
    }
    catch { Write-Log "WARN: could not reconfigure AppIDSvc (it is a protected service on current Windows): $($_.Exception.Message)" }
}
else {
    Write-Log 'INFO: AppIDSvc left as-is - the policy you deploy next needs it running, or AppLocker neither blocks nor logs.'
}

# ── 6. Verify, and tell the truth about it ───────────────────────────────────
Write-Log '========== Verification =========='
$st = Get-TunoAppLockerState
if ($st.cmdletError) { Write-Log "WARN: could not read the effective policy back: $($st.cmdletError)"; $failures++ }
else { Write-Log ("Effective policy: {0} legacy rule(s) [{1}]" -f $st.effectiveRules, ($st.effectiveDetail -join ', ')) }
if ($st.srpPresent) { Write-Log ("SrpV2: {0} legacy rule(s) [{1}]" -f $st.srpRules, ($st.srpDetail -join ', ')) } else { Write-Log 'SrpV2: key gone' }
if ($st.managedInstaller) { Write-Log 'INFO: the Managed Installer policy (Intune, App Control) is on this device and is not legacy policy - it does not count against the cleanup.' }
if ($st.effectiveRules -gt 0) { Write-Log 'WARN: legacy rules remain in the effective policy - a GPO or profile is likely still applying. Unassign it, or this returns.'; $failures++ }
if ($st.srpRules -gt 0)       { Write-Log 'WARN: legacy rules remain tattooed under SrpV2.'; $failures++ }

if ($failures -eq 0) {
    # Write the marker ONLY on a clean result: a half-clean device must be retried,
    # and the marker is what stops the retry.
    $ranUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    try {
        if (-not (Test-Path $markerKey)) { New-Item -Path $markerKey -Force | Out-Null }
        Set-ItemProperty -Path $markerKey -Name Generation -Value $script:CleanupGeneration -Type DWord
        Set-ItemProperty -Path $markerKey -Name RanUtc -Value $ranUtc
        Set-ItemProperty -Path $markerKey -Name ScriptVersion -Value $script:ScriptVersion
        Set-ItemProperty -Path $markerKey -Name TunoBuild -Value $script:TunoBuild -Type DWord
        Set-ItemProperty -Path $markerKey -Name Computer -Value $env:COMPUTERNAME
        Write-Log "MARKER: $markerKey written (generation $script:CleanupGeneration, $ranUtc)"
    } catch { Write-Log "WARN: could not write the registry marker: $($_.Exception.Message)" }
    try {
        Set-Content -Path $markerFile -Value ("Generation={0} RanUtc={1} ScriptVersion={2} TunoBuild={3} Computer={4}" -f $script:CleanupGeneration, $ranUtc, $script:ScriptVersion, $script:TunoBuild, $env:COMPUTERNAME) -Encoding ASCII
        Write-Log "MARKER: $markerFile written"
    } catch { Write-Log "WARN: could not write the marker file: $($_.Exception.Message)" }
    Write-Log 'RESULT: device is clean and marked. Deploy the new policy under a NEW grouping now; the detection half will leave it alone.'
    Write-Output 'AppLocker policy removed - device clean, marker written'
    exit 0
}
else {
    # Exit 1, deliberately. To Intune Remediations 0 means remediated; reporting a
    # half-clean device as clean hides exactly the machines that need a human.
    Write-Log "RESULT: NOT clean ($failures check(s) failed). See the log. Most likely the old profile or GPO is still assigned."
    Write-Output "AppLocker cleanup incomplete - see $LogFile"
    exit 1
}
