# Phase 2: Test Suite - Research

**Researched:** 2026-02-09
**Domain:** Vitest testing for TypeScript MCP server with file-based state and CLI subprocess mocking
**Confidence:** HIGH

## Summary

This phase adds a complete test suite to the cc-bridge-mcp-server project. The codebase has 5 tool handlers, 2 service modules (peer-registry with file-based state/locking, cc-cli with subprocess execution), and supporting infrastructure (config, errors, logger). No tests exist currently. The project uses ESM (`"type": "module"`) with TypeScript `module: "Node16"` and `.js` import extensions throughout the source.

Vitest 4.x is the current standard test runner for ESM TypeScript projects. It handles the `.js`-extension TypeScript imports via Vite's resolver without needing to compile first. The MCP SDK ships an `InMemoryTransport` class specifically designed for testing -- it creates linked transport pairs so a `Client` and `McpServer` can communicate in-process without stdio. For the CLI service, `vi.mock("node:child_process")` intercepts `execFile` calls. For file-based state tests, real filesystem operations against isolated temp directories are preferred over mocking `node:fs/promises`, since the peer-registry's value is its file-based atomicity guarantees (lock files, atomic rename).

**Primary recommendation:** Use Vitest 4.x with `@vitest/coverage-v8`, test tool handlers via InMemoryTransport `Client.callTool()`, test services directly with isolated temp dirs via `resetConfig()`, and mock only `node:child_process` for CLI tests.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | ^4.0.0 | Test runner, assertion library, mocking | ESM-native, built-in TypeScript support, fastest Node.js test runner |
| @vitest/coverage-v8 | ^4.0.0 | Code coverage via V8 engine | Native V8 coverage, no instrumentation overhead, accurate since v3.2.0 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @modelcontextprotocol/sdk (Client) | ^1.6.1 (already installed) | MCP client for integration tests | Integration tests calling tools via InMemoryTransport |
| @modelcontextprotocol/sdk (InMemoryTransport) | ^1.6.1 (already installed) | In-process transport pair | Connecting Client and McpServer without stdio |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest | Jest has weaker ESM support, slower for ESM projects |
| @vitest/coverage-v8 | @vitest/coverage-istanbul | Istanbul requires instrumentation step; v8 is faster and native |
| Real fs for state tests | memfs (in-memory fs) | memfs can't test atomic rename, lock files, or real fs edge cases that matter for this codebase |

**Installation:**
```bash
npm install -D vitest @vitest/coverage-v8
```

No additional test dependencies needed -- the MCP SDK Client and InMemoryTransport are already available from the existing `@modelcontextprotocol/sdk` dependency.

## Architecture Patterns

### Recommended Test File Structure
```
src/
├── services/
│   ├── peer-registry.ts
│   ├── peer-registry.test.ts     # TEST-02, TEST-05: state ops, locking, isolated temp dirs
│   ├── cc-cli.ts
│   └── cc-cli.test.ts            # TEST-03: mocked execFile for success/timeout/error
├── tools/
│   ├── register-peer.ts
│   ├── register-peer.test.ts     # TEST-01: tool handler unit test
│   ├── deregister-peer.ts
│   ├── deregister-peer.test.ts   # TEST-01: tool handler unit test
│   ├── send-message.ts
│   ├── send-message.test.ts      # TEST-01: tool handler unit test
│   ├── list-peers.ts
│   ├── list-peers.test.ts        # TEST-01: tool handler unit test
│   ├── get-history.ts
│   └── get-history.test.ts       # TEST-01: tool handler unit test
├── integration.test.ts            # TEST-04: full workflow via InMemoryTransport
├── config.ts
├── config.test.ts                 # Config loading, validation, reset
├── errors.ts
└── errors.test.ts                 # Error formatting helpers
vitest.config.ts                   # Root config
```

Co-located test files (`.test.ts` next to source) is the standard Vitest pattern and matches the existing flat file structure in `src/`.

