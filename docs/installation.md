# Installation Guide

Three ways to install CC Bridge, from simplest to most flexible.

## Option 1: Plugin Marketplace (Recommended)

One-time setup, works globally across all projects.

```bash
# Add the marketplace
claude plugin marketplace add eaisdevelopment/cc-bridge-marketplace

# Install the plugin
claude plugin install cc-bridge@cc-bridge-marketplace
```

That's it. Restart Claude Code and the bridge tools are available. Use `/cc-bridge:register` to get started.

### What the plugin provides

- MCP server auto-configured (no `.mcp.json` needed)
- `/cc-bridge:register` — register this session on the bridge
- `/cc-bridge:status` — check peers, health, and message history
- `/cc-bridge:send` — send a message to another peer
- `/cc-bridge:init` — set up shared folder for multiple projects
- `/cc-bridge:demo` — set up a demo with sample projects
- Automatic session ID discovery (no manual lookup)

### Updating

```bash
claude plugin update cc-bridge@cc-bridge-marketplace
```

The plugin uses `npx -y @essentialai/cc-bridge-mcp-server` under the hood, so the MCP server itself always fetches the latest version from npm.

## Option 2: Manual MCP Configuration

Add a `.mcp.json` file to your project root (or use `claude mcp add`). This gives you per-project control over configuration.

### Using `.mcp.json`

Create `.mcp.json` in **each** project that needs the bridge:

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "npx",
      "args": ["-y", "@essentialai/cc-bridge-mcp-server"],
      "env": {}
    }
  }
}
```

### Using the CLI

```bash
claude mcp add --transport stdio cc-bridge -- npx -y @essentialai/cc-bridge-mcp-server
```

### Restart Claude Code

After adding the config, restart Claude Code. The six `cc_` tools will be available.

## Option 3: Init Wizard

The wizard creates `.mcp.json` and `CLAUDE.md` with bridge protocol instructions for you.

```bash
npx -y @essentialai/cc-bridge-mcp-server init
```

It asks for:
- Project directories (backend, frontend, etc.)
- Peer names and labels
- Shared state path (for project isolation)

Then generates config files in each directory.

## Configuration

All options work with the same environment variables. Set them in `.mcp.json` under `env`:

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "npx",
      "args": ["-y", "@essentialai/cc-bridge-mcp-server"],
      "env": {
        "CC_BRIDGE_STATE_PATH": "/custom/shared/path",
        "CC_BRIDGE_LOG_LEVEL": "info",
        "CC_BRIDGE_TIMEOUT_MS": "180000"
      }
    }
  }
}
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_BRIDGE_STATE_PATH` | `~/cloud_code_bridge` | Shared state directory |
| `CC_BRIDGE_LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `CC_BRIDGE_TIMEOUT_MS` | `120000` | CLI subprocess timeout (ms) |
| `CC_BRIDGE_CHAR_LIMIT` | `0` | Message truncation (0 = no limit) |
| `CC_BRIDGE_STALE_TIMEOUT_MS` | `1800000` | Idle peer timeout (30 min) |
| `CC_BRIDGE_CLAUDE_PATH` | `claude` | Path to Claude CLI executable |

> **Plugin users:** To customize env vars, create a project-level `.mcp.json` that overrides the plugin defaults. Project-level config takes precedence.

## Project Isolation

By default, all projects share `~/cloud_code_bridge/`. To keep projects isolated, set a unique `CC_BRIDGE_STATE_PATH` per project:

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "npx",
      "args": ["-y", "@essentialai/cc-bridge-mcp-server"],
      "env": {
        "CC_BRIDGE_STATE_PATH": "/path/to/project/cc-share"
      }
    }
  }
}
```

Both sides of the bridge must use the same `CC_BRIDGE_STATE_PATH`.

## Troubleshooting

### "npx not found" or server fails to start

MCP servers are spawned as subprocesses and may not inherit your NVM/shell configuration.

**Fix 1:** Use the absolute path to npx (find it with `which npx`):

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "/Users/you/.nvm/versions/node/v22.11.0/bin/npx",
      "args": ["-y", "@essentialai/cc-bridge-mcp-server"]
    }
  }
}
```

**Fix 2:** Use `claude mcp add` which handles PATH automatically:

```bash
claude mcp add --transport stdio cc-bridge -- npx -y @essentialai/cc-bridge-mcp-server
```

**Fix 3:** Ensure NVM loads in non-interactive shells. Add to `~/.zshrc` or `~/.bashrc`:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `CLI_NOT_FOUND` | `claude` not on PATH | Install Claude Code or set `CC_BRIDGE_CLAUDE_PATH` |
| `CLI_TIMEOUT` | Response took too long | Increase `CC_BRIDGE_TIMEOUT_MS` or check target session |
| `LOCK_TIMEOUT` | Lock held by dead process | Delete `<state-path>/cc-bridge-state.json.lock` |
| `STATE_CORRUPT` | Invalid JSON in state | Auto-recovers; backup saved as `.corrupt.<timestamp>` |
| `PEER_NOT_FOUND` | Target peer not registered | Register both peers before sending |
| `CLI_EXEC_FAILED` (session not found) | Target session ended | Ask peer to re-register with current session ID |

## Verifying Installation

After installing by any method, verify the bridge is working:

1. Start Claude Code in your project
2. Ask: "Run cc_health_check" or use `/cc-bridge:status` (plugin only)
3. All checks should pass (state file, lock mechanism, Claude CLI)

## Links

- [npm package](https://www.npmjs.com/package/@essentialai/cc-bridge-mcp-server)
- [GitHub repo](https://github.com/eaisdevelopment/mcp-agent-bridge)
- [Marketplace repo](https://github.com/eaisdevelopment/cc-bridge-marketplace)
- [MCP Registry](https://registry.modelcontextprotocol.io)
