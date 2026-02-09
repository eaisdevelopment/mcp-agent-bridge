# Phase 1: Configuration and Error Hardening - Research

**Researched:** 2026-02-09
**Domain:** Node.js TypeScript configuration validation, structured logging, MCP error handling
**Confidence:** HIGH

## Summary

This phase transforms a working prototype MCP server into a production-hardened system with centralized configuration, structured logging, and bulletproof error handling. The existing codebase has 7 source files with hardcoded constants in `constants.ts`, a file-lock implementation in `peer-registry.ts`, CLI subprocess execution in `cc-cli.ts`, and 5 tool handlers -- none of which have try/catch guards or configurable behavior beyond compile-time constants.

The core work is: (1) a Zod-validated config module that reads env vars with coercion and defaults, (2) a dual-output logger (human-readable to file, JSON to file, level-filtered to stderr), (3) error recovery paths for corrupt state, lock timeouts, CLI failures, and missing binaries, (4) a first-run interactive setup that runs BEFORE the MCP stdio transport starts, and (5) global handlers for unhandled rejections and uncaught exceptions. The existing lock implementation is solid but needs error recovery wrapping; the existing CLI execution needs timeout/error enrichment.

**Primary recommendation:** Build config.ts with Zod `z.coerce` for env var parsing, a lightweight custom logger (no external dependency -- the dual-format file + stderr requirement is straightforward with Node.js fs), and wrap all existing service/tool code with structured error handling using both `McpError` (for protocol-level) and `isError` tool responses (for application-level).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- State directory default is OS-dependent: use the user's home directory with a `cloud_code_bridge` subfolder (e.g. ~/cloud_code_bridge on macOS/Linux, %USERPROFILE%\cloud_code_bridge on Windows)
- User can override the state directory via env var or on first run (interactive prompt -- see Startup section)
- Per-message character limit: **no limit by default**, but configurable via env var (CC_BRIDGE_CHAR_LIMIT or similar)
- Errors include both a machine-readable error code AND a descriptive message (e.g. `CLI_NOT_FOUND: claude not found on PATH. Install Claude Code or set CC_BRIDGE_CLAUDE_PATH`)
- Corrupted state file triggers auto-recovery: back up the corrupt file, create fresh state, log a warning, continue operating
- Error messages include actionable fix suggestions when possible
- Timeout errors include the timeout value used (e.g. "CLI timed out after 30000ms. Increase CC_BRIDGE_TIMEOUT_MS if needed")
- Dual logging: human-readable text to one file, structured JSON to another file
- Log files stored in the state directory (e.g. ~/cloud_code_bridge/logs/)
- State directory is auto-created (with parents) if it doesn't exist
- Write access is validated at startup (test file creation) -- fail early with clear message if not writable
- First run includes an interactive prompt asking the user where to store data (with OS-appropriate default offered)

### Claude's Discretion
- Config prefix style (flat vs namespaced)
- Whether to support config file alongside env vars
- Default log level
- Stderr behavior relative to log level
- Missing CLI startup behavior (warn vs refuse)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

## Discretion Recommendations

These are research-backed recommendations for the areas left to Claude's discretion.

### Config prefix style: Use flat CC_BRIDGE_* prefix
**Recommendation:** Flat `CC_BRIDGE_` prefix for all env vars.
**Rationale:** The project has ~5 configurable values. Namespaced sub-groups (CC_BRIDGE_LOG_LEVEL vs CC_BRIDGE__LOG__LEVEL) add complexity with no benefit at this scale. Flat prefixes are the standard pattern for small MCP servers and CLI tools. Every env var is already scoped by the CC_BRIDGE_ prefix.

### Config file alongside env vars: No -- env vars only
**Recommendation:** Do NOT support a config file for v1.
**Rationale:** MCP servers are typically configured via the host application's MCP config (e.g., `.mcp.json` `env` block). Adding config file support means defining precedence rules (file vs env vs defaults), a file format choice, a file-watcher or reload strategy, and more surface area for bugs. Env vars + the first-run interactive prompt cover all use cases. A config file can be added in a future version if needed.