### Pattern 1: Vitest Configuration for Node16 ESM TypeScript
**What:** Configure Vitest to resolve `.js` extension imports in TypeScript source files
**When to use:** Always -- this project uses `module: "Node16"` with `.js` extensions in all imports
**Example:**
```typescript
// vitest.config.ts
// Source: https://techresolve.blog/2025/12/11/how-to-not-require-js-extension-when-writing-vi/
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".js", ".json"],
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json", "html"],
    },
  },
});
```

### Pattern 2: Test Isolation via resetConfig() + Temp Directories
**What:** Each test creates its own temp directory and loads config pointing to it, preventing cross-test pollution
**When to use:** Any test touching the filesystem (peer-registry, integration tests)
**Example:**
```typescript
// Source: Phase 1 config.ts provides resetConfig() and loadConfig(env)
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach } from "vitest";
import { resetConfig, loadConfig } from "./config.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cc-bridge-test-"));
  resetConfig();
  loadConfig({
    CC_BRIDGE_STATE_PATH: tempDir,
    CC_BRIDGE_TIMEOUT_MS: "5000",
    CC_BRIDGE_CHAR_LIMIT: "0",
    CC_BRIDGE_LOG_LEVEL: "error",
    CC_BRIDGE_CLAUDE_PATH: "claude",
  });
});

afterEach(async () => {
  resetConfig();
  await rm(tempDir, { recursive: true, force: true });
});
```

### Pattern 3: Integration Test via InMemoryTransport
**What:** Create McpServer, register tools, connect Client via InMemoryTransport, call tools through MCP protocol
**When to use:** TEST-04 integration test, and optionally tool handler tests
**Example:**
```typescript
// Source: @modelcontextprotocol/sdk InMemoryTransport + Client APIs
// Verified from SDK source in node_modules
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create server and register tools
const server = new McpServer({ name: "test-server", version: "1.0.0" });
registerRegisterPeerTool(server);
// ... register other tools

// Create linked transport pair
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

// Connect both sides (must await both)
const client = new Client({ name: "test-client", version: "1.0.0" });
await Promise.all([
  server.connect(serverTransport),
  client.connect(clientTransport),
]);

// Call tools through the MCP protocol
const result = await client.callTool({
  name: "cc_register_peer",
  arguments: {
    peerId: "backend",
    sessionId: "sess-123",
    cwd: "/tmp/test",
    label: "Backend",
  },
});

// Result has { content: [...], isError?: boolean }
// Content items have { type: "text", text: string }
const parsed = JSON.parse(result.content[0].text);
expect(parsed.success).toBe(true);

// Cleanup
await client.close();
await server.close();
```

### Pattern 4: Mocking node:child_process for CLI Tests
**What:** Use `vi.mock("node:child_process")` to intercept execFile calls without spawning real processes
**When to use:** TEST-03 cc-cli service tests
**Example:**
```typescript
// Source: https://vitest.dev/guide/mocking/modules + verified gist pattern
import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";

// Mock must be hoisted -- Vitest handles this automatically
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Import AFTER mock declaration (Vitest hoists mock anyway, but this is clearer)
import { execClaude } from "./cc-cli.js";

// Cast for type safety on mock methods
const mockExecFile = vi.mocked(execFile);

beforeEach(() => {
  vi.clearAllMocks();
});

it("returns stdout on success", async () => {
  // execFile callback signature: (error, stdout, stderr)
  mockExecFile.mockImplementation(
    (_cmd, _args, _opts, callback) => {
      callback!(null, "response text", "");
      return {} as any; // ChildProcess return value
    }
  );

  const result = await execClaude("sess-123", "hello", "/tmp");
  expect(result.stdout).toBe("response text");
  expect(result.exitCode).toBe(0);
});

it("detects timeout via killed + SIGTERM", async () => {
  mockExecFile.mockImplementation(
    (_cmd, _args, _opts, callback) => {
      const error = Object.assign(new Error("killed"), {
        killed: true,
        signal: "SIGTERM",
        code: null,
      });
      callback!(error as any, "", "");
      return {} as any;
    }
  );

  const result = await execClaude("sess-123", "hello", "/tmp");
  expect(result.stderr).toContain("CLI_TIMEOUT");
  expect(result.exitCode).toBeNull();
});
```

