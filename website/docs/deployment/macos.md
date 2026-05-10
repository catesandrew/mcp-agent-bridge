---
sidebar_position: 1
---

# macOS Deployment

On macOS, MCP Agent Bridge runs as LaunchAgents -- background daemons that start automatically on login.

## Quick Install

```bash
# Build binaries, install to ~/.local/bin, set up LaunchAgents, and start
./install.sh --launchd --load
```

## How It Works

The installer sets up a three-layer stack:

```
LaunchAgent (plist)
  └── Launcher script (bash)
        └── mcp-proxy --port PORT -- mcp-server-binary
```

1. **Plist files** define the LaunchAgent (auto-start, keep-alive, logging)
2. **Launcher scripts** set up the environment (PATH, nvm, logging) then exec the proxy
3. **mcp-proxy** wraps the stdio-based MCP server as an HTTP endpoint

## Services

| Service | Port | LaunchAgent Label |
|---------|------|-------------------|
| Claude | 8940 | `osx.mcp.claude` |
| Codex | 8941 | `osx.mcp.codex` |
| Copilot | 8945 | `osx.mcp.copilot` |

## Managing Services

```bash
# Load (start) all agents
launchctl load ~/Library/LaunchAgents/osx.mcp.claude.plist
launchctl load ~/Library/LaunchAgents/osx.mcp.codex.plist
launchctl load ~/Library/LaunchAgents/osx.mcp.copilot.plist

# Unload (stop) all agents
launchctl unload ~/Library/LaunchAgents/osx.mcp.claude.plist
launchctl unload ~/Library/LaunchAgents/osx.mcp.codex.plist
launchctl unload ~/Library/LaunchAgents/osx.mcp.copilot.plist

# Check status
launchctl list | grep osx.mcp
```

## Logs

Logs are written to `~/Library/Logs/`:

```bash
# View Claude bridge logs
tail -f ~/Library/Logs/osx.mcp.claude.out.log
tail -f ~/Library/Logs/osx.mcp.claude.err.log
```

## Custom Ports

Override ports via environment files:

```bash
# Create the env directory
mkdir -p ~/.local/share/launch-agent-env

# Override Claude's port
echo "CLAUDE_MCP_HTTP_PORT=9940" > ~/.local/share/launch-agent-env/claude-mcp-http.env
```

Then reload the LaunchAgent for changes to take effect.

## Installer Options

```bash
./install.sh                    # Build + install binaries only
./install.sh --launchd          # Also install plist + launcher scripts
./install.sh --launchd --load   # Also load agents immediately
./install.sh --unload           # Stop all agents
./install.sh --prefix /usr/local  # Custom install prefix
```

## Example Plist

The plist files are located in `examples/macos/`. Here's the structure:

```xml
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>osx.mcp.claude</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-lc</string>
        <string>exec "$HOME/.bin/launch-agent-claude-mcp-http"</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
```
