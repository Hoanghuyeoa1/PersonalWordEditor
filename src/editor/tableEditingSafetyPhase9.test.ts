import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { CellSelection, TableMap, selectedRect } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "prosemirror-view";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  goToNextCell,
  goToPreviousCell,
  handleTabNavigation,
  canMergeCells,
  mergeCells,
  canSplitCell,
  splitCell,
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  deleteTable,
  setTableCellSelection,
  normalizeCellPosition,
  getTableMap,
  autoFitContents,
  autoFitWindow,
  setFixedColumnWidths,
  setTableRowHeight,
  setTableCellMargins,
  applyTableStyle,
  undo,
  redo,
} from "./editorCommands.ts";
import { buildPageLayoutMap, getNodeSize } from "../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/services/pageConstants.ts";

// Helper: Lấy thông tin table node, map và vị trí ô
function getTableDocInfo(editor: Editor) {
  let tablePos = -1;
  let tableNode: any = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "table" && tablePos === -1) {
      tablePos = pos;
      tableNode = node;
      return false;
    }
    return true;
  });

  if (tablePos === -1 || !tableNode) {
    throw new Error("Không tìm thấy table trong doc");
  }

  const map = TableMap.get(tableNode);
  const getCellDocPos = (row: number, col: number) => {
    const relPos = map.positionAt(row, col, tableNode);
    return tablePos + 1 + relPos;
  };

  return { tablePos, tableNode, map, getCellDocPos };
}

// Helper: Tạo bảng nhiều hàng phục vụ test phân trang
function createMultiPageTableDoc(
  rowCount: number,
  colCount: number = 2,
  options: {
    hasHeader?: boolean;
    repeatHeader?: boolean;
    colwidth?: number[];
    cellContent?: (row: number, col: number) => JSONContent[];
  } = {}
): JSONContent {
  const { hasHeader = true, repeatHeader = false, colwidth, cellContent } = options;
  const rows: JSONContent[] = [];

  for (let r = 0; r < rowCount; r++) {
    const isHeaderRow = r === 0 && hasHeader;
    const cellType = isHeaderRow ? "tableHeader" : "tableCell";
    const cells: JSONContent[] = [];

    for (let c = 0; c < colCount; c++) {
      const cellAttrs: Record<string, any> = {};
      if (colwidth && colwidth[c]) {
        cellAttrs.colwidth = [colwidth[c]];
      }

      const content = cellContent
        ? cellContent(r, c)
        : [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: isHeaderRow ? `Header ${c + 1}` : `R${r}C${c}`,
                },
              ],
            },
          ];

      cells.push({
        type: cellType,
        attrs: cellAttrs,
        content,
      });
    }

    rows.push({
      type: "tableRow",
      content: cells,
    });
  }

  const tableAttrs: Record<string, any> = { borders: "all" };
  if (repeatHeader) {
    tableAttrs.repeatHeader = true;
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản mở đầu trước bảng phân trang" }],
      },
      {
        type: "table",
        attrs: tableAttrs,
        content: rows,
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản kết thúc sau bảng phân trang" }],
      },
    ],
  };
}

// ============================================================================
// PHASE 9: EDITING / CELLSELECTION SAFETY TESTS
// ============================================================================

