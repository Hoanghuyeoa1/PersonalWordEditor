import type { JSONContent } from "@tiptap/core";
import type { PaginationConfig, PaginationState, PageLayoutInfo } from "../types/paginationTypes.ts";
import { getPageDimensions, mmToPx } from "./pageSettingsService.ts";
import { extractSections, getBlocksForSection } from "./sectionService.ts";

/**
 * Khoảng cách vật lý giữa hai trang giấy trong không gian làm việc (pixel)
 */
export const PAGE_GAP_PX = 24;

/**
 * Tính toán các thông số kích thước pixel cho hệ thống phân trang
 */
export function calculatePaginationDimensions(config: PaginationConfig) {
  const { width: widthMm, height: heightMm } = getPageDimensions(
    config.paperSize,
    config.orientation
  );

  const pageWidthPx = mmToPx(widthMm);
  const pageHeightPx = mmToPx(heightMm);
  const pageGapPx = config.pageGapPx ?? PAGE_GAP_PX;

  const marginsPx = {
    top: mmToPx(config.margins.top),
    bottom: mmToPx(config.margins.bottom),
    left: mmToPx(config.margins.left),
    right: mmToPx(config.margins.right),
  };

  const usableWidthPx = Math.max(10, pageWidthPx - (marginsPx.left + marginsPx.right));
  const usableHeightPx = Math.max(10, pageHeightPx - (marginsPx.top + marginsPx.bottom));

  return {
    widthMm,
    heightMm,
    pageWidthPx,
    pageHeightPx,
    usableWidthPx,
    usableHeightPx,
    pageGapPx,
    marginsPx,
  };
}

/**
 * Tính toán chiều cao spacer cần thiết cho một node pageBreak hoặc sectionBreak
 * để đẩy nội dung tiếp theo bắt đầu chính xác tại lề trên của trang kế tiếp.
 */
export function calculateExplicitBreakSpacer(
  breakOffsetTopPx: number,
  pageHeightPx: number,
  pageGapPx = PAGE_GAP_PX,
  marginTopPx = 0
): number {
  const cycleHeight = pageHeightPx + pageGapPx;
  const currentSheetIndex = Math.max(0, Math.floor(breakOffsetTopPx / cycleHeight));
  const currentSheetBottom = currentSheetIndex * cycleHeight + pageHeightPx;
  const remainingOnSheet = Math.max(0, currentSheetBottom - breakOffsetTopPx);

  return remainingOnSheet + pageGapPx + marginTopPx;
}

/**
 * Tính toán spacer cho break trong tài liệu có nhiều trang/section với kích thước hỗn hợp.
 */
export function calculateBreakSpacerForPages(
  breakOffsetTopPx: number,
  pages: PageLayoutInfo[],
  pageGapPx = PAGE_GAP_PX
): number {
  if (pages.length === 0) return pageGapPx;

  // Tìm sheet hiện tại chứa break
  const currentSheet =
    pages.find(
      (p) =>
        breakOffsetTopPx >= p.topPx &&
        breakOffsetTopPx < p.bottomPx + pageGapPx
    ) || pages[0];

  const currentSheetIndex = currentSheet.pageNumber - 1;
  const nextSheet = pages[currentSheetIndex + 1];

  const remainingOnSheet = Math.max(0, currentSheet.bottomPx - breakOffsetTopPx);
  const nextMarginTopPx = nextSheet?.margins
    ? mmToPx(nextSheet.margins.top)
    : mmToPx(currentSheet.margins?.top || 25.4);

  return remainingOnSheet + pageGapPx + nextMarginTopPx;
}

/**
 * Đếm số lượng node ngắt trang (cả pageBreak và sectionBreak) xuất hiện trong cây ProseMirror JSON
 */
export function countExplicitPageBreaks(content?: JSONContent | null): number {
  if (!content) return 0;
  let count = 0;

  function traverse(node: JSONContent) {
    if (node.type === "pageBreak" || node.type === "sectionBreak") {
      count++;
    }
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }

  traverse(content);
  return count;
}

/**
 * Ước tính chiều cao nội dung trong môi trường headless/unit-test
 * khi chưa có DOM renderer thực tế.
 */
