#Requires -Version 5.1
<#
.SYNOPSIS
Converts an exported AppLocker policy XML into an Intune custom (OMA-URI) profile -
offline as JSON, or straight into the tenant over Microsoft Graph.

.DESCRIPTION
AppLocker has no first-class settings-catalog surface in Intune. The supported route is
a Windows 10/11 CUSTOM profile carrying one OMA-URI setting per AppLocker rule
collection:

    ./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/<Grouping>/<Type>/Policy

where <Type> is EXE, MSI, Script, DLL or StoreApps, and the value is the
<RuleCollection> element of the policy, verbatim.

This script does that conversion. It takes one or more AppLocker policy XML files -
the Audit and Enforce exports that Invoke-TunoAppLockerScan.ps1 writes, or anything
TUNO's T01 tool exports, or a plain GPO export - and produces one Intune custom profile
per file.

TWO MODES

  -Offline (default)  Writes the profile JSON to disk. No authentication, no modules,
                      nothing contacted. Review it, commit it, import it later.

  -Online             Connects with Connect-MgGraph and creates the profile in the
                      tenant. Needs the Microsoft.Graph.Authentication module and the
                      DeviceManagementConfiguration.ReadWrite.All scope.

THE DLL COLLECTION IS OMITTED
AppLocker evaluates every DLL load. Enabled floods the endpoint; even AuditOnly floods
the event log with Microsoft-signed System32 libraries, EDR AMSI providers and .NET
native images.

It is OMITTED rather than marked NotConfigured, because NotConfigured does not mean
"off". Microsoft: "if any rules exist in a rule collection that is not configured, the
rules WILL be enforced ... you should avoid using this value in your AppLocker
policies." Shipping DLL rules that way would enforce DLL control, which is the
opposite of the intent. Absence is the only state that restricts nothing.

Pass -EnforceDllCollection to include the collection at the file's own enforcement
mode - it will then be a collection that BLOCKS.

.PARAMETER XmlPath
One or more AppLocker policy XML files. Each produces its own Intune profile.

.PARAMETER Grouping
The grouping segment of the OMA-URI, which names a CSP node. MAKE IT UNIQUE PER PROFILE.
When omitted, one is GENERATED in the house format 'AppLocker-<guid>' and printed -
unique as Microsoft's guidance requires, recognisable in logs unlike a bare GUID. Do
not name it Pilot or Production: that distinction belongs in the assignment and the
enforcement mode of one profile edited in place, not in the grouping.

Microsoft: "Delete/unenrollment is not properly supported unless Grouping values are
unique across enrollments. If multiple enrollments use the same Grouping value, then
unenrollment will not work as expected since there are duplicate URIs that get deleted
by the resource manager ... The best practice is to use a randomly generated GUID."

Two profiles sharing a grouping write the SAME OMA-URIs, so unassigning one can delete
the nodes the other still depends on. Move from audit to enforce by editing the profile
you already have, not by deploying a second one beside it. Whitespace is stripped.

Note also that deploying does not clear what came before: each {Grouping}/{Type}/Policy
node persists until something explicitly deletes it, so a collection this profile omits
keeps running on the device. Both apply and delete reboot the device.

.PARAMETER DisplayName
Base name for the Intune profile. The suffix (see -NameSuffix) is appended.

.PARAMETER NameSuffix
Appended to -DisplayName to form the final profile name. Supply one per XML file, in
order, or a single value applied to all. If omitted the script derives one from the file
name and enforcement mode, e.g. '(AuditOnly) - 20260819-1530'.

.PARAMETER Enforcement
Forces the enforcement mode for ALL supplied files. When omitted, the mode is read from
each file's own EnforcementMode attributes, falling back to the file name ('...Audit...'
-> Audit, '...Enforce...' -> Enforce).

.PARAMETER Description
Description recorded on the Intune profile. Defaults to a line naming the source file
and when it was converted.

.PARAMETER OutputPath
Folder for the JSON in offline mode. Defaults to the current directory.

.PARAMETER Online
Create the profile in Intune over Microsoft Graph instead of writing JSON.

.PARAMETER TenantId
Tenant to connect to in online mode. Also used as a guard: if a Graph session is already
open against a different tenant the script stops rather than creating the profile in the
wrong customer.

