const {suite}=require('../platformbaseline/harness');
const {ok,run,fs,path,ROOT}=suite('T29 approved layout and real deployment controls');
const {JSDOM}=require('jsdom');
function boot(){
 const w=new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{runScripts:'outside-only',url:'https://nurejev.github.io/tuno-beta/'}).window;
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(ROOT,'css/app.css'),'utf8')+'\n'+fs.readFileSync(path.join(ROOT,'css/applocker-harvest.css'),'utf8');w.document.head.append(style);
 w.eval(['version.js','msappcatalog.js','demo.js','graph.js','applocker.js','applocker-harvest-core.js','applocker-harvest.js'].map(f=>fs.readFileSync(path.join(ROOT,'js',f),'utf8')).join('\n;\n')+';Object.assign(window,{C:AppLockerHarvestCore,T:AppLockerHarvestTool,Graph});');
 w.Graph.signedIn=()=>true;w.Graph.isDemo=()=>false;w.T.init();return w;
}
run(async()=>{
 const w=boot(),D=w.document,S=w.T._test.state(),el=id=>D.getElementById(id),edit=(id,value)=>{el(id).value=value;el(id).dispatchEvent(new w.Event('input',{bubbles:true}));},change=(id,value)=>{el(id).value=value;el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
 async function click(id){el(id).click();for(let n=0;n<100&&S.busy;n++)await new Promise(r=>setTimeout(r,1));if(S.busy)throw Error('UI action did not finish: '+id);}
 ok('approved deployment workspace opens first',S.tab==='deploy'&&!D.querySelector('[data-ah-pane="deploy"]').hidden&&D.querySelector('[data-ah-pane="results"]').hidden);
 ok('approved separate configuration, verification and review panels',el('ahOperation').closest('.ah-panel')!==el('ahVerification').closest('.ah-panel')&&el('ahApply').closest('#ahReviewPanel'));
 ok('pending recovery controls are actually invisible',w.getComputedStyle(el('ahRecover')).display==='none'&&w.getComputedStyle(el('ahHelperRecover')).display==='none');
 const source=fs.readFileSync(path.join(ROOT,'templates/applocker/AppLockerRules-Audit-R27.1-v1.0.xml'),'utf8');w.T._test.setXml(source,'AppLockerRules-Audit-R27.1-v1.0.xml');
 let profile,posts=0,patches=0,assignments=[];
 w.Graph.customProfiles=async()=>profile?[profile]:[];w.Graph.hydrateOmaSettings=async(p)=>({profile:p,errors:[]});w.Graph.get=async(url)=>String(url).endsWith('/assignments')?{value:assignments}:profile;
 w.Graph.createProfile=async(body)=>{posts++;profile={...body,id:'created-profile',lastModifiedDateTime:'2026-10-07T12:00:00Z'};return profile;};w.Graph.patch=async(url,p)=>{patches++;profile={...profile,...p,lastModifiedDateTime:'2026-10-07T13:00:00Z'};};
 const grouping=S.grouping;
 await click('ahDeployReview');ok('Deploy to Intune opens review without writing',S.plan&&!el('ahReviewPanel').hidden&&posts===0&&el('ahReady').textContent.includes('snapshot'));
 el('ahReview').checked=true;el('ahReview').dispatchEvent(new w.Event('change'));edit('ahConfirm','ENFORCE');edit('ahPilot','justified');
 ok('screen example cannot falsely enable before snapshot and gap disposition',el('ahApply').disabled&&el('ahReady').textContent.includes('every Microsoft'));
 await click('ahBackup');ok('snapshot click leaves Apply blocked on the actual missing requirement',S.backup&&el('ahApply').disabled&&!el('ahBackup').disabled);
 edit('ahCoverageDisposition','excluded');ok('short nonempty pilot and disposition accepted with explicit enforcement',!el('ahApply').disabled);
 edit('ahPilot','  ');ok('empty pilot immediately disables action with visible reason',el('ahApply').disabled&&el('ahReady').textContent.includes('completed pilot'));
 edit('ahPilot','justified');edit('ahConfirm','enforce');ok('confirmation remains exact and visible',el('ahApply').disabled&&el('ahReady').textContent.includes('ENFORCE'));edit('ahConfirm','ENFORCE');
 await click('ahApply');ok('real click wrapper creates and verifies exactly once',posts===1&&S.verified.id==='created-profile'&&!S.pending&&!S.busy);
 ok('successful read-back stays next to deployment controls',!el('ahDeployStatus').hidden&&el('ahDeployStatus').textContent.includes('read-back verified')&&el('ahStatus').hidden);
 ok('existing ID and grouping retained by controls',el('ahOperation').value==='update'&&S.grouping===grouping&&el('ahNewGrouping').disabled);
 await click('ahTabPolicy');await click('ahRuleEditor');const oldId=el('ahRule').value,exceptionCount=w.C.inspect(S.xml).doc.querySelectorAll('Exceptions > *').length;
 edit('ahRuleName','Reviewed name');await click('ahTabDeploy');await click('ahPrepare');ok('unsaved rule edit blocks review beside the form',el('ahDeployStatus').textContent.includes('Save the rule')&&posts===1);
 await click('ahTabPolicy');await click('ahSaveDraft');ok('approved field editor saves while preserving ID and exceptions',w.C.inspect(S.xml).doc.querySelectorAll('Exceptions > *').length===exceptionCount&&w.C.inspect(S.xml).model.collections.flatMap(c=>c.rules).some(r=>r.id===oldId&&r.name==='Reviewed name'));
 await click('ahTabDeploy');await click('ahPrepare');await click('ahBackup');el('ahReview').checked=true;el('ahReview').dispatchEvent(new w.Event('change'));edit('ahConfirm','ENFORCE');
 w.Graph.patch=async()=>{patches++;throw Object.assign(Error('Forbidden'),{status:403});};await click('ahApply');
 ok('failed real deployment shows local error and restores retry controls',patches===1&&!S.pending&&!el('ahApply').disabled&&el('ahDeployStatus').textContent==='Forbidden');
 w.Graph.patch=async(url,p)=>{patches++;profile={...profile,...p};throw Error('Connection lost');};await click('ahApply');
 ok('unknown write shows recovery, prevents another write',S.pending&&el('ahApply').disabled&&!el('ahRecover').hidden&&w.getComputedStyle(el('ahRecover')).display!=='none'&&el('ahDeployStatus').textContent==='Connection lost');
 await click('ahRecover');ok('real recovery reads without replaying PATCH',patches===2&&!S.pending&&S.verified.id==='created-profile'&&w.getComputedStyle(el('ahRecover')).display==='none');
 await click('ahNewPolicy');change('ahDeployMode','AuditOnly');for(let n=0;n<100&&S.busy;n++)await new Promise(r=>setTimeout(r,1));edit('ahName','New audit profile');await click('ahPrepare');await click('ahBackup');el('ahReview').checked=true;el('ahReview').dispatchEvent(new w.Event('change'));
 ok('AuditOnly skips enforcement fields and uses a new grouping',!S.plan.enforced&&el('ahEnforceGate').hidden&&!el('ahApply').disabled&&S.grouping!==grouping);
 await click('ahTabResults');ok('weekly overview has three approved summary cards with real predictions',el('ahResults').querySelectorAll('.ah-kpis > div').length===3&&el('ahResults').textContent.includes('10 / 11')&&el('ahResults').textContent.includes('Assigned fleet count unknown'));
 await click('ahTabCoverage');await click('ahPublisherAdd');ok('coverage action errors stay visible in the coverage area',!el('ahCoverageStatus').hidden&&el('ahCoverageStatus').textContent.length>0);
 w.dispatchEvent(new w.CustomEvent('tuno:signout'));ok('sign-out clears new editor and operation state',el('ahRuleFields').hidden&&el('ahOperation').value==='new'&&el('ahSourceMode').textContent==='—');w.fetch=async()=>({ok:true,text:async()=>source});await w.T.open();ok('opening after sign-in reloads supplied XML locally with DLL omitted',w.C.inspect(w.T._test.state().xml).rules===27&&!w.T._test.state().xml.includes('Type="Dll"')&&w.T._test.state().source.includes('Audit'));w.close();
});
