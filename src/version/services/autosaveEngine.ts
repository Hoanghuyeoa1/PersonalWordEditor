import type { AutosaveConfig, DocumentSnapshot } from "../types.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import {
  createSnapshot,
  isDocumentIdenticalToSnapshot,
} from "./versionService.ts";
import { recoveryService } from "./recoveryService.ts";

export const DEFAULT_AUTOSAVE_CONFIG: AutosaveConfig = {
  debounceMs: 2000,
  enabled: true,
};

/**
 * Động cơ Tự động Lưu (Autosave Engine) an toàn:
 * - Debounce tránh ghi đĩa liên tục trên từng phím gõ.
 * - CHỈ lưu khi tài liệu ở trạng thái bẩn (isDirty = true).
 * - Deduplication: Bỏ qua nếu nội dung giống hệt snapshot vừa lưu gần nhất.
 * - TUYỆT ĐỐI KHÔNG làm sạch trạng thái bẩn (Autosave KHÔNG bao giờ set isDirty = false).
 * - Khóa tương tranh (Concurrency Lock): Ngăn chặn xung đột giữa Autosave và Explicit Save (Ctrl+S) hoặc Restore.
 * - Xử lý lỗi an toàn: Lỗi ghi đĩa không làm crash app hay làm sai lệch dirty state.
 */
export class AutosaveEngine {
  private config: AutosaveConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isSaving = false;
  private lastAutosaveSnapshot: DocumentSnapshot | null = null;
  private explicitSaveLock = false;

  constructor(config: Partial<AutosaveConfig> = {}) {
    this.config = { ...DEFAULT_AUTOSAVE_CONFIG, ...config };
  }

  /**
   * Cập nhật cấu hình autosave
   */
  configure(config: Partial<AutosaveConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Khóa tương tranh khi Explicit Save (Ctrl+S / Save As) đang chạy
   */
  setExplicitSaveLock(locked: boolean): void {
    this.explicitSaveLock = locked;
  }

  /**
   * Đặt lại snapshot gần nhất (khi New/Open tài liệu mới)
   */
  resetLastSnapshot(): void {
    this.lastAutosaveSnapshot = null;
    this.cancelPending();
  }

  /**
   * Hủy bỏ timer debounce đang chờ
   */
  cancelPending(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Thông báo tài liệu vừa có thay đổi từ Editor.
   * Khởi động bộ đếm debounce.
   */
  notifyDocumentChange(): void {
    if (!this.config.enabled) return;

    this.cancelPending();

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.performAutosave();
    }, this.config.debounceMs);
  }

  /**
   * Thực hiện lưu snapshot tự động an toàn
   */
  async performAutosave(): Promise<DocumentSnapshot | null> {
    if (!this.config.enabled) return null;

    // 1. Kiểm tra khóa tương tranh
    if (this.isSaving || this.explicitSaveLock) {
      return null;
    }

    // 2. Yêu cầu tiên quyết: Tài liệu PHẢI đang ở trạng thái bẩn (isDirty = true)
    const store = useDocumentStore.getState();
    if (!store.isDirty) {
      return null;
    }

    const currentDoc = store.document;

    // 3. Khử trùng lặp (Deduplication): Bỏ qua nếu giống bản autosave trước
    if (
      this.lastAutosaveSnapshot &&
      this.lastAutosaveSnapshot.metadata.documentId === currentDoc.metadata.id &&
      isDocumentIdenticalToSnapshot(currentDoc, this.lastAutosaveSnapshot)
    ) {
      return null;
    }

    this.isSaving = true;
    try {
      // 4. Tạo snapshot phục hồi với reason = "autosave"
      const snapshot = await createSnapshot(currentDoc, "autosave", {
        description: "Bản tự động lưu nền bảo vệ dữ liệu",
        filePath: store.filePath,
      });

      this.lastAutosaveSnapshot = snapshot;

      // 5. Cập nhật phiên phục hồi (Crash Recovery Session)
      await recoveryService.recordRecoverySnapshot(
        currentDoc.metadata.id,
        currentDoc.metadata.title,
        store.filePath,
        snapshot.metadata.id
      );

      // QUAN TRỌNG NHẤT: TUYỆT ĐỐI KHÔNG GỌI markSaved() HOẶC THAY ĐỔI isDirty!
      // Autosave là bản bảo vệ phục hồi, không phải Explicit Save vào file chính của người dùng.

      return snapshot;
    } catch (err) {
      console.warn("Autosave thất bại (an toàn, không crash app):", err);
      return null;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Buộc chạy Autosave ngay lập tức nếu dirty (ví dụ trước khi chuyển tab hoặc unmount)
   */
  async flushNow(): Promise<DocumentSnapshot | null> {
    this.cancelPending();
    return this.performAutosave();
  }

  /**
   * Dọn dẹp tài nguyên
   */
  destroy(): void {
    this.cancelPending();
    this.isSaving = false;
    this.lastAutosaveSnapshot = null;
  }
}

// Khởi tạo Singleton Autosave Engine cho toàn ứng dụng
export const autosaveEngine = new AutosaveEngine();
