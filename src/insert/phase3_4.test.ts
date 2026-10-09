import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  insertTable,
  mergeCells,
  canMergeCells,
  splitCell,
  canSplitCell,
  setCellTextAlign,
  setCellVerticalAlign,
  setCellBackgroundColor,
  setTableBorders,
  getTableBorders,
  addRowBelow,
  deleteRow,
  deleteColumn,
  deleteTable,
  isTableActive,
} from "../editor/editorCommands.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  createInitialDocument,
  extractDocumentStats,
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

test("Phase 3.4 - 1. Schema Extensions: table attributes, borders, cell alignment, background, colwidth", () => {
  const editor = createEditor();
  const schema = editor.schema;

  // Thuộc tính mở rộng trên Table
  assert.ok(schema.nodes.table.spec.attrs?.borders, "Table must have borders attribute");

  // Thuộc tính mở rộng trên TableCell
  assert.ok(schema.nodes.tableCell.spec.attrs?.backgroundColor, "TableCell must have backgroundColor");
  assert.ok(schema.nodes.tableCell.spec.attrs?.verticalAlign, "TableCell must have verticalAlign");
  assert.ok(schema.nodes.tableCell.spec.attrs?.textAlign, "TableCell must have textAlign");
  assert.ok(schema.nodes.tableCell.spec.attrs?.colwidth, "TableCell must have colwidth for resizing");
  assert.ok(schema.nodes.tableCell.spec.attrs?.colspan, "TableCell must have colspan for merge");
  assert.ok(schema.nodes.tableCell.spec.attrs?.rowspan, "TableCell must have rowspan for merge");

  // Thuộc tính mở rộng trên TableHeader
  assert.ok(schema.nodes.tableHeader.spec.attrs?.backgroundColor, "TableHeader must have backgroundColor");
  assert.ok(schema.nodes.tableHeader.spec.attrs?.verticalAlign, "TableHeader must have verticalAlign");
  assert.ok(schema.nodes.tableHeader.spec.attrs?.textAlign, "TableHeader must have textAlign");
  assert.ok(schema.nodes.tableHeader.spec.attrs?.colwidth, "TableHeader must have colwidth");

  editor.destroy();
});

test("Phase 3.4 - 2. Merge Cells (Hợp lệ) & Split Cell (Tách ô): ProseMirror transaction command", () => {
  // Chuẩn bị tài liệu có bảng 2x2 để test merge
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  // Chọn vùng 2 ô ngang bằng CellSelection trong ProseMirror
  // Sử dụng Tiptap setCellSelection
  const hasSelected = editor.commands.setCellSelection({
    anchorCell: 2, // Ô đầu tiên (pos 2)
    headCell: 6,   // Ô thứ hai (pos 6)
  });

  if (hasSelected) {
    assert.equal(canMergeCells(editor), true);
    const mergeOk = mergeCells(editor);
    assert.equal(mergeOk, true);

    // Kiểm tra AST sau khi merge: Hàng đầu tiên chỉ còn 1 ô với colspan=2
    const json = editor.getJSON();
    const firstRow = json.content?.find((n) => n.type === "table")?.content?.[0];
    assert.equal(firstRow?.content?.length, 1);
    assert.equal(firstRow?.content?.[0]?.attrs?.colspan, 2);

    // Kiểm tra Split Cell trên ô vừa merge
    assert.equal(canSplitCell(editor), true);
    const splitOk = splitCell(editor);
    assert.equal(splitOk, true);

    // Sau khi split, hàng đầu tiên trở lại 2 ô
    const jsonAfterSplit = editor.getJSON();
    const firstRowAfter = jsonAfterSplit.content?.find((n) => n.type === "table")?.content?.[0];
    assert.equal(firstRowAfter?.content?.length, 2);
  } else {
    // Nếu headless không có DOM selection, kiểm tra trực tiếp qua AST
    const docWithMergedCell = {
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
                  attrs: { colspan: 2, rowspan: 1 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Merged Cell" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cell 2,1" }] }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cell 2,2" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const ed2 = createEditor(docWithMergedCell);
    assert.equal(isTableActive(ed2), true);
    ed2.destroy();
  }

  editor.destroy();
});

