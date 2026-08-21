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
    {
      n: 36,
      title: "The popout scrolls, and a download can be one collection",
      tools: ["\ud83d\udd10 AppLocker builder & validator"],
      builds: [10350],
      risk: "medium",
      what: "Two fixes and one addition. (1) .fs-body > .fs-in had one blanket height:100%, which on a .list-card \u2014 which sets overflow:hidden \u2014 clipped everything past the fold with no scroll. Split in two: .al-xml takes the height and its .al-xml-code becomes the scroller (flex:1, min-height:0, overflow:auto); a .list-card gets height:auto and overflow:visible so the panel body scrolls it. (2) A part selector (#alDlPart) beside Download lists every collection carrying rules; Download and Copy both follow it, and renderCodePane narrows the panel, the filename and the subtitle to match. (3) The two tabs produce different artefacts for one collection: Policy XML gives a complete AppLockerPolicy document wrapping that collection, Intune gives the bare RuleCollection which is the OMA-URI value.",
      why: "MEDIUM \u2014 it changes what a download CONTAINS, and a file that is subtly not what was expected is worse than a button that fails. The XML wrapper is the specific risk: a bare rule collection looks plausible in an editor and is refused by both a GPO import and Set-AppLockerPolicy, so the wrapping has to be verified against a real import rather than by reading it.",
      test: [
        "THE ONE THAT MATTERS: download one collection from the Policy XML tab and IMPORT IT \u2014 Group Policy Management Editor, or Set-AppLockerPolicy -XmlPolicy. It must be accepted. A bare RuleCollection is not a policy; this is the check that proves the wrapper is right, and it cannot be done by looking at the file.",
        "Then take the same collection from the Intune tab and paste it into a custom OMA-URI setting in the portal. That one must be the BARE collection \u2014 if it arrives wrapped, the portal takes it and the device ignores it, which is the quiet kind of wrong.",
        "Open the code panel full screen on a long policy and scroll to the bottom. Then do the same with Findings and with Microsoft coverage. All three must reach their last row; before this build they showed the top and stopped.",
        "Pick a collection, then check the panel, the filename and the line under it all narrowed with it. Press Copy and paste somewhere: it must match what is on screen, not the whole policy.",
        "Load a policy with a single collection and confirm the selector hides itself rather than offering a choice of one.",
        "Add default rules to an empty collection and confirm it appears in the selector; undo and confirm it goes, and that the selection falls back to the whole policy rather than staying on something that no longer exists.",
      ],
      files: ["css/app.css", "js/applocker.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
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