export function estimateContentHeightPx(
  content: JSONContent,
  usableWidthPx = 600,
  fontSizePt = 11,
  lineSpacing = 1.15
): number {
  let totalHeight = 0;
  const baseLineHeightPx = (fontSizePt * 1.333) * lineSpacing;
  const charsPerLine = Math.max(20, Math.floor(usableWidthPx / (fontSizePt * 0.55)));

  function measureBlock(node: JSONContent) {
    if (node.type === "pageBreak" || node.type === "sectionBreak") {
      // Dấu ngắt trang / ngắt phần chiếm không gian trang trí cơ bản
      totalHeight += 40;
      return;
    }

    if (node.type === "horizontalRule") {
      // Kẻ ngang chiếm lề trên/dưới ~36px
      totalHeight += 36;
      return;
    }

    if (node.type === "textBox") {
      // Hộp văn bản (Text Box): Chiều cao tối thiểu + padding + margin + nội dung
      const minH = (node.attrs?.minHeight as number) || 80;
      let innerH = 24; // padding trong 12px trên/dưới
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          const text = extractText(child);
          const boxWidthPx = (node.attrs?.width as number) || 320;
          const boxCharsPerLine = Math.max(15, Math.floor(boxWidthPx / (fontSizePt * 0.55)));
          const lines = Math.max(1, Math.ceil(text.length / boxCharsPerLine));
          innerH += lines * baseLineHeightPx + 12;
        }
      }
      totalHeight += Math.max(minH, innerH) + 32; // margin 16px trên/dưới
      return;
    }

    if (node.type === "image") {
      const h = (node.attrs?.height as number) || 240;
      totalHeight += h + 32; // margin 16px trên/dưới
      return;
    }

    if (node.type === "shape") {
      const h = (node.attrs?.height as number) || 120;
      totalHeight += h + 32; // margin 16px trên/dưới
      return;
    }

    if (node.type === "equation") {
      totalHeight += 64; // chiều cao hiển thị phương trình + margin
      return;
    }

    if (node.type === "table") {
      // Bảng biểu: Chiều cao = tổng chiều cao các hàng + lề trên/dưới
      let tableHeight = 32; // lề trên 16px + lề dưới 16px
      if (node.content && Array.isArray(node.content)) {
        for (const row of node.content) {
          if (row.type === "tableRow" && row.content && Array.isArray(row.content)) {
            let maxCellHeight = 34; // Chiều cao tối thiểu một hàng
            const tableMargins = node.attrs?.cellMargins || { top: 6, right: 8, bottom: 6, left: 8 };
            for (const cell of row.content) {
              const cellMargins = cell.attrs?.cellMargins || tableMargins;
              const vertPadding = (cellMargins.top ?? 6) + (cellMargins.bottom ?? 6);
              const cellText = extractText(cell);
              const cellLines = Math.max(1, Math.ceil(cellText.length / Math.max(10, charsPerLine / (row.content.length || 1))));
              const cellH = cellLines * baseLineHeightPx + vertPadding + 4;
              if (cellH > maxCellHeight) {
                maxCellHeight = cellH;
              }
            }
            if (row.attrs?.rowHeight && typeof row.attrs.rowHeight === "number") {
              const rule = row.attrs.rowHeightRule || "auto";
              if (rule === "atLeast" || rule === "exact") {
                maxCellHeight = Math.max(row.attrs.rowHeight, maxCellHeight);
              }
            }
            tableHeight += maxCellHeight;
          }
        }
      }
      totalHeight += tableHeight;
      return;
    }

    if (node.type === "heading") {
      const level = (node.attrs?.level as number) || 1;
      const headingSize = level === 1 ? 26 : level === 2 ? 21 : 17;
      const text = extractText(node);
      const lines = Math.max(1, Math.ceil(text.length / (charsPerLine * 0.75)));
      totalHeight += lines * (headingSize * 1.35) + 24; // margin trên/dưới
      return;
    }

    if (node.type === "paragraph") {
      const text = extractText(node);
      const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
      totalHeight += lines * baseLineHeightPx + 12; // margin-bottom paragraph
      return;
    }

    if (node.type === "bulletList" || node.type === "orderedList") {
      if (node.content && Array.isArray(node.content)) {
        for (const _item of node.content) {
          totalHeight += baseLineHeightPx + 6;
        }
      }
      totalHeight += 12;
      return;
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        measureBlock(child);
      }
    }
  }

  function extractText(node: JSONContent): string {
    let res = "";
    if (node.text) res += node.text;
    if (node.content && Array.isArray(node.content)) {
      for (const c of node.content) res += extractText(c);
    }
    return res;
  }

  measureBlock(content);
  return Math.max(baseLineHeightPx, totalHeight);
}

/**
 * Tính toán toàn bộ trạng thái phân trang (PaginationState) cho tài liệu,
 * hỗ trợ đầy đủ cả tài liệu đơn Section và đa Section (Phase 2.7).
 */
