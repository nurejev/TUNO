// ======================================================================
// T24 / T27 — the ENGINE suite: matching, canonical bodies, hashes,
// catalogs, Housekeeping's groups and Rename's proposals.
//
// Every block names the design finding or section it defends, so a red line
// says which RULE was broken rather than which line moved. Run it with
// `npm test`, or on its own:  node tests/platformbaseline/engine.test.js
// ======================================================================
const { suite } = require("./harness");
const { ok, head, run, ROOT, fs, path, boot, readOf, CAT } = suite("engine");

run(async () => {

// =====================================================================
head("Finding 5 — the canonical body is one rule, and it strips the tenant");
{
  const w = boot();
  const E = w.MacBaseline;
  const raw = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "MACOS - DCP - Thing - D - Whatever - R26.6 - v3.0",
    description: "OIBID:ABC",
    createdDateTime: "2026-01-01T00:00:00Z", lastModifiedDateTime: "2026-02-02T00:00:00Z",
    version: 7, assignments: [{ id: "a" }], "assignments@odata.context": "x",
    roleScopeTagIds: ["0"], supportsScopeTags: true, settingCount: 3, creationSource: null,
    "@odata.context": "https://graph/x", "@odata.type": "#microsoft.graph.macOSGeneralDeviceConfiguration",
    "#microsoft.graph.assign": { title: "Assign" },
    platforms: "macOS", technologies: "mdm",
    templateReference: { templateId: "t1", templateDisplayVersion: "3", templateFamily: "none" },
    settings: [
      { settingInstance: { settingDefinitionId: "zzz", settingInstanceTemplateReference: { id: "x" }, choiceSettingValue: { value: "zzz_1" } } },
      { settingInstance: { settingDefinitionId: "aaa", choiceSettingValue: { value: "aaa_0" } } },
    ],
  };
  const c = E.canonicalBody("settingsCatalog", raw);
  for (const gone of ["id", "name", "displayName", "description", "createdDateTime", "lastModifiedDateTime",
    "version", "assignments", "assignments@odata.context", "roleScopeTagIds", "supportsScopeTags",
    "settingCount", "creationSource", "@odata.context", "#microsoft.graph.assign"]) {
    ok(`canonicalBody strips ${gone}`, !(gone in c));
  }
  ok("it keeps @odata.type — the anchor", c["@odata.type"] === "#microsoft.graph.macOSGeneralDeviceConfiguration");
  ok("it keeps the real configuration", c.platforms === "macOS" && c.technologies === "mdm");
  ok("templateDisplayVersion goes, the template id stays", !("templateDisplayVersion" in c.templateReference) && c.templateReference.templateId === "t1");
  ok("settings are sorted by settingDefinitionId", c.settings.map((s) => s.settingDefinitionId).join(",") === "aaa,zzz");
  ok("settingInstanceTemplateReference goes", !c.settings.some((s) => "settingInstanceTemplateReference" in s));
  ok("canonicalBody is idempotent", JSON.stringify(E.canonicalBody("settingsCatalog", c)) === JSON.stringify(c));

  // the hash is over the canonical body, so key order cannot move it
  const shuffled = Object.fromEntries(Object.entries(raw).reverse());
  const h1 = await E.hashBody("settingsCatalog", raw);
  const h2 = await E.hashBody("settingsCatalog", shuffled);
  ok("the hash is stable across key order", h1 === h2 && /^sha256:[0-9a-f]{64}$/.test(h1), h1 + " vs " + h2);
  // SAME CONTENT, DIFFERENT NAME → SAME HASH. The whole point of §6.2.
  const renamed = { ...raw, name: "Something Else Entirely", description: "different words" };
  ok("a renamed copy hashes the same", (await E.hashBody("settingsCatalog", renamed)) === h1);
  // a changed VALUE moves it
  const edited = JSON.parse(JSON.stringify(raw));
  edited.settings[1].settingInstance.choiceSettingValue.value = "aaa_1";
  ok("a changed setting value moves the hash", (await E.hashBody("settingsCatalog", edited)) !== h1);
  // scripts: base64 in, one text out, line endings normalised
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const crlf = await E.hashBody("scripts", { scriptContent: b64("echo one\r\necho two\r\n"), runAsAccount: "system" });
  const lf = await E.hashBody("scripts", { scriptContent: b64("echo one\necho two"), runAsAccount: "system" });
  ok("the same script written on Windows and on a Mac is one script", crlf === lf);
  ok("a different script is a different script", (await E.hashBody("scripts", { scriptContent: b64("echo three"), runAsAccount: "system" })) !== lf);
}

// =====================================================================
head("Findings 5 and 9 — the committed catalogs are schema 2 and honest");
{
  const w = boot();
  const LEAK = ["id", "createdDateTime", "lastModifiedDateTime", "assignments", "roleScopeTagIds",
    "supportsScopeTags", "settingCount", "creationSource", "version", "isAssigned", "priorityMetaData"];
  for (const [name, tool, cf, comm] of [
    ["macOS", "MacBaseline", "baseline/macos/catalog.json", "baseline/community/intune-my-macs/catalog.json"],
    ["Windows", "WinBaseline", "baseline/windows/catalog.json", "baseline/community/openintunebaseline/catalog.json"],
  ]) {
    const E = w[tool];
    for (const [what, p] of [["catalog", cf], ["community catalog", comm]]) {
      const cat = JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
      const errs = E.shapeErrors(cat);
      ok(`${name} ${what} passes the strict loader`, errs.length === 0, errs.slice(0, 3).join(" · "));
      ok(`${name} ${what} declares schema ${E.CATALOG_SCHEMA}`, cat.schema === E.CATALOG_SCHEMA);
      ok(`${name} ${what} carries three separate date/version fields`,
        "release" in cat && "sourceDate" in cat && "exported" in cat);
      ok(`${name} ${what} counts its surfaces`, cat.surfaces && Object.keys(cat.surfaces).length > 0);
      const seen = await E.verifyHashes(cat);
      ok(`${name} ${what}: every hash recomputes`, seen.tampered === 0, `${seen.tampered} tampered`);
      ok(`${name} ${what}: every policy carries a hash`, seen.unhashed === 0, `${seen.unhashed} unhashed`);
      const leaked = new Set();
      for (const pol of cat.policies) for (const k of Object.keys(pol.body || {})) if (LEAK.includes(k) || /@odata\.(context|etag|count|id)/.test(k)) leaked.add(k);
      ok(`${name} ${what}: no tenant metadata in any published body`, leaked.size === 0, [...leaked].join(","));
      ok(`${name} ${what}: no name or description inside a body`, !cat.policies.some((pol) => pol.body && ("name" in pol.body || "displayName" in pol.body || "description" in pol.body)));
      ok(`${name} ${what}: every policy carries its D/U token field`, cat.policies.every((pol) => "du" in pol));
    }
    // the CloudFellows catalog's release is DERIVED, with the mix beside it
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, cf), "utf8"));
    ok(`${name}: the release is a real Ryy.m, not the hardcoded "R26"`, /^R\d{2}\.\d{1,2}$/.test(cat.release), cat.release);
    ok(`${name}: releaseMix names every cut in the file`, cat.releaseMix && Object.keys(cat.releaseMix).length > 0);
    const derived = E.releaseOfSet(cat.policies).release;
    ok(`${name}: the release equals the newest the policies wear`, cat.release === derived, `${cat.release} vs ${derived}`);
    ok(`${name}: the mix adds up to the policy count`,
      Object.values(cat.releaseMix).reduce((a, b) => a + b, 0) === cat.policies.filter((p) => p.release).length);
    // §8.2 — the OIBID token has to survive into a create body
    const comCat = JSON.parse(fs.readFileSync(path.join(ROOT, comm), "utf8"));
    const tok = comCat.policies.filter((p) => p.oibId);
    if (tok.length) {
      ok(`${name}: the community rows keep the author's description beside the body`, tok.every((p) => /OIBID:/i.test(p.description || "")));
      const { entries } = E.importEntries(comCat, null);
      ok(`${name}: Import puts the OIBID token back into the create body`,
        entries.length > 0 && entries.every((e) => !/OIBID/i.test(comCat.policies.find((p) => p.name === e.newName)?.description || "") || /OIBID:/i.test(e.entry.obj.description || "")));
      ok(`${name}: Import never carries a source id`, entries.every((e) => !e.entry.sourceId));
    }
  }
}

