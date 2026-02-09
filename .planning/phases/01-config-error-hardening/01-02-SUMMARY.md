---
phase: 01-config-error-hardening
plan: 02
subsystem: logging
tags: [logger, stderr, dual-output, startup-validation, first-run, tty-prompt, global-error-handlers, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Zod-validated config singleton (loadConfig, getConfig) and BridgeError class"
provides:
  - "Dual-output Logger class (stderr + text file + JSON file) with level filtering"
  - "initLogger() to replace pre-config logger with fully-configured instance"
  - "runStartup() orchestrating first-run setup, config loading, logger init, and validation"
  - "First-run interactive prompt with TTY detection and ~/.cc-bridge-config.json persistence"
  - "State directory auto-creation and write-access validation"
  - "Claude CLI detection with warn-only on missing"
  - "Global error handlers (uncaughtException, unhandledRejection, SIGTERM, SIGINT)"
  - "Startup-before-transport ordering in index.ts"
affects: [01-03, 01-04, 02-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-output-logging, pre-mcp-startup-flow, tty-first-run-prompt, global-error-handlers, stderr-only-diagnostics]

key-files:
  created:
    - src/logger.ts
    - src/startup.ts
  modified:
    - src/index.ts

key-decisions:
  - "Timestamped log filenames per server start (no rotation needed)"
  - "Pre-config logger writes stderr-only at info level until startup completes"
  - "First-run config persisted to ~/.cc-bridge-config.json (not in state dir)"
  - "Claude CLI missing is warn-only; does not block startup"
  - "Startup banner always prints to stderr via direct write (not through logger)"
  - "Global error handlers do not exit process (MCP server tries to continue)"

patterns-established:
  - "Dual-output logging: all diagnostics go to stderr + text file + JSON file, never stdout"
  - "Pre-MCP startup: runStartup() must complete before server.connect() to avoid stdin contention"
  - "TTY detection: interactive prompts only when process.stdin.isTTY is true"
  - "Module-level logger export: import { logger } from logger.ts, replaced after initLogger()"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 1 Plan 2: Logger, Startup, and Entry Point Summary

**Dual-output logger (stderr + text + JSON files) with first-run interactive setup, state directory validation, and global error handlers in rewritten index.ts**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T18:51:18Z
- **Completed:** 2026-02-09T18:53:28Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Logger class writing to 3 destinations (stderr, text file, JSON file) with 4-level threshold filtering and timestamped per-start filenames
- Startup module handling first-run detection, TTY interactive prompt, state directory creation/validation, and Claude CLI detection
- Rewritten index.ts with correct startup ordering: global handlers -> runStartup() -> create server -> register tools -> connect transport -> banner

## Task Commits

Each task was committed atomically:

1. **Task 1: Create logger.ts with dual-output logging** - `eb0015a` (feat)
2. **Task 2: Create startup.ts with first-run setup and validation** - `45eca1a` (feat)
3. **Task 3: Rewrite index.ts with startup flow and global error handlers** - `b04edc8` (feat)

## Files Created/Modified
- `src/logger.ts` - Dual-output Logger class with stderr + text file + JSON file, level filtering, createLogger factory, initLogger replacement function
- `src/startup.ts` - runStartup() with first-run TTY prompt, ~/.cc-bridge-config.json persistence, state dir validation, Claude CLI check, logger initialization
- `src/index.ts` - Rewritten with global error handlers (uncaughtException, unhandledRejection, SIGTERM, SIGINT), startup-before-transport ordering, stderr-only banner

## Decisions Made
- Timestamped log filenames (e.g., bridge-2026-02-09T18-51-18.log) per server start -- avoids rotation complexity per research recommendation
- Pre-config logger at module level writes to stderr only at info level; replaced with full logger after startup completes
- First-run config persisted to ~/.cc-bridge-config.json in user home directory -- avoids chicken-and-egg problem with state directory
- Claude CLI not found is a warning, not an error -- only cc_send_message needs it, other 4 tools work without it
- Startup banner written directly to stderr (not through logger) so it always appears regardless of log level
- uncaughtException and unhandledRejection handlers log but do NOT exit the process -- MCP server should try to continue operating

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript compile check revealed pre-existing errors in peer-registry.ts (STATE_PATH/LOCK_PATH references removed in Plan 01 constants refactor). These are not introduced by this plan and will be addressed in later plans. The plan expected only cc-cli.ts errors; peer-registry.ts errors are also pre-existing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- logger.ts and startup.ts are ready as foundations for all subsequent plans
- Plan 03 (cc-cli.ts rewrite) can import logger for structured logging and config for timeout/path values
- Plan 04 (tool handler hardening) will benefit from the global error handlers as a safety net
- The runStartup() flow ensures config is always loaded before any tool handler executes

## Self-Check: PASSED

All created files exist. All commit hashes verified in git log.

---
*Phase: 01-config-error-hardening*
*Completed: 2026-02-09*
