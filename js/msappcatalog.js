// ======================================================================
// MICROSOFT APP CATALOG — the apps a locked-down Windows estate still needs.
//
// This is CONTENT, not branding: the list of Microsoft tools and apps the
// AppLocker coverage check verifies against an imported policy, each with
// the real paths its executables run from and the publisher fields AppLocker
// sees on the signature. The point of the check is the class of app that
// BREAKS under a naive "default rules + Program Files" policy — anything
// installed per-user under %LOCALAPPDATA% is outside both default allow
// rules, and OneDrive is the canonical casualty.
//
// Shape per entry:
//   id        stable key
//   name      display name
//   critical  true → blocking it is a finding, not a note
//   context   one line on where/how it runs (shown in the result row)
//   collection "Exe" | "Appx" — which rule collection judges it
//   artifacts [{ path, publisher:{ name, product, binary } }]
//       path      AppLocker-style path with macros (%LOCALAPPDATA% is not an
//                 AppLocker macro — it is expanded to the OSDRIVE\Users form
//                 the evaluator understands)
//       publisher the fields as they appear in a publisher rule; product and
//                 binary in UPPERCASE the way AppLocker writes them
//
// Publisher name for almost everything here:
//   O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US
//
// Versions are deliberately NOT pinned per artifact: these apps auto-update,
// so the evaluator flags a version-bounded rule as "verify the deployed
// version" instead of pretending to know what is installed.
// ======================================================================
const MS_PUB = "O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US";

