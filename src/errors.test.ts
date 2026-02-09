import { describe, it, expect } from "vitest";
import {
  BridgeError,
  BridgeErrorCode,
  toolResult,
  errorResult,
  successResult,
} from "./errors.js";

describe("BridgeError", () => {
  it("formats message with suggestion", () => {
    const err = new BridgeError(
      BridgeErrorCode.CLI_NOT_FOUND,
      "claude not found",
      "Install Claude Code",
    );
    expect(err.message).toBe(
      "CLI_NOT_FOUND: claude not found. Install Claude Code",
    );
    expect(err.code).toBe(BridgeErrorCode.CLI_NOT_FOUND);
    expect(err.suggestion).toBe("Install Claude Code");
  });

  it("formats message without suggestion", () => {
    const err = new BridgeError(
      BridgeErrorCode.CLI_TIMEOUT,
      "timed out",
    );
    expect(err.message).toBe("CLI_TIMEOUT: timed out");
    expect(err.suggestion).toBeUndefined();
  });

  it("has accessible code and suggestion properties", () => {
    const err = new BridgeError(
      BridgeErrorCode.PEER_NOT_FOUND,
      "peer missing",
      "Register first",
    );
    expect(err.code).toBe("PEER_NOT_FOUND");
    expect(err.suggestion).toBe("Register first");
    expect(err.name).toBe("BridgeError");
  });
});

describe("toolResult", () => {
  it("returns content array without isError by default", () => {
    const result = toolResult("hello");
    expect(result).toEqual({
      content: [{ type: "text", text: "hello" }],
    });
    expect(result).not.toHaveProperty("isError");
  });

  it("returns content with isError: true when specified", () => {
    const result = toolResult("error text", true);
    expect(result).toEqual({
      content: [{ type: "text", text: "error text" }],
      isError: true,
    });
  });
});

describe("errorResult", () => {
  it("returns JSON with BridgeError details", () => {
    const err = new BridgeError(
      BridgeErrorCode.STATE_CORRUPT,
      "bad state",
      "Delete the file",
    );
    const result = errorResult(err);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("STATE_CORRUPT");
    expect(parsed.message).toContain("STATE_CORRUPT: bad state");
    expect(parsed.suggestion).toBe("Delete the file");
    expect(result.isError).toBe(true);
  });

  it("returns INTERNAL_ERROR for generic Error", () => {
    const err = new Error("something went wrong");
    const result = errorResult(err);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("INTERNAL_ERROR");
    expect(parsed.message).toBe("something went wrong");
    expect(result.isError).toBe(true);
  });
});

describe("successResult", () => {
  it("returns JSON-stringified content without isError", () => {
    const result = successResult({ foo: "bar" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ foo: "bar" });
    expect(result).not.toHaveProperty("isError");
  });
});
