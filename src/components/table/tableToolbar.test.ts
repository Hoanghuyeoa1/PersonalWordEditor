import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import {
  setTableCellSelection,
  getTableMap,
  insertTable,
} from "../../editor/editorCommands.ts";
import {
  resolveTableToolbarState,
  createTableToolbarActions,
  preventBlur,
  CELL_MARGIN_PRESETS,
  validateCellMargins,
  validateRowHeight,
} from "./useTableToolbarState.ts";
import { TableMap, CellSelection } from "@tiptap/pm/tables";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";

function createToolbarTestEditor(options?: {
  rows?: number;
  cols?: number;
  withHeader?: boolean;
  tableAttrs?: Record<string, any>;
}) {
  const numRows = options?.rows ?? 3;
  const numCols = options?.cols ?? 3;
  const withHeader = options?.withHeader ?? true;

  const tableRows: any[] = [];
  for (let r = 0; r < numRows; r++) {
    const isHeaderRow = withHeader && r === 0;
    const cells: any[] = [];
    for (let c = 0; c < numCols; c++) {
      cells.push({
        type: isHeaderRow ? "tableHeader" : "tableCell",
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: [120],
          backgroundColor: null,
          textAlign: null,
          verticalAlign: null,
          cellMargins: null,
        },
        content: [
          {
            type: "paragraph",
            attrs: {
              styleId: "bodyText",
            },
            content: [{ type: "text", text: `R${r}C${c}` }],
          },
        ],
      });
    }
    tableRows.push({
      type: "tableRow",
      attrs: {
        rowHeight: null,
        rowHeightRule: "auto",
      },
      content: cells,
    });
  }

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: {
            layoutMode: "autoWindow",
            borders: "all",
            tableStyleId: "table_grid",
            tableStyleOptions: {
              headerRow: true,
              totalRow: false,
              bandedRows: true,
              firstColumn: false,
              lastColumn: false,
              bandedColumns: false,
            },
            repeatHeader: true,
            ...(options?.tableAttrs || {}),
          },
          content: tableRows,
        },
      ],
    },
  });

  return editor;
}

function getTablePosInfo(editor: Editor) {
  const doc = editor.state.doc;
  let tablePos = -1;
  let tableNode: ProsemirrorNode | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name === "table" && tablePos === -1) {
      tablePos = pos;
      tableNode = node;
      return false;
    }
    return true;
  });

  if (!tableNode || tablePos === -1) {
    throw new Error("Không tìm thấy table trong editor");
  }

  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;

  const getCellDocPos = (row: number, col: number): number => {
    const offset = map.map[row * map.width + col];
    return tableStart + offset;
  };

  return { tablePos, tableNode, map, getCellDocPos };
}

// ============================================================================
// 1. COMMAND WIRING TESTS
// ============================================================================
test("Phase 7 - 1. Command wiring: Rows & Columns operations dispatch correctly", () => {
  const editor = createToolbarTestEditor({ rows: 3, cols: 3 });
  const { getCellDocPos } = getTablePosInfo(editor);

  // Focus cursor vào ô R1C1 (hàng thứ 2, cột thứ 2)
  const cellPos = getCellDocPos(1, 1);
  editor.commands.setTextSelection(cellPos + 2);

  const state = resolveTableToolbarState(editor);
  const actions = createTableToolbarActions(editor, state);

  // Thêm hàng phía dưới
  const addRowOk = actions.onAddRowBelow();
  assert.equal(addRowOk, true, "onAddRowBelow phải thành công");
  let info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4, "Bảng phải tăng lên 4 hàng sau khi addRowBelow");

  // Thêm hàng phía trên
  const addRowAboveOk = actions.onAddRowAbove();
  assert.equal(addRowAboveOk, true, "onAddRowAbove phải thành công");
  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 5, "Bảng phải tăng lên 5 hàng sau khi addRowAbove");

  // Xóa hàng
  const deleteRowOk = actions.onDeleteRow();
  assert.equal(deleteRowOk, true, "onDeleteRow phải thành công");
  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4, "Bảng phải giảm về 4 hàng sau khi deleteRow");

  // Thêm cột bên phải
  const addColOk = actions.onAddColumnRight();
  assert.equal(addColOk, true, "onAddColumnRight phải thành công");
  info = getTablePosInfo(editor);
  assert.equal(info.map.width, 4, "Bảng phải tăng lên 4 cột sau khi addColumnRight");

  // Xóa cột
  const deleteColOk = actions.onDeleteColumn();
  assert.equal(deleteColOk, true, "onDeleteColumn phải thành công");
  info = getTablePosInfo(editor);
  assert.equal(info.map.width, 3, "Bảng phải giảm về 3 cột sau khi deleteColumn");
});

