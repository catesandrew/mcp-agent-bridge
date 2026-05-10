---
sidebar_position: 1
---

# Prerequisites

Before installing MCP Agent Bridge, ensure you have the following tools installed and configured.

## Required

### Bun (build tool)

Used to compile TypeScript and produce standalone binaries.

```bash
curl -fsSL https://bun.sh/install | bash
```

### Node.js >= 20

Required for the LaunchAgent runtime on macOS and for `mcp-proxy`.

```bash
# Using nvm (recommended)
nvm install 20
nvm use 20
```

### At Least One AI Agent CLI

You only need the CLI for the agents you plan to use:

| Agent | Install | Auth |
|-------|---------|------|
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | `claude` (follow prompts) |
| **OpenAI Codex** | `npm install -g @openai/codex` | `codex auth` |
| **GitHub Copilot** | Via [GitHub CLI extension](https://githubnext.com/projects/copilot-cli) | `gh auth login` |

### mcp-proxy

HTTP/SSE proxy that wraps stdio MCP servers for network access. Required for background service mode.

```bash
npm install -g mcp-proxy
# or use npx (auto-installed at runtime)
```

## Optional

### NSSM (Windows only)

[Non-Sucking Service Manager](https://nssm.cc/) -- used to register MCP servers as Windows Services.

```powershell
choco install nssm
# or download from https://nssm.cc/download
```

## Verify Installation

```bash
# Check build tools
bun --version    # >= 1.0
node --version   # >= 20.0

# Check agent CLIs (whichever you plan to use)
claude --version
codex --version
copilot --version

# Check proxy
npx mcp-proxy --help
```
