#Requires -Version 5.1
<#
.SYNOPSIS
AppLocker POLICY health check: did policy delivery, conversion and application
succeed on this device? Read-only. Built for MDE Live Response or a manual run.

.DESCRIPTION
Answers "the policy is delivered but does not seem effective - why?" from five
places, and says which of them can lie:

  1. AppLocker logs (all four) - Event 8000 = AppID policy CONVERSION FAILED (the
     delivered XML was rejected; the event names the failing element), Event 8001 =
     policy applied successfully. NOTE: both land in the EXE and DLL log, which a
     Dll AuditOnly collection floods with 8003s until it rolls over within hours at
     the default 1 MB. The script reads the log's oldest event and says when the
     window is shorter than -DaysBack, so "0 x 8001" is never taken as "never
     applied" on its own.
  2. DeviceManagement-Enterprise-Diagnostics-Provider/Admin - AppLocker CSP
     delivery results (errors mean the OMA-URI payload was rejected at delivery).
  3. Services - AppIDSvc and AppLockerFltr (policies are not processed without
     AppID; it is trigger-start, so Stopped with recent 8001s is fine).
  4. MDM store inventory - every Policy file under
     %SystemRoot%\System32\AppLocker\MDM\<enrollment>\<grouping>\<collection>, with
     size and write time, plus the compiled *.AppLocker cache files.
  5. Effective policy - from Get-AppLockerPolicy -Effective (local + Group Policy
     ONLY - it does not include what the CSP delivered) AND from the MDM store,
     summarised side by side, so an Intune-delivered Script collection with 14
     rules is never reported as "Script: no rules" again.
  6. Behavioural evidence - the newest 8002/8003/8004/8005/8006/8007 per collection
     AFTER the MDM store's latest write: a block or an allow after the write is the
     policy running; nothing after the write means nothing has run yet, not that
     the policy failed.

Output: LOG (transcript, human-readable verdict) + CSV (events 8000/8001 + CSP
events). Retrieve with Live Response getfile.

.PARAMETER DaysBack
Days of event history to scan (default 14).

.PARAMETER MaxEvents
Cap on events read per log (default 2000).

.PARAMETER OutputDir
Output folder (default C:\ProgramData\IT-TOOLS\LOGS).

.EXAMPLE
PS> .\Get-TunoAppLockerPolicyHealth.ps1 -DaysBack 7

.EXAMPLE
# MDE Live Response
run Get-TunoAppLockerPolicyHealth.ps1
getfile "C:\ProgramData\IT-TOOLS\LOGS\AppLockerPolicyHealth_<host>_<stamp>.log"

.NOTES
Version   : 1.1.1
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Run as    : SYSTEM (Live Response) or a local administrator. No changes are made.
Origin    : Mihai's Get-AppLockerPolicyHealth.ps1 (3 Sep 2026), taken into the house
            at build 10583 with the MDM-store effective summary, the log-window
            check and the behavioural evidence added - its first run had reported
            "AppID never processed it" on a device that was blocking scripts.
Companion : Invoke-TunoAppLockerScan.ps1 (the bundle), Get-TunoAppControlEvents.ps1
            (block/audit harvest), Clear-TunoAppLockerPolicy.ps1 (cleanup).
#>

[CmdletBinding()]
param(
    [int]$DaysBack = 14,
    [int]$MaxEvents = 2000,
    [string]$OutputDir = "$env:ProgramData\IT-TOOLS\LOGS"
)

$script:ScriptVersion = '1.1.1'
$script:TunoBuild = 10587

$ErrorActionPreference = 'SilentlyContinue'

$stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not (Test-Path $OutputDir)) { New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null }
$csvPath   = Join-Path $OutputDir ("AppLockerPolicyHealth_{0}_{1}.csv" -f $env:COMPUTERNAME, $stamp)
$logPath   = Join-Path $OutputDir ("AppLockerPolicyHealth_{0}_{1}.log" -f $env:COMPUTERNAME, $stamp)
$startTime = (Get-Date).AddDays(-1 * [math]::Abs($DaysBack))

$script:TranscriptOn = $false
try { Start-Transcript -Path $logPath -Append -ErrorAction Stop | Out-Null; $script:TranscriptOn = $true } catch {}
function Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Output $line
    if (-not $script:TranscriptOn) { try { Add-Content -Path $logPath -Value $line -Encoding UTF8 } catch {} }
}
Log ("Get-TunoAppLockerPolicyHealth v{0} (TUNO build {1}) starting on {2} (window: last {3} day(s))." -f $script:ScriptVersion, $script:TunoBuild, $env:COMPUTERNAME, $DaysBack)

