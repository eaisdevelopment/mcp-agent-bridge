import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadConfig, getConfig } from "./config.js";
import { initLogger, logger } from "./logger.js";
import { BridgeError, BridgeErrorCode } from "./errors.js";

const execFileAsync = promisify(execFile);

const PERSIST_PATH = path.join(os.homedir(), ".cc-bridge-config.json");

// ---------------------------------------------------------------------------
// Persisted config helpers
// ---------------------------------------------------------------------------

interface PersistedConfig {
  statePath?: string;
}

async function loadPersistedConfig(): Promise<PersistedConfig> {
  try {
    const raw = await fs.readFile(PERSIST_PATH, "utf-8");
    return JSON.parse(raw) as PersistedConfig;
  } catch {
    return {};
  }
}

async function savePersistedConfig(config: { statePath: string }): Promise<void> {
  try {
    await fs.writeFile(PERSIST_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Could not save config to ${PERSIST_PATH}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// First-run interactive prompt
// ---------------------------------------------------------------------------

async function firstRunPrompt(defaultPath: string): Promise<string> {
  // Non-TTY (MCP host context): use defaults silently
  if (!process.stdin.isTTY) {
    return defaultPath;
  }

  // Check if persisted config already exists (not first run)
  const persisted = await loadPersistedConfig();
  if (persisted.statePath) {
    return persisted.statePath;
  }

  // First run with TTY -- prompt the user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // CRITICAL: output to stderr, not stdout
  });

  return new Promise((resolve) => {
    rl.question(
      `\nFirst run detected. Where should cc-bridge store its data?\n` +
        `  Default: ${defaultPath}\n` +
        `  Press Enter to accept, or type a custom path: `,
      async (answer) => {
        rl.close();
        const chosen = answer.trim() || defaultPath;
        await savePersistedConfig({ statePath: chosen });
        resolve(chosen);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

async function validateStateDir(statePath: string): Promise<void> {
  await fs.mkdir(statePath, { recursive: true });

  const testFile = path.join(statePath, ".write-test");
  try {
    await fs.writeFile(testFile, "test", "utf-8");
    await fs.unlink(testFile);
  } catch {
    throw new BridgeError(
      BridgeErrorCode.STARTUP_FAILED,
      `Cannot write to state directory: ${statePath}`,
      "Check permissions or set CC_BRIDGE_STATE_PATH to a writable directory",
    );
  }
}

async function checkClaudeCli(claudePath: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync(claudePath, ["--version"], {
      timeout: 5000,
    });
    logger.info(`Claude CLI detected: ${stdout.trim()}`);
  } catch {
    logger.warn(
      `CLI_NOT_FOUND: '${claudePath}' not found on PATH. ` +
        `cc_send_message will fail until Claude Code is installed. ` +
        `Set CC_BRIDGE_CLAUDE_PATH if installed in a non-standard location.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main startup flow
// ---------------------------------------------------------------------------

export async function runStartup(): Promise<void> {
  // Determine state path: env var takes precedence, then first-run prompt
  const envStatePath = process.env.CC_BRIDGE_STATE_PATH;
  let statePath: string;

  if (envStatePath) {
    statePath = envStatePath;
  } else {
    const defaultPath = path.join(os.homedir(), "cloud_code_bridge");
    statePath = await firstRunPrompt(defaultPath);
  }

  // If the prompt chose a different path, set it in env for loadConfig
  if (!envStatePath && statePath !== path.join(os.homedir(), "cloud_code_bridge")) {
    process.env.CC_BRIDGE_STATE_PATH = statePath;
  } else if (!envStatePath) {
    // Ensure the default or persisted path is available to loadConfig
    process.env.CC_BRIDGE_STATE_PATH = statePath;
  }

  // Load and freeze config
  loadConfig();
  const config = getConfig();

  // Initialize full logger with file outputs
  initLogger(
    config.CC_BRIDGE_LOG_LEVEL,
    path.join(config.CC_BRIDGE_STATE_PATH, "logs"),
  );

  // Validate state directory writability
  await validateStateDir(config.CC_BRIDGE_STATE_PATH);

  // Check for claude CLI (warn-only)
  await checkClaudeCli(config.CC_BRIDGE_CLAUDE_PATH);

  logger.info(
    `Startup complete. State: ${config.CC_BRIDGE_STATE_PATH}, Log level: ${config.CC_BRIDGE_LOG_LEVEL}`,
  );
}
