import type {
  ReferenceGroup,
  ReferenceItemType,
  ReferenceItemDescriptor,
} from "../types/referencesTypes.ts";

/**
 * References Registry - Personal Word Editor (Phase 6.1 Architecture)
 *
 * Quản lý tập trung toàn bộ danh mục chức năng trong hệ thống References:
 * - Table of Contents (Mục lục)
 * - Footnotes & Endnotes (Chú thích cuối trang / tài liệu)
 * - Citations & Bibliography (Trích dẫn & Thư mục)
 * - Captions & Cross-reference (Chú thích & Tham chiếu chéo)
 * - Heading Navigation (Điều hướng đề mục)
 *
 * Phase 6.1: Các tính năng tương lai được đánh dấu planned với phase tương ứng,
 * đảm bảo không hiển thị button trông hoạt động nhưng thực tế không làm gì.
 */

export const REFERENCE_ITEMS: ReferenceItemDescriptor[] = [
  // 1. Table of Contents Group (Phase 6.3)
  {
    id: "insertToc",
    label: "Mục lục",
    name: "Mục lục",
    nameEn: "Table of Contents",
    group: "toc",
    status: "active",
    phase: "6.3",
    tooltip: "Tạo mục lục tự động dựa trên các tiêu đề trong tài liệu",
    description: "Quét các Heading 1, 2, 3 và tạo khối mục lục tự động với liên kết trang.",
  },
  {
    id: "updateToc",
    label: "Cập nhật mục lục",
    name: "Cập nhật mục lục",
    nameEn: "Update Table",
    group: "toc",
    status: "active",
    phase: "6.3",
    shortcut: "F9",
    tooltip: "Cập nhật số trang và tiêu đề trong mục lục (F9)",
    description: "Đồng bộ lại cấu trúc mục lục khi văn bản có sự thay đổi.",
  },
  {
    id: "removeToc",
    label: "Xóa mục lục",
    name: "Xóa mục lục",
    nameEn: "Remove Table",
    group: "toc",
    status: "active",
    phase: "6.3",
    tooltip: "Xóa khối mục lục hiện tại khỏi tài liệu",
    description: "Gỡ bỏ khối mục lục tự động mà không làm ảnh hưởng nội dung các đề mục.",
  },

  // 2. Footnotes & Endnotes Group (Phase 6.4)
  {
    id: "insertFootnote",
    label: "Chèn Footnote",
    name: "Chèn Footnote",
    nameEn: "Insert Footnote",
    group: "footnotes",
    status: "active",
    phase: "6.4",
    shortcut: "Ctrl+Alt+F",
    tooltip: "Thêm chú thích ở cuối trang hiện tại (Ctrl+Alt+F)",
    description: "Đánh số chú thích tự động và thêm nội dung giải thích ở chân trang tương ứng.",
  },
  {
    id: "insertEndnote",
    label: "Chèn Endnote",
    name: "Chèn Endnote",
    nameEn: "Insert Endnote",
    group: "endnotes",
    status: "active",
    phase: "6.4",
    shortcut: "Ctrl+Alt+D",
    tooltip: "Thêm chú thích ở cuối tài liệu (Ctrl+Alt+D)",
    description: "Đánh số la mã tự động và thêm chú thích tổng kết ở cuối tài liệu.",
  },
  {
    id: "nextFootnote",
    label: "Footnote tiếp",
    name: "Footnote tiếp",
    nameEn: "Next Footnote",
    group: "footnotes",
    status: "active",
    phase: "6.4",
    tooltip: "Di chuyển đến chú thích cuối trang tiếp theo",
    description: "Điều hướng con trỏ soạn thảo đến vị trí footnote kế tiếp.",
  },
  {
    id: "previousFootnote",
    label: "Footnote trước",
    name: "Footnote trước",
    nameEn: "Previous Footnote",
    group: "footnotes",
    status: "active",
    phase: "6.4",
    tooltip: "Di chuyển đến chú thích cuối trang trước đó",
    description: "Điều hướng con trỏ soạn thảo đến vị trí footnote phía trước.",
  },
  {
    id: "showNotes",
    label: "Xem chú thích",
    name: "Xem chú thích",
    nameEn: "Show Notes",
    group: "footnotes",
    status: "active",
    phase: "6.4",
    tooltip: "Xem vùng danh sách chú thích cuối trang hoặc tài liệu",
    description: "Mở khu vực quản lý và duyệt nhanh các ghi chú đã tạo.",
  },

  // 3. Citations & Bibliography Group
  {
    id: "insertCitation",
    label: "Chèn trích dẫn",
    name: "Chèn trích dẫn",
    nameEn: "Insert Citation",
    group: "citations",
    status: "active",
    phase: "6.6",
    tooltip: "Thêm trích dẫn tài liệu tham khảo theo nguồn đã lưu",
    description: "Chèn dấu trích dẫn tiêu chuẩn (tác giả, năm) vào vị trí con trỏ.",
  },
  {
    id: "manageSources",
    label: "Quản lý nguồn",
    name: "Quản lý nguồn",
    nameEn: "Manage Sources",
    group: "citations",
    status: "active",
    phase: "6.6",
    tooltip: "Quản lý danh sách các tài liệu và sách tham khảo",
    description: "Thêm mới, sửa, xóa các nguồn tham khảo (sách, bài báo, website).",
  },
  {
    id: "citationStyle",
    label: "Kiểu trích dẫn",
    name: "Kiểu trích dẫn",
    nameEn: "Citation Style",
    group: "citations",
    status: "active",
    phase: "6.6",
    tooltip: "Chọn định dạng trích dẫn (APA, IEEE)",
    description: "Thay đổi quy cách định dạng các dấu trích dẫn và thư mục tham khảo.",
  },
  {
    id: "insertBibliography",
    label: "Thư mục tài liệu",
    name: "Thư mục tài liệu",
    nameEn: "Bibliography",
    group: "bibliography",
    status: "active",
    phase: "6.6",
    tooltip: "Tạo danh mục tài liệu tham khảo ở cuối văn bản",
    description: "Tự động kết xuất toàn bộ danh sách nguồn trích dẫn thành mục thư mục chuẩn.",
  },

  // 4. Captions & Cross-reference Group
  {
    id: "insertCaption",
    label: "Chèn chú thích",
    name: "Chèn chú thích",
    nameEn: "Insert Caption",
    group: "captions",
    status: "active",
    phase: "6.5",
    tooltip: "Gắn nhãn chú thích cho hình ảnh, bảng biểu hoặc công thức",
    description: "Đánh số tự động (Hình 1, Bảng 1) và đặt tên cho đối tượng minh họa.",
  },
  {
    id: "insertTableOfFigures",
    label: "Danh mục hình",
    name: "Danh mục hình",
    nameEn: "Table of Figures",
    group: "captions",
    status: "active",
    phase: "6.7",
    tooltip: "Tạo danh mục các hình ảnh hoặc bảng biểu trong tài liệu",
    description: "Tập hợp các nhãn Caption thành bảng mục lục hình/bảng kèm số trang.",
  },

  {
    id: "updateTableOfFigures",
    label: "Cập nhật danh mục",
    name: "Cập nhật danh mục",
    nameEn: "Update Table of Figures",
    group: "captions",
    status: "active",
    phase: "6.7",
    shortcut: "F9",
    tooltip: "Cập nhật lại số trang và nhãn của danh mục hình ảnh/bảng (F9)",
    description: "Đồng bộ lại danh mục đối tượng khi có thay đổi trong tài liệu.",
  },
  {
    id: "crossReference",
    label: "Tham chiếu chéo",
    name: "Tham chiếu chéo",
    nameEn: "Cross-reference",
    group: "crossReference",
    status: "active",
    phase: "6.5",
    tooltip: "Tạo liên kết tham chiếu tới đề mục, hình ảnh hoặc chú thích khác",
    description: "Chèn liên kết nội bộ tới các đối tượng có ID định danh trong tài liệu.",
  },

  // 5. Navigation & Headings Outline Group
  {
    id: "headingsOutline",
    label: "Sơ đồ đề mục",
    name: "Sơ đồ đề mục",
    nameEn: "Heading Navigation",
    group: "navigation",
    status: "active",
    phase: "6.2",
    tooltip: "Mở hoặc đóng bảng điều hướng sơ đồ đề mục của tài liệu",
    description: "Duyệt nhanh tài liệu qua cây phân cấp Heading 1, 2, 3 và di chuyển con trỏ tới đề mục.",
  },
  {
    id: "bookmarksList",
    label: "Thẻ đánh dấu",
    name: "Thẻ đánh dấu",
    nameEn: "Bookmarks",
    group: "navigation",
    status: "active",
    phase: "6.8",
    shortcut: "Ctrl+Shift+F5",
    tooltip: "Quản lý và điều hướng các điểm đánh dấu (Bookmarks)",
    description: "Tạo và nhảy nhanh đến các vị trí được ghim trong văn bản.",
  },
];

/**
 * Tra cứu thông tin phần tử Reference theo ID
 */
export function getReferenceItemDescriptor(id: ReferenceItemType): ReferenceItemDescriptor | undefined {
  return REFERENCE_ITEMS.find((item) => item.id === id);
}

/**
 * Lấy danh sách các phần tử theo nhóm ReferenceGroup
 */
export function getReferenceItemsByGroup(group: ReferenceGroup): ReferenceItemDescriptor[] {
  return REFERENCE_ITEMS.filter((item) => item.group === group);
}

/**
 * Thống kê tổng quan trạng thái Registry
 */
export function getReferenceRegistryStats(): {
  total: number;
  active: number;
  planned: number;
  disabled: number;
  groups: Record<ReferenceGroup, number>;
} {
  const groups = {} as Record<ReferenceGroup, number>;
  let active = 0;
  let planned = 0;
  let disabled = 0;

  for (const item of REFERENCE_ITEMS) {
    groups[item.group] = (groups[item.group] || 0) + 1;
    if (item.status === "active") active++;
    else if (item.status === "planned") planned++;
    else if (item.status === "disabled") disabled++;
  }

  return {
    total: REFERENCE_ITEMS.length,
    active,
    planned,
    disabled,
    groups,
  };
}
