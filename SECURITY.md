# TUNO — security & risk documentation

TUNO shares ENCA's architecture one-for-one; this document states the model and what differs. For the long-form reasoning (threat model, residual risks, recommendations), read [ENCA's SECURITY.md](https://github.com/nurejev/enca/blob/main/SECURITY.md) — every argument there applies here unchanged.

## Architecture

* **Static files, no backend.** GitHub Pages serves HTML/CSS/JS; all logic runs in your browser tab. There is no server that could store, log or forward your data.
* **The AppLocker tool reads nothing from your tenant.** The policy XML you import is parsed with the browser's `DOMParser`, analyzed in the tab, and exported back to your disk. It is never transmitted — the Content-Security-Policy in `index.html` only permits connections to `graph.microsoft.com` and `login.microsoftonline.com`, so the code could not upload it anywhere else even if it tried.
* **Sign-in** is a SPA **authorization code + PKCE** flow (MSAL.js). No client secret exists. Tokens live in `sessionStorage` and die with the tab.
* **Permissions are minimal and incremental.** Base scope: `User.Read` (who signed in — nothing else). Tools that read the tenant (Secure Score visualizer, roadmap R02) request their read-only scope at the moment you use them, so consent matches use.

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
