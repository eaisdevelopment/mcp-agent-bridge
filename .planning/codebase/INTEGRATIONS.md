# External Integrations

**Analysis Date:** 2026-02-09

## APIs & External Services

**Claude Code CLI:**
- `claude` binary - Communication bridge between Claude Code sessions
  - Command: `claude --resume <sessionId> -p "<message>"`
  - Executed via Node.js `child_process.execFile` in `src/services/cc-cli.ts`
  - Timeout: 120,000ms (2 minutes) per call
  - Max buffer: 10MB
  - Character limit: 25,000 chars (truncated with warning if exceeded)
  - Auth: Inherits from `process.env`

## Data Storage

**Databases:**
- None (uses file-based persistence)

**File Storage:**
- Local filesystem only
  - State file: `/tmp/cc-bridge-state.json` - Stores peer registry and message history
  - Lock file: `/tmp/cc-bridge-state.json.lock` - Process coordination via `flag: "wx"` (O_CREAT | O_EXCL)
  - Lock timeout: 5,000ms with 50ms retry intervals
  - Stale lock detection: `process.kill(pid, 0)` checks if lock-holding process exists
  - Atomic writes: temp file + `fs.rename()` pattern
  - Max stored messages: 500 (circular buffer)

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- None for MCP server itself
  - Runs over stdio transport (local process communication)
  - No HTTP endpoints or authentication

**External CLI Auth:**
- Claude Code CLI auth managed externally
  - Server inherits environment from parent process
  - No credential management within server code

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- Console error logging only
  - Server startup: `console.error` to stderr
  - Fatal errors: `console.error` + `process.exit(1)`

## CI/CD & Deployment

**Hosting:**
- Local execution only
  - Invoked as stdio subprocess from Claude Code via `.mcp.json` configuration

**CI Pipeline:**
- None

## Environment Configuration

**Required env vars:**
- None explicitly required
- PATH must include `claude` CLI binary location

**Secrets location:**
- No secrets managed by this server
- Relies on system-level Claude Code CLI authentication

## Webhooks & Callbacks

**Incoming:**
- None (stdio transport only)

**Outgoing:**
- None

## Inter-Process Communication

**MCP Protocol:**
- Transport: stdio (stdin/stdout)
- Configuration: `.mcp.json` in client repositories
  - Example: `{ "mcpServers": { "cc-bridge": { "command": "node", "args": ["/path/to/dist/index.js"] } } }`
- Server instance per Claude Code session
- Shared state coordination via file locking

**Subprocess Execution:**
- `claude` CLI invoked via `child_process.execFile` in `src/services/cc-cli.ts`
- Working directory: Set to target peer's `cwd` value
- Timeout handling: 2 minute timeout per CLI invocation
- Environment inheritance: Full `process.env` passed through

---

*Integration audit: 2026-02-09*
