#Requires -Version 5.1
<#
.SYNOPSIS
Creates the "TUNO Harvest Uploader" app registration, its certificate, and the write
grant on ONE SharePoint site - the harvest site T01 created - so the events collector
running as SYSTEM on every device can upload its bundle there daily.

.DESCRIPTION
WHY THIS EXISTS. Get-TunoAppControlEvents.ps1 runs as SYSTEM on a schedule. SYSTEM has
no user token, so "upload to SharePoint" needs an identity of its own on the device.
The honest way to give it one is an app registration with the Sites.Selected
APPLICATION permission - which grants nothing until a site is named - granted `write`
on the harvest site only, authenticating with a CERTIFICATE whose private key sits in
the device's LocalMachine store. No secret in any script, ever (Intune's own guidance
for Remediations: do not put sensitive information in scripts).

WHAT IT DOES, idempotently, signed in as an administrator:
  1. App registration "<AppName>" (single-tenant), API permission Microsoft Graph /
     Sites.Selected (Application), admin-consented (an app-role assignment on the
     Graph service principal - the thing the portal's "Grant admin consent" does).
  2. A certificate: self-signed, RSA 2048, <CertYears> years, subject <CertSubject>,
     created cross-platform through .NET's CertificateRequest so this runs from a Mac
     as well as from Windows. The PUBLIC half goes on the app registration as a key
     credential; the PFX (private key + password) and the .cer are written to
     <OutFolder>. Pass -ExistingCerPath to register a certificate your own CA issued
     instead (then you distribute its PFX your way).
  3. The site grant: POST /sites/{id}/permissions with roles [<Role>] for the app -
     the one call that needs Sites.FullControl.All, delegated, on YOU, once.
  4. Prints the four values T01's Harvest panel asks for, a `reg add` block for a
     collector deployed by hand, and the Intune steps for the PFX.

WHAT YOU DO NEXT. Deploy the PFX to the devices' LocalMachine\My store - Intune's
"PKCS imported certificate" profile (needs the Certificate Connector with the PFX
import role) is the supported route; your own CA works if it can issue a cert with
the private key on every device AND you register that CA's public cert here with
-ExistingCerPath. Then paste the client id and certificate subject into T01's
Harvest panel and create the events Remediation from there: it carries the target.

WHAT THE UPLOADER CAN DO, and no more: read and write files on the harvest site.
Not other sites, not mail, not the directory. Revoke it by deleting the key
credential on the app, or the permission on the site; rotate it by running this
again with a new certificate.

.PARAMETER SiteUrl
The harvest site T01 created, e.g. https://contoso.sharepoint.com/sites/TUNO-AppControl-Harvest.

.PARAMETER AppName
Display name of the uploader app registration. Default "TUNO Harvest Uploader".

.PARAMETER CertSubject
Subject of the certificate. Default CN=TUNO Harvest Uploader - the collector finds the
certificate by this subject unless you give it a thumbprint.

.PARAMETER CertYears
Validity of the self-signed certificate. Default 2. Put the expiry in your calendar:
the day it lapses, the uploads stop and the collector logs why.

.PARAMETER OutFolder
Where the .pfx and .cer are written. Default .\TUNO-Harvest-Uploader next to the shell.

.PARAMETER PfxPassword
Password for the PFX as a SecureString. Generated and printed ONCE when omitted.

.PARAMETER ExistingCerPath
Register this public certificate (.cer/.crt, DER or PEM) instead of creating one.

.PARAMETER Role
The role granted on the site: write (default) or read... write is what an uploader
needs; read would be pointless, fullcontrol is more than it should have.

.PARAMETER SkipSiteGrant
Create the app and certificate only; grant the site yourself (Grant-PnPAzureADAppSitePermission).

.EXAMPLE
.\New-TunoHarvestUploaderApp.ps1 -SiteUrl https://contoso.sharepoint.com/sites/TUNO-AppControl-Harvest

.EXAMPLE
# Your own CA's certificate, already deployed to the devices by SCEP/PKCS
.\New-TunoHarvestUploaderApp.ps1 -SiteUrl https://contoso.sharepoint.com/sites/TUNO-AppControl-Harvest -ExistingCerPath .\uploader.cer -CertSubject 'CN=TUNO Harvest Uploader'

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Requires  : Microsoft.Graph.Authentication + Microsoft.Graph.Applications, and an
            account that can create app registrations, grant tenant-wide consent and
            manage the site (Global Administrator, or Application Administrator +
            SharePoint Administrator for the site grant). Delegated scopes asked for:
            Application.ReadWrite.All, AppRoleAssignment.ReadWrite.All,
            Sites.FullControl.All - on YOU, for this run; the uploader app itself gets
            only Sites.Selected.
Runs on   : Windows PowerShell 5.1 (.NET 4.7.2+) and PowerShell 7, Windows or macOS.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,
    [string]$AppName = 'TUNO Harvest Uploader',
    [string]$CertSubject = 'CN=TUNO Harvest Uploader',
    [ValidateRange(1, 5)]
    [int]$CertYears = 2,
    [string]$OutFolder = (Join-Path (Get-Location).Path 'TUNO-Harvest-Uploader'),
    [securestring]$PfxPassword,
    [string]$ExistingCerPath,
    [ValidateSet('write', 'read')]
    [string]$Role = 'write',
    [switch]$SkipSiteGrant
)

