#
# mcp-agent-bridge — Windows MSI build script (STUB)
#
# This script will eventually orchestrate the full MSI build pipeline:
#   1. Stage and rename the 3 release binaries into installer/windows/bin/,
#      verifying their SHA-256 checksums (see Task 3 of
#      .omc/plans/2026-07-16-windows-msi-installer.md).
#   2. Invoke `wix build installer/windows/Product.wxs` with the
#      appropriate -d preprocessor variables (Version, ClaudeExe, CodexExe,
#      CopilotExe, NssmExe, McpProxyDir) to produce
#      installer/windows/dist/mcp-agent-bridge-windows-x64.msi.
#
# Full implementation happens in later stories (US-03, US-09). This is a
# stub for now.
#

param(
    [string]$Version,
    [string]$ArtifactsDir,
    [string]$ChecksumsFile,
    [string]$OutDir
)

Write-Host "TODO: implement full build pipeline (see .omc/plans/2026-07-16-windows-msi-installer.md Tasks 3 and 9)"
