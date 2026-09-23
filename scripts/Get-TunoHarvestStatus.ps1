# Get-TunoHarvestStatus.ps1  v1.0.0  (TUNO build 10627)
#Requires -Version 5.1
<#
.SYNOPSIS
Harvest-site status for THIS device: did the events collector and the scan
Remediation upload, and if not, why? Read-only unless -ProbeUpload. Built for
MDE Live Response or an elevated shell.

.DESCRIPTION
Answers "the device folder on the harvest site is empty - what happened here?"
from what the device itself has, and says which line to read:

  1. THE TARGET THE DEPLOYED PAIRS CARRY. The Intune Management Extension keeps
     every Remediation's scripts under %WINDIR%\IMECache\HealthScripts\
     <policy>_<n>\remediate.ps1. Each copy that carries a HARVEST TARGET block is
     read and its SiteUrl / TenantId / ClientId / CertSubject / CertThumbprint /
     Folder printed - the ClientSecret is shown only as "set" or "empty", never
     its value. HKLM\SOFTWARE\TUNO\Harvest (the hand-deployed override) is shown
     the same way. A block with empty ids is the answer "the pair was created
     before the 📁 panel had a target" - re-create it from the 🚀 panel.
  2. THE CREDENTIAL. Every certificate in LocalMachine\My with a private key whose
     subject matches a configured CertSubject (or thumbprint), with NotAfter; a
     configured subject with no match is the answer "the PKCS profile did not
     land".
  3. WHAT THE LAST RUNS SAID. The scan transcript(s) under
     %ProgramData%\IT-TOOLS\LOGS\AppLockerScan (the "Mode", "Harvest target",
     "harvest:" and "[warn]" lines) and the collector's
     IT-TOOLS\LOGS\AppControlEvents-Collect.log ("Harvest target", "HARVEST:",
     "WARN:" lines), newest first, plus the local bundles with their sizes - a
     bundle over 4 MB took the chunked upload, which scanner 1.13.0 / collector
     1.3.0 got wrong (fixed in 1.13.1 / 1.3.1).
  4. -Probe: the chain up to the write, live. Takes the first complete target
     (parameters, then the registry, then the deployed copies), gets a token the
     way the pairs do (certificate, else secret), resolves the site by URL, and
     lists this device's folder on it - proving the app, the credential and the
     site grant without changing anything.
  5. -ProbeUpload: -Probe, then PUTs a 200-byte HarvestProbe_<stamp>.txt into
     Harvest/<device>/ and reads it back. The one write this script can do,
     named that way, opt-in.

Output: everything on the console (Live Response shows it) AND a transcript at
%ProgramData%\IT-TOOLS\LOGS\HarvestStatus_<host>_<stamp>.log for getfile.

.PARAMETER Probe
Get a token and resolve the site (read-only on the site).

.PARAMETER ProbeUpload
-Probe plus one small test file into Harvest/<device>/.

.PARAMETER HarvestSiteUrl
.PARAMETER HarvestTenantId
.PARAMETER HarvestClientId
.PARAMETER HarvestCertSubject
.PARAMETER HarvestCertThumbprint
.PARAMETER HarvestClientSecret
Override the target for the probe, same names as the collector's parameters.

.PARAMETER OutputDir
Where the transcript goes (default %ProgramData%\IT-TOOLS\LOGS).

.EXAMPLE
# MDE Live Response - status only
run Get-TunoHarvestStatus.ps1

.EXAMPLE
# MDE Live Response - status and a live probe of the chain
run Get-TunoHarvestStatus.ps1 -parameters "-Probe"
getfile "C:\ProgramData\IT-TOOLS\LOGS\HarvestStatus_<host>_<stamp>.log"

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Run as    : SYSTEM (Live Response) or a local administrator. Read-only unless
            -ProbeUpload; never prints a secret.
#>

[CmdletBinding()]
param(
    [switch]$Probe,
    [switch]$ProbeUpload,
    [string]$HarvestSiteUrl,
    [string]$HarvestTenantId,
    [string]$HarvestClientId,
    [string]$HarvestCertSubject,
    [string]$HarvestCertThumbprint,
    [string]$HarvestClientSecret,
    [string]$OutputDir = "$env:ProgramData\IT-TOOLS\LOGS"
)

