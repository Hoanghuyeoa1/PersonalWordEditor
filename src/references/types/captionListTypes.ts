/**
 * Caption List Types - Personal Word Editor (Phase 2 Architecture)
 *
 * Định nghĩa cấu trúc dữ liệu cho phân hệ Danh mục Chú thích ngữ nghĩa (Semantic Caption List / Table of Figures):
 * - Hỗ trợ đa dạng nhãn: Figure, Table, Equation hoặc bất kỳ custom label nào.
 * - Single source of truth từ Document AST và CaptionService hiện tại.
 * - Danh mục độc lập: một tài liệu có thể chứa nhiều danh mục độc lập (Hình, Bảng, Công thức).
 */

export type CaptionListPreset = "classic" | "modern" | "formal";

/**
 * Bản ghi biểu diễn một mục trong Danh mục Chú thích (Caption List Entry)
 */
export interface CaptionListEntry {
  /** Định danh neo tham chiếu ngữ nghĩa bền vững của Caption */
  captionId: string;
  /** Định danh đối tượng được chú thích nếu có (Image, Table, Equation, Shape) */
  targetId: string | null;
  /** Nhãn chú thích (Figure, Table, Equation, hoặc nhãn tùy chỉnh) */
  label: string;
  /** Số thứ tự xác định theo thứ tự xuất hiện trong tài liệu (1, 2, 3...) */
  number: number;
  /** Nội dung mô tả của caption (không bao gồm tiền tố nhãn và số) */
  text: string;
  /** Tiêu đề đầy đủ hiển thị: e.g. "Figure 1 — Architecture Overview" */
  fullTitle: string;
  /** Nhãn kèm số: e.g. "Figure 1" */
  labelAndNumber: string;
  /** Số trang tính toán động từ PageLayoutMap tập trung */
  pageNumber?: number;
}

/**
 * Cấu hình thiết lập chèn/cập nhật Danh mục Chú thích
 */
export interface CaptionListConfig {
  /** Định danh bền vững của node danh mục: ref_clist_<label>_<timestamp>_<suffix> */
  id?: string;
  /** Tiêu đề hiển thị đầu danh mục (e.g. "Danh mục hình ảnh", "Danh mục bảng biểu") */
  title?: string;
  /** Nhãn caption được gom nhóm (Mặc định: "Figure") */
  label?: string;
  /** Hiển thị số trang */
  showPageNumbers?: boolean;
  /** Căn phải số trang kèm dấu chấm nối (dot leader) */
  rightAlignPageNumbers?: boolean;
  /** Phong cách hiển thị danh mục */
  preset?: CaptionListPreset;
}

/**
 * Thuộc tính lưu trữ của CaptionList node trong ProseMirror AST
 */
export interface CaptionListNodeAttrs extends CaptionListConfig {
  id: string;
  title: string;
  label: string;
  showPageNumbers: boolean;
  rightAlignPageNumbers: boolean;
  preset: CaptionListPreset;
  /** Danh sách các mục được trích xuất từ Caption source */
  entries: CaptionListEntry[];
  /** Thời điểm cập nhật danh mục gần nhất (ISO timestamp) */
  lastUpdated: string;
}
