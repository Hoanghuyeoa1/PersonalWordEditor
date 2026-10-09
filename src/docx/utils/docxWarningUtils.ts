import type { DocumentModel } from "../../document/documentTypes.ts";

/**
 * Tiện ích kiểm tra độ tương thích khi xuất sang DOCX (Phase 5.8 - Data Loss Safety)
 *
 * Kiểm tra xem tài liệu có chứa các loại review metadata vượt ngoài khả năng biểu diễn của
 * chuẩn OOXML WordprocessingML hiện hành hay không.
 *
 * - KHÔNG cảnh báo với các tính năng đã hỗ trợ đầy đủ:
 *   + Bình luận (Comments: id, author, date, content, range anchor, resolved)
 *   + Theo dõi thay đổi (Track Changes: insert, delete, author, timestamp)
 * - CẢNH BÁO khi phát hiện:
 *   + Thay đổi định dạng chưa được hỗ trợ (format change revision)
 *   + Siêu dữ liệu mở rộng không tương thích
 */
export function checkDocxExportReviewCompatibility(doc: DocumentModel): string[] {
  const warnings: string[] = [];
  if (!doc) return warnings;

  // 1. Kiểm tra Tracked Changes không được hỗ trợ
  if (doc.trackedChanges && doc.trackedChanges.length > 0) {
    for (const change of doc.trackedChanges) {
      if (change.type !== "insert" && change.type !== "delete") {
        warnings.push(
          `Thay đổi có mã '${change.id}' sử dụng kiểu '${(change as any).type}' chưa được chuẩn DOCX hỗ trợ đầy đủ.`
        );
      }
    }
  }

  // 2. Kiểm tra Comments
  if (doc.comments && doc.comments.length > 0) {
    for (const com of doc.comments) {
      if ((com as any).replies && (com as any).replies.length > 0) {
        warnings.push(
          `Bình luận '${com.id}' có các phản hồi phân cấp có thể được làm phẳng khi xuất sang DOCX.`
        );
      }
    }
  }

  return warnings;
}
