import { z } from "zod";
import { registerPeer, getPeer } from "../services/peer-registry.js";
export function registerRegisterPeerTool(server) {
    server.registerTool("cc_register_peer", {
        title: "Register Peer",
        description: "Register a Claude Code session as a named peer on the bridge. " +
            "Each peer needs a unique peerId, the CC sessionId to resume, " +
            "the working directory (cwd), and a human-readable label.",
        inputSchema: {
            peerId: z
                .string()
                .describe("Unique identifier for this peer, e.g. 'backend' or 'frontend'"),
            sessionId: z
                .string()
                .describe("Claude Code session ID (used with --resume)"),
            cwd: z
                .string()
                .describe("Absolute path to the project working directory"),
            label: z
                .string()
                .describe("Human-readable label, e.g. 'CC_Backend' or 'CC_Frontend'"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async ({ peerId, sessionId, cwd, label }) => {
        const existing = await getPeer(peerId);
        const peer = await registerPeer(peerId, sessionId, cwd, label);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        action: existing ? "updated" : "registered",
                        peer,
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=register-peer.js.map