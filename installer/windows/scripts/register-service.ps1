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
  Full path to the vendored mcp-proxy's dist/bin/mcp-proxy.mjs. Required
  unless -NativeHttp is passed (see below).

  .PARAMETER TargetExe
  Full path to the server executable. When -NativeHttp is NOT set, this is
  the executable mcp-proxy wraps (e.g. claude-mcp-server.exe, run via
  NodeExe + McpProxyEntry). When -NativeHttp IS set, NSSM runs this
  executable directly as the service program (e.g. video-mcp-server.exe,
  which has its own built-in HTTP transport and needs no mcp-proxy).

  .PARAMETER NativeHttp
  Skips the mcp-proxy wrapping entirely: NSSM installs -TargetExe itself as
  the service program (not NodeExe), with AppParameters set to the single
  flag "--http" (the flag video-mcp-server's own server.ts checks via
  `process.argv.includes("--http")` to switch into HTTP-transport mode — see
  src/video/server.ts). -McpProxyEntry is ignored/not required when this is
  set.

  .PARAMETER Port
  TCP port mcp-proxy (or, in -NativeHttp mode, the server itself) should
  listen on (127.0.0.1 only).

  .PARAMETER PortEnvVar
  The environment variable name the underlying server reads its port from
  (e.g. CLAUDE_MCP_HTTP_PORT, or VIDEO_MCP_HTTP_PORT in -NativeHttp mode) —
  set via `nssm set ... AppEnvironmentExtra`, NOT an ambient user/machine
  environment variable, because this service runs as LocalSystem (or
  -ServiceAccount, if given) and would never see a per-user env var the way
  the macOS LaunchAgent equivalent does.

  .PARAMETER InstallRoot
  The MSI's INSTALLFOLDER — used as the service's AppDirectory.

  .PARAMETER ServiceAccount
  Windows account the service should run as, passed straight to
  `nssm set <name> ObjectName <account> <password>`. Defaults to
  "LocalSystem" (Product.wxs's SERVICEACCOUNT property default — WiX
  rejects an empty Property Value, so "LocalSystem" is the literal default
  rather than ""). Left as LocalSystem, or any of the other well-known
  no-password accounts (LocalService/NetworkService, with or without a
  ".\"/"NT AUTHORITY\" prefix — matched case-insensitively), this script
  never calls `nssm set ... ObjectName` at all, preserving NSSM's own
  install-time default exactly rather than redundantly re-asserting it.
  Only a genuinely different account (e.g. "DOMAIN\svc-mcp-bridge" or
  ".\svc-mcp-bridge") triggers a real ObjectName call — the only case that
  actually needs -ServicePassword too. NSSM grants that account
  SeServiceLogonRight itself via LSA when ObjectName is set with a
  password, so no separate "Log on as a service" provisioning step is
  needed here.

  .PARAMETER ServicePasswordFile
  Path to a file containing (only) the password for -ServiceAccount, read
  fresh each time this script runs (never deleted here — 4 separate
  services may all need to read the same file; the caller who created it is
  responsible for deleting it once every service is registered). Required
  whenever -ServiceAccount is a real user account.

  DELIBERATELY a file path, not a -ServicePassword string parameter: a
  real install confirmed msiexec's own verbose log (/l*v) prints a deferred
  CustomAction's full resolved CustomActionData in its "Executing op:
  CustomActionSchedule(...)" line UNCONDITIONALLY — Property/@Hidden="yes"
  does NOT suppress this, no matter which property carries the value (tried
  both hiding the password's own property AND the composed property that
  embeds it; a real cleartext domain password ended up in a log file
  either way). Since this script's whole command line arrives via exactly
  that mechanism (see the .DESCRIPTION above), ANY value passed as a plain
  string argument here is fundamentally unable to avoid that log line —
  only a FILE PATH (not the secret itself) is safe to pass through
  Product.wxs's SetProperty/CustomActionData plumbing. The caller must
  create this file with restrictive ACLs (e.g. `icacls file /inheritance:r
  /grant:r SYSTEM:R Administrators:F`) before running msiexec, and remove
  it afterward. Not fully secretless even so: the resulting `nssm set ...
  ObjectName <account> <password>` call still carries the password as a
  literal process argument for the instant nssm.exe runs — an inherent NSSM
  CLI limitation (it has no "read password from file" option), not
  something this script can close further. nssm's own command echo below
  redacts it from THIS script's stdout regardless (see Invoke-Nssm's
  -Redact usage).

  .PARAMETER LogDir
  Directory the service's stdout/stderr get written to (created if missing).
  Defaults to %ProgramData%\mcp-agent-bridge\logs — machine-wide, consistent
  with the service running as LocalSystem (Design Decision 11: NOT
  %LOCALAPPDATA%, which install.ps1 uses today but wouldn't make sense for a
  LocalSystem service to write to). Without this, NSSM silently discards the
  process's stdout/stderr entirely — there is no log without it.
