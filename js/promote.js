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
  // Verified against `git show main:js/version.js` — main is at build 7.
  // Promotions: items 1-13 (beta 10301-10317) as build 3, items 14-19
  // (10318-10323) as build 4, items 20-29 (10324-10336) as build 5, items
  // 30-35 (10342, 10344-10348) as build 6, and items 36-40 plus 45-52 and
  // 54-57 (10350-10356, 10361-10376; 53 retired into 57) as build 7.
  //
  // What remains is exactly the four new tools — T08 what-if, T09 health,
  // T10 settings search, T11 assignment editor — held in beta on purpose
  // until each has run against a real tenant. They are the whole of the
  // next promotion.
  productionBuild: "v1.0.7",

  items: [
    {
      n: 64,
      title: "R09 — restore, inside the backup tool",
      tools: ["📦 Backup configuration"],
      builds: [10385],
      risk: "high",
      what: "T04 v0.2 (js/restore.js), after Ugur Koc's restore script + TenuVault's rules. Parses this tool's zips AND the original script's (shared folder layout; manifest optional). CREATE ONLY — no patch, no delete of yours; the one exception is TenuVault's kept exactly: an ADMX template the restore half-created is rolled back on a failed child write. Editable [Restored] prefix per row; collision stop at dry run AND re-checked fresh per create; overwrite deliberately not offered (departure, said on card); assignments NOT restored — everything arrives unassigned (departure from off-by-default, said on card). Bodies: settings-catalog settings inline on the create; compliance scheduledActionsForRule with source ids stripped; ADMX children bound to Microsoft's own definition/presentation ids; scripts to their own surface with body, non-restorable unselectable. Read-back verify per create. Scopes at apply: profiles + scriptsWrite (both declared).",
      why: "HIGH — the fourth writer, and the one that creates many objects in one act. The create-body shapes (settings inline, scheduledActionsForRule, the ADMX odata binds) are asserted against fabricated archives; whether a real tenant accepts them, and whether the ADMX rollback fires cleanly, only a live restore proves. The collision stop and create-only sequencing are headlessly proven by operation order. Graduates after a real round trip: back up a test tenant, restore into it (collisions must SKIP everything), restore into a clean tenant (objects must arrive, prefixed, unassigned, settings intact in the portal).",
      test: [
        "THE ONE THAT MATTERS: back up a test tenant with T04, restore the same archive into the SAME tenant — every object must skip as collided (the names exist), zero creates.",
        "Rename one object in the restore column and apply: exactly that object is created, prefixed name, unassigned, settings present in the portal (settings catalog: open it and count; ADMX: definition values enabled as archived).",
        "Restore an archive from Ugur Koc's backup script (not TUNO's): it must parse, list, and restore the same way.",
        "Break one ADMX definition value (edit the archive JSON to a bogus definition id): the create must fail, the half-created template must be ROLLED BACK, and the result row must say so — verify nothing remains in the portal.",
        "A compliance policy must arrive with its scheduled actions (open it in the portal — the block action must be there).",
        "A script archived without bodies (skip-content backup) must be unselectable with the reason shown.",
        "Kill the network between dry run and apply: the per-create fresh check must fail loudly, not create blind.",
      ],
      files: ["js/restore.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 63,
      title: "R21 — assignment filters, read and write (T14)",
      tools: ["🧩 Assignment filters"],
      builds: [10384],
      risk: "high",
      what: "New tool T14 (js/filters.js), after Alper Atar's IntuneShade (MIT). READ: assignmentFilters list; per-filter usage via GroupUse.analyze over its own SOURCES (match-all + tenant-wide), grouped by filterId; used-by ABSENT until scanned, zeros are floors when a surface failed. WRITE (the third writer, T11's rules for one object): create → read-back; edit → fresh read + lastModifiedDateTime drift stop (refused, nothing written) → PATCH → read-back verified field-for-field; delete → typed name confirm → FRESH $expand=payloads association check at the moment of the act (any reference REFUSES; a failed check REFUSES) → DELETE → notfound read-back. Cached usage dropped after every write. Graph layer gains patch/del under the no-retry write rule — first PATCH/DELETE in the app. Platform fixed after creation. Tile (Assignments & scope), screen, tab, sidebar, t:14, MD export.",
      why: "HIGH — a write tool, and its worst mistake is the quiet one: a deleted in-use filter widens every assignment that carried it, invisibly, tenant-wide. The gate order (check THEN delete), the drift stop, and the refuse-on-unverifiable rule are headlessly proven against fakes; what no fake proves is whether $expand=payloads reports every real association shape on a live tenant, and that is exactly the fact the gate rests on. Graduates only after the delete gate has REFUSED a real in-use filter in a real tenant, and a create/edit/delete round-trip has been verified in the portal.",
      test: [
        "THE ONE THAT MATTERS: in a test tenant, reference a filter from one assignment, then try to delete it here — REFUSED, naming the reference; remove the reference in the portal, delete again — it goes, and the read-back agrees.",
        "Create a filter here; confirm in the portal (name, platform, rule, type). Edit its rule here; confirm the portal shows the new rule and the read-back message carried the tenant's lastModified.",
        "Drift stop: load a filter for edit, change its description in the portal, then apply here — REFUSED as drifted, nothing written (portal still shows the portal's version).",
        "Usage scan on a tenant with filtered assignments: counts match a portal spot-check; the used-by column is a dash before the scan, never 0.",
        "Break one surface (revoke its scope): the scan must name it and the zeros must be labelled floors.",
        "Delete with the network cut between check and act (devtools offline): the error is the ambiguous-write wording, not a silent success.",
        "The typed-name confirm: the Delete button stays disabled until the name matches exactly.",
      ],
      files: ["js/filters.js", "js/graph.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 62,
      title: "R22 — the compliance report (T13)",
      tools: ["📈 Compliance report"],
      builds: [10383],
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
      builds: [10382],
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
      n: 59,
      title: "The console shell — sidebar navigation and a 1500px content column",
      tools: ["TUNO"],
      builds: [10380],
      risk: "medium",
      what: "Layout parity with the console-style tooling (the IntuneShade comparison, beta 10379): a fixed left sidebar (240px) listing every tool, grouped as on the home grid — built at sign-in by walking the grid's own sections and tiles, labels from the tool list via labelFor() (never scraped from tile headings, the old tab-strip bug). Overview on top; clicking an item fires the tile's own handler, so crumb/tab/screen logic is untouched. The tab bar STAYS — sidebar is where you can go, tabs are what you have open — and the sidebar highlight follows activeTab, set in renderTabs(), so the two cannot disagree. Shell: body.with-side at enter(), removed at sign-out; content column 1180 → 1500px, left-anchored beside the sidebar; hwrap uncapped; toolnav-inner starts at the content edge with the auto-margin centring taken off. Sidebar top is --sticky-nav so the tab bar never draws across it. Below 1240px (the stylesheet's existing breakpoint) the sidebar is display:none and every with-side override reverts to the centred column. Sign-in screen unchanged — none of this exists before authentication.",
      why: "MEDIUM — no Graph surface is touched and no tool logic changes, but this restyles the shell every tool lives in, and layout is exactly what headless jsdom cannot prove: jsdom does not do layout, so the fixed-position maths, the sticky interplay and the 1240px collapse are asserted as stylesheet text, not as rendered pixels. The 10321 lesson (two widths read as a bug) says shell changes deserve real eyes. Graduates when the beta site has been driven on a wide monitor, a laptop, and a sub-1240px window — tabs open and closed, a tool entered from tile, sidebar and + menu, sign-out and back in — with nothing overlapping and nothing unreachable.",
      test: [
        "THE ONE THAT MATTERS: on the beta site at full width, sign in — sidebar appears with every tool grouped as on the home grid, Overview highlighted; open a tool from a TILE — sidebar highlight and tab agree; open a second from the SIDEBAR — a tab appears for it; close that tab — the sidebar highlight follows to the neighbour tab, not the closed tool.",
        "The tab bar must start at the content edge, not under the sidebar, and must not draw across the sidebar when it appears (open first tool: sidebar shifts down by the bar's height — no overlap, no gap).",
        "Narrow the window below 1240px: sidebar gone, content centred, everything still reachable via tab bar and home grid. Widen again: sidebar back, highlight still correct.",
        "Sign out: sidebar gone, sign-in card centred exactly as before this build (compare against production).",
        "Scroll a long screen (Roadmap, Help): sidebar stays put and scrolls independently when its own list overflows; the fs popout still covers everything including the sidebar.",
        "Both themes: sidebar surface, borders, hover and the green active state match the tab bar's; dark-theme active text uses green-deep like the tabs.",
        "The home grid still shows all tools and the sidebar lists exactly the same set — same count as homeCount says.",
      ],
      files: ["index.html", "css/app.css", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      // n is NEXT FREE, not next visible: 45-57 existed and graduated (or
      // retired), so reusing a low number would collide with what the
      // sign-in suite still asserts about the old item 45.
      n: 58,
      title: "The App Control events set — collect, retrieve, and judge against the draft",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10378, 10386],
      risk: "medium",
      what: "10386 (collector 1.0.2): the first real run crashed with the PS 5.1 dictionary-binder defect — TWICE, in two shapes. 1.0.0 died on [ordered] handling despite the IDictionary-cast discipline; 1.0.1 added a trap that names the failing line, and the very next run named line 402: dot access on a PLAIN HASHTABLE ($section.Events) goes through the same broken member binder. The discipline is now total: no [ordered] anywhere, every dot-accessed object is [pscustomobject] (the scan's proven shape), dictionary writes via .Add(), and the only indexed read left ($Verdict[[int]id]) is byte-identical to the scan's working construct. The trap stays — it turned a position-1,1 mystery into a one-paste diagnosis. Also folds in the scripts' TunoBuild stamp realignment: builds 10379-10385 bumped the site without bumping the scripts. ORIGINAL ITEM: three new scripts (guarded): Get-TunoAppControlEvents.ps1 harvests CodeIntegrity + all four AppLocker logs into per-ID CSV/XML, an HTML report, and a tuno.applocker.events/1 JSON bundle — report and bundle written to the IME Logs root as .log so Collect diagnostics gathers them; Detect-TunoAppControlEvents.ps1 always exits 1 (the remediation IS the harvest — the docs say what that does to the console numbers); Compress-TunoAppControlReport.ps1 zips the newest report+bundle for Live Response getfile. T01: third entry in REMEDY_PAIRS (name '[REPAIR_TOOLS]Win - DHS - Device Security - D - Collect AppControl Events - R27.1 - v3.9'), three download rows, and a new import path — the upload sniffs JSON by CONTENT (the bundle arrives named .log), routes on the schema, and the events bundle NEVER touches the loaded policy: it renders an evidence card aggregating blocked/audited events per file, judged against the draft with the same matcher as the coverage table (broad-audience allows only, deny beats allow, exceptions honoured), one recommendation per row. Replaces CloudFlows Remedate_ACB with three defects fixed: missing 8005/8007 (enforced MSI/script blocks left NO evidence), global SilentlyContinue making every catch dead, 48-ID FilterHashtable exceeding the ~23-comparison XPath limit and silently returning zero CodeIntegrity events. The guard now also sweeps scripts/*.ps1 for unlisted files — Detect-TunoItToolsFolders.ps1 had shipped a build unguarded — and five stale suite assertions from the 10374 pair-table refactor were repaired (including parseFloat('0.10') reading the tenth iteration as a tenth).",
      why: "MEDIUM — the collector only reads logs and writes reports, and the browser half only adds an import path and a third row in machinery two pairs already exercise. But the PowerShell is UNEXECUTED here (no PS runtime in this environment): the UserData XML parse, the chunked queries, and the JSON shape are verified by argument and by the headless suite's source assertions, not by a run. The Remediation deploy path is the proven one. Graduates when one device has produced a bundle that imports cleanly.",
      test: [
        "10386: re-run the collector on the machine where 1.0.0 and 1.0.1 crashed — it must reach 'Collection complete' and print the summary line. Check the log banner says v1.0.2. If it FATALs again, the trap names the line: paste it.",
        "THE ONE THAT MATTERS: run Get-TunoAppControlEvents.ps1 elevated on a device with AppLocker events (the reference machine after the audit profile has run works), then upload the AppControlEvents_Bundle_*.log it writes to T01 with a policy loaded. The card must show the same counts the script's summary line printed, and a known blocked-from-Downloads event must read 'stays blocked — the policy working'.",
        "Check the JSON parses: PowerShell 5.1 AND 7, machine WITH events and machine WITHOUT (empty entries must not make the card lie about a quiet estate vs an unreached one — the allowed count is the discriminator).",
        "Deploy the pair from the browser: the third card must create it with the [REPAIR_TOOLS] Collect name, SYSTEM/64-bit, unassigned; same-name second click must STOP.",
        "Assign to one test device with a schedule, let a pass run, then Devices → Collect diagnostics: the HTML report AND the bundle must be in the collected zip (the .log naming is the mechanism — if diagnostics misses them, the trick regressed).",
        "Run Compress-TunoAppControlReport.ps1 in a Live Response session: ARCHIVE: line, zip under IT-TOOLS\\Apps, both files inside, getfile retrieves it.",
        "Enforced-block evidence: on a device with an ENFORCED MSI/Script policy, block an .msi and confirm event 8007 lands in the bundle — the exact evidence the old collector dropped.",
        "Sanity-check the CodeIntegrity numbers against Event Viewer on one machine: the chunked queries must not double-count (dedupe) or under-count (the old XPath-limit failure).",
      ],
      files: ["scripts/Get-TunoAppControlEvents.ps1", "scripts/Detect-TunoAppControlEvents.ps1", "scripts/Compress-TunoAppControlReport.ps1", "js/applocker.js", "index.html", "scripts/README.md", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 44,
      title: "Assignment editor — bulk changes behind four gates",
      tools: ["✏️ Assignment editor"],
      builds: [10360],
      risk: "high",
      what: "T11, after Maxime Guillemin's Intune-Toolkit (MIT). Add include / add exclude / remove a group across device configurations, settings catalog, compliance and ADMX — the four surfaces under the write scope the registration already holds; scripts and apps deliberately absent (each is a new write scope, the R18 rule). Pipeline enforced by the screen: read → dry run (group name + member count, empty-group warning, noops and REFUSALS listed — include-onto-excluding and exclude-onto-including are refused with T09's reasoning) → automatic backup file, apply locked until taken → removals confirmed by TYPING the group name → sequential writes, each preceded by a fresh read (drift = skip, never overwrite) and followed by a verify read-back. Untouched assignments re-serialised with filters preserved. No delete, no rename. Write scope asked at the apply click.",
      why: "HIGH — the second write tool and the first at scale. The mistake it enables is a policy reaching the wrong population, which is invisible until devices behave differently. The specific things that must be true: filters survive the round trip on untouched assignments, the drift check actually fires, and the verify is the tenant's read-back rather than the POST's status. All three are asserted headlessly; none of the three has touched a real tenant yet.",
      test: [
        "THE ONE THAT MATTERS: take a policy with TWO assignments, one carrying an assignment filter. Add an unrelated group. After the write, open the policy in the portal and confirm the filtered assignment STILL HAS ITS FILTER. Losing it silently widens the assignment — the worst thing this tool can do, and invisible in the tool's own table.",
        "Dry-run a removal and confirm apply stays locked until the backup is downloaded AND the group's name is typed exactly. Then restore from the backup file (POST /assign with the recorded list) and confirm the policy is back as it was — an untested backup is a hope, not a way back.",
        "Between dry run and apply, change the policy's assignments in the portal from another window. Apply must SKIP it as drifted, not overwrite. This is the two-admins case and nothing else exercises it.",
        "Add an include of a group the policy already excludes: the plan must REFUSE with the contradiction reason, not write. Then remove the exclusion and confirm the same operation now plans cleanly.",
        "Add an include of an EMPTY group and confirm the dry run says it configures nothing until somebody joins. The write should still be allowed — preparing a landing zone is legitimate — but never silently.",
        "Pull the network (or revoke the write scope) mid-apply with stop-on-failure on: the run must stop, the results table must say which policies were written-and-verified and which were not touched, and nothing may retry.",
        "Verify the scope prompt appears at the APPLY click and not at read or dry-run — plan a change without ever consenting to ReadWrite and confirm reads alone got you there.",
        "Confirm scripts and applications appear nowhere in the surface list, and that the screen says why.",
      ],
      files: ["js/assignedit.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
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
