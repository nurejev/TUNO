# TUNO — working rules for Claude

The full project memory lives in the claude.ai project "The TUNO Tool"
(`tuno-site-repo.md`, `tuno-beta-channel.md`, `tuno-changelog-upkeep.md`,
`tuno-new-tools-beta.md`, `tuno-promotion-queue.md`). This file carries the
rules learned in working sessions that must survive into any session that
opens this repo — read it before changing anything.

## Layout changes: MOCKUP FIRST, always

Any change to how a screen is laid out — where controls live, what floats,
what sticks, how a tool's panels divide — gets a **mockup before any code**.
Show the options (usually two), let Mihai pick, then build the pick.

Learned at build 10400: the Assignment editor's operation bar was mocked as
"sticky top bar" vs "floating bottom selection bar" before a line of CSS was
written, Mihai picked the bottom bar, and the build landed right first time.
The sidebar work before it (10380–10391) went through four correction rounds
because it was built first and judged after. A mockup round costs minutes;
a correction round costs builds.

This applies to LAYOUT — placement, structure, chrome. It does not apply to
fixes with one honest answer (a clipped menu, a missing padding rule, a
table that does not fit): fix those directly.

## Work in the repo. Patches are the fallback, not the method

**A session that can reach `~/REPO/TUNO` commits in it.** In Cowork, ask for
the folder with `request_cowork_directory` at the START of the session, before
writing a line — not after building, when the work is already stranded in a
clone. The whole patch protocol below exists to survive not having the repo,
and every failure it documents is a failure it caused.

With the repo mounted the loop is: edit the real files, run the headless
suite, commit with the full bookkeeping, hand Mihai the push block. No base
SHA to name, no mbox, no `git am`, no renumbering, no way for the tree to
diverge — a commit either exists on the branch or it does not.

Two rules survive the bridge, because they are about the branch, not the
transport:

* **Never push.** Prepare commits, hand over the push block. Unchanged.
* **Check the tip before building.** `git log --oneline -1` first, so the
  build number is cut from the real tip. Parallel sessions still race.

### If a session genuinely cannot reach the repo

Then, and only then, `git format-patch`. The rules below were paid for; keep
them.

0. **A handover is cut from Mihai's APPLIED TIP, never re-cut from the base
   the last one used.** Delivered 10489–10498 as one mbox after 10489–10496
   were already applied: patch 1 hit a tree that already contained it and the
   whole apply failed. Ask what HEAD is, cut from there, deliver only what is
   missing.
1. **Every handover names the exact SHA it must sit on.** Before `git am`,
   run `git log --oneline -1` — if HEAD is not that SHA, STOP and report the
   SHA back; the patches need renumbering, because build numbers are permanent
   and the tip has moved.
2. **Verify the files exist before applying**: `ls ~/Downloads/000*.patch`.
   A `git am` on a missing path fails fatally and the pushes after it say
   "Everything up-to-date" — which reads as success and is nothing.
3. Builds cut in parallel sessions race for the next number. Whichever lands
   on the remote first keeps it; the patch side renumbers.
4. **A failed `am` whose patch subject matches HEAD's subject means the patch
   is ALREADY APPLIED — skip it, never renumber.** `git am` re-hashes, so the
   SHA differs while the tree is identical; verify with
   `git rev-parse HEAD^{tree} <mine>^{tree}` when in doubt. Learned the night
   10468 was applied twice.
5. **A multi-build handover is ONE mbox file, never N patch files.**
   `git format-patch --stdout base..tip > builds.mbox`, one download, one
   `git am`, order guaranteed. Two of the three failures that night were a
   missing file and an out-of-order apply — an mbox cannot have either.
6. After ANY failed `am`, clean up before trying anything else, and never
   run the pushes: "Everything up-to-date" after a failed apply is nothing
   wearing success's clothes. WHICH cleanup depends on whether HEAD moved:
   * `git am --abort` ONLY when HEAD is still where the failed session
     started — it restores the branch to that session's ORIG_HEAD.
   * `git am --quit` when commits landed since (a stale `rebase-apply`
     from an old failure, discovered later) — it discards only the stuck
     state and leaves HEAD alone. An `--abort` here can REWIND the branch
     past applied builds. Learned the day 10480 sat behind a rebase-apply
     directory left over from the 10476 handover.
   * "Everything up-to-date" is only success when `git log --oneline -1`
     already shows the build the handover was delivering — check the
     subject, not the feeling.

## The suites: tracked ones first, scratch ones second

