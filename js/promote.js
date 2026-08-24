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
      n: 56,
      title: "The tenant box renders — Sign out becomes reachable",
      tools: ["TUNO"],
      builds: [10375],
      risk: "medium",
      what: "The header's tenant identity (name, avatar, Sign out, the cfdev badge) never rendered: enter() toggled class 'on' on #tenantBox, and no CSS rule for .tenant.on has ever existed, so .tenant{display:none} always won. Fixed ENCA's way, ported: enter() sets style.display flex directly, sign out sets none. No CSS change, no markup change — two lines of JS.",
      why: "MEDIUM — it makes a whole strip of header UI appear for every signed-in user for the first time, including the Sign out button, whose handler has been wired and untested-by-humans since the scaffold. The narrow-viewport layout rule for .tenant has also never been seen with content in it. Graduates on sight: box visible after sign-in with name/UPN/avatar correct, Sign out ends the session, box gone after.",
      test: [
        "THE ONE THAT MATTERS: sign in. The tenant box must appear in the header — org domain, UPN, avatar initials, Sign out. Before this build there was nothing there; if there is still nothing, the fix missed.",
        "Click Sign out: back to the sign-in screen with NO resume note, box hidden, and the next Sign in must ASK rather than silently continue the session just ended (item 53's gate must survive this, it shares the handler).",
        "Narrow the window to phone width signed in: the box wraps to its own full-width row (the flex rule at 1254 has never been exercised with content) — nothing may overflow the header.",
        "On the cfdev tenant, confirm the badge now renders inside the visible box — 10373's badge test could never actually have been seen; this build is where item 54's on-sight checks become possible.",
      ],
      files: ["js/app.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 55,
      title: "The IT-TOOLS provisioning ships as a Remediation pair",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10374],
      risk: "medium",
      what: "Detect-TunoItToolsFolders.ps1 (new, 1.0.0): the detection half for Initialize-TunoItToolsFolders.ps1, read-only, exit 1 when a house folder is missing, when a principal outside SYSTEM/Administrators/CREATOR OWNER can write, or when SYSTEM itself cannot write — same write mask and trusted set as the provisioning script's own verify, so the pair cannot loop. Initialize (1.1.0) now also PROVES SYSTEM write by appending a provisioning record to IT-TOOLS\\LOGS\\Initialize-TunoItToolsFolders.log; a failed write is exit 1. T01: the detect script joins the step-1 downloads, and the Remediation deploy panel is now table-driven (REMEDY_PAIRS) — both pairs deploy from the browser with the same read-before-write, same-name stop, created-unassigned discipline; per-pair name fields, stop boxes and created cards. The screen states the standing-assignment difference: cleanup pair = migration window only, IT-TOOLS pair = leave assigned.",
      why: "MEDIUM — the new detection is read-only and the deploy machinery is a refactor of what item 52 graduates, but two things are argued rather than executed: the detection's ACL evaluation on a real device (like every .ps1 here, no PowerShell runtime in the build environment), and the loop property — that a device Initialize just fixed always detects compliant. If those disagree in practice, an estate-wide standing assignment remediates every device every cycle, which is a reboot-free but noisy failure. Graduates when one device has been seen going non-compliant → remediated → compliant in the console, and a compliant device stays quiet across cycles.",
      test: [
        "THE ONE THAT MATTERS: on a device WITHOUT the folders, run Detect (exit 1, names the missing folders), then Initialize (exit 0, log line taken), then Detect again — exit 0. If the second Detect still objects, the two halves disagree and the pair loops; do not promote until this cycle has been seen clean.",
        "Grant Users write on IT-TOOLS\\Apps after provisioning and run Detect: exit 1 naming the folder and SID. Re-run Initialize, confirm the ACE is gone and Detect is quiet again — this is the drift case the standing assignment exists for.",
        "Deny SYSTEM write on IT-TOOLS (icacls /deny) and confirm Detect exits 1 saying SYSTEM cannot write — the logging-broken case, and the check that is easy to get backwards.",
        "Confirm Initialize's log line actually lands in IT-TOOLS\\LOGS\\Initialize-TunoItToolsFolders.log when run as SYSTEM, and that a run with LOGS made unwritable exits 1 even though the ACL verify passed.",
        "Create both Remediations from the browser in one session: two POSTs total (watch the network tab — the table-driven wiring must not double-fire either button), each stop-box and created-card under its own pair, and editing one pair's name must clear only that pair's collision verdict.",
        "In the portal, confirm the IT-TOOLS Remediation arrived as SYSTEM / 64-bit / signature check off with both script bodies byte-identical to the site's files, and run one detect→remediate cycle on a scoped device.",
        "Read the step-1 paragraph and the deploy panel text: the cleanup pair must still say migration-window-and-unassign, the IT-TOOLS pair must say leave-assigned — the two opposite instructions are the thing a reader must not be able to confuse.",
      ],
      files: ["scripts/Detect-TunoItToolsFolders.ps1", "scripts/Initialize-TunoItToolsFolders.ps1", "scripts/README.md", "js/applocker.js", "index.html", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 54,
      title: "TUNO knows its home tenant (cfdev detection)",
      tools: ["TUNO"],
      builds: [10373, 10375],
      risk: "low",
      what: "ENCA's tenant discovery ported with the same matching rules: CFDEV_TENANTS, matched against the signed-in account's UPN domain (exact or subdomain) and — when a tool has filled it in — the org display name carrying the first label. 10375 corrected the list to reality: the tenant's sign-in UPNs carry devcf.onmicrosoft.com (the initial domain), which 10373's cloudfellows.dev-only list could never match from the UPN — both names are listed now, cloudfellows.dev kept for verified-domain UPNs and the org-name half. enter() sets the domain and toggles a header badge beside the tenant identity ('cfdev — extra features', #cfdevBadge, hidden by default and on sign out); sign out clears both values. window.TunoTenant is the one seam tools gate cfdev-only features through (isCfdev, domain, setOrgName), so the list never gets a second copy; a _setForTest setter exists for the headless tests. NOTHING IS GATED YET — this item is detection, badge and seam only. Difference from ENCA, stated in the code: ENCA fills tenantName from /organization at sign-in; TUNO reads no org (User.Read only), so the name half of the check is dormant until a tool sets it.",
      why: "LOW — additive, nothing existing changes behaviour, and on every tenant that is not cloudfellows.dev the entire feature is a hidden span and two empty strings. The one real risk is the opposite direction: a future cfdev-only feature leaking to customer tenants because the gate was mis-evaluated — which is why the detection is one function in one place and the badge makes its verdict visible on sight. Graduates when the badge has been seen on a real cloudfellows.dev sign-in and confirmed absent on a customer tenant.",
      test: [
        "THE ONE THAT MATTERS: sign in with an @devcf.onmicrosoft.com account (the tenant's real UPNs). The badge must appear in the header beside the tenant identity, and window.TunoTenant.isCfdev() in the console must return true. Needs 10375's tenant-box fix (item 56) to be visible at all.",
        "Sign in to any customer tenant: no badge, isCfdev() false. This is the leak direction and the more important half.",
        "Sign out from a cfdev session: the badge must disappear immediately, and isCfdev() must return false before any new sign-in.",
        "Sign in with a subdomain UPN (user@sub.cloudfellows.dev) if one exists: the badge must appear — the endsWith rule is ENCA's and this is its only test. If no such account exists, say so rather than nodding it through.",
        "Check the badge title text against the code: it claims detection is UPN-domain based and that other tenants are unaffected — both must stay true as features start gating on the seam.",
      ],
      files: ["js/app.js", "index.html", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 53,
      title: "A refresh restores the session, never the screen",
      tools: ["TUNO"],
      builds: [10371],
      risk: "medium",
      what: "Splits what 10361 conflated. authInitInner() still ADOPTS the cached account on refresh (active account set, silent tokens, no fresh authorization → no MFA) but now always returns false for the refresh paths, so every F5 lands on the sign-in screen; only handleRedirectPromise() returning an account — the completion of an actual interactive sign-in — enters directly. The screen shows a note naming whose session will be continued (new #loginResume, hidden when there is none, hidden again on sign out), and signIn() short-circuits: with an adopted account the click calls enter() with NO loginPopup/loginRedirect at all. Multi-account-none-active is unchanged (nothing adopted, interactive chooser runs); sign out clears the local account so a just-ended session cannot take the short-circuit.",
      why: "MEDIUM — auth entry flow, everything passes through it, and it reverses half of a fix that graduated reasoning: the deliberate-entry gate matters more now that 10370 made a tenant write reachable before any policy upload. The restore half of 10361 is untouched, so the MFA regression it fixed cannot return by this change alone — but the redirect return path and real-IdP behaviour are only argued here, not executed. Graduates on one manual pass of the four flows against the real IdP.",
      test: [
        "THE ONE THAT MATTERS: sign in, F5. You must land on the sign-in screen, see your own UPN in the note, and clicking Sign in must enter with NO account picker, NO password, NO MFA — instantly. If MFA appears, the restore half regressed; if the app appears without the click, the gate half regressed.",
        "Close the tab, reopen the site: sign-in screen with NO note, and the click runs a full interactive sign-in (sessionStorage is per-tab by design).",
        "Use the no-popup redirect link end to end: landing back from the IdP must enter the app DIRECTLY — that path is a sign-in completing, not a refresh, and forcing a second click there would loop.",
        "Sign out, then click Sign in again: it must ASK (chooser/credentials), not silently re-enter the session just ended — the short-circuit must be dead after sign out, and the note gone.",
        "With two accounts cached and none active (sign in to A, sign out, sign in to B in another tab of the same session if reproducible): the screen must show no note and the click must open the interactive chooser, not guess.",
      ],
      files: ["js/app.js", "index.html", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 52,
      title: "The cleanup pair deploys as a Remediation",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10369, 10370, 10372],
      risk: "high",
      what: "Remediation deploy: creates an Intune Remediation (deviceHealthScript, BETA endpoint — absent on v1.0) carrying Detect-TunoAppLockerPolicy.ps1 as detection and Clear-TunoAppLockerPolicy.ps1 as remediation, fetched same-origin at click time and base64'd through bytes (TextEncoder path — btoa on text throws on the BOM and box characters). runAsAccount system, runAs32Bit false, publisher TUNO. Name prefilled '[REPAIR_TOOLS]Win - DHS - Device Security - D - Clear Applocker Settings - R27.1 - v3.8', editable; editing the name clears the last collision verdict. Same discipline as the profile deploy: read-before-write via Graph.remediations(), same-name stops, no retry, created UNASSIGNED with the scope-to-migration-window/unassign-after warning on the created card. 10370 moved it from deploy section E to a COLLAPSED panel under the step-1 script downloads — cleanup runs at the start of a brownfield migration, so it no longer requires an uploaded policy at all — and its button is wired exactly once (renderRemedy wires its own handlers; the duplicate wireDeploy wiring that would have doubled every click into two POSTs was removed). 10370 also set the Intune PROFILE name default to the full house scheme 'Win - SEC - Device Security - AppLocker (AuditOnly) - R27.1 - V4.0' with the mode token swapped in place for Enforce; converter default and examples follow (1.4.1). 10372 CORRECTED THE SCOPE: 10369 shipped the deviceHealthScripts calls under DeviceManagementConfiguration.ReadWrite.All claiming it covered them — the first real click was refused by the tenant naming DeviceManagementScripts.ReadWrite.All, and the Graph reference confirms Create/Update accept ONLY that scope. It is now TUNO's SECOND write scope (SCOPES.scriptsWrite, used for both the list and the create), added to New-TunoAppRegistration.ps1 and SECURITY.md in the open per the R18 rule. EXISTING REGISTRATIONS NEED THE SCOPE ADDED AND ADMIN-CONSENTED, or the click fails exactly as it did.",
      why: "HIGH — a new kind of write to the tenant, and the thing it deploys DELETES AppLocker policy from endpoints at SYSTEM once somebody assigns it. The browser half follows the established discipline but is unexecuted against a real tenant; the deviceHealthScripts request shape (field names, base64, runAsAccount casing) is per Graph docs and community usage, not verified here. Graduates when one Remediation has been created from the browser, read back correctly in the portal, and a detect→remediate cycle has run on a scoped test device.",
      test: [
        "THE ONE THAT MATTERS: sign in, create the Remediation, and open it in the portal (Devices → Scripts and remediations). Both script bodies must be intact — BOM, box characters and all: compare a downloaded copy from the portal against the site's own files byte-for-byte. Base64 through bytes is exactly the step that silently corrupts if wrong.",
        "Confirm it arrived as SYSTEM / 64-bit / signature check off, publisher TUNO, and UNASSIGNED.",
        "Create it again without renaming: the deploy must STOP on the same-name collision, and the existing script must be untouched (check lastModified). Then edit the name and confirm the stop-box clears.",
        "Assign it to a scoped test group with a schedule, watch one detect→remediate cycle report in the console, and confirm the exit-1-when-dirty behaviour surfaces as 'with issues' rather than 'fixed'.",
        "Confirm the write scope prompt appears at the CLICK for a fresh session, not at sign-in, and that a read-only session can still use every other part of T01 without it.",
        "Confirm the created-card's warning survives into practice: leave the pair assigned while the new policy deploys on the test device and verify the documented failure occurs (detection flags the new policy) — the warning must describe reality, not theory.",
        "10370: on a FRESH load with no policy uploaded, the collapsed panel under the step-1 downloads must open, take a sign-in, and create the Remediation — no step 5 involved. Watch the network tab while clicking create ONCE: exactly one POST to deviceHealthScripts (the double-wiring case this build removed would show two).",
        "10370: open the Intune tab — the profile name field must prefill 'Win - SEC - Device Security - AppLocker (AuditOnly) - R27.1 - V4.0' in full, and switching the mode to Enforce must produce '(Enforced)' mid-name with the R/V suffix still last, in the JSON and the deploy alike.",
        "10372: add DeviceManagementScripts.ReadWrite.All to the EXISTING app registration (delegated) and admin-consent it, then click create: the consent prompt (first time) must name that scope, and the create must succeed where request a46ed6ca-9023-4392-8dfd-46d92e4546a4 failed. A registration WITHOUT the scope must fail with the admin-consent card, not a silent hang.",
      ],
      files: ["js/applocker.js", "js/graph.js", "index.html", "scripts/README.md", "New-TunoAppRegistration.ps1", "SECURITY.md", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 51,
      title: "The grouping names itself",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10368],
      risk: "low",
      what: "The Intune tab's grouping default is generated — 'AppLocker-' + GUID — instead of the literal 'Pilot', with a ↻ button to mint a fresh identity; the converter generates the same when -Grouping is omitted (now optional, 1.4.0) and prints it. Deliberately NOT prefilled pilot/production choices: that distinction lives in the assignment and the mode of ONE profile edited in place, and a hand-reusable word is what produces two profiles sharing a grouping — the broken-removal case. Typing such a word (pilot, production, test, audit, enforce, default …) raises a Medium issue. And the issues list is now VISIBLE: a new box under the Intune form shows all severities, where previously only High issues rendered (in the deploy gate) and every Medium warning was computed and shown nowhere.",
      why: "LOW — defaults and warnings; nothing changes in generated rule content, and the field stays editable so any deliberate choice still works. The invisible-Medium fix matters beyond this feature: the charset and display-name warnings were also silent. Graduates on sight plus one converter run.",
      test: [
        "Open the Intune tab on a fresh load: the grouping must read AppLocker-<guid>, the profile's OMA-URIs must carry it, and ↻ must mint a different one with the JSON following.",
        "Type 'Pilot' into the grouping: a visible warning must appear under the form saying why, and typing a GUID-style name must clear it.",
        "Run the converter WITHOUT -Grouping: it must generate, print, and use AppLocker-<guid>. With -Grouping still supplied, behaviour unchanged.",
        "THE ONE THAT MATTERS: confirm the old advice is gone everywhere — no example, tooltip or doc still says to reuse one grouping across audit and enforce profiles, and none prefills 'Pilot'. Grep is the test; a stale example outlives any UI.",
        "Blank the grouping and confirm the High 'no identity' issue still shows and the deploy gate still blocks.",
      ],
      files: ["js/applocker.js", "index.html", "scripts/Convert-TunoAppLockerToIntune.ps1", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 50,
      title: "Help TOC, the grouping explainer, and the folder trap",
      tools: ["All tools", "🔐 AppLocker builder & validator"],
      builds: [10367],
      risk: "medium",
      what: "Four related pieces. (1) Help section pills, ENCA's pattern: buttons (not #anchors — the shell owns pushState) with scroll-margin-top for the sticky header; queue pill toggled with the queue box in openHelp(). (2) Help sections for T08–T11, which had none, written from their TOOL_VERSIONS notes around their honest limits; the editor's is marked 'writes to tenant'. (3) A grouping explainer with the WHY: address-not-label, merge/stack semantics, the unique-grouping removal warning quoted, the reboot, and the one-profile-edited-in-place rule. (4) The folder trap Mihai's icacls run exposed: Initialize-TunoItToolsFolders.ps1 creates the house folders with inheritance disabled and admin-only writes, resets user-pre-created folders, verifies by ACL read-back, exit 1 on failure — because ProgramData lets a standard user create missing subfolders and OWN them, turning the standing allows into a bypass. Clear-TunoAppLockerPolicy.ps1 (1.2.0) also now names every cached MDM grouping and offers -RemoveMdmGroupings for orphans, with unassignment stated as the supported removal for live ones.",
      why: "MEDIUM — the help changes are prose and navigation, but the provisioning script sets ACLs on ProgramData folders at SYSTEM and the cleanup gained a switch that deletes CSP cache folders. Both are unexecuted, and the MDM cache path (System32\\AppLocker\\MDM) is community-documented rather than contractual — if a Windows build lays it out differently the sweep finds nothing and verification still tells the truth, which is the designed failure mode. Graduates when the provisioning script has run on a real device and icacls shows the intended ACL, and when the grouping list in the cleanup log matches the profiles actually assigned.",
      test: [
        "THE ONE THAT MATTERS: run Initialize-TunoItToolsFolders.ps1 as SYSTEM (via IME or psexec), then icacls all four folders. SYSTEM and Administrators full control, Users read-and-execute, NO inherited Users create rights, exit 0. Then pre-create IT-TOOLS\\Apps as a standard user first, run the script, and confirm the user's ownership and ACEs are GONE.",
        "Break it deliberately: grant Users write on Apps after provisioning and re-run — the script must exit 1 and name the folder and SID. A provisioning check that cannot fail is decoration.",
        "Run the cleanup on a device with an assigned AppLocker profile: the log must NAME the grouping(s) and say unassignment is the removal — and must NOT delete them without -RemoveMdmGroupings. Then unassign, orphan a cache if you can manufacture one, and confirm -RemoveMdmGroupings clears it and verification passes after a reboot.",
        "Click every Help pill at desktop width: each must land with its heading visible below the sticky header, not hidden behind it. Check the queue pill is present on beta and absent when isProduction() — the beta site cannot test the second half, so verify it on the production host after the next promotion.",
        "Read the grouping section against the AppLocker CSP page: the quote must be verbatim and the merge/stack claim accurate. This is the section people will cite in change tickets.",
        "Read the four new tool sections against the tools themselves — each claims specific behaviours (refusals, drift, absent-not-empty) that must actually match what the tool does today, not what it might do.",
      ],
      files: ["index.html", "css/app.css", "js/app.js", "scripts/Initialize-TunoItToolsFolders.ps1", "scripts/Clear-TunoAppLockerPolicy.ps1", "scripts/README.md", "scripts/AppLocker-Implementation-Checklist.md", "js/changelog.js", "js/version.js", "js/promote.js"],
    },
    {
      n: 49,
      title: "The IT-TOOLS house convention",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10366],
      risk: "medium",
      what: "House convention encoded in both producers and the docs. (1) Standing allow rules for %OSDRIVE%\\ProgramData\\IT-TOOLS\\Apps\\* and \\Scripts\\* in every generated Exe/Msi/Script collection — scanner's New-DefaultRuleSet and T01's DEFAULT_RULES both — so they never have to be remembered. AppLocker has no %PROGRAMDATA% variable; %OSDRIVE%\\ProgramData is the correct macro form. (2) The scan gains Test-ItToolsAllowedPath: a user-writable directory inside a house folder raises a live-bypass warning, louder than the IME case because here the policy itself hands out the permission. (3) The audit reports house-rule paths at Info with the ACL condition stated, instead of the generic Medium ProgramData flag — the 10315 no-arguing-with-own-defaults rule. (4) Clear-TunoAppLockerPolicy.ps1's default log folder moved from C:\\DVL-Logs to $env:ProgramData\\IT-TOOLS\\LOGS (script 1.1.0; scan 1.8.0). Convention documented in README and checklist.",
      why: "MEDIUM — this widens every generated policy by two path allows for Everyone, by design. The safety of that rests entirely on the ACL claim, which only the scan can check and only on devices that get scanned. If the IME packaging that creates IT-TOOLS ever creates it with inherited user-write access, the standing allow is a standing hole on every device — which is exactly what the new warning exists to catch, and why the ACL check needs to be seen firing once before this is trusted.",
      test: [
        "THE ONE THAT MATTERS: on a real device, check the ACL on %ProgramData%\\IT-TOOLS\\Apps and \\Scripts (icacls). If Users or Authenticated Users can write, fix the deployment BEFORE this promotes — the rules make that a bypass. Then make a subfolder user-writable deliberately, re-scan, and confirm the live-bypass warning fires and names the path.",
        "Generate a policy and confirm both house rules appear in Exe, Msi AND Script, as %OSDRIVE%\\ProgramData\\IT-TOOLS\\..., and NOT in Dll or Appx.",
        "Drop an unsigned exe into IT-TOOLS\\Apps on an audit-policied device and run it as a standard user: it must produce NO 8003 event (it is allowed — that is the point). Then drop the same exe into IT-TOOLS\\LOGS and confirm it IS audited — LOGS deliberately has no rule.",
        "In T01, add default rules and confirm the audit shows the house rules at Info naming the ACL condition — not Medium, and not absent.",
        "Run the cleanup and confirm the log and backups land in %ProgramData%\\IT-TOOLS\\LOGS, created if missing, including when run as SYSTEM via Intune.",
        "Check the checklist and README state the convention and the LOGS-has-no-rule rule; this is the page a future admin reads when wondering why these rules are in every policy.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Clear-TunoAppLockerPolicy.ps1", "scripts/README.md", "scripts/AppLocker-Implementation-Checklist.md", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 48,
      title: "Findings that do not fit become a summary that says so",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10365],
      risk: "low",
      what: "The findings card carries TWO renderings of the same filtered list and a CSS container query on the card's own width picks one: under 720px of card width (the split view beside the XML panel) a compact list — severity tag, 🛰 mark, collection, rule, reason clamped to three lines — ending in an ⛶ button that reuses the existing al-fs machinery to open the full screen popout; at any wider card width, the six-column table exactly as before, fixes included. The table markup, ids and handlers are unchanged — the compact list is additive, and the fix buttons/editors exist only in the table, so full screen is where fixing happens in the narrow layout. Browsers without container-query support keep the table (status quo).",
      why: "LOW — presentation only, one card, no analysis or mutation logic touched, and the fallback for old browsers is exactly the previous behaviour. It graduates on sight at three widths. The one real risk is a browser that supports container queries but mismeasures the card inside the Fs popout, which would summarise where the fixes should be — that is the first thing to look at.",
      test: [
        "THE ONE THAT MATTERS: load a policy in the split view at a normal desktop width. The findings card must show the COMPACT list, not the wrapped table — and its last element must be the ⛶ button, which must open the popout showing the FULL table with working fix buttons.",
        "In the popout, apply a fix and confirm the table redraws inside the popout (the card is parked, not cloned). Close it and confirm the compact list reflects the change.",
        "Narrow the window below 1100px so the panel stacks: the card is now full-width and must show the TABLE, not the summary. The switch is card width, not window width — this is the case that proves it.",
        "Change the severity filter in the summary bar and confirm the compact list follows it — both renderings come from the same `shown` array, so a mismatch means a second list crept in.",
        "Check one old-ish browser (or emulate no container-query support): the table must show everywhere, as before.",
        "Confirm the coverage and scan cards still render as tables — only findings got the treatment, deliberately; if they need it too, that is a decision, not a drive-by.",
      ],
      files: ["js/applocker.js", "css/app.css", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 47,
      title: "The same crash, second shape — no bare indexer survives",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10364],
      risk: "high",
      what: "Mihai's real 5.1 run failed rule generation again with ArgumentException('Argument types do not match') — this time at an indexed READ with a literal key ($collections['Dll']), where 10344's fix had only covered the indexed WRITE of a value type. The 10344 wrapping did its job: the scan survived, the bundle carried the evidence, and the recorded line number located the defect immediately. Fix: total discipline instead of case-by-case. Every write to the ordered dictionaries on the generation path goes through .Add(object, object); every read goes through a cast to [System.Collections.IDictionary], whose single this[object] indexer leaves the 5.1 expression compiler nothing to choose between. A mechanical sweep confirms no bare indexer remains on $collections/$byCollection/$artifactRules/$counts. Scan is 1.7.0; the guard also caught the .NOTES header still saying 1.4.0 from two builds that bumped only the constant.",
      why: "HIGH — this is the second attempt at the same class of crash, on the script's core path, and like everything PowerShell here it was verified by argument rather than execution. The pattern (two shapes so far) argues the binder cannot be trusted with ANY OrderedDictionary indexing on 5.1, which is exactly what the fix assumes. UPDATE: the graduation run has since HAPPENED — v1.7.0 build 10364 on CPC-mihai-2L8IB, the machine that failed twice, printed per-collection counts (Dll 20 built and omitted, 21 rules across 4 collections) and wrote all three files. Test step 1 is done; the PS7 run and the bundle inspection remain.",
      test: [
        "THE ONE THAT MATTERS: re-run the scan on CPC-mihai-2L8IB, same arguments, Windows PowerShell 5.1. 'Building the rule set' must print per-collection counts and the run must write all three files. That machine has now failed twice; it is the only oracle that counts.",
        "Run it under PowerShell 7 as well — the binder differs there, and the IDictionary casts must not have broken the path that already worked.",
        "Check the bundle's generatedPolicy is populated and rulesByCollection lists each collection with a plausible count, and that Dll is absent with dllRulesOmitted recording what was dropped.",
        "Grep the script for bare indexing on the four dictionaries and confirm none — and keep that check in review for any future edit to the generation path; the two failures were five hundred lines apart.",
        "Confirm the banner, the .NOTES header and the bundle all say 1.7.0. The guard now compares header to constant on every change, so this should be impossible to regress silently — verify the guard fails if you knock one out of step.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 46,
      title: "The cleanup for devices that already have a policy",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10362, 10363],
      risk: "high",
      what: "Two new scripts close the brownfield gap the carry-over findings describe. Clear-TunoAppLockerPolicy.ps1: backs up the effective policy, local policy and SrpV2 registry key; applies the empty (all-NotConfigured, zero-rule) policy, which is the genuinely inert state; clears the SrpV2 tattoo; verifies the effective policy is empty afterwards and exits 1 when it is not. It PRESERVES the AppLocker event logs by default (-ClearEventLogs exports them first even when set) and LEAVES AppIDSvc alone (-DisableAppIdService only for retiring AppLocker outright). Detect-TunoAppLockerPolicy.ps1 is the Intune Remediation detection half: exit 1 when the effective policy has rules or SrpV2 exists. It replaces Mihai's CloudFlow Remediate-AppLocker.ps1, which cleared the event logs unconditionally, disabled AppIDSvc, and exited 0 on failed verification. The migration order (unassign → cleanup → deploy under a NEW grouping) is now stated in the carry-over rec, step 5, the checklist and the README, plus the warning that the Remediation pair left assigned after the new policy lands will read that policy as state to remove. 10363 adds the pair to STEP 1's download list beside the scan, with copy-able download commands — the cleanup runs before the new policy means anything, so the download belongs where the work starts.",
      why: "HIGH — this script DELETES policy from production endpoints, by design, at SYSTEM, and like every .ps1 here it has never been executed (no PowerShell runtime in the build environment). Its worst failure modes are the quiet ones: a backup that silently failed before a delete that succeeded, or the pair left assigned after migration eating the new policy. It graduates when one device has been walked through the full unassign → cleanup → redeploy cycle and came out with the new policy live and the old one gone.",
      test: [
        "THE ONE THAT MATTERS: on a test device carrying a real policy, run the full migration — unassign the old profile, run the cleanup elevated, deploy the new grouping. The cleanup must exit 0, the backups must exist in C:\\DVL-Logs and be re-importable (restore one with Set-AppLockerPolicy to prove it), and the new policy must land clean.",
        "Run the cleanup WITHOUT unassigning first, wait for a sync, and confirm the policy returns — then confirm the log's reminder line said it would. The loop is the failure users will hit; the script must have warned about it.",
        "Run it on a device where SrpV2 cannot be fully removed (leave the old profile assigned) and confirm it exits 1, not 0. To a Remediation, exit 0 on a dirty device is a lie that hides exactly the machines needing a human.",
        "Confirm the AppLocker event logs SURVIVE a default run — open Event Viewer after. Then run with -ClearEventLogs and confirm the .evtx exports landed in the log folder before the logs went.",
        "Confirm AppIDSvc is untouched by a default run, and that the new policy deployed afterwards actually logs events — the old script's service handling is why a pilot could read clean while doing nothing.",
        "Deploy the pair as an Intune Remediation to one device and watch a full detect→remediate cycle report correctly in the console. Then leave it assigned while the new policy deploys and confirm the documented failure happens — detection flags the new policy — so the warning in step 5 is proven true rather than assumed.",
        "Run Detect on a clean device (exit 0) and on a policied device (exit 1). Detection inverted is remediation run on the wrong machines.",
      ],
      files: ["scripts/Clear-TunoAppLockerPolicy.ps1", "scripts/Detect-TunoAppLockerPolicy.ps1", "scripts/AppLocker-Implementation-Checklist.md", "scripts/README.md", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
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
