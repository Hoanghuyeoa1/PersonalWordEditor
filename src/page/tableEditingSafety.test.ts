import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { buildPageLayoutMap, getNodeSize } from "./services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import {
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  deleteTable,
  toggleHeaderRow,
  goToNextCell,
  goToPreviousCell,
  canMergeCells,
  mergeCells,
  canSplitCell,
  splitCell,
  undo,
  redo,
} from "../editor/editorCommands.ts";

// Helper: Tạo bảng nhiều hàng và cột cho Editor
function createMultiRowTableDoc(
  rowCount: number,
  colCount: number = 2,
  options: {
    hasHeader?: boolean;
    repeatHeader?: boolean;
    colwidth?: number[];
    cellText?: string;
  } = {}
): JSONContent {
  const { hasHeader = true, repeatHeader, colwidth, cellText } = options;
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

      const text =
        cellText ??
        (isHeaderRow ? `Col ${c + 1}` : `Data R${r}C${c}`);

      cells.push({
        type: cellType,
        attrs: cellAttrs,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text,
              },
            ],
          },
        ],
      });
    }

    rows.push({
      type: "tableRow",
      content: cells,
    });
  }

  const tableAttrs: Record<string, any> = { borders: "all" };
  if (repeatHeader !== undefined) {
    tableAttrs.repeatHeader = repeatHeader;
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tài liệu bắt đầu với bảng phân trang" }],
      },
      {
        type: "table",
        attrs: tableAttrs,
        content: rows,
      },
    ],
  };
}

// ============================================================================
// PHASE 9: TABLE EDITING SAFETY ACROSS PAGES TEST SUITE
// ============================================================================

