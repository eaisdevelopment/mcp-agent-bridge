# Requirements: cc-bridge-mcp-server

**Defined:** 2026-02-09
**Core Value:** Two Claude Code sessions can exchange messages in real-time while staying fully isolated in their own repos

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Testing

- [ ] **TEST-01**: All 5 tool handlers have unit tests verifying correct input/output via Vitest
- [ ] **TEST-02**: Peer registry service has unit tests covering register, deregister, list, state persistence, and file locking
- [ ] **TEST-03**: CLI service has unit tests with mocked `execFile` covering success, timeout, and error paths
- [ ] **TEST-04**: Full integration test exercises complete workflow (register → send → history → deregister) via InMemoryTransport
- [ ] **TEST-05**: File-based state operations tested with isolated temp directories (no shared /tmp pollution)

### Configuration

- [ ] **CONF-01**: Centralized `config.ts` module validates all configuration via Zod and exports typed config object
- [ ] **CONF-02**: State file path configurable via `CC_BRIDGE_STATE_PATH` env var, defaults to `os.tmpdir()` join
- [ ] **CONF-03**: CLI timeout configurable via `CC_BRIDGE_TIMEOUT_MS` env var, defaults to 120000
- [ ] **CONF-04**: Character limit configurable via `CC_BRIDGE_CHAR_LIMIT` env var, defaults to 25000
- [ ] **CONF-05**: Log level configurable via `CC_BRIDGE_LOG_LEVEL` env var (debug/info/warn/error), defaults to info
- [ ] **CONF-06**: All logging writes to stderr only; stdout remains clean for MCP stdio transport

### Error Handling

- [ ] **ERR-01**: Corrupt state file (invalid JSON) triggers recovery to empty state with stderr warning
- [ ] **ERR-02**: Lock acquisition timeout produces clear MCP error response, never crashes process
- [ ] **ERR-03**: CLI subprocess failure (exit code, stderr, timeout) produces structured error in MCP response
- [ ] **ERR-04**: Missing `claude` CLI binary detected at startup with clear error message
- [ ] **ERR-05**: All async operations have timeout guards; no unhandled promise rejections

### Health Check

- [ ] **HLTH-01**: `cc_health_check` tool verifies state file is readable and writable
- [ ] **HLTH-02**: `cc_health_check` tool verifies lock mechanism works (acquire/release cycle)
- [ ] **HLTH-03**: `cc_health_check` tool verifies `claude` CLI is on PATH and executable

### Stale Peer Detection

- [ ] **PEER-01**: `cc_list_peers` flags peers whose sessions may be stale
- [ ] **PEER-02**: Stale detection uses session validation or TTL-based check

### Package Hygiene

- [ ] **PKG-01**: `package.json` has `bin` field pointing to `dist/index.js`
- [ ] **PKG-02**: `src/index.ts` has `#!/usr/bin/env node` shebang line
- [ ] **PKG-03**: `package.json` has `files` field restricting published content to `["dist", "README.md", "LICENSE"]`
- [ ] **PKG-04**: `package.json` has `prepublishOnly` script running `npm run build`
- [ ] **PKG-05**: LICENSE file exists with ISC license text
- [ ] **PKG-06**: `.gitignore` excludes `dist/`, `node_modules/`, `.idea/`, and build artifacts
- [ ] **PKG-07**: `package.json` has `keywords` for npm discoverability
- [ ] **PKG-08**: `package.json` has `repository`, `homepage`, and `bugs` fields
- [ ] **PKG-09**: Version set to `0.1.0` and single-sourced from `package.json`
- [ ] **PKG-10**: All 5 tools have correct MCP tool annotations (readOnlyHint, destructiveHint, etc.)

### Documentation

- [ ] **DOC-01**: README restructured with npx-first installation instructions
- [ ] **DOC-02**: README includes `.mcp.json` configuration example using npx
- [ ] **DOC-03**: README includes troubleshooting section (NVM/PATH issues, state file location, common errors)
- [ ] **DOC-04**: README documents all `CC_BRIDGE_*` environment variables
- [ ] **DOC-05**: README documents the `cc_health_check` tool

### MCP Registry

- [ ] **REG-01**: `server.json` metadata file created per MCP Registry spec
- [ ] **REG-02**: npm package published and verified
- [ ] **REG-03**: MCP Registry submission completed

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### CI/CD

- **CI-01**: GitHub Actions workflow runs lint + test + build on every PR
- **CI-02**: Status badge in README
- **CI-03**: Windows CI testing for cross-platform validation

### Community

- **COM-01**: CHANGELOG.md following Keep a Changelog format
- **COM-02**: CONTRIBUTING.md with dev setup, testing, and PR process
- **COM-03**: MCP Inspector compatibility documentation in README

### Enhanced Features

- **ENH-01**: Configurable log output format (JSON vs text)
- **ENH-02**: Multi-peer broadcast messaging

## Out of Scope

| Feature | Reason |
|---------|--------|
| HTTP/SSE transport | Core use case is local machine; stdio is simpler and more secure |
| Database-backed storage | File-based JSON is sufficient for 2-3 peer local use case |
| Authentication/authorization | Runs locally via stdio; filesystem permissions are sufficient |
| Web UI dashboard | MCP Inspector already provides visual interface; scope explosion |
| Plugin/middleware system | Codebase is small enough to fork-and-modify |
| Automatic peer discovery | Explicit registration is two tool calls; not burdensome |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 2 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 2 | Pending |
| TEST-05 | Phase 2 | Pending |
| CONF-01 | Phase 1 | Pending |
| CONF-02 | Phase 1 | Pending |
| CONF-03 | Phase 1 | Pending |
| CONF-04 | Phase 1 | Pending |
| CONF-05 | Phase 1 | Pending |
| CONF-06 | Phase 1 | Pending |
| ERR-01 | Phase 1 | Pending |
| ERR-02 | Phase 1 | Pending |
| ERR-03 | Phase 1 | Pending |
| ERR-04 | Phase 1 | Pending |
| ERR-05 | Phase 1 | Pending |
| HLTH-01 | Phase 3 | Pending |
| HLTH-02 | Phase 3 | Pending |
| HLTH-03 | Phase 3 | Pending |
| PEER-01 | Phase 3 | Pending |
| PEER-02 | Phase 3 | Pending |
| PKG-01 | Phase 4 | Pending |
| PKG-02 | Phase 4 | Pending |
| PKG-03 | Phase 4 | Pending |
| PKG-04 | Phase 4 | Pending |
| PKG-05 | Phase 4 | Pending |
| PKG-06 | Phase 4 | Pending |
| PKG-07 | Phase 4 | Pending |
| PKG-08 | Phase 4 | Pending |
| PKG-09 | Phase 4 | Pending |
| PKG-10 | Phase 4 | Pending |
| DOC-01 | Phase 5 | Pending |
| DOC-02 | Phase 5 | Pending |
| DOC-03 | Phase 5 | Pending |
| DOC-04 | Phase 5 | Pending |
| DOC-05 | Phase 5 | Pending |
| REG-01 | Phase 5 | Pending |
| REG-02 | Phase 5 | Pending |
| REG-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after roadmap creation*
