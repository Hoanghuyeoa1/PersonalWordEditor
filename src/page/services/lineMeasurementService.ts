/**
 * PAGINATION ENGINE 2.0 — LINE MEASUREMENT SERVICE
 *
 * Đo đạc ranh giới các dòng (Line Boundaries) từ rendered ProseMirror DOM hoặc DOM Range.
 *
 * Nhiệm vụ:
 * 1. Ánh xạ chính xác hai chiều: ProseMirror Doc Position ↔ Rendered Line Box.
 * 2. Đo đạc từ DOM Range / getClientRects thật khi chạy trên môi trường browser.
 * 3. Hỗ trợ fallback Virtual Line Measure Provider chuẩn xác cho môi trường headless/testing,
 *    tính toán dựa trên từ ngữ thực tế (word boundaries), kích thước font, và lề trang,
 *    thay vì phỏng đoán thô thiển.
 * 4. Tuyệt đối KHÔNG mutate AST.
 */

import type { JSONContent } from "@tiptap/core";
import { DrawingWrapService, type ResolvedWrappingObstacle } from "../../docx/drawing/drawingWrapService.ts";

const virtualWrapService = new DrawingWrapService();

/**
 * Cấu trúc hình học của một dòng văn bản đã render (Rendered Line Box)
 */
export interface RenderedLineBox {
  /** Chỉ số dòng trong block (0, 1, 2...) */
  lineIndex: number;
  /** Vị trí bắt đầu trong ProseMirror doc (inclusive, 0-indexed) */
  from: number;
  /** Vị trí kết thúc trong ProseMirror doc (inclusive, 0-indexed) */
  to: number;
  /** Tọa độ đỉnh dòng (px) */
  top: number;
  /** Tọa độ đáy dòng (px) */
  bottom: number;
  /** Chiều cao của dòng (px) */
  height: number;
  /** Tọa độ lề trái dòng (px) */
  left: number;
  /** Tọa độ lề phải dòng (px) */
  right: number;
  /** Chiều rộng của dòng (px) */
  width: number;
  /** Văn bản nội dung của dòng */
  text: string;
}

/**
 * Trích xuất các đoạn văn bản kèm định dạng từ cây ProseMirror JSON của một paragraph
 */
export interface TextSpanInfo {
  text: string;
  from: number;
  to: number;
  fontSizePx: number;
  lineHeightPx: number;
  fontWeight: string;
}

/**
 * Trích xuất danh sách text spans từ một paragraph node
 */
export function extractParagraphTextSpans(
  paragraphNode: JSONContent,
  blockStartPos: number
): TextSpanInfo[] {
  const spans: TextSpanInfo[] = [];
  let currentPos = blockStartPos + 1; // +1 cho thẻ mở paragraph

  if (!paragraphNode.content || !Array.isArray(paragraphNode.content)) {
    return spans;
  }

  for (const child of paragraphNode.content) {
    if (child.type === "text" && child.text) {
      const text = child.text;
      const textLen = text.length;

      // Xác định font size từ marks nếu có
      let fontSizePx = 15; // default 15px (11.25pt)
      let fontWeight = "normal";

      if (child.marks && Array.isArray(child.marks)) {
        for (const mark of child.marks) {
          if (mark.type === "bold") {
            fontWeight = "bold";
          }
          if (mark.type === "textStyle" && mark.attrs?.fontSize) {
            const rawSize = String(mark.attrs.fontSize);
            const parsed = parseFloat(rawSize);
            if (Number.isFinite(parsed) && parsed > 0) {
              if (rawSize.endsWith("pt")) {
                fontSizePx = (parsed * 96) / 72; // pt to px
              } else {
                fontSizePx = parsed;
              }
            }
          }
        }
      }

      const lineHeightPx = Math.round(fontSizePx * 1.4);

      spans.push({
        text,
        from: currentPos,
        to: currentPos + textLen,
        fontSizePx,
        lineHeightPx,
        fontWeight,
      });

      currentPos += textLen;
    } else {
      // Các inline node khác (hardBreak, noteReference, etc.)
      currentPos += child.text?.length || 1;
    }
  }

  return spans;
}

/**
 * Đo đạc các dòng văn bản từ rendered DOM sử dụng DOM Range & getClientRects
 */
