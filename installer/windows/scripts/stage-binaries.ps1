#Requires -Version 5.1
<#
  .SYNOPSIS
  Verifies and stages the 3 Windows release binaries into the canonical
  locations/names installer/windows/Product.wxs expects.

  .DESCRIPTION
  `.github/workflows/release-windows.yml` produces 3 raw CI-named binaries
  (claude-mcp-server-windows-x64.exe, codex-mcp-server-windows-x64.exe,
  copilot-mcp-server-windows-x64.exe) plus a checksums file
  (checksums-windows-x64.txt, generated via `cd bin; sha256sum * >
  checksums-windows-x64.txt` — GNU coreutils format: one line per file,
  "<64-hex-char-lowercase-sha256>  <filename>", two-space separator, no
  directory component in the filename, confirmed by inspecting that
  workflow directly).

  Product.wxs's -d preprocessor variables (see its header comment and
  progress.txt) are relative to installer/windows/ and expect exactly:
    -d ClaudeExe=bin\claude-mcp-server.exe
    -d CodexExe=bin\codex-mcp-server.exe
    -d CopilotExe=bin\copilot-mcp-server.exe
  i.e. the renamed (no "-windows-x64" suffix) binaries must land in
  installer/windows/bin/. This script is that staging step (Task 3 of
  .omc/plans/2026-07-16-windows-msi-installer.md): for each of the 3
  servers, verify the raw artifact's SHA-256 against the checksums file,
  fail loudly on any mismatch or missing file, then copy+rename into
  -OutDir with the canonical name.

  Intended to be called from build.ps1 (Task 9 wires this in), but is
  fully self-contained and can be run standalone.

  .PARAMETER ArtifactsDir
  Directory containing the 3 raw CI-named .exe files and the checksums
  file (e.g. the downloaded release-windows.yml artifact/release assets).

  .PARAMETER ChecksumsFile
  Name (or path) of the checksums file. Defaults to
  "checksums-windows-x64.txt", matching the exact filename
  release-windows.yml's "Generate checksums" step writes
  (`sha256sum * > checksums-windows-x64.txt`, run with cwd set to the
  directory holding the 3 .exe files). If not rooted, resolved relative to
  -ArtifactsDir.

  .PARAMETER OutDir
  Destination directory for the renamed binaries. Defaults to
  installer/windows/bin, resolved relative to this script's own location
  ($PSScriptRoot\..\bin), which is exactly what Product.wxs's bin\*.exe
  -d variables point at.

  .PARAMETER SkipChecksum
  DEV-ONLY escape hatch: skips SHA-256 verification entirely and just
  copies+renames whatever is in -ArtifactsDir. Intended for local/dev
  testing against unsigned, uncheck-summed dev builds. NEVER use this for
  a real release build — a real release's binaries and checksums file are
  both produced by release-windows.yml, and skipping verification here
  would defeat the entire point of Task 3 (catching a corrupted/wrong
  artifact before it gets baked into the MSI).

  .EXAMPLE
  .\stage-binaries.ps1 -ArtifactsDir C:\release-assets

  .EXAMPLE
  # Dev-only, unsigned local builds with no checksums file:
  .\stage-binaries.ps1 -ArtifactsDir C:\dev-build -SkipChecksum
#>
param(
    [Parameter(Mandatory = $true)][string] $ArtifactsDir,
    [string] $ChecksumsFile = "checksums-windows-x64.txt",
    [string] $OutDir,
    [switch] $SkipChecksum
)

$ErrorActionPreference = "Stop"

function Fail {
    param([string] $Message)
    Write-Error $Message
    exit 1
}

if (-not (Test-Path -LiteralPath $ArtifactsDir -PathType Container)) {
    Fail "ArtifactsDir '$ArtifactsDir' does not exist or is not a directory."
}
$ArtifactsDir = (Resolve-Path -LiteralPath $ArtifactsDir).Path

