import * as readline from "node:readline";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { banner, ask, choose, confirm, heading, success, warn, c } from "./prompts.js";
import { detectNpxPath, detectClaudePath, isNvmPath } from "./detect.js";
import { scaffoldDemo } from "./scaffold-demo.js";
import { scaffoldReal, type RealScaffoldResult } from "./scaffold-real.js";

export function printDemoNextSteps(baseDir: string): void {
  const apiDir = path.join(baseDir, "api-server");
  const webDir = path.join(baseDir, "web-client");

  heading("Next Steps");

  console.log(`  ${c.bold}1.${c.reset} Install dependencies:`);
  console.log(`     ${c.dim}cd ${apiDir} && npm install${c.reset}`);
  console.log(`     ${c.dim}cd ${webDir} && npm install${c.reset}`);
  console.log();
  console.log(`  ${c.bold}2.${c.reset} Start the API server:`);
  console.log(`     ${c.dim}cd ${apiDir} && node server.js${c.reset}`);
  console.log();
  console.log(`  ${c.bold}3.${c.reset} Open Terminal 1 — Backend team:`);
  console.log(`     ${c.dim}cd ${apiDir}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge and wait for a bug report"`);
  console.log();
  console.log(`  ${c.bold}4.${c.reset} Open Terminal 2 — Frontend team:`);
  console.log(`     ${c.dim}cd ${webDir}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge, run node app.js, and report bugs to backend"`);

  printAddMorePeers();
}

export function printRealNextSteps(
  pathA: string,
  idA: string,
  labelA: string,
  pathB: string,
  idB: string,
  labelB: string,
  result: RealScaffoldResult,
): void {
  heading("Files");

  for (const f of result.created) success(`Created ${f}`);
  for (const f of result.modified) success(`Modified ${f}`);
  for (const f of result.skipped) warn(`Skipped ${f} (bridge section already exists)`);

  heading("Next Steps");

  console.log(`  ${c.bold}1.${c.reset} Open Terminal 1 — ${labelA}:`);
  console.log(`     ${c.dim}cd ${pathA}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge as ${idA}"`);
  console.log();
  console.log(`  ${c.bold}2.${c.reset} Open Terminal 2 — ${labelB}:`);
  console.log(`     ${c.dim}cd ${pathB}${c.reset}`);
  console.log(`     ${c.dim}claude${c.reset}`);
  console.log(`     Then tell Claude: "Register on the bridge as ${idB}"`);
  console.log();
  console.log(`  ${c.bold}3.${c.reset} Send a message from either session:`);
  console.log(`     "Use cc_send_message to tell ${idA} about [your topic]"`);

  printAddMorePeers();
}

function printAddMorePeers(): void {
  heading("Adding More Peers");
  console.log(`  To add a 3rd (or more) peer to the conversation:`);
  console.log(`  1. Copy the ${c.bold}.mcp.json${c.reset} to the new project (or run this wizard again)`);
  console.log(`  2. Add the CC Bridge section to its CLAUDE.md`);
  console.log(`  3. Launch ${c.bold}claude${c.reset} in that directory and register with a unique peerId`);
  console.log(`  4. Any registered peer can message any other peer`);
  console.log();
}

export async function runWizard(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    banner();

    // Detect tools
    const npxPath = detectNpxPath();
    const claudePath = detectClaudePath();

    if (isNvmPath(npxPath)) {
      console.log(`  ${c.dim}Detected nvm — using absolute path: ${npxPath}${c.reset}`);
    }
    if (!claudePath) {
      warn("Claude CLI not found in PATH. Install it before using CC Bridge.");
      console.log();
    }

    const mode = await choose(rl, "What would you like to set up?", [
      "Demo — Two sample projects with a planted bug (great for trying CC Bridge)",
      "Real — Add CC Bridge to two existing projects",
    ]);

    if (mode === 0) {
      // Demo mode
      const defaultBase = path.join(os.homedir(), "cc-bridge-demo");
      const baseDir = await ask(rl, "Base directory for demo projects:", defaultBase);
      const resolved = path.resolve(baseDir);

      if (fs.existsSync(resolved)) {
        const overwrite = await confirm(rl, `${resolved} already exists. Overwrite?`, false);
        if (!overwrite) {
          console.log("\nAborted.");
          return;
        }
      }

      heading("Creating demo projects");
      const result = scaffoldDemo(resolved, npxPath);
      for (const f of result.files) {
        success(`Created ${path.join(resolved, f)}`);
      }

      printDemoNextSteps(resolved);
    } else {
      // Real mode
      const pathA = await ask(rl, "Absolute path to Project A:");
      if (!fs.existsSync(pathA) || !fs.statSync(pathA).isDirectory()) {
        console.log(`\n  ${c.red}Error:${c.reset} ${pathA} is not a valid directory.`);
        return;
      }

      const defaultIdA = path.basename(pathA).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const idA = await ask(rl, "Peer ID for Project A:", defaultIdA);
      const defaultLabelA = "CC_" + path.basename(pathA).replace(/[^a-zA-Z0-9]/g, "_");
      const labelA = await ask(rl, "Label for Project A:", defaultLabelA);

      const pathB = await ask(rl, "Absolute path to Project B:");
      if (!fs.existsSync(pathB) || !fs.statSync(pathB).isDirectory()) {
        console.log(`\n  ${c.red}Error:${c.reset} ${pathB} is not a valid directory.`);
        return;
      }

      const defaultIdB = path.basename(pathB).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const idB = await ask(rl, "Peer ID for Project B:", defaultIdB);
      const defaultLabelB = "CC_" + path.basename(pathB).replace(/[^a-zA-Z0-9]/g, "_");
      const labelB = await ask(rl, "Label for Project B:", defaultLabelB);

      heading("Configuring projects");
      const result = scaffoldReal({
        projectAPath: path.resolve(pathA),
        projectAId: idA,
        projectALabel: labelA,
        projectBPath: path.resolve(pathB),
        projectBId: idB,
        projectBLabel: labelB,
        npxPath,
      });

      printRealNextSteps(path.resolve(pathA), idA, labelA, path.resolve(pathB), idB, labelB, result);
    }
  } finally {
    rl.close();
  }
}
