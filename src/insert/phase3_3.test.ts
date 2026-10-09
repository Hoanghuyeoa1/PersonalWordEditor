import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  TABLE_LIMITS,
  validateTableDimensions,
  insertTable,
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
  isTableActive,
} from "../editor/editorCommands.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  extractDocumentStats,
  createInitialDocument,
} from "../document/documentModel.ts";
import {
  calculatePaginationState,
  estimateContentHeightPx,
} from "../page/services/paginationService.ts";

function createEditor(content?: any) {
  return new Editor({
    extensions: getEditorExtensions(),
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn khởi tạo" }],
        },
      ],
    },
  });
}

test("Phase 3.3 - 1. Extensions Registration: Table, TableRow, TableCell, TableHeader in schema", () => {
  const editor = createEditor();
  const schema = editor.schema;

  assert.ok(schema.nodes.table, "Table node must exist in ProseMirror schema");
  assert.ok(schema.nodes.tableRow, "TableRow node must exist in ProseMirror schema");
  assert.ok(schema.nodes.tableCell, "TableCell node must exist in ProseMirror schema");
  assert.ok(schema.nodes.tableHeader, "TableHeader node must exist in ProseMirror schema");

  editor.destroy();
});

test("Phase 3.3 - 2. Validation: validateTableDimensions accepts valid and rejects out-of-bound values", () => {
  // Hợp lệ
  const valid = validateTableDimensions(3, 4);
  assert.equal(valid.isValid, true);
  assert.equal(valid.sanitizedRows, 3);
  assert.equal(valid.sanitizedCols, 4);
  assert.equal(valid.error, undefined);

  // Default fallbacks
  const def = validateTableDimensions();
  assert.equal(def.isValid, true);
  assert.equal(def.sanitizedRows, TABLE_LIMITS.DEFAULT_ROWS);
  assert.equal(def.sanitizedCols, TABLE_LIMITS.DEFAULT_COLS);

  // Boundaries: Min 1x1
  const minBound = validateTableDimensions(1, 1);
  assert.equal(minBound.isValid, true);

  // Boundaries: Max 50x20
  const maxBound = validateTableDimensions(TABLE_LIMITS.MAX_ROWS, TABLE_LIMITS.MAX_COLS);
  assert.equal(maxBound.isValid, true);

  // Lỗi: rows < 1
  const errZeroRow = validateTableDimensions(0, 4);
  assert.equal(errZeroRow.isValid, false);
  assert.ok(errZeroRow.error?.includes("hàng"));

  // Lỗi: cols < 1
  const errZeroCol = validateTableDimensions(3, 0);
  assert.equal(errZeroCol.isValid, false);
  assert.ok(errZeroCol.error?.includes("cột"));

  // Lỗi: rows > MAX_ROWS
  const errHighRow = validateTableDimensions(51, 4);
  assert.equal(errHighRow.isValid, false);

  // Lỗi: cols > MAX_COLS
  const errHighCol = validateTableDimensions(3, 25);
  assert.equal(errHighCol.isValid, false);

  // Lỗi: NaN
  const errNan = validateTableDimensions(NaN, 4);
  assert.equal(errNan.isValid, false);

  // Lỗi: số âm
  const errNeg = validateTableDimensions(-3, -2);
  assert.equal(errNeg.isValid, false);
});

test("Phase 3.3 - 3. Insert Table: semantic ProseMirror AST model with header row", () => {
  const editor = createEditor();

  // Chèn bảng 3 hàng x 4 cột có Header Row
  const success = insertTable(editor, { rows: 3, cols: 4, withHeaderRow: true });
  assert.equal(success, true);

  const json = editor.getJSON();
  const tableNode = json.content?.find((n) => n.type === "table");
  assert.ok(tableNode, "Document must contain a table node");
  assert.equal(tableNode?.content?.length, 3, "Table must have 3 rows");

  // Hàng 1 là Header Row (4 tableHeader)
  const row1 = tableNode?.content?.[0];
  assert.equal(row1?.type, "tableRow");
  assert.equal(row1?.content?.length, 4);
  for (const cell of row1?.content || []) {
    assert.equal(cell.type, "tableHeader");
    assert.ok(cell.content?.[0]?.type === "paragraph");
  }

  // Hàng 2 và 3 là Data Rows (4 tableCell)
  const row2 = tableNode?.content?.[1];
  assert.equal(row2?.type, "tableRow");
  assert.equal(row2?.content?.length, 4);
  for (const cell of row2?.content || []) {
    assert.equal(cell.type, "tableCell");
    assert.ok(cell.content?.[0]?.type === "paragraph");
  }

  editor.destroy();
});

