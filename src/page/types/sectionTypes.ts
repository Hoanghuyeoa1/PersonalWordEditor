import type { PageSettings } from "./pageTypes.ts";
import type { SectionHeaderFooter } from "./headerFooterTypes.ts";

/**
 * Các loại Section Break được hỗ trợ
 */
export type SectionBreakType = "nextPage";

/**
 * Thuộc tính của node sectionBreak trong ProseMirror AST
 */
export interface SectionBreakNodeAttrs {
  /** Loại ngắt phần: mặc định là nextPage (bắt đầu trang mới) */
  sectionType: SectionBreakType;
  /** Định danh duy nhất của section bắt đầu sau ngắt này */
  sectionId?: string;
  /** Thiết lập trang riêng biệt cho section mới (kế thừa từ section trước nếu chưa tùy chỉnh) */
  pageSettings?: PageSettings | null;
  /** Cấu hình Header và Footer riêng biệt cho section mới */
  headerFooter?: SectionHeaderFooter | null;
}

/**
 * Mô hình đại diện cho một Section logic trong tài liệu
 */
export interface SectionModel {
  /** Chỉ số thứ tự của section (1, 2, 3...) */
  index: number;
  /** Định danh duy nhất của section */
  id: string;
  /** Thiết lập trang áp dụng riêng cho section này */
  pageSettings: PageSettings;
  /** Cấu hình Header và Footer của section này (Phase 2.8) */
  headerFooter?: SectionHeaderFooter;
  /** Vị trí bắt đầu trong ProseMirror document (pos) */
  fromPos: number;
  /** Vị trí kết thúc trong ProseMirror document (pos) */
  toPos: number;
  /** Vị trí của node sectionBreak bắt đầu section này (null đối với Section 1) */
  breakPos: number | null;
  /** Trang bắt đầu của section này trong hệ thống phân trang (1-indexed) */
  startPageNumber?: number;
  /** Tổng số trang thuộc riêng section này */
  pageCount?: number;
}

