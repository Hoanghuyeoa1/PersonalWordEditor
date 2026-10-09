/**
 * Cross-Reference Types - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Định nghĩa kiểu dữ liệu cho hệ thống Tham chiếu chéo (Cross-reference):
 * - Target: Heading, Caption (Figure/Table/Equation), Footnote, Endnote.
 * - Dynamic resolution: tham chiếu tới ID ngữ nghĩa, không copy text tĩnh.
 * - Format: Toàn bộ nội dung, Chỉ nhãn & số, Chỉ số thứ tự, Số trang.
 */

export type CrossReferenceTargetType =
  | "heading"
  | "caption"
  | "figure"
  | "table"
  | "equation"
  | "footnote"
  | "endnote"
  | "bookmark";

export type CrossReferenceFormat =
  | "text"            // Heading text, hoặc caption full title
  | "labelAndNumber"  // "Figure 1", "Table 2"
  | "number"          // "1", "2"
  | "pageNumber";     // Số trang vật lý

export interface CrossReferenceAttrs {
  /** ID ngữ nghĩa của đối tượng mục tiêu được tham chiếu */
  targetId: string;
  /** Loại đối tượng mục tiêu */
  targetType: CrossReferenceTargetType;
  /** Định dạng kết xuất hiển thị của tham chiếu */
  format: CrossReferenceFormat;
  /** Văn bản dự phòng lưu tạm thời nếu cần */
  customText?: string | null;
}

export interface CrossReferenceTargetItem {
  id: string;
  type: CrossReferenceTargetType;
  /** Tiêu đề hiển thị trong danh sách chọn của Dialog */
  title: string;
  /** Nhãn kèm số nếu là Caption hoặc Note: e.g. "Figure 1", "Note 2" */
  labelAndNumber?: string;
  /** Nội dung text thuần túy */
  text: string;
  /** Số thứ tự (nếu có) */
  number?: number | string;
  /** Số trang */
  pageNumber?: number;
  /** Vị trí bắt đầu trong AST */
  pos: number;
}

export interface InsertCrossReferenceOptions {
  targetId: string;
  targetType: CrossReferenceTargetType;
  format: CrossReferenceFormat;
}
