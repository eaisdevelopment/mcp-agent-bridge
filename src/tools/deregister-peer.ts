import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { deregisterPeer } from "../services/peer-registry.js";
import { successResult, errorResult } from "../errors.js";
import { logger } from "../logger.js";

export function registerDeregisterPeerTool(server: McpServer): void {
  server.registerTool(
    "cc_deregister_peer",
    {
      title: "Deregister Peer",
      description:
        "Remove a previously registered peer from the bridge. " +
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
    },
    async ({ peerId }) => {
      try {
        const removed = await deregisterPeer(peerId);
        return successResult({
          success: removed,
          message: removed
            ? `Peer '${peerId}' deregistered`
            : `Peer '${peerId}' was not registered`,
        });
      } catch (err) {
        logger.error("deregister-peer failed", { error: err });
        return errorResult(err);
      }
    }
  );
}