# Same two numbers as every house script: this file's history, and the site build
# that served it - held to js/version.js by _to_delete/check-script-versions.js.
$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10623

$ErrorActionPreference = 'Stop'
$GraphAppId = '00000003-0000-0000-c000-000000000000'   # Microsoft Graph

function Write-Step { param([string]$m) Write-Host "  > $m" -ForegroundColor Cyan }
function Write-Done { param([string]$m) Write-Host "  + $m" -ForegroundColor Green }
function Write-Note { param([string]$m) Write-Host "  . $m" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "TUNO Harvest Uploader v$script:ScriptVersion (build $script:TunoBuild)" -ForegroundColor White
Write-Host ""

# ── 0. Modules and sign-in ──────────────────────────────────────────────────
foreach ($m in @('Microsoft.Graph.Authentication', 'Microsoft.Graph.Applications')) {
    if (-not (Get-Module -ListAvailable -Name $m)) {
        throw "Module $m is not installed. Install-Module Microsoft.Graph -Scope CurrentUser, then run this again."
    }
}
Import-Module Microsoft.Graph.Authentication -ErrorAction Stop
Import-Module Microsoft.Graph.Applications -ErrorAction Stop

$requiredScopes = @('Application.ReadWrite.All', 'AppRoleAssignment.ReadWrite.All')
if (-not $SkipSiteGrant) { $requiredScopes += 'Sites.FullControl.All' }
$ctx = Get-MgContext
$missing = if ($ctx) { @($requiredScopes | Where-Object { $_ -notin $ctx.Scopes }) } else { $requiredScopes }
if ($ctx -and $missing.Count -eq 0) {
    Write-Note "Reusing the Graph session: $($ctx.Account) ($($ctx.TenantId))"
}
else {
    if ($ctx) { Write-Note "The session lacks $($missing -join ', ') - signing in again" }
    Connect-MgGraph -Scopes $requiredScopes -NoWelcome
    $ctx = Get-MgContext
    Write-Note "Signed in as $($ctx.Account) ($($ctx.TenantId))"
}
$tenantId = [string]$ctx.TenantId

# ── 1. The app registration, with Sites.Selected (Application) ──────────────
Write-Step "App registration '$AppName'"
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$GraphAppId'" | Select-Object -First 1
if (-not $graphSp) { throw 'The Microsoft Graph service principal was not found in this tenant.' }
$sitesSelected = $graphSp.AppRoles | Where-Object { $_.Value -eq 'Sites.Selected' -and $_.AllowedMemberTypes -contains 'Application' } | Select-Object -First 1
if (-not $sitesSelected) { throw "Application permission Sites.Selected was not found on Microsoft Graph." }

$safeName = $AppName.Replace("'", "''")
$apps = @(Get-MgApplication -Filter "displayName eq '$safeName'")
if ($apps.Count -gt 1) { throw "Several app registrations are named '$AppName'. Rename or remove the extras, then run again." }
$appParams = @{
    DisplayName            = $AppName
    SignInAudience         = 'AzureADMyOrg'
    RequiredResourceAccess = @(@{ ResourceAppId = $GraphAppId; ResourceAccess = @(@{ Id = $sitesSelected.Id; Type = 'Role' }) })
    Notes                  = "TUNO T01 harvest uploader. The events collector on every device authenticates as this app with a certificate and uploads its bundle to the harvest site. Sites.Selected only; write on that site only. Created by New-TunoHarvestUploaderApp.ps1 v$script:ScriptVersion (TUNO build $script:TunoBuild)."
}
$app = $apps | Select-Object -First 1
if ($app) {
    Update-MgApplication -ApplicationId $app.Id @appParams
    $app = Get-MgApplication -ApplicationId $app.Id
    Write-Done "exists ($($app.AppId)) - permission and notes refreshed"
}
else {
    $app = New-MgApplication @appParams
    Write-Done "created ($($app.AppId))"
}
$sp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" | Select-Object -First 1
if (-not $sp) { $sp = New-MgServicePrincipal -AppId $app.AppId; Write-Done 'service principal created' }

# Admin consent for an APPLICATION permission is an app-role assignment on the
# resource's service principal - exactly what the portal button writes.
$consented = @(Get-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $sp.Id -All | Where-Object { $_.AppRoleId -eq $sitesSelected.Id -and $_.ResourceId -eq $graphSp.Id })
if ($consented.Count -eq 0) {
    New-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $sp.Id -BodyParameter @{ principalId = $sp.Id; resourceId = $graphSp.Id; appRoleId = $sitesSelected.Id } | Out-Null
    Write-Done 'Sites.Selected (Application) admin-consented'
}
else { Write-Note 'Sites.Selected (Application) already consented' }

# ── 2. The certificate ──────────────────────────────────────────────────────
Write-Step 'Certificate'
if (-not (Test-Path -LiteralPath $OutFolder)) { New-Item -ItemType Directory -Path $OutFolder -Force | Out-Null }
$pfxPath = Join-Path $OutFolder 'TUNO-Harvest-Uploader.pfx'
$cerPath = Join-Path $OutFolder 'TUNO-Harvest-Uploader.cer'
$plainPassword = $null
$cert = $null
if ($ExistingCerPath) {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList ((Resolve-Path -LiteralPath $ExistingCerPath).Path)
    Write-Done "using $ExistingCerPath ($($cert.Subject), thumbprint $($cert.Thumbprint), expires $($cert.NotAfter.ToString('yyyy-MM-dd')))"
    if ($cert.Subject -ne $CertSubject) { Write-Host "  ! its subject is '$($cert.Subject)', not '$CertSubject' - the collector will look for '$($cert.Subject)'; pass that as the certificate subject in T01." -ForegroundColor Yellow; $CertSubject = $cert.Subject }
}
else {
    if (-not $PfxPassword) {
        # 24 characters from a safe alphabet; printed once below, never written.
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789-_'
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $buf = New-Object byte[] 24
        $rng.GetBytes($buf)
        $plainPassword = -join ($buf | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
        $PfxPassword = ConvertTo-SecureString -String $plainPassword -AsPlainText -Force
    }
    $rsa = [System.Security.Cryptography.RSA]::Create(2048)
    $req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest -ArgumentList $CertSubject, $rsa, ([System.Security.Cryptography.HashAlgorithmName]::SHA256), ([System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $req.CertificateExtensions.Add((New-Object System.Security.Cryptography.X509Certificates.X509KeyUsageExtension -ArgumentList ([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature), $false))
    $notBefore = [DateTimeOffset]::UtcNow.AddDays(-1)
    $cert = $req.CreateSelfSigned($notBefore, $notBefore.AddYears($CertYears).AddDays(1))
    $pfxBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $PfxPassword)
    [System.IO.File]::WriteAllBytes($pfxPath, $pfxBytes)
    [System.IO.File]::WriteAllBytes($cerPath, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    Write-Done "created $CertSubject, thumbprint $($cert.Thumbprint), expires $($cert.NotAfter.ToString('yyyy-MM-dd'))"
    Write-Done "PFX  $pfxPath"
    Write-Done "CER  $cerPath"
}

# The public half onto the app: appended, never replacing - a rotation keeps the
# old certificate valid until you remove it, so no device is cut off mid-swap.
$rawCert = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$already = @($app.KeyCredentials | Where-Object { $_.CustomKeyIdentifier -and ([Convert]::ToBase64String($_.CustomKeyIdentifier) -eq [Convert]::ToBase64String($cert.GetCertHash())) })
if ($already.Count -eq 0) {
    $keys = @($app.KeyCredentials | ForEach-Object {
        @{ KeyId = $_.KeyId; Type = $_.Type; Usage = $_.Usage; Key = $_.Key; DisplayName = $_.DisplayName; StartDateTime = $_.StartDateTime; EndDateTime = $_.EndDateTime; CustomKeyIdentifier = $_.CustomKeyIdentifier }
    })
    $keys += @{
        Type = 'AsymmetricX509Cert'; Usage = 'Verify'; Key = $rawCert
        DisplayName = "$CertSubject ($($cert.Thumbprint.Substring(0, 8)))"
        StartDateTime = $cert.NotBefore.ToUniversalTime(); EndDateTime = $cert.NotAfter.ToUniversalTime()
        CustomKeyIdentifier = $cert.GetCertHash()
    }
    Update-MgApplication -ApplicationId $app.Id -KeyCredentials $keys
    Write-Done 'public certificate registered on the app'
}
else { Write-Note 'this certificate is already on the app' }

# ── 3. The site grant ──────────────────────────────────────────────────────
$siteId = $null
if (-not $SkipSiteGrant) {
    Write-Step "Grant '$Role' on $SiteUrl"
    $u = [uri]$SiteUrl
    $site = Invoke-MgGraphRequest -Method GET -Uri ("https://graph.microsoft.com/v1.0/sites/{0}:{1}" -f $u.Host, $u.AbsolutePath.TrimEnd('/'))
    $siteId = [string]$site.id
    if (-not $siteId) { throw "The site $SiteUrl could not be resolved. Is it created yet? T01's Harvest panel says when it is." }
    $perms = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions"
    $mine = @($perms.value | Where-Object {
        $ids = @($_.grantedToIdentitiesV2 | ForEach-Object { $_.application.id }) + @($_.grantedToIdentities | ForEach-Object { $_.application.id })
        $ids -contains $app.AppId
    })
    if ($mine.Count -gt 0) {
        $have = @($mine | ForEach-Object { $_.roles }) | Select-Object -Unique
        if ($have -contains $Role) { Write-Note "the app already has '$Role' on the site" }
        else {
            Invoke-MgGraphRequest -Method PATCH -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions/$($mine[0].id)" -Body @{ roles = @($Role) } | Out-Null
            Write-Done "existing grant updated to '$Role'"
        }
    }
    else {
        Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$siteId/permissions" -Body @{
            roles = @($Role)
            grantedToIdentities = @(@{ application = @{ id = $app.AppId; displayName = $AppName } })
        } | Out-Null
        Write-Done "'$Role' granted to $AppName on this site - and on no other"
    }
}
else { Write-Note "site grant skipped - grant it yourself: Grant-PnPAzureADAppSitePermission -AppId $($app.AppId) -DisplayName '$AppName' -Site $SiteUrl -Permissions Write" }

# ── 4. What to paste where ──────────────────────────────────────────────────
Write-Host ""
Write-Host "Done. Into T01's Harvest panel (Help & scripts):" -ForegroundColor White
Write-Host "  Uploader app (client) id : $($app.AppId)"
Write-Host "  Certificate subject      : $CertSubject"
Write-Host "  Tenant id                : $tenantId   (T01 fills this in itself)"
Write-Host "  Site                     : $SiteUrl"
if ($plainPassword) {
    Write-Host ""
    Write-Host "PFX password (shown ONCE, not saved anywhere - put it in your vault now):" -ForegroundColor Yellow
    Write-Host "  $plainPassword" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Deploy the certificate to the devices (LocalMachine\My, private key non-exportable):" -ForegroundColor White
Write-Host "  Intune > Devices > Configuration > Create > Windows 10 and later > Templates > PKCS imported certificate"
Write-Host "  - needs the Certificate Connector for Microsoft Intune with the 'PFX import' role; import the PFX with"
Write-Host "    Import-IntunePfxCertificate (IntunePfxImport module), intended purpose 'Unassigned', assign the profile"
Write-Host "    to the same device ring as the events Remediation. Or issue $CertSubject from your own CA and re-run"
Write-Host "    this script with -ExistingCerPath."
Write-Host ""
Write-Host "A collector deployed BY HAND (not from T01) reads its target from the registry - run on the device as admin:" -ForegroundColor White
Write-Host "  reg add HKLM\SOFTWARE\TUNO\Harvest /v SiteUrl /d `"$SiteUrl`" /f"
Write-Host "  reg add HKLM\SOFTWARE\TUNO\Harvest /v TenantId /d $tenantId /f"
Write-Host "  reg add HKLM\SOFTWARE\TUNO\Harvest /v ClientId /d $($app.AppId) /f"
Write-Host "  reg add HKLM\SOFTWARE\TUNO\Harvest /v CertSubject /d `"$CertSubject`" /f"
Write-Host ""
Write-Host "Test from a device that has the certificate, elevated:" -ForegroundColor White
Write-Host "  .\Get-TunoAppControlEvents.ps1 -HarvestSiteUrl `"$SiteUrl`" -HarvestTenantId $tenantId -HarvestClientId $($app.AppId) -HarvestCertSubject `"$CertSubject`" -DaysBack 1"
Write-Host "  -> the last line says 'harvest: uploaded bundle (...), report (...) to .../Harvest/<device>'"
Write-Host ""

[pscustomobject]@{
    TenantId    = $tenantId
    ClientId    = $app.AppId
    AppObjectId = $app.Id
    CertSubject = $CertSubject
    Thumbprint  = $cert.Thumbprint
    NotAfter    = $cert.NotAfter
    SiteUrl     = $SiteUrl
    SiteId      = $siteId
    PfxPath     = $(if ($ExistingCerPath) { $null } else { $pfxPath })
    CerPath     = $(if ($ExistingCerPath) { $ExistingCerPath } else { $cerPath })
}
