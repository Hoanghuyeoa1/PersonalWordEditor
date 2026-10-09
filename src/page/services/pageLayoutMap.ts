/**
 * PAGINATION ENGINE 2.0 — CENTRALIZED PAGE LAYOUT MAP
 *
 * Chịu trách nhiệm:
 * 1. Xây dựng Runtime Layout Model và phân mảnh LayoutFragment từ AST và Section configurations.
 * 2. Cung cấp API tập trung (Centralized Page Map) cho việc truy vấn trang và phân mảnh.
 * 3. Tính toán chính xác Page Geometry (usableBodyBounds, headerBounds, footerBounds) cho từng trang.
 * 4. Bảo toàn tính bất biến của AST (Tuyệt đối không mutate AST, không dispatch transaction).
 */

import type { JSONContent } from "@tiptap/core";
import type { PageSettings } from "../types/pageTypes.ts";
import type { SectionModel } from "../types/sectionTypes.ts";
import type {
  BoundsRect,
  PageLayoutGeometry,
  LayoutFragment,
  TableRowLayoutInfo,
  TableFragmentMetadata,
} from "../types/layoutModelTypes.ts";
export type { TableFragmentMetadata, TableRowLayoutInfo };
import { createBoundsRect } from "../types/layoutModelTypes.ts";
import { getPageDimensions, mmToPx, validateAndNormalizePageSettings } from "./pageSettingsService.ts";
import { PAGE_GAP_PX } from "./paginationService.ts";
import { extractSections, getBlocksForSection } from "./sectionService.ts";
import type { RenderedLineBox } from "./lineMeasurementService.ts";
import { measureLinesVirtual } from "./lineMeasurementService.ts";
import type { DocumentStyle } from "../../styles/types/styleTypes.ts";
import { resolveBlockPaginationRules } from "../../styles/services/effectiveStyleService.ts";
import type { BlockPaginationRules } from "../../styles/services/effectiveStyleService.ts";
import { DrawingPositionService } from "../../docx/drawing/drawingPositionService.ts";
import type { DrawingPosition } from "../../docx/drawing/drawingTypes.ts";
import type { ResolvedWrappingObstacle } from "../../docx/drawing/drawingWrapService.ts";

const defaultDrawingPositionService = new DrawingPositionService();

export interface PageLayoutMapOptions {
  /** Map chiều cao đo được trực tiếp từ DOM (nếu có) theo pos của block node */
  measuredBlockHeights?: Map<number, number>;
  /** Map danh sách RenderedLineBox đo được từ DOM theo pos của block node */
  measuredBlockLines?: Map<number, RenderedLineBox[]>;
  /** Map chiều cao đo được của từng hàng trong bảng (tableRow pos -> height px) */
  measuredTableRowHeights?: Map<number, number>;
  /** Khoảng cách giữa các trang (pixel, mặc định 24px) */
  pageGapPx?: number;
  /** Custom line measurement provider nếu muốn ghi đè (cho testing/custom DOM) */
  lineMeasureProvider?: (
    node: JSONContent,
    usableWidthPx: number,
    blockPos: number
  ) => RenderedLineBox[];
  /** Document styles map hoặc list để tra cứu style hiệu lực */
  documentStyles?: Map<string, DocumentStyle> | DocumentStyle[];
}

/**
 * Centralized Page Layout Map
 * Nguồn chân lý duy nhất cho toàn bộ các tác vụ truy vấn hình học và ánh xạ trang.
 */
export class PageLayoutMap {
  private readonly pages: PageLayoutGeometry[];
  private readonly fragments: LayoutFragment[];
  private readonly isRealDomMeasured: boolean;

  constructor(
    pages: PageLayoutGeometry[],
    fragments: LayoutFragment[],
    isRealDomMeasured: boolean = false
  ) {
    this.pages = pages;
    this.fragments = fragments;
    this.isRealDomMeasured = isRealDomMeasured;
  }

  /**
   * Tổng số trang vật lý của tài liệu (Luôn >= 1)
   */
  public getPageCount(): number {
    return Math.max(1, this.pages.length);
  }

  /**
   * Lấy danh sách toàn bộ các trang hình học
   */
  public getPages(): readonly PageLayoutGeometry[] {
    return this.pages;
  }

  /**
   * Lấy thông tin hình học của trang theo chỉ số 0-indexed
   */
  public getPage(pageIndex: number): PageLayoutGeometry | null {
    if (pageIndex < 0 || pageIndex >= this.pages.length) {
      return null;
    }
    return this.pages[pageIndex];
  }

  /**
   * Lấy hình chữ nhật bao quanh toàn trang (pixel)
   */
  public getPageBounds(pageIndex: number): BoundsRect | null {
    const page = this.getPage(pageIndex);
    if (!page) return null;
    return createBoundsRect(0, page.topPx, page.widthPx, page.heightPx);
  }

  /**
   * Lấy vùng thân trang khả dụng cho nội dung (Usable Body Bounds)
   */
  public getUsableBodyBounds(pageIndex: number): BoundsRect | null {
    const page = this.getPage(pageIndex);
    if (!page) return null;
    return page.usableBodyBounds;
  }

  /**
   * Lấy chỉ số section (1-indexed) của một trang
   */
  public getSectionForPage(pageIndex: number): number {
    const page = this.getPage(pageIndex);
    return page ? page.sectionIndex : 1;
  }

  /**
   * Tra cứu phân mảnh layout chứa vị trí con trỏ ProseMirror `pos`
   */
  public getFragmentForPosition(pos: number): LayoutFragment | null {
    if (this.fragments.length === 0) return null;
    const safePos = Math.max(0, pos);

    for (let i = 0; i < this.fragments.length; i++) {
      const frag = this.fragments[i];
      const isLast = i === this.fragments.length - 1;
      const inRange =
        !isLast
          ? safePos >= frag.from && safePos < frag.to
          : safePos >= frag.from && safePos <= frag.to;
      if (inRange) {
        return frag;
      }
    }

    return this.fragments[this.fragments.length - 1] ?? null;
  }

  /**
   * Tra cứu chỉ số trang (0-indexed) chứa vị trí con trỏ ProseMirror `pos`
   */
  public getPageForPosition(pos: number): number {
    if (this.pages.length === 0) return 0;
    const safePos = Math.max(0, pos);

    // 1. Tra cứu trực tiếp từ fragment (chính xác tuyệt đối cho cả khối và paragraph split)
    const frag = this.getFragmentForPosition(safePos);
    if (frag) {
      return Math.min(this.pages.length - 1, Math.max(0, frag.pageIndex));
    }

    // 2. Fallback qua dải docRange của trang với ranh giới nửa mở [from, to)
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      const isLast = i === this.pages.length - 1;
      if (
        safePos >= page.docRange.from &&
        (isLast ? safePos <= page.docRange.to : safePos < page.docRange.to)
      ) {
        return i;
      }
    }

    // 3. Fallback: Nếu vượt quá phạm vi tài liệu, trả về trang cuối
    if (safePos >= this.pages[this.pages.length - 1].docRange.to) {
      return this.pages.length - 1;
    }