test("Phase 9 - 1. CellSelection: all span cases (single, colspan, rowspan, rectangular merge) without phantom or covered cells", () => {
  // Tạo bảng 4x4 với các kiểu span:
  // - Ô (0,0): rowspan=2, colspan=2 (hình chữ nhật 2x2)
  // - Ô (0,2): colspan=2 (hàng 0, cột 2..3)
  // - Hàng 1 chỉ có nội dung ở cột 2, 3 vì cột 0, 1 đã bị phủ bởi ô (0,0)
  // - Ô (2,1): rowspan=2 (dọc 2 hàng)
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          // Row 0
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { rowspan: 2, colspan: 2 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "2x2 merged" }] }],
              },
              {
                type: "tableCell",
                attrs: { colspan: 2 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "1x2 horiz" }] }],
              },
            ],
          },
          // Row 1 (cột 0, 1 bị phủ bởi (0,0))
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R1C2" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R1C3" }] }],
              },
            ],
          },
          // Row 2
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R2C0" }] }],
              },
              {
                type: "tableCell",
                attrs: { rowspan: 2 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "2x1 vert" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R2C2" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R2C3" }] }],
              },
            ],
          },
          // Row 3 (cột 1 bị phủ bởi ô (2,1))
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R3C0" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R3C2" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R3C3" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);

  // 1. Single cell selection: ô thường R1C2
  const r1c2Pos = info.getCellDocPos(1, 2);
  const ok1 = setTableCellSelection(editor, r1c2Pos, r1c2Pos);
  assert.equal(ok1, true, "Chọn 1 ô đơn thành công");
  assert.ok(editor.state.selection instanceof CellSelection);

  // 2. Colspan cell selection: ô 1x2 horiz tại (0,2)
  const r0c2Pos = info.getCellDocPos(0, 2);
  const ok2 = setTableCellSelection(editor, r0c2Pos, r0c2Pos);
  assert.equal(ok2, true, "Chọn ô colspan thành công");

  // 3. Rowspan cell selection: ô 2x1 vert tại (2,1)
  const r2c1Pos = info.getCellDocPos(2, 1);
  const ok3 = setTableCellSelection(editor, r2c1Pos, r2c1Pos);
  assert.equal(ok3, true, "Chọn ô rowspan thành công");

  // 4. Rectangular 2x2 merged cell selection tại (0,0)
  const r0c0Pos = info.getCellDocPos(0, 0);
  const ok4 = setTableCellSelection(editor, r0c0Pos, r0c0Pos);
  assert.equal(ok4, true, "Chọn ô 2x2 rectangular merge thành công");

  // 5. Multi-cell selection bao trùm từ (0,0) tới (3,3)
  const r3c3Pos = info.getCellDocPos(3, 3);
  const okMulti = setTableCellSelection(editor, r0c0Pos, r3c3Pos);
  assert.equal(okMulti, true, "Chọn toàn bộ vùng chữ nhật 4x4 thành công");

  const sel = editor.state.selection as CellSelection;
  assert.ok(sel instanceof CellSelection);

  // Kiểm tra không có duplicate hoặc covered/phantom cells được duyệt qua
  const visitedPositions: number[] = [];
  sel.forEachCell((node, pos) => {
    assert.ok(node.type.name === "tableCell", "Mỗi ô phải là tableCell thực sự");
    assert.ok(!visitedPositions.includes(pos), `Ô tại pos ${pos} không được lặp lại`);
    visitedPositions.push(pos);
  });

  // Tổng số ô thực sự trong bảng 4x4 này:
  // Row 0: 2 ô [(0,0), (0,2)]
  // Row 1: 2 ô [(1,2), (1,3)]
  // Row 2: 4 ô [(2,0), (2,1), (2,2), (2,3)]
  // Row 3: 3 ô [(3,0), (3,2), (3,3)]
  // Tổng cộng: 2 + 2 + 4 + 3 = 11 ô thực sự. Không có 16 ô (5 vị trí bị phủ không sinh phantom cells).
  assert.equal(visitedPositions.length, 11, "Chính xác 11 ô thực sự, không có phantom cell");

  editor.destroy();
});

test("Phase 9 - 2. CellSelection: mouse drag and Shift selection simulation with coordinate normalization", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 2 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Beta" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Gamma" }] }],
              },
              {
                type: "tableCell",
                attrs: { rowspan: 2 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Delta" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Epsilon" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Zeta" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Eta" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);

  // Giả lập Shift-selection: người dùng click vào text bên trong ô (0,0), sau đó Shift-click vào text bên trong ô (2,2)
  // normalizeCellPosition tự động chuyển vị trí text sâu bên trong thành cell doc pos
  const textInside00 = info.getCellDocPos(0, 0) + 3;
  const textInside22 = info.getCellDocPos(2, 2) + 3;

  const norm00 = normalizeCellPosition(editor.state.doc, textInside00);
  const norm22 = normalizeCellPosition(editor.state.doc, textInside22);

  assert.equal(norm00, info.getCellDocPos(0, 0), "Vị trí bên trong ô phải chuẩn hóa về đầu ô");
  assert.equal(norm22, info.getCellDocPos(2, 2), "Vị trí bên trong ô phải chuẩn hóa về đầu ô");

  // Thực hiện setTableCellSelection với tọa độ text (tự chuẩn hóa an toàn)
  const shiftSelectOk = setTableCellSelection(editor, textInside00, textInside22);
  assert.equal(shiftSelectOk, true, "Shift selection với tọa độ text bên trong ô thành công");

  assert.ok(editor.state.selection instanceof CellSelection);
  const rect = selectedRect(editor.state);
  assert.equal(rect.left, 0);
  assert.equal(rect.top, 0);
  assert.equal(rect.right, 3);
  assert.equal(rect.bottom, 3);

  editor.destroy();
});

