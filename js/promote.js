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
//   * `staying[]` records what is deliberately NOT promoted, so absence
//     reads as a decision rather than an oversight.
//
// This site's own version is APP_BUILD.label — never hand-maintain a beta
// build number here. Only `productionBuild` stays by hand, because the app
// cannot know what the other channel runs.
// ======================================================================
const PROMOTE = {
  productionBuild: "v1.0.1",

  items: [
    {
      n: 3,
      title: "The audit's recommendations became buttons",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10305],
      risk: "medium",
      what: "Each finding gains a fix button driven by its own recommendation. Mechanical recommendations apply in one click (set enforcement, add the Microsoft default rules, add an absent collection); judgement recommendations open the offending rule prefilled — principal, path, or publisher/product/binary/version — with tighten-path, replace-with-publisher and delete as approaches, and refuse to apply on a blank publisher or a malformed SID. A ruleless collection is never offered a straight Enable (it would block the type outright) but AuditOnly or the default rules first. Every policy mutation in the tool, new and pre-existing, now goes through one undo step named for what it did. Findings also carry the offending rule's id, so the risky-rule marker matches on id instead of on rule name.",
      why: "MEDIUM — the audit's verdicts are untouched, but this is the first thing in TUNO that rewrites an imported policy from the findings table, so it wants clicking through on the beta site against a real GPO export before production. 66/66 headless DOM tests pass, including an XML round-trip after a rewrite. Note what it does NOT do: adding the Microsoft default rules trades enforcement findings for rule findings, because the audit flags the default `*` rule scoped to Administrators as High — an existing verdict, unchanged here, and worth a decision of its own.",
      files: ["js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 2,
      title: "TUNO wears its own face",
      tools: ["All tools"],
      builds: [10302, 10303, 10304],
      risk: "low",
      what: "The TUNO office logo (light + dark variants from the Website-Limon-IT icon set) replaces the Limon-IT mark in the header, on the sign-in screen and as the favicon; alt text follows. 10303 reworks the assets: background rect removed (transparent), viewBox cropped to the emblem, favicon cut to the medallion alone, sign-in mark drawn at 132px. 10304 versions every logo/favicon reference (?v=2 — bump when the artwork changes) so cached pre-fix art cannot survive a deploy. The roadmap gains R04 (Group Analyzer, ENCA T19 Intune-adjusted) and R05 (Change audit, ENCA T16 → deviceManagement auditEvents) — the cards travel with this item as documentation, they are not the item. Promote both builds together.",
      why: "LOW — assets and markup only, no logic. Graduates on sight: check the mark reads at 34px in the header and that dark mode swaps correctly.",
      files: ["assets/logo-mark-light.svg", "assets/logo-mark-dark.svg", "assets/favicon.svg", "index.html", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 1,
      title: "The tab bar is ENCA's tab bar",
      tools: ["All tools"],
      builds: [10301],
      risk: "low",
      what: "The shell's tool bar replaced with ENCA's browser-style tab bar, ported verbatim: home icon button, pill tabs only for opened tools with a close cross each, ＋ menu, ✕ all, Help pinned right; bar hidden on the tools home. The old strip was an unstyled always-visible button list that dragged the tiles' NEW/BETA tag text into its labels.",
      why: "LOW — pure shell cosmetics/navigation, no tool logic touched. Graduates once it has been clicked around on the beta site.",
      files: ["js/app.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
  ],

  staying: [
    {
      title: "🚚 This promotion queue",
      why: "Beta-only by design — js/promote.js and the Help section that renders it exist to describe the gap, so they have no meaning in production.",
    },
  ],
};
