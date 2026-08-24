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

- [ ] **`NotConfigured` appears nowhere in the policy.** Read this one before the rest of the section, because the name is a lie. `NotConfigured` does **not** mean "off":

  > *"Despite the name, this enforcement mode doesn't mean the rules are ignored. On the contrary, if any rules exist in a rule collection that is 'not configured', the rules **will be enforced** … you should avoid using this value in your AppLocker policies."* — Microsoft

  | Collection state | What actually happens |
  |---|---|
  | **Absent** from the XML | Nothing enforced for that type — default-allow |
  | Present, `NotConfigured`, **no rules** | Nothing enforced |
  | Present, `NotConfigured`, **with rules** | **Rules are enforced** |

  So a collection marked `NotConfigured` and carrying rules is blocking *today*, while reading as inactive to whoever opens the policy next. Set every collection explicitly to `AuditOnly` or `Enabled`. If you want a type left alone, leave the collection **out**.

- [ ] **Every collection you intend to govern is present**, and set explicitly. A collection absent from the XML is default-allow for that type — silently, and that is fine only if it is deliberate.
- [ ] **No collection is `Enabled` with zero rules.** That blocks the entire type outright. It is the single fastest way to brick a fleet.
- [ ] **Every enforced collection has an administrator rule** — path `*` for `S-1-5-32-544`. Without it you can lock administrators out of their own remediation.
- [ ] **The default rules are present**: Program Files, Windows, and the administrator rule, per collection.
- [ ] **The DLL collection is absent** unless you have a specific reason and the headroom — absent, *not* `NotConfigured`, for the reason directly above. AppLocker evaluates every DLL load: enforced it measurably slows application start; even `AuditOnly` buries the event log under Microsoft-signed system libraries, EDR components and .NET native images. If you do take DLL on, do it as its own project.
- [ ] **Script collection**: understand that `AuditOnly` does **not** enforce PowerShell Constrained Language Mode. Only `Enabled` does. If constrained language is part of your threat model, audit is not a partial win — it is nothing.

### The writable-path check — this is the one that matters

A rule allowing `%PROGRAMFILES%\*` is only as strong as the ACLs underneath it.

- [ ] Every **user-writable directory** under Program Files and Windows appears as an **exception** on the corresponding allow rule.
- [ ] The exception list came from a **scan of the real image**, not from a template. Vendors create writable subdirectories under Program Files constantly.
- [ ] **No allow rule reaches a user profile.** `%OSDRIVE%\Users\*`, `%LOCALAPPDATA%`, `%APPDATA%`, `%TEMP%` — if any of these is allowed for a broad principal, the policy does not do the thing it was deployed to do.
- [ ] **No UNC path is allowed** unless you have verified both the share and the NTFS ACLs on it. A browser cannot check this and neither can the XML.
- [ ] **No wildcard reaches a drive root** — `*`, `C:\*`, `%OSDRIVE%\*` for anyone other than administrators.

### The IT-TOOLS house folders

- [ ] **The house folders were provisioned BEFORE the policy** — `Initialize-TunoItToolsFolders.ps1`, as SYSTEM. ProgramData lets a standard user create missing subfolders and own them; a user who creates `IT-TOOLS\Apps` first owns a folder every policy allows. The script disables inheritance, sets admin-only writes, resets pre-created folders, and exits 1 if a non-admin can still write.
- [ ] The standing allows for `%OSDRIVE%\ProgramData\IT-TOOLS\Apps` and `…\Scripts` are present in Exe, MSI and Script — every generated policy carries them so IT-deployed tooling always runs, without anyone remembering to add the rule.
- [ ] **The ACL on both folders restricts writes to SYSTEM and Administrators.** This is the condition the standing allows depend on: a user-writable folder with a standing allow is a live bypass. The scan checks it — a clean scan with no IT-TOOLS warning means it held.
- [ ] `IT-TOOLS\LOGS` exists for script logging (the cleanup writes there) and has **no** allow rule — logs are not executables.

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
- [ ] The **grouping value** (Intune OMA-URI) is decided, and it is **unique to this profile** — a randomly generated GUID is Microsoft's stated best practice. Two profiles sharing a grouping write the same OMA-URIs, and unassigning one can delete the nodes the other still depends on: *"Delete/unenrollment is not properly supported unless Grouping values are unique."*
- [ ] You are planning to go from audit to enforce by **editing that one profile**, not by assigning a second profile beside it. One profile, one grouping, changed in place.
- [ ] You know that **deploying does not clear what came before.** Every path adds rather than replaces — the CSP keeps one node per grouping and type until something explicitly deletes it, Group Policy merges rules from every linked GPO, and local policy persists until cleared. A collection your new policy omits **keeps running**, and if it was `NotConfigured` with rules it keeps *blocking*.
- [ ] You have listed what the target devices are **already** running (`Get-AppLockerPolicy -Effective -Xml`, or upload a scan bundle to T01 and read the carry-over findings) and decided, per collection, whether to absorb it into this policy or remove it deliberately.
- [ ] If they carry an old policy, the migration is planned as **three steps in order**: unassign the old profile or GPO first (cleanup without unassignment is a loop — it all returns at the next sync), run `Clear-TunoAppLockerPolicy.ps1` to sweep the local policy and the SrpV2 registry tattoo, then deploy the new policy under a **new grouping**. The cleanup backs up before it removes, preserves the audit event logs, leaves AppIDSvc running, and exits 1 when the device is not actually clean.
- [ ] If the cleanup goes out as an Intune Remediation (paired with `Detect-TunoAppLockerPolicy.ps1`), it is scoped to the migration window and **unassigned once the new policy is live** — left in place, the detection reads the new policy as state to remove.
- [ ] You have a **maintenance window**. The AppLocker CSP's Policy nodes carry automatic reboot behaviour — on apply *and* on delete. Neither the rollout nor the rollback is quiet.
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
- **`NotConfigured` is the most dangerous word in an AppLocker policy.** A collection in that state *with rules in it* is enforced. Never write it deliberately; if you want a type left alone, omit the collection.
- **A collection absent from the XML is not "off", it is default-allow.** Which is the opposite of the line above — the difference is whether the collection carries rules, and that is exactly why the value should never be used.
- **`AuditOnly` on the Script collection does not enforce Constrained Language Mode.**
- **Hash rules break on the next update.** Every single one.
- **Publisher rules match the signing certificate's subject**, not the vendor's name as you'd write it.
- **`%PROGRAMFILES%` matches both Program Files trees.** `%SYSTEM32%` matches System32 and SysWOW64.
- **Removing an Intune assignment removes the policy** — but a device that cannot run its management agent cannot be told that. Test the removal path early.
- **Omitting a collection does not remove it.** Deployment adds; it does not replace. What the device already runs keeps running unless you delete it at the source.
- **Two profiles must never share a grouping.** Unassigning one can delete the CSP nodes the other depends on. Use a GUID per profile.
- **Applying and removing an AppLocker CSP policy both reboot the device.**
- **RDS and multi-session hosts** need their own thought: one writable profile directory per concurrent user.

---

*This checklist ships with TUNO. If a check here saved you, or one is missing,*
*that is worth saying — the list is only as good as the outages it has seen.*
