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

THE HARVEST SITE (1.2.0, build 10613). Every retrieval above needs the device ON. With
a harvest target configured, each pass also uploads the bundle and the report to a
SharePoint site - Harvest\<COMPUTERNAME>\AppControlEvents_Bundle_<stamp>.json and
..._Report_<stamp>.html - so the evidence is in the tenant whether the laptop is in
the bag or not. T01's "Harvest site" panel creates the site; the companion
New-TunoHarvestUploaderApp.ps1 creates the uploader app registration (Sites.Selected,
APPLICATION permission, granted write on THAT SITE ONLY), a certificate, and the
PFX you deploy to the devices; T01 stamps the target into this script when it creates
the Remediation. The device authenticates as that app - with the certificate from
LocalMachine\My (the recommended route), or, since 1.3.0, with a CLIENT SECRET the
📁 panel created and stamped into this file (T01 build 10615, on request). A secret in
a Remediation is a shared credential on every device in the ring, readable by any
local administrator and in the IME script cache, and `write` on the site implies read
of the whole harvest: choose it knowingly, rotate it from the panel, and keep the site
free of anything confidential. The certificate is preferred where the PFX can be
deployed. Upload failures are warnings: the local harvest is complete either way, and
the next pass uploads again.

  Configuration, first match wins:
    1. the -Harvest* parameters (a shell run)
    2. HKLM\SOFTWARE\TUNO\Harvest  (SiteUrl, TenantId, ClientId, CertSubject,
       CertThumbprint, ClientSecret, Folder, RetentionDays) - for a script
       deployed by hand
    3. the HARVEST TARGET block below, which T01 fills in at deploy
  A certificate wins over a secret when both are present. Nothing configured = no
  upload, and the log says "harvest: not configured". The secret is never logged.

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

.PARAMETER HarvestSiteUrl
The harvest site, e.g. https://contoso.sharepoint.com/sites/TUNO-AppControl-Harvest.
Overrides the registry and the embedded target.

.PARAMETER HarvestTenantId
The tenant the uploader app lives in (a GUID).

.PARAMETER HarvestClientId
The uploader app registration's application (client) id - the one with Sites.Selected.

.PARAMETER HarvestCertSubject
Subject of the uploader certificate in Cert:\LocalMachine\My, e.g. CN=TUNO Harvest
Uploader. The newest certificate with that subject and a private key is used.

.PARAMETER HarvestCertThumbprint
Alternative to the subject: the exact certificate by thumbprint.

.PARAMETER HarvestClientSecret
Alternative to the certificate: the uploader app's client secret (1.3.0). Used only
when no certificate is configured. See the DESCRIPTION for what that trade means.

.PARAMETER HarvestFolder
Library folder under the site's default document library. Default Harvest; the device
name is a subfolder under it.

.PARAMETER HarvestRetentionDays
Prune THIS DEVICE'S uploads older than this many days from the harvest site. Default 0
= keep everything in the cloud - the site is the archive; the 30-day rule applies to
the device.

.PARAMETER RetentionDays
Housekeeping window, in days. Default 30 - matches DaysBack. On every pass, before it
collects, the script removes what earlier passes of THIS SET left behind that is older
than this: bundles and reports in the IME Logs folder, the per-ID CSV/XML exports, the
Live Response zips in IT-TOOLS\Apps, and it trims its own log and the detection half's
log to the entries inside the window. Nothing else in those folders is touched. 0 keeps
everything.

.NOTES
Version   : 1.3.0
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

    [switch]$SkipHtmlReport,

    [ValidateRange(0, 3650)]
    [int]$RetentionDays = 30,

    [string]$HarvestSiteUrl,
    [string]$HarvestTenantId,
    [string]$HarvestClientId,
    [string]$HarvestCertSubject,
    [string]$HarvestCertThumbprint,
    [string]$HarvestClientSecret,
    [string]$HarvestFolder,
    [ValidateRange(-1, 3650)]
    [int]$HarvestRetentionDays = -1
)

# Two numbers, same discipline as every house script: ScriptVersion is this file's
# own history, TunoBuild the site build that served it. Held to js/version.js by
# the guard in _to_delete/check-script-versions.js.
$script:ScriptVersion = '1.3.0'
$script:TunoBuild = 10621

