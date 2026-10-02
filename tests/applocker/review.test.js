// Device review regressions: synthetic evidence, no tenant traffic or writes.
const {suite}=require('../platformbaseline/harness');
const {boot,ok,head,run}=suite('applocker-review');
const rule=(type='Exe',condition='<FilePathCondition Path="%WINDIR%\\*"/>',sid='S-1-1-0',name='Windows')=>`<RuleCollection Type="${type}" EnforcementMode="AuditOnly"><FilePathRule Id="11111111-1111-1111-1111-111111111111" Name="${name}" UserOrGroupSid="${sid}" Action="Allow"><Conditions>${condition}</Conditions></FilePathRule></RuleCollection>`;
const xml=(...cols)=>`<AppLockerPolicy Version="1">${cols.join('')}</AppLockerPolicy>`;
const policy=xml(rule(),rule('Dll'));
const now=()=>new Date().toISOString();
const event=(path='C:\\Windows\\notepad.exe',extra={})=>({path,log:'Microsoft-Windows-AppLocker/EXE and DLL',verdict:'Allowed',eventId:8002,timeUtc:now(),userSid:'S-1-5-21-1',...extra});
const bundle=(name='DEVICE-A',entries=[event()])=>({schema:'tuno.applocker.scan/1',machine:{name,elevated:true,appIdentityService:'Running'},generator:{version:'1.14.0',generatedUtc:now()},scan:{roots:['C:\\Windows','C:\\ProgramData']},writablePaths:[],writableFiles:[],writableFilesChecked:true,artifacts:[],warnings:[],generatedPolicy:{auditXml:policy},effectivePolicy:{available:true,xml:policy,sources:{localGpo:true,mdm:[]}},events:{available:true,daysBack:7,sinceUtc:new Date(Date.now()-864e5).toISOString(),logsRead:['Microsoft-Windows-AppLocker/EXE and DLL'],summary:{total:entries.length,allowed:entries.length,audited:0,blocked:0},entries}});
const setup=(b=bundle())=>{const w=boot();w.confirm=()=>true;w.prompt=()=> 'Business owner approved this block';const H=w.AppLockerTool._harvest,R=w.AppLockerTool._review;H.importFile(JSON.stringify(b),'scan.json');H.afterImport();return {w,H,R,D:w.document};};
const txt=(D,id)=>D.getElementById(id).textContent;
run(async()=>{
head('evidence and drafts have separate lifecycles');
{
 const {w,H,R,D}=setup();
 ok('scan lands on overview',D.getElementById('alPaneEvidence').style.display!=='none'&&D.getElementById('alPanePolicy').style.display==='none');
 ok('no implicit draft',R.getState().policy===null);
 ok('observed events are readable without draft',txt(D,'alBreaks').includes('Allowed')&&txt(D,'alBreaks').includes('Current device policy'));
 ok('read-only snapshot displayed',txt(D,'alOverview').includes('Policy captured on the device'));
 ok('allowed-only scan never says no AppLocker events',!txt(D,'alScan').includes('No AppLocker events'));
 ok('evidence-only export works',R.markdown().includes('Not created'));
 R.createDraft('generated-audit');
 ok('explicit draft creation opens editor',!!R.getState().policy&&D.getElementById('alPanePolicy').style.display!=='none');
 const before=JSON.stringify(R.getState().policy);
 H.importFile(JSON.stringify(bundle('DEVICE-B')),'B.json');H.afterImport();
 ok('new scan preserves draft and provenance',before===JSON.stringify(R.getState().policy)&&R.getState().draftOrigin.includes('DEVICE-A'));
 ok('comparison keeps deployed Audit selection primary',txt(D,'alComparison').includes('Select the Audit policy you deployed'));
 w.confirm=()=>false;R.createDraft('effective');
 ok('cancelled replacement leaves draft intact',before===JSON.stringify(R.getState().policy));
 const bare=bundle();delete bare.generatedPolicy;delete bare.effectivePolicy;
 H.importFile(JSON.stringify(bare),'bare.json');H.afterImport();
 ok('bundle without any policy opens as evidence',R.getState().scan.sourceName==='bare.json');
}
head('source attribution and atomic import validation');
{
 const {H,R,D}=setup();
 const ev={schema:'tuno.applocker.events/1',machine:{name:'DEVICE-A',collectedUtc:'2026-09-20T15:00:00Z'},events:bundle().events};
 H.importFile(JSON.stringify(ev),'events.json');H.afterImport();
 ok('events uses its own collection time',txt(D,'alEvidence').includes('2026-09-20 15:00 UTC'));
 ev.machine.name='DEVICE-B';let rejected=false;try{H.importFile(JSON.stringify(ev),'wrong.json')}catch{rejected=true}
 ok('different-device events rejected atomically',rejected&&R.getState().eventsEvidence.sourceName==='events.json');
 H.importFile(JSON.stringify(bundle('DEVICE-C')),'C.json');H.afterImport();
 ok('scan refresh clears separate event source',R.getState().eventsEvidence===null);
 R.setExpectedHarvest({device:'DEVICE-C',file:'expected.json'});
 try{H.importFile(JSON.stringify(bundle('DEVICE-B')),'expected.json')}catch{}
 ok('guided harvest validates device',R.getState().scan.sourceName==='C.json');
 try{H.importFile(JSON.stringify(bundle('DEVICE-C')),'other.json')}catch{}
 ok('guided harvest validates selected filename',R.getState().scan.sourceName==='C.json');
 H.importFile(JSON.stringify(bundle('DEVICE-C')),'expected.json');H.afterImport();
 ok('matching guided bundle opens',R.getState().scan.sourceName==='expected.json');
 const bad=bundle();bad.effectivePolicy.xml='invalid';try{H.importFile(JSON.stringify(bad),'bad.json')}catch{}
 ok('malformed snapshot cannot partly replace evidence',R.getState().scan.sourceName==='expected.json');
}
head('business decisions and view filters');
{
 const {H,R,D,w}=setup(bundle('DEVICE-A',[event('C:\\Users\\Alex\\AppData\\Local\\Business\\app.exe')]));R.createDraft('generated-audit');
 ok('user application requires decision',R.fleetGapStats().gap===1&&txt(D,'alBreaks').includes('Would block'));
 ok('unsigned user path does not offer path allow',!D.querySelector('[data-brkfix]'));
 D.querySelector('[data-brkaccept]').click();
 ok('accepted block retains reason',R.fleetGapStats().accepted===1&&txt(D,'alBreaks').includes('Business owner'));
 H.importFile(JSON.stringify(bundle('DEVICE-B',[event('C:\\Users\\Alex\\AppData\\Local\\Business\\app.exe')])),'B.json');H.afterImport();
 ok('acceptance not reused on different device',R.fleetGapStats().gap===1&&R.fleetGapStats().accepted===0);
 ok('legacy global acceptance key unused',w.localStorage.getItem('tuno.t01.acceptedBreaks')===null);
}
{
 const {R,D}=setup(bundle('DEVICE-A',[event('C:\\Tools\\app.dll')]));R.createDraft('generated-audit');
 const a=R.fleetGapStats(),reason=R.readiness().reasons.join();
 ok('hidden governed DLL contributes a gap',a.gap===1);
 const t=D.getElementById('alHideDll');t.checked=false;t.dispatchEvent(new D.defaultView.Event('change',{bubbles:true}));
 ok('DLL display filter cannot change readiness',reason===R.readiness().reasons.join()&&R.fleetGapStats().gap===1);
}
head('unknown evidence never produces a green assessment');
{
 const {R,D}=setup(bundle('DEVICE-A',[]));R.createDraft('generated-audit');
 ok('empty logs are not readiness proof',!R.readiness().ready&&R.readiness().limits.some(x=>/No execution/.test(x)));
 ok('the status line carries the loop\'s Next, computed from state (10677); advanced review retains readiness',/Next: /.test(txt(D,'alStatus'))&&txt(D,'alBreaks').includes(R.readiness().label));
 ok('no competing audit loop',D.getElementById('alLoop').hidden);
}
{
 const b=bundle();b.warnings=['Event collection stopped at cap'];b.generator.generatedUtc='2020-01-01T00:00:00Z';const {R}=setup(b);
 ok('warnings remain readiness limitations',R.readiness().limits.includes(b.warnings[0]));
 ok('stale evidence explicitly identified',R.readiness().limits.some(x=>/older than 7/.test(x)));
}
head('predictions preserve unknown metadata and version bounds');
{
 const {R,H}=setup();
 const load=(x)=>{H.importFile(x,'policy.xml');H.afterImport()};
 const pub='<FilePublisherCondition PublisherName="Vendor" ProductName="Product" BinaryName="app.exe"><BinaryVersionRange LowSection="2.0.0.0" HighSection="3.0.0.0"/></FilePublisherCondition>';
 load(xml(rule('Exe',pub)));
 const e=event('C:\\Tools\\app.exe',{publisher:'Vendor',product:'Product',binary:'app.exe'});
 ok('missing required version stays unknown',R.draftVerdictForEvent(e).s==='unknown');
 ok('below-bound version blocked',R.draftVerdictForEvent({...e,version:'1.0.0.0'}).s==='blocked');
 ok('in-range version allowed',R.draftVerdictForEvent({...e,version:'2.2.0.0'}).s==='allowed');
 ok('above-bound version blocked',R.draftVerdictForEvent({...e,version:'4.0.0.0'}).s==='blocked');
 ok('missing product stays unknown',R.draftVerdictForEvent({...e,product:'',version:'2.2.0.0'}).s==='unknown');
 load(xml(rule('Exe','<FilePathCondition Path="%WINDIR%\\*"/>','S-1-5-21-99')));
 ok('unknown group membership stays unknown',R.draftVerdictForEvent(event()).s==='unknown');
}
head('tenant profile adoption preserves evidence and uses hydrated identity');
{
 const {w,R}=setup();w.Graph.customProfile=async()=>null;
 const p={id:'profile1',displayName:'Existing (AuditOnly)',omaSettings:[{omaUri:'./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/TestGrouping/EXE/Policy',value:rule()}]};
 await R.adoptTenantProfile(p);
 ok('profile adopted without undefined settings exception',!!R.getState().policy&&R.getState().draftOrigin.includes('Existing'));
 ok('device evidence retained on tenant adoption',R.getState().scan.machine.name==='DEVICE-A');
}
head('scenario switching never replaces the draft and respects export scope');
{
 const b=bundle('DEVICE-A',[event('C:\\Tools\\app.exe'),event('C:\\Tools\\module.dll')]);
 b.generatedPolicy.auditXml=xml(rule('Exe','<FilePathCondition Path="C:\\Tools\\*"/>'));
 const {R,D,w}=setup(b);
 const choose=(value)=>{const el=D.getElementById('alImpactSource');el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
 ok('device scenario evaluates before draft creation',txt(D,'alBreaks').includes('Would block')&&!R.getState().policy);
 choose('proposal');
 ok('proposal has independent EXE allow and omitted DLL',R.fleetGapStats(R.impactModel()).covered===1&&R.fleetGapStats(R.impactModel()).dll===1);
 ok('scenario changes do not implicitly create a draft',R.getState().policy===null);
 R.createDraft('effective');const before=JSON.stringify(R.getState().policy);
 choose('proposal');
 ok('switching after editing preserves draft exactly',before===JSON.stringify(R.getState().policy));
 ok('read-only scenario cannot record business decisions',!D.querySelector('[data-brkaccept]')&&!D.querySelector('[data-brkfix]'));
 choose('intune');
 ok('Intune scenario omits DLL carried by draft',!R.impactModel().collections.some(c=>c.type==='Dll')&&R.getState().policy.collections.some(c=>c.type==='Dll'));
 ok('export scenario explains remaining device policy sources',txt(D,'alBreaks').includes('merged device policy'));
 choose('draft');
 ok('draft scenario restores editable decisions',!!D.querySelector('[data-brkaccept]'));
 const g=R.fleetGapStats().gap;const filter=D.getElementById('alImpactFilter');filter.value='covered';filter.dispatchEvent(new w.Event('change',{bubbles:true}));
 ok('view filter never changes assessment totals',R.fleetGapStats().gap===g);
}
head('add, remove and undo update predictions while preserving original evidence');
{
 const {R,D,w}=setup(bundle('DEVICE-A',[event('C:\\Tools\\app.exe')]));R.createDraft('generated-audit');
 const original=R.getState().scan.generatedPolicy.auditXml;
 D.getElementById('alNewPath').value='C:\\Tools\\app.exe';D.getElementById('alNewName').value='Approved business app';D.getElementById('alNewAdd').click();
 ok('add rule changes impact immediately',R.fleetGapStats().gap===0&&R.fleetGapStats().covered===1);
 ok('manual add is undoable',D.getElementById('alUndo').textContent.includes('added'));
 const added=R.getState().policy.collections.find(c=>c.type==='Exe').rules.find(r=>r.name==='Approved business app');
 D.querySelector(`[data-id="${added.id}"].al-del`).click();
 ok('removal restores the predicted block',R.fleetGapStats().gap===1);
 D.getElementById('alUndo').click();
 ok('undo restores removed rule and allow prediction',R.fleetGapStats().gap===0);
 ok('source bundle was never modified',original===R.getState().scan.generatedPolicy.auditXml);
 D.querySelector('[data-review-impact="draft"]').click();
 ok('check changes button opens impact screen',D.getElementById('alPaneBreaks').style.display!=='none');
 D.querySelector('[data-alscreen="deploy"]').click();
 ok('deployment is a separate explicit step',D.getElementById('alPaneDeploy').style.display!=='none'&&D.getElementById('alPanePolicy').style.display==='none');
}
head('partial tenant reads and signed-file metadata cannot fabricate coverage');
{
 const {w,R,H}=setup();w.Graph.customProfile=async()=>null;
 let rejected=false;
 try {await R.adoptTenantProfile({id:'partial',displayName:'Partial',omaSettings:[{omaUri:'./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/G/EXE/Policy',value:rule()},{omaUri:'./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/G/MSI/Policy',isEncrypted:true}]});} catch{rejected=true;}
 ok('partially unread profile refused atomically',rejected&&R.getState().policy===null);
 H.importFile(xml(rule('Exe','<FilePublisherCondition PublisherName="*" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition>')),'publisher.xml');H.afterImport();
 ok('explicit unsigned file never matches wildcard publisher',R.draftVerdictForEvent(event('C:\\Tools\\app.exe',{signed:false})).s==='blocked');
 ok('EXE enforcement without packaged rules flags packaged applications',R.draftVerdictForEvent(event('Package',{log:'Microsoft-Windows-AppLocker/Packaged app-Execution'})).s==='blocked');
}

head('readiness verifies the rules actually audited, not just the profile name');
{
 const {w,R,H,D}=setup();R.createDraft('generated-audit');
 const profile=w.AppLockerTool._diff.intuneProfile('Audit');profile.id='audit';profile.lastModifiedDateTime=new Date(Date.now()-2*864e5).toISOString();
 H.deployState().checked={tenantAppLocker:[profile]};
 ok('identical readable audit content is recognized',R.readiness().auditMatches);
 D.getElementById('alNewPath').value='C:\\Extra\\*';D.getElementById('alNewName').value='New after audit';D.getElementById('alNewAdd').click();
 ok('editing invalidates audited-content gate',!R.readiness().auditMatches&&R.readiness().reasons.some(x=>/differs from/.test(x)));
 D.getElementById('alUndo').click();profile.lastModifiedDateTime=new Date().toISOString();
 ok('pre-change event window cannot establish pilot readiness',R.readiness().reasons.some(x=>/complete pilot window/.test(x)));
 profile.omaSettings[0].value='';
 ok('AuditOnly in profile name cannot replace unread values',!R.readiness().auditMatches&&!R.readiness().ready);
}

});
