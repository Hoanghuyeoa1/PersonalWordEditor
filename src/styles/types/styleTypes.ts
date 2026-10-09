/**
 * Kiểu loại Style của tài liệu trong Styles Engine 2.0.
 * - "paragraph": Định dạng áp dụng cho toàn bộ khối đoạn văn (kèm ký tự kế thừa)
 * - "character": Định dạng áp dụng chỉ cho chuỗi ký tự (run / mark)
 */
export type DocumentStyleType = "paragraph" | "character";

/**
 * Thuộc tính định dạng khối đoạn văn (Paragraph Properties).
 * Phục vụ căn lề, giãn dòng, khoảng cách đoạn và thụt lề theo chuẩn văn bản.
 */
export interface ParagraphStyleProperties {
  /** Căn lề ngang: left, center, right, justify */
  textAlign?: "left" | "center" | "right" | "justify";
  /** Độ giãn dòng (VD: "1.0", "1.15", "1.5", "2.0" hoặc số dương tỉ lệ) */
  lineSpacing?: string | number;
  /** Khoảng cách phía trên đoạn văn (points / pt) */
  spacingBefore?: number;
  /** Khoảng cách phía dưới đoạn văn (points / pt) */
  spacingAfter?: number;
  /** Mức thụt lề trái (indent level 0..8 hoặc pt) */
  leftIndent?: number;
  /** Mức thụt lề phải (pt) */
  rightIndent?: number;
  /** Thụt lề dòng đầu tiên (First Line Indent - pt) */
  firstLineIndent?: number;
  /** Nhô lề dòng đầu (Hanging Indent - pt) */
  hangingIndent?: number;
  /** Giữ liền trang với đoạn kế tiếp (Keep with next paragraph) */
  keepWithNext?: boolean;
  /** Giữ tất cả các dòng trong đoạn cùng một trang (Do not split lines within paragraph) */
  keepLinesTogether?: boolean;
  /** Bắt đầu đoạn văn ở đầu trang mới (Start on new page) */
  pageBreakBefore?: boolean;
  /** Kiểm soát dòng đơn độc (Widow/Orphan control: tối thiểu 2 dòng đầu và cuối trang) */
  widowControl?: boolean;
  /** Cấp độ đề mục ngữ nghĩa thực sự (1 | 2 | 3) nếu style gắn với Heading */
  headingLevel?: 1 | 2 | 3;
}

/**
 * Thuộc tính định dạng ký tự (Character Properties).
 * Phục vụ phông chữ, cỡ chữ, màu sắc và các hiệu ứng chữ đậm/nghiêng/gạch chân.
 */
export interface CharacterStyleProperties {
  /** Tên phông chữ (VD: "Calibri", "Arial", "Times New Roman") */
  fontFamily?: string;
  /** Cỡ chữ tính theo pt (VD: 11, 12, 14, 16) */
  fontSize?: number | string;
  /** Chữ in đậm */
  bold?: boolean;
  /** Chữ in nghiêng */
  italic?: boolean;
  /** Gạch chân văn bản */
  underline?: boolean;
  /** Gạch ngang chữ */
  strike?: boolean;
  /** Màu chữ dạng hex hoặc rgb (VD: "#0f172a") */
  color?: string;
  /** Màu nền highlight của chữ (VD: "#fef08a") */
  highlight?: string;
}

/**
 * Bản ghi định nghĩa một Style hoàn chỉnh trong tài liệu (Semantic Style Definition).
 */
export interface DocumentStyle {
  /** Định danh duy nhất và ổn định của Style (VD: "style_normal", "style_heading_1") */
  id: string;
  /** Tên hiển thị người dùng (VD: "Normal", "Heading 1", "Tiêu đề 1") */
  name: string;
  /** Kiểu phân loại Style */
  type: DocumentStyleType;
  /** ID của Style cơ sở dùng làm gốc kế thừa (null hoặc undefined nếu là root style) */
  basedOn?: string | null;
  /** ID của Style sẽ tự động áp dụng cho đoạn văn kế tiếp khi nhấn Enter */
  nextStyleId?: string | null;
  /** ID của Style liên kết giữa paragraph và character style (w:link) */
  linkStyleId?: string | null;
  /** Cờ đánh dấu style mặc định cho loại này (w:default="1") */
  isDefault?: boolean;
  /** Cờ đánh dấu hiển thị trong Quick Styles Gallery (w:qFormat) */
  qFormat?: boolean;
  /** Định danh gốc trong OOXML word/styles.xml (Word styleId) để bảo toàn ánh xạ hai chiều */
  wordStyleId?: string;
  /** Cờ đánh dấu style hệ thống có sẵn (không được phép xóa, ID cố định) */
  isBuiltIn: boolean;
  /** Thuộc tính định dạng khối đoạn văn (cho paragraph style) */
  paragraph?: ParagraphStyleProperties;
  /** Thuộc tính định dạng ký tự */
  character?: CharacterStyleProperties;
}

/**
 * Khối siêu dữ liệu lưu trữ toàn bộ Style definitions ở cấp độ Document Model.
 * Tránh việc sao chép định nghĩa style vào từng node trong cây AST.
 */
export interface DocumentStylesMetadata {
  /** Danh sách định nghĩa các Style trong tài liệu */
  definitions: DocumentStyle[];
  /** Định danh style đoạn văn mặc định (mặc định "style_normal") */
  defaultParagraphStyleId?: string;
  /** Định danh style ký tự mặc định (nếu có) */
  defaultCharacterStyleId?: string;
}
