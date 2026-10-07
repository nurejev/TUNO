const {suite}=require('../platformbaseline/harness'),{ok,run,fs,path,ROOT}=suite('T29 helpers and session safety'),{JSDOM}=require('jsdom');
function boot(){const w=new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{runScripts:'outside-only',url:'https://nurejev.github.io/tuno-beta/'}).window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};w.eval(['version.js','msappcatalog.js','demo.js','graph.js','applocker.js','applocker-harvest-core.js','applocker-harvest.js'].map(f=>fs.readFileSync(path.join(ROOT,'js',f),'utf8')).join('\n;\n')+';Object.assign(window,{C:AppLockerHarvestCore,T:AppLockerHarvestTool,Graph});');w.Graph.signedIn=()=>true;w.Graph.isDemo=()=>false;w.fetch=async(url)=>({ok:true,text:async()=>fs.readFileSync(path.join(ROOT,String(url).split('?')[0]),'utf8')});w.T.init();return w;}
const reject=async(fn,rx)=>{try{await fn();return false}catch(e){return rx.test(e.message)}};
run(async()=>{
 const w=boot(),T=w.T,C=w.C,S=T._test.state(),D=w.document;D.getElementById('ahHelperKind').value='cleanup';D.getElementById('ahHelperId').value='helper-a';
 let previous={id:'helper-a',displayName:'Existing clear helper',lastModifiedDateTime:'2026-10-07T00:00:00Z',detectionScriptContent:'old-detect',remediationScriptContent:'old-clear'},assignments=[{id:'a',target:{groupId:'pilot'},runRemediationScript:true,runSchedule:{interval:1,'@odata.type':'#microsoft.graph.deviceHealthScriptDailySchedule'}}],writes=0;
 w.Graph.remediations=async()=>[previous];w.Graph.get=async(url)=>String(url).endsWith('/assignments')?{value:assignments}:previous;
 w.Graph.updateRemediation=async(id,body)=>{writes++;previous={...previous,...body,lastModifiedDateTime:'2026-10-07T01:00:00Z'}};
 await T._test.prepareHelper();ok('helper review reads both actual scripts before write',S.helperPlan.body.detectionScriptContent&&S.helperPlan.body.remediationScriptContent&&writes===0);
 D.getElementById('ahHelperReview').checked=true;
 ok('existing helper update requires rollback snapshot',await reject(T._test.applyHelper,/snapshot/)&&writes===0);
 S.helperBackup=true;await T._test.applyHelper();ok('helper update retains immutable ID and schedule, read-back verified',writes===1&&!S.helperPending&&D.getElementById('ahHelperId').value==='helper-a'&&assignments[0].runSchedule.interval===1);
 await T._test.prepareHelper();S.helperBackup=true;D.getElementById('ahHelperReview').checked=true;previous.lastModifiedDateTime='2026-10-07T02:00:00Z';ok('changed helper stops update before write',await reject(T._test.applyHelper,/changed after review/)&&writes===1);
 previous.lastModifiedDateTime='2026-10-07T01:00:00Z';await T._test.prepareHelper();S.helperBackup=true;D.getElementById('ahHelperReview').checked=true;
 w.Graph.updateRemediation=async()=>{writes++;throw Error('timeout')};ok('helper write timeout retains pending state',await reject(T._test.applyHelper,/timeout/)&&S.helperPending.id==='helper-a');
 ok('helper pending write blocks another review',await reject(T._test.prepareHelper,/pending/));await T._test.recoverHelper();ok('helper recovery never replays update',writes===2&&!S.helperPending);
 // New enforced policy may deliberately omit a catalog app, but the review
 // must record each gap instead of asserting all apps work.
 const xml=C.normalize(fs.readFileSync(path.join(ROOT,'templates/applocker/AppLockerRules-Audit-R27.1-v1.0.xml'),'utf8')).xml;T._test.setXml(xml);
 w.Graph.customProfiles=async()=>[];await T._test.prepare();ok('Microsoft coverage gap is explicit in enforced review',S.plan.gaps.some(x=>x.includes('per-user')));
 S.backup=true;D.getElementById('ahReview').checked=true;D.getElementById('ahConfirm').value='ENFORCE';D.getElementById('ahPilot').value='Pilot apps were tested on PILOT-01.';
 ok('unresolved catalog gap stops enforcement',await reject(T._test.apply,/every Microsoft/) && !S.pending);
 // The in-flight reader cannot contaminate the next session.
 let resolve;w.Graph.get=()=>new Promise(r=>{resolve=r});const pending=T._test.snapshot('old-tenant');w.dispatchEvent(new w.CustomEvent('tuno:signout'));resolve({value:[]});
 ok('sign-out discards an old session response',await reject(()=>pending,/Session changed/));
 ok('sign-out clears IDs, results and secret',!T._test.state().adopted&&!T._test.state().pending&&T._test.state().bundles.length===0&&D.getElementById('ahClientSecret').value==='');
 ok('new tool belongs to project workspace under T29',D.getElementById('toolAppLockerHarvest').dataset.ws==='projects'&&D.getElementById('toolAppLockerHarvest').textContent.includes('P-2715'));
 w.close();
});
