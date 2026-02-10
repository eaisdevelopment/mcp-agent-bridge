export interface PeerInfo {
    peerId: string;
    sessionId: string;
    cwd: string;
    label: string;
    registeredAt: string;
    lastSeenAt: string;
}
export interface MessageRecord {
    id: string;
    fromPeerId: string;
    toPeerId: string;
    message: string;
    response: string | null;
    timestamp: string;
    durationMs: number | null;
    success: boolean;
    error: string | null;
}
export interface SendMessageResult {
    success: boolean;
    response: string | null;
    error: string | null;
    durationMs: number;
}
export interface CliExecResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}
//# sourceMappingURL=types.d.ts.map