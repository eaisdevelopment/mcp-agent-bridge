import { execFile } from "node:child_process";
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

    const args = ["--resume", sessionId, "-p", truncated];

    execFile(
      config.CC_BRIDGE_CLAUDE_PATH,
      args,
      {
        cwd,
        timeout: config.CC_BRIDGE_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        if (error) {
          const execError = error as NodeJS.ErrnoException & {
            killed?: boolean;
            signal?: string;
          };

          // Detect timeout: process was killed by SIGTERM from timeout
          if (execError.killed && execError.signal === "SIGTERM") {
            resolve({
              stdout: stdout || "",
              stderr: `CLI_TIMEOUT: CLI subprocess timed out after ${config.CC_BRIDGE_TIMEOUT_MS}ms. Increase CC_BRIDGE_TIMEOUT_MS if needed.`,
              exitCode: null,
            });
            return;
          }

          // Detect missing binary
          if (execError.code === "ENOENT") {
            resolve({
              stdout: "",
              stderr: `CLI_NOT_FOUND: '${config.CC_BRIDGE_CLAUDE_PATH}' not found. Install Claude Code or set CC_BRIDGE_CLAUDE_PATH.`,
              exitCode: 127,
            });
            return;
          }

          // Other errors: include exit code and stderr
          const exitCode =
            typeof execError.code === "number"
              ? Number(execError.code)
              : (error as unknown as { code?: number }).code ?? 1;
          resolve({
            stdout: stdout || "",
            stderr: `CLI_EXEC_FAILED: claude exited with code ${exitCode}. stderr: ${stderr || error.message}`,
            exitCode,
          });
          return;
        }
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: 0,
        });
      },
    );
  });
}