test("Phase 3.3 - 4. Insert Table: without header row creates pure tableCell rows", () => {
  const editor = createEditor();

  const success = insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });
  assert.equal(success, true);

  const json = editor.getJSON();
  const tableNode = json.content?.find((n) => n.type === "table");
  assert.ok(tableNode);
  assert.equal(tableNode?.content?.length, 2);

  for (const row of tableNode?.content || []) {
    assert.equal(row.type, "tableRow");
    for (const cell of row.content || []) {
      assert.equal(cell.type, "tableCell");
    }
  }

  editor.destroy();
});

test("Phase 3.3 - 5. Validation Rejection: invalid dimensions do not corrupt document", () => {
  const editor = createEditor();
  const beforeJson = JSON.stringify(editor.getJSON());

  // Thử chèn hàng âm
  const res1 = insertTable(editor, { rows: -1, cols: 3 });
  assert.equal(res1, false);

  // Thử chèn cột quá lớn
  const res2 = insertTable(editor, { rows: 3, cols: 100 });
  assert.equal(res2, false);

  // Document phải giữ nguyên 100%
  const afterJson = JSON.stringify(editor.getJSON());
  assert.equal(beforeJson, afterJson);

  editor.destroy();
});

test("Phase 3.3 - 6. Basic Editing: typing content inside table cells and tab navigation", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: true });

  assert.equal(isTableActive(editor), true);

  // Nhập text vào ô hiện tại
  editor.view.dispatch(editor.state.tr.insertText("Tiêu đề 1"));
  assert.ok(editor.getText().includes("Tiêu đề 1"));

  // Di chuyển sang ô tiếp theo (Tab)
  const tabSuccess = goToNextCell(editor);
  assert.equal(tabSuccess, true);
  editor.view.dispatch(editor.state.tr.insertText("Tiêu đề 2"));
  assert.ok(editor.getText().includes("Tiêu đề 2"));

  // Di chuyển lùi lại ô trước đó (Shift+Tab)
  const prevSuccess = goToPreviousCell(editor);
  assert.equal(prevSuccess, true);

  editor.destroy();
});

test("Phase 3.3 - 7. Basic Commands: Add Row Above, Add Row Below, Delete Row", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: true });

  const getRowCount = () => {
    const table = editor.getJSON().content?.find((n) => n.type === "table");
    return table?.content?.length || 0;
  };

  assert.equal(getRowCount(), 2);

  // Thêm hàng phía dưới
  const addBelowOk = addRowBelow(editor);
  assert.equal(addBelowOk, true);
  assert.equal(getRowCount(), 3);

  // Thêm hàng phía trên
  const addAboveOk = addRowAbove(editor);
  assert.equal(addAboveOk, true);
  assert.equal(getRowCount(), 4);

  // Xóa hàng
  const delRowOk = deleteRow(editor);
  assert.equal(delRowOk, true);
  assert.equal(getRowCount(), 3);

  editor.destroy();
});

test("Phase 3.3 - 8. Basic Commands: Add Column Left, Add Column Right, Delete Column", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: true });

  const getColCount = () => {
    const table = editor.getJSON().content?.find((n) => n.type === "table");
    const row = table?.content?.[0];
    return row?.content?.length || 0;
  };

  assert.equal(getColCount(), 2);

  // Thêm cột bên phải
  const addRightOk = addColumnRight(editor);
  assert.equal(addRightOk, true);
  assert.equal(getColCount(), 3);

  // Thêm cột bên trái
  const addLeftOk = addColumnLeft(editor);
  assert.equal(addLeftOk, true);
  assert.equal(getColCount(), 4);

  // Xóa cột
  const delColOk = deleteColumn(editor);
  assert.equal(delColOk, true);
  assert.equal(getColCount(), 3);

  editor.destroy();
});

test("Phase 3.3 - 9. Header Row: toggleHeaderRow toggles between header and regular cells", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  const isFirstRowHeader = () => {
    const table = editor.getJSON().content?.find((n) => n.type === "table");
    const firstCell = table?.content?.[0]?.content?.[0];
    return firstCell?.type === "tableHeader";
  };

  assert.equal(isFirstRowHeader(), false);

  // Toggle biến hàng 1 thành Header
  toggleHeaderRow(editor);
  assert.equal(isFirstRowHeader(), true);

  // Toggle lần nữa biến hàng 1 về thường
  toggleHeaderRow(editor);
  assert.equal(isFirstRowHeader(), false);

  editor.destroy();
});

test("Phase 3.3 - 10. Delete Table: removes the entire table node cleanly", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: true });

  assert.equal(isTableActive(editor), true);

  const delTableOk = deleteTable(editor);
  assert.equal(delTableOk, true);
  assert.equal(isTableActive(editor), false);

  const hasTable = editor.getJSON().content?.some((n) => n.type === "table");
  assert.equal(hasTable, false);

  editor.destroy();
});

