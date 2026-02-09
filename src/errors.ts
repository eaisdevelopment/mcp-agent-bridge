export enum BridgeErrorCode {
  CLI_NOT_FOUND = "CLI_NOT_FOUND",
  CLI_TIMEOUT = "CLI_TIMEOUT",
  CLI_EXEC_FAILED = "CLI_EXEC_FAILED",
  STATE_CORRUPT = "STATE_CORRUPT",
  STATE_WRITE_FAILED = "STATE_WRITE_FAILED",
  LOCK_TIMEOUT = "LOCK_TIMEOUT",
  LOCK_STALE = "LOCK_STALE",
  PEER_NOT_FOUND = "PEER_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  STARTUP_FAILED = "STARTUP_FAILED",
  DIR_NOT_WRITABLE = "DIR_NOT_WRITABLE",
}

export class BridgeError extends Error {
  public readonly code: BridgeErrorCode;
  public readonly suggestion?: string;

  constructor(code: BridgeErrorCode, message: string, suggestion?: string) {
    const fullMessage = suggestion
      ? `${code}: ${message}. ${suggestion}`
      : `${code}: ${message}`;
    super(fullMessage);
    this.name = "BridgeError";
    this.code = code;
    this.suggestion = suggestion;
  }
}

export function toolResult(text: string, isError?: boolean) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true as const } : {}),
  };
}

export function errorResult(error: unknown) {
  if (error instanceof BridgeError) {
    return toolResult(
      JSON.stringify(
        {
          success: false,
          error: error.code,
          message: error.message,
          suggestion: error.suggestion,
        },
        null,
        2,
      ),
      true,
    );
  }
  const message =
    error instanceof Error ? error.message : String(error);
  return toolResult(
    JSON.stringify(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message,
      },
      null,
      2,
    ),
    true,
  );
}

export function successResult(data: Record<string, unknown>) {
  return toolResult(JSON.stringify(data, null, 2), false);
}
