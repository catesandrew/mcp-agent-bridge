import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const { createCopilotServer } = await import("../server.js");

describe("Copilot MCP Server", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const server = createCopilotServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
    };
  });

  afterEach(async () => {
    await cleanup();
  });

  it("registers a status tool", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("status");
    expect(tools).toHaveLength(1);
  });

  it("status tool returns not-yet-available message", async () => {
    const result = await client.callTool({
      name: "status",
      arguments: {},
    });

    const textContent = result.content as Array<{ type: string; text: string }>;
    expect(textContent[0]!.text).toContain("not yet available");
  });
});
