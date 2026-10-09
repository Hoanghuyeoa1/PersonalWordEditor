import type {
  PaperSizeName,
  PageOrientation,
  PageMargins,
  PaperDimensions,
  PageSettings,
  MarginPresetName,
} from "../types/pageTypes.ts";
import {
  PAPER_DIMENSIONS,
  MARGIN_PRESETS,
  DEFAULT_PAGE_SETTINGS,
  SUPPORTED_PAPER_SIZES,
} from "./pageConstants.ts";

/**
 * Tính toán kích thước thực tế của trang theo khổ giấy và hướng trang.
 * Khi ở chế độ Landscape (Ngang), chiều rộng và chiều cao sẽ đảo vị trí cho nhau.
 */
export function getPageDimensions(
  paperSize: PaperSizeName,
  orientation: PageOrientation
): PaperDimensions {
  const base = PAPER_DIMENSIONS[paperSize] || PAPER_DIMENSIONS.A4;
  if (orientation === "landscape") {
    return {
      width: Math.max(base.width, base.height),
      height: Math.min(base.width, base.height),
    };
  }
  return {
    width: Math.min(base.width, base.height),
    height: Math.max(base.width, base.height),
  };
}

/**
 * Kiểm tra xem một giá trị có phải là PaperSizeName hợp lệ hay không.
 */
export function isValidPaperSize(value: unknown): value is PaperSizeName {
  return typeof value === "string" && SUPPORTED_PAPER_SIZES.includes(value as PaperSizeName);
}

/**
 * Kiểm tra xem một giá trị có phải là PageOrientation hợp lệ hay không.
 */
export function isValidOrientation(value: unknown): value is PageOrientation {
  return value === "portrait" || value === "landscape";
}

/**
 * Kiểm tra xem cấu trúc lề trang có hợp lệ hay không (không âm, là số hữu hạn).
 */
export function isValidMargins(value: unknown): value is PageMargins {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  const keys: (keyof PageMargins)[] = ["top", "right", "bottom", "left"];
  for (const k of keys) {
    const val = m[k];
    if (typeof val !== "number" || isNaN(val) || !isFinite(val) || val < 0) {
      return false;
    }
  }
  return true;
}

/**
 * So sánh lề với các preset chuẩn để tự động xác định tên preset ("Normal" | "Narrow" | "Wide" | "Custom").
 */
export function detectMarginPreset(margins: PageMargins): MarginPresetName {
  const epsilon = 0.2; // Dung sai so sánh mm
  const isMatch = (target: PageMargins) =>
    Math.abs(margins.top - target.top) < epsilon &&
    Math.abs(margins.right - target.right) < epsilon &&
    Math.abs(margins.bottom - target.bottom) < epsilon &&
    Math.abs(margins.left - target.left) < epsilon;

  if (isMatch(MARGIN_PRESETS.Normal)) return "Normal";
  if (isMatch(MARGIN_PRESETS.Narrow)) return "Narrow";
  if (isMatch(MARGIN_PRESETS.Wide)) return "Wide";
  return "Custom";
}

/**
 * Kiểm tra tính hợp lệ và chuẩn hóa PageSettings.
 * Tự động phục hồi về giá trị mặc định nếu dữ liệu bị thiếu hoặc lỗi,
 * đảm bảo tương thích ngược 100% với các tệp tin cũ hoặc dữ liệu không đồng nhất mà không làm crash app.
 */
export function validateAndNormalizePageSettings(raw: unknown): PageSettings {
  if (!raw || typeof raw !== "object") {
    return {
      paperSize: DEFAULT_PAGE_SETTINGS.paperSize,
      orientation: DEFAULT_PAGE_SETTINGS.orientation,
      margins: { ...DEFAULT_PAGE_SETTINGS.margins },
      marginPreset: DEFAULT_PAGE_SETTINGS.marginPreset,
    };
  }

  const obj = raw as Record<string, unknown>;

  const paperSize: PaperSizeName = isValidPaperSize(obj.paperSize)
    ? obj.paperSize
    : DEFAULT_PAGE_SETTINGS.paperSize;

  const orientation: PageOrientation = isValidOrientation(obj.orientation)
    ? obj.orientation
    : DEFAULT_PAGE_SETTINGS.orientation;

  let margins: PageMargins;
  if (isValidMargins(obj.margins)) {
    margins = {
      top: Math.max(0, obj.margins.top),
      right: Math.max(0, obj.margins.right),
      bottom: Math.max(0, obj.margins.bottom),
      left: Math.max(0, obj.margins.left),
    };
  } else {
    margins = { ...DEFAULT_PAGE_SETTINGS.margins };
  }

  const marginPreset = detectMarginPreset(margins);

  return {
    paperSize,
    orientation,
    margins,
    marginPreset,
  };
}