$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10627

$ErrorActionPreference = 'Continue'
if ($ProbeUpload) { $Probe = $true }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not (Test-Path -LiteralPath $OutputDir)) { try { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null } catch { } }
$LogPath = Join-Path $OutputDir ("HarvestStatus_{0}_{1}.log" -f $env:COMPUTERNAME, $stamp)
try { Start-Transcript -Path $LogPath -Force | Out-Null } catch { }

function Say { param([string]$t) Write-Output $t }
function Head { param([string]$t) Say ''; Say ('==== ' + $t + ' ' + ('=' * [math]::Max(0, 70 - $t.Length))) }
function Mask { param([string]$v) if ([string]::IsNullOrEmpty($v)) { 'empty' } else { 'set' } }

Say ("TUNO harvest status v{0} (build {1}) on {2} at {3} as {4}" -f $script:ScriptVersion, $script:TunoBuild, $env:COMPUTERNAME, (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), "$env:USERDOMAIN\$env:USERNAME")

# ---- 1. the targets on this device --------------------------------------
Head 'Harvest targets on this device'
$targets = New-Object System.Collections.Generic.List[object]

# Parse a HARVEST TARGET block out of script text - the same keyed lines the
# 📁 panel stamps, read the same way (one 'Key = '...'' line each).
function Read-HarvestBlock {
    param([string]$Text, [string]$Source)
    $i = $Text.IndexOf('$script:HarvestTarget = [pscustomobject]@{')
    if ($i -lt 0) { return $null }
    $j = $Text.IndexOf("`n}", $i)
    if ($j -lt 0) { return $null }
    $block = $Text.Substring($i, $j - $i)
    $get = { param($k) $m = [regex]::Match($block, "(?m)^\s*$k\s*=\s*'((?:[^']|'')*)'"); if ($m.Success) { $m.Groups[1].Value.Replace("''", "'") } else { '' } }
    [pscustomobject]@{
        Source = $Source
        SiteUrl = & $get 'SiteUrl'; TenantId = & $get 'TenantId'; ClientId = & $get 'ClientId'
        CertSubject = & $get 'CertSubject'; CertThumbprint = & $get 'CertThumbprint'; ClientSecret = & $get 'ClientSecret'
        Folder = $(if (& $get 'Folder') { & $get 'Folder' } else { 'Harvest' })
    }
}

