import { describe, it, expect } from "vitest";
import { createServer, startServer } from "../server-factory.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("createServer", () => {
  it("returns an McpServer with correct server info", () => {
    const server = createServer({
      name: "test-server",
      version: "1.0.0",
      description: "A test server",
    });

    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  it("creates a server that can connect to a transport", async () => {
    const server = createServer({
      name: "test-server",
      version: "1.0.0",
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    const serverInfo = client.getServerVersion();
    expect(serverInfo?.name).toBe("test-server");
    expect(serverInfo?.version).toBe("1.0.0");

    await client.close();
    await server.close();
  });
});

describe("startServer", () => {
  it("is a function", () => {
    expect(typeof startServer).toBe("function");
  });
});
