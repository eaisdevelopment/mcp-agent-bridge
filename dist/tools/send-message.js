import { z } from "zod";
import { getPeer, recordMessage, updateLastSeen } from "../services/peer-registry.js";
import { execClaude, validateSession } from "../services/cc-cli.js";
import { BridgeError, BridgeErrorCode, successResult, errorResult } from "../errors.js";
import { logger } from "../logger.js";
const RETRY_TIMEOUT_MS = 30_000;
function formatBridgeMessage(fromLabel, fromPeerId, message) {
    return (`[CC Bridge message from ${fromLabel} (${fromPeerId})]\n\n` +
        `${message}\n\n` +
        `---\n` +
        `Respond directly to the message above. Your entire response will be relayed back to ${fromLabel}. ` +
        `Do NOT use cc_send_message or any bridge tools — just answer normally.`);
}
export function registerSendMessageTool(server) {
    server.registerTool("cc_send_message", {
        title: "Send Message to Peer",
        description: "Send a message from one registered peer to another. " +
            "The message is relayed by resuming the target's Claude Code session " +
            "via CLI subprocess. Returns the target's response.",
        inputSchema: {
            fromPeerId: z
                .string()
                .describe("Peer ID of the sender, e.g. 'backend'"),
            toPeerId: z
                .string()
                .describe("Peer ID of the recipient, e.g. 'frontend'"),
            message: z
                .string()
                .describe("The message content to send to the target peer"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async ({ fromPeerId, toPeerId, message }) => {
        try {
            const from = await getPeer(fromPeerId);
            if (!from) {
                return errorResult(new BridgeError(BridgeErrorCode.PEER_NOT_FOUND, `Sender peer '${fromPeerId}' not registered`, "Register the peer first with cc_register_peer"));
            }
            const to = await getPeer(toPeerId);
            if (!to) {
                return errorResult(new BridgeError(BridgeErrorCode.PEER_NOT_FOUND, `Target peer '${toPeerId}' not registered`, "Register the peer first with cc_register_peer"));
            }
            // Fast-fail: check if the target session file exists on disk
            const sessionValid = await validateSession(to.sessionId, to.cwd);
            if (!sessionValid) {
                return errorResult(new BridgeError(BridgeErrorCode.CLI_EXEC_FAILED, `Session '${to.sessionId}' not found for peer '${toPeerId}'. The session may have ended or the ID is wrong`, `Ask '${toPeerId}' to re-register with their current session ID`));
            }
            const prefixed = formatBridgeMessage(from.label, fromPeerId, message);
            const startMs = Date.now();
            try {
                let result = await execClaude(to.sessionId, prefixed, to.cwd);
                // On timeout, retry once with a shorter timeout
                if (result.exitCode === null) {
                    logger.info(`Message to '${toPeerId}' timed out, retrying with ${RETRY_TIMEOUT_MS}ms timeout`);
                    result = await execClaude(to.sessionId, prefixed, to.cwd, RETRY_TIMEOUT_MS);
                }
                const durationMs = Date.now() - startMs;
                const success = result.exitCode === 0;
                // Update sender lastSeenAt (sender is always active)
                try {
                    await updateLastSeen(fromPeerId);
                }
                catch (e) {
                    logger.error("Failed to update lastSeenAt for sender", { error: e });
                }
                // Update target lastSeenAt only on success
                if (success) {
                    try {
                        await updateLastSeen(toPeerId);
                    }
                    catch (e) {
                        logger.error("Failed to update lastSeenAt for target", { error: e });
                    }
                }
                await recordMessage({
                    fromPeerId,
                    toPeerId,
                    message,
                    response: success ? result.stdout : null,
                    durationMs,
                    success,
                    error: success ? null : result.stderr,
                });
                return successResult({
                    success,
                    response: success ? result.stdout : null,
                    error: success ? null : result.stderr,
                    durationMs,
                });
            }
            catch (err) {
                const durationMs = Date.now() - startMs;
                const errorMsg = err instanceof Error ? err.message : String(err);
                try {
                    await recordMessage({
                        fromPeerId,
                        toPeerId,
                        message,
                        response: null,
                        durationMs,
                        success: false,
                        error: errorMsg,
                    });
                }
                catch (recordErr) {
                    logger.error("Failed to record failed message", { error: recordErr });
                }
                return errorResult(err);
            }
        }
        catch (err) {
            logger.error("send-message failed", { error: err });
            return errorResult(err);
        }
    });
}
//# sourceMappingURL=send-message.js.map