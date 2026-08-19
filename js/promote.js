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
      n: 5,
      title: "T01 scans the device, and exports for Intune",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10308],
      risk: "high",
      what: "Two PowerShell scripts are served from the site under /scripts/ and offered as downloads inside T01. Invoke-TunoAppLockerScan.ps1 is a modern reimplementation of Microsoft AaronLocker's approach — native DACL evaluation with Deny ACEs honoured instead of Sysinternals AccessChk, JSON instead of Excel COM, running on PowerShell 5.1 AND 7 where AaronLocker hard-fails on anything but 5.1. It finds user-writable directories, inventories the executables in them with signer, version and hash, reads the AppLocker event logs, and emits an Audit policy, an Enforce policy and a JSON scan bundle. T01's import accepts that bundle alongside plain XML, renders a device-evidence card, and adds scan-derived findings (marked with a satellite) reached with the SAME rule evaluator as the Microsoft coverage table. The code panel gained a second tab producing an Intune windows10CustomConfiguration profile — one OMA-URI per collection, DLL forced NotConfigured — built from the same serialiser as the XML. Convert-TunoAppLockerToIntune.ps1 does that conversion on the command line, offline or via Connect-MgGraph, standalone with no customer-connection harness. The screen reads as five numbered steps with the deployment procedure written out. A .nojekyll file was added so Pages serves the .ps1 files verbatim.",
      why: "HIGH — this is the first thing TUNO has asked an admin to DOWNLOAD AND RUN on a production endpoint, and the first output it produces that is meant to be pushed into a tenant. Neither script has been executed: there is no PowerShell runtime in the environment this was built in, so both are unverified beyond review and a headless syntax pass. The DACL evaluation, the publisher-derivation fallback and the event parsing are the three places a mistake would be quiet rather than loud — a scan that under-reports writable directories produces a policy that looks clean and is not. Nothing graduates until both scripts have run end-to-end on a real device and a bundle has been round-tripped through T01 into a real tenant.",
      test: [
        "THE ONE THAT MATTERS, AND IT HAS NOT BEEN DONE: run Invoke-TunoAppLockerScan.ps1 elevated on a real Windows box, Windows PowerShell 5.1 first and then PowerShell 7. It must complete without a terminating error and write three files. Nothing else on this list means anything until this passes — the script has never been executed anywhere.",
        "Check the writable-directory result against Sysinternals AccessChk on the same machine: accesschk.exe /accepteula -nobanner -w -d -s %ProgramFiles%. The two lists should agree on the directories that matter. Where they differ, work out WHICH is right before trusting either — the whole policy rests on this answer, and our version deliberately honours Deny ACEs where AaronLocker's own ADS check does not.",
        "Pick three signed binaries and compare the publisher string in the bundle against Get-AppLockerFileInformation for the same file. They must match exactly, including case and field order. Then run the scan on a box WITHOUT the AppLocker module so the certificate-subject fallback is exercised, and compare again. A fallback that produces a publisher string AppLocker will not match generates rules that allow nothing, and nothing about that is visible until a user is blocked.",
        "Run it UNELEVATED. It must still complete, must record the partial run in the bundle warnings, and T01 must surface that as a finding. A quiet partial scan reading as a clean result is the exact failure this check exists for.",
        "Upload the bundle to T01. The device card must show the machine facts; the writable-path table's reachable column must mark at least one path; and that same path must appear as a satellite-marked finding naming the rule that reaches it. Then switch the source to the device's effective policy and confirm the verdicts change — if they do not, the switch is not reloading the policy.",
        "Open the Intune tab and import the downloaded JSON into a REAL tenant by POST to deviceManagement/deviceConfigurations. It must be accepted. Then read the profile back in the portal and confirm every OMA-URI value is a well-formed rule collection and that DLL reads NotConfigured. A profile Graph accepts but the CSP rejects on the device fails silently, which is the worst way for this to fail.",
        "Assign the audit profile to ONE pilot device, confirm AppLocker events appear, then re-scan that device and upload the new bundle. The event section must show what the policy did. This is the loop the whole feature exists to close and there is no other way to check it.",
        "Blank the grouping in the Intune tab: the panel must say the OMA-URI has no identity. Then use the SAME grouping for an audit and an enforce profile and confirm on a device that the second replaces the first rather than stacking. The grouping is the policy's identity on the endpoint and getting it wrong is the expensive mistake in this whole feature.",
        "Run Convert-TunoAppLockerToIntune.ps1 offline against the XML the scan wrote, and diff its JSON against what T01's Intune tab produces for the same policy and grouping. They must agree. Two implementations of one conversion that disagree means one of them is shipping something nobody reviewed.",
        "Download both scripts from the beta site and confirm the bytes match the files in git — Pages must not have transformed them, which is what the new .nojekyll is for. Check the copy-command box shows the beta host rather than tuno.limon-it.nl.",
        "Confirm the tool still works with NO scan at all: import a plain GPO export and check every pre-existing behaviour — audit, coverage, one-click fixes, undo, XML panel, XML export, Markdown export — is unchanged, and that no satellite findings appear.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Convert-TunoAppLockerToIntune.ps1", "scripts/README.md", ".nojekyll", "index.html", "css/app.css", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 4,
      title: "The XML is on screen while you edit the policy",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10307],
      risk: "medium",
      what: "T01's screen splits in two: audit, enforcement, coverage, findings and rules on the left; a sticky, syntax-coloured AppLockerPolicy.xml panel on the right, redrawn from exportXml() on every mutation. Copy and Download XML move onto that panel; Export MD stays in the toolbar. The panel collapses below the audit under 1100px. The colouriser escapes the XML first and matches only on the escaped form, so a rule name carrying an angle bracket cannot reach the DOM as markup. Copy says so on the button when the clipboard is refused rather than appearing to have worked. Layout borrowed from applockergenerator.vercel.app; the parts of it that show one collection at a time and have no audit were deliberately not borrowed.",
      why: "MEDIUM — no analysis or rewrite logic changed, but this is the tool's whole screen, and the panel is a second surface claiming to show what you are about to ship. It graduates once the claim has been checked against the downloaded file on a real policy, at a real window width, on both themes.",
      test: [
        "Load the sample policy. The panel must appear on the right with the header reading AppLockerPolicy.xml and a subtitle giving the rule and collection counts — check those two numbers against the summary line above the audit; they come from the same policy object and disagreeing means one of them is stale.",
        "THE ONE THAT MATTERS: press Download XML, then Copy, then diff the downloaded file against the clipboard AND against what the panel displays. All three must be identical. The panel renders from exportXml() precisely so it cannot drift — if it has drifted, a second serialiser has been introduced and the preview is lying about what the GPO will get.",
        "Apply a fix (set Msi to Enabled), add a rule, delete a rule, change an enforcement dropdown, then ↩ Undo each. The panel must move on every one of those, including the undo. A panel that updates on fixes but not on the enforcement dropdown means render() is being bypassed somewhere.",
        "Import a policy containing a rule whose NAME has an angle bracket or an ampersand in it (edit one into an export by hand if no customer policy has one). The panel must show it as text — angle brackets visible, colouring intact — and the page must not break. This is the injection check; the colouriser escapes before it matches.",
        "Drag the window from wide to below 1100px: the panel must move underneath the audit rather than narrowing, and stop being sticky. At full width it must stick while the left column scrolls, and scroll inside itself when the policy is longer than the viewport.",
        "Switch between light and dark theme. The panel stays dark in both on purpose — confirm that reads as deliberate and that the Copy and Download buttons are legible in both.",
        "Confirm ⭳ Export XML is gone from the top toolbar and Export MD is still there, and that Export MD still produces the findings report. Removing the toolbar button is the one thing here an existing user will notice.",
        "Deny clipboard access (a private window or a browser with the permission blocked) and press Copy: the button must say it was blocked and point at Download, then return to its normal label. It must not sit there reading 'Copied'.",
        "Load a large real policy — several hundred rules — and confirm the panel does not make editing sluggish. It re-serialises the whole policy on every render; if that is felt, it needs debouncing before production.",
      ],
      files: ["index.html", "css/app.css", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
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
