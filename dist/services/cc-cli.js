import { execFile } from "node:child_process";
import { getConfig } from "../config.js";
export function execClaude(sessionId, message, cwd) {
    return new Promise((resolve) => {
        const config = getConfig();
        // Apply character limit: 0 means no truncation
        const truncated = config.CC_BRIDGE_CHAR_LIMIT > 0 &&
            message.length > config.CC_BRIDGE_CHAR_LIMIT
            ? message.slice(0, config.CC_BRIDGE_CHAR_LIMIT) + "\n...[truncated]"
            : message;
        const args = ["--resume", sessionId, "-p", truncated];
        // Strip Claude Code env vars so the subprocess doesn't think it's
        // running inside a parent Claude session (which causes it to hang).
        const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("CLAUDE") && key !== "MCP_TRANSPORT"));
        execFile(config.CC_BRIDGE_CLAUDE_PATH, args, {
            cwd,
            timeout: config.CC_BRIDGE_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024,
            env: cleanEnv,
        }, (error, stdout, stderr) => {
            if (error) {
                const execError = error;
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
                const exitCode = typeof execError.code === "number"
                    ? Number(execError.code)
                    : error.code ?? 1;
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
        });
    });
}
//# sourceMappingURL=cc-cli.js.map