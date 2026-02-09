import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetConfig, loadConfig } from "./config.js";

export async function createTestConfig(): Promise<{
  tempDir: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "cc-bridge-test-"));
  resetConfig();
  loadConfig({
    CC_BRIDGE_STATE_PATH: tempDir,
    CC_BRIDGE_TIMEOUT_MS: "5000",
    CC_BRIDGE_CHAR_LIMIT: "0",
    CC_BRIDGE_LOG_LEVEL: "error",
    CC_BRIDGE_CLAUDE_PATH: "claude",
  });
  return {
    tempDir,
    cleanup: async () => {
      resetConfig();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