### Pattern 5: Tool Handler Unit Tests (Direct Function Call)
**What:** Call the tool registration function on a McpServer, then use InMemoryTransport to invoke the tool
**When to use:** TEST-01 for each of the 5 tool handlers
**Example:**
```typescript
// Each tool handler exports a function like registerRegisterPeerTool(server)
// Test by: create McpServer, register the single tool, connect Client, callTool
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("cc_register_peer", () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    // Set up isolated config (Pattern 2)
    // Create server with just this tool
    server = new McpServer({ name: "test", version: "1.0.0" });
    registerRegisterPeerTool(server);

    const [ct, st] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("registers a new peer and returns success", async () => {
    const result = await client.callTool({
      name: "cc_register_peer",
      arguments: { peerId: "be", sessionId: "s1", cwd: "/tmp", label: "BE" },
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.action).toBe("registered");
    expect(data.peer.peerId).toBe("be");
  });

  it("returns updated when re-registering", async () => {
    await client.callTool({
      name: "cc_register_peer",
      arguments: { peerId: "be", sessionId: "s1", cwd: "/tmp", label: "BE" },
    });
    const result = await client.callTool({
      name: "cc_register_peer",
      arguments: { peerId: "be", sessionId: "s2", cwd: "/tmp", label: "BE2" },
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.action).toBe("updated");
  });
});
```

### Anti-Patterns to Avoid
- **Mocking node:fs/promises for peer-registry tests:** The value of peer-registry is its file-based atomicity (lock files, atomic rename). Mocking fs eliminates the very behavior you want to verify. Use real filesystem with isolated temp directories instead.
- **Sharing temp directories between tests:** Creates race conditions and flaky tests. Each test (or describe block) gets its own `mkdtemp` directory.
- **Testing tool handlers by calling service functions directly:** Tool handlers add Zod validation, error wrapping, and MCP response formatting. Test through the MCP protocol (InMemoryTransport + Client) to verify the full stack.
- **Not resetting config between tests:** The config module uses a frozen singleton. Forgetting `resetConfig()` before `loadConfig()` will cause stale state across tests.
- **Using `--pool=forks` with child_process mocks:** Vitest's fork pool uses `node:child_process` internally, causing hangs when mocking that module. Use the default `--pool=threads` (or `--pool=vmThreads`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test isolation for file state | Custom temp dir management | `mkdtemp` + `resetConfig()` + `loadConfig(env)` | Phase 1 already built config isolation; just use it |
| MCP protocol compliance testing | Manual JSON-RPC message construction | `Client.callTool()` via InMemoryTransport | SDK Client handles initialization, protocol negotiation, schema validation |
| Coverage reporting | Custom coverage scripts | `@vitest/coverage-v8` with `reporter: ["text", "json", "html"]` | V8 native coverage, zero config |
| Mock function tracking | Custom spy implementations | `vi.fn()`, `vi.mocked()`, `vi.spyOn()` | Vitest built-ins with full TypeScript support |
| Test data factories | Inline object literals everywhere | Shared helper functions in test files | Reduces duplication, makes tests readable |

**Key insight:** Phase 1's `resetConfig()` + `loadConfig(env)` design was explicitly built for test isolation (decision [01-03]: "State/lock paths derived at call time, not module load, for test isolation via resetConfig()"). This is the linchpin -- use it, don't build around it.

## Common Pitfalls

