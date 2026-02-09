import { z } from "zod";
import { getHistory } from "../services/peer-registry.js";
export function registerGetHistoryTool(server) {
    server.registerTool("cc_get_history", {
        title: "Get Message History",
        description: "Retrieve the message history for the bridge. " +
            "Optionally filter by a specific peer ID. " +
            "Returns messages in chronological order, most recent last.",
        inputSchema: {
            peerId: z
                .string()
                .optional()
                .describe("Optional peer ID to filter history for"),
            limit: z
                .number()
                .optional()
                .default(50)
                .describe("Maximum number of messages to return (default 50)"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async ({ peerId, limit }) => {
        const messages = await getHistory(peerId, limit);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ messages, count: messages.length }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=get-history.js.map