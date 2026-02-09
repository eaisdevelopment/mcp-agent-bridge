# Feature Research

**Domain:** MCP server publication (npm, GitHub, MCP Registry) -- production-readiness features for community distribution
**Researched:** 2026-02-09
**Confidence:** HIGH (verified against official MCP docs, SDK source, registry requirements, and published server patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = users leave, open issues, or choose alternatives.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **TS-1: `bin` field + shebang** | Users expect `npx cc-bridge-mcp-server` to work. Every published MCP server on npm has a `bin` field mapping to the entry point, with `#!/usr/bin/env node` shebang. Without this, the server is unusable via npx and Claude Desktop config. | LOW | Add shebang to `src/index.ts`, add `"bin"` to `package.json`, add post-build `chmod 755`. Currently missing entirely. |
| **TS-2: `files` field in package.json** | Without `"files": ["dist"]`, npm publishes everything including `src/`, `.planning/`, IDE configs. Users expect a clean, minimal package. All official MCP servers use this. | LOW | Add `"files": ["dist", "README.md", "LICENSE"]` to `package.json`. |
| **TS-3: `prepublishOnly` build script** | Prevents publishing broken/stale builds. Standard npm practice. The `prepublishOnly` hook runs `npm run build` before `npm publish`. | LOW | Add `"prepublishOnly": "npm run build"` to scripts. |
| **TS-4: LICENSE file** | npm warns on publish without a license file. GitHub displays it prominently. ISC is already declared in package.json but no LICENSE file exists. | LOW | Create `LICENSE` file with ISC text. |
| **TS-5: Semantic versioning** | MCP Registry recommends semver. npm requires it. Users and tooling depend on version meaning. Currently hardcoded `1.0.0` in both `package.json` and `constants.ts` -- version must be single-sourced. | LOW | Single-source version from `package.json` at build or runtime. Consider starting at `0.1.0` for initial publication (signals pre-stable). |
| **TS-6: Automated test suite** | Community contributors expect tests. CI requires them. Without tests, PRs are ungated and regressions go undetected. MCP SDK supports in-memory testing via `InMemoryTransport` for fast, deterministic tests. | MEDIUM | Vitest + `@modelcontextprotocol/sdk` InMemoryTransport. Test each tool handler. Mock `execFile` for CLI tests. Test file-locking behavior. |
| **TS-7: Input validation error messages** | Zod validation exists but error messages from schema failures are raw Zod output. Users expect clear, actionable error messages explaining what went wrong. | LOW | Already using Zod schemas. Review that Zod `.describe()` strings are user-facing quality. Add custom error maps if needed. |
| **TS-8: Configurable state file path** | Hardcoded `/tmp/cc-bridge-state.json` fails on Windows (`/tmp` does not exist) and is surprising on multi-user systems. Every production MCP server with local state uses env vars or XDG-standard paths. | MEDIUM | Support `CC_BRIDGE_STATE_PATH` env var, default to `os.tmpdir()` + filename (cross-platform). Document in README. |
| **TS-9: Configurable timeouts/limits** | Hardcoded `CLI_TIMEOUT_MS=120000` and `CHARACTER_LIMIT=25000`. Users with slow systems or large contexts need to adjust these. Environment-variable configuration is the standard MCP pattern. | LOW | Support `CC_BRIDGE_TIMEOUT_MS` and `CC_BRIDGE_CHAR_LIMIT` env vars, falling back to current defaults. |
| **TS-10: stderr-only logging** | Currently uses `console.error` correctly for startup. But no structured logging for operations (peer registration, message send, lock acquire/release). Users troubleshooting expect diagnostic output on stderr. MCP official guidance: "Never write to stdout" for stdio servers. | MEDIUM | Add structured stderr logging with levels (debug/info/warn/error). Gate verbose logging behind `CC_BRIDGE_LOG_LEVEL` env var. Keep stdout completely clean. |
| **TS-11: Graceful error handling on all paths** | `execFile` errors, lock timeouts, state file corruption, JSON parse failures -- all must produce clear MCP error responses, never crash the process. Current code handles some but not all edge cases (e.g., corrupt state file = unhandled JSON parse error). | MEDIUM | Wrap `readState` JSON.parse in try/catch with recovery (reset to empty state + warn). Add timeout to all async operations. Ensure no unhandled promise rejections. |
| **TS-12: README with installation via npx** | Users expect a README showing: (1) npx one-liner, (2) `.mcp.json` config snippet, (3) tool descriptions, (4) troubleshooting. Current README is detailed but assumes local clone. Published packages need npx-first documentation. | LOW | Restructure README: npx install first, local dev second. Add `.mcp.json` example using `npx`. |
| **TS-13: `.gitignore` for dist/ and IDE files** | Currently staging `dist/` and `.idea/` in git. Published projects exclude build artifacts. Users cloning the repo expect `npm run build` to generate dist, not find stale artifacts. | LOW | Add `.gitignore` with `dist/`, `node_modules/`, `.idea/`. Remove tracked artifacts. |
| **TS-14: `keywords` in package.json** | npm search discovery depends on keywords. MCP servers conventionally use `["mcp", "modelcontextprotocol", "claude", "ai"]` plus domain-specific terms. | LOW | Add `"keywords": ["mcp", "modelcontextprotocol", "claude-code", "claude", "ai", "inter-agent", "bridge", "communication"]`. |
| **TS-15: `repository` and `homepage` in package.json** | npm package page links to source. Without `repository` field, the npm page has no "Repository" link, making the package look unofficial. | LOW | Add `"repository"`, `"homepage"`, `"bugs"` fields pointing to GitHub URL. |
| **TS-16: Tool annotations** | Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) tell clients about tool behavior. `send-message` has them; verify all tools have correct annotations. Clients like Claude Desktop use these for safety UX. | LOW | Audit all 5 tools. `list-peers` and `get-history` should be `readOnlyHint: true`. `register-peer` is not destructive. Ensure consistency. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but create notably better DX or adoption.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **D-1: MCP Inspector compatibility documentation** | The MCP Inspector (`npx @modelcontextprotocol/inspector`) is the standard debugging tool. Documenting how to test cc-bridge with the Inspector (including both server processes) dramatically improves debuggability for users and contributors. No competitor does this. | LOW | Add "Testing with MCP Inspector" section to README. |
| **D-2: CI pipeline (GitHub Actions)** | Automated lint + test + build on every PR. Shows the project is maintained. Badge in README signals quality. Most popular MCP servers have CI; many smaller ones don't. | MEDIUM | GitHub Actions workflow: `npm ci && npm run build && npm test`. Add status badge to README. |
| **D-3: `cc_health_check` tool** | A tool that verifies: state file accessible, lock mechanism working, `claude` CLI on PATH and functional. No other MCP server provides a self-diagnostic tool. Dramatically reduces "why isn't it working?" issues. | MEDIUM | New tool that returns structured health status. Validates file I/O, lock acquire/release cycle, and `which claude`. |
| **D-4: Automatic stale peer cleanup** | Peers whose sessions are no longer active linger in state forever. Auto-detecting stale peers (optional, on list-peers or on a TTL basis) prevents confusion. | MEDIUM | On `list-peers`, optionally check if session is still valid (via `claude --resume <id> -p "ping"` or process check). Flag stale peers in response. |
| **D-5: CHANGELOG.md** | Communicates what changed between versions. MCP Registry recommends comprehensive changelogs. Signals project maturity and active maintenance. | LOW | Create CHANGELOG.md following Keep a Changelog format. Maintain from v0.1.0 forward. |
| **D-6: CONTRIBUTING.md** | Lowers barrier for community contributions. Tells contributors: how to set up dev environment, run tests, submit PRs. GitHub displays prominently on "New Issue" / "New PR" pages. | LOW | Standard contributing guide: clone, install, build, test, PR process. |
| **D-7: Type-safe configuration module** | Instead of scattered `process.env` reads, a single `config.ts` module that validates env vars at startup, provides typed defaults, and fails fast with clear messages for invalid configuration. | LOW | Centralize env var reading in `config.ts`. Validate and export typed config object. Import from all modules. |
| **D-8: Cross-platform state path defaults** | Default to `os.tmpdir()` instead of hardcoded `/tmp`. Enables Windows support without user configuration. Most community MCP servers are macOS/Linux-only; cross-platform is a differentiator. | LOW | Already needed for TS-8, but going further: document Windows compatibility, test on Windows in CI (optional). |
| **D-9: Integration test with real MCP client** | End-to-end test that creates a real `McpServer` + `Client` via InMemoryTransport, calls tools in sequence (register -> send -> history -> deregister), verifying the full workflow. More thorough than unit tests alone. | MEDIUM | Uses `@modelcontextprotocol/sdk` Client + InMemoryTransport. Tests complete workflow in a single test. Mock only `execFile`. |
| **D-10: MCP Registry listing** | Listing on the official MCP Registry (registry.modelcontextprotocol.io) gives visibility to users browsing for MCP servers. Requires: npm package published, server.json metadata, namespace verification. | MEDIUM | Prepare `server.json` metadata. Follow MCP Registry submission process. Requires npm publication first. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **AF-1: HTTP/SSE transport** | "I want to run this as a remote service." | Adds authentication, CORS, security surface, deployment complexity. The core use case is two local CC instances on the same machine. Stdio transport is simpler, more secure, and what Claude Code's `.mcp.json` expects. | Keep stdio-only. Document that this is a local-machine tool. If remote is ever needed, it's a separate project. |
| **AF-2: Multi-peer broadcast** | "I want to send a message to all peers at once." | Increases complexity (fan-out, partial failure handling, response aggregation). The 2-peer use case covers the primary need. Broadcast encourages noisy communication patterns. | Keep 1:1 messaging. Users can send sequential messages if needed. |
| **AF-3: Database-backed storage** | "File-based JSON doesn't scale." | True, but this is a 2-peer local tool. SQLite or Redis adds dependencies, installation complexity, and cross-platform issues. JSON file with locking is sufficient for the use case. | Keep file-based. Document the scaling limits (500 messages, 2-3 peers). If someone needs more, they can fork. |
| **AF-4: Authentication/authorization** | "Peers should authenticate." | The tool runs locally via stdio. Access is controlled by filesystem permissions. Adding auth increases setup friction for zero security benefit in the local use case. | Rely on OS filesystem permissions. Document security model in README. |
| **AF-5: Web UI dashboard** | "I want to see peer status and message history in a browser." | Scope explosion. Requires HTTP server, frontend framework, WebSocket for live updates. The MCP Inspector already provides a visual interface for testing. CLI-first users prefer `cc_get_history` and `cc_list_peers`. | Point users to MCP Inspector for visual debugging. Tools already provide all information programmatically. |
| **AF-6: Plugin/middleware system** | "Let me extend the server with custom tools." | Over-engineering for a focused tool. Plugin systems need API stability commitments, documentation, security review. The codebase is small enough to fork-and-modify. | Keep the codebase simple and forkable. Document architecture clearly so others can extend. |
| **AF-7: Automatic peer discovery** | "Peers should find each other without manual registration." | Requires network scanning, mDNS, or filesystem watchers. Fragile, platform-specific, and not significantly easier than explicit registration. | Keep explicit `cc_register_peer`. It's two tool calls per session -- not burdensome. |

