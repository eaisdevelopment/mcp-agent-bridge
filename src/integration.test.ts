import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "./test-helpers.js";
import { registerRegisterPeerTool } from "./tools/register-peer.js";
import { registerDeregisterPeerTool } from "./tools/deregister-peer.js";
import { registerSendMessageTool } from "./tools/send-message.js";
import { registerListPeersTool } from "./tools/list-peers.js";
import { registerGetHistoryTool } from "./tools/get-history.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  // Register all 5 tools
  registerRegisterPeerTool(server);
  registerDeregisterPeerTool(server);
  registerSendMessageTool(server);
  registerListPeersTool(server);
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

function parseResult(result: { content: unknown }) {
  return JSON.parse(
    (result.content as Array<{ type: string; text: string }>)[0].text,
  );
}

describe("Integration: register -> send -> history -> deregister", () => {
  it("completes full workflow via MCP protocol", async () => {
    // 1. Register "backend" peer
    const reg1 = parseResult(
      await client.callTool({
        name: "cc_register_peer",
        arguments: {
          peerId: "backend",
          sessionId: "sess-backend",
          cwd: "/tmp/backend",
          label: "CC_Backend",
        },
      }),
    );
    expect(reg1.success).toBe(true);
    expect(reg1.action).toBe("registered");

    // 2. Register "frontend" peer
    const reg2 = parseResult(
      await client.callTool({
        name: "cc_register_peer",
        arguments: {
          peerId: "frontend",
          sessionId: "sess-frontend",
          cwd: "/tmp/frontend",
          label: "CC_Frontend",
        },
      }),
    );
    expect(reg2.success).toBe(true);
    expect(reg2.action).toBe("registered");

    // 3. List peers -- should be 2
    const list1 = parseResult(
      await client.callTool({
        name: "cc_list_peers",
        arguments: {},
      }),
    );
    expect(list1.count).toBe(2);
    const peerIds = list1.peers.map((p: { peerId: string }) => p.peerId);
    expect(peerIds).toContain("backend");
    expect(peerIds).toContain("frontend");

    // 4. Send message from backend to frontend
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "Hello from frontend!", "");
        return undefined as any;
      },
    );

    const sendResult = parseResult(
      await client.callTool({
        name: "cc_send_message",
        arguments: {
          fromPeerId: "backend",
          toPeerId: "frontend",
          message: "Please update the UI",
        },
      }),
    );
    expect(sendResult.success).toBe(true);
    expect(sendResult.response).toBe("Hello from frontend!");

    // 5. Get history for "backend" -- should show 1 message
    const history1 = parseResult(
      await client.callTool({
        name: "cc_get_history",
        arguments: { peerId: "backend" },
      }),
    );
    expect(history1.count).toBe(1);
    expect(history1.messages[0].fromPeerId).toBe("backend");
    expect(history1.messages[0].toPeerId).toBe("frontend");
    expect(history1.messages[0].message).toBe("Please update the UI");
    expect(history1.messages[0].response).toBe("Hello from frontend!");
    expect(history1.messages[0].success).toBe(true);
    expect(history1.messages[0]).toHaveProperty("timestamp");
    expect(history1.messages[0]).toHaveProperty("durationMs");

    // 6. Deregister "backend"
    const dereg = parseResult(
      await client.callTool({
        name: "cc_deregister_peer",
        arguments: { peerId: "backend" },
      }),
    );
    expect(dereg.success).toBe(true);
    expect(dereg.message).toContain("deregistered");

    // 7. List peers -- should be 1, only "frontend"
    const list2 = parseResult(
      await client.callTool({
        name: "cc_list_peers",
        arguments: {},
      }),
    );
    expect(list2.count).toBe(1);
    expect(list2.peers[0].peerId).toBe("frontend");

    // 8. Get full history (unfiltered) -- message still in history after deregister
    const history2 = parseResult(
      await client.callTool({
        name: "cc_get_history",
        arguments: {},
      }),
    );
    expect(history2.count).toBe(1);
    expect(history2.messages[0].fromPeerId).toBe("backend");
    expect(history2.messages[0].toPeerId).toBe("frontend");
  });
});
