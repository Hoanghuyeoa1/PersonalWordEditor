import type {
  PaperSizeName,
  PaperDimensions,
  PageMargins,
  PageSettings,
} from "../types/pageTypes.ts";

/**
 * Bảng kích thước tiêu chuẩn vật lý của các khổ giấy (khi ở hướng dọc Portrait).
 * Đơn vị: Milimet (mm).
 */
export const PAPER_DIMENSIONS: Record<PaperSizeName, PaperDimensions> = {
  /** A4: Chuẩn quốc tế ISO 216 phổ biến nhất (210 x 297 mm) */
  A4: { width: 210, height: 297 },
  /** A3: Khổ giấy gấp đôi A4 (297 x 420 mm) */
  A3: { width: 297, height: 420 },
  /** Letter: Khổ chuẩn Bắc Mỹ (8.5 x 11 inch = 215.9 x 279.4 mm) */
  Letter: { width: 215.9, height: 279.4 },
  /** Legal: Khổ tài liệu pháp lý Bắc Mỹ (8.5 x 14 inch = 215.9 x 355.6 mm) */
  Legal: { width: 215.9, height: 355.6 },
};

/**
 * Danh sách tên các khổ giấy được hỗ trợ để hiển thị trong UI.
 */
export const SUPPORTED_PAPER_SIZES: PaperSizeName[] = [
  "A4",
  "A3",
  "Letter",
  "Legal",
];

/**
 * Các preset lề trang tập trung chuẩn văn phòng.
 * Đơn vị: Milimet (mm).
 */
export const MARGIN_PRESETS: Record<"Normal" | "Narrow" | "Wide", PageMargins> = {
  /** Normal: Lề 1.0 inch (25.4 mm) cho cả 4 phía — Mặc định của word processor */
  Normal: {
    top: 25.4,
    right: 25.4,
    bottom: 25.4,
    left: 25.4,
  },
  /** Narrow: Lề hẹp 0.5 inch (12.7 mm) cho cả 4 phía — Tối đa hóa diện tích nội dung */
  Narrow: {
    top: 12.7,
    right: 12.7,
    bottom: 12.7,
    left: 12.7,
  },
  /** Wide: Lề rộng 1.0 inch (25.4 mm) trên/dưới và 2.0 inch (50.8 mm) hai bên */
  Wide: {
    top: 25.4,
    right: 50.8,
    bottom: 25.4,
    left: 50.8,
  },
};

/**
 * Thiết lập trang mặc định cho tài liệu mới trong Personal Word Editor:
 * - Khổ giấy: A4
 * - Hướng: Dọc (Portrait)
 * - Lề: Normal (25.4 mm)
 */
export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  paperSize: "A4",
  orientation: "portrait",
  margins: { ...MARGIN_PRESETS.Normal },
  marginPreset: "Normal",
};
