/**
 * ============================================================================
 * DRAWINGML / WORDPROCESSINGDRAWING — ANCHOR & POSITIONING FOUNDATION
 * ============================================================================
 * Shared semantic foundation cho các đối tượng Drawing (Image, TextBox, Shape)
 * Tuân thủ ISO/IEC 29500 WordprocessingDrawing (wp:inline và wp:anchor).
 */

import type { JSONContent } from "@tiptap/core";

export type DrawingPlacement = "inline" | "floating";

/**
 * Tham chiếu vị trí ngang tương đối (OOXML ST_RelFromH)
 */
export type HorizontalRelative =
  | "page"
  | "margin"
  | "column"
  | "character"
  | "leftMargin"
  | "rightMargin"
  | "insideMargin"
  | "outsideMargin";

/**
 * Tham chiếu vị trí dọc tương đối (OOXML ST_RelFromV)
 */
export type VerticalRelative =
  | "page"
  | "margin"
  | "paragraph"
  | "line"
  | "topMargin"
  | "bottomMargin"
  | "insideMargin"
  | "outsideMargin";

/**
 * Căn chỉnh vị trí tự động (OOXML ST_AlignH / ST_AlignV)
 */
export type HorizontalAlignment = "left" | "center" | "right" | "inside" | "outside";
export type VerticalAlignment = "top" | "center" | "bottom" | "inside" | "outside";

/**
 * Kiểu bao bọc văn bản (OOXML Text Wrapping Modes)
 */
export type WrapMode =
  | "none"         // Không bọc (In front of text hoặc Behind text)
  | "square"       // Bao quanh hình chữ nhật
  | "tight"        // Bao quanh sát đường biên
  | "through"      // Xuyên qua
  | "topAndBottom" // Trên và dưới (ngắt dòng văn bản)
  | "inline";      // Nội dòng

/**
 * Phía văn bản được phép bao quanh (OOXML ST_WrapText)
 */
export type WrapTextSide = "bothSides" | "left" | "right" | "largest";

/**
 * Điểm tọa độ đa giác contour bao bọc (wp:wrapPolygon: wp:start, wp:lineTo)
 * Sử dụng logical document pixels (96 DPI) tương đối so với bounding box của đối tượng
 */
export interface WrapPolygonPoint {
  x: number;
  y: number;
}

/**
 * Đa giác contour bao bọc cho wrapMode: "tight" hoặc "through"
 */
export interface WrapPolygon {
  points: WrapPolygonPoint[];
  edited?: boolean;
}

/**
 * Giới hạn an toàn khoảng cách đệm từ đối tượng đến văn bản (px)
 */
export const DRAWING_DISTANCE_LIMITS = {
  MIN_PX: 0,
  MAX_PX: 500, // 500px ~ 5.2 inches, chặn triệt để overflow/vô cực
  DEFAULT_PX: 0,
} as const;

/**
 * Kiểm tra và chuẩn hóa khoảng cách đệm (Distance from text)
 * Đảm bảo: finite, >= 0, clamped trong giới hạn an toàn hợp lý.
 */
export function validateDrawingDistance(value: unknown, defaultValue = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || isNaN(value)) {
    return defaultValue;
  }
  return Math.min(
    DRAWING_DISTANCE_LIMITS.MAX_PX,
    Math.max(DRAWING_DISTANCE_LIMITS.MIN_PX, Math.round(value))
  );
}

/**
 * Khoảng cách đệm từ đối tượng đến văn bản xung quanh (Logical pixels)
 */
export interface DrawingDistances {
  distT: number; // Trên
  distB: number; // Dưới
  distL: number; // Trái
  distR: number; // Phải
}

/**
 * Chuẩn hóa toàn bộ bộ 4 khoảng cách đệm
 */
export function validateDrawingDistances(
  distances: Partial<DrawingDistances> | Record<string, any> | null | undefined
): DrawingDistances {
  return {
    distT: validateDrawingDistance(distances?.distT, 0),
    distB: validateDrawingDistance(distances?.distB, 0),
    distL: validateDrawingDistance(distances?.distL, 0),
    distR: validateDrawingDistance(distances?.distR, 0),
  };
}

