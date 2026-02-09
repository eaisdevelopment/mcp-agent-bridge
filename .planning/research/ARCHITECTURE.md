# Architecture Research

**Domain:** MCP server / inter-agent communication bridge -- test infrastructure, configuration, npm packaging
**Researched:** 2026-02-09
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MCP Client (Claude Code)                        │
│            sends tool calls via stdio JSON-RPC                      │
├─────────────────────────────────────────────────────────────────────┤
│                        MCP Server Layer                             │
│  ┌──────────────┐                                                   │
│  │  index.ts     │  Entry point, McpServer init, transport setup    │
│  └──────┬───────┘                                                   │
├─────────┴───────────────────────────────────────────────────────────┤
│                       Tool Handlers Layer                           │
│  ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌──────┐ │
│  │register  │ │deregister  │ │send-message│ │list-peers│ │ hist │ │
│  │-peer     │ │-peer       │ │            │ │          │ │      │ │
│  └────┬─────┘ └─────┬──────┘ └─────┬──────┘ └────┬─────┘ └──┬───┘ │
├───────┴─────────────┴───────────────┴─────────────┴──────────┴─────┤
│                        Services Layer                               │
│  ┌──────────────────────────┐  ┌────────────────────────┐           │
│  │    peer-registry.ts      │  │      cc-cli.ts         │           │
│  │  (state + file locking)  │  │  (subprocess relay)    │           │
│  └──────────┬───────────────┘  └──────────┬─────────────┘           │
├─────────────┴──────────────────────────────┴────────────────────────┤
│                       External I/O Layer                            │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐    │
│  │  /tmp/cc-bridge-state   │  │  claude --resume <sid> -p msg  │    │
│  │  .json (shared state)   │  │  (CLI subprocess)              │    │
│  └─────────────────────────┘  └────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                     Config + Types (cross-cutting)                  │
│  ┌──────────┐  ┌────────────┐  ┌───────────────────────┐           │
│  │ types.ts │  │constants.ts│  │ config.ts (new)       │           │
│  └──────────┘  └────────────┘  └───────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `index.ts` | Server bootstrap, tool registration, stdio transport | Tool handlers, McpServer SDK |
| Tool handlers (`src/tools/`) | Input validation (Zod), request routing, response formatting | Services layer, McpServer SDK |
| `peer-registry.ts` | State persistence, file locking, CRUD for peers and messages | Filesystem (`/tmp/cc-bridge-state.json`) |
| `cc-cli.ts` | Subprocess execution of `claude --resume`, timeout handling | `claude` CLI binary |
| `types.ts` | Shared TypeScript interfaces (PeerInfo, MessageRecord, etc.) | All layers (import only) |
| `constants.ts` | Hardcoded configuration values (timeouts, limits, names) | All layers (import only) |
| `config.ts` (proposed) | Environment-based configuration with Zod validation | Replaces `constants.ts` for runtime-configurable values |

### Data Flow

```
[CC Instance A]
    │ MCP tool call: cc_send_message(from, to, msg)
    ↓
[index.ts] → [StdioServerTransport] → [send-message handler]
    │                                         │
    │  1. Validate from/to peers exist        │
    │     ↓                                   │
    │  [peer-registry.ts] → readState()       │
    │     ↓                                   │
    │  2. Relay message via CLI               │
    │     ↓                                   │
    │  [cc-cli.ts] → execFile("claude",       │
    │     ["--resume", sid, "-p", msg])        │
    │     ↓                                   │
    │  3. Record exchange in history           │
    │     ↓                                   │
    │  [peer-registry.ts] → withLock() →      │
    │     recordMessage() → writeState()      │
    │     ↓                                   │
    │  4. Return result to caller             │
    ↓                                         │
[CC Instance A receives JSON response]        │
                                              │
[CC Instance B receives message via           │
 claude --resume subprocess]                  │
```

### Key Data Flows

1. **Tool invocation:** Claude Code -> stdio JSON-RPC -> McpServer dispatch -> tool handler -> services -> response
2. **State mutations:** Tool handler -> peer-registry.ts -> acquireLock() -> readState() -> mutate -> writeState() -> releaseLock()
3. **Message relay:** send-message handler -> cc-cli.ts -> `execFile("claude", ...)` subprocess -> capture stdout/stderr
4. **State sharing:** Multiple MCP server processes share `/tmp/cc-bridge-state.json` via advisory file locking

## Recommended Project Structure

### Current + Proposed Additions