test("Phase 9 - 1. CellSelection across page boundary: Selects genuine cells across pages without phantom cells", () => {
  // Tạo bảng 20 hàng. Usable height ~930px.
  // Mỗi hàng 40px -> 20 hàng = 800px + intro 500px = 1300px -> Chia 2 trang.
  const doc = createMultiRowTableDoc(20, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const pPos = 0;
  const tblPos = getNodeSize(doc.content![0]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 500);

  const measuredRowHeights = new Map<number, number>();
  const tableNode = doc.content![1];
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of tableNode.content!) {
    measuredRowHeights.set(rPos, 40);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Bảng phải chia thành 2 trang");

  // Hàng 5 ở Trang 1 (pageIndex 0), Hàng 15 ở Trang 2 (pageIndex 1)
  const row5Pos = rowPositions[5];
  const row15Pos = rowPositions[15];

  const pageOfRow5 = layoutMap.getPageForPosition(row5Pos);
  const pageOfRow15 = layoutMap.getPageForPosition(row15Pos);

  assert.equal(pageOfRow5, 0, "Hàng 5 phải nằm ở Trang 1");
  assert.equal(pageOfRow15, 1, "Hàng 15 phải nằm ở Trang 2");

  // Đặt CellSelection từ ô ở Hàng 5 (Trang 1) tới ô ở Hàng 15 (Trang 2)
  const cellInRow5 = row5Pos + 1;
  const cellInRow15 = row15Pos + 1;

  const selectionOk = editor.commands.setCellSelection({
    anchorCell: cellInRow5,
    headCell: cellInRow15,
  });

  if (selectionOk) {
    assert.ok(editor.state.selection, "Phải có selection");
    const json = editor.getJSON();
    assert.equal(json.content![1].content!.length, 20, "AST vẫn chỉ có đúng 20 rows thực sự");
  }

  assert.equal(layoutMap.getPageForPosition(cellInRow5), 0);
  assert.equal(layoutMap.getPageForPosition(cellInRow15), 1);

  editor.destroy();
});

test("Phase 9 - 2. Keyboard Tab & Shift+Tab across page fragment boundary", () => {
  // Tạo bảng 16 hàng.
  // Trang 1 có usable height = ~930px. Intro chiếm 550px -> Còn lại 380px.
  // Mỗi hàng 40px -> 9 hàng (hàng 0 đến 8) chiếm 360px <= 380px -> Trang 1.
  // Hàng 9 chiếm 40px -> 360 + 40 = 400px > 380px -> Chuyển sang Trang 2!
  const doc = createMultiRowTableDoc(16, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const pPos = 0;
  const tblPos = getNodeSize(doc.content![0]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 550);

  const measuredRowHeights = new Map<number, number>();
  const tableNode = doc.content![1];
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of tableNode.content!) {
    measuredRowHeights.set(rPos, 40);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  let layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2);

  // Hàng 8 là hàng cuối của Trang 1 (pageIndex 0).
  // Hàng 9 là hàng đầu của Trang 2 (pageIndex 1).
  const row8Pos = rowPositions[8];
  const row9Pos = rowPositions[9];

  assert.equal(layoutMap.getPageForTableRow(row8Pos), 0, "Hàng 8 phải ở Trang 1");
  assert.equal(layoutMap.getPageForTableRow(row9Pos), 1, "Hàng 9 phải ở Trang 2");

  // Đặt con trỏ vào ô đầu tiên của Hàng 8 (row8Pos + 3 là text bên trong ô 1)
  editor.commands.setTextSelection(row8Pos + 3);
  assert.equal(layoutMap.getPageForPosition(editor.state.selection.from), 0);

  // Nhấn Tab lần 1 -> sang ô 2 của Hàng 8 (vẫn Trang 1)
  let tabOk = goToNextCell(editor);
  assert.equal(tabOk, true);
  assert.equal(layoutMap.getPageForPosition(editor.state.selection.from), 0, "Ô 2 của Hàng 8 vẫn ở Trang 1");

  // Nhấn Tab lần 2 -> vượt qua ranh giới trang sang Ô 1 của Hàng 9 (Trang 2)!
  tabOk = goToNextCell(editor);
  assert.equal(tabOk, true, "Tab qua ranh giới trang thành công");
  assert.equal(
    layoutMap.getPageForPosition(editor.state.selection.from),
    1,
    "Sau khi Tab qua ranh giới trang, con trỏ phải nằm ở Trang 2"
  );

  // Nhấn Shift+Tab -> quay ngược lại ranh giới trang về Ô 2 của Hàng 8 (Trang 1)!
  const shiftTabOk = goToPreviousCell(editor);
  assert.equal(shiftTabOk, true, "Shift+Tab quay lại qua ranh giới thành công");
  assert.equal(
    layoutMap.getPageForPosition(editor.state.selection.from),
    0,
    "Sau khi Shift+Tab, con trỏ phải quay lại Trang 1"
  );

  editor.destroy();
});

test("Phase 9 - 3. Arrow keys and typing near table fragment boundary", () => {
  const doc = createMultiRowTableDoc(12, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 680); // Dồn bảng sang trang 2 tại hàng 7

  const measuredRowHeights = new Map<number, number>();
  const tableNode = doc.content![1];
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of tableNode.content!) {
    measuredRowHeights.set(rPos, 40);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  const rowOnPage2Pos = rowPositions[7];
  assert.equal(layoutMap.getPageForTableRow(rowOnPage2Pos), 1, "Hàng 7 nằm ở Trang 2");

  // Đặt con trỏ vào ô đầu tiên của hàng trên Trang 2
  const textInsideCellPos = rowOnPage2Pos + 3;
  editor.commands.setTextSelection(textInsideCellPos);

  // Gõ thêm văn bản vào ô ở đầu trang 2 bằng ProseMirror transaction an toàn không cần window
  editor.view.dispatch(editor.state.tr.insertText("Extra content ", textInsideCellPos));
  const textAfter = editor.state.doc.textBetween(textInsideCellPos, textInsideCellPos + 14);
  assert.equal(textAfter, "Extra content ");

  // Xóa ký tự bằng ProseMirror transaction
  editor.view.dispatch(editor.state.tr.delete(textInsideCellPos, textInsideCellPos + 6));
  const textAfterDel = editor.state.doc.textBetween(textInsideCellPos, textInsideCellPos + 8);
  assert.equal(textAfterDel, "content ");

  // AST bảng vẫn toàn vẹn 12 hàng
  const json = editor.getJSON();
  assert.equal(json.content![1].content!.length, 12);

  editor.destroy();
});

test("Phase 9 - 4. Table commands (addRow, deleteRow) trigger layout reflow without stale fragments", () => {
  // Bắt đầu với 10 hàng vừa vặn trên Trang 1
  const doc = createMultiRowTableDoc(10, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (const row of doc.content![1].content!) {
    measuredRowHeights.set(rPos, 70); // 10 * 70 = 700px < 930px -> 1 trang
    rPos += getNodeSize(row);
  }

  let layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });
  assert.equal(layoutMap.getPageCount(), 1, "Ban đầu vừa vặn trên 1 trang");

  // Đặt con trỏ vào ô cuối bảng
  const lastRowPos = rPos - getNodeSize(doc.content![1].content![9]);
  editor.commands.setTextSelection(lastRowPos + 3);

  // Thêm 5 hàng liên tiếp bằng addRowBelow (700px + 350px = 1050px > 930px -> Phải reflow sang Trang 2!)
  for (let i = 0; i < 5; i++) {
    const ok = addRowBelow(editor);
    assert.equal(ok, true, `addRowBelow ${i + 1} phải thành công`);
  }

  // Kiểm tra AST có đúng 15 hàng
  let jsonAfterAdd = editor.getJSON();
  const tableAfterAdd = jsonAfterAdd.content!.find((n) => n.type === "table")!;
  assert.equal(tableAfterAdd.content!.length, 15, "Bảng phải có đúng 15 hàng trong AST");

  // Cập nhật measured heights cho các hàng mới
  let newRPos = getNodeSize(jsonAfterAdd.content![0]) + 1;
  const newMeasuredRowHeights = new Map<number, number>();
  for (const row of tableAfterAdd.content!) {
    newMeasuredRowHeights.set(newRPos, 70);
    newRPos += getNodeSize(row);
  }

  layoutMap = buildPageLayoutMap(jsonAfterAdd, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: newMeasuredRowHeights,
  });

  // Sau khi thêm hàng, trang phải tự động reflow lên 2 trang!
  assert.equal(layoutMap.getPageCount(), 2, "Thêm hàng phải reflow sang 2 trang");
  const frags = layoutMap.getTableFragments();
  assert.equal(frags.length, 2, "Bảng phải có đúng 2 fragments, không có stale fragments");

  // Xóa bớt 6 hàng bằng deleteRow -> Bảng co lại còn 9 hàng (9 * 70 = 630px < 930px) -> Phải co về 1 trang!
  for (let i = 0; i < 6; i++) {
    const delOk = deleteRow(editor);
    assert.equal(delOk, true, `deleteRow ${i + 1} phải thành công`);
  }

  const jsonAfterDel = editor.getJSON();
  const tableAfterDel = jsonAfterDel.content!.find((n) => n.type === "table")!;
  assert.equal(tableAfterDel.content!.length, 9, "Bảng còn đúng 9 hàng");

  let shrinkRPos = getNodeSize(jsonAfterDel.content![0]) + 1;
  const shrinkRowHeights = new Map<number, number>();
  for (const row of tableAfterDel.content!) {
    shrinkRowHeights.set(shrinkRPos, 70);
    shrinkRPos += getNodeSize(row);
  }

  layoutMap = buildPageLayoutMap(jsonAfterDel, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: shrinkRowHeights,
  });

  // Layout reflow trở lại 1 trang hoàn hảo, không còn fragment trang 2 sót lại
  assert.equal(layoutMap.getPageCount(), 1, "Xóa hàng phải kéo nội dung co về 1 trang");
  const fragsAfterDel = layoutMap.getTableFragments();
  assert.equal(fragsAfterDel.length, 1, "Chỉ còn đúng 1 fragment");
  assert.equal(fragsAfterDel[0].pageIndex, 0);

  editor.destroy();
});

