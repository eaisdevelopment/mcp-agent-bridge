import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPeer, recordMessage, updateLastSeen } from "../services/peer-registry.js";
import { execClaude } from "../services/cc-cli.js";
import { BridgeError, BridgeErrorCode, successResult, errorResult } from "../errors.js";
import { logger } from "../logger.js";

export function registerSendMessageTool(server: McpServer): void {
  server.registerTool(
    "cc_send_message",
    {
      title: "Send Message to Peer",
      description:
        "Send a message from one registered peer to another. " +
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
    },
    async ({ fromPeerId, toPeerId, message }) => {
      try {
        const from = await getPeer(fromPeerId);
        if (!from) {
          return errorResult(
            new BridgeError(
              BridgeErrorCode.PEER_NOT_FOUND,
              `Sender peer '${fromPeerId}' not registered`,
              "Register the peer first with cc_register_peer",
            ),
          );
        }

        const to = await getPeer(toPeerId);
        if (!to) {
          return errorResult(
            new BridgeError(
              BridgeErrorCode.PEER_NOT_FOUND,
              `Target peer '${toPeerId}' not registered`,
              "Register the peer first with cc_register_peer",
            ),
          );
        }

        const prefixed = `[From ${from.label} (${fromPeerId})]: ${message}`;
        const startMs = Date.now();

        try {
          const result = await execClaude(to.sessionId, prefixed, to.cwd);
          const durationMs = Date.now() - startMs;
          const success = result.exitCode === 0;

          // Update sender lastSeenAt (sender is always active)
          try { await updateLastSeen(fromPeerId); } catch (e) {
            logger.error("Failed to update lastSeenAt for sender", { error: e });
          }

          // Update target lastSeenAt only on success
          if (success) {
            try { await updateLastSeen(toPeerId); } catch (e) {
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
        } catch (err) {
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
          } catch (recordErr) {
            logger.error("Failed to record failed message", { error: recordErr });
          }

          return errorResult(err);
        }
      } catch (err) {
        logger.error("send-message failed", { error: err });
        return errorResult(err);
      }
    }
  );
}
