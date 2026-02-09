import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listPeers } from "../services/peer-registry.js";
import { getConfig } from "../config.js";
import { successResult, errorResult } from "../errors.js";
import { logger } from "../logger.js";

export function registerListPeersTool(server: McpServer): void {
  server.registerTool(
    "cc_list_peers",
    {
      title: "List Peers",
      description:
        "List all currently registered Claude Code peers on the bridge. " +
        "Returns peer IDs, session IDs, working directories, labels, and flags peers " +
        "as potentially stale if idle beyond the configured timeout.",
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
        const staleTimeout = getConfig().CC_BRIDGE_STALE_TIMEOUT_MS;
        const now = Date.now();
        const enriched = peers.map(peer => ({
          ...peer,
          potentiallyStale: staleTimeout > 0 && (now - new Date(peer.lastSeenAt).getTime()) > staleTimeout,
        }));
        return successResult({ peers: enriched, count: enriched.length });
      } catch (err) {
        logger.error("list-peers failed", { error: err });
        return errorResult(err);
      }
    }
  );
}