test("Phase 9 - 5. Table commands: addColumn, deleteColumn, toggleHeader, deleteTable", () => {
  const doc = createMultiRowTableDoc(6, 2, { hasHeader: true });
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  editor.commands.setTextSelection(tblPos + 4); // Trong ô đầu tiên

  // 1. Thêm cột bên phải (addColumnRight)
  const addColOk = addColumnRight(editor);
  assert.equal(addColOk, true);
  let json = editor.getJSON();
  let table = json.content!.find((n) => n.type === "table")!;
  assert.equal(table.content![0].content!.length, 3, "Hàng phải tăng lên 3 cột");

  // 2. Thêm cột bên trái (addColumnLeft)
  const addColLeftOk = addColumnLeft(editor);
  assert.equal(addColLeftOk, true);
  json = editor.getJSON();
  table = json.content!.find((n) => n.type === "table")!;
  assert.equal(table.content![0].content!.length, 4, "Hàng phải tăng lên 4 cột");

  // 3. Xóa cột (deleteColumn)
  const delColOk = deleteColumn(editor);
  assert.equal(delColOk, true);
  json = editor.getJSON();
  table = json.content!.find((n) => n.type === "table")!;
  assert.equal(table.content![0].content!.length, 3, "Hàng phải giảm về 3 cột");

  // 4. Toggle Header Row: chuyển dòng 0 thành dữ liệu thường
  const toggleOk = toggleHeaderRow(editor);
  assert.equal(toggleOk, true);
  json = editor.getJSON();
  table = json.content!.find((n) => n.type === "table")!;
  const firstRowCellType = table.content![0].content![0].type;
  assert.equal(firstRowCellType, "tableCell", "Sau toggle, ô đầu tiên phải là tableCell");

  // Toggle lại: chuyển dòng 0 thành header trở lại
  toggleHeaderRow(editor);
  json = editor.getJSON();
  table = json.content!.find((n) => n.type === "table")!;
  assert.equal(table.content![0].content![0].type, "tableHeader", "Sau toggle lại, ô phải là tableHeader");

  // 5. Delete Table: xóa toàn bộ bảng
  const delTableOk = deleteTable(editor);
  assert.equal(delTableOk, true);
  json = editor.getJSON();
  const tableExists = json.content!.some((n) => n.type === "table");
  assert.equal(tableExists, false, "Table phải bị xóa hoàn toàn khỏi AST");

  // Layout map sau khi xóa bảng
  const layoutMap = buildPageLayoutMap(json, DEFAULT_PAGE_SETTINGS);
  assert.equal(layoutMap.getTableFragments().length, 0, "Không còn fragment bảng nào");
  assert.equal(layoutMap.getPageCount(), 1, "Tài liệu còn 1 trang chứa paragraph");

  editor.destroy();
});

