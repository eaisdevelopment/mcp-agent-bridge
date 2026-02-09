import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listPeers } from "../services/peer-registry.js";
import { successResult, errorResult } from "../errors.js";
import { logger } from "../logger.js";

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
      try {
        const peers = await listPeers();
        return successResult({ peers, count: peers.length });
      } catch (err) {
        logger.error("list-peers failed", { error: err });
        return errorResult(err);
      }
    }
  );
}
