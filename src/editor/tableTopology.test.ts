import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  insertTable,
  mergeCells,
  canMergeCells,
  splitCell,
  canSplitCell,
  setTableCellSelection,
  getTableMap,
} from "./editorCommands.ts";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";

function createEditor(content?: any) {
  return new Editor({
    extensions: getEditorExtensions(),
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Khởi tạo kiểm thử topology bảng" }],
        },
      ],
    },
  });
}

/**
 * Helper tìm table node và tính document position chính xác của từng ô (row, col)
 */
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
    throw new Error("Không tìm thấy table trong tài liệu");
  }

  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1; // Vị trí ngay sau thẻ mở <table ...>

  const getCellDocPos = (row: number, col: number): number => {
    const offset = map.map[row * map.width + col];
    return tableStart + offset;
  };

  return { tablePos, tableNode, tableStart, map, getCellDocPos };
}

/* ==========================================================================
   PHASE 2 — ADVANCED CELL TOPOLOGY CORE TEST SUITE
   ========================================================================== */

test("Phase 2 - 1. Rowspan 2: Vertical merge 2 rows × 1 col in body produces valid rowspan=2", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 3, cols: 2, withHeaderRow: true });

  const { getCellDocPos } = getTablePosInfo(editor);
  // Chọn 2 ô dọc ở cột 0: Hàng 1 (Data) và Hàng 2 (Data)
  const cellRow1Col0 = getCellDocPos(1, 0);
  const cellRow2Col0 = getCellDocPos(2, 0);

  const selOk = setTableCellSelection(editor, cellRow1Col0, cellRow2Col0);
  assert.equal(selOk, true, "Phải thiết lập CellSelection dọc thành công");
  assert.equal(canMergeCells(editor), true, "canMergeCells phải trả về true");

  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true, "mergeCells phải thực thi thành công");

  // Kiểm tra AST
  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  assert.ok(table);

  const row1 = table.content?.[1];
  const row2 = table.content?.[2];

  // Hàng 1 có ô đầu với rowspan = 2, colspan = 1
  assert.equal(row1?.content?.[0]?.attrs?.rowspan, 2);
  assert.equal(row1?.content?.[0]?.attrs?.colspan, 1);

  // Hàng 2 bị ô trên chiếm chỗ ở cột 0 -> chỉ còn 1 ô (cột 1)
  assert.equal(row2?.content?.length, 1);

  // Kiểm tra TableMap validity
  const { tableNode: updatedTable, map: updatedMap } = getTablePosInfo(editor);
  assert.equal(updatedMap.problems, null, "TableMap không được có problems");
  const cellRect = updatedMap.findCell(updatedMap.map[1 * updatedMap.width + 0]);
  assert.equal(cellRect.top, 1);
  assert.equal(cellRect.bottom, 3);
  assert.equal(cellRect.left, 0);
  assert.equal(cellRect.right, 1);

  editor.destroy();
});

test("Phase 2 - 2. Rowspan 3: Vertical merge 3 rows × 1 col in body produces valid rowspan=3", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 4, cols: 2, withHeaderRow: true });

  const { getCellDocPos } = getTablePosInfo(editor);
  // Chọn 3 ô dọc ở cột 0: Hàng 1, Hàng 2, Hàng 3 (tất cả đều là Data rows)
  const anchorCell = getCellDocPos(1, 0);
  const headCell = getCellDocPos(3, 0);

  setTableCellSelection(editor, anchorCell, headCell);
  assert.equal(canMergeCells(editor), true);

  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true);

  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  const row1 = table?.content?.[1];
  assert.equal(row1?.content?.[0]?.attrs?.rowspan, 3);
  assert.equal(row1?.content?.[0]?.attrs?.colspan, 1);

  // Hàng 2 và Hàng 3 mỗi hàng chỉ còn 1 ô
  assert.equal(table?.content?.[2]?.content?.length, 1);
  assert.equal(table?.content?.[3]?.content?.length, 1);

  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null, "TableMap phải hoàn toàn hợp lệ");
  const cellRect = map.findCell(map.map[1 * map.width + 0]);
  assert.equal(cellRect.top, 1);
  assert.equal(cellRect.bottom, 4);

  editor.destroy();
});

