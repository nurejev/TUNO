<#
.SYNOPSIS
  Creates (or updates) the Entra app registration for TUNO.

.DESCRIPTION
  Adapted from ENCA's New-EncaAppRegistration.ps1 — same model, same flow.
  - Reuses an existing Microsoft Graph PowerShell session if it has the required
    scopes; otherwise signs in interactively.
  - Creates a multi-tenant SPA app registration with the tuno.limon-it.nl and
    localhost redirect URIs and the delegated scopes TUNO's tools need.
  - Idempotent: safe to run again (updates the existing app).
  - Grants admin consent in your own tenant (skip with -SkipAdminConsent).
  - Optionally restricts the app to named users/groups (-RequireAssignment):
    sets "Assignment required" on the enterprise application and assigns the
    creator first, so the tool is usable only by you until you widen it.
  - Patches js/authConfig.js with the client ID when found next to this script.

.EXAMPLE
  ./New-TunoAppRegistration.ps1

.EXAMPLE
  # Lock the app to yourself while you evaluate it, then widen later from the portal.
  ./New-TunoAppRegistration.ps1 -RequireAssignment

.EXAMPLE
  # High-assurance: register TUNO in YOUR tenant only, for your own hosted copy.
  ./New-TunoAppRegistration.ps1 -SingleTenant -SingleTenantRedirectUris "https://tuno.contoso.example"
  # Prints the clientId + authority to paste into js/authConfig.local.js.

.NOTES
  Requires: Microsoft.Graph.Applications module, and a role that can create
  app registrations + grant tenant-wide consent (e.g. Global Administrator or
  Privileged Role Administrator + Application Administrator).
#>
[CmdletBinding()]
param(
  [string]$AppName = "TUNO (Limon-IT)",
  # Preferred: target the app registration by its immutable Object ID
  # (display-name lookup can match the wrong app if names collide).
  [string]$AppObjectId,
  [string[]]$RedirectUris = @("https://tuno.limon-it.nl", "http://localhost:8080"),
  # Register the app for THIS TENANT ONLY (AzureADMyOrg) instead of multi-tenant.
  [switch]$SingleTenant,
  # Where your own copy is served from. Ignored unless -SingleTenant.
  [string[]]$SingleTenantRedirectUris = @("http://localhost:8080"),
  # Lock the app down to named people (see ENCA's script for the caveats: this
  # gates who may OPEN the tool, not what they can do once inside).
  [switch]$RequireAssignment,
  # Extra principals to assign, by UPN or group display name. Groups must be
  # assigned DIRECTLY - Entra does not honour nested groups for app assignment.
  [string[]]$AssignTo = @(),
  # TUNO asks per tool, but everything a tool may ask must be consented here:
  #   User.Read                     sign-in identity (always)
  #   SecurityEvents.Read.All       Secure Score visualizer (roadmap R02, read-only, on demand)
  # The AppLocker builder & validator reads NOTHING from the tenant — the
  # policy XML is imported and analyzed in the browser. Add Intune read scopes
  # (DeviceManagementConfiguration.Read.All etc.) when the device analyzer
  # (R03) lands; not before.
  [string[]]$DelegatedScopes = @("User.Read", "SecurityEvents.Read.All"),
  [string]$AuthConfigPath = (Join-Path $PSScriptRoot "js/authConfig.js"),
  [switch]$SkipAdminConsent
)

$ErrorActionPreference = "Stop"
$GraphAppId = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

#--- 1. Connect (reuse existing session when possible) -------------------
$requiredScopes = @("Application.ReadWrite.All")
if (-not $SkipAdminConsent) { $requiredScopes += "DelegatedPermissionGrant.ReadWrite.All" }
if ($RequireAssignment) { $requiredScopes += "AppRoleAssignment.ReadWrite.All" }

$ctx = Get-MgContext
$missing = if ($ctx) { $requiredScopes | Where-Object { $_ -notin $ctx.Scopes } } else { $requiredScopes }
if ($ctx -and -not $missing) {
  Write-Host "Reusing existing Graph session: $($ctx.Account) ($($ctx.TenantId))" -ForegroundColor Cyan
} else {
  if ($ctx) { Write-Host "Existing session lacks scopes ($($missing -join ', ')) - reconnecting..." -ForegroundColor Yellow }
  Connect-MgGraph -Scopes $requiredScopes -NoWelcome
  $ctx = Get-MgContext
  Write-Host "Signed in as $($ctx.Account) ($($ctx.TenantId))" -ForegroundColor Cyan
}

#--- 2. Resolve delegated permission IDs from the Graph service principal ---
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$GraphAppId'"
$resourceAccess = foreach ($name in $DelegatedScopes) {
  $perm = $graphSp.Oauth2PermissionScopes | Where-Object Value -eq $name
  if (-not $perm) { throw "Delegated permission '$name' not found on Microsoft Graph." }
  @{ Id = $perm.Id; Type = "Scope" }
}
$requiredResourceAccess = @(@{ ResourceAppId = $GraphAppId; ResourceAccess = $resourceAccess })