test("Phase 7 - 1. Command wiring: Cell alignment, shading, and borders dispatch correctly", () => {
  const editor = createToolbarTestEditor({ rows: 2, cols: 2 });
  const { getCellDocPos } = getTablePosInfo(editor);

  // Chọn ô R1C1
  editor.commands.setTextSelection(getCellDocPos(1, 1) + 2);
  const state = resolveTableToolbarState(editor);
  const actions = createTableToolbarActions(editor, state);

  // Căn lề ngang
  actions.onSetCellTextAlign("center");
  let cellNode = editor.state.doc.nodeAt(getCellDocPos(1, 1));
  assert.equal(cellNode?.attrs.textAlign, "center", "textAlign phải là 'center'");

  // Căn lề dọc
  actions.onSetCellVerticalAlign("middle");
  cellNode = editor.state.doc.nodeAt(getCellDocPos(1, 1));
  assert.equal(cellNode?.attrs.verticalAlign, "middle", "verticalAlign phải là 'middle'");

  // Màu nền ô
  actions.onSetCellBackgroundColor("#dbeafe");
  cellNode = editor.state.doc.nodeAt(getCellDocPos(1, 1));
  assert.equal(cellNode?.attrs.backgroundColor, "#dbeafe", "backgroundColor phải là '#dbeafe'");

  // Viền bảng
  actions.onSetTableBorders("outside");
  let tableInfo = getTablePosInfo(editor);
  assert.equal(tableInfo.tableNode.attrs.borders, "outside", "borders bảng phải là 'outside'");
});

// ============================================================================
// 2. DISABLED STATES TESTS
// ============================================================================
test("Phase 7 - 2. Disabled states: Merge disabled when selection is invalid or < 2 cells", () => {
  const editor = createToolbarTestEditor({ rows: 3, cols: 3, withHeader: true });
  const { getCellDocPos } = getTablePosInfo(editor);

  // Case 1: Cursor ở 1 ô duy nhất (chưa chọn nhiều ô) -> canMerge phải là FALSE
  editor.commands.setTextSelection(getCellDocPos(1, 1) + 2);
  let state = resolveTableToolbarState(editor);
  assert.equal(state.canMerge, false, "canMerge phải là false khi chỉ có 1 con trỏ text trong ô");

  // Case 2: Chọn 2 ô hợp lệ trong cùng Body (R1C0 đến R1C1) -> canMerge phải là TRUE
  setTableCellSelection(editor, getCellDocPos(1, 0), getCellDocPos(1, 1));
  state = resolveTableToolbarState(editor);
  assert.equal(state.canMerge, true, "canMerge phải là true khi chọn 2 ô hình chữ nhật hợp lệ");

  // Case 3: Chọn chéo Header <-> Body (R0C0 đến R1C0) -> canMerge phải là FALSE
  setTableCellSelection(editor, getCellDocPos(0, 0), getCellDocPos(1, 0));
  state = resolveTableToolbarState(editor);
  assert.equal(
    state.canMerge,
    false,
    "canMerge phải là false khi selection vượt ranh giới Header <-> Body"
  );
});

test("Phase 7 - 2. Disabled states: Split disabled when cell is 1x1, enabled on merged cell", () => {
  const editor = createToolbarTestEditor({ rows: 3, cols: 3 });
  const { getCellDocPos } = getTablePosInfo(editor);

  // Ô thông thường 1x1 -> canSplit phải là FALSE
  editor.commands.setTextSelection(getCellDocPos(1, 1) + 2);
  let state = resolveTableToolbarState(editor);
  assert.equal(state.canSplit, false, "canSplit phải là false trên ô 1x1 bình thường");

  // Hợp nhất 2 ô R1C1 và R1C2
  setTableCellSelection(editor, getCellDocPos(1, 1), getCellDocPos(1, 2));
  const actions = createTableToolbarActions(editor, resolveTableToolbarState(editor));
  actions.onMergeCells();

  // Đặt con trỏ vào ô đã gộp -> canSplit phải là TRUE
  const updatedInfo = getTablePosInfo(editor);
  editor.commands.setTextSelection(updatedInfo.getCellDocPos(1, 1) + 2);
  state = resolveTableToolbarState(editor);
  assert.equal(state.canSplit, true, "canSplit phải là true trên ô đã gộp (colspan=2)");

  // Tách ô
  const splitActions = createTableToolbarActions(editor, state);
  const splitOk = splitActions.onSplitCell();
  assert.equal(splitOk, true, "onSplitCell phải thành công");

  // Sau khi tách -> canSplit trở lại FALSE
  state = resolveTableToolbarState(editor);
  assert.equal(state.canSplit, false, "canSplit phải trở lại false sau khi đã tách thành công");
});

