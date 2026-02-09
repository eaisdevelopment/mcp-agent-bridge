import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "../test-helpers.js";
import { registerDeregisterPeerTool } from "./deregister-peer.js";
import { registerRegisterPeerTool } from "./register-peer.js";
import { registerListPeersTool } from "./list-peers.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  registerDeregisterPeerTool(server);
  registerRegisterPeerTool(server);
  registerListPeersTool(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await cleanup();
});

describe("cc_deregister_peer tool", () => {
  it("returns success:true when peer existed", async () => {
    // Register a peer first
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-abc",
        cwd: "/tmp/project",
        label: "CC_Backend",
      },
    });

    // Deregister it
    const result = await client.callTool({
      name: "cc_deregister_peer",
      arguments: { peerId: "backend" },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(true);
    expect(data.message).toContain("deregistered");
  });

  it("returns success:false when peer did not exist", async () => {
    const result = await client.callTool({
      name: "cc_deregister_peer",
      arguments: { peerId: "nonexistent" },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(false);
    expect(data.message).toContain("was not registered");
  });

  it("deregistered peer no longer appears in list", async () => {
    // Register a peer
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-abc",
        cwd: "/tmp/project",
        label: "CC_Backend",
      },
    });

    // Deregister it
    await client.callTool({
      name: "cc_deregister_peer",
      arguments: { peerId: "backend" },
    });

    // Verify it's gone from the list
    const listResult = await client.callTool({
      name: "cc_list_peers",
      arguments: {},
    });

    const listData = JSON.parse(
      (listResult.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(listData.peers).toEqual([]);
    expect(listData.count).toBe(0);
  });
});
