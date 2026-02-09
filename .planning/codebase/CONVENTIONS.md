# Coding Conventions

**Analysis Date:** 2026-02-09

## Naming Patterns

**Files:**
- Kebab-case for all files: `peer-registry.ts`, `send-message.ts`, `cc-cli.ts`
- `.ts` extension for TypeScript sources
- `.js` extension for compiled output (in `dist/`)

**Functions:**
- camelCase for functions: `registerPeer()`, `execClaude()`, `withLock()`
- Descriptive verb-noun pairs: `registerRegisterPeerTool()`, `deregisterPeer()`, `recordMessage()`
- Registration functions for tools follow pattern: `register{ToolName}Tool(server: McpServer): void`

**Variables:**
- camelCase for variables: `peerId`, `sessionId`, `maxBuffer`
- SCREAMING_SNAKE_CASE for constants: `CHARACTER_LIMIT`, `CLI_TIMEOUT_MS`, `STATE_PATH`, `MAX_MESSAGES`
- Underscore suffix for numeric values in constants: `CLI_TIMEOUT_MS`, `LOCK_MAX_WAIT_MS` (in milliseconds)

**Types:**
- PascalCase for interfaces: `PeerInfo`, `MessageRecord`, `BridgeState`, `CliExecResult`
- Descriptive suffixes: `Info` for data structures, `Record` for historical data, `Result` for operation outcomes

## Code Style

**Formatting:**
- 2-space indentation (evident from consistent spacing in source files)
- No explicit formatter configured (no `.prettierrc` or `.eslintrc` found)
- Manual formatting maintained consistently across codebase

**Linting:**
- No linter configuration detected
- TypeScript compiler configured with `strict: true` in `tsconfig.json` for type checking

**TypeScript Configuration:**
- Target: ES2022
- Module: Node16
- Strict mode enabled
- Source maps and declaration maps generated

## Import Organization

**Order:**
1. Node.js built-in modules (with `node:` prefix): `import crypto from "node:crypto"`
2. External dependencies: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"`
3. Local modules with relative paths: `import { registerPeer } from "../services/peer-registry.js"`

**Path Aliases:**
- No path aliases configured
- All imports use relative paths with `.js` extension (ES module style)

**Extension Convention:**
- Always include `.js` extension in imports (ES module requirement), even though source files are `.ts`

## Error Handling

**Patterns:**
- Try-catch blocks for async operations that may fail
- Error type checking with `instanceof Error` for error messages: `err instanceof Error ? err.message : String(err)`
- Type guards for Node.js-specific errors: `(err as NodeJS.ErrnoException).code`
- Promise rejection handling via `.catch()` on top-level async functions
- Graceful fallbacks for missing files: check for `ENOENT` error code

**Example:**
```typescript
try {
  const raw = await fs.readFile(STATE_PATH, "utf-8");
  return JSON.parse(raw) as BridgeState;
} catch (err: unknown) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    return emptyState();
  }
  throw err;
}
```

**CLI Execution:**
- Always use Promise wrapper around `execFile` callback
- Resolve with result object (never reject), including errors in structured format
- Non-zero exit codes handled gracefully in `CliExecResult` structure

## Logging

**Framework:** Console (no external logging library)

**Patterns:**
- `console.error()` for server lifecycle messages and errors
- No verbose logging in normal operation
- Error logging in top-level catch handlers: `console.error("Fatal error:", err)`

**Example:**
```typescript
console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
```

## Comments

**When to Comment:**
- Section headers with visual separators for file organization
- Complex algorithms (e.g., file locking mechanism)
- Architecture decisions: `/* File-based shared state (Option B) */`
- Inline explanations for non-obvious operations: `// atomic on same filesystem`

**JSDoc/TSDoc:**
- Not used consistently
- No function-level documentation blocks
- Inline comments preferred for clarity

**Comment Style:**
```typescript
/* ------------------------------------------------------------------ */
/*  File-based shared state (Option B)                                */
/*  Two or more MCP server processes share /tmp/cc-bridge-state.json  */
/* ------------------------------------------------------------------ */
```

## Function Design

**Size:** Functions are focused and single-purpose, typically 10-50 lines

**Parameters:**
- Explicit parameter lists, no options objects
- Type annotations required for all parameters
- Optional parameters use TypeScript `?` syntax or default values

**Return Values:**
- Always specify return type explicitly: `Promise<PeerInfo>`, `Promise<void>`
- Async functions return Promises
- Structured result objects for operations: `{ success: boolean, error: string | null }`

**Example:**
```typescript
export async function registerPeer(
  peerId: string,
  sessionId: string,
  cwd: string,
  label: string
): Promise<PeerInfo> {
  // Implementation
}
```

## Module Design

**Exports:**
- Named exports only (no default exports)
- Export functions and interfaces directly
- Internal helpers not exported

**Barrel Files:**
- Not used
- Direct imports from specific files

**File Organization:**
- One primary responsibility per file
- Tools in `src/tools/` (one tool per file)
- Services in `src/services/` (one service per file)
- Shared types in `src/types.ts`
- Constants in `src/constants.ts`

## Type Safety

**Type Annotations:**
- Explicit types on all function parameters and return values
- `unknown` for caught errors, then type guard to narrow
- Type assertions with `as` for narrowing: `type: "text" as const`

**Const Assertions:**
- Used for literal types: `as const` on string literals for MCP response types

**Type Imports:**
- Types imported alongside values in single import statement

## Zod Schema Pattern

**Tool Input Schemas:**
- Zod schemas define tool input parameters
- Chain `.describe()` for parameter documentation
- Use `.optional()` and `.default()` for optional parameters

**Example:**
```typescript
inputSchema: {
  peerId: z.string().describe("Unique identifier for this peer"),
  limit: z.number().optional().default(50).describe("Maximum number of messages"),
}
```

## Async/Await

**Convention:**
- Prefer `async/await` over raw Promises
- All I/O operations are async
- Top-level async call wrapped with `.catch()` for unhandled rejection handling

**Example:**
```typescript
runStdio().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

---

*Convention analysis: 2026-02-09*
