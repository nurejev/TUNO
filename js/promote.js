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
  // Verified against `git show main:js/version.js` — main is at build 13.
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
  // Items 123-131 (beta 10519-10533) went as build 13 — the third
  // full-queue promotion, ordered by the exported file. Two tools reached
  // production (T24 macOS baseline, T25 device cleanup), the sign-in
  // prefetch went app-wide, and the registration gained its first
  // directory-device write scope (Device.ReadWrite.All, item 131).
  //
  // The queue emptied at 10534 and REFILLED the same day: items 132-135
  // are the T16 member counts, the T15 MDE baseline, the new T26, and the
  // layout round — the fourth promotion-in-waiting. (This paragraph said
  // "THE QUEUE IS EMPTY" until 10551, thirteen builds after it stopped
  // being true — the ledger is hand-maintained and this line is its rot.)
  productionBuild: "v1.0.13",

  items: [
    {
      n: 141, title: "\ud83e\uddf9 T25 re-enables \u2014 the way back for the disable step, buckets following the read-backs",
      tools: ["T25 Entra device cleanup"], builds: [10565], risk: "low",
      why: "Production's cleanup can disable and delete but not undo a disable; the way back was the portal (Mihai, 2026-09-02: 'should have an option to enable disabled devices'). Missing capability, nothing broken; the write is the same PATCH the disable step already makes, with the value flipped, behind the same fresh read and read-back. It graduates when a live tenant round-trips disable \u2192 re-enable on a test device with the portal agreeing at each step.",
      test: [
        "Read a tenant with disabled devices: the rail carries \u21a9 Re-enable with the disabled count; the pane lists every disabled device (waiting, delete candidates, and any disabled outside the buckets), longest silence first; the Disabled-waiting card opens it.",
        "Tick one, Re-enable the ticked (test tenant): the Results pane reports 1 re-enabled with 'verified by read-back'; the portal shows the device enabled; the rail's Re-enable count drops by one, \u2461 Delete no longer lists it, \u2460 Disable lists it if it is past the threshold.",
        "Disable a device in \u2460, then open Re-enable without reading again: it is listed there.",
        "Tick a device somebody enabled in the portal meanwhile: it is skipped as 'already enabled', nothing written.",
        "With a signed-in account lacking the directory role: the row reports Graph's refusal as 'who you are, not what TUNO may do'.",
        "The Markdown report carries a Re-enabled section and the re-enable candidate list.",
        "Suite: _to_delete/devicecleanup-tests.js 53/53 (13 new).",
      ],
      files: ["js/devicecleanup.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 140, title: "\ud83e\uddf1 T16 says what each policy configures \u2014 ASR rules with their modes, every setting by name",
      tools: ["T16 Firewall & ASR coverage"], builds: [10559], risk: "low",
      why: "Production's T16 says whether a policy reaches anybody, never what it does when it does; Mihai (2026-09-02): 'this should show which rules are enabled within that policy'. Missing capability, nothing broken, reads only. It graduates when a live tenant's ASR fold matches the portal's rule editor mode for mode, and an AV and a firewall fold show the portal's labels.",
      test: [
        "Open an ASR policy on beta: the fold shows 'ASR rules \u2014 n of 19 set' with every rule a row, modes as Block/Audit/Warn/Off chips, unset rules greyed as 'not set'; compare three rules against the portal's policy editor.",
        "A policy that carries a per-rule exclusion shows it under the rule; ASR-only exclusions show below the table.",
        "Open an AV policy and a firewall policy: every setting is listed by the display name the portal shows, values as option labels (True/False, Enabled/Disabled, the number), children indented.",
        "'\u2699 Read what all N configure' reads the rest and the header then says every policy shown is read; the Markdown export carries a 'What the policies configure' section with one table per policy (ASR policies with the rule table first).",
        "A legacy intent's fold says it has no settings-catalog body; a policy whose settings read fails (revoke the config scope mid-session) says unknown, not empty.",
        "Demo mode: the ASR policy's fold reads 3 of 19 set.",
        "Suite: _to_delete/t16-endpointsec-tests.js 87/87 (20 new).",
      ],
      files: ["js/endpointsec.js", "js/demo.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 139, title: "\ud83d\udd04 T22 joins the rail \u2014 Overview says what is still to do, State says what was done",
      tools: ["T22 Group migration"], builds: [10558], risk: "low",
      why: "Production's Group migration is one long card: chips, table, archived block, with nothing saying that reading is step one of four. Mihai's asks (2026-09-02): the rail layout, the fact chips as filters or places, and 'it should be clear what the tool will still need to do after reading the tenant'. Convenience and clarity, nothing broken. It graduates when the Overview's counts agree with the table's State column across an examine, a refusal and a migration on a test tenant, and the prefix filters split the list exactly.",
      test: [
        "Read a tenant with role-assignable groups: the screen lands on Overview with four steps \u2014 Read marked done with the counts, Examine marked now with '0 of N examined', Plan and apply, Finish by hand \u2014 and the 'worth a look first' line names membership rules, missing destinations and rollbacks where present.",
        "Rail: Groups shows the table with the State column all 'not examined'; Restricted units lists every restricted unit with id and description (or says none yet); Archived shows the cleanup block or 'nothing archived'.",
        "Groups pane on a tenant with a detected prefix: two new chips, 'prefix X-' and 'no X- prefix', whose counts add up to the total; clicking one narrows the table and the count line says which is in force.",
        "Examine a group and close the window: its row reads 'plan ready \u2014 not applied' (or refused/frozen with the reason), the button says Re-examine, the Overview reads '1 of N examined \u00b7 1 plan ready', the rail's Overview node reads '1/N examined'.",
        "Migrate one (test tenant): its row reads 'migrated \u00b7 archived as \u2026' with the button disabled; the Overview's step 3 counts 1 migrated; Read again and every State is back to 'not examined'.",
        "Suite: _to_delete/groupmigrate-tests.js 188/188 (12 new assertions cover the rail, the panes, the prefix filters and the State column).",
      ],
      files: ["js/groupmigrate.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 138, title: "\ud83c\udf4e T24 \u2014 the floating bar carries create as well as dry run",
      tools: ["T24 macOS baseline"], builds: [10556, 10561], risk: "low",
      why: "Production's Upstream pane puts Create N in THIS tenant at the bottom of the plan table, a scroll below the floating bar that ran the dry run (Mihai, 2026-09-02: 'after dry-run has completed, in the same floating bar create/deploy in tenant should appear'). Convenience, nothing broken. It graduates when the bar's create writes exactly the planned set and a changed selection can never fire a stale plan.",
      test: [
        "Load an intune-my-macs zip on beta, tick some rows, Dry run the ticked: the bar changes to 'N ticked \u00b7 M to create' with \u270d Create M in THIS tenant as the primary and \ud83d\udd0d Dry run again beside it; no create button under the plan table, the plan says the create is in the bar.",
        "Untick one row: the create vanishes, the dry run is primary again, the plan shows the stale line. Re-tick that same row: the create is back without a new dry run.",
        "Edit a canonical name by one character: same invalidation; undo it: the plan returns.",
        "Click Create in the bar (test tenant): exactly the planned policies are created unassigned, the result lands under the plan, and the bar is back to the dry run with the ticks still set.",
        "cfdev gate (10561): on cloudfellows.dev open Upstream, sign out, sign into another tenant, open the tool: the rail offers Compare and Import only and the pane shows Compare — no Upstream or Export card. On cloudfellows.dev the Upstream card's heading says 'cloudfellows.dev only'.",
        "Suite: _to_delete/macbaseline-tests.js 110/110 (14 cover the bar states, 4 the cfdev gate).",
      ],
      files: ["js/macbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 137, title: "\ud83e\udd1d T17 counts one thing, nine ways \u2014 the full MAA gate list, one vocabulary across cards, rail and panes",
      tools: ["T17 Multi-admin approval"], builds: [10554], risk: "medium",
      why: "Production's T17 counts four operation types and files a device-wipe policy under a footnote, so a tenant whose only policy gates wipes reads '1 policy, 0/4 gated' with a red unexplained 1/1 on the rail \u2014 the reader concludes the policy is missing (Mihai, 2026-09-02). A wrong-looking report in production, so medium rather than low. It graduates when a live tenant with a device-action policy shows it as a gated row, when the three counts (policies, gated N/9, nobody-can-open) agree with the portal's Access policies list, and when a tenant with a compliance-policy access policy shows the new row gated.",
      test: [
        "On beta against a tenant with ONE access policy of type device wipe and an empty approver group: Overview reads Approval policies 1 (gating 1 of 9 operation types), Gated 1/9 naming Device wipe, Nobody can open 1; the rail reads What is gated 1/9 and Policies 1 \u00b7 \u26a0 1 with a tooltip; the at-a-glance list names the policy and 'gates the wipe action on every device'.",
        "What is gated pane on that tenant: nine rows in the fixed order, Device wipe gated with the policy named in the Policy column, the three action rows saying 'an action, not an inventory', Compliance policies with a count.",
        "A tenant with access policies of type app, script, compliance and role: four rows gated, Gated 4/9, the inventories filled, no 'action gate' wording anywhere on the page or in the MD.",
        "A tenant with no access policies: Overview says never configured, Gated 0/9 in red, no Nobody-can-open card, the What is gated pane is all 'no approval gate'.",
        "Demo mode: three policies (app, script with the empty-group fault, device wipe); Gated 3/9; Policies 3 \u00b7 \u26a0 1.",
        "MD export: 'What is gated \u2014 N of 9 operation types' table with Operation type | Gate | Policy | Inventory; policy table's middle column reads the label and what it gates, not the enum token.",
        "Headless suite (t17-10554-test.js, outside the repo): 38/38 \u2014 screenshot tenant, no policies, unknown future type + unreadable approver group + mixed-case type.",
      ],
      files: ["js/maa.js", "js/demo.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 136, title: "\ud83d\udd10 T01 closes the AaronLocker gaps \u2014 PE sniff by default, the Microsoft floor, publisher LOLBin exceptions, writable FILES, and no empty NotConfigured in the GPO XML",
      tools: ["T01 AppLocker", "T04 Backup/Restore/Verify"], builds: [10553, 10555, 10557, 10560, 10562, 10563, 10564, 10567, 10568], risk: "medium",
      why: "The T01-vs-AaronLocker review (scripts/REVIEW-AaronLocker.md) named three places AaronLocker's defaults were better and one gap neither tool covered. All four are now closed in Invoke-TunoAppLockerScan.ps1 v1.9.0: PE-header sniffing on by default with a never-executable extension list as the guard; Microsoft-signed artifacts keep their product name at Publisher granularity; the LOLBin exceptions ride as publisher conditions resolved on the scanned machine; and every executable file inside an admin-only directory has its own DACL evaluated (writable FILES, new bundle section, new evidence-card table). Separately, the App Control review found the GPO XML export could carry an empty NotConfigured collection \u2014 the exact shape Microsoft documents as a no-boot when merged with Intune's Managed Installer rule \u2014 so exportXml() now drops them and the subtitle says so. Medium risk because the scanner change is unrun on Windows in this session (parse-checked under pwsh 7.4, rule generation unit-tested on Linux) and the default-on file check adds one DACL read per executable file; it graduates when a real scan on a reference image confirms timing and the bundle shape.",
      test: [
        "Run Invoke-TunoAppLockerScan.ps1 v1.9.1 on WINDOWS POWERSHELL 5.1, unelevated, on a machine with no user-writable executable files: it gets past the writable-directory walk (v1.9.0 died there with 'Argument types do not match' at the empty writable-files list) and completes; a run on PowerShell 7 completes too.",
        "Break something on purpose (e.g. point -Path at a file instead of a directory, or throw from a function): the scanner prints [fail] with the message and a script stack naming the line, then stops.",
        "Scan with v1.10.0 (defaults) and upload the bundle: the Microsoft app coverage card shows OneDrive (per-user), classic Teams and the Defender platform ALLOWED via the three 'TUNO coverage:' rules, no Add allow rule buttons, no 'predates' notice; the Rules card lists the three under Exe; the Defender path rule sits at Info, not Medium. Scan with -NoMicrosoftCoverage: the three are red again and the scan card says the switch was used.",
        "Upload a v1.9.x bundle: the scan card says the bundle predates the coverage rules and names the script version. Click the three fixes, then upload any bundle again: the scan card says 3 edits were discarded and why, and the three rows are red again.",
        "The enforce gates (10568): with the audit profile found and no bundle, the checklist reads ✓ / ✗ / ✗ and '1 of 3', gate 2 saying an XML is not evidence; upload a clean bundle: ✓ ✓ ✓, '3 of 3', the counts on gate 3, the button, and the hand-over sentence about removing the audit assignment. Type ENFORCE with the gates unmet: the profile is created (Enforced, same grouping, unassigned) and the portal shows its description ending 'created past the evidence gates on the operator's decision'.",
        "Enforce after a deployed audit (10567): with the audit profile already in the tenant under the grouping on screen and nothing created this session, Check against the tenant unlocks the enforce step's first gate — the lock line names the profile and asks for the scan bundle; with an Enforced profile under that grouping instead, it stays locked on the audit profile.",
        "Encrypted values (10563/10564): on a tenant whose custom profiles were saved after Intune began encrypting OMA-URI values, Compare and the events card's pull-from-the-tenant read the rules (one single-profile re-read, then one getOmaSettingPlainTextValue call per collection) instead of 'no readable RuleCollection values'; with the config scope unconsented the message names Graph's refusal AND offers the three other roads plus an upload.",
        "Compare with a file (10564): on the refusal, upload a Get-AppLockerPolicy -Effective -Xml export: the diff card renders and says the deployed side came from a file; upload a scan bundle from a device that has the profile: same, named as the device's effective policy; upload a bundle whose device had no effective policy: refused with the reason.",
        "T04 Backup (10564): back up Device configuration profiles on that tenant: every custom OMA-URI profile's JSON carries the plain-text values, no secretReferenceValueId; revoke the scope and back up again: the custom profiles are listed under 'could not be read' with Graph's reason, never written empty.",
        "Three deployed AppLocker profiles under three groupings (10562): Check against the tenant lists all three under 'different grouping'; Adopt identity on one: it moves to its own 'matches the deployed profile' line with Compare and Update in place, the other two stay listed below; Compare on it renders the card.",
        "Compare (10560): with an AppLocker profile deployed, run 🔎 Check against the tenant, press ⇄ Compare beside it. With the draft equal to what was deployed the card says 'No differences'; add one allow rule and re-run: the card lists exactly one '+ added' rule and 'everything not listed is identical'; rename a rule: it lists one 'renamed'; change a rule's path: one '~ changed' with was/now; switch the draft to Enforce and compare against the AuditOnly profile: no mode change is reported (the compare uses the deployed profile's own mode). Export the portal's copy of the policy and import it as the draft: 'No differences' despite re-minted Ids. Differences as Markdown downloads the same list.",
        "Click Add allow rule for the Defender platform on any bundle: the rule added is a PATH rule on %OSDRIVE%\\ProgramData\\Microsoft\\Windows Defender\\Platform\\*, not a publisher rule on the OS product.",
        "Run Invoke-TunoAppLockerScan.ps1 v1.9.1 elevated on a reference image: it completes, prints the LOLBin line (N publisher condition(s), M kept as path) and the writable-files line per root, and the bundle carries exceptions.lolBinCarriage, writableFiles and writableFilesChecked:true.",
        "In the generated Audit XML the Windows-folder Exe rule's Exceptions hold FilePublisherCondition elements for MSHTA.EXE, WMIC.EXE, INSTALLUTIL.EXE (any version) and only path conditions for patterns absent on that machine; the Dll and Script Windows rules carry only the writable-directory path exceptions.",
        "Rename a copy of an .exe to .dat inside a scanned writable directory and rescan: it is inventoried with sniffedPe:true and T01's evidence card counts it as found by header; -NoPeSniff makes it disappear.",
        "Grant Users Modify on one .exe inside Program Files and rescan: the file appears in writableFiles with the grantee, the Audit XML excepts it by exact %PROGRAMFILES% path (no trailing \\*), and a publisher or hash rule for it exists; T01's card lists it with its reachability and the MD carries the table. Timing of the whole scan with and without -SkipWritableFiles is noted in the promotion message.",
        "-PublisherRuleGranularity Publisher with a Microsoft-signed artifact in a writable directory: the rule carries the product name and the description says why; a non-Microsoft artifact gets a bare publisher rule as before.",
        "Load the sample policy: the XML panel shows three collections and the subtitle says 1 empty NotConfigured collection was left out; upload an XML whose NotConfigured collection carries rules and it is exported unchanged (that is an audit finding, not a rewrite). Intune profile JSON unchanged.",
        "Upload a pre-10553 bundle: the card says writable files were not checked (never 0) and everything else renders as before.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "js/applocker.js", "js/graph.js", "js/backup.js", "js/msappcatalog.js", "css/app.css", "index.html", "scripts/README.md", "scripts/REVIEW-AaronLocker.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 135, title: "\ud83d\uddfa The layout round \u2014 Option A: the rail everywhere a long tool benefits",
      tools: ["T26 Compliance evidence", "T13 Compliance report", "T17 Multi-admin approval", "T08 Assignment what-if", "T16 Firewall & ASR coverage", "T12 Setting conflict scan", "T09 Assignment health", "T18 Windows LAPS audit", "T14 Assignment filters", "T22 Group migration", "T23 Restricted AUs", "T02 Group Analyzer", "T06 Device analyzer", "T15 Defender status", "T04 Backup/Restore/Verify", "T01 AppLocker", "T03 Change audit", "T25 Entra device cleanup", "T07 Intune RBAC", "T24 macOS baseline"], builds: [10538, 10539, 10540, 10541, 10542, 10543, 10544, 10545, 10546, 10547, 10548, 10549, 10550, 10551, 10552], risk: "low",
      why: "One decision, taken once on the mockup (2026-09-01): tools that stack many result sections adopt the posture tool's sticky left rail (shared ep-rail chrome) so jumping to a section or back to a filter is a click, not a scroll; the lighter tools get the T19 fixes \u2014 static filter bars and popouts instead of inline expansions. Ships tool by tool on beta; promotes as ONE item because half a layout language in production is worse than none. Graduates when the converted tools read naturally on a live tenant and nothing lost a capability in the move.",
      test: [
        "Per converted tool on beta: the rail is sticky beside the pane, every section that used to render stacked is reachable as a node with a truthful count, and the pane swaps without losing filter state.",
        "Narrow window: the rail collapses to the wrapping strip (the shared CSS's own breakpoint) and nothing overflows.",
        "Every tool's own suite stays green after its conversion \u2014 the pass counts are in the build messages.",
        "Exports are unchanged by the layout \u2014 the MD/CSV of a converted tool matches its pre-conversion content for the same tenant.",
      ],
      files: ["js/complianceevidence.js", "js/compliance.js", "js/maa.js", "js/whatif.js", "js/endpointsec.js", "js/conflict.js", "js/health.js", "js/laps.js", "css/app.css", "js/groupmigrate.js", "js/restrictedau.js", "js/groupuse.js", "js/devicewhy.js", "js/defender.js", "js/backup.js", "js/applocker.js", "js/audit.js", "js/devicecleanup.js", "js/roles.js", "js/app.js", "js/macbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 134, title: "\ud83d\udccb T26 Compliance evidence \u2014 capability evidence laid against ISO 27001, NIST 800-53 and NIST CSF",
      tools: ["T26 Compliance evidence"], builds: [10537], risk: "medium",
      why: "Production has no auditor-facing evidence view; the documenter documents and T20 checks Windows posture, but nothing lays tenant policy against framework controls. Missing capability, nothing broken. It graduates when a live tenant's evidence rows match the portal's policy values, when the reaches-nobody and not-managed-here verdicts hold up, and when an auditor-shaped reader agrees the disclaimer and original summaries carry the right weight.",
      test: [
        "On beta against a live tenant, run \ud83d\udccb Read the tenant (or open with a warm cache \u2014 the source line must name the read): capabilities land with evidence rows; spot-check three against the portal (BitLocker, firewall, a compliance policy's password rule).",
        "Unassign one evidencing policy (test tenant): the capability flips to configured-but-reaches-nobody, and every control it fed drops from evidence to partial or none.",
        "A tenant with no macOS policies: macOS capabilities read not-managed-here and NO ISO/NIST control is dragged to partial by them.",
        "Evidence sourced from a compliance policy carries the marks-not-enforces caveat on the row and in the MD.",
        "Exports: the MD leads with the disclaimer and repeats it at the foot; the CSV carries one row per evidence hit including reaches and the compliance-policy caveat; no percentage or score appears anywhere.",
        "Framework summaries: verify three control texts are original sentences, not the standards' own text.",
      ],
      files: ["js/complianceevidence.js", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 133, title: "\ud83e\uddf1 T15 matches the MDE-Active baseline \u2014 policy intent and device truth, no single score",
      tools: ["T15 Defender status"], builds: [10536], risk: "medium",
      why: "Production's Defender report says which machines are unprotected but not whether the tenant matches the baseline Mihai actually deploys (MDE-Active, his own Get-DefenderSettings.ps1). Missing capability, nothing broken. It graduates when a live tenant's match agrees with the script run on a member device \u2014 same deviations, same not-configured \u2014 and when the reaches-nobody and conflict verdicts hold up against the portal.",
      test: [
        "On beta against a tenant with the MDE-Active AV/ASR policies assigned, run \ud83e\uddf1 MDE baseline: the 19 ASR rows and 13 setting rows land with verdicts; spot-check three against the portal's policy editor.",
        "Run Get-DefenderSettings.ps1 -CompareBaseline on a member device of that tenant and compare: every deviation the script reports on settings TUNO maps must appear as deviate/conflict/not-configured in the policy layer or as a device-layer deviation.",
        "Unassign the AV policy (test tenant): its settings flip to reaches-nobody, never compliant.",
        "Create a second reaching AV policy with network protection at audit: the check reads conflict and points at T12's territory.",
        "A tenant where the config read is not consented: the \ud83e\uddf1 click asks for it at the click; declining leaves the fleet report intact.",
        "The MD export carries the baseline section only after a match ran; a fresh \ud83e\udda0 fleet read clears the match.",
      ],
      files: ["js/defender.js", "js/backup.js", "js/applocker.js", "js/audit.js", "js/devicecleanup.js", "js/roles.js", "js/app.js", "js/macbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 132, title: "\ud83d\udee1 T16 says on how many devices \u2014 group member counts on every covering policy",
      tools: ["T16 Firewall & ASR coverage"], builds: [10535], risk: "low",
      why: "Production's coverage rows say assigned or tenant-wide but never how many machines that is \u2014 Mihai read the ASR row off the live screen and asked for the number. Nothing is broken; the number is missing. It graduates when the counts on a live tenant match what the portal says the groups hold, and when every limit (overlap, exclusion, filter, unreadable count) is printed where the number is.",
      test: [
        "On beta against a live tenant, run T16 and open a group-assigned covering policy: the row chip says \u2248N members, the fold's Configured on line repeats it with the membership caveat, and each include group chip carries its own count \u2014 compare one group's number against the portal's member view.",
        "Find (or make) a policy assigned to two overlapping groups: the sum states \u2018overlaps not deduplicated\u2019 rather than pretending to dedupe.",
        "A tenant-wide (all devices) policy says all devices \u2014 N Windows enrolled, matching the denominator card; an all-users policy refuses a device number and says their devices follow them.",
        "Sign in as an admin who can read policy but not group membership (or revoke Group.Read.All in a test tenant): counts read \u2018unreadable \u2014 unknown, not zero\u2019 and sums become floors; nothing renders as 0.",
        "Exports: the Markdown table's Configured on column and the CSV's configuredOn field carry the same phrases as the screen for the same policies.",
      ],
      files: ["js/endpointsec.js", "js/conflict.js", "js/health.js", "js/laps.js", "css/app.css", "js/groupmigrate.js", "js/restrictedau.js", "js/groupuse.js", "js/devicewhy.js", "js/defender.js", "js/backup.js", "js/applocker.js", "js/audit.js", "js/devicecleanup.js", "js/roles.js", "js/app.js", "js/macbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
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
// ======================================================================
// TILE CHIPS FROM THE QUEUE (build 10551, Mihai's ask: "tuno is not
// tagging the updated tools"). The 10534 promotion stripped the tile
// chips because the queue was empty — and thirteen builds later nothing
// had put UPDATED back on the tools those builds changed, because
// hand-stamped chips rot the moment anyone forgets one.
//
// So the chips DERIVE from the queue: what is on this channel and not in
// production IS PROMOTE.items, and every build already updates its item
// (the house rule this file's header enforces). A tool named in any open
// item wears UPDATED — or NEW while its version is still 0.x, the
// channel rule — and when a promotion empties the queue the chips vanish
// by themselves, which is exactly what the 10534 strip did by hand.
//
// Beta only: production's NEW/UPDATED are stamped statically by
// promotion step 5 and stay as cut. The REORDER (new/updated tiles lead
// their section) runs on both channels, over whatever chips exist.
// ======================================================================
PROMOTE.tileFlags = function (toolVersions) {
  const flags = {};   // tile id -> "new" | "upd"
  for (const it of PROMOTE.items || []) {
    for (const t of it.tools || []) {
      const m = /^T(\d+)\b/.exec(String(t));
      if (!m) continue;
      const n = Number(m[1]);
      const key = Object.keys(toolVersions || {}).find((k) => toolVersions[k] && toolVersions[k].t === n);
      if (!key) continue;
      // 0.x = beta-only = NEW to whoever promotes next; anything else is a
      // production tool that moved — UPDATED. NEW wins if both would apply.
      const isNew = /^0\./.test(String(toolVersions[key].v || ""));
      if (flags[key] !== "new") flags[key] = isNew ? "new" : "upd";
    }
  }
  return flags;
};

PROMOTE.applyTileFlags = function (doc, toolVersions, opts) {
  const o = opts || {};
  if (o.beta) {
    const flags = PROMOTE.tileFlags(toolVersions);
    for (const [id, kind] of Object.entries(flags)) {
      const tile = doc.getElementById(id);
      const h = tile && tile.querySelector("h3");
      if (!h) continue;
      // a tile already wearing a status chip (a birth NEW/BETA, say) keeps
      // it — the stamp fills the gap, it never doubles up
      if (h.querySelector(".tag.upd") || h.querySelector(".tag.new")) continue;
      const chip = doc.createElement("span");
      chip.className = kind === "new" ? "tag new" : "tag upd";
      chip.textContent = kind === "new" ? "NEW" : "UPDATED";
      const block = h.querySelector(".tag.block");
      h.insertBefore(doc.createTextNode(" "), block);
      h.insertBefore(chip, block);
      if (block) h.insertBefore(doc.createTextNode(" "), block);
    }
  }
  // NEW leads, UPDATED follows, the rest keep their order — per section,
  // on both channels (sort is stable; appendChild moves in place).
  doc.querySelectorAll(".tools").forEach((grid) => {
    const tiles = [...grid.children];
    const rank = (el) => {
      const h = el.querySelector && el.querySelector("h3");
      if (!h) return 2;
      const isNew = [...h.querySelectorAll(".tag.new")].some((x) => x.textContent.trim() === "NEW");
      return isNew ? 0 : h.querySelector(".tag.upd") ? 1 : 2;
    };
    if (!tiles.some((el) => rank(el) < 2)) return;
    tiles.slice().sort((a, b) => rank(a) - rank(b)).forEach((el) => grid.appendChild(el));
  });
};

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