test("Phase 2 - 3. Horizontal Colspan 3: Merge 1 row × 3 cols produces valid colspan=3", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 3, withHeaderRow: false });

  const { getCellDocPos } = getTablePosInfo(editor);
  // Chọn 3 ô ngang ở Hàng 1 (col 0, 1, 2)
  const anchorCell = getCellDocPos(1, 0);
  const headCell = getCellDocPos(1, 2);

  setTableCellSelection(editor, anchorCell, headCell);
  assert.equal(canMergeCells(editor), true);

  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true);

  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  const row1 = table?.content?.[1];

  // Hàng 1 giờ chỉ còn duy nhất 1 ô với colspan = 3, rowspan = 1
  assert.equal(row1?.content?.length, 1);
  assert.equal(row1?.content?.[0]?.attrs?.colspan, 3);
  assert.equal(row1?.content?.[0]?.attrs?.rowspan, 1);

  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null);
  const cellRect = map.findCell(map.map[1 * map.width + 0]);
  assert.equal(cellRect.left, 0);
  assert.equal(cellRect.right, 3);

  editor.destroy();
});

test("Phase 2 - 4. Rectangular 2×2: Merge 2 rows × 2 cols produces valid rowspan=2 & colspan=2", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 3, cols: 3, withHeaderRow: false });

  const { getCellDocPos } = getTablePosInfo(editor);
  // Chọn vùng 2x2: Hàng 1..2, Cột 0..1
  const anchorCell = getCellDocPos(1, 0);
  const headCell = getCellDocPos(2, 1);

  setTableCellSelection(editor, anchorCell, headCell);
  assert.equal(canMergeCells(editor), true);

  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true);

  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  const row1 = table?.content?.[1];
  const row2 = table?.content?.[2];

  // Ô đầu tiên có cả rowspan=2 và colspan=2
  assert.equal(row1?.content?.[0]?.attrs?.rowspan, 2);
  assert.equal(row1?.content?.[0]?.attrs?.colspan, 2);
  // Hàng 1 còn 2 ô (ô 2x2 và ô cột 2)
  assert.equal(row1?.content?.length, 2);
  // Hàng 2 chỉ còn 1 ô (cột 2)
  assert.equal(row2?.content?.length, 1);

  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null);
  const cellRect = map.findCell(map.map[1 * map.width + 0]);
  assert.equal(cellRect.top, 1);
  assert.equal(cellRect.bottom, 3);
  assert.equal(cellRect.left, 0);
  assert.equal(cellRect.right, 2);

  editor.destroy();
});

test("Phase 2 - 5. Larger Rectangle 3 rows × 2 cols: produces valid rowspan=3 & colspan=2", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 4, cols: 4, withHeaderRow: false });

  const { getCellDocPos } = getTablePosInfo(editor);
  // Chọn vùng 3x2: Hàng 1..3, Cột 1..2
  const anchorCell = getCellDocPos(1, 1);
  const headCell = getCellDocPos(3, 2);

  setTableCellSelection(editor, anchorCell, headCell);
  assert.equal(canMergeCells(editor), true);

  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true);

  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null);
  const cellRect = map.findCell(map.map[1 * map.width + 1]);
  assert.equal(cellRect.top, 1);
  assert.equal(cellRect.bottom, 4);
  assert.equal(cellRect.left, 1);
  assert.equal(cellRect.right, 3);

  editor.destroy();
});

