// ======================================================================
// PROMOTION QUEUE — what is on the beta channel and not yet in production.
//
// Rendered in Help, and ONLY on a non-production host, so a customer on
// tuno.limon-it.nl never sees a list of things they do not have.
//
// Same discipline as ENCA's js/promote.js (read its header for the long
// version — the rules were learned the hard way there and apply unchanged):
//
//   * HAND-MAINTAINED. The app is static files in a browser: it cannot read
//     git or diff two branches. A stale list is worse than none, because it
//     will be trusted. Every change that lands on `beta` updates this file
//     in the same commit — like the changelog entry, the home-tile tag and
//     js/version.js.
//   * `n` is stable and hand-assigned so an item can be referred to out loud
//     ("push number 3 to main"). NEVER renumbered, never reused after an
//     item ships; the next new item takes the next free number.
//   * ONE ITEM PER CHANGE — only work that must ship together shares a
//     number. "Push 3" has to mean one decision.
//   * Never queue documentation (roadmap cards, changelog entries, this
//     file): it travels with whatever promotion happens next.
//   * PROMOTING AN ITEM IS FOUR STEPS: 1) delete the item here and bump
//     `productionBuild`; 2) set the roadmap card ON MAIN to `live · build
//     NNN`; 3) set the SAME card ON BETA to `live · beta NNNNN · production
//     NNN` (the step that gets missed); 4) add the changelog entry on both
//     channels. Before promoting, verify each item against what `main`
//     actually contains — `git show main:<file> | grep <marker>` — and do
//     not trust this queue's own list.
//   * `risk`: high (a real problem in production until it lands) / medium
//     (missing capability, nothing broken) / low (convenience or docs).
//   * `test[]` is NOT optional. `why` says what the risk is and what would
//     have to be true for the item to graduate; it does not say how to find
//     out. Each `test` step does: it names the tenant/policy state it needs
//     and the outcome you should see, so a step can FAIL rather than be
//     nodded through. Where a check needs a tenant nobody has to hand, say
//     so in the step — knowing which check was skipped is worth more than a
//     list that pretends all of them were run. An item with no `test[]`
//     renders as "not written" on purpose: it is not finished.
//   * `files[]` must list every file the change actually depends on,
//     INCLUDING the ones that touch it at runtime. Item 2 (the TUNO mark)
//     listed the three SVGs and index.html but not css/app.css, which
//     carries the dark-mode swap as a content:url, nor js/branding.js,
//     which sets the logo src from its own copy of the path — unversioned
//     there, it would have overwritten the cache-busting in the HTML and
//     served the old mark anyway. A promotion built from an incomplete
//     files[] fails at exactly the thing the item was for. Found while
//     promoting it; both were caught by reading the tree rather than the
//     list.
//   * `staying[]` records what is deliberately NOT promoted, so absence
//     reads as a decision rather than an oversight.
//
// This site's own version is APP_BUILD.label — never hand-maintain a beta
// build number here. Only `productionBuild` stays by hand, because the app
// cannot know what the other channel runs.
// ======================================================================
const PROMOTE = {
  // Verified against `git show main:js/version.js` — main is at build 8.
  // Promotions: items 1-13 (beta 10301-10317) as build 3, items 14-19
  // (10318-10323) as build 4, items 20-29 (10324-10336) as build 5, items
  // 30-35 (10342, 10344-10348) as build 6, items 36-40 plus 45-52 and
  // 54-57 (10350-10356, 10361-10376; 53 retired into 57) as build 7, and
  // items 44, 58, 59 and 63-67 (10360, 10378-10380, 10384-10405 less the
  // held builds) as build 8 — the second partial promotion.
  //
  // What remains: T08 what-if, T09 health, T10 settings search (41-43),
  // and the three IntuneShade reads — the assignment matrix (60), the
  // setting conflict scan (61) and the compliance report (62) — each held
  // in beta until it has run against a real tenant.
  productionBuild: "v1.0.8",

  items: [
    {
      n: 72,
      title: "The change audit reads like a timeline",
      tools: ["🕓 Change audit"],
      builds: [10413],
      risk: "medium",
      what: "T03's screen rebuilt (Option A of a mockup round): four stat cards (total, most active admin, most active area, failure rate) computed from the rows shown; a timeline with an operation dot and badge per event (create/delete/update/assign/action, classified from activityOperationType with the activity text as fallback); click-to-expand detail in place — actor+IP, result+severity, correlation id, resource ids, full diff — with the open set keyed on event ids so filters keep cards open; a range picker with presets plus a custom day range (from clamped to the 30-day floor AND the clamp reported on the result; a picked day runs to 23:59:59Z); filters in a dialog with two new controls (operation type, actor dropdown) built from the tenant's own data, wildcard boxes kept. Engine: customRange(), operationOf(), actors(), summarize gains topActor/topArea/failureRate, allRows gains the operation predicate. Reads unchanged; exports unchanged.",
      why: "MEDIUM — presentation plus a small engine surface. Three places deserve a real look: the custom range boundary maths (whole-day semantics and the retention clamp) decide which events EXIST in the answer; the operation classifier decides the badge people scan for; and the expand state across re-renders is exactly the kind of thing that works in a stub and dies on a real 2000-event window.",
      test: [
        "THE ONE THAT MATTERS: pick a custom range ending yesterday and confirm events from yesterday EVENING are in the answer — the whole-day rule. Then pick a range starting 40 days back and confirm the clamp note appears on the result, naming the floor date.",
        "Read a busy window (hundreds of events). Open three cards, change a filter that keeps them visible, and confirm all three stay open. Change a filter that hides one and confirm the other two survive. Scrolling and expanding must stay smooth at that size.",
        "Check the badges against the portal for a handful of events: a profile creation must read Created, a deletion Deleted, an assignment change Assigned. If Graph's operation words in this tenant disagree with the classifier, the fallback text matching is what is actually being tested.",
        "Confirm the stat cards move when filters move: filter to one actor and the most-active-admin card must name them with the filtered count, not the window's.",
        "Open the filter dialog on both views: policy view shows severity/changes-only, all-events shows the six controls; the badge on the Filter button matches the number of active filters; Clear all zeroes it; Escape and a backdrop click both close it.",
        "Exports after filtering: the MD/CSV/HTML must carry the filtered rows and the filter text in the header, exactly as before the redesign — the exports did not change and must not have.",
        "Dark theme: dots, badges and the dialog must be readable; the dot glyphs switch to the dark ink; nothing renders as a white slab.",
      ],
      files: ["js/audit.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 71,
      title: "The audit loop strip",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10410, 10411, 10412],
      risk: "low",
      what: "T01 v0.13. A strip above step 1 draws the circle the 1→5 numbering hides: Scan → Build → Deploy audit → Collect → Gaps → Update profile → Enforce. Stations lit from session state only (scan/policy/created-or-found audit profile/events bundle); the Gaps station reads fleetGapStats() — the SAME pass as the evidence card's chips and the gap report, so numbers cannot disagree; Enforce reads enforceBlockedBecause(). You-are-here ring on the first unlit station; click scrolls (scroll-margin-top so the sticky header does not swallow the target, DETAILS targets opened first). The Update station never claims done — a portal edit is invisible to the tab, said on the strip. Collapses to a one-line summary via guarded localStorage. Colors are theme variables only; mockup round picked the live strip over a Help-only walkthrough. 10411 adds MANUAL MARKS for the stations the tab cannot verify: a small tick per unverifiable station, persisted per browser. Evidence beats the mark both ways — auto-done stations ignore it, and an amber Gaps station offers no tick at all — and a hand-marked station renders DASHED with marked-by-you, so a claim never dresses as evidence.",
      why: "LOW — reads session state, writes nothing, and every number it shows comes from a pass that already existed. The judgement that needs eyes: whether seven stations fit one row on a laptop width without wrapping into noise, and whether the you-are-here ring reads in the dark theme.",
      test: [
        "Fresh load: strip shows with the ring on Scan, every station muted, and clicking Enforce scrolls to the enforcement panel without the sticky header covering it.",
        "Walk the real loop: load a scan, watch Scan+Build light; deploy (or preflight-find) the audit profile, watch Deploy light; upload an events bundle with open gaps, watch Gaps go amber with the same count as the card; close them, watch it go green.",
        "THE ONE THAT MATTERS: cycle all three themes on the strip in both states (open gaps amber, zero-gap green) — every station must stay readable; no literal colors exist in the CSS to betray dark mode.",
        "Collapse the strip, refresh: it stays collapsed (localStorage), and the one-line summary still names the open-gap count.",
        "Narrow the window to laptop width: the stations may wrap but must not overlap or truncate the you-are-here ring.",
        "10411: tick Update profile — it must go dashed with marked-by-you and the ring must move past it; refresh — the mark must survive; open a gap — the Gaps station must be amber with NO tick offered; un-tick — back to waiting.",
      ],
      files: ["js/applocker.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 70,
      title: "The fleet gap report, and fixes that close it",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10409],
      risk: "medium",
      what: "T01 v0.12. The events-evidence card classifies every denied fleet file against the draft — GAP (still blocked, machine space), BLOCKED BY DESIGN (user-writable origin), COVERED, UNDECIDED — with chips counting ALL rows and a ⭳ Gap report Markdown download (summary, per-section tables, suggested fix per gap, collector warnings). Per-row 🔧 fixes add the rule through mutate()/undo: publisher when signed, hash from the event's FileHash when not (0x-normalised, SourceFileLength 0 with the reason in the rule description), exact path last — NEVER a directory. By-design rows get 'Allow anyway' wording (business decision, not repair). draftVerdictForEvent() additionally matches hash conditions for event rows only — ruleMatchesArtifact stays hash-blind for coverage — so a hash fix flips its row to covered.",
      why: "MEDIUM — everything happens in the browser against the draft, rides the existing mutate/undo path, and 171/171 headless including click-through of both fix kinds and undo. The judgement that needs real eyes: whether SourceFileLength=0 hash rules survive Set-AppLockerPolicy and GPO import on a real endpoint (the schema requires the attribute; the event does not carry the length), and whether the gap/by-design boundary (machine space vs \\Users\\) matches how the estate actually reads.",
      test: [
        "THE ONE THAT MATTERS: upload a real device's bundle with the real draft loaded, download the gap report, and check it against Event Viewer by hand for three files — one covered, one gap, one user-profile block. The classifications must match what the endpoint would actually do.",
        "Close a signed gap by publisher, export the XML, and import it on a test device (Set-AppLockerPolicy or GPO): the file must now run, and the rule must read sensibly in the GPO editor.",
        "Close an unsigned gap by hash, export, and IMPORT: this is the SourceFileLength=0 question — if the import rejects the rule, the length needs to become optional-honest (omit the attribute) rather than zero, and this item stays in beta until decided.",
        "Undo after a fix: the rule leaves the draft and the row returns to being a gap, chips included.",
        "A bundle from a device the policy never reached (everything Allowed, nothing denied): the card must say the estate-quiet-or-unreached line, not render an empty gap report.",
      ],
      files: ["js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 69,
      title: "Self-host branding — the ⚙ gear, ported from ENCA",
      tools: ["TUNO"],
      builds: [10408],
      risk: "low",
      what: "ENCA's self-host branding, ported verbatim (keys, event name and product words aside): js/selfhost.js puts a ⚙ gear beside Sign out on any NON-production host — product and organisation names, logos, login text, light/dark identity colours — through the same BRAND_OVERRIDES mechanism as the hosted per-audience looks. Chrome only; exports keep the neutral TUNO credit. 💾 Apply keeps the look in this browser (localStorage); ⭳ Download produces selfhost-branding.json, ⭱ Import reads one back for review; a deployment serving that file next to index.html brands every visitor and softens the BETA ribbon to a neutral SELF-HOSTED one. js/selfhost-boot.js is the before-first-paint half: blocking in head, it paints the cached brand so a branded instance never flashes Limon-IT. app.js gains ENCA's activeOverrideKey()/activeBrand() and the override-aware applyBranding() (data-brand attr, per-theme stylesheet injection, logoWide, hideOrgName), the ribbon carries id and titleTag as the seam, and sign-in gains the forUpn hook. The gear can never configure BRANDING.host: that drives the production check and the export credit, and a settings dialog must not let a copy claim to be production. The Dovilo and PVM customer brandings came across too — gitignored, offline only, never published from this repo.",
      why: "LOW — additive and gated to non-production hosts; on tuno.limon-it.nl the file returns before doing anything. The judgement calls needing real eyes: the gear dialog at phone width, a wide wordmark in the header slot, and the first-visit flash the boot file exists to remove. Sanitising is ENCA's proven set (charset-checked colours, data:-URI-or-relative assets), asserted headlessly here too.",
      test: [
        "THE ONE THAT MATTERS: on the beta site, open ⚙, set a name and both palettes, 💾 Apply — the chrome rebrands without a reload. F5: the branded look paints FIRST (no Limon-IT flash — the boot file's whole job). ✖ Remove local branding: the default look returns, immediately and after another F5.",
        "⭳ Download, hand-edit one colour in the JSON, ⭱ Import — the form shows the file's values for review, nothing applies until 💾. Import the Dovilo and PVM files the same way: both must render their look, wide wordmark and hidden org name included.",
        "Serve a selfhost-branding.json next to index.html (local dev server): every fresh browser gets the branding, and the red BETA ribbon reads ⚙ SELF-HOSTED instead — while a host still named tuno.limon-it.nl must show NO gear at all.",
        "Exports while branded: the Markdown credit must still say TUNO (tuno.limon-it.nl) — chrome only is the contract.",
        "Both themes while branded: light and dark palettes each apply under their own theme, auto mode follows the OS, and the theme toggle still works.",
        "Private window: the gear must not error; Apply says it cannot save.",
      ],
      files: ["js/selfhost.js", "js/selfhost-boot.js", "js/app.js", "index.html", ".gitignore", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      // Renumbered from 63 at build 10408: 63 belonged to T14 assignment
      // filters and shipped as production build 8 — numbers are never
      // reused. 68 was the next free number when this item was cut.
      n: 68,
      title: "The header stops repeating itself",
      tools: ["All tools"],
      builds: [10407],
      risk: "low",
      what: "#brandHost is removed from the header, from applyBranding() and from the one media-query rule that hid it on narrow screens. It rendered BRANDING.host \u2014 the production hostname \u2014 unconditionally, so on production it repeated what the product badge already said, and on this channel it displayed an address the site is not served from. BRANDING.host itself is untouched: isProdHost(), the footer stamp and the export credits all still use it.",
      why: "LOW \u2014 one element removed from the shell. Worth a look on both channels rather than one, because the reason it goes is that it was WRONG on the beta site, and that is the site where the removal is hardest to notice.",
      test: [
        "Look at the header on this channel and on production. Neither may show a hostname; both must still show the product badge.",
        "Check the footer stamp and an export credit still carry the address \u2014 removing the header label must not have taken the address out of the places that legitimately state it.",
        "Confirm the beta ribbon still appears here. It, not the hostname, is what tells you which channel you are on, and it is now the only thing doing that job.",
        "Narrow the window: nothing should reflow oddly where the label used to sit, and the rule that hid it at that width is gone with it.",
      ],
      files: ["index.html", "js/app.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 62,
      title: "R22 — the compliance report (T13)",
      tools: ["📈 Compliance report"],
      builds: [10383, 10395, 10398],
      risk: "medium",
      what: "New tool T13 (js/compliance.js), after Alper Atar's IntuneShade (MIT). Estate: managedDevices ($select minimal, paged) bucketed compliant/noncompliant/grace/unknown/other, stale threshold on screen (default 30 days, never-synced counts stale), compliant-AND-stale counted in both columns with the tension stated. Policies: deviceCompliancePolicies?$expand=assignments, then deviceStatusOverview + deviceSettingStateSummaries per policy via $batch; only settings failing somewhere shown, worst-first sort; status-gap tag when a rollup could not be read (unknown ≠ clean); unassigned = 'evaluates nobody' tag. Failed estate/policy read marks that half unknown, not zero. No new scope. Exports MD + CSV + stale CSV. Tile (Monitoring), screen, tab, sidebar, t:13. R22 card to Now with the HTML-export departure tagged 'next'.",
      why: "MEDIUM — reads only on existing scopes, but the two rollup endpoints' field names (successCount/failedCount, settingName, nonCompliantDeviceCount) are asserted against fabricated shapes, not a real tenant's, and beta moves. The stale arithmetic and the both-columns rule are headlessly proven; whether Graph's rollup matches the portal's numbers on a real tenant is not provable here. Graduates when a real tenant's report matches the portal's compliance blade for the same policies, give or take the rollup's refresh lag.",
      test: [
        "THE ONE THAT MATTERS: run against a real tenant and compare three policies' numbers with the portal's compliance blade — same order of magnitude, differences explained by the rollup's refresh schedule.",
        "A device that has not synced for more than the threshold must appear in the stale table, oldest first; set the threshold to 1 day and watch the stale count grow accordingly.",
        "A compliant device with an old last-sync must be counted in BOTH compliant and stale, and the both-columns warning must appear.",
        "An unassigned compliance policy must wear the 'unassigned' tag; a tenant with none must show no false tags.",
        "Revoke DeviceManagementManagedDevices.Read.All mid-session: the estate half must read as unknown while the policy half still renders (and vice versa for the config scope).",
        "A policy whose deviceStatusOverview 404s must be listed with 'status gap', never dropped, and the MD export must name it in the gaps line.",
        "Exports: MD tables well-formed; stale CSV row count equals the on-screen stale count.",
      ],
      files: ["js/compliance.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 61,
      title: "R20 — the setting conflict scan (T12)",
      tools: ["⚔️ Setting conflict scan"],
      builds: [10382, 10393, 10395, 10396],
      risk: "medium",
      what: "New tool T12 (js/conflict.js), after Alper Atar's IntuneShade (MIT). Reads via Docs.collect() over settingsCatalog + deviceConfigurations + admx — no second read path. Identity: sc defId / admx category+name / dc type+property; cross-surface CSP collisions stated as NOT detected. Verdicts from assignments: can (shared include or tenant-wide meets reach), may (different groups; any filter caps at may), cannot (one side has no include and no tenant-wide — reaches nobody by construction). Docs.assignmentOf now carries filterId/filterType (additive; nothing else renders them). Redacted values skipped and counted, agreement is not a finding, unread surfaces named. MD + CSV exports. Tile, screen, tab, sidebar, t:12.",
      why: "MEDIUM — reads only over an already-proven read path, but the engine's judgements (identity keys, verdict boundaries) have run against fabricated shapes, not a real tenant's, and a conflict scan that mis-keys produces confident nonsense. Graduates when a real tenant's scan shows a known-true conflict as 'can', a known-deliberate baseline split as 'may', and no cross-type device-config false positives.",
      test: [
        "THE ONE THAT MATTERS: create two settings-catalog policies setting the same definition to different values, assign both to one group — the scan must find exactly that setting, verdict 'can collide', both values shown.",
        "Re-assign one to a different group: verdict drops to 'may collide' with the shared-members reason.",
        "Put an assignment filter on one: verdict must cap at 'may' and name the filter as the reason.",
        "Unassign one policy entirely: 'cannot collide — reaches nobody as assigned'.",
        "Two policies agreeing on a value must NOT appear; a secret-bearing setting (e.g. a password field) must be skipped and counted, never compared.",
        "Two device configurations of DIFFERENT types with same-named properties must not be matched; two of the SAME type must be.",
        "Revoke the config read scope: the scan must name the unread surfaces as unknown, not report a clean tenant.",
      ],
      files: ["js/conflict.js", "js/document.js", "js/app.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 60,
      title: "R19 — the assignment matrix, the sweep's second face",
      tools: ["🔗 Group Analyzer"],
      builds: [10381],
      risk: "low",
      what: "T02 v0.4, after Alper Atar's IntuneShade (MIT). The sweep gains a Table/Matrix view switch rendered from the ONE read it already does — switching asks the tenant nothing. Matrix: groups × surfaces grid, includes as the count, exclusions as their own red −n per surface (sweepTotals grew bySourceExc; bySource still counts everything, so the table and all three exports are unchanged), dangling groups keep the deleted flag, group click opens single-group mode via the tile's own handler. Opt-in empty-group peek: $top=1 transitiveMembers per group, $batch 20/trip (T09's technique), GroupMember.Read.All asked on the click; failed probe renders 'reach?' (unknown), success 'empty' or nothing. Absent-not-empty until run, and the screen says so.",
      why: "LOW — reads only, one optional scope already in the app's read set, no export or table changes (asserted headless). The judgement calls worth real eyes: the sticky first column and header on a 300-group matrix, and whether −n reads as exclusions without a legend.",
      test: [
        "THE ONE THAT MATTERS: sweep a real tenant, switch to Matrix — no network activity on the switch (DevTools), counts per cell must equal the table's per-surface numbers, with exclusions split out as −n.",
        "A group with only exclusions on a surface must show only −n in that cell, never a positive count.",
        "Click 'Check which groups are empty': one consent prompt at most, then batched probes; a known-empty group reads 'empty', a populated one gains no tag, and the button disappears once peeked.",
        "Break one probe (revoke GroupMember.Read.All mid-session or use a group you cannot read): that row must say 'reach?', not 'empty'.",
        "Click a group name in the matrix: single-group mode opens and runs with that group, tab bar and sidebar still agree.",
        "Dangling (deleted) groups: flagged in the matrix, not clickable, never counted as coverage.",
        "Exports (MD/CSV/HTML) byte-identical to a pre-10381 sweep of the same tenant, modulo timestamps.",
      ],
      files: ["js/groupuse.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 43,
      title: "Settings search — from the definition to the policy",
      tools: ["🔦 Settings search"],
      builds: [10359],
      risk: "medium",
      what: "T10, after Ugur Koc's IntuneAssignmentChecker (MIT). Search the settings-catalog definition catalog (~17k definitions, one beta read, held in memory per session) with ranked token matching, then optionally read the tenant's settings-catalog policies (the backup's N+1, pooled) to answer 'who sets it, to what value'. Usage column is ABSENT until read, never empty; child settings indexed under their own definition ids; values pass Docs.redactValue — the documenter's gate, one implementation. Reads only, one scope.",
      why: "MEDIUM — read-only and additive, but two things carry real risk: the redaction gate is now load-bearing for a second tool, and the catalog read is the largest single read TUNO makes (~17k objects), which is where throttling behaviour and memory actually get tested. A wrong 'nothing sets it' would also invite somebody to configure a duplicate.",
      test: [
        "THE ONE THAT MATTERS: search for a setting you know carries a secret (a Wi-Fi pre-shared key, an OMA-URI password) in a tenant that sets one, with usage read. The value column must show the redaction marker, not the value. If the value appears, do not promote — this is the disclosure-engine case.",
        "Read the catalog on a real tenant and note the count and the time. It should land in the tens of seconds, survive a 429 (watch for the throttle notice), and the page must stay responsive while searching afterwards.",
        "Search 'bitlocker recovery' and confirm ranked results: names starting with the term above names containing it, keyword hits below those. Then search a word that only appears in descriptions and confirm it still lands, ranked last.",
        "Pick a setting configured in exactly one policy as a CHILD of a choice setting and confirm usage finds it — the child-indexing is the part a naive walker misses.",
        "Before reading usage, confirm every result says 'not read' rather than 'nothing sets it'; after reading, confirm a genuinely-unused definition says 'nothing sets it'. Those are different sentences and both must appear in the right place.",
        "Make one policy's settings unreadable (RBAC-scope an account, or pick a tenant with a scoped role) and confirm the failure is named and the export says the usage column is missing that policy's settings.",
        "Platform filter: pick Windows and confirm macOS-only definitions drop out; clear it and confirm they return.",
      ],
      files: ["js/settingsearch.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 42,
      title: "Assignment health — what looks configured and is not",
      tools: ["🩺 Assignment health"],
      builds: [10358],
      risk: "medium",
      what: "T09, after Ugur Koc's IntuneAssignmentChecker (MIT). Six finding kinds over one assignment read: policies assigned to transitively EMPTY groups (one-row peek, batched), DANGLING references to deleted groups, UNASSIGNED policies (enrolment restrictions exempt — their defaults are unassigned by design), EXCLUDED-ONLY policies, one group included AND excluded on the same policy, and optionally FAILED deployments from the cheap per-policy status on device configurations, compliance, scripts and remediations — with the surfaces that keep status behind the reports API named as unchecked. GroupUse.intuneHits gained an opt-in `unassigned` flag keyed on the assignments array being empty; T02/T06/T08 pass nothing and are unchanged. Reads only.",
      why: "MEDIUM — read-only, nothing existing changes behaviour, but the shared reader was touched and the findings invite cleanup actions: a wrong 'empty group' or 'unassigned' row could prompt somebody to delete configuration that is actually live. The exemption list and the unknown-vs-empty distinctions are where a mistake would do real work.",
      test: [
        "THE ONE THAT MATTERS: create a test group with no members, assign a test policy to it, run. It must appear under empty-group findings. Add one member (or a nested group WITH a member), re-run, and it must disappear — transitively is the word being tested.",
        "Nest an empty group inside an empty group, assign to the parent, and confirm it still reads as empty — a direct-members check would pass it.",
        "Assign a policy to a group, delete the group, re-run: the assignment must land under dangling, not empty, and the two lists must not double-count it.",
        "Create a policy with no assignments and confirm it is found; then confirm the built-in enrolment restriction defaults are NOT listed — the exemption is deliberate and this is its test.",
        "Create a policy whose only assignment is an exclusion and confirm the excluded-only finding; add an include of the same group and confirm it moves to the include+exclude contradiction instead.",
        "Run with the deployment-status toggle on against a tenant with at least one known-failing deployment and confirm the counts match the portal's device status blade for that policy.",
        "Run T02, T06 and T08 after this change and confirm no unassigned rows appear in any of them — the flag is opt-in and this is the regression that matters.",
        "Revoke Group.Read.All consent (or run as a user without it) and confirm empty-group findings come back as UNKNOWN rather than as an empty list that reads clean.",
      ],
      files: ["js/health.js", "js/groupuse.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 41,
      title: "Assignment what-if — the delta before the change",
      tools: ["🔮 Assignment what-if"],
      builds: [10357],
      risk: "medium",
      what: "T08, after Ugur Koc's IntuneAssignmentChecker (MIT). Pick a user or a device, name a group, and see what joining or leaving would change: gained, lost, pre-excluded, unchanged — with 'lost by joining' (an exclusion on the group) called out, uninstall intents labelled as removals, filtered rows kept at 'may' in both directions, and tenant-wide targets excluded from the delta because membership does not move them. Joins carry the group's own transitive parents; leaves rebuild the closure from the remaining direct memberships; a membership held only through nesting says so instead of simulating an impossible removal. Compare mode: two to four groups side by side, differences only. Assignments read through GroupUse.SOURCES — no second endpoint list. Reads only.",
      why: "MEDIUM — a new read-only tool; nothing existing changes behaviour. The risk is an answer that is WRONG rather than missing: a simulation that overstates or understates a delta invites a membership change on bad evidence. The closure logic (join inherits parents, leave recomputes from remaining directs) is the part that most needs a real directory, because nested and dynamic groups are exactly where hand-reasoning fails.",
      test: [
        "THE ONE THAT MATTERS: take a user, pick a group with at least one policy assigned, and run the join simulation. Then actually add them, run T02 or T06 for the real answer, and compare. Every gained row must appear; anything that applied which the simulation did not predict is a miss worth a bug report. Remove them afterwards.",
        "Join a group that is EXCLUDED from a policy the user receives today. The policy must appear under LOST with 'an exclusion on this group takes it away' — this is the row the tool exists for.",
        "Simulate joining a group that is itself a member of a parent carrying assignments. The parent's policies must appear as gained, marked as coming through inheritance. A what-if that misses this understates every nested join.",
        "Simulate leaving a group the subject is only in through nesting. The tool must say the membership is inherited and produce an empty delta — not simulate a removal the portal cannot perform.",
        "Simulate leaving a group whose policies the subject ALSO receives through a second group. Those policies must NOT appear as lost — the closure rebuild is what this checks, and it is the easiest thing to get wrong.",
        "Pick a dynamic group and confirm the answer is labelled as conditional on the rule, for join and for leave both.",
        "Compare two groups with deliberately different assignments and confirm only the differences are listed, with the identical remainder counted. Then compare a group with itself via a parent-child pair and confirm the child column includes everything the parent's does.",
        "Run as a device subject on a machine with no Entra device id and confirm the refusal is explained rather than an empty answer.",
      ],
      files: ["js/whatif.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
  ],

  staying: [
    {
      title: "🚚 This promotion queue",
      why: "Beta-only by design — js/promote.js and the Help section that renders it exist to describe the gap, so they have no meaning in production.",
    },
    {
      title: "🌐 The absence of a CNAME file",
      why: "This channel is served from nurejev.github.io/tuno-beta and must NOT claim tuno.limon-it.nl — two Pages sites naming one custom domain fight over it. The file was inherited from the scaffold when this branch was cut and removed in build 10333. It is listed here because it is the one change that must NEVER be promoted: main needs its CNAME, and a merge that carries this deletion across takes production off its own domain.",
    },
  ],
};
