# cc-bridge-mcp-server

MCP server for inter-Claude-Code session communication bridge.

## Quick Start

**Step 1:** Add `.mcp.json` to **both** project repositories:

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

Or use the CLI:

```bash
claude mcp add --transport stdio cc-bridge -- npx -y cc-bridge-mcp-server
```

**Step 2:** Restart Claude Code in both repos. The bridge tools are now available.

## What It Does

Two Claude Code instances -- one working on a backend repo, another on a frontend repo -- need to negotiate testing scenarios and debug collaboratively in real-time without mixing their accumulated project context.

```
CC_Backend                                CC_Frontend
    |                                         |
    +-- .mcp.json --> cc-bridge-mcp-server    |
    |                    |                    |
    |                    +-- ~/cloud_code_bridge/cc-bridge-state.json
    |                    |                    |
    |                    |   <-- .mcp.json ---+
    |                                         |
    +-- claude --resume <sessionId> -p "msg" -+
```

Each CC instance spawns its own MCP server process via stdio transport. Shared state is persisted to `~/cloud_code_bridge/cc-bridge-state.json` with file locking so both processes see the same peer registry and message history.

Messages are relayed by calling `claude --resume <sessionId> -p "message"` as a subprocess. File locking uses `fs.writeFile` with `flag: "wx"` (O_CREAT | O_EXCL), stale lock detection via `process.kill(pid, 0)`, and atomic writes via temp-file-then-rename.

## Tools Reference

The server exposes six tools, all prefixed with `cc_`:

### cc_register_peer

Register a Claude Code session as a named peer on the bridge.

| Parameter   | Type   | Required | Description                                                  |
|-------------|--------|----------|--------------------------------------------------------------|
| `peerId`    | string | yes      | Unique identifier, e.g. `"backend"` or `"frontend"`          |
| `sessionId` | string | yes      | Claude Code session ID (used with `--resume`)                |
| `cwd`       | string | yes      | Absolute path to the project working directory               |
| `label`     | string | yes      | Human-readable label, e.g. `"CC_Backend"` or `"CC_Frontend"` |

### cc_deregister_peer

Remove a previously registered peer from the bridge.

| Parameter | Type   | Required | Description                           |
|-----------|--------|----------|---------------------------------------|
| `peerId`  | string | yes      | Peer ID to deregister, e.g. `"backend"` |

### cc_send_message

Send a message from one registered peer to another. The message is relayed by resuming the target's Claude Code session via CLI subprocess. Returns the target's response.

| Parameter    | Type   | Required | Description                                |
|--------------|--------|----------|--------------------------------------------|
| `fromPeerId` | string | yes      | Peer ID of the sender, e.g. `"backend"`    |
| `toPeerId`   | string | yes      | Peer ID of the recipient, e.g. `"frontend"` |
| `message`    | string | yes      | The message content to send                |

### cc_list_peers

List all currently registered peers. Returns peer IDs, session IDs, working directories, labels, and a `potentiallyStale` flag for peers idle beyond the configured timeout. No parameters.

### cc_get_history

Retrieve the message history for the bridge. Returns messages in chronological order, most recent last.

| Parameter | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| `peerId`  | string | no       | Filter history to messages involving this peer  |
| `limit`   | number | no       | Maximum number of messages to return (default 50) |

### cc_health_check

Diagnose the bridge's operational status. No parameters required.

**Checks performed:**

- **State file** -- Can the state directory be read and written?
- **Lock mechanism** -- Can file locks be acquired and released?
- **Claude CLI** -- Is the `claude` binary available and responsive?

**Response fields:**

| Field           | Type    | Description                             |
|-----------------|---------|-----------------------------------------|
| `healthy`       | boolean | All checks passed                       |
| `serverVersion` | string  | Current server version                  |
| `statePath`     | string  | Path to state file                      |
| `claudePath`    | string  | Path to Claude CLI                      |
| `checks`        | object  | Per-check pass/fail with detail messages |
| `timestamp`     | string  | ISO timestamp of the check              |

## Configuration

All settings are configured via environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_BRIDGE_STATE_PATH` | `~/cloud_code_bridge` | Directory for state file and logs |
| `CC_BRIDGE_TIMEOUT_MS` | `120000` (2 min) | CLI subprocess timeout in milliseconds |
| `CC_BRIDGE_CHAR_LIMIT` | `0` (unlimited) | Max characters in relayed message (0 = no limit) |
| `CC_BRIDGE_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `CC_BRIDGE_CLAUDE_PATH` | `claude` | Path to the Claude Code CLI executable |
| `CC_BRIDGE_STALE_TIMEOUT_MS` | `1800000` (30 min) | Idle time before peer is flagged stale (0 = disabled) |