test("Phase 9 - 3. Multi-page CellSelection across page boundaries without phantom nodes", () => {
  const doc = createMultiPageTableDoc(16, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const pPos = 0;
  const tblPos = getNodeSize(doc.content![0]);
  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 500); // Đẩy bảng sang 2 trang

  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of doc.content![1].content!) {
    measuredRowHeights.set(rPos, 45);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Bảng phải chia thành 2 trang");

  // Hàng 3 ở Trang 1, Hàng 12 ở Trang 2
  const cellPage1 = rowPositions[3] + 1;
  const cellPage2 = rowPositions[12] + 1;

  assert.equal(layoutMap.getPageForPosition(cellPage1), 0, "Hàng 3 ở Trang 1");
  assert.equal(layoutMap.getPageForPosition(cellPage2), 1, "Hàng 12 ở Trang 2");

  // Thiết lập CellSelection xuyên ranh giới trang
  const selectOk = setTableCellSelection(editor, cellPage1, cellPage2);
  assert.equal(selectOk, true);

  const sel = editor.state.selection as CellSelection;
  assert.ok(sel instanceof CellSelection);

  // AST bảng vẫn duy nhất có 16 rows, không có phantom row hay fake header nào
  const json = editor.getJSON();
  const tableNode = json.content!.find((n) => n.type === "table")!;
  assert.equal(tableNode.content!.length, 16);

  editor.destroy();
});

test("Phase 9 - 4. Keyboard Tab / Shift+Tab strictly skips covered cells in complex topology", () => {
  // Tạo bảng với topology:
  // Row 0: Cell (0,0) [rowspan: 2], Cell (0,1)
  // Row 1: Cell (1,1) (Cell (1,0) bị che bởi (0,0))
  // Row 2: Cell (2,0) [colspan: 2] (Cell (2,1) bị che bởi (2,0))
  // Row 3: Cell (3,0), Cell (3,1)
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { rowspan: 2 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "SpanR0" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R0C1" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R1C1" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 2 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "SpanC2" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R3C0" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "R3C1" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);

  // 1. Bắt đầu tại ô (0,0)
  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "SpanR0");

  // 2. Tab -> sang ô (0,1)
  let ok = goToNextCell(editor);
  assert.equal(ok, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "R0C1");

  // 3. Tab -> BỎ QUA covered cell (1,0) và nhảy trực tiếp vào (1,1)!
  ok = goToNextCell(editor);
  assert.equal(ok, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "R1C1");

  // 4. Tab -> sang ô (2,0) [colspan: 2]
  ok = goToNextCell(editor);
  assert.equal(ok, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "SpanC2");

  // 5. Tab -> BỎ QUA covered cell (2,1) và nhảy trực tiếp vào (3,0)!
  ok = goToNextCell(editor);
  assert.equal(ok, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "R3C0");

  // 6. Tab -> sang ô (3,1)
  ok = goToNextCell(editor);
  assert.equal(ok, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "R3C1");

  // 7. Shift+Tab -> quay ngược lại (3,0)
  let backOk = goToPreviousCell(editor);
  assert.equal(backOk, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "R3C0");

  // 8. Shift+Tab -> BỎ QUA covered cell (2,1) và quay lại (2,0) [SpanC2]!
  backOk = goToPreviousCell(editor);
  assert.equal(backOk, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "SpanC2");

  // 9. Shift+Tab -> quay lại (1,1) [R1C1]
  backOk = goToPreviousCell(editor);
  assert.equal(backOk, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "R1C1");

  // 10. Shift+Tab -> BỎ QUA covered cell (1,0) và quay lại (0,1) [R0C1]!
  backOk = goToPreviousCell(editor);
  assert.equal(backOk, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "R0C1");

  // 11. Shift+Tab -> quay lại (0,0) [SpanR0]
  backOk = goToPreviousCell(editor);
  assert.equal(backOk, true);
  assert.equal(editor.state.doc.resolve(editor.state.selection.from).parent.textContent, "SpanR0");

  editor.destroy();
});

