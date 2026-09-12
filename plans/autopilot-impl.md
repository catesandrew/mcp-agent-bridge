# MCP Agent Bridge — Implementation Plan

## Overview

Build an MCP server bridge that exposes Claude Code, OpenAI Codex, and GitHub Copilot as MCP servers behind HTTP proxies (via `mcp-proxy`), managed by macOS LaunchAgents. Strongly typed TypeScript, ESM, TDD.

## Adaptation from SPEC

- SPEC uses `.mjs` extensions → we use `.ts` with ESM compilation
- SPEC uses `osx.mcp.*` labels (intentional — differentiates from `osx.app.*` pattern)
- All runtime types are explicit (no `any`)

## Task Breakdown

### Step 1: Project Scaffolding
- `package.json` with ESM, TypeScript, vitest, `@modelcontextprotocol/sdk`
- `tsconfig.json` targeting ES2022/NodeNext
- `vitest.config.ts`
- `.gitignore`
- **Files**: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

### Step 2: Shared Types & Server Factory (TDD)
- **Types**: `ReviewResult`, `ReviewIssue`, tool input schemas, server config
- **server-factory.ts**: Creates MCP `Server` with tool registration helpers, JSON schema validation
- **Test first**: `src/shared/__tests__/server-factory.test.ts`
- **Then implement**: `src/shared/types.ts`, `src/shared/server-factory.ts`

### Step 3: Claude MCP Server (TDD)
- **claude-runner.ts**: Spawns `claude -p` with structured output, handles stdin/stdout/stderr
- **server.ts**: MCP server exposing `review`, `ask`, `code_review` tools
- **Test first**: `src/claude/__tests__/claude-runner.test.ts`, `src/claude/__tests__/server.test.ts`
- **Then implement**: `src/claude/claude-runner.ts`, `src/claude/server.ts`
- **Env config**: `CLAUDE_REVIEW_MODEL`, `CLAUDE_REVIEW_MAX_TURNS`, `CLAUDE_REVIEW_CWD`, `CLAUDE_REVIEW_ALLOWED_TOOLS`

### Step 4: Codex MCP Server (TDD)
- **server.ts**: Passthrough proxy — spawns `codex mcp-server` and pipes stdio
- **Test first**: `src/codex/__tests__/server.test.ts`
- **Then implement**: `src/codex/server.ts`

### Step 5: Copilot MCP Server (TDD)
- **server.ts**: Placeholder server with a `status` tool returning "not yet available"
- **Test first**: `src/copilot/__tests__/server.test.ts`
- **Then implement**: `src/copilot/server.ts`

### Step 6: Bin Entry Scripts
- `bin/claude-mcp-server` — shebang + `node dist/claude/server.js`
- `bin/codex-mcp-server` — shebang + spawns `codex mcp-server` (passthrough)
- `bin/copilot-mcp-server` — shebang + `node dist/copilot/server.js`
- **Files**: `bin/claude-mcp-server`, `bin/codex-mcp-server`, `bin/copilot-mcp-server`

### Step 7: LaunchAgent Infrastructure
- 3 plist files following `osx.mcp.*` label pattern
- 3 launcher scripts following existing `launch-agent-*` pattern
- Scripts source `launch-agent-runtime`, use `launch_agent_setup_node`
- Ports: claude=8940, codex=8941, copilot=8942
- **Files**: `launchd/osx.mcp.claude.plist`, `launchd/osx.mcp.codex.plist`, `launchd/osx.mcp.copilot.plist`, `launchd/launch-agent-claude-mcp-http`, `launchd/launch-agent-codex-mcp-http`, `launchd/launch-agent-copilot-mcp-http`

### Step 8: Install Script
- Symlinks plists → `~/.dotfiles/home/Library/LaunchAgents/`
- Symlinks launcher scripts → `~/.dotfiles/home/.bin/`
- Runs `dfm install`
- Optional `--load` flag to immediately load via launchctl
- **File**: `install.sh`

### Step 9: Dual-Review Skill
- `skills/dual-review/SKILL.md` — Claude Code slash command
- Workflow: explore → plan → review via MCP → iterate → implement → post-review
- **File**: `skills/dual-review/SKILL.md`

### Step 10: README
- Update README.md with usage, configuration, consumer examples
- **File**: `README.md`

## Dependency Order

```
Step 1 (scaffolding) → Step 2 (shared) → Steps 3,4,5 (servers, parallel) → Step 6 (bin) → Step 7 (launchd) → Step 8 (install) → Step 9 (skill) → Step 10 (readme)
```

## Test Strategy (TDD)

For each server module:
1. Write test file with mocked child_process/spawn
2. Verify tool registration, input validation, output parsing
3. Test error handling (process crash, invalid JSON, timeout)
4. Run tests — confirm they fail
5. Implement until tests pass

Key test patterns:
- Mock `child_process.spawn` for claude-runner tests
- Mock `Server` from `@modelcontextprotocol/sdk` for tool registration tests
- Use vitest's `vi.mock()` for module mocking
- Test ReviewResult JSON schema validation
