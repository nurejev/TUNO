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
//   * PROMOTING AN ITEM IS FIVE STEPS: 1) delete the item here and bump
//     `productionBuild`; 2) set the roadmap card ON MAIN to `live · build
//     NNN`; 3) set the SAME card ON BETA to `live · beta NNNNN · production
//     NNN` (the step that gets missed); 4) add the changelog entry on both
//     channels; 5) RELABEL THE CHIPS ON MAIN — BETA is channel language and
//     never ships to production: a tool new to production wears NEW, one an
//     item changed wears UPDATED, the rest wear nothing (Mihai's rule,
//     production build 10; main-check enforces it). Before promoting, verify each item against what `main`
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
  // Verified against `git show main:js/version.js` — main is at build 11.
  // Promotions: items 1-13 (beta 10301-10317) as build 3, items 14-19
  // (10318-10323) as build 4, items 20-29 (10324-10336) as build 5, items
  // 30-35 (10342, 10344-10348) as build 6, items 36-40 plus 45-52 and
  // 54-57 (10350-10356, 10361-10376; 53 retired into 57) as build 7, and
  // items 44, 58, 59 and 63-67 (10360, 10378-10380, 10384-10405 less the
  // held builds) as build 8 — the second partial promotion.
  //
  // Build 10 is main-only: the chip relabel (BETA off production, NEW and
  // UPDATED on), a channel transform like the roadmap tags, made a standing
  // promotion step at the same time.
  //
  // Items 41-43, 60-62 and 68-96 (beta 10357-10448) went as build 9 — the
  // FULL-QUEUE promotion, and the first ordered by the exported promotion
  // file (item 93's own feature, eating its own dog food).
  //
  // THE QUEUE IS EMPTY. Every tool on this channel is also in production;
  // the only differences left are the two permanent ones in staying[]. An
  // empty queue is a state worth returning to: it means "beta and main
  // match", and the next item added is the whole of the next promotion.
  productionBuild: "v1.0.11",

  items: [
    {
      n: 112,
      title: "T19 \u00b7 T20 \u2014 the second live-tenant round: filters named, device counts that land, a list face for T19",
      tools: ["T19", "T20"],
      builds: [10482, 10483],
      risk: "medium",
      what: "10482: assignment filters are NAMED. js/document.js collect() gathers filterIds beside groupIds and resolves them in one read of /deviceManagement/assignmentFilters (RBAC scope), stamping filterName/filterKind on every assignment; Docs.filterLabel()/filtersOf() are the single spelling, mode included, an unnamed filter keeping its id rather than rendering blank; out.filterError is said by both tools rather than silently showing GUIDs. T20's ensureScopes union gains the \"filters\" section. 10483: THE DEVICE COUNTS WERE ALL WRONG \u2014 Graph.pool returns { item, value } and 10479 read the wrapper as the count, so every group member count landed as null and every reach line said \"~0 of N \u00b7 N still missing (floor)\" about groups Graph had answered for; the value is unwrapped, an all-unknown sum states UNKNOWN instead of ~0, and a partial sum counts up (\"at least X \u00b7 at most Y missing\") rather than putting a ~ on a floor and a firm number on the remainder.",
      why: "MEDIUM: one added Graph read per collection (small, cached nowhere, failure is non-fatal and reported) and display-only changes on top of it. Nothing about how a verdict is decided moves.",
      test: [
        "A policy assigned to a group WITH an assignment filter must show the filter's name and its mode on the reach cell in both T19 and T20 \u2014 not a bare \u2691 chip, not a GUID.",
        "Revoke DeviceManagementRBAC.Read.All (or 403 the filters surface): both tools must print the filter-names-unreadable note and still mark the assignment as filtered, with the id visible.",
        "On a tenant with group-targeted endpoint security policies, the reach cells must show real device numbers \u2014 a page of ~0 means the pool unwrap has regressed. Deny Group.Read.All and the same cells must read UNKNOWN, never ~0.",
        "A policy with no filter must be unchanged \u2014 no chip, no note, no extra read visible in the network tab beyond the one filters call when some other policy has one.",
      ],
    },
    {
      n: 111,
      title: "T20 🧭 Endpoint security posture — the blade, the brief, the best-practice checks",
      tools: ["T20"],
      builds: [10476, 10477, 10478, 10479, 10480, 10481],
      risk: "medium",
      what: "NEW TOOL, R31. js/endpointposture.js: the portal's Endpoint security blade as a rail (Option B of the mockup round) — disciplines split by T16's own classifier over the documenter's settings-catalog read, plus MDE-in-catalog and Edge-in-catalog nodes found by setting definition id families; ENCA T32's impact brief translated from sign-ins to devices (end-user language, enforced-today vs at-rollout from reach-by-construction, MD + Word export via the vendored JSZip); and a best-practice analyser in ENCA's MSLearn check shape — 18 checks over MDE and Edge, each carrying severity, requirement, remediation and its learn.microsoft.com page, with NOT REACHING as its own verdict and unrecognised values said rather than guessed. js/document.js gains templateFamily/templateName on the doc shape (two fields, read from data already fetched). Tile, screen, rail CSS (.ep-*), tab, roadmap R31 ride along. 10477 (first live-screenshot round): the pane toolbar becomes a .list-card and gains the 🗂 Cards | ☰ List seg — cards default, list a .cg-table with the same popout on row click, the choice sticky across nodes, reset on re-read. 10478: ENCA's Markdown report viewer ported as js/report.js (TunoReport, one shared implementation — the .md-view styles had waited since the scaffold) with #reportModal in index.html, and 👁 Read the full brief renders EXACTLY what the export writes, same filename, Copy + Download in the viewer. 10479: 📟 device reach on every check — assignment arithmetic over Graph.memberCount with every limit worn on the line (targets, not check-ins; a GAP says 0 of N, all N missing) — plus the flush-card layout fix: .ep-main joins the .list-card padding convention's named exceptions. 10480: (TO-BE-REMOVED) as a third temporal state — ⏳ interim chips and a WHAT STOPS AT ROLLOUT section in the brief (pane, MD, Word), PASS — INTERIM ONLY as a counted finding via one override in runChecks, and 📟 device counts on the brief's enforced-now statements. 10481 (first live-tenant round): App Control mode READ from the policy content via a raw-value audit flag in catalogRows — enforce/audit/unknown three-way in brief and check, audit never reported as blocking; device numbers on card/list reach cells; at-rollout statements state the whole fleet; retired interim policies dropped from the brief; the git am --quit lesson lands in CLAUDE.md.",
      why: "MEDIUM: new capability, nothing existing changes behaviour — the documenter read gains two carried fields and no read changes shape. The risk to watch is check-set wording being trusted as an audit: every check links its Learn page and says its own limits (reach by construction, no per-device evaluation).",
      test: [
        "Read a tenant with endpoint security policies: every discipline node's count must equal the policies the portal shows under that node (settings catalog templateFamily objects; legacy intents listed under their discipline with the legacy caveat).",
        "A settings-catalog policy configuring Defender AV settings WITHOUT an endpointSecurity template must appear under MDE in settings catalog; one carrying microsoft_edge~policy ids under Edge in settings catalog; one carrying both, under both.",
        "A policy assigned only through exclusions must wear Excluded-only and count as a gap on the overview, not as coverage.",
        "Impact brief: a tenant with an assigned AV policy (realtime allowed) must show 'Files are checked the moment they arrive' under Already enforced today, naming the policy; unassign it (or use one unassigned) and the statement must move to At rollout.",
        "Brief Word export must open in Word with headings and the appendix naming the policies.",
        "Best practice: a tenant with no tamper protection row anywhere must show the critical GAP; one with tamperprotection=0/on in an ASSIGNED policy must PASS; the same setting only in an unassigned policy must read NOT REACHING.",
        "A value the matcher does not know (edit a check regex to force it if no tenant offers one) must render UNRECOGNISED naming the policy, never pass or fail.",
        "Card click must open the documenter's popout with redacted settings; ESC and backdrop close it, a click inside does not.",
        "403 the config scope (a reader-only account): the read must fail as a named error, not an empty rail pretending to be an answer.",
        "Toggle a node to ☰ List: the same policies as table rows, a row click opening the same popout; move to another node and the list view must persist; run a re-read and it must reset to cards.",
        "👁 Read the full brief must render the same text the ⭳ Brief MD download writes — compare a section; Copy Markdown must land the raw Markdown on the clipboard; a policy name containing < must render as text in the viewer, never as markup.",
        "📟 Devices: a tenant-wide assigned policy's check must say the full Windows device count with 0 not targeted; a group-assigned one must say the summed member counts against the fleet with the not-targeted remainder; a GAP must say 0 of N, all N missing; deny Group.Read.All member counts (or use a deleted group) and the line must call the sum a floor, never fake a total. Verify one group's number against the portal's member count.",
        "Layout: every card in the rail pane must carry the standard padding and stacked cards the standard gap — compare against any *Body tool; no text may touch a card border.",
        "Interim: a statement carried only by an assigned (TO-BE-REMOVED) policy with a matching unassigned permanent policy must wear the transition chip; the same with NO staged replacement must land in WHAT STOPS AT ROLLOUT (pane, MD and Word); a check passing only through that interim policy must read PASS — INTERIM ONLY and count as a finding; add one permanent assigned policy for the same setting and both must return to plain green.",
        "Brief device counts: an enforced-now statement backed by a group-assigned policy must show the group's member count against the fleet with the remainder; a tenant-wide one must say 'applies to all N enrolled Windows devices'.",
        "App Control mode (the OIB tenant is the test bed): the WDAC policies whose XML says Enabled:Audit Mode must produce the 'inventorying, not blocking yet' statement and the audit-only finding — NEVER the only-approved-software-runs claim; flip one policy to enforce (or use a tenant that has one) and the blocking statement plus a green check must return; a policy whose settings could not be read must say unknown, not either.",
        "Reach cells: the AV Configuration policy assigned to 4 groups must read '4 groups · ~<sum> of <fleet> devices · <rest> still missing' on both the card and the list row, with the sum matching the portal's member counts.",
      ],
      files: ["js/endpointposture.js", "js/report.js", "js/document.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 110,
      title: "T06 settings popout: beta endpoints read on beta",
      tools: ["T06"],
      builds: [10475],
      risk: "low",
      what: "js/devicewhy.js, one call site. openPolicy read its detail URL with Graph.get, which has no beta switch and so hit v1.0 — where configurationPolicies and groupPolicyConfigurations do not exist. The read is now Graph.readOne for the single-object kinds and Graph.readAll for the collection kinds (catalog settings, ADMX definitionValues), both with beta and retry, the Documenter's own options; the rows already flowed through the Documenter's readers, so redaction is unchanged and the collection kinds gain paging.",
      why: "LOW: one call corrected to the version the rest of the tool already speaks, no new endpoint, no new scope. The bug made the two most-used modern surfaces look unreadable from the one tool built to explain them.",
      test: [
        "Analyze a device, open a Settings catalog policy from the table: the settings list must render, redacted exactly as the Documenter shows the same policy.",
        "Open an ADMX policy: definition values must render with their category paths.",
        "Open a device configuration and a compliance policy: unchanged from before.",
        "Open a catalog policy with more than one page of settings if the tenant has one: the list must be complete up to the 200-row display cap, with the and-N-more line pointing at the Documenter.",
        "A genuinely unreadable policy (deleted between list and click) must still render the could-not-be-read row rather than throwing.",
      ],
      files: ["js/devicewhy.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 109,
      title: "T06 collapses to one row per policy — the verdict and its evidence in one place",
      tools: ["T06"],
      builds: [10474],
      risk: "medium",
      what: "js/devicewhy.js only. analyze() now also builds res.policyRows — one display row per policy, evidence rows folded into a vias list, exclusions sorted first when they decided the verdict — and a shared viaLines() renders the Why column for the screen, the Markdown export and the HTML report: every relationship on its own line, per-via filters carried, the exclusion-beats-inclusion sentence appended once, conflicts carrying the device-against-user sentence. The screen table, its settings-popout click handler and both text exports iterate policyRows; res.rows is untouched and the CSV still emits one line per assignment. The per-row filter note moves from the Effect cell into its via line.",
      why: "MEDIUM only because it reshapes the tool's central table and both human exports in one build — the logic is a fold over data the verdict map already held, and the tests pin the halves: the same policy must appear once on screen and in both text exports, twice in the CSV, and a plain single-include policy must render exactly as before. The bug it cures made the most careful case — an exclusion overriding All Devices — look like a rendering accident.",
      test: [
        "Analyze a device carrying a policy that is All Devices-included AND excluded through one of its groups (the TO-BE-REMOVED LAPS case): ONE row, Excluded once, the Why cell reading exclusion first, then the include, then the beats sentence.",
        "A policy included through two groups and excluded through a third must be one row with three via lines and the plural form of the beats sentence.",
        "A device-group include with a user-group exclusion must be one row, Included and excluded, with the conflict sentence — not two rows and not a silent pick.",
        "A plain single-include policy, a filtered assignment (may reach it, filter named on its via line) and an All Users row on a userless device must each render exactly as before the change.",
        "Markdown and the HTML report must name each policy once with the stacked why; the CSV must still carry one line per assignment with the Assignment and Via columns intact. The settings popout must open from the collapsed row.",
      ],
      files: ["js/devicewhy.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 108,
      title: "Tile chips speak the channel truth: NEW/BETA only off-production, UPDATED from the queue",
      tools: ["All tools"],
      builds: [10473],
      risk: "low",
      what: "index.html and CLAUDE.md only. Eighteen tiles lose their NEW and BETA chips (their tools run in production 11); the Policy overview keeps both as the one beta-only tool; the Configuration documenter, Device analyzer and Intune RBAC gain UPDATED because pending queue items 99, 103, 105-107 changed them; the two writes-to-the-tenant chips are untouched. The tile-tags comment now states the rule — the 10467 roadmap rule applied to tiles — and CLAUDE.md gains three patch-handover lessons from the night this shipped: an already-applied patch announces itself by its subject matching HEAD's, multi-build handovers are one mbox, and a failed am is aborted before anything else runs.",
      why: "LOW and beta-facing: production tiles are relabelled at promotion by standing step 5 and main-check enforces them, so nothing a customer sees changes. What changes is whether this channel's own tiles mean anything — a page where every tile says NEW and BETA has chips that answer no question, which is how a genuinely updated tool went unnoticed on the day it changed twice.",
      test: [
        "On this channel, exactly one tile wears NEW or BETA and it is the Policy overview; every other tile wears either UPDATED or nothing, and the UPDATED set matches the tools named by the pending queue.",
        "The Assignment editor and Assignment filters tiles keep the writes-to-the-tenant chip with no status chip beside it.",
        "The version stamps on the tiles and headers are untouched — the chip is the news, the stamp is the number.",
        "At the next promotion, step 5 clears the promoted tools' UPDATED chips here and sets main's own labels; after a full-queue promotion no tile here wears UPDATED.",
        "Production after that promotion must satisfy main-check exactly as before — this build changes nothing it checks.",
      ],
      files: ["index.html", "CLAUDE.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 107,
      title: "T06's box suggests devices and users — Suggest's dvTerm registration widened",
      tools: ["T06"],
      builds: [10472],
      risk: "low",
      what: "js/suggest.js only. A deviceUser kind whose scopes are the union of deviceObjects and directory, and whose fetch runs the existing device and user fetchers in parallel, four rows each, hints marked device and primary user; one fetcher failing never silences the other. dvTerm's registry entry moves from device to deviceUser. Pick behaviour is the component's own: users fill the UPN, devices fill the name — both exactly what T06's resolver matches.",
      why: "LOW: no new component, no new tool code, and the consent rule is untouched — an ungranted scope shows the enable row, which now honestly names both scopes the first suggestion will read. The build exists because T06 learned to take a user in 10468 and its autocomplete did not: typing a name into the widened box produced silence, which reads as broken.",
      test: [
        "With both scopes in hand this session, type three letters of a colleague's name into T06: devices and users must appear together, each row labelled, users showing their UPN.",
        "Pick a user: the box must fill with the UPN and the run must resolve it by the primary user. Pick a device: the name fills and resolves as before.",
        "In a fresh session with no scopes granted, typing must show the enable-suggestions row naming Device.Read.All, User.Read.All and Group.Read.All — and typing on with the row ignored must change nothing about the run.",
        "Arrow keys and Enter must pick without triggering the run, and Escape must close the menu — the capture-phase rule from the component.",
        "Every other suggesting box (group boxes, the what-if subject) must behave exactly as before.",
      ],
      files: ["js/suggest.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 106,
      title: "Intune RBAC: a permissions button opens the role's allow list in the modal",
      tools: ["T07"],
      builds: [10471],
      risk: "low",
      what: "js/roles.js plus one sentence each in the T07 screen and help text. Engine: Roles.roleSettings(id) re-reads ONE definition with rolePermissions on the click (the run's $select still drops them), and parseActions splits Microsoft.Intune_Category_Action into the portal's own category grouping, keeping allowed and notAllowed apart. Screen: a ⚙ permissions button on every role head (skipped for unknown roles), opening the same rbModal — allowed actions as chips with the raw Graph name on hover, denied actions marked, an empty definition and a refused read each saying so, the allow-list sentence at the foot. Cached per role id, cleared with the members cache on run and reset. Exports untouched.",
      why: "LOW: one read, on demand, under the RBAC scope the run already asked. The description field cannot be trusted to say what a role allows — the screenshot that prompted this had the permissions typed into the description by hand, which is exactly the thing that drifts.",
      test: [
        "Run T07 and click ⚙ permissions on a custom role: the modal must list its actions grouped by category, matching the portal's Role properties blade for that role.",
        "Click it on a built-in role with a large grid (Policy and Profile manager): the categories must be legible, not one wall of chips, and hover must show the raw action name.",
        "Open the same role's permissions twice: the second open must be instant with no new Graph call. Run again and reopen: a fresh read.",
        "The button must not toggle the role fold, and the 👥 members button must still work beside it — both modals share rbModal and must not fight.",
        "Exports before and after viewing permissions must be identical.",
      ],
      files: ["js/roles.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 105,
      title: "Intune RBAC: a group member opens to who is in it — ENCA's per-group scan, ported",
      tools: ["T07"],
      builds: [10470],
      risk: "low",
      what: "js/roles.js plus the T07 screen and help text, and an rbModal block in index.html (ENCA's modal, the guModal/dcModal classes). Engine: Roles.groupMembers(id) — ENCA's loadMembers for one group — reads transitiveMembers/microsoft.graph.user with ENCA's 500 cap, returning total, capped and the member list with a disabled flag. Screen: group-typed member rows gain a 👥 members button (delegated handler, role-fold clicks ignore buttons); the modal reads on the click, caches per group id, paints only if that group is still the one asked for, and states the honesty lines — users only, nesting flattened, cap versus true total, who can change the list. run() and reset() clear the cache and close the modal. Exports are untouched: the report stays the assignment as written.",
      why: "LOW: reads only, on demand only, under scopes the tool already asks for — nothing changes for anyone who never clicks the button, and the run itself makes not one extra call. The question it answers is the audit's next sentence every time a group appears in a role: fine, and who is that today?",
      test: [
        "Run T07 on a tenant where a role assignment names a group. The group row must carry the 👥 members button; user rows must not.",
        "Click it: the modal opens with the group name, reads, and lists users with sign-in names, disabled accounts tagged, the subtitle carrying the flattened-user count. Close and reopen — the second open must be instant, with no new Graph call.",
        "Click the button on a group inside a folded-open role: the fold must NOT toggle closed.",
        "A group holding only devices or nothing must say so in the modal rather than showing an empty table; a group the account cannot read must show the refusal in the modal, with the report behind it untouched.",
        "Run again: the cache is gone (a change to the group between runs shows on the next click). Exports before and after clicking must be identical — the expansion never enters the report.",
      ],
      files: ["js/roles.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 104,
      title: "The tool header wears the T-number and version, ENCA's stamp ported",
      tools: ["All tools"],
      builds: [10469],
      risk: "low",
      what: "js/app.js only. ENCA's stampHeadVersion, ported: a SCREEN_TOOL map (screen id to tool id, since TUNO's screens carry no head ids), the .tool-ver-head pill appended to the first list-card's heading on each of the nineteen tool screens, textContent T-number plus version from TOOL_VERSIONS, hover title carrying the permanent-number sentence and the tool's release note. A MutationObserver per head re-stamps if a tool ever re-renders its header — the stamped-already check is what stops it looping. The CSS class already existed, unused since the scaffold; no stylesheet change.",
      why: "LOW: additive chrome from data already shipped (TOOL_VERSIONS), no tool logic touched, no reads, no scopes. The tile had the stamp and the header did not — which is backwards, because the header is where you are when you wonder what version answered you.",
      test: [
        "Open any tool: the header heading must end with the T-number and version pill, matching the home tile's stamp exactly, with the release note on hover.",
        "Count: all nineteen tool screens carry the pill; Help, Roadmap, Changelog and the home screen carry none.",
        "The pill must appear once, not stack — revisit a tool, switch tabs back and forth, and confirm a single stamp.",
        "Tools whose headings carry chips (BETA, writes to the tenant) must show the pill after the chips without wrapping oddly at normal widths.",
        "On production after promotion, the pill wording must be identical — the stamp carries no channel language.",
      ],
      files: ["js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 103,
      title: "The Device analyzer finds the machine from its primary user, and a multi-match is a pick",
      tools: ["T06"],
      builds: [10468],
      risk: "low",
      what: "js/devicewhy.js plus the T06 screen, tile and help text. findDevice gains three routes off fields already in LIST_SELECT: a term with an @ is tried as userPrincipalName server-side before the device filters, the inventory-scan fallback also matches userPrincipalName and userDisplayName exactly, and a GUID is tried as the user's object id (userId) after the two device ids. Every multi-match path — user, name, serial, Entra device id, scan — now returns the matches instead of throwing, and the screen renders them as clickable .scard device cards (primary user, compliance, last check-in, model, enrolment date; keyboard-operable, capped at 24 with a narrowing note); a click runs the analysis on that device and the report's matched-on line names the route plus that it was picked from N. No new scope, no change to the analysis itself.",
      why: "LOW: reads only, no new permission, and every single-match path returns exactly what it did before — the behaviour change is confined to searches that previously ended in an error telling the admin to go find a GUID, which now offer the devices found. The user route is the feature: the ticket names the person far more often than the serial, and the enrolment record has carried the answer all along.",
      test: [
        "Search a UPN whose user has one enrolled device: the analysis must run straight through, and the report's matched-on line must say the primary user.",
        "Search a UPN with two or more devices: cards must render with the right user, compliance and check-in on each; clicking one must analyze that device, and the report must say it was picked from N. Enter on a focused card must do the same as a click.",
        "Search a device name that collides (or a duplicated Entra device id if the tenant has one): the pick must appear where the old error did, and picking must work the same way.",
        "On a tenant that refuses the userPrincipalName filter, the scan fallback must find the user's devices by UPN and by exact display name, and the notes must say which filter was refused and that the inventory was listed.",
        "Regression: a name, a serial, an Intune device id and an Entra device id that each match exactly one device must all still resolve directly with the same matched-on wording as before; a term matching nothing must fail with the message now naming primary users among the exact-match keys.",
      ],
      files: ["js/devicewhy.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 102,
      title: "The roadmap: shipped cards stop claiming BETA, and the beta era leads",
      tools: ["All tools"],
      builds: [10467],
      risk: "low",
      what: "index.html only. Every roadmap card whose live tag names a production build loses its BETA chip — 23 of them did, leaving exactly one (R30, genuinely beta-only). The .rm-era.beta block moves above .rm-era.now, so the order reads beta, now, next, later. areas-roadmap-tests gains two assertions: the era order, and that no card carries a BETA chip while naming a production build — with the corollary that every BETA chip sits on a card in the beta era.",
      why: "LOW to build and BETA-ONLY in effect: production already forbids these chips outright and main-check enforces it, so nothing here changes what a customer sees on tuno.limon-it.nl. What it changes is whether this channel's own roadmap is readable — a page where 24 of 30 cards say BETA has a chip that means nothing.",
      test: [
        "Read the roadmap on this channel top to bottom. The beta era comes first and holds only work that is not in production; every card below it that names a production build must have NO beta chip.",
        "Confirm exactly one card still carries a BETA chip and that it is the one in the beta era. If a second appears later, the chip and the era have disagreed again.",
        "Card count is still 30 and no reference appears twice.",
        "On production the roadmap must be unchanged — it never had these chips, and main-check would have failed if it did.",
        "Check the era headings still read correctly in the new order, and that the beta era's intro does not imply it is a footnote to what is above it.",
      ],
      files: ["index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 101,
      title: "The field look is the default, not something a control opts into",
      tools: ["All tools"],
      builds: [10466],
      risk: "medium",
      what: "css/app.css: the .wi-f input/select rule gains 'main input:not([checkbox|radio|file|color|range]), main select, main textarea' as selectors, so every text-ish control inside the app gets the field treatment without a wrapper. textarea keeps its own height; tick boxes and radios are explicitly reset as well as excluded; the sign-in card is outside the scope. Found by enumerating every control in index.html and asking which sat outside .wi-f — nine did, across T01, T11, T15 and T19, and only T15's was reported.",
      why: "MEDIUM, and only because the selector is BROAD. It reaches every input in the app rather than the nine that were wrong, which is the point — but it also means a control somewhere that was relying on the browser default now looks different. Reading the diff will not tell you that; opening the tools will.",
      test: [
        "THE ONE THAT MATTERS: walk every tool and look at every input, select and text area. They must all match. This rule reaches controls nobody listed, so the risk is a control that WANTED to be different, not the ones that were broken.",
        "T15's device search is the reported one — confirm it now matches the fields around it.",
        "Check the tick boxes in the surface pickers and the assignment editor are still tick boxes and not 38px bordered squares. That exact bug happened once already under the old rule.",
        "Check any text area (the what-if group list) is still multi-line and has not collapsed to one row.",
        "Check the sign-in screen is unchanged — it is outside the scope on purpose.",
        "Both themes, and check focus rings still appear on the controls that gained the styling.",
      ],
      files: ["css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 100,
      title: "R30 moves out of Now — the roadmap stops calling a beta-only tool shipped",
      tools: ["All tools"],
      builds: [10465],
      risk: "low",
      what: "index.html only: the R30 card moves from .rm-era.now to .rm-era.beta, and the beta era's empty-state sentence \u2014 the one claiming the channels match \u2014 is replaced by a description of the era, since it now holds a card. R30 was the only card in Now carrying a live tag with no production build, which is exactly the condition the era split introduced at 10425 exists to prevent.",
      why: "LOW to build, but the roadmap is a customer-facing claim about what is in production — a card in the wrong era says something false about the tenant-facing site, which is why this one is worth checking rather than reasoning about.",
      test: [
        "Read the roadmap on this channel: every card under Now must name a production build, and every card under In beta today must not. R30 is the only card that should be in the beta era.",
        "Confirm the beta era's intro sentence no longer claims the two channels match, because they do not while R30 sits there.",
        "Card count must still be 30 and no reference number may appear twice.",
        "On production, confirm R30 does not appear at all — the tool is not there, so neither is its card.",
      ],
      files: ["index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 99,
      title: "T19 🗂 Policy overview — the tenant as cards (R30, mockup Option B)",
      tools: ["🗂 Policy overview", "📄 Configuration documenter"],
      builds: [10458, 10459],
      risk: "low",
      what: "10459 folds in: prog() delegates to TunoProgress (the 10397 shared card) hosted in a plain #ovBody div, replacing 10458's hand-rolled text line — one way a read looks, everywhere. New tool file js/overview.js: ENCA's list-policies view, Intune-side-out — Option B of the mockup round (surface stat cards double as filters, T09 pattern, over ONE flat .scard grid; ENCA's card classes worn for the first time). Read = Docs.collect() whole, scopes at the click as T05's own union (all thirteen surfaces + directory for group names). Verdicts: assigned (reaching by construction) / unassigned / excluded-only (its own verdict, T09's distinction), ⚑ filter caps at may on the card. Failed surfaces render as ⚠ non-filter cards (unknown, not zero). Search (static toolbar, survives re-render) matches names/types/descriptions/platforms/surfaces/assignment group names; chips count the surface+search set. Card click opens Docs.popoutHtml — EXTRACTED from DocsTool.openPolicy in this build so the popout template exists once (T05 keeps its include-in-document foot, T19's foot is Close). Registered: tile leads the 📦 Configuration section, TOOL_TABS, HISTORY_SCREENS, sidebar (derived), T19 in TOOL_VERSIONS, R30 roadmap card live · beta 10458, .ov-surf styles in app.css.",
      why: "LOW — reads only through T05's already-proven collect(); the one shared-code change is the popout extraction, byte-identical markup, and the suite renders both tools' popouts to hold it. Real eyes needed on: the surface rail wrapping on a narrow window, the ⚠ card in all three themes, and a real tenant's card grid at 300+ objects.",
      test: [
        "THE ONE THAT MATTERS: read a real tenant, click ✅ Compliance's surface card — the grid narrows to compliance only, the chips recount, clicking the card again brings everything back; same toggle on a verdict chip.",
        "Click a settings-catalog card: the documenter's popout opens with the full settings table, redacted values italic; Close and Escape and backdrop all close it; open the SAME policy in T05 — identical head and body.",
        "Type a group name in the search: only policies assigned to (or excluding) that group remain, and typing is never interrupted by the re-render.",
        "A tenant (or role) where a surface 403s: that surface is a dashed ⚠ card naming the error, it does not filter, and the note above says N surfaces could not be read.",
        "Excluded-only policy: amber chip on the card, reach says nobody (−n excluded); a filtered assignment wears ⚑ filter — may.",
        "T05 regression: browse, open a popout, tick include-in-the-document from the popout — the selection still follows.",
        "10459: click Read the tenant — the centred spinner card appears where the results will land (not squeezed into the card grid), steps name the surfaces, and it is gone the moment the surface rail renders.",
      ],
      files: ["js/overview.js", "js/document.js", "js/app.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
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

// ======================================================================
// THE PROMOTION ORDER (build 10444). The Help queue grew tick boxes; this
// turns the ticked numbers into a small file Mihai hands to a working
// session as the promotion instruction.
//
// THE FILE IS THE ORDER, NOT THE VERIFICATION — it says which items to
// promote, in Mihai's words, with the machine-readable order embedded. The
// session that receives it still verifies every item against what main
// actually contains, because the queue's own header says not to trust the
// queue's list, and that rule does not bend for a nicer file format.
// ======================================================================
PROMOTE.buildOrder = function (pickedNs, appBuild) {
  const ns = [...new Set((pickedNs || []).map(Number))].sort((a, b) => a - b);
  if (!ns.length) throw new Error("Nothing is ticked — an empty order is not an order.");
  const items = ns.map((n) => {
    const it = (PROMOTE.items || []).find((i) => i.n === n);
    if (!it) throw new Error(`Item ${n} is not in the queue — it may have shipped since the tick. Untick it and export again.`);
    return it;
  });
  const when = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const beta = appBuild ? appBuild.label : "";
  const L = [];
  L.push("# TUNO promotion order");
  L.push("");
  L.push(`Generated ${when} on ${beta} · production is ${PROMOTE.productionBuild}`);
  L.push("");
  L.push(`PROMOTE ITEMS: ${ns.join(", ")}`);
  L.push("");
  L.push("For the working session: this file is the ORDER, not the verification.");
  L.push("Verify each item against what main actually contains before building");
  L.push("the production commit — the queue's own rule. Items promote together");
  L.push("where their builds interleave; the session decides the cut.");
  L.push("");
  for (const it of items) {
    L.push(`## Item ${it.n} — ${it.title}`);
    L.push(`- tools: ${(it.tools || []).join(", ")}`);
    L.push(`- beta builds: ${(it.builds || []).join(", ")}`);
    L.push(`- risk: ${it.risk}`);
    L.push(`- files: ${(it.files || []).join(", ")}`);
    L.push("");
  }
  L.push("```json");
  L.push(JSON.stringify({ order: ns, generated: when, betaBuild: appBuild ? appBuild.build : null, productionBuild: PROMOTE.productionBuild }));
  L.push("```");
  return {
    filename: `tuno-promotion-order-${when.slice(0, 10)}.md`,
    text: L.join("\n"),
  };
};

