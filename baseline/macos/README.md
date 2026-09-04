# CloudFellows macOS baseline — R26.9

Exported from **CloudFellows.dev** on 2026-09-03 by TUNO v1.0.3-beta.288 (🧬 Export on the reference tenant, the cfdev convention). 82 policies, each identity once — the newest release and version.

Schema 2 · catalog `cloudfellows` · release **R26.9** derived from the policies themselves (R26.6 ×63, R26.9 ×15, R26.4 ×4). Every body is the canonical body — the tenant's ids, timestamps, assignments and scope tags are stripped before export — and every policy carries the SHA-256 of that body, which the loader recomputes on read.

The naming convention is the identity: `MACOS - <type> - <area> - <D|U> - <description> - Ryy.m - vX.Y` — `Ryy.m` is the release the policy was cut in (year, then month), the version orders re-cuts within it.

`catalog.json` **is the catalog the app reads** — TUNO fetches `baseline/macos/catalog.json` from its own origin when the 🍎 macOS baseline opens; there is no other copy. The per-policy files under the section folders are the same bodies, one per file, for reading and diffing in the repository. Written by the app (🧬 Export → 📁 Repo folder), never by hand.

## Compliance policies (3)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| MACOS - CMP - Compliance Baseline - U - Device Compliance - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - CMP - Device Properties - U - Validbuilds 15+ - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - CMP - Device Security - U - Security Requirments - R26.6 - v3.0 | R26.6 | v3.0 | yes |

## Settings catalog policies (41)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| MACOS - DCP - Apple Antivirus - D - Enable X-Protect Malware Upload - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Apple Firewall - D - Gatekeeper - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP- Apple MacOS Updates - D - Update Configuration PILOT - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP- Apple MacOS Updates - D - Update Configuration Production - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP- Apple MacOS Updates - D - Update Configuration UAT - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Authentication - U - Platform SSO - R26.9 - v3.2 | R26.9 | v3.2 | yes |
| MACOS - DCP - Defender Antivirus - D - Antivirus Configuration - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Defender Antivirus - D - MDE System Settings - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Device Configuration - D - Company Portal Privacy Settings - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Configuration - D - Device Tag PILOT Devices - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Configuration - D - Device Tag Production Devices - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Configuration - D - Device Tag UAT Devices - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Configuration - D - Network Time Protocol - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Device Configuration - D - Power Management - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Device Configuration - D - Set Timezone-West Europe Standard Time - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Accounts And Login - R26.9 - v3.2 | R26.9 | v3.2 | yes |
| MACOS - DCP - Device Security - D - DDM Passcode Configuration - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Device Security - D - Guest Account Security - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Device Security - D - Managed Login Items - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Recovery Lock - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Device Security - D - Safari Allow History Clearing - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Safari Allow Private Browsing - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Safari Allow Summary - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Safari History Clearing [LECACY] - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Safari Homepage URL - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Safari Private Browsing [LECACY] - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Safari TAB Page Type - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Screensaver Security - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Device Security - D - System Restrictions - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Disk Encryption - D - FileVault - R26.9 - v3.1 | R26.9 | v3.1 | yes |
| MACOS - DCP - Microsoft AutoUpdate - D - MAU Pilot Configuration PILOT - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft AutoUpdate - D - MAU Production Configuration - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft Edge - D - Password Management - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft Edge - D - Security - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft Edge - U - Extensions - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft Edge - U - Profiles, Sign-In and Sync - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft Edge - U - Updates - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft Office - D - Office Configuration - R26.9 - v3.2 | R26.9 | v3.2 | yes |
| MACOS - DCP - Microsoft OneDrive - D - Service and Access - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft OneDrive - U - Known Folder Move - R26.6 - v3.0 | R26.6 | v3.0 | yes |

## Device configuration profiles (7)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| MACOS - DCP - Defender Antivirus - D - Scan Options - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Configurations - D - Enable notifications for some key Microsoft apps - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Login Window Security Configuration - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Safari Security and Privacy - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Device Security - D - Screensaver Idle Time Configuration - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Google Chrome - D - SSO Configuration - R26.6 - v3.0 | R26.6 | v3.0 | yes |
| MACOS - DCP - Microsoft Office - D - M365 Installation Controls - R26.6 - v3.0 | R26.6 | v3.0 | yes |

## Assignment filters (4)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| MACOS - FTR - Assignment filters - D - All AB Enrolled devices - R26.4 - v3.0 | R26.4 | v3.0 | yes |
| MACOS - FTR - Assignment filters - D - All Apple Intel Devices - R26.4 - v3.0 | R26.4 | v3.0 | yes |
| MACOS - FTR - Assignment filters - D - All Apple Silicon Devices - R26.4 - v3.0 | R26.4 | v3.0 | yes |
| MACOS - FTR - Assignment filters - D - All Manual Enrolled Devices - R26.4 - v3.0 | R26.4 | v3.0 | yes |

## Scripts & remediations (27)

| Policy | Release | Version | Importable |
| --- | --- | --- | --- |
| MACOS - SH - Device Configuration - D - Check X-Protect Enabled (Apple Antivirus) - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Configuration - D - Configure Dock - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Configuration - D - Device Rename (enrollment type) - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Configuration - D - Intune settings Report - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Configuration - D - Show filename extensions in finder - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Configuration - D - Swift Dialog Onboarding - R26.6 - v3.1 | R26.6 | v3.1 | no — no script body in the read |
| MACOS - SH - Device Security - D - Enable Sudo Logging - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Security - D - Install log retention 365 - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Security - D - PUA Policy Monitor - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Security - D - PUA Policy Report - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Security - D - Secure Home Folders - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Device Security - D - Set Sudo Timeout Period to Zero - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Configuration - D - Adobe Acrobat Reader - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Company Portal - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Escrow Buddy - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Google Chrome - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Intune Log Watch - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Microsoft 365 Apps for macOS - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Microsoft 365 Copilot - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Microsoft Defender for Endpoint - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Microsoft Edge - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Microsoft Remote Help - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Install Microsoft Teams - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Uninstall Apple Bloatware - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Installation - D - Windows App - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Updates - D - Google Chrome Update - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
| MACOS - SH - Software Updates - D - Microsoft Available Updates Checks - R26.6 - v3.0 | R26.6 | v3.0 | no — no script body in the read |
