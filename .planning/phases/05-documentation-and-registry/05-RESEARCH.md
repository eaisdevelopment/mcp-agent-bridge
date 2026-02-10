# Phase 5: Documentation and Registry - Research

**Researched:** 2026-02-09
**Domain:** README documentation, npm publishing, MCP Registry submission
**Confidence:** HIGH

## Summary

Phase 5 transforms the existing developer-oriented README into a user-facing document optimized for first-time installation via `npx`, and submits the package to the official MCP Registry. The current README is structured around building from source and running manually -- it needs to lead with `npx cc-bridge-mcp-server` and a copy-paste `.mcp.json` block. Six environment variables (`CC_BRIDGE_*`) and the `cc_health_check` tool must be documented. A troubleshooting section covering NVM/PATH issues (the most common MCP server installation pain point) is required. For registry submission, a `server.json` metadata file must be created, an `mcpName` field added to `package.json`, the package published to npm, and the `mcp-publisher` CLI used to submit to the official registry.

The documentation work is straightforward file editing with well-known patterns. The registry submission involves a multi-step process (npm publish, mcp-publisher login, mcp-publisher publish) that requires a real GitHub account and npm credentials, so the plan should clearly separate automatable work (file creation) from manual operations (actual publishing).

**Primary recommendation:** Split into two plans: (1) README restructure + server.json creation (fully automatable), (2) npm publish + MCP Registry submission (requires manual credentials and verification).

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `mcp-publisher` CLI | latest | MCP Registry submission | Official CLI from modelcontextprotocol/registry |
| npm CLI | bundled with Node | Package publishing | Standard npm workflow |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `brew install mcp-publisher` | Install registry publisher CLI | macOS/Linux, before registry submission |
| `claude mcp add` | Verify MCP server installs correctly | Testing npx installation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `mcp-publisher` CLI | Manual API calls to registry | CLI handles auth, validation, submission in one flow |
| Homebrew install | Build from source (Go 1.24+) | Homebrew is simpler; source build only if Homebrew unavailable |

## Architecture Patterns

### README Structure (npx-first)

The README should follow this section order, optimized for a user who wants to get running in under 2 minutes:

```
README.md
├── Title + one-line description
├── Quick Start (npx + .mcp.json copy-paste)
├── What It Does (problem + architecture overview)
├── Tools Reference (all 6 tools)
├── Configuration (environment variables table)
├── Usage Workflow (step-by-step)
├── Troubleshooting
├── Development (building from source)
├── Project Structure
└── License
```

**Key principle:** The first thing a user sees should be the fastest path to a working setup. Building from source goes near the bottom.

### .mcp.json Configuration Pattern

Claude Code supports three ways to configure MCP servers. For this project, the README should show the **project scope** `.mcp.json` pattern (checked into git, shared with team):

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "npx",
      "args": ["-y", "cc-bridge-mcp-server"],
      "env": {}
    }
  }
}
```

And optionally the `claude mcp add` command-line equivalent:

```bash
claude mcp add --transport stdio cc-bridge -- npx -y cc-bridge-mcp-server
```

**Environment variable override pattern** in `.mcp.json`:

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "npx",
      "args": ["-y", "cc-bridge-mcp-server"],
      "env": {
        "CC_BRIDGE_STATE_PATH": "/custom/path",
        "CC_BRIDGE_LOG_LEVEL": "debug"
      }
    }
  }
}
```

Claude Code also supports environment variable expansion in `.mcp.json`:
- `${VAR}` -- expands to the value of environment variable `VAR`
- `${VAR:-default}` -- uses `default` if `VAR` is not set

