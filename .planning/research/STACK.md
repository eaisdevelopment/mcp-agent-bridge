# Stack Research

**Domain:** MCP Server / Inter-Agent Communication Bridge
**Researched:** 2026-02-09
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @modelcontextprotocol/sdk | ^1.26.0 | MCP server framework | Only official TypeScript SDK. v1.26.0 is latest stable (published 2026-02-04). A v2 monorepo split into `@modelcontextprotocol/server` etc. is in development but NOT published to npm yet. Stay on v1.x. |
| TypeScript | ^5.7.2 (installed), latest 5.9.3 | Type safety, build | Already in project. No urgency to upgrade from 5.7 -- the tsconfig targets ES2022 with Node16 module resolution, which works. Upgrade to 5.9 optional. |
| Node.js | >=18 | Runtime | Already specified in engines. SDK supports 18+. No reason to change. |
| Zod | ^3.23.8 (installed) | Schema validation | MCP SDK peer dependency accepts `^3.25 \|\| ^4.0`. Current ^3.23.8 satisfies ^3.25 when resolved (3.24+ all exist). Zod 4 (4.3.6) is available but migration is optional -- Zod 3.x works fine with the SDK. |

### Testing Framework

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| vitest | ^4.0.18 | Test runner, assertions, mocking | Standard for TypeScript/ESM projects in 2025-2026. Native ESM support without config gymnastics. Built-in `vi.mock()` for module mocking, `vi.fn()` for spies. Vitest 4.0 is stable, released late 2025. Uses Vite's module runner -- no separate ts-node/tsx needed for test execution. |
| @vitest/coverage-v8 | ^4.0.18 | Code coverage | First-party coverage plugin using V8 native coverage. Zero-config. Must match vitest major/minor version. |
| memfs | ^4.56.10 | In-memory filesystem for tests | The standard library for mocking `node:fs` and `node:fs/promises` in Node.js tests. Used via `vi.mock('node:fs')` + `vi.mock('node:fs/promises')` with `__mocks__/` directory pattern. Essential for testing `peer-registry.ts` file-based state without touching disk. |

### Publishing & Distribution

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| tsup | ^8.5.1 | Bundle for npm distribution | Bundles TypeScript into a single-file ESM output with shebang injection. Wraps esbuild. Produces smaller, faster-loading packages than raw `tsc` output. Use for `npm publish` build, not for development. |
| mcp-publisher (CLI) | latest via Homebrew | Publish to official MCP Registry | The MCP Registry (registry.modelcontextprotocol.io) only accepts metadata -- the actual package must be on npm first. Install via `brew install mcp-publisher`. Namespace: `io.github.<username>/cc-bridge-mcp-server`. |
| @modelcontextprotocol/inspector | ^0.19.0 | Interactive MCP server debugging | Run via `npx @modelcontextprotocol/inspector`. Opens browser UI at localhost:6274. Tests tools/resources/prompts interactively. Use for manual smoke testing, not automated CI. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | ^4.19.2 (installed) | Dev-mode TypeScript execution | Already in project for `npm run dev`. Keep as-is. |
| @types/node | ^22.10.0 (installed), latest 25.2.2 | Node.js type definitions | ^22 is fine. Upgrading to 25.x would require Node 25+ types which may not match runtime. Keep ^22 to match actual Node 18-22 runtime targets. |

## Installation

