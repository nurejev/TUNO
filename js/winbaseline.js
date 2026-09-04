// ======================================================================
// T27 — 🪟 Windows baseline (R39, BETA). The macOS baseline's treatment
// pointed at Windows: the tenant's Windows policies against the
// CloudFellows Windows baseline, and against the community baseline —
// SkipToTheEndpoint's OpenIntuneBaseline (WINDOWS/, read from
// baseline/community/openintunebaseline/) — with export on the baseline tenant, import
// everywhere, and the upstream watch that authors the next cut.
//
// THE MACHINERY LIVES IN js/platformbaseline.js; this file is the
// Windows SPEC. The convention, learned from cloudfellows.dev (Mihai,
// 2026-09-03), is the OIB naming with the OIB tag replaced by the
// discipline and the release date appended:
//
//   Win - SEC - App Control for Business - D - AllowAll - R26.6 - v3.0
//   └─┘   └─┘   └──────────────────────┘  └┘  └──────┘   └────┘   └──┘
//   prefix type  area                    D/U  description release  version
//
// while OIB's own policies read
//
//   Win - OIB - ES - Attack Surface Reduction - D - ASR Rules (L2) - v3.7
//
// — no release tag, the OIB tag in second place, and an OIBID:<guid>
// in every description (v3.8+, tracked in WINDOWS/PolicyManifest.json).
// Those names are KEPT VERBATIM on import (Mihai's rule: OIB is a
// community baseline that can be updated through TUNO or through OIB's
// own deployer; keeping the name and the token is what makes that true).
// ======================================================================
const WIN_BASELINE_SPEC = {
  code: "T27", platform: "Windows", icon: "🪟", label: "Windows baseline",
  prefix: "Win", prefixRe: /^\s*Win\s*-/i,
  screen: "screen-winbaseline", ids: "wb",
  readLabel: "🪟 Read the tenant",
  kind: "tuno-windows-baseline", platformId: "windows",
  catalogPath: "baseline/windows/catalog.json",
  communityPath: "baseline/community/openintunebaseline/catalog.json",
  // The strict loader's allow-list (§7.3): which catalog a file may claim
  // to be, and which surfaces a Windows baseline policy may live on (§3).
  catalogId: "cloudfellows", communityIds: ["oib"],
  sections: ["settingsCatalog", "deviceConfigurations", "admx", "compliance", "intents", "scripts",
    "remediations", "autopilot", "enrolment", "esp", "updates", "driverUpdates", "filters"],
  upstream: {
    id: "oib", label: "OpenIntuneBaseline", icon: "🧩", author: "James Robinson (SkipToTheEndpoint)",
    repo: "github.com/SkipToTheEndpoint/OpenIntuneBaseline",
    url: "https://github.com/SkipToTheEndpoint/OpenIntuneBaseline",
    zipUrl: "https://github.com/SkipToTheEndpoint/OpenIntuneBaseline/archive/refs/heads/main.zip",
    github: { owner: "SkipToTheEndpoint", repo: "OpenIntuneBaseline", branch: "main" },
    importerUrl: "https://github.com/SkipToTheEndpoint/OpenIntuneBaseline/blob/main/FAQ.md",
    // OIB's own convention and its own identity token
    nameRe: "^\\s*Win\\s*-\\s*OIB\\b", idToken: "OIBID",
    // the Windows folder only — MACOS, WINDOWS365 and BYOD are other baselines
    pathRe: /\/WINDOWS\/IntuneManagement\//i, platformRe: /windows/i,
    manifestRe: /\/WINDOWS\/PolicyManifest\.json$/i,
    otherRe: /\.(ps1|csv|md|xml)$/i,
  },
  // A proposed canonical name for a NEW upstream control: the OIB tag
  // gives way to the discipline (ES → SEC, SC/TP → DCP, Compliance → CMP,
  // WUfB kept), the release is stamped, the version starts at v1.0.
  // The ❓ How it works pane's words (finding 12) — see js/macbaseline.js
  // for why they live in the SPEC rather than in index.html.
  help: {
    overview: "Match this tenant's Windows policies against a catalog, create what is missing, bring names into the convention and retire the copies a re-cut left behind. The catalog is either the CloudFellows export (authored on the reference tenant and committed to this repository) or SkipToTheEndpoint's <code>OpenIntuneBaseline</code>, read from the repository or live from github.com.",
    identity: "A CloudFellows Windows policy is named <code>Win - &lt;SEC|DCP|CMP|…&gt; - &lt;area&gt; - &lt;D|U&gt; - &lt;description&gt; - Ryy.m - vX.Y.Z</code> — for example <code>Win - SEC - App Control for Business - D - AllowAll - R26.6 - v3.0</code>. <code>Ryy.m</code> is the release the policy was cut in, a date: year, then month, so R26.6 is June 2026 and R27.1 comes after R26.12. Releases compare first, versions break the tie segment by segment. The <b>key</b> is the name with release and version stripped: two policies with the same key are the same identity. The <code>D</code> or <code>U</code> token says devices or users, and it is what Import reads to pick a pilot group.",
    extra: "<b>OpenIntuneBaseline stamps an <code>OIBID:&lt;guid&gt;</code> into every description</b>, and that token identifies a deployed copy before any name does — a renamed copy still identifies. So OIB's names are kept <b>verbatim</b> on import, token and all: that is what lets OIB's own deployer go on updating what TUNO created, and it is why ✏️ Rename never proposes a convention name for a token-bearing policy. A convention-named copy sitting beside an OIB copy with the same content shows as a <b>Duplicate</b>. Driver update profiles are listed so the gap is visible but cannot be imported — their approvals are bound to the tenant that made them.",
  },
  proposeName(row, tag) {
    const raw = String(row.name || "Unnamed").trim();
    const m = /^Win\s*-\s*OIB\s*-\s*(.+?)\s*-\s*v\d+(?:\.\d+)*\s*$/i.exec(raw);
    let mid = m ? m[1] : raw.replace(/\s*-\s*v\d+(?:\.\d+)*\s*$/i, "");
    mid = mid.replace(/^ES\s*-/i, "SEC -").replace(/^(SC|TP)\s*-/i, "DCP -").replace(/^Compliance\s*-/i, "CMP -");
    return `Win - ${mid} - ${tag} - v1.0`;
  },
};
const WinBaseline = PlatformBaseline.engine(WIN_BASELINE_SPEC);
const WinBaselineTool = PlatformBaseline.screen(WIN_BASELINE_SPEC, WinBaseline);