### server.json Structure for MCP Registry

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.OWNER/cc-bridge-mcp-server",
  "title": "CC Bridge MCP Server",
  "description": "MCP server for inter-Claude-Code session communication bridge. Enables two Claude Code instances to collaborate across repositories.",
  "version": "0.1.0",
  "repository": {
    "url": "https://github.com/OWNER/cc-bridge-mcp-server",
    "source": "github"
  },
  "packages": [
    {
      "registryType": "npm",
      "identifier": "cc-bridge-mcp-server",
      "version": "0.1.0",
      "runtimeHint": "npx",
      "transport": {
        "type": "stdio"
      },
      "environmentVariables": [
        {
          "name": "CC_BRIDGE_STATE_PATH",
          "description": "Directory for state file and logs",
          "default": "~/cloud_code_bridge",
          "isRequired": false
        },
        {
          "name": "CC_BRIDGE_TIMEOUT_MS",
          "description": "CLI subprocess timeout in milliseconds",
          "default": "120000",
          "isRequired": false
        },
        {
          "name": "CC_BRIDGE_CHAR_LIMIT",
          "description": "Max characters in CLI message (0 = unlimited)",
          "default": "0",
          "isRequired": false
        },
        {
          "name": "CC_BRIDGE_LOG_LEVEL",
          "description": "Log verbosity: debug, info, warn, error",
          "default": "info",
          "isRequired": false
        },
        {
          "name": "CC_BRIDGE_CLAUDE_PATH",
          "description": "Path to the claude CLI executable",
          "default": "claude",
          "isRequired": false
        },
        {
          "name": "CC_BRIDGE_STALE_TIMEOUT_MS",
          "description": "Time in ms before a peer is flagged as stale (0 = disabled)",
          "default": "1800000",
          "isRequired": false
        }
      ]
    }
  ]
}
```

### Anti-Patterns to Avoid
- **Leading with `git clone` or `npm install` from source:** Users want `npx`, not a build step. Source installation should be a secondary option.
- **Documenting env vars without defaults:** Every `CC_BRIDGE_*` var has a default; always show it.
- **Omitting the `.mcp.json` block:** Users should be able to copy-paste the entire config, not construct it themselves.
- **Hardcoding `/tmp` as state path:** The state path changed from `/tmp/cc-bridge-state.json` to `~/cloud_code_bridge/cc-bridge-state.json` in Phase 1. The current README still references `/tmp`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP Registry submission | Manual API calls or curl | `mcp-publisher` CLI | Handles auth, validation, namespace verification in one tool |
| Package verification | Manual `npm pack` checks | `npm pack --dry-run` + `npx cc-bridge-mcp-server` test | Standard npm workflow, catches issues before publish |
| README template | Custom template from scratch | Existing MCP server READMEs as reference | Community conventions for .mcp.json format, env vars, etc. |

## Common Pitfalls

### Pitfall 1: Missing `mcpName` in package.json
**What goes wrong:** MCP Registry rejects the submission because it cannot verify package ownership.
**Why it happens:** The registry fetches npm package metadata and checks for an `mcpName` field matching the server name.
**How to avoid:** Add `"mcpName": "io.github.OWNER/cc-bridge-mcp-server"` to `package.json` before publishing to npm.
**Warning signs:** `mcp-publisher publish` returns "Package validation failed."

### Pitfall 2: NVM/PATH Issues with npx
**What goes wrong:** Claude Code (or Claude Desktop) cannot find `npx` or `node` because NVM is not loaded in non-interactive shells.
**Why it happens:** MCP servers are spawned as subprocesses. When the parent process (Claude) does not load NVM's shell initialization, `npx` resolves to the system Node (or is missing entirely).
**How to avoid:** Document three solutions in troubleshooting: (1) use absolute path to npx (`~/.nvm/versions/node/v22.x.x/bin/npx`), (2) add NVM init to shell profile so non-interactive shells pick it up, (3) use `CC_BRIDGE_CLAUDE_PATH` to point to the absolute `claude` binary path.
**Warning signs:** `ENOENT` errors, "npx not found", server fails to start.

### Pitfall 3: State File Path in README is Outdated
**What goes wrong:** Users look for state at `/tmp/cc-bridge-state.json` (old default from prototype).
**Why it happens:** The current README still references `/tmp`. Phase 1 changed the default to `~/cloud_code_bridge/`.
**How to avoid:** Update all references to `~/cloud_code_bridge/cc-bridge-state.json` and document `CC_BRIDGE_STATE_PATH`.
**Warning signs:** Users report "state file not found" or look in the wrong location.

### Pitfall 4: Version Mismatch Between server.json and npm Package
**What goes wrong:** MCP Registry may reject or show wrong version.
**Why it happens:** `server.json` version, `package.json` version, and the npm-published version must all match.
**How to avoid:** Update `server.json` version whenever bumping `package.json` version. Consider GitHub Actions automation for future releases.
**Warning signs:** Registry shows different version than npm.

### Pitfall 5: Forgetting `npm run build` Before `npm publish`
**What goes wrong:** Published package contains stale or missing `dist/` files.
**Why it happens:** Developer forgets to build.
**How to avoid:** The `prepublishOnly` script already runs `npm run build` automatically. Verify with `npm pack --dry-run` before publishing.
**Warning signs:** `npx cc-bridge-mcp-server` fails with module not found errors after publishing.

### Pitfall 6: Publishing Before Setting Up GitHub Remote
**What goes wrong:** `package.json` contains placeholder `OWNER` in repository URL. npm page shows broken links.
**Why it happens:** The `repository.url` field still has `https://github.com/OWNER/cc-bridge-mcp-server.git`.
**How to avoid:** Update `OWNER` to actual GitHub username before publishing.
**Warning signs:** npm package page has broken repository link.

