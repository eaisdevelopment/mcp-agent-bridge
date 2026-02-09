# Phase 3: Health Check and Stale Peer Detection - Research

**Researched:** 2026-02-09
**Domain:** Node.js diagnostics, process liveness detection, MCP tool implementation
**Confidence:** HIGH

## Summary

Phase 3 adds two capabilities to the cc-bridge MCP server: (1) a new `cc_health_check` tool that performs a diagnostic sweep of the bridge's infrastructure (state file, lock mechanism, Claude CLI), and (2) stale peer detection in the existing `cc_list_peers` tool. Both features build on well-understood patterns already present in the codebase.

The health check tool is a pure diagnostic: it runs the same checks that `startup.ts` already performs (state dir writability, lock acquire/release, `claude --version`) but packages the results as an MCP tool response rather than startup logging. The stale peer detection adds a `lastSeenAt` timestamp to peer records and computes staleness based on a configurable TTL, since there is no reliable way to validate whether a Claude Code session ID is still active without actually resuming it (which would have side effects).

**Primary recommendation:** Implement health check as a service-layer function (`checkHealth()`) that returns a structured result object, then wrap it in a thin tool handler. For stale detection, use a TTL-based approach with `lastSeenAt` timestamps updated on every peer interaction (register, send_message), flagging peers as `potentiallyStale` when `now - lastSeenAt > TTL`.

## Standard Stack

### Core (already installed -- no new dependencies needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.26.0 | MCP server, tool registration | Already used for all 5 existing tools |
| `zod` | 3.25.76 | Input schema validation | Already used for tool input schemas |
| `node:fs/promises` | (built-in) | File system checks (access, readFile, writeFile) | Already used in peer-registry.ts |
| `node:child_process` | (built-in) | execFile for `claude --version` | Already used in startup.ts and cc-cli.ts |

### Supporting (no new packages)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:path` | (built-in) | PATH splitting, path construction | For `which`-style CLI lookup |
| `vitest` | 4.0.18 | Testing | Already used for all existing tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TTL-based stale detection | PID-based process liveness (`process.kill(pid, 0)`) | PID is unreliable: Claude Code sessions are not long-running processes owned by the bridge; the PID that ran `claude --resume` exits after the CLI call completes. TTL is the only viable approach. |
| TTL-based stale detection | Session file existence check (`~/.claude/projects/...`) | Requires knowing Claude Code's internal directory structure, which is undocumented/unstable. Too fragile. |
| Custom PATH lookup | `command-exists` npm package | Unnecessary dependency for a 15-line function. The codebase already does `execFile(claude, ['--version'])` in startup.ts. |

**Installation:**
```bash
# No new packages needed. All functionality uses existing dependencies.
```

## Architecture Patterns

### Recommended Project Structure

```
src/
  services/
    health-check.ts        # NEW: checkHealth() service function
    peer-registry.ts       # MODIFIED: add lastSeenAt, staleness logic
  tools/
    health-check.ts        # NEW: registerHealthCheckTool()
    list-peers.ts          # MODIFIED: include stale flag in output
  types.ts                 # MODIFIED: add lastSeenAt to PeerInfo, HealthCheckResult type
  errors.ts                # UNCHANGED (reuse existing error helpers)
  config.ts                # MODIFIED: add CC_BRIDGE_STALE_TIMEOUT_MS config
```

### Pattern 1: Service-Layer Health Check (consistent with existing architecture)

**What:** Health check logic lives in `services/health-check.ts` as a pure async function. The tool handler in `tools/health-check.ts` is a thin wrapper that calls the service and formats the MCP response.

**When to use:** Always -- this matches the existing pattern where `services/peer-registry.ts` contains business logic and `tools/*.ts` are thin MCP wrappers.

