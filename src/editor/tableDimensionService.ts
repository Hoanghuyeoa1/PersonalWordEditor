import type { Editor } from "@tiptap/core";
import { TableMap, CellSelection } from "@tiptap/pm/tables";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { findActiveTable, ensureEditorPlugins } from "./tableSizingService.ts";
import { reflowManager } from "../page/services/reflowManager.ts";

/**
 * ============================================================================
 * TABLE DIMENSION CONTROLS (PHASE 5)
 * ============================================================================
 * Cung cấp các công cụ semantic và deterministic cho:
 * 1. Cell Margins (Lề ô bảng): Top, Right, Bottom, Left (table default + cell override)
 * 2. Unit Conversions & Validation: pt <-> px, mm <-> px, bảo vệ không tạo negative content width
 * 3. Row Height Model: auto, atLeast, exact (bảo toàn dữ liệu người dùng, không silently truncate)
 * 4. Distribute Columns: Phân bổ độ rộng cột đồng đều (hỗ trợ selected columns / toàn bộ bảng)
 * 5. Distribute Rows: Phân bổ chiều cao hàng đồng đều với chính sách an toàn không ép thấp hơn content
 * 6. Reflow Invalidation: Đồng bộ trực tiếp với Page Engine (Pagination Engine 2.0)
 */

export interface CellMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_TABLE_CELL_MARGINS: CellMargins = {
  top: 6,
  right: 8,
  bottom: 6,
  left: 8,
};

export const MIN_CELL_CONTENT_WIDTH_PX = 10;
export const MAX_SAFE_CELL_MARGIN_PX = 200;

export type RowHeightRule = "auto" | "atLeast" | "exact";

export interface RowHeightSettings {
  height: number | null;
  rule: RowHeightRule;
}

export const DEFAULT_ROW_HEIGHT_SETTINGS: RowHeightSettings = {
  height: null,
  rule: "auto",
};

export const MIN_ROW_HEIGHT_PX = 10;
export const MAX_SAFE_ROW_HEIGHT_PX = 1200;

// Centralized Unit Conversion (96 DPI, 72 pt/inch, 25.4 mm/inch)
export const PT_TO_PX = 96 / 72; // 1.3333333333333333
export const MM_TO_PX = 96 / 25.4; // 3.7795275590551185

export function ptToPx(pt: number): number {
  if (!Number.isFinite(pt)) return 0;
  return Math.round(pt * PT_TO_PX * 100) / 100;
}

export function pxToPt(px: number): number {
  if (!Number.isFinite(px)) return 0;
  return Math.round((px / PT_TO_PX) * 100) / 100;
}

export function mmToPxUnit(mm: number): number {
  if (!Number.isFinite(mm)) return 0;
  return Math.round(mm * MM_TO_PX * 100) / 100;
}

export function pxToMmUnit(px: number): number {
  if (!Number.isFinite(px)) return 0;
  return Math.round((px / MM_TO_PX) * 100) / 100;
}

/**
 * Kiểm tra và chuẩn hóa Cell Margins:
 * - Giá trị phải hữu hạn (finite), >= 0.
 * - Không cho giá trị âm hoặc vượt ngưỡng an toàn.
 * - Đảm bảo lề trái + phải không ép content width thành số âm (>= MIN_CELL_CONTENT_WIDTH_PX).
 */
export function validateAndNormalizeCellMargins(
  margins: Partial<CellMargins> | null | undefined,
  maxAvailableWidth?: number
): CellMargins {
  const result: CellMargins = { ...DEFAULT_TABLE_CELL_MARGINS };
  if (!margins || typeof margins !== "object") {
    return result;
  }

  const sanitizeVal = (val: any, fallback: number): number => {
    if (typeof val === "string") val = parseFloat(val);
    if (typeof val !== "number" || !Number.isFinite(val) || isNaN(val)) {
      return fallback;
    }
    return Math.max(0, Math.min(MAX_SAFE_CELL_MARGIN_PX, Math.round(val)));
  };

  result.top = sanitizeVal(margins.top, DEFAULT_TABLE_CELL_MARGINS.top);
  result.right = sanitizeVal(margins.right, DEFAULT_TABLE_CELL_MARGINS.right);
  result.bottom = sanitizeVal(margins.bottom, DEFAULT_TABLE_CELL_MARGINS.bottom);
  result.left = sanitizeVal(margins.left, DEFAULT_TABLE_CELL_MARGINS.left);

  // Guard: Không tạo negative content width khi maxAvailableWidth được xác định
  if (typeof maxAvailableWidth === "number" && maxAvailableWidth > 0) {
    const maxTotalHoriz = Math.max(0, maxAvailableWidth - MIN_CELL_CONTENT_WIDTH_PX);
    if (result.left + result.right > maxTotalHoriz) {
      const sum = result.left + result.right;
      if (sum > 0) {
        const scale = maxTotalHoriz / sum;
        result.left = Math.floor(result.left * scale);
        result.right = Math.floor(result.right * scale);
      } else {
        result.left = 0;
        result.right = 0;
      }
    }
  }

  return result;
}

