/**
 * Table of Contents Types - Personal Word Editor (Phase 6.3)
 *
 * Định nghĩa cấu trúc dữ liệu cho phân hệ Mục lục ngữ nghĩa (Semantic Table of Contents):
 * - Kiểu hiển thị / phong cách (TocPreset: classic | modern | formal)
 * - Từng mục trong mục lục (TocEntry)
 * - Cấu hình mục lục (TocConfig)
 * - Thuộc tính lưu trữ trong ProseMirror node (TocNodeAttrs)
 */

export type TocPreset = "classic" | "modern" | "formal";

/**
 * Bản ghi biểu diễn một mục trong Table of Contents
 */
export interface TocEntry {
  /** Định danh neo tham chiếu ngữ nghĩa của Heading tương ứng */
  headingId: string;
  /** Cấp độ đề mục (1, 2, 3) */
  level: 1 | 2 | 3;
  /** Văn bản hiển thị của đề mục */
  text: string;
  /** Số trang tính toán động */
  pageNumber?: number;
}

/**
 * Cấu hình thiết lập Table of Contents
 */
export interface TocConfig {
  /** Tiêu đề hiển thị đầu mục lục (Mặc định: "Mục lục") */
  title?: string;
  /** Danh sách cấp độ Heading được bao gồm (Mặc định: [1, 2, 3]) */
  includedLevels?: (1 | 2 | 3)[];
  /** Hiển thị số trang */
  showPageNumbers?: boolean;
  /** Căn phải số trang kèm dấu chấm nối (dot leader) */
  rightAlignPageNumbers?: boolean;
  /** Phong cách hiển thị mục lục */
  preset?: TocPreset;
}

/**
 * Thuộc tính của TableOfContents node trong ProseMirror AST
 */
export interface TocNodeAttrs extends TocConfig {
  title: string;
  includedLevels: (1 | 2 | 3)[];
  showPageNumbers: boolean;
  rightAlignPageNumbers: boolean;
  preset: TocPreset;
  /** Danh sách các mục được sinh ra từ Heading source */
  entries: TocEntry[];
  /** Thời điểm cập nhật mục lục gần nhất (ISO timestamp) */
  lastUpdated: string;
}
