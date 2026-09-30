const {suite}=require('../platformbaseline/harness');
const {boot,ok,head,run}=suite('applocker-audit-workflow');
const clone=x=>JSON.parse(JSON.stringify(x));
const col=(type='Exe',mode='AuditOnly')=>`<RuleCollection Type="${type}" EnforcementMode="${mode}"><FilePathRule Id="00000000-0000-0000-0000-000000000001" Name="Windows" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%WINDIR%\\*"/></Conditions></FilePathRule></RuleCollection>`;
const profile=()=>({id:'selected-id',displayName:'Existing Audit v1',lastModifiedDateTime:'2026-09-01T00:00:00Z',omaSettings:[{displayName:'EXE',omaUri:'./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/OriginalGrouping/EXE/Policy',value:col()},{displayName:'DLL',omaUri:'./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/OriginalGrouping/DLL/Policy',value:col('Dll')}]});
const ev=(path,extra={})=>({path,verdict:'Audited',log:'Microsoft-Windows-AppLocker/EXE and DLL',userSid:'S-1-5-21-1',timeUtc:new Date().toISOString(),...extra});
const bundle=()=>({schema:'tuno.applocker.scan/1',machine:{name:'DEVICE-A',elevated:true},generator:{generatedUtc:new Date().toISOString()},scan:{roots:['C:\\Windows','C:\\ProgramData']},writableFilesChecked:true,writableFiles:[],artifacts:[{path:'C:\\Unobserved\\inventory-only.exe'}],effectivePolicy:{available:true,xml:`<AppLockerPolicy Version="1">${col()}${col('Dll')}</AppLockerPolicy>`,sources:{mdm:[{grouping:'OriginalGrouping',types:['EXE','DLL']}]}},generatedPolicy:{auditXml:`<AppLockerPolicy Version="1">${col().replace('%WINDIR%','C:\\UnrelatedGeneratedBaseline')}</AppLockerPolicy>`},events:{available:true,daysBack:7,sinceUtc:'2026-09-20T00:00:00Z',logsRead:['EXE and DLL'],entries:[ev('C:\\Business\\app.exe',{hash:'0xAA',signed:false}),ev('C:\\Windows\\ok.exe',{verdict:'Allowed'})],summary:{total:2,audited:1,allowed:1,blocked:0}}});
function setup(){const w=boot();w.confirm=()=>true;let live=profile(),writes=[];w.Graph.tenantId=()=> 'tenant-a';w.Graph.hydrateOmaSettings=async p=>({profile:clone(p)});w.Graph.get=async()=>clone(live);w.Graph.customProfiles=async()=>[clone(live)];w.Graph.patch=async(path,body,opts)=>{writes.push({path,body:clone(body),opts});live={...live,...clone(body),lastModifiedDateTime:'2026-09-29T10:00:00Z'}};const A=w.AppLockerTool._audit,R=w.AppLockerTool._review,H=w.AppLockerTool._harvest,D=w.document;H.importFile(JSON.stringify(bundle()),'scan.json');H.afterImport();return {w,A,R,H,D,writes,live:()=>live,setLive:p=>{live=p}}}
run(async()=>{
head('real-results loop starts at the deployed object');
{
 const {A,R,D,writes}=setup();await A.selectAuditProfile(profile());
 ok('selection preserves original ID and grouping',A.getState().reference.profile.id==='selected-id'&&A.getState().reference.grouping==='OriginalGrouping');
 ok('selection copies deployed rules, never the generated baseline',R.getState().policy.collections[0].rules[0].conditions[0].path==='%WINDIR%\\*');
 ok('selection lands on results',D.getElementById('alPaneAudit').style.display!=='none');
 ok('suggestion controls are enabled after the read finishes',D.querySelector('[data-audit-pick]')&&!D.querySelector('[data-audit-pick]').disabled);
 ok('scan receipt checks reference rules and grouping',A.auditReceipt().includes('reference rules are present'));
 const rows=A.auditResultRows();ok('inventory-only file not a suggestion',rows.length===2&&!rows.some(x=>x.row.path.includes('inventory-only')));
 ok('no changes or writes without selection',!A.getState().plan&&writes.length===0&&R.getState().policy.collections[0].rules.length===1);
 A.select([rows.find(x=>x.after.s==='blocked').key]);A.applyAuditSelections();
 ok('selected evidence adds rule only to working copy',R.getState().policy.collections[0].rules.length===2&&A.getState().reference.model.collections[0].rules.length===1);
 ok('proposed change now covers observed application',A.auditResultRows()[0].after.s==='allowed');
 ok('existing DLL collection is preserved by Audit update',A.auditBody().omaSettings.some(x=>x.omaUri.includes('/DLL/')));
 await A.prepareAuditUpdate();ok('fresh comparison previews addition without writing',A.getState().plan.delta.added===1&&writes.length===0);
 await A.writeAuditUpdate();
 ok('one PATCH addresses the same immutable ID',writes.length===1&&writes[0].path.endsWith('/selected-id'));
 ok('update touches only policy settings',Object.keys(writes[0].body).join()==='omaSettings');
 ok('all submitted collections remain AuditOnly',writes[0].body.omaSettings.every(x=>x.value.includes('EnforcementMode="AuditOnly"')));
 ok('grouping URIs unchanged',writes[0].body.omaSettings.every(x=>x.omaUri.includes('/OriginalGrouping/')));
 ok('verified update asks for new scan, never claims device receipt',A.getState().message.includes('updated and verified')&&A.getState().message.includes('Device receipt is not yet verified'));
 ok('original scan is unchanged',R.getState().scan.events.entries.length===2);
}
head('changes, unread values and errors stop unintended updates');
{
 const {A,w,writes,setLive}=setup();await A.selectAuditProfile(profile());A.select([A.auditResultRows()[0].key]);A.applyAuditSelections();await A.prepareAuditUpdate();
 const changed=profile();changed.lastModifiedDateTime='2026-09-28T00:00:00Z';setLive(changed);await A.writeAuditUpdate();
 ok('drift after preview prevents PATCH',writes.length===0&&A.getState().message.includes('changed after comparison'));
}
{
 const {A,w,writes}=setup();await A.selectAuditProfile(profile());A.select([A.auditResultRows()[0].key]);A.applyAuditSelections();await A.prepareAuditUpdate();w.Graph.tenantId=()=> 'tenant-b';await A.writeAuditUpdate();
 ok('tenant change prevents PATCH',writes.length===0&&A.getState().message.includes('tenant or draft changed'));
}
{
 const {A,w,writes}=setup();await A.selectAuditProfile(profile());A.select([A.auditResultRows()[0].key]);A.applyAuditSelections();await A.prepareAuditUpdate();w.confirm=()=>false;await A.writeAuditUpdate();
 ok('cancelled confirmation sends no write',writes.length===0);
}
{
 const {A,w,writes}=setup();const p=profile();p.displayName='Misleading AuditOnly';p.omaSettings[0].value=col('Exe','Enabled');let rejected=false;try{await A.selectAuditProfile(p)}catch{rejected=true}
 ok('mode is read from values, not name',rejected&&!A.getState().reference);
 p.omaSettings[0].value='';rejected=false;try{await A.selectAuditProfile(p)}catch{rejected=true}ok('unread values cannot establish reference',rejected&&!A.getState().reference);
}
{
 const {A,w,writes}=setup();await A.selectAuditProfile(profile());A.select([A.auditResultRows()[0].key]);A.applyAuditSelections();await A.prepareAuditUpdate();w.Graph.patch=async(path,body)=>{writes.push({path,body});w.Graph.get=async()=>{throw new Error('read-back unavailable')}};await A.writeAuditUpdate();
 ok('failed read-back distinguishes sent from verified',writes.length===1&&A.getState().message.includes('Update was sent, but verification is incomplete'));
}
{
 const {A}=setup();const p=profile();p.omaSettings[0].value=p.omaSettings[0].value.replace('</RuleCollection>','<RuleCollectionExtensions/></RuleCollection>');let rejected=false;try{await A.selectAuditProfile(p)}catch{rejected=true}
 ok('unsupported XML extensions cannot be silently discarded',rejected&&!A.getState().reference);
}
{
 const {A,D}=setup();await A.selectAuditProfile(profile());
 ok('results default to differences and expose other categories',D.querySelector('[data-audit-filter]').value==='needed'&&D.querySelector('[data-audit-filter]').textContent.includes('Outside selected collections'));
}
head('Intune XML representations and actionable read errors');
for(const kind of ['declaration','wrapper','binary','decrypted-binary']) {
 const {A,R,setLive,writes}=setup(),p=profile();
 p.omaSettings[0].value=col().replace('Name="Windows"','Name="Café &amp; Tools"');
 if(kind==='declaration') p.omaSettings[0].value='\ufeff<?xml version="1.0" encoding="utf-8"?>\n'+p.omaSettings[0].value;
 if(kind==='wrapper') p.omaSettings[0].value=`<AppLockerPolicy Version="1">${p.omaSettings[0].value}</AppLockerPolicy>`;
 if(kind.includes('binary')) {p.omaSettings[0]['@odata.type']='#microsoft.graph.omaSettingStringXml';p.omaSettings[0].fileName='Original.xml';if(kind==='binary')p.omaSettings[0].value=Buffer.from(p.omaSettings[0].value).toString('base64');}
 setLive(p);await A.selectAuditProfile(p);
 ok(kind+' opens deployed rules without losing Unicode',R.getState().policy.collections[0].rules[0].name==='Café & Tools');
 A.select([A.auditResultRows()[0].key]);A.applyAuditSelections();await A.prepareAuditUpdate();await A.writeAuditUpdate();
 ok(kind+' completes verified same-profile update',writes.length===1&&A.getState().message.includes('updated and verified'));
 if(kind.includes('binary'))ok(kind+' preserves XML setting type, filename and UTF8 encoding',writes[0].body.omaSettings[0]['@odata.type']==='#microsoft.graph.omaSettingStringXml'&&writes[0].body.omaSettings[0].fileName==='Original.xml'&&Buffer.from(writes[0].body.omaSettings[0].value,'base64').toString('utf8').includes('Café'));
}
{
 const {A}=setup(),p=profile();p.omaSettings[0].value=null;p.omaSettings[0]._decryptError='Permission denied';let message='';try{await A.selectAuditProfile(p)}catch(e){message=e.message}
 ok('decryption failure names setting and actual reason',message.includes('EXE')&&message.includes('Permission denied'));
 p.omaSettings[0]._decryptError=null;p.omaSettings[0].value='<AppLockerPolicy Version="1">'+col()+col('Msi')+'</AppLockerPolicy>';message='';try{await A.selectAuditProfile(p)}catch(e){message=e.message}
 ok('ambiguous multi-collection wrapper remains blocked',message.includes('exactly one collection'));
}
{
 const w=boot(),p=profile();w.confirm=()=>true;w.Graph.tenantId=()=> 'tenant-a';p.omaSettings[0].isEncrypted=true;p.omaSettings[0].value='PGEvPg==';let reads=0;
 w.Graph.get=async()=>{const full=clone(p);full.omaSettings[0].secretReferenceValueId='secret-a';return full};
 w.Graph.omaSettingPlainText=async(id,secret)=>{reads++;if(id!=='selected-id'||secret!=='secret-a')throw new Error('wrong reference');return col()};
 await w.AppLockerTool._audit.selectAuditProfile(p);
 ok('encrypted placeholder survives detail read but still forces plaintext retrieval',reads===1&&w.AppLockerTool._review.getState().policy.collections[0].rules.length===1&&p.omaSettings[0].value==='PGEvPg==');
}
head('masked values (****) are fetched, never parsed (10641)');
{
 const w=boot(),p=profile();w.confirm=()=>true;w.Graph.tenantId=()=> 'tenant-a';p.omaSettings.forEach(x=>{x.value='****';x.isEncrypted=false});let reads=0,gets=0;
 w.Graph.get=async()=>{gets++;const full=clone(p);full.omaSettings.forEach((x,i)=>x.secretReferenceValueId='secret-'+i);return full};
 w.Graph.omaSettingPlainText=async(id,secret)=>{reads++;const i=+secret.split('-')[1];return profile().omaSettings[i].value};
 await w.AppLockerTool._audit.selectAuditProfile(p);
 ok('mask with isEncrypted false still forces the single-profile re-read',gets===1);
 ok('every masked collection is fetched through its secret reference',reads===p.omaSettings.length);
 ok('masked profile opens with its real rules',w.AppLockerTool._review.getState().policy.collections[0].rules.length===1&&!w.AppLockerTool._audit.getState().readDiagnostic);
 ok('masked value helper recognises only asterisks',w.Graph.isMaskedOmaValue('****')&&w.Graph.isMaskedOmaValue(' ** ')&&!w.Graph.isMaskedOmaValue('<a/>')&&!w.Graph.isMaskedOmaValue('')&&!w.Graph.isMaskedOmaValue(null));
}
{
 const w=boot(),p=profile();w.confirm=()=>true;w.Graph.tenantId=()=> 'tenant-a';p.omaSettings[0].value='****';p.omaSettings[0].isEncrypted=false;let reads=0;
 w.Graph.get=async()=>clone(p);w.Graph.omaSettingPlainText=async()=>{reads++;return ''};
 let message='';try{await w.AppLockerTool._audit.selectAuditProfile(p)}catch(e){message=e.message}
 const report=w.AppLockerTool._audit.getState().readDiagnostic;
 ok('mask without a secret reference is named as a mask, not invalid XML',message.includes('masked')&&!message.includes('not valid XML')&&reads===0);
 ok('diagnostic records mask, missing reference and the read error',report&&report.schema==='tuno.applocker.read-diagnostic/2'&&report.settings[0].masked===true&&report.settings[0].hasSecretReference===false&&/masked/.test(report.settings[0].readError||''));
}
head('custom-profile values are read on beta, never v1.0 (10645)');
{
 const w=boot(),p=profile();w.confirm=()=>true;w.Graph.tenantId=()=> 'tenant-a';p.omaSettings.forEach(x=>{x.value='****'});const paths=[];
 w.Graph.get=async(path)=>{paths.push(path);const full=clone(p);full.omaSettings.forEach((x,i)=>{x.isEncrypted=true;x.secretReferenceValueId='secret-'+i});return full};
 w.Graph.omaSettingPlainText=async(id,secret)=>profile().omaSettings[+secret.split('-')[1]].value;
 await w.AppLockerTool._audit.selectAuditProfile(p);
 ok('single-profile re-read goes to beta',paths.length===1&&paths[0]==='https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations/selected-id');
 ok('profile URL helper is beta for every caller',w.Graph.profileUrl('a b')==='https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations/a%20b');
 ok('profile list reads beta, paged',/readAll\(/.test(String(w.Graph.customProfiles))&&/beta: true/.test(String(w.Graph.customProfiles)));
 ok('plain-text value read goes through the beta profile URL',/profileUrl\(profileId\)/.test(String(boot().Graph.omaSettingPlainText)));
}
{
 const {A,w}=setup();const paths=[];const g=w.Graph.get;w.Graph.get=async(path,o)=>{paths.push(path);return g(path,o)};
 await A.selectAuditProfile(profile());A.select([A.auditResultRows()[0].key]);A.applyAuditSelections();await A.prepareAuditUpdate();
 ok('audit-update read-back reads beta',paths.length>0&&paths.every(x=>x.indexOf('https://graph.microsoft.com/beta/deviceManagement/deviceConfigurations/')===0));
}
head('failed-read diagnostic preserves evidence without unrelated settings');
{
 const {A,D,writes}=setup(),p=profile();p.omaSettings[0].value='&lt;RuleCollection Type="Exe" /&gt;';p.omaSettings[0].secretReferenceValueId='must-not-export';p.accessToken='must-not-export-token';
 let failed=false;try{await A.selectAuditProfile(p)}catch{failed=true}
 const report=A.getState().readDiagnostic;
 ok('invalid returned value remains rejected; no policy write',failed&&!A.getState().reference&&writes.length===0);
 ok('diagnostic retains exact failed raw value and setting metadata',report.settings.length===1&&report.settings[0].value===p.omaSettings[0].value&&report.settings[0].displayName==='EXE'&&report.settings[0].valueType==='string');
 ok('diagnostic omits good collection, tokens and secret-reference fields',!JSON.stringify(report).includes('must-not-export')&&!report.settings.some(s=>s.displayName==='DLL'));
 ok('failed read offers explicit diagnostic download',!!D.querySelector('[data-audit-diagnostic]'));
 await A.selectAuditProfile(profile());ok('successful selection clears obsolete diagnostic',!A.getState().readDiagnostic&&!D.querySelector('[data-audit-diagnostic]'));
}
head('two workspaces keep independent policies and evidence');
{
 const {A,R,D}=setup();await A.selectAuditProfile(profile());const before=JSON.stringify(R.getState().policy);
 A.switchWorkspace('create');ok('create workspace starts independently',!R.getState().policy&&!R.getState().scan&&!A.getState().reference);
 D.querySelector('[data-build-new]').click();ok('first draft starts in AuditOnly',R.getState().policy.collections.every(c=>c.mode==='AuditOnly'));
 D.getElementById('alNewPath').value='C:\\NewPolicy\\*';D.getElementById('alNewAdd').click();const created=JSON.stringify(R.getState().policy);
 A.switchWorkspace('improve');ok('analyze workspace restores its deployed reference and scan',JSON.stringify(R.getState().policy)===before&&R.getState().scan.machine.name==='DEVICE-A'&&A.getState().reference.profile.id==='selected-id');
 A.switchWorkspace('create');ok('new-policy draft restored separately',JSON.stringify(R.getState().policy)===created&&!A.getState().reference);
}
});
