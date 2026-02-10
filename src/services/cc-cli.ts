import { spawn } from "node:child_process";
import { CliExecResult } from "../types.js";
import { getConfig } from "../config.js";

export function execClaude(
  sessionId: string,
  message: string,
  cwd: string,
): Promise<CliExecResult> {
  return new Promise((resolve) => {
    const config = getConfig();

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
    }, config.CC_BRIDGE_TIMEOUT_MS);

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
          stderr: `CLI_TIMEOUT: CLI subprocess timed out after ${config.CC_BRIDGE_TIMEOUT_MS}ms. Increase CC_BRIDGE_TIMEOUT_MS if needed.`,
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
