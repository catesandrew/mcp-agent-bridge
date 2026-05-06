import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const { createCodexServer } = await import("../server.js");

describe("Codex MCP Server", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const server = createCodexServer();
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

  it("registers codex and codex_reply tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("codex");
    expect(toolNames).toContain("codex_reply");
  });

  describe("codex tool", () => {
    it("has prompt input schema", async () => {
      const { tools } = await client.listTools();
      const codexTool = tools.find((t) => t.name === "codex");

      expect(codexTool).toBeDefined();
      expect(codexTool!.inputSchema.properties).toHaveProperty("prompt");
      expect(codexTool!.inputSchema.required).toContain("prompt");
    });
  });

  describe("codex_reply tool", () => {
    it("has conversation_id and reply input schema", async () => {
      const { tools } = await client.listTools();
      const replyTool = tools.find((t) => t.name === "codex_reply");

      expect(replyTool).toBeDefined();
      expect(replyTool!.inputSchema.properties).toHaveProperty(
        "conversation_id",
      );
      expect(replyTool!.inputSchema.properties).toHaveProperty("reply");
    });
  });
});