test("Phase 2 - 6. Split Rowspan: Split cell with rowspan=2 restores original rows and clean empty cells", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 3, cols: 2, withHeaderRow: false });

  // Merge dọc 2 hàng ở cột 0
  let info = getTablePosInfo(editor);
  setTableCellSelection(editor, info.getCellDocPos(1, 0), info.getCellDocPos(2, 0));
  mergeCells(editor);

  // Đặt con trỏ vào ô đã merge (row 1, col 0)
  info = getTablePosInfo(editor);
  const mergedCellPos = info.getCellDocPos(1, 0);
  editor.commands.setTextSelection(mergedCellPos + 2);

  assert.equal(canSplitCell(editor), true, "canSplitCell phải trả về true trên ô rowspan=2");

  const splitOk = splitCell(editor);
  assert.equal(splitOk, true, "splitCell phải thực thi thành công");

  // Kiểm tra AST sau split
  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  const row1 = table?.content?.[1];
  const row2 = table?.content?.[2];

  assert.equal(row1?.content?.length, 2, "Hàng 1 phải phục hồi 2 ô");
  assert.equal(row2?.content?.length, 2, "Hàng 2 phải phục hồi 2 ô");

  assert.equal(row1?.content?.[0]?.attrs?.rowspan, 1);
  assert.equal(row1?.content?.[0]?.attrs?.colspan, 1);
  assert.equal(row2?.content?.[0]?.attrs?.rowspan, 1);
  assert.equal(row2?.content?.[0]?.attrs?.colspan, 1);

  // Kiểm tra TableMap validity sau split
  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null, "TableMap phải valid sau split");
  assert.equal(map.width, 2);
  assert.equal(map.height, 3);

  editor.destroy();
});

test("Phase 2 - 7. Split Colspan: Split cell with colspan=3 restores original column cells", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 3, withHeaderRow: false });

  let info = getTablePosInfo(editor);
  setTableCellSelection(editor, info.getCellDocPos(0, 0), info.getCellDocPos(0, 2));
  mergeCells(editor);

  info = getTablePosInfo(editor);
  const mergedPos = info.getCellDocPos(0, 0);
  editor.commands.setTextSelection(mergedPos + 2);

  assert.equal(canSplitCell(editor), true);
  const splitOk = splitCell(editor);
  assert.equal(splitOk, true);

  const json = editor.getJSON();
  const row0 = json.content?.find((n) => n.type === "table")?.content?.[0];
  assert.equal(row0?.content?.length, 3, "Hàng 0 phải phục hồi 3 ô");

  for (const cell of row0?.content || []) {
    assert.equal(cell.attrs?.colspan, 1);
    assert.equal(cell.attrs?.rowspan, 1);
  }

  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null);

  editor.destroy();
});

test("Phase 2 - 8. Split Rowspan + Colspan (2×2): restores all 4 individual grid cells", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 3, cols: 3, withHeaderRow: false });

  let info = getTablePosInfo(editor);
  setTableCellSelection(editor, info.getCellDocPos(1, 0), info.getCellDocPos(2, 1));
  mergeCells(editor);

  info = getTablePosInfo(editor);
  const mergedPos = info.getCellDocPos(1, 0);
  editor.commands.setTextSelection(mergedPos + 2);

  assert.equal(canSplitCell(editor), true);
  const splitOk = splitCell(editor);
  assert.equal(splitOk, true);

  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  assert.equal(table?.content?.[1]?.content?.length, 3, "Hàng 1 phải đủ 3 ô");
  assert.equal(table?.content?.[2]?.content?.length, 3, "Hàng 2 phải đủ 3 ô");

  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null);
  assert.equal(map.width, 3);
  assert.equal(map.height, 3);

  editor.destroy();
});

test("Phase 2 - 9. Invalid Selection Fail-Safe: Single cell, overlap or unmergeable selections are rejected", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 3, cols: 3, withHeaderRow: false });

  const beforeJson = JSON.stringify(editor.getJSON());

  // 1. Chỉ đứng ở 1 ô đơn lẻ (chưa chọn nhiều ô)
  assert.equal(canMergeCells(editor), false, "Không thể merge khi chỉ chọn 1 ô");
  const mergeSingle = mergeCells(editor);
  assert.equal(mergeSingle, false);

  // 2. Ô thường (1x1) không thể split
  assert.equal(canSplitCell(editor), false, "Không thể split ô 1x1 thông thường");
  const splitSingle = splitCell(editor);
  assert.equal(splitSingle, false);

  // 3. Document phải nguyên vẹn tuyệt đối
  assert.equal(JSON.stringify(editor.getJSON()), beforeJson);

  editor.destroy();
});