```bash
# Testing (dev dependencies)
npm install -D vitest@^4.0.18 @vitest/coverage-v8@^4.0.18 memfs@^4.56.10

# Publishing (dev dependency)
npm install -D tsup@^8.5.1

# MCP Registry publishing (system tool, not npm)
brew install mcp-publisher

# MCP Inspector (use via npx, no install needed)
# npx @modelcontextprotocol/inspector
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| vitest | Jest 30 | Never for this project. Jest 30 added ESM support but it's still awkward with TypeScript ESM (`.mts` extensions, experimental flags). Vitest handles ESM + TypeScript natively. |
| vitest | Node.js built-in test runner (`node:test`) | Only if you want zero dependencies and accept no mocking framework, no coverage integration, and manual TypeScript compilation before running tests. Too much friction for a project that needs `vi.mock()` for fs and child_process. |
| memfs | mock-fs | Never. mock-fs patches the real `fs` module at runtime which causes subtle issues with ESM imports and Vitest's own file operations. memfs provides a clean separate implementation that you redirect to via `vi.mock()`. |
| tsup | tsc (current) | Keep using `tsc` for development builds. Use tsup only for the final npm publish artifact. tsc gives better sourcemaps and type-checking during development. tsup is for producing the optimized distributable. |
| tsup | tsdown | tsdown is newer and faster but has less ecosystem maturity. tsup is battle-tested for library publishing. Switch to tsdown in 6-12 months if it stabilizes. |
| tsup | esbuild (direct) | Only if tsup's config abstraction causes issues. tsup wraps esbuild anyway. Direct esbuild means you handle shebang injection, declaration files, and output config yourself. |
| @modelcontextprotocol/sdk ^1.26 | @modelcontextprotocol/server (v2) | NOT YET AVAILABLE on npm. The v2 monorepo packages exist in the GitHub repo but have not been published. When v2 ships (estimated Q1 2026), migrate from `@modelcontextprotocol/sdk` to `@modelcontextprotocol/server`. v1.x will receive bug fixes for 6+ months after v2 ships. No urgency. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Jest (any version) | ESM + TypeScript integration is fragile. Requires `--experimental-vm-modules`, `.mts` extensions, or Babel transforms. The MCP SDK uses ESM imports with `.js` extension specifiers. Jest's module resolution fights this. | vitest |
| mock-fs | Patches global `fs` at runtime. Breaks Vitest's internal file operations (config loading, snapshot files). Known footgun with ESM module graphs. | memfs + vi.mock() |
| Zod v4 migration (now) | MCP SDK v1.26.0 internally uses `zod/v4` subpath but its peer dep accepts `^3.25 \|\| ^4.0`. The project currently uses `^3.23.8`. Migrating to Zod 4 is a breaking change in API surface (different `.parse()` error types, removed `.refine()` chaining). Not worth the risk for an existing codebase with no Zod pain points. | Stay on Zod ^3.23.8 until MCP SDK v2 or a clear need arises |
| @modelcontextprotocol/server (v2 packages) | Not published to npm. Importing from GitHub/source would create a fragile dependency. | @modelcontextprotocol/sdk ^1.26.0 |
| Sinon.js | Vitest has built-in `vi.fn()`, `vi.spyOn()`, `vi.mock()` that cover all stubbing/spying needs. Adding Sinon is redundant weight and API surface. | vitest built-in mocking |
| c8 (standalone coverage) | @vitest/coverage-v8 wraps V8 coverage with Vitest integration. Standalone c8 doesn't integrate with Vitest's test lifecycle. | @vitest/coverage-v8 |
| nyc / istanbul | Legacy coverage tools. Instrument source code rather than using V8 native coverage. Slower and less accurate with ESM. | @vitest/coverage-v8 |

## Testing Patterns for This Project

### Pattern 1: File-Based IPC Testing (peer-registry.ts)

**Challenge:** `peer-registry.ts` reads/writes `/tmp/cc-bridge-state.json` with file locking via `node:fs/promises`.

**Approach:** Use `memfs` + `vi.mock('node:fs/promises')` to redirect all fs operations to in-memory filesystem. This lets you:
- Test concurrent lock acquisition without real filesystem races
- Verify state file format without disk I/O
- Test ENOENT handling (empty state) by starting with empty memfs volume
- Test lock timeout by simulating a held lock file

```
__mocks__/
  node/
    fs.cjs          -> exports memfs.fs
    fs/
      promises.cjs  -> exports memfs.fs.promises
```

### Pattern 2: CLI Subprocess Testing (cc-cli.ts)

**Challenge:** `execClaude()` calls `child_process.execFile('claude', ...)` which spawns a real subprocess.

**Approach:** Use `vi.mock('node:child_process')` to mock `execFile`. Return controlled stdout/stderr/exit codes. Test:
- Successful relay (exit 0, stdout contains response)
- CLI timeout (error with ETIMEDOUT)
- CLI not found (ENOENT error)
- Message truncation at CHARACTER_LIMIT
- Large stdout handling (maxBuffer)

### Pattern 3: MCP Tool Integration Testing

**Challenge:** Testing that `registerSendMessageTool(server)` correctly wires up the tool with proper input validation and response formatting.

**Approach:** Use the MCP SDK's `InMemoryTransport` for in-process client-server testing without stdio. Create a real `McpServer`, register tools, connect via `InMemoryTransport`, then call tools through the client. This tests the full MCP protocol path without subprocess overhead.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
```

## Stack Patterns by Variant

