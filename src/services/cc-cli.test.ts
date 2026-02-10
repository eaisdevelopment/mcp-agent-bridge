import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { createTestConfig } from "../test-helpers.js";
import { resetConfig, loadConfig } from "../config.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
const mockSpawn = vi.mocked(spawn);

const { execClaude } = await import("./cc-cli.js");

function createMockChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    kill: vi.fn(() => true),
    pid: 12345,
  });
  return child;
}

let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
});

afterEach(async () => {
  await cleanup();
});

describe("execClaude", () => {
  it("returns stdout, empty stderr, and exitCode 0 on success", async () => {
    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      process.nextTick(() => {
        child.stdout.emit("data", Buffer.from("Claude response"));
        child.emit("close", 0);
      });
      return child as any;
    });

    const result = await execClaude("sess-1", "hello", "/tmp/project");
    expect(result.stdout).toBe("Claude response");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("returns CLI_TIMEOUT when subprocess is killed by timeout", async () => {
    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      // Never emit close naturally — will be killed by the timeout timer
      child.kill = vi.fn((() => {
        process.nextTick(() => child.emit("close", null));
        return true;
      }) as any);
      return child as any;
    });

    // Use the optional short timeout so the test runs quickly
    const result = await execClaude("sess-1", "hello", "/tmp/project", 50);
    expect(result.stderr).toContain("CLI_TIMEOUT");
    expect(result.exitCode).toBeNull();
  });

  it("returns CLI_NOT_FOUND when binary is missing (ENOENT)", async () => {
    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      process.nextTick(() => {
        const error = Object.assign(new Error("ENOENT"), {
          code: "ENOENT",
        });
        child.emit("error", error);
      });
      return child as any;
    });

    const result = await execClaude("sess-1", "hello", "/tmp/project");
    expect(result.stderr).toContain("CLI_NOT_FOUND");
    expect(result.exitCode).toBe(127);
  });

  it("returns CLI_EXEC_FAILED on non-zero exit code", async () => {
    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      process.nextTick(() => {
        child.stderr.emit("data", Buffer.from("some error"));
        child.emit("close", 1);
      });
      return child as any;
    });

    const result = await execClaude("sess-1", "hello", "/tmp/project");
    expect(result.stderr).toContain("CLI_EXEC_FAILED");
    expect(result.exitCode).toBe(1);
  });

  it("truncates message when CC_BRIDGE_CHAR_LIMIT is set", async () => {
    // Reconfigure with a small char limit
    resetConfig();
    loadConfig({
      CC_BRIDGE_STATE_PATH: "/tmp/test",
      CC_BRIDGE_TIMEOUT_MS: "5000",
      CC_BRIDGE_CHAR_LIMIT: "20",
      CC_BRIDGE_LOG_LEVEL: "error",
      CC_BRIDGE_CLAUDE_PATH: "claude",
    });

    mockSpawn.mockImplementation(() => {
      const child = createMockChild();
      process.nextTick(() => {
        child.stdout.emit("data", Buffer.from("ok"));
        child.emit("close", 0);
      });
      return child as any;
    });

    const longMessage = "A".repeat(50);
    await execClaude("sess-1", longMessage, "/tmp/project");

    // Check that the -p argument was truncated
    const callArgs = mockSpawn.mock.calls[0][1] as string[];
    const pArgIndex = callArgs.indexOf("-p");
    const pValue = callArgs[pArgIndex + 1];
    expect(pValue.length).toBeLessThan(50);
    expect(pValue).toContain("...[truncated]");
  });
});