test("Phase 3.3 - 11. Undo / Redo: table insertions and cell modifications support history", () => {
  const editor = createEditor();
  const initContentLength = editor.getJSON().content?.length || 0;

  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: true });
  assert.equal(isTableActive(editor), true);

  // Undo chèn bảng
  editor.commands.undo();
  const hasTableAfterUndo = editor.getJSON().content?.some((n) => n.type === "table");
  assert.equal(hasTableAfterUndo, false);

  // Redo khôi phục bảng
  editor.commands.redo();
  const hasTableAfterRedo = editor.getJSON().content?.some((n) => n.type === "table");
  assert.equal(hasTableAfterRedo, true);

  editor.destroy();
});

test("Phase 3.3 - 12. Persistence (.mwd): Save and Open round-trip preserves table semantic AST", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 3, cols: 3, withHeaderRow: true });

  // Nhập nội dung vào các ô
  editor.view.dispatch(editor.state.tr.insertText("Mã SP"));
  goToNextCell(editor);
  editor.view.dispatch(editor.state.tr.insertText("Tên SP"));
  goToNextCell(editor);
  editor.view.dispatch(editor.state.tr.insertText("Đơn giá"));
  goToNextCell(editor);
  editor.view.dispatch(editor.state.tr.insertText("SP001"));
  goToNextCell(editor);
  editor.view.dispatch(editor.state.tr.insertText("Bàn phím cơ"));
  goToNextCell(editor);
  editor.view.dispatch(editor.state.tr.insertText("1.200.000đ"));

  // Thêm 1 hàng mới
  addRowBelow(editor);

  const docJson = editor.getJSON();

  // Serialize sang định dạng .mwd
  const docToSave = createInitialDocument("Báo cáo bảng", docJson);
  const mwdFile = serializeDocumentToMwd(docToSave);

  // Deserialize trở lại
  const restored = deserializeMwdToDocument(mwdFile);
  assert.equal(restored.success, true);
  assert.ok(restored.document);

  // Tái tạo editor mới với dữ liệu được mở
  const newEditor = createEditor(restored.document.content);
  const newJson = newEditor.getJSON();

  const restoredTable = newJson.content?.find((n) => n.type === "table");
  assert.ok(restoredTable, "Restored document must contain table");
  assert.equal(restoredTable?.content?.length, 4, "Must preserve 4 rows (3 initial + 1 added)");

  // Xác minh nội dung văn bản trong các ô
  const allText = newEditor.getText();
  assert.ok(allText.includes("Mã SP"));
  assert.ok(allText.includes("Tên SP"));
  assert.ok(allText.includes("Đơn giá"));
  assert.ok(allText.includes("SP001"));
  assert.ok(allText.includes("Bàn phím cơ"));
  assert.ok(allText.includes("1.200.000đ"));

  editor.destroy();
  newEditor.destroy();
});

test("Phase 3.3 - 13. Regression & Non-interference: text, headings, lists before and after table", () => {
  const contentWithMixedNodes = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Tiêu đề Báo Cáo" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn mở đầu trước bảng." }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Cột A" }] }],
              },
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Cột B" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu 1" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu 2" }] }],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kết luận sau bảng." }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Mục danh sách 1" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Mục danh sách 2" }] }],
          },
        ],
      },
    ],
  };

  const editor = createEditor(contentWithMixedNodes);

  // Tất cả các node đều bảo toàn
  const json = editor.getJSON();
  const types = json.content?.map((n) => n.type) || [];
  assert.deepEqual(types, ["heading", "paragraph", "table", "paragraph", "bulletList"]);

  // Thống kê đếm từ và ký tự bao gồm cả nội dung trong bảng
  const stats = extractDocumentStats(json);
  assert.ok(stats.words > 0, "Word count must be positive");
  assert.ok(stats.characters > 0, "Character count must be positive");

  editor.destroy();
});

test("Phase 3.3 - 14. Pagination Safety: estimateContentHeightPx and tall tables do not loop or crash", () => {
  // Bảng 20 hàng
  const tallTable = {
    type: "table",
    content: Array.from({ length: 20 }, (_, r) => ({
      type: "tableRow",
      content: [
        {
          type: "tableCell",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: `Nội dung hàng số ${r + 1}` }],
            },
          ],
        },
      ],
    })),
  };

  const doc = {
    type: "doc",
    content: [tallTable],
  };

  // Chiều cao phải ước tính được mà không bị lỗi
  const height = estimateContentHeightPx(doc);
  assert.ok(height > 500, "20-row table should estimate substantial height");

  // Phân trang hoạt động mà không crash hay infinite loop
  const pagination = calculatePaginationState(doc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
  });

  assert.ok(pagination.pageCount >= 1, "Must paginate without crash");
  assert.equal(pagination.pages.length, pagination.pageCount);
});
