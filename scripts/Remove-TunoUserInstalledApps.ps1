#Requires -Version 5.1
<#
.SYNOPSIS
An in-shell menu for an administrator to remove apps that users installed into their
own profiles - the installs an enforced AppLocker policy has made the USER unable to
uninstall.

.DESCRIPTION
THE PROBLEM THIS SOLVES. Per-user installs (PowerToys, Teams classic, Zoom, Chrome's
per-user setup, anything that lands in %LOCALAPPDATA%) carry their uninstaller inside
the profile. Once the Exe collection is enforced, that uninstaller is exactly the kind
of file the policy refuses for a standard user - so the app can no longer be removed
by the person who installed it, and it sits there, blocked and un-removable. The
policy's administrator allow rule is what lets an ADMIN run it; this script is the
menu around that fact.

WHAT IT DOES
  1. Inventories every user profile on the device (ProfileList), loading a hive that
     is not in use so logged-off users are covered too, and reads each user's
     HKU\<SID>\Software\Microsoft\Windows\CurrentVersion\Uninstall (both views).
  2. Adds the machine-wide Uninstall entries whose install location or uninstaller
     lives under C:\Users\ - machine-registered but profile-resident.
  3. Shows a numbered menu: user, app, version, publisher, where it lives, how it
     uninstalls. Pick one or more numbers, or a range.
  4. Runs the uninstaller (QuietUninstallString first, then UninstallString; -Quiet
     adds the usual silent flags), elevated, and waits for it. Then checks whether
     the entry is really gone from THAT user's hive.
  5. If the uninstaller is missing, refuses, or is a per-user MSI (msiexec run as
     admin answers 1605 "unknown product" - the product is registered in the user's
     context, not yours), the script offers LEFTOVER REMOVAL: the install folder,
     the uninstall key, and the Start Menu / Desktop shortcuts that point into it.
     Leftover removal is guarded: the folder must sit at least three levels below
     the user's profile and must not be a well-known folder (AppData, Local,
     Roaming, Programs, Desktop, ...), so a bad InstallLocation can never take the
     profile with it.

WHAT IT DOES NOT DO
  * It does not change the AppLocker policy. If the user needs the app, allow it by
    PUBLISHER in T01 (a path rule into a profile is a door); if not, remove it here.
  * It does not touch Store apps - a user can still uninstall those themselves,
    nothing in that path runs from the profile.
  * It does not run uninstallers AS the user. Some per-user uninstallers look in
    HKCU and find the admin's; the leftover removal exists for that case.

NON-INTERACTIVE USE (Live Response has no menu)
  -List                        print the inventory and exit 0
  -Name <pattern> -Force       uninstall every entry whose name matches, no prompt
  -Name <pattern> -Force -Leftovers   ... and clean leftovers when the uninstaller
                                       cannot do it

.PARAMETER Name
Wildcard pattern on the display name, e.g. PowerToys or *Zoom*. With -Force the
matching entries are removed without the menu; without -Force the menu opens
pre-filtered.

.PARAMETER User
Wildcard pattern on the user name, to limit the inventory to one profile.

.PARAMETER List
Print the inventory and exit. Nothing is changed.

.PARAMETER Force
With -Name: uninstall the matches without asking. Never removes leftovers on its own -
add -Leftovers for that.

.PARAMETER Leftovers
When an uninstaller cannot remove the entry, remove the install folder, the uninstall
key and the shortcuts pointing into it. Interactive runs ask per app; -Force runs need
this switch.

.PARAMETER Quiet
Append the usual silent flags to the uninstaller (/S, /quiet, /qn, --uninstall -s ...
chosen by installer type) when there is no QuietUninstallString. Off by default: an
admin at the console can answer the uninstaller's own questions.

.PARAMETER LogFolder
Where the transcript goes. Default %ProgramData%\IT-TOOLS\LOGS.

.EXAMPLE
PS> .\Remove-TunoUserInstalledApps.ps1
Elevated shell, the menu.

.EXAMPLE
PS> .\Remove-TunoUserInstalledApps.ps1 -List

