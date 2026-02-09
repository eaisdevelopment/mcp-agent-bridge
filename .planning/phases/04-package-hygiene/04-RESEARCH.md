# Phase 4: Package Hygiene - Research

**Researched:** 2026-02-09
**Domain:** npm packaging, ESM TypeScript CLI publishing, MCP tool annotations
**Confidence:** HIGH

## Summary

Phase 4 prepares `cc-bridge-mcp-server` for `npm publish` and `npx` execution. The project is a TypeScript ESM MCP server that needs to be packaged as an npm CLI tool. The current state has significant packaging gaps: no `files` field (causing 172 files in the tarball including `.idea/`, `.planning/`, `coverage/`, test files, etc.), no `bin` field, no shebang, no LICENSE file, no root `.gitignore`, version hardcoded in two places (`constants.ts` and `package.json`), and version set to `1.0.0` instead of `0.1.0`.

The good news is that all 6 tools already have correct MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) with values that match their actual behavior. The annotations were added in Phase 3 using the `registerTool` API with a config object pattern. The main work is npm packaging metadata, file hygiene, and version single-sourcing.

**Primary recommendation:** Add `files`, `bin`, `prepublishOnly`, and metadata fields to `package.json`; add shebang to `src/index.ts`; create LICENSE and `.gitignore`; single-source version from `package.json` using `createRequire`; verify MCP annotations are correct; and validate with `npm pack --dry-run`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.26.0 (installed) | MCP server framework with `registerTool` API | Official MCP SDK; already in use |
| typescript | ^5.9.3 (installed) | TypeScript compiler | Already in use; `module: "Node16"` config |
| zod | ^3.23.8 (installed) | Schema validation for tool inputs | Already in use; MCP SDK integrates with it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| npm (built-in) | v10+ | Package verification via `npm pack --dry-run` | Validation step |
| node:module | built-in | `createRequire` for JSON imports in ESM | Version single-sourcing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `createRequire` for JSON import | `fs.readFileSync` + `JSON.parse` | `createRequire` is cleaner, standard Node.js pattern; `fs.readFileSync` requires path resolution with `import.meta.url` |
| `createRequire` for JSON import | `import pkg from '../package.json' with { type: 'json' }` | Import attributes have had TypeScript regressions with Node16 module resolution (TS issue #60589); `createRequire` is more reliable |

**Installation:**
```bash
# No new packages needed - all tooling is built-in npm and Node.js
```

## Architecture Patterns

### Current Project Structure (relevant files)
```
cc-bridge-mcp-server/
├── package.json           # NEEDS: bin, files, prepublishOnly, keywords, repository, homepage, bugs, version 0.1.0
├── src/
│   ├── index.ts           # NEEDS: #!/usr/bin/env node shebang
│   └── constants.ts       # NEEDS: version from package.json instead of hardcoded
├── dist/                  # Build output (should be in .gitignore, included in package via files)
├── README.md              # EXISTS: will be auto-included by npm
├── LICENSE                # MISSING: needs ISC license text
├── .gitignore             # MISSING: needs dist/, node_modules/, .idea/, lock files
├── .idea/                 # Should be gitignored
├── .planning/             # Should NOT be in tarball
├── coverage/              # Should NOT be in tarball
└── vitest.config.ts       # Should NOT be in tarball
```

### Pattern 1: ESM CLI Binary via npm `bin` Field
**What:** The `bin` field in `package.json` maps a command name to a JS file. npm creates a symlink in `node_modules/.bin/` on install, and `npx` can invoke it directly.
**When to use:** Always for CLI tools published to npm.
**Example:**
```json
// Source: npm docs for package.json bin field
{
  "bin": {
    "cc-bridge-mcp-server": "dist/index.js"
  }
}
```
**Key detail:** The referenced file MUST have `#!/usr/bin/env node` as its first line. TypeScript does NOT preserve shebangs during compilation, so the shebang must be in the source `.ts` file AND the compiled `.js` output. TypeScript `tsc` DOES preserve the shebang if it is the first line of the source file.

### Pattern 2: Version Single-Sourcing with createRequire
**What:** Read version from `package.json` at runtime using `createRequire` instead of duplicating the version string.
**When to use:** Any ESM TypeScript project that needs its own version at runtime.
**Example:**
```typescript
// Source: Node.js ESM documentation
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
export const SERVER_VERSION = version;
```
**Why createRequire over import assertion:** TypeScript 5.7+ had a regression with JSON imports under `module: "Node16"` (GitHub issue #60589). `createRequire` works reliably across all Node.js and TypeScript versions.

### Pattern 3: npm `files` Whitelist
**What:** The `files` field in `package.json` is a whitelist of files/directories to include in the published package.
**When to use:** Always. Without it, npm includes everything not in `.gitignore` or `.npmignore`.
**Key facts (from npm docs):**
- `package.json` is ALWAYS included automatically
- `README` (any case/extension) is ALWAYS included automatically
- `LICENSE` (any case/extension) is ALWAYS included automatically
- `node_modules/` is ALWAYS excluded
- `.git/` is ALWAYS excluded
- The `main` field entry point is auto-included
```json
{
  "files": ["dist", "README.md", "LICENSE"]
}
```

### Pattern 4: prepublishOnly Script
**What:** A lifecycle script that runs BEFORE the package is packed and published, but ONLY on `npm publish` (not on `npm install`).
**When to use:** To ensure the build is fresh before publishing.
```json
{
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

### Anti-Patterns to Avoid
- **Relying on `.npmignore` instead of `files`:** The `files` whitelist is safer than a blacklist. You cannot accidentally include secrets or build artifacts when using a whitelist.
- **Hardcoding version in multiple places:** The version in `package.json` is the canonical source. Duplicating it in `constants.ts` means they can drift. Always read from `package.json`.
- **Publishing without `npm pack --dry-run` verification:** Always verify tarball contents before publishing.
- **Forgetting shebang in TypeScript source:** If the shebang is not in `src/index.ts`, it will not appear in `dist/index.js` after compilation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version reading at runtime | Custom file-path resolution to find package.json | `createRequire(import.meta.url)` | Handles all edge cases of path resolution in ESM; works whether running from source or installed package |
| Package content control | `.npmignore` blacklist | `files` whitelist in `package.json` | Whitelist is safer; new files are excluded by default |
| Pre-publish build verification | Custom CI scripts | `prepublishOnly` lifecycle script | Built into npm; runs automatically |
| Tarball verification | Manual file listing | `npm pack --dry-run` | Shows exact tarball contents; catches mistakes |

**Key insight:** npm has built-in mechanisms for every packaging concern. The entire phase is about correctly configuring existing npm features, not building anything custom.

## Common Pitfalls

### Pitfall 1: Shebang Not Preserved in Compiled Output
**What goes wrong:** Adding `#!/usr/bin/env node` to `src/index.ts` but it not appearing in `dist/index.js`, causing `npx cc-bridge-mcp-server` to fail with a syntax error or "cannot execute" error.
**Why it happens:** Some build tools strip shebangs. However, `tsc` (the TypeScript compiler used in this project) DOES preserve shebangs when they are the first line.
**How to avoid:** Add the shebang as the very first line of `src/index.ts` (before any imports). After building, verify `dist/index.js` starts with `#!/usr/bin/env node`.
**Warning signs:** Running `head -1 dist/index.js` does not show the shebang.

### Pitfall 2: `files` Field Missing dist Directory
**What goes wrong:** Package publishes without the compiled JavaScript, making it useless.
**Why it happens:** Forgetting to include `dist` in the `files` array, or having `dist/` in `.gitignore` (which `.npmignore` would pick up if no explicit `files` field).
**How to avoid:** Explicitly list `"dist"` in `files`. npm `files` overrides `.gitignore` for included items.
**Warning signs:** `npm pack --dry-run` shows no `dist/` files.

### Pitfall 3: Version Drift Between package.json and Constants
**What goes wrong:** `package.json` says `0.1.0` but the server reports `1.0.0` (or vice versa) because they are independently maintained.
**Why it happens:** Hardcoded version in `src/constants.ts` is `"1.0.0"` and must be manually kept in sync.
**How to avoid:** Single-source the version by reading `package.json` at runtime using `createRequire`. Remove the hardcoded string from `constants.ts`.
**Warning signs:** `SERVER_VERSION` in constants.ts does not match `version` in package.json.

### Pitfall 4: Missing executable permission on bin file
**What goes wrong:** `npx cc-bridge-mcp-server` fails with permission denied.
**Why it happens:** npm should set the executable bit on files referenced by `bin`, but local testing before publish might not have the right permissions.
**How to avoid:** npm handles this during install. For local testing, run `chmod +x dist/index.js` or use `node dist/index.js` directly.
**Warning signs:** Permission denied errors when running via npx locally.

### Pitfall 5: createRequire Path Resolution in Installed Package
**What goes wrong:** `createRequire(import.meta.url)` resolves relative to the current file. In `src/constants.ts`, `../package.json` points to the project root. But in `dist/constants.js`, `../package.json` ALSO points to the project root (because `dist/` is one level down from root). This works correctly in both development and installed contexts.
**Why it happens:** Path confusion between source and compiled output directories.
**How to avoid:** The path `../package.json` from `dist/constants.js` correctly resolves to the package root where `package.json` lives. This works for both local development and npm-installed packages.
**Warning signs:** Build the project and verify `node -e "import('./dist/constants.js').then(m => console.log(m.SERVER_VERSION))"` outputs the correct version.

### Pitfall 6: Tarball Includes Unnecessary Files
**What goes wrong:** Without `files` field, npm includes everything not gitignored. Currently 172 files (956KB) including `.idea/`, `.planning/`, `coverage/`, source TypeScript, test files, and config files.
**Why it happens:** No `files` field and no `.gitignore` at project root.
**How to avoid:** Add `"files": ["dist", "README.md", "LICENSE"]` to package.json.
**Warning signs:** `npm pack --dry-run` shows more than ~30 files.

## Code Examples

Verified patterns from official sources:

### package.json Complete Configuration
```json
// Source: npm docs + project requirements
{
  "name": "cc-bridge-mcp-server",
  "version": "0.1.0",
  "description": "MCP server for inter-Claude-Code session communication bridge",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "cc-bridge-mcp-server": "dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "claude",
    "claude-code",
    "bridge",
    "inter-session",
    "communication",
    "ai",
    "agent"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/OWNER/cc-bridge-mcp-server.git"
  },
  "homepage": "https://github.com/OWNER/cc-bridge-mcp-server#readme",
  "bugs": {
    "url": "https://github.com/OWNER/cc-bridge-mcp-server/issues"
  },
  "license": "ISC",
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.6.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@vitest/coverage-v8": "^4.0.18",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^4.0.18"
  }
}
```

**NOTE:** The `repository`, `homepage`, and `bugs` URLs need the actual GitHub owner/org. Since no git remote is configured, the planner should use a placeholder or prompt the user.

### Shebang in src/index.ts
```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// ... rest of imports
```
The shebang MUST be the very first line, before any other content.

### Version Single-Sourcing in src/constants.ts
```typescript
// Source: Node.js ESM documentation for createRequire
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const SERVER_NAME = "cc-bridge-mcp-server";
export const SERVER_VERSION = pkg.version;
```

### ISC License Text (LICENSE file)
```
ISC License

Copyright (c) 2025 cc-bridge-mcp-server contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### .gitignore
```
# Build output
dist/

# Dependencies
node_modules/

# IDE
.idea/

# Lock files (project uses npm, lock file is regenerated)
package-lock.json

# Coverage
coverage/

# OS files
.DS_Store

# Environment
.env
.env.local
```

### MCP Tool Annotations Audit (Current State)

All 6 tools already have annotations. Here is the verification:

| Tool | readOnlyHint | destructiveHint | idempotentHint | openWorldHint | Correct? |
|------|-------------|-----------------|----------------|---------------|----------|
| cc_register_peer | false | false | true | false | YES - writes state, non-destructive, re-registering same peer is idempotent, closed system |
| cc_deregister_peer | false | true | true | false | YES - writes state, destructive (removes peer), idempotent (removing already-removed is no-op), closed system |
| cc_send_message | false | false | false | true | YES - writes state, non-destructive, NOT idempotent (each call sends a new message), open world (invokes external CLI) |
| cc_list_peers | true | false | true | false | YES - read-only, non-destructive, idempotent, closed system |
| cc_get_history | true | false | true | false | YES - read-only, non-destructive, idempotent, closed system |
| cc_health_check | true | false | true | false | YES - read-only, non-destructive, idempotent, closed system |

**All annotations are already correct.** PKG-10 is already satisfied. The planner should include a verification task that confirms this rather than a modification task.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import pkg from './package.json' assert { type: 'json' }` | `createRequire(import.meta.url)` for JSON | 2024-2025 (TS regressions) | Import assertions/attributes unreliable with Node16 module resolution in TypeScript 5.7+ |
| `.npmignore` blacklist | `files` whitelist in package.json | Long-standing best practice | Whitelist is safer; standard recommendation |
| `server.tool()` (positional args) | `server.registerTool()` (config object) | MCP SDK 1.x | `tool()` is deprecated; `registerTool()` is the current API. This project already uses `registerTool()`. |

**Deprecated/outdated:**
- `server.tool()`: Deprecated in favor of `server.registerTool()` in MCP SDK. This project already uses the correct API.
- `import ... assert { type: 'json' }`: Replaced by `import ... with { type: 'json' }` in newer specs, but both have TypeScript issues with Node16. Use `createRequire` instead.

## Open Questions

1. **GitHub Repository URL**
   - What we know: No git remote is configured. `package.json` needs `repository`, `homepage`, and `bugs` fields.
   - What's unclear: The actual GitHub owner/organization name.
   - Recommendation: Use placeholder `"https://github.com/anthropics/cc-bridge-mcp-server"` or similar. The user can update before actual publishing. Alternatively, these fields can be set without a specific URL format if the project will be published from a different location.

2. **LICENSE Copyright Holder**
   - What we know: README says "License: ISC" but no LICENSE file exists.
   - What's unclear: Who should be listed as copyright holder.
   - Recommendation: Use "cc-bridge-mcp-server contributors" as a generic placeholder. User can update before publishing.

3. **Should package-lock.json be gitignored?**
   - What we know: The requirements say `.gitignore` should exclude "lock files." npm's own recommendation for applications is to commit `package-lock.json`, but for libraries it's debatable.
   - What's unclear: Whether this project is treated as a library (published to npm) or an application.
   - Recommendation: Since this is an npm-published package, follow the requirement and exclude `package-lock.json` from git. Users installing it get their own lock file.

## Sources

### Primary (HIGH confidence)
- MCP SDK `@modelcontextprotocol/sdk` v1.26.0 type definitions (`ToolAnnotations` schema) - verified annotations interface
- [MCP Tool Annotations specification](https://modelcontextprotocol.io/legacy/concepts/tools) - verified annotation fields, types, defaults, and semantics
- npm package.json docs (built-in knowledge verified against actual npm behavior via `npm pack --dry-run`)
- [ISC License template](https://choosealicense.com/licenses/isc/) - verified license text
- Node.js ESM documentation - verified `createRequire(import.meta.url)` pattern

### Secondary (MEDIUM confidence)
- [2ality: Publishing ESM-based npm packages with TypeScript](https://2ality.com/2025/02/typescript-esm-packages.html) - bin setup, files field, prepublishOnly pattern
- [npm CLI wiki: Files & Ignores](https://github.com/npm/cli/wiki/Files-&-Ignores) - files/npmignore interaction
- [TypeScript GitHub Issue #60589](https://github.com/microsoft/TypeScript/issues/60589) - JSON import regression in Node16 mode

### Tertiary (LOW confidence)
- None. All claims verified with at least two sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and in use; no new dependencies needed
- Architecture: HIGH - npm packaging fields are well-documented; `createRequire` pattern is standard Node.js
- Pitfalls: HIGH - verified through actual `npm pack --dry-run` output showing current problems; MCP annotations verified against SDK type definitions
- MCP Annotations: HIGH - verified all 6 tools against SDK `ToolAnnotationsSchema` and MCP specification; all already correct

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain; npm packaging patterns don't change frequently)
