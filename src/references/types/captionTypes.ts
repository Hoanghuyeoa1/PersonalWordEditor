/**
 * Caption Types - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Định nghĩa kiểu dữ liệu cho hệ thống Chú thích đối tượng (Captions):
 * - Figure, Table, Equation, Shape hoặc custom label.
 * - Single source of truth trong ProseMirror AST.
 * - Đánh số tự động xác định (deterministic auto-numbering).
 */

export type CaptionDefaultLabel = "Figure" | "Table" | "Equation";
export type CaptionLabel = CaptionDefaultLabel | string;
export type CaptionPosition = "above" | "below";

export interface CaptionAttrs {
  /** Định danh bền vững: ref_cap_<label>_<timestamp/uuid> */
  id: string;
  /** Nhãn chú thích: Figure | Table | Equation | Custom */
  label: CaptionLabel;
  /** Nội dung mô tả chú thích (ví dụ: Architecture Overview) */
  text: string;
  /** ID của đối tượng được chú thích (Image, Table, Equation, Shape) nếu có */
  targetId?: string | null;
  /** Vị trí ưu tiên: trên đối tượng (Table) hoặc dưới đối tượng (Figure/Equation) */
  positionPolicy?: CaptionPosition;
}

export interface CaptionItem {
  id: string;
  label: string;
  number: number;
  text: string;
  /** Tiêu đề đầy đủ hiển thị: e.g. "Figure 1 — Architecture Overview" */
  fullTitle: string;
  /** Nhãn kèm số: e.g. "Figure 1" */
  labelAndNumber: string;
  targetId: string | null;
  positionPolicy: CaptionPosition;
  pos: number;
  pageNumber?: number;
}

export interface InsertCaptionOptions {
  label: CaptionLabel;
  text?: string;
  positionPolicy?: CaptionPosition;
  targetId?: string | null;
}
