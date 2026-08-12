#Requires -Version 5.1
<#
  .SYNOPSIS
  Orchestrates the full Windows MSI build: stage/rename release binaries,
  then invoke `wix build` with all required preprocessor variables.

  .DESCRIPTION
  Full pipeline (Task 9 of .omc/plans/2026-07-16-windows-msi-installer.md):
    1. Runs installer/windows/scripts/stage-binaries.ps1 (Task 3) to verify
       SHA-256 checksums and stage/rename the 4 raw CI-named release
       binaries into installer/windows/bin/ using the canonical names
       Product.wxs's -d ClaudeExe/CodexExe/CopilotExe/VideoExe variables
       expect. If staging fails for any reason, stage-binaries.ps1 fails
       loudly (Write-Error + `exit 1`), which -- because it's invoked here
       with the `&` call operator from this same process -- terminates this
       entire script before the wix build step below is ever reached.
    2. Invokes:
         wix build Product.wxs -ext WixToolset.Util.wixext -ext WixToolset.UI.wixext -arch x64
           -d Version=<pkg version>
           -d ClaudeExe=bin\claude-mcp-server.exe
           -d CodexExe=bin\codex-mcp-server.exe
           -d CopilotExe=bin\copilot-mcp-server.exe
           -d VideoExe=bin\video-mcp-server.exe
           -d McpProxyDir=vendor\mcp-proxy
           -d NssmExe=vendor\nssm\nssm.exe
           -out dist\mcp-agent-bridge-windows-x64.msi
       from installer/windows/ itself -- all of the -d path values and -out
       above are relative to that directory (matching Product.wxs's own
       header comment and its `<File Source="$(var.XxxExe)">` elements),
       NOT relative to the repo root, so this script Push-Locations into
       installer/windows/ before invoking wix and restores the caller's
       location afterward.

  Both extension flags are REQUIRED (see Product.wxs's header comment):
  `-ext WixToolset.Util.wixext` because the deferred CustomActions that
  register each Windows service reference `Wix4UtilCA_$(sys.BUILDARCHSHORT)`,
  and `-ext WixToolset.UI.wixext` because the feature-selection wizard
  (WixUI_FeatureTree) lives in that extension -- `wix build` fails without
  either.

  .PARAMETER Version
  MSI/package version, passed as the Version preprocessor variable
  ($(var.Version) in Product.wxs). If not supplied, read automatically from
  package.json's "version" field at the repo root -- do NOT hardcode a
  version here; this keeps the MSI version in lockstep with the npm package
  version.

  .PARAMETER ArtifactsDir
  Passed through to stage-binaries.ps1 -ArtifactsDir: the directory
  containing the 4 raw CI-named .exe files and checksums-windows-x64.txt
  (e.g. downloaded release-windows.yml artifacts or release assets).

  .PARAMETER ChecksumsFile
  Passed through to stage-binaries.ps1 -ChecksumsFile. Optional -- when not
  supplied, stage-binaries.ps1's own default ("checksums-windows-x64.txt")
  is used.

  .PARAMETER OutDir
  Passed through to stage-binaries.ps1 -OutDir. Optional -- when not
  supplied, stage-binaries.ps1's own default (installer/windows/bin,
  resolved relative to its own location) is used, which is exactly what
  Product.wxs's bin\*.exe -d variables point at.

  .EXAMPLE
  .\build.ps1 -ArtifactsDir C:\release-assets

  .EXAMPLE
  # Override the version instead of reading package.json:
  .\build.ps1 -ArtifactsDir C:\release-assets -Version 1.2.3
#>
param(
    [string]$Version,
    [Parameter(Mandatory = $true)][string]$ArtifactsDir,
    [string]$ChecksumsFile,
    [string]$OutDir
)

$ErrorActionPreference = "Stop"

function Fail {
    param([string] $Message)
    Write-Error $Message
    exit 1
}

# ---------------------------------------------------------------------------
# Step 1: stage/rename the 4 release binaries (Task 3). If this fails,
# stage-binaries.ps1 itself calls `exit 1` after a loud Write-Error, which --
# since it's invoked via the `&` call operator in this same process/runspace
# -- terminates this whole script before we ever reach the wix build step
# below. The $LASTEXITCODE check afterward is defense-in-depth only.
# ---------------------------------------------------------------------------
$stageScript = Join-Path $PSScriptRoot "scripts\stage-binaries.ps1"

$stageArgs = @{ ArtifactsDir = $ArtifactsDir }
if ($ChecksumsFile) { $stageArgs.ChecksumsFile = $ChecksumsFile }
if ($OutDir) { $stageArgs.OutDir = $OutDir }

& $stageScript @stageArgs
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    Fail "Binary staging failed (stage-binaries.ps1 exited $LASTEXITCODE). Aborting before wix build."
}

# ---------------------------------------------------------------------------
# Step 2: resolve the Version preprocessor variable.
# ---------------------------------------------------------------------------
if (-not $Version) {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
    $packageJsonPath = Join-Path $repoRoot "package.json"
    if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
        Fail "Could not find package.json at '$packageJsonPath' to read the version from. Pass -Version explicitly instead."
    }
    $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
    $Version = $packageJson.version
    if (-not $Version) {
        Fail "package.json at '$packageJsonPath' has no 'version' field. Pass -Version explicitly instead."
    }
    Write-Host "Read Version=$Version from package.json"
}

# ---------------------------------------------------------------------------
# Step 3: `wix build`. All -d path values and -out below are relative to
# installer/windows/ (matching Product.wxs's own header comment and its
# <File Source="$(var.XxxExe)"> elements), so Push-Location there first.
# ---------------------------------------------------------------------------
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    Fail "'wix' CLI not found on PATH. Install it with: dotnet tool install --global wix --version 5.0.2 (see installer/windows/README.md -- do NOT install the latest version; WiX v7+ requires accepting a paid Open Source Maintenance Fee EULA)."
}

Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot "dist") | Out-Null

    & wix build "Product.wxs" `
        -ext WixToolset.Util.wixext `
        -ext WixToolset.UI.wixext `
        -arch x64 `
        -d "Version=$Version" `
        -d "ClaudeExe=bin\claude-mcp-server.exe" `
        -d "CodexExe=bin\codex-mcp-server.exe" `
        -d "CopilotExe=bin\copilot-mcp-server.exe" `
        -d "VideoExe=bin\video-mcp-server.exe" `
        -d "McpProxyDir=vendor\mcp-proxy" `
        -d "NssmExe=vendor\nssm\nssm.exe" `
        -out "dist\mcp-agent-bridge-windows-x64.msi"

    if ($LASTEXITCODE -ne 0) {
        Fail "wix build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host "Built installer\windows\dist\mcp-agent-bridge-windows-x64.msi (Version=$Version)"
