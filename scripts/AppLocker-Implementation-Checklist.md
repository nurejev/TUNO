# AppLocker implementation checklist

Everything that has to be true before an AppLocker policy is enforced, in the order
you need it. Print it, work down it, and keep the completed copy — when something
breaks in three months, the useful question is which of these was skipped.

Generated for use with **TUNO — T01 AppLocker builder & validator**
(<https://tuno.limon-it.nl>). Nothing here is TUNO-specific: it applies to any
AppLocker policy however it was built.

The model this assumes:

| | |
|---|---|
| **Allowed** | What is on the reference image |
| **Allowed** | Anything the Intune Management Extension delivers |
| **Allowed** | Anything a local administrator runs |
| **Blocked** | Everything else — a standard user's own profile above all |

---

## 0. Before you generate anything

- [ ] The scan ran on a **clean reference image** — freshly built, standard applications installed, nobody has worked in it. Not an admin's laptop.
- [ ] The scan ran **elevated**. An unelevated scan cannot read every DACL or the event logs, and reports a clean result it has not earned.
- [ ] The image is the one you actually deploy. A policy built from last year's image blocks this year's applications.
- [ ] You know which **rule collections** you intend to govern: EXE, MSI, Script, DLL, Packaged apps.
- [ ] You have somewhere to put a **second scan** later. This is a loop, not a one-off.

---

## 1. Read the XML before anyone else does

- [ ] **Every collection you intend to govern is present.** A collection absent from the XML is `NotConfigured` on the endpoint — default-allow for that type, silently.
- [ ] **No collection is `Enabled` with zero rules.** That blocks the entire type outright. It is the single fastest way to brick a fleet.
- [ ] **Every enforced collection has an administrator rule** — path `*` for `S-1-5-32-544`. Without it you can lock administrators out of their own remediation.
- [ ] **The default rules are present**: Program Files, Windows, and the administrator rule, per collection.
- [ ] **DLL is `NotConfigured`** unless you have a specific reason and the headroom. AppLocker evaluates every DLL load: enforced it measurably slows application start; even `AuditOnly` buries the event log under Microsoft-signed system libraries, EDR components and .NET native images.
- [ ] **Script collection**: understand that `AuditOnly` does **not** enforce PowerShell Constrained Language Mode. Only `Enabled` does. If constrained language is part of your threat model, audit is not a partial win — it is nothing.

### The writable-path check — this is the one that matters

A rule allowing `%PROGRAMFILES%\*` is only as strong as the ACLs underneath it.

- [ ] Every **user-writable directory** under Program Files and Windows appears as an **exception** on the corresponding allow rule.
- [ ] The exception list came from a **scan of the real image**, not from a template. Vendors create writable subdirectories under Program Files constantly.
- [ ] **No allow rule reaches a user profile.** `%OSDRIVE%\Users\*`, `%LOCALAPPDATA%`, `%APPDATA%`, `%TEMP%` — if any of these is allowed for a broad principal, the policy does not do the thing it was deployed to do.
- [ ] **No UNC path is allowed** unless you have verified both the share and the NTFS ACLs on it. A browser cannot check this and neither can the XML.
- [ ] **No wildcard reaches a drive root** — `*`, `C:\*`, `%OSDRIVE%\*` for anyone other than administrators.

### Do not break your own delivery mechanism

- [ ] **`%WINDIR%\IMECache` is allowed and NOT excepted.** Intune stages Win32 apps there and runs the installer from it. Except it and app delivery dies estate-wide, silently, days later.
- [ ] **The Intune Management Extension folder is allowed and NOT excepted** — remediation scripts and script policies run from it.
- [ ] **Packaged apps are allowed** (`Appx` collection, signed packaged apps) or the **Company Portal** stops working, and with it every user-driven install.
- [ ] If those paths came back **user-writable** in the scan: fix the directory permissions. Do **not** solve it with an exception.
- [ ] If you use Configuration Manager as well, `%WINDIR%\ccmcache` gets the same treatment.

### Rule quality

- [ ] **Publisher rules name a publisher.** `PublisherName="*"` allows every signed binary on earth and is not application control.
- [ ] Publisher rules are scoped to a **product** where the vendor ships more than you intend to allow.
- [ ] **No upper version bound on a named vendor product** — pinning one breaks the rule at the vendor's next release. Track advisories instead.
- [ ] **Hash rules are understood to expire.** They stop matching the moment the file is updated. Every hash rule needs an owner and a review date.
- [ ] **Deny rules are used sparingly and deliberately.** In AppLocker, deny beats allow — including the administrator rule. A deny rule locks out administrators too.
- [ ] The **LOLBins** are dealt with: `InstallUtil`, `IEExec`, `RegAsm`, `RegSvcs`, `MSBuild`, `Microsoft.Workflow.Compiler`, `mshta`, `PresentationHost`, `wmic`, `cipher`, `runas`, `bash`, `wsl`. Prefer exceptions on the `%WINDIR%` allow over deny rules, so administrators keep them.

---

## 2. Coverage — will people still be able to work

Check each of these is **allowed for a standard user**, not just for an admin:

- [ ] **OneDrive, per-user install** (`%LOCALAPPDATA%\Microsoft\OneDrive`). The single most common thing a first AppLocker policy silently breaks.
- [ ] **Microsoft Teams** — per-user install path, and the new machine-wide one if you have moved.
- [ ] **Microsoft Edge**, and **WebView2** — half your line-of-business apps embed it.
- [ ] **Office click-to-run**, including the updater.
- [ ] **Company Portal** and the Intune Management Extension.
- [ ] **EDR / antivirus agent**, including its update path. Some ship components into `ProgramData`.
- [ ] **VPN client**, **printer drivers**, **conferencing clients**.
- [ ] **Logon and startup scripts**, GPO scripts, scheduled tasks that run as the user.
- [ ] Anything your business actually runs that came from a vendor who has never heard of AppLocker.
- [ ] **Line-of-business apps that install per-user.** These are the ones nobody remembers until enforcement day.

---

## 3. Before you assign anything

- [ ] The **Application Identity service** (`AppIDSvc`) is running and set to start automatically on the targets. Without it AppLocker does nothing — it does not block, and it does not log. A policy on a device with the service stopped gives you false confidence, not protection.
- [ ] You have a deployment method for that service — a configuration profile or a remediation script — not a one-off manual change.
- [ ] The policy is **AuditOnly**. Every collection. No exceptions to this rule.
- [ ] The **pilot group** is named, small, and contains people who will tell you when something breaks.
- [ ] The **grouping value** (Intune OMA-URI) is decided. Two profiles sharing a grouping replace each other; two with different groupings are merged by the CSP. Use the **same** grouping for audit and enforce so the enforced one replaces rather than stacks.
- [ ] **You have tested the way back.** Remove the assignment on a pilot device and confirm the policy actually clears. Do this before the estate depends on it, not after.
- [ ] A **local administrator account** you can still use exists and works on the pilot devices.
- [ ] The **helpdesk knows** what an AppLocker block looks like to a user, and what to collect.

---

## 4. The audit period

- [ ] The audit policy has been in place across a **month-end**, a **patch cycle**, and at least one **new starter**. A quiet week proves nothing.
- [ ] You are collecting events **8003 / 8006 / 8021** — the things that *would* have been blocked.
- [ ] Every recurring event has been either **allowed deliberately** or **traced to something that should not be running**.
- [ ] You have **re-scanned** at least once and fed the new bundle back through, rather than assuming the first policy was right.
- [ ] Nothing in the log is unexplained. "Probably fine" is not a finding.

---

## 5. Enforcement

- [ ] Enforcement is going out **in rings**, not to the estate.
- [ ] The first ring is people who can be unblocked quickly.
- [ ] You are watching **8004 / 8007 / 8022** — actual blocks — for the first full working week.
- [ ] There is a written **exception process**: who asks, who approves, how a rule gets added, how long it takes. Without one, the first urgent block becomes a policy rollback.
- [ ] **DLL stays `NotConfigured`** through this. Do it as its own project, later, if at all.

---

## 6. Living with it

- [ ] **Re-baseline when the reference image is rebuilt.** A new image means a new scan and a diff, not a new policy.
- [ ] **Hash rules are reviewed** on a schedule — they expire silently.
- [ ] New applications go through the **exception process before deployment**, not after users complain.
- [ ] The policy is in **source control** with the scan bundle that produced it, so the next person can see what it was built from.
- [ ] Someone **owns** this. An application control policy with no owner becomes a pile of allow rules within a year.

---

## Things that catch people out

- **AppLocker does not restrict administrators.** It cannot. Anyone with admin rights can bypass any application control solution. This policy is about standard users; do not let anyone believe otherwise.
- **Deny beats allow, always** — including over the administrator rule.
- **A collection absent from the XML is not "off", it is default-allow.**
- **`AuditOnly` on the Script collection does not enforce Constrained Language Mode.**
- **Hash rules break on the next update.** Every single one.
- **Publisher rules match the signing certificate's subject**, not the vendor's name as you'd write it.
- **`%PROGRAMFILES%` matches both Program Files trees.** `%SYSTEM32%` matches System32 and SysWOW64.
- **Removing an Intune assignment removes the policy** — but a device that cannot run its management agent cannot be told that. Test the removal path early.
- **RDS and multi-session hosts** need their own thought: one writable profile directory per concurrent user.

---

*This checklist ships with TUNO. If a check here saved you, or one is missing,*
*that is worth saying — the list is only as good as the outages it has seen.*
