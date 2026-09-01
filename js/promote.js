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
  // THE QUEUE IS EMPTY. Every tool on this channel is also in production;
  // the only differences left are the two permanent ones in staying[]. An
  // empty queue is a state worth returning to: it means "beta and main
  // match", and the next item added is the whole of the next promotion.
  productionBuild: "v1.0.13",

  items: [
    {
      n: 135, title: "\ud83d\uddfa The layout round \u2014 Option A: the rail everywhere a long tool benefits",
      tools: ["T26 Compliance evidence", "T13 Compliance report", "T17 Multi-admin approval", "T08 Assignment what-if", "T16 Firewall & ASR coverage", "T12 Setting conflict scan", "T09 Assignment health", "T18 Windows LAPS audit", "T14 Assignment filters", "T22 Group migration", "T23 Restricted AUs", "T02 Group Analyzer", "T06 Device analyzer"], builds: [10538, 10539, 10540, 10541, 10542, 10543, 10544], risk: "low",
      why: "One decision, taken once on the mockup (2026-09-01): tools that stack many result sections adopt the posture tool's sticky left rail (shared ep-rail chrome) so jumping to a section or back to a filter is a click, not a scroll; the lighter tools get the T19 fixes \u2014 static filter bars and popouts instead of inline expansions. Ships tool by tool on beta; promotes as ONE item because half a layout language in production is worse than none. Graduates when the converted tools read naturally on a live tenant and nothing lost a capability in the move.",
      test: [
        "Per converted tool on beta: the rail is sticky beside the pane, every section that used to render stacked is reachable as a node with a truthful count, and the pane swaps without losing filter state.",
        "Narrow window: the rail collapses to the wrapping strip (the shared CSS's own breakpoint) and nothing overflows.",
        "Every tool's own suite stays green after its conversion \u2014 the pass counts are in the build messages.",
        "Exports are unchanged by the layout \u2014 the MD/CSV of a converted tool matches its pre-conversion content for the same tenant.",
      ],
      files: ["js/complianceevidence.js", "js/compliance.js", "js/maa.js", "js/whatif.js", "js/endpointsec.js", "js/conflict.js", "js/health.js", "js/laps.js", "css/app.css", "js/groupmigrate.js", "js/restrictedau.js", "js/groupuse.js", "js/devicewhy.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
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
      files: ["js/defender.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
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
      files: ["js/endpointsec.js", "js/conflict.js", "js/health.js", "js/laps.js", "css/app.css", "js/groupmigrate.js", "js/restrictedau.js", "js/groupuse.js", "js/devicewhy.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
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