// =====================================================================
head("Finding 9 — the loader refuses, and never loads a file part-way");
{
  const w = boot();
  const E = w.WinBaseline;
  const good = JSON.parse(fs.readFileSync(path.join(ROOT, "baseline/windows/catalog.json"), "utf8"));
  const bend = (f) => { const c = JSON.parse(JSON.stringify(good)); f(c); return c; };

  ok("schema 1 is refused", E.shapeErrors(bend((c) => { c.schema = 1; })).some((e) => /schema/.test(e)));
  ok("the macOS platform in a Windows catalog is refused", E.shapeErrors(bend((c) => { c.platform = "macos"; })).some((e) => /platform/.test(e)));
  ok("an unknown catalogId is refused", E.shapeErrors(bend((c) => { c.catalogId = "someone-elses"; })).some((e) => /catalogId/.test(e)));
  ok("an unknown kind is refused", E.shapeErrors(bend((c) => { c.kind = "tuno-something"; })).some((e) => /kind/.test(e)));
  ok("a section this tool does not cover is refused", E.shapeErrors(bend((c) => { c.policies[0].section = "mobileApps"; })).some((e) => /section/.test(e)));
  ok("a body that is not an object is refused", E.shapeErrors(bend((c) => { c.policies[0].body = "oops"; })).some((e) => /body/.test(e)));
  ok("a good catalog raises nothing", E.shapeErrors(good).length === 0);

  let threw = null;
  try { await E.loadCatalog(bend((c) => { c.schema = 1; c.platform = "macos"; c.catalogId = "x"; c.kind = "y"; })); }
  catch (e) { threw = e; }
  ok("loadCatalog throws rather than loading part of a bad file", !!threw);
  ok("it prints the first three reasons", threw && threw.message.split(" · ").length <= 4);
  ok("and keeps the whole list for anyone who wants it", threw && Array.isArray(threw.errors) && threw.errors.length >= 4);

  // A BODY EDITED AFTER EXPORT IS NOT THE BASELINE.
  const tampered = bend((c) => { c.policies[0].body.__snuck = "in"; });
  const loaded = await E.loadCatalog(tampered);
  ok("a body that does not match its hash is flagged tampered", loaded.policies[0].tampered === true);
  ok("and is not importable", loaded.policies[0].importable === false);
  ok("the rest of the catalog is untouched", !loaded.policies.slice(1).some((p) => p.tampered));
  const { refused } = E.importEntries(loaded, null);
  ok("Import refuses it by name, with the reason on the row",
    refused.some((r) => r.name === loaded.policies[0].name && /hash/.test(r.why)));
}

