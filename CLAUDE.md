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

## The other standing rules, in one breath

Work lands on `beta`, never on `main`; every commit is a build with its
bookkeeping (version, changelog, `?v=`, promotion queue) in the same commit;
verify headlessly and report the pass count; prepare push commands but never
push — Mihai pushes; R-numbers, T-numbers and queue numbers are permanent.
The long versions live in the project memory files named above.
