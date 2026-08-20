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
  // Verified against `git show main:js/version.js` — main is at build 5.
  // Promotions: items 1-13 (beta 10301-10317) as build 3, items 14-19
  // (10318-10323) as build 4, and items 20-29 (10324-10336) as build 5.
  //
  // THE QUEUE IS EMPTY. Every tool on this channel is also in production, and
  // the only differences left are the two permanent ones in staying[]. An
  // empty queue is a state worth keeping: it means "beta and main match", and
  // the next item added is the whole of the next promotion.
  productionBuild: "v1.0.5",

  items: [
    {
      n: 31,
      title: "The scan no longer throws itself away",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10344],
      risk: "high",
      what: "Invoke-TunoAppLockerScan.ps1 crashed at the last step of a real run, after the permission walk, the artifact inventory and the event read had all completed, and wrote nothing to disk. Cause: the per-collection rule counts were stored with $counts[$type] = <Int32> into an [ordered] dictionary. OrderedDictionary exposes both this[int] and this[object], so PowerShell compiles the indexed assignment into a runtime choice between them — and Expression.Condition refuses to compile that choice when the stored value is a VALUE type, throwing \"Argument types do not match\" with no line number and TargetSite 'Condition'. Storing a reference type is fine, which is why every other ordered assignment in the script worked and only this one failed. It uses .Add(object, object) now. Separately and more importantly, rule generation is wrapped: a failure there is caught, recorded in the bundle's warnings with its originating line, and the bundle is written anyway with generatedPolicy null. The XML writes are gated on $generated rather than on -SkipRuleGeneration, so a null policy cannot throw at the file step either.",
      why: "HIGH — this is a fix to the one thing in TUNO that runs on a production endpoint, and it is a fix for a fault that only appeared on a real machine: no headless test could have caught it, because there is no PowerShell runtime in the environment this is built in. It has been reasoned to ground from a stack trace off Mihai's own device rather than reproduced, so the fix is verified by argument, not by execution. It graduates when a full scan completes end to end and writes all three files.",
      test: [
        "THE ONE THAT MATTERS: run the full scan that failed — the same -Scope arguments, on the same machine — and confirm it now prints the per-collection rule counts and writes all three files. The counts are the exact line that threw; if they print, the compile-time fault is gone.",
        "Run it on Windows PowerShell 5.1 AND on PowerShell 7. The defect is a 5.1 expression-compiler behaviour, so 7 may well have passed all along — a green run on 7 alone proves nothing about the fix.",
        "Force rule generation to fail and confirm the bundle is STILL written. Easiest way: rename the AppLocker module out of reach, or point -Path at something pathological. You should get a red 'Rule generation failed - but the scan itself is intact' block, a bundle on disk, and NO Audit/Enforce XML. This is the half that matters more than the crash itself.",
        "Upload that failed-generation bundle to T01. It must open, fall back to the device's effective policy, and show the writable paths, the artifacts and the event analysis. If T01 refuses it, the evidence-only path has regressed and the resilience is worth nothing.",
        "Check the bundle's warnings array contains the failure text AND the line it came from. A recorded failure with no location is a bug report nobody can act on.",
        "Confirm a NORMAL run is unchanged: three files, generatedPolicy populated, rulesByCollection carrying one entry per collection in order. The counts moved from an indexer to .Add(); ordering must survive, because the bundle is read by T01 and by a human.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 30,
      title: "The code panel is themed, and three cards open full screen",
      tools: ["\ud83d\udd10 AppLocker builder & validator"],
      builds: [10342],
      risk: "low",
      what: "The code panel and .al-code drop every hardcoded navy value for tokens: --warn-* in light (the same family as the deploy card beside it) and --ok-* in dark, switched by BOTH the explicit dark theme and the prefers-color-scheme block. Fs, ENCA's near-fullscreen popout, is ported into js/app.js with its markup in index.html; the code panel, #alFindings and #alCoverage each get a button that parks the CARD rather than the table, because render() replaces the table and keeps the card. Coverage loses its trailing action column \u2014 the fix button moves under the detail it acts on, as findings' did in 10312 \u2014 and both tables take proportional column widths instead of letting the longest sentence size them.",
      why: "LOW \u2014 presentation and a ported module; no analysis, serialisation or export logic touched. Two things deserve a real look rather than a glance: the popout MOVES elements, so anything parking something a renderer replaces breaks on close; and the theme switch needs both dark blocks, because the app supports an explicit dark choice AND following the device, and a rule written for one leaves half the users on a cream panel in a dark room.",
      test: [
        "Open the code panel full screen, then press Copy and Download, switch between Policy XML and Intune profile, and edit the profile name. All of it must work \u2014 anything dead means something is being cloned rather than moved.",
        "THE ONE THAT MATTERS: open Findings full screen and apply a fix from inside it. The table must redraw in place and the panel stay open. Close it and the card must be back in the left column, in its original position, with the page scrollable again.",
        "Open one, then open another without closing the first. The first must return to the page rather than vanish \u2014 only one is ever parked.",
        "Close it three ways: Escape, a click on the backdrop, the button. A click INSIDE the panel must not close it.",
        "Light theme, dark theme, and the system theme with the app set to Auto. Cream in light, green in dark, never a bright slab on a dark page \u2014 and the command snippets in step 5 must match the panel.",
        "Narrow the window until the coverage table needs a sideways scroll, then find Add allow rule without scrolling. Same for a fix button in Findings.",
      ],
      files: ["css/app.css", "js/app.js", "js/applocker.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
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
