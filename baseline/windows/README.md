# CloudFellows Windows baseline — R26

Exported from **CloudFellows.dev** on 2026-09-03 by TUNO v1.0.3-beta.271 (🧬 Export on the baseline tenant, the cfdev convention). 37 policies, each identity once — the newest release and version.

The naming convention is the identity: `Win - <type> - <area> - <D|U> - <description> - Ryy.m - vX.Y` — `Ryy.m` is the release the policy was cut in (year, then month), the version orders re-cuts within it.

`catalog.json` **is the catalog the app reads** — TUNO fetches `baseline/windows/catalog.json` from its own origin when the 🪟 Windows baseline opens; there is no other copy. The per-policy files under the section folders are the same bodies, one per file, for reading and diffing in the repository. Written by the app (🧬 Export → 📁 Repo folder), never by hand.

## Device configuration profiles (2)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| Win - DCP - Device Security - D - Applocker settings (AUDITONLY) - R27.1 - v1.0 | R27.1 | v1.0 | yes |
| Win - SEC - Device Security - AppLocker (AuditOnly) - R27.1 - V4.0.1 | R27.1 | v4.0.1 | yes |

## Settings catalog policies (31)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| Win - DCP - Device Security - D - Login and Lock Screen - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP - Device Security - D - Oobe Defender updates - R26.6 - v1.0 | R26.6 | v1.0 | yes |
| Win - DCP - Microsoft Edge - D - Security - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP - Microsoft Edge - U - User Experience - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP -  Microsoft OneDrive - U - Configuration - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP - Microsoft Store - D - Configuration - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP - Network Security - D - Disable NTLM - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP - Windows User Experience - D - Automatic Restart Sign-On - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP - Windows User Experience - D - Feature Configuration - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - DCP - Windows User Experience - U - Copilot - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - SEC - App Control for Business - D - AllowAll - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 01-Block Adobe Reader from creating child processes - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 02-Block execution of potentially obfuscated scripts - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 03-Block Win32 API calls from Office macros  - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 04-Block credential stealing from the Windows local security authority subsystem  - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 05-Block executable files from running unless they meet a prevalence, age, or trusted list criterion  - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 06-Block JavaScript or VBScript from launching downloaded executable content - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 07-Block Office communication application from creating child processes - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 08-Block all Office applications from creating child processes - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 09-Block untrusted and unsigned processes that run from USB - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 10-Block process creations originating from PSExec and WMI commands - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 11-Block persistence through WMI event subscription - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 12-Block Office applications from creating executable content - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 13-Block Office applications from injecting code into other processes - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 14-Use advanced protection against ransomware - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 15-Block executable content from email client and webmail - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 16-Block abuse of exploited vulnerable signed drivers (Device) - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 17-Block use of copied or impersonated system tools - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Attack Surface Reduction - D - ASR 18-Block rebooting machine in Safe Mode - R26.6 - v3.9 | R26.6 | v3.9 | yes |
| Win - SEC - Defender Antivirus - D - Additional Configuration - R26.6 - v3.8 | R26.6 | v3.8 | yes |
| Win - SEC - Defender Firewall Rules - D - Security Rules - R26.6 - v3.8 | R26.6 | v3.8 | yes |

## Scripts & remediations (4)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| Win - DHS - Defender Antivirus - D - Detect Antivirus - R26.6 - v3.9 | R26.6 | v3.9 | no — no script body in the read |
| Win - DHS - Device Software - D - Debloat HP Autopilot Devices - R26.2 - v3.9 | R26.2 | v3.9 | no — no script body in the read |
| Win - DHS - Windows Software - D - Chocolatey App Updates - R26.2 - v3.9 | R26.2 | v3.9 | no — no script body in the read |
| Win - DHS - Windows Software - D - Update all store apps - R26.2 - v3.9 | R26.2 | v3.9 | no — no script body in the read |
