# CC Bridge Real-World Test: Bug Report Communication Scenario

## Overview

Two isolated Claude Code sessions collaborate to find and fix an API bug:

| Role | Peer ID | Label | Project |
|------|---------|-------|---------|
| Backend Team | `backend` | `CC_Backend` | `~/test-bridge/api-server` |
| Frontend Team | `frontend` | `CC_Frontend` | `~/test-bridge/web-client` |

---

## Phase 1: Prepare the Test Projects

### 1.1 Create the Backend Project

```bash
mkdir -p ~/test-bridge/api-server
cd ~/test-bridge/api-server
npm init -y
npm install express cors
```

Create `server.js` with a **deliberate bug** (wrong status code + malformed response on the `/api/users/:id` endpoint):

```js
// server.js
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' },
];

// GET /api/users - works fine
app.get('/api/users', (req, res) => {
  res.json({ success: true, data: users });
});

// GET /api/users/:id - BUG: returns 200 with wrong shape when user not found
app.get('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const user = users.find(u => u.id === id);

  // BUG 1: No 404 handling - returns 200 with { success: true, data: undefined }
  // BUG 2: When user IS found, wraps in extra nested object
  res.json({ success: true, data: { user: { record: user } } });
});

// POST /api/users - works fine
app.post('/api/users', (req, res) => {
  const { name, email, role } = req.body;
  const newUser = { id: users.length + 1, name, email, role: role || 'user' };
  users.push(newUser);
  res.status(201).json({ success: true, data: newUser });
});

app.listen(3001, () => console.log('API running on http://localhost:3001'));
```

### 1.2 Create the Frontend Project

```bash
mkdir -p ~/test-bridge/web-client
cd ~/test-bridge/web-client
npm init -y
npm install axios
```

Create `app.js` that consumes the API:

```js
// app.js
const axios = require('axios');
const API_BASE = 'http://localhost:3001';

async function listUsers() {
  const res = await axios.get(`${API_BASE}/api/users`);
  return res.data.data; // works: returns array
}

async function getUser(id) {
  const res = await axios.get(`${API_BASE}/api/users/${id}`);
  // Frontend expects: { success: true, data: { id, name, email, role } }
  // But gets:         { success: true, data: { user: { record: {...} } } }
  return res.data.data;
}

async function main() {
  console.log('--- List Users ---');
  const users = await listUsers();
  console.log(users);

  console.log('\n--- Get User 1 ---');
  const user = await getUser(1);
  console.log('User name:', user.name);       // undefined! Bug: extra nesting
  console.log('User email:', user.email);      // undefined!
  console.log('Raw response:', JSON.stringify(user));

  console.log('\n--- Get User 999 (not found) ---');
  const missing = await getUser(999);
  console.log('Missing user:', JSON.stringify(missing)); // No 404, gets 200 with undefined
}

main().catch(console.error);
```

---

## Phase 2: Configure CC Bridge MCP Server on Both Projects

### 2.1 Add `.mcp.json` to BOTH projects

Create identical `.mcp.json` in **both** `~/test-bridge/api-server/` and `~/test-bridge/web-client/`:

```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "npx",
      "args": ["-y", "@essentialai/cc-bridge-mcp-server"],
      "env": {
        "CC_BRIDGE_LOG_LEVEL": "info",
        "CC_BRIDGE_TIMEOUT_MS": "180000"
      }
    }
  }
}
```

> **Note:** If you use `nvm`, replace `"command": "npx"` with the full path, e.g. `"/Users/YOU/.nvm/versions/node/v22.11.0/bin/npx"`.

### 2.2 Create `CLAUDE.md` for Backend Project

Create `~/test-bridge/api-server/CLAUDE.md`:

```markdown
# CC Backend - API Server

You are the Backend development team working on an Express.js API server.

## Project
- Express.js REST API running on port 3001
- Entry point: server.js

## CC Bridge Protocol

You are participating in a cross-team collaboration via CC Bridge.
Your peer identity: **peerId=`backend`**, **label=`CC_Backend`**

### On Session Start
1. Register yourself on the bridge:
   - Use `cc_register_peer` with peerId="backend", label="CC_Backend"
   - Your sessionId and cwd will be provided to you

### When You Receive Messages
- Messages from other peers arrive prefixed with `[From <label> (<peerId>)]:`
- Read carefully, investigate the reported issue, fix it, and reply

### Communication Rules
- Always use `cc_send_message` to communicate with other peers
- Be specific about what you changed when reporting fixes
- Include file names and line numbers in your responses
- After fixing a bug, tell the other peer exactly how to test the fix
```

### 2.3 Create `CLAUDE.md` for Frontend Project

Create `~/test-bridge/web-client/CLAUDE.md`:

```markdown
# CC Frontend - Web Client

You are the Frontend development team consuming the Backend API.

## Project
- Node.js client consuming REST API at http://localhost:3001
- Entry point: app.js

## CC Bridge Protocol

You are participating in a cross-team collaboration via CC Bridge.
Your peer identity: **peerId=`frontend`**, **label=`CC_Frontend`**

### On Session Start
1. Register yourself on the bridge:
   - Use `cc_register_peer` with peerId="frontend", label="CC_Frontend"
   - Your sessionId and cwd will be provided to you

### When You Receive Messages
- Messages from other peers arrive prefixed with `[From <label> (<peerId>)]:`
- Read carefully and respond via `cc_send_message`

### Communication Rules
- Always use `cc_send_message` to communicate with other peers
- When reporting bugs, include: endpoint, expected behavior, actual behavior, and reproduction steps
- When confirming fixes, actually run the code and report results
```

---

## Phase 3: Run the Scenario

You need **two terminal windows** open side by side.

### Step 1: Start the Backend API

In a **third terminal** (or background):

```bash
cd ~/test-bridge/api-server
node server.js
```

Leave it running on port 3001.

### Step 2: Launch CC Backend (Terminal 1)

```bash
cd ~/test-bridge/api-server
claude
```

Once inside Claude Code, give it this prompt:

```
Register yourself on the CC Bridge as peerId="backend", label="CC_Backend".
Use your session ID and current working directory.
Then wait — a frontend team peer will contact you about a bug in our API.
When you receive a message, investigate and fix the issue in server.js.
```

> **Important:** Note the session ID that Claude Code shows (visible in the status bar or at startup). CC Backend needs it for registration.

### Step 3: Launch CC Frontend (Terminal 2)

```bash
cd ~/test-bridge/web-client
claude
```

Once inside Claude Code, give it this prompt:

```
Register yourself on the CC Bridge as peerId="frontend", label="CC_Frontend".
Use your session ID and current working directory.

Then do the following:
1. Run `node app.js` to test the API
2. You will see bugs — the GET /api/users/:id endpoint returns a wrongly nested
   response and doesn't handle 404 for missing users
3. Use cc_send_message to report the bug to peer "backend" with:
   - Which endpoint is broken
   - What you expected vs what you got
   - Steps to reproduce
4. Wait for backend's reply, then re-test and confirm or report remaining issues
```

### Step 4: Watch the Communication Flow

The expected sequence:

```
CC_Frontend                              CC_Backend
    |                                        |
    |-- cc_register_peer(frontend) --------->|
    |                                        |<-- cc_register_peer(backend)
    |                                        |
    |  [runs node app.js, finds bugs]        |
    |                                        |
    |-- cc_send_message(to: backend) ------->|
    |   "GET /api/users/:id has 2 bugs:      |
    |    1. Response nested as                |
    |       data.user.record instead of       |
    |       data directly                     |
    |    2. No 404 for missing users"         |
    |                                        |
    |                                        | [reads server.js, fixes bugs]
    |                                        |
    |<-- cc_send_message(to: frontend) ------|
    |   "Fixed both issues:                   |
    |    1. Changed response to               |
    |       { success: true, data: user }     |
    |    2. Added 404 with                    |
    |       { success: false, error: '...' }  |
    |    Please re-test"                      |
    |                                        |
    |  [runs node app.js again]              |
    |                                        |
    |-- cc_send_message(to: backend) ------->|
    |   "Confirmed! Both bugs fixed.          |
    |    user.name returns 'Alice',           |
    |    user 999 now returns 404"            |
    |                                        |
    |                                        | [marks fix as success]
```

### Step 5: Verify the History

From either terminal, you can ask Claude to:

```
Use cc_get_history to show all messages exchanged during this session.
```

This returns the full conversation log with timestamps and response data.

---

## Phase 4: Cleanup

When done, from either session:

```
Deregister yourself from the bridge using cc_deregister_peer.
```

To fully clean up:

```bash
rm -rf ~/test-bridge
rm -rf ~/cloud_code_bridge    # removes bridge state
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `cc_send_message` times out | Ensure the target session is still running and registered. Check with `cc_list_peers`. Default timeout is 2 minutes. |
| "peer not found" error | The target hasn't registered yet. Register both peers before sending messages. |
| MCP tools not available | Verify `.mcp.json` is in the project root. Restart Claude Code after adding it. |
| `claude` CLI not found | Set `CC_BRIDGE_CLAUDE_PATH` in `.mcp.json` env to the full path of the `claude` binary. |
| Node/npx path issues (nvm) | Use absolute path to `npx` in `.mcp.json` `command` field. |

---

## Key Points

1. **Both sessions must be running simultaneously** — the bridge relays messages by resuming the target's Claude Code session via `claude --resume <sessionId>`
2. **Registration must happen first** — both peers register before any communication
3. **Messages are synchronous** — `cc_send_message` blocks until the target responds (up to timeout)
4. **State is shared via file** — both MCP server instances read/write `~/cloud_code_bridge/cc-bridge-state.json`
5. **Session IDs are critical** — each Claude Code instance has a unique session ID that the bridge uses to route messages
