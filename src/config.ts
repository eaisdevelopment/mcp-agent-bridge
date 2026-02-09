import { z } from "zod";
import os from "node:os";
import path from "node:path";

const defaultStatePath = path.join(os.homedir(), "cloud_code_bridge");

export const configSchema = z.object({
  CC_BRIDGE_STATE_PATH: z.string().default(defaultStatePath),
  CC_BRIDGE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120_000),
  CC_BRIDGE_CHAR_LIMIT: z.coerce.number().int().min(0).default(0),
  CC_BRIDGE_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  CC_BRIDGE_CLAUDE_PATH: z.string().default("claude"),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  _config = Object.freeze(result.data);
  return _config;
}

export function getConfig(): Config {
  if (!_config) throw new Error("Config not loaded. Call loadConfig() first.");
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
