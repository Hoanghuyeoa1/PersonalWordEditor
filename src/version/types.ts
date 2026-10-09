/**
 * Định nghĩa cấu trúc dữ liệu cho Phase 7.2:
 * Local Version History + Autosave + Crash Recovery
 */

export type SnapshotReason =
  | "autosave"      // Bản tự động lưu định kỳ khi tài liệu có sửa đổi (dirty)
  | "manual"        // Bản sao lưu thủ công do người dùng chủ động tạo mốc
  | "recovery"      // Bản chụp cứu trợ khi phát hiện đóng bất thường hoặc sự cố
  | "pre-restore"   // Bản sao lưu bảo vệ dữ liệu hiện tại trước khi khôi phục snapshot cũ
  | "explicit-save";// Bản ghi nhận tại mốc lưu chính thức (Ctrl+S / Save As)

export interface DocumentSnapshotMetadata {
  /** Mã định danh duy nhất của snapshot (snap-*) */
  id: string;
  /** Mã định danh của tài liệu sở hữu snapshot */
  documentId: string;
  /** Thời điểm tạo snapshot (ISO 8601 string) */
  createdAt: string;
  /** Lý do tạo bản chụp */
  reason: SnapshotReason;
  /** Tiêu đề tài liệu tại thời điểm chụp */
  documentTitle: string;
  /** Đường dẫn file chính trên đĩa (*.mwd) nếu đã lưu */
  originalFilePath?: string | null;
  /** Thống kê số từ */
  wordCount: number;
  /** Thống kê số ký tự */
  characterCount: number;
  /** Thống kê số đoạn văn */
  paragraphCount: number;
  /** Phiên bản cấu trúc document model */
  version: number;
  /** Mô tả chi tiết hoặc nhãn người dùng gán */
  description?: string;
}

export interface DocumentSnapshot {
  /** Thông tin định danh và thuộc tính của bản chụp */
  metadata: DocumentSnapshotMetadata;
  /** Chuỗi tuần tự hóa gói .mwd chuẩn hóa đầy đủ (AST, pageSettings, sections, comments, tracked changes, references) */
  mwdPackage: string;
}

export interface ActiveDocumentSession {
  /** ID tài liệu đang mở */
  documentId: string;
  /** Tiêu đề tài liệu */
  documentTitle: string;
  /** Đường dẫn file chính (nếu có) */
  filePath: string | null;
  /** Cờ đánh dấu đã đóng bình thường (true: clean shutdown, false: ungraceful/crash) */
  cleanShutdown: boolean;
  /** ID snapshot phục hồi gần nhất */
  latestRecoverySnapshotId: string | null;
  /** Thời điểm bắt đầu phiên làm việc */
  sessionStartedAt: string;
  /** Thời điểm cập nhật cuối cùng */
  lastModifiedAt: string;
}

export interface VersionStorageAdapter {
  init(): Promise<void>;
  saveSnapshot(snapshot: DocumentSnapshot): Promise<void>;
  getSnapshot(documentId: string, snapshotId: string): Promise<DocumentSnapshot | null>;
  listSnapshots(documentId: string): Promise<DocumentSnapshotMetadata[]>;
  deleteSnapshot(documentId: string, snapshotId: string): Promise<void>;
  clearDocumentSnapshots(documentId: string): Promise<void>;

  saveSession(session: ActiveDocumentSession): Promise<void>;
  getSession(documentId: string): Promise<ActiveDocumentSession | null>;
  listSessions(): Promise<ActiveDocumentSession[]>;
  deleteSession(documentId: string): Promise<void>;
  clearAllSessions(): Promise<void>;
}

export interface RetentionPolicyConfig {
  /** Số lượng snapshot tối đa lưu giữ cho mỗi tài liệu (mặc định: 20) */
  maxSnapshotsPerDocument: number;
  /** Luôn giữ lại các bản chụp thủ công và bản pre-restore (mặc định: true) */
  preserveMilestones: boolean;
}

export interface RestoreResult {
  success: boolean;
  error?: string;
  backupSnapshotId?: string;
}

export interface AutosaveConfig {
  /** Khoảng thời gian debounce sau khi ngừng gõ (ms, mặc định: 2000) */
  debounceMs: number;
  /** Bật/tắt tự động lưu */
  enabled: boolean;
}
