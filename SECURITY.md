# TUNO — security & risk documentation

TUNO shares ENCA's architecture one-for-one; this document states the model and what differs. For the long-form reasoning (threat model, residual risks, recommendations), read [ENCA's SECURITY.md](https://github.com/nurejev/enca/blob/main/SECURITY.md) — every argument there applies here unchanged.

## Architecture

* **Static files, no backend.** GitHub Pages serves HTML/CSS/JS; all logic runs in your browser tab. There is no server that could store, log or forward your data.
* **The AppLocker analysis reads nothing from your tenant.** The policy XML or scan bundle you import is parsed in the browser, analyzed in the tab, and exported back to your disk. It is never transmitted — the Content-Security-Policy in `index.html` only permits connections to `graph.microsoft.com`, `login.microsoftonline.com` and the two public GitHub read hosts (see below — reads only, no credentials), so the code could not upload it anywhere else even if it tried. Import, audit, coverage, rewrite and export all work without ever touching Intune.
* **Sign-in** is a SPA **authorization code + PKCE** flow (MSAL.js). No client secret exists. Tokens live in `sessionStorage` and die with the tab.
* **Permissions are minimal and incremental.** Base scope: `User.Read` (who signed in — nothing else). Everything beyond it is requested at the moment it is used, so consent matches use.

### What TUNO writes

Three write surfaces in the AppLocker tool, each under its own scope — Graph separates them, so the registration must too (T22 and T25 add directory writes of their own, listed with the read scopes below):

* **Step 5** can create the Intune custom profile in your tenant, under **`DeviceManagementConfiguration.ReadWrite.All`** (plus read-only **`Group.Read.All`** to find the pilot group and read its member count). Graph offers no narrower split — the read that checks for an existing profile and the write that creates one are the same scope.
* **Step 1's collapsed panel** can create the AppLocker cleanup pair as an Intune Remediation, under **`DeviceManagementScripts.ReadWrite.All`** — the only scope Graph accepts for creating a `deviceHealthScript`; the Configuration write scope does not cover it. The Remediation is created unassigned, and TUNO has no path that assigns it.
* **The 📁 Harvest site panel** (build 10613) can create one SharePoint site — the place the events collector uploads its bundles so they are retrievable with the device off — under **`Sites.Create.All`**, TUNO's only SharePoint scope and the narrowest write Graph offers there: it creates a site collection and cannot read or write any existing site. Graph grants the creating app `Sites.Selected` on the new site only; TUNO never uses it. **The devices never hold TUNO's identity.** They upload as a separate app registration (`Sites.Selected`, *application* permission, granted `write` on that one site) authenticating with a certificate in the device's `LocalMachine\My` store — created by `scripts/New-TunoHarvestUploaderApp.ps1`, run by an administrator, whose own delegated asks (`Application.ReadWrite.All`, `AppRoleAssignment.ReadWrite.All`, `Sites.FullControl.All`) are for that run and are not on TUNO's registration. No secret is placed in any script by that route.
* **The 📁 panel's uploader-app button** (build 10615) does the helper script's work from the browser, under three broad delegated writes — the widest on this registration, each for one step and nothing else: **`Application.ReadWrite.All`** creates the *TUNO Harvest Uploader* registration (single-tenant, `Sites.Selected` as its only permission) and adds a client secret to it; **`AppRoleAssignment.ReadWrite.All`** admin-consents that one permission (an app-role assignment on the Graph service principal — what the portal's consent button writes); **`Sites.FullControl.All`** grants the app `write` on the harvest site and no other (Graph also gates that call on a SharePoint Administrator or site-collection-administrator role). **When the secret route is chosen, the secret goes into the events collector's script body** on every device in the ring, readable by any local administrator and in the Intune Management Extension script cache, and `write` on the site implies `read` of the whole harvest: the panel says so before the button, the certificate route stays the recommended one, and TUNO never stores the secret — it is shown once, kept in memory for the page session, and forgotten on reload. A tenant that would rather not consent these three omits them and runs the helper script instead; the panel takes its output.

Constraints deliberately narrower than the permission allows:

* **Nothing is overwritten.** Every deploy reads the tenant's existing custom profiles first and refuses if one shares the display name or writes the same AppLocker grouping, reporting what it found. TUNO changes only profiles it created in that session.
* **Creating and assigning are separate acts.** Creating a profile reaches no device. Assignment is a second, explicitly confirmed step that names the group and its member count first.
* **Enforcement is gated.** The Enforce profile cannot be created until the audit profile exists in the tenant and an uploaded scan reports nothing blocked and nothing that would have been.
* **Writes are never retried.** A request that fails mid-flight is reported as ambiguous — it may or may not have reached the tenant — rather than sent again.
* **Nothing is deleted.** TUNO has no delete path and no scope that would permit one.

If you would rather TUNO could not write at all, omit the write scopes when you register it — keep the read scopes and drop `DeviceManagementConfiguration.ReadWrite.All`, `DeviceManagementScripts.ReadWrite.All`, `Sites.Create.All`, `Application.ReadWrite.All`, `AppRoleAssignment.ReadWrite.All` and `Sites.FullControl.All`:

```powershell
./New-TunoAppRegistration.ps1 -DelegatedScopes `
  User.Read, SecurityEvents.Read.All, Group.Read.All, GroupMember.Read.All, User.Read.All, `
  DeviceManagementConfiguration.Read.All, DeviceManagementApps.Read.All, `
  DeviceManagementScripts.Read.All, DeviceManagementManagedDevices.Read.All, `
  DeviceManagementServiceConfig.Read.All, DeviceManagementRBAC.Read.All, Device.Read.All, `
  DeviceLocalCredential.ReadBasic.All
```

Every other feature keeps working; step 5 falls back to the three manual routes it documents.

### What TUNO reads

Eight delegated **read-only** scopes cover the Intune tools, added together at build 10317 rather than one per tool — each addition costs every tenant another admin-consent round trip, and eight of those spread over eight builds is a worse deal than one. All eight require admin consent; none can be granted by an ordinary user.

| Scope | Read by |
|---|---|
| `DeviceManagementConfiguration.Read.All` | Configuration profiles, settings catalog, compliance, administrative templates |
| `DeviceManagementApps.Read.All` | App assignments and intents, app protection and configuration policies |
| `DeviceManagementScripts.Read.All` | PowerShell, macOS shell and remediation scripts |
| `DeviceManagementManagedDevices.Read.All` | Device inventory, compliance state, last check-in |
| `DeviceManagementServiceConfig.Read.All` | Enrolment restrictions, Autopilot profiles, ADE tokens, cleanup rules |
| `DeviceManagementRBAC.Read.All` | Intune roles and assignments, scope tags, assignment filters |
| `GroupMember.Read.All` | Group membership, for parent-group assignment inheritance |
| `User.Read.All` | Turning member and actor GUIDs into names, and the primary user's group memberships |
| `Device.Read.All` | The Entra device object — which groups a machine is in, which the Intune record does not say |
| `Device.ReadWrite.All` | The device cleanup's two writes (build 10532): **disable** a stale device object, **delete** a disabled one — two-stage by construction, delete only after disable. Graph additionally gates these writes on the signed-in user's directory role (Cloud Device Administrator / Intune Administrator among the allowed), so consent alone does not open them |
| `Sites.Create.All` | **Write:** creates the T01 harvest site (build 10613) — one site collection, nothing read or written elsewhere in SharePoint. See "What TUNO writes" above |
| `Application.ReadWrite.All` | **Write:** the T01 harvest uploader app registration and its client secret (build 10615) — one single-tenant app with `Sites.Selected` as its only permission. See "What TUNO writes" above |
| `AppRoleAssignment.ReadWrite.All` | **Write:** admin consent for that app's one application permission (build 10615) |
| `Sites.FullControl.All` | **Write:** `write` for that app on the harvest site and no other (build 10615); Graph additionally gates the call on a SharePoint Administrator or site-collection-administrator role |
| `Sites.Read.All` | The harvest site, read through Graph: the site by URL and the device folders and files under `Harvest/`, for T01's **📁 From the harvest site** on Evidence (build 10617). Delegated — what the signed-in admin can open in SharePoint anyway; no admin consent required. Its own scope on purpose: a read is never bought with the `Sites.FullControl.All` write scope that happens to be here |
| `AllSites.Read` **(SharePoint Online, not Graph)** | The one permission on TUNO's registration that is not a Microsoft Graph scope (build 10620). It reads the bytes of one harvest file at a time through SharePoint's own REST (`_api/web/GetFileById(...)/$value`), because a browser cannot get a file's content out of SharePoint through Graph — `/content`, the pre-authenticated download URL and a `$batch` all end on SharePoint's download host, which answers no CORS headers. Delegated, the same "what you can open yourself" boundary as `Sites.Read.All`. The token is minted for the harvest site's host and sent to that host only; every other call TUNO makes still goes to `graph.microsoft.com` and nowhere else |
| `DeviceLocalCredential.ReadBasic.All` | Windows LAPS escrow **metadata** — device name and backup time, for the LAPS audit (build 10429). Graph cannot return a password value through this scope; the `Read.All` variant, which can, is deliberately not taken. Graph additionally gates the endpoint on the signed-in user's directory role (Intune Administrator among the allowed), so consent alone does not open it |

`DeviceManagementConfiguration.Read.All` is listed even though the `ReadWrite` variant above would functionally cover it. Entra consents scopes by name — a token requested for `Read.All` is refused unless `Read.All` itself is consented. The alternative, pointing the read-only tools at the write scope, would mean a tool that only reports could, on any future bug, write.

Each scope is still requested **on the click**, at the moment a tool needs it, not at sign-in. Consenting a scope makes it available to ask for; it does not make it used.


## Why TUNO does not borrow Microsoft's client ID

A common shortcut in community Intune tooling is to sign in using the
**Microsoft Graph PowerShell** public client, `14d82eec-204b-4c2f-b7e8-296a70dab67e`.
It exists in every tenant, carries broad pre-consented delegated permissions,
and needs no app registration at all. [TenuVault](https://github.com/ugurkocde/TenuVault-TUI)
does exactly this, and for a locally installed binary it is a sound choice.

**TUNO cannot do it, and would not want to.**

**It is technically impossible for a browser.** MSAL.js signs in with
authorization code + PKCE and redeems the code with a cross-origin `fetch` to
the token endpoint. Entra permits that only when the redirect URI is registered
as type **Single-page application**; anything else is refused with

```
AADSTS9002326: Cross-origin token redemption is permitted only for the
'Single-Page Application' client-type.
```

The Graph PowerShell app is registered as a **public/native client** — its
redirect URIs are `http://localhost` and friends, which a locally installed
program can listen on and a web page cannot. It has no SPA redirect URI, and
one cannot be added, because the application belongs to Microsoft. This is not
a setting to be worked around; it is the boundary Entra draws between the two
client types.

**And three reasons it would be the wrong answer even if it worked.**

1. **The consent record would name the wrong application.** An administrator
   auditing enterprise applications would see Microsoft Graph PowerShell, not
   TUNO. Nothing in the tenant would record that this tool was used, was
   granted anything, or by whom.
2. **It would inherit consent nobody granted it.** Graph PowerShell is
   *widely* consented already, frequently far more broadly than TUNO asks for.
   Riding on that would mean TUNO silently acquiring permissions no one
   approved for it — the exact opposite of asking per tool, on the click.
3. **The sign-in log would attribute the activity to Microsoft.** Every read
   this tool performs would appear as Graph PowerShell. In an incident review,
   "who read the configuration" would have no answer.

There is also a practical objection: tenants increasingly restrict the Graph
PowerShell app through Conditional Access or by requiring app assignment,
precisely because it is a broad, pre-consented client. A tool built on it stops
working in exactly the security-conscious tenants it most wants to serve.

TUNO's own multi-tenant registration costs one admin-consent round trip per
tenant. That consent is a record, in the customer's directory, that says what
this tool may do and who agreed to it — and the single-tenant option below
removes even the need to trust a registration outside the directory.

## Two ways to run it

1. **Shared, multi-tenant** (tuno.limon-it.nl): one app registration owned by Limon-IT; your tenant consents to it. Fast to adopt; an application outside your directory holds a delegated grant.
2. **Your own, single-tenant**: `./New-TunoAppRegistration.ps1 -SingleTenant` registers TUNO inside your tenant — your own client ID, consent record, redirect URIs and audit trail. Serve your own reviewed copy of this repo. Nothing to trust but the code you read.

## Content-Security-Policy

Set via meta tag (GitHub Pages cannot send headers): `default-src 'self'`; scripts only from this origin; connections to Microsoft Graph, the Microsoft login endpoint, and — since beta 10572 — `api.github.com` and `raw.githubusercontent.com`; no objects, no external frames beyond the MSAL login iframe.

**Why GitHub is in `connect-src`.** The two baseline tools (🍎 T24, 🪟 T27) can read a community baseline straight from its public repository — OpenIntuneBaseline, intune-my-macs — instead of asking you to download a zip. That read is a plain `fetch` with no credentials: the Graph client refuses to attach a tenant token to any host other than `graph.microsoft.com`, and the GitHub read never goes through it. Nothing from your tenant is sent to GitHub; the request names a public repository path and nothing else. The bundled catalogs and the zip road still work with GitHub unreachable or blocked, so a tenant that forbids third-party origins loses nothing but the convenience. If you self-host a reviewed copy and want the stricter policy, remove the two hosts from the meta tag and the fetch buttons will report the refusal.

## Honest limits

* The AppLocker rule evaluation is a faithful model of the engine (deny-over-allow, exceptions, path macros, publisher matching), **not the engine itself**. Pilot in AuditOnly before enforcing — always.
* NTFS and SMB-share ACL checks require a filesystem; the browser cannot perform them. Run [Invoke-AppLockerInspector.ps1](https://github.com/techspence/AppLockerInspector) on a domain-joined host for those, as the report itself reminds you.

## Reporting

Found something? Open a GitHub issue, or reach Limon-IT via [limon-it.nl](https://limon-it.nl).