$rows = New-Object System.Collections.Generic.List[object]

# --- 1) AppLocker policy events: 8000 (conversion FAILED) / 8001 (applied OK) ----
$alLogs = @(
    'Microsoft-Windows-AppLocker/EXE and DLL',
    'Microsoft-Windows-AppLocker/MSI and Script',
    'Microsoft-Windows-AppLocker/Packaged app-Execution',
    'Microsoft-Windows-AppLocker/Packaged app-Deployment'
)
$nFail = 0; $nOk = 0; $lastFail = $null; $lastOk = $null
foreach ($ln in $alLogs) {
    $evts = Get-WinEvent -FilterHashtable @{ LogName = $ln; Id = @(8000, 8001); StartTime = $startTime } -MaxEvents $MaxEvents -ErrorAction SilentlyContinue
    foreach ($e in @($evts)) {
        $isFail = ([int]$e.Id -eq 8000)
        if ($isFail) { $nFail++; if (-not $lastFail -or $e.TimeCreated -gt $lastFail.TimeCreated) { $lastFail = $e } }
        else         { $nOk++;   if (-not $lastOk   -or $e.TimeCreated -gt $lastOk.TimeCreated)   { $lastOk   = $e } }
        $rows.Add([pscustomobject]@{
            Time = $e.TimeCreated; Source = 'AppLocker'; Log = $ln; EventId = [int]$e.Id
            Level = if ($isFail) { 'ERROR' } else { 'INFO' }
            Message = ($e.Message -replace '\s+', ' ')
            Computer = $env:COMPUTERNAME; RecordId = $e.RecordId
        }) | Out-Null
    }
}
Log ("AppLocker policy events (last {0}d): 8001 applied-OK = {1}, 8000 conversion-FAILED = {2}" -f $DaysBack, $nOk, $nFail) ($(if ($nFail -gt 0) { 'WARN' } else { 'INFO' }))
if ($lastFail) {
    Log ("LAST 8000 (conversion failed) at {0}:" -f $lastFail.TimeCreated) 'ERROR'
    Log ("  {0}" -f ($lastFail.Message -replace '\s+', ' ')) 'ERROR'
}
if ($lastOk) { Log ("Last 8001 (applied OK) at {0} in '{1}'." -f $lastOk.TimeCreated, $lastOk.LogName) }

# THE LOG WINDOW. 8000/8001 live in the EXE and DLL log; a Dll AuditOnly
# collection (the Managed Installer merge leaves one behind) writes a
# thousand 8003s a day into it, and at the default 1 MB it rolls in hours.
# An empty count is meaningless unless the log actually reaches back as far
# as the window asked for - so read its oldest record and say so.
$logShort = $false
foreach ($ln in $alLogs) {
    $oldest = Get-WinEvent -LogName $ln -Oldest -MaxEvents 1 -ErrorAction SilentlyContinue
    $cfg = Get-WinEvent -ListLog $ln -ErrorAction SilentlyContinue
    if ($oldest) {
        $ageH = [math]::Round(((Get-Date) - $oldest.TimeCreated).TotalHours, 1)
        $short = $oldest.TimeCreated -gt $startTime
        if ($short -and $ln -like '*EXE and DLL*') { $logShort = $true }
        Log ("  log '{0}' reaches back to {1} ({2} h){3}; max size {4} KB" -f $ln, $oldest.TimeCreated, $ageH, $(if ($short) { " - SHORTER THAN THE WINDOW, it has rolled over" } else { '' }), $(if ($cfg) { [int]($cfg.MaximumSizeInBytes / 1KB) } else { '?' })) ($(if ($short) { 'WARN' } else { 'INFO' }))
    }
}

# --- 2) MDM/Intune CSP delivery events -------------------------------------------
$mdmLog = 'Microsoft-Windows-DeviceManagement-Enterprise-Diagnostics-Provider/Admin'
$cspEvts = @(Get-WinEvent -FilterHashtable @{ LogName = $mdmLog; StartTime = $startTime } -MaxEvents $MaxEvents -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'AppLocker|ApplicationLaunchRestrictions' })
$cspErr = @($cspEvts | Where-Object { $_.Level -le 3 -and $_.Level -ge 1 -and $_.LevelDisplayName -match 'Error|Warning' })
Log ("MDM CSP events mentioning AppLocker (last {0}d): {1} total, {2} error/warning." -f $DaysBack, $cspEvts.Count, $cspErr.Count) ($(if ($cspErr.Count -gt 0) { 'WARN' } else { 'INFO' }))
foreach ($e in ($cspErr | Sort-Object TimeCreated -Descending | Select-Object -First 10)) {
    Log ("  [{0}] {1}: {2}" -f $e.LevelDisplayName, $e.TimeCreated, (($e.Message -replace '\s+', ' ').Substring(0, [math]::Min(300, $e.Message.Length)))) 'WARN'
}
foreach ($e in $cspEvts) {
    $rows.Add([pscustomobject]@{
        Time = $e.TimeCreated; Source = 'MDM-CSP'; Log = $mdmLog; EventId = [int]$e.Id
        Level = $e.LevelDisplayName
        Message = ($e.Message -replace '\s+', ' ')
        Computer = $env:COMPUTERNAME; RecordId = $e.RecordId
    }) | Out-Null
}

