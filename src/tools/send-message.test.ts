import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "../test-helpers.js";
import { registerSendMessageTool } from "./send-message.js";
import { registerRegisterPeerTool } from "./register-peer.js";
import { registerGetHistoryTool } from "./get-history.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  registerSendMessageTool(server);
  registerRegisterPeerTool(server);
  registerGetHistoryTool(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await cleanup();
});

/** Helper to register a peer via the MCP tool */
async function registerPeer(
  peerId: string,
  sessionId: string,
  cwd: string,
  label: string,
) {
  await client.callTool({
    name: "cc_register_peer",
    arguments: { peerId, sessionId, cwd, label },
  });
}

describe("cc_send_message tool", () => {
  it("sends message successfully and returns response", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "Got it!", "");
        return undefined as any;
      },
    );

    const result = await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "frontend",
        message: "Hello from backend",
      },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(true);
    expect(data.response).toBe("Got it!");
  });

  it("returns error when sender peer not registered", async () => {
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    const result = await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "nonexistent",
        toPeerId: "frontend",
        message: "Hello",
      },
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(false);
    expect(data.error).toBe("PEER_NOT_FOUND");
  });

  it("returns error when target peer not registered", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");

    const result = await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "nonexistent",
        message: "Hello",
      },
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(false);
    expect(data.error).toBe("PEER_NOT_FOUND");
  });

  it("handles CLI timeout", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const error = Object.assign(new Error("timeout"), {
          killed: true,
          signal: "SIGTERM",
          code: null,
        });
        callback(error, "", "");
        return undefined as any;
      },
    );

    const result = await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "frontend",
        message: "Hello",
      },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(false);
    expect(data.error).toContain("CLI_TIMEOUT");
  });

  it("records message in history", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "Acknowledged", "");
        return undefined as any;
      },
    );

    await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "frontend",
        message: "Test message for history",
      },
    });

    const historyResult = await client.callTool({
      name: "cc_get_history",
      arguments: {},
    });

    const historyData = JSON.parse(
      (historyResult.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(historyData.count).toBe(1);
    expect(historyData.messages[0].fromPeerId).toBe("backend");
    expect(historyData.messages[0].toPeerId).toBe("frontend");
    expect(historyData.messages[0].message).toBe("Test message for history");
    expect(historyData.messages[0].response).toBe("Acknowledged");
    expect(historyData.messages[0].success).toBe(true);
  });
});
