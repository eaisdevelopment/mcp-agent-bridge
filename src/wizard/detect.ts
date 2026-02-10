import { execSync } from "node:child_process";

export function detectNpxPath(): string {
  try {
    return execSync("which npx", { encoding: "utf-8" }).trim();
  } catch {
    return "npx";
  }
}

export function detectClaudePath(): string | null {
  try {
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export function isNvmPath(p: string): boolean {
  return p.includes(".nvm/versions/");
}