**Example:**
```typescript
// services/health-check.ts
// Follows same pattern as peer-registry.ts

export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    stateFile: { ok: boolean; message: string };
    lockMechanism: { ok: boolean; message: string };
    claudeCli: { ok: boolean; message: string; version?: string };
  };
  timestamp: string;
}

export async function checkHealth(): Promise<HealthCheckResult> {
  const checks = {
    stateFile: await checkStateFile(),
    lockMechanism: await checkLockMechanism(),
    claudeCli: await checkClaudeCli(),
  };

  return {
    healthy: Object.values(checks).every(c => c.ok),
    checks,
    timestamp: new Date().toISOString(),
  };
}
```

### Pattern 2: TTL-Based Stale Peer Detection

**What:** Each peer gets a `lastSeenAt` ISO timestamp, updated whenever the peer is involved in an interaction (registration, re-registration, sending a message, being a message target). When `cc_list_peers` runs, it compares `now - lastSeenAt` against a configurable `CC_BRIDGE_STALE_TIMEOUT_MS` (default: 30 minutes). Peers exceeding the TTL are flagged `potentiallyStale: true` in the response.

**When to use:** This is the only viable approach. Claude Code sessions are ephemeral CLI invocations, not long-running processes. There is no API to query whether a session ID is still active. The `--resume` flag simply loads conversation history from disk (`~/.claude/projects/`); it does not require a running process.

**Example:**
```typescript
// In PeerInfo type (types.ts)
export interface PeerInfo {
  peerId: string;
  sessionId: string;
  cwd: string;
  label: string;
  registeredAt: string;
  lastSeenAt: string;  // NEW: updated on every interaction
}

// In list-peers response (enriched)
export interface PeerListEntry extends PeerInfo {
  potentiallyStale: boolean;
  staleSinceMs: number | null;  // ms since last seen, null if not stale
}
```

### Pattern 3: Individual Check Functions (HLTH-01, HLTH-02, HLTH-03)

**What:** Each health sub-check is a separate async function returning `{ ok: boolean; message: string }`. This enables unit testing each check in isolation and provides clear, specific failure messages.

**HLTH-01 (state file):**
```typescript
async function checkStateFile(): Promise<CheckResult> {
  const statePath = getStatePath();
  try {
    // Try to read state file (or confirm dir is writable if no file yet)
    await fs.access(path.dirname(statePath), fs.constants.R_OK | fs.constants.W_OK);
    // Optionally verify state file is valid JSON if it exists
    try {
      const raw = await fs.readFile(statePath, "utf-8");
      JSON.parse(raw);
      return { ok: true, message: `State file readable and valid: ${statePath}` };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ok: true, message: `State directory writable (no state file yet): ${path.dirname(statePath)}` };
      }
      return { ok: false, message: `State file exists but is corrupt: ${statePath}` };
    }
  } catch {
    return { ok: false, message: `State directory not accessible: ${path.dirname(statePath)}` };
  }
}
```

**HLTH-02 (lock mechanism):**
```typescript
async function checkLockMechanism(): Promise<CheckResult> {
  const lockPath = getLockPath();
  try {
    // Attempt acquire/release cycle
    await fs.writeFile(lockPath, String(process.pid), { flag: "wx" });
    await fs.unlink(lockPath);
    return { ok: true, message: "Lock acquire/release cycle succeeded" };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      // Lock already held -- check if stale
      return { ok: false, message: `Lock file exists: ${lockPath}. Another process may be using it.` };
    }
    return { ok: false, message: `Lock mechanism failed: ${(err as Error).message}` };
  }
}
```

**HLTH-03 (claude CLI):**
```typescript
async function checkClaudeCli(): Promise<CheckResult & { version?: string }> {
  const config = getConfig();
  try {
    const { stdout } = await execFileAsync(config.CC_BRIDGE_CLAUDE_PATH, ["--version"], {
      timeout: 5000,
    });
    return { ok: true, message: `Claude CLI found`, version: stdout.trim() };
  } catch {
    return {
      ok: false,
      message: `Claude CLI not found at '${config.CC_BRIDGE_CLAUDE_PATH}'`,
    };
  }
}
```

### Anti-Patterns to Avoid

