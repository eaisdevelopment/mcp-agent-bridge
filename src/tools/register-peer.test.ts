import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "../test-helpers.js";
import { registerRegisterPeerTool } from "./register-peer.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  registerRegisterPeerTool(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await cleanup();
});

describe("cc_register_peer tool", () => {
  it("registers a new peer and returns success", async () => {
    const result = await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-abc",
        cwd: "/tmp/project",
        label: "CC_Backend",
      },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(true);
    expect(data.action).toBe("registered");
    expect(data.peer.peerId).toBe("backend");
    expect(data.peer.sessionId).toBe("sess-abc");
    expect(data.peer.cwd).toBe("/tmp/project");
    expect(data.peer.label).toBe("CC_Backend");
  });

  it("returns updated when re-registering same peerId", async () => {
    // First registration
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-abc",
        cwd: "/tmp/project",
        label: "CC_Backend",
      },
    });

    // Re-register same peerId with different sessionId
    const result = await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-xyz",
        cwd: "/tmp/project2",
        label: "CC_Backend_v2",
      },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(true);
    expect(data.action).toBe("updated");
    expect(data.peer.sessionId).toBe("sess-xyz");
  });

  it("returns peer with registeredAt timestamp", async () => {
    const result = await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "frontend",
        sessionId: "sess-def",
        cwd: "/tmp/frontend",
        label: "CC_Frontend",
      },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.peer.registeredAt).toBeDefined();
    // Validate ISO string format
    const parsed = new Date(data.peer.registeredAt);
    expect(parsed.toISOString()).toBe(data.peer.registeredAt);
  });
});
