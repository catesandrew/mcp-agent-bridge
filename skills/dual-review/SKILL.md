---
name: dual-review
description: Send implementation plans and diffs to a second AI agent for independent structured review via MCP
---

# Dual Review

Sends your work to a second AI agent (via the claude-mcp-bridge or codex MCP server) for independent structured review. Iterates on NEEDS_REVISION feedback up to 3 rounds before implementing.

## Workflow

1. **Explore** — Analyze the codebase to understand the area being changed
2. **Plan** — Draft an implementation plan
3. **Pre-review** — Send the plan to the reviewer MCP for structured review
4. **Iterate** — If NEEDS_REVISION, address the issues and re-submit (up to 3 rounds)
5. **Implement** — After APPROVED, implement the changes
6. **Post-review** — Send the final diff for post-implementation review
7. **Summary** — Present a summary with the full review history

## Usage

```
/dual-review <description of what you want to build or change>
```

## How It Works

The skill uses the `review` tool from the Claude MCP bridge (or Codex MCP) to get an independent second opinion. The reviewer runs in a separate Claude instance with read-only access to the codebase.

### Review Response Schema

The reviewer returns structured JSON:

```json
{
  "verdict": "APPROVED | NEEDS_REVISION",
  "issues": [
    {
      "severity": "critical | major | minor",
      "description": "What the issue is",
      "recommendation": "How to fix it"
    }
  ],
  "suggestions": ["Optional improvement ideas"]
}
```

### Iteration Rules

- **critical** issues must be addressed before re-submitting
- **major** issues should be addressed
- **minor** issues are at your discretion
- After 3 NEEDS_REVISION rounds, present the issues to the user for a decision

## Configuration

The reviewer MCP server must be running. Default: `http://localhost:8940/mcp`

Configure in `.mcp.json`:

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "streamable-http",
      "url": "http://localhost:8940/mcp"
    }
  }
}
```

## Environment Variables

- `CLAUDE_REVIEW_MODEL` — Model for the reviewer (default: opus)
- `CLAUDE_REVIEW_MAX_TURNS` — Max turns per review (default: 8)
- `CLAUDE_REVIEW_CWD` — Working directory for the reviewer
- `CLAUDE_REVIEW_ALLOWED_TOOLS` — Comma-separated tools the reviewer can use
