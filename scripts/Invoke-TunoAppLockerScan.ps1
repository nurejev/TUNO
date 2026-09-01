#Requires -Version 5.1
<#
.SYNOPSIS
Scans a Windows device for AppLocker exposure, builds a publisher-first rule set from
what it finds, and writes a TUNO scan bundle that T01 (AppLocker builder & validator)
imports for analysis.

.DESCRIPTION
A modern, single-file reimplementation of the approach Microsoft's AaronLocker takes
(https://github.com/microsoft/AaronLocker), written for the TUNO workflow:

    scan the device  ->  upload the bundle to T01  ->  review and edit in the browser
                     ->  export  ->  deploy to Intune

RUN THIS ON A CLEAN REFERENCE MACHINE. NOT ON YOUR OWN LAPTOP.

That is not a nicety, it is the assumption the whole thing rests on. The policy it
generates says, in effect: "everything on this machine is allowed, and nothing else
is." On a freshly built image with your standard applications installed, that is a
sound baseline. On a device somebody has been working in for two years it allows
two years of accumulation - installers in Downloads, a dev toolchain, whatever a
colleague once ran from a zip - which is precisely the permission AppLocker was
deployed to take away.

The scan checks whether the machine looks clean and says so loudly if it does not.
It cannot refuse to run; it can refuse to be quiet.

THE MODEL THIS BUILDS

    Allowed : what is on the reference image, by publisher wherever possible
    Allowed : anything the Intune Management Extension delivers - the sanctioned
              install route, named explicitly in the policy rather than left to
              the Windows and Program Files defaults to cover by accident
    Allowed : anything a local administrator runs, because application control
              does not meaningfully restrict an administrator and pretending
              otherwise helps nobody
    Blocked : everything else, and in particular everything a standard user can
              write - their profile above all

WHAT IT DOES

  1. WRITABLE-DIRECTORY SCAN. Walks %WINDIR%, %ProgramFiles%, %ProgramFiles(x86)% and
     (optionally) %ProgramData% and user profiles, and reports every directory a
     NON-ADMINISTRATIVE principal can create files in. That is the whole AppLocker
     threat model in one sentence: a default rule that allows %PROGRAMFILES%\* is only
     as strong as the ACLs underneath it, and every writable subdirectory is a hole
     straight through it.

  2. ARTIFACT INVENTORY. For every executable, library, script, installer and packaged
     app inside those writable directories it records the Authenticode signer in
     AppLocker's own publisher form, the version-resource product and binary names, the
     file version and the SHA256 AppLocker hash.

  3. EVENT HARVEST. Reads the four AppLocker event logs and summarises what was blocked
     or would have been blocked, by publisher, path and user.

  4. RULE GENERATION. Turns all of that into an AppLocker policy: the Microsoft default
     rules with every writable directory injected as an exception, a deny-by-exception
     list for the well-known .NET and scripting LOLBins, and a publisher-first rule for
     each artifact found in a writable location, falling back to a hash rule only when
     the file is unsigned. Emits an Audit copy and an Enforce copy.

  5. BUNDLE. Writes one .json file carrying all of the above plus the generated policy
     and the machine's current effective policy. That single file is what you upload to
     T01. The two .xml files are written alongside it for GPO use.

HOW IT DIFFERS FROM AaronLocker

  * No AccessChk.exe. Write access is evaluated natively from the DACL, with Deny ACEs
    honoured (AaronLocker's ADS check sums rights across ACEs without looking at
    AccessControlType, so a Deny ACE there counts as a grant).
  * No Excel, no COM, no Out-GridView. Output is JSON and XML.
  * No dot-sourced configuration scripts executed with the call operator. Configuration
    is parameters and an optional JSON config file - data, not code.
  * Runs on Windows PowerShell 5.1 AND PowerShell 7+. AaronLocker hard-fails on
    anything that is not exactly 5.1.
  * Does not depend on the AppLocker cmdlets or the AppLocker policy-model assembly.
    They are used when present (they give the authoritative publisher string) and
    cleanly substituted when not; the bundle records which source was used per file so
    the tool never has to guess how much to trust a publisher name.
  * The publisher de-duplication key includes the collection, publisher, product AND
    binary. AaronLocker's key is assigned with "=" where "+=" was meant, so two
    different vendors shipping the same binary name collapse into one rule.

.PARAMETER OutputPath
Folder for the bundle and the two policy XML files. Defaults to the current directory.

.PARAMETER Scope
Which roots to scan. Any combination of:
  System        %WINDIR% (default)
  ProgramFiles  %ProgramFiles% and %ProgramFiles(x86)% (default)
  ProgramData   %ProgramData%
  UserProfiles  every profile under %SystemDrive%\Users
  Custom        the paths given to -Path
Default: System, ProgramFiles.

.PARAMETER Path
Extra directories to treat as unsafe and build rules for, regardless of their ACLs.
Use this for the locations you already know need rules - per-user application installs
such as %LOCALAPPDATA%\Microsoft\OneDrive or %LOCALAPPDATA%\Microsoft\Teams.

.PARAMETER KnownAdmin
Additional principals that are administrators in this environment, as names
("CONTOSO\Workstation-Admins") or SIDs. Write access granted to these is not treated
as a hole. The local Administrators group is resolved and excluded automatically.

.PARAMETER PublisherRuleGranularity
How specific the generated publisher rules are:
  Publisher            publisher only - broadest, fewest rules
  PublisherProduct     publisher + product
  PublisherProductBinary  publisher + product + binary name (default)
  PublisherProductBinaryVersion  the above plus a minimum version floor

.PARAMETER IncludeEvents
Read the AppLocker event logs and include the results in the bundle. On by default;
use -IncludeEvents:$false to skip.

.PARAMETER EventDaysBack
How far back to read AppLocker events. Default 30.

.PARAMETER MaxArtifacts
Safety cap on how many files are inventoried. Default 5000. When the cap is hit the
bundle records it as a warning rather than silently truncating.

.PARAMETER MaxEvents
Safety cap on AppLocker events read. Default 5000.

.PARAMETER DeepScan
By default the walk stops descending once a directory is found writable, because the
rule it produces ("<dir>\*") already covers everything beneath it. -DeepScan keeps
going and reports every writable directory individually. Slower, more precise evidence.

.PARAMETER SniffUnknownExtensions
Also PE-sniff files whose extension is not a known executable extension. Catches
renamed binaries; costs a header read per file.

.PARAMETER JSHashRules
Generate hash rules for unsigned .js files. Off by default - .js files churn, and the
rules go stale within days.

.PARAMETER SkipRuleGeneration
Collect evidence only. The bundle carries the scan results and the effective policy but
no generated policy, and no XML files are written. Use this when you intend to build the
rules in T01 instead.

.PARAMETER ConfigPath
Optional JSON configuration file. Every parameter above can be supplied as a property;
explicit parameters win. See the .EXAMPLE section for the shape.

.PARAMETER Quiet
Suppress progress output. Errors and warnings are still written.

.INPUTS
None.

.OUTPUTS
  <OutputPath>\TunoAppLockerScan-<COMPUTER>-<yyyyMMdd-HHmm>.json   <- upload this to T01
  <OutputPath>\AppLockerRules-Audit-<yyyyMMdd-HHmm>.xml
  <OutputPath>\AppLockerRules-Enforce-<yyyyMMdd-HHmm>.xml

.EXAMPLE
# The normal run. Elevated PowerShell, on a representative build of your standard image.
PS> .\Invoke-TunoAppLockerScan.ps1

.EXAMPLE
# Include ProgramData and the per-user application installs that always need rules.
PS> .\Invoke-TunoAppLockerScan.ps1 -Scope System,ProgramFiles,ProgramData `
        -Path "$env:LOCALAPPDATA\Microsoft\OneDrive","$env:LOCALAPPDATA\Microsoft\Teams"

.EXAMPLE
# Evidence only - let T01 build the rules.
PS> .\Invoke-TunoAppLockerScan.ps1 -SkipRuleGeneration -OutputPath C:\Temp\AppLocker

.EXAMPLE
# Driven from a config file:
#   {
#     "Scope": ["System","ProgramFiles","ProgramData"],
#     "Path": ["%LOCALAPPDATA%\\Microsoft\\OneDrive"],
#     "KnownAdmin": ["CONTOSO\\Workstation-Admins"],
#     "PublisherRuleGranularity": "PublisherProduct",
#     "EventDaysBack": 90
#   }
PS> .\Invoke-TunoAppLockerScan.ps1 -ConfigPath .\tuno-scan.json

.NOTES
Version    : 1.8.0
Part of    : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence    : MIT, same as the rest of TUNO
Requires   : Windows. Run ELEVATED - an unelevated run cannot read every DACL or the
             AppLocker event logs, and the bundle will say so rather than pretend.
Read-only  : This script changes NOTHING on the device. It does not apply a policy,
             does not touch the local GPO, and does not start the Application Identity
             service. Deploying the result is a separate, deliberate act.
Prior art  : Microsoft's AaronLocker by Aaron Margosis, whose scanning strategy this
             follows. The static check set T01 runs against the result comes from
             Spencer Alessi's AppLockerInspector.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$OutputPath = (Get-Location).Path,

    [Parameter()]
    [ValidateSet('System', 'ProgramFiles', 'ProgramData', 'UserProfiles', 'Custom')]
    [string[]]$Scope = @('System', 'ProgramFiles'),

    [Parameter()]
    [string[]]$Path,

    [Parameter()]
    [string[]]$KnownAdmin,

    [Parameter()]
    [ValidateSet('Publisher', 'PublisherProduct', 'PublisherProductBinary', 'PublisherProductBinaryVersion')]
    [string]$PublisherRuleGranularity = 'PublisherProductBinary',

    [Parameter()]
    [bool]$IncludeEvents = $true,

    [Parameter()]
    [ValidateRange(1, 3650)]
    [int]$EventDaysBack = 30,

    [Parameter()]
    [ValidateRange(1, 500000)]
    [int]$MaxArtifacts = 5000,

    [Parameter()]
    [ValidateRange(1, 500000)]
    [int]$MaxEvents = 5000,

    [Parameter()]
    [switch]$DeepScan,

    [Parameter()]
    [switch]$SniffUnknownExtensions,

    [Parameter()]
    [switch]$JSHashRules,

    [Parameter()]
    [switch]$SkipRuleGeneration,

    [Parameter()]
    [string]$ConfigPath,

    [Parameter()]
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# TWO NUMBERS, ON PURPOSE.
#
# ScriptVersion is this file's own history, for somebody holding a copy that has
# been sitting on a share for six months. TunoBuild is the site build that served
# it, which is what actually identifies the artifact - and it is asserted against
# js/version.js by a headless test, so the two cannot drift apart in a commit.
# They already did once: the script shipped two substantive changes still calling
# itself 1.0.0, and a bundle could not be traced back to the build that wrote it.
$script:ScriptVersion = '1.8.0'
$script:TunoBuild = 10541

# WHICH CHANNEL SERVED THIS COPY.
#
# Same convention as js/version.js: a build >= 10000 is a beta build. A beta copy
# of this script telling you to upload to production sends you to a different
# build of the tool - one that may not read the bundle this version writes. So
# the script works out where it came from rather than naming production and
# hoping.
$script:TunoIsBeta = $script:TunoBuild -ge 10000
$script:TunoSite = if ($script:TunoIsBeta) { 'https://nurejev.github.io/tuno-beta/' } else { 'https://tuno.limon-it.nl' }
$script:BundleSchema = 'tuno.applocker.scan/1'
$script:Warnings = New-Object System.Collections.Generic.List[string]
# How long ONE proxied Get-AppLockerFileInformation call may take before the
# per-file path gives up on the Windows PowerShell compatibility session. A
# native call is around a millisecond; anything near this is a proxy, and the
# scan makes one of these per file. A guess until measured on a real PS7 host.
$script:AppLockerProxyBudgetMs = 40

# ══════════════════════════════════════════════════════════════════════════════
# Output helpers
# ══════════════════════════════════════════════════════════════════════════════
function Write-Section {
    param([string]$Text)
    if ($Quiet) { return }
    Write-Host ''
    Write-Host ('─' * 72) -ForegroundColor DarkCyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ('─' * 72) -ForegroundColor DarkCyan
}
function Write-Info { param([string]$Text) if (-not $Quiet) { Write-Host "  $Text" -ForegroundColor Gray } }
function Write-Ok   { param([string]$Text) if (-not $Quiet) { Write-Host "  [ok]   $Text" -ForegroundColor Green } }
function Write-Note { param([string]$Text) if (-not $Quiet) { Write-Host "  [note] $Text" -ForegroundColor DarkYellow } }
function Add-ScanWarning {
    param([string]$Text)
    $script:Warnings.Add($Text)
    if (-not $Quiet) { Write-Host "  [warn] $Text" -ForegroundColor Yellow }
}

# ══════════════════════════════════════════════════════════════════════════════
# Configuration file
#
# Data, not code. AaronLocker's customisation surface is a folder of PowerShell
# scripts invoked with the call operator, which makes "edit the config" and
# "execute arbitrary code as whoever ran the scan" the same act.
# ══════════════════════════════════════════════════════════════════════════════
function Merge-ScanConfig {
    param(
        [string]$FilePath,
        [string[]]$BoundParameterName,
        [string[]]$ValidParameterName
    )
    if (-not $FilePath) { return }
    if (-not (Test-Path -LiteralPath $FilePath)) { throw "ConfigPath '$FilePath' does not exist." }

    $cfg = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $bound = @($BoundParameterName)

    # Check against the declared parameters, NOT "does a variable by this name
    # exist in the caller's scope" - the latter also matches inherited engine
    # variables, so a config file could set ErrorActionPreference and quietly
    # change how the script handles failure. Data, not code, has to mean it.
    $valid = @($ValidParameterName)

    foreach ($prop in $cfg.PSObject.Properties) {
        $name = $prop.Name
        # An explicitly supplied parameter always wins over the file.
        if ($bound -contains $name) { continue }
        # Accepted as a key so the "not a parameter" warning below stays true, but
        # meaningless in a config file: the file has already been read by now.
        if ($name -eq 'ConfigPath') { continue }
        if ($valid -notcontains $name) {
            Add-ScanWarning "Config file key '$name' is not a parameter of this script - ignored."
            continue
        }
        # The target variables still carry their ValidateSet/ValidateRange
        # attributes, which fire on assignment. That is the right behaviour, but
        # the raw ValidationMetadataException does not say a config file caused it.
        try { Set-Variable -Name $name -Value $prop.Value -Scope 1 }
        catch { throw "Config file key '$name' is not acceptable: $($_.Exception.Message)" }
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# Environment facts
# ══════════════════════════════════════════════════════════════════════════════
function Test-Elevated {
    try {
        $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $p = New-Object System.Security.Principal.WindowsPrincipal($id)
        return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch { return $false }
}

function Get-MachineFacts {
    $os = $null
    try { $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop } catch { }
    $cs = $null
    try { $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop } catch { }

    $appId = 'unknown'
    try {
        $svc = Get-Service -Name AppIDSvc -ErrorAction Stop
        $appId = "$($svc.Status) / $($svc.StartType)"
    }
    catch { $appId = 'not found' }

    $joined = 'unknown'
    try {
        $dsreg = & dsregcmd.exe /status 2>$null
        if ($dsreg -match 'AzureAdJoined\s*:\s*YES') { $joined = 'AzureAD joined' }
        elseif ($dsreg -match 'DomainJoined\s*:\s*YES') { $joined = 'Domain joined' }
        elseif ($dsreg -match 'WorkplaceJoined\s*:\s*YES') { $joined = 'Workplace joined' }
        else { $joined = 'Workgroup' }
    }
    catch {
        # $ErrorActionPreference = 'Stop' can promote redirected native stderr to
        # a terminating error. Say the join state is unknown rather than letting
        # the bundle carry a confident wrong answer.
        Add-ScanWarning "Could not determine the device's join state (dsregcmd): $($_.Exception.Message)"
    }

    $caption = 'unknown'
    $version = [string][System.Environment]::OSVersion.Version
    if ($os) { $caption = $os.Caption; $version = $os.Version }

    $domain = $env:USERDNSDOMAIN
    if ($cs) { $domain = $cs.Domain }

    $edition = 'Desktop'
    if ($PSVersionTable.PSObject.Properties.Name -contains 'PSEdition') { $edition = $PSVersionTable.PSEdition }

    $alSource = Initialize-AppLockerModule

    [pscustomobject]@{
        name               = $env:COMPUTERNAME
        os                 = $caption
        osVersion          = $version
        osBuild            = [int][System.Environment]::OSVersion.Version.Build
        domain             = $domain
        join               = $joined
        psVersion          = $PSVersionTable.PSVersion.ToString()
        psEdition          = $edition
        elevated           = (Test-Elevated)
        scannedBy          = "$env:USERDOMAIN\$env:USERNAME"
        appIdentityService = $appId
        appLockerCmdlets   = [bool](Get-Command -Name Get-AppLockerFileInformation -ErrorAction SilentlyContinue)
        appLockerSource    = $alSource
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# The AppLocker module on PowerShell 7
#
# THE MODULE IS WINDOWS POWERSHELL ONLY. It is a binary module built against
# the .NET Framework, so PowerShell 7 cannot load it in-process however it is
# asked; `Import-Module AppLocker` there fails, which is why a 7 session used
# to report "the AppLocker module is not available" and fall back to reading
# certificates itself.
#
# PowerShell 7 on Windows can still REACH it: -UseWindowsPowerShell starts a
# background Windows PowerShell session and proxies the cmdlets into this one.
# That is a real fix for the effective-policy read, which is a single call.
#
# IT IS NOT FREE, and the cost lands exactly where it hurts. Every proxied call
# is serialised across a process boundary, so Get-AppLockerFileInformation —
# which the scan makes ONCE PER FILE, across thousands of them — can go from
# imperceptible to minutes. So the import is attempted, and then a single call
# is TIMED: if it is slow, the per-file path stays on certificate derivation
# and the bundle says why. The one-shot policy read uses the proxy either way.
#
# NOT VERIFIED ON A REAL PS7 HOST. This was written and reviewed without a
# Windows machine to run it on; the timing threshold in particular is a guess
# that wants one real measurement.
# ══════════════════════════════════════════════════════════════════════════════
function Initialize-AppLockerModule {
    if (Get-Command -Name Get-AppLockerFileInformation -ErrorAction SilentlyContinue) { return 'native' }

    $isWindows = -not ($PSVersionTable.PSObject.Properties.Name -contains 'Platform') -or $PSVersionTable.Platform -eq 'Win32NT'
    if (-not $isWindows) { return 'unavailable' }
    if ($PSVersionTable.PSVersion.Major -lt 6) { return 'unavailable' }

    try {
        Import-Module AppLocker -UseWindowsPowerShell -ErrorAction Stop -WarningAction SilentlyContinue | Out-Null
    }
    catch {
        Add-ScanWarning "PowerShell $($PSVersionTable.PSVersion) cannot load the AppLocker module, and the Windows PowerShell compatibility import also failed: $($_.Exception.Message)"
        return 'unavailable'
    }
    if (-not (Get-Command -Name Get-AppLockerFileInformation -ErrorAction SilentlyContinue)) { return 'unavailable' }

    # One timed call decides whether the per-file path can afford the proxy.
    $probe = $null
    foreach ($c in @("$env:windir\System32\notepad.exe", "$env:windir\explorer.exe")) {
        if (Test-Path -LiteralPath $c) { $probe = $c; break }
    }
    if (-not $probe) { return 'compat-policy-only' }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try { Get-AppLockerFileInformation -Path $probe -ErrorAction Stop | Out-Null }
    catch { return 'compat-policy-only' }
    $sw.Stop()

    if ($sw.ElapsedMilliseconds -gt $script:AppLockerProxyBudgetMs) {
        Add-ScanWarning ("The AppLocker module is reachable from PowerShell $($PSVersionTable.PSVersion) only through the Windows PowerShell compatibility session, and a single call took {0} ms. Across every file in the scan that is hours, so publisher and hash details are being derived from certificates instead. The effective-policy read still uses it. Run this in Windows PowerShell 5.1 for the authoritative per-file values." -f $sw.ElapsedMilliseconds)
        return 'compat-policy-only'
    }
    return 'compat'
}

# ══════════════════════════════════════════════════════════════════════════════
# Principals
#
# The question the scan asks of every directory is: "can somebody who is NOT an
# administrator create a file here?" Everything below exists to answer the
# "NOT an administrator" half honestly.
# ══════════════════════════════════════════════════════════════════════════════

# Fixed, well-known principals whose write access is not a finding.
$script:TrustedSids = @(
    'S-1-5-18',        # LOCAL SYSTEM
    'S-1-5-19',        # LOCAL SERVICE
    'S-1-5-20',        # NETWORK SERVICE
    'S-1-5-6',         # SERVICE
    'S-1-3-0',         # CREATOR OWNER
    'S-1-3-1',         # CREATOR GROUP
    'S-1-5-32-544',    # Administrators
    'S-1-5-32-548',    # Account Operators
    'S-1-5-32-549',    # Server Operators
    'S-1-5-32-550',    # Print Operators
    'S-1-5-32-551',    # Backup Operators
    'S-1-5-32-559',    # Performance Log Users
    'S-1-5-32-568',    # IIS_IUSRS
    'S-1-5-32-577',    # RDS Management Servers
    'S-1-5-32-580'     # Remote Management Users
)

# SID families that are service, virtual or platform identities rather than users.
# S-1-5-80-*  NT SERVICE\*, including TrustedInstaller
# S-1-5-83-*  NT VIRTUAL MACHINE\*
# S-1-5-90-*  Window Manager
# S-1-5-94-*  WinRM virtual accounts
# S-1-5-96-*  Font driver host
# S-1-15-2-*  App container / package SIDs (see -IncludeAppContainerSids rationale
#             in the header: AaronLocker hard-codes two fontdrvhost package SIDs;
#             matching the whole family is the same idea without the magic numbers)
$script:TrustedSidPrefixes = @('S-1-5-80-', 'S-1-5-83-', 'S-1-5-90-', 'S-1-5-94-', 'S-1-5-96-', 'S-1-15-2-')

# Domain/local RIDs that mean "administrator" wherever the domain part lands.
$script:AdminRids = @(500, 512, 518, 519, 544)

function Resolve-PrincipalSid {
    param([string]$Principal)
    if (-not $Principal) { return $null }
    if ($Principal -match '^S-\d-\d+(-\d+)*$') { return $Principal }
    try {
        $nt = New-Object System.Security.Principal.NTAccount($Principal)
        return $nt.Translate([System.Security.Principal.SecurityIdentifier]).Value
    }
    catch {
        Add-ScanWarning "Could not resolve principal '$Principal' to a SID - it will not be treated as an administrator."
        return $null
    }
}

function Get-LocalAdministratorSid {
    <#
      Get-LocalGroupMember is the obvious answer and the one AaronLocker uses, but it
      throws on Entra-joined devices (it cannot translate S-1-12-1-* members) and on
      domain members that cannot reach a DC. Fall back to the WinNT provider, which
      hands back the raw SID bytes and never needs to resolve a name.
    #>
    $sids = New-Object System.Collections.Generic.List[string]
    $done = $false

    if (Get-Command -Name Get-LocalGroupMember -ErrorAction SilentlyContinue) {
        try {
            foreach ($m in (Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop)) {
                if ($m.SID -and $m.SID.Value) { $sids.Add($m.SID.Value) }
            }
            $done = $true
        }
        catch {
            Add-ScanWarning "Get-LocalGroupMember failed on the Administrators group ($($_.Exception.Message)). Falling back to the WinNT provider."
        }
    }

    if (-not $done) {
        try {
            $group = [ADSI]"WinNT://./Administrators,group"
            foreach ($member in @($group.Invoke('Members'))) {
                try {
                    $bytes = $member.GetType().InvokeMember('objectSid', 'GetProperty', $null, $member, $null)
                    $sid = New-Object System.Security.Principal.SecurityIdentifier($bytes, 0)
                    $sids.Add($sid.Value)
                }
                catch { }
            }
        }
        catch {
            Add-ScanWarning "Could not enumerate the local Administrators group by any method. Directories writable only by a local admin group member may be reported as holes."
        }
    }
    return $sids
}

function New-TrustedSidSet {
    param([string[]]$Extra)
    $set = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($s in $script:TrustedSids) { [void]$set.Add($s) }
    foreach ($s in (Get-LocalAdministratorSid)) { [void]$set.Add($s) }
    foreach ($p in @($Extra)) {
        $sid = Resolve-PrincipalSid -Principal $p
        if ($sid) { [void]$set.Add($sid) }
    }
    # ",$set" or the output stream enumerates the HashSet into a plain string[]
    # and the OrdinalIgnoreCase comparer is lost on the way out.
    return , $set
}

function Test-TrustedSid {
    param(
        [string]$Sid,
        [System.Collections.Generic.HashSet[string]]$TrustedSet
    )
    if (-not $Sid) { return $true }
    if ($TrustedSet.Contains($Sid)) { return $true }
    foreach ($prefix in $script:TrustedSidPrefixes) {
        if ($Sid.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    if ($Sid -match '^S-1-5-21-\d+-\d+-\d+-(\d+)$') {
        if ($script:AdminRids -contains [int]$Matches[1]) { return $true }
    }
    return $false
}

$script:SidNameCache = @{}
function Get-SidDisplayName {
    param([string]$Sid)
    # Guard first: Hashtable.ContainsKey($null) throws, and this is called once per
    # event with a TargetUser that may be absent.
    if ([string]::IsNullOrEmpty($Sid)) { return $null }
    if ($script:SidNameCache.ContainsKey($Sid)) { return $script:SidNameCache[$Sid] }
    $wellKnown = @{
        'S-1-1-0'      = 'Everyone'
        'S-1-5-11'     = 'Authenticated Users'
        'S-1-5-4'      = 'Interactive'
        'S-1-5-32-545' = 'BUILTIN\Users'
        'S-1-5-32-546' = 'BUILTIN\Guests'
        'S-1-5-13'     = 'Terminal Server User'
        'S-1-5-32-555' = 'BUILTIN\Remote Desktop Users'
    }
    $name = $Sid
    if ($wellKnown.ContainsKey($Sid)) { $name = $wellKnown[$Sid] }
    else {
        try {
            $s = New-Object System.Security.Principal.SecurityIdentifier($Sid)
            $name = $s.Translate([System.Security.Principal.NTAccount]).Value
        }
        catch { $name = $Sid }
    }
    # Cached: an LSA round-trip per event otherwise, and the answer never changes
    # within a run.
    $script:SidNameCache[$Sid] = $name
    return $name
}

# ══════════════════════════════════════════════════════════════════════════════
# The write-permission evaluation
#
# Rights that let a non-admin drop an executable into a directory:
#   CreateFiles (WriteData, 0x2) and CreateDirectories (AppendData, 0x4).
# Rights that let a non-admin GRANT ITSELF the above:
#   ChangePermissions (0x40000) and TakeOwnership (0x80000).
# Both are holes; the second is reported with its own reason so it can be judged
# separately rather than disappearing into the first.
#
# Deny beats Allow, per ACE, per SID. This is the check AaronLocker's
# HasWritableADS gets wrong: it ORs FileSystemRights across every matching ACE
# without inspecting AccessControlType, so an explicit Deny contributes rights.
# ══════════════════════════════════════════════════════════════════════════════
$script:RightsCreate = [int][System.Security.AccessControl.FileSystemRights]::CreateFiles -bor
                       [int][System.Security.AccessControl.FileSystemRights]::CreateDirectories
$script:RightsSeize  = [int][System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
                       [int][System.Security.AccessControl.FileSystemRights]::TakeOwnership

function Get-DirectoryWriteGrantee {
    <#
    .SYNOPSIS
        Returns the non-administrative principals that can write to $DirectoryPath,
        or an empty array. Returns $null when the DACL could not be read at all.
    #>
    param(
        [Parameter(Mandatory)] [string]$DirectoryPath,
        [Parameter(Mandatory)] [System.Collections.Generic.HashSet[string]]$TrustedSet
    )

    $acl = $null
    try {
        $acl = New-Object System.Security.AccessControl.DirectorySecurity(
            $DirectoryPath, [System.Security.AccessControl.AccessControlSections]::Access)
    }
    catch { return $null }

    # Accumulate allow and deny masks per SID first, then subtract. An ACE that is
    # InheritOnly does not apply to this directory object and is skipped.
    $allow = @{}
    $deny = @{}
    $inheritOnly = [System.Security.AccessControl.PropagationFlags]::InheritOnly

    # GetAccessRules(..., [SecurityIdentifier]) rather than the .Access property.
    # .Access is a PowerShell CodeProperty that always resolves identities to
    # NTAccount, which costs an LSA lookup per ACE on the way out and another on
    # the way back - and an ACE for a deleted account cannot be translated back
    # at all, so it would be dropped silently. An orphaned SID with write access
    # is exactly the finding this function exists to produce.
    $rules = @()
    try { $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) }
    catch { return $null }

    # A NULL DACL grants everyone full control, and surfaces here as zero rules.
    # Reporting that as "not writable" is a false negative in the one direction
    # that matters.
    if ($rules.Count -eq 0) {
        return , @([pscustomobject]@{
            sid    = 'S-1-1-0'
            name   = 'Everyone'
            reason = 'the directory has a null or empty DACL - access is unrestricted'
        })
    }

    foreach ($ace in $rules) {
        if (($ace.PropagationFlags -band $inheritOnly) -ne 0) { continue }
        $sid = [string]$ace.IdentityReference.Value
        if (-not $sid) { continue }

        $mask = [int]$ace.FileSystemRights
        if ($ace.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Deny) {
            if ($deny.ContainsKey($sid)) { $deny[$sid] = $deny[$sid] -bor $mask } else { $deny[$sid] = $mask }
        }
        else {
            if ($allow.ContainsKey($sid)) { $allow[$sid] = $allow[$sid] -bor $mask } else { $allow[$sid] = $mask }
        }
    }

    $grantees = New-Object System.Collections.Generic.List[object]
    foreach ($sid in $allow.Keys) {
        if (Test-TrustedSid -Sid $sid -TrustedSet $TrustedSet) { continue }

        $effective = $allow[$sid]
        if ($deny.ContainsKey($sid)) { $effective = $effective -band (-bnot $deny[$sid]) }

        $reasons = New-Object System.Collections.Generic.List[string]
        if (($effective -band $script:RightsCreate) -ne 0) { $reasons.Add('can create files') }
        if (($effective -band $script:RightsSeize) -ne 0) { $reasons.Add('can take ownership or change permissions') }
        if ($reasons.Count -eq 0) { continue }

        $grantees.Add([pscustomobject]@{
            sid    = $sid
            name   = (Get-SidDisplayName -Sid $sid)
            reason = ($reasons -join '; ')
        })
    }
    return , $grantees.ToArray()
}

# ══════════════════════════════════════════════════════════════════════════════
# The directory walk
# ══════════════════════════════════════════════════════════════════════════════
# Win32 long-path form. Windows PowerShell 5.1 runs on .NET Framework, where
# almost every path API still enforces MAX_PATH (260) unless the path is given
# in \\?\ form - and a PathTooLongException in the walk below took the whole
# SUBTREE with it, because the throw happens on the parent's GetDirectories.
# Deep trees under ProgramData and AppData are exactly where droppable
# directories live, so this was not a rare edge: it was a silent hole in the
# middle of the most interesting part of the disk.
#
# PowerShell 7 on .NET Core does not need this, but the prefix is harmless
# there, so there is one code path rather than two.
function ConvertTo-LongPath {
    param([string]$Path)
    if ([string]::IsNullOrEmpty($Path)) { return $Path }
    if ($Path.StartsWith('\\?\')) { return $Path }
    if ($Path.StartsWith('\\'))    { return '\\?\UNC\' + $Path.Substring(2) }
    if ($Path -match '^[A-Za-z]:\\')  { return '\\?\' + $Path }
    return $Path
}
# Only for display and for the rules: a \\?\ prefix in a policy is wrong.
function ConvertFrom-LongPath {
    param([string]$Path)
    if ([string]::IsNullOrEmpty($Path)) { return $Path }
    if ($Path.StartsWith('\\?\UNC\')) { return '\\' + $Path.Substring(8) }
    if ($Path.StartsWith('\\?\'))      { return $Path.Substring(4) }
    return $Path
}

function Get-WritableDirectory {
    param(
        [Parameter(Mandatory)] [string]$Root,
        [Parameter(Mandatory)] [System.Collections.Generic.HashSet[string]]$TrustedSet,
        [switch]$Deep
    )

    $results = New-Object System.Collections.Generic.List[object]
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return , $results.ToArray() }

    # Counted apart, because they mean different things and the fix differs.
    # Lumping them into one number was hiding the long-path failures behind the
    # access-denied ones, which have an obvious cause and an obvious remedy.
    $unreadableAcl = 0     # DACL could not be read
    $unreadableDir = 0     # children could not be listed
    $tooLong = 0           # MAX_PATH, even in \\?\ form
    $skippedAttr = 0       # attributes unreadable, so reparse status unknown
    $reparse = 0           # deliberately not followed
    $visited = 0
    $stack = New-Object System.Collections.Generic.Stack[string]
    $stack.Push($Root)

    while ($stack.Count -gt 0) {
        $dir = $stack.Pop()
        $visited++

        if (-not $Quiet -and ($visited % 500) -eq 0) {
            Write-Progress -Activity "Scanning $Root" -Status "$visited directories, $($results.Count) writable" -Id 1
        }

        $grantees = Get-DirectoryWriteGrantee -DirectoryPath (ConvertTo-LongPath $dir) -TrustedSet $TrustedSet
        if ($null -eq $grantees) { $unreadableAcl++ }
        elseif ($grantees.Count -gt 0) {
            $results.Add([pscustomobject]@{
                path     = (ConvertFrom-LongPath $dir)
                grantees = $grantees
            })
            # The rule this produces is "<dir>\*", which already covers everything
            # below. Descending further only lengthens the evidence list.
            if (-not $Deep) { continue }
        }

        # GetDirectories, not EnumerateDirectories. The lazy enumerator throws
        # mid-foreach on the first unreadable child and abandons every sibling
        # after it - silently skipping whole subtrees while incrementing the
        # unreadable counter exactly once. The eager call fails as one directory.
        #
        # The \\?\ form is what lets this get past MAX_PATH on 5.1 at all. A
        # PathTooLongException here does not skip one directory, it skips the
        # entire subtree beneath it - so it is counted separately and named in
        # its own warning rather than folded into "could not be read".
        $subs = @()
        try { $subs = [System.IO.Directory]::GetDirectories((ConvertTo-LongPath $dir)) }
        catch [System.IO.PathTooLongException] { $tooLong++ }
        catch { $unreadableDir++ }

        foreach ($sub in $subs) {
            try {
                $attr = [System.IO.File]::GetAttributes($sub)
            }
            catch {
                # Attributes unreadable means reparse status UNKNOWN. Skipping
                # was right; skipping silently was not - an unknown is a hole
                # the report has to admit to rather than quietly drop.
                $skippedAttr++
                continue
            }
            if (($attr -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { $reparse++; continue }
            $stack.Push($sub)
        }
    }

    if (-not $Quiet) { Write-Progress -Activity "Scanning $Root" -Completed -Id 1 }
    if ($unreadableAcl -gt 0 -or $unreadableDir -gt 0) {
        $unreadable = $unreadableAcl + $unreadableDir
        Add-ScanWarning "$unreadable director$(if ($unreadable -eq 1) { 'y' } else { 'ies' }) under $Root could not be read ($unreadableAcl permission read failed, $unreadableDir listing failed). Run elevated for a complete picture."
    }
    # These three were silent before. Each is a place the scan did NOT look, and
    # a rule set built from an incomplete walk reads exactly like one built from
    # a complete walk - which is the failure this whole tool exists to prevent.
    if ($tooLong -gt 0) {
        Add-ScanWarning "$tooLong director$(if ($tooLong -eq 1) { 'y' } else { 'ies' }) under $Root exceeded the maximum path length even in extended form, and EVERYTHING BENEATH THEM WAS SKIPPED. This is not one missed directory each; it is a missed subtree each."
    }
    if ($skippedAttr -gt 0) {
        Add-ScanWarning "$skippedAttr director$(if ($skippedAttr -eq 1) { 'y' } else { 'ies' }) under $Root could not have their attributes read, so whether they are reparse points is unknown and they were not walked."
    }
    Write-Info ("{0,-6} writable of {1} directories under {2}{3}" -f $results.Count, $visited, $Root,
        $(if ($reparse -gt 0) { " ($reparse reparse point(s) not followed)" } else { '' }))
    return , $results.ToArray()
}

# ══════════════════════════════════════════════════════════════════════════════
# Path normalisation to AppLocker macros
#
# %SYSTEM32% covers System32 AND SysWOW64; %PROGRAMFILES% covers both Program
# Files trees. Normalising to the macro is what makes a rule built on an x64 box
# also correct on an x86 one.
# ══════════════════════════════════════════════════════════════════════════════
function ConvertTo-AppLockerPath {
    param([Parameter(Mandatory)] [string]$LiteralPath)

    $p = $LiteralPath.TrimEnd('\')
    $map = @(
        @{ prefix = (Join-Path $env:windir 'System32'); macro = '%SYSTEM32%' }
        @{ prefix = (Join-Path $env:windir 'SysWOW64'); macro = '%SYSTEM32%' }
        @{ prefix = $env:windir;                        macro = '%WINDIR%' }
    )
    if ($env:ProgramFiles) { $map += @{ prefix = $env:ProgramFiles; macro = '%PROGRAMFILES%' } }
    $pf86 = ${env:ProgramFiles(x86)}
    if ($pf86) { $map += @{ prefix = $pf86; macro = '%PROGRAMFILES%' } }

    foreach ($m in $map) {
        $prefix = $m.prefix.TrimEnd('\')
        if ($p.Equals($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { return $m.macro }
        if ($p.StartsWith($prefix + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            return $m.macro + $p.Substring($prefix.Length)
        }
    }

    $sysDrive = $env:SystemDrive
    if ($sysDrive -and $p.StartsWith($sysDrive + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        return '%OSDRIVE%' + $p.Substring($sysDrive.Length)
    }
    return $p
}

function Compress-PathList {
    <#
    .SYNOPSIS
        Drop any path already covered by a shorter one in the same list and return
        the survivors, sorted. Callers that want AppLocker exception PATTERNS append
        the "\*" themselves - the compressed list is also used as a plain list of
        directories to inventory, where the suffix would be wrong.
    #>
    param([string[]]$Paths)

    $sorted = @($Paths | Sort-Object -Property { $_.Length }, { $_ }) | Where-Object { $_ }
    $kept = New-Object System.Collections.Generic.List[string]
    foreach ($p in $sorted) {
        $covered = $false
        foreach ($k in $kept) {
            if ($p.Equals($k, [System.StringComparison]::OrdinalIgnoreCase) -or
                $p.StartsWith($k.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
                $covered = $true
                break
            }
        }
        if (-not $covered) { $kept.Add($p) }
    }
    # Deliberately NOT "return ,$array" - the caller pipes this, and the pipeline
    # would unroll the wrapper and hand ForEach-Object the whole array as one
    # object, joining every path into a single space-separated string.
    return @($kept | Sort-Object)
}

# ══════════════════════════════════════════════════════════════════════════════
# File facts - collection, signer, version resource, hash
# ══════════════════════════════════════════════════════════════════════════════
$script:CollectionByExtension = @{
    '.exe'  = 'Exe';    '.com'  = 'Exe'
    '.dll'  = 'Dll';    '.ocx'  = 'Dll'
    '.ps1'  = 'Script'; '.bat'  = 'Script'; '.cmd' = 'Script'
    '.vbs'  = 'Script'; '.js'   = 'Script'; '.wsf' = 'Script'; '.wsh' = 'Script'
    '.msi'  = 'Msi';    '.msp'  = 'Msi';    '.mst' = 'Msi'
    '.appx' = 'Appx';   '.msix' = 'Appx'
}

function Test-PortableExecutable {
    <#
      A renamed binary still runs. Read the DOS header, follow e_lfanew, check the
      PE signature. One 4-byte read at two offsets - AaronLocker's IsWin32Executable
      reads the whole prefix into a PowerShell object array, twice per file, using
      Get-Content -Encoding Byte, which PowerShell 7 removed anyway.
    #>
    param([string]$FilePath)
    $fs = $null
    try {
        $fs = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open,
                                     [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        if ($fs.Length -lt 512) { return $false }
        $br = New-Object System.IO.BinaryReader($fs)
        if ($br.ReadUInt16() -ne 0x5A4D) { return $false }      # 'MZ'
        [void]$fs.Seek(0x3C, [System.IO.SeekOrigin]::Begin)
        $peOffset = $br.ReadInt32()
        if ($peOffset -le 0 -or $peOffset -gt ($fs.Length - 4)) { return $false }
        [void]$fs.Seek($peOffset, [System.IO.SeekOrigin]::Begin)
        return ($br.ReadUInt32() -eq 0x00004550)                 # 'PE\0\0'
    }
    catch { return $false }
    finally { if ($fs) { $fs.Dispose() } }
}

function ConvertTo-AppLockerPublisherName {
    <#
    .SYNOPSIS
        Derive AppLocker's publisher string from a certificate subject.
    .DESCRIPTION
        AppLocker names a publisher by the signing certificate's organisational
        fields - O, L, S, C - uppercased, in that order, with the CN dropped:
            CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US
                -> O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US
        This is the FALLBACK. Get-AppLockerFileInformation is authoritative and is
        preferred whenever the AppLocker module is present; the bundle records which
        of the two produced each name so a derived one can be treated with the
        suspicion it deserves.
    #>
    param([string]$Subject)
    if (-not $Subject) { return $null }

    $fields = [ordered]@{ O = $null; L = $null; S = $null; C = $null }
    # Split on commas that are not inside quotes and not escaped.
    foreach ($part in ([regex]::Split($Subject, ',(?=(?:[^"]*"[^"]*")*[^"]*$)'))) {
        $kv = $part.Trim()
        $eq = $kv.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $kv.Substring(0, $eq).Trim().ToUpperInvariant()
        $val = $kv.Substring($eq + 1).Trim().Trim('"')
        if ($key -eq 'ST') { $key = 'S' }
        if ($fields.Contains($key) -and -not $fields[$key]) { $fields[$key] = $val }
    }

    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($k in @('O', 'L', 'S', 'C')) {
        if ($fields[$k]) { $parts.Add("$k=$($fields[$k].ToUpperInvariant())") }
    }
    if ($parts.Count -eq 0) { return $null }
    return ($parts -join ', ')
}

function Get-FileFacts {
    param(
        [Parameter(Mandatory)] [System.IO.FileInfo]$File,
        [Parameter(Mandatory)] [string]$Collection,
        [bool]$UseAppLockerCmdlets
    )

    $publisherName = $null; $productName = $null; $binaryName = $null
    $fileVersion = $null;   $publisherSource = 'none'; $hash = $null; $hashSource = 'none'

    if ($UseAppLockerCmdlets) {
        try {
            $alfi = Get-AppLockerFileInformation -Path $File.FullName -ErrorAction Stop
            if ($alfi.Publisher -and $alfi.Publisher.PublisherName) {
                $publisherName   = $alfi.Publisher.PublisherName
                $productName     = $alfi.Publisher.ProductName
                $binaryName      = $alfi.Publisher.BinaryName
                $fileVersion     = [string]$alfi.Publisher.BinaryVersion
                $publisherSource = 'Get-AppLockerFileInformation'
            }
            if ($alfi.Hash -and $alfi.Hash.HashDataString) {
                $hash = $alfi.Hash.HashDataString
                $hashSource = 'Get-AppLockerFileInformation'
            }
        }
        catch { }
    }

    if (-not $publisherName) {
        try {
            $sig = Get-AuthenticodeSignature -LiteralPath $File.FullName -ErrorAction Stop
            if ($sig.Status -eq 'Valid' -and $sig.SignerCertificate) {
                $publisherName = ConvertTo-AppLockerPublisherName -Subject $sig.SignerCertificate.Subject
                if ($publisherName) { $publisherSource = 'certificate subject (derived)' }
            }
        }
        catch { }
    }

    if ($publisherName -and (-not $productName -or -not $binaryName -or -not $fileVersion)) {
        try {
            $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($File.FullName)
            if (-not $productName -and $vi.ProductName) { $productName = $vi.ProductName.Trim().ToUpperInvariant() }
            if (-not $binaryName) {
                $orig = if ($vi.OriginalFilename) { $vi.OriginalFilename } else { $File.Name }
                $binaryName = $orig.Trim().ToUpperInvariant()
            }
            if (-not $fileVersion) {
                $fileVersion = ('{0}.{1}.{2}.{3}' -f $vi.FileMajorPart, $vi.FileMinorPart, $vi.FileBuildPart, $vi.FilePrivatePart)
            }
        }
        catch { }
    }

    # AppLocker's hash for a PE file or an installer is the SHA256 AUTHENTICODE
    # hash, which omits the file checksum and the certificate tables. Get-FileHash
    # returns the flat-file hash, which for those types is a different number, and
    # a hash rule built from it matches nothing while looking perfectly correct.
    # So the flat hash is recorded as evidence but tagged, and New-ArtifactRuleSet
    # refuses to build a PE hash rule from it. For script collections the two are
    # the same value and the flat hash is authoritative.
    if (-not $hash) {
        try {
            $hash = '0x' + (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256 -ErrorAction Stop).Hash
            $hashSource = 'flat SHA256'
        }
        catch { }
    }

    $publisherBlock = $null
    if ($publisherName) {
        if (-not $productName) { $productName = '*' }
        if (-not $binaryName)  { $binaryName = '*' }
        if (-not $fileVersion) { $fileVersion = '*' }
        $publisherBlock = [pscustomobject]@{
            name    = $publisherName
            product = $productName
            binary  = $binaryName
            version = $fileVersion
        }
    }

    [pscustomobject]@{
        path            = $File.FullName
        normalizedPath  = (ConvertTo-AppLockerPath -LiteralPath $File.FullName)
        name            = $File.Name
        extension       = $File.Extension.ToLowerInvariant()
        collection      = $Collection
        sizeBytes       = [int64]$File.Length
        modifiedUtc     = $File.LastWriteTimeUtc.ToString('o')
        signed          = [bool]$publisherName
        publisherSource = $publisherSource
        publisher       = $publisherBlock
        hash            = $hash
        hashSource      = $hashSource
    }
}

# Collections whose AppLocker hash is the Authenticode hash rather than the flat
# file hash. Script files are hashed flat, so Get-FileHash is correct for them.
$script:AuthenticodeHashedCollections = @('Exe', 'Dll', 'Msi', 'Appx')

function Get-ArtifactInventory {
    param(
        [Parameter(Mandatory)] [AllowEmptyCollection()] [string[]]$Directories,
        [Parameter(Mandatory)] [int]$Limit,
        [bool]$UseAppLockerCmdlets,
        [switch]$Sniff
    )

    $artifacts = New-Object System.Collections.Generic.List[object]
    $seen = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
    $truncated = $false
    $unreadableDirs = 0
    $n = 0

    foreach ($dir in $Directories) {
        if ($truncated) { break }
        if (-not (Test-Path -LiteralPath $dir -PathType Container)) { continue }

        # SilentlyContinue hides access-denied and path-too-long across the whole
        # recursive walk. Keep it - one unreadable subfolder must not abort the
        # directory - but COUNT what was hidden, so a quietly incomplete rule set
        # cannot read as a complete one.
        $files = @()
        $walkErrors = $null
        try {
            $files = Get-ChildItem -LiteralPath $dir -File -Recurse -Force -ErrorAction SilentlyContinue -ErrorVariable walkErrors
        }
        catch { $unreadableDirs++; continue }
        if ($walkErrors) { $unreadableDirs += @($walkErrors).Count }

        foreach ($f in $files) {
            if ($artifacts.Count -ge $Limit) { $truncated = $true; break }
            if (-not $seen.Add($f.FullName)) { continue }

            $ext = $f.Extension.ToLowerInvariant()
            $collection = $null
            if ($script:CollectionByExtension.ContainsKey($ext)) {
                $collection = $script:CollectionByExtension[$ext]
            }
            elseif ($Sniff -and $f.Length -ge 512) {
                if (Test-PortableExecutable -FilePath $f.FullName) { $collection = 'Exe' }
            }
            if (-not $collection) { continue }

            $n++
            if (-not $Quiet -and ($n % 100) -eq 0) {
                Write-Progress -Activity 'Inventorying executables' -Status "$n examined, $($artifacts.Count) recorded" -Id 2
            }
            $artifacts.Add((Get-FileFacts -File $f -Collection $collection -UseAppLockerCmdlets $UseAppLockerCmdlets))
        }
    }

    if (-not $Quiet) { Write-Progress -Activity 'Inventorying executables' -Completed -Id 2 }
    if ($truncated) {
        Add-ScanWarning "Artifact inventory stopped at the -MaxArtifacts cap of $Limit. The generated rule set covers only what was inventoried - raise the cap or narrow the scope."
    }
    if ($unreadableDirs -gt 0) {
        Add-ScanWarning "$unreadableDirs path(s) could not be read while inventorying executables (access denied, or a path over 260 characters on Windows PowerShell 5.1). Files there have no rule, and the policy is incomplete by that much."
    }
    return , $artifacts.ToArray()
}

# ══════════════════════════════════════════════════════════════════════════════
# AppLocker event logs
# ══════════════════════════════════════════════════════════════════════════════
$script:EventLogs = @(
    'Microsoft-Windows-AppLocker/EXE and DLL',
    'Microsoft-Windows-AppLocker/MSI and Script',
    'Microsoft-Windows-AppLocker/Packaged app-Execution',
    'Microsoft-Windows-AppLocker/Packaged app-Deployment'
)
# 8002/8005/8020 allowed · 8003/8006/8021 audited (would have been blocked) · 8004/8007/8022 blocked
$script:EventVerdict = @{
    8002 = 'Allowed'; 8005 = 'Allowed'; 8020 = 'Allowed'
    8003 = 'Audited'; 8006 = 'Audited'; 8021 = 'Audited'
    8004 = 'Blocked'; 8007 = 'Blocked'; 8022 = 'Blocked'
}

function Get-AppLockerEventData {
    param(
        [int]$DaysBack,
        [int]$Limit
    )

    $since = (Get-Date).AddDays(-$DaysBack)
    $entries = New-Object System.Collections.Generic.List[object]
    $logsRead = New-Object System.Collections.Generic.List[string]
    $anyLog = $false

    $truncated = $false
    foreach ($log in $script:EventLogs) {
        # Budget the cap ACROSS the logs, not per log: asking each of the four for
        # $Limit means the first can spend the whole allowance and the rest get
        # read off the wire only to be discarded.
        $remaining = $Limit - $entries.Count
        if ($remaining -le 0) { $truncated = $true; break }

        $events = @()
        try {
            $events = @(Get-WinEvent -FilterHashtable @{
                LogName   = $log
                Id        = @($script:EventVerdict.Keys)
                StartTime = $since
            } -MaxEvents $remaining -ErrorAction Stop)
            if ($events.Count -ge $remaining) { $truncated = $true }
            $anyLog = $true
            $logsRead.Add($log)
        }
        catch {
            # "No events were found" is the normal case on a machine with no
            # policy. Branch on the error id, not the message text: the message
            # is localised, and on a non-English Windows a healthy empty log
            # would otherwise be reported as an unreadable one.
            if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') {
                $anyLog = $true
                $logsRead.Add($log)
            }
            else {
                Add-ScanWarning "Could not read '$log': $($_.Exception.Message)"
            }
            continue
        }

        foreach ($e in $events) {
            if ($entries.Count -ge $Limit) { $truncated = $true; break }
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
            $entries.Add([pscustomobject]@{
                timeUtc    = $e.TimeCreated.ToUniversalTime().ToString('o')
                log        = $log
                eventId    = [int]$e.Id
                verdict    = $script:EventVerdict[[int]$e.Id]
                policyName = (& $get $rfd 'PolicyName')
                path       = $filePath
                publisher  = $pubName
                product    = $prodName
                binary     = $binName
                version    = $binVer
                signed     = [bool]($pubName -and $pubName -ne '-')
                hash       = (& $get $rfd 'FileHash')
                userSid    = $userSid
                userName   = (Get-SidDisplayName -Sid $userSid)
            })
        }
    }

    if ($truncated) {
        Add-ScanWarning "AppLocker event collection stopped at the -MaxEvents cap of $Limit. The event counts below are a floor, not a total - raise the cap or shorten -EventDaysBack before treating them as complete."
    }

    $blocked = @($entries | Where-Object { $_.verdict -eq 'Blocked' })
    $audited = @($entries | Where-Object { $_.verdict -eq 'Audited' })

    [pscustomobject]@{
        available = $anyLog
        logsRead  = $logsRead.ToArray()
        daysBack  = $DaysBack
        sinceUtc  = $since.ToUniversalTime().ToString('o')
        summary   = [pscustomobject]@{
            total          = $entries.Count
            blocked        = $blocked.Count
            audited        = $audited.Count
            allowed        = @($entries | Where-Object { $_.verdict -eq 'Allowed' }).Count
            # Sort-Object -Unique, not Select-Object -Unique: the latter is
            # case-sensitive on 5.1 and on 7.0-7.3, which inflates both counts
            # whenever the same path is logged with different casing.
            distinctPaths  = @($entries | Where-Object { $_.path } | Select-Object -ExpandProperty path | Sort-Object -Unique).Count
            distinctUsers  = @($entries | Where-Object { $_.userSid } | Select-Object -ExpandProperty userSid | Sort-Object -Unique).Count
            unsignedDenied = @(($blocked + $audited) | Where-Object { -not $_.signed }).Count
        }
        entries   = $entries.ToArray()
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# Effective policy
# ══════════════════════════════════════════════════════════════════════════════
function Get-EffectivePolicyXml {
    if (-not (Get-Command -Name Get-AppLockerPolicy -ErrorAction SilentlyContinue)) {
        return [pscustomobject]@{ available = $false; reason = 'The AppLocker module is not available in this PowerShell session.'; xml = $null }
    }
    try {
        $xml = Get-AppLockerPolicy -Effective -Xml -ErrorAction Stop
        return [pscustomobject]@{ available = $true; reason = $null; xml = [string]$xml }
    }
    catch {
        return [pscustomobject]@{ available = $false; reason = $_.Exception.Message; xml = $null }
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# Rule construction
# ══════════════════════════════════════════════════════════════════════════════
$script:SidEveryone = 'S-1-1-0'
$script:SidAdmins   = 'S-1-5-32-544'

# Well-known Microsoft-signed binaries that execute arbitrary code and therefore
# undo a path-based allow of %WINDIR%. Carried as EXCEPTIONS inside the Everyone
# allow rule rather than as Deny rules, so administrators keep them: a Deny rule
# in AppLocker beats every allow, including the admin one.
$script:LolBinPatterns = @(
    '%WINDIR%\Microsoft.NET\*\InstallUtil.exe'
    '%WINDIR%\Microsoft.NET\*\*\InstallUtil.exe'
    '%WINDIR%\Microsoft.NET\*\IEExec.exe'
    '%WINDIR%\Microsoft.NET\*\*\IEExec.exe'
    '%WINDIR%\Microsoft.NET\*\RegAsm.exe'
    '%WINDIR%\Microsoft.NET\*\*\RegAsm.exe'
    '%WINDIR%\Microsoft.NET\*\RegSvcs.exe'
    '%WINDIR%\Microsoft.NET\*\*\RegSvcs.exe'
    '%WINDIR%\Microsoft.NET\*\MSBuild.exe'
    '%WINDIR%\Microsoft.NET\*\*\MSBuild.exe'
    '%WINDIR%\Microsoft.NET\*\Microsoft.Workflow.Compiler.exe'
    '%WINDIR%\Microsoft.NET\*\*\Microsoft.Workflow.Compiler.exe'
    '%SYSTEM32%\mshta.exe'
    '%SYSTEM32%\PresentationHost.exe'
    '%SYSTEM32%\wbem\WMIC.exe'
    '%SYSTEM32%\cipher.exe'
    '%SYSTEM32%\runas.exe'
    '%SYSTEM32%\bash.exe'
    '%SYSTEM32%\wsl.exe'
)

# The Intune Management Extension stages and executes on the endpoint's behalf.
# If any of these is excepted out of the default %WINDIR% / %PROGRAMFILES% allow
# rules, Win32 app delivery, remediation scripts and PowerShell script policies
# stop working - and they stop working silently, on managed devices, days later.
#
# On an estate where software may only arrive through Intune, breaking IME does
# not fail safe. It fails to "nothing can be installed and nobody knows why".
$script:ImeProtectedPaths = @(
    "$env:windir\IMECache"
    "$env:windir\CCM\ServiceData"
    "${env:ProgramFiles(x86)}\Microsoft Intune Management Extension"
    "$env:ProgramFiles\Microsoft Intune Management Extension"
    "$env:ProgramData\Microsoft\IntuneManagementExtension"
)

function Test-ReferenceMachine {
    <#
    .SYNOPSIS
        Does this look like a clean reference image, or somebody's working laptop?
    .DESCRIPTION
        THE SCAN'S CENTRAL ASSUMPTION. Every rule it generates for a user profile
        is generated because the profile is user-writable and something executable
        is sitting in it. On a freshly built reference image that something is the
        image's own per-user applications, and a rule for it is correct. On a
        machine somebody has been working on for two years it is browser caches,
        installers in Downloads, dev toolchains and whatever a colleague once ran
        from a zip - and generating allow rules for THAT hands back exactly the
        permission AppLocker was deployed to remove.

        The script cannot refuse to run on the wrong machine; it can refuse to be
        quiet about it. This returns the evidence either way and the caller warns.
    #>
    param(
        [Parameter(Mandatory)] [AllowEmptyCollection()] [object[]]$Artifacts,
        [Parameter(Mandatory)] [AllowEmptyCollection()] [string[]]$ProfileRoots
    )

    $reasons = New-Object System.Collections.Generic.List[string]
    $profileArtifacts = @($Artifacts | Where-Object {
        $p = $_.path
        $hit = $false
        foreach ($r in $ProfileRoots) {
            if ($r -and $p.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) { $hit = $true; break }
        }
        $hit
    })

    if ($ProfileRoots.Count -gt 1) {
        $reasons.Add("$($ProfileRoots.Count) user profiles exist on this device. A reference image has one, and usually none that has been logged into.")
    }
    if ($profileArtifacts.Count -gt 200) {
        $reasons.Add("$($profileArtifacts.Count) executables were found inside user profiles. A clean image carries a handful - OneDrive, Teams, the odd per-user agent.")
    }
    # Directories that only exist because somebody has been USING the machine.
    $tells = @(
        @{ frag = '\Downloads\';                     say = 'executables in a Downloads folder' }
        @{ frag = '\Desktop\';                       say = 'executables on a Desktop' }
        @{ frag = '\AppData\Local\Temp\';            say = 'executables in the user Temp folder' }
        @{ frag = '\AppData\Local\Google\Chrome\';   say = 'a Chrome user profile' }
        @{ frag = '\AppData\Local\Programs\';        say = 'per-user installed programs' }
        @{ frag = '\node_modules\';                  say = 'a node_modules tree' }
        @{ frag = '\.vscode';                        say = 'VS Code extensions' }
        @{ frag = '\.nuget\';                        say = 'a NuGet package cache' }
        @{ frag = '\.git\';                          say = 'a git working copy' }
    )
    foreach ($t in $tells) {
        $n = @($profileArtifacts | Where-Object { $_.path -like "*$($t.frag)*" }).Count
        if ($n -gt 0) { $reasons.Add("$n $($t.say)") }
    }

    return [pscustomobject]@{
        looksClean       = ($reasons.Count -eq 0)
        profileArtifacts = $profileArtifacts.Count
        profileCount     = $ProfileRoots.Count
        reasons          = $reasons.ToArray()
    }
}

# The house convention: IT-deployed tooling lives under %ProgramData%\IT-TOOLS.
# Apps and Scripts get standing allow rules in every generated Exe/Script/Msi
# collection; LOGS is where scripts write their logs. Deployed by IME as SYSTEM,
# and the ACLs must keep it that way - the scan warns when they do not.
$script:ItToolsAllowPaths = @(
    '%OSDRIVE%\ProgramData\IT-TOOLS\Apps\*'
    '%OSDRIVE%\ProgramData\IT-TOOLS\Scripts\*'
)

function Test-ItToolsAllowedPath {
    <#
    .SYNOPSIS
        Is this writable directory inside (or above) a folder the standing
        IT-TOOLS allow rules point at? If yes, that allow is a live bypass.
    #>
    param([Parameter(Mandatory)] [string]$Candidate)
    $c = $Candidate.TrimEnd('\', '*').TrimEnd('\')
    if (-not $c) { return $false }
    foreach ($p in @("$env:ProgramData\IT-TOOLS\Apps", "$env:ProgramData\IT-TOOLS\Scripts")) {
        $t = $p.TrimEnd('\')
        if ($c.Equals($t, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
        if ($c.StartsWith($t + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
        if ($t.StartsWith($c + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function Test-ImeProtectedPath {
    <#
    .SYNOPSIS
        True when $Candidate IS one of the IME paths, or would cover one.
    #>
    param([Parameter(Mandatory)] [string]$Candidate)
    $c = $Candidate.TrimEnd('\', '*').TrimEnd('\')
    if (-not $c) { return $false }
    foreach ($p in $script:ImeProtectedPaths) {
        if (-not $p) { continue }
        $t = $p.TrimEnd('\')
        if ($c.Equals($t, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
        # An exception on a PARENT of an IME path takes the IME path with it.
        if ($t.StartsWith($c + '\', [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function New-RuleId { return [guid]::NewGuid().ToString() }

function New-PathRule {
    param(
        [string]$Name, [string]$Sid, [string]$Action, [string]$RulePath,
        [string]$Description, [string[]]$ExceptionPaths
    )
    [pscustomobject]@{
        nodeName    = 'FilePathRule'
        id          = (New-RuleId)
        name        = $Name
        description = $Description
        sid         = $Sid
        action      = $Action
        conditions  = @([pscustomobject]@{ kind = 'path'; path = $RulePath })
        exceptions  = @(@($ExceptionPaths) | Where-Object { $_ } | ForEach-Object { [pscustomobject]@{ kind = 'path'; path = $_ } })
    }
}

function New-PublisherRule {
    param(
        [string]$Name, [string]$Sid, [string]$Action,
        [string]$Publisher, [string]$Product, [string]$Binary,
        [string]$LowVersion, [string]$HighVersion, [string]$Description
    )
    if (-not $Product)     { $Product = '*' }
    if (-not $Binary)      { $Binary = '*' }
    if (-not $LowVersion)  { $LowVersion = '*' }
    if (-not $HighVersion) { $HighVersion = '*' }

    [pscustomobject]@{
        nodeName    = 'FilePublisherRule'
        id          = (New-RuleId)
        name        = $Name
        description = $Description
        sid         = $Sid
        action      = $Action
        conditions  = @([pscustomobject]@{
            kind      = 'publisher'
            publisher = $Publisher
            product   = $Product
            binary    = $Binary
            low       = $LowVersion
            high      = $HighVersion
        })
        exceptions  = @()
    }
}

function New-HashRule {
    param(
        [string]$Name, [string]$Sid, [string]$Action,
        [string]$Hash, [string]$SourceFileName, [int64]$SourceFileLength, [string]$Description
    )
    [pscustomobject]@{
        nodeName    = 'FileHashRule'
        id          = (New-RuleId)
        name        = $Name
        description = $Description
        sid         = $Sid
        action      = $Action
        conditions  = @([pscustomobject]@{
            kind   = 'hash'
            hashes = @([pscustomobject]@{
                type   = 'SHA256'
                data   = $Hash
                file   = $SourceFileName
                length = $SourceFileLength
            })
        })
        exceptions  = @()
    }
}

function New-DefaultRuleSet {
    <#
    .SYNOPSIS
        The Microsoft default rules, with every writable directory found by the scan
        injected as an exception - which is the entire point of the exercise.
    #>
    param(
        [string[]]$WritableUnderWindir,
        [string[]]$WritableUnderProgramFiles
    )

    $windirExceptions = @(@($WritableUnderWindir) + @($script:LolBinPatterns))
    $collections = [ordered]@{}

    foreach ($type in @('Exe', 'Script', 'Dll')) {
        $rules = New-Object System.Collections.Generic.List[object]
        $rules.Add((New-PathRule -Name "(Default Rule) All files located in the Program Files folder" `
            -Sid $script:SidEveryone -Action 'Allow' -RulePath '%PROGRAMFILES%\*' `
            -Description "Allows members of the Everyone group to run applications that are located in the Program Files folder, EXCEPT the sub-folders a non-administrator can write to. Exceptions supplied by the TUNO scan." `
            -ExceptionPaths $WritableUnderProgramFiles))
        $rules.Add((New-PathRule -Name "(Default Rule) All files located in the Windows folder" `
            -Sid $script:SidEveryone -Action 'Allow' -RulePath '%WINDIR%\*' `
            -Description "Allows members of the Everyone group to run applications that are located in the Windows folder, EXCEPT the sub-folders a non-administrator can write to and the well-known binaries that execute arbitrary code. Exceptions supplied by the TUNO scan." `
            -ExceptionPaths $(if ($type -eq 'Exe') { $windirExceptions } else { @($WritableUnderWindir) })))
        $rules.Add((New-PathRule -Name "(Default Rule) All files" `
            -Sid $script:SidAdmins -Action 'Allow' -RulePath '*' `
            -Description 'Allows members of the local Administrators group to run all applications. Application control does not meaningfully restrict an administrator; this rule states that plainly instead of pretending otherwise. This is one of the two sanctioned ways software arrives on these devices: by IME, or by an administrator.' `
            -ExceptionPaths @()))

        # THE SANCTIONED DELIVERY ROUTE, stated in the policy rather than implied.
        #
        # Win32 apps deployed from Intune are staged into %WINDIR%\IMECache and run
        # from there; remediation and platform scripts run out of the extension's
        # own folder. Both sit inside the two default allows above and would work
        # without these rules - right up until somebody trims those defaults, or an
        # exception lands on a parent directory, at which point software delivery
        # dies estate-wide with nothing pointing at the cause.
        #
        # A policy whose intent is "software may only install via Intune or an
        # admin" should contain that sentence. These are it.
        foreach ($ime in @('%WINDIR%\IMECache\*', '%PROGRAMFILES%\Microsoft Intune Management Extension\*')) {
            $rules.Add((New-PathRule -Name "TUNO: Intune Management Extension - software delivery ($ime)" `
                -Sid $script:SidEveryone -Action 'Allow' -RulePath $ime `
                -Description 'Allows the Intune Management Extension to stage and run the software it deploys. This is the sanctioned install route on this estate, so it is named explicitly instead of relying on the Windows and Program Files defaults to cover it. Remove this rule only if you also intend to stop deploying Win32 apps and remediation scripts from Intune.' `
                -ExceptionPaths @()))
        }
        # THE HOUSE FOLDERS, always allowed so nobody has to remember them.
        # %ProgramData%\IT-TOOLS\Apps and \Scripts are where IT-deployed tooling
        # lands (written by IME running as SYSTEM). AppLocker has no
        # %PROGRAMDATA% variable, so the macro form is %OSDRIVE%\ProgramData.
        # THE RULES ARE ONLY AS STRONG AS THE ACL: these folders must be
        # writable by SYSTEM and Administrators alone, and the scan checks and
        # warns when they are not - an allow rule on a user-writable directory
        # is a door, not a policy.
        foreach ($house in $script:ItToolsAllowPaths) {
            $rules.Add((New-PathRule -Name "TUNO: IT-TOOLS house folder ($house)" `
                -Sid $script:SidEveryone -Action 'Allow' -RulePath $house `
                -Description 'Standing allow for the IT-TOOLS house folders under ProgramData, where IT-deployed applications and scripts land (written by the Intune Management Extension as SYSTEM). Present in every generated policy by design, so it never has to be remembered. The ACL on these folders must restrict writes to SYSTEM and Administrators - the scan verifies this and warns when it is not true.' `
                -ExceptionPaths @()))
        }
        $collections.Add($type, $rules)
    }

    $msi = New-Object System.Collections.Generic.List[object]
    $msi.Add((New-PathRule -Name '(Default Rule) All Windows Installer files in %WINDIR%\Installer' `
        -Sid $script:SidEveryone -Action 'Allow' -RulePath '%WINDIR%\Installer\*' `
        -Description 'Allows Everyone to run the installer packages Windows itself has cached.' -ExceptionPaths @()))
    $msi.Add((New-PathRule -Name '(Default Rule) All Windows Installer files in %WINDIR%\ccmcache' `
        -Sid $script:SidEveryone -Action 'Allow' -RulePath '%WINDIR%\ccmcache\*' `
        -Description 'Allows Everyone to run installer packages staged by Configuration Manager. Remove this rule if ConfigMgr is not in use.' -ExceptionPaths @()))
    $msi.Add((New-PathRule -Name 'TUNO: Intune Management Extension - installer packages' `
        -Sid $script:SidEveryone -Action 'Allow' -RulePath '%WINDIR%\IMECache\*' `
        -Description 'Allows Windows Installer packages staged by the Intune Management Extension. Same reasoning as the EXE rule of the same name: the sanctioned install route belongs in the policy in writing.' -ExceptionPaths @()))
    $msi.Add((New-PathRule -Name '(Default Rule) All Windows Installer files' `
        -Sid $script:SidAdmins -Action 'Allow' -RulePath '*.*' `
        -Description 'Allows members of the local Administrators group to run all Windows Installer files. The second of the two sanctioned routes: IME, or an administrator.' -ExceptionPaths @()))
    $collections.Add('Msi', $msi)

    $appx = New-Object System.Collections.Generic.List[object]
    $appx.Add((New-PublisherRule -Name '(Default Rule) All signed packaged apps' `
        -Sid $script:SidEveryone -Action 'Allow' -Publisher '*' -Product '*' -Binary '*' `
        -LowVersion '0.0.0.0' -HighVersion '*' `
        -Description 'Allows members of the Everyone group to run packaged apps that are signed. Unsigned packaged apps cannot be installed on a supported Windows build, so this is narrower than it reads. This is also what allows the Company Portal, and everything a user installs through it, to run.'))
    $collections.Add('Appx', $appx)

    return $collections
}

function New-ArtifactRuleSet {
    <#
    .SYNOPSIS
        Publisher-first rules for everything found in a writable location, hash rules
        only where the file is unsigned.
    .DESCRIPTION
        The ladder:
          signed, with product and binary  -> publisher rule at the requested granularity
          signed, missing version resource -> publisher rule with * for what is missing,
                                              flagged in the description so the breadth
                                              is visible in the policy itself
          unsigned                         -> hash rule (goes stale on the next update -
                                              the description says so)
          unsigned .js                     -> skipped unless -JSHashRules

        De-duplication key is collection|publisher|product|binary. AaronLocker's
        equivalent uses "=" where "+=" was intended, discarding collection, publisher
        and product, so two vendors shipping the same binary name collapse to one rule.
    #>
    param(
        # AllowEmptyCollection: a clean image with no writable directories yields
        # no artifacts, and a mandatory parameter rejects an empty array.
        [Parameter(Mandatory)] [AllowEmptyCollection()] [object[]]$Artifacts,
        [Parameter(Mandatory)] [string]$Granularity,
        [switch]$AllowJSHashRules
    )

    $inclProduct = $Granularity -ne 'Publisher'
    $inclBinary  = $Granularity -in @('PublisherProductBinary', 'PublisherProductBinaryVersion')
    $inclVersion = $Granularity -eq 'PublisherProductBinaryVersion'

    $byCollection = [ordered]@{}
    $pubSeen = @{}
    $hashSeen = @{}
    $skippedJs = 0
    $unsignedNoHash = 0
    $wrongHash = 0

    foreach ($a in $Artifacts) {
        $col = $a.collection
        if (-not $byCollection.Contains($col)) { $byCollection.Add($col, (New-Object System.Collections.Generic.List[object])) }

        if ($a.signed -and $a.publisher) {
            $p = $a.publisher
            $product = if ($inclProduct -and $p.product -and $p.product -ne '*') { $p.product } else { '*' }
            $binary  = if ($inclBinary  -and $p.binary  -and $p.binary  -ne '*') { $p.binary  } else { '*' }
            $low     = if ($inclVersion -and $p.version -and $p.version -ne '*') { $p.version } else { '*' }

            $key = "$col|$($p.name)|$product|$binary"
            if ($pubSeen.ContainsKey($key)) {
                # With a version floor, the LOWEST version seen wins - otherwise the
                # first scan of a half-updated fleet locks out the older copies.
                if ($inclVersion -and $low -ne '*') {
                    $existing = $pubSeen[$key]
                    $prev = $existing.conditions[0].low
                    if ($prev -ne '*') {
                        try {
                            if ([version]$low -lt [version]$prev) { $existing.conditions[0].low = $low }
                        }
                        catch { }
                    }
                }
                continue
            }

            $label = if ($binary -ne '*') { $binary } elseif ($product -ne '*') { $product } else { $p.name }
            $breadth = @()
            if ($product -eq '*') { $breadth += 'any product' }
            if ($binary -eq '*')  { $breadth += 'any binary' }
            $desc = "TUNO scan: found at $($a.path). Publisher: $($p.name). Publisher name source: $($a.publisherSource)."
            if ($breadth.Count) { $desc += " NOTE - this rule allows $($breadth -join ' and ') from this publisher; narrow it if the vendor ships more than you intend to allow." }

            $rule = New-PublisherRule -Name "TUNO: $label" -Sid $script:SidEveryone -Action 'Allow' `
                -Publisher $p.name -Product $product -Binary $binary -LowVersion $low -HighVersion '*' -Description $desc
            $pubSeen[$key] = $rule
            ([System.Collections.IDictionary]$byCollection)[$col].Add($rule)
            continue
        }

        # Unsigned from here down.
        if ($a.extension -eq '.js' -and -not $AllowJSHashRules) { $skippedJs++; continue }
        if (-not $a.hash) { $unsignedNoHash++; continue }

        # A flat SHA256 is not the hash AppLocker compares for a PE file or an
        # installer. Shipping one produces an allow rule that silently matches
        # nothing - which under Enforce is a blocked user and a rule that says
        # otherwise. Refuse, and say why.
        if (($script:AuthenticodeHashedCollections -contains $col) -and $a.hashSource -ne 'Get-AppLockerFileInformation') {
            $wrongHash++
            continue
        }

        $hkey = "$col|$($a.hash)"
        if ($hashSeen.ContainsKey($hkey)) { continue }
        $hashSeen[$hkey] = $true

        $rule = New-HashRule -Name "TUNO: $($a.name) (hash)" -Sid $script:SidEveryone -Action 'Allow' `
            -Hash $a.hash -SourceFileName $a.name -SourceFileLength $a.sizeBytes `
            -Description "TUNO scan: found at $($a.path), and it is NOT SIGNED, so a hash rule is the only option. This rule stops working the moment the file is updated - track it, or press the vendor to sign."
        ([System.Collections.IDictionary]$byCollection)[$col].Add($rule)
    }

    if ($skippedJs -gt 0) {
        Add-ScanWarning "$skippedJs unsigned .js file(s) were found and NOT given hash rules. Pass -JSHashRules if you need them; be aware the rules go stale on every update."
    }
    if ($unsignedNoHash -gt 0) {
        Add-ScanWarning "$unsignedNoHash unsigned file(s) could not be hashed (locked or unreadable) and have no rule."
    }
    if ($wrongHash -gt 0) {
        # Do not assert a cause that has not been established: the same guard fires
        # when the module IS present but Get-AppLockerFileInformation failed for
        # that particular file (locked, or over 260 characters).
        Add-ScanWarning "$wrongHash unsigned binary/installer(s) have NO rule. AppLocker matches those on the Authenticode hash, which only Get-AppLockerFileInformation produces; a rule built from the flat SHA256 would look correct and match nothing, so none was written. Either the AppLocker module was unavailable on this device, or those specific files could not be read by it."
    }
    return $byCollection
}

