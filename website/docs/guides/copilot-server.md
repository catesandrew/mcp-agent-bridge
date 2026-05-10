---
sidebar_position: 3
---

# Copilot Server

The Copilot MCP bridge wraps the `copilot -p` CLI, exposing it as an MCP server with two tools: `ask` and `code_review`.

## Tools

### `ask`

Ask GitHub Copilot a freeform question.

```
Tool: ask
Input:
  question: string (required, max 500KB)
Output:
  string (text response)
```

### `code_review`

Send a diff for review.

```
Tool: code_review
Input:
  diff: string (required, max 500KB)
  context: string (optional)
Output:
  JSON or text (JSON when parseable)
```

## How It Works

1. Receives an MCP tool call
2. Spawns `copilot -p --output-format json` as a subprocess
3. Parses the JSONL output stream (one JSON object per line)
4. Extracts the final assistant message
5. Attempts to parse the response as structured JSON; falls back to raw text

## Configuration

See [Environment Variables](../configuration/environment-variables#copilot) for all options.

```bash
COPILOT_REVIEW_MODEL=            # Model override
COPILOT_MCP_HTTP_PORT=8945       # HTTP proxy port
```