# --- 3) Services -------------------------------------------------------------------
foreach ($svcName in 'AppIDSvc', 'AppLockerFltr') {
    $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if ($svc) {
        $lvl = if ($svc.Status -eq 'Running') { 'INFO' } else { 'WARN' }
        Log ("Service {0}: {1} (start type: {2})" -f $svcName, $svc.Status, $svc.StartType) $lvl
    }
    else { Log ("Service {0}: not present." -f $svcName) 'WARN' }
}
Log "  (AppIDSvc is trigger-start; 'Stopped' with recent 8001 events is fine. 'Stopped' + policy never effective = kick it with: appidtel start)"

function ConvertFrom-MdmPolicyBytes {
    <#
      Decode one MDM store Policy file. The CSP writes the policy string as the
      OMA-URI value arrived; on the 4 Sep health log every collection came back
      "mode=? rules=?" because a plain ReadAllText + [xml] cast did not survive
      whatever the on-disk shape is. So: sniff the BOM, then UTF-16 by the NUL
      pattern, strip stray NULs, cut to the first '<', parse - and when even that
      fails, count the rule elements and the EnforcementMode by regex and say
      exactly what was seen (first bytes as hex) so the next log settles it.
    #>
    param([string]$Path)
    $r = [pscustomobject]@{ text = $null; xml = $null; mode = '?'; rules = '?'; type = ''; encoding = '?'; parsed = $false; error = ''; head = '' }
    $bytes = $null
    try { $bytes = [System.IO.File]::ReadAllBytes($Path) } catch { $r.error = $_.Exception.Message; return $r }
    if (-not $bytes -or $bytes.Length -eq 0) { $r.error = 'empty file'; return $r }
    $r.head = (($bytes | Select-Object -First 16 | ForEach-Object { $_.ToString('x2') }) -join ' ')
    $enc = $null
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $enc = [System.Text.Encoding]::UTF8; $r.encoding = 'utf-8 bom' }
    elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $enc = [System.Text.Encoding]::Unicode; $r.encoding = 'utf-16le bom' }
    elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { $enc = [System.Text.Encoding]::BigEndianUnicode; $r.encoding = 'utf-16be bom' }
    else {
        $n = [Math]::Min($bytes.Length, 256); $oddNul = 0; $evenNul = 0
        for ($i = 0; $i -lt $n; $i++) { if ($bytes[$i] -eq 0) { if ($i % 2 -eq 1) { $oddNul++ } else { $evenNul++ } } }
        if ($oddNul -gt ($n / 4)) { $enc = [System.Text.Encoding]::Unicode; $r.encoding = 'utf-16le (sniffed)' }
        elseif ($evenNul -gt ($n / 4)) { $enc = [System.Text.Encoding]::BigEndianUnicode; $r.encoding = 'utf-16be (sniffed)' }
        else { $enc = New-Object System.Text.UTF8Encoding($false); $r.encoding = 'utf-8' }
    }
    $text = $enc.GetString($bytes)
    $text = $text -replace "`0", ''
    $lt = $text.IndexOf('<')
    if ($lt -lt 0) { $r.error = 'no XML start tag in decoded text'; return $r }
    $text = $text.Substring($lt).Trim([char]0xFEFF, ' ', "`r", "`n", "`t")
    $r.text = $text
    try {
        $doc = New-Object System.Xml.XmlDocument
        $doc.LoadXml($text)
        $rc = $doc.DocumentElement
        if ($rc -and $rc.LocalName -eq 'AppLockerPolicy') { $rc = $rc.SelectSingleNode('RuleCollection') }
        if ($rc -and $rc.LocalName -eq 'RuleCollection') {
            $r.xml = $rc; $r.parsed = $true
            $r.mode = $rc.GetAttribute('EnforcementMode'); $r.type = $rc.GetAttribute('Type')
            $r.rules = @($rc.ChildNodes | Where-Object { $_.NodeType -eq 'Element' }).Count
            return $r
        }
        $r.error = ('root element is <{0}>, not RuleCollection' -f $(if ($doc.DocumentElement) { $doc.DocumentElement.LocalName } else { '' }))
    } catch { $r.error = 'XML parse: ' + $_.Exception.Message }
    # regex fallback - good enough for mode and a rule count
    $m = [regex]::Match($text, 'EnforcementMode\s*=\s*"([^"]+)"'); if ($m.Success) { $r.mode = $m.Groups[1].Value }
    $m = [regex]::Match($text, '<RuleCollection[^>]*\sType\s*=\s*"([^"]+)"'); if ($m.Success) { $r.type = $m.Groups[1].Value }
    $r.rules = [regex]::Matches($text, '<(FilePublisherRule|FilePathRule|FileHashRule)\b').Count
    return $r
}

