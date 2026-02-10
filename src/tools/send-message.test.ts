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
import { getPeer as getPeerDirect } from "../services/peer-registry.js";
import { registerSendMessageTool } from "./send-message.js";
import { registerRegisterPeerTool } from "./register-peer.js";
import { registerGetHistoryTool } from "./get-history.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockValidateSession.mockResolvedValue(true);
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

    mockExecClaude.mockResolvedValue({
      stdout: "Got it!",
      stderr: "",
      exitCode: 0,
    });

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

  it("returns error when session file not found", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    mockValidateSession.mockResolvedValue(false);

    const result = await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "frontend",
        message: "Hello",
      },
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.success).toBe(false);
    expect(data.error).toBe("CLI_EXEC_FAILED");
    expect(data.message).toContain("not found");
  });

  it("handles CLI timeout with retry", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    // Both attempts time out (exitCode: null)
    mockExecClaude.mockResolvedValue({
      stdout: "",
      stderr: "CLI_TIMEOUT: CLI subprocess timed out after 180000ms",
      exitCode: null,
    });

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
    // Should have been called twice (initial + retry)
    expect(mockExecClaude).toHaveBeenCalledTimes(2);
  });

  it("records message in history", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    mockExecClaude.mockResolvedValue({
      stdout: "Acknowledged",
      stderr: "",
      exitCode: 0,
    });

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

  it("updates sender lastSeenAt after successful send", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    const senderBefore = await getPeerDirect("backend");

    // Small delay so lastSeenAt update is distinguishable
    await new Promise((r) => setTimeout(r, 10));

    mockExecClaude.mockResolvedValue({
      stdout: "Got it!",
      stderr: "",
      exitCode: 0,
    });

    await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "frontend",
        message: "Hello",
      },
    });

    const senderAfter = await getPeerDirect("backend");
    expect(new Date(senderAfter!.lastSeenAt).getTime()).toBeGreaterThan(
      new Date(senderBefore!.lastSeenAt).getTime(),
    );
  });

  it("updates target lastSeenAt after successful send", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    const targetBefore = await getPeerDirect("frontend");

    await new Promise((r) => setTimeout(r, 10));

    mockExecClaude.mockResolvedValue({
      stdout: "Got it!",
      stderr: "",
      exitCode: 0,
    });

    await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "frontend",
        message: "Hello",
      },
    });

    const targetAfter = await getPeerDirect("frontend");
    expect(new Date(targetAfter!.lastSeenAt).getTime()).toBeGreaterThan(
      new Date(targetBefore!.lastSeenAt).getTime(),
    );
  });

  it("does not update target lastSeenAt on failed send", async () => {
    await registerPeer("backend", "sess-1", "/tmp/backend", "CC_Backend");
    await registerPeer("frontend", "sess-2", "/tmp/frontend", "CC_Frontend");

    const targetBefore = await getPeerDirect("frontend");

    await new Promise((r) => setTimeout(r, 10));

    mockExecClaude.mockResolvedValue({
      stdout: "",
      stderr: "CLI_EXEC_FAILED: claude exited with code 1. stderr: CLI failed",
      exitCode: 1,
    });

    await client.callTool({
      name: "cc_send_message",
      arguments: {
        fromPeerId: "backend",
        toPeerId: "frontend",
        message: "Hello",
      },
    });

    const targetAfter = await getPeerDirect("frontend");
    // Target lastSeenAt should NOT be updated on failure
    expect(targetAfter!.lastSeenAt).toBe(targetBefore!.lastSeenAt);

    // But sender lastSeenAt SHOULD be updated (sender is active)
    const senderAfter = await getPeerDirect("backend");
    expect(new Date(senderAfter!.lastSeenAt).getTime()).toBeGreaterThan(
      new Date(targetBefore!.lastSeenAt).getTime(),
    );
  });
});