**If adding CI/CD (GitHub Actions):**
- Use `npm test` as the CI test command
- Add `vitest run` (not watch mode) to `package.json` scripts
- Coverage threshold enforcement via vitest config `coverage.thresholds`
- No browser mode needed -- this is a pure Node.js server

**If publishing to npm:**
- Add `tsup` build step producing single `dist/index.js` with `#!/usr/bin/env node` shebang
- Add `"bin"` field to package.json: `"cc-bridge-mcp-server": "dist/index.js"`
- Add `"files": ["dist"]` to package.json to exclude source from package
- Add `"prepublishOnly": "npm run build:publish"` script
- Publish with `npm publish --access public`

**If publishing to MCP Registry:**
- First: publish to npm (registry only stores metadata)
- Install: `brew install mcp-publisher`
- Init: `mcp-publisher init` (generates `server.json`)
- Namespace: `io.github.<github-username>/cc-bridge-mcp-server`
- Add `"mcpName": "io.github.<username>/cc-bridge-mcp-server"` to package.json
- Auth: `mcp-publisher login github`
- Publish: `mcp-publisher publish`

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @modelcontextprotocol/sdk@^1.26.0 | zod@^3.25 \|\| ^4.0 | Peer dependency. Our ^3.23.8 resolves to 3.24+ which satisfies ^3.25 range. |
| @modelcontextprotocol/sdk@^1.26.0 | Node.js >=18 | Tested on 18, 20, 22. |
| vitest@^4.0.18 | @types/node@^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0 | Our @types/node@^22 is compatible. |
| vitest@^4.0.18 | @vitest/coverage-v8@^4.0.18 | Must match vitest minor version exactly. |
| memfs@^4.56.10 | Node.js >=18 | Pure JavaScript, no native deps. |
| tsup@^8.5.1 | TypeScript@^5.0 | Compatible with our TS 5.7. |
| tsx@^4.19.2 | Node.js >=18 | Dev tool only. |

## Confidence Assessment

| Decision | Confidence | Source |
|----------|------------|--------|
| Stay on @modelcontextprotocol/sdk v1.x | HIGH | npm registry confirms v2 packages not published. Context7 docs mention v2 monorepo structure but it's unreleased. |
| Vitest 4.x for testing | HIGH | npm confirms 4.0.18 stable. Context7 + official blog confirm Vitest 4.0 is production-ready. Dominant testing framework for TS/ESM. |
| memfs for fs mocking | HIGH | Context7 Vitest docs explicitly show memfs + vi.mock pattern. 4.56.10 actively maintained (10 days ago). |
| tsup for npm bundling | MEDIUM | tsup 8.5.1 is stable and widely used, but tsdown is emerging as successor. tsup is safe for now. |
| MCP Registry publishing via mcp-publisher | MEDIUM | Official docs describe the flow but the registry is still in "preview" (launched Sept 2025). Process may evolve. |
| Zod 3.x (no migration) | HIGH | SDK peer dep allows it. No functional reason to migrate. Risk/reward clearly favors staying. |

## Sources

- npm registry (direct `npm view` queries) -- package versions, peer dependencies, publish dates [HIGH confidence]
- Context7 `/modelcontextprotocol/typescript-sdk` -- SDK architecture, McpServer API, transport options [HIGH confidence]
- Context7 `/vitest-dev/vitest` -- mocking patterns, memfs integration, vi.mock API [HIGH confidence]
- [MCP Server Publishing Guide](https://modelcontextprotocol.info/tools/registry/publishing/) -- official registry publishing workflow [HIGH confidence]
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) -- debugging tool, v0.19.0 [HIGH confidence]
- [Vitest 4.0 announcement](https://vitest.dev/blog/vitest-4) -- Vitest 4 features and stability [HIGH confidence]
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- version history, peer deps [HIGH confidence]
- [MCP TypeScript SDK releases](https://github.com/modelcontextprotocol/typescript-sdk/releases) -- v1.26.0 changelog, v2 status [MEDIUM confidence -- dates in release notes were inconsistent]
- [Official MCP Registry](https://registry.modelcontextprotocol.io/) -- registry API and publishing [MEDIUM confidence -- preview status]
- [Zod v4 versioning](https://zod.dev/v4/versioning) -- subpath versioning strategy [HIGH confidence]

---
*Stack research for: cc-bridge-mcp-server (MCP inter-agent communication bridge)*
*Researched: 2026-02-09*