# --- 4) MDM store + compiled cache inventory ----------------------------------------
$mdmDir = Join-Path $env:SystemRoot 'System32\AppLocker\MDM'
$mdmCols = New-Object System.Collections.Generic.List[object]
$mdmLatest = $null
if (Test-Path $mdmDir) {
    Log "MDM store inventory ($mdmDir):"
    $policyFiles = @(Get-ChildItem -Path $mdmDir -Recurse -File -Filter 'Policy' -ErrorAction SilentlyContinue)
    if ($policyFiles.Count -eq 0) { Log '  (no Policy files found)' 'WARN' }
    foreach ($p in $policyFiles) {
        $collection = Split-Path -Leaf $p.DirectoryName
        $grouping   = Split-Path -Leaf (Split-Path -Parent $p.DirectoryName)
        if (-not $mdmLatest -or $p.LastWriteTime -gt $mdmLatest) { $mdmLatest = $p.LastWriteTime }
        $dec = ConvertFrom-MdmPolicyBytes -Path $p.FullName
        $mode = $dec.mode; $cnt = $dec.rules
        if (-not $dec.parsed) { Log ("    ({0}: {1}; encoding {2}; first bytes {3}){4}" -f $p.FullName, $dec.error, $dec.encoding, $dec.head, $(if ($dec.rules -ne '?') { ' - mode/rules above come from a text match' } else { '' })) 'WARN' }
        $mdmCols.Add([pscustomobject]@{ grouping = $grouping; collection = $collection; mode = $mode; rules = $cnt; written = $p.LastWriteTime })
        Log ("  grouping '{0}'  collection '{1,-9}'  mode={2,-13} rules={3,-4} {4} bytes  written {5}" -f $grouping, $collection, $mode, $cnt, $p.Length, $p.LastWriteTime)
    }
}
else { Log "MDM store folder not present (no Intune AppLocker CSP policy delivered)." }

$cacheFiles = @(Get-ChildItem -Path (Join-Path $env:SystemRoot 'System32\AppLocker') -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '\.AppLocker$|^AppCache\.dat$' })
if ($cacheFiles.Count -gt 0) {
    Log 'Compiled policy cache (System32\AppLocker):'
    foreach ($c in $cacheFiles) { Log ("  {0,-30} {1,8} bytes  modified {2}" -f $c.Name, $c.Length, $c.LastWriteTime) }
    Log '  (these are the compiled LOCAL/GPO collections; an old date here does not by itself say the MDM policy was not consumed - see the behavioural evidence below)'
}
else { Log 'No compiled *.AppLocker cache files - AppID has not processed a local/GPO policy.' 'WARN' }

# --- 5) Effective policy summary: the cmdlet AND the MDM store, side by side ----------
# Get-AppLockerPolicy -Effective merges local and Group Policy. It does NOT
# include the policy the AppLocker CSP delivered from Intune, which the
# Application Identity service enforces from the MDM store. Reporting the
# cmdlet alone is how a device with a 14-rule Script collection deployed read
# as "Script: no rules" (3 Sep 2026).
$effTypes = @{}
try {
    [xml]$eff = Get-AppLockerPolicy -Effective -Xml -ErrorAction Stop
    Log 'Effective policy per Get-AppLockerPolicy -Effective (local + Group Policy ONLY - Intune/CSP policy is NOT in this list):'
    foreach ($rc in @($eff.AppLockerPolicy.RuleCollection)) {
        $cnt = @($rc.ChildNodes | Where-Object { $_.NodeType -eq 'Element' }).Count
        $effTypes[$rc.Type] = $cnt
        Log ("  {0,-18} mode={1,-14} rules={2}" -f $rc.Type, $rc.EnforcementMode, $cnt)
    }
}
catch { Log "Could not read the local/GPO effective policy: $($_.Exception.Message)" 'WARN' }
if ($mdmCols.Count) {
    Log 'Intune-delivered policy per the MDM store (what the CSP delivered and AppID enforces from there):'
    foreach ($c in $mdmCols) { Log ("  {0,-18} mode={1,-14} rules={2}  (grouping {3})" -f $c.collection, $c.mode, $c.rules, $c.grouping) }
}