## Feature Dependencies

```
[TS-1: bin + shebang]
    |
    v
[TS-2: files field] -----> [TS-3: prepublishOnly] -----> npm publish
    |                                                         |
    v                                                         v
[TS-12: README npx docs]                              [D-10: MCP Registry listing]
                                                              ^
                                                              |
[TS-14: keywords] -----> [TS-15: repository/homepage] -------+

[TS-13: .gitignore] -----> GitHub release (clean repo)

[TS-8: configurable state path]
    |
    +-----> [D-7: config module] <----- [TS-9: configurable timeouts]
    |                                         |
    v                                         v
[D-8: cross-platform defaults]         [TS-10: stderr logging]

[TS-6: test suite]
    |
    +-----> [D-2: CI pipeline]
    |
    +-----> [D-9: integration test]

[TS-11: error handling] -----> [D-3: health check tool]

[TS-4: LICENSE] -----> [D-6: CONTRIBUTING.md]

[TS-5: semver] -----> [D-5: CHANGELOG.md]
```

### Dependency Notes

- **npm publication requires TS-1, TS-2, TS-3, TS-4, TS-5, TS-14, TS-15:** These are the minimum package.json and repo hygiene for `npm publish` to produce a usable, discoverable package.
- **MCP Registry (D-10) requires npm publication:** The registry links to npm packages; must be published first.
- **CI (D-2) requires tests (TS-6):** No point in CI without a test suite to run.
- **Config module (D-7) consolidates TS-8 and TS-9:** Building a single config module is more maintainable than scattered `process.env` reads.
- **Health check (D-3) benefits from error handling (TS-11):** The health check tool validates the same error paths that TS-11 hardens.
- **Integration test (D-9) requires test suite (TS-6):** Uses the same test infrastructure.

