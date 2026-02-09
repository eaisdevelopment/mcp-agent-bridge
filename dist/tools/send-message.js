import { z } from "zod";
import { getPeer, recordMessage } from "../services/peer-registry.js";
import { execClaude } from "../services/cc-cli.js";
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
        const from = await getPeer(fromPeerId);
        if (!from) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ success: false, error: `Sender peer '${fromPeerId}' not registered` }, null, 2),
                    },
                ],
                isError: true,
            };
        }
        const to = await getPeer(toPeerId);
        if (!to) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ success: false, error: `Target peer '${toPeerId}' not registered` }, null, 2),
                    },
                ],
                isError: true,
            };
        }
        const prefixed = `[From ${from.label} (${fromPeerId})]: ${message}`;
        const startMs = Date.now();
        try {
            const result = await execClaude(to.sessionId, prefixed, to.cwd);
            const durationMs = Date.now() - startMs;
            const success = result.exitCode === 0;
            await recordMessage({
                fromPeerId,
                toPeerId,
                message,
                response: success ? result.stdout : null,
                durationMs,
                success,
                error: success ? null : result.stderr,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success,
                            response: success ? result.stdout : null,
                            error: success ? null : result.stderr,
                            durationMs,
                        }, null, 2),
                    },
                ],
            };
        }
        catch (err) {
            const durationMs = Date.now() - startMs;
            const errorMsg = err instanceof Error ? err.message : String(err);
            await recordMessage({
                fromPeerId,
                toPeerId,
                message,
                response: null,
                durationMs,
                success: false,
                error: errorMsg,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ success: false, error: errorMsg, durationMs }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });
}
//# sourceMappingURL=send-message.js.map