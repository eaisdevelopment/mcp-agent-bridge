# Setup Wizard Design — `npx cc-bridge-mcp-server init`

**Date:** 2026-02-10
**Status:** Approved

## Summary

A zero-dependency interactive CLI wizard that scaffolds CC Bridge for two projects. Invoked via `npx cc-bridge-mcp-server init`. Two modes: Demo (sample projects with planted bug) and Real (wire up existing projects).

## CLI Entry Point

- `npx cc-bridge-mcp-server` (no args) → starts MCP server (unchanged behavior)
- `npx cc-bridge-mcp-server init` → launches wizard

New file `src/cli.ts` becomes the `bin` entry point. Checks `process.argv[2]`:
- `"init"` → run wizard
- Otherwise → import and run MCP server from `src/index.ts`

`package.json` `bin` changes from `dist/index.js` to `dist/cli.js`.

## File Structure

```
src/wizard/
  index.ts          — main flow (ask mode, branch to demo or real)
  prompts.ts        — readline helpers (ask, choose, confirm)
  scaffold-demo.ts  — creates the demo projects
  scaffold-real.ts  — wires up two existing projects
  templates.ts      — .mcp.json and CLAUDE.md template strings
```

## Wizard Flow

### Entry Screen

```
╔══════════════════════════════════════╗
║   CC Bridge — Setup Wizard          ║
║   Inter-session communication       ║
╚══════════════════════════════════════╝
```

### Step 1 — Choose mode

```
? What would you like to set up?
  [1] Demo — Two sample projects with a planted bug (great for trying CC Bridge)
  [2] Real — Add CC Bridge to two existing projects
```

### Demo Path (2 prompts)

1. Base directory (default: `~/cc-bridge-demo`)
2. That's it — scaffold everything.

### Real Path (4–5 prompts)

1. Absolute path to Project A (validate exists)
2. Peer ID + label for Project A (defaults: `peer-a` / dirname)
3. Absolute path to Project B (validate exists)
4. Peer ID + label for Project B (defaults: `peer-b` / dirname)

### Both Paths (auto-detected)

- Detect `claude` CLI path via `which claude`
- Detect npx absolute path via `which npx` (handles nvm)
- Write files
- Print summary + next steps

## What Gets Scaffolded

### Demo Mode

| File | Content |
|------|---------|
| `<base>/api-server/package.json` | Express project |
| `<base>/api-server/server.js` | API with planted bugs |
| `<base>/api-server/.mcp.json` | CC Bridge config |
| `<base>/api-server/CLAUDE.md` | Backend peer instructions |
| `<base>/web-client/package.json` | Axios client project |
| `<base>/web-client/app.js` | Frontend that exposes bugs |
| `<base>/web-client/.mcp.json` | CC Bridge config |
| `<base>/web-client/CLAUDE.md` | Frontend peer instructions |

User runs `npm install` themselves (printed in next steps).

### Real Mode

| File | Action |
|------|--------|
| `.mcp.json` | Create or merge (add `cc-bridge` key, preserve existing config) |
| `CLAUDE.md` | Create or append bridge protocol section |

Never overwrites existing content — merges/appends.

## Output Summary

After scaffolding, prints:
- List of created/modified files with ✓ marks
- Numbered next steps (install deps, start server, open terminals, register peers)
- "Adding More Peers" section explaining how to scale beyond 2

## Edge Cases & Error Handling

### File Conflicts

- `.mcp.json` exists → merge; if `cc-bridge` key exists → ask overwrite y/n
- `CLAUDE.md` exists → check for existing bridge section; if found → ask replace or skip; if not → append
- Demo base dir exists → ask overwrite y/n or abort

### Path Validation

- Real mode: verify paths exist and are directories
- Demo mode: verify parent directory is writable

### npx/Node Detection

- `which npx` → if inside nvm path, use absolute path in `.mcp.json`
- Not found → warn and ask user to provide path

### Claude CLI Detection

- `which claude` → if not found, warn but continue

## Technical Constraints

- Zero new dependencies (Node built-in `readline` + `fs` + `path` + `child_process`)
- ANSI escape codes for minimal color/styling
- No network calls
- No async complexity beyond readline
- Wizard supports exactly 2 peers; docs explain how to add more

## Dependencies on Existing Code

- None. The wizard is purely additive — it writes files and prints output.
- `src/cli.ts` imports `src/index.ts` for the default (MCP server) path.
