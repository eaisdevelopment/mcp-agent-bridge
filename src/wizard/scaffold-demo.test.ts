import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("scaffoldDemo", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates all 8 expected files", async () => {
    const { scaffoldDemo } = await import("./scaffold-demo.js");
    const baseDir = path.join(tmpDir, "demo");
    const result = scaffoldDemo(baseDir, "/usr/local/bin/npx");

    expect(result.files).toHaveLength(8);

    const expected = [
      "api-server/package.json",
      "api-server/server.js",
      "api-server/.mcp.json",
      "api-server/CLAUDE.md",
      "web-client/package.json",
      "web-client/app.js",
      "web-client/.mcp.json",
      "web-client/CLAUDE.md",
    ];

    for (const f of expected) {
      const fullPath = path.join(baseDir, f);
      expect(fs.existsSync(fullPath), `Expected ${f} to exist`).toBe(true);
    }
  });

  it("creates valid JSON in package.json files", async () => {
    const { scaffoldDemo } = await import("./scaffold-demo.js");
    const baseDir = path.join(tmpDir, "demo");
    scaffoldDemo(baseDir, "npx");

    const backendPkg = JSON.parse(
      fs.readFileSync(path.join(baseDir, "api-server/package.json"), "utf-8"),
    );
    expect(backendPkg.dependencies.express).toBeDefined();

    const frontendPkg = JSON.parse(
      fs.readFileSync(path.join(baseDir, "web-client/package.json"), "utf-8"),
    );
    expect(frontendPkg.dependencies.axios).toBeDefined();
  });

  it("creates valid .mcp.json with provided npx path", async () => {
    const { scaffoldDemo } = await import("./scaffold-demo.js");
    const baseDir = path.join(tmpDir, "demo");
    scaffoldDemo(baseDir, "/custom/npx");

    const mcpJson = JSON.parse(
      fs.readFileSync(path.join(baseDir, "api-server/.mcp.json"), "utf-8"),
    );
    expect(mcpJson.mcpServers["cc-bridge"].command).toBe("/custom/npx");
  });
});
