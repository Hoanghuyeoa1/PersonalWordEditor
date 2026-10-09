import type { Editor } from "@tiptap/core";

/**
 * Phân loại nhóm lệnh thống nhất trong Personal Word Editor
 */
export type CommandCategory =
  | "format"
  | "insert"
  | "references"
  | "review"
  | "navigation"
  | "view"
  | "file";

/**
 * Ngữ cảnh thực thi lệnh (Command Execution Context).
 * Editor instance được truyền vào tại thời điểm thực thi / kiểm tra,
 * tuyệt đối không lưu giữ Editor lâu dài trong Registry gây stale reference.
 */
export interface CommandExecutionContext {
  editor: Editor | null;
  [key: string]: unknown;
}

/**
 * Descriptor chuẩn mực của một Command trong Unified Command System.
 * Dùng chung duy nhất cho Command Palette, Slash Commands và Ribbon.
 */
export interface EditorCommandDescriptor {
  /** Mã định danh duy nhất (Unique ID) */
  id: string;
  /** Tên hiển thị tiếng Việt */
  label: string;
  /** Tên hiển thị tiếng Anh (phục vụ tìm kiếm song ngữ) */
  labelEn?: string;
  /** Mô tả chi tiết chức năng của lệnh */
  description?: string;
  /** Phân loại nhóm lệnh */
  category: CommandCategory;
  /** Từ khóa tìm kiếm bổ sung */
  keywords?: string[];
  /** Phím tắt mặc định nếu có (ví dụ: Ctrl+B, Ctrl+Shift+P) */
  shortcut?: string;
  /** Tên biểu tượng (Icon name tương ứng trong Lucide) */
  icon?: string;
  /** Hàm kiểm tra điều kiện thực thi dựa trên trạng thái editor hiện tại */
  canExecute?: (ctx: CommandExecutionContext) => boolean;
  /** Hàm thực thi lệnh - gọi trực tiếp các command/service hiện có */
  execute: (ctx: CommandExecutionContext) => boolean | void | Promise<boolean | void>;
  /** Cho phép xuất hiện trong Slash Commands Menu hay không (mặc định: false) */
  slashEnabled?: boolean;
  /** Cho phép xuất hiện trong Command Palette hay không (mặc định: true) */
  paletteEnabled?: boolean;
}

/**
 * Tùy chọn tìm kiếm lệnh
 */
export interface CommandSearchOptions {
  /** Chỉ lọc các lệnh hỗ trợ Slash Command */
  slashOnly?: boolean;
  /** Chỉ lọc các lệnh hỗ trợ Command Palette */
  paletteOnly?: boolean;
  /** Lọc theo danh mục cụ thể */
  category?: CommandCategory;
  /** Context để đánh giá canExecute */
  ctx?: CommandExecutionContext;
}
