---
sidebar_position: 3
---

# Linux Deployment

On Linux, MCP Agent Bridge can run as systemd user services.

## Install Binaries

```bash
# Build standalone binaries
bun run build:exe

# Copy to a directory on your PATH
cp exe/claude-mcp-server ~/.local/bin/
cp exe/codex-mcp-server ~/.local/bin/
cp exe/copilot-mcp-server ~/.local/bin/
```

Or download pre-built binaries from [GitHub Releases](https://github.com/catesandrew/mcp-agent-bridge/releases).

## systemd User Services

Create service files for each bridge:

### Claude

```ini
# ~/.config/systemd/user/claude-mcp.service
[Unit]
Description=Claude MCP Bridge
After=network.target

[Service]
ExecStart=%h/.local/bin/claude-mcp-server
Restart=on-failure
RestartSec=5
Environment=CLAUDE_REVIEW_MODEL=opus
Environment=CLAUDE_REVIEW_ALLOWED_TOOLS=Read,Grep,Glob,LS

[Install]
WantedBy=default.target
```

### With HTTP Proxy

To expose over HTTP (recommended for multi-client use):

```ini
# ~/.config/systemd/user/claude-mcp-http.service
[Unit]
Description=Claude MCP Bridge (HTTP)
After=network.target

[Service]
ExecStart=npx mcp-proxy --port 8940 -- %h/.local/bin/claude-mcp-server
Restart=on-failure
RestartSec=5
Environment=CLAUDE_REVIEW_MODEL=opus
Environment=CLAUDE_MCP_HTTP_PORT=8940
Environment=PATH=%h/.local/bin:%h/.nvm/versions/node/v20.0.0/bin:/usr/local/bin:/usr/bin

[Install]
WantedBy=default.target
```

### Codex and Copilot

Follow the same pattern, substituting the binary name and port:

| Service | Binary | Port |
|---------|--------|------|
| Codex | `codex-mcp-server` | 8941 |
| Copilot | `copilot-mcp-server` | 8945 |

## Managing Services

```bash
# Reload service files after changes
systemctl --user daemon-reload

# Enable and start
systemctl --user enable --now claude-mcp-http.service

# Check status
systemctl --user status claude-mcp-http.service

# View logs
journalctl --user -u claude-mcp-http.service -f

# Stop
systemctl --user stop claude-mcp-http.service
```

## Enable Lingering

By default, systemd user services only run while the user is logged in. To keep them running after logout:

```bash
loginctl enable-linger $USER
```
