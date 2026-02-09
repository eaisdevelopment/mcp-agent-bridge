# Project Research Summary

**Project:** cc-bridge-mcp-server
**Domain:** MCP Server / Inter-Agent Communication Bridge
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

This is an MCP server that enables communication between two Claude Code instances through a file-based state registry and CLI subprocess relay. The project needs to transition from a working prototype to a community-distributable npm package. The research reveals that while the core functionality is solid, publication-critical infrastructure is entirely missing: no test suite, no npm packaging fields (`bin`, `files`, `prepublishOnly`), hardcoded `/tmp` paths that break Windows, and file-locking patterns that can poison the system on crash.

The recommended approach is to build backwards from publication requirements. Start with test infrastructure (Vitest with InMemoryTransport for MCP protocol testing, memfs for filesystem mocking) and a configuration layer to replace hardcoded values. Then harden the code against the six critical pitfalls identified (mocked subprocess testing, npm packaging, cross-platform paths, NVM/npx issues, lock recovery, and MCP registry requirements). Finally, add the missing publication artifacts (LICENSE, proper .gitignore, documentation restructured for npx users). The technical stack is already appropriate: @modelcontextprotocol/sdk v1.26.0, TypeScript 5.7+, Node 18+, and Zod 3.x. No technology changes needed.

Key risks are publication pitfalls that make the package non-functional for users (no `dist/` in tarball, Windows crashes, lock poisoning) and testing anti-patterns that block CI development (mocked `execFile` promises that never resolve). Both are avoidable with proper npm packaging verification (`npm pack --dry-run`), injectable configuration for tests, and following MCP SDK testing patterns (InMemoryTransport, not subprocess spawning).

## Key Findings

### Recommended Stack