.EXAMPLE
# MDE Live Response
run Remove-TunoUserInstalledApps.ps1 -parameters "-Name PowerToys -Force -Quiet -Leftovers"

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Run as    : a local administrator, elevated. Refuses otherwise - the whole point is
            the administrator allow rule.
Origin    : Mihai, 4 Sep 2026: "because of the enforcement a user cannot uninstall an
            app anymore because it gets blocked, but an admin should be allowed."
Companion : Get-TunoAppLockerPolicyHealth.ps1, Invoke-TunoAppLockerScan.ps1
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Name,
    [string]$User,
    [switch]$List,
    [switch]$Force,
    [switch]$Leftovers,
    [switch]$Quiet,
    [string]$LogFolder = "$env:ProgramData\IT-TOOLS\LOGS"
)

$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10587

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# --- logging ---------------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
try { if (-not (Test-Path -LiteralPath $LogFolder)) { New-Item -Path $LogFolder -ItemType Directory -Force | Out-Null } } catch { $LogFolder = $env:TEMP }
$logPath = Join-Path $LogFolder ("RemoveUserApps_{0}_{1}.log" -f $env:COMPUTERNAME, $stamp)
$script:TranscriptOn = $false
try { Start-Transcript -Path $logPath -Append -ErrorAction Stop | Out-Null; $script:TranscriptOn = $true } catch {}
function Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    switch ($Level) { 'WARN' { Write-Host $line -ForegroundColor Yellow } 'ERROR' { Write-Host $line -ForegroundColor Red } default { Write-Host $line } }
    if (-not $script:TranscriptOn) { try { Add-Content -Path $logPath -Value $line -Encoding UTF8 } catch {} }
}
Log ("Remove-TunoUserInstalledApps v{0} (TUNO build {1}) on {2}, running as {3}." -f $script:ScriptVersion, $script:TunoBuild, $env:COMPUTERNAME, [Security.Principal.WindowsIdentity]::GetCurrent().Name)

# --- elevation -------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Log 'Not elevated. This script exists because only an administrator may run those uninstallers under the enforced policy - start an elevated shell and run it again.' 'ERROR'
    if ($script:TranscriptOn) { Stop-Transcript | Out-Null }
    exit 1
}

# --- helpers ---------------------------------------------------------------------
$script:LoadedHives = New-Object System.Collections.Generic.List[string]
$script:ProtectedLeafNames = @('AppData', 'Local', 'LocalLow', 'Roaming', 'Programs', 'Microsoft', 'Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Temp', 'Packages', 'Windows')

function Get-UserProfiles {
    $out = New-Object System.Collections.Generic.List[object]
    $pl = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList'
    foreach ($k in @(Get-ChildItem -Path $pl -ErrorAction SilentlyContinue)) {
        $sid = $k.PSChildName
        if ($sid -match '^S-1-5-(18|19|20)$') { continue }
        $path = (Get-ItemProperty -Path $k.PSPath -Name ProfileImagePath -ErrorAction SilentlyContinue).ProfileImagePath
        if (-not $path) { continue }
        $path = [Environment]::ExpandEnvironmentVariables($path)
        if (-not (Test-Path -LiteralPath $path -PathType Container)) { continue }
        $name = Split-Path -Leaf $path
        try { $name = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value } catch {}
        $out.Add([pscustomobject]@{ sid = $sid; path = $path; user = $name; loaded = (Test-Path -LiteralPath "Registry::HKEY_USERS\$sid"); temporary = $false })
    }
    return $out.ToArray()
}

function Mount-UserHive {
    param($Profile)
    if ($Profile.loaded) { return $true }
    $dat = Join-Path $Profile.path 'NTUSER.DAT'
    if (-not (Test-Path -LiteralPath $dat)) { return $false }
    $r = & reg.exe load "HKU\$($Profile.sid)" $dat 2>&1
    if ($LASTEXITCODE -eq 0) { $script:LoadedHives.Add($Profile.sid); $Profile.temporary = $true; $Profile.loaded = $true; Log ("  loaded hive for {0} (logged off)" -f $Profile.user); return $true }
    Log ("  could not load the hive for {0}: {1}" -f $Profile.user, ($r -join ' ')) 'WARN'
    return $false
}

