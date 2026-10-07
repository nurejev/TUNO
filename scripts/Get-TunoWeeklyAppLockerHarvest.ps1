# Get-TunoWeeklyAppLockerHarvest.ps1  v1.0.0  (TUNO build 10692)
#Requires -Version 5.1
<#
.SYNOPSIS
Harvest existing non-DLL AppLocker events and policy receipts; upload once a week.
.DESCRIPTION
Schedule the detection/remediation pair DAILY, SYSTEM, 64-bit. Detection triggers
when seven days elapsed or an upload is pending. No application/file inventory or
ACL scan. A pending bundle is retried unchanged before new collection. A checkpoint
is committed only after an upload receipt confirms its size. Pruning is confined
to this device's T29 files, after upload; pending files are never pruned.
Certificate authentication is preferred. A client secret, if configured, is present
in the deployed script: limit the uploader app to the chosen SharePoint site.
Intune's remediation success means delivery completed, not policy enforcement.
.NOTES
Version: 1.0.0; tool T29; MIT. Uses T01's certificate/token uploader mechanics.
Policy receipts distinguish local/GPO from the MDM cache; neither proves app execution.
#>
[CmdletBinding()]
param([ValidateRange(7,365)][int]$DaysBack=8, [ValidateRange(100,100000)][int]$MaxEvents=5000)
$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10692
$script:HarvestTarget = [pscustomobject]@{
    SiteUrl        = ''
    TenantId       = ''
    ClientId       = ''
    CertSubject    = ''
    CertThumbprint = ''
    ClientSecret   = ''
    Folder         = 'Harvest'
    RetentionDays  = 30
}
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:ProgramData 'TUNO\AppLockerHarvest'
$pendingFolder = Join-Path $root 'Pending'
$sentFolder = Join-Path $root 'Uploaded'
foreach ($folder in @($root,$pendingFolder,$sentFolder)) { [void](New-Item -Path $folder -ItemType Directory -Force) }
$warnings = New-Object System.Collections.Generic.List[string]
function Is-DllEvent {
    param($Event)
    try {
        $xml = [xml]$Event.ToXml()
        foreach ($n in @($xml.SelectNodes('//*[local-name()="FilePath" or local-name()="FileName" or local-name()="BinaryName" or (local-name()="Data" and (@Name="FilePath" or @Name="FileName" or @Name="BinaryName"))]'))) {
            if ($n.InnerText -match '(?i)\.dll["'']?\s*$') { return $true }
        }
        foreach ($n in @($xml.SelectNodes('//*[local-name()="Fqbn"]'))) {
            $parts=$n.InnerText -split '\\'; if ($parts.Count -ge 3 -and $parts[2] -match '(?i)\.dll\s*$') { return $true }
        }
    } catch { }
    return $false
}
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


