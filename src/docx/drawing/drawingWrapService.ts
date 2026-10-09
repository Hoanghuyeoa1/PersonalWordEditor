/**
 * ============================================================================
 * DRAWINGML / WORDPROCESSINGDRAWING — TEXT WRAPPING SERVICE
 * ============================================================================
 * Cung cấp giải thuật tính toán bao bọc văn bản ngữ nghĩa (Semantic Text Wrapping)
 * cho toàn bộ các đối tượng Drawing (Image, Shape, TextBox) tuân thủ ISO/IEC 29500.
 *
 * Hỗ trợ 4 chế độ ngữ nghĩa:
 * 1. Inline: Nằm trong luồng văn bản bình thường.
 * 2. Square: Văn bản bao quanh bounding rectangle + dist margins.
 * 3. Top & Bottom: Đối tượng chiếm trọn dải ngang (horizontal band), văn bản chỉ ở trên/dưới.
 * 4. Tight: Văn bản bao quanh contour/polygon sát đường biên. Nếu không có contour, fallback Square.
 *
 * Đảm bảo:
 * - Thuần túy tính toán hình học, không DOM mutation hack.
 * - Validation khoảng cách đệm (distT, distB, distL, distR) hữu hạn và không âm.
 * - Tái sử dụng đồng nhất cho Image, Shape và TextBox.
 */

import type {
  DrawingPosition,
  WrapMode,
  WrapTextSide,
  WrapPolygonPoint,
} from "./drawingTypes.ts";
import { validateDrawingDistances } from "./drawingTypes.ts";

/**
 * Hình chữ nhật bao quanh đã được phân giải tọa độ trên trang
 */
export interface ResolvedObstacleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  // Padded bounds bao gồm distT, distB, distL, distR
  paddedTop: number;
  paddedBottom: number;
  paddedLeft: number;
  paddedRight: number;
  paddedWidth: number;
  paddedHeight: number;
}

/**
 * Vật cản hoàn chỉnh tham gia tính toán Text Wrapping
 */
export interface ResolvedWrappingObstacle {
  id?: string | number;
  position: DrawingPosition;
  bounds: ResolvedObstacleBounds;
  contour?: WrapPolygonPoint[]; // Tọa độ contour tuyệt đối trên trang (nếu có)
}

/**
 * Kết quả tính toán khoảng không khả dụng cho một dòng văn bản
 */
export interface LineWrapInterval {
  left: number;
  right: number;
  width: number;
}

export interface LineWrapResolution {
  /** Toàn bộ dải ngang bị chặn (Top & Bottom mode) */
  isBlockedByBand: boolean;
  /** Tọa độ Y sớm nhất phía dưới dải ngang để văn bản tiếp tục nếu bị chặn */
  nextAvailableTop?: number;
  /** Các khoảng ngang khả dụng cho dòng văn bản */
  intervals: LineWrapInterval[];
  /** Chiều rộng khả dụng hiệu lực (px) cho dòng văn bản */
  effectiveWidth: number;
  /** Chế độ wrapping được áp dụng thực tế (có thể fallback từ tight sang square) */
  resolvedMode: WrapMode;
}

/**
 * Sinh đa giác contour đơn giản hóa (simplified contour) cho các hình vẽ chuẩn
 * Tọa độ sinh ra tương đối so với bounding box (0,0 -> width, height)
 */