.PARAMETER EnforceDllCollection
Include the DLL collection, at the file's own enforcement mode, instead of leaving it
out. It will BLOCK. Read the note above first.

.INPUTS
None.

.OUTPUTS
Offline : one <profile name>.json per XML file.
Online  : the created deviceConfiguration objects.

.EXAMPLE
# The normal case - convert both exports to JSON, review before anything touches a tenant.
PS> .\Convert-TunoAppLockerToIntune.ps1 `
        -XmlPath .\AppLockerRules-Audit-20260819-1530.xml, .\AppLockerRules-Enforce-20260819-1530.xml `
        -DisplayName 'Win - SEC - Device Security - AppLocker'
# No -Grouping: one is generated as AppLocker-<guid> and printed. Import ONE of the
# two profiles; move it from audit to enforce later by EDITING it, not by importing
# the second beside it.

.EXAMPLE
# Create the audit profile in the tenant.
PS> .\Convert-TunoAppLockerToIntune.ps1 -Online -TenantId 'contoso.onmicrosoft.com' `
        -XmlPath .\AppLockerRules-Audit-20260819-1530.xml `
        -DisplayName 'Win - SEC - Device Security - AppLocker' `
        -NameSuffix '(AuditOnly) - R27.1 - V4.0'

.EXAMPLE
# Import a JSON produced earlier (by this script, or exported from TUNO T01) with Graph:
PS> Connect-MgGraph -Scopes DeviceManagementConfiguration.ReadWrite.All
PS> $body = Get-Content .\profile.json -Raw
PS> Invoke-MgGraphRequest -Method POST `
        -Uri 'https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations' `
        -Body $body -ContentType 'application/json'

.NOTES
Version   : 1.4.1
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Standalone: no dependency on any customer-connection harness. In online mode it uses
            Connect-MgGraph directly; if you already have a Graph session open - from
            your own tooling or otherwise - it is reused as-is.
Assign it : this script CREATES the profile. It does not assign it. Assignment is a
            deliberate act in the Intune portal or a separate Graph call, and AppLocker
            is not a setting you want landing on a group by accident.
#>

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory)]
    [string[]]$XmlPath,

    [Parameter()]
    [string]$Grouping,

    [Parameter()]
    [string]$DisplayName = 'Win - SEC - Device Security - AppLocker',

    [Parameter()]
    [string[]]$NameSuffix,

    [Parameter()]
    [ValidateSet('Audit', 'Enforce')]
    [string]$Enforcement,

    [Parameter()]
    [string]$Description,

    [Parameter()]
    [string]$OutputPath = (Get-Location).Path,

    [Parameter()]
    [switch]$Online,

    [Parameter()]
    [string]$TenantId,

    [Parameter()]
    [switch]$EnforceDllCollection
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# See the note in Invoke-TunoAppLockerScan.ps1: ScriptVersion is this file's own
# history, TunoBuild is the site build that served it, and a headless test holds
# TunoBuild to js/version.js so they cannot drift.
$script:ScriptVersion = '1.4.1'
$script:TunoBuild = 10568
$script:GraphScope = 'DeviceManagementConfiguration.ReadWrite.All'
$script:GraphUri = 'https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations'

# AppLocker rule-collection Type -> the segment the CSP expects in the OMA-URI.
$script:OmaTypeByCollection = @{
    'Exe'    = 'EXE'
    'Msi'    = 'MSI'
    'Script' = 'Script'
    'Dll'    = 'DLL'
    'Appx'   = 'StoreApps'
}

# ──────────────────────────────────────────────────────────────────────────────
function Write-Section {
    param([string]$Text)
    Write-Host ''
    Write-Host ('─' * 72) -ForegroundColor DarkCyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ('─' * 72) -ForegroundColor DarkCyan
}
function Write-Info { param([string]$Text) Write-Host "  $Text" -ForegroundColor Gray }
function Write-Ok   { param([string]$Text) Write-Host "  [ok]   $Text" -ForegroundColor Green }
function Write-Note { param([string]$Text) Write-Host "  [note] $Text" -ForegroundColor DarkYellow }
# Write-Err also emits a real error record and counts. A script whose whole job is
# producing deployment artefacts must not exit 0 after failing to produce one:
# Write-Host sets no $?, populates no $Error and leaves no exit code behind.
$script:Failures = 0
function Write-Err {
    param([string]$Text)
    $script:Failures++
    Write-Host "  [err]  $Text" -ForegroundColor Red
    Write-Error -Message $Text -ErrorAction Continue
}

# ──────────────────────────────────────────────────────────────────────────────
function Resolve-EnforcementMode {
    <#
      Explicit -Enforcement wins. Otherwise read the file: if every configured
      collection says Enabled it is an Enforce policy, if they say AuditOnly it is an
      Audit policy. Only when the file itself is ambiguous do we fall back to guessing
      from the file name - and if that fails too, we say so instead of picking one.
    #>
    param(
        [Parameter(Mandatory)] [xml]$Document,
        [Parameter(Mandatory)] [string]$FileName,
        [string]$Explicit
    )
    if ($Explicit) { return $Explicit }

    # SelectNodes + GetAttribute rather than dotted property access: under
    # Set-StrictMode -Version Latest, reading a child element or an attribute
    # that is not there throws PropertyNotFoundException, which would turn every
    # deliberately friendly "this does not look like an AppLocker export" message
    # further down into an unhandled error. GetAttribute returns '' instead.
    $modes = @()
    foreach ($rc in $Document.SelectNodes('/AppLockerPolicy/RuleCollection')) {
        if (-not $rc) { continue }
        $m = $rc.GetAttribute('EnforcementMode')
        if ($m -and $m -ne 'NotConfigured') { $modes += $m }
    }
    $distinct = @($modes | Sort-Object -Unique)
    if ($distinct.Count -eq 1 -and $distinct[0] -eq 'Enabled')   { return 'Enforce' }
    if ($distinct.Count -eq 1 -and $distinct[0] -eq 'AuditOnly') { return 'Audit' }

    if ($FileName -match '(?i)enforce') { return 'Enforce' }
    if ($FileName -match '(?i)audit')   { return 'Audit' }
    return $null
}

function Get-DefaultSuffix {
    param(
        [Parameter(Mandatory)] [string]$FileName,
        [Parameter(Mandatory)] [ValidateSet('Audit', 'Enforce')] [string]$Mode
    )
    $label = 'AuditOnly'
    if ($Mode -eq 'Enforce') { $label = 'Enforced' }
    $parts = @("($label)")
    if ($FileName -match '(?i)(R\d+(\.\d+)?)') { $parts += $Matches[1] }
    if ($FileName -match '(?i)(v\d+(\.\d+)?)') { $parts += $Matches[1] }
    if ($FileName -match '(\d{8}-\d{4})')      { $parts += $Matches[1] }
    return ($parts -join ' - ')
}

function New-IntuneCustomProfile {
    <#
    .SYNOPSIS
        Build the windows10CustomConfiguration object for one AppLocker XML at one
        enforcement mode. Returns a PSCustomObject, not JSON.
    #>
    param(
        [Parameter(Mandatory)] [xml]$Document,
        [Parameter(Mandatory)] [ValidateSet('Audit', 'Enforce')] [string]$Mode,
        [Parameter(Mandatory)] [string]$ProfileName,
        [Parameter(Mandatory)] [string]$GroupingValue,
        [Parameter(Mandatory)] [string]$ProfileDescription,
        [switch]$AllowDllEnforcement
    )

    $collections = @($Document.SelectNodes('/AppLockerPolicy/RuleCollection'))
    if ($collections.Count -eq 0) {
        throw 'No <RuleCollection> elements found - this does not look like an AppLocker policy export.'
    }

    $omaSettings = New-Object System.Collections.Generic.List[object]
    foreach ($rc in $collections) {
        $type = $rc.GetAttribute('Type')
        if (-not $type -or -not $script:OmaTypeByCollection.ContainsKey($type)) {
            Write-Note "Skipping unrecognised rule collection type '$type'."
            continue
        }

        # DLL is OMITTED, not marked NotConfigured. Microsoft: "if any rules exist
        # in a rule collection that is 'not configured', the rules WILL be
        # enforced ... you should avoid using this value in your AppLocker
        # policies." Shipping DLL rules as NotConfigured would therefore ENFORCE
        # DLL control - the opposite of the intent - so the collection is left
        # out entirely, which is the only state that restricts nothing.
        if ($type -eq 'Dll' -and -not $AllowDllEnforcement) {
            Write-Note "Dll collection omitted from the profile. Pass -EnforceDllCollection to include it at the file's own enforcement mode; it will then be a collection that BLOCKS."
            continue
        }
        $target = 'AuditOnly'
        if ($Mode -eq 'Enforce') { $target = 'Enabled' }

        # Rewrite the attribute on a CLONE so the caller's document is not mutated -
        # the same XML is converted twice when both Audit and Enforce are requested.
        $clone = $rc.CloneNode($true)
        $clone.SetAttribute('EnforcementMode', $target)

        $omaSettings.Add([pscustomobject]@{
            '@odata.type' = '#microsoft.graph.omaSettingString'
            displayName   = $script:OmaTypeByCollection[$type]
            description   = "$type rule collection - EnforcementMode $target"
            omaUri        = "./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/$GroupingValue/$($script:OmaTypeByCollection[$type])/Policy"
            value         = $clone.OuterXml
        })
    }

    if ($omaSettings.Count -eq 0) {
        throw 'The policy contains no rule collections that map to an AppLocker CSP node.'
    }

    return [pscustomobject]@{
        '@odata.type' = '#microsoft.graph.windows10CustomConfiguration'
        displayName   = $ProfileName
        description   = $ProfileDescription
        omaSettings   = @($omaSettings)
    }
}

function Test-JsonText {
    param([Parameter(Mandatory)] [string]$Text)
    try { $null = ConvertFrom-Json -InputObject $Text -ErrorAction Stop; return $true }
    catch { return $false }
}

function Initialize-GraphSession {
    param([string]$ExpectedTenantId)

    if (-not (Get-Module -Name Microsoft.Graph.Authentication -ListAvailable)) {
        throw 'Online mode needs the Microsoft.Graph.Authentication module. Install it with: Install-Module Microsoft.Graph.Authentication -Scope CurrentUser'
    }
    Import-Module Microsoft.Graph.Authentication -Force -ErrorAction Stop | Out-Null

    $ctx = $null
    try { $ctx = Get-MgContext -ErrorAction Stop } catch { $ctx = $null }

    $reused = $true
    if (-not $ctx) {
        $reused = $false
        Write-Info 'No Graph session - connecting.'
        if ($ExpectedTenantId) { Connect-MgGraph -Scopes $script:GraphScope -TenantId $ExpectedTenantId -NoWelcome -ErrorAction Stop }
        else { Connect-MgGraph -Scopes $script:GraphScope -NoWelcome -ErrorAction Stop }
        $ctx = Get-MgContext -ErrorAction Stop
    }
    else {
        Write-Info 'Reusing the Graph session that is already open.'
    }

    # The wrong-tenant guard. -TenantId can be a GUID or a domain; a GUID compares
    # directly, a domain has to be resolved. An earlier version skipped the check
    # entirely for domain forms - which disabled it for exactly the usage the help
    # documents, and creating an AppLocker profile in the wrong customer's tenant
    # is not a mistake anyone notices quickly.
    # Only a REUSED session needs checking. When this script did the connecting it
    # passed -TenantId, so the session is in the right tenant by construction -
    # and verifying it would need a directory-read scope this script deliberately
    # does not ask for.
    if ($ExpectedTenantId -and $reused) {
        if (-not $ctx.TenantId) {
            Write-Err 'The open Graph session reports no tenant id, so it cannot be checked against -TenantId.'
            Write-Info 'Run Disconnect-MgGraph and re-run so this script connects to the tenant you named.'
            throw 'Tenant could not be verified.'
        }
        $matched = $false
        if ($ctx.TenantId -eq $ExpectedTenantId) { $matched = $true }
        elseif ($ExpectedTenantId -notmatch '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$') {
            # -TenantId was given as a domain. Resolve it without a token, via the
            # unauthenticated OIDC discovery document, whose issuer carries the
            # tenant GUID - so the check needs no extra Graph scope.
            try {
                $disco = Invoke-RestMethod -Method GET -ErrorAction Stop `
                    -Uri ("https://login.microsoftonline.com/{0}/v2.0/.well-known/openid-configuration" -f $ExpectedTenantId)
                if ($disco.issuer -match '([0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})') {
                    if ($ctx.TenantId -eq $Matches[1]) { $matched = $true }
                }
            }
            catch {
                Write-Err ("Could not resolve '{0}' to a tenant id: {1}" -f $ExpectedTenantId, $_.Exception.Message)
                Write-Info 'Refusing to continue rather than guessing. Run Disconnect-MgGraph and connect explicitly, or pass -TenantId as a GUID.'
                throw 'Tenant could not be verified.'
            }
        }
        if (-not $matched) {
            Write-Err ("The open Graph session is tenant '{0}', not the '{1}' you asked for." -f $ctx.TenantId, $ExpectedTenantId)
            Write-Info 'Run Disconnect-MgGraph and try again.'
            throw 'Tenant mismatch.'
        }
    }

    # A session opened for something else will not carry the scope, and the only
    # symptom would otherwise be a 403 at the POST.
    if ($ctx.Scopes -and ($ctx.Scopes -notcontains $script:GraphScope)) {
        Write-Err ("The open Graph session does not carry {0}." -f $script:GraphScope)
        Write-Info 'Run Disconnect-MgGraph, then re-run this script so it can connect with the scope it needs.'
        throw 'Missing Graph scope.'
    }

    return $ctx
}

