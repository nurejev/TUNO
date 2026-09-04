# TUNO scripts — the parts a browser cannot do

TUNO runs entirely in the browser. That is a deliberate constraint, and it has an
equally deliberate limit: a browser cannot read a directory ACL, verify an Authenticode
signature, or open an event log. Those three facts are most of what you need to know
before you enforce AppLocker.

So T01 (🔐 AppLocker builder & validator) hands out a small set of PowerShell scripts
instead of pretending the browser could work it out. They are served from the site
itself, so the copy you download always matches the build of T01 you are looking at.

| File | What it does | Where the output goes |
|---|---|---|
| `Invoke-TunoAppLockerScan.ps1` | Scans a device and builds a rule set from what it finds | Upload the `.json` bundle to T01 |
| `Convert-TunoAppLockerToIntune.ps1` | Turns an AppLocker policy XML into an Intune custom profile | JSON on disk, or straight into the tenant |
| `AppLocker-Implementation-Checklist.md` | Every check that has to pass before the policy is enforced | Print it, work down it, keep the completed copy |
| `Clear-TunoAppLockerPolicy.ps1` | Removes the policy a device already carries, so the new one lands clean | Intune Remediation or an elevated shell; exits 1 if not clean |
| `Detect-TunoAppLockerPolicy.ps1` | Detection half of that Remediation pair | Exit 1 = AppLocker state present, run the cleanup |
| `Initialize-TunoItToolsFolders.ps1` | Creates the IT-TOOLS house folders with the admin-only ACL the standing allows depend on | Deploy BEFORE the policy, as SYSTEM; exits 1 if a non-admin can still write |
| `Detect-TunoItToolsFolders.ps1` | Detection half of that Remediation pair | Exit 1 = folders missing, writable by a non-admin, or SYSTEM cannot log — run the provisioning |
| `Get-TunoAppControlEvents.ps1` | Harvests CodeIntegrity + AppLocker events from a device into CSV/XML, an HTML report, and the T01 events bundle | IME Logs folder, named `.log` so **Collect diagnostics** gathers it; upload the `AppControlEvents_Bundle_*.log` to T01 |
| `Detect-TunoAppControlEvents.ps1` | Detection half of that pair — **always exits 1 on purpose**: the "remediation" IS the collection | Its compliance numbers mean "the collector ran", never "the device is fine" |
| `Get-TunoAppLockerPolicyHealth.ps1` | Read-only policy health check for a device where the policy is delivered but does not seem to bite: 8000/8001 with the log's own reach, CSP delivery events, services, the MDM store per collection (mode, rules), the effective policy from the cmdlet AND the MDM store, and the AppLocker decisions logged after the store's newest write. Built for MDE Live Response. |
| `Compress-TunoAppControlReport.ps1` | Zips the newest report + bundle for MDE Live Response `getfile` | `%ProgramData%\IT-TOOLS\Apps\ACB-Report_<HOST>_<stamp>.zip`; final line is `ARCHIVE: <path>` |

All are MIT-licensed, like the rest of TUNO. The scan is read-only; the cleanup and the
folder provisioning change exactly what their names say and nothing else; the events
set only reads logs and writes reports. None of them applies an AppLocker policy —
deploying is always a separate, deliberate act.

## The events-collection set

The audit month runs on events, and the events live on the endpoints. The pair
`Detect-TunoAppControlEvents.ps1` + `Get-TunoAppControlEvents.ps1` deploys as an Intune
Remediation against the AUDIT ring on a recurring schedule (T01's step-1 panel creates
it for you). Detection always reports non-compliant — deliberately, because in this
pair the "remediation" is the harvest — so read its console numbers as cadence, not
health, and unassign it when the campaign ends.

Each pass leaves on the device: per-event-ID CSV/XML under the IME `Logs\EventLogs`
folder, an HTML report for reading, and a **JSON events bundle**
(`AppControlEvents_Bundle_*.log`, schema `tuno.applocker.events/1`) for T01. Both of
the last two are named `.log` so Intune's **Collect diagnostics** brings them home;
`Compress-TunoAppControlReport.ps1` zips them for MDE Live Response instead. Upload the
bundle to T01 and every blocked or audited event is matched against the policy draft on
screen — covered, stays-blocked-by-design, or missing-rule, with a recommendation per
file.

