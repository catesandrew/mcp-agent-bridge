<#
.SYNOPSIS
    Installs mcp-agent-bridge executables on Windows.

.DESCRIPTION
    Builds standalone executables using bun and copies them to a directory
    on your PATH. Optionally registers them as Windows Services via NSSM.

.PARAMETER Prefix
    Directory to install binaries to. Default: $env:LOCALAPPDATA\mcp-agent-bridge\bin

.PARAMETER Service
    Register the servers as Windows Services via NSSM (stdio mode).

.PARAMETER HttpService
    Register the servers as Windows Services behind mcp-proxy (HTTP mode).
    Each server is accessible via HTTP on its configured port.

.PARAMETER Uninstall
    Remove the Windows Services.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Prefix "C:\tools\mcp"
    .\install.ps1 -Service
    .\install.ps1 -HttpService
    .\install.ps1 -Uninstall
#>
param(
    [string]$Prefix = "$env:LOCALAPPDATA\mcp-agent-bridge\bin",
    [switch]$Service,
    [switch]$HttpService,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)

$Servers = @(
    @{ Name = "claude-mcp-server";  Port = 8940; Label = "McpBridgeClaude"  }
    @{ Name = "codex-mcp-server";   Port = 8941; Label = "McpBridgeCodex"   }
    @{ Name = "copilot-mcp-server"; Port = 8945; Label = "McpBridgeCopilot" }
)

# ── Uninstall services ────────────────────────────────────────────────────────
if ($Uninstall) {
    foreach ($srv in $Servers) {
        foreach ($suffix in @("", "Http")) {
            $svcName = "$($srv.Label)$suffix"
            $existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($existing) {
                Write-Host "  Stopping $svcName..."
                Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
                & nssm remove $svcName confirm 2>$null
                Write-Host "  Removed $svcName"
            } else {
                Write-Host "  Not installed: $svcName"
            }
        }
    }
    exit 0
}

# ── Build ─────────────────────────────────────────────────────────────────────
Write-Host "  Building standalone executables..."
Push-Location $RepoRoot
try {
    & bun install --frozen-lockfile 2>$null | Out-Null
    & bun run build:exe 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed. Run 'bun run build:exe' to see errors."
        exit 1
    }
    Write-Host "  Build successful"
} finally {
    Pop-Location
}

# ── Install binaries ──────────────────────────────────────────────────────────
if (-not (Test-Path $Prefix)) {
    New-Item -ItemType Directory -Path $Prefix -Force | Out-Null
}

Write-Host "  Installing binaries to $Prefix..."
foreach ($srv in $Servers) {
    $src = Join-Path $RepoRoot "exe\$($srv.Name).exe"
    if (-not (Test-Path $src)) {
        # bun compile on windows may not add .exe — check both
        $src = Join-Path $RepoRoot "exe\$($srv.Name)"
    }
    $dst = Join-Path $Prefix "$($srv.Name).exe"
    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "  $($srv.Name).exe"
}

Write-Host ""
Write-Host "Binaries installed to $Prefix"

# Add to PATH if not already there
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$Prefix*") {
    Write-Host "  Adding $Prefix to user PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$Prefix", "User")
    $env:PATH = "$env:PATH;$Prefix"
    Write-Host "  PATH updated (restart terminal to take effect)"
}

# ── Windows Services (optional) ───────────────────────────────────────────────
if ($Service) {
    $nssm = Get-Command nssm -ErrorAction SilentlyContinue
    if (-not $nssm) {
        Write-Error @"
NSSM (Non-Sucking Service Manager) is required for Windows Service registration.
Install via: choco install nssm  or  scoop install nssm
Then re-run: .\install.ps1 -Service
"@
        exit 1
    }

    foreach ($srv in $Servers) {
        $svcName = $srv.Label
        $exePath = Join-Path $Prefix "$($srv.Name).exe"
        $port = $srv.Port

        # Remove existing service if present
        $existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "  Updating $svcName..."
            Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
            & nssm remove $svcName confirm 2>$null
        }

        Write-Host "  Creating service $svcName on port $port..."
        & nssm install $svcName $exePath
        & nssm set $svcName DisplayName "MCP Bridge - $($srv.Name)"
        & nssm set $svcName Description "MCP Agent Bridge server for $($srv.Name)"
        & nssm set $svcName Start SERVICE_AUTO_START
        & nssm set $svcName AppStdout "$env:LOCALAPPDATA\mcp-agent-bridge\logs\$($srv.Name).out.log"
        & nssm set $svcName AppStderr "$env:LOCALAPPDATA\mcp-agent-bridge\logs\$($srv.Name).err.log"
        & nssm set $svcName AppRotateFiles 1
        & nssm set $svcName AppRotateBytes 10485760

        # Create log directory
        $logDir = "$env:LOCALAPPDATA\mcp-agent-bridge\logs"
        if (-not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }

        Start-Service -Name $svcName
        Write-Host "  Started $svcName"
    }

    Write-Host ""
    Write-Host "Stdio services registered and started."
    Write-Host "  Connect via stdio in your MCP client configuration."
}

# ── Windows HTTP Services (optional) ──────────────────────────────────────────
if ($HttpService) {
    $nssm = Get-Command nssm -ErrorAction SilentlyContinue
    if (-not $nssm) {
        Write-Error @"
NSSM (Non-Sucking Service Manager) is required for Windows Service registration.
Install via: choco install nssm  or  scoop install nssm
Then re-run: .\install.ps1 -HttpService
"@
        exit 1
    }

    # Ensure mcp-proxy is available
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npx) {
        Write-Error "npx is required for mcp-proxy. Install Node.js first."
        exit 1
    }

    $logDir = "$env:LOCALAPPDATA\mcp-agent-bridge\logs"
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }

    foreach ($srv in $Servers) {
        $svcName = "$($srv.Label)Http"
        $exePath = Join-Path $Prefix "$($srv.Name).exe"
        $port = $srv.Port

        # Remove existing service if present
        $existing = Get-Service -Name $svcName -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "  Updating $svcName..."
            Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
            & nssm remove $svcName confirm 2>$null
        }

        Write-Host "  Creating HTTP service $svcName on port $port..."

        # NSSM runs: npx mcp-proxy --host 127.0.0.1 --port <port> --server stream --streamEndpoint /mcp -- <exe>
        $npxPath = (Get-Command npx).Source
        & nssm install $svcName $npxPath "mcp-proxy@6.4.4 --host 127.0.0.1 --port $port --server stream --streamEndpoint /mcp -- `"$exePath`""
        & nssm set $svcName DisplayName "MCP Bridge HTTP - $($srv.Name)"
        & nssm set $svcName Description "MCP Agent Bridge HTTP proxy for $($srv.Name) on port $port"
        & nssm set $svcName Start SERVICE_AUTO_START
        & nssm set $svcName AppDirectory (Split-Path $exePath)
        & nssm set $svcName AppStdout "$logDir\$($srv.Name)-http.out.log"
        & nssm set $svcName AppStderr "$logDir\$($srv.Name)-http.err.log"
        & nssm set $svcName AppRotateFiles 1
        & nssm set $svcName AppRotateBytes 10485760

        Start-Service -Name $svcName
        Write-Host "  Started $svcName -> http://127.0.0.1:$port/mcp"
    }

    Write-Host ""
    Write-Host "HTTP services registered and started."
    Write-Host "  Claude:  http://127.0.0.1:8940/mcp"
    Write-Host "  Codex:   http://127.0.0.1:8941/mcp"
    Write-Host "  Copilot: http://127.0.0.1:8945/mcp"
}

Write-Host "Done."
