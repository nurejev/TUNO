# OpenIntuneBaseline — the Windows community baseline

Cut verbatim from https://github.com/SkipToTheEndpoint/OpenIntuneBaseline at commit `4844247055305c9eb8dfe4b12c895ec8422dee67` (release 3.8, published 2026-05-06) by James Robinson (SkipToTheEndpoint). 73 policies, names and descriptions the author's own, each carrying its `OIBID`.

Schema 2 · catalog `oib` · read into this repository on 2026-09-03. Three dates, never one string: `release` is the author's own version, `sourceDate` is when THEIR cut was published, `exported` is when it was read here. Every body is the canonical body and carries the SHA-256 the loader recomputes.

`catalog.json` **is the catalog the app reads** — TUNO fetches `baseline/community/openintunebaseline/catalog.json` from its own origin when 🪟 Windows baseline opens. Written by the app: on the baseline tenant, 🧩 Upstream → fetch or load the repository → ⬇ Community catalog folder (zip), unzipped at the repository root. Never edited by hand.

| Section | Policies |
| --- | --- |
| Compliance policies | 4 |
| Settings catalog policies | 62 |
| Device configuration profiles | 4 |
| Driver update profiles | 3 |
