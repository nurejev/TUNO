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
      n: 12,
      title: "The Graph read layer — and a refactor of the write path to get it",
      tools: ["All tools"],
      builds: [10316],
      risk: "medium",
      what: "js/graph.js gains everything the roadmap's Intune tools need to read a tenant: paged reads that follow @odata.nextLink, 429/503/504 retry honouring Retry-After with an exponential fallback and a five-attempt ceiling, a bounded-concurrency pool for the one-request-per-object shape with errors captured per item, $batch at twenty per round trip with per-id 429 retry, GUID-to-name resolution through directoryObjects/getByIds in chunks of a thousand, and an OData tagged template that writes query STRUCTURE literally while escaping interpolated VALUES. A beta base constant, a page ceiling of 500, a throttle-notification hook, and read scopes split from write scopes as separate SCOPES entries so a read-only tool cannot reach the write scope by sharing a constant.\n\nTHE PART THAT IS NOT ADDITIVE: call() itself was refactored. Its URL now goes through a new safeGraphUrl() host guard, and token acquisition moved inside a send() closure so a retry re-acquires rather than reusing a token that may have expired during the wait. T01's deploy path — customProfiles, createProfile, assignProfile, searchGroups, memberCount — runs through that function and none of it passes retry, so its behaviour should be unchanged. \"Should be\" is why this is medium and not low.",
      why: "MEDIUM — nothing in this build CALLS the read layer; no tool uses it yet, so the new code is dead weight in production until R04 lands. The risk is entirely in the refactor underneath it. call() is the only path T01 has to the tenant, and it was changed in two ways that a browser will not complain about: every URL is now host-checked before a token is attached, and the token is fetched inside the retry closure rather than once at the top. If safeGraphUrl is wrong about a URL shape T01 builds, the deploy stops working — and the headless tests cannot prove that, because they cannot sign in. It graduates when someone has run T01's step 5 end to end against a real tenant on this build: create the profile, assign it to a pilot group, and see the member count come back.",
      test: [
        "THE ONE THAT MATTERS, and it needs a tenant: sign in and run T01 step 5 all the way through — collision read, create the custom profile, then assign it to a pilot group and confirm the member count renders. All five of those calls go through the refactored call(). If any of them now fails with \"Refused to send a tenant token to…\", safeGraphUrl is rejecting a URL shape T01 builds and the guard is wrong, not the caller.",
        "Check the /members/$count call specifically. It is the only call in the app that sends Accept: text/plain and ConsistencyLevel: eventual, and the only one whose successful response is not JSON. Confirm a number still comes back and not \"[object Object]\" — the non-JSON fallthrough in call() was not touched, but it is the path least like the others.",
        "Force a refusal and read what it says: sign in with an account that cannot create profiles and confirm the 403 still surfaces Graph's own message, code and request-id rather than a generic failure. The error path is downstream of the refactor and must be untouched.",
        "Confirm no retry happens on a write. There is no way to make Graph return 429 on demand, so read the code instead: createProfile, assignProfile and post() must not pass retry:true anywhere. A retried POST is the one thing this file's header promises does not happen.",
        "Open the Roadmap and the Help screens and check every source link opens the right repository — eleven external links were added and a wrong one is a miscredit, which is worse than a dead link.",
        "NOT COVERED, and worth saying: none of the read layer's throttling, paging or batching has run against a real tenant, because nothing calls it yet. The headless tests exercise it against stubs. The first tool to use it is R04, and that is when this code is genuinely proven.",
      ],
      staying: [
        "The roadmap cards (R03 moved up, R04/R05 rewritten, R06–R10 new) and the Credits & thanks section are documentation and are NOT queued — per this file's own rule they travel with whichever promotion happens next. They are listed here so their absence from the queue reads as the rule rather than an oversight.",
        "No tool consumes the read layer in this build. R04 is the first, and it is not written yet.",
      ],
      files: ["js/graph.js", "index.html", "css/app.css", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 11,
      title: "Enforcing is a decision, not a button",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10315],
      risk: "medium",
      what: "The one-click \"Set Enabled\" on an AuditOnly collection is gone. That finding's fix now opens a judgement panel listing what should be true before enforcing — time in audit covering a month-end, a patch cycle and a new starter; an event log with nothing unrecognised left; a coverage table reading allowed; a tested way back — and the admin picks the mode. Two adjacent routes to accidental enforcement closed with it: \"add the missing collection\" lands in AuditOnly instead of Enabled the moment a default rule appears, and a NotConfigured collection that already has rules steps to AuditOnly rather than straight to Enabled. The only enforcement change the tool still makes on its own is the one that blocks nothing. The DLL panel additionally states what enforcing DLL costs, matching what the scanner and the Intune export already do. Separately, the publisher check stops firing its two breadth heuristics on rules that name BOTH a publisher and a product: no upper version bound drops from Medium to Info with a recommendation explaining why pinning would break the vendor's next release, and a broad principal is no longer a finding on that shape. That combination is what T01's own coverage fix builds, so the tool was flagging the rule it had just recommended and marking it risky in the coverage table.",
      why: "MEDIUM — no analysis is weaker and nothing enforces that did not before; the change is that three paths which USED to enforce in one click no longer do, and one class of finding is scored lower. The severity change is the part to check: it moves verdicts on imported customer policies, not just on rules this tool wrote. It graduates once someone has run a real GPO export through it and confirmed the findings that disappeared are all publisher+product rules and that nothing broader went quiet with them.",
      test: [
        "Load the sample policy and confirm NO finding anywhere offers a button reading \"Set Enabled\". That is the whole item; if one survives, the route it belongs to was missed.",
        "THE ONE THAT MATTERS: click the fix on the AuditOnly Msi finding and confirm the policy does not move — the enforcement dropdown must still read AuditOnly and the XML panel must not change. A panel that opens AND applies is worse than the button it replaced, because it looks like it asked.",
        "In that panel, press Apply without touching the mode: it must refuse and say the mode is unchanged, and stay open. Then pick Enabled, apply, and confirm one Undo puts it back to AuditOnly exactly.",
        "Add the absent Dll collection from its finding. It must land in AuditOnly with default rules, NOT Enabled. Then open its enforcement panel and confirm it says what enforcing DLL costs and points at the scanner and export doing the same — this is the collection most likely to be enabled by someone who has not been told.",
        "On the NotConfigured Script collection: add the default rules, then check its fix offers AuditOnly and not Enabled. Three clicks from NotConfigured to enforcing was the chain this closes.",
        "Click the coverage fix for per-user OneDrive. The rule it adds must NOT then appear as a Medium finding, and must NOT carry the risky-rule tag in the coverage table. It must still appear at Info, and its recommendation must explain why an upper version bound would be wrong here rather than asking for one.",
        "Confirm the checks that should still fire do: a rule with Publisher='*' is still High, and an unscoped publisher rule is still asked for an upper version bound and still flagged for a broad principal. If those went quiet too, the scoped test is matching more than it should.",
        "NOT COVERED BY THE HEADLESS TESTS, and the reason this is held: run a REAL customer GPO export through it and diff the findings against build 10314. Every finding that disappeared should be a rule naming both a publisher and a product. Anything else that went quiet is a regression in the check, not the intended change.",
      ],
      files: ["js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 10,
      title: "The prose screens are centred",
      tools: ["All tools"],
      builds: [10314],
      risk: "low",
      what: ".help-page gains auto side margins. It caps the prose column at 920px, which is correct \u2014 1180px of running text is not readable \u2014 but with no auto margins the column sat against the left edge of a shell whose header and tab bar use the full 1180, so Help, What's new and the Roadmap all read as offset rather than centred.",
      why: "LOW \u2014 one CSS declaration. It graduates on sight, on the three screens that use the class.",
      test: [
        "Open Help, What's new and the Roadmap in turn and check each column is centred under the tab bar rather than hard left. All three share the class, so if one is right they all are \u2014 but look at all three anyway, because that assumption is exactly how the omission survived.",
        "Confirm the line length has NOT changed: the fix is the margins, not the measure. If the text now runs the full width of the shell, the cap has been removed by accident and the screens are harder to read than before.",
        "Check at a narrow window too, where the column is already the full width and the auto margins do nothing.",
      ],
      files: ["css/app.css", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 9,
      title: "Step 1 asks for one script, and the intro card matches its neighbours",
      tools: ["\ud83d\udd10 AppLocker builder & validator"],
      builds: [10313],
      risk: "low",
      what: "Convert-TunoAppLockerToIntune.ps1 moves out of step 1 and into step 5 option C, where it is actually used \u2014 it converts a finished policy and has nothing to do with scanning a device. Step 1 gains a line stating that no Sysinternals is needed and why: the scan evaluates DACLs natively with Deny ACEs honoured rather than shelling out to AccessChk.exe as AaronLocker does. body.wide .readme drops the 1180px cap that made the tool's intro card stop short of every card below it, keeping a 1100px measure on the paragraph inside.",
      why: "LOW \u2014 markup and two CSS rules; no logic. The one thing to actually check is that the moved download row still works, because the irm command and the copy button are filled in by a global query rather than by anything local to step 1.",
      test: [
        "Step 1 must offer exactly one download, the scanner. Press it and confirm the file arrives. Then find Convert-TunoAppLockerToIntune.ps1 in step 5, press ITS download and its Copy, and confirm the irm command is filled in and correct \u2014 the row moved, and the code that populates it queries the whole page rather than that card.",
        "Read the no-Sysinternals paragraph against the scan script itself. If the script ever does start shelling out to AccessChk, this paragraph becomes a lie on the busiest screen in the tool.",
        "At full width, the intro card and the step cards below it must end on the same line. Narrow the window to the normal shell and confirm nothing changed there \u2014 the cap is still in force below 1240px and this build must not have moved it.",
        "Read the intro paragraph at 1680px. If the line length feels like work, the 1100px measure is too generous and should come down; that is a judgement only a reader can make.",
      ],
      files: ["index.html", "css/app.css", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 8,
      title: "Five things that were in the way in T01",
      tools: ["\ud83d\udd10 AppLocker builder & validator"],
      builds: [10312],
      risk: "low",
      what: "All reported from screenshots of 10311. (1) Step 1 is labelled optional and an or-divider sits between the scan card and the upload button, because two stacked cards read as a sequence and made the device scan look compulsory. (2) The findings table drops its trailing action column; the fix button moves into the Recommendation cell, so it is no longer the first thing pushed off a narrow window. The editor row's colspan follows. (3) .al-side sticks at var(--sticky-nav) + 56px instead of 14px, so the code panel's head \u2014 filename, Copy, Download \u2014 clears the sticky header and tab bar instead of hiding behind them; max-height accounts for the same chrome. (4) Enforcement per collection gains a Default Windows rules column that always states the situation for all five types, with an add-everywhere action and one undo for the lot. (5) The enforcement table gets the horizontal scroller the other three already had.",
      why: "LOW \u2014 presentation and one new mutation that reuses addDefaultRules(), which already had tests. It graduates on sight, but every one of these was invisible in the markup and obvious on a screen, so it has to be looked at rather than reasoned about \u2014 at more than one window width, which is how three of the five arose.",
      test: [
        "Open T01 signed out of nothing in particular and read the top of the screen cold. It must be obvious that you can either scan a device or upload a policy you already have. If it still reads as step 1 then step 2, the divider has not done its job.",
        "THE ONE THAT MATTERS: narrow the window until the findings table needs a horizontal scroll, then find a fix button WITHOUT scrolling sideways. It is under the recommendation text. Press it and confirm the mechanical fixes still apply and the judgement ones still open the editor prefilled, with the editor row spanning the full width of the table.",
        "Scroll to the bottom of a long findings list and confirm Copy and Download are still on screen. Then switch to the Intune tab and do it again \u2014 the tab strip must clear the header too. Check at a window short enough that the panel is taller than the viewport.",
        "On a policy missing defaults in several collections: every row of Enforcement per collection must say either present or offer Add, including for a collection the XML does not contain at all. Press Add on one \u2014 that row flips to present and the others do not move. Press Default rules everywhere \u2014 all of them flip, ONE undo step appears, and pressing it takes back all of them, not just the last.",
        "Add defaults to a collection that has none and confirm the resulting policy is the same as before this build: the button is new, addDefaultRules() is not. Export the XML and compare against a policy built the old way.",
        "Re-check the exported XML and the Intune profile after using add-everywhere \u2014 five collections' worth of default rules is the largest single mutation the tool has, and the code panel must move with it.",
      ],
      files: ["index.html", "css/app.css", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 7,
      title: "TUNO deploys the profile into the tenant",
      tools: ["🔐 AppLocker builder & validator", "All tools"],
      builds: [10310, 10311],
      risk: "high",
      what: "A Graph layer (js/graph.js) and a deploy panel in T01 step 5. TUNO creates the Intune custom profile in the signed-in tenant. Scopes are acquired per capability at the click — DeviceManagementConfiguration.ReadWrite.All to read and create, Group.Read.All to search groups — never at sign-in. Every deploy reads deviceConfigurations first and REFUSES if a profile shares the display name or writes the same AppLocker grouping; it reports what it found and the date it changed, and never overwrites. Assignment is a separate confirmed act stating the group's member count, and marks dynamic groups. The Enforce button is gated on the audit profile existing in the tenant AND an uploaded scan reporting zero blocked and zero audited, naming whichever is missing. Refusals are shown in Graph's own words with the code, request-id and an admin-consent link. Writes are never retried. Also: the wide layout moved from #screen-applocker to body.wide on the shell, and created profiles now survive a re-import (tagged with the name and grouping they were made under). 10311 catches up the things that register and describe the app: New-TunoAppRegistration.ps1 declares the two new scopes with a note each, its redirect-URI list gains the two beta hosts (Update-MgApplication REPLACES that array, so a hand-added URI missing from the script is one the next run deletes), and SECURITY.md stops claiming TUNO only reads — it names the write scope, the self-imposed constraints around it, and how to register without it.",
      why: "HIGH, and higher than item 5 — this is the first code in TUNO that WRITES to a customer tenant, and it has never run against a real one. Every Graph call in the test suite is a stub: the shapes of deviceConfigurations, the assign body and the /$count response are taken from the documentation and from the converter script, not observed. The registration script declares both permissions as of 10311, but declaring is not consenting: until an administrator grants them the first real attempt WILL be refused — which conveniently makes the refusal path the first thing anyone tests. Nothing graduates until a profile has been created, assigned to a real pilot group, seen on a real device, and removed again.",
      test: [
        "BEFORE ANY OF THIS the app registration needs DeviceManagementConfiguration.ReadWrite.All and Group.Read.All, consented. New-TunoAppRegistration.ps1 now carries both, so re-running it is one way; Mihai is adding them by hand this time. Either way, VERIFY on the registration afterwards — and while you are there confirm all four SPA redirect URIs are still present, including the two beta ones. Update-MgApplication REPLACES the SPA array rather than merging, so a hand-added URI missing from the script is a URI the next run deletes; that is why they were written into the defaults in this build.",
        "Then see the refusal ONCE ON PURPOSE, before granting consent — or in a tenant that has not consented. Press Create and confirm the panel shows Graph's own words, the code, the request-id and a working admin-consent link, rather than a shrug. It is the most likely first experience a customer has.",
        "THE ONE THAT MATTERS: create the AuditOnly profile in a REAL test tenant, then open it in the Intune portal. Every OMA-URI must be present, the data type must be String, and the value must be byte-identical to the Policy XML tab. Then run Convert-TunoAppLockerToIntune.ps1 against the same policy and diff its JSON against what the browser sent — two paths to one artefact, and they have never been compared.",
        "THE OTHER ONE: put a profile in the way and confirm nothing is created. Make one by hand with the same display name, press Create — it must stop and name it. Repeat with a DIFFERENT name but the same grouping: it must still stop, because that is the collision that silently fights over a CSP node on the device rather than being visible in the portal. Check the tenant afterwards to be sure nothing was written either time.",
        "Assign to a pilot group and check the member count TUNO showed against the portal. Then assign to a DYNAMIC group and confirm it was labelled as one. Confirm no assignment happens without pressing the confirm button, and that Cancel leaves the tenant untouched.",
        "Sign in as a NON-administrator with no rights to device configuration and press Create. The refusal must be the tenant's, quoted, with the consent link — this is the most likely first experience for a customer and it must not read as TUNO being broken.",
        "The enforce gate, all five states: no scan; a scan whose event log could not be read; a scan with blocked greater than zero; a scan with audited greater than zero; and a clean scan. Only the last may offer the button, and the first four must each say which specific thing is missing. Then create the Enforce profile and confirm it lands with the SAME grouping and is assigned to nobody.",
        "Create the audit profile, then upload a follow-up scan bundle. The Created line and the gate must survive the upload — this was broken and is the reason for the fix in this build. Then change the grouping in the form: the Created line must disappear, because that profile is no longer this policy's.",
        "Cancel the consent popup halfway, and separately let a token expire and press Create again. Neither may leave the button stuck on 'Creating…'.",
        "NOT TESTABLE WITHOUT DELIBERATE EFFORT, and worth the effort once: kill the network between the click and the response on a POST. The panel must say the request may or may not have reached the tenant and tell you to look, and must NOT retry. Then check the portal — if a profile was created, the message was right and that is the correct behaviour.",
        "Read the whole of step 5 on a wide screen and a narrow one. The header, tab bar, cards and both columns must start and end on the same two lines at every width, and leaving T01 must narrow the shell back — the previous attempt at this ran off the right edge.",
      ],
      files: ["js/graph.js", "js/applocker.js", "js/app.js", "css/app.css", "index.html", "New-TunoAppRegistration.ps1", "SECURITY.md", "README.md", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 6,
      title: "T01 gets the width the two columns needed",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10309],
      risk: "low",
      what: "The split screen from 10307 never had room: the app sits in an 1180px shell, so two columns gave the findings table ~700px for seven columns and the code panel ~400px, and a wider monitor changed nothing because the cap is on the shell. #screen-applocker now widens with the viewport to 1680px and re-centres (main is centred, so centring within it centres on screen); the code column takes 400–520px; the stack breakpoint moves from 1100px to 1240px. Coverage and Rules gain the horizontal scroller Findings already had — the cards hide their overflow, so those two were being silently cut rather than scrolled — and .al-col children carry min-width:0 so a wide table cannot push its card past its track. Path breaking goes from break-all/break-word to normal with overflow-wrap:anywhere in three places, so a token only splits when the line has no space to break at.",
      why: "LOW — CSS and two table wrappers; no analysis, serialisation or export logic touched. It graduates on sight, but it has to be SEEN, and at more than one width: the bug it fixes was invisible in the markup and obvious on a screen.",
      test: [
        "Open T01 with the sample policy on a display wider than 1400px. The findings table must show all seven columns with the condition reading as a path, not as one character per line, and the code panel must be wide enough that most attributes sit on one line. Compare against build 10308 in another tab if you want to see what was wrong.",
        "THE ONE THAT MATTERS: drag the window slowly from full width down to about 900px. The screen must stay centred at every width — no drift left or right, no horizontal scrollbar on the page — and must stack into one column at 1240px. Centring is done with a negative margin against a percentage, which is the part most likely to be subtly wrong on an unusual window size.",
        "At full width, check the header, tab bar and the other screens (home, Help, What's new, Roadmap) are still in the 1180px shell. Only T01 escapes it; if the whole app got wider, the rule is too broad.",
        "Scroll the Coverage and Rules tables sideways on a narrow window. Both must scroll within their card. Before this build the text past the card edge was simply absent — no scrollbar and no ellipsis — so the check is that nothing is missing, not that a scrollbar appears.",
        "With the scan bundle loaded (item 5), confirm the device-evidence card and the satellite findings sit in the left column and did not inherit any of this.",
        "Check both themes and the Intune tab: the panel is sticky and scrolls inside itself while the left column moves. On a policy longer than the viewport the panel must not grow past the window.",
      ],
      files: ["css/app.css", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
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
