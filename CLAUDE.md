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
rest — and strips the chips from screen headers and roadmap cards outright.
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