```
cc-bridge-mcp-server/
├── src/
│   ├── index.ts               # Server entry point (add #!/usr/bin/env node)
│   ├── config.ts              # NEW: Env-based config with Zod validation
│   ├── types.ts               # Shared type definitions
│   ├── constants.ts           # Static constants (server name, version)
│   ├── services/
│   │   ├── peer-registry.ts   # State persistence + file locking
│   │   └── cc-cli.ts          # CLI subprocess relay
│   └── tools/
│       ├── register-peer.ts
│       ├── deregister-peer.ts
│       ├── send-message.ts
│       ├── list-peers.ts
│       └── get-history.ts
├── tests/                     # NEW: Test directory (separate from src/)
│   ├── setup.ts               # Test setup: temp dirs, cleanup hooks
│   ├── helpers.ts             # Test utilities: createTestServer, fixtures
│   ├── unit/
│   │   ├── services/
│   │   │   ├── peer-registry.test.ts
│   │   │   └── cc-cli.test.ts
│   │   └── config.test.ts
│   └── integration/
│       ├── tool-handlers.test.ts     # All tools via InMemoryTransport
│       └── server-lifecycle.test.ts  # Server startup, tool listing
├── dist/                      # Build output (rename from dist for clarity)
├── vitest.config.ts           # NEW: Vitest configuration
├── tsconfig.json              # Updated: add tests path
├── tsconfig.build.json        # NEW: Build-only config (excludes tests)
├── package.json               # Updated: add test scripts, bin, files, npm fields
├── LICENSE                    # NEW: Required for npm publication
├── .gitignore                 # NEW: Proper gitignore
└── .npmignore                 # NEW: Or use "files" field in package.json
```

### Structure Rationale

- **`tests/` separate from `src/`:** Because the `tsconfig.json` compiles `rootDir: "./src"` into `dist/`. Co-locating tests in `src/` would compile them into `dist/`, bloating the published package. A separate `tests/` directory with its own tsconfig inclusion keeps the build clean. Vitest handles TypeScript transformation natively (no tsc needed for tests).

- **`tests/unit/` and `tests/integration/`:** Clear separation of test types. Unit tests mock external dependencies (fs, child_process). Integration tests use the SDK's `InMemoryTransport` to test the full MCP request-response cycle without subprocess overhead.

- **`tests/helpers.ts`:** Shared test utilities -- factory functions for creating a connected McpServer+Client pair, PeerInfo fixtures, temp state file paths. Avoids duplicating setup across test files.

- **`tsconfig.build.json`:** Extends base `tsconfig.json` but explicitly excludes `tests/`. Used by `npm run build`. The base `tsconfig.json` includes both `src/` and `tests/` for IDE support and type checking.

- **`config.ts`:** Replaces hardcoded paths in `peer-registry.ts`. MCP servers run as subprocesses spawned by Claude Code, so environment variables injected by the host are the reliable configuration mechanism. Zod validates at startup to fail fast.

## Architectural Patterns

### Pattern 1: InMemoryTransport for Integration Testing

**What:** The `@modelcontextprotocol/sdk` ships `InMemoryTransport.createLinkedPair()` which creates two linked transports -- one for a Client, one for the Server -- communicating entirely in-process. This is the canonical way to test MCP servers without stdio or HTTP.

**When to use:** Integration tests that validate the full tool call lifecycle: JSON-RPC dispatch, Zod input validation, handler execution, response formatting.

**Confidence:** HIGH (verified in installed SDK at `node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js`)

**Trade-offs:** Tests the real MCP protocol stack but still requires mocking external I/O (filesystem, subprocesses). Does not test stdio transport-specific behavior.

**Example:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerRegisterPeerTool } from "../src/tools/register-peer.js";

describe("cc_register_peer via MCP protocol", () => {
  let server: McpServer;
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    server = new McpServer({ name: "test-server", version: "0.0.1" });
    registerRegisterPeerTool(server);

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await clientTransport.close();
    await serverTransport.close();
  });

  it("registers a peer and returns success", async () => {
    const result = await client.callTool({
      name: "cc_register_peer",
      arguments: {
        peerId: "backend",
        sessionId: "ses-123",
        cwd: "/tmp/test-project",
        label: "CC_Backend",
      },
    });

    const parsed = JSON.parse((result.content as any)[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.peer.peerId).toBe("backend");
  });
});
```

### Pattern 2: Dependency-Injectable Configuration

**What:** Replace hardcoded `STATE_PATH`, `LOCK_PATH` constants in `peer-registry.ts` with a configuration object loaded from environment variables at startup. Validate with Zod. Pass configuration to services that need it.

**When to use:** For making state file path, lock path, timeouts, and limits configurable. Critical for testing (use temp dirs instead of `/tmp/`) and for npm consumers who may want different paths.

**Confidence:** HIGH (standard MCP server pattern confirmed by multiple sources; Zod already a dependency)

**Trade-offs:** Requires refactoring `peer-registry.ts` to accept config rather than using module-level constants. Slightly more complex but enables testability and user customization.

**Example:**
```typescript
// src/config.ts
import { z } from "zod";