## MVP Definition

### Launch With (v0.1.0 -- npm + GitHub)

Minimum viable published package -- what's needed so `npx cc-bridge-mcp-server` works and users trust the package.

- [x] **TS-1: bin + shebang** -- Without this, npx doesn't work at all
- [x] **TS-2: files field** -- Clean package, no source/IDE leak
- [x] **TS-3: prepublishOnly** -- Prevent stale build publication
- [x] **TS-4: LICENSE** -- npm publish warning, legal requirement
- [x] **TS-5: Semver (start at 0.1.0)** -- Signal pre-stable, single-source version
- [x] **TS-6: Automated test suite (core)** -- At least tool handler unit tests and a basic integration test
- [x] **TS-8: Configurable state path** -- Cross-platform support via env var
- [x] **TS-12: README restructured for npx** -- Install instructions for the published use case
- [x] **TS-13: .gitignore** -- Clean repo on GitHub
- [x] **TS-14: keywords** -- npm discoverability
- [x] **TS-15: repository/homepage** -- npm page links to source
- [x] **D-7: Config module** -- Centralize env vars (supports TS-8, TS-9, TS-10)

### Add After Validation (v0.2.x)

Features to add once the core package is published and initial users provide feedback.

- [ ] **TS-9: Configurable timeouts/limits** -- Add when users report timeout issues
- [ ] **TS-10: Structured stderr logging** -- Add when debugging reports come in
- [ ] **TS-11: Hardened error handling** -- Add when edge-case crash reports surface
- [ ] **TS-16: Tool annotations audit** -- Add when clients start using annotations for UX
- [ ] **D-1: MCP Inspector docs** -- Add when contributor interest emerges
- [ ] **D-2: CI pipeline** -- Add after test suite is stable
- [ ] **D-3: Health check tool** -- Add when "it doesn't work" issues pile up
- [ ] **D-5: CHANGELOG.md** -- Start maintaining from v0.2.0
- [ ] **D-6: CONTRIBUTING.md** -- Add when external PRs arrive

