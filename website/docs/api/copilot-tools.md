---
sidebar_position: 3
---

# Copilot Tools API

The Copilot MCP server exposes two tools.

## ask

Ask GitHub Copilot a freeform question.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask (max 500KB) |

### Response

Plain text string with Copilot's response.

### Example

**Input:**
```json
{
  "question": "How does React's useEffect cleanup function work with async operations?"
}
```

## code_review

Send a diff for review.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `diff` | string | Yes | The git diff to review (max 500KB) |
| `context` | string | No | Additional context for the review |

### Response

JSON when the response is parseable as a `ReviewResult`, otherwise plain text.

```typescript
interface ReviewResult {
  verdict: "APPROVED" | "NEEDS_REVISION";
  issues: Array<{
    severity: "critical" | "major" | "minor";
    description: string;
    recommendation: string;
  }>;
  suggestions: string[];
}
```

## Output Parsing

The Copilot server parses JSONL output from the `copilot -p --output-format json` CLI. Each line is a JSON object representing a message in the conversation. The server extracts the final assistant message and attempts to parse it as structured JSON.

If JSON parsing fails, the raw text response is returned. This means `code_review` may return either structured JSON or freeform text depending on Copilot's response format.
