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
      n: 164, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 only 'not found' verifies a delete; Rename re-checks at the write; Housekeeping's duplicate group",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10593], risk: "high",
      why: "Findings 3 and 6 plus \u00a74.5 and \u00a78.5 \u2014 step 6 of the design, and the one that touches both destructive acts. FINDING 3 is the worst bug in the review: Housekeeping's read-back after a DELETE was `try { back = await readOne(...) } catch { back = null }`, so a 429, a 403 or a dropped connection all read as 'gone' and the tool reported a policy deleted on the strength of an error it never inspected. Only GraphError.kind === 'notfound' verifies now; anything else is a distinct outcome, 'unverified \u2014 check manually', counted apart from the deletions in the result line. The dry run and the apply also re-read the copy that would be KEPT: the delete is only safe because a newer one is there, and checking only the candidate answers half the question. FINDING 6: Rename wrote a whole plan against one reading; it now re-reads the names in use at Apply, re-checks the target name immediately before each PATCH against a set that follows each rename, and re-reads the policy itself for drift \u2014 a policy renamed in the portal between dry run and apply is LEFT ALONE rather than renamed over. \u00a74.5 adds Housekeeping's second group, same body under a second name, listed and deliberately UNTICKED (flagged review when neither name is in the convention), while superseded copies stay ticked; and the exact copy the committed catalog keeps is refused. \u00a78.5/\u00a78.4: the community rename rule, read off whether the community has an identity token \u2014 intune-my-macs policies are proposed the full MACOS convention name (area from the upstream folder, release from the upstream's publication date), OIB policies never are. A proposal whose D/U cannot be read asks on the row and cannot be ticked until answered. HIGH: it changes what a delete reports and what a rename writes.",
      test: [
        "FINDING 3, the one that matters: dry-run and apply a Housekeeping delete while throttled (or revoke the read scope between the delete and the read-back if you can contrive it). The row must read 'unverified \u2014 check manually', NOT 'deleted', and the summary must count it separately. Then check the portal and confirm what actually happened.",
        "A normal delete on cloudfellows.dev still reads 'verified gone \u2014 the read-back could not find it'.",
        "Rename the KEPT copy in the portal between dry run and apply: the delete is refused with 'the copy that would be kept is now named \u2026'.",
        "Delete the kept copy in the portal between dry run and apply: refused with 'nothing to keep this in favour of'.",
        "FINDING 6: dry-run a rename, then in the portal give the target name to another policy. Apply: that row fails with 'a policy took this name since the dry run' and nothing is written for it; the other rows still go through.",
        "Dry-run a rename, then rename that policy in the portal to something else. Apply: the row fails with 'the policy is now named \u2026 so it was left alone' \u2014 and the portal name is unchanged.",
        "\u00a74.5: make two policies with identical settings under different names. Housekeeping lists them as a second group, NOT ticked, naming what each duplicates. Make neither wear the convention: the group is flagged review.",
        "A superseded copy (same key, older version) is still ticked by default.",
        "Try to tick the exact copy the committed catalog keeps: refused with its reason.",
        "\u00a78.5 on cloudfellows.dev macOS: compare against intune-my-macs, then open \u270f\ufe0f Rename. A matched policy is proposed 'MACOS - DCP - <upstream folder> - D - <upstream name> - R26.8 - v1.0' with the release from the upstream cut. On a settings-catalog surface it asks for the D/U first and the tick is disabled until you answer.",
        "\u00a78.4 on Windows: an OIB policy is listed as 'kept' with the deployer reason, and no name is proposed for it.",
        "A 'Win - DCP - Something' with no version at all is proposed a release and v1.0.0.",
        "Headless: _to_delete/pb-tests.js 326/326.",
      ],
      files: ["js/platformbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 163, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Export fails closed on an incomplete read, and the rows are chosen",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10592], risk: "medium",
      why: "Finding 2 \u2014 step 5 of the design. Export ran on whatever the read had: a surface that 403'd, a settings read that threw, a body that came back empty. None of it stopped the export, so baseline/**/catalog.json could be committed SHORT, and every other tenant then reads that short catalog as the baseline and reports as `missing` what cloudfellows.dev has had all along. A catalog cut from a partial read is worse than no catalog \u2014 it is confidently wrong, and it spreads to every tenant that reads the repository. Export is now disabled while anything is unknown, prints read-against-expected per surface and names every unexportable row with its own reason, and re-checks at the click as well as at the paint. \u00a74.4's selection arrives with it: a tick per policy and per surface; a policy wearing the prefix without a release tag is listed greyed with an \u270f\ufe0f Rename first button instead of being dropped in silence; and two policies whose canonical bodies are identical under different names are BOTH kept and listed in the README, because which name is the baseline is not a question an export can answer. Medium: it only ever refuses to write, and the refusal is the feature \u2014 but it will refuse on a tenant where a surface reliably 403s, and that is a permission conversation.",
      test: [
        "On cloudfellows.dev with a clean read: \ud83d\udce4 Export shows the per-surface table with read equal to expected everywhere, both buttons enabled, and the policy list ticked.",
        "Untick one policy and export the JSON: it is absent from policies[] and the count on the note line matches.",
        "Untick a SURFACE box: every row under it clears and the master box goes indeterminate.",
        "Force a failure: sign in with a role lacking one surface (or use a tenant without Autopilot). Export is DISABLED, the red block names that surface, and the note under the buttons says to read again.",
        "A policy whose settings read fails shows in red in the list with its reason and is not ticked; the buttons stay disabled until a clean re-read.",
        "A policy named 'Win - DCP - Something' with no release tag appears under 'wears the prefix but not the convention', is not exported, and \u270f\ufe0f Rename first switches to the Rename pane.",
        "Make two policies with identical settings under different names on the tenant, export: both are in the catalog, and the README has a 'Same content under two names' section naming both and pointing at Housekeeping.",
        "Regression: on a clean read the repo folder is byte-identical to the previous build's except for the new README section and the exported/build stamps.",
        "Headless: _to_delete/pb-tests.js 290/290.",
      ],
      files: ["js/platformbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 162, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Import plans the comparison's gap, and can assign what it creates to the PRE-PILOT groups",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10591], risk: "high",
      why: "Finding 4 and \u00a78.3 of the design \u2014 step 4 of eight, and the first one that adds a WRITE the tools did not make before. Finding 4: the plan was built from the whole catalog and filtered afterwards, so an `ahead` row (this tenant has a NEWER copy) could reach the create pipeline; the plan is the comparison's rows now, `missing` and `outdated` only, and an outdated row creates a NEW copy under the catalog name and leaves the older one for Housekeeping \u2014 Import still never PATCHes content. \u00a78.3 is the new write: a radio above the plan assigns each created policy to INT-SEC-D-PRE-PILOT or INT-SEC-U-PRE-PILOT by its own D/U token. The design's rules are followed exactly and each one is a refusal to be clever: the groups are LOOKED UP by exact display name, never created; a missing group is a WARNING and the import still runs unassigned, because refusing to import because a group is absent puts the tool's convenience ahead of the job; a policy whose D/U cannot be read is NOT guessed at (only surfaces that can target nothing but devices \u2014 Autopilot, enrolment, scripts, remediations, filters \u2014 fall back to D) and its row blocks the button until a person answers; and an assignment that fails after a successful create is reported as 'created, NOT assigned' and never rolled back. HIGH: it writes assignments, which is reach, and reach is the thing this suite is most careful about everywhere else. Needs Group.Read.All, which T02 already requests.",
      test: [
        "On a test tenant WITHOUT the two groups: dry run with 'Assign to the pilot groups' \u2014 the plan warns that both groups were not found and says the policies will be created unassigned. Apply: they are created, and the result line says none were assigned.",
        "Create INT-SEC-D-PRE-PILOT only. Dry run again: the warning names only the U group. Apply a plan containing one D policy and one U policy: the D policy is assigned to the device group, the U policy reports 'created, not assigned'.",
        "Create both groups. Dry run, apply: each policy is assigned to exactly ONE group, the right one, and the portal shows a single group assignment with no filter.",
        "A catalog policy whose name carries no D or U on a settings-catalog surface: the plan row shows a 'needs D/U' dropdown and the Create button is DISABLED while it is ticked. Pick one; the button enables.",
        "Switch the radio to 'No assignment' after a dry run: the plan is discarded and says to dry run again \u2014 the groups were looked up under the other answer.",
        "THE FINDING-4 CHECK: a tenant whose copy of a catalog policy is NEWER (an `ahead` row) must not appear in the plan at all. Bump a policy's version on the tenant above the catalog's and confirm.",
        "An `outdated` row: apply creates a SECOND policy under the catalog name, the older one is untouched, and \ud83e\uddf9 Housekeeping then offers to retire it.",
        "Select D and Select U tick only the rows of that kind.",
        "Regression: 'No assignment' behaves exactly as Import did before this build.",
        "Headless: _to_delete/pb-tests.js 261/261.",
      ],
      files: ["js/platformbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 161, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Compare absorbs Upstream; Jaccard replaces the overclaiming score; the cards become filters",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10590], risk: "high",
      why: "Findings 8, 10, 11 and 12 of the T24 review \u2014 step 3 of the design, and the one that changes what the screen looks like. Two of the four are real wrongness, not layout. FINDING 8: the similarity score was hits over the SMALLER set, so a one-setting policy inside a hundred-setting one scored 1.0 and was claimed as the same control; it is now Jaccard over the union with a 0.6 floor, an anchor (the same template family or @odata.type \u2014 a compliance policy can no longer match a configuration profile), one-to-one assignment, and a `review` status when the runner-up is within 0.05, which claims nothing and says so. And the four-pass order (token, key, content hash, similarity) now runs for the REPO catalog too \u2014 it ran for community catalogs only, so a repo policy renamed on a tenant read as `missing` and Import made a second copy of it. FINDING 11: Compare and Upstream merge into one screen with a source picker; the status cards become filters defaulting to what needs attention; a search box, a surface filter and a D/U filter join them; the gap report prints the FILTERED table, because a report that quietly widens the filters is a different document from the screen. FINDING 10: the rail was divs with role=button and a click handler, so Enter and Space did nothing and the tool was mouse-only \u2014 native buttons with aria-selected. FINDING 12: index.html's three paragraphs about each tool went stale (by 10576 the page described a matching rule the code had stopped using) and are replaced by SPEC.help, rendered on the screen's own How it works pane. Every row also gains the \u2699 settings view (\u00a710) \u2014 Docs.popoutHtml, no second renderer \u2014 and Rename and Housekeeping lose their reference-tenant gate, which the design never had. HIGH: the whole screen is re-parented and the matcher rewritten; the tenant-facing acts are unchanged in mechanism but reach them through new rows.",
      test: [
        "MOCKUP NOTE: the layout was not mocked separately \u2014 the design document specifies \u00a74.1 to the row, and Mihai approved it. If the shape is wrong, that is a design change, not a build correction.",
        "Open \ud83e\ude9f signed in: one rail, native buttons \u2014 tab to a rail entry and press Enter, then Space: both switch the pane. Order is Compare, Import, Rename, Export (reference tenant only), Housekeeping, then How it works below the line.",
        "Compare lands with the source picker on top and the needs-attention cards pressed. Click Match: its rows appear. Click Missing: its rows go. Show everything clears them all.",
        "Type in the search box: the rows narrow and the box KEEPS FOCUS and its text (the toolbar is not re-rendered). Same for the surface and D/U selects.",
        "\ud83d\udcdd Gap report with filters on: the Markdown contains exactly the rows on the screen and says it is the filtered table.",
        "THE REGRESSION THAT MOTIVATED THE ORDER CHANGE: on cloudfellows.dev, a repo-catalog policy renamed on the tenant must now read Match (by content), not Missing. Check the Windows catalog rows that were renamed.",
        "A tenant carrying the same policy under two names shows one Match and one Duplicate, the duplicate naming its twin; \ud83e\uddf9 Housekeeping is where it goes.",
        "\u2699 on a Match row opens the documenter's popout for the tenant's copy; \u2699 on a Missing row opens the CATALOG's copy and says the policy is not in this tenant; \u2197 on a Differs row opens the diff.",
        "\ud83e\udde9 Community: Fetch latest from github.com still works and the button's sentence describes what it actually does; on the reference tenant \ud83d\udcc1 Community folder (zip) writes baseline/community/<id>/.",
        "\ud83d\udcc4 File\u2026 loads a catalog; a bad one is refused whole with its reasons and nothing from it appears.",
        "On a NON-reference tenant: Export is absent from the rail; Rename and Housekeeping are present and work (this is the design's change, \u00a74).",
        "\u2753 How it works names the matching order, every status, each act and the platform's own rule; the tool's card at the top of the page no longer explains any of it.",
        "Headless: _to_delete/pb-tests.js 233/233.",
      ],
      files: ["js/platformbaseline.js", "js/macbaseline.js", "js/winbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 160, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 one canonical body, a content hash per policy, catalog schema 2 and a loader that refuses",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10589], risk: "high",
      why: "Findings 5 and 9 of the T24 review \u2014 step 2 of the design's eight. Finding 5 is a data-handling problem, not a tidiness one: three different cleaners meant 'the policy without the tenant's bookkeeping', they disagreed, and the one that wrote baseline/**/catalog.json to a PUBLIC repository kept object ids, created and last-modified stamps, assignments, roleScopeTagIds, supportsScopeTags, settingCount and creationSource. canonicalBody(section, body) is now the single rule the hash, the diff, the export cleaner and the tests all read; all 127 files under baseline/ were re-cut through the engine's own functions, so what is committed and what \ud83e\uddec Export produces still cannot drift. The name and the description come OFF the body \u2014 a renamed copy must hash the same, or Housekeeping and the community match cannot see it \u2014 and ride the row instead, which is what keeps the OIBID token reaching a created policy (\u00a78.2). Finding 9: the catalog claimed almost nothing and the loader checked almost nothing, on a file Import creates tenant policies from. Schema 2 declares platform, catalogId and surfaces; the loader validates all of it plus every policy's section and refuses a bad file WHOLE with its first three reasons; and every body carries a SHA-256 that is recomputed on read, so a body edited after export is flagged tampered and can never be imported. The release stops being the hardcoded 'R26' and is derived from the policies, with releaseMix beside it \u2014 which immediately surfaced that the Windows catalog holds R27.1 \u00d72 and R26.2 \u00d73 next to R26.6 \u00d732, a mix the old label hid. HIGH because every catalog file in the repository changed and Import reads them.",
      test: [
        "git diff --stat on baseline/: 127 files, and no committed body contains id, createdDateTime, lastModifiedDateTime, assignments, roleScopeTagIds, supportsScopeTags, settingCount or creationSource any more.",
        "Open \ud83e\ude9f on any tenant: the catalog line reads the DERIVED release (R27.1 for Windows, R26.9 for macOS) with the mix chip beside it, and the comparison table is the same as it was at 10588 \u2014 the re-cut changed the bodies' packaging, not which policies match.",
        "On the reference tenant, \ud83e\uddec Export \u2192 \ud83d\udcc1 Repo folder, unzip over the repo: git says nothing changed except `exported`, `build` and the timestamps. That is the byte-identical rule, and it is the check that the browser and the generator still agree.",
        "Import an OpenIntuneBaseline policy on a test tenant and read the created policy's description in the portal: the OIBID:<guid> token is there. Without it OIB's own deployer can never update what TUNO created.",
        "Hand-edit one body in baseline/windows/catalog.json, reload: that row is refused by Import with 'its body does not match the hash the catalog carries', and the rest of the catalog still works.",
        "Change `platform` in baseline/macos/catalog.json to windows, reload \ud83c\udf4e: the screen says the catalog was refused and names the reason; NOTHING from that file is loaded.",
        "A schema-1 catalog file (git show HEAD~1:baseline/windows/catalog.json) loaded through \ud83d\udcc4 Load a baseline file is refused with the schema reason \u2014 old exports do not silently half-load.",
        "Headless: _to_delete/pb-tests.js 170/170.",
      ],
      files: ["js/platformbaseline.js", "js/macbaseline.js", "js/winbaseline.js", "baseline/", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 159, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the tenant's data does not survive sign-out; the reference-tenant gate moves to the tenant ID",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10588], risk: "high",
      why: "Findings 1 and 7 of the T24 review (beta 3be5a06), which the T24/T27 design applies to both tools because the code is shared \u2014 step 1 of its eight. Finding 1 is a real leak, not a tidy-up: sign-out called PolicyCache.clear() and nothing else, so a baseline screen that had already landed a read kept ITS copy \u2014 the comparison, the import/rename/housekeeping plans, the community catalog fetched from github.com \u2014 and rendered the previous tenant's policy names to whoever signed in next. On a consultancy laptop that is one customer's estate shown to another, which is why this is high and not medium. Every tenant-derived field now lives in one session object keyed by the tenant id that produced it; app.js fires tuno:signout and each tool drops its own state beside where that state lives, onShow() drops it again if the id moved without an event (a demo entered from a signed-in session), and every Apply refuses a plan whose tenant is no longer the signed-in one. Finding 7 is the display-name gate: isCfdev() matched a UPN domain or the substring 'cloudfellows' in an org display name, so any tenant that named itself so was offered the acts that author the baseline. The comparison moves to the immutable Entra tenant ID (MSAL's tid). CFDEV_TENANT_IDS SHIPS EMPTY ON PURPOSE FOR THIS ONE BUILD \u2014 the GUID is not in the repository and a guessed value would lock the reference tenant out of its own acts \u2014 so this build PRINTS the signed-in tenant id in the badge tooltip and on both baseline rails, and the name check still answers meanwhile and says that it did. Filling the list is a one-line edit in the next build, and the name half goes with it.",
      test: [
        "Sign in to cloudfellows.dev, open \ud83e\ude9f or \ud83c\udf4e: the rail's top line names the tenant, prints its GUID under the name, and badges 'reference tenant (by name)'. Copy that GUID \u2014 it is what CFDEV_TENANT_IDS wants.",
        "Hover the \ud83e\uddea cfdev header badge: the tooltip carries the same id and says the gate is still name-based because the list is empty.",
        "THE LEAK: sign in to any tenant, open a baseline tool, let it read (the comparison table fills). Sign out. Sign in to a DIFFERENT tenant and open the same tool: no row, no count and no policy name from the first tenant appears before the new read lands. Before 10588 the old comparison was still on the screen.",
        "Same again without signing out: sign in, read, then follow the demo link \u2014 the baseline screen shows no real-tenant rows.",
        "Dry-run an import on tenant A, sign out and into tenant B, return to the tool and click Create: it refuses with 'the signed-in tenant changed since this plan was made' and writes nothing. Repeat for Rename, Housekeeping and Upstream.",
        "On a NON-reference tenant, Export / Upstream / Rename / Housekeeping are absent from the rail as before; the badge does not render.",
        "Regression: on the reference tenant every act still works end to end \u2014 read, compare against both catalogs, fetch the community catalog from github.com, dry run and apply an import, a rename and a housekeeping delete.",
        "Headless: _to_delete/pb-tests.js 83/83, _to_delete/cfdev-tests.js 31/31.",
      ],
      files: ["js/platformbaseline.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 158, title: "\ud83d\udd10 T01 \u2014 Remove-TunoUserInstalledApps.ps1; What breaks? lists user-profile blocks with a publisher fix; __PSSCRIPTPOLICYTEST_ labelled expected",
      tools: ["T01 AppLocker"], builds: [10587], risk: "medium",
      why: "Mihai, 4 Sep, first enforced device: users cannot uninstall their per-user apps any more (the uninstaller in the profile is what Exe refuses) and an admin needs a menu for it; PowerToys was blocked and What breaks? had folded it into a by-design count with no way to allow it; the PowerShell CLM probe showed up as a block. The script changes nothing in the policy; the What breaks? change adds a collapsed list and a publisher-only fix for signed rows.",
      test: [
        "Elevated shell on a device with a per-user install: the menu lists it under the right user with version, publisher and ~\\AppData\\Local\\… location; picking it runs the uninstaller and the entry leaves the hive; a logged-off user's hive is loaded and unloaded (no HKU\\S-1-5-21-… left mounted).",
        "Per-user MSI: msiexec answers 1605, the script says why and offers leftover removal; the guard refuses a folder shallower than three levels inside the profile or named AppData/Local/Roaming/Programs.",
        "Non-elevated run exits 1 with the message; -List changes nothing; -Name X -Force without -Leftovers never deletes a folder.",
        "What breaks? with a bundle carrying a signed block under \\Users\\: the by-design details lists it with Allow by publisher and no path button; an unsigned one shows the removal hint; the Enforce gate is unchanged by by-design rows.",
        "A bundle with __PSSCRIPTPOLICYTEST_ events: one probe line, none in gaps, none in Evidence's refused list, counted in the footer and the markdown report.",
        "Help & scripts: ten downloads, nine companions in five groups, each row followed by its note; every irm command populated; check-script-versions green with the new script.",
      ],
      files: ["scripts/Remove-TunoUserInstalledApps.ps1", "scripts/README.md", "js/applocker.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 157, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 rename and delete on every surface the read covers (the read stamps __surface); lenient versions; ticks on the import plan",
      tools: ["T27 Windows baseline", "T24 macOS baseline", "T05 Documenter"], builds: [10586], risk: "medium",
      why: "Mihai, 2026-09-04: Rename refused scripts, remediations and enrolment configurations with 'no rename path here'; the import plan lacked select/deselect. The refusal was honest but avoidable: the read did not say which of three endpoints a script came from. One additive line in T05's collect stamps __surface on every item of a multi-surface section (beside __detail; nothing rendered changes), and the rename/delete paths use it; enrolment and Autopilot get their PATCH with @odata.type. Medium: T05's read object gains a field (additive), and PATCH/DELETE reach more surfaces on cfdev only.",
      test: [
        "cloudfellows.dev, \u270f\ufe0f Rename after a fresh read: the remediations, PowerShell scripts, enrolment restrictions and update profiles that read 'no rename path' now propose; 'v.3.7' proposes '- R26.1 - v3.7'. Dry run names the endpoint per row (deviceHealthScripts, deviceEnrollmentConfigurations \u2026); Rename: each renamed in the portal, read back.",
        "cloudfellows.dev, an item from the cached sign-in read (older than this build) reads 'the read did not say which endpoint \u2026 re-read the tenant'; after Read it proposes.",
        "Any tenant, Import dry run: rows ticked, select none disables the button at 0, untick one and the button counts down; Create creates only the ticked.",
        "T05: a document renders exactly as before (the stamp is not a row).",
        "Suites (outside the repo): platformbaseline-tests.js 167/167 (11 new), baseline-dom-tests.js 94/94 (4 new)."
      ],
      files: ["js/platformbaseline.js", "js/document.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 156, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the community comparison matches by content (\u2260 Differs bucket); Import creates only the gap; plan name column fixed",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10585], risk: "medium",
      why: "Mihai on cloudfellows.dev, 2026-09-04: OIB read 72 missing against the tenant that had deployed it under CloudFellows names \u2014 'the compare should match on settings, not on name'. The Upstream act already knew how; the comparison now uses the same rule (token \u2192 name \u2192 content, one overlap floor) and gains a Differs bucket with the per-setting diff. Import was creating the whole catalog with a name collision stop, which would have made copies of everything matched by content \u2014 it now creates only the comparison's missing/outdated rows. Medium: a production tool's verdicts change (fewer missing, some differs) and its import plans less \u2014 both in the honest direction. Also fixes the blank name column in the import plan (target vs newName), inherited from T24's original. Built as 10576 against the 10575 tip; renumbered 10585 when it landed after the T01 rethink builds 10576\u201310584.",
      test: [
        "cloudfellows.dev, T27 with OIB selected: the 72 missing become mostly up to date / differs / outdated with 'content NN%' chips; open a Differs row's 'what differs' \u2014 the values named are the ones cfdev changed on purpose; Missing is now the OIB policies cfdev really does not carry. \ud83d\udcdd Gap report shows the diff lines under each Differs row.",
        "cloudfellows.dev, T27 Import with OIB selected: dry run plans only the Missing/Outdated rows and says 'N of 73 left alone \u2014 the comparison found them present'; the plan's first column shows names.",
        "Any tenant, T27 with OIB, before a read: Import dry run plans the whole catalog (no comparison yet) with the collision stop \u2014 unchanged.",
        "T24 with intune-my-macs: a tenant policy carrying the same settings under a MACOS name reads present by content.",
        "Suites (outside the repo): platformbaseline-tests.js 156/156 (9 new: content match ok/differs/outdated, token and name still first, CloudFellows untouched, report lines), baseline-dom-tests.js 90/90 (the import plan scoped to the gap)."
      ],
      files: ["js/platformbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 155, title: "\ud83d\udd10 T01 \u2014 MDM store Policy files decoded robustly (health check 1.1.1, scanner 1.12.1)",
      tools: ["T01 AppLocker"], builds: [10584], risk: "low",
      why: "Mihai, 4 Sep: the health check's first Live Response run printed mode=? rules=? for all four Intune-delivered collections; the catch swallowed the reason. Both readers now sniff BOM/UTF-16, strip NULs, cut to the first tag, fall back to a regex count, and log reason + encoding + first bytes when parsing fails. Read-only; nothing in the policy path changes.",
      test: [
        "Run Get-TunoAppLockerPolicyHealth.ps1 1.1.1 on the 4 Sep device: MDM store lines carry a real mode and rule count (Script Enabled, 14) or, failing that, a WARN naming the reason, the encoding and the first 16 bytes.",
        "Scanner 1.12.1 on the same device: the bundle's effective policy sources.mdm lists the grouping with per-type mode and rule counts; warnings carry the decode reason when a file cannot be parsed.",
        "check-script-versions: both scripts bumped; every script stamped 10584.",
      ],
      files: ["scripts/Get-TunoAppLockerPolicyHealth.ps1", "scripts/Invoke-TunoAppLockerScan.ps1", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 154, title: "\ud83d\udd10 T01 \u2014 Get-TunoAppLockerPolicyHealth.ps1 joins the companions; each script's note under its own row",
      tools: ["T01 AppLocker"], builds: [10583], risk: "low",
      why: "Mihai, 3 Sep: add his policy health check as a download, and put each script's explanation under that script instead of one paragraph for all. The script is taken into the house with its verdict fixed: its first run said 'AppID never processed it' on a device that was blocking scripts, because it trusted Get-AppLockerPolicy -Effective (which does not see CSP policy) and a 0 x 8001 count from an EXE and DLL log that had rolled over. It now reads the MDM store per collection, reports the log's reach, and takes AppLocker decisions after the store's newest write as proof the policy runs.",
      test: [
        "Help & scripts: nine downloads; under the fold eight companions in four groups, each row followed by its own note; every irm command populated; the fold starts closed.",
        "Run Get-TunoAppLockerPolicyHealth.ps1 on the 3 Sep device via Live Response: the MDM store lines carry mode and rule count (Script Enabled, 14), the effective summary is labelled local+GPO only, the log-reach line says whether EXE and DLL rolled, and the verdict reads RUNNING when a decision was logged after the 13:17 write.",
      ],
      files: ["scripts/Get-TunoAppLockerPolicyHealth.ps1", "scripts/README.md", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 153, title: "\ud83d\udd10 T01 \u2014 the scan's effective policy includes the Intune-delivered (CSP) policy",
      tools: ["T01 AppLocker"], builds: [10582], risk: "medium",
      why: "Mihai, 3 Sep: the deployed profile carries a Script collection with 14 rules and the device blocks scripts (8007), yet the scan's effective policy said Script had no rules. Get-AppLockerPolicy -Effective does not include CSP-delivered policy; it lives in the System32\\AppLocker\\MDM cache the cleanup script already knew about. Scanner 1.12.0 reads and merges it (Get-MdmAppLockerPolicy, Merge-AppLockerXml) and T01 names the groupings. Medium: the merge is unit-tested on Linux against a fake cache; the real cache layout (enrollment\\grouping\\type\\Policy, RuleCollection per file) is from Clear-TunoAppLockerPolicy's own reading of it and needs one real scan to confirm.",
      test: [
        "Run scanner 1.12.0 elevated on the device with the deployed profile: the console prints the merge note and 'MDM grouping AppLocker-…: EXE, MSI, Script, StoreApps'; the bundle's effectivePolicy.xml carries the Script collection with its 14 rules and effectivePolicy.sources.mdm names the grouping.",
        "Upload it: the Evidence row says 'effective policy includes Intune grouping AppLocker-…'; switch to the effective policy: the note lists the grouping and its collections, Script is no longer empty, and What breaks? judges against it.",
        "Upload the 3 Sep 11:51 bundle (scanner 1.11): the Evidence row and the note say its effective policy was read without the Intune part and point at 1.12.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/README.md", "js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 152, title: "\ud83d\udd10 T01 \u2014 the tenant check runs itself; the rules bar (chips + filter); \"to decide\" on every counted finding",
      tools: ["T01 AppLocker"], builds: [10581], risk: "low",
      why: "Mihai, 3 Sep: 'why can't this be automated' (the Evidence row telling him to go press Check against the tenant), 'the rules section should also be easy scrollable' (83 rules in four tables), and 'this should clearly say on the finding, in the same red, to decide' (the rail said 10 to decide; the rows did not). The check is a read with consent the tenant already gave, so it runs on policy load through Graph.silentScopes and never prompts; the rules bar is chips plus a DOM-only filter; the decide mark is the rail's own words and colour on the rows it counts.",
      test: [
        "Signed in to a tenant that has consented before: upload a bundle \u2014 within a second the Evidence row reads 'Deployed profile \u00b7 matched \u00b7 <name>' and Deploy says 'already deployed \u2014 this is an iteration', with no click and no consent prompt. Load a second policy: it is read again; re-render without a new policy: it is not.",
        "A fresh tenant (no consent yet): nothing is read silently; the Evidence row shows 'Check the tenant now', pressing it asks for the read once and fills the row.",
        "Policy \u2192 Rules: chips Exe/Msi/Script/Appx with counts and red nested-finding badges; a chip scrolls to its table; typing 'onedrive' in the filter leaves the OneDrive rules only and says 'N of M rules'; clearing restores all.",
        "Findings: every High/Medium row carries 'to decide' in the rail's red; the number of marks equals the rail's 'N to decide'.",
      ],
      files: ["js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 151, title: "\ud83d\udd10 T01 \u2014 DLL loads hidden by default on What breaks?; the effective policy explained as evidence",
      tools: ["T01 AppLocker"], builds: [10580], risk: "low",
      why: "Mihai, 3 Sep, on the 2 Sep bundle: 'the solution for now does not audit or enforce .dll, so in What breaks? we need to filter those out' \u2014 the device's effective policy carries the Managed Installer dummy rule in Dll, so a thousand Defender DLL audits became rows. And 'with the effective policy I see that scripts have no rules, but they should be there' \u2014 true of the device at 12:23 on 2 Sep: the merge it was running had an empty Script collection, i.e. the deployed profile had not reached it. The tool now hides DLL loads by default (toggle in the header, remembered) and explains the effective policy as evidence rather than letting it read as a broken draft.",
      test: [
        "Upload the 2 Sep bundle, What breaks?: the header carries 'Hide DLL loads (1015 events \u2014 no Dll collection in the draft)' ticked; no .DLL row anywhere; the scan card's refused list says how many DLL loads it hides.",
        "Switch to the device's effective policy on Evidence: the DLL loads stay hidden although that policy carries a Dll rule; the note above the gate explains the merge, names Script/Msi/Appx as empty and points at the generated rule set. Untick the toggle: the DLL rows appear and the rail count jumps; tick again and they go.",
        "Reload the page: the toggle state is remembered.",
      ],
      files: ["js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 150, title: "\ud83d\udd10 T01 \u2014 the Policy screen's sections as sub-nodes on the rail",
      tools: ["T01 AppLocker"], builds: [10579], risk: "low",
      why: "Mihai, 3 Sep, on the rail: 'when viewing this policy make it easy to navigate between the sections' \u2014 Policy is the long screen (summary, add-rule, findings, coverage, rules, advanced) and the jump strip went with the rail. The sections are sub-nodes under the Policy node, each with the count that says whether it needs a look; the rail is sticky so they stay in reach.",
      test: [
        "Load the sample or a bundle: six sub-nodes appear under Policy (Summary \u00b7 Add a rule \u00b7 Findings N to decide \u00b7 Microsoft apps \u00b7 Rules N \u00b7 Advanced); clicking Findings scrolls the card under the sticky header; clicking Advanced opens the fold.",
        "Switch to What breaks? or Deploy: the sub-nodes are gone; back to Policy: they return with current counts.",
      ],
      files: ["js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 149, title: "\ud83d\udd10 T01 \u2014 the deploy panel leads with what happened, an update in place moves the version, the loop strip on top",
      tools: ["T01 AppLocker"], builds: [10578], risk: "low",
      why: "Mihai's first round on the rail, 3 Sep, with a live tenant: the update in place worked but the panel still led with a bold Create button and reported it in one small line; the Enforce profile kept its name (V4.0.1 over V4.0.1 \u2014 10570's audit-pin applied to an update); gate 1 read \u2717 beside the profile it had found; and he asked for the loop strip at the top for visibility. Four fixes with one honest answer each; deploy suite grew a scenario that deploys two profiles under one grouping and updates the Enforce one.",
      test: [
        "Sign in, load a draft under a grouping that is already deployed, 🔎 Check against the tenant: the panel says 'already deployed \u2014 this is an iteration', Update it in place is the primary button on each matched profile, Create is behind the 'Not iterating' fold, gate 1 reads \u2713 with the audit profile's name.",
        "Update the Enforce profile in place with the name on the table equal to the deployed name: the PATCH carries the next version (V4.0.1 \u2192 V4.0.2), the portal shows the new name, the panel leads with the green 'Policy updated in place' banner naming it, the status line and the strip's Update profile station say so.",
        "Create the AuditOnly profile on a fresh grouping: the banner reads 'AuditOnly profile created' and the assign-to-pilot block follows it.",
        "The loop strip is above the rail on every screen; clicking Scan/Build/What breaks?/Deploy switches the rail to that screen and scrolls to the card.",
      ],
      files: ["js/applocker.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 148, title: "\ud83d\udd10 T01 rethink, part 2 \u2014 the rail (Option B), and What breaks? replays ALLOWED events against the draft",
      tools: ["T01 AppLocker"], builds: [10577], risk: "medium",
      why: "Mihai, 3 Sep: 'the workflow of T01 has become a mess, very difficult to follow, not clear when to use what' \u2014 after an Enforce policy blocked scripts he believed were allowed. Two mockups (tabs vs rail) on 3 Sep; he picked the rail. Four screens, one at a time, on the shared ep-rail chrome; the counts on the nodes are the decisions left, the foot is the next act. The engine (audit, fixes, coverage, groupings, deploy panel, events harvest) is untouched \u2014 the shape around it changed, and one blind spot closed: What breaks? replays every event on the table including Allowed ones, which is the only question anyone has before Enforce and the one the tool never answered. Medium: a full re-parenting of the screen; every T01 suite is green and the real 3 Sep bundle renders the six expected rows, but the tenant-facing deploy flow was exercised headlessly only.",
      test: [
        "Open T01 signed out: Evidence is the screen on the table, the rail shows nothing yet / \u2014 / \u2014 / \u2014, the foot says to upload a bundle or pull from the tenant.",
        "Upload the 3 Sep bundle (TunoAppLockerScan-NLDBCD333C456A9-20260902-1423.json): it lands on Policy; the status line names the device and 'Enforce blocked \u2014 6 unresolved breaks'; What breaks? lists the four mapping scripts (ran OK, blocked by the draft, IT-TOOLS hint) and the two TUNO scripts from C:\\Temp; Accept block on the two TUNO ones drops the count to 4 and the rail follows; Allow by hash on a mapping script adds the rule and is one Undo away.",
        "Evidence says ProgramData not scanned for that bundle; a bundle from scanner 1.11.0 (ProgramData in scope) does not.",
        "Deploy: the deploy panel leads, the code panel follows full-width with its two tabs (Policy XML \u2014 for a GPO / Intune profile \u2014 the primary output); sign in, 🔎 Check against the tenant, create the audit profile, update in place \u2014 all as before 10577 (the deploy suite is 155/155).",
        "Help & scripts holds the scanner download, the folded companions, the Remediation deploy and the loop strip; every irm command is populated.",
        "Narrow window: the rail collapses to the chip strip like the other rail tools; no pane overflows.",
        "Start over returns to Evidence and clears the accepted blocks.",
      ],
      files: ["index.html", "js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 147, title: "\ud83d\udd10 T01 rethink, part 1 \u2014 the scanner writes one file (-WriteXml for GPO), and ProgramData is in the default scope",
      tools: ["T01 AppLocker"], builds: [10576], risk: "low",
      why: "3 Sep: an Enforce policy blocked the Intune drive/printer mapping scripts an admin believed were allowed. The deployed file was the scanner's own AppLockerRules-Enforce XML, which had never been through T01, and the scan had not looked at ProgramData where those scripts live. Both are design faults with one honest answer each: the scanner writes only the bundle unless -WriteXml is given (and then says the XML is unreviewed), and ProgramData is in the default -Scope. Part 2 \u2014 the rail layout (Option B, mockup 3 Sep), the What-breaks replay of ALLOWED events and one Enforce switch \u2014 follows as its own item.",
      test: [
        "Run Invoke-TunoAppLockerScan.ps1 v1.11.0 with no switches on a reference image: three roots are walked (Windows, Program Files, ProgramData), exactly one .json is written, the Next section says the rule set is in the bundle, and no AppLockerRules-*.xml appears.",
        "Run it again with -WriteXml: the two XML files appear and the console carries the UNREVIEWED note.",
        "Upload the bundle in T01: the evidence card shows ProgramData among the roots and the scripts under ProgramData are inventoried (hash rules for unsigned .ps1/.vbs).",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/README.md", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 146, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the folder is the catalog: baseline/**/catalog.json read from the site, the js/*Data.js copies gone",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10575], risk: "medium",
      why: "Mihai, 2026-09-03: 'I see baseline/windows in the repo, also on GitHub \u2014 why is this not read as the catalog?' It should have been: 10574 wrote the same catalog twice (js data file for the app, folder for people). Now the app fetches baseline/<platform>/catalog.json and baseline/community/<id>/catalog.json from its own origin when a baseline tool opens \u2014 connect-src 'self' allows it, no CSP change \u2014 and the four data files (1.7 MB on every page load) are deleted. Medium: a production tool's catalog now arrives by fetch instead of by script tag; the screen waits for it and says so; a 404 is reported on the catalog line. GitHub Pages serves the folder as any file.",
      test: [
        "Any tenant, cold open of T24 and T27: a one-line 'Reading the catalogs from baseline/\u2026' then the seg with both catalogs and the rows 'not read'; DevTools shows two same-origin GETs per tool with ?v=10575, 200, and no *Data.js in the page's scripts.",
        "Rename baseline/windows/catalog.json locally and serve: T27 says the file answered 404 on the catalog line, offers Load a baseline file, and the community catalog still works (and vice versa).",
        "cloudfellows.dev: \ud83e\uddec Export \u2192 \ud83d\udcc1 Repo folder, unzip at the repo root: git status shows no change (catalog.json and README.md byte-equal to the committed ones \u2014 the suite proves it for both platforms).",
        "cloudfellows.dev: \ud83e\udde9 Upstream \u2192 Fetch the latest \u2192 \ud83d\udcc1 Community catalog folder: unzips to baseline/community/openintunebaseline/ with catalog.json and README.md.",
        "Suites (outside the repo): platformbaseline-tests.js 147/147 (loadCatalogs against a fake same-origin fetch incl. the 404 road; the committed folders byte-equal to repoFolder/communityFolder of the exports), baseline-dom-tests.js 90/90 (the cold open waits for the reads, both tools)."
      ],
      files: ["js/platformbaseline.js", "js/macbaseline.js", "js/winbaseline.js", "baseline/", "index.html", "README.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 145, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Housekeeping deletes the copies a re-cut left behind; Export writes the repo folder; the CloudFellows Windows catalog bundled",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10574], risk: "high",
      why: "Mihai, 2026-09-03: 'a housekeeping button where I can easily see which policies were updated or have a higher release and version number and easily delete them from the tenant', and 'make the export something I can easily put in a folder in the repo to be used as the baseline'. The two exports he sent carried the answer to both: macOS 100 policies of which 16 identities twice (15 re-cuts + the old duplicate), Windows 37 clean. HIGH because this is the baseline tools' FIRST DELETE \u2014 cfdev-only, dry-run-first, fresh per-policy read at plan and at delete time, assigned copies refused, read-back-that-fails as the proof \u2014 and because production's T24 catalog changes shape (newest per identity). The repo now carries baseline/macos and baseline/windows beside the data files, cut from one export through one function.",
      test: [
        "cloudfellows.dev, T24: \ud83e\uddf9 Housekeeping reads '18 old copies'; every group shows the R26.9 copy kept and the R26.6 copy under it; any old copy still assigned reads 'kept \u2014 assigned to N, move the reach first' with no tick. \ud83d\udce6 Back up first. Dry run: each ticked copy re-read; Delete: the portal shows them gone; the source line reads 'Housekeeping: 18 deleted'; Compare against the bundled catalog reads 82 up to date, no '2+ versions' chip.",
        "cloudfellows.dev, T24 then T27: \ud83e\uddec Export \u2192 \ud83d\udcc1 Repo folder (zip): unzip at ~/REPO/TUNO \u2014 baseline/<platform>/ and js/<platform>baselineData.js overwrite the committed ones with no diff when the tenant is unchanged (the proof the bundle was cut from the same road).",
        "Any tenant, T27: the seg shows \ud83e\uddec CloudFellows R26 \u00b7 37 and \ud83e\udde9 OpenIntuneBaseline v3.8 \u00b7 73; Import from CloudFellows creates the 33 importable (4 scripts refused on the row).",
        "The two R27.1 names on Windows: Mihai decides \u2014 rename on cfdev (\u270f\ufe0f proposes nothing for them, they wear a tag) or leave; either way re-export.",
        "Suites (outside the repo): platformbaseline-tests.js 139/139 (15 new: dedupe, repo folder, data file byte-equal to the bundle, housekeeping rules), baseline-dom-tests.js 87/87 (12 new: both catalogs on the seg, export buttons, the housekeeping act end to end against a fake Graph)."
      ],
      files: ["js/platformbaseline.js", "js/macbaselineData.js", "js/winbaselineData.js", "baseline/macos/", "baseline/windows/", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 144, title: "\ud83c\udf4e T24 + \ud83e\ude9f T27 \u2014 re-read after every write; one identity twice in the catalog pairs by exact version",
      tools: ["T24 macOS baseline", "T27 Windows baseline"], builds: [10573], risk: "low",
      why: "Mihai on cloudfellows.dev, 2026-09-03: 'just did a create missing for the macos. nothing changes, still saying missing 15' \u2014 the screenshot showed 15 missing AND 15 newer than baseline, the same fifteen: the fresh export carried each re-cut policy twice and compare() gave both tenant copies to the first row. And after any write the screen kept the read it had. Both corrections are in the engine both tools share; production's T24 has the same two behaviours. Correctness fixes with one honest answer each.",
      test: [
        "cloudfellows.dev, T24 with today's export loaded: Compare reads 0 missing, 0 newer than baseline, every duplicated identity up to date and wearing '2+ versions in the catalog'; retire an old copy in the portal, re-export, load \u2014 the chip is gone.",
        "Any tenant, T27 with OIB: Import dry run \u2192 Create N: the pane says 're-reading the tenant', the screen lands on Compare with 'Import: N created \u2014 re-read at HH:MM' on the source line and the N now up to date; the rail's Compare node dropped by N. Failures, if any, listed under Import.",
        "cloudfellows.dev, Rename the ticked: the list is re-cut from the fresh read (renamed rows gone, 'all stamped' on the rail when none remain).",
        "cloudfellows.dev, Upstream create: the source line reads 'Upstream: N created'; the Upstream pane keeps its own result.",
        "Suites (outside the repo): platformbaseline-tests.js 124/124 (7 new on duplicated catalog identities), baseline-dom-tests.js 75/75 (5 new on the re-read)."
      ],
      files: ["js/platformbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 143, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Rename stamps the release from the last-modified date; the repository is read from github.com in the browser (CSP widened)",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10572], risk: "medium",
      why: "Mihai, 2026-09-03: the cfdev tenant's Windows policies wear the convention but not the release tag \u2014 stamp it from the last-modified date, show the list, let him edit, one button; and read the upstream repository directly, no zip, everything in the browser. The rename is a write on a production tool's screen (T24 shares it) but cfdev-only and dry-run-first, hence medium. The fetch widens the CSP connect-src to api.github.com and raw.githubusercontent.com \u2014 a security-model change, documented in SECURITY.md, plain fetch with no credentials (Graph.call still refuses any host but graph.microsoft.com). Promote both or neither: the CSP line and the fetch buttons are one change.",
      test: [
        "cloudfellows.dev, T27: Read the tenant, open \u270f\ufe0f Rename \u2014 the rail says N to stamp; every 'Win - \u2026 - vX' without an Ryy.m is listed with its surface, last-modified date and the tag it earns; the proposed names are editable; 'Win - OIB - \u2026' rows read 'kept'; a name with no version reads 'not proposed'. Dry run: refused rows say why (convention, duplicate, collision). Rename the ticked: each policy renamed in the portal, read-back verified, the pane says the read is stale; Read the tenant \u2014 Compare against CloudFellows now finds them and the rail's Rename node says 'all stamped'.",
        "Any tenant, T27 Compare with OpenIntuneBaseline selected: \ud83c\udf10 Fetch the latest from github.com \u2014 the status counts the reads, the catalog line then says fetched, with the bundle's version and commit beside it, and the comparison re-runs against the fetched set; \u21a9 Back to the bundle restores it. Repeat until GitHub's limit trips: the refusal names the limit and the reset time, the bundled comparison is unaffected.",
        "cloudfellows.dev, T27 Upstream: Fetch the latest \u2014 the diff renders from github.com with the commit in the header; \u2b07 Community catalog file carries that commit and date. The zip road and 'Use the bundled' still work.",
        "T24: the same two acts on MACOS names and intune-my-macs.",
        "Security: in DevTools, no request to api.github.com or raw.githubusercontent.com carries an Authorization header; a self-hosted copy with the two hosts removed from the meta tag reports the refusal on the button and loses nothing else.",
        "Suites (outside the repo): platformbaseline-tests.js 117/117 (28 new: releaseOfDate/stampRelease, proposals per surface, OIB kept, fetch against a fake GitHub incl. the rate limit and a truncated tree), baseline-dom-tests.js 70/70 (21 new: rail node, rename table, collisions, stale plan, PATCH fields and read-back, fetch buttons, CSP line)."
      ],
      files: ["js/platformbaseline.js", "js/winbaseline.js", "js/macbaseline.js", "index.html", "SECURITY.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 142, title: "\ud83e\ude9f T27 Windows baseline \u2014 and the community baselines (OpenIntuneBaseline, intune-my-macs) beside CloudFellows in T24 and T27",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10571], risk: "high",
      why: "Mihai, 2026-09-03: 'the OpenIntuneBaseline should get the same treatment as the macOS baseline' \u2014 and 'check the autocheck and import features from the ENCA baseline for the Joey Verlinden baseline, add those to TUNO, also for macOS'. Two things, one build. T27 is T24 pointed at Windows (convention 'Win - SEC - App Control for Business - D - AllowAll - R26.6 - v3.0', cfdev already wears it); rather than a second copy of macbaseline.js the machinery moved to js/platformbaseline.js and each platform became a spec \u2014 which is why this item touches a PRODUCTION tool (T24) and carries high risk: same acts, same ids, same exports, but every line of it moved. The community catalogs are ENCA's Joey treatment Intune-side-out: bundled from the repos, compared on open, importable anywhere, names verbatim (Mihai: OIB can be maintained by TUNO or by OIB's own deployer, keeping the name is what makes that true); OIB's OIBID token identifies before the name. Layout picked off the mockup: Option A, one tool per platform with ENCA's catalog seg on the Compare and Import panes. NOT bundled yet: the CloudFellows Windows catalog \u2014 it needs the cloudfellows.dev export (T27 \u2192 Export), a follow-up build bundles it as js/winbaselineData.js.",
      test: [
        "T24 REGRESSION FIRST (production tool moved onto the engine): open \ud83c\udf4e macOS baseline on a tenant with MACOS policies \u2014 the cached read compares on open exactly as before, the four rail nodes carry the same counts, Export on cloudfellows.dev writes the same file shape (kind tuno-macos-baseline), Import dry run plans the same creates, the Upstream zip road still loads intune-my-macs. Then the new seg: \ud83e\uddec CloudFellows R26 \u00b7 82 and \ud83c\udf4f intune-my-macs \u00b7 21 above the cards; switching re-compares in place.",
        "T27 cold open on any tenant: the rail offers Compare \u00b7 Import; the seg shows \ud83e\udde9 OpenIntuneBaseline v3.8 \u00b7 73 only (no CloudFellows catalog bundled yet, said in the catalog line); 73 rows render with 'not read' on the tenant side, never 'missing'; the community line names the author, the repo and commit 4844247.",
        "T27 on a tenant with OIB deployed: \ud83e\ude9f Read the tenant \u2014 every deployed OIB policy reads up to date / outdated / newer by version; a policy RENAMED in the portal but still carrying OIBID:<guid> in its description is still matched and its row wears the OIBID badge with 'version unknown' (the name carries none); an OIB policy from an older release that v3.8 no longer ships reads 'not in baseline'; a Win - SEC - \u2026 - R26.x CloudFellows policy is NOT listed as an OIB extra.",
        "T27 Import from OIB (test tenant): dry run plans N to create with the verbatim 'Win - OIB - \u2026' names, the deployed ones skipped by the collision stop, the 3 WUfB driver profiles named as not importable; Create: the settings-catalog policies (endpoint security templates included), the 4 compliance policies and the WUfB rings + Endpoint Analytics appear in the portal unassigned, descriptions carrying their OIBID; Read the tenant again \u2014 every created one reads up to date.",
        "T27 gap report: \ud83d\udcdd Gap report (Markdown) downloads a table with the counts, '(by OIBID)' on token matches, and the would-be-imported list.",
        "cfdev gate on cloudfellows.dev: the rail offers all four; Upstream carries 'Use the bundled OpenIntuneBaseline v3.8' beside the zip loader; without a CloudFellows Windows catalog the diff is refused in the note; after \ud83e\uddec Export and a re-open the diff renders 73 rows, driver profiles unticked with 'no create path'; the loaded-zip road additionally offers '\u2b07 Community catalog file'. Sign out, sign into another tenant: Compare only, the upstream host hidden.",
        "T24 with intune-my-macs selected: its 21 policies read 'present' (never 'up to date' \u2014 no versions) and there is no 'not in baseline' card; Import dry run plans 21 creates under their upstream names.",
        "Suites (outside the repo): platformbaseline-tests.js 89/89 (engine, both specs, cleanBody against the real OIB exports, the bundled files regenerated through the engine and compared policy for policy), baseline-dom-tests.js 49/49 (both screens under jsdom: rail, seg, OIBID badge, import copy, dry run, cfdev gate, T24 ids)."
      ],
      files: ["js/platformbaseline.js", "js/winbaseline.js", "js/macbaseline.js", "js/oibWindowsData.js", "js/immMacosData.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
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
      tools: ["T01 AppLocker", "T04 Backup/Restore/Verify"], builds: [10553, 10555, 10557, 10560, 10562, 10563, 10564, 10567, 10568, 10569, 10570], risk: "medium",
      why: "The T01-vs-AaronLocker review (scripts/REVIEW-AaronLocker.md) named three places AaronLocker's defaults were better and one gap neither tool covered. All four are now closed in Invoke-TunoAppLockerScan.ps1 v1.9.0: PE-header sniffing on by default with a never-executable extension list as the guard; Microsoft-signed artifacts keep their product name at Publisher granularity; the LOLBin exceptions ride as publisher conditions resolved on the scanned machine; and every executable file inside an admin-only directory has its own DACL evaluated (writable FILES, new bundle section, new evidence-card table). Separately, the App Control review found the GPO XML export could carry an empty NotConfigured collection \u2014 the exact shape Microsoft documents as a no-boot when merged with Intune's Managed Installer rule \u2014 so exportXml() now drops them and the subtitle says so. Medium risk because the scanner change is unrun on Windows in this session (parse-checked under pwsh 7.4, rule generation unit-tested on Linux) and the default-on file check adds one DACL read per executable file; it graduates when a real scan on a reference image confirms timing and the bundle shape.",
      test: [
        "Run Invoke-TunoAppLockerScan.ps1 v1.9.1 on WINDOWS POWERSHELL 5.1, unelevated, on a machine with no user-writable executable files: it gets past the writable-directory walk (v1.9.0 died there with 'Argument types do not match' at the empty writable-files list) and completes; a run on PowerShell 7 completes too.",
        "Break something on purpose (e.g. point -Path at a file instead of a directory, or throw from a function): the scanner prints [fail] with the message and a script stack naming the line, then stops.",
        "Scan with v1.10.0 (defaults) and upload the bundle: the Microsoft app coverage card shows OneDrive (per-user), classic Teams and the Defender platform ALLOWED via the three 'TUNO coverage:' rules, no Add allow rule buttons, no 'predates' notice; the Rules card lists the three under Exe; the Defender path rule sits at Info, not Medium. Scan with -NoMicrosoftCoverage: the three are red again and the scan card says the switch was used.",
        "Upload a v1.9.x bundle: the scan card says the bundle predates the coverage rules and names the script version. Click the three fixes, then upload any bundle again: the scan card says 3 edits were discarded and why, and the three rows are red again.",
        "Enforce naming and the collision stop (10570): with audit V4.0.1 deployed and the name field on V4.0.2, the 3-of-3 line reads 'created as … (Enforced) - R27.1 - V4.0.1'; Create the Enforce profile creates exactly that under the same grouping with no 'in the way' stop; the portal shows both profiles; create again: stopped on the Enforced profile already there.",
        "Gate 3 judged against the draft (10569): upload a scan whose log holds audited executions that this draft allows (Program Files, or a coverage rule added): gate 3 reads 'N covered (would run)' and passes; one whose log holds a signed executable from C:\\Tools the draft has no rule for: gate 3 reads '1 would still be blocked from machine space — GAPS' and the Findings card carries it with an Allow fix; apply the fix: gate 3 passes without a re-scan. A user-profile block reads 'by design' and does not lock the gate. A pre-entries bundle (summary only) says it cannot judge and asks for a re-scan.",
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

