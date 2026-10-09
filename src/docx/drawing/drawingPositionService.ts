import type {
  DrawingPosition,
  FloatingObjectLayoutContract,
  HorizontalRelative,
  VerticalRelative,
  HorizontalAlignment,
  VerticalAlignment,
  WrapMode,
} from "./drawingTypes.ts";
import {
  DrawingWrapService,
  createWrappingObstacle,
  type ResolvedWrappingObstacle,
  type LineWrapResolution,
} from "./drawingWrapService.ts";

/**
 * Chuyển đổi EMU có dấu (có thể âm) sang logical document pixels (96 DPI)
 * 1 inch = 914,400 EMUs = 96 px -> 1 px = 9,525 EMUs
 */
export function emuToSignedPixels(emu: number): number {
  if (isNaN(emu)) return 0;
  return Math.round(emu / 9525);
}

/**
 * Chuyển đổi logical document pixels (có dấu) sang EMUs
 */
export function pixelsToSignedEmu(px: number): number {
  if (isNaN(px)) return 0;
  return Math.round(px * 9525);
}

/**
 * Chuẩn hóa tham chiếu ngang (Horizontal Relative)
 */
export function normalizeHorizontalRelative(raw: string | null | undefined): HorizontalRelative {
  const val = (raw || "").trim().toLowerCase();
  switch (val) {
    case "page":
      return "page";
    case "margin":
      return "margin";
    case "column":
      return "column";
    case "character":
      return "character";
    case "leftmargin":
      return "leftMargin";
    case "rightmargin":
      return "rightMargin";
    case "insidemargin":
      return "insideMargin";
    case "outsidemargin":
      return "outsideMargin";
    default:
      return "column"; // Mặc định chuẩn của OOXML khi không chỉ định
  }
}

/**
 * Chuẩn hóa tham chiếu dọc (Vertical Relative)
 */
export function normalizeVerticalRelative(raw: string | null | undefined): VerticalRelative {
  const val = (raw || "").trim().toLowerCase();
  switch (val) {
    case "page":
      return "page";
    case "margin":
      return "margin";
    case "paragraph":
      return "paragraph";
    case "line":
      return "line";
    case "topmargin":
      return "topMargin";
    case "bottommargin":
      return "bottomMargin";
    case "insidemargin":
      return "insideMargin";
    case "outsidemargin":
      return "outsideMargin";
    default:
      return "paragraph"; // Mặc định chuẩn của OOXML
  }
}

/**
 * Chuẩn hóa căn chỉnh vị trí ngang
 */
export function normalizeHorizontalAlignment(raw: string | null | undefined): HorizontalAlignment | undefined {
  const val = (raw || "").trim().toLowerCase();
  if (["left", "center", "right", "inside", "outside"].includes(val)) {
    return val as HorizontalAlignment;
  }
  return undefined;
}

/**
 * Chuẩn hóa căn chỉnh vị trí dọc
 */
export function normalizeVerticalAlignment(raw: string | null | undefined): VerticalAlignment | undefined {
  const val = (raw || "").trim().toLowerCase();
  if (["top", "center", "bottom", "inside", "outside"].includes(val)) {
    return val as VerticalAlignment;
  }
  return undefined;
}

/**
 * Chuẩn hóa kiểu bao quanh (Wrap Mode)
 */
export function normalizeWrapMode(raw: string | null | undefined): WrapMode {
  const val = (raw || "").trim().toLowerCase();
  switch (val) {
    case "square":
    case "wrapsquare":
      return "square";
    case "tight":
    case "wraptight":
      return "tight";
    case "through":
    case "wrapthrough":
      return "through";
    case "topandbottom":
    case "wraptopandbottom":
      return "topAndBottom";
    case "inline":
      return "inline";
    case "none":
    case "wrapnone":
    default:
      return "none";
  }
}

/**
 * Triển khai concrete service cho FloatingObjectLayoutContract
 * Tính toán vị trí hiển thị logic của đối tượng trên trang mà không can thiệp vào ProseMirror DOM.
 */
