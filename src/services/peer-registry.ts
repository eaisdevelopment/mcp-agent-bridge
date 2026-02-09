import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PeerInfo, MessageRecord } from "../types.js";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";
import { BridgeError, BridgeErrorCode } from "../errors.js";

/* ------------------------------------------------------------------ */
/*  File-based shared state                                           */
/*  Two or more MCP server processes share a state JSON file          */
/*  State path is config-driven via CC_BRIDGE_STATE_PATH              */
/* ------------------------------------------------------------------ */

const MAX_MESSAGES = 500;
const LOCK_RETRY_MS = 50;
const LOCK_MAX_WAIT_MS = 5_000;

/** Derive state file path from config at call time (not module load time). */
function getStatePath(): string {
  return path.join(getConfig().CC_BRIDGE_STATE_PATH, "cc-bridge-state.json");
}

/** Derive lock file path from state path at call time. */
function getLockPath(): string {
  return getStatePath() + ".lock";
}

interface BridgeState {
  peers: Record<string, PeerInfo>;
  messages: MessageRecord[];
}

/* ---- low-level helpers ------------------------------------------- */

function emptyState(): BridgeState {
  return { peers: {}, messages: [] };
}

/** Migrate legacy state: ensure all peers have lastSeenAt field. */
function migrateState(state: BridgeState): BridgeState {
  for (const peer of Object.values(state.peers)) {
    if (!peer.lastSeenAt) {
      peer.lastSeenAt = peer.registeredAt;
    }
  }
  return state;
}

async function readState(): Promise<BridgeState> {
  const statePath = getStatePath();
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    return migrateState(JSON.parse(raw) as BridgeState);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return migrateState(emptyState());
    }
    if (err instanceof SyntaxError) {
      // Corrupt JSON -- auto-recover with backup
      const backupPath = statePath + ".corrupt." + Date.now();
      try {
        await fs.copyFile(statePath, backupPath);
      } catch {
        // Backup failure is non-fatal
      }
      logger.warn(
        `STATE_CORRUPT: State file corrupt (invalid JSON), backed up to ${backupPath}. Starting with empty state.`,
      );
      return migrateState(emptyState());
    }
    throw new BridgeError(
      BridgeErrorCode.STATE_WRITE_FAILED,
      `Failed to read state file: ${(err as Error).message}`,
      `Check permissions on ${statePath}`,
    );
  }
}

async function writeState(state: BridgeState): Promise<void> {
  const statePath = getStatePath();
  const tmp = statePath + "." + process.pid + ".tmp";
  try {
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
    await fs.rename(tmp, statePath); // atomic on same filesystem
  } catch (err: unknown) {
    throw new BridgeError(
      BridgeErrorCode.STATE_WRITE_FAILED,
      `Failed to write state file: ${(err as Error).message}`,
      `Check permissions on ${statePath}`,
    );
  }
}

/* ---- file-lock (O_CREAT | O_EXCL) ------------------------------- */

async function acquireLock(): Promise<void> {
  const lockPath = getLockPath();
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      // Atomic create-if-not-exists
      await fs.writeFile(lockPath, String(process.pid), {
        flag: "wx", // O_WRONLY | O_CREAT | O_EXCL
      });
      return; // lock acquired
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // Check for stale lock (process died)
        try {
          const content = await fs.readFile(lockPath, "utf-8");
          const lockPid = parseInt(content, 10);
          if (!isNaN(lockPid)) {
            try {
              process.kill(lockPid, 0); // just checks existence
            } catch {
              // Process doesn't exist -- stale lock
              logger.info(`Cleaned up stale lock from PID ${lockPid}`);
              await fs.unlink(lockPath).catch(() => {});
              continue; // retry immediately
            }
          }
        } catch { /* lock file disappeared, retry */ continue; }

        await sleep(LOCK_RETRY_MS);
        continue;
      }
      throw err;
    }
  }
  // Timeout -- read lock to report holder PID
  let lockPid = "unknown";
  try {
    const content = await fs.readFile(lockPath, "utf-8");
    lockPid = content.trim();
  } catch { /* ignore read failure */ }
  throw new BridgeError(
    BridgeErrorCode.LOCK_TIMEOUT,
    `Failed to acquire lock within ${LOCK_MAX_WAIT_MS}ms (held by PID ${lockPid})`,
    `Another cc-bridge process may be stuck. Delete ${lockPath} if no other instance is running.`,
  );
}

async function releaseLock(): Promise<void> {
  await fs.unlink(getLockPath()).catch(() => {});
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run a mutating operation under an exclusive file lock. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquireLock();
  try {
    return await fn();
  } finally {
    await releaseLock();
  }
}

/* ---- public API (all async) -------------------------------------- */

export async function registerPeer(
  peerId: string,
  sessionId: string,
  cwd: string,
  label: string
): Promise<PeerInfo> {
  return withLock(async () => {
    const state = await readState();
    const now = new Date().toISOString();
    const peer: PeerInfo = {
      peerId,
      sessionId,
      cwd,
      label,
      registeredAt: now,
      lastSeenAt: now,
    };
    state.peers[peerId] = peer;
    await writeState(state);
    return peer;
  });
}

export async function updateLastSeen(peerId: string): Promise<void> {
  return withLock(async () => {
    const state = await readState();
    const peer = state.peers[peerId];
    if (peer) {
      peer.lastSeenAt = new Date().toISOString();
      await writeState(state);
    }
  });
}

export async function deregisterPeer(peerId: string): Promise<boolean> {
  return withLock(async () => {
    const state = await readState();
    if (!(peerId in state.peers)) return false;
    delete state.peers[peerId];
    await writeState(state);
    return true;
  });
}

export async function getPeer(
  peerId: string
): Promise<PeerInfo | undefined> {
  const state = await readState();
  return state.peers[peerId];
}

export async function listPeers(): Promise<PeerInfo[]> {
  const state = await readState();
  return Object.values(state.peers);
}

export async function recordMessage(
  record: Omit<MessageRecord, "id" | "timestamp">
): Promise<MessageRecord> {
  return withLock(async () => {
    const state = await readState();
    const full: MessageRecord = {
      ...record,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    state.messages.push(full);
    // Cap history to prevent unbounded growth
    if (state.messages.length > MAX_MESSAGES) {
      state.messages = state.messages.slice(-MAX_MESSAGES);
    }
    await writeState(state);
    return full;
  });
}

export async function getHistory(
  peerId?: string,
  limit = 50
): Promise<MessageRecord[]> {
  const state = await readState();
  let filtered = state.messages;
  if (peerId) {
    filtered = state.messages.filter(
      (m) => m.fromPeerId === peerId || m.toPeerId === peerId
    );
  }
  return filtered.slice(-limit);
}