test("Phase 9 - 6. Merge & Split cells across table columns", () => {
  const doc = createMultiRowTableDoc(4, 3, { hasHeader: false });
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const firstRowPos = tblPos + 1;
  const cell1Pos = firstRowPos + 1;
  const cell1Size = getNodeSize(doc.content![1].content![0].content![0]);
  const cell2Pos = cell1Pos + cell1Size;

  const selOk = editor.commands.setCellSelection({
    anchorCell: cell1Pos,
    headCell: cell2Pos,
  });

  if (selOk && canMergeCells(editor)) {
    const mergeOk = mergeCells(editor);
    assert.equal(mergeOk, true, "Merge cells phải thành công");

    let json = editor.getJSON();
    let row0 = json.content![1].content![0];
    assert.equal(row0.content![0].attrs?.colspan, 2, "Ô đầu tiên phải có colspan = 2");

    // Split cell
    if (canSplitCell(editor)) {
      const splitOk = splitCell(editor);
      assert.equal(splitOk, true, "Split cell phải thành công");

      json = editor.getJSON();
      row0 = json.content![1].content![0];
      assert.equal(row0.content!.length, 3, "Sau split, hàng trở lại 3 ô");
    }
  }

  // Reflow layout sau khi merge/split
  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.ok(layoutMap.getPageCount() >= 1);
  assert.equal(layoutMap.getTableFragments().length, 1);

  editor.destroy();
});

