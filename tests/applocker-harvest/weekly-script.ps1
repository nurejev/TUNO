# Cross-platform mocked collector contract. No tenant/network/Windows operations.
param([string]$Root)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:ProgramData=$Root; $env:windir=Join-Path $Root 'windows'; $env:COMPUTERNAME='PILOT-01'
$source=Get-Content (Join-Path $repo 'scripts/Get-TunoWeeklyAppLockerHarvest.ps1') -Raw
$source=$source.Replace("SiteUrl        = ''", "SiteUrl        = 'https://unit.sharepoint.com/sites/Harvest'").Replace("TenantId       = ''", "TenantId       = 'tenant'").Replace("ClientId       = ''", "ClientId       = 'client'").Replace("ClientSecret   = ''", "ClientSecret   = 'secret'").Replace('exit 0','$script:TestExit=0; return').Replace('exit 1','$script:TestExit=1; return')
$script:Deletes=New-Object System.Collections.Generic.List[string]
$script:Uploads=0; $script:Mode='fail';$script:RemoteSize=0; $script:RemoteFile='';$script:EventReads=0
function Get-WinEvent {
    param($FilterHashtable,$ErrorAction)
    $script:EventReads++
    if ($FilterHashtable.LogName -eq 'Microsoft-Windows-AppLocker/EXE and DLL') {
        for($i=0;$i -lt 120;$i++){
            $e=[pscustomobject]@{Id=8004;RecordId=$i;LogName=$FilterHashtable.LogName;TimeCreated=[datetime]::UtcNow}
            $e | Add-Member -MemberType ScriptMethod -Name ToXml -Value { '<Event><UserData><RuleAndFileData><FilePath>C:\foo.dll</FilePath></RuleAndFileData></UserData></Event>' }
            $e
        }
        for($i=0;$i -lt 101;$i++){
            $e=[pscustomobject]@{Id=8004;RecordId=(1000+$i);LogName=$FilterHashtable.LogName;TimeCreated=[datetime]::UtcNow}
            $e | Add-Member -MemberType ScriptMethod -Name ToXml -Value { '<Event><UserData><RuleAndFileData><FilePath>C:\foo.exe</FilePath><Fqbn>PUBLISHER\PRODUCT\FOO.EXE\1.0.0.0</Fqbn></RuleAndFileData></UserData></Event>' }
            $e
        }
    }
}
function Get-AppLockerPolicy { '<AppLockerPolicy Version="1"><RuleCollection Type="Dll" EnforcementMode="Enabled"/><RuleCollection Type="Exe" EnforcementMode="Enabled"/></AppLockerPolicy>' }
function Invoke-RestMethod {
    param($Method,$Uri,$Headers,$Body,$ContentType,$InFile,$ErrorAction)
    if($Uri -like '*login.microsoftonline.com*'){return [pscustomobject]@{access_token='mock-token'}}
    if($Uri -like '*sites/unit.sharepoint.com*'){return [pscustomobject]@{id='site-id'}}
    if($Method -eq 'Put') {
        $script:Uploads++
        if($script:Mode -eq 'fail'){throw 'simulated upload outage'}
        $script:RemoteSize=(Get-Item $InFile).Length; $script:RemoteFile=Split-Path -Leaf $InFile
        return [pscustomobject]@{id='newest';size=$script:RemoteSize}
    }
    if($Method -eq 'Delete'){$script:Deletes.Add($Uri);return}
    if($Uri -like '*children*') {return [pscustomobject]@{value=@(
        [pscustomobject]@{id='older';name='T29_AppLocker_20200101T000000Z_11111111-1111-1111-1111-111111111111.json';file=[pscustomobject]@{}}
        [pscustomobject]@{id='unrelated';name='AppControlEvents_Bundle_old.json';file=[pscustomobject]@{}}
        [pscustomobject]@{id='newest';name='T29_AppLocker_20200101T000000Z_22222222-2222-2222-2222-222222222222.json';file=[pscustomobject]@{}}
    )}}
    if($Uri -like '*items/newest*'){return [pscustomobject]@{id='newest';size=$(if($script:Mode -eq 'wrong-size'){$script:RemoteSize-1}else{$script:RemoteSize})}}
    return [pscustomobject]@{id='folder';folder=[pscustomobject]@{}}
}
function Check($Name,$Condition){if(-not $Condition){throw "FAIL: $Name"};Write-Host "PASS: $Name"}
$collector=[scriptblock]::Create($source)
& $collector -MaxEvents 100 | Out-Null
$state=Join-Path $Root 'TUNO/AppLockerHarvest'
$pending=@(Get-ChildItem (Join-Path $state 'Pending') -File -Filter '*.json')
Check 'failure retains pending bundle and no success checkpoint' ($script:TestExit -eq 1 -and $pending.Count -eq 1 -and -not (Test-Path (Join-Path $state 'Success.json')))
Check 'failed upload never prunes' ($script:Deletes.Count -eq 0)
$bundle=Get-Content $pending[0].FullName -Raw | ConvertFrom-Json
Check 'DLL filter precedes cap and all four channels still read' ($bundle.events.entries.Count -eq 100 -and $bundle.events.excludedDll -eq 120 -and $bundle.events.logsRead.Count -eq 4 -and $bundle.events.truncated)
Check 'local/GPO receipt excludes DLL' ($bundle.policyReceipt.localGpoXml -notmatch 'Type="Dll"')
$before=Get-FileHash $pending[0].FullName; $reads=$script:EventReads
$script:Mode='wrong-size'
& $collector -MaxEvents 100 | Out-Null
Check 'read-back mismatch protects pending and checkpoint' ($script:TestExit -eq 1 -and (Test-Path $pending[0].FullName) -and -not (Test-Path (Join-Path $state 'Success.json')))
Check 'retry does not recollect or mutate queued evidence' ($script:EventReads -eq $reads -and (Get-FileHash $pending[0].FullName).Hash -eq $before.Hash)
$script:Mode='success'
& $collector -MaxEvents 100 | Out-Null
Check 'verified upload moves pending and commits checkpoint' ($script:TestExit -eq 0 -and @(Get-ChildItem (Join-Path $state 'Pending') -File -Filter '*.json').Count -eq 0 -and (Test-Path (Join-Path $state 'Success.json')))
Check 'prune removes only this device T29 older history, keeps latest' ($script:Deletes.Count -eq 1 -and $script:Deletes[0] -match '/older$')
$detect=Get-Content (Join-Path $repo 'scripts/Detect-TunoWeeklyAppLockerHarvest.ps1') -Raw
$detect=$detect.Replace('exit 0','$script:DetectExit=0; return').Replace('exit 1','$script:DetectExit=1; return')
& ([scriptblock]::Create($detect)) | Out-Null
Check 'daily detection skips a current successful weekly collection' ($script:DetectExit -eq 0)
$checkpoint=Get-Content (Join-Path $state 'Success.json') -Raw | ConvertFrom-Json;$checkpoint.collectedUtc=[datetime]::UtcNow.AddDays(-8).ToString('o');$checkpoint | ConvertTo-Json | Set-Content (Join-Path $state 'Success.json')
& ([scriptblock]::Create($detect)) | Out-Null
Check 'daily detection triggers after seven days' ($script:DetectExit -eq 1)
$checkpoint.collectedUtc=[datetime]::UtcNow.AddDays(1).ToString('o');$checkpoint | ConvertTo-Json | Set-Content (Join-Path $state 'Success.json')
& ([scriptblock]::Create($detect)) | Out-Null
Check 'future checkpoint is never accepted as current' ($script:DetectExit -eq 1)
Write-Host 'Weekly script contract passed (mocked; Windows execution pending)'