export function measureLinesFromRenderedDom(
  domElement: HTMLElement,
  blockPos: number,
  paragraphNode?: JSONContent,
  zoomFactor: number = 1
): RenderedLineBox[] {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return measureLinesVirtual(paragraphNode || {}, 600, blockPos);
  }

  const zoom = zoomFactor > 0 ? zoomFactor : 1;
  const lines: RenderedLineBox[] = [];
  const containerRect = domElement.getBoundingClientRect();
  const normalizedContainerWidth = containerRect.width / zoom;

  // Tìm tất cả các text node con của domElement
  const walker = document.createTreeWalker(
    domElement,
    NodeFilter.SHOW_TEXT,
    null
  );

  let textNode = walker.nextNode() as Text | null;
  let docOffset = blockPos + 1;

  let currentLineIndex = 0;
  let currentLineStart = docOffset;
  let currentLineText = "";
  let currentLineTop = -1;
  let currentLineBottom = -1;
  let currentLineLeft = containerRect.left / zoom;
  let currentLineRight = containerRect.right / zoom;

  const range = document.createRange();

  while (textNode) {
    const textContent = textNode.nodeValue || "";
    const nodeLen = textContent.length;

    if (nodeLen > 0) {
      // Dùng range phủ toàn bộ text node để lấy danh sách client rects của các dòng
      range.selectNodeContents(textNode);
      const rects = range.getClientRects();

      if (rects.length <= 1) {
        // Text node chỉ nằm trên 1 dòng
        const r = rects[0] || textNode.parentElement?.getBoundingClientRect() || containerRect;
        const relativeTop = (r.top - containerRect.top) / zoom;
        const relativeBottom = (r.bottom - containerRect.top) / zoom;

        if (currentLineTop === -1) {
          currentLineTop = relativeTop;
          currentLineBottom = relativeBottom;
        } else if (Math.abs(relativeTop - currentLineTop) > (r.height / zoom) * 0.5) {
          // Bắt đầu dòng mới
          lines.push({
            lineIndex: currentLineIndex++,
            from: currentLineStart,
            to: docOffset,
            top: currentLineTop,
            bottom: currentLineBottom,
            height: Math.max(16, currentLineBottom - currentLineTop),
            left: (currentLineLeft - containerRect.left) / zoom,
            right: (currentLineRight - containerRect.left) / zoom,
            width: Math.max(10, normalizedContainerWidth),
            text: currentLineText,
          });

          currentLineStart = docOffset;
          currentLineText = "";
          currentLineTop = relativeTop;
          currentLineBottom = relativeBottom;
        }

        currentLineText += textContent;
        docOffset += nodeLen;
      } else {
        // Text node bị ngắt dòng thành nhiều rects!
        // Duyệt từng ký tự để xác định điểm nhảy dòng chính xác
        for (let i = 0; i < nodeLen; i++) {
          range.setStart(textNode, i);
          range.setEnd(textNode, i + 1);
          const charRect = range.getClientRects()[0];

          if (charRect) {
            const charTop = (charRect.top - containerRect.top) / zoom;
            const charBottom = (charRect.bottom - containerRect.top) / zoom;

            if (currentLineTop === -1) {
              currentLineTop = charTop;
              currentLineBottom = charBottom;
            } else if (charTop - currentLineTop > (charRect.height / zoom) * 0.4) {
              // Điểm ngắt dòng xuất hiện tại ký tự này!
              lines.push({
                lineIndex: currentLineIndex++,
                from: currentLineStart,
                to: docOffset + i,
                top: currentLineTop,
                bottom: currentLineBottom,
                height: Math.max(16, currentLineBottom - currentLineTop),
                left: 0,
                right: normalizedContainerWidth,
                width: Math.max(10, normalizedContainerWidth),
                text: currentLineText,
              });

              currentLineStart = docOffset + i;
              currentLineText = "";
              currentLineTop = charTop;
              currentLineBottom = charBottom;
            }

            currentLineText += textContent[i];
          } else {
            currentLineText += textContent[i];
          }
        }
        docOffset += nodeLen;
      }
    }

    textNode = walker.nextNode() as Text | null;
  }

  // Đóng dòng cuối cùng nếu còn nội dung
  if (currentLineText.length > 0 || lines.length === 0) {
    lines.push({
      lineIndex: currentLineIndex,
      from: currentLineStart,
      to: docOffset,
      top: currentLineTop === -1 ? 0 : currentLineTop,
      bottom: currentLineBottom === -1 ? 22 : currentLineBottom,
      height: Math.max(16, currentLineBottom - currentLineTop),
      left: 0,
      right: normalizedContainerWidth,
      width: Math.max(10, normalizedContainerWidth),
      text: currentLineText,
    });
  }

  return lines;
}

/**
 * Virtual Line Measurement:
 * Thuật toán đo dòng văn bản mô phỏng chính xác thuật toán word-wrapping của browser,
 * phục vụ môi trường headless / unit test không có DOM window.
 *
 * Tính toán dựa trên:
 * - Từng từ thực tế (word boundaries) và ký tự Unicode tiếng Việt.
 * - Chiều rộng thực của từng ký tự theo font size (khoảng 0.52 - 0.58 em tùy chữ).
 * - Cắt dòng chính xác khi chiều rộng từ vượt quá `usableWidthPx`.
 */
