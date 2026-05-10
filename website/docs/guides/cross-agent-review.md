---
sidebar_position: 4
---

# Cross-Agent Review

One of the most powerful patterns with MCP Agent Bridge is asking one AI agent to get a second opinion from another. This page covers common workflows.

## Basic Pattern

With all three bridges configured in your `.mcp.json`:

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
      "url": "http://localhost:8945/mcp"
    }
  }
}
```

You can ask any MCP client to orchestrate reviews across agents.

## Example: Dual Review

Ask your primary agent to send a diff to a second agent for review:

```
Review this diff using the claude_reviewer MCP's code_review tool,
then summarize the findings.
```

## Example: Consensus Review

Get opinions from multiple agents and compare:

```
Send this diff to both the claude_reviewer and codex MCP servers
for code review. Compare their findings and highlight any
disagreements.
```

## Example: Specialized Routing

Route different aspects of a review to different agents:

```
Use the claude_reviewer MCP to review this diff for security
issues, and the codex MCP to review for performance concerns.
Combine both reports.
```

## Structured Output

The `review` and `code_review` tools return structured JSON, making it easy to compare results programmatically:

```json
{
  "verdict": "NEEDS_REVISION",
  "issues": [
    {
      "severity": "critical",
      "description": "Unbounded query without pagination",
      "recommendation": "Add LIMIT clause and cursor-based pagination"
    },
    {
      "severity": "minor",
      "description": "Variable name 'x' is not descriptive",
      "recommendation": "Rename to 'userCount' or similar"
    }
  ],
  "suggestions": [
    "Consider adding an index on the 'created_at' column"
  ]
}
```

## The Dual-Review Skill

For a fully automated review workflow, see the [Dual-Review Skill](./dual-review-skill) -- a Claude Code slash command that orchestrates multi-round reviews with automatic iteration on critical issues.