### Default log level: INFO
**Recommendation:** Default to `info`.
**Rationale:** Standard convention for production services. `debug` is too noisy for default operation; `warn` would hide useful operational information. The user decision already requires `CC_BRIDGE_LOG_LEVEL` to support debug/info/warn/error.

### Stderr behavior: Follow log level
**Recommendation:** Stderr output follows the configured log level.
**Rationale:** MCP stdio transport requires stdout to be clean (JSON-RPC only). Stderr is the only runtime diagnostic channel. Making stderr always-minimal would force users to dig through log files for basic troubleshooting. Following the log level means `--log-level=debug` gives verbose stderr AND verbose log files, while `--log-level=error` keeps both quiet. This is the principle of least surprise. The startup banner (server name + version) should always print to stderr regardless of log level.

### Missing CLI startup behavior: Warn and continue
**Recommendation:** Warn on stderr, do NOT refuse to start.
**Rationale:** The server has 5 tools. Only `cc_send_message` actually invokes the `claude` CLI. The other 4 tools (register, deregister, list, history) work purely with state files. Refusing to start because `claude` is missing would prevent users from testing registration and state management. The `cc_send_message` tool should return a clear error at call time if `claude` is not found. This matches the success criteria: "Starting the server without `claude` on PATH produces a clear startup warning on stderr."

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.76 | Config validation + env var coercion | Already a dependency; `z.coerce` handles string-to-number for env vars. Used by MCP SDK internally. |
| @modelcontextprotocol/sdk | 1.26.0 | MCP server framework | Already the project's foundation. Provides McpError, ErrorCode, McpServer. |
| typescript | 5.9.3 | Type safety | Already configured with strict mode. |

### Supporting (no new dependencies needed)
| Module | Source | Purpose | Why No External Dep |
|--------|--------|---------|---------------------|
| node:fs/promises | Node.js built-in | File I/O for state, logs, lock | Already used in peer-registry.ts |
| node:os | Node.js built-in | `os.homedir()` for default state path | Cross-platform home directory detection |
| node:path | Node.js built-in | Path joining | Already used |
| node:child_process | Node.js built-in | `execFile` for CLI | Already used in cc-cli.ts |
| node:readline | Node.js built-in | Interactive first-run prompt | For pre-MCP setup phase only |

### Why No External Logger
The user decision requires dual logging: human-readable text to one file, structured JSON to another, with level-filtered output to stderr. Pino or Winston could do this, but:
1. The project currently has exactly 2 runtime dependencies (MCP SDK + Zod). Adding a logger triples the dependency count.
2. The logging requirement is straightforward: 4 levels (debug/info/warn/error), 3 destinations (stderr, text file, JSON file), timestamp + level + message formatting.
3. A custom logger in ~60-80 lines of TypeScript is simpler to maintain and has zero supply chain risk.
4. Pino's multi-transport would require `pino-pretty` for human-readable and additional configuration for dual file output -- more complexity than a direct implementation.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom logger | pino 9.x | Pino is faster but adds dependency; overkill for ~100 log lines/hour on a local MCP server |
| Custom logger | winston 3.x | Winston has flexible transports but heavier; not needed at this scale |
| Custom file lock | proper-lockfile | Battle-tested but adds dependency; existing lock implementation is correct and handles stale locks |
| Zod for config | envalid | envalid is purpose-built for env vars but Zod is already installed |

**Installation:**
```bash
# No new packages needed -- all requirements met by existing dependencies + Node.js builtins
```

## Architecture Patterns

### Recommended Project Structure (after Phase 1)
```
src/
  config.ts           # NEW: Zod schema, env var parsing, typed config export
  logger.ts           # NEW: Dual-output logger (stderr + text file + JSON file)
  errors.ts           # NEW: Error codes enum, BridgeError class, error formatting
  startup.ts          # NEW: First-run detection, interactive setup, validation
  constants.ts        # MODIFIED: Remove hardcoded values, re-export from config
  index.ts            # MODIFIED: Add startup validation, global error handlers
  types.ts            # UNCHANGED
  services/
    peer-registry.ts  # MODIFIED: Use config for paths, add error recovery
    cc-cli.ts         # MODIFIED: Use config for timeout/limit, enrich errors
  tools/
    *.ts              # MODIFIED: Add try/catch guards, structured error responses
```