function Read-PolicyReceipt {
    $localXml = ''; $localError = ''; $mdmErrors = New-Object System.Collections.Generic.List[string]
    $collections = New-Object System.Collections.Generic.List[object]
    try {
        $doc = [xml](Get-AppLockerPolicy -Effective -Xml -ErrorAction Stop)
        foreach ($c in @($doc.DocumentElement.SelectNodes('RuleCollection[@Type="Dll"]'))) { [void]$c.ParentNode.RemoveChild($c) }
        $localXml = $doc.OuterXml
    } catch { $localError = $_.Exception.Message }
    $cache = Join-Path $env:windir 'System32\AppLocker\MDM'
    $present = Test-Path -LiteralPath $cache -PathType Container
    if ($present) {
        try {
            # Only the AppLocker CSP cache's Policy files. No app inventory scan.
            foreach ($f in @(Get-ChildItem -LiteralPath $cache -Recurse -File -Filter Policy -ErrorAction Stop)) {
                $type = Split-Path -Leaf $f.DirectoryName
                if ($type -eq 'DLL') { continue }
                if ($type -notin @('EXE','MSI','Script','StoreApps','Appx')) { continue }
                try {
                    $decoded=ConvertFrom-MdmPolicyBytes -Path $f.FullName
                    if (-not $decoded.parsed) { throw $decoded.error }
                    $c=$decoded.xml
                    if ($c.GetAttribute('Type') -eq 'Dll') { continue }
                    $collections.Add([pscustomobject]@{ grouping=(Split-Path -Leaf (Split-Path -Parent $f.DirectoryName)); type=$c.GetAttribute('Type'); mode=$c.GetAttribute('EnforcementMode'); xml=$c.OuterXml })
                } catch { $mdmErrors.Add("$type cache receipt: $($_.Exception.Message)") }
            }
        } catch { $mdmErrors.Add($_.Exception.Message) }
    }
    [pscustomobject]@{ localGpoXml=$localXml; localGpoError=$localError; mdm=[pscustomobject]@{ present=$present; collections=$collections.ToArray(); warnings=$mdmErrors.ToArray() }; meaning='Policy receipt only; local/GPO and MDM are separate sources. Device application testing is still required.' }
}
function New-HarvestBundle {
    $since = [datetime]::UtcNow.AddDays(-$DaysBack)
    $entries = New-Object System.Collections.Generic.List[object]
    $logsRead = New-Object System.Collections.Generic.List[string]
    $verdicts = @{ 8002='Allowed';8003='Audited';8004='Blocked';8005='Allowed';8006='Audited';8007='Blocked';8020='Allowed';8021='Audited';8022='Blocked';8023='Allowed';8024='Audited';8025='Blocked' }
    $logs = @(
        [pscustomobject]@{ Name='Microsoft-Windows-AppLocker/EXE and DLL'; Ids=@(8002,8003,8004) }
        [pscustomobject]@{ Name='Microsoft-Windows-AppLocker/MSI and Script'; Ids=@(8005,8006,8007,8028,8029,8036,8037,8038,8039,8040) }
        [pscustomobject]@{ Name='Microsoft-Windows-AppLocker/Packaged app-Execution'; Ids=@(8020,8021,8022) }
        [pscustomobject]@{ Name='Microsoft-Windows-AppLocker/Packaged app-Deployment'; Ids=@(8023,8024,8025) }
    )
    $truncated=$false; $excluded=0
    foreach ($log in $logs) {
        $count=0
        try {
            # DLL filtering precedes the per-channel evidence cap; DLL floods
            # cannot consume the EXE budget or suppress the other three channels.
            Get-WinEvent -FilterHashtable @{ LogName=$log.Name;Id=$log.Ids;StartTime=$since } -ErrorAction Stop | ForEach-Object {
                $e=$_
                if (Is-DllEvent $e) { $excluded++; return }
                if ($count -ge $MaxEvents) { $truncated=$true; throw "T29_CAP_REACHED" }
                $count++
                $xml=[xml]$e.ToXml(); $values=@{}
                foreach ($n in @($xml.SelectNodes('//*[not(*)]'))) {
                    $key=$n.LocalName; if ($n.LocalName -eq 'Data' -and $n.HasAttribute('Name')) { $key=$n.GetAttribute('Name') }
                    $values[$key]=$n.InnerText
                }
                $path=[string]$values['FilePath']; if (-not $path) { $path=[string]$values['Package'] }
                $parts=([string]$values['Fqbn']) -split '\\'
                $publisher='';$product='';$binary='';$version=''
                if ($parts.Count -ge 3) { $publisher=$parts[0];$product=$parts[1];$binary=$parts[2] }; if ($parts.Count -ge 4) { $version=$parts[3] }
                $verdict='Other'; if ($verdicts.ContainsKey([int]$e.Id)) { $verdict=$verdicts[[int]$e.Id] }
                $entries.Add([pscustomobject]@{ timeUtc=$e.TimeCreated.ToUniversalTime().ToString('o');log=$e.LogName;recordId=$e.RecordId;eventId=[int]$e.Id;verdict=$verdict;path=$path;publisher=$publisher;product=$product;binary=$binary;version=$version;hash=[string]$values['FileHash'];userSid=[string]$values['TargetUser'];policyName=[string]$values['PolicyName'] })
            }
            $logsRead.Add($log.Name)
        } catch {
            if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { $logsRead.Add($log.Name) }
            elseif ($_.Exception.Message -like '*T29_CAP_REACHED*') { $logsRead.Add($log.Name);$warnings.Add("$($log.Name): non-DLL cap reached; counts are partial") }
            else { $warnings.Add("$($log.Name): $($_.Exception.Message)") }
        }
    }
    $id=''
    try { $id=[string](Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\CloudDomainJoin\JoinInfo\*' -ErrorAction Stop | Select-Object -First 1).DeviceId } catch { }
    [pscustomobject]@{ schema='tuno.applocker.harvest/1';generator=[pscustomobject]@{script='Get-TunoWeeklyAppLockerHarvest.ps1';version=$script:ScriptVersion;tunoBuild=$script:TunoBuild};machine=[pscustomobject]@{name=$env:COMPUTERNAME;deviceId=$id;collectedUtc=[datetime]::UtcNow.ToString('o');sinceUtc=$since.ToString('o');daysBack=$DaysBack};events=[pscustomobject]@{available=($logsRead.Count -eq 4);logsRead=$logsRead.ToArray();sinceUtc=$since.ToString('o');entries=$entries.ToArray();truncated=$truncated;excludedDll=$excluded};policyReceipt=(Read-PolicyReceipt);warnings=$warnings.ToArray() }
}

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
        return @($all | Where-Object { $_.Thumbprint -eq $t -and $_.NotAfter -gt (Get-Date) -and $_.NotBefore -le (Get-Date) }) | Select-Object -First 1
    }
    $now = Get-Date
    @($all | Where-Object { $_.Subject -eq $Subject -and $_.NotAfter -gt $now -and $_.NotBefore -le $now } | Sort-Object NotAfter -Descending) | Select-Object -First 1
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



function Ensure-HarvestFolders {
    param([string]$SiteId,[string]$Folder,[hashtable]$Headers)
    $parent='root'
    foreach ($part in ($Folder -split '/')) {
        if (-not $part -or $part -in @('.','..')) { throw 'Invalid Harvest folder component' }
        $childUrl="https://graph.microsoft.com/v1.0/sites/$SiteId/drive/items/$parent`:/$([uri]::EscapeDataString($part))"
        if ($parent -eq 'root') { $childUrl="https://graph.microsoft.com/v1.0/sites/$SiteId/drive/root:/$([uri]::EscapeDataString($part))" }
        try { $item=Invoke-RestMethod -Method Get -Uri $childUrl -Headers $Headers -ErrorAction Stop }
        catch {
            if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 404) { throw }
            $body=@{name=$part;folder=@{};'@microsoft.graph.conflictBehavior'='fail'} | ConvertTo-Json -Compress
            try { $item=Invoke-RestMethod -Method Post -Uri "https://graph.microsoft.com/v1.0/sites/$SiteId/drive/items/$parent/children" -Headers $Headers -Body $body -ContentType 'application/json' -ErrorAction Stop }
            catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) { $item=Invoke-RestMethod -Method Get -Uri $childUrl -Headers $Headers -ErrorAction Stop } else { throw } }
        }
        if (-not $item.folder -or -not $item.id) { throw "Harvest folder unavailable: $part" }
        $parent=[string]$item.id
    }
}
function Send-WeeklyBundle {
    param([string]$SiteId,[string]$RemotePath,[string]$LocalPath,[hashtable]$Headers)
    $file=Get-Item -LiteralPath $LocalPath
    $enc=($RemotePath -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $base="https://graph.microsoft.com/v1.0/sites/$SiteId/drive/root:/$enc"
    if ($file.Length -lt 4000000) {
        $item=Invoke-RestMethod -Method Put -Uri "${base}:/content" -Headers $Headers -InFile $LocalPath -ContentType 'application/json' -ErrorAction Stop
    } else {
        $session=Invoke-RestMethod -Method Post -Uri "${base}:/createUploadSession" -Headers $Headers -ContentType 'application/json' -Body '{"item":{"@microsoft.graph.conflictBehavior":"replace"}}' -ErrorAction Stop
        if (-not $session.uploadUrl) { throw 'No upload session URL' }
        $stream=[IO.File]::OpenRead($LocalPath)
        try {
            $pos=[long]0; $buffer=New-Object byte[] 5242880; $item=$null
            while ($pos -lt $file.Length) {
                $n=$stream.Read($buffer,0,$buffer.Length); if ($n -le 0) { throw 'Unexpected end of bundle' }
                [byte[]]$part=New-Object byte[] $n; [Array]::Copy($buffer,0,$part,0,$n)
                $last=Invoke-WebRequest -Method Put -Uri $session.uploadUrl -Headers @{'Content-Range'="bytes $pos-$($pos+$n-1)/$($file.Length)"} -Body $part -ContentType 'application/octet-stream' -UseBasicParsing -ErrorAction Stop
                $pos+=$n
            }
            if ($last.StatusCode -notin @(200,201)) { throw 'Upload session not complete' }
            $item=$last.Content | ConvertFrom-Json
        } finally { $stream.Dispose() }
    }
    if (-not $item.id -or [long]$item.size -ne $file.Length) { throw 'Upload receipt missing or bundle size differs; pending copy retained' }
    $receipt=Invoke-RestMethod -Method Get -Uri "https://graph.microsoft.com/v1.0/sites/$SiteId/drive/items/$($item.id)?`$select=id,name,size" -Headers $Headers -ErrorAction Stop
    if ([long]$receipt.size -ne $file.Length) { throw 'Upload read-back size differs' }
    return $receipt
}
function Remove-WeeklyCloudHistory {
    param([string]$SiteId,[string]$Folder,[int]$Days,[string]$KeepId,[hashtable]$Headers)
    if ($Days -le 0) { return }
    $enc=($Folder -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $uri="https://graph.microsoft.com/v1.0/sites/$SiteId/drive/root:/${enc}:/children?`$select=id,name,file&`$top=200"
    $cutoff=[datetime]::UtcNow.AddDays(-$Days)
    while ($uri) {
        $page=Invoke-RestMethod -Method Get -Uri $uri -Headers $Headers -ErrorAction Stop
        foreach ($file in @($page.value)) {
            if (-not $file.file -or $file.id -eq $KeepId) { continue }
            $match=[regex]::Match([string]$file.name,'^T29_AppLocker_(\d{8}T\d{6}Z)_[a-f0-9-]{36}\.json$')
            if (-not $match.Success) { continue }
            $time=[datetime]::ParseExact($match.Groups[1].Value,'yyyyMMddTHHmmssZ',[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime()
            if ($time -lt $cutoff) { Invoke-RestMethod -Method Delete -Uri "https://graph.microsoft.com/v1.0/sites/$SiteId/drive/items/$($file.id)" -Headers $Headers -ErrorAction Stop | Out-Null }
        }
        $uri=[string]$page.'@odata.nextLink'
    }
}
try {
    $cfg=$script:HarvestTarget
    if (-not $cfg.SiteUrl -or -not $cfg.TenantId -or -not $cfg.ClientId -or (-not $cfg.CertSubject -and -not $cfg.CertThumbprint -and -not $cfg.ClientSecret)) { throw 'Configure site, tenant ID, uploader app ID and certificate (or secret) in T29 before deploying this pair' }
    if ($cfg.RetentionDays -lt 0 -or $cfg.RetentionDays -gt 3650) { throw 'Retention must be 0..3650 days' }
    $site=[uri]$cfg.SiteUrl
    if ($site.Scheme -ne 'https' -or $site.Host -notmatch '\.sharepoint\.com$') { throw 'Use an HTTPS SharePoint site URL' }
    $pending=@(Get-ChildItem -LiteralPath $pendingFolder -Filter 'T29_AppLocker_*.json' -File)
    if (-not $pending.Count) {
        $bundle=New-HarvestBundle
        $name='T29_AppLocker_{0}_{1}.json' -f ([datetime]::UtcNow.ToString('yyyyMMddTHHmmssZ')),[guid]::NewGuid().ToString()
        $temporary=Join-Path $pendingFolder ($name+'.tmp')
        $bundle | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $temporary -Encoding UTF8
        Move-Item -LiteralPath $temporary -Destination (Join-Path $pendingFolder $name)
        $pending=@(Get-ChildItem -LiteralPath $pendingFolder -Filter 'T29_AppLocker_*.json' -File)
    }
    [Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $cert=$null
    if ($cfg.CertSubject -or $cfg.CertThumbprint) {
        $cert=Get-HarvestCertificate -Subject $cfg.CertSubject -Thumbprint $cfg.CertThumbprint
        if (-not $cert) { throw 'Uploader certificate with private key unavailable in LocalMachine\My' }
    }
    $token=Get-HarvestToken -TenantId $cfg.TenantId -ClientId $cfg.ClientId -Cert $cert -Secret $cfg.ClientSecret
    $headers=@{Authorization="Bearer $token"}; $siteId=Get-HarvestSiteId -SiteUrl $cfg.SiteUrl -Headers $headers
    $deviceFolder='{0}/{1}' -f $cfg.Folder.Trim('/'),$env:COMPUTERNAME
    Ensure-HarvestFolders -SiteId $siteId -Folder $deviceFolder -Headers $headers
    $keepId=''
    foreach ($file in ($pending | Sort-Object Name)) {
        $bundle=Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
        $receipt=Send-WeeklyBundle -SiteId $siteId -RemotePath "$deviceFolder/$($file.Name)" -LocalPath $file.FullName -Headers $headers
        $checkpoint=[pscustomobject]@{collectedUtc=$bundle.machine.collectedUtc;uploadedUtc=[datetime]::UtcNow.ToString('o');itemId=$receipt.id;name=$file.Name}
        $checkpoint | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'Success.tmp') -Encoding UTF8
        Move-Item -LiteralPath (Join-Path $root 'Success.tmp') -Destination (Join-Path $root 'Success.json') -Force
        Move-Item -LiteralPath $file.FullName -Destination (Join-Path $sentFolder $file.Name) -Force
        $keepId=[string]$receipt.id
    }
    # Success first; history pruning cannot delete the only uploaded/pending copy.
    try { Remove-WeeklyCloudHistory -SiteId $siteId -Folder $deviceFolder -Days $cfg.RetentionDays -KeepId $keepId -Headers $headers }
    catch { Write-Warning "Upload succeeded; cloud history prune failed: $($_.Exception.Message)" }
    if ($cfg.RetentionDays -gt 0) {
        Get-ChildItem -LiteralPath $sentFolder -Filter 'T29_AppLocker_*.json' -File | Where-Object { $_.Name -match '^T29_AppLocker_\d{8}T\d{6}Z_[a-f0-9-]{36}\.json$' -and $_.Name -ne $checkpoint.name -and $_.LastWriteTimeUtc -lt [datetime]::UtcNow.AddDays(-$cfg.RetentionDays) } | Remove-Item -Force
    }
    Write-Output "Weekly bundle uploaded and read back. Retention $($cfg.RetentionDays) day(s); pending files protected. Delivery success is not enforcement proof."
    exit 0
} catch {
    Write-Output "Weekly upload incomplete: $($_.Exception.Message). Pending bundles retained; next daily detection retries."
    exit 1
}