const MS_APP_CATALOG = [
  {
    id: "onedrive-user",
    name: "OneDrive (per-user install)",
    critical: true,
    context: "Installs and runs from the USER profile — %LOCALAPPDATA%\\Microsoft\\OneDrive — so it is outside every Program Files / Windows default rule. The single most common thing a new AppLocker policy silently breaks.",
    collection: "Exe",
    artifacts: [
      { path: "%OSDRIVE%\\Users\\*\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe", publisher: { name: MS_PUB, product: "MICROSOFT ONEDRIVE", binary: "ONEDRIVE.EXE" } },
      { path: "%OSDRIVE%\\Users\\*\\AppData\\Local\\Microsoft\\OneDrive\\*\\FileCoAuth.exe", publisher: { name: MS_PUB, product: "MICROSOFT ONEDRIVE", binary: "FILECOAUTH.EXE" } },
      { path: "%OSDRIVE%\\Users\\*\\AppData\\Local\\Microsoft\\OneDrive\\OneDriveStandaloneUpdater.exe", publisher: { name: MS_PUB, product: "MICROSOFT ONEDRIVE", binary: "ONEDRIVESTANDALONEUPDATER.EXE" } },
    ],
    fix: { kind: "publisher", note: "Allow product MICROSOFT ONEDRIVE by publisher — covers per-user AND machine-wide installs, every version, without opening AppData by path." },
  },
  {
    id: "onedrive-machine",
    name: "OneDrive (machine-wide install)",
    critical: false,
    context: "The per-machine variant under %PROGRAMFILES%\\Microsoft OneDrive — covered by a Program Files default rule, listed so the result says WHICH install the policy actually allows.",
    collection: "Exe",
    artifacts: [
      { path: "%PROGRAMFILES%\\Microsoft OneDrive\\OneDrive.exe", publisher: { name: MS_PUB, product: "MICROSOFT ONEDRIVE", binary: "ONEDRIVE.EXE" } },
    ],
    fix: { kind: "publisher", note: "Same publisher rule as the per-user install — one rule covers both." },
  },
  {
    id: "teams-new",
    name: "Microsoft Teams (new, MSIX)",
    critical: true,
    context: "The new Teams is a packaged app under WindowsApps — judged by the Packaged app (Appx) collection, not Exe. An Appx collection with only narrow allows blocks it.",
    collection: "Appx",
    artifacts: [
      { path: "%PROGRAMFILES%\\WindowsApps\\MSTeams_*\\ms-teams.exe", publisher: { name: MS_PUB, product: "MSTEAMS", binary: "*" } },
    ],
    fix: { kind: "publisher", note: "In the Packaged app collection, allow package MSTeams from the Microsoft publisher — or the signed-by-Microsoft catch-all if store apps are trusted wholesale." },
  },
  {
    id: "teams-classic",
    name: "Microsoft Teams (classic, per-user)",
    critical: false,
    context: "Classic Teams runs from %LOCALAPPDATA%\\Microsoft\\Teams — same per-user problem as OneDrive. Retired by Microsoft, still present on older estates.",
    collection: "Exe",
    artifacts: [
      { path: "%OSDRIVE%\\Users\\*\\AppData\\Local\\Microsoft\\Teams\\current\\Teams.exe", publisher: { name: MS_PUB, product: "MICROSOFT TEAMS", binary: "TEAMS.EXE" } },
      { path: "%OSDRIVE%\\Users\\*\\AppData\\Local\\Microsoft\\Teams\\Update.exe", publisher: { name: MS_PUB, product: "MICROSOFT TEAMS", binary: "UPDATE.EXE" } },
    ],
    fix: { kind: "publisher", note: "Allow product MICROSOFT TEAMS by publisher if classic Teams is still deployed; otherwise leave it blocked on purpose." },
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    critical: true,
    context: "Runs from Program Files (x86) — inside the default-rule surface, so this normally passes; a policy without the default rules must carry its own allow.",
    collection: "Exe",
    artifacts: [
      { path: "%PROGRAMFILES%\\Microsoft\\Edge\\Application\\msedge.exe", publisher: { name: MS_PUB, product: "MICROSOFT EDGE", binary: "MSEDGE.EXE" } },
    ],
    fix: { kind: "publisher", note: "Allow product MICROSOFT EDGE by publisher." },
  },
  {
    id: "webview2",
    name: "Edge WebView2 runtime",
    critical: true,
    context: "Embedded browser used by Outlook, the new Teams, Widgets and countless line-of-business apps — an app that seems unrelated to Edge fails when this is blocked.",
    collection: "Exe",
    artifacts: [
      { path: "%PROGRAMFILES%\\Microsoft\\EdgeWebView\\Application\\*\\msedgewebview2.exe", publisher: { name: MS_PUB, product: "MICROSOFT EDGE WEBVIEW2", binary: "MSEDGEWEBVIEW2.EXE" } },
    ],
    fix: { kind: "publisher", note: "Allow product MICROSOFT EDGE WEBVIEW2 by publisher." },
  },
  {
    id: "office-c2r",
    name: "Microsoft 365 Apps (Office click-to-run)",
    critical: true,
    context: "Winword, Excel, Outlook, PowerPoint under %PROGRAMFILES%\\Microsoft Office\\root\\Office16, plus the OfficeClickToRun service that keeps them updated.",
    collection: "Exe",
    artifacts: [
      { path: "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\WINWORD.EXE", publisher: { name: MS_PUB, product: "MICROSOFT OFFICE", binary: "WINWORD.EXE" } },
      { path: "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\EXCEL.EXE", publisher: { name: MS_PUB, product: "MICROSOFT OFFICE", binary: "EXCEL.EXE" } },
      { path: "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE", publisher: { name: MS_PUB, product: "MICROSOFT OFFICE", binary: "OUTLOOK.EXE" } },
      { path: "%PROGRAMFILES%\\Common Files\\Microsoft Shared\\ClickToRun\\OfficeClickToRun.exe", publisher: { name: MS_PUB, product: "MICROSOFT OFFICE", binary: "OFFICECLICKTORUN.EXE" } },
    ],
    fix: { kind: "publisher", note: "Allow product MICROSOFT OFFICE by publisher." },
  },
  {
    id: "intune-ime",
    name: "Intune Management Extension",
    critical: true,
    context: "Delivers Win32 apps, remediations and PowerShell scripts from Intune. Runs as SYSTEM from Program Files (x86); the scripts it drops run from %WINDIR%\\IMECache — a Script collection that blocks that path breaks every Intune script.",
    collection: "Exe",
    artifacts: [
      { path: "%PROGRAMFILES%\\Microsoft Intune Management Extension\\Microsoft.Management.Services.IntuneWindowsAgent.exe", publisher: { name: MS_PUB, product: "MICROSOFT INTUNE", binary: "MICROSOFT.MANAGEMENT.SERVICES.INTUNEWINDOWSAGENT.EXE" } },
    ],
    fix: { kind: "publisher", note: "Allow product MICROSOFT INTUNE by publisher; keep %WINDIR%\\IMECache allowed in the Script collection." },
  },
  {
    id: "company-portal",
    name: "Company Portal",
    critical: false,
    context: "MSIX package from the Store — judged by the Packaged app (Appx) collection. The self-service face of Intune; blocking it strands users who need to install approved apps.",
    collection: "Appx",
    artifacts: [
      { path: "%PROGRAMFILES%\\WindowsApps\\Microsoft.CompanyPortal_*\\CompanyPortal.exe", publisher: { name: MS_PUB, product: "MICROSOFT.COMPANYPORTAL", binary: "*" } },
    ],
    fix: { kind: "publisher", note: "In the Packaged app collection, allow package Microsoft.CompanyPortal from the Microsoft publisher." },
  },
  {
    id: "powershell",
    name: "Windows PowerShell",
    critical: false,
    context: "%WINDIR%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe — inside the Windows default rule. Listed because SOME estates block it for standard users on purpose: a block here is reported as a decision to confirm, not a mistake.",
    collection: "Exe",
    artifacts: [
      { path: "%WINDIR%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", publisher: { name: MS_PUB, product: "MICROSOFT® WINDOWS® OPERATING SYSTEM", binary: "POWERSHELL.EXE" } },
    ],
    fix: { kind: "path", note: "If blocking PowerShell for standard users is intended, keep it — with AppLocker Script enforcement on, blocked users still get Constrained Language Mode rather than nothing." },
  },
  {
    id: "defender",
    name: "Microsoft Defender platform updates",
    critical: false,
    context: "The Defender platform updates itself into %PROGRAMDATA%\\Microsoft\\Windows Defender\\Platform\\<version> and runs from there — a ProgramData deny or a policy without the default rules can fight the AV.",
    collection: "Exe",
    artifacts: [
      { path: "%OSDRIVE%\\ProgramData\\Microsoft\\Windows Defender\\Platform\\*\\MsMpEng.exe", publisher: { name: MS_PUB, product: "MICROSOFT® WINDOWS® OPERATING SYSTEM", binary: "MSMPENG.EXE" } },
    ],
    fix: { kind: "publisher", note: "Allow MsMpEng.exe by publisher, or scope a path allow to the Defender Platform folder only — never open all of ProgramData for it." },
  },
];
