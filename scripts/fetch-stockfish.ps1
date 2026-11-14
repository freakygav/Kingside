<#
.SYNOPSIS
  Puts a Stockfish engine into resources/engine so it gets bundled into the Kingside build.

.DESCRIPTION
  Order of preference:
    1. -Source <path to stockfish*.exe>      (any Stockfish you already have)
    2. An existing winget install            (winget install Stockfish.Stockfish)
    3. -Download                             (official release from github.com/official-stockfish)

  Stockfish is GPL-3.0. Shipping it inside the installer means shipping its license and making its
  source available, so this script also copies Copying.txt, AUTHORS and (when present) the source
  tree, and writes SOURCE.txt pointing at the matching upstream release.

.EXAMPLE
  npm run engine
  powershell -File scripts/fetch-stockfish.ps1 -Download
  powershell -File scripts/fetch-stockfish.ps1 -Source C:\Tools\stockfish\stockfish.exe
#>
param(
  [string]$Source,
  [switch]$Download
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'resources\engine'
New-Item -ItemType Directory -Force $dest | Out-Null

function Clear-Dest {
  Get-ChildItem $dest -Force | Where-Object { $_.Name -ne 'README.txt' } | Remove-Item -Recurse -Force
}

function Copy-Install([string]$exe) {
  $dir = Split-Path -Parent $exe
  Clear-Dest
  Copy-Item $exe (Join-Path $dest (Split-Path -Leaf $exe))
  foreach ($f in 'Copying.txt', 'COPYING', 'AUTHORS', 'README.md') {
    $p = Join-Path $dir $f
    if (Test-Path $p) { Copy-Item $p $dest }
  }
  if (Test-Path (Join-Path $dir 'src')) {
    Compress-Archive -Path (Join-Path $dir 'src') -DestinationPath (Join-Path $dest 'stockfish-source.zip') -Force
  }
}

function Get-Version([string]$exe) {
  $out = 'quit' | & $exe 2>$null | Select-Object -First 1
  return ($out -replace '\s+by the Stockfish developers.*', '').Trim()
}

$exe = $null
if ($Source) {
  if (-not (Test-Path $Source)) { throw "Source not found: $Source" }
  $exe = (Resolve-Path $Source).Path
  Copy-Install $exe
} elseif (-not $Download) {
  $pkgs = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  $hit = Get-ChildItem $pkgs -Directory -ErrorAction SilentlyContinue | Where-Object Name -like 'Stockfish.Stockfish*' |
    ForEach-Object { Get-ChildItem $_.FullName -Recurse -Depth 2 -Filter 'stockfish*.exe' } | Select-Object -First 1
  if ($hit) {
    Write-Host "Using winget install: $($hit.FullName)"
    $exe = $hit.FullName
    Copy-Install $exe
  } else {
    Write-Host 'No winget install found. Install one with:  winget install Stockfish.Stockfish'
    Write-Host 'or re-run with -Download to fetch the official release from GitHub.'
    exit 1
  }
}

if ($Download) {
  Write-Host 'Querying the latest official Stockfish release...'
  $rel = Invoke-RestMethod -Headers @{ 'User-Agent' = 'kingside-build' } 'https://api.github.com/repos/official-stockfish/Stockfish/releases/latest'
  $asset = $rel.assets | Where-Object { $_.name -match '^stockfish-windows-x86-64(-universal)?\.zip$' } | Select-Object -First 1
  if (-not $asset) { $asset = $rel.assets | Where-Object { $_.name -match '^stockfish-windows-x86-64.*\.zip$' } | Select-Object -First 1 }
  if (-not $asset) { throw "No Windows x86-64 asset in release $($rel.tag_name)" }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("sf-" + [guid]::NewGuid())
  New-Item -ItemType Directory $tmp | Out-Null
  $zip = Join-Path $tmp $asset.name
  Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB) from $($rel.html_url)"
  Invoke-WebRequest -Headers @{ 'User-Agent' = 'kingside-build' } $asset.browser_download_url -OutFile $zip
  Expand-Archive $zip -DestinationPath $tmp -Force
  $found = Get-ChildItem $tmp -Recurse -Filter 'stockfish*.exe' | Select-Object -First 1
  if (-not $found) { throw 'Downloaded archive did not contain stockfish*.exe' }
  $exe = $found.FullName
  Copy-Install $exe
}

$bundled = Get-ChildItem $dest -Filter 'stockfish*.exe' | Select-Object -First 1
$version = Get-Version $bundled.FullName
if (-not ($version -match 'Stockfish')) { throw "The copied binary did not identify as Stockfish (got '$version')." }
$tag = ($version -replace '[^0-9.]', '')
@"
Bundled engine: $version
License: GNU General Public License v3 (see Copying.txt)
Upstream source: https://github.com/official-stockfish/Stockfish/releases/tag/sf_$tag
Source tree for this build (when available): stockfish-source.zip
Kingside talks to Stockfish only over the UCI text protocol; it is a separate program.
"@ | Set-Content -Encoding utf8 (Join-Path $dest 'SOURCE.txt')

if (-not (Test-Path (Join-Path $dest 'Copying.txt'))) {
  Write-Warning 'Copying.txt (GPL-3.0) was not found next to the engine. Add it before distributing a build.'
}
Write-Host "Bundled $version -> $dest"
