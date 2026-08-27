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

