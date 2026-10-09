/**
 * Các loại kích thước khổ giấy được hỗ trợ trong Phase 2.
 */
export type PaperSizeName = "A4" | "A3" | "Letter" | "Legal";

/**
 * Hướng trang: Dọc (Portrait) hoặc Ngang (Landscape).
 */
export type PageOrientation = "portrait" | "landscape";

/**
 * Tên các preset lề trang chuẩn.
 */
export type MarginPresetName = "Normal" | "Narrow" | "Wide" | "Custom";

/**
 * Thông số lề trang (Margins).
 * Đơn vị chuẩn nội bộ: Milimet (mm).
 * Tuyệt đối không lưu lẫn đơn vị px hay pt trong model này.
 */
export interface PageMargins {
  /** Lề trên (mm) */
  top: number;
  /** Lề phải (mm) */
  right: number;
  /** Lề dưới (mm) */
  bottom: number;
  /** Lề trái (mm) */
  left: number;
}

/**
 * Kích thước vật lý của khổ giấy theo chiều dọc chuẩn (mm).
 */
export interface PaperDimensions {
  /** Chiều rộng khổ giấy (mm) */
  width: number;
  /** Chiều cao khổ giấy (mm) */
  height: number;
}

/**
 * Mô hình thiết lập trang toàn diện (Page Settings Model).
 * Thuộc sở hữu của DocumentModel và được lưu trữ trong tệp *.mwd.
 */
export interface PageSettings {
  /** Khổ giấy */
  paperSize: PaperSizeName;
  /** Hướng trang */
  orientation: PageOrientation;
  /** Khoảng cách các lề (mm) */
  margins: PageMargins;
  /** Tên preset lề hiện tại nếu khớp với preset chuẩn */
  marginPreset?: MarginPresetName;
}
