---
sidebar_position: 1
---

# Claude Server

The Claude MCP bridge wraps the `claude -p` CLI, exposing it as an MCP server with three tools: `review`, `ask`, and `code_review`.

## Tools

### `review`

Send code, plans, or diffs for structured review. Returns a JSON object with a verdict, issues, and suggestions.

```
Tool: review
Input:
  content: string (required, max 500KB)
  context: string (optional)
Output:
  { verdict: "APPROVED" | "NEEDS_REVISION", issues: [...], suggestions: [...] }
```

The review tool uses Claude's `--json-schema` flag to constrain output to a predictable structure. Each issue includes a severity (`critical`, `major`, `minor`), description, and recommendation.

### `ask`

Ask Claude a freeform question about code. Useful for exploration, analysis, and understanding.

```
Tool: ask
Input:
  question: string (required, max 500KB)
  cwd: string (optional) -- working directory for file access
Output:
  string (freeform text response)
```

The `cwd` parameter lets Claude read files in a specific directory. This is validated against `CLAUDE_ALLOWED_CWD_ROOTS` for security.

### `code_review`

Specialized tool for reviewing git diffs.

```
Tool: code_review
Input:
  diff: string (required, max 500KB)
  context: string (optional)
Output:
  { verdict: "APPROVED" | "NEEDS_REVISION", issues: [...], suggestions: [...] }
```

## How It Works

1. Receives an MCP tool call
2. Constructs a prompt with the input content
3. Spawns `claude -p` as a subprocess with:
   - `--json-schema` for structured output (review/code_review)
   - `--allowedTools` restricting to read-only tools
   - `--permission-mode dontAsk` for non-interactive operation
4. Captures stdout and parses the JSON result
5. Returns the structured response via MCP

## Security

- **Read-only tools**: By default, Claude can only use `Read`, `Grep`, `Glob`, and `LS`
- **Working directory validation**: The `cwd` parameter is checked against allowed roots
- **Input size limit**: 500KB max per request
- **Output size limit**: 10MB max response
- **Process timeout**: 5 minutes default (configurable)

## Configuration

See [Environment Variables](../configuration/environment-variables#claude) for all options.

Key variables:

```bash
CLAUDE_REVIEW_MODEL=opus              # Model to use
CLAUDE_REVIEW_TIMEOUT_MS=300000       # Timeout in ms
CLAUDE_REVIEW_ALLOWED_TOOLS=Read,Grep,Glob,LS  # Tool allowlist
CLAUDE_MCP_HTTP_PORT=8940             # HTTP proxy port
```