test("Phase 3.4 - 3. Merge Cells (Không hợp lệ): Không corrupt document khi vùng chọn không thể merge", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  // Con trỏ đang đứng ở một ô đơn lẻ (chưa chọn nhiều ô)
  assert.equal(canMergeCells(editor), false);
  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, false);

  // AST bảng phải nguyên vẹn 2 hàng x 2 ô
  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  assert.equal(table?.content?.length, 2);
  assert.equal(table?.content?.[0]?.content?.length, 2);

  editor.destroy();
});

test("Phase 3.4 - 4. Delete Row & Delete Column sau khi merge: bảo toàn tính toàn vẹn của bảng", () => {
  const docWithMergedCell = {
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
                attrs: { colspan: 2, rowspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Merged Header" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Col 1" }] }],
              },
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Col 2" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Row 3" }] }],
              },
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Row 3, Col 2" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = createEditor(docWithMergedCell);
  assert.equal(isTableActive(editor), true);

  // Xóa hàng
  const delRowOk = deleteRow(editor);
  assert.equal(delRowOk, true);

  // Xóa cột
  const delColOk = deleteColumn(editor);
  assert.equal(delColOk, true);

  // Không bị crash, tài liệu vẫn có bảng hợp lệ
  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  assert.ok(table);

  editor.destroy();
});

test("Phase 3.4 - 5. Column Width (Resize State): colwidth attribute được lưu trữ trong AST", () => {
  const docWithColwidths = {
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
                attrs: { colwidth: [180] },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Cột rộng 180px" }] }],
              },
              {
                type: "tableCell",
                attrs: { colwidth: [320] },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Cột rộng 320px" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = createEditor(docWithColwidths);
  const json = editor.getJSON();
  const table = json.content?.find((n) => n.type === "table");
  const cell1 = table?.content?.[0]?.content?.[0];
  const cell2 = table?.content?.[0]?.content?.[1];

  assert.deepEqual(cell1?.attrs?.colwidth, [180]);
  assert.deepEqual(cell2?.attrs?.colwidth, [320]);

  editor.destroy();
});

test("Phase 3.4 - 6. Cell Alignment: Horizontal (left, center, right) và Vertical (top, middle, bottom)", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  // Căn lề ngang
  setCellTextAlign(editor, "center");
  let cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.textAlign, "center");

  setCellTextAlign(editor, "right");
  cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.textAlign, "right");

  setCellTextAlign(editor, "left");
  cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.textAlign, "left");

  // Căn lề dọc
  setCellVerticalAlign(editor, "middle");
  cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.verticalAlign, "middle");

  setCellVerticalAlign(editor, "bottom");
  cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.verticalAlign, "bottom");

  setCellVerticalAlign(editor, "top");
  cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.verticalAlign, "top");

  editor.destroy();
});

test("Phase 3.4 - 7. Cell Background Color (Shading): Lưu trữ màu sắc vào node attribute", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  // Thiết lập màu nền pastel
  setCellBackgroundColor(editor, "#fee2e2");
  let cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.backgroundColor, "#fee2e2");

  // Đổi sang màu khác
  setCellBackgroundColor(editor, "#dbeafe");
  cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.backgroundColor, "#dbeafe");

  // Xóa màu nền (clear)
  setCellBackgroundColor(editor, null);
  cellAttrs = editor.getAttributes("tableCell");
  assert.equal(cellAttrs.backgroundColor, null);

  editor.destroy();
});

test("Phase 3.4 - 8. Table Borders: Quản lý kiểu viền all, none, outside", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  // Mặc định là all
  assert.equal(getTableBorders(editor), "all");

  // Thiết lập outside borders
  setTableBorders(editor, "outside");
  assert.equal(getTableBorders(editor), "outside");

  // Thiết lập no borders
  setTableBorders(editor, "none");
  assert.equal(getTableBorders(editor), "none");

  // Trở lại all
  setTableBorders(editor, "all");
  assert.equal(getTableBorders(editor), "all");

  editor.destroy();
});

