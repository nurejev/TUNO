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
//   * `staying[]` records what is deliberately NOT promoted, so absence
//     reads as a decision rather than an oversight.
//
// This site's own version is APP_BUILD.label — never hand-maintain a beta
// build number here. Only `productionBuild` stays by hand, because the app
// cannot know what the other channel runs.
// ======================================================================
const PROMOTE = {
  // Verified against `git show main:js/version.js` — main is at build 2.
  productionBuild: "v1.0.2",

  items: [
    {
      n: 3,
      title: "The audit's recommendations became buttons",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10305],
      risk: "medium",
      what: "Each finding gains a fix button driven by its own recommendation. Mechanical recommendations apply in one click (set enforcement, add the Microsoft default rules, add an absent collection); judgement recommendations open the offending rule prefilled — principal, path, or publisher/product/binary/version — with tighten-path, replace-with-publisher and delete as approaches, and refuse to apply on a blank publisher or a malformed SID. A ruleless collection is never offered a straight Enable (it would block the type outright) but AuditOnly or the default rules first. Every policy mutation in the tool, new and pre-existing, now goes through one undo step named for what it did. Findings also carry the offending rule's id, so the risky-rule marker matches on id instead of on rule name.",
      why: "MEDIUM — the audit's verdicts are untouched, but this is the first thing in TUNO that rewrites an imported policy from the findings table, so it wants clicking through on the beta site against a real GPO export before production. 66/66 headless DOM tests pass, including an XML round-trip after a rewrite. Note what it does NOT do: adding the Microsoft default rules trades enforcement findings for rule findings, because the audit flags the default `*` rule scoped to Administrators as High — an existing verdict, unchanged here, and worth a decision of its own.",
      test: [
        "Load the built-in sample policy (Exe=Enabled, Msi=AuditOnly, Script=NotConfigured, Appx absent) and run the audit. Every finding must carry either a fix button or a stated reason it has none — a recommendation with no button and no explanation is the failure this item exists to remove.",
        "THE ONE THAT MATTERS: click a mechanical fix (set Msi to Enabled), then ↩ Undo. The policy must return byte-for-byte to what it was — export the XML before and after and diff them. One undo step is the whole safety net; if it does not restore exactly, nothing else in this item is safe to promote.",
        "On the Script collection (NotConfigured, zero rules): the fix must NOT offer a straight Enable. It must offer 'Set AuditOnly' and 'Add default rules first', and each button's tooltip must say enabling now would block every script. A bare Enable here bricks the type on the endpoint.",
        "On the absent Appx collection: 'add collection' must create it WITH default rules and pick its mode from whether rules landed (Enabled if they did, AuditOnly if not). Re-run the audit — the Info finding for that collection must be gone, not merely greyed.",
        "Open a judgement fix on a path rule and confirm it opens PREFILLED with the offending rule's principal and path, offering tighten-path, replace-with-publisher and delete. Blank the publisher and press Apply: it must refuse. Type a malformed SID in the principal and press Apply: it must refuse. Both refusals must name what is wrong, not just do nothing.",
        "Rename two rules to the SAME name, then fix one: only that rule may change. Findings carry the rule id now, so the risky-rule marker must follow the id — if the twin also changes, the id match has regressed to a name match.",
        "Apply 'Add the Microsoft default rules' and re-run the audit. Expect enforcement findings to be REPLACED by rule findings — the default `*` rule scoped to Administrators is flagged High by design. Confirm that is what you see; if the finding count simply drops to zero, the audit is no longer looking at the rules it just added.",
        "After a rewrite, export XML and re-import the exported file: the audit verdicts must be identical to the ones on screen before the export. Then export Markdown and confirm it describes the rewritten policy, not the imported original.",
        "NOT COVERED BY THE HEADLESS TESTS, and the reason this item is held: click all of the above against a REAL GPO export from a customer, not the sample. The 66/66 run proves the rewrite logic, not that real-world policies parse into rules the fix buttons can address.",
      ],
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
      test: [
        "Load the site in light mode: the header mark must read as the TUNO emblem at its rendered 34px, not as a smudge. Switch the theme to dark and confirm the mark swaps to the dark variant — a light mark left on a dark header means the CSS content: swap did not fire.",
        "Sign out and look at the sign-in screen: the mark must be drawn at 132px and have NO background box or padding around it. A visible rectangle means the untrimmed viewBox survived.",
        "Check the favicon in a browser tab and in a bookmark: it must be the medallion alone, legible at 16px. The full emblem here reads as a blob and is the reason the favicon was cut separately.",
        "THE ONE THAT MATTERS: hard-refresh is not the test — a normal visit is. Open the beta site in a profile that saw the OLD Limon-IT mark, without clearing the cache. The TUNO mark must appear. If the old art survives, the ?v= on the artwork references is missing or was not bumped, which is the entire point of build 10304.",
        "View source and confirm EVERY logo/favicon reference carries ?v=2 — header, sign-in, favicon link. One unversioned reference is enough to serve stale art.",
        "Confirm the logo's alt text names the PRODUCT, not the signed-in org: sign in to a tenant whose name differs from TUNO and read the alt text.",
        "Open ❓ Help → roadmap and confirm R04 and R05 are present with those numbers. They are documentation travelling with this item, not the item — but a renumbered card is a permanent mistake, so check the numbers rather than the prose.",
      ],
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
      test: [
        "Land on the tools home: the tab bar must be HIDDEN. It appears only once a tool is open — a bar showing an empty tab strip on the home screen is the old always-visible strip.",
        "Open 🔐 AppLocker builder & validator: one pill tab appears, labelled from the tool list WITH its emoji. THE ONE THAT MATTERS: the label must NOT contain the word BETA or NEW. The old strip scraped the tile and dragged its tag text into the label; this is exactly the regression the port fixed.",
        "Click the home icon: it returns to the tools home and the bar hides again, but the open tab must SURVIVE — go back into the tool and it is still the same tab, not a second one.",
        "Open a second tool from the ＋ menu. With two tabs open, ✕ all must appear; with one, it must not.",
        "Close a tab with its own ✕: only that tab goes, and focus moves to a remaining tab rather than leaving a blank tool host.",
        "Confirm Help is pinned right and stays there as tabs are added until the bar overflows. Then narrow the window to phone width and confirm the bar scrolls or wraps rather than pushing Help off-screen.",
        "Reopen an already-open tool from the ＋ menu: it must focus the existing tab, not create a duplicate.",
      ],
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