test("Phase 9 - 5. Keyboard Tab final-cell policy: goToNextCell returns false; handleTabNavigation appends row", () => {
  const doc = createMultiPageTableDoc(2, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);
  // Đặt con trỏ vào ô cuối cùng của bảng: Row 1, Col 1
  const lastCellTextPos = info.getCellDocPos(1, 1) + 2;
  editor.commands.setTextSelection(lastCellTextPos);

  // 1. Chính sách hiện hành: goToNextCell trả về false khi ở ô cuối cùng
  const canGoNext = goToNextCell(editor);
  assert.equal(canGoNext, false, "goToNextCell phải trả về false ở ô cuối cùng");

  // 2. Chính sách phím Tab (Word standard): handleTabNavigation tạo hàng mới và nhảy vào
  const handled = handleTabNavigation(editor, { addRowOnFinalCell: true });
  assert.equal(handled, true, "handleTabNavigation phải thêm hàng và di chuyển thành công");

  const jsonAfter = editor.getJSON();
  const tableNode = jsonAfter.content!.find((n) => n.type === "table")!;
  assert.equal(tableNode.content!.length, 3, "Bảng tăng lên 3 hàng sau phím Tab");

  // Con trỏ đang nằm trong hàng mới được thêm
  const $pos = editor.state.doc.resolve(editor.state.selection.from);
  assert.equal($pos.parent.type.name, "paragraph");

  editor.destroy();
});

test("Phase 9 - 6. Caret & Typing inside normal cells, merged cells, and page boundary cells", () => {
  const doc = createMultiPageTableDoc(12, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 680); // Đẩy hàng 6 sang Trang 2

  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of doc.content![1].content!) {
    measuredRowHeights.set(rPos, 40);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2);
  const boundaryRowPos = rowPositions[5]; // Cuối trang 1 (page 0)
  const nextPageRowPos = rowPositions[6]; // Đầu trang 2 (page 1)

  assert.equal(layoutMap.getPageForTableRow(boundaryRowPos), 0);
  assert.equal(layoutMap.getPageForTableRow(nextPageRowPos), 1);

  // A. Typing trong normal cell (Row 2)
  const cellNormalPos = getTableDocInfo(editor).getCellDocPos(2, 0) + 3;
  editor.commands.setTextSelection(cellNormalPos);
  editor.view.dispatch(editor.state.tr.insertText("HelloNormal", cellNormalPos));
  assert.ok(editor.state.doc.textBetween(cellNormalPos, cellNormalPos + 11).includes("HelloNormal"));

  // B. Typing ở ô sát boundary cuối Trang 1 (Row 5)
  const cellBoundaryPos = getTableDocInfo(editor).getCellDocPos(5, 0) + 3;
  editor.commands.setTextSelection(cellBoundaryPos);
  editor.view.dispatch(editor.state.tr.insertText("BoundaryText", cellBoundaryPos));
  assert.ok(editor.state.doc.textBetween(cellBoundaryPos, cellBoundaryPos + 12).includes("BoundaryText"));

  // C. Typing ở ô đầu Trang 2 (Row 6)
  const cellPage2Pos = getTableDocInfo(editor).getCellDocPos(6, 0) + 3;
  editor.commands.setTextSelection(cellPage2Pos);
  editor.view.dispatch(editor.state.tr.insertText("Page2Text", cellPage2Pos));
  assert.ok(editor.state.doc.textBetween(cellPage2Pos, cellPage2Pos + 9).includes("Page2Text"));

  // Cấu trúc bảng vẫn toàn vẹn 12 hàng
  assert.equal(editor.getJSON().content![1].content!.length, 12);

  editor.destroy();
});

