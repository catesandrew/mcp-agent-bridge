#Requires -Version 5.1
<#
  .SYNOPSIS
  Registers one mcp-agent-bridge MCP server as an NSSM-wrapped Windows Service.

  .DESCRIPTION
  Invoked by a single deferred WiX CustomAction per service (see Product.wxs),
  via the officially-documented WixQuietExec pattern (an immediate SetProperty
  with the same Id as the deferred CustomAction supplies this script's full
  command line through CustomActionData). Wrapping all 6 `nssm` calls needed
  to fully configure a service into one script — rather than one WiX
  CustomAction per `nssm set` call — keeps the trickiest part of this
  installer (constructing correctly-quoted nested command lines) in one place
  that's easy to reason about and test, instead of spread across 18 separate
  WiX-authored command-line strings (3 services x 6 nssm invocations each).

  Runs as LocalSystem (Impersonate="no" on the calling CustomAction) since
  registering a Windows Service requires elevated/machine-level privileges.

  .PARAMETER ServiceName
  The Windows Service name to register, e.g. McpBridgeClaude.

  .PARAMETER NssmExe
  Full path to the vendored nssm.exe.

  .PARAMETER NodeExe
  The Node.js executable to run mcp-proxy with. Deliberately left as the bare
  "node.exe" by default so it resolves against whatever Node install is on
  the service's (LocalSystem, machine-wide) PATH — mcp-agent-bridge does not
  vendor a Node runtime (out of scope per the plan's Global Constraints).
  This is exactly why Task 7's prerequisite check warns if Node isn't on the
  machine PATH: a per-user-only Node install would be invisible here.

  .PARAMETER McpProxyEntry
  Full path to the vendored mcp-proxy's dist/bin/mcp-proxy.mjs.

  .PARAMETER TargetExe
  Full path to the server executable mcp-proxy should wrap (e.g.
  claude-mcp-server.exe).

  .PARAMETER Port
  TCP port mcp-proxy should listen on (127.0.0.1 only).

  .PARAMETER PortEnvVar
  The environment variable name the underlying server reads its port from
  (e.g. CLAUDE_MCP_HTTP_PORT) — set via `nssm set ... AppEnvironmentExtra`,
  NOT an ambient user/machine environment variable, because this service runs
  as LocalSystem and would never see a per-user env var the way the macOS
  LaunchAgent equivalent does.

  .PARAMETER InstallRoot
  The MSI's INSTALLFOLDER — used as the service's AppDirectory.
#>
param(
    [Parameter(Mandatory = $true)][string] $ServiceName,
    [Parameter(Mandatory = $true)][string] $NssmExe,
    [Parameter(Mandatory = $true)][string] $McpProxyEntry,
    [Parameter(Mandatory = $true)][string] $TargetExe,
    [Parameter(Mandatory = $true)][int]    $Port,
    [Parameter(Mandatory = $true)][string] $PortEnvVar,
    [Parameter(Mandatory = $true)][string] $InstallRoot,
    [string] $NodeExe = "node.exe"
)

$ErrorActionPreference = "Stop"

function Invoke-Nssm {
    param([string[]] $NssmArgs)
    Write-Host "nssm $($NssmArgs -join ' ')"
    & $NssmExe @NssmArgs
    if ($LASTEXITCODE -ne 0) {
        throw "nssm $($NssmArgs[0]) failed for service '$ServiceName' with exit code $LASTEXITCODE"
    }
}

# `nssm install <name> <program>` — program only, no arguments here. Arguments
# are set separately via AppParameters below: NSSM re-splits/re-quotes a long
# single install-line itself (a documented source of quoting bugs — see
# installer/windows/README.md's NSSM quoting note), so installing with just
# the program and setting AppParameters as one already-fully-quoted string is
# the more robust two-step form NSSM's own docs point toward.
Invoke-Nssm @("install", $ServiceName, $NodeExe)

Invoke-Nssm @("set", $ServiceName, "AppDirectory", $InstallRoot)

# mcp-proxy invocation, matching the exact shape of the macOS launch-agent
# scripts' `npx mcp-proxy@6.4.4 --host 127.0.0.1 --port <port> --server stream
# --streamEndpoint /mcp -- <exe>`, but running the vendored copy directly via
# node.exe instead of fetching mcp-proxy over the network at service-start.
$appParameters = '"' + $McpProxyEntry + '" --host 127.0.0.1 --port ' + $Port + ' --server stream --streamEndpoint /mcp -- "' + $TargetExe + '"'
Invoke-Nssm @("set", $ServiceName, "AppParameters", $appParameters)

Invoke-Nssm @("set", $ServiceName, "AppEnvironmentExtra", "$PortEnvVar=$Port")

# Restart-on-crash (the KeepAlive-equivalent behavior the macOS plists get for
# free), with a throttle so a fast-failing process (e.g. Node/npx missing)
# backs off instead of hammering restart in a tight CPU-spinning loop.
Invoke-Nssm @("set", $ServiceName, "AppThrottle", "5000")
Invoke-Nssm @("set", $ServiceName, "AppExit", "Default", "Restart")

Write-Host "Service '$ServiceName' registered successfully."
