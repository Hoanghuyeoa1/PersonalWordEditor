import { useState, useEffect, useMemo } from "react";
import { useEditorStore } from "../../stores/editorStore.ts";
import { Editor } from "@tiptap/core";
import {
  isTableActive as editorIsTableActive,
  mergeCells,
  splitCell,
  canMergeCells,
  canSplitCell,
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  deleteTable,
  toggleHeaderRow,
  setCellTextAlign,
  setCellVerticalAlign,
  setCellBackgroundColor,
  setTableBorders,
  getTableBorders,
  autoFitContents,
  autoFitWindow,
  setFixedColumnWidths,
  getTableLayoutMode,
  distributeTableColumns,
  distributeTableRows,
  setTableCellMargins,
  setCellMarginOverride,
  getEffectiveCellMargins,
  setTableRowHeight,
  getTableRowHeight,
  applyTableStyle,
  setTableStyleOptions,
  getTableStyleInfo,
  getAllTableStyles,
  type TableStyleId,
  type TableStyleOptions,
  type CellMargins,
  type RowHeightRule,
  type RowHeightSettings,
  DEFAULT_TABLE_CELL_MARGINS,
  DEFAULT_ROW_HEIGHT_SETTINGS,
} from "../../editor/editorCommands.ts";
import type {
  TableBorderStyle,
  TableLayoutMode,
  CellTextAlign,
  CellVerticalAlign,
} from "../../editor/tableExtensions.ts";
import { findActiveTable } from "../../editor/tableSizingService.ts";
import { TableMap } from "@tiptap/pm/tables";

/**
 * Các bộ thông số lề ô chuẩn (Presets)
 */
export const CELL_MARGIN_PRESETS = {
  normal: { top: 6, bottom: 6, left: 8, right: 8 },
  narrow: { top: 3, bottom: 3, left: 4, right: 4 },
  wide: { top: 10, bottom: 10, left: 14, right: 14 },
} as const;

/**
 * Kiểm tra và chuẩn hóa giá trị Lề Ô (Cell Margins)
 * Đảm bảo các giá trị là số nguyên không âm (>= 0 px).
 */
export function validateCellMargins(margins: Partial<CellMargins>): CellMargins {
  return {
    top: Math.max(0, Math.min(200, Math.round(Number(margins.top) || 0))),
    bottom: Math.max(0, Math.min(200, Math.round(Number(margins.bottom) || 0))),
    left: Math.max(0, Math.min(200, Math.round(Number(margins.left) || 0))),
    right: Math.max(0, Math.min(200, Math.round(Number(margins.right) || 0))),
  };
}

/**
 * Kiểm tra và chuẩn hóa quy tắc và giá trị Chiều Cao Hàng (Row Height)
 * - Nếu rule === "auto", height luôn là null
 * - Nếu rule !== "auto", height phải là số >= 10 px
 */
export function validateRowHeight(
  height: number | null | undefined,
  rule: RowHeightRule
): { height: number | null; rule: RowHeightRule } {
  if (rule === "auto") {
    return { height: null, rule: "auto" };
  }
  const sanitizedHeight = Math.max(10, Math.min(800, Math.round(Number(height) || 36)));
  return { height: sanitizedHeight, rule };
}

/**
 * Ngăn chặn blur của editor khi click vào các nút/dropdown trên toolbar
 * để bảo toàn CellSelection trong ProseMirror.
 * Ngoại lệ: Không preventDefault trên input/select/textarea để người dùng tương tác form.
 */
export function preventBlur(e: { target: any; preventDefault: () => void }): boolean {
  const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") {
    return false;
  }
  e.preventDefault();
  return true;
}

/**
 * Hàm tính toán trạng thái thuần túy (pure state calculation)
 * Tách biệt hoàn toàn khỏi vòng đời React để dễ dàng kiểm thử độc lập.
 */
