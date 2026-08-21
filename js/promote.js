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
  // Verified against `git show main:js/version.js` — main is at build 6.
  // Promotions: items 1-13 (beta 10301-10317) as build 3, items 14-19
  // (10318-10323) as build 4, items 20-29 (10324-10336) as build 5, and
  // items 30-35 (10342, 10344-10348) as build 6.
  //
  // THE QUEUE IS EMPTY. Every tool on this channel is also in production, and
  // the only differences left are the two permanent ones in staying[]. An
  // empty queue is a state worth keeping: it means "beta and main match", and
  // the next item added is the whole of the next promotion.
  productionBuild: "v1.0.6",

  items: [
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
