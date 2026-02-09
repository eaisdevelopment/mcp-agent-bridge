# Testing Patterns

**Analysis Date:** 2026-02-09

## Test Framework

**Runner:**
- None configured
- No test files present in `src/` directory
- No test framework dependencies in `package.json`

**Assertion Library:**
- Not applicable (no tests)

**Run Commands:**
```bash
# No test commands configured
```

## Test File Organization

**Location:**
- No test files exist in the repository

**Naming:**
- Not established (no existing tests)

**Structure:**
```
# No test directory structure
```

## Test Structure

**Suite Organization:**
Not applicable - no tests present.

**Patterns:**
Not established.

## Mocking

**Framework:** Not configured

**Patterns:**
Not established.

**What to Mock:**
If tests were added, likely candidates for mocking:
- File system operations (`fs.readFile`, `fs.writeFile`)
- CLI subprocess execution (`execFile` calls to `claude` CLI)
- Process signals (`process.kill`)
- File locking mechanisms

**What NOT to Mock:**
- Pure functions (none identified currently)
- Type definitions and interfaces

## Fixtures and Factories

**Test Data:**
Not established.

**Location:**
Not applicable.

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# No coverage tooling configured
```

## Test Types

**Unit Tests:**
Not present. If added, would test:
- `src/services/peer-registry.ts` functions (register, deregister, list peers)
- `src/services/cc-cli.ts` CLI execution wrapper
- Individual tool registration functions

**Integration Tests:**
Not present. If added, would test:
- Complete message flow (register peers → send message → get history)
- File locking under concurrent access
- MCP tool invocation through server

**E2E Tests:**
Not present. If added, would test:
- Full workflow with actual Claude CLI (if available)
- Multi-process state sharing via `/tmp/cc-bridge-state.json`

## Common Patterns

**Async Testing:**
Not established. Recommended pattern based on codebase structure:
```typescript
// All functions are async, so tests would use async/await
test("should register peer", async () => {
  const peer = await registerPeer("test-id", "session-123", "/tmp", "Test");
  expect(peer.peerId).toBe("test-id");
});
```

**Error Testing:**
Not established. Recommended pattern:
```typescript
// Error handling uses structured result objects
test("should handle missing peer gracefully", async () => {
  const result = await getPeer("nonexistent");
  expect(result).toBeUndefined();
});
```

## Testing Recommendations

**Add Test Framework:**
Given the TypeScript and Node.js environment, viable options:
- Jest (popular, comprehensive)
- Vitest (fast, ESM-native)
- Node's built-in test runner (minimal dependencies)

**Priority Areas for Testing:**

1. **File Locking (`src/services/peer-registry.ts`):**
   - Critical for data integrity
   - Test concurrent access scenarios
   - Mock file system for deterministic tests

2. **CLI Execution (`src/services/cc-cli.ts`):**
   - Mock `execFile` to test error handling
   - Test timeout behavior
   - Test truncation logic for long messages

3. **State Management:**
   - Test peer registration/deregistration
   - Test message recording and history retrieval
   - Test MAX_MESSAGES cap enforcement

4. **Tool Registration:**
   - Test Zod schema validation
   - Test tool response formatting
   - Test error responses

**Test File Naming Convention:**
Recommend co-located tests with `.test.ts` suffix:
```
src/
├── services/
│   ├── peer-registry.ts
│   ├── peer-registry.test.ts
│   ├── cc-cli.ts
│   └── cc-cli.test.ts
└── tools/
    ├── register-peer.ts
    ├── register-peer.test.ts
    └── ...
```

**Mock Strategy:**
- Mock `node:fs/promises` for file operations
- Mock `node:child_process` `execFile` for CLI calls
- Use dependency injection where possible (pass file paths as parameters)

**Coverage Target:**
Recommend 80% minimum for critical paths:
- All service functions in `peer-registry.ts`
- CLI wrapper in `cc-cli.ts`
- Error handling paths in tool implementations

---

*Testing analysis: 2026-02-09*
