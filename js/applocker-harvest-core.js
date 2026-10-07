// T29's policy and evidence engine. XML remains the source of truth; the T01
// model is used only for prediction, never for serialising an imported policy.
const AppLockerHarvestCore = (() => {
  const TYPES = { Exe: 'EXE', Msi: 'MSI', Script: 'Script', Appx: 'StoreApps' };
  const guid = () => crypto.randomUUID();
  const newGrouping = () => 'AppLocker-' + guid();
  const serialize = (node) => new XMLSerializer().serializeToString(node);
  function documentOf(text) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('External entities and document types are unsupported.');
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid XML: ' + doc.querySelector('parsererror').textContent.slice(0, 200));
    if (!doc.documentElement || doc.documentElement.nodeName !== 'AppLockerPolicy') throw new Error('An AppLockerPolicy root is required.');
    return doc;
  }
  const columns = (doc) => Array.from(doc.documentElement.children).filter((n) => n.nodeName === 'RuleCollection');
  function normalize(text, mode) {
    const doc = documentOf(text);
    const removed = [];
    for (const col of columns(doc)) {
      if (col.getAttribute('Type') === 'Dll') { removed.push(col); col.remove(); }
      else if (mode) col.setAttribute('EnforcementMode', mode);
    }
    return { xml: prettyXml(serialize(doc)), omitted: removed.reduce((n, col) => n + col.querySelectorAll('FilePathRule,FilePublisherRule,FileHashRule').length, 0) };
  }
  function prettyXml(text) {
    const xml=serialize(documentOf(text));
    const tokens=xml.replace(/>\s*</g,'>\n<').split('\n');let depth=0;
    return tokens.map((line)=>{if(/^<\//.test(line))depth=Math.max(0,depth-1);const result='  '.repeat(depth)+line;if(/^<[^!?/][^>]*>/.test(line)&&!line.endsWith('/>')&&!line.includes('</'))depth++;return result;}).join('\n');
  }
  function inspect(text) {
    const doc = documentOf(text), errors = [], warnings = [], ids = new Set(), types = new Set();
    if (doc.documentElement.getAttribute('Version') !== '1') errors.push('AppLocker policy Version must be 1.');
    for (const node of doc.documentElement.children) if (node.nodeName !== 'RuleCollection') errors.push('Unsupported policy element: ' + node.nodeName);
    for (const col of columns(doc)) {
      const type = col.getAttribute('Type'), mode = col.getAttribute('EnforcementMode');
      if (!TYPES[type]) errors.push('Unsupported collection: ' + type + '. DLL collections must be omitted.');
      if (types.has(type)) errors.push('Duplicate collection: ' + type); types.add(type);
      if (!['Enabled', 'AuditOnly', 'NotConfigured'].includes(mode)) errors.push('Unsupported mode in ' + type);
      if (mode === 'NotConfigured' && col.children.length) warnings.push(type + ': NotConfigured with rules may enforce. Select AuditOnly explicitly for an audit.');
      for (const rule of col.children) {
        if (rule.nodeName === 'RuleCollectionExtensions') continue; // preserved verbatim
        if (!['FilePathRule', 'FilePublisherRule', 'FileHashRule'].includes(rule.nodeName)) { errors.push('Unsupported rule: ' + rule.nodeName); continue; }
        const id = rule.getAttribute('Id');
        if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id || '') || ids.has(id)) errors.push('Missing, invalid or duplicate rule ID: ' + (id || rule.getAttribute('Name')));
        ids.add(id);
        if (!['Allow','Deny'].includes(rule.getAttribute('Action'))) errors.push('Invalid action: ' + rule.getAttribute('Name'));
        if (!/^S-\d-(?:\d+-)*\d+$/.test(rule.getAttribute('UserOrGroupSid') || '')) errors.push('Invalid principal SID: ' + rule.getAttribute('Name'));
        const cond = Array.from(rule.children).find((n) => n.nodeName === 'Conditions');
        const expected = { FilePathRule: 'FilePathCondition', FilePublisherRule: 'FilePublisherCondition', FileHashRule: 'FileHashCondition' }[rule.nodeName];
        if (!cond || cond.children.length !== 1 || cond.children[0].nodeName !== expected) errors.push('Invalid condition: ' + rule.getAttribute('Name'));
        for (const n of rule.children) if (!['Conditions','Exceptions'].includes(n.nodeName)) errors.push('Unsupported rule element: ' + n.nodeName);
        for (const container of rule.children) if(['Conditions','Exceptions'].includes(container.nodeName)) for(const condition of container.children){
          if(!['FilePathCondition','FilePublisherCondition','FileHashCondition'].includes(condition.nodeName))errors.push('Unsupported condition: '+condition.nodeName);
          if(condition.nodeName==='FilePublisherCondition'){
            if(['PublisherName','ProductName','BinaryName'].some((k)=>!condition.getAttribute(k)))errors.push('Incomplete publisher condition: '+rule.getAttribute('Name'));
            const range=condition.querySelector('BinaryVersionRange');
            if((!range && container.nodeName==='Conditions') || (range && ['LowSection','HighSection'].some((k)=>! /^(\*|\d+\.\d+\.\d+\.\d+)$/.test(range.getAttribute(k)||''))))errors.push('Invalid publisher version range: '+rule.getAttribute('Name'));
          }
          if(condition.nodeName==='FileHashCondition' && (!condition.querySelector('FileHash') || Array.from(condition.children).some((h)=>h.nodeName!=='FileHash' || !/^(SHA256|SHA1)$/.test(h.getAttribute('Type')||'') || !/^(0x)?[a-f0-9]+$/i.test(h.getAttribute('Data')||''))))errors.push('Invalid hash condition: '+rule.getAttribute('Name'));
        }
        for (const p of rule.querySelectorAll('FilePathCondition')) {
          const path = p.getAttribute('Path') || '';
          if (!path) errors.push('Empty path: ' + rule.getAttribute('Name'));
          if (/%PROGRAMDATA%/i.test(path)) warnings.push(type + ': %PROGRAMDATA% is not an AppLocker path macro (' + rule.getAttribute('Name') + ').');
          if (path && !/[\\*?]$/.test(path) && !/\.[\w]+$/.test(path)) warnings.push(type + ': folder path has no subtree wildcard (' + path + ').');
        }
      }
      const broad = Array.from(col.querySelectorAll('FilePathRule')).filter((r) => r.getAttribute('Action') === 'Allow' && r.getAttribute('UserOrGroupSid') === 'S-1-1-0' && !r.querySelector('Exceptions'));
      if (broad.some((r) => /^(%WINDIR%|%PROGRAMFILES%)\\\*$/i.test((r.querySelector('FilePathCondition') || {}).getAttribute ? r.querySelector('FilePathCondition').getAttribute('Path') : '')) && col.querySelector('Exceptions')) warnings.push(type + ': unrestricted default allows overlap exception-bearing rules. Review which exceptions can be bypassed.');
    }
    if (!types.size) errors.push('At least one non-DLL collection is required.');
    const model = AppLockerTool.engine.parsePolicy(text, 'T29 draft');
    return { doc, model, errors, warnings: Array.from(new Set(warnings)), rules: ids.size };
  }
  function coverage(text) {
    const parsed = inspect(text);
    return MS_APP_CATALOG.map((app) => {
      const result = AppLockerTool.engine.evaluateApp(parsed.model, app);
      // Catalog entries model representative paths/signatures, not an installed
      // version or group membership. Finite/minimum version ranges need a test.
      const col = parsed.model.collections.find((c) => c.type === app.collection);
      const bounded = result.perArt && result.perArt.some((a) => { const c=a.rule && AppLockerTool.engine.ruleMatchesArtifact(a.rule,a.art); return c && c.kind === 'publisher' && ((c.low && c.low !== '*' && c.low !== '0.0.0.0') || (c.high && c.high !== '*')); });
      const customDeny = result.perArt && result.perArt.some((a) => a.denyCustom);
      const hashes = col && col.rules.some((r) => r.action === 'Deny' && r.sid !== 'S-1-3-0' && r.conditions.some((c) => c.kind === 'hash'));
      const safeAlternative = (a) => col && col.rules.some((r) => { const c=AppLockerTool.engine.ruleMatchesArtifact(r,a.art);return r.action==='Allow' && r.sid==='S-1-1-0' && c && c.kind==='path' && !r.exceptions.some((e)=>e.kind==='hash'); });
      const unknownException = result.perArt && result.perArt.some((a)=>a.rule && a.rule.exceptions.some((e)=>e.kind==='hash') && !safeAlternative(a));
      if ((bounded || customDeny || hashes || unknownException) && result.status === 'allowed') result.status = 'conditional';
      return { app, result };
    });
  }
  function addPublisher(text, collection, fields) {
    const doc = documentOf(text), col = columns(doc).find((c) => c.getAttribute('Type') === collection);
    if (!col || !TYPES[collection]) throw new Error('Select an existing non-DLL collection.');
    if (!fields.publisher || !fields.product) throw new Error('Publisher and product are required.');
    const rule = doc.createElement('FilePublisherRule');
    Object.entries({ Id: guid(), Name: fields.name || fields.product, Description: 'Reviewed in TUNO T29', UserOrGroupSid: fields.sid || 'S-1-1-0', Action: 'Allow' }).forEach(([k,v]) => rule.setAttribute(k,v));
    const conditions = doc.createElement('Conditions'), condition = doc.createElement('FilePublisherCondition'), range = doc.createElement('BinaryVersionRange');
    Object.entries({ PublisherName: fields.publisher, ProductName: fields.product, BinaryName: fields.binary || '*' }).forEach(([k,v]) => condition.setAttribute(k,v));
    range.setAttribute('LowSection','*'); range.setAttribute('HighSection','*'); condition.append(range); conditions.append(condition); rule.append(conditions); col.append(rule);
    return serialize(doc);
  }
  function canonicalXml(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Unreadable XML value.');
    function canonical(n) {
      if (n.nodeType === 1) return [n.nodeName, Array.from(n.attributes).map((a) => [a.name,a.value]).sort((a,b) => a[0].localeCompare(b[0])), Array.from(n.childNodes).filter((x) => x.nodeType === 1 || (x.nodeType === 3 && x.textContent.trim())).map(canonical)];
      return n.textContent.trim();
    }
    return JSON.stringify(canonical(doc.documentElement));
  }
  function decodeSetting(s) {
    if (typeof s.value !== 'string' || !s.value.trim() || /^\*+$/.test(s.value.trim())) throw new Error('Intune did not return readable XML for ' + s.omaUri);
    if ((s['@odata.type'] || '').endsWith('omaSettingStringXml')) return new TextDecoder().decode(Uint8Array.from(atob(s.value), (c) => c.charCodeAt(0)));
    if (!(s['@odata.type'] || '').endsWith('omaSettingString')) throw new Error('Unsupported OMA setting type: ' + s['@odata.type']);
    return s.value;
  }
  const alUri = (s) => String(s.omaUri || '').match(/^\.\/Vendor\/MSFT\/AppLocker\/ApplicationLaunchRestrictions\/([^/]+)\/(EXE|MSI|Script|StoreApps|DLL)\/Policy$/i);
  function adoption(profile, assignments) {
    const settings = profile.omaSettings || [], cols = [], groups = new Set();
    for (const s of settings) {
      if (!/\/AppLocker\//i.test(s.omaUri || '')) continue;
      const match = alUri(s);
      if (!match) throw new Error('Unsupported AppLocker OMA-URI: ' + s.omaUri);
      if (/^DLL$/i.test(match[2])) throw new Error('This profile deploys DLL rules. Use the reviewed cleanup/migration helper before adopting it in T29. Dropping a DLL setting alone cannot prove removal on devices.');
      groups.add(match[1]);
      const xml = decodeSetting(s), doc = new DOMParser().parseFromString(xml, 'text/xml');
      const type = Object.keys(TYPES).find((k) => TYPES[k].toLowerCase() === match[2].toLowerCase());
      if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.nodeName !== 'RuleCollection' || doc.documentElement.getAttribute('Type') !== type) throw new Error('Unexpected collection XML at ' + s.omaUri);
      cols.push(serialize(doc.documentElement));
    }
    if (groups.size !== 1 || !cols.length) throw new Error('Adoption requires one readable AppLocker grouping.');
    const xml = '<AppLockerPolicy Version="1">' + cols.join('\n') + '</AppLockerPolicy>';
    const checks = inspect(xml); if (checks.errors.length) throw new Error(checks.errors.join('\n'));
    if (!Array.isArray(assignments)) throw new Error('Assignments were not read.');
    return { id: profile.id, grouping: Array.from(groups)[0], xml, profile, assignments, fingerprint: fingerprint(profile,assignments) };
  }
  function fingerprint(profile, assignments) {
    const settings = (profile.omaSettings || []).map((s) => [s.omaUri,s['@odata.type'],s.displayName || '',s.description || '',/\/AppLocker\//i.test(s.omaUri || '') ? canonicalXml(decodeSetting(s)) : JSON.stringify(s)]).sort((a,b) => a[0].localeCompare(b[0]));
    const targets = assignments.map((a) => stable(a)).sort();
    return JSON.stringify([profile.id,profile.displayName,profile.description || '',profile.lastModifiedDateTime || '',settings,targets]);
  }
  function stable(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k)+':'+stable(value[k])).join(',') + '}';
  }
  function profileBody(xml, config, adopted) {
    if (!/^AppLocker-[\da-f-]{36}$/i.test(config.grouping) && !adopted) throw new Error('Generate an AppLocker grouping first.');
    if (adopted && config.grouping !== adopted.grouping) throw new Error('An existing grouping cannot change during redeployment.');
    const parsed = inspect(xml); if (parsed.errors.length) throw new Error(parsed.errors.join('\n'));
    if (!config.displayName.trim()) throw new Error('A profile name is required.');
    const desired = columns(parsed.doc).map((col) => {
      const uri = './Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/' + config.grouping + '/' + TYPES[col.getAttribute('Type')] + '/Policy';
      const old = adopted && adopted.profile.omaSettings.find((s) => s.omaUri.toLowerCase() === uri.toLowerCase());
      const value = serialize(col);
      const type = old ? old['@odata.type'] : '#microsoft.graph.omaSettingString';
      const encoded = type.endsWith('omaSettingStringXml') ? btoa(String.fromCharCode.apply(null, new TextEncoder().encode(value))) : value;
      return Object.assign({ '@odata.type': type, displayName: col.getAttribute('Type'), description: 'TUNO T29 · DLL omitted', omaUri: old ? old.omaUri : uri, value: encoded }, old && old.fileName ? { fileName: old.fileName } : {});
    });
    if (adopted) {
      const existing = adopted.profile.omaSettings.filter(alUri).map((s) => s.omaUri.toLowerCase()).sort();
      if (stable(existing) !== stable(desired.map((s) => s.omaUri.toLowerCase()).sort())) throw new Error('Changing the collection set needs a separate migration. Keep the existing CSP nodes for an in-place redeploy.');
      desired.push(...adopted.profile.omaSettings.filter((s) => !/\/AppLocker\//i.test(s.omaUri || '')).map((s) => { const copy={};for(const k of ['@odata.type','displayName','description','omaUri','value','fileName'])if(s[k]!==undefined)copy[k]=s[k];return copy; }));
    }
    return { '@odata.type': '#microsoft.graph.windows10CustomConfiguration', displayName: config.displayName.trim(), description: config.description || 'TUNO T29 AppLocker policy · weekly Harvest · DLL omitted', omaSettings: desired };
  }
  const isDll = (e) => String(e.collection || '').toLowerCase() === 'dll' || [e.path,e.filePath,e.binary].some((v)=>/\.dll(?:["']?\s*)$/i.test(String(v || '')));
  function bundleOf(input, name) {
    if (!input || !/^tuno\.applocker\.(events|harvest)\/1$/.test(input.schema || '')) throw new Error(name + ': expected a T01 events bundle or T29 Harvest bundle. Scan bundles are unsupported.');
    if (!input.machine || !input.machine.name || !Number.isFinite(Date.parse(input.machine.collectedUtc)) || !input.events || !Array.isArray(input.events.entries)) throw new Error(name + ': incomplete device/window metadata.');
    const events = input.events.entries.filter((e) => !isDll(e));
    return { name, raw: input, device: input.machine.name, identity: input.machine.deviceId || input.machine.name, collected: input.machine.collectedUtc, since: input.events.sinceUtc || input.machine.sinceUtc, entries: events, excluded: input.events.entries.length-events.length + (Number.isInteger(input.events.excludedDll) && input.events.excludedDll>0 ? input.events.excludedDll : 0) };
  }
  function evidence(bundles, now) {
    const rows = [], seen = new Set(); let duplicates = 0, excluded = 0;
    const devices = new Map();
    for (const b of bundles) {
      excluded += b.excluded;
      const old = devices.get(b.identity); if (!old || Date.parse(b.collected) > Date.parse(old.collected)) devices.set(b.identity,b);
      for (const [index,e] of b.entries.entries()) {
        const record = e.recordId !== undefined && e.recordId !== null;
        const weak = !e.log || !Number.isFinite(Date.parse(e.timeUtc)) || (!record && !e.path && !e.binary);
        const key = weak ? stable([b.name,b.identity,index,rows.length]) : record ? stable([b.identity,e.log,e.recordId,e.timeUtc]) : stable([b.identity,e.log,e.timeUtc,e.eventId,e.path,e.publisher,e.product,e.binary,e.hash,e.userSid]);
        if (seen.has(key)) { duplicates++; continue; } seen.add(key);
        rows.push(Object.assign({}, e, { device:b.device, identity:b.identity, source:b.name }));
      }
    }
    const clock = now || Date.now();
    return { rows, devices: Array.from(devices.values()).map((b) => ({ bundle:b, stale:clock-Date.parse(b.collected)>8*86400000, partial: b.raw.events.available !== true || !Number.isFinite(Date.parse(b.since)) || Date.parse(b.collected)>clock+300000 || !Array.isArray(b.raw.events.logsRead) || new Set(b.raw.events.logsRead).size<4 || (b.raw.warnings || []).length>0 || b.raw.events.truncated === true, identityWeak:!b.raw.machine.deviceId })), duplicates, excluded };
  }
  function receipt(b, adopted) {
    if (!adopted) return 'No selected Intune profile';
    const r = b.raw.policyReceipt;
    if (!r || !r.mdm || !Array.isArray(r.mdm.collections)) return 'Policy receipt unavailable';
    const expected = columns(documentOf(adopted.xml));
    const observed = r.mdm.collections.filter((c) => c.grouping === adopted.grouping);
    if (!observed.length) return 'Selected grouping not reported';
    try { if (expected.every((col) => observed.some((c) => c.type === col.getAttribute('Type') && canonicalXml(c.xml) === canonicalXml(serialize(col))))) return 'Selected collections match · other sources may apply';
    return 'Selected collections differ / incomplete'; } catch { return 'Policy receipt XML unreadable'; }
  }
  const psQuote = (v) => "'" + String(v || '').replace(/'/g,"''").replace(/[\r\n]/g,'') + "'";
  function stampScript(text, config) {
    for (const key of ['SiteUrl','TenantId','ClientId','CertSubject','CertThumbprint','ClientSecret','Folder']) text = text.replace(new RegExp('^(    '+key+'\\s*= ).*$','m'), (_,start) => start+psQuote(config[key]));
    return text.replace(/^(    RetentionDays\s*= ).*$/m, (_,start) => start+Number(config.RetentionDays));
  }
  function changes(before,after) {
    const old=before?inspect(before).doc:null, next=inspect(after).doc;
    const rules=(doc)=>doc?Array.from(doc.querySelectorAll('FilePathRule,FilePublisherRule,FileHashRule')):[];
    const a=rules(old),b=rules(next),rows=[];
    for(const r of b){const previous=a.find((p)=>p.getAttribute('Id')===r.getAttribute('Id'));if(!previous)rows.push('Added: '+r.getAttribute('Name'));else if(canonicalXml(serialize(previous))!==canonicalXml(serialize(r)))rows.push('Edited: '+r.getAttribute('Name'));}
    for(const r of a)if(!b.some((n)=>n.getAttribute('Id')===r.getAttribute('Id')))rows.push('Removed: '+r.getAttribute('Name'));
    if(old)for(const col of columns(next)){const previous=columns(old).find((c)=>c.getAttribute('Type')===col.getAttribute('Type'));if(previous&&previous.getAttribute('EnforcementMode')!==col.getAttribute('EnforcementMode'))rows.push(col.getAttribute('Type')+' mode: '+previous.getAttribute('EnforcementMode')+' → '+col.getAttribute('EnforcementMode'));}
    return rows;
  }
  return { prettyXml, changes, TYPES, newGrouping, normalize, inspect, coverage, addPublisher, canonicalXml, adoption, fingerprint, profileBody, isDll, bundleOf, evidence, receipt, stampScript, stable };
})();
