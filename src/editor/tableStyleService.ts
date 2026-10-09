import type { Editor } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { findActiveTable, ensureEditorPlugins } from "./tableSizingService.ts";
import { notifyTableDimensionsChanged, type CellMargins, DEFAULT_TABLE_CELL_MARGINS } from "./tableDimensionService.ts";
import type { TableBorderStyle, CellTextAlign } from "./tableExtensions.ts";

/**
 * ============================================================================
 * TABLE STYLES ENGINE (PHASE 6)
 * ============================================================================
 * Cung cấp hệ thống Semantic Table Styles gọn nhẹ:
 * 1. Model: Table, Header Row, Body Cell, Banded Rows, Banded Columns, First Column, Last Column
 * 2. 5 Built-in Presets: Plain, Grid, Light Grid, Medium Accent, Academic
 * 3. 4-Tier Precedence: Table Style -> Table direct -> Row/Cell direct -> Text marks
 * 4. Preservation: Không xóa/ghi đè paragraph styles, direct user formatting hay table ID/anchor
 * 5. Single atomic transaction cho apply style và style options
 */

export type TableStyleId =
  | "plain"
  | "grid"
  | "light-grid"
  | "medium-accent"
  | "academic"
  | string;

export interface TableStyleOptions {
  headerRow?: boolean;
  bandedRows?: boolean;
  firstColumn?: boolean;
  lastColumn?: boolean;
  bandedColumns?: boolean;
}

export const DEFAULT_TABLE_STYLE_OPTIONS: Required<TableStyleOptions> = {
  headerRow: true,
  bandedRows: true,
  firstColumn: false,
  lastColumn: false,
  bandedColumns: false,
};

export interface TablePartStyle {
  backgroundColor?: string | null;
  textColor?: string | null;
  fontWeight?: string | null;
  textAlign?: CellTextAlign | null;
  borderTop?: string | null;
  borderBottom?: string | null;
  borderLeft?: string | null;
  borderRight?: string | null;
}

export interface TableStyleDefinition {
  id: TableStyleId;
  name: string;
  description?: string;
  borders: TableBorderStyle;
  borderColor: string;
  cellMargins: CellMargins;
  table?: TablePartStyle;
  headerRow?: TablePartStyle;
  bodyCell?: TablePartStyle;
  bandedRows?: {
    enabled: boolean;
    evenBackgroundColor?: string | null;
    oddBackgroundColor?: string | null;
  };
  bandedColumns?: {
    enabled: boolean;
    evenBackgroundColor?: string | null;
    oddBackgroundColor?: string | null;
  };
  firstColumn?: TablePartStyle;
  lastColumn?: TablePartStyle;
}

export interface ResolvedCellPresentation {
  backgroundColor: string | null;
  textColor: string | null;
  fontWeight: string | null;
  textAlign: CellTextAlign | null;
  borders: TableBorderStyle;
  borderBottom: string | null;
  cellMargins: CellMargins;
  isDirectOverride: {
    backgroundColor: boolean;
    textAlign: boolean;
    cellMargins: boolean;
  };
}

// ----------------------------------------------------------------------------
// 5 BUILT-IN PRESETS
// ----------------------------------------------------------------------------

export const PLAIN_TABLE_STYLE: TableStyleDefinition = {
  id: "plain",
  name: "Plain Table",
  description: "Bảng đơn giản không đường viền hoặc kẻ phân cách tối giản",
  borders: "none",
  borderColor: "#cbd5e1",
  cellMargins: { top: 6, right: 8, bottom: 6, left: 8 },
  headerRow: {
    backgroundColor: null,
    textColor: "#0f172a",
    fontWeight: "600",
    borderBottom: "1px solid #cbd5e1",
    textAlign: "left",
  },
  bodyCell: {
    backgroundColor: null,
    textColor: "#334155",
    fontWeight: "normal",
    textAlign: "left",
  },
  bandedRows: {
    enabled: false,
  },
};

