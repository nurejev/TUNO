// ======================================================================
// T27 — 🪟 Windows baseline (R39, BETA). The macOS baseline's treatment
// pointed at Windows: the tenant's Windows policies against the
// CloudFellows Windows baseline, and against the community baseline —
// SkipToTheEndpoint's OpenIntuneBaseline (WINDOWS/, bundled as
// js/oibWindowsData.js) — with export on the baseline tenant, import
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
  kind: "tuno-windows-baseline", bundledGlobal: "BASELINE_WINDOWS", dataFile: "js/winbaselineData.js",
  communityGlobal: "COMMUNITY_WINDOWS", communityDataFile: "js/oibWindowsData.js",
  upstream: {
    id: "oib", label: "OpenIntuneBaseline", icon: "🧩", author: "James Robinson (SkipToTheEndpoint)",
    repo: "github.com/SkipToTheEndpoint/OpenIntuneBaseline",
    url: "https://github.com/SkipToTheEndpoint/OpenIntuneBaseline",
    zipUrl: "https://github.com/SkipToTheEndpoint/OpenIntuneBaseline/archive/refs/heads/main.zip",
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
  proposeName(row, tag) {
    const raw = String(row.up.name || "Unnamed").trim();
    const m = /^Win\s*-\s*OIB\s*-\s*(.+?)\s*-\s*v\d+(?:\.\d+)*\s*$/i.exec(raw);
    let mid = m ? m[1] : raw.replace(/\s*-\s*v\d+(?:\.\d+)*\s*$/i, "");
    mid = mid.replace(/^ES\s*-/i, "SEC -").replace(/^(SC|TP)\s*-/i, "DCP -").replace(/^Compliance\s*-/i, "CMP -");
    return `Win - ${mid} - ${tag} - v1.0`;
  },
};
const WinBaseline = PlatformBaseline.engine(WIN_BASELINE_SPEC);
const WinBaselineTool = PlatformBaseline.screen(WIN_BASELINE_SPEC, WinBaseline);
