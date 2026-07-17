#Requires -Version 5.1
<#
  .SYNOPSIS
  Non-blocking prerequisite check for mcp-agent-bridge's Windows MSI installer.

  .DESCRIPTION
  Invoked by an IMMEDIATE WiX CustomAction ("CheckPrereqs") in the UI
  sequence (see Product.wxs) via the WixQuietExec pattern, which captures
  this script's STDOUT and writes it to the MSI install log automatically.

  Checks whether node.exe/npx (shared prerequisite for all three MCP
  services) and each SELECTED feature's underlying agent CLI (claude/codex/
  copilot) are present on the MACHINE-scope PATH — deliberately NOT the
  ambient process PATH inherited from whoever launched msiexec, and NOT a
  per-user PATH. The services this installer registers run as LocalSystem
  (Design Decision 6 in .omc/plans/2026-07-16-windows-msi-installer.md), and
  LocalSystem only ever resolves the Machine-scope PATH — a per-user Node
  install would be invisible to it even though it's visible to the person
  running the installer. Hence
  [Environment]::GetEnvironmentVariable('PATH', 'Machine') is used
  explicitly below rather than $env:PATH or `Get-Command`, both of which
  would reflect this process's own (interactive user) merged PATH.

  This check is ADVISORY ONLY (Design Decision 5: warn, never block) — it
  ALWAYS exits 0, regardless of what is found missing. A missing CLI simply
  means that one feature's service won't be useful until the CLI is
  installed; it must never fail or block the MSI install.

  .PARAMETER CheckClaude
  Also check for the `claude` CLI on the machine PATH. Pass this switch only
  when the Claude feature was actually selected for install (wired from
  Product.wxs's "&ClaudeService=3" feature-selection state — see the
  PREREQ_CLAUDE_FLAG property there).

  .PARAMETER CheckCodex
  Also check for the `codex` CLI on the machine PATH. Selected-feature-only,
  same rationale as -CheckClaude.

  .PARAMETER CheckCopilot
  Also check for the `copilot` CLI on the machine PATH. Selected-feature-
  only, same rationale as -CheckClaude.

  .OUTPUTS
  Plain text to STDOUT, unconditionally (so it lands in the MSI install log
  regardless of UI level — silent/basic-UI installs still log if msiexec
  was invoked with /l*v, they just never show a dialog):
    - One "PASS"/"MISSING" line per prerequisite checked.
    - Exactly one final line prefixed with the marker
      "MCPBRIDGE_MISSING::", followed by either a comma-separated list of
      the missing prerequisite names, or the literal string "NONE" if
      nothing was missing. This is the line a WiX-side consumer (e.g. a
      future warning-dialog CustomAction) should parse — everything after
      "MCPBRIDGE_MISSING::" up to end of line is the payload, "NONE" means
      no warning is needed.

  Exit code is ALWAYS 0 — this check must never fail or block install.
#>
param(
    [switch] $CheckClaude,
    [switch] $CheckCodex,
    [switch] $CheckCopilot
)

# Never let an unexpected error here propagate as a non-zero exit or an
# unhandled terminating exception — the `finally` block below guarantees
# `exit 0` no matter what happens in the body (Design Decision 5).
$ErrorActionPreference = "Continue"

