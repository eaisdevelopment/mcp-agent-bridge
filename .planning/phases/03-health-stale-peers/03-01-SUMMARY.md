---
phase: 03-health-stale-peers
plan: 01
subsystem: api
tags: [health-check, diagnostics, mcp-tool, execFile, file-lock]

# Dependency graph
requires:
  - phase: 01-config-error-hardening
    provides: "getConfig(), BridgeError, successResult/errorResult, logger, constants"
  - phase: 02-test-suite
    provides: "createTestConfig() test isolation, vitest infrastructure, InMemoryTransport test pattern"
provides:
  - "checkHealth() service function with stateFile, lockMechanism, claudeCli sub-checks"
  - "registerHealthCheckTool() MCP tool wrapper for cc_health_check"
  - "HealthCheckResult type for structured diagnostic output"
affects: [03-health-stale-peers-plan-02, stale-peer-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: ["callback-style execFile for mock compatibility (no promisify)", "separate health-lock path to avoid production lock interference", "Promise.all for parallel sub-checks without short-circuiting"]

key-files:
  created:
    - src/services/health-check.ts
    - src/tools/health-check.ts
    - src/services/health-check.test.ts
    - src/tools/health-check.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "Callback-style execFile wrapper instead of promisify for mock compatibility with vitest"
  - "Health-check lock uses separate .health-lock path to never interfere with real lock"
  - "Types defined locally in health-check.ts (not types.ts) since only used by this module"
  - "JSON.parse(JSON.stringify(result)) cast for successResult compatibility with nested objects"
  - "resetConfig() in error test to exercise tool handler catch path via getConfig() throw"

patterns-established:
  - "Diagnostic sub-check pattern: each check returns {ok, message} independently, orchestrator aggregates"
  - "Health check parallel execution: Promise.all for all sub-checks, healthy = all ok"

# Metrics
duration: 5min
completed: 2026-02-09
---

# Phase 3 Plan 1: Health Check Summary

**cc_health_check MCP tool with three sub-checks (state file, lock mechanism, Claude CLI) returning structured diagnostic JSON**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T22:53:45Z
- **Completed:** 2026-02-09T22:58:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Health check service with checkStateFile (HLTH-01), checkLockMechanism (HLTH-02), checkClaudeCli (HLTH-03) sub-checks
- cc_health_check MCP tool registered as 6th tool in index.ts with read-only, idempotent annotations
- 9 new tests (6 service + 3 tool) all passing, service at 94% coverage, tool at 100%
- Uses separate health-lock path to never interfere with concurrent real operations

## Task Commits

Each task was committed atomically:

1. **Task 1: Create health-check service and tool handler** - `8f90f31` (feat)
2. **Task 2: Add health-check service and tool tests** - `919e73f` (test)

## Files Created/Modified
- `src/services/health-check.ts` - Health check service with three sub-checks and checkHealth() orchestrator
- `src/tools/health-check.ts` - MCP tool handler wrapping checkHealth() with successResult/errorResult
- `src/services/health-check.test.ts` - 6 service tests: healthy, inaccessible dir, missing CLI, lock, corrupt state, version
- `src/tools/health-check.test.ts` - 3 tool tests: healthy via MCP, unhealthy via MCP, error handling
- `src/index.ts` - Added health check import, registration, and tool list update

## Decisions Made
- Used callback-style execFile (manual Promise wrapper) instead of promisify to maintain mock compatibility with vitest -- promisify requires util.promisify.custom symbol that vi.fn() lacks
- Health check lock path is statePath + ".health-lock" (separate from production ".lock") per research pitfall #5
- Types (CheckResult, ClaudeCliCheckResult, HealthCheckResult) defined locally in health-check.ts since they are only used by this module
- Tool handler uses JSON.parse(JSON.stringify(result)) to convert nested HealthCheckResult to plain Record<string, unknown> for successResult

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed execFile from promisify to callback-style**
- **Found during:** Task 2 (test writing)
- **Issue:** `promisify(execFile)` with a `vi.fn()` mock doesn't work because Node.js `execFile` has a custom `util.promisify.custom` symbol that the mock lacks. The promisified mock resolves with the raw string instead of `{stdout, stderr}`, causing `stdout.trim()` to throw.
- **Fix:** Changed `checkClaudeCli()` to use `execFile` directly with a callback wrapped in `new Promise()`, matching the established pattern in `cc-cli.ts`.
- **Files modified:** `src/services/health-check.ts`
- **Verification:** All 65 tests pass including the "returns healthy" test that was failing
- **Committed in:** 919e73f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix for test compatibility. No scope creep. Pattern now matches established cc-cli.ts convention.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Health check infrastructure complete, ready for plan 02 (stale peer cleanup)
- The checkHealth() service pattern can be extended with additional sub-checks if needed
- All 65 tests passing with no regressions

## Self-Check: PASSED

All 6 files verified present. Both commit hashes (8f90f31, 919e73f) verified in git log. 65 tests passing.

---
*Phase: 03-health-stale-peers*
*Completed: 2026-02-09*
