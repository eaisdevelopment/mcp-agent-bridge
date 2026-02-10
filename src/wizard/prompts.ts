import type { Interface as RLInterface } from "node:readline";

// ANSI helpers
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function ask(
  rl: RLInterface,
  question: string,
  defaultVal?: string,
): Promise<string> {
  const suffix = defaultVal ? ` ${c.dim}(${defaultVal})${c.reset} ` : " ";
  return new Promise((resolve) => {
    rl.question(`${c.cyan}?${c.reset} ${question}${suffix}`, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultVal || "");
    });
  });
}

export function choose(
  rl: RLInterface,
  question: string,
  options: string[],
): Promise<number> {
  return new Promise((resolve) => {
    const lines = options
      .map((opt, i) => `  ${c.bold}[${i + 1}]${c.reset} ${opt}`)
      .join("\n");
    rl.question(
      `${c.cyan}?${c.reset} ${question}\n${lines}\n${c.cyan}>${c.reset} `,
      (answer) => {
        const num = parseInt(answer.trim(), 10);
        if (num >= 1 && num <= options.length) {
          resolve(num - 1);
        } else {
          // Default to first option on invalid input
          resolve(0);
        }
      },
    );
  });
}

export function confirm(
  rl: RLInterface,
  question: string,
  defaultVal = false,
): Promise<boolean> {
  const hint = defaultVal ? "Y/n" : "y/N";
  return new Promise((resolve) => {
    rl.question(
      `${c.cyan}?${c.reset} ${question} ${c.dim}(${hint})${c.reset} `,
      (answer) => {
        const val = answer.trim().toLowerCase();
        if (val === "") resolve(defaultVal);
        else resolve(val === "y" || val === "yes");
      },
    );
  });
}

export function banner(): void {
  console.log(`
${c.cyan}╔══════════════════════════════════════╗
║   CC Bridge — Setup Wizard          ║
║   Inter-session communication       ║
╚══════════════════════════════════════╝${c.reset}
`);
}

export function success(msg: string): void {
  console.log(`  ${c.green}✓${c.reset} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${c.yellow}!${c.reset} ${msg}`);
}

export function heading(msg: string): void {
  console.log(`\n${c.bold}━━━ ${msg} ━━━${c.reset}\n`);
}
