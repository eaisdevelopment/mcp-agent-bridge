import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("scaffoldReal", () => {
  let tmpDir: string;
  let projectA: string;
  let projectB: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-test-"));
    projectA = path.join(tmpDir, "project-a");
    projectB = path.join(tmpDir, "project-b");
    fs.mkdirSync(projectA);
    fs.mkdirSync(projectB);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .mcp.json and CLAUDE.md in both projects", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    scaffoldReal({
      projectAPath: projectA,
      projectAId: "backend",
      projectALabel: "CC_Backend",
      projectBPath: projectB,
      projectBId: "frontend",
      projectBLabel: "CC_Frontend",
      npxPath: "npx",
    });

    expect(fs.existsSync(path.join(projectA, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectA, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectB, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectB, "CLAUDE.md"))).toBe(true);
  });

  it("merges into existing .mcp.json without destroying other keys", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    const existing = { mcpServers: { other: { command: "foo" } } };
    fs.writeFileSync(
      path.join(projectA, ".mcp.json"),
      JSON.stringify(existing, null, 2),
    );

    scaffoldReal({
      projectAPath: projectA,
      projectAId: "a",
      projectALabel: "A",
      projectBPath: projectB,
      projectBId: "b",
      projectBLabel: "B",
      npxPath: "npx",
    });

    const merged = JSON.parse(
      fs.readFileSync(path.join(projectA, ".mcp.json"), "utf-8"),
    );
    expect(merged.mcpServers.other).toBeDefined();
    expect(merged.mcpServers["cc-bridge"]).toBeDefined();
  });

  it("appends to existing CLAUDE.md", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    fs.writeFileSync(path.join(projectA, "CLAUDE.md"), "# My Project\n\nExisting content.\n");

    scaffoldReal({
      projectAPath: projectA,
      projectAId: "a",
      projectALabel: "A",
      projectBPath: projectB,
      projectBId: "b",
      projectBLabel: "B",
      npxPath: "npx",
    });

    const content = fs.readFileSync(path.join(projectA, "CLAUDE.md"), "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Existing content.");
    expect(content).toContain("CC Bridge Protocol");
  });

  it("skips CLAUDE.md append if bridge section already exists", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    const existing = "# Project\n\n## CC Bridge Protocol\n\nAlready configured.\n";
    fs.writeFileSync(path.join(projectA, "CLAUDE.md"), existing);

    const result = scaffoldReal({
      projectAPath: projectA,
      projectAId: "a",
      projectALabel: "A",
      projectBPath: projectB,
      projectBId: "b",
      projectBLabel: "B",
      npxPath: "npx",
    });

    const content = fs.readFileSync(path.join(projectA, "CLAUDE.md"), "utf-8");
    // Should not have duplicate bridge sections
    const count = (content.match(/## CC Bridge Protocol/g) || []).length;
    expect(count).toBe(1);
    expect(result.skipped).toContain(path.join(projectA, "CLAUDE.md"));
  });
});
