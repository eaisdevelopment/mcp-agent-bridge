import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../services/cc-cli.js", () => ({
  execClaude: vi.fn(),
  validateSession: vi.fn(),
}));

import { execClaude, validateSession } from "../services/cc-cli.js";
const mockExecClaude = vi.mocked(execClaude);
const mockValidateSession = vi.mocked(validateSession);

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "../test-helpers.js";
import { registerGetHistoryTool } from "./get-history.js";
import { registerRegisterPeerTool } from "./register-peer.js";
import { registerSendMessageTool } from "./send-message.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockValidateSession.mockResolvedValue(true);
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  registerGetHistoryTool(server);
  registerRegisterPeerTool(server);
  registerSendMessageTool(server);
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

/** Helper to send a message via the MCP tool (mock must be set up first) */
async function sendMessage(
  fromPeerId: string,
  toPeerId: string,
  message: string,
) {
  return client.callTool({
    name: "cc_send_message",
    arguments: { fromPeerId, toPeerId, message },
  });
}

function setupMockSuccess(response: string) {
  mockExecClaude.mockResolvedValue({
    stdout: response,
    stderr: "",
    exitCode: 0,
  });
}

describe("cc_get_history tool", () => {
  it("returns empty array when no messages", async () => {
    const result = await client.callTool({
      name: "cc_get_history",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.messages).toEqual([]);
    expect(data.count).toBe(0);
  });

  it("returns messages after sending", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");
    setupMockSuccess("Reply from frontend");

    await sendMessage("backend", "frontend", "Hello frontend");

    const result = await client.callTool({
      name: "cc_get_history",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.count).toBe(1);
    expect(data.messages[0].fromPeerId).toBe("backend");
    expect(data.messages[0].toPeerId).toBe("frontend");
    expect(data.messages[0].message).toBe("Hello frontend");
    expect(data.messages[0].response).toBe("Reply from frontend");
    expect(data.messages[0].success).toBe(true);
  });

  it("filters by peerId", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");
    await registerPeer("db", "sess-3", "/tmp/db", "CC_DB");
    setupMockSuccess("OK");

    // Send message between backend and frontend
    await sendMessage("backend", "frontend", "msg1");
    // Send message between backend and db
    await sendMessage("backend", "db", "msg2");
    // Send message between frontend and db
    await sendMessage("frontend", "db", "msg3");

    // Filter by "db" -- should get msg2 (backend->db) and msg3 (frontend->db)
    const result = await client.callTool({
      name: "cc_get_history",
      arguments: { peerId: "db" },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.count).toBe(2);
    // All returned messages should involve "db"
    for (const msg of data.messages) {
      expect(
        msg.fromPeerId === "db" || msg.toPeerId === "db",
      ).toBe(true);
    }
  });

  it("respects limit parameter", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");
    setupMockSuccess("OK");

    // Send 3 messages
    await sendMessage("backend", "frontend", "msg1");
    await sendMessage("backend", "frontend", "msg2");
    await sendMessage("backend", "frontend", "msg3");

    // Get history with limit 2
    const result = await client.callTool({
      name: "cc_get_history",
      arguments: { limit: 2 },
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.count).toBe(2);
    // Should return the 2 most recent (msg2 and msg3)
    expect(data.messages[0].message).toBe("msg2");
    expect(data.messages[1].message).toBe("msg3");
  });

  it("returns messages without peerId filter", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");
    await registerPeer("db", "sess-3", "/tmp/db", "CC_DB");
    setupMockSuccess("OK");

    await sendMessage("backend", "frontend", "msg1");
    await sendMessage("frontend", "db", "msg2");

    // Get all history without filter
    const result = await client.callTool({
      name: "cc_get_history",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.count).toBe(2);
    expect(data.messages[0].message).toBe("msg1");
    expect(data.messages[1].message).toBe("msg2");
  });
});
