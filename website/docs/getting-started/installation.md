---
sidebar_position: 2
---

# Installation

## Clone the Repository

```bash
git clone https://github.com/catesandrew/mcp-agent-bridge.git
cd mcp-agent-bridge
```

## Install Dependencies

```bash
bun install
```

## Build

### TypeScript Compilation

```bash
bun run build
```

This compiles TypeScript source to `dist/` as ES modules.

### Standalone Binaries

```bash
bun run build:exe
```

Produces self-contained executables in `exe/` using Bun's `--compile` flag. These binaries have zero runtime dependencies -- no Node.js or Bun needed to run them.

## Install Binaries

### macOS / Linux

The included installer script handles everything:

```bash
# Build and install binaries to ~/.local/bin
./install.sh

# Also set up macOS LaunchAgents
./install.sh --launchd

# Set up LaunchAgents and start them immediately
./install.sh --launchd --load
```

#### Custom Install Prefix

```bash
./install.sh --prefix /usr/local
```

### Windows

The recommended way to install on Windows is the double-click **[MSI installer](../deployment/windows-msi)**
-- it registers all three services (Claude, Codex, Copilot) as Windows Services with sane defaults,
no PowerShell required. See [Windows MSI Installer](../deployment/windows-msi) for download,
verification, and configuration details.

If you'd rather script the install (CI, provisioning, or environments where MSI installs are
restricted), `install.ps1` remains available:

```powershell
# Build and install binaries
.\examples\windows\install.ps1

# Custom install location
.\examples\windows\install.ps1 -Prefix "C:\tools"

# Install as HTTP background services
.\examples\windows\install.ps1 -HttpService
```

See [Windows Deployment](../deployment/windows) for full details on the `install.ps1` approach.

## Verify

After installation, verify the binaries are accessible:

```bash
which claude-mcp-server    # Should show ~/.local/bin/claude-mcp-server
which codex-mcp-server
which copilot-mcp-server
```

## Pre-built Binaries

Pre-built binaries for all platforms are available from [GitHub Releases](https://github.com/catesandrew/mcp-agent-bridge/releases). Download the appropriate binary for your platform and place it on your PATH.

| Platform | Binary |
|----------|--------|
| macOS ARM64 (Apple Silicon) | `claude-mcp-server-darwin-arm64` |
| macOS x64 (Intel) | `claude-mcp-server-darwin-x64` |
| Linux x64 | `claude-mcp-server-linux-x64` |
| Linux ARM64 | `claude-mcp-server-linux-arm64` |
| Windows x64 | `claude-mcp-server-windows-x64.exe` |
