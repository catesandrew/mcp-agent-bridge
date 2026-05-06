# mcp-agent-bridge

Bridges AI coding agents (Claude Code, OpenAI Codex, GitHub Copilot) as MCP servers behind HTTP proxies so they can be instantiated once and used by each other for code reviews, analysis, and cross-validation.

## Quick Start

```bash
# Install binaries to ~/.local/bin
./install.sh

# Or with macOS LaunchAgents (persistent background services)
./install.sh --launchd --load
```

## Architecture

Each agent runs as a singleton macOS LaunchAgent behind [`mcp-proxy`](https://github.com/nicholasgasior/mcp-proxy) (HTTP/SSE), bound to `127.0.0.1`:

| Server | Port | Label | Description |
|--------|------|-------|-------------|
| Claude | 8940 | `osx.mcp.claude` | Wraps `claude -p` with review, ask, and code_review tools |
| Codex | 8941 | `osx.mcp.codex` | Wraps `codex exec` with codex, code_review, and codex_reply tools |
| Copilot | 8945 | `osx.mcp.copilot` | Wraps `copilot -p` with ask and code_review tools |

```
mcp-agent-bridge/
├── src/
│   ├── shared/          # Types, server factory
│   ├── claude/          # Claude -p wrapper + runner
│   ├── codex/           # Codex exec wrapper + agent toml integration
│   └── copilot/         # Copilot -p wrapper + JSONL parser
├── bin/                 # stdio entry scripts (node)
├── exe/                 # Standalone executables (bun build --compile)
├── examples/
│   ├── macos/           # LaunchAgent plists + launcher scripts
│   └── windows/         # PowerShell installer + env setup
├── skills/dual-review/  # Claude Code slash command
└── install.sh           # Cross-platform installer
```

## Claude MCP Server

Spawns `claude -p` as a child process and exposes three MCP tools:

### Tools

**`review`** -- Send code, a plan, or a diff for structured review. Returns JSON:

```json
{
  "verdict": "APPROVED",
  "issues": [{ "severity": "critical", "description": "...", "recommendation": "..." }],
  "suggestions": ["..."]
}
```

**`ask`** -- Ask Claude a freeform question about the codebase. Returns text.

**`code_review`** -- Specialized review that accepts a git diff. Returns the same structured JSON as `review`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MCP_HTTP_PORT` | `8940` | HTTP proxy port |
| `CLAUDE_MCP_STREAM_ENDPOINT` | `/mcp` | Streamable HTTP endpoint path |
| `CLAUDE_REVIEW_MODEL` | `opus` | Model for review operations |
| `CLAUDE_REVIEW_MAX_TURNS` | (none) | Max agentic turns per invocation |
| `CLAUDE_REVIEW_CWD` | (none) | Working directory for Claude |
| `CLAUDE_REVIEW_ALLOWED_TOOLS` | `Read,Grep,Glob,LS` | Comma-separated tool allowlist |
| `CLAUDE_REVIEW_PERMISSION_MODE` | `dontAsk` | Permission mode for the CLI |
| `CLAUDE_REVIEW_TIMEOUT_MS` | `300000` | Process timeout in milliseconds |
| `CLAUDE_ALLOWED_CWD_ROOTS` | `$PWD` | Colon-separated allowed cwd roots |

## Codex MCP Server

Wraps `codex exec` with three MCP tools:

**`codex`** -- Send a prompt to Codex for code generation or analysis.

**`code_review`** -- Send a diff for structured review. Loads `~/.codex/agents/code-reviewer.toml` developer instructions when available for richer reviews. Returns structured JSON when possible, raw text otherwise.

**`codex_reply`** -- Continue a conversation (context passed inline, not stateful).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEX_MCP_HTTP_PORT` | `8941` | HTTP proxy port |
| `CODEX_MCP_STREAM_ENDPOINT` | `/mcp` | Streamable HTTP endpoint path |
| `CODEX_REVIEW_MODEL` | (none, uses config default) | Model override (e.g. `o3`, `gpt-5.4`) |
| `CODEX_REVIEW_AGENT_PATH` | `~/.codex/agents/code-reviewer.toml` | Path to agent toml for code_review instructions |

## Copilot MCP Server

Wraps `copilot -p --output-format json` with two MCP tools:

**`ask`** -- Ask Copilot a freeform question. Returns text.

**`code_review`** -- Send a diff for structured review. Returns structured JSON when possible, raw text otherwise.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COPILOT_MCP_HTTP_PORT` | `8945` | HTTP proxy port |
| `COPILOT_MCP_STREAM_ENDPOINT` | `/mcp` | Streamable HTTP endpoint path |
| `COPILOT_REVIEW_MODEL` | (none, uses config default) | Model override (e.g. `gpt-5.2`, `claude-sonnet-4.5`) |

## Building

```bash
# TypeScript compilation (for Node.js / LaunchAgent usage)
bun run build

# Standalone executables (no runtime required)
bun run build:exe
ls exe/claude-mcp-server exe/codex-mcp-server exe/copilot-mcp-server
```

The `build:exe` script uses `bun build --compile` to produce self-contained Mach-O binaries for all three servers.

## Testing

```bash
bun run test        # single run
bun run test:watch  # watch mode
```

36 tests across 5 suites covering tool registration, argument construction, error handling, and MCP integration via `InMemoryTransport`.

## Installation

### Any Platform

The install script builds standalone executables and copies them to a directory on your PATH:

```bash
./install.sh                          # install to ~/.local/bin (default)
./install.sh --prefix /usr/local/bin  # install to a custom location
```

After install, the servers are available as `claude-mcp-server`, `codex-mcp-server`, and `copilot-mcp-server` anywhere on your system. Use them directly via stdio or put them behind any HTTP proxy.

### macOS LaunchAgents

For persistent background services on macOS, use the `--launchd` flag:

```bash
./install.sh --launchd --load         # install binaries + LaunchAgents + start
./install.sh --launchd                # install without starting
./install.sh --unload                 # stop agents
```

This copies the example plists and launcher scripts from `examples/macos/` into your dotfiles structure (`~/.dotfiles/home/`), runs `dfm install`, and optionally loads the agents. Customize the dotfiles root with `--dotfiles DIR`.

### Port Overrides

Each server reads its port from an environment variable. On macOS, override via the env files that `launch-agent-runtime` loads:

```bash
# ~/.local/share/launch-agent-env/claude-mcp-http.env
CLAUDE_MCP_HTTP_PORT=9940

# ~/.local/share/launch-agent-env/codex-mcp-http.env
CODEX_MCP_HTTP_PORT=9941

# ~/.local/share/launch-agent-env/copilot-mcp-http.env
COPILOT_MCP_HTTP_PORT=9945
```

### Running Multiple Instances

To run multiple instances of the same server on different ports:

1. Copy the plist with a new label:
   ```bash
   cp examples/macos/osx.mcp.claude.plist examples/macos/osx.mcp.claude-2.plist
   # Edit: change Label to "osx.mcp.claude-2"
   # Edit: change launcher script to "launch-agent-claude-2-mcp-http"
   ```

2. Copy the launcher script:
   ```bash
   cp examples/macos/launch-agent-claude-mcp-http examples/macos/launch-agent-claude-2-mcp-http
   # Edit: change setup name to "claude-2-mcp-http"
   ```

3. Create an env file with the new port:
   ```bash
   echo 'CLAUDE_MCP_HTTP_PORT=8946' > ~/.local/share/launch-agent-env/claude-2-mcp-http.env
   ```

4. Install and load:
   ```bash
   ./install.sh --launchd --load
   ```

### Windows

Use the PowerShell installer in `examples/windows/`:

```powershell
# Install binaries to %LOCALAPPDATA%\mcp-agent-bridge\bin (added to PATH)
.\examples\windows\install.ps1

# Or install to a custom location
.\examples\windows\install.ps1 -Prefix "C:\tools\mcp"

# Register as Windows Services - stdio mode (requires NSSM and admin)
.\examples\windows\install.ps1 -Service

# Register as Windows Services - HTTP mode with mcp-proxy (requires NSSM, Node.js, and admin)
.\examples\windows\install.ps1 -HttpService

# Both modes at once
.\examples\windows\install.ps1 -Service -HttpService

# Remove all services
.\examples\windows\install.ps1 -Uninstall
```

**Stdio services** (`-Service`) register each server as a background process. Connect via stdio in your MCP client config.

**HTTP services** (`-HttpService`) wrap each server behind `mcp-proxy` on its configured port, accessible at `http://127.0.0.1:<port>/mcp`. This is the equivalent of the macOS LaunchAgent setup.

Both use [NSSM](https://nssm.cc/) (`choco install nssm` or `scoop install nssm`). Logs go to `%LOCALAPPDATA%\mcp-agent-bridge\logs\`.

#### Environment Variables (PowerShell)

Configure all servers at once:

```powershell
# Apply defaults
.\examples\windows\env-setup.ps1

# Custom settings
.\examples\windows\env-setup.ps1 -ClaudeModel sonnet -ClaudePort 9940

# View current settings
.\examples\windows\env-setup.ps1 -Show

# Remove all
.\examples\windows\env-setup.ps1 -Remove
```

Or set individually in PowerShell:

```powershell
# Session only
$env:CLAUDE_REVIEW_MODEL = "sonnet"
$env:CLAUDE_MCP_HTTP_PORT = "9940"

# Persistent (survives terminal restart)
[Environment]::SetEnvironmentVariable("CLAUDE_REVIEW_MODEL", "sonnet", "User")
[Environment]::SetEnvironmentVariable("CLAUDE_MCP_HTTP_PORT", "9940", "User")
```

### Linux systemd

The servers are standard stdio processes. Wrap with any process manager:

```ini
# ~/.config/systemd/user/claude-mcp.service
[Unit]
Description=Claude MCP Bridge
After=network.target

[Service]
ExecStart=%h/.local/bin/claude-mcp-server
Restart=on-failure
Environment=CLAUDE_REVIEW_MODEL=opus
Environment=CLAUDE_REVIEW_ALLOWED_TOOLS=Read,Grep,Glob,LS

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable claude-mcp.service
systemctl --user start claude-mcp.service
```

Put `mcp-proxy` in front for HTTP access, or connect directly via stdio.

## Consumer Configuration

Once running, any MCP client can connect. Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "streamable-http",
      "url": "http://localhost:8940/mcp"
    },
    "codex": {
      "type": "streamable-http",
      "url": "http://localhost:8941/mcp"
    },
    "copilot": {
      "type": "streamable-http",
      "url": "http://localhost:8945/mcp"
    }
  }
}
```

For direct stdio usage (without the HTTP proxy):

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "stdio",
      "command": "claude-mcp-server"
    }
  }
}
```