/**
 * Kiểm tra và chuẩn hóa Row Height:
 * - Quy tắc hợp lệ: "auto", "atLeast", "exact".
 * - Chiều cao hữu hạn, >= MIN_ROW_HEIGHT_PX.
 */
export function validateAndNormalizeRowHeight(
  height: number | null | undefined,
  rule: RowHeightRule = "auto"
): RowHeightSettings {
  const validRule: RowHeightRule =
    rule === "atLeast" || rule === "exact" ? rule : "auto";

  if (validRule === "auto") {
    return { height: null, rule: "auto" };
  }

  let h = typeof height === "string" ? parseFloat(height) : height;
  if (typeof h !== "number" || !Number.isFinite(h) || isNaN(h)) {
    return { height: null, rule: "auto" };
  }

  h = Math.max(MIN_ROW_HEIGHT_PX, Math.min(MAX_SAFE_ROW_HEIGHT_PX, Math.round(h)));
  return { height: h, rule: validRule };
}

/**
 * Lấy margin hiệu lực của ô:
 * Ưu tiên cell override; nếu không có thì kế thừa table default; nếu không có thì lấy DEFAULT_TABLE_CELL_MARGINS.
 */
export function getEffectiveCellMargins(
  tableAttrs?: Record<string, any> | null,
  cellAttrs?: Record<string, any> | null
): CellMargins {
  if (cellAttrs?.cellMargins && typeof cellAttrs.cellMargins === "object") {
    return validateAndNormalizeCellMargins(cellAttrs.cellMargins);
  }
  if (tableAttrs?.cellMargins && typeof tableAttrs.cellMargins === "object") {
    return validateAndNormalizeCellMargins(tableAttrs.cellMargins);
  }
  return { ...DEFAULT_TABLE_CELL_MARGINS };
}

/**
 * Thông báo cho Page Engine rằng kích thước bảng đã thay đổi (Reflow Invalidation)
 */
export function notifyTableDimensionsChanged(tablePos: number): void {
  try {
    reflowManager.invalidateFrom(tablePos);
    reflowManager.markDirty({
      fromPos: tablePos,
      scope: "block",
      reason: "table-dimension-change",
    });
  } catch {
    // Không làm gián đoạn transaction nếu reflowManager chạy trong mock test
  }
}

/**
 * COMMAND: Thiết lập Cell Margins mặc định cho toàn bảng (Table Default)
 */
export function setTableCellMargins(
  editor: Editor | null,
  margins: Partial<CellMargins>,
  options?: { tablePos?: number }
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const active = findActiveTable(editor);
  const targetPos = typeof options?.tablePos === "number" ? options.tablePos : active?.tablePos;
  if (typeof targetPos !== "number" || targetPos < 0) return false;

  const tableNode = editor.state.doc.nodeAt(targetPos);
  if (!tableNode || tableNode.type.name !== "table") return false;

  const normalized = validateAndNormalizeCellMargins(margins);
  const tr = editor.state.tr;
  tr.setNodeMarkup(targetPos, undefined, {
    ...tableNode.attrs,
    cellMargins: normalized,
  });

  notifyTableDimensionsChanged(targetPos);
  editor.view.dispatch(tr);
  return true;
}

/**
 * COMMAND: Thiết lập Cell Margin Override cho ô đang chọn (hoặc xóa override)
 */
