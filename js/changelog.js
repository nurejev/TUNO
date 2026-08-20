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
    build: 3, date: "2026-08-20", title: "The AppLocker tool grew up",
    items: [
      { kind: "improved", tool: "\ud83d\udd10 AppLocker builder & validator", text: "It was a policy reader. It is now the whole job, in five steps. SCAN: the tool hands you Invoke-TunoAppLockerScan.ps1, run once on a representative device, elevated. A browser cannot read a directory permission, verify a signature or open an event log, and those three facts are most of what decides whether an AppLocker policy is sound \u2014 a rule allowing the Program Files folder is only as strong as the permissions underneath it, and the XML does not say what those are. The scan does, and every verdict that came from it is marked so you can see which half of the analysis proved what. UPLOAD: the same button takes the scan bundle or a plain policy XML, so the scan is optional and skipping it costs you only the evidence a browser cannot gather. REVIEW, EXPORT, DEPLOY follow." },
      { kind: "improved", tool: "\ud83d\udd10 AppLocker builder & validator", text: "Every finding that ends in a recommendation now carries a button that performs it. Mechanical ones apply in a click \u2014 set an enforcement mode, add the Microsoft default rules, add a collection the XML never mentioned. Ones needing a fact the tool does not have open the offending rule prefilled, so you supply the publisher, the version bound or the purpose-built group, and it refuses to invent any of them. Every change leaves one step back, named for what it did." },
      { kind: "improved", tool: "\ud83d\udd10 AppLocker builder & validator", text: "Enforcement is never switched on for you. The only mode change the tool makes by itself is the one that blocks nothing: a collection with no rules is offered AuditOnly or the default rules first, never a straight Enable, because enabling it would block every file of that type. Going from AuditOnly to Enabled opens a panel listing what should be true first \u2014 time in audit across a month-end, a patch cycle and a new starter; an event log with nothing unrecognised left; a coverage table reading allowed; a tested way back \u2014 and you choose." },
      { kind: "new", tool: "\ud83d\udd10 AppLocker builder & validator", text: "The policy XML is on screen while you edit it, in a panel of its own, redrawn on every change and rendered from the same code that writes the download \u2014 so the preview cannot drift from the file. A second tab carries the Intune custom profile built from the same serialiser, and step 5 can create that profile in your tenant directly, under rules narrower than the permission allows: nothing is overwritten, assignment is a separate act that tells you how many people it reaches, and the Enforce profile stays locked until an uploaded scan shows nothing was blocked and nothing would have been." },
      { kind: "new", tool: "All tools", text: "TUNO has its own mark \u2014 header, sign-in and favicon \u2014 instead of wearing ENCA's. Every artwork reference carries a version, so a browser that has seen the old one does not keep it." },
      { kind: "improved", tool: "All tools", text: "ENCA's tab bar, ported: a home button, a pill for each tool you have opened with its own close cross, a plus menu, close-all once two are open, and Help pinned right. Hidden on the tools home, because there is nothing to switch between there." },
      { kind: "new", tool: "All tools", text: "A Microsoft Graph layer, which TUNO did not have. Scopes are requested per capability at the moment you use one, never at sign-in \u2014 reading a policy XML in your own browser should not buy the right to change anything. A refusal comes back in the tenant's own words with its error code and request id, and an administrator-consent link when that is what is missing." },
      { kind: "improved", tool: "All tools", text: "New-TunoAppRegistration.ps1 declares every permission the tools can ask for, each with a note saying which tool needs it, and its redirect-URI list now carries every host TUNO is served from \u2014 the list replaces rather than merges, so a host missing from it was a host the next run would have deleted." },
    ],
  },
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