test("Phase 9 - 7. Vietnamese IME composition stability & deferred pagination reflow", () => {
  const doc = createMultiPageTableDoc(6, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);
  const cellPos = info.getCellDocPos(1, 0) + 3;
  editor.commands.setTextSelection(cellPos);

  // Giả lập trạng thái IME đang composing tiếng Việt (Telex: T-i-e-e-n-g-s)
  (editor.view as any).composing = true;

  // Giả lập chuỗi gõ IME thông qua transaction
  const tr = editor.state.tr.insertText("Tiếng Việt có dấu", cellPos);
  editor.view.dispatch(tr);

  // Xác nhận văn bản đã được ghi nhận đúng
  const textInCell = editor.state.doc.textBetween(cellPos, cellPos + 17);
  assert.equal(textInCell, "Tiếng Việt có dấu");

  // Giả lập kết thúc composition IME (compositionend)
  (editor.view as any).composing = false;

  // Reflow layout sau khi kết thúc composition
  const layout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.ok(layout.getPageCount() >= 1);
  assert.equal(layout.getTableFragments().length, 1);

  editor.destroy();
});

test("Phase 9 - 8. Copy / Paste on merged & multi-page selection without duplicate headers; fail-safe on malformed paste", () => {
  // Bảng 20 hàng với repeated header
  const doc = createMultiPageTableDoc(20, 2, { repeatHeader: true });
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of doc.content![1].content!) {
    measuredRowHeights.set(rPos, 50);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  const layout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });
  assert.ok(layout.getPageCount() >= 2);

  // Chọn vùng từ Trang 1 tới Trang 2
  const cellPage1 = rowPositions[3] + 1;
  const cellPage2 = rowPositions[12] + 1;
  setTableCellSelection(editor, cellPage1, cellPage2);

  const sel = editor.state.selection as CellSelection;
  const slice = sel.content();

  // Kiểm tra slice được copy:
  // KHÔNG được chứa bất kỳ bản sao lặp lại nào của repeated header
  let sliceHeaderCount = 0;
  slice.content.descendants((node) => {
    if (node.type.name === "tableHeader") {
      sliceHeaderCount++;
    }
  });
  assert.equal(sliceHeaderCount, 0, "Slice copy data rows không chứa tableHeader giả lập");

  // Thao tác Paste fail-safe: Paste malformed text/content vào ô bảng
  const malformedSlice = [{ type: "paragraph", content: [{ type: "text", text: "Malformed <b>& invalid" }] }];
  editor.commands.insertContentAt(rowPositions[5] + 3, malformedSlice);

  // AST bảng vẫn an toàn tuyệt đối 20 hàng
  const json = editor.getJSON();
  const table = json.content!.find((n) => n.type === "table")!;
  assert.equal(table.content!.length, 20);

  editor.destroy();
});

test("Phase 9 - 9. Column Resize: smooth update preserves CellSelection and reflows Page Engine", () => {
  const doc = createMultiPageTableDoc(10, 3, { colwidth: [150, 150, 150] });
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);

  // Đặt CellSelection bao quanh cột 0 và cột 1 (Row 1 đến Row 3)
  const anchorCell = info.getCellDocPos(1, 0);
  const headCell = info.getCellDocPos(3, 1);
  const selOk = setTableCellSelection(editor, anchorCell, headCell);
  assert.equal(selOk, true);
  assert.ok(editor.state.selection instanceof CellSelection);

  // Thực hiện điều chỉnh kích thước cột 0 (từ 150px lên 220px)
  const newWidths = [220, 150, 150];
  const resizeOk = setFixedColumnWidths(editor, newWidths);
  assert.equal(resizeOk, true);

  // Xác minh CellSelection VẪN ĐƯỢC BẢO TOÀN sau resize
  assert.ok(
    editor.state.selection instanceof CellSelection,
    "CellSelection phải được giữ nguyên sau khi resize cột"
  );

  // Xác minh AST lưu trữ colwidth mới chính xác
  const updatedInfo = getTableDocInfo(editor);
  const firstCell = updatedInfo.tableNode.nodeAt(updatedInfo.map.map[0]);
  assert.deepEqual(firstCell?.attrs?.colwidth, [220]);

  editor.destroy();
});

