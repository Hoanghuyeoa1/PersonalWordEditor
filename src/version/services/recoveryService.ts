import type { Editor } from "@tiptap/core";
import type { ActiveDocumentSession, DocumentSnapshot } from "../types.ts";
import type { DocumentModel } from "../../document/documentTypes.ts";
import { getVersionStorageAdapter } from "../storage/storageFactory.ts";
import { loadSnapshot, restoreSnapshot } from "./versionService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";

export interface PendingRecoveryResult {
  hasRecovery: boolean;
  session?: ActiveDocumentSession;
  snapshot?: DocumentSnapshot;
  recoveredDoc?: DocumentModel;
}

/**
 * Dịch vụ phục hồi sự cố (Crash Recovery Service):
 * - Theo dõi phiên làm việc hiện tại (ActiveDocumentSession).
 * - Ghi nhận Clean Shutdown marker để phân biệt tắt app bình thường vs Crash/Force Kill/Mất điện.
 * - Kiểm tra bản cứu hộ hợp lệ khi khởi động app.
 * - Cho phép người dùng lựa chọn Khôi phục (Recover) hoặc Bỏ qua (Discard).
 * - Tuyệt đối không tự động ghi đè file chính của người dùng khi chưa được chỉ định.
 */
export class RecoveryService {
  private currentDocumentId: string | null = null;

  /**
   * Bắt đầu một phiên làm việc mới cho tài liệu (cleanShutdown = false)
   */
  async startSession(
    documentId: string,
    documentTitle: string,
    filePath: string | null = null
  ): Promise<void> {
    this.currentDocumentId = documentId;
    const adapter = getVersionStorageAdapter();
    await adapter.init();

    const now = new Date().toISOString();
    const session: ActiveDocumentSession = {
      documentId,
      documentTitle,
      filePath,
      cleanShutdown: false,
      latestRecoverySnapshotId: null,
      sessionStartedAt: now,
      lastModifiedAt: now,
    };

    await adapter.saveSession(session);
  }

  /**
   * Ghi nhận snapshot phục hồi mới nhất cho phiên làm việc
   */
  async recordRecoverySnapshot(
    documentId: string,
    documentTitle: string,
    filePath: string | null,
    snapshotId: string
  ): Promise<void> {
    this.currentDocumentId = documentId;
    const adapter = getVersionStorageAdapter();
    await adapter.init();

    const existing = await adapter.getSession(documentId);
    const now = new Date().toISOString();

    const session: ActiveDocumentSession = {
      documentId,
      documentTitle,
      filePath,
      cleanShutdown: false,
      latestRecoverySnapshotId: snapshotId,
      sessionStartedAt: existing?.sessionStartedAt ?? now,
      lastModifiedAt: now,
    };

    await adapter.saveSession(session);
  }

  /**
   * Đánh dấu phiên làm việc đã đóng sạch sẽ (Clean Shutdown)
   */
  async markCleanShutdown(documentId?: string): Promise<void> {
    const id = documentId || this.currentDocumentId;
    if (!id) return;

    const adapter = getVersionStorageAdapter();
    await adapter.init();

    const existing = await adapter.getSession(id);
    if (existing) {
      existing.cleanShutdown = true;
      existing.lastModifiedAt = new Date().toISOString();
      await adapter.saveSession(existing);
    }
  }

  /**
   * Đánh dấu toàn bộ các phiên đang mở là Clean Shutdown (khi ứng dụng thoát bình thường)
   */
  async markAllCleanShutdown(): Promise<void> {
    const adapter = getVersionStorageAdapter();
    await adapter.init();

    const sessions = await adapter.listSessions();
    for (const session of sessions) {
      if (!session.cleanShutdown) {
        session.cleanShutdown = true;
        session.lastModifiedAt = new Date().toISOString();
        await adapter.saveSession(session);
      }
    }
  }

  /**
   * Kiểm tra khi khởi động app: có phiên làm việc nào bị crash chưa đóng sạch hay không.
   * Xác thực tính hợp lệ của snapshot trước khi trình diện cho người dùng,
   * bỏ qua snapshot bị hỏng mà không làm sập ứng dụng.
   */
  async checkPendingRecovery(): Promise<PendingRecoveryResult> {
    try {
      const adapter = getVersionStorageAdapter();
      await adapter.init();

      const sessions = await adapter.listSessions();
      // Tìm session gần nhất có cleanShutdown === false và có snapshotId
      const ungracefulSessions = sessions.filter(
        (s) => !s.cleanShutdown && Boolean(s.latestRecoverySnapshotId)
      );

      if (ungracefulSessions.length === 0) {
        return { hasRecovery: false };
      }

      // Sắp xếp lấy session mới nhất
      ungracefulSessions.sort(
        (a, b) => new Date(b.lastModifiedAt).getTime() - new Date(a.lastModifiedAt).getTime()
      );

      for (const session of ungracefulSessions) {
        if (!session.latestRecoverySnapshotId) continue;

        const loadRes = await loadSnapshot(
          session.documentId,
          session.latestRecoverySnapshotId
        );

        if (loadRes.success) {
          return {
            hasRecovery: true,
            session,
            snapshot: loadRes.snapshot,
            recoveredDoc: loadRes.document,
          };
        } else {
          console.warn(
            `Bản snapshot phục hồi ${session.latestRecoverySnapshotId} bị lỗi/hỏng:`,
            loadRes.error
          );
          // Đánh dấu session này là sạch để không nhắc lại lần sau
          session.cleanShutdown = true;
          await adapter.saveSession(session);
        }
      }

      return { hasRecovery: false };
    } catch (err) {
      console.warn("Lỗi khi kiểm tra trạng thái khôi phục crash:", err);
      return { hasRecovery: false };
    }
  }

  /**
   * Thực hiện khôi phục tài liệu từ phiên crash đã chọn
   */
  async applyRecovery(
    session: ActiveDocumentSession,
    editor: Editor | null
  ): Promise<boolean> {
    if (!session.latestRecoverySnapshotId) return false;

    const res = await restoreSnapshot(session.latestRecoverySnapshotId, editor);
    if (res.success) {
      // Đặt lại đường dẫn tệp ban đầu nếu có
      if (session.filePath) {
        useDocumentStore.setState({
          filePath: session.filePath,
          currentFilePath: session.filePath,
        });
      }
      // Đánh dấu phiên này đã được xử lý
      await this.markCleanShutdown(session.documentId);
      // Bắt đầu phiên mới cho tài liệu hiện tại
      await this.startSession(session.documentId, session.documentTitle, session.filePath);
      return true;
    }
    return false;
  }

  /**
   * Người dùng chọn Bỏ qua (Discard) bản phục hồi
   */
  async discardRecovery(session: ActiveDocumentSession): Promise<void> {
    const adapter = getVersionStorageAdapter();
    await adapter.init();

    // Đánh dấu cleanShutdown = true để không hỏi lại
    session.cleanShutdown = true;
    await adapter.saveSession(session);
  }
}

// Khởi tạo Singleton Recovery Service
export const recoveryService = new RecoveryService();