export function resolveTableToolbarState(editor: Editor | null) {
  const isTableActive = editor ? editorIsTableActive(editor) : false;
  const activeTable = editor && isTableActive ? findActiveTable(editor) : null;
  const canMerge = editor && isTableActive ? canMergeCells(editor) : false;
  const canSplit = editor && isTableActive ? canSplitCell(editor) : false;

  let canDistributeCols = false;
  let canDistributeRows = false;
  if (activeTable) {
    const map = TableMap.get(activeTable.tableNode);
    canDistributeCols = map.width > 1;
    canDistributeRows = map.height > 1;
  }

  const layoutMode: TableLayoutMode =
    (editor && isTableActive ? getTableLayoutMode(editor) : "autoWindow") ?? "autoWindow";
  const tableStyleInfo = editor && isTableActive ? getTableStyleInfo(editor) : null;
  const currentBorders: TableBorderStyle =
    editor && isTableActive ? getTableBorders(editor) : "all";
  const currentMargins: CellMargins = activeTable
    ? getEffectiveCellMargins(activeTable.tableNode.attrs, null)
    : DEFAULT_TABLE_CELL_MARGINS;
  const currentRowHeight: RowHeightSettings =
    editor && isTableActive ? getTableRowHeight(editor) : DEFAULT_ROW_HEIGHT_SETTINGS;
  const repeatHeader: boolean = activeTable
    ? activeTable.tableNode.attrs.repeatHeader !== false
    : true;

  return {
    isTableActive,
    activeTable,
    canMerge,
    canSplit,
    canDistributeCols,
    canDistributeRows,
    layoutMode,
    tableStyleInfo,
    allTableStyles: getAllTableStyles(),
    currentBorders,
    currentMargins,
    currentRowHeight,
    repeatHeader,
  };
}

/**
 * Tạo danh sách actions điều khiển bảng kết nối tới editorCommands
 */