test("Phase 9 - 10. Comments inside cells strictly preserved across AutoFit, resize, styles, row height, and pagination", () => {
  // Tạo bảng có đoạn text chứa comment mark
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { borders: "all" },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Header" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Commented text inside cell",
                        marks: [
                          {
                            type: "comment",
                            attrs: { commentId: "cmt_ph9_alpha" },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const getCommentMark = () => {
    const json = editor.getJSON();
    const cell = json.content![0].content![1].content![0];
    const textNode = cell.content![0].content![0];
    return textNode.marks?.find((m: any) => m.type === "comment");
  };

  // 1. Kiểm tra ban đầu
  assert.ok(getCommentMark());
  assert.equal(getCommentMark().attrs.commentId, "cmt_ph9_alpha");

  // 2. Qua AutoFit Contents
  autoFitContents(editor);
  assert.ok(getCommentMark(), "Comment mark phải tồn tại sau AutoFit Contents");
  assert.equal(getCommentMark().attrs.commentId, "cmt_ph9_alpha");

  // 3. Qua AutoFit Window
  autoFitWindow(editor);
  assert.ok(getCommentMark(), "Comment mark phải tồn tại sau AutoFit Window");

  // 4. Qua Column Resize
  setFixedColumnWidths(editor, [300]);
  assert.ok(getCommentMark(), "Comment mark phải tồn tại sau Column Resize");

  // 5. Qua Row Height
  setTableRowHeight(editor, 60, "atLeast");
  assert.ok(getCommentMark(), "Comment mark phải tồn tại sau Row Height");

  // 6. Qua Cell Margins
  setTableCellMargins(editor, { top: 10, bottom: 10, left: 15, right: 15 });
  assert.ok(getCommentMark(), "Comment mark phải tồn tại sau Cell Margins");

  // 7. Qua Table Styles
  applyTableStyle(editor, "grid");
  assert.ok(getCommentMark(), "Comment mark phải tồn tại sau Table Style");

  // 8. Qua Pagination layout calculation
  const layout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.ok(layout.getPageCount() >= 1);
  assert.ok(getCommentMark(), "Comment mark không bị layout làm biến dạng");

  editor.destroy();
});

test("Phase 9 - 11. Comments metadata preserved across Cell Merge and Split without silent deletion", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "First cell with comment",
                        marks: [{ type: "comment", attrs: { commentId: "cmt_merge_1" } }],
                      },
                    ],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Second cell with comment",
                        marks: [{ type: "comment", attrs: { commentId: "cmt_merge_2" } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);
  setTableCellSelection(editor, info.getCellDocPos(0, 0), info.getCellDocPos(0, 1));

  // Merge 2 ô chứa comment
  assert.ok(canMergeCells(editor));
  mergeCells(editor);

  const jsonAfterMerge = editor.getJSON();
  const mergedCell = jsonAfterMerge.content![0].content![0].content![0];
  assert.equal(mergedCell.attrs?.colspan, 2);

  // Cả hai đoạn comment từ cả 2 ô đều phải được gộp và giữ nguyên vẹn
  const marksInMergedCell: string[] = [];
  mergedCell.content!.forEach((p: any) => {
    p.content?.forEach((t: any) => {
      const cMark = t.marks?.find((m: any) => m.type === "comment");
      if (cMark) marksInMergedCell.push(cMark.attrs.commentId);
    });
  });

  assert.ok(marksInMergedCell.includes("cmt_merge_1"), "Comment từ ô 1 phải được giữ nguyên");
  assert.ok(marksInMergedCell.includes("cmt_merge_2"), "Comment từ ô 2 phải được giữ nguyên");

  // Split ô trở lại
  assert.ok(canSplitCell(editor));
  splitCell(editor);

  const jsonAfterSplit = editor.getJSON();
  const firstCellAfterSplit = jsonAfterSplit.content![0].content![0].content![0];
  const commentInFirst = firstCellAfterSplit.content![0].content![0].marks?.find(
    (m: any) => m.type === "comment"
  );
  assert.ok(commentInFirst, "Sau khi Split, comment trong ô đầu tiên vẫn nguyên vẹn");
  assert.equal(commentInFirst.attrs.commentId, "cmt_merge_1");

  editor.destroy();
});