/**
 * Siêu dữ liệu vị trí ngữ nghĩa (Semantic Positioning Model)
 * Toàn bộ đơn vị kích thước và tọa độ sử dụng Logical Document Units (Pixels, 96 DPI: 1px = 9525 EMU).
 * Tuyệt đối không dùng tọa độ tạm thời của browser DOM window/viewport.
 */
export interface DrawingPosition {
  /** Phân loại đặt vị trí: "inline" hoặc "floating" */
  placement: DrawingPlacement;

  // --- Horizontal Positioning (wp:positionH) ---
  horizontalRelative?: HorizontalRelative;
  horizontalAlign?: HorizontalAlignment;
  offsetX?: number; // Logical px offset từ điểm tham chiếu

  // --- Vertical Positioning (wp:positionV) ---
  verticalRelative?: VerticalRelative;
  verticalAlign?: VerticalAlignment;
  offsetY?: number; // Logical px offset từ điểm tham chiếu

  // --- Extent (wp:extent) ---
  width: number;
  height: number;

  // --- Distance from text (wp:anchor distT, distB, distL, distR) ---
  distT: number;
  distB: number;
  distL: number;
  distR: number;

  // --- Text Wrapping & Layering ---
  wrapMode: WrapMode;
  wrapTextSide?: WrapTextSide;
  wrapPolygon?: WrapPolygonPoint[];
  behindDoc?: boolean;  // true: Behind text, false: In front of text (cho wrapMode: "none")
  allowOverlap?: boolean;
  relativeHeight?: number; // Thứ tự z-index tương đối trong OOXML

  // --- Non-visual Object Properties (wp:docPr) ---
  docPrId?: number;
  docPrName?: string;
  docPrDescription?: string;

  // --- Raw Anchor Hook (bảo toàn các thuộc tính chưa hỗ trợ nếu có) ---
  rawAnchorXml?: string;
}

/**
 * Nội dung (Payload) của một đối tượng Drawing
 */
export type DrawingPayload =
  | {
      kind: "image";
      src: string;
      alt: string;
      title: string;
      isMissingMedia?: boolean;
    }
  | {
      kind: "shape";
      shapeType: string;
      fillColor?: string;
      strokeColor?: string;
      strokeWidth?: number;
    }
  | {
      kind: "textBox";
      content: JSONContent[];
      backgroundColor?: string;
      borderColor?: string;
    }
  | {
      kind: "chart";
      graphicUri: string;
      title?: string;
    }
  | {
      kind: "smartart";
      graphicUri: string;
    }
  | {
      kind: "wordart";
      text: string;
    }
  | {
      kind: "unknown";
      graphicUri: string;
      rawXml?: string;
    };

/**
 * Kết quả phân tích đối tượng Drawing từ OOXML
 */
export interface ParsedDrawingObject {
  position: DrawingPosition;
  payload: DrawingPayload;
  rawXml?: string;
}

/**
 * HỢP ĐỒNG TÍCH HỢP VỚI PAGE ENGINE (PAGE ENGINE INTEGRATION CONTRACT)
 * Xác định giao tiếp giữa Drawing Position Model và Page Layout Engine
 * mà không vi phạm nguyên tắc một editor và không làm ô nhiễm DOM ProseMirror.
 */
export interface FloatingObjectLayoutContract {
  /**
   * Tính toán bounding box dự kiến trên trang (tọa độ layout logic px)
   */
  resolveLayoutPosition(
    position: DrawingPosition,
    pageContext: {
      pageWidthPx: number;
      pageHeightPx: number;
      marginsPx: { top: number; bottom: number; left: number; right: number };
      paragraphTopPx?: number;
      paragraphLeftPx?: number;
      paragraphWidthPx?: number;
    }
  ): { x: number; y: number; width: number; height: number };
}