export function setCellMarginOverride(
  editor: Editor | null,
  margins: Partial<CellMargins> | null,
  options?: { clearOverride?: boolean }
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const active = findActiveTable(editor);
  if (!active) return false;

  const { tablePos, tableNode } = active;
  const selection = editor.state.selection;
  const tr = editor.state.tr;
  let modified = false;

  const normalized =
    options?.clearOverride || margins === null
      ? null
      : validateAndNormalizeCellMargins(margins);

  if (selection instanceof CellSelection) {
    selection.forEachCell((cell, pos) => {
      tr.setNodeMarkup(pos, undefined, {
        ...cell.attrs,
        cellMargins: normalized,
      });
      modified = true;
    });
  } else {
    // Tìm ô hiện tại chứa con trỏ
    let activeCellPos: number | null = null;
    let activeCellNode: ProsemirrorNode | null = null;

    editor.state.doc.nodesBetween(
      tablePos,
      tablePos + tableNode.nodeSize,
      (node, pos) => {
        if (
          (node.type.name === "tableCell" || node.type.name === "tableHeader") &&
          selection.from >= pos &&
          selection.to <= pos + node.nodeSize
        ) {
          activeCellPos = pos;
          activeCellNode = node;
          return false;
        }
      }
    );

    if (activeCellPos !== null && activeCellNode !== null) {
      tr.setNodeMarkup(activeCellPos, undefined, {
        ...(activeCellNode as ProsemirrorNode).attrs,
        cellMargins: normalized,
      });
      modified = true;
    }
  }

  if (modified) {
    notifyTableDimensionsChanged(tablePos);
    editor.view.dispatch(tr);
    return true;
  }

  return false;
}

/**
 * COMMAND: Thiết lập Row Height & Rule cho hàng (hoặc các hàng được chọn)
 */
