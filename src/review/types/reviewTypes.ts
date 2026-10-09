/**
 * Review Engine Types - Personal Word Editor (Phase 5.1)
 *
 * Định nghĩa hệ thống kiểu dữ liệu cho kiến trúc Review / Proofing Engine:
 * - Nhóm công cụ Ribbon (ReviewGroup: Proofing, Comments, Tracking, Changes, Document)
 * - Định danh phần tử (ReviewItemType)
 * - Trạng thái hoạt động (ReviewItemStatus: active | planned | disabled)
 * - Bản ghi mô tả phần tử trong Registry (ReviewItemDescriptor)
 * - Mô hình trạng thái toàn cục (ProofingState, CommentsState, TrackingState, ReviewState)
 * - Dữ liệu thống kê tài liệu (DocumentStatisticsData)
 */

export type ReviewGroup =
  | "proofing"
  | "comments"
  | "tracking"
  | "changes"
  | "document";

export type ReviewItemType =
  // 1. Proofing Group
  | "spelling"
  | "grammar"
  | "previousIssue"
  | "nextIssue"
  // 2. Comments Group
  | "newComment"
  | "deleteComment"
  | "previousComment"
  | "nextComment"
  // 3. Tracking Group
  | "trackChanges"
  // 4. Changes Group
  | "acceptChange"
  | "rejectChange"
  | "acceptAllChanges"
  | "rejectAllChanges"
  | "acceptAllFormatting"
  | "rejectAllFormatting"
  | "previousChange"
  | "nextChange"
  // 5. Document Group
  | "documentStatistics";

export type ReviewItemStatus = "active" | "planned" | "disabled";

/**
 * Bản ghi mô tả phần tử trong Review Registry
 */
export interface ReviewItemDescriptor {
  id: ReviewItemType;
  name: string;
  nameEn: string;
  group: ReviewGroup;
  status: ReviewItemStatus;
  tooltip: string;
  phase: string;
  shortcut?: string;
  description: string;
}

/**
 * Trạng thái Proofing (Kiểm tra chính tả & ngữ pháp)
 */
export interface ProofingState {
  proofingEnabled: boolean;
  spellCheckLanguage: string;
  highlightSpellingErrors: boolean;
  highlightGrammarErrors: boolean;
}

export type { CommentItem } from "../../document/documentTypes.ts";
import type { CommentItem } from "../../document/documentTypes.ts";

/**
 * Trạng thái danh sách bình luận
 */
export interface CommentsState {
  comments: CommentItem[];
  activeCommentId: string | null;
}

export type {
  FormattingRevisionScope,
  RevisionStatus,
  FormattingPropertyDiff,
  FormattingRevisionDetails,
  TrackChangeItem,
} from "../../document/documentTypes.ts";
import type { TrackChangeItem } from "../../document/documentTypes.ts";

/**
 * Kiểu loại thay đổi trong Track Changes (hỗ trợ cả insert/delete và insertion/deletion tương thích)
 */
export type TrackChangeType = "insert" | "delete" | "format" | "insertion" | "deletion";

/**
 * Trạng thái theo dõi thay đổi (Tracking)
 */
export interface TrackingState {
  trackChangesEnabled: boolean;
  activeChangeId: string | null;
  changes: TrackChangeItem[];
}

/**
 * Dữ liệu thống kê toàn diện của tài liệu
 */
export interface DocumentStatisticsData {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  pages: number;
  lines: number;
  // Cấu trúc nội dung mở rộng
  headings?: number;
  tables?: number;
  images?: number;
  // Tổng quan kiểm duyệt (Review Summary)
  comments?: number;
  unresolvedComments?: number;
  trackedChanges?: number;
  trackedInsertions?: number;
  trackedDeletions?: number;
  spellingIssues?: number;
  grammarIssues?: number;
  // Thống kê vùng chọn (Selection Statistics)
  selectedWords?: number;
  selectedCharacters?: number;
  selectedCharactersNoSpaces?: number;
}

/**
 * Kết quả thực thi của một Review Command
 */
export interface ReviewCommandResult {
  success: boolean;
  itemType: ReviewItemType;
  message?: string;
  details?: Record<string, unknown>;
}