### Pattern 1: Centralized Config with Zod Coercion
**What:** A single `config.ts` module that parses `process.env` through a Zod schema with coercion, defaults, and validation, then exports a frozen typed object.
**When to use:** At module load time. Every other module imports `config` rather than reading `process.env` directly.
**Example:**
```typescript
// Source: Zod docs + verified with installed zod@3.25.76
import { z } from "zod";
import os from "node:os";
import path from "node:path";

const defaultStatePath = path.join(os.homedir(), "cloud_code_bridge");

const configSchema = z.object({
  CC_BRIDGE_STATE_PATH: z.string().default(defaultStatePath),
  CC_BRIDGE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120_000),
  CC_BRIDGE_CHAR_LIMIT: z.coerce.number().int().min(0).default(0), // 0 = no limit
  CC_BRIDGE_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CC_BRIDGE_CLAUDE_PATH: z.string().default("claude"),
});

type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  if (_config) return _config;
  const result = configSchema.safeParse(env);
  if (!result.success) {
    // Format Zod errors into actionable messages
    const issues = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    ).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  _config = Object.freeze(result.data);
  return _config;
}

export function getConfig(): Config {
  if (!_config) throw new Error("Config not loaded. Call loadConfig() first.");
  return _config;
}

// For testing: reset config singleton
export function resetConfig(): void {
  _config = null;
}
```

### Pattern 2: Machine-Readable Error Codes with Descriptive Messages
**What:** An enum of error codes paired with a BridgeError class that includes both the code and an actionable message.
**When to use:** Every error path in the application.
**Example:**
```typescript
// Source: User decision on error format
export enum BridgeErrorCode {
  CLI_NOT_FOUND = "CLI_NOT_FOUND",
  CLI_TIMEOUT = "CLI_TIMEOUT",
  CLI_EXEC_FAILED = "CLI_EXEC_FAILED",
  STATE_CORRUPT = "STATE_CORRUPT",
  STATE_WRITE_FAILED = "STATE_WRITE_FAILED",
  LOCK_TIMEOUT = "LOCK_TIMEOUT",
  PEER_NOT_FOUND = "PEER_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  STARTUP_FAILED = "STARTUP_FAILED",
}

export class BridgeError extends Error {
  constructor(
    public readonly code: BridgeErrorCode,
    message: string,
    public readonly suggestion?: string
  ) {
    super(`${code}: ${message}${suggestion ? `. ${suggestion}` : ""}`);
    this.name = "BridgeError";
  }
}

// Usage:
throw new BridgeError(
  BridgeErrorCode.CLI_TIMEOUT,
  `CLI timed out after ${timeoutMs}ms`,
  `Increase CC_BRIDGE_TIMEOUT_MS if needed`
);
```

### Pattern 3: Tool Handler Error Wrapper
**What:** A utility function that wraps tool handler logic in try/catch and returns structured MCP error responses.
**When to use:** Every tool handler registration.
**Example:**
```typescript
// Source: MCP SDK types.d.ts (verified in installed SDK 1.26.0)
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

function toolResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

function errorResult(error: unknown) {
  if (error instanceof BridgeError) {
    return toolResult(
      JSON.stringify({ success: false, error: error.code, message: error.message }, null, 2),
      true
    );
  }
  const msg = error instanceof Error ? error.message : String(error);
  return toolResult(
    JSON.stringify({ success: false, error: "INTERNAL_ERROR", message: msg }, null, 2),
    true
  );
}
```

