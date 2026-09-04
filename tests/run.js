// ======================================================================
// `npm test` — every tracked suite, one after the other, non-zero on the
// first failure count that is not zero (design finding 13, build 10595).
//
// Suites run as SEPARATE PROCESSES on purpose. Each one boots the whole
// app into a jsdom window per block and the tools hold session state; one
// process for all of them would leave a suite testing the order the files
// happened to be required in.
//
// The suites in _to_delete/ are not run here. They are untracked scratch
// on one laptop — the thing finding 13 is about — and they move in here as
// each is made to stand on its own.
// ======================================================================
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const dirs = fs.readdirSync(__dirname, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(__dirname, d.name));

const suites = dirs.flatMap((d) => fs.readdirSync(d)
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => path.join(d, f)));

if (!suites.length) { console.error("No suites found under tests/."); process.exit(2); }

let failed = 0;
for (const s of suites) {
  const rel = path.relative(ROOT, s);
  console.log(`\n──── ${rel}`);
  const r = spawnSync(process.execPath, [s], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) { failed++; console.log(`   ${rel} FAILED (exit ${r.status})`); }
}

console.log(failed ? `\n${failed} of ${suites.length} suites failed.\n` : `\nAll ${suites.length} suites passed.\n`);
process.exit(failed ? 1 : 0);