**Since build 10595 some suites are TRACKED**, in `tests/`, and they are the
ones a commit is checked against:

```bash
npm install     # jsdom, once — package.json exists for this and nothing else
npm test        # every tests/**/*.test.js, each in its own process
```

`.github/workflows/tests.yml` runs the same thing on every push to `beta`
and `main`. A new suite dropped into `tests/<tool>/` as `*.test.js` is
picked up without editing the runner or the workflow.

Everything else is still untracked scratch in `_to_delete/*-tests.js`, on
Mihai's machine only. Run the ones your change could touch, and **say which
were already red before you started** — several have drifted and a report
that lists them as new breakage is worse than one that does not mention
them. `graph-read-tests` had twelve failures at 10587, before any of the
T24/T27 work; `layout-tests` throws on a missing `crypto` in its own
harness. Neither is yours unless you made it so.

TUNO is still static files with no build step. `package.json` is not a
bundler arriving; nothing in it is served.

## Mihai runs PowerShell. Quote every rev-spec

Commands handed over are typed into PowerShell, where `^`, `{`, `}` and `~`
are live syntax. `git rev-parse HEAD^{tree}` does not fail there — PowerShell
parses `{tree}` as a script block, git receives `HEAD^`, and it cheerfully
answers **the parent commit's SHA**. A verification command that silently
answers a different question is worse than one that errors, because the
number looks exactly like the number that was asked for. (It printed
`1a68d6cf…`, the SHA of the build one back, and read as a plausible tree
hash.)

So: quote any rev-spec containing `^`, `{}`, `~` or `@`.

```powershell
git rev-parse "HEAD^{tree}"     # correct
git log --oneline "HEAD~3..HEAD"
```

The `cd`-first push block is already safe. This is about the checks around it.

## Git locks: MOVE them, do not delete them

The known lock friction (`index.lock` / `HEAD.lock` recreated by a host-side
process) has a sharper edge in sandboxed sessions: the mount can refuse
`unlink` outright — `rm -f` fails with "Operation not permitted" and so does
git's own cleanup — while **rename is allowed**. The fix that works:

```bash
mv .git/HEAD.lock  _to_delete/HEAD.lock.$RANDOM
mv .git/index.lock _to_delete/index.lock.$RANDOM
```

then commit immediately. The stray `.lock.*` files in `_to_delete/` are this
workaround's droppings — ignore them. Learned at build 10420, where a commit
sat blocked through ten rm-and-retry loops and moved on the first rename.

## Commit identity

Commits are authored as **Mihai Monte &lt;mihai@limon-it.nl&gt;** — set in this
repo's local git config. If a session finds the config empty, set exactly
that; never invent an identity from the environment.

## Push commands: ONE block, stacked, cd first

When handing Mihai the push commands, put everything in ONE bash code
block, one command per line, starting with the cd — so a single
copy-paste runs the whole thing:

```bash
cd ~/REPO/TUNO
git push tuno-beta beta:main
git push origin beta:beta
```

(Corrected from an earlier note that said one block per command — Mihai
showed the format he wants and it is this one.)

## Chips are channel language (production build 10)

`BETA` chips exist ONLY on the beta channel — there they say "still proving
itself here". Production never shows a BETA chip: promotion step 5 (see
js/promote.js) relabels the tiles on `main` — `NEW` on tools new to that
production build, `UPDATED` on tools a promoted item changed, nothing on the
rest — and strips the chips from the roadmap cards outright. Screen headers
need no step since 10663: every head is written by `toolHeadInner()` from
the tool's entry in `js/version.js` (title and chips beside its number), and
a production build (`APP_BUILD.isBeta` false) leaves BETA, NEW and UPDATED
out by itself while "writes to the tenant" and "temporary" stay. A new
tool's head is an empty `<h2 data-tool-head="toolX">` plus `head` and
`chips` in its registry entry — never typed into index.html.
`_to_delete/main-check.js` fails any BETA chip on production, any status
chip other than `tag.new`>NEW or `tag.upd`>UPDATED, and a home page with no
status chips at all (a strip is not a translation).

## Tool versions say which channel, not how finished

`TOOL_VERSIONS` in `js/version.js`: **a tool in production is 1.0.x, a
beta-only tool is 0.x.** The number reports the channel a tool has reached,
not how good it feels — so a 1.x on `beta` for a tool that is not on `main`
is a bookkeeping bug. The iteration counter carries across the promotion
rather than resetting (T01 went 0.27 → 1.0.27), so every note stays filed
under the version it describes; a tool promoted with no beta history starts
at 1.0.0.