if (-not $OutDir) {
    $OutDir = Join-Path $PSScriptRoot "..\bin"
}
if (-not (Test-Path -LiteralPath $OutDir)) {
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path

# Raw CI artifact name -> canonical name Product.wxs expects (drops the
# "-windows-x64" suffix — see progress.txt's confirmedFacts.ciArtifactNames).
$servers = @(
    @{ Raw = "claude-mcp-server-windows-x64.exe"; Canonical = "claude-mcp-server.exe" },
    @{ Raw = "codex-mcp-server-windows-x64.exe"; Canonical = "codex-mcp-server.exe" },
    @{ Raw = "copilot-mcp-server-windows-x64.exe"; Canonical = "copilot-mcp-server.exe" },
    @{ Raw = "video-mcp-server-windows-x64.exe"; Canonical = "video-mcp-server.exe" }
)

# ---------------------------------------------------------------------------
# Load checksums (unless -SkipChecksum). File format (confirmed against
# release-windows.yml's `sha256sum *` invocation and cross-checked against
# `shasum -a 256` on macOS, which produces the identical shape): one line per
# file, "<64-hex-char-sha256>  <filename>" — two spaces, filename only (no
# directory component). GNU coreutils sha256sum would emit "<hash> *<filename>"
# (single space + asterisk) only when invoked with --binary; release-windows.yml
# does not pass that flag, so the two-space form is what's actually produced.
# Parsed permissively (allows either separator form, trims CRLF) so this
# doesn't silently break if that flag is ever added.
# ---------------------------------------------------------------------------
$checksums = @{}
if (-not $SkipChecksum) {
    $checksumsPath = $ChecksumsFile
    if (-not [System.IO.Path]::IsPathRooted($checksumsPath)) {
        $checksumsPath = Join-Path $ArtifactsDir $ChecksumsFile
    }
    if (-not (Test-Path -LiteralPath $checksumsPath -PathType Leaf)) {
        Fail "Checksums file '$checksumsPath' does not exist."
    }

    Get-Content -LiteralPath $checksumsPath | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0) { return }

        if ($line -match '^([0-9a-fA-F]{64})\s+\*?(.+)$') {
            $hash = $Matches[1].ToUpperInvariant()
            $name = $Matches[2].Trim()
            $checksums[$name] = $hash
        } else {
            Fail "Checksums file '$checksumsPath' has an unparseable line: '$line'"
        }
    }
} else {
    Write-Host "WARNING: -SkipChecksum specified — SHA-256 verification is DISABLED." -ForegroundColor Yellow
    Write-Host "This is a dev-only escape hatch for local/unsigned test builds. NEVER use it for a real release." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Verify + stage each server binary.
# ---------------------------------------------------------------------------
foreach ($server in $servers) {
    $rawName = $server.Raw
    $canonicalName = $server.Canonical
    $rawPath = Join-Path $ArtifactsDir $rawName

    if (-not (Test-Path -LiteralPath $rawPath -PathType Leaf)) {
        Fail "Expected release artifact '$rawName' not found in '$ArtifactsDir'."
    }

    if (-not $SkipChecksum) {
        if (-not $checksums.ContainsKey($rawName)) {
            Fail "Checksums file '$ChecksumsFile' has no entry for '$rawName'."
        }
        $expectedHash = $checksums[$rawName]
        $actualHash = (Get-FileHash -LiteralPath $rawPath -Algorithm SHA256).Hash.ToUpperInvariant()

        if ($actualHash -ne $expectedHash) {
            Fail "SHA-256 mismatch for '$rawName': expected $expectedHash, got $actualHash. Refusing to stage a corrupted or tampered artifact."
        }
        Write-Host "OK  $rawName  ($actualHash)"
    }

    $destPath = Join-Path $OutDir $canonicalName
    Copy-Item -LiteralPath $rawPath -Destination $destPath -Force
    Write-Host "Staged '$rawName' -> '$destPath'"
}

Write-Host "All 3 release binaries verified and staged to '$OutDir'."