test("Phase 2 - 10. Header Merge Policy: Horizontal merge in Header is allowed; Vertical merge Header ↔ Body is strictly disabled", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 3, cols: 3, withHeaderRow: true });

  const { getCellDocPos } = getTablePosInfo(editor);

  // TRƯỜNG HỢP A: Merge ngang bên trong Header row (Row 0, Col 0..1)
  const headerCol0 = getCellDocPos(0, 0);
  const headerCol1 = getCellDocPos(0, 1);

  setTableCellSelection(editor, headerCol0, headerCol1);
  assert.equal(canMergeCells(editor), true, "Merge ngang trong Header row phải được phép");

  const mergeHeaderOk = mergeCells(editor);
  assert.equal(mergeHeaderOk, true);

  const jsonAfterHeaderMerge = editor.getJSON();
  const tableA = jsonAfterHeaderMerge.content?.find((n) => n.type === "table");
  const headerCell = tableA?.content?.[0]?.content?.[0];
  assert.equal(headerCell?.type, "tableHeader", "Ô hợp nhất trong header phải duy trì type tableHeader");
  assert.equal(headerCell?.attrs?.colspan, 2);

  // TRƯỜNG HỢP B: Merge dọc vượt ranh giới Header (Row 0) và Body (Row 1)
  // Đây là hành vi cấm theo Header Merge Policy để tránh lỗi lặp tiêu đề và phân trang!
  const updatedInfo = getTablePosInfo(editor);
  const headerCellPos = updatedInfo.getCellDocPos(0, 2); // Cột 2 của Header
  const bodyCellPos = updatedInfo.getCellDocPos(1, 2);   // Cột 2 của Body row 1

  setTableCellSelection(editor, headerCellPos, bodyCellPos);

  assert.equal(
    canMergeCells(editor),
    false,
    "canMergeCells PHẢI trả về false khi vùng chọn vượt ranh giới Header <-> Body"
  );

  const mergeCrossOk = mergeCells(editor);
  assert.equal(
    mergeCrossOk,
    false,
    "mergeCells PHẢI từ chối và trả về false để bảo vệ tính toàn vẹn của Header"
  );

  // Bảng phải giữ nguyên cấu trúc, không bị biến dạng
  const { map } = getTablePosInfo(editor);
  assert.equal(map.problems, null, "TableMap không bị corrupt");

  editor.destroy();
});

test("Phase 2 - 11. Content Preservation: Merging combines text and splitting preserves text in primary cell", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  let info = getTablePosInfo(editor);

  // Nhập nội dung riêng biệt vào 4 ô
  const pos00 = info.getCellDocPos(0, 0);
  const pos01 = info.getCellDocPos(0, 1);
  const pos10 = info.getCellDocPos(1, 0);
  const pos11 = info.getCellDocPos(1, 1);

  editor.commands.setTextSelection(pos00 + 2);
  editor.view.dispatch(editor.state.tr.insertText("Dữ liệu Ô A"));

  info = getTablePosInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);
  editor.view.dispatch(editor.state.tr.insertText("Dữ liệu Ô B"));

  info = getTablePosInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(1, 0) + 2);
  editor.view.dispatch(editor.state.tr.insertText("Dữ liệu Ô C"));

  info = getTablePosInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(1, 1) + 2);
  editor.view.dispatch(editor.state.tr.insertText("Dữ liệu Ô D"));

  // Merge cả 4 ô (2×2)
  info = getTablePosInfo(editor);
  setTableCellSelection(editor, info.getCellDocPos(0, 0), info.getCellDocPos(1, 1));
  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true);

  // Xác minh toàn bộ 4 đoạn văn bản được bảo toàn đầy đủ trong ô hợp nhất
  const textAfterMerge = editor.getText();
  assert.ok(textAfterMerge.includes("Dữ liệu Ô A"));
  assert.ok(textAfterMerge.includes("Dữ liệu Ô B"));
  assert.ok(textAfterMerge.includes("Dữ liệu Ô C"));
  assert.ok(textAfterMerge.includes("Dữ liệu Ô D"));

  // Split cell 2x2
  info = getTablePosInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  const splitOk = splitCell(editor);
  assert.equal(splitOk, true);

  // Nội dung tập trung ở ô đầu tiên, các ô còn lại là paragraph rỗng hợp lệ
  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  const firstCell = table?.content?.[0]?.content?.[0];
  const secondCell = table?.content?.[0]?.content?.[1];

  assert.ok(firstCell?.content?.length && firstCell.content.length >= 4);
  assert.equal(secondCell?.content?.length, 1);
  assert.equal(secondCell?.content?.[0]?.content, undefined, "Ô thứ 2 là empty paragraph hợp lệ");

  editor.destroy();
});

