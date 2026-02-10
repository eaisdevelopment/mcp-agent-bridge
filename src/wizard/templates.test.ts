import { describe, it, expect } from "vitest";

describe("mcpJsonContent", () => {
  it("generates valid JSON with npx path", async () => {
    const { mcpJsonContent } = await import("./templates.js");
    const result = mcpJsonContent("/usr/local/bin/npx");
    const parsed = JSON.parse(result);
    expect(parsed.mcpServers["cc-bridge"].command).toBe("/usr/local/bin/npx");
    expect(parsed.mcpServers["cc-bridge"].args).toContain("cc-bridge-mcp-server");
  });
});

describe("claudeMdBridgeSection", () => {
  it("includes peerId and label", async () => {
    const { claudeMdBridgeSection } = await import("./templates.js");
    const result = claudeMdBridgeSection("backend", "CC_Backend", "frontend");
    expect(result).toContain('peerId="backend"');
    expect(result).toContain("CC_Backend");
    expect(result).toContain("frontend");
  });
});

describe("demoServerJs", () => {
  it("generates Express server code with bugs", async () => {
    const { demoServerJs } = await import("./templates.js");
    const result = demoServerJs();
    expect(result).toContain("express");
    expect(result).toContain("BUG");
    expect(result).toContain("3001");
  });
});

describe("demoAppJs", () => {
  it("generates client code", async () => {
    const { demoAppJs } = await import("./templates.js");
    const result = demoAppJs();
    expect(result).toContain("axios");
    expect(result).toContain("3001");
  });
});

describe("demoPackageJson", () => {
  it("generates valid JSON for backend", async () => {
    const { demoPackageJson } = await import("./templates.js");
    const result = demoPackageJson("api-server", { express: "^4.21.0", cors: "^2.8.5" });
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("api-server");
    expect(parsed.dependencies.express).toBeDefined();
  });
});

describe("demoBackendClaudeMd", () => {
  it("contains backend-specific instructions", async () => {
    const { demoBackendClaudeMd } = await import("./templates.js");
    const result = demoBackendClaudeMd();
    expect(result).toContain("backend");
    expect(result).toContain("CC_Backend");
    expect(result).toContain("server.js");
  });
});

describe("demoFrontendClaudeMd", () => {
  it("contains frontend-specific instructions", async () => {
    const { demoFrontendClaudeMd } = await import("./templates.js");
    const result = demoFrontendClaudeMd();
    expect(result).toContain("frontend");
    expect(result).toContain("CC_Frontend");
    expect(result).toContain("app.js");
  });
});