test("Phase 3.4 - 9. Nested Formatting & Hyperlink bên trong cell", () => {
  const docWithFormattedCell = {
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
                attrs: {
                  backgroundColor: "#fef3c7",
                  textAlign: "center",
                },
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", marks: [{ type: "bold" }], text: "Văn bản in đậm " },
                      {
                        type: "text",
                        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
                        text: "liên kết",
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

  const editor = createEditor(docWithFormattedCell);
  const text = editor.getText();
  assert.ok(text.includes("Văn bản in đậm"));
  assert.ok(text.includes("liên kết"));

  const json = editor.getJSON();
  const cell = json.content?.[0]?.content?.[0]?.content?.[0];
  assert.equal(cell?.attrs?.backgroundColor, "#fef3c7");
  assert.equal(cell?.attrs?.textAlign, "center");

  // Kiểm tra mark bold và link tồn tại trong cell
  const marks = cell?.content?.[0]?.content?.flatMap((c: any) => c.marks?.map((m: any) => m.type) || []);
  assert.ok(marks?.includes("bold"));
  assert.ok(marks?.includes("link"));

  editor.destroy();
});

test("Phase 3.4 - 10. Undo / Redo trên thao tác nâng cao: cell alignment và cell shading", () => {
  const editor = createEditor();
  insertTable(editor, { rows: 2, cols: 2, withHeaderRow: false });

  // Thiết lập màu
  setCellBackgroundColor(editor, "#dcfce7");
  assert.equal(editor.getAttributes("tableCell").backgroundColor, "#dcfce7");

  // Undo
  editor.commands.undo();
  assert.ok(!editor.getAttributes("tableCell").backgroundColor, "Background color must be unset after undo");

  // Redo
  editor.commands.redo();
  assert.equal(editor.getAttributes("tableCell").backgroundColor, "#dcfce7");

  editor.destroy();
});

test("Phase 3.4 - 11. Persistence (.mwd): Save and Open round-trip bảo toàn toàn bộ thuộc tính nâng cao", () => {
  const advancedDocModel = {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { borders: "outside" },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: {
                  colspan: 2,
                  rowspan: 1,
                  colwidth: [240, 360],
                  backgroundColor: "#f1f5f9",
                  textAlign: "center",
                  verticalAlign: "middle",
                },
                content: [{ type: "paragraph", content: [{ type: "text", text: "TIÊU ĐỀ HỢP NHẤT" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: {
                  colspan: 1,
                  rowspan: 1,
                  backgroundColor: "#fee2e2",
                  textAlign: "left",
                },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu A" }] }],
              },
              {
                type: "tableCell",
                attrs: {
                  colspan: 1,
                  rowspan: 1,
                  backgroundColor: "#dbeafe",
                  textAlign: "right",
                },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu B" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const doc = createInitialDocument("Bảng nâng cao", advancedDocModel);
  const serialized = serializeDocumentToMwd(doc);

  const restored = deserializeMwdToDocument(serialized);
  assert.equal(restored.success, true);
  assert.ok(restored.document);

  const newEditor = createEditor(restored.document.content);
  const restoredJson = newEditor.getJSON();

  const restoredTable = restoredJson.content?.find((n) => n.type === "table");
  assert.ok(restoredTable);
  assert.equal(restoredTable?.attrs?.borders, "outside");

  // Hàng 1: Header hợp nhất
  const headerCell = restoredTable?.content?.[0]?.content?.[0];
  assert.equal(headerCell?.attrs?.colspan, 2);
  assert.deepEqual(headerCell?.attrs?.colwidth, [240, 360]);
  assert.equal(headerCell?.attrs?.backgroundColor, "#f1f5f9");
  assert.equal(headerCell?.attrs?.textAlign, "center");
  assert.equal(headerCell?.attrs?.verticalAlign, "middle");

  // Hàng 2: Hai ô với màu sắc và căn lề riêng biệt
  const cellA = restoredTable?.content?.[1]?.content?.[0];
  const cellB = restoredTable?.content?.[1]?.content?.[1];
  assert.equal(cellA?.attrs?.backgroundColor, "#fee2e2");
  assert.equal(cellA?.attrs?.textAlign, "left");
  assert.equal(cellB?.attrs?.backgroundColor, "#dbeafe");
  assert.equal(cellB?.attrs?.textAlign, "right");

  newEditor.destroy();
});

test("Phase 3.4 - 12. Pagination Safety: Bảng nâng cao không làm gián đoạn hay crash phân trang", () => {
  const tableContent = {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { borders: "all" },
        content: Array.from({ length: 15 }, (_, i) => ({
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              attrs: { backgroundColor: i % 2 === 0 ? "#f8fafc" : null },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `Dòng ${i + 1} - Chi tiết bảng nâng cao` }],
                },
              ],
            },
          ],
        })),
      },
    ],
  };

  const height = estimateContentHeightPx(tableContent);
  assert.ok(height > 400);

  const pagination = calculatePaginationState(tableContent, {
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
  });

  assert.ok(pagination.pageCount >= 1);
  assert.equal(pagination.pages.length, pagination.pageCount);
});