function New-IntuneProfileInTenant {
    param([Parameter(Mandatory)] [string]$Json)
    Invoke-MgGraphRequest -Uri $script:GraphUri -Method POST -Body $Json -ContentType 'application/json' -ErrorAction Stop
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
$Grouping = ($Grouping -replace '\s', '').Trim()
if (-not $Grouping) {
    # No grouping supplied: generate the house format. Unique like the GUID
    # Microsoft's guidance asks for, recognisable in logs unlike a bare one.
    # Deliberately NOT 'Pilot' or 'Production' - that distinction lives in the
    # assignment and the enforcement mode of ONE profile edited in place, and a
    # hand-reusable word is exactly what produces two profiles sharing a
    # grouping, which is the case where removal breaks.
    $Grouping = 'AppLocker-' + [guid]::NewGuid().ToString()
    Write-Note "No -Grouping supplied - generated '$Grouping'. Record it: it is this deployment's identity on every device, and the cleanup log will name it."
}
# The grouping becomes one segment of the OMA-URI. A slash in it silently creates
# a different, wrong CSP node - the profile is accepted and simply never applies.
if ($Grouping -notmatch '^[A-Za-z0-9_.-]+$') {
    throw "-Grouping '$Grouping' contains characters that are not valid in a CSP node name. Use letters, digits, dot, dash and underscore only - a slash would silently produce a different OMA-URI and a profile that never applies."
}

$modeLabel = 'OFFLINE'
if ($Online) { $modeLabel = 'ONLINE' }
Write-Section "AppLocker -> Intune custom profile  ·  v$script:ScriptVersion  ·  $modeLabel"
Write-Info "Base name : $DisplayName"
Write-Info "Grouping  : $Grouping"
Write-Info ''

# ---- pre-flight: parse every file and resolve names before doing anything ----
$jobs = New-Object System.Collections.Generic.List[object]

# The suffix index tracks the position in -XmlPath, NOT the count of files that
# parsed. Incrementing at the end of the body means one skipped file shifts every
# later suffix by one, and the audit profile quietly gets the enforce name.
for ($index = 0; $index -lt $XmlPath.Count; $index++) {
    $p = $XmlPath[$index]
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
        Write-Err "Not found: $p"
        continue
    }
    $resolved = (Resolve-Path -LiteralPath $p).Path
    $fileName = [System.IO.Path]::GetFileName($resolved)

    $doc = $null
    try {
        # ReadAllText, not Get-Content -Raw. On Windows PowerShell 5.1 Get-Content
        # defaults to the system ANSI code page, and the policy XML this script is
        # built to consume is UTF-8 WITHOUT a BOM and carries no encoding
        # declaration. Any non-ASCII publisher name (O=MÜLLER GMBH) or file path
        # would be mojibake'd into the OMA-URI value, survive the JSON round-trip,
        # and reach the tenant as a rule that matches nothing.
        $raw = [System.IO.File]::ReadAllText($resolved)
        # A zero-byte file gives $null, and [xml]$null is $null rather than an
        # error - so without this the "not well-formed" catch never fires and the
        # next line dereferences nothing.
        if ([string]::IsNullOrWhiteSpace($raw)) { throw 'the file is empty' }
        $doc = [xml]$raw
    }
    catch {
        Write-Err "$fileName is not well-formed XML: $($_.Exception.Message)"
        continue
    }
    if (-not $doc -or -not $doc.DocumentElement -or $doc.DocumentElement.Name -ne 'AppLockerPolicy') {
        Write-Err "$fileName has no <AppLockerPolicy> root - is this an AppLocker export?"
        continue
    }

    $mode = Resolve-EnforcementMode -Document $doc -FileName $fileName -Explicit $Enforcement
    if (-not $mode) {
        Write-Err "Could not determine the enforcement mode for $fileName."
        Write-Info "The file mixes Enabled and AuditOnly collections and its name says neither. Pass -Enforcement Audit or -Enforcement Enforce."
        continue
    }

    $suffix = $null
    if ($NameSuffix) {
        if ($NameSuffix.Count -gt $index) { $suffix = $NameSuffix[$index] }
        elseif ($NameSuffix.Count -eq 1)  { $suffix = $NameSuffix[0] }
    }
    if (-not $suffix) {
        if ($NameSuffix) { Write-Note "-NameSuffix has fewer values than -XmlPath; '$fileName' falls back to a derived suffix." }
        $suffix = Get-DefaultSuffix -FileName $fileName -Mode $mode
    }

    $profileName = ('{0} {1}' -f $DisplayName.Trim(), $suffix.Trim()).Trim()

    $desc = $Description
    if (-not $desc) {
        $desc = "AppLocker $mode policy, converted from $fileName by TUNO Convert-TunoAppLockerToIntune.ps1 v$script:ScriptVersion on $((Get-Date).ToString('yyyy-MM-dd HH:mm'))."
    }

    $jobs.Add([pscustomobject]@{
        Path        = $resolved
        FileName    = $fileName
        Document    = $doc
        Mode        = $mode
        ProfileName = $profileName
        Description = $desc
    })
    Write-Ok ("{0,-8} <- {1}" -f $mode, $fileName)
    Write-Info ("           {0}" -f $profileName)
}

