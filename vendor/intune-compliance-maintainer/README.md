# IntuneComplianceMaintainer (vendored)

James Robinson's [IntuneComplianceMaintainer](https://github.com/SkipToTheEndpoint/IntuneComplianceMaintainer)
(SkipToTheEndpoint, MIT — see `LICENSE`), copied **unchanged** from upstream commit
`8264d959fb0d2383506cbd9e181c1b2b9f64c0c6` (the 2026-07-01 release) at TUNO beta 10705.

TUNO's 📏 OS floor keeper (T30) follows this script's logic in the browser and, under
**⏱ Unattended**, hands it back as a download with its configuration section — from the
`Authentication` banner to the `Script Variables` banner — filled in from the tool's rules.
Nothing else in the script is touched; `tests/osfloor/osfloor.test.js` holds that.

To take a newer upstream release: replace the files here, keep this note's commit line
current, and run the suite — the export refuses a script whose banners have moved.