    return 0;
  }

  /**
   * Tra cứu số thứ tự trang (1-indexed) chứa vị trí con trỏ ProseMirror `pos`
   */
  public getPageNumberForPosition(pos: number): number {
    return this.getPageForPosition(pos) + 1;
  }

  /**
   * Lấy danh sách các phân mảnh giao nhau với dải vị trí [from, to]
   */
  public getFragmentsForRange(from: number, to: number): LayoutFragment[] {
    const start = Math.min(from, to);
    const end = Math.max(from, to);

    if (start === end) {
      const frag = this.getFragmentForPosition(start);
      return frag ? [frag] : [];
    }

    return this.fragments.filter((frag) => {
      // Hai khoảng nửa mở [start, end) và [frag.from, frag.to) giao nhau
      return start < frag.to && end > frag.from;
    });
  }

  /**
   * Lấy danh sách các phân mảnh thuộc về một node bắt đầu tại `pos`
   */
  public getFragmentsForNode(pos: number, nodeSize?: number): LayoutFragment[] {
    if (typeof nodeSize === "number" && nodeSize > 0) {
      return this.getFragmentsForRange(pos, pos + nodeSize);
    }
    return this.fragments.filter((frag) => frag.from === pos);
  }

  /**
   * Lấy toàn bộ phân mảnh layout
   */
  public getAllFragments(): readonly LayoutFragment[] {
    return this.fragments;
  }

  /**
   * Layout có được tính toán từ phép đo DOM thật hay chế độ headless/ước tính
   */
  public isMeasuredFromDom(): boolean {
    return this.isRealDomMeasured;
  }

  /**
   * Lấy danh sách các phân mảnh thuộc về một table (hoặc tất cả các table nếu không truyền tablePos)
   */
  public getTableFragments(tablePos?: number): LayoutFragment[] {
    return this.fragments.filter((frag) => {
      if (frag.nodeType !== "table") return false;
      if (typeof tablePos === "number") {
        return frag.blockId.startsWith(`block-${tablePos}`);
      }
      return true;
    });
  }

  /**
   * Tra cứu thông tin hàng bảng chứa vị trí con trỏ ProseMirror `pos`
   */
  public getTableRowForPosition(pos: number): TableRowLayoutInfo | null {
    const frag = this.getFragmentForPosition(pos);
    if (!frag || frag.nodeType !== "table" || !frag.tableMetadata || frag.tableMetadata.rows.length === 0) {
      return null;
    }
    const safePos = Math.max(0, pos);
    const rows = frag.tableMetadata.rows;
    for (const row of rows) {
      if (safePos >= row.from && safePos < row.to) {
        return row;
      }
    }
    if (safePos <= rows[0].from) {
      return rows[0];
    }
    const lastRow = rows[rows.length - 1];
    if (safePos >= lastRow.to) {
      return lastRow;
    }
    return null;
  }

  /**
   * Lấy danh sách tất cả các hàng bảng xuất hiện trên một trang cụ thể
   */
  public getTableRowsForPage(pageIndex: number): TableRowLayoutInfo[] {
    const result: TableRowLayoutInfo[] = [];
    for (const frag of this.fragments) {
      if (frag.pageIndex === pageIndex && frag.nodeType === "table" && frag.tableMetadata) {
        result.push(...frag.tableMetadata.rows);
      }
    }
    return result;
  }

  /**
   * Tra cứu chỉ số trang (0-indexed) chứa hàng bảng bắt đầu tại `rowPos`
   */
  public getPageForTableRow(rowPos: number): number {
    return this.getPageForPosition(rowPos);
  }

  /**
   * Tra cứu thông tin visual repeated header trên một trang (nếu có)
   */
  public getRepeatedHeaderForPage(
    pageIndex: number
  ): { tablePos: number; height: number; rowIndex: number } | null {
    for (const frag of this.fragments) {
      if (
        frag.pageIndex === pageIndex &&
        frag.nodeType === "table" &&
        frag.tableMetadata?.hasRepeatedHeader
      ) {
        return {
          tablePos: frag.from,
          height: frag.tableMetadata.repeatedHeaderHeight ?? 0,
          rowIndex: frag.tableMetadata.repeatedHeaderRowIndex ?? 0,
        };
      }
    }
    return null;
  }
}

/**
 * Tính kích thước AST node (nodeSize) an toàn
 */
export function getNodeSize(node: JSONContent): number {
  if (node.type === "pageBreak" || node.type === "sectionBreak") {
    return 1;
  }
  if (
    node.type === "image" ||
    node.type === "shape" ||
    node.type === "equation" ||
    node.type === "horizontalRule" ||
    node.type === "tableOfContents" ||
    node.type === "bibliography" ||
    node.type === "crossReference" ||
    node.type === "footnote" ||
    node.type === "endnote" ||
    node.type === "citation"
  ) {
    return 1;
  }
  if (node.type === "text") {
    return node.text ? node.text.length : 0;
  }
  let size = 2; // Thẻ mở + thẻ đóng của block node
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      size += getNodeSize(child);
    }
  }
  return size;
}

/**
 * Trích xuất toàn bộ text của một node
 */
function extractNodeText(node: JSONContent | any): string {
  if (typeof node?.textContent === "string") return node.textContent;
  let res = "";
  if (node?.text) res += node.text;
  if (node?.content && Array.isArray(node.content)) {
    for (const c of node.content) res += extractNodeText(c);
  } else if (node?.content && typeof node.content.forEach === "function") {
    node.content.forEach((c: any) => {
      res += extractNodeText(c);
    });
  }
  return res;
}

/**
 * Ước tính chiều cao của một hàng bảng (tableRow) khi chưa có DOM (Phase 8 & Phase 5)
 */
export function estimateTableRowHeight(
  row: JSONContent | any,
  charsPerLine: number,
  baseLineHeightPx = 20,
  tableAttrs?: Record<string, any>
): number {
  let maxCellHeight = 34;
  const tableMargins = tableAttrs?.cellMargins || { top: 6, right: 8, bottom: 6, left: 8 };

  let cells: any[] = [];
  if (Array.isArray(row.content)) {
    cells = row.content;
  } else if (row.content && typeof row.content.forEach === "function") {
    row.content.forEach((c: any) => cells.push(c));
  } else if (typeof row.forEach === "function") {
    row.forEach((c: any) => cells.push(c));
  }

  if (cells.length > 0) {
    const colCount = Math.max(1, cells.length);
    const defaultCharsPerCell = Math.max(10, Math.floor(charsPerLine / colCount));
    for (const cell of cells) {
      const cellAttrs = cell.attrs || {};
      const cellMargins = cellAttrs.cellMargins || tableMargins;
      const vertPadding = (cellMargins.top ?? 6) + (cellMargins.bottom ?? 6);
      const horizPadding = (cellMargins.left ?? 8) + (cellMargins.right ?? 8);

      let cellChars = defaultCharsPerCell;
      if (cellAttrs.colwidth && Array.isArray(cellAttrs.colwidth) && cellAttrs.colwidth[0] > 0) {
        const colWidthPx = cellAttrs.colwidth[0];
        const usableColWidth = Math.max(10, colWidthPx - horizPadding);
        cellChars = Math.max(5, Math.floor(usableColWidth / 8.5));
      }
      const text = extractNodeText(cell);
      const cellLines = Math.max(1, Math.ceil(text.length / cellChars));
      const cellH = cellLines * baseLineHeightPx + vertPadding + 4;
      if (cellH > maxCellHeight) {
        maxCellHeight = cellH;
      }
    }
  }

  // Row height model (auto, atLeast, exact)
  const rowHeight = typeof row.attrs?.rowHeight === "number" ? row.attrs.rowHeight : null;
  const rowHeightRule = row.attrs?.rowHeightRule || "auto";

  if (rowHeightRule === "atLeast" && rowHeight !== null) {
    return Math.max(rowHeight, maxCellHeight);
  }
  if (rowHeightRule === "exact" && rowHeight !== null) {
    // Exact policy: preserve content without silent clipping data loss
    return Math.max(rowHeight, maxCellHeight);
  }
  return maxCellHeight;
}

/**
 * Tính toán các nhóm hàng liên kết bởi rowspan (Phase 8.5 Rowspan Across Page)
 * Đảm bảo các ô gộp dọc được nhận diện thành từng khối thống nhất
 */
export function computeTableRowspanGroups(
  rows: JSONContent[]
): Map<number, { startRow: number; endRow: number }> {
  const rowspanGroupMap = new Map<number, { startRow: number; endRow: number }>();
  if (!rows || rows.length === 0) return rowspanGroupMap;

  const maxSpanEnd: number[] = [];
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    let maxEnd = rIdx;
    const row = rows[rIdx];
    if (row.content && Array.isArray(row.content)) {
      for (const cell of row.content) {
        const span = Number(cell.attrs?.rowspan) || 1;
        if (span > 1) {
          maxEnd = Math.max(maxEnd, Math.min(rows.length - 1, rIdx + span - 1));
        }
      }
    }
    maxSpanEnd.push(maxEnd);
  }

  let currGroupStart = 0;
  let currGroupEnd = maxSpanEnd[0] ?? 0;
  for (let i = 0; i < rows.length; i++) {
    if (i > currGroupEnd) {
      for (let j = currGroupStart; j <= currGroupEnd; j++) {
        rowspanGroupMap.set(j, { startRow: currGroupStart, endRow: currGroupEnd });
      }
      currGroupStart = i;
      currGroupEnd = maxSpanEnd[i];
    } else {
      currGroupEnd = Math.max(currGroupEnd, maxSpanEnd[i]);
    }
  }
  for (let j = currGroupStart; j <= currGroupEnd; j++) {
    rowspanGroupMap.set(j, { startRow: currGroupStart, endRow: currGroupEnd });
  }

  return rowspanGroupMap;
}

