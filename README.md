# TUNO — Tenant Utilities for iNtune Operations

**https://tuno.limon-it.nl** · by [Limon-IT](https://limon-it.nl)

TUNO is [ENCA](https://github.com/nurejev/enca)'s sister tool: the same idea — static files running entirely in your browser, minimal delegated Microsoft Graph permissions asked per tool, no server, nothing stored — applied to **Intune and endpoint security** instead of Conditional Access. Same layout, same branding mechanism, same security model, same release discipline.

## Tools

| # | Tool | Status |
|---|------|--------|
| T01 | 🔐 **AppLocker builder & validator** — import an AppLocker policy XML, audit it with the [AppLockerInspector](https://github.com/techspence/AppLockerInspector) check set, verify the Microsoft apps a locked-down estate still needs (per-user OneDrive first among them) are actually allowed, build the missing rules publisher-first, export policy XML + Markdown report. Reads nothing from the tenant. | BETA |
| T21 | 📊 **Secure Score visualizer** — the tenant's Microsoft Secure Score over `security/secureScores` and the control catalogue: the gauge, the similar-tenant and all-tenant comparison, the per-category breakdown with Microsoft's own comparison figures as ticks on each bar, the timeline of every reading Graph holds with what improved and regressed, and the improvement actions ranked **cheapest points first** — an ordering openly labelled as ours, not Microsoft's. Graph keeps about ninety days, so it exports a versioned JSON **snapshot** (readings plus the catalogue they were read under) and uploads them back to reach further; a snapshot from a different tenant is refused rather than merged. Markdown, controls CSV, history CSV. `SecurityEvents.Read.All`, asked on the click. Reads only. | BETA |
| R03 | 🖥 Intune device analyzer | roadmap |

## The baselines in the repository

`baseline/` **is what the app reads.** `baseline/macos/` and `baseline/windows/` hold the CloudFellows baselines — one JSON per policy under its section folder, a `README.md` index, and `catalog.json`, the file 🍎 T24 / 🪟 T27 fetch from this site when they open. `baseline/community/openintunebaseline/` and `baseline/community/intune-my-macs/` hold the community baselines the same way, cut verbatim from their repositories. Written by the app, never by hand: on the baseline tenant, Export → 📁 Repo folder (zip) or Upstream → 📁 Community catalog folder (zip), unzipped at the repository root.

## Architecture & security

* **Static site, no backend.** GitHub Pages serves the files; everything runs in your browser tab. An imported AppLocker XML is parsed locally and never leaves your session.
* **Sign-in** is a SPA authorization-code + PKCE flow (MSAL.js), no client secret. Base scope is `User.Read`; everything beyond it is asked for on the click (incremental consent).
* **One write scope**, `DeviceManagementConfiguration.ReadWrite.All`, used only by step 5 of the AppLocker tool to create the Intune profile — with a refusal-to-overwrite check, assignment as a separate confirmed act, and enforcement gated behind a clean audit. See [SECURITY.md](SECURITY.md); omit the scope at registration and everything else still works.
* **Your own registration:** high-assurance environments can register TUNO in their own tenant — `./New-TunoAppRegistration.ps1 -SingleTenant` — and point `js/authConfig.local.js` at it. See [SECURITY.md](SECURITY.md).
* **Forking / rebranding:** everything identity-shaped lives in `js/branding.js`.

## Release discipline (shared with ENCA)

Every tool change ships complete in one commit: the `js/changelog.js` entry, the home-tile NEW/BETA/UPDATED tag in `index.html`, the `TOOL_VERSIONS` bump, `APP_BUILD.build` + the `?v=` cache-busting numbers — and `js/promote.js` when the change lands on the beta channel. New tools carry the BETA tag until cleared.

Build numbers use two series (see `js/version.js`): production builds are plain integers on `main`; beta builds are five digits `NNNII` (`cycle` + iteration), rendering as `v1.0.NNN-beta.II`.

## Beta channel

Production is this repo's `main`, deployed by GitHub Pages to the custom domain. The beta channel is a second repo (`tuno-beta`) whose Pages site serves from its default `github.io` URL — no DNS, no CNAME (the `CNAME` file must NOT exist in the beta repo, or the two sites fight over the domain). Work lands on the `beta` branch here, gets pushed to the beta repo's `main`, is tested on the beta URL, and only then reaches `main` and production. Any deployment on a host other than `BRANDING.host` wears a permanent **BETA — not production** ribbon and a `[BETA]` page title.

One-time setup: create the beta repo, add it as a remote named `tuno-beta` (NOT `beta` — a remote sharing the branch's name makes every bare `beta` ambiguous), enable Pages on it, and add the beta URL as an SPA redirect URI on the app registration.

Day-to-day release flow:

```bash
# work lands on the beta branch (never directly on main)
git checkout beta

# deploy to the beta site and test
git push tuno-beta beta:main   # deploys the beta Pages site
git push origin beta:beta      # back up the branch (explicit :beta — never a bare push)

# happy? promote to production
git checkout main
git merge beta
git push origin main           # GitHub Pages deploys tuno.limon-it.nl

# keep beta moving with main afterwards
git checkout beta
git merge main
```

## Credits

* AppLocker audit check set after **Spencer Alessi** (@techspence), [AppLockerInspector](https://github.com/techspence/AppLockerInspector).
* Built on the ENCA shell by Limon-IT.

## License

See [LICENSE](LICENSE).
