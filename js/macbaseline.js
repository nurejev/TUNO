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
  kind: "tuno-macos-baseline", platformId: "macos",
  catalogPath: "baseline/macos/catalog.json",
  communityPath: "baseline/community/intune-my-macs/catalog.json",
  // The strict loader's allow-list (§7.3): which catalog a file may claim
  // to be, and which surfaces a macOS baseline policy may live on (§3).
  // A file naming anything else is refused whole, not partly loaded.
  catalogId: "cloudfellows", communityIds: ["imm"],
  sections: ["settingsCatalog", "deviceConfigurations", "compliance", "intents", "scripts",
    "customAttributes", "enrolment", "filters", "ade"],
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
  // THE WORDS LIVE HERE, ONCE (design finding 12, build 10590). index.html
  // used to carry its own three paragraphs about this tool; they went stale
  // and contradicted the code. The ❓ How it works pane renders these, and
  // the shared parts — the matching order, the status table, what each act
  // does, where the catalogs come from — are written once in the engine and
  // are the same on both platforms. Only what is TRUE OF macOS is here.
  help: {
    overview: "Match this tenant's macOS policies against a catalog, create what is missing, bring names into the convention and retire the copies a re-cut left behind. The catalog is either the CloudFellows export (authored on the reference tenant and committed to this repository) or Microsoft's <code>intune-my-macs</code>, read from the repository or live from github.com.",
    identity: "A CloudFellows macOS policy is named <code>MACOS - &lt;DCP|CMP|…&gt; - &lt;area&gt; - &lt;D|U&gt; - &lt;description&gt; - Ryy.m - vX.Y.Z</code>. <code>Ryy.m</code> is the release the policy was cut in — a date, year then month, so R26.6 is June 2026 and R27.1 comes after R26.12 — and it is compared first; the version breaks the tie, segment by segment. The <b>key</b> is the name with the release and version stripped and separators normalised: two policies with the same key are the same identity. The <code>D</code> or <code>U</code> token says whether the policy targets devices or users, and it is what Import reads to pick a pilot group.",
    extra: "<b>intune-my-macs has no naming convention and no versions in its names</b>, so matching it by name almost never hits: the content hash and the similarity pass do the work. When it matches, ✏️ Rename can propose a name in the MACOS convention — the folder the policy lived in upstream becomes the area, and the release is cut from the upstream publication date. That is deliberate and the opposite of the Windows rule: nothing upstream will ever come back to update what TUNO created from intune-my-macs, so the name may as well be ours.",
  },
  // row: { name, section, folder, du } — a policy, from the tenant or from
  // a community catalog. intune-my-macs has no convention of its own, so
  // §8.5 converts its names to this one; the folder it lived in upstream
  // becomes the area, and the D/U token defaults to D (a device policy) —
  // the field is editable before anything is written.
  proposeName(row, tag) {
    const type = row.section === "compliance" ? "CMP" : "DCP";
    const area = row.folder && !/configurations|macos|intune/i.test(row.folder)
      ? String(row.folder).replace(/\b\w/g, (c) => c.toUpperCase()) : "Device Configuration";
    const base = String(row.name || "Unnamed").replace(/\s*-\s*R\d{2}\.\d+.*$/i, "").replace(/\s*-\s*v{1,2}\.?\s?\d+(?:\.\d+)*\s*$/i, "").trim();
    return `MACOS - ${type} - ${area} - ${row.du || "D"} - ${base} - ${tag} - v1.0`;
  },
};
const MacBaseline = PlatformBaseline.engine(MAC_BASELINE_SPEC);
const MacBaselineTool = PlatformBaseline.screen(MAC_BASELINE_SPEC, MacBaseline);