// =====================================================================
head("Finding 8 — similarity is Jaccard, anchored, one-to-one, with review");
{
  const w = boot();
  const E = w.WinBaseline;
  const ids = (n, from) => ({ settings: Array.from({ length: n }, (_, i) => ({ settingInstance: { settingDefinitionId: `s${(from || 0) + i}`, choiceSettingValue: { value: "x" } } })) });
  ok("jaccard divides by the union, not the smaller set", Math.abs(E.jaccard(new Set(["a"]), new Set(["a", "b", "c", "d"])) - 0.25) < 1e-9);
  ok("identical sets score 1", E.jaccard(new Set(["a", "b"]), new Set(["a", "b"])) === 1);
  ok("disjoint sets score 0", E.jaccard(new Set(["a"]), new Set(["b"])) === 0);
  ok("the threshold is 0.6", E.SIMILARITY_MIN === 0.6);
  ok("the review margin is 0.05", E.REVIEW_MARGIN === 0.05);
  ok("the anchor separates kinds", E.anchorOf("compliance", { "@odata.type": "#microsoft.graph.windows10CompliancePolicy" }) !== E.anchorOf("deviceConfigurations", { "@odata.type": "#microsoft.graph.windows10GeneralConfiguration" }));

  // 1 setting inside 100 must NOT match — the exact overclaim of the old score
  const cat = { schema: 2, kind: "tuno-windows-baseline", platform: "windows", catalogId: "cloudfellows", policies: [
    { key: "k", name: "Win - SEC - Big - D - Hundred - R26.6 - v1.0", release: "R26.6", version: "1.0",
      section: "settingsCatalog", sectionLabel: "Settings catalog policies", area: "SettingsCatalog", du: "D",
      importable: true, hash: "sha256:deadbeef", body: ids(100) },
  ] };
  const one = { id: "t1", name: "Something Small", section: "settingsCatalog", sectionLabel: "Settings catalog policies", description: "", body: ids(1), hash: "sha256:aaa", du: "" };
  ok("a 1-setting policy does not match a 100-setting one", E.compare([one], cat).rows[0].status === "missing");

  // two near-equal candidates -> review, not a coin flip
  const near1 = { id: "n1", name: "Candidate One", section: "settingsCatalog", sectionLabel: "Settings catalog policies", description: "", body: ids(100), hash: "sha256:b1", du: "" };
  const near2 = { id: "n2", name: "Candidate Two", section: "settingsCatalog", sectionLabel: "Settings catalog policies", description: "", body: ids(99), hash: "sha256:b2", du: "" };
  const rev = E.compare([near1, near2], cat);
  ok("two candidates within the margin read as review, not match", rev.rows[0].status === "review", rev.rows[0].status);
  ok("review names the candidates it could not choose between", (rev.rows[0].candidates || []).length >= 2);
  ok("and claims neither of them", !rev.rows[0].tenant);

  // a clear winner IS claimed, one-to-one
  const far = { id: "f1", name: "Nothing Alike", section: "settingsCatalog", sectionLabel: "Settings catalog policies", description: "", body: ids(100, 500), hash: "sha256:c1", du: "" };
  const won = E.compare([near1, far], cat);
  ok("a clear winner is claimed by similarity", won.rows[0].tenant === near1 && won.rows[0].how === "similarity");
  ok("and the loser is left over, not claimed twice", won.rows.filter((r) => r.tenant === near1).length === 1);
}