export const GRID_TABLE_STYLE: TableStyleDefinition = {
  id: "grid",
  name: "Table Grid",
  description: "Bảng lưới tiêu chuẩn với tiêu đề tô nền nhẹ và viền đầy đủ",
  borders: "all",
  borderColor: "#cbd5e1",
  cellMargins: { top: 6, right: 8, bottom: 6, left: 8 },
  headerRow: {
    backgroundColor: "#f1f5f9",
    textColor: "#1e293b",
    fontWeight: "600",
    borderBottom: "2px solid #94a3b8",
    textAlign: "left",
  },
  bodyCell: {
    backgroundColor: null,
    textColor: "#334155",
    fontWeight: "normal",
    textAlign: "left",
  },
  bandedRows: {
    enabled: false,
  },
};

export const LIGHT_GRID_TABLE_STYLE: TableStyleDefinition = {
  id: "light-grid",
  name: "Light Grid",
  description: "Bảng lưới mềm mại với hàng xen kẽ (banded rows)",
  borders: "all",
  borderColor: "#e2e8f0",
  cellMargins: { top: 6, right: 8, bottom: 6, left: 8 },
  headerRow: {
    backgroundColor: "#f8fafc",
    textColor: "#1e293b",
    fontWeight: "600",
    borderBottom: "1.5px solid #cbd5e1",
    textAlign: "left",
  },
  bodyCell: {
    backgroundColor: null,
    textColor: "#334155",
    fontWeight: "normal",
    textAlign: "left",
  },
  bandedRows: {
    enabled: true,
    evenBackgroundColor: "#f8fafc",
    oddBackgroundColor: null,
  },
};

export const MEDIUM_ACCENT_TABLE_STYLE: TableStyleDefinition = {
  id: "medium-accent",
  name: "Medium Accent",
  description: "Bảng điểm nhấn nổi bật với tiêu đề xanh đậm và hàng so le dịu mắt",
  borders: "outside",
  borderColor: "#2563eb",
  cellMargins: { top: 8, right: 10, bottom: 8, left: 10 },
  headerRow: {
    backgroundColor: "#2563eb",
    textColor: "#ffffff",
    fontWeight: "600",
    borderBottom: "2px solid #1d4ed8",
    textAlign: "left",
  },
  bodyCell: {
    backgroundColor: null,
    textColor: "#1e293b",
    fontWeight: "normal",
    textAlign: "left",
  },
  bandedRows: {
    enabled: true,
    evenBackgroundColor: "#eff6ff",
    oddBackgroundColor: null,
  },
};

export const ACADEMIC_TABLE_STYLE: TableStyleDefinition = {
  id: "academic",
  name: "Academic (APA)",
  description: "Phong cách chuẩn học thuật APA: không viền dọc, đường kẻ ngang đậm ở tiêu đề và đáy",
  borders: "none",
  borderColor: "#0f172a",
  cellMargins: { top: 8, right: 12, bottom: 8, left: 12 },
  headerRow: {
    backgroundColor: null,
    textColor: "#0f172a",
    fontWeight: "600",
    borderTop: "2px solid #0f172a",
    borderBottom: "1px solid #0f172a",
    textAlign: "left",
  },
  bodyCell: {
    backgroundColor: null,
    textColor: "#0f172a",
    fontWeight: "normal",
    textAlign: "left",
  },
  bandedRows: {
    enabled: false,
  },
};

export const BUILT_IN_TABLE_STYLES: Record<string, TableStyleDefinition> = {
  plain: PLAIN_TABLE_STYLE,
  grid: GRID_TABLE_STYLE,
  "light-grid": LIGHT_GRID_TABLE_STYLE,
  "medium-accent": MEDIUM_ACCENT_TABLE_STYLE,
  academic: ACADEMIC_TABLE_STYLE,
};

const tableStyleRegistry = new Map<string, TableStyleDefinition>(
  Object.entries(BUILT_IN_TABLE_STYLES)
);

export function registerTableStyle(style: TableStyleDefinition): void {
  tableStyleRegistry.set(style.id, style);
}

export function getTableStyle(styleId: string): TableStyleDefinition {
  return tableStyleRegistry.get(styleId) || GRID_TABLE_STYLE;
}

export function getAllTableStyles(): TableStyleDefinition[] {
  return Array.from(tableStyleRegistry.values());
}

