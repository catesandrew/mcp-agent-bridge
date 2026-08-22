---
sidebar_position: 1
slug: /intro
---

# Introduction

You're deep in a change with Claude Code, and you want a second opinion -- so you copy the diff,
switch to a Codex or Copilot tab, paste it, wait, and copy the response back. **MCP Agent Bridge**
removes that context switch: it exposes Claude Code, OpenAI Codex, and GitHub Copilot as
[Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers, so any one of them can
call any other directly, from inside the same session, and get structured JSON back instead of
another wall of prose to re-read.

## Why?

AI coding agents are powerful individually, but they each have blind spots. By bridging them behind MCP, you can:

- **Get a second opinion** -- Send your diff to a different model for review before merging
- **Cross-validate** -- Compare responses from Claude, Codex, and Copilot on the same question
- **Structured reviews** -- Get typed JSON output with verdict, issues by severity, and suggestions
- **Automate workflows** -- Build pipelines that route work to the best agent for each task

## How It Works

```
┌──────────────┐     MCP (stdio)      ┌─────────────────┐     CLI subprocess
│  MCP Client  │ ◄──────────────────► │  MCP Server     │ ──────────────────► claude -p
│  (any agent) │     or HTTP/SSE      │  (bridge layer) │                     codex exec
└──────────────┘                      └─────────────────┘                     copilot -p
```

Each bridge server:

1. Registers MCP tools (`review`, `ask`, `code_review`, etc.)
2. Receives tool calls from any MCP client
3. Spawns the underlying CLI agent as a subprocess
4. Parses and returns structured results

## Architecture

In production, each server runs as a **singleton background service** behind an HTTP proxy (`mcp-proxy`). Multiple clients share a single instance of each agent -- no cold starts, no duplicated processes.

```
┌─────────────┐
│ Claude Code  │──┐
└─────────────┘  │    HTTP/SSE         ┌───────────┐    stdio    ┌──────────────────┐
                 ├──────────────────► │ mcp-proxy │ ──────────► │ claude-mcp-server│
┌─────────────┐  │   :8940/mcp        └───────────┘             └──────────────────┘
│   Codex      │──┘
└─────────────┘

┌─────────────┐
│ Claude Code  │──────────────────►  :8941/mcp ──► codex-mcp-server
└─────────────┘

┌─────────────┐
│ Claude Code  │──────────────────►  :8945/mcp ──► copilot-mcp-server
└─────────────┘
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Three agent bridges** | Claude, Codex, and Copilot as MCP servers |
| **Structured reviews** | JSON output with verdict, issues, suggestions |
| **Singleton services** | Background daemons shared by multiple clients |
| **Cross-platform** | macOS (LaunchAgents), Windows (NSSM), Linux (systemd) |
| **Standalone binaries** | Zero-dependency executables compiled with Bun |
| **Secure defaults** | Read-only tools, localhost binding, input limits |

## Next Steps

- [Prerequisites](./getting-started/prerequisites) -- What you need installed
- [Installation](./getting-started/installation) -- Build and install the servers
- [Quick Start](./getting-started/quick-start) -- Get running in 5 minutes
