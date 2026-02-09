import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { createTestConfig } from "../test-helpers.js";
import { SERVER_VERSION } from "../constants.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);
const { checkHealth } = await import("./health-check.js");

let tempDir: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const ctx = await createTestConfig();
  tempDir = ctx.tempDir;
  cleanup = ctx.cleanup;
});

afterEach(async () => {
  await cleanup();
});

describe("health-check service", () => {
  it("returns healthy when everything works", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "claude 1.0.39\n", "");
        return undefined as any;
      },
    );

    const result = await checkHealth();

    expect(result.healthy).toBe(true);
    expect(result.checks.stateFile.ok).toBe(true);
    expect(result.checks.lockMechanism.ok).toBe(true);
    expect(result.checks.claudeCli.ok).toBe(true);
    expect(result.checks.claudeCli.version).toBe("claude 1.0.39");
    expect(result.serverVersion).toBeDefined();
    expect(result.statePath).toBeDefined();
    expect(result.claudePath).toBeDefined();
    // Validate timestamp is ISO string
    const parsed = new Date(result.timestamp);
    expect(parsed.toISOString()).toBe(result.timestamp);
  });

  it("reports stateFile not ok when state dir is not accessible", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "claude 1.0.39\n", "");
        return undefined as any;
      },
    );

    // Remove the temp dir entirely
    await rm(tempDir, { recursive: true, force: true });

    const result = await checkHealth();

    expect(result.checks.stateFile.ok).toBe(false);
    expect(result.healthy).toBe(false);
  });

  it("reports claudeCli not ok when claude is missing", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const error = Object.assign(new Error("ENOENT"), {
          code: "ENOENT",
        });
        callback(error, "", "");
        return undefined as any;
      },
    );

    const result = await checkHealth();

    expect(result.checks.claudeCli.ok).toBe(false);
    expect(result.checks.claudeCli.message).toContain("not found");
    expect(result.healthy).toBe(false);
    // State and lock checks should still be ok
    expect(result.checks.stateFile.ok).toBe(true);
    expect(result.checks.lockMechanism.ok).toBe(true);
  });

  it("reports lockMechanism ok with valid filesystem", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "claude 1.0.39\n", "");
        return undefined as any;
      },
    );

    const result = await checkHealth();

    expect(result.checks.lockMechanism.ok).toBe(true);
    expect(result.checks.lockMechanism.message).toBe(
      "Lock acquire/release cycle succeeded",
    );
  });

  it("handles corrupt state file gracefully", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "claude 1.0.39\n", "");
        return undefined as any;
      },
    );

    // Write invalid JSON to state file
    await writeFile(
      join(tempDir, "cc-bridge-state.json"),
      "not valid json {{{",
      "utf-8",
    );

    const result = await checkHealth();

    expect(result.checks.stateFile.ok).toBe(false);
    expect(result.checks.stateFile.message).toContain("invalid JSON");
  });

  it("includes serverVersion in response", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "claude 1.0.39\n", "");
        return undefined as any;
      },
    );

    const result = await checkHealth();

    expect(result.serverVersion).toBe(SERVER_VERSION);
  });
});
