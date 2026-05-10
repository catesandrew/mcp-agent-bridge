---
sidebar_position: 3
---

# Quick Start

Get a cross-agent code review working in under 5 minutes.

## 1. Start a Server

The fastest way to test is running a server directly in stdio mode:

```bash
# Run the Claude bridge directly
node dist/claude/server.js

# Or use the standalone binary
./exe/claude-mcp-server
```

For background HTTP mode (recommended for regular use):

```bash
# Start Claude bridge on port 8940
npx mcp-proxy --port 8940 -- ./exe/claude-mcp-server
```

## 2. Configure Your MCP Client

Add the server to your MCP client configuration. For Claude Code, create or edit `.mcp.json` in your project root:

### HTTP Mode (background service)

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

### Stdio Mode (direct process)

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "stdio",
      "command": "claude-mcp-server"
    }
  }
}
```

## 3. Use It

Once configured, your MCP client can call the bridge tools. For example, in Claude Code:

```
Use the claude_reviewer MCP to review this diff:

<paste your diff here>
```

The reviewer will return a structured JSON response:

```json
{
  "verdict": "NEEDS_REVISION",
  "issues": [
    {
      "severity": "major",
      "description": "SQL query is vulnerable to injection",
      "recommendation": "Use parameterized queries instead of string interpolation"
    }
  ],
  "suggestions": [
    "Consider adding input validation at the API boundary"
  ]
}
```

## 4. Add More Agents

Add Codex and Copilot bridges for cross-agent validation:

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

Now you can ask one agent to get a second opinion from another:

```
Send this diff to the codex MCP for code review, then compare
with the claude_reviewer's assessment.
```

## Next Steps

- [Claude Server Guide](../guides/claude-server) -- Deep dive into the Claude bridge
- [Cross-Agent Review](../guides/cross-agent-review) -- Patterns for multi-agent workflows
- [macOS Deployment](../deployment/macos) -- Set up as background services
- [Configuration](../configuration/environment-variables) -- All environment variables
