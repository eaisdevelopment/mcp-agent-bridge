#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { runStartup } from "./startup.js";
import { logger } from "./logger.js";
import { registerRegisterPeerTool } from "./tools/register-peer.js";
import { registerSendMessageTool } from "./tools/send-message.js";
import { registerListPeersTool } from "./tools/list-peers.js";
import { registerGetHistoryTool } from "./tools/get-history.js";
import { registerDeregisterPeerTool } from "./tools/deregister-peer.js";
import { registerHealthCheckTool } from "./tools/health-check.js";

// ---------------------------------------------------------------------------
// Global error handlers -- registered FIRST before anything else
// ---------------------------------------------------------------------------

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
  // Do NOT exit -- MCP server should try to continue
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error(`Unhandled rejection: ${msg}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown handlers
// ---------------------------------------------------------------------------

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  logger.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down");
  logger.close();
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Startup MUST complete before MCP transport starts
  // (handles first-run prompt, config loading, logger init, validation)
  await runStartup();

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // Register all 6 tools
  registerRegisterPeerTool(server);
  registerDeregisterPeerTool(server);
  registerSendMessageTool(server);
  registerListPeersTool(server);
  registerGetHistoryTool(server);
  registerHealthCheckTool(server);

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Startup banner: always prints regardless of log level
  process.stderr.write(
    `${SERVER_NAME} v${SERVER_VERSION} running on stdio\n`,
  );

  logger.info(
    "Server ready. Tools: cc_register_peer, cc_deregister_peer, cc_send_message, cc_list_peers, cc_get_history, cc_health_check",
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error(`Fatal startup error: ${msg}`);
  // Fallback to stderr in case logger failed
  process.stderr.write(`Fatal error: ${msg}\n`);
  logger.close();
  process.exit(1);
});