Or with the standalone executables:

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "stdio",
      "command": "./exe/claude-mcp-server"
    }
  }
}
```

## Dual-Review Skill

A Claude Code slash command (`/dual-review`) that orchestrates the review workflow:

1. Explore the codebase
2. Draft an implementation plan
3. Send plan to the reviewer MCP for structured review
4. Iterate on NEEDS_REVISION feedback (up to 3 rounds)
5. Implement after approval
6. Send final diff for post-implementation review
7. Present summary with review history

## Security

- All proxies bind to `127.0.0.1` (localhost only)
- Default read-only tool allowlist (Read, Grep, Glob, LS)
- Working directory (`cwd`) validated against allowed roots
- Input size limits (500K characters)
- Process timeout (5 min default) and output size cap (10MB)
- Spawn error handlers prevent unhandled crashes
- Runtime JSON structure validation on CLI output

## Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- Node.js >= 20 (via nvm, for LaunchAgent runtime)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) -- installed and authenticated
- [Codex CLI](https://github.com/openai/codex) -- installed and authenticated
- [Copilot CLI](https://githubnext.com/projects/copilot-cli) -- installed and authenticated
- [`mcp-proxy`](https://github.com/nicholasgasior/mcp-proxy) -- installed globally or via npx

## License

Private -- not published.
