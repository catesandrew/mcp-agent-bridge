import { createServer, startServer } from "../shared/server-factory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Create the Copilot MCP bridge placeholder server.
 *
 * Registers a single `status` tool that reports Copilot CLI MCP support
 * is not yet available. This server will be updated when `copilot-cli
 * mcp-server` is released.
 *
 * @returns A configured {@link McpServer} ready to connect to a transport.
 */
export function createCopilotServer(): McpServer {
  const server = createServer({
    name: "copilot-mcp-bridge",
    version: "0.1.0",
    description:
      "Placeholder MCP server for GitHub Copilot CLI (not yet available)",
  });

  server.registerTool(
    "status",
    {
      title: "Copilot Status",
      description:
        "Returns the current status of the Copilot MCP bridge. Currently a placeholder.",
    },
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: "GitHub Copilot CLI MCP support is not yet available. This server is a placeholder that will be updated when copilot-cli mcp-server support is released.",
          },
        ],
      };
    },
  );

  return server;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/copilot/server.js") ||
    process.argv[1].endsWith("/copilot/server.ts"));

if (isMain) {
  const server = createCopilotServer();
  startServer(server).catch((err: unknown) => {
    console.error("Failed to start Copilot MCP server:", err);
    process.exit(1);
  });
}