# ══════════════════════════════════════════════════════════════════════════════
# Serialisation
#
# The policy XML is written by hand. The alternative is the AppLocker policy-model
# assembly, which is Windows PowerShell only and reached through the deprecated
# LoadWithPartialName - the single largest reason AaronLocker cannot run on
# PowerShell 7. The schema is small enough that this is the lesser evil.
# ══════════════════════════════════════════════════════════════════════════════
function ConvertTo-XmlAttribute {
    param([string]$Value)
    if ($null -eq $Value) { return '' }
    return [System.Security.SecurityElement]::Escape($Value)
}

function ConvertTo-ConditionXml {
    param([object]$Condition)
    switch ($Condition.kind) {
        'path' { return "<FilePathCondition Path=""$(ConvertTo-XmlAttribute $Condition.path)"" />" }
        'publisher' {
            return "<FilePublisherCondition PublisherName=""$(ConvertTo-XmlAttribute $Condition.publisher)"" " +
                   "ProductName=""$(ConvertTo-XmlAttribute $Condition.product)"" " +
                   "BinaryName=""$(ConvertTo-XmlAttribute $Condition.binary)"">" +
                   "<BinaryVersionRange LowSection=""$(ConvertTo-XmlAttribute $Condition.low)"" " +
                   "HighSection=""$(ConvertTo-XmlAttribute $Condition.high)"" /></FilePublisherCondition>"
        }
        'hash' {
            $inner = ($Condition.hashes | ForEach-Object {
                "<FileHash Type=""$(ConvertTo-XmlAttribute $_.type)"" Data=""$(ConvertTo-XmlAttribute $_.data)"" " +
                "SourceFileName=""$(ConvertTo-XmlAttribute $_.file)"" SourceFileLength=""$($_.length)"" />"
            }) -join ''
            return "<FileHashCondition>$inner</FileHashCondition>"
        }
    }
    return ''
}

