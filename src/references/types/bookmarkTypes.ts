/**
 * Bookmark Types - Personal Word Editor (Phase 5 Bookmark Semantic Core)
 */

export type BookmarkType = "position" | "range";

/**
 * Bản ghi dữ liệu Bookmark chuẩn
 */
export interface Bookmark {
  /** Định danh duy nhất và bất biến: ref_bookmark_<uuid> */
  id: string;
  /** Tên hiển thị do người dùng đặt (Unicode/Tiếng Việt, duy nhất trong tài liệu) */
  name: string;
  /** Loại bookmark: "position" (vị trí con trỏ) hoặc "range" (vùng chọn văn bản) */
  type: BookmarkType;
  /** Thời điểm tạo (ISO 8601 string) */
  createdAt: string;
}

/**
 * Vị trí và thông tin neo của Bookmark được trích xuất động từ AST
 */
export interface BookmarkLocation {
  /** Dữ liệu nhận diện bookmark */
  bookmark: Bookmark;
  /** Vị trí bắt đầu trong ProseMirror AST */
  from: number;
  /** Vị trí kết thúc trong ProseMirror AST (bằng from nếu là position bookmark) */
  to: number;
  /** Loại bookmark */
  type: BookmarkType;
  /** Trích đoạn văn bản được bao bọc (chỉ có với range bookmark) */
  text: string;
  /** Cờ đánh dấu orphan nếu bookmark mất vị trí hợp lệ */
  isOrphan?: boolean;
}

/**
 * Kết quả kiểm tra tính hợp lệ của tên Bookmark
 */
export interface BookmarkValidationResult {
  valid: boolean;
  error?: string;
  normalizedName?: string;
}

/**
 * Tùy chọn khi tạo mới một Bookmark
 */
export interface CreateBookmarkOptions {
  /** Tên hiển thị người dùng nhập */
  name: string;
  /** ID tùy chọn (nếu phục hồi/import), mặc định tự sinh ref_bookmark_<uuid> */
  id?: string;
  /** Vị trí bắt đầu tùy chọn trong AST (bảo toàn selection khi mở dialog) */
  from?: number;
  /** Vị trí kết thúc tùy chọn trong AST (bảo toàn selection khi mở dialog) */
  to?: number;
}
