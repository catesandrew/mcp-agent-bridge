---
sidebar_position: 2
---

# Codex Tools API

The Codex MCP server exposes three tools.

## codex

Send a prompt to OpenAI Codex for code generation or analysis.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The prompt to send to Codex |

### Response

Plain text string with Codex's response.

### Example

**Input:**
```json
{
  "prompt": "Write a TypeScript function that debounces an async function and returns the result of the last invocation"
}
```

## code_review

Send a diff for structured review. Uses agent instructions from `~/.codex/agents/code-reviewer.toml` if available.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `diff` | string | Yes | The git diff to review (max 500KB) |
| `context` | string | No | Additional context for the review |

### Response

JSON when the response is parseable, otherwise plain text. The JSON structure matches:

```typescript
interface ReviewResult {
  verdict: "APPROVED" | "NEEDS_REVISION";
  issues: ReviewIssue[];
  suggestions: string[];
}
```

## codex_reply

Continue a previous conversation.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversation_id` | string | Yes | Identifier for the conversation |
| `reply` | string | Yes | The follow-up message |

### Response

Plain text string with Codex's response.

:::note
This tool is stateless. The `conversation_id` is passed as context to Codex but the server does not maintain conversation state between calls.
:::
