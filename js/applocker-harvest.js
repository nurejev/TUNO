// T29 — event-first AppLocker maintenance, independent of T01's scan state.
const AppLockerHarvestTool = (() => {
  const C = AppLockerHarvestCore, $ = (id) => document.getElementById(id);
  const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g,(c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fresh = () => ({ tab:'results', xml:'', source:'', omitted:0, grouping:C.newGrouping(), adopted:null, profiles:[], bundles:[], busy:false, epoch:0, plan:null, pending:null, verified:null, backup:false, previous:[], groups:[], picked:null, site:null, files:[], helperPlan:null, helperPending:null, helperBackup:false });
  let s = fresh();
  // A sign-out invalidates every in-flight read before it can populate another
  // tenant's session. Do not replay or retry a write whose outcome is unknown.
  const guarded = (promise) => { const epoch=s.epoch;return Promise.resolve(promise).then((value)=>{if(epoch!==s.epoch)throw new Error('Session changed; previous result discarded.');return value;}); };
  const G = new Proxy(Graph,{get(target,key){const value=target[key];return typeof value==='function'?function(...args){return guarded(value.apply(target,args));}:value;}});
  const fetchLocal = (...args) => guarded(fetch(...args));
  const PAIRS = {
    weekly: { name:'[REPAIR_TOOLS]Win - DHS - Device Security - D - Weekly AppLocker Harvest - R27.1 - v1.0.0', detect:'Detect-TunoWeeklyAppLockerHarvest.ps1', remediate:'Get-TunoWeeklyAppLockerHarvest.ps1', version:'1.0.0', changed:10690 },
    cleanup: { name:'[REPAIR_TOOLS]Win - DHS - Device Security - D - Clear Applocker Settings - R27.1 - v1.4.0', detect:'Detect-TunoAppLockerPolicy.ps1', remediate:'Clear-TunoAppLockerPolicy.ps1', version:'1.4.0', changed:10612 },
    events: { name:'[REPAIR_TOOLS]Win - DHS - Device Security - D - Collect AppControl Events - R27.1 - v1.3.1', detect:'Detect-TunoAppControlEvents.ps1', remediate:'Get-TunoAppControlEvents.ps1', version:'1.3.1', changed:10624 }
  };
  const message = (text,error) => { $('ahStatus').textContent=text; $('ahStatus').className='ah-status mini'+(error?' ah-danger':''); };
  const opts = () => ({scopes:Graph.SCOPES.profiles});
  const enabled = () => { if (Graph.isDemo()) throw new Error('Tenant writes are unavailable in Demo. XML, coverage and file import can be reviewed locally.'); if (!Graph.signedIn()) throw new Error('Sign in before reading or writing Intune.'); };
  const read = async (url,scopes) => { const rows=[]; while(url) { const page=await G.get(url,{scopes:scopes || Graph.SCOPES.profiles}); if (!page || !Array.isArray(page.value)) throw new Error('The list was not returned.');rows.push(...page.value);url=page['@odata.nextLink']; } return rows; };
  async function snapshot(id) {
    const url=Graph.profileUrl(id);
    const [profile,assignments]=await Promise.all([G.get(url,opts()),read(url+'/assignments')]);
    const hydrated=await G.hydrateOmaSettings(profile,{forceEncrypted:true});
    if (hydrated.errors.length) throw new Error('Policy values unreadable: '+hydrated.errors.map((e)=>e.omaUri+' '+e.error).join('; '));
    return C.adoption(hydrated.profile,assignments);
  }
  const download = (name,body,type) => { const url=URL.createObjectURL(new Blob([body],{type:type || 'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const config = () => ({displayName:$('ahName').value,grouping:s.grouping,description:s.adopted?s.adopted.profile.description:undefined});
  function invalidate() { s.plan=null;s.backup=false; $('ahReview').checked=false; $('ahConfirm').value='';renderPlan(); }
  function setXml(xml,source) {
    if (s.pending) throw new Error('Resolve the pending Intune write before changing the draft.');
    const newSource=source && source!==s.source;const norm=C.normalize(xml); if (s.xml) s.previous.push(s.xml);
    s.previous=s.previous.slice(-20);s.xml=norm.xml;s.source=source || s.source;if(newSource || norm.omitted)s.omitted=norm.omitted;
    $('ahXml').value=s.xml;invalidate();renderPolicy();renderCoverage();
  }
  function applyEditor() { setXml($('ahXml').value); message('Draft updated; deployment review must be prepared again.'); }
  function show(tab) {
    s.tab=tab;
    document.querySelectorAll('#screen-applocker-harvest [data-ah-pane]').forEach((p)=>{p.hidden=p.dataset.ahPane!==tab;});
    document.querySelectorAll('[data-ah-tab]').forEach((b)=>b.setAttribute('aria-selected',String(b.dataset.ahTab===tab)));
    if(tab==='results') renderResults(); if(tab==='deploy') renderPlan();
  }
  function renderPolicy() {
    $('ahSource').textContent=s.source || 'Load a supplied template, XML file or existing Intune policy.';
    if(!s.xml){$('ahPolicyChecks').innerHTML='';return;}
    const p=C.inspect(s.xml);
    const summary=p.model.collections.map((c)=>c.type+' '+c.mode+' · '+c.rules.length+' rules').join(' / ');
    $('ahPolicyChecks').innerHTML='<div class="ah-note">'+esc(summary)+'<br>DLL collections omitted'+(s.omitted?' · '+s.omitted+' DLL rules removed on import':'')+'.</div>'+p.errors.map((e)=>'<div class="ah-note ah-danger">'+esc(e)+'</div>').join('')+(p.warnings.length?'<details class="ah-note ah-warning"><summary>'+p.warnings.length+' policy findings to review</summary>'+p.warnings.map((e)=>'<p>'+esc(e)+'</p>').join('')+'</details>':'');
    const ruleOptions=p.model.collections.flatMap((c)=>c.rules.map((r)=>'<option value="'+esc(r.id)+'">'+esc(c.type+' · '+r.name)+'</option>')).join('');
    $('ahRule').innerHTML='<option value="">Select a rule to edit</option>'+ruleOptions;
    $('ahGrouping').value=s.grouping; $('ahNewGrouping').disabled=!!s.adopted || !!s.pending;
    $('ahSourceMode').textContent=p.model.collections.every((c)=>c.mode==='AuditOnly')?'AuditOnly':p.model.collections.every((c)=>c.mode==='Enabled')?'Enforced':'Mixed / NotConfigured';
  }
  function renderCoverage() {
    if(!s.xml){$('ahOneDrive').disabled=true;$('ahCoverage').innerHTML='<p>Load a policy to verify the same 11 Microsoft scenarios used by T01.</p>';return;}
    const rows=C.coverage(s.xml), allowed=rows.filter((r)=>r.result.status==='allowed').length;
    $('ahCoverage').innerHTML='<div class="ah-note"><b>'+allowed+' / '+rows.length+' predicted allowed</b>. Standard-user catalog prediction; installed versions, custom-group denies, effective sources and real execution need device testing.</div><div class="ah-scroll"><table><thead><tr><th>Microsoft app</th><th>Draft prediction</th><th>Evidence</th></tr></thead><tbody>'+rows.map(({app,result})=>'<tr><td>'+esc(app.name)+'</td><td>'+esc(result.status)+(result.audit?' · would behave this way if enforced':'')+'</td><td>'+esc(result.detail || (result.perArt || []).map((r)=>r.art.path+': '+(r.why || (r.rule && r.rule.name) || r.status)).join('\n'))+'</td></tr>').join('')+'</tbody></table></div>';
    $('ahOneDrive').disabled=rows.find((r)=>r.app.id==='onedrive-user').result.status==='allowed';
  }
  function renderResults() {
    const ev=C.evidence(s.bundles);
    $('ahResults').innerHTML=s.bundles.length?'<div class="ah-kpis"><div><strong>'+ev.devices.length+'</strong>reporting devices</div><div><strong>'+ev.rows.filter((e)=>e.verdict==='Blocked').length+'</strong>blocked events</div><div><strong>'+ev.rows.filter((e)=>e.verdict==='Audited').length+'</strong>would block</div><div><strong>'+ev.devices.filter((d)=>d.partial||d.stale).length+'</strong>partial / stale</div></div><p class="mini">Imported devices only; the assigned fleet denominator has not been read. '+ev.duplicates+' repeated events removed; '+ev.excluded+' DLL entries excluded. Empty logs do not prove app coverage.</p><div class="ah-scroll"><table><thead><tr><th>Device</th><th>Last collection / window</th><th>Evidence</th><th>Selected policy receipt</th></tr></thead><tbody>'+ev.devices.map((d)=>'<tr><td>'+esc(d.bundle.device)+'</td><td>'+esc(d.bundle.collected)+'<br>Since '+esc(d.bundle.since || 'unknown')+'</td><td>'+esc([d.stale?'Stale':'Current',d.partial?'Partial read':'Four channels read',d.identityWeak?'Hostname identity only':'Device ID reported'].join(' · '))+'<br>'+esc((d.bundle.raw.warnings || []).join('; '))+'</td><td>'+esc(C.receipt(d.bundle,s.adopted))+'</td></tr>').join('')+'</tbody></table></div>':'<div class="ah-note">No results imported. Configure the weekly collector, or import existing T01 AppControl event bundles. Application scans are not used.</div>';
    const filter=$('ahEventFilter').value;
    const rows=ev.rows.filter((e)=>filter==='all'||e.verdict===filter);
    $('ahEvents').innerHTML='<p class="mini">'+rows.length+' events in the selected display filter. Readiness uses the full imported evidence.</p><div class="ah-scroll"><table><thead><tr><th>Device / time</th><th>Result</th><th>Application</th><th>Action</th></tr></thead><tbody>'+rows.slice(0,500).map((e,i)=>'<tr><td>'+esc(e.device)+'<br>'+esc(e.timeUtc)+'</td><td>'+esc(e.verdict || 'Unknown')+' · '+esc(e.eventId)+'</td><td>'+esc(e.path || e.binary || '(not reported)')+'<br>'+esc(e.publisher)+'<br>'+esc(e.product)+'</td><td>'+((e.publisher&&e.product&&!C.isDll(e))?'<button class="btn secondary" data-ah-event="'+i+'">Review publisher allow</button>':'Signature not reported')+'</td></tr>').join('')+'</tbody></table></div>'+(rows.length>500?'<p>Showing the first 500 rows; the export includes all '+rows.length+'.</p>':'');
    s.eventRows=rows;
  }
  function renderPlan() {
    $('ahGrouping').value=s.grouping;
    $('ahDeployKind').textContent=s.adopted?'Redeploy existing profile · '+s.adopted.id:'Create new unassigned profile';
    $('ahNewGrouping').disabled=!!s.adopted || !!s.pending;
    $('ahPrepare').disabled=s.busy || !!s.pending;
    $('ahApply').disabled=s.busy || !s.plan || !s.backup || !$('ahReview').checked || (s.plan.enforced && $('ahConfirm').value!=='ENFORCE');
    $('ahBackup').disabled=!s.plan;
    $('ahRecover').hidden=!s.pending;
    $('ahPlan').innerHTML=s.plan?'<div class="ah-note"><b>'+esc(s.plan.kind==='create'?'Create unassigned':'Update the same Intune profile')+'</b><br>'+esc(s.plan.body.displayName)+'<br>Grouping '+esc(s.grouping)+'<br>'+esc(s.plan.summary)+'<br>Assignments '+esc(s.plan.adopted?s.plan.adopted.assignments.length+' preserved':'none until a separate assignment')+'</div>'+s.plan.changes.map((w)=>'<div class="mini">'+esc(w)+'</div>').join('')+s.plan.warnings.map((w)=>'<div class="ah-note ah-warning">'+esc(w)+'</div>').join('')+'<details><summary>Exact deployment payload</summary><pre>'+esc(JSON.stringify(s.plan.body,null,2))+'</pre></details><p class="mini">'+(s.plan.enforced?'Enforced deployment can block applications immediately on targeted devices. Confirm a completed pilot below.':'AuditOnly records would-block events. Other policy sources can still enforce.')+' Rollback: import the saved policy snapshot and redeploy it to the same ID; removing a profile is not a verified CSP cleanup.</p>':'<div class="ah-note">Prepare a review after editing. New policies get one stable automatic grouping. Existing policies retain their ID, grouping and assignments.</div>';
    $('ahReceipt').textContent=s.verified?'Intune read-back verified for '+s.verified.id+'. Device receipt and application execution still require a subsequent Harvest and pilot check.':'';
    $('ahCoverageGate').hidden=!(s.plan&&s.plan.enforced&&s.plan.gaps.length);
    $('ahCoverageGaps').textContent=s.plan?s.plan.gaps.join('; '):'';
    $('ahEnforceGate').hidden=!(s.plan&&s.plan.enforced);
  }
  const settingsEqual = (a,b) => C.stable(a.omaSettings.map((x)=>[x.omaUri.toLowerCase(),x['@odata.type'],/\/AppLocker\//i.test(x.omaUri)?C.canonicalXml(C.adoption({id:'compare',omaSettings:[x]},[]).xml):x.value]).sort()) === C.stable(b.omaSettings.map((x)=>[x.omaUri.toLowerCase(),x['@odata.type'],/\/AppLocker\//i.test(x.omaUri)?C.canonicalXml(C.adoption({id:'compare',omaSettings:[x]},[]).xml):x.value]).sort());
  async function loadProfiles() {
    enabled();s.profiles=await G.customProfiles();
    $('ahProfiles').innerHTML='<option value="">Select an AppLocker profile</option>'+s.profiles.filter((p)=>(p.omaSettings||[]).some((x)=>/\/AppLocker\//i.test(x.omaUri||''))).map((p)=>'<option value="'+esc(p.id)+'">'+esc(p.displayName)+' · '+esc(p.id)+'</option>').join('');
    message('Intune profiles read. Select one and choose Load for editing.');
  }
  async function adopt() {
    enabled();if(s.pending)throw new Error('Resolve the pending write first.');const id=$('ahProfiles').value;if(!id)throw new Error('Select a profile.');
    const a=await snapshot(id);s.adopted=a;s.grouping=a.grouping;$('ahName').value=a.profile.displayName;setXml(a.xml,'Intune · '+a.profile.displayName);s.verified=null;renderResults();message('Loaded the exact profile and its assignments. Editing will keep its ID and grouping.');
  }
  async function prepare() {
    enabled(); if($('ahXml').value!==s.xml)throw new Error('Apply the XML editor changes first.');
    if(!s.xml)throw new Error('Load a policy first.');
    const adopted=s.adopted?await snapshot(s.adopted.id):null;
    if(adopted&&adopted.fingerprint!==s.adopted.fingerprint)throw new Error('Intune changed since this draft was loaded. Load the current profile and reconcile your edits before redeployment.');
    const body=C.profileBody(s.xml,config(),adopted), profiles=await G.customProfiles();
    const collisions=Graph.collisions(profiles.filter((p)=>!adopted||p.id!==adopted.id),body.displayName,s.grouping);
    if(collisions.length)throw new Error('Name/grouping collision: '+collisions.map((p)=>p.displayName||p.profile&&p.profile.displayName||p.id).join('; '));
    const parsed=C.inspect(s.xml), enforced=parsed.model.collections.some((c)=>c.mode!=='AuditOnly');
    const coverage=C.coverage(s.xml), gaps=coverage.filter((r)=>r.result.status!=='allowed');
    const old=adopted?C.inspect(adopted.xml).model.collections.flatMap((c)=>c.rules):[], next=parsed.model.collections.flatMap((c)=>c.rules);
    const added=next.filter((r)=>!old.some((x)=>x.id===r.id)).length, removed=old.filter((r)=>!next.some((x)=>x.id===r.id)).length;
    s.plan={gaps:gaps.map((r)=>r.app.name+' · '+r.result.status),changes:C.changes(adopted&&adopted.xml,s.xml),kind:adopted?'update':'create',body,adopted,enforced,xml:s.xml,summary:parsed.rules+' rules · DLL omitted · '+added+' added / '+removed+' removed · all XML changes included',warnings:parsed.warnings,coverage,when:new Date().toISOString()};s.backup=false;renderPlan();message('Deployment review prepared. Read the warnings, download the review/rollback file, then confirm.');
  }
  const rejectedWrite = (e) => ['auth','consent','admin'].includes(e.kind) || [400,401,403,404,409,412,422,429].includes(Number(e.status));
  async function apply() {
    enabled();const p=s.plan;
    if(!p||!s.backup||!$('ahReview').checked||p.xml!==s.xml)throw new Error('Prepare, download and confirm the current review first.');
    if(p.enforced&&($('ahConfirm').value!=='ENFORCE'||$('ahPilot').value.trim().length<20))throw new Error('Describe the completed pilot and type ENFORCE.');
    if(p.enforced&&p.gaps.length&&$('ahCoverageDisposition').value.trim().length<20)throw new Error('Record how every Microsoft catalog gap/conditional match is handled, or use AuditOnly while testing.');
    if(p.adopted) { const current=await snapshot(p.adopted.id);if(current.fingerprint!==p.adopted.fingerprint)throw new Error('Policy or assignments changed after review. Load the current profile before editing again.'); }
    const profiles=await G.customProfiles();if(Graph.collisions(profiles.filter((x)=>!p.adopted||x.id!==p.adopted.id),p.body.displayName,s.grouping).length)throw new Error('A name or grouping collision appeared after review; no write performed.');
    s.pending={body:p.body,id:p.adopted&&p.adopted.id,assignments:p.adopted?p.adopted.assignments:[],grouping:s.grouping,pilot:$('ahPilot').value,coverageDisposition:$('ahCoverageDisposition').value};
    let made;
    try { if(p.kind==='create') { made=await G.createProfile(p.body);if(!made||!made.id)throw new Error('Intune did not return the created ID. Resolve the outcome before retrying.');s.pending.id=made.id; }
    else { const payload=Object.assign({},p.body);delete payload['@odata.type'];await G.patch(Graph.profileUrl(p.adopted.id),payload,opts()); }
    } catch(e) {if(rejectedWrite(e))s.pending=null;throw e;}
    await recover();
  }
  async function recover() {
    enabled();const p=s.pending;if(!p)throw new Error('No write awaiting verification.');
    if(!p.id) { const profiles=await G.customProfiles();const matches=profiles.filter((x)=>String(x.displayName)===p.body.displayName&&(x.omaSettings||[]).some((x)=>String(x.omaUri||'').includes('/'+p.grouping+'/')));if(matches.length!==1)throw new Error('Creation outcome remains unknown ('+matches.length+' matches). Inspect Intune before retrying; the grouping has been retained.');p.id=matches[0].id; }
    const current=await snapshot(p.id);
    if(!settingsEqual(current.profile,p.body)||current.profile.displayName!==p.body.displayName||C.stable(current.assignments.map(C.stable).sort())!==C.stable(p.assignments.map(C.stable).sort()))throw new Error('Intune read-back differs from the reviewed payload or assignments. Outcome remains pending; inspect and read again.');
    s.adopted=current;s.grouping=current.grouping;$('ahName').value=current.profile.displayName;s.verified=current;s.pending=null;s.plan=null;s.backup=false;$('ahReview').checked=false;renderPolicy();renderPlan();renderResults();message('Intune read-back verified. Gather a later policy receipt and test the required applications on pilot devices.');
  }
  async function assign() {
    enabled();if(!s.verified||!s.picked)throw new Error('Select a verified new profile and a target group.');
    if(s.pending)throw new Error('Resolve the pending write first.');
    const current=await snapshot(s.verified.id);
    if(current.assignments.length)throw new Error('This policy already has assignments. Use T11 Assignment editor to preserve filters, exclusions and existing targets.');
    if(!$('ahAssignReview').checked)throw new Error('Confirm the displayed assignment first.');
    const target=await G.get('/groups/'+encodeURIComponent(s.picked.id)+'?$select=id,displayName,securityEnabled',{scopes:Graph.SCOPES.groups});if(!target||target.id!==s.picked.id||!target.securityEnabled)throw new Error('The selected security group could not be verified.');
    await G.assignProfile(current.id,target.id);
    const after=await snapshot(current.id);
    if(after.assignments.length!==1||!after.assignments.some((a)=>a.target&&a.target.groupId===target.id))throw new Error('Assignment write sent, but read-back is incomplete. Read Intune again before retrying.');
    s.adopted=after;s.verified=after;invalidate();message('Assignment read-back verified for '+target.displayName+'. Device receipt is still pending.');
  }
  async function listHarvest() {
    enabled();const url=$('ahSiteUrl').value.trim();s.site=await G.siteByUrlRead(url);s.files=[];
    const root=$('ahFolder').value.trim()||'Harvest', children=await G.driveChildren(s.site.id,root);let failures=[];
    for(const folder of children.filter((x)=>x.folder)) {
      try { const files=await G.driveChildren(s.site.id,root+'/'+folder.name);s.files.push(...files.filter((x)=>x.file&&(/^(T29_AppLocker_|AppControlEvents_Bundle_)/.test(x.name))).map((x)=>Object.assign({},x,{device:folder.name}))); }
      catch(e){failures.push(folder.name+': '+e.message);}
    }
    s.files.sort((a,b)=>String(b.name).localeCompare(String(a.name)));
    $('ahHarvestFiles').innerHTML='<p>'+s.files.length+' bundles listed'+(failures.length?' · partial listing: '+esc(failures.join('; ')):'')+'. Download selected bundles, then import them below.</p><div class="ah-scroll"><table><tbody>'+s.files.slice(0,300).map((x,i)=>'<tr><td>'+esc(x.device)+'</td><td>'+esc(x.name)+'</td><td><button class="btn secondary" data-ah-download="'+i+'">Download / import</button></td></tr>').join('')+'</tbody></table></div>';
    message('Harvest listing read; file contents have not been imported. SharePoint downloads open separately because of browser cross-origin restrictions.');
  }
  async function importBundles(files) {
    const errors=[];
    for(const file of files) { try { const b=C.bundleOf(JSON.parse((await guarded(file.text())).replace(/^\uFEFF/,'')),file.name);s.bundles=s.bundles.filter((old)=>!(old.name===b.name&&old.identity===b.identity));s.bundles.push(b); } catch(e){errors.push(e.message);} }
    renderResults();message((files.length-errors.length)+' bundle(s) imported'+(errors.length?' · rejected: '+errors.join('; '):''),!!errors.length);
  }
  function harvestConfig() {
    const cfg={};for(const key of ['SiteUrl','TenantId','ClientId','CertSubject','CertThumbprint','ClientSecret','Folder','RetentionDays'])cfg[key]=$('ah'+key).value.trim();
    cfg.RetentionDays=Number(cfg.RetentionDays);
    const url=new URL(cfg.SiteUrl);if(url.protocol!=='https:'||!url.hostname.endsWith('.sharepoint.com')||url.search||url.hash)throw new Error('Use the SharePoint site URL, without a query or fragment.');
    if(!/^[\da-f-]{36}$/i.test(cfg.TenantId)||!/^[\da-f-]{36}$/i.test(cfg.ClientId))throw new Error('Tenant and uploader app IDs must be GUIDs.');
    if(!cfg.CertSubject&&!cfg.CertThumbprint&&!cfg.ClientSecret)throw new Error('Configure the uploader certificate or a client secret.');
    if(!/^\w[\w/-]*$/.test(cfg.Folder)||cfg.Folder.split('/').some((x)=>!x||x==='..'||x==='.'))throw new Error('Use a relative library folder such as Harvest.');
    if(!Number.isInteger(cfg.RetentionDays)||cfg.RetentionDays<0||cfg.RetentionDays>3650)throw new Error('Retention must be 0..3650 days.');
    return cfg;
  }
  async function script(file,config) { const r=await fetchLocal('scripts/'+file+'?v='+APP_BUILD.build,{cache:'no-store'});if(!r.ok)throw new Error('Script download failed: '+file);const text=await guarded(r.text());return config?C.stampScript(text,config):text; }
  const b64 = (text) => {const bytes=new TextEncoder().encode('\uFEFF'+text.replace(/^\uFEFF/,''));let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return btoa(binary);};
  async function prepareHelper() {
    enabled();if(s.helperPending)throw new Error('Resolve the pending helper write before preparing another.');const key=$('ahHelperKind').value,pair=PAIRS[key],id=$('ahHelperId').value.trim();
    const cfg=key==='weekly'?harvestConfig():null;
    const [detect,remediate,list]=await Promise.all([script(pair.detect),script(pair.remediate,cfg),G.remediations()]);
    const name=$('ahHelperName').value.trim()||pair.name;let previous=null;
    if(id) {previous=await G.get(Graph.BETA+'/deviceManagement/deviceHealthScripts/'+encodeURIComponent(id),{scopes:Graph.SCOPES.scriptsWrite});if(!previous||previous.id!==id)throw new Error('Existing remediation not found.');previous.assignments=await read(Graph.BETA+'/deviceManagement/deviceHealthScripts/'+encodeURIComponent(id)+'/assignments',Graph.SCOPES.scriptsWrite);previous=JSON.parse(JSON.stringify(previous));}
    if(!id&&list.some((x)=>String(x.displayName).toLowerCase()===name.toLowerCase()))throw new Error('Same-name helper already exists. Select its immutable ID for an update.');
    const body={displayName:name,description:'TUNO T29 · '+(key==='weekly'?'Daily detection, weekly non-DLL event upload; retry pending uploads; prune after success.':'Carried over T01 helper; review effect before assignment.'),publisher:'TUNO',runAsAccount:'system',runAs32Bit:false,enforceSignatureCheck:false,detectionScriptContent:b64(detect),remediationScriptContent:b64(remediate)};
    s.helperPlan={key,body,previous,signature:helperSignature(),cfg};s.helperBackup=!previous;$('ahHelperReview').checked=false;
    $('ahHelperPreview').innerHTML='<div class="ah-note">'+esc(id?'Update '+previous.displayName+' · same remediation ID '+id+'; assignments and schedules preserved.':'Create unassigned remediation '+name)+'. '+(key==='weekly'?'Set its assignment schedule to Daily in Intune. The seven-day checkpoint controls collection.':key==='cleanup'?'Removes device AppLocker policy after its detection/marker checks. This is a deliberate migration helper; inspect the script before assigning.':'Legacy on-demand collection, includes CodeIntegrity; its detection runs every scheduled pass. Use the new weekly pair for weekly harvesting.')+'</div><details><summary>Detection script</summary><pre>'+esc(detect)+'</pre></details><details><summary>Remediation script'+(cfg&&cfg.ClientSecret?' · contains your uploader secret':'')+'</summary><pre>'+esc(remediate)+'</pre></details>';
    $('ahHelperBackup').disabled=!previous;$('ahHelperApply').disabled=!!previous;message('Helper review prepared. Create/update writes only the script object; review assignments and schedule in Intune afterwards.');
  }
  const helperSignature = () => C.stable(['ahHelperKind','ahHelperId','ahHelperName','ahSiteUrl','ahTenantId','ahClientId','ahCertSubject','ahCertThumbprint','ahClientSecret','ahFolder','ahRetentionDays'].map((id)=>$(id).value));
  async function applyHelper() {
    enabled();const p=s.helperPlan;if(!p||p.signature!==helperSignature()||!$('ahHelperReview').checked)throw new Error('Prepare and confirm the current helper review first.');
    if(p.previous && !s.helperBackup)throw new Error('Download the helper rollback snapshot first.');
    if(p.previous) {
      const now=await G.get(Graph.BETA+'/deviceManagement/deviceHealthScripts/'+encodeURIComponent(p.previous.id),{scopes:Graph.SCOPES.scriptsWrite});
      const assignments=await read(Graph.BETA+'/deviceManagement/deviceHealthScripts/'+encodeURIComponent(p.previous.id)+'/assignments',Graph.SCOPES.scriptsWrite);
      if(now.lastModifiedDateTime!==p.previous.lastModifiedDateTime||C.stable(assignments)!==C.stable(p.previous.assignments))throw new Error('Remediation or assignments changed after review. Prepare it again.');
    } else {
      const list=await G.remediations();if(list.some((x)=>String(x.displayName).toLowerCase()===p.body.displayName.toLowerCase()))throw new Error('A helper name collision appeared; no write performed.');
    }
    s.helperPending={body:p.body,previous:p.previous,id:p.previous&&p.previous.id};s.helperPlan=null;$('ahHelperApply').disabled=true;$('ahHelperRecover').hidden=false;
    try { if(p.previous) await G.updateRemediation(p.previous.id,p.body);
    else {const made=await G.createRemediation(p.body);if(!made||!made.id)throw new Error('Helper creation outcome unknown. Resolve it before retrying.');s.helperPending.id=made.id;}
    } catch(e) {if(rejectedWrite(e)){s.helperPending=null;s.helperPlan=p;$('ahHelperRecover').hidden=true;}throw e;}
    await recoverHelper();
  }
  async function recoverHelper() {
    enabled();const p=s.helperPending;if(!p)throw new Error('No pending helper write.');
    if(!p.id) {const list=await G.remediations(),matches=list.filter((x)=>x.displayName===p.body.displayName);if(matches.length!==1)throw new Error('Helper creation outcome remains unknown. Inspect Intune; do not create another copy.');p.id=matches[0].id;}
    const after=await G.get(Graph.BETA+'/deviceManagement/deviceHealthScripts/'+encodeURIComponent(p.id),{scopes:Graph.SCOPES.scriptsWrite});
    if(!after || after.detectionScriptContent!==p.body.detectionScriptContent||after.remediationScriptContent!==p.body.remediationScriptContent)throw new Error('Helper read-back differs or is incomplete. Inspect Intune, then resolve again.');
    const assignments=await read(Graph.BETA+'/deviceManagement/deviceHealthScripts/'+encodeURIComponent(p.id)+'/assignments',Graph.SCOPES.scriptsWrite);
    if(C.stable(assignments.map(C.stable).sort())!==C.stable((p.previous?p.previous.assignments:[]).map(C.stable).sort()))throw new Error('Helper assignments/schedule changed. Inspect Intune before proceeding.');
    $('ahHelperId').value=p.id;s.helperPending=null;$('ahHelperRecover').hidden=true;
    message('Helper scripts and assignments read-back verified · '+p.id+'. Assign new helpers and set the daily schedule in Intune; run a Windows pilot to verify upload and pruning.');
  }

  function init() {
    if(!$('ahWorkspace'))return;
    const action=(id,fn)=>$(id).addEventListener('click',()=>run(fn));
    async function run(fn) {if(s.busy)return;s.busy=true;const epoch=s.epoch;document.querySelectorAll('#ahWorkspace button, #ahWorkspace input, #ahWorkspace select, #ahWorkspace textarea').forEach((b)=>{b.dataset.wasDisabled=String(b.disabled);b.disabled=true;});try{await fn();}catch(e){if(s.epoch===epoch)message(e.message||String(e),true);}finally{if(s.epoch===epoch){s.busy=false;document.querySelectorAll('#ahWorkspace button, #ahWorkspace input, #ahWorkspace select, #ahWorkspace textarea').forEach((b)=>{b.disabled=b.dataset.wasDisabled==='true';});renderPlan();$('ahHelperApply').disabled=!s.helperPlan || !s.helperBackup || !!s.helperPending; if(s.xml)$('ahOneDrive').disabled=C.coverage(s.xml).find((r)=>r.app.id==='onedrive-user').result.status==='allowed';}}}
    document.querySelectorAll('[data-ah-tab]').forEach((b)=>action(b.id,()=>show(b.dataset.ahTab)));
    action('ahTemplate',async()=>{const name=$('ahTemplateKind').value;const r=await fetchLocal('templates/applocker/'+name);if(!r.ok)throw new Error('Template unavailable');setXml(await guarded(r.text()),name);message('Imported supplied XML; DLL omitted. The Audit filename also contains Enabled collections. Choose AuditOnly explicitly if needed.');show('policy');});
    $('ahPolicyFile').addEventListener('change',(e)=>run(async()=>{if(e.target.files[0])setXml(await guarded(e.target.files[0].text()),e.target.files[0].name);e.target.value='';}));
    action('ahApplyXml',applyEditor);action('ahUndo',()=>{if(!s.previous.length)return;const prev=s.previous.pop();setXml(prev);s.previous.pop();});
    action('ahModeApply',()=>setXml(C.normalize(s.xml,$('ahMode').value).xml));
    action('ahExportXml',()=>download('T29-AppLocker-'+$('ahSourceMode').textContent+'.xml',s.xml,'text/xml'));
    action('ahOneDrive',()=>{setXml(C.addPublisher(s.xml,'Exe',{name:'Microsoft OneDrive · per-user and machine-wide',publisher:MS_PUB,product:'MICROSOFT ONEDRIVE',binary:'*'}));message('OneDrive publisher rule added to the draft. Existing exceptions and rule IDs preserved.');});
    action('ahPublisherAdd',()=>{setXml(C.addPublisher(s.xml,$('ahPubCollection').value,{name:$('ahPubName').value,publisher:$('ahPubPublisher').value,product:$('ahPubProduct').value,binary:$('ahPubBinary').value,sid:$('ahPubSid').value}));message('Reviewed publisher allow added to the draft.');});
    $('ahRule').addEventListener('change',()=>{if(!s.xml)return;const doc=C.inspect(s.xml).doc,rule=Array.from(doc.querySelectorAll('FilePathRule,FilePublisherRule,FileHashRule')).find((r)=>r.getAttribute('Id')===$('ahRule').value);$('ahRuleXml').value=rule?new XMLSerializer().serializeToString(rule):'';});
    action('ahRuleApply',()=>{const doc=C.inspect(s.xml).doc,old=Array.from(doc.querySelectorAll('FilePathRule,FilePublisherRule,FileHashRule')).find((r)=>r.getAttribute('Id')===$('ahRule').value);if(!old)throw new Error('Select a rule.');const edited=new DOMParser().parseFromString($('ahRuleXml').value,'text/xml');if(edited.querySelector('parsererror')||edited.documentElement.getAttribute('Id')!==old.getAttribute('Id'))throw new Error('Keep the selected rule ID and provide valid XML.');old.replaceWith(doc.importNode(edited.documentElement,true));const xml=new XMLSerializer().serializeToString(doc);const checked=C.inspect(xml);if(checked.errors.length)throw new Error(checked.errors.join('; '));setXml(xml);});
    action('ahReadProfiles',loadProfiles);action('ahAdopt',adopt);action('ahPrepare',prepare);action('ahApply',apply);action('ahRecover',recover);
    action('ahNewPolicy',()=>{if(s.pending)throw new Error('Resolve the pending write first.');s.adopted=null;s.verified=null;s.grouping=C.newGrouping();invalidate();renderPolicy();message('New policy selected. The current draft will create an unassigned profile with a new grouping.');});
    action('ahNewGrouping',()=>{if(s.adopted||s.pending)throw new Error('Grouping is locked on an existing or pending profile.');s.grouping=C.newGrouping();invalidate();});
    $('ahName').addEventListener('input',invalidate);$('ahXml').addEventListener('input',invalidate);
    action('ahBackup',()=>{if(!s.plan)return;download('T29-review-rollback-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({schema:'tuno.applocker.review/1',review:s.plan.body,original:s.plan.adopted&&s.plan.adopted.profile,assignments:s.plan.adopted&&s.plan.adopted.assignments,originalXml:s.plan.adopted&&s.plan.adopted.xml,draftXml:s.xml,grouping:s.grouping,warnings:s.plan.warnings,pilot:$('ahPilot').value,coverageGaps:s.plan.gaps,coverageDisposition:$('ahCoverageDisposition').value},null,2));s.backup=true;renderPlan();});
    $('ahReview').addEventListener('change',renderPlan);$('ahConfirm').addEventListener('input',renderPlan);
    $('ahRollbackFile').addEventListener('change',(e)=>run(async()=>{if(!e.target.files[0])return;const data=JSON.parse(await guarded(e.target.files[0].text()));if(!s.adopted||!data.original||data.original.id!==s.adopted.id||data.grouping!==s.grouping||!data.originalXml)throw new Error('Load the same current Intune profile first, then import its rollback snapshot.');setXml(data.originalXml,'Rollback snapshot · '+data.original.id);message('Rollback XML loaded as a draft. Prepare and review an in-place deployment to restore it.');e.target.value='';}));
    action('ahGroupSearch',async()=>{enabled();s.groups=await G.searchGroups($('ahGroupQuery').value);$('ahGroups').innerHTML='<option value="">Select an exact security group</option>'+s.groups.filter((g)=>g.securityEnabled).map((g)=>'<option value="'+esc(g.id)+'">'+esc(g.displayName)+' · '+esc(g.id)+'</option>').join('');});
    $('ahGroups').addEventListener('change',()=>{s.picked=s.groups.find((g)=>g.id===$('ahGroups').value);$('ahAssignReview').checked=false;$('ahAssignment').textContent=s.picked?'Assign '+(s.verified?s.verified.profile.displayName:'the verified new profile')+' to '+s.picked.displayName+' · '+s.picked.id:'';});action('ahAssign',assign);
    action('ahReadHarvest',listHarvest);$('ahBundleFiles').addEventListener('change',(e)=>run(async()=>{await importBundles(Array.from(e.target.files));e.target.value='';}));
    $('ahEventFilter').addEventListener('change',renderResults);
    action('ahClearResults',()=>{s.bundles=[];renderResults();});action('ahExportEvents',()=>download('T29-Harvest-results.json',JSON.stringify({schema:'tuno.applocker.harvest-review/1',evidence:C.evidence(s.bundles),exportedUtc:new Date().toISOString()},null,2)));
    $('ahHarvestFiles').addEventListener('click',(e)=>{const b=e.target.closest('[data-ah-download]');if(b)run(async()=>{const item=s.files[Number(b.dataset.ahDownload)],dl=await G.driveDownloadUrl(s.site.id,item.id);const a=document.createElement('a');a.href=dl.url;a.download=dl.name;a.rel='noopener';a.target='_blank';a.click();message('Download opened. Import the downloaded bundle to review its contents.');});});
    $('ahEvents').addEventListener('click',(e)=>{const b=e.target.closest('[data-ah-event]');if(!b)return;const row=s.eventRows[Number(b.dataset.ahEvent)];$('ahPubPublisher').value=row.publisher;$('ahPubProduct').value=row.product;$('ahPubBinary').value=row.binary||'*';$('ahPubName').value=row.product;$('ahPubCollection').value=/Packaged app/.test(row.log)?'Appx':/MSI and Script/.test(row.log)?(/\.msi$/i.test(row.path)?'Msi':'Script'):'Exe';show('coverage');message('Event signature copied to the rule form. Verify publisher, product, collection and principal before adding it.');});
    $('ahHelperKind').addEventListener('change',()=>{$('ahHelperName').value=PAIRS[$('ahHelperKind').value].name;s.helperPlan=null;$('ahHelperApply').disabled=true;$('ahHelperReview').checked=false;});
    action('ahHelperBackup',()=>{if(!s.helperPlan || !s.helperPlan.previous)return;download('T29-helper-rollback-'+s.helperPlan.previous.id+'.json',JSON.stringify(s.helperPlan.previous,null,2));s.helperBackup=true;$('ahHelperApply').disabled=false;});
    action('ahHelperRecover',recoverHelper);
    action('ahHelperPrepare',prepareHelper);action('ahHelperApply',applyHelper);
    action('ahDownloadPair',async()=>{const pair=PAIRS[$('ahHelperKind').value],cfg=$('ahHelperKind').value==='weekly'?harvestConfig():null;if(typeof JSZip==='undefined')throw new Error('The bundled ZIP library is unavailable. Reload this page.');const [detect,remediate]=await Promise.all([script(pair.detect),script(pair.remediate,cfg)]);const zip=new JSZip();zip.file(pair.detect,'\uFEFF'+detect.replace(/^\uFEFF/,''));zip.file(pair.remediate,'\uFEFF'+remediate.replace(/^\uFEFF/,''));zip.file('README.txt','TUNO T29 P-2715 AppLocker & Harvest\nSYSTEM, 64-bit PowerShell.\n'+(cfg?'Daily schedule. Detection triggers after seven days or while an upload is pending.\nRetention '+cfg.RetentionDays+' days; 0 keeps history. Configure the uploader app/site permissions before assigning.\n':'Carry-over T01 helper: review script effect before assigning.\n'));download('T29-'+$('ahHelperKind').value+'-scripts.zip',await guarded(zip.generateAsync({type:'blob'})),'application/zip');message('Script pair downloaded in one ZIP. Run as SYSTEM in 64-bit PowerShell; use a Daily schedule for the weekly pair.');});
    action('ahReadHelpers',async()=>{enabled();const list=await G.remediations();$('ahHelperSelect').innerHTML='<option value="">Choose an existing helper to update</option>'+list.filter((x)=>/AppLocker|AppControl/i.test(x.displayName||'')).map((x)=>'<option value="'+esc(x.id)+'">'+esc(x.displayName)+' · '+esc(x.id)+'</option>').join('');});
    $('ahHelperSelect').addEventListener('change',()=>{$('ahHelperId').value=$('ahHelperSelect').value;s.helperPlan=null;$('ahHelperApply').disabled=true;});
    action('ahUseT01Target',()=>{const cfg=AppLockerTool._harvest.harvestConfig(); if(!cfg || !cfg.siteUrl)throw new Error('No T01 Harvest target is configured for this tenant. Use the site/uploader setup or enter the details.'); const map={SiteUrl:cfg.siteUrl,TenantId:cfg.tenantId,ClientId:cfg.clientId,CertSubject:cfg.certSubject,CertThumbprint:cfg.certThumbprint,ClientSecret:cfg.clientSecret,Folder:cfg.folder || 'Harvest'};for(const key of Object.keys(map))$('ah'+key).value=map[key]||'';message('Current tenant T01 target copied into this session. Review it and prepare the weekly helper.');});
    action('ahT01Setup',()=>{const tile=$('toolAppLocker');tile.click();AppLockerTool._review.showScreen('deploy');message('Use the existing T01 Harvest setup to create/grant an uploader app and site. Copy the site/app/certificate values back to T29.');});
    window.addEventListener('tuno:signout',()=>{const epoch=s.epoch+1;s=fresh();s.epoch=epoch;document.querySelectorAll('#ahWorkspace button, #ahWorkspace input, #ahWorkspace select, #ahWorkspace textarea').forEach((e)=>{e.disabled=false;});$('ahHelperApply').disabled=true;$('ahHelperBackup').disabled=true;$('ahHelperRecover').hidden=true;$('ahXml').value='';for(const id of ['ahClientSecret','ahSiteUrl','ahTenantId','ahClientId','ahCertSubject','ahCertThumbprint','ahHelperId','ahPilot','ahCoverageDisposition','ahConfirm','ahPubPublisher','ahPubProduct','ahGroupQuery','ahRuleXml'])$(id).value='';$('ahReview').checked=false;$('ahAssignReview').checked=false;$('ahHelperReview').checked=false;$('ahHelperPreview').innerHTML='';$('ahHarvestFiles').innerHTML='';$('ahProfiles').innerHTML='';$('ahHelperSelect').innerHTML='';$('ahGroups').innerHTML='';renderPolicy();renderCoverage();renderResults();renderPlan();message('Session cleared.');});
    $('ahHelperName').value=PAIRS.weekly.name;renderPolicy();renderCoverage();renderResults();renderPlan();show('results');
  }
  return { init, PAIRS, _test:{snapshot,prepare,apply,recover,assign,importBundles,prepareHelper,applyHelper,recoverHelper,setXml,settingsEqual,state:()=>s,config,show} };
})();