/**
 * Tính toán Resolved Presentation của một Cell theo thứ bậc 4 cấp (4-Tier Precedence):
 * 1. Direct text formatting (bold, color mark trong run)
 * 2. Direct cell formatting (cellNode.attrs: backgroundColor, textAlign, cellMargins)
 * 3. Table direct formatting (tableNode.attrs: borders, cellMargins)
 * 4. Table Style (headerRow, bodyCell, bandedRows, firstColumn, lastColumn)
 */
export function resolveCellPresentation(
  tableNode: ProsemirrorNode,
  rowIndex: number,
  colIndex: number,
  cellNode: ProsemirrorNode,
  isLastRow = false,
  totalCols = 1
): ResolvedCellPresentation {
  const styleId = (tableNode.attrs.tableStyleId as string) || "grid";
  const styleDef = getTableStyle(styleId);

  const opts: Required<TableStyleOptions> = {
    ...DEFAULT_TABLE_STYLE_OPTIONS,
    ...(tableNode.attrs.tableStyleOptions || {}),
  };

  const isHeaderCell = cellNode.type.name === "tableHeader" || (rowIndex === 0 && opts.headerRow);
  const isFirstCol = opts.firstColumn && colIndex === 0 && !isHeaderCell;
  const isLastCol = opts.lastColumn && colIndex === totalCols - 1 && !isHeaderCell;
  const isBandedRow =
    opts.bandedRows &&
    styleDef.bandedRows?.enabled &&
    !isHeaderCell &&
    rowIndex % 2 === 1;

  // 1. Background Color
  let resolvedBg: string | null = null;
  let isDirectBg = false;

  if (cellNode.attrs.backgroundColor) {
    resolvedBg = cellNode.attrs.backgroundColor;
    isDirectBg = true;
  } else if (isHeaderCell && styleDef.headerRow?.backgroundColor) {
    resolvedBg = styleDef.headerRow.backgroundColor;
  } else if (isFirstCol && styleDef.firstColumn?.backgroundColor) {
    resolvedBg = styleDef.firstColumn.backgroundColor;
  } else if (isLastCol && styleDef.lastColumn?.backgroundColor) {
    resolvedBg = styleDef.lastColumn.backgroundColor;
  } else if (isBandedRow && styleDef.bandedRows?.evenBackgroundColor) {
    resolvedBg = styleDef.bandedRows.evenBackgroundColor;
  } else if (styleDef.bodyCell?.backgroundColor) {
    resolvedBg = styleDef.bodyCell.backgroundColor;
  }

  // 2. Text Color
  let resolvedColor = styleDef.bodyCell?.textColor || "#334155";
  if (isHeaderCell && styleDef.headerRow?.textColor) {
    resolvedColor = styleDef.headerRow.textColor;
  } else if (isFirstCol && styleDef.firstColumn?.textColor) {
    resolvedColor = styleDef.firstColumn.textColor;
  }

  // 3. Font Weight
  let resolvedFontWeight = "normal";
  if (isHeaderCell) {
    resolvedFontWeight = styleDef.headerRow?.fontWeight || "600";
  } else if (isFirstCol && styleDef.firstColumn?.fontWeight) {
    resolvedFontWeight = styleDef.firstColumn.fontWeight;
  }

  // 4. Text Alignment
  let resolvedAlign: CellTextAlign | null = null;
  let isDirectAlign = false;
  if (cellNode.attrs.textAlign) {
    resolvedAlign = cellNode.attrs.textAlign;
    isDirectAlign = true;
  } else if (isHeaderCell && styleDef.headerRow?.textAlign) {
    resolvedAlign = styleDef.headerRow.textAlign;
  } else if (styleDef.bodyCell?.textAlign) {
    resolvedAlign = styleDef.bodyCell.textAlign;
  }

  // 5. Borders & BorderBottom
  const resolvedBorders = (tableNode.attrs.borders as TableBorderStyle) || styleDef.borders;
  let resolvedBorderBottom: string | null = null;

  if (isHeaderCell && styleDef.headerRow?.borderBottom) {
    resolvedBorderBottom = styleDef.headerRow.borderBottom;
  } else if (styleId === "academic" && isLastRow) {
    resolvedBorderBottom = "2px solid #0f172a";
  }

  // 6. Cell Margins (Padding)
  let resolvedMargins = { ...DEFAULT_TABLE_CELL_MARGINS };
  let isDirectMargins = false;

  if (cellNode.attrs.cellMargins) {
    resolvedMargins = { ...cellNode.attrs.cellMargins };
    isDirectMargins = true;
  } else if (tableNode.attrs.cellMargins) {
    resolvedMargins = { ...tableNode.attrs.cellMargins };
  } else if (styleDef.cellMargins) {
    resolvedMargins = { ...styleDef.cellMargins };
  }

  return {
    backgroundColor: resolvedBg,
    textColor: resolvedColor,
    fontWeight: resolvedFontWeight,
    textAlign: resolvedAlign,
    borders: resolvedBorders,
    borderBottom: resolvedBorderBottom,
    cellMargins: resolvedMargins,
    isDirectOverride: {
      backgroundColor: isDirectBg,
      textAlign: isDirectAlign,
      cellMargins: isDirectMargins,
    },
  };
}