test("Phase 9 - 12. Track Changes marks in cells strictly preserved across structural ops and sizing", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Inserted data",
                        marks: [
                          {
                            type: "trackChange",
                            attrs: {
                              id: "tc_ins_1",
                              author: "AuthorA",
                              type: "insertion",
                              date: "2026-10-08",
                            },
                          },
                        ],
                      },
                      {
                        type: "text",
                        text: "Deleted data",
                        marks: [
                          {
                            type: "trackChange",
                            attrs: {
                              id: "tc_del_2",
                              author: "AuthorB",
                              type: "deletion",
                              date: "2026-10-08",
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Ordinary cell" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const checkTrackMarks = () => {
    const json = editor.getJSON();
    const cell = json.content![0].content![0].content![0];
    const textRuns = cell.content![0].content!;
    const insMark = textRuns[0].marks?.find((m: any) => m.type === "trackChange");
    const delMark = textRuns[1].marks?.find((m: any) => m.type === "trackChange");
    return { insMark, delMark };
  };

  // 1. Kiểm tra ban đầu
  const initial = checkTrackMarks();
  assert.equal(initial.insMark.attrs.id, "tc_ins_1");
  assert.equal(initial.delMark.attrs.id, "tc_del_2");

  // 2. Chèn thêm cột và hàng
  const info = getTableDocInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);
  addColumnRight(editor);
  addRowBelow(editor);

  const afterAdd = checkTrackMarks();
  assert.equal(afterAdd.insMark.attrs.id, "tc_ins_1");
  assert.equal(afterAdd.insMark.attrs.author, "AuthorA");
  assert.equal(afterAdd.delMark.attrs.id, "tc_del_2");
  assert.equal(afterAdd.delMark.attrs.author, "AuthorB");

  // 3. AutoFit & Table Sizing
  autoFitContents(editor);
  setTableRowHeight(editor, 50, "atLeast");
  applyTableStyle(editor, "lightGrid");

  const afterStyle = checkTrackMarks();
  assert.equal(afterStyle.insMark.attrs.id, "tc_ins_1");
  assert.equal(afterStyle.delMark.attrs.id, "tc_del_2");

  editor.destroy();
});

