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

## The other standing rules, in one breath

Work lands on `beta`, never on `main`; every commit is a build with its
bookkeeping (version, changelog, `?v=`, promotion queue) in the same commit;
verify headlessly and report the pass count; prepare push commands but never
push — Mihai pushes; R-numbers, T-numbers and queue numbers are permanent.
The long versions live in the project memory files named above.