function Dismount-UserHives {
    [gc]::Collect(); [gc]::WaitForPendingFinalizers()
    foreach ($sid in @($script:LoadedHives)) {
        $r = & reg.exe unload "HKU\$sid" 2>&1
        if ($LASTEXITCODE -ne 0) { Log ("  hive HKU\{0} did not unload cleanly: {1} - it will unload at next reboot" -f $sid, ($r -join ' ')) 'WARN' }
    }
    $script:LoadedHives.Clear()
}

function Read-UninstallKeys {
    param([string]$Root, $Profile, [string]$Kind)
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($view in @('Software\Microsoft\Windows\CurrentVersion\Uninstall', 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
        $base = "Registry::$Root\$view"
        foreach ($k in @(Get-ChildItem -Path $base -ErrorAction SilentlyContinue)) {
            $p = Get-ItemProperty -Path $k.PSPath -ErrorAction SilentlyContinue
            if (-not $p) { continue }
            $dn = $null; try { $dn = $p.DisplayName } catch {}
            if (-not $dn) { continue }
            $sc = 0; try { $sc = [int]$p.SystemComponent } catch {}
            if ($sc -eq 1) { continue }
            $g = @{}
            foreach ($n in 'UninstallString', 'QuietUninstallString', 'InstallLocation', 'DisplayVersion', 'Publisher', 'DisplayIcon', 'WindowsInstaller') { $v = $null; try { $v = $p.$n } catch {}; $g[$n] = $v }
            $loc = $g.InstallLocation
            if (-not $loc -and $g.DisplayIcon) { $loc = Split-Path -Parent (($g.DisplayIcon -replace ',\s*-?\d+$', '').Trim('"')) }
            if (-not $loc -and $g.UninstallString) { $exe = Get-CommandExe $g.UninstallString; if ($exe) { $loc = Split-Path -Parent $exe } }
            $out.Add([pscustomobject]@{
                user = $Profile.user; sid = $Profile.sid; profile = $Profile.path; kind = $Kind
                name = [string]$dn; version = [string]$g.DisplayVersion; publisher = [string]$g.Publisher
                location = [string]$loc; uninstall = [string]$g.UninstallString; quiet = [string]$g.QuietUninstallString
                msi = ([string]$g.UninstallString -match '(?i)msiexec' -or $g.WindowsInstaller -eq 1)
                key = $k.PSPath
            })
        }
    }
    return $out.ToArray()
}

function Get-CommandExe {
    param([string]$Cmd)
    if (-not $Cmd) { return $null }
    $c = $Cmd.Trim()
    if ($c.StartsWith('"')) { $e = $c.IndexOf('"', 1); if ($e -gt 0) { return $c.Substring(1, $e - 1) } }
    $m = [regex]::Match($c, '^(.+?\.exe)', 'IgnoreCase'); if ($m.Success) { return $m.Groups[1].Value }
    return ($c -split '\s+')[0]
}

function Split-Command {
    param([string]$Cmd)
    $c = $Cmd.Trim()
    if ($c.StartsWith('"')) { $e = $c.IndexOf('"', 1); if ($e -gt 0) { return @($c.Substring(1, $e - 1), $c.Substring($e + 1).Trim()) } }
    $m = [regex]::Match($c, '^(.+?\.exe)\s*(.*)$', 'IgnoreCase'); if ($m.Success) { return @($m.Groups[1].Value, $m.Groups[2].Value) }
    $parts = $c -split '\s+', 2; return @($parts[0], $(if ($parts.Count -gt 1) { $parts[1] } else { '' }))
}

function Get-Inventory {
    Log 'Inventory: per-user Uninstall keys from every profile, plus machine entries that live under C:\Users.'
    $items = New-Object System.Collections.Generic.List[object]
    $profiles = @(Get-UserProfiles)
    if ($User) { $profiles = @($profiles | Where-Object { $_.user -like $User -or (Split-Path -Leaf $_.path) -like $User }) }
    foreach ($pr in $profiles) {
        if (-not (Mount-UserHive $pr)) { Log ("  {0}: hive not readable, skipped" -f $pr.user) 'WARN'; continue }
        foreach ($i in @(Read-UninstallKeys -Root "HKEY_USERS\$($pr.sid)" -Profile $pr -Kind 'per-user')) { $items.Add($i) }
    }
    $usersRoot = (Split-Path -Parent ($profiles | Select-Object -First 1 -ExpandProperty path -ErrorAction SilentlyContinue))
    if (-not $usersRoot) { $usersRoot = Join-Path $env:SystemDrive 'Users' }
    $machine = [pscustomobject]@{ sid = 'HKLM'; path = ''; user = '(machine)'; loaded = $true; temporary = $false }
    foreach ($i in @(Read-UninstallKeys -Root 'HKEY_LOCAL_MACHINE' -Profile $machine -Kind 'machine entry in a profile')) {
        $probe = @($i.location, (Get-CommandExe $i.uninstall)) | Where-Object { $_ }
        $hit = $probe | Where-Object { $_ -like "$usersRoot\*" } | Select-Object -First 1
        if (-not $hit) { continue }
        $owner = $profiles | Where-Object { $hit -like "$($_.path)\*" } | Select-Object -First 1
        if ($owner) { $i.user = $owner.user; $i.sid = $owner.sid; $i.profile = $owner.path } else { $i.user = '(unknown profile)'; $i.profile = $usersRoot }
        $items.Add($i)
    }
    $all = @($items | Sort-Object user, name)
    if ($Name) { $all = @($all | Where-Object { $_.name -like $Name -or $_.name -like "*$Name*" }) }
    return $all
}

function Show-Menu {
    param([object[]]$Items)
    Write-Host ''
    Write-Host ('  {0,3}  {1,-22} {2,-38} {3,-14} {4,-24} {5}' -f '#', 'User', 'App', 'Version', 'Publisher', 'Lives in') -ForegroundColor Cyan
    Write-Host ('  ' + ('-' * 120)) -ForegroundColor DarkGray
    for ($i = 0; $i -lt $Items.Count; $i++) {
        $it = $Items[$i]
        $u = $it.user; if ($u.Length -gt 22) { $u = $u.Substring($u.Length - 22) }
        $n = $it.name; if ($n.Length -gt 38) { $n = $n.Substring(0, 37) + '…' }
        $pub = $it.publisher; if ($pub.Length -gt 24) { $pub = $pub.Substring(0, 23) + '…' }
        $loc = $it.location; if ($it.profile -and $loc -like "$($it.profile)\*") { $loc = '~' + $loc.Substring($it.profile.Length) }
        $tag = ''; if ($it.msi) { $tag = ' [MSI]' } elseif (-not $it.uninstall -and -not $it.quiet) { $tag = ' [no uninstaller]' }
        Write-Host ('  {0,3}  {1,-22} {2,-38} {3,-14} {4,-24} {5}{6}' -f ($i + 1), $u, $n, $it.version, $pub, $loc, $tag)
    }
    Write-Host ''
    Write-Host '  numbers to uninstall (e.g. 2 or 1,3 or 2-5)   l <n> = leftovers only   r = rescan   q = quit' -ForegroundColor DarkGray
}

function Resolve-Selection {
    param([string]$Text, [int]$Max)
    $set = New-Object System.Collections.Generic.List[int]
    foreach ($tok in ($Text -split '[,\s]+' | Where-Object { $_ })) {
        if ($tok -match '^(\d+)-(\d+)$') { $a = [int]$Matches[1]; $b = [int]$Matches[2]; if ($a -gt $b) { $t = $a; $a = $b; $b = $t }; for ($i = $a; $i -le $b; $i++) { if ($i -ge 1 -and $i -le $Max -and -not $set.Contains($i)) { $set.Add($i) } } }
        elseif ($tok -match '^\d+$') { $i = [int]$tok; if ($i -ge 1 -and $i -le $Max -and -not $set.Contains($i)) { $set.Add($i) } }
    }
    return $set.ToArray()
}

function Get-QuietArgs {
    param([string]$Exe, [string]$ExistingArgs)
    $leaf = (Split-Path -Leaf $Exe).ToLowerInvariant()
    if ($ExistingArgs -match '(?i)(/S\b|/silent|/quiet|/qn|/verysilent|--silent|-s\b|--uninstall)') { return $ExistingArgs }
    if ($leaf -eq 'msiexec.exe') { return ("{0} /qn /norestart" -f $ExistingArgs).Trim() }
    if ($leaf -match 'unins\d*\.exe') { return ("{0} /VERYSILENT /NORESTART" -f $ExistingArgs).Trim() }      # Inno Setup
    if ($leaf -match 'uninstall\.exe|uninst\.exe') { return ("{0} /S" -f $ExistingArgs).Trim() }             # NSIS
    if ($ExistingArgs -match '(?i)--uninstall') { return ("{0} -s" -f $ExistingArgs).Trim() }
    return ("{0} /S" -f $ExistingArgs).Trim()
}

function Test-EntryGone {
    param($Item)
    return -not (Test-Path -LiteralPath $Item.key)
}

function Invoke-Uninstall {
    param($Item)
    $cmd = $Item.quiet; if (-not $cmd) { $cmd = $Item.uninstall }
    if (-not $cmd) { Log ("  {0}: no uninstaller registered" -f $Item.name) 'WARN'; return 'no-uninstaller' }
    $exeArgs = Split-Command $cmd
    $exe = $exeArgs[0]; $argLine = $exeArgs[1]
    if ($exe -match '(?i)msiexec') { $exe = Join-Path $env:SystemRoot 'System32\msiexec.exe'; $argLine = $argLine -replace '(?i)/I\{', '/X{' }
    if ($Quiet -and -not $Item.quiet) { $argLine = Get-QuietArgs -Exe $exe -ExistingArgs $argLine }
    if (-not ($exe -match '(?i)msiexec') -and -not (Test-Path -LiteralPath $exe)) { Log ("  {0}: uninstaller not on disk: {1}" -f $Item.name, $exe) 'WARN'; return 'no-uninstaller' }
    if (-not $PSCmdlet.ShouldProcess(("{0} for {1}" -f $Item.name, $Item.user), ("run `"{0}`" {1}" -f $exe, $argLine))) { return 'skipped' }
    Log ("  {0} ({1}): `"{2}`" {3}" -f $Item.name, $Item.user, $exe, $argLine)
    try {
        $p = if ($argLine) { Start-Process -FilePath $exe -ArgumentList $argLine -Wait -PassThru -ErrorAction Stop } else { Start-Process -FilePath $exe -Wait -PassThru -ErrorAction Stop }
        $code = $p.ExitCode
    } catch {
        Log ("  launch failed: {0}" -f $_.Exception.Message) 'ERROR'
        if ($_.Exception.Message -match '(?i)blocked|group policy|not permitted|access is denied') { Log '  That reads like AppLocker refusing the uninstaller for THIS account - the policy has no administrator allow rule, or you are not in the group it names. Check the EXE and DLL log for an 8004 with your name.' 'ERROR' }
        return 'launch-failed'
    }
    if ($code -eq 1605 -and $Item.msi) { Log ("  msiexec: 1605 unknown product - a per-user MSI is registered in {0}'s context, not the administrator's. The leftover removal is the way out." -f $Item.user) 'WARN'; return 'msi-per-user' }
    if ($code -in 0, 1641, 3010, 19) { Log ("  exit {0}" -f $code); if ($code -in 1641, 3010) { Log '  (a reboot is pending)' 'WARN' } }
    else { Log ("  exit {0}" -f $code) 'WARN' }
    Start-Sleep -Milliseconds 800
    if (Test-EntryGone $Item) { Log ("  {0}: uninstall entry is gone from {1}'s hive." -f $Item.name, $Item.user); return 'ok' }
    Log ("  {0}: the uninstall entry is STILL in {1}'s hive after exit {2}." -f $Item.name, $Item.user, $code) 'WARN'
    return 'still-present'
}

function Test-SafeLeftoverFolder {
    param([string]$Folder, [string]$ProfilePath)
    if (-not $Folder -or -not $ProfilePath) { return $false }
    $f = $Folder.TrimEnd('\'); $p = $ProfilePath.TrimEnd('\')
    if (-not ($f -like "$p\*")) { return $false }
    $rel = $f.Substring($p.Length).Trim('\')
    $depth = ($rel -split '\\').Count
    if ($depth -lt 3) { return $false }                                    # ~\AppData\Local is depth 2: never
    if ($script:ProtectedLeafNames -contains (Split-Path -Leaf $f)) { return $false }
    return $true
}

function Remove-Leftovers {
    param($Item)
    $done = $false
    $folder = $Item.location
    if ($folder -and (Test-Path -LiteralPath $folder -PathType Container)) {
        if (Test-SafeLeftoverFolder -Folder $folder -ProfilePath $Item.profile) {
            if ($PSCmdlet.ShouldProcess($folder, 'remove install folder')) {
                try { Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction Stop; Log ("  removed folder {0}" -f $folder); $done = $true }
                catch { Log ("  folder not fully removed ({0}) - a process may still hold a file; close it or reboot and run again" -f $_.Exception.Message) 'WARN' }
            }
        } else { Log ("  NOT removing {0}: it is not at least three levels inside {1}'s profile, or it is a well-known folder. Remove it by hand if you are sure." -f $folder, $Item.user) 'WARN' }
    }
    # shortcuts that point into the folder
    if ($folder -and $Item.profile) {
        $sh = $null; try { $sh = New-Object -ComObject WScript.Shell } catch {}
        $roots = @((Join-Path $Item.profile 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs'), (Join-Path $Item.profile 'Desktop'), (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'), (Join-Path $env:PUBLIC 'Desktop'))
        foreach ($r in $roots) {
            if (-not (Test-Path -LiteralPath $r)) { continue }
            foreach ($lnk in @(Get-ChildItem -LiteralPath $r -Recurse -Filter *.lnk -ErrorAction SilentlyContinue)) {
                $target = $null; if ($sh) { try { $target = $sh.CreateShortcut($lnk.FullName).TargetPath } catch {} }
                if ($target -and $target -like "$($folder.TrimEnd('\'))\*") {
                    if ($PSCmdlet.ShouldProcess($lnk.FullName, 'remove shortcut')) { try { Remove-Item -LiteralPath $lnk.FullName -Force; Log ("  removed shortcut {0}" -f $lnk.FullName) } catch {} }
                }
            }
        }
    }
    if (Test-Path -LiteralPath $Item.key) {
        if ($PSCmdlet.ShouldProcess($Item.key, 'remove uninstall key')) {
            try { Remove-Item -Path $Item.key -Recurse -Force -ErrorAction Stop; Log ("  removed uninstall key for {0}" -f $Item.name); $done = $true }
            catch { Log ("  uninstall key not removed: {0}" -f $_.Exception.Message) 'WARN' }
        }
    }
    return $done
}

function Confirm-Yes {
    param([string]$Prompt)
    $a = Read-Host ("  {0} [y/N]" -f $Prompt)
    return ($a -match '^(y|yes|j|ja)$')
}

function Invoke-Removal {
    param($Item, [bool]$AskLeftovers)
    Log ("--- {0}  for {1}  ({2})" -f $Item.name, $Item.user, $Item.kind)
    $r = Invoke-Uninstall $Item
    if ($r -in 'ok', 'skipped', 'launch-failed') { return $r }
    $doLeft = $Leftovers
    if (-not $doLeft -and $AskLeftovers) {
        $why = switch ($r) { 'no-uninstaller' { 'there is no uninstaller to run' } 'msi-per-user' { 'the per-user MSI cannot be removed from the administrator context' } default { 'the uninstaller left the entry behind' } }
        $doLeft = Confirm-Yes ("{0} - remove the install folder, the uninstall key and its shortcuts instead?" -f $why)
    }
    if ($doLeft) { if (Remove-Leftovers $Item) { return 'leftovers-removed' } else { return 'leftovers-failed' } }
    return $r
}

# --- MAIN ------------------------------------------------------------------------
$exit = 0
try {
    $items = @(Get-Inventory)
    if ($items.Count -eq 0) {
        Log ("Nothing found{0}{1}." -f $(if ($Name) { " matching '$Name'" } else { '' }), $(if ($User) { " for user '$User'" } else { '' }))
    }
    elseif ($List) {
        Show-Menu $items
        foreach ($it in $items) { Log ("  {0} | {1} | {2} | {3} | {4} | {5}" -f $it.user, $it.name, $it.version, $it.kind, $it.location, $(if ($it.quiet) { $it.quiet } else { $it.uninstall })) }
    }
    elseif ($Force) {
        if (-not $Name) { Log '-Force needs -Name: removing every per-user app on a device unasked is not a thing this script does.' 'ERROR'; $exit = 2 }
        else {
            Log ("Non-interactive: {0} entr{1} match '{2}'." -f $items.Count, $(if ($items.Count -eq 1) { 'y' } else { 'ies' }), $Name)
            $results = @{}
            foreach ($it in $items) { $results[$it.name + '|' + $it.user] = Invoke-Removal -Item $it -AskLeftovers:$false }
            $bad = @($results.GetEnumerator() | Where-Object { $_.Value -notin 'ok', 'leftovers-removed' })
            if ($bad.Count) { foreach ($b in $bad) { Log ("  {0}: {1}" -f $b.Key, $b.Value) 'WARN' }; $exit = 1 }
        }
    }
    else {
        while ($true) {
            Show-Menu $items
            $ans = (Read-Host '  >').Trim()
            if ($ans -match '^(q|quit|exit)$') { break }
            if ($ans -match '^(r|rescan)$') { Dismount-UserHives; $items = @(Get-Inventory); if ($items.Count -eq 0) { Log 'Nothing left.'; break }; continue }
            if ($ans -match '^l\s*(.+)$') {
                foreach ($n in (Resolve-Selection -Text $Matches[1] -Max $items.Count)) {
                    $it = $items[$n - 1]
                    Log ("--- leftovers only: {0} for {1}" -f $it.name, $it.user)
                    if (Confirm-Yes ("remove folder {0}, the uninstall key and shortcuts?" -f $it.location)) { Remove-Leftovers $it | Out-Null }
                }
                Dismount-UserHives; $items = @(Get-Inventory); if ($items.Count -eq 0) { Log 'Nothing left.'; break }; continue
            }
            $sel = Resolve-Selection -Text $ans -Max $items.Count
            if ($sel.Count -eq 0) { Write-Host '  (nothing selected)' -ForegroundColor DarkGray; continue }
            foreach ($n in $sel) { Write-Host ('    {0}  ({1})' -f $items[$n - 1].name, $items[$n - 1].user) }
            if (-not (Confirm-Yes ("uninstall {0} app{1}?" -f $sel.Count, $(if ($sel.Count -eq 1) { '' } else { 's' })))) { continue }
            foreach ($n in $sel) { Invoke-Removal -Item $items[$n - 1] -AskLeftovers:$true | Out-Null }
            Dismount-UserHives
            $items = @(Get-Inventory)
            if ($items.Count -eq 0) { Log 'Nothing left.'; break }
        }
    }
}
catch {
    Log ("Unexpected: {0}" -f $_.Exception.Message) 'ERROR'
    $exit = 1
}
finally {
    Dismount-UserHives
    Log ("Log: {0}" -f $logPath)
    if ($script:TranscriptOn) { try { Stop-Transcript | Out-Null } catch {} }
}
exit $exit
