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
  // The queue was empty after build 6 and item 36 opens the next promotion. An
  // empty queue is a state worth returning to: it means "beta and main match",
  // and the next item added is the whole of the next promotion.
  productionBuild: "v1.0.6",

  items: [
    {
      n: 45,
      title: "A refresh no longer costs you an MFA prompt",
      tools: ["All tools"],
      builds: [10361],
      risk: "high",
      what: "Two auth defects. (1) authInitInner() only adopted an account from handleRedirectPromise(), which returns one only just after a redirect completes — so an ordinary F5 found nothing and dropped to the sign-in screen with a live session still in the sessionStorage cache underneath. It now falls through to getAllAccounts()/getActiveAccount() and restores; more than one account with none active still asks, because guessing signs you into the wrong customer. (2) loginPopup and loginRedirect both passed prompt:'select_account', which forces a fresh authorization and makes the IdP re-run its policy — MFA — on every entry. Removed; Sign out already covers account switching, and it now also clears the active account so the next sign-in cannot silently reuse the one just left. A new adopt() sets the MSAL ACTIVE account alongside the local one, which acquireTokenSilent in js/graph.js needs or it re-prompts anyway. Separately, T01's left column is reordered: enforcement modes and the add-rule form above the evidence, coverage, findings and rule list.",
      why: "HIGH — it changes the sign-in path for every tool, and sign-in is the one thing that fails closed for everybody at once. The upside is large (an MFA prompt per refresh is why nobody refreshes) but the risk is in the cases the headless tests can only simulate: a real redirect flow, a real multi-tenant consultant laptop, and a real Conditional Access policy. It graduates when it has been signed into two customer tenants in turn without either leaking into the other.",
      test: [
        "THE ONE THAT MATTERS: sign in, then press F5. You must land back on the tools with no prompt at all. That is the whole bug.",
        "Then CLOSE the tab and reopen the site. You must be asked to sign in — the cache is sessionStorage on purpose, and a refresh surviving must not turn into a session that outlives the tab.",
        "Sign out, then sign in again. Confirm you are asked, and confirm you can reach a DIFFERENT account — the chooser was removed and Sign out is now the only route to it. If you cannot switch tenants this way, the removal was the wrong call and needs a Switch account action instead.",
        "On a laptop with two customer tenants: sign into A, sign out, sign into B, refresh. You must stay in B. Any leak of A here is the failure that matters most and no test in the repo can see it.",
        "Open a tool that needs an incremental scope (T02 or T06) after a refresh-restored session. The token must be acquired silently — if it prompts, setActiveAccount is not taking effect and the restore is only cosmetic.",
        "Try the no-popup link so the REDIRECT path runs end to end. handleRedirectPromise still has to win over the cache branch; a redirect that lands on the sign-in screen means the ordering regressed.",
        "In T01: confirm the enforcement card and the add-rule form are above the coverage and findings, that adding a rule still works from its new position, and that the rule list still renders below. The form moved hosts; its ids and wiring did not.",
      ],
      files: ["js/app.js", "js/applocker.js", "index.html", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 44,
      title: "Assignment editor — bulk changes behind four gates",
      tools: ["✏️ Assignment editor"],
      builds: [10360],
      risk: "high",
      what: "T11, after Maxime Guillemin's Intune-Toolkit (MIT). Add include / add exclude / remove a group across device configurations, settings catalog, compliance and ADMX — the four surfaces under the write scope the registration already holds; scripts and apps deliberately absent (each is a new write scope, the R18 rule). Pipeline enforced by the screen: read → dry run (group name + member count, empty-group warning, noops and REFUSALS listed — include-onto-excluding and exclude-onto-including are refused with T09's reasoning) → automatic backup file, apply locked until taken → removals confirmed by TYPING the group name → sequential writes, each preceded by a fresh read (drift = skip, never overwrite) and followed by a verify read-back. Untouched assignments re-serialised with filters preserved. No delete, no rename. Write scope asked at the apply click.",
      why: "HIGH — the second write tool and the first at scale. The mistake it enables is a policy reaching the wrong population, which is invisible until devices behave differently. The specific things that must be true: filters survive the round trip on untouched assignments, the drift check actually fires, and the verify is the tenant's read-back rather than the POST's status. All three are asserted headlessly; none of the three has touched a real tenant yet.",
      test: [
        "THE ONE THAT MATTERS: take a policy with TWO assignments, one carrying an assignment filter. Add an unrelated group. After the write, open the policy in the portal and confirm the filtered assignment STILL HAS ITS FILTER. Losing it silently widens the assignment — the worst thing this tool can do, and invisible in the tool's own table.",
        "Dry-run a removal and confirm apply stays locked until the backup is downloaded AND the group's name is typed exactly. Then restore from the backup file (POST /assign with the recorded list) and confirm the policy is back as it was — an untested backup is a hope, not a way back.",
        "Between dry run and apply, change the policy's assignments in the portal from another window. Apply must SKIP it as drifted, not overwrite. This is the two-admins case and nothing else exercises it.",
        "Add an include of a group the policy already excludes: the plan must REFUSE with the contradiction reason, not write. Then remove the exclusion and confirm the same operation now plans cleanly.",
        "Add an include of an EMPTY group and confirm the dry run says it configures nothing until somebody joins. The write should still be allowed — preparing a landing zone is legitimate — but never silently.",
        "Pull the network (or revoke the write scope) mid-apply with stop-on-failure on: the run must stop, the results table must say which policies were written-and-verified and which were not touched, and nothing may retry.",
        "Verify the scope prompt appears at the APPLY click and not at read or dry-run — plan a change without ever consenting to ReadWrite and confirm reads alone got you there.",
        "Confirm scripts and applications appear nowhere in the surface list, and that the screen says why.",
      ],
      files: ["js/assignedit.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 43,
      title: "Settings search — from the definition to the policy",
      tools: ["🔦 Settings search"],
      builds: [10359],
      risk: "medium",
      what: "T10, after Ugur Koc's IntuneAssignmentChecker (MIT). Search the settings-catalog definition catalog (~17k definitions, one beta read, held in memory per session) with ranked token matching, then optionally read the tenant's settings-catalog policies (the backup's N+1, pooled) to answer 'who sets it, to what value'. Usage column is ABSENT until read, never empty; child settings indexed under their own definition ids; values pass Docs.redactValue — the documenter's gate, one implementation. Reads only, one scope.",
      why: "MEDIUM — read-only and additive, but two things carry real risk: the redaction gate is now load-bearing for a second tool, and the catalog read is the largest single read TUNO makes (~17k objects), which is where throttling behaviour and memory actually get tested. A wrong 'nothing sets it' would also invite somebody to configure a duplicate.",
      test: [
        "THE ONE THAT MATTERS: search for a setting you know carries a secret (a Wi-Fi pre-shared key, an OMA-URI password) in a tenant that sets one, with usage read. The value column must show the redaction marker, not the value. If the value appears, do not promote — this is the disclosure-engine case.",
        "Read the catalog on a real tenant and note the count and the time. It should land in the tens of seconds, survive a 429 (watch for the throttle notice), and the page must stay responsive while searching afterwards.",
        "Search 'bitlocker recovery' and confirm ranked results: names starting with the term above names containing it, keyword hits below those. Then search a word that only appears in descriptions and confirm it still lands, ranked last.",
        "Pick a setting configured in exactly one policy as a CHILD of a choice setting and confirm usage finds it — the child-indexing is the part a naive walker misses.",
        "Before reading usage, confirm every result says 'not read' rather than 'nothing sets it'; after reading, confirm a genuinely-unused definition says 'nothing sets it'. Those are different sentences and both must appear in the right place.",
        "Make one policy's settings unreadable (RBAC-scope an account, or pick a tenant with a scoped role) and confirm the failure is named and the export says the usage column is missing that policy's settings.",
        "Platform filter: pick Windows and confirm macOS-only definitions drop out; clear it and confirm they return.",
      ],
      files: ["js/settingsearch.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 42,
      title: "Assignment health — what looks configured and is not",
      tools: ["🩺 Assignment health"],
      builds: [10358],
      risk: "medium",
      what: "T09, after Ugur Koc's IntuneAssignmentChecker (MIT). Six finding kinds over one assignment read: policies assigned to transitively EMPTY groups (one-row peek, batched), DANGLING references to deleted groups, UNASSIGNED policies (enrolment restrictions exempt — their defaults are unassigned by design), EXCLUDED-ONLY policies, one group included AND excluded on the same policy, and optionally FAILED deployments from the cheap per-policy status on device configurations, compliance, scripts and remediations — with the surfaces that keep status behind the reports API named as unchecked. GroupUse.intuneHits gained an opt-in `unassigned` flag keyed on the assignments array being empty; T02/T06/T08 pass nothing and are unchanged. Reads only.",
      why: "MEDIUM — read-only, nothing existing changes behaviour, but the shared reader was touched and the findings invite cleanup actions: a wrong 'empty group' or 'unassigned' row could prompt somebody to delete configuration that is actually live. The exemption list and the unknown-vs-empty distinctions are where a mistake would do real work.",
      test: [
        "THE ONE THAT MATTERS: create a test group with no members, assign a test policy to it, run. It must appear under empty-group findings. Add one member (or a nested group WITH a member), re-run, and it must disappear — transitively is the word being tested.",
        "Nest an empty group inside an empty group, assign to the parent, and confirm it still reads as empty — a direct-members check would pass it.",
        "Assign a policy to a group, delete the group, re-run: the assignment must land under dangling, not empty, and the two lists must not double-count it.",
        "Create a policy with no assignments and confirm it is found; then confirm the built-in enrolment restriction defaults are NOT listed — the exemption is deliberate and this is its test.",
        "Create a policy whose only assignment is an exclusion and confirm the excluded-only finding; add an include of the same group and confirm it moves to the include+exclude contradiction instead.",
        "Run with the deployment-status toggle on against a tenant with at least one known-failing deployment and confirm the counts match the portal's device status blade for that policy.",
        "Run T02, T06 and T08 after this change and confirm no unassigned rows appear in any of them — the flag is opt-in and this is the regression that matters.",
        "Revoke Group.Read.All consent (or run as a user without it) and confirm empty-group findings come back as UNKNOWN rather than as an empty list that reads clean.",
      ],
      files: ["js/health.js", "js/groupuse.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 41,
      title: "Assignment what-if — the delta before the change",
      tools: ["🔮 Assignment what-if"],
      builds: [10357],
      risk: "medium",
      what: "T08, after Ugur Koc's IntuneAssignmentChecker (MIT). Pick a user or a device, name a group, and see what joining or leaving would change: gained, lost, pre-excluded, unchanged — with 'lost by joining' (an exclusion on the group) called out, uninstall intents labelled as removals, filtered rows kept at 'may' in both directions, and tenant-wide targets excluded from the delta because membership does not move them. Joins carry the group's own transitive parents; leaves rebuild the closure from the remaining direct memberships; a membership held only through nesting says so instead of simulating an impossible removal. Compare mode: two to four groups side by side, differences only. Assignments read through GroupUse.SOURCES — no second endpoint list. Reads only.",
      why: "MEDIUM — a new read-only tool; nothing existing changes behaviour. The risk is an answer that is WRONG rather than missing: a simulation that overstates or understates a delta invites a membership change on bad evidence. The closure logic (join inherits parents, leave recomputes from remaining directs) is the part that most needs a real directory, because nested and dynamic groups are exactly where hand-reasoning fails.",
      test: [
        "THE ONE THAT MATTERS: take a user, pick a group with at least one policy assigned, and run the join simulation. Then actually add them, run T02 or T06 for the real answer, and compare. Every gained row must appear; anything that applied which the simulation did not predict is a miss worth a bug report. Remove them afterwards.",
        "Join a group that is EXCLUDED from a policy the user receives today. The policy must appear under LOST with 'an exclusion on this group takes it away' — this is the row the tool exists for.",
        "Simulate joining a group that is itself a member of a parent carrying assignments. The parent's policies must appear as gained, marked as coming through inheritance. A what-if that misses this understates every nested join.",
        "Simulate leaving a group the subject is only in through nesting. The tool must say the membership is inherited and produce an empty delta — not simulate a removal the portal cannot perform.",
        "Simulate leaving a group whose policies the subject ALSO receives through a second group. Those policies must NOT appear as lost — the closure rebuild is what this checks, and it is the easiest thing to get wrong.",
        "Pick a dynamic group and confirm the answer is labelled as conditional on the rule, for join and for leave both.",
        "Compare two groups with deliberately different assignments and confirm only the differences are listed, with the identical remainder counted. Then compare a group with itself via a parent-child pair and confirm the child column includes everything the parent's does.",
        "Run as a device subject on a machine with no Entra device id and confirm the refusal is explained rather than an empty answer.",
      ],
      files: ["js/whatif.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
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