- **Attempting to validate session IDs by resuming them:** Calling `claude --resume <sessionId> -p "are you there?"` would actually send a message to the session, consuming API credits and potentially confusing the target session. Never do this for health checking.
- **Checking `~/.claude/projects/` for session files directly:** This couples the bridge to Claude Code's internal storage format, which is undocumented and subject to change. The JSONL format and directory structure could change in any release.
- **Blocking health check on lock acquisition:** The health check should do a non-blocking lock test (try `wx` once, do not loop/wait). If the lock is held, report it as a finding, not a failure to run the check itself.
- **Making health check mutate state:** The health check tool must be read-only (except for the ephemeral lock test). Do not write to the state file. Use `annotations.readOnlyHint: true`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI existence check | Custom PATH walking function | `execFile(claude, ['--version'])` with ENOENT catch | Already proven in `startup.ts`, handles edge cases (symlinks, shell wrappers). PATH walking would miss cases where `claude` is a shell function/alias. |
| File lock test | New lock implementation | Reuse `fs.writeFile(path, pid, { flag: 'wx' })` pattern from peer-registry.ts | Same atomic O_CREAT|O_EXCL pattern already battle-tested in the codebase |
| Structured MCP responses | Custom response formatting | `successResult()` and `errorResult()` from errors.ts | Consistent with all 5 existing tools |
| Input validation | Manual parameter checking | `zod` schemas in `registerTool` inputSchema | Consistent with existing tools |

**Key insight:** This phase does not introduce any genuinely new technical problems. Every sub-check (file access, lock acquire/release, CLI exec) already exists in the codebase. The work is composing these into a diagnostic tool and adding a timestamp-based staleness flag.

## Common Pitfalls

### Pitfall 1: Health Check Lock Test Leaves Stale Lock

**What goes wrong:** The health check acquires a lock to test the mechanism, but an error between acquire and release leaves the lock file behind, blocking all other operations.
**Why it happens:** Missing try/finally, or the lock check waits for an existing lock and times out.
**How to avoid:** Use a single non-blocking `wx` write attempt. Always wrap in try/finally. Consider using a separate health-check-specific lock file path (e.g., `cc-bridge-state.json.health-lock`) to avoid interfering with the real lock.
**Warning signs:** Other operations start timing out after a health check was run.

### Pitfall 2: lastSeenAt Migration Breaks Existing State Files

**What goes wrong:** Existing state files have `PeerInfo` objects without `lastSeenAt`. Reading them after the code change fails or produces undefined values.
**Why it happens:** No migration logic for the schema change.
**How to avoid:** When reading state, default missing `lastSeenAt` to `registeredAt` (which already exists on all peers). This is a safe fallback since the peer was definitely "seen" at registration time.
**Warning signs:** `cc_list_peers` crashes or shows `undefined` for `lastSeenAt` after upgrade.

### Pitfall 3: Stale Detection TTL Too Aggressive

**What goes wrong:** Peers are flagged as stale after only a few minutes, even though Claude Code sessions can be idle for hours (a user might be reading output, thinking, etc.).
**Why it happens:** Default TTL set too low.
**How to avoid:** Default to 30 minutes (`1_800_000 ms`). Make configurable via `CC_BRIDGE_STALE_TIMEOUT_MS`. Document that this is a hint, not a guarantee.
**Warning signs:** Users see "stale" warnings for peers that are actually active.

### Pitfall 4: Health Check Becomes a Performance Bottleneck

**What goes wrong:** `claude --version` subprocess takes 2-5 seconds. If health check is called frequently, it slows down the bridge.
**Why it happens:** CLI subprocess spawn overhead, especially with Node.js version managers (nvm/fnm) that add shell initialization time.
**How to avoid:** Set a reasonable timeout (5 seconds, matching startup.ts). Document that health check is not meant for high-frequency polling. Use `execFile` (not `exec`) to skip shell overhead.
**Warning signs:** Health check responses consistently take >3 seconds.

### Pitfall 5: Lock Test Interferes with Concurrent Operations

