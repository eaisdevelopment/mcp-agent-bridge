---
phase: 01-config-error-hardening
plan: 04
subsystem: tools
tags: [error-handling, mcp-tools, errorResult, successResult, bridgeerror, unhandled-rejection]

# Dependency graph
requires:
  - phase: 01-01
    provides: "BridgeError class, errorResult/successResult utilities"
  - phase: 01-03
    provides: "Config-driven services that produce enriched BridgeErrors"
provides:
  - "All 5 tool handlers wrapped with top-level try/catch returning structured MCP error responses"
  - "No unhandled promise rejection can originate from any tool handler"
  - "Consistent JSON response format via successResult/errorResult across all tools"
  - "Peer-not-found errors with machine-readable code and actionable suggestion"
affects: [02-test-suite]

# Tech tracking
tech-stack:
  added: []
  patterns: [tool-handler-error-wrapping, nested-catch-for-audit-safety]

key-files:
  created: []
  modified:
    - src/tools/register-peer.ts
    - src/tools/deregister-peer.ts
    - src/tools/send-message.ts
    - src/tools/list-peers.ts
    - src/tools/get-history.ts

key-decisions:
  - "Nested try/catch around recordMessage in send-message catch path to prevent audit logging from becoming unhandled rejection"
  - "Peer-not-found uses BridgeError with PEER_NOT_FOUND code and suggestion to register first"

patterns-established:
  - "Tool handler pattern: outer try/catch returning errorResult(err) with logger.error() for all tool handlers"
  - "Success responses: successResult({...}) instead of inline JSON.stringify content blocks"
  - "Nested error safety: when a catch block performs async work (like audit logging), wrap it in its own try/catch"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 1 Plan 4: Tool Handler Error Wrapping Summary

**All 5 MCP tool handlers wrapped with try/catch + errorResult/successResult utilities, eliminating inline JSON responses and unhandled rejection risk**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T18:58:31Z
- **Completed:** 2026-02-09T19:00:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- All 5 tool handlers (register-peer, deregister-peer, list-peers, send-message, get-history) wrapped with top-level try/catch
- Every success path uses successResult() for consistent JSON formatting
- Every error path uses errorResult() with structured error codes, messages, and suggestions
- send-message recordMessage call in the catch path has its own try/catch (the most dangerous unhandled rejection source in the codebase)
- Peer-not-found errors use BridgeError(PEER_NOT_FOUND) with actionable "register first" suggestion
- Zero inline `{ content: [{ type: "text" ... }] }` blocks remain in tool handlers

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap register-peer, deregister-peer, list-peers** - `3281b31` (feat)
2. **Task 2: Wrap send-message and get-history** - `64cf2d5` (feat)

## Files Created/Modified
- `src/tools/register-peer.ts` - Try/catch + successResult/errorResult, logger import
- `src/tools/deregister-peer.ts` - Try/catch + successResult/errorResult, logger import
- `src/tools/list-peers.ts` - Try/catch + successResult/errorResult, logger import
- `src/tools/send-message.ts` - Outer try/catch, BridgeError for peer-not-found, nested try/catch around recordMessage in error path, successResult/errorResult
- `src/tools/get-history.ts` - Try/catch + successResult/errorResult, logger import

## Decisions Made
- Nested try/catch around recordMessage in send-message catch path: losing the audit record is better than crashing the server with an unhandled rejection
- Peer-not-found errors use BridgeError with PEER_NOT_FOUND code and a suggestion to register first with cc_register_peer

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 1 is now complete: all 4 plans executed
- Config layer (01-01), logger/startup (01-02), service hardening (01-03), and tool error wrapping (01-04) all in place
- Phase 2 (test suite) can test all error paths since every tool handler and service now returns structured errors instead of crashing

## Self-Check: PASSED

All modified files exist. All commit hashes verified in git log.

---
*Phase: 01-config-error-hardening*
*Completed: 2026-02-09*
