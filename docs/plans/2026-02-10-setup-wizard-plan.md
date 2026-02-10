# Setup Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an `init` subcommand to `cc-bridge-mcp-server` that interactively scaffolds CC Bridge configuration for two projects (demo or real).

**Architecture:** New `src/cli.ts` entry point routes `init` to the wizard, everything else to the existing MCP server. Wizard code lives in `src/wizard/` — pure Node builtins, zero new dependencies. Templates are string functions, prompts use `readline`.

**Tech Stack:** TypeScript, Node built-in `readline`, `fs`, `path`, `child_process`. Vitest for tests.

---

### Task 1: Create `src/wizard/prompts.ts` — readline helpers

**Files:**
- Create: `src/wizard/prompts.ts`
- Test: `src/wizard/prompts.test.ts`

**Step 1: Write the failing tests**

Create `src/wizard/prompts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as readline from "node:readline";

// We'll test the prompt functions by mocking readline
// The functions: ask(), choose(), confirm()

describe("ask", () => {
  it("returns user input trimmed", async () => {
    const { ask } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("  hello  ")),
      close: vi.fn(),
    };
    const result = await ask(mockRl as any, "Name? ");
    expect(result).toBe("hello");
  });

  it("returns default when user presses enter with no input", async () => {
    const { ask } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("")),
      close: vi.fn(),
    };
    const result = await ask(mockRl as any, "Name? ", "default-val");
    expect(result).toBe("default-val");
  });
});

describe("choose", () => {
  it("returns selected option by number", async () => {
    const { choose } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("2")),
      close: vi.fn(),
    };
    const result = await choose(mockRl as any, "Pick:", ["Alpha", "Beta"]);
    expect(result).toBe(1); // 0-indexed
  });
});

describe("confirm", () => {
  it("returns true for 'y'", async () => {
    const { confirm } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("y")),
      close: vi.fn(),
    };
    const result = await confirm(mockRl as any, "OK?");
    expect(result).toBe(true);
  });

  it("returns false for 'n'", async () => {
    const { confirm } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("n")),
      close: vi.fn(),
    };
    const result = await confirm(mockRl as any, "OK?");
    expect(result).toBe(false);
  });

  it("returns default when pressing enter", async () => {
    const { confirm } = await import("./prompts.js");
    const mockRl = {
      question: vi.fn((_q: string, cb: (answer: string) => void) => cb("")),
      close: vi.fn(),
    };
    const result = await confirm(mockRl as any, "OK?", true);
    expect(result).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wizard/prompts.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/wizard/prompts.ts`:

```typescript
import type { Interface as RLInterface } from "node:readline";

// ANSI helpers
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function ask(
  rl: RLInterface,
  question: string,
  defaultVal?: string,
): Promise<string> {
  const suffix = defaultVal ? ` ${c.dim}(${defaultVal})${c.reset} ` : " ";
  return new Promise((resolve) => {
    rl.question(`${c.cyan}?${c.reset} ${question}${suffix}`, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultVal || "");
    });
  });
}

export function choose(
  rl: RLInterface,
  question: string,
  options: string[],
): Promise<number> {
  return new Promise((resolve) => {
    const lines = options
      .map((opt, i) => `  ${c.bold}[${i + 1}]${c.reset} ${opt}`)
      .join("\n");
    rl.question(
      `${c.cyan}?${c.reset} ${question}\n${lines}\n${c.cyan}>${c.reset} `,
      (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= options.length) {
          resolve(num - 1);
        } else {
          // Default to first option on invalid input
          resolve(0);
        }
      },
    );
  });
}

export function confirm(
  rl: RLInterface,
  question: string,
  defaultVal = false,
): Promise<boolean> {
  const hint = defaultVal ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(
      `${c.cyan}?${c.reset} ${question} ${c.dim}(${hint})${c.reset} `,
      (answer) => {
        const val = answer.trim().toLowerCase();
        if (val === "") resolve(defaultVal);
        else resolve(val === "y" || val === "yes");
      },
    );
  });
}

export function banner(): void {
  console.log(`
${c.cyan}╔══════════════════════════════════════╗
║   CC Bridge — Setup Wizard          ║
║   Inter-session communication       ║
╚══════════════════════════════════════╝${c.reset}
`);
}

export function success(msg: string): void {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${c.yellow}!${c.reset} ${msg}`);
}

