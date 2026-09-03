// ======================================================================
// T24 — 🍎 macOS baseline (R35). Match the tenant's macOS policies
// against the CloudFellows macOS baseline (baseline/macos/catalog.json,
// read from the site) — and, since build 10571, against the community
// baseline too (microsoft/intune-my-macs, baseline/community/intune-my-macs/),
// ENCA's Joey Verlinden treatment.
//
// THE MACHINERY LIVES IN js/platformbaseline.js — one engine and one
// screen for every platform that wears the convention; this file is the
// macOS SPEC. Everything T24 knew (the naming convention, the buckets,
// the four acts, the cfdev gate, the floating bar) is unchanged and its
// exports keep their names: MacBaseline and MacBaselineTool.
//
//   MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0
//
// The version history of this tool up to build 10570 is in TOOL_VERSIONS
// (js/version.js) and the header of js/platformbaseline.js.
// ======================================================================
const MAC_BASELINE_SPEC = {
  code: "T24", platform: "macOS", icon: "🍎", label: "macOS baseline",
  prefix: "MACOS", prefixRe: /^\s*MACOS\b/i,
  screen: "screen-macbaseline", ids: "mb",
  readLabel: "🍎 Read the tenant",
  kind: "tuno-macos-baseline", catalogPath: "baseline/macos/catalog.json",
  communityPath: "baseline/community/intune-my-macs/catalog.json",
  upstream: {
    id: "imm", label: "intune-my-macs", icon: "🍏", author: "Microsoft",
    repo: "github.com/microsoft/intune-my-macs",
    url: "https://github.com/microsoft/intune-my-macs",
    zipUrl: "https://github.com/microsoft/intune-my-macs/archive/refs/heads/main.zip",
    github: { owner: "microsoft", repo: "intune-my-macs", branch: "main" },
    importerUrl: null,
    // no naming convention and no identity token: its policies match by
    // exact name only, and land as PRESENT (no versions to compare)
    nameRe: null, idToken: null,
    pathRe: /\/macOS\//i, platformRe: /macos/i,
    otherRe: /\.(mobileconfig|sh|zsh|ps1|pkg)$/i,
  },
  // A proposed canonical name for a NEW upstream control — a starting point
  // for the rename field, the middle words Mihai's to curate.
  proposeName(row, tag) {
    const type = row.up.kind === "compliance" ? "CMP" : "DCP";
    const cat9 = row.up.folder && !/configurations|macos|intune/i.test(row.up.folder)
      ? row.up.folder.replace(/\b\w/g, (c) => c.toUpperCase()) : "Device Configuration";
    const base = String(row.up.name || "Unnamed").replace(/\s*-\s*R\d{2}\.\d+.*$/i, "").trim();
    return `MACOS - ${type} - ${cat9} - D - ${base} - ${tag} - v1.0`;
  },
};
const MacBaseline = PlatformBaseline.engine(MAC_BASELINE_SPEC);
const MacBaselineTool = PlatformBaseline.screen(MAC_BASELINE_SPEC, MacBaseline);