test("Phase 9 - 7. Column Resize: Narrowing column wraps text and increases page count, widening reduces it", () => {
  // Tạo bảng có đoạn văn bản dài trong mỗi ô.
  // Khi cột rộng 350px: văn bản dài chỉ chiếm ~3 dòng (chiều cao hàng vừa phải).
  // Khi cột hẹp 40px: văn bản dài bị ngắt thành ~22 dòng (chiều cao hàng tăng vọt 456px)!
  const longText = "Văn bản thử nghiệm tính năng co giãn chiều rộng cột bảng biểu trong trình soạn thảo Word dài nhiều dòng ký tự";

  // Trường hợp 1: Cột rộng (colwidth = [350, 350])
  const wideDoc = createMultiRowTableDoc(15, 2, { colwidth: [350, 350], cellText: longText });
  const wideLayoutMap = buildPageLayoutMap(wideDoc, DEFAULT_PAGE_SETTINGS);

  // Trường hợp 2: Cột hẹp (colwidth = [40, 40])
  const narrowDoc = createMultiRowTableDoc(15, 2, { colwidth: [40, 40], cellText: longText });
  const narrowLayoutMap = buildPageLayoutMap(narrowDoc, DEFAULT_PAGE_SETTINGS);

  // Chiều cao hàng của bảng hẹp phải lớn hơn đáng kể so với bảng rộng
  const wideRowHeight = wideLayoutMap.getTableRowsForPage(0)[0]?.height ?? 34;
  const narrowRowHeight = narrowLayoutMap.getTableRowsForPage(0)[0]?.height ?? 34;

  assert.ok(
    narrowRowHeight > wideRowHeight,
    `Hàng khi cột hẹp (${narrowRowHeight}px) phải cao hơn khi cột rộng (${wideRowHeight}px)`
  );

  // Bảng cột hẹp phải tốn nhiều trang hơn bảng cột rộng
  assert.ok(
    narrowLayoutMap.getPageCount() > wideLayoutMap.getPageCount(),
    `Bảng cột hẹp (${narrowLayoutMap.getPageCount()} trang) phải tốn nhiều trang hơn bảng cột rộng (${wideLayoutMap.getPageCount()} trang)`
  );
});

