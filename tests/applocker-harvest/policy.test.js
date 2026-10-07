const {suite}=require('../platformbaseline/harness');
const {ok,run,fs,path,ROOT}=suite('T29 policy and deployment');
const {JSDOM}=require('jsdom');
function boot(){
 const w=new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{runScripts:'outside-only',url:'https://nurejev.github.io/tuno-beta/'}).window;
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
 const files=['version.js','msappcatalog.js','demo.js','graph.js','applocker.js','applocker-harvest-core.js','applocker-harvest.js'];
 w.eval(files.map(f=>fs.readFileSync(path.join(ROOT,'js',f),'utf8')).join('\n;\n')+';Object.assign(window,{C:AppLockerHarvestCore,T:AppLockerHarvestTool,Graph});');
 w.Graph.signedIn=()=>true;w.Graph.isDemo=()=>false;w.T.init();return w;
}
const audit=fs.readFileSync(path.join(ROOT,'templates/applocker/AppLockerRules-Audit-R27.1-v1.0.xml'),'utf8');
const enforce=fs.readFileSync(path.join(ROOT,'templates/applocker/AppLockerRules-Enforce-R27.1-v1.0.xml'),'utf8');
const reject=async(fn,rx)=>{try{await fn();return false;}catch(e){return rx.test(e.message);}};
run(async()=>{
 let w=boot(),C=w.C,T=w.T,S=T._test.state(),xml=C.normalize(audit).xml;
 ok('both supplied templates retain 27 non-DLL rules',C.inspect(xml).rules===27&&C.inspect(C.normalize(enforce).xml).rules===27);
 ok('40 DLL rules omitted at import',C.normalize(audit).omitted===40&&!xml.includes('Type="Dll"'));
 ok('Audit filename really contains enforced collections',C.inspect(xml).model.collections.every(c=>c.mode==='Enabled'));
 ok('invalid macros and overlapping defaults are visible',C.inspect(xml).warnings.some(e=>e.includes('%PROGRAMDATA%'))&&C.inspect(xml).warnings.some(e=>e.includes('overlap')));
 ok('source IDs and all exceptions survive roundtrip',C.canonicalXml(xml)===C.canonicalXml(C.normalize(xml).xml)&&C.inspect(xml).doc.querySelectorAll('Exceptions > *').length===119);
 ok('same T01 catalog predicts 10/11 allowed',C.coverage(xml).filter(r=>r.result.status==='allowed').length===10&&C.coverage(xml).find(r=>r.app.id==='onedrive-user').result.status==='blocked');
 const fixed=C.addPublisher(xml,'Exe',{publisher:'O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US',product:'MICROSOFT ONEDRIVE'});
 ok('deliberate publisher allow covers all 11',C.coverage(fixed).every(r=>r.result.status==='allowed'));
 ok('OneDrive change retains all old rule IDs and exceptions',C.inspect(xml).model.collections.flatMap(c=>c.rules).every(r=>C.inspect(fixed).model.collections.flatMap(c=>c.rules).some(n=>n.id===r.id))&&C.inspect(fixed).doc.querySelectorAll('Exceptions > *').length===119);
 ok('explicit AuditOnly conversion is separate',C.inspect(C.normalize(xml,'AuditOnly').xml).model.collections.every(c=>c.mode==='AuditOnly'));
 ok('external entity payload refused',await reject(()=>C.inspect('<!DOCTYPE a><AppLockerPolicy Version="1"/>'),/entities/));
 ok('duplicate IDs block deploy',C.inspect(xml.replace(/Id="[^"]+"/, 'Id="'+C.inspect(xml).model.collections[0].rules[1].id+'"')).errors.some(e=>e.includes('duplicate')));
 const grouping=S.grouping;T._test.setXml(xml,'supplied audit');T._test.setXml(fixed,'fixed');ok('editing source and mode never regenerates grouping',S.grouping===grouping);
 const cfg={displayName:'Policy A',grouping},body=C.profileBody(fixed,cfg);
 ok('Intune payload contains only four non-DLL CSP nodes',body.omaSettings.length===4&&body.omaSettings.every(x=>!x.omaUri.includes('/DLL/')));
 let profile=Object.assign({id:'profile-a',lastModifiedDateTime:'2026-10-07T00:00:00Z'},body),assignments=[{id:'assignment-1',target:{groupId:'pilot-a','@odata.type':'#microsoft.graph.groupAssignmentTarget'}}];
 const adopted=C.adoption(profile,assignments);
 ok('adoption preserves ID, grouping and assignments',adopted.id==='profile-a'&&adopted.grouping===grouping&&adopted.assignments[0].target.groupId==='pilot-a');
 ok('redeployment grouping change refused',await reject(()=>C.profileBody(fixed,{displayName:'A',grouping:C.newGrouping()},adopted),/cannot change/));
 const withDll=Object.assign({},profile,{omaSettings:profile.omaSettings.concat([{...body.omaSettings[0],omaUri:body.omaSettings[0].omaUri.replace('/EXE/','/DLL/')}])});
 ok('existing DLL CSP node requires migration, cannot silently drop',await reject(()=>C.adoption(withDll,[]),/migration/));
 ok('collection removal refuses in-place redeploy',await reject(()=>C.profileBody(C.normalize(fixed).xml.replace(/<RuleCollection Type="Appx"[\s\S]*?<\/RuleCollection>/,''),cfg,adopted),/collection set/));
 const encoded=JSON.parse(JSON.stringify(profile));encoded.omaSettings[0]['@odata.type']='#microsoft.graph.omaSettingStringXml';encoded.omaSettings[0].value=Buffer.from(encoded.omaSettings[0].value).toString('base64');encoded.omaSettings[0].fileName='policy.xml';
 const encAdopt=C.adoption(encoded,[]),encBody=C.profileBody(fixed,cfg,encAdopt);
 ok('StringXml setting encoding and filename survive update',encBody.omaSettings[0]['@odata.type'].endsWith('StringXml')&&encBody.omaSettings[0].fileName==='policy.xml'&&Buffer.from(encBody.omaSettings[0].value,'base64').toString().startsWith('<RuleCollection'));
 let patchCount=0,createCount=0, reads=0;
 w.Graph.get=async(url)=>{reads++;return String(url).endsWith('/assignments')?{value:assignments}:profile;};w.Graph.hydrateOmaSettings=async(p)=>({profile:p,errors:[]});w.Graph.customProfiles=async()=>[profile];w.Graph.patch=async(url,payload)=>{patchCount++;profile={...profile,...payload,lastModifiedDateTime:'2026-10-07T01:00:00Z'};};w.Graph.createProfile=async(p)=>{createCount++;return {...p,id:'created'};};
 S.adopted=adopted;S.grouping=grouping;w.document.getElementById('ahName').value=profile.displayName;
 await T._test.prepare();ok('review does not write',patchCount===0&&createCount===0&&S.plan.kind==='update');
 S.backup=true;w.document.getElementById('ahReview').checked=true;w.document.getElementById('ahConfirm').value='ENFORCE';w.document.getElementById('ahPilot').value='PILOT-01 7 October: Microsoft apps tested successfully.';
 await T._test.apply();ok('enforced redeploy updates existing ID exactly once',patchCount===1&&createCount===0&&S.verified.id==='profile-a');
 ok('redeploy preserves assignments and grouping',S.verified.grouping===grouping&&assignments[0].target.groupId==='pilot-a'&&!S.pending);
 await T._test.prepare();profile.lastModifiedDateTime='2026-10-07T02:00:00Z';S.backup=true;w.document.getElementById('ahReview').checked=true;
 ok('fresh-read drift stops the write',await reject(T._test.apply,/changed after review/)&&patchCount===1);
 profile.lastModifiedDateTime='2026-10-07T01:00:00Z';S.adopted=C.adoption(profile,assignments);await T._test.prepare();S.backup=true;w.document.getElementById('ahReview').checked=true;
 w.Graph.patch=async()=>{patchCount++;throw new Error('timeout');};
 ok('write timeout leaves immutable pending outcome',await reject(T._test.apply,/timeout/)&&S.pending.id==='profile-a');
 ok('pending outcome blocks draft/source changes',await reject(()=>T._test.setXml(xml),/pending/));
 // Recovery only reads, never replays the PATCH.
 await T._test.recover();ok('recovery can verify an already applied update without retrying',patchCount===2&&!S.pending);
 const stamped=C.stampScript(fs.readFileSync(path.join(ROOT,'scripts/Get-TunoWeeklyAppLockerHarvest.ps1'),'utf8'),{SiteUrl:'https://t.sharepoint.com/sites/a',TenantId:'t',ClientId:'a',CertSubject:"CN=O'Neil",Folder:'Harvest',RetentionDays:30,ClientSecret:'value$literal'});
 ok('generated scripts preserve literal quoted credentials',stamped.includes("CertSubject    = 'CN=O''Neil'")&&stamped.includes("ClientSecret   = 'value$literal'"));
 // New creation and assignment are separate acts, with one grouping through
 // policy edits and the complete target list read back afterwards.
 S.adopted=null;w.document.getElementById('ahOperation').value='new';S.verified=null;S.grouping=C.newGrouping();T._test.setXml(C.normalize(fixed,'AuditOnly').xml);assignments=[];
 w.Graph.customProfiles=async()=>[];w.Graph.get=async(url)=>String(url).includes('/groups/')?{id:'pilot-new',displayName:'Pilot new',securityEnabled:true}:String(url).endsWith('/assignments')?{value:assignments}:profile;
 w.Graph.createProfile=async(body)=>{createCount++;profile={...body,id:'created',lastModifiedDateTime:'2026-10-07T03:00:00Z'};return profile;};
 await T._test.prepare();S.backup=true;w.document.getElementById('ahReview').checked=true;await T._test.apply();
 ok('new AuditOnly policy creates exactly one unassigned profile',createCount===1&&assignments.length===0&&S.verified.id==='created');
 S.picked={id:'pilot-new',displayName:'Pilot new'};w.Graph.assignProfile=async(id,groupId)=>{assignments=[{id:'assignment-new',target:{groupId,'@odata.type':'#microsoft.graph.groupAssignmentTarget'}}]};
 ok('assignment needs its own confirmation',await reject(T._test.assign,/displayed assignment/));
 w.document.getElementById('ahAssignReview').checked=true;await T._test.assign();ok('separate exact-group assignment is read back',assignments.length===1&&S.verified.assignments[0].target.groupId==='pilot-new');
 ok('already assigned policy cannot overwrite other targets',await reject(T._test.assign,/already has assignments/));
 // A timed-out POST may already exist: recover by exact name/grouping, no retry.
 S.adopted=null;w.document.getElementById('ahOperation').value='new';S.verified=null;S.grouping=C.newGrouping();assignments=[];await T._test.prepare();S.backup=true;w.document.getElementById('ahReview').checked=true;
 w.Graph.createProfile=async(body)=>{createCount++;profile={...body,id:'unknown-create',lastModifiedDateTime:'2026-10-07T04:00:00Z'};throw Error('timeout')};
 ok('timed-out creation retains grouping and prevents replay',await reject(T._test.apply,/timeout/)&&S.pending&&!S.pending.id);
 w.Graph.customProfiles=async()=>[profile];await T._test.recover();ok('unknown create resolves by exact ID without a duplicate POST',createCount===2&&S.verified.id==='unknown-create');
 S.adopted=null;w.document.getElementById('ahOperation').value='new';S.verified=null;S.grouping=C.newGrouping();w.Graph.customProfiles=async()=>[];await T._test.prepare();S.backup=true;w.document.getElementById('ahReview').checked=true;
 w.Graph.createProfile=async()=>{throw Object.assign(Error('Forbidden'),{status:403})};ok('definite rejection permits a fresh explicit attempt, no unknown object',await reject(T._test.apply,/Forbidden/)&&!S.pending);
 // Local edits must remain possible in Demo, but never tenant writes.
 w.Graph.isDemo=()=>true;ok('demo refuses tenant writes',await reject(T._test.prepare,/Demo/));
 w.close();
});