function ConvertTo-AppLockerPolicyXml {
    param(
        [Parameter(Mandatory)] $Collections,      # ordered dictionary: type -> list of rules
        [Parameter(Mandatory)] [ValidateSet('Audit', 'Enforce')] [string]$Mode
    )

    # THE DLL COLLECTION IS OMITTED ENTIRELY, and NotConfigured is never written.
    #
    # An earlier version shipped the DLL rules inside a NotConfigured collection
    # and called them "documented and inert". They would not have been inert.
    # Microsoft's own documentation is explicit:
    #
    #   "Despite the name, this enforcement mode doesn't mean the rules are
    #    ignored. On the contrary, if any rules exist in a rule collection that
    #    is 'not configured', the rules WILL be enforced ... you should avoid
    #    using this value in your AppLocker policies."
    #
    # So NotConfigured + rules = ENFORCED, which is the exact DLL enforcement the
    # comment claimed to be preventing - and enforced against only the DLLs this
    # scan happened to find, which would block DLL loads estate-wide.
    #
    # The only genuinely inert state is ABSENCE: a collection with no rules at
    # all. The scan still records what it found for the Dll collection in the
    # bundle, so the rules can be built later as a deliberate project, with the
    # log volume and the application-start cost accepted on purpose.
    $enforcement = if ($Mode -eq 'Enforce') { 'Enabled' } else { 'AuditOnly' }

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<AppLockerPolicy Version="1">')
    foreach ($type in @('Appx', 'Exe', 'Msi', 'Script')) {
        if (-not $Collections.Contains($type)) { continue }
        # NOT $mode: variable names are case-insensitive, so $mode IS the $Mode
        # parameter, and its [ValidateSet('Audit','Enforce')] is re-evaluated on
        # every assignment. Writing 'AuditOnly' into it throws.
        $collectionMode = $enforcement
        [void]$sb.AppendLine("  <RuleCollection Type=""$type"" EnforcementMode=""$collectionMode"">")
        foreach ($r in ([System.Collections.IDictionary]$Collections)[$type]) {
            [void]$sb.AppendLine("    <$($r.nodeName) Id=""$(ConvertTo-XmlAttribute $r.id)"" Name=""$(ConvertTo-XmlAttribute $r.name)"" Description=""$(ConvertTo-XmlAttribute $r.description)"" UserOrGroupSid=""$(ConvertTo-XmlAttribute $r.sid)"" Action=""$(ConvertTo-XmlAttribute $r.action)"">")
            $conds = ($r.conditions | ForEach-Object { ConvertTo-ConditionXml -Condition $_ }) -join ''
            [void]$sb.AppendLine("      <Conditions>$conds</Conditions>")
            if ($r.exceptions -and @($r.exceptions).Count -gt 0) {
                $exc = ($r.exceptions | ForEach-Object { ConvertTo-ConditionXml -Condition $_ }) -join ''
                [void]$sb.AppendLine("      <Exceptions>$exc</Exceptions>")
            }
            [void]$sb.AppendLine("    </$($r.nodeName)>")
        }
        [void]$sb.AppendLine('  </RuleCollection>')
    }
    [void]$sb.AppendLine('</AppLockerPolicy>')
    return $sb.ToString()
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════
$started = Get-Date

Merge-ScanConfig -FilePath $ConfigPath -BoundParameterName @($PSBoundParameters.Keys) -ValidParameterName @(
    'OutputPath', 'Scope', 'Path', 'KnownAdmin', 'PublisherRuleGranularity', 'IncludeEvents',
    'EventDaysBack', 'MaxArtifacts', 'MaxEvents', 'DeepScan', 'SniffUnknownExtensions',
    'JSHashRules', 'SkipRuleGeneration', 'Quiet', 'ConfigPath')

Write-Section ("TUNO AppLocker device scan  ·  v{0}  ·  {1} build {2}" -f $script:ScriptVersion, $(if ($script:TunoIsBeta) { 'BETA' } else { 'production' }), $script:TunoBuild)
Write-Info ("Served by  : {0}" -f $script:TunoSite)

if (($PSVersionTable.PSObject.Properties.Name -contains 'Platform') -and ($PSVersionTable.Platform -ne 'Win32NT')) {
    throw 'This script scans Windows AppLocker configuration and must run on Windows.'
}

$machine = Get-MachineFacts
Write-Info ("Machine   : {0}  ({1}, build {2}, {3})" -f $machine.name, $machine.os, $machine.osBuild, $machine.join)
Write-Info ("PowerShell: {0} {1}" -f $machine.psEdition, $machine.psVersion)
Write-Info ("AppID svc : {0}" -f $machine.appIdentityService)
if (-not $machine.elevated) {
    Add-ScanWarning 'Not running elevated. Directory ACLs and event logs will be read incompletely, and the bundle records that this run was partial.'
}
if (-not $machine.appLockerCmdlets) {
    Add-ScanWarning 'The AppLocker module is not available here. Publisher names will be derived from certificate subjects instead of read from Get-AppLockerFileInformation - accurate in the overwhelming majority of cases, but verify before enforcing.'
}
elseif ($machine.appLockerSource -eq 'compat') {
    Write-Info 'AppLocker: via the Windows PowerShell compatibility session'
}
elseif ($machine.appLockerSource -eq 'compat-policy-only') {
    Write-Info 'AppLocker: compatibility session, policy read only (see warnings)'
}

# ---- resolve the roots ----
Write-Section 'Resolving scan roots'
$roots = New-Object System.Collections.Generic.List[string]
if ($Scope -contains 'System') { $roots.Add($env:windir) }
if ($Scope -contains 'ProgramFiles') {
    if ($env:ProgramFiles) { $roots.Add($env:ProgramFiles) }
    $pf86 = ${env:ProgramFiles(x86)}
    if ($pf86 -and $pf86 -ne $env:ProgramFiles) { $roots.Add($pf86) }
}
if ($Scope -contains 'ProgramData') { $roots.Add($env:ProgramData) }

# User profiles are handled SEPARATELY from the roots above, and deliberately not
# walked for writable subdirectories.
#
# A user profile is user-writable by definition - that is what a profile IS - so
# enumerating its writable subfolders answers a question nobody asked and buries
# the ones that matter. The last real run returned 530 rows saying "the user can
# write to their own profile", against 15 under Windows and 0 under Program Files,
# and blew the artifact cap on browser caches before it reached anything useful.
#
# Nor do those directories need exceptions: no default rule ALLOWS execution from
# a profile in the first place, so there is nothing to carve out of.
#
# What the profile is scanned for is the applications INSTALLED in it - the
# per-user installs that stop working the day enforcement lands. So each profile
# is recorded once, and inventoried.
$profileRoots = New-Object System.Collections.Generic.List[string]
if ($Scope -contains 'UserProfiles') {
    $usersRoot = Join-Path $env:SystemDrive 'Users'
    if (Test-Path -LiteralPath $usersRoot) {
        foreach ($p in (Get-ChildItem -LiteralPath $usersRoot -Directory -Force -ErrorAction SilentlyContinue)) {
            if ($p.Name -in @('Public', 'Default', 'Default User', 'All Users')) { continue }
            $profileRoots.Add($p.FullName)
        }
    }
}
$extraPaths = @()
foreach ($p in @($Path)) {
    if (-not $p) { continue }
    $expanded = [System.Environment]::ExpandEnvironmentVariables($p)
    if (Test-Path -LiteralPath $expanded) { $extraPaths += (Resolve-Path -LiteralPath $expanded).Path }
    else { Add-ScanWarning "-Path entry '$p' does not exist on this machine and was skipped." }
}
if ($Scope -contains 'Custom' -and $extraPaths.Count -eq 0) {
    Add-ScanWarning "Scope includes 'Custom' but -Path supplied nothing that exists."
}

$roots = @($roots | Where-Object { $_ } | Sort-Object -Unique)
foreach ($r in $roots) { Write-Info "root: $r" }
foreach ($r in $extraPaths) { Write-Info "extra (always treated as unsafe): $r" }

# ---- writable directory scan ----
Write-Section 'Scanning for user-writable directories'
$trusted = New-TrustedSidSet -Extra $KnownAdmin
Write-Info ("$($trusted.Count) principals treated as administrative (built-in + local Administrators members" + $(if ($KnownAdmin) { " + $(@($KnownAdmin).Count) supplied by -KnownAdmin" } else { '' }) + ')')

$writable = New-Object System.Collections.Generic.List[object]
foreach ($root in $roots) {
    foreach ($w in (Get-WritableDirectory -Root $root -TrustedSet $trusted -Deep:$DeepScan)) { $writable.Add($w) }
}

$writablePaths = @($writable | ForEach-Object { $_.path })

# Each profile is recorded ONCE, as a fact rather than a discovery, and is not
# walked. See the note where $profileRoots is built.
foreach ($pr in $profileRoots) {
    Write-Info ("profile: {0} - user-writable by definition, recorded once and inventoried" -f $pr)
    $writable.Add([pscustomobject]@{
        path     = $pr
        grantees = @([pscustomobject]@{
            sid    = 'S-1-5-32-545'
            name   = 'the profile owner'
            reason = 'a user profile is writable by its owner by definition - this is not a misconfiguration, it is what a profile is'
        })
    })
}

# Compress as well as de-duplicate: a parent and its child both in this list means
# the artifact inventory walks the same subtree twice. Non-profile directories go
# FIRST so that Windows and Program Files are inventoried before any -MaxArtifacts
# cap can be spent on profile contents.
$unsafeDirectories = @(Compress-PathList -Paths (@($writablePaths) + @($extraPaths))) + @($profileRoots)

Write-Ok ("$($writablePaths.Count) user-writable director$(if ($writablePaths.Count -eq 1) { 'y' } else { 'ies' }) found" +
    $(if ($profileRoots.Count) { ", plus $($profileRoots.Count) user profile(s) taken as writable without walking" } else { '' }))

# ---- exception lists, normalised to AppLocker macros ----
$normWindir = New-Object System.Collections.Generic.List[string]
$normPf = New-Object System.Collections.Generic.List[string]
# -Path entries are declared unsafe by the operator, so they earn an exception in
# exactly the same way a discovered writable directory does. Inventorying them for
# rules but leaving them inside the default %PROGRAMFILES%/%WINDIR% allow would
# keep only half the promise the parameter makes.
foreach ($p in (@($writablePaths) + @($extraPaths))) {
    # An exception here REMOVES an allow. Do that to an Intune Management
    # Extension path and Win32 app delivery, remediations and script policies stop
    # working on managed devices - silently, and days later. So the exception is
    # withheld and the writable directory is reported instead, which is a finding
    # in its own right and a much more useful one.
    if (Test-ImeProtectedPath -Candidate $p) {
        Add-ScanWarning ("'{0}' is user-writable AND belongs to the Intune Management Extension. NO exception was generated for it, because excepting it would break app delivery on every managed device. Fix the permissions on that directory instead - as it stands a standard user can drop an executable into the path your software deployment runs from." -f $p)
        continue
    }
    # The standing IT-TOOLS allows make these folders part of the policy's trust
    # base. A user-writable directory inside one is therefore a LIVE BYPASS -
    # the allow rule this scan always generates would let a standard user run
    # whatever they drop there. Louder than the IME case, because here the
    # policy itself hands out the permission.
    if (Test-ItToolsAllowedPath -Candidate $p) {
        Add-ScanWarning ("'{0}' is user-writable AND sits inside an IT-TOOLS house folder that every generated policy ALLOWS. That combination is a live bypass: a standard user can drop an executable there and the standing allow rule runs it. Fix the ACL so only SYSTEM and Administrators can write (IME deploys as SYSTEM, so delivery keeps working), or remove the house rule from the policy before enforcing." -f $p)
    }
    $n = ConvertTo-AppLockerPath -LiteralPath $p
    if ($n.StartsWith('%WINDIR%', 'OrdinalIgnoreCase') -or $n.StartsWith('%SYSTEM32%', 'OrdinalIgnoreCase')) { $normWindir.Add($n) }
    elseif ($n.StartsWith('%PROGRAMFILES%', 'OrdinalIgnoreCase')) { $normPf.Add($n) }
}
$excWindir = @(Compress-PathList -Paths $normWindir.ToArray() | ForEach-Object { "$_\*" })
$excPf = @(Compress-PathList -Paths $normPf.ToArray() | ForEach-Object { "$_\*" })

# Compress-PathList can produce a SHORTER path than anything that went in, and a
# short enough exception swallows an IME directory that was never writable itself.
# Check the compressed result too, not just the inputs.
$excWindir = @($excWindir | Where-Object {
    if (Test-ImeProtectedPath -Candidate $_) {
        Add-ScanWarning ("Exception '{0}' was dropped: it would have covered an Intune Management Extension path and broken app delivery." -f $_)
        $false
    } else { $true }
})
$excPf = @($excPf | Where-Object {
    if (Test-ImeProtectedPath -Candidate $_) {
        Add-ScanWarning ("Exception '{0}' was dropped: it would have covered an Intune Management Extension path and broken app delivery." -f $_)
        $false
    } else { $true }
})
Write-Info ("{0} exception path(s) under %WINDIR%, {1} under %PROGRAMFILES%" -f $excWindir.Count, $excPf.Count)

# ---- artifact inventory ----
Write-Section 'Inventorying executables in unsafe locations'
$artifacts = @()
if ($unsafeDirectories.Count -eq 0) {
    Write-Info 'No unsafe locations to inventory.'
}
else {
    $artifacts = Get-ArtifactInventory -Directories $unsafeDirectories -Limit $MaxArtifacts `
        -UseAppLockerCmdlets ($machine.appLockerCmdlets -and $machine.appLockerSource -ne 'compat-policy-only') -Sniff:$SniffUnknownExtensions
    $signedCount = @($artifacts | Where-Object { $_.signed }).Count
    Write-Ok ("$($artifacts.Count) artifact(s): $signedCount signed, $($artifacts.Count - $signedCount) unsigned")
}

# ---- is this a reference machine? ----
#
# The scan's central assumption, checked out loud. Every rule it generates for a
# user profile exists because something executable was found there; on a clean
# image that is the image's own per-user software, and on a working laptop it is
# two years of accumulation. The same code produces a sound policy from the first
# and hands the estate back its own attack surface from the second.
$reference = Test-ReferenceMachine -Artifacts $artifacts -ProfileRoots $profileRoots.ToArray()
if ($profileRoots.Count -gt 0 -and -not $reference.looksClean) {
    Write-Host ''
    Write-Host '  [STOP AND READ]' -ForegroundColor Yellow
    Write-Host '  This does not look like a clean reference machine.' -ForegroundColor Yellow
    foreach ($r in $reference.reasons) { Write-Host "    - $r" -ForegroundColor Yellow }
    Write-Info ''
    Write-Info 'The point of AppLocker is that a user cannot run what they put in their own'
    Write-Info 'profile. Rules built from a profile somebody has been working in give that'
    Write-Info 'permission straight back - for whatever happens to be sitting there.'
    Write-Info ''
    Write-Info 'Run this on a freshly built reference image with your standard applications'
    Write-Info 'installed and nobody yet working in it. Or drop -Scope UserProfiles and name'
    Write-Info 'the per-user installs you actually intend to allow with -Path.'
    Add-ScanWarning ("This does not look like a clean reference machine ({0}). Rules generated from user profiles on a working device legitimise whatever is in them - review every profile rule before enforcing, or re-scan a reference image." -f ($reference.reasons -join '; '))
}
elseif ($profileRoots.Count -gt 0) {
    Write-Ok "The user profiles look clean - $($reference.profileArtifacts) executable(s) found in them."
}

# ---- events ----
$events = $null
if ($IncludeEvents) {
    Write-Section "Reading AppLocker event logs (last $EventDaysBack days)"
    $events = Get-AppLockerEventData -DaysBack $EventDaysBack -Limit $MaxEvents
    if ($events.available) {
        Write-Ok ("$($events.summary.total) event(s): $($events.summary.blocked) blocked, $($events.summary.audited) audited, $($events.summary.allowed) allowed")
        if ($events.summary.total -eq 0) {
            Write-Note 'No AppLocker events. Either no policy is applied, or the Application Identity service is not running.'
        }
    }
    else {
        Write-Note 'AppLocker event logs are not readable in this session.'
    }
}

# ---- effective policy ----
Write-Section 'Reading the current effective policy'
$effective = Get-EffectivePolicyXml
if ($effective.available) { Write-Ok 'Effective policy captured.' }
else { Write-Note "Effective policy not captured: $($effective.reason)" }

# ---- rule generation ----
$generated = $null
$auditXml = $null
$enforceXml = $null
# Rule generation is the LAST thing that happens and the only part that can be
# rebuilt from what is already in hand. Everything before it - the ACL walk, the
# signature inventory, the event logs - can take an hour and cannot be recovered
# once the process exits. So a failure here must never take the scan with it: it
# becomes a warning, $generated stays null, and the bundle is written anyway.
# T01 already reads an evidence-only bundle and falls back to the device's
# effective policy, so what lands on disk is still usable.
if (-not $SkipRuleGeneration) {
    Write-Section 'Building the rule set'
    try {
        $collections = New-DefaultRuleSet -WritableUnderWindir $excWindir -WritableUnderProgramFiles $excPf
        $artifactRules = New-ArtifactRuleSet -Artifacts $artifacts -Granularity $PublisherRuleGranularity -AllowJSHashRules:$JSHashRules
        foreach ($type in $artifactRules.Keys) {
            if (-not $collections.Contains($type)) { $collections.Add($type, (New-Object System.Collections.Generic.List[object])) }
            foreach ($r in ([System.Collections.IDictionary]$artifactRules)[$type]) { ([System.Collections.IDictionary]$collections)[$type].Add($r) }
        }

        # Drop the Dll collection before anything counts or serialises it, so the
        # counts on screen, the counts in the bundle and the XML all agree. See
        # the long note in ConvertTo-AppLockerPolicyXml: the only inert state for
        # a DLL collection is not being there.
        $dllRuleCount = 0
        if ($collections.Contains('Dll')) {
            $dllRuleCount = @(([System.Collections.IDictionary]$collections)['Dll']).Count
            $collections.Remove('Dll')
        }
        if ($dllRuleCount -gt 0) {
            Write-Info ("Dll     {0,4} rule(s) built and OMITTED - see the note below" -f $dllRuleCount)
        }

        # NO BARE INDEXER ON AN ORDERED DICTIONARY, in either direction.
        #
        # OrderedDictionary exposes TWO indexers - this[int] and this[object] - and
        # Windows PowerShell 5.1's expression compiler builds a runtime choice
        # between them that can throw ArgumentException("Argument types do not
        # match") from Expression.Condition. It bit twice, in two shapes, both
        # only on a real 5.1 host: first an indexed SET storing an Int32 (fixed in
        # 10344 with .Add), then an indexed GET with a literal key at what was
        # line 2038 (caught by the wrapped rule-generation of 10344, which is the
        # only reason the second failure cost a red block instead of the scan).
        #
        # So the discipline is total rather than case-by-case: writes go through
        # .Add(object, object), and reads go through a cast to
        # [System.Collections.IDictionary], which declares exactly ONE indexer -
        # this[object] - leaving the binder nothing to choose between.
        $counts = [ordered]@{}
        $total = 0
        foreach ($type in $collections.Keys) {
            $n = @(([System.Collections.IDictionary]$collections)[$type]).Count
            $counts.Add($type, $n)
            $total += $n
            Write-Info ("{0,-7} {1,4} rule(s)" -f $type, $n)
        }
        Write-Ok "$total rules across $($collections.Keys.Count) collections"

        $auditXml = ConvertTo-AppLockerPolicyXml -Collections $collections -Mode 'Audit'
        $enforceXml = ConvertTo-AppLockerPolicyXml -Collections $collections -Mode 'Enforce'
        $generated = [pscustomobject]@{
            granularity     = $PublisherRuleGranularity
            ruleCount       = $total
            rulesByCollection = $counts
            dllRulesOmitted = $dllRuleCount
            dllNote         = "The Dll collection is OMITTED from this policy, not shipped as NotConfigured. Microsoft's documentation is explicit that a NotConfigured collection containing rules is ENFORCED, so shipping DLL rules that way would have enforced DLL control - against only the DLLs this scan happened to find. Absence is the only inert state. $dllRuleCount DLL rule(s) were built and left out; the DLL artifacts are still listed in this bundle, so the collection can be taken on later as a deliberate project with its log volume and application-start cost accepted on purpose."
            auditXml        = $auditXml
            enforceXml      = $enforceXml
        }
    }
    catch {
        $generated = $null
        $auditXml = $null
        $enforceXml = $null
        Write-Host ''
        Write-Host '  [ERR]  Rule generation failed - but the scan itself is intact.' -ForegroundColor Red
        Write-Host ("         {0}" -f $_.Exception.Message) -ForegroundColor Red
        Write-Info 'The bundle below still carries every writable directory, every artifact,'
        Write-Info 'the event analysis and the device effective policy. Upload it to T01 and'
        Write-Info 'build the rules there. Nothing has been lost except the generated XML.'
        Add-ScanWarning ("Rule generation failed and no policy was generated: {0} (at {1}). The evidence in this bundle is complete and unaffected." -f
            $_.Exception.Message, (($_.ScriptStackTrace -split "`n" | Select-Object -First 1) -replace '\s+', ' '))
    }
}
else {
    Write-Note 'Rule generation skipped (-SkipRuleGeneration). The bundle carries evidence only.'
}