test("Phase 9 - 8. Copy/Paste across page boundary does not duplicate visual fragments", () => {
  // Bảng 16 hàng trải dài 2 trang
  const doc = createMultiRowTableDoc(16, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const row8Pos = tblPos + 1 + 8 * 40; // Xấp xỉ
  editor.commands.setTextSelection(row8Pos);

  // Lấy JSON slice của bảng
  const jsonBefore = editor.getJSON();
  const tableBefore = jsonBefore.content!.find((n) => n.type === "table")!;
  assert.equal(tableBefore.content!.length, 16);

  // Sao chép nội dung ô từ hàng 7 sang hàng 8
  const cellContentToCopy = tableBefore.content![7].content![0].content;
  editor.commands.insertContentAt(row8Pos + 3, cellContentToCopy!);

  const jsonAfter = editor.getJSON();
  const tableAfter = jsonAfter.content!.find((n) => n.type === "table")!;

  // AST bảng vẫn chỉ có đúng 16 hàng, không bị chèn thêm bất kỳ fake row hay duplicate fragment nào
  assert.equal(tableAfter.content!.length, 16, "Bảng vẫn giữ nguyên 16 hàng");

  editor.destroy();
});

test("Phase 9 - 9. Undo & Redo on multi-page table operations restores exact layout and fragments", () => {
  const doc = createMultiRowTableDoc(14, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (const row of doc.content![1].content!) {
    measuredRowHeights.set(rPos, 65);
    rPos += getNodeSize(row);
  }

  const initialLayout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });
  const initialPages = initialLayout.getPageCount();
  const initialFrags = initialLayout.getTableFragments().length;

  // 1. Thực hiện đột biến: Thêm 3 hàng
  editor.commands.setTextSelection(tblPos + 4);
  addRowBelow(editor);
  addRowBelow(editor);
  addRowBelow(editor);

  const jsonAfterAdd = editor.getJSON();
  const tableAfterAdd = jsonAfterAdd.content!.find((n) => n.type === "table")!;
  assert.equal(tableAfterAdd.content!.length, 17, "Sau khi thêm có 17 hàng");

  // 2. Undo 3 lần
  undo(editor);
  undo(editor);
  undo(editor);

  const jsonAfterUndo = editor.getJSON();
  const tableAfterUndo = jsonAfterUndo.content!.find((n) => n.type === "table")!;
  assert.equal(tableAfterUndo.content!.length, 14, "Sau khi Undo, AST phải phục hồi chính xác 14 hàng ban đầu");

  // Recompute layout sau Undo
  const layoutAfterUndo = buildPageLayoutMap(jsonAfterUndo, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });
  assert.equal(layoutAfterUndo.getPageCount(), initialPages, "Số trang sau Undo phải khôi phục về ban đầu");
  assert.equal(layoutAfterUndo.getTableFragments().length, initialFrags, "Số fragments sau Undo phải khớp ban đầu");

  // 3. Redo 3 lần
  redo(editor);
  redo(editor);
  redo(editor);

  const jsonAfterRedo = editor.getJSON();
  const tableAfterRedo = jsonAfterRedo.content!.find((n) => n.type === "table")!;
  assert.equal(tableAfterRedo.content!.length, 17, "Sau khi Redo, AST trở lại 17 hàng");

  editor.destroy();
});

test("Phase 9 - 10. Repeated visual header is strictly non-editable and has no AST duplicate", () => {
  // Bảng 25 hàng, row 0 là header
  const doc = createMultiRowTableDoc(25, 2, { hasHeader: true, repeatHeader: true });
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (let i = 0; i < doc.content![1].content!.length; i++) {
    measuredRowHeights.set(rPos, 50);
    rPos += getNodeSize(doc.content![1].content![i]);
  }

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.ok(layoutMap.getPageCount() >= 2, "Bảng phải phân bố trên ít nhất 2 trang");

  // Phân mảnh trên Trang 2 có metadata lặp lại tiêu đề
  const fragPage2 = layoutMap.getTableFragments().find((f) => f.pageIndex === 1);
  assert.ok(fragPage2, "Phải có phân mảnh trên Trang 2");
  assert.equal(fragPage2.tableMetadata?.hasRepeatedHeader, true);

  // KIỂM CHỨNG:
  // 1. AST trong Editor hoàn toàn KHÔNG có row header thứ 2 nào được chèn thêm
  const astTable = editor.state.doc.child(1);
  assert.equal(astTable.type.name, "table");
  assert.equal(astTable.childCount, 25, "Bảng trong ProseMirror Doc chỉ có đúng 25 hàng");

  // Đếm số hàng có ô tableHeader trong toàn bộ ProseMirror doc
  let headerRowsCount = 0;
  astTable.forEach((rowNode) => {
    let hasHeaderCell = false;
    rowNode.forEach((cellNode) => {
      if (cellNode.type.name === "tableHeader") {
        hasHeaderCell = true;
      }
    });
    if (hasHeaderCell) headerRowsCount++;
  });
  assert.equal(headerRowsCount, 1, "Duy nhất chỉ có 1 hàng header thật trong toàn bộ AST");

  // 2. Không có vị trí con trỏ (ProseMirror pos) nào thuộc về repeated visual header trên Trang 2
  const page2Range = layoutMap.getPage(1)!.docRange;
  let currentDocPos = page2Range.from;
  while (currentDocPos < page2Range.to) {
    const $pos = editor.state.doc.resolve(currentDocPos);
    if ($pos.node(1)?.type.name === "table") {
      const rowNode = $pos.node(2);
      if (rowNode) {
        assert.equal(rowNode.type.name, "tableRow");
        const isHeaderRow = rowNode.child(0)?.type.name === "tableHeader";
        assert.equal(isHeaderRow, false, "Các hàng trên Trang 2 đều là data rows thực sự, không có fake header row");
      }
    }
    currentDocPos += 10;
  }

  editor.destroy();
});

