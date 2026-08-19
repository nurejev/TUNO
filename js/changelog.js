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
    build: 10309, date: "2026-08-19", title: "The two columns had nowhere to go",
    items: [
      { kind: "fixed", tool: "🔐 AppLocker builder & validator", text: "Splitting the screen in two gave neither half enough room, and a wider monitor did not help, because the limit was never the monitor. The whole app sits in an 1180-pixel shell. Two columns inside that left the findings table about 700 pixels for seven columns — the condition ended up wrapping one character per line — and the code panel about 400, narrow enough that every path broke mid-token. T01 is now the one screen that escapes the shell: it widens with the window up to 1680 pixels and re-centres itself, and the code panel gets 520 of that. Below 1240 pixels there is no room for two columns and it stacks, which is what the old breakpoint was trying to say and set too low to mean." },
      { kind: "fixed", tool: "🔐 AppLocker builder & validator", text: "Two tables were being cut off rather than scrolled. Coverage and Rules had no horizontal scroller of their own, and the cards they sit in hide their overflow, so anything past the card edge was simply not there — no scrollbar, no ellipsis, just missing text. Both scroll now, and the flex children carry a zero minimum width so a wide table can no longer push its card past the column it was given." },
      { kind: "fixed", tool: "🔐 AppLocker builder & validator", text: "Paths stop being broken mid-token where the line had a space to break at instead. The rule condition, the finding condition, the two scan tables from the previous build and the code panel all asked for a break anywhere; they now ask for a normal break first and only fall back to breaking inside a token when the token genuinely does not fit." },
    ],
  },
  {
    build: 10308, date: "2026-08-19", title: "The tool can finally see the machine",
    items: [
      { kind: "new", tool: "🔐 AppLocker builder & validator", text: "A browser cannot read a directory permission, verify a signature or open an event log — and those three facts are most of what decides whether an AppLocker policy is sound. A rule allowing the Program Files folder is only as strong as the permissions underneath it, and the XML does not say what those are. So the tool now hands you the PowerShell that can: Invoke-TunoAppLockerScan.ps1, downloaded from the tool itself, run once on a representative device. It finds every directory a standard user can write to, inventories the executables sitting in them with their signer and version, reads what AppLocker has already blocked, and builds a rule set with every one of those directories excepted out of the default rules. It changes nothing on the device." },
      { kind: "new", tool: "🔐 AppLocker builder & validator", text: "Upload what the scan wrote and the audit gains a second half. Findings marked with a satellite came from the device rather than the file: a writable directory an allow rule still reaches, named together with the rule that reaches it and the group that can write there; unsigned programs that can only ever be allowed by a hash rule, which stops working the day they are updated; and the executions the endpoint has already refused, per user. Those verdicts are reached with the same evaluation the Microsoft coverage table uses, by asking what would happen to an executable dropped into the directory — there is no second opinion to disagree with the first." },
      { kind: "new", tool: "🔐 AppLocker builder & validator", text: "The panel on the right has a second tab: the Intune custom profile. AppLocker has no settings-catalog surface, so the supported route is a custom profile carrying one OMA-URI string per rule collection, and that is now built for you from the policy on screen — name it, give it a grouping, pick Audit or Enforce, and copy or download it. The DLL collection always ships as NotConfigured whatever you pick: AppLocker evaluates every DLL load, so enforcing it cripples the device and even auditing it buries the event log. The rules are still in the profile, documented and inert." },
      { kind: "new", tool: "🔐 AppLocker builder & validator", text: "A second script, Convert-TunoAppLockerToIntune.ps1, does the same conversion on the command line — offline it writes the profile JSON, online it creates the profile in the tenant. The screen now reads as five numbered steps, scan through deploy, with the portal, Graph and script routes written out including the ones nothing here does for you: assign the audit profile first, to a pilot group, and make sure the Application Identity service is actually running or AppLocker does nothing and logs nothing." },
      { kind: "improved", tool: "🔐 AppLocker builder & validator", text: "The scan bundle carries three policies — the generated audit set, the generated enforced set, and the policy the device was really running — and you can put any of them on the table and switch between them. It opens on the audit set, because that is the only one it is ever safe to start with. The Markdown report gained the device facts, what the scan could not see, and the full list of writable directories still reachable through a rule." },
    ],
  },
  {
    build: 10307, date: "2026-08-19", title: "You can see the XML you are about to ship",
    items: [
      { kind: "improved", tool: "🔐 AppLocker builder & validator", text: "The tool produced its XML only as a download, so the artefact that actually goes into the GPO was the one thing you never looked at. It now has a panel of its own down the right-hand side, syntax-coloured and redrawn on every change — apply a fix, add a rule, change an enforcement mode, undo, and the XML moves with it. Copy and Download XML sit on that panel rather than in the toolbar at the top of the page, because they belong to the thing they act on. Export MD stays in the toolbar." },
      { kind: "improved", tool: "🔐 AppLocker builder & validator", text: "The screen is two columns: the audit, coverage and rules on the left, the XML on the right, sticky, scrolling inside itself. Below 1100px the panel drops underneath instead of shrinking — a column too narrow to show a file path wraps it into something you cannot read. The panel renders from the same export function the download uses, so a preview cannot drift from the file: there is no second serialiser to keep in step." },
    ],
  },
  {
    build: 10306, date: "2026-08-19", title: "The promotion queue says how to check it, not just what it is",
    items: [
      { kind: "improved", tool: "All tools", text: "The beta-only promotion queue in Help was a four-column table that told you a change existed and how risky someone thought it was. It is now ENCA's table, ported: each row still carries its stable number, but the risk cell explains what that word means, the beta builds have a column of their own, the files the change touched are listed, and the reasoning is split in two. Why says what the risk is and what would have to be true for the item to graduate. How to test it — folded away, because you read the table to decide what to promote and the steps only once that decision is made — names the tenant or policy state each check needs and the outcome you should see, so a step can fail rather than be nodded through. Where a check cannot be run without a tenant nobody has to hand, the step says so: knowing which check was skipped is worth more than a list that pretends all of them were run." },
      { kind: "improved", tool: "All tools", text: "All three queued items were written up against that standard — twenty-three steps in total, including the ones that matter most: that undo restores an AppLocker policy byte-for-byte, that a ruleless collection is never offered a straight Enable, that the new logo arrives on a browser that saw the old one WITHOUT clearing its cache, and that the tab labels do not drag the tiles' BETA tag along with them. An item with no checklist now renders as \"not written\" instead of rendering as nothing, because an item nobody has said how to check is not finished." },
    ],
  },
  {
    build: 10305, date: "2026-08-19", title: "Findings you can act on",
    items: [
      { kind: "improved", tool: "🔐 AppLocker builder & validator", text: "Every finding in the audit already ended in a recommendation, and every recommendation ended in you scrolling down to the builder to carry it out by hand. Findings now have a fix button. Where the recommendation is mechanical the button just does it: set an AuditOnly collection to Enabled, add the Microsoft default rules to a collection that has none, add a collection the XML never mentioned. Where the recommendation needs a fact the tool does not have — the exact publisher behind a path allow, an upper version bound, the purpose-built group that should replace Everyone — the button opens that rule prefilled and you supply the missing piece, with tighten-the-path, replace-with-a-publisher-rule and delete all one dropdown apart. It refuses to invent a publisher or a version for you, the same way the report refuses to pretend the NTFS checks ran." },
      { kind: "improved", tool: "🔐 AppLocker builder & validator", text: "One deliberate disagreement with the tool's own advice: a collection with no rules is never offered a straight Enable, because enabling it would block every file of that type — exactly what the next finding down warns about. A ruleless collection is offered AuditOnly, or the default rules first, and only then the enable." },
      { kind: "improved", tool: "🔐 AppLocker builder & validator", text: "Undo. Every change to the policy — fix buttons, the coverage table's add-allow-rule, the enforcement dropdowns, the delete crosses — leaves one step back, named for what it did, next to the severity filters. A misclick no longer costs you the import." },
    ],
  },
  {
    build: 10304, date: "2026-08-19", title: "The old logo can no longer haunt from the cache",
    items: [
      { kind: "fixed", tool: "All tools", text: "Dark mode kept showing the pre-10303 logo with its baked-in box: the dark variant is loaded by a stylesheet content-url swap, and neither that URL nor the img and favicon references carried a version — so a browser that had seen the old art kept serving it (GitHub Pages caches assets for ten minutes, browsers at their own discretion). All five logo and favicon references now carry an asset version (v=2, bumped whenever the artwork itself changes), so new art arrives the moment the page does. The SVGs themselves were already clean." },
    ],
  },
  {
    build: 10303, date: "2026-08-19", title: "The logo loses its box",
    items: [
      { kind: "fixed", tool: "All tools", text: "The office logo shipped as a full 1024-pixel canvas: a square background baked into the SVG and the emblem floating in a wide margin, which is why the sign-in screen showed a small mark inside a visible box. The background rect is gone (transparent), the viewBox is cropped to the emblem and its orbit ring, and the favicon is cut tighter still — the medallion only, so it survives 16 pixels. The sign-in screen draws the mark at 132 pixels instead of 76. TUNO's copies only; the Website-Limon-IT originals are untouched." },
    ],
  },
  {
    build: 10302, date: "2026-08-19", title: "TUNO wears its own face",
    items: [
      { kind: "new", tool: "All tools", text: "The TUNO office logo replaces the Limon-IT mark in the header, on the sign-in screen and as the favicon — light and dark variants, with the existing theme swap picking the right one per mode. The source lives with the other office logos in the Website-Limon-IT icon set; the app carries its own copies in assets, on the same filenames the stylesheet already knew." },
      { kind: "new", tool: "Roadmap", text: "Two ports from ENCA join the roadmap as Next: R04 Group Analyzer (ENCA's T19, turned Intune-side-out — enrolment, compliance, configuration, scripts, apps, Autopilot and update rings lead the answer) and R05 Change audit (ENCA's T16 pointed at deviceManagement auditEvents — who changed which Intune policy, when, with the field-level diff where the record carries it). References follow the house rules: permanent, never reused, not a priority order." },
    ],
  },
  {
    build: 10301, date: "2026-08-19", title: "The tab bar is ENCA's tab bar",
    items: [
      { kind: "fixed", tool: "All tools", text: "The tool bar under the header is now ENCA's browser-style tab bar, ported verbatim, instead of the unstyled always-on button strip build 1 shipped: a home button that reads as a button, pill-shaped tabs that exist only for the tools you have OPENED (with a close cross each), a plus menu to open another tool in a new tab, a close-all button once more than one tab is open, and Help pinned at the right. The bar stays hidden on the tools home and appears with the first tool you open. The old strip also dragged the tile's NEW and BETA tag text into its labels; tab labels now come from the tool list, with the emoji and nothing else." },
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