/**
 * Ước tính chiều cao của một block node (px) khi chưa có DOM
 */
function estimateSingleBlockHeight(
  node: JSONContent,
  usableWidthPx: number,
  baseLineHeightPx = 20
): number {
  const charsPerLine = Math.max(20, Math.floor(usableWidthPx / 8.5));

  switch (node.type) {
    case "pageBreak":
    case "sectionBreak":
      return 40;

    case "horizontalRule":
      return 36;

    case "image":
      return ((node.attrs?.height as number) || 240) + 32;

    case "shape":
      return ((node.attrs?.height as number) || 120) + 32;

    case "equation":
      return 64;

    case "caption": {
      const text = (node.attrs?.text as string) || extractNodeText(node);
      const lines = Math.max(1, Math.ceil((text.length + 15) / charsPerLine));
      return lines * baseLineHeightPx + 16;
    }

    case "tableOfContents": {
      const entries = (node.attrs?.entries as any[]) || [];
      const count = entries.length > 0 ? entries.length : 4;
      return 40 + count * 24 + 16;
    }

    case "bibliography": {
      const entries = (node.attrs?.entries as any[]) || [];
      const count = entries.length > 0 ? entries.length : 3;
      return 40 + count * 28 + 16;
    }

    case "textBox": {
      const minH = (node.attrs?.minHeight as number) || 80;
      let innerH = 24;
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          const text = extractNodeText(child);
          const lines = Math.max(1, Math.ceil(text.length / 30));
          innerH += lines * baseLineHeightPx + 12;
        }
      }
      return Math.max(minH, innerH) + 32;
    }

    case "table": {
      let tableHeight = 0;
      if (node.content && Array.isArray(node.content)) {
        for (const row of node.content) {
          if (row.type === "tableRow") {
            tableHeight += estimateTableRowHeight(row, charsPerLine, baseLineHeightPx, node.attrs);
          }
        }
      }
      return Math.max(34, tableHeight);
    }

    case "heading": {
      const level = (node.attrs?.level as number) || 1;
      const headingSize = level === 1 ? 26 : level === 2 ? 21 : 17;
      const text = extractNodeText(node);
      const lines = Math.max(1, Math.ceil(text.length / (charsPerLine * 0.75)));
      return lines * (headingSize * 1.35) + 24;
    }

    case "paragraph": {
      const text = extractNodeText(node);
      const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
      return lines * baseLineHeightPx + 12;
    }

    case "bulletList":
    case "orderedList": {
      let listH = 12;
      if (node.content && Array.isArray(node.content)) {
        for (const _item of node.content) {
          listH += baseLineHeightPx + 6;
        }
      }
      return listH;
    }

    default:
      return 28;
  }
}

/**
 * Xây dựng PageLayoutGeometry cho một trang mới
 */
function createPageGeometry(
  pageIndex: number,
  sec: SectionModel,
  canvasTopPx: number
): PageLayoutGeometry {
  const normSettings = validateAndNormalizePageSettings(sec.pageSettings);
  const dims = getPageDimensions(normSettings.paperSize, normSettings.orientation);

  const widthPx = mmToPx(dims.width);
  const heightPx = mmToPx(dims.height);

  const marginsPx = {
    top: mmToPx(normSettings.margins.top),
    right: mmToPx(normSettings.margins.right),
    bottom: mmToPx(normSettings.margins.bottom),
    left: mmToPx(normSettings.margins.left),
  };

  const usableWidth = Math.max(10, widthPx - (marginsPx.left + marginsPx.right));
  const usableHeight = Math.max(10, heightPx - (marginsPx.top + marginsPx.bottom));

  // Vùng Header: từ lề trên lên sát đầu trang
  const headerHeight = Math.max(18, marginsPx.top * 0.6);
  const headerTop = Math.max(8, marginsPx.top * 0.35);
  const headerBounds = createBoundsRect(marginsPx.left, headerTop, usableWidth, headerHeight);

  // Vùng Footer: từ chân trang lên
  const footerHeight = Math.max(18, marginsPx.bottom * 0.6);
  const footerTop = heightPx - Math.max(24, marginsPx.bottom * 0.85);
  const footerBounds = createBoundsRect(marginsPx.left, footerTop, usableWidth, footerHeight);

  // Vùng thân trang khả dụng
  const usableBodyBounds = createBoundsRect(
    marginsPx.left,
    marginsPx.top,
    usableWidth,
    usableHeight
  );

  return {
    pageIndex,
    pageNumber: pageIndex + 1,
    sectionIndex: sec.index,
    sectionId: sec.id,
    paperSize: normSettings.paperSize,
    orientation: normSettings.orientation,
    widthMm: dims.width,
    heightMm: dims.height,
    widthPx,
    heightPx,
    topPx: canvasTopPx,
    bottomPx: canvasTopPx + heightPx,
    marginsMm: normSettings.margins,
    marginsPx,
    headerBounds,
    footerBounds,
    usableBodyBounds,
    docRange: { from: 0, to: 0 },
  };
}

/**
 * Kiểm tra xem hai block liền kề có tạo thành Caption Group ngữ nghĩa không.
 * Hỗ trợ generic hoàn toàn:
 * - Target trước, Caption ("below") sau
 * - Caption ("above") trước, Target sau
 * Tuyệt đối không hardcode text/label ("Figure", "Table"...)
 */
function getSemanticCaptionGroupInfo(
  current: { block: JSONContent; fullHeight: number; minHeight?: number },
  next: { block: JSONContent; fullHeight: number; minHeight?: number }
): { isGroup: boolean; groupHeight: number; minGroupHeight: number } {
  const targetableTypes = ["image", "table", "shape", "equation", "textBox"];

  // TH 1: Target ở trước, Caption ("below") ở ngay sau
  if (
    next.block.type === "caption" &&
    (next.block.attrs?.positionPolicy || "below") === "below"
  ) {
    const targetId = next.block.attrs?.targetId;
    const currentId = current.block.attrs?.id;
    const isLinked =
      (targetId && currentId && targetId === currentId) ||
      (!targetId && targetableTypes.includes(current.block.type || ""));

    if (isLinked) {
      return {
        isGroup: true,
        groupHeight: current.fullHeight + next.fullHeight,
        minGroupHeight: (current.minHeight ?? current.fullHeight) + (next.minHeight ?? next.fullHeight),
      };
    }
  }

  // TH 2: Caption ("above") ở trước, Target ở ngay sau
  if (
    current.block.type === "caption" &&
    current.block.attrs?.positionPolicy === "above"
  ) {
    const targetId = current.block.attrs?.targetId;
    const nextId = next.block.attrs?.id;
    const isLinked =
      (targetId && nextId && targetId === nextId) ||
      (!targetId && targetableTypes.includes(next.block.type || ""));

    if (isLinked) {
      return {
        isGroup: true,
        groupHeight: current.fullHeight + next.fullHeight,
        minGroupHeight: (current.minHeight ?? current.fullHeight) + (next.minHeight ?? next.fullHeight),
      };
    }
  }

  return { isGroup: false, groupHeight: 0, minGroupHeight: 0 };
}

/**
 * Builder: Xây dựng PageLayoutMap từ ProseMirror JSON AST và thiết lập trang
 *
 * Đảm bảo:
 * - Empty document luôn sinh ra tối thiểu 1 page.
 * - Không bao giờ mutate content AST.
 * - Đọc geometry thực từ paperSize, orientation, margins, sections.
 */
