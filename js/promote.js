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
//     number. "Push 3" has to mean one decision. The Help table FOLDS
//     related items (same tool, read off tools[] — see PROMOTE.groups) so
//     "all of T01" is one tick; that is a view, and each item under it
//     keeps its own tick so one can be held back. It never changes what an
//     item is.
//   * Never queue documentation (roadmap cards, changelog entries, this
//     file): it travels with whatever promotion happens next.
//   * PROMOTING AN ITEM IS FIVE STEPS: 1) delete the item here and bump
//     `productionBuild`; 2) set the roadmap card ON MAIN to `live · build
//     NNN`; 3) set the SAME card ON BETA to `live · beta NNNNN · production
//     NNN` (the step that gets missed); 4) add the changelog entry on both
//     channels; 5) RELABEL THE CHIPS ON MAIN — BETA is channel language and
//     never ships to production: a tool new to production wears NEW, one an
//     item changed wears UPDATED, the rest wear nothing (Mihai's rule,
//     production build 10; main-check enforces it). That is the TILES and
//     the roadmap cards: the screen heads relabel themselves since 10663 —
//     toolHeadInner() leaves the status chips out on a production build. Before promoting, verify each item against what `main`
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
  // Verified against `git show main:js/version.js` — main is at build 13.
  // Promotions: items 1-13 (beta 10301-10317) as build 3, items 14-19
  // (10318-10323) as build 4, items 20-29 (10324-10336) as build 5, items
  // 30-35 (10342, 10344-10348) as build 6, items 36-40 plus 45-52 and
  // 54-57 (10350-10356, 10361-10376; 53 retired into 57) as build 7, and
  // items 44, 58, 59 and 63-67 (10360, 10378-10380, 10384-10405 less the
  // held builds) as build 8 — the second partial promotion.
  //
  // Build 10 is main-only: the chip relabel (BETA off production, NEW and
  // UPDATED on), a channel transform like the roadmap tags, made a standing
  // promotion step at the same time.
  //
  // Items 41-43, 60-62 and 68-96 (beta 10357-10448) went as build 9 — the
  // FULL-QUEUE promotion, and the first ordered by the exported promotion
  // file (item 93's own feature, eating its own dog food).
  //
  // Items 97, 98 and 100-102 (beta 10451-10457, 10460-10463) went as build
  // 11 — a PARTIAL promotion that held item 99 back.
  //
  // Items 99-122 (beta 10458-10459, 10465-10517) went as build 12 — the
  // second full-queue promotion, ordered by the exported file. A NUMBERING
  // SLIP is recorded here rather than repaired: after 10464 the queue handed
  // 100, 101 and 102 out AGAIN to new work (10465-10467), so this ledger
  // names 100-102 twice and the two mentions are DIFFERENT work — build 11's
  // are the AppLocker-era items, build 12's the roadmap, field-look and chip
  // items. Numbers exist to be permanent precisely so that cannot happen;
  // the numbers stay as history wrote them, and the next item takes 123.
  //
  // Items 123-131 (beta 10519-10533) went as build 13 — the third
  // full-queue promotion, ordered by the exported file. Two tools reached
  // production (T24 macOS baseline, T25 device cleanup), the sign-in
  // prefetch went app-wide, and the registration gained its first
  // directory-device write scope (Device.ReadWrite.All, item 131).
  //
  // The queue emptied at 10534 and REFILLED the same day: items 132-135
  // are the T16 member counts, the T15 MDE baseline, the new T26, and the
  // layout round — the fourth promotion-in-waiting. (This paragraph said
  // "THE QUEUE IS EMPTY" until 10551, thirteen builds after it stopped
  // being true — the ledger is hand-maintained and this line is its rot.)
  productionBuild: "v1.0.13",

  items: [
{ n: 256, title: "T28 — the check-in status read answers on PVM (the forms tried in order, the first that answers kept), failures said once, card toolbars static", tools: ["T28 MDE rollout"], builds: [10694], risk: "low", what: "js/mdelanding.js: readStatus probes the first assigned policy through SHAPES in order — cached (the cached report as Microsoft Learn's example: id, filter, orderBy, select; getCachedReport with id, filter, orderBy, select, skip, top), cached-base (the same, the filter extended with the four PolicyBaseTypeName values the per-device report names), action (getConfigurationPolicyNonComplianceReport, filter + top + skip, T12's way) — and reads the rest in the form that answered (Graph.pool, 3 wide). A refusal is a GraphError of kind graph/notfound, a configuration whose status is failed, or one that never completes; auth/admin/throttled/network errors end the read in every form. The first policy refused in every form hands over to the second; refused there too, every remaining policy is failed with the one answer and never asked. errText puts the HTTP status in front of Graph's message. The model carries shape, shapeTried, failedText (failedSummary: grouped by answer, '52 of 52 policies — 400 An error has occurred.', up to three distinct failures naming their policies) and shapeNote (the refusals and the form that answered, with the ask to compare one policy with the portal). js/mderolloutv2.js: the pane notice, the status line and projectSource('landing') use them; js/mdereports.js: the Landing check's notes too. css/t28v2.css: #screen-mderollout .list-card .toolbar is static (position, margin, padding, shadow). Help paragraph; T28 0.43.", why: "Mihai, 7 Oct, off a screenshot of the cockpit on PVM: 'i did a redesign and now i have alot or errors' — the Data details card for Policy check-in status read 'Partial' with fifty 'An error has occurred.' in a row. Every form of the per-policy status report that Microsoft documents is tried before the read gives up, the one PVM answers is kept for the session's read, and whatever Intune says is said once with its status code so the next refusal can be diagnosed from the screen. Risk low: reads only — no group, policy or device is written; the action fallback carries the same delegated scope (DeviceManagementConfiguration.Read.All) T28 already holds; the demo and every suite keep the first form.", test: ["npm test: 50 suites green; tests/mderollout/landing.test.js 65 checks — the documented create body (no reportName, no metadata; getCachedReport repeats filter and select; a quote doubled), PVM's answer (both cached forms refused with 400 on the first policy, the action answers, the other three read through the action only, the base-type filter named, T12's body for the action, rows shaped alike, the model's shapeNote), every form refused on the first and the second policy (the other two never asked, one sentence, failedSummary '4 of 4 policies — …'), one deleted policy (404) not condemning the read, an auth error not a refusal (one call), a configuration that fails to build moving on, a shape handed in", "Chromium, the demo with Graph.post patched to refuse cachedReportConfigurations: Data details Read, the pane's notice names both refusals and the action, the status line says read through getConfigurationPolicyNonComplianceReport, the Landing check carries the note; with every form refused: Data details Partial with ONE line, the pane one notice, the tiles 4 status unreadable; the member card's chips above the table with no gap at 1440", "Only Mihai, on PVM: open T28 → Waves → Verification — Data details should say Read (or Partial with one line naming what Intune answered in every form); the pane says which form answered; compare one policy's landed / expected with the portal's View report"], files: ["js/mdelanding.js", "js/mderolloutv2.js", "js/mdereports.js", "css/t28v2.css", "tests/mderollout/landing.test.js", "index.html (?v=)", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 255, title: "Self-hosting — TUNO–ENCA parity slices 18 and 19: the image (Dockerfile, selfhost/nginx.conf, the ghcr.io/nurejev/tuno :beta / :latest workflow), the entrypoint (TUNO_CLIENT_ID / TUNO_TENANT_ID / TUNO_AUTHORITY / TUNO_BRANDING / TUNO_BRANDING_URL) and the first paint from the deployment's brand (ENCA 25195, 25230, 25231, 25357, 25369, 25389, 25390)", tools: ["All tools"], builds: [10693], risk: "low", what: "Dockerfile (nginx:1.27-alpine, COPY ., the web-root copy of the entrypoint removed, 755/644, ENTRYPOINT /docker-entrypoint-tuno.sh) and .dockerignore (.git, tests, node_modules, _to_delete, Claude outputs, the local-only pvm/ dovilo/ cloudfellows/ terraform/, js/authConfig.local.js, the deploy scaffolding). selfhost/nginx.conf: nosniff, SAMEORIGIN, no-referrer, Permissions-Policy in every location; no-store on index.html, selfhost-branding.json, js/selfhost-boot.js AND js/authConfig.js (ENCA's gap — the entrypoint rewrites it under an unchanged ?v=). selfhost/docker-entrypoint.sh (ENCA's, verbatim with TUNO names): the TUNO_* variables prepend window.TUNO_AUTH = Object.assign(…) between TUNO-RUNTIME-CONFIG markers, idempotent (awk, literal markers); a non-GUID or non-https value exits 1, an unwritable authConfig.js exits 1; TUNO_BRANDING (raw or base64) / TUNO_BRANDING_URL (wget, 10 s, 2 tries) → selfhost-branding.json, JSON-checked, never fatal, a read-only mount tolerated; the brand escaped as a JSON string into js/selfhost-boot.js between TUNO-RUNTIME-BRAND markers (≤600 KB), removed on a start without branding; TUNO_ROOT for the tests; nothing set = nothing changes. js/selfhost-boot.js reads window.TUNO_BRAND_BOOT between this browser's Apply and the cache (ENCA 25390). .github/workflows/docker.yml: checks (npm test, docker build + run + selfhost/check-headers.py, the entrypoint inside the image), publish only on push from nurejev/TUNO (tuno-beta's main carries beta code), buildx amd64 + arm64, :latest from main, :beta from beta. selfhost/docker-compose.yml, install.sh, install.ps1 (Docker checks with per-OS hints, :beta, the TUNO_* pass-through, the ./selfhost-branding.json mount), resolve-digest.sh (beta by default), check-headers.py (widened: no-store on the four paths, the entrypoint not served). SELF-HOSTING.md (beta-channel copy). .gitignore: /terraform/ — the Terraform deployment is local-only, its own repo for Azure Repos, not a TUNO change. Help: a Self-hosting paragraph under Security model; R41 slices 18–19 (the four shell suites' R41 tag regex widened for the ', 18–19'); CLAUDE.md: the image's rules.", why: "Mihai, 7 Oct: 'prepare a tuno (beta) self-hosted deployment, just like enca with terraform' — picked the image + the Terraform folder, a pinned digest of :beta (updates deliberate, between PVM waves), and committing when the tip is quiet. Reverses the 10 Sep skip, as the 1 Oct parity plan said. Risk low: the hosted sites load nothing new — js/selfhost-boot.js reads one more source that only a container start writes, and every other file is new and never loaded by index.html. The CSP is unchanged. AT PROMOTION: the beta URLs and the :beta tag in SELF-HOSTING.md, selfhost/install.sh, install.ps1, docker-compose.yml and resolve-digest.sh must become main / :latest (ENCA 25228's carve-out is slice 22; until it exists, by hand), and the GHCR package must be Public before the first pull.", test: ["npm test: tests/selfhost/entrypoint.test.js (new, 78 checks) — the entrypoint run against a copy of the site with TUNO_ROOT: nothing set = byte-identical files; the block above authConfig.js resolved in a browser (client id, tenant → authority, TUNO_AUTHORITY wins); idempotent; non-GUID / http / a quoted value → exit 1 and the file untouched; TUNO_BRANDING raw and base64 → the file and the first paint (palette, logo, favicon, hideOrgName, wide mark) with an empty localStorage; precedence Apply › deployment › cache; nothing in the brand can become code; non-JSON refused, never fatal; a mounted file reaches the first paint; the Dockerfile, .dockerignore, nginx.conf (the four no-store locations each repeat the headers), the workflow's repository guard and tags, compose and the install scripts on :beta", "In the cloud with nginx 1.24 over the tree and the ported config: check-headers.py green on nine paths (no-store on /, /index.html, /selfhost-branding.json, /js/selfhost-boot.js, /js/authConfig.js; none on /js/app.js and /css/app.css; the four headers on a 404); the Dockerfile's RUN lines emulated on a .dockerignore-filtered copy: 8.7 MB, no pvm/ dovilo/ cloudfellows/ terraform/ tests/ node_modules/, selfhost/ holds only nginx.conf; the entrypoint applied to it writes both blocks. The image itself was not built (no registry reachable from the session): the workflow's checks job is its first build", "Only Mihai: push beta, watch the docker image workflow publish ghcr.io/nurejev/tuno:beta, set the package Public; then bash selfhost/install.sh on the Mac (localhost:8080 is already a SPA redirect URI on the TUNO registration) and sign in; with TUNO_BRANDING from pvm/selfhost-branding-beta.json the first paint should be PVM's"], files: ["Dockerfile (new)", ".dockerignore (new)", "selfhost/nginx.conf (new)", "selfhost/docker-entrypoint.sh (new)", "selfhost/docker-compose.yml (new)", "selfhost/install.sh (new)", "selfhost/install.ps1 (new)", "selfhost/resolve-digest.sh (new)", "selfhost/check-headers.py (new)", ".github/workflows/docker.yml (new)", "SELF-HOSTING.md (new)", "js/selfhost-boot.js", ".gitignore", "index.html (Help, R41; ?v=)", "README.md", "CLAUDE.md", "js/version.js", "js/changelog.js", "js/promote.js", "tests/selfhost/entrypoint.test.js (new)", "tests/shell/home.test.js, palette.test.js, queue.test.js, workspaces.test.js (the R41 tag regex)", "scripts/*.ps1 (build stamp only)"] },
{"n": 254, "title": "T28 — project cockpit and automatic evidence", "tools": ["T28 MDE rollout"], "builds": [10692], "risk": "medium", "what": "Five primary areas, complete capability mapping, country workspaces, source freshness, attention list and four automatically prepared reports. Read scheduling reuses sign-in policies, serializes background reads and keeps navigation usable. Tenant browser history stores 100 run summaries. Device return defaults are device-only, and bulk device entries use device identity.", "why": "The growing flat rail and button-gated reads made the rollout hard to follow. Uses approved option 1 as the foundation, option 2 inside Waves and option 3 as the attention list. All existing writers and recovery gates remain. T28 remains a temporary beta-only project tool.", "test": ["Run npm test, including project navigation, automatic and refused reads, source errors, stale reports, delayed responses after sign-out, membership, exclusion, return, bulk return and undo regressions.", "Browser: check Overview, country tabs, Exceptions and reports at desktop and narrow widths, including dark theme.", "No live tenant writes; real-tenant consent, RBAC, throttling, propagation and device outcome acceptance remain pending."], "files": ["js/mderolloutv2.js", "js/mderevert.js", "css/t28v2.css", "index.html", "tests/t28v2/project.test.js", "tests/mderollout", "docs/T28-V2.md", "docs/reviews/T28-beta-10692.md"]},
{"n": 253, "title": "T29 P-2715 — approved mockup restored and deployment controls fixed", "tools": ["T29 P-2715 Applocker & harvest"], "builds": [10691], "risk": "medium", "what": "Restore the approved t01-intune-deploy Policy workspace in Workspace 02. Local supplied-XML default, separate configuration/verification/review panels, compact green navigation, operation/mode/grouping controls, rule and XML editing, actual weekly summary cards. One shared deployment readiness gate; no hidden minimum note length; local action feedback; pending controls hidden with scoped CSS.", "why": "The delivered beta diverged from the approved mockup, and its enabled deployment button rejected short pilot notes with an offscreen error. Keep the established deployment review, backup, collision/drift and immutable-ID/read-back protections. This temporary project tool remains beta-only.", "test": ["Run npm test, including real DOM click regressions for create/redeploy, validation, rule editor, definite rejection, unknown-write recovery and AuditOnly.", "Browser: compare to approved mockup, all five areas at 1440/1100/820/390, dark theme, default 27-rule non-DLL source, native download/confirm/create with synthetic Graph responses.", "Live Intune and Windows acceptance remain pending; no tenant writes performed during this fix."], "files": ["index.html", "css/applocker-harvest.css", "js/applocker-harvest.js", "js/app.js", "tests/applocker-harvest/controls.test.js", "tests/applocker-harvest/policy.test.js", "docs/reviews/T29-beta-10691.md", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"]},
{"n": 252, "title": "T29 P-2715 Applocker & harvest — editable XML, weekly event maintenance and stable Intune deployment", "tools": ["T29 P-2715 Applocker & harvest"], "builds": [10690], "risk": "medium", "what": "Separate beta-only project tool in Workspace 02 Projects, named P-2715 Applocker & harvest; supplied XML preserved with DLL omitted, T01 catalog/matcher reused, weekly collector/detector, event imports and MDM receipt comparison, new Intune profile with automatic grouping and separate assignment, same-ID existing redeploy with backup/drift/read-back gates, legacy helpers available. T01 scanning workflow remains separate.", "why": "Requested new tool based on approved mockup. Can deploy enforced policy and remediate devices, so Windows and live-tenant pilot acceptance are required before wider assignment. Catalog prediction and upload/read-back are not functional enforcement proof. R42 documents T29; the project tool is recorded under Staying on beta.", "test": ["npm test includes tracked T29 XML/coverage, evidence, deployment drift/failure and mocked PowerShell upload/retry/pruning contracts; browser checks desktop, phone and dark theme.", "Windows pilot: daily detection skips seven days after confirmed upload, retries pending without recollection, filters DLL before cap, reports all four channels and selected MDM collections, prunes only own old T29 files after delivery. Verify certificate/secret auth, large upload and interrupted upload.", "Live Intune: create unassigned AuditOnly profile and verify grouping uniqueness; assign an exact pilot group separately; check device receipt/app execution; edit existing enforced policy, save rollback, redeploy same ID/grouping and verify assignments unchanged. Exercise drift, encrypted OMA values, failed write/read-back and restore snapshot.", "Review broad defaults and unsupported PROGRAMDATA paths in supplied templates; add OneDrive allow explicitly. Existing DLL policy requires reviewed cleanup/migration, not silent omission."], "files": ["js/applocker-harvest-core.js", "js/applocker-harvest.js", "css/applocker-harvest.css", "templates/applocker/*.xml", "scripts/Detect-TunoWeeklyAppLockerHarvest.ps1", "scripts/Get-TunoWeeklyAppLockerHarvest.ps1", "js/applocker.js (shared read-only matcher export)", "index.html", "js/app.js", "js/workspaces.js", "js/flat-icons.js", "js/version.js", "js/changelog.js", "js/promote.js", "tests/applocker-harvest/*", "docs/reviews/T29-beta-10690.md", "scripts/README.md", "README.md", "SECURITY.md"]},
{ n: 251, title: "🚀 T28 MDE rollout — 📡 Landing: Intune's check-in status per new policy joined to the wave members — landed / pending / error / conflict / no status, per wave and per member (option A off the mockup canvas, tenant side only)", tools: ["T28 MDE rollout"], builds: [10689], risk: "low", what: "js/mdelanding.js (new): stateOf (words first, Graph's complianceStatus codes as a flagged fallback), scope (a new policy's waves from its reach through the wave rows, its excluded groups, audience from the name or the waves), readMembers (transitive users of the user waves, transitive devices of the device waves, both kinds of every excluded group — per group), readManaged (the Intune id ↔ Entra device id bridge and the last check-in; 👥's read reused when present), readPolicyStatus / readStatus (one cached DeviceStatusesByConfigurationProfile report per assigned policy: cachedReportConfigurations → poll → getCachedReport paged by top/skip, TotalRowCount trusted), join (expected = wave members × policies including the wave − the policy's excluded groups; device scope by Intune id, user scope by UPN with the worst of the user's devices; no row → no status; a failed report → unreadable, never 0; extras), explainConflicts (T12's settingRows and the ⚔️ pairs' old policies the device is also in conflict on), verdict, memberRows, csv. js/mderolloutv2.js: ld state, the 📡 Landing rail node under CHECK & RECOVER with its to-look-at count, landingPane (tiles as filters, the policy × wave matrix with extras folds, region and state chips, a search, ⭳ CSV, 📑 Save as report), readLanding, runLandingReport, the fourth REPORTS entry with Read again & generate, the help paragraph. js/mdereports.js: landingHtml. js/demo.js: LANDING_REPORT, the cached-report handlers (create · poll · page) and transitive DEVICE members. index.html: js/mdelanding.js (72 ?v= refs).", why: "Mihai, 7 Oct: a way to report the policies assigned in the waves per user and group, to make sure the new MDE policies are landing on the users and devices — which landed, which are in error or in conflict; advice first, then 'only build Tenant side — A'. Risk low: reads only — a cached report configuration is a short-lived server-side object; no group, policy or device is written. The scopes are T28's own (configuration and devices read for the reports, groups read for the members).", test: ["npm test: tests/mderollout/landing.test.js (new, 53 checks) — status words and codes, scope, the join (per-policy exclusions, no status, unreadable, extras, user worst-of-devices, summary, filters, CSV), conflicts explained, the cached-report create → poll → page with a stubbed Graph, and demo end to end: the rail node, the read, the matrix, the member table, filters and search, the fold, 📑 Save as report, Read again & generate after a fix, a refused report said and never counted as 0", "On PVM: 🚀 T28 → 📡 Landing → Read the status; compare one policy's Euro cell with the portal's Device and user check-in status for that policy (counts of Succeeded / Pending / Error / Conflict), open a ◌ no-status member and check in Entra that the device is in INT-SG-D-<ISO3> and in Intune that it has checked in; then 📑 Landing check → Export CSV"], files: ["js/mdelanding.js (new)", "js/mderolloutv2.js", "js/mdereports.js", "js/demo.js", "index.html (script tag; ?v=)", "js/version.js", "js/changelog.js", "js/promote.js", "tests/mderollout/landing.test.js (new)", "tests/platformbaseline/screen.test.js (72 refs)", "scripts/*.ps1 (build stamp only)"] },
{ n: 250, title: "🚀 T28 MDE rollout — 🧪 Test members per wave: a CSV (UPN and/or device name) into INT-SG-*-WAVE-<region>-Test, nested in the wave (option A)", tools: ["T28 MDE rollout"], builds: [10688], risk: "medium", what: "js/mdetest.js (new): names (the wave + -Test), parse (both a UPN and a device column; ⊘'s parseList otherwise), read (the two test groups: exact name, direct members, nested), entries (resolveList items → user + Windows devices, or a device line alone; flags: -vdi-, Revert, Exclusion, already, stale, another wave's country), defaultTicks, plan (create → add → nest per side; remove for a member unticked). js/mderolloutv2.js: tm state, the 🧪 Test members column and button in 🌊, the panel (test groups with untick-to-remove, .csv / paste, 🔎 Look up, the list with ticks, ② Dry run), the plan text, the after-run re-read, runs carry the region, undo keeps the run kind. index.html: js/mdetest.js (71 ?v= refs).", why: "Mihai, 6 Oct: test users and devices per wave from a CSV, option A and one file per wave. Risk medium: it writes groups (create, add, nest, remove) — through 👥's gates (dry run, group backup, REMOVE for removals), every write read back, undo in 📜.", test: ["npm test: tests/mderollout/testmembers.test.js (new, 36 checks) — parse with both columns, names, entries and their flags, default ticks, the plan (create → add → nest; remove + nest on existing groups; a missing wave), and demo end to end: 🧪 opens and reads, a 4-line CSV looked up (two users, a device line, a miss), dry run, gates, apply, the re-read (members in, nested), the column, and a removal behind REMOVE", "On PVM: 🌊 Waves → 🧪 Test members on Euro → load a small CSV (one tester, one device) → ② Dry run → backup → ④ Apply; check in Entra that INT-SG-U-WAVE-Euro-Test and INT-SG-D-WAVE-Euro-Test exist, hold them and are members of the Euro waves; after a check-in the tester's device shows the new MDE policies"], files: ["js/mdetest.js (new)", "js/mderolloutv2.js", "index.html (script tag; ?v=)", "js/version.js", "js/changelog.js", "js/promote.js", "tests/mderollout/testmembers.test.js (new)", "tests/platformbaseline/screen.test.js (71 refs)", "scripts/*.ps1 (build stamp only)"] },
{ n: 249, title: "🚀 T28 MDE rollout — ⚔️ Conflicts with old: 🖥 On devices (devices Intune reports in Conflict on both policies of a pair; was N → 0 cleared; in the conflict check report)", tools: ["T28 MDE rollout"], builds: [10687], risk: "low", what: "js/conflict.js: ConflictDevices.read takes only (a policy list) and settings:false. js/mderollout.js: deviceIndex, deviceCounts (both policies, exact for a different value, a hint for other format, unknown on a failed or unreadable report), csv(pairs, devCounts) with a last column. js/mdereports.js: conflictsHtml takes ctx.dev — the column, a tile, the device list, resolved pairs still on devices. js/mderolloutv2.js: dv state, 🖥 Read device reports, the column with ▾ show, the 🖥 On devices chip once read, was N / 0 — cleared, runConflictCheck reads the devices, reset clears them. js/demo.js: the antivirus pair in CONFLICT_REPORT.", why: "Mihai, 6 Oct: T12's device conflicts in T28's conflict check, option A. Reads only; the risk is in T12's report reading (item 248), which this reuses.", test: ["npm test: tests/mderollout/devconflicts.test.js (new, 25 checks) — deviceIndex / deviceCounts (both, exact, hint, unknown, same value skipped), the CSV column, and the screen in demo mode: not read → read → 2 devices, ▾ show, the chip, a fix → 0 — cleared / was 2, the conflict check report and CSV; tests/conflict/devices.test.js adjusted to the richer demo", "On PVM: ⚔️ Conflicts with old → 🖥 Read device reports; open a pair's ▾ show and compare one device with the portal (device → Device configuration → Conflict). Apply a proposed fix, wait for check-ins, read again: was N → 0 — cleared"], files: ["js/conflict.js", "js/mderollout.js", "js/mdereports.js", "js/mderolloutv2.js", "js/demo.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html (?v= only)", "tests/mderollout/devconflicts.test.js (new)", "tests/conflict/devices.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 248, title: "⚔️ T12 Setting conflict scan — 🖥 On devices (reported conflicts, the other policy named exactly or listed as candidates) and the group-first layout (round B)", tools: ["T12 Setting conflict scan"], builds: [10686], risk: "medium", what: "js/conflict.js: ConflictDevices (rowsOf, pick, statusOf, read: summary → per-policy devices → per-policy settings over Graph.BETA report actions with top/skip paging and per-policy errors; explain: per device, named collisions from Conflict.detect with the shared group, flagged settings with candidates, unresolved; csv, markdown). Conflict: reachOf carries group names and allDevices/allUsers; verdictPair names the shared group; detect keeps each policy's reach; blocksByGroup and blocksByPair; csv gains a groups column; keyOf skips a profile's Display name and Description. ConflictTool: the Predicted / On devices switch, the By group / By setting / By policy pair modes, one block renderer for both views. index.html: the switch and its note. css/app.css: .cf-blk / .cf-line. js/demo.js: CONFLICT_REPORT and the three report routes.", why: "Mihai, 6 Oct: find all devices with a conflict and the policies on each side; IntuneShade shows the group, ours did not. Risk medium: the report actions' columns are undocumented — read defensively and every unreadable answer is said on the screen, but the first real-tenant run is the proof.", test: ["npm test: tests/conflict/devices.test.js (new, 59 checks) — the report shape, status in words only, the join (named / flagged / unresolved), the read faked (summary, a refusing policy, no summary, numeric-only status), blocksByGroup / blocksByPair, the groups CSV column, and the screen end to end in demo mode", "On a real tenant: ⚔️ Setting conflict scan → 🖥 On devices → Find devices in conflict; the count should match Devices › Monitor › Configuration policy assignment failures (conflicts). Open a device: each named line shows both policies, both values and the shared group. If a note says a status could not be read, send the Network-tab answer of getConfigurationPolicyNonComplianceReport", "⚔️ Predicted: blocks headed by groups, a tenant-wide policy said as via All devices; By setting and By policy pair a click away"], files: ["js/conflict.js", "js/demo.js", "index.html (the view switch; ?v=)", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "tests/conflict/devices.test.js (new)", "scripts/*.ps1 (build stamp only)"] },
{ n: 247, title: "🚀 T28 MDE rollout — ↩ Revert in bulk: 📋 The list (＋ Add on a card, paste / .csv, a group's members), one merged plan behind a confirm line", tools: ["T28 MDE rollout"], builds: [10685], risk: "medium", what: "js/mderevert.js: entryKey, listAdd, listTicks (the pair minus gaps), planRevertMany (planRevert per entry merged: one create and one add per Revert group, one removal per country group with needsOk on the add of its kind, $batch for several; counts, waves, confirmLine, entryKeys), bulkLine, assessMany (per policy drops / takes counted, gaps, conflicts), groupLines (a group by exact name: transitive users, direct devices), listDone, listLines. js/mdeexclude.js: resolveList takes opt.lookup and opt.light (⊘ unchanged: light). js/mderolloutv2.js: ↩ modes 🔎 One at a time / 📋 The list; ＋ Add to the list on the card; the list pane (paste / .csv, 👥 members of a group, misses said, per-entry ticks and ✕, counted per-policy table, one reason, ② Dry run the list); renderMemPlan shows plan.confirmLine as a checkbox and gateOk requires it; csAfterRun drops reverted entries; the list kept as lines in tuno.t28.revert.list.<tenant>; fileText shared with ⊘'s list; help text.", why: "Mihai, 6 Oct: 'revert should also be possible in bulk'; picked option C off the mockup canvas 'T28 · Bulk revert' and the gate 'confirm line always' — 'yes go with C and the confirm line'. Medium: one run can take many members out of their waves; the confirm line plus REMOVE gate it, every removal waits for the Revert add to read back, and 📜 Undo / Reverted now are the way back.", test: ["npm test: tests/mderollout/revert.test.js +15 (the merge, needsOk, confirm line, waves, skips, gaps unticked, counted assessment, listDone / listLines, groupLines)", "npm test: tests/mderollout/revertlist.test.js (new, 26 checks) — demo end to end: ＋ Add, paste with a miss, the pair, the plan, Apply locked without the confirm line, the run, the list emptied, a group's members, Clear", "At PVM, ↩ Revert → 📋 The list: paste 3 pilot UPNs, check the counted per-policy view and the confirm line's counts and waves, apply, then ↩ Back into the wave for one of them"], files: ["js/mderevert.js", "js/mdeexclude.js", "js/mderolloutv2.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html (?v= only)", "tests/mderollout/revert.test.js", "tests/mderollout/revertlist.test.js (new)", "scripts/*.ps1 (build stamp only)"] },
{ n: 246, title: "🚀 T28 MDE rollout — AVD (-vdi- in the name) out of scope on every path: never placed, pinned or piloted; one already in a country device group is a removal", tools: ["T28 MDE rollout"], builds: [10684], risk: "medium", what: "js/mdemembers.js: AVD_NAME /-vdi-/i (was /vdi/i), AVD_WHY, avdIdsOf (Entra objects named -vdi-, or behind an Intune device so named); compute works on a copy of the input without the AVD devices (avdManaged, avdIds kept), so no placement step sees one; row.pinnedIn skips AVD, row.avdIn / problems.avd, removeNames says AVD; model.avd { count, names, inGroups }; leftOutOf lists an AVD device on its user's has; pilotsOf: an AVD device in a pilot group is state none, avd, never a person's device; planPin refuses one. js/mderolloutv2.js: placed-by line ⊘ AVD count and still-in-a-group warning; per-country AVD note.", why: "Mihai, 6 Oct: 't28, alway exlcude devices with -vdi- in the name. they are out of scope'. Before, only the Defender logon list skipped VDI names; a VDI device with a primary user in a country group went into the device group. Medium: the next 👥 Apply with removals takes AVD devices out of the country device groups, so they leave the new MDE policies.", test: ["npm test: tests/mderollout/vdi.test.js (11 checks) — the rule, no step places AVD, the removal and the pin, counts, Left out, pin refusal, pilot; members / screen text updated", "At PVM, 👥 Wave members: the placed-by line shows ⊘ N AVD (-vdi- in the name) and how many are still in a country group", "A country with an AVD device in its INT-SG-D-<ISO3>: the plan removes it, named AVD; Apply with removals and read back", "📌 Pin on a -vdi- device in Left out is refused with the AVD reason"], files: ["js/mdemembers.js", "js/mderolloutv2.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html (?v= only)", "tests/mderollout/vdi.test.js (new)", "tests/mderollout/members.test.js", "tests/mderollout/screen.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 245, title: "🚀 T28 MDE rollout — a user's devices: every Windows device of a user (Entra owner / registered user, active, or a logon) in that user's country; ⊝ a tick per device kept in INT-SG-D-MDE-Skip; the button click fix", tools: ["T28 MDE rollout", "All tools"], builds: [10683], risk: "medium", what: "js/mdemembers.js: DEFAULTS useUsersDevices, skipDevice INT-SG-D-MDE-Skip; readInput selects approximateLastSignInDateTime on the Entra devices, reads registeredOwners and registeredUsers per Windows device ($expand, a failure is said), and the skip group's members; compute builds alsoByUser from Entra (device active in logonDays), Intune last logged-on and Defender logons (each logon source only when its switch is on) and pushes those devices into each such user's row with via also (the sources and the time), marks skipped devices (any rule but the primary user / live account), keeps them out of want, flags shared (not counted as multi), counts alsoCount; planSkip (untick: into the skip group, then out of the country groups where no primary user keeps the device, typed; tick: out of the skip group, then back where a rule wants it); patchInput moves the skip set; VIA_TEXT for also. js/mderolloutv2.js: the country detail lists a user's devices together with an In tick (locked for the primary user's own device) and a ⊝ bar → skipDryRun; 'their device too · Entra + Defender'; the placed-by line counts the user's other devices and the unticked; ⚙️ switch; the click handler resolves a click inside span.fi-run / .enca-icon-slot to its button. css/flat-icons.css: button/a/[role=button] .fi-run{pointer-events:none}.", why: "Mihai, 5 Oct, off a user's device list in Entra (an iPhone and three Windows devices, all active): the user's other devices should be in the wave too, with a way to untick one — his picks: Entra + logons, both countries' groups, the untick kept in the tenant. Then '⭳ CSV — button not working': flat-icons' span.fi-run took the click. Risk medium: more devices go into waves (the next check-in gives them the new policies) and shared devices land in two countries; every source is within the window, each step is switchable, and an untick is in the tenant so every admin's sync respects it.", test: ["Run npm test: all 37 suites pass (mderollout/coverage +11: the user's devices, the window, both countries, untick / tick plans; mderollout/screen: a click on ⭳ CSV's words downloads).", "At PVM open 👥, Read again: the placed-by line says '+ N as a user's other device'.", "Open the Netherlands and find a user with several devices: they sit together, each ticked, the extra ones say 'their device too · Entra + …'; the one placed by the primary user has a locked tick.", "Untick one: the ⊝ bar says 1 to untick; Dry run → create INT-SG-D-MDE-Skip, add, remove from INT-SG-D-NLD (typed REMOVE); Apply; Read again: unticked, not added again.", "Tick it again → Dry run → out of the skip group, back into INT-SG-D-NLD.", "Click on the word CSV (not the edge) of ⭳ CSV: the file downloads; the same for ↻ Read again."], files: ["js/mdemembers.js", "js/mderolloutv2.js", "css/flat-icons.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html (?v= only)", "tests/mderollout/coverage.test.js", "tests/mderollout/screen.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 244, title: "🚀 T28 MDE rollout — wave coverage: Intune last logon and Defender logons below the primary user, 📌 pinned devices, staleness on the rail", tools: ["T28 MDE rollout"], builds: [10682], risk: "medium", what: "js/mdemembers.js: DEFAULTS useIntuneLogons, useDefenderLogons, logonDays (30, 1–30), pinnedDevice INT-SG-D-MDE-Pinned; sidToObjectId (S-1-12-1-a-b-c-d → the object id), deviceLogonKql (DeviceLogonEvents interactive / RDP / cached / unlock, per device and account, joined to DeviceInfo's AadDeviceId); readInput reads managedDevices usersLoggedOn (Graph beta list, else per device for those the primary user does not place, at most 4,000), runs the hunting query, reads the pinned group's members (logonRead says what was read; a failure is a 'Partly read' line, the step places nothing); compute adds steps ② lastlogon and ③ defender after a primary user in no country / none (and after the deleted user's live account), before the owner and the name, flags check where a logon of another country's person meets a placing primary user, keeps pinned members wanted, counts placedBy, treats logon-placed users as having a device; planPin / planUnpin; patchInput moves the pinned set; VIA_TEXT for the new steps. js/mderolloutv2.js: memRead asks ThreatHunting.Read.All when step ③ is on; the placed-by line and the stale line in 👥, the device rows say by last logon / by Defender logons, check the primary user, 📌 pinned; the rail's 👥 node is memStale (oldest sync of the drifted countries · to add, warning after syncStaleDays); 👥 runs stamp the last sync; 🔎 hits get 📌 Pin, the 📌 Pinned list with Unpin under Left out; ⚙️ gets the two switches and the days (a change re-reads).", why: "Mihai, 5 Oct: 'i want to make sure that most devices are included in the waves' — the mockup round listed every source tying a user to a device; he agreed to the recommendation: Intune last logon and Defender logons below the primary user, pins for the remainder, sync by hand with staleness visible (no runbook yet). Risk medium: devices that were in no wave go into one (the next check-in gives them the new policies), and a wrong logon could place a shared device in the wrong country — hence below the primary user, a 30-day window, people in country groups only, VDI skipped, the counts per step, the check flag and the switches.", test: ["Run npm test: all 37 suites pass (mderollout/coverage new; mderollout/screen reads the placed-by line).", "At PVM open 👥, Read again (consent ThreatHunting.Read.All if asked): the line under the meters counts ① primary user, ② Intune last logon, ③ Defender logons, ④ Entra owner, ⑤ name / location; '… in no country' drops from 545.", "Open a country: devices placed by a logon say so with the time or the count; a device where another country's user logs on says check the primary user.", "⚙️: switch ③ off and save — the read is redone and ③ is struck through.", "🕳 Left out → 🔎 Find their logons: a device in Intune or Entra has 📌 Pin to INT-SG-D-<code>; Dry run → create INT-SG-D-MDE-Pinned, add, add; Apply; the device shows 📌 pinned and stays after a sync; Unpin under 📌 Pinned.", "The rail: 👥 says e.g. 'never synced · 1,234 to add' in the warning colour; after an Apply it says the days since."], files: ["js/mdemembers.js", "js/mderolloutv2.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html (?v= only)", "tests/mderollout/coverage.test.js", "tests/mderollout/screen.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 243, title: "🚀 T28 MDE rollout — 🧪 a pilot's batches go into its static user group (INT-SG-U-NLD-BREDA), created and nested on batch 1, never straight into the wave", tools: ["T28 MDE rollout"], builds: [10681], risk: "medium", what: "js/mdemembers.js: batchOf counts a user in when in the pilot's nested static group or (an earlier build) a direct wave member; finished = the dynamic pilot group nested, or the static one nested with every batchable user in it and none direct (a pilot covered entirely by its country is not finished — it is migrated); returns staticNested, staticIn, inList. compute holds uAdd at [] for a pilot in batches. planBatch: create INT-SG-U-<code> on batch 1, cut back a not-yet-nested static group to the batches, add the batch (and earlier batches) to it, nest it after the create / fill read back, take earlier direct members out of the wave after the nest; the device side unchanged. planOps 'fill' skips a pilot in batches. planFinish fills from uWant, nests only when not yet in, takes direct members out after every step before read back. js/mderevert.js: 🔄 offers no user adds for a pilot in batches. js/mderolloutv2.js: the batch panel and the user-group cell say the batches fill the static group; Finish reworded.", why: "Mihai, 5 Oct, off NL Breda's batch 1 plan (304 users straight into INT-SG-U-WAVE-Euro, only the device group created): 'where is user groups creation?'. Risk medium: the pilot's route into the user wave changes from direct members to a static group; each batch is a create / add / nest read back, the nest waits for the fill, and an over-filled group is cut back before it is nested so a batch never brings in more than itself.", test: ["Run npm test: all 36 suites pass (mderollout/members: batch 1 / 2 through the static group, legacy direct members moved, an over-filled group cut back, legacy Finish; mderollout/screen: batch 1 in demo creates and nests INT-SG-U-NLD-BREDA, the migration unnests it).", "Open 👥 → Euro → NL Breda: the user group cell says 'batch 1 creates it · 0 of 1215 in'; the batch panel says the users go into INT-SG-U-NLD-BREDA.", "Batch 1 → dry run: create INT-SG-U-NLD-BREDA, add 304 users, nest it in INT-SG-U-WAVE-Euro, create INT-SG-D-NLD-BREDA, add 131 devices, nest — no 'add users · INT-SG-U-WAVE-Euro'.", "Apply; in Entra INT-SG-U-WAVE-Euro holds INT-SG-U-NLD-BREDA (304 direct members) and no direct users; read again: 304 of 1215 in, batch 2 next.", "Batch 2 → dry run: only adds to INT-SG-U-NLD-BREDA and the device group."], files: ["js/mdemembers.js", "js/mderevert.js", "js/mderolloutv2.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html (?v= only)", "tests/mderollout/members.test.js", "tests/mderollout/screen.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 242, title: "🚀 T28 MDE rollout — 👥 Wave members creates both static groups: INT-SG-U-<ISO3> beside INT-SG-D-<ISO3>, filled and nested together; 🔄 Country groups creates nothing", tools: ["T28 MDE rollout"], builds: [10680], risk: "medium", what: "js/mdemembers.js: compute gives each row the static user side (uRead, userGroupStatic, sug, uWant = the source's users minus input.revertUsers, uHave, uAdd, uRemove, uHeld, uInSync) and the nest split (ugNestedSrc, ugNestedStatic, ugNested = either); inSync includes the user side; batchOf counts a static group in the wave (finished, viaOther through input.userMembers); planOps creates and fills INT-SG-U-<ISO3> beside the device group under 'fill', removes its leavers under 'removals' ($batch), nests the STATIC user group under 'nestUsers' (never the source; unread → skipped; nested through the source → the swap named); a migration unnests whichever pilot group is in the wave; planFinish(model, key, cfg) creates, fills and nests the pilot's static group and takes the direct users out with needsOk on the nest. js/mderevert.js: syncItems offers only existing groups; planSync and planSwap create nothing (a missing group → 'create it in 👥 Wave members'); the mapping confirm is gone; model reads ugNestedSrc. js/mderolloutv2.js: memRead shares userGroups / userMembers / revertUsers with the members input; the 👥 table gains User group · sync (memUserCell), the in-the-wave cell says dynamic with a swap link, the bar says create & fill groups and counts users and devices, intro and order text; 🔄 drops the mapping confirm, links to 👥, and says which countries lack their groups; Finish's wording; How it works.", why: "Mihai, 5 Oct, from 👥 at PVM (0 of 16 groups nested in Euro): the user groups should be created in 👥 beside the device groups and nested from there — then '🔄 creating groups too is very confusing … one and the same … user and device, same place'. Risk medium: the user nest now links INT-SG-U-<ISO3> instead of the dynamic group, and 'create & fill' writes user memberships; every step through applyOps with read-back, backup and undo.", test: ["Run npm test: all 36 suites pass (mderollout/members gains the static-group block and the static Finish; mderollout/screen and t28v2/workspace expect the six-step plan; mderollout/revert and revertscreen: 🔄 creates nothing, 👥 creates INT-SG-U-NLD, then the swap).", "Open 👥 Wave members at PVM, Euro: each row shows User group · sync (INT-SG-U-GBR to create, +63 to fill) beside the device group.", "Tick United Kingdom with create & fill and both nests: the bar says create 2 · add 63 users · add 63 devices · nest 2 groups into Euro; Dry run lists create INT-SG-D-GBR, add, create INT-SG-U-GBR, add, nest INT-SG-U-GBR, nest INT-SG-D-GBR — no PVM-UG group nested.", "Apply; in Entra INT-SG-U-WAVE-Euro holds INT-SG-U-GBR (assigned, 63 direct members), not PVM-UG-CORP-MEM-USERS-GB.", "Open 🔄 Country groups: no create anywhere, the mapping says groups are made in 👥; countries without groups are listed with the link."], files: ["js/mdemembers.js", "js/mderevert.js", "js/mderolloutv2.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html (?v= only)", "tests/mderollout/members.test.js", "tests/mderollout/screen.test.js", "tests/mderollout/revert.test.js", "tests/mderollout/revertscreen.test.js", "tests/t28v2/workspace.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 241, title: "🚀 T28 MDE rollout — 🔄 Country groups and ↩ Revert: static INT-SG-U-<ISO3> user groups beside the device groups, ⇄ the waves swapped to them with a read-back check, a sync that holds reverted members back, and a revert of a user and/or device to the old MDE policies", tools: ["T28 MDE rollout"], builds: [10679], risk: "medium", what: "js/mderevert.js (new, DOM-free): userGroupName / countryNames / mapping / mappingSig (the ISO3 is the device group's, MdeMembers.countryRows), readExtra (the INT-SG-U- groups by prefix then exact name, their direct users, the Revert pair and its members), model (per country: the user diff — add, leave, held, heldIn — beside 👥's device diff split into leavers and held; the Revert clean-up; drift; last sync and stale after syncStaleDays), syncItems / defaultSyncTicks / reincludeLine / planSync (create when needed, adds, removals by $batch, re-includes out of Revert with needsOk on their add; refused without the mapping confirm when it creates, and without the exact confirm line when a re-include is ticked), planSwap (create → add → nest → swapcheck → unnest, needsOk chained), lookup (MdeExclude.lookup plus the user's direct groups), defaultTicks (the pair), planRevert (into Revert first, then out of the static country groups; skips with the reason; warnings for one side only, ⊘ and ↩ both, no reason), planUnrevert (back into every country that holds them, then out of Revert), assess (MdeExclude.reachOf before and after, per policy: drops, takes, gap / both), patch, syncedRows. js/mdemembers.js: DEFAULTS and normConfig gain userGroupPrefix, userGroupDescription, revertUser, revertDevice, revertDescription, syncStaleDays (14); readInput skips the Revert names among the INT-SG-D- groups; compute holds input.reverted like the exclusion group and flags d.reverted (problems.reverted, removeNames say reverted); removeMembers opt.batch (Graph.batch DELETE, 404 done); applyOps gains the swapcheck step and passes op.batch. js/mderolloutv2.js: the cs / rv state, csModel, countrySyncPane (mapping card with its confirm, waves card with ⇄ per region and the per-country head, sync card with scope, five sections, the confirm line), csSyncDry / csSwapDry, revertPane (search, card with the pair, per-policy table, reason, Reverted now with the way back), rvRead / rvSearch / rvPick / rvDryRun / rvUndoDry, csAfterRun (last sync and reasons per tenant in this browser: tuno.t28.groupsync.<tenant>, tuno.t28.revert.reasons.<tenant>), memRead reads the extra, applyMem patches it and records runKind and reason, the plan says impact and way back per run kind, swapcheck is drawn as 'check the sets', the rail's two nodes, How it works gets two paragraphs. index.html: the script.", why: "Mihai, 5 Oct: next to ⊘ Exclude, a way to take a user and/or device out of a wave so they go back to the old MDE policies — with static groups only (the PVM-UG country groups are dynamic and a user cannot be taken out of them), the user groups mirroring the device groups, a sync because the sources keep changing, and reverted members never re-included without a check and a confirm. Answers to the brief's open questions: the ISO3 from the device groups' own lookup, 14 days, leavers checked against Revert. Risk medium: new write paths (the swap unnests a dynamic group from a live wave; the revert and the sync move members between groups that decide which MDE policies apply) — every one through MdeMembers.applyOps with the read-back, the swap guarded by its check, removals typed, and the group backup and undo of every member plan.", test: ["Run npm test: all 36 suites pass (mderollout/revert and mderollout/revertscreen new; t28v2/workspace renders the two panes; platformbaseline/screen counts 70 ?v= refs).", "Sign in to PVM, open 🚀 MDE rollout, read the tenant: the rail shows 🔄 Country groups after 👥 and ↩ Revert after ⊘.", "🔄 → Read: the mapping lists each PVM-UG source with INT-SG-U-<ISO3> and INT-SG-D-<ISO3> (NL-Breda → NLD-BREDA); check it and tick the confirm. The Euro wave shows NL-Breda and the countries still nested as dynamic.", "⇄ Swap Euro → dry run: per country create, add, nest, check, unnest; ③ backup, REMOVE, ④ Apply: every check reads 'same N users · verified' and the PVM-UG groups are out of INT-SG-U-WAVE-Euro, the static ones in. Spot-check a pilot user still gets the new - U - policies.", "Sync with All countries: adds ticked, leavers unticked; Dry run → Apply; the head says synced just now and the drift drops.", "↩ Revert a test user from NL: the pair ticked, the per-policy table shows the new policies dropping off and the old taking over; reason, Dry run, Apply. In Entra the user and laptop are in the Revert groups and out of INT-SG-U-NLD / INT-SG-D-NLD; after a check-in the old ASR policy applies.", "🔄 again: the user and laptop are under Reverted, held back, unticked, with the reason; tick one — the Dry run refuses until the confirm line is ticked.", "↩ Reverted now → Back into the wave: in the country groups again, out of Revert."], files: ["js/mderevert.js", "js/mdemembers.js", "js/mderolloutv2.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js", "tests/mderollout/revert.test.js", "tests/mderollout/revertscreen.test.js", "tests/t28v2/workspace.test.js", "tests/platformbaseline/screen.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 240, title: "🚀 T28 MDE rollout — 🧩 Edge extensions (option A): the Edge extensions policy's force and allow lists as rows named by the Edge Add-ons store, the approved list matched to the store by name, paste mode when no route can reach the store, the ASR write for the two collections", tools: ["T28 MDE rollout"], builds: [10678], risk: "medium", what: "js/mdeedgeext.js (new, DOM-free): listOf / findAll / listsIn (the four Edge extension settings in either raw shape; entries as <id> or <id>;<update url>), isEdgeExtPolicy, withLists (a copy with the force and allow collections replaced; an empty list turns the choice _0, a filled one _1 with the …desc child), verified, putBody = MdeAsr.putBody, fromInput (an ID, <id>;<url>, an Edge store link, a Chrome Web Store link → the Chrome update URL), slugName, BUILT_IN (the two Copilot sidebar component IDs), planOf / reverse / editsOf (edits keyed <list>|<id>, op add / remove), parseApproved (TSV / CSV by header names, or one name per line; Browser decides Edge rows), matchHits. js/addons.js (new, TunoAddons): route (tuno.addons.route, a same-origin path or an https URL; checkRoute, crossOrigin), detail(id) → getproductdetailsbycrxid, search(q) → v4/getfilteredorderedsearch, both cached a day in tuno.addons.cache, 'no route' when none is set. js/mderolloutv2.js: the ext state, extPane (policy card with the route line, 📋 Approved extensions card with per-row store state, pick buttons, a per-row ID box and the bulk add, the ⬇ and ⊕ tables with a Change select per row, 🔎 Add an extension with hits or the pasted entry, the pending bar), extLookup / extResolve / extListText / extAdd / extChange / extSearch, extDryRun (asrReadOne, drift per edit) → renderExtPlan (impact and way back boxes, the gates) → extApply (re-read, drift on lastModifiedDateTime and the lists, PUT, read-back, ledger, runs kind edgeext with done = the changes), undoRun for kind edgeext, v2Risks for a live force-list removal, the rail node 🧩 with its count, go('edgeext') → openEdgeExt (the lookups start), the stored list and hand-given names per tenant (tuno.t28.edgeext.list.<tenant>, tuno.t28.edgeext.names.<tenant>) loaded with the rules; the header buttons mvExclude / mvAsr and their code are gone (Mihai: only on the rail); How it works gets the 🧩 paragraph. index.html: the two scripts, the header without the two buttons, the intro sentence. css/app.css: the .mr-ext* rules. Tests: tests/mderollout/edgeext.test.js (new) — the engine on the OIB catalog's own policy and on a Graph-shaped read, the parser on both TSV schemas, and the screen in demo mode with a fixture Edge policy and a stubbed route: the rail node, the lists named by the store, a 404 as a finding, the built-ins kept, the approved list matched / picked / pasted, bulk add, the dry run with drift, the gates, the apply read back, the undo, the risk on a live removal, paste mode without a route; tests/mderollout/screen.test.js opens ⊘ and 🎛 from the rail; tests/t28v2/workspace.test.js renders the edgeext pane; tests/platformbaseline/screen.test.js counts 69 ?v= refs.", why: "Mihai, 2 Oct: the OIB Edge extensions policy at PVM has to follow the approved extensions list (EdgeExtentions.tsv, adjusted the same day), with new extensions added by name and looked up by ID in the Edge Add-ons store, and the silently-installed list easy to adjust. Option A off the mockup round, rail only. The store sends no CORS headers (checked from a browser page): a route or paste mode, never a guessed name. Risk medium: a new write path on one policy, through the ASR write that already ships; a wrong force-list entry reaches every user the policy reaches, which is why every name is the store's or marked unverified, 404 is a finding, and a live removal is a recorded risk.", test: ["Run npm test: all 34 suites pass (mderollout/edgeext new; mderollout/screen, t28v2/workspace, platformbaseline/screen adjusted).", "Sign in to PVM, open 🚀 MDE rollout, read the tenant: the rail shows 🧩 Edge extensions with 8 · 1; no ⊘ or 🎛 button in the header.", "Open it: Win - OIB - SC - Microsoft Edge - U - Extensions - v3.1.2 at the top, the block list * read-only, the route line empty (paste mode); the eight force entries and the one allow entry listed by ID, the two Copilot components 🔒 built-in.", "Set the route to a reachable relay or self-hosted path and Save: the names arrive — Graph X-Ray, Bitwarden, My Apps Secure Sign-in, PrinterLogic, Keeper — and ghmbeldph… reads ⚠ not in the store.", "Load EdgeExtentions.tsv: 16 Edge rows, Tango / Level Up / Tricentis / UI5 Inspector / SAP GUI connector / Power Automate / Webex named by the store, UiPath and Multimedia Redirection asking for an ID; paste cdfjcmjmgdnojgaojdnefhjjpaijapci on the UiPath 26.10 row — named by the store.", "➕ Add to the plan as exempt, move Power Automate to silent, remove ghmbeldph…: the bar counts the changes; ② Dry run lists each with what users get and the impact; ③ backup, tick, ④ Apply: written · verified, the lists re-read, the run in 📜 with Undo.", "Without a route: paste an Edge store link in 🔎 Add an extension — it is accepted with the name from the link, marked unverified; the Change select and the bar work the same."], files: ["js/mdeedgeext.js", "js/addons.js", "js/mderolloutv2.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "tests/mderollout/edgeext.test.js", "tests/mderollout/screen.test.js", "tests/t28v2/workspace.test.js", "tests/platformbaseline/screen.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 239, title: "🔐 T01 AppLocker — the loop is the spine (Option B): one rail in loop order lit from state, Next computed from state, one session, an enforced profile never refused", tools: ["T01 AppLocker builder & validator"], builds: [10677], risk: "medium", what: "js/applocker.js: deviceAuditState (the scan bundle's effective policy: Intune grouping, every shipped collection AuditOnly or Enabled, Dll and ManagedInstaller set aside), tenantEnforcedProfile, eventSummary, loopStages (seven stages with status done / now / next / ready / wait, a fact line each, the stage's pane set and screen, and the Next sentence), goStage (switches the pane set and the screen; stageOn marks the clicked stage), renderRail draws the seven nodes with ✓ ◉ → ○ marks and the fact under each (data-alstage, data-alscreen kept), the rail click goes through goStage, the status line's Next is loopStages().next (plus loopNote); switchWorkspace keeps only the screen per side — one session (policy, scan, events, tenant read, deploy state, auditReview, intuneCfg are never swapped); renderWorkspace draws no switcher; selectAuditProfile: an enforced profile (deployedMode by values) is adopted into the draft and the rail goes to 6 with a note instead of throwing. css/app.css: .al-fact, .is-now / .is-done / .is-ready / .is-next / .is-wait on .al-node. Tests: tests/applocker/loop.test.js (22, new) with tests/applocker/fixtures/scan-VNMPF5ZASH6-slim.json (a 20 KB cut of the real 2 Oct bundle: 8 of 2,449 entries, the effective policy's collections with two rules each, the generated XML bodies dropped); audit-workflow's three separate-session checks rewritten for one session; review's status-line check reads Next.", why: "Mihai, 2 Oct: 'I am still at a loss how to proceed … the tool should be clearer what my steps are now' — and his read diagnostic showed the audit step refusing his enforced profile while the status line told him to pick the audit one. Option B of the mockup round. Risk medium because the rail and the sessions change for every T01 user; every write path is unchanged.", test: ["Run npm test: all 33 suites pass, 2,357 checks (applocker/loop 22 new; audit-workflow 57, review 61, deployed 27, harvest 131).", "Open AppLocker signed in with nothing loaded: the rail reads 1 Draft ◉ … 6 Enforce ○, Help and scripts; the status line says Next: create a draft, pull the deployed profile, or import one; no workspace switcher.", "Upload the 2 Oct VNMPF5ZASH6 bundle: 2 Audit in tenant ✓ live on VNMPF5ZASH6 · AppLocker-f2d3b90f…, 3 Harvest ✓ 2449 events, 4 Analyze shows 0 blocked · 1103 would be blocked · 1346 allowed and waits for a draft.", "Pull the AuditOnly profile (☁️ on 3 Harvest, or the audit step): 1 ✓, 4 ◉ with the count to decide, Next: judge the 1103 would-be-blocked executions.", "Pick the Enforced V4.0.2 at the audit step: not refused — the draft is its policy, the rail stands on 6, the status line says it is the enforced profile, 6 reads ready (maintenance update).", "Click 6, then 3, then 1: each lands on its pane with the draft and the evidence still there.", "On a phone (390 px) the rail wraps with the fact lines readable."], files: ["js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "tests/applocker/loop.test.js", "tests/applocker/fixtures/scan-VNMPF5ZASH6-slim.json", "tests/applocker/audit-workflow.test.js", "tests/applocker/review.test.js", "index.html (?v= only)", "scripts/*.ps1 (build stamp only)"] },
{ n: 238, title: "🔐 T01 AppLocker — the deployed profile is the policy: a tenant card on Evidence, the stamp in the description, the draft ring in the browser, maintenance updates of an enforced profile, the mode from the values, three lights", tools: ["T01 AppLocker builder & validator"], builds: [10676], risk: "medium", what: "js/applocker.js: fnv1a / t01Stamp / stampDescription / stampOf (the one-line stamp, and drift when the values read back hash differently; masked values judge nothing); deployedMode (values, then the name token, then the table's choice) used by updateProfileInPlace instead of /Enforced/ on the name; adoptedFrom set by adoptTenantProfile (id, name, enforced, snapshot, stamp; the mode on the table follows) and cleared whenever the draft is replaced; maintenanceUpdate + readiness short-circuit + enforceGates's one green gate; the draft ring (tuno.t01.drafts.<tenant>, five entries, 1 MB per draft, 4 MB total, written by deployProfile, updateProfileInPlace and 💾); renderTenantCard on Evidence (drawn with renderEvidence, showScreen('evidence') and the tile click) with ⤓ Pull into the draft, ✏️ Keep my draft, deploy over it, the drafts' Load / XML / forget; graphErrText on the tenant read; verdictTag's audit verdict as tag audit. index.html: #alTenantCard on Evidence. css/app.css: .tag.audit. Tests: tests/applocker/deployed.test.js (27, new); tests/shell/workspaces.test.js reads T28's version instead of pinning 0.29 — the pin went red on tuno-beta CI #56 the moment 10675 moved T28 to 0.30.", why: "Mihai, 2 Oct: after deployment the policy could not be got back into T01 to adjust — the chooser that listed the deployed profiles rendered only with an events bundle loaded and no draft on the table, the audit-review road forced the mode to Audit and wrote AuditOnly, and an enforced profile could not pass the audit-first Enforce gates to be updated with one allow rule. He asked for the whole XML in the description for later use; the stamp detects drift where a copy would hide it, and the draft ring plus the Policy XML download preserve the XML without the tenant read. Risk medium: Deploy writes the live profile — but through the same update-in-place path as before, with the mode now read from the values.", test: ["Run npm test: all 32 suites pass (applocker/deployed 27 new; harvest 131, review 61, audit-workflow 58 unchanged).", "Sign in, open AppLocker: the ☁️ card is on Evidence with nothing loaded; ⤓ Read the tenant's AppLocker profiles lists each with grouping · mode by values · changed · stamp or 'no T01 stamp'.", "⤓ Pull into the draft on the enforced profile: the draft is its policy, the mode on Deploy reads Enforce, the gate line reads 'Enforced in the tenant · maintenance update (0 allow rules added)'.", "Add one publisher allow rule: the gate says 1 allow rule added; Deploy → the same-grouping stop offers Update in place → one PATCH; the profile's description ends with the stamp; the drafts card gained an entry 'deployed as …'.", "Pull again: the card shows 'T01 build 10676 · <date> · unchanged since'; edit a value in the portal and read again: 'values differ from the stamp'.", "Add a Deny rule: the three audit-first gates are back.", "A read that fails (revoke the scope) names HTTP status, code and request id in the card."], files: ["index.html", "js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "tests/applocker/deployed.test.js", "tests/shell/workspaces.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 237, title: "🚀 T28 MDE rollout — 🧪 Pilots as the policies' bar target: the pilot groups on and off a ticked policy like a wave, by tier (Pilot, Pre-Pilot), each policy taking the half of its kind", tools: ["T28 MDE rollout"], builds: [10675], risk: "medium", what: "js/mderollout.js: pilotTiers(names) beside kindFromName — the ⚙️ pilot names paired into tiers by their - D - / - U - token (INT-SG-D-Win-Pilot + INT-SG-U-Win-Pilot = Win-Pilot; a name with no token is a tier of its own, offered to no policy), exported. js/mderolloutv2.js: the bar's 🧪 Pilots target (pilotTierChips — one tick per tier, all on, remembered in pilotTiersOff; shown only with that target), dryRunPolicyPilots mirroring dryRunPolicyWaves: the names looked up by exact name at the dry run (MdeRollout.findGroups — the ids never live in the config), kinds read from the tenant (readKinds) with the name as the fallback, each ticked policy taking the half of ITS kind (policyKind), Add include / Add exclude / Remove with the waves' refusals (already on it, not on it, a name the tenant does not have, two groups sharing a name, Intune's user/device exclusion matrix, an exclusion over an include, an MDE-managed policy given a filter) under Left out, with the reason; the plan's member line names each group with what it counts (users or devices by kind) and when the change lands (the members' next check-in) and that the way back is the same bar with the opposite action; head.action add-include-pilots / add-exclude-pilots / remove-pilots; the ⚙️ pilot-names text and How it works gained a sentence; _state exports pilotTiersOff. index.html: the 🧪 Pilots button beside 🌊 Waves (the seg's title names it), the #mvBarPilotTiers slot; R40's card: Since beta 10675. js/version.js: TOOL_VERSIONS.toolMdeRollout 0.30 + note. Tests: tests/t28v2/pilot.test.js (31, new).", why: "Mihai, 2 Oct: 'Need to be able to add or remove the pilot users just as with the waves. selecting a policy and the option should be there' — clarified twice as the pilot GROUPS under ⚙️ (INT-SG-D-Win-Pilot, INT-SG-D-Win-Pre-Pilot, INT-SG-U-Win-Pre-Pilot, INT-SG-U-Win-Pilot), on and off a policy's assignments like a wave, not anyone's membership. Risk medium because it writes assignments on live PVM policies: it rides the engine's fresh read, backup, gates and ledger like every other write, touches nothing on a policy but the pilot groups of the ticked tiers, and the ⚔️ / ⚡ pilots-off logic (the waves taking over) is untouched.", test: ["Run npm test: all 31 suites pass (t28v2/pilot 31 new; mderollout/screen 279, members 131, engine 195 unchanged).", "Open 🚀 MDE rollout, read the tenant, tick a - D - policy on New (or Old): the bar's target seg offers 🧪 Pilots beside 🌊 Waves; pick it — one tick per tier (Win-Pilot, Win-Pre-Pilot), both on, the group box and the waves' pilots-off tick gone.", "② Dry run with Add include: the plan includes INT-SG-D-Win-Pilot and INT-SG-D-Win-Pre-Pilot on that policy and no user group; the member line names each group with its device count; a group the policy already has is under Left out with 'already includes'.", "Untick Win-Pre-Pilot, dry run again: only INT-SG-D-Win-Pilot goes. Tick a - U - policy: the user halves go instead.", "Remove on a policy that has no pilot group: 'Nothing to do', each group named as not on it; no write.", "Misspell a name under ⚙️, dry run: that name is left out with 'does not exist in this tenant — check the name under ⚙️'; the found half still goes.", "Apply through the gates: the run lands on the ledger titled 'Include the pilot groups (…)', its backup action add-include-pilots; 🌊 and ⚔️ unchanged.", "On a phone (390 px) in 02 Projects: the bar wraps and the tier ticks stay reachable."], files: ["index.html", "js/mderollout.js", "js/mderolloutv2.js", "js/version.js", "js/changelog.js", "js/promote.js", "tests/t28v2/pilot.test.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 236, title: "Shell — TUNO–ENCA parity slice 13: 02 Projects in use — 🚀 MDE rollout and its carry-overs; a project tool names its customer and end date (ENCA 32407, 25208)", tools: ["All tools", "T28 MDE rollout"], builds: [10674], risk: "low", what: "index.html: T28's tile data-ws=\"projects\" data-rail=\"Rollout\" (with a comment) — 02 is drawn on beta from this build; R40 says where T28 lives, R41 slice 13; Help's Getting around, beta-only sentence on 02 (drop it at promotion with the rest of 02). js/version.js: TOOL_VERSIONS.toolMdeRollout 0.29 with project: { customer: \"PVM\", ends: \"\" } — the end date is not named yet; projectChips(p, now) (customer, then ends D Mon YYYY / ended … at the end of that day in the browser's time / end date not set, never a guessed date) and toolProject(id); toolHeadTail adds them after a head's chips. js/workspaces.js: WORKSPACES.projects.carry = toolAssignEdit (Assign), toolGroupUse (Groups), toolDefender (Defender), toolEndpointSec (ASR) with project blurbs; a project tool's card leads with its project chips, a carry-over's with 'also in 01'. css/app.css: .tag.cust (lemon on --green-deep), .tag.ends (blue), .tag.noend (warning), .tag.ended (bad). css/workspaces.css: the same as .wc-chip; on a phone 02's bar hides Defender and ASR (Home, Rollout, Assign, Groups, All tools). js/promote.js: T28's staying entry says where it lives. CLAUDE.md: A project tool — what 02 asks of it (beta only, customer and end date, leaves when its project ends; carry-overs). Tests: tests/shell/workspaces.test.js 109 (T28 is 02's in the markup; customer and end date in head and card and every date state; carry-overs; T28's jump to T11 stays in 02; a carry-over on 01 stays on 01); header (01 has 30 tools, the chip and the rail switch on beta), palette (the switch entry first on an empty query, as ENCA's), tests/t28v2/workspace.test.js (the URL checks ignore the shell's ?ws=projects and check T28 is on 02).", why: "Workplan slice 13 (P3 Workspace 02 Projects, beta only): T28 into 02 with its carry-overs (T11, its only jump; T02, T15, T16 for checking waves); each project tool names its customer and end date; the 02 rules go into CLAUDE.md. Mihai, 1 Oct: go ahead with P1, P2 and P3. T28's end date is not named yet — its head and card say so until it is.", test: ["Run npm test: all 30 suites pass (shell/workspaces 109, t28v2/workspace 54).", "Sign in (or the demo): the chip 01 Intune sits beside the TUNO name; open it — 01 '30 tools', 02 '1 project tool, 4 carried over · beta only'.", "Ctrl + Shift + 2 (⌘ + Shift + 2 on a Mac): 02's Home — Projects, its lead, MDE rollout first (T28 · PVM · END DATE NOT SET · its tags), then the four carry-overs saying also in 01, then About this app; the header a lighter green with a lemon line; the rail Home, Rollout, Assign, Groups, Defender, ASR.", "Open MDE rollout, open a policy and choose to edit its assignments: the Assignment editor opens, the shell stays on 02 and Assign is lit on the rail.", "Ctrl + Shift + 1: the Assignment editor stays on screen (it is 01's tool too) and MDE rollout's tab is hidden until you switch back.", "On a phone (390 px): 02's bar is Home, Rollout, Assign, Groups and All tools; MDE rollout opens and runs.", "Chromium: the sticky stack clean at five widths (20/20), Back 28/28, no page errors, the icon survey unchanged; 02 measured at 1440, 1000 and 390, light and dark; T28 on a phone in 02 without sideways scroll."], files: ["index.html", "js/version.js", "js/workspaces.js", "css/app.css", "css/workspaces.css", "js/promote.js", "CLAUDE.md", "tests/shell/workspaces.test.js", "tests/shell/header.test.js", "tests/shell/palette.test.js", "tests/t28v2/workspace.test.js", "js/changelog.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 235, title: "Shell — TUNO–ENCA parity slice 12: two workspaces — 01 Intune and 02 Projects, the chip and its menu, ⌘⇧1 / ⌘⇧2, ?ws=projects, 02's header colour (ENCA 32407, 32430; D5 A)", tools: ["All tools"], builds: [10673], risk: "low", what: "js/workspaces.js: WORKSPACES.projects (02 Projects: title, context, lead, hint, carry []); a tile joins 02 with data-ws=\"projects\" (readTools reads ws and data-rail); sides() = 01 plus any side with a tool of its own, so carry-overs alone never draw a side and production (no project tile) has one; SHARED (Help, What's new, Roadmap) in both; inWorkspace / wsOfTool / ownOf / carryOf; toolsOf(02) = its own tools (🚀 Project tools), its carry-overs (🔗 Carried over from 01), then the app's pages — group names open with their emoji, drawn as line icons. ENCA's chip menu (#wcWsMenu, a row per drawn side with swatch, what it holds — 01 'N tools', 02 'N project tools, M carried over · beta only' — the open count and ⌘⇧N; foot), toggleWsMenu / closeWsMenu (outside click, Escape, sign-out). setWorkspace(next, opts): only a drawn side; body[data-ws], tuno.workspace, ?ws=projects by replaceState with other parameters kept; chip, rail, Home, library; a switch by hand goes Home when the screen's tool is not on the new side; quiet from openTool and synchronize, which switches when the app opens a tool of the other side (ENCA 32407). synchronize hides the other side's tabs (closest .toolnav-tab hidden). The rail: 02's shortcuts are its own tools then carry-overs; the caption's switch through sides(). Initial side: ?ws=, then tuno.workspace, then 01 — drawn sides only. ⌘⇧1/2 and the palette entries through sides(); palette hint per side. Home: #wcWsLead (ENCA's #wcPimLead); setLib's default open where the side has no overview (02). Recent tools' empty state on 02 offers its first tool. css/workspaces.css: body[data-ws=projects] --wc-brand #1e4729 and the header's inset lemon rule (D5 A, ENCA 32430); ENCA's .wc-ws-menu / -label / -foot / -row / .cur / -sw (-intune, -projects) / -keys, .wc-rail-switch; .toolnav-tab[hidden] display none; 02 hides #wcHomeLead and #wcOverview and shows #wcWsLead; ENCA's phone rule right:-40px left out — TUNO's chip sits mid-left, so placeWsMenu keeps the menu inside the window, 12 px from either edge. index.html: R41 slice 12. CLAUDE.md: Two workspaces — a side needs a tool of its own. tests/shell/workspaces.test.js (new, 76); header: the chip check reworded, the library default regex.", why: "Workplan slice 12 (P3 Workspace 02 Projects, beta only): two workspaces — roster, chip menu, ⌘⇧1/2, ?ws=projects, own header colour; a side with none of its own tools hides its chip. Mockup round 1, D5 A. Mihai, 1 Oct: go ahead with P1, P2 and P3.", test: ["Run npm test: all 30 suites pass (shell/workspaces 76).", "Sign in (or the demo): no chip beside the TUNO name and the rail's caption says 01 · Intune — no tile is in 02 until slice 13. Ctrl + Shift + 2 does nothing; adding ?ws=projects to the address still opens 01.", "To see 02 before slice 13: in the browser console run document.getElementById('toolMdeRollout').setAttribute('data-ws','projects') on the sign-in screen, then sign in. The chip shows 01 Intune; open it: two rows, 01 'N tools', 02 '1 project tool · beta only', ⌘⇧1 / ⌘⇧2.", "Open Policy overview and Windows LAPS audit, then press Ctrl + Shift + 2: 02's Home (Projects, its lead, the library open with MDE rollout first), the header a second green with a lemon line under it, the address ?ws=projects, no tabs showing.", "Open MDE rollout from the rail, then Ctrl + Shift + 1: 01's Home, its two tabs back, MDE rollout's tab hidden; the chip's menu counts 2 open on 01 and 1 on 02.", "On 01, press Ctrl + K and open MDE rollout: the shell moves to 02 on its screen. Reload: it opens on 02.", "Chromium: the sticky stack clean at five widths (20/20), Back 28/28, no page errors, the icon survey unchanged; 02's header measured #1e4729 with the lemon rule and the same height, light and dark, at 1440, 1000 and 390; the menu inside the window at 1440, 700, 390 and 320."], files: ["js/workspaces.js", "css/workspaces.css", "index.html", "CLAUDE.md", "tests/shell/workspaces.test.js (new)", "tests/shell/header.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 234, title: "Shell — TUNO–ENCA parity slice 11: Waiting for production — newest last, NEW since the last visit, risk levels only (ENCA 32318)", tools: ["All tools"], builds: [10672], risk: "low", what: "js/app.js, the queue in Help (openHelp, the block the pq harness runs): rows from PROMOTE.queueRows in two orders — rowsNewest (each row at its newest item; default) and rowsByNumber (10602's, each at its first); TUNO_PQ_ORDER in localStorage; Order chips Newest last / By number move the rows in place by data-pqblk (group key or i:<n>), so ticks and open checklists stay; NEW = n above TUNO_PQ_SEEN, or on a first visit a build dated in the changelog within three days; NEW tag on items, 'N NEW' on group rows, pq-new rows; the toolbar note with mark all seen; seen recorded by an IntersectionObserver once the list is on screen. A risk outside high/medium/low renders 'unrated' (UNRATED) instead of RISK.low. js/promote.js: item 222 risk 'medium', the sentence moved into why, detail → what (it never rendered), js/promote.js added to its files. css/app.css: .pq-order, .cg-table.pq-table tr.pq-new>td:first-child lemon edge. index.html: R41 slice 11. CLAUDE.md: risk levels only; the queue's order and NEW keys. tests/shell/queue.test.js (new, 24).", why: "Workplan slice 11 (P2 Shell for 01 Intune): ENCA's 32318 and item 222's free-text risk becoming a level. Mihai, 1 Oct: go ahead with P1, P2 and P3.", test: ["Run npm test: all 29 suites pass (shell/queue 24).", "Open Help → Waiting for production: the last rows are the newest items (this build's item at the bottom); Order shows Newest last active.", "Click By number: the rows move back to number order without losing a tick; reload Help — By number is kept; click Newest last to return.", "In the browser console set localStorage TUNO_PQ_SEEN to the highest number minus 3 and reopen Help: three items carry NEW, their groups say how many, the toolbar says 3 new · mark all seen; click it and the tags go.", "Find item 222: its risk is medium, Why carries the V2 risk sentence, and its description shows.", "Run the pq scratch suite on the Mac: item 222 no longer fails the risk level or the promote.js file check."], files: ["js/app.js", "js/promote.js", "css/app.css", "index.html", "CLAUDE.md", "tests/shell/queue.test.js (new)", "js/version.js", "js/changelog.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 233, title: "Shell — TUNO–ENCA parity slice 10: Home's Intune overview — counts, Worth a look first, the read by surface, Your checks (ENCA 25412, 25419–25426, pattern; D6 A)", tools: ["All tools", "T19 Policy overview", "T15 Defender status", "T18 Windows LAPS audit", "T13 Compliance report", "T21 Secure Score visualizer", "T25 Entra device cleanup"], builds: [10671], risk: "medium", what: "js/home-overview.js (new; ENCA's js/overview.js pattern): HomeOverview.model(res, now, ext) — counts over the policy surfaces (apps apart; filters, scope tags, ADE tokens, custom attributes minor), a failed surface → atLeast (N+), never smaller; rows per surface in Docs order, failed rows say so; findings ranked high→low: compliance coverage (estimate from assigned policies' platforms vs assigned compliance policies, Partial; exact from T13's published coverage, High unless the tenant fails closed), assigned to nobody (incl. exclusions-only; T09; show unassigned in T19), legacy intents (T20; T19 on intents), duplicate names (T19); renderers header (ENCA .db-counts.five, status loading/notread/dropped/failed/gaps), lead, context (one line a surface), worth (top three, View all, evidence in place: Observed rows, Evidence, What it means, Next step, actions), checks (ENCA .db-check rows). Glue: #wcOverview inserted into #wcHome before .wc-home-layout on tuno:wchome (so the library starts closed); lead into #wcHomeLead with Read again; screen-home hook; PolicyCache.on and RunMeta.on repaint; Read the tenant / Read again = Graph.ensureScopes(PolicyCache.scopesNeeded()) + PolicyCache.refresh at the click; clicks open T19 via OverviewTool.openWith({surf|surfs, verdict}), T03 for changed, tools by their tile, Run by the tool's own button. js/runmeta.js (new; ENCA 25412's descriptor + a registry): of, publish(tool, ctx, headline, data), last (stale across tenants), clear (sign-out), on. T15/T18/T13/T21/T25 publish their headline when a read lands (T13 with coverage + secureByDefault; T21 from run and readFor). js/policycache.js: on(fn) events start/done/failed/dropped/cleared/cold, warming(), droppedAt(); warmed set where the read lands (warmPending), so 'done' knows its source; clear() no longer looks like a write. js/overview.js (T19 1.0.10): openWith + surfSet (policy surfaces only, said above the cards, Show everything). css/home-overview.css (new): ENCA's db-* rules with #overview → #wcOverview, minus map/advisories/IdScore; TUNO: unk/warn counts, one-line surface rows, icon sizes, phone two-column counts. index.html: the three files (67 ?v= refs); R41 slice 10; Help Getting around. js/workspaces.js comments; CLAUDE.md: Home's Intune overview reads nothing. tests/shell/home.test.js (new, 76); screen 67 refs; header/palette slice checks made tag-proof.", why: "Workplan slice 10 (P2 Shell for 01 Intune): the Intune overview on Home, mockup round 2 pick D6 A. Mihai, 1 Oct: go ahead with P1, P2 and P3.", test: ["Run npm test: all 28 suites pass (shell/home 76).", "Sign in (or the demo): Home shows five counts, Worth a look first with three findings worst first, In the sign-in read with one line per surface, and Your checks with five tools not run; Recent tools and All 31 tools · Show below.", "Click Assigned to nobody: Policy overview with Unassigned active and exactly that many cards — 'Policies and profiles only…' above them; Show everything adds filters and scope tags back.", "Click a finding: it opens in place with the policies it names, what it means and the next step; the buttons open the tool or Policy overview filtered.", "Your checks → Run check on Defender status: the tool opens and reads; back on Home the row shows 8 Windows devices · 3 with findings · 2 with no state, the time and complete.", "A tenant without consent for the policy read: Home says Not read yet with — in every count and Read the tenant; pressing it asks once and fills the overview.", "Chromium: the sticky stack clean at five widths (20/20), Back 28/28, no page errors, icon survey unchanged; Home light and dark at 1440, 1000, 760 and 390 with no sideways scroll."], files: ["js/home-overview.js (new)", "js/runmeta.js (new)", "css/home-overview.css (new)", "js/policycache.js", "js/overview.js", "js/defender.js", "js/laps.js", "js/compliance.js", "js/securescore.js", "js/devicecleanup.js", "js/app.js", "js/workspaces.js", "index.html", "CLAUDE.md", "tests/shell/home.test.js (new)", "tests/shell/header.test.js", "tests/shell/palette.test.js", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 232, title: "Shell — TUNO–ENCA parity slice 9: the command palette on Ctrl/Cmd+K (R38; ENCA R03, 25006, 32407)", tools: ["All tools", "T19 Policy overview"], builds: [10670], risk: "low", what: "index.html: #cpModal (ENCA's markup; placeholder by name, panel aria-label \"Command palette\"). js/app.js: ENCA's palette — cpScore (prefix 100, mid-word 60−i, initials 40/25; TUNO also tries the whole name so leading punctuation matches as typed), cpBuild (TOOL_TABS with T-numbers from TOOL_VERSIONS — exact number 200; Workspaces.paletteItems; the policies of PolicyCache.get() by name, hint surface · platforms, score −0.1 so tools lead ties; signed in with a cold cache and a query, a last row \"Read the tenant to search its policies\" → T19), cpRender (a line icon per row, tool names without emoji, policy names as read, .cp-pol), cpOpen (signed in only; closes #wcLauncher; scope note \"N policies searchable · read at HH:MM\" / reading / \"Policies once the tenant is read\"; focuses the input after accessibility.js notes where focus came from), cpRun (tool → its tile's click; policy → T19's tile, then OverviewTool.openFromPalette(key)); keydown Ctrl/Cmd+K toggles (not with Shift or Alt — Firefox's console), Escape, arrows, Enter; backdrop click. js/overview.js: openFromPalette(key) moves a screen holding an older read to the cache's before opening the card. js/accessibility.js: a dialog with its own aria-label keeps it (ENCA overwrites with \"Dialog\"). css/app.css: ENCA's palette rules were there since build 1; + .cp-ic, the 12vh placement under the shell (calc(var(--demo-bar-h) + 12vh), clear of the ribbon), the phone policy row. Roadmap: R38 moved to In beta today (live · beta 10670), Next says what is next; R41 slice 9. Help: Getting around. CLAUDE.md: the ⌘K palette reads what is already there. tests/shell/palette.test.js (new, 62).", why: "Workplan slice 9 (P2 Shell for 01 Intune): ⌘K palette, roadmap R38. Mihai, 1 Oct: go ahead with P1, P2 and P3.", test: ["Run npm test: all 27 suites pass (shell/palette 62).", "Signed in (or the demo), press Ctrl + K (⌘ + K on a Mac): the palette opens below the header with the tools listed by name, each with its icon; the footer says how many policies are searchable.", "Type gm, maa, asr, t17 and 17: Group migration, Multi-admin approval, Firewall & ASR coverage, Multi-admin approval twice; Enter opens the tool and its tab.", "Type part of a policy name: the policy with its surface and platform; Enter opens Policy overview with its card.", "Esc, a click outside and Ctrl + K again close it; focus returns to where it was. Ctrl + Shift + K still opens Firefox's console.", "All tools open, then Ctrl + K: the library closes and the palette opens.", "Phone width: a policy's surface sits under its name.", "Chromium: the sticky stack clean at five widths (20/20), Back 28/28, no page errors, the icon survey unchanged; the palette placed at 148 px (1440, demo) and 221 px (390, demo), clear of the ribbon."], files: ["index.html", "js/app.js", "js/overview.js", "js/accessibility.js", "css/app.css", "CLAUDE.md", "tests/shell/palette.test.js (new)", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 231, title: "Shell — TUNO–ENCA parity slice 8: Home as ENCA's — the tenant over the heading, Recent tools, the library; the tiles hidden (ENCA 25401, 25422, 25426)", tools: ["All tools"], builds: [10669], risk: "medium", what: "js/workspaces.js: #wcHome prepended to #screen-home on sign-in — .wc-home-heading (#wcTenant \"<tenant> · Workspace 01\", #wcHomeTitle from WORKSPACES, #wcHomeLead empty until slice 10, #wcEnvironment \"Demo · sample data\" / \"Your tenant · live reads\"), .wc-home-layout (aside .wc-recent-panel with #wcRecent; section .wc-library with #wcLibraryCount, #wcToggleLibrary Hide/Show, #wcToggleGroups Collapse/Expand all, #wcOverviewTools of <details class=wc-tool-group> per tile section with the section's data-icon), .wc-home-foot (TUNO help →); renderHome/renderRecent/setLib/bindGroups as ENCA's; recent = {id, at}, five, newest first, cleared on a new session key; library open state tuno.wcLibraryOpen:<ws>, default OPEN until #wcOverview exists (ENCA's 01 default closed); the tuno:wchome event for the overview; cards carry the tile's h3 .tag list as .wc-chip (block/new/upd), and the launcher's search reads the tags; a card with no T-number names its group without the section's emoji (also in the launcher). TUNO differences documented in the header: T-number + opened HH:MM in Recent tools (ENCA: Opened this session); no Current snapshot panel; live-reads environment text. css/workspaces.css: ENCA's Home rules (heading, demo dot, layout incl. lib-closed, recent panel, empty state, section heading, foot, tool groups, the 25426 flat-home block, 1000 px and 700 px Home rules), body.workspaces-shell #screen-home>:not(#wcHome){display:none!important}, .wc-chip with TUNO's tag colours, .wc-tool-group>summary>.fi-run keeps the group name's look. index.html: R41 slice 8 paragraph (slices 1–8 · beta 10669), Help Getting around (cards, Recent tools, Hide, chips, Tab reaches every card). CLAUDE.md: Home is the library; the tiles are the registry. tests/shell/header.test.js +38 (104).", why: "Workplan slice 8 (P2 Shell for 01 Intune): ENCA's Home with Recent tools and the library, the tile grid hidden. Mihai, 1 Oct: go ahead with P1, P2 and P3.", test: ["Run npm test: all 26 suites pass (shell/header 104).", "Sign in (or the demo): Home shows CONTOSO B.V. · WORKSPACE 01 over Intune overview, Recent tools on the left (empty: Open Policies →) and All 31 tools on the right in six groups; no tiles.", "Open Policies, Groups and the Assignment editor, then Home: Recent tools lists them newest first with T-number and time; the Assignment editor's card says WRITES TO THE TENANT.", "Hide: the library folds away and Recent tools becomes one row; reload — Home starts with the library hidden; Show brings it back. Collapse all / Expand all fold every group.", "All tools: type writes — the six tools that change the tenant.", "Sign out and in again: Recent tools is empty.", "Phone width: one column — heading, Recent tools, the library — above the bottom bar.", "Chromium: the sticky stack clean at five widths (20/20), Back 28/28, no page errors, no icon parted from its words; Home light and dark at 1440, 1000, 760 and 390 with no sideways scroll."], files: ["js/workspaces.js", "css/workspaces.css", "index.html", "CLAUDE.md", "tests/shell/header.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 230, title: "Shell — TUNO–ENCA parity slice 7: the branded header with the 60 px medallion, the 88 px rail, the tool library (ENCA 25401, 25427, 25494)", tools: ["All tools", "T11 Assignment editor"], builds: [10668], risk: "medium", what: "js/workspaces.js (new; ENCA's 25401…32430 as at 32433, a presentation layer): on sign-in (#side-toolOverview) body.workspaces-shell; the brand (.wc-brand: #brandLogo + #wcBrandName) in the logo's link, the context line #wcHeaderContext, #wcHeaderTools (All tools), #wcAccountLabel before the initials (tenant from window.TunoTenant + body.demo-mode, round 1 D2 B), the theme button and #wcCloseAll (\"Close all tools\") moved into the account menu, #wcSessionNote; #wcRail with Home, the seven D1 A shortcuts (toolOverview, toolGroupUse, toolDevice, toolPosture, toolAssignEdit, toolWinBaseline, toolAppLocker), All tools, Help and the workspace caption; the tab strip's Overview + icon-and-name tabs (data-navadd/help/closeall hidden); the #wcLauncher dialog (TUNO's one-line blurbs, groups with their data-icon, search by name, task or T-number); every click ends in #side-<id>. TUNO differences: one workspace (the chip, menu, rail switch and ⌘⇧1/2 are ported but drawn only with a second one, slice 12); Home stays the tile grid (slice 8); no connected-app block (slice 16); no ?.; the dialog opens without showModal where there is none; FlatIcons.start() moved here from app.js, as in ENCA. css/workspaces.css (new; ENCA's minus Home, 02 and ENCA-screen rules): branded header (padding-top 28px under the ribbon), rail 88 px / 62 px bottom bar under 700 px (Posture, Baseline, AppLocker, Help off the phone bar), sidebar hidden, main and footer beside the rail, the 60 px header medallion (25494) showing new assets/logo-medallion-{light,dark}{,-beta}.svg (the inner disc, round 1's crop; a self-hosted logo is never cropped), .ae-selbar/.run-badge/.toast beside or above the rail. css/tool-layout.css: ENCA's body.workspaces-shell rules that match TUNO elements (flat head, panels, toolbar, buttons, modal surfaces). js/tool-layout.js: ENCA's contrast half (--wc-brand-ink from the header's colour; no ** and no ?.). index.html: both files in ENCA's places (64 ?v= refs); Help: Getting around rewritten for the rail and All tools; roadmap R41. CLAUDE.md: the shell is drawn over the old navigation. tests/shell/header.test.js +41 (66); icons and screen counts updated.", why: "Workplan slice 7 (P2 Shell for 01 Intune); mockup round 1 picks D1 A (rail in work order), D2 B (tenant name and initials), D4 A (keep the ep-rail inside tools). Mihai, 1 Oct: go ahead with P1, P2 and P3.", test: ["Run npm test: all 26 suites pass (shell/header 66, T28 V2 workspace 53 with the shell loaded).", "Sign in (or the demo): the green header with the mark on a medallion over the rail, Intune / Workspace 01, All tools, and your tenant's name beside your initials; the rail shows Home, Policies, Groups, Devices, Posture, Assign, Baseline, AppLocker, All tools, Help.", "Click Groups on the rail: Group Analyzer opens, Groups is highlighted, its tab shows its icon and name; Home goes back to the tiles.", "All tools: type T18 — Windows LAPS audit alone; click it — it opens and the library closes.", "Phone width: the rail is a bottom bar (Home, Policies, Groups, Devices, Assign, All tools); the account sits on its own line; 🚀 MDE rollout reads and plans as before.", "Account menu: Copy tenant ID, Branding settings, Theme, Close all tools, Sign out, and the session line; Sign out returns to the sign-in card with no rail.", "Chromium: the sticky stack clean at five widths (20/20, header 93 px with the ribbon), Back 28/28, no page errors on any tool screen or read, no icon parted from its words; the beta host shows the BETA medallion, light and dark."], files: ["js/workspaces.js (new)", "css/workspaces.css (new)", "assets/logo-medallion-light.svg (new)", "assets/logo-medallion-dark.svg (new)", "assets/logo-medallion-light-beta.svg (new)", "assets/logo-medallion-dark-beta.svg (new)", "js/tool-layout.js", "css/tool-layout.css", "js/app.js", "js/flat-icons.js", "index.html", "CLAUDE.md", "tests/shell/header.test.js", "tests/shell/icons.test.js", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 229, title: "Shell — TUNO–ENCA parity slice 6: the brand as ENCA wears it — redrawn marks with BETA editions, the three-way ribbon, the sign-in medallion, branded dark neutrals (ENCA 32302, 25229, 25493, 32313)", tools: ["All tools"], builds: [10667], risk: "low", what: "assets/: logo-mark-light.svg, logo-mark-dark.svg and favicon.svg redrawn in the family of ENCA 32302 (pale disc #eef5e6, gold ring, the device stroked with a deep-green gradient #3f7a24→#1e4729→#12331f and the gear gold #dfb32b; dark: disc #2f5c1a, device lime #e2f58a→#c8e84a→#8fb82c, gear #e8c132; the background gear drawn as ENCA's), and new logo-mark-light-beta.svg, logo-mark-dark-beta.svg, favicon-beta.svg with ENCA's yellow #ffd21f BETA pill; asset ?v=3 everywhere (branding.js, css/app.css, index.html). js/branding.js: betaHost nurejev.github.io, betaLogo/betaLogoDark/betaFavicon. js/app.js: applyBranding's betaMark (beta host, no override, betaLogo set) toggles html[data-beta-mark] and picks the BETA favicon and logos; html.brand-wide-logo for a wide wordmark; deploymentKind() production/beta/selfhosted and markNonProduction's three-way ribbon (\"⚙ SELF-HOSTED\" slate #3b5a72, [SELF-HOSTED] title; the BETA one unchanged, still under the demo bar); isProduction() takes ENCA isProdHost's semantics (false on a blank host or an error, was true on an error). js/selfhost.js: the relabelled ribbon names no host. js/selfhost-boot.js: flags brand-wide-logo before the first paint. css/app.css: the 124 px sign-in medallion (25493, verbatim), the dark BETA mark under data-beta-mark (explicit and automatic), the branded dark neutrals block (32313; --chip-bd and --sw-track kept although no TUNO rule reads them yet). README: the three deployments. CLAUDE.md: Three deployments, and the brand assets' own ?v=. Roadmap R41. tests/shell/brand.test.js (37); the harness boots from another origin with seeded storage and bridges BRANDING.", why: "Workplan slice 6 (P2 Shell for 01 Intune). Mihai, 1 Oct: go ahead with P1, P2 and P3, and \"when rebuilding don't forget to adjust the logos as with enca\".", test: ["Run npm test: all 26 suites pass (shell/brand 37).", "Beta site, signed out: the red BETA ribbon, a [BETA] tab title, the BETA favicon, and the sign-in mark with its BETA pill on a round medallion over the card's top edge; switch to dark — the dark BETA mark.", "Run the beta build from localhost (or any other host): the slate SELF-HOSTED ribbon and [SELF-HOSTED] title, the plain mark, no host named.", "Production after promotion: no ribbon, no title tag, the plain redrawn mark.", "Chromium against 10666: every tool screen element-for-element identical at 1440 and 390 (58/58), the sticky stack 20/20, Back 28/28; the three hosts served from one tree give BETA / SELF-HOSTED / nothing, the marks and favicons as above, the medallion 124 px with half of it above the card; no page errors."], files: ["assets/logo-mark-light.svg", "assets/logo-mark-dark.svg", "assets/favicon.svg", "assets/logo-mark-light-beta.svg (new)", "assets/logo-mark-dark-beta.svg (new)", "assets/favicon-beta.svg (new)", "js/branding.js", "js/app.js", "js/selfhost.js", "js/selfhost-boot.js", "css/app.css", "index.html", "README.md", "CLAUDE.md", "tests/shell/brand.test.js (new)", "tests/platformbaseline/harness.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 228, title: "Shell — TUNO–ENCA parity slice 5: line icons in the chrome (ENCA 25406)", tools: ["All tools", "T09 Assignment health"], builds: [10666], risk: "low", what: "js/flat-icons.js (new; ENCA's FlatIcons, 25406 as at 32433): a leading emoji in button, label, summary, h1–h5, th, .tool-ic, .sn-ic, .tag, .fchip, .state (ENCA's selector) and TUNO's .ep-node rail rows is drawn as an 18 px line icon in currentColor. TUNO differences, documented in the file: the emoji stays in the slot as hidden text (.fi-glyph), so textContent reads exactly as before; icon and words are one span.fi-run, so a flex or grid label keeps one line; only mapped emoji are drawn (ENCA draws a grid square for the rest; ENCA's 🧪 is not mapped); a tool's icon comes from names[] by tool id on the tile, sidebar, tabs, ＋ menu and head (T07/T23 share 🛡), and a heading that opens with a tool's head line takes that tool's icon; data-icon names a heading's shape (the six Home sections, carried to the sidebar's h4s); shapes added: monitor, compass, filter, rocket (round 1), tag, plus, eye; the svg carries width/height 18; the observer draws only the mutated subtrees (a full pass is ~21 ms on an 18,800-element page); no ?. and a setTimeout fallback for requestAnimationFrame. css/flat-icons.css (new): ENCA's rules verbatim, then TUNO's (.fi-glyph hidden, .fi-solo, the heading rule one level deeper for .fi-run, 13 px icons in sidebar section titles and in .tag/.state). js/app.js starts it at the end of its boot (slice 7's workspaces.js takes that over, as in ENCA); renderSideNav carries data-icon. css/app.css: .sidenav .sn-ic flex:0 0 auto (ENCA's), the trailing blank line gone. js/health.js: T09's kind chips are data-preserve-text (a legend shared with the cards and row tags). index.html: both assets in ENCA's places (62 ?v= refs), data-icon on the Home sections; roadmap R41. CLAUDE.md: Icons in the chrome are line icons. tests/shell/icons.test.js (40); platformbaseline/screen counts 62.", why: "Workplan slice 5 (P1 Foundation); mockup round 1, D3 A (line icons). Mihai, 1 Oct: go ahead with P1, P2 and P3.", test: ["Run npm test: all 25 suites pass (shell/icons 40).", "Home: every tile, section and sidebar entry shows a line icon; switch to dark — the icons turn light with the text. Open 🛡 Intune RBAC and 🛡 Restricted AUs — their tabs and headings show different icons (people, a stop sign).", "🩺 Assignment health → Check assignment health: the Where to look cards read icon + name on one line; the kind chips above the cards keep their emoji.", "🗂 Policy overview: the rail rows and the surface chips on the cards have line icons; a card is as tall as before, give or take a pixel; ⭳ Export MD still downloads the same text.", "Chromium, 10666 demo: the sticky stack identical to 10665 at five widths (20/20); Back 28/28; slice 4's checks pass; no icon parted from its words on any screen; left as emoji: ☐ ☰ ↩ (text symbols), ⌨️ 🤖 🚚 (three headings); no page errors."], files: ["js/flat-icons.js (new)", "css/flat-icons.css (new)", "js/app.js", "js/health.js", "css/app.css", "index.html", "CLAUDE.md", "tests/shell/icons.test.js (new)", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 227, title: "Shell — TUNO–ENCA parity slice 4: column resize on data tables, dialogs that hold focus, tiles from the keyboard (ENCA 32312, 25357)", tools: ["All tools", "T19 Policy overview", "T07 Intune RBAC"], builds: [10665], risk: "low", what: "js/col-resize.js (new; ENCA 32312 verbatim but tuno-colw: as its storage prefix, and one TUNO rule: a table whose <colgroup> sets widths keeps its layout). js/accessibility.js (new; ENCA 25357 adapted): .modal-bg.open and #fsModal.show get role=dialog, aria-modal and aria-labelledby (the ⛶ panel by #fsTitle), focus moves in, Tab wraps, everything outside is inert, focus returns on close; Escape goes to the tools first and a dialog still open afterwards closes through its own Close button (window, bubble phase) — ENCA's capturing Escape and its injected Close button are not ported, because they would skip the tools' own close functions; home tiles get a .tool-launch button holding the name (only the name's text moves; the spaces between chips stay); #logoHome is a keyboard button. No optional chaining, no Array.prototype.at. app.js: the tile ranking's toolName reads the .tool-launch text. css/app.css: ENCA's column-resize rules and .tool-launch. index.html: both scripts after app.js in ENCA's order (60 ?v= refs); T19's search placeholder Find a policy… Help: Getting around. Roadmap R41. tests/shell/dialogs.test.js (33); platformbaseline/screen counts 60.", why: "Workplan slice 4 (P1 Foundation). Mihai, 1 Oct: go ahead with P1, P2 and P3. Column resize was Mihai's own ask on ENCA (24 Sep, 32312: make every table column expandable by user).", test: ["Run npm test: all 24 suites pass (shell/dialogs 33).", "🗂 Policy overview, List view: hover a header's right edge — a grip line; drag it — the column widens; reload — it stays; ↺ in the last header — the tool's layout is back. Double-click a grip — the column fits its widest entry.", "Open any dialog (a group's members in 🛡 Intune RBAC, a policy card in 🗂): Tab cycles inside it and never reaches the page behind; Escape closes it; focus is back on the control that opened it.", "Home: press Tab until a tile's name is outlined, then Enter — the tool opens. The tiles look exactly as before (checked pixel for pixel against 10664).", "Chromium, 10665 demo: 31 tile buttons; Enter opens Defender status; a dialog takes focus, makes the header inert, keeps six Tabs inside, closes on Escape and returns focus; a drag widened a column 209 → 325 px and stored it under tuno-colw:; no page errors."], files: ["js/col-resize.js (new)", "js/accessibility.js (new)", "js/app.js", "css/app.css", "index.html", "tests/shell/dialogs.test.js (new)", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 226, title: "Shell — TUNO–ENCA parity slice 3: the folding tool head and the toolbar slot order (ENCA 25451, 25351)", tools: ["All tools", "T19 Policy overview", "T12 Setting conflict scan"], builds: [10664], risk: "low", what: "js/tool-layout.js (new; ENCA's, the fold half): every .screen.tool > .readme becomes .wc-tool-head, its title .wc-page-title with a ▾/▸ button (aria-expanded) after the version stamp; the fold toggles .wc-head-folded and is kept in localStorage per screen (tuno-head-fold:<screen id>), re-applied by a MutationObserver on the head; ENCA's contrastInk half waits for slice 7, its #anIntro line is ENCA's own. css/tool-layout.css (new; the fold rules of ENCA's file). index.html loads both after app.css / app.js (58 ?v= refs). css/app.css: THE SLOT ORDER from ENCA 25351 (.toolbar > * order 5, .search 1 with a fixed clamp width, .seg/.tb-scope 2, .chip-filter and TUNO's .sel-filter 3, .tb-win 4, .tb-actions 6); T19's toolbar markup puts the search before the view switch and its verdict chips are a .chip-filter; T12 wraps its verdict chips in a .chip-filter so they stay before its platform select. .sel-filter outside the selection bar takes var(--surface)/var(--border)/var(--ink). T19's search placeholder shortened, the full text moved to title and aria-label. Help: Getting around. Roadmap R41. tests/shell/layout.test.js (25); platformbaseline/screen counts 58 ?v= refs.", why: "Workplan slice 3 (P1 Foundation). Mihai, 1 Oct: go ahead with P1, P2 and P3. The head fold was Mihai's own ask on ENCA (25451: the top bar takes too much space); the slot order is what keeps a control in one place across tools. The select contrast was found while checking the T19 toolbar.", test: ["Run npm test: all 23 suites pass (shell/layout 25).", "Open any tool: its heading ends in ▾. Press it — the paragraphs go, the heading and version stay, the screen moves up; the button shows ▸. Open another tool and come back: still folded. Reload the page: still folded. Press ▸: the text is back.", "🗂 Policy overview: the search box comes first and keeps its width, then Cards / List, then Platform, then the verdict chips. Tab through: the focus follows the same order.", "⚔️ Setting conflict scan after a scan: the verdict chips, then Platform — as before.", "Light theme: the Platform select on T19, T12, T13 and T14 reads dark on light; on 📄 Configuration documenter's selection bar it is unchanged.", "Checked in Chromium against 10663 at 1440 and 390 px: the toolbars of 🔑 T18 and 🩺 T09 after a demo read are element-for-element where they were. T03, T22, T23 and T28 build theirs from chips and an input only, which the order leaves as written — worth a look after a real read."], files: ["js/tool-layout.js (new)", "css/tool-layout.css (new)", "css/app.css", "index.html", "js/conflict.js", "tests/shell/layout.test.js (new)", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 225, title: "Shell — TUNO–ENCA parity slice 2: every tool heading from one place (toolHead, ENCA 25352)", tools: ["All tools", "T28 MDE rollout"], builds: [10663], risk: "low", what: "js/version.js: the head line from ENCA 25352, adapted — toolNo, HEAD_CHIP (BETA and NEW → new, UPDATED → upd, writes to the tenant → block, temporary → plain), headEsc, headChip, toolHeadTail (status chips only on a beta build, APP_BUILD.isBeta, so production heads need no relabel), toolHeadInner, toolHead (h2); head and chips on all 28 TOOL_VERSIONS entries, exactly as typed at 10662. index.html: the 28 headings are empty <h2 data-tool-head> (27 lose style=margin:0 0 6px; T28's sits in its workspace header); R41 card. js/app.js: fills [data-tool-head] once at startup with toolHeadInner; SCREEN_TOOL, stampHeadVersion and its 28 MutationObservers removed; toolNo moved to version.js. css: .screen.tool > .readme > [data-tool-head]{margin:0 0 6px}. CLAUDE.md and the promotion step 5 note: screen heads relabel themselves. tests/shell/heads.test.js (35).", why: "Workplan slice 2 (P1 Foundation). Mihai, 1 Oct: go ahead with P1, P2 and P3. One registry entry per tool is also what the workspace shell (slices 7 and 12) reads its names from.", test: ["Run npm test: all 22 suites pass (shell/heads 35).", "Open any tool on beta: its heading reads as before — name, BETA, writes to the tenant where the tool writes, T-number · version. Checked in Chromium element by element against 10662 at 1440 and 390 px: 27 headings identical.", "Open 🚀 MDE rollout: its heading now ends in T28 · v0.28.", "After the next promotion, on production: headings show no BETA chip and keep writes to the tenant, with nothing relabelled in index.html for them."], files: ["js/version.js", "index.html", "js/app.js", "css/app.css", "js/promote.js", "CLAUDE.md", "tests/shell/heads.test.js (new)", "js/changelog.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 224, title: "Shell — TUNO–ENCA parity slice 1: the sticky stack measured with the demo bar in it, one frame for every tool screen, Back from all 28 tools, no optional chaining", tools: ["All tools", "T01 AppLocker", "T11 Assignment editor", "T08 Assignment what-if"], builds: [10662], risk: "low", what: "index.html: the demo bar moved to the top of the body, before the header; the 28 tool sections carry class screen tool (sign-in, Home, What's new, Roadmap and Help do not) and the 31 tiles class tool tool-tile; the 27 head cards' style=margin-top:0;padding:20px 24px and the 22 results' style=margin-top:14px removed (the results are .tool-body); Help's What TUNO is gains Getting around; roadmap card R41 (TUNO 2.0 — ENCA's workspace shell, slice 1). css/app.css: THE TOOL SCREEN FRAME (ENCA 25351: .screen.tool > .readme and > .list-card:first-child margin-top 0, > .readme padding 20px 24px, > .toolbar and > .tool-body margin-top 14px); the tile rules renamed .tool → .tool-tile (ENCA's split at 25357 — written against bare .tool they would style all 28 screens); body.demo-mode .sidenav's calc(58px + bar) removed (it left out the tab bar). js/app.js: syncStickyTops ported from ENCA 32433 with the demo bar as the first box of the stack (--demo-bar-h; --sticky-header = bar + header; --sticky-nav = + tab bar) and a ResizeObserver on the bar, the header and the tab bar; loadDemo's own bar measure and observer gone; HISTORY_SCREENS = Home, What's new, Roadmap, Help + every section.screen.tool (defender, endpointsec, posture, securescore, maa, laps, restrictedau and groupmigrate were missing); the BETA ribbon sits at top:var(--demo-bar-h,0px). Optional chaining cleared — app.js 2, applocker.js 11 on 7 lines, assignedit.js 3, suggest.js 1 — each rewritten to the same result. tests/shell/foundation.test.js (54): the ?. tokenizer (agrees with acorn: 17 chains at 10661, 0 now, 647 in ENCA's js/), the frame, Back from every tile plus a real history.back(), the stack arithmetic with the demo bar. CLAUDE.md: the frame rule and the optional-chaining test.", why: "Workplan slice 1 (P1 Foundation, TUNO–ENCA parity). Mihai, 1 Oct: TUNO on par with ENCA, ENCA's beta layout first. The demo bar covering the header on Home was seen on 1 Oct; Back from eight tools had been broken since each one shipped.", test: ["Run npm test: all 21 suites pass (shell/foundation 54).", "Open ?demo=1 at full width: the DEMO TENANT bar is at the very top, the header fully below it, the BETA ribbon hanging from the header. Open two tools: the tab bar shows both tabs under the header and the sidebar starts below the tab bar. Scroll: the three stay stacked.", "The same on a phone (390 px): the bar wraps to three lines and the header and tab bar sit below it.", "Open 🦠 Defender status, then 🔑 Windows LAPS audit, and press the browser's Back: Defender comes back. Any two tools behave the same.", "Every tool screen looks exactly as it did — checked in Chromium element by element against 10661 at 1440 and 390 px (28 screens and the home grid at each width).", "T01 (applocker.js), T11 (assignedit.js) and T08's subject picker (suggest.js) lost their optional chaining with the same results: T01's Analyze & improve audit receipt and profile list, T11's target and action pickers, T08's user/device switch."], files: ["index.html", "css/app.css", "js/app.js", "js/applocker.js", "js/assignedit.js", "js/suggest.js", "tests/shell/foundation.test.js (new)", "CLAUDE.md", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 223, title: "T28 — V2 is the only T28 screen (original controller and switch removed)", tools: ["T28 MDE rollout"], builds: [10661], risk: "medium", what: "index.html: the version bar and the original #t28Workspace1 markup removed, #t28Workspace2 shown with the head MDE rollout · BETA · temporary, js/t28v2.js's script tag gone (56 ?v= refs); R40 roadmap card says so. js/mderollout.js keeps the engine (MdeRollout) only; js/mderolloutv2.js keeps the V2 screen only, on MdeRollout (its byte-identical MdeRolloutV2 copy removed), registers TunoScreenHooks['screen-mderollout'] itself; app.js inits MdeRolloutV2Tool. loadCfg: no tuno.t28.v2.rules.<tenant> → tuno.t28.rules.<tenant> is read once, normalised, saved under the V2 key and named on the Naming rules pane; the old key is never written. css: the version-bar rules and the original #mrBarPilotsL rules removed. docs/T28-V2.md notes the change. Tests: the original screen suite ported to V2 (mv* ids, MdeRolloutV2Tool, V2's risk decision and group backup answered where a plan asks — 279), tests/t28v2/engine.test.js removed (the engine suite pointed at the removed copy), t28v2/workspace drops the switch and gains the carry-over scenario (53), platformbaseline/screen counts 56 ?v= refs.", why: "Mihai, 1 Oct: 'make the v2 default and remove the other one' and 'v2 is the new. if there is something missing just port it to the new v2'. The original screen's whole suite passing against V2 is the proof nothing was missing.", test: ["Run npm test: all 20 suites pass (mderollout/screen 279 against V2, t28v2/workspace 53).", "On PVM: open T28 — V2 opens directly, no Existing / V2 bar → ↻ Read the tenant → ⚙️ Naming rules shows your saved rules ('Carried over' if V2 had none yet) → the waves, members and exclusions panes work as before; the risk decision and group backup appear where V2 asks for them."], files: ["index.html", "js/mderollout.js", "js/mderolloutv2.js", "js/t28v2.js (removed)", "js/app.js", "css/t28v2.css", "css/app.css", "docs/T28-V2.md", "tests/mderollout/screen.test.js", "tests/t28v2/engine.test.js (removed)", "tests/t28v2/workspace.test.js", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "scripts/*.ps1 (build stamp only)"] },
{ n: 222, title: "T28 — parallel V2 workspace inside the existing tool", tools: ["T28 MDE rollout"], builds: [10660], files: ["js/mderolloutv2.js", "js/t28v2safety.js", "js/t28v2.js", "css/t28v2.css", "index.html", "js/promote.js"], risk: "medium", why: "Requested full second version within T28 on the same URL. The risk, as written at 10660 (until 10672 it stood in the risk field, which rendered it as low): V2 writes to the same tenant; Graph verification is eventual; no live-tenant acceptance test has been performed — that test is what graduation needs.", test: ["npm test, including V2 integration and safety suites", "Verify Existing/V2 switching, group drift rejection and ASR risk gates in demo"], what: "Guided overview, isolated plans and rules, ASR/retirement gates, member backup and drift preflight, verified-only readiness and exported run records. Same Graph sign-in; the original controller was retained at 10660 and removed at 10661 (item 223)." },
{
  "n": 221,
  "title": "T28 — 👥 a primary user in no country group: the deleted user's live account, else the device name, else usage location",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10659
  ],
  "risk": "medium",
  "what": "MdeMembers: realUpnOf strips Entra's <32-hex object id> prefix off a deleted user's UPN. readInput looks every Windows primary user outside the read country groups up once (deleted: /users?$filter=userPrincipalName eq '<old UPN>'; live: /users/{id}; 404 = gone) → input.primaryUsers {deleted, realUpn, id, upn, usageLocation, found}. compute: for such a device, via 'real' (the live account is in a country group → byUser under the live id), else 'name' (ISO3 prefix of a country in the table), else 'userloc' (the user's usage location ISO2); placed ones leave 🕳 noCountry, the rest carry the live UPN, deleted flag and a detail line. VIA_TEXT/csv, the device rows' chips, problems.byReal/byOutside, ❓ How it works.",
  "why": "Mihai, on 🕳 'Windows devices no country device group will hold' (BGD5CD5302DG8 with 06a64d50…Nausad.Ahmed@…, IDNGM15S2J3, PHL5CD51047CS …): 'these devices have a username in their primary user. extract that name and find the real user. also in most of the cases in the devicename the country is there … mix and match'.",
  "test": [
    "Run npm test: all 18 suites pass (mderollout/members 131, +13).",
    "On PVM: 👥 → ↻ read → 🕳 Left out → 'primary user in no country group': BGD5CD5302DG8, IDNGM15S2J3, PHL5CD51047CS etc. are gone from the list and appear under Bangladesh / Indonesia / the Philippines with 'deleted primary user · by name BGD'. 5CG0521757 (Scott.Swanson) lands in his live account's country, or stays listed with the reason."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "tests/mderollout/members.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 220,
  "title": "T28 — 🎛 Adjust settings on a phone: each rule a card, the mode picker in view",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10658
  ],
  "risk": "low",
  "what": "css/app.css: under 760px .mr-asr-table drops its min-width and header; each tr is a 3-column grid — rule and policy full width, Now / New / Baseline with data-label captions, the verdict chip full width; an edited row is highlighted as a whole. mderollout.js: the cells carry classes and data-label.",
  "why": "Mihai: 'I cannot see the field in mobile' — at 390px the 10657 table scrolled sideways inside its card and the New picker started off-screen.",
  "test": [
    "Run npm test: all 18 suites pass (mderollout/screen 277, +2).",
    "On a phone (or a 390px window): T28 → 🎛 Adjust settings — each rule is a card and the New picker is visible without scrolling sideways."
  ],
  "files": [
    "css/app.css",
    "js/mderollout.js",
    "tests/mderollout/screen.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 219,
  "title": "T28 — 🎛 Adjust settings: the ASR rule modes of the new set (dedicated button, own pane)",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10657
  ],
  "risk": "medium",
  "what": "MdeAsr (js/mdeasr.js, DOM-free): matrix(model) — one row per EndpointSec.ASR_RULES rule and new-set settings-catalog policy carrying it (generation new, or a new-prefix name under ⚙️ Leave out; never an out-prefix or TO-BE-REMOVED name), with now, T15's baseline (Defender.MDE_BASELINE.asr), editable only when the per-rule child exists; modesFor (no warn for LSASS / Office code injection); findRule/withModes on both parent shapes, never mutating the read; putBody (name, description, platforms, technologies, scope tags, templateReference.templateId, every setting typed, ids and expansions stripped); planOf, verified, reverse. Screen: #mrAsr header button and 🎛 rail node → asrPane (filters, selects, Set shown to baseline, sticky bar), asrDryRun (fresh GET policy + settings, drifted modes left out), renderAsrPlan (backup / tick / apply gates, stop at first failure), asrApply (re-read, lastModified + mode drift check, Graph.put whole policy, read-back verify, model raw patched, run kind 'settings'), undo via 📜. Graph.put; demo PUT route for configurationPolicies/{id}.",
  "why": "Mihai, off T15's MDE baseline ASR table (15 conflicts, WIN-SEC block where the baseline expects audit): 'for t28, make an option to adjust the settings of these policies. make it a dedicated button'. Mockup t28-adjust-settings-mockups.html, option B; ASR modes only for the first build.",
  "test": [
    "Run npm test: all 18 suites pass (mderollout/asr 28 new, mderollout/screen 275, +15; platformbaseline/screen's ?v= count moves to 53 for the new script tag).",
    "On PVM: T28 → ↻ Read the tenant → 🎛 Adjust settings → ≠ Baseline → change one WIN-SEC rule (e.g. D-16 drivers Block → Audit) → ② Dry run → ③ backup → tick → ④ Apply. Check the policy in Intune (Endpoint security → ASR) shows Audit and its other settings/assignments are unchanged. Then 📜 → Undo → apply, and check it is Block again."
  ],
  "files": [
    "js/mdeasr.js",
    "js/mderollout.js",
    "js/graph.js",
    "js/demo.js",
    "css/app.css",
    "tests/mderollout/asr.test.js",
    "tests/mderollout/screen.test.js",
    "tests/platformbaseline/screen.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10657.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 218,
  "title": "T28 — 🧪 a pilot migrated into the wave when its country goes live (NL-Breda with NL)",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10656
  ],
  "risk": "medium",
  "what": "MdeMembers: cfg.members.migrated; compute gives a pilot row parentKey/parentCountry (the non-pilot row whose user group its name extends), migrated, outsideParent. planOps: a migrated row is skipped; for each picked country whose user group is (or in this plan becomes) nested, each batched, unmigrated pilot inside it gets migration steps — remove its direct wave users, unnest its user group if nested, unnest its device group once the country's device group is in the device wave — with needsOk on the country's user nest / device add+nest; plan.migrate. Not migrated when a pilot user is outside the country. Screen: applyMem marks migrated (out of batched) once every step verified, runs carry migrate, the undo plan carries unmigrate and restores batched; country row chips; batch panel 🧪 Migrate to the wave with <country> (migrateDryRun) or a migrated panel.",
  "why": "Mihai: 'the nl-breda user should be excluded when nl goes live, or better there should be a migrate to wave for the pilot user be in place'. Mockup t28-breda-nl-golive-mockup.html, option B.",
  "test": [
    "Run npm test: all 17 suites pass (mderollout/members 118, mderollout/screen 260).",
    "On PVM: 👥 → Euro → tick Netherlands → ② Dry run — the plan shows NL's steps, then 🧪 NL Breda migrate steps, and warns how many Breda users come in at once. Or open NL Breda → 🧪 Migrate to the wave with Netherlands."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "css/app.css",
    "tests/mderollout/members.test.js",
    "tests/mderollout/screen.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10656.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 217,
  "title": "T28 — 👥 a device with no primary user: its Entra owner's country, else the ISO3 its name starts with",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10655
  ],
  "risk": "medium",
  "what": "MdeMembers.readInput reads /devices/{id}/registeredOwners/microsoft.graph.user (id, UPN, usageLocation) for every Windows device with no Intune primary user and an Entra object (input.owners). compute: primary user → owner in a country group (the device joins byUser under the owner, via 'owner') → owner's usageLocation = a row's ISO2 suffix ('location') → the name's first three letters = a non-pilot row's 3-letter ISO3 ('name'); else left out. nameSays flags a device named for another country; problems.byOwner / byName / nameOther; model.placed; leftOutOf counts owners as having a device and noPrimary only for unplaced devices. CSV column 'Country by' (VIA_TEXT). Screen: detail shows the source, header wording, tile label. Members read asks Graph.SCOPES.directory. Demo: registeredOwners route (device _owner).",
  "why": "Mihai: users listed with no Windows device while Entra and Intune show them a device with no primary user; 'devices mostly always have the ISO3 country code to start' (IND5CD5502ZZQ); 'other match options are where in Entra the location is set'. Mockup t28-device-country-mockup.html, option A.",
  "test": [
    "Run npm test: all 17 suites pass (mderollout/members 109, mderollout/screen 250).",
    "On PVM: 👥 → ↻ Read again — the header says how many devices with no primary user were placed; open India: IND5CD5502ZZQ shows 'by Entra owner Aditya.Karadigudda@…' (or 'by name IND'); 🕳 Left out no longer lists him as a user with no Windows device."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "js/mdereports.js",
    "js/demo.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/screen.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10655.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 216,
  "title": "T28 — 🔎 Defender logons: VDI (AVD) devices named but out of scope",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10654
  ],
  "risk": "low",
  "what": "MdeMembers.logonsFor: a device whose Defender name (or its Intune record's name) matches /vdi/i is kind 'avd', outOfScope, '⊘ AVD (VDI in the name) — out of scope, excluded', sorted after the devices that count. The 🕳 logon column mutes it and says 'only AVD — no device in scope' when that is all a user has; the CSV carries the words. isAvdName exported. Demo: Sam also logs on to cto-vdi-03.",
  "why": "Mihai: 'for the defender findings, devices with vdi in the name should be excluded. named but excluded, because thats avd and out of scope'.",
  "test": [
    "Run npm test: all 17 suites pass (mderollout/members 100, mderollout/screen 250).",
    "On PVM: 👥 → 🕳 Left out → 🔎 Find their logons — AVD hosts show muted as '⊘ AVD … out of scope', after the real devices."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "js/demo.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/screen.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10654.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 215,
  "title": "T28 — the policy bar's Add include with 🌊 Waves only adds; a 🧪 tick for the pilot groups",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10653
  ],
  "risk": "medium",
  "what": "dryRunPolicyWaves no longer follows cfg.pilotGroupsOff (⚔️ / ⚡'s tick, on by default). A bar tick #mrBarPilots ('🧪 also take the pilot groups off'), shown with 🌊 Waves and Add include / Add exclude when pilot groups are configured, OFF by default and not saved, decides. pilotsFor is still asked (with pilots on) so a pilot assignment left on is named under Left out with the tick to use. Changing the tick clears the plan.",
  "why": "Mihai, on a dry run adding the waves to the new OIB Device Security policies that also removed INT-SG-D-Win-Pilot / Pre-Pilot: 'add include, should only add include or there should be an option to also remove the others' — 'this on new policies when adding the waves'. Mockup t28-bar-add-only-mockup.html, option A.",
  "test": [
    "Run npm test: all 17 suites pass (mderollout/screen 249).",
    "On PVM: tick the five Device Security policies, Add include · 🌊 Waves, ② Dry run — only include steps, no REMOVE to type, the pilots named under Left out. Tick 🧪 also take the pilot groups off and dry run again — the pilot removals are back."
  ],
  "files": [
    "js/mderollout.js",
    "index.html",
    "css/app.css",
    "tests/mderollout/screen.test.js",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10653.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 214,
  "title": "T28 — five more OIB Device Security policies in the ⚙️ Also-in target list",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10652
  ],
  "risk": "low",
  "what": "DEFAULTS.alsoInScope gains Win - OIB - SC - Device Security - U - Windows Sandbox - v3.4, - D - Config Refresh - v3.2, - D - User Rights - v3.7, - U - Windows Spotlight and Org Messages - v3.0 and - D - Windows Package Manager - v3.5. normConfig merges them once into a config saved before (alsoInScopeSeed 10652; no double under other dashes or case); the rules save keeps the seed. catOfKey files windowssandbox, _configrefresh_, desktopappinstaller, windowsspotlight and organizationalmessages settings under 🔒 Device security. TOOL_VERSIONS T28 0.19 (10651 had left the number at 0.17).",
  "why": "Mihai: 'add the to be include' — the five names.",
  "test": [
    "Run npm test: all 17 suites pass (mderollout/engine 195).",
    "On PVM: open T28 and read the tenant — the five policies are listed as new with ➕ by name; ⚙️ Naming rules shows them under Also in the target list; any old policy that sets one of their settings shows in ⚔️."
  ],
  "files": [
    "js/mderollout.js",
    "tests/mderollout/engine.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10652.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 213,
  "title": "T28 — ⊘ 📋 exclusions from a list (paste or .csv / .txt; one plan for every line)",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10651
  ],
  "risk": "low",
  "what": "⊘ Exclusions gets a switch, 🔎 One at a time | 📋 A list. A pasted list (lines, commas, semicolons, tabs; Outlook 'Name <address>' unwrapped) or a dropped/picked .csv/.txt (a header row narrows it to one column: device name, else UPN, else e-mail), up to 500 lines. MdeExclude.matchList: a line with @ is a user by UPN or e-mail (userPrincipalName in (…) or mail in (…), 7 + 7 per request), any other a device by exact name in the Intune Windows list (one recent record among several with one name is taken, the stale ones said), then in Entra (displayName in (…), 15 per request; a non-Windows device said). resolveList looks each match up light (direct groups only) and settles doubles: a user's line claims their devices. The table: Line → match, Now, Into the exclusion groups; ticks as one card's defaults; a header box ticks all. planAddMany merges planAdd per group (one add per exclusion group, one removal per country device group); applyMem patches the list after any run. Demo: evalFilter learns `in`, /users filter returns mail, /users/{id}/memberOf takes the group cast and the _users groups.",
  "why": "Mihai: 'Also the exclusion should get a bulk add user and device.' Mockup t28-exclusions-bulk-mockup.html, option A (paste a list).",
  "test": [
    "Run npm test: all 17 suites pass (mderollout/exclude 67, mderollout/screen 243).",
    "On PVM: ⊘ Exclusions → 📋 A list, paste three UPNs and two device names, Look them up; check the Now column against Entra, untick one, ② Dry run, apply, and check the members of both exclusion groups and the country device groups; then undo from 📜."
  ],
  "files": [
    "js/mdeexclude.js",
    "js/mderollout.js",
    "css/app.css",
    "js/demo.js",
    "tests/mderollout/exclude.test.js",
    "tests/mderollout/screen.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10651.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 212,
  "title": "Tests — CI annotations for failing checks; T28 screen suite waits for a read to settle",
  "tools": [
    "TUNO",
    "T28 MDE rollout"
  ],
  "builds": [
    10650
  ],
  "risk": "low",
  "what": "tests/run.js: on GitHub Actions (GITHUB_ACTIONS set) each suite's output is piped through and, for a failed suite, its FAIL:/timeout: lines (or its first Error line) are printed as ::error annotations with the suite as the file, escaped per the workflow-command rules; locally nothing changes (stdio inherit). MdeRolloutTool._state() adds running, busy, enriching; the T28 screen suite's idle() waits for all three after the first read and after each re-read.",
  "why": "TUNO's CI run for 10649 failed ('Process completed with exit code 1', nothing else on the run page) while tuno-beta's CI passed the same commit, and the suites pass locally (also 12x in parallel, 8x on one core, in UTC). The job log needs a signed-in viewer; the annotation does not.",
  "test": [
    "Run npm test: all 17 suites pass. GITHUB_ACTIONS=true npm test: the same, with no annotations. A made-up failing suite under GITHUB_ACTIONS prints '::error file=…::FAIL: …' with % escaped.",
    "On the next push, the CI run is green; if a check ever fails, the run page's annotations name it."
  ],
  "files": [
    "tests/run.js",
    "js/mderollout.js",
    "tests/mderollout/screen.test.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "docs/reviews/T28-beta-10650.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 211,
  "title": "T28 — 🧪 pilot users ready for their wave (per person: out of the pilot, devices into their country group)",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10649
  ],
  "risk": "medium",
  "what": "MdeMembers.pilotsOf also returns people (pilotPeople: per pilot user or pilot device's primary user, every Windows device with its pilot groups, held/noEntra/inGroup, the country row, state ready/none) and loose members. planPilotsReady: create the missing country device group, add the devices, remove each device from its device pilot with needsOk on its country's add, remove the users from the user pilots; a held device leaves the pilot but is not added. applyOps: needsOk skips a step whose dependency did not go through clean. Screen: the Pilots view per person with device sub-rows, tiles (people, ready, no country, loose), the policy gaps as a before-the-wave warning, ticks for ready people, the bar with the preview counts, the plan note on the old policies until the wave. The 10647 in-wave gate (pilotFresh, planPilotsOut, the apply-time re-check) is removed.",
  "why": "Mihai: 'select the user, and it then should be removed from the pilot groups and the device should be moved to the right group. The user is then ready for the wave' (option A: back to their country, wait for the wave).",
  "test": [
    "Run npm test. mderollout/members (98) covers the people (pilot users and pilot devices' primary users, every Windows device), ready/none/loose, the plan (adds only where needed, create first, device removals after the adds with needsOk per country, users last, the no-country person skipped), and applyOps needsOk both ways. mderollout/screen (220) covers the German pilot user with their laptop, the view, the warning not blocking, the bar, the dry run order, the plan note, the plan hidden on another pane, apply (laptop in INT-SG-D-DEU, out of both pilots, person gone) and undo.",
    "Browser DEMO (pilot groups injected): 🧪 Pilots shows the person with their device, '− out of the pilot' and '+ into INT-SG-D-DEU (created first)'; the plan is create, add, remove devices, remove users.",
    "LIVE PENDING (PVM): 👥 → Read again → 🧪 Pilots. Tick ONE person, dry run, read the plan (their device goes to their country's INT-SG-D group), apply. Check in Entra that the user left INT-SG-U-Win-Pilot and the device is in its country group and out of INT-SG-D-Win-Pilot."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10649.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 210,
  "title": "T28 — 🔎 find where users with no device log on (Defender advanced hunting); new scope ThreatHunting.Read.All",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10648
  ],
  "risk": "medium",
  "what": "Graph.SCOPES.hunting = ThreatHunting.Read.All (R18: graph.js, New-TunoAppRegistration.ps1, SECURITY.md). MdeMembers: country users read with onPremisesSecurityIdentifier/onPremisesSamAccountName; leftOut users carry sid/sam; logonKql (escaped dynamic lists, DeviceLogonEvents 30 days, successful interactive/RDP/cached/unlock, join DeviceInfo for AadDeviceId), readLogons (POST /security/runHuntingQuery per 200 users, Timespan P30D), logonsFor (per user, devices merged across SID and name matches, newest first, each classified intune/entra/defender with the primary user's country and wave), leftOutCsv's extra column. Screen: the lookup and copy-KQL buttons over the Left out users list, the column once looked up, a refusal naming the scope and role. Demo: /security/runHuntingQuery answers from a small made-up logon history.",
  "why": "Mihai: 'if a user has no device in Entra and Intune, try to search in Defender or somewhere else on which device the user has logged in' (option A, read-only).",
  "test": [
    "Run npm test. mderollout/members (92) covers the KQL (SIDs, names, escaping, filters), the per-device merge and order, and each kind (in Intune in the wave, in Intune with no primary user, Entra only, Defender only, none). mderollout/screen (220) covers the buttons, one query for the users in view, the column and its meanings, the CSV, the KQL saved as a file with no clipboard, the refusal text, and the scope declared in the three places.",
    "Browser DEMO: 👥 → 🕳 Left out → France → 🔎: ws-fin-0142 (in Intune, Eva, Netherlands, in the wave) and lab-pc-07 (Defender only).",
    "LIVE PENDING (PVM): an admin grants ThreatHunting.Read.All. Then 🕳 Left out → a country → 🔎. Compare two users with Defender's own advanced hunting (⧉ Copy the KQL)."
  ],
  "files": [
    "js/graph.js",
    "New-TunoAppRegistration.ps1",
    "SECURITY.md",
    "js/mdemembers.js",
    "js/mderollout.js",
    "js/demo.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10648.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 209,
  "title": "T28 — 🧪 pilot members into their wave; a plan belongs to its pane",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10647
  ],
  "risk": "medium",
  "what": "MdeMembers.readInput reads the direct users, devices and nested groups of cfg.pilotGroups (input.pilots, pilotsMissing). pilotsOf(input, rows): each member with its wave (device by Intune primary user's country row: in when its country device group holds it and is nested; user: in through the nested country group or a direct wave membership) and state in / wait / none with why. planPilotsOut: removes only, one op per pilot group and kind, objs for undo; patchInput moves the pilot lists. Screen: 🧪 Pilots chip and view in 👥 (tiles, policy check, ✓-only ticks, bar), pilotBlocks (new policy includes the pilot but not the wave; old policy excludes the pilot but not the wave or twin), pilotFresh (transitiveMemberOf) at dry run and again at apply. planPane: seatPlan hides the plan on other panes.",
  "why": "Mihai: 'an option to identify the pilot users and devices to a wave and an option to remove them from the pilot and be sure that they are then in their wave' (option A, block that wave); 'fix the layout when going to help, the plan below shouldn't be there'.",
  "test": [
    "Run npm test. mderollout/members (86) covers each standing (in through the device group, waiting for Apply, no device group, no primary user, nested group, users in / not nested / outside the table), the missing group, the remove-only plan with its skipped reason, and patchInput both ways. mderollout/screen (213) covers the pilot read, the standing per member, the policy check blocking and clearing, the plan under the bar, the plan hidden on another pane and back, apply and read-back, and undo.",
    "Browser DEMO (pilot groups injected): 👥 → 🧪 Pilots shows the tiles, the ⛔ policy check and one tickable member; the dry run removes it; ❓ How it works hides the plan.",
    "LIVE PENDING (PVM): 👥 → Read again → 🧪 Pilots. Check a few members' waves against Entra. Dry run one member that is ✓, and read the plan before applying."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10647.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 208,
  "title": "T28 — fixes bar without the group box; 🧪 pilots off both sides; 🌊 Waves in the policy bar; Left out counts Windows devices",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10646
  ],
  "risk": "medium",
  "what": "Fixes mode hides #mrGroup and no longer reads it (the override replaced every proposal and dropped the includes); #mrBarFixes = fixSummary(). fixWants() shared by the summary and dryRunFixes. Engine: DEFAULTS.pilotGroups (4 names), cfg.pilotGroups/pilotGroupsOff; pilotRemovals(ctx, pairs, planned, scope) with the both-sides fixpoint; pilotsFor(wants, ctx, wide). wavesProposal carries .pilots (a pilot-only fix is a fix); rolloutWants ① and ③ add the pilot removals (wide). Bar target 🌊 Waves: dryRunPolicyWaves (each policy's kind, ticked regions, pilots wide on include/exclude). The pilot tick in ⚔️ and ⚡; the list under ⚙️ (Save keeps fixWith). leftCounts total = Windows devices only; the users list shows the wave standing and the next-sync note.",
  "why": "Mihai: 'why is not everything excluded as stated in the first screen?'; 'when adding the wave groups to new policies remove the pilot groups' (option A, ⚔️ and ⚡①); 'this should have the option to add or exclude the waves beside a single group'; Left out 'keep the list, don't count it', 'the users still need to be in the right groups', 'if they get a Windows device later it should be added'.",
  "test": [
    "Run npm test. mderollout/engine (192) covers the pilot defaults, both sides in a waves fix, a region unticked, the tick off, the fixpoint (a colliding new policy on the pilot), a pilot-only fix, ⚡① wide with and without the waves out of the old policy. mderollout/screen (198) covers the Left out count, the users' standing, the pilots in the AV fix (proposal, bar summary, dry run both sides, a leftover group in the box ignored), the tick off and on, and 🌊 Waves in the policy bar.",
    "Browser DEMO (a pilot group added to both AV policies): ⚔️ shows − remove include / − remove exclusion; the bar says '🧪 2 pilot assignments off'; the plan removes it from both. 🎯 → 🌊 Waves hides the group box.",
    "LIVE PENDING (PVM): the LAPS fix with every region ticked and an empty group box. The plan should exclude the five device waves from the old LAPS policy, include them in the new one, and take INT-SG-D-Win-Pilot / Win-Pre-Pilot off the old policy's exclusions. Dry run only first."
  ],
  "files": [
    "js/mderollout.js",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/engine.test.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10646.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 207,
  "title": "T01 — read custom-profile values on beta (v1.0 masks them)",
  "tools": [
    "T01 AppLocker builder & validator"
  ],
  "builds": [
    10645
  ],
  "risk": "low",
  "what": "Graph.customProfiles reads /beta/deviceManagement/deviceConfigurations, paged via readAll (was one v1.0 page, $top=999). New Graph.profileUrl(id) = the beta single-profile URL, used by the hydrate re-read, getOmaSettingPlainTextValue and T01's readAuditTarget (Audit-update compare and read-back). The PATCH and createProfile still go to v1.0, unchanged.",
  "why": "The 10641 diagnostic for both R27.1 profiles showed masked \"****\", isEncrypted false and no secret reference, even on the single-profile re-read. The T04 export of the same two profiles (a beta read) had isEncrypted true and the full RuleCollection XML. v1.0's omaSetting has no isEncrypted or secretReferenceValueId, so a v1.0 read cannot fetch the value at all.",
  "test": [
    "Run npm test. The audit-workflow suite checks that the re-read, the profile URL helper, the paged list and the plain-text call use beta, and that the Audit-update read-back does too.",
    "LIVE PENDING: T01, Analyze deployed, open the R27.1 AuditOnly profile and then the Enforced one. All four collections should open with their rules. Then Load the deployed AppLocker profile from the evidence card and do one deploy collision check (both use the same list)."
  ],
  "files": [
    "js/graph.js",
    "js/applocker.js",
    "tests/applocker/audit-workflow.test.js",
    "docs/reviews/T01-beta-10645.md",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "index.html",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 206,
  "title": "T28 — opening the tool offers the read instead of starting it",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10644
  ],
  "risk": "low",
  "what": "onShow no longer calls run(true) when PolicyCache holds or is reading the sign-in read. offerRead() renders a card in #mrBody: 'Nothing is read yet', what a read takes, that it changes nothing, ↻ Read the tenant (data-mrread=fresh → run(false)) and, with the sign-in read held, 'Use the sign-in read from HH:MM' (data-mrread=attach → run(true)); while it is still reading, 'Wait for the sign-in read'. run(true) removes the card. ❓ How it works says so. Fixed: the ⊘ header button showed while hidden (.btn display beat [hidden]); .mr-exbtn[hidden]{display:none}.",
  "why": "Mihai: 'clicking the tool should offer to read the tenant, and not start automatic'.",
  "test": [
    "Run npm test. mderollout/screen (186) covers: opening reads nothing (no refresh, no read, no model); the card with both buttons and the read's time; the ⊘ button hidden; opening again still only offers; the sign-in read used without a fresh read; the card gone and the read kept on re-open; cold (only ↻) and still-reading (wait) cards; ↻ in the card reads fresh.",
    "Browser DEMO: sign in, open 🚀 MDE rollout. The card shows, the ⊘ button does not, and nothing loads until a button is clicked.",
    "LIVE (PVM): open T28 after sign-in. Nothing reads until clicked; 'Use the sign-in read' shows the rail at once."
  ],
  "files": [
    "js/mderollout.js",
    "css/app.css",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10644.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 205,
  "title": "T28 — ⚔️ fix conflicts with the waves (include in the same plan); floating 👥/⊘ bars",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10643
  ],
  "risk": "medium",
  "what": "cfg.fixWith (waves by default, or groups). proposalFor in waves mode (wavesProposal): the waves of the new policy's kind in the ticked regions, out of the old policy, through the same support matrix, twin swap and include-to-remove rule (stepFor). Waves the new policy lacks become includes, and dryRunFixes composes them on the new policy in the same plan. rest names the new policy's other groups. rolloutWants ③ skips steps that need the include. The region chips re-derive the proposals. Screen: the switch, the proposal's two lists and the intro text. The sticky 👥/⊘ bars now float because their card allows overflow (.mr-stickyhost).",
  "why": "Mihai: 'conflict with old: offer to add the wave groups to the old policies' (option A, include in the same plan); 'make floating, so no scrolling needed to the bottom'.",
  "test": [
    "Run npm test. mderollout/engine (184) covers waves mode (the device waves only, the include step, the named rest, regions, in place, groups mode unchanged, the default) and ③ skipping a wave the new policy lacks. mderollout/screen (176) covers the switch, a two-sided dry run (the wave out of the old Edge policy and into the new one), switching back and forth.",
    "Browser DEMO: ⚔️ shows the switch and '+ include' under the staged Edge fix. In 👥, the bar floats at the bottom of a short window.",
    "LIVE PENDING (PVM): in ⚔️, with the waves, check a Windows LAPS / Defender AV conflict. The fix should exclude INT-SG-D-WAVE-* from the old policy and include the missing waves in the new one, not AVD-Pre-Pilot / WIN365-PROD. Dry run only first."
  ],
  "files": [
    "js/mderollout.js",
    "css/app.css",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/engine.test.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10643.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 204,
  "title": "T28 — 🕳 who gets left out; 78 policies left out by default with ➕ include",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10642
  ],
  "risk": "low",
  "what": "MdeMembers reads the Intune devices of every platform once (Windows is the subset used for the waves). compute adds leftOut: the country groups' users with no Windows device and the platforms they do have; Windows devices whose primary user is in no country group; devices with no primary user; a country's devices with no Entra object or in the exclusion group. leftOutCsv. Screen: a 🕳 Left out toolbar chip and view (tiles by reason, chips by country, row and header links, CSV). MdeRollout: DEFAULTS.leaveOut holds 78 names with leaveOutSeed 10642, so a config saved at 10639–10640 gets them merged in once. ➕ include in 🚫 takes a name off the list. A scope change re-reads group kinds.",
  "why": "Mihai: 'I need a way to know who is getting left out' (layout A off the mockup); 'the policies below should be default excluded with the option to include if needed'; Ring 3 Production 'also exclude'.",
  "test": [
    "Run npm test. mderollout/members (76) covers the left-out lists and CSV. mderollout/exclude (41) covers the default list, the migration and the include. mderollout/screen (172) covers ASR left out by default → ➕ include → back in scope, then the Left out view (Sam with only a Mac, svc-legacyapp in no country, two devices with no primary user, the tile filter, the CSV).",
    "Browser DEMO: 🚫 shows the ASR policy with ➕ include. In 👥 → 🕳 Left out, check the tiles and lists at 1440 px light and dark, and 390 px.",
    "LIVE PENDING (PVM): check the 78 names are out under 🚫 (names typed differently in Intune still match: dashes, spaces and case fold). In 👥, NL's '728 users have none' should open the list; spot-check a few users' devices in Intune."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "css/app.css",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/exclude.test.js",
    "tests/mderollout/engine.test.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10642.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 203,
  "title": "T01 — masked OMA-URI values (****) are fetched, not parsed",
  "tools": [
    "T01 AppLocker builder & validator",
    "T04 Backup"
  ],
  "builds": [
    10641
  ],
  "risk": "low",
  "what": "Graph.hydrateOmaSettings treats a value made only of asterisks as masked regardless of isEncrypted: single-profile re-read for the secret reference, then getOmaSettingPlainTextValue. A mask with no reference is a named read error. The T01 reader refuses \"****\" with a mask message instead of \"not valid XML\"; read diagnostic schema 2 adds masked, hasSecretReference (boolean only) and readError. Backup includes masked settings in its hydration filter.",
  "why": "Mihai's read diagnostic from build 10638: all four collections of the enforced R27.1 profile came back as \"****\" with isEncrypted false, so the reader never fetched the plain text and parsed the mask. The profile in the tenant was fine.",
  "test": [
    "Run npm test. The audit-workflow suite covers masked-with-reference (re-read once, one plaintext read per collection, profile opens) and masked-without-reference (mask message, no plaintext call, diagnostic schema 2 fields).",
    "LIVE PENDING: open the enforced R27.1 profile in T01 (Analyze deployed). Expect the four collections to open. If it still fails, the diagnostic now says whether Graph gave a secret reference — send it."
  ],
  "files": [
    "js/graph.js",
    "js/applocker.js",
    "js/backup.js",
    "tests/applocker/audit-workflow.test.js",
    "docs/reviews/T01-beta-10641.md",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "index.html",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 202,
  "title": "T28 — the pilot in four batches (users straight into the waves, the device group follows)",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10640
  ],
  "risk": "medium",
  "what": "MdeMembers: batched pilots (cfg batched, batchCount 4). readInput reads each wave's direct users. batchOf splits the pilot's users (minus those in the wave through another nested group) into even parts sorted by UPN; the next batch tops up the first part not yet full from whoever is left. While batching, the device group wants only the devices of users in the wave, and planOps never nests the user group. planBatch: users into the user wave, then create, fill and nest the device group. planFinish: nest the pilot group, then remove the direct users (typed). patchInput updates the wave's direct users; batchCsv. Screen: the batch panel on the opened pilot row (progress, parts, next dry run with the plan under the panel, CSV, finish, a toggle per pilot). showPlan clears the pane's sticky toolbar.",
  "why": "Mihai: 'an option to split the adding of the pilot group in 4 even batches of users and devices' — option A off the mockup (straight into the waves).",
  "test": [
    "Run npm test; mderollout/members (71) covers the split (even sizes), users in through NL left out, the device group following its users, the batch plan, the regular sync not nesting, a user leaving between batches, all in → no next batch, finish (nest, then typed removal), finished → every device wanted, the CSV, and patchInput on direct users. mderollout/screen (161) covers batch 1 in demo, down to the tenant: Alex a direct member of the user wave, INT-SG-D-NLD-BREDA created with his laptop and nested; the panel moving on; the toggle.",
    "Browser DEMO: the demo's Breda group has one user, who is in through NL, so the panel says nothing is left to batch. The screen test gives it four more users to show batches.",
    "LIVE PENDING (PVM): open NL-Breda in 👥 and check the batch sizes against the group's users. Run batch 1, check the users and devices in Entra and that the policies arrive, then run the next batches. After the last one, Finish."
  ],
  "files": [
    "js/mdemembers.js",
    "js/mderollout.js",
    "css/app.css",
    "index.html",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10640.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 201,
  "title": "T28 — ⊘ exclusions (search a user or device, both exclusion groups), Leave-out list, plans under their button",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10639
  ],
  "risk": "medium",
  "what": "New js/mdeexclude.js (DOM-free): the exclusion groups' members plus every Windows device in Intune; search (Graph $search on users and Entra devices with ConsistencyLevel eventual, plus a local match on the Intune list); lookup (the user's devices or the device's primary user, each device's Entra object, transitive and direct groups); what reaches each object before and after; plans for adding (users → U group, devices → D group, then out of their country device group) and for removing (typed REMOVE); pairs for Excluded now, with half-excluded users. The screen adds a header button and a ⊘ rail pane (layout A off the mockup). Runs go through MdeMembers.applyOps (read-back by member kind) and 📜 undo. MdeMembers holds excluded devices out of the country device groups. ⚙️ Leave out: exact names forced out of scope. The plan panel is seated under the card that made it (option A off the mockup).",
  "why": "Mihai: 'a new exclusion button — easy to search a user or device, get both info, and get offered to be added to the 2 exclusion groups'; 'also add a same for excluding a policy'; 'the layout in wave groups needs a change — when selecting dry run it appears at the bottom, not visible'.",
  "test": [
    "Run npm test; the new mderollout/exclude suite (38) covers the pairs, search, lookup, ticks, reach before and after (falls between versus kept on the old set), plans, patching and the 👥 hold. The screen suite (149) covers the header button, the pane, search by Enter, the card, the dry run under the card, apply, the demo tenant state, undo, taking a row out, Leave-out, and the rollout plan under its card.",
    "Browser DEMO: read, ⊘, search 'eva', pick, check the card and reach, dry run (the device side needs the device exclusion group, created in 🌊 first), apply, undo from 📜. In 🌊, ① dry run opens under the rollout card. Check 1440 px light and dark, and 390 px.",
    "LIVE PENDING (PVM): search a real user and device; check what the card says reaches them against Intune's per-device view. Exclude one test device and check that it leaves INT-SG-D-<ISO3> and that the old AV policy applies again. Undo."
  ],
  "files": [
    "js/mdeexclude.js",
    "js/mderollout.js",
    "js/mdemembers.js",
    "js/mdereports.js",
    "js/demo.js",
    "index.html",
    "css/app.css",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/exclude.test.js",
    "tests/mderollout/screen.test.js",
    "tests/mderollout/engine.test.js",
    "tests/mderollout/members.test.js",
    "tests/mderollout/reports.test.js",
    "tests/platformbaseline/screen.test.js",
    "docs/reviews/T28-beta-10639.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 200,
  "title": "T28 — back on the rail; the three reports as rail nodes (option A)",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10638
  ],
  "risk": "low",
  "what": "Restores the T28 rail (10632 layout B) in place of 10637's top tabs, and keeps 10637's report workspace, compact header and Export menus. 📑 Reports has three child nodes in the rail, each with its state (not generated / generated HH:MM / regenerate / N to act); the report preview takes the main column. The second report column is removed. The main column stretches when the rail stacks under 900px, and coverage headers wrap between words. Report nodes work from the keyboard. No optional chaining. The tile chip is NEW again.",
  "why": "Mihai on 10637: 'the other layout was better, but only the reports layout needed adjustment' — option A off the layout-review mockup.",
  "test": [
    "Run npm test; the T28 screen suite checks the rail's report nodes, their order under 📑 Reports, the counts on every pane, keyboard opening, the 'N to act' and 'regenerate' states, and the existing report, write and undo gates.",
    "Browser DEMO: read, generate each report from its rail node, then run a conflict check and see Assignments turn 'regenerate'. Check 1440px light and dark, and 390px (no sideways page scroll; wide tables scroll in their own region).",
    "LIVE PENDING: none new — the layout change reads and writes nothing."
  ],
  "files": [
    "index.html",
    "css/app.css",
    "js/mderollout.js",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10638.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 199,
  "title": "T28 — report workspace (option 2)",
  "tools": [
    "T28 MDE rollout"
  ],
  "builds": [
    10637
  ],
  "risk": "low",
  "what": "Grouped T28 navigation, compact header, persistent report selector, one preview of the saved HTML report with folding sections and contained tables, consolidated export controls, snapshot timestamps and stale/incomplete-read notices. Existing assignment/group actions and export generators remain in use. Fresh conflict read failure retains the old report and check count.",
  "why": "Build the selected report-workspace mockup so generating one report no longer pushes the others down the page.",
  "test": [
    "Run npm test; T28 screen checks cover selector/preview switching, snapshot retention, stale timestamps, failed fresh reads and the existing write/undo gates.",
    "Browser DEMO: generate all three reports, expand evidence, switch repeatedly, open/export the selected report, and visit every grouped T28 pane. Check desktop and narrow layouts in light/dark themes.",
    "LIVE PENDING: verify actual tenant report completeness, owners/members, filters and export content. No live tenant reads or writes performed for this layout change."
  ],
  "files": [
    "index.html",
    "css/app.css",
    "js/mderollout.js",
    "js/mdereports.js",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "tests/mderollout/screen.test.js",
    "docs/reviews/T28-beta-10637.md",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 198,
  "title": "T28 — exclusion groups renamed to INT-SG-D-MDE-Exclusion / INT-SG-U-MDE-Exclusion",
  "tools": [
   "T28 MDE rollout"
  ],
  "builds": [
   10636
  ],
  "risk": "low",
  "what": "DEFAULTS.exclusionDevice/exclusionUser → INT-SG-D-MDE-Exclusion / INT-SG-U-MDE-Exclusion; renameExclusionFrom (the old defaults + any exclusion name changed under ⚙️) gives each exclusion group its oldNames, so cfg.lookup asks for them and waves() marks legacy — the 🌊 rename box (10635) renames them with the waves. normConfig moves a saved config off the old default names. MdeMembers.readInput takes a skip set (every rollout group name) so the INT-SG-D- device-group read never counts a rollout group as a country group. Demo: PVM-UG-MDE-Exclusion under its old name.",
  "why": "Mihai: 'PVM-DG-MDE-Exclusion and PVM-UG-MDE-Exclusion should be INT-SG-D-MDE-Exclusion and INT-SG-U-MDE-Exclusion'.",
  "test": [
   "Run npm test — tests/mderollout/engine.test.js (the names, the migration, legacy detection) and tests/mderollout/screen.test.js (the demo's old-named user exclusion group renamed with the Americas device wave, read back on the same ids, renamed back from 📜).",
   "LIVE PENDING: PVM — if the PVM-*-MDE-Exclusion groups were created, 🌊 shows them as 'old name'; rename; Entra shows the new names on the same ids."
  ],
  "files": [
   "js/mderollout.js",
   "js/mdemembers.js",
   "js/demo.js",
   "index.html",
   "js/version.js",
   "js/changelog.js",
   "js/promote.js",
   "tests/mderollout/engine.test.js",
   "tests/mderollout/screen.test.js",
   "tests/mderollout/members.test.js",
   "tests/mderollout/reports.test.js",
   "docs/reviews/T28-beta-10636.md",
   "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 197,
  "title": "T28 — reports (assignments, deployment configuration, conflict check) + pilot groups (NL-Breda) + waves renamed to INT-SG-D/U-WAVE",
  "tools": [
   "T28 MDE rollout"
  ],
  "builds": [
   10635
  ],
  "risk": "low",
  "what": "New js/mdereports.js (MdeReports): roleIndex (wave / exclusion / country / device group), assignmentRows, coverage (per policy × region: wave included or excluded, exclusion group, tenant-wide, unassigned), assignmentsCsv/Html, settingsRows (names and values through the definitions), configCsv/Html (rules, groups with owners, wave members, new policies' settings and assignments, old policies' retirement, out of scope, the session's runs), conflictSummary/conflictDiff/conflictsHtml, readOwners, page (a self-contained, printable HTML page; every value escaped). Screen: 📑 Reports rail node and pane — run, open in a tab, ⭳ HTML, ⭳ CSV; the conflict check runs the full fresh read (run(false)) and keeps each check for the session. MdeMembers: pilots (default NL-Breda, first in Euro, device group INT-SG-D-NLD-BREDA), a star marks a pilot in the country table, pilot overlaps are expected (problems.pilot, not multi), suggestDeviceSuffix, addPilot; the Not-in-any-wave list gets 🧪 Add as pilot with a wave select. Wave names: defaults INT-SG-D-WAVE- / INT-SG-U-WAVE-; normConfig moves a saved config off the old default prefixes, keeps renameFrom (the old defaults + any prefix changed under ⚙️), groupsOf gives each wave its oldNames, cfg.lookup asks for both; waves() marks legacy (only the old name exists) and legacyToo; renameGroup (name free check, PATCH displayName + mailNickname, retry without the nickname when that is refused, read back); the 🌊 pane's rename box with its own confirm tick; 📜 renames back. kindFromName reads a U / D segment. MdeMembers skips the -WAVE- groups in the INT-SG-D- device-group read. Country table: SK (Euro), KZ and LAGOS (BAMSCA; LAGOS = NGA-LAGOS) added at Mihai's request. Demo: the Euro waves renamed, PVM-DG-MDE-WAVE-Americas left under its old name for the rename.",
  "why": "Mihai: a report of the assignments, a report of everything configured for this deployment, a run option to see if there are conflicts; NL-Breda as the first pilot group in wave 1; and 'the wave groups are named wrong — INT-SG-D-WAVE-Euro or INT-SG-U-WAVE-Euro; rename them in the solution and the tenant'.",
  "test": [
   "Run npm test — tests/mderollout/reports.test.js (roles, coverage, CSVs, the sections, escaping, the conflict diff), tests/mderollout/members.test.js (pilot defaults, star, addPilot, the expected overlap), tests/mderollout/screen.test.js (the three reports in demo, a second conflict check says what moved, Add as pilot).",
   "LIVE PENDING: PVM — run the three reports; open each in a tab; the configuration report lists the wave groups' owners and every new policy's settings with readable names.",
   "LIVE PENDING: PVM — 🌊 shows the existing PVM-*-MDE-WAVE-* groups as 'old name'; rename them; Entra shows the new names on the same object ids and the policies' assignments show the new names.",
   "LIVE PENDING: 👥 Euro — NL-Breda first as 🧪 pilot; create INT-SG-D-NLD-BREDA, fill, nest in both Euro waves; the conflict check afterwards."
  ],
  "files": [
   "js/mdereports.js",
   "js/mdemembers.js",
   "js/mderollout.js",
   "css/app.css",
   "index.html",
   "js/version.js",
   "js/changelog.js",
   "js/promote.js",
   "tests/mderollout/reports.test.js",
   "tests/mderollout/members.test.js",
   "tests/mderollout/engine.test.js",
   "tests/mderollout/screen.test.js",
   "tests/platformbaseline/screen.test.js",
   "docs/reviews/T28-beta-10635.md",
   "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 196,
  "title": "T28 — wave members (country groups and INT-SG-D device groups into the waves) + named policies in the target list",
  "tools": [
   "T28 MDE rollout"
  ],
  "builds": [
   10634
  ],
  "risk": "medium",
  "what": "New js/mdemembers.js (MdeMembers engine): country table config (countryPrefix, deviceGroupPrefix, countryMap per region, deviceSuffixes overrides, ISO 3166 alpha-2 → alpha-3 table), readInput (prefix groups, transitive users per mapped group, Windows managedDevices, Entra Windows devices with ConsistencyLevel eventual, INT-SG-D-* groups and their device members, wave group members), compute (devices by Intune primary user joined on azureADDeviceId → Entra object id; stale / no Entra object / in two countries; sync diff add/remove; nesting state; unmapped + overlaps; no-primary-user count), planOps (create → add → remove → nest, skips with reasons, >500 nest warning), inverseOf (undo), applyOps (createWave with owner, PATCH members@odata.bind 20 per request with replication retry and per-id fallback, DELETE $ref, nest/unnest by $ref, read-back), patchInput, csv. Screen: 👥 Wave members rail pane (layout A off the mockup) — region chips, wave meters, per-country rows with device detail, the action bar with create&fill / nest users / nest devices / apply removals, a members plan (tick or typed REMOVE) on the run ledger, undo from 📜. Rules pane: country prefix, device-group prefix, countries per region, suffix overrides. MdeRollout config: members sub-config; alsoInScope (five OIB names) — named settings-catalog policies are in scope, and old catalog policies sharing a setting with the new set are pulled in; categories hard (Device security) and upd (Updates & telemetry). Demo: country groups NL (dynamic, nested in the Euro user wave), DE, US, FR, PL, NL-Breda; INT-SG-D-NLD out of sync and nested in the Euro device wave; typed member reads and member writes (PATCH bind, $ref add/remove); P(27) named audit policy and P(28) old audit policy.",
  "why": "Mihai: the country user groups (PVM-UG-CORP-MEM-USERS-*) go into the wave groups by nesting; per user group a device group INT-SG-D-<iso3> with the users' devices (as Compare-UserDeviceCountryGroups.ps1 finds them, Intune primary user), offered per wave. The extensionAttribute-based device groups missed 2,561 devices and held 2,933 wrong ones on 29-09. And: add the OIB Device Security and WUfB policies to the target list.",
  "test": [
   "Run npm test — tests/mderollout/members.test.js (table and naming incl. POL-WAW / ARE, compute, sync diff, plan order and skips, undo, 20-per-PATCH, per-id fallback, replication retry, applyOps with a refused create) and tests/mderollout/screen.test.js (the pane end to end in demo: read, NL out of sync, DE create → fill → nest → verify, undo from 📜, removals behind REMOVE, Americas without a device wave, the unmapped list; named policy in scope and the old audit policy as a conflict).",
   "LIVE PENDING: PVM — 👥 read: country counts match UserDeviceGroupMatch_20260929 (NL 903, DE 145, IT 1,328 devices); the 20 prefix groups outside the table are listed (NL-Breda, IN-UP-Shortcut and IT-SELECTION as overlaps).",
   "LIVE PENDING: tick one small country (e.g. Belgium): INT-SG-D-BEL is created with you as owner, filled, nested in both Euro waves; Entra shows the nesting; undo it.",
   "LIVE PENDING: the five named OIB policies appear under 🎯 New with ➕ by name; old audit / hardening / delivery-optimisation policies show under ⚔️ where they set the same setting."
  ],
  "files": [
   "js/mdemembers.js",
   "js/mderollout.js",
   "js/demo.js",
   "css/app.css",
   "index.html",
   "js/version.js",
   "js/changelog.js",
   "js/promote.js",
   "tests/mderollout/members.test.js",
   "tests/mderollout/engine.test.js",
   "tests/mderollout/screen.test.js",
   "tests/platformbaseline/screen.test.js",
   "docs/reviews/T28-beta-10634.md",
   "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 195,
  "title": "T28 — device/user wave pairs, exclusion groups, rollout actions, creator is owner",
  "tools": [
   "T28 MDE rollout"
  ],
  "builds": [
   10633
  ],
  "risk": "medium",
  "what": "Config: waveRegions + waveDevicePrefix (PVM-DG-MDE-WAVE-) + waveUserPrefix (PVM-UG-MDE-WAVE-) + exclusionDevice/exclusionUser (PVM-DG-/PVM-UG-MDE-Exclusion) + exclusionDescription; normConfig derives groups (role, audience, region, twin) and the flat names list, and migrates a 10632 waves list to regions. audienceOf(name): a one-letter -d-/-u- segment in the normalised name. proposalFor: twin swap when the support matrix refuses a wave (twinIndex), missing twin named, staged pool by audience (wavePool), target kind from the old policy's name when its include kinds are unreadable (effectiveTargets). pairReach/compare take the twin map: excluding the twin resolves. waves(): a row per group with role, audience, fits, misfit, twinId. createWave names the signed-in admin (/me) in owners@odata.bind, reads /owners back, falls back to owners/$ref, retries the create without owners only when the refusal is about the owner. Screen: region-grouped Wave groups pane with the exclusion groups, include/exclude-from-the-rest links by audience, rules fields, include-audience warning in the dry run, audience on every policy row, twin notes on the Conflicts pane. Rollout actions (rolloutWants: includeWaves / excludeExclusion / excludeWaves, policyKind): three bulk plans on the 🌊 pane with region chips, each read fresh and composed through planFor, left-out items listed with reasons; the exclusion group follows the kind the policy is assigned to (support matrix), the name only while unassigned; excludeWaves is the proposals restricted to waves. Demo: G(21) PVM-DG-MDE-WAVE-Euro; the - D - new policies include it; /me, owners, owners/$ref.",
  "why": "Mihai: 'creator is owner'; 'wave groups need to have device groups also — - U - policies are user policies, - D - device; PVM-DG-MDE-WAVE-Euro for devices, PVM-UG-MDE-WAVE-Euro for users'; 'also add PVM-UG-MDE-Exclusion and PVM-DG-MDE-Exclusion'. Microsoft Learn: an admin is not made owner of a security group they create; Intune does not exclude user groups from device-targeted policies (or the reverse).",
  "test": [
   "Run npm test — tests/mderollout/engine.test.js (config pairs and migration, audienceOf, twin swap, missing twin, staged by audience, target kind by name, resolved by twin, wave/exclusion rows, owner bind / $ref fallback / refusal retry, the three rollout actions) and tests/mderollout/screen.test.js (twin on the Conflicts pane, region rows, exclusion group created with its description, owner read back, include-audience warning, rules fields, rollout actions dry run → apply, region chips).",
   "LIVE PENDING: PVM tenant — create PVM-DG-MDE-WAVE-Euro and PVM-DG-MDE-Exclusion; Entra shows you as owner of both.",
   "LIVE PENDING: a - D - new policy on the device wave against a user-targeted old policy proposes the user twin; apply; the pair turns resolved.",
   "LIVE PENDING: rollout actions on PVM — ① includes the DG waves in the - D - policies and the UG waves in the - U - ones; ② excludes the exclusion groups; ③ excludes the waves from the colliding old policies; undo ③ from Changes this session."
  ],
  "files": [
   "js/mderollout.js",
   "js/demo.js",
   "js/version.js",
   "js/changelog.js",
   "js/promote.js",
   "index.html",
   "tests/mderollout/engine.test.js",
   "tests/mderollout/screen.test.js",
   "docs/reviews/T28-beta-10633.md",
   "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 194,
  "title": "T11 engine — legacy endpoint security intents are an assignment surface",
  "tools": [
   "T11 Assignment editor",
   "T22 Group migration"
  ],
  "builds": [
   10632
  ],
  "risk": "medium",
  "what": "AssignEdit.SURFACES gains deviceManagement/intents (appended last: /intents/{id}/assign and /intents/{id}/assignments, section intents, the scope already held). T11 lists, plans and writes legacy endpoint security policies; its warm start maps the cache's intents section onto the surface. T22's references read is the same table, so a group named in a legacy intent is now found and repointed instead of missed. backupOf(changes, head) is the one builder of the backup file; backupJson(plan) is T11's call of it and writes the same keys in the same order. Demo: the intents are in the fixture's object bag so /intents/{id}/assignments answers.",
  "why": "T28's rollout has to exclude wave groups from OLD policies, and in a tenant that has been on Intune for years some of those are pre-catalog intents. T22 missing them was a silent defect: a migrated group stayed named in legacy policies that nothing reported.",
  "test": [
   "Run npm test — tests/mderollout/engine.test.js holds the surface (appended last, paths), backupJson's header and key order, and backupOf.",
   "LIVE PENDING: T11 on a tenant with an assigned legacy intent — the rail lists Endpoint security (legacy); add and remove an exclusion on it; the read-back verifies.",
   "LIVE PENDING: T22 on a group named in a legacy intent — it appears among the repointable references and is repointed."
  ],
  "files": [
   "js/assignedit.js",
   "js/demo.js",
   "js/version.js",
   "js/changelog.js",
   "js/promote.js",
   "index.html",
   "tests/mderollout/engine.test.js"
  ]
},
{
  "n": 193,
  "title": "T28 — MDE rollout (new, temporary)",
  "tools": [
   "T28 MDE rollout"
  ],
  "builds": [
   10632
  ],
  "risk": "medium",
  "what": "New beta-only tool on a rail (layout B off the mockup). Generations by name — new (Win - OIB / WIN-SEC / WIN-DCP), old, (TO-BE-REMOVED), out of scope (AVD / WinServ) — from editable prefix rules kept per tenant in localStorage. Scope from T20's classifier plus any policy setting an MDE-area setting and custom OMA-URIs under those CSPs. Collisions new vs old per settingDefinitionId (ASR per rule through T16's asrRulesOf, the legacy guid=mode string included; OMA-URI 1:1), legacy templates and ADMX by category; reach from T12 plus staged and resolved. Fix proposed: exclude the new policy's include groups from the old one (remove the include where the old one includes it; wave groups when the new one is unassigned), refused when the group kinds mix users and devices (kind from the dynamic rule or the typed member counts). Bulk include / exclude / remove bar and the fix run through AssignEdit.planFor/applyPlan (composed per policy, fresh read at dry run, backup, confirm, drift check, verify, run ledger); undo per run from its backup. Wave groups looked up by exact name and created with T22's payload and scope, re-checked by name before each create and read back. Retirement check per old policy. MD and CSV export. Demo fixtures: a new/old/AVD set, two wave groups, typed $count, POST /groups kept for the session.",
  "why": "Mihai's rollout: the new policies are named Win - OIB, WIN-SEC or WIN-DCP, everything else is old, AVD and WinServ are out of scope — filter them quickly, adjust include/exclude, and find the old policies that conflict with a new one so an exclusion can be added. Temporary: it goes when the rollout is done.",
  "test": [
   "Run npm test — tests/mderollout/engine.test.js (naming, keys, scope, compare, reach, proposals, support matrix, composed plans through applyPlan, undo, retirement, waves, exports) and tests/mderollout/screen.test.js (demo end to end: read, every pane, fix dry run → backup → confirm → apply on the ledger, include/remove plans, wave create and read-back, rules, a second read keeps the plan panel).",
   "LIVE PENDING: PVM tenant — the brief's appendix policies land in New; AVD policies in Out of scope; the Conflicts pane lists the old AV/Edge/ASR policies against the new ones; a user wave's exclusion from a device-targeted old policy is refused with the support-matrix reason.",
   "LIVE PENDING: create one missing wave group; include it in one new policy; exclude it from one user-targeted old policy; undo that run from Changes this session.",
   "LIVE PENDING: setting names and option labels on the Conflicts pane read from the definitions (demo shows the id tails)."
  ],
  "files": [
   "js/mderollout.js",
   "js/app.js",
   "js/demo.js",
   "css/app.css",
   "index.html",
   "js/version.js",
   "js/changelog.js",
   "js/promote.js",
   "tests/mderollout/engine.test.js",
   "tests/mderollout/screen.test.js",
   "docs/reviews/T28-beta-10632.md",
   "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 192,
  "title": "T01 — failed policy read diagnostics",
  "tools": [
    "T01 AppLocker builder & validator"
  ],
  "builds": [
    10631
  ],
  "risk": "low",
  "what": "Explicit local diagnostic download for failed deployed-policy reads. Preserve the exact unparsable setting values and type/read status, omit unrelated profile and secret-reference fields, clear after successful selection.",
  "why": "The supplied StoreApps XML opens locally but the live read still reports invalid XML. Capture the returned value before making further parser changes; no live resolution is claimed.",
  "test": [
    "Run npm test. Reject malformed returned XML without writes; verify diagnostic raw value, metadata, scope, download affordance and clearing after success.",
    "LIVE PENDING: reproduce the failed StoreApps read, download and inspect the diagnostic, compare the returned value with the supplied XML. Do not change the tenant policy based only on this read error."
  ],
  "files": [
    "js/applocker.js",
    "tests/applocker/audit-workflow.test.js",
    "docs/reviews/T01-beta-10631.md",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "index.html",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 191,
  "title": "T01 — fix deployed policy XML loading",
  "tools": [
    "T01 AppLocker builder & validator"
  ],
  "builds": [
    10630
  ],
  "risk": "high",
  "what": "Normalize plain XML, single-collection policy wrappers and Graph XML-file values; force plaintext retrieval for encrypted placeholders. Preserve XML-file setting type and filename on updates. Visible read progress and contextual errors.",
  "why": "10629 rejected non-bare XML with a generic RuleCollection error. Live tenant format and decryption compatibility remain a pilot acceptance check; no policy writes were performed during this fix.",
  "test": [
    "Run npm test. Verify declaration/BOM, wrapped policy, base64 Unicode XML, already-decrypted XML-file values, and non-empty encrypted placeholders through detail plus plaintext reads. Reject ambiguous wrappers and unsupported XML.",
    "LIVE PENDING: open the affected deployed Audit profile. Verify rule count and grouping against Intune, preview a selected change and verify original setting types before any authorized pilot update. Confirm an enforced policy is rejected by its actual collection modes."
  ],
  "files": [
    "js/applocker.js",
    "js/graph.js",
    "tests/applocker/audit-workflow.test.js",
    "docs/reviews/T01-beta-10630.md",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "index.html",
    "scripts/*.ps1 (build stamp only)"
  ]
},
{
  "n": 190,
  "title": "T01 — separate creation and deployed Audit improvement",
  "tools": [
    "T01 AppLocker builder & validator"
  ],
  "builds": [
    10629
  ],
  "risk": "high",
  "what": "Separate session workspaces; execution-based suggestions against a selected deployed Audit policy; explicit selected additions, manual edits and same-ID AuditOnly update with fresh comparison, drift guards, original backup and read-back.",
  "why": "Real Intune PATCH and Windows receipt require pilot validation before production. A scan is evidence, not an instruction to replace the deployed baseline. Updates preserve existing collection URIs including DLL; new DLL scope is refused.",
  "test": [
    "Run npm test, including applocker/audit-workflow.test.js. Confirm workspace drafts and evidence remain separate, selected suggestions alone change the working copy, and drift or tenant changes prevent writes.",
    "LIVE PENDING: select a dedicated deployed Audit profile, download its backup, collect matching device results, add an approved rule, preview and update the same ID. Verify assignments and grouping in Intune; sync and rescan to verify receipt. Restore previous rules in the same profile to prove recovery.",
    "Validate encrypted OMA hydration, service PATCH compatibility and concurrency behavior on the tenant. If no ETag is provided, a fresh read reduces but cannot eliminate the service-side race."
  ],
  "files": [
    "js/applocker.js",
    "index.html",
    "css/app.css",
    "tests/applocker/audit-workflow.test.js",
    "tests/applocker/review.test.js",
    "docs/reviews/T01-beta-10629.md",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js",
    "scripts/*.ps1 (build stamp only)"
  ]
},
    {
  "n": 189,
  "title": "T01 — device review, baseline editing and enforcement scenarios",
  "tools": [
    "T01 AppLocker builder & validator"
  ],
  "builds": [
    10628
  ],
  "risk": "high",
  "what": "Overview opens scan evidence without replacing the working draft. Explicit source selection, editable baseline with add/remove/Undo, independent enforcement scenarios for the snapshot, proposal, draft and Intune export, scoped business decisions and unified pilot readiness. Guided Harvest device/file validation and partial profile read rejection.",
  "why": "Policy source confusion can turn a generated proposal into an unintended replacement. Local predictions are approximate; a real Windows pilot and live tenant read-back are still required before production promotion. No scanner behavior or tenant policies are changed by this build.",
  "test": [
    "Run npm test, including tests/applocker/review.test.js and harvest.test.js. Import scan A, create a draft, then import scan B: the draft remains and previous separate events are cleared. Reject a different-device event bundle and a mismatched guided Harvest download atomically.",
    "Open a scan without a draft. Compare current policy and scan proposal under Enforce, then create a copy. Add/remove a rule and Undo; the draft prediction follows the change while the original evidence and snapshot remain unchanged. Read-only scenarios never offer draft decisions.",
    "Check DLL filtering, missing publisher versions, unknown group membership, empty/stale evidence and unread tenant values. None may produce a false ready result. The Intune scenario must omit DLL and explain that other device sources are not removed.",
    "LIVE TENANT / WINDOWS PILOT PENDING: read the matching AuditOnly profile, verify exact draft rule content and grouping receipt, collect representative activity after the last policy change, validate recovery and observe pilot enforcement. Verify Harvest download/open against the real SharePoint site. No broad rollout or production promotion based on local simulations."
  ],
  "files": [
    "js/applocker.js",
    "index.html",
    "css/app.css",
    "tests/applocker/review.test.js",
    "tests/applocker/harvest.test.js",
    "tests/applocker/fixtures/review-scan.json",
    "scripts/*.ps1 (build stamp only)",
    "docs/reviews/T01-design-10628.html",
    "docs/reviews/T01-beta-10628.md",
    "js/version.js",
    "js/changelog.js",
    "js/promote.js"
  ]
},
    {
      n: 188, title: "\ud83d\udd10 T01 \u2014 the device scan as a Remediation (scanner 1.13.0 + Detect-TunoAppLockerScan.ps1, fourth pair) and \ud83d\udcc1 From the harvest site on Evidence (NEW SCOPE: Sites.Read.All)",
      tools: ["T01 AppLocker builder & validator"], builds: [10617, 10618, 10619, 10620, 10621, 10622, 10623, 10624, 10625, 10626, 10627], risk: "medium",
      what: "scripts/Invoke-TunoAppLockerScan.ps1 1.13.0: HARVEST TARGET block (same shape as the collector, stamped by the same stampHarvestConfig), -Harvest* and -RetentionDays parameters, Remediation mode (SYSTEM and no -OutputPath: output to %ProgramData%\\IT-TOOLS\\LOGS\\AppLockerScan, Start-Transcript next to the bundle, Remove-TunoStaleOutput byte-identical with the other three remediation halves, upload after the bundle is on disk, one summary line, exit 0/1), the collector's harvest functions carried over with two strict-mode property checks and the prune filter TunoAppLockerScan-*. New scripts/Detect-TunoAppLockerScan.ps1 1.0.0 (7-day window on the newest bundle). js/applocker.js: REMEDY_PAIRS.scan with harvest: true (events too; deployRemedyPair and renderRemedy key on the flag, not the name), SCRIPT_VERSIONS rows, evHarvest state + harvestReadSite / harvestOpenDevice / harvestImport / renderHarvestFetch / toggleHarvestFetch, afterImport() factored out of the file picker so both entrances land the same way, demo listing. js/graph.js: SCOPES.sitesRead, siteByUrlRead, driveChildren (paged), driveItem, driveItemText (the @microsoft.graph.downloadUrl, fetched without a token). index.html: the \ud83d\udcc1 From the harvest site button and #alHarvestFetch card on Evidence, the detection row and the scanner note under Help & scripts, 11 companion scripts. css/app.css: the button's open state. New-TunoAppRegistration.ps1 + SECURITY.md: Sites.Read.All (R18). scripts/README.md rows and the 'As an Intune Remediation' section. tests/applocker/harvest.test.js 94 (two new sections). _to_delete/check-script-versions.js lists the new script.",
      why: "Mihai, 16 Sep: 'add a option to fetch the scan json from the sp site. so the scan must also be able to run as a remedation with the app secret and upload function'. The events pump already reached the site with the device off; the reference scan still needed someone at a keyboard on the reference machine and a file walked back by hand. Now both bundles take the same road there and back. Sites.Read.All is the one new ask and it is delegated read-only: a read was not to be bought with the Sites.FullControl.All write that 10615 already put on the registration. MEDIUM: a new scope, and the Remediation mode of a 175 KB script has been parse-checked and unit-tested (housekeeping, strict-mode probes) but not yet run under the IME on a device.",
      test: [
        "10618-10621 (devcf, 18 Sep): the site read and the listing worked first time; the file's BYTES could not be read by the browser through any of four routes — a $select naming the annotation returns no URL (10618), the pre-authenticated URL answers no CORS (10619), a $batch hands back the same 302 (10620), SharePoint's own REST refuses the cross-origin read (10620/10621). Decision (Mihai, 18 Sep): the certain two-click path — ⤓ Get download link → ⤓ Download (a navigation) → 📂 Upload it. AllSites.Read was on the registration for ONE build (10620) and is withdrawn in 10621; if it was consented on devcf, remove it from the app registration's API permissions. PROVEN on devcf (10621): ⤓ Get newest events bundle → ⤓ Download → 📂 Upload it landed AppControlEvents_Bundle_20260918-110949.json on the table (33 audited, 217 allowed). 10622: with that bundle and no policy, the events card's chooser offers 📂 Upload, 📁 From the harvest site and ⤓ Load the deployed profile side by side — check each button does what it says. 10623 (a second tenant, 22 Sep): a device folder whose one item is a subfolder lists it as a 📁 row — Open it, see what the uploader put there (the collector and the scan write files straight into Harvest/<device>/, so a subfolder means a hand-deployed copy with another Folder value, or something else writing to the site), and the breadcrumb takes you back. 10624 (the cause, same day): the folders were empty because the chunked upload (files over 4 MB) sent its last part as the string System.Object[] — scanner 1.13.1 and collector 1.3.1 fix it. Re-create the scan pair from the 🚀 panel (or replace the remediation script body in the portal) and, after the next pass, the device folder holds TunoAppLockerScan-<device>-<stamp>.json and the transcript's harvest: line reads uploaded. 10625: from Live Response, `run Get-TunoHarvestStatus.ps1 -parameters \"-Probe\"` on one of the four devices — the target block(s) print with the secret masked, the certificate section names the match or its absence, the NOTE names the old scanner version, and the probe ends in PROBE: the chain works (or the tenant's refusal verbatim). 10626: on the 🚀 panel each pair shows its two script versions and the build it changed in; press Create the device-scan Remediation with the OLD name still in the box (… - v1.0) → the stop box lists the existing one with ↻ Replace both script bodies in it → confirm → 'Updated in place'; in the portal the Remediation's remediation script now reads $script:ScriptVersion = '1.13.1' and its assignment is unchanged; after the next pass the device folders on the harvest site hold bundles. 10627 (VNMGM0VJSBY, 23 Sep — folder empty, detection said nothing to do): on the scan Remediation ↻ Replace both script bodies (both script bodies now start with '# <name>  v<version>  (TUNO build 10627)' on line 1 in the portal preview) → the next detection on VNMGM0VJSBY exits 1 with '… did not reach the harvest site (newest TunoAppLockerScan-VNMGM0VJSBY-20260922-0840.json; … harvest: upload FAILED - …) - the upload will be retried, no rescan' → the remediation's summary line reads 'harvest catch-up, no rescan … 1 of 1 pending bundle(s) uploaded' and a .harvest-done marker sits beside the bundle → the device folder on the harvest site is no longer empty, and the following detection says 'nothing pending upload'. If the upload still fails, the reason is on the Intune console line daily; Get-TunoHarvestStatus.ps1 -Probe from Live Response says why.",
        "Re-run New-TunoAppRegistration.ps1 (or add Sites.Read.All delegated in the portal). Signed in on Evidence: \ud83d\udcc1 From the harvest site opens a card with the site URL prefilled from the \ud83d\udcc1 panel; Read the site asks the one consent (Sites.Read.All) and lists the device folders under Harvest/ with file counts and last upload; Open a device: files newest first, kinds told apart, the two big buttons offer the newest scan and events bundle; Import: the bundle lands on the table exactly as an upload (Policy / What breaks? landing), the card says 'Imported <file> from <device>'.",
        "A site with no Harvest folder yet: the card says so (Not found + the hint), no red stack. A URL that is not https://<tenant>.sharepoint.com/sites/<name>: refused before any call.",
        "\ud83d\ude80 Create the device-scan Remediation with a harvest target set: in the portal the remediation script (Invoke-TunoAppLockerScan.ps1) has the HARVEST TARGET block filled, detection is Detect-TunoAppLockerScan.ps1 byte for byte, the description names the site and the credential kind. Assign to ONE reference device with a daily schedule.",
        "On that device after the first pass: %ProgramData%\\IT-TOOLS\\LOGS\\AppLockerScan holds TunoAppLockerScan-<name>-<stamp>.json and AppLockerScan-<stamp>.log (the transcript, with 'Mode : Intune Remediation' and the harvest line); the portal's remediation output is the one summary line; the site has Harvest/<device>/TunoAppLockerScan-\u2026json; the Evidence card imports it. Second pass the next day: detection reports compliant (bundle 1 day old, within 7). Set the device's bundle date back 8 days: detection exits 1, the scan runs again, and the old bundle is still there (30-day retention) \u2014 set it back 31 days: it is removed.",
        "Interactive run unchanged: an elevated admin prompt with no parameters still writes to the current directory, prints the paths, keeps every old bundle (RetentionDays 0), and reads no harvest target unless the registry or -Harvest* says so.",
        "Headless: npm test \u2014 tests/applocker/harvest.test.js 94/94; node _to_delete/check-script-versions.js green with thirteen scripts (Invoke 1.13.0 and Detect-TunoAppLockerScan 1.0.0 say 10617); pwsh parse of all thirteen.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/Detect-TunoAppLockerScan.ps1", "scripts/*.ps1 (TunoBuild)", "scripts/README.md", "js/applocker.js", "js/graph.js", "index.html", "css/app.css", "New-TunoAppRegistration.ps1", "SECURITY.md", "tests/applocker/harvest.test.js", "_to_delete/check-script-versions.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 187, title: "\ud83d\udd10 T01 \u2014 the harvest uploader app and its client secret from the \ud83d\udcc1 panel (THREE NEW SCOPES: Application.ReadWrite.All, AppRoleAssignment.ReadWrite.All, Sites.FullControl.All)",
      tools: ["T01 AppLocker builder & validator"], builds: [10615, 10616], risk: "high",
      what: "js/graph.js: SCOPES.appsWrite / appRoleWrite / sitesFull, GRAPH_APP_ID, SITES_SELECTED_ROLE (883ea226-\u2026), findApplications, createApplication, addAppPassword, servicePrincipalByAppId, createServicePrincipal, appRoleAssignments, assignAppRole, siteByUrl, sitePermissions, grantSitePermission. js/applocker.js: harvest state gains appName / cred (cert | secret) / secret (memory only) / app; createHarvestApp() \u2014 ensureScopes for the three, then five idempotent steps with the state saved after each (the secret is a rotation by design); renderHarvest block \u2461 with the credential radios, the step chips, the secret shown once with the vault warning and the paste-or-rotate line after a reload; harvestConfig accepts a secret instead of a subject; stampHarvestConfig writes ClientSecret; the events pair's description names the credential kind. scripts/Get-TunoAppControlEvents.ps1 1.3.0: ClientSecret in the block, the registry and -HarvestClientSecret; Get-HarvestToken takes -Secret (plain client credentials) when no certificate; the log prints the credential kind, never the value. New-TunoAppRegistration.ps1 + SECURITY.md: the three scopes, with the blast radius written out and the opt-out (omit them, run the helper). tests/applocker/harvest.test.js 58 (the demo run of the app creation, the secret never in localStorage, the R18 pair). Bookkeeping: the twelve scripts' TunoBuild stamps, which 10614 left at 10613.",
      why: "Mihai, 16 Sep: the harvest site creation may also create an app secret; asked whether the helper script or the panel should do it, he picked the panel doing it all. HIGH RISK, AND THE THING TO LOOK AT BEFORE PROMOTING: these are the widest asks TUNO has ever put on its registration \u2014 create app registrations, consent application permissions, change site permissions \u2014 for one button. The panel uses them for exactly five calls on one app and one site, and a tenant that would rather not consent them can omit the three and run the helper. The secret route is offered knowingly: the panel says what it means before the button, TUNO never stores the value, and the certificate radio stays the default.",
      test: [
        "10616: type https://<tenant>-admin.sharepoint.com as the host and press Create: no call is made, the box is corrected to https://<tenant>.sharepoint.com and the red box says why; press again: the site is created (202, then the poll).",
        "Signed out: the panel names the three scopes beside Sites.Create.All. Signed in, no site: the \u2461 button is disabled with the tooltip 'Create the harvest site first'.",
        "With a site, certificate radio (default): \ud83d\udd10 Create the uploader app \u2014 the consent popup asks the three scopes at once; chips go registration: created, service principal: found, Sites.Selected consent: granted, write on the site: granted; the client id box fills in; no secret is shown; the readiness line waits for the certificate subject.",
        "Secret radio: the button reads '+ secret'; after the run the secret is shown once with 'kept for this page session only'; the readiness line reads 'client secret (goes into the script body)'; \ud83d\ude80 Create the events-collection Remediation: in the portal the remediation script's HARVEST TARGET block has ClientSecret filled and CertSubject empty; the description says 'with a client secret carried in the script body'. Reload the page: the app record is remembered, the secret box is empty and the panel says paste or rotate; press the button again: a second secret appears (the portal lists two).",
        "Portal: the uploader app has ONE API permission (Sites.Selected, Application, granted); Enterprise applications \u2192 Permissions shows it consented; the site's app permissions (Grant-PnPAzureADAppSitePermission -Site \u2026 or GET /sites/{id}/permissions) list the app with write.",
        "A user without SharePoint Administrator: the site grant step is refused with the tenant's 403 verbatim, the earlier chips stay done, and pressing again after the role is granted completes only the missing step.",
        "On a device WITHOUT the certificate but with the secret-stamped script: Get-TunoAppControlEvents.ps1 uploads ('harvest: uploaded bundle \u2026'); its log reads 'client secret (value not logged)' and the secret appears nowhere in the log or the output. With both a certificate and a secret configured the certificate is used.",
        "Headless: npm test \u2014 tests/applocker/harvest.test.js 58/58 alongside 10614's tests/endpointposture/brief.test.js; check-script-versions green (Get 1.3.0 says 10615, all twelve stamps 10615); pwsh parse of all twelve scripts.",
      ],
      files: ["js/graph.js", "js/applocker.js", "scripts/Get-TunoAppControlEvents.ps1", "scripts/*.ps1 (TunoBuild)", "scripts/README.md", "New-TunoAppRegistration.ps1", "SECURITY.md", "index.html", "tests/applocker/harvest.test.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      "n": 186,
      "title": "T20 — reviewed impact brief with evidence-based claims, coverage and rollout wording",
      "tools": [
        "T20 Endpoint security posture"
      ],
      "builds": [
        10614
      ],
      "risk": "medium",
      "what": "Revised statement matching and user-facing copy; shared coverage calculations distinguish member totals from device targets; conditional rollout and interim retirement wording; read warnings and timestamps in Markdown and Word; tracked regression suite and review report.",
      "why": "The generated user brief overstated what settings and assignments prove. This update removes unsupported operational and privacy promises before the brief is reused for employee communication. It does not read per-device application results or establish an approved rollout audience.",
      "test": [
        "Local: npm test must pass, including tests/endpointposture/brief.test.js. Render a Word sample and inspect every page; see docs/reviews/T20-brief-review-10614.md for completed validation.",
        "Live tenant (pending): read T20 and compare a real ASR Block, Warn and Audit policy, disabled Hello, Edge site-only/download-only override and password-saving policy against the statements and both exports.",
        "Live tenant (pending): check group targets, All users, exclusions and an All devices filter; only computable device sets carry counts. Confirm partial read warnings survive download.",
        "Live rollout (pending): confirm the intended audience, effective device settings and replacement coverage before updating and distributing the employee brief. A configured unassigned policy must not claim a fleet-wide rollout or a completed replacement."
      ],
      "files": [
        "js/endpointposture.js",
        "index.html",
        "js/version.js",
        "js/changelog.js",
        "js/promote.js",
        "tests/endpointposture/brief.test.js",
        "docs/reviews/T20-brief-review-10614.md"
      ]
    },
    {
      n: 185, title: "\ud83d\udd10 T01 \u2014 the harvest site: one SharePoint site the events collector uploads to every pass, created from the page, with a certificate-based uploader app and NO secret in any script (a NEW SCOPE, Sites.Create.All, in the open)",
      tools: ["T01 AppLocker builder & validator"], builds: [10613], risk: "medium",
      what: "index.html: a \ud83d\udcc1 Harvest site panel between the downloads and the \ud83d\ude80 deploy panel (option B of the mockup), a download row for the new helper. js/graph.js: SCOPES.sitesCreate, createSite (POST /beta/sites, 202 + Location), siteOperation (getOperationStatus), tenantId(), and call() takes withLocation. js/applocker.js: loadHarvest/saveHarvest per tenant id in localStorage, guessSharePointHost from the initial onmicrosoft.com domain, createHarvestSite (validates host and name, polls the operation up to two minutes, honest 'pending' after), renderHarvest, harvestConfig (all-or-nothing), stampHarvestConfig (fills only the HARVEST TARGET block), fetchScriptB64 takes a transform and keeps the BOM; the events pair's blurb, description and created-box say whether a target was carried. scripts/Get-TunoAppControlEvents.ps1 1.2.0: the HARVEST TARGET block, -Harvest* parameters, the registry override, Get-HarvestToken (RS256 JWT client assertion via GetRSAPrivateKey), Get-HarvestSiteId by URL, Send-HarvestFile (PUT under 4 MB, upload session in 5 MiB chunks above), Remove-HarvestStale (opt-in). scripts/New-TunoHarvestUploaderApp.ps1 1.0.0 (new). New-TunoAppRegistration.ps1 + SECURITY.md: Sites.Create.All. tests/applocker/harvest.test.js (tracked, 42) and AppLockerTool bridged in the harness.",
      why: "Mihai, 16 Sep: a button to create a SharePoint site for harvest dumping, so the scripts can put their daily events there and they are easy to retrieve even when the device is off. Every retrieval T01 offered needed the device on. The auth model was a decision taken from a mockup: option C (certificate + Sites.Selected, write on one site) over a client secret in the script \u2014 Intune's own Remediation guidance says no sensitive information in scripts, and a shared secret on every endpoint can read the whole harvest. THE SCOPE IS THE THING TO LOOK AT BEFORE PROMOTING: Sites.Create.All is the first SharePoint permission on the registration; it creates sites and does nothing else, and TUNO's token never reaches a device.",
      test: [
        "Signed out: the \ud83d\udcc1 panel names Sites.Create.All and shows no button. Signed in: host prefilled from the tenant's onmicrosoft.com domain, name TUNO-AppControl-Harvest; Create: 'Creating\u2026', then 'Site created' with the URL and id (or 'Request accepted \u2014 provisioning' after two minutes of polling, with the URL to open). A taken name: the tenant's refusal verbatim in the red box.",
        "Run New-TunoHarvestUploaderApp.ps1 -SiteUrl <the site> as an admin: app created, Sites.Selected consented, cert + PFX written, write granted on the site, the client id and subject printed. Paste both into the panel: the readiness line turns green.",
        "\ud83d\ude80 panel: the events pair says 'Harvest target set'; Create: the created box says the target was carried; in the portal the remediation script's HARVEST TARGET block holds the four values. A pair created before the target was complete says 'No harvest target'.",
        "On a device with the PFX in LocalMachine\\My, elevated: .\\Get-TunoAppControlEvents.ps1 -HarvestSiteUrl ... -HarvestTenantId ... -HarvestClientId ... -HarvestCertSubject ... -DaysBack 1: the last line says 'harvest: uploaded bundle (...), report (...) to .../Harvest/<device>'; the files are in the site. Without the certificate: 'harvest: upload FAILED - no certificate ...' as a warning, exit 0, the local files present.",
        "Headless: npm test \u2014 tests/applocker/harvest.test.js 42/42, the other eight suites unchanged; check-script-versions green (Get 1.2.0 and the helper say 10613); the JWT harness in the cloud container (self-signed cert, signature verified with the public key, 8/8); pwsh parse of all twelve scripts.",
      ],
      files: ["index.html", "js/graph.js", "js/applocker.js", "scripts/Get-TunoAppControlEvents.ps1", "scripts/New-TunoHarvestUploaderApp.ps1", "scripts/README.md", "New-TunoAppRegistration.ps1", "SECURITY.md", "tests/applocker/harvest.test.js", "tests/platformbaseline/harness.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 184, title: "\ud83d\udd10 T01 \u2014 Detect before Remediate on every script row, and each remediation half removes its own output older than 30 days",
      tools: ["T01 AppLocker builder & validator"], builds: [10612], risk: "low",
      what: "index.html: the three pairs under Help & scripts and the pair on Deploy list the detection script first, notes say which half is which, the Deploy-screen Detect note drops the pre-10600 'unassign it or it removes the new policy'. scripts/: Remove-TunoStaleOutput (byte-identical in Clear 1.4.0, Initialize 1.2.0, Get 1.1.0) removes files matching the set's OWN name patterns older than -RetentionDays (default 30) and trims the set's append-only logs to the window (a line without a timestamp follows the entry above it); Clear keeps the marker by name; Get also cleans the per-ID exports and Compress's zips and trims the detection half's log. SCRIPT_VERSIONS, row notes, REMEDY_PAIRS blurbs and descriptions, scripts/README.md updated.",
      why: "Mihai, 16 Sep: the remediation scripts were listed before detect \u2014 reverse it; and every remediation tool should clean up logs and other produced data older than 30 days. A daily collector on a ring of devices writes a bundle and a report a day plus dozens of per-ID exports; nothing removed them. The Deploy-screen note was the 10600 lesson ('it needs to be visual that it has changed') still owed on one row.",
      test: [
        "Help & scripts \u2192 9 companion scripts: the rows read Detect-TunoAppLockerPolicy, Clear-TunoAppLockerPolicy; Detect-TunoItToolsFolders, Initialize-TunoItToolsFolders; Detect-TunoAppControlEvents, Get-TunoAppControlEvents \u2014 each with 'changed in this build' on the three remediation halves. Deploy: the brownfield pair reads Detect, then Clear.",
        "On a device with a month of harvests: run Get-TunoAppControlEvents.ps1; its log's HOUSEKEEPING line names the files removed and lines trimmed; bundles/reports newer than 30 days and IntuneManagementExtension.log are untouched. -RetentionDays 0: the line says 'off' and nothing is removed.",
        "Clear-TunoAppLockerPolicy.ps1 on a cleaned device: AppLocker-Cleanup.done survives, backups older than 30 days are gone, the STOP-by-marker path still exits 0.",
        "Headless: node _to_delete/check-script-versions.js green (three versions moved, three rows say 10612); npm test; t01 scratch suites; pwsh parse of all eleven scripts; the housekeeping function's own 10-case harness (old/new/foreign/marker files, log trimming with continuation lines, Days 0).",
      ],
      files: ["index.html", "scripts/Clear-TunoAppLockerPolicy.ps1", "scripts/Initialize-TunoItToolsFolders.ps1", "scripts/Get-TunoAppControlEvents.ps1", "scripts/README.md", "js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 183, title: "\ud83d\udcc4 The policy id in every popout head, click-to-select; a crumb that matches no tab warns off production",
      tools: ["T05 Documenter", "T19 Policy overview", "T11 Assignment editor", "T20 Endpoint security posture", "All tools"], builds: [10611], risk: "low",
      what: "Docs.popoutHtml prints `ID: <code data-selall>` beside the source when the item has an id; one delegated document click handler selects the node's contents. app.js crumb(): a non-empty name that idForCrumb() cannot resolve console.warns on a non-production host. New tracked suite tests/shell/smalldeltas.test.js (the head, the escaping, the selection in jsdom, and every tile's crumb resolving in demo mode).",
      why: "The two small ENCA deltas Mihai's 10 Sep sweep still owed. The id one is the same bug ENCA had: the string you need to paste is on the card you close to read the policy. The crumb one is the silent-string lesson \u2014 an exact-match lookup with a quiet fallback ships, so the fallback should say something where a developer is looking.",
      test: [
        "T19: open a policy card: the head reads 'Source: \u2026 \u00b7 ID: <guid>'; click the id: the whole GUID is selected; Ctrl+C pastes it. Same in T05's popout, T11's, T20's and the baseline tools'.",
        "On the beta host, rename a tile's crumb in app.js to something TOOL_TABS does not carry, click the tile: the console warns with the label. On production (or with the label restored) nothing is logged.",
        "Headless: npm test \u2014 tests/shell/smalldeltas.test.js 8/8.",
      ],
      files: ["js/document.js", "js/app.js", "tests/shell/smalldeltas.test.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 182, title: "\ud83d\udee1 T23 \u2014 the member and administrator boxes suggest from the tenant (archived originals never offered), a ;-list completes the entry being typed, a redraw keeps the scroll",
      tools: ["T23 Restricted AUs", "All tools"], builds: [10610], risk: "low",
      what: "js/suggest.js: a groupUser kind (groups then users, four each; GroupMigrate.ARCHIVE_SUFFIX filters the groups, with a copy of the regex as the fallback when T22 is not loaded) and a `multi` option \u2014 entryBounds() finds the entry around the caret between ; or , separators, termOf() searches only that entry, pick() replaces only that entry; the textarea rule now goes through the same helper unchanged. js/restrictedau.js: render() attaches Suggest to every [data-raaddbox] (groupUser) and [data-raadminbox] (user, multi) after each redraw, openEditor attaches it to #raNewAdmin (user); render() keeps window.scrollY across the innerHTML swap. New tracked suite tests/restrictedau/catchup.test.js.",
      why: "Mihai, 10 Sep: catch T23 up with ENCA's Restricted AUs. ENCA's own reasoning: the boxes assumed you knew the UPNs, so the fastest route was to leave and look them up (25103); the ;-list bug made the second name unfindable (25105); the archived original turned up as a candidate while the real group was already a member (25310); and deleting from a list that jumped to the top (25130).",
      test: [
        "T23, open a unit's Members & admins panel. Type three letters in the member box: the menu offers groups (flagged group) then users (flagged user); a group renamed '(migrated \u2026)' by T22 does not appear even when its name matches. Pick one: the box holds the display name; + Add resolves it as before.",
        "In the scoped-administrator box type 'a@x.com; tul': the menu searches 'tul' alone; pick: the box reads 'a@x.com; tulip@contoso.com'. Grant: both are granted separately, as before.",
        "Create a unit: the administrator box suggests users (prefilled with you).",
        "Scroll down a long unit list, revoke a grant or remove a member: the list redraws and stays where you were.",
        "Paste an object id in either box: it still resolves \u2014 no suggestion, no refusal.",
        "Headless: npm test \u2014 tests/restrictedau/catchup.test.js 24/24 (multi-entry term and pick with a fake Graph in jsdom, the groupUser kind and the archive filter, the T23 wiring as source).",
      ],
      files: ["js/suggest.js", "js/restrictedau.js", "tests/restrictedau/catchup.test.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 181, title: "\ud83d\udd04 T22 \u2014 nesting state on the groups table; \ud83d\udeab Disable nesting on the replacement, opt-in and verified; a NEW SCOPE (Group-NestingSupport.ReadWrite.All)",
      tools: ["T22 Group migration"], builds: [10609], risk: "medium",
      what: "ENCA's NESTING block (cagroups.js) and confirmNesting (assign.js) ported into GroupMigrate: NESTING_GA=false, NEST_V1, nestingUnsupported/noteNestingUnsupported (session memory), nestingState, loadNestingStates (Graph.batch on v1.0, $select=id,disableNesting, never throws), confirmNesting (read \u2192 PATCH once \u2192 read). plan() takes `nesting`; apply() puts disableNesting:true in the create when ticked, retries WITHOUT it on the wording that says the directory lacks the property, then reports what was verified: disabled / failed (STILL ALLOWED, reason) / unsupported / n/a \u2014 result.nesting, a log line, a report row. Screen: rows redraw with \ud83d\udeab / \u21aa after the batch lands, two chips, the \ud83d\udeab tick in the plan form (default NESTING_GA, disabled once the tenant said no), the scope asked at Migrate only when ticked. SCOPES.nestWrite + ALL_SCOPES + the permission plan; New-TunoAppRegistration.ps1 gains the scope with the OPT-IN note. New tracked suite tests/groupmigrate/nesting.test.js.",
      why: "Mihai, 10 Sep: catch T22 up with ENCA's \u2467 Migrate; the nesting half is the other thing ENCA's create does that TUNO's did not. The scope is the part to look at before promoting \u2014 it is the first new delegated permission since the T22 set at 10506-10508, and it writes to the directory. It is off by default and asked for at the click only when ticked, so a tenant that never ticks it never sees the request; but it IS on the registration and in the \ud83d\udd10 Grant list, which is the decision R18 says to take in the open.",
      test: [
        "Run New-TunoAppRegistration.ps1 (or add the scope by hand in the portal) so the registration declares Group-NestingSupport.ReadWrite.All; without it the ticked path fails at consent with a clear name.",
        "T22 Read on a tenant: after the list lands the rows gain \ud83d\udeab nesting disabled / \u21aa nesting allowed where the directory reports it; the two chips filter. On a tenant without the property: no marker, no chip, no error, and the \ud83d\udeab tick in Examine is greyed with 'Not available in this tenant'.",
        "Examine a group: the tick is OFF by default with the off-by-default note. Migrate unticked: the create body has no disableNesting, no nesting scope is requested, the report row says not requested.",
        "Tick it, Migrate: the consent prompt names Group-NestingSupport.ReadWrite.All; the create carries the property; the log reads 'Created \u2026 (nesting disabled)' when the read-back confirms, or a red 'Nesting is STILL ALLOWED' with the reason; the report row agrees. On a tenant without the property: the create is retried without it, the group exists, the log says not available in this tenant.",
        "Headless: npm test \u2014 tests/groupmigrate/nesting.test.js 50/50 (state read and the unsupported tenant, unticked/ticked creates, PATCH fallback, STILL ALLOWED, retry-without-property, a create failing for another reason NOT retried, scope wiring as source).",
      ],
      files: ["js/groupmigrate.js", "New-TunoAppRegistration.ps1", "tests/groupmigrate/nesting.test.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 180, title: "\ud83d\udd04 T22 \u2014 the repoint runs every policy past a refusal; an archive still in policies is called out with the way out; the tab is guarded mid-run",
      tools: ["T22 Group migration"], builds: [10608], risk: "medium",
      what: "repoint(): stopOnFail false; failures carry the policy id. apply() step 4: a refusal sets result.refsRefused + result.warning and CARRIES ON to the unit step instead of returning; result.ok stays true. report(): the work list opens with the refused swaps; the warning is a callout. Screen: the result panel lists them with \u270f\ufe0f Open in T11 (AssignEditTool.openWith through a delegated [data-gmt11] click, modal closed first); the Archived pane's referenced rows say 'Still in policies \u2014 the repoint did not finish' with the same hand-off per repointable policy and the by-hand surfaces named; referencesMany() keeps p.surface for it; the Overview counts archives still in policies; the State column shows 'N still name the archive'; beforeunload guard added at Migrate and removed in finally. New tracked suite tests/groupmigrate/repoint.test.js.",
      why: "Mihai, 10 Sep: catch T22 up with ENCA's \u2467 Migrate. ENCA's 25318 (today) is the one that matters: a refusal on one policy is not a reason to leave the old group in the policies after it, and a migration that stops there leaves MORE to do by hand than one that finishes. 25317 and 25130 are the two that make the leftover visible and the run safe to watch.",
      test: [
        "Test tenant, a role-assignable group assigned to three writable policies; make the second refuse (e.g. edit its assignments in the portal between Examine and Migrate so the drift check trips). Migrate: the log shows 'Repointed 2/3' then '1 refused \u2014 carrying on with the unit step', the unit step runs, the result is \u2705 with a \u26a0 warning naming the policy, and the yellow box lists it with \u270f\ufe0f Open in T11. Click it: T11 opens with that policy ticked.",
        "Portal: the two other policies name the new group, the refused one still names the '(migrated \u2026)' group.",
        "Groups pane: the migrated row reads 'migrated' + '1 still name the archive'. Archived pane \u2192 tick the archive \u2192 Check: the row says 'Still in policies \u2014 the repoint did not finish' with the policy and the T11 button; Delete stays refused for it. Overview: 'worth a look first' counts it.",
        "Swap the group in T11, re-check on the Archived pane: 'nothing points at it', Delete allowed.",
        "Start a migration and try to close the tab while it runs: the browser asks. Close the modal on an idle screen: no prompt.",
        "Headless: npm test \u2014 tests/groupmigrate/repoint.test.js 24/24 (three policies with the middle one refusing: all three posted, two swapped, one named; clean run unchanged; the screen parts as source).",
      ],
      files: ["js/groupmigrate.js", "tests/groupmigrate/repoint.test.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 179, title: "\ud83d\udc64 The header keeps only your initials \u2014 one account button, its menu holds tenant, account, Copy tenant ID, Branding settings and Sign out; the Tools button goes",
      tools: ["All tools"], builds: [10607], risk: "low",
      what: "index.html: the tenant box becomes #acctBtn (the avatar alone) + #acctMenu (role=menu, hidden) with #tenantName / #acctMenuName / #tenantUser in its head and three menuitem rows; #homeBtn removed. css: .acct/.acct-menu rules (ENCA 25259 verbatim), .btn.home-btn rules dropped, the 680px breakpoint no longer gives the tenant box a row. app.js: setAccountBox(upn, displayName) fills both sign-in paths (real and demo), open/close/away/Escape handlers, Copy tenant ID with T01's flash() pattern instead of ENCA's toast (TUNO has none). selfhost.js: addGear() wires the static Branding settings row and keeps the injected \u2699 as a fallback for a page without it. The Help paragraph on branding names the new entry point. New tracked suite tests/shell/header.test.js.",
      why: "Mihai, 10 Sep: read ENCA for updates to the machinery TUNO shares and apply them; the header was one of the four he picked, and option A (initials only) was his pick from the mockup, per the layout-first rule. ENCA's reasoning holds here unchanged: none of the tenant name, the account, Sign out or the gear is needed more than once a session, and the header is for the tools.",
      test: [
        "Sign in: the header shows logo, TUNO tag, theme toggle, the \ud83e\uddea badge on the reference tenant, and the initials circle. No Tools button. Hover the circle: tenant name and UPN in the tooltip.",
        "Click the circle: the menu opens under it with Tenant / Signed in as, Copy tenant ID, Branding settings, Sign out. Escape closes it; a click on the page closes it; a click on the circle toggles it.",
        "Copy tenant ID: the row reads \u2713 Tenant ID copied, the clipboard holds the GUID, the menu closes by itself. On http://localhost:8080 (no clipboard) the row shows the GUID instead.",
        "Branding settings opens the same dialog the \u2699 gear did, on production and beta alike (the production copy still says this browser only).",
        "Sign out from the menu: the box hides, the sign-in screen shows, the menu is closed on the next sign-in.",
        "Demo mode: DM initials, Demo Mode / demo@contoso.onmicrosoft.com in the menu, Copy tenant ID offered (the demo has a fake id by design).",
        "Narrow window (< 680px) and dark theme: the header wraps to one row, the menu fits the viewport.",
        "Headless: npm test \u2014 tests/shell/header.test.js 25/25, the rest unchanged.",
      ],
      files: ["index.html", "css/app.css", "js/app.js", "js/selfhost.js", "tests/shell/header.test.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 178, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the run ledger on Rename, Housekeeping and Import; the finished box survives the re-read",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10606], risk: "medium",
      what: "The three baseline writes create a RunLedger over their plan (refused rows included as skips), report each row's phase and verdict, and honour Stop between rows. Import hands its ledger to Restore.apply (rows 0..n-1) and numbers the filters after the policies; the pilot assignment writes onto the policy's row. S.lastLedger (per act, in blankSession so sign-out drops it) keeps the finished box and the pane shows it again after rereadAfter(). No write, read or read-back changed.",
      why: "Item 177's last piece \u2014 ENCA put the ledger on Import at 25314, a build after the rest, for the same reason: the import is the longest write in the tool and the one most often watched. And the baseline tool is the one place in TUNO where a write is followed by a full redraw, which until now erased the result it had just printed.",
      test: [
        "T27 on the reference tenant: \u270f\ufe0f Rename, tick three, dry run, apply. The ledger appears with all three rows (a refused one already grey with its reason), each shows checking \u2192 renaming, turns 'renamed \u00b7 verified'; after the automatic re-read the Rename pane still shows the finished box under 'The last run, as it happened'.",
        "\ud83e\uddf9 Housekeeping: same shape; delete one old copy, watch the row go deleting \u2192 verifying \u2192 'deleted \u00b7 verified gone'. Throttle the read-back (or pick a policy that reads back) and the row is RED 'unverified' with the doubt inline.",
        "\ud83d\udce5 Import on a test tenant with pilot assignment: one ledger, policies then filters; a policy row ends 'created \u00b7 assigned' with the group name, a filter row ends 'created'. Press Stop mid-run: the row in flight finishes, the rest are 'stopped', the summary line and the failures list agree.",
        "Sign out, sign in: the Rename/Housekeeping/Import panes show no old ledger.",
        "Headless: npm test \u2014 screen 235/235 (the 10606 block: one helper, three acts, Stop in every loop, lastLedger in the session), engine 181/181, runledger 58/58.",
      ],
      files: ["js/platformbaseline.js", "tests/platformbaseline/screen.test.js", "tests/platformbaseline/harness.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 177, title: "\u2705 The run ledger \u2014 ENCA's progress box on every batch write: T11 apply, T04 restore and import, T25 disable/enable/delete, T22 archived cleanup",
      tools: ["T11 Assignment editor", "T04 Backup & restore", "T25 Entra device cleanup", "T22 Group migration"], builds: [10605], risk: "medium",
      what: "js/runledger.js ported whole from ENCA 25301 (one correction: a plain-string item no longer prints String.prototype.sub as its subtitle), its .rl stylesheet block, and a `ledger` option on the four engines \u2014 AssignEdit.applyPlan, AssignImport.apply, Restore.apply, DeviceCleanup.apply, GroupMigrate.deleteArchived. Each engine reports start/done/fail/skip per row index and honours Stop BETWEEN rows; the screens create the ledger before the call and keep the finished box as the results table. No write path changed: the same reads, writes and read-backs, in the same order \u2014 the ledger is a second listener on outcomes the result list already carried.",
      why: "Mihai, 10 Sep: read ENCA for updates to the machinery TUNO shares and apply them. This is the largest one \u2014 ENCA put it on every batch write at 25301 and Import at 25314. A write that says 'writing\u2026' on one line and shows a table afterwards hides the one question anyone watching a batch has: which one is it on, and did the last one land. And Stop did not exist: a run that started going wrong had to be watched to the end.",
      test: [
        "T11: plan an add across 5+ policies, apply. All rows appear waiting before the first write; the current row is highlighted with its phase (checking\u2026 / writing\u2026 / verifying\u2026); each row turns 'written \u00b7 verified' in green as it lands; the strip above says N written & verified. Press Stop mid-run: the row in flight finishes, the rest read 'stopped' in grey, the strip says stopped early.",
        "T11 with stop-on-first-failure ticked and a policy that refuses (e.g. an assignment on a policy deleted between plan and apply): the failed row is red with Graph's reason inline, the rest read 'stopped after an earlier failure'.",
        "T04 \u2192 Restore a zip with 3+ objects: one row per object, phases visible, created rows say 'verified by read-back \u00b7 unassigned'. T04 \u2192 Import assignments.json: one row per assignment list.",
        "T25: tick 3 stale devices, Disable. The Results pane opens at once with the three listed; rows turn disabled / skipped (a device that woke up says so) / failed; the summary line and the report agree with the rows.",
        "T22 \u2192 Archived: check references, tick two deletable groups, Delete: both rows appear before the first delete, turn deleted, the count line reads Deleted 2 and the finished ledger stays under it.",
        "Headless: npm test \u2014 tests/runledger/runledger.test.js 58/58 (the ledger, and the engine contract for all five engines with a fake ledger, Stop included); tests/platformbaseline unchanged.",
      ],
      files: ["js/runledger.js", "css/app.css", "js/assignedit.js", "js/backup.js", "js/restore.js", "js/devicecleanup.js", "js/groupmigrate.js", "tests/runledger/runledger.test.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 176, title: "\u270f\ufe0f T11 + \ud83d\udd04 T22 \u2014 Windows update profiles become repointable; a reference that cannot move names its own reason",
      tools: ["T11 Assignment editor", "T22 Group migration", "T04 Backup & restore", "T05 Documenter"], builds: [10604], risk: "medium",
      what: "AssignEdit.SURFACES gains windowsFeatureUpdateProfiles, windowsQualityUpdateProfiles and windowsDriverUpdateProfiles \u2014 seven surfaces, unchanged write scope. Each carries `section` (T05's section id, now the one home of that mapping), `collection` (the __surface value, so the warm start splits a folded section back apart), `assignmentType` (the envelope @odata.type its assign action documents, stamped by bodyAssignments at write time only) and `groupsOnly` (planFor refuses tenant-wide targets there). T22's `other` rows carry a per-source `why`; the blanket scope sentence is gone from the panel, the report table, the step-4 line and the plan warnings. T04's restore write goes through bodyAssignments. Docs.platformsOf calls `updates` Windows.",
      why: "Mihai, 8 Sep, looking at a migration plan that listed a feature update profile and a driver update profile under 'must be moved by hand \u2014 each needs a write scope this registration does not declare'. Both assign actions take DeviceManagementConfiguration.ReadWrite.All, which the registration declares and both tools already use. The subtraction was right and the explanation was a guess applied to the whole remainder; it had been wrong for three of the nine sources since T22 shipped. MEDIUM, and the reason is the write path, not the reasoning: three new collections can now be written in bulk by T11 and automatically by T22's repoint step. The envelope type is the one genuinely new thing on the wire \u2014 sig() ignores it by design, so a service that rejected it would show as a failed write with the tenant's own message, never as a silent mismatch.",
      test: [
        "T11 on a tenant with update profiles: the rail shows Feature update profile, Quality update profile and Driver update profile with their counts; the platform filter counts them under Windows, not Not platform-specific. Each list is its own collection \u2014 a driver profile never appears under Feature.",
        "T11 warm start (open the screen on a cached read) shows the same three lists as \u270f\ufe0f Read the policies does. This is the __surface split; before it, all three would have shown the whole updates section.",
        "Add a group to one feature update profile: dry run says change, the backup file records the assign path and an assignments array carrying the windowsFeatureUpdateProfileAssignment envelope, apply writes, the read-back verifies. Confirm in the portal that the group is on the profile and any pre-existing assignment and filter survived.",
        "Pick All devices with an update profile selected: the plan REFUSES with 'targeted by security group only', and nothing is sent.",
        "T22 on a group assigned to an update profile: the profile now appears under 'Assignments this tool will repoint', not under NOT. Migrate and confirm the new group is on the profile and the archived group is not.",
        "T22 on a group assigned to an application: it stays under NOT, and the row reads 'applications are written under DeviceManagementApps.ReadWrite.All' rather than the old blanket sentence. A settings-catalog compliance policy reads 'no new scope is needed, the collection is simply not wired'.",
        "T04: export assignments.json on a tenant with assigned update profiles, then import \u2014 the update profiles are importable rather than export-only, and the dry run/drift/verify all behave as for the original four.",
      ],
      files: ["js/assignedit.js", "js/groupmigrate.js", "js/backup.js", "js/document.js", "js/overview.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 175, title: "\ud83d\udd10 T01 \u2014 cleanup pair 1.3.1/1.1.1: Managed Installer companions recognised by mode + action, rule names printed",
      tools: ["T01 AppLocker"], builds: [10603], risk: "medium",
      why: "Mihai, 8 Sep, second screenshot after 10600: the pair still reported 4 legacy rules on a Managed Installer device because the companions carry two allow rules each, not the single allow-* 10600 keyed on. Classification now: AuditOnly + all-Allow Exe/Dll beside a ManagedInstaller collection = companion (0). Verified on that shape and on Enabled, Deny, no-MI and Script-rule variants.",
      test: [
        "The three Vietnamese devices: detect exits 0 with 'Managed Installer policy present' and the companion rule names in the output; no more Recurred/Failed.",
        "A device with a real legacy policy (Enabled Exe, or Script/Msi rules) still detects 1 and is cleaned; the cleanup verifies clean and writes the marker.",
        "check-script-versions: both scripts bumped and the page says changed in build 10603.",
      ],
      files: ["scripts/Clear-TunoAppLockerPolicy.ps1", "scripts/Detect-TunoAppLockerPolicy.ps1", "js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 174, title: "\ud83d\ude9a Help \u2014 the promotion queue folds related items into one row; each keeps its tick to be held back",
      tools: ["Help"], builds: [10602], risk: "low",
      what: "PROMOTE.groups reads relatedness off tools[] (shared tool, transitive, items naming more than three tools stand alone) and PROMOTE.queueRows interleaves groups and singles by first number. The Help table draws a group row with one tick, a fold, the worst risk and the build span over its member rows, which keep their own ticks; the group box derives from the members (whole, partial, none) and the order file gains a GROUPS section naming held-back numbers, in prose and in the JSON block.",
      why: "Mihai, 8 Sep: 'the waiting for production list should group related items as one for promotion with the option to deselect from the grouping'. At 42 items the queue was two long runs and 'all of T01' was seventeen ticks. Beta-only surface (the queue never renders in production) and nothing tenant-facing; the one thing that changes shape is the promotion order file, which gains a section rather than changing its existing lines. Low \u2014 but the file is what a working session promotes from, so the held-back line has to be right.",
      test: [
        "Help, on beta: the table shows a group row 'T01 AppLocker \u2014 N related changes, promote together' with the T01 rows under it, and the same for 'T24 macOS baseline + T27 Windows baseline'; item 135 (the layout round, twenty tools) is a single row.",
        "Tick the T01 group box: every T01 row ticks, the toolbar reads N of 42 ticked \u00b7 3 groups. Untick one T01 row: the group box goes half, its row reads 'partial' in the report colour, the toolbar says '1 partial'. Tick the group box again: whole. Untick it: none.",
        "Hold one number back and Export promotion order: the file's GROUPS section names the group with its items and 'HELD BACK: <n>', and the JSON block's groups[] carries the same; the held-back number is absent from PROMOTE ITEMS.",
        "Click the fold arrow on a group: its member rows hide and the arrow turns; click again: back. Reload: ticks survive (per item number, as before); folds do not, by design.",
        "Clear ticks: every member box and every group box clears. pq-tests 368/368, including the synthetic seven-item queue that proves the >3-tools rule and the naming rule.",
        "No row prints 'undefined' under its tools line any more (every live item lacks the optional what field; the renderer used to write it regardless).",
      ],
      files: ["js/promote.js", "js/app.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js"],
    },
    {
      n: 173, title: "\ud83d\udd10 T01 \u2014 script rows show version + last-changed build; cleanup Remediation panel matches the marker",
      tools: ["T01 AppLocker"], builds: [10601], risk: "low",
      why: "Mihai, 8 Sep: when scripts change the page must show it. SCRIPT_VERSIONS in applocker.js rendered on every row, held to the files by check-script-versions (v equals the file's ScriptVersion; a bumped script must name the current build). The deploy panel's stale unassign-or-lose-the-policy text replaced.",
      test: [
        "Help & scripts: ten rows each with 'vX.Y.Z · changed in build N'; on a build that bumps a script the tag reads 'changed in this build' in red.",
        "check-script-versions fails when a script's version moves without the map moving, or the map names a version the file does not carry.",
        "Deploy the pairs fold: the cleanup blurb says the pair can stay assigned and to replace script bodies in an older Remediation.",
      ],
      files: ["js/applocker.js", "css/app.css", "index.html", "CLAUDE.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 172, title: "\ud83d\udd10 T01 \u2014 the cleanup pair leaves a marker (Clear 1.3.0, Detect 1.1.0); generation for a second campaign",
      tools: ["T01 AppLocker"], builds: [10600], risk: "medium",
      why: "Mihai, 8 Sep, the deployed Remediation '[REPAIR_TOOLS]Win - DHS - Device Security - D - Clear Applocker Settings': detection said any AppLocker state = run the cleanup, so once the new profile landed the pair would have cleaned it. The cleanup now writes a marker on a verified-clean result and detection honours it; -Force and CleanupGeneration for the deliberate cases.",
      test: [
        "Fresh device with a legacy policy: detect exits 1; cleanup runs, verifies clean, writes HKLM\\SOFTWARE\\TUNO\\AppLockerCleanup and AppLocker-Cleanup.done, exits 0.",
        "Same device after the new profile is delivered (rules in the effective policy): detect exits 0 with 'already ran ... left alone'; the cleanup, if forced through Intune, exits 0 with STOP and changes nothing.",
        "Cleanup that ends NOT clean writes no marker, so the next detection cycle retries it.",
        "Raise CleanupGeneration to 2 in both scripts: a device marked with generation 1 is detected non-compliant again and cleaned once.",
        "Elevated shell on a marked device: Clear without -Force stops; with -Force it runs and re-marks.",
        "Device with the Intune Managed Installer policy and no legacy rules (VNMPF5Z6B97 / VNMGM0VJSBY shape): detect exits 0 naming 'Managed Installer policy present'; the cleanup verifies clean with SrpV2\\ManagedInstaller untouched and writes the marker.",
      ],
      files: ["scripts/Clear-TunoAppLockerPolicy.ps1", "scripts/Detect-TunoAppLockerPolicy.ps1", "scripts/README.md", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 171, title: "\ud83c\udf4e T24 + \ud83e\ude9f T27 \u2014 each tool only ever speaks about its own platform",
      tools: ["T24 macOS baseline", "T27 Windows baseline"], builds: [10599], risk: "high",
      why: "Mihai, 8 Sep, with a screenshot of \ud83e\uddf9 Housekeeping on the macOS baseline full of `Win - OIB - ES - Defender Antivirus Updates` and five `WIN-DHS-DeviceConfiguration-\u2026` remediations, several assigned. The read is the whole tenant \u2014 that is the point of one shared read \u2014 and NOTHING in these tools ever narrowed it. Housekeeping's group 1 got away with it because looksBaseline() demands the platform prefix; group 2 (added at 10593) groups by CONTENT HASH and has no opinion about names, so every Windows policy the tenant carries twice arrived in the macOS tool offering to delete it. Compare's duplicate and extra rows had the same hole. HIGH because the surface it showed up on was a DELETE list: the refusals held (every one of those rows was assigned, so none could be ticked), but a tool proposing to delete another platform's policies is one unassigned duplicate away from doing it. A policy's platform is now settled ONCE, in vms() \u2014 the single place the read becomes policies \u2014 so Compare, Import, Rename, Export and Housekeeping all inherit it. The order is: the surface where that is single-platform by definition (deviceShellScripts is macOS, deviceHealthScripts and deviceManagementScripts are Windows, and none of them says so in any field), then what the policy declares (`platforms`, `platform`, @odata.type) through T05's own normPlatform so this tool and the documenter cannot disagree about one policy, then NOTHING \u2014 and nothing means keep it, because a platform that cannot be established is not evidence the policy belongs elsewhere.",
      test: [
        "THE REPORT: cloudfellows.dev, \ud83c\udf4e macOS baseline, \ud83e\uddf9 Housekeeping. No `Win -`, `WIN-` or OIB row appears at all. Before this build there were at least seven.",
        "Same tenant, \ud83e\ude9f Windows baseline, Housekeeping: those Windows rows ARE there, grouped as before, and no MACOS row is.",
        "Compare on both: the macOS tool's table carries no Windows policy in any status \u2014 check `extra`, `duplicate` and `unversioned` in particular, since those are the rows that come from the tenant rather than the catalog.",
        "\u2699 a script row on each tool and confirm the surface it names is that platform's.",
        "A policy whose platform genuinely cannot be established (a custom OMA-URI profile with no platforms field) is still LISTED in both tools rather than vanishing from both \u2014 that is the deliberate half of the rule and the one that would be missed.",
        "\ud83d\udce4 Export on cloudfellows.dev: the counts per surface drop by whatever the other platform contributed, and the catalog that comes out is unchanged from 10598's (Export already filtered by the name prefix, so this should be a no-op there \u2014 if it is not, say so).",
        "Headless: tests/platformbaseline engine 181/181, screen 216/216. Both new blocks were mutation-checked: removing the gate turns the screen suite red.",
      ],
      files: ["js/platformbaseline.js", "tests/platformbaseline/engine.test.js", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 170, title: "\ud83c\udf4e T24 + \ud83e\ude9f T27 \u2014 the community baseline is a comparison source on the reference tenant only",
      tools: ["T24 macOS baseline", "T27 Windows baseline"], builds: [10599], risk: "medium",
      why: "Mihai, 8 Sep: \u201cintune-my-macs should only be shown in cloudfellows. other tenants is vs the catalog only. in cloudfellows the options to update the catalog from intune-my-macs.\u201d This corrects \u00a74.1 of the design, which had the community catalog on the picker everywhere and even defaulted the reference tenant to it. It reads as a restriction and is the opposite: the community baseline is an UPSTREAM, not a baseline anybody deploys from \u2014 the reference tenant compares its own catalog against it, imports what is wanted, curates and re-exports, and what a customer tenant is measured against is the curated result. Offering that tenant a second, uncurated source was offering a different answer to the same question with nothing on the screen to say which one counted. The picker now carries it on the reference tenant only, and says where it went. The catalog is still LOADED on every tenant and deliberately so: \u270f\ufe0f Rename reads it to know which names belong to the community and must be kept verbatim, and that rule holds wherever OIB's own deployer might come back \u2014 it is the source picker it leaves, not the session. MEDIUM: it removes a capability customer tenants had since 10571 (importing OIB directly). If anybody was relying on that, this is the build that stops them, and the answer is that the reference tenant imports it, curates it and ships it in the catalog.",
      test: [
        "cloudfellows.dev, either tool: the source picker shows \ud83e\uddec CloudFellows, the community baseline, and \ud83d\udcc4 File\u2026 \u2014 unchanged. Fetch latest from github.com still works and \ud83d\udcc1 Community folder (zip) still writes baseline/community/<id>/.",
        "Any other tenant: the picker shows CloudFellows and File\u2026 only, with one muted line saying the community baseline is a reference-tenant source and a `why` button that opens \u2753 How it works.",
        "That pane explains it in full and says the catalog is the curated result.",
        "\u270f\ufe0f Rename on a NON-reference tenant that has OIB deployed: the OIB policies are still listed as `kept` with the deployer reason, and no convention name is proposed for them. This is the check that the catalog is still loaded \u2014 if these rows changed, the gate went too far.",
        "\ud83d\udce5 Import on a customer tenant creates from the committed catalog as before.",
        "Sign out of cloudfellows.dev and into a customer tenant without reloading: the picker loses the community entry and the comparison re-cuts against the catalog (the session is dropped on sign-out since 10588, so this should be clean).",
        "Headless: engine 181/181, screen 216/216; mutation-checked (offering it everywhere turns the screen suite red).",
      ],
      files: ["js/platformbaseline.js", "tests/platformbaseline/screen.test.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 169, title: "\ud83d\udd10 T01 \u2014 Remove-TunoUserInstalledApps 1.0.1: single pick works, loaded hives unload",
      tools: ["T01 AppLocker"], builds: [10598], risk: "low",
      why: "First run on CPC-mihai-FK1D1: choosing entry 2 threw 'Count cannot be found' (scalar under StrictMode), and the logged-off admin's hive answered Access is denied on reg unload (provider handles). Registry reads moved to Microsoft.Win32.RegistryKey with explicit Close; array wrappers; unload retried five times.",
      test: [
        "Menu with two entries, type 2: the uninstaller runs (no red line); after the run the entry is gone from that user's hive and the menu rescans.",
        "A logged-off user's hive is loaded for the inventory and unloads cleanly at exit — no WARN, and no HKU\\S-1-12-1-… left mounted.",
        "check-script-versions green.",
      ],
      files: ["scripts/Remove-TunoUserInstalledApps.ps1", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 168, title: "\ud83d\udd10 T01 \u2014 Clear-TunoAppLockerPolicy 1.2.1 names the real MDM groupings; health check header corrected",
      tools: ["T01 AppLocker"], builds: [10597], risk: "low",
      why: "Follow-up to 167: the cleanup's grouping list came from the second folder level of the CSP cache (the CSP area GUID), same wrong assumption as the scanner. Log-only change; the removal path is unchanged.",
      test: [
        "Clear-TunoAppLockerPolicy.ps1 on a device with an Intune AppLocker profile: FOUND line names AppLocker-<guid>, not 36486506-BDC9-4FF1-BA75-745721C6A371.",
        "check-script-versions green.",
      ],
      files: ["scripts/Clear-TunoAppLockerPolicy.ps1", "scripts/Get-TunoAppLockerPolicyHealth.ps1", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 167, title: "\ud83d\udd10 T01 \u2014 scanner 1.12.2 reads the AppLocker CSP cache at its real depth; a hollow grouping is never 'included'",
      tools: ["T01 AppLocker"], builds: [10596], risk: "medium",
      why: "Mihai, 7 Sep: judging against the device's effective policy showed 43 breaks and all Microsoft coverage off while the Intune Exe collection carried everything. The bundle had sources.mdm = [{ grouping: <CSP area GUID>, types: [] }] and the cmdlet-only note: the cache walk was three levels deep against a six-level layout. Read-only change in the scanner; T01 stops calling an empty grouping included.",
      test: [
        "Scanner 1.12.2 elevated on a device with an Intune AppLocker profile: the bundle's effectivePolicy.sources.mdm names the real grouping (AppLocker-<guid>) with its types, the note says merged, and the draft judged as the effective policy carries the Intune rules (coverage green, breaks in single digits).",
        "A 1.12.1 bundle with types: [] loaded in T01: Evidence says the cache is present but nothing was read and names 1.12.2; the What breaks? note says the same with the layout.",
        "check-script-versions green; scan-intune suite green (3 new).",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 166, title: "\ud83e\uddea The baseline suites are tracked \u2014 tests/platformbaseline/, npm test, and CI on every push",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10595], risk: "low",
      why: "Finding 13 of the T24 review \u2014 the last of the design's eight steps. Every headless suite in this repository has lived in _to_delete/, untracked, on one laptop: nothing but that laptop could tell whether a commit broke one, which is exactly how several of them drifted red without anybody noticing (graph-read-tests carries twelve failures at 10587, before any of this work; layout-tests throws on a missing crypto in its own harness). The baseline suites move into tests/platformbaseline/ as two files \u2014 an engine suite (159 assertions: matching order, similarity, canonical bodies, hashes, catalog loading and refusal, Housekeeping's two groups, Rename's proposals) and a screen suite (196: the session and sign-out, the rail, the card filters and the search, the panes, the popout, and the bookkeeping every build owes) \u2014 each block named for the finding or section it defends, so a red line says which RULE broke rather than which line moved. `npm test` runs them; .github/workflows/tests.yml runs the same thing on every push to beta and main, syntax-checking every source file first. A new suite dropped into tests/<tool>/ as *.test.js is picked up without editing either. LOW: it adds no behaviour and touches no tool. The one thing to look at is package.json arriving in a repository that has deliberately never had one \u2014 it declares jsdom for the suites and nothing else; TUNO is still static files with no build step and nothing in it is served.",
      test: [
        "Fresh clone, `npm install && npm test`: two suites, 355 assertions, exit 0.",
        "Break something on purpose \u2014 change SIMILARITY_MIN to 0.5 \u2014 and confirm the engine suite fails with the assertion that names finding 8, and `npm test` exits non-zero.",
        "Push the branch and watch the Actions run go green; confirm it also runs on a pull request into beta.",
        "GitHub Pages still serves the site unchanged \u2014 package.json and tests/ are files in the repo, not part of the page.",
        "index.html loads no new script; the ?v= count is still 47.",
        "The scratch suites in _to_delete/ still run by hand as before, and _to_delete/pb-tests.js now just points at the tracked pair rather than being a second copy of it.",
      ],
      files: ["tests/run.js", "tests/platformbaseline/harness.js", "tests/platformbaseline/engine.test.js", "tests/platformbaseline/screen.test.js", "package.json", ".github/workflows/tests.yml", "CLAUDE.md", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 165, title: "\ud83d\udcc4 T05 + \ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the shared read covers legacy endpoint security, macOS custom attributes and ADE tokens; bodies on every surface",
      tools: ["T05 Documenter", "T27 Windows baseline", "T24 macOS baseline"], builds: [10594], risk: "high",
      why: "\u00a73 of the T24/T27 design \u2014 step 7 of eight, and the only one that touches T05's collect(), the single read every tool goes through. Three surfaces join it: legacy endpoint security intents (with their settings), macOS custom attribute shell scripts, and Apple enrolment program tokens. Intents in particular closes a real hole \u2014 an endpoint security policy authored before the settings catalog existed was invisible to every tool reading through collect(), and the baseline tools reported it missing. Policy bodies now ride on EVERY surface the read covers rather than the three that happened to arrive whole from a list read, so the hash, the diff, Export and Import work on scripts, remediations, custom attributes, enrolment configurations, Autopilot profiles and update rings. TWO DECISIONS MIHAI TOOK ON 4 SEP, both against making everybody pay: (1) script bodies are OPT-IN \u2014 Graph does not return scriptContent in a list read and a GET per script is real traffic seven tools share this cache with, so `collect({bodies:true})` and a 'with script bodies' tick buy it and nobody else does; (2) the three new surfaces DO appear in every tool that shares the read, because the alternative is two definitions of what the full read is. HIGH: T05, T19, T02, T06, T09, T14 and T22 all read through this, and every one of them will show three sections it did not before.",
      test: [
        "T05 \ud83d\udcc4 Documenter: the section picker has sixteen entries, the three new ones among them, all ticked; generate a Markdown document and the three sections are in it with their endpoints named.",
        "T05: a script's content is still REDACTED in the document whether or not bodies were read \u2014 that is the check that matters, because the body now exists in the read.",
        "T19, T02, T06, T09, T14, T22: open each after a fresh read and confirm nothing broke and the new surfaces appear where that tool lists surfaces. T02 in particular already reads intents separately \u2014 it should now show them twice or not at all; note which, it is the next build's job.",
        "Demo mode: the three sections render (the demo already answers intents and custom attributes; ADE answers an empty list on purpose \u2014 Contoso enrols by hand).",
        "\ud83e\ude9f/\ud83c\udf4e Read the tenant WITHOUT the bodies tick: the network tab shows no per-script GET, and a script row in Export reads 'its script body was not read \u2014 tick with script bodies and read again'.",
        "Read again WITH the tick: one GET per script appears, the script rows go green, and Export enables.",
        "Export with bodies on: baseline/<platform>/Scripts/ carries the script bodies; import one on a test tenant and the script is created on the right surface (a shell script to deviceShellScripts, a remediation to deviceHealthScripts) with its content intact.",
        "A driver update profile and an ADE token appear in Compare so the gap is visible, and Import refuses each by name with its own reason.",
        "A tenant with no Apple enrolment: the ADE surface reads empty, not failed \u2014 an empty answer and an unreadable one are different claims.",
        "PERMISSIONS: the new surfaces ask for scopes the registration already holds (config, scripts, service). Confirm no new consent prompt appears on a tenant that had consented before this build.",
        "Headless: pb-tests 355/355, t05-docs 311/311, t02-groupuse 258/258, policycache 30/30, demo 72/72, t04-backup 160/160, t06-device 220/220.",
      ],
      files: ["js/document.js", "js/policycache.js", "js/platformbaseline.js", "js/demo.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 164, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 only 'not found' verifies a delete; Rename re-checks at the write; Housekeeping's duplicate group",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10593], risk: "high",
      why: "Findings 3 and 6 plus \u00a74.5 and \u00a78.5 \u2014 step 6 of the design, and the one that touches both destructive acts. FINDING 3 is the worst bug in the review: Housekeeping's read-back after a DELETE was `try { back = await readOne(...) } catch { back = null }`, so a 429, a 403 or a dropped connection all read as 'gone' and the tool reported a policy deleted on the strength of an error it never inspected. Only GraphError.kind === 'notfound' verifies now; anything else is a distinct outcome, 'unverified \u2014 check manually', counted apart from the deletions in the result line. The dry run and the apply also re-read the copy that would be KEPT: the delete is only safe because a newer one is there, and checking only the candidate answers half the question. FINDING 6: Rename wrote a whole plan against one reading; it now re-reads the names in use at Apply, re-checks the target name immediately before each PATCH against a set that follows each rename, and re-reads the policy itself for drift \u2014 a policy renamed in the portal between dry run and apply is LEFT ALONE rather than renamed over. \u00a74.5 adds Housekeeping's second group, same body under a second name, listed and deliberately UNTICKED (flagged review when neither name is in the convention), while superseded copies stay ticked; and the exact copy the committed catalog keeps is refused. \u00a78.5/\u00a78.4: the community rename rule, read off whether the community has an identity token \u2014 intune-my-macs policies are proposed the full MACOS convention name (area from the upstream folder, release from the upstream's publication date), OIB policies never are. A proposal whose D/U cannot be read asks on the row and cannot be ticked until answered. HIGH: it changes what a delete reports and what a rename writes.",
      test: [
        "FINDING 3, the one that matters: dry-run and apply a Housekeeping delete while throttled (or revoke the read scope between the delete and the read-back if you can contrive it). The row must read 'unverified \u2014 check manually', NOT 'deleted', and the summary must count it separately. Then check the portal and confirm what actually happened.",
        "A normal delete on cloudfellows.dev still reads 'verified gone \u2014 the read-back could not find it'.",
        "Rename the KEPT copy in the portal between dry run and apply: the delete is refused with 'the copy that would be kept is now named \u2026'.",
        "Delete the kept copy in the portal between dry run and apply: refused with 'nothing to keep this in favour of'.",
        "FINDING 6: dry-run a rename, then in the portal give the target name to another policy. Apply: that row fails with 'a policy took this name since the dry run' and nothing is written for it; the other rows still go through.",
        "Dry-run a rename, then rename that policy in the portal to something else. Apply: the row fails with 'the policy is now named \u2026 so it was left alone' \u2014 and the portal name is unchanged.",
        "\u00a74.5: make two policies with identical settings under different names. Housekeeping lists them as a second group, NOT ticked, naming what each duplicates. Make neither wear the convention: the group is flagged review.",
        "A superseded copy (same key, older version) is still ticked by default.",
        "Try to tick the exact copy the committed catalog keeps: refused with its reason.",
        "\u00a78.5 on cloudfellows.dev macOS: compare against intune-my-macs, then open \u270f\ufe0f Rename. A matched policy is proposed 'MACOS - DCP - <upstream folder> - D - <upstream name> - R26.8 - v1.0' with the release from the upstream cut. On a settings-catalog surface it asks for the D/U first and the tick is disabled until you answer.",
        "\u00a78.4 on Windows: an OIB policy is listed as 'kept' with the deployer reason, and no name is proposed for it.",
        "A 'Win - DCP - Something' with no version at all is proposed a release and v1.0.0.",
        "Headless: _to_delete/pb-tests.js 326/326.",
      ],
      files: ["js/platformbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 163, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Export fails closed on an incomplete read, and the rows are chosen",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10592], risk: "medium",
      why: "Finding 2 \u2014 step 5 of the design. Export ran on whatever the read had: a surface that 403'd, a settings read that threw, a body that came back empty. None of it stopped the export, so baseline/**/catalog.json could be committed SHORT, and every other tenant then reads that short catalog as the baseline and reports as `missing` what cloudfellows.dev has had all along. A catalog cut from a partial read is worse than no catalog \u2014 it is confidently wrong, and it spreads to every tenant that reads the repository. Export is now disabled while anything is unknown, prints read-against-expected per surface and names every unexportable row with its own reason, and re-checks at the click as well as at the paint. \u00a74.4's selection arrives with it: a tick per policy and per surface; a policy wearing the prefix without a release tag is listed greyed with an \u270f\ufe0f Rename first button instead of being dropped in silence; and two policies whose canonical bodies are identical under different names are BOTH kept and listed in the README, because which name is the baseline is not a question an export can answer. Medium: it only ever refuses to write, and the refusal is the feature \u2014 but it will refuse on a tenant where a surface reliably 403s, and that is a permission conversation.",
      test: [
        "On cloudfellows.dev with a clean read: \ud83d\udce4 Export shows the per-surface table with read equal to expected everywhere, both buttons enabled, and the policy list ticked.",
        "Untick one policy and export the JSON: it is absent from policies[] and the count on the note line matches.",
        "Untick a SURFACE box: every row under it clears and the master box goes indeterminate.",
        "Force a failure: sign in with a role lacking one surface (or use a tenant without Autopilot). Export is DISABLED, the red block names that surface, and the note under the buttons says to read again.",
        "A policy whose settings read fails shows in red in the list with its reason and is not ticked; the buttons stay disabled until a clean re-read.",
        "A policy named 'Win - DCP - Something' with no release tag appears under 'wears the prefix but not the convention', is not exported, and \u270f\ufe0f Rename first switches to the Rename pane.",
        "Make two policies with identical settings under different names on the tenant, export: both are in the catalog, and the README has a 'Same content under two names' section naming both and pointing at Housekeeping.",
        "Regression: on a clean read the repo folder is byte-identical to the previous build's except for the new README section and the exported/build stamps.",
        "Headless: _to_delete/pb-tests.js 290/290.",
      ],
      files: ["js/platformbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 162, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Import plans the comparison's gap, and can assign what it creates to the PRE-PILOT groups",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10591], risk: "high",
      why: "Finding 4 and \u00a78.3 of the design \u2014 step 4 of eight, and the first one that adds a WRITE the tools did not make before. Finding 4: the plan was built from the whole catalog and filtered afterwards, so an `ahead` row (this tenant has a NEWER copy) could reach the create pipeline; the plan is the comparison's rows now, `missing` and `outdated` only, and an outdated row creates a NEW copy under the catalog name and leaves the older one for Housekeeping \u2014 Import still never PATCHes content. \u00a78.3 is the new write: a radio above the plan assigns each created policy to INT-SEC-D-PRE-PILOT or INT-SEC-U-PRE-PILOT by its own D/U token. The design's rules are followed exactly and each one is a refusal to be clever: the groups are LOOKED UP by exact display name, never created; a missing group is a WARNING and the import still runs unassigned, because refusing to import because a group is absent puts the tool's convenience ahead of the job; a policy whose D/U cannot be read is NOT guessed at (only surfaces that can target nothing but devices \u2014 Autopilot, enrolment, scripts, remediations, filters \u2014 fall back to D) and its row blocks the button until a person answers; and an assignment that fails after a successful create is reported as 'created, NOT assigned' and never rolled back. HIGH: it writes assignments, which is reach, and reach is the thing this suite is most careful about everywhere else. Needs Group.Read.All, which T02 already requests.",
      test: [
        "On a test tenant WITHOUT the two groups: dry run with 'Assign to the pilot groups' \u2014 the plan warns that both groups were not found and says the policies will be created unassigned. Apply: they are created, and the result line says none were assigned.",
        "Create INT-SEC-D-PRE-PILOT only. Dry run again: the warning names only the U group. Apply a plan containing one D policy and one U policy: the D policy is assigned to the device group, the U policy reports 'created, not assigned'.",
        "Create both groups. Dry run, apply: each policy is assigned to exactly ONE group, the right one, and the portal shows a single group assignment with no filter.",
        "A catalog policy whose name carries no D or U on a settings-catalog surface: the plan row shows a 'needs D/U' dropdown and the Create button is DISABLED while it is ticked. Pick one; the button enables.",
        "Switch the radio to 'No assignment' after a dry run: the plan is discarded and says to dry run again \u2014 the groups were looked up under the other answer.",
        "THE FINDING-4 CHECK: a tenant whose copy of a catalog policy is NEWER (an `ahead` row) must not appear in the plan at all. Bump a policy's version on the tenant above the catalog's and confirm.",
        "An `outdated` row: apply creates a SECOND policy under the catalog name, the older one is untouched, and \ud83e\uddf9 Housekeeping then offers to retire it.",
        "Select D and Select U tick only the rows of that kind.",
        "Regression: 'No assignment' behaves exactly as Import did before this build.",
        "Headless: _to_delete/pb-tests.js 261/261.",
      ],
      files: ["js/platformbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 161, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Compare absorbs Upstream; Jaccard replaces the overclaiming score; the cards become filters",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10590], risk: "high",
      why: "Findings 8, 10, 11 and 12 of the T24 review \u2014 step 3 of the design, and the one that changes what the screen looks like. Two of the four are real wrongness, not layout. FINDING 8: the similarity score was hits over the SMALLER set, so a one-setting policy inside a hundred-setting one scored 1.0 and was claimed as the same control; it is now Jaccard over the union with a 0.6 floor, an anchor (the same template family or @odata.type \u2014 a compliance policy can no longer match a configuration profile), one-to-one assignment, and a `review` status when the runner-up is within 0.05, which claims nothing and says so. And the four-pass order (token, key, content hash, similarity) now runs for the REPO catalog too \u2014 it ran for community catalogs only, so a repo policy renamed on a tenant read as `missing` and Import made a second copy of it. FINDING 11: Compare and Upstream merge into one screen with a source picker; the status cards become filters defaulting to what needs attention; a search box, a surface filter and a D/U filter join them; the gap report prints the FILTERED table, because a report that quietly widens the filters is a different document from the screen. FINDING 10: the rail was divs with role=button and a click handler, so Enter and Space did nothing and the tool was mouse-only \u2014 native buttons with aria-selected. FINDING 12: index.html's three paragraphs about each tool went stale (by 10576 the page described a matching rule the code had stopped using) and are replaced by SPEC.help, rendered on the screen's own How it works pane. Every row also gains the \u2699 settings view (\u00a710) \u2014 Docs.popoutHtml, no second renderer \u2014 and Rename and Housekeeping lose their reference-tenant gate, which the design never had. HIGH: the whole screen is re-parented and the matcher rewritten; the tenant-facing acts are unchanged in mechanism but reach them through new rows.",
      test: [
        "MOCKUP NOTE: the layout was not mocked separately \u2014 the design document specifies \u00a74.1 to the row, and Mihai approved it. If the shape is wrong, that is a design change, not a build correction.",
        "Open \ud83e\ude9f signed in: one rail, native buttons \u2014 tab to a rail entry and press Enter, then Space: both switch the pane. Order is Compare, Import, Rename, Export (reference tenant only), Housekeeping, then How it works below the line.",
        "Compare lands with the source picker on top and the needs-attention cards pressed. Click Match: its rows appear. Click Missing: its rows go. Show everything clears them all.",
        "Type in the search box: the rows narrow and the box KEEPS FOCUS and its text (the toolbar is not re-rendered). Same for the surface and D/U selects.",
        "\ud83d\udcdd Gap report with filters on: the Markdown contains exactly the rows on the screen and says it is the filtered table.",
        "THE REGRESSION THAT MOTIVATED THE ORDER CHANGE: on cloudfellows.dev, a repo-catalog policy renamed on the tenant must now read Match (by content), not Missing. Check the Windows catalog rows that were renamed.",
        "A tenant carrying the same policy under two names shows one Match and one Duplicate, the duplicate naming its twin; \ud83e\uddf9 Housekeeping is where it goes.",
        "\u2699 on a Match row opens the documenter's popout for the tenant's copy; \u2699 on a Missing row opens the CATALOG's copy and says the policy is not in this tenant; \u2197 on a Differs row opens the diff.",
        "\ud83e\udde9 Community: Fetch latest from github.com still works and the button's sentence describes what it actually does; on the reference tenant \ud83d\udcc1 Community folder (zip) writes baseline/community/<id>/.",
        "\ud83d\udcc4 File\u2026 loads a catalog; a bad one is refused whole with its reasons and nothing from it appears.",
        "On a NON-reference tenant: Export is absent from the rail; Rename and Housekeeping are present and work (this is the design's change, \u00a74).",
        "\u2753 How it works names the matching order, every status, each act and the platform's own rule; the tool's card at the top of the page no longer explains any of it.",
        "Headless: _to_delete/pb-tests.js 233/233.",
      ],
      files: ["js/platformbaseline.js", "js/macbaseline.js", "js/winbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 160, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 one canonical body, a content hash per policy, catalog schema 2 and a loader that refuses",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10589], risk: "high",
      why: "Findings 5 and 9 of the T24 review \u2014 step 2 of the design's eight. Finding 5 is a data-handling problem, not a tidiness one: three different cleaners meant 'the policy without the tenant's bookkeeping', they disagreed, and the one that wrote baseline/**/catalog.json to a PUBLIC repository kept object ids, created and last-modified stamps, assignments, roleScopeTagIds, supportsScopeTags, settingCount and creationSource. canonicalBody(section, body) is now the single rule the hash, the diff, the export cleaner and the tests all read; all 127 files under baseline/ were re-cut through the engine's own functions, so what is committed and what \ud83e\uddec Export produces still cannot drift. The name and the description come OFF the body \u2014 a renamed copy must hash the same, or Housekeeping and the community match cannot see it \u2014 and ride the row instead, which is what keeps the OIBID token reaching a created policy (\u00a78.2). Finding 9: the catalog claimed almost nothing and the loader checked almost nothing, on a file Import creates tenant policies from. Schema 2 declares platform, catalogId and surfaces; the loader validates all of it plus every policy's section and refuses a bad file WHOLE with its first three reasons; and every body carries a SHA-256 that is recomputed on read, so a body edited after export is flagged tampered and can never be imported. The release stops being the hardcoded 'R26' and is derived from the policies, with releaseMix beside it \u2014 which immediately surfaced that the Windows catalog holds R27.1 \u00d72 and R26.2 \u00d73 next to R26.6 \u00d732, a mix the old label hid. HIGH because every catalog file in the repository changed and Import reads them.",
      test: [
        "git diff --stat on baseline/: 127 files, and no committed body contains id, createdDateTime, lastModifiedDateTime, assignments, roleScopeTagIds, supportsScopeTags, settingCount or creationSource any more.",
        "Open \ud83e\ude9f on any tenant: the catalog line reads the DERIVED release (R27.1 for Windows, R26.9 for macOS) with the mix chip beside it, and the comparison table is the same as it was at 10588 \u2014 the re-cut changed the bodies' packaging, not which policies match.",
        "On the reference tenant, \ud83e\uddec Export \u2192 \ud83d\udcc1 Repo folder, unzip over the repo: git says nothing changed except `exported`, `build` and the timestamps. That is the byte-identical rule, and it is the check that the browser and the generator still agree.",
        "Import an OpenIntuneBaseline policy on a test tenant and read the created policy's description in the portal: the OIBID:<guid> token is there. Without it OIB's own deployer can never update what TUNO created.",
        "Hand-edit one body in baseline/windows/catalog.json, reload: that row is refused by Import with 'its body does not match the hash the catalog carries', and the rest of the catalog still works.",
        "Change `platform` in baseline/macos/catalog.json to windows, reload \ud83c\udf4e: the screen says the catalog was refused and names the reason; NOTHING from that file is loaded.",
        "A schema-1 catalog file (git show HEAD~1:baseline/windows/catalog.json) loaded through \ud83d\udcc4 Load a baseline file is refused with the schema reason \u2014 old exports do not silently half-load.",
        "Headless: _to_delete/pb-tests.js 170/170.",
      ],
      files: ["js/platformbaseline.js", "js/macbaseline.js", "js/winbaseline.js", "baseline/", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 159, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the tenant's data does not survive sign-out; the reference-tenant gate moves to the tenant ID",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10588], risk: "high",
      why: "Findings 1 and 7 of the T24 review (beta 3be5a06), which the T24/T27 design applies to both tools because the code is shared \u2014 step 1 of its eight. Finding 1 is a real leak, not a tidy-up: sign-out called PolicyCache.clear() and nothing else, so a baseline screen that had already landed a read kept ITS copy \u2014 the comparison, the import/rename/housekeeping plans, the community catalog fetched from github.com \u2014 and rendered the previous tenant's policy names to whoever signed in next. On a consultancy laptop that is one customer's estate shown to another, which is why this is high and not medium. Every tenant-derived field now lives in one session object keyed by the tenant id that produced it; app.js fires tuno:signout and each tool drops its own state beside where that state lives, onShow() drops it again if the id moved without an event (a demo entered from a signed-in session), and every Apply refuses a plan whose tenant is no longer the signed-in one. Finding 7 is the display-name gate: isCfdev() matched a UPN domain or the substring 'cloudfellows' in an org display name, so any tenant that named itself so was offered the acts that author the baseline. The comparison moves to the immutable Entra tenant ID (MSAL's tid). CFDEV_TENANT_IDS SHIPS EMPTY ON PURPOSE FOR THIS ONE BUILD \u2014 the GUID is not in the repository and a guessed value would lock the reference tenant out of its own acts \u2014 so this build PRINTS the signed-in tenant id in the badge tooltip and on both baseline rails, and the name check still answers meanwhile and says that it did. Filling the list is a one-line edit in the next build, and the name half goes with it.",
      test: [
        "Sign in to cloudfellows.dev, open \ud83e\ude9f or \ud83c\udf4e: the rail's top line names the tenant, prints its GUID under the name, and badges 'reference tenant (by name)'. Copy that GUID \u2014 it is what CFDEV_TENANT_IDS wants.",
        "Hover the \ud83e\uddea cfdev header badge: the tooltip carries the same id and says the gate is still name-based because the list is empty.",
        "THE LEAK: sign in to any tenant, open a baseline tool, let it read (the comparison table fills). Sign out. Sign in to a DIFFERENT tenant and open the same tool: no row, no count and no policy name from the first tenant appears before the new read lands. Before 10588 the old comparison was still on the screen.",
        "Same again without signing out: sign in, read, then follow the demo link \u2014 the baseline screen shows no real-tenant rows.",
        "Dry-run an import on tenant A, sign out and into tenant B, return to the tool and click Create: it refuses with 'the signed-in tenant changed since this plan was made' and writes nothing. Repeat for Rename, Housekeeping and Upstream.",
        "On a NON-reference tenant, Export / Upstream / Rename / Housekeeping are absent from the rail as before; the badge does not render.",
        "Regression: on the reference tenant every act still works end to end \u2014 read, compare against both catalogs, fetch the community catalog from github.com, dry run and apply an import, a rename and a housekeeping delete.",
        "Headless: _to_delete/pb-tests.js 83/83, _to_delete/cfdev-tests.js 31/31.",
      ],
      files: ["js/platformbaseline.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 158, title: "\ud83d\udd10 T01 \u2014 Remove-TunoUserInstalledApps.ps1; What breaks? lists user-profile blocks with a publisher fix; __PSSCRIPTPOLICYTEST_ labelled expected",
      tools: ["T01 AppLocker"], builds: [10587], risk: "medium",
      why: "Mihai, 4 Sep, first enforced device: users cannot uninstall their per-user apps any more (the uninstaller in the profile is what Exe refuses) and an admin needs a menu for it; PowerToys was blocked and What breaks? had folded it into a by-design count with no way to allow it; the PowerShell CLM probe showed up as a block. The script changes nothing in the policy; the What breaks? change adds a collapsed list and a publisher-only fix for signed rows.",
      test: [
        "Elevated shell on a device with a per-user install: the menu lists it under the right user with version, publisher and ~\\AppData\\Local\\… location; picking it runs the uninstaller and the entry leaves the hive; a logged-off user's hive is loaded and unloaded (no HKU\\S-1-5-21-… left mounted).",
        "Per-user MSI: msiexec answers 1605, the script says why and offers leftover removal; the guard refuses a folder shallower than three levels inside the profile or named AppData/Local/Roaming/Programs.",
        "Non-elevated run exits 1 with the message; -List changes nothing; -Name X -Force without -Leftovers never deletes a folder.",
        "What breaks? with a bundle carrying a signed block under \\Users\\: the by-design details lists it with Allow by publisher and no path button; an unsigned one shows the removal hint; the Enforce gate is unchanged by by-design rows.",
        "A bundle with __PSSCRIPTPOLICYTEST_ events: one probe line, none in gaps, none in Evidence's refused list, counted in the footer and the markdown report.",
        "Help & scripts: ten downloads, nine companions in five groups, each row followed by its note; every irm command populated; check-script-versions green with the new script.",
      ],
      files: ["scripts/Remove-TunoUserInstalledApps.ps1", "scripts/README.md", "js/applocker.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 157, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 rename and delete on every surface the read covers (the read stamps __surface); lenient versions; ticks on the import plan",
      tools: ["T27 Windows baseline", "T24 macOS baseline", "T05 Documenter"], builds: [10586], risk: "medium",
      why: "Mihai, 2026-09-04: Rename refused scripts, remediations and enrolment configurations with 'no rename path here'; the import plan lacked select/deselect. The refusal was honest but avoidable: the read did not say which of three endpoints a script came from. One additive line in T05's collect stamps __surface on every item of a multi-surface section (beside __detail; nothing rendered changes), and the rename/delete paths use it; enrolment and Autopilot get their PATCH with @odata.type. Medium: T05's read object gains a field (additive), and PATCH/DELETE reach more surfaces on cfdev only.",
      test: [
        "cloudfellows.dev, \u270f\ufe0f Rename after a fresh read: the remediations, PowerShell scripts, enrolment restrictions and update profiles that read 'no rename path' now propose; 'v.3.7' proposes '- R26.1 - v3.7'. Dry run names the endpoint per row (deviceHealthScripts, deviceEnrollmentConfigurations \u2026); Rename: each renamed in the portal, read back.",
        "cloudfellows.dev, an item from the cached sign-in read (older than this build) reads 'the read did not say which endpoint \u2026 re-read the tenant'; after Read it proposes.",
        "Any tenant, Import dry run: rows ticked, select none disables the button at 0, untick one and the button counts down; Create creates only the ticked.",
        "T05: a document renders exactly as before (the stamp is not a row).",
        "Suites (outside the repo): platformbaseline-tests.js 167/167 (11 new), baseline-dom-tests.js 94/94 (4 new)."
      ],
      files: ["js/platformbaseline.js", "js/document.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 156, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the community comparison matches by content (\u2260 Differs bucket); Import creates only the gap; plan name column fixed",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10585], risk: "medium",
      why: "Mihai on cloudfellows.dev, 2026-09-04: OIB read 72 missing against the tenant that had deployed it under CloudFellows names \u2014 'the compare should match on settings, not on name'. The Upstream act already knew how; the comparison now uses the same rule (token \u2192 name \u2192 content, one overlap floor) and gains a Differs bucket with the per-setting diff. Import was creating the whole catalog with a name collision stop, which would have made copies of everything matched by content \u2014 it now creates only the comparison's missing/outdated rows. Medium: a production tool's verdicts change (fewer missing, some differs) and its import plans less \u2014 both in the honest direction. Also fixes the blank name column in the import plan (target vs newName), inherited from T24's original. Built as 10576 against the 10575 tip; renumbered 10585 when it landed after the T01 rethink builds 10576\u201310584.",
      test: [
        "cloudfellows.dev, T27 with OIB selected: the 72 missing become mostly up to date / differs / outdated with 'content NN%' chips; open a Differs row's 'what differs' \u2014 the values named are the ones cfdev changed on purpose; Missing is now the OIB policies cfdev really does not carry. \ud83d\udcdd Gap report shows the diff lines under each Differs row.",
        "cloudfellows.dev, T27 Import with OIB selected: dry run plans only the Missing/Outdated rows and says 'N of 73 left alone \u2014 the comparison found them present'; the plan's first column shows names.",
        "Any tenant, T27 with OIB, before a read: Import dry run plans the whole catalog (no comparison yet) with the collision stop \u2014 unchanged.",
        "T24 with intune-my-macs: a tenant policy carrying the same settings under a MACOS name reads present by content.",
        "Suites (outside the repo): platformbaseline-tests.js 156/156 (9 new: content match ok/differs/outdated, token and name still first, CloudFellows untouched, report lines), baseline-dom-tests.js 90/90 (the import plan scoped to the gap)."
      ],
      files: ["js/platformbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 155, title: "\ud83d\udd10 T01 \u2014 MDM store Policy files decoded robustly (health check 1.1.1, scanner 1.12.1)",
      tools: ["T01 AppLocker"], builds: [10584], risk: "low",
      why: "Mihai, 4 Sep: the health check's first Live Response run printed mode=? rules=? for all four Intune-delivered collections; the catch swallowed the reason. Both readers now sniff BOM/UTF-16, strip NULs, cut to the first tag, fall back to a regex count, and log reason + encoding + first bytes when parsing fails. Read-only; nothing in the policy path changes.",
      test: [
        "Run Get-TunoAppLockerPolicyHealth.ps1 1.1.1 on the 4 Sep device: MDM store lines carry a real mode and rule count (Script Enabled, 14) or, failing that, a WARN naming the reason, the encoding and the first 16 bytes.",
        "Scanner 1.12.1 on the same device: the bundle's effective policy sources.mdm lists the grouping with per-type mode and rule counts; warnings carry the decode reason when a file cannot be parsed.",
        "check-script-versions: both scripts bumped; every script stamped 10584.",
      ],
      files: ["scripts/Get-TunoAppLockerPolicyHealth.ps1", "scripts/Invoke-TunoAppLockerScan.ps1", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 154, title: "\ud83d\udd10 T01 \u2014 Get-TunoAppLockerPolicyHealth.ps1 joins the companions; each script's note under its own row",
      tools: ["T01 AppLocker"], builds: [10583], risk: "low",
      why: "Mihai, 3 Sep: add his policy health check as a download, and put each script's explanation under that script instead of one paragraph for all. The script is taken into the house with its verdict fixed: its first run said 'AppID never processed it' on a device that was blocking scripts, because it trusted Get-AppLockerPolicy -Effective (which does not see CSP policy) and a 0 x 8001 count from an EXE and DLL log that had rolled over. It now reads the MDM store per collection, reports the log's reach, and takes AppLocker decisions after the store's newest write as proof the policy runs.",
      test: [
        "Help & scripts: nine downloads; under the fold eight companions in four groups, each row followed by its own note; every irm command populated; the fold starts closed.",
        "Run Get-TunoAppLockerPolicyHealth.ps1 on the 3 Sep device via Live Response: the MDM store lines carry mode and rule count (Script Enabled, 14), the effective summary is labelled local+GPO only, the log-reach line says whether EXE and DLL rolled, and the verdict reads RUNNING when a decision was logged after the 13:17 write.",
      ],
      files: ["scripts/Get-TunoAppLockerPolicyHealth.ps1", "scripts/README.md", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 153, title: "\ud83d\udd10 T01 \u2014 the scan's effective policy includes the Intune-delivered (CSP) policy",
      tools: ["T01 AppLocker"], builds: [10582], risk: "medium",
      why: "Mihai, 3 Sep: the deployed profile carries a Script collection with 14 rules and the device blocks scripts (8007), yet the scan's effective policy said Script had no rules. Get-AppLockerPolicy -Effective does not include CSP-delivered policy; it lives in the System32\\AppLocker\\MDM cache the cleanup script already knew about. Scanner 1.12.0 reads and merges it (Get-MdmAppLockerPolicy, Merge-AppLockerXml) and T01 names the groupings. Medium: the merge is unit-tested on Linux against a fake cache; the real cache layout (enrollment\\grouping\\type\\Policy, RuleCollection per file) is from Clear-TunoAppLockerPolicy's own reading of it and needs one real scan to confirm.",
      test: [
        "Run scanner 1.12.0 elevated on the device with the deployed profile: the console prints the merge note and 'MDM grouping AppLocker-…: EXE, MSI, Script, StoreApps'; the bundle's effectivePolicy.xml carries the Script collection with its 14 rules and effectivePolicy.sources.mdm names the grouping.",
        "Upload it: the Evidence row says 'effective policy includes Intune grouping AppLocker-…'; switch to the effective policy: the note lists the grouping and its collections, Script is no longer empty, and What breaks? judges against it.",
        "Upload the 3 Sep 11:51 bundle (scanner 1.11): the Evidence row and the note say its effective policy was read without the Intune part and point at 1.12.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/README.md", "js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 152, title: "\ud83d\udd10 T01 \u2014 the tenant check runs itself; the rules bar (chips + filter); \"to decide\" on every counted finding",
      tools: ["T01 AppLocker"], builds: [10581], risk: "low",
      why: "Mihai, 3 Sep: 'why can't this be automated' (the Evidence row telling him to go press Check against the tenant), 'the rules section should also be easy scrollable' (83 rules in four tables), and 'this should clearly say on the finding, in the same red, to decide' (the rail said 10 to decide; the rows did not). The check is a read with consent the tenant already gave, so it runs on policy load through Graph.silentScopes and never prompts; the rules bar is chips plus a DOM-only filter; the decide mark is the rail's own words and colour on the rows it counts.",
      test: [
        "Signed in to a tenant that has consented before: upload a bundle \u2014 within a second the Evidence row reads 'Deployed profile \u00b7 matched \u00b7 <name>' and Deploy says 'already deployed \u2014 this is an iteration', with no click and no consent prompt. Load a second policy: it is read again; re-render without a new policy: it is not.",
        "A fresh tenant (no consent yet): nothing is read silently; the Evidence row shows 'Check the tenant now', pressing it asks for the read once and fills the row.",
        "Policy \u2192 Rules: chips Exe/Msi/Script/Appx with counts and red nested-finding badges; a chip scrolls to its table; typing 'onedrive' in the filter leaves the OneDrive rules only and says 'N of M rules'; clearing restores all.",
        "Findings: every High/Medium row carries 'to decide' in the rail's red; the number of marks equals the rail's 'N to decide'.",
      ],
      files: ["js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 151, title: "\ud83d\udd10 T01 \u2014 DLL loads hidden by default on What breaks?; the effective policy explained as evidence",
      tools: ["T01 AppLocker"], builds: [10580], risk: "low",
      why: "Mihai, 3 Sep, on the 2 Sep bundle: 'the solution for now does not audit or enforce .dll, so in What breaks? we need to filter those out' \u2014 the device's effective policy carries the Managed Installer dummy rule in Dll, so a thousand Defender DLL audits became rows. And 'with the effective policy I see that scripts have no rules, but they should be there' \u2014 true of the device at 12:23 on 2 Sep: the merge it was running had an empty Script collection, i.e. the deployed profile had not reached it. The tool now hides DLL loads by default (toggle in the header, remembered) and explains the effective policy as evidence rather than letting it read as a broken draft.",
      test: [
        "Upload the 2 Sep bundle, What breaks?: the header carries 'Hide DLL loads (1015 events \u2014 no Dll collection in the draft)' ticked; no .DLL row anywhere; the scan card's refused list says how many DLL loads it hides.",
        "Switch to the device's effective policy on Evidence: the DLL loads stay hidden although that policy carries a Dll rule; the note above the gate explains the merge, names Script/Msi/Appx as empty and points at the generated rule set. Untick the toggle: the DLL rows appear and the rail count jumps; tick again and they go.",
        "Reload the page: the toggle state is remembered.",
      ],
      files: ["js/applocker.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 150, title: "\ud83d\udd10 T01 \u2014 the Policy screen's sections as sub-nodes on the rail",
      tools: ["T01 AppLocker"], builds: [10579], risk: "low",
      why: "Mihai, 3 Sep, on the rail: 'when viewing this policy make it easy to navigate between the sections' \u2014 Policy is the long screen (summary, add-rule, findings, coverage, rules, advanced) and the jump strip went with the rail. The sections are sub-nodes under the Policy node, each with the count that says whether it needs a look; the rail is sticky so they stay in reach.",
      test: [
        "Load the sample or a bundle: six sub-nodes appear under Policy (Summary \u00b7 Add a rule \u00b7 Findings N to decide \u00b7 Microsoft apps \u00b7 Rules N \u00b7 Advanced); clicking Findings scrolls the card under the sticky header; clicking Advanced opens the fold.",
        "Switch to What breaks? or Deploy: the sub-nodes are gone; back to Policy: they return with current counts.",
      ],
      files: ["js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 149, title: "\ud83d\udd10 T01 \u2014 the deploy panel leads with what happened, an update in place moves the version, the loop strip on top",
      tools: ["T01 AppLocker"], builds: [10578], risk: "low",
      why: "Mihai's first round on the rail, 3 Sep, with a live tenant: the update in place worked but the panel still led with a bold Create button and reported it in one small line; the Enforce profile kept its name (V4.0.1 over V4.0.1 \u2014 10570's audit-pin applied to an update); gate 1 read \u2717 beside the profile it had found; and he asked for the loop strip at the top for visibility. Four fixes with one honest answer each; deploy suite grew a scenario that deploys two profiles under one grouping and updates the Enforce one.",
      test: [
        "Sign in, load a draft under a grouping that is already deployed, 🔎 Check against the tenant: the panel says 'already deployed \u2014 this is an iteration', Update it in place is the primary button on each matched profile, Create is behind the 'Not iterating' fold, gate 1 reads \u2713 with the audit profile's name.",
        "Update the Enforce profile in place with the name on the table equal to the deployed name: the PATCH carries the next version (V4.0.1 \u2192 V4.0.2), the portal shows the new name, the panel leads with the green 'Policy updated in place' banner naming it, the status line and the strip's Update profile station say so.",
        "Create the AuditOnly profile on a fresh grouping: the banner reads 'AuditOnly profile created' and the assign-to-pilot block follows it.",
        "The loop strip is above the rail on every screen; clicking Scan/Build/What breaks?/Deploy switches the rail to that screen and scrolls to the card.",
      ],
      files: ["js/applocker.js", "index.html", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 148, title: "\ud83d\udd10 T01 rethink, part 2 \u2014 the rail (Option B), and What breaks? replays ALLOWED events against the draft",
      tools: ["T01 AppLocker"], builds: [10577], risk: "medium",
      why: "Mihai, 3 Sep: 'the workflow of T01 has become a mess, very difficult to follow, not clear when to use what' \u2014 after an Enforce policy blocked scripts he believed were allowed. Two mockups (tabs vs rail) on 3 Sep; he picked the rail. Four screens, one at a time, on the shared ep-rail chrome; the counts on the nodes are the decisions left, the foot is the next act. The engine (audit, fixes, coverage, groupings, deploy panel, events harvest) is untouched \u2014 the shape around it changed, and one blind spot closed: What breaks? replays every event on the table including Allowed ones, which is the only question anyone has before Enforce and the one the tool never answered. Medium: a full re-parenting of the screen; every T01 suite is green and the real 3 Sep bundle renders the six expected rows, but the tenant-facing deploy flow was exercised headlessly only.",
      test: [
        "Open T01 signed out: Evidence is the screen on the table, the rail shows nothing yet / \u2014 / \u2014 / \u2014, the foot says to upload a bundle or pull from the tenant.",
        "Upload the 3 Sep bundle (TunoAppLockerScan-NLDBCD333C456A9-20260902-1423.json): it lands on Policy; the status line names the device and 'Enforce blocked \u2014 6 unresolved breaks'; What breaks? lists the four mapping scripts (ran OK, blocked by the draft, IT-TOOLS hint) and the two TUNO scripts from C:\\Temp; Accept block on the two TUNO ones drops the count to 4 and the rail follows; Allow by hash on a mapping script adds the rule and is one Undo away.",
        "Evidence says ProgramData not scanned for that bundle; a bundle from scanner 1.11.0 (ProgramData in scope) does not.",
        "Deploy: the deploy panel leads, the code panel follows full-width with its two tabs (Policy XML \u2014 for a GPO / Intune profile \u2014 the primary output); sign in, 🔎 Check against the tenant, create the audit profile, update in place \u2014 all as before 10577 (the deploy suite is 155/155).",
        "Help & scripts holds the scanner download, the folded companions, the Remediation deploy and the loop strip; every irm command is populated.",
        "Narrow window: the rail collapses to the chip strip like the other rail tools; no pane overflows.",
        "Start over returns to Evidence and clears the accepted blocks.",
      ],
      files: ["index.html", "js/applocker.js", "css/app.css", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 147, title: "\ud83d\udd10 T01 rethink, part 1 \u2014 the scanner writes one file (-WriteXml for GPO), and ProgramData is in the default scope",
      tools: ["T01 AppLocker"], builds: [10576], risk: "low",
      why: "3 Sep: an Enforce policy blocked the Intune drive/printer mapping scripts an admin believed were allowed. The deployed file was the scanner's own AppLockerRules-Enforce XML, which had never been through T01, and the scan had not looked at ProgramData where those scripts live. Both are design faults with one honest answer each: the scanner writes only the bundle unless -WriteXml is given (and then says the XML is unreviewed), and ProgramData is in the default -Scope. Part 2 \u2014 the rail layout (Option B, mockup 3 Sep), the What-breaks replay of ALLOWED events and one Enforce switch \u2014 follows as its own item.",
      test: [
        "Run Invoke-TunoAppLockerScan.ps1 v1.11.0 with no switches on a reference image: three roots are walked (Windows, Program Files, ProgramData), exactly one .json is written, the Next section says the rule set is in the bundle, and no AppLockerRules-*.xml appears.",
        "Run it again with -WriteXml: the two XML files appear and the console carries the UNREVIEWED note.",
        "Upload the bundle in T01: the evidence card shows ProgramData among the roots and the scripts under ProgramData are inventoried (hash rules for unsigned .ps1/.vbs).",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "scripts/README.md", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 146, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 the folder is the catalog: baseline/**/catalog.json read from the site, the js/*Data.js copies gone",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10575], risk: "medium",
      why: "Mihai, 2026-09-03: 'I see baseline/windows in the repo, also on GitHub \u2014 why is this not read as the catalog?' It should have been: 10574 wrote the same catalog twice (js data file for the app, folder for people). Now the app fetches baseline/<platform>/catalog.json and baseline/community/<id>/catalog.json from its own origin when a baseline tool opens \u2014 connect-src 'self' allows it, no CSP change \u2014 and the four data files (1.7 MB on every page load) are deleted. Medium: a production tool's catalog now arrives by fetch instead of by script tag; the screen waits for it and says so; a 404 is reported on the catalog line. GitHub Pages serves the folder as any file.",
      test: [
        "Any tenant, cold open of T24 and T27: a one-line 'Reading the catalogs from baseline/\u2026' then the seg with both catalogs and the rows 'not read'; DevTools shows two same-origin GETs per tool with ?v=10575, 200, and no *Data.js in the page's scripts.",
        "Rename baseline/windows/catalog.json locally and serve: T27 says the file answered 404 on the catalog line, offers Load a baseline file, and the community catalog still works (and vice versa).",
        "cloudfellows.dev: \ud83e\uddec Export \u2192 \ud83d\udcc1 Repo folder, unzip at the repo root: git status shows no change (catalog.json and README.md byte-equal to the committed ones \u2014 the suite proves it for both platforms).",
        "cloudfellows.dev: \ud83e\udde9 Upstream \u2192 Fetch the latest \u2192 \ud83d\udcc1 Community catalog folder: unzips to baseline/community/openintunebaseline/ with catalog.json and README.md.",
        "Suites (outside the repo): platformbaseline-tests.js 147/147 (loadCatalogs against a fake same-origin fetch incl. the 404 road; the committed folders byte-equal to repoFolder/communityFolder of the exports), baseline-dom-tests.js 90/90 (the cold open waits for the reads, both tools)."
      ],
      files: ["js/platformbaseline.js", "js/macbaseline.js", "js/winbaseline.js", "baseline/", "index.html", "README.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 145, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Housekeeping deletes the copies a re-cut left behind; Export writes the repo folder; the CloudFellows Windows catalog bundled",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10574], risk: "high",
      why: "Mihai, 2026-09-03: 'a housekeeping button where I can easily see which policies were updated or have a higher release and version number and easily delete them from the tenant', and 'make the export something I can easily put in a folder in the repo to be used as the baseline'. The two exports he sent carried the answer to both: macOS 100 policies of which 16 identities twice (15 re-cuts + the old duplicate), Windows 37 clean. HIGH because this is the baseline tools' FIRST DELETE \u2014 cfdev-only, dry-run-first, fresh per-policy read at plan and at delete time, assigned copies refused, read-back-that-fails as the proof \u2014 and because production's T24 catalog changes shape (newest per identity). The repo now carries baseline/macos and baseline/windows beside the data files, cut from one export through one function.",
      test: [
        "cloudfellows.dev, T24: \ud83e\uddf9 Housekeeping reads '18 old copies'; every group shows the R26.9 copy kept and the R26.6 copy under it; any old copy still assigned reads 'kept \u2014 assigned to N, move the reach first' with no tick. \ud83d\udce6 Back up first. Dry run: each ticked copy re-read; Delete: the portal shows them gone; the source line reads 'Housekeeping: 18 deleted'; Compare against the bundled catalog reads 82 up to date, no '2+ versions' chip.",
        "cloudfellows.dev, T24 then T27: \ud83e\uddec Export \u2192 \ud83d\udcc1 Repo folder (zip): unzip at ~/REPO/TUNO \u2014 baseline/<platform>/ and js/<platform>baselineData.js overwrite the committed ones with no diff when the tenant is unchanged (the proof the bundle was cut from the same road).",
        "Any tenant, T27: the seg shows \ud83e\uddec CloudFellows R26 \u00b7 37 and \ud83e\udde9 OpenIntuneBaseline v3.8 \u00b7 73; Import from CloudFellows creates the 33 importable (4 scripts refused on the row).",
        "The two R27.1 names on Windows: Mihai decides \u2014 rename on cfdev (\u270f\ufe0f proposes nothing for them, they wear a tag) or leave; either way re-export.",
        "Suites (outside the repo): platformbaseline-tests.js 139/139 (15 new: dedupe, repo folder, data file byte-equal to the bundle, housekeeping rules), baseline-dom-tests.js 87/87 (12 new: both catalogs on the seg, export buttons, the housekeeping act end to end against a fake Graph)."
      ],
      files: ["js/platformbaseline.js", "js/macbaselineData.js", "js/winbaselineData.js", "baseline/macos/", "baseline/windows/", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 144, title: "\ud83c\udf4e T24 + \ud83e\ude9f T27 \u2014 re-read after every write; one identity twice in the catalog pairs by exact version",
      tools: ["T24 macOS baseline", "T27 Windows baseline"], builds: [10573], risk: "low",
      why: "Mihai on cloudfellows.dev, 2026-09-03: 'just did a create missing for the macos. nothing changes, still saying missing 15' \u2014 the screenshot showed 15 missing AND 15 newer than baseline, the same fifteen: the fresh export carried each re-cut policy twice and compare() gave both tenant copies to the first row. And after any write the screen kept the read it had. Both corrections are in the engine both tools share; production's T24 has the same two behaviours. Correctness fixes with one honest answer each.",
      test: [
        "cloudfellows.dev, T24 with today's export loaded: Compare reads 0 missing, 0 newer than baseline, every duplicated identity up to date and wearing '2+ versions in the catalog'; retire an old copy in the portal, re-export, load \u2014 the chip is gone.",
        "Any tenant, T27 with OIB: Import dry run \u2192 Create N: the pane says 're-reading the tenant', the screen lands on Compare with 'Import: N created \u2014 re-read at HH:MM' on the source line and the N now up to date; the rail's Compare node dropped by N. Failures, if any, listed under Import.",
        "cloudfellows.dev, Rename the ticked: the list is re-cut from the fresh read (renamed rows gone, 'all stamped' on the rail when none remain).",
        "cloudfellows.dev, Upstream create: the source line reads 'Upstream: N created'; the Upstream pane keeps its own result.",
        "Suites (outside the repo): platformbaseline-tests.js 124/124 (7 new on duplicated catalog identities), baseline-dom-tests.js 75/75 (5 new on the re-read)."
      ],
      files: ["js/platformbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 143, title: "\ud83e\ude9f T27 + \ud83c\udf4e T24 \u2014 Rename stamps the release from the last-modified date; the repository is read from github.com in the browser (CSP widened)",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10572], risk: "medium",
      why: "Mihai, 2026-09-03: the cfdev tenant's Windows policies wear the convention but not the release tag \u2014 stamp it from the last-modified date, show the list, let him edit, one button; and read the upstream repository directly, no zip, everything in the browser. The rename is a write on a production tool's screen (T24 shares it) but cfdev-only and dry-run-first, hence medium. The fetch widens the CSP connect-src to api.github.com and raw.githubusercontent.com \u2014 a security-model change, documented in SECURITY.md, plain fetch with no credentials (Graph.call still refuses any host but graph.microsoft.com). Promote both or neither: the CSP line and the fetch buttons are one change.",
      test: [
        "cloudfellows.dev, T27: Read the tenant, open \u270f\ufe0f Rename \u2014 the rail says N to stamp; every 'Win - \u2026 - vX' without an Ryy.m is listed with its surface, last-modified date and the tag it earns; the proposed names are editable; 'Win - OIB - \u2026' rows read 'kept'; a name with no version reads 'not proposed'. Dry run: refused rows say why (convention, duplicate, collision). Rename the ticked: each policy renamed in the portal, read-back verified, the pane says the read is stale; Read the tenant \u2014 Compare against CloudFellows now finds them and the rail's Rename node says 'all stamped'.",
        "Any tenant, T27 Compare with OpenIntuneBaseline selected: \ud83c\udf10 Fetch the latest from github.com \u2014 the status counts the reads, the catalog line then says fetched, with the bundle's version and commit beside it, and the comparison re-runs against the fetched set; \u21a9 Back to the bundle restores it. Repeat until GitHub's limit trips: the refusal names the limit and the reset time, the bundled comparison is unaffected.",
        "cloudfellows.dev, T27 Upstream: Fetch the latest \u2014 the diff renders from github.com with the commit in the header; \u2b07 Community catalog file carries that commit and date. The zip road and 'Use the bundled' still work.",
        "T24: the same two acts on MACOS names and intune-my-macs.",
        "Security: in DevTools, no request to api.github.com or raw.githubusercontent.com carries an Authorization header; a self-hosted copy with the two hosts removed from the meta tag reports the refusal on the button and loses nothing else.",
        "Suites (outside the repo): platformbaseline-tests.js 117/117 (28 new: releaseOfDate/stampRelease, proposals per surface, OIB kept, fetch against a fake GitHub incl. the rate limit and a truncated tree), baseline-dom-tests.js 70/70 (21 new: rail node, rename table, collisions, stale plan, PATCH fields and read-back, fetch buttons, CSP line)."
      ],
      files: ["js/platformbaseline.js", "js/winbaseline.js", "js/macbaseline.js", "index.html", "SECURITY.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 142, title: "\ud83e\ude9f T27 Windows baseline \u2014 and the community baselines (OpenIntuneBaseline, intune-my-macs) beside CloudFellows in T24 and T27",
      tools: ["T27 Windows baseline", "T24 macOS baseline"], builds: [10571], risk: "high",
      why: "Mihai, 2026-09-03: 'the OpenIntuneBaseline should get the same treatment as the macOS baseline' \u2014 and 'check the autocheck and import features from the ENCA baseline for the Joey Verlinden baseline, add those to TUNO, also for macOS'. Two things, one build. T27 is T24 pointed at Windows (convention 'Win - SEC - App Control for Business - D - AllowAll - R26.6 - v3.0', cfdev already wears it); rather than a second copy of macbaseline.js the machinery moved to js/platformbaseline.js and each platform became a spec \u2014 which is why this item touches a PRODUCTION tool (T24) and carries high risk: same acts, same ids, same exports, but every line of it moved. The community catalogs are ENCA's Joey treatment Intune-side-out: bundled from the repos, compared on open, importable anywhere, names verbatim (Mihai: OIB can be maintained by TUNO or by OIB's own deployer, keeping the name is what makes that true); OIB's OIBID token identifies before the name. Layout picked off the mockup: Option A, one tool per platform with ENCA's catalog seg on the Compare and Import panes. NOT bundled yet: the CloudFellows Windows catalog \u2014 it needs the cloudfellows.dev export (T27 \u2192 Export), a follow-up build bundles it as js/winbaselineData.js.",
      test: [
        "T24 REGRESSION FIRST (production tool moved onto the engine): open \ud83c\udf4e macOS baseline on a tenant with MACOS policies \u2014 the cached read compares on open exactly as before, the four rail nodes carry the same counts, Export on cloudfellows.dev writes the same file shape (kind tuno-macos-baseline), Import dry run plans the same creates, the Upstream zip road still loads intune-my-macs. Then the new seg: \ud83e\uddec CloudFellows R26 \u00b7 82 and \ud83c\udf4f intune-my-macs \u00b7 21 above the cards; switching re-compares in place.",
        "T27 cold open on any tenant: the rail offers Compare \u00b7 Import; the seg shows \ud83e\udde9 OpenIntuneBaseline v3.8 \u00b7 73 only (no CloudFellows catalog bundled yet, said in the catalog line); 73 rows render with 'not read' on the tenant side, never 'missing'; the community line names the author, the repo and commit 4844247.",
        "T27 on a tenant with OIB deployed: \ud83e\ude9f Read the tenant \u2014 every deployed OIB policy reads up to date / outdated / newer by version; a policy RENAMED in the portal but still carrying OIBID:<guid> in its description is still matched and its row wears the OIBID badge with 'version unknown' (the name carries none); an OIB policy from an older release that v3.8 no longer ships reads 'not in baseline'; a Win - SEC - \u2026 - R26.x CloudFellows policy is NOT listed as an OIB extra.",
        "T27 Import from OIB (test tenant): dry run plans N to create with the verbatim 'Win - OIB - \u2026' names, the deployed ones skipped by the collision stop, the 3 WUfB driver profiles named as not importable; Create: the settings-catalog policies (endpoint security templates included), the 4 compliance policies and the WUfB rings + Endpoint Analytics appear in the portal unassigned, descriptions carrying their OIBID; Read the tenant again \u2014 every created one reads up to date.",
        "T27 gap report: \ud83d\udcdd Gap report (Markdown) downloads a table with the counts, '(by OIBID)' on token matches, and the would-be-imported list.",
        "cfdev gate on cloudfellows.dev: the rail offers all four; Upstream carries 'Use the bundled OpenIntuneBaseline v3.8' beside the zip loader; without a CloudFellows Windows catalog the diff is refused in the note; after \ud83e\uddec Export and a re-open the diff renders 73 rows, driver profiles unticked with 'no create path'; the loaded-zip road additionally offers '\u2b07 Community catalog file'. Sign out, sign into another tenant: Compare only, the upstream host hidden.",
        "T24 with intune-my-macs selected: its 21 policies read 'present' (never 'up to date' \u2014 no versions) and there is no 'not in baseline' card; Import dry run plans 21 creates under their upstream names.",
        "Suites (outside the repo): platformbaseline-tests.js 89/89 (engine, both specs, cleanBody against the real OIB exports, the bundled files regenerated through the engine and compared policy for policy), baseline-dom-tests.js 49/49 (both screens under jsdom: rail, seg, OIBID badge, import copy, dry run, cfdev gate, T24 ids)."
      ],
      files: ["js/platformbaseline.js", "js/winbaseline.js", "js/macbaseline.js", "js/oibWindowsData.js", "js/immMacosData.js", "js/app.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 141, title: "\ud83e\uddf9 T25 re-enables \u2014 the way back for the disable step, buckets following the read-backs",
      tools: ["T25 Entra device cleanup"], builds: [10565], risk: "low",
      why: "Production's cleanup can disable and delete but not undo a disable; the way back was the portal (Mihai, 2026-09-02: 'should have an option to enable disabled devices'). Missing capability, nothing broken; the write is the same PATCH the disable step already makes, with the value flipped, behind the same fresh read and read-back. It graduates when a live tenant round-trips disable \u2192 re-enable on a test device with the portal agreeing at each step.",
      test: [
        "Read a tenant with disabled devices: the rail carries \u21a9 Re-enable with the disabled count; the pane lists every disabled device (waiting, delete candidates, and any disabled outside the buckets), longest silence first; the Disabled-waiting card opens it.",
        "Tick one, Re-enable the ticked (test tenant): the Results pane reports 1 re-enabled with 'verified by read-back'; the portal shows the device enabled; the rail's Re-enable count drops by one, \u2461 Delete no longer lists it, \u2460 Disable lists it if it is past the threshold.",
        "Disable a device in \u2460, then open Re-enable without reading again: it is listed there.",
        "Tick a device somebody enabled in the portal meanwhile: it is skipped as 'already enabled', nothing written.",
        "With a signed-in account lacking the directory role: the row reports Graph's refusal as 'who you are, not what TUNO may do'.",
        "The Markdown report carries a Re-enabled section and the re-enable candidate list.",
        "Suite: _to_delete/devicecleanup-tests.js 53/53 (13 new).",
      ],
      files: ["js/devicecleanup.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 140, title: "\ud83e\uddf1 T16 says what each policy configures \u2014 ASR rules with their modes, every setting by name",
      tools: ["T16 Firewall & ASR coverage"], builds: [10559], risk: "low",
      why: "Production's T16 says whether a policy reaches anybody, never what it does when it does; Mihai (2026-09-02): 'this should show which rules are enabled within that policy'. Missing capability, nothing broken, reads only. It graduates when a live tenant's ASR fold matches the portal's rule editor mode for mode, and an AV and a firewall fold show the portal's labels.",
      test: [
        "Open an ASR policy on beta: the fold shows 'ASR rules \u2014 n of 19 set' with every rule a row, modes as Block/Audit/Warn/Off chips, unset rules greyed as 'not set'; compare three rules against the portal's policy editor.",
        "A policy that carries a per-rule exclusion shows it under the rule; ASR-only exclusions show below the table.",
        "Open an AV policy and a firewall policy: every setting is listed by the display name the portal shows, values as option labels (True/False, Enabled/Disabled, the number), children indented.",
        "'\u2699 Read what all N configure' reads the rest and the header then says every policy shown is read; the Markdown export carries a 'What the policies configure' section with one table per policy (ASR policies with the rule table first).",
        "A legacy intent's fold says it has no settings-catalog body; a policy whose settings read fails (revoke the config scope mid-session) says unknown, not empty.",
        "Demo mode: the ASR policy's fold reads 3 of 19 set.",
        "Suite: _to_delete/t16-endpointsec-tests.js 87/87 (20 new).",
      ],
      files: ["js/endpointsec.js", "js/demo.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 139, title: "\ud83d\udd04 T22 joins the rail \u2014 Overview says what is still to do, State says what was done",
      tools: ["T22 Group migration"], builds: [10558], risk: "low",
      why: "Production's Group migration is one long card: chips, table, archived block, with nothing saying that reading is step one of four. Mihai's asks (2026-09-02): the rail layout, the fact chips as filters or places, and 'it should be clear what the tool will still need to do after reading the tenant'. Convenience and clarity, nothing broken. It graduates when the Overview's counts agree with the table's State column across an examine, a refusal and a migration on a test tenant, and the prefix filters split the list exactly.",
      test: [
        "Read a tenant with role-assignable groups: the screen lands on Overview with four steps \u2014 Read marked done with the counts, Examine marked now with '0 of N examined', Plan and apply, Finish by hand \u2014 and the 'worth a look first' line names membership rules, missing destinations and rollbacks where present.",
        "Rail: Groups shows the table with the State column all 'not examined'; Restricted units lists every restricted unit with id and description (or says none yet); Archived shows the cleanup block or 'nothing archived'.",
        "Groups pane on a tenant with a detected prefix: two new chips, 'prefix X-' and 'no X- prefix', whose counts add up to the total; clicking one narrows the table and the count line says which is in force.",
        "Examine a group and close the window: its row reads 'plan ready \u2014 not applied' (or refused/frozen with the reason), the button says Re-examine, the Overview reads '1 of N examined \u00b7 1 plan ready', the rail's Overview node reads '1/N examined'.",
        "Migrate one (test tenant): its row reads 'migrated \u00b7 archived as \u2026' with the button disabled; the Overview's step 3 counts 1 migrated; Read again and every State is back to 'not examined'.",
        "Suite: _to_delete/groupmigrate-tests.js 188/188 (12 new assertions cover the rail, the panes, the prefix filters and the State column).",
      ],
      files: ["js/groupmigrate.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 138, title: "\ud83c\udf4e T24 \u2014 the floating bar carries create as well as dry run",
      tools: ["T24 macOS baseline"], builds: [10556, 10561], risk: "low",
      why: "Production's Upstream pane puts Create N in THIS tenant at the bottom of the plan table, a scroll below the floating bar that ran the dry run (Mihai, 2026-09-02: 'after dry-run has completed, in the same floating bar create/deploy in tenant should appear'). Convenience, nothing broken. It graduates when the bar's create writes exactly the planned set and a changed selection can never fire a stale plan.",
      test: [
        "Load an intune-my-macs zip on beta, tick some rows, Dry run the ticked: the bar changes to 'N ticked \u00b7 M to create' with \u270d Create M in THIS tenant as the primary and \ud83d\udd0d Dry run again beside it; no create button under the plan table, the plan says the create is in the bar.",
        "Untick one row: the create vanishes, the dry run is primary again, the plan shows the stale line. Re-tick that same row: the create is back without a new dry run.",
        "Edit a canonical name by one character: same invalidation; undo it: the plan returns.",
        "Click Create in the bar (test tenant): exactly the planned policies are created unassigned, the result lands under the plan, and the bar is back to the dry run with the ticks still set.",
        "cfdev gate (10561): on cloudfellows.dev open Upstream, sign out, sign into another tenant, open the tool: the rail offers Compare and Import only and the pane shows Compare — no Upstream or Export card. On cloudfellows.dev the Upstream card's heading says 'cloudfellows.dev only'.",
        "Suite: _to_delete/macbaseline-tests.js 110/110 (14 cover the bar states, 4 the cfdev gate).",
      ],
      files: ["js/macbaseline.js", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 137, title: "\ud83e\udd1d T17 counts one thing, nine ways \u2014 the full MAA gate list, one vocabulary across cards, rail and panes",
      tools: ["T17 Multi-admin approval"], builds: [10554], risk: "medium",
      why: "Production's T17 counts four operation types and files a device-wipe policy under a footnote, so a tenant whose only policy gates wipes reads '1 policy, 0/4 gated' with a red unexplained 1/1 on the rail \u2014 the reader concludes the policy is missing (Mihai, 2026-09-02). A wrong-looking report in production, so medium rather than low. It graduates when a live tenant with a device-action policy shows it as a gated row, when the three counts (policies, gated N/9, nobody-can-open) agree with the portal's Access policies list, and when a tenant with a compliance-policy access policy shows the new row gated.",
      test: [
        "On beta against a tenant with ONE access policy of type device wipe and an empty approver group: Overview reads Approval policies 1 (gating 1 of 9 operation types), Gated 1/9 naming Device wipe, Nobody can open 1; the rail reads What is gated 1/9 and Policies 1 \u00b7 \u26a0 1 with a tooltip; the at-a-glance list names the policy and 'gates the wipe action on every device'.",
        "What is gated pane on that tenant: nine rows in the fixed order, Device wipe gated with the policy named in the Policy column, the three action rows saying 'an action, not an inventory', Compliance policies with a count.",
        "A tenant with access policies of type app, script, compliance and role: four rows gated, Gated 4/9, the inventories filled, no 'action gate' wording anywhere on the page or in the MD.",
        "A tenant with no access policies: Overview says never configured, Gated 0/9 in red, no Nobody-can-open card, the What is gated pane is all 'no approval gate'.",
        "Demo mode: three policies (app, script with the empty-group fault, device wipe); Gated 3/9; Policies 3 \u00b7 \u26a0 1.",
        "MD export: 'What is gated \u2014 N of 9 operation types' table with Operation type | Gate | Policy | Inventory; policy table's middle column reads the label and what it gates, not the enum token.",
        "Headless suite (t17-10554-test.js, outside the repo): 38/38 \u2014 screenshot tenant, no policies, unknown future type + unreadable approver group + mixed-case type.",
      ],
      files: ["js/maa.js", "js/demo.js", "css/app.css", "index.html", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 136, title: "\ud83d\udd10 T01 closes the AaronLocker gaps \u2014 PE sniff by default, the Microsoft floor, publisher LOLBin exceptions, writable FILES, and no empty NotConfigured in the GPO XML",
      tools: ["T01 AppLocker", "T04 Backup/Restore/Verify"], builds: [10553, 10555, 10557, 10560, 10562, 10563, 10564, 10567, 10568, 10569, 10570], risk: "medium",
      why: "The T01-vs-AaronLocker review (scripts/REVIEW-AaronLocker.md) named three places AaronLocker's defaults were better and one gap neither tool covered. All four are now closed in Invoke-TunoAppLockerScan.ps1 v1.9.0: PE-header sniffing on by default with a never-executable extension list as the guard; Microsoft-signed artifacts keep their product name at Publisher granularity; the LOLBin exceptions ride as publisher conditions resolved on the scanned machine; and every executable file inside an admin-only directory has its own DACL evaluated (writable FILES, new bundle section, new evidence-card table). Separately, the App Control review found the GPO XML export could carry an empty NotConfigured collection \u2014 the exact shape Microsoft documents as a no-boot when merged with Intune's Managed Installer rule \u2014 so exportXml() now drops them and the subtitle says so. Medium risk because the scanner change is unrun on Windows in this session (parse-checked under pwsh 7.4, rule generation unit-tested on Linux) and the default-on file check adds one DACL read per executable file; it graduates when a real scan on a reference image confirms timing and the bundle shape.",
      test: [
        "Run Invoke-TunoAppLockerScan.ps1 v1.9.1 on WINDOWS POWERSHELL 5.1, unelevated, on a machine with no user-writable executable files: it gets past the writable-directory walk (v1.9.0 died there with 'Argument types do not match' at the empty writable-files list) and completes; a run on PowerShell 7 completes too.",
        "Break something on purpose (e.g. point -Path at a file instead of a directory, or throw from a function): the scanner prints [fail] with the message and a script stack naming the line, then stops.",
        "Scan with v1.10.0 (defaults) and upload the bundle: the Microsoft app coverage card shows OneDrive (per-user), classic Teams and the Defender platform ALLOWED via the three 'TUNO coverage:' rules, no Add allow rule buttons, no 'predates' notice; the Rules card lists the three under Exe; the Defender path rule sits at Info, not Medium. Scan with -NoMicrosoftCoverage: the three are red again and the scan card says the switch was used.",
        "Upload a v1.9.x bundle: the scan card says the bundle predates the coverage rules and names the script version. Click the three fixes, then upload any bundle again: the scan card says 3 edits were discarded and why, and the three rows are red again.",
        "Enforce naming and the collision stop (10570): with audit V4.0.1 deployed and the name field on V4.0.2, the 3-of-3 line reads 'created as … (Enforced) - R27.1 - V4.0.1'; Create the Enforce profile creates exactly that under the same grouping with no 'in the way' stop; the portal shows both profiles; create again: stopped on the Enforced profile already there.",
        "Gate 3 judged against the draft (10569): upload a scan whose log holds audited executions that this draft allows (Program Files, or a coverage rule added): gate 3 reads 'N covered (would run)' and passes; one whose log holds a signed executable from C:\\Tools the draft has no rule for: gate 3 reads '1 would still be blocked from machine space — GAPS' and the Findings card carries it with an Allow fix; apply the fix: gate 3 passes without a re-scan. A user-profile block reads 'by design' and does not lock the gate. A pre-entries bundle (summary only) says it cannot judge and asks for a re-scan.",
        "The enforce gates (10568): with the audit profile found and no bundle, the checklist reads ✓ / ✗ / ✗ and '1 of 3', gate 2 saying an XML is not evidence; upload a clean bundle: ✓ ✓ ✓, '3 of 3', the counts on gate 3, the button, and the hand-over sentence about removing the audit assignment. Type ENFORCE with the gates unmet: the profile is created (Enforced, same grouping, unassigned) and the portal shows its description ending 'created past the evidence gates on the operator's decision'.",
        "Enforce after a deployed audit (10567): with the audit profile already in the tenant under the grouping on screen and nothing created this session, Check against the tenant unlocks the enforce step's first gate — the lock line names the profile and asks for the scan bundle; with an Enforced profile under that grouping instead, it stays locked on the audit profile.",
        "Encrypted values (10563/10564): on a tenant whose custom profiles were saved after Intune began encrypting OMA-URI values, Compare and the events card's pull-from-the-tenant read the rules (one single-profile re-read, then one getOmaSettingPlainTextValue call per collection) instead of 'no readable RuleCollection values'; with the config scope unconsented the message names Graph's refusal AND offers the three other roads plus an upload.",
        "Compare with a file (10564): on the refusal, upload a Get-AppLockerPolicy -Effective -Xml export: the diff card renders and says the deployed side came from a file; upload a scan bundle from a device that has the profile: same, named as the device's effective policy; upload a bundle whose device had no effective policy: refused with the reason.",
        "T04 Backup (10564): back up Device configuration profiles on that tenant: every custom OMA-URI profile's JSON carries the plain-text values, no secretReferenceValueId; revoke the scope and back up again: the custom profiles are listed under 'could not be read' with Graph's reason, never written empty.",
        "Three deployed AppLocker profiles under three groupings (10562): Check against the tenant lists all three under 'different grouping'; Adopt identity on one: it moves to its own 'matches the deployed profile' line with Compare and Update in place, the other two stay listed below; Compare on it renders the card.",
        "Compare (10560): with an AppLocker profile deployed, run 🔎 Check against the tenant, press ⇄ Compare beside it. With the draft equal to what was deployed the card says 'No differences'; add one allow rule and re-run: the card lists exactly one '+ added' rule and 'everything not listed is identical'; rename a rule: it lists one 'renamed'; change a rule's path: one '~ changed' with was/now; switch the draft to Enforce and compare against the AuditOnly profile: no mode change is reported (the compare uses the deployed profile's own mode). Export the portal's copy of the policy and import it as the draft: 'No differences' despite re-minted Ids. Differences as Markdown downloads the same list.",
        "Click Add allow rule for the Defender platform on any bundle: the rule added is a PATH rule on %OSDRIVE%\\ProgramData\\Microsoft\\Windows Defender\\Platform\\*, not a publisher rule on the OS product.",
        "Run Invoke-TunoAppLockerScan.ps1 v1.9.1 elevated on a reference image: it completes, prints the LOLBin line (N publisher condition(s), M kept as path) and the writable-files line per root, and the bundle carries exceptions.lolBinCarriage, writableFiles and writableFilesChecked:true.",
        "In the generated Audit XML the Windows-folder Exe rule's Exceptions hold FilePublisherCondition elements for MSHTA.EXE, WMIC.EXE, INSTALLUTIL.EXE (any version) and only path conditions for patterns absent on that machine; the Dll and Script Windows rules carry only the writable-directory path exceptions.",
        "Rename a copy of an .exe to .dat inside a scanned writable directory and rescan: it is inventoried with sniffedPe:true and T01's evidence card counts it as found by header; -NoPeSniff makes it disappear.",
        "Grant Users Modify on one .exe inside Program Files and rescan: the file appears in writableFiles with the grantee, the Audit XML excepts it by exact %PROGRAMFILES% path (no trailing \\*), and a publisher or hash rule for it exists; T01's card lists it with its reachability and the MD carries the table. Timing of the whole scan with and without -SkipWritableFiles is noted in the promotion message.",
        "-PublisherRuleGranularity Publisher with a Microsoft-signed artifact in a writable directory: the rule carries the product name and the description says why; a non-Microsoft artifact gets a bare publisher rule as before.",
        "Load the sample policy: the XML panel shows three collections and the subtitle says 1 empty NotConfigured collection was left out; upload an XML whose NotConfigured collection carries rules and it is exported unchanged (that is an audit finding, not a rewrite). Intune profile JSON unchanged.",
        "Upload a pre-10553 bundle: the card says writable files were not checked (never 0) and everything else renders as before.",
      ],
      files: ["scripts/Invoke-TunoAppLockerScan.ps1", "js/applocker.js", "js/graph.js", "js/backup.js", "js/msappcatalog.js", "css/app.css", "index.html", "scripts/README.md", "scripts/REVIEW-AaronLocker.md", "js/version.js", "js/changelog.js", "js/promote.js"],
    },
    {
      n: 135, title: "\ud83d\uddfa The layout round \u2014 Option A: the rail everywhere a long tool benefits",
      tools: ["T26 Compliance evidence", "T13 Compliance report", "T17 Multi-admin approval", "T08 Assignment what-if", "T16 Firewall & ASR coverage", "T12 Setting conflict scan", "T09 Assignment health", "T18 Windows LAPS audit", "T14 Assignment filters", "T22 Group migration", "T23 Restricted AUs", "T02 Group Analyzer", "T06 Device analyzer", "T15 Defender status", "T04 Backup/Restore/Verify", "T01 AppLocker", "T03 Change audit", "T25 Entra device cleanup", "T07 Intune RBAC", "T24 macOS baseline"], builds: [10538, 10539, 10540, 10541, 10542, 10543, 10544, 10545, 10546, 10547, 10548, 10549, 10550, 10551, 10552], risk: "low",
      why: "One decision, taken once on the mockup (2026-09-01): tools that stack many result sections adopt the posture tool's sticky left rail (shared ep-rail chrome) so jumping to a section or back to a filter is a click, not a scroll; the lighter tools get the T19 fixes \u2014 static filter bars and popouts instead of inline expansions. Ships tool by tool on beta; promotes as ONE item because half a layout language in production is worse than none. Graduates when the converted tools read naturally on a live tenant and nothing lost a capability in the move.",
      test: [
        "Per converted tool on beta: the rail is sticky beside the pane, every section that used to render stacked is reachable as a node with a truthful count, and the pane swaps without losing filter state.",
        "Narrow window: the rail collapses to the wrapping strip (the shared CSS's own breakpoint) and nothing overflows.",
        "Every tool's own suite stays green after its conversion \u2014 the pass counts are in the build messages.",
        "Exports are unchanged by the layout \u2014 the MD/CSV of a converted tool matches its pre-conversion content for the same tenant.",
      ],
      files: ["js/complianceevidence.js", "js/compliance.js", "js/maa.js", "js/whatif.js", "js/endpointsec.js", "js/conflict.js", "js/health.js", "js/laps.js", "css/app.css", "js/groupmigrate.js", "js/restrictedau.js", "js/groupuse.js", "js/devicewhy.js", "js/defender.js", "js/backup.js", "js/applocker.js", "js/audit.js", "js/devicecleanup.js", "js/roles.js", "js/app.js", "js/macbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 134, title: "\ud83d\udccb T26 Compliance evidence \u2014 capability evidence laid against ISO 27001, NIST 800-53 and NIST CSF",
      tools: ["T26 Compliance evidence"], builds: [10537], risk: "medium",
      why: "Production has no auditor-facing evidence view; the documenter documents and T20 checks Windows posture, but nothing lays tenant policy against framework controls. Missing capability, nothing broken. It graduates when a live tenant's evidence rows match the portal's policy values, when the reaches-nobody and not-managed-here verdicts hold up, and when an auditor-shaped reader agrees the disclaimer and original summaries carry the right weight.",
      test: [
        "On beta against a live tenant, run \ud83d\udccb Read the tenant (or open with a warm cache \u2014 the source line must name the read): capabilities land with evidence rows; spot-check three against the portal (BitLocker, firewall, a compliance policy's password rule).",
        "Unassign one evidencing policy (test tenant): the capability flips to configured-but-reaches-nobody, and every control it fed drops from evidence to partial or none.",
        "A tenant with no macOS policies: macOS capabilities read not-managed-here and NO ISO/NIST control is dragged to partial by them.",
        "Evidence sourced from a compliance policy carries the marks-not-enforces caveat on the row and in the MD.",
        "Exports: the MD leads with the disclaimer and repeats it at the foot; the CSV carries one row per evidence hit including reaches and the compliance-policy caveat; no percentage or score appears anywhere.",
        "Framework summaries: verify three control texts are original sentences, not the standards' own text.",
      ],
      files: ["js/complianceevidence.js", "js/app.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 133, title: "\ud83e\uddf1 T15 matches the MDE-Active baseline \u2014 policy intent and device truth, no single score",
      tools: ["T15 Defender status"], builds: [10536], risk: "medium",
      why: "Production's Defender report says which machines are unprotected but not whether the tenant matches the baseline Mihai actually deploys (MDE-Active, his own Get-DefenderSettings.ps1). Missing capability, nothing broken. It graduates when a live tenant's match agrees with the script run on a member device \u2014 same deviations, same not-configured \u2014 and when the reaches-nobody and conflict verdicts hold up against the portal.",
      test: [
        "On beta against a tenant with the MDE-Active AV/ASR policies assigned, run \ud83e\uddf1 MDE baseline: the 19 ASR rows and 13 setting rows land with verdicts; spot-check three against the portal's policy editor.",
        "Run Get-DefenderSettings.ps1 -CompareBaseline on a member device of that tenant and compare: every deviation the script reports on settings TUNO maps must appear as deviate/conflict/not-configured in the policy layer or as a device-layer deviation.",
        "Unassign the AV policy (test tenant): its settings flip to reaches-nobody, never compliant.",
        "Create a second reaching AV policy with network protection at audit: the check reads conflict and points at T12's territory.",
        "A tenant where the config read is not consented: the \ud83e\uddf1 click asks for it at the click; declining leaves the fleet report intact.",
        "The MD export carries the baseline section only after a match ran; a fresh \ud83e\udda0 fleet read clears the match.",
      ],
      files: ["js/defender.js", "js/backup.js", "js/applocker.js", "js/audit.js", "js/devicecleanup.js", "js/roles.js", "js/app.js", "js/macbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
    {
      n: 132, title: "\ud83d\udee1 T16 says on how many devices \u2014 group member counts on every covering policy",
      tools: ["T16 Firewall & ASR coverage"], builds: [10535], risk: "low",
      why: "Production's coverage rows say assigned or tenant-wide but never how many machines that is \u2014 Mihai read the ASR row off the live screen and asked for the number. Nothing is broken; the number is missing. It graduates when the counts on a live tenant match what the portal says the groups hold, and when every limit (overlap, exclusion, filter, unreadable count) is printed where the number is.",
      test: [
        "On beta against a live tenant, run T16 and open a group-assigned covering policy: the row chip says \u2248N members, the fold's Configured on line repeats it with the membership caveat, and each include group chip carries its own count \u2014 compare one group's number against the portal's member view.",
        "Find (or make) a policy assigned to two overlapping groups: the sum states \u2018overlaps not deduplicated\u2019 rather than pretending to dedupe.",
        "A tenant-wide (all devices) policy says all devices \u2014 N Windows enrolled, matching the denominator card; an all-users policy refuses a device number and says their devices follow them.",
        "Sign in as an admin who can read policy but not group membership (or revoke Group.Read.All in a test tenant): counts read \u2018unreadable \u2014 unknown, not zero\u2019 and sums become floors; nothing renders as 0.",
        "Exports: the Markdown table's Configured on column and the CSV's configuredOn field carry the same phrases as the screen for the same policies.",
      ],
      files: ["js/endpointsec.js", "js/conflict.js", "js/health.js", "js/laps.js", "css/app.css", "js/groupmigrate.js", "js/restrictedau.js", "js/groupuse.js", "js/devicewhy.js", "js/defender.js", "js/backup.js", "js/applocker.js", "js/audit.js", "js/devicecleanup.js", "js/roles.js", "js/app.js", "js/macbaseline.js", "js/version.js", "js/changelog.js", "js/promote.js", "index.html"],
    },
  ],

  staying: [
    { title: "🔐 T29 P-2715 Applocker & harvest", why: "Requested in Workspace 02 Projects (build 10690). Project P-2715 stays on beta and is never promoted. Project end date has not been supplied." },
    {
      title: "🚀 T28 MDE rollout",
      why: "A project tool for one rollout (build 10632, Mihai: \u2018add it as a temporary tool in tuno-beta\u2019). It stays on this channel for as long as the rollout runs and is removed afterwards — never promoted, so production never carries a tool built for one tenant's migration. Since build 10674 it lives in workspace 02 Projects (data-ws on its tile, its customer and end date in its registry entry); the tile and its registry entry stay here, while the shell code that draws 02 is promotable — with no project tool on main, production draws one workspace.",
    },
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

// ======================================================================
// THE PROMOTION ORDER (build 10444). The Help queue grew tick boxes; this
// turns the ticked numbers into a small file Mihai hands to a working
// session as the promotion instruction.
//
// THE FILE IS THE ORDER, NOT THE VERIFICATION — it says which items to
// promote, in Mihai's words, with the machine-readable order embedded. The
// session that receives it still verifies every item against what main
// actually contains, because the queue's own header says not to trust the
// queue's list, and that rule does not bend for a nicer file format.
// ======================================================================
// ======================================================================
// TILE CHIPS FROM THE QUEUE (build 10551, Mihai's ask: "tuno is not
// tagging the updated tools"). The 10534 promotion stripped the tile
// chips because the queue was empty — and thirteen builds later nothing
// had put UPDATED back on the tools those builds changed, because
// hand-stamped chips rot the moment anyone forgets one.
//
// So the chips DERIVE from the queue: what is on this channel and not in
// production IS PROMOTE.items, and every build already updates its item
// (the house rule this file's header enforces). A tool named in any open
// item wears UPDATED — or NEW while its version is still 0.x, the
// channel rule — and when a promotion empties the queue the chips vanish
// by themselves, which is exactly what the 10534 strip did by hand.
//
// Beta only: production's NEW/UPDATED are stamped statically by
// promotion step 5 and stay as cut. The REORDER (new/updated tiles lead
// their section) runs on both channels, over whatever chips exist.
// ======================================================================
PROMOTE.tileFlags = function (toolVersions) {
  const flags = {};   // tile id -> "new" | "upd"
  for (const it of PROMOTE.items || []) {
    for (const t of it.tools || []) {
      const m = /^T(\d+)\b/.exec(String(t));
      if (!m) continue;
      const n = Number(m[1]);
      const key = Object.keys(toolVersions || {}).find((k) => toolVersions[k] && toolVersions[k].t === n);
      if (!key) continue;
      // 0.x = beta-only = NEW to whoever promotes next; anything else is a
      // production tool that moved — UPDATED. NEW wins if both would apply.
      const isNew = /^0\./.test(String(toolVersions[key].v || ""));
      if (flags[key] !== "new") flags[key] = isNew ? "new" : "upd";
    }
  }
  return flags;
};

PROMOTE.applyTileFlags = function (doc, toolVersions, opts) {
  const o = opts || {};
  if (o.beta) {
    const flags = PROMOTE.tileFlags(toolVersions);
    for (const [id, kind] of Object.entries(flags)) {
      const tile = doc.getElementById(id);
      const h = tile && tile.querySelector("h3");
      if (!h) continue;
      // a tile already wearing a status chip (a birth NEW/BETA, say) keeps
      // it — the stamp fills the gap, it never doubles up
      if (h.querySelector(".tag.upd") || h.querySelector(".tag.new")) continue;
      const chip = doc.createElement("span");
      chip.className = kind === "new" ? "tag new" : "tag upd";
      chip.textContent = kind === "new" ? "NEW" : "UPDATED";
      const block = h.querySelector(".tag.block");
      h.insertBefore(doc.createTextNode(" "), block);
      h.insertBefore(chip, block);
      if (block) h.insertBefore(doc.createTextNode(" "), block);
    }
  }
  // NEW leads, UPDATED follows, the rest keep their order — per section,
  // on both channels (sort is stable; appendChild moves in place).
  doc.querySelectorAll(".tools").forEach((grid) => {
    const tiles = [...grid.children];
    const rank = (el) => {
      const h = el.querySelector && el.querySelector("h3");
      if (!h) return 2;
      const isNew = [...h.querySelectorAll(".tag.new")].some((x) => x.textContent.trim() === "NEW");
      return isNew ? 0 : h.querySelector(".tag.upd") ? 1 : 2;
    };
    if (!tiles.some((el) => rank(el) < 2)) return;
    tiles.slice().sort((a, b) => rank(a) - rank(b)).forEach((el) => grid.appendChild(el));
  });
};

// ======================================================================
// RELATED ITEMS FOLD (build 10602, Mihai's ask: "the waiting for production
// list should group related items as one for promotion, with the option
// to deselect from the grouping"). At 42 items the queue had become two
// long runs — seventeen T01 builds and nineteen baseline builds — and
// ticking them one by one to say "all of T01" was the wrong unit of
// decision.
//
// A group is a VIEW over the items, never a replacement for them: every
// item keeps its number, its why, its checklist and its own tick, and
// the header's ONE ITEM PER CHANGE rule is untouched. What makes items
// related is read off the data that is already there — tools[] — so
// there is no group field to hand-maintain and nothing that can rot:
// items sharing a tool fold together (transitively: T01+T04 joins the
// T01 run, T05+T27+T24 joins the baseline run). An item that names more
// than THREE tools stands alone — a layout round that touched twenty
// tools is not "related" to any of them, it would fold the whole queue
// into one row.
// ======================================================================
PROMOTE.GROUP_TOOL_CAP = 3;

PROMOTE.groups = function (items) {
  const list = (items || PROMOTE.items || []).slice().sort((a, b) => a.n - b.n);
  const toolNo = (t) => { const m = /^T(\d+)\b/.exec(String(t)); return m ? Number(m[1]) : null; };
  // union-find over item index, joined through tool number
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const firstByTool = {};
  list.forEach((it, i) => {
    const tools = it.tools || [];
    if (tools.length > PROMOTE.GROUP_TOOL_CAP) return;   // stands alone
    for (const t of tools) {
      const n = toolNo(t);
      if (n === null) continue;
      if (firstByTool[n] === undefined) firstByTool[n] = i; else union(firstByTool[n], i);
    }
  });
  const buckets = {};
  list.forEach((it, i) => { const r = find(i); (buckets[r] = buckets[r] || []).push(it); });
  const RANK = { high: 3, medium: 2, low: 1 };
  const out = [];
  for (const members of Object.values(buckets)) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.n - b.n);
    // core = tools EVERY member names; also = the rest, by how often they appear
    const count = {};
    const order = [];
    for (const it of members) for (const t of it.tools || []) {
      if (count[t] === undefined) { count[t] = 0; order.push(t); }
      count[t] += 1;
    }
    // the name is the tools MOST members name, most common first — a
    // single T24-only item must not un-name T27 from the baseline run;
    // the rest are "also touches"
    const byFreq = order.slice().sort((a, b) => count[b] - count[a]);
    const core = byFreq.filter((t) => count[t] * 2 > members.length);
    const also = byFreq.filter((t) => count[t] * 2 <= members.length);
    const builds = [].concat(...members.map((m) => m.builds || [])).map(Number).sort((a, b) => a - b);
    const risk = members.reduce((w, m) => (RANK[m.risk] || 0) > (RANK[w] || 0) ? m.risk : w, "low");
    const ns = members.map((m) => m.n);
    out.push({
      key: "g" + ns[0],
      title: core.join(" + "),
      core, also,
      ns, members, risk,
      minN: ns[0], maxN: ns[ns.length - 1],
      minBuild: builds[0], maxBuild: builds[builds.length - 1],
    });
  }
  return out.sort((a, b) => a.minN - b.minN);
};

// The table's reading order: groups and single items interleaved by their
// first number, so a group sits where its earliest item would have.
PROMOTE.queueRows = function (items) {
  const list = (items || PROMOTE.items || []).slice().sort((a, b) => a.n - b.n);
  const groups = PROMOTE.groups(list);
  const inGroup = new Map();
  for (const g of groups) for (const n of g.ns) inGroup.set(n, g);
  const rows = [];
  const seen = new Set();
  for (const it of list) {
    const g = inGroup.get(it.n);
    if (!g) { rows.push({ kind: "item", item: it }); continue; }
    if (seen.has(g.key)) continue;
    seen.add(g.key);
    rows.push({ kind: "group", group: g });
  }
  return rows;
};

PROMOTE.buildOrder = function (pickedNs, appBuild) {
  const ns = [...new Set((pickedNs || []).map(Number))].sort((a, b) => a - b);
  if (!ns.length) throw new Error("Nothing is ticked — an empty order is not an order.");
  const items = ns.map((n) => {
    const it = (PROMOTE.items || []).find((i) => i.n === n);
    if (!it) throw new Error(`Item ${n} is not in the queue — it may have shipped since the tick. Untick it and export again.`);
    return it;
  });
  const when = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const beta = appBuild ? appBuild.label : "";
  // the groups the ticks touch — whole or partial, both are said out loud
  const picked = new Set(ns);
  const groups = PROMOTE.groups(PROMOTE.items).map((g) => ({
    title: g.title,
    items: g.ns.filter((n) => picked.has(n)),
    heldBack: g.ns.filter((n) => !picked.has(n)),
  })).filter((g) => g.items.length);
  const L = [];
  L.push("# TUNO promotion order");
  L.push("");
  L.push(`Generated ${when} on ${beta} · production is ${PROMOTE.productionBuild}`);
  L.push("");
  L.push(`PROMOTE ITEMS: ${ns.join(", ")}`);
  L.push("");
  if (groups.length) {
    L.push("GROUPS — related items ticked together (a group is a view over the");
    L.push("items above, not a promotion unit of its own; a held-back number is");
    L.push("a decision, and the session must not promote it as part of the run):");
    for (const g of groups) {
      L.push(`- ${g.title}: ${g.items.join(", ")}` + (g.heldBack.length ? ` — HELD BACK: ${g.heldBack.join(", ")}` : " — whole group"));
    }
    L.push("");
  }
  L.push("For the working session: this file is the ORDER, not the verification.");
  L.push("Verify each item against what main actually contains before building");
  L.push("the production commit — the queue's own rule. Items promote together");
  L.push("where their builds interleave; the session decides the cut.");
  L.push("");
  for (const it of items) {
    L.push(`## Item ${it.n} — ${it.title}`);
    L.push(`- tools: ${(it.tools || []).join(", ")}`);
    L.push(`- beta builds: ${(it.builds || []).join(", ")}`);
    L.push(`- risk: ${it.risk}`);
    L.push(`- files: ${(it.files || []).join(", ")}`);
    L.push("");
  }
  L.push("```json");
  L.push(JSON.stringify({ order: ns, groups, generated: when, betaBuild: appBuild ? appBuild.build : null, productionBuild: PROMOTE.productionBuild }));
  L.push("```");
  return {
    filename: `tuno-promotion-order-${when.slice(0, 10)}.md`,
    text: L.join("\n"),
  };
};