### Pattern 4: Corrupt State Auto-Recovery
**What:** When JSON.parse fails on the state file, back up the corrupt file, create fresh state, log a warning.
**When to use:** In `readState()` within peer-registry.ts.
**Example:**
```typescript
// Source: User decision on corrupt state recovery
async function readState(): Promise<BridgeState> {
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    return JSON.parse(raw) as BridgeState;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyState();
    }
    if (err instanceof SyntaxError) {
      // Corrupt JSON -- auto-recover
      const backupPath = statePath + ".corrupt." + Date.now();
      await fs.copyFile(statePath, backupPath).catch(() => {});
      logger.warn(
        `State file corrupt, backed up to ${backupPath}. Starting with empty state.`
      );
      return emptyState();
    }
    throw err;
  }
}
```

### Pattern 5: First-Run Interactive Setup (Pre-MCP)
**What:** Detect first run, prompt user for state directory BEFORE starting MCP transport, save choice.
**When to use:** In startup.ts, called from index.ts before `server.connect(transport)`.

**CRITICAL CONSTRAINT:** The MCP stdio transport uses stdin/stdout for JSON-RPC. The interactive prompt MUST complete and stdin/stdout MUST be released BEFORE `server.connect(transport)` is called. The prompt uses stderr for output (question text) and stdin for input. After the prompt completes, stdin is handed to the MCP transport.