const ConfigSchema = z.object({
  statePath: z.string().default("/tmp/cc-bridge-state.json"),
  cliTimeoutMs: z.number().default(120_000),
  characterLimit: z.number().default(25_000),
  maxMessages: z.number().default(500),
  lockRetryMs: z.number().default(50),
  lockMaxWaitMs: z.number().default(5_000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    statePath: process.env.CC_BRIDGE_STATE_PATH,
    cliTimeoutMs: process.env.CC_BRIDGE_CLI_TIMEOUT_MS
      ? Number(process.env.CC_BRIDGE_CLI_TIMEOUT_MS)
      : undefined,
    characterLimit: process.env.CC_BRIDGE_CHARACTER_LIMIT
      ? Number(process.env.CC_BRIDGE_CHARACTER_LIMIT)
      : undefined,
    maxMessages: process.env.CC_BRIDGE_MAX_MESSAGES
      ? Number(process.env.CC_BRIDGE_MAX_MESSAGES)
      : undefined,
  });
}
```

### Pattern 3: npm Publishing Structure for MCP Servers

**What:** The canonical npm packaging for an MCP server uses `"bin"` for npx execution, `"files"` whitelist for lean packages, a shebang in the entry point, and `prepublishOnly` to ensure builds.

**When to use:** Before publishing to npm so the package works with `npx cc-bridge-mcp-server` and can be referenced in `.mcp.json` config.

**Confidence:** HIGH (verified against official `create-typescript-server` template and multiple published MCP servers)

**Example package.json fields:**
```json
{
  "name": "cc-bridge-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for inter-Claude-Code session communication bridge",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "cc-bridge-mcp-server": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit",
    "ci": "npm run lint && npm run test",
    "prepublishOnly": "npm run ci && npm run build",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "engines": { "node": ">=18" },
  "license": "MIT",
  "keywords": ["mcp", "claude-code", "bridge", "inter-agent", "communication"]
}
```

**Entry point shebang (required for `bin`):**
```typescript
#!/usr/bin/env node
// src/index.ts -- first line must be the shebang
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2 peers (current target) | File-based state at `/tmp/` is sufficient. Advisory locking handles two concurrent writers. |
| 5-10 peers | File-based state still works but lock contention increases. Consider SQLite for concurrent reads. Message history grows faster -- `MAX_MESSAGES` cap important. |
| 10+ peers | File locking becomes a bottleneck. Would need to move to SQLite/better-sqlite3 or a proper DB. But this is well beyond current scope. |

### Scaling Priorities

1. **First bottleneck:** Lock contention on `/tmp/cc-bridge-state.json.lock` under concurrent writes. The 5-second lock timeout and 50ms retry mitigate this adequately for 2-3 peers.
2. **Second bottleneck:** Message history growth. The `MAX_MESSAGES = 500` cap prevents unbounded growth but may lose history in high-traffic scenarios.

## Anti-Patterns

### Anti-Pattern 1: Subprocess-Based Testing

**What people do:** Spawn the MCP server as a real subprocess in tests and communicate via stdio pipes.
**Why it's wrong:** Race conditions, port/pipe conflicts, slow startup times, flaky tests. The MCP SDK explicitly provides `InMemoryTransport` to avoid this.
**Do this instead:** Use `InMemoryTransport.createLinkedPair()` for integration tests. Test services directly for unit tests.

### Anti-Pattern 2: Co-located Tests in `src/` with Build Compilation

**What people do:** Place `.test.ts` files in `src/` alongside source files, letting tsc compile them into `dist/`.
**Why it's wrong:** Test files end up in the published npm package. Build output contains test code. TypeScript's `rootDir` enforcement breaks if tests import from outside `src/`.
**Do this instead:** Place tests in a separate `tests/` directory. Use a `tsconfig.build.json` (extending the base) that excludes `tests/`. Vitest handles TypeScript directly -- no tsc needed for test execution.

### Anti-Pattern 3: Mocking the Entire MCP SDK

**What people do:** Mock `McpServer`, `registerTool`, and the full protocol stack in unit tests.
**Why it's wrong:** Tests become tautological -- they test mock configuration rather than actual behavior. The Zod validation, tool dispatch, and response formatting in the real SDK are part of what you need to verify.
**Do this instead:** Use `InMemoryTransport` for integration tests (tests the real protocol). For unit tests, test service functions directly without involving the MCP layer at all.

### Anti-Pattern 4: Hardcoded `/tmp/` Paths in Testable Code

