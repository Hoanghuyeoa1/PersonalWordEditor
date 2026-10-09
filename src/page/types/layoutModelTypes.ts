/**
 * PAGINATION ENGINE 2.0 — RUNTIME PAGE LAYOUT MODEL TYPES
 *
 * Định nghĩa cấu trúc dữ liệu Runtime Layout Model & Fragment Model.
 *
 * Invariants:
 * 1. Runtime fragments KHÔNG persist vào file (.mwd).
 * 2. Runtime fragments KHÔNG trở thành semantic node IDs trong AST.
 * 3. Tuyệt đối KHÔNG mutate AST khi xây dựng model.
 */

import type { PaperSizeName, PageOrientation, PageMargins } from "./pageTypes.ts";

/**
 * Hình chữ nhật hình học chuẩn 2D (pixel)
 */
export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Helper tạo đối tượng BoundsRect chuẩn hóa
 */
export function createBoundsRect(
  x: number,
  y: number,
  width: number,
  height: number
): BoundsRect {
  const safeW = Math.max(0, Number.isFinite(width) ? width : 0);
  const safeH = Math.max(0, Number.isFinite(height) ? height : 0);
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;

  return {
    x: safeX,
    y: safeY,
    width: safeW,
    height: safeH,
    top: safeY,
    left: safeX,
    right: safeX + safeW,
    bottom: safeY + safeH,
  };
}

/**
 * Thông tin hình học của từng trang vật lý (Page Geometry)
 */
export interface PageLayoutGeometry {
  /** Chỉ số trang 0-indexed (0, 1, 2...) */
  pageIndex: number;
  /** Số thứ tự trang 1-indexed (1, 2, 3...) */
  pageNumber: number;
  /** Chỉ số section trực thuộc 1-indexed */
  sectionIndex: number;
  /** ID của section trực thuộc */
  sectionId: string;
  /** Khổ giấy của trang */
  paperSize: PaperSizeName;
  /** Hướng trang của trang */
  orientation: PageOrientation;
  /** Kích thước mm */
  widthMm: number;
  /** Chiều cao mm */
  heightMm: number;
  /** Kích thước pixel tại 96 DPI */
  widthPx: number;
  /** Chiều cao pixel tại 96 DPI */
  heightPx: number;
  /** Tọa độ bắt đầu trên Canvas (px) */
  topPx: number;
  /** Tọa độ kết thúc trên Canvas (px) */
  bottomPx: number;
  /** Lề trang chuẩn mm */
  marginsMm: PageMargins;
  /** Lề trang tính theo pixel */
  marginsPx: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Vùng Header của trang */
  headerBounds: BoundsRect;
  /** Vùng Footer của trang */
  footerBounds: BoundsRect;
  /**
   * Vùng thân trang khả dụng cho nội dung (Usable Body Bounds).
   * Đã trừ lề trên/dưới/trái/phải và vùng Header/Footer.
   */
  usableBodyBounds: BoundsRect;
  /** Dải vị trí ProseMirror doc nằm trên trang này [from, to] */
  docRange: {
    from: number;
    to: number;
  };
}

/**
 * Phân mảnh layout của một block node trên một trang cụ thể
 */
export interface LayoutFragment {
  /** Kiểu node ProseMirror (ví dụ: "paragraph", "heading", "table", "image", etc.) */
  nodeType: string;
  /** Runtime identity của block (chỉ tồn tại trong RAM layout cache, KHÔNG lưu vào AST) */
  blockId: string;
  /** Vị trí bắt đầu trong ProseMirror doc (0-indexed) */
  from: number;
  /** Vị trí kết thúc trong ProseMirror doc (0-indexed) */
  to: number;
  /** Chỉ số trang chứa phân mảnh này (0-indexed) */
  pageIndex: number;
  /** Tọa độ Y tương đối so với đỉnh trang (px) */
  top: number;
  /** Chiều cao của phân mảnh này trên trang (px) */
  height: number;
  /** Phân mảnh có phải phần tiếp nối từ trang trước (bị cắt từ trang trước) không */
  continuedFromPreviousPage: boolean;
  /** Phân mảnh có tiếp tục tràn sang trang sau không */
  continuesToNextPage: boolean;
  /** Đánh dấu khối vượt quá dung lượng trang khả dụng (oversized object fallback) */
  isOversized?: boolean;
  /** Metadata chi tiết của phân mảnh nếu nodeType là table (Phase 8 Multi-Page Table Flow) */
  tableMetadata?: TableFragmentMetadata;
}

/**
 * Thông tin định vị và hình học của một hàng trong bảng trên trang layout (0-indexed)
 */
export interface TableRowLayoutInfo {
  /** Chỉ số hàng trong bảng (0-indexed) */
  rowIndex: number;
  /** Vị trí bắt đầu trong ProseMirror doc (0-indexed offset) */
  from: number;
  /** Vị trí kết thúc trong ProseMirror doc (0-indexed offset) */
  to: number;
  /** Chiều cao hiển thị của hàng (px) */
  height: number;
  /** Chỉ số trang chứa hàng này (0-indexed) */
  pageIndex: number;
  /** Đánh dấu hàng là semantic header row */
  isHeader?: boolean;
  /** Đánh dấu hàng vượt quá chiều cao trang khả dụng (oversized row) */
  isOversized?: boolean;
}

/**
 * Metadata phân mảnh bảng qua nhiều trang (Table Fragment Metadata - Phase 8)
 */
export interface TableFragmentMetadata {
  /** Chỉ số hàng bắt đầu của phân mảnh này trong table (0-indexed) */
  startRowIndex: number;
  /** Chỉ số hàng kết thúc của phân mảnh này trong table (0-indexed, inclusive) */
  endRowIndex: number;
  /** Tổng số hàng thuộc phân mảnh này */
  rowCount: number;
  /** Danh sách chi tiết các hàng trong phân mảnh */
  rows: TableRowLayoutInfo[];
  /** Đánh dấu phân mảnh có hiển thị lặp lại visual header trên Page 2+ */
  hasRepeatedHeader?: boolean;
  /** Chiều cao của visual repeated header (px) nếu có */
  repeatedHeaderHeight?: number;
  /** Chỉ số hàng của semantic header được lặp lại (mặc định 0) */
  repeatedHeaderRowIndex?: number;
}

