import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { registerRegisterPeerTool } from "./tools/register-peer.js";
import { registerSendMessageTool } from "./tools/send-message.js";
import { registerListPeersTool } from "./tools/list-peers.js";
import { registerGetHistoryTool } from "./tools/get-history.js";
import { registerDeregisterPeerTool } from "./tools/deregister-peer.js";

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

registerRegisterPeerTool(server);
registerDeregisterPeerTool(server);
registerSendMessageTool(server);
registerListPeersTool(server);
registerGetHistoryTool(server);

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

runStdio().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
