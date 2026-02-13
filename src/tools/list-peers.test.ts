import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "../test-helpers.js";
import { resetConfig, loadConfig } from "../config.js";
import { registerListPeersTool } from "./list-peers.js";
import { registerRegisterPeerTool } from "./register-peer.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;
let tempDir: string;

beforeEach(async () => {
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  tempDir = ctx.tempDir;
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
    expect(peer).toHaveProperty("lastSeenAt");
    expect(peer).toHaveProperty("potentiallyStale");
    expect(peer).toHaveProperty("idleMs");
    expect(peer).toHaveProperty("status");
    expect(peer.status).toBe("active");
    expect(typeof peer.idleMs).toBe("number");
    // Validate registeredAt is a valid ISO timestamp
    const parsed = new Date(peer.registeredAt);
    expect(parsed.toISOString()).toBe(peer.registeredAt);
  });

  it("does not flag recently registered peers as stale", async () => {
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
    expect(data.peers[0].potentiallyStale).toBe(false);
    expect(data.peers[0].status).toBe("active");
    expect(data.note).toContain("auto-recover");
  });

  it("flags stale peers when timeout is very short", async () => {
    // Register a peer with default config
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-1",
        cwd: "/tmp/backend",
        label: "CC_Backend",
      },
    });

    // Wait a bit so the peer becomes "stale" relative to a 1ms timeout
    await new Promise((r) => setTimeout(r, 10));

    // Reconfigure with a very short stale timeout (need new MCP pair for new config)
    await client.close();
    await server.close();

    resetConfig();
    loadConfig({
      CC_BRIDGE_STATE_PATH: tempDir,
      CC_BRIDGE_STALE_TIMEOUT_MS: "1",
      CC_BRIDGE_LOG_LEVEL: "error",
      CC_BRIDGE_TIMEOUT_MS: "5000",
      CC_BRIDGE_CHAR_LIMIT: "0",
      CC_BRIDGE_CLAUDE_PATH: "claude",
    });

    server = new McpServer({ name: "test", version: "1.0.0" });
    registerListPeersTool(server);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(st), client.connect(ct)]);

    const result = await client.callTool({
      name: "cc_list_peers",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.peers[0].potentiallyStale).toBe(true);
    expect(data.peers[0].status).toBe("idle");
    expect(data.peers[0].idleMs).toBeGreaterThan(0);
  });

  it("stale detection disabled when timeout is 0", async () => {
    // Register a peer with default config
    await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "sess-1",
        cwd: "/tmp/backend",
        label: "CC_Backend",
      },
    });

    await new Promise((r) => setTimeout(r, 10));

    // Reconfigure with timeout = 0 (disabled)
    await client.close();
    await server.close();

    resetConfig();
    loadConfig({
      CC_BRIDGE_STATE_PATH: tempDir,
      CC_BRIDGE_STALE_TIMEOUT_MS: "0",
      CC_BRIDGE_LOG_LEVEL: "error",
      CC_BRIDGE_TIMEOUT_MS: "5000",
      CC_BRIDGE_CHAR_LIMIT: "0",
      CC_BRIDGE_CLAUDE_PATH: "claude",
    });

    server = new McpServer({ name: "test", version: "1.0.0" });
    registerListPeersTool(server);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(st), client.connect(ct)]);

    const result = await client.callTool({
      name: "cc_list_peers",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.peers[0].potentiallyStale).toBe(false);
  });
});