#>
param(
    [Parameter(Mandatory = $true)][string] $ServiceName,
    [Parameter(Mandatory = $true)][string] $NssmExe,
    [string] $McpProxyEntry = "",
    [Parameter(Mandatory = $true)][string] $TargetExe,
    [Parameter(Mandatory = $true)][int]    $Port,
    [Parameter(Mandatory = $true)][string] $PortEnvVar,
    [Parameter(Mandatory = $true)][string] $InstallRoot,
    [switch] $NativeHttp,
    [string] $ServiceAccount = "",
    [string] $ServicePasswordFile = "",
    [string] $NodeExe = "node.exe",
    [string] $LogDir = "$env:ProgramData\mcp-agent-bridge\logs"
)

if (-not $NativeHttp -and [string]::IsNullOrEmpty($McpProxyEntry)) {
    Write-Error "register-service.ps1: -McpProxyEntry is required unless -NativeHttp is passed."
    exit 1
}

# CRITICAL: `nssm install <name> <program>` hands <program> straight to
# CreateProcess as lpApplicationName, which does NOT search PATH the way a
# shell's bare-command lookup does (confirmed by a real install: a bare
# "node.exe" registered fine but then crash-looped every ~30s with the
# Service Control Manager logging "The system cannot find the path
# specified" — ERROR_PATH_NOT_FOUND, event IDs 7034/7024 — even though
# node.exe was genuinely on the machine PATH check-prereqs.ps1 was checking
# against). So when -NodeExe is left as its default bare name (not
# -NativeHttp mode, which passes -TargetExe as an already-absolute
# "[BINDIR]..." path from Product.wxs and never hits this), resolve it to an
# absolute path against the MACHINE-scope PATH here — this script runs as
# LocalSystem (or -ServiceAccount) via a deferred CustomAction, which only
# ever sees the machine scope, same rationale as check-prereqs.ps1's own
# Test-CommandOnMachinePath.
if (-not $NativeHttp -and -not [System.IO.Path]::IsPathRooted($NodeExe)) {
    $machinePath = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
    $resolved = $null
    foreach ($dir in ($machinePath -split ';')) {
        if ([string]::IsNullOrWhiteSpace($dir)) { continue }
        $candidate = Join-Path $dir.Trim() $NodeExe
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $resolved = $candidate
            break
        }
    }
    if (-not $resolved) {
        Write-Error "register-service.ps1: could not resolve '$NodeExe' to an absolute path on the machine PATH. NSSM requires an absolute path (it does not do shell-style PATH lookup) -- install Node.js and ensure it's on the machine PATH, or pass -NodeExe with a full path explicitly."
        exit 1
    }
    Write-Host "Resolved NodeExe '$NodeExe' -> '$resolved'"
    $NodeExe = $resolved
}

$ErrorActionPreference = "Stop"

