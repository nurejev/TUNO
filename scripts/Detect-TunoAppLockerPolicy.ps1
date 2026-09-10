#Requires -Version 5.1
<#
.SYNOPSIS
Detection half of the Intune Remediation pair: is there an AppLocker policy on this
device that the cleanup should remove?

.DESCRIPTION
Exit 1 (non-compliant) when the device carries AppLocker state - rules in the
effective policy, or a tattooed SrpV2 registry key - so Intune runs
Clear-TunoAppLockerPolicy.ps1. Exit 0 (compliant) when the device is already clean.

THE MARKER (1.1.0, Mihai, 8 Sep: "leave an indicator that it has run, so if
someone adds a policy later it does not get cleaned again"). The cleanup, once it
verifies the device clean, records that it ran - a registry key
HKLM\SOFTWARE\TUNO\AppLockerCleanup (Generation, RanUtc, ScriptVersion, TunoBuild)
and a file %ProgramData%\IT-TOOLS\LOGS\AppLocker-Cleanup.done. This detection reads
the marker FIRST: when it is there for the current generation, the device is
compliant whatever policy it carries now, because that policy is the new one.
Without the marker, the old rule applies: AppLocker state present = exit 1.

So the pair can stay assigned alongside the new policy. A second cleanup campaign
later is a deliberate act: raise $script:CleanupGeneration in BOTH scripts, and every
device whose marker is from an older generation is cleaned once more.

.NOTES
Version   : 1.1.1
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation detection script, SYSTEM, 64-bit PowerShell.
#>

$script:ScriptVersion = '1.1.1'
$script:TunoBuild = 10609

# Raise this together with the same number in Clear-TunoAppLockerPolicy.ps1 to run a
# new cleanup campaign on devices already marked by an older one.
$script:CleanupGeneration = 1

$ErrorActionPreference = 'SilentlyContinue'
$found = @()

# ── The marker: has the cleanup already run here for this generation? ─────────
$markerKey  = 'HKLM:\SOFTWARE\TUNO\AppLockerCleanup'
$markerFile = Join-Path $env:ProgramData 'IT-TOOLS\LOGS\AppLocker-Cleanup.done'
$markerGen = -1; $markerWhen = ''
try {
    if (Test-Path $markerKey) {
        $m = Get-ItemProperty -Path $markerKey
        $markerGen = [int]$m.Generation; $markerWhen = [string]$m.RanUtc
    }
} catch { }
if ($markerGen -lt 0 -and (Test-Path $markerFile)) {
    try {
        $line = (Get-Content -Path $markerFile -TotalCount 1)
        if ($line -match 'Generation=(\d+)') { $markerGen = [int]$Matches[1] }
        if ($line -match 'RanUtc=(\S+)') { $markerWhen = $Matches[1] }
    } catch { }
}
if ($markerGen -ge $script:CleanupGeneration) {
    Write-Output ("Cleanup generation {0} already ran on this device ({1}); any AppLocker policy present now is the new one and is left alone. Compliant." -f $markerGen, $markerWhen)
    exit 0
}


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

$st = Get-TunoAppLockerState
if ($st.effectiveRules -gt 0) { $found += ("{0} rule(s) in the effective policy [{1}]" -f $st.effectiveRules, ($st.effectiveDetail -join ', ')) }
if ($st.srpRules -gt 0)       { $found += ("{0} rule(s) tattooed under SrpV2 [{1}]" -f $st.srpRules, ($st.srpDetail -join ', ')) }
$context = @()
if ($st.managedInstaller) { $context += 'Managed Installer policy present (Intune, left alone)' }
if ($st.srpPresent -and $st.srpRules -eq 0) { $context += ('SrpV2 key present but carries no legacy rules [{0}]' -f ($st.srpDetail -join ', ')) }
if ($st.cmdletError) { $context += ('effective policy unreadable: ' + $st.cmdletError) }

if ($found.Count -gt 0) {
    Write-Output ("AppLocker state found, no cleanup marker for generation {0}: {1}" -f $script:CleanupGeneration, ($found -join '; '))
    exit 1
}
Write-Output ('No legacy AppLocker policy on this device' + $(if ($context.Count) { ' (' + ($context -join '; ') + ')' } else { '' }))
exit 0
