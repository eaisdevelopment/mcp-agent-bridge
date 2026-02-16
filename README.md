# @essentialai/cogent-bridge

**Cogent** — Real-time relay for Claude Code inter-session communication. Connect your Claude Code agents to collaborate across codebases.

Built by [Essential AI Solutions](https://essentialai.uk) | [cogent.tools](https://cogent.tools) | [How-To Guide](https://cogent.tools/how-to)

## Quick Start

### Install via Plugin Marketplace (Recommended)

```bash
claude plugin marketplace add eaisdevelopment/mcp-agent-bridge
claude plugin install cogent-bridge@mcp-agent-bridge
```

Restart Claude Code. Use `/cogent-bridge:register` to join the bridge — session discovery, registration, and message protocol are all handled automatically.

### What the plugin provides

- MCP server auto-configured (no `.mcp.json` needed)
- `/cogent-bridge:register` — register this session on the bridge
- `/cogent-bridge:status` — check peers, health, and message history
- `/cogent-bridge:send` — send a message to another peer
- `/cogent-bridge:init` — set up shared folder for multiple projects
- `/cogent-bridge:demo` — set up a demo with sample projects
- Automatic session ID discovery (no manual lookup)

### Alternative: Manual MCP Setup

Add `.mcp.json` to **both** project repositories:

```json
{
  "mcpServers": {
    "cogent-bridge": {
      "command": "npx",
      "args": ["-y", "@essentialai/cogent-bridge"],
      "env": {}
    }
  }
}
```

Or use the CLI:

```bash
claude mcp add --transport stdio cogent-bridge -- npx -y @essentialai/cogent-bridge
```

Restart Claude Code in both repos. The six `cogent_` tools are now available.

> **Note:** Manual setup gives you MCP tools only. For slash commands (`/cogent-bridge:register`, etc.), use the Plugin Marketplace method above.

## What It Does

Two Claude Code instances — one working on a backend repo, another on a frontend repo — need to negotiate testing scenarios and debug collaboratively in real-time without mixing their accumulated project context.

```
Cogent_Backend                            Cogent_Frontend
    |                                         |
    +-- .mcp.json --> @essentialai/cogent-bridge  |
    |                    |                    |
    |                    +-- ~/.cogent/cogent-state.json
    |                    |                    |
    |                    |   <-- .mcp.json ---+
    |                                         |
    +-- claude --resume <sessionId> -p "msg" -+
```

Each CC instance spawns its own MCP server process via stdio transport. Shared state is persisted to `~/.cogent/cogent-state.json` with file locking so both processes see the same peer registry and message history.

## Tools Reference

The server exposes six tools, all prefixed with `cogent_`:

| Tool | Description |
|------|-------------|
| `cogent_register_peer` | Register a session as a named peer |
| `cogent_deregister_peer` | Remove a peer from the bridge |
| `cogent_send_message` | Send a message to another peer (relayed via CLI) |
| `cogent_list_peers` | List all registered peers |
| `cogent_get_history` | Retrieve message history |
| `cogent_health_check` | Diagnose bridge operational status |

## Configuration

All settings are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `COGENT_STATE_PATH` | `~/.cogent` | Directory for state file and logs |
| `COGENT_TIMEOUT_MS` | `120000` (2 min) | CLI subprocess timeout in milliseconds |
| `COGENT_CHAR_LIMIT` | `0` (unlimited) | Max characters in relayed message |
| `COGENT_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `COGENT_STALE_TIMEOUT_MS` | `1800000` (30 min) | Idle time before peer is flagged stale |

## Links

- [cogent.tools](https://cogent.tools) — Cloud relay server with live stats
- [How-To Guide](https://cogent.tools/how-to) — Real-world use cases for teams
- [npm: @essentialai/cogent-bridge](https://www.npmjs.com/package/@essentialai/cogent-bridge)
- [GitHub: Source](https://github.com/eaisdevelopment/mcp-agent-bridge)
- [Essential AI Solutions](https://essentialai.uk)

## License

ISC
