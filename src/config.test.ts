import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, getConfig, resetConfig } from "./config.js";

beforeEach(() => {
  resetConfig();
});

describe("loadConfig", () => {
  it("returns defaults when no env vars are provided", () => {
    const config = loadConfig({});
    expect(config.CC_BRIDGE_STATE_PATH).toContain("cloud_code_bridge");
    expect(config.CC_BRIDGE_TIMEOUT_MS).toBe(120_000);
    expect(config.CC_BRIDGE_CHAR_LIMIT).toBe(0);
    expect(config.CC_BRIDGE_LOG_LEVEL).toBe("info");
    expect(config.CC_BRIDGE_CLAUDE_PATH).toBe("claude");
  });

  it("overrides all values with custom env", () => {
    const config = loadConfig({
      CC_BRIDGE_STATE_PATH: "/custom/path",
      CC_BRIDGE_TIMEOUT_MS: "30000",
      CC_BRIDGE_CHAR_LIMIT: "5000",
      CC_BRIDGE_LOG_LEVEL: "debug",
      CC_BRIDGE_CLAUDE_PATH: "/usr/local/bin/claude",
    });
    expect(config.CC_BRIDGE_STATE_PATH).toBe("/custom/path");
    expect(config.CC_BRIDGE_TIMEOUT_MS).toBe(30000);
    expect(config.CC_BRIDGE_CHAR_LIMIT).toBe(5000);
    expect(config.CC_BRIDGE_LOG_LEVEL).toBe("debug");
    expect(config.CC_BRIDGE_CLAUDE_PATH).toBe("/usr/local/bin/claude");
  });

  it("throws with descriptive error for invalid values", () => {
    expect(() =>
      loadConfig({ CC_BRIDGE_TIMEOUT_MS: "abc" }),
    ).toThrow("Invalid configuration");
  });
});

describe("getConfig", () => {
  it("throws if called before loadConfig", () => {
    expect(() => getConfig()).toThrow("Config not loaded");
  });

  it("returns loaded config after loadConfig", () => {
    loadConfig({});
    const config = getConfig();
    expect(config.CC_BRIDGE_STATE_PATH).toContain("cloud_code_bridge");
  });
});

describe("resetConfig", () => {
  it("causes getConfig to throw after reset", () => {
    loadConfig({});
    resetConfig();
    expect(() => getConfig()).toThrow("Config not loaded");
  });
});

describe("config immutability", () => {
  it("config object is frozen (cannot be modified)", () => {
    const config = loadConfig({});
    expect(() => {
      (config as any).CC_BRIDGE_TIMEOUT_MS = 999;
    }).toThrow(TypeError);
  });
});
