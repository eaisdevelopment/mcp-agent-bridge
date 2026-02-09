import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "../test-helpers.js";
import { registerListPeersTool } from "./list-peers.js";
import { registerRegisterPeerTool } from "./register-peer.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  registerListPeersTool(server);
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

describe("cc_list_peers tool", () => {
  it("returns empty array when no peers registered", async () => {
    const result = await client.callTool({
      name: "cc_list_peers",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.peers).toEqual([]);
    expect(data.count).toBe(0);
  });

  it("returns all registered peers", async () => {
    // Register 2 peers
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-1",
        cwd: "/tmp/backend",
        label: "CC_Backend",
      },
    });
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "frontend",
        sessionId: "sess-2",
        cwd: "/tmp/frontend",
        label: "CC_Frontend",
      },
    });

    const result = await client.callTool({
      name: "cc_list_peers",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.count).toBe(2);
    expect(data.peers).toHaveLength(2);
    const peerIds = data.peers.map((p: { peerId: string }) => p.peerId);
    expect(peerIds).toContain("backend");
    expect(peerIds).toContain("frontend");
  });

  it("returns peer details including all fields", async () => {
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-1",
        cwd: "/tmp/backend",
        label: "CC_Backend",
      },
    });

    const result = await client.callTool({
      name: "cc_list_peers",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    const peer = data.peers[0];
    expect(peer).toHaveProperty("peerId", "backend");
    expect(peer).toHaveProperty("sessionId", "sess-1");
    expect(peer).toHaveProperty("cwd", "/tmp/backend");
    expect(peer).toHaveProperty("label", "CC_Backend");
    expect(peer).toHaveProperty("registeredAt");
    // Validate registeredAt is a valid ISO timestamp
    const parsed = new Date(peer.registeredAt);
    expect(parsed.toISOString()).toBe(peer.registeredAt);
  });
});