test("Phase 7 - 2. Disabled states: Distribute Columns & Rows disabled on 1-col or 1-row tables", () => {
  // Bảng 1x1
  const editorSingle = createToolbarTestEditor({ rows: 1, cols: 1, withHeader: false });
  const { getCellDocPos } = getTablePosInfo(editorSingle);
  editorSingle.commands.setTextSelection(getCellDocPos(0, 0) + 2);

  let state = resolveTableToolbarState(editorSingle);
  assert.equal(state.canDistributeCols, false, "canDistributeCols phải là false khi map.width <= 1");
  assert.equal(state.canDistributeRows, false, "canDistributeRows phải là false khi map.height <= 1");

  // Bảng 3x3
  const editorMulti = createToolbarTestEditor({ rows: 3, cols: 3 });
  const multiInfo = getTablePosInfo(editorMulti);
  editorMulti.commands.setTextSelection(multiInfo.getCellDocPos(1, 1) + 2);

  state = resolveTableToolbarState(editorMulti);
  assert.equal(state.canDistributeCols, true, "canDistributeCols phải là true khi map.width > 1");
  assert.equal(state.canDistributeRows, true, "canDistributeRows phải là true khi map.height > 1");
});

// ============================================================================
// 3. SELECTION PRESERVATION TESTS
// ============================================================================
test("Phase 7 - 3. Selection safety: preventBlur blocks focus loss on buttons and permits form inputs", () => {
  // Test click vào nút toolbar -> preventDefault được gọi, trả về true
  let preventDefaultCalled = false;
  const mockButtonEvent = {
    target: { tagName: "BUTTON" },
    preventDefault: () => {
      preventDefaultCalled = true;
    },
  };
  const resButton = preventBlur(mockButtonEvent);
  assert.equal(resButton, true, "preventBlur phải trả về true cho button");
  assert.equal(preventDefaultCalled, true, "preventDefault phải được gọi khi click button");

  // Test click vào input form -> preventDefault KHÔNG được gọi, trả về false
  preventDefaultCalled = false;
  const mockInputEvent = {
    target: { tagName: "INPUT" },
    preventDefault: () => {
      preventDefaultCalled = true;
    },
  };
  const resInput = preventBlur(mockInputEvent);
  assert.equal(resInput, false, "preventBlur phải trả về false cho input");
  assert.equal(preventDefaultCalled, false, "preventDefault KHÔNG được gọi khi click input");

  // Test click vào select form -> preventDefault KHÔNG được gọi, trả về false
  preventDefaultCalled = false;
  const mockSelectEvent = {
    target: { tagName: "SELECT" },
    preventDefault: () => {
      preventDefaultCalled = true;
    },
  };
  const resSelect = preventBlur(mockSelectEvent);
  assert.equal(resSelect, false, "preventBlur phải trả về false cho select");
  assert.equal(preventDefaultCalled, false, "preventDefault KHÔNG được gọi khi click select");
});

test("Phase 7 - 3. Selection safety: CellSelection remains active across toolbar state queries", () => {
  const editor = createToolbarTestEditor({ rows: 3, cols: 3 });
  const { getCellDocPos } = getTablePosInfo(editor);

  // Thiết lập CellSelection 2x2
  setTableCellSelection(editor, getCellDocPos(1, 0), getCellDocPos(2, 1));
  assert.ok(
    editor.state.selection instanceof CellSelection,
    "Selection phải là CellSelection"
  );

  // Đọc state toolbar
  const state = resolveTableToolbarState(editor);
  assert.equal(state.canMerge, true, "canMerge phải nhận diện đúng CellSelection 2x2");
  assert.ok(
    editor.state.selection instanceof CellSelection,
    "CellSelection không bị mất sau khi resolveTableToolbarState"
  );
});

