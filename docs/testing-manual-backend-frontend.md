# CC Bridge Testing Manual: Backend + Frontend Projects

Step-by-step guide to test CC Bridge with two real projects using `npx @essentialai/cc-bridge-mcp-server init`.

---

## Prerequisites

- Node.js >= 18 installed
- Claude Code CLI installed (`claude` available in PATH)
- Two terminal windows (+ one for the API server)

---

## Step 1: Create the Test Projects

### 1.1 Backend Project

```bash
mkdir -p ~/test-bridge/backend
cd ~/test-bridge/backend
npm init -y
npm install express cors
```

Create `~/test-bridge/backend/server.js`:

```js
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob',   email: 'bob@example.com',   role: 'user' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' },
];

// GET /api/users - works fine
app.get('/api/users', (req, res) => {
  res.json({ success: true, data: users });
});

// GET /api/users/:id - BUG: wrong response shape + no 404
app.get('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const user = users.find(u => u.id === id);
  // BUG 1: No 404 — returns 200 with undefined when user not found
  // BUG 2: Extra nesting — data.user.record instead of just data
  res.json({ success: true, data: { user: { record: user } } });
});

app.listen(3001, () => console.log('API running on http://localhost:3001'));
```

### 1.2 Frontend Project

```bash
mkdir -p ~/test-bridge/frontend
cd ~/test-bridge/frontend
npm init -y
npm install axios
```

Create `~/test-bridge/frontend/app.js`:

```js
const axios = require('axios');
const API_BASE = 'http://localhost:3001';

async function listUsers() {
  const res = await axios.get(`${API_BASE}/api/users`);
  return res.data.data;
}

async function getUser(id) {
  const res = await axios.get(`${API_BASE}/api/users/${id}`);
  return res.data.data;
}

async function main() {
  console.log('--- List Users ---');
  const users = await listUsers();
  console.log(users);

  console.log('\n--- Get User 1 ---');
  const user = await getUser(1);
  console.log('User name:', user.name);       // undefined! (bug: extra nesting)
  console.log('User email:', user.email);      // undefined!
  console.log('Raw response:', JSON.stringify(user));

  console.log('\n--- Get User 999 (not found) ---');
  const missing = await getUser(999);
  console.log('Missing user:', JSON.stringify(missing)); // No 404
}

main().catch(console.error);
```

---

## Step 2: Run the Wizard

```bash
npx @essentialai/cc-bridge-mcp-server init
```

The wizard will show:

```
╔══════════════════════════════════════╗
║   CC Bridge — Setup Wizard          ║
║   Inter-session communication       ║
╚══════════════════════════════════════╝

? What would you like to set up?
  [1] Demo — Two sample projects with a planted bug
  [2] Real — Add CC Bridge to two existing projects
```

**Choose `2` (Real).**

Answer the prompts:

| Prompt                       | Enter                              |
|------------------------------|-------------------------------------|
| Absolute path to Project A   | `/Users/YOUR_USER/test-bridge/backend`  |
| Peer ID for Project A        | `backend` (or accept default)       |
| Label for Project A          | `CC_Backend` (or accept default)    |
| Absolute path to Project B   | `/Users/YOUR_USER/test-bridge/frontend` |
| Peer ID for Project B        | `frontend` (or accept default)      |
| Label for Project B          | `CC_Frontend` (or accept default)   |

The wizard will create/modify these files:

| File | Action |
|------|--------|
| `~/test-bridge/backend/.mcp.json` | Created — CC Bridge MCP server config |
| `~/test-bridge/backend/CLAUDE.md` | Created — Bridge protocol instructions |
| `~/test-bridge/frontend/.mcp.json` | Created — CC Bridge MCP server config |
| `~/test-bridge/frontend/CLAUDE.md` | Created — Bridge protocol instructions |

---

## Step 3: Verify the Wizard Output

Check that the files were created correctly:

```bash
cat ~/test-bridge/backend/.mcp.json
cat ~/test-bridge/backend/CLAUDE.md
cat ~/test-bridge/frontend/.mcp.json
cat ~/test-bridge/frontend/CLAUDE.md
```

**`.mcp.json`** should look like (both projects identical):

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

> If you use nvm, the wizard auto-detects this and uses the absolute path to npx instead of just `"npx"`.

**`CLAUDE.md`** for backend should contain a `## CC Bridge Protocol` section with `peerId="backend"`, `label="CC_Backend"`.

**`CLAUDE.md`** for frontend should contain a `## CC Bridge Protocol` section with `peerId="frontend"`, `label="CC_Frontend"`.

---

