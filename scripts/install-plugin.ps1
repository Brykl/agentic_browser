<#
.SYNOPSIS
    Builds and installs (or updates) the agent-browser-plugin bundle in the local Antigravity plugins directory.
.DESCRIPTION
    Antigravity's Language Server plugin scanner expects a real directory under
    ~/.gemini/config/plugins/<name> rather than a root-level junction. This script
    optionally builds the TypeScript API and React UI, copies the plugin manifest,
    assets, prebuilt CLI (bin/ab.exe), customizations, and compiled runtime artifacts
    into $TargetDir, and junctions node_modules back to the repository to avoid
    duplicating Puppeteer and Fastify dependencies.
#>
param(
    # Destination plugin directory discovered by Antigravity (~/.gemini/config/plugins/<name>)
    [string]$TargetDir = (Join-Path $env:USERPROFILE ".gemini\config\plugins\agent-browser-plugin"),
    # Skip running 'pnpm run build' when dist/ and ui/dist/ are already freshly compiled
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Resolve the repository root from scripts/install-plugin.ps1
$RepoRoot = Split-Path -Parent $PSScriptRoot

# Ensure node_modules exists before building or linking
$nmSrc = Join-Path $RepoRoot "node_modules"
if (-not (Test-Path $nmSrc)) {
    throw "Missing '$nmSrc'. Run 'pnpm install' first."
}

# Build API (dist/) and UI (ui/dist/) automatically so a fresh clone installs in one command
if (-not $SkipBuild) {
    Push-Location $RepoRoot
    try {
        pnpm run build
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm run build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

# Ensure the target plugin directory exists as a real folder (not a symlink/junction)
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

# Copy top-level plugin manifest, package metadata, and user-facing README (if present)
Copy-Item (Join-Path $RepoRoot "plugin.json") (Join-Path $TargetDir "plugin.json") -Force
Copy-Item (Join-Path $RepoRoot "package.json") (Join-Path $TargetDir "package.json") -Force
$readmeSrc = Join-Path $RepoRoot "README.md"
if (Test-Path $readmeSrc) {
    Copy-Item $readmeSrc (Join-Path $TargetDir "README.md") -Force
}

# Sync plugin components (assets, rules, skills), prebuilt CLI (bin), and compiled API (dist)
foreach ($folder in @("assets", "bin", "rules", "skills", "dist")) {
    $src = Join-Path $RepoRoot $folder
    $dst = Join-Path $TargetDir $folder
    if (-not (Test-Path $src)) {
        throw "Missing required folder '$src'. Run 'pnpm run build' (or 'go build -o ./bin/ab.exe ./cli' for bin/) first."
    }
    if (Test-Path $dst) {
        Remove-Item -Path $dst -Recurse -Force
    }
    Copy-Item $src $dst -Recurse -Force
}

# Sync the compiled frontend bundle (ui/dist) while preserving the ui/dist layout expected by dist/index.js
$uiDistSrc = Join-Path $RepoRoot "ui\dist"
if (-not (Test-Path $uiDistSrc)) {
    throw "Missing built UI at '$uiDistSrc'. Run 'pnpm run build' first."
}
$uiTargetRoot = Join-Path $TargetDir "ui"
New-Item -ItemType Directory -Path $uiTargetRoot -Force | Out-Null
$uiDistDst = Join-Path $uiTargetRoot "dist"
if (Test-Path $uiDistDst) {
    Remove-Item -Path $uiDistDst -Recurse -Force
}
Copy-Item $uiDistSrc $uiDistDst -Recurse -Force

# Link node_modules via a Windows directory junction so Node resolves Fastify/Puppeteer
# without copying hundreds of megabytes of dependencies into the plugin folder.
$nmDst = Join-Path $TargetDir "node_modules"
if (Test-Path $nmDst) {
    $item = Get-Item $nmDst -Force
    # Remove an existing junction via rmdir so PowerShell doesn't recurse into the linked target
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        cmd /c rmdir "$nmDst" | Out-Null
    } else {
        Remove-Item -Path $nmDst -Recurse -Force
    }
}
New-Item -ItemType Junction -Path $nmDst -Target $nmSrc | Out-Null


# Add bin directory to User PATH (idempotent)
$binFullPath = Join-Path $TargetDir "bin"
$oldPath = [Environment]::GetEnvironmentVariable("Path", "User")
$entries = if ($oldPath) {
    @($oldPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
} else {
    @()
}

$normalizedBin = $binFullPath.TrimEnd('\')
$alreadyInPath = $entries | Where-Object { $_.TrimEnd('\') -ieq $normalizedBin }

if (-not $alreadyInPath) {
    $newPath = ($entries + $binFullPath) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
}

# Also expose bin in the current PowerShell session if not already present
$sessionEntries = if ($env:Path) {
    @($env:Path -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
} else {
    @()
}
if (-not ($sessionEntries | Where-Object { $_.TrimEnd('\') -ieq $normalizedBin })) {
    $env:Path = ($sessionEntries + $binFullPath) -join ';'
}

# Stop stale daemon running from the plugin directory so the next launch uses the new build
$targetNorm = $TargetDir.TrimEnd('\', '/')
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { ($_.CommandLine -replace '/', '\') -like "*$targetNorm*dist\index.js*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host "Plugin synced to $TargetDir"
