import { PeerInfo, MessageRecord } from "../types.js";
export declare function registerPeer(peerId: string, sessionId: string, cwd: string, label: string): Promise<PeerInfo>;
export declare function updateLastSeen(peerId: string): Promise<void>;
export declare function deregisterPeer(peerId: string): Promise<boolean>;
export declare function getPeer(peerId: string): Promise<PeerInfo | undefined>;
export declare function listPeers(): Promise<PeerInfo[]>;
export declare function recordMessage(record: Omit<MessageRecord, "id" | "timestamp">): Promise<MessageRecord>;
export declare function getHistory(peerId?: string, limit?: number): Promise<MessageRecord[]>;
//# sourceMappingURL=peer-registry.d.ts.map