**What goes wrong:** Health check's lock test acquires the real lock file, blocking a concurrent `registerPeer` or `sendMessage` for the duration of the check.
**Why it happens:** Using the same lock file path as the production lock.
**How to avoid:** Two options: (A) use a separate lock file path like `cc-bridge-state.json.health-lock`, or (B) use a truly instant acquire-release with no async work between them. Option B is simplest since the lock test only needs to verify the filesystem supports `wx` flag -- it does not need to hold the lock for any duration.
**Warning signs:** Intermittent lock timeout errors during health checks.

## Code Examples

Verified patterns from the existing codebase:

### Tool Registration Pattern (from existing tools)
```typescript
// Source: src/tools/list-peers.ts (existing pattern)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { successResult, errorResult } from "../errors.js";
import { logger } from "../logger.js";

export function registerHealthCheckTool(server: McpServer): void {
  server.registerTool(
    "cc_health_check",
    {
      title: "Health Check",
      description:
        "Diagnose the bridge's operational status. " +
        "Checks state file accessibility, lock mechanism, and Claude CLI availability. " +
        "Returns per-check pass/fail with details.",
      inputSchema: {},  // No inputs needed (like list-peers)
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const result = await checkHealth();
        return successResult(result);
      } catch (err) {
        logger.error("health-check failed", { error: err });
        return errorResult(err);
      }
    }
  );
}
```

### Test Pattern (InMemoryTransport, from existing tests)
```typescript
// Source: src/tools/list-peers.test.ts (existing pattern)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "../test-helpers.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
  server = new McpServer({ name: "test", version: "1.0.0" });
  registerHealthCheckTool(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});
```

### CLI Check Pattern (from startup.ts)
```typescript
// Source: src/startup.ts line 99-112
const execFileAsync = promisify(execFile);

async function checkClaudeCli(claudePath: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync(claudePath, ["--version"], {
      timeout: 5000,
    });
    logger.info(`Claude CLI detected: ${stdout.trim()}`);
  } catch {
    logger.warn(`CLI_NOT_FOUND: '${claudePath}' not found on PATH.`);
  }
}
```

### Lock Acquire Pattern (from peer-registry.ts)
```typescript
// Source: src/services/peer-registry.ts line 87-94
async function acquireLock(): Promise<void> {
  // Atomic create-if-not-exists
  await fs.writeFile(lockPath, String(process.pid), {
    flag: "wx", // O_WRONLY | O_CREAT | O_EXCL
  });
}
```

### State Backward-Compatibility Pattern
```typescript
// For migrating existing PeerInfo records without lastSeenAt
function ensureLastSeen(peer: PeerInfo): PeerInfo {
  if (!peer.lastSeenAt) {
    return { ...peer, lastSeenAt: peer.registeredAt };
  }
  return peer;
}
```

### Expected Tool Response Shapes

**Healthy response:**
```json
{
  "healthy": true,
  "checks": {
    "stateFile": { "ok": true, "message": "State file readable and valid: /Users/x/cloud_code_bridge/cc-bridge-state.json" },
    "lockMechanism": { "ok": true, "message": "Lock acquire/release cycle succeeded" },
    "claudeCli": { "ok": true, "message": "Claude CLI found", "version": "1.0.39" }
  },
  "timestamp": "2026-02-09T12:00:00.000Z"
}
```

**Unhealthy response (CLI missing):**
```json
{
  "healthy": false,
  "checks": {
    "stateFile": { "ok": true, "message": "State file readable and valid" },
    "lockMechanism": { "ok": true, "message": "Lock acquire/release cycle succeeded" },
    "claudeCli": { "ok": false, "message": "Claude CLI not found at 'claude'" }
  },
  "timestamp": "2026-02-09T12:00:00.000Z"
}
```

