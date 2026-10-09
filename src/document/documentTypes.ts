import type { JSONContent } from "@tiptap/core";
import type { PageSettings } from "../page/types/pageTypes.ts";
import type { SectionModel } from "../page/types/sectionTypes.ts";
import type { SectionHeaderFooter } from "../page/types/headerFooterTypes.ts";

/**
 * Metadata cơ bản của tài liệu trong Personal Word Editor.
 */
export interface DocumentMetadata {
  /** Định danh duy nhất của tài liệu */
  id: string;
  /** Tiêu đề hiển thị của tài liệu */
  title: string;
  /** Phiên bản cấu trúc hoặc revision nội bộ của tài liệu */
  version: number;
  /** Thời điểm tạo (ISO 8601 string) */
  createdAt: string;
  /** Thời điểm cập nhật nội dung gần nhất (ISO 8601 string) */
  updatedAt: string;
}

/**
 * Bản ghi dữ liệu một bình luận trong tài liệu (Phase 5.4 - Comments Core)
 */
export interface CommentItem {
  /** Định danh duy nhất của bình luận */
  id: string;
  /** Tên tác giả bình luận */
  author: string;
  /** Thời điểm tạo (ISO 8601 string) */
  createdAt: string;
  /** Thời điểm cập nhật nội dung (ISO 8601 string) */
  updatedAt: string;
  /** Nội dung bình luận */
  content: string;
  /** Trạng thái đã giải quyết (resolved) */
  resolved: boolean;
  /** Chuỗi văn bản trích dẫn được gắn bình luận tại thời điểm tạo */
  selectedText?: string;
}

/**
 * Kiểu loại thay đổi trong Track Changes (Phase 5.5 & Track Changes 2.0)
 */
export type TrackChangeType = "insert" | "delete" | "format";

/**
 * Phạm vi của Formatting Revision (Track Changes 2.0 - Phase 2)
 */
export type FormattingRevisionScope = "character" | "paragraph" | "style";

/**
 * Trạng thái của một Revision
 */
export type RevisionStatus = "pending" | "accepted" | "rejected";

/**
 * Chi tiết một thuộc tính thay đổi trong Formatting Revision
 */
export interface FormattingPropertyDiff<T = any> {
  property: string;
  before: T;
  after: T;
  isInheritedBefore?: boolean;
}

/**
 * Cấu trúc thông tin chi tiết của một Formatting Revision
 */
export interface FormattingRevisionDetails {
  scope: FormattingRevisionScope;
  changes: FormattingPropertyDiff[];
  summary?: string;
  targetNodeId?: string;
  styleId?: string;
}

/**
 * Bản ghi dữ liệu một thay đổi được theo dõi trong tài liệu (Track Changes 2.0)
 */
export interface TrackChangeItem {
  /** Định danh duy nhất và ổn định của thay đổi */
  id: string;
  /** Loại thay đổi: chèn mới (insert), xóa (delete), hoặc định dạng (format) */
  type: TrackChangeType;
  /** Tên tác giả thực hiện thay đổi */
  author: string;
  /** Thời điểm thực hiện thay đổi (ISO 8601 string) */
  timestamp: string;
  /** Trạng thái duyệt thay đổi */
  status?: RevisionStatus;
  /** Nội dung văn bản liên quan tại thời điểm tạo hoặc trích xuất */
  text?: string;
  /** Phạm vi áp dụng của thay đổi */
  scope?: FormattingRevisionScope;
  /** Chi tiết các thuộc tính định dạng thay đổi (khi type = 'format') */
  formatChange?: FormattingRevisionDetails;
  /** Mô tả tóm tắt định dạng thay đổi */
  formatDetails?: string;
  /** ID node mục tiêu cho paragraph/block revision anchor */
  targetNodeId?: string;
  /** Vị trí runtime trong ProseMirror doc (nếu có khi trích xuất) */
  from?: number;
  to?: number;
  originalText?: string;
  newText?: string;
}

import type { BibliographySource, CitationStyle } from "../references/types/citationTypes.ts";
import type { DocumentStylesMetadata } from "../styles/types/styleTypes.ts";
import type { Bookmark } from "../references/types/bookmarkTypes.ts";

/**
 * Siêu dữ liệu hệ thống tham chiếu (Phase 6 Foundation & Phase 6.6 Citation/Bibliography & Phase 8 Persistence)
 */
export interface DocumentReferencesMetadata {
  /** Danh mục neo tham chiếu đã lưu trữ trong tài liệu */
  anchors?: Record<string, { id: string; targetType: string; label: string }>;
  /** Danh mục nguồn tài liệu tham khảo đã lưu trong tài liệu (Phase 6.6) */
  bibliographySources?: BibliographySource[];
  /** Kiểu trích dẫn mặc định của tài liệu (mặc định "apa") */
  citationStyle?: CitationStyle;
  /** Danh sách siêu dữ liệu Bookmark ngữ nghĩa đã lưu trong tài liệu (Phase 8) */
  bookmarks?: Bookmark[];
}

/**
 * Mô hình dữ liệu nguồn chính (Internal Document Model) của ứng dụng.
 * Quản lý cây nội dung ProseMirror AST cùng các thiết lập trang (PageSettings), Sections, Header/Footer, Comments, Tracked Changes, References và Styles definitions.
 */
export interface DocumentModel {
  /** Thông tin thuộc tính tài liệu */
  metadata: DocumentMetadata;
  /** Cây AST nội dung theo chuẩn ProseMirror / Tiptap JSON */
  content: JSONContent;
  /** Thiết lập trang mặc định / Section 1 (khổ giấy, hướng trang, lề trang chuẩn mm) */
  pageSettings: PageSettings;
  /** Cấu hình Header và Footer mặc định / Section 1 (Phase 2.8) */
  headerFooter?: SectionHeaderFooter;
  /** Danh sách các Section logic của tài liệu (trích xuất đồng bộ từ AST) */
  sections?: SectionModel[];
  /** Danh sách các bình luận trong tài liệu (Phase 5.4) */
  comments?: CommentItem[];
  /** Danh sách các thay đổi được theo dõi trong tài liệu (Phase 5.5) */
  trackedChanges?: TrackChangeItem[];
  /** Siêu dữ liệu hệ thống tham chiếu (Phase 6.1 Foundation) */
  references?: DocumentReferencesMetadata;
  /** Siêu dữ liệu hệ thống kiểu dáng ngữ nghĩa Styles Engine 2.0 (Phase 1 Foundation) */
  styles?: DocumentStylesMetadata;
  /** Các package parts chưa hỗ trợ được bảo toàn nguyên vẹn (Phase 13 - Charts, SmartArt, Themes...) */
  unsupportedParts?: Map<string, string | Uint8Array>;
}



