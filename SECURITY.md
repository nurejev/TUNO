# TUNO — security & risk documentation

TUNO shares ENCA's architecture one-for-one; this document states the model and what differs. For the long-form reasoning (threat model, residual risks, recommendations), read [ENCA's SECURITY.md](https://github.com/nurejev/enca/blob/main/SECURITY.md) — every argument there applies here unchanged.

## Architecture

* **Static files, no backend.** GitHub Pages serves HTML/CSS/JS; all logic runs in your browser tab. There is no server that could store, log or forward your data.
* **The AppLocker analysis reads nothing from your tenant.** The policy XML or scan bundle you import is parsed in the browser, analyzed in the tab, and exported back to your disk. It is never transmitted — the Content-Security-Policy in `index.html` only permits connections to `graph.microsoft.com` and `login.microsoftonline.com`, so the code could not upload it anywhere else even if it tried. Import, audit, coverage, rewrite and export all work without ever touching Intune.
* **Sign-in** is a SPA **authorization code + PKCE** flow (MSAL.js). No client secret exists. Tokens live in `sessionStorage` and die with the tab.
* **Permissions are minimal and incremental.** Base scope: `User.Read` (who signed in — nothing else). Everything beyond it is requested at the moment it is used, so consent matches use.

### The one thing TUNO writes

Step 5 of the AppLocker tool can create the Intune custom profile in your tenant. That is the only write TUNO performs, and it holds one write scope: **`DeviceManagementConfiguration.ReadWrite.All`** (plus read-only **`Group.Read.All`** to find the pilot group and read its member count). Graph offers no narrower split — the read that checks for an existing profile and the write that creates one are the same scope.

Constraints deliberately narrower than the permission allows:

* **Nothing is overwritten.** Every deploy reads the tenant's existing custom profiles first and refuses if one shares the display name or writes the same AppLocker grouping, reporting what it found. TUNO changes only profiles it created in that session.
* **Creating and assigning are separate acts.** Creating a profile reaches no device. Assignment is a second, explicitly confirmed step that names the group and its member count first.
* **Enforcement is gated.** The Enforce profile cannot be created until the audit profile exists in the tenant and an uploaded scan reports nothing blocked and nothing that would have been.
* **Writes are never retried.** A request that fails mid-flight is reported as ambiguous — it may or may not have reached the tenant — rather than sent again.
* **Nothing is deleted.** TUNO has no delete path and no scope that would permit one.

If you would rather TUNO could not write at all, omit the write scope when you register it — keep the read scopes and drop `DeviceManagementConfiguration.ReadWrite.All`:

```powershell
./New-TunoAppRegistration.ps1 -DelegatedScopes `
  User.Read, SecurityEvents.Read.All, Group.Read.All, GroupMember.Read.All, User.Read.All, `
  DeviceManagementConfiguration.Read.All, DeviceManagementApps.Read.All, `
  DeviceManagementScripts.Read.All, DeviceManagementManagedDevices.Read.All, `
  DeviceManagementServiceConfig.Read.All, DeviceManagementRBAC.Read.All
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
| `User.Read.All` | Turning member and actor GUIDs into names |

`DeviceManagementConfiguration.Read.All` is listed even though the `ReadWrite` variant above would functionally cover it. Entra consents scopes by name — a token requested for `Read.All` is refused unless `Read.All` itself is consented. The alternative, pointing the read-only tools at the write scope, would mean a tool that only reports could, on any future bug, write.

Each scope is still requested **on the click**, at the moment a tool needs it, not at sign-in. Consenting a scope makes it available to ask for; it does not make it used.

## Two ways to run it

1. **Shared, multi-tenant** (tuno.limon-it.nl): one app registration owned by Limon-IT; your tenant consents to it. Fast to adopt; an application outside your directory holds a delegated grant.
2. **Your own, single-tenant**: `./New-TunoAppRegistration.ps1 -SingleTenant` registers TUNO inside your tenant — your own client ID, consent record, redirect URIs and audit trail. Serve your own reviewed copy of this repo. Nothing to trust but the code you read.

## Content-Security-Policy

Set via meta tag (GitHub Pages cannot send headers): `default-src 'self'`; scripts only from this origin; connections only to Microsoft Graph and the Microsoft login endpoint; no objects, no external frames beyond the MSAL login iframe.

## Honest limits

* The AppLocker rule evaluation is a faithful model of the engine (deny-over-allow, exceptions, path macros, publisher matching), **not the engine itself**. Pilot in AuditOnly before enforcing — always.
* NTFS and SMB-share ACL checks require a filesystem; the browser cannot perform them. Run [Invoke-AppLockerInspector.ps1](https://github.com/techspence/AppLockerInspector) on a domain-joined host for those, as the report itself reminds you.

## Reporting

Found something? Open a GitHub issue, or reach Limon-IT via [limon-it.nl](https://limon-it.nl).