if ($jobs.Count -eq 0) {
    Write-Err 'Nothing to convert.'
    exit 1
}

# Two jobs resolving to the same profile name would overwrite each other's JSON
# offline, and create two identically-named profiles online. The usual cause is a
# single -NameSuffix applied to both the Audit and the Enforce export, where the
# derived (AuditOnly)/(Enforced) label was the only thing telling them apart.
$dupes = @($jobs | Group-Object -Property ProfileName | Where-Object { $_.Count -gt 1 })
if ($dupes.Count -gt 0) {
    foreach ($d in $dupes) {
        Write-Err ("{0} input files resolve to the same profile name '{1}'." -f $d.Count, $d.Name)
    }
    Write-Info 'Give one -NameSuffix per XML file, in order, so each profile is distinguishable.'
    exit 1
}

if (-not $EnforceDllCollection) {
    Write-Info ''
    Write-Note 'The DLL collection will be OMITTED from the profile - not marked NotConfigured, because a NotConfigured collection carrying rules is enforced. Pass -EnforceDllCollection to include it, and read the note in the help first.'
}

# ---- build ----
$built = New-Object System.Collections.Generic.List[object]
foreach ($job in $jobs) {
    try {
        $obj = New-IntuneCustomProfile -Document $job.Document -Mode $job.Mode `
            -ProfileName $job.ProfileName -GroupingValue $Grouping `
            -ProfileDescription $job.Description -AllowDllEnforcement:$EnforceDllCollection
        $json = $obj | ConvertTo-Json -Depth 10
        if (-not (Test-JsonText -Text $json)) { throw 'The generated JSON did not round-trip.' }
        $built.Add([pscustomobject]@{ Job = $job; Object = $obj; Json = $json })
    }
    catch {
        Write-Err ("Failed to build a profile from {0}: {1}" -f $job.FileName, $_.Exception.Message)
    }
}

