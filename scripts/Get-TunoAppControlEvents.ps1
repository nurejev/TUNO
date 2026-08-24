#Requires -Version 5.1
<#
.SYNOPSIS
Remediation half of the App Control events collection pair: harvests CodeIntegrity and
AppLocker events from a device into CSV/XML exports, an HTML report, and a JSON events
bundle T01 can analyze. Built for Intune Remediations; runs standalone too.

.DESCRIPTION
THE PROBLEM THIS SOLVES. An AppLocker audit is only as good as the events it is judged
on, and those events live on the endpoints - thousands of them. This script is the
evidence pump: paired with Detect-TunoAppControlEvents.ps1 (which always reports
non-compliant, on purpose - the "remediation" IS the collection), it runs on every
device in the assigned ring on the schedule you give it and leaves three artefacts
behind, each for a different consumer:

    CSV/XML per event ID     %ProgramData%\Microsoft\IntuneManagementExtension\Logs\EventLogs
                             - for a human digging into one device
    HTML report (*.log)      %ProgramData%\Microsoft\IntuneManagementExtension\Logs
                             - named .log DELIBERATELY: Intune device diagnostics
                               ("Collect diagnostics") gathers *.log from that folder,
                               so the report rides home on a built-in mechanism
    JSON events bundle (*.log) same folder, same trick - and this one is for T01:
                             upload it to the AppLocker builder & validator and the
                             tool matches every blocked/audited event against the
                             policy draft on screen and says what to do about it

Retrieval: Intune "Collect diagnostics" on the device, or MDE Live Response with the
companion Compress-TunoAppControlReport.ps1, or just copy the files off the device.

WHAT IT COLLECTS

  CodeIntegrity (Microsoft-Windows-CodeIntegrity/Operational): the WDAC/App Control
  for Business side - audit 3076, block 3077, and the wider set of policy events.
  Exported and counted; the JSON bundle carries counts per event ID.

  AppLocker (all four logs): allowed 8002/8005/8020/8023, audited-would-block
  8003/8006/8021/8024, blocked 8004/8007/8022/8025, plus the script-host events
  8028/8029/8036-8040. The JSON bundle carries these in FULL, in the same entry
  shape the T01 scan bundle uses - path, publisher (from the Fqbn), hash, user -
  parsed from each event's UserData XML, not from the localised message text.

FIXES OVER THE SCRIPT THIS REPLACES (Remedate_ACB.ps1 v3.9), each found in review:

  * The 'MSI and Script' log was queried WITHOUT event IDs 8005 and 8007 - so an
    ENFORCED policy blocking an MSI or script produced evidence this collector
    threw away. 8005/8006/8007 are now collected, and Packaged app-Deployment
    (8023-8025) is no longer queried for Execution's IDs (8020-8022) and vice versa.
  * $ErrorActionPreference = 'SilentlyContinue' was set globally, which made every
    try/catch downstream dead code - a broken query logged nothing. Errors are now
    caught per query, and "no events found" is recognised by error ID rather than
    by message text, which is localised.
  * The CodeIntegrity query passed 48 event IDs in one FilterHashtable. Windows
    builds that into an XPath query with a hard limit of ~23 comparisons, so on
    many machines the query threw - and the global SilentlyContinue swallowed it,
    reporting zero CodeIntegrity events as if the log were clean. IDs are now
    queried in chunks the filter can hold.

.PARAMETER DaysBack
How far back to read, in days. Default 30 - matches the audit cadence.

.PARAMETER MaxEvents
Safety cap per provider on events read. Default 5000. When the cap is hit the outputs
say so - a capped count is a floor, not a total.

.PARAMETER LogFolder
Where this script's own log goes. Default %ProgramData%\IT-TOOLS\LOGS - the house
convention for everything IT writes on an endpoint.

.PARAMETER SkipHtmlReport
Skip the HTML report. The CSV/XML exports and the JSON bundle are still written.

.NOTES
Version   : 1.0.2
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Deploy as : Intune Remediation (pair with Detect-TunoAppControlEvents.ps1), run as
            SYSTEM, 64-bit PowerShell. Runs standalone in an elevated shell too.