# parameters
if ($HarvestSiteUrl -or $HarvestTenantId -or $HarvestClientId -or $HarvestCertSubject -or $HarvestCertThumbprint -or $HarvestClientSecret) {
    $targets.Add([pscustomobject]@{ Source = 'parameters'; SiteUrl = $HarvestSiteUrl; TenantId = $HarvestTenantId; ClientId = $HarvestClientId; CertSubject = $HarvestCertSubject; CertThumbprint = $HarvestCertThumbprint; ClientSecret = $HarvestClientSecret; Folder = 'Harvest' })
}
# registry
$regPath = 'HKLM:\SOFTWARE\TUNO\Harvest'
if (Test-Path -LiteralPath $regPath) {
    $reg = Get-ItemProperty -LiteralPath $regPath -ErrorAction SilentlyContinue
    $rv = { param($k) try { if ($reg.PSObject.Properties.Name -contains $k) { [string]$reg.$k } else { '' } } catch { '' } }
    $targets.Add([pscustomobject]@{ Source = 'registry HKLM\SOFTWARE\TUNO\Harvest'; SiteUrl = & $rv 'SiteUrl'; TenantId = & $rv 'TenantId'; ClientId = & $rv 'ClientId'; CertSubject = & $rv 'CertSubject'; CertThumbprint = & $rv 'CertThumbprint'; ClientSecret = & $rv 'ClientSecret'; Folder = $(if (& $rv 'Folder') { & $rv 'Folder' } else { 'Harvest' }) })
}
else { Say 'registry HKLM\SOFTWARE\TUNO\Harvest: not present (normal for a pair created by the 🚀 panel - the target is embedded)' }
# the IME's copies of the deployed Remediations
$imeCache = Join-Path $env:WINDIR 'IMECache\HealthScripts'
if (Test-Path -LiteralPath $imeCache) {
    $copies = @(Get-ChildItem -LiteralPath $imeCache -Recurse -Filter '*.ps1' -File -ErrorAction SilentlyContinue)
    Say ("IME script cache: {0} script file(s) under {1}" -f $copies.Count, $imeCache)
    foreach ($c in $copies) {
        $text = $null
        try { $text = [System.IO.File]::ReadAllText($c.FullName) } catch { continue }
        $ver = ([regex]::Match($text, "\$script:ScriptVersion = '([^']+)'")).Groups[1].Value
        $isScan = $text -match 'TunoAppLockerScan-\{0\}-\{1\}\.json'
        $isColl = $text -match 'AppControlEvents_Bundle_'
        $kind = if ($isScan) { 'Invoke-TunoAppLockerScan.ps1' } elseif ($isColl) { 'Get-TunoAppControlEvents.ps1' } else { $null }
        if (-not $kind) { continue }
        $b = Read-HarvestBlock -Text $text -Source ("IME cache: {0} (v{1}, {2}, written {3:yyyy-MM-dd HH:mm})" -f $kind, $(if ($ver) { $ver } else { '?' }), $c.Directory.Name, $c.LastWriteTime)
        if ($b) { $targets.Add($b) }
        else { Say ("  {0}: {1} v{2} - NO HARVEST TARGET block (older than build 10613 / 10617): never uploads" -f $c.Directory.Name, $kind, $ver) }
        if ($isScan -and $ver -and ([version]$ver -lt [version]'1.13.1')) { Say ("  NOTE: scanner {0} sends a bundle over 4 MB wrongly (last chunk as System.Object[]) - 1.13.1 fixes it; re-create the pair from the 🚀 panel" -f $ver) }
        if ($isColl -and $ver -and ([version]$ver -lt [version]'1.3.1')) { Say ("  NOTE: collector {0} sends a bundle over 4 MB wrongly (last chunk as System.Object[]) - 1.3.1 fixes it; re-create the pair from the 🚀 panel" -f $ver) }
    }
}
else { Say ("IME script cache not found at {0} - no Remediation has run on this device yet, or the IME is not installed" -f $imeCache) }

if (-not $targets.Count) { Say 'NO harvest target anywhere on this device - nothing could have uploaded.' }
$complete = $null
foreach ($t in $targets) {
    $useCert = [bool]($t.CertSubject -or $t.CertThumbprint)
    $ok = [bool]($t.SiteUrl -and $t.TenantId -and $t.ClientId -and ($useCert -or $t.ClientSecret))
    Say ''
    Say ("[{0}] {1}" -f $(if ($ok) { 'COMPLETE' } elseif ($t.SiteUrl -or $t.TenantId -or $t.ClientId -or $t.CertSubject -or $t.CertThumbprint -or $t.ClientSecret) { 'PARTIAL - uploads nothing' } else { 'EMPTY - uploads nothing' }), $t.Source)
    Say ("  SiteUrl        = {0}" -f $(if ($t.SiteUrl) { $t.SiteUrl } else { '(empty)' }))
    Say ("  TenantId       = {0}" -f $(if ($t.TenantId) { $t.TenantId } else { '(empty)' }))
    Say ("  ClientId       = {0}" -f $(if ($t.ClientId) { $t.ClientId } else { '(empty)' }))
    Say ("  CertSubject    = {0}" -f $(if ($t.CertSubject) { $t.CertSubject } else { '(empty)' }))
    Say ("  CertThumbprint = {0}" -f $(if ($t.CertThumbprint) { $t.CertThumbprint } else { '(empty)' }))
    Say ("  ClientSecret   = {0}" -f (Mask $t.ClientSecret))
    Say ("  Folder         = {0}" -f $t.Folder)
    if ($ok -and -not $complete) { $complete = $t }
}