// =====================================================================
head("§6.1 — the order runs for the repo catalog too, and duplicates show");
{
  const w = boot();
  const E = w.WinBaseline;
  const body = { settings: [{ settingInstance: { settingDefinitionId: "a", choiceSettingValue: { value: "1" } } }] };
  const h = await E.hashBody("settingsCatalog", body);
  const cat = { schema: 2, kind: "tuno-windows-baseline", platform: "windows", catalogId: "cloudfellows", policies: [
    { key: "win sec thing d name", name: "Win - SEC - Thing - D - Name - R26.6 - v1.0", release: "R26.6", version: "1.0",
      section: "settingsCatalog", sectionLabel: "Settings catalog policies", area: "SettingsCatalog", du: "D",
      importable: true, hash: h, body },
  ] };
  const P = (id, name, hash) => ({ id, name, section: "settingsCatalog", sectionLabel: "Settings catalog policies",
    description: "", body, hash: hash || h, du: E.duOf(name), modified: "", created: "", assignments: [] });

  // THE REGRESSION: a repo policy renamed on a tenant used to read `missing`
  ok("a renamed copy is found by content, not reported missing",
    E.compare([P("t1", "Whatever Somebody Called It")], cat).rows[0].status === "match");
  ok("and the row says HOW it was found", E.compare([P("t1", "Whatever Somebody Called It")], cat).rows[0].how === "hash");
  ok("the name match still wins over the content match",
    E.compare([P("t1", "Win - SEC - Thing - D - Name - R26.6 - v1.0")], cat).rows[0].how === "key");

  // same content under a second name in the tenant
  const dup = E.compare([P("t1", "Win - SEC - Thing - D - Name - R26.6 - v1.0"), P("t2", "Win - SEC - Thing - D - Copy Of It - R26.6 - v1.0")], cat);
  ok("the second copy reads as a duplicate", dup.rows.some((r) => r.status === "duplicate"), dup.rows.map((r) => r.status).join(","));
  ok("the duplicate row names the copy it duplicates", dup.rows.find((r) => r.status === "duplicate").twinOf === "Win - SEC - Thing - D - Name - R26.6 - v1.0");

  // the statuses that depend on the version
  const older = P("t3", "Win - SEC - Thing - D - Name - R26.2 - v1.0");
  ok("an older release reads outdated", E.compare([older], cat).rows[0].status === "outdated");
  const newer = P("t4", "Win - SEC - Thing - D - Name - R26.9 - v1.0");
  ok("a newer release reads ahead", E.compare([newer], cat).rows[0].status === "ahead");
  const edited = { ...P("t5", "Win - SEC - Thing - D - Name - R26.6 - v1.0"), hash: "sha256:different", body: { settings: [{ settingInstance: { settingDefinitionId: "a", choiceSettingValue: { value: "2" } } }] } };
  ok("same version, different content reads differs", E.compare([edited], cat).rows[0].status === "differs");
  const bare = P("t6", "Win - SEC - Thing - D - No Tag At All");
  ok("the prefix with no release and no version reads unversioned", E.compare([bare], cat).rows.some((r) => r.status === "unversioned"));
  // a different body too, or the similarity pass would rightly claim it
  const extra = { ...P("t7", "Win - SEC - Something Else - D - Not In The Catalog - R26.6 - v1.0", "sha256:zzz"), body: { settings: [{ settingInstance: { settingDefinitionId: "zzz", choiceSettingValue: { value: "9" } } }] } };
  ok("a convention name the catalog lacks reads extra", E.compare([extra], cat).rows.some((r) => r.status === "extra"));
  ok("nothing at all reads missing", E.compare([], cat).rows[0].status === "missing");
}