if ($built.Count -eq 0) { Write-Err 'No profiles could be built.'; exit 1 }

# ══════════════════════════════════════════════════════════════════════════════
# OFFLINE
# ══════════════════════════════════════════════════════════════════════════════
if (-not $Online) {
    Write-Section 'Writing profile JSON'
    # Normalise WITHOUT touching the filesystem, so -WhatIf (which suppresses the
    # New-Item below, leaving Resolve-Path nothing to resolve) cannot turn into an
    # error. -WhatIf must never fail.
    $OutputPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine((Get-Location).Path, $OutputPath))
    if (-not (Test-Path -LiteralPath $OutputPath)) { New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null }

    $written = New-Object System.Collections.Generic.List[string]
    foreach ($b in $built) {
        $safe = ($b.Job.ProfileName -replace '[^A-Za-z0-9\-_.()]', '_') + '.json'
        $outFile = Join-Path $OutputPath $safe
        if ($PSCmdlet.ShouldProcess($outFile, 'Write Intune custom-profile JSON')) {
            [System.IO.File]::WriteAllText($outFile, $b.Json, (New-Object System.Text.UTF8Encoding($false)))
            Write-Ok ("{0,-8} -> {1}" -f $b.Job.Mode, $outFile)
            $written.Add($outFile)
        }
    }

    Write-Section 'Next'
    Write-Info 'Import a profile with Graph:'
    Write-Info ''
    Write-Info '    Connect-MgGraph -Scopes DeviceManagementConfiguration.ReadWrite.All'
    Write-Info '    $body = Get-Content .\<profile>.json -Raw'
    Write-Info '    Invoke-MgGraphRequest -Method POST -ContentType application/json `'
    Write-Info "        -Uri '$script:GraphUri' -Body `$body"
    Write-Info ''
    Write-Info 'Or re-run this script with -Online to have it do the POST for you.'
    Write-Info ''
    Write-Note 'Assign the AUDIT profile first, to a pilot group, and leave it there long enough'
    Write-Note 'to collect 8003/8006 events. Enforce is not a same-day decision.'
    Write-Host ''
    $written
    if ($script:Failures -gt 0) {
        Write-Host "  $script:Failures of $($XmlPath.Count) input file(s) failed. See the errors above." -ForegroundColor Red
        exit 1
    }
    return
}

