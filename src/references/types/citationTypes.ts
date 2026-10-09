/**
 * Citation & Bibliography Types - Personal Word Editor (Phase 6.6 Architecture)
 *
 * Định nghĩa hệ thống kiểu dữ liệu cho Quản lý Nguồn trích dẫn (Citation Manager)
 * và Thư mục tài liệu tham khảo (Bibliography):
 * - BibliographySource: Bản ghi thông tin nguồn tham khảo (Sách, Bài báo, Website, Kỷ yếu).
 * - SourceType: book | journalArticle | website | conferencePaper.
 * - CitationStyle: apa | ieee.
 * - CitationAttrs: Thuộc tính của inline atom node `citation`.
 * - BibliographyAttrs: Thuộc tính của block atom node `bibliography`.
 */

export type SourceType = "book" | "journalArticle" | "website" | "conferencePaper";

export type CitationStyle = "apa" | "ieee";

/**
 * Bản ghi dữ liệu một nguồn tài liệu tham khảo trong tài liệu
 */
export interface BibliographySource {
  /** Mã định danh ổn định của nguồn (định dạng "ref_src_<uuid/timestamp>") */
  id: string;
  /** Loại nguồn tài liệu */
  type: SourceType;
  /** Tiêu đề của sách, bài báo hoặc trang web */
  title: string;
  /** Tên tác giả (hoặc danh sách tác giả, phân tách bằng dấu phẩy hoặc chấm phẩy) */
  authors: string;
  /** Năm xuất bản hoặc phát hành */
  year: number | string;
  /** Nhà xuất bản (áp dụng cho Sách, Kỷ yếu) */
  publisher?: string;
  /** Tên tạp chí khoa học (áp dụng cho Bài báo) */
  journal?: string;
  /** Tập / Volume (áp dụng cho Bài báo) */
  volume?: string | number;
  /** Số phát hành / Issue (áp dụng cho Bài báo) */
  issue?: string | number;
  /** Trang trích dẫn (ví dụ: "12-25" hoặc "105") */
  pages?: string;
  /** Đường dẫn URL (áp dụng cho Website, Bài báo điện tử) */
  url?: string;
  /** Ngày truy cập (định dạng YYYY-MM-DD hoặc ISO string) */
  accessedAt?: string;
  /** Tên hội thảo / kỷ yếu hội nghị (áp dụng cho Kỷ yếu) */
  conferenceName?: string;
  /** Nơi xuất bản / Thành phố */
  city?: string;
  /** Phiên bản tái bản / Edition */
  edition?: string;
  /** Mã định danh số DOI (nếu có) */
  doi?: string;
}

/**
 * Thuộc tính của inline atom node `citation` trong ProseMirror AST
 */
export interface CitationAttrs {
  /** Định danh nguồn tham khảo được liên kết */
  sourceId: string;
  /** Kiểu trích dẫn (mặc định lấy theo tài liệu hoặc "apa") */
  style?: CitationStyle;
  /** Tiền tố hiển thị trước trích dẫn (ví dụ: "xem thêm ") */
  prefix?: string;
  /** Hậu tố hiển thị sau trích dẫn (ví dụ: ", tr. 45") */
  suffix?: string;
  /** Văn bản dự phòng phân giải tĩnh khi hiển thị ngoại tuyến */
  customText?: string;
}

/**
 * Mục tài liệu tham khảo đã định dạng trong danh mục Thư mục
 */
export interface BibliographyEntry {
  /** Định danh của nguồn */
  id: string;
  /** Chuỗi văn bản đã định dạng theo quy cách style */
  text: string;
  /** Số thứ tự (áp dụng cho kiểu IEEE [1], [2]...) */
  number?: number;
  /** Nguồn tham khảo gốc */
  source?: BibliographySource;
}

/**
 * Thuộc tính của block atom node `bibliography` trong ProseMirror AST
 */
export interface BibliographyAttrs {
  /** Tiêu đề khối Thư mục (mặc định "Tài liệu tham khảo") */
  title: string;
  /** Kiểu trích dẫn đang áp dụng ("apa" hoặc "ieee") */
  style: CitationStyle;
  /** Bộ lọc nguồn ("citedOnly": chỉ nguồn có trích dẫn; "all": toàn bộ nguồn đã lưu) */
  filter: "citedOnly" | "all";
  /** Thời điểm cập nhật danh mục gần nhất (ISO string) */
  lastUpdated: string;
  /** Danh sách các mục tài liệu đã được biên tập định dạng */
  entries: BibliographyEntry[];
}

/**
 * Tùy chọn khi chèn trích dẫn mới
 */
export interface InsertCitationOptions {
  sourceId: string;
  style?: CitationStyle;
  prefix?: string;
  suffix?: string;
}

/**
 * Tùy chọn khi chèn hoặc cập nhật Thư mục tài liệu
 */
export interface InsertBibliographyOptions {
  title?: string;
  style?: CitationStyle;
  filter?: "citedOnly" | "all";
}