// ============================================================================
// 4. CELL MARGINS UI & VALIDATION TESTS
// ============================================================================
test("Phase 7 - 4. Cell margins UI: Presets defined correctly and validation clamps values", () => {
  // Kiểm tra cấu trúc presets
  assert.deepEqual(CELL_MARGIN_PRESETS.normal, { top: 6, bottom: 6, left: 8, right: 8 });
  assert.deepEqual(CELL_MARGIN_PRESETS.narrow, { top: 3, bottom: 3, left: 4, right: 4 });
  assert.deepEqual(CELL_MARGIN_PRESETS.wide, { top: 10, bottom: 10, left: 14, right: 14 });

  // Kiểm tra validateCellMargins với giá trị âm -> đưa về 0
  const validatedNegative = validateCellMargins({ top: -5, bottom: -10, left: 15, right: 20 });
  assert.equal(validatedNegative.top, 0, "Top âm phải được clamp về 0");
  assert.equal(validatedNegative.bottom, 0, "Bottom âm phải được clamp về 0");
  assert.equal(validatedNegative.left, 15);
  assert.equal(validatedNegative.right, 20);

  // Kiểm tra validateCellMargins với chuỗi hoặc số thập phân
  const validatedTypes = validateCellMargins({
    top: 7.4 as any,
    bottom: "12.8" as any,
    left: NaN as any,
  });
  assert.equal(validatedTypes.top, 7);
  assert.equal(validatedTypes.bottom, 13);
  assert.equal(validatedTypes.left, 0);
});

test("Phase 7 - 4. Cell margins UI: Apply table-level margins vs cell override", () => {
  const editor = createToolbarTestEditor({ rows: 2, cols: 2 });
  const { getCellDocPos } = getTablePosInfo(editor);
  editor.commands.setTextSelection(getCellDocPos(1, 1) + 2);

  const state = resolveTableToolbarState(editor);
  const actions = createTableToolbarActions(editor, state);

  // Áp dụng lề toàn bảng
  actions.onSetCellMargins({ top: 12, bottom: 12, left: 16, right: 16 }, false);
  let tableInfo = getTablePosInfo(editor);
  assert.deepEqual(
    tableInfo.tableNode.attrs.cellMargins,
    { top: 12, bottom: 12, left: 16, right: 16 },
    "cellMargins cấp table phải được cập nhật"
  );

  // Áp dụng cell override cho ô R1C1
  actions.onSetCellMargins({ top: 25, bottom: 25, left: 30, right: 30 }, true);
  let cellNode = editor.state.doc.nodeAt(getCellDocPos(1, 1));
  assert.deepEqual(
    cellNode?.attrs.cellMargins,
    { top: 25, bottom: 25, left: 30, right: 30 },
    "cellMargins cấp ô phải được ghi đè (override)"
  );

  // Xóa cell override
  actions.onClearCellMarginOverride();
  cellNode = editor.state.doc.nodeAt(getCellDocPos(1, 1));
  assert.equal(cellNode?.attrs.cellMargins, null, "cellMargins override phải được xóa về null");
});

// ============================================================================
// 5. ROW HEIGHT UI & VALIDATION TESTS
// ============================================================================
test("Phase 7 - 5. Row height UI: Validation handles auto, atLeast, exact rules", () => {
  // Rule auto: height luôn là null
  const autoResult = validateRowHeight(100, "auto");
  assert.equal(autoResult.height, null, "Rule auto luôn có height là null");
  assert.equal(autoResult.rule, "auto");

  // Rule atLeast: height tối thiểu 10px
  const atLeastResult = validateRowHeight(4, "atLeast");
  assert.equal(atLeastResult.height, 10, "Chiều cao < 10px phải được clamp lên 10px");
  assert.equal(atLeastResult.rule, "atLeast");

  // Rule exact: height tối đa 800px
  const exactResult = validateRowHeight(1200, "exact");
  assert.equal(exactResult.height, 800, "Chiều cao > 800px phải được clamp về 800px");
  assert.equal(exactResult.rule, "exact");
});

test("Phase 7 - 5. Row height UI: onSetRowHeight applies properly to active row", () => {
  const editor = createToolbarTestEditor({ rows: 3, cols: 3 });
  const { getCellDocPos } = getTablePosInfo(editor);
  editor.commands.setTextSelection(getCellDocPos(1, 1) + 2);

  const state = resolveTableToolbarState(editor);
  const actions = createTableToolbarActions(editor, state);

  // Thiết lập chiều cao chính xác (exact) = 45px
  actions.onSetRowHeight(45, "exact");
  let tableInfo = getTablePosInfo(editor);
  let targetRow = tableInfo.tableNode.child(1);
  assert.equal(targetRow.attrs.rowHeight, 45, "rowHeight phải là 45");
  assert.equal(targetRow.attrs.rowHeightRule, "exact", "rowHeightRule phải là exact");

  // Trả về tự động (auto)
  actions.onSetRowHeight(null, "auto");
  tableInfo = getTablePosInfo(editor);
  targetRow = tableInfo.tableNode.child(1);
  assert.equal(targetRow.attrs.rowHeight, null, "rowHeight phải là null khi auto");
  assert.equal(targetRow.attrs.rowHeightRule, "auto", "rowHeightRule phải là auto");
});