### Pitfall 1: ESM Import Extensions in Test Files
**What goes wrong:** TypeScript source uses `.js` extensions in imports (e.g., `import { getConfig } from "./config.js"`). Without proper Vite resolver config, Vitest fails to resolve these to `.ts` files.
**Why it happens:** Vitest uses Vite's module resolution, which needs explicit extension mapping for Node16 module resolution.
**How to avoid:** Set `resolve.extensions: [".ts", ".js", ".json"]` in `vitest.config.ts`. This tells Vite to try `.ts` first when it sees a `.js` import.
**Warning signs:** `Error: Cannot find module './config.js'` in test output.

### Pitfall 2: Config Singleton Leaking Between Tests
**What goes wrong:** Tests pass individually but fail when run together because one test's config affects another.
**Why it happens:** `config.ts` uses a module-level `_config` singleton. If not reset, `getConfig()` returns the previous test's frozen config.
**How to avoid:** Always call `resetConfig()` in `beforeEach` before `loadConfig()`, and again in `afterEach` for safety.
**Warning signs:** Tests pass with `vitest run src/path/specific.test.ts` but fail with `vitest run`.

### Pitfall 3: Logger Writes to Stderr During Tests
**What goes wrong:** Test output is polluted with log messages, making failures hard to read.
**Why it happens:** The `logger` module-level export writes to `process.stderr` by default.
**How to avoid:** Use `CC_BRIDGE_LOG_LEVEL: "error"` in test config (suppresses debug/info/warn). Do not pass a `logDir` to avoid file creation. Alternatively, mock the logger module in tests that don't need to verify logging behavior.
**Warning signs:** Noisy test output with timestamp/level prefix lines.

### Pitfall 4: Forgetting to Await Both Sides of InMemoryTransport Connection
**What goes wrong:** `client.callTool()` hangs or throws "Not connected" error.
**Why it happens:** Both server and client must complete their `connect()` calls before messages can flow. The InMemoryTransport queues messages sent before `start()`, but the MCP initialization handshake requires both sides.
**How to avoid:** Always use `await Promise.all([server.connect(st), client.connect(ct)])`.
**Warning signs:** Tests hang indefinitely or get "Not connected" errors.

### Pitfall 5: child_process Mock Not Matching Callback Signature
**What goes wrong:** `execClaude` hangs because the mock's `execFile` never calls the callback.
**Why it happens:** `execFile` has multiple overload signatures. The cc-cli code uses the 4-argument form: `execFile(cmd, args, opts, callback)`. If the mock only handles 3 arguments, the callback is never invoked.
**How to avoid:** Mock implementation must accept 4 positional parameters and call the 4th as the callback: `mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => { ... })`.
**Warning signs:** Test timeout with no assertion error.

### Pitfall 6: Lock File Cleanup in Tests
**What goes wrong:** A test that crashes mid-operation leaves a `.lock` file in the temp directory, causing subsequent tests to wait for lock timeout.
**Why it happens:** `acquireLock()` creates a file; if the test process exits abnormally before `releaseLock()`, the lock persists.
**How to avoid:** Each test uses its own temp directory (mkdtemp), so lock files are isolated. The `afterEach` cleanup (`rm(tempDir, { recursive: true })`) removes everything. The stale lock detection in peer-registry also helps -- the PID in the lock file won't match any running process.
**Warning signs:** Tests timing out after 5000ms (LOCK_MAX_WAIT_MS).

### Pitfall 7: InMemoryTransport Client.callTool Response Shape
**What goes wrong:** Test tries to access `result.text` instead of `result.content[0].text`.
**Why it happens:** `callTool` returns `{ content: Array<{ type: "text", text: string }>, isError?: boolean }`, not a flat object.
**How to avoid:** Always destructure as `result.content[0].text` and parse JSON from there. The tool handlers in this codebase return JSON-stringified objects in the text content.
**Warning signs:** `TypeError: Cannot read properties of undefined`.

## Code Examples

Verified patterns from official sources and codebase analysis:

### Complete vitest.config.ts
```typescript
// Source: Vitest official docs + techresolve.blog Node16 workaround
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Required: map .js imports to .ts source files
    extensions: [".ts", ".js", ".json"],
  },
  test: {
    globals: false,  // Explicit imports preferred
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,  // 10s -- lock timeouts are 5s
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",       // Entry point with process handlers
      ],
      reporter: ["text", "json", "html"],
    },
  },
});
```

