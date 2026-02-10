import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Test the printSummary output helper (the main flow is hard to unit test
// because it's interactive; we test the sub-functions instead)
describe("printDemoNextSteps", () => {
  it("outputs next steps with correct paths", async () => {
    const { printDemoNextSteps } = await import("./index.js");
    const output: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => output.push(msg);

    printDemoNextSteps("/home/user/demo");

    console.log = origLog;

    const joined = output.join("\n");
    expect(joined).toContain("/home/user/demo/api-server");
    expect(joined).toContain("/home/user/demo/web-client");
    expect(joined).toContain("npm install");
    expect(joined).toContain("node server.js");
    expect(joined).toContain("claude");
    expect(joined).toContain("Adding More Peers");
  });
});

describe("printRealNextSteps", () => {
  it("outputs next steps with project paths and peer info", async () => {
    const { printRealNextSteps } = await import("./index.js");
    const output: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => output.push(msg);

    printRealNextSteps(
      "/path/a", "peer-a", "Label_A",
      "/path/b", "peer-b", "Label_B",
      { created: ["/path/a/.mcp.json"], modified: [], skipped: [] },
    );

    console.log = origLog;

    const joined = output.join("\n");
    expect(joined).toContain("/path/a");
    expect(joined).toContain("/path/b");
    expect(joined).toContain("peer-a");
    expect(joined).toContain("peer-b");
    expect(joined).toContain("Adding More Peers");
  });
});