#--- 3. Create or update the app registration ---------------------------
if ($SingleTenant) {
  $RedirectUris = $SingleTenantRedirectUris
  if ($AppName -eq "TUNO (Limon-IT)") { $AppName = "TUNO" }
}
$audience = if ($SingleTenant) { "AzureADMyOrg" } else { "AzureADMultipleOrgs" }

$appParams = @{
  DisplayName            = $AppName
  SignInAudience         = $audience
  Spa                    = @{ RedirectUris = $RedirectUris }       # SPA = auth code + PKCE, no secret
  RequiredResourceAccess = $requiredResourceAccess
  Web                    = @{ ImplicitGrantSettings = @{ EnableAccessTokenIssuance = $false; EnableIdTokenIssuance = $false } }
}

$app = if ($AppObjectId) {
  Get-MgApplication -ApplicationId $AppObjectId
} else {
  $matches2 = @(Get-MgApplication -Filter "displayName eq '$AppName'")
  if ($matches2.Count -gt 1) { throw "Multiple apps named '$AppName' found. Re-run with -AppObjectId <object-id> to target the right one." }
  $matches2 | Select-Object -First 1
}
if ($app) {
  Write-Host "App '$($app.DisplayName)' ($($app.Id)) exists - updating..." -ForegroundColor Yellow
  Update-MgApplication -ApplicationId $app.Id @appParams
  $app = Get-MgApplication -ApplicationId $app.Id
} else {
  Write-Host "Creating app registration '$AppName'..." -ForegroundColor Green
  $app = New-MgApplication @appParams
}

#--- 4. Ensure a service principal exists in this tenant ----------------
$sp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" | Select-Object -First 1
if (-not $sp) { $sp = New-MgServicePrincipal -AppId $app.AppId }

#--- 4b. Restrict who may open the app ----------------------------------
if ($RequireAssignment) {
  $defaultAccessRole = "00000000-0000-0000-0000-000000000000"
  $assignedNames = @()
  $failed = @()

  function Add-TunoAssignment {
    param([string]$PrincipalId, [string]$Label)
    $existing = Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -All |
                Where-Object { $_.PrincipalId -eq $PrincipalId }
    if ($existing) { Write-Host "  . $Label - already assigned" -ForegroundColor DarkGray; return $true }
    try {
      New-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -BodyParameter @{
        principalId = $PrincipalId; resourceId = $sp.Id; appRoleId = $defaultAccessRole
      } | Out-Null
      Write-Host "  + $Label" -ForegroundColor Green
      return $true
    } catch {
      Write-Host "  x $Label - $($_.Exception.Message)" -ForegroundColor Red
      return $false
    }
  }

  Write-Host ""
  Write-Host "Restricting the app to assigned principals..." -ForegroundColor Cyan

  # 1) the person running this script — assigned FIRST and unconditionally, so
  # flipping the requirement cannot lock everyone out including its creator.
  $meUpn = (Get-MgContext).Account
  $me = $null
  try { $me = Get-MgUser -UserId $meUpn -Property Id,DisplayName,UserPrincipalName -ErrorAction Stop } catch {}
  if ($me) {
    if (Add-TunoAssignment -PrincipalId $me.Id -Label "$($me.DisplayName) <$($me.UserPrincipalName)>  (you)") {
      $assignedNames += $me.UserPrincipalName
    } else { $failed += $meUpn }
  } else {
    Write-Host "  ! Could not resolve the signed-in account '$meUpn' as a user object." -ForegroundColor Yellow
    Write-Host "    Assignment required will NOT be enabled - that would lock everyone out." -ForegroundColor Yellow
    $failed += $meUpn
  }

  # 2) anyone else named on the command line, by UPN or group display name
  foreach ($name in $AssignTo) {
    $n = $name.Trim(); if (-not $n) { continue }
    $principal = $null; $label = $n
    if ($n -like "*@*") {
      try { $u = Get-MgUser -UserId $n -Property Id,DisplayName -ErrorAction Stop
            $principal = $u.Id; $label = "$($u.DisplayName) <$n>  (user)" } catch {}
    }
    if (-not $principal) {
      $safe = $n.Replace("'", "''")
      $filter = "displayName eq '" + $safe + "'"
      $g = @(Get-MgGroup -Filter $filter -Property Id,DisplayName)
      if ($g.Count -gt 1) { Write-Host "  x $n - several groups share that name; assign it in the portal" -ForegroundColor Red; $failed += $n; continue }
      if ($g.Count -eq 1) { $principal = $g[0].Id; $label = "$($g[0].DisplayName)  (group - members must be DIRECT, nested groups are ignored by Entra)" }
    }
    if (-not $principal) { Write-Host "  x $n - no user or group found" -ForegroundColor Red; $failed += $n; continue }
    if (Add-TunoAssignment -PrincipalId $principal -Label $label) { $assignedNames += $n } else { $failed += $n }
  }

  # 3) only now flip the switch, and only if somebody can actually get in
  if ($assignedNames.Count -gt 0) {
    Update-MgServicePrincipal -ServicePrincipalId $sp.Id -AppRoleAssignmentRequired:$true
    Write-Host "Assignment required: ON - everyone else is refused at sign-in (AADSTS50105)." -ForegroundColor Green
  } else {
    Write-Host "Assignment required: LEFT OFF - nobody could be assigned, and enabling it now would lock the app to nobody." -ForegroundColor Red
  }
  if ($failed.Count) { Write-Host "Not assigned: $($failed -join ', ')" -ForegroundColor Yellow }
}