### package.json Scripts
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Test Helper: Isolated Config Setup
```typescript
// src/test-helpers.ts (shared across test files)
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetConfig, loadConfig } from "./config.js";

export async function createTestConfig(): Promise<{
  tempDir: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "cc-bridge-test-"));
  resetConfig();
  loadConfig({
    CC_BRIDGE_STATE_PATH: tempDir,
    CC_BRIDGE_TIMEOUT_MS: "5000",
    CC_BRIDGE_CHAR_LIMIT: "0",
    CC_BRIDGE_LOG_LEVEL: "error",
    CC_BRIDGE_CLAUDE_PATH: "claude",
  });
  return {
    tempDir,
    cleanup: async () => {
      resetConfig();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
```

### Peer Registry Service Test Skeleton
```typescript
// src/services/peer-registry.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

beforeEach(async () => {
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
});

afterEach(async () => {
  await cleanup();
});

describe("registerPeer", () => {
  it("creates a new peer entry", async () => {
    const peer = await registerPeer("be", "sess-1", "/tmp", "Backend");
    expect(peer.peerId).toBe("be");
    expect(peer.sessionId).toBe("sess-1");
    expect(peer.registeredAt).toBeTruthy();
  });

  it("overwrites existing peer with same ID", async () => {
    await registerPeer("be", "sess-1", "/tmp", "Backend");
    const peer = await registerPeer("be", "sess-2", "/other", "Backend2");
    expect(peer.sessionId).toBe("sess-2");
    const all = await listPeers();
    expect(all).toHaveLength(1);
  });
});

describe("deregisterPeer", () => {
  it("returns true when peer existed", async () => {
    await registerPeer("be", "sess-1", "/tmp", "Backend");
    expect(await deregisterPeer("be")).toBe(true);
    expect(await getPeer("be")).toBeUndefined();
  });

  it("returns false when peer did not exist", async () => {
    expect(await deregisterPeer("nonexistent")).toBe(false);
  });
});

describe("recordMessage + getHistory", () => {
  it("records and retrieves messages", async () => {
    await recordMessage({
      fromPeerId: "be",
      toPeerId: "fe",
      message: "hello",
      response: "hi",
      durationMs: 100,
      success: true,
      error: null,
    });
    const history = await getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].message).toBe("hello");
    expect(history[0].id).toBeTruthy(); // UUID assigned
  });

  it("filters by peerId", async () => {
    await recordMessage({
      fromPeerId: "be",
      toPeerId: "fe",
      message: "m1",
      response: null,
      durationMs: 50,
      success: true,
      error: null,
    });
    await recordMessage({
      fromPeerId: "other",
      toPeerId: "fe",
      message: "m2",
      response: null,
      durationMs: 50,
      success: true,
      error: null,
    });
    const beHistory = await getHistory("be");
    expect(beHistory).toHaveLength(1);
  });
});
```

### CC-CLI Service Test Skeleton with Mocked execFile
```typescript
// src/services/cc-cli.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { createTestConfig } from "../test-helpers.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

// Must import AFTER vi.mock (Vitest hoists, but logically cleaner)
const { execClaude } = await import("./cc-cli.js");

let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;
});

afterEach(async () => {
  await cleanup();
});

describe("execClaude", () => {
  it("returns stdout on successful execution", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        callback(null, "Claude response", "");
        return {} as any;
      },
    );
    const result = await execClaude("sess-1", "hello", "/tmp");
    expect(result.stdout).toBe("Claude response");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("detects CLI timeout", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const err = Object.assign(new Error("killed"), {
          killed: true,
          signal: "SIGTERM",
          code: null,
        });
        callback(err, "", "");
        return {} as any;
      },
    );
    const result = await execClaude("sess-1", "hello", "/tmp");
    expect(result.stderr).toContain("CLI_TIMEOUT");
    expect(result.exitCode).toBeNull();
  });

  it("detects missing binary (ENOENT)", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const err = Object.assign(new Error("not found"), {
          code: "ENOENT",
        });
        callback(err, "", "");
        return {} as any;
      },
    );
    const result = await execClaude("sess-1", "hello", "/tmp");
    expect(result.stderr).toContain("CLI_NOT_FOUND");
    expect(result.exitCode).toBe(127);
  });

  it("handles general execution failure", async () => {
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, callback: any) => {
        const err = Object.assign(new Error("exit 1"), { code: 1 });
        callback(err, "", "stderr output");
        return {} as any;
      },
    );
    const result = await execClaude("sess-1", "hello", "/tmp");
    expect(result.stderr).toContain("CLI_EXEC_FAILED");
  });
});
```

