#Requires -Version 5.1
<#
.SYNOPSIS
Zips the App Control artefacts Get-TunoAppControlEvents.ps1 leaves on a device -
the HTML report and the T01 JSON bundle - and prints the archive path. Built for
MDE Live Response 'getfile'; works in any elevated shell.

.DESCRIPTION
The collector writes its retrievable artefacts into the Intune Management Extension
Logs folder (as *.log, so Intune device diagnostics gathers them). When you want them
NOW rather than via a diagnostics round-trip, MDE Live Response is the shortcut - and
its 'getfile' takes one file, so this script zips the newest report and bundle (or all
of them with -All) into one timestamped archive and prints:

    ARCHIVE: <full path>

as the final line, ready to paste into:  getfile "<full path>"

Zipping uses .NET System.IO.Compression directly rather than Compress-Archive, which
fails in constrained Live Response runspaces and on older hosts.

.PARAMETER LogsDir
Folder holding the artefacts. Default %ProgramData%\Microsoft\IntuneManagementExtension\Logs.

.PARAMETER All
Include every AppControlEvents_Report_*.log and AppControlEvents_Bundle_*.log found,
not just the newest of each. Also adds the per-ID CSV/XML exports folder.

.PARAMETER OutputDir
Folder to write the .zip into. Default %ProgramData%\IT-TOOLS\Apps (created if
missing) - inside the house folder tree, where the provisioning pair's ACL applies.

.EXAMPLE
PS> .\Compress-TunoAppControlReport.ps1
Zips the newest report + bundle to %ProgramData%\IT-TOOLS\Apps\ACB-Report_<HOST>_<stamp>.zip.

.NOTES
Version   : 1.0.0
Part of   : TUNO - Tenant Utilities for iNtune Operations (tuno.limon-it.nl), tool T01
Licence   : MIT
Run as    : SYSTEM (Live Response) or local admin. Non-interactive. Read-only on
            source data.
Replaces  : Compress-ACBOutput.ps1 - same job; now also grabs the T01 JSON bundle,
            which is the file the analysis actually wants.
Companion : Get-TunoAppControlEvents.ps1
#>

[CmdletBinding()]
param(
    [string]$LogsDir = "$env:ProgramData\Microsoft\IntuneManagementExtension\Logs",
    [switch]$All,
    [string]$OutputDir = "$env:ProgramData\IT-TOOLS\Apps"
)

$script:ScriptVersion = '1.0.0'
$script:TunoBuild = 10467

$ErrorActionPreference = 'Stop'

try {
    if (-not (Test-Path -LiteralPath $LogsDir)) {
        Write-Host "ERROR: Logs folder not found: $LogsDir" -ForegroundColor Red
        exit 1
    }

    # The two artefact families the collector writes. The BUNDLE is the one T01
    # analyzes; the report is for reading. Newest of each unless -All.
    $pick = {
        param([string]$Pattern)
        $found = @(Get-ChildItem -LiteralPath $LogsDir -File -Filter $Pattern -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending)
        if ($All) { $found } elseif ($found.Count) { @($found[0]) } else { @() }
    }
    $reports = & $pick 'AppControlEvents_Report_*.log'
    $bundles = & $pick 'AppControlEvents_Bundle_*.log'
    $files   = @($reports + $bundles)

    if ($files.Count -eq 0) {
        Write-Host "ERROR: no AppControlEvents_Report_*.log or AppControlEvents_Bundle_*.log in $LogsDir. Run Get-TunoAppControlEvents.ps1 first." -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null
    }

    $stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
    $zipPath = Join-Path $OutputDir ("ACB-Report_{0}_{1}.zip" -f $env:COMPUTERNAME, $stamp)
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($f in $files) {
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $f.FullName, $f.Name, [System.IO.Compression.CompressionLevel]::Optimal)
        }
        if ($All) {
            $exportDir = Join-Path $LogsDir 'EventLogs'
            if (Test-Path -LiteralPath $exportDir) {
                foreach ($f in @(Get-ChildItem -LiteralPath $exportDir -File -ErrorAction SilentlyContinue)) {
                    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                        $zip, $f.FullName, ("EventLogs/" + $f.Name), [System.IO.Compression.CompressionLevel]::Optimal)
                }
            }
        }
    }
    finally { $zip.Dispose() }

    $sizeMB = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
    Write-Host ""
    Write-Host ("Zipped {0} file(s): {1} report(s), {2} T01 bundle(s){3}" -f $files.Count, @($reports).Count, @($bundles).Count, $(if ($All) { " + CSV/XML exports" } else { "" })) -ForegroundColor Green
    Write-Host ("Size      : {0} MB" -f $sizeMB)
    Write-Host ("Full path : {0}" -f $zipPath)
    if ($sizeMB -gt 250) {
        Write-Host "WARN: archive exceeds the 250 MB Live Response getfile limit." -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host ("ARCHIVE: {0}" -f $zipPath) -ForegroundColor Cyan
    exit 0
}
catch {
    Write-Host ("ERROR: {0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}
