import type {
  VersionStorageAdapter,
  DocumentSnapshot,
  DocumentSnapshotMetadata,
  ActiveDocumentSession,
} from "../types.ts";
import { sanitizeStorageId } from "./versionStorageAdapter.ts";

/**
 * Storage Adapter trên bộ nhớ RAM (In-Memory).
 * Phục vụ chạy các targeted unit tests, môi trường Node.js và fallback không có đĩa.
 */
export class MemoryStorageAdapter implements VersionStorageAdapter {
  private snapshots = new Map<string, Map<string, DocumentSnapshot>>();
  private sessions = new Map<string, ActiveDocumentSession>();

  async init(): Promise<void> {
    // Không cần khởi tạo tài nguyên ngoài
  }

  async saveSnapshot(snapshot: DocumentSnapshot): Promise<void> {
    const docId = sanitizeStorageId(snapshot.metadata.documentId);
    const snapId = sanitizeStorageId(snapshot.metadata.id);

    if (!this.snapshots.has(docId)) {
      this.snapshots.set(docId, new Map());
    }
    // Deep clone để đảm bảo tính bất biến độc lập
    const cloned: DocumentSnapshot = JSON.parse(JSON.stringify(snapshot));
    this.snapshots.get(docId)!.set(snapId, cloned);
  }

  async getSnapshot(documentId: string, snapshotId: string): Promise<DocumentSnapshot | null> {
    const docId = sanitizeStorageId(documentId);
    const snapId = sanitizeStorageId(snapshotId);

    const docMap = this.snapshots.get(docId);
    if (docMap && docMap.has(snapId)) {
      return JSON.parse(JSON.stringify(docMap.get(snapId)!));
    }

    // Fallback: Tìm theo snapshotId nếu documentId trong store bị chuyển đổi
    for (const map of this.snapshots.values()) {
      if (map.has(snapId)) {
        return JSON.parse(JSON.stringify(map.get(snapId)!));
      }
    }

    return null;
  }

  async listSnapshots(documentId: string): Promise<DocumentSnapshotMetadata[]> {
    const docId = sanitizeStorageId(documentId);
    const docMap = this.snapshots.get(docId);
    if (!docMap) {
      return [];
    }

    const list: DocumentSnapshotMetadata[] = [];
    for (const snap of docMap.values()) {
      list.push({ ...snap.metadata });
    }
    // Sắp xếp thời gian tạo mới nhất lên trước
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  async deleteSnapshot(documentId: string, snapshotId: string): Promise<void> {
    const docId = sanitizeStorageId(documentId);
    const snapId = sanitizeStorageId(snapshotId);

    const docMap = this.snapshots.get(docId);
    if (docMap) {
      docMap.delete(snapId);
    }
  }

  async clearDocumentSnapshots(documentId: string): Promise<void> {
    const docId = sanitizeStorageId(documentId);
    this.snapshots.delete(docId);
  }

  async saveSession(session: ActiveDocumentSession): Promise<void> {
    const docId = sanitizeStorageId(session.documentId);
    this.sessions.set(docId, { ...session });
  }

  async getSession(documentId: string): Promise<ActiveDocumentSession | null> {
    const docId = sanitizeStorageId(documentId);
    const session = this.sessions.get(docId);
    return session ? { ...session } : null;
  }

  async listSessions(): Promise<ActiveDocumentSession[]> {
    return Array.from(this.sessions.values()).map((s) => ({ ...s }));
  }

  async deleteSession(documentId: string): Promise<void> {
    const docId = sanitizeStorageId(documentId);
    this.sessions.delete(docId);
  }

  async clearAllSessions(): Promise<void> {
    this.sessions.clear();
  }

  /**
   * Phương thức trợ giúp xóa sạch toàn bộ dữ liệu trong adapter (dùng cho teardown test)
   */
  clearAll(): void {
    this.snapshots.clear();
    this.sessions.clear();
  }
}
