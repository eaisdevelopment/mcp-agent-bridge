import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CliExecResult } from "../types.js";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";

/**
 * Check whether a Claude Code session file exists on disk.
 * Returns false if the file is missing (session ended or ID is wrong).
 */
export async function validateSession(
  sessionId: string,
  cwd: string,
): Promise<boolean> {
  const projectHash = cwd.replace(/\//g, "-");
  const sessionPath = path.join(
    os.homedir(),
    ".claude",
    "projects",
    projectHash,
    `${sessionId}.jsonl`,
  );
  try {
    await fs.access(sessionPath);
    return true;
  } catch {
    return false;
  }
}

export function execClaude(
  sessionId: string,
  message: string,
  cwd: string,
  timeoutMs?: number,
): Promise<CliExecResult> {
  return new Promise((resolve) => {
    const config = getConfig();
    const effectiveTimeout = timeoutMs ?? config.CC_BRIDGE_TIMEOUT_MS;

    // Apply character limit: 0 means no truncation
    const truncated =
      config.CC_BRIDGE_CHAR_LIMIT > 0 &&
      message.length > config.CC_BRIDGE_CHAR_LIMIT
        ? message.slice(0, config.CC_BRIDGE_CHAR_LIMIT) + "\n...[truncated]"
        : message;

    const args = [
      "--resume", sessionId,
      "--dangerously-skip-permissions",
      "--no-session-persistence",
      "--strict-mcp-config",
      "-p", truncated,
    ];

    // Strip Claude Code env vars so the subprocess doesn't think it's
    // running inside a parent Claude session (which causes it to hang).
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith("CLAUDE") && key !== "MCP_TRANSPORT",
      ),
    );

    const child = spawn(config.CC_BRIDGE_CLAUDE_PATH, args, {
      cwd,
      env: cleanEnv,
      // stdin ignored: prevents child from blocking on stdin read.
      // stdout/stderr piped: we capture the output.
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    // Enforce timeout manually since spawn doesn't have a timeout option
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, effectiveTimeout);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);

      if (err.code === "ENOENT") {
        resolve({
          stdout: "",
          stderr: `CLI_NOT_FOUND: '${config.CC_BRIDGE_CLAUDE_PATH}' not found. Install Claude Code or set CC_BRIDGE_CLAUDE_PATH.`,
          exitCode: 127,
        });
        return;
      }

      resolve({
        stdout: stdout || "",
        stderr: `CLI_EXEC_FAILED: spawn error: ${err.message}`,
        exitCode: 1,
      });
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          stdout: stdout || "",
          stderr: `CLI_TIMEOUT: CLI subprocess timed out after ${effectiveTimeout}ms`,
          exitCode: null,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          stdout: stdout || "",
          stderr: `CLI_EXEC_FAILED: claude exited with code ${code}. stderr: ${stderr}`,
          exitCode: code,
        });
        return;
      }

      resolve({
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: 0,
      });
    });
  });
}