# --- 6) Behavioural evidence: what AppLocker did AFTER the last MDM write ---------------
# A block (8004/8007/8022) or an allow (8002/8005/8020) later than the MDM
# store's newest write is the delivered policy RUNNING - the only proof that
# does not depend on a log window or a cache timestamp.
$since = if ($mdmLatest) { $mdmLatest } else { $startTime }
$behav = @{ 'EXE and DLL' = @(8002, 8003, 8004); 'MSI and Script' = @(8005, 8006, 8007); 'Packaged app-Execution' = @(8020, 8021, 8022) }
$seenAfter = 0
Log ("Behavioural evidence since {0} ({1}):" -f $since, $(if ($mdmLatest) { 'the newest MDM store write' } else { 'the window start - no MDM store' }))
foreach ($k in $behav.Keys) {
    $ln = "Microsoft-Windows-AppLocker/$k"
    $ev = @(Get-WinEvent -FilterHashtable @{ LogName = $ln; Id = $behav[$k]; StartTime = $since } -MaxEvents 500 -ErrorAction SilentlyContinue)
    if (-not $ev.Count) { Log ("  {0,-24} nothing ran under AppLocker since then" -f $k); continue }
    $seenAfter += $ev.Count
    $byId = $ev | Group-Object Id | ForEach-Object { "{0} x{1}" -f $_.Name, $_.Count }
    $newest = $ev | Sort-Object TimeCreated -Descending | Select-Object -First 1
    Log ("  {0,-24} {1}  newest {2}: {3}" -f $k, ($byId -join ', '), $newest.TimeCreated, (($newest.Message -replace '\s+', ' ').Substring(0, [math]::Min(140, $newest.Message.Length))))
}

# --- CSV + verdict ---------------------------------------------------------------------
$csvCols = 'Time', 'Computer', 'Source', 'Log', 'EventId', 'Level', 'Message', 'RecordId'
if ($rows.Count -gt 0) { $rows | Sort-Object Time -Descending | Select-Object $csvCols | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8 }
else { ('"' + ($csvCols -join '","') + '"') | Out-File -FilePath $csvPath -Encoding UTF8 }

Log '==================================================================='
if     ($nFail -gt 0)                          { Log 'VERDICT: policy XML is being REJECTED (event 8000). Fix the element named in the 8000 message and redeploy - clearing/re-applying the same XML will fail again.' 'ERROR' }
elseif ($cspErr.Count -gt 0)                   { Log 'VERDICT: CSP delivery errors - the OMA-URI payload is rejected before reaching AppLocker. See MDM-CSP rows in the CSV.' 'WARN' }
elseif ($mdmCols.Count -and $seenAfter -gt 0)  { Log ("VERDICT: the Intune-delivered policy is RUNNING - {0} AppLocker decision(s) logged after the MDM store's newest write ({1}). If a collection still reads 'no rules', that was Get-AppLockerPolicy -Effective, which does not see CSP policy; the MDM store list above is the truth." -f $seenAfter, $mdmLatest) }
elseif ($mdmCols.Count -and $logShort)         { Log 'VERDICT: policy delivered to the MDM store; no 8001 in the window, but the EXE and DLL log has ROLLED OVER inside it (a Dll AuditOnly collection floods it), so that count proves nothing. Nothing has run under AppLocker since the newest write either - run something a standard user would run and re-run this script, or raise the log size (20-50 MB) so applied-events survive.' 'WARN' }
elseif ($nOk -eq 0 -and $mdmCols.Count)        { Log 'VERDICT: policy delivered to the MDM store, no 8001/8000 in a log window that does reach back far enough, and nothing has run under AppLocker since the write. AppID may not have processed it: run appidtel start, reboot, and re-run this script.' 'WARN' }
else                                           { Log 'VERDICT: no policy-application failures observed in the window. If rules are still missing from the effective policy, read the MDM store list above before widening -DaysBack.' }
Log ' Retrieve from Live Response with:'
Log ("   getfile `"$csvPath`"")
Log ("   getfile `"$logPath`"")
Log '==================================================================='
if ($script:TranscriptOn) { try { Stop-Transcript | Out-Null } catch {} }