export function createTableToolbarActions(
  editor: Editor | null,
  state?: ReturnType<typeof resolveTableToolbarState>
) {
  const s = state ?? resolveTableToolbarState(editor);

  const onMergeCells = () => {
    if (!editor || !canMergeCells(editor)) return false;
    const ok = mergeCells(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSplitCell = () => {
    if (!editor || !canSplitCell(editor)) return false;
    const ok = splitCell(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onAutoFitContents = () => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const ok = autoFitContents(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onAutoFitWindow = () => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const ok = autoFitWindow(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetFixedColumnWidths = (widths?: number[]) => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const ok = setFixedColumnWidths(editor, widths);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onDistributeColumns = () => {
    if (!editor) return false;
    const active = findActiveTable(editor);
    if (!active || TableMap.get(active.tableNode).width <= 1) return false;
    const ok = distributeTableColumns(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onDistributeRows = () => {
    if (!editor) return false;
    const active = findActiveTable(editor);
    if (!active || TableMap.get(active.tableNode).height <= 1) return false;
    const ok = distributeTableRows(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetCellMargins = (
    margins: Partial<CellMargins>,
    cellOverrideOnly = false
  ) => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const sanitized = validateCellMargins(margins);
    let ok = false;
    if (cellOverrideOnly) {
      ok = setCellMarginOverride(editor, sanitized);
    } else {
      ok = setTableCellMargins(editor, sanitized);
    }
    if (editor) editor.commands.focus();
    return ok;
  };

  const onClearCellMarginOverride = () => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const ok = setCellMarginOverride(editor, null, { clearOverride: true });
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetRowHeight = (
    height: number | null,
    rule: RowHeightRule = "auto"
  ) => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const sanitized = validateRowHeight(height, rule);
    const ok = setTableRowHeight(editor, sanitized.height, sanitized.rule);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onApplyTableStyle = (
    styleId: TableStyleId,
    options?: TableStyleOptions
  ) => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const ok = applyTableStyle(editor, styleId, options);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetTableStyleOptions = (options: Partial<TableStyleOptions>) => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const ok = setTableStyleOptions(editor, options);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onToggleHeaderRow = () => {
    if (!editor || !editorIsTableActive(editor)) return false;
    const ok = toggleHeaderRow(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onToggleRepeatHeader = () => {
    if (!editor) return false;
    const active = findActiveTable(editor);
    if (!active) return false;
    const current = active.tableNode.attrs.repeatHeader !== false;
    const tr = editor.state.tr;
    tr.setNodeMarkup(active.tablePos, undefined, {
      ...active.tableNode.attrs,
      repeatHeader: !current,
    });
    editor.view.dispatch(tr);
    if (editor) editor.commands.focus();
    return true;
  };

  const onAddRowAbove = () => {
    if (!editor || !s.isTableActive) return false;
    const ok = addRowAbove(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onAddRowBelow = () => {
    if (!editor || !s.isTableActive) return false;
    const ok = addRowBelow(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onDeleteRow = () => {
    if (!editor || !s.isTableActive) return false;
    const ok = deleteRow(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onAddColumnLeft = () => {
    if (!editor || !s.isTableActive) return false;
    const ok = addColumnLeft(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onAddColumnRight = () => {
    if (!editor || !s.isTableActive) return false;
    const ok = addColumnRight(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onDeleteColumn = () => {
    if (!editor || !s.isTableActive) return false;
    const ok = deleteColumn(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onDeleteTable = () => {
    if (!editor || !s.isTableActive) return false;
    const ok = deleteTable(editor);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetCellTextAlign = (align: CellTextAlign) => {
    if (!editor || !s.isTableActive) return false;
    const ok = setCellTextAlign(editor, align);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetCellVerticalAlign = (valign: CellVerticalAlign) => {
    if (!editor || !s.isTableActive) return false;
    const ok = setCellVerticalAlign(editor, valign);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetCellBackgroundColor = (color: string | null) => {
    if (!editor || !s.isTableActive) return false;
    const ok = setCellBackgroundColor(editor, color);
    if (editor) editor.commands.focus();
    return ok;
  };

  const onSetTableBorders = (borders: TableBorderStyle) => {
    if (!editor || !s.isTableActive) return false;
    const ok = setTableBorders(editor, borders);
    if (editor) editor.commands.focus();
    return ok;
  };

  return {
    onMergeCells,
    onSplitCell,
    onAutoFitContents,
    onAutoFitWindow,
    onSetFixedColumnWidths,
    onDistributeColumns,
    onDistributeRows,
    onSetCellMargins,
    onClearCellMarginOverride,
    onSetRowHeight,
    onApplyTableStyle,
    onSetTableStyleOptions,
    onToggleHeaderRow,
    onToggleRepeatHeader,
    onAddRowAbove,
    onAddRowBelow,
    onDeleteRow,
    onAddColumnLeft,
    onAddColumnRight,
    onDeleteColumn,
    onDeleteTable,
    onSetCellTextAlign,
    onSetCellVerticalAlign,
    onSetCellBackgroundColor,
    onSetTableBorders,
  };
}

/**
 * Hook quản lý toàn bộ trạng thái nghiệp vụ và các lệnh của TableContextualToolbar 2.0.
 * Đảm bảo tách biệt 100% logic nghiệp vụ khỏi JSX components.
 */
export function useTableToolbarState() {
  const editor = useEditorStore((state) => state.editor);

  // Tick state để trigger re-render khi transaction hoặc selection trong editor thay đổi
  const [updateTick, setUpdateTick] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      setUpdateTick((prev) => prev + 1);
    };

    editor.on("selectionUpdate", handleUpdate);
    editor.on("transaction", handleUpdate);

    return () => {
      editor.off("selectionUpdate", handleUpdate);
      editor.off("transaction", handleUpdate);
    };
  }, [editor]);

  const state = useMemo(() => {
    void updateTick;
    return resolveTableToolbarState(editor);
  }, [editor, updateTick]);

  const actions = useMemo(() => {
    return createTableToolbarActions(editor, state);
  }, [editor, state]);

  return {
    editor,
    ...state,
    ...actions,
  };
}