// ============================================================================
// 6. TABLE STYLE GALLERY TESTS
// ============================================================================
test("Phase 7 - 6. Table style gallery: built-in presets and options toggles", () => {
  const editor = createToolbarTestEditor({ rows: 3, cols: 3 });
  const state = resolveTableToolbarState(editor);

  // Kiểm tra danh sách built-in styles
  assert.ok(state.allTableStyles.length >= 5, "Phải có ít nhất 5 built-in styles");
  const styleIds = state.allTableStyles.map((s) => s.id);
  assert.ok(styleIds.includes("plain"), "Phải chứa Plain style");
  assert.ok(styleIds.includes("grid"), "Phải chứa Grid style");
  assert.ok(styleIds.includes("light-grid"), "Phải chứa Light Grid style");
  assert.ok(styleIds.includes("medium-accent"), "Phải chứa Medium Accent style");
  assert.ok(styleIds.includes("academic"), "Phải chứa Academic style");

  const actions = createTableToolbarActions(editor, state);

  // Áp dụng kiểu Academic
  actions.onApplyTableStyle("academic");
  let updatedState = resolveTableToolbarState(editor);
  assert.equal(updatedState.tableStyleInfo?.styleId, "academic");
  assert.equal(updatedState.tableStyleInfo?.style.name, "Academic (APA)");

  // Tắt bandedRows và toggle headerRow
  actions.onSetTableStyleOptions({ bandedRows: false });
  updatedState = resolveTableToolbarState(editor);
  assert.equal(updatedState.tableStyleInfo?.options.bandedRows, false);
  assert.equal(updatedState.tableStyleInfo?.options.headerRow, true);
});

// ============================================================================
// 7. AUTOFIT ACTIONS TESTS
// ============================================================================
test("Phase 7 - 7. AutoFit actions: autoContent, autoWindow, and fixed column width", () => {
  const editor = createToolbarTestEditor({ rows: 2, cols: 3 });
  const state = resolveTableToolbarState(editor);
  const actions = createTableToolbarActions(editor, state);

  // Ban đầu là autoWindow
  assert.equal(state.layoutMode, "autoWindow");

  // Chuyển sang AutoFit Contents
  actions.onAutoFitContents();
  let updatedState = resolveTableToolbarState(editor);
  assert.equal(updatedState.layoutMode, "autoContent", "layoutMode phải chuyển sang autoContent");

  // Chuyển sang Fixed Column Width
  actions.onSetFixedColumnWidths([100, 150, 200]);
  updatedState = resolveTableToolbarState(editor);
  assert.equal(updatedState.layoutMode, "fixed", "layoutMode phải chuyển sang fixed");

  // Chuyển lại về AutoFit Window
  actions.onAutoFitWindow();
  updatedState = resolveTableToolbarState(editor);
  assert.equal(updatedState.layoutMode, "autoWindow", "layoutMode phải chuyển sang autoWindow");
});

// ============================================================================
// 8. TOOLBAR REPEAT HEADER & STRUCTURE SANITY
// ============================================================================
test("Phase 7 - 8. Toolbar structure & repeatHeader toggle sanity", () => {
  const editor = createToolbarTestEditor({
    rows: 3,
    cols: 3,
    tableAttrs: { repeatHeader: true },
  });
  let state = resolveTableToolbarState(editor);
  assert.equal(state.repeatHeader, true, "repeatHeader ban đầu là true");

  const actions = createTableToolbarActions(editor, state);

  // Toggle repeatHeader thành false
  actions.onToggleRepeatHeader();
  state = resolveTableToolbarState(editor);
  assert.equal(state.repeatHeader, false, "repeatHeader phải chuyển thành false");

  // Toggle lại repeatHeader thành true
  actions.onToggleRepeatHeader();
  state = resolveTableToolbarState(editor);
  assert.equal(state.repeatHeader, true, "repeatHeader phải chuyển lại thành true");
});
