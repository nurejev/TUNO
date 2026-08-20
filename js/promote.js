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
  // Verified against `git show main:js/version.js` — main is at build 4.
  // Promotions so far: items 1-13 (beta 10301-10317) as build 3, and items
  // 14-19 (beta 10318-10323) as build 4.
  productionBuild: "v1.0.4",

  items: [
    {
      n: 29,
      title: "T06 opens a policy's settings; T05's platform filter follows the scroll",
      tools: ["\ud83d\udda5 Device analyzer", "\ud83d\udcc4 Configuration documenter"],
      builds: [10336],
      risk: "medium",
      what: "T06: policy names in the effect table become buttons that expand the policy's settings inline, read on demand via Graph.get with the config scope already held. The kind is decided from the row's own `sub` field \u2014 settings catalog, ADMX, device configuration, compliance \u2014 and rendered through Docs.catalogRows / Docs.admxRows / Docs.flatten, which is where redaction lives; nothing renders settings twice. Unmappable kinds say so; failures are reported; lists cap at 200 with the cap stated. The standalone HTML export stays static. T05: the platform filter moves out of the setup form and into the sticky selection bar, held in module state (platformFilter / platformOpts) with a delegated change handler, because the bar is re-rendered on every change. The filter hint says where it went.",
      why: "MEDIUM \u2014 T06 now issues a Graph read per policy opened, and it renders values that can contain secrets. It is safe only because it goes through the Documenter's readers; the day someone adds a fourth kind here with its own renderer, that stops being true. The T05 half is presentational but changes where a control lives, which is the kind of thing that reads as a missing feature rather than a moved one.",
      test: [
        "THE ONE THAT MATTERS: in T06, open a policy KNOWN to contain a secret \u2014 a platform script with a body, or a profile with a certificate. The value must come back redacted, exactly as the Documenter shows it. If a raw value appears, a renderer has been added that bypasses Docs and the tool is leaking into a screen an admin will screenshot.",
        "Open one policy of each kind: settings catalog, administrative template, device configuration, compliance. Each must show its settings. Then find a row whose kind is none of those \u2014 an app assignment, an enrolment restriction \u2014 and confirm it says it keeps no readable settings list rather than opening onto an empty box.",
        "Open a policy, then open a second, then close the first. Each panel belongs to its own row and closing one must not disturb the other. Press the same name twice and it must close.",
        "Sign in as somebody without the configuration scope and open a policy. The panel must report the refusal, not swallow it \u2014 and the rest of the table must keep working.",
        "Open a policy with a great many settings and confirm the cap is stated rather than the list simply stopping. Compare the count against the Documenter for the same policy.",
        "Export the standalone HTML from T06 and confirm the policy names are NOT buttons in it, and that it opens with no tenant access.",
        "In T05, read a tenant and scroll to the bottom. The platform filter must still be on screen, in the selection bar. Change it: the list narrows, the SELECTION does not change, and the export count stays what it was.",
        "Reset T05 and confirm the filter disappears with the results and the hint reappears explaining where it will be.",
      ],
      files: ["js/devicewhy.js", "js/document.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 28,
      title: "Consent stops triggering MFA",
      tools: ["All tools"],
      builds: [10334],
      risk: "medium",
      what: "js/graph.js no longer passes prompt:\"consent\" to acquireTokenPopup. That parameter forces the authorization server to re-authenticate as well as re-consent, so every on-the-click scope grant put the admin through multi-factor authentication. ENCA has never passed a prompt on an interactive token call. It was added in 10310 to make the prompt appear when it was not appearing; the actual cause was needsInteraction() not matching AADSTS65001 / invalid_grant, fixed in 10322 \u2014 after which this only ever cost an MFA challenge.",
      why: "MEDIUM \u2014 it changes how every permission in the app is obtained, and the failure mode if it is wrong is silent: the popup does not appear, a read reports 'could not be read', and nobody sees a prompt to blame. Low blast radius, but it needs exercising against a tenant on each of the paths that ask for a scope, not just one.",
      test: [
        "THE ONE THAT MATTERS: sign in fresh, then trigger a scope that has never been consented \u2014 the deploy in T01, or a read in T02. The consent screen must appear, list the permission, and NOT ask for a second factor. If MFA still appears, check the tenant's Conditional Access: a policy requiring MFA for the app will do this on its own and is nothing to do with this parameter.",
        "Then trigger a SECOND scope in the same session. It must prompt once for that scope and not re-ask for the first \u2014 that is 10322's once-per-run behaviour, and this change must not have disturbed it.",
        "Decline the consent screen. The panel must say consent was not granted and offer the admin-consent link, exactly as before; the popup path is unchanged apart from the missing parameter.",
        "As a non-admin, trigger a scope needing admin consent. The refusal must still be classified as admin rather than as an ordinary declined prompt.",
        "Sign-in itself is a different call and still passes prompt:select_account on purpose \u2014 confirm signing in still offers the account chooser rather than silently reusing the last account.",
        "NOT REPRODUCIBLE HEADLESSLY: the suite asserts no prompt is passed and that ENCA passes none either, which is the invariant. Whether the tenant then asks for MFA is between the tenant and the browser.",
      ],
      files: ["js/graph.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 27,
      title: "T07 — Intune role assignments",
      tools: ["🛡 Role assignments"],
      builds: [10331],
      risk: "medium",
      what: "A seventh tool, js/roles.js: Roles (engine) + RolesTool (screen), a tile in a new 'Access & roles' home section, a screen, a tab and an entry in HISTORY_SCREENS. Reads /deviceManagement/roleDefinitions and /deviceManagement/roleAssignments, then one detail read per assignment with $expand=roleDefinition,microsoft.graph.deviceAndAppManagementRoleAssignment/roleScopeTags (falling back to roleDefinition alone, with scope tags named from /deviceManagement/roleScopeTags). Every member, scope group and scope member id in the report is resolved in one Graph.resolveNames() call. Empty roles behind a toggle that re-renders rather than re-reads. Observations, not a score. No new scopes: DeviceManagementRBAC.Read.All and the directory scopes were already consented.",
      why: "MEDIUM — no new permission and nothing written, but the report is an ACCESS REVIEW and a wrong one is worse than none. Three things need a real tenant. The combined $expand is the one most likely to break: roleScopeTags hangs off the derived type and some tenants answer 400, which the code handles by falling back, but nobody has yet seen a tenant do either. The scope reading distinguishes 'all devices' from 'Graph did not say', which is a distinction the original does not make and which only real data can confirm is the right call. And the high-privilege role list is a judgement written into the code — four built-in names — that a tenant using custom roles heavily may find beside the point. It graduates when someone has used it to run an actual access review and the Entra caveat did NOT surprise them at the end of it.",
      test: [
        "THE ONE THAT MATTERS, and it is the reason the caveat exists: run this on a tenant where somebody holds Intune Administrator in Entra but no Intune RBAC role. They must NOT appear in the report, and the first line on the screen must tell you why. If a reviewer reads the page and does not come away knowing that Entra roles are missing from it, the wording has failed however correct the data is.",
        "Compare the role list against Tenant administration > Roles in the portal. Every built-in role must be there, custom roles must say custom, and the counts must match. A missing role definition means the read is paged wrong.",
        "Pick a role assigned to a GROUP and confirm the group is named, not a GUID, and that its type reads 'group'. Then pick one assigned to a USER directly and confirm the same. Both come out of one getByIds call — if one type resolves and the other does not, the types list in the resolver is wrong.",
        "Find an assignment limited to scope tags and confirm the tags are named. Then check the same assignment in the portal. A tag shown as a GUID means the expand was refused AND the scope-tag list could not be read — the report says which, and both being silent would be the bug.",
        "Find an assignment scoped to specific groups and one scoped to all devices, and confirm they read differently. Then look for one with NO resource scopes: it must say 'not stated by Graph' and produce an observation, not the word 'All'. This is the deliberate difference from the PowerShell original and the one most likely to be argued with.",
        "Switch 'show roles with no assignments' on and off. The list must change without a second read — watch the progress line stay empty. If it re-reads, the toggle is wired to run() instead of render().",
        "Delete a group that holds a role assignment (in a test tenant) and re-run. The member must show as its GUID with type 'unresolved', and the observation about unresolved members must appear. A blank there would be a silently empty role.",
        "Read the observations out loud to somebody who owns the tenant. They should be able to say 'yes, that is fine, because…' for each one. If any of them reads as an accusation rather than a note, the wording is wrong — this is explicitly not a compliance score.",
        "Check the many-members threshold is printed on screen where the observation appears. It is arbitrary and it has to say so, or somebody will treat 10 as a standard.",
        "Export the CSV and confirm it has one row per MEMBER, that an assignment with no members still gets a row saying so, and that the Entra caveat is in the Markdown and HTML. A CSV where an empty assignment vanishes is a row an access review never sees.",
        "Run as an account with DeviceManagementRBAC.Read.All but WITHOUT User.Read.All. Names must fail as a whole, the report must say every principal is a GUID, and it must still render. Half a report that admits it is half is fine; one that shows GUIDs with no explanation is not.",
        "NOT COVERED BY THE HEADLESS TESTS: whether the combined $expand actually works on a live tenant. The suite proves both the expand path and the fallback, using responses shaped the way the API documents them. Only a tenant proves which one it takes.",
      ],
      staying: [
        "No PIM. Eligible-versus-active assignment of Entra roles is a different API and a different scope, and half-reading it would suggest this report covers Entra when its whole point is saying it does not.",
        "No write. Removing somebody from a role is a one-click way to lock an administrator out of their own tenant, and TUNO holds one write scope for one tool on purpose.",
        "No score, no grade, no traffic light. The observations are facts about the tenant; scoring them would need a policy this tool has no way to know.",
        "The high-privilege list is four built-in roles, named in the code with the reason each is on it. Custom roles are not assessed for privilege — the permission set is readable, but judging it would be inventing a standard rather than reporting one.",
      ],
      files: ["js/roles.js", "js/app.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 26,
      title: "T06 — Intune device analyzer",
      tools: ["🖥 Device analyzer"],
      builds: [10330],
      risk: "medium",
      what: "A sixth tool, js/devicewhy.js: DeviceWhy (engine) + DeviceWhyTool (screen), a tile, a screen, a tab and an entry in HISTORY_SCREENS. Finds a managedDevice by name, serial, Intune device id or Entra device id, reads its Entra transitiveMemberOf via the /devices(deviceId='…') alternate key and the primary user's transitiveMemberOf, builds a via-map and hands it to GroupUse.analyze() with tenantWide forced on. Joins deviceConfigurationStates and deviceCompliancePolicyStates onto the rows for an INTENDED-versus-ACTUAL pair of columns, and computes a per-policy verdict where an exclusion beats an inclusion. Adds ONE scope, Device.Read.All, to graph.js, the registration script and SECURITY.md.",
      why: "MEDIUM — nothing breaks in production without it, but two things in it can only be judged against a real tenant. FIRST, $filter support on managedDevices is not documented per property and tenants differ; the code tries each filter on its own, records refusals, and falls back to listing the inventory. Nobody has yet seen which branch a real tenant takes. SECOND, matching a reported state to a policy is heuristic — the state record's id usually carries the policy id and displayName is the only other handle — so a tenant with duplicate policy names is the case that decides whether 'ambiguous, therefore unknown' is the right call or too conservative. It graduates when someone has used it to settle a real 'why has this laptop not got the policy' ticket.",
      test: [
        "THE ONE THAT MATTERS: take a device you KNOW should be getting a policy through a group, and confirm the row appears and names that group. Then take one you know is excluded, and confirm it says Excluded rather than being absent — an exclusion missing from this report is indistinguishable from a policy that was never assigned.",
        "Find the same device four ways — display name, serial number, Intune device id, Entra device id — and confirm all four land on the same record. If the Entra device id path 404s, the alternate-key lookup is wrong; if it returns a different device, something worse is.",
        "Check the line under the result that says how it was matched. On a tenant where $filter on serialNumber is refused, it must say the inventory was listed and how many devices were read. If a serial lookup is silently slow with no explanation, that message is not firing.",
        "Search for a device that does not exist. It must say no device matches, and — if the scan stopped at ten pages — that it stopped, with the count. A bare 'not found' after a truncated scan is a lie.",
        "Read the last check-in at the top against the same figure in the Intune portal. Then assign something new to the device's group and re-run WITHOUT waiting: every row must still be there and the check-in note must still be telling you it has not landed. That note is the point of the whole panel.",
        "Find a policy the device reports as non-compliant and confirm the Reported column says so next to an assignment that says it reaches the device. Intended and actual disagreeing is the case this tool exists for.",
        "Now the negative: find a policy assigned to the device that the device has NOT reported on, and confirm the state reads unknown with 'the device has not reported this policy' — not blank, and certainly not compliant.",
        "Deliberately run as an account WITHOUT Device.Read.All consented. The device's own group memberships must come back as UNKNOWN, with a note saying policy assigned to a device group is not in the report, and the primary user's half must still work. If it silently shows zero device groups, the whole tool is quietly lying.",
        "Create two policies with the SAME display name, both reaching the device. Their reported state must read unknown, and the report must carry the line saying a name matched more than one policy. Guessing here would attribute one policy's failure to the other.",
        "Find or create a filtered assignment reaching the device's group. The row must say 'may reach it' and name the filter, and the caveat must appear. If it ever says the policy definitely applies, the filter has been evaluated by something that cannot evaluate filters.",
        "A device with no primary user (a kiosk, a shared device): confirm All Users rows say they reach nobody here, and that the caveat about user-targeted policy appears.",
        "Export all three formats and check the check-in caveat is in every one. A report circulated without it is an assignment list somebody will read as a confirmation.",
        "NOT COVERED BY THE HEADLESS TESTS: whether Graph's per-device state ids really do carry the policy id. The suite proves the matching rule, using ids shaped the way the API documents them. Only a tenant proves the shape.",
      ],
      staying: [
        "No per-setting drill-down. deviceConfigurationStates carries settingStates, and showing which individual setting failed is the obvious next thing — it is also a second N+1 and a much longer screen, and the policy-level answer is what a ticket actually needs.",
        "No 'sync now'. This tool reads; making it able to poke a device would give a read-only tool a write scope for one button.",
        "No device search by partial name. Names, serials and ids match exactly, because a partial match over an inventory that cannot be filtered server-side means listing the whole estate to be helpful, and a wrong device confidently analysed is worse than a miss.",
        "Conditional Access is not here. It reaches this device too, and it needs scopes TUNO has no reason to hold — that is ENCA's half, as it is for T02.",
      ],
      files: ["js/devicewhy.js", "js/graph.js", "js/app.js", "index.html", "New-TunoAppRegistration.ps1", "SECURITY.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 25,
      title: "T05 — the platform list is fixed, with counts",
      tools: ["📄 Configuration documenter"],
      builds: [10329],
      risk: "low",
      what: "platforms() returns [Windows, macOS, iOS/iPadOS, Android, Linux, Not platform-specific] unconditionally rather than assembling from what the read returned, and new platformCounts() gives each one its count for the option text. The control is never disabled after a read. The option VALUE stays the bare platform name so the filter still matches; the count is display only.",
      why: "LOW — presentation. It reverses two judgements from 10328 and the reversal is the interesting part: a list built from the data changes shape per tenant so nothing is ever where you left it, and disabling the control on a single-platform tenant removed the ability to confirm an absence. Both were defensible and both were wrong once someone used them. It graduates on sight.",
      test: [
        "Read a single-platform tenant. All six options must be present, the platform you have carries its count, and the other four read (0). That zero is the point of the change.",
        "Pick a platform with (0) and confirm the list empties and the header says so rather than looking like a failure.",
        "Confirm the option VALUE is the bare name — pick a platform, then check the filter actually narrows. If the count leaked into the value, nothing will match and the list will look empty for every choice.",
        "On a mixed tenant, add the per-platform counts up. They will exceed the total, because a policy targeting two platforms is counted under both. That is intended; if they DO sum exactly, multi-platform policies are being counted once and the filter is lying about one of their platforms.",
        "Reset and confirm the list clears and the filters go back to disabled.",
      ],
      staying: [
        "The list is the five platforms Intune manages. A tenant with none of a given one still sees it, because confirming an absence is the question that motivated this.",
      ],
      files: ["js/document.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 24,
      title: "T05 — the platform filter is usable",
      tools: ["📄 Configuration documenter"],
      builds: [10328],
      risk: "low",
      what: "Reported as \"no platforms to filter\". Two faults. (1) The filters were live before a read, so an empty platform list looked like a bug rather than an absence — all three are disabled until there is data, with a hint saying the list comes from the tenant. (2) The vocabulary was inconsistent: settings catalog reports platforms as a string (\"windows10\", or \"windows10,macOS\" for two), everything else implies one through @odata.type, and both went into the list raw — so Windows appeared twice under two names, a two-platform policy was one opaque entry matching neither, and Graph's literal \"none\" showed as a platform. normPlatform() maps everything onto Windows / macOS / iOS-iPadOS / Android / Linux; platformsOf() returns an ARRAY; the filter matches any; a policy with no platform is filterable as \"Not platform-specific\"; Autopilot is Windows by definition, which nothing in its payload says. A single-platform read leaves the control disabled and names the platform in the option text.",
      why: "LOW — display and filtering only, no Graph call and no scope changed. It is worth a look on a real tenant anyway, because the normaliser is a set of prefix rules over @odata.type and Graph has hundreds of those. A type it does not recognise yields NO platform rather than a wrong one, which is the safe direction, but it means a whole class of policy could quietly land under \"Not platform-specific\". It graduates when the list on a mixed-estate tenant matches what an admin would say their estate is.",
      test: [
        "THE ONE THAT MATTERS, and it needs a mixed tenant: read everything and open the platform list. It must name each platform ONCE. If Windows appears twice, or a raw token like windows10 is in there, the normaliser missed a spelling.",
        "Pick Windows and count. Then pick macOS. The two counts plus \"Not platform-specific\" should account for every object — if they do not, something is being dropped or double-counted.",
        "Find a settings-catalog policy targeting two platforms and confirm it appears under BOTH, and that its row shows two chips.",
        "Filter to \"Not platform-specific\" and read what is in there. Scripts, assignment filters and scope tags belong. A device configuration in that bucket means its @odata.type is a shape normPlatform does not know, and is worth reporting.",
        "Before pressing Read, confirm all three filters are disabled and the hint explains why. This is the state that was reported as broken.",
        "On a single-platform tenant, confirm the control stays disabled and its one option names the platform rather than sitting empty.",
        "Reset and confirm the filters go back to disabled and the platform list empties — a stale list from a previous read would filter against data that is no longer there.",
      ],
      staying: [
        "Windows Phone, Windows Holographic and Windows 10X fold into Windows. They are Windows for the purpose of finding a policy, and separate entries would be noise in every tenant that has none of them.",
        "iOS and iPadOS are one entry. Intune targets them together on most surfaces and splitting them would invent a distinction the data does not carry.",
      ],
      files: ["js/document.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 23,
      title: "T05 — popout, selection, and exports that follow it",
      tools: ["📄 Configuration documenter"],
      builds: [10327],
      risk: "low",
      what: "Three changes to T05, all UI. (1) Clicking a policy opens ENCA's modal (.modal-bg / .modal.gu-modal / .gu-m-head|body|foot, all already in the stylesheet) instead of expanding inline; Escape and the Close button both dismiss it, and it carries assignments, description, source endpoint, the settings table, a tick box and a copy-as-Markdown. (2) Per-policy checkboxes, a section-level tick in each heading, and a .selbar above the list with select all / select what is shown / invert / select none. (3) The exports read selectedSections() rather than current(), so they follow the SELECTION and not the filter; everything is selected after a read; export buttons hide when nothing is. scopeLine() gained a bySelection branch so a short document says whether a person chose it or a filter produced it. Also sets js/version.js released, which 10326 left at the previous evening's value.",
      why: "LOW — no Graph call changed, no scope changed, and the redaction path is untouched (the popout renders rows that were already redacted when they were built, which a mutation test confirmed there is no second path to break). The thing to actually look at is whether the selection model is comprehensible in front of a real tenant: four hundred policies, a filter, and a set of ticks that deliberately does NOT follow that filter is either obviously right or quietly confusing, and a headless test cannot tell which. It graduates on someone using it to produce a real document.",
      test: [
        "THE ONE THAT MATTERS, and it is a judgement rather than a check: read a tenant, filter to something narrow, tick three policies, clear the filter, and export. You should get three. If that behaviour surprises you in the moment, the model is wrong however well it tests — say so and it changes.",
        "Click a policy. The popout must open over the list without moving it, and closing it must leave you exactly where you were. That is the whole reason it stopped being an inline expander.",
        "Escape and the Close button must both dismiss it. Open one, press Escape, open another — no leaked key handlers, no stacked backdrops.",
        "Open a policy with a secret in it (a Wi-Fi profile with a pre-shared key) and confirm the popout shows the redaction marker, not the value. This is a second render path for the same data and it deserves its own look even though the rows arrive already redacted.",
        "Tick the box inside the popout and confirm the count in the bar moves without the popout closing.",
        "Select none, and confirm the three export buttons disappear rather than producing an empty document.",
        "Export with a partial selection and read the header: it must say A SELECTION with both counts, not A FILTERED VIEW. Then narrow with a filter, use 'select what is shown', and confirm it still says A SELECTION — because it is one.",
        "Tick a section heading and confirm the whole section follows, then untick one row and confirm the heading box clears.",
        "On a tenant with several hundred policies, check the list still feels responsive — every tick re-renders the whole list, which is fine at four hundred and would not be at forty thousand.",
        "NOT COVERED BY THE HEADLESS TESTS: whether the popout looks right. The suite proves it opens, carries the right content, redacts, and closes on Escape. It cannot see it.",
      ],
      staying: [
        "PDF. Still queued; the standalone HTML carries print rules meanwhile.",
        "No multi-select by shift-click or drag. Select-all, select-shown and invert cover the cases that came up; ranges can wait for someone to ask.",
        "The other four tools keep their inline detail. T05 needed a popout because its rows are long; T02's assignment rows are not, and changing them for symmetry alone would be churn.",
      ],
      files: ["js/document.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 22,
      title: "The summary strips and result cards get their spacing back",
      tools: ["\ud83d\udc65 Group use", "\ud83d\udd53 Change audit", "\ud83d\udcbe Backup", "\ud83d\udcc4 Documenter"],
      builds: [10326],
      risk: "low",
      what: "The sticky summary strip in T02-T05 carried class=\"list-card gu-sticky\". .gu-sticky sets padding:10px 0 because it is a strip on the page background \u2014 ENCA's markup is a bare div \u2014 so adding a card's border round it framed the heading and pills with no horizontal inset. The card class is gone from all five call sites. .gu-sticky also moves from a hardcoded top:106px to var(--sticky-nav). Separately, .list-card carries no padding of its own and the four newer tools never set any, so #guBody/#auBody/#bkBody/#dcBody direct-child cards now get 16px 18px. And .gu-stat is compacted: padding 4px 12px to 2px 10px, 12.5px to 12px, figure 14px to 13px, gap 8px to 6px.",
      why: "LOW \u2014 CSS and one class name removed from five markup strings; no logic anywhere. It graduates on sight across the four tools, which is four screens rather than one, and the padding rule is scoped by id so a fifth tool added later will need adding to it.",
      test: [
        "Open Group use, Change audit, Backup and Documenter in turn and run each one. The summary strip must read as a strip on the page, not a bordered box, with its heading and pills clear of the edges. Four screens, one change \u2014 but look at all four, because the id-scoped padding rule covers exactly these four and nothing else.",
        "Scroll each tool with results on screen: the strip must stick BELOW the header and tab bar, not behind them. That is the same class of bug this build fixes in a second place, so it is worth watching rather than assuming.",
        "THE ONE TO WATCH: confirm no card ANYWHERE ELSE moved. .list-card still carries no padding of its own and every other card in the app sets its own inline \u2014 if T01, Help, the Roadmap or What's new have shifted, the rule is not as scoped as it looks.",
        "Read the pills at their new size on a normal display and on a scaled one. If the figures are now hard to pick out from their labels, the compaction went too far and .gu-stat b should go back up a point.",
        "Check a strip with a failure pill in it (make a surface fail to read) \u2014 the red-bordered variant must still be legible at the smaller size.",
      ],
      files: ["css/app.css", "js/groupuse.js", "js/audit.js", "js/backup.js", "js/document.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 21,
      title: "T05 — Configuration documenter (browse + Markdown/HTML/Word)",
      tools: ["📄 Configuration documenter"],
      builds: [10325],
      risk: "medium",
      what: "A fifth tool: js/document.js (engine + screen), tile, screen, tab, Help, roadmap. Thirteen sections read once — settings catalog (with its settings), device configurations, ADMX (with definition values), compliance, app protection, app configuration, scripts and remediations, Windows update profiles, enrolment, Autopilot, applications, assignment filters, scope tags. Browse view with search across names/descriptions/settings, platform and assignment-state filters, and per-policy expansion. Exports Markdown, standalone HTML and Word (.docx via JSZip, ENCA's text-document writer ported and extended with real w:tbl tables). Assignments resolved to group names once for the whole document. Redaction by key regex, unconditional. Filters apply to exports and every export header states the counts.",
      why: "MEDIUM. It writes nothing, but it produces the artefact most likely to leave the organisation, and the failure that matters is a redaction miss — a script body or a certificate in a document somebody emailed cannot be recalled. The regex is keyed on field NAMES, so a secret in a field whose name it does not recognise goes through. That is the thing to attack. Second concern: the generic flattener has to make sense of thirteen different Graph shapes, and a shape it renders as unreadable noise makes the document worse than the portal. It graduates when a document generated from a real tenant has been read end to end by someone who knows that tenant, with an eye for both.",
      test: [
        "THE ONE THAT MATTERS — ATTACK THE REDACTION. Create a Wi-Fi profile with a pre-shared key, a certificate profile, a custom OMA-URI with an encrypted value, and a PowerShell script. Generate all three formats and SEARCH each for the secret. Any hit is a disclosure bug, not a cosmetic one. Then look for fields carrying secrets whose NAMES the pattern would not match — that is the known weakness and the reason this is the first step.",
        "Read a generated Word document as an auditor would. Settings must arrive as tables, headings must be navigable, and nothing may be a wall of camelCase. If a section reads as noise, the flattener needs a dedicated renderer for that shape the way settings catalog and ADMX already have.",
        "Filter to one platform, export, and confirm the document holds only that platform AND says how many of how many it contains. A filtered document that reads as complete is the second-worst outcome after a leak.",
        "Find a policy whose settings cannot be read (an account without the settings-catalog scope, or a policy Graph refuses) and confirm it is still LISTED with the gap stated — not dropped. This is deliberately the opposite of the backup tool's rule and both are right for their job.",
        "Untick all but one section and run. Only that section's scope may be requested; the consent prompt is the test.",
        "Run against a tenant with several hundred policies. Settings catalog and ADMX each cost a request per policy, and it must not stall — if it takes minutes, the bounded pool is not being used.",
        "Open the standalone HTML in a private window with no tenant access, then print it to PDF. It must be readable and must not break policies across pages badly. This is also the interim answer for PDF until 10326 lands.",
        "Check the group names in assignments are names, not GUIDs. If they are GUIDs, the directory scope was refused — and the document must say so at the top rather than leaving the reader to wonder.",
        "NOT COVERED BY THE HEADLESS TESTS: whether the document is any good. The suite proves redaction fires on known key shapes, that filters flow into exports, that counts are stated and that a failed section is named. It cannot judge readability, and it cannot prove the redaction regex is complete — nothing can.",
      ],
      staying: [
        "PDF. Queued as 10326 with jsPDF; until then the standalone HTML prints cleanly, which covers most of the need.",
        "No branding or cover-page customisation. The original offers logo, colours and a classification banner; that is polish and this is not polished yet.",
        "No Conditional Access section. It needs Policy.Read.All, which this registration does not hold — and ENCA documents CA properly already.",
      ],
      files: ["js/document.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 20,
      title: "T04 — Backup Intune configuration",
      tools: ["📦 Backup configuration"],
      builds: [10324],
      risk: "medium",
      what: "A fourth tool: js/backup.js (engine + screen), tile, screen, tab, Help, roadmap, and vendor/jszip.min.js (MIT, bundled rather than CDN so the CSP keeps refusing every origin but Microsoft's). Five areas over ten beta endpoints. Folder layout and safeFileName() match backup-intune-configuration.ps1 EXACTLY for interop in both directions. The three N+1 areas (settings-catalog settings, ADMX definitionValues, script bodies) run through Graph.pool with per-item error capture instead of the original's serial 100ms sleep. An object whose detail fails is EXCLUDED from the archive; an area that fails marks the archive partial. Manifest keeps the original's four fields and adds a per-file index (type, surface, restorable), the source tenant, and an explicit caveats list. Optional skip-script-bodies, with every affected file marked not-restorable.",
      why: "MEDIUM. It writes nothing to the tenant, so the risk is entirely in the archive being trusted later. The failure that matters is an archive that looks complete and is not — and R09 will restore from these, so a wrong file here becomes a wrong policy in a tenant. The exclusion rule and the partial marking are the defences and both need checking against a real tenant. It graduates when an archive taken from a real tenant has been opened, its manifest reconciled against the portal's object counts area by area, and one settings-catalog policy compared field-for-field against what the portal shows.",
      test: [
        "THE ONE THAT MATTERS: take a backup of a real tenant, open the zip, and reconcile the manifest counts against the portal blade by blade. A count that is short means objects were dropped; a count that matches but with a wrong file inside is what the next step catches.",
        "Open a SettingsCatalog file and compare its settings array against the same policy in the portal. This is the area where the list endpoint returns only a count, so if the extra read failed silently the file will have a name, a platform and no settings.",
        "Open an AdmxPolicies file and confirm definitionValues is populated with presentationValues inside it. Same failure mode.",
        "Open a PlatformScripts file and confirm scriptContent is a base64 string, not null. The list endpoint ALWAYS returns null here, so a null means the per-object read did not happen.",
        "Tick 'leave script bodies out' and take another backup. Every script file must be marked notRestorable in the manifest, and the caveats array must say so. An archive that cannot restore scripts and does not admit it is the exact bug this flag inherits from the original.",
        "Sign in as an account that can read some areas but not all — or untick one area — and confirm an unreadable area appears in unreadableAreas AND the on-screen banner says the archive is PARTIAL. Silent partial archives are the failure this tool must not have.",
        "Back up a tenant with a policy whose name contains a slash, a colon or a quote. The filename must have those replaced with underscores and must still end in _<id>.json — this is what keeps the names round-trippable with the PowerShell script.",
        "INTEROP, BOTH WAYS: run the PowerShell original against the same tenant and diff its folder against the zip's. Names and layout must match. Then point the original's restore script at the extracted zip and confirm it finds the folders. That is the whole reason the layout was copied rather than improved.",
        "Take a backup of a tenant with several hundred policies and watch the progress. It must not stall — the N+1 runs bounded-concurrent, and if it takes the original's serial time something is falling back to a loop.",
        "NOT COVERED BY THE HEADLESS TESTS: the zip itself. The suite proves the file list, names, manifest and exclusion rules against stubbed Graph responses. It does not run JSZip, so it cannot prove the archive opens.",
      ],
      staying: [
        "No restore. R09 is a separate item and a separate risk — it is the second thing in TUNO that would write to a tenant.",
        "No scheduling. The original can run as a runbook on a timer; a static site cannot, and pretending otherwise would be worse than the gap.",
        "Assignments are captured but group names are not resolved. A restore into a different tenant cannot use the ids anyway, and resolving them would need a second scope for a field nothing reads yet.",
      ],
      files: ["js/backup.js", "vendor/jszip.min.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
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
