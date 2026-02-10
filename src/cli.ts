#!/usr/bin/env node

export async function runCli(): Promise<void> {
  const command = process.argv[2];

  if (command === "init") {
    const { runWizard } = await import("./wizard/index.js");
    await runWizard();
  } else {
    // Default: start MCP server (existing behavior)
    await import("./index.js");
  }
}

runCli().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${msg}\n`);
  process.exit(1);
});