To override defaults, set environment variables in your `.mcp.json`:

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

## Usage Workflow

1. Start two Claude Code sessions, one per repo. Note each session ID.

2. In CC_Backend, register both peers:

   ```
   Use cc_register_peer:
     peerId: "backend", sessionId: "<backend-session-id>",
     cwd: "/path/to/backend", label: "CC_Backend"

   Use cc_register_peer:
     peerId: "frontend", sessionId: "<frontend-session-id>",
     cwd: "/path/to/frontend", label: "CC_Frontend"
   ```

3. Send a message from backend to frontend:

   ```
   Use cc_send_message:
     fromPeerId: "backend", toPeerId: "frontend",
     message: "What endpoint does the login form POST to?"
   ```

4. The bridge resumes the frontend CC session, delivers the message, and returns the response.

5. Check message history at any time:

   ```
   Use cc_get_history to see all exchanges, or filter by peerId.
   ```

6. When done, deregister peers:

   ```
   Use cc_deregister_peer:
     peerId: "backend"
   ```

## Troubleshooting

### NVM/PATH: "npx not found" or server fails to start

MCP servers are spawned as subprocesses and may not inherit your NVM configuration.

**Option 1: Use absolute path to npx**

Find your npx path with `which npx` (e.g., `/Users/you/.nvm/versions/node/v22.11.0/bin/npx`), then update `.mcp.json`:

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "/Users/you/.nvm/versions/node/v22.11.0/bin/npx",
      "args": ["-y", "cc-bridge-mcp-server"]
    }
  }
}
```

**Option 2: Use `claude mcp add` (handles PATH automatically)**

```bash
claude mcp add --transport stdio cc-bridge -- npx -y cc-bridge-mcp-server
```

**Option 3: Ensure NVM loads in non-interactive shells**

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### State file location

The bridge stores state at `~/cloud_code_bridge/cc-bridge-state.json` by default.

- Override with: `CC_BRIDGE_STATE_PATH=/your/path`
- Logs are stored at: `<state-path>/logs/`
- First-run config is persisted to `~/.cc-bridge-config.json`

### Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `CLI_NOT_FOUND` | `claude` not on PATH | Install Claude Code or set `CC_BRIDGE_CLAUDE_PATH` |
| `CLI_TIMEOUT` | Response took > 2 min | Increase `CC_BRIDGE_TIMEOUT_MS` |
| `LOCK_TIMEOUT` | Lock held by dead process | Delete `<state-path>/cc-bridge-state.json.lock` |
| `STATE_CORRUPT` | Invalid JSON in state | Auto-recovers; backup saved as `.corrupt.<timestamp>` |
| `PEER_NOT_FOUND` | Target peer not registered | Register both peers before sending messages |

## Development

Build from source:

```bash
git clone https://github.com/eaisdevelopment/cc-bridge-mcp-server.git
cd cc-bridge-mcp-server
npm install
npm run build
npm test
```

### Project Structure

```
src/
├── index.ts                 # Server entry point, registers tools, starts stdio transport
├── config.ts                # Environment variable loading and validation (zod)
├── constants.ts             # Server name and version from package.json
├── errors.ts                # BridgeError class and error code enum
├── logger.ts                # Timestamped file + stderr logger
├── startup.ts               # First-run prompt, config loading, CLI validation
├── types.ts                 # Core interfaces (PeerInfo, MessageRecord, etc.)
├── services/
│   ├── cc-cli.ts            # CLI subprocess wrapper (execFile with claude --resume)
│   ├── health-check.ts      # State file, lock, and CLI diagnostic checks
│   └── peer-registry.ts     # File-based shared state with locking
└── tools/
    ├── register-peer.ts     # cc_register_peer
    ├── deregister-peer.ts   # cc_deregister_peer
    ├── send-message.ts      # cc_send_message
    ├── list-peers.ts        # cc_list_peers
    ├── get-history.ts       # cc_get_history
    └── health-check.ts      # cc_health_check
```

### npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm run dev` | `tsx watch src/index.ts` | Development mode with auto-reload |
| `npm start` | `node dist/index.js` | Run compiled server |
| `npm run clean` | `rm -rf dist` | Remove build artifacts |
| `npm test` | `vitest run` | Run test suite |
| `npm run test:watch` | `vitest` | Run tests in watch mode |
| `npm run test:coverage` | `vitest run --coverage` | Run tests with coverage report |

## License

ISC