Alternatively, check `process.stdin.isTTY` -- when launched by an MCP host (Claude Desktop, etc.), stdin is NOT a TTY (it's piped). The interactive prompt should ONLY run when stdin IS a TTY (manual CLI invocation). When stdin is not a TTY, use defaults silently.

```typescript
// Source: Node.js TTY docs + MCP stdio transport behavior
import readline from "node:readline";

async function firstRunSetup(defaultPath: string): Promise<string> {
  // Only prompt interactively if running in a terminal
  if (!process.stdin.isTTY) {
    return defaultPath;
  }

  // Use stderr for prompt output to keep stdout clean
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(
      `\nFirst run detected. Where should cc-bridge store its data?\n` +
      `  Default: ${defaultPath}\n` +
      `  Press Enter to accept, or type a custom path: `,
      (answer) => {
        rl.close();
        resolve(answer.trim() || defaultPath);
      }
    );
  });
}
```

### Anti-Patterns to Avoid
- **Writing to stdout for logging:** Corrupts MCP JSON-RPC transport. ALL diagnostic output goes to stderr and/or log files. The existing `console.error` usage in index.ts is correct.
- **Throwing unhandled errors in tool handlers:** Crashes the MCP connection. Every tool handler MUST have a top-level try/catch that returns an isError response.
- **Reading process.env directly in service modules:** Spreads configuration across the codebase. All modules should import from config.ts.
- **Synchronous file I/O in tool handlers:** Blocks the event loop. All file operations must be async (already the case in the prototype).
- **Interactive prompts after MCP transport starts:** Fights with stdio transport for stdin/stdout control. The prompt MUST happen before `server.connect()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var validation | Custom string parsing and type checking | Zod `z.coerce` + `.safeParse(process.env)` | Zod already installed; handles coercion, defaults, enums, error formatting |
| Cross-platform home dir | `process.env.HOME \|\| process.env.USERPROFILE` | `os.homedir()` from `node:os` | Built-in, handles edge cases on all platforms |
| Atomic file writes | Direct `fs.writeFile` | Write-to-temp-then-rename pattern (already in prototype) | Prevents partial writes on crash; already implemented correctly |
| File locking | New lock library | Keep existing `O_CREAT \| O_EXCL` implementation | Already handles stale lock detection; adding proper-lockfile would be a new dep for no gain |
| MCP error responses | Custom JSON-RPC error formatting | `McpError` from `@modelcontextprotocol/sdk/types.js` | SDK-native; ensures protocol compliance |

**Key insight:** The prototype already has correct implementations for file locking, atomic writes, and MCP tool registration. This phase wraps them with configuration and error handling, not replaces them.

## Common Pitfalls

### Pitfall 1: stdout Pollution Kills MCP Transport
**What goes wrong:** Any `console.log()`, debug output, or library that writes to stdout breaks the JSON-RPC message framing.
**Why it happens:** Developers use console.log for debugging; some libraries default to stdout.
**How to avoid:** Use `console.error()` or the custom logger (which targets stderr + files). Grep for `console.log` in CI. Never pass `process.stdout` to the logger.
**Warning signs:** MCP client reports parse errors; tool calls time out.

### Pitfall 2: Unhandled Promise Rejection Crashes Server
**What goes wrong:** An async operation rejects without a catch, Node.js terminates the process.
**Why it happens:** Missing try/catch in tool handlers, or fire-and-forget promises (e.g., `recordMessage()` in send-message.ts catch block could itself throw).
**How to avoid:** Add `process.on('unhandledRejection', ...)` as a safety net. Ensure every tool handler has a top-level try/catch. Ensure secondary async ops (like recording a failed message) have their own error handling.
**Warning signs:** Server process exits unexpectedly during operation.

### Pitfall 3: Zod Coerce with Empty Strings
**What goes wrong:** `z.coerce.number()` on `""` (empty string set in env) produces `0`, not a validation error.
**Why it happens:** JavaScript `Number("")` === 0. Environment variables are strings, and unsetting a var might leave it as `""`.
**How to avoid:** Use `.pipe()` or `.refine()` to reject 0 when 0 is not a valid value. For the timeout, `.min(1000)` already protects against this. For char limit, 0 means "no limit" (user decision), so this is actually correct behavior.
**Warning signs:** Timeout of 0ms causing immediate failures.

### Pitfall 4: State File Race Between Multiple Processes
**What goes wrong:** Two MCP server instances (one per Claude Code session) read-modify-write the state file simultaneously, causing data loss.
**Why it happens:** The prototype's lock mechanism uses `O_CREAT | O_EXCL` which is correct, but the lock error message is generic ("Failed to acquire lock within timeout").
**How to avoid:** Keep the existing lock mechanism (it is correct). Enhance the error message to include the PID holding the lock and the timeout used. Add the `LOCK_TIMEOUT` error code.
**Warning signs:** Missing peer registrations; "lock timeout" errors.

### Pitfall 5: First-Run Prompt in Non-TTY Context
**What goes wrong:** The interactive prompt blocks forever when stdin is piped (MCP host launches the server).
**Why it happens:** `readline.question()` waits for input on stdin, but the MCP host sends JSON-RPC messages, not user input.
**How to avoid:** Check `process.stdin.isTTY` before prompting. If not a TTY, use defaults silently. If a TTY, prompt BEFORE connecting the MCP transport, then close the readline interface.
**Warning signs:** Server hangs on startup when launched by Claude Desktop.

### Pitfall 6: CONF-02 vs User Decision Conflict on State Path Default
**What goes wrong:** REQUIREMENTS.md says CONF-02 defaults to `os.tmpdir()` join, but the user decision says `~/cloud_code_bridge`.
**Why it happens:** Requirements were written before the context discussion.
**How to avoid:** User decisions take precedence over requirements. Default to `path.join(os.homedir(), "cloud_code_bridge")`. The env var `CC_BRIDGE_STATE_PATH` allows overriding to any path including tmpdir.
**Warning signs:** State persists unexpectedly between reboots (or doesn't, depending on which default is used).

### Pitfall 7: Character Limit Default Mismatch
**What goes wrong:** REQUIREMENTS.md CONF-04 says default 25000, but user decision says "no limit by default."
**Why it happens:** Requirements were written before the context discussion.
**How to avoid:** User decisions take precedence. Default to 0 (meaning no limit). A value of 0 in the config means "do not truncate." Any positive value means "truncate at N characters."
**Warning signs:** Messages silently truncated when user expects no limit.

## Code Examples

Verified patterns from official sources and the installed SDK:

### McpError Import and Usage
```typescript
// Source: Verified in installed @modelcontextprotocol/sdk@1.26.0 types.d.ts
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Available ErrorCode values (from types.d.ts line 258-267):
// ErrorCode.ConnectionClosed = -32000
// ErrorCode.RequestTimeout   = -32001
// ErrorCode.ParseError       = -32700
// ErrorCode.InvalidRequest   = -32600
// ErrorCode.MethodNotFound   = -32601
// ErrorCode.InvalidParams    = -32602
// ErrorCode.InternalError    = -32603

// Throw for protocol-level errors (invalid params, etc.)
throw new McpError(ErrorCode.InvalidParams, "peerId is required");

// For application-level errors, return isError in tool response instead:
return {
  content: [{ type: "text", text: JSON.stringify({ success: false, error: "PEER_NOT_FOUND", message: "..." }) }],
  isError: true,
};
```

### Zod Env Var Schema with Coercion
```typescript
// Source: Zod docs + verified with installed zod@3.25.76
import { z } from "zod";

// z.coerce.number() handles string -> number conversion from process.env
// z.enum() validates against allowed values
// .default() provides fallback when env var is undefined
const schema = z.object({
  CC_BRIDGE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120_000),
  CC_BRIDGE_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CC_BRIDGE_CHAR_LIMIT: z.coerce.number().int().min(0).default(0),
  CC_BRIDGE_STATE_PATH: z.string().min(1).default("/default/path"),
  CC_BRIDGE_CLAUDE_PATH: z.string().min(1).default("claude"),
});

