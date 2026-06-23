import { createServer as createHttpServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

/**
 * Start an HTTP server that handles MCP requests at `POST /mcp`.
 *
 * Each request creates a fresh stateless transport + server instance via
 * `serverFactory()`, so the factory must be cheap to call.
 *
 * @param serverFactory - Called once per request to create a configured server.
 * @param port - TCP port to listen on.
 * @param hostname - Interface to bind (default `"127.0.0.1"`).
 */
export async function startHttpServer(
  serverFactory: () => McpServer,
  port: number,
  hostname = "127.0.0.1",
): Promise<void> {
  const httpServer = createHttpServer((req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end("Not Found");
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const mcpServer = serverFactory();
    mcpServer
      .connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch((err: unknown) => {
        console.error("MCP HTTP error:", err);
        if (!res.headersSent) res.writeHead(500).end();
      });
  });

  // Node.js defaults (headersTimeout=60s, requestTimeout=300s) would kill
  // long-running tool calls. Tool handlers manage their own timeouts via
  // PROCESS_TIMEOUT_MS, so disable the HTTP-level limits.
  httpServer.headersTimeout = 0;
  httpServer.requestTimeout = 0;

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, hostname, resolve);
    httpServer.on("error", reject);
  });

  console.log(`MCP HTTP server listening on http://${hostname}:${port}/mcp`);
}
