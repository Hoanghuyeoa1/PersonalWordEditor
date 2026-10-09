import type {
  InsertGroup,
  InsertItemDescriptor,
  InsertItemType,
} from "../types/insertTypes.ts";

/**
 * Danh mục toàn bộ các phần tử chèn trong Personal Word Editor.
 * Đóng vai trò là Single Source of Truth cho Ribbon UI, phím tắt và command layer.
 */
export const INSERT_ITEMS_REGISTRY: InsertItemDescriptor[] = [
  // --- NHÓM 1: PAGES (Trang & Ngắt trang/phần - Hoàn thành trong Phase 2) ---
  {
    id: "pageBreak",
    name: "Ngắt trang",
    nameEn: "Page Break",
    group: "pages",
    status: "active",
    shortcut: "Ctrl+Enter",
    tooltip: "Chèn dấu ngắt trang tại vị trí con trỏ (Ctrl+Enter)",
    phase: "Phase 2.5 (Hoạt động)",
    description: "Ngắt nội dung sang trang giấy vật lý tiếp theo bằng node pageBreak semantic.",
  },
  {
    id: "sectionBreak",
    name: "Ngắt phần",
    nameEn: "Section Break",
    group: "pages",
    status: "active",
    tooltip: "Chèn dấu ngắt phần sang trang mới (Next Page)",
    phase: "Phase 2.7 (Hoạt động)",
    description: "Tạo phân đoạn mới với cấu hình khổ giấy, hướng trang và lề độc lập.",
  },

  // --- NHÓM 2: TABLES (Bảng biểu - Phase 3.3) ---
  {
    id: "table",
    name: "Bảng",
    nameEn: "Table",
    group: "tables",
    status: "active",
    tooltip: "Chèn bảng dữ liệu (Rows × Columns)",
    phase: "Phase 3.3 (Hoạt động)",
    description: "Chèn bảng dạng lưới ô hàng/cột với cấu trúc ProseMirror semantic.",
  },

  // --- NHÓM 3: ILLUSTRATIONS (Hình ảnh & Đồ họa - Dự kiến Phase 3.x) ---
  {
    id: "image",
    name: "Hình ảnh",
    nameEn: "Pictures",
    group: "illustrations",
    status: "active",
    tooltip: "Chèn hình ảnh từ tệp tin máy tính (PNG, JPG, WEBP, SVG)",
    phase: "Phase 3.5 (Hoạt động)",
    description: "Chèn hình ảnh với khả năng căn chỉnh, co giãn kích thước và lưu trữ nhúng an toàn.",
  },
  {
    id: "shape",
    name: "Hình vẽ",
    nameEn: "Shapes",
    group: "illustrations",
    status: "active",
    tooltip: "Chèn hình vẽ cơ bản (Hình chữ nhật, Bo tròn, Elip, Đường thẳng, Mũi tên)",
    phase: "Phase 3.8 (Hoạt động)",
    description: "Chèn các hình vector hình học cơ bản vào trang văn bản.",
  },

  // --- NHÓM 4: LINKS (Liên kết - Hoàn thành trong Phase 3.2) ---
  {
    id: "link",
    name: "Liên kết",
    nameEn: "Link",
    group: "links",
    status: "active",
    shortcut: "Ctrl+K",
    tooltip: "Chèn hoặc chỉnh sửa siêu liên kết (Ctrl+K)",
    phase: "Phase 3.2 (Hoạt động)",
    description: "Gán liên kết web hoặc bookmark vào đoạn văn bản đã chọn.",
  },

  // --- NHÓM 5: HEADER & FOOTER (Đầu trang & Chân trang - Hoàn thành trong Phase 2.8) ---
  {
    id: "header",
    name: "Đầu trang",
    nameEn: "Header",
    group: "headerFooter",
    status: "active",
    tooltip: "Chèn hoặc chỉnh sửa tiêu đề đầu trang (Header)",
    phase: "Phase 2.8 (Hoạt động)",
    description: "Mở trình chỉnh sửa trực quan đầu trang cho phân đoạn hiện tại.",
  },
  {
    id: "footer",
    name: "Chân trang",
    nameEn: "Footer",
    group: "headerFooter",
    status: "active",
    tooltip: "Chèn hoặc chỉnh sửa chân trang (Footer)",
    phase: "Phase 2.8 (Hoạt động)",
    description: "Mở trình chỉnh sửa trực quan chân trang cho phân đoạn hiện tại.",
  },
  {
    id: "pageNumber",
    name: "Số trang",
    nameEn: "Page Number",
    group: "headerFooter",
    status: "active",
    tooltip: "Chèn trường số trang động {PAGE} vào Header/Footer",
    phase: "Phase 2.8 (Hoạt động)",
    description: "Chèn mã số trang tự động được tính toán theo thời gian thực.",
  },

  // --- NHÓM 6: TEXT (Văn bản & Kẻ ngang - Dự kiến Phase 3.x) ---
  {
    id: "textbox",
    name: "Hộp văn bản",
    nameEn: "Text Box",
    group: "text",
    status: "active",
    tooltip: "Chèn hộp chứa văn bản độc lập (Text Box)",
    phase: "Phase 3.7 (Hoạt động)",
    description: "Tạo vùng văn bản có thể định dạng và tùy chỉnh kích thước.",
  },
  {
    id: "horizontalRule",
    name: "Đường kẻ ngang",
    nameEn: "Horizontal Line",
    group: "text",
    status: "active",
    tooltip: "Chèn đường kẻ phân cách ngang semantic",
    phase: "Phase 3.2 (Hoạt động)",
    description: "Chèn đường phân cách ngang trực quan giữa các đoạn văn.",
  },

  // --- NHÓM 7: SYMBOLS (Ký hiệu & Công thức - Phase 3.2) ---
  {
    id: "equation",
    name: "Phương trình",
    nameEn: "Equation",
    group: "symbols",
    status: "active",
    tooltip: "Chèn công thức toán học hoặc phương trình định dạng LaTeX",
    phase: "Phase 3.8 (Hoạt động)",
    description: "Soạn thảo và hiển thị công thức toán học định dạng LaTeX.",
  },
  {
    id: "symbol",
    name: "Ký hiệu",
    nameEn: "Symbol",
    group: "symbols",
    status: "active",
    tooltip: "Chèn ký hiệu đặc biệt Unicode (Symbol)",
    phase: "Phase 3.2 (Hoạt động)",
    description: "Bảng chọn ký tự đặc biệt, biểu tượng toán học và Hy Lạp.",
  },
];

/**
 * Lấy descriptor theo mã định danh
 */
export function getInsertItemDescriptor(id: InsertItemType): InsertItemDescriptor | undefined {
  return INSERT_ITEMS_REGISTRY.find((item) => item.id === id);
}

/**
 * Lấy danh sách các phần tử thuộc một nhóm
 */
export function getInsertItemsByGroup(group: InsertGroup): InsertItemDescriptor[] {
  return INSERT_ITEMS_REGISTRY.filter((item) => item.group === group);
}

/**
 * Lấy danh sách các phần tử đã sẵn sàng hoạt động
 */
export function getActiveInsertItems(): InsertItemDescriptor[] {
  return INSERT_ITEMS_REGISTRY.filter((item) => item.status === "active");
}

/**
 * Lấy danh sách các phần tử đang trong lộ trình phát triển (planned)
 */
export function getPlannedInsertItems(): InsertItemDescriptor[] {
  return INSERT_ITEMS_REGISTRY.filter((item) => item.status === "planned");
}

/**
 * Kiểm tra xem phần tử đã active hay chưa
 */
export function isInsertItemActive(id: InsertItemType): boolean {
  const item = getInsertItemDescriptor(id);
  return item?.status === "active";
}