### Integration Test via InMemoryTransport
```typescript
// src/integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTestConfig } from "./test-helpers.js";

// Mock child_process so send-message doesn't spawn real CLI
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
const mockExecFile = vi.mocked(execFile);

// Import tool registration functions
import { registerRegisterPeerTool } from "./tools/register-peer.js";
import { registerDeregisterPeerTool } from "./tools/deregister-peer.js";
import { registerSendMessageTool } from "./tools/send-message.js";
import { registerListPeersTool } from "./tools/list-peers.js";
import { registerGetHistoryTool } from "./tools/get-history.js";

let client: Client;
let server: McpServer;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const ctx = await createTestConfig();
  cleanup = ctx.cleanup;

  server = new McpServer({ name: "test", version: "1.0.0" });
  registerRegisterPeerTool(server);
  registerDeregisterPeerTool(server);
  registerSendMessageTool(server);
  registerListPeersTool(server);
  registerGetHistoryTool(server);

  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(st), client.connect(ct)]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  await cleanup();
});

describe("full workflow", () => {
  it("register -> send -> history -> deregister", async () => {
    // 1. Register sender
    const reg1 = await client.callTool({
      name: "cc_register_peer",
      arguments: { peerId: "be", sessionId: "s1", cwd: "/tmp", label: "BE" },
    });
    expect(JSON.parse(reg1.content[0].text).success).toBe(true);

    // 2. Register receiver
    const reg2 = await client.callTool({
      name: "cc_register_peer",
      arguments: { peerId: "fe", sessionId: "s2", cwd: "/tmp", label: "FE" },
    });
    expect(JSON.parse(reg2.content[0].text).success).toBe(true);

    // 3. Mock CLI for send-message
    mockExecFile.mockImplementation(
      (_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, "Got it!", "");
        return {} as any;
      },
    );

    // 4. Send message
    const send = await client.callTool({
      name: "cc_send_message",
      arguments: { fromPeerId: "be", toPeerId: "fe", message: "hello" },
    });
    const sendData = JSON.parse(send.content[0].text);
    expect(sendData.success).toBe(true);
    expect(sendData.response).toBe("Got it!");

    // 5. Check history
    const hist = await client.callTool({
      name: "cc_get_history",
      arguments: { peerId: "be", limit: 10 },
    });
    const histData = JSON.parse(hist.content[0].text);
    expect(histData.messages).toHaveLength(1);
    expect(histData.messages[0].message).toBe("hello");

    // 6. Deregister
    const dereg = await client.callTool({
      name: "cc_deregister_peer",
      arguments: { peerId: "be" },
    });
    expect(JSON.parse(dereg.content[0].text).success).toBe(true);

    // 7. Verify peer is gone
    const list = await client.callTool({
      name: "cc_list_peers",
      arguments: {},
    });
    const listData = JSON.parse(list.content[0].text);
    expect(listData.count).toBe(1); // Only "fe" remains
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for ESM projects | Vitest 4.x | 2024-2025 | Native ESM, faster execution, same expect API |
| Istanbul coverage | V8 coverage (@vitest/coverage-v8) | Vitest 3.2+ | No instrumentation needed, accurate line/branch coverage |
| `server.tool()` API | `server.registerTool()` API | MCP SDK recent | Old `tool()` method is deprecated, `registerTool()` is current |
| Custom JSON-RPC test harness | InMemoryTransport + Client | MCP SDK 1.x | Official testing transport, full protocol compliance |

**Deprecated/outdated:**
- `McpServer.tool()`: Deprecated in favor of `McpServer.registerTool()`. The codebase already uses `registerTool()`.
- Vitest `basic` reporter: Removed in Vitest 4. Use `default` reporter with `summary: false` if needed.

## Open Questions

1. **Should tool handler tests use InMemoryTransport or call service functions directly?**
   - What we know: InMemoryTransport tests the full MCP protocol path including Zod validation. Direct service calls are simpler but skip the tool layer.
   - What's unclear: Whether the overhead of InMemoryTransport setup per tool test is acceptable.
   - Recommendation: Use InMemoryTransport for tool handler tests (TEST-01) since the requirement is to verify "correct MCP responses." Test services directly for TEST-02/TEST-03. This gives both layers coverage.

2. **Coverage thresholds -- what target?**
   - What we know: The roadmap says "every tool handler, service module, and end-to-end workflow." That implies high coverage.
   - What's unclear: Whether a specific percentage threshold should block CI.
   - Recommendation: Start without enforcement, measure what we get, then set thresholds in Phase 4 (Package Hygiene) based on actual numbers. Expect 80%+ naturally from the test requirements.

3. **Should we test corrupt state recovery (ERR-01)?**
   - What we know: Phase 1 implemented corrupt JSON auto-recovery in peer-registry (backup + empty state). This is a service behavior worth testing.
   - What's unclear: Whether this counts as TEST-02 (peer registry tests) or is separate.
   - Recommendation: Include corrupt state recovery tests in the peer-registry test file (TEST-02). Write invalid JSON to the state file, call a service function, verify empty state returned.

## Sources

### Primary (HIGH confidence)
- MCP SDK `InMemoryTransport` source -- verified from `node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js` and `.d.ts` (installed version ^1.6.1)
- MCP SDK `Client.callTool()` API -- verified from `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.d.ts`
- MCP SDK `McpServer.registerTool()` and `McpServer.connect()` -- verified from `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts`
- Vitest module mocking guide -- https://vitest.dev/guide/mocking/modules
- Vitest coverage guide -- https://vitest.dev/guide/coverage.html
- Vitest configuration reference -- https://vitest.dev/config/

### Secondary (MEDIUM confidence)
- Vitest 4.x release announcement (Node >= v20 requirement, `basic` reporter removal) -- https://vitest.dev/blog/vitest-4
- Vitest Node16 `.js` extension fix via `resolve.extensions` -- https://techresolve.blog/2025/12/11/how-to-not-require-js-extension-when-writing-vi/
- MCP E2E testing example (InMemoryTransport pattern) -- https://github.com/mkusaka/mcp-server-e2e-testing-example
- child_process mock pattern for Vitest -- https://gist.github.com/joemaller/f9171aa19a187f59f406ef1ffe87d9ac
- @vitest/coverage-v8 npm package -- https://www.npmjs.com/package/@vitest/coverage-v8

### Tertiary (LOW confidence)
- MCPcat unit testing guide (Python-focused but patterns transfer) -- https://mcpcat.io/guides/writing-unit-tests-mcp-servers/

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest 4.x + @vitest/coverage-v8 verified from npm and official docs
- Architecture: HIGH - InMemoryTransport API verified from installed SDK source, Node16 ESM fix verified from multiple sources
- Pitfalls: HIGH - ESM extension issue, config singleton leaking, and child_process mock patterns all verified from documented issues and official docs
- Code examples: MEDIUM - Patterns synthesized from verified APIs but not yet tested against this specific codebase

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- Vitest and MCP SDK are stable)
