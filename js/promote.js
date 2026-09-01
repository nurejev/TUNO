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
  // Verified against `git show main:js/version.js` — main is at build 12.
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
  // Items 97, 98 and 100-102 (beta 10451-10457, 10460-10463) went as build
  // 11 — a PARTIAL promotion that held item 99 back.
  //
  // Items 99-122 (beta 10458-10459, 10465-10517) went as build 12 — the
  // second full-queue promotion, ordered by the exported file. A NUMBERING
  // SLIP is recorded here rather than repaired: after 10464 the queue handed
  // 100, 101 and 102 out AGAIN to new work (10465-10467), so this ledger
  // names 100-102 twice and the two mentions are DIFFERENT work — build 11's
  // are the AppLocker-era items, build 12's the roadmap, field-look and chip
  // items. Numbers exist to be permanent precisely so that cannot happen;
  // the numbers stay as history wrote them, and the next item takes 123.
  //
  // The queue emptied at 10518 — the state worth returning to — and items
  // 123 up are the next promotion. Per the ledger above, 123 was
  // deliberately the next number: 100-102's reuse is history, not licence.
  productionBuild: "v1.0.12",

  items: [
    {
      n: 130,
      title: "T24 watches intune-my-macs — diff by content, rename, include (and Ryy.m is a date)",
      tools: ["T24"],
      builds: [10527, 10528, 10529],
      files: ["js/macbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "medium",
      what: "TWO THINGS, one build. (1) THE RELEASE TAG LEARNS ITS MEANING: Ryy.m is a DATE — 26 the year, the x the month (Mihai's rule, mid-build) — so releases compare YEAR-FIRST (R27.1 after R26.12, which a decimal compare gets exactly wrong); normRel() is the one reader and the bundled catalog's bare-month shorthand flows through it. (2) THE UPSTREAM WATCH, cfdev-gated beside export: microsoft/intune-my-macs is NEVER fetched — the CSP allows Graph and nothing else and does not bend for a read-only repo; the browser downloads the zip (a link is navigation, not a page request) and the tool loads it JSZip-style. Upstream files are Graph-shaped (settings-catalog exports carrying a UTF-8 BOM — found by parsing the real repo, stripped by rule — and compliance policies); MATCHING IS BY CONTENT: settingDefinitionId sets for catalog policies, configured-property sets for compliance — identical = same, ≥50% overlap = a match with its diff shown both directions, else NEW. New/differing rows get a tick and an EDITABLE canonical name (proposal: this month's release stamp + increased version — v1.0 for new, matched identity with minor bumped for differs; the differs proposal keeps the same KEY, so the upgrade reads as the same policy). looksBaseline() gates the dry run — a non-convention name would be invisible to the comparison the whole tool is. Creates ride Restore.existingNames/plan/apply unchanged; the curation table renders into its own host so ticks and edited names survive re-renders (the restore picker's rule); scripts and mobileconfigs in the zip are counted as seen-not-comparable. 10528 FOLDS IN THE LAYOUT, Mihai's own: the four acts are four TABS — a seg switching Compare · Export · Import · Upstream, one act on screen at a time; off the baseline tenant the seg offers Compare and Import alone (the 10521 rule); Read the tenant stays global above the seg; the upstream host is hidden, never destroyed, on other tabs, so curation survives the switch. 10529 MAKES THE DIFF VALUE-AWARE and adds the changelog: identity matching stays on id sets, but the same id at a DIFFERENT VALUE is now CHANGED (ours → theirs, template references normalised out) — covered had been blessing value drift; every differs row folds open to its per-policy what's-new, and 📝 exports the whole comparison as Markdown; the summary becomes the Compare tab's own au-cards (the 'fix this layout' round).",
      why: "MEDIUM. The writes are the same create-only Restore pipeline item 129 already carries, and the whole section renders only on the baseline tenant — a customer tenant cannot reach it. The genuinely new risk is EDITORIAL, not technical: a careless rename could claim an upstream control as a baseline identity it is not — mitigated by the proposal being a starting point, the convention gate, and the fact that nothing becomes baseline until Mihai re-exports and bundles. The 50% content threshold is stated in the header and pinned in the suite; if real upstream drops produce false matches, the number is one constant.",
      test: [
        "cloudfellows.dev → T24 → the upstream card renders (and must NOT on any other tenant). Get the latest: the link opens GitHub's zip download in a new tab.",
        "Load the real intune-my-macs zip: the summary counts same/differs/new, scripts and mobileconfigs counted as seen-not-comparable, no JSON parse failures (the BOM).",
        "A differs row: the diff names ids in both directions and the matched baseline policy; its proposed name is the MATCHED name with this month's release and the minor version bumped.",
        "A new row: proposed MACOS - DCP - <folder> - D - <name> - R26.9 - v1.0; edit the middle words, tick, dry run — the plan shows the edited name.",
        "Break a name (drop the release tag), dry run: refused, naming the convention — nothing read, nothing written.",
        "Apply: created unassigned in the dev tenant; 🍎 Read the tenant shows them as extra (not yet in the catalog); 🧬 re-export → the file carries them; bundle it and every tenant sees the new baseline lines.",
        "Load a zip that is not the repo (any random zip): 'no comparable policies', not a crash.",
        "January 2027 sanity: a policy renamed to R27.1 must read AHEAD of an R26.12 catalog entry, not behind it.",
      ],
    },
    {
      n: 129,
      title: "T24 🍎 macOS baseline — identify, export, import (R35)",
      tools: ["T24"],
      builds: [10525, 10526],
      files: ["js/macbaseline.js", "js/macbaselineData.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "high",
      what: "New tool, ENCA's Baseline Policies ported Intune-side-out for the macOS baseline — and CORRECTED BY ITS OWN REFERENCE EXPORT within the day (10526): the first cut matched on 'R26.xx' as an ENCA-style per-policy number; the real cloudfellows.dev export collapsed 83 policies onto two numbers, because R26.x is the BASELINE RELEASE worn by every policy. IDENTITY IS NOW THE NAME — MACOS prefix + release tag + trailing version, keyed with the release and version stripped and separators normalised (the reference tenant's own 'DCP-'/'DCP -' drift keys identically); releases compare BEFORE versions, versions break the tie (cmpVersion verbatim); the number-clash bucket left with the number identity. Buckets: ok/outdated/ahead/unversioned/missing/extra, cards + a line-by-line table, ×n on a duplicated identity. THE CATALOG IS BUNDLED (10526): js/macbaselineData.js, the reference export verbatim minus one recorded departure — the tenant carries one compliance policy twice at identical release+version; the catalog holds it once and the tenant's copy shows as ×2. 82 policies: 41 settings catalog, 7 device configurations, 3 compliance, 4 assignment filters, 27 shell scripts. IMPORT HAS THREE ROADS: restore's pipeline for the three areas, T14's OWN Filters.create for assignment filters (fresh Filters.list collision check, read-back), and scripts REFUSED with restore's rule — no body in the reference read, nothing to put back. THE CATALOG: authored on cloudfellows.dev only (the cfdev convention — TunoTenant.isCfdev gates the EXPORT section, said on screen); the export writes one JSON (kind tuno-macos-baseline) with names, numbers, versions AND raw bodies — settings-catalog settings and ADMX definitionValues normalised out of the detail read (__detail) into T04-restore's body shape — and flags duplicate numbers before Mihai bundles it as js/macbaselineData.js (BASELINE_MACOS; absent this build, and the screen says what that means). IMPORT: Restore.existingNames/plan/apply UNCHANGED — collision stop, fresh per-create name check, read-back verify, ADMX child rollback — with one departure said everywhere: CANONICAL names, no [Restored] prefix, because the name is the identity and a prefixed baseline reads as missing forever. Unassigned by construction. Reads ride the shared cache (warm start + source line); dry run needs only the read scope, the write scope is asked at the Apply click. Registered: tile (Configuration group), screen, tabs, history, sidebar, T24, R35 card in the beta era.",
      why: "HIGH, for the same reason T22 was: this tool WRITES — it creates policies in customer tenants from a file. The containment is inherited rather than invented: the entire write path is T04-restore's shipped pipeline (the suite-covered plan/apply with its collision stops and read-backs), the bodies come from the same normalisation restore consumes, and create-only means the worst outcome is a duplicate-named policy the collision stop exists to prevent. Two soft edges named now: ADMX presentation binds in the cache's detail read may lack the presentation expansion the backup zip carries, so an ADMX baseline policy's import can fail per-policy (reported honestly, rolled back by restore's own rule) — if the macOS baseline ever carries ADMX (unlikely for macOS), revisit; and the catalog ships EMPTY this build — the tool says so and the reference export from cloudfellows.dev is the next act, Mihai's.",
      test: [
        "cloudfellows.dev: Read the tenant → the export section renders (it must NOT render on any other tenant, demo included). Export: the file carries every MACOS R26.xx policy with num, name, version and a body whose settings/definitionValues are populated for catalog/ADMX policies.",
        "Name the same R26.xx number on two policies and export: the export note flags the duplicate number — fix the tenant, not the file.",
        "A customer tenant, catalog loaded from that file: every bucket is exercised — rename a version down (outdated), up (ahead), delete one (missing), strip a version (unversioned), create a MACOS R26.99 the file lacks (extra), rename a matched policy's middle words entirely (number clash).",
        "Import dry run on a tenant missing three: 3 to create, the present ones say skip; Apply asks for the write scope AT THE CLICK, creates them with EXACT canonical names, and the result says unassigned.",
        "Re-run the compare after the import: the three read as up to date — the created names round-trip through the identity.",
        "Import the same file twice: the second dry run is all skips — create-only held.",
        "A tenant where a surface 403s: the missing rows say they are floors, not verdicts.",
        "The warm start: open the tool after sign-in on a consented tenant — the compare is there from the shared read, source line shown.",
        "T11 after an import: the created policies appear (the import invalidated the shared cache).",
      ],
    },
    {
      n: 128,
      title: "The platform-filter survey — T14, T13, T12 and the restore picker join",
      tools: ["T14", "T13", "T12", "T04"],
      builds: [10524],
      files: ["js/filters.js", "js/compliance.js", "js/conflict.js", "js/restore.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "low",
      what: "Mihai's instruction: go tool by tool and add the 10522 platform filter wherever a list can honestly carry one. FOUR JOIN, each on its own platform truth rather than a forced common one: T14 filters on the assignment filter's OWN platform property (declared at creation, fixed for life — no derivation); T13's policy list uses platformOfPolicyType, the vocabulary its coverage section already speaks, and the header reads 'n of N' while narrowed — the estate cards, coverage and stale table keep counting the whole tenant; T12's conflicts wear the platforms of the policies IN them (the documenter's strings, on every compared policy since birth) and the verdict cards keep counting the whole scan; T04's RESTORE PICKER reads the archived raw objects through Docs.platformsOf and — the one mechanical departure — toggles row VISIBILITY instead of re-rendering, because the ticks and edited names in that table are DOM state a re-render would silently drop; a hidden ticked row still restores and the control's title says so; an area with every object hidden folds its header away. All selects follow the 10522 rules: static-control-options-rebuilt, present-platforms-only, counts over the whole collection. THE NO-LIST IS THE OTHER HALF: T10 already had one; T15 and T18 are Windows by construction (the Defender read literally filters operatingSystem eq 'Windows'); T03's audit events, T02/T06/T08/T09's per-object questions, T17's approvals and T21's score carry no platform identity; T16/T20 are single-discipline endpoint blades with their own rails. Recorded here so absence reads as a decision.",
      why: "LOW. Presentation-side filtering in all four; no read, no write, no scope. The two edges worth eyes: the restore picker's hidden-ticked-row semantics (a deliberate trade, stated on the control — the alternative, unticking on hide, would CHANGE a restore selection as a side effect of browsing); and T12's multi-platform conflicts (a Windows+macOS conflict appears under both platforms, which is what wearing both means).",
      test: [
        "T14 → a tenant with Windows and macOS filters: the select offers exactly those with counts; picking one narrows cards AND list faces; the search still composes.",
        "T13 → Platform: Windows — only Windows compliance policies fold; the header reads 'n of N'; the estate cards and coverage rows do not move.",
        "T12 → a scan with conflicts on two platforms: picking one narrows the folds; the verdict cards keep the whole scan's numbers; open folds stay open across the change.",
        "T04 → load an archive with mixed platforms → tick a Windows profile, edit its target name → filter to macOS: the row hides; back to All — the tick AND the edited name are exactly as left.",
        "T04 → filter to macOS, run the dry run: the hidden ticked Windows profile IS in the plan (the control's title says a hidden ticked row still restores).",
        "T04 → an archive of only scripts and filters: everything files under Not platform-specific; an area emptied by the filter loses its header row too.",
        "One-platform tenants: T13's and T12's selects do not render at all — a filter with one answer is furniture.",
        "Demo mode: the demo tenant's mixed platforms exercise T13's and T12's selects.",
      ],
    },
    {
      n: 127,
      title: "The shared read reaches every tool it can honestly serve — T05 and T12 join",
      tools: ["T05", "T12", "TUNO"],
      builds: [10523],
      files: ["js/document.js", "js/conflict.js", "js/policycache.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "medium",
      what: "The 10520 warm start, extended to the two remaining tools whose data the cache genuinely holds. THE SURVEY CAME FIRST and its no-list matters as much: T20 and T16 read intents, templates and device inventories beside the catalog and would need a gestureless consent to auto-run (their extra scopes are not in the silent union) — they stay cold; T15/T17/T18/T21/T03/T13's statuses, T06/T02/T08/T09's per-object questions and T10's definitions are reads the cache does not hold; T14's list read carries payloads the cache's filter read deliberately lacks. A half-warm answer would have to lie about its other half, so those tools keep their click-time reads, and the changelog says so in one sentence. WHAT SHIPPED: T05's browse face adopts the cache on open (landRes — one landing for both fetch paths), with the source line above the list; T12 adopts and RUNS on open, because detection is local arithmetic over the collection — a warm open costs zero reads — taking its three surfaces of the whole collection with resolver, filter names and counts by reference. AND THE EXPORTS STOP LAUNDERING: PolicyCache stamps res.readAt/fromWarm; Docs.meta gains `read` and all three document renderers print 'tenant read …' beside 'generated' whenever the moments differ; T12's Markdown does the same. T19's single-policy Documentation download inherits the stamp for free.",
      why: "MEDIUM, one notch above 10522, for one reason: DOCUMENTS. The documenter's exports are deliverables people file, and this build lets one be cut from a read minutes old — the mitigation is the 'tenant read' stamp in every header (screen, Markdown, HTML, Word) plus the source line on the screen, and Read the tenant one click away. The T12 half is lower: a scan over cached data with the source said is strictly more honest than the same scan run twice. The survey's exclusions are deliberate and recorded so 'why is my Defender status not instant' has a written answer.",
      test: [
        "Sign in consented, open T05 without clicking: the browse face is there, everything selected, the source line names the sign-in read.",
        "Export Markdown, HTML and Word from that warm face: every header carries BOTH stamps — generated now, tenant read earlier. Then Read the tenant and export again: the 'tenant read' clause disappears (the moments coincide).",
        "Open T12 without clicking: cards, strip and folds are there; the line above the cards names the read; the Markdown export carries the same stamp.",
        "T12 warm open then ⚔️ Scan the tenant: a fresh read runs, the source line disappears.",
        "T11 apply → open T05 and T12: neither shows pre-apply data (the invalidation reaches all four warm tools).",
        "Unconsented tenant: all four tools open exactly as before — intro and button, no read, no prompt.",
        "T19 popout → 📄 Documentation from a warm session: the downloaded file names the tenant-read time.",
        "Demo mode: all four tools open warm from the demo prefetch.",
      ],
    },
    {
      n: 126,
      title: "The platform filter — T05's select, in T11 and T19",
      tools: ["T11", "T19", "T05"],
      builds: [10522],
      files: ["js/assignedit.js", "js/overview.js", "js/document.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "low",
      what: "T05's platform filter, ported to the two other policy lists. ONE NORMALISER: the platforms a policy declares come from Docs.platformsOf — T11 derives them from the RAW object (both its list paths now carry raw; memoised per row), T19 from the mapped item it already had — so the three tools cannot disagree about the same policy. And the normaliser itself got one claim righter: ADMX joins autopilot as Windows-by-definition ('not platform-specific' was the normaliser's gap, not the policy's claim — found when the new filter counted one Windows policy in a two-policy fixture), which files administrative templates under Windows in T05's filter too. The select is a static control whose OPTIONS are rebuilt with counts over the whole collection (the T15 rule: never re-rendered out from under a click); 'Not platform-specific' means the policy declares none (T05's words), and a platform the tenant has none of is not offered. In T19 the platform joins surface and search AHEAD of the verdict chips, so the chips keep answering 'of what you are looking at'. In T11 it narrows the LIST only — the tick-set lives outside the DOM (10390), so the selection survives the platform filter exactly as it survives the text filter, and the rail counts stay whole-tenant.",
      why: "LOW. Presentation-side filtering over data both tools already hold; no read path, no write path, no scope touched. The one behaviour worth watching: T11's counts are computed lazily from raw objects, so a policy arriving through a future third list path without raw would count as declaring no platform — platsOf falls back to empty rather than throwing, and the suite pins the two real paths.",
      test: [
        "T11 → warm or fresh list → Platform: Windows — only Windows policies remain; the option label's count matches the rows shown with no other filter set.",
        "Tick two Windows policies, filter to macOS: the rows disappear, the '2 selected' line and the rail's ✓ counts survive; back to All platforms — the ticks are still there.",
        "Not platform-specific: settings-catalog policies with no platforms field and any surface's platform-neutral objects appear; nothing that declares a platform does.",
        "The text filter and the platform filter compose — 'baseline' + Windows shows only Windows policies named baseline.",
        "T19 → Platform: Android — the cards narrow, the verdict chips RECOUNT to the narrowed set, and clicking a verdict chip filters within Android.",
        "T19's select offers only platforms the tenant has (plus All and Not platform-specific when non-empty); after Read the tenant the filter resets to All.",
        "The same policy filtered in T05, T11 and T19: appears under the same platform in all three — the one-normaliser claim, checked by eye once.",
        "Demo mode: the demo tenant's mixed platforms exercise every option.",
      ],
    },
    {
      n: 125,
      title: "T19's popout offers the policy's acts — ENCA's pcard-actions, ported",
      tools: ["T19", "T11"],
      builds: [10521],
      files: ["js/overview.js", "js/assignedit.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "low",
      what: "ENCA's policy detail ends in a pcard-actions row — the acts you would take on the policy you are looking at. Ported into T19's popout FOOT (the foot is each tool's own claim, the popoutHtml rule) and narrowed to the acts TUNO has: ✏️ ASSIGNMENT EDITOR closes the popout and opens T11 with the policy selected — AssignEditTool.openWith(secId, id), new, through the tile's own handler (the 10398 click-through rule); a handoff into a cold list waits for the list via pendingSelect, consumed by whichever of the warm start or the fresh read builds it first; canEdit(secId) is the one home of the section→surface mapping and the button renders ONLY for T11's four surfaces — an act that would be refused is not offered. 📄 DOCUMENTATION downloads the single-policy Markdown via the same Docs.markdown call T05's popout copies (one implementation, sections=[{...sec,items:[it]}], single:true). 🗄 BACKUP downloads the raw Graph object the shared cache keeps (keepRaw), wrapped in a meta header that names the build, endpoint, tenant and time — and says IN THE FILE that it is a record, not a restore file. NOT PORTED, on purpose: What-if flow (T08's job, by group) and Policy state (a write; T19 is a read-only screen).",
      why: "LOW. T19's half is presentation plus two downloads computed from data already on screen; no new read, no write reachable. T11's half is selection plumbing — openWith touches sel and the pending consume sites, and the suite drives handoff into a warm list, a cold list and a vanished policy. The one soft edge: the 🗄 file could be MISTAKEN for a restorable backup despite its name and note — the wording is the mitigation, and if that proves too subtle the fix is renaming the button, not removing the record.",
      test: [
        "T19 → open a settings-catalog policy → ✏️ Assignment editor: T11 opens (crumb, tab, sidebar all follow), the policy is ticked, the list has scrolled to it, the selection bar shows 1 selected.",
        "The same from a policy on a surface T11 does NOT edit (an endpoint security intent): the ✏️ button is absent from the foot.",
        "✏️ with a COLD T11 list (sign in unconsented, read only in T19): T11 opens on its intro; after Read the policies the policy is ticked — the handoff waited for the list.",
        "📄 Documentation: the .md downloads and its content matches T05's popout ⧉ Copy as Markdown for the same policy, byte for byte.",
        "🗄 Backup: the .json downloads; it carries the tuno meta block (kind single-policy-record, the endpoint, the tenant, the note) and the raw policy with its assignments as Graph returned them.",
        "A policy in T19's list whose surface failed half-way (no raw in the cache — should not happen since 10520, but the guard exists): the 🗄 button is absent rather than downloading nothing.",
        "Close, Escape and backdrop still close the popout; the action row does not break T05's or T11's own popout feet (theirs are unchanged).",
        "Demo mode: all three acts from a demo policy — the handoff ticks, the two files download with demo content.",
      ],
    },
    {
      n: 124,
      title: "The sign-in prefetch and the shared policy cache — tools open warm",
      tools: ["TUNO", "T19", "T11", "T05"],
      builds: [10520],
      files: ["js/policycache.js", "js/overview.js", "js/assignedit.js", "js/document.js", "js/graph.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "medium",
      what: "NEW FILE js/policycache.js: a holder and deduper around Docs.collect() — it adds no reading of its own (the T12 rule). At sign-in (real and demo) app.js fires PolicyCache.warm(), which reads the tenant ONLY when Graph.silentScopes says the consent already exists — silentScopes is new in graph.js: acquireTokenSilent, never interaction, false means 'not consented yet' and is not an error. T19 registers a screen hook (window.TunoScreenHooks, invoked by app.js show()) and opening it adopts the cache — or joins a prefetch still running, progress card and all; its Read the tenant becomes a fresh read THROUGH the cache, so a click in T19 warms T11. T11 adopts the cache for its list (collect() gains keepRaw so the raw assignment targets survive for the write pipeline), keeps Read the policies as its own fresh read, and invalidates the cache after an apply. Staleness is said everywhere: both tools print which read the data came from and when. Sign-out clears the cache; a generation counter stops a read that started before an invalidation from repopulating it with pre-write data.",
      why: "MEDIUM, for two reasons. (1) The sign-in path gains a background read — fire-and-forget, failure is a cold start, but it runs where nothing ran before, on every consented tenant. (2) Tools now render tenant data that may be minutes old, which is why every warm surface names its read time and keeps a one-click fresh read, and why the write tool treats the cache as a list to look at, never a list to write from: plans want Read the policies first, and the per-policy drift check re-reads at the moment of writing regardless. The consent rule is deliberately untouched — silent-only was the choice, over asking at sign-in — so the feature is invisible to a tenant that never consented. T05's own document flow is deliberately NOT cache-served: a document is a deliverable and should be cut from a read the person just watched happen; its collect() only carries keepRaw for the others.",
      test: [
        "A consented tenant: sign in, wait a moment, open T19 WITHOUT clicking anything — the tenant is there, and the notes line says 'From the sign-in read at HH:MM'.",
        "Open T11 next: the list is there with the same read named above it; tick boxes, surfaces and search all work on the warm list.",
        "A FIRST-TIME tenant (or a fresh browser profile): sign in — NO consent prompt beyond sign-in itself appears. T19 shows its Read button; clicking it asks for the read scopes as always. Then open T11: warm, from T19's click.",
        "Open T19 while the sign-in read is still running: the progress card appears mid-read and the screen fills when it lands — one read, not two (watch the network).",
        "T19 → Read the tenant on a warm screen: a fresh read runs and the 'From the …' line disappears — the data is now this click's.",
        "T11 → apply an assignment change → open T19: it does NOT show the pre-apply assignments from the cache (the apply invalidated it; T19 offers its Read button or re-reads).",
        "Sign out, sign in as a DIFFERENT tenant: nothing from the first tenant appears anywhere before the new tenant's own read.",
        "Demo mode: sign into the demo — tools open warm from the demo prefetch, which is the feature's showcase.",
        "A tenant where one of T11's four surfaces 403s in the shared read: T11's warm list names that surface as unreadable (not listed, not editable), same as its own read would.",
      ],
    },
    {
      n: 123,
      title: "T11's policy names open the documenter's popout",
      tools: ["T11", "T05"],
      builds: [10519],
      files: ["js/assignedit.js", "js/document.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
      risk: "low",
      what: "A policy name in T11's list opens the policy — Docs.popoutHtml, the one template T05, T19 and T20 already share, in T11's own modal (T19's shell, Close foot). The name wears .pname, the existing hover affordance; the tick box beside it stays the selection, and the two cannot collide because the checkbox is its own cell. THE READ IS Docs.collect() NARROWED TO ONE POLICY: collect() takes `only` (an id) and filters the section's items right after the list read, so the detail N+1, the group naming, the member counts and the filter naming all run for exactly one policy — the alternative was a second single-policy mapper, the T12 drift. T11's four surfaces map to four of T05's thirteen sections by lookup. Directory read is ensured at the click (T19's union) for the group names. Popouts are cached per policy for the session's read and the cache clears on a fresh read, because a popout served from before the last read would show assignments the apply step just changed. A policy deleted between the list read and the click is an error card naming the possibility, not an empty popout.",
      why: "LOW. Reads only — the popout path cannot reach a write; the one shared-code change is an additive option in collect() that no existing caller passes, and the suite drives collect() with and without it. The modal is new DOM in T11's own screen, wired the way T19's is (backdrop, Escape, Close). What real eyes should check: the popout over a long list scrolls correctly, and the settings-catalog detail read on a click feels fast enough on a real tenant.",
      test: [
        "T11 → Read the policies → click a settings-catalog policy NAME: the documenter's popout opens with the full settings table, redacted values italic; open the SAME policy in T05 — identical head and body.",
        "Click the name again after closing: no second read (watch the network) — the popout is cached until the next Read the policies.",
        "Tick the checkbox beside a name: the selection changes and NO popout opens; click the name: the popout opens and the tick does not change.",
        "An ADMX policy and a compliance policy: rows render (definition values / compliance settings), platform and type in the head are the documenter's own words.",
        "A policy with a filtered assignment: the chip names the filter and its mode, exactly as T05 prints it.",
        "Apply an assignment change to a policy, then Read the policies and open that policy: the popout shows the NEW assignments (the cache cleared with the read).",
        "Escape, backdrop and Close all close it; clicking inside does not.",
        "Demo mode: open a policy from each of the four surfaces — the demo tenant answers collect() like every other tool.",
      ],
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

