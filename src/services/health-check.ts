import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "../config.js";
import { SERVER_VERSION } from "../constants.js";

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------ */
/*  Types (local -- only used by this module)                         */
/* ------------------------------------------------------------------ */

interface CheckResult {
  ok: boolean;
  message: string;
}

interface ClaudeCliCheckResult extends CheckResult {
  version?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  serverVersion: string;
  statePath: string;
  claudePath: string;
  checks: {
    stateFile: CheckResult;
    lockMechanism: CheckResult;
    claudeCli: ClaudeCliCheckResult;
  };
  timestamp: string;
}

/* ------------------------------------------------------------------ */
/*  Derive paths from config at call time (not module load time)      */
/* ------------------------------------------------------------------ */

function getStatePath(): string {
  return path.join(getConfig().CC_BRIDGE_STATE_PATH, "cc-bridge-state.json");
}

/* ------------------------------------------------------------------ */
/*  Sub-checks                                                        */
/* ------------------------------------------------------------------ */

/** HLTH-01: Check state file accessibility. */
async function checkStateFile(): Promise<CheckResult> {
  const statePath = getStatePath();
  const dir = path.dirname(statePath);

  try {
    await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    return { ok: false, message: `State directory not accessible: ${dir}` };
  }

  try {
    const raw = await fs.readFile(statePath, "utf-8");
    JSON.parse(raw);
    return { ok: true, message: "State file readable and valid JSON" };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, message: "State directory writable (no state file yet)" };
    }
    if (err instanceof SyntaxError) {
      return { ok: false, message: "State file exists but contains invalid JSON" };
    }
    return { ok: false, message: `State file error: ${(err as Error).message}` };
  }
}

/** HLTH-02: Check lock mechanism with a separate health-check lock path. */
async function checkLockMechanism(): Promise<CheckResult> {
  const healthLockPath = getStatePath() + ".health-lock";

  try {
    await fs.writeFile(healthLockPath, String(process.pid), { flag: "wx" });
    try {
      await fs.unlink(healthLockPath);
    } catch {
      // Cleanup failure is non-fatal
    }
    return { ok: true, message: "Lock acquire/release cycle succeeded" };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return { ok: false, message: "Health check lock file exists unexpectedly" };
    }
    return { ok: false, message: `Lock mechanism error: ${(err as Error).message}` };
  }
}

/** HLTH-03: Check Claude CLI availability. */
async function checkClaudeCli(): Promise<ClaudeCliCheckResult> {
  const claudePath = getConfig().CC_BRIDGE_CLAUDE_PATH;

  try {
    const { stdout } = await execFileAsync(claudePath, ["--version"], {
      timeout: 5000,
    });
    return { ok: true, message: "Claude CLI found", version: stdout.trim() };
  } catch {
    return { ok: false, message: `Claude CLI not found at '${claudePath}'` };
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Run all health checks and return a comprehensive result. */
export async function checkHealth(): Promise<HealthCheckResult> {
  const config = getConfig();

  // Run all three checks (not short-circuiting)
  const [stateFile, lockMechanism, claudeCli] = await Promise.all([
    checkStateFile(),
    checkLockMechanism(),
    checkClaudeCli(),
  ]);

  const checks = { stateFile, lockMechanism, claudeCli };
  const healthy = Object.values(checks).every((c) => c.ok);

  return {
    healthy,
    serverVersion: SERVER_VERSION,
    statePath: path.join(config.CC_BRIDGE_STATE_PATH, "cc-bridge-state.json"),
    claudePath: config.CC_BRIDGE_CLAUDE_PATH,
    checks,
    timestamp: new Date().toISOString(),
  };
}