/**
 * Chuyển đổi Milimet (mm) sang Điểm in typographic (pt).
 * 1 inch = 25.4 mm = 72 pt -> 1 mm = 72 / 25.4 pt.
 * Dùng cho các tác vụ export DOCX / OOXML / PDF trong tương lai.
 */
export function mmToPt(mm: number): number {
  return Number(((mm * 72) / 25.4).toFixed(4));
}

/**
 * Chuyển đổi Milimet (mm) sang Pixel (px) tại độ phân giải DPI chuẩn màn hình (mặc định 96 DPI).
 */
export function mmToPx(mm: number, dpi = 96): number {
  return Number(((mm * dpi) / 25.4).toFixed(4));
}

/**
 * Trả về chuỗi CSS chuẩn kèm đơn vị mm (ví dụ: "210mm").
 */
export function mmToCss(mm: number): string {
  return `${mm}mm`;
}

/**
 * Sinh bộ biến CSS (CSS Variables) đại diện cho kích thước và lề trang,
 * phục vụ việc render trực quan trên Canvas mà không can thiệp vào logic Tiptap.
 */
export function getPageCssVariables(settings: PageSettings): Record<string, string> {
  const dimensions = getPageDimensions(settings.paperSize, settings.orientation);
  return {
    "--page-width": mmToCss(dimensions.width),
    "--page-height": mmToCss(dimensions.height),
    "--page-margin-top": mmToCss(settings.margins.top),
    "--page-margin-right": mmToCss(settings.margins.right),
    "--page-margin-bottom": mmToCss(settings.margins.bottom),
    "--page-margin-left": mmToCss(settings.margins.left),
  };
}

/**
 * Chuyển đổi Milimet (mm) sang Centimet (cm).
 */
export function mmToCm(mm: number): number {
  return Number((mm / 10).toFixed(2));
}

/**
 * Chuyển đổi Centimet (cm) sang Milimet (mm).
 */
export function cmToMm(cm: number): number {
  return Number((cm * 10).toFixed(2));
}

export interface MarginValidationResult {
  isValid: boolean;
  error?: string;
  usableWidth?: number;
  usableHeight?: number;
}

/**
 * Kiểm tra tính hợp lệ toàn diện của Custom Margins đối với một khổ giấy cụ thể.
 * Ngăn chặn:
 * - NaN, Infinity, chuỗi rỗng
 * - Giá trị âm
 * - Lề tổng quá lớn khiến vùng nội dung bị triệt tiêu (< 25.4 mm)
 */
export function validateCustomMargins(
  margins: PageMargins,
  paperDimensions: PaperDimensions
): MarginValidationResult {
  const keys: (keyof PageMargins)[] = ["top", "bottom", "left", "right"];
  for (const k of keys) {
    const val = margins[k];
    if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
      return {
        isValid: false,
        error: `Giá trị lề ${k} không hợp lệ. Vui lòng nhập số hữu hạn.`,
      };
    }
    if (val < 0) {
      return {
        isValid: false,
        error: `Giá trị lề ${k} không được là số âm.`,
      };
    }
  }

  const usableWidth = paperDimensions.width - (margins.left + margins.right);
  const usableHeight = paperDimensions.height - (margins.top + margins.bottom);

  // Vùng nội dung tối thiểu phải đạt ít nhất 25.4 mm (1 inch)
  const MIN_USABLE_DIMENSION = 25.4;

  if (usableWidth < MIN_USABLE_DIMENSION) {
    const maxAllowedWidthCm = mmToCm(paperDimensions.width - MIN_USABLE_DIMENSION);
    return {
      isValid: false,
      error: `Tổng lề trái và phải (${mmToCm(margins.left + margins.right)} cm) quá lớn. Khổ giấy hiện tại chỉ cho phép tối đa ${maxAllowedWidthCm} cm.`,
      usableWidth,
      usableHeight,
    };
  }

  if (usableHeight < MIN_USABLE_DIMENSION) {
    const maxAllowedHeightCm = mmToCm(paperDimensions.height - MIN_USABLE_DIMENSION);
    return {
      isValid: false,
      error: `Tổng lề trên và dưới (${mmToCm(margins.top + margins.bottom)} cm) quá lớn. Khổ giấy hiện tại chỉ cho phép tối đa ${maxAllowedHeightCm} cm.`,
      usableWidth,
      usableHeight,
    };
  }

  return {
    isValid: true,
    usableWidth,
    usableHeight,
  };
}

