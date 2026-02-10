# CLAUDE.md

## Project Overview

**cc-bridge-mcp-server** — An MCP server that enables inter-session communication between two separate Claude Code instances. Two CC sessions can exchange messages while staying fully isolated in their own repositories.

Published as `@essentialai/cc-bridge-mcp-server` on npm (v0.2.3).

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm test` | Run test suite (vitest) |
| `npm run test:watch` | Tests with file watcher |
| `npm run test:coverage` | Coverage report (v8) |
| `npm run dev` | Watch mode with auto-reload (tsx) |
| `npm start` | Run compiled MCP server |
| `npm run clean` | Remove `dist/` |

## Tech Stack

- **TypeScript** (strict, ES2022 target, Node16 modules, ESM)
- **@modelcontextprotocol/sdk** — MCP protocol implementation
- **Zod** — Schema validation (config + tool inputs)
- **Vitest** — Test runner with v8 coverage
- **tsx** — Dev-time TypeScript execution
- No linter/formatter configured. No frameworks.

## Architecture

```
MCP Server (index.ts)
    ↓ registers 6 tools
Tools Layer (tools/*.ts)         ← MCP tool handlers
    ↓
Services Layer (services/*.ts)   ← Business logic
    ↓
Config (config.ts) + Errors (errors.ts) + Logger (logger.ts)
    ↓
File-based State (peer-registry.ts) with exclusive locking
```

### Entry Points

- `src/index.ts` — MCP server (registers tools, sets up error handlers)
- `src/cli.ts` — CLI entry point (`cc-bridge-mcp-server init` wizard)

### Key Files

| File | Role |
|------|------|
| `src/config.ts` | Zod-validated env var loading (`CC_BRIDGE_*`) |
| `src/errors.ts` | `BridgeError` + 11 error codes + result helpers |
| `src/logger.ts` | Dual-output logger (stderr + file) |
| `src/services/peer-registry.ts` | File-based shared state + exclusive locking |
| `src/services/cc-cli.ts` | `execClaude()` subprocess wrapper |
| `src/services/health-check.ts` | Diagnostic checks (state, lock, CLI) |
| `src/tools/*.ts` | 6 MCP tools (register-peer, deregister-peer, send-message, list-peers, get-history, health-check) |
| `src/wizard/` | Interactive setup wizard (demo + real modes) |

## Coding Conventions

### Style

- Strict TypeScript — all types explicit, `strict: true`
- Async/await preferred over callbacks
- Strategic comments — explain *why*, not *what*
- Semicolons used naturally (not enforced)

### Naming

- **Exports**: Descriptive (`registerRegisterPeerTool`, `execClaude`, `recordMessage`)
- **Private**: Leading underscore (`_config`)
- **Error codes**: SCREAMING_SNAKE_CASE (`CLI_NOT_FOUND`, `LOCK_TIMEOUT`)
- **Env vars**: `CC_BRIDGE_*` prefix

### Error Handling

- Domain errors use `BridgeError` with code, message, and suggestion
- Tool handlers return `toolResult()`, `successResult()`, or `errorResult()`
- `withLock<T>(fn)` ensures atomic operations on shared state
- Resource cleanup via `finally` blocks

### Testing

- Test files co-located with source (`*.test.ts`)
- Each test gets fresh `createTestConfig()` with temp dir (from `src/test-helpers.ts`)
- Vitest: `describe`, `it`, `beforeEach`, `afterEach`
- Mocking: `InMemoryTransport` for MCP, mock `child_process` for CLI
- Values defined inline — no fixture files

### Patterns

- **Tool registration**: `server.registerTool(name, schema, handler)` with Zod schema
- **File locking**: `fs.writeFile(flag: "wx")` with stale lock detection via `process.kill(pid, 0)`
- **Atomic writes**: Write to temp file, then rename
- **Config**: Single `loadConfig()` call freezes the config object; `getConfig()` throws if not loaded
- **Subprocess relay**: `claude --resume <sessionId> -p "message"` with timeout + env stripping

## Configuration

Six environment variables with defaults:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CC_BRIDGE_STATE_PATH` | `~/.cc-bridge/` | State directory |
| `CC_BRIDGE_LOG_LEVEL` | `info` | Log verbosity |
| `CC_BRIDGE_LOG_FORMAT` | `human` | Log format (human/json) |
| `CC_BRIDGE_TIMEOUT_MS` | `120000` | CLI subprocess timeout |
| `CC_BRIDGE_CHAR_LIMIT` | `0` | Message truncation (0 = no limit) |
| `CC_BRIDGE_STALE_TIMEOUT_MS` | `1800000` | Idle peer timeout (30 min) |

## Project Status

v1.0 feature-complete. Planning docs in `.planning/`. Some test failures in subprocess mocking (`send-message`, `cc-cli`, `integration`).