#--- 5. Admin consent for this tenant -----------------------------------
if (-not $SkipAdminConsent) {
  $scopeString = $DelegatedScopes -join " "
  $grant = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($sp.Id)' and resourceId eq '$($graphSp.Id)' and consentType eq 'AllPrincipals'" | Select-Object -First 1
  if ($grant) {
    Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $grant.Id -Scope $scopeString
    Write-Host "Admin consent updated ($scopeString)" -ForegroundColor Green
  } else {
    New-MgOauth2PermissionGrant -ClientId $sp.Id -ResourceId $graphSp.Id -ConsentType "AllPrincipals" -Scope $scopeString | Out-Null
    Write-Host "Admin consent granted ($scopeString)" -ForegroundColor Green
  }
}

#--- 6. Patch js/authConfig.js -------------------------------------------
if (Test-Path $AuthConfigPath) {
  $cfg = Get-Content $AuthConfigPath -Raw
  $cfg = $cfg -replace 'clientId:\s*"[^"]*"', "clientId: `"$($app.AppId)`""
  Set-Content -Path $AuthConfigPath -Value $cfg -NoNewline
  Write-Host "Patched clientId in $AuthConfigPath" -ForegroundColor Green
} else {
  Write-Host "authConfig.js not found at $AuthConfigPath - set clientId manually." -ForegroundColor Yellow
}

#--- 7. Summary ----------------------------------------------------------
Write-Host ""
Write-Host "==================== TUNO app registration ====================" -ForegroundColor Cyan
Write-Host "  Display name : $($app.DisplayName)"
Write-Host "  Client ID    : $($app.AppId)"
Write-Host "  Object ID    : $($app.Id)"
Write-Host "  Audience     : $(if ($SingleTenant) { 'THIS TENANT ONLY (AzureADMyOrg)' } else { 'multi-tenant (AzureADMultipleOrgs)' })"
Write-Host "  SPA redirects: $($RedirectUris -join ', ')"
Write-Host "  Permissions  : $($DelegatedScopes -join ', ') (delegated)"
if ($RequireAssignment) {
  $spNow = Get-MgServicePrincipal -ServicePrincipalId $sp.Id -Property AppRoleAssignmentRequired,Id
  $who = @(Get-MgServicePrincipalAppRoleAssignedTo -ServicePrincipalId $sp.Id -All | Select-Object -ExpandProperty PrincipalDisplayName)
  Write-Host "  Access       : $(if ($spNow.AppRoleAssignmentRequired) { 'ASSIGNED PRINCIPALS ONLY' } else { 'anyone in the tenant (assignment NOT required)' })"
  Write-Host "  Assigned     : $(if ($who) { $who -join ', ' } else { '(nobody)' })"
  Write-Host "  Add more     : Entra ID > Enterprise applications > $($app.DisplayName) > Users and groups"
}
Write-Host ""
if ($SingleTenant) {
  $tenantId = (Get-MgContext).TenantId
  Write-Host "  Paste this into js/authConfig.local.js of your copy:" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "    window.TUNO_AUTH = {"
  Write-Host "      clientId:  `"$($app.AppId)`","
  Write-Host "      authority: `"https://login.microsoftonline.com/$tenantId`","
  Write-Host "    };"
  Write-Host ""
  Write-Host "  ...and reference it in index.html just before js/authConfig.js:" -ForegroundColor Cyan
  Write-Host "    <script src=`"js/authConfig.local.js`"></script>"
  Write-Host ""
  Write-Host "  Admin-consent URL (this tenant):" -ForegroundColor Cyan
  Write-Host "  https://login.microsoftonline.com/$tenantId/adminconsent?client_id=$($app.AppId)&redirect_uri=$([uri]::EscapeDataString($RedirectUris[0]))"
} else {
  Write-Host "  Customer tenant admin-consent URL:" -ForegroundColor Cyan
  Write-Host "  https://login.microsoftonline.com/organizations/adminconsent?client_id=$($app.AppId)&redirect_uri=$([uri]::EscapeDataString($RedirectUris[0]))"
}
Write-Host "=================================================================="
