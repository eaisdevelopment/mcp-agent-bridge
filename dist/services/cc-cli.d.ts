import { CliExecResult } from "../types.js";
/**
 * Check whether a Claude Code session file exists on disk.
 * Returns false if the file is missing (session ended or ID is wrong).
 */
export declare function validateSession(sessionId: string, cwd: string): Promise<boolean>;
export declare function execClaude(sessionId: string, message: string, cwd: string, timeoutMs?: number): Promise<CliExecResult>;
//# sourceMappingURL=cc-cli.d.ts.map