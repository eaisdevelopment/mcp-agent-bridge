import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private readonly threshold: number;
  private textStream: fs.WriteStream | null = null;
  private jsonStream: fs.WriteStream | null = null;

  constructor(level: LogLevel, logDir?: string) {
    this.threshold = LEVELS[level];

    if (logDir) {
      fs.mkdirSync(logDir, { recursive: true });

      const now = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\.\d{3}Z$/, "");
      const textFile = `bridge-${now}.log`;
      const jsonFile = `bridge-${now}.json.log`;

      this.textStream = fs.createWriteStream(path.join(logDir, textFile), {
        flags: "a",
      });
      this.jsonStream = fs.createWriteStream(path.join(logDir, jsonFile), {
        flags: "a",
      });
    }
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVELS[level] < this.threshold) return;

    const timestamp = new Date().toISOString();
    const humanLine = `${timestamp} [${level.toUpperCase()}] ${message}\n`;

    process.stderr.write(humanLine);
    this.textStream?.write(humanLine);

    const entry: Record<string, unknown> = { timestamp, level, message };
    if (data !== undefined) {
      entry.data = data;
    }
    this.jsonStream?.write(JSON.stringify(entry) + "\n");
  }

  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.log("error", message, data);
  }

  close(): void {
    this.textStream?.end();
    this.jsonStream?.end();
  }
}

export function createLogger(level: LogLevel, logDir?: string): Logger {
  return new Logger(level, logDir);
}

/** Pre-config logger: stderr-only at info level. Replaced after startup. */
export let logger: Logger = new Logger("info");

/**
 * Initialize the fully-configured logger with file outputs.
 * Replaces the module-level `logger` export.
 */
export function initLogger(level: LogLevel, logDir?: string): void {
  logger.close();
  logger = new Logger(level, logDir);
}
