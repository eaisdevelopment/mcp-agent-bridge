import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execFile } from "node:child_process";
import { createTestConfig } from "../test-helpers.js";
import { resetConfig } from "../config.js";
import { registerHealthCheckTool } from "./health-check.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  registerHealthCheckTool(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await cleanup();
});

describe("cc_health_check tool", () => {
  it("returns healthy status via MCP", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "claude 1.0.39\n", "");
        return undefined as any;
      },
    );

    const result = await client.callTool({
      name: "cc_health_check",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.healthy).toBe(true);
    expect(data.checks.stateFile.ok).toBe(true);
    expect(data.checks.lockMechanism.ok).toBe(true);
    expect(data.checks.claudeCli.ok).toBe(true);
    expect(result.isError).toBeFalsy();
  });

  it("returns unhealthy when CLI missing via MCP", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        callback(error, "", "");
        return undefined as any;
      },
    );

    const result = await client.callTool({
      name: "cc_health_check",
      arguments: {},
    });

    const data = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(data.healthy).toBe(false);
    expect(data.checks.claudeCli.ok).toBe(false);
    // Tool returns success with unhealthy data, not an MCP error
    expect(result.isError).toBeFalsy();
  });

  it("handles unexpected errors gracefully", async () => {
    // Reset config so getConfig() throws "Config not loaded"
    // This causes checkHealth() to reject, exercising the catch path
    resetConfig();

    const result = await client.callTool({
      name: "cc_health_check",
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });
});