# ---- 2. the credential ---------------------------------------------------
Head 'Uploader certificate(s) in LocalMachine\My'
$subjects = @($targets | ForEach-Object { $_.CertSubject } | Where-Object { $_ } | Select-Object -Unique)
$thumbs = @($targets | ForEach-Object { $_.CertThumbprint } | Where-Object { $_ } | Select-Object -Unique)
$now = Get-Date
try {
    $mine = @(Get-ChildItem -Path 'Cert:\LocalMachine\My' -ErrorAction Stop)
    $hits = @($mine | Where-Object { ($subjects -contains $_.Subject) -or ($thumbs -contains $_.Thumbprint) })
    if (-not $subjects.Count -and -not $thumbs.Count) { Say 'No certificate configured in any target (secret route, or no target).' }
    elseif (-not $hits.Count) { Say ("NONE matching {0} - the PKCS-import profile has not landed here; the certificate route cannot authenticate" -f (($subjects + $thumbs) -join ', ')) }
    foreach ($h in $hits) {
        Say ("  {0}  thumbprint {1}  private key: {2}  valid {3:yyyy-MM-dd} .. {4:yyyy-MM-dd}{5}" -f $h.Subject, $h.Thumbprint, $(if ($h.HasPrivateKey) { 'yes' } else { 'NO - unusable' }), $h.NotBefore, $h.NotAfter, $(if ($h.NotAfter -lt $now) { '  EXPIRED' } else { '' }))
    }
}
catch { Say ("Could not read LocalMachine\My: {0}" -f $_.Exception.Message) }

