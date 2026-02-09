# Architecture

**Analysis Date:** 2026-02-09

## Pattern Overview

**Overall:** MCP Server with File-based Inter-Process Communication

**Key Characteristics:**
- Multiple MCP server processes communicate through shared file-based state
- Tools-based interface exposing peer registration and message relay
- CLI subprocess orchestration to interact with Claude Code sessions
- File locking mechanism for concurrent access coordination

## Layers

**MCP Server Layer:**
- Purpose: Exposes tools via Model Context Protocol to Claude Code clients
- Location: `src/index.ts`
- Contains: Server initialization, tool registration, stdio transport setup
- Depends on: `@modelcontextprotocol/sdk`, tool modules, constants
- Used by: Claude Code instances via `.mcp.json` configuration

**Tool Handlers Layer:**
- Purpose: Implements business logic for each MCP tool
- Location: `src/tools/`
- Contains: Five tool registration functions (register-peer, deregister-peer, send-message, list-peers, get-history)
- Depends on: Services layer, Zod schemas for validation
- Used by: MCP Server layer

**Services Layer:**
- Purpose: Core business logic and external integrations
- Location: `src/services/`
- Contains: Peer registry with file-based persistence, CLI execution wrapper
- Depends on: Node.js built-ins (fs, child_process, crypto), types
- Used by: Tool handlers layer

**Types Layer:**
- Purpose: Shared TypeScript interfaces and type definitions
- Location: `src/types.ts`, `src/constants.ts`
- Contains: PeerInfo, MessageRecord, SendMessageResult, CliExecResult interfaces; configuration constants
- Depends on: None
- Used by: All layers

## Data Flow

**Peer Registration Flow:**

1. Claude Code instance calls `cc_register_peer` tool via MCP
2. Tool handler (`src/tools/register-peer.ts`) validates input with Zod schema
3. Tool calls `registerPeer()` in `src/services/peer-registry.ts`
4. Service acquires file lock on `/tmp/cc-bridge-state.json.lock`
5. Service reads current state from `/tmp/cc-bridge-state.json`
6. Service updates peers record, writes atomically via temp-file-then-rename
7. Service releases lock, returns PeerInfo to tool handler
8. Tool handler formats JSON response back to MCP client

**Message Send Flow:**

1. Claude Code instance calls `cc_send_message` tool (fromPeerId, toPeerId, message)
2. Tool handler (`src/tools/send-message.ts`) validates both peers exist
3. Tool prefixes message with sender label: `[From {label} ({peerId})]: {message}`
4. Tool calls `execClaude()` in `src/services/cc-cli.ts` with target session details
5. CLI service spawns subprocess: `claude --resume {sessionId} -p "{message}"` in target's cwd
6. Subprocess executes with 120s timeout, captures stdout/stderr
7. Tool calls `recordMessage()` to persist exchange in shared state file
8. Tool returns success/response or error to MCP client

**State Management:**
- All state persisted in `/tmp/cc-bridge-state.json` (peers registry + message history)
- File locking uses `fs.writeFile` with `flag: "wx"` (O_CREAT | O_EXCL) for atomic lock acquisition
- Stale lock detection via `process.kill(pid, 0)` to check if lock-holding process exists
- Atomic writes via temp-file-then-rename pattern to prevent corruption

## Key Abstractions

**PeerInfo:**
- Purpose: Represents a registered Claude Code session
- Examples: `src/types.ts` lines 1-7
- Pattern: Plain data object with peerId, sessionId, cwd, label, registeredAt

**MessageRecord:**
- Purpose: Audit trail of inter-peer message exchanges
- Examples: `src/types.ts` lines 9-19
- Pattern: Immutable record with UUID, timestamps, success status, duration metrics

**File Lock Mechanism:**
- Purpose: Coordinate concurrent access to shared state file
- Examples: `src/services/peer-registry.ts` lines 48-99
- Pattern: Advisory lock via exclusive file creation, retry with exponential backoff, stale lock cleanup

**Tool Registration Pattern:**
- Purpose: Declarative tool definition with schema validation
- Examples: All files in `src/tools/`
- Pattern: Export function accepting McpServer, call `server.registerTool()` with name, schema (Zod), handler, annotations

## Entry Points

**Server Entry Point:**
- Location: `src/index.ts`
- Triggers: Invoked by Claude Code via `node dist/index.js` (configured in `.mcp.json`)
- Responsibilities: Initialize McpServer, register all five tools, connect StdioServerTransport, handle fatal errors

**Tool Entry Points:**
- Location: `src/tools/*.ts` (five files)
- Triggers: MCP client tool calls from Claude Code
- Responsibilities: Validate input, orchestrate service calls, format responses

**CLI Subprocess:**
- Location: `src/services/cc-cli.ts`
- Triggers: `cc_send_message` tool invocation
- Responsibilities: Execute `claude --resume` subprocess, handle timeouts, capture output, truncate oversized messages

## Error Handling

**Strategy:** Defensive error handling with graceful degradation

**Patterns:**
- Tool handlers return `{ success: false, error: "..." }` JSON instead of throwing
- File operations wrapped in try-catch with ENOENT handling for missing state file
- CLI subprocess errors captured in CliExecResult (exitCode, stderr) rather than exceptions
- Lock acquisition timeout (5s) with explicit error message
- Message truncation at 25,000 characters to prevent CLI overflow

## Cross-Cutting Concerns

**Logging:** Console.error to stderr for server lifecycle events (startup message in `src/index.ts` line 21)

**Validation:** Zod schemas in tool definitions for runtime input validation (all tool files use `z.string().describe()`)

**Authentication:** Not applicable - relies on filesystem access control for `/tmp/cc-bridge-state.json`

---

*Architecture analysis: 2026-02-09*
