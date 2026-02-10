import { describe, it, expect, vi } from "vitest";

describe("CLI routing", () => {
  it("exports runCli function", async () => {
    const mod = await import("./cli.js");
    expect(typeof mod.runCli).toBe("function");
  });
});
