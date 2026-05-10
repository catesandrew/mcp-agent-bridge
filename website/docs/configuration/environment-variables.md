---
sidebar_position: 1
---

# Environment Variables

All MCP Agent Bridge servers are configured through environment variables. No config files are required.

## Claude {#claude}

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_REVIEW_MODEL` | `opus` | Claude model to use for reviews |
| `CLAUDE_REVIEW_MAX_TURNS` | *(unset)* | Maximum agentic turns per review |
| `CLAUDE_REVIEW_CWD` | *(unset)* | Working directory for the Claude subprocess |
| `CLAUDE_REVIEW_ALLOWED_TOOLS` | `Read,Grep,Glob,LS` | Comma-separated tool allowlist |
| `CLAUDE_REVIEW_PERMISSION_MODE` | `dontAsk` | Permission handling mode |
| `CLAUDE_REVIEW_TIMEOUT_MS` | `300000` | Process timeout in milliseconds (5 min) |
| `CLAUDE_ALLOWED_CWD_ROOTS` | `$PWD` | Colon-separated list of allowed working directories |
| `CLAUDE_MCP_HTTP_PORT` | `8940` | HTTP proxy port |
| `CLAUDE_MCP_STREAM_ENDPOINT` | `/mcp` | Streamable HTTP endpoint path |

## Codex {#codex}

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEX_REVIEW_MODEL` | *(unset)* | Model override for Codex |
| `CODEX_REVIEW_AGENT_PATH` | `~/.codex/agents/code-reviewer.toml` | Path to agent TOML config |
| `CODEX_MCP_HTTP_PORT` | `8941` | HTTP proxy port |
| `CODEX_MCP_STREAM_ENDPOINT` | `/mcp` | Streamable HTTP endpoint path |

## Copilot {#copilot}

| Variable | Default | Description |
|----------|---------|-------------|
| `COPILOT_REVIEW_MODEL` | *(unset)* | Model override for Copilot |
| `COPILOT_MCP_HTTP_PORT` | `8945` | HTTP proxy port |
| `COPILOT_MCP_STREAM_ENDPOINT` | `/mcp` | Streamable HTTP endpoint path |

## Setting Variables

### macOS (LaunchAgent env files)

```bash
mkdir -p ~/.local/share/launch-agent-env
echo "CLAUDE_REVIEW_MODEL=sonnet" > ~/.local/share/launch-agent-env/claude-mcp-http.env
```

### Windows

```powershell
.\examples\windows\env-setup.ps1 -ClaudeModel sonnet
```

### Linux (systemd)

Add `Environment=` lines to your service file:

```ini
[Service]
Environment=CLAUDE_REVIEW_MODEL=sonnet
Environment=CLAUDE_REVIEW_TIMEOUT_MS=600000
```

### Direct (any platform)

```bash
CLAUDE_REVIEW_MODEL=sonnet claude-mcp-server
```
