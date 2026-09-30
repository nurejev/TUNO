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

// On GitHub Actions a failed suite also names its failing checks as
// ANNOTATIONS (build 10649). The job log needs a signed-in viewer; the run
// page's annotations do not — so "Process completed with exit code 1" is no
// longer the only thing a failure says. TUNO's CI failed once on a commit
// tuno-beta's CI passed, and nothing on the run page said which check.
const onActions = !!process.env.GITHUB_ACTIONS;
const esc = (v) => String(v).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
let failed = 0;
for (const s of suites) {
  const rel = path.relative(ROOT, s);
  console.log(`\n──── ${rel}`);
  const r = spawnSync(process.execPath, [s], { cwd: ROOT, stdio: onActions ? ["inherit", "pipe", "pipe"] : "inherit", encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (onActions) { process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || ""); }
  if (r.status !== 0) {
    failed++;
    console.log(`   ${rel} FAILED (exit ${r.status})`);
    if (onActions) {
      const out = `${r.stdout || ""}\n${r.stderr || ""}`.split(/\r?\n/);
      const hits = out.filter((l) => /^(FAIL: |timeout: )/.test(l));
      const err = hits.length ? [] : out.filter((l) => /Error\b/.test(l)).slice(0, 1);
      for (const l of hits.concat(err).slice(0, 10)) console.log(`::error file=${rel},title=${esc(path.basename(rel))}::${esc(l.slice(0, 900))}`);
      if (!hits.length && !err.length) console.log(`::error file=${rel},title=${esc(path.basename(rel))}::exit ${r.status} with no FAIL line — see the job log`);
    }
  }
}

console.log(failed ? `\n${failed} of ${suites.length} suites failed.\n` : `\nAll ${suites.length} suites passed.\n`);
process.exit(failed ? 1 : 0);
