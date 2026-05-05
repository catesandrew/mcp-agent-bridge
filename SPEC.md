# mcp-agent-bridge

Bridges AI coding agents (Claude Code, OpenAI Codex, GitHub Copilot) as MCP servers behind HTTP proxies so they can be instantiated once and used by each other for code reviews, analysis, and cross-validation.

## Architecture

```
mcp-agent-bridge/
├── package.json              # Node.js ESM project, @modelcontextprotocol/sdk
├── src/
│   ├── shared/
│   │   └── server-factory.mjs  # Shared MCP server scaffolding + JSON schema helpers
│   ├── claude/
│   │   └── server.mjs         # Wraps `claude -p` as MCP tools (review, ask, code_review)
│   ├── codex/
│   │   └── server.mjs         # Wraps `codex mcp-server` as passthrough proxy
│   └── copilot/
│       └── server.mjs         # Wraps `copilot-cli mcp-server` (placeholder)
├── bin/
│   ├── claude-mcp-server      # stdio entry: node src/claude/server.mjs
│   ├── codex-mcp-server       # stdio entry: codex mcp-server (passthrough)
│   └── copilot-mcp-server     # stdio entry: copilot-cli mcp-server (placeholder)
├── launchd/
│   ├── osx.mcp.claude.plist
│   ├── osx.mcp.codex.plist
│   ├── osx.mcp.copilot.plist
│   ├── launch-agent-claude-mcp-http
│   ├── launch-agent-codex-mcp-http
│   └── launch-agent-copilot-mcp-http
├── install.sh                 # Symlinks plists + scripts into dotfiles
└── README.md
```

## Key Design Decisions

### Why HTTP proxy (not stdio)?

Each agent is a singleton LaunchAgent behind `mcp-proxy` (HTTP/SSE). This means:
- One instance serves multiple clients simultaneously
- Claude Code, Codex CLI, and Copilot can all call each other
- LaunchAgents manage lifecycle (auto-restart, logging)
- Can be toggled on/off via `launchctl load/unload`

### Ports

| Server | Port | Label |
|--------|------|-------|
| Claude MCP | 8940 | osx.mcp.claude |
| Codex MCP | 8941 | osx.mcp.codex |
| Copilot MCP | 8942 | osx.mcp.copilot |

### Claude MCP Server (the complex one)

`claude mcp serve` only exposes file tools (Read/Edit/LS), NOT model conversation. So we wrap `claude -p` in a custom MCP server that exposes:

**Tools:**
- `review` — Send a plan, diff, or implementation to a second Claude instance for independent review. Returns structured JSON with verdict (APPROVED/NEEDS_REVISION), severity-rated issues, and suggestions.
- `ask` — Ask a Claude instance a freeform question about the codebase. Returns text.
- `code_review` — Specialized code review that runs git diff and analyzes changes.

**How it works:**
- Spawns `claude -p` as a child process with `--output-format json`, `--json-schema`, `--permission-mode dontAsk`
- Passes prompt via stdin
- Parses structured JSON output
- Supports session continuation via `--resume` + threadId

**Review JSON schema:**
```json
{
  "verdict": "APPROVED" | "NEEDS_REVISION",
  "issues": [{ "severity": "critical|major|minor", "description": "...", "recommendation": "..." }],
  "suggestions": ["..."]
}
```

**Configurable via env:**
- `CLAUDE_REVIEW_MODEL` — model to use (default: opus)
- `CLAUDE_REVIEW_MAX_TURNS` — max turns per review (default: 8)
- `CLAUDE_REVIEW_CWD` — working directory
- `CLAUDE_REVIEW_ALLOWED_TOOLS` — tools the reviewer can use (read-only + test/lint)

### Codex MCP Server

Simple passthrough — `codex mcp-server` already exposes `codex` and `codex-reply` tools natively. We just need to proxy it behind HTTP.

### Copilot MCP Server

Placeholder — `copilot-cli mcp-server` support TBD. Structure is ready for when it's available.

## LaunchAgent Pattern

Follows the existing dotfiles pattern:
- Plist calls `/bin/bash -lc 'exec "$HOME/.bin/launch-agent-*-mcp-http"'`
- Script sources `$HOME/.bin/launch-agent-runtime` for PATH/nvm/logging setup
- Runs the MCP server behind `mcp-proxy` on the assigned port
- Local env overrides via `~/.local/share/launch-agent-env/*.env`
- Logs to `~/Library/Logs/*.out.log` and `*.err.log`

## install.sh

Symlinks into the dotfiles structure:
- `launchd/osx.mcp.*.plist` → `~/.dotfiles/home/Library/LaunchAgents/`
- `launchd/launch-agent-*-mcp-http` → `~/.dotfiles/home/.bin/`
- Runs `dfm install` to activate symlinks
- Optionally loads the LaunchAgents immediately

## Consumer Configuration

After install, any AI agent can use these servers. Example `.mcp.json`:

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
      "url": "http://localhost:8942/mcp"
    }
  }
}
```

Or for direct stdio usage (without the proxy):
```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "stdio",
      "command": "node",
      "args": ["/Volumes/dev-ssd/repos/personal/mcp-agent-bridge/src/claude/server.mjs"],
      "env": { "CLAUDE_REVIEW_MODEL": "opus" }
    }
  }
}
```

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `mcp-proxy` — HTTP/SSE proxy (installed globally or via npx)
- `claude` CLI — must be installed and authenticated
- `codex` CLI — must be installed and authenticated
- Node.js 20+ (via nvm)

## Dual-Review Skill

The repo should also include a Claude Code skill for the dual-review workflow:

```
skills/
└── dual-review/
    └── SKILL.md    # Invoke with /dual-review
```

This skill:
1. Explores the codebase
2. Drafts an implementation plan
3. Sends plan to the reviewer MCP (claude or codex) for structured review
4. Iterates up to 3 rounds on NEEDS_REVISION
5. Implements after approval
6. Sends final diff for post-implementation review
7. Presents summary with review history

## Reference: Existing Dotfiles Pattern

The user's dotfiles at `~/.dotfiles` use:
- `home/.bin/launch-agent-runtime` — shared setup (PATH, nvm, logging, env files)
- `home/.bin/launch-agent-*` — per-service launcher scripts
- `home/Library/LaunchAgents/osx.app.*.plist` — launchd plists
- `home/.bin/dfm` — dotfile manager for symlinking

The chrome-devtools MCP pattern is the closest reference:
```bash
exec npx -y mcp-proxy@6.4.4 \
  --port "${port}" \
  --server stream \
  --streamEndpoint "/mcp" \
  -- \
  npx -y chrome-devtools-mcp@0.21.0 \
  --browser-url="${browser_url}"
```

For our servers, the pattern is the same but the inner command varies:
- Claude: `node /path/to/mcp-agent-bridge/src/claude/server.mjs`
- Codex: `codex mcp-server`
- Copilot: `copilot-cli mcp-server`
