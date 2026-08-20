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
      n: 35,
      title: "A beta scan sends you to the beta site",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10348],
      risk: "low",
      what: "Invoke-TunoAppLockerScan.ps1 hard-coded tuno.limon-it.nl in its closing 'Next' section, so a beta copy of the script told the operator to upload the bundle to production. It now derives its channel from $script:TunoBuild using the same >= 10000 rule as js/version.js, sets $script:TunoSite accordingly, and a beta build says so explicitly at the point it names the site. The banner gained the version, channel and build; the bundle's generator block gained tunoBuild, channel and site. check-script-versions.js asserts the channel is derived rather than hard-coded, so a literal host cannot creep back. The guard also stopped demanding a ScriptVersion bump when only the build stamp moved - ScriptVersion tracks behaviour, TunoBuild tracks the release, and conflating them would inflate the version until it meant nothing.",
      why: "LOW — console text, two constants and a bundle field. No scanning, analysis or rule generation changed. It matters more than it looks because the two channels are different builds of the tool and a bundle written by a beta scan can carry fields production does not read, but the change itself is small and graduates on one run.",
      test: [
        "Download the scan from the BETA site and run it. The banner must say BETA and the build number, and the closing section must name nurejev.github.io/tuno-beta — not tuno.limon-it.nl. That is the whole item.",
        "Open the bundle and confirm generator.channel says beta and generator.site matches. A bundle that cannot say which channel produced it is why this was worth fixing.",
        "Once a build reaches production, download from tuno.limon-it.nl and confirm the same script says production and names the production site. The rule is derived from the build number, so this is the case nobody will think to check.",
        "Confirm the beta warning appears only on beta builds — a production copy telling people to go to the beta site would be worse than the bug it replaced.",
        "Edit either script without bumping ScriptVersion and confirm the guard fails; then change ONLY the build stamp and confirm it passes. Both halves matter: the first is the rule, the second is why it does not become noise.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Convert-TunoAppLockerToIntune.ps1", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 34,
      title: "NotConfigured does not mean off",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10347],
      risk: "high",
      what: "The DLL collection was shipped inside a NotConfigured rule collection and described everywhere as 'present and inert'. Microsoft's documentation says the opposite: 'if any rules exist in a rule collection that is not configured, the rules WILL be enforced ... you should avoid using this value in your AppLocker policies.' So the generated policy would have ENFORCED DLL control, against only the DLLs a given scan found. Fixed in all three producers — the scanner's ConvertTo-AppLockerPolicyXml, T01's intuneProfile(), and Convert-TunoAppLockerToIntune.ps1 — by OMITTING the DLL collection, absence being the only inert state. NotConfigured is no longer written into a generated policy for any collection. The same misreading was in the analysis of IMPORTED policies: the audit reported a NotConfigured collection as default-allow, and evaluateApp/evaluateProbePath treated it as unenforced. Both now depend on whether the collection carries rules, via a single isEnforcing() helper, and a NotConfigured collection with rules is a High finding that says it is blocking today while reading as inactive.",
      why: "HIGH — this changes generated policy AND changes verdicts on imported policies, in both directions. Rules that were reported as not enforced may now be reported as enforced, which is the correct answer and will look like a regression to anyone who trusted the old one. It is the most consequential correction in this tool so far and it was found by reading two checklist lines against each other, not by a test — so the thing to check is whether any OTHER assumption about enforcement modes is still wrong.",
      test: [
        "THE ONE THAT MATTERS: generate a policy and confirm the string EnforcementMode=\"NotConfigured\" appears NOWHERE in the Audit XML, the Enforce XML, or the Intune profile JSON. Then confirm there is no Dll rule collection at all. If DLL is present in any state, the fix did not take and the policy enforces DLL.",
        "Run Convert-TunoAppLockerToIntune.ps1 against a policy that HAS a Dll collection and confirm it is dropped with a note, and that -EnforceDllCollection includes it and says it will block. The converter takes third-party XML, so this is the path where somebody else's NotConfigured collection arrives.",
        "Import a policy with a collection set to NotConfigured that CARRIES RULES. The audit must report it High and say the rules are enforced. Then delete the rules and confirm the verdict flips to 'nothing restricted'. Those are opposite answers from the same enforcement mode and getting them the wrong way round is the whole bug.",
        "On that same policy, check the Microsoft coverage table: with a NotConfigured collection carrying rules it must evaluate the apps rather than reporting 'not enforced'. Before this build it reported unenforced and would have told you OneDrive was fine when it was blocked.",
        "Confirm a NotConfigured collection with ZERO rules still reports as nothing-restricted, and still offers the one-click AuditOnly fix. The empty case did not change and must not have.",
        "Re-check the deploy path end to end on a pilot device: apply the generated audit profile and confirm DLL loads are neither blocked nor logged. That is the outcome the old code claimed and did not deliver.",
        "Read the checklist section on NotConfigured against Microsoft's page and confirm the three states are stated correctly. It is the artefact customers will be handed, and it now contains the reasoning rather than an instruction.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Convert-TunoAppLockerToIntune.ps1", "scripts/AppLocker-Implementation-Checklist.md", "scripts/README.md", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 33,
      title: "A checklist to work down, and scripts that admit their version",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10346],
      risk: "low",
      what: "scripts/AppLocker-Implementation-Checklist.md is a new downloadable, offered beside the converter in step 5 and listed in the scripts README: every check that has to pass before an AppLocker policy is enforced, from reading the XML through coverage, the audit period, enforcement in rings and living with it, ending with the things that catch people out. Separately, both PowerShell scripts were still declaring version 1.0.0 after builds 10344 and 10345 changed them substantially, so a scan bundle could not be traced to the build that wrote it. They now carry $script:ScriptVersion (their own history) and $script:TunoBuild (the site build that served them), the scan is at 1.2.0 and the converter at 1.1.0, and a headless test asserts TunoBuild against js/version.js so the drift cannot be committed again.",
      why: "LOW — a document and two constants. No analysis, no rule generation and no deploy path changed. The checklist is prose and graduates on being read; the version stamps graduate on one scan printing the right number in its banner. Worth promoting alongside 31 and 32 rather than on its own, since it is those builds' provenance it fixes.",
      test: [
        "Download the checklist from step 5 and read it end to end. It is the artefact, so the test is whether an admin who has never used TUNO could work down it and be safe — if a section needs the tool to make sense, it is written wrong.",
        "Check the checklist against your own last rollout: does it name the thing that actually bit you? A checklist that misses your real outage is worse than none, because it grants confidence. Anything missing is worth adding before this goes to production.",
        "Run the scan and confirm the banner reads v1.2.0 and not v1.0.0 — this whole item exists because it did not.",
        "Open the bundle and confirm generator.version and the build stamp identify the build that produced it. Trace a bundle back to a commit; if you cannot, the provenance is still broken.",
        "THE ONE THAT MATTERS FOR THE FUTURE: edit either .ps1 without touching $script:TunoBuild and run the headless suite. It must FAIL. A guard that does not fail when the mistake is made is decoration.",
        "Confirm all three downloads in the tool still work from the beta host and that the .md arrives as a file rather than rendering in the tab.",
      ],
      files: ["scripts/AppLocker-Implementation-Checklist.md", "scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Convert-TunoAppLockerToIntune.ps1", "scripts/README.md", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
    {
      n: 32,
      title: "Scan a reference machine, and say so",
      tools: ["🔐 AppLocker builder & validator"],
      builds: [10345],
      risk: "high",
      what: "The scan states its central assumption and checks it. Step 1 and the script header now say CLEAN REFERENCE MACHINE, and explain that the policy means \"everything on this machine is allowed and nothing else is\" — sound from a fresh image, and a way of handing back two years of accumulation from a working laptop. Test-ReferenceMachine counts profiles and profile executables and looks for the tells of a used device (Downloads, Desktop, Chrome profile, per-user Programs, node_modules, .vscode, .nuget, .git); a fail prints a STOP AND READ block, lands in the bundle as referenceMachine, and renders in T01 as a High finding with the evidence quoted. A pass renders at Info. The two sanctioned install routes are now NAMED in the generated policy — explicit allow rules for %WINDIR%\\IMECache and the Intune Management Extension folder in Exe/Script/Dll and Msi, and the administrator rules say in their descriptions that they are the other route. IME paths are protected from being excepted out of the default allows, checked both on the raw writable list and again on the compressed exception list; a writable IME directory becomes a warning instead. User profiles are recorded once rather than walked, and non-profile directories are inventoried first so -MaxArtifacts cannot be spent before Windows and Program Files are covered.",
      why: "HIGH — this changes what the generated policy CONTAINS, on the tool whose output is meant to be enforced on endpoints. The IME rules are new allow rules; the profile change alters what evidence the bundle carries and therefore which findings appear; and the reference-machine verdict is a new High finding that will fire on most real scans, correctly. Like everything else in this script it is unexecuted here — no PowerShell runtime — so the PowerShell half is verified by argument and the browser half by 79 headless tests. It graduates when a scan of an actual reference image produces a policy in which the IME rules are present and no IME path has been excepted.",
      test: [
        "THE ONE THAT MATTERS: run the scan on a real reference image and on a used laptop. The first must report the profiles as clean at Info; the second must print STOP AND READ and produce a High finding in T01 naming what it found. If a used laptop passes, the tells are too narrow and the check is worse than nothing because it grants false confidence.",
        "Open the generated Audit XML and confirm the IME rules are present in Exe, Script, Dll and Msi, and that NO exception path covers %WINDIR%\\IMECache or the Intune Management Extension folder. This is the rule set that would be deployed; the check is on the artefact, not on the console output.",
        "Make an IME folder user-writable on a test machine, re-scan, and confirm the scan REFUSES to except it and warns instead. Then confirm Win32 app delivery still works with the resulting policy applied in audit. Breaking software deployment is the failure this guard exists to prevent and it fails silently and days late.",
        "Deploy the audit policy to a pilot device and install something from the Company Portal. It must work. Then run a remediation script from Intune. It must run. Those are the two IME paths the rules name, and neither is exercised by anything else on this list.",
        "Compare the writable-path count against the previous build on the same machine: the profile rows should collapse to one per profile. Confirm the artifacts from the profile are STILL inventoried — the point is to stop enumerating the directories, not to stop looking at what is installed in them.",
        "Run with -Scope System,ProgramFiles,UserProfiles and a deliberately low -MaxArtifacts. Windows and Program Files must be inventoried before the cap is reached. If profile contents still crowd them out, the ordering did not take.",
        "Upload a bundle from BEFORE this build. It must open and show no reference-machine finding at all, rather than inventing a verdict from a missing field.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/README.md", "js/applocker.js", "js/changelog.js", "js/version.js", "js/promote.js", "index.html"],
    },
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