# ---- 3. what the last runs said -----------------------------------------
Head 'Local output and the last runs'
$scanDir = Join-Path $env:ProgramData 'IT-TOOLS\LOGS\AppLockerScan'
if (Test-Path -LiteralPath $scanDir) {
    $bundles = @(Get-ChildItem -LiteralPath $scanDir -Filter 'TunoAppLockerScan-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    Say ("Scan bundles in {0}: {1}" -f $scanDir, $bundles.Count)
    foreach ($b in ($bundles | Select-Object -First 5)) { Say ("  {0}  {1:N0} bytes  {2:yyyy-MM-dd HH:mm}{3}" -f $b.Name, $b.Length, $b.LastWriteTime, $(if ($b.Length -ge 4000000) { '  (over 4 MB: chunked upload)' } else { '' })) }
    $logs = @(Get-ChildItem -LiteralPath $scanDir -Filter 'AppLockerScan-*.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    foreach ($l in ($logs | Select-Object -First 2)) {
        Say ("Transcript {0} ({1:yyyy-MM-dd HH:mm}):" -f $l.Name, $l.LastWriteTime)
        try { Get-Content -LiteralPath $l.FullName -ErrorAction Stop | Select-String -Pattern 'Mode\s+:|Harvest target|harvest:|\[warn\]|\[fail\]|FAILED|bundle  ->' | ForEach-Object { Say ('  ' + $_.Line.Trim()) } } catch { Say ("  (unreadable: {0})" -f $_.Exception.Message) }
    }
    if (-not $logs.Count) { Say '  no scan transcript - the scan Remediation has not run here in Remediation mode' }
}
else { Say ("{0}: not present - the scan Remediation has not run on this device" -f $scanDir) }
$collLog = Join-Path $env:ProgramData 'IT-TOOLS\LOGS\AppControlEvents-Collect.log'
if (Test-Path -LiteralPath $collLog) {
    Say ("Collector log {0}:" -f $collLog)
    try { @(Get-Content -LiteralPath $collLog -ErrorAction Stop | Select-String -Pattern 'Harvest target|HARVEST:|WARN:.*[Hh]arvest|PARTIALLY|not configured' | Select-Object -Last 8) | ForEach-Object { Say ('  ' + $_.Line.Trim()) } } catch { Say ("  (unreadable: {0})" -f $_.Exception.Message) }
    $imeLogs = "$env:ProgramData\Microsoft\IntuneManagementExtension\Logs"
    $eb = @(Get-ChildItem -LiteralPath $imeLogs -Filter 'AppControlEvents_Bundle_*.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3)
    foreach ($b in $eb) { Say ("  bundle {0}  {1:N0} bytes  {2:yyyy-MM-dd HH:mm}{3}" -f $b.Name, $b.Length, $b.LastWriteTime, $(if ($b.Length -ge 4000000) { '  (over 4 MB: chunked upload)' } else { '' })) }
}
else { Say 'Collector log not present - the events Remediation has not run on this device' }

# ---- the collector's own functions, so the probe authenticates exactly as the pairs do ----
function ConvertTo-Base64Url {
    param([byte[]]$Bytes)
    [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

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

function Get-HarvestSiteId {
    param([string]$SiteUrl, [hashtable]$Headers)
    $u = [uri]$SiteUrl
    $path = $u.AbsolutePath.TrimEnd('/')
    $site = Invoke-RestMethod -Method Get -Uri ("https://graph.microsoft.com/v1.0/sites/{0}:{1}" -f $u.Host, $path) -Headers $Headers -ErrorAction Stop
    if (-not $site.id) { throw "the site $SiteUrl could not be resolved" }
    [string]$site.id
}

# ---- 4. the probe --------------------------------------------------------
if ($Probe) {
    Head 'Live probe'
    if (-not $complete) { Say 'No COMPLETE target to probe with - pass -HarvestSiteUrl/-HarvestTenantId/-HarvestClientId and a -HarvestCertSubject or -HarvestClientSecret.' }
    else {
        Say ("Using: {0}" -f $complete.Source)
        try {
            try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
            $cert = $null
            if ($complete.CertSubject -or $complete.CertThumbprint) {
                $cert = Get-HarvestCertificate -Subject $complete.CertSubject -Thumbprint $complete.CertThumbprint
                if (-not $cert) { throw 'no matching certificate with a private key in LocalMachine\My' }
                Say ("  certificate: {0} ({1})" -f $cert.Subject, $cert.Thumbprint)
            }
            else { Say '  credential: client secret (value not shown)' }
            $token = Get-HarvestToken -TenantId $complete.TenantId -ClientId $complete.ClientId -Cert $cert -Secret $complete.ClientSecret
            Say ("  token: OK ({0} chars)" -f $token.Length)
            $hdr = @{ Authorization = "Bearer $token" }
            $siteId = Get-HarvestSiteId -SiteUrl $complete.SiteUrl -Headers $hdr
            Say ("  site: OK  {0}" -f $siteId)
            $deviceFolder = "{0}/{1}" -f $complete.Folder.Trim('/'), $env:COMPUTERNAME
            $enc = ($deviceFolder -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
            try {
                $kids = Invoke-RestMethod -Method Get -Uri ("https://graph.microsoft.com/v1.0/sites/{0}/drive/root:/{1}:/children?`$select=name,size,folder,file,lastModifiedDateTime&`$top=50" -f $siteId, $enc) -Headers $hdr -ErrorAction Stop
                $items = @($kids.value)
                Say ("  {0}/: {1} item(s)" -f $deviceFolder, $items.Count)
                foreach ($it in $items) { Say ("    {0}{1}  {2}  {3}" -f $it.name, $(if ($it.PSObject.Properties.Name -contains 'folder') { '/' } else { '' }), $(if ($it.PSObject.Properties.Name -contains 'size') { "$($it.size) bytes" } else { '' }), $it.lastModifiedDateTime) }
            }
            catch { Say ("  {0}/: not there yet ({1})" -f $deviceFolder, $_.Exception.Message) }
            if ($ProbeUpload) {
                $probeName = "HarvestProbe_{0}.txt" -f $stamp
                $tmp = Join-Path $env:TEMP $probeName
                ("TUNO harvest probe from {0} at {1} - safe to delete" -f $env:COMPUTERNAME, (Get-Date -Format 'o')).PadRight(200) | Set-Content -LiteralPath $tmp -Encoding ASCII
                $r = Invoke-RestMethod -Method Put -Uri ("https://graph.microsoft.com/v1.0/sites/{0}/drive/root:/{1}/{2}:/content" -f $siteId, $enc, [uri]::EscapeDataString($probeName)) -Headers $hdr -InFile $tmp -ContentType 'text/plain' -ErrorAction Stop
                Say ("  upload: OK  {0} ({1} bytes) - the write grant works; delete it from the site when done" -f $r.name, $r.size)
                Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            }
            Say 'PROBE: the chain works up to the write. If the pairs still leave the folder empty, it is the script version (see the NOTEs above) or the run itself (see the transcript lines).'
        }
        catch { Say ("PROBE FAILED: {0}" -f $_.Exception.Message) }
    }
}

Say ''
Say ("Transcript: {0}" -f $LogPath)
try { Stop-Transcript | Out-Null } catch { }
