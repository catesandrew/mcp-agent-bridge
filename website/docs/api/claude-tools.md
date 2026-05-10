---
sidebar_position: 1
---

# Claude Tools API

The Claude MCP server exposes three tools. All tools are registered under the `claude_reviewer` server name (configurable in your `.mcp.json`).

## review

Send code, plans, or diffs for structured review.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | The content to review (max 500KB) |
| `context` | string | No | Additional context for the reviewer |

### Response

```typescript
interface ReviewResult {
  verdict: "APPROVED" | "NEEDS_REVISION";
  issues: ReviewIssue[];
  suggestions: string[];
}

interface ReviewIssue {
  severity: "critical" | "major" | "minor";
  description: string;
  recommendation: string;
}
```

### Example

**Input:**
```json
{
  "content": "function login(user, pass) {\n  const query = `SELECT * FROM users WHERE name='${user}' AND pass='${pass}'`;\n  return db.exec(query);\n}",
  "context": "Authentication module for the web API"
}
```

**Output:**
```json
{
  "verdict": "NEEDS_REVISION",
  "issues": [
    {
      "severity": "critical",
      "description": "SQL injection vulnerability via string interpolation",
      "recommendation": "Use parameterized queries: db.prepare('SELECT * FROM users WHERE name=? AND pass=?').get(user, pass)"
    }
  ],
  "suggestions": [
    "Hash passwords instead of storing/comparing plaintext",
    "Add rate limiting to prevent brute-force attacks"
  ]
}
```

## ask

Ask Claude a freeform question about code.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | Yes | The question to ask (max 500KB) |
| `cwd` | string | No | Working directory for file access |

### Response

Plain text string with Claude's response.

### Example

**Input:**
```json
{
  "question": "What design pattern does the server-factory.ts module use?",
  "cwd": "/path/to/project"
}
```

**Output:**
```
"The server-factory.ts module uses the Factory pattern. The createServer() function
acts as a factory that takes a ServerConfig object and returns a configured McpServer
instance. This centralizes server creation logic and ensures consistent configuration
across all three bridge servers (Claude, Codex, Copilot)."
```

## code_review

Specialized tool for reviewing git diffs.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `diff` | string | Yes | The git diff to review (max 500KB) |
| `context` | string | No | Additional context for the review |

### Response

Same `ReviewResult` structure as the `review` tool.

### Example

**Input:**
```json
{
  "diff": "diff --git a/src/auth.ts b/src/auth.ts\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,6 +10,7 @@\n+  if (!token) return null;\n   const decoded = jwt.verify(token, SECRET);",
  "context": "Adding null check for missing auth tokens"
}
```