# ── HARVEST TARGET ─────────────────────────────────────────────────────────
# Filled in by T01 when the events Remediation is created from a page with a
# harvest site set; a downloaded copy carries the empty defaults and reads
# HKLM\SOFTWARE\TUNO\Harvest instead. Keep the assignments on their own lines
# exactly as they are - T01 stamps them by pattern. The device proves itself with
# the certificate where one is configured; ClientSecret is the 📁 panel's
# on-request alternative (1.3.0) and is a shared credential on every device
# that carries this file - see the DESCRIPTION before choosing it.
$script:HarvestTarget = [pscustomobject]@{
    SiteUrl        = ''
    TenantId       = ''
    ClientId       = ''
    CertSubject    = ''
    CertThumbprint = ''
    ClientSecret   = ''
    Folder         = 'Harvest'
    RetentionDays  = 0
}

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

# ── Housekeeping: nothing this set produces outlives RetentionDays (build 10612)
# IDENTICAL in every remediation half (Clear-, Initialize-, Get-). A Remediation
# is one self-contained file, so the function travels with each script instead of
# being shared - edit one, edit all three. Two acts, both scoped to THIS SET'S OWN
# OUTPUT and never a folder sweep (IME Logs and IT-TOOLS\LOGS hold other tools'
# files too): files matching the named patterns that are older than the cutoff are
# removed, and the set's append-only logs are trimmed to the entries inside the
# window - a line without a timestamp belongs to the entry above it and follows
# its fate. Markers and this run's own artefacts are never touched. 0 keeps all.
function Remove-TunoStaleOutput {
    param(
        [int]$Days,
        [object[]]$FilePatterns,    # [pscustomobject]@{ Folder = ...; Pattern = ... } each
        [string[]]$LogFiles,        # append-only logs to trim in place
        [string[]]$Keep             # exact paths never removed
    )
    $result = [pscustomobject]@{ Removed = 0; Trimmed = 0; Bytes = [long]0; Errors = (New-Object System.Collections.Generic.List[string]) }
    if ($Days -le 0) { return $result }
    $cutoff = (Get-Date).AddDays(-$Days)
    foreach ($fp in @($FilePatterns)) {
        $folder = [string]$fp.Folder
        $pattern = [string]$fp.Pattern
        if (-not (Test-Path -LiteralPath $folder -PathType Container)) { continue }
        foreach ($f in @(Get-ChildItem -LiteralPath $folder -Filter $pattern -File -Force -ErrorAction SilentlyContinue)) {
            if (@($Keep) -contains $f.FullName) { continue }
            if ($f.LastWriteTime -ge $cutoff) { continue }
            try {
                $len = [long]$f.Length
                Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
                $result.Removed = $result.Removed + 1
                $result.Bytes = $result.Bytes + $len
            }
            catch { $result.Errors.Add("remove $($f.FullName): $($_.Exception.Message)") }
        }
    }
    $formats = [string[]]@('yyyy-MM-dd HH:mm:ss', 'yyyy-MM-ddTHH:mm:ss')
    foreach ($lf in @($LogFiles)) {
        if (-not $lf) { continue }
        if (-not (Test-Path -LiteralPath $lf -PathType Leaf)) { continue }
        try {
            $lines = @(Get-Content -LiteralPath $lf -ErrorAction Stop)
            $out = New-Object System.Collections.Generic.List[string]
            $keepLine = $true
            $dropped = 0
            foreach ($line in $lines) {
                $m = [regex]::Match([string]$line, '^\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})')
                if ($m.Success) {
                    $t = [datetime]::MinValue
                    if ([datetime]::TryParseExact($m.Groups[1].Value, $formats, [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$t)) {
                        $keepLine = ($t -ge $cutoff)
                    }
                }
                if ($keepLine) { $out.Add([string]$line) } else { $dropped++ }
            }
            if ($dropped -gt 0) {
                Set-Content -LiteralPath $lf -Value $out.ToArray() -Encoding UTF8 -ErrorAction Stop
                $result.Trimmed = $result.Trimmed + $dropped
            }
        }
        catch { $result.Errors.Add("trim ${lf}: $($_.Exception.Message)") }
    }
    return $result
}

# Before collecting: yesterday's harvest is not evidence for ever. The patterns
# are this set's own file names; the zip is Compress-TunoAppControlReport.ps1's
# output, cleaned here because that script is a Live Response one-off and never
# runs on a schedule. The detection half's log is trimmed here for the same
# reason - detection is a one-liner that should stay one.
$hk = Remove-TunoStaleOutput -Days $RetentionDays -FilePatterns @(
    [pscustomobject]@{ Folder = $ImeLogs;                          Pattern = 'AppControlEvents_Bundle_*.log' }
    [pscustomobject]@{ Folder = $ImeLogs;                          Pattern = 'AppControlEvents_Report_*.log' }
    [pscustomobject]@{ Folder = $EventLogFolder;                   Pattern = 'CodeIntegrity_*.csv' }
    [pscustomobject]@{ Folder = $EventLogFolder;                   Pattern = 'CodeIntegrity_*.xml' }
    [pscustomobject]@{ Folder = $EventLogFolder;                   Pattern = 'AppLocker_*.csv' }
    [pscustomobject]@{ Folder = $EventLogFolder;                   Pattern = 'AppLocker_*.xml' }
    [pscustomobject]@{ Folder = "$env:ProgramData\IT-TOOLS\Apps"; Pattern = 'ACB-Report_*.zip' }
) -LogFiles @($LogFile, (Join-Path $LogFolder 'AppControlEvents-Detect.log')) -Keep @()

Write-Log "========== TUNO App Control events collection v$script:ScriptVersion (build $script:TunoBuild) =========="
Write-Log "Computer: $env:COMPUTERNAME  User: $env:USERNAME  Window: last $DaysBack day(s), cap $MaxEvents per provider"
if ($RetentionDays -gt 0) { Write-Log ("HOUSEKEEPING: retention {0} day(s) - removed {1} file(s) ({2:N0} bytes), trimmed {3} log line(s){4}" -f $RetentionDays, $hk.Removed, $hk.Bytes, $hk.Trimmed, $(if ($hk.Errors.Count) { '; ' + ($hk.Errors -join '; ') } else { '' })) }
else { Write-Log 'HOUSEKEEPING: off (RetentionDays 0) - earlier harvests are kept' }

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

# ── Harvest: upload this pass to the SharePoint site, when one is set ────────
# Resolution order is documented in the header: parameters, then the registry,
# then the embedded block. A value that is present wins field by field, so a
# registry that only carries the site URL still leaves the embedded ids alone.
function Get-HarvestConfig {
    $cfg = [pscustomobject]@{
        SiteUrl = [string]$script:HarvestTarget.SiteUrl; TenantId = [string]$script:HarvestTarget.TenantId
        ClientId = [string]$script:HarvestTarget.ClientId; CertSubject = [string]$script:HarvestTarget.CertSubject
        CertThumbprint = [string]$script:HarvestTarget.CertThumbprint; ClientSecret = [string]$script:HarvestTarget.ClientSecret
        Folder = [string]$script:HarvestTarget.Folder
        RetentionDays = [int]$script:HarvestTarget.RetentionDays; Source = 'embedded'
    }
    $regPath = 'HKLM:\SOFTWARE\TUNO\Harvest'
    if (Test-Path -LiteralPath $regPath) {
        $reg = Get-ItemProperty -LiteralPath $regPath -ErrorAction SilentlyContinue
        foreach ($name in @('SiteUrl', 'TenantId', 'ClientId', 'CertSubject', 'CertThumbprint', 'ClientSecret', 'Folder')) {
            $v = $null
            try { if ($reg.PSObject.Properties.Name -contains $name) { $v = [string]$reg.$name } } catch { }
            if ($v) { $cfg.$name = $v.Trim(); $cfg.Source = 'registry' }
        }
        try { if ($reg.PSObject.Properties.Name -contains 'RetentionDays') { $cfg.RetentionDays = [int]$reg.RetentionDays; $cfg.Source = 'registry' } } catch { }
    }
    if ($HarvestSiteUrl)        { $cfg.SiteUrl = $HarvestSiteUrl.Trim();               $cfg.Source = 'parameter' }
    if ($HarvestTenantId)       { $cfg.TenantId = $HarvestTenantId.Trim();             $cfg.Source = 'parameter' }
    if ($HarvestClientId)       { $cfg.ClientId = $HarvestClientId.Trim();             $cfg.Source = 'parameter' }
    if ($HarvestCertSubject)    { $cfg.CertSubject = $HarvestCertSubject.Trim();       $cfg.Source = 'parameter' }
    if ($HarvestCertThumbprint) { $cfg.CertThumbprint = $HarvestCertThumbprint.Trim(); $cfg.Source = 'parameter' }
    if ($HarvestClientSecret)   { $cfg.ClientSecret = $HarvestClientSecret.Trim();     $cfg.Source = 'parameter' }
    if ($HarvestFolder)         { $cfg.Folder = $HarvestFolder.Trim();                 $cfg.Source = 'parameter' }
    if ($HarvestRetentionDays -ge 0) { $cfg.RetentionDays = $HarvestRetentionDays;     $cfg.Source = 'parameter' }
    if (-not $cfg.Folder) { $cfg.Folder = 'Harvest' }
    $cfg
}

# base64url, the JWT alphabet - no padding, - and _ for + and /.
function ConvertTo-Base64Url {
    param([byte[]]$Bytes)
    [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# The uploader certificate: by thumbprint when given, else the newest valid one
# with the subject that has a private key SYSTEM can use. LocalMachine\My is
# where an Intune PKCS-import profile lands it.
function Get-HarvestCertificate {
    param([string]$Subject, [string]$Thumbprint)
    $all = @(Get-ChildItem -Path 'Cert:\LocalMachine\My' -ErrorAction Stop | Where-Object { $_.HasPrivateKey })
    if ($Thumbprint) {
        $t = ($Thumbprint -replace '\s', '').ToUpperInvariant()
        return @($all | Where-Object { $_.Thumbprint -eq $t }) | Select-Object -First 1
    }
    $now = Get-Date
    @($all | Where-Object { $_.Subject -eq $Subject -and $_.NotAfter -gt $now } | Sort-Object NotAfter -Descending) | Select-Object -First 1
}

# Client-credentials with a certificate: a JWT signed by the private key is the
# client assertion. RS256 via GetRSAPrivateKey covers both CAPI and CNG keys,
# which matters because an imported PFX usually lands as CNG.
function Get-HarvestToken {
    param([string]$TenantId, [string]$ClientId, [System.Security.Cryptography.X509Certificates.X509Certificate2]$Cert, [string]$Secret)
    $aud = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    if (-not $Cert) {
        # The secret route (1.3.0): plain client credentials. The secret goes to
        # the token endpoint and nowhere else - not the log, not the output.
        if (-not $Secret) { throw 'neither a certificate nor a client secret is configured' }
        $r = Invoke-RestMethod -Method Post -Uri $aud -Body @{ client_id = $ClientId; client_secret = $Secret; scope = 'https://graph.microsoft.com/.default'; grant_type = 'client_credentials' } -ContentType 'application/x-www-form-urlencoded' -ErrorAction Stop
        if (-not $r.access_token) { throw 'the token endpoint answered without an access token' }
        return [string]$r.access_token
    }
    $now = [DateTimeOffset]::UtcNow
    $header = @{ alg = 'RS256'; typ = 'JWT'; x5t = (ConvertTo-Base64Url -Bytes $Cert.GetCertHash()) } | ConvertTo-Json -Compress
    $claims = @{
        aud = $aud; iss = $ClientId; sub = $ClientId; jti = [guid]::NewGuid().ToString()
        nbf = $now.AddMinutes(-2).ToUnixTimeSeconds(); exp = $now.AddMinutes(8).ToUnixTimeSeconds()
    } | ConvertTo-Json -Compress
    $unsigned = (ConvertTo-Base64Url -Bytes ([Text.Encoding]::UTF8.GetBytes($header))) + '.' + (ConvertTo-Base64Url -Bytes ([Text.Encoding]::UTF8.GetBytes($claims)))
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($Cert)
    if (-not $rsa) { throw 'the certificate has no usable RSA private key' }
    $sig = $rsa.SignData([Text.Encoding]::UTF8.GetBytes($unsigned), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $assertion = $unsigned + '.' + (ConvertTo-Base64Url -Bytes $sig)
    $body = @{
        client_id = $ClientId; scope = 'https://graph.microsoft.com/.default'; grant_type = 'client_credentials'
        client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'; client_assertion = $assertion
    }
    $r = Invoke-RestMethod -Method Post -Uri $aud -Body $body -ContentType 'application/x-www-form-urlencoded' -ErrorAction Stop
    if (-not $r.access_token) { throw 'the token endpoint answered without an access token' }
    [string]$r.access_token
}

# The site by URL, not by id: the id is a triple the admin would have to copy
# out of Graph; the URL is what the panel shows and what the admin can open.
function Get-HarvestSiteId {
    param([string]$SiteUrl, [hashtable]$Headers)
    $u = [uri]$SiteUrl
    $path = $u.AbsolutePath.TrimEnd('/')
    $site = Invoke-RestMethod -Method Get -Uri ("https://graph.microsoft.com/v1.0/sites/{0}:{1}" -f $u.Host, $path) -Headers $Headers -ErrorAction Stop
    if (-not $site.id) { throw "the site $SiteUrl could not be resolved" }
    [string]$site.id
}

# Simple PUT under 4 MB; an upload session in 5 MiB chunks (a multiple of the
# 320 KiB Graph requires) above it. Parent folders are created by the path
# itself - Graph makes them on a PUT to a path that does not exist yet.
function Send-HarvestFile {
    param([string]$SiteId, [string]$RemotePath, [string]$LocalPath, [hashtable]$Headers)
    $item = Get-Item -LiteralPath $LocalPath -ErrorAction Stop
    $enc = ($RemotePath -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $base = "https://graph.microsoft.com/v1.0/sites/$SiteId/drive/root:/$enc"
    if ($item.Length -lt 4000000) {
        $r = Invoke-RestMethod -Method Put -Uri "${base}:/content" -Headers $Headers -InFile $LocalPath -ContentType 'application/octet-stream' -ErrorAction Stop
        return [long]$r.size
    }
    $session = Invoke-RestMethod -Method Post -Uri "${base}:/createUploadSession" -Headers $Headers -ContentType 'application/json' -Body (@{ item = @{ '@microsoft.graph.conflictBehavior' = 'replace' } } | ConvertTo-Json -Compress) -ErrorAction Stop
    $chunk = 5242880
    $fs = [System.IO.File]::OpenRead($LocalPath)
    try {
        $buf = New-Object byte[] $chunk
        $pos = [long]0
        $total = [long]$item.Length
        while ($pos -lt $total) {
            $n = $fs.Read($buf, 0, $chunk)
            if ($n -le 0) { break }
            $part = if ($n -eq $chunk) { $buf } else { $buf[0..($n - 1)] }
            $range = "bytes $pos-$($pos + $n - 1)/$total"
            # The session URL is pre-authorised: no Authorization header on it.
            $null = Invoke-WebRequest -Method Put -Uri $session.uploadUrl -Headers @{ 'Content-Range' = $range } -Body $part -ContentType 'application/octet-stream' -UseBasicParsing -ErrorAction Stop
            $pos += $n
        }
    }
    finally { $fs.Dispose() }
    [long]$item.Length
}

# This device's folder only, this set's names only, older than the window.
function Remove-HarvestStale {
    param([string]$SiteId, [string]$DeviceFolder, [int]$Days, [hashtable]$Headers)
    if ($Days -le 0) { return 0 }
    $enc = ($DeviceFolder -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $cutoff = (Get-Date).ToUniversalTime().AddDays(-$Days)
    $removed = 0
    $uri = "https://graph.microsoft.com/v1.0/sites/$SiteId/drive/root:/${enc}:/children?`$select=id,name,file,lastModifiedDateTime&`$top=200"
    while ($uri) {
        $page = Invoke-RestMethod -Method Get -Uri $uri -Headers $Headers -ErrorAction Stop
        foreach ($it in @($page.value)) {
            if (-not $it.file) { continue }
            if ($it.name -notlike 'AppControlEvents_*') { continue }
            if ([datetime]$it.lastModifiedDateTime -ge $cutoff) { continue }
            Invoke-RestMethod -Method Delete -Uri "https://graph.microsoft.com/v1.0/sites/$SiteId/drive/items/$($it.id)" -Headers $Headers -ErrorAction Stop | Out-Null
            $removed++
        }
        $uri = $null
        try { if ($page.PSObject.Properties.Name -contains '@odata.nextLink') { $uri = [string]$page.'@odata.nextLink' } } catch { }
    }
    $removed
}

$HarvestNote = 'harvest: not configured'
$harvestCfg = Get-HarvestConfig
$useCert = [bool]($harvestCfg.CertSubject -or $harvestCfg.CertThumbprint)
if ($harvestCfg.SiteUrl -and $harvestCfg.TenantId -and $harvestCfg.ClientId -and ($useCert -or $harvestCfg.ClientSecret)) {
    Write-Log ("Harvest target ({0}): {1} folder {2} as app {3}, {4}" -f $harvestCfg.Source, $harvestCfg.SiteUrl, $harvestCfg.Folder, $harvestCfg.ClientId, $(if ($harvestCfg.CertThumbprint) { "certificate $($harvestCfg.CertThumbprint)" } elseif ($harvestCfg.CertSubject) { "certificate $($harvestCfg.CertSubject)" } else { 'client secret (value not logged)' }))
    try {
        try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
        $cert = $null
        if ($useCert) {
            $cert = Get-HarvestCertificate -Subject $harvestCfg.CertSubject -Thumbprint $harvestCfg.CertThumbprint
            if (-not $cert) { throw ("no certificate {0} with a private key in LocalMachine\My - deploy the uploader PFX to this device" -f $(if ($harvestCfg.CertThumbprint) { $harvestCfg.CertThumbprint } else { $harvestCfg.CertSubject })) }
        }
        $token = Get-HarvestToken -TenantId $harvestCfg.TenantId -ClientId $harvestCfg.ClientId -Cert $cert -Secret $harvestCfg.ClientSecret
        $hdr = @{ Authorization = "Bearer $token" }
        $siteId = Get-HarvestSiteId -SiteUrl $harvestCfg.SiteUrl -Headers $hdr
        $deviceFolder = "{0}/{1}" -f $harvestCfg.Folder.Trim('/'), $env:COMPUTERNAME
        $sent = New-Object System.Collections.Generic.List[string]
        # The cloud copy gets the honest extension: .log was a trick for device
        # diagnostics, and SharePoint previews .json and .html.
        $bytes = Send-HarvestFile -SiteId $siteId -RemotePath ("{0}/AppControlEvents_Bundle_{1}.json" -f $deviceFolder, $Stamp) -LocalPath $BundlePath -Headers $hdr
        $sent.Add("bundle ($bytes bytes)")
        if ($HtmlPath) {
            $bytes = Send-HarvestFile -SiteId $siteId -RemotePath ("{0}/AppControlEvents_Report_{1}.html" -f $deviceFolder, $Stamp) -LocalPath $HtmlPath -Headers $hdr
            $sent.Add("report ($bytes bytes)")
        }
        $pruned = 0
        if ($harvestCfg.RetentionDays -gt 0) {
            try { $pruned = Remove-HarvestStale -SiteId $siteId -DeviceFolder $deviceFolder -Days $harvestCfg.RetentionDays -Headers $hdr }
            catch { Add-CollectWarning "Harvest prune failed: $($_.Exception.Message)" }
        }
        $HarvestNote = ("harvest: uploaded {0} to {1}/{2}{3}" -f ($sent -join ', '), $harvestCfg.SiteUrl.TrimEnd('/'), $deviceFolder, $(if ($pruned) { ", pruned $pruned older than $($harvestCfg.RetentionDays) day(s)" } else { '' }))
        Write-Log "HARVEST: $HarvestNote"
    }
    catch {
        $HarvestNote = "harvest: upload FAILED - $($_.Exception.Message)"
        Add-CollectWarning $HarvestNote
    }
}
elseif ($harvestCfg.SiteUrl -or $harvestCfg.TenantId -or $harvestCfg.ClientId -or $harvestCfg.CertSubject -or $harvestCfg.CertThumbprint -or $harvestCfg.ClientSecret) {
    $HarvestNote = 'harvest: PARTIALLY configured - SiteUrl, TenantId, ClientId and a certificate (CertSubject or CertThumbprint) or a ClientSecret are all required; nothing uploaded'
    Add-CollectWarning $HarvestNote
}
else { Write-Log "INFO: $HarvestNote (the local files above are the only copy - retrieve via Collect diagnostics or Live Response)" }

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Log "SUMMARY: AppLocker $($alEvents.Count) unique ($($blocked.Count) blocked / $($audited.Count) audited / $($allowed.Count) allowed), CodeIntegrity $($ciEvents.Count) unique, warnings $($Warnings.Count)"
Write-Log "========== Collection complete =========="

$msg = "Collected $($alEvents.Count) AppLocker ($($blocked.Count) blocked, $($audited.Count) audited) and $($ciEvents.Count) CodeIntegrity events from last $DaysBack day(s). T01 bundle: $BundlePath | $HarvestNote"
if ($Warnings.Count) { $msg += " | $($Warnings.Count) warning(s) - see $LogFile" }
Write-Output $msg
exit 0
