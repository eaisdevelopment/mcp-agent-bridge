# cc-bridge-mcp-server

## What This Is

An MCP server that lets two separate Claude Code instances communicate through a shared bridge. One CC works on the backend, another on the frontend — the bridge lets them discuss, debug, and coordinate without mixing their project contexts. Messages are relayed via CLI subprocess calls (`claude --resume`), with shared state persisted to a JSON file. Published to npm as `cc-bridge-mcp-server` and listed on the MCP Registry.

## Core Value

Two Claude Code sessions can exchange messages in real-time while staying fully isolated in their own repos.

## Requirements

### Validated

- ✓ Peer registration with session ID, cwd, and label — existing
- ✓ Peer deregistration — existing
- ✓ Message relay via CLI subprocess (`claude --resume`) — existing
- ✓ Peer listing — existing
- ✓ Message history retrieval with filtering — existing
- ✓ File-based shared state with locking — existing
- ✓ Zod input validation on all tools — existing
- ✓ MCP stdio transport — existing
- ✓ Centralized config with Zod validation and 6 env vars — v1.0
- ✓ Structured error handling (BridgeError with 11 codes) — v1.0
- ✓ Comprehensive test suite (75 tests, Vitest) — v1.0
- ✓ Health check diagnostics tool (state, lock, CLI) — v1.0
- ✓ Stale peer detection with TTL-based flagging — v1.0
- ✓ npm package published (0.1.0) with CLI shebang — v1.0
- ✓ MCP Registry listing (io.github.eaisdevelopment) — v1.0
- ✓ npx-first documentation with troubleshooting — v1.0

### Active

(None — define in next milestone via `/gsd:new-milestone`)

### Out of Scope

- Mobile or web UI — CLI-only tool for developers
- Multi-peer broadcast — 1:1 messaging covers the use case
- Authentication/authorization — relies on filesystem access control
- Database storage — file-based state is sufficient for 2-peer use case
- HTTP/SSE transport — core use case is local machine; stdio is simpler
- Plugin/middleware system — codebase is small enough to fork-and-modify
- Automatic peer discovery — explicit registration is two tool calls; not burdensome

## Context

Shipped v1.0 with 4,038 LOC TypeScript across 20+ source files.
Tech stack: TypeScript, Node.js >= 18, `@modelcontextprotocol/sdk` ^1.6.1, Vitest.
6 MCP tools: cc_register_peer, cc_deregister_peer, cc_send_message, cc_list_peers, cc_get_history, cc_health_check.
6 env vars: CC_BRIDGE_STATE_PATH, CC_BRIDGE_TIMEOUT_MS, CC_BRIDGE_CHAR_LIMIT, CC_BRIDGE_LOG_LEVEL, CC_BRIDGE_STALE_TIMEOUT_MS, CC_BRIDGE_LOCK_TIMEOUT_MS.
75 tests passing with 62% coverage (100% on core modules).
Published: npm 0.1.0, MCP Registry io.github.eaisdevelopment.

## Constraints

- **CLI dependency**: Messages relayed via `claude --resume <sessionId> -p "msg"` subprocess — no programmatic API available
- **Stdio transport**: Each CC instance spawns its own MCP server process; state must be file-shared
- **Platform**: Requires write access to state directory and `claude` on PATH
- **Character limit**: CLI output configurable via CC_BRIDGE_CHAR_LIMIT (default: no limit)
- **Timeout**: CLI subprocess timeout configurable via CC_BRIDGE_TIMEOUT_MS (default: 120s)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| File-based shared state | Stdio transport = separate processes; in-memory state can't be shared | ✓ Good — simple, reliable, no external deps |
| CLI subprocess for message relay | `@anthropic-ai/claude-code` has no programmatic Node.js API | ✓ Good — works reliably with timeout guards |
| Advisory file locking with `wx` flag | Need atomic lock acquisition without external dependencies | ✓ Good — handles concurrent access cleanly |
| Atomic writes via temp-file-then-rename | Prevent state file corruption from concurrent writes | ✓ Good — zero corruption in testing |
| Flat CC_BRIDGE_* env var prefix | Simple, discoverable, no config file needed | ✓ Good — 6 vars cover all settings |
| Default char limit 0 (no limit) | User preference over original 25000 | ✓ Good — avoids unexpected truncation |
| Default state path ~/cloud_code_bridge | User preference over os.tmpdir() | ✓ Good — persists across reboots |
| createRequire for package.json import | TS 5.7+ import assertion regression workaround | ✓ Good — reliable version single-sourcing |
| Callback-style execFile (not promisify) | Mock compatibility with Vitest | ✓ Good — clean test patterns |
| Health check uses separate lock path | Avoid production lock interference during diagnostics | ✓ Good — non-intrusive health checks |
| Backward-compatible state migration | migrateState() in readState() for schema evolution | ✓ Good — seamless lastSeenAt addition |

---
*Last updated: 2026-02-10 after v1.0 milestone*
