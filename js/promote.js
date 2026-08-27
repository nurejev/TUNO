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

