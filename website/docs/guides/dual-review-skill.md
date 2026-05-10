---
sidebar_position: 5
---

# Dual-Review Skill

The `dual-review` skill is a Claude Code slash command that orchestrates a complete review-driven development workflow using the Claude MCP bridge.

## Overview

The skill automates this workflow:

1. **Explore** the codebase to understand the area being changed
2. **Draft** an implementation plan
3. **Submit** the plan to the reviewer MCP for structured review
4. **Iterate** on critical/major issues (up to 3 rounds)
5. **Implement** after receiving APPROVED verdict
6. **Post-review** the final diff
7. **Summarize** with full review history

## Setup

The skill file is located at `skills/dual-review/SKILL.md`. To use it:

1. Ensure the Claude MCP bridge is running (default: `http://localhost:8940/mcp`)
2. Configure `claude_reviewer` in your `.mcp.json`:

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

3. Use the skill in Claude Code:

```
/dual-review Implement feature X
```

## How It Works

### Phase 1: Exploration
The skill reads relevant files to understand the codebase structure and existing patterns.

### Phase 2: Planning
A detailed implementation plan is drafted based on the exploration.

### Phase 3: Plan Review
The plan is sent to the `review` tool on the `claude_reviewer` MCP server. The reviewer returns a structured verdict.

### Phase 4: Iteration
If the verdict is `NEEDS_REVISION`, the skill addresses critical and major issues and resubmits. This continues for up to 3 rounds.

### Phase 5: Implementation
Once the plan is APPROVED, the skill implements the changes.

### Phase 6: Post-Implementation Review
The final `git diff` is sent to the `code_review` tool for a post-implementation check.

### Phase 7: Summary
A complete summary is presented with all review rounds and the final verdict.

## Configuration

The skill inherits configuration from the Claude MCP bridge environment variables:

- `CLAUDE_REVIEW_MODEL` -- Model used by the reviewer
- `CLAUDE_REVIEW_MAX_TURNS` -- Max agentic turns per review
- `CLAUDE_REVIEW_CWD` -- Working directory for file access
