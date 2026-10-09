import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  applyTableStyle,
  setTableStyleOptions,
  getTableStyleInfo,
  getTableStyle,
  getAllTableStyles,
  resolveCellPresentation,
  BUILT_IN_TABLE_STYLES,
  DEFAULT_TABLE_STYLE_OPTIONS,
} from "./tableStyleService.ts";
import { findActiveTable, ensureEditorPlugins } from "./tableSizingService.ts";

function createStyleTestEditor(options?: {
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
            id: "table-unique-123",
            targetId: "tbl-anchor-target",
            layoutMode: "autoWindow",
            tableWidth: "100%",
            tableStyleId: "grid",
            tableStyleOptions: DEFAULT_TABLE_STYLE_OPTIONS,
            ...(options?.tableAttrs || {}),
          },
          content: tableRows,
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

test("Phase 6 - 1. Built-in Styles: Each of the 5 built-in presets applies cleanly", () => {
  const editor = createStyleTestEditor();
  editor.commands.setTextSelection(3);

  const styleIds = ["plain", "grid", "light-grid", "medium-accent", "academic"];

  for (const styleId of styleIds) {
    const ok = applyTableStyle(editor, styleId);
    assert.equal(ok, true, `applyTableStyle(${styleId}) phải thành công`);

    const info = getTableStyleInfo(editor)!;
    assert.ok(info, `Phải lấy được thông tin style của ${styleId}`);
    assert.equal(info.styleId, styleId);

    const active = findActiveTable(editor)!;
    assert.equal(active.tableNode.attrs.tableStyleId, styleId);

    const expectedDef = BUILT_IN_TABLE_STYLES[styleId];
    assert.equal(active.tableNode.attrs.borders, expectedDef.borders);
  }
});

test("Phase 6 - 2. Banded Rows: Light Grid and Medium Accent calculate alternating rows correctly", () => {
  const editor = createStyleTestEditor({ rows: 4, cols: 2 });
  editor.commands.setTextSelection(3);

  applyTableStyle(editor, "light-grid");
  const active = findActiveTable(editor)!;
  const tableNode = active.tableNode;

  // Hàng 0: Header row (không banded)
  const headerCell = tableNode.child(0).child(0);
  const headerPres = resolveCellPresentation(tableNode, 0, 0, headerCell, false, 2);
  assert.equal(headerPres.backgroundColor, "#f8fafc");

  // Hàng 1 (Row index 1 = lẻ trong body): Banded row có màu nền xen kẽ
  const bodyRow1Cell = tableNode.child(1).child(0);
  const row1Pres = resolveCellPresentation(tableNode, 1, 0, bodyRow1Cell, false, 2);
  assert.equal(row1Pres.backgroundColor, "#f8fafc", "Hàng 1 phải có màu banded #f8fafc");

  // Hàng 2 (Row index 2 = chẵn trong body): Không có màu nền banded
  const bodyRow2Cell = tableNode.child(2).child(0);
  const row2Pres = resolveCellPresentation(tableNode, 2, 0, bodyRow2Cell, false, 2);
  assert.equal(row2Pres.backgroundColor, null, "Hàng 2 không có màu nền xen kẽ");

  // Hàng 3 (Row index 3 = lẻ): Lại có màu banded
  const bodyRow3Cell = tableNode.child(3).child(0);
  const row3Pres = resolveCellPresentation(tableNode, 3, 0, bodyRow3Cell, false, 2);
  assert.equal(row3Pres.backgroundColor, "#f8fafc", "Hàng 3 phải có màu banded #f8fafc");

  // Tắt bandedRows bằng setTableStyleOptions
  setTableStyleOptions(editor, { bandedRows: false });
  const updatedActive = findActiveTable(editor)!;
  const row1NoBanded = resolveCellPresentation(updatedActive.tableNode, 1, 0, bodyRow1Cell, false, 2);
  assert.equal(row1NoBanded.backgroundColor, null, "Khi tắt bandedRows, hàng 1 trở về nền null");
});

test("Phase 6 - 3. Header Styling: Distinct header appearance across styles", () => {
  const editor = createStyleTestEditor();
  editor.commands.setTextSelection(3);

  // Medium Accent có header xanh đậm nổi bật với text màu trắng
  applyTableStyle(editor, "medium-accent");
  const active = findActiveTable(editor)!;
  const headerCell = active.tableNode.child(0).child(0);
  const pres = resolveCellPresentation(active.tableNode, 0, 0, headerCell, false, 3);

  assert.equal(pres.backgroundColor, "#2563eb", "Header background phải là #2563eb");
  assert.equal(pres.textColor, "#ffffff", "Header text color phải là #ffffff");
  assert.equal(pres.fontWeight, "600", "Header font weight là 600");
  assert.equal(pres.borderBottom, "2px solid #1d4ed8");
});

test("Phase 6 - 4. Direct Cell Override: Manual cell formatting wins over Table Style", () => {
  const editor = createStyleTestEditor();
  const active = findActiveTable(editor)!;

  // Người dùng tô màu vàng thủ công (#ffff00) và căn giữa cho ô (1, 1)
  const cellPos = active.tablePos + 1 + active.tableNode.child(0).nodeSize + 1 + active.tableNode.child(1).child(0).nodeSize;
  const tr = editor.state.tr;
  const targetCell = active.tableNode.child(1).child(1);
  tr.setNodeMarkup(cellPos, undefined, {
    ...targetCell.attrs,
    backgroundColor: "#ffff00",
    textAlign: "center",
  });
  editor.view.dispatch(tr);

  // Áp dụng Medium Accent (có header và banded rows)
  editor.commands.setTextSelection(3);
  applyTableStyle(editor, "medium-accent");

  const afterStyleActive = findActiveTable(editor)!;
  const manualCell = afterStyleActive.tableNode.child(1).child(1);
  assert.equal(
    manualCell.attrs.backgroundColor,
    "#ffff00",
    "Thuộc tính trực tiếp của cell phải được giữ nguyên trong AST"
  );
  assert.equal(manualCell.attrs.textAlign, "center");

  // Presentation resolver xác nhận direct formatting thắng style
  const pres = resolveCellPresentation(afterStyleActive.tableNode, 1, 1, manualCell, false, 3);
  assert.equal(pres.backgroundColor, "#ffff00", "Direct cell background (#ffff00) phải thắng Table Style");
  assert.equal(pres.textAlign, "center", "Direct cell textAlign (center) phải thắng Table Style");
  assert.equal(pres.isDirectOverride.backgroundColor, true);
  assert.equal(pres.isDirectOverride.textAlign, true);
});

test("Phase 6 - 5. Direct Text Override: Text marks inside cell are untouched", () => {
  const editor = createStyleTestEditor();

  // Thêm định dạng ký tự (bold và color: red) vào chữ trong ô
  editor.commands.setTextSelection({ from: 4, to: 8 });
  editor.commands.setBold();

  // Áp dụng Table Style
  applyTableStyle(editor, "academic");

  const active = findActiveTable(editor)!;
  const firstCell = active.tableNode.child(0).child(0);
  const paraNode = firstCell.child(0);
  const textNode = paraNode.child(0);

  // Kiểm tra text node vẫn giữ mark bold
  const hasBold = textNode.marks.some((m) => m.type.name === "bold");
  assert.equal(hasBold, true, "Bold mark của text node bên trong ô phải được bảo toàn");
});

test("Phase 6 - 6. Paragraph Style Safety: Paragraph style inside cell is 100% preserved", () => {
  const editor = createStyleTestEditor();
  editor.commands.setTextSelection(3);

  // Trước khi apply style
  const initialActive = findActiveTable(editor)!;
  const initialPara = initialActive.tableNode.child(0).child(0).child(0);
  assert.equal(initialPara.attrs.styleId, "bodyText");

  // Áp dụng nhiều kiểu Table Style liên tiếp
  applyTableStyle(editor, "medium-accent");
  applyTableStyle(editor, "plain");
  applyTableStyle(editor, "academic");

  const afterActive = findActiveTable(editor)!;
  const afterPara = afterActive.tableNode.child(0).child(0).child(0);
  assert.equal(
    afterPara.attrs.styleId,
    "bodyText",
    "Paragraph style 'bodyText' không bị ảnh hưởng hay xóa bỏ bởi Table Style"
  );
});

test("Phase 6 - 7. Stable Table ID: Table identity, objectAnchor, and targetId are strictly preserved", () => {
  const editor = createStyleTestEditor({
    tableAttrs: {
      id: "table-anchor-999",
      targetId: "fig-table-caption-linked",
      objectAnchor: "tbl-anchor-01",
    },
  });
  editor.commands.setTextSelection(3);

  applyTableStyle(editor, "medium-accent");

  const active = findActiveTable(editor)!;
  assert.equal(active.tableNode.attrs.id, "table-anchor-999", "Table ID phải được giữ nguyên");
  assert.equal(active.tableNode.attrs.targetId, "fig-table-caption-linked", "targetId phải được giữ nguyên");
  assert.equal(active.tableNode.attrs.objectAnchor, "tbl-anchor-01", "objectAnchor của table phải được giữ nguyên");
});

test("Phase 6 - 8. Large Table Performance: 50 rows × 5 cols applies style in single transaction without rewriting nodes", () => {
  const editor = createStyleTestEditor({ rows: 50, cols: 5 });
  editor.commands.setTextSelection(3);

  const activeBefore = findActiveTable(editor)!;
  assert.equal(activeBefore.tableNode.childCount, 50);

  const startDocSize = editor.state.doc.nodeSize;
  const startTime = performance.now();

  const ok = applyTableStyle(editor, "light-grid");
  const duration = performance.now() - startTime;

  assert.equal(ok, true);
  assert.ok(duration < 100, `Áp dụng style cho bảng 50x5 phải cực nhanh (<100ms, thực tế: ${duration.toFixed(2)}ms)`);

  const activeAfter = findActiveTable(editor)!;
  assert.equal(activeAfter.tableNode.attrs.tableStyleId, "light-grid");
  assert.equal(editor.state.doc.nodeSize, startDocSize, "Document nodeSize không bị thay đổi vì không rewrite con");
});

test("Phase 6 - 9. Undo / Redo: Style application and options toggle are atomic history steps", () => {
  const editor = createStyleTestEditor();
  editor.commands.setTextSelection(3);

  const initialStyle = findActiveTable(editor)!.tableNode.attrs.tableStyleId;
  assert.equal(initialStyle, "grid");

  // Áp dụng style mới: medium-accent
  applyTableStyle(editor, "medium-accent");
  assert.equal(findActiveTable(editor)!.tableNode.attrs.tableStyleId, "medium-accent");

  // Undo 1 bước
  assert.equal(editor.can().undo(), true);
  editor.commands.undo();
  assert.equal(
    findActiveTable(editor)!.tableNode.attrs.tableStyleId,
    "grid",
    "Undo phải khôi phục styleId 'grid' ban đầu"
  );

  // Redo 1 bước
  assert.equal(editor.can().redo(), true);
  editor.commands.redo();
  assert.equal(
    findActiveTable(editor)!.tableNode.attrs.tableStyleId,
    "medium-accent",
    "Redo phải khôi phục styleId 'medium-accent'"
  );

  // Thao tác đổi tùy chọn
  setTableStyleOptions(editor, { bandedRows: false });
  assert.equal(findActiveTable(editor)!.tableNode.attrs.tableStyleOptions.bandedRows, false);

  // Undo đổi tùy chọn
  editor.commands.undo();
  assert.equal(
    findActiveTable(editor)!.tableNode.attrs.tableStyleOptions.bandedRows,
    true,
    "Undo khôi phục bandedRows = true"
  );
});