**Which tools are in production is read, never remembered:** the tiles in
`git show main:index.html`. Eighteen were renumbered from that list at
10505, and T20 was corrected *downwards* from 1.3 to 0.13 — it had been
carrying a 1.x since 10486 while still beta-only.

## The other standing rules, in one breath

Work lands on `beta`, never on `main`; every commit is a build with its
bookkeeping (version, changelog, `?v=`, promotion queue) in the same commit;
verify headlessly and report the pass count; prepare push commands but never
push — Mihai pushes; R-numbers, T-numbers and queue numbers are permanent.
The long versions live in the project memory files named above.

## A script change is a page change

Every T01 companion script has a row under Help & scripts, and every row
shows `vX.Y.Z · changed in build N` from `SCRIPT_VERSIONS` in
`js/applocker.js`. When a script's behaviour changes (its
`$script:ScriptVersion` moves), in the SAME build: update its
`SCRIPT_VERSIONS` entry (`v` = the new version, `changed` = this build),
re-read its `.al-dl-note` under the row and any deploy-panel blurb that
describes the pair (`REMEDY` in applocker.js) and fix what the change made
untrue, and add the README row change. `_to_delete/check-script-versions.js`
fails the build when the map and the files disagree, or when a bumped script
does not name the current build. Learned at 10600: the cleanup pair gained a
marker and the deploy panel still told people to unassign it "or it removes
the new policy" (Mihai: "it needs to be visual that it has changed").

## A tool screen is a `section.screen.tool` (build 10662)

Every tool screen carries `class="screen tool"` and every tile
`class="tool tool-tile"`. The class is what gives a screen its frame — the
stylesheet's THE TOOL SCREEN FRAME owns the head card's and the result's
spacing, so neither carries an inline `margin-top` — and what puts it in the
browser history: `HISTORY_SCREENS` in js/app.js is read from it. A new tool
that forgets the class gets no Back, which is how eight tools went without
one until 10662. Tile styles are written against `.tool-tile`, never bare
`.tool`, or they land on all 28 screens (ENCA shipped that for six builds).
tests/shell/foundation.test.js holds all of it.

## No optional chaining — a test now, not a reminder

`?.` anywhere in `js/` fails tests/shell/foundation.test.js. It is a
tokenizer, not a grep, so strings, comments, template text and regular
expressions do not count; at 10662 it agreed with acorn on every file of
TUNO and of ENCA (647 chains there). ENCA's modules use it freely, so a
port rewrites it — and reads each one, because the rewrites are not all
the same: `(x || {}).y` where `x` is an object or nothing, `x && x.y.z()`
for a call, `!(x && x.y)` under a negation. A string or a number on the
left is where `?.` and `||` part ways.

## Icons in the chrome are line icons (build 10666)

