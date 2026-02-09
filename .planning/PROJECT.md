# cc-bridge-mcp-server

## What This Is

An MCP server that lets two separate Claude Code instances communicate through a shared bridge. One CC works on the backend, another on the frontend — the bridge lets them discuss, debug, and coordinate without mixing their project contexts. Messages are relayed via CLI subprocess calls (`claude --resume`), with shared state persisted to a file.

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

### Active

- [ ] Automated test suite (unit + integration)
- [ ] Live end-to-end validation with two CC sessions
- [ ] Hardened error handling for community use
- [ ] Configurable settings (paths, timeouts, limits)
- [ ] Production-quality documentation (install, usage, troubleshooting)
- [ ] npm package publication
- [ ] GitHub open source release
- [ ] MCP registry listing

### Out of Scope

- Mobile or web UI — CLI-only tool for developers
- Multi-peer broadcast — 1:1 messaging covers the use case
- Authentication/authorization — relies on filesystem access control
- Database storage — file-based state is sufficient for 2-peer use case

## Context

- Built with TypeScript on Node.js >= 18 using `@modelcontextprotocol/sdk` ^1.6.1
- Uses stdio MCP transport (separate process per CC instance, hence file-based shared state)
- State persisted at `/tmp/cc-bridge-state.json` with advisory file locking
- No test framework installed yet — testing infrastructure needs to be added
- `claude` CLI binary must be on PATH; it has no programmatic Node.js API
- Currently 7 source files across `src/`, `src/tools/`, and `src/services/`

## Constraints

- **CLI dependency**: Messages relayed via `claude --resume <sessionId> -p "msg"` subprocess — no programmatic API available
- **Stdio transport**: Each CC instance spawns its own MCP server process; state must be file-shared
- **Platform**: Requires `/tmp/` write access and `claude` on PATH
- **Character limit**: CLI output truncated at 25,000 characters
- **Timeout**: CLI subprocess timeout at 120 seconds

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| File-based shared state | Stdio transport = separate processes; in-memory state can't be shared | — Pending |
| CLI subprocess for message relay | `@anthropic-ai/claude-code` has no programmatic Node.js API | — Pending |
| Advisory file locking with `wx` flag | Need atomic lock acquisition without external dependencies | — Pending |
| Atomic writes via temp-file-then-rename | Prevent state file corruption from concurrent writes | — Pending |

---
*Last updated: 2026-02-09 after initialization*
