import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerConfig } from "./types.js";

/**
 * Create a configured {@link McpServer} with tool capabilities enabled.
 *
 * The returned server has no tools registered yet -- callers should use
 * `server.registerTool()` before connecting a transport.
 *
 * @param config - Server identity and optional instructions.
 * @returns A ready-to-configure MCP server instance.
 *
 * @example
 * ```ts
 * const server = createServer({ name: "my-bridge", version: "1.0.0" });
 * server.registerTool("ping", { title: "Ping" }, async () => ({ content: [{ type: "text", text: "pong" }] }));
 * await startServer(server);
 * ```
 */
export function createServer(config: ServerConfig): McpServer {
  return new McpServer(
    { name: config.name, version: config.version },
    {
      capabilities: { tools: {} },
      instructions: config.instructions,
    },
  );
}

/**
 * Connect a server to stdio and begin handling MCP messages.
 *
 * This blocks the process on the transport's message loop. Intended to be
 * called once at the top level of a bin entry script.
 *
 * @param server - A fully-configured {@link McpServer} (tools already registered).
 */
export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
