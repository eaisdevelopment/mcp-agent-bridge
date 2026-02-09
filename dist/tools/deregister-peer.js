import { z } from "zod";
import { deregisterPeer } from "../services/peer-registry.js";
export function registerDeregisterPeerTool(server) {
    server.registerTool("cc_deregister_peer", {
        title: "Deregister Peer",
        description: "Remove a previously registered peer from the bridge. " +
            "The peer will no longer be reachable for messaging.",
        inputSchema: {
            peerId: z
                .string()
                .describe("Peer ID to deregister, e.g. 'backend'"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async ({ peerId }) => {
        const removed = await deregisterPeer(peerId);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: removed,
                        message: removed
                            ? `Peer '${peerId}' deregistered`
                            : `Peer '${peerId}' was not registered`,
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=deregister-peer.js.map