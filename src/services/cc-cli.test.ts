import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { createTestConfig } from "../test-helpers.js";
import { resetConfig, loadConfig } from "../config.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);
const { execClaude } = await import("./cc-cli.js");

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
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "Claude response", "");
        return undefined as any;
      },
    );

    const result = await execClaude("sess-1", "hello", "/tmp/project");
    expect(result.stdout).toBe("Claude response");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("returns CLI_TIMEOUT when subprocess is killed by SIGTERM", async () => {
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

    const result = await execClaude("sess-1", "hello", "/tmp/project");
    expect(result.stderr).toContain("CLI_TIMEOUT");
    expect(result.exitCode).toBeNull();
  });

  it("returns CLI_NOT_FOUND when binary is missing (ENOENT)", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const error = Object.assign(new Error("ENOENT"), {
          code: "ENOENT",
        });
        callback(error, "", "");
        return undefined as any;
      },
    );

    const result = await execClaude("sess-1", "hello", "/tmp/project");
    expect(result.stderr).toContain("CLI_NOT_FOUND");
    expect(result.exitCode).toBe(127);
  });

  it("returns CLI_EXEC_FAILED on general failure", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const error = Object.assign(new Error("something failed"), {
          code: 1,
        });
        callback(error, "", "some error");
        return undefined as any;
      },
    );

    const result = await execClaude("sess-1", "hello", "/tmp/project");
    expect(result.stderr).toContain("CLI_EXEC_FAILED");
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

    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "ok", "");
        return undefined as any;
      },
    );

    const longMessage = "A".repeat(50);
    await execClaude("sess-1", longMessage, "/tmp/project");

    // Check that the -p argument was truncated
    const callArgs = mockExecFile.mock.calls[0][1] as string[];
    const pArgIndex = callArgs.indexOf("-p");
    const pValue = callArgs[pArgIndex + 1];
    expect(pValue.length).toBeLessThan(50);
    expect(pValue).toContain("...[truncated]");
  });
});
