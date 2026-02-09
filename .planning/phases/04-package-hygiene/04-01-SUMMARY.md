---
phase: 04-package-hygiene
plan: 01
subsystem: infra
tags: [npm, packaging, cli, shebang, version, createRequire]

# Dependency graph
requires:
  - phase: 01-config-error-hardening
    provides: constants.ts with SERVER_VERSION used across the codebase
provides:
  - npm-publishable package.json with bin, files, keywords, repository metadata
  - CLI shebang in entry point (src/index.ts and dist/index.js)
  - Single-sourced version from package.json via createRequire (no drift)
affects: [04-02-PLAN, npm-publish]

# Tech tracking
tech-stack:
  added: []
  patterns: [createRequire for JSON import in Node16 ESM]

key-files:
  created: []
  modified:
    - package.json
    - src/index.ts
    - src/constants.ts

key-decisions:
  - "createRequire over import assertion for package.json (TS 5.7+ regression workaround)"
  - "OWNER placeholder in repository URLs (no git remote configured)"
  - "Version 0.1.0 signals pre-1.0 development stage"

patterns-established:
  - "Version single-sourcing: package.json is sole source of truth, read via createRequire at runtime"

# Metrics
duration: 1min
completed: 2026-02-09
---

# Phase 4 Plan 1: npm Packaging Fields Summary

**npm packaging metadata with bin/files/keywords fields, CLI shebang, and single-sourced version via createRequire**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-09T23:39:07Z
- **Completed:** 2026-02-09T23:40:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- package.json enriched with all 9 npm publishing fields (bin, files, prepublishOnly, keywords, repository, homepage, bugs, license, version 0.1.0)
- src/index.ts has `#!/usr/bin/env node` shebang preserved through tsc build to dist/index.js
- SERVER_VERSION in constants.ts now reads from package.json at runtime via createRequire (zero drift)
- All 75 existing tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add npm packaging fields and shebang** - `7ab0219` (feat)
2. **Task 2: Single-source version via createRequire** - `f76e392` (feat)

## Files Created/Modified
- `package.json` - Added bin, files, keywords, repository, homepage, bugs, license, prepublishOnly; version changed to 0.1.0
- `src/index.ts` - Added `#!/usr/bin/env node` shebang as first line
- `src/constants.ts` - Replaced hardcoded version with createRequire-based dynamic read from package.json

## Decisions Made
- Used `createRequire` instead of JSON import assertion -- TypeScript 5.7+ has a regression (TS #60589) with JSON imports under `module: "Node16"`; createRequire is the reliable standard pattern
- Used `OWNER` placeholder in repository/homepage/bugs URLs since no git remote is configured; user updates before npm publish
- Set version to `0.1.0` to signal pre-1.0 development stage per PKG-09 from research

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- package.json is ready for npm publish (pending OWNER URL replacement and LICENSE file from plan 02)
- All packaging fields validated, build verified, tests green
- Ready for 04-02 (README, LICENSE, .npmignore)

## Self-Check: PASSED

- FOUND: package.json
- FOUND: src/index.ts
- FOUND: src/constants.ts
- FOUND: .planning/phases/04-package-hygiene/04-01-SUMMARY.md
- FOUND: commit 7ab0219
- FOUND: commit f76e392

---
*Phase: 04-package-hygiene*
*Completed: 2026-02-09*
