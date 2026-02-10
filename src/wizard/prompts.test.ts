import { describe, it, expect, vi, beforeEach } from "vitest";
import * as readline from "node:readline";

// We'll test the prompt functions by mocking readline
// The functions: ask(), choose(), confirm()

describe("ask", () => {
  it("returns user input trimmed", async () => {
    const { ask } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("  hello  ")),
      close: vi.fn(),
    };
    const result = await ask(mockRl as any, "Name? ");
    expect(result).toBe("hello");
  });

  it("returns default when user presses enter with no input", async () => {
    const { ask } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("")),
      close: vi.fn(),
    };
    const result = await ask(mockRl as any, "Name? ", "default-val");
    expect(result).toBe("default-val");
  });
});

describe("choose", () => {
  it("returns selected option by number", async () => {
    const { choose } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("2")),
      close: vi.fn(),
    };
    const result = await choose(mockRl as any, "Pick:", ["Alpha", "Beta"]);
    expect(result).toBe(1); // 0-indexed
  });
});

describe("confirm", () => {
  it("returns true for 'y'", async () => {
    const { confirm } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("y")),
      close: vi.fn(),
    };
    const result = await confirm(mockRl as any, "OK?");
    expect(result).toBe(true);
  });

  it("returns false for 'n'", async () => {
    const { confirm } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("n")),
      close: vi.fn(),
    };
    const result = await confirm(mockRl as any, "OK?");
    expect(result).toBe(false);
  });

  it("returns default when pressing enter", async () => {
    const { confirm } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("")),
      close: vi.fn(),
    };
    const result = await confirm(mockRl as any, "OK?", true);
    expect(result).toBe(true);
  });
});