/**
 * COMMAND: Áp dụng Table Style cho bảng đang chọn
 * - Giữ nguyên 100% ID bảng, objectAnchor, caption link, targetId
 * - Giữ nguyên 100% paragraph styles và character marks bên trong cells
 * - Bảo toàn các ô có định dạng thủ công (direct formatting)
 * - Thực thi trong ĐÚNG 1 atomic transaction
 */
export function applyTableStyle(
  editor: Editor | null,
  styleId: TableStyleId,
  options?: TableStyleOptions
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const active = findActiveTable(editor);
  if (!active) return false;

  const { tablePos, tableNode } = active;
  const styleDef = getTableStyle(styleId);

  const currentOptions = tableNode.attrs.tableStyleOptions || DEFAULT_TABLE_STYLE_OPTIONS;
  const newOptions: Required<TableStyleOptions> = {
    ...DEFAULT_TABLE_STYLE_OPTIONS,
    ...currentOptions,
    ...(options || {}),
  };

  const tr = editor.state.tr;
  tr.setNodeMarkup(tablePos, undefined, {
    ...tableNode.attrs,
    tableStyleId: styleDef.id,
    tableStyleOptions: newOptions,
    // Đồng bộ kiểu viền và lề cơ sở của style nếu bảng đang dùng viền mặc định
    borders: styleDef.borders,
  });

  notifyTableDimensionsChanged(tablePos);
  editor.view.dispatch(tr);
  return true;
}

/**
 * COMMAND: Bật/tắt các tùy chọn Table Style (Header Row, Banded Rows, First Column, ...)
 */
export function setTableStyleOptions(
  editor: Editor | null,
  options: Partial<TableStyleOptions>
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const active = findActiveTable(editor);
  if (!active) return false;

  const { tablePos, tableNode } = active;
  const currentOptions = tableNode.attrs.tableStyleOptions || DEFAULT_TABLE_STYLE_OPTIONS;
  const newOptions = {
    ...currentOptions,
    ...options,
  };

  const tr = editor.state.tr;
  tr.setNodeMarkup(tablePos, undefined, {
    ...tableNode.attrs,
    tableStyleOptions: newOptions,
  });

  notifyTableDimensionsChanged(tablePos);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Tra cứu thông tin Table Style của bảng đang trỏ con trỏ
 */
export function getTableStyleInfo(editor: Editor | null): {
  styleId: string;
  options: Required<TableStyleOptions>;
  style: TableStyleDefinition;
} | null {
  if (!editor || !editor.state) return null;
  const active = findActiveTable(editor);
  if (!active) return null;

  const styleId = (active.tableNode.attrs.tableStyleId as string) || "grid";
  const options = {
    ...DEFAULT_TABLE_STYLE_OPTIONS,
    ...(active.tableNode.attrs.tableStyleOptions || {}),
  };
  const style = getTableStyle(styleId);

  return { styleId, options, style };
}
