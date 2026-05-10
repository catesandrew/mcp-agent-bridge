---
sidebar_position: 2
---

# Windows Deployment

On Windows, MCP Agent Bridge can run as background services managed by [NSSM](https://nssm.cc/) (Non-Sucking Service Manager).

## Quick Install

```powershell
# Build and install binaries
.\examples\windows\install.ps1

# Install as HTTP background services
.\examples\windows\install.ps1 -HttpService
```

## Install Options

```powershell
# Custom install location
.\examples\windows\install.ps1 -Prefix "C:\tools"

# Stdio services (no HTTP proxy)
.\examples\windows\install.ps1 -Service

# HTTP services (with mcp-proxy)
.\examples\windows\install.ps1 -HttpService

# Uninstall services
.\examples\windows\install.ps1 -Uninstall
```

## Default Paths

| Item | Path |
|------|------|
| Binaries | `%LOCALAPPDATA%\mcp-agent-bridge\bin\` |
| Logs | `%LOCALAPPDATA%\mcp-agent-bridge\logs\` |

The installer automatically adds the binary directory to your user PATH.

## Environment Configuration

Use the included script to configure environment variables:

```powershell
# Apply defaults
.\examples\windows\env-setup.ps1

# Custom model
.\examples\windows\env-setup.ps1 -ClaudeModel sonnet

# View current configuration
.\examples\windows\env-setup.ps1 -Show

# Remove all configuration
.\examples\windows\env-setup.ps1 -Remove
```

## Managing Services

```powershell
# Start a service
nssm start claude-mcp-http

# Stop a service
nssm stop claude-mcp-http

# Check status
nssm status claude-mcp-http

# View logs
Get-Content "$env:LOCALAPPDATA\mcp-agent-bridge\logs\claude.out.log" -Tail 50
```

## Prerequisites

- **Bun** -- for building standalone executables
- **NSSM** -- for service management (`choco install nssm`)
- **mcp-proxy** -- for HTTP mode (`npm install -g mcp-proxy`)
