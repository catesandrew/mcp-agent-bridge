---
sidebar_position: 2
---

# MCP Client Configuration

Configure your MCP client to connect to the bridge servers. The configuration format depends on your client.

## Claude Code (.mcp.json)

Create a `.mcp.json` file in your project root or home directory.

### HTTP Mode (recommended)

Use this when the servers are running as background services:

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

### Stdio Mode

Use this to spawn the server as a direct child process:

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

### With Environment Variables

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "stdio",
      "command": "claude-mcp-server",
      "env": {
        "CLAUDE_REVIEW_MODEL": "sonnet",
        "CLAUDE_REVIEW_TIMEOUT_MS": "600000"
      }
    }
  }
}
```

### Standalone Binary

```json
{
  "mcpServers": {
    "claude_reviewer": {
      "type": "stdio",
      "command": "./exe/claude-mcp-server"
    }
  }
}
```

## Multiple Servers

You can run all three bridges simultaneously. Each registers its own set of tools with unique names, so there are no conflicts:

| Server | Tools |
|--------|-------|
| `claude_reviewer` | `review`, `ask`, `code_review` |
| `codex` | `codex`, `code_review`, `codex_reply` |
| `copilot` | `ask`, `code_review` |

:::tip
When tools share the same name across servers (like `code_review`), prefix with the server name when calling: "Use the **codex** server's code_review tool."
:::

## Verifying Connection

After configuring, verify the server is accessible:

```bash
# HTTP mode -- should return MCP capabilities
curl http://localhost:8940/mcp

# Check all ports
for port in 8940 8941 8945; do
  echo "Port $port: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$port/mcp)"
done
```