export function setTableRowHeight(
  editor: Editor | null,
  height: number | null | undefined,
  rule: RowHeightRule = "auto",
  options?: { rowIndex?: number }
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const active = findActiveTable(editor);
  if (!active) return false;

  const { tablePos, tableNode } = active;
  const map = TableMap.get(tableNode);
  const selection = editor.state.selection;
  const normalized = validateAndNormalizeRowHeight(height, rule);

  // Xác định các hàng cần áp dụng
  const targetRowIndices = new Set<number>();

  if (typeof options?.rowIndex === "number" && options.rowIndex >= 0 && options.rowIndex < map.height) {
    targetRowIndices.add(options.rowIndex);
  } else if (selection instanceof CellSelection) {
    const rect = selection.$anchorCell ? map.findCell(selection.$anchorCell.pos - tablePos - 1) : null;
    const headRect = selection.$headCell ? map.findCell(selection.$headCell.pos - tablePos - 1) : null;
    if (rect && headRect) {
      const top = Math.min(rect.top, headRect.top);
      const bottom = Math.max(rect.bottom, headRect.bottom);
      for (let r = top; r < bottom; r++) {
        targetRowIndices.add(r);
      }
    }
  }

  // Nếu không có selection dạng CellSelection, tìm hàng chứa con trỏ
  if (targetRowIndices.size === 0) {
    let currentRowIdx = 0;
    tableNode.forEach((rowNode, _offset, index) => {
      if (rowNode.type.name === "tableRow") {
        // tính toán vị trí bắt đầu và kết thúc của row trong document
        let rPos = tablePos + 1;
        for (let i = 0; i < index; i++) {
          rPos += tableNode.child(i).nodeSize;
        }
        if (selection.from >= rPos && selection.to <= rPos + rowNode.nodeSize) {
          targetRowIndices.add(currentRowIdx);
        }
        currentRowIdx++;
      }
    });
  }

  if (targetRowIndices.size === 0) {
    // Mặc định áp dụng cho hàng đầu tiên nếu không xác định được
    targetRowIndices.add(0);
  }

  const tr = editor.state.tr;
  let currentRowIdx = 0;
  let offset = tablePos + 1;

  for (let i = 0; i < tableNode.childCount; i++) {
    const rowNode = tableNode.child(i);
    if (rowNode.type.name === "tableRow") {
      if (targetRowIndices.has(currentRowIdx)) {
        tr.setNodeMarkup(offset, undefined, {
          ...rowNode.attrs,
          rowHeight: normalized.height,
          rowHeightRule: normalized.rule,
        });
      }
      currentRowIdx++;
    }
    offset += rowNode.nodeSize;
  }

  notifyTableDimensionsChanged(tablePos);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Lấy thông tin chiều cao hàng hiện tại
 */
export function getTableRowHeight(
  editor: Editor | null,
  rowIndex?: number
): RowHeightSettings {
  if (!editor || !editor.state) return { ...DEFAULT_ROW_HEIGHT_SETTINGS };
  const active = findActiveTable(editor);
  if (!active) return { ...DEFAULT_ROW_HEIGHT_SETTINGS };

  const { tableNode, tablePos } = active;
  let targetRowIdx = rowIndex;

  if (typeof targetRowIdx !== "number") {
    const selection = editor.state.selection;
    let rIdx = 0;
    let rPos = tablePos + 1;
    for (let i = 0; i < tableNode.childCount; i++) {
      const child = tableNode.child(i);
      if (child.type.name === "tableRow") {
        if (selection.from >= rPos && selection.to <= rPos + child.nodeSize) {
          targetRowIdx = rIdx;
          break;
        }
        rIdx++;
      }
      rPos += child.nodeSize;
    }
  }

  if (typeof targetRowIdx !== "number") {
    targetRowIdx = 0;
  }

  let currentRowIdx = 0;
  for (let i = 0; i < tableNode.childCount; i++) {
    const child = tableNode.child(i);
    if (child.type.name === "tableRow") {
      if (currentRowIdx === targetRowIdx) {
        return {
          height: child.attrs.rowHeight ?? null,
          rule: child.attrs.rowHeightRule ?? "auto",
        };
      }
      currentRowIdx++;
    }
  }

  return { ...DEFAULT_ROW_HEIGHT_SETTINGS };
}

/**
 * COMMAND: Distribute Columns (Phân phối độ rộng các cột đều nhau)
 * - Nếu người dùng chọn một nhóm cột (CellSelection): phân phối đều các cột được chọn.
 * - Nếu không chọn nhóm cột cụ thể: phân phối đều toàn bộ các cột trong bảng.
 * - Đặt layoutMode của bảng thành "fixed".
 */
export function distributeTableColumns(
  editor: Editor | null,
  options?: { selectedOnly?: boolean }
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const active = findActiveTable(editor);
  if (!active) return false;

  const { tablePos, tableNode } = active;
  const map = TableMap.get(tableNode);
  const colCount = map.width;
  if (colCount <= 1) return false;

  const selection = editor.state.selection;
  let startCol = 0;
  let endCol = colCount; // exclusive

  if (options?.selectedOnly !== false && selection instanceof CellSelection) {
    const anchorMap = selection.$anchorCell ? map.findCell(selection.$anchorCell.pos - tablePos - 1) : null;
    const headMap = selection.$headCell ? map.findCell(selection.$headCell.pos - tablePos - 1) : null;
    if (anchorMap && headMap) {
      const left = Math.min(anchorMap.left, headMap.left);
      const right = Math.max(anchorMap.right, headMap.right);
      if (right - left < colCount && right > left) {
        startCol = left;
        endCol = right;
      }
    }
  }

  // Thu thập độ rộng cột hiện tại của toàn bộ bảng
  const colWidths: number[] = new Array(colCount).fill(0);

  // Lấy mẫu colwidth từ các cell
  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      const cellPos = map.map[r * map.width + c];
      const cell = tableNode.nodeAt(cellPos);
      if (cell?.attrs?.colwidth && Array.isArray(cell.attrs.colwidth)) {
        const span = cell.attrs.colspan || 1;
        if (span === 1 && cell.attrs.colwidth[0] > 0 && colWidths[c] === 0) {
          colWidths[c] = cell.attrs.colwidth[0];
        }
      }
    }
  }

  // Nếu cột nào chưa có độ rộng, gán mặc định 100px
  for (let c = 0; c < colCount; c++) {
    if (colWidths[c] <= 0) {
      colWidths[c] = 100;
    }
  }

  // Tính tổng độ rộng của vùng cột cần phân phối
  let totalDistributedWidth = 0;
  for (let c = startCol; c < endCol; c++) {
    totalDistributedWidth += colWidths[c];
  }

  const numColsToDistribute = endCol - startCol;
  const baseColWidth = Math.floor(totalDistributedWidth / numColsToDistribute);
  const remainder = totalDistributedWidth - baseColWidth * numColsToDistribute;

  // Gán độ rộng đều cho các cột trong phạm vi
  for (let c = startCol; c < endCol; c++) {
    colWidths[c] = baseColWidth;
  }
  // Thêm phần dư vào cột cuối cùng trong vùng phân phối
  colWidths[endCol - 1] += remainder;

  // Cập nhật lại colwidth cho tất cả các cells trong bảng
  const tr = editor.state.tr;

  for (let r = 0; r < map.height; r++) {
    const seenCellPositions = new Set<number>();
    for (let c = 0; c < map.width; c++) {
      const cellPos = map.map[r * map.width + c];
      if (seenCellPositions.has(cellPos)) continue;
      seenCellPositions.add(cellPos);

      const cell = tableNode.nodeAt(cellPos);
      if (!cell) continue;

      const colspan = cell.attrs.colspan || 1;
      const cellColWidths: number[] = [];
      for (let spanIdx = 0; spanIdx < colspan; spanIdx++) {
        cellColWidths.push(colWidths[c + spanIdx] || baseColWidth);
      }

      tr.setNodeMarkup(tablePos + 1 + cellPos, undefined, {
        ...cell.attrs,
        colwidth: cellColWidths,
      });
    }
  }

  // Đổi layoutMode thành fixed
  tr.setNodeMarkup(tablePos, undefined, {
    ...tableNode.attrs,
    layoutMode: "fixed",
  });

  notifyTableDimensionsChanged(tablePos);
  editor.view.dispatch(tr);
  return true;
}