# ---- bundle ----
Write-Section 'Writing output'
if (-not (Test-Path -LiteralPath $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}
$OutputPath = (Resolve-Path -LiteralPath $OutputPath).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'

$bundle = [pscustomobject]@{
    schema    = $script:BundleSchema
    generator = [pscustomobject]@{
        script      = 'Invoke-TunoAppLockerScan.ps1'
        version     = $script:ScriptVersion
        tunoBuild   = $script:TunoBuild
        channel     = $(if ($script:TunoIsBeta) { 'beta' } else { 'production' })
        site        = $script:TunoSite
        product     = 'TUNO - Tenant Utilities for iNtune Operations'
        generatedUtc = (Get-Date).ToUniversalTime().ToString('o')
        priorArt    = 'Scanning strategy after Microsoft AaronLocker (Aaron Margosis); static check set in T01 after AppLockerInspector (Spencer Alessi).'
    }
    machine   = $machine
    scan      = [pscustomobject]@{
        roots            = @($roots)
        extraPaths       = @($extraPaths)
        scope            = @($Scope)
        deepScan         = [bool]$DeepScan
        sniffedUnknown   = [bool]$SniffUnknownExtensions
        durationSeconds  = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
        maxArtifacts     = $MaxArtifacts
        maxEvents        = $MaxEvents
    }
    writablePaths = @($writable | ForEach-Object {
        [pscustomobject]@{
            path       = $_.path
            normalized = (ConvertTo-AppLockerPath -LiteralPath $_.path)
            grantees   = $_.grantees
        }
    })
    exceptions = [pscustomobject]@{
        windir       = $excWindir
        programFiles = $excPf
        lolBins      = $script:LolBinPatterns
    }
    referenceMachine = $reference
    artifacts = @($artifacts)
    events    = $events
    effectivePolicy = $effective
    generatedPolicy = $generated
    warnings  = @($script:Warnings)
}

$bundlePath = Join-Path $OutputPath ("TunoAppLockerScan-{0}-{1}.json" -f $machine.name, $stamp)
$json = $bundle | ConvertTo-Json -Depth 12 -Compress:$false
[System.IO.File]::WriteAllText($bundlePath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "bundle  -> $bundlePath"

$written = @($bundlePath)
# Gated on $generated, not on -SkipRuleGeneration: rule generation can also have
# been ATTEMPTED and failed, in which case $auditXml is null and WriteAllText
# would throw at the very last step, after the bundle had already been saved.
if ($generated) {
    $auditPath = Join-Path $OutputPath ("AppLockerRules-Audit-{0}.xml" -f $stamp)
    $enforcePath = Join-Path $OutputPath ("AppLockerRules-Enforce-{0}.xml" -f $stamp)
    [System.IO.File]::WriteAllText($auditPath, $auditXml, (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText($enforcePath, $enforceXml, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "audit   -> $auditPath"
    Write-Ok "enforce -> $enforcePath"
    $written += $auditPath, $enforcePath
}

Write-Section 'Next'
Write-Info 'Upload the .json bundle to TUNO T01 (AppLocker builder & validator):'
Write-Info ("    {0}  ->  AppLocker builder & validator  ->  Upload scan result" -f $script:TunoSite)
if ($script:TunoIsBeta) {
    Write-Note "This is a BETA build of the scan (build $script:TunoBuild). Take the bundle to the BETA site above, not to production - the two channels are not the same tool, and a bundle written by a beta scan can carry fields production does not yet read."
}
Write-Info ''
Write-Info 'T01 audits the generated policy, tells you which Microsoft apps a standard user'
Write-Info 'would no longer be able to run, lets you edit the rules, and exports the result'
Write-Info 'as policy XML or as a ready-to-import Intune custom profile.'
Write-Info ''
Write-Info 'NOTHING was changed on this device. Deploying the policy is a separate act -'
Write-Info 'and always in AuditOnly first.'
if ($script:Warnings.Count -gt 0) {
    Write-Host ''
    Write-Host "  $($script:Warnings.Count) warning(s) recorded in the bundle." -ForegroundColor Yellow
}
Write-Host ''

# Emit the paths so the script composes.
$written
