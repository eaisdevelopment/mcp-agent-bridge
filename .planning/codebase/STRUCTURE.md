# Codebase Structure

**Analysis Date:** 2026-02-09

## Directory Layout

```
cc-bridge-mcp-server/
├── src/                # TypeScript source code
│   ├── index.ts        # Server entry point
│   ├── types.ts        # Type definitions
│   ├── constants.ts    # Configuration constants
│   ├── services/       # Business logic layer
│   └── tools/          # MCP tool handlers
├── dist/               # Compiled JavaScript output
├── node_modules/       # Dependencies
├── .venv/              # Python virtual environment (unused)
├── .planning/          # Project planning documents
├── package.json        # NPM package configuration
└── tsconfig.json       # TypeScript compiler configuration
```

## Directory Purposes

**`src/`:**
- Purpose: All TypeScript source code
- Contains: Entry point, tools, services, types, constants
- Key files: `index.ts` (server initialization)

**`src/services/`:**
- Purpose: Core business logic services
- Contains: Peer registry with file persistence, CLI execution wrapper
- Key files: `peer-registry.ts` (shared state management), `cc-cli.ts` (subprocess executor)

**`src/tools/`:**
- Purpose: MCP tool handler implementations
- Contains: Five tool registration modules (one per tool)
- Key files: `register-peer.ts`, `deregister-peer.ts`, `send-message.ts`, `list-peers.ts`, `get-history.ts`

**`dist/`:**
- Purpose: Compiled JavaScript build artifacts
- Contains: Transpiled .js files, .d.ts declarations, .map source maps
- Generated: Yes (by `tsc` compiler)
- Committed: Yes (based on git status showing staged dist files)

**`.planning/`:**
- Purpose: Project planning and documentation
- Contains: Codebase analysis documents
- Generated: Yes (by GSD commands)
- Committed: Not in initial commit (created during analysis)

**`.venv/`:**
- Purpose: Python virtual environment
- Contains: Python packages
- Generated: Yes
- Committed: No (appears unused - project is Node.js-based)

## Key File Locations

**Entry Points:**
- `src/index.ts`: Server initialization, tool registration, stdio transport setup
- `dist/index.js`: Compiled entry point invoked by Claude Code via `.mcp.json`

**Configuration:**
- `package.json`: NPM dependencies, scripts, engine requirements
- `tsconfig.json`: TypeScript compiler options (ES2022, Node16 modules, strict mode)

**Core Logic:**
- `src/services/peer-registry.ts`: File-based state persistence with locking (179 lines)
- `src/services/cc-cli.ts`: Claude CLI subprocess wrapper (48 lines)

**Tool Handlers:**
- `src/tools/register-peer.ts`: Peer registration (57 lines)
- `src/tools/send-message.ts`: Message relay (134 lines)
- `src/tools/list-peers.ts`: Peer listing (33 lines)
- `src/tools/get-history.ts`: History retrieval (49 lines)
- `src/tools/deregister-peer.ts`: Peer removal (47 lines)

**Type Definitions:**
- `src/types.ts`: PeerInfo, MessageRecord, SendMessageResult, CliExecResult interfaces
- `src/constants.ts`: CHARACTER_LIMIT (25,000), CLI_TIMEOUT_MS (120,000), server name/version

## Naming Conventions

**Files:**
- Kebab-case: `peer-registry.ts`, `send-message.ts`, `cc-cli.ts`
- Lowercase: `index.ts`, `types.ts`, `constants.ts`

**Directories:**
- Lowercase plural: `services/`, `tools/`
- Dot-prefixed for meta: `.planning/`, `.venv/`

**Functions:**
- camelCase for functions: `registerPeer()`, `execClaude()`, `withLock()`
- camelCase for async functions: `readState()`, `writeState()`, `acquireLock()`

**Variables:**
- camelCase: `server`, `transport`, `fromPeerId`, `toPeerId`
- UPPER_SNAKE_CASE for constants: `STATE_PATH`, `LOCK_PATH`, `MAX_MESSAGES`, `CHARACTER_LIMIT`

**Types:**
- PascalCase for interfaces: `PeerInfo`, `MessageRecord`, `BridgeState`, `SendMessageResult`
- PascalCase for type aliases: `CliExecResult`

**MCP Tools:**
- Snake_case with prefix: `cc_register_peer`, `cc_send_message`, `cc_list_peers`, `cc_get_history`, `cc_deregister_peer`

## Import Organization

**Order:**
1. External libraries: `@modelcontextprotocol/sdk`, `zod`
2. Node.js built-ins: `node:crypto`, `node:fs/promises`, `node:path`, `node:child_process`
3. Local modules: `../services/...`, `../types.js`, `../constants.js`

**Path Aliases:**
- None used - relative paths with explicit `.js` extensions (ES module requirement)

**Import Style:**
- Named imports: `import { McpServer } from "..."`
- Default imports: `import crypto from "node:crypto"`
- Explicit `.js` extensions required in imports (e.g., `./constants.js`) due to ES modules

## Where to Add New Code

**New Tool:**
- Primary code: `src/tools/{tool-name}.ts`
- Registration: Add `registerXxxTool(server)` call in `src/index.ts`
- Pattern: Follow existing tool structure (export register function, use Zod schema)

**New Service:**
- Implementation: `src/services/{service-name}.ts`
- Exports: Export async functions for tool layer consumption
- Pattern: Use Promise-based APIs, handle errors defensively

**New Type:**
- Add to: `src/types.ts` (if shared across modules)
- Pattern: Export interface with PascalCase naming

**New Constant:**
- Add to: `src/constants.ts`
- Pattern: Export const with UPPER_SNAKE_CASE naming

**Utilities:**
- Shared helpers: Add to appropriate service module or create new service file
- Pattern: Export pure functions, avoid side effects

## Special Directories

**`dist/`:**
- Purpose: TypeScript build output
- Generated: Yes (by `npm run build` / `tsc`)
- Committed: Yes (required for deployment)
- Pattern: Mirrors `src/` structure with .js, .d.ts, .d.ts.map, .js.map files

**`node_modules/`:**
- Purpose: NPM dependencies
- Generated: Yes (by `npm install`)
- Committed: No
- Key packages: `@modelcontextprotocol/sdk@^1.6.1`, `zod@^3.23.8`, `typescript@^5.7.2`

**`.venv/`:**
- Purpose: Python virtual environment (appears unused)
- Generated: Yes
- Committed: No
- Note: Project is Node.js-based; .venv may be vestigial or for tooling

**`.planning/`:**
- Purpose: GSD-generated codebase analysis
- Generated: Yes (by `/gsd:map-codebase`)
- Committed: Not yet (created during current analysis)
- Contains: ARCHITECTURE.md, STRUCTURE.md

---

*Structure analysis: 2026-02-09*
