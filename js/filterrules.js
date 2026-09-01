// ======================================================================
// R32 — the assignment filter rule, parsed and counted.
//
// An assignment filter narrows a target, and until now every tool in this
// house could only say so: "at most N", "may reach it", "⚑ filter — may".
// That is honest and it is not an answer. The rules in a real tenant are
// small — (device.deviceName -startsWith "CPC-") or (device.deviceName
// -contains "AVD") — and the device inventory is already read. The number
// is computable.
//
// THE RULE IS: A COUNT IS OFFERED ONLY WHERE THE WHOLE RULE IS UNDERSTOOD.
// Not "best effort with a confidence marker" — Mihai's pick, and the right
// one, because a wrong count renders exactly as confidently as a right one
// and this is the failure mode builds 10483 through 10496 were spent
// removing. Anything the grammar below does not fully cover returns
// { ok: false, why }, the caller keeps saying "at most", and the screen
// names the part it could not read. There is no middle setting.
//
// GROUNDED IN THE DOCUMENTED GRAMMAR, not in what a tenant happened to
// contain: learn.microsoft.com/intune/fundamentals/filters/ref-device-
// properties. Properties are only mapped where the managedDevice field is
// unambiguous — deviceOwnership, isRooted, cpuArchitecture and
// deviceTrustType all need a value translation between the filter
// vocabulary and the Graph one, and a translation guessed here would be a
// wrong count wearing a right one's clothes. They are declared UNMAPPED and
// the rule that uses them is not evaluated.
//
// Also deliberate: this evaluates the rule, not the assignment. Whether a
// device is in the targeted group is a different question, answered
// elsewhere; the intersection of the two is what an assignment actually
// reaches, and this module only supplies the half a browser can compute.
// ======================================================================
const FilterRules = (() => {
  "use strict";

  const lc = (s) => String(s ?? "").toLowerCase();

  // ---------------------------------------------------------- properties --
  // filter property -> how to read it off a Graph managedDevice.
  // `version: true` means the value compares as a dotted version, not a
  // string, so -gt/-lt/-ge/-le mean something.
  const PROPS = {
    devicename:            { get: (d) => d.deviceName },
    manufacturer:          { get: (d) => d.manufacturer },
    model:                 { get: (d) => d.model },
    osversion:             { get: (d) => d.osVersion, version: true },
    operatingsystemversion:{ get: (d) => d.osVersion, version: true },
    devicecategory:        { get: (d) => d.deviceCategoryDisplayName },
    enrollmentprofilename: { get: (d) => d.enrollmentProfileName },
  };
  // Documented filter properties this deliberately does NOT evaluate, and
  // why. Named individually so the screen can say which one stopped it
  // rather than "unsupported rule".
  const UNMAPPED = {
    deviceownership:    "deviceOwnership uses Personal/Corporate where Graph reports personal/company — the translation would be a guess",
    isrooted:           "isRooted has no unambiguous managedDevice field",
    cpuarchitecture:    "cpuArchitecture is not on the managedDevice record this tool reads",
    devicetrusttype:    "deviceTrustType names Entra join types Graph spells differently",
    operatingsystemsku: "operatingSystemSKU is a Windows SKU name Graph does not return on managedDevice",
    devicemanagementtype:"deviceManagementType is an app-side property",
  };
  const SELECT = "id,deviceName,manufacturer,model,osVersion,deviceCategoryDisplayName,enrollmentProfileName,operatingSystem";

  // ------------------------------------------------------------- tokens --
  const OPS = {
    "-eq": "eq", eq: "eq", "-ne": "ne", ne: "ne",
    "-startswith": "startswith", startswith: "startswith",
    "-contains": "contains", contains: "contains",
    "-notcontains": "notcontains", notcontains: "notcontains",
    "-in": "in", in: "in", "-notin": "notin", notin: "notin",
    "-gt": "gt", gt: "gt", "-lt": "lt", lt: "lt",
    "-ge": "ge", ge: "ge", "-le": "le", le: "le",
  };
  const VERSION_ONLY = new Set(["gt", "lt", "ge", "le"]);

  function tokenize(src) {
    const t = [], s = String(src || "");
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "(" || c === ")" || c === "[" || c === "]" || c === ",") { t.push({ k: c }); i++; continue; }
      if (c === '"' || c === "'") {
        // No escape sequences in the documented grammar; a quote ends the
        // literal. An unterminated one is a parse failure, not a guess.
        const q = c; let j = i + 1, v = "";
        while (j < s.length && s[j] !== q) { v += s[j]; j++; }
        if (j >= s.length) return { err: "a quoted value is never closed" };
        t.push({ k: "str", v }); i = j + 1; continue;
      }
      const m = /^[-A-Za-z0-9_.$]+/.exec(s.slice(i));
      if (!m) return { err: `unexpected character ${JSON.stringify(c)}` };
      t.push({ k: "word", v: m[0] }); i += m[0].length;
    }
    return { t };
  }

  // -------------------------------------------------------------- parse --
  // expr := or ; or := and ("or" and)* ; and := unary ("and" unary)*
  // unary := "not" unary | "(" expr ")" | comparison
  function parse(rule) {
    if (!String(rule || "").trim()) return { ok: false, why: "the filter has no rule" };
    const tk = tokenize(rule);
    if (tk.err) return { ok: false, why: tk.err };
    const t = tk.t;
    let p = 0;
    const peek = () => t[p];
    const isWord = (w) => peek() && peek().k === "word" && lc(peek().v) === w;
    let fail = null;
    const bail = (why) => { if (!fail) fail = why; return null; };

    function parseExpr() { return parseOr(); }
    function parseOr() {
      let l = parseAnd(); if (fail) return null;
      while (isWord("or")) { p++; const r = parseAnd(); if (fail) return null; l = { n: "or", l, r }; }
      return l;
    }
    function parseAnd() {
      let l = parseUnary(); if (fail) return null;
      while (isWord("and")) { p++; const r = parseUnary(); if (fail) return null; l = { n: "and", l, r }; }
      return l;
    }
    function parseUnary() {
      if (isWord("not")) { p++; const x = parseUnary(); if (fail) return null; return { n: "not", x }; }
      if (peek() && peek().k === "(") {
        // A "(" starts either a group or a comparison. Look ahead: a
        // comparison's first token is the property word and its second is an
        // operator, which nothing else is.
        const save = p;
        p++;
        const inner = parseExpr();
        if (fail) return null;
        if (!peek() || peek().k !== ")") { p = save; return bail("a parenthesis is never closed"); }
        p++;
        return inner;
      }
      return parseCmp();
    }
    function parseCmp() {
      const w = peek();
      if (!w || w.k !== "word") return bail("expected a property name");
      p++;
      const dotted = w.v.split(".");
      if (dotted.length !== 2) return bail(`"${w.v}" is not a device.<property> reference`);
      const scope = lc(dotted[0]), prop = lc(dotted[1]);
      if (scope !== "device") return bail(`this counts DEVICES; "${scope}." rules are about something else`);
      if (UNMAPPED[prop]) return bail(UNMAPPED[prop]);
      if (!PROPS[prop]) return bail(`device.${dotted[1]} is not a property this evaluator knows`);
      const o = peek();
      if (!o || o.k !== "word" || !OPS[lc(o.v)]) return bail(`expected an operator after device.${dotted[1]}`);
      p++;
      const op = OPS[lc(o.v)];
      if (VERSION_ONLY.has(op) && !PROPS[prop].version) return bail(`${o.v} compares versions; device.${dotted[1]} is not a version`);
      // value: a string, a bare word (unquoted versions are documented), or
      // a bracketed list for -in / -notIn.
      const v = peek();
      if (!v) return bail("the rule ends where a value should be");
      if (v.k === "[") {
        p++;
        const list = [];
        while (peek() && peek().k !== "]") {
          const e = peek();
          if (e.k === "str" || e.k === "word") { list.push(e.v); p++; }
          else if (e.k === ",") p++;
          else return bail("a list holds only values");
        }
        if (!peek()) return bail("a list is never closed");
        p++;
        if (op !== "in" && op !== "notin") return bail(`${o.v} takes a single value, not a list`);
        return { n: "cmp", prop, op, list };
      }
      if (v.k !== "str" && v.k !== "word") return bail("expected a value");
      p++;
      if (op === "in" || op === "notin") return bail(`${o.v} takes a list in brackets`);
      if (v.k === "word" && lc(v.v) === "$null") return bail("$null comparisons are not evaluated here");
      return { n: "cmp", prop, op, val: v.v };
    }

    const ast = parseExpr();
    if (fail) return { ok: false, why: fail };
    if (p !== t.length) return { ok: false, why: "the rule has more in it than this evaluator could read" };
    return { ok: true, ast };
  }

  // ----------------------------------------------------------- evaluate --
  // Version compare, numeric segment by numeric segment. A segment that is
  // not a number makes the comparison unknowable, and unknowable is false
  // rather than a coin toss — the caller has already been told the rule
  // parsed, so a silent guess here would be the one dishonest step.
  function cmpVersion(a, b) {
    const A = String(a).split("."), B = String(b).split(".");
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = parseInt(A[i], 10), y = parseInt(B[i], 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  function evalNode(node, dev) {
    if (!node) return false;
    if (node.n === "and") return evalNode(node.l, dev) && evalNode(node.r, dev);
    if (node.n === "or") return evalNode(node.l, dev) || evalNode(node.r, dev);
    if (node.n === "not") return !evalNode(node.x, dev);
    const spec = PROPS[node.prop];
    const raw = spec ? spec.get(dev) : undefined;
    // A device that does not carry the property does not match — the same
    // way an absent value does not match in the service.
    if (raw === undefined || raw === null || raw === "") {
      return node.op === "ne" || node.op === "notcontains" || node.op === "notin";
    }
    const v = lc(raw);
    if (node.op === "in") return node.list.some((x) => lc(x) === v);
    if (node.op === "notin") return !node.list.some((x) => lc(x) === v);
    const w = lc(node.val);
    switch (node.op) {
      case "eq": return v === w;
      case "ne": return v !== w;
      case "startswith": return v.startsWith(w);
      case "contains": return v.includes(w);
      case "notcontains": return !v.includes(w);
      case "gt": case "lt": case "ge": case "le": {
        const c = cmpVersion(raw, node.val);
        if (c === null) return false;
        return node.op === "gt" ? c > 0 : node.op === "lt" ? c < 0 : node.op === "ge" ? c >= 0 : c <= 0;
      }
      default: return false;
    }
  }

  // The whole answer for one filter over one device list.
  //   { ok: true, matched, of }   |   { ok: false, why }
  function count(rule, devices) {
    const r = parse(rule);
    if (!r.ok) return r;
    const list = devices || [];
    let n = 0;
    for (const d of list) if (evalNode(r.ast, d)) n++;
    return { ok: true, matched: n, of: list.length };
  }

  const match = (ast, dev) => evalNode(ast, dev);

  return { parse, count, match, PROPS, UNMAPPED, SELECT, cmpVersion };
})();
