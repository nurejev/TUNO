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
  build: 10305,      // beta series: 10000 + cycle*100 + iteration → v1.0.3-beta.5
  date: "2026-08-19",
  // When this build was cut, UTC — set with `date -u +%Y-%m-%dT%H:%MZ`,
  // never by hand (a local time typed into a UTC field puts the sign-in
  // stamp an hour into the future; ENCA builds 25090-25092 proved it).
  released: "2026-08-19T13:10Z",
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
  toolAppLocker: { t: 1, v: "0.2", note: "BETA — AppLocker policy builder & validator: import a policy XML (GPO export or Get-AppLockerPolicy -Effective -Xml), audit it with the AppLockerInspector check set (enforcement posture, broad principals, user-writable and wildcard paths, UNC allows, overly broad publisher rules, hash rules on broad groups, deny-shadowing awareness), verify the Microsoft apps a locked-down estate still needs — OneDrive per-user install first among them — are actually allowed, build the missing rules (publisher-first, path fallback) and the default rule set, and export the result as AppLocker policy XML plus a Markdown findings report. Every finding that has a recommendation now carries a fix button: mechanical recommendations (set enforcement, add the default rules, add a missing collection) apply in one click, and judgement recommendations open the offending rule prefilled so the admin supplies the publisher, version bound or group the tool cannot know. Every fix is one click from undone. Runs entirely in the browser; nothing is uploaded. ACL reality checks (NTFS/share) need a filesystem and stay in Invoke-AppLockerInspector.ps1 — the report says so rather than pretending. After Spencer Alessi's AppLockerInspector" },
};
