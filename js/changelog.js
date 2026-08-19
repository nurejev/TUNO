// ======================================================================
// Changelog — the source of truth for both the "What's new" overlay shown
// after sign-in and the full changelog page.
//
// Same discipline as ENCA's js/changelog.js (read its header for the long
// version):
//
// HOUSEKEEPING: whenever a tool is added or changed, add a NEW release
// object here for that build, in the same commit as the code — together
// with the home-tile NEW/BETA/UPDATED tag in index.html, the TOOL_VERSIONS
// bump, APP_BUILD.build + the ?v= cache-busting numbers, and js/promote.js
// when the change lands on the beta channel. One release object per build,
// holding ONLY what changed in that build; never bump an existing release's
// number to cover new work.
//
// kind: "new"      — a whole tool or capability that did not exist
//        "improved" — an existing tool got better
//        "fixed"    — something was wrong and now is not
//
// TEXT IS PLAIN TEXT. The renderer escapes it, so an HTML tag written here
// comes out as angle brackets mid-sentence (ENCA carried 228 broken tags
// before noticing). Quote a literal token — "bad" — rather than reaching
// for code, and carry emphasis in the words.
//
// Newest release first.
// ======================================================================
const CHANGELOG = [
  {
    build: 2, date: "2026-08-19", title: "Sign-in works — the app registration exists",
    items: [
      { kind: "new", tool: "All tools", text: "The TUNO (Limon-IT) app registration is live and js/authConfig.js carries its client ID, so the sign-in screen signs in instead of explaining why it cannot. Multi-tenant SPA, authorization code + PKCE, no client secret; delegated User.Read plus SecurityEvents.Read.All consented up front so the Secure Score visualizer (roadmap R02) can ask for it on the click when it lands. Created by New-TunoAppRegistration.ps1, which also patched this config." },
    ],
  },
  {
    build: 1, date: "2026-08-19", title: "TUNO exists — and it opens with AppLocker",
    items: [
      { kind: "new", tool: "AppLocker builder & validator", text: "TUNO's first tool, in BETA. Import an AppLocker policy XML — a GPO export or the output of Get-AppLockerPolicy -Effective -Xml — and it is audited in the browser with the AppLockerInspector check set: collections left NotConfigured or AuditOnly, allow rules granted to Everyone / Authenticated Users / BUILTIN-Users, paths under user-writable trees (profiles, AppData, Temp, Downloads, ProgramData), drive-root and wildcard patterns, UNC allows, publisher rules with any-product / any-binary / no upper version bound, and hash rules assigned to broad principals — each finding with a severity, the reason and a recommendation, and an allow that a deny rule provably shadows is skipped rather than reported. After Spencer Alessi's AppLockerInspector; the NTFS and share ACL reality checks need a filesystem and stay in his PowerShell — the report says which checks did not run here rather than pretending they did." },
      { kind: "new", tool: "AppLocker builder & validator", text: "The Microsoft coverage check — the question every locked-down estate discovers too late: are the Microsoft apps people actually use still allowed to run? A catalog of the ones that bite (OneDrive's per-user install under AppData first among them, plus Teams, Edge WebView2, Office click-to-run and the servicing executables) is evaluated against the imported policy the way AppLocker itself would decide — deny beats allow, exceptions respected, path macros expanded, publisher fields matched — and every app comes back allowed, blocked, or allowed only through a rule the audit flags as risky. A blocked app gets a one-click fix: the publisher rule (path fallback where signing is inconsistent) added to the policy." },
      { kind: "new", tool: "AppLocker builder & validator", text: "The builder half: start from the imported policy or from empty, add the Microsoft-recommended default rules per collection, set enforcement modes, add publisher / path / hash rules by hand, delete what should not be there — and export the result as AppLocker policy XML that imports straight back into a GPO, plus a Markdown findings report for the change ticket. Everything runs in the browser; the XML never leaves the machine." },
      { kind: "new", tool: "All tools", text: "The TUNO shell itself, built as ENCA's sister: same layout, same branding, same sign-in model (a SPA using authorization code + PKCE, no client secret, single-tenant registration supported via New-TunoAppRegistration.ps1), same two-series build numbering, same changelog / roadmap / promotion-queue discipline, and the same BETA ribbon on any host that is not tuno.limon-it.nl." },
    ],
  },
];
