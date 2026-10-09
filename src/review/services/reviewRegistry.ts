import type {
  ReviewGroup,
  ReviewItemType,
  ReviewItemDescriptor,
} from "../types/reviewTypes.ts";

/**
 * Review Registry - Personal Word Editor (Phase 5.1 Architecture)
 *
 * Quản lý tập trung toàn bộ danh mục chức năng trong tab Review Ribbon:
 * - Proofing (Chính tả & Ngữ pháp)
 * - Comments (Bình luận & Nhận xét)
 * - Tracking (Theo dõi thay đổi)
 * - Changes (Chấp nhận & Từ chối thay đổi)
 * - Document (Thống kê tài liệu / Đếm từ)
 */

export const REVIEW_ITEMS: ReviewItemDescriptor[] = [
  // 1. Proofing Group
  {
    id: "spelling",
    name: "Chính tả",
    nameEn: "Spelling",
    group: "proofing",
    status: "active",
    shortcut: "F7",
    tooltip: "Bật/tắt kiểm tra lỗi chính tả tự động",
    phase: "5.2",
    description: "Rà soát lỗi chính tả từ ngữ và đề xuất từ thay thế qua decorations gạch đỏ.",
  },
  {
    id: "grammar",
    name: "Ngữ pháp",
    nameEn: "Grammar",
    group: "proofing",
    status: "active",
    tooltip: "Bật/tắt kiểm tra lỗi ngữ pháp và dấu câu tự động",
    phase: "5.3",
    description: "Phát hiện lỗi cú pháp, dấu câu, khoảng trắng và từ lặp qua decorations gạch xanh.",
  },

  // 2. Comments Group
  {
    id: "newComment",
    name: "Thêm nhận xét",
    nameEn: "New Comment",
    group: "comments",
    status: "active",
    shortcut: "Ctrl+Alt+M",
    tooltip: "Thêm bình luận cho đoạn văn bản đang chọn",
    phase: "5.4",
    description: "Tạo ghi chú nhận xét gắn liền với văn bản được chọn.",
  },
  {
    id: "deleteComment",
    name: "Xóa nhận xét",
    nameEn: "Delete",
    group: "comments",
    status: "active",
    tooltip: "Xóa bình luận đang chọn khỏi tài liệu",
    phase: "5.4",
    description: "Xóa bỏ bình luận khỏi tài liệu nhưng giữ nguyên văn bản gốc.",
  },
  {
    id: "previousComment",
    name: "Trước",
    nameEn: "Previous",
    group: "comments",
    status: "active",
    tooltip: "Đi tới bình luận trước đó",
    phase: "5.4",
    description: "Di chuyển con trỏ tới vị trí bình luận trước.",
  },
  {
    id: "nextComment",
    name: "Tiếp",
    nameEn: "Next",
    group: "comments",
    status: "active",
    tooltip: "Đi tới bình luận tiếp theo",
    phase: "5.4",
    description: "Di chuyển con trỏ tới vị trí bình luận kế tiếp.",
  },

  // 3. Tracking Group
  {
    id: "trackChanges",
    name: "Theo dõi thay đổi",
    nameEn: "Track Changes",
    group: "tracking",
    status: "active",
    shortcut: "Ctrl+Shift+E",
    tooltip: "Bật/tắt ghi nhận mọi thay đổi trên văn bản (Ctrl+Shift+E)",
    phase: "5.5",
    description: "Lưu vết thêm mới và xóa bỏ khi chỉnh sửa văn bản.",
  },

  // 4. Changes Group
  {
    id: "acceptChange",
    name: "Chấp nhận",
    nameEn: "Accept",
    group: "changes",
    status: "active",
    tooltip: "Chấp nhận thay đổi hiện tại",
    phase: "5.6",
    description: "Áp dụng thay đổi vào nội dung chính và chuyển tiếp.",
  },
  {
    id: "rejectChange",
    name: "Từ chối",
    nameEn: "Reject",
    group: "changes",
    status: "active",
    tooltip: "Từ chối thay đổi hiện tại",
    phase: "5.6",
    description: "Hủy bỏ thay đổi và giữ nguyên văn bản gốc.",
  },
  {
    id: "previousChange",
    name: "Trước",
    nameEn: "Previous",
    group: "changes",
    status: "active",
    tooltip: "Đi tới thay đổi trước đó",
    phase: "5.5",
    description: "Di chuyển tới vị trí thay đổi được ghi nhận phía trước.",
  },
  {
    id: "nextChange",
    name: "Tiếp",
    nameEn: "Next",
    group: "changes",
    status: "active",
    tooltip: "Đi tới thay đổi tiếp theo",
    phase: "5.5",
    description: "Di chuyển tới vị trí thay đổi được ghi nhận kế tiếp.",
  },

  // 5. Document Group
  {
    id: "documentStatistics",
    name: "Đếm từ",
    nameEn: "Word Count",
    group: "document",
    status: "active",
    tooltip: "Xem thống kê chi tiết số trang, số từ, số ký tự và dòng",
    phase: "5.1",
    description: "Mở bảng thống kê định lượng chi tiết của tài liệu.",
  },
];