**What people do:** Leave `/tmp/cc-bridge-state.json` hardcoded in `peer-registry.ts` and try to work around it in tests.
**Why it's wrong:** Tests pollute shared state. Parallel test runs corrupt each other. CI environments may have different `/tmp/` semantics.
**Do this instead:** Make the state path configurable (via `config.ts`). In tests, use `os.tmpdir()` + random subdirectory, cleaned up in `afterEach`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `claude` CLI binary | `execFile` subprocess with timeout | Must be on PATH. No programmatic API. Mock in tests. |
| Filesystem (`/tmp/`) | `node:fs/promises` with advisory locking | State file + lock file. Use temp dirs in tests. |
| MCP Client (Claude Code) | stdio JSON-RPC via `StdioServerTransport` | Claude Code spawns server as subprocess per `.mcp.json` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Tool handlers <-> Services | Direct function calls (async) | Clean separation. Tools never touch fs/subprocess directly. |
| Services <-> Config | Config object passed at init or imported | Currently uses module-level constants. Should become injectable. |
| Server <-> Transport | McpServer.connect(transport) | Swappable: StdioServerTransport for production, InMemoryTransport for tests. |
| Tests <-> Source | Import source modules, mock external I/O | Tests import from `../src/...`, never from `../dist/...` |

### Test Infrastructure Integration

```
┌──────────────────────────────────────────────────────┐
│                    Test Runner (Vitest)                │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Unit Tests                  Integration Tests        │
│  ┌────────────────────┐     ┌──────────────────────┐ │
│  │ Mock fs, execFile  │     │ InMemoryTransport    │ │
│  │ Test service fns   │     │ Real McpServer +     │ │
│  │ directly           │     │ Client pair          │ │
│  │                    │     │                      │ │
│  │ peer-registry.test │     │ tool-handlers.test   │ │
│  │ cc-cli.test        │     │ server-lifecycle     │ │
│  │ config.test        │     │                      │ │
│  └────────────────────┘     └──────────────────────┘ │
│           │                          │                │
│           ↓                          ↓                │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Source Code (src/)                   │ │
│  │  services/  tools/  config.ts  types.ts          │ │
│  └─────────────────────────────────────────────────┘ │
│           │                          │                │
│           ↓                          ↓                │
│  ┌────────────────┐    ┌──────────────────────────┐  │
│  │ Temp state file │    │ Mocked claude subprocess │  │
│  │ (per-test dir)  │    │ (vi.mock execFile)       │  │
│  └────────────────┘    └──────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Build Order (Dependencies Between Components)

The following build order respects dependencies -- each step's prerequisites are completed by earlier steps:

1. **Config layer** (`config.ts`) -- depends on nothing. Zod validates env vars.
   - Prerequisite for: peer-registry refactor, cc-cli refactor, tests

2. **Service refactor** -- make `peer-registry.ts` and `cc-cli.ts` accept config (injectable state path, timeouts)
   - Prerequisite for: testable services, integration tests

3. **Test infrastructure** (`vitest.config.ts`, `tsconfig.build.json`, test helpers)
   - Prerequisite for: all test writing

4. **Unit tests** -- test services with mocked fs/subprocess
   - Prerequisite for: confidence in refactoring

5. **Integration tests** -- test tools via InMemoryTransport with real McpServer
   - Prerequisite for: confidence in tool behavior

6. **npm packaging** (`bin`, `files`, shebang, `prepublishOnly`, LICENSE)
   - Prerequisite for: publication
   - Can be done in parallel with tests (no dependency)

7. **CI scripts** (`npm run ci` = lint + test + build)
   - Prerequisite for: reliable publication

## Vitest Configuration

**Recommended `vitest.config.ts`:**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    environment: "node",
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],  // Entry point hard to unit test
    },
  },
});
```

**Confidence:** HIGH (verified via Context7 Vitest docs + `@vitest/coverage-v8` patterns)

## Sources

- `@modelcontextprotocol/sdk` InMemoryTransport: Verified in installed SDK at `node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js` (HIGH confidence)
- Official `create-typescript-server` template: https://github.com/modelcontextprotocol/create-typescript-server (HIGH confidence -- package.json.ejs, tsconfig.json, shebang pattern)
- `mcp-testing-kit` (https://github.com/thoughtspot/mcp-testing-kit): Third-party testing utility using dummy transport layer (MEDIUM confidence)
- MCP server unit testing patterns: https://mcpcat.io/guides/writing-unit-tests-mcp-servers/ (MEDIUM confidence)
- npm publishing for MCP servers: https://www.aihero.dev/publish-your-mcp-server-to-npm (MEDIUM confidence)
- MCP environment variable configuration: https://apxml.com/courses/getting-started-model-context-protocol/chapter-4-debugging-and-client-integration/managing-environment-variables (MEDIUM confidence)
- Vitest configuration: Context7 `/vitest-dev/vitest` docs (HIGH confidence)
- npm `files` field best practices: https://docs.npmjs.com/cli/v9/using-npm/developers/ (HIGH confidence)

---
*Architecture research for: cc-bridge-mcp-server test infrastructure, configuration, and npm packaging*
*Researched: 2026-02-09*