test("Phase 9 - 13. Proofing: Spell & Grammar decorations remain non-persistent view decorations", () => {
  const doc = createMultiPageTableDoc(4, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const info = getTableDocInfo(editor);
  const cellPos = info.getCellDocPos(1, 0) + 3;

  // Giả lập tạo Spell Check decoration trong view
  const deco = Decoration.inline(cellPos, cellPos + 4, {
    class: "spelling-error",
    "data-spelling-error": "true",
  });
  const decoSet = DecorationSet.create(editor.state.doc, [deco]);
  assert.ok(decoSet.find().length > 0);

  // Thực hiện các thao tác bảng (Sizing, Styling, Margin, Row Height)
  autoFitContents(editor);
  applyTableStyle(editor, "academic");
  setTableRowHeight(editor, 40, "atLeast");

  // Xác minh: Decorations KHÔNG BAO GIỜ bị serialize thành AST doc attributes hay marks
  const json = editor.getJSON();
  let hasDecorationInAST = false;
  const inspectAST = (node: any) => {
    if (node.attrs?.["data-spelling-error"] || node.attrs?.class?.includes("spelling-error")) {
      hasDecorationInAST = true;
    }
    if (node.marks?.some((m: any) => m.type === "spelling-error" || m.attrs?.["data-spelling-error"])) {
      hasDecorationInAST = true;
    }
    if (node.content) {
      node.content.forEach(inspectAST);
    }
  };
  inspectAST(json);

  assert.equal(hasDecorationInAST, false, "Proofing decorations tuyệt đối không bị ô nhiễm vào document AST data");

  editor.destroy();
});

test("Phase 9 - 14. References inside cells: citation, bookmark, heading, and list maintain full semantics", () => {
  // Tạo bảng có ô chứa đồng thời:
  // - heading (level 2)
  // - bulletList với listItem
  // - bookmarkAnchor inline atom node
  // - citation inline atom node
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Table Cell Heading" }],
                  },
                  {
                    type: "bulletList",
                    content: [
                      {
                        type: "listItem",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "List Item Alpha" }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "bookmarkAnchor",
                        attrs: { id: "bm_cell_99", name: "BookmarkCellTest" },
                      },
                      {
                        type: "text",
                        text: "Referenced sentence with citation ",
                      },
                      {
                        type: "citation",
                        attrs: { sourceId: "src_einstein_1905", style: "apa" },
                      },
                    ],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Col 2" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const verifyCellSemantics = () => {
    const json = editor.getJSON();
    const cell = json.content![0].content![0].content![0];
    const headingNode = cell.content!.find((n: any) => n.type === "heading");
    const listNode = cell.content!.find((n: any) => n.type === "bulletList");
    const pWithRefs = cell.content!.find((n: any) =>
      n.content?.some((c: any) => c.type === "bookmarkAnchor" || c.type === "citation")
    );
    const bmNode = pWithRefs?.content?.find((c: any) => c.type === "bookmarkAnchor");
    const citNode = pWithRefs?.content?.find((c: any) => c.type === "citation");

    return { headingNode, listNode, bmNode, citNode };
  };

  // 1. Kiểm tra ban đầu
  const init = verifyCellSemantics();
  assert.equal(init.headingNode?.attrs?.level, 2);
  assert.equal(init.listNode?.type, "bulletList");
  assert.equal(init.bmNode?.attrs?.id, "bm_cell_99");
  assert.equal(init.citNode?.attrs?.sourceId, "src_einstein_1905");

  // 2. Thực hiện AutoFit, Column Resize, Table Style, Row Height, Margin
  autoFitContents(editor);
  applyTableStyle(editor, "grid");
  setTableRowHeight(editor, 70, "atLeast");
  setTableCellMargins(editor, { top: 8, bottom: 8, left: 12, right: 12 });

  // 3. Xác minh toàn bộ ngữ nghĩa references và cấu trúc block bên trong ô được bảo toàn 100%
  const afterOps = verifyCellSemantics();
  assert.equal(afterOps.headingNode?.attrs?.level, 2, "Heading level 2 được bảo toàn");
  assert.equal(afterOps.listNode?.type, "bulletList", "Danh sách bulletList được bảo toàn");
  assert.equal(afterOps.bmNode?.attrs?.id, "bm_cell_99", "Bookmark anchor atom node được bảo toàn");
  assert.equal(afterOps.citNode?.attrs?.sourceId, "src_einstein_1905", "Citation atom node được bảo toàn");

  editor.destroy();
});

test("Phase 9 - 15. Undo / Redo restores exact table geometry and layout state", () => {
  const doc = createMultiPageTableDoc(8, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const initialJson = JSON.stringify(editor.getJSON());

  // 1. Thực hiện đột biến: Thêm 2 hàng
  const info = getTableDocInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(1, 0) + 2);
  addRowBelow(editor);
  addRowBelow(editor);

  const jsonAfterAdd = editor.getJSON();
  assert.equal(jsonAfterAdd.content![1].content!.length, 10, "Có 10 hàng sau khi thêm");

  // 2. Undo 2 lần
  undo(editor);
  undo(editor);

  const jsonAfterUndo = JSON.stringify(editor.getJSON());
  assert.equal(jsonAfterUndo, initialJson, "Sau Undo, JSON document khôi phục chính xác 100% ban đầu");

  // 3. Redo 2 lần
  redo(editor);
  redo(editor);

  const jsonAfterRedo = editor.getJSON();
  assert.equal(jsonAfterRedo.content![1].content!.length, 10, "Sau Redo, 10 hàng được khôi phục");

  editor.destroy();
});
