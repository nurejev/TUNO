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