It replaces the CloudFlows/michaelsendpoint `Remedate_ACB.ps1` set, with three defects
fixed: MSI/Script event IDs 8005/8007 were never collected (an ENFORCED block on an MSI
left no evidence), a global `SilentlyContinue` made every `catch` dead code, and the
48-ID CodeIntegrity query exceeded the ~23-comparison XPath limit and silently returned
nothing on machines where it mattered.

---

## Run the scan on a clean reference machine

This is the assumption everything else rests on, so it goes first.

The policy this produces says: **everything on the scanned machine is allowed, and
nothing else is.** From a freshly built image with your standard applications
installed, that is a sound baseline. From a device somebody has been working in for
two years it allows two years of accumulation — installers left in Downloads, a dev
toolchain, whatever a colleague once ran out of a zip — which is precisely the
permission AppLocker was deployed to take away.

The scan checks whether the machine looks like a reference image — how many profiles
exist, how many executables are in them, whether it can see Downloads content, browser
profiles, `node_modules`, git working copies — and warns loudly when it cannot believe
you. It will not refuse to run. It will not be quiet either.

### The IT-TOOLS house convention

Everything IT puts on an endpoint lives under `%ProgramData%\IT-TOOLS`, deployed by the
Intune Management Extension running as SYSTEM:

| Folder | Purpose | In the policy |
|---|---|---|
| `IT-TOOLS\Apps` | IT-deployed applications | **Always allowed** — standing rule in every generated Exe/Msi/Script collection |
| `IT-TOOLS\Scripts` | IT-deployed scripts | **Always allowed** — same standing rule |
| `IT-TOOLS\LOGS` | Where the scripts here write their logs (the cleanup's default) | Not allowed — logs are not executables |

The standing rules exist so nobody has to remember to add them. AppLocker has no
`%PROGRAMDATA%` variable, so they are written as `%OSDRIVE%\ProgramData\IT-TOOLS\…`.

**The folders must exist, with the right ACL, BEFORE the policy lands.** ProgramData's
default permissions let a standard user create missing subfolders — and the creator
owns what they create. A user who creates `IT-TOOLS\Apps` before IT does owns a folder
every policy allows. `Initialize-TunoItToolsFolders.ps1` closes that: it creates the
folders, disables inheritance, sets SYSTEM + Administrators full control and Users
read-and-execute, resets anything a user pre-created, verifies by reading the ACL back,
and exits 1 when a non-admin principal can still write. It also proves SYSTEM can
write by writing: a provisioning record is appended to
`IT-TOOLS\LOGS\Initialize-TunoItToolsFolders.log`, because the house scripts log
there as SYSTEM and an ACL that locks SYSTEM out breaks that silently. Deploy it as
SYSTEM before (or with) the audit profile — and with `Detect-TunoItToolsFolders.ps1`
as its detection half, the pair ships as an Intune Remediation (T01 creates it from
the browser). Unlike the cleanup pair, LEAVE THIS ONE ASSIGNED on a schedule: a
folder that drifts writable after provisioning is exactly what the detection exists
to catch and the remediation to re-tighten.

**The rules are only as strong as the ACL.** Apps and Scripts must be writable by
SYSTEM and Administrators alone — an allow rule on a user-writable folder is a door,
not a policy. The scan checks exactly this and raises a loud warning when a
user-writable directory sits inside a house folder, because at that point the standing
allow is a live bypass.

### The model it builds

| | |
|---|---|
| **Allowed** | What is on the reference image, by publisher wherever possible |
| **Allowed** | Anything the Intune Management Extension delivers — named explicitly in the policy, not left to the Windows and Program Files defaults to cover by accident |
| **Allowed** | Anything a local administrator runs — application control does not meaningfully restrict an administrator, and pretending otherwise helps nobody |
| **Blocked** | Everything else, and a standard user's own profile above all |

The two sanctioned ways software reaches these devices are therefore Intune (IME and
the Company Portal) and a local administrator. Both are written into the generated
policy as named rules rather than implied, so that trimming a default rule later
cannot kill software delivery estate-wide with nothing pointing at the cause.

The scan also refuses to except an IME path out of the default allows even when it
finds one user-writable — that would break Win32 app delivery and remediation scripts
silently, days later, on every managed device. It reports the writable IME directory
as a finding instead, which is the more useful answer: fix the permissions.

## The workflow

```
 1. scan          Invoke-TunoAppLockerScan.ps1   on a CLEAN REFERENCE MACHINE
        │             writes TunoAppLockerScan-<DEVICE>-<stamp>.json
        ▼
 2. upload        T01 → Upload scan bundle
        │             the audit, the coverage table and the device evidence
        ▼
 3. review        fix findings, add rules, set enforcement — in the browser
        │
        ▼
 4. export        Policy XML (for a GPO)  ·  Intune profile JSON (for Intune)
        │
        ▼
 5. deploy        assign AUDIT first, to a pilot group. Always.
```

Then go round again: re-scan after a fortnight in audit, upload the new bundle, and
work the blocked list down before you touch enforcement.

---

## 1. `Invoke-TunoAppLockerScan.ps1`

A modern, single-file reimplementation of the approach taken by Microsoft's
[AaronLocker](https://github.com/microsoft/AaronLocker).

### What it does

1. **Finds every directory a non-administrator can write to** under `%WINDIR%`,
   `%ProgramFiles%`, `%ProgramFiles(x86)%` and, on request, `%ProgramData%` and the user
   profiles. This is the whole AppLocker threat model in one sentence: a default rule
   allowing `%PROGRAMFILES%\*` is only as strong as the ACLs underneath it.
2. **Inventories the executables, libraries, scripts, installers and packaged apps** in
   those directories, recording the Authenticode signer in AppLocker's own publisher
   form, the version-resource product and binary names, and the SHA256 hash.
3. **Reads the AppLocker event logs** and summarises what was blocked, or would have
   been.
4. **Builds a policy**: the Microsoft default rules with every writable directory
   injected as an exception, the well-known .NET and scripting LOLBins excepted out of
   the `%WINDIR%` allow, and a publisher-first rule per artifact — hash rules only where
   the file is unsigned.
5. **Writes one bundle** carrying all of the above plus the generated policy and the
   device's current effective policy. That bundle is what T01 imports.

### Running it

```powershell
# Elevated PowerShell, on your standard image with real applications installed.
Set-ExecutionPolicy -Scope Process Bypass -Force
.\Invoke-TunoAppLockerScan.ps1
```

One file lands next to the script:

```
TunoAppLockerScan-<DEVICE>-<yyyyMMdd-HHmm>.json   <- upload this to T01
```

**The effective policy in the bundle includes what Intune delivered.** `Get-AppLockerPolicy
-Effective` merges local and Group Policy only; the policy the AppLocker CSP delivers from
Intune is cached under `%WINDIR%\System32\AppLocker\MDM\<enrollment>\<grouping>\<type>\Policy`
and the cmdlet does not show it — a device enforcing an Intune policy read as "Script: no
rules" until 1.12.0. The scanner now reads that cache, merges it in (rules unioned, the most
restrictive enforcement mode kept) and records the groupings it found under
`effectivePolicy.sources.mdm`.

The generated rule set is inside the bundle. Since 1.11.0 the Audit/Enforce policy
XML is written only with `-WriteXml` (for GPO estates) and is UNREVIEWED — T01 is
where the rules are audited, checked against the Microsoft apps and replayed against
what actually ran, before anything is deployed:

```
AppLockerRules-Audit-<yyyyMMdd-HHmm>.xml      <- only with -WriteXml
AppLockerRules-Enforce-<yyyyMMdd-HHmm>.xml
```

Include the per-user application installs — OneDrive and Teams live in the user profile,
which is user-writable by definition, and they are what a first rollout breaks:

```powershell
.\Invoke-TunoAppLockerScan.ps1 -Scope System,ProgramFiles,ProgramData `
    -Path "$env:LOCALAPPDATA\Microsoft\OneDrive","$env:LOCALAPPDATA\Microsoft\Teams"
```

### Switches worth knowing

| Switch | Default | What it is for |
|---|---|---|
| `-Scope` | `System,ProgramFiles,ProgramData` | Which roots to walk. Add `UserProfiles`, `Custom`. ProgramData is in the default since 1.11.0 — Intune-deployed scripts outside IT-TOOLS live there. |
| `-WriteXml` | off | Also write unreviewed Audit/Enforce policy XML next to the bundle, for GPO estates. Off since 1.11.0: the bundle is the input to T01, and the XML files were one click from a GPO without ever being audited. |
| `-Path` | — | Extra directories always treated as unsafe, whatever their ACLs say. |
| `-KnownAdmin` | — | Principals that are administrators here but are not in the local Administrators group, e.g. `"CONTOSO\Workstation-Admins"`. |
| `-PublisherRuleGranularity` | `PublisherProductBinary` | How specific the generated publisher rules are. |
| `-EventDaysBack` | `30` | How far back to read the AppLocker logs. |
| `-MaxArtifacts` / `-MaxEvents` | `5000` | Safety caps. Hitting one is recorded as a warning, not swallowed. |
| `-DeepScan` | off | Report every writable directory instead of stopping at the first on each branch. |
| `-NoPeSniff` | off | Turn OFF the PE-header check on files with unknown extensions. Since 10553 the check is on by default — a renamed binary still runs — with a never-executable extension list keeping it cheap. (`-SniffUnknownExtensions` is accepted and ignored.) |
| `-NoMicrosoftCoverage` | off | Leave the Microsoft app coverage rules OUT of the generated set. Since 1.10.0 every generated Exe/Dll collection carries standing allows for OneDrive (per-user, by publisher), classic Teams (by publisher) and the Defender platform folder under ProgramData (by path) — the three the tool's coverage check flags on a fresh scan. |
| `-SkipWritableFiles` | off | Skip the user-writable FILE check. By default every executable file inside an admin-only directory has its own DACL read; a hit is excepted by exact path and inventoried for its own rule. |
| `-JSHashRules` | off | Hash rules for unsigned `.js`. They go stale on every update. |
| `-SkipRuleGeneration` | off | Evidence only — let T01 build the rules. |
| `-ConfigPath` | — | A JSON config file supplying any of the above. Explicit parameters win. |
| `-Quiet` | off | Suppress progress. Errors and warnings still print. |

Config file shape:

```json
{
  "Scope": ["System", "ProgramFiles", "ProgramData"],
  "Path": ["%LOCALAPPDATA%\\Microsoft\\OneDrive"],
  "KnownAdmin": ["CONTOSO\\Workstation-Admins"],
  "PublisherRuleGranularity": "PublisherProduct",
  "EventDaysBack": 90
}
```

### Hash rules, and why some files do not get one

AppLocker matches a hash rule for a PE file or an installer on the **Authenticode**
hash — which omits the file's checksum and certificate tables — not on the flat file
hash `Get-FileHash` returns. The only reliable source for it is
`Get-AppLockerFileInformation`.

So when the AppLocker module is not available (or cannot read a particular file), the
scan records the flat SHA256 as *evidence*, tags it `hashSource: "flat SHA256"`, and
**refuses to build a hash rule from it** — a rule built on the wrong hash looks
perfectly correct in the policy and matches nothing, which under enforcement is a
blocked user and a rule that says otherwise. The bundle records how many files this
affected. Script files (`.ps1`, `.bat`, `.cmd`, `.vbs`, `.js`, `.wsf`) are hashed flat,
so they are unaffected.

If you need those rules, run the scan in Windows PowerShell 5.1 on a device where the
AppLocker module is present.

### Run it elevated

Unelevated it cannot read every DACL or open the event logs. It will still run, and the
bundle will record that the run was partial — T01 renders that as a finding rather than
letting a quiet scan read as a clean one. But the result is not what you want to make
decisions from.

### What it does NOT do

It does not apply a policy, touch the local GPO, or start the Application Identity
service. Deploying is a separate, deliberate act.

---

## 2. `Convert-TunoAppLockerToIntune.ps1`

AppLocker has no settings-catalog surface in Intune. The supported route is a Windows
custom profile carrying one OMA-URI string per rule collection:

```
./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/<Grouping>/<TYPE>/Policy
```

where `<TYPE>` is `EXE`, `MSI`, `Script`, `DLL` or `StoreApps`, and the value is the
`<RuleCollection>` element verbatim.

```powershell
# Offline (default) — write the profile JSON, review before anything touches a tenant
.\Convert-TunoAppLockerToIntune.ps1 `
    -XmlPath .\AppLockerRules-Audit-20260819-1530.xml,.\AppLockerRules-Enforce-20260819-1530.xml `
    -DisplayName 'Win - SEC - Device Security - AppLocker'
# No -Grouping: one is generated as AppLocker-<guid> and printed. Record it.

# Online — create the profile in the tenant
.\Convert-TunoAppLockerToIntune.ps1 -Online -TenantId 'contoso.onmicrosoft.com' `
    -XmlPath .\AppLockerRules-Audit-20260819-1530.xml `
    -DisplayName 'Win - SEC - Device Security - AppLocker'
# No -Grouping: one is generated as AppLocker-<guid> and printed. Record it.
```

Online mode needs `Microsoft.Graph.Authentication` and the
`DeviceManagementConfiguration.ReadWrite.All` scope. If a Graph session is already open
it is reused as-is; `-TenantId` doubles as a guard against creating the profile in the
wrong customer's tenant.

### The grouping is the important parameter — make it unique

The grouping segment names a CSP node. Microsoft's guidance on the AppLocker CSP:

> *"Delete/unenrollment is not properly supported unless Grouping values are unique
> across enrollments. If multiple enrollments use the same Grouping value, then
> unenrollment will not work as expected since there are duplicate URIs that get deleted
> by the resource manager… The best practice is to use a randomly generated GUID."*

So **one grouping per profile**, ideally a GUID. Two profiles sharing a grouping write
the same OMA-URIs, and unassigning one can delete the nodes the other still depends on.

To move from audit to enforce, **edit the profile you already have** rather than
deploying a second one beside it. One profile, one grouping, changed in place — no
merge, no duplicate URIs, and nothing to unassign in the right order.

### Deploying does not clear what came before

Every AppLocker delivery path **adds** rather than replaces:

- **Intune CSP** — each `{Grouping}/{Type}/Policy` is a node with Add/Delete/Get/Replace
  access. A profile carrying no DLL setting leaves an existing DLL node untouched.
- **Group Policy** — policies merge; Group Policy "doesn't overwrite or replace rules
  that are already present in a linked GPO".
- **Local policy** — persists until explicitly cleared.

A collection your new policy simply **omits keeps running**. If it was `NotConfigured`
with rules, it keeps *blocking*, while the policy you just deployed appears to say
nothing about that type at all.

### Migrating a device that already has a policy

Three steps, in this order, because each one exists to make the next one true:

1. **Unassign** the old Intune profile (or unlink the old GPO). Skip this and the
   cleanup is a loop — everything it removes returns at the next sync.
2. **Run `Clear-TunoAppLockerPolicy.ps1`** — T01's deploy section can create the
   Remediation pair in the tenant for you (unassigned, house name prefilled), or
   deploy it yourself as an Intune Remediation paired with
   `Detect-TunoAppLockerPolicy.ps1`, or by hand in an elevated shell. It backs up the
   effective policy, the local policy and the SrpV2 registry key first; replaces the
   local policy with the empty (genuinely inert) one; clears the SrpV2 tattoo; and
   verifies the effective policy is actually empty afterwards, exiting 1 when it is
   not so Intune reports the device rather than the wish. It deliberately **preserves
   the AppLocker event logs** (the 8003/8006 audit evidence) and **leaves AppIDSvc
   running** — the policy you deploy next needs both.
3. **Deploy the new policy under a new grouping.** Never reuse the old deployment's
   name or grouping — removal of shared groupings is broken by design in the CSP.

If the Remediation pair stays assigned after the new policy lands, the detection will
read the new policy as state to remove. Scope it to the migration window and unassign
it when the window closes.

To actually remove one: delete the OMA-URI from the profile that set it (Intune sends a
Delete), or clear the rules in the GPO that carries them. Upload a scan bundle to T01 and
the audit names every collection the device is running that the policy on screen does not
contain.

**Both apply and delete reboot the device** — the CSP's Policy nodes carry automatic
reboot behaviour. Plan a window for the removal as well as the rollout.

### DLL is omitted — and `NotConfigured` is never written

AppLocker evaluates every DLL load. Enforced, it cripples the device; even AuditOnly
buries the event log under Microsoft-signed System32 libraries, EDR AMSI providers and
.NET native images.

An earlier version shipped the DLL rules inside a `NotConfigured` collection and called
them "documented and inert". **They would not have been inert.** From Microsoft's own
documentation:

> **Not configured**: Despite the name, this enforcement mode doesn't mean the rules are
> ignored. On the contrary, if any rules exist in a rule collection that is "not
> configured", the rules **will be enforced** unless a policy with a higher precedence
> changes the enforcement mode to Audit only. Since this enforcement mode can be
> confusing for policy authors, you should avoid using this value in your AppLocker
> policies.

So the three states are:

| Collection state | What actually happens |
|---|---|
| Absent from the policy | Nothing enforced for that type |
| Present, `NotConfigured`, **no rules** | Nothing enforced |
| Present, `NotConfigured`, **with rules** | **Rules are enforced** |

Absence is the only genuinely inert state, so that is what both scripts produce. The DLL
artifacts are still recorded in the scan bundle, so the collection can be taken on later
as its own project with the log volume and the application-start cost accepted on
purpose. Pass `-EnforceDllCollection` to include it — it will then be a collection that
**blocks**.

Neither script ever writes `NotConfigured` into a generated policy, for any collection.

### It creates, it does not assign

Assignment is a deliberate act in the portal or a separate Graph call. AppLocker is not
a policy you want landing on a group by accident.

---

## Versioning — the rule, and how it is enforced

Each script carries two numbers:

- **`$script:ScriptVersion`** — the file's own history, printed in the banner and recorded
  in the scan bundle. It is what identifies a copy that has been sitting on a share for
  six months.
- **`$script:TunoBuild`** — the site build that served it, which is what ties a bundle
  back to a commit.

**Edit a script, bump its version.** Both the constant and the `Version` line in the
`.NOTES` block, which have to agree because the banner reads one and a human reads the
other.

This was forgotten twice in three builds, so it is no longer a thing to remember.
`_to_delete/check-script-versions.js` compares the working tree against `HEAD` and fails
if a script's content changed while its version did not — and separately holds
`TunoBuild` to the build in `js/version.js`. Run it before committing:

```bash
node _to_delete/check-script-versions.js
```

## Requirements

- Windows. Both scripts run on **Windows PowerShell 5.1 and PowerShell 7+**.
- `Invoke-TunoAppLockerScan.ps1` needs no modules. It uses the AppLocker cmdlets when
  they are present, because `Get-AppLockerFileInformation` gives the authoritative
  publisher string, and derives the publisher from the certificate subject when they are
  not — recording which source produced each name so you can weigh it.
- `Convert-TunoAppLockerToIntune.ps1` needs `Microsoft.Graph.Authentication` only in
  `-Online` mode.
- No Sysinternals AccessChk, no Excel, no COM, no `Out-GridView`.

## Prior art

The scanning strategy follows Microsoft's **AaronLocker** by Aaron Margosis. The static
check set T01 runs against the result comes from Spencer Alessi's **AppLockerInspector**.
Neither project is vendored here; these are independent implementations written for the
TUNO workflow, and the header of each script lists where they deliberately differ.