Replaces  : Remedate_ACB.ps1 v3.9 (Michael Frank / michaelsendpoint.com, adapted by
            Mihai Monte / CloudFellows.dev) - same intent, three defects fixed (see
            the DESCRIPTION) and the JSON bundle added for T01 analysis.
Reads only: this script queries event logs and writes reports. It changes no policy,
            no service, no setting.
#>

[CmdletBinding()]
param(
    [ValidateRange(1, 365)]
    [int]$DaysBack = 30,

    [ValidateRange(100, 100000)]
    [int]$MaxEvents = 5000,

    [string]$LogFolder = "$env:ProgramData\IT-TOOLS\LOGS",

    [switch]$SkipHtmlReport
)

# Two numbers, same discipline as every house script: ScriptVersion is this file's
# own history, TunoBuild the site build that served it. Held to js/version.js by
# the guard in _to_delete/check-script-versions.js.
$script:ScriptVersion = '1.0.2'
$script:TunoBuild = 10405

$ErrorActionPreference = 'Stop'

$Stamp          = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile        = Join-Path $LogFolder 'AppControlEvents-Collect.log'
$ImeLogs        = "$env:ProgramData\Microsoft\IntuneManagementExtension\Logs"
$EventLogFolder = Join-Path $ImeLogs 'EventLogs'

foreach ($f in @($LogFolder, $EventLogFolder)) {
    if (-not (Test-Path $f)) { New-Item -Path $f -ItemType Directory -Force | Out-Null }
}

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line -Force
    Write-Verbose $line
}