### Pitfall 7: Windows npx Requires `cmd /c` Wrapper
**What goes wrong:** Windows users get "Connection closed" errors.
**Why it happens:** Windows cannot directly execute `npx` -- it needs the `cmd /c` wrapper.
**How to avoid:** Document the Windows-specific `.mcp.json` configuration in the README.
**Warning signs:** Windows users report "Connection closed" or `ENOENT` errors.

## Code Examples

### Environment Variables Reference Table (for README)

Source: Verified from `src/config.ts` in this repository.

```markdown
| Variable | Default | Description |
|----------|---------|-------------|
| `CC_BRIDGE_STATE_PATH` | `~/cloud_code_bridge` | Directory for state file and logs |
| `CC_BRIDGE_TIMEOUT_MS` | `120000` (2 min) | CLI subprocess timeout in milliseconds |
| `CC_BRIDGE_CHAR_LIMIT` | `0` (unlimited) | Max characters in relayed message (0 = no limit) |
| `CC_BRIDGE_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `CC_BRIDGE_CLAUDE_PATH` | `claude` | Path to the Claude Code CLI executable |
| `CC_BRIDGE_STALE_TIMEOUT_MS` | `1800000` (30 min) | Idle time before peer is flagged stale (0 = disabled) |
```

### Health Check Tool Documentation (for README)

Source: Verified from `src/tools/health-check.ts` and `src/services/health-check.ts`.

```markdown
### cc_health_check

Diagnose the bridge's operational status. No parameters required.

Checks:
- **State file:** Can the state directory be read and written?
- **Lock mechanism:** Can file locks be acquired and released?
- **Claude CLI:** Is the `claude` binary available and responsive?

Returns:
- `healthy` (boolean) -- all checks passed
- `serverVersion` -- current server version
- `statePath` -- path to state file
- `claudePath` -- path to claude CLI
- `checks` -- per-check pass/fail with detail messages
- `timestamp` -- ISO timestamp of the check
```

### Troubleshooting Section Content (for README)

Source: Synthesized from GitHub issues and official Claude Code docs.

```markdown
## Troubleshooting

### NVM/PATH: "npx not found" or server fails to start

MCP servers are spawned as subprocesses and may not inherit your NVM configuration.

**Option 1: Use absolute path to npx**
Find your npx path: `which npx` (e.g., `/Users/you/.nvm/versions/node/v22.11.0/bin/npx`)

Then in `.mcp.json`:
{
  "mcpServers": {
    "cc-bridge": {
      "command": "/Users/you/.nvm/versions/node/v22.11.0/bin/npx",
      "args": ["-y", "cc-bridge-mcp-server"]
    }
  }
}

**Option 2: Use `claude mcp add` (handles PATH automatically)**
claude mcp add --transport stdio cc-bridge -- npx -y cc-bridge-mcp-server

**Option 3: Ensure NVM loads in non-interactive shells**
Add to ~/.zshrc or ~/.bashrc:
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

### State file location

The bridge stores state at `~/cloud_code_bridge/cc-bridge-state.json` by default.
Override with: `CC_BRIDGE_STATE_PATH=/your/path`
Logs are stored at: `<state-path>/logs/`

### Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `CLI_NOT_FOUND` | `claude` not on PATH | Install Claude Code or set `CC_BRIDGE_CLAUDE_PATH` |
| `CLI_TIMEOUT` | Response took > 2 min | Increase `CC_BRIDGE_TIMEOUT_MS` |
| `LOCK_TIMEOUT` | Lock held by dead process | Delete `<state-path>/cc-bridge-state.json.lock` |
| `STATE_CORRUPT` | Invalid JSON in state | Auto-recovers; backup saved as `.corrupt.<timestamp>` |
| `PEER_NOT_FOUND` | Target peer not registered | Register both peers before sending messages |
```

### mcpName Addition to package.json

```json
{
  "mcpName": "io.github.OWNER/cc-bridge-mcp-server"
}
```

This field must be added to `package.json` and must match the `name` field in `server.json` exactly. The `OWNER` placeholder must be replaced with the actual GitHub username.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual API calls to registry | `mcp-publisher` CLI | 2025-09 (registry preview) | Single CLI handles auth + publish |
| server.json schema `2025-10-17` | Schema `2025-12-11` | 2025-12-11 | Added `runtimeHint`, refined `environmentVariables` |
| SSE transport for remote servers | Streamable HTTP (preferred) | 2025-11 | SSE deprecated; stdio still standard for local npm packages |
| No ownership verification | `mcpName` field in package.json | 2025-09 | Required for npm packages to prevent impersonation |

**Important notes:**
- The MCP Registry is in **preview** -- breaking changes or data resets may occur before GA.
- The registry API entered an **API freeze (v0.1)** as of 2025-10-24, promising stability for the current API shape.
- GitHub-based authentication gives access to the `io.github.<username>/*` namespace.

## Open Questions

1. **What is the actual GitHub username for the `OWNER` placeholder?**
   - What we know: `package.json` uses `OWNER` as placeholder in repository URL, homepage, and bugs fields.
   - What's unclear: The actual GitHub username/org that will own this repo.
   - Recommendation: The planner should note this as a prerequisite -- the user must provide their GitHub username before publishing. All `OWNER` references in package.json, server.json, and README must be replaced.

2. **Should the package be scoped (`@username/cc-bridge-mcp-server`) or unscoped (`cc-bridge-mcp-server`)?**
   - What we know: The quickstart guide mentions scoped packages, but the npm `mcpName` verification works with unscoped packages too. The current `package.json` uses unscoped `cc-bridge-mcp-server`.
   - What's unclear: Whether the unscoped name is available on npm.
   - Recommendation: Keep unscoped name `cc-bridge-mcp-server` (simpler for users, easier to type with npx). Verify name availability on npm before publishing.

3. **Should GitHub Actions automation be set up in this phase?**
   - What we know: The registry supports automated publishing via GitHub Actions with OIDC auth.
   - What's unclear: Whether this phase should include CI/CD setup or defer it.
   - Recommendation: Defer GitHub Actions to a future phase. The initial publish is a one-time manual operation. Automation pays off only for subsequent releases.

4. **Should we use npm v2 provenance (`--provenance`) when publishing?**
   - What we know: npm supports provenance statements linking published packages to source commits.
   - What's unclear: Whether the MCP Registry has any provenance requirements.
   - Recommendation: Out of scope for initial publish. Nice-to-have for future CI/CD pipeline.

## Sources

### Primary (HIGH confidence)
- `src/config.ts` -- All 6 `CC_BRIDGE_*` environment variables with types, defaults, and validation
- `src/tools/health-check.ts` + `src/services/health-check.ts` -- Health check tool behavior and response structure
- `src/index.ts` -- All 6 registered tools
- `package.json` -- Current packaging fields, version 0.1.0
- [MCP Registry GitHub](https://github.com/modelcontextprotocol/registry) -- Official registry repository and docs
- [server.json schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json) -- Current JSON schema for server.json
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) -- Official .mcp.json format, scopes, env var expansion
- [mcp-publisher Homebrew formula](https://formulae.brew.sh/formula/mcp-publisher) -- CLI installation

### Secondary (MEDIUM confidence)
- [MCP Registry publishing guide](https://modelcontextprotocol.info/tools/registry/publishing/) -- Step-by-step publishing process
- [NVM/PATH MCP issue](https://github.com/modelcontextprotocol/servers/issues/64) -- Common NVM issues with MCP servers
- [NVM solution guide](https://chanmeng666.medium.com/solution-for-mcp-servers-connection-issues-with-nvm-npm-5529b905e54a) -- NVM troubleshooting patterns
- [Glama server.json requirements](https://glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements) -- Validation rules and restrictions

### Tertiary (LOW confidence)
- Schema version `2025-12-11` vs `2025-07-09` -- the quickstart and generic docs reference different schema dates; `2025-12-11` confirmed to exist and is used in registry docs

## Metadata

**Confidence breakdown:**
- README structure and content: **HIGH** -- all source material is in the repo; env vars, tools, and error codes verified directly from source code
- .mcp.json format: **HIGH** -- verified from official Claude Code documentation
- server.json format: **HIGH** -- verified against official JSON schema at static.modelcontextprotocol.io
- MCP Registry submission process: **MEDIUM** -- registry is in preview; process is documented but may evolve
- Troubleshooting content: **MEDIUM** -- synthesized from GitHub issues and community reports; patterns are well-established

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- MCP Registry is in preview but API-frozen)
