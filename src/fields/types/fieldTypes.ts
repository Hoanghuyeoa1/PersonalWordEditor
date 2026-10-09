/**
 * Kiểu loại trường động (Field Type) được hỗ trợ trong Semantic Field Engine (Phase 4).
 * Tuân thủ ISO/IEC 29500 WordprocessingML Field Specifications.
 */
export type SupportedFieldType =
  | "PAGE"
  | "NUMPAGES"
  | "DATE"
  | "TIME"
  | "TITLE"
  | "AUTHOR"
  | "SECTION"
  | "SECTIONPAGES"
  | "REF"
  | "PAGEREF"
  | "UNKNOWN";

/**
 * Thuộc tính của một thực thể Field trong mô hình tài liệu
 */
export interface FieldAttributes {
  /** Phân loại trường động ngữ nghĩa */
  fieldType: SupportedFieldType;
  /** Chỉ thị trường đã được chuẩn hóa (ví dụ: "PAGE", "DATE", "REF Bookmark1") */
  instruction: string;
  /** Đối số chính (ví dụ: tên bookmark trong REF/PAGEREF hoặc định dạng) */
  argument?: string;
  /** Danh sách các switch đi kèm (ví dụ: ["\\h", "\\* MERGEFORMAT"]) */
  switches?: string[];
  /**
   * Kết quả hiển thị (Display Result).
   * Không bao giờ là source of truth; nguồn chân lý luôn là `instruction`.
   */
  result: string;
  /** Chỉ thị gốc từ tệp OOXML trước khi chuẩn hóa */
  rawInstruction?: string;
  /** Cờ đánh dấu trường được lưu dưới dạng phức hợp (fldChar) hay đơn giản (fldSimple) */
  isComplex?: boolean;
}

/**
 * Ngữ cảnh tính toán và giải quyết giá trị động của Field
 */
export interface FieldResolutionContext {
  /** Số thứ tự trang hiện tại (1-based) */
  pageNumber?: number;
  /** Tổng số trang của toàn bộ tài liệu */
  pageCount?: number;
  /** Số thứ tự phân đoạn (Section) hiện tại (0-based hoặc 1-based) */
  sectionIndex?: number;
  /** Tổng số trang trong phân đoạn hiện tại */
  sectionPageCount?: number;
  /** Tiêu đề tài liệu từ metadata */
  documentTitle?: string;
  /** Tác giả tài liệu từ metadata */
  documentAuthor?: string;
  /** Thời gian tạo tài liệu */
  createdAt?: string;
  /** Thời gian cập nhật tài liệu */
  updatedAt?: string;
  /** Mốc thời gian thực hiện cập nhật trường (mặc định là thời điểm hiện tại) */
  now?: Date;
  /** Bảng tra cứu các vị trí tham chiếu/bookmark (phục vụ REF và PAGEREF) */
  bookmarks?: Map<string, { text?: string; pageNumber?: number }>;
}
