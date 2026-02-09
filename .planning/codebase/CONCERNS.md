# Codebase Concerns

**Analysis Date:** 2026-02-09

## Tech Debt

**File-based locking implementation:**
- Issue: Custom file-based locking using `flag: "wx"` is fragile compared to established solutions
- Files: `src/services/peer-registry.ts` (lines 48-99)
- Impact: Race conditions could occur under high contention, lock files may be left behind on hard crashes (SIGKILL), multiple edge cases require manual handling (stale lock detection via `process.kill(pid, 0)`)
- Fix approach: Consider using battle-tested libraries like `proper-lockfile` or `lockfile`, or implement exponential backoff for lock acquisition retry logic. Add lock timeout monitoring and alerting.

**Hardcoded `/tmp` directory for state:**
- Issue: State file path hardcoded to `/tmp/cc-bridge-state.json` without configuration options
- Files: `src/services/peer-registry.ts` (line 11)
- Impact: Breaks on systems with restrictive `/tmp` permissions, prevents multi-tenant deployments (all instances share same state file), `/tmp` cleanup on some systems could delete state unexpectedly
- Fix approach: Add environment variable `CC_BRIDGE_STATE_PATH` with `/tmp` as fallback, document state file location requirements in README

**Silent error swallowing in lock cleanup:**
- Issue: Empty catch blocks suppress all errors during lock file deletion
- Files: `src/services/peer-registry.ts` (lines 68, 84)
- Impact: Debugging failures becomes impossible when lock cleanup fails, masks underlying filesystem issues (permissions, disk full, etc.)
- Fix approach: Log errors at appropriate level (debug/warn), consider adding metrics for lock operation failures

**No input validation beyond Zod schemas:**
- Issue: Missing runtime validation for peer IDs (special characters, length limits), no sanitization of file paths in `cwd` parameter
- Files: `src/tools/register-peer.ts`, `src/services/cc-cli.ts`
- Impact: Path traversal risks if `cwd` contains `..` sequences, potential command injection through session IDs or peer IDs with special shell characters
- Fix approach: Add regex validation for peer IDs (alphanumeric + hyphens only), resolve and validate `cwd` paths, sanitize all inputs passed to `execFile`

## Known Bugs

**Lock timeout does not release previously acquired lock:**
- Symptoms: If lock acquisition times out after 5 seconds, no cleanup is performed
- Files: `src/services/peer-registry.ts` (line 80)
- Trigger: High contention with multiple concurrent operations
- Workaround: Manual deletion of `/tmp/cc-bridge-state.json.lock` required

**Race condition in atomic write pattern:**
- Symptoms: Two processes writing simultaneously could create temp files with colliding PIDs (extremely rare but possible with PID reuse)
- Files: `src/services/peer-registry.ts` (line 41)
- Trigger: Process fork after temp file creation, PID wraparound on long-running systems
- Workaround: Include timestamp or random suffix in temp filename: `${STATE_PATH}.${process.pid}.${Date.now()}.tmp`

## Security Considerations

**CLI command injection surface:**
- Risk: Session IDs and messages passed directly to `execFile` without sanitization
- Files: `src/services/cc-cli.ts` (lines 16-24)
- Current mitigation: Using `execFile` (not `exec`) provides some protection, but arguments still need validation
- Recommendations: Validate session ID format (alphanumeric/UUID), escape message content, set strict character allowlist for peer IDs, add length limits

**No authentication/authorization:**
- Risk: Any process on the system can read/write shared state file, send messages to any peer
- Files: `src/services/peer-registry.ts` (line 11)
- Current mitigation: None - relies on filesystem permissions
- Recommendations: Add peer authentication tokens, implement message signing/verification, restrict state file permissions (600), consider using Unix domain sockets instead of shared file

**Message history retains sensitive data:**
- Risk: All messages stored in plaintext in `/tmp`, accessible to any user with read permissions
- Files: `src/services/peer-registry.ts` (lines 146-163)
- Current mitigation: File stored in `/tmp` which typically has world-readable permissions
- Recommendations: Set restrictive permissions on state file (chmod 600), add option to disable history logging, implement automatic history cleanup, encrypt sensitive fields

**Working directory information leakage:**
- Risk: Full filesystem paths stored in shared state expose project structure to other processes
- Files: `src/services/peer-registry.ts` (lines 103-122), `src/types.ts` (line 4)
- Current mitigation: None
- Recommendations: Consider hashing or anonymizing paths, restrict who can list peers, add privacy mode that omits sensitive fields

## Performance Bottlenecks

**Blocking file I/O on every operation:**
- Problem: Every peer registration, message send, and history query blocks on file read/write
- Files: `src/services/peer-registry.ts` (all exported functions)
- Cause: Synchronous read-parse-modify-write cycle under exclusive lock
- Improvement path: Implement write-ahead log for mutations, use memory-mapped files, batch operations, add read-through cache for frequently accessed data

**CLI subprocess overhead:**
- Problem: Each message spawns new `claude` CLI process with 120-second timeout
- Files: `src/services/cc-cli.ts` (lines 10-46)
- Cause: No programmatic API available for Claude Code sessions
- Improvement path: Monitor for API availability, implement connection pooling if possible, add queue system to prevent concurrent subprocess storms

