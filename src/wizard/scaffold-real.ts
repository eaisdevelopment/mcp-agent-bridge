import fs from "node:fs";
import path from "node:path";
import { mcpJsonContent, mcpJsonMerge, claudeMdBridgeSection } from "./templates.js";

export interface RealConfig {
  projectAPath: string;
  projectAId: string;
  projectALabel: string;
  projectBPath: string;
  projectBId: string;
  projectBLabel: string;
  npxPath: string;
}

export interface RealScaffoldResult {
  created: string[];
  modified: string[];
  skipped: string[];
}

function writeMcpJson(projectPath: string, npxPath: string): "created" | "modified" {
  const filePath = path.join(projectPath, ".mcp.json");
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, mcpJsonMerge(existing, npxPath), "utf-8");
    return "modified";
  }
  fs.writeFileSync(filePath, mcpJsonContent(npxPath), "utf-8");
  return "created";
}

function writeClaudeMd(
  projectPath: string,
  peerId: string,
  label: string,
  otherPeerId: string,
): "created" | "modified" | "skipped" {
  const filePath = path.join(projectPath, "CLAUDE.md");
  const section = claudeMdBridgeSection(peerId, label, otherPeerId);

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing.includes("## CC Bridge Protocol")) {
      return "skipped";
    }
    fs.writeFileSync(filePath, existing.trimEnd() + "\n\n" + section, "utf-8");
    return "modified";
  }
  fs.writeFileSync(filePath, section, "utf-8");
  return "created";
}

export function scaffoldReal(config: RealConfig): RealScaffoldResult {
  const created: string[] = [];
  const modified: string[] = [];
  const skipped: string[] = [];

  // Project A
  const mcpA = writeMcpJson(config.projectAPath, config.npxPath);
  const mcpAPath = path.join(config.projectAPath, ".mcp.json");
  if (mcpA === "created") created.push(mcpAPath);
  else modified.push(mcpAPath);

  const claudeA = writeClaudeMd(
    config.projectAPath,
    config.projectAId,
    config.projectALabel,
    config.projectBId,
  );
  const claudeAPath = path.join(config.projectAPath, "CLAUDE.md");
  if (claudeA === "created") created.push(claudeAPath);
  else if (claudeA === "modified") modified.push(claudeAPath);
  else skipped.push(claudeAPath);

  // Project B
  const mcpB = writeMcpJson(config.projectBPath, config.npxPath);
  const mcpBPath = path.join(config.projectBPath, ".mcp.json");
  if (mcpB === "created") created.push(mcpBPath);
  else modified.push(mcpBPath);

  const claudeB = writeClaudeMd(
    config.projectBPath,
    config.projectBId,
    config.projectBLabel,
    config.projectAId,
  );
  const claudeBPath = path.join(config.projectBPath, "CLAUDE.md");
  if (claudeB === "created") created.push(claudeBPath);
  else if (claudeB === "modified") modified.push(claudeBPath);
  else skipped.push(claudeBPath);

  return { created, modified, skipped };
}
