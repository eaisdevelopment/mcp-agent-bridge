import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const SERVER_NAME = "Claude Code Bridge from Essential AI Solutions (essentialai.uk)";
export const SERVER_VERSION = pkg.version;