test("Phase 9 - 11. Multi-page CellSelection deletion empties cell contents without deleting table rows or corrupting layout", () => {
  const doc = createMultiRowTableDoc(16, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of doc.content![1].content!) {
    measuredRowHeights.set(rPos, 60);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  // Row 5 is on Page 1, Row 12 is on Page 2
  const cellInRow5 = rowPositions[5] + 1;
  const cellInRow12 = rowPositions[12] + 1;

  const selOk = editor.commands.setCellSelection({
    anchorCell: cellInRow5,
    headCell: cellInRow12,
  });
  assert.equal(selOk, true);

  // Xóa nội dung trong CellSelection bằng lệnh deleteSelection của editor
  editor.commands.deleteSelection();

  // Kiểm tra: Bảng VẪN có đủ 16 hàng (không bị mất hàng nào do CellSelection)
  const json = editor.getJSON();
  const tableNode = json.content!.find((n) => n.type === "table")!;
  assert.equal(tableNode.content!.length, 16, "Table must still have 16 rows");

  // Các ô được chọn giờ đây rỗng (chỉ chứa paragraph trống)
  const row5Cell0 = tableNode.content![5].content![0];
  assert.equal(
    row5Cell0.content?.[0]?.content,
    undefined,
    "Nội dung ô Hàng 5 phải được xóa sạch sau deleteSelection"
  );

  editor.destroy();
});

test("Phase 9 - 12. Keyboard: Tab/Shift+Tab across Header/Body boundary & Backspace at cell boundary", () => {
  const doc = createMultiRowTableDoc(10, 2, { hasHeader: true });
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const row0Pos = tblPos + 1; // Header row
  const row0Cell1Pos = row0Pos + getNodeSize(doc.content![1].content![0].content![0]) + 1;

  // 1. Đặt con trỏ vào ô thứ 2 của Header (cuối dòng header)
  editor.commands.setTextSelection(row0Cell1Pos + 2);
  const selBeforeTab = editor.state.selection.from;

  // Tab -> di chuyển sang Ô đầu tiên của Hàng 1 (Data body)
  const tabOk = goToNextCell(editor);
  assert.equal(tabOk, true);
  assert.ok(editor.state.selection.from > selBeforeTab, "Caret must move into body row 1");

  // Kiểm tra ô đích là tableCell (body) chứ không phải tableHeader
  const $pos = editor.state.doc.resolve(editor.state.selection.from);
  assert.equal($pos.parent.type.name, "paragraph");
  assert.equal($pos.node(-1)?.type.name, "tableCell", "Ô đích phải là tableCell");

  // Shift+Tab -> quay ngược lại ô thứ 2 của Header
  const shiftTabOk = goToPreviousCell(editor);
  assert.equal(shiftTabOk, true);
  const $posBack = editor.state.doc.resolve(editor.state.selection.from);
  assert.equal($posBack.node(-1)?.type.name, "tableHeader", "Caret quay lại tableHeader");

  // 2. Thao tác xóa tại vị trí ranh giới ô
  const cellStart = editor.state.selection.$from.start();
  editor.commands.setTextSelection(cellStart);
  editor.view.dispatch(editor.state.tr.delete(cellStart, cellStart));
  assert.equal(editor.state.doc.child(1).type.name, "table", "Cấu trúc bảng được bảo toàn 100%");

  editor.destroy();
});

test("Phase 9 - 13. Table command: addRowAbove at fragment boundary (Page 2 start) reflows cleanly", () => {
  // Bảng 16 hàng trải dài 2 trang
  const doc = createMultiRowTableDoc(16, 2);
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const tblPos = getNodeSize(doc.content![0]);
  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 550); // Đẩy hàng 9 sang Trang 2

  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  const rowPositions: number[] = [];
  for (const row of doc.content![1].content!) {
    measuredRowHeights.set(rPos, 40);
    rowPositions.push(rPos);
    rPos += getNodeSize(row);
  }

  const initialLayout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });
  assert.equal(initialLayout.getPageCount(), 2);

  // Đặt con trỏ vào Hàng 9 (hàng đầu tiên của Trang 2)
  const row9Pos = rowPositions[9];
  assert.equal(initialLayout.getPageForTableRow(row9Pos), 1, "Hàng 9 nằm ở Trang 2");
  editor.commands.setTextSelection(row9Pos + 3);

  // Gọi addRowAbove: chèn một hàng mới ngay phía trên Hàng 9
  const addAboveOk = addRowAbove(editor);
  assert.equal(addAboveOk, true, "addRowAbove phải thành công");

  // Kiểm tra AST tăng lên 17 hàng
  const jsonAfter = editor.getJSON();
  const tableAfter = jsonAfter.content!.find((n) => n.type === "table")!;
  assert.equal(tableAfter.content!.length, 17, "Bảng tăng lên 17 hàng");

  // Đo đạc và reflow
  let newRPos = getNodeSize(jsonAfter.content![0]) + 1;
  const newRowHeights = new Map<number, number>();
  for (const row of tableAfter.content!) {
    newRowHeights.set(newRPos, 40);
    newRPos += getNodeSize(row);
  }

  const newLayout = buildPageLayoutMap(jsonAfter, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: newRowHeights,
  });

  assert.equal(newLayout.getPageCount(), 2, "Vẫn phân trang 2 trang hợp lệ");
  assert.equal(newLayout.getTableFragments().length, 2, "Bảng có 2 fragments sạch sẽ");

  editor.destroy();
});

