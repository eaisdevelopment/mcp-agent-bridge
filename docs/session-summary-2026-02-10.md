# Session Summary (2026-02-10)

## 1. Fixed 39GB Log Bloat (v0.2.5)

**Problem:** Logs in `~/cloud_code_bridge/logs/` grew to 39 GB with repeated identical messages.

**Root cause:** Infinite EPIPE loop — when the parent CLI disconnects, `process.stderr.write()` in the logger throws EPIPE, caught by `uncaughtException` handler which calls `logger.error()`, which writes to stderr again, creating an unbounded loop.

**Fix (2 files):**
- `src/index.ts` — EPIPE in `uncaughtException` handler triggers clean exit instead of logging
- `src/logger.ts` — `process.stderr.write()` wrapped in try/catch to break the loop at source

**Published as v0.2.5.**

---

## 2. Fixed Path Hashing Bug (v0.2.6)

**Problem:** KLAIRE project sessions failed with "Session not found" errors. Paths with underscores (e.g., `klaire_backend`) broke session validation.

**Root cause:** `validateSession()` used `cwd.replace(/\//g, "-")` (only replacing slashes), but Claude Code replaces ALL non-alphanumeric chars with dashes: `cwd.replace(/[^a-zA-Z0-9-]/g, "-")`.

**Fix (3 files):**
- `src/services/cc-cli.ts` — Fixed path hashing regex
- `src/wizard/templates.ts` — Updated session discovery command
- `README.md` — Updated documentation to match

Also fixed KLAIRE project's `.mcp.json` files (missing `CC_BRIDGE_STATE_PATH`).

**Published as v0.2.6.**

---

## 3. Created Claude Code Plugin (v0.2.7)

**Goal:** Distribute cc-bridge as a one-command install plugin (like context7, playwright, superpowers) instead of requiring manual `.mcp.json` setup.

**Created `plugin/` directory:**
- `.claude-plugin/plugin.json` — Plugin manifest
- `.mcp.json` — MCP server config using `npx -y @essentialai/cc-bridge-mcp-server`
- `skills/bridge-setup/SKILL.md` — Auto-registration skill with session discovery
- `commands/register.md` — `/cc-bridge:register`
- `commands/status.md` — `/cc-bridge:status`
- `commands/send.md` — `/cc-bridge:send`
- `commands/demo.md` — `/cc-bridge:demo`
- `README.md`, `LICENSE`

**Created marketplace repo** `eaisdevelopment/cc-bridge-marketplace` on GitHub.

**Install:**
```bash
claude plugin marketplace add eaisdevelopment/cc-bridge-marketplace
claude plugin install cc-bridge@cc-bridge-marketplace
```

**Created `docs/installation.md`** — comprehensive guide covering plugin marketplace (recommended), manual `.mcp.json`, and init wizard setup.

**Updated `README.md`** — restructured Quick Start to promote marketplace install as primary method.

**Published as v0.2.7.**

---

## 4. Added `/cc-bridge:init` Command (v0.2.8)

**Problem:** No easy way to set up a shared bridge folder for multiple projects via the plugin. Users had to manually create `.mcp.json` with matching `CC_BRIDGE_STATE_PATH` in each project.

**Solution:** Created `plugin/commands/init.md` — a new `/cc-bridge:init` slash command that:
- Asks for project directories and shared state path
- Creates/updates `.mcp.json` in each project with matching `CC_BRIDGE_STATE_PATH`
- Creates the shared directory
- Reports results and next steps

**Usage:**
```
/cc-bridge:init /path/to/backend /path/to/frontend
/cc-bridge:init /path/to/backend /path/to/frontend --share /path/to/cc-share
```

Updated plugin README, `docs/installation.md`, and marketplace repo README to document the new command.

**Published as v0.2.8.**

---

## 5. Misc Fixes

- Removed accidental Cyrillic text from `CLAUDE.md`
- Updated version references in `CLAUDE.md` from v0.2.3 to v0.2.7

---

## Versions Published

| Version | Changes |
|---------|---------|
| **0.2.5** | EPIPE infinite logging loop fix |
| **0.2.6** | Path hashing fix for non-alphanumeric chars |
| **0.2.7** | Plugin, marketplace, installation docs, README update |
| **0.2.8** | `/cc-bridge:init` command for shared folder setup |

## All Destinations Updated

| Target | Status |
|--------|--------|
| GitHub (`eaisdevelopment/mcp-agent-bridge`) | All commits pushed, tagged through v0.2.8 |
| npm (`@essentialai/cc-bridge-mcp-server`) | Published through 0.2.8 |
| MCP Registry (`io.github.eaisdevelopment/cc-bridge-mcp-server`) | Published through 0.2.8 |
| Claude Plugin Marketplace (`eaisdevelopment/cc-bridge-marketplace`) | Synced with `/cc-bridge:init` command |