### Future Consideration (v1.0+)

Features to defer until product-market fit is established.

- [ ] **D-4: Stale peer cleanup** -- Defer until multi-peer usage patterns are observed
- [ ] **D-8: Windows CI testing** -- Defer until Windows user demand is confirmed
- [ ] **D-9: Full integration test suite** -- Defer comprehensive scenario testing until API is stable
- [ ] **D-10: MCP Registry listing** -- Submit after package is stable and documented

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS-1: bin + shebang | HIGH | LOW | **P1** |
| TS-2: files field | HIGH | LOW | **P1** |
| TS-3: prepublishOnly | HIGH | LOW | **P1** |
| TS-4: LICENSE | HIGH | LOW | **P1** |
| TS-5: Semver | HIGH | LOW | **P1** |
| TS-13: .gitignore | HIGH | LOW | **P1** |
| TS-14: keywords | MEDIUM | LOW | **P1** |
| TS-15: repository/homepage | MEDIUM | LOW | **P1** |
| D-7: Config module | HIGH | LOW | **P1** |
| TS-8: Configurable state path | HIGH | MEDIUM | **P1** |
| TS-12: README restructured | HIGH | LOW | **P1** |
| TS-6: Test suite | HIGH | MEDIUM | **P1** |
| TS-7: Validation error messages | MEDIUM | LOW | **P2** |
| TS-9: Configurable timeouts | MEDIUM | LOW | **P2** |
| TS-10: Structured logging | MEDIUM | MEDIUM | **P2** |
| TS-11: Error handling hardening | HIGH | MEDIUM | **P2** |
| TS-16: Tool annotations | LOW | LOW | **P2** |
| D-1: Inspector docs | MEDIUM | LOW | **P2** |
| D-2: CI pipeline | MEDIUM | MEDIUM | **P2** |
| D-3: Health check tool | MEDIUM | MEDIUM | **P2** |
| D-5: CHANGELOG | LOW | LOW | **P2** |
| D-6: CONTRIBUTING | LOW | LOW | **P2** |
| D-4: Stale peer cleanup | LOW | MEDIUM | **P3** |
| D-8: Windows CI | LOW | MEDIUM | **P3** |
| D-9: Full integration tests | MEDIUM | MEDIUM | **P3** |
| D-10: MCP Registry | MEDIUM | MEDIUM | **P3** |

