/**
 * References Engine Types - Personal Word Editor (Phase 6.1 Architecture)
 *
 * Định nghĩa hệ thống kiểu dữ liệu nền móng cho kiến trúc References Engine:
 * - Nhóm công cụ Ribbon (ReferenceGroup: toc, footnotes, endnotes, citations, bibliography, captions, crossReference, navigation)
 * - Định danh phần tử (ReferenceItemType)
 * - Trạng thái hoạt động (ReferenceItemStatus: active | planned | disabled)
 * - Bản ghi mô tả phần tử trong Registry (ReferenceItemDescriptor)
 * - Đối tượng định danh neo ngữ nghĩa (ReferenceAnchor, ReferenceTargetType, SemanticReferenceId)
 * - Trạng thái UI (ReferencesUIState, ReferencePanelType)
 * - Kết quả điều phối lệnh (ReferenceCommandResult)
 */

export type ReferenceGroup =
  | "toc"
  | "footnotes"
  | "endnotes"
  | "citations"
  | "bibliography"
  | "captions"
  | "crossReference"
  | "navigation";

export type ReferenceItemType =
  // 1. Table of Contents Group (Phase 6.2)
  | "insertToc"
  | "updateToc"
  | "removeToc"
  // 2. Footnotes & Endnotes Group (Phase 6.3)
  | "insertFootnote"
  | "nextFootnote"
  | "previousFootnote"
  | "insertEndnote"
  | "showNotes"
  // 3. Citations & Bibliography Group (Phase 6.5 - 6.6)
  | "insertCitation"
  | "manageSources"
  | "citationStyle"
  | "insertBibliography"
  // 4. Captions & Cross-reference Group (Phase 6.4 & 6.7)
  | "insertCaption"
  | "insertTableOfFigures"
  | "updateTableOfFigures"
  | "crossReference"
  // 5. Navigation & Headings Outline Group (Phase 6.8)
  | "headingsOutline"
  | "bookmarksList";

export type ReferenceItemStatus = "active" | "planned" | "disabled";

/**
 * Bản ghi mô tả phần tử trong References Registry
 */
export interface ReferenceItemDescriptor {
  /** Định danh duy nhất của tính năng */
  id: ReferenceItemType;
  /** Nhãn hiển thị tiếng Việt */
  label: string;
  /** Tên hiển thị tiếng Việt (tương thích quy ước Registry) */
  name: string;
  /** Tên tiếng Anh */
  nameEn: string;
  /** Nhóm chức năng */
  group: ReferenceGroup;
  /** Trạng thái kích hoạt hiện tại */
  status: ReferenceItemStatus;
  /** Gợi ý công cụ (Tooltip) */
  tooltip: string;
  /** Phiên bản phase triển khai */
  phase: string;
  /** Phím tắt nếu có */
  shortcut?: string;
  /** Mô tả chi tiết tính năng */
  description: string;
}

/**
 * Loại mục tiêu tham chiếu ngữ nghĩa
 */
export type ReferenceTargetType =
  | "heading"
  | "caption"
  | "footnote"
  | "endnote"
  | "citation"
  | "bookmark";

/**
 * Cấu trúc đối tượng neo tham chiếu ngữ nghĩa (Reference Anchor)
 * Độc lập với vị trí DOM và chỉ số mảng nhất thời
 */
export interface ReferenceAnchor {
  /** Định danh duy nhất, bền vững: e.g. ref_heading_550e8400... */
  id: string;
  /** Phân loại đối tượng tham chiếu */
  targetType: ReferenceTargetType;
  /** Nhãn tóm tắt / tiêu đề của đối tượng tham chiếu */
  label: string;
  /** Định danh nội dung hoặc khóa tra cứu mục tiêu */
  targetId: string;
  /** Vị trí tương đối trong AST (nếu được tính toán động tại thời điểm truy vấn) */
  pos?: number;
  /** Siêu dữ liệu bổ trợ theo ngữ cảnh */
  metadata?: Record<string, unknown>;
}

/**
 * Cấu trúc giải mã ID tham chiếu ngữ nghĩa
 */
export interface SemanticReferenceId {
  prefix: "ref";
  type: ReferenceTargetType;
  uniquePart: string;
  raw: string;
}

/**
 * Kiểu bảng điều khiển tham chiếu phụ trợ bên lề (UI only)
 */
export type ReferencePanelType = "none" | "outline" | "notes" | "citations";

/**
 * Trạng thái UI của References Subsystem (chỉ lưu trữ trạng thái giao diện)
 */
export interface ReferencesUIState {
  activeReferencePanel: ReferencePanelType;
  isReferencesPanelOpen: boolean;
  selectedReferenceId: string | null;
}

/**
 * Kết quả thực thi một References Command
 */
export interface ReferenceCommandResult {
  success: boolean;
  itemType: ReferenceItemType;
  message?: string;
  details?: Record<string, unknown>;
}
