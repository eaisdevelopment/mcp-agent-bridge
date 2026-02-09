---
phase: 01-config-error-hardening
plan: 03
subsystem: services
tags: [config-integration, error-handling, peer-registry, cc-cli, bridgeerror]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Zod-validated config singleton and BridgeError class"
provides:
  - "Config-driven peer-registry with corrupt state auto-recovery"
  - "Config-driven cc-cli with enriched timeout/missing-binary/failure errors"
  - "All service modules using getConfig() for runtime configuration"
affects: [01-04, 02-test-suite]

# Tech tracking
tech-stack:
  added: []
  patterns: [call-time-config-resolution, corrupt-state-auto-recovery, enriched-error-messages]

key-files:
  created: []
  modified:
    - src/services/peer-registry.ts
    - src/services/cc-cli.ts

key-decisions:
  - "State and lock paths derived at call time (not module load) for test isolation via resetConfig()"
  - "Corrupt JSON auto-recovery: backup with .corrupt.{timestamp} suffix, warning log, fresh empty state"
  - "Lock timeout error includes holder PID and timeout value in message"
  - "CLI char limit 0 means no truncation (conditional truncation logic)"
  - "CLI errors enriched in stderr field of CliExecResult (not thrown exceptions)"

patterns-established:
  - "Call-time config: getConfig() called inside functions, not at module scope, enabling test isolation"
  - "Error enrichment via BridgeError: structured code + message + suggestion for all service errors"
  - "CLI error classification: timeout (killed+SIGTERM), missing binary (ENOENT), general failure (exit code)"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 1 Plan 3: Service Hardening Summary

**Config-driven peer-registry with corrupt state auto-recovery and cc-cli with enriched timeout/missing-binary error messages**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T18:51:44Z
- **Completed:** 2026-02-09T18:55:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- peer-registry.ts reads state path from config instead of hardcoded /tmp, with call-time resolution for test isolation
- Corrupt state file auto-recovery: backs up corrupt file with .corrupt.{timestamp} suffix, logs warning, returns fresh empty state
- Lock timeout errors include PID of lock holder and timeout ms value with actionable fix suggestion
- cc-cli.ts reads timeout, char limit, and claude binary path from config instead of removed constants
- CLI errors classified into three categories (timeout, missing binary, general failure) with descriptive error messages
- TypeScript compiles with zero errors after both changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Update peer-registry.ts with config-driven paths and error recovery** - `beeccf8` (feat)
2. **Task 2: Update cc-cli.ts with config-driven settings and enriched errors** - `ddd6783` (feat)

## Files Created/Modified
- `src/services/peer-registry.ts` - Config-driven state path, corrupt JSON auto-recovery, BridgeError for lock timeout and state write failures
- `src/services/cc-cli.ts` - Config-driven timeout/char-limit/binary-path, enriched error messages for timeout/ENOENT/failure

## Decisions Made
- State and lock paths use call-time getConfig() rather than module-level constants, enabling test isolation via resetConfig() + loadConfig()
- Corrupt state auto-recovery follows user decision from 01-CONTEXT.md: backup + fresh state + warning log + continue operating
- CLI errors enriched in the stderr field of CliExecResult (function signature unchanged) so tool handler error responses include actionable messages
- CLI char limit 0 means no truncation per user decision from 01-01

## Deviations from Plan

None - plan executed exactly as written.

Note: Plan 02 (logger/startup) was already executed, so logger.ts was available. No stub was needed despite wave-2 parallel eligibility.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both service modules now fully config-driven and producing structured errors
- Plan 04 (tool handler error wrapping) can use errorResult/successResult from errors.ts to handle BridgeErrors from these services
- Phase 2 (test suite) can test both services with isolated temp directories via resetConfig() + loadConfig()

## Self-Check: PASSED

All modified files exist. All commit hashes verified in git log.

---
*Phase: 01-config-error-hardening*
*Completed: 2026-02-09*
