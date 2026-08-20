# TUNO scripts — the parts a browser cannot do

TUNO runs entirely in the browser. That is a deliberate constraint, and it has an
equally deliberate limit: a browser cannot read a directory ACL, verify an Authenticode
signature, or open an event log. Those three facts are most of what you need to know
before you enforce AppLocker.

So T01 (🔐 AppLocker builder & validator) hands out two PowerShell scripts instead of
pretending the browser could work it out. They are served from the site itself, so the
copy you download always matches the build of T01 you are looking at.

| Script | What it does | Where the output goes |
|---|---|---|
| `Invoke-TunoAppLockerScan.ps1` | Scans a device and builds a rule set from what it finds | Upload the `.json` bundle to T01 |
| `Convert-TunoAppLockerToIntune.ps1` | Turns an AppLocker policy XML into an Intune custom profile | JSON on disk, or straight into the tenant |

Both are MIT-licensed, like the rest of TUNO, and both are read-only on the device
unless you explicitly ask otherwise. Neither one applies a policy.

---

## The workflow

```
 1. scan          Invoke-TunoAppLockerScan.ps1   on a representative device
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

Three files land next to the script:

```
TunoAppLockerScan-<DEVICE>-<yyyyMMdd-HHmm>.json   <- upload this to T01
AppLockerRules-Audit-<yyyyMMdd-HHmm>.xml
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
| `-Scope` | `System,ProgramFiles` | Which roots to walk. Add `ProgramData`, `UserProfiles`, `Custom`. |
| `-Path` | — | Extra directories always treated as unsafe, whatever their ACLs say. |
| `-KnownAdmin` | — | Principals that are administrators here but are not in the local Administrators group, e.g. `"CONTOSO\Workstation-Admins"`. |
| `-PublisherRuleGranularity` | `PublisherProductBinary` | How specific the generated publisher rules are. |
| `-EventDaysBack` | `30` | How far back to read the AppLocker logs. |
| `-MaxArtifacts` / `-MaxEvents` | `5000` | Safety caps. Hitting one is recorded as a warning, not swallowed. |
| `-DeepScan` | off | Report every writable directory instead of stopping at the first on each branch. |
| `-SniffUnknownExtensions` | off | PE-sniff files whose extension is not a known executable extension. Catches renamed binaries. |
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
    -Grouping 'Pilot' -DisplayName 'Win - Device Security - AppLocker'

# Online — create the profile in the tenant
.\Convert-TunoAppLockerToIntune.ps1 -Online -TenantId 'contoso.onmicrosoft.com' `
    -XmlPath .\AppLockerRules-Audit-20260819-1530.xml `
    -Grouping 'Pilot' -DisplayName 'Win - Device Security - AppLocker'
```

Online mode needs `Microsoft.Graph.Authentication` and the
`DeviceManagementConfiguration.ReadWrite.All` scope. If a Graph session is already open
it is reused as-is; `-TenantId` doubles as a guard against creating the profile in the
wrong customer's tenant.

### The grouping is the important parameter

The grouping segment is the policy's **identity on the device**. Two profiles sharing a
grouping overwrite each other; two with different groupings are merged by the CSP. Use
one grouping per intent — `Pilot`, `Production` — and when you promote audit to enforce,
keep the **same** grouping so the new profile replaces the old one instead of stacking
on top of it.

### DLL is forced to NotConfigured

AppLocker evaluates every DLL load. Enforced, it cripples the device; even AuditOnly
buries the event log under Microsoft-signed System32 libraries, EDR AMSI providers and
.NET native images. The DLL rules still ship in the profile — documented and inert — so
the collection can be switched on deliberately later rather than being invisible. Pass
`-EnforceDllCollection` if that is genuinely what you want.

### It creates, it does not assign

Assignment is a deliberate act in the portal or a separate Graph call. AppLocker is not
a policy you want landing on a group by accident.

---

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