# ══════════════════════════════════════════════════════════════════════════════
# ONLINE
# ══════════════════════════════════════════════════════════════════════════════
Write-Section 'Connecting to Microsoft Graph'
$ctx = Initialize-GraphSession -ExpectedTenantId $TenantId
Write-Info ("Tenant   : {0}" -f $ctx.TenantId)
if ($ctx.Account)  { Write-Info ("Account  : {0}" -f $ctx.Account) }
if ($ctx.ClientId) { Write-Info ("ClientId : {0}" -f $ctx.ClientId) }
if ($ctx.AuthType) { Write-Info ("AuthType : {0}" -f $ctx.AuthType) }

Write-Section 'Creating the custom profile(s)'
$created = New-Object System.Collections.Generic.List[object]
foreach ($b in $built) {
    if ($PSCmdlet.ShouldProcess($b.Job.ProfileName, 'Create AppLocker custom profile in Intune')) {
        try {
            Write-Info ("Creating '{0}' ({1}) ..." -f $b.Job.ProfileName, $b.Job.Mode)
            $result = New-IntuneProfileInTenant -Json $b.Json
            Write-Ok ("Created '{0}'" -f $b.Job.ProfileName)
            $created.Add($result)
        }
        catch {
            Write-Err ("Failed to create '{0}': {1}" -f $b.Job.ProfileName, $_.Exception.Message)
        }
    }
}

Write-Section 'Next'
Write-Info 'The profile(s) exist but are NOT assigned. Assign the audit profile to a pilot'
Write-Info 'group in the Intune portal, watch the AppLocker event logs, and only then'
Write-Info 'consider the enforced one.'
Write-Info ''
Write-Info 'The Graph session was left open for whatever you run next.'
Write-Host ''
$created
# Under -WhatIf nothing is created by design, so a short count is not a failure.
if ($script:Failures -gt 0 -or ((-not $WhatIfPreference) -and $created.Count -lt $built.Count)) {
    Write-Host ("  {0} of {1} profile(s) were created. See the errors above." -f $created.Count, $built.Count) -ForegroundColor Red
    exit 1
}