export function calculatePaginationState(
  content: JSONContent | null | undefined,
  config: PaginationConfig,
  measuredContentHeightPx?: number
): PaginationState {
  const sections = extractSections(content, {
    paperSize: config.paperSize,
    orientation: config.orientation,
    margins: config.margins,
  });

  const pageGapPx = config.pageGapPx ?? PAGE_GAP_PX;
  const pages: PageLayoutInfo[] = [];
  let currentTopPx = 0;

  if (sections.length <= 1) {
    // Tài liệu đơn Section: kế thừa toàn vẹn logic ổn định Phase 2.6
    const dim = calculatePaginationDimensions(config);
    const explicitBreaks = countExplicitPageBreaks(content);

    const contentHeight =
      typeof measuredContentHeightPx === "number" && measuredContentHeightPx > 0
        ? measuredContentHeightPx
        : content
        ? estimateContentHeightPx(content, dim.usableWidthPx)
        : 0;

    const overflowPages = Math.max(1, Math.ceil(contentHeight / dim.usableHeightPx));
    const pageCount = Math.max(1, explicitBreaks + 1, overflowPages);
    const cycleHeight = dim.pageHeightPx + pageGapPx;

    for (let i = 0; i < pageCount; i++) {
      const pageNumber = i + 1;
      const topPx = i * cycleHeight;
      const bottomPx = topPx + dim.pageHeightPx;

      pages.push({
        pageNumber,
        sectionIndex: 1,
        sectionId: "sec-1",
        paperSize: config.paperSize,
        orientation: config.orientation,
        margins: config.margins,
        widthMm: dim.widthMm,
        heightMm: dim.heightMm,
        widthPx: dim.pageWidthPx,
        heightPx: dim.pageHeightPx,
        topPx,
        bottomPx,
        breakType: i === 0 ? "start" : i <= explicitBreaks ? "explicit" : "overflow",
      });
    }

    return {
      pageCount,
      currentPage: 1,
      currentSectionIndex: 1,
      pages,
      usableWidthPx: dim.usableWidthPx,
      usableHeightPx: dim.usableHeightPx,
      pageWidthPx: dim.pageWidthPx,
      pageHeightPx: dim.pageHeightPx,
      pageGapPx,
      marginsPx: dim.marginsPx,
    };
  }

  // Tài liệu đa Section (Phase 2.7 - Multi-Section Documents)
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const secDim = calculatePaginationDimensions({
      paperSize: sec.pageSettings.paperSize,
      orientation: sec.pageSettings.orientation,
      margins: sec.pageSettings.margins,
      pageGapPx,
    });

    const secBlocks = getBlocksForSection(content, sIdx);
    const explicitBreaksInSec = countExplicitPageBreaks({ type: "doc", content: secBlocks });
    const secContentHeight = estimateContentHeightPx(
      { type: "doc", content: secBlocks },
      secDim.usableWidthPx
    );

    const overflowPages = Math.max(1, Math.ceil(secContentHeight / secDim.usableHeightPx));
    const secPageCount = Math.max(1, explicitBreaksInSec + 1, overflowPages);

    sec.startPageNumber = pages.length + 1;
    sec.pageCount = secPageCount;

    for (let p = 0; p < secPageCount; p++) {
      const pageNumber = pages.length + 1;
      const topPx = currentTopPx;
      const bottomPx = topPx + secDim.pageHeightPx;

      pages.push({
        pageNumber,
        sectionIndex: sec.index,
        sectionId: sec.id,
        paperSize: sec.pageSettings.paperSize,
        orientation: sec.pageSettings.orientation,
        margins: sec.pageSettings.margins,
        widthMm: secDim.widthMm,
        heightMm: secDim.heightMm,
        widthPx: secDim.pageWidthPx,
        heightPx: secDim.pageHeightPx,
        topPx,
        bottomPx,
        breakType:
          p === 0
            ? sIdx === 0
              ? "start"
              : "section"
            : p <= explicitBreaksInSec
            ? "explicit"
            : "overflow",
      });

      currentTopPx = bottomPx + pageGapPx;
    }
  }

  const defaultDim = calculatePaginationDimensions(config);

  return {
    pageCount: pages.length,
    currentPage: 1,
    currentSectionIndex: 1,
    pages,
    usableWidthPx: defaultDim.usableWidthPx,
    usableHeightPx: defaultDim.usableHeightPx,
    pageWidthPx: defaultDim.pageWidthPx,
    pageHeightPx: defaultDim.pageHeightPx,
    pageGapPx,
    marginsPx: defaultDim.marginsPx,
  };
}