function Get-ShortPath {
    <#
      Converts a path's DIRECTORY portion to its 8.3 short-name form (e.g.
      "C:\Program Files" -> "C:\PROGRA~1") and reattaches the ORIGINAL,
      correctly-cased filename, rather than shortening the whole path.
      Confirmed by a real install this distinction matters: an early
      version that shortened the FULL path (including the filename) turned
      "mcp-proxy.mjs" into "MCP-PR~1.MJS" -- 8.3 short names render
      extensions in uppercase, and Node's ESM loader does a case-sensitive
      check for ".mjs", so the wrapped process failed with
      ERR_UNKNOWN_FILE_EXTENSION even though the path itself resolved fine.
      Only the directory needs shortening (that's where the space-
      containing "Program Files" segment lives); the filename was never the
      problem.

      This exists because NSSM's own re-tokenizing of a stored, multi-token
      AppParameters string can mangle a quoted, space-containing path (a
      wrapped mcp-proxy process's stderr showed "Error: Cannot find module
      'C:\Program'", i.e. truncated at the space) regardless of how
      carefully it's quoted when set -- see AppParameters below. A short
      directory sidesteps the whole class of bug: nothing left for any
      tokenizer, ours or NSSM's, to mis-split. Every Windows filesystem has
      these by default (short-name generation is only disabled by an
      explicit, uncommon opt-out via `fsutil 8dot3name`) -- if that returns
      the input unchanged (already no spaces, or 8.3 generation is
      disabled and the directory doesn't need it), that's fine; only
      directories that actually contain a space need this.
    #>
    param([Parameter(Mandatory = $true)][string] $Path)
    $fso = New-Object -ComObject Scripting.FileSystemObject
    $directory = Split-Path -Path $Path -Parent
    $leaf = Split-Path -Path $Path -Leaf
    $shortDirectory = $fso.GetFolder($directory).ShortPath
    return Join-Path $shortDirectory $leaf
}

function Invoke-Nssm {
    param([string[]] $NssmArgs, [switch] $Redact)
    if ($Redact) {
        # Password-bearing call (ObjectName): log every arg except the last
        # (the password itself) so the plaintext never lands in this
        # script's own stdout — which WixQuietExec captures straight into
        # msiexec's verbose log otherwise.
        $loggable = $NssmArgs[0..($NssmArgs.Count - 2)] + "********"
        Write-Host "nssm $($loggable -join ' ')"
    } else {
        Write-Host "nssm $($NssmArgs -join ' ')"
    }
    & $NssmExe @NssmArgs
    if ($LASTEXITCODE -ne 0) {
        throw "nssm $($NssmArgs[0]) failed for service '$ServiceName' with exit code $LASTEXITCODE"
    }
}

# `nssm install <name> <program>` — program only, no arguments here. Arguments
# are set separately via AppParameters below.
#
# CRITICAL: the two path arguments embedded in AppParameters (McpProxyEntry,
# TargetExe) are converted to their 8.3 SHORT path form (Get-ShortPath)
# rather than quoted. Confirmed by a real install: NSSM's own docs say
# `nssm set <name> AppParameters <multiple args>` just re-concatenates them
# with single spaces (i.e. it does NOT store discrete, quote-safe tokens
# even when given separate arguments here) -- so however this call is
# shaped, NSSM ends up storing ONE space-joined string that it must
# re-tokenize itself later to build the actual child-process command line.
# That re-tokenizing mangled a quoted, space-containing path regardless of
# how carefully it was quoted (a wrapped Node process's own stderr showed
# "Error: Cannot find module 'C:\Program'" -- truncated at the space). A
# short path has no spaces at all, so there's nothing left for any
# tokenizer -- NSSM's or Node's -- to mis-split. This is a second instance
# of the exact class of bug installer/windows/README.md already documents
# for `nssm install`'s own command line (which is why that call is
# deliberately kept to just the program, no arguments).
if ($NativeHttp) {
    # video-mcp-server (and any future server with its own built-in HTTP
    # transport) needs no mcp-proxy wrapping: NSSM runs the server exe
    # itself, with the single "--http" flag it checks via
    # `process.argv.includes("--http")` (src/video/server.ts).
    Invoke-Nssm @("install", $ServiceName, $TargetExe)
    Invoke-Nssm @("set", $ServiceName, "AppParameters", "--http")
} else {
    Invoke-Nssm @("install", $ServiceName, $NodeExe)

    # mcp-proxy invocation, matching the exact shape of the macOS launch-agent
    # scripts' `npx mcp-proxy@6.4.4 --host 127.0.0.1 --port <port> --server stream
    # --streamEndpoint /mcp -- <exe>`, but running the vendored copy directly via
    # node.exe instead of fetching mcp-proxy over the network at service-start.
    $shortMcpProxyEntry = Get-ShortPath -Path $McpProxyEntry
    $shortTargetExe = Get-ShortPath -Path $TargetExe
    Invoke-Nssm @("set", $ServiceName, "AppParameters", $shortMcpProxyEntry, "--host", "127.0.0.1", "--port", "$Port", "--server", "stream", "--streamEndpoint", "/mcp", "--", $shortTargetExe)
}

# Trim a trailing backslash before handing this to NSSM: Product.wxs passes
# [INSTALLFOLDER] (which WiX always resolves WITH a trailing backslash) as
# -InstallRoot, but the manual/dev invocation of this script (no trailing
# backslash) is the one confirmed by direct testing to actually let the
# resulting service start; the MSI-driven one (trailing backslash) crash-
# looped every ~30s with the SCM logging "The system cannot find the path
# specified" even with an already-fully-resolved, existing AppDirectory —
# strongly suggesting NSSM's own AppDirectory handling doesn't tolerate one.
$appDirectory = $InstallRoot.TrimEnd('\')
Invoke-Nssm @("set", $ServiceName, "AppDirectory", $appDirectory)

Invoke-Nssm @("set", $ServiceName, "AppEnvironmentExtra", "$PortEnvVar=$Port")

# Run-as account (lets the installing admin pick which account each service
# runs as, instead of always NSSM's own LocalSystem default). Only touched
# when -ServiceAccount names a REAL, non-built-in account — matching one of
# the well-known no-password accounts (including the "LocalSystem" literal
# Product.wxs's SERVICEACCOUNT property defaults to) is treated as "leave
# NSSM's own default alone" rather than redundantly re-setting it (and
# avoids having to guess whether NSSM tolerates an extra empty/placeholder
# password argument for those accounts). NSSM's own `ObjectName` setter
# grants a real custom account SeServiceLogonRight via LSA itself when a
# password is supplied, so no separate "Log on as a service" grant step is
# needed here.
$wellKnownNoPasswordAccounts = @(
    "localsystem", ".\localsystem", "nt authority\system",
    "localservice", ".\localservice", "nt authority\localservice",
    "networkservice", ".\networkservice", "nt authority\networkservice"
)
$normalizedAccount = $ServiceAccount.Trim().ToLowerInvariant()
if ($normalizedAccount -and ($normalizedAccount -notin $wellKnownNoPasswordAccounts)) {
    if ([string]::IsNullOrWhiteSpace($ServicePasswordFile) -or -not (Test-Path -LiteralPath $ServicePasswordFile -PathType Leaf)) {
        throw "register-service.ps1: -ServiceAccount '$ServiceAccount' is not a well-known built-in account, so -ServicePasswordFile must point at an existing file containing its password."
    }
    # Read fresh each call rather than deleting after use: 4 separate
    # services may all need this same file in one install run. The caller
    # who created it owns deleting it once every service is registered —
    # see -ServicePasswordFile's own doc comment above for why this is a
    # file path and not a plain string parameter.
    $password = (Get-Content -LiteralPath $ServicePasswordFile -Raw).TrimEnd("`r", "`n")
    Invoke-Nssm @("set", $ServiceName, "ObjectName", $ServiceAccount, $password) -Redact
}

# NSSM discards a wrapped process's stdout/stderr entirely unless AppStdout/
# AppStderr are set — without this there is no log at all, anywhere. Create
# the directory first: NSSM does not create missing parent directories for
# these paths on its own.
if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}
$stdoutLog = Join-Path $LogDir "$ServiceName.out.log"
$stderrLog = Join-Path $LogDir "$ServiceName.err.log"
Invoke-Nssm @("set", $ServiceName, "AppStdout", $stdoutLog)
Invoke-Nssm @("set", $ServiceName, "AppStderr", $stderrLog)
# Rotate on service (re)start so logs don't grow unbounded across restarts —
# NSSM's own built-in rotation (not a custom log-rotation tool).
Invoke-Nssm @("set", $ServiceName, "AppRotateFiles", "1")
Invoke-Nssm @("set", $ServiceName, "AppRotateOnline", "1")
Invoke-Nssm @("set", $ServiceName, "AppRotateBytes", "10485760")

# Restart-on-crash (the KeepAlive-equivalent behavior the macOS plists get for
# free), with a throttle so a fast-failing process (e.g. Node/npx missing)
# backs off instead of hammering restart in a tight CPU-spinning loop.
Invoke-Nssm @("set", $ServiceName, "AppThrottle", "5000")
Invoke-Nssm @("set", $ServiceName, "AppExit", "Default", "Restart")

Write-Host "Service '$ServiceName' registered successfully."