test("Phase 2 - 12. Marks Preservation: Bold, Italic, Color and Hyperlink marks are preserved across merge", () => {
  const docWithFormattedCells = {
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
                        marks: [
                          { type: "bold" },
                          { type: "textStyle", attrs: { color: "#dc2626" } },
                        ],
                        text: "Chữ Đỏ Đậm",
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
                        marks: [
                          { type: "italic" },
                          { type: "link", attrs: { href: "https://example.com" } },
                        ],
                        text: "Liên Kết Nghiêng",
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

  const editor = createEditor(docWithFormattedCells);
  const info = getTablePosInfo(editor);

  setTableCellSelection(editor, info.getCellDocPos(0, 0), info.getCellDocPos(0, 1));
  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true);

  const json = editor.getJSON();
  const mergedCell = json.content?.[0]?.content?.[0]?.content?.[0];
  assert.equal(mergedCell?.attrs?.colspan, 2);

  // Tìm marks trong nội dung ô sau khi merge
  const allRuns = mergedCell?.content?.flatMap((p: any) => p.content || []) || [];
  const boldRedRun = allRuns.find((r: any) => r.text === "Chữ Đỏ Đậm");
  const italicLinkRun = allRuns.find((r: any) => r.text === "Liên Kết Nghiêng");

  assert.ok(boldRedRun, "Phải giữ được text của ô 1");
  assert.ok(boldRedRun.marks?.some((m: any) => m.type === "bold"), "Phải giữ mark bold");
  assert.ok(boldRedRun.marks?.some((m: any) => m.type === "textStyle" && m.attrs?.color === "#dc2626"), "Phải giữ color");

  assert.ok(italicLinkRun, "Phải giữ được text của ô 2");
  assert.ok(italicLinkRun.marks?.some((m: any) => m.type === "italic"), "Phải giữ mark italic");
  assert.ok(italicLinkRun.marks?.some((m: any) => m.type === "link" && m.attrs?.href === "https://example.com"), "Phải giữ link href");

  editor.destroy();
});

test("Phase 2 - 13. TableMap Validity: Structural integrity is preserved throughout merge & split", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 4, cols: 3, withHeaderRow: true });

  // 1. Initial table map
  let info = getTablePosInfo(editor);
  assert.equal(info.map.problems, null);

  // 2. Merge vertical 2 rows in col 1
  setTableCellSelection(editor, info.getCellDocPos(1, 1), info.getCellDocPos(2, 1));
  mergeCells(editor);
  info = getTablePosInfo(editor);
  assert.equal(info.map.problems, null, "Map phải valid sau vertical merge");

  // 3. Merge horizontal 2 cols in row 3
  setTableCellSelection(editor, info.getCellDocPos(3, 0), info.getCellDocPos(3, 1));
  mergeCells(editor);
  info = getTablePosInfo(editor);
  assert.equal(info.map.problems, null, "Map phải valid sau horizontal merge kế tiếp");

  // 4. Split vertical cell
  editor.commands.setTextSelection(info.getCellDocPos(1, 1) + 2);
  splitCell(editor);
  info = getTablePosInfo(editor);
  assert.equal(info.map.problems, null, "Map phải valid sau split vertical");

  // 5. Split horizontal cell
  editor.commands.setTextSelection(info.getCellDocPos(3, 0) + 2);
  splitCell(editor);
  info = getTablePosInfo(editor);
  assert.equal(info.map.problems, null, "Map phải valid sau split horizontal");

  editor.destroy();
});

