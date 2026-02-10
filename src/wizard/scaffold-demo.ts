import fs from "node:fs";
import path from "node:path";
import {
  mcpJsonContent,
  demoServerJs,
  demoAppJs,
  demoPackageJson,
  demoBackendClaudeMd,
  demoFrontendClaudeMd,
} from "./templates.js";

export interface ScaffoldResult {
  files: string[];
  baseDir: string;
}

export function scaffoldDemo(baseDir: string, npxPath: string): ScaffoldResult {
  const files: string[] = [];
  const apiDir = path.join(baseDir, "api-server");
  const webDir = path.join(baseDir, "web-client");

  fs.mkdirSync(apiDir, { recursive: true });
  fs.mkdirSync(webDir, { recursive: true });

  const mcpJson = mcpJsonContent(npxPath);

  // Backend files
  const backendFiles: [string, string][] = [
    ["package.json", demoPackageJson("api-server", { express: "^4.21.0", cors: "^2.8.5" })],
    ["server.js", demoServerJs()],
    [".mcp.json", mcpJson],
    ["CLAUDE.md", demoBackendClaudeMd()],
  ];

  for (const [name, content] of backendFiles) {
    const filePath = path.join(apiDir, name);
    fs.writeFileSync(filePath, content, "utf-8");
    files.push(path.join("api-server", name));
  }

  // Frontend files
  const frontendFiles: [string, string][] = [
    ["package.json", demoPackageJson("web-client", { axios: "^1.7.0" })],
    ["app.js", demoAppJs()],
    [".mcp.json", mcpJson],
    ["CLAUDE.md", demoFrontendClaudeMd()],
  ];

  for (const [name, content] of frontendFiles) {
    const filePath = path.join(webDir, name);
    fs.writeFileSync(filePath, content, "utf-8");
    files.push(path.join("web-client", name));
  }

  return { files, baseDir };
}