export function heading(msg: string): void {
  console.log(`\n${c.bold}━━━ ${msg} ━━━${c.reset}\n`);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wizard/prompts.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wizard/prompts.ts src/wizard/prompts.test.ts
git commit -m "feat(wizard): add readline prompt helpers"
```

---

### Task 2: Create `src/wizard/detect.ts` — detect npx and claude paths

**Files:**
- Create: `src/wizard/detect.ts`
- Test: `src/wizard/detect.test.ts`

**Step 1: Write the failing tests**

Create `src/wizard/detect.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import * as childProcess from "node:child_process";

vi.mock("node:child_process");

describe("detectNpxPath", () => {
  it("returns absolute npx path from which", async () => {
    vi.mocked(childProcess.execSync).mockReturnValue(
      Buffer.from("/Users/dev/.nvm/versions/node/v22.11.0/bin/npx\n"),
    );
    const { detectNpxPath } = await import("./detect.js");
    const result = detectNpxPath();
    expect(result).toBe("/Users/dev/.nvm/versions/node/v22.11.0/bin/npx");
  });

  it("returns 'npx' when which fails", async () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const { detectNpxPath } = await import("./detect.js");
    const result = detectNpxPath();
    expect(result).toBe("npx");
  });
});

describe("detectClaudePath", () => {
  it("returns absolute claude path from which", async () => {
    vi.mocked(childProcess.execSync).mockReturnValue(
      Buffer.from("/usr/local/bin/claude\n"),
    );
    const { detectClaudePath } = await import("./detect.js");
    const result = detectClaudePath();
    expect(result).toBe("/usr/local/bin/claude");
  });

  it("returns null when claude not found", async () => {
    vi.mocked(childProcess.execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const { detectClaudePath } = await import("./detect.js");
    const result = detectClaudePath();
    expect(result).toBeNull();
  });
});

describe("isNvmPath", () => {
  it("detects nvm paths", async () => {
    const { isNvmPath } = await import("./detect.js");
    expect(isNvmPath("/Users/dev/.nvm/versions/node/v22/bin/npx")).toBe(true);
    expect(isNvmPath("/usr/local/bin/npx")).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wizard/detect.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/wizard/detect.ts`:

```typescript
import { execSync } from "node:child_process";

export function detectNpxPath(): string {
  try {
    return execSync("which npx", { encoding: "utf-8" }).trim();
  } catch {
    return "npx";
  }
}

export function detectClaudePath(): string | null {
  try {
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function isNvmPath(p: string): boolean {
  return p.includes(".nvm/versions/");
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wizard/detect.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wizard/detect.ts src/wizard/detect.test.ts
git commit -m "feat(wizard): add npx and claude CLI detection"
```

---

### Task 3: Create `src/wizard/templates.ts` — file content generators

**Files:**
- Create: `src/wizard/templates.ts`
- Test: `src/wizard/templates.test.ts`

**Step 1: Write the failing tests**

Create `src/wizard/templates.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("mcpJsonContent", () => {
  it("generates valid JSON with npx path", async () => {
    const { mcpJsonContent } = await import("./templates.js");
    const result = mcpJsonContent("/usr/local/bin/npx");
    const parsed = JSON.parse(result);
    expect(parsed.mcpServers["cc-bridge"].command).toBe("/usr/local/bin/npx");
    expect(parsed.mcpServers["cc-bridge"].args).toContain("cc-bridge-mcp-server");
  });
});

describe("claudeMdBridgeSection", () => {
  it("includes peerId and label", async () => {
    const { claudeMdBridgeSection } = await import("./templates.js");
    const result = claudeMdBridgeSection("backend", "CC_Backend", "frontend");
    expect(result).toContain('peerId="backend"');
    expect(result).toContain("CC_Backend");
    expect(result).toContain("frontend");
  });
});

describe("demoServerJs", () => {
  it("generates Express server code with bugs", async () => {
    const { demoServerJs } = await import("./templates.js");
    const result = demoServerJs();
    expect(result).toContain("express");
    expect(result).toContain("BUG");
    expect(result).toContain("3001");
  });
});

describe("demoAppJs", () => {
  it("generates client code", async () => {
    const { demoAppJs } = await import("./templates.js");
    const result = demoAppJs();
    expect(result).toContain("axios");
    expect(result).toContain("3001");
  });
});

describe("demoPackageJson", () => {
  it("generates valid JSON for backend", async () => {
    const { demoPackageJson } = await import("./templates.js");
    const result = demoPackageJson("api-server", { express: "^4.21.0", cors: "^2.8.5" });
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("api-server");
    expect(parsed.dependencies.express).toBeDefined();
  });
});

describe("demoBackendClaudeMd", () => {
  it("contains backend-specific instructions", async () => {
    const { demoBackendClaudeMd } = await import("./templates.js");
    const result = demoBackendClaudeMd();
    expect(result).toContain("backend");
    expect(result).toContain("CC_Backend");
    expect(result).toContain("server.js");
  });
});

describe("demoFrontendClaudeMd", () => {
  it("contains frontend-specific instructions", async () => {
    const { demoFrontendClaudeMd } = await import("./templates.js");
    const result = demoFrontendClaudeMd();
    expect(result).toContain("frontend");
    expect(result).toContain("CC_Frontend");
    expect(result).toContain("app.js");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wizard/templates.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/wizard/templates.ts`:

```typescript
export function mcpJsonContent(npxPath: string): string {
  const config = {
    mcpServers: {
      "cc-bridge": {
        command: npxPath,
        args: ["-y", "cc-bridge-mcp-server"],
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
    args: ["-y", "cc-bridge-mcp-server"],
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
1. Register yourself on the bridge:
   - Use \`cc_register_peer\` with peerId="${peerId}", label="${label}"
   - Your sessionId and cwd will be provided to you

### When You Receive Messages
- Messages from other peers arrive prefixed with \`[From <label> (<peerId>)]:\`
- Read carefully, investigate the issue, and reply via \`cc_send_message\`

### Communication Rules
- Always use \`cc_send_message\` to communicate with other peers (e.g. toPeerId="${otherPeerId}")
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
  return `// app.js
const axios = require('axios');
const API_BASE = 'http://localhost:3001';

async function listUsers() {
  const res = await axios.get(\`\${API_BASE}/api/users\`);
  return res.data.data;
}

async function getUser(id) {
  const res = await axios.get(\`\${API_BASE}/api/users/\${id}\`);
  // Frontend expects: { success: true, data: { id, name, email, role } }
  // But gets:         { success: true, data: { user: { record: {...} } } }
  return res.data.data;
}

async function main() {
  console.log('--- List Users ---');
  const users = await listUsers();
  console.log(users);

  console.log('\\n--- Get User 1 ---');
  const user = await getUser(1);
  console.log('User name:', user.name);       // undefined! Bug: extra nesting
  console.log('User email:', user.email);      // undefined!
  console.log('Raw response:', JSON.stringify(user));

  console.log('\\n--- Get User 999 (not found) ---');
  const missing = await getUser(999);
  console.log('Missing user:', JSON.stringify(missing)); // No 404, gets 200 with undefined
}

main().catch(console.error);
`;
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wizard/templates.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wizard/templates.ts src/wizard/templates.test.ts
git commit -m "feat(wizard): add file content templates"
```

---

### Task 4: Create `src/wizard/scaffold-demo.ts` — demo mode scaffolder

**Files:**
- Create: `src/wizard/scaffold-demo.ts`
- Test: `src/wizard/scaffold-demo.test.ts`

**Step 1: Write the failing tests**

Create `src/wizard/scaffold-demo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("scaffoldDemo", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates all 8 expected files", async () => {
    const { scaffoldDemo } = await import("./scaffold-demo.js");
    const baseDir = path.join(tmpDir, "demo");
    const result = scaffoldDemo(baseDir, "/usr/local/bin/npx");

    expect(result.files).toHaveLength(8);

    const expected = [
      "api-server/package.json",
      "api-server/server.js",
      "api-server/.mcp.json",
      "api-server/CLAUDE.md",
      "web-client/package.json",
      "web-client/app.js",
      "web-client/.mcp.json",
      "web-client/CLAUDE.md",
    ];

    for (const f of expected) {
      const fullPath = path.join(baseDir, f);
      expect(fs.existsSync(fullPath), `Expected ${f} to exist`).toBe(true);
    }
  });

  it("creates valid JSON in package.json files", async () => {
    const { scaffoldDemo } = await import("./scaffold-demo.js");
    const baseDir = path.join(tmpDir, "demo");
    scaffoldDemo(baseDir, "npx");

    const backendPkg = JSON.parse(
      fs.readFileSync(path.join(baseDir, "api-server/package.json"), "utf-8"),
    );
    expect(backendPkg.dependencies.express).toBeDefined();

    const frontendPkg = JSON.parse(
      fs.readFileSync(path.join(baseDir, "web-client/package.json"), "utf-8"),
    );
    expect(frontendPkg.dependencies.axios).toBeDefined();
  });

  it("creates valid .mcp.json with provided npx path", async () => {
    const { scaffoldDemo } = await import("./scaffold-demo.js");
    const baseDir = path.join(tmpDir, "demo");
    scaffoldDemo(baseDir, "/custom/npx");

    const mcpJson = JSON.parse(
      fs.readFileSync(path.join(baseDir, "api-server/.mcp.json"), "utf-8"),
    );
    expect(mcpJson.mcpServers["cc-bridge"].command).toBe("/custom/npx");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wizard/scaffold-demo.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/wizard/scaffold-demo.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import {
  mcpJsonContent,
  demoServerJs,
  demoAppJs,
  demoPackageJson,
  demoBackendClaudeMd,
  demoFrontendClaudeMd,
} from "./templates.js";

export interface ScaffoldResult {
  files: string[];
  baseDir: string;
}

export function scaffoldDemo(baseDir: string, npxPath: string): ScaffoldResult {
  const files: string[] = [];
  const apiDir = path.join(baseDir, "api-server");
  const webDir = path.join(baseDir, "web-client");

  fs.mkdirSync(apiDir, { recursive: true });
  fs.mkdirSync(webDir, { recursive: true });

  const mcpJson = mcpJsonContent(npxPath);

  // Backend files
  const backendFiles: [string, string][] = [
    ["package.json", demoPackageJson("api-server", { express: "^4.21.0", cors: "^2.8.5" })],
    ["server.js", demoServerJs()],
    [".mcp.json", mcpJson],
    ["CLAUDE.md", demoBackendClaudeMd()],
  ];

  for (const [name, content] of backendFiles) {
    const filePath = path.join(apiDir, name);
    fs.writeFileSync(filePath, content, "utf-8");
    files.push(path.join("api-server", name));
  }

  // Frontend files
  const frontendFiles: [string, string][] = [
    ["package.json", demoPackageJson("web-client", { axios: "^1.7.0" })],
    ["app.js", demoAppJs()],
    [".mcp.json", mcpJson],
    ["CLAUDE.md", demoFrontendClaudeMd()],
  ];

  for (const [name, content] of frontendFiles) {
    const filePath = path.join(webDir, name);
    fs.writeFileSync(filePath, content, "utf-8");
    files.push(path.join("web-client", name));
  }

  return { files, baseDir };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wizard/scaffold-demo.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wizard/scaffold-demo.ts src/wizard/scaffold-demo.test.ts
git commit -m "feat(wizard): add demo mode scaffolder"
```

---

### Task 5: Create `src/wizard/scaffold-real.ts` — real project scaffolder

**Files:**
- Create: `src/wizard/scaffold-real.ts`
- Test: `src/wizard/scaffold-real.test.ts`

**Step 1: Write the failing tests**

Create `src/wizard/scaffold-real.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("scaffoldReal", () => {
  let tmpDir: string;
  let projectA: string;
  let projectB: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-test-"));
    projectA = path.join(tmpDir, "project-a");
    projectB = path.join(tmpDir, "project-b");
    fs.mkdirSync(projectA);
    fs.mkdirSync(projectB);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .mcp.json and CLAUDE.md in both projects", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    scaffoldReal({
      projectAPath: projectA,
      projectAId: "backend",
      projectALabel: "CC_Backend",
      projectBPath: projectB,
      projectBId: "frontend",
      projectBLabel: "CC_Frontend",
      npxPath: "npx",
    });

    expect(fs.existsSync(path.join(projectA, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectA, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectB, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectB, "CLAUDE.md"))).toBe(true);
  });

  it("merges into existing .mcp.json without destroying other keys", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    const existing = { mcpServers: { other: { command: "foo" } } };
    fs.writeFileSync(
      path.join(projectA, ".mcp.json"),
      JSON.stringify(existing, null, 2),
    );

    scaffoldReal({
      projectAPath: projectA,
      projectAId: "a",
      projectALabel: "A",
      projectBPath: projectB,
      projectBId: "b",
      projectBLabel: "B",
      npxPath: "npx",
    });

    const merged = JSON.parse(
      fs.readFileSync(path.join(projectA, ".mcp.json"), "utf-8"),
    );
    expect(merged.mcpServers.other).toBeDefined();
    expect(merged.mcpServers["cc-bridge"]).toBeDefined();
  });

  it("appends to existing CLAUDE.md", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    fs.writeFileSync(path.join(projectA, "CLAUDE.md"), "# My Project\n\nExisting content.\n");

    scaffoldReal({
      projectAPath: projectA,
      projectAId: "a",
      projectALabel: "A",
      projectBPath: projectB,
      projectBId: "b",
      projectBLabel: "B",
      npxPath: "npx",
    });

    const content = fs.readFileSync(path.join(projectA, "CLAUDE.md"), "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain("Existing content.");
    expect(content).toContain("CC Bridge Protocol");
  });

  it("skips CLAUDE.md append if bridge section already exists", async () => {
    const { scaffoldReal } = await import("./scaffold-real.js");
    const existing = "# Project\n\n## CC Bridge Protocol\n\nAlready configured.\n";
    fs.writeFileSync(path.join(projectA, "CLAUDE.md"), existing);

    const result = scaffoldReal({
      projectAPath: projectA,
      projectAId: "a",
      projectALabel: "A",
      projectBPath: projectB,
      projectBId: "b",
      projectBLabel: "B",
      npxPath: "npx",
    });

    const content = fs.readFileSync(path.join(projectA, "CLAUDE.md"), "utf-8");
    // Should not have duplicate bridge sections
    const count = (content.match(/## CC Bridge Protocol/g) || []).length;
    expect(count).toBe(1);
    expect(result.skipped).toContain(path.join(projectA, "CLAUDE.md"));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wizard/scaffold-real.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/wizard/scaffold-real.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { mcpJsonContent, mcpJsonMerge, claudeMdBridgeSection } from "./templates.js";

export interface RealConfig {
  projectAPath: string;
  projectAId: string;
  projectALabel: string;
  projectBPath: string;
  projectBId: string;
  projectBLabel: string;
  npxPath: string;
}

export interface RealScaffoldResult {
  created: string[];
  modified: string[];
  skipped: string[];
}

function writeMcpJson(projectPath: string, npxPath: string): "created" | "modified" {
  const filePath = path.join(projectPath, ".mcp.json");
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, mcpJsonMerge(existing, npxPath), "utf-8");
    return "modified";
  }
  fs.writeFileSync(filePath, mcpJsonContent(npxPath), "utf-8");
  return "created";
}

function writeClaudeMd(
  projectPath: string,
  peerId: string,
  label: string,
  otherPeerId: string,
): "created" | "modified" | "skipped" {
  const filePath = path.join(projectPath, "CLAUDE.md");
  const section = claudeMdBridgeSection(peerId, label, otherPeerId);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing.includes("## CC Bridge Protocol")) {
      return "skipped";
    }
    fs.writeFileSync(filePath, existing.trimEnd() + "\n\n" + section, "utf-8");
    return "modified";
  }
  fs.writeFileSync(filePath, section, "utf-8");
  return "created";
}

export function scaffoldReal(config: RealConfig): RealScaffoldResult {
  const created: string[] = [];
  const modified: string[] = [];
  const skipped: string[] = [];

  // Project A
  const mcpA = writeMcpJson(config.projectAPath, config.npxPath);
  const mcpAPath = path.join(config.projectAPath, ".mcp.json");
  if (mcpA === "created") created.push(mcpAPath);
  else modified.push(mcpAPath);

  const claudeA = writeClaudeMd(
    config.projectAPath,
    config.projectAId,
    config.projectALabel,
    config.projectBId,
  );
  const claudeAPath = path.join(config.projectAPath, "CLAUDE.md");
  if (claudeA === "created") created.push(claudeAPath);
  else if (claudeA === "modified") modified.push(claudeAPath);
  else skipped.push(claudeAPath);

  // Project B
  const mcpB = writeMcpJson(config.projectBPath, config.npxPath);
  const mcpBPath = path.join(config.projectBPath, ".mcp.json");
  if (mcpB === "created") created.push(mcpBPath);
  else modified.push(mcpBPath);

  const claudeB = writeClaudeMd(
    config.projectBPath,
    config.projectBId,
    config.projectBLabel,
    config.projectAId,
  );
  const claudeBPath = path.join(config.projectBPath, "CLAUDE.md");
  if (claudeB === "created") created.push(claudeBPath);
  else if (claudeB === "modified") modified.push(claudeBPath);
  else skipped.push(claudeBPath);

  return { created, modified, skipped };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wizard/scaffold-real.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wizard/scaffold-real.ts src/wizard/scaffold-real.test.ts
git commit -m "feat(wizard): add real project scaffolder with merge/append"
```

---

### Task 6: Create `src/wizard/index.ts` — main wizard flow

**Files:**
- Create: `src/wizard/index.ts`
- Test: `src/wizard/index.test.ts`

**Step 1: Write the failing tests**

Create `src/wizard/index.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Test the printSummary output helper (the main flow is hard to unit test
// because it's interactive; we test the sub-functions instead)
describe("printDemoNextSteps", () => {
  it("outputs next steps with correct paths", async () => {
    const { printDemoNextSteps } = await import("./index.js");
    const output: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => output.push(msg);

    printDemoNextSteps("/home/user/demo");

    console.log = origLog;

    const joined = output.join("\n");
    expect(joined).toContain("/home/user/demo/api-server");
    expect(joined).toContain("/home/user/demo/web-client");
    expect(joined).toContain("npm install");
    expect(joined).toContain("node server.js");
    expect(joined).toContain("claude");
    expect(joined).toContain("Adding More Peers");
  });
});

describe("printRealNextSteps", () => {
  it("outputs next steps with project paths and peer info", async () => {
    const { printRealNextSteps } = await import("./index.js");
    const output: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => output.push(msg);

    printRealNextSteps(
      "/path/a", "peer-a", "Label_A",
      "/path/b", "peer-b", "Label_B",
      { created: ["/path/a/.mcp.json"], modified: [], skipped: [] },
    );

    console.log = origLog;

    const joined = output.join("\n");
    expect(joined).toContain("/path/a");
    expect(joined).toContain("/path/b");
    expect(joined).toContain("peer-a");
    expect(joined).toContain("peer-b");
    expect(joined).toContain("Adding More Peers");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wizard/index.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/wizard/index.ts`:

```typescript
import * as readline from "node:readline";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { banner, ask, choose, confirm, heading, success, warn, c } from "./prompts.js";
import { detectNpxPath, detectClaudePath, isNvmPath } from "./detect.js";
import { scaffoldDemo } from "./scaffold-demo.js";
import { scaffoldReal, type RealScaffoldResult } from "./scaffold-real.js";

export function printDemoNextSteps(baseDir: string): void {
  const apiDir = path.join(baseDir, "api-server");
  const webDir = path.join(baseDir, "web-client");

  heading("Next Steps");

  console.log(`  ${c.bold}1.${c.reset} Install dependencies:`);
  console.log(`     ${c.dim}cd ${apiDir} && npm install${c.reset}`);
  console.log(`     ${c.dim}cd ${webDir} && npm install${c.reset}`);
  console.log();
  console.log(`  ${c.bold}2.${c.reset} Start the API server:`);
  console.log(`     ${c.dim}cd ${apiDir} && node server.js${c.reset}`);
  console.log();
  console.log(`  ${c.bold}3.${c.reset} Open Terminal 1 — Backend team:`);
  console.log(`     ${c.dim}cd ${apiDir}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge and wait for a bug report"`);
  console.log();
  console.log(`  ${c.bold}4.${c.reset} Open Terminal 2 — Frontend team:`);
  console.log(`     ${c.dim}cd ${webDir}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge, run node app.js, and report bugs to backend"`);

  printAddMorePeers();
}

export function printRealNextSteps(
  pathA: string,
  idA: string,
  labelA: string,
  pathB: string,
  idB: string,
  labelB: string,
  result: RealScaffoldResult,
): void {
  heading("Files");

  for (const f of result.created) success(`Created ${f}`);
  for (const f of result.modified) success(`Modified ${f}`);
  for (const f of result.skipped) warn(`Skipped ${f} (bridge section already exists)`);

  heading("Next Steps");

  console.log(`  ${c.bold}1.${c.reset} Open Terminal 1 — ${labelA}:`);
  console.log(`     ${c.dim}cd ${pathA}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge as ${idA}"`);
  console.log();
  console.log(`  ${c.bold}2.${c.reset} Open Terminal 2 — ${labelB}:`);
  console.log(`     ${c.dim}cd ${pathB}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge as ${idB}"`);
  console.log();
  console.log(`  ${c.bold}3.${c.reset} Send a message from either session:`);
  console.log(`     "Use cc_send_message to tell ${idA} about [your topic]"`);

  printAddMorePeers();
}

function printAddMorePeers(): void {
  heading("Adding More Peers");
  console.log(`  To add a 3rd (or more) peer to the conversation:`);
  console.log(`  1. Copy the ${c.bold}.mcp.json${c.reset} to the new project (or run this wizard again)`);
  console.log(`  2. Add the CC Bridge section to its CLAUDE.md`);
  console.log(`  3. Launch ${c.bold}claude${c.reset} in that directory and register with a unique peerId`);
  console.log(`  4. Any registered peer can message any other peer`);
  console.log();
}

export async function runWizard(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    banner();

    // Detect tools
    const npxPath = detectNpxPath();
    const claudePath = detectClaudePath();

    if (isNvmPath(npxPath)) {
      console.log(`  ${c.dim}Detected nvm — using absolute path: ${npxPath}${c.reset}`);
    }
    if (!claudePath) {
      warn("Claude CLI not found in PATH. Install it before using CC Bridge.");
      console.log();
    }

    const mode = await choose(rl, "What would you like to set up?", [
      "Demo — Two sample projects with a planted bug (great for trying CC Bridge)",
      "Real — Add CC Bridge to two existing projects",
    ]);

    if (mode === 0) {
      // Demo mode
      const defaultBase = path.join(os.homedir(), "cc-bridge-demo");
      const baseDir = await ask(rl, "Base directory for demo projects:", defaultBase);
      const resolved = path.resolve(baseDir);

      if (fs.existsSync(resolved)) {
        const overwrite = await confirm(rl, `${resolved} already exists. Overwrite?`, false);
        if (!overwrite) {
          console.log("\nAborted.");
          return;
        }
      }

      heading("Creating demo projects");
      const result = scaffoldDemo(resolved, npxPath);
      for (const f of result.files) {
        success(`Created ${path.join(resolved, f)}`);
      }

      printDemoNextSteps(resolved);
    } else {
      // Real mode
      const pathA = await ask(rl, "Absolute path to Project A:");
      if (!fs.existsSync(pathA) || !fs.statSync(pathA).isDirectory()) {
        console.log(`\n  ${c.red}Error:${c.reset} ${pathA} is not a valid directory.`);
        return;
      }

      const defaultIdA = path.basename(pathA).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const idA = await ask(rl, "Peer ID for Project A:", defaultIdA);
      const defaultLabelA = "CC_" + path.basename(pathA).replace(/[^a-zA-Z0-9]/g, "_");
      const labelA = await ask(rl, "Label for Project A:", defaultLabelA);

      const pathB = await ask(rl, "Absolute path to Project B:");
      if (!fs.existsSync(pathB) || !fs.statSync(pathB).isDirectory()) {
        console.log(`\n  ${c.red}Error:${c.reset} ${pathB} is not a valid directory.`);
        return;
      }

      const defaultIdB = path.basename(pathB).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const idB = await ask(rl, "Peer ID for Project B:", defaultIdB);
      const defaultLabelB = "CC_" + path.basename(pathB).replace(/[^a-zA-Z0-9]/g, "_");
      const labelB = await ask(rl, "Label for Project B:", defaultLabelB);

      heading("Configuring projects");
      const result = scaffoldReal({
        projectAPath: path.resolve(pathA),
        projectAId: idA,
        projectALabel: labelA,
        projectBPath: path.resolve(pathB),
        projectBId: idB,
        projectBLabel: labelB,
        npxPath,
      });

      printRealNextSteps(path.resolve(pathA), idA, labelA, path.resolve(pathB), idB, labelB, result);
    }
  } finally {
    rl.close();
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wizard/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wizard/index.ts src/wizard/index.test.ts
git commit -m "feat(wizard): add main wizard flow with demo and real modes"
```

---

### Task 7: Create `src/cli.ts` — CLI entry point + update package.json

**Files:**
- Create: `src/cli.ts`
- Modify: `package.json:7-8` (bin field)
- Modify: `package.json:10-14` (files field)
- Modify: `src/index.ts:1` (keep shebang handling)

**Step 1: Write the failing test**

Create `src/cli.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

describe("CLI routing", () => {
  it("exports runCli function", async () => {
    const mod = await import("./cli.js");
    expect(typeof mod.runCli).toBe("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/cli.ts`:

```typescript
#!/usr/bin/env node

export async function runCli(): Promise<void> {
  const command = process.argv[2];

  if (command === "init") {
    const { runWizard } = await import("./wizard/index.js");
    await runWizard();
  } else {
    // Default: start MCP server (existing behavior)
    await import("./index.js");
  }
}

runCli().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${msg}\n`);
  process.exit(1);
});
```

**Step 4: Remove shebang from `src/index.ts`**

Edit `src/index.ts` line 1: remove `#!/usr/bin/env node` (it moves to `cli.ts`).

**Step 5: Update `package.json`**

Change the `bin` field:
```json
"bin": {
  "cc-bridge-mcp-server": "dist/cli.js"
},
```

Add `src/wizard/` to awareness — no changes needed to `files` since `dist` already covers compiled output.

**Step 6: Run test to verify it passes**

Run: `npx vitest run src/cli.test.ts`
Expected: PASS

**Step 7: Build and verify**

Run: `npm run build`
Expected: compiles without errors, `dist/cli.js` exists with shebang

**Step 8: Commit**

```bash
git add src/cli.ts src/cli.test.ts src/index.ts package.json
git commit -m "feat(wizard): add CLI entry point with init subcommand"
```

---

### Task 8: Integration test — full wizard E2E

**Files:**
- Create: `src/wizard/integration.test.ts`

**Step 1: Write the integration test**

Create `src/wizard/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scaffoldDemo } from "./scaffold-demo.js";
import { scaffoldReal } from "./scaffold-real.js";

describe("Demo scaffold integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-integ-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a fully valid demo setup", () => {
    const base = path.join(tmpDir, "demo");
    const result = scaffoldDemo(base, "/usr/local/bin/npx");

    // Verify 8 files
    expect(result.files).toHaveLength(8);

    // Backend .mcp.json is valid and references cc-bridge
    const backendMcp = JSON.parse(
      fs.readFileSync(path.join(base, "api-server/.mcp.json"), "utf-8"),
    );
    expect(backendMcp.mcpServers["cc-bridge"]).toBeDefined();

    // Frontend .mcp.json is valid and references cc-bridge
    const frontendMcp = JSON.parse(
      fs.readFileSync(path.join(base, "web-client/.mcp.json"), "utf-8"),
    );
    expect(frontendMcp.mcpServers["cc-bridge"]).toBeDefined();

    // Backend CLAUDE.md references "backend" peer
    const backendMd = fs.readFileSync(path.join(base, "api-server/CLAUDE.md"), "utf-8");
    expect(backendMd).toContain('peerId="backend"');
    expect(backendMd).toContain("CC_Backend");

    // Frontend CLAUDE.md references "frontend" peer
    const frontendMd = fs.readFileSync(path.join(base, "web-client/CLAUDE.md"), "utf-8");
    expect(frontendMd).toContain('peerId="frontend"');
    expect(frontendMd).toContain("CC_Frontend");

    // server.js contains the bug markers
    const serverJs = fs.readFileSync(path.join(base, "api-server/server.js"), "utf-8");
    expect(serverJs).toContain("BUG 1");
    expect(serverJs).toContain("BUG 2");
  });
});

describe("Real scaffold integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-bridge-integ-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("wires up two existing projects without destroying content", () => {
    const projA = path.join(tmpDir, "my-api");
    const projB = path.join(tmpDir, "my-app");
    fs.mkdirSync(projA);
    fs.mkdirSync(projB);

    // Pre-existing files
    fs.writeFileSync(path.join(projA, "CLAUDE.md"), "# My API\n\nExisting rules.\n");
    fs.writeFileSync(
      path.join(projA, ".mcp.json"),
      JSON.stringify({ mcpServers: { "other-tool": { command: "other" } } }, null, 2),
    );

    const result = scaffoldReal({
      projectAPath: projA,
      projectAId: "api",
      projectALabel: "CC_API",
      projectBPath: projB,
      projectBId: "app",
      projectBLabel: "CC_App",
      npxPath: "npx",
    });

    // Project A: .mcp.json merged (other-tool preserved)
    const mcpA = JSON.parse(fs.readFileSync(path.join(projA, ".mcp.json"), "utf-8"));
    expect(mcpA.mcpServers["other-tool"]).toBeDefined();
    expect(mcpA.mcpServers["cc-bridge"]).toBeDefined();

    // Project A: CLAUDE.md appended (original content preserved)
    const mdA = fs.readFileSync(path.join(projA, "CLAUDE.md"), "utf-8");
    expect(mdA).toContain("# My API");
    expect(mdA).toContain("Existing rules.");
    expect(mdA).toContain("CC Bridge Protocol");
    expect(mdA).toContain('peerId="api"');

    // Project B: fresh files created
    expect(fs.existsSync(path.join(projB, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(projB, "CLAUDE.md"))).toBe(true);

    // Result tracking
    expect(result.modified.length).toBeGreaterThan(0);
    expect(result.created.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test**

Run: `npx vitest run src/wizard/integration.test.ts`
Expected: PASS (all sub-modules already implemented)

**Step 3: Commit**

```bash
git add src/wizard/integration.test.ts
git commit -m "test(wizard): add integration tests for demo and real scaffolding"
```

---

### Task 9: Build, manual test, final commit

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Build**

Run: `npm run build`
Expected: Clean compilation, `dist/cli.js` has shebang

**Step 3: Manual smoke test — demo mode**

Run: `node dist/cli.js init`
Expected: Wizard starts, shows banner, asks mode question

**Step 4: Final commit with build output**

```bash
git add -A
git commit -m "feat: add setup wizard (npx cc-bridge-mcp-server init)

Adds interactive CLI wizard with two modes:
- Demo: scaffolds two sample projects with a planted API bug
- Real: wires up CC Bridge on two existing projects

Zero new dependencies — uses Node built-in readline."
```
