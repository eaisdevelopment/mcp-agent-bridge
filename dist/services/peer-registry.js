import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
/* ------------------------------------------------------------------ */
/*  File-based shared state (Option B)                                */
/*  Two or more MCP server processes share /tmp/cc-bridge-state.json  */
/* ------------------------------------------------------------------ */
const STATE_PATH = path.join("/tmp", "cc-bridge-state.json");
const LOCK_PATH = STATE_PATH + ".lock";
const MAX_MESSAGES = 500;
const LOCK_RETRY_MS = 50;
const LOCK_MAX_WAIT_MS = 5_000;
/* ---- low-level helpers ------------------------------------------- */
function emptyState() {
    return { peers: {}, messages: [] };
}
async function readState() {
    try {
        const raw = await fs.readFile(STATE_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch (err) {
        if (err.code === "ENOENT") {
            return emptyState();
        }
        throw err;
    }
}
async function writeState(state) {
    const tmp = STATE_PATH + "." + process.pid + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
    await fs.rename(tmp, STATE_PATH); // atomic on same filesystem
}
/* ---- file-lock (O_CREAT | O_EXCL) ------------------------------- */
async function acquireLock() {
    const deadline = Date.now() + LOCK_MAX_WAIT_MS;
    while (Date.now() < deadline) {
        try {
            // Atomic create-if-not-exists
            await fs.writeFile(LOCK_PATH, String(process.pid), {
                flag: "wx", // O_WRONLY | O_CREAT | O_EXCL
            });
            return; // lock acquired
        }
        catch (err) {
            if (err.code === "EEXIST") {
                // Check for stale lock (process died)
                try {
                    const content = await fs.readFile(LOCK_PATH, "utf-8");
                    const lockPid = parseInt(content, 10);
                    if (!isNaN(lockPid)) {
                        try {
                            process.kill(lockPid, 0); // just checks existence
                        }
                        catch {
                            // Process doesn't exist — stale lock
                            await fs.unlink(LOCK_PATH).catch(() => { });
                            continue; // retry immediately
                        }
                    }
                }
                catch { /* lock file disappeared, retry */
                    continue;
                }
                await sleep(LOCK_RETRY_MS);
                continue;
            }
            throw err;
        }
    }
    throw new Error("Failed to acquire lock within timeout");
}
async function releaseLock() {
    await fs.unlink(LOCK_PATH).catch(() => { });
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/** Run a mutating operation under an exclusive file lock. */
async function withLock(fn) {
    await acquireLock();
    try {
        return await fn();
    }
    finally {
        await releaseLock();
    }
}
/* ---- public API (all async) -------------------------------------- */
export async function registerPeer(peerId, sessionId, cwd, label) {
    return withLock(async () => {
        const state = await readState();
        const peer = {
            peerId,
            sessionId,
            cwd,
            label,
            registeredAt: new Date().toISOString(),
        };
        state.peers[peerId] = peer;
        await writeState(state);
        return peer;
    });
}
export async function deregisterPeer(peerId) {
    return withLock(async () => {
        const state = await readState();
        if (!(peerId in state.peers))
            return false;
        delete state.peers[peerId];
        await writeState(state);
        return true;
    });
}
export async function getPeer(peerId) {
    const state = await readState();
    return state.peers[peerId];
}
export async function listPeers() {
    const state = await readState();
    return Object.values(state.peers);
}
export async function recordMessage(record) {
    return withLock(async () => {
        const state = await readState();
        const full = {
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
export async function getHistory(peerId, limit = 50) {
    const state = await readState();
    let filtered = state.messages;
    if (peerId) {
        filtered = state.messages.filter((m) => m.fromPeerId === peerId || m.toPeerId === peerId);
    }
    return filtered.slice(-limit);
}
//# sourceMappingURL=peer-registry.js.map