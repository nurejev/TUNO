const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const found=spawnSync('pwsh',['-NoProfile','-Command','$PSVersionTable.PSVersion.ToString()'],{encoding:'utf8'});
if(found.error&&found.error.code==='ENOENT'){console.log('SKIPPED: PowerShell collector contract (pwsh unavailable). Windows acceptance remains pending.');process.exit(0);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'t29-weekly-'));
try{const r=spawnSync('pwsh',['-NoProfile','-File',path.join(__dirname,'weekly-script.ps1'),'-Root',tmp],{encoding:'utf8',maxBuffer:4*1024*1024});console.log(r.stdout);console.error(r.stderr);process.exitCode=r.status===0?0:1;}finally{fs.rmSync(tmp,{recursive:true,force:true});}
