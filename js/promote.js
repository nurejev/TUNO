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
  // The queue was empty after build 6 and item 39 opens the next promotion. An
  // empty queue is a state worth returning to: it means "beta and main match",
  // and the next item added is the whole of the next promotion.
  productionBuild: "v1.0.6",

  items: [
    {
      n: 40,
      title: "What's new actually shows up",
      tools: ["All tools"],
      builds: [10356],
      risk: "low",
      what: "js/changelog.js has claimed since the scaffold that it feeds \"the What's new overlay shown after sign-in\". There was no overlay — the header text came across from ENCA and the feature did not. Added: a modal after enter(), listing only the releases newer than the build recorded in localStorage under tuno.changelog.seen. Nothing shows on a first visit (the current build is recorded silently). Opening the What's new page marks it seen. Escape and backdrop clicks close WITHOUT marking, so only 'Got it' and 'Read the full list' burn the notice. localStorage is guarded the same way the theme is, so private mode degrades instead of breaking. One test seam, window.openWhatsNewOverlayForTest, because the real entry point is behind MSAL.",
      why: "LOW — additive, on the shell rather than any tool, and it cannot block anything: the worst failure is a dialog that does not appear. It graduates once it has been seen firing on a real sign-in and dismissed, and once someone has confirmed a brand-new profile gets nothing.",
      test: [
        "THE ONE THAT MATTERS: sign in on a browser profile that has used TUNO before. The overlay must appear listing only builds newer than what you last read — not the whole changelog. If it shows everything, the stored build is not being read.",
        "Sign in on a FRESH profile (or clear tuno.changelog.seen). NOTHING must appear, and the key must be written silently. A new customer getting fifty builds of history between them and the tools is the failure this rule exists to prevent.",
        "Open it, press Escape, sign out and back in: it must come back. Then do the same with a click on the dark backdrop. Neither may mark it seen — losing a notice to a stray click is the one irreversible thing here.",
        "Press 'Got it' and sign in again: it must NOT come back. Then check the same for 'Read the full list', which should land on the What's new screen and also count as read.",
        "Open it at phone width and confirm it goes full-screen and the body scrolls, with the buttons still reachable. A modal you cannot dismiss on a phone is worse than no modal.",
        "Turn off site data (private mode, or block storage for the site) and sign in. The app must work and must not throw — the overlay may appear every session, which is the acceptable degradation.",
        "Check both themes: it is a dialog over the tools home and inherits the surface colours, so a light-on-light or dark-on-dark card would only show up here.",
      ],
      files: ["js/app.js", "css/app.css", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 39,
      title: "What the device already runs, and one grouping per profile",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10355],
      risk: "high",
      what: "Three related corrections about deploying, all from one question: what happens to a DLL collection that was already on the device when the new policy omits it. (1) A new carry-over check. analyzeCarryOver() parses the scan bundle's effectivePolicy and flags every collection the DEVICE is running that the policy on screen does not cover — absent or present-but-empty — High when those rules are enforcing today, with the removal procedure per delivery path and the reboot warning. (2) The grouping guidance was wrong in the dangerous direction: it told you to reuse one grouping across the audit and enforce profiles. Microsoft's AppLocker CSP page says grouping values must be UNIQUE, recommends a random GUID, and warns that duplicates break delete and unenrollment because the resource manager deletes duplicate URIs. Corrected in the tool tooltip, step 5, the converter's -Grouping help, the scripts README and the checklist, with the new instruction being one profile edited in place. (3) The CSP's automatic reboot on apply AND on delete was documented nowhere; it is now in the checklist and in step 5.",
      why: "HIGH — the grouping correction reverses advice already given, and anyone who followed the old version has two profiles sharing a grouping right now, which is a removal problem waiting rather than a visible fault. The carry-over check is new analysis on real customer policies and will fire on most brownfield estates, correctly. None of it changes what the policy CONTAINS, which is the one thing keeping this off critical.",
      test: [
        "THE ONE THAT MATTERS: take a device that already has an AppLocker policy, scan it, and upload. The audit must name every collection the device runs that your policy does not cover, and get the enforcing/not-enforcing call right for each. Check it against Get-AppLockerPolicy -Effective -Xml on that device by hand — this is new analysis and nothing else verifies it.",
        "Feed it a device whose effective policy has a collection set to NotConfigured WITH rules. It must come out High and say those rules are enforcing today. That combination is the whole reason the check exists.",
        "Load the effective policy itself as the working policy and confirm NO carry-over findings appear — every collection is by definition covered. A check that fires against its own input is noise.",
        "Confirm a policy that has the collection but EMPTY is still flagged, and that the wording distinguishes it: over the CSP an empty collection replaces the node, over GPO it merges and the device's rules survive. Both paths, one finding, and the text has to be right about both.",
        "If you have already deployed using the old same-grouping advice: check the tenant for two profiles sharing a grouping, and work out the removal order BEFORE unassigning either. That is the real-world cost of the wrong guidance and it is worth doing before this promotes.",
        "Re-read step 5 and the checklist section on grouping against Microsoft's AppLocker CSP page. The quote must be accurate and the instruction must be 'one profile, edited in place' — this document goes to customers.",
        "Confirm the reboot warning appears in both the checklist and step 5, and that it says apply AND delete. The rollback being noisy is the half people plan for least.",
      ],
      files: ["js/applocker.js", "scripts/AppLocker-Implementation-Checklist.md", "scripts/README.md", "scripts/Convert-TunoAppLockerToIntune.ps1", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 38,
      title: "The scan stops losing subtrees, and the AaronLocker review",
      tools: ["\ud83d\udd10 AppLocker builder & validator"],
      builds: [10354],
      risk: "medium",
      what: "Get-WritableDirectory converts paths to the \\\\?\\ extended form before listing and reading DACLs, and back before they reach a rule. A PathTooLongException on 5.1 was being counted as one unreadable directory when it actually skipped the whole subtree beneath. Attribute-read failures and reparse points are now counted and reported instead of silently skipped, and the single unreadable counter is split into four (DACL unreadable, listing failed, too long, attributes unknown) with a warning each. Also scripts/REVIEW-AaronLocker.md: a written comparison of the two designs. Script 1.5.0 to 1.6.0.",
      why: "MEDIUM \u2014 it changes which directories the scan finds, so it changes the generated rules. The extended-path form is the specific risk: it is accepted by the .NET path APIs and by DirectorySecurity, but that is reasoned from documentation, not observed, and if any call in the chain rejects it the walk would fail on EVERY directory rather than a few. NOT RUN ON WINDOWS.",
      test: [
        "THE ONE THAT MATTERS, AND IT HAS NOT BEEN DONE: run the scan on a real device, elevated, on 5.1 and on 7. Compare the writable-directory count against the previous build. It should go UP, not down \u2014 and if it goes to zero, the extended path form is being rejected somewhere in the chain and every directory is failing.",
        "Create a directory nested past 260 characters with a writable ACL at the bottom, and confirm it is found. That is the case this build exists for, and it cannot be tested any other way.",
        "Check the warnings: they must now distinguish permission-read failures from listing failures from paths too long from attributes unknown. Run non-elevated and confirm the counts move in the way you would expect.",
        "Confirm no path in the generated XML carries a \\\\?\\ prefix. AppLocker would take the rule and it would match nothing.",
        "Compare the writable directories found against AccessChk on the same machine (accesschk.exe -w -d -s). Where the two disagree, work out WHICH is right before trusting either \u2014 the review says we over-report on nested groups and that is the likely shape of any difference.",
        "Read scripts/REVIEW-AaronLocker.md against the current script. It makes four claims about our own code that were true when written; if any has drifted, the review is worse than no review.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Convert-TunoAppLockerToIntune.ps1", "scripts/REVIEW-AaronLocker.md", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 37,
      title: "The scan reaches AppLocker from PowerShell 7",
      tools: ["\ud83d\udd10 AppLocker builder & validator"],
      builds: [10352, 10353],
      risk: "medium",
      what: "Invoke-TunoAppLockerScan.ps1 gains Initialize-AppLockerModule. The AppLocker module is a Windows PowerShell binary module and PowerShell 7 cannot load it in-process, so a 7 run warned it was unavailable and derived every publisher from certificates. It now attempts Import-Module AppLocker -UseWindowsPowerShell on PS6+ on Windows, then TIMES one Get-AppLockerFileInformation call: over $script:AppLockerProxyBudgetMs (40) it returns 'compat-policy-only', which keeps the one-shot effective-policy read on the proxy and leaves the per-file path on certificate derivation. machine.appLockerSource records native / compat / compat-policy-only / unavailable, the per-file switch honours it, and T01's device card and Markdown report both show it. Script version 1.4.0 to 1.5.0.",
      why: "MEDIUM \u2014 and the risk is performance, not correctness. A proxied call is serialised across a process boundary and the scan makes one per file; if the budget is set wrong in the generous direction, a scan of a real estate could run for hours instead of minutes, which reads as a hang rather than a slow run. NOT RUN ON A REAL POWERSHELL 7 HOST \u2014 there is no Windows machine in the environment this was written in, so the import, the proxy behaviour and the threshold are all reasoned rather than observed.",
      test: [
        "THE ONE THAT MATTERS, AND IT HAS NOT BEEN DONE: run the scan under PowerShell 7 on a real Windows device, elevated. It must NOT warn that the module is unavailable, and the run must finish in the same order of time as a 5.1 run. If it crawls, the timing budget is too generous and the number in the script needs the measurement it admits it is missing.",
        "Run the same scan under Windows PowerShell 5.1 and diff the two bundles. The publisher and hash values should agree; where they do not, the proxy is losing something in serialisation and the per-file path should not be using it at all.",
        "Check machine.appLockerSource in the bundle and on the device card in T01. On 5.1 it must read native; on 7 it must read compat or compat-policy-only, and never claim native.",
        "Force the fallback: run 7 on a device where the compatibility session cannot start (constrained language mode, or the WinPSCompatSession blocked). It must warn and continue rather than fail, and the bundle must say publishers came from certificates.",
        "Confirm the effective-policy read works on 7 even when the per-file path has been dropped to certificates \u2014 that is the whole point of the split, and it is the case a quick test will skip.",
        "Load a bundle whose rule generation FAILED (or was skipped with -SkipRuleGeneration). The device card must say at the top that there is no generated rule set and that you are editing what the device was running \u2014 and every warning must be shown, not the first six. Without that, a failed generation looks like a scan that found nothing.",
        "Compare the rules generated by a 7 run against a 5.1 run of the same device. Unsigned binaries are the ones to look at: those need the Authenticode hash only Get-AppLockerFileInformation produces, and the script already refuses to write a rule from the flat SHA256.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Convert-TunoAppLockerToIntune.ps1", "js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 36,
      title: "The popout scrolls, and a download can be one collection",
      tools: ["\ud83d\udd10 AppLocker builder & validator"],
      builds: [10350, 10351],
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
        "Read the panel header at the narrowest width the split allows, and again with the panel popped out. The filename must stay on one line and clip if it has to; the actions may wrap to a second row but nothing may run off the right edge. 10351 fixed this after the selector made the header too crowded for one row \u2014 the failure mode was the filename being squeezed to a column of single words, which is what a flex child with no floor does.",
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
