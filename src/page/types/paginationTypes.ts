import type { PaperSizeName, PageOrientation, PageMargins } from "./pageTypes.ts";

/**
 * Thông tin hình học và định vị của từng trang vật lý
 */
export interface PageLayoutInfo {
  /** Số thứ tự trang (1, 2, 3...) */
  pageNumber: number;
  /** Chỉ số section mà trang này trực thuộc (1-indexed) */
  sectionIndex?: number;
  /** ID của section trực thuộc */
  sectionId?: string;
  /** Khổ giấy của riêng trang này */
  paperSize?: PaperSizeName;
  /** Hướng trang của riêng trang này */
  orientation?: PageOrientation;
  /** Lề trang chuẩn mm của riêng trang này */
  margins?: PageMargins;
  /** Chiều rộng trang tính theo milimet */
  widthMm: number;
  /** Chiều cao trang tính theo milimet */
  heightMm: number;
  /** Chiều rộng trang tính theo pixel */
  widthPx: number;
  /** Chiều cao trang tính theo pixel */
  heightPx: number;
  /** Tọa độ bắt đầu của trang trong hệ tọa độ canvas (px) */
  topPx: number;
  /** Tọa độ kết thúc của trang trong hệ tọa độ canvas (px) */
  bottomPx: number;
  /** Loại phân trang tạo nên trang này */
  breakType?: "start" | "explicit" | "overflow" | "section";
}

/**
 * Trạng thái phân trang tổng thể của tài liệu
 */
export interface PaginationState {
  /** Tổng số trang hiện tại */
  pageCount: number;
  /** Trang hiện tại (dựa trên vị trí con trỏ hoặc viewport) */
  currentPage: number;
  /** Chỉ số section hiện tại của con trỏ */
  currentSectionIndex?: number;
  /** Danh sách chi tiết các trang vật lý */
  pages: PageLayoutInfo[];
  /** Chiều rộng vùng nội dung khả dụng (px) */
  usableWidthPx: number;
  /** Chiều cao vùng nội dung khả dụng (px) */
  usableHeightPx: number;
  /** Chiều rộng toàn trang (px) */
  pageWidthPx: number;
  /** Chiều cao toàn trang (px) */
  pageHeightPx: number;
  /** Khoảng cách giữa các trang (px) */
  pageGapPx: number;
  /** Thông số lề theo pixel */
  marginsPx: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

/**
 * Cấu hình đầu vào cho thuật toán phân trang
 */
export interface PaginationConfig {
  paperSize: PaperSizeName;
  orientation: PageOrientation;
  margins: PageMargins;
  pageGapPx?: number;
}
