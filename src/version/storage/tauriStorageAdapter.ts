import type {
  VersionStorageAdapter,
  DocumentSnapshot,
  DocumentSnapshotMetadata,
  ActiveDocumentSession,
} from "../types.ts";
import { sanitizeStorageId } from "./versionStorageAdapter.ts";

/**
 * Storage Adapter tương tác với Tauri Rust Backend trên Desktop (Windows).
 * Đảm bảo ghi tệp nguyên tử (Atomic write via temp file + atomic rename),
 * không lock giao diện, ngăn chặn hoàn toàn Path Traversal.
 */
export class TauriStorageAdapter implements VersionStorageAdapter {
  private recoveryDir: string | null = null;

  async init(): Promise<void> {
    if (this.recoveryDir) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const dir = await invoke<string>("get_app_recovery_dir");
      this.recoveryDir = dir.replace(/\\/g, "/");
    } catch (err) {
      console.warn("Không thể lấy đường dẫn recovery dir từ Tauri, dùng fallback:", err);
      this.recoveryDir = "recovery";
    }
  }

  private async getRecoveryPath(): Promise<string> {
    if (!this.recoveryDir) {
      await this.init();
    }
    return this.recoveryDir!;
  }

  async saveSnapshot(snapshot: DocumentSnapshot): Promise<void> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(snapshot.metadata.documentId);
    const snapId = sanitizeStorageId(snapshot.metadata.id);
    const targetPath = `${root}/snapshots/${docId}/${snapId}.json`;

    const { invoke } = await import("@tauri-apps/api/core");
    const serialized = JSON.stringify(snapshot, null, 2);

    await invoke<void>("write_atomic_file", {
      path: targetPath,
      content: serialized,
    });
  }

  async getSnapshot(documentId: string, snapshotId: string): Promise<DocumentSnapshot | null> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(documentId);
    const snapId = sanitizeStorageId(snapshotId);
    const targetPath = `${root}/snapshots/${docId}/${snapId}.json`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const content = await invoke<string>("read_document_file", { path: targetPath });
      const parsed = JSON.parse(content) as DocumentSnapshot;
      if (!parsed || !parsed.metadata || !parsed.mwdPackage) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async listSnapshots(documentId: string): Promise<DocumentSnapshotMetadata[]> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(documentId);
    const dirPath = `${root}/snapshots/${docId}`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const files = await invoke<string[]>("list_files_in_dir", { dirPath });
      const results: DocumentSnapshotMetadata[] = [];

      for (const filePath of files) {
        if (!filePath.endsWith(".json")) continue;
        try {
          const content = await invoke<string>("read_document_file", { path: filePath });
          const parsed = JSON.parse(content) as DocumentSnapshot;
          if (parsed && parsed.metadata && parsed.metadata.id) {
            results.push(parsed.metadata);
          }
        } catch {
          // Bỏ qua file lỗi/hỏng, không crash app
        }
      }

      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return results;
    } catch {
      return [];
    }
  }

  async deleteSnapshot(documentId: string, snapshotId: string): Promise<void> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(documentId);
    const snapId = sanitizeStorageId(snapshotId);
    const path = `${root}/snapshots/${docId}/${snapId}.json`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<void>("delete_file", { path });
    } catch (err) {
      console.warn("Lỗi khi xóa snapshot file:", err);
    }
  }

  async clearDocumentSnapshots(documentId: string): Promise<void> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(documentId);
    const path = `${root}/snapshots/${docId}`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<void>("delete_file", { path });
    } catch (err) {
      console.warn("Lỗi khi xóa thư mục snapshots của document:", err);
    }
  }

  async saveSession(session: ActiveDocumentSession): Promise<void> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(session.documentId);
    const targetPath = `${root}/sessions/${docId}.session.json`;

    const { invoke } = await import("@tauri-apps/api/core");
    const serialized = JSON.stringify(session, null, 2);

    await invoke<void>("write_atomic_file", {
      path: targetPath,
      content: serialized,
    });
  }

  async getSession(documentId: string): Promise<ActiveDocumentSession | null> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(documentId);
    const targetPath = `${root}/sessions/${docId}.session.json`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const content = await invoke<string>("read_document_file", { path: targetPath });
      const parsed = JSON.parse(content) as ActiveDocumentSession;
      return parsed;
    } catch {
      return null;
    }
  }

  async listSessions(): Promise<ActiveDocumentSession[]> {
    const root = await this.getRecoveryPath();
    const dirPath = `${root}/sessions`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const files = await invoke<string[]>("list_files_in_dir", { dirPath });
      const sessions: ActiveDocumentSession[] = [];

      for (const filePath of files) {
        if (!filePath.endsWith(".session.json")) continue;
        try {
          const content = await invoke<string>("read_document_file", { path: filePath });
          const parsed = JSON.parse(content) as ActiveDocumentSession;
          if (parsed && parsed.documentId) {
            sessions.push(parsed);
          }
        } catch {
          // Bỏ qua session file bị hỏng
        }
      }

      return sessions;
    } catch {
      return [];
    }
  }

  async deleteSession(documentId: string): Promise<void> {
    const root = await this.getRecoveryPath();
    const docId = sanitizeStorageId(documentId);
    const path = `${root}/sessions/${docId}.session.json`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<void>("delete_file", { path });
    } catch (err) {
      console.warn("Lỗi khi xóa session file:", err);
    }
  }

  async clearAllSessions(): Promise<void> {
    const root = await this.getRecoveryPath();
    const path = `${root}/sessions`;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<void>("delete_file", { path });
    } catch (err) {
      console.warn("Lỗi khi dọn dẹp sessions:", err);
    }
  }
}