export const EXTRA_REVIEW_ITEMS: Record<string, ReviewItemDescriptor> = {
  acceptAllChanges: {
    id: "acceptAllChanges",
    name: "Chấp nhận tất cả",
    nameEn: "Accept All",
    group: "changes",
    status: "active",
    tooltip: "Chấp nhận toàn bộ thay đổi trong tài liệu",
    phase: "5.6",
    description: "Áp dụng tất cả các thay đổi còn lại vào tài liệu.",
  },
  rejectAllChanges: {
    id: "rejectAllChanges",
    name: "Từ chối tất cả",
    nameEn: "Reject All",
    group: "changes",
    status: "active",
    tooltip: "Từ chối toàn bộ thay đổi trong tài liệu",
    phase: "5.6",
    description: "Khôi phục lại nội dung gốc cho toàn bộ thay đổi.",
  },
  acceptAllFormatting: {
    id: "acceptAllFormatting",
    name: "Chấp nhận tất cả định dạng",
    nameEn: "Accept All Formatting",
    group: "changes",
    status: "active",
    tooltip: "Chấp nhận toàn bộ thay đổi định dạng trong tài liệu",
    phase: "7",
    description: "Áp dụng toàn bộ thay đổi định dạng và giữ nguyên văn bản thêm/xóa.",
  },
  rejectAllFormatting: {
    id: "rejectAllFormatting",
    name: "Từ chối tất cả định dạng",
    nameEn: "Reject All Formatting",
    group: "changes",
    status: "active",
    tooltip: "Từ chối toàn bộ thay đổi định dạng trong tài liệu",
    phase: "7",
    description: "Khôi phục lại định dạng ban đầu và giữ nguyên văn bản thêm/xóa.",
  },
  previousIssue: {
    id: "previousIssue",
    name: "Lỗi trước",
    nameEn: "Previous Issue",
    group: "proofing",
    status: "active",
    shortcut: "Shift+F7",
    tooltip: "Đi tới lỗi chính tả hoặc ngữ pháp trước đó (Shift+F7)",
    phase: "5.7",
    description: "Di chuyển con trỏ tới vị trí lỗi kiểm tra phía trước.",
  },
  nextIssue: {
    id: "nextIssue",
    name: "Lỗi tiếp",
    nameEn: "Next Issue",
    group: "proofing",
    status: "active",
    shortcut: "F7",
    tooltip: "Đi tới lỗi chính tả hoặc ngữ pháp tiếp theo (F7)",
    phase: "5.7",
    description: "Di chuyển con trỏ tới vị trí lỗi kiểm tra kế tiếp.",
  },
};

/**
 * Tra cứu thông tin phần tử Review theo ID
 */
export function getReviewItemDescriptor(id: ReviewItemType): ReviewItemDescriptor | undefined {
  return REVIEW_ITEMS.find((item) => item.id === id) || EXTRA_REVIEW_ITEMS[id];
}

/**
 * Lấy danh sách các phần tử theo nhóm ReviewGroup
 */
export function getReviewItemsByGroup(group: ReviewGroup): ReviewItemDescriptor[] {
  return REVIEW_ITEMS.filter((item) => item.group === group);
}