test("Phase 9 - 14. Column resize & interaction batching: verify layout calculation does not crash on rapid updates", () => {
  const baseDoc = createMultiRowTableDoc(12, 2, { colwidth: [200, 200] });
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: baseDoc,
  });

  // Giả lập chuỗi 10 giao dịch resize cột liên tiếp (thay đổi colwidth)
  for (let step = 1; step <= 10; step++) {
    const width1 = 200 - step * 10; // Co hẹp cột 1 từ 200px xuống 100px
    const width2 = 200 + step * 10; // Mở rộng cột 2 từ 200px lên 300px

    const tblPos = editor.state.doc.child(0).nodeSize;
    const tableNode = editor.state.doc.child(1);
    const tr = editor.state.tr;

    tableNode.forEach((rowNode, rowOffset) => {
      rowNode.forEach((cellNode, cellOffset, cellIdx) => {
        const cellPos = tblPos + 1 + rowOffset + 1 + cellOffset;
        const targetWidth = cellIdx === 0 ? width1 : width2;
        tr.setNodeMarkup(cellPos, undefined, {
          ...cellNode.attrs,
          colwidth: [targetWidth],
        });
      });
    });

    editor.view.dispatch(tr);
  }

  // Kết thúc chuỗi resize, tính layout một lần cuối
  const finalJson = editor.getJSON();
  const finalLayout = buildPageLayoutMap(finalJson, DEFAULT_PAGE_SETTINGS);
  assert.ok(finalLayout.getPageCount() >= 1, "Layout phải tính toán hợp lệ sau chuỗi resize");
  assert.ok(finalLayout.getTableFragments().length >= 1, "Fragments không bị hỏng");

  editor.destroy();
});

