# CC Bridge - Claude Code Plugin

Inter-session communication bridge for Claude Code. Enables two or more Claude Code sessions to exchange messages in real time.

## Installation

### Via Marketplace (Recommended)

```bash
claude plugin marketplace add eaisdevelopment/cc-bridge-marketplace
claude plugin install cc-bridge@cc-bridge-marketplace
```

### Local Testing

```bash
claude --plugin-dir /path/to/cc-bridge-plugin
```

## Usage

### Register on the Bridge

```
/cc-bridge:register backend
```

Or just tell Claude: "Register on the bridge as backend"

### Check Bridge Status

```
/cc-bridge:status
```

### Send a Message

```
/cc-bridge:send frontend Hey, can you check if the API is working?
```

### Set Up Shared Folder for Multiple Projects

```
/cc-bridge:init /path/to/backend /path/to/frontend
```

Or with a custom shared state path:

```
/cc-bridge:init /path/to/backend /path/to/frontend --share /path/to/cc-share
```

Creates `.mcp.json` in each project pointing to the same shared state directory.

### Run the Demo

```
/cc-bridge:demo
```

## Configuration

The plugin uses sensible defaults. To customize, create a `.mcp.json` in your project with:

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

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_BRIDGE_STATE_PATH` | `~/cloud_code_bridge` | Shared state directory |
| `CC_BRIDGE_LOG_LEVEL` | `info` | Log verbosity (debug/info/warn/error) |
| `CC_BRIDGE_TIMEOUT_MS` | `180000` | CLI subprocess timeout |
| `CC_BRIDGE_CHAR_LIMIT` | `0` | Message truncation (0 = no limit) |
| `CC_BRIDGE_STALE_TIMEOUT_MS` | `1800000` | Idle peer timeout (30 min) |

### Project Isolation

To keep multiple projects isolated, set a unique `CC_BRIDGE_STATE_PATH` per project in your project-level `.mcp.json`.

## How It Works

1. Each Claude Code session registers as a **peer** with a unique ID
2. Peers share state via a file-based registry
3. Messages are relayed by resuming the target's Claude Code session via `claude --resume <sessionId> -p "message"`
4. Responses are captured and returned to the sender

## Links

- [npm package](https://www.npmjs.com/package/@essentialai/cc-bridge-mcp-server)
- [GitHub repo](https://github.com/eaisdevelopment/mcp-agent-bridge)
- [MCP Registry](https://registry.modelcontextprotocol.io)