## Step 4: Start the API Server

Open a **dedicated terminal** (Terminal 0) and leave it running:

```bash
cd ~/test-bridge/backend
node server.js
```

Expected output:
```
API running on http://localhost:3001
```

---

## Step 5: Launch CC Backend (Terminal 1)

```bash
cd ~/test-bridge/backend
claude
```

Once Claude Code starts, give it this prompt:

```
Register yourself on the CC Bridge as peerId="backend", label="CC_Backend".
Use your session ID and current working directory.
Then wait — a frontend peer will contact you about a bug in the API.
When you receive a message, investigate server.js, fix the issue, and reply.
```

Claude will call `cc_register_peer`. Note the session ID (shown in Claude Code's status bar).

**Leave this terminal open and waiting.**

---

## Step 6: Launch CC Frontend (Terminal 2)

```bash
cd ~/test-bridge/frontend
claude
```

Once Claude Code starts, give it this prompt:

```
Register yourself on the CC Bridge as peerId="frontend", label="CC_Frontend".
Use your session ID and current working directory.

Then:
1. Run `node app.js` to test the API
2. You'll see bugs — GET /api/users/:id returns a wrongly nested response
   and doesn't return 404 for missing users
3. Use cc_send_message to report the bugs to peer "backend" with:
   - Which endpoint is broken
   - What you expected vs what you got
   - Steps to reproduce
4. Wait for backend's reply, then re-test and confirm or report remaining issues
```

---

## Step 7: Watch the Communication Flow

The expected sequence across both terminals:

```
Terminal 2 (Frontend)                    Terminal 1 (Backend)
    |                                        |
    |-- cc_register_peer("frontend") ------->|
    |                                        |<-- cc_register_peer("backend")
    |                                        |
    |  [runs node app.js, finds bugs]        |
    |                                        |
    |-- cc_send_message(to: "backend") ----->|
    |   "GET /api/users/:id has 2 bugs:      |
    |    1. Response nested as               |
    |       data.user.record instead of      |
    |       data directly                    |
    |    2. No 404 for missing users"        |
    |                                        |
    |                                        | [reads server.js, fixes bugs]
    |                                        |
    |<-- cc_send_message(to: "frontend") ----|
    |   "Fixed both issues in server.js:     |
    |    1. Changed to { data: user }        |
    |    2. Added 404 when user not found    |
    |    Please restart the server and       |
    |    re-test"                            |
    |                                        |
    |  [re-runs node app.js]                 |
    |                                        |
    |-- cc_send_message(to: "backend") ----->|
    |   "Confirmed! Both bugs fixed."        |
```

**Important:** After backend fixes `server.js`, you need to restart the API server in Terminal 0:
- Press `Ctrl+C` in Terminal 0
- Run `node server.js` again

Then re-test from the frontend.

---

## Step 8: Verify Message History

From either Claude Code session, ask:

```
Use cc_get_history to show all messages exchanged during this session.
```

You should see the full chronological conversation log with timestamps.

---

## Step 9: Cleanup

### Deregister peers (from either session):

```
Deregister yourself from the bridge using cc_deregister_peer.
```

### Remove test files:

```bash
rm -rf ~/test-bridge
rm -rf ~/cloud_code_bridge    # removes bridge state
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `cc_send_message` times out | Ensure both sessions are running and registered. Check with `cc_list_peers`. Default timeout is 3 minutes. |
| "peer not found" | The target hasn't registered yet. Register both peers before sending messages. |
| MCP tools not showing | Verify `.mcp.json` is in the project root. Restart Claude Code after adding it. |
| `claude` CLI not found | Set `CC_BRIDGE_CLAUDE_PATH` in `.mcp.json` env to the full path of the `claude` binary. |
| npx not found (nvm users) | The wizard auto-detects nvm and uses the absolute path. If it didn't, replace `"npx"` in `.mcp.json` with the output of `which npx`. |
| API server not running | Frontend will get connection errors. Make sure `node server.js` is running in Terminal 0 before testing. |
| Backend fixes don't take effect | Restart the API server (`Ctrl+C` then `node server.js`) after backend modifies `server.js`. |

---

## What Success Looks Like

1. The wizard created `.mcp.json` and `CLAUDE.md` in both projects
2. Both Claude Code sessions registered on the bridge
3. Frontend detected the API bugs and reported them to backend via `cc_send_message`
4. Backend received the message, investigated `server.js`, and fixed the bugs
5. Backend replied with fix details via `cc_send_message`
6. Frontend re-tested and confirmed the fix
7. `cc_get_history` shows the full conversation log