**Unbounded message history growth:**
- Problem: History limited to 500 messages but grows linearly, no time-based expiry
- Files: `src/services/peer-registry.ts` (lines 13, 157-159)
- Cause: Simple slice approach without timestamp consideration
- Improvement path: Add configurable TTL (e.g., 24 hours), implement circular buffer with mmap, add history archival to separate file

## Fragile Areas

**Lock acquisition retry logic:**
- Files: `src/services/peer-registry.ts` (lines 48-81)
- Why fragile: Complex state machine with stale lock detection, signal checks, multiple error paths
- Safe modification: Add extensive logging before changing, write integration tests that simulate lock contention
- Test coverage: None - no test files exist for this critical path

**Message routing and CLI execution:**
- Files: `src/tools/send-message.ts` (lines 33-131)
- Why fragile: Multiple failure modes (peer not found, CLI timeout, subprocess error), complex error handling with dual recordMessage calls
- Safe modification: Extract error recording logic to reduce duplication, add retry mechanism
- Test coverage: None

**State file parsing:**
- Files: `src/services/peer-registry.ts` (lines 28-38)
- Why fragile: Assumes JSON is well-formed, returns empty state on ENOENT but throws on malformed JSON
- Safe modification: Add JSON schema validation, implement state file recovery from backup
- Test coverage: None - malformed state file could crash all servers

## Scaling Limits

**Single shared state file:**
- Current capacity: ~500 messages, unknown peer limit
- Limit: File lock contention becomes severe with >10 concurrent operations
- Scaling path: Migrate to SQLite with WAL mode, use Redis for shared state, implement peer-to-peer discovery without central state

**Stdio transport per session:**
- Current capacity: Two sessions (backend/frontend) per bridge instance
- Limit: No mechanism for discovering/connecting more than 2 peers
- Scaling path: Implement HTTP transport for MCP server, add peer discovery protocol, support N-to-N communication topology

**Synchronous lock blocking:**
- Current capacity: Lock timeout set to 5 seconds max
- Limit: One slow operation blocks all others, no queue fairness
- Scaling path: Implement async queue with priority levels, separate read/write locks, add operation timeout tracking

## Dependencies at Risk

**@modelcontextprotocol/sdk version pinning:**
- Risk: Using `^1.6.1` allows minor version updates that could introduce breaking changes
- Impact: Server could break on `npm install` if SDK updates tool registration API
- Migration plan: Pin exact version (`1.6.1`), monitor SDK changelog, add integration tests before upgrading

**Missing TypeScript-specific dependencies:**
- Risk: No explicit `@types/*` packages for Node.js built-ins beyond `@types/node`
- Impact: Type safety depends entirely on SDK type definitions
- Migration plan: Audit imports, add missing type packages, enable `noImplicitAny` strictly

**No dependency security scanning:**
- Risk: No `npm audit` in CI, no Dependabot/Renovate configuration
- Impact: Vulnerable dependencies could persist undetected
- Migration plan: Add GitHub Actions workflow with `npm audit`, configure automated dependency updates

## Missing Critical Features

**No error recovery mechanism:**
- Problem: Server crashes on fatal errors without restart capability
- Blocks: Reliable production deployment, unattended operation
- Priority: High

**No logging framework:**
- Problem: Only `console.error` used, no structured logging, log levels, or persistence
- Blocks: Debugging production issues, audit trails, compliance requirements
- Priority: High

**No graceful shutdown:**
- Problem: Process exit does not clean up locks, deregister peers, or close transports
- Blocks: Clean deployments, proper connection lifecycle management
- Priority: Medium

**No health check endpoint:**
- Problem: Cannot monitor server liveness or state file health
- Blocks: Production monitoring, container orchestration integration
- Priority: Medium

**No metrics/observability:**
- Problem: No instrumentation for message latency, lock contention, error rates
- Blocks: Performance tuning, capacity planning, SLA monitoring
- Priority: Medium

## Test Coverage Gaps

**Zero test coverage:**
- What's not tested: All functionality - no test files exist in `src/`
- Files: Entire codebase (`src/**/*.ts`)
- Risk: Regressions undetected, refactoring extremely risky, edge cases unknown
- Priority: Critical

**Critical untested scenarios:**
- Lock contention with multiple processes
- Stale lock detection and recovery
- Malformed state file handling
- CLI subprocess timeout/failure modes
- Concurrent peer registration/deregistration
- Message delivery during target session unavailability
- State file corruption/recovery
- PID wraparound in temp file naming
- Files: `src/services/peer-registry.ts`, `src/services/cc-cli.ts`, `src/tools/send-message.ts`
- Risk: Production failures in error paths, data loss scenarios
- Priority: Critical

**No integration tests:**
- What's missing: End-to-end message flow, multi-process state sharing, actual CLI interaction
- Risk: Breaking changes in MCP SDK or Claude CLI go undetected
- Priority: High

**No linting or formatting configuration:**
- What's missing: No `.eslintrc`, `.prettierrc`, or similar configuration files
- Files: Project root
- Risk: Code style inconsistency, common errors undetected (unused variables, type assertions)
- Priority: Medium

**No .gitignore file:**
- What's missing: No `.gitignore` present - `node_modules/`, `dist/`, and temp files at risk
- Files: Project root
- Risk: Binary files, dependencies, build artifacts could be committed accidentally
- Priority: High

---

*Concerns audit: 2026-02-09*