function ConvertTo-HtmlSafe {
    param([object]$Text)
    if ($null -eq $Text) { return '' }
    ([string]$Text).Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

# Crash reporter - the scan's lesson applied from day one here too: an
# unhandled throw surfaces to the caller as one useless line ("Argument types
# do not match", position 1,1). This names the LINE and the first stack frame,
# in the log and on the console, so the next defect diagnoses itself.
trap {
    $failLine  = $_.InvocationInfo.ScriptLineNumber
    $failFrame = (($_.ScriptStackTrace -split "`n" | Select-Object -First 1) -replace '\s+', ' ')
    $failMsg   = "FATAL at line ${failLine}: $($_.Exception.Message) [$failFrame]"
    try { Write-Log $failMsg } catch { }
    Write-Output $failMsg
    exit 1
}

Write-Log "========== TUNO App Control events collection v$script:ScriptVersion (build $script:TunoBuild) =========="
Write-Log "Computer: $env:COMPUTERNAME  User: $env:USERNAME  Window: last $DaysBack day(s), cap $MaxEvents per provider"

$Since    = (Get-Date).AddDays(-$DaysBack)
$Warnings = New-Object System.Collections.Generic.List[string]
function Add-CollectWarning { param([string]$m) $Warnings.Add($m); Write-Log "WARN: $m" }

# ── Event ID maps ────────────────────────────────────────────────────────────
# AppLocker: per log, exactly the IDs that log emits - and every verdict ID.
# 8005/8006/8007 for MSI and Script were the gap in the replaced script: the
# ENFORCED-block evidence (8007) was never collected.
#
# AN ARRAY, NOT [ordered]. PowerShell 5.1's dynamic binder mis-compiles indexed
# access on OrderedDictionary ("Argument types do not match" from deep inside
# Expression.Condition) - it crashed the scan script twice and this script's
# 1.0.0 once. The house rule after the third strike: no [ordered] anywhere on a
# path that runs on endpoints. An array of objects keeps the reading order and
# has nothing to mis-bind.
$AppLockerLogs = @(
    [pscustomobject]@{ Log = 'Microsoft-Windows-AppLocker/EXE and DLL';             Ids = @(8002, 8003, 8004) }
    [pscustomobject]@{ Log = 'Microsoft-Windows-AppLocker/MSI and Script';          Ids = @(8005, 8006, 8007, 8028, 8029, 8036, 8037, 8038, 8039, 8040) }
    [pscustomobject]@{ Log = 'Microsoft-Windows-AppLocker/Packaged app-Execution';  Ids = @(8020, 8021, 8022) }
    [pscustomobject]@{ Log = 'Microsoft-Windows-AppLocker/Packaged app-Deployment'; Ids = @(8023, 8024, 8025) }
)
# Verdicts, same table the T01 scan uses - allowed / audited-would-block / blocked.
$Verdict = @{
    8002 = 'Allowed'; 8005 = 'Allowed'; 8020 = 'Allowed'; 8023 = 'Allowed'
    8003 = 'Audited'; 8006 = 'Audited'; 8021 = 'Audited'; 8024 = 'Audited'
    8004 = 'Blocked'; 8007 = 'Blocked'; 8022 = 'Blocked'; 8025 = 'Blocked'
}

# CodeIntegrity (WDAC / App Control for Business). 3076 audit and 3077 block are
# the two that matter most; the rest are policy lifecycle and signing detail.
$CodeIntegrityLog = 'Microsoft-Windows-CodeIntegrity/Operational'
$CodeIntegrityIds = @(
    3001, 3002, 3004, 3010, 3011, 3012, 3023, 3024, 3026, 3032, 3033, 3034, 3036,
    3064, 3065, 3074, 3075, 3076, 3077, 3079, 3080, 3081, 3082, 3084, 3085, 3086,
    3089, 3090, 3091, 3092, 3095, 3096, 3097, 3099, 3100, 3101, 3102, 3103, 3104,
    3105, 3108, 3110, 3111, 3112, 3114, 3115, 3116
) | Select-Object -Unique

# ── Query helper ─────────────────────────────────────────────────────────────
# FilterHashtable compiles to XPath with a hard limit of ~23 comparisons, so a
# 48-ID list must be chunked or the query throws. "No events" is detected by
# FullyQualifiedErrorId, never by the (localised) message.
function Get-EventsChunked {
    param([string]$LogName, [int[]]$Ids, [int]$Cap)
    $out = New-Object System.Collections.Generic.List[object]
    $readable = $false
    for ($i = 0; $i -lt $Ids.Count; $i += 20) {
        $chunk = $Ids[$i..([Math]::Min($i + 19, $Ids.Count - 1))]
        $remaining = $Cap - $out.Count
        if ($remaining -le 0) { break }
        try {
            $got = @(Get-WinEvent -FilterHashtable @{
                LogName   = $LogName
                Id        = $chunk
                StartTime = $Since
            } -MaxEvents $remaining -ErrorAction Stop)
            $readable = $true
            foreach ($e in $got) { $out.Add($e) }
        }
        catch {
            if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { $readable = $true }
            else { Add-CollectWarning "Could not read '$LogName' (IDs $($chunk[0])..$($chunk[-1])): $($_.Exception.Message)" }
        }
    }
    [pscustomobject]@{ Events = $out; Readable = $readable; Capped = ($out.Count -ge $Cap) }
}

# Dedupe on time+id+message: MDM re-delivery and log rollover can duplicate
# entries; the triple is the same key the replaced script used, kept because it
# is the right one.
function Get-Deduped {
    param($Events)
    $seen = @{}
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($e in $Events) {
        $k = '{0:o}|{1}|{2}' -f $e.TimeCreated, $e.Id, $e.Message
        if (-not $seen.ContainsKey($k)) { $seen.Add($k, $true); $out.Add($e) }
    }
    $out
}

# ── Collect: CodeIntegrity ───────────────────────────────────────────────────
Write-Log "Collecting CodeIntegrity events from $CodeIntegrityLog"
$ciResult  = Get-EventsChunked -LogName $CodeIntegrityLog -Ids $CodeIntegrityIds -Cap $MaxEvents
$ciRaw     = $ciResult.Events.Count
$ciEvents  = Get-Deduped $ciResult.Events
if ($ciResult.Capped) { Add-CollectWarning "CodeIntegrity collection stopped at the $MaxEvents cap - counts are a floor, not a total." }
Write-Log "CodeIntegrity: $ciRaw raw, $($ciEvents.Count) unique"

# ── Collect: AppLocker ───────────────────────────────────────────────────────
$alEvents  = New-Object System.Collections.Generic.List[object]
$alRaw     = 0
$logsRead  = New-Object System.Collections.Generic.List[string]
foreach ($logEntry in $AppLockerLogs) {
    $logName = [string]$logEntry.Log
    $ids = [int[]]$logEntry.Ids
    $r = Get-EventsChunked -LogName $logName -Ids $ids -Cap ($MaxEvents - $alEvents.Count)
    if ($r.Readable) { $logsRead.Add($logName) }
    if ($r.Capped)   { Add-CollectWarning "AppLocker collection stopped at the $MaxEvents cap in '$logName' - counts are a floor, not a total." }
    $alRaw += $r.Events.Count
    foreach ($e in (Get-Deduped $r.Events)) { $alEvents.Add($e) }
    Write-Log "AppLocker '$logName': $($r.Events.Count) raw"
}
Write-Log "AppLocker: $alRaw raw, $($alEvents.Count) unique across $($logsRead.Count) log(s)"

# ── CSV/XML exports per event ID (the per-device deep-dive artefacts) ────────
function Export-PerId {
    param($Events, [string]$Prefix)
    foreach ($group in ($Events | Group-Object Id)) {
        $safe = $Prefix -replace '[\\/\s]', '_'
        try {
            $group.Group | Export-Csv  -Path (Join-Path $EventLogFolder "${safe}_$($group.Name).csv") -NoTypeInformation -Delimiter ';'
            $group.Group | Export-Clixml -Path (Join-Path $EventLogFolder "${safe}_$($group.Name).xml")
        }
        catch { Add-CollectWarning "Export failed for $safe id $($group.Name): $($_.Exception.Message)" }
    }
}
Export-PerId -Events $ciEvents -Prefix 'CodeIntegrity'
foreach ($logEntry in $AppLockerLogs) {
    $logName = [string]$logEntry.Log
    Export-PerId -Events @($alEvents | Where-Object { $_.LogName -eq $logName }) -Prefix "AppLocker_$logName"
}
Write-Log "CSV/XML exports written to $EventLogFolder"

# ── Normalise AppLocker entries for the JSON bundle ──────────────────────────
# SAME SHAPE as the T01 scan bundle's events.entries, parsed from each event's
# UserData XML - the message text is localised, the XML is not.
$entries = New-Object System.Collections.Generic.List[object]
foreach ($e in $alEvents) {
    $x = $null
    try { $x = [xml]$e.ToXml() } catch { continue }
    $rfd = $null
    try { $rfd = $x.Event.UserData.RuleAndFileData } catch { }
    if (-not $rfd) { continue }

    $get = {
        param($node, $name)
        try { if ($node.PSObject.Properties.Name -contains $name) { return [string]$node.$name } } catch { }
        return $null
    }
    $fqbn = & $get $rfd 'Fqbn'
    $pubName = $null; $prodName = $null; $binName = $null; $binVer = $null
    if ($fqbn -and $fqbn -ne '-') {
        $bits = $fqbn -split '\\'
        if ($bits.Count -ge 1) { $pubName = $bits[0] }
        if ($bits.Count -ge 2) { $prodName = $bits[1] }
        if ($bits.Count -ge 3) { $binName = $bits[2] }
        if ($bits.Count -ge 4) { $binVer = $bits[3] }
    }
    $filePath = & $get $rfd 'FilePath'
    if (-not $filePath) { $filePath = & $get $rfd 'Package' }
    $userSid = & $get $rfd 'TargetUser'
    $v = $null
    if ($Verdict.ContainsKey([int]$e.Id)) { $v = $Verdict[[int]$e.Id] }

    $entries.Add([pscustomobject]@{
        timeUtc    = $e.TimeCreated.ToUniversalTime().ToString('o')
        log        = $e.LogName
        eventId    = [int]$e.Id
        verdict    = $v
        policyName = (& $get $rfd 'PolicyName')
        path       = $filePath
        publisher  = $pubName
        product    = $prodName
        binary     = $binName
        version    = $binVer
        signed     = [bool]($pubName -and $pubName -ne '-')
        hash       = (& $get $rfd 'FileHash')
        userSid    = $userSid
    })
}

$blocked = @($entries | Where-Object { $_.verdict -eq 'Blocked' })
$audited = @($entries | Where-Object { $_.verdict -eq 'Audited' })
$allowed = @($entries | Where-Object { $_.verdict -eq 'Allowed' })

# CodeIntegrity: counts per ID for the bundle. 3076/3077 are called out because
# they are WDAC's audit/block pair - the CI numbers T01 surfaces first.
# Plain variables up front so both the bundle and the HTML read simple locals.
$ciCounts = @{}
# .Add(), not indexed set — Group-Object keys are unique so Add cannot collide,
# and the method call keeps the whole script off the 5.1 dictionary binder.
foreach ($g in ($ciEvents | Group-Object Id)) { $ciCounts.Add([string]$g.Name, [int]$g.Count) }
$ci3076 = 0; if ($ciCounts.ContainsKey('3076')) { $ci3076 = [int]$ciCounts['3076'] }
$ci3077 = 0; if ($ciCounts.ContainsKey('3077')) { $ci3077 = [int]$ciCounts['3077'] }

# ── JSON events bundle ───────────────────────────────────────────────────────
# Written into the IME Logs ROOT with a .log extension ON PURPOSE - the same
# trick as the HTML report: Intune device diagnostics collects *.log from that
# folder, so the bundle rides home on the built-in mechanism. T01's upload
# detects JSON by CONTENT, not by extension, so the file imports as-is.
# [pscustomobject], never [ordered] - the same shape the scan bundle uses, for
# the same reason: property order survives ConvertTo-Json and nothing touches
# the 5.1 dictionary binder (see the note at $AppLockerLogs).
$bundle = [pscustomobject]@{
    schema    = 'tuno.applocker.events/1'
    generator = [pscustomobject]@{
        script    = 'Get-TunoAppControlEvents.ps1'
        version   = $script:ScriptVersion
        tunoBuild = $script:TunoBuild
    }
    machine   = [pscustomobject]@{
        name         = $env:COMPUTERNAME
        collectedUtc = (Get-Date).ToUniversalTime().ToString('o')
        daysBack     = $DaysBack
        sinceUtc     = $Since.ToUniversalTime().ToString('o')
    }
    events    = [pscustomobject]@{
        available = ($logsRead.Count -gt 0)
        logsRead  = $logsRead.ToArray()
        daysBack  = $DaysBack
        sinceUtc  = $Since.ToUniversalTime().ToString('o')
        summary   = [pscustomobject]@{
            total   = $entries.Count
            blocked = $blocked.Count
            audited = $audited.Count
            allowed = $allowed.Count
        }
        entries   = $entries.ToArray()
    }
    codeIntegrity = [pscustomobject]@{
        available = $ciResult.Readable
        total     = $ciEvents.Count
        audit3076 = $ci3076
        block3077 = $ci3077
        countsById = $ciCounts
    }
    warnings  = $Warnings.ToArray()
}
$BundlePath = Join-Path $ImeLogs "AppControlEvents_Bundle_$Stamp.log"
$bundle | ConvertTo-Json -Depth 6 | Set-Content -Path $BundlePath -Encoding UTF8
Write-Log "JSON events bundle written: $BundlePath (upload this to T01)"

# ── HTML report (for humans; same diagnostics trick) ─────────────────────────
$HtmlPath = $null
if (-not $SkipHtmlReport) {
    $HtmlPath = Join-Path $ImeLogs "AppControlEvents_Report_$Stamp.log"
    $H = New-Object System.Collections.Generic.List[string]
    $H.Add('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>App Control Events Report</title><style>')
    $H.Add('body{font-family:"Segoe UI",Arial,sans-serif;font-size:12px;background:#f5f5f5;color:#333;margin:0;padding:16px}')
    $H.Add('.card{background:#fff;border-radius:6px;padding:12px 16px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}')
    $H.Add('details{margin-bottom:10px;border:1px solid #e0e0e0;border-radius:4px}summary{font-weight:600;cursor:pointer;padding:8px 12px;background:#f9f9f9}')
    $H.Add('table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #ddd;padding:4px 6px;vertical-align:top}')
    $H.Add('th{background:#0078d4;color:#fff}tr:nth-child(even){background:#f9f9f9}')
    $H.Add('.b{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:#e5f1fb;color:#005a9e;margin-left:6px}')
    $H.Add('</style></head><body>')
    $H.Add("<h1>App Control Events Report</h1>")
    $H.Add('<div class="card">')
    $H.Add("<p><b>Computer:</b> $(ConvertTo-HtmlSafe $env:COMPUTERNAME) &nbsp; <b>Generated:</b> $(ConvertTo-HtmlSafe (Get-Date)) &nbsp; <b>Window:</b> last $DaysBack day(s)</p>")
    $H.Add("<p><b>AppLocker:</b> $alRaw raw &rarr; $($alEvents.Count) unique &mdash; $($blocked.Count) blocked, $($audited.Count) audited (would block), $($allowed.Count) allowed</p>")
    $H.Add("<p><b>CodeIntegrity:</b> $ciRaw raw &rarr; $($ciEvents.Count) unique &mdash; 3076 audit: $ci3076, 3077 block: $ci3077</p>")
    $H.Add("<p><b>Exports:</b> $(ConvertTo-HtmlSafe $EventLogFolder) &nbsp; <b>T01 bundle:</b> $(ConvertTo-HtmlSafe $BundlePath)</p>")
    foreach ($w in $Warnings) { $H.Add("<p style='color:#856404'><b>WARN:</b> $(ConvertTo-HtmlSafe $w)</p>") }
    $H.Add('</div>')

    # [pscustomobject] here too. 1.0.1 used plain hashtables and died on the
    # very first `$section.Events` - dot access on a Hashtable goes through the
    # same broken 5.1 member binder as [ordered] indexing ("Argument types do
    # not match", the trap named this exact line). A pscustomobject's dot
    # access is a real adapted property; the scan uses it everywhere and runs.
    foreach ($section in @(
        [pscustomobject]@{ Title = 'AppLocker events'; Events = $alEvents.ToArray(); Badge = 'Microsoft-Windows-AppLocker' },
        [pscustomobject]@{ Title = 'CodeIntegrity events'; Events = @($ciEvents); Badge = 'Microsoft-Windows-CodeIntegrity' }
    )) {
        $H.Add("<div class='card'><h2>$($section.Title)<span class='b'>$($section.Badge)</span></h2>")
        $sectionEvents = @($section.Events)
        if ($sectionEvents.Count -eq 0) { $H.Add('<p>No events in the window.</p>') }
        else {
            $byLog = @($sectionEvents | Group-Object LogName | Sort-Object Name)
            foreach ($lg in $byLog) {
                if ($byLog.Count -gt 1) { $H.Add("<h3>$(ConvertTo-HtmlSafe $lg.Name)</h3>") }
                foreach ($g in ($lg.Group | Group-Object Id | Sort-Object { [int]$_.Name })) {
                    $H.Add("<details><summary>Event ID $($g.Name)<span class='b'>$($g.Count) events</span></summary><table>")
                    $H.Add('<tr><th>TimeCreated</th><th>Level</th><th>Message</th></tr>')
                    foreach ($ev in ($g.Group | Sort-Object TimeCreated)) {
                        $H.Add("<tr><td>$(ConvertTo-HtmlSafe $ev.TimeCreated)</td><td>$(ConvertTo-HtmlSafe $ev.LevelDisplayName)</td><td>$(ConvertTo-HtmlSafe $ev.Message)</td></tr>")
                    }
                    $H.Add('</table></details>')
                }
            }
        }
        $H.Add('</div>')
    }
    $H.Add('</body></html>')
    ($H -join "`r`n") | Set-Content -Path $HtmlPath -Encoding UTF8
    Write-Log "HTML report written: $HtmlPath"
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Log "SUMMARY: AppLocker $($alEvents.Count) unique ($($blocked.Count) blocked / $($audited.Count) audited / $($allowed.Count) allowed), CodeIntegrity $($ciEvents.Count) unique, warnings $($Warnings.Count)"
Write-Log "========== Collection complete =========="

$msg = "Collected $($alEvents.Count) AppLocker ($($blocked.Count) blocked, $($audited.Count) audited) and $($ciEvents.Count) CodeIntegrity events from last $DaysBack day(s). T01 bundle: $BundlePath"
if ($Warnings.Count) { $msg += " | $($Warnings.Count) warning(s) - see $LogFile" }
Write-Output $msg
exit 0
