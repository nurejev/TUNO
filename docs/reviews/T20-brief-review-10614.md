# T20 generated brief review

Reviewed 16 September 2026. Base: beta build 10613, commit 3948427. Update: beta build 10614, T20 1.0.15, promotion queue item 186.

The impact brief is now a more defensible communication draft. It distinguishes settings and assignment evidence from verified device behaviour, makes rollout uncertainty explicit, and carries incomplete-read warnings into both exports.

## Findings and implemented corrections

1. **P1 — Assignment data was presented as enforcement and device coverage.** Group members were summed as devices, despite unknown overlap and member types. All users was treated as the Windows fleet, and exclusions did not reduce purportedly exact counts. The shared reach calculation now reports unknown device coverage for those cases. Counts remain available for unrestricted All devices assignments and supported filters evaluated against the complete inventory. A separately assigned unrestricted policy can establish a complete target independently of another policy's exclusions. These are still targets, not device application results. Evidence: js/endpointposture.js, deviceReach at line 164 and reachLine at line 251; policy rows use the same calculation.

2. **P1 — A setting or template could trigger a broader protection claim.** The ASR collection parent could produce blocking text; one blocking rule described Office, email and USB restrictions together; numeric Warn mode was missed. Account Protection implied Windows Hello without an enabled Hello setting, and an EDR template or offboarding setting could imply successful onboarding. Matching now requires supported rule leaves, accepts Warn value 6, requires the Hello enable setting and requires onboarding-setting evidence. Unreadable policy details cannot produce positive statements. The brief describes expected effects and makes onboarding validation explicit. Evidence: asrRows and RULES at lines 274–345, analyzeImpact at line 346. Microsoft documents [ASR modes and individual rules](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-overview) and [Windows Hello provisioning settings](https://learn.microsoft.com/en-us/windows/client-management/mdm/passportforwork-csp).

3. **P1 — Rollout destinations and replacement outcomes were invented.** An unassigned policy borrowed the entire fleet as an intended destination. An interim-only partial statement could say no change while another section said its protection would disappear. The brief now labels the audience unconfirmed, distinguishes exclusions-only from absent assignments, and requires replacement assignment and verification before interim retirement. A policy name marks retirement intent; it does not prove a date or removal. Evidence: rolloutLine at line 421.

4. **P2 — Several user-visible effects were inaccurate or unsupported.** Disabling Edge password saving was said to disable previously saved passwords; one override setting was said to govern both sites and downloads. Those controls now have separate statements, and existing passwords are correctly described as remaining usable. Encryption requirements no longer promise silent setup or key escrow. Firewall enablement no longer promises all apps remain unaffected or all local exceptions stop working. App Control mode alone no longer promises an allowlist, and audit wording no longer guarantees every app runs. Evidence: RULES at lines 300–344. See Microsoft's [password-saving policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/passwordmanagerenabled), [BitLocker settings](https://learn.microsoft.com/en-us/windows/client-management/mdm/bitlocker-csp), and [App Control rule options](https://learn.microsoft.com/en-us/windows/security/threat-protection/windows-defender-application-control/select-types-of-rules-to-create).

5. **P1 — The privacy paragraph promised more than the settings establish.** The previous draft said these protections do not read mail, documents or chats or measure activity. It now explains that security services can process file, app and connection information, and file samples where configured, and points readers to the organization's privacy notice. It makes no claim about the tenant's actual governance or access practices. See Microsoft's [cloud protection and sample submission guidance](https://learn.microsoft.com/en-us/defender-endpoint/cloud-protection-microsoft-antivirus-sample-submission). Evidence: the introductory text in briefMd at line 458 and briefDocx at line 567.

6. **P2 — Downloaded briefs lost important read context.** Unreadable policy details, partial collection results, missing filters and inventory failures were not consistently visible in the document. Both exports now retain warnings, the policy-read timestamp and an explicit scope statement. An empty result cannot be mistaken for a clean estate. Word output has semantic title/heading styles and headings stay with their following text. Evidence: BRIEF_SCOPE and readWarnings at lines 445–456; shared export options at line 1721; tracked tests in tests/endpointposture/brief.test.js.

## Validation

- Baseline: all 9 existing tracked suites passed, 647 assertions.
- Updated application: all 10 tracked suites passed, 701 assertions, including 54 T20 regressions.
- The new regression suite was also run against the original T20 source: 28 assertions failed before the run reached the newly added readWarnings API. This confirms the tests detect prior behaviour; that historical run is not counted as a complete suite.
- Coverage includes ASR parent/exclusion false positives, numeric Warn, disabled Hello, EDR offboarding, separate Edge overrides, numeric zero values, unread details, overlapping groups, All users, exclusions, filtered device sets, incomplete inventory, interim retirement and unassigned rollout destinations.
- Markdown and actual generated Word XML were checked for matching statements, rollout lines, warnings, timestamp and XML escaping.
- A fictional two-page Word sample was rendered and every page visually inspected. No live tenant information was used for this sample.
- JavaScript syntax and whitespace checks passed. Build stamp, asset cache versions, changelog, tool version and promotion queue are updated together.

## Boundaries and release checks

This review and update focus on the generated impact brief and the shared assignment-count calculation it uses. They do not certify every Best practice check or the overall tenant posture.

The brief still reads supported settings-catalog policies. It does not resolve effective policy conflicts, group membership, successful device application, recovery-key escrow, or effective App Control restrictions. Legacy intent settings remain outside its statement generator. Those boundaries are now visible in exported documents.

Live-tenant verification, rollout-audience approval and production acceptance remain pending. After deployment, read T20 again and compare representative policies with both exports before refreshing the employee communication. Validate effective protection and replacement coverage on devices before retiring interim policies.

No tenant settings were changed and no deployment or push was performed during this review.