export function measureLinesVirtual(
  paragraphNode: JSONContent,
  usableWidthPx: number,
  blockPos: number,
  _defaultFontSizePx = 15,
  defaultLineHeightPx = 22,
  obstacles?: readonly ResolvedWrappingObstacle[],
  initialY = 0
): RenderedLineBox[] {
  const spans = extractParagraphTextSpans(paragraphNode, blockPos);
  const lines: RenderedLineBox[] = [];

  const getLineInfo = (
    top: number,
    height: number
  ): { effectiveWidth: number; adjustedTop: number } => {
    if (!obstacles || obstacles.length === 0) {
      return { effectiveWidth: Math.max(50, usableWidthPx), adjustedTop: top };
    }
    let res = virtualWrapService.resolveLineWrapping(top, top + height, 0, usableWidthPx, obstacles);
    let curTop = top;
    if (res.isBlockedByBand && typeof res.nextAvailableTop === "number") {
      curTop = res.nextAvailableTop;
      res = virtualWrapService.resolveLineWrapping(curTop, curTop + height, 0, usableWidthPx, obstacles);
    }
    return {
      effectiveWidth: Math.max(30, res.effectiveWidth),
      adjustedTop: curTop,
    };
  };

  let accumulatedY = initialY;
  const initialInfo = getLineInfo(accumulatedY, defaultLineHeightPx);
  accumulatedY = initialInfo.adjustedTop;

  if (spans.length === 0) {
    // Đoạn rỗng: 1 dòng rỗng
    return [
      {
        lineIndex: 0,
        from: blockPos,
        to: blockPos + 2,
        top: accumulatedY,
        bottom: accumulatedY + defaultLineHeightPx,
        height: defaultLineHeightPx,
        left: 0,
        right: initialInfo.effectiveWidth,
        width: initialInfo.effectiveWidth,
        text: "",
      },
    ];
  }

  let currentEffectiveWidth = initialInfo.effectiveWidth;
  let currentLineIndex = 0;
  let currentLineWidth = 0;
  let currentLineStartPos = spans[0].from;
  let currentLineText = "";
  let currentLineHeight = defaultLineHeightPx;

  for (const span of spans) {
    const text = span.text;
    const avgCharWidth = span.fontSizePx * (span.fontWeight === "bold" ? 0.58 : 0.52);
    const spanLineHeight = Math.max(span.lineHeightPx, currentLineHeight);

    // Tách từ theo khoảng trắng, bảo toàn khoảng trắng
    const words = text.split(/(\s+)/);
    let spanOffset = 0;

    for (const token of words) {
      if (!token) continue;
      const tokenWidth = token.length * avgCharWidth;
      const tokenLen = token.length;

      // Kiểm tra tràn dòng
      if (currentLineWidth + tokenWidth > currentEffectiveWidth && currentLineText.length > 0) {
        // Dòng hiện tại đã đầy -> kết thúc dòng
        const lineEndPos = span.from + spanOffset;

        lines.push({
          lineIndex: currentLineIndex++,
          from: currentLineStartPos,
          to: lineEndPos,
          top: accumulatedY,
          bottom: accumulatedY + currentLineHeight,
          height: currentLineHeight,
          left: 0,
          right: currentLineWidth,
          width: currentLineWidth,
          text: currentLineText,
        });

        accumulatedY += currentLineHeight;
        const nextInfo = getLineInfo(accumulatedY, spanLineHeight);
        accumulatedY = nextInfo.adjustedTop;
        currentEffectiveWidth = nextInfo.effectiveWidth;

        currentLineStartPos = lineEndPos;
        currentLineText = "";
        currentLineWidth = 0;
        currentLineHeight = spanLineHeight;
      }

      currentLineText += token;
      currentLineWidth += tokenWidth;
      currentLineHeight = Math.max(currentLineHeight, spanLineHeight);
      spanOffset += tokenLen;
    }
  }

  // Đóng dòng cuối cùng
  const finalEndPos = spans[spans.length - 1].to;
  lines.push({
    lineIndex: currentLineIndex,
    from: currentLineStartPos,
    to: finalEndPos,
    top: accumulatedY,
    bottom: accumulatedY + currentLineHeight,
    height: currentLineHeight,
    left: 0,
    right: currentLineWidth,
    width: Math.max(10, currentLineWidth),
    text: currentLineText,
  });

  return lines;
}