**List peers with stale detection:**
```json
{
  "peers": [
    {
      "peerId": "backend",
      "sessionId": "sess-1",
      "cwd": "/tmp/backend",
      "label": "CC_Backend",
      "registeredAt": "2026-02-09T10:00:00.000Z",
      "lastSeenAt": "2026-02-09T11:30:00.000Z",
      "potentiallyStale": false
    },
    {
      "peerId": "frontend",
      "sessionId": "sess-2",
      "cwd": "/tmp/frontend",
      "label": "CC_Frontend",
      "registeredAt": "2026-02-09T08:00:00.000Z",
      "lastSeenAt": "2026-02-09T08:05:00.000Z",
      "potentiallyStale": true
    }
  ],
  "count": 2
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No health diagnostics | Dedicated `cc_health_check` tool | This phase | Users can self-diagnose bridge issues |
| No stale peer detection | TTL-based `potentiallyStale` flag | This phase | Users see which peers may need re-registration |
| `registeredAt` only | `lastSeenAt` tracks latest interaction | This phase | Enables TTL staleness computation |

**Why not session-file-based validation:**
Claude Code stores sessions as JSONL files in `~/.claude/projects/<encoded-dir>/`. While this path structure has been documented by community members, it is an internal implementation detail of Claude Code, not a public API. The file format and directory structure could change in any release. The TTL approach is robust because it depends only on bridge-internal state.

## Open Questions

1. **Should `cc_health_check` report the bridge server version?**
   - What we know: `SERVER_VERSION` is already in `constants.ts` ("1.0.0")
   - What's unclear: Whether this is useful diagnostic info
   - Recommendation: Include it -- it is free and aids debugging. Add `serverVersion` to the health check response.

2. **Should `lastSeenAt` be updated when a peer receives a message (not just sends)?**
   - What we know: A peer being a message target confirms its session ID was used recently
   - What's unclear: Whether receiving confirms the peer is "alive" (the CLI could fail)
   - Recommendation: Update `lastSeenAt` for both sender and successful-delivery target. Only update the target on success (if `execClaude` returned exit code 0), since a failed delivery doesn't confirm the peer is reachable.

3. **What should the default stale timeout be?**
   - What we know: Claude Code sessions last 5 hours per the official docs. Users may be idle for long periods between interactions.
   - What's unclear: Typical bridge usage patterns
   - Recommendation: Default 30 minutes (1,800,000 ms). This is long enough to avoid false positives during normal thinking pauses, but short enough to catch truly abandoned sessions. Configurable via `CC_BRIDGE_STALE_TIMEOUT_MS`.

4. **Should health check report the state file path and config values?**
   - What we know: When diagnosing issues, knowing which directory the bridge is using is essential
   - What's unclear: Security implications of exposing paths
   - Recommendation: Include `statePath` and `claudePath` in the response. This is a local-only tool (stdio transport), and the paths are needed for diagnosis.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/startup.ts`, `src/services/peer-registry.ts`, `src/services/cc-cli.ts` -- existing check patterns
- Codebase analysis: `src/tools/list-peers.ts`, `src/tools/register-peer.ts` -- tool registration pattern
- Codebase analysis: `src/test-helpers.ts`, `src/tools/list-peers.test.ts` -- test infrastructure pattern
- [Node.js v25.6.0 fs docs](https://nodejs.org/api/fs.html) -- `fs.access`, `fs.constants.R_OK | W_OK`
- [Node.js v25.6.0 process docs](https://nodejs.org/api/process.html) -- `process.kill(pid, 0)` for liveness
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference) -- `--version`, `--resume` flags

### Secondary (MEDIUM confidence)
- [Claude Code session management](https://stevekinney.com/courses/ai-development/claude-code-session-management) -- session storage in `~/.claude/projects/`
- [abdus.dev: Checking executable in PATH](https://abdus.dev/posts/checking-executable-exists-in-path-using-node/) -- native PATH lookup pattern

### Tertiary (LOW confidence)
- None. All findings verified against codebase or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all patterns from existing codebase
- Architecture: HIGH - Follows established service-layer + tool-handler pattern verbatim
- Pitfalls: HIGH - Based on concrete analysis of existing locking/file patterns and known Claude Code session behavior
- Stale detection approach: HIGH - TTL is the only viable approach given Claude Code's architecture (sessions are file-based, not process-based)

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain -- file I/O, process checking, MCP tool patterns)