/**
 * COMMAND: Distribute Rows (Phân phối chiều cao các hàng đều nhau)
 * - Deterministic policy:
 *   1. Không ép hàng thấp hơn required content height của hàng đó.
 *   2. Đặt rowHeightRule thành "atLeast" để hàng chứa nội dung dài tự động nở rộng.
 *   3. Hỗ trợ phân phối các hàng được chọn hoặc toàn bộ bảng.
 */
export function distributeTableRows(
  editor: Editor | null,
  options?: { selectedOnly?: boolean; minRowHeight?: number }
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const active = findActiveTable(editor);
  if (!active) return false;

  const { tablePos, tableNode } = active;
  const map = TableMap.get(tableNode);
  const rowCount = map.height;
  if (rowCount <= 1) return false;

  const selection = editor.state.selection;
  let startRow = 0;
  let endRow = rowCount; // exclusive

  if (options?.selectedOnly !== false && selection instanceof CellSelection) {
    const anchorMap = selection.$anchorCell ? map.findCell(selection.$anchorCell.pos - tablePos - 1) : null;
    const headMap = selection.$headCell ? map.findCell(selection.$headCell.pos - tablePos - 1) : null;
    if (anchorMap && headMap) {
      const top = Math.min(anchorMap.top, headMap.top);
      const bottom = Math.max(anchorMap.bottom, headMap.bottom);
      if (bottom - top < rowCount && bottom > top) {
        startRow = top;
        endRow = bottom;
      }
    }
  }

  // Ước tính hoặc lấy chiều cao hiện tại của từng hàng
  const rowHeights: number[] = [];
  const minConfiguredHeight = options?.minRowHeight || 28;

  for (let i = 0; i < tableNode.childCount; i++) {
    const rowNode = tableNode.child(i);
    if (rowNode.type.name === "tableRow") {
      const existingH = typeof rowNode.attrs.rowHeight === "number" ? rowNode.attrs.rowHeight : 34;
      rowHeights.push(Math.max(minConfiguredHeight, existingH));
    }
  }

  // Tính tổng chiều cao của nhóm hàng cần phân phối
  let totalDistributedHeight = 0;
  for (let r = startRow; r < endRow; r++) {
    totalDistributedHeight += rowHeights[r];
  }

  const numRowsToDistribute = endRow - startRow;
  const targetAverageHeight = Math.max(
    minConfiguredHeight,
    Math.round(totalDistributedHeight / numRowsToDistribute)
  );

  const tr = editor.state.tr;
  let offset = tablePos + 1;
  let rIdx = 0;

  for (let i = 0; i < tableNode.childCount; i++) {
    const rowNode = tableNode.child(i);
    if (rowNode.type.name === "tableRow") {
      if (rIdx >= startRow && rIdx < endRow) {
        // Áp dụng chính sách atLeast với targetAverageHeight:
        // Hàng nào content nhỏ hơn targetAverageHeight sẽ nhận đúng targetAverageHeight.
        // Hàng nào content lớn hơn targetAverageHeight sẽ tự động mở rộng theo nội dung.
        tr.setNodeMarkup(offset, undefined, {
          ...rowNode.attrs,
          rowHeight: targetAverageHeight,
          rowHeightRule: "atLeast",
        });
      }
      rIdx++;
    }
    offset += rowNode.nodeSize;
  }

  notifyTableDimensionsChanged(tablePos);
  editor.view.dispatch(tr);
  return true;
}