function Test-CommandOnMachinePath {
    <#
      Resolves $CommandName against the MACHINE-scope PATH only (registry-
      backed HKLM\SYSTEM\CurrentControlSet\Control\Session
      Manager\Environment, via the .NET 'Machine' EnvironmentVariableTarget)
      — not $env:PATH, which for this process would be the Machine+User PATH
      merged for whoever is running msiexec. This distinction is the entire
      point of this check: LocalSystem services only ever see the Machine
      scope.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $CommandName
    )

    $machinePath = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
    if ([string]::IsNullOrEmpty($machinePath)) {
        return $false
    }

    # Windows CLI shims commonly resolve via one of these extensions —
    # npm-installed CLIs like claude/codex/copilot typically ship a .cmd
    # shim (sometimes alongside a .ps1 wrapper), not always a bare .exe, so
    # node.exe is the only name below with an extension already supplied.
    $extensions = @('.exe', '.cmd', '.bat', '.ps1')
    $hasExtension = [System.IO.Path]::HasExtension($CommandName)

    foreach ($dir in $machinePath.Split(';')) {
        if ([string]::IsNullOrWhiteSpace($dir)) { continue }
        $dir = $dir.Trim()

        if ($hasExtension) {
            $candidate = Join-Path -Path $dir -ChildPath $CommandName
            if (Test-Path -LiteralPath $candidate -PathType Leaf -ErrorAction SilentlyContinue) {
                return $true
            }
            continue
        }

        foreach ($ext in $extensions) {
            $candidate = Join-Path -Path $dir -ChildPath "$CommandName$ext"
            if (Test-Path -LiteralPath $candidate -PathType Leaf -ErrorAction SilentlyContinue) {
                return $true
            }
        }
    }

    return $false
}

try {
    # Ordered so the STDOUT summary is stable/predictable for log readers.
    $results = [ordered]@{}

    # Shared prerequisite for all three services (Design Decision 7: mcp-proxy
    # is vendored and invoked via `node.exe <vendored mcp-proxy>`, but Node
    # itself is a real, non-vendored prerequisite that must be on PATH).
    $results['node.exe (Node.js runtime)'] = Test-CommandOnMachinePath -CommandName 'node.exe'
    $results['npx (Node package runner)'] = Test-CommandOnMachinePath -CommandName 'npx'

    # Per-feature checks — only run for features the caller says were
    # actually selected, so an unselected feature's missing CLI is never
    # reported (it would be noise, not a real problem, if that feature
    # wasn't installed in the first place).
    if ($CheckClaude) {
        $results['claude (Claude Code CLI)'] = Test-CommandOnMachinePath -CommandName 'claude'
    }
    if ($CheckCodex) {
        $results['codex (Codex CLI)'] = Test-CommandOnMachinePath -CommandName 'codex'
    }
    if ($CheckCopilot) {
        $results['copilot (GitHub Copilot CLI)'] = Test-CommandOnMachinePath -CommandName 'copilot'
    }

    Write-Host ""
    Write-Host "mcp-agent-bridge prerequisite check (machine PATH, as a LocalSystem service would see it):"

    $missing = @()
    foreach ($key in $results.Keys) {
        if ($results[$key]) {
            Write-Host ("  PASS    - {0}" -f $key)
        }
        else {
            Write-Host ("  MISSING - {0}" -f $key)
            $missing += $key
        }
    }
    Write-Host ""

    # Single combined line for a WiX-side consumer (e.g. a future warning
    # dialog) to parse without re-deriving the PASS/MISSING logic itself.
    # Format (this exact prefix, one line, comma-separated payload):
    #   MCPBRIDGE_MISSING::<item 1>, <item 2>, ...
    # or, when nothing is missing:
    #   MCPBRIDGE_MISSING::NONE
    # Written unconditionally, same as every line above — it lands in the
    # MSI install log via the WixQuietExec pattern (see Product.wxs's
    # CheckPrereqs CustomAction) regardless of UI level.
    if ($missing.Count -gt 0) {
        Write-Host ("MCPBRIDGE_MISSING::{0}" -f ($missing -join ', '))
    }
    else {
        Write-Host "MCPBRIDGE_MISSING::NONE"
    }
}
catch {
    # Belt-and-suspenders: even an unexpected error while probing PATH must
    # not be allowed to make this look like a hard failure to a log reader
    # or (more importantly) to change the exit code below.
    Write-Host "check-prereqs.ps1 encountered an unexpected error: $_"
    Write-Host "MCPBRIDGE_MISSING::UNKNOWN (script error, see log above)"
}
finally {
    # This check is advisory only (Design Decision 5) — ALWAYS exit 0, no
    # matter what was found missing or whether an error occurred above.
    exit 0
}
