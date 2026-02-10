import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldDemo } from "./scaffold-demo.js";
import { scaffoldReal } from "./scaffold-real.js";

describe("Demo scaffold integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-integ-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a fully valid demo setup", () => {
    const base = path.join(tmpDir, "demo");
    const result = scaffoldDemo(base, "/usr/local/bin/npx");

    // Verify 8 files
    expect(result.files).toHaveLength(8);

    // Backend .mcp.json is valid and references cc-bridge
    const backendMcp = JSON.parse(
      fs.readFileSync(path.join(base, "api-server/.mcp.json"), "utf-8"),
    );
    expect(backendMcp.mcpServers["cc-bridge"]).toBeDefined();

    // Frontend .mcp.json is valid and references cc-bridge
    const frontendMcp = JSON.parse(
      fs.readFileSync(path.join(base, "web-client/.mcp.json"), "utf-8"),
    );
    expect(frontendMcp.mcpServers["cc-bridge"]).toBeDefined();

    // Backend CLAUDE.md references "backend" peer
    const backendMd = fs.readFileSync(path.join(base, "api-server/CLAUDE.md"), "utf-8");
    expect(backendMd).toContain('peerId="backend"');
    expect(backendMd).toContain("CC_Backend");

    // Frontend CLAUDE.md references "frontend" peer
    const frontendMd = fs.readFileSync(path.join(base, "web-client/CLAUDE.md"), "utf-8");
    expect(frontendMd).toContain('peerId="frontend"');
    expect(frontendMd).toContain("CC_Frontend");

    // server.js contains the bug markers
    const serverJs = fs.readFileSync(path.join(base, "api-server/server.js"), "utf-8");
    expect(serverJs).toContain("BUG 1");
    expect(serverJs).toContain("BUG 2");
  });
});

describe("Real scaffold integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-integ-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("wires up two existing projects without destroying content", () => {
    const projA = path.join(tmpDir, "my-api");
    const projB = path.join(tmpDir, "my-app");
    fs.mkdirSync(projA);
    fs.mkdirSync(projB);

    // Pre-existing files
    fs.writeFileSync(path.join(projA, "CLAUDE.md"), "# My API\n\nExisting rules.\n");
    fs.writeFileSync(
      path.join(projA, ".mcp.json"),
      JSON.stringify({ mcpServers: { "other-tool": { command: "other" } } }, null, 2),
    );

    const result = scaffoldReal({
      projectAPath: projA,
      projectAId: "api",
      projectALabel: "CC_API",
      projectBPath: projB,
      projectBId: "app",
      projectBLabel: "CC_App",
      npxPath: "npx",
    });

    // Project A: .mcp.json merged (other-tool preserved)
    const mcpA = JSON.parse(fs.readFileSync(path.join(projA, ".mcp.json"), "utf-8"));
    expect(mcpA.mcpServers["other-tool"]).toBeDefined();
    expect(mcpA.mcpServers["cc-bridge"]).toBeDefined();

    // Project A: CLAUDE.md appended (original content preserved)
    const mdA = fs.readFileSync(path.join(projA, "CLAUDE.md"), "utf-8");
    expect(mdA).toContain("# My API");
    expect(mdA).toContain("Existing rules.");
    expect(mdA).toContain("CC Bridge Protocol");
    expect(mdA).toContain('peerId="api"');

    // Project B: fresh files created
    expect(fs.existsSync(path.join(projB, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(projB, "CLAUDE.md"))).toBe(true);

    // Result tracking
    expect(result.modified.length).toBeGreaterThan(0);
    expect(result.created.length).toBeGreaterThan(0);
  });
});
