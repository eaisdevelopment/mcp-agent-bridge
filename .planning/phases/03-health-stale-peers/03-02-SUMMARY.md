---
phase: 03-health-stale-peers
plan: 02
subsystem: api
tags: [stale-detection, lastSeenAt, peer-registry, mcp-tool, backward-compatibility]

# Dependency graph
requires:
  - phase: 01-config-error-hardening
    provides: "getConfig(), configSchema, BridgeError, successResult/errorResult, logger"
  - phase: 02-test-suite
    provides: "createTestConfig() test isolation, vitest infrastructure, InMemoryTransport test pattern"
  - phase: 03-health-stale-peers-plan-01
    provides: "health check tool, test patterns for sub-checks"
provides:
  - "CC_BRIDGE_STALE_TIMEOUT_MS config field (30min default, 0 disables)"
  - "lastSeenAt field on PeerInfo type for tracking peer activity"
  - "updateLastSeen() service function for interaction-driven timestamps"
  - "potentiallyStale flag in cc_list_peers MCP response"
  - "migrateState() backward-compatible state migration for legacy files"
affects: [stale-peer-cleanup, auto-deregister, peer-health-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns: ["migrateState() inline migration for backward-compatible schema evolution", "enriched MCP response with computed flags (potentiallyStale)", "try/catch isolation for non-critical side-effects (lastSeenAt updates)"]

key-files:
  created: []
  modified:
    - src/config.ts
    - src/types.ts
    - src/services/peer-registry.ts
    - src/tools/list-peers.ts
    - src/tools/send-message.ts
    - src/services/peer-registry.test.ts
    - src/tools/list-peers.test.ts
    - src/tools/send-message.test.ts

key-decisions:
  - "Stale timeout default 30 minutes (1,800,000ms), configurable via CC_BRIDGE_STALE_TIMEOUT_MS"
  - "Timeout of 0 disables stale detection entirely (potentiallyStale always false)"
  - "Sender lastSeenAt updated on every send attempt; target only on success"
  - "updateLastSeen failures wrapped in try/catch to never break send-message"
  - "migrateState() applied inline in readState() for zero-migration-step backward compatibility"

patterns-established:
  - "Inline state migration: migrateState() in readState() for schema evolution without separate migration step"
  - "Enriched MCP response: tool handler computes derived fields (potentiallyStale) from raw service data"
  - "Non-critical side-effect isolation: try/catch around updateLastSeen to prevent auxiliary failures from breaking primary operations"

# Metrics
duration: 5min
completed: 2026-02-09
---

# Phase 3 Plan 2: Stale Peer Detection Summary

**Configurable stale peer detection via lastSeenAt tracking on PeerInfo with potentiallyStale flag in cc_list_peers response and backward-compatible state migration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T23:02:08Z
- **Completed:** 2026-02-09T23:07:45Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- CC_BRIDGE_STALE_TIMEOUT_MS config field with 30-minute default and 0-to-disable semantics
- lastSeenAt field tracked across all peer interactions: registration sets initial value, send-message updates sender always and target on success only
- cc_list_peers enriches response with computed potentiallyStale boolean per peer
- Backward-compatible migrateState() handles legacy state files without lastSeenAt by defaulting to registeredAt
- 10 new tests covering stale/non-stale/disabled scenarios, lastSeenAt tracking, and state migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add lastSeenAt tracking and stale detection to services and tools** - `ca4c47f` (feat)
2. **Task 2: Add stale detection tests and fix existing test assertions** - `b34bffb` (test)

## Files Created/Modified
- `src/config.ts` - Added CC_BRIDGE_STALE_TIMEOUT_MS with z.coerce.number().int().min(0).default(1_800_000)
- `src/types.ts` - Added lastSeenAt: string to PeerInfo interface
- `src/services/peer-registry.ts` - Added migrateState(), updateLastSeen(), lastSeenAt in registerPeer
- `src/tools/list-peers.ts` - Added potentiallyStale computation using getConfig().CC_BRIDGE_STALE_TIMEOUT_MS
- `src/tools/send-message.ts` - Added updateLastSeen calls for sender (always) and target (on success)
- `src/services/peer-registry.test.ts` - 4 new tests: lastSeenAt on register, updateLastSeen, no-op for missing peer, migration
- `src/tools/list-peers.test.ts` - 3 new tests: recent peers not stale, stale flag, timeout=0 disabled
- `src/tools/send-message.test.ts` - 3 new tests: sender updated, target updated on success, target unchanged on failure

## Decisions Made
- Stale timeout default 30 minutes matches research recommendation for typical MCP session idle periods
- Timeout of 0 disables stale detection entirely -- useful for deployments that handle staleness externally
- Sender lastSeenAt updated even on failed delivery since the sender IS demonstrably active
- Target lastSeenAt NOT updated on failure since failed delivery does not confirm target is reachable
- updateLastSeen calls wrapped in try/catch to prevent side-effect failures from breaking the send-message primary flow
- migrateState() runs in readState() on every read -- minimal overhead, zero manual migration steps

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 03 (Health & Stale Peers) is now complete with both plans executed
- Health check tool (03-01) and stale peer detection (03-02) provide the foundation for future auto-deregister/cleanup features
- All 75 tests passing with no regressions

## Self-Check: PASSED

All 8 modified files verified present. Both commit hashes (ca4c47f, b34bffb) verified in git log. 75 tests passing.

---
*Phase: 03-health-stale-peers*
*Completed: 2026-02-09*
