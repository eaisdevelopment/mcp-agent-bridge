import { execFile } from "node:child_process";
import { CliExecResult } from "../types.js";
import { CLI_TIMEOUT_MS, CHARACTER_LIMIT } from "../constants.js";

export function execClaude(
  sessionId: string,
  message: string,
  cwd: string
): Promise<CliExecResult> {
  return new Promise((resolve) => {
    const truncated =
      message.length > CHARACTER_LIMIT
        ? message.slice(0, CHARACTER_LIMIT) + "\n...[truncated]"
        : message;

    const args = ["--resume", sessionId, "-p", truncated];

    execFile(
      "claude",
      args,
      {
        cwd,
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            stdout: stdout || "",
            stderr: stderr || error.message,
            exitCode:
              typeof (error as NodeJS.ErrnoException).code === "number"
                ? Number((error as NodeJS.ErrnoException).code)
                : 1,
          });
          return;
        }
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: 0,
        });
      }
    );
  });
}
