---
sidebar_position: 3
---

# Port Configuration

Each MCP bridge server runs on its own HTTP port. Here are the defaults and how to change them.

## Default Ports

| Server | Port | Environment Variable |
|--------|------|---------------------|
| Claude | 8940 | `CLAUDE_MCP_HTTP_PORT` |
| Codex | 8941 | `CODEX_MCP_HTTP_PORT` |
| Copilot | 8945 | `COPILOT_MCP_HTTP_PORT` |

All servers bind to `127.0.0.1` (localhost only) for security.

## Changing Ports

### Environment Variable

```bash
CLAUDE_MCP_HTTP_PORT=9940 npx mcp-proxy --port 9940 -- claude-mcp-server
```

### macOS (env file)

```bash
echo "CLAUDE_MCP_HTTP_PORT=9940" > ~/.local/share/launch-agent-env/claude-mcp-http.env
# Then reload the LaunchAgent
```

### Windows

```powershell
[Environment]::SetEnvironmentVariable("CLAUDE_MCP_HTTP_PORT", "9940", "User")
# Then restart the service
```

### Linux (systemd)

```ini
[Service]
Environment=CLAUDE_MCP_HTTP_PORT=9940
```

## Stream Endpoint

The HTTP endpoint path defaults to `/mcp` for all servers. Override with:

- `CLAUDE_MCP_STREAM_ENDPOINT`
- `CODEX_MCP_STREAM_ENDPOINT`
- `COPILOT_MCP_STREAM_ENDPOINT`

The full URL is `http://localhost:{PORT}{ENDPOINT}`, e.g., `http://localhost:8940/mcp`.
