// ======================================================================
// Build stamp. Shown on the sign-in screen and in the footer so you can
// tell at a glance whether the deployed site is the version you pushed —
// GitHub Pages and the browser cache can both lag a commit behind.
//
// `build` matches the ?v= cache-busting number on every asset URL in
// index.html; bump both together when releasing.
//
// TUNO uses the SAME two-series idea as ENCA (see its js/version.js for the
// full rationale): production builds are plain integers on `main`; beta
// builds live in their own series that can never collide, and `cycle` IS NOT
// DERIVED FROM `build` — set it once per cycle, when the first beta build
// after a production release is cut.
//
// ONE DELIBERATE DIFFERENCE FROM ENCA. Its "five digits NNNII" rule only
// works because ENCA's production numbers are in the hundreds — TUNO starts
// at build 1, where cycle 2 iteration 1 would be 00201 = 201, which is NOT
// >= 10000 and would read as a production build. TUNO therefore anchors the
// beta series explicitly:  beta build = 10000 + cycle*100 + iteration.
// Cycle 2, iteration 1 → 10201 → renders v1.0.2-beta.1. isBeta stays the
// same >= 10000 test, and the two series stay disjoint at any cycle number.
// ======================================================================
const APP_BUILD = {
  version: "1.0",
  cycle: 3,          // hand-set cycle name — first beta cycle after production 2
  build: 10322,      // beta series: 10000 + cycle*100 + iteration → v1.0.3-beta.22
  date: "2026-08-20",
  // When this build was cut, UTC — set with `date -u +%Y-%m-%dT%H:%MZ`,
  // never by hand (a local time typed into a UTC field puts the sign-in
  // stamp an hour into the future; ENCA builds 25090-25092 proved it).
  released: "2026-08-20T09:04Z",
  get isBeta() { return this.build >= 10000; },
  get stamp() { return `${this.label} · ${this.releasedLocal}`; },
  get releasedLocal() {
    const raw = String(this.released || "");
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw.replace("T", " ");
    try {
      const parts = new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short",
      }).formatToParts(d);
      const g = (t) => (parts.find((x) => x.type === t) || {}).value || "";
      if (!g("year")) return raw.replace("T", " ");
      const zone = g("timeZoneName");
      return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}${zone ? ` ${zone}` : ""}`;
    } catch { return raw.replace("T", " "); }
  },
  get releasedUtc() { return String(this.released || "").replace("T", " ").replace("Z", " UTC"); },
  get timeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } },
  // beta build = 10000 + cycle*100 + iteration (see the header) — so the
  // iteration is what remains above the anchored cycle base, unbounded past 99.
  get iteration() {
    return this.isBeta ? this.build - 10000 - this.cycle * 100 : this.build % 100;
  },
  get label() {
    return this.isBeta
      ? `v${this.version}.${this.cycle}-beta.${this.iteration}`
      : `v${this.version}.${this.build}`;
  },
  get full() { return `${this.label} · ${this.date}`; },
};

// Per-tool versions, keyed by the tile id in index.html. Same discipline as
// ENCA: each tool moves at its own pace; bump the tool you touched.
//
// `t` is THE TOOL'S PERMANENT NUMBER — assigned in the order the tool entered
// TUNO, NEVER reused, and a new tool takes the next free number in the same
// commit that adds the tile. ❓ Help, 📋 What's new and 🗺 Roadmap are
// deliberately not numbered: they are the app describing itself.
//
// A tool that has reached PRODUCTION is at least 1.0; it is the BETA chip,
// not the version number, that says "still proving itself".
const TOOL_VERSIONS = {
  toolAppLocker: { t: 1, v: "0.5", note: "BETA — AppLocker policy builder & validator, now an end-to-end workflow rather than an XML reader: scan → upload → review → export → deploy. (1) SCAN. The tool hands out Invoke-TunoAppLockerScan.ps1, served from the site so the copy downloaded always matches the build. It is a modern reimplementation of Microsoft AaronLocker's approach — native DACL evaluation instead of Sysinternals AccessChk, Deny ACEs honoured, JSON instead of Excel COM, and it runs on PowerShell 5.1 AND 7 where AaronLocker hard-fails on anything but 5.1. It finds every directory a non-administrator can write to, inventories the executables in them with signer/version/hash, reads the AppLocker event logs, and builds a publisher-first rule set with every writable directory injected as an exception. (2) UPLOAD. The same import button takes the scan's JSON bundle or a plain policy XML; the bundle carries the generated Audit and Enforce policies plus the device's own effective policy, and any of the three can be put on the table. (3) REVIEW. The static check set is joined by scan-derived findings marked 🛰 — a writable directory an allow rule still reaches, unsigned binaries that can only ever get hash rules, executions the endpoint has already refused — reached with the SAME evaluator as the Microsoft coverage table by probing a hypothetical executable dropped into the directory. (4) EXPORT. The code panel gained a second tab: the Intune custom profile (windows10CustomConfiguration, one OMA-URI per collection, DLL forced NotConfigured), built from the same serialiser as the XML. (5) DEPLOY, from the browser. Step 5 creates the profile in the tenant you are signed in to, under rules narrower than Graph would allow: the write scope is asked for on the click and never at sign-in; a read runs first and a profile with the same name or the same AppLocker grouping STOPS the deploy rather than being overwritten; assignment is a second, separate act that names the pilot group and its member count before it does anything; and the Enforce profile stays locked until the audit profile exists in that tenant AND an uploaded scan shows nothing blocked and nothing that would have been. Convert-TunoAppLockerToIntune.ps1 remains for the command line, standalone with no customer-connection harness, offline JSON or -Online via Connect-MgGraph. Still runs entirely in the browser; nothing is uploaded. ENFORCEMENT IS NEVER AUTOMATIC: the only mode change the tool makes on its own is the one that blocks nothing. AuditOnly to Enabled opens a judgement panel listing what should be true first (time in audit across a month-end, a patch cycle and a new starter; an event log with nothing unrecognised left; a coverage table reading allowed; a tested way back) and the admin picks the mode; adding an absent collection lands in AuditOnly; a NotConfigured collection with rules steps to AuditOnly. The DLL panel states what enforcing DLL costs, matching the scanner and the export. The publisher check no longer fires its breadth heuristics on rules naming BOTH a publisher and a product \u2014 the shape the coverage fixes build \u2014 so the tool stopped flagging the rule it had just recommended. After Spencer Alessi's AppLockerInspector and Microsoft's AaronLocker" },
  toolGroupUse: { t: 2, v: "0.3", note: "BETA — the first TUNO tool that reads a tenant. Name an Entra group and get everything Intune sends to its members across nine surfaces and twenty Graph endpoints: configuration profiles (device, settings catalog, ADMX), compliance, scripts and remediations (PowerShell, macOS shell, remediation), application assignments, app protection, app configuration, enrolment restrictions, Autopilot and Windows update profiles. Two parents, and the merge is the point. ENCA's Group Analyzer (T19) supplies the machinery — the source descriptor with its own scopes and runner, the flat hit shape, the rule that a failing source is reported and never fatal, and ancestors rather than just the group itself. Ugur Koc's Get Group Assignments supplies the Intune surface map and two things ENCA's version does not do: EXCLUSIONS ARE READ AS ASSIGNMENTS, because 'this policy does not reach you' is the same question as 'this policy reaches you' and a report showing only inclusions is wrong half the time; and TENANT-WIDE TARGETS ARE OFFERED as a toggle, because All Users and All Devices land on the group's members too and the effective surface is larger than the group's own assignments. And one thing neither has: the script's own notes say nested group inheritance is not evaluated, so an inherited assignment is included here and says which parent it came through. A surface that could not be read is never reported as empty — it is reported as unknown, with the permission and the Intune RBAC role it would need, because those are different things. Intune only, deliberately: where a group is used in Conditional Access, licensing, directory roles or access packages needs scopes TUNO has no reason to hold, and the tool points at ENCA rather than half-reading them. Exports Markdown, CSV and a standalone HTML report that opens for someone with no access to the tenant. v0.2 adds ENCA's TENANT SWEEP, with the Conditional Access scope replaced by its Intune equivalent. A sweep reads each surface ONCE and matches every group against it, so the cost barely grows with the group count — 300 groups is still twenty reads. 'Only groups Intune assigns to' takes the ids off the assignments as they are read, so there is no /groups enumeration at all; it is the fastest scope and it CANNOT find unused groups, which the screen says where the choice is made rather than leaving an empty list to be misread as a clean bill of health. The counted scopes enumerate and can. A name filter narrows the scan server-side where Graph supports the shape, falling back to listing and filtering locally — and the local check is always the final word, because $search matches tokens rather than substrings and returns more than it should. Group nesting is off by default and batched twenty at a time when on; with it off a group that only receives policy through a parent reads as zero, and the report says so rather than letting it pass as unused. An id an assignment names that the directory no longer has is kept and flagged as a DANGLING REFERENCE: that assignment targets nobody and nothing in the portal will tell you. After Ugur Koc's Get Group Assignments (MIT) and ENCA's T19" },
};
