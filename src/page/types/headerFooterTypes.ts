/**
 * Kiểu căn lề cho phần Header và Footer
 */
export type HeaderFooterAlignment = "left" | "center" | "right";

export interface HeaderFooterImage {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
  alignment?: HeaderFooterAlignment;
  drawingPosition?: import("../../docx/drawing/drawingTypes.ts").DrawingPosition;
}

/**
 * Cấu hình nội dung của một mục Header hoặc Footer
 */
export interface HeaderFooterItem {
  /**
   * Nội dung văn bản.
   * Hỗ trợ token động:
   * - {PAGE}: Số trang hiện tại
   * - {NUMPAGES}: Tổng số trang của tài liệu
   */
  text: string;
  /** Căn lề ngang: left, center, right */
  alignment: HeaderFooterAlignment;
  /** Tùy chọn in đậm */
  bold?: boolean;
  /** Tùy chọn in nghiêng */
  italic?: boolean;
  /** Tùy chọn hình ảnh trong Header/Footer (Phase 12) */
  image?: HeaderFooterImage;
  /** Danh sách hình ảnh trong Header/Footer */
  images?: HeaderFooterImage[];
  /** Danh sách hình vẽ / shapes trong Header/Footer */
  shapes?: any[];
  /** Danh sách hộp văn bản / textboxes trong Header/Footer */
  textBoxes?: any[];
}

/**
 * Cấu hình Header và Footer áp dụng cho một Section
 */
export interface SectionHeaderFooter {
  /**
   * Kế thừa cấu hình từ section trước đó hay không.
   * Mặc định là true cho section > 1, false cho section 1.
   * Nếu true, khi render sẽ lấy Header/Footer của section trước đó.
   */
  linkToPrevious?: boolean;
  /** Cấu hình phần đầu trang (Header) */
  header: HeaderFooterItem;
  /** Cấu hình phần chân trang (Footer) */
  footer: HeaderFooterItem;
}

/** Giá trị mặc định cho Header rỗng */
export const DEFAULT_HEADER_CONTENT: HeaderFooterItem = {
  text: "",
  alignment: "center",
};

/** Giá trị mặc định cho Footer rỗng */
export const DEFAULT_FOOTER_CONTENT: HeaderFooterItem = {
  text: "",
  alignment: "center",
};

/** Cấu hình SectionHeaderFooter mặc định */
export const DEFAULT_SECTION_HEADER_FOOTER: SectionHeaderFooter = {
  linkToPrevious: false,
  header: { ...DEFAULT_HEADER_CONTENT },
  footer: { ...DEFAULT_FOOTER_CONTENT },
};

/**
 * Thay thế token động {PAGE}, {NUMPAGES} và các metadata tokens trong chuỗi văn bản Header/Footer
 */
export function formatHeaderFooterText(
  template: string,
  pageNumber: number,
  pageCount: number,
  context?: {
    sectionIndex?: number;
    sectionPageCount?: number;
    title?: string;
    author?: string;
    date?: string;
    time?: string;
  }
): string {
  if (!template) return "";
  let res = template
    .replace(/\{PAGE\}/gi, String(pageNumber))
    .replace(/\{NUMPAGES\}/gi, String(pageCount));

  if (context?.sectionIndex !== undefined) {
    res = res.replace(/\{SECTION\}/gi, String(context.sectionIndex + 1));
  }
  if (context?.sectionPageCount !== undefined) {
    res = res.replace(/\{SECTIONPAGES\}/gi, String(context.sectionPageCount));
  }
  if (context?.title) {
    res = res.replace(/\{TITLE\}/gi, context.title);
  }
  if (context?.author) {
    res = res.replace(/\{AUTHOR\}/gi, context.author);
  }
  if (context?.date) {
    res = res.replace(/\{DATE\}/gi, context.date);
  }
  if (context?.time) {
    res = res.replace(/\{TIME\}/gi, context.time);
  }
  return res;
}

/**
 * Kiểm tra xem chuỗi có chứa token số trang {PAGE} hay không
 */
export function hasPageNumberToken(text: string): boolean {
  if (!text) return false;
  return /\{PAGE\}/i.test(text);
}
