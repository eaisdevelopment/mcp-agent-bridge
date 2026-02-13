import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPeer, recordMessage, updateLastSeen, updatePeerSession } from "../services/peer-registry.js";
import { execClaude, validateSession, discoverLatestSession } from "../services/cc-cli.js";
import { BridgeError, BridgeErrorCode, successResult, errorResult } from "../errors.js";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";
import { CliExecResult } from "../types.js";

const RETRY_TIMEOUT_MS = 30_000;

function formatBridgeMessage(fromLabel: string, fromPeerId: string, message: string): string {
  return (
    `[CC Bridge message from ${fromLabel} (${fromPeerId})]\n\n` +
    `${message}\n\n` +
    `---\n` +
    `Respond directly to the message above. Your entire response will be relayed back to ${fromLabel}. ` +
    `Do NOT use cc_send_message or any bridge tools — just answer normally.`
  );
}

/**
 * Attempt to deliver a message to a session. Validates the session file exists,
 * then calls execClaude. On timeout, retries once with a shorter timeout.
 */
async function tryDeliverMessage(
  sessionId: string,
  formattedMessage: string,
  cwd: string,
): Promise<{ result: CliExecResult; sessionValid: boolean }> {
  const sessionValid = await validateSession(sessionId, cwd);
  if (!sessionValid) {
    return {
      result: { stdout: "", stderr: `Session file not found for ${sessionId}`, exitCode: 1 },
      sessionValid: false,
    };
  }

  let result = await execClaude(sessionId, formattedMessage, cwd);

  // On timeout, retry once with a shorter timeout
  if (result.exitCode === null) {
    logger.info(`Message timed out, retrying with ${RETRY_TIMEOUT_MS}ms timeout`);
    result = await execClaude(sessionId, formattedMessage, cwd, RETRY_TIMEOUT_MS);
  }

  return { result, sessionValid: true };
}

export function registerSendMessageTool(server: McpServer): void {
  server.registerTool(
    "cc_send_message",
    {
      title: "Send Message to Peer",
      description:
        "Send a message from one registered peer to another. " +
        "The message is relayed by resuming the target's Claude Code session " +
        "via CLI subprocess. Returns the target's response. " +
        "Auto-recovers if the target's session has changed.",
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

        const prefixed = formatBridgeMessage(from.label, fromPeerId, message);
        const startMs = Date.now();

        try {
          // --- First attempt with registered session ID ---
          let { result, sessionValid } = await tryDeliverMessage(
            to.sessionId, prefixed, to.cwd,
          );
          let recoveredSessionId: string | null = null;

          // --- Auto-recovery: if session invalid or exec failed, try latest session ---
          const shouldRecover = !sessionValid || (result.exitCode !== 0 && result.exitCode !== null);

          if (shouldRecover) {
            logger.info(
              `Delivery to '${toPeerId}' failed (session: ${to.sessionId}), attempting auto-recovery`,
            );

            const latestSessionId = await discoverLatestSession(to.cwd);

            if (latestSessionId && latestSessionId !== to.sessionId) {
              logger.info(
                `Discovered newer session '${latestSessionId}' for peer '${toPeerId}', retrying`,
              );

              const retryAttempt = await tryDeliverMessage(
                latestSessionId, prefixed, to.cwd,
              );

              if (retryAttempt.sessionValid) {
                // Update the registry with the new session ID
                await updatePeerSession(toPeerId, latestSessionId);
                recoveredSessionId = latestSessionId;
                result = retryAttempt.result;
              }
            }

            // If no newer session found, or same session, or retry also invalid
            if (!recoveredSessionId && !sessionValid) {
              const durationMs = Date.now() - startMs;
              await recordMessage({
                fromPeerId,
                toPeerId,
                message,
                response: null,
                durationMs,
                success: false,
                error: `Session '${to.sessionId}' is unreachable and no newer session was found`,
              });

              return errorResult(
                new BridgeError(
                  BridgeErrorCode.SESSION_STALE,
                  `Session '${to.sessionId}' for peer '${toPeerId}' is unreachable. Auto-recovery found no newer session in ${to.cwd}`,
                  `Ask '${toPeerId}' to re-register with their current session ID using cc_register_peer`,
                ),
              );
            }
          }

          // --- Process result ---
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
            ...(recoveredSessionId ? { recoveredSessionId } : {}),
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