// .safeParse() returns { success: boolean, data?, error? } -- does NOT throw
const result = schema.safeParse(process.env);
```

### Custom Dual-Output Logger
```typescript
// Source: Node.js fs docs, custom implementation pattern
import fs from "node:fs";
import path from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

class Logger {
  private level: number;
  private textStream: fs.WriteStream | null = null;
  private jsonStream: fs.WriteStream | null = null;

  constructor(level: LogLevel, logDir?: string) {
    this.level = LEVELS[level];
    if (logDir) {
      fs.mkdirSync(logDir, { recursive: true });
      this.textStream = fs.createWriteStream(path.join(logDir, "bridge.log"), { flags: "a" });
      this.jsonStream = fs.createWriteStream(path.join(logDir, "bridge.json.log"), { flags: "a" });
    }
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVELS[level] < this.level) return;

    const timestamp = new Date().toISOString();
    const entry: LogEntry = { timestamp, level, message, ...(data !== undefined ? { data } : {}) };

    // Stderr: human-readable
    process.stderr.write(`${timestamp} [${level.toUpperCase()}] ${message}\n`);

    // Text file: human-readable
    this.textStream?.write(`${timestamp} [${level.toUpperCase()}] ${message}\n`);

    // JSON file: structured
    this.jsonStream?.write(JSON.stringify(entry) + "\n");
  }

  debug(message: string, data?: unknown): void { this.log("debug", message, data); }
  info(message: string, data?: unknown): void { this.log("info", message, data); }
  warn(message: string, data?: unknown): void { this.log("warn", message, data); }
  error(message: string, data?: unknown): void { this.log("error", message, data); }

  close(): void {
    this.textStream?.end();
    this.jsonStream?.end();
  }
}
```

### Global Error Handlers
```typescript
// Source: Node.js process docs
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
  // Do NOT exit -- MCP server should try to continue
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error(`Unhandled rejection: ${message}`);
  // Do NOT exit -- MCP server should try to continue
});
```

### Startup Validation
```typescript
// Source: Node.js child_process docs, fs docs
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function validateStartup(config: Config): Promise<void> {
  // 1. Ensure state directory exists
  await fs.mkdir(config.CC_BRIDGE_STATE_PATH, { recursive: true });

  // 2. Validate write access
  const testFile = path.join(config.CC_BRIDGE_STATE_PATH, ".write-test");
  try {
    await fs.writeFile(testFile, "test", "utf-8");
    await fs.unlink(testFile);
  } catch {
    throw new BridgeError(
      BridgeErrorCode.STARTUP_FAILED,
      `Cannot write to state directory: ${config.CC_BRIDGE_STATE_PATH}`,
      "Check permissions or set CC_BRIDGE_STATE_PATH to a writable directory"
    );
  }

  // 3. Check for claude CLI
  try {
    await execFileAsync(config.CC_BRIDGE_CLAUDE_PATH, ["--version"], { timeout: 5000 });
  } catch {
    logger.warn(
      `CLI_NOT_FOUND: '${config.CC_BRIDGE_CLAUDE_PATH}' not found on PATH. ` +
      `cc_send_message will fail until Claude Code is installed. ` +
      `Set CC_BRIDGE_CLAUDE_PATH if installed in a non-standard location.`
    );
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `server.tool()` | `server.registerTool()` | MCP SDK 1.x | Must use `registerTool` (already correct in prototype) |
| Manual JSON-RPC errors | `McpError` class | MCP SDK 1.x | Import from `@modelcontextprotocol/sdk/types.js` |
| `import { z } from "zod"` (Zod 3 classic) | Same import, v4 available via `zod/v4` | zod 3.25+ | MCP SDK 1.26.0 uses `zod/v4` internally but the classic `import { z } from "zod"` still works fine for application code. No need to migrate. |

**Deprecated/outdated:**
- `server.tool()`: The SDK reference shows `registerTool()` as the current API. The prototype already uses `registerTool()`.
- `os.tmpdir()` for state: The requirements doc specifies tmpdir but the user decision overrides to `os.homedir()` + `cloud_code_bridge`.

## Open Questions

1. **First-run config persistence**
   - What we know: The user wants an interactive prompt for first-run state directory selection.
   - What's unclear: Where to persist the user's choice. Options: (a) a small JSON file at a fixed location like `~/.cc-bridge-config.json`, (b) write it to the state directory itself (chicken-and-egg problem), (c) a dotfile in homedir.
   - Recommendation: Store a minimal config file at `~/.cc-bridge-config.json` containing just `{ "statePath": "/user/chosen/path" }`. This file is checked before env vars for the state path. The precedence is: env var > config file > OS default. This is the only "config file" the system needs and it solves the first-run persistence problem cleanly.

2. **Log file rotation**
   - What we know: Log files are stored in the state directory. The phase scope does not mention rotation.
   - What's unclear: Whether log files could grow unbounded over time.
   - Recommendation: Defer log rotation to a future phase. For now, start a new log file per server startup using a timestamp in the filename (e.g., `bridge-2026-02-09T12-00-00.log`). This naturally limits individual file size and makes cleanup straightforward.

3. **Graceful shutdown**
   - What we know: The server should not crash on errors.
   - What's unclear: Whether SIGTERM/SIGINT handling is in scope.
   - Recommendation: Add basic signal handlers that call `logger.close()` and `process.exit(0)`. This ensures log file streams are flushed. Keep it minimal -- full graceful shutdown (waiting for in-flight requests) is out of scope for Phase 1.

## Sources

### Primary (HIGH confidence)
- Installed `@modelcontextprotocol/sdk@1.26.0` `types.d.ts` -- verified McpError class, ErrorCode enum, all error code values
- Installed `zod@3.25.76` -- verified `z.coerce`, `.safeParse()`, `.enum()`, `.default()` APIs
- Node.js v25.6.0 official docs -- `os.homedir()`, `readline`, `fs/promises`, `process.stdin.isTTY`, `child_process.execFile`
- Existing prototype source code -- 7 files analyzed for current patterns and gaps

### Secondary (MEDIUM confidence)
- [MCP Error Handling Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) -- Three-level error model, isError flag usage
- [Anthropic MCP Builder Reference](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server.md) -- Tool registration patterns, project structure
- [Zod Env Validation Patterns](https://www.creatures.sh/blog/env-type-safety-and-validation/) -- z.coerce.number() for env vars
- [Pino vs Winston comparison](https://betterstack.com/community/guides/scaling-nodejs/pino-vs-winston/) -- Informed decision to use custom logger

### Tertiary (LOW confidence)
- None -- all findings verified against installed packages or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are already installed and verified; no new dependencies
- Architecture: HIGH -- patterns verified against installed SDK types and existing codebase
- Pitfalls: HIGH -- stdout/stdin conflict verified against MCP transport spec; Zod coercion edge cases verified against Zod source; state path conflict identified from requirements vs user decision comparison
- First-run setup: MEDIUM -- the TTY detection approach is sound but the config persistence location (open question 1) needs a final decision during planning

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain -- Node.js builtins and installed package versions won't change)