export class DrawingPositionService implements FloatingObjectLayoutContract {
  /**
   * Tính toán bounding box dự kiến trên trang layout
   */
  public resolveLayoutPosition(
    position: DrawingPosition,
    pageContext: {
      pageWidthPx: number;
      pageHeightPx: number;
      marginsPx: { top: number; bottom: number; left: number; right: number };
      paragraphTopPx?: number;
      paragraphLeftPx?: number;
      paragraphWidthPx?: number;
    }
  ): { x: number; y: number; width: number; height: number } {
    const { pageWidthPx, pageHeightPx, marginsPx, paragraphTopPx, paragraphLeftPx, paragraphWidthPx } = pageContext;
    const width = Math.max(10, position.width);
    const height = Math.max(10, position.height);

    if (position.placement === "inline") {
      return {
        x: paragraphLeftPx ?? marginsPx.left,
        y: paragraphTopPx ?? marginsPx.top,
        width,
        height,
      };
    }

    // --- Tính toán toạ độ X (Horizontal) ---
    let x = marginsPx.left;
    const contentWidth = Math.max(0, pageWidthPx - marginsPx.left - marginsPx.right);
    const colWidth = paragraphWidthPx ?? contentWidth;

    if (position.horizontalAlign) {
      switch (position.horizontalAlign) {
        case "left":
          if (position.horizontalRelative === "page") {
            x = 0;
          } else {
            x = position.horizontalRelative === "column" ? (paragraphLeftPx ?? marginsPx.left) : marginsPx.left;
          }
          break;
        case "center":
          if (position.horizontalRelative === "page") {
            x = Math.max(0, (pageWidthPx - width) / 2);
          } else if (position.horizontalRelative === "column") {
            x = (paragraphLeftPx ?? marginsPx.left) + Math.max(0, (colWidth - width) / 2);
          } else {
            x = marginsPx.left + Math.max(0, (contentWidth - width) / 2);
          }
          break;
        case "right":
          if (position.horizontalRelative === "page") {
            x = Math.max(0, pageWidthPx - width);
          } else if (position.horizontalRelative === "column") {
            x = (paragraphLeftPx ?? marginsPx.left) + Math.max(0, colWidth - width);
          } else {
            x = Math.max(marginsPx.left, pageWidthPx - marginsPx.right - width);
          }
          break;
        default:
          x = marginsPx.left;
      }
    } else {
      // Vị trí offset tuyệt đối
      const offsetX = position.offsetX ?? 0;
      switch (position.horizontalRelative) {
        case "page":
          x = offsetX;
          break;
        case "margin":
          x = marginsPx.left + offsetX;
          break;
        case "column":
        case "character":
          x = (paragraphLeftPx ?? marginsPx.left) + offsetX;
          break;
        case "leftMargin":
          x = offsetX;
          break;
        case "rightMargin":
          x = pageWidthPx - marginsPx.right + offsetX;
          break;
        default:
          x = marginsPx.left + offsetX;
      }
    }

    // --- Tính toán toạ độ Y (Vertical) ---
    let y = marginsPx.top;
    const contentHeight = Math.max(0, pageHeightPx - marginsPx.top - marginsPx.bottom);

    if (position.verticalAlign) {
      switch (position.verticalAlign) {
        case "top":
          if (position.verticalRelative === "page") {
            y = 0;
          } else if (position.verticalRelative === "paragraph") {
            y = paragraphTopPx ?? marginsPx.top;
          } else {
            y = marginsPx.top;
          }
          break;
        case "center":
          if (position.verticalRelative === "page") {
            y = Math.max(0, (pageHeightPx - height) / 2);
          } else {
            y = marginsPx.top + Math.max(0, (contentHeight - height) / 2);
          }
          break;
        case "bottom":
          if (position.verticalRelative === "page") {
            y = Math.max(0, pageHeightPx - height);
          } else {
            y = Math.max(marginsPx.top, pageHeightPx - marginsPx.bottom - height);
          }
          break;
        default:
          y = marginsPx.top;
      }
    } else {
      const offsetY = position.offsetY ?? 0;
      switch (position.verticalRelative) {
        case "page":
          y = offsetY;
          break;
        case "margin":
          y = marginsPx.top + offsetY;
          break;
        case "paragraph":
        case "line":
          y = (paragraphTopPx ?? marginsPx.top) + offsetY;
          break;
        case "topMargin":
          y = offsetY;
          break;
        case "bottomMargin":
          y = pageHeightPx - marginsPx.bottom + offsetY;
          break;
        default:
          y = (paragraphTopPx ?? marginsPx.top) + offsetY;
      }
    }

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  private readonly wrapService = new DrawingWrapService();

  /**
   * Truy cập instance DrawingWrapService dùng chung
   */
  public getWrapService(): DrawingWrapService {
    return this.wrapService;
  }

  /**
   * Tạo vật cản wrapping (ResolvedWrappingObstacle) từ DrawingPosition và pageContext
   */
  public createObstacle(
    position: DrawingPosition,
    pageContext: {
      pageWidthPx: number;
      pageHeightPx: number;
      marginsPx: { top: number; bottom: number; left: number; right: number };
      paragraphTopPx?: number;
      paragraphLeftPx?: number;
      paragraphWidthPx?: number;
    },
    shapeType?: string
  ): ResolvedWrappingObstacle {
    const layoutRect = this.resolveLayoutPosition(position, pageContext);
    return createWrappingObstacle(position, layoutRect, shapeType);
  }

  /**
   * Tính toán khoảng không khả dụng cho dòng văn bản quanh các vật cản
   */
  public resolveLineWrapping(
    lineTop: number,
    lineBottom: number,
    colLeft: number,
    colRight: number,
    obstacles: readonly ResolvedWrappingObstacle[]
  ): LineWrapResolution {
    return this.wrapService.resolveLineWrapping(
      lineTop,
      lineBottom,
      colLeft,
      colRight,
      obstacles
    );
  }
}