// =====================================================================
head("§6.3 — one vocabulary, and `attention` is what the default filter is");
{
  const w = boot();
  const E = w.MacBaseline;
  const keys = Object.keys(E.STATUS);
  for (const k of ["match", "differs", "outdated", "ahead", "missing", "duplicate", "unversioned", "review", "extra"]) {
    ok(`the vocabulary has ${k}`, keys.includes(k));
  }
  ok("the retired words are gone", !keys.includes("ok") && !keys.includes("present"));
  ok("every status says what it means", keys.every((k) => E.STATUS[k].why && E.STATUS[k].label));
  ok("ATTENTION is missing/outdated/differs/duplicate/review/ahead",
    E.ATTENTION.slice().sort().join(",") === ["ahead", "differs", "duplicate", "missing", "outdated", "review"].sort().join(","), E.ATTENTION.join(","));
  ok("a match never needs attention", E.STATUS.match.attention === false);
}

// =====================================================================
head("Finding 3 — only 'not found' verifies a delete");
{
  const src = fs.readFileSync(path.join(ROOT, "js/platformbaseline.js"), "utf8");
  ok("the read-back is no longer wrapped in a bare catch",
    !/try \{ back = await Graph\.readOne\(url[^)]*\); \} catch \{ back = null; \}/.test(src));
  ok("only GraphError.kind === notfound verifies", /if \(e && e\.kind === "notfound"\) verified = true;/.test(src));
  ok("anything else is unverified, and says which kind it was", /the read-back did not answer \(\$\{\(e && e\.kind\)/.test(src));
  ok("an unverified delete is its own outcome, not a success", /outcome: "unverified"/.test(src) && /check manually in the portal/.test(src));
  ok("the results line counts unverified separately", /unverified — check manually/.test(src));
  ok("the KEPT copy is re-read before the delete, not only the candidate",
    /async function hkFresh\(p, keepName, keepPath, keepId\)/.test(src) && /is gone — nothing to keep this in favour of/.test(src));
  ok("a 404 on the candidate reads as already gone, not as an error", /if \(e && e\.kind === "notfound"\) return \{ refused: "already gone" \};/.test(src));
}

// =====================================================================
head("§4.5 — Housekeeping's two groups, and their two defaults");
{
  const w = boot();
  const E = w.WinBaseline;
  const P = (id, name, hash, extra) => ({ id, name, section: "settingsCatalog", sectionLabel: "Settings catalog policies",
    description: "", body: {}, hash, du: "D", modified: "", created: "2026-01-01", assignments: [], ...extra });
  // group 1 — one identity, two copies
  const g1 = E.housekeeping([
    P("a", "Win - SEC - Thing - D - Name - R26.6 - v2.0", "sha256:new"),
    P("b", "Win - SEC - Thing - D - Name - R26.2 - v1.0", "sha256:old"),
  ]);
  ok("a superseded copy is one group", g1.length === 1 && g1[0].kind === "supersededed");
  ok("the newest is kept", g1[0].keep.name === "Win - SEC - Thing - D - Name - R26.6 - v2.0");
  ok("and the older one is TICKED — the answer is not in doubt", g1[0].ticked === true && g1[0].retire.length === 1);
  // group 2 — one body, two identities
  const g2 = E.housekeeping([
    P("a", "Win - SEC - Thing - D - Name - R26.6 - v1.0", "sha256:same"),
    P("b", "Win - SEC - Other - D - Copy - R26.6 - v1.0", "sha256:same"),
  ]);
  ok("the same body under two names is its own group", g2.length === 1 && g2[0].kind === "duplicate");
  ok("and is NOT ticked — which name is right is a judgement", g2[0].ticked === false);
  ok("the row says what it duplicates", g2[0].retire[0].sameContentAs === g2[0].keep.name);
  // neither in the convention -> review
  const g3 = E.housekeeping([
    P("a", "Some Policy", "sha256:same"),
    P("b", "Some Other Policy", "sha256:same"),
  ]);
  ok("two non-convention names with one body are flagged review", g3.length === 1 && g3[0].review === true);
  ok("and nothing is ticked there either", g3[0].ticked === false);
  // one body, one key, twice -> group 1, not group 2
  ok("a hash shared under ONE key is not a duplicate group",
    E.housekeeping([P("a", "Win - SEC - Thing - D - Name - R26.6 - v2.0", "sha256:s"), P("b", "Win - SEC - Thing - D - Name - R26.2 - v1.0", "sha256:s")])
      .every((g) => g.kind === "supersededed"));
  // refusals
  const asg = E.housekeeping([
    P("a", "Win - SEC - Thing - D - Name - R26.6 - v2.0", "sha256:new"),
    P("b", "Win - SEC - Thing - D - Name - R26.2 - v1.0", "sha256:old", { assignments: [{ id: "x" }] }),
  ]);
  ok("an assigned older copy is refused, not ticked", /assigned to 1 target/.test(asg[0].retire[0].refused));
  const cat = { schema: 2, kind: "tuno-windows-baseline", platform: "windows", catalogId: "cloudfellows",
    policies: [{ name: "Win - SEC - Thing - D - Name - R26.2 - v1.0", version: "1.0", section: "settingsCatalog" }] };
  const kept = E.housekeeping([
    P("a", "Win - SEC - Thing - D - Name - R26.6 - v2.0", "sha256:new"),
    P("b", "Win - SEC - Thing - D - Name - R26.2 - v1.0", "sha256:old"),
  ], cat);
  ok("the copy the committed catalog keeps is refused", /the committed catalog keeps/.test(kept[0].retire[0].refused));
}

// =====================================================================
head("Findings 6 and §8.5 — Rename re-checks at the write, and T24 converts");
{
  const src = fs.readFileSync(path.join(ROOT, "js/platformbaseline.js"), "utf8");
  ok("the name set is re-read at Apply, not reused from the dry run", /Re-reading the names in use…/.test(src));
  ok("a name taken since the dry run stops that rename", /a policy took this name since the dry run/.test(src));
  ok("the policy is re-read for drift immediately before its PATCH", /checking it has not moved…/.test(src));
  ok("a policy renamed since the plan is left alone", /not the one the plan named, so it was left alone/.test(src));
  ok("a policy deleted since the plan says so", /the policy is gone since the dry run/.test(src));
  ok("the live name set follows each rename", /set2\.add\(String\(p\.target\)\.toLowerCase\(\)\); set2\.delete/.test(src));

  const w = boot();
  const mac = w.MacBaseline, win = w.WinBaseline;
  // §8.4 vs §8.5 — the TOKEN decides, and it is read off the spec
  ok("OpenIntuneBaseline carries a token, so its names are kept", !!win.spec.upstream.idToken);
  ok("intune-my-macs carries none, so its names are converted", !mac.spec.upstream.idToken);

  const P = (id, name, section) => ({ id, name, section: section || "settingsCatalog", sectionLabel: "Settings catalog policies",
    description: "", body: {}, hash: "sha256:x", du: "", modified: "2026-03-04T00:00:00Z", created: "", assignments: [], surface: "" });
  // a community-matched policy on T24 gets the MACOS convention proposed
  const commCat = { schema: 2, kind: "tuno-community", platform: "macos", catalogId: "imm", label: "intune-my-macs",
    sourceDate: "2026-08-07", nameRe: null, idToken: null,
    policies: [{ name: "Enable FileVault", key: "enable filevault", section: "settingsCatalog", sectionLabel: "Settings catalog policies", folder: "Disk Encryption", du: "", body: {}, hash: "sha256:x" }] };
  const tenant = [P("t1", "Enable FileVault")];
  const cmp = { catalog: commCat, rows: [{ tenant: tenant[0], baseline: commCat.policies[0], status: "match" }] };
  const props = mac.renameProposals(tenant, commCat, cmp);
  ok("T24 proposes for a community-matched policy", props.length === 1, JSON.stringify(props.map((p) => p.status)));
  ok("it asks for the D/U rather than guessing one", props[0].status === "needsdu");
  ok("the proposal wears the MACOS convention", /^MACOS - DCP - Disk Encryption - D - Enable FileVault - R26\.8 - v1\.0$/.test(props[0].proposed), props[0].proposed);
  ok("the release comes from the upstream cut, not from today", /R26\.8/.test(props[0].proposed));
  ok("and the row says where it came from", props[0].from === "community");

  // T27: a token-bearing community policy is never proposed a new name
  const oibCat = { schema: 2, kind: "tuno-community", platform: "windows", catalogId: "oib", label: "OpenIntuneBaseline",
    nameRe: "^\\s*Win\\s*-\\s*OIB\\b", idToken: "OIBID", sourceDate: "2026-05-06",
    policies: [{ name: "Win - OIB - ES - ASR - D - Rules - v3.7", key: "win oib es asr d rules", section: "settingsCatalog", sectionLabel: "Settings catalog policies", oibId: "ABC", body: {}, hash: "sha256:y" }] };
  const wt = [P("w1", "Win - OIB - ES - ASR - D - Rules - v3.7")];
  const wcmp = { catalog: oibCat, rows: [{ tenant: wt[0], baseline: oibCat.policies[0], status: "match" }] };
  const wp = win.renameProposals(wt, oibCat, wcmp);
  ok("T27 proposes nothing for an OIB policy", wp.length === 1 && wp[0].status === "community");
  ok("and says why the name is kept", /deployer can still maintain it/.test(wp[0].why));

  // §4.3 row 2 — the prefix with no version at all gets both, strictly formed
  const bare = win.renameProposals([P("b1", "Win - DCP - Office - D - Security")], oibCat, null);
  ok("a prefix with no version is proposed a release AND v1.0.0", bare.length === 1 && /- R26\.3 - v1\.0\.0$/.test(bare[0].proposed), bare[0] && bare[0].proposed);
  // the existing behaviour still stands
  const stamp = win.renameProposals([P("b2", "Win - DCP - Office - D - Security - v3.6")], oibCat, null);
  ok("a prefix with a version and no tag is still stamped from last-modified", /- R26\.3 - v3\.6$/.test(stamp[0].proposed), stamp[0] && stamp[0].proposed);
  ok("a fully conventional name is not proposed anything", win.renameProposals([P("b3", "Win - DCP - Office - D - Security - R26.6 - v3.6")], oibCat, null).length === 0);
}

});
