# Pitfalls Research

**Domain:** MCP server / inter-agent CLI bridge -- publishing to community
**Researched:** 2026-02-09
**Confidence:** HIGH (verified against official docs, MCP registry repo, and real issue trackers)

## Critical Pitfalls

### Pitfall 1: Vitest Cannot Resolve Promises Wrapping Mocked `execFile` Callbacks

**What goes wrong:**
The `execClaude()` function in `src/services/cc-cli.ts` wraps `execFile` in a `new Promise()` with a callback-style API. When you mock `node:child_process` with `vi.mock("node:child_process")`, the mock replaces `execFile` with a no-op `vi.fn()`. The `resolve` and `reject` closures captured by the Promise constructor are inaccessible to the mock, so the Promise never settles. Tests hang until timeout, producing cryptic "test timed out" errors with no indication the mock is the cause.

**Why it happens:**
The Promise wraps a callback-style Node API. The mock replaces the function but has no way to invoke the `(error, stdout, stderr)` callback that would settle the outer Promise. This is a known Vitest/Jest footgun documented in [this gist](https://gist.github.com/joemaller/f9171aa19a187f59f406ef1ffe87d9ac) and [vitest-dev/vitest Discussion #2075](https://github.com/vitest-dev/vitest/discussions/2075).

**How to avoid:**
Extract the callback-to-promise wrapping into a thin adapter layer that can be replaced during testing. Concretely:

1. Create an injectable `executeCommand` function type in `cc-cli.ts` that wraps `execFile` and returns a `Promise<CliExecResult>`.
2. Export a default implementation that uses real `execFile`.
3. In tests, provide a mock implementation that directly returns `Promise.resolve(...)` or `Promise.reject(...)` -- bypassing the callback entirely.
4. Alternative: use `vi.mock("node:child_process", ...)` with a custom factory that calls the callback argument synchronously: `vi.fn((cmd, args, opts, cb) => cb(null, "stdout", ""))`.

**Warning signs:**
- Tests hang indefinitely instead of failing fast
- `vi.mock("node:child_process")` appears at top of test file but `execFile` mock has no `.mockImplementation()` that calls the callback
- No test covers the `execClaude` function despite it being the most critical path

**Phase to address:**
Testing infrastructure phase -- before writing any tool-level tests, the CLI service abstraction must be testable.

---

### Pitfall 2: Publishing Empty or Source-Only npm Package (Missing `dist/`, `files` Field, `bin`, Shebang)

**What goes wrong:**
Multiple interlocking mistakes cause the published npm package to be broken for consumers:

1. **No `files` field in package.json**: Without `"files": ["dist"]`, npm falls back to `.npmignore`, then `.gitignore`. Since `dist/` is typically in `.gitignore`, it gets excluded from the published tarball. Users install a package with no compiled code.
2. **No `bin` field**: Without `"bin": { "cc-bridge-mcp-server": "./dist/index.js" }`, users cannot reference the server in MCP client configs via `npx cc-bridge-mcp-server`. They must know the full path to `dist/index.js`.
3. **No shebang**: Without `#!/usr/bin/env node` at the top of the entry point, Unix systems cannot execute the file directly when invoked via `npx` or as a `bin` entry.
4. **No `prepublishOnly` script**: Without `"prepublishOnly": "npm run build"`, publishing from a clean checkout or CI skips the build step, shipping stale or absent `dist/` contents.

The current `package.json` has **none** of these: no `files`, no `bin`, no `prepublishOnly`.

**Why it happens:**
During development, `npm run build && npm start` works because `dist/` exists locally. The developer never runs `npm pack --dry-run` to inspect what would actually be published. The gap between "works in my checkout" and "works when installed from npm" is invisible until a user reports it.

**How to avoid:**
Add all four fields before publishing:

```json
{
  "files": ["dist"],
  "bin": { "cc-bridge-mcp-server": "./dist/index.js" },
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

Add `#!/usr/bin/env node` as line 1 of `src/index.ts`. Verify with `npm pack --dry-run` that only `dist/`, `package.json`, `README.md`, and `LICENSE` appear. Add a CI step that runs `npm pack` and inspects the tarball contents.

**Warning signs:**
- `npm pack --dry-run` output includes `src/` or `node_modules/` or shows zero `dist/` files
- `package.json` has no `files` field and `.gitignore` lists `dist/`
- `npx cc-bridge-mcp-server` fails with "not found" or "permission denied"
- Entry point JS file does not start with `#!/usr/bin/env node`

**Phase to address:**
npm publication phase -- must be completed and verified before first `npm publish`.

---

### Pitfall 3: Hardcoded `/tmp` Path Breaks Cross-Platform and Multi-User

**What goes wrong:**
State is persisted at the hardcoded path `/tmp/cc-bridge-state.json` (line 11 of `peer-registry.ts`). This causes three classes of failure:

1. **Windows**: No `/tmp` directory. The server crashes on startup with `ENOENT`.
2. **macOS periodic cleanup**: macOS can purge `/tmp` contents during extended sessions, silently deleting state mid-conversation.
3. **Multi-user collision**: All users on a shared machine write to the same state file, causing peer ID collisions and unauthorized message access.
4. **Restricted `/tmp`**: Containers, sandboxed environments, and some Linux distributions mount `/tmp` with `noexec` or restrictive permissions.

**Why it happens:**
`/tmp` works on the developer's macOS machine. Without cross-platform testing or a second user, the assumption is never challenged.

**How to avoid:**
Use `os.tmpdir()` as the platform-appropriate default, allow override via `CC_BRIDGE_STATE_DIR` environment variable, and document the state file location. Specifically:

```typescript
const stateDir = process.env.CC_BRIDGE_STATE_DIR || os.tmpdir();
const STATE_PATH = path.join(stateDir, "cc-bridge-state.json");
```

Test on Windows (or at minimum, verify `os.tmpdir()` returns a writable path in CI on multiple platforms).

**Warning signs:**
- Any hardcoded absolute path in source code (grep for `"/tmp"`)
- No `os.tmpdir()` usage anywhere in codebase
- No environment variable for state path configuration
- Zero Windows users in early testers

**Phase to address:**
Hardening/configuration phase -- before npm publication. This is a launch blocker for cross-platform compatibility.

---

### Pitfall 4: `npx` and NVM Cause "spawn ENOENT" for MCP Server Users

**What goes wrong:**
Users who install via `npx cc-bridge-mcp-server` and configure their MCP client (Claude Desktop, VS Code, JetBrains) encounter `spawn npx ENOENT` errors. The MCP client spawns the server as a child process, but the client process does not inherit the user's shell environment (NVM paths, nvm shell functions, pyenv shims, etc.).

This is the [single most reported issue](https://github.com/modelcontextprotocol/servers/issues/64) across the MCP server ecosystem and has affected every major MCP client (Claude Desktop, JetBrains, VS Code, Goose).

**Why it happens:**
NVM works by injecting a shell function into `.bashrc`/`.zshrc`. GUI applications (Claude Desktop, VS Code) do not source these shell profiles, so `npx` resolves to nothing. On Windows, `npx` is a `.cmd` batch file, and Node's `child_process.spawn` cannot execute `.cmd` files without `{ shell: true }`.

**How to avoid:**
1. **Document the known issue prominently** in README with platform-specific workarounds: use absolute paths to `node` and the installed server script.
2. **Provide example configs for each MCP client** that use `node` (absolute path) + the global install path, not `npx`.
3. **Consider adding a post-install script** that prints the absolute path the user should configure.
4. **Test the `npx` path on a clean machine** without NVM before publishing.

Example recommended config for users:
```json
{
  "mcpServers": {
    "cc-bridge": {
      "command": "node",
      "args": ["/usr/local/lib/node_modules/cc-bridge-mcp-server/dist/index.js"]
    }
  }
}
```

**Warning signs:**
- README only shows `npx` usage without absolute-path alternative
- No documentation for NVM/nvm-windows users
- No mention of Windows `.cmd` issue
- First user issues are all "server won't start" or "spawn ENOENT"

**Phase to address:**
Documentation and publication phase -- README must include platform-specific setup instructions before publication.

---

### Pitfall 5: File Lock Left Behind on Crash Poisons All Server Instances

**What goes wrong:**
If the MCP server process is killed with SIGKILL (kill -9), crashes during a locked operation, or the host machine loses power, the lock file `/tmp/cc-bridge-state.json.lock` persists. The stale-lock detection in `acquireLock()` checks `process.kill(lockPid, 0)` -- but this fails in two cases:

1. **PID reuse**: The old PID has been assigned to a new, unrelated process. `process.kill(pid, 0)` succeeds, so the lock is treated as active. All server instances block for 5 seconds then throw "Failed to acquire lock within timeout".
2. **Cross-user lock**: A different user's process holds the PID. `process.kill(pid, 0)` throws `EPERM` (not `ESRCH`), which falls through to the sleep-and-retry path -- never cleaning up the stale lock.

Both cases make the bridge completely unusable until someone manually deletes the lock file.

**Why it happens:**
Advisory file locking with PID-based stale detection is a well-known weak pattern. It works in the happy path but fails under exactly the conditions that cause crashes -- which is when you most need it to recover.

**How to avoid:**
1. **Use `proper-lockfile` npm package** -- it handles stale detection, cross-platform compatibility, and retry logic correctly. It uses a combination of PID checks and lock file age.
2. **Add graceful shutdown handlers** for SIGINT and SIGTERM that release the lock:
   ```typescript
   process.on("SIGINT", async () => { await releaseLock(); process.exit(0); });
   ```
3. **Add lock file age check**: If lock file is older than `CLI_TIMEOUT_MS` (120s), consider it stale regardless of PID.
4. **Log warnings** when stale lock detection triggers, so users can see what happened.

**Warning signs:**
- Users report "Failed to acquire lock" errors after a crash
- Lock file exists but the PID inside doesn't match any MCP server process
- Empty catch blocks in lock code (`catch { /* lock file disappeared, retry */ }`)
- No SIGINT/SIGTERM handlers in `src/index.ts`

**Phase to address:**
Hardening phase -- before publication. A poisoned lock file on a community user's machine with no documented recovery is a support nightmare.

---

### Pitfall 6: MCP Registry `server.json` Namespace and Ownership Validation Rejected

**What goes wrong:**
The official MCP registry (registry.modelcontextprotocol.io) rejects the server listing because namespace authentication or package ownership verification fails. Common rejection reasons:

1. **Wrong namespace format**: Using `cc-bridge-mcp-server` instead of reverse-DNS like `io.github.username/cc-bridge-mcp-server`.
2. **Unverified domain**: Publishing under a namespace requires proving ownership of the corresponding domain (via DNS TXT record or HTTP challenge) or GitHub account.
3. **Missing `server.json` file**: The registry requires a `server.json` in the repository following the [official schema](https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json).
4. **npm package not public**: The registry only allows packages from `https://registry.npmjs.org` and verifies they are publicly accessible.

**Why it happens:**
Developers assume the MCP registry works like npmjs.com (publish and it appears). The MCP registry has a separate verification process with stricter identity requirements. The `server.json` schema is not widely documented outside the [registry repo docs](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md).

**How to avoid:**
1. **Read the registry docs first**: [MCP Registry requirements](https://glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements).
2. **Create `server.json` early** with correct schema reference, namespace, and package metadata.
3. **Use GitHub-based namespace** (`io.github.<username>/<server-name>`) which is verified via GitHub Actions or GitHub login.
4. **Publish npm package first**, verify it is public, then submit to MCP registry.
5. **Keep `_meta` under 4KB** -- the registry silently drops custom metadata exceeding this limit.

**Warning signs:**
- No `server.json` file in the repository
- Namespace doesn't follow reverse-DNS convention
- npm package is scoped (`@username/pkg`) but registry namespace doesn't match
- Registry submission returns validation errors with no clear documentation path

**Phase to address:**
Publication phase -- `server.json` should be drafted during hardening and finalized alongside npm publication.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded `/tmp` state path | Zero configuration needed | Breaks Windows, multi-user, containers; support burden | Never for published packages |
| Hand-rolled file locking | No external dependency | PID reuse bugs, no EPERM handling, no age-based expiry; lock poisoning | Prototype only -- replace before publication |
| `console.error` as only logging | No logging dependency | No log levels, no structured output, impossible to debug in user environments | Prototype only -- add structured logging before publication |
| Duplicated version in `constants.ts` and `package.json` | Quick to write | Version drift; published package says 1.0.0 but constants say something else | Never -- read from `package.json` at runtime or via build-time injection |
| No `.gitignore` at project root | Fewer files to manage | `node_modules/`, `dist/`, `.env`, IDE files committed; bloated repo, leaked secrets | Never |
| Empty catch blocks in lock code | Simpler code | Silent failures mask filesystem issues (disk full, permissions); impossible to debug remotely | Never for published code |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `claude` CLI subprocess | Assuming `claude` is on PATH in all environments | Check for `claude` binary at startup with `which`/`where` and emit a clear error message if missing. Document that `claude` CLI must be installed separately. |
| MCP SDK `registerTool` API | Pinning `^1.6.1` with caret range; minor SDK update changes tool registration signature | Pin exact version in `package.json` (`1.6.1` not `^1.6.1`). Add integration test that registers all tools against the SDK. Monitor SDK changelog. |
| File-based shared state across stdio processes | Assuming atomic rename works across filesystems | `fs.rename()` fails with `EXDEV` if temp file and target are on different filesystems (e.g., Docker volume mounts). Write temp file in same directory as target: `STATE_PATH + ".tmp"` not a different mount. |
| npm `prepublishOnly` hook | Forgetting that `npm publish` does not run `build` automatically | Add `"prepublishOnly": "npm run build"` to ensure `dist/` is always fresh before publish. |
| MCP client environment (Claude Desktop, VS Code) | Assuming `npx` works when client spawns server process | Provide absolute-path configs in docs. Test with GUI-launched MCP clients, not just terminal. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full JSON state file read on every operation | Increasing latency as message history grows toward 500 entries | Add in-memory cache with file-change detection (stat mtime) for read operations | ~200+ messages in state file |
| Exclusive lock for read-only operations (`listPeers`, `getHistory`) | Reads block behind writes; 5-second timeout on contention | Separate read path (no lock) from write path (lock); JSON parse of stale data is acceptable for reads | 3+ concurrent server instances with active messaging |
| 120-second CLI timeout blocks the event loop's progress reporting | Send-message tool appears to hang with no feedback | Add progress notifications via MCP protocol; report "waiting for CLI response" at intervals | Any message that takes >5 seconds |
| `JSON.stringify` with `null, 2` pretty-printing on every tool response | Unnecessary allocation and serialization overhead | Use compact JSON for programmatic responses; pretty-print only when debugging | High-throughput scenarios (unlikely for 2-peer bridge, but bad habit) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| State file at `/tmp` with default permissions (world-readable) | Any user/process on the machine can read session IDs, working directories, and full message history | Set file permissions to `0o600` on creation. Use `os.tmpdir()` + user-specific subdirectory. Document the security model. |
| Session IDs passed as CLI arguments | Session IDs visible in `ps aux` output to all users on the machine | Document this as a known limitation. Consider using stdin pipe to `claude` CLI instead of `-p` argument if the CLI supports it. |
| No input validation on `peerId` beyond Zod string check | Peer IDs with path separators (`../`), null bytes, or shell metacharacters could cause unexpected behavior | Add regex validation: `/^[a-zA-Z0-9_-]{1,64}$/`. Reject anything else. |
| `execFile` with unsanitized `cwd` parameter | Path traversal if `cwd` contains `..` or symlinks to sensitive directories | Resolve with `path.resolve()` and verify the directory exists and is a directory with `fs.stat()`. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Error messages return raw CLI stderr | Users see cryptic Node.js stack traces or Claude CLI internal errors | Wrap errors in human-readable messages: "Failed to deliver message to peer 'frontend': Claude CLI timed out after 120 seconds. Is the target session still active?" |
| No guidance when `claude` CLI is missing | Server starts but every `cc_send_message` fails with unhelpful "ENOENT" | Check for `claude` at server startup. Fail fast with: "cc-bridge-mcp-server requires the Claude Code CLI. Install it from https://..." |
| Tool names use `cc_` prefix without explanation | Users don't know what `cc_` means in their MCP tool list | Use `cc_bridge_` prefix and add a description that explains "CC Bridge" in the server-level metadata. |
| No feedback during long CLI operations | 120-second timeout with zero progress indication; user thinks the tool is broken | Implement MCP progress notifications or at minimum document expected latency in tool descriptions |

## "Looks Done But Isn't" Checklist

- [ ] **npm package**: Run `npm pack --dry-run` -- verify `dist/` is included, `src/` and `node_modules/` are excluded, tarball is <1MB
- [ ] **bin entry point**: Run `npx cc-bridge-mcp-server` from a clean directory -- verify it starts without "permission denied" or "not found"
- [ ] **shebang line**: First line of `dist/index.js` is `#!/usr/bin/env node` -- verify after build (TypeScript does not add this automatically)
- [ ] **Cross-platform state path**: Run on Windows or verify `os.tmpdir()` is used -- `/tmp` hardcode is a launch blocker
- [ ] **`.gitignore` exists**: Verify `node_modules/`, `dist/`, `.env`, `*.lock` (state lock), and IDE files are excluded
- [ ] **License file**: Verify `LICENSE` file exists (package.json says ISC but no LICENSE file present)
- [ ] **Version consistency**: `package.json` version matches `constants.ts` `SERVER_VERSION` -- or better, derive from `package.json` at build time
- [ ] **Lock recovery**: Kill server with `kill -9` during a write operation, then start a new server -- verify it recovers within 5 seconds
- [ ] **`claude` CLI check**: Start server on a machine without `claude` installed -- verify a clear error message, not a cryptic crash
- [ ] **server.json**: File exists, follows MCP registry schema, namespace matches npm package owner
- [ ] **Tool descriptions**: Each tool description is specific enough that an LLM consistently generates correct tool calls (test with actual LLM interaction)
- [ ] **README install path**: Follow README instructions on a clean machine -- verify every step works without undocumented prerequisites

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Published npm package with no `dist/` | LOW | `npm unpublish` (within 72h) or publish patched version. Add `prepublishOnly` script and `files` field. Re-publish. |
| Poisoned lock file on user machine | LOW | Document manual recovery: "Delete `/tmp/cc-bridge-state.json.lock`". Add automatic stale-lock recovery in next release. |
| Hardcoded `/tmp` breaks Windows users | MEDIUM | Patch release with `os.tmpdir()`. Update README. But early Windows users already hit the error and may not retry. |
| MCP registry namespace rejected | LOW | Re-submit with correct namespace. No data loss, but delays listing by review cycle time. |
| Session IDs leaked via `ps aux` | HIGH | Cannot un-leak. Rotate affected session IDs. Document the risk. Consider architecture change to pipe stdin. |
| Mocked `execFile` causes all CLI tests to hang | LOW | Refactor `cc-cli.ts` to use injectable function. Rewrite tests. No production impact, but blocks test development. |
| MCP SDK breaking change in minor version | MEDIUM | Pin exact version. Add integration tests that exercise tool registration. Vendor lock SDK version until verified. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Vitest `execFile` mock hangs | Testing infrastructure | First CLI service test passes without timeout |
| Missing `files`/`bin`/shebang in package.json | npm publication prep | `npm pack --dry-run` shows correct contents; `npx` starts server |
| Hardcoded `/tmp` path | Hardening / configuration | Server starts on Windows CI; `CC_BRIDGE_STATE_DIR` env var works |
| `npx` ENOENT for NVM users | Documentation / publication | README includes absolute-path configs for each major MCP client |
| Lock file poisoning after crash | Hardening | Kill -9 during write, restart, verify recovery within 5 seconds |
| MCP registry `server.json` rejected | Publication | `server.json` validates against official schema; namespace matches ownership |
| Empty `.gitignore` | Project hygiene (immediate) | `node_modules/` and `dist/` are not tracked in git |
| Version drift between package.json and constants.ts | Build system | Single source of truth for version; build fails if they diverge |
| No `claude` CLI startup check | Hardening | Server on machine without `claude` prints clear error and exits |
| Tool descriptions cause LLM misuse | Testing / QA | Manual testing with LLM shows correct tool selection and parameter generation |

## Sources

- [Mocking child_process.exec in Vitest -- gist with gotcha explanation](https://gist.github.com/joemaller/f9171aa19a187f59f406ef1ffe87d9ac) (MEDIUM confidence)
- [Vitest Discussion #2075: Mocking/Spying on child_process](https://github.com/vitest-dev/vitest/discussions/2075) (MEDIUM confidence)
- [MCP Servers Don't Work with NVM -- Issue #64](https://github.com/modelcontextprotocol/servers/issues/64) (HIGH confidence -- official repo)
- [Official MCP Registry Server.json Requirements -- Glama](https://glama.ai/blog/2026-01-24-official-mcp-registry-serverjson-requirements) (MEDIUM confidence)
- [MCP Registry GitHub -- server.json schema docs](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md) (HIGH confidence -- official repo)
- [Publish Your MCP Server To NPM -- AI Hero](https://www.aihero.dev/publish-your-mcp-server-to-npm) (MEDIUM confidence)
- [Common Challenges in MCP Server Development -- DEV Community](https://dev.to/nishantbijani/common-challenges-in-mcp-server-development-and-how-to-solve-them-35ne) (MEDIUM confidence)
- [Tutorial: publishing ESM-based npm packages with TypeScript -- 2ality](https://2ality.com/2025/02/typescript-esm-packages.html) (HIGH confidence -- authoritative source)
- [TypeScript in 2025 with ESM and CJS npm publishing -- Liran Tal](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) (MEDIUM confidence)
- [proper-lockfile npm package](https://www.npmjs.com/package/proper-lockfile) (HIGH confidence)
- [MCP Security Vulnerabilities -- Composio](https://composio.dev/blog/mcp-vulnerabilities-every-developer-should-know) (MEDIUM confidence)
- [First malicious MCP server on npm -- Semgrep](https://semgrep.dev/blog/2025/so-the-first-malicious-mcp-server-has-been-found-on-npm-what-does-this-mean-for-mcp-security/) (HIGH confidence)
- [OWASP NPM Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/NPM_Security_Cheat_Sheet.html) (HIGH confidence)
- [Fixing "spawn npx ENOENT" on Windows for MCP servers](https://fransiscuss.com/2025/04/22/fix-spawn-npx-enoent-windows11-mcp-server/) (MEDIUM confidence)

---
*Pitfalls research for: cc-bridge-mcp-server community publication*
*Researched: 2026-02-09*
