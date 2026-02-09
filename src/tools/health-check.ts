import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkHealth } from "../services/health-check.js";
import { successResult, errorResult } from "../errors.js";
import { logger } from "../logger.js";

export function registerHealthCheckTool(server: McpServer): void {
  server.registerTool(
    "cc_health_check",
    {
      title: "Health Check",
      description:
        "Diagnose the bridge's operational status. Checks state file accessibility, " +
        "lock mechanism, and Claude CLI availability. Returns per-check pass/fail with details.",
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
        const result = await checkHealth();
        return successResult(
          JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
        );
      } catch (err) {
        logger.error("health-check failed", { error: err });
        return errorResult(err);
      }
    },
  );
}
