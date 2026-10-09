/**
 * Insert Engine Types - Personal Word Editor (Phase 3.1)
 *
 * Định nghĩa hệ thống kiểu dữ liệu cho kiến trúc Insert Engine:
 * - Nhóm công cụ (InsertGroup)
 * - Định danh phần tử (InsertItemType)
 * - Trạng thái hoạt động (InsertItemStatus: active | planned | disabled)
 * - Tùy chọn tham số cho các lệnh chèn (Options)
 * - Kết quả thực thi lệnh (InsertCommandResult)
 * - Bản ghi mô tả phần tử trong Registry (InsertItemDescriptor)
 */

export type InsertGroup =
  | "pages"
  | "tables"
  | "illustrations"
  | "links"
  | "headerFooter"
  | "text"
  | "symbols";

export type InsertItemType =
  | "pageBreak"
  | "sectionBreak"
  | "table"
  | "image"
  | "shape"
  | "textbox"
  | "link"
  | "horizontalRule"
  | "symbol"
  | "equation"
  | "header"
  | "footer"
  | "pageNumber";

export type InsertItemStatus = "active" | "planned" | "disabled";

/**
 * Tùy chọn cấu hình khi chèn Bảng (Table - dự kiến Phase 3.2)
 */
export interface InsertTableOptions {
  rows: number;
  cols: number;
  withHeaderRow?: boolean;
}

/**
 * Tùy chọn cấu hình khi chèn Hình ảnh (Image / Picture - dự kiến Phase 3.x)
 */
export interface InsertImageOptions {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  alignment?: "left" | "center" | "right";
}

/**
 * Kiểu hình vẽ vector cơ bản (Shape)
 */
export type ShapeKind =
  | "rectangle"
  | "roundedRectangle"
  | "ellipse"
  | "circle"
  | "line"
  | "arrow";

/**
 * Tùy chọn cấu hình khi chèn Hình vẽ (Shape)
 */
export interface InsertShapeOptions {
  shapeKind: ShapeKind;
  width?: number;
  height?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  alignment?: "left" | "center" | "right";
}

/**
 * Tùy chọn cấu hình khi chèn Hộp văn bản (Text Box)
 */
export interface InsertTextBoxOptions {
  width?: number;
  height?: number;
  initialText?: string;
}

/**
 * Tùy chọn cấu hình khi chèn Liên kết (Hyperlink)
 */
export interface InsertLinkOptions {
  url: string;
  text?: string;
  title?: string;
}

/**
 * Tùy chọn cấu hình khi chèn Đường kẻ ngang (Horizontal Rule)
 */
export interface InsertHorizontalRuleOptions {
  style?: "solid" | "dashed" | "dotted";
  color?: string;
  thickness?: number;
}

/**
 * Tùy chọn cấu hình khi chèn Ký hiệu đặc biệt (Symbol)
 */
export interface InsertSymbolOptions {
  symbol: string;
  fontFamily?: string;
}

/**
 * Tùy chọn cấu hình khi chèn Công thức / Phương trình (Equation)
 */
export interface InsertEquationOptions {
  latex?: string;
  displayMode?: boolean;
  alignment?: "left" | "center" | "right";
}

/**
 * Kết quả thực thi của một Insert Command
 */
export interface InsertCommandResult {
  /** Cho biết lệnh đã được thực thi thành công vào ProseMirror/Document hay chưa */
  success: boolean;
  /** Mã loại phần tử chèn */
  itemType: InsertItemType;
  /** Thông báo lỗi hoặc giải thích lý do không thực hiện được (nếu success = false) */
  message?: string;
  /** Metadata bổ sung nếu cần */
  details?: Record<string, unknown>;
}

/**
 * Thông tin mô tả một phần tử chèn trong Registry
 */
export interface InsertItemDescriptor {
  id: InsertItemType;
  name: string;
  nameEn: string;
  group: InsertGroup;
  status: InsertItemStatus;
  tooltip: string;
  phase: string;
  shortcut?: string;
  description: string;
}