The existing stack is production-ready with no changes needed. The project already uses the correct foundation: @modelcontextprotocol/sdk v1.26.0 (latest stable, don't migrate to unpublished v2), TypeScript 5.7, Node 18+, and Zod 3.23. What's missing is the testing and publishing layer.

**Core technologies:**
- **@modelcontextprotocol/sdk ^1.26.0:** Official MCP server framework - only TypeScript SDK available, v1.26 is latest stable
- **Vitest ^4.0.18:** Native ESM test runner - standard for TypeScript projects, built-in mocking, no config gymnastics
- **@vitest/coverage-v8 ^4.0.18:** V8-native coverage - zero-config, must match Vitest version exactly
- **memfs ^4.56.10:** In-memory filesystem for tests - required to mock file operations without touching disk
- **tsup ^8.5.1:** Bundler for npm distribution - produces single-file ESM with shebang, smaller and faster than raw `tsc` output
- **Zod ^3.23.8:** Schema validation - already a dependency via MCP SDK peer dep, working correctly

**Critical for publication:**
- **MCP Inspector @0.19.0:** Interactive debugging tool (`npx @modelcontextprotocol/inspector`) - for manual smoke testing
- **mcp-publisher CLI:** Required for official MCP Registry listing - install via Homebrew, publish after npm

### Expected Features

The research distinguishes table-stakes features (users expect them, will open issues if missing) from differentiators (competitive advantages) and anti-features (commonly requested but problematic).

**Must have (table stakes):**
- **Executable via npx:** `bin` field + shebang + `prepublishOnly` - without this, users can't run the server at all
- **Cross-platform state path:** `os.tmpdir()` default, `CC_BRIDGE_STATE_DIR` env override - hardcoded `/tmp` breaks Windows
- **Configurable timeouts/limits:** ENV vars for CLI timeout and character limit - users with slow systems need to adjust
- **Test suite:** Vitest with unit and integration tests - community contributors expect tests, CI requires them
- **Clean npm package:** `files` field to exclude source, proper .gitignore - publishing everything leaks source and bloats package
- **LICENSE file:** Required for npm publish - ISC declared but no file exists
- **Structured stderr logging:** Debug/info/warn/error levels gated by `CC_BRIDGE_LOG_LEVEL` - users troubleshooting need diagnostic output
- **Graceful error handling:** All async paths wrapped with recovery - corrupt state file, lock timeout, CLI errors must not crash
- **README for npx users:** Installation via `npx` first, local dev second - current README assumes git clone

**Should have (competitive):**
- **CI pipeline:** GitHub Actions lint+test+build - shows maintenance, quality badge in README
- **Health check tool:** `cc_health_check` validates state file, locking, `claude` CLI availability - dramatically reduces "why doesn't it work" issues
- **MCP Inspector docs:** Document testing with Inspector - no other MCP server does this, improves debuggability
- **Config module:** Single `config.ts` with Zod validation - centralizes env vars, fails fast on bad config
- **CHANGELOG.md:** Communicates version changes - MCP Registry recommends, signals maturity

**Defer (v2+):**
- **Stale peer cleanup:** Auto-detect inactive sessions - defer until multi-peer usage patterns observed
- **MCP Registry listing:** Official registry visibility - submit after package stable (v1.0+)
- **Full Windows CI testing:** Test on Windows in CI - defer until Windows user demand confirmed

**Explicitly avoid (anti-features):**
- **HTTP/SSE transport:** Adds auth, CORS, deployment complexity - core use case is two local processes
- **Multi-peer broadcast:** Fan-out messaging increases complexity - 1:1 messaging covers the need
- **Database storage:** SQLite/Redis adds dependencies - file-based JSON sufficient for 2-3 peers
- **Web UI dashboard:** Scope explosion - MCP Inspector already provides visual testing

### Architecture Approach

The architecture follows standard MCP server layering: server entry point, tool handler layer, services layer (peer-registry for state, cc-cli for subprocess relay), and external I/O (filesystem, `claude` CLI). The key insight is that testing requires making the services layer injectable rather than module-level constants.

**Major components:**
1. **InMemoryTransport pattern:** SDK provides `InMemoryTransport.createLinkedPair()` for in-process client-server testing without stdio - enables integration tests that validate full tool lifecycle
2. **Config layer:** New `config.ts` with Zod-validated env vars replaces hardcoded paths/timeouts - enables cross-platform defaults and test isolation with temp directories
3. **npm packaging structure:** Entry point with shebang, `bin` field, `files` whitelist, `prepublishOnly` hook - standard pattern for MCP servers published to npm
4. **Test directory separation:** `tests/` separate from `src/` with unit/integration split - prevents test compilation into `dist/`, keeps published package clean

**Key patterns:**
- Use `InMemoryTransport` for integration tests, not subprocess spawning
- Mock `execFile` by providing factory that calls callback synchronously: `vi.fn((cmd, args, opts, cb) => cb(null, "stdout", ""))`
- Separate `tsconfig.build.json` (excludes tests) from base `tsconfig.json` (includes tests for IDE)
- File-based state at `os.tmpdir()` is sufficient for 2-3 peers, only scale to SQLite if 10+ peers

### Critical Pitfalls

Six pitfalls can make the package non-functional for users if not addressed before publication.

1. **Vitest mocked `execFile` promises hang indefinitely** - The Promise-wrapped `execFile` callback can't be settled by `vi.mock()` because the mock has no access to the `resolve`/`reject` closures. Use a factory mock that calls the callback synchronously: `vi.fn((cmd, args, opts, cb) => cb(null, "stdout", ""))`.

2. **Missing npm packaging fields publish broken package** - Without `bin`, `files`, `prepublishOnly`, and shebang, the published package either contains no `dist/` or can't be executed via npx. Verify with `npm pack --dry-run` before publishing. Add all four fields and test with `npx` in a clean directory.

3. **Hardcoded `/tmp` breaks Windows and multi-user** - Windows has no `/tmp` directory (crashes with `ENOENT`), macOS periodically purges `/tmp`, multi-user systems cause peer ID collisions. Use `os.tmpdir()` as default, allow override via `CC_BRIDGE_STATE_DIR` env var.

4. **`npx` with NVM causes spawn ENOENT** - Most MCP clients (Claude Desktop, VS Code, JetBrains) don't inherit shell environment, so NVM-provided `npx` is not on PATH. Document absolute-path configs in README with examples for each major MCP client.

5. **Stale lock file poisons system after crash** - If killed with SIGKILL or crash during locked operation, lock file persists. PID reuse or cross-user locks prevent all instances from working. Add SIGINT/SIGTERM handlers to release lock, check lock file age, consider `proper-lockfile` npm package.

6. **MCP Registry namespace validation rejected** - Registry requires reverse-DNS namespace (`io.github.username/server-name`), GitHub/domain verification, `server.json` with correct schema, and public npm package. Create `server.json` early, publish to npm first, then submit to registry.

## Implications for Roadmap

Based on research, the roadmap should be organized into four phases: testing infrastructure, npm publication preparation, hardening and CI, and registry publication. This order is dictated by dependencies - you can't write integration tests without InMemoryTransport setup, can't publish to npm without packaging fields, can't list on registry without npm publication.

### Phase 1: Testing Infrastructure
**Rationale:** Tests are the foundation for confident refactoring and CI. Without a working test infrastructure, we can't validate any subsequent changes. The research identified specific testing anti-patterns (subprocess spawning, co-located tests) and solutions (InMemoryTransport, separate test directory, memfs mocking) that must be implemented first.

**Delivers:**
- Vitest configured with separate `tests/` directory
- Test helpers (`createTestServer`, temp state paths, fixtures)
- Unit tests for services with mocked fs/subprocess
- Integration tests using InMemoryTransport
- Coverage reporting via @vitest/coverage-v8

**Addresses features:**
- TS-6: Automated test suite (table stakes)
- Foundation for D-2: CI pipeline (differentiator)
- Foundation for D-9: Integration test suite

**Avoids pitfalls:**
- Pitfall 1: Mock `execFile` correctly in tests (callback factory pattern)
- Anti-pattern 2: Tests separate from `src/`, not compiled into `dist/`
- Anti-pattern 3: Use InMemoryTransport, not subprocess spawning

### Phase 2: Configuration and Cross-Platform Support
**Rationale:** Must come before npm publication because hardcoded paths are a launch blocker for Windows users. The config layer is also a prerequisite for test isolation (each test gets its own temp state path).

**Delivers:**
- `config.ts` with Zod validation
- Environment variables: `CC_BRIDGE_STATE_DIR`, `CC_BRIDGE_CLI_TIMEOUT_MS`, `CC_BRIDGE_CHAR_LIMIT`, `CC_BRIDGE_LOG_LEVEL`
- Refactor `peer-registry.ts` and `cc-cli.ts` to accept config
- Structured stderr logging (debug/info/warn/error levels)
- Tests use temp directories, no `/tmp` pollution

**Addresses features:**
- TS-8: Configurable state file path (table stakes)
- TS-9: Configurable timeouts/limits (table stakes)
- TS-10: stderr-only logging (table stakes)
- D-7: Type-safe configuration module (differentiator)
- D-8: Cross-platform state path defaults (differentiator)

**Avoids pitfalls:**
- Pitfall 3: Cross-platform paths (launch blocker)
- Anti-pattern 4: No more hardcoded `/tmp` in tests

### Phase 3: npm Publication Preparation
**Rationale:** These are the minimum fields and files required so `npx cc-bridge-mcp-server` works. Can be developed in parallel with Phase 2 since there are no dependencies, but must be completed before first npm publish.

**Delivers:**
- Shebang in `src/index.ts`
- `package.json` updates: `bin`, `files`, `prepublishOnly`, `keywords`, `repository`, `homepage`, `bugs`
- `LICENSE` file (ISC)
- `.gitignore` proper (excludes `dist/`, `node_modules/`, `.idea/`, lock files)
- Remove tracked artifacts (`dist/`, `.idea/`) from git
- README restructured: npx install first, local dev second
- Verification: `npm pack --dry-run` + `npx` test in clean directory

**Addresses features:**
- TS-1: bin + shebang (table stakes)
- TS-2: files field (table stakes)
- TS-3: prepublishOnly (table stakes)
- TS-4: LICENSE file (table stakes)
- TS-12: README with npx instructions (table stakes)
- TS-13: .gitignore (table stakes)
- TS-14: keywords (table stakes)
- TS-15: repository/homepage (table stakes)

**Avoids pitfalls:**
- Pitfall 2: npm packaging fields (entire launch blocker)
- Pitfall 4: Document absolute-path configs for NVM users in README

### Phase 4: Hardening and Error Recovery
**Rationale:** These are the defenses against edge cases that cause support burden. Should be completed before first stable release (v1.0.0), but can come after initial publication (v0.1.0) if needed to ship sooner.

**Delivers:**
- SIGINT/SIGTERM handlers to release lock on shutdown
- Lock file age check (stale if older than CLI_TIMEOUT_MS)
- Startup check for `claude` CLI with clear error message
- Graceful error handling on all async paths (JSON parse, lock timeout, execFile failures)
- Input validation: peer ID regex, resolved `cwd` path
- File permissions `0o600` on state file creation
- Optional: Replace hand-rolled locking with `proper-lockfile` package

**Addresses features:**
- TS-11: Graceful error handling (table stakes)
- D-3: Health check tool (differentiator) - can be added here or later

**Avoids pitfalls:**
- Pitfall 5: Lock file poisoning (high support burden)
- Security: World-readable state file, path traversal in cwd

### Phase 5: CI and Registry Publication
**Rationale:** CI requires tests (Phase 1) and npm packaging (Phase 3). Registry requires npm publication. This phase finalizes the project for community distribution.

**Delivers:**
- GitHub Actions workflow: `npm ci && npm run build && npm test`
- Status badge in README
- `server.json` with correct MCP registry schema
- Namespace: `io.github.<username>/cc-bridge-mcp-server`
- MCP Registry submission after npm v1.0.0
- CHANGELOG.md (maintain from v0.2.0+)
- CONTRIBUTING.md

**Addresses features:**
- D-2: CI pipeline (differentiator)
- D-10: MCP Registry listing (differentiator)
- D-5: CHANGELOG (differentiator)
- D-6: CONTRIBUTING (differentiator)

**Avoids pitfalls:**
- Pitfall 6: MCP Registry namespace validation

### Phase Ordering Rationale

- **Testing first (Phase 1):** You can't refactor or harden without tests. The mocked subprocess pattern must be solved before writing tool tests.
- **Config before publication (Phase 2):** Cross-platform paths are a launch blocker. Config layer is also needed for test isolation.
- **npm packaging before hardening (Phase 3):** Can ship v0.1.0 with Phase 1-3, defer Phase 4 to v0.2.x if needed to ship faster.
- **Hardening before v1.0 (Phase 4):** Lock poisoning and missing `claude` CLI cause support burden, but not launch blockers.
- **CI and registry last (Phase 5):** Depends on everything else. Registry publication is the final milestone.

### Research Flags

**Phases needing deeper research during planning:**
- **None** - The project is straightforward enough that detailed implementation can proceed directly from research findings. All patterns are well-documented.

**Phases with standard patterns (skip research-phase):**
- **All phases** - Testing (Vitest + InMemoryTransport), npm packaging (official MCP template patterns), config (Zod validation), CI (GitHub Actions standard), and registry (official docs) all have established patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Verified against npm registry, Context7 SDK docs, installed SDK package. All versions confirmed stable and published. v2 SDK status verified (unpublished). |
| Features | **HIGH** | Cross-referenced against official MCP docs, published server patterns, and community best practices. Table stakes validated via multiple sources. |
| Architecture | **HIGH** | InMemoryTransport verified in installed SDK. npm packaging patterns verified against official `create-typescript-server` template. Vitest config patterns confirmed via Context7. |
| Pitfalls | **HIGH** | All six critical pitfalls verified via official issue trackers (MCP servers repo), npm documentation, and technical articles. Known issues with NVM confirmed across multiple MCP clients. |

**Overall confidence:** **HIGH**

The research is comprehensive and actionable. All recommendations are based on verified sources (official docs, installed packages, issue trackers). No significant gaps requiring additional research.

### Gaps to Address

**Minor gaps (handle during implementation):**

- **Lock recovery mechanism:** Research identified the problem (PID reuse, EPERM) and recommended `proper-lockfile` package, but didn't verify compatibility with the current locking approach. Decision: Try `proper-lockfile` first; if integration is complex, implement lock file age check as minimal fix.

- **tsup vs tsdown:** Research notes tsdown is emerging but tsup is stable. Decision: Use tsup for v1.0, monitor tsdown adoption, revisit in 6-12 months if ecosystem shifts.

- **Zod 4 migration:** SDK v1.26 peer dep accepts Zod 4, but current project uses 3.23. Research recommends staying on 3.x. Decision: Defer until SDK v2 migration or clear pain point emerges.

- **MCP SDK v2 timeline:** Research confirms v2 monorepo exists but packages not published to npm. Decision: Stay on v1.26.x, monitor SDK releases, migrate after v2 is stable and published.

All gaps have clear decision paths and don't block immediate implementation.

## Sources

### Primary (HIGH confidence)
- **npm registry** - Direct `npm view` queries for package versions, peer dependencies, publish dates
- **Context7 `/modelcontextprotocol/typescript-sdk`** - SDK architecture, McpServer API, InMemoryTransport patterns
- **Context7 `/vitest-dev/vitest`** - Mocking patterns, memfs integration, vi.mock API, configuration
- **Installed SDK package** (`node_modules/@modelcontextprotocol/sdk`) - Verified InMemoryTransport existence and API
- **Official MCP docs** (modelcontextprotocol.io) - Server development guide, registry requirements, Inspector usage
- **MCP TypeScript SDK repo** (github.com/modelcontextprotocol/typescript-sdk) - Release notes, v2 status
- **Official MCP servers repo** (github.com/modelcontextprotocol/servers) - Issue #64 (NVM problems), reference implementations
- **Official MCP Registry repo** (github.com/modelcontextprotocol/registry) - server.json schema documentation
- **npm documentation** (docs.npmjs.com) - `files` field, bin scripts, prepublishOnly hook

### Secondary (MEDIUM confidence)
- **MCP Best Practice Guide** (mcp-best-practice.github.io) - Testing layers, observability patterns
- **MCP Server Development Guide** (github.com/cyanheads/model-context-protocol-resources) - Production checklist
- **mcpcat.io unit testing guide** - InMemoryTransport patterns, Vitest integration
- **Multiple blog posts** - npm publication workflow, dynamic configuration, debugging strategies
- **Glama MCP Registry Requirements** - Namespace verification, metadata limits

### Tertiary (LOW confidence)
- **Vitest GitHub Discussion #2075** - Mocking child_process gotchas (community discussion, not official docs)
- **Gist on mocking execFile** - Callback promise wrapping issue (single developer's experience)

All tertiary sources were cross-verified against official documentation or package behavior before inclusion in recommendations.

---
*Research completed: 2026-02-09*
*Ready for roadmap: yes*