**Priority key:**
- **P1:** Must have for initial publication (v0.1.0)
- **P2:** Should have, add in v0.2.x
- **P3:** Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Official MCP Servers (filesystem, etc.) | Agent Collaboration MCP Server (FastMCP) | cc-bridge (current) | Our Plan |
|---------|----------------------------------------|------------------------------------------|---------------------|----------|
| npx support | Yes (bin + shebang) | Yes | No | P1: Add bin + shebang |
| Test suite | Some (reference implementations) | Unclear | No tests | P1: Vitest + InMemoryTransport |
| Environment variable config | Yes (e.g., allowed directories) | Yes | No (all hardcoded) | P1: Config module + env vars |
| Tool annotations | Yes (all tools annotated) | Varies | Partial (send-message only) | P2: Audit all tools |
| Cross-platform | Yes (uses os.tmpdir) | Yes | No (hardcoded /tmp) | P1: os.tmpdir default |
| CI pipeline | Yes (GitHub Actions) | Varies | No | P2: GitHub Actions |
| MCP Registry listing | Yes | Some | No | P3: After stabilization |
| Structured logging | Yes (stderr) | Yes | Minimal | P2: Add structured logging |
| Health check / diagnostics | No | No | No | P2: Differentiator (D-3) |
| Graceful shutdown | Handled by SDK | Handled by SDK | Handled by SDK | Already covered by SDK |
| CHANGELOG | Yes | Some | No | P2: Start maintaining |

## Sources

- [MCP TypeScript SDK (Context7, HIGH confidence)](https://context7.com/modelcontextprotocol/typescript-sdk) -- Server creation patterns, tool registration, error handling, InMemoryTransport testing
- [Build an MCP Server - Official Docs (HIGH confidence)](https://modelcontextprotocol.io/docs/develop/build-server) -- Package.json structure with bin/files/scripts, shebang requirement, logging best practices
- [MCP Registry Requirements (HIGH confidence)](https://glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements) -- Namespace verification, npm package requirement, metadata fields
- [MCP Registry Versioning (HIGH confidence)](https://modelcontextprotocol.io/registry/versioning) -- Semver recommendation, version alignment guidance
- [MCP Best Practice Guide (MEDIUM confidence)](https://mcp-best-practice.github.io/mcp-best-practice/) -- Single responsibility, observability, defense-in-depth, testing layers
- [MCP Server Development Guide (MEDIUM confidence)](https://github.com/cyanheads/model-context-protocol-resources/blob/main/guides/mcp-server-development-guide.md) -- Production-readiness checklist, security patterns
- [MCP Inspector (HIGH confidence)](https://modelcontextprotocol.io/docs/tools/inspector) -- Visual testing tool, npx-runnable, transport debugging
- [Unit Testing MCP Servers (MEDIUM confidence)](https://mcpcat.io/guides/writing-unit-tests-mcp-servers/) -- InMemoryTransport pattern, Vitest integration, mocking strategies
- [Dynamic Configuration for MCP Servers (MEDIUM confidence)](https://dev.to/saleor/dynamic-configuration-for-mcp-servers-using-environment-variables-2a0o) -- Environment variable configuration patterns
- [Official MCP Servers Repository (HIGH confidence)](https://github.com/modelcontextprotocol/servers) -- Reference implementations, README patterns, repository structure
- [Distribute Your MCP Server (MEDIUM confidence)](https://www.speakeasy.com/mcp/distributing-mcp-servers) -- npm publication workflow, package.json fields
- [Publish Your MCP Server to NPM (MEDIUM confidence)](https://www.aihero.dev/publish-your-mcp-server-to-npm) -- bin field, shebang, prepublishOnly pattern

---
*Feature research for: MCP server publication and production-readiness*
*Researched: 2026-02-09*
