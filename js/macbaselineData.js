// ======================================================================
// The macOS baseline catalog — the CloudFellows reference export, bundled.
//
// REGENERATED FROM THE BASELINE TENANT'S OWN EXPORT, never edited by hand:
//   tenant   CloudFellows.dev
//   exported 2026-09-01T10:00:36.743Z (TUNO v1.0.3-beta.225)
//   policies 82 (settings catalog, device configurations, compliance,
//            assignment filters, shell scripts)
//
// Bundled rather than fetched at runtime — the CSP only allows Graph, and
// a baseline must not change under you mid-session (ENCA's rule for its
// CA catalog, unchanged). To re-cut: sign into the baseline tenant on the
// beta site, T24 -> Export the baseline file, and replace this file's
// object with the export verbatim.
//
// ONE DEPARTURE FROM THE EXPORT, recorded rather than silent: the tenant
// carried "MACOS - CMP - Device Security - U - Security Requirments -
// R26.6 - v3.0" TWICE (identical release and version — a leftover copy).
// The catalog holds it once; the duplicate is a finding for the tenant
// (T24 shows it as x2), not a feature of the baseline.
//
// Scripts are present for IDENTIFICATION but carry no scriptContent (the
// shared read returns script metadata only), so they are not importable
// from this catalog — restore's rule: a script without its body cannot
// be put back. The screen says this wherever it matters.
// ======================================================================
const BASELINE_MACOS = {
 "kind": "tuno-macos-baseline",
 "release": "R26",
 "exported": "2026-09-01T10:00:36.743Z",
 "tenant": "CloudFellows.dev",
 "build": "v1.0.3-beta.225",
 "policies": [
  {
   "name": "MACOS - CMP - Compliance Baseline - U - Device Compliance - R26.6 - v3.0",
   "version": "3.0",
   "section": "compliance",
   "sectionLabel": "Compliance policies",
   "area": "CompliancePolicies",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
    "roleScopeTagIds": [
     "0"
    ],
    "id": "1adf69b9-39d5-4ca4-828a-021948731e04",
    "createdDateTime": "2026-01-08T08:35:03.7944197Z",
    "description": "Baseline macOS compliance policy requiring FileVault encryption, Firewall enabled, SIP enabled, and minimum macOS 15.0. Gatekeeper configuration is handled separately via configuration policy.\n\n",
    "lastModifiedDateTime": "2026-05-19T11:11:36.2670765Z",
    "displayName": "MACOS - CMP - Compliance Baseline - U - Device Compliance - R26.6 - v3.0",
    "version": 8,
    "passwordRequired": false,
    "passwordBlockSimple": false,
    "passwordExpirationDays": null,
    "passwordMinimumLength": null,
    "passwordMinutesOfInactivityBeforeLock": null,
    "passwordPreviousPasswordBlockCount": null,
    "passwordMinimumCharacterSetCount": null,
    "passwordRequiredType": "deviceDefault",
    "osMinimumVersion": null,
    "osMaximumVersion": null,
    "osMinimumBuildVersion": null,
    "osMaximumBuildVersion": null,
    "systemIntegrityProtectionEnabled": true,
    "deviceThreatProtectionEnabled": false,
    "deviceThreatProtectionRequiredSecurityLevel": "unavailable",
    "advancedThreatProtectionRequiredSecurityLevel": "unavailable",
    "storageRequireEncryption": true,
    "gatekeeperAllowedAppSource": "notConfigured",
    "firewallEnabled": false,
    "firewallBlockAllIncoming": false,
    "firewallEnableStealthMode": false,
    "deviceCompliancePolicyScript": null,
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('1adf69b9-39d5-4ca4-828a-021948731e04')/microsoft.graph.macOSCompliancePolicy/assignments",
    "assignments": [
     {
      "id": "1adf69b9-39d5-4ca4-828a-021948731e04_93d20a3f-d668-450f-b5e1-9a84b84e0c08",
      "source": "direct",
      "sourceId": "1adf69b9-39d5-4ca4-828a-021948731e04",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "93d20a3f-d668-450f-b5e1-9a84b84e0c08"
      }
     }
    ],
    "scheduledActionsForRule@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('1adf69b9-39d5-4ca4-828a-021948731e04')/microsoft.graph.macOSCompliancePolicy/scheduledActionsForRule(scheduledActionConfigurations())",
    "scheduledActionsForRule": [
     {
      "id": "1adf69b9-39d5-4ca4-828a-021948731e04",
      "ruleName": null,
      "scheduledActionConfigurations@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('1adf69b9-39d5-4ca4-828a-021948731e04')/microsoft.graph.macOSCompliancePolicy/scheduledActionsForRule('1adf69b9-39d5-4ca4-828a-021948731e04')/scheduledActionConfigurations",
      "scheduledActionConfigurations": [
       {
        "id": "d5bfc980-0b0c-4874-aa5c-970b70b15808",
        "gracePeriodHours": 0,
        "actionType": "block",
        "notificationTemplateId": "00000000-0000-0000-0000-000000000000",
        "notificationMessageCCList": []
       }
      ]
     }
    ]
   },
   "key": "macos cmp compliance baseline u device compliance",
   "release": 6
  },
  {
   "name": "MACOS - CMP - Device Properties - U - Validbuilds 15+ - R26.6 - v3.0",
   "version": "3.0",
   "section": "compliance",
   "sectionLabel": "Compliance policies",
   "area": "CompliancePolicies",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
    "roleScopeTagIds": [
     "0"
    ],
    "id": "97dcfadf-55e0-41a2-aa3c-66c2ff277b1d",
    "createdDateTime": "2026-01-08T19:34:55.1182357Z",
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:11:47.5029864Z",
    "displayName": "MACOS - CMP - Device Properties - U - Validbuilds 15+ - R26.6 - v3.0",
    "version": 5,
    "passwordRequired": false,
    "passwordBlockSimple": false,
    "passwordExpirationDays": null,
    "passwordMinimumLength": null,
    "passwordMinutesOfInactivityBeforeLock": null,
    "passwordPreviousPasswordBlockCount": null,
    "passwordMinimumCharacterSetCount": null,
    "passwordRequiredType": "deviceDefault",
    "osMinimumVersion": "15",
    "osMaximumVersion": null,
    "osMinimumBuildVersion": null,
    "osMaximumBuildVersion": null,
    "systemIntegrityProtectionEnabled": false,
    "deviceThreatProtectionEnabled": false,
    "deviceThreatProtectionRequiredSecurityLevel": "unavailable",
    "advancedThreatProtectionRequiredSecurityLevel": "unavailable",
    "storageRequireEncryption": false,
    "gatekeeperAllowedAppSource": "notConfigured",
    "firewallEnabled": false,
    "firewallBlockAllIncoming": false,
    "firewallEnableStealthMode": false,
    "deviceCompliancePolicyScript": null,
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('97dcfadf-55e0-41a2-aa3c-66c2ff277b1d')/microsoft.graph.macOSCompliancePolicy/assignments",
    "assignments": [
     {
      "id": "97dcfadf-55e0-41a2-aa3c-66c2ff277b1d_93d20a3f-d668-450f-b5e1-9a84b84e0c08",
      "source": "direct",
      "sourceId": "97dcfadf-55e0-41a2-aa3c-66c2ff277b1d",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "93d20a3f-d668-450f-b5e1-9a84b84e0c08"
      }
     }
    ],
    "scheduledActionsForRule@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('97dcfadf-55e0-41a2-aa3c-66c2ff277b1d')/microsoft.graph.macOSCompliancePolicy/scheduledActionsForRule(scheduledActionConfigurations())",
    "scheduledActionsForRule": [
     {
      "id": "97dcfadf-55e0-41a2-aa3c-66c2ff277b1d",
      "ruleName": null,
      "scheduledActionConfigurations@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('97dcfadf-55e0-41a2-aa3c-66c2ff277b1d')/microsoft.graph.macOSCompliancePolicy/scheduledActionsForRule('97dcfadf-55e0-41a2-aa3c-66c2ff277b1d')/scheduledActionConfigurations",
      "scheduledActionConfigurations": [
       {
        "id": "3bd6f95b-54de-496d-b897-2d24f5086bb9",
        "gracePeriodHours": 72,
        "actionType": "block",
        "notificationTemplateId": "00000000-0000-0000-0000-000000000000",
        "notificationMessageCCList": []
       },
       {
        "id": "34408ab1-bef0-4e4e-9a43-300f199f2c90",
        "gracePeriodHours": 0,
        "actionType": "notification",
        "notificationTemplateId": "204beadc-f927-4abd-a8c9-d9d86bf83957",
        "notificationMessageCCList": []
       }
      ]
     }
    ]
   },
   "key": "macos cmp device properties u validbuilds 15+",
   "release": 6
  },
  {
   "name": "MACOS - CMP - Device Security - U - Security Requirments - R26.6 - v3.0",
   "version": "3.0",
   "section": "compliance",
   "sectionLabel": "Compliance policies",
   "area": "CompliancePolicies",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
    "roleScopeTagIds": [
     "0"
    ],
    "id": "22cc9300-fc7d-43c4-809c-197adc7ad478",
    "createdDateTime": "2026-04-21T09:43:39.7623757Z",
    "description": null,
    "lastModifiedDateTime": "2026-05-19T11:12:09.4465752Z",
    "displayName": "MACOS - CMP - Device Security - U - Security Requirments - R26.6 - v3.0",
    "version": 2,
    "passwordRequired": false,
    "passwordBlockSimple": false,
    "passwordExpirationDays": null,
    "passwordMinimumLength": null,
    "passwordMinutesOfInactivityBeforeLock": null,
    "passwordPreviousPasswordBlockCount": null,
    "passwordMinimumCharacterSetCount": null,
    "passwordRequiredType": "deviceDefault",
    "osMinimumVersion": null,
    "osMaximumVersion": null,
    "osMinimumBuildVersion": null,
    "osMaximumBuildVersion": null,
    "systemIntegrityProtectionEnabled": false,
    "deviceThreatProtectionEnabled": false,
    "deviceThreatProtectionRequiredSecurityLevel": "unavailable",
    "advancedThreatProtectionRequiredSecurityLevel": "unavailable",
    "storageRequireEncryption": true,
    "gatekeeperAllowedAppSource": "macAppStoreAndIdentifiedDevelopers",
    "firewallEnabled": true,
    "firewallBlockAllIncoming": true,
    "firewallEnableStealthMode": true,
    "deviceCompliancePolicyScript": null,
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('22cc9300-fc7d-43c4-809c-197adc7ad478')/microsoft.graph.macOSCompliancePolicy/assignments",
    "assignments": [],
    "scheduledActionsForRule@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('22cc9300-fc7d-43c4-809c-197adc7ad478')/microsoft.graph.macOSCompliancePolicy/scheduledActionsForRule(scheduledActionConfigurations())",
    "scheduledActionsForRule": [
     {
      "id": "22cc9300-fc7d-43c4-809c-197adc7ad478",
      "ruleName": null,
      "scheduledActionConfigurations@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceCompliancePolicies('22cc9300-fc7d-43c4-809c-197adc7ad478')/microsoft.graph.macOSCompliancePolicy/scheduledActionsForRule('22cc9300-fc7d-43c4-809c-197adc7ad478')/scheduledActionConfigurations",
      "scheduledActionConfigurations": [
       {
        "id": "068d0ec5-8741-4cd3-8876-e2e1f45d10bd",
        "gracePeriodHours": 0,
        "actionType": "block",
        "notificationTemplateId": "00000000-0000-0000-0000-000000000000",
        "notificationMessageCCList": []
       }
      ]
     }
    ]
   },
   "key": "macos cmp device security u security requirments",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Apple Antivirus - D - Enable X-Protect Malware Upload - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-09T10:16:56.0251577Z",
    "creationSource": null,
    "description": "1. Prevent launch or execution of malware: App Store, or Gatekeeper combined with Notarization\n\n2. Block malware from running on customer systems: Gatekeeper, Notarization, and XProtect\n\n3. Remediate malware that has executed: XProtect\n\nThe first layer of defense is designed to inhibit the distribution of malware, and prevent it from launching even once—this is the goal of the App Store, and Gatekeeper combined with Notarization.\n\nThe next layer of defense is to help ensure that if malware appears on any Mac, it’s quickly identified and blocked, both to halt spread and to remediate the Mac systems it’s already gained a foothold on. XProtect adds to this defense, along with Gatekeeper and Notarization.\n\nFinally, XProtect acts to remediate malware that has managed to successfully execute.",
    "lastModifiedDateTime": "2026-05-19T11:28:59.7761776Z",
    "name": "MACOS - DCP - Apple Antivirus - D - Enable X-Protect Malware Upload - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "154782c3-38b3-4479-90a8-2d751b102ed7",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('154782c3-38b3-4479-90a8-2d751b102ed7')/assignments",
    "assignments": [
     {
      "id": "154782c3-38b3-4479-90a8-2d751b102ed7_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "154782c3-38b3-4479-90a8-2d751b102ed7",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.systempolicy.control_com.apple.systempolicy.control",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.systempolicy.control_enablexprotectmalwareupload",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.systempolicy.control_enablexprotectmalwareupload_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp apple antivirus d enable x protect malware upload",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:01.1851111Z",
    "creationSource": null,
    "description": "Enables macOS firewall and prevents users from accessing and modifying firewall settings through System Preferences, ensuring firewall configuration remains under IT control.",
    "lastModifiedDateTime": "2026-05-19T11:34:38.7173324Z",
    "name": "MACOS - DCP - Apple Firewall - D - Enable MACOS Firewall - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 2,
    "technologies": "mdm,appleRemoteManagement",
    "id": "1dfded00-8d4e-49a2-8859-e2dc761ac48f",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('1dfded00-8d4e-49a2-8859-e2dc761ac48f')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.preference.security_com.apple.preference.security",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.preference.security_dontallowfirewallui",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.preference.security_dontallowfirewallui_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.security.firewall_com.apple.security.firewall",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.security.firewall_enablefirewall",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.security.firewall_enablefirewall_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp apple firewall d enable macos firewall",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Apple Firewall - D - Gatekeeper - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T08:35:01.3474232Z",
    "creationSource": null,
    "description": "Comprehensive Gatekeeper and system policy configuration that enables security assessment for downloaded applications, allows identified developers, enables XProtect malware uploads, and prevents users from overriding security policies.",
    "lastModifiedDateTime": "2026-05-19T12:16:42.2331694Z",
    "name": "MACOS - DCP - Apple Firewall - D - Gatekeeper - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 2,
    "technologies": "mdm,appleRemoteManagement",
    "id": "43bcd24e-38c8-49a0-9516-aa5fc41811de",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('43bcd24e-38c8-49a0-9516-aa5fc41811de')/assignments",
    "assignments": [
     {
      "id": "43bcd24e-38c8-49a0-9516-aa5fc41811de_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "43bcd24e-38c8-49a0-9516-aa5fc41811de",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.systempolicy.control_com.apple.systempolicy.control",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.systempolicy.control_allowidentifieddevelopers",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.systempolicy.control_allowidentifieddevelopers_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.systempolicy.control_enableassessment",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.systempolicy.control_enableassessment_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.systempolicy.managed_com.apple.systempolicy.managed",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.systempolicy.managed_disableoverride",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.systempolicy.managed_disableoverride_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp apple firewall d gatekeeper",
   "release": 6
  },
  {
   "name": "MACOS - DCP- Apple MacOS Updates - D - Update Configuration PILOT - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T08:35:02.7532787Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:32:30.7950423Z",
    "name": "MACOS - DCP- Apple MacOS Updates - D - Update Configuration PILOT - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 2,
    "technologies": "mdm,appleRemoteManagement",
    "id": "b7e85bd1-0355-4ab8-b4f2-e2671c5617c4",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('b7e85bd1-0355-4ab8-b4f2-e2671c5617c4')/assignments",
    "assignments": [
     {
      "id": "b7e85bd1-0355-4ab8-b4f2-e2671c5617c4_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "b7e85bd1-0355-4ab8-b4f2-e2671c5617c4",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "ddm-latestsoftwareupdate_ddm-latestsoftwareupdate",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "ddm-latestsoftwareupdate_enforcelatestsoftwareupdateversion",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "ddm-latestsoftwareupdate_enforcelatestsoftwareupdateversion_0",
            "children": [
             {
              "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
              "settingDefinitionId": "ddm-latestsoftwareupdate_delayindays",
              "settingInstanceTemplateReference": null,
              "auditRuleInformation": null,
              "simpleSettingValue": {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
               "settingValueTemplateReference": null,
               "value": 1
              }
             },
             {
              "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
              "settingDefinitionId": "ddm-latestsoftwareupdate_installtime",
              "settingInstanceTemplateReference": null,
              "auditRuleInformation": null,
              "simpleSettingValue": {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
               "settingValueTemplateReference": null,
               "value": "01:00"
              }
             }
            ]
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "softwareupdate_softwareupdate",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "softwareupdate_allowstandarduserosupdates",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "softwareupdate_allowstandarduserosupdates_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "softwareupdate_automaticactions",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_download",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_download_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_installosupdates",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_installosupdates_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_installsecurityupdate",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_installsecurityupdate_1",
                "children": []
               }
              }
             ]
            }
           ]
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "softwareupdate_notifications",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "softwareupdate_notifications_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "softwareupdate_rapidsecurityresponse",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_rapidsecurityresponse_enable",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_rapidsecurityresponse_enable_true",
                "children": []
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp apple macos updates d update configuration pilot",
   "release": 6
  },
  {
   "name": "MACOS - DCP- Apple MacOS Updates - D - Update Configuration Production - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T20:42:35.5844076Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:32:11.3580957Z",
    "name": "MACOS - DCP- Apple MacOS Updates - D - Update Configuration Production - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 2,
    "technologies": "mdm,appleRemoteManagement",
    "id": "3db428e9-9e49-4c11-b334-1f82b01d271c",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('3db428e9-9e49-4c11-b334-1f82b01d271c')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "ddm-latestsoftwareupdate_ddm-latestsoftwareupdate",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "ddm-latestsoftwareupdate_enforcelatestsoftwareupdateversion",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "ddm-latestsoftwareupdate_enforcelatestsoftwareupdateversion_0",
            "children": [
             {
              "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
              "settingDefinitionId": "ddm-latestsoftwareupdate_delayindays",
              "settingInstanceTemplateReference": null,
              "auditRuleInformation": null,
              "simpleSettingValue": {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
               "settingValueTemplateReference": null,
               "value": 10
              }
             },
             {
              "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
              "settingDefinitionId": "ddm-latestsoftwareupdate_installtime",
              "settingInstanceTemplateReference": null,
              "auditRuleInformation": null,
              "simpleSettingValue": {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
               "settingValueTemplateReference": null,
               "value": "01:00"
              }
             }
            ]
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "softwareupdate_softwareupdate",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "softwareupdate_allowstandarduserosupdates",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "softwareupdate_allowstandarduserosupdates_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "softwareupdate_automaticactions",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_download",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_download_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_installosupdates",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_installosupdates_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_installsecurityupdate",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_installsecurityupdate_1",
                "children": []
               }
              }
             ]
            }
           ]
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "softwareupdate_notifications",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "softwareupdate_notifications_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "softwareupdate_rapidsecurityresponse",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_rapidsecurityresponse_enable",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_rapidsecurityresponse_enable_true",
                "children": []
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp apple macos updates d update configuration production",
   "release": 6
  },
  {
   "name": "MACOS - DCP- Apple MacOS Updates - D - Update Configuration UAT - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T20:41:53.7212076Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:32:22.4943909Z",
    "name": "MACOS - DCP- Apple MacOS Updates - D - Update Configuration UAT - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 2,
    "technologies": "mdm,appleRemoteManagement",
    "id": "407987ef-d6c4-4a36-87fa-a8918db5cdc2",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('407987ef-d6c4-4a36-87fa-a8918db5cdc2')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "ddm-latestsoftwareupdate_ddm-latestsoftwareupdate",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "ddm-latestsoftwareupdate_enforcelatestsoftwareupdateversion",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "ddm-latestsoftwareupdate_enforcelatestsoftwareupdateversion_0",
            "children": [
             {
              "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
              "settingDefinitionId": "ddm-latestsoftwareupdate_delayindays",
              "settingInstanceTemplateReference": null,
              "auditRuleInformation": null,
              "simpleSettingValue": {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
               "settingValueTemplateReference": null,
               "value": 7
              }
             },
             {
              "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
              "settingDefinitionId": "ddm-latestsoftwareupdate_installtime",
              "settingInstanceTemplateReference": null,
              "auditRuleInformation": null,
              "simpleSettingValue": {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
               "settingValueTemplateReference": null,
               "value": "01:00"
              }
             }
            ]
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "softwareupdate_softwareupdate",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "softwareupdate_allowstandarduserosupdates",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "softwareupdate_allowstandarduserosupdates_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "softwareupdate_automaticactions",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_download",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_download_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_installosupdates",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_installosupdates_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_automaticactions_installsecurityupdate",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_automaticactions_installsecurityupdate_1",
                "children": []
               }
              }
             ]
            }
           ]
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "softwareupdate_notifications",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "softwareupdate_notifications_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "softwareupdate_rapidsecurityresponse",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "softwareupdate_rapidsecurityresponse_enable",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "softwareupdate_rapidsecurityresponse_enable_true",
                "children": []
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp apple macos updates d update configuration uat",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Authentication - U - Platform SSO - R26.6 - v3.1.1",
   "version": "3.1.1",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-05-20T08:15:53.5282611Z",
    "creationSource": null,
    "description": "Configures Platform Single Sign-On (SSO) for Microsoft Entra ID authentication on macOS devices, enabling seamless authentication across Microsoft services and applications.",
    "lastModifiedDateTime": "2026-06-08T16:44:44.9165294Z",
    "name": "MACOS - DCP - Authentication - U - Platform SSO - R26.6 - v3.1.1",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "12a13842-f272-42e3-9016-f534b00e2460",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('12a13842-f272-42e3-9016-f534b00e2460')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.extensiblesso_com.apple.extensiblesso",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.extensiblesso_authenticationmethod",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.extensiblesso_authenticationmethod_1",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.extensiblesso_extensionidentifier",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "com.microsoft.CompanyPortalMac.ssoextension"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.extensiblesso_platformsso",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_authenticationgraceperiod",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
                "settingValueTemplateReference": null,
                "value": 0
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_authenticationmethod",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.extensiblesso_platformsso_authenticationmethod_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_enablecreateuseratlogin",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.extensiblesso_platformsso_enablecreateuseratlogin_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_enableregistrationduringsetup",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.extensiblesso_platformsso_enableregistrationduringsetup_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_loginfrequency",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
                "settingValueTemplateReference": null,
                "value": 64800
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_newuserauthorizationmode",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.extensiblesso_platformsso_newuserauthorizationmode_0",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_nonplatformssoaccounts",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingCollectionValue": [
                {
                 "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                 "settingValueTemplateReference": null,
                 "value": "admin"
                }
               ]
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_tokentousermapping",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "groupSettingCollectionValue": [
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.extensiblesso_platformsso_tokentousermapping_accountname",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.apple.PlatformSSO.AccountShortName"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.extensiblesso_platformsso_tokentousermapping_fullname",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "name"
                   }
                  }
                 ]
                }
               ]
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_useshareddevicekeys",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.extensiblesso_platformsso_useshareddevicekeys_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.extensiblesso_platformsso_userauthorizationmode",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.extensiblesso_platformsso_userauthorizationmode_1",
                "children": []
               }
              }
             ]
            }
           ]
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.extensiblesso_registrationtoken",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "{{DEVICEREGISTRATION}}"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.extensiblesso_screenlockedbehavior",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.extensiblesso_screenlockedbehavior_0",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.extensiblesso_teamidentifier",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "UBF8T346G9"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.extensiblesso_type",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.extensiblesso_type_1",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
           "settingDefinitionId": "com.apple.extensiblesso_urls",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingCollectionValue": [
            {
             "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
             "settingValueTemplateReference": null,
             "value": "https://login.microsoftonline.com"
            },
            {
             "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
             "settingValueTemplateReference": null,
             "value": "https://login.microsoft.com"
            },
            {
             "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
             "settingValueTemplateReference": null,
             "value": "https://sts.windows.net"
            },
            {
             "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
             "settingValueTemplateReference": null,
             "value": "https://login-us.microsoftonline.com"
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp authentication u platform sso",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Defender Antivirus - D - Antivirus Configuration - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:23.9593859Z",
    "creationSource": null,
    "description": "NOTE: This policy requires deployment of the Defender application and a valid Defender for Endpoint P1/P2 or Defender for Business license:\n\nhttps://learn.microsoft.com/en-us/defender-endpoint/mac-install-with-intune",
    "lastModifiedDateTime": "2026-05-19T11:28:49.5981483Z",
    "name": "MACOS - DCP - Defender Antivirus - D - Antivirus Configuration - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 21,
    "technologies": "mdm,appleRemoteManagement",
    "id": "5d4706b3-e623-456c-a073-ce936a38d3d3",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('5d4706b3-e623-456c-a073-ce936a38d3d3')/assignments",
    "assignments": [
     {
      "id": "5d4706b3-e623-456c-a073-ce936a38d3d3_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "5d4706b3-e623-456c-a073-ce936a38d3d3",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_disallowedthreatactions",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingCollectionValue": [
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "allow"
        },
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "restore"
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enablefilehashcomputation",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enablefilehashcomputation_true",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enforcementlevel_antivirusengine",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enforcementlevel_antivirusengine_2",
        "children": []
       }
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_exclusionsmergepolicy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_exclusionsmergepolicy_1",
        "children": []
       }
      }
     },
     {
      "id": "4",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_scanafterdefinitionupdate",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_scanafterdefinitionupdate_true",
        "children": []
       }
      }
     },
     {
      "id": "5",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_scanarchives",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_scanarchives_true",
        "children": []
       }
      }
     },
     {
      "id": "6",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_threattypesettings",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_threattypesettings_item_value",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.managedclient.preferences_threattypesettings_item_value_1",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_threattypesettings_item_key",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.managedclient.preferences_threattypesettings_item_key_0",
            "children": []
           }
          }
         ]
        },
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_threattypesettings_item_value",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.managedclient.preferences_threattypesettings_item_value_1",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_threattypesettings_item_key",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.managedclient.preferences_threattypesettings_item_key_1",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "7",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_threattypesettingsmergepolicy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_threattypesettingsmergepolicy_1",
        "children": []
       }
      }
     },
     {
      "id": "8",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_automaticdefinitionupdateenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_automaticdefinitionupdateenabled_true",
        "children": []
       }
      }
     },
     {
      "id": "9",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_cloudblocklevel",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_cloudblocklevel_2",
        "children": []
       }
      }
     },
     {
      "id": "10",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_diagnosticlevel",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_diagnosticlevel_0",
        "children": []
       }
      }
     },
     {
      "id": "11",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_automaticsamplesubmission",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_automaticsamplesubmission_true",
        "children": []
       }
      }
     },
     {
      "id": "12",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enabled_true",
        "children": []
       }
      }
     },
     {
      "id": "13",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_earlypreview",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_earlypreview_false",
        "children": []
       }
      }
     },
     {
      "id": "14",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_datalossprevention",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_datalossprevention_0",
        "children": []
       }
      }
     },
     {
      "id": "15",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_systemextensions",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_systemextensions_0",
        "children": []
       }
      }
     },
     {
      "id": "16",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enforcementlevel",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enforcementlevel_2",
        "children": []
       }
      }
     },
     {
      "id": "17",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enforcementlevel_tamperprotection",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enforcementlevel_tamperprotection_2",
        "children": []
       }
      }
     },
     {
      "id": "18",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_exclusions_tamperprotection",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_exclusions_item_path_tamperprotection",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "/Library/Intune/Microsoft Intune Agent.app/Contents/MacOS/IntuneMdmDaemon"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_exclusions_item_signingid_tamperprotection",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "IntuneMdmDaemon"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_exclusions_item_teamid_tamperprotection",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "UBF8T346G9"
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "19",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_consumerexperience",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_consumerexperience_1",
        "children": []
       }
      }
     },
     {
      "id": "20",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_hidestatusmenuicon",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_hidestatusmenuicon_false",
        "children": []
       }
      }
     }
    ]
   },
   "key": "macos dcp defender antivirus d antivirus configuration",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Defender Antivirus - D - MDE System Settings - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-12T13:16:08.599594Z",
    "creationSource": null,
    "description": "Name change",
    "lastModifiedDateTime": "2026-05-19T12:20:01.8559435Z",
    "name": "MACOS - DCP - Defender Antivirus - D - MDE System Settings - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 6,
    "technologies": "mdm,appleRemoteManagement",
    "id": "c5484338-2857-46b5-a22b-7a420ca11f4e",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('c5484338-2857-46b5-a22b-7a420ca11f4e')/assignments",
    "assignments": [
     {
      "id": "c5484338-2857-46b5-a22b-7a420ca11f4e_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "c5484338-2857-46b5-a22b-7a420ca11f4e",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.servicemanagement_com.apple.servicemanagement",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.servicemanagement_rules",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.dlp"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_0",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.fresno"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_teamidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            },
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.dlp"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_0",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.dlp"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_teamidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            },
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.wdav"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_0",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.wdav"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_teamidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_datalossprevention",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_datalossprevention_0",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_com.apple.tcc.configuration-profile-policy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
               "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_accessibility",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "groupSettingCollectionValue": [
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.dlp.daemon\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.dlp.daemon"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_identifiertype_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_staticcode",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_accessibility_item_staticcode_false",
                    "children": []
                   }
                  }
                 ]
                }
               ]
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
               "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "groupSettingCollectionValue": [
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.wdav\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.wdav"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifiertype_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_staticcode",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_staticcode_false",
                    "children": []
                   }
                  }
                 ]
                },
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.wdav.epsext\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.wdav.epsext"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifiertype_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_staticcode",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_staticcode_false",
                    "children": []
                   }
                  }
                 ]
                },
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.dlp.daemon\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.dlp.daemon"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_identifiertype_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_staticcode",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyallfiles_item_staticcode_false",
                    "children": []
                   }
                  }
                 ]
                }
               ]
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.system-extension-policy_com.apple.system-extension-policy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.system-extension-policy_allowuseroverrides",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.system-extension-policy_allowuseroverrides_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.system-extension-policy_allowedsystemextensions",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
               "settingDefinitionId": "com.apple.system-extension-policy_allowedsystemextensions_generickey",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingCollectionValue": [
                {
                 "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                 "settingValueTemplateReference": null,
                 "value": "com.microsoft.wdav.epsext"
                },
                {
                 "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                 "settingValueTemplateReference": null,
                 "value": "com.microsoft.wdav.netext"
                }
               ]
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.system-extension-policy_allowedsystemextensions_generickey_keytobereplaced",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "4",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.notificationsettings_com.apple.notificationsettings",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.notificationsettings_notificationsettings",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_alerttype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_alerttype_2",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_badgesenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_badgesenabled_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_bundleidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.autoupdate2"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_criticalalertenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_criticalalertenabled_false",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_notificationsenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_notificationsenabled_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_showinlockscreen",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_showinlockscreen_false",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_showinnotificationcenter",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_showinnotificationcenter_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_soundsenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_soundsenabled_true",
                "children": []
               }
              }
             ]
            },
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_alerttype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_alerttype_1",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_badgesenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_badgesenabled_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_bundleidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.wdav.tray"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_criticalalertenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_criticalalertenabled_false",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_notificationsenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_notificationsenabled_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_showinlockscreen",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_showinlockscreen_false",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_showinnotificationcenter",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_showinnotificationcenter_true",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.notificationsettings_notificationsettings_item_soundsenabled",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.notificationsettings_notificationsettings_item_soundsenabled_true",
                "children": []
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "5",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.webcontent-filter_com.apple.webcontent-filter",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_filterdataproviderbundleidentifier",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "com.microsoft.wdav.netext"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_filterdataproviderdesignatedrequirement",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "identifier \"com.microsoft.wdav.netext\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_filtergrade",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.webcontent-filter_filtergrade_1",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_filterpackets",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.webcontent-filter_filterpackets_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_filtersockets",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.webcontent-filter_filtersockets_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_filtertype",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.webcontent-filter_filtertype_1",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_pluginbundleid",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "com.microsoft.wdav"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.webcontent-filter_userdefinedname",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "MDE Network Filter"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp defender antivirus d mde system settings",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Defender Antivirus - D - Scan Options - R26.6 - v3.0",
   "version": "3.0",
   "section": "deviceConfigurations",
   "sectionLabel": "Device configuration profiles",
   "area": "DeviceConfigurations",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCustomConfiguration",
    "id": "abef1c91-0e80-4360-8dab-caea1a2f979d",
    "lastModifiedDateTime": "2026-05-19T11:26:57.8003106Z",
    "roleScopeTagIds": [
     "0"
    ],
    "supportsScopeTags": true,
    "deviceManagementApplicabilityRuleOsEdition": null,
    "deviceManagementApplicabilityRuleOsVersion": null,
    "deviceManagementApplicabilityRuleDeviceMode": null,
    "createdDateTime": "2026-01-08T19:35:08.8516608Z",
    "description": "Weekly full scan running on a Wednesday at 11:30\nDaily quick scan running at 14:15\nNo regular daily scan\nCheck for updates before scan is enabled\n\nRememder to change tenant settings in the xml",
    "displayName": "MACOS - DCP - Defender Antivirus - D - Scan Options - R26.6 - v3.0",
    "version": 4,
    "payloadName": "MDE Scan Options",
    "payloadFileName": "com.microsoft.wdav.202412061450.mobileconfig",
    "payload": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCFET0NUWVBFIHBsaXN0IFBVQkxJQyAiLS8vQXBwbGUvL0RURCBQTElTVCAxLjAvL0VOIiAiaHR0cDovL3d3dy5hcHBsZS5jb20vRFREcy9Qcm9wZXJ0eUxpc3QtMS4wLmR0ZCI+CjxwbGlzdCB2ZXJzaW9uPSIxLjAiPgogIDxkaWN0PgogICAgPGtleT5QYXlsb2FkVVVJRDwva2V5PgogICAgPHN0cmluZz5ENzhBRjA4Ny02MURELTQ4QjYtQUUwRC05MEUwMkYxMzYxQ0U8L3N0cmluZz4KICAgIDxrZXk+UGF5bG9hZFR5cGU8L2tleT4KICAgIDxzdHJpbmc+Q29uZmlndXJhdGlvbjwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkT3JnYW5pemF0aW9uPC9rZXk+CiAgICA8c3RyaW5nPkxpbW9uLUlUPC9zdHJpbmc+CiAgICA8a2V5PlBheWxvYWRJZGVudGlmaWVyPC9rZXk+CiAgICA8c3RyaW5nPkQ3OEFGMDg3LTYxREQtNDhCNi1BRTBELTkwRTAyRjEzNjFDRTwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KICAgIDxzdHJpbmc+TWljcm9zb2Z0IERlZmVuZGVyIGZvciBFbmRwb2ludCBzZXR0aW5nczwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkRGVzY3JpcHRpb248L2tleT4KICAgIDxzdHJpbmc+TWljcm9zb2Z0IERlZmVuZGVyIGZvciBFbmRwb2ludCBjb25maWd1cmF0aW9uIHNldHRpbmdzPC9zdHJpbmc+CiAgICA8a2V5PlBheWxvYWRWZXJzaW9uPC9rZXk+CiAgICA8aW50ZWdlcj4xPC9pbnRlZ2VyPgogICAgPGtleT5QYXlsb2FkRW5hYmxlZDwva2V5PgogICAgPHRydWUgLz4KICAgIDxrZXk+UGF5bG9hZFJlbW92YWxEaXNhbGxvd2VkPC9rZXk+CiAgICA8ZmFsc2UgLz4KICAgIDxrZXk+UGF5bG9hZFNjb3BlPC9rZXk+CiAgICA8c3RyaW5nPlN5c3RlbTwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkQ29udGVudDwva2V5PgogICAgPGFycmF5PgogICAgICA8ZGljdD4KICAgICAgICA8a2V5PlBheWxvYWRVVUlEPC9rZXk+CiAgICAgICAgPHN0cmluZz40ODM1RDI5Qi0xNzg3LTQxRjQtQTEwNC1EMDI0MzMzNUEyMEM8L3N0cmluZz4KICAgICAgICA8a2V5PlBheWxvYWRUeXBlPC9rZXk+CiAgICAgICAgPHN0cmluZz5jb20ubWljcm9zb2Z0LndkYXY8L3N0cmluZz4KICAgICAgICA8a2V5PlBheWxvYWRPcmdhbml6YXRpb248L2tleT4KICAgICAgICA8c3RyaW5nPkxpbW9uLUlUPC9zdHJpbmc+CiAgICAgICAgPGtleT5QYXlsb2FkSWRlbnRpZmllcjwva2V5PgogICAgICAgIDxzdHJpbmc+NDgzNUQyOUItMTc4Ny00MUY0LUExMDQtRDAyNDMzMzVBMjBDPC9zdHJpbmc+CiAgICAgICAgPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KICAgICAgICA8c3RyaW5nPk1pY3Jvc29mdCBEZWZlbmRlciBmb3IgRW5kcG9pbnQgY29uZmlndXJhdGlvbiBzZXR0aW5nczwvc3RyaW5nPgogICAgICAgIDxrZXk+UGF5bG9hZERlc2NyaXB0aW9uPC9rZXk+CiAgICAgICAgPHN0cmluZyAvPgogICAgICAgIDxrZXk+UGF5bG9hZFZlcnNpb248L2tleT4KICAgICAgICA8aW50ZWdlcj4xPC9pbnRlZ2VyPgogICAgICAgIDxrZXk+UGF5bG9hZEVuYWJsZWQ8L2tleT4KICAgICAgICA8dHJ1ZSAvPgogICAgICAgIDxrZXk+ZmVhdHVyZXM8L2tleT4KICAgICAgICA8ZGljdD4KICAgICAgICAgIDxrZXk+c2NoZWR1bGVkU2Nhbjwva2V5PgogICAgICAgICAgPHN0cmluZz5lbmFibGVkPC9zdHJpbmc+CiAgICAgICAgPC9kaWN0PgogICAgICAgIDxrZXk+c2NoZWR1bGVkU2Nhbjwva2V5PgogICAgICAgIDxkaWN0PgogICAgICAgICAgPGtleT5pZ25vcmVFeGNsdXNpb25zPC9rZXk+CiAgICAgICAgICA8ZmFsc2UgLz4KICAgICAgICAgIDxrZXk+bG93UHJpb3JpdHlTY2hlZHVsZWRTY2FuPC9rZXk+CiAgICAgICAgICA8dHJ1ZSAvPgogICAgICAgICAgPGtleT5yYW5kb21pemVTY2FuU3RhcnRUaW1lPC9rZXk+CiAgICAgICAgICA8aW50ZWdlcj4yPC9pbnRlZ2VyPgogICAgICAgICAgPGtleT5jaGVja0ZvckRlZmluaXRpb25zVXBkYXRlPC9rZXk+CiAgICAgICAgICA8dHJ1ZSAvPgogICAgICAgICAgPGtleT5ydW5TY2FuV2hlbklkbGU8L2tleT4KICAgICAgICAgIDxmYWxzZSAvPgogICAgICAgICAgPGtleT5kYWlseUNvbmZpZ3VyYXRpb248L2tleT4KICAgICAgICAgIDxkaWN0PgogICAgICAgICAgICA8a2V5PnRpbWVPZkRheTwva2V5PgogICAgICAgICAgICA8aW50ZWdlcj42ODA8L2ludGVnZXI+CiAgICAgICAgICAgIDxrZXk+aW50ZXJ2YWw8L2tleT4KICAgICAgICAgICAgPHN0cmluZz4xMjwvc3RyaW5nPgogICAgICAgICAgPC9kaWN0PgogICAgICAgICAgPGtleT53ZWVrbHlDb25maWd1cmF0aW9uPC9rZXk+CiAgICAgICAgICA8ZGljdD4KICAgICAgICAgICAgPGtleT5kYXlPZldlZWs8L2tleT4KICAgICAgICAgICAgPGludGVnZXI+ODwvaW50ZWdlcj4KICAgICAgICAgICAgPGtleT5zY2FuVHlwZTwva2V5PgogICAgICAgICAgICA8c3RyaW5nPmZ1bGw8L3N0cmluZz4KICAgICAgICAgIDwvZGljdD4KICAgICAgICA8L2RpY3Q+CiAgICAgIDwvZGljdD4KICAgIDwvYXJyYXk+CiAgPC9kaWN0Pgo8L3BsaXN0Pgo=",
    "deploymentChannel": "deviceChannel",
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceConfigurations('abef1c91-0e80-4360-8dab-caea1a2f979d')/microsoft.graph.macOSCustomConfiguration/assignments",
    "assignments": [
     {
      "id": "abef1c91-0e80-4360-8dab-caea1a2f979d_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "abef1c91-0e80-4360-8dab-caea1a2f979d",
      "intent": "apply",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos dcp defender antivirus d scan options",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configuration - D - Company Portal Privacy Settings - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-06-09T06:42:08.0623628Z",
    "creationSource": null,
    "description": "Grants Company Portal (com.microsoft.CompanyPortalMac) App Management (SystemPolicyAppBundles) access via a Privacy Preferences Policy Control settings-catalog profile.",
    "lastModifiedDateTime": "2026-06-12T06:45:10.3144788Z",
    "name": "MACOS - DCP - Device Configuration - D - Company Portal Privacy Settings - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "32a67383-e577-40d2-81fc-abb063a812e3",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('32a67383-e577-40d2-81fc-abb063a812e3')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_com.apple.tcc.configuration-profile-policy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
               "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyappbundles",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "groupSettingCollectionValue": [
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyappbundles_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyappbundles_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyappbundles_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.CompanyPortalMac\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyappbundles_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.CompanyPortalMac"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicyappbundles_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicyappbundles_item_identifiertype_0",
                    "children": []
                   }
                  }
                 ]
                }
               ]
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device configuration d company portal privacy settings",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configuration - D - Device Tag PILOT Devices - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-09T08:33:17.3100726Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:31:44.5134045Z",
    "name": "MACOS - DCP - Device Configuration - D - Device Tag PILOT Devices - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "af58402e-c472-4dd4-959f-753fd95ed927",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('af58402e-c472-4dd4-959f-753fd95ed927')/assignments",
    "assignments": [
     {
      "id": "af58402e-c472-4dd4-959f-753fd95ed927_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "af58402e-c472-4dd4-959f-753fd95ed927",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_tags",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_tags_item_key",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.managedclient.preferences_tags_item_key_0",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_tags_item_value",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "MACOS-PILOT-DEVICES"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device configuration d device tag pilot devices",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configuration - D - Device Tag Production Devices - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-09T08:34:08.1662265Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:31:25.9312473Z",
    "name": "MACOS - DCP - Device Configuration - D - Device Tag Production Devices - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "af996281-1669-4f9b-92ce-e050e464f65a",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('af996281-1669-4f9b-92ce-e050e464f65a')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_tags",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_tags_item_key",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.managedclient.preferences_tags_item_key_0",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_tags_item_value",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "MACOS-PROD-DEVICES"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device configuration d device tag production devices",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configuration - D - Device Tag UAT Devices - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-09T08:33:45.8698172Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:31:35.05894Z",
    "name": "MACOS - DCP - Device Configuration - D - Device Tag UAT Devices - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "2dd46622-4e87-4f97-91d7-7bd9b902cc96",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('2dd46622-4e87-4f97-91d7-7bd9b902cc96')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_tags",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_tags_item_key",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.managedclient.preferences_tags_item_key_0",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.managedclient.preferences_tags_item_value",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "MACOS-UAT-DEVICES"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device configuration d device tag uat devices",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configuration - D - Network Time Protocol - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:02.7710591Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:35:13.1925821Z",
    "name": "MACOS - DCP - Device Configuration - D - Network Time Protocol - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "32b1fa4a-6d72-4a8e-82b8-977f879c29db",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('32b1fa4a-6d72-4a8e-82b8-977f879c29db')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx_com.apple.mcx-timeserver",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.mcx_timeserver",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "time.apple.com"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device configuration d network time protocol",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configuration - D - Power Management - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:03.251966Z",
    "creationSource": null,
    "description": "Configures power management and energy saver settings for macOS devices. Sets display sleep to 5 minutes and system sleep to 10 minutes for both desktop (AC power) and portable devices. Enables Wake on LAN for desktop computers to allow network-based device management and remote wake capabilities.",
    "lastModifiedDateTime": "2026-05-19T12:15:34.5320102Z",
    "name": "MACOS - DCP - Device Configuration - D - Power Management - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "7e30e6e5-f752-4f5e-94ca-90adc72873cc",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('7e30e6e5-f752-4f5e-94ca-90adc72873cc')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx_com.apple.mcx-energysaver",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.mcx_com.apple.energysaver.desktop.acpower",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.mcx_com.apple.energysaver.desktop.acpower_display sleep timer",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
                "settingValueTemplateReference": null,
                "value": 5
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.mcx_com.apple.energysaver.desktop.acpower_system sleep timer",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
                "settingValueTemplateReference": null,
                "value": 10
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.mcx_com.apple.energysaver.desktop.acpower_wake on lan",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.mcx_com.apple.energysaver.desktop.acpower_wake on lan_1",
                "children": []
               }
              }
             ]
            }
           ]
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.mcx_com.apple.energysaver.portable.acpower",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.mcx_com.apple.energysaver.portable.acpower_display sleep timer",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
                "settingValueTemplateReference": null,
                "value": 5
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.mcx_com.apple.energysaver.portable.acpower_system sleep timer",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
                "settingValueTemplateReference": null,
                "value": 10
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device configuration d power management",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configuration - D - Set Timezone-West Europe Standard Time - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-09T10:17:06.5562702Z",
    "creationSource": null,
    "description": "Configures the time server settings to use the time zone \"Europe/Amsterdam\" for devices, ensuring accurate local time synchronization.",
    "lastModifiedDateTime": "2026-05-19T11:31:15.4790112Z",
    "name": "MACOS - DCP - Device Configuration - D - Set Timezone-West Europe Standard Time - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "b3ad37d1-e413-49ea-abbb-a3a3acb95cf9",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('b3ad37d1-e413-49ea-abbb-a3a3acb95cf9')/assignments",
    "assignments": [
     {
      "id": "b3ad37d1-e413-49ea-abbb-a3a3acb95cf9_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "b3ad37d1-e413-49ea-abbb-a3a3acb95cf9",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx_com.apple.mcx-timeserver",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.mcx_timezone",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "Europe/Amsterdam"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device configuration d set timezone west europe standard time",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Configurations - D - Enable notifications for some key Microsoft apps - R26.6 - v3.0",
   "version": "3.0",
   "section": "deviceConfigurations",
   "sectionLabel": "Device configuration profiles",
   "area": "DeviceConfigurations",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCustomConfiguration",
    "id": "f10bedf6-62d6-46a2-87da-58a65ca97762",
    "lastModifiedDateTime": "2026-05-19T11:29:54.6610265Z",
    "roleScopeTagIds": [
     "0"
    ],
    "supportsScopeTags": true,
    "deviceManagementApplicabilityRuleOsEdition": null,
    "deviceManagementApplicabilityRuleOsVersion": null,
    "deviceManagementApplicabilityRuleDeviceMode": null,
    "createdDateTime": "2026-01-09T10:39:09.7987316Z",
    "description": "This profile grants the following\n\nShow in Lock Screen = True\nBadges Enabled = True\nSounds Enabled = True\nCritical Alert Enabled = True\nShow In Notification Centre = True\nTo the following bundleID's\n\ncom.microsoft.CompanyPortal (Intune Company Portal)\ncom.microsoft.wdav (Microsoft Defednder)\ncom.microsoft.intuneMDMAgent (Intune Script Agent)\ncom.microsoft.intuneMDMAgent.daemon (Intune Script Agent)\ncom.microsoft.Outlook (Microsoft Outlook)\ncom.microsoft.skype.teams (Microsoft Teams)\ncom.microsoft.CompanyPortalMac (Intune Company Portal)\ncom.microsoft.autoupdate2 (Microsoft Auto Update)\ncom.microsoft.edgemac (Microsoft Edge)\ncom.microsoft.OneDrive (Microsoft OneDrive)\ncom.microsoft.Word (Microsoft Word)\ncom.microsoft.Excel (Microsoft Excel)\ncom.microsoft.Powerpoint (Microsoft Powerpoint)\ncom.microsoft.onenote.mac (Microsoft OneNote)\ncom.microsoft.OneDrive (Microsoft OneDrive)\ncom.microsoft.rdc.macos (Microsoft Remote Desktop)\ncom.microsoft.VSCode (Microsoft Visual Studio Code)",
    "displayName": "MACOS - DCP - Device Configurations - D - Enable notifications for some key Microsoft apps - R26.6 - v3.0",
    "version": 5,
    "payloadName": "enable notifications for some key Microsoft apps",
    "payloadFileName": "Notifications for Intune, Defender and Office.mobileconfig",
    "payload": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCFET0NUWVBFIHBsaXN0IFBVQkxJQyAiLS8vQXBwbGUvL0RURCBQTElTVCAxLjAvL0VOIiAiaHR0cDovL3d3dy5hcHBsZS5jb20vRFREcy9Qcm9wZXJ0eUxpc3QtMS4wLmR0ZCI+CjxwbGlzdCB2ZXJzaW9uPSIxLjAiPgo8ZGljdD4KCTxrZXk+UGF5bG9hZENvbnRlbnQ8L2tleT4KCTxhcnJheT4KCQk8ZGljdD4KCQkJPGtleT5Ob3RpZmljYXRpb25TZXR0aW5nczwva2V5PgoJCQk8YXJyYXk+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LkNvbXBhbnlQb3J0YWw8L3N0cmluZz4KCQkJCQk8a2V5PkNyaXRpY2FsQWxlcnRFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LndkYXY8L3N0cmluZz4KCQkJCQk8a2V5PkNyaXRpY2FsQWxlcnRFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LmludHVuZU1ETUFnZW50PC9zdHJpbmc+CgkJCQkJPGtleT5Dcml0aWNhbEFsZXJ0RW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5Pk5vdGlmaWNhdGlvbnNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luQ2FyUGxheTwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkxvY2tTY3JlZW48L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Ob3RpZmljYXRpb25DZW50ZXI8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Tb3VuZHNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJPC9kaWN0PgoJCQkJPGRpY3Q+CgkJCQkJPGtleT5CYWRnZXNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+QnVuZGxlSWRlbnRpZmllcjwva2V5PgoJCQkJCTxzdHJpbmc+Y29tLm1pY3Jvc29mdC5pbnR1bmVNRE1BZ2VudC5kYWVtb248L3N0cmluZz4KCQkJCQk8a2V5PkNyaXRpY2FsQWxlcnRFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0Lk91dGxvb2s8L3N0cmluZz4KCQkJCQk8a2V5PkNyaXRpY2FsQWxlcnRFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LnRlYW1zPC9zdHJpbmc+CgkJCQkJPGtleT5Dcml0aWNhbEFsZXJ0RW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5Pk5vdGlmaWNhdGlvbnNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luQ2FyUGxheTwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkxvY2tTY3JlZW48L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Ob3RpZmljYXRpb25DZW50ZXI8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Tb3VuZHNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJPC9kaWN0PgoJCQkJPGRpY3Q+CgkJCQkJPGtleT5CYWRnZXNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+QnVuZGxlSWRlbnRpZmllcjwva2V5PgoJCQkJCTxzdHJpbmc+Y29tLm1pY3Jvc29mdC5Db21wYW55UG9ydGFsTWFjPC9zdHJpbmc+CgkJCQkJPGtleT5Dcml0aWNhbEFsZXJ0RW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5Pk5vdGlmaWNhdGlvbnNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luQ2FyUGxheTwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkxvY2tTY3JlZW48L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Ob3RpZmljYXRpb25DZW50ZXI8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Tb3VuZHNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJPC9kaWN0PgoJCQkJPGRpY3Q+CgkJCQkJPGtleT5CYWRnZXNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+QnVuZGxlSWRlbnRpZmllcjwva2V5PgoJCQkJCTxzdHJpbmc+Y29tLm1pY3Jvc29mdC5hdXRvdXBkYXRlMgk8L3N0cmluZz4KCQkJCQk8a2V5PkNyaXRpY2FsQWxlcnRFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LmF1dG91cGRhdGUuZmJhPC9zdHJpbmc+CgkJCQkJPGtleT5Dcml0aWNhbEFsZXJ0RW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5Pk5vdGlmaWNhdGlvbnNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luQ2FyUGxheTwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkxvY2tTY3JlZW48L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Ob3RpZmljYXRpb25DZW50ZXI8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Tb3VuZHNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJPC9kaWN0PgkJCQkKCQkJCTxkaWN0PgoJCQkJCTxrZXk+QmFkZ2VzRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PkJ1bmRsZUlkZW50aWZpZXI8L2tleT4KCQkJCQk8c3RyaW5nPmNvbS5taWNyb3NvZnQuZWRnZW1hYzwvc3RyaW5nPgoJCQkJCTxrZXk+Q3JpdGljYWxBbGVydEVuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Ob3RpZmljYXRpb25zRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkNhclBsYXk8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Mb2NrU2NyZWVuPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTm90aWZpY2F0aW9uQ2VudGVyPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U291bmRzRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCTwvZGljdD4KCQkJCTxkaWN0PgoJCQkJCTxrZXk+QmFkZ2VzRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PkJ1bmRsZUlkZW50aWZpZXI8L2tleT4KCQkJCQk8c3RyaW5nPmNvbS5taWNyb3NvZnQuT25lRHJpdmU8L3N0cmluZz4KCQkJCQk8a2V5PkNyaXRpY2FsQWxlcnRFbmFibGVkPC9rZXk+CgkJCQkJPGZhbHNlLz4KCQkJCQk8a2V5Pk5vdGlmaWNhdGlvbnNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luQ2FyUGxheTwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkxvY2tTY3JlZW48L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Ob3RpZmljYXRpb25DZW50ZXI8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Tb3VuZHNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJPC9kaWN0PgoJCQkJPGRpY3Q+CgkJCQkJPGtleT5CYWRnZXNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+QnVuZGxlSWRlbnRpZmllcjwva2V5PgoJCQkJCTxzdHJpbmc+Y29tLm1pY3Jvc29mdC5Xb3JkCTwvc3RyaW5nPgoJCQkJCTxrZXk+Q3JpdGljYWxBbGVydEVuYWJsZWQ8L2tleT4KCQkJCQk8ZmFsc2UvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LkV4Y2VsCTwvc3RyaW5nPgoJCQkJCTxrZXk+Q3JpdGljYWxBbGVydEVuYWJsZWQ8L2tleT4KCQkJCQk8ZmFsc2UvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LlBvd2VycG9pbnQJPC9zdHJpbmc+CgkJCQkJPGtleT5Dcml0aWNhbEFsZXJ0RW5hYmxlZDwva2V5PgoJCQkJCTxmYWxzZS8+CgkJCQkJPGtleT5Ob3RpZmljYXRpb25zRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkNhclBsYXk8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Mb2NrU2NyZWVuPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTm90aWZpY2F0aW9uQ2VudGVyPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U291bmRzRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCTwvZGljdD4KCQkJCTxkaWN0PgoJCQkJCTxrZXk+QmFkZ2VzRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PkJ1bmRsZUlkZW50aWZpZXI8L2tleT4KCQkJCQk8c3RyaW5nPmNvbS5taWNyb3NvZnQub25lbm90ZS5tYWM8L3N0cmluZz4KCQkJCQk8a2V5PkNyaXRpY2FsQWxlcnRFbmFibGVkPC9rZXk+CgkJCQkJPGZhbHNlLz4KCQkJCQk8a2V5Pk5vdGlmaWNhdGlvbnNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luQ2FyUGxheTwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkxvY2tTY3JlZW48L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Ob3RpZmljYXRpb25DZW50ZXI8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Tb3VuZHNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJPC9kaWN0PgoJCQkJPGRpY3Q+CgkJCQkJPGtleT5CYWRnZXNFbmFibGVkPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+QnVuZGxlSWRlbnRpZmllcjwva2V5PgoJCQkJCTxzdHJpbmc+Y29tLm1pY3Jvc29mdC5PbmVEcml2ZTwvc3RyaW5nPgoJCQkJCTxrZXk+Q3JpdGljYWxBbGVydEVuYWJsZWQ8L2tleT4KCQkJCQk8ZmFsc2UvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LnJkYy5tYWNvczwvc3RyaW5nPgoJCQkJCTxrZXk+Q3JpdGljYWxBbGVydEVuYWJsZWQ8L2tleT4KCQkJCQk8ZmFsc2UvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LlZTQ29kZTwvc3RyaW5nPgoJCQkJCTxrZXk+Q3JpdGljYWxBbGVydEVuYWJsZWQ8L2tleT4KCQkJCQk8ZmFsc2UvPgoJCQkJCTxrZXk+Tm90aWZpY2F0aW9uc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5DYXJQbGF5PC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTG9ja1NjcmVlbjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbk5vdGlmaWNhdGlvbkNlbnRlcjwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNvdW5kc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQk8L2RpY3Q+CgkJCQk8ZGljdD4KCQkJCQk8a2V5PkJhZGdlc0VuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5CdW5kbGVJZGVudGlmaWVyPC9rZXk+CgkJCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0LndkYXYudHJheTwvc3RyaW5nPgoJCQkJCTxrZXk+Q3JpdGljYWxBbGVydEVuYWJsZWQ8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5Ob3RpZmljYXRpb25zRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCQk8a2V5PlNob3dJbkNhclBsYXk8L2tleT4KCQkJCQk8dHJ1ZS8+CgkJCQkJPGtleT5TaG93SW5Mb2NrU2NyZWVuPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U2hvd0luTm90aWZpY2F0aW9uQ2VudGVyPC9rZXk+CgkJCQkJPHRydWUvPgoJCQkJCTxrZXk+U291bmRzRW5hYmxlZDwva2V5PgoJCQkJCTx0cnVlLz4KCQkJCTwvZGljdD4KCQkJPC9hcnJheT4KCQkJPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KCQkJPHN0cmluZz5Ob3RpZmljYXRpb25zPC9zdHJpbmc+CgkJCTxrZXk+UGF5bG9hZElkZW50aWZpZXI8L2tleT4KCQkJPHN0cmluZz5jb20uYXBwbGUubm90aWZpY2F0aW9uc2V0dGluZ3M8L3N0cmluZz4KCQkJPGtleT5QYXlsb2FkVHlwZTwva2V5PgoJCQk8c3RyaW5nPmNvbS5hcHBsZS5ub3RpZmljYXRpb25zZXR0aW5nczwvc3RyaW5nPgoJCQk8a2V5PlBheWxvYWRVVUlEPC9rZXk+CgkJCTxzdHJpbmc+OEZDNDVBMzgtODg2RS00OEIwLTk2NkYtMDVGMTVFRUM4REQwPC9zdHJpbmc+CgkJCTxrZXk+UGF5bG9hZFZlcnNpb248L2tleT4KCQkJPGludGVnZXI+MTwvaW50ZWdlcj4KCQk8L2RpY3Q+Cgk8L2FycmF5PgoJPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KCTxzdHJpbmc+Tm90aWZpY2F0aW9ucyBmb3IgSW50dW5lLCBEZWZlbmRlciBhbmQgT2ZmaWNlPC9zdHJpbmc+Cgk8a2V5PlBheWxvYWRJZGVudGlmaWVyPC9rZXk+Cgk8c3RyaW5nPjBCNzZBNDg2LUU5QjAtNDVCMi1CMDg4LTcxRjJGRDM3MzhFMTwvc3RyaW5nPgoJPGtleT5QYXlsb2FkVHlwZTwva2V5PgoJPHN0cmluZz5Db25maWd1cmF0aW9uPC9zdHJpbmc+Cgk8a2V5PlBheWxvYWRVVUlEPC9rZXk+Cgk8c3RyaW5nPkQ2RjIxQTJBLUJEMUItNEQyQy1BRjlFLTU0QUEzODc0QTFFRTwvc3RyaW5nPgoJPGtleT5QYXlsb2FkVmVyc2lvbjwva2V5PgoJPGludGVnZXI+MTwvaW50ZWdlcj4KPC9kaWN0Pgo8L3BsaXN0Pgo=",
    "deploymentChannel": "deviceChannel",
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceConfigurations('f10bedf6-62d6-46a2-87da-58a65ca97762')/microsoft.graph.macOSCustomConfiguration/assignments",
    "assignments": [
     {
      "id": "f10bedf6-62d6-46a2-87da-58a65ca97762_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "f10bedf6-62d6-46a2-87da-58a65ca97762",
      "intent": "apply",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos dcp device configurations d enable notifications for some key microsoft apps",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Accounts And Login - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:25.299398Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:27:33.8567099Z",
    "name": "MACOS - DCP - Device Security - D - Accounts And Login - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 3,
    "technologies": "mdm,appleRemoteManagement",
    "id": "ccfca683-f9b9-4438-b52c-be1e163ed37d",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('ccfca683-f9b9-4438-b52c-be1e163ed37d')/assignments",
    "assignments": [
     {
      "id": "ccfca683-f9b9-4438-b52c-be1e163ed37d_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "ccfca683-f9b9-4438-b52c-be1e163ed37d",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx_com.apple.mcx-accounts",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx_disableguestaccount",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx_disableguestaccount_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.loginwindow_com.apple.loginwindow",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.loginwindow_adminhostinfo",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "HostName"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.loginwindow_disableconsoleaccess",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.loginwindow_disableconsoleaccess_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.loginwindow_hideadminusers",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.loginwindow_hideadminusers_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.loginwindow_loginwindowtext",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "Login with M365 account"
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.loginwindow_showfullname",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.loginwindow_showfullname_false",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "loginwindow_loginwindow",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "loginwindow_disableloginitemssuppression",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "loginwindow_disableloginitemssuppression_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d accounts and login",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - DDM Passcode Configuration - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:03.7384586Z",
    "creationSource": null,
    "description": "Enforces passcode requirements for macOS devices including minimum length, complexity, failed attempt limits, and expiration policies to ensure device security compliance.",
    "lastModifiedDateTime": "2026-05-19T11:35:21.0331295Z",
    "name": "MACOS - DCP - Device Security - D - DDM Passcode Configuration - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "bd3883f9-dbcb-4b74-a974-ea901f2adf2a",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('bd3883f9-dbcb-4b74-a974-ea901f2adf2a')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "passcode_passcode",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "passcode_changeatnextauth",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "passcode_changeatnextauth_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "passcode_failedattemptsresetinminutes",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 0
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "passcode_maximumgraceperiodinminutes",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 0
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "passcode_maximumfailedattempts",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 11
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "passcode_maximumpasscodeageindays",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 365
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "passcode_minimumcomplexcharacters",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 1
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "passcode_minimumlength",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 6
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "passcode_passcodereuselimit",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 1
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "passcode_requirealphanumericpasscode",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "passcode_requirealphanumericpasscode_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "passcode_requirecomplexpasscode",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "passcode_requirecomplexpasscode_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "passcode_requirepasscode",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "passcode_requirepasscode_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d ddm passcode configuration",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Guest Account Security - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:01.7979804Z",
    "creationSource": null,
    "description": "Disables guest account access to enhance security on managed macOS devices. Guest accounts can bypass security policies and provide unauthorized access to the system.",
    "lastModifiedDateTime": "2026-05-19T12:16:07.7611957Z",
    "name": "MACOS - DCP - Device Security - D - Guest Account Security - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "42e04cbd-7700-4cf3-a035-58faa18aeaba",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('42e04cbd-7700-4cf3-a035-58faa18aeaba')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx_com.apple.mcx-accounts",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx_disableguestaccount",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx_disableguestaccount_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d guest account security",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Login Window Security Configuration - R26.6 - v3.0",
   "version": "3.0",
   "section": "deviceConfigurations",
   "sectionLabel": "Device configuration profiles",
   "area": "DeviceConfigurations",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCustomConfiguration",
    "id": "e3262c56-d2f9-45d5-841c-e844ba0aa069",
    "lastModifiedDateTime": "2026-05-19T11:30:07.1760087Z",
    "roleScopeTagIds": [
     "0"
    ],
    "supportsScopeTags": true,
    "deviceManagementApplicabilityRuleOsEdition": null,
    "deviceManagementApplicabilityRuleOsVersion": null,
    "deviceManagementApplicabilityRuleDeviceMode": null,
    "createdDateTime": "2026-04-28T09:25:20.4000269Z",
    "description": "Essential login window security configuration for macOS devices. Disables FileVault auto-login to ensure users must explicitly authenticate, blocks external account authentication for tighter access control, and prevents administrators from disabling managed preferences to maintain security policy enforcement.",
    "displayName": "MACOS - DCP - Device Security - D - Login Window Security Configuration - R26.6 - v3.0",
    "version": 3,
    "payloadName": "cfg-sec-001-login-window.mobileconfig",
    "payloadFileName": "cfg-sec-001-login-window.mobileconfig",
    "payload": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCFET0NUWVBFIHBsaXN0IFBVQkxJQyAiLS8vQXBwbGUvL0RURCBQTElTVCAxLjAvL0VOIiAiaHR0cDovL3d3dy5hcHBsZS5jb20vRFREcy9Qcm9wZXJ0eUxpc3QtMS4wLmR0ZCI+CjxwbGlzdCB2ZXJzaW9uPSIxLjAiPgo8ZGljdD4KCTxrZXk+UGF5bG9hZENvbnRlbnQ8L2tleT4KCTxhcnJheT4KCQk8ZGljdD4KCQkJPGtleT5BZG1pbk1heURpc2FibGVNQ1g8L2tleT4KCQkJPGZhbHNlLz4KCQkJPGtleT5EaXNhYmxlRkRFQXV0b0xvZ2luPC9rZXk+CgkJCTx0cnVlLz4KCQkJPGtleT5FbmFibGVFeHRlcm5hbEFjY291bnRzPC9rZXk+CgkJCTxmYWxzZS8+CgkJCTxrZXk+Y29tLmFwcGxlLmxvZ2luLm1jeC5EaXNhYmxlQXV0b0xvZ2luQ2xpZW50PC9rZXk+CgkJCTx0cnVlLz4KCQkJPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KCQkJPHN0cmluZz5Mb2dpbiBXaW5kb3c8L3N0cmluZz4KCQkJPGtleT5QYXlsb2FkSWRlbnRpZmllcjwva2V5PgoJCQk8c3RyaW5nPmNvbS5hcHBsZS5sb2dpbndpbmRvdy5FMjAwOTZDOS02QkMzLTQ4NUYtQkQ3RS1CMTA2MEFFOTJENjc8L3N0cmluZz4KCQkJPGtleT5QYXlsb2FkVHlwZTwva2V5PgoJCQk8c3RyaW5nPmNvbS5hcHBsZS5sb2dpbndpbmRvdzwvc3RyaW5nPgoJCQk8a2V5PlBheWxvYWRVVUlEPC9rZXk+CgkJCTxzdHJpbmc+RTIwMDk2QzktNkJDMy00ODVGLUJEN0UtQjEwNjBBRTkyRDY3PC9zdHJpbmc+CgkJCTxrZXk+UGF5bG9hZFZlcnNpb248L2tleT4KCQkJPGludGVnZXI+MTwvaW50ZWdlcj4KCQk8L2RpY3Q+Cgk8L2FycmF5PgoJPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KCTxzdHJpbmc+U2VjdXJlIExvZ2luIFdpbmRvdyBDb25maWd1cmF0aW9uPC9zdHJpbmc+Cgk8a2V5PlBheWxvYWRJZGVudGlmaWVyPC9rZXk+Cgk8c3RyaW5nPmNvbS5jb21wYW55LmxvZ2lud2luZG93LnNlY3VyZTwvc3RyaW5nPgoJPGtleT5QYXlsb2FkVHlwZTwva2V5PgoJPHN0cmluZz5Db25maWd1cmF0aW9uPC9zdHJpbmc+Cgk8a2V5PlBheWxvYWRVVUlEPC9rZXk+Cgk8c3RyaW5nPjQ3N0IwQUEzLUZGREQtNDBDNS1BQTc5LTYxN0Q4QzEwNTlCRTwvc3RyaW5nPgoJPGtleT5QYXlsb2FkVmVyc2lvbjwva2V5PgoJPGludGVnZXI+MTwvaW50ZWdlcj4KPC9kaWN0Pgo8L3BsaXN0Pgo=",
    "deploymentChannel": "deviceChannel",
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceConfigurations('e3262c56-d2f9-45d5-841c-e844ba0aa069')/microsoft.graph.macOSCustomConfiguration/assignments",
    "assignments": []
   },
   "key": "macos dcp device security d login window security configuration",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Managed Login Items - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:03.017368Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:34:46.43814Z",
    "name": "MACOS - DCP - Device Security - D - Managed Login Items - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "74dea841-028f-43eb-a825-7da993229cfe",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('74dea841-028f-43eb-a825-7da993229cfe')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.servicemanagement_com.apple.servicemanagement",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.servicemanagement_rules",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "Palo Alto"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_4",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "PXPZ95SK77"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_teamidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "PXPZ95SK77"
               }
              }
             ]
            },
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "Microsoft"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_4",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_teamidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d managed login items",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Recovery Lock - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:02.5191208Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T12:15:46.6312376Z",
    "name": "MACOS - DCP - Device Security - D - Recovery Lock - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "34888558-5ed8-49d5-aa9e-02ecff0b9af5",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('34888558-5ed8-49d5-aa9e-02ecff0b9af5')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "setrecoverylock_setrecoverylock",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "setrecoverylock_enablerecoverylockpassword",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "setrecoverylock_enablerecoverylockpassword_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "setrecoverylock_recoverylockpasswordrotationschedule",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "setrecoverylock_recoverylockpasswordrotationschedule_0",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d recovery lock",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari Allow History Clearing - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:55:22.9985777Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:34:04.1833477Z",
    "name": "MACOS - DCP - Device Security - D - Safari Allow History Clearing - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "51e5c082-c7c8-4a4a-839f-0baf21d8cf06",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('51e5c082-c7c8-4a4a-839f-0baf21d8cf06')/assignments",
    "assignments": [
     {
      "id": "51e5c082-c7c8-4a4a-839f-0baf21d8cf06_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "51e5c082-c7c8-4a4a-839f-0baf21d8cf06",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "safari_safari",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "safari_allowhistoryclearing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "safari_allowhistoryclearing_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d safari allow history clearing",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari Allow Private Browsing - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:55:25.7192031Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:33:32.8065169Z",
    "name": "MACOS - DCP - Device Security - D - Safari Allow Private Browsing - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "4a86045b-922a-496e-961c-4ba0a90b9f3f",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('4a86045b-922a-496e-961c-4ba0a90b9f3f')/assignments",
    "assignments": [
     {
      "id": "4a86045b-922a-496e-961c-4ba0a90b9f3f_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "4a86045b-922a-496e-961c-4ba0a90b9f3f",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "safari_safari",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "safari_allowprivatebrowsing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "safari_allowprivatebrowsing_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d safari allow private browsing",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari Allow Summary - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:55:27.0258122Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:33:51.889535Z",
    "name": "MACOS - DCP - Device Security - D - Safari Allow Summary - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "b67928a1-b23b-4b00-8e8d-91a7c318a337",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('b67928a1-b23b-4b00-8e8d-91a7c318a337')/assignments",
    "assignments": [
     {
      "id": "b67928a1-b23b-4b00-8e8d-91a7c318a337_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "b67928a1-b23b-4b00-8e8d-91a7c318a337",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "safari_safari",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "safari_allowsummary",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "safari_allowsummary_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d safari allow summary",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari History Clearing [LECACY] - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:55:29.6823368Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:33:06.1230138Z",
    "name": "MACOS - DCP - Device Security - D - Safari History Clearing [LECACY] - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "c5328610-8373-42ff-88ea-64d0762868d2",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('c5328610-8373-42ff-88ea-64d0762868d2')/assignments",
    "assignments": [
     {
      "id": "c5328610-8373-42ff-88ea-64d0762868d2_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "c5328610-8373-42ff-88ea-64d0762868d2",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.applicationaccess_com.apple.applicationaccess",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowsafarihistoryclearing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowsafarihistoryclearing_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d safari history clearing [lecacy]",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari Homepage URL - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:55:31.0164017Z",
    "creationSource": null,
    "description": "Set the safari home page. Default to apple.nl",
    "lastModifiedDateTime": "2026-05-19T11:33:43.875943Z",
    "name": "MACOS - DCP - Device Security - D - Safari Homepage URL - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "d9ba9027-e19b-4f29-b4f4-cffe547ae472",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('d9ba9027-e19b-4f29-b4f4-cffe547ae472')/assignments",
    "assignments": [
     {
      "id": "d9ba9027-e19b-4f29-b4f4-cffe547ae472_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "d9ba9027-e19b-4f29-b4f4-cffe547ae472",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "safari_safari",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "safari_newtabstartpage",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "safari_newtabstartpage_homepageurl",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "www.apple.nl"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "safari_newtabstartpage_pagetype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "safari_newtabstartpage_pagetype_0",
                "children": []
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d safari homepage url",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari Private Browsing [LECACY] - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:55:33.6444654Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:33:14.8215186Z",
    "name": "MACOS - DCP - Device Security - D - Safari Private Browsing [LECACY] - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "8646d968-e5b1-4bf4-b026-064a64e11ddc",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('8646d968-e5b1-4bf4-b026-064a64e11ddc')/assignments",
    "assignments": [
     {
      "id": "8646d968-e5b1-4bf4-b026-064a64e11ddc_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "8646d968-e5b1-4bf4-b026-064a64e11ddc",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.applicationaccess_com.apple.applicationaccess",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowsafariprivatebrowsing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowsafariprivatebrowsing_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d safari private browsing [lecacy]",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari Security and Privacy - R26.6 - v3.0",
   "version": "3.0",
   "section": "deviceConfigurations",
   "sectionLabel": "Device configuration profiles",
   "area": "DeviceConfigurations",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCustomAppConfiguration",
    "id": "4e107d18-ced4-405a-ac2e-84fe466db38e",
    "lastModifiedDateTime": "2026-05-19T11:29:19.3034961Z",
    "roleScopeTagIds": [
     "0"
    ],
    "supportsScopeTags": true,
    "deviceManagementApplicabilityRuleOsEdition": null,
    "deviceManagementApplicabilityRuleOsVersion": null,
    "deviceManagementApplicabilityRuleDeviceMode": null,
    "createdDateTime": "2026-01-09T11:20:58.896187Z",
    "description": "https://workbench.cisecurity.org/benchmarks/19972/sections/3069323\n\n",
    "displayName": "MACOS - DCP - Device Security - D - Safari Security and Privacy - R26.6 - v3.0",
    "version": 4,
    "bundleId": "com.apple.Safari.plist",
    "fileName": "com.apple.Safari.xml",
    "configurationXml": "CTxrZXk+QXV0b09wZW5TYWZlRG93bmxvYWRzPC9rZXk+Cgk8ZmFsc2UvPgoJPGtleT5CbG9ja1N0b3JhZ2VQb2xpY3k8L2tleT4KCTxpbnRlZ2VyPjI8L2ludGVnZXI+Cgk8a2V5PlNob3dGdWxsVVJMSW5TbWFydFNlYXJjaEZpZWxkPC9rZXk+Cgk8dHJ1ZS8+Cgk8a2V5PlNob3dPdmVybGF5U3RhdHVzQmFyPC9rZXk+Cgk8dHJ1ZS8+Cgk8a2V5Pldhcm5BYm91dEZyYXVkdWxlbnRXZWJzaXRlczwva2V5PgoJPHRydWUvPgoJPGtleT5XZWJLaXRQcmVmZXJlbmNlcy5wcml2YXRlQ2xpY2tNZWFzdXJlbWVudEVuYWJsZWQ8L2tleT4KCTx0cnVlLz4KCTxrZXk+V2ViS2l0UHJlZmVyZW5jZXMuc3RvcmFnZUJsb2NraW5nUG9saWN5PC9rZXk+Cgk8aW50ZWdlcj4xPC9pbnRlZ2VyPgoJPGtleT5XZWJLaXRTdG9yYWdlQmxvY2tpbmdQb2xpY3k8L2tleT4KCTxpbnRlZ2VyPjE8L2ludGVnZXI+Cg==",
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceConfigurations('4e107d18-ced4-405a-ac2e-84fe466db38e')/microsoft.graph.macOSCustomAppConfiguration/assignments",
    "assignments": [
     {
      "id": "4e107d18-ced4-405a-ac2e-84fe466db38e_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "4e107d18-ced4-405a-ac2e-84fe466db38e",
      "intent": "apply",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos dcp device security d safari security and privacy",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Safari TAB Page Type - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:55:32.344608Z",
    "creationSource": null,
    "description": "Set the default tab start page. default",
    "lastModifiedDateTime": "2026-05-19T11:33:23.2230641Z",
    "name": "MACOS - DCP - Device Security - D - Safari TAB Page Type - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 1,
    "technologies": "mdm,appleRemoteManagement",
    "id": "193d717c-03b0-4170-a6d4-5993373da5ef",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('193d717c-03b0-4170-a6d4-5993373da5ef')/assignments",
    "assignments": [
     {
      "id": "193d717c-03b0-4170-a6d4-5993373da5ef_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "193d717c-03b0-4170-a6d4-5993373da5ef",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "safari_safari",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "safari_newtabstartpage",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "safari_newtabstartpage_pagetype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "safari_newtabstartpage_pagetype_0",
                "children": []
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d safari tab page type",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Screensaver Idle Time Configuration - R26.6 - v3.0",
   "version": "3.0",
   "section": "deviceConfigurations",
   "sectionLabel": "Device configuration profiles",
   "area": "DeviceConfigurations",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCustomConfiguration",
    "id": "80f34e7c-43d7-454c-86ea-f2473c2c8283",
    "lastModifiedDateTime": "2026-05-19T11:34:55.3133643Z",
    "roleScopeTagIds": [
     "0"
    ],
    "supportsScopeTags": true,
    "deviceManagementApplicabilityRuleOsEdition": null,
    "deviceManagementApplicabilityRuleOsVersion": null,
    "deviceManagementApplicabilityRuleDeviceMode": null,
    "createdDateTime": "2026-04-28T09:25:20.6009107Z",
    "description": "Configures screensaver idle time (10 minutes) to address Mac Evaluation Utility warning about unmanaged screensaver idle time settings. This legacy setting requires mobileconfig format as it's not available in Settings Catalog. Works in conjunction with POL-SEC-005 (Screensaver Security) which handles password requirements and other modern screensaver settings via Settings Catalog.",
    "displayName": "MACOS - DCP - Device Security - D - Screensaver Idle Time Configuration - R26.6 - v3.0",
    "version": 3,
    "payloadName": "cfg-sec-002-screensaver-idle.mobileconfig",
    "payloadFileName": "cfg-sec-002-screensaver-idle.mobileconfig",
    "payload": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCFET0NUWVBFIHBsaXN0IFBVQkxJQyAiLS8vQXBwbGUvL0RURCBQTElTVCAxLjAvL0VOIiAiaHR0cDovL3d3dy5hcHBsZS5jb20vRFREcy9Qcm9wZXJ0eUxpc3QtMS4wLmR0ZCI+CjxwbGlzdCB2ZXJzaW9uPSIxLjAiPgo8ZGljdD4KCTxrZXk+UGF5bG9hZENvbnRlbnQ8L2tleT4KCTxhcnJheT4KCQk8ZGljdD4KCQkJPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KCQkJPHN0cmluZz5TY3JlZW5zYXZlciBJZGxlIFRpbWU8L3N0cmluZz4KCQkJPGtleT5QYXlsb2FkSWRlbnRpZmllcjwva2V5PgoJCQk8c3RyaW5nPmNvbS5hcHBsZS5zY3JlZW5zYXZlci5pZGxldGltZS4xMjM0NTY3OC0xMjM0LTEyMzQtMTIzNC0xMjM0NTY3ODkwMTI8L3N0cmluZz4KCQkJPGtleT5QYXlsb2FkVHlwZTwva2V5PgoJCQk8c3RyaW5nPmNvbS5hcHBsZS5zY3JlZW5zYXZlcjwvc3RyaW5nPgoJCQk8a2V5PlBheWxvYWRVVUlEPC9rZXk+CgkJCTxzdHJpbmc+MTIzNDU2NzgtMTIzNC0xMjM0LTEyMzQtMTIzNDU2Nzg5MDEyPC9zdHJpbmc+CgkJCTxrZXk+UGF5bG9hZFZlcnNpb248L2tleT4KCQkJPGludGVnZXI+MTwvaW50ZWdlcj4KCQkJPGtleT5pZGxlVGltZTwva2V5PgoJCQk8aW50ZWdlcj42MDA8L2ludGVnZXI+CgkJPC9kaWN0PgoJPC9hcnJheT4KCTxrZXk+UGF5bG9hZERpc3BsYXlOYW1lPC9rZXk+Cgk8c3RyaW5nPlNjcmVlbnNhdmVyIElkbGUgVGltZSBDb25maWd1cmF0aW9uPC9zdHJpbmc+Cgk8a2V5PlBheWxvYWRJZGVudGlmaWVyPC9rZXk+Cgk8c3RyaW5nPmNvbS5jb21wYW55LnNjcmVlbnNhdmVyLmlkbGV0aW1lPC9zdHJpbmc+Cgk8a2V5PlBheWxvYWRUeXBlPC9rZXk+Cgk8c3RyaW5nPkNvbmZpZ3VyYXRpb248L3N0cmluZz4KCTxrZXk+UGF5bG9hZFVVSUQ8L2tleT4KCTxzdHJpbmc+ODc2NTQzMjEtNDMyMS00MzIxLTQzMjEtMjEwOTg3NjU0MzIxPC9zdHJpbmc+Cgk8a2V5PlBheWxvYWRWZXJzaW9uPC9rZXk+Cgk8aW50ZWdlcj4xPC9pbnRlZ2VyPgo8L2RpY3Q+CjwvcGxpc3Q+Cg==",
    "deploymentChannel": "deviceChannel",
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceConfigurations('80f34e7c-43d7-454c-86ea-f2473c2c8283')/microsoft.graph.macOSCustomConfiguration/assignments",
    "assignments": []
   },
   "key": "macos dcp device security d screensaver idle time configuration",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - Screensaver Security - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:02.0175868Z",
    "creationSource": null,
    "description": "Configures comprehensive screensaver security settings including idle time activation (10 minutes), password requirements, delay timing, and login window idle timeout to enhance device security when unattended.",
    "lastModifiedDateTime": "2026-05-19T11:35:05.9849945Z",
    "name": "MACOS - DCP - Device Security - D - Screensaver Security - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 2,
    "technologies": "mdm,appleRemoteManagement",
    "id": "2739ee43-b8f6-4ccf-a980-59d41c31e1da",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('2739ee43-b8f6-4ccf-a980-59d41c31e1da')/assignments",
    "assignments": [
     {
      "id": "2739ee43-b8f6-4ccf-a980-59d41c31e1da_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "2739ee43-b8f6-4ccf-a980-59d41c31e1da",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.screensaver_com.apple.screensaver",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.screensaver_askforpassword",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.screensaver_askforpassword_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.screensaver_askforpassworddelay",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 60
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.screensaver_loginwindowidletime",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 1200
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.screensaver_modulename",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "Flurry"
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.screensaver.user_com.apple.screensaver.user",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.screensaver.user_idletime",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            "settingValueTemplateReference": null,
            "value": 600
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.screensaver.user_modulename",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "Flurry"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d screensaver security",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Device Security - D - System Restrictions - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:02.3151451Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T12:15:57.8104146Z",
    "name": "MACOS - DCP - Device Security - D - System Restrictions - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 2,
    "technologies": "mdm,appleRemoteManagement",
    "id": "8e38b50c-ac62-469a-8d93-d390b7cf2ffe",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('8e38b50c-ac62-469a-8d93-d390b7cf2ffe')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx_com.apple.mcx-accounts",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx_disableguestaccount",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx_disableguestaccount_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.applicationaccess_com.apple.applicationaccess",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowaccountmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowaccountmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowactivitycontinuation",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowactivitycontinuation_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowaddinggamecenterfriends",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowaddinggamecenterfriends_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowairplayincomingrequests",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowairplayincomingrequests_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowairdrop",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowairdrop_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowappleintelligencereport",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowappleintelligencereport_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowapplepersonalizedadvertising",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowapplepersonalizedadvertising_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowardremotemanagementmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowardremotemanagementmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowassistant",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowassistant_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowautounlock",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowautounlock_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowbluetoothmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowbluetoothmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowbluetoothsharingmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowbluetoothsharingmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowbookstore",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowbookstore_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowbookstoreerotica",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowbookstoreerotica_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcamera",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcamera_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudaddressbook",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudaddressbook_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudbookmarks",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudbookmarks_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudcalendar",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudcalendar_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowclouddesktopanddocuments",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowclouddesktopanddocuments_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowclouddocumentsync",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowclouddocumentsync_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudfreeform",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudfreeform_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudkeychainsync",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudkeychainsync_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudmail",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudmail_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudnotes",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudnotes_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudphotolibrary",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudphotolibrary_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudprivaterelay",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudprivaterelay_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcloudreminders",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcloudreminders_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowcontentcaching",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowcontentcaching_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowdefinitionlookup",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowdefinitionlookup_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowdevicenamemodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowdevicenamemodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowdiagnosticsubmission",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowdiagnosticsubmission_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowdictation",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowdictation_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowerasecontentandsettings",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowerasecontentandsettings_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowexplicitcontent",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowexplicitcontent_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowexternalintelligenceintegrations",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowexternalintelligenceintegrations_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowexternalintelligenceintegrationssignin",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowexternalintelligenceintegrationssignin_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowfilesharingmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowfilesharingmodification_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowfindmydevice",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowfindmydevice_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowfindmyfriends",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowfindmyfriends_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowfingerprintforunlock",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowfingerprintforunlock_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowfingerprintmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowfingerprintmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowgamecenter",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowgamecenter_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowgenmoji",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowgenmoji_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowimageplayground",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowimageplayground_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowinternetsharingmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowinternetsharingmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowiphonemirroring",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowiphonemirroring_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowitunesfilesharing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowitunesfilesharing_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowlocalusercreation",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowlocalusercreation_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowmailsmartreplies",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowmailsmartreplies_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowmailsummary",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowmailsummary_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowmediasharingmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowmediasharingmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowmultiplayergaming",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowmultiplayergaming_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowmusicservice",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowmusicservice_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allownotestranscription",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allownotestranscription_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allownotestranscriptionsummary",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allownotestranscriptionsummary_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowpasscodemodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowpasscodemodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowpasswordautofill",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowpasswordautofill_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowpasswordproximityrequests",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowpasswordproximityrequests_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowpasswordsharing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowpasswordsharing_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowprintersharingmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowprintersharingmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowrapidsecurityresponseinstallation",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowrapidsecurityresponseinstallation_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowrapidsecurityresponseremoval",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowrapidsecurityresponseremoval_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowremoteappleeventsmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowremoteappleeventsmodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowremotescreenobservation",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowremotescreenobservation_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowsafarihistoryclearing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowsafarihistoryclearing_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowsafariprivatebrowsing",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowsafariprivatebrowsing_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowsafarisummary",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowsafarisummary_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowscreenshot",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowscreenshot_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowspotlightinternetresults",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowspotlightinternetresults_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowstartupdiskmodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowstartupdiskmodification_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowtimemachinebackup",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowtimemachinebackup_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowuiconfigurationprofileinstallation",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowuiconfigurationprofileinstallation_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowuniversalcontrol",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowuniversalcontrol_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowusbrestrictedmode",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowusbrestrictedmode_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowwallpapermodification",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowwallpapermodification_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_allowwritingtools",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_allowwritingtools_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_forcebypassscreencapturealert",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_forcebypassscreencapturealert_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_forceondeviceonlydictation",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_forceondeviceonlydictation_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.applicationaccess_safariallowautofill",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.applicationaccess_safariallowautofill_true",
            "children": []
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp device security d system restrictions",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Disk Encryption - D - FileVault - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:00.9540351Z",
    "creationSource": null,
    "description": "Configures FileVault disk encryption on macOS devices during Setup Assistant with recovery key escrow to Microsoft Endpoint Manager for enterprise data protection.",
    "lastModifiedDateTime": "2026-05-19T12:16:21.8482048Z",
    "name": "MACOS - DCP - Disk Encryption - D - FileVault - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 3,
    "technologies": "mdm,appleRemoteManagement",
    "id": "ac930d19-8224-4e92-93c7-f35376ab7b8b",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('ac930d19-8224-4e92-93c7-f35376ab7b8b')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx.filevault2_com.apple.mcx.filevault2",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx.filevault2_defer",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx.filevault2_defer_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx.filevault2_enable",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx.filevault2_enable_0",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx.filevault2_forceenableinsetupassistant",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx.filevault2_forceenableinsetupassistant_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx.filevault2_showrecoverykey",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx.filevault2_showrecoverykey_false",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx.filevault2_userecoverykey",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx.filevault2_userecoverykey_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx.filevault2_userentersmissinginfo",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx.filevault2_userentersmissinginfo_false",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.mcx_com.apple.mcx-fdefilevaultoptions",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx_dontallowfdedisable",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx_dontallowfdedisable_true",
            "children": []
           }
          },
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
           "settingDefinitionId": "com.apple.mcx_dontallowfdeenable",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "choiceSettingValue": {
            "settingValueTemplateReference": null,
            "value": "com.apple.mcx_dontallowfdeenable_false",
            "children": []
           }
          }
         ]
        }
       ]
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.security.fderecoverykeyescrow_com.apple.security.fderecoverykeyescrow",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
           "settingDefinitionId": "com.apple.security.fderecoverykeyescrow_location",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "simpleSettingValue": {
            "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            "settingValueTemplateReference": null,
            "value": "https://user.manage.microsoft.com"
           }
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp disk encryption d filevault",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Google Chrome - D - SSO Configuration - R26.6 - v3.0",
   "version": "3.0",
   "section": "deviceConfigurations",
   "sectionLabel": "Device configuration profiles",
   "area": "DeviceConfigurations",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCustomConfiguration",
    "id": "e02be58e-9ec1-485b-98fb-1b55cd4a72ce",
    "lastModifiedDateTime": "2026-05-19T11:27:05.1304056Z",
    "roleScopeTagIds": [
     "0"
    ],
    "supportsScopeTags": true,
    "deviceManagementApplicabilityRuleOsEdition": null,
    "deviceManagementApplicabilityRuleOsVersion": null,
    "deviceManagementApplicabilityRuleDeviceMode": null,
    "createdDateTime": "2026-01-08T19:35:20.3904169Z",
    "description": null,
    "displayName": "MACOS - DCP - Google Chrome - D - SSO Configuration - R26.6 - v3.0",
    "version": 4,
    "payloadName": "Google Chrome Platform SSO Profile",
    "payloadFileName": "GoogleChromepSSO.mobileconfig",
    "payload": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPCFET0NUWVBFIHBsaXN0IFBVQkxJQyAiLS8vQXBwbGUvL0RURCBQTElTVCAxLjAvL0VOIiAiaHR0cDovL3d3dy5hcHBsZS5jb20vRFREcy9Qcm9wZXJ0eUxpc3QtMS4wLmR0ZCI+CjxwbGlzdCB2ZXJzaW9uPSIxLjAiPgogIDxkaWN0PgogICAgPGtleT5QYXlsb2FkQ29udGVudDwva2V5PgogICAgPGFycmF5PgogICAgICA8ZGljdD4KICAgICAgICA8a2V5PlBheWxvYWRDb250ZW50PC9rZXk+CiAgICAgICAgPGRpY3Q+CiAgICAgICAgICA8a2V5PmNvbS5nb29nbGUuQ2hyb21lPC9rZXk+CiAgICAgICAgICA8ZGljdD4KICAgICAgICAgICAgPGtleT5Gb3JjZWQ8L2tleT4KICAgICAgICAgICAgPGFycmF5PgogICAgICAgICAgICAgIDxkaWN0PgogICAgICAgICAgICAgICAgPGtleT5tY3hfcHJlZmVyZW5jZV9zZXR0aW5nczwva2V5PgogICAgICAgICAgICAgICAgPGRpY3Q+CiAgICAgICAgICAgICAgICAgIDxrZXk+RXh0ZW5zaW9uU2V0dGluZ3M8L2tleT4KICAgICAgICAgICAgICAgICAgPGRpY3Q+CiAgICAgICAgICAgICAgICAgICAgPGtleT5wcG5ibnBlb2xna2ljZ2Vna2JrYmptaGxpZGVvcGlqaTwva2V5PgogICAgICAgICAgICAgICAgICAgIDxkaWN0PgogICAgICAgICAgICAgICAgICAgICAgPGtleT5pbnN0YWxsYXRpb25fbW9kZTwva2V5PgogICAgICAgICAgICAgICAgICAgICAgPHN0cmluZz5mb3JjZV9pbnN0YWxsZWQ8L3N0cmluZz4KICAgICAgICAgICAgICAgICAgICAgIDxrZXk+dXBkYXRlX3VybDwva2V5PgogICAgICAgICAgICAgICAgICAgICAgPHN0cmluZz5odHRwczovL2NsaWVudHMyLmdvb2dsZS5jb20vc2VydmljZS91cGRhdGUyL2NyeDwvc3RyaW5nPgogICAgICAgICAgICAgICAgICAgIDwvZGljdD4KICAgICAgICAgICAgICAgICAgPC9kaWN0PgogICAgICAgICAgICAgICAgPC9kaWN0PgogICAgICAgICAgICAgIDwvZGljdD4KICAgICAgICAgICAgPC9hcnJheT4KICAgICAgICAgIDwvZGljdD4KICAgICAgICA8L2RpY3Q+CiAgICAgICAgPGtleT5QYXlsb2FkRGlzcGxheU5hbWU8L2tleT4KICAgICAgICA8c3RyaW5nPkdvb2dsZSBDaHJvbWUgUGxhdGZvcm0gU1NPIEV4dGVuc2lvbiBTZXR0aW5nczwvc3RyaW5nPgogICAgICAgIDxrZXk+UGF5bG9hZEVuYWJsZWQ8L2tleT4KICAgICAgICA8dHJ1ZS8+CiAgICAgICAgPGtleT5QYXlsb2FkSWRlbnRpZmllcjwva2V5PgogICAgICAgIDxzdHJpbmc+Y29tLmdvb2dsZS5DaHJvbWUuZXh0ZW5zaW9ucy5wbGF0Zm9ybXNzbzwvc3RyaW5nPgogICAgICAgIDxrZXk+UGF5bG9hZFR5cGU8L2tleT4KICAgICAgICA8c3RyaW5nPmNvbS5hcHBsZS5NYW5hZ2VkQ2xpZW50LnByZWZlcmVuY2VzPC9zdHJpbmc+CiAgICAgICAgPGtleT5QYXlsb2FkVVVJRDwva2V5PgogICAgICAgIDxzdHJpbmc+MGY2NDRiYjItYTFlMC00YTkwLWEwOTMtOTM0ZjMyZTEyNmRlPC9zdHJpbmc+CiAgICAgICAgPGtleT5QYXlsb2FkVmVyc2lvbjwva2V5PgogICAgICAgIDxpbnRlZ2VyPjE8L2ludGVnZXI+CiAgICAgIDwvZGljdD4KICAgIDwvYXJyYXk+CiAgICA8a2V5PlBheWxvYWREZXNjcmlwdGlvbjwva2V5PgogICAgPHN0cmluZz5Hb29nbGUgQ2hyb21lIENvbmZpZ3VyYXRpb248L3N0cmluZz4KICAgIDxrZXk+UGF5bG9hZERpc3BsYXlOYW1lPC9rZXk+CiAgICA8c3RyaW5nPkdvb2dsZSBDaHJvbWUgQ29uZmlndXJhdGlvbjwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkSWRlbnRpZmllcjwva2V5PgogICAgPHN0cmluZz5jb20uZ29vZ2xlLkNocm9tZTwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkT3JnYW5pemF0aW9uPC9rZXk+CiAgICA8c3RyaW5nPk1FTSB2IEVOTkJFRTwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkUmVtb3ZhbERpc2FsbG93ZWQ8L2tleT4KICAgIDx0cnVlLz4KICAgIDxrZXk+UGF5bG9hZFNjb3BlPC9rZXk+CiAgICA8c3RyaW5nPlN5c3RlbTwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkVHlwZTwva2V5PgogICAgPHN0cmluZz5Db25maWd1cmF0aW9uPC9zdHJpbmc+CiAgICA8a2V5PlBheWxvYWRVVUlEPC9rZXk+CiAgICA8c3RyaW5nPmEwMWQ3YTgwLTZkYjAtNDM5Mi1hOGE5LTk4OTE0N2ZiMmFhMTwvc3RyaW5nPgogICAgPGtleT5QYXlsb2FkVmVyc2lvbjwva2V5PgogICAgPGludGVnZXI+MTwvaW50ZWdlcj4KICA8L2RpY3Q+CjwvcGxpc3Q+Cg==",
    "deploymentChannel": "deviceChannel",
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceConfigurations('e02be58e-9ec1-485b-98fb-1b55cd4a72ce')/microsoft.graph.macOSCustomConfiguration/assignments",
    "assignments": [
     {
      "id": "e02be58e-9ec1-485b-98fb-1b55cd4a72ce_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "e02be58e-9ec1-485b-98fb-1b55cd4a72ce",
      "intent": "apply",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos dcp google chrome d sso configuration",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft AutoUpdate - D - MAU Pilot Configuration PILOT - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:36.0513965Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:34:27.9602853Z",
    "name": "MACOS - DCP - Microsoft AutoUpdate - D - MAU Pilot Configuration PILOT - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 14,
    "technologies": "mdm,appleRemoteManagement",
    "id": "be759847-0a0d-4557-a65e-467df656c5b0",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('be759847-0a0d-4557-a65e-467df656c5b0')/assignments",
    "assignments": [
     {
      "id": "be759847-0a0d-4557-a65e-467df656c5b0_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "be759847-0a0d-4557-a65e-467df656c5b0",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.servicemanagement_com.apple.servicemanagement",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.servicemanagement_rules",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "MAU"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_0",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.autoupdate2"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_acknowledgeddatacollectionpolicy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_acknowledgeddatacollectionpolicy_0",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatedeadline.daysbeforeforcedquit",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
        "settingValueTemplateReference": null,
        "value": 1
       }
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_disableinsidercheckbox",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_disableinsidercheckbox_true",
        "children": []
       }
      }
     },
     {
      "id": "4",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_howtocheck",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_howtocheck_0",
        "children": []
       }
      }
     },
     {
      "id": "5",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enablecheckforupdatesbutton",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enablecheckforupdatesbutton_true",
        "children": []
       }
      }
     },
     {
      "id": "6",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_extendedlogging",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_extendedlogging_true",
        "children": []
       }
      }
     },
     {
      "id": "7",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_guardagainstappmodification",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_guardagainstappmodification_true",
        "children": []
       }
      }
     },
     {
      "id": "8",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatedeadline.finalcountdown",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
        "settingValueTemplateReference": null,
        "value": 60
       }
      }
     },
     {
      "id": "9",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_startdaemononapplaunch",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_startdaemononapplaunch_true",
        "children": []
       }
      }
     },
     {
      "id": "10",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatecache",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
        "settingValueTemplateReference": null,
        "value": "https://officecdn.microsoft.com/pr/C1297A47-86C4-4C1F-97FA-950631F94777/OfficeMac/"
       }
      }
     },
     {
      "id": "11",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_channelname",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_channelname_1",
        "children": []
       }
      }
     },
     {
      "id": "12",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatecheckfrequency",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
        "settingValueTemplateReference": null,
        "value": 240
       }
      }
     },
     {
      "id": "13",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updateroptimization",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_updateroptimization_0",
        "children": []
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft autoupdate d mau pilot configuration pilot",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft AutoUpdate - D - MAU Production Configuration - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-09T10:35:48.2037203Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:34:14.8154185Z",
    "name": "MACOS - DCP - Microsoft AutoUpdate - D - MAU Production Configuration - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 14,
    "technologies": "mdm,appleRemoteManagement",
    "id": "1f9cd4a5-52d1-4e86-8ec0-bc9ab7f48e3c",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('1f9cd4a5-52d1-4e86-8ec0-bc9ab7f48e3c')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.servicemanagement_com.apple.servicemanagement",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.servicemanagement_rules",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "MAU"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_0",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.autoupdate2"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_acknowledgeddatacollectionpolicy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_acknowledgeddatacollectionpolicy_0",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatedeadline.daysbeforeforcedquit",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
        "settingValueTemplateReference": null,
        "value": 7
       }
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_disableinsidercheckbox",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_disableinsidercheckbox_true",
        "children": []
       }
      }
     },
     {
      "id": "4",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_howtocheck",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_howtocheck_0",
        "children": []
       }
      }
     },
     {
      "id": "5",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enablecheckforupdatesbutton",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enablecheckforupdatesbutton_true",
        "children": []
       }
      }
     },
     {
      "id": "6",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_extendedlogging",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_extendedlogging_true",
        "children": []
       }
      }
     },
     {
      "id": "7",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_guardagainstappmodification",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_guardagainstappmodification_true",
        "children": []
       }
      }
     },
     {
      "id": "8",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatedeadline.finalcountdown",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
        "settingValueTemplateReference": null,
        "value": 60
       }
      }
     },
     {
      "id": "9",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_startdaemononapplaunch",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_startdaemononapplaunch_true",
        "children": []
       }
      }
     },
     {
      "id": "10",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatecache",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
        "settingValueTemplateReference": null,
        "value": "https://officecdn.microsoft.com/pr/C1297A47-86C4-4C1F-97FA-950631F94777/OfficeMac/"
       }
      }
     },
     {
      "id": "11",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_channelname",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_channelname_2",
        "children": []
       }
      }
     },
     {
      "id": "12",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updatecheckfrequency",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
        "settingValueTemplateReference": null,
        "value": 240
       }
      }
     },
     {
      "id": "13",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_updateroptimization",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_updateroptimization_0",
        "children": []
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft autoupdate d mau production configuration",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft Edge - D - Password Management - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:38.6867461Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:28:32.7370556Z",
    "name": "MACOS - DCP - Microsoft Edge - D - Password Management - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 3,
    "technologies": "mdm,appleRemoteManagement",
    "id": "706d4fe7-e474-40d6-a868-a98a6e64538d",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('706d4fe7-e474-40d6-a868-a98a6e64538d')/assignments",
    "assignments": [
     {
      "id": "706d4fe7-e474-40d6-a868-a98a6e64538d_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "706d4fe7-e474-40d6-a868-a98a6e64538d",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_passwordmonitorallowed",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_passwordmonitorallowed_true",
        "children": []
       }
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_passwordprotectionwarningtrigger",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_passwordprotectionwarningtrigger_1",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_passwordmanagerenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_passwordmanagerenabled_true",
        "children": []
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft edge d password management",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft Edge - D - Security - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:40.0995831Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:32:54.96483Z",
    "name": "MACOS - DCP - Microsoft Edge - D - Security - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 31,
    "technologies": "mdm,appleRemoteManagement",
    "id": "2a62fe45-a5dd-47b0-a878-6e00e342a85c",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('2a62fe45-a5dd-47b0-a878-6e00e342a85c')/assignments",
    "assignments": [
     {
      "id": "2a62fe45-a5dd-47b0-a878-6e00e342a85c_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "2a62fe45-a5dd-47b0-a878-6e00e342a85c",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_adssettingforintrusiveadssites",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_adssettingforintrusiveadssites_1",
        "children": []
       }
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_downloadrestrictions",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_downloadrestrictions_1",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_importbrowsersettings",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_importbrowsersettings_false",
        "children": []
       }
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_importhistory",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_importhistory_false",
        "children": []
       }
      }
     },
     {
      "id": "4",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_importhomepage",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_importhomepage_false",
        "children": []
       }
      }
     },
     {
      "id": "5",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_importpaymentinfo",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_importpaymentinfo_false",
        "children": []
       }
      }
     },
     {
      "id": "6",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_importsavedpasswords",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_importsavedpasswords_false",
        "children": []
       }
      }
     },
     {
      "id": "7",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_importsearchengine",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_importsearchengine_false",
        "children": []
       }
      }
     },
     {
      "id": "8",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enterprisehardwareplatformapienabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enterprisehardwareplatformapienabled_false",
        "children": []
       }
      }
     },
     {
      "id": "9",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_personalizationreportingenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_personalizationreportingenabled_false",
        "children": []
       }
      }
     },
     {
      "id": "10",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_browsernetworktimequeriesenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_browsernetworktimequeriesenabled_true",
        "children": []
       }
      }
     },
     {
      "id": "11",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_nativemessaginguserlevelhosts",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_nativemessaginguserlevelhosts_false",
        "children": []
       }
      }
     },
     {
      "id": "12",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_autoimportatfirstrun",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_autoimportatfirstrun_4",
        "children": []
       }
      }
     },
     {
      "id": "13",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_trackingprevention",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_trackingprevention_2",
        "children": []
       }
      }
     },
     {
      "id": "14",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_clearbrowsingdataonexit",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_clearbrowsingdataonexit_false",
        "children": []
       }
      }
     },
     {
      "id": "15",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_clearcachedimagesandfilesonexit",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_clearcachedimagesandfilesonexit_false",
        "children": []
       }
      }
     },
     {
      "id": "16",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_smartscreenenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_smartscreenenabled_true",
        "children": []
       }
      }
     },
     {
      "id": "17",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_smartscreenpuaenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_smartscreenpuaenabled_true",
        "children": []
       }
      }
     },
     {
      "id": "18",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_experimentationandconfigurationservicecontrol",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_experimentationandconfigurationservicecontrol_2",
        "children": []
       }
      }
     },
     {
      "id": "19",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_defaultpopupssetting",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_defaultpopupssetting_1",
        "children": []
       }
      }
     },
     {
      "id": "20",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_dnsinterceptionchecksenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_dnsinterceptionchecksenabled_true",
        "children": []
       }
      }
     },
     {
      "id": "21",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_autofilladdressenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_autofilladdressenabled_false",
        "children": []
       }
      }
     },
     {
      "id": "22",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_autofillcreditcardenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_autofillcreditcardenabled_false",
        "children": []
       }
      }
     },
     {
      "id": "23",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enablemediarouter",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enablemediarouter_false",
        "children": []
       }
      }
     },
     {
      "id": "24",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_networkpredictionoptions",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_networkpredictionoptions_2",
        "children": []
       }
      }
     },
     {
      "id": "25",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_proactiveauthenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_proactiveauthenabled_false",
        "children": []
       }
      }
     },
     {
      "id": "26",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_hidefirstrunexperience",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_hidefirstrunexperience_true",
        "children": []
       }
      }
     },
     {
      "id": "27",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_sslversionmin",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_sslversionmin_2",
        "children": []
       }
      }
     },
     {
      "id": "28",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_preventsmartscreenpromptoverride",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_preventsmartscreenpromptoverride_true",
        "children": []
       }
      }
     },
     {
      "id": "29",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_preventsmartscreenpromptoverrideforfiles",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_preventsmartscreenpromptoverrideforfiles_true",
        "children": []
       }
      }
     },
     {
      "id": "30",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_authschemes",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
        "settingValueTemplateReference": null,
        "value": "ntlm,negotiate"
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft edge d security",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft Edge - U - Extensions - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:41.3653071Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:28:24.0010043Z",
    "name": "MACOS - DCP - Microsoft Edge - U - Extensions - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 4,
    "technologies": "mdm,appleRemoteManagement",
    "id": "5961d8f8-0436-4189-b066-f6bdcb5d5691",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('5961d8f8-0436-4189-b066-f6bdcb5d5691')/assignments",
    "assignments": [
     {
      "id": "5961d8f8-0436-4189-b066-f6bdcb5d5691_93d20a3f-d668-450f-b5e1-9a84b84e0c08",
      "source": "direct",
      "sourceId": "5961d8f8-0436-4189-b066-f6bdcb5d5691",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "93d20a3f-d668-450f-b5e1-9a84b84e0c08"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_extensioninstallallowlist",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingCollectionValue": [
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "odfafepnkmbhccpbejgmiehpchacaeak"
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_blockexternalextensions",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_blockexternalextensions_true",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_extensioninstallforcelist",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingCollectionValue": [
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "nkbndigcebkoaejohleckhekfmcecfja"
        },
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "ofefcgjbeghpigppfmkologfjadafddi"
        }
       ]
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_extensioninstallblocklist",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingCollectionValue": [
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "*"
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp microsoft edge u extensions",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft Edge - U - Profiles, Sign-In and Sync - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:42.6466126Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:28:09.5925013Z",
    "name": "MACOS - DCP - Microsoft Edge - U - Profiles, Sign-In and Sync - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 4,
    "technologies": "mdm,appleRemoteManagement",
    "id": "3838f029-0943-4995-ad46-9d2f3f25cbab",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('3838f029-0943-4995-ad46-9d2f3f25cbab')/assignments",
    "assignments": [
     {
      "id": "3838f029-0943-4995-ad46-9d2f3f25cbab_93d20a3f-d668-450f-b5e1-9a84b84e0c08",
      "source": "direct",
      "sourceId": "3838f029-0943-4995-ad46-9d2f3f25cbab",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "93d20a3f-d668-450f-b5e1-9a84b84e0c08"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_browsersignin",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_browsersignin_2",
        "children": []
       }
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_browseraddprofileenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_browseraddprofileenabled_false",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_forceephemeralprofiles",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_forceephemeralprofiles_false",
        "children": []
       }
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_forcesync",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_forcesync_true",
        "children": []
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft edge u profiles, sign in and sync",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft Edge - U - Updates - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-08T19:34:43.9406514Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:27:48.1954996Z",
    "name": "MACOS - DCP - Microsoft Edge - U - Updates - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 3,
    "technologies": "mdm,appleRemoteManagement",
    "id": "73e0862e-a933-44d0-9cb6-7ada2f3e3d87",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('73e0862e-a933-44d0-9cb6-7ada2f3e3d87')/assignments",
    "assignments": [
     {
      "id": "73e0862e-a933-44d0-9cb6-7ada2f3e3d87_93d20a3f-d668-450f-b5e1-9a84b84e0c08",
      "source": "direct",
      "sourceId": "73e0862e-a933-44d0-9cb6-7ada2f3e3d87",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "93d20a3f-d668-450f-b5e1-9a84b84e0c08"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.servicemanagement_com.apple.servicemanagement",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.servicemanagement_rules",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "Edge Updater"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_3",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.EdgeUpdater"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_componentupdatesenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_componentupdatesenabled_true",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_relaunchnotification",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_relaunchnotification_1",
        "children": []
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft edge u updates",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft Office - D - M365 Installation Controls - R26.6 - v3.0",
   "version": "3.0",
   "section": "deviceConfigurations",
   "sectionLabel": "Device configuration profiles",
   "area": "DeviceConfigurations",
   "importable": true,
   "body": {
    "@odata.type": "#microsoft.graph.macOSCustomConfiguration",
    "id": "7bf3fe35-b914-45e7-ab95-5728c3dda033",
    "lastModifiedDateTime": "2026-05-19T11:27:12.866371Z",
    "roleScopeTagIds": [
     "0"
    ],
    "supportsScopeTags": true,
    "deviceManagementApplicabilityRuleOsEdition": null,
    "deviceManagementApplicabilityRuleOsVersion": null,
    "deviceManagementApplicabilityRuleDeviceMode": null,
    "createdDateTime": "2026-01-14T12:34:50.4892459Z",
    "description": null,
    "displayName": "MACOS - DCP - Microsoft Office - D - M365 Installation Controls - R26.6 - v3.0",
    "version": 6,
    "payloadName": "M365-Installation Control",
    "payloadFileName": "Microsoft 365 Apps - Installation Control.mobileconfig",
    "payload": "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjwhRE9DVFlQRSBwbGlzdCBQVUJMSUMgIi0vL0FwcGxlLy9EVEQgUExJU1QgMS4wLy9FTiIgImh0dHA6Ly93d3cuYXBwbGUuY29tL0RURHMvUHJvcGVydHlMaXN0LTEuMC5kdGQiPg0KPHBsaXN0IHZlcnNpb249IjEuMCI+DQo8ZGljdD4NCiAgICA8a2V5PlBheWxvYWRVVUlEPC9rZXk+DQogICAgPHN0cmluZz5FMjUzMkMzNC05M0JFLTQ0NTUtQTg3Qi03MDNGMTQ5RTlCOTQ8L3N0cmluZz4NCiAgICA8a2V5PlBheWxvYWRUeXBlPC9rZXk+DQogICAgPHN0cmluZz5Db25maWd1cmF0aW9uPC9zdHJpbmc+DQogICAgPGtleT5QYXlsb2FkT3JnYW5pemF0aW9uPC9rZXk+DQogICAgPHN0cmluZz5NaWNyb3NvZnQgQ29ycG9yYXRpb248L3N0cmluZz4NCiAgICA8a2V5PlBheWxvYWRJZGVudGlmaWVyPC9rZXk+DQogICAgPHN0cmluZz5GN0FGQUYwQS02QzkzLTQ2MjgtOTg4NC00REE0QTI4M0Y5N0Q8L3N0cmluZz4NCiAgICA8a2V5PlBheWxvYWREaXNwbGF5TmFtZTwva2V5Pg0KICAgIDxzdHJpbmc+TWljcm9zb2Z0IDM2NSBBcHBzIC0gSW5zdGFsbGF0aW9uIENvbnRyb2w8L3N0cmluZz4NCiAgICA8a2V5PlBheWxvYWREZXNjcmlwdGlvbjwva2V5Pg0KICAgIDxzdHJpbmc+SW5zdGFsbGF0aW9uIGNvbnRyb2wgb2YgTWljcm9zb2Z0IDM2NSBBcHBzPC9zdHJpbmc+DQogICAgPGtleT5QYXlsb2FkVmVyc2lvbjwva2V5Pg0KICAgIDxpbnRlZ2VyPjE8L2ludGVnZXI+DQogICAgPGtleT5QYXlsb2FkRW5hYmxlZDwva2V5Pg0KICAgIDx0cnVlLz4NCiAgICA8a2V5PlBheWxvYWRSZW1vdmFsRGlzYWxsb3dlZDwva2V5Pg0KICAgIDx0cnVlLz4NCiAgICA8a2V5PlBheWxvYWRTY29wZTwva2V5Pg0KICAgIDxzdHJpbmc+U3lzdGVtPC9zdHJpbmc+DQogICAgPGtleT5QYXlsb2FkQ29udGVudDwva2V5Pg0KICAgIDxhcnJheT4NCgkJPGRpY3Q+DQoJCQk8a2V5PlBheWxvYWRVVUlEPC9rZXk+DQoJCQk8c3RyaW5nPkM1MENFNDMyLTg5RTUtNDgzQy04NDZCLUE4N0YwMzQyQTE3Nzwvc3RyaW5nPg0KCQkJPGtleT5QYXlsb2FkVHlwZTwva2V5Pg0KCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0Lm9mZmljZTwvc3RyaW5nPg0KCQkJPGtleT5QYXlsb2FkT3JnYW5pemF0aW9uPC9rZXk+DQoJCQk8c3RyaW5nPk1pY3Jvc29mdCBDb3Jwb3JhdGlvbjwvc3RyaW5nPg0KCQkJPGtleT5QYXlsb2FkSWRlbnRpZmllcjwva2V5Pg0KCQkJPHN0cmluZz5jb20ubWljcm9zb2Z0Lm9mZmljZS5DNTBDRTQzMi04OUU1LTQ4M0MtODQ2Qi1BODdGMDM0MkExNzc8L3N0cmluZz4NCgkJCTxrZXk+UGF5bG9hZERpc3BsYXlOYW1lPC9rZXk+DQoJCQk8c3RyaW5nPk1pY3Jvc29mdCAzNjUgQXBwcyAtIEluc3RhbGxhdGlvbiBDb250cm9sPC9zdHJpbmc+DQoJCQk8a2V5PlBheWxvYWREZXNjcmlwdGlvbjwva2V5Pg0KICAgIAkJPHN0cmluZz5JbnN0YWxsYXRpb24gY29udHJvbCBvZiBNaWNyb3NvZnQgMzY1IEFwcHM8L3N0cmluZz4NCgkJCTxrZXk+UGF5bG9hZFZlcnNpb248L2tleT4NCgkJCTxpbnRlZ2VyPjE8L2ludGVnZXI+DQoJCQk8a2V5PlBheWxvYWRFbmFibGVkPC9rZXk+DQoJCQk8dHJ1ZS8+DQoJCQk8a2V5Pkluc3RhbGxFeGNlbDwva2V5Pg0KCQkJPHRydWUvPg0KCQkJPGtleT5JbnN0YWxsT25lRHJpdmU8L2tleT4NCgkJCTx0cnVlLz4NCgkJCTxrZXk+SW5zdGFsbE9uZU5vdGU8L2tleT4NCgkJCTx0cnVlLz4NCgkJCTxrZXk+SW5zdGFsbE91dGxvb2s8L2tleT4NCgkJCTx0cnVlLz4NCgkJCTxrZXk+SW5zdGFsbFBvd2VyUG9pbnQ8L2tleT4NCgkJCTx0cnVlLz4NCgkJCTxrZXk+SW5zdGFsbFRlYW1zPC9rZXk+DQoJCQk8dHJ1ZS8+DQoJCQk8a2V5Pkluc3RhbGxXb3JkPC9rZXk+DQoJCQk8dHJ1ZS8+DQoJCQk8a2V5Pkluc3RhbGxEZWZlbmRlcjwva2V5Pg0KCQkJPGZhbHNlLz4NCgkJCTxrZXk+SW5zdGFsbEF1dG9VcGRhdGU8L2tleT4NCgkJCTx0cnVlLz4NCgkJPC9kaWN0Pg0KCTwvYXJyYXk+DQo8L2RpY3Q+DQo8L3BsaXN0Pg==",
    "deploymentChannel": "deviceChannel",
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceConfigurations('7bf3fe35-b914-45e7-ab95-5728c3dda033')/microsoft.graph.macOSCustomConfiguration/assignments",
    "assignments": [
     {
      "id": "7bf3fe35-b914-45e7-ab95-5728c3dda033_f1a6d043-f424-460c-94ad-4629f5929674",
      "source": "direct",
      "sourceId": "7bf3fe35-b914-45e7-ab95-5728c3dda033",
      "intent": "apply",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos dcp microsoft office d m365 installation controls",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft Office - D - Office Configuration - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-28T09:25:00.6465271Z",
    "creationSource": null,
    "description": "Removed Office update. There is a seperate policy for Microsoft Updates",
    "lastModifiedDateTime": "2026-05-19T12:16:30.4703838Z",
    "name": "MACOS - DCP - Microsoft Office - D - Office Configuration - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 6,
    "technologies": "mdm,appleRemoteManagement",
    "id": "e6b0f038-404b-4028-814c-14d7f7a2069b",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('e6b0f038-404b-4028-814c-14d7f7a2069b')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_diagnosticdatatypepreference",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_diagnosticdatatypepreference_1",
        "children": []
       }
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_officeautosignin",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_officeautosignin_true",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_officeactivationemailaddress",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
        "settingValueTemplateReference": null,
        "value": "{{mail}}"
       }
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_defaultemailaddressordomain",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
        "settingValueTemplateReference": null,
        "value": "{{mail}}"
       }
      }
     },
     {
      "id": "4",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enablenewoutlook",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enablenewoutlook_3",
        "children": []
       }
      }
     },
     {
      "id": "5",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_userpreference_maxchecklistdisplaydurationmet",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_userpreference_maxchecklistdisplaydurationmet_true",
        "children": []
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft office d office configuration",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft OneDrive - D - Service and Access - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-04-21T12:39:02.406611Z",
    "creationSource": null,
    "description": "bug fixes",
    "lastModifiedDateTime": "2026-05-19T12:19:08.7118645Z",
    "name": "MACOS - DCP - Microsoft OneDrive - D - Service and Access - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 3,
    "technologies": "mdm,appleRemoteManagement",
    "id": "dae1b05c-6160-47cd-a801-b8482e7369ad",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('dae1b05c-6160-47cd-a801-b8482e7369ad')/assignments",
    "assignments": [],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.servicemanagement_com.apple.servicemanagement",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.servicemanagement_rules",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "OneDrive Launcher"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_0",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.OneDriveLauncher"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_teamidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            },
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_comment",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "OneDrive (Standalone)"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_ruletype",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "choiceSettingValue": {
                "settingValueTemplateReference": null,
                "value": "com.apple.servicemanagement_rules_item_ruletype_3",
                "children": []
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_rulevalue",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "com.microsoft.OneDrive"
               }
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.servicemanagement_rules_item_teamidentifier",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_com.apple.tcc.configuration-profile-policy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
               "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "groupSettingCollectionValue": [
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_allowed",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_allowed_true",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.OneDrive\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.OneDrive"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_identifiertype_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_staticcode",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydesktopfolder_item_staticcode_true",
                    "children": []
                   }
                  }
                 ]
                }
               ]
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
               "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "groupSettingCollectionValue": [
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_allowed",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_allowed_true",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.OneDrive\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.OneDrive"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_identifiertype_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_staticcode",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydocumentsfolder_item_staticcode_true",
                    "children": []
                   }
                  }
                 ]
                }
               ]
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
               "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "groupSettingCollectionValue": [
                {
                 "settingValueTemplateReference": null,
                 "children": [
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_allowed",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_allowed_true",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_authorization",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_authorization_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_coderequirement",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "identifier \"com.microsoft.OneDrive\" and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] /* exists */ and certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ and certificate leaf[subject.OU] = UBF8T346G9"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_identifier",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "simpleSettingValue": {
                    "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                    "settingValueTemplateReference": null,
                    "value": "com.microsoft.OneDrive"
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_identifiertype",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_identifiertype_0",
                    "children": []
                   }
                  },
                  {
                   "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                   "settingDefinitionId": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_staticcode",
                   "settingInstanceTemplateReference": null,
                   "auditRuleInformation": null,
                   "choiceSettingValue": {
                    "settingValueTemplateReference": null,
                    "value": "com.apple.tcc.configuration-profile-policy_services_systempolicydownloadsfolder_item_staticcode_true",
                    "children": []
                   }
                  }
                 ]
                }
               ]
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
       "settingDefinitionId": "com.apple.system-extension-policy_com.apple.system-extension-policy",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "groupSettingCollectionValue": [
        {
         "settingValueTemplateReference": null,
         "children": [
          {
           "@odata.type": "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
           "settingDefinitionId": "com.apple.system-extension-policy_allowedsystemextensions",
           "settingInstanceTemplateReference": null,
           "auditRuleInformation": null,
           "groupSettingCollectionValue": [
            {
             "settingValueTemplateReference": null,
             "children": [
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
               "settingDefinitionId": "com.apple.system-extension-policy_allowedsystemextensions_generickey",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingCollectionValue": [
                {
                 "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                 "settingValueTemplateReference": null,
                 "value": "com.microsoft.OneDrive.FinderSync"
                }
               ]
              },
              {
               "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
               "settingDefinitionId": "com.apple.system-extension-policy_allowedsystemextensions_generickey_keytobereplaced",
               "settingInstanceTemplateReference": null,
               "auditRuleInformation": null,
               "simpleSettingValue": {
                "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
                "settingValueTemplateReference": null,
                "value": "UBF8T346G9"
               }
              }
             ]
            }
           ]
          }
         ]
        }
       ]
      }
     }
    ]
   },
   "key": "macos dcp microsoft onedrive d service and access",
   "release": 6
  },
  {
   "name": "MACOS - DCP - Microsoft OneDrive - U - Known Folder Move - R26.6 - v3.0",
   "version": "3.0",
   "section": "settingsCatalog",
   "sectionLabel": "Settings catalog policies",
   "area": "SettingsCatalog",
   "importable": true,
   "body": {
    "createdDateTime": "2026-01-15T09:32:05.5375419Z",
    "creationSource": null,
    "description": "",
    "lastModifiedDateTime": "2026-05-19T11:27:25.0754577Z",
    "name": "MACOS - DCP - Microsoft OneDrive - U - Known Folder Move - R26.6 - v3.0",
    "platforms": "macOS",
    "priorityMetaData": null,
    "roleScopeTagIds": [
     "0"
    ],
    "settingCount": 15,
    "technologies": "mdm,appleRemoteManagement",
    "id": "e2600162-0373-46fd-bdac-a1589108b5df",
    "templateReference": {
     "templateId": "",
     "templateFamily": "none",
     "templateDisplayName": null,
     "templateDisplayVersion": null
    },
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies('e2600162-0373-46fd-bdac-a1589108b5df')/assignments",
    "assignments": [
     {
      "id": "e2600162-0373-46fd-bdac-a1589108b5df_93d20a3f-d668-450f-b5e1-9a84b84e0c08",
      "source": "direct",
      "sourceId": "e2600162-0373-46fd-bdac-a1589108b5df",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "93d20a3f-d668-450f-b5e1-9a84b84e0c08"
      }
     }
    ],
    "settings": [
     {
      "id": "0",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_kfmsilentoptin",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
        "settingValueTemplateReference": null,
        "value": "020eb2d3-8046-4257-828d-64bf3ece8fbb"
       }
      }
     },
     {
      "id": "1",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_blockexternalsync",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_blockexternalsync_true",
        "children": []
       }
      }
     },
     {
      "id": "2",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_disableautoconfig",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_disableautoconfig_0",
        "children": []
       }
      }
     },
     {
      "id": "3",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_disablepersonalsync",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_disablepersonalsync_true",
        "children": []
       }
      }
     },
     {
      "id": "4",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_disabletutorial",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_disabletutorial_true",
        "children": []
       }
      }
     },
     {
      "id": "5",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_kfmsilentoptinwithnotification",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_kfmsilentoptinwithnotification_false",
        "children": []
       }
      }
     },
     {
      "id": "6",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_filesondemandenabled",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_filesondemandenabled_true",
        "children": []
       }
      }
     },
     {
      "id": "7",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enableallocsiclients",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_enableallocsiclients_true",
        "children": []
       }
      }
     },
     {
      "id": "8",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_kfmblockoptout",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_kfmblockoptout_true",
        "children": []
       }
      }
     },
     {
      "id": "9",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_hidedockicon",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_hidedockicon_true",
        "children": []
       }
      }
     },
     {
      "id": "10",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_enableodignore",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingCollectionValue": [
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "*.lnk"
        },
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "*.pst"
        },
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "*.pkg"
        },
        {
         "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
         "settingValueTemplateReference": null,
         "value": "*.dmg"
        }
       ]
      }
     },
     {
      "id": "11",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_kfmsilentoptindesktop",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_kfmsilentoptindesktop_true",
        "children": []
       }
      }
     },
     {
      "id": "12",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_kfmsilentoptindocuments",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_kfmsilentoptindocuments_true",
        "children": []
       }
      }
     },
     {
      "id": "13",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_openatlogin",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "choiceSettingValue": {
        "settingValueTemplateReference": null,
        "value": "com.apple.managedclient.preferences_openatlogin_true",
        "children": []
       }
      }
     },
     {
      "id": "14",
      "settingInstance": {
       "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
       "settingDefinitionId": "com.apple.managedclient.preferences_kfmoptinwithwizard",
       "settingInstanceTemplateReference": null,
       "auditRuleInformation": null,
       "simpleSettingValue": {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
        "settingValueTemplateReference": null,
        "value": "020eb2d3-8046-4257-828d-64bf3ece8fbb"
       }
      }
     }
    ]
   },
   "key": "macos dcp microsoft onedrive u known folder move",
   "release": 6
  },
  {
   "name": "MACOS - FTR - Assignment filters - D - All AB Enrolled devices - R26.4 - v3.0",
   "version": "3.0",
   "section": "filters",
   "sectionLabel": "Assignment filters",
   "area": "AssignmentFilters",
   "importable": true,
   "body": {
    "id": "4800ad85-7b0e-4a1e-95fa-6f9d3e44b79c",
    "createdDateTime": "2026-04-28T09:36:59.9509346Z",
    "lastModifiedDateTime": "2026-04-28T09:36:59.9509346Z",
    "displayName": "MACOS - FTR - Assignment filters - D - All AB Enrolled devices - R26.4 - v3.0",
    "description": "",
    "platform": "macOS",
    "rule": "(device.enrollmentProfileName -eq \"MACOS - AEP - DeviceEnrollment - D - Apple MACOS Entrollment profile - v3.9\")",
    "roleScopeTags": [
     "0"
    ],
    "assignmentFilterManagementType": "devices",
    "payloads": []
   },
   "key": "macos ftr assignment filters d all ab enrolled devices",
   "release": 4
  },
  {
   "name": "MACOS - FTR - Assignment filters - D - All Apple Intel Devices - R26.4 - v3.0",
   "version": "3.0",
   "section": "filters",
   "sectionLabel": "Assignment filters",
   "area": "AssignmentFilters",
   "importable": true,
   "body": {
    "id": "1d647e67-8dd3-4ee1-8e4a-0feb64485d7b",
    "createdDateTime": "2026-04-28T09:40:37.2703602Z",
    "lastModifiedDateTime": "2026-04-28T09:40:37.2703602Z",
    "displayName": "MACOS - FTR - Assignment filters - D - All Apple Intel Devices - R26.4 - v3.0",
    "description": "",
    "platform": "macOS",
    "rule": "(device.cpuArchitecture -eq \"x64\")",
    "roleScopeTags": [
     "0"
    ],
    "assignmentFilterManagementType": "devices",
    "payloads": []
   },
   "key": "macos ftr assignment filters d all apple intel devices",
   "release": 4
  },
  {
   "name": "MACOS - FTR - Assignment filters - D - All Apple Silicon Devices - R26.4 - v3.0",
   "version": "3.0",
   "section": "filters",
   "sectionLabel": "Assignment filters",
   "area": "AssignmentFilters",
   "importable": true,
   "body": {
    "id": "0123e1fb-8ab3-43ac-9098-a18cfc4e1c0d",
    "createdDateTime": "2026-04-28T09:39:51.8150761Z",
    "lastModifiedDateTime": "2026-04-28T09:39:51.8150761Z",
    "displayName": "MACOS - FTR - Assignment filters - D - All Apple Silicon Devices - R26.4 - v3.0",
    "description": "",
    "platform": "macOS",
    "rule": "(device.cpuArchitecture -eq \"arm64\")",
    "roleScopeTags": [
     "0"
    ],
    "assignmentFilterManagementType": "devices",
    "payloads": []
   },
   "key": "macos ftr assignment filters d all apple silicon devices",
   "release": 4
  },
  {
   "name": "MACOS - FTR - Assignment filters - D - All Manual Enrolled Devices - R26.4 - v3.0",
   "version": "3.0",
   "section": "filters",
   "sectionLabel": "Assignment filters",
   "area": "AssignmentFilters",
   "importable": true,
   "body": {
    "id": "a9e65d05-769a-402d-bed0-2293b8ab178c",
    "createdDateTime": "2026-04-28T09:44:29.8231892Z",
    "lastModifiedDateTime": "2026-04-28T09:44:29.8231892Z",
    "displayName": "MACOS - FTR - Assignment filters - D - All Manual Enrolled Devices - R26.4 - v3.0",
    "description": "",
    "platform": "macOS",
    "rule": "(device.enrollmentProfileName -eq null)",
    "roleScopeTags": [
     "0"
    ],
    "assignmentFilterManagementType": "devices",
    "payloads": []
   },
   "key": "macos ftr assignment filters d all manual enrolled devices",
   "release": 4
  },
  {
   "name": "MACOS - SH - Device Configuration - D - Check X-Protect Enabled (Apple Antivirus) - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT2H",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "b600afde-12b8-4ffa-a8de-c77ce39e9133",
    "displayName": "MACOS - SH - Device Configuration - D - Check X-Protect Enabled (Apple Antivirus) - R26.6 - v3.0",
    "description": "Device Configuration ",
    "scriptContent": null,
    "createdDateTime": "2026-01-08T21:34:50.2705864Z",
    "lastModifiedDateTime": "2026-05-19T11:15:58.4746275Z",
    "runAsAccount": "system",
    "fileName": "x-protect.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('b600afde-12b8-4ffa-a8de-c77ce39e9133')/assignments",
    "assignments": [
     {
      "id": "b600afde-12b8-4ffa-a8de-c77ce39e9133:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device configuration d check x protect enabled (apple antivirus)",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Configuration - D - Configure Dock - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "19e285df-bc71-4296-b538-5dc35a6eadc8",
    "displayName": "MACOS - SH - Device Configuration - D - Configure Dock - R26.6 - v3.0",
    "description": "Configures the macOS Dock with a standardized set of Microsoft 365 and system applications. Optionally waits for applications to be installed before configuration. Supports both dockutil and native plist manipulation methods. Integrates with Swift Dialog for deployment progress visualization and adapts to macOS versions (Apps.app vs Launchpad).",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:07.115616Z",
    "lastModifiedDateTime": "2026-05-19T11:18:23.3005474Z",
    "runAsAccount": "system",
    "fileName": "scr-sys-101-configure-dock.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('19e285df-bc71-4296-b538-5dc35a6eadc8')/assignments",
    "assignments": [
     {
      "id": "19e285df-bc71-4296-b538-5dc35a6eadc8:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device configuration d configure dock",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Configuration - D - Device Rename (enrollment type) - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "7c7fd18b-e15d-405a-906b-c1863483db8c",
    "displayName": "MACOS - SH - Device Configuration - D - Device Rename (enrollment type) - R26.6 - v3.0",
    "description": "Automatically renames Mac devices using a standardized naming convention based on enrollment type (ADE/BYOD), device model type (MBA/MBP/iMac/etc), serial number, and detected country code via IP geolocation. Differentiates between corporate (ABM-enrolled) and personal (manually-enrolled) devices with configurable prefixes.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:06.892988Z",
    "lastModifiedDateTime": "2026-05-19T11:13:52.6250286Z",
    "runAsAccount": "system",
    "fileName": "scr-sys-100-device-rename.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('7c7fd18b-e15d-405a-906b-c1863483db8c')/assignments",
    "assignments": [
     {
      "id": "7c7fd18b-e15d-405a-906b-c1863483db8c:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device configuration d device rename (enrollment type)",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Configuration - D - Intune settings Report - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT15M",
    "retryCount": 3,
    "blockExecutionNotifications": false,
    "id": "6109415a-dae8-4633-bec4-0955fb9347b0",
    "displayName": "MACOS - SH - Device Configuration - D - Intune settings Report - R26.6 - v3.0",
    "description": "",
    "scriptContent": null,
    "createdDateTime": "2026-01-20T18:13:38.4716381Z",
    "lastModifiedDateTime": "2026-05-19T11:14:46.0316699Z",
    "runAsAccount": "system",
    "fileName": "Get-MacOSIntuneSettings.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('6109415a-dae8-4633-bec4-0955fb9347b0')/assignments",
    "assignments": [
     {
      "id": "6109415a-dae8-4633-bec4-0955fb9347b0:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device configuration d intune settings report",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Configuration - D - Show filename extensions in finder - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "P1D",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "fb5d66c1-c657-49c0-b414-7e640e6e144f",
    "displayName": "MACOS - SH - Device Configuration - D - Show filename extensions in finder - R26.6 - v3.0",
    "description": "Script to enable 'Show all filename extensions'-setting from Finder",
    "scriptContent": null,
    "createdDateTime": "2026-01-09T11:13:38.2552028Z",
    "lastModifiedDateTime": "2026-05-19T11:17:02.3749506Z",
    "runAsAccount": "user",
    "fileName": "ShowAllFilenameExtensions.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('fb5d66c1-c657-49c0-b414-7e640e6e144f')/assignments",
    "assignments": [
     {
      "id": "fb5d66c1-c657-49c0-b414-7e640e6e144f:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device configuration d show filename extensions in finder",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Configuration - D - Swift Dialog Onboarding - R26.6 - v3.1",
   "version": "3.1",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "093b0eb7-3ad1-4197-a30d-68f32029df30",
    "displayName": "MACOS - SH - Device Configuration - D - Swift Dialog Onboarding - R26.6 - v3.1",
    "description": "UPDATE 20-05-2026:\nEvery row in the SwiftDialog onboarding monitor now launches with an\nanimated wait spinner and an SF=arrow.down.circle 'queued for download'\nplaceholder icon, replacing the default question-mark glyph for apps\nthat aren't on disk yet. When each app is detected, the row blooms\ninto the real .app bundle icon alongside the green tick.\n\nFailed/timed-out rows intentionally keep the placeholder + red error\nindicator so 'this never arrived' reads correctly.\n\n\n\nRELEASE Info: Displays an interactive Swift Dialog onboarding splash screen that monitors for application installations in real-time. Waits for desktop and Swift Dialog binary availability, then detects Company Portal, Microsoft 365, Microsoft Edge, Microsoft 365 Copilot, and Windows App via app bundle presence or package receipt. Does NOT install apps - only monitors and displays progress as apps are installed by other deployment mechanisms (e.g., Intune). Includes configurable timeouts for desktop wait (15 min), Dialog binary wait (20 min), and app monitoring (60 min).",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:07.4849708Z",
    "lastModifiedDateTime": "2026-05-20T08:07:25.6351038Z",
    "runAsAccount": "system",
    "fileName": "scr-utl-100-dialog-onboarding.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('093b0eb7-3ad1-4197-a30d-68f32029df30')/assignments",
    "assignments": [
     {
      "id": "093b0eb7-3ad1-4197-a30d-68f32029df30:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device configuration d swift dialog onboarding",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Security - D - Enable Sudo Logging - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "P7D",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "f17027f5-afa8-43f6-b47f-a403e24b8a2d",
    "displayName": "MACOS - SH - Device Security - D - Enable Sudo Logging - R26.6 - v3.0",
    "description": "CIS Level 1 - 5.11 Ensure Logging Is Enabled for Sudo\n\nIn order to properly monitor the use of the sudo command, logs events for any use of sudo should be captured in the unified log.\n\n",
    "scriptContent": null,
    "createdDateTime": "2026-01-09T11:28:12.1316697Z",
    "lastModifiedDateTime": "2026-05-19T11:17:39.7185727Z",
    "runAsAccount": "system",
    "fileName": "EnableSudoLogging.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('f17027f5-afa8-43f6-b47f-a403e24b8a2d')/assignments",
    "assignments": [
     {
      "id": "f17027f5-afa8-43f6-b47f-a403e24b8a2d:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device security d enable sudo logging",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Security - D - Install log retention 365 - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT1H",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "6b12c980-dbd4-4ebf-ad9a-170139f747fb",
    "displayName": "MACOS - SH - Device Security - D - Install log retention 365 - R26.6 - v3.0",
    "description": "- Script to configure /var/log/install.log retention and rotation settings for CIS compliance\n- CIS Benchmark Level 1 - 3.3 Ensure install.log Is Retained for 365 or More Days and No Maximum Size\n\n",
    "scriptContent": null,
    "createdDateTime": "2026-01-09T11:35:28.3415051Z",
    "lastModifiedDateTime": "2026-05-19T11:17:10.089539Z",
    "runAsAccount": "system",
    "fileName": "configure_install_log_retention.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('6b12c980-dbd4-4ebf-ad9a-170139f747fb')/assignments",
    "assignments": [
     {
      "id": "6b12c980-dbd4-4ebf-ad9a-170139f747fb:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device security d install log retention 365",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Security - D - PUA Policy Monitor - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT3H",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "4cdae53d-915f-4649-b5af-dfce2e1d96b5",
    "displayName": "MACOS - SH - Device Security - D - PUA Policy Monitor - R26.6 - v3.0",
    "description": "This script runs periodically to check the current PUA policy configuration and log the results.\n\n**Key Features:**\n- Verifies Microsoft Defender processes are running\n- Locates and validates the MDATP command-line tool\n- Retrieves the current PUA policy configuration\n- Logs policy state changes with timestamps\n- Comprehensive error handlin",
    "scriptContent": null,
    "createdDateTime": "2026-01-08T19:34:13.2128945Z",
    "lastModifiedDateTime": "2026-05-19T11:15:36.6367937Z",
    "runAsAccount": "system",
    "fileName": "enhanced_mdatp_pua.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('4cdae53d-915f-4649-b5af-dfce2e1d96b5')/assignments",
    "assignments": [
     {
      "id": "4cdae53d-915f-4649-b5af-dfce2e1d96b5:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device security d pua policy monitor",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Security - D - PUA Policy Report - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT3H",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "30542477-9f74-4259-845b-8e34ac671154",
    "displayName": "MACOS - SH - Device Security - D - PUA Policy Report - R26.6 - v3.0",
    "description": "This script reads the logs created by the first script and reports the information to Intune.\n\n**Key Features:**\n- Reads the current policy state\n- Detects changes from previous state\n- Maintains a counter of how many times the policy has changed\n- Persistently tracks and reports policy changes even when the current state is stable\n- Formats output for Intune Custom Attributes\n- Reports when changes occurred\n- Fallback mechanisms if primary data is unavailable",
    "scriptContent": null,
    "createdDateTime": "2026-01-08T19:34:14.4905591Z",
    "lastModifiedDateTime": "2026-05-19T11:15:19.317587Z",
    "runAsAccount": "system",
    "fileName": "mdatp_pua_custom_attribute.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('30542477-9f74-4259-845b-8e34ac671154')/assignments",
    "assignments": [
     {
      "id": "30542477-9f74-4259-845b-8e34ac671154:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device security d pua policy report",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Security - D - Secure Home Folders - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "3e42a012-67b2-4567-8cc5-a62328d9db7c",
    "displayName": "MACOS - SH - Device Security - D - Secure Home Folders - R26.6 - v3.0",
    "description": "",
    "scriptContent": null,
    "createdDateTime": "2026-01-08T21:13:59.0561269Z",
    "lastModifiedDateTime": "2026-05-19T11:15:48.4534745Z",
    "runAsAccount": "system",
    "fileName": "SecureHomeFolders.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('3e42a012-67b2-4567-8cc5-a62328d9db7c')/assignments",
    "assignments": [
     {
      "id": "3e42a012-67b2-4567-8cc5-a62328d9db7c:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device security d secure home folders",
   "release": 6
  },
  {
   "name": "MACOS - SH - Device Security - D - Set Sudo Timeout Period to Zero - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "P1D",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "be789e7d-68bf-4044-b583-dba4ed0f9b77",
    "displayName": "MACOS - SH - Device Security - D - Set Sudo Timeout Period to Zero - R26.6 - v3.0",
    "description": "Script to Esnsure the Sudo Timeout Period Is Set to Zero\nCIS Benchmark Level 1 - 5.4 Ensure the Sudo Timeout Period Is Set to Zero\n\n",
    "scriptContent": null,
    "createdDateTime": "2026-01-09T11:30:57.6229632Z",
    "lastModifiedDateTime": "2026-05-19T11:17:27.4680558Z",
    "runAsAccount": "system",
    "fileName": "set_sudo_timeout_period.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('be789e7d-68bf-4044-b583-dba4ed0f9b77')/assignments",
    "assignments": [
     {
      "id": "be789e7d-68bf-4044-b583-dba4ed0f9b77:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh device security d set sudo timeout period to zero",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Configuration - D - Adobe Acrobat Reader - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "0ac7b547-b96c-4638-a373-4e2d1d407afa",
    "displayName": "MACOS - SH - Software Configuration - D - Adobe Acrobat Reader - R26.6 - v3.0",
    "description": "This script ensures that key Adobe Acrobat settings are created, updated, or removed at the machine level using PlistBuddy. It helps enforce security, compliance, and user experience standards by:\n\nDisabling unnecessary or insecure features\nEnabling enterprise-grade protections\nPre-configuring login domains for Adobe licensing\nPreventing users from changing critical settings",
    "scriptContent": null,
    "createdDateTime": "2026-01-20T13:34:21.2433563Z",
    "lastModifiedDateTime": "2026-05-19T11:14:54.3498161Z",
    "runAsAccount": "system",
    "fileName": "AdobeAcrobatCombinedPolicyEnforcerMachineLevel.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('0ac7b547-b96c-4638-a373-4e2d1d407afa')/assignments",
    "assignments": [
     {
      "id": "0ac7b547-b96c-4638-a373-4e2d1d407afa:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software configuration d adobe acrobat reader",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Company Portal - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "1d339fa3-3bf2-40d2-91cf-e18b51350b55",
    "displayName": "MACOS - SH - Software Installation - D - Install Company Portal - R26.6 - v3.0",
    "description": "Downloads and installs Microsoft Company Portal from a signed PKG. Automatically installs Microsoft Auto Update (MAU) first and ensures Rosetta 2 is present on Apple Silicon. Performs intelligent update checking via HTTP Last-Modified headers to avoid unnecessary reinstalls.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:04.9692857Z",
    "lastModifiedDateTime": "2026-05-19T11:18:08.9875043Z",
    "runAsAccount": "system",
    "fileName": "scr-app-100-install-company-portal.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('1d339fa3-3bf2-40d2-91cf-e18b51350b55')/assignments",
    "assignments": []
   },
   "key": "macos sh software installation d install company portal",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Escrow Buddy - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "843167bb-84f0-4186-bc14-4a54260a4551",
    "displayName": "MACOS - SH - Software Installation - D - Install Escrow Buddy - R26.6 - v3.0",
    "description": "Downloads and installs the latest release of Escrow Buddy security agent plugin from GitHub. Ensures FileVault recovery keys are properly escrowed to Intune by configuring the authorization database and triggering escrow at login when the FDE profile and PRK file are present.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:06.7037444Z",
    "lastModifiedDateTime": "2026-05-19T11:18:41.0181544Z",
    "runAsAccount": "system",
    "fileName": "scr-sec-100-install-escrow-buddy.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('843167bb-84f0-4186-bc14-4a54260a4551')/assignments",
    "assignments": [
     {
      "id": "843167bb-84f0-4186-bc14-4a54260a4551:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install escrow buddy",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Google Chrome - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "f4f41a4e-a65e-43d5-b540-d526194bf3ae",
    "displayName": "MACOS - SH - Software Installation - D - Install Google Chrome - R26.6 - v3.0",
    "description": "",
    "scriptContent": null,
    "createdDateTime": "2026-01-13T13:31:48.3815894Z",
    "lastModifiedDateTime": "2026-05-19T11:15:02.3791343Z",
    "runAsAccount": "system",
    "fileName": "installGoogleChrome.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('f4f41a4e-a65e-43d5-b540-d526194bf3ae')/assignments",
    "assignments": []
   },
   "key": "macos sh software installation d install google chrome",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Intune Log Watch - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "23ee1593-8522-4cbf-ab0d-58fe0cd39165",
    "displayName": "MACOS - SH - Software Installation - D - Install Intune Log Watch - R26.6 - v3.0",
    "description": "Downloads the latest Intune Log Watch DMG from GitHub, mounts it, and copies IntuneLogWatch.app into /Applications. Cleans up the DMG and mount point automatically.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:05.6257805Z",
    "lastModifiedDateTime": "2026-05-19T11:18:57.376009Z",
    "runAsAccount": "system",
    "fileName": "scr-app-103-install-intunelogwatch.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('23ee1593-8522-4cbf-ab0d-58fe0cd39165')/assignments",
    "assignments": [
     {
      "id": "23ee1593-8522-4cbf-ab0d-58fe0cd39165:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install intune log watch",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Microsoft 365 Apps for macOS - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "06369be0-1eb8-4132-9aae-64f860a53b31",
    "displayName": "MACOS - SH - Software Installation - D - Install Microsoft 365 Apps for macOS - R26.6 - v3.0",
    "description": "Downloads and installs Microsoft 365 Apps for Mac (Word, Excel, PowerPoint, Outlook, OneNote) from the official Microsoft download URL. Supports waiting for splash screen (Dialog/Octory) before installation, automatic update detection via HTTP Last-Modified headers, and can terminate running apps during install.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:05.8390019Z",
    "lastModifiedDateTime": "2026-05-19T11:19:08.4121548Z",
    "runAsAccount": "system",
    "fileName": "scr-app-104-install-M365Apps.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('06369be0-1eb8-4132-9aae-64f860a53b31')/assignments",
    "assignments": [
     {
      "id": "06369be0-1eb8-4132-9aae-64f860a53b31:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install microsoft 365 apps for macos",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Microsoft 365 Copilot - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "c3bdf9cd-83fd-47d8-849f-e7e0386f6ca7",
    "displayName": "MACOS - SH - Software Installation - D - Install Microsoft 365 Copilot - R26.6 - v3.0",
    "description": "Downloads and installs Microsoft 365 Copilot from the official Microsoft download URL. Performs intelligent update checking via HTTP Last-Modified headers to avoid unnecessary reinstalls. Waits for the app to close before updating if running.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:06.5221305Z",
    "lastModifiedDateTime": "2026-05-19T11:19:17.6498935Z",
    "runAsAccount": "system",
    "fileName": "scr-app-107-M365copilot.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('c3bdf9cd-83fd-47d8-849f-e7e0386f6ca7')/assignments",
    "assignments": [
     {
      "id": "c3bdf9cd-83fd-47d8-849f-e7e0386f6ca7:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install microsoft 365 copilot",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Microsoft Defender for Endpoint - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT15M",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "6c262022-cd59-43e1-befc-5488afd90ca9",
    "displayName": "MACOS - SH - Software Installation - D - Install Microsoft Defender for Endpoint - R26.6 - v3.0",
    "description": "new script",
    "scriptContent": null,
    "createdDateTime": "2026-01-08T21:24:17.2030031Z",
    "lastModifiedDateTime": "2026-05-19T11:12:58.31875Z",
    "runAsAccount": "system",
    "fileName": "scr-mde-100-install-defender.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('6c262022-cd59-43e1-befc-5488afd90ca9')/assignments",
    "assignments": [
     {
      "id": "6c262022-cd59-43e1-befc-5488afd90ca9:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install microsoft defender for endpoint",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Microsoft Edge - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "b3bbfb95-93ff-41bd-b818-edbbf5bfc61a",
    "displayName": "MACOS - SH - Software Installation - D - Install Microsoft Edge - R26.6 - v3.0",
    "description": "Downloads and installs Microsoft Edge from the official Microsoft download URL. Uses aria2c for optimized downloading when available, with automatic fallback to curl. Performs intelligent update checking via HTTP Last-Modified headers to avoid unnecessary reinstalls. Waits for Edge to close before updating if running.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:05.2542315Z",
    "lastModifiedDateTime": "2026-05-19T11:26:01.8592442Z",
    "runAsAccount": "system",
    "fileName": "scr-app-101-install-edge.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('b3bbfb95-93ff-41bd-b818-edbbf5bfc61a')/assignments",
    "assignments": [
     {
      "id": "b3bbfb95-93ff-41bd-b818-edbbf5bfc61a:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install microsoft edge",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Microsoft Remote Help - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "21e63e1a-15bd-41ca-9fe2-f65e58524f23",
    "displayName": "MACOS - SH - Software Installation - D - Install Microsoft Remote Help - R26.6 - v3.0",
    "description": "Downloads and installs Microsoft Remote Help from a signed PKG. Automatically installs Microsoft Auto Update (MAU) first and ensures Rosetta 2 is present on Apple Silicon. Performs intelligent update checking via HTTP Last-Modified headers to avoid unnecessary reinstalls. Enables IT support teams to provide remote assistance to macOS devices.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:05.4619902Z",
    "lastModifiedDateTime": "2026-05-19T11:26:13.5412528Z",
    "runAsAccount": "system",
    "fileName": "scr-app-102-install-remote-help.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('21e63e1a-15bd-41ca-9fe2-f65e58524f23')/assignments",
    "assignments": [
     {
      "id": "21e63e1a-15bd-41ca-9fe2-f65e58524f23:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install microsoft remote help",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Install Microsoft Teams - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "ae0e0355-bfbc-4c29-858e-0f823218e8eb",
    "displayName": "MACOS - SH - Software Installation - D - Install Microsoft Teams - R26.6 - v3.0",
    "description": "Downloads and installs Microsoft Teams from the official Microsoft download URL. Performs intelligent update checking via HTTP Last-Modified headers to avoid unnecessary reinstalls. Waits for Teams to close before updating if running.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:06.2439936Z",
    "lastModifiedDateTime": "2026-05-19T11:14:23.6455615Z",
    "runAsAccount": "system",
    "fileName": "scr-app-106-install-teams.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('ae0e0355-bfbc-4c29-858e-0f823218e8eb')/assignments",
    "assignments": [
     {
      "id": "ae0e0355-bfbc-4c29-858e-0f823218e8eb:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d install microsoft teams",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Uninstall Apple Bloatware - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "84cd7811-c708-45c2-849e-1dabaf998c0c",
    "displayName": "MACOS - SH - Software Installation - D - Uninstall Apple Bloatware - R26.6 - v3.0",
    "description": "Uninstall Apple Bloatware Apps (iMovie, GarageBand, Pages, Numbers, and Keynote)",
    "scriptContent": null,
    "createdDateTime": "2026-01-13T13:34:03.4853783Z",
    "lastModifiedDateTime": "2026-05-19T11:16:43.5436628Z",
    "runAsAccount": "system",
    "fileName": "UninstallAppleBloatwareApps.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('84cd7811-c708-45c2-849e-1dabaf998c0c')/assignments",
    "assignments": [
     {
      "id": "84cd7811-c708-45c2-849e-1dabaf998c0c:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d uninstall apple bloatware",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Installation - D - Windows App - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT0S",
    "retryCount": 0,
    "blockExecutionNotifications": false,
    "id": "bad7fafa-9552-4651-9663-b2f785665ef3",
    "displayName": "MACOS - SH - Software Installation - D - Windows App - R26.6 - v3.0",
    "description": "Downloads and installs Microsoft Windows App (formerly Remote Desktop) from the official Microsoft download URL. Performs intelligent update checking via HTTP Last-Modified headers to avoid unnecessary reinstalls. Waits for the app to close before updating if running.",
    "scriptContent": null,
    "createdDateTime": "2026-04-28T09:25:06.0501Z",
    "lastModifiedDateTime": "2026-05-19T11:14:02.8757496Z",
    "runAsAccount": "system",
    "fileName": "scr-app-105-install-windows-app.zsh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('bad7fafa-9552-4651-9663-b2f785665ef3')/assignments",
    "assignments": [
     {
      "id": "bad7fafa-9552-4651-9663-b2f785665ef3:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software installation d windows app",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Updates - D - Google Chrome Update - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT3H",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "fbc3fe45-5e47-46b8-9d85-54f35271457f",
    "displayName": "MACOS - SH - Software Updates - D - Google Chrome Update - R26.6 - v3.0",
    "description": "",
    "scriptContent": null,
    "createdDateTime": "2026-01-08T19:34:11.6191945Z",
    "lastModifiedDateTime": "2026-05-19T11:17:48.2544247Z",
    "runAsAccount": "system",
    "fileName": "Google-Chrome-Update-Check.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('fbc3fe45-5e47-46b8-9d85-54f35271457f')/assignments",
    "assignments": [
     {
      "id": "fbc3fe45-5e47-46b8-9d85-54f35271457f:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software updates d google chrome update",
   "release": 6
  },
  {
   "name": "MACOS - SH - Software Updates - D - Microsoft Available Updates Checks - R26.6 - v3.0",
   "version": "3.0",
   "section": "scripts",
   "sectionLabel": "Scripts & remediations",
   "area": null,
   "importable": false,
   "body": {
    "executionFrequency": "PT2H",
    "retryCount": 3,
    "blockExecutionNotifications": true,
    "id": "38e661ae-c348-403f-92f5-10ca6516d4f1",
    "displayName": "MACOS - SH - Software Updates - D - Microsoft Available Updates Checks - R26.6 - v3.0",
    "description": "This script displays available Updates for Microsoft Apps by checking MAU",
    "scriptContent": null,
    "createdDateTime": "2026-01-08T19:34:17.0813794Z",
    "lastModifiedDateTime": "2026-05-19T11:17:57.0741853Z",
    "runAsAccount": "system",
    "fileName": "check_available_msupdate_updates.sh",
    "roleScopeTagIds": [
     "0"
    ],
    "assignments@odata.context": "https://graph.microsoft.com/beta/$metadata#deviceManagement/deviceShellScripts('38e661ae-c348-403f-92f5-10ca6516d4f1')/assignments",
    "assignments": [
     {
      "id": "38e661ae-c348-403f-92f5-10ca6516d4f1:f1a6d043-f424-460c-94ad-4629f5929674",
      "target": {
       "@odata.type": "#microsoft.graph.groupAssignmentTarget",
       "deviceAndAppManagementAssignmentFilterId": null,
       "deviceAndAppManagementAssignmentFilterType": "none",
       "groupId": "f1a6d043-f424-460c-94ad-4629f5929674"
      }
     }
    ]
   },
   "key": "macos sh software updates d microsoft available updates checks",
   "release": 6
  }
 ]
};
