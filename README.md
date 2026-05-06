# mcp-agent-bridge

Bridges AI coding agents (Claude Code, OpenAI Codex, GitHub Copilot) as MCP servers behind HTTP proxies so they can be instantiated once and used by each other for code reviews, analysis, and cross-validation.

## Quick Start

```bash
bun install
bun run build
./install.sh --load
```

## Architecture

Each agent runs as a singleton macOS LaunchAgent behind [`mcp-proxy`](https://github.com/nicholasgasior/mcp-proxy) (HTTP/SSE), bound to `127.0.0.1`:

| Server | Port | Label | Description |
|--------|------|-------|-------------|
| Claude | 8940 | `osx.mcp.claude` | Wraps `claude -p` with review, ask, and code_review tools |
| Codex | 8941 | `osx.mcp.codex` | Passthrough to `codex mcp-server` |
| Copilot | 8942 | `osx.mcp.copilot` | Placeholder (awaiting CLI MCP support) |

```
mcp-agent-bridge/
├── src/
│   ├── shared/          # Types, server factory
│   ├── claude/          # Claude -p wrapper + runner
│   ├── codex/           # Codex CLI passthrough
│   └── copilot/         # Copilot placeholder
├── bin/                 # stdio entry scripts
├── launchd/             # LaunchAgent plists + launcher scripts
├── exe/                 # Standalone executables (bun build --compile)
├── skills/dual-review/  # Claude Code slash command
└── install.sh           # Dotfiles installer
```

## Claude MCP Server

The most capable bridge. Spawns `claude -p` as a child process and exposes three MCP tools:

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
| `CLAUDE_REVIEW_MODEL` | `opus` | Model for review operations |
| `CLAUDE_REVIEW_MAX_TURNS` | (none) | Max agentic turns per invocation |
| `CLAUDE_REVIEW_CWD` | (none) | Working directory for Claude |
| `CLAUDE_REVIEW_ALLOWED_TOOLS` | `Read,Grep,Glob,LS` | Comma-separated tool allowlist |
| `CLAUDE_REVIEW_PERMISSION_MODE` | `dontAsk` | Permission mode for the CLI |
| `CLAUDE_REVIEW_TIMEOUT_MS` | `300000` | Process timeout in milliseconds |
| `CLAUDE_ALLOWED_CWD_ROOTS` | `$PWD` | Colon-separated allowed cwd roots |

## Codex MCP Server

Pure passthrough to `codex mcp-server`, which natively exposes `codex` and `codex-reply` tools. The bridge simply proxies it behind HTTP on port 8941.

## Copilot MCP Server

Placeholder with a single `status` tool. Will be updated when `copilot-cli mcp-server` is available.

## Building

```bash
# TypeScript compilation (for Node.js / LaunchAgent usage)
bun run build

# Standalone executables (no runtime required)
bun run build:exe
ls exe/claude-mcp-server exe/copilot-mcp-server
```

The `build:exe` script uses `bun build --compile` to produce self-contained Mach-O binaries for the Claude and Copilot servers. Codex is excluded since it's a passthrough to an external CLI.

## Testing

```bash
bun run test        # single run
bun run test:watch  # watch mode
```

26 tests across 5 suites covering tool registration, argument construction, error handling, and MCP integration via `InMemoryTransport`.

## Installation

The install script symlinks LaunchAgent plists and launcher scripts into your dotfiles:

```bash
./install.sh          # symlink only
./install.sh --load   # symlink + start agents
./install.sh --unload # stop agents
```

What it does:
1. Builds the TypeScript project
2. Symlinks `launchd/osx.mcp.*.plist` to `~/.dotfiles/home/Library/LaunchAgents/`
3. Symlinks `launchd/launch-agent-*-mcp-http` to `~/.dotfiles/home/.bin/`
4. Runs `dfm install` to activate symlinks
5. Optionally loads LaunchAgents via `launchctl`

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
      "command": "node",
      "args": ["dist/claude/server.js"],
      "env": { "CLAUDE_REVIEW_MODEL": "opus" }
    }
  }
}
```

Or use the standalone executables:

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
- [`mcp-proxy`](https://github.com/nicholasgasior/mcp-proxy) -- installed globally or via npx

## License

Private -- not published.
