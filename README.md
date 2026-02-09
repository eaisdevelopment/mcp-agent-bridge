# cc-bridge-mcp-server

MCP server for inter-Claude-Code session communication bridge. Enables two separate Claude Code instances to collaborate on cross-boundary debugging by relaying messages between their sessions via CLI subprocess calls.

## Problem

Two Claude Code instances — one working on a backend repo, another on a frontend repo — need to negotiate testing scenarios and debug collaboratively in real-time without mixing their accumulated project context.

## Architecture

```
CC_Backend                                CC_Frontend
    │                                         │
    ├── .mcp.json ──► cc-bridge-mcp-server    │
    │                    │                    │
    │                    ├── /tmp/cc-bridge-state.json (shared state)
    │                    │                    │
    │                    │   ◄── .mcp.json ───┤
    │                                         │
    └── claude --resume <sessionId> -p "msg" ─┘
```

Each CC instance spawns its own MCP server process via stdio transport. Shared state is persisted to `/tmp/cc-bridge-state.json` with file locking so both processes see the same peer registry and message history.

Key design decisions:

- `@anthropic-ai/claude-code` is a CLI binary with no programmatic Node.js API. Messages are relayed by calling `claude --resume <sessionId> -p "message"` as a subprocess.
- Stdio MCP transport means separate processes per CC instance, so in-memory state would not be shared. File-based JSON persistence at `/tmp/cc-bridge-state.json` solves this.
- File locking uses `fs.writeFile` with `flag: "wx"` (O_CREAT | O_EXCL), stale lock detection via `process.kill(pid, 0)`, and atomic writes via temp-file-then-rename.

## Prerequisites

- Node.js >= 18
- Claude Code CLI installed and available on PATH (`claude` command)
- Two active Claude Code sessions (one per repo)

## Installation

```bash
cd cc-bridge-mcp-server
npm install
npm run build
```

## Configuration

Add the MCP server to `.mcp.json` in **both** project repositories:

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/cc-bridge-mcp-server/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/` with the actual path where the project is located.

## Tools

The server exposes five tools, all prefixed with `cc_`:

### cc_register_peer

Register a Claude Code session as a named peer on the bridge.

Parameters:
- `peerId` (string) — Unique identifier, e.g. `"backend"` or `"frontend"`
- `sessionId` (string) — Claude Code session ID (used with `--resume`)
- `cwd` (string) — Absolute path to the project working directory
- `label` (string) — Human-readable label, e.g. `"CC_Backend"`

### cc_deregister_peer

Remove a peer from the bridge.

Parameters:
- `peerId` (string) — The peer ID to remove

### cc_send_message

Send a message from one registered peer to another. The message is relayed by resuming the target's Claude Code session via CLI subprocess.

Parameters:
- `fromPeerId` (string) — Sender peer ID
- `toPeerId` (string) — Recipient peer ID
- `message` (string) — Message content

### cc_list_peers

List all currently registered peers. No parameters.

### cc_get_history

Retrieve message exchange history.

Parameters:
- `peerId` (string, optional) — Filter history to messages involving this peer
- `limit` (number, optional, default 50) — Maximum number of messages to return

## Usage Workflow

1. Start two Claude Code sessions, one per repo. Note each session ID.

2. In CC_Backend, register both peers:
```
Use cc_register_peer to register:
  peerId: "backend", sessionId: "<backend-session-id>", cwd: "/path/to/backend", label: "CC_Backend"

Use cc_register_peer to register:
  peerId: "frontend", sessionId: "<frontend-session-id>", cwd: "/path/to/frontend", label: "CC_Frontend"
```

3. Send a message from backend to frontend:
```
Use cc_send_message with fromPeerId: "backend", toPeerId: "frontend", message: "What endpoint does the login form POST to?"
```

4. The bridge resumes the frontend CC session, delivers the message, and returns the response.

5. Check message history at any time:
```
Use cc_get_history to see all exchanges, or filter by peerId.
```

## Project Structure

```
src/
├── index.ts                 # Server entry point, registers tools, starts stdio transport
├── types.ts                 # Core interfaces (PeerInfo, MessageRecord, etc.)
├── constants.ts             # CHARACTER_LIMIT, CLI_TIMEOUT_MS, server name/version
├── services/
│   ├── cc-cli.ts            # CLI subprocess wrapper (execFile with claude --resume)
│   └── peer-registry.ts     # File-based shared state with locking
└── tools/
    ├── register-peer.ts     # cc_register_peer
    ├── deregister-peer.ts   # cc_deregister_peer
    ├── send-message.ts      # cc_send_message
    ├── list-peers.ts        # cc_list_peers
    └── get-history.ts       # cc_get_history
```

## Constants

| Constant | Value | Description |
|---|---|---|
| `CHARACTER_LIMIT` | 25,000 | Max characters in CLI output |
| `CLI_TIMEOUT_MS` | 120,000 | CLI subprocess timeout (2 min) |
| `MAX_MESSAGES` | 500 | Max stored message records |

## Shared State

State is persisted at `/tmp/cc-bridge-state.json`. The file contains:

```json
{
  "peers": {
    "backend": { "peerId": "backend", "sessionId": "...", "cwd": "...", "label": "CC_Backend", "registeredAt": "..." },
    "frontend": { "peerId": "frontend", "sessionId": "...", "cwd": "...", "label": "CC_Frontend", "registeredAt": "..." }
  },
  "messages": [
    { "id": "...", "fromPeerId": "backend", "toPeerId": "frontend", "message": "...", "response": "...", "timestamp": "...", "durationMs": 1234, "success": true, "error": null }
  ]
}
```

Lock file: `/tmp/cc-bridge-state.json.lock`

## Scripts

| Script | Command | Description |
|---|---|---|
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm run dev` | `tsx watch src/index.ts` | Development mode with auto-reload |
| `npm start` | `node dist/index.js` | Run compiled server |
| `npm run clean` | `rm -rf dist` | Remove build artifacts |

## License

ISC
