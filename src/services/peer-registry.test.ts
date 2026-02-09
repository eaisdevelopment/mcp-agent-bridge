import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestConfig } from "../test-helpers.js";
import {
  registerPeer,
  deregisterPeer,
  listPeers,
  getPeer,
  recordMessage,
  getHistory,
} from "./peer-registry.js";

let cleanup: () => Promise<void>;
let tempDir: string;

beforeEach(async () => {
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  tempDir = ctx.tempDir;
});

afterEach(async () => {
  await cleanup();
});

describe("registerPeer", () => {
  it("creates a new peer entry with all required fields", async () => {
    const peer = await registerPeer("be", "sess-1", "/tmp/project", "backend");
    expect(peer.peerId).toBe("be");
    expect(peer.sessionId).toBe("sess-1");
    expect(peer.cwd).toBe("/tmp/project");
    expect(peer.label).toBe("backend");
    expect(peer.registeredAt).toBeTruthy();
    expect(new Date(peer.registeredAt).toISOString()).toBe(peer.registeredAt);
  });

  it("overwrites existing peer with same ID", async () => {
    await registerPeer("be", "sess-1", "/tmp/a", "backend-v1");
    const updated = await registerPeer("be", "sess-2", "/tmp/b", "backend-v2");
    expect(updated.sessionId).toBe("sess-2");
    expect(updated.label).toBe("backend-v2");

    const peers = await listPeers();
    expect(peers).toHaveLength(1);
  });

  it("persists across separate read calls", async () => {
    await registerPeer("be", "sess-1", "/tmp/project", "backend");
    const retrieved = await getPeer("be");
    expect(retrieved).toBeDefined();
    expect(retrieved!.peerId).toBe("be");
    expect(retrieved!.sessionId).toBe("sess-1");
  });
});

describe("deregisterPeer", () => {
  it("returns true when peer existed", async () => {
    await registerPeer("be", "sess-1", "/tmp/project", "backend");
    const result = await deregisterPeer("be");
    expect(result).toBe(true);

    const peer = await getPeer("be");
    expect(peer).toBeUndefined();
  });

  it("returns false when peer did not exist", async () => {
    const result = await deregisterPeer("nonexistent");
    expect(result).toBe(false);
  });
});

describe("listPeers", () => {
  it("returns empty array initially", async () => {
    const peers = await listPeers();
    expect(peers).toEqual([]);
  });

  it("returns all registered peers", async () => {
    await registerPeer("be", "sess-1", "/tmp/a", "backend");
    await registerPeer("fe", "sess-2", "/tmp/b", "frontend");
    const peers = await listPeers();
    expect(peers).toHaveLength(2);
    const ids = peers.map((p) => p.peerId).sort();
    expect(ids).toEqual(["be", "fe"]);
  });
});

describe("getPeer", () => {
  it("returns undefined for nonexistent peer", async () => {
    const peer = await getPeer("nonexistent");
    expect(peer).toBeUndefined();
  });

  it("returns PeerInfo for registered peer", async () => {
    await registerPeer("be", "sess-1", "/tmp/project", "backend");
    const peer = await getPeer("be");
    expect(peer).toBeDefined();
    expect(peer!.peerId).toBe("be");
    expect(peer!.label).toBe("backend");
  });
});

describe("recordMessage + getHistory", () => {
  it("records a message and retrieves it with auto-assigned id and timestamp", async () => {
    const msg = await recordMessage({
      fromPeerId: "be",
      toPeerId: "fe",
      message: "hello",
      response: "hi",
      durationMs: 100,
      success: true,
      error: null,
    });

    expect(msg.id).toBeTruthy();
    // UUID v4 format check
    expect(msg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(msg.timestamp).toBeTruthy();
    expect(new Date(msg.timestamp).toISOString()).toBe(msg.timestamp);

    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(msg.id);
  });

  it("filters by peerId (sender or recipient)", async () => {
    await recordMessage({
      fromPeerId: "be",
      toPeerId: "fe",
      message: "msg1",
      response: null,
      durationMs: 50,
      success: true,
      error: null,
    });
    await recordMessage({
      fromPeerId: "fe",
      toPeerId: "be",
      message: "msg2",
      response: null,
      durationMs: 50,
      success: true,
      error: null,
    });
    await recordMessage({
      fromPeerId: "x",
      toPeerId: "y",
      message: "msg3",
      response: null,
      durationMs: 50,
      success: true,
      error: null,
    });

    const beHistory = await getHistory("be");
    expect(beHistory).toHaveLength(2);
    beHistory.forEach((m) => {
      expect(m.fromPeerId === "be" || m.toPeerId === "be").toBe(true);
    });
  });

  it("respects limit parameter (returns most recent N)", async () => {
    for (let i = 0; i < 3; i++) {
      await recordMessage({
        fromPeerId: "be",
        toPeerId: "fe",
        message: `msg-${i}`,
        response: null,
        durationMs: 10,
        success: true,
        error: null,
      });
    }

    const limited = await getHistory(undefined, 2);
    expect(limited).toHaveLength(2);
    // Should be the most recent 2 (msg-1 and msg-2)
    expect(limited[0].message).toBe("msg-1");
    expect(limited[1].message).toBe("msg-2");
  });

  it("messages persist to state file", async () => {
    await recordMessage({
      fromPeerId: "be",
      toPeerId: "fe",
      message: "persisted",
      response: "ok",
      durationMs: 10,
      success: true,
      error: null,
    });

    // Fresh getHistory call should still see the message
    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].message).toBe("persisted");
  });
});

describe("corrupt state recovery", () => {
  it("returns empty array when state file contains invalid JSON", async () => {
    const statePath = join(tempDir, "cc-bridge-state.json");
    await writeFile(statePath, "NOT VALID JSON {{{", "utf-8");

    const peers = await listPeers();
    expect(peers).toEqual([]);
  });

  it("allows registerPeer after recovery from corrupt state", async () => {
    const statePath = join(tempDir, "cc-bridge-state.json");
    await writeFile(statePath, "CORRUPT!", "utf-8");

    // Recovery happens automatically
    await listPeers();

    // Should be able to register after recovery
    const peer = await registerPeer("be", "sess-1", "/tmp/project", "backend");
    expect(peer.peerId).toBe("be");

    const peers = await listPeers();
    expect(peers).toHaveLength(1);
  });
});

describe("state isolation (TEST-05)", () => {
  it("uses isolated temp dir (not ~/cloud_code_bridge)", () => {
    expect(tempDir).toContain("cc-bridge-test-");
    expect(tempDir).not.toContain("cloud_code_bridge");
  });
});