`js/flat-icons.js` (ENCA's FlatIcons) draws the emoji that opens a button,
label, summary, heading, table header, tile, tab or chip as a line icon.
Keep writing the emoji in the markup — it stays in the text as hidden text,
so `textContent`, the crumbs and every suite read the same string. What a
new tool or marker needs:

- **A new tool** gets an entry in `names` (tool id → shape), or its tile,
  tab, sidebar entry and head draw the grid. tests/shell/icons.test.js fails
  a tile without one.
- **A new marker emoji** draws only if it is in `glyphs`; otherwise it stays
  an emoji (ENCA would draw a grid square). Map it to an existing shape, or
  add a shape under TUNO's shapes.
- **A row whose emoji are a legend** shared with cards or tags elsewhere
  (T09's kinds) carries `data-preserve-text`, so it keeps every emoji rather
  than half of them.
- **A heading whose emoji is another tool's** names its shape:
  `data-icon="shield"` (the Home sections do).

## Three deployments, and the brand assets' own ?v= (build 10667)

`deploymentKind()` in js/app.js answers whose deployment this is:
`BRANDING.host` is production (no ribbon), `BRANDING.betaHost` is the
beta site (red BETA ribbon, `[BETA]` title, the BETA edition of the mark),
and ANY other host is somebody's own copy (slate SELF-HOSTED ribbon,
`[SELF-HOSTED]` title, the plain mark) — localhost included. Neither host
is reachable from `selfhost-branding.json`. The BETA marks are never worn
under a self-hosted look. The logo and favicon files carry a `?v=` of
their own — a small integer in js/branding.js, css/app.css and index.html,
bumped together when the artwork changes — never the build number, which
would join the build's `?v=` refs that tests/platformbaseline/screen
counts. tests/shell/brand.test.js holds all of it.

## The workspace shell is drawn over the old navigation (build 10668)

`js/workspaces.js` (ENCA's) draws the branded header, the 88 px rail, the
strip of open tools and the All tools library once a session starts — over
app.js's sidebar and tab bar, which still render and stay the registry:
every rail, library and header click ends in the hidden sidebar's own
`#side-<toolId>` button, so the tile is still the router. Do not take the
sidebar out of the DOM, and hide it in CSS only. What a new tool needs:

- a one-line `blurbs` entry in js/workspaces.js — its card in All tools;
  tests/shell/header.test.js fails a card without one;
- nothing else for the rail unless it joins the seven shortcuts (round 1,
  D1 A, work order) — that list is `WORKSPACES.intune.shortcuts`.

A fixed bar a tool adds (like the Assignment editor's selection pill) is
laid out against `--wc-rail-width`, never the old 240 px sidebar, and sits
above the 62 px bottom rail under 700 px — css/workspaces.css ends with
TUNO's own.

## Home is the library; the tiles are the registry (build 10669)

Under the shell, `#screen-home` shows only `#wcHome` (ENCA's Home: the
tenant over the heading, Recent tools, the library) — one CSS rule hides
every other child, so anything added to `#screen-home` outside `#wcHome`
will not be seen. The tile grid stays in index.html exactly as before and is
still what everything reads: the sidebar, the rail, the library cards and
their order, the T-numbers, production's tile chips (promotion step 5) and
`_to_delete/main-check.js`. A tile's tags (`h3 .tag` — writes to the
tenant, NEW, BETA, UPDATED, temporary, and the beta queue's stamps) become
the card's chips as they stand when the shell starts, so a tag is still
added to the TILE, never to js/workspaces.js. Recent tools live in memory
for the session (five, newest first, cleared on sign-out or a tenant
switch); whether the library is open is `tuno.wcLibraryOpen:<workspace>`
in localStorage. The library starts closed when an element `#wcOverview`
is there — the Intune overview since 10671, which renders into `#wcHome` on
the `tuno:wchome` event — and open where there is none.

## Home's Intune overview reads nothing (build 10671)

js/home-overview.js (ENCA's js/overview.js pattern, mockup round 2's D6 A)
is the counts, Worth a look first, the read surface by surface and Your
checks — all of it from `PolicyCache.get()` and `RunMeta.last(tool)`. It
never reads the tenant; its one read is the button that says so (Read the
tenant / Read again), at a click, through the cache. Unknown is "—" and a
count over an unread surface is "N+" — never 0. Rules for what changes it:

- a finding is pure, in `HomeOverview.model`'s `findings()` — rank, rows
  (the evidence), meaning, next step, the tool that owns it; a finding on a
  read with gaps says Partial;
- an on-demand tool joins Your checks by calling `RunMeta.publish(toolId,
  { completeness }, { n, unit }, data)` when its read lands (T15, T18, T13,
  T21, T25 do) and a row in `HomeOverview.CHECKS` with its run button's id;
  `n` is "Unknown" when the read did not establish it, never 0;
- a count or row that opens 🗂 Policy overview goes through
  `OverviewTool.openWith({ surf | surfs, verdict })`, so the list shown is
  the list counted (filters, scope tags and enrolment tokens are not
  policies, and Home's policy counts leave them out);
- the cache tells Home when the read changes (`PolicyCache.on`: start,
  done, failed, dropped, cleared, cold); a writer still calls
  `PolicyCache.invalidate()`, and Home then says the policies changed.

## The ⌘K palette reads what is already there (build 10670)

Ctrl/Cmd+K (js/app.js, ENCA's R03 palette, roadmap R38) lists the tools in
`TOOL_TABS` — a new tool is in it by being in `TOOL_TABS`, which its tab
needs anyway — with T-numbers from `TOOL_VERSIONS`, the other workspace
through `Workspaces.paletteItems`, and the policies of the shared read
(`PolicyCache.get()`). It never reads the tenant: a cold cache is said
(the "Read the tenant" row), never searched around. A chosen policy opens
🗂 Policy overview and `OverviewTool.openFromPalette(key)` — keep that
export if T19 changes, and keep the key `<section id>|<item id>`. It opens
only signed in, and Ctrl/Cmd+Shift+K stays the browser's.
