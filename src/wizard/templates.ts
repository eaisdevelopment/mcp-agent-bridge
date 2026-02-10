export function mcpJsonContent(npxPath: string): string {
  const config = {
    mcpServers: {
      "cc-bridge": {
        command: npxPath,
        args: ["-y", "@essentialai/cc-bridge-mcp-server"],
        env: {
          CC_BRIDGE_LOG_LEVEL: "info",
          CC_BRIDGE_TIMEOUT_MS: "180000",
        },
      },
    },
  };
  return JSON.stringify(config, null, 2) + "\n";
}

export function mcpJsonMerge(
  existing: string,
  npxPath: string,
): string {
  const parsed = JSON.parse(existing);
  if (!parsed.mcpServers) parsed.mcpServers = {};
  parsed.mcpServers["cc-bridge"] = {
    command: npxPath,
    args: ["-y", "@essentialai/cc-bridge-mcp-server"],
    env: {
      CC_BRIDGE_LOG_LEVEL: "info",
      CC_BRIDGE_TIMEOUT_MS: "180000",
    },
  };
  return JSON.stringify(parsed, null, 2) + "\n";
}

export function claudeMdBridgeSection(
  peerId: string,
  label: string,
  otherPeerId: string,
): string {
  return `
## CC Bridge Protocol

You are participating in a cross-team collaboration via CC Bridge.
Your peer identity: **peerId=\`${peerId}\`**, **label=\`${label}\`**

### On Session Start
1. Find your Claude Code session ID:
   \`\`\`bash
   ls -t ~/.claude/projects/$(pwd | tr '/' '-')/*.jsonl 2>/dev/null | head -1 | xargs -I{} basename {} .jsonl
   \`\`\`
2. Register yourself on the bridge:
   - Use \`cc_register_peer\` with peerId="${peerId}", label="${label}"
   - Set sessionId to the UUID from step 1
   - Set cwd to your project working directory (\`pwd\`)

### When You Receive Messages
- Messages from other peers arrive with a \`[CC Bridge message from ...]\` header
- Your entire response is automatically relayed back to the sender
- Do NOT use \`cc_send_message\` to reply — just answer directly and normally
- Read carefully, investigate the issue, and respond with specifics

### Sending Messages
- Use \`cc_send_message\` to initiate conversations with other peers (e.g. toPeerId="${otherPeerId}")
- Be specific about what you changed when reporting fixes
- Include file names and line numbers in your responses
`;
}

export function demoServerJs(): string {
  return `// server.js
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
`;
}

export function demoAppJs(): string {
  // Using regular string concatenation to avoid template literal escaping issues.
  // The output JavaScript uses backtick template literals with ${} interpolation.
  const lines = [
    "// app.js",
    "const axios = require('axios');",
    "const API_BASE = 'http://localhost:3001';",
    "",
    "async function listUsers() {",
    "  const res = await axios.get(`${API_BASE}/api/users`);",
    "  return res.data.data;",
    "}",
    "",
    "async function getUser(id) {",
    "  const res = await axios.get(`${API_BASE}/api/users/${id}`);",
    "  // Frontend expects: { success: true, data: { id, name, email, role } }",
    "  // But gets:         { success: true, data: { user: { record: {...} } } }",
    "  return res.data.data;",
    "}",
    "",
    "async function main() {",
    "  console.log('--- List Users ---');",
    "  const users = await listUsers();",
    "  console.log(users);",
    "",
    "  console.log('\\n--- Get User 1 ---');",
    "  const user = await getUser(1);",
    "  console.log('User name:', user.name);       // undefined! Bug: extra nesting",
    "  console.log('User email:', user.email);      // undefined!",
    "  console.log('Raw response:', JSON.stringify(user));",
    "",
    "  console.log('\\n--- Get User 999 (not found) ---');",
    "  const missing = await getUser(999);",
    "  console.log('Missing user:', JSON.stringify(missing)); // No 404, gets 200 with undefined",
    "}",
    "",
    "main().catch(console.error);",
    "",
  ];
  return lines.join("\n");
}

export function demoPackageJson(
  name: string,
  deps: Record<string, string>,
): string {
  const pkg = {
    name,
    version: "1.0.0",
    private: true,
    dependencies: deps,
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

export function demoBackendClaudeMd(): string {
  return `# CC Backend - API Server

You are the Backend development team working on an Express.js API server.

## Project
- Express.js REST API running on port 3001
- Entry point: server.js

${claudeMdBridgeSection("backend", "CC_Backend", "frontend")}
### Bug Fix Protocol
- When you receive a bug report, read server.js and investigate
- Fix the issue, then notify the reporter with details of what changed
- Include file names and line numbers in your response
- After fixing, tell the other peer exactly how to test the fix
`;
}

export function demoFrontendClaudeMd(): string {
  return `# CC Frontend - Web Client

You are the Frontend development team consuming the Backend API.

## Project
- Node.js client consuming REST API at http://localhost:3001
- Entry point: app.js

${claudeMdBridgeSection("frontend", "CC_Frontend", "backend")}
### Bug Reporting Protocol
- When reporting bugs, include: endpoint, expected behavior, actual behavior, and reproduction steps
- When confirming fixes, actually run \`node app.js\` and report results
- If the fix works, confirm success. If not, describe what's still broken.
`;
}