function createTableDoc(rows: number, cols: number, withHeaderRow = false) {
  const rowNodes = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    const isHeader = withHeaderRow && r === 0;
    const cellType = isHeader ? "tableHeader" : "tableCell";
    for (let c = 0; c < cols; c++) {
      cells.push({
        type: cellType,
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `R${r}C${c}` }],
          },
        ],
      });
    }
    rowNodes.push({
      type: "tableRow",
      content: cells,
    });
  }
  return {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { borders: "all" },
        content: rowNodes,
      },
    ],
  };
}

test("Phase 2 - 14. Undo / Redo: 1 merge or split action produces exactly 1 atomic history step", () => {
  const editor = createEditor(createTableDoc(3, 3, false));

  let info = getTablePosInfo(editor);

  // 1. Thực hiện Merge 2×2
  setTableCellSelection(editor, info.getCellDocPos(1, 0), info.getCellDocPos(2, 1));
  const mergedOk = mergeCells(editor);
  assert.equal(mergedOk, true, "mergeCells phải thành công");

  const getTable = (ed: Editor) => ed.getJSON().content?.find((n) => n.type === "table");

  let tableMerged = getTable(editor);
  let cell0 = tableMerged?.content?.[1]?.content?.[0];
  assert.equal(cell0?.attrs?.rowspan, 2);
  assert.equal(cell0?.attrs?.colspan, 2);

  // 2. Undo đúng 1 lần: phục hồi chính xác 4 ô ban đầu
  editor.commands.undo();
  let tableAfterUndo = getTable(editor);
  assert.equal(tableAfterUndo?.content?.[1]?.content?.length, 3, "Row 1 sau undo phải có lại đủ 3 ô");
  assert.equal(tableAfterUndo?.content?.[2]?.content?.length, 3, "Row 2 sau undo phải có lại đủ 3 ô");

  // 3. Redo đúng 1 lần: hợp nhất trở lại 2×2
  editor.commands.redo();
  let tableAfterRedo = getTable(editor);
  let cellRedo = tableAfterRedo?.content?.[1]?.content?.[0];
  assert.equal(cellRedo?.attrs?.rowspan, 2);
  assert.equal(cellRedo?.attrs?.colspan, 2);

  // 4. Thực hiện Split cell
  info = getTablePosInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(1, 0) + 2);
  const splitOk = splitCell(editor);
  assert.equal(splitOk, true, "splitCell phải thành công");

  let tableAfterSplit = getTable(editor);
  assert.equal(tableAfterSplit?.content?.[1]?.content?.length, 3, "Row 1 sau split phải có đủ 3 ô");
  assert.equal(tableAfterSplit?.content?.[2]?.content?.length, 3, "Row 2 sau split phải có đủ 3 ô");

  // 5. Undo Split đúng 1 lần: khôi phục ô merge 2×2
  editor.commands.undo();
  let tableUndoSplit = getTable(editor);
  let cellUndoSplit = tableUndoSplit?.content?.[1]?.content?.[0];
  assert.equal(cellUndoSplit?.attrs?.rowspan, 2);
  assert.equal(cellUndoSplit?.attrs?.colspan, 2);

  // 6. Redo Split đúng 1 lần: tách trở lại
  editor.commands.redo();
  let tableRedoSplit = getTable(editor);
  assert.equal(tableRedoSplit?.content?.[1]?.content?.length, 3, "Row 1 sau redo split phải có đủ 3 ô");
  assert.equal(tableRedoSplit?.content?.[2]?.content?.length, 3, "Row 2 sau redo split phải có đủ 3 ô");

  editor.destroy();
});