export function buildPageLayoutMap(
  content: JSONContent | null | undefined,
  defaultPageSettings: PageSettings,
  options: PageLayoutMapOptions = {}
): PageLayoutMap {
  const pageGapPx = options.pageGapPx ?? PAGE_GAP_PX;
  const measuredHeights = options.measuredBlockHeights;
  const isRealDom = !!measuredHeights && measuredHeights.size > 0;

  const sections = extractSections(content, defaultPageSettings);

  const pages: PageLayoutGeometry[] = [];
  const fragments: LayoutFragment[] = [];

  let canvasTopPx = 0;
  let currentDocPos = 0;

  // 1. Trường hợp tài liệu rỗng hoặc không có block
  if (!content || !content.content || content.content.length === 0) {
    const sec1 = sections[0] || {
      index: 1,
      id: "sec-1",
      pageSettings: defaultPageSettings,
    };
    const emptyPage = createPageGeometry(0, sec1 as SectionModel, 0);
    emptyPage.docRange = { from: 0, to: 2 };
    pages.push(emptyPage);

    fragments.push({
      nodeType: "paragraph",
      blockId: "block-0",
      from: 0,
      to: 2,
      pageIndex: 0,
      top: emptyPage.usableBodyBounds.y,
      height: 24,
      continuedFromPreviousPage: false,
      continuesToNextPage: false,
    });

    return new PageLayoutMap(pages, fragments, isRealDom);
  }

  // 2. Duyệt qua từng section và phân bổ blocks
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const secBlocks = getBlocksForSection(content, sIdx);

    // Bắt đầu trang đầu tiên của section
    let currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
    let currentPageUsedHeight = 0;
    let pageMinPos = currentDocPos;
    let pageMaxPos = currentDocPos;

    if (secBlocks.length === 0) {
      currentPage.docRange = { from: currentDocPos, to: currentDocPos + 2 };
      pages.push(currentPage);
      canvasTopPx += currentPage.heightPx + pageGapPx;
      continue;
    }

    // Precompute block metadata cho section hiện tại để phục vụ lookahead, keepWithNext & conflict resolution
    interface BlockMeta {
      block: JSONContent;
      bIdx: number;
      blockPos: number;
      blockSize: number;
      blockEndPos: number;
      rules: BlockPaginationRules;
      lines?: RenderedLineBox[];
      fullHeight: number;
      minHeight: number;
    }

    // Quét toàn bộ floating obstacles trong section hiện tại để phục vụ tính toán Text Wrapping
    const sectionObstacles: ResolvedWrappingObstacle[] = [];
    let scanPos = currentDocPos;
    for (const b of secBlocks) {
      const bSize = getNodeSize(b);
      if (b.attrs?.drawingPosition && b.attrs.drawingPosition.placement === "floating") {
        const rawPos: DrawingPosition = b.attrs.drawingPosition;
        const pageContext = {
          pageWidthPx: currentPage.widthPx,
          pageHeightPx: currentPage.heightPx,
          marginsPx: currentPage.marginsPx,
          paragraphTopPx: currentPage.usableBodyBounds.y,
          paragraphLeftPx: currentPage.usableBodyBounds.x,
          paragraphWidthPx: currentPage.usableBodyBounds.width,
        };
        const obs = defaultDrawingPositionService.createObstacle(rawPos, pageContext, b.attrs?.shapeType);
        sectionObstacles.push(obs);
      }
      scanPos += bSize;
    }

    const blockMetas: BlockMeta[] = [];
    let tempPos = currentDocPos;
    for (let i = 0; i < secBlocks.length; i++) {
      const b = secBlocks[i];
      const sz = getNodeSize(b);
      const rules = resolveBlockPaginationRules(b, options.documentStyles);
      let lines =
        b.type === "paragraph"
          ? (options.measuredBlockLines?.get(tempPos) ??
             options.lineMeasureProvider?.(b, currentPage.usableBodyBounds.width, tempPos) ??
             measureLinesVirtual(
               b,
               currentPage.usableBodyBounds.width,
               tempPos,
               15,
               22,
               sectionObstacles.length > 0 ? sectionObstacles : undefined,
               currentPage.usableBodyBounds.y
             ))
          : undefined;

      const measuredH = measuredHeights?.get(tempPos);
      if (
        b.type === "paragraph" &&
        typeof measuredH === "number" &&
        !options.measuredBlockLines?.has(tempPos) &&
        !options.lineMeasureProvider
      ) {
        if (lines && lines.length > 0) {
          const currentTotal = lines.reduce((acc, l) => acc + l.height, 0);
          if (currentTotal > 0 && Math.abs(currentTotal - measuredH) > 1) {
            const scale = measuredH / currentTotal;
            lines = lines.map((l) => ({
              ...l,
              height: l.height * scale,
              top: l.top * scale,
              bottom: l.bottom * scale,
            }));
          }
        }
      }

      const fullHeight =
        measuredH ??
        (lines && lines.length > 0
          ? lines.reduce((acc, l) => acc + l.height, 0)
          : estimateSingleBlockHeight(b, currentPage.usableBodyBounds.width));

      let minHeight = fullHeight;
      if (b.type === "paragraph" && lines && lines.length > 0) {
        if (rules.keepLinesTogether && fullHeight <= currentPage.usableBodyBounds.height) {
          minHeight = fullHeight;
        } else if (rules.widowControl !== false && lines.length >= 2) {
          minHeight = lines[0].height + lines[1].height;
        } else {
          minHeight = lines[0]?.height ?? 20;
        }
      } else if (b.type === "table") {
        const rows = b.content?.filter((c) => c.type === "tableRow") || [];
        const firstRow = rows[0];
        const charsPerLine = Math.max(20, Math.floor(currentPage.usableBodyBounds.width / 8.5));
        const firstRowMeasured =
          options.measuredTableRowHeights?.get(tempPos + 1) ??
          measuredHeights?.get(tempPos + 1);
        let baseMinHeight = firstRowMeasured ?? (firstRow ? estimateTableRowHeight(firstRow, charsPerLine, 20, b.attrs) : 34);

        if (rows.length > 0) {
          const rGroups = computeTableRowspanGroups(rows);
          const g0 = rGroups.get(0);
          if (g0 && g0.endRow > 0) {
            let g0Height = 0;
            let rOffset = tempPos + 1;
            for (let rIdx = 0; rIdx <= g0.endRow; rIdx++) {
              const r = rows[rIdx];
              const rH =
                options.measuredTableRowHeights?.get(rOffset) ??
                estimateTableRowHeight(r, charsPerLine, 20, b.attrs);
              g0Height += rH;
              rOffset += getNodeSize(r);
            }
            baseMinHeight = g0Height;
          }
        }
        minHeight = baseMinHeight;
      }

      blockMetas.push({
        block: b,
        bIdx: i,
        blockPos: tempPos,
        blockSize: sz,
        blockEndPos: tempPos + sz,
        rules,
        lines,
        fullHeight,
        minHeight,
      });

      tempPos += sz;
    }

    for (let bIdx = 0; bIdx < blockMetas.length; bIdx++) {
      const meta = blockMetas[bIdx];
      const { block, blockPos, blockEndPos, rules, lines: blockLines, fullHeight: blockHeight } = meta;

      // 1. Xử lý Explicit Page Break / Section Break
      if (block.type === "pageBreak" || block.type === "sectionBreak") {
        fragments.push({
          nodeType: block.type,
          blockId: `break-${blockPos}`,
          from: blockPos,
          to: blockEndPos,
          pageIndex: currentPage.pageIndex,
          top: currentPage.usableBodyBounds.y + currentPageUsedHeight,
          height: blockHeight,
          continuedFromPreviousPage: false,
          continuesToNextPage: false,
        });

        pageMaxPos = blockEndPos;
        currentPage.docRange = { from: pageMinPos, to: pageMaxPos };
        pages.push(currentPage);

        canvasTopPx += currentPage.heightPx + pageGapPx;
        currentDocPos = blockEndPos;

        if (block.type === "sectionBreak") {
          break;
        }

        currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
        currentPageUsedHeight = 0;
        pageMinPos = currentDocPos;
        pageMaxPos = currentDocPos;
        continue;
      }

      // 2. Xử lý Semantic pageBreakBefore
      if (rules.pageBreakBefore && currentPageUsedHeight > 0) {
        currentPage.docRange = { from: pageMinPos, to: blockPos };
        pages.push(currentPage);

        canvasTopPx += currentPage.heightPx + pageGapPx;

        currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
        currentPageUsedHeight = 0;
        pageMinPos = blockPos;
      }

      // 2.5. Xử lý Semantic Caption Grouping (Generic policy dựa trên semantic link)
      if (bIdx + 1 < blockMetas.length && currentPageUsedHeight > 0) {
        const captionGroup = getSemanticCaptionGroupInfo(meta, blockMetas[bIdx + 1]);
        if (captionGroup.isGroup) {
          const availableHeight = currentPage.usableBodyBounds.height - currentPageUsedHeight;
          const heightToCheck =
            captionGroup.groupHeight <= currentPage.usableBodyBounds.height
              ? captionGroup.groupHeight
              : captionGroup.minGroupHeight;
          if (heightToCheck > availableHeight) {
            const pageCapacity = currentPage.usableBodyBounds.height;
            if (heightToCheck <= pageCapacity) {
              // Cả nhóm [Target, Caption] hoặc [Caption, Target] (hoặc phần tối thiểu của nhóm) vừa vặn trên trang mới
              // -> Chuyển toàn bộ nhóm sang trang mới ngay tại block hiện tại
              currentPage.docRange = { from: pageMinPos, to: blockPos };
              pages.push(currentPage);

              canvasTopPx += currentPage.heightPx + pageGapPx;

              currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
              currentPageUsedHeight = 0;
              pageMinPos = blockPos;
            }
          }
        }
      }

      // 3. Xử lý Semantic keepWithNext & Chained Keep-Group (Generic block policy)
      if (rules.keepWithNext && bIdx + 1 < blockMetas.length && currentPageUsedHeight > 0) {
        let groupEndIdx = bIdx;
        let chainHeight = 0;
        while (groupEndIdx < blockMetas.length && blockMetas[groupEndIdx].rules.keepWithNext) {
          chainHeight += blockMetas[groupEndIdx].fullHeight;
          groupEndIdx++;
        }

        let followerMinHeight = 0;
        let followerHasKeepLinesTogether = false;
        let followerLines: RenderedLineBox[] | undefined;
        if (groupEndIdx < blockMetas.length) {
          const follower = blockMetas[groupEndIdx];
          followerMinHeight = follower.minHeight;
          followerHasKeepLinesTogether = follower.rules.keepLinesTogether;
          followerLines = follower.lines;
        }

        const requiredGroupHeight = chainHeight + followerMinHeight;
        const availableHeight = currentPage.usableBodyBounds.height - currentPageUsedHeight;

        if (requiredGroupHeight > availableHeight) {
          const pageCapacity = currentPage.usableBodyBounds.height;

          if (requiredGroupHeight <= pageCapacity) {
            // Keep-group vừa vặn trên 1 trang mới -> di chuyển toàn bộ nhóm sang trang sau
            currentPage.docRange = { from: pageMinPos, to: blockPos };
            pages.push(currentPage);

            canvasTopPx += currentPage.heightPx + pageGapPx;

            currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
            currentPageUsedHeight = 0;
            pageMinPos = blockPos;
          } else {
            // CONFLICT POLICY: detect oversized keep-group & relax lowest-priority constraint
            let resolved = false;
            if (followerHasKeepLinesTogether && followerLines && followerLines.length >= 2) {
              const relaxedFollowerMin = followerLines[0].height + followerLines[1].height;
              const relaxedGroupHeight = chainHeight + relaxedFollowerMin;
              if (relaxedGroupHeight <= pageCapacity) {
                // Relax keepLinesTogether của follower block thành công
                currentPage.docRange = { from: pageMinPos, to: blockPos };
                pages.push(currentPage);

                canvasTopPx += currentPage.heightPx + pageGapPx;

                currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
                currentPageUsedHeight = 0;
                pageMinPos = blockPos;
                resolved = true;
              }
            }

            if (!resolved) {
              // Bẻ gãy chuỗi chain: giữ tối đa cặp block trực tiếp nếu vừa 1 trang
              const directPairHeight = meta.fullHeight + blockMetas[bIdx + 1].minHeight;
              if (directPairHeight <= pageCapacity) {
                currentPage.docRange = { from: pageMinPos, to: blockPos };
                pages.push(currentPage);

                canvasTopPx += currentPage.heightPx + pageGapPx;

                currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
                currentPageUsedHeight = 0;
                pageMinPos = blockPos;
              }
            }
          }
        }
      }

      // 4. Xử lý Paragraph với keepLinesTogether & widow/orphan control
      if (block.type === "paragraph" && blockLines && blockLines.length > 0) {
        const lines = blockLines;
        const totalBlockHeight = lines.reduce((acc, l) => acc + l.height, 0);
        const pageCapacity = currentPage.usableBodyBounds.height;

        // 4A. keepLinesTogether: nếu vừa 1 usable page thì không split
        if (rules.keepLinesTogether && totalBlockHeight <= pageCapacity) {
          if (currentPageUsedHeight > 0 && currentPageUsedHeight + totalBlockHeight > pageCapacity) {
            // Không vừa phần còn lại -> chuyển sang trang mới
            currentPage.docRange = { from: pageMinPos, to: blockPos };
            pages.push(currentPage);

            canvasTopPx += currentPage.heightPx + pageGapPx;

            currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
            currentPageUsedHeight = 0;
            pageMinPos = blockPos;
          }

          fragments.push({
            nodeType: "paragraph",
            blockId: `block-${blockPos}`,
            from: blockPos,
            to: blockEndPos,
            pageIndex: currentPage.pageIndex,
            top: currentPage.usableBodyBounds.y + currentPageUsedHeight,
            height: totalBlockHeight,
            continuedFromPreviousPage: false,
            continuesToNextPage: false,
          });

          currentPageUsedHeight += totalBlockHeight;
          pageMaxPos = blockEndPos;
          currentDocPos = blockEndPos;
          continue;
        }

        // 4B. Paragraph Line Splitting (áp dụng widow/orphan hoặc oversized keepLinesTogether)
        let lineIdx = 0;
        let isContinued = false;
        const useWidowControl = rules.widowControl !== false;

        while (lineIdx < lines.length) {
          const availableHeight = currentPage.usableBodyBounds.height - currentPageUsedHeight;

          // Nếu trang hiện tại đã có nội dung và dòng tiếp theo không vừa
          if (currentPageUsedHeight > 0 && lines[lineIdx].height > availableHeight) {
            currentPage.docRange = { from: pageMinPos, to: lines[lineIdx].from };
            pages.push(currentPage);

            canvasTopPx += currentPage.heightPx + pageGapPx;

            currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
            currentPageUsedHeight = 0;
            pageMinPos = lines[lineIdx].from;
          }

          let fitCount = 0;
          let fitHeight = 0;
          while (
            lineIdx + fitCount < lines.length &&
            (currentPageUsedHeight + fitHeight + lines[lineIdx + fitCount].height <= currentPage.usableBodyBounds.height ||
              (currentPageUsedHeight === 0 && fitCount === 0))
          ) {
            fitHeight += lines[lineIdx + fitCount].height;
            fitCount++;
          }

          const remainingLines = lines.length - lineIdx;
          const overflowLines = remainingLines - fitCount;

          // Áp dụng Widow / Orphan control
          if (useWidowControl && overflowLines > 0) {
            // Orphan rule: minOrphanLines = 2
            if (fitCount < 2 && currentPageUsedHeight > 0) {
              currentPage.docRange = { from: pageMinPos, to: lines[lineIdx].from };
              pages.push(currentPage);

              canvasTopPx += currentPage.heightPx + pageGapPx;

              currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
              currentPageUsedHeight = 0;
              pageMinPos = lines[lineIdx].from;
              continue;
            }

            // Widow rule: minWidowLines = 2
            if (overflowLines === 1) {
              if (fitCount >= 3) {
                fitCount -= 1;
                fitHeight -= lines[lineIdx + fitCount].height;
              } else if (fitCount === 2 && currentPageUsedHeight > 0) {
                currentPage.docRange = { from: pageMinPos, to: lines[lineIdx].from };
                pages.push(currentPage);

                canvasTopPx += currentPage.heightPx + pageGapPx;

                currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
                currentPageUsedHeight = 0;
                pageMinPos = lines[lineIdx].from;
                continue;
              }
            }
          }

          if (fitCount === 0) {
            fitCount = 1;
            fitHeight = lines[lineIdx].height;
          }

          const fragStartLine = lineIdx;
          const fragStartPos = isContinued ? lines[fragStartLine].from : blockPos;
          lineIdx += fitCount;
          const hasMoreLines = lineIdx < lines.length;
          const fragEndPos = hasMoreLines ? lines[lineIdx].from : blockEndPos;

          fragments.push({
            nodeType: "paragraph",
            blockId: `block-${blockPos}-frag-${fragments.length}`,
            from: fragStartPos,
            to: fragEndPos,
            pageIndex: currentPage.pageIndex,
            top: currentPage.usableBodyBounds.y + currentPageUsedHeight,
            height: fitHeight,
            continuedFromPreviousPage: isContinued,
            continuesToNextPage: hasMoreLines,
          });

          currentPageUsedHeight += fitHeight;
          pageMaxPos = fragEndPos;
          isContinued = true;

          if (hasMoreLines) {
            currentPage.docRange = { from: pageMinPos, to: fragEndPos };
            pages.push(currentPage);

            canvasTopPx += currentPage.heightPx + pageGapPx;

            currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
            currentPageUsedHeight = 0;
            pageMinPos = fragEndPos;
          }
        }

        currentDocPos = blockEndPos;
        continue;
      }

      // 4.5 Xử lý Multi-Page Table Flow Core (Phase 8)
      if (block.type === "table") {
        const rows: JSONContent[] = Array.isArray(block.content)
          ? block.content.filter((c) => c.type === "tableRow")
          : [];

        // Nếu bảng rỗng (không có row nào)
        if (rows.length === 0) {
          const emptyHeight = 34;
          const pageCapacity = currentPage.usableBodyBounds.height;
          const availableHeight = pageCapacity - currentPageUsedHeight;

          if (emptyHeight > availableHeight && currentPageUsedHeight > 0) {
            currentPage.docRange = { from: pageMinPos, to: blockPos };
            pages.push(currentPage);
            canvasTopPx += currentPage.heightPx + pageGapPx;
            currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
            currentPageUsedHeight = 0;
            pageMinPos = blockPos;
          }

          fragments.push({
            nodeType: "table",
            blockId: `block-${blockPos}`,
            from: blockPos,
            to: blockEndPos,
            pageIndex: currentPage.pageIndex,
            top: currentPage.usableBodyBounds.y + currentPageUsedHeight,
            height: emptyHeight,
            continuedFromPreviousPage: false,
            continuesToNextPage: false,
            tableMetadata: {
              startRowIndex: 0,
              endRowIndex: 0,
              rowCount: 0,
              rows: [],
            },
          });

          currentPageUsedHeight += emptyHeight;
          pageMaxPos = blockEndPos;
          currentDocPos = blockEndPos;
          continue;
        }

        // Tính toán thông tin từng hàng trong bảng
        let rPos = blockPos + 1; // Bắt đầu sau token <table ...>
        const charsPerLine = Math.max(20, Math.floor(currentPage.usableBodyBounds.width / 8.5));
        const baseLineHeightPx = 20;

        interface RowMetaInternal {
          row: JSONContent;
          rowIndex: number;
          from: number;
          to: number;
          size: number;
          height: number;
          isHeader: boolean;
        }

        const rowMetas: RowMetaInternal[] = [];
        let hasSemanticHeader = false;
        const measuredTableH = measuredHeights?.get(blockPos);

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const rSize = getNodeSize(row);
          const isHeader =
            rIdx === 0 &&
            (row.content?.some((c) => c.type === "tableHeader") ||
              row.attrs?.isHeader === true ||
              block.attrs?.headerRow === true);
          if (isHeader) hasSemanticHeader = true;

          const measuredRowH =
            options.measuredTableRowHeights?.get(rPos) ??
            measuredHeights?.get(rPos);

          const estimatedH = estimateTableRowHeight(row, charsPerLine, baseLineHeightPx, block.attrs);
          const rowHeight = measuredRowH ?? estimatedH;

          rowMetas.push({
            row,
            rowIndex: rIdx,
            from: rPos,
            to: rPos + rSize,
            size: rSize,
            height: rowHeight,
            isHeader,
          });

          rPos += rSize;
        }

        // Nếu caller truyền measuredBlockHeights cho tablePos mà không truyền riêng từng row:
        if (
          typeof measuredTableH === "number" &&
          !options.measuredTableRowHeights &&
          rowMetas.length > 0
        ) {
          const sumEstimated = rowMetas.reduce((acc, r) => acc + r.height, 0);
          if (sumEstimated > 0 && Math.abs(sumEstimated - measuredTableH) > 1) {
            const scale = measuredTableH / sumEstimated;
            for (const rm of rowMetas) {
              rm.height = Math.max(10, Math.round(rm.height * scale));
            }
          }
        }

        // Kiểm tra chính sách lặp lại tiêu đề bảng (Repeated Table Header - Phase 8.6)
        const shouldRepeatHeader =
          hasSemanticHeader &&
          block.attrs?.repeatHeader !== false &&
          block.attrs?.repeatHeaderRow !== false &&
          rowMetas[0]?.row?.attrs?.repeatHeader !== false &&
          rowMetas[0]?.row?.attrs?.repeatHeaderRow !== false &&
          rowMetas.length > 1;
        const headerRowMeta = hasSemanticHeader ? rowMetas[0] : null;
        const repeatedHeaderHeight =
          shouldRepeatHeader && headerRowMeta ? headerRowMeta.height : 0;

        // Tính toán các nhóm hàng liên kết bởi rowspan (Phase 8.5 Rowspan Across Page)
        const rowspanGroupMap = computeTableRowspanGroups(rows);

        const firstGroup = rowspanGroupMap.get(0) ?? { startRow: 0, endRow: 0 };
        let firstGroupHeight = 0;
        for (let k = firstGroup.startRow; k <= firstGroup.endRow; k++) {
          firstGroupHeight += rowMetas[k]?.height ?? 0;
        }

        const initialRequiredHeight =
          firstGroup.endRow > 0 ? firstGroupHeight : rowMetas[0].height;

        // Nếu trang hiện tại đã có nội dung và Hàng đầu tiên (hoặc nhóm rowspan đầu tiên) không vừa -> bắt đầu bảng trên trang mới
        let pageCapacity = currentPage.usableBodyBounds.height;
        let availableHeight = pageCapacity - currentPageUsedHeight;

        if (
          currentPageUsedHeight > 0 &&
          initialRequiredHeight > availableHeight &&
          initialRequiredHeight <= pageCapacity
        ) {
          currentPage.docRange = { from: pageMinPos, to: blockPos };
          pages.push(currentPage);

          canvasTopPx += currentPage.heightPx + pageGapPx;

          currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
          currentPageUsedHeight = 0;
          pageMinPos = blockPos;
          pageCapacity = currentPage.usableBodyBounds.height;
          availableHeight = pageCapacity;
        } else if (
          currentPageUsedHeight > 0 &&
          rowMetas[0].height > availableHeight
        ) {
          currentPage.docRange = { from: pageMinPos, to: blockPos };
          pages.push(currentPage);

          canvasTopPx += currentPage.heightPx + pageGapPx;

          currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
          currentPageUsedHeight = 0;
          pageMinPos = blockPos;
          pageCapacity = currentPage.usableBodyBounds.height;
          availableHeight = pageCapacity;
        }

        let currentRowIdx = 0;
        let fragmentStartRowIdx = 0;
        let fragmentRows: TableRowLayoutInfo[] = [];
        let fragmentHeight = 0;
        let isFirstFragment = true;
        let hasRepeatedHeaderOnThisFrag = false;

        while (currentRowIdx < rowMetas.length) {
          const rm = rowMetas[currentRowIdx];
          const isRowOversized = rm.height > pageCapacity;

          // Kiểm tra xem hàng hiện tại có phải là điểm bắt đầu của một nhóm Rowspan đa hàng không (Phase 8.5)
          const group = rowspanGroupMap.get(currentRowIdx) ?? {
            startRow: currentRowIdx,
            endRow: currentRowIdx,
          };
          const isGroupStart = group.endRow > group.startRow && currentRowIdx === group.startRow;

          if (isGroupStart) {
            let groupHeight = 0;
            for (let k = group.startRow; k <= group.endRow; k++) {
              groupHeight += rowMetas[k]?.height ?? 0;
            }

            // Nếu cả nhóm rowspan không vừa phần còn lại của trang hiện tại:
            if (groupHeight > availableHeight) {
              const effectiveNextPageCapacity = shouldRepeatHeader
                ? pageCapacity - repeatedHeaderHeight
                : pageCapacity;

              // Nếu cả nhóm có thể nằm vừa trọn vẹn trên trang mới, và trang hiện tại đã có nội dung:
              if (
                groupHeight <= effectiveNextPageCapacity &&
                (fragmentRows.length > 0 || currentPageUsedHeight > 0)
              ) {
                // Di chuyển TOÀN BỘ nhóm rowspan sang trang mới!
                const fragStartPos = isFirstFragment
                  ? blockPos
                  : rowMetas[fragmentStartRowIdx].from;
                const fragEndPos = rm.from;

                fragments.push({
                  nodeType: "table",
                  blockId: `block-${blockPos}-frag-${fragments.length}`,
                  from: fragStartPos,
                  to: fragEndPos,
                  pageIndex: currentPage.pageIndex,
                  top:
                    currentPage.usableBodyBounds.y +
                    (currentPageUsedHeight - fragmentHeight),
                  height: fragmentHeight,
                  continuedFromPreviousPage: !isFirstFragment,
                  continuesToNextPage: true,
                  tableMetadata: {
                    startRowIndex: fragmentStartRowIdx,
                    endRowIndex: currentRowIdx - 1,
                    rowCount: fragmentRows.length,
                    rows: [...fragmentRows],
                    hasRepeatedHeader: hasRepeatedHeaderOnThisFrag || undefined,
                    repeatedHeaderHeight: hasRepeatedHeaderOnThisFrag
                      ? repeatedHeaderHeight
                      : undefined,
                    repeatedHeaderRowIndex: hasRepeatedHeaderOnThisFrag
                      ? 0
                      : undefined,
                  },
                });

                currentPage.docRange = { from: pageMinPos, to: fragEndPos };
                pages.push(currentPage);
                canvasTopPx += currentPage.heightPx + pageGapPx;

                currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
                currentPageUsedHeight = 0;
                pageMinPos = fragEndPos;
                pageCapacity = currentPage.usableBodyBounds.height;
                availableHeight = pageCapacity;

                fragmentStartRowIdx = currentRowIdx;
                fragmentRows = [];
                fragmentHeight = 0;
                isFirstFragment = false;
                hasRepeatedHeaderOnThisFrag = false;

                // Chuẩn bị repeated header cho trang mới nếu có
                if (shouldRepeatHeader) {
                  if (rm.height <= pageCapacity - repeatedHeaderHeight) {
                    hasRepeatedHeaderOnThisFrag = true;
                    fragmentHeight += repeatedHeaderHeight;
                    currentPageUsedHeight += repeatedHeaderHeight;
                    availableHeight = pageCapacity - currentPageUsedHeight;
                  }
                }

                // Tiếp tục vòng lặp để đặt rm lên trang mới
                continue;
              }
            }
          }

          // TH A: Hàng Oversized (Phase 8.5 Oversized Row)
          if (isRowOversized) {
            // Nếu trang hiện tại đã có các hàng trước đó -> đóng phân mảnh hiện tại và mở trang mới
            if (fragmentRows.length > 0 || currentPageUsedHeight > 0) {
              const fragStartPos = isFirstFragment ? blockPos : rowMetas[fragmentStartRowIdx].from;
              const fragEndPos = rm.from;

              fragments.push({
                nodeType: "table",
                blockId: `block-${blockPos}-frag-${fragments.length}`,
                from: fragStartPos,
                to: fragEndPos,
                pageIndex: currentPage.pageIndex,
                top: currentPage.usableBodyBounds.y + (currentPageUsedHeight - fragmentHeight),
                height: fragmentHeight,
                continuedFromPreviousPage: !isFirstFragment,
                continuesToNextPage: true,
                tableMetadata: {
                  startRowIndex: fragmentStartRowIdx,
                  endRowIndex: currentRowIdx - 1,
                  rowCount: fragmentRows.length,
                  rows: [...fragmentRows],
                  hasRepeatedHeader: hasRepeatedHeaderOnThisFrag || undefined,
                  repeatedHeaderHeight: hasRepeatedHeaderOnThisFrag ? repeatedHeaderHeight : undefined,
                  repeatedHeaderRowIndex: hasRepeatedHeaderOnThisFrag ? 0 : undefined,
                },
              });

              currentPage.docRange = { from: pageMinPos, to: fragEndPos };
              pages.push(currentPage);
              canvasTopPx += currentPage.heightPx + pageGapPx;

              currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
              currentPageUsedHeight = 0;
              pageMinPos = fragEndPos;
              pageCapacity = currentPage.usableBodyBounds.height;
              availableHeight = pageCapacity;

              fragmentStartRowIdx = currentRowIdx;
              fragmentRows = [];
              fragmentHeight = 0;
              isFirstFragment = false;
              hasRepeatedHeaderOnThisFrag = false;
            }

            // Đặt hàng oversized trên trang mới này với controlled overflow (không loop!)
            fragmentRows.push({
              rowIndex: rm.rowIndex,
              from: rm.from,
              to: rm.to,
              height: rm.height,
              pageIndex: currentPage.pageIndex,
              isHeader: rm.isHeader,
              isOversized: true,
            });

            fragmentHeight += rm.height;
            currentPageUsedHeight += rm.height;
            currentRowIdx++;

            // Vì hàng oversized đã tràn trang, nếu còn các hàng tiếp theo, đóng trang này ngay
            if (currentRowIdx < rowMetas.length) {
              const fragStartPos = isFirstFragment ? blockPos : rowMetas[fragmentStartRowIdx].from;
              const nextRowPos = rowMetas[currentRowIdx].from;

              fragments.push({
                nodeType: "table",
                blockId: `block-${blockPos}-frag-${fragments.length}`,
                from: fragStartPos,
                to: nextRowPos,
                pageIndex: currentPage.pageIndex,
                top: currentPage.usableBodyBounds.y,
                height: fragmentHeight,
                continuedFromPreviousPage: !isFirstFragment,
                continuesToNextPage: true,
                isOversized: true,
                tableMetadata: {
                  startRowIndex: fragmentStartRowIdx,
                  endRowIndex: fragmentStartRowIdx,
                  rowCount: 1,
                  rows: [...fragmentRows],
                  hasRepeatedHeader: false,
                },
              });

              currentPage.docRange = { from: pageMinPos, to: nextRowPos };
              pages.push(currentPage);
              canvasTopPx += currentPage.heightPx + pageGapPx;

              currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
              currentPageUsedHeight = 0;
              pageMinPos = nextRowPos;
              pageCapacity = currentPage.usableBodyBounds.height;
              availableHeight = pageCapacity;

              fragmentStartRowIdx = currentRowIdx;
              fragmentRows = [];
              fragmentHeight = 0;
              isFirstFragment = false;
              hasRepeatedHeaderOnThisFrag = false;

              // Chuẩn bị repeated header cho trang sau nếu cần
              if (shouldRepeatHeader) {
                hasRepeatedHeaderOnThisFrag = true;
                fragmentHeight += repeatedHeaderHeight;
                currentPageUsedHeight += repeatedHeaderHeight;
                availableHeight = pageCapacity - currentPageUsedHeight;
              }
            }
            continue;
          }

          // TH B: Hàng bình thường - kiểm tra xem có vừa trang không
          if (rm.height <= availableHeight) {
            fragmentRows.push({
              rowIndex: rm.rowIndex,
              from: rm.from,
              to: rm.to,
              height: rm.height,
              pageIndex: currentPage.pageIndex,
              isHeader: rm.isHeader,
            });

            fragmentHeight += rm.height;
            currentPageUsedHeight += rm.height;
            availableHeight = pageCapacity - currentPageUsedHeight;
            currentRowIdx++;
          } else {
            // Hàng không vừa phần còn lại -> move row sang next page (Phase 8.3 Row-Boundary Pagination)
            if (fragmentRows.length > 0 || currentPageUsedHeight > 0) {
              const fragStartPos = isFirstFragment ? blockPos : rowMetas[fragmentStartRowIdx].from;
              const fragEndPos = rm.from;

              fragments.push({
                nodeType: "table",
                blockId: `block-${blockPos}-frag-${fragments.length}`,
                from: fragStartPos,
                to: fragEndPos,
                pageIndex: currentPage.pageIndex,
                top: currentPage.usableBodyBounds.y + (currentPageUsedHeight - fragmentHeight),
                height: fragmentHeight,
                continuedFromPreviousPage: !isFirstFragment,
                continuesToNextPage: true,
                tableMetadata: {
                  startRowIndex: fragmentStartRowIdx,
                  endRowIndex: currentRowIdx - 1,
                  rowCount: fragmentRows.length,
                  rows: [...fragmentRows],
                  hasRepeatedHeader: hasRepeatedHeaderOnThisFrag || undefined,
                  repeatedHeaderHeight: hasRepeatedHeaderOnThisFrag ? repeatedHeaderHeight : undefined,
                  repeatedHeaderRowIndex: hasRepeatedHeaderOnThisFrag ? 0 : undefined,
                },
              });

              currentPage.docRange = { from: pageMinPos, to: fragEndPos };
              pages.push(currentPage);
              canvasTopPx += currentPage.heightPx + pageGapPx;

              currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
              currentPageUsedHeight = 0;
              pageMinPos = fragEndPos;
              pageCapacity = currentPage.usableBodyBounds.height;
              availableHeight = pageCapacity;

              fragmentStartRowIdx = currentRowIdx;
              fragmentRows = [];
              fragmentHeight = 0;
              isFirstFragment = false;
              hasRepeatedHeaderOnThisFrag = false;

              // Chuẩn bị repeated header cho Page 2+
              if (shouldRepeatHeader) {
                if (rm.height <= pageCapacity - repeatedHeaderHeight) {
                  hasRepeatedHeaderOnThisFrag = true;
                  fragmentHeight += repeatedHeaderHeight;
                  currentPageUsedHeight += repeatedHeaderHeight;
                  availableHeight = pageCapacity - currentPageUsedHeight;
                }
              }
            } else {
              // Trang đang trống hoàn toàn mà 1 row bình thường vẫn không vừa? (fallback an toàn)
              fragmentRows.push({
                rowIndex: rm.rowIndex,
                from: rm.from,
                to: rm.to,
                height: rm.height,
                pageIndex: currentPage.pageIndex,
                isHeader: rm.isHeader,
              });
              fragmentHeight += rm.height;
              currentPageUsedHeight += rm.height;
              availableHeight = pageCapacity - currentPageUsedHeight;
              currentRowIdx++;
            }
          }
        }

        // Finalize phân mảnh cuối cùng của table
        if (fragmentRows.length > 0) {
          const fragStartPos = isFirstFragment ? blockPos : rowMetas[fragmentStartRowIdx].from;
          const isOversized = fragmentRows.some((r) => r.isOversized);

          fragments.push({
            nodeType: "table",
            blockId: `block-${blockPos}-frag-${fragments.length}`,
            from: fragStartPos,
            to: blockEndPos,
            pageIndex: currentPage.pageIndex,
            top: currentPage.usableBodyBounds.y + (currentPageUsedHeight - fragmentHeight),
            height: fragmentHeight,
            continuedFromPreviousPage: !isFirstFragment,
            continuesToNextPage: false,
            isOversized: isOversized || undefined,
            tableMetadata: {
              startRowIndex: fragmentStartRowIdx,
              endRowIndex: rowMetas.length - 1,
              rowCount: fragmentRows.length,
              rows: [...fragmentRows],
              hasRepeatedHeader: hasRepeatedHeaderOnThisFrag || undefined,
              repeatedHeaderHeight: hasRepeatedHeaderOnThisFrag ? repeatedHeaderHeight : undefined,
              repeatedHeaderRowIndex: hasRepeatedHeaderOnThisFrag ? 0 : undefined,
            },
          });
        }

        pageMaxPos = blockEndPos;
        currentDocPos = blockEndPos;
        continue;
      }

      // 5. Xử lý khối nguyên tử (Atomic Blocks: Image, Shape, Equation, TextBox, TOC, Bibliography...)
      const isFloating = block.attrs?.drawingPosition?.placement === "floating";
      const drawingPos: DrawingPosition | undefined = block.attrs?.drawingPosition;

      if (isFloating && drawingPos) {
        const pageContext = {
          pageWidthPx: currentPage.widthPx,
          pageHeightPx: currentPage.heightPx,
          marginsPx: currentPage.marginsPx,
          paragraphTopPx: currentPage.usableBodyBounds.y + currentPageUsedHeight,
          paragraphLeftPx: currentPage.usableBodyBounds.x,
          paragraphWidthPx: currentPage.usableBodyBounds.width,
        };
        const resolvedRect = defaultDrawingPositionService.resolveLayoutPosition(drawingPos, pageContext);

        let inFlowOccupiedHeight = 0;
        if (drawingPos.wrapMode === "topAndBottom") {
          inFlowOccupiedHeight = resolvedRect.height + (drawingPos.distT || 0) + (drawingPos.distB || 0);
        }

        const availableHeightOnPage = currentPage.usableBodyBounds.height - currentPageUsedHeight;
        if (inFlowOccupiedHeight > availableHeightOnPage && currentPageUsedHeight > 0) {
          currentPage.docRange = { from: pageMinPos, to: blockPos };
          pages.push(currentPage);

          canvasTopPx += currentPage.heightPx + pageGapPx;

          currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
          currentPageUsedHeight = 0;
          pageMinPos = blockPos;
        }

        fragments.push({
          nodeType: block.type || "image",
          blockId: `block-${blockPos}`,
          from: blockPos,
          to: blockEndPos,
          pageIndex: currentPage.pageIndex,
          top: resolvedRect.y,
          height: resolvedRect.height,
          continuedFromPreviousPage: false,
          continuesToNextPage: false,
        });

        currentPageUsedHeight += inFlowOccupiedHeight;
        pageMaxPos = blockEndPos;
        currentDocPos = blockEndPos;
        continue;
      }

      const pageCapacity = currentPage.usableBodyBounds.height;
      const availableHeightOnPage = pageCapacity - currentPageUsedHeight;
      const isOversized = blockHeight > pageCapacity;

      if (blockHeight > availableHeightOnPage && currentPageUsedHeight > 0) {
        currentPage.docRange = { from: pageMinPos, to: blockPos };
        pages.push(currentPage);

        canvasTopPx += currentPage.heightPx + pageGapPx;

        currentPage = createPageGeometry(pages.length, sec, canvasTopPx);
        currentPageUsedHeight = 0;
        pageMinPos = blockPos;
      }

      fragments.push({
        nodeType: block.type || "paragraph",
        blockId: `block-${blockPos}`,
        from: blockPos,
        to: blockEndPos,
        pageIndex: currentPage.pageIndex,
        top: currentPage.usableBodyBounds.y + currentPageUsedHeight,
        height: blockHeight,
        continuedFromPreviousPage: false,
        continuesToNextPage: false,
        isOversized: isOversized || undefined,
      });

      currentPageUsedHeight += blockHeight;
      pageMaxPos = blockEndPos;
      currentDocPos = blockEndPos;
    }

    // Nếu section này kết thúc bằng một sectionBreak node (giữa các section trong tài liệu)
    if (sIdx < sections.length - 1) {
      const breakPos = currentDocPos;
      const breakEndPos = breakPos + 1;
      fragments.push({
        nodeType: "sectionBreak",
        blockId: `break-${breakPos}`,
        from: breakPos,
        to: breakEndPos,
        pageIndex: currentPage.pageIndex,
        top: currentPage.usableBodyBounds.y + currentPageUsedHeight,
        height: 36,
        continuedFromPreviousPage: false,
        continuesToNextPage: false,
      });

      currentPageUsedHeight += 36;
      pageMaxPos = breakEndPos;
      currentDocPos = breakEndPos;
    }

    // Đóng trang cuối cùng của section
    currentPage.docRange = { from: pageMinPos, to: pageMaxPos };
    pages.push(currentPage);
    canvasTopPx += currentPage.heightPx + pageGapPx;
  }

  // Đảm bảo tối thiểu 1 trang
  if (pages.length === 0) {
    const fallbackSec = sections[0] || {
      index: 1,
      id: "sec-1",
      pageSettings: defaultPageSettings,
    };
    const p0 = createPageGeometry(0, fallbackSec as SectionModel, 0);
    p0.docRange = { from: 0, to: Math.max(2, currentDocPos) };
    pages.push(p0);
  }

  return new PageLayoutMap(pages, fragments, isRealDom);
}
