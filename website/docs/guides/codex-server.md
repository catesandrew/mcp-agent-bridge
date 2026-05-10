---
sidebar_position: 2
---

# Codex Server

The Codex MCP bridge wraps the `codex exec` CLI, exposing it as an MCP server with three tools: `codex`, `code_review`, and `codex_reply`.

## Tools

### `codex`

Send a prompt to OpenAI Codex for code generation or analysis.

```
Tool: codex
Input:
  prompt: string (required)
Output:
  string (text response)
```

### `code_review`

Send a diff for structured review. If a code reviewer agent configuration exists at `~/.codex/agents/code-reviewer.toml`, its instructions are prepended to the prompt.

```
Tool: code_review
Input:
  diff: string (required, max 500KB)
  context: string (optional)
Output:
  JSON or text (JSON when parseable)
```

### `codex_reply`

Continue a previous conversation by passing context inline.

```
Tool: codex_reply
Input:
  conversation_id: string (required)
  reply: string (required)
Output:
  string (text response)
```

:::note
This tool is stateless -- context is passed inline rather than maintaining server-side conversation state.
:::

## Agent Configuration

You can customize the code review behavior by creating a TOML file:

```toml
# ~/.codex/agents/code-reviewer.toml
[agent]
instructions = """
You are a code reviewer. Focus on:
- Security vulnerabilities
- Performance issues
- Code style consistency
"""
```

The path is configurable via `CODEX_REVIEW_AGENT_PATH`.

## Configuration

See [Environment Variables](../configuration/environment-variables#codex) for all options.

```bash
CODEX_REVIEW_MODEL=              # Model override
CODEX_REVIEW_AGENT_PATH=~/.codex/agents/code-reviewer.toml
CODEX_MCP_HTTP_PORT=8941         # HTTP proxy port
```
