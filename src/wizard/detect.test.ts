import { describe, it, expect, vi } from "vitest";
import * as childProcess from "node:child_process";

vi.mock("node:child_process");

describe("detectNpxPath", () => {
  it("returns absolute npx path from which", async () => {
    vi.mocked(childProcess.execSync).mockReturnValue(
      "/Users/dev/.nvm/versions/node/v22.11.0/bin/npx\n" as any,
    );
    const { detectNpxPath } = await import("./detect.js");
    const result = detectNpxPath();
    expect(result).toBe("/Users/dev/.nvm/versions/node/v22.11.0/bin/npx");
  });

  it("returns 'npx' when which fails", async () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const { detectNpxPath } = await import("./detect.js");
    const result = detectNpxPath();
    expect(result).toBe("npx");
  });
});

describe("detectClaudePath", () => {
  it("returns absolute claude path from which", async () => {
    vi.mocked(childProcess.execSync).mockReturnValue(
      "/usr/local/bin/claude\n" as any,
    );
    const { detectClaudePath } = await import("./detect.js");
    const result = detectClaudePath();
    expect(result).toBe("/usr/local/bin/claude");
  });

  it("returns null when claude not found", async () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const { detectClaudePath } = await import("./detect.js");
    const result = detectClaudePath();
    expect(result).toBeNull();
  });
});

describe("isNvmPath", () => {
  it("detects nvm paths", async () => {
    const { isNvmPath } = await import("./detect.js");
    expect(isNvmPath("/Users/dev/.nvm/versions/node/v22/bin/npx")).toBe(true);
    expect(isNvmPath("/usr/local/bin/npx")).toBe(false);
  });
});