export function generateSimplifiedShapeContour(
  shapeType: string,
  width: number,
  height: number
): WrapPolygonPoint[] {
  const w = Math.max(10, width);
  const h = Math.max(10, height);
  const type = shapeType.toLowerCase();

  switch (type) {
    case "ellipse":
    case "circle": {
      // Đa giác 12 đỉnh xấp xỉ hình bầu dục
      const points: WrapPolygonPoint[] = [];
      const cx = w / 2;
      const cy = h / 2;
      const rx = w / 2;
      const ry = h / 2;
      const numPoints = 12;
      for (let i = 0; i < numPoints; i++) {
        const angle = (i * 2 * Math.PI) / numPoints;
        points.push({
          x: Math.round(cx + rx * Math.cos(angle)),
          y: Math.round(cy + ry * Math.sin(angle)),
        });
      }
      return points;
    }

    case "diamond":
    case "rhombus":
      return [
        { x: Math.round(w / 2), y: 0 },
        { x: w, y: Math.round(h / 2) },
        { x: Math.round(w / 2), y: h },
        { x: 0, y: Math.round(h / 2) },
      ];

    case "triangle":
      return [
        { x: Math.round(w / 2), y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];

    case "arrow":
    case "rightarrow": {
      const shaftTop = Math.round(h * 0.25);
      const shaftBottom = Math.round(h * 0.75);
      const headLeft = Math.round(w * 0.6);
      return [
        { x: 0, y: shaftTop },
        { x: headLeft, y: shaftTop },
        { x: headLeft, y: 0 },
        { x: w, y: Math.round(h / 2) },
        { x: headLeft, y: h },
        { x: headLeft, y: shaftBottom },
        { x: 0, y: shaftBottom },
      ];
    }

    case "roundedrectangle":
    case "roundrect": {
      const r = Math.min(w * 0.15, h * 0.15, 20);
      return [
        { x: r, y: 0 },
        { x: w - r, y: 0 },
        { x: w, y: r },
        { x: w, y: h - r },
        { x: w - r, y: h },
        { x: r, y: h },
        { x: 0, y: h - r },
        { x: 0, y: r },
      ];
    }

    case "rectangle":
    default:
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
  }
}

/**
 * Tìm giao điểm ngang [minX, maxX] của một đa giác khép kín tại độ cao Y
 */
export function getPolygonXSpanAtY(
  polygon: WrapPolygonPoint[],
  y: number
): { minX: number; maxX: number } | null {
  if (!polygon || polygon.length < 3) return null;

  const intersections: number[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Bỏ qua đoạn song song nằm ngang hoàn toàn
    if (p1.y === p2.y) {
      if (Math.abs(y - p1.y) < 0.01) {
        intersections.push(p1.x, p2.x);
      }
      continue;
    }

    // Kiểm tra xem y có nằm trong khoảng dọc giữa p1 và p2 không
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    if (y >= minY && y <= maxY) {
      // Nội suy tuyến tính tìm tọa độ x của giao điểm
      const t = (y - p1.y) / (p2.y - p1.y);
      const x = p1.x + t * (p2.x - p1.x);
      intersections.push(x);
    }
  }

  if (intersections.length === 0) return null;

  return {
    minX: Math.min(...intersections),
    maxX: Math.max(...intersections),
  };
}

/**
 * Dịch chuyển tọa độ đa giác contour sang tọa độ tuyệt đối trên trang
 */
export function resolveAbsoluteContour(
  relativePoints: WrapPolygonPoint[],
  originX: number,
  originY: number
): WrapPolygonPoint[] {
  return relativePoints.map((pt) => ({
    x: originX + pt.x,
    y: originY + pt.y,
  }));
}

/**
 * Tính toán hình học vật cản (ResolvedWrappingObstacle) từ DrawingPosition và vị trí trang
 */
export function createWrappingObstacle(
  position: DrawingPosition,
  layoutRect: { x: number; y: number; width: number; height: number },
  shapeType?: string
): ResolvedWrappingObstacle {
  const distances = validateDrawingDistances(position);
  const w = Math.max(10, layoutRect.width);
  const h = Math.max(10, layoutRect.height);
  const x = layoutRect.x;
  const y = layoutRect.y;

  const bounds: ResolvedObstacleBounds = {
    x,
    y,
    width: w,
    height: h,
    paddedTop: y - distances.distT,
    paddedBottom: y + h + distances.distB,
    paddedLeft: x - distances.distL,
    paddedRight: x + w + distances.distR,
    paddedWidth: w + distances.distL + distances.distR,
    paddedHeight: h + distances.distT + distances.distB,
  };

  // Xác định contour đa giác cho tight mode
  let relativeContour: WrapPolygonPoint[] | undefined;
  if (position.wrapPolygon && position.wrapPolygon.length >= 3) {
    relativeContour = position.wrapPolygon;
  } else if (shapeType) {
    relativeContour = generateSimplifiedShapeContour(shapeType, w, h);
  }

  const contour = relativeContour ? resolveAbsoluteContour(relativeContour, x, y) : undefined;

  return {
    id: position.docPrId,
    position,
    bounds,
    contour,
  };
}

/**
 * Service tính toán Text Wrapping trung tâm
 */
export class DrawingWrapService {
  /**
   * Tính toán khoảng không gian dòng văn bản (Line Wrapping) quanh các vật cản
   * @param lineTop Tọa độ đỉnh dòng (px)
   * @param lineBottom Tọa độ đáy dòng (px)
   * @param colLeft Lề trái cột nội dung (px)
   * @param colRight Lề phải cột nội dung (px)
   * @param obstacles Danh sách các đối tượng floating trên trang
   */
  public resolveLineWrapping(
    lineTop: number,
    lineBottom: number,
    colLeft: number,
    colRight: number,
    obstacles: readonly ResolvedWrappingObstacle[]
  ): LineWrapResolution {
    const colWidth = Math.max(0, colRight - colLeft);
    const defaultResolution: LineWrapResolution = {
      isBlockedByBand: false,
      intervals: [{ left: colLeft, right: colRight, width: colWidth }],
      effectiveWidth: colWidth,
      resolvedMode: "none",
    };

    if (!obstacles || obstacles.length === 0) {
      return defaultResolution;
    }

    // 1. Kiểm tra ưu tiên: TOP & BOTTOM WRAPPING
    // Nếu có bất kỳ đối tượng topAndBottom nào che phủ dải dọc của dòng -> BLOCK toàn bộ dải ngang
    for (const obs of obstacles) {
      if (obs.position.wrapMode === "topAndBottom") {
        if (lineBottom > obs.bounds.paddedTop && lineTop < obs.bounds.paddedBottom) {
          return {
            isBlockedByBand: true,
            nextAvailableTop: obs.bounds.paddedBottom,
            intervals: [],
            effectiveWidth: 0,
            resolvedMode: "topAndBottom",
          };
        }
      }
    }

    // 2. Tính toán SQUARE & TIGHT WRAPPING
    let currentIntervals: LineWrapInterval[] = [
      { left: colLeft, right: colRight, width: colWidth },
    ];
    let appliedMode: WrapMode = "none";

    for (const obs of obstacles) {
      const mode = obs.position.wrapMode;
      if (mode === "none" || mode === "inline" || mode === "topAndBottom") {
        continue;
      }

      // Kiểm tra xem dòng có nằm trong phạm vi dọc của vật cản không
      if (lineBottom <= obs.bounds.paddedTop || lineTop >= obs.bounds.paddedBottom) {
        continue; // Dòng nằm hoàn toàn phía trên hoặc phía dưới vật cản
      }

      const distances = validateDrawingDistances(obs.position);
      const wrapSide: WrapTextSide = obs.position.wrapTextSide || "bothSides";

      // Xác định ranh giới ngang của vật cản tại độ cao dòng này [obsLeft, obsRight]
      let obsLeft = obs.bounds.paddedLeft;
      let obsRight = obs.bounds.paddedRight;

      if (mode === "tight") {
        // TIGHT MODE: Kiểm tra xem có contour không
        if (obs.contour && obs.contour.length >= 3) {
          const midY = (lineTop + lineBottom) / 2;
          const span = getPolygonXSpanAtY(obs.contour, midY);
          if (span) {
            // Bao quanh sát contour + khoảng cách đệm distL và distR
            obsLeft = span.minX - distances.distL;
            obsRight = span.maxX + distances.distR;
            appliedMode = "tight";
          } else {
            // Không cắt polygon ở Y này -> fallback sang square bounds của slice
            appliedMode = "tight";
          }
        } else {
          // SECTION 4: "Nếu không có contour: fallback Square"
          appliedMode = "square";
        }
      } else {
        appliedMode = "square";
      }

      // Cắt bỏ phần giao nhau giữa các intervals hiện tại và [obsLeft, obsRight]
      const nextIntervals: LineWrapInterval[] = [];

      for (const interval of currentIntervals) {
        // Trường hợp không giao nhau
        if (obsRight <= interval.left || obsLeft >= interval.right) {
          nextIntervals.push(interval);
          continue;
        }

        // Có giao nhau: tách thành phần bên trái và/hoặc bên phải vật cản
        const leftSpace = obsLeft - interval.left;
        const rightSpace = interval.right - obsRight;

        const canUseLeft = leftSpace > 20 && wrapSide !== "right";
        const canUseRight = rightSpace > 20 && wrapSide !== "left";

        if (wrapSide === "largest") {
          if (leftSpace >= rightSpace && leftSpace > 20) {
            nextIntervals.push({ left: interval.left, right: obsLeft, width: leftSpace });
          } else if (rightSpace > 20) {
            nextIntervals.push({ left: obsRight, right: interval.right, width: rightSpace });
          }
        } else {
          if (canUseLeft) {
            nextIntervals.push({ left: interval.left, right: obsLeft, width: leftSpace });
          }
          if (canUseRight) {
            nextIntervals.push({ left: obsRight, right: interval.right, width: rightSpace });
          }
        }
      }

      currentIntervals = nextIntervals;
    }

    // Chọn khoảng khả dụng lớn nhất làm effectiveWidth (phù hợp với text line rendering)
    const maxInterval = currentIntervals.reduce(
      (max, cur) => (cur.width > max.width ? cur : max),
      { left: colLeft, right: colLeft, width: 0 }
    );

    return {
      isBlockedByBand: false,
      intervals: currentIntervals,
      effectiveWidth: maxInterval.width,
      resolvedMode: appliedMode,
    };
  }

  /**
   * Tính toán chiều cao tăng thêm của một đoạn văn bản do ảnh hưởng của wrapping
   * Khi usable width bị giảm bởi floating obstacle, số dòng tăng lên -> đoạn dài ra.
   */
  public estimateWrappedParagraphHeight(
    textLength: number,
    baseLineHeightPx: number,
    fullColWidth: number,
    reducedEffectiveWidth: number
  ): { originalLines: number; wrappedLines: number; heightIncreasePx: number } {
    const charsPerLineFull = Math.max(10, Math.floor(fullColWidth / 8.5));
    const charsPerLineReduced = Math.max(10, Math.floor(reducedEffectiveWidth / 8.5));

    const originalLines = Math.max(1, Math.ceil(textLength / charsPerLineFull));
    const wrappedLines = Math.max(1, Math.ceil(textLength / charsPerLineReduced));

    const heightIncreasePx = Math.max(0, (wrappedLines - originalLines) * baseLineHeightPx);

    return {
      originalLines,
      wrappedLines,
      heightIncreasePx,
    };
  }
}

/**
 * Tạo CSS class và style cho các phần tử Drawing floating trong ProseMirror editor
 */
export function buildDrawingWrapStyle(
  position: DrawingPosition | null | undefined,
  defaultAlignment: "left" | "center" | "right" = "center"
): { className: string; style: string } {
  if (!position || position.placement !== "floating") {
    return {
      className: "",
      style: `text-align: ${defaultAlignment}; margin: 1rem 0;`,
    };
  }

  const wrapMode = position.wrapMode || "square";
  const distT = position.distT ?? 0;
  const distB = position.distB ?? 0;
  const distL = position.distL ?? 0;
  const distR = position.distR ?? 0;
  const align = position.horizontalAlign || defaultAlignment;
  const floatSide = align === "left" ? "left" : "right";

  const className = `drawing-floating wrap-${wrapMode}`;

  if (wrapMode === "square" || wrapMode === "tight") {
    let style = `float: ${floatSide}; margin: ${distT}px ${distR}px ${distB}px ${distL}px; clear: none; max-width: 100%;`;
    if (wrapMode === "tight" && position.wrapPolygon && position.wrapPolygon.length >= 3) {
      const polyCss = position.wrapPolygon.map((p) => `${p.x}px ${p.y}px`).join(", ");
      style += ` shape-outside: polygon(${polyCss}); shape-margin: ${distL}px;`;
    }
    return { className, style };
  }

  if (wrapMode === "topAndBottom") {
    return {
      className,
      style: `display: block; clear: both; margin: ${distT}px auto ${distB}px auto; text-align: ${align};`,
    };
  }

  if (wrapMode === "none") {
    if (position.behindDoc) {
      return {
        className,
        style: `position: relative; z-index: 0; opacity: 0.85; margin: ${distT}px 0 ${distB}px 0;`,
      };
    }
    return {
      className,
      style: `position: relative; z-index: 5; margin: ${distT}px 0 ${distB}px 0;`,
    };
  }

  return {
    className,
    style: `text-align: ${align}; margin: 1rem 0;`,
  };
}

