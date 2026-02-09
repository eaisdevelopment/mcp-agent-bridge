# Roadmap: cc-bridge-mcp-server

## Overview

This roadmap takes a working prototype MCP bridge server and transforms it into a publishable, community-ready npm package. The journey moves from hardening the internals (configuration, error handling) through testing for confidence, adding missing features (health check, stale peer detection), packaging for npm distribution, and finishing with documentation and MCP Registry listing. Every phase builds on the prior, with code quality and user experience compounding at each step.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Configuration and Error Hardening** - Centralized config module and bulletproof error handling across all async paths
- [ ] **Phase 2: Test Suite** - Unit and integration tests covering all tools, services, and workflows
- [ ] **Phase 3: Health Check and Stale Peer Detection** - New cc_health_check tool and stale peer flagging in list_peers
- [ ] **Phase 4: Package Hygiene** - npm packaging fields, LICENSE, .gitignore, version, and tool annotations for publication
- [ ] **Phase 5: Documentation and Registry** - README restructure, env var docs, server.json, npm publish, and MCP Registry submission

## Phase Details

### Phase 1: Configuration and Error Hardening
**Goal**: All runtime behavior is configurable via environment variables, and no error condition crashes the server process
**Depends on**: Nothing (first phase)
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CONF-06, ERR-01, ERR-02, ERR-03, ERR-04, ERR-05
**Success Criteria** (what must be TRUE):
  1. Setting `CC_BRIDGE_STATE_PATH` to a custom path causes the server to read/write state there instead of the default
  2. Setting `CC_BRIDGE_TIMEOUT_MS` or `CC_BRIDGE_CHAR_LIMIT` to custom values changes CLI subprocess behavior accordingly
  3. Setting `CC_BRIDGE_LOG_LEVEL=debug` produces verbose stderr output; setting it to `error` suppresses info/warn; stdout remains clean in all cases
  4. Corrupting the state file JSON, killing a lock holder, timing out the CLI subprocess, or removing the `claude` binary all produce clear MCP error responses without crashing the server
  5. Starting the server without `claude` on PATH produces a clear startup warning on stderr
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md -- Config foundation: Zod config module, BridgeError system, constants refactor
- [ ] 01-02-PLAN.md -- Logger, startup validation, and index.ts rewrite
- [ ] 01-03-PLAN.md -- Service hardening: peer-registry and cc-cli config integration
- [ ] 01-04-PLAN.md -- Tool handler error wrapping across all 5 tools

### Phase 2: Test Suite
**Goal**: Every tool handler, service module, and end-to-end workflow has automated tests that run in isolation
**Depends on**: Phase 1 (config layer enables test isolation via temp directories)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. Running `npm test` executes all unit and integration tests via Vitest and reports pass/fail with coverage
  2. Each of the 5 tool handlers has tests verifying correct MCP responses for valid input and proper error responses for invalid input
  3. Full register-send-history-deregister workflow passes via InMemoryTransport without touching shared /tmp
  4. CLI service tests cover success, timeout, and error subprocess paths using mocked `execFile`
  5. All tests use isolated temp directories; no test pollutes /tmp or conflicts with other tests running in parallel
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Health Check and Stale Peer Detection
**Goal**: Users can diagnose bridge problems with a single tool call, and stale peers are visibly flagged
**Depends on**: Phase 1 (config for paths/timeouts), Phase 2 (tests to validate new features)
**Requirements**: HLTH-01, HLTH-02, HLTH-03, PEER-01, PEER-02
**Success Criteria** (what must be TRUE):
  1. Calling `cc_health_check` with a working setup returns a success response confirming state file, lock mechanism, and `claude` CLI are all operational
  2. Calling `cc_health_check` when `claude` is missing from PATH returns a response identifying the specific failure
  3. Calling `cc_list_peers` when a peer has been registered but its session is no longer active flags that peer as potentially stale
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 4: Package Hygiene
**Goal**: The package is ready for `npm publish` and `npx cc-bridge-mcp-server` works in a clean environment
**Depends on**: Phase 2 (tests pass before packaging), Phase 3 (health check tool needs annotations)
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04, PKG-05, PKG-06, PKG-07, PKG-08, PKG-09, PKG-10
**Success Criteria** (what must be TRUE):
  1. Running `npm pack --dry-run` shows only `dist/`, `README.md`, and `LICENSE` in the tarball
  2. Running `npx cc-bridge-mcp-server` in a clean directory (no local clone) starts the MCP server successfully
  3. All 5 tools (plus the new health_check) have correct MCP tool annotations (readOnlyHint, destructiveHint, etc.)
  4. `package.json` contains `bin`, `files`, `prepublishOnly`, `keywords`, `repository`, `homepage`, `bugs` fields and version is `0.1.0`
  5. LICENSE file exists with ISC text, and `.gitignore` excludes `dist/`, `node_modules/`, `.idea/`, and lock files
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

### Phase 5: Documentation and Registry
**Goal**: A new user can install, configure, troubleshoot, and use the bridge by reading the README alone, and the package is listed on the MCP Registry
**Depends on**: Phase 4 (package must be publishable before registry submission)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, REG-01, REG-02, REG-03
**Success Criteria** (what must be TRUE):
  1. README leads with `npx cc-bridge-mcp-server` installation and includes a copy-paste `.mcp.json` configuration example
  2. README documents all `CC_BRIDGE_*` environment variables with defaults, and documents the `cc_health_check` tool
  3. README includes a troubleshooting section covering NVM/PATH issues, state file location, and common error messages
  4. `server.json` metadata file exists per MCP Registry specification
  5. Package is published to npm and MCP Registry submission is completed
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Configuration and Error Hardening | 0/4 | Planning complete | - |
| 2. Test Suite | 0/TBD | Not started | - |
| 3. Health Check and Stale Peer Detection | 0/TBD | Not started | - |
| 4. Package Hygiene | 0/TBD | Not started | - |
| 5. Documentation and Registry | 0/TBD | Not started | - |
