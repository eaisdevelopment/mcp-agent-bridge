import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listPeers } from "../services/peer-registry.js";

export function registerListPeersTool(server: McpServer): void {
  server.registerTool(
    "cc_list_peers",
    {
      title: "List Peers",
      description:
        "List all currently registered Claude Code peers on the bridge. " +
        "Returns peer IDs, session IDs, working directories, and labels.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const peers = await listPeers();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ peers, count: peers.length }, null, 2),
          },
        ],
      };
    }
  );
}
