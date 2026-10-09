import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  addRowAbove,
  canAddRowAbove,
  addRowBelow,
  canAddRowBelow,
  deleteRow,
  canDeleteRow,
  addColumnLeft,
  canAddColumnLeft,
  addColumnRight,
  canAddColumnRight,
  deleteColumn,
  canDeleteColumn,
  toggleHeaderRow,
  canToggleHeaderRow,
  goToNextCell,
  goToPreviousCell,
  mergeCells,
  splitCell,
  setTableCellSelection,
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
          content: [{ type: "text", text: "Table Engine 2.0 - Phase 3 Test Bed" }],
        },
      ],
    },
  });
}

/**
 * Helper tạo document model chứa table theo kích thước rows × cols
 */
function createTableDoc(
  rows: number,
  cols: number,
  withHeaderRow = false,
  customCells?: Record<string, { colspan?: number; rowspan?: number; text?: string; marks?: any[] }>
) {
  const rowNodes = [];
  const covered = new Set<string>();

  for (let r = 0; r < rows; r++) {
    const cells = [];
    const isHeader = withHeaderRow && r === 0;
    const defaultCellType = isHeader ? "tableHeader" : "tableCell";

    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (covered.has(key)) {
        continue;
      }

      const custom = customCells?.[key];
      const colspan = custom?.colspan ?? 1;
      const rowspan = custom?.rowspan ?? 1;
      const cellText = custom?.text ?? `R${r}C${c}`;
      const marks = custom?.marks;

      // Đánh dấu các ô bị che phủ bởi rowspan/colspan
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          if (dr > 0 || dc > 0) {
            covered.add(`${r + dr},${c + dc}`);
          }
        }
      }

      const textNode: any = { type: "text", text: cellText };
      if (marks && marks.length > 0) {
        textNode.marks = marks;
      }

      cells.push({
        type: defaultCellType,
        attrs: { colspan, rowspan, colwidth: null },
        content: [
          {
            type: "paragraph",
            content: [textNode],
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
        attrs: { borders: "all", repeatHeader: true },
        content: rowNodes,
      },
    ],
  };
}

/**
 * Helper lấy table node và vị trí doc pos của từng ô (r, c)
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
  const tableStart = tablePos + 1;

  const getCellDocPos = (row: number, col: number): number => {
    const offset = map.map[row * map.width + col];
    return tableStart + offset;
  };

  return {
    tableNode,
    tablePos,
    tableStart,
    map,
    getCellDocPos,
  };
}

/* ==========================================================================
   1. INSERT ROW
   ========================================================================== */

test("Phase 3 - 1. Insert Row Inside Rowspan: Automatically expands vertical span and keeps TableMap valid", () => {
  // Table 4×3:
  // Row 1: Col 0 có rowspan=2 (phủ Row 1..2)
  const initialDoc = createTableDoc(4, 3, false, {
    "1,0": { rowspan: 2, text: "Span R1-R2" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4);
  assert.equal(info.map.width, 3);
  assert.equal(info.map.problems, null);

  // Đặt con trỏ tại Row 2, Col 1 (bên trong phạm vi của span tại col 0)
  editor.commands.setTextSelection(info.getCellDocPos(2, 1) + 2);

  // Thực hiện thêm hàng phía trên Row 2 -> chèn vào giữa Row 1 và Row 2
  const added = addRowAbove(editor);
  assert.equal(added, true, "addRowAbove phải thành công");

  info = getTablePosInfo(editor);
  // Bảng bây giờ có 5 hàng
  assert.equal(info.map.height, 5, "Chiều cao bảng phải tăng lên 5");
  assert.equal(info.map.width, 3, "Chiều rộng cột phải giữ nguyên 3");
  assert.equal(info.map.problems, null, "TableMap phải hoàn toàn hợp lệ");

  // Ô tại (1,0) bây giờ phải có rowspan = 3 (tự động mở rộng)
  const cellAt10 = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cellAt10?.attrs?.rowspan, 3, "Ô (1,0) phải tự động mở rộng rowspan từ 2 lên 3");

  editor.destroy();
});

test("Phase 3 - 2. Insert Row Adjacent to Span: Before and after vertical span does not change span", () => {
  // Table 4×3: Row 1..2 Col 0 có rowspan=2
  const initialDoc = createTableDoc(4, 3, false, {
    "1,0": { rowspan: 2, text: "Span R1-R2" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);

  // Thêm hàng phía trước span (tại Row 0)
  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  addRowAbove(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 5);
  // Ô span bây giờ chuyển xuống Row 2, vẫn giữ rowspan = 2
  const cellSpan = info.tableNode.nodeAt(info.map.map[2 * 3 + 0]);
  assert.equal(cellSpan?.attrs?.rowspan, 2, "Span trước chèn không bị ảnh hưởng, giữ rowspan=2");
  assert.equal(info.map.problems, null);

  // Thêm hàng phía sau span (tại Row 4 - hàng cuối)
  editor.commands.setTextSelection(info.getCellDocPos(4, 0) + 2);
  addRowBelow(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 6);
  assert.equal(cellSpan?.attrs?.rowspan, 2, "Span sau chèn không bị ảnh hưởng, giữ rowspan=2");
  assert.equal(info.map.problems, null);

  editor.destroy();
});

/* ==========================================================================
   2. DELETE ROW
   ========================================================================== */

test("Phase 3 - 3. Delete Row Inside Rowspan: Deleting middle row decrements rowspan without orphan content", () => {
  // Table 5×3: Row 1 Col 0 có rowspan=3 (phủ Row 1, 2, 3)
  const initialDoc = createTableDoc(5, 3, false, {
    "1,0": { rowspan: 3, text: "Span R1-R3 Master Content" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);

  // Đặt con trỏ tại Row 2, Col 1 (hàng giữa của span)
  editor.commands.setTextSelection(info.getCellDocPos(2, 1) + 2);

  const deleted = deleteRow(editor);
  assert.equal(deleted, true, "deleteRow phải thành công");

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4, "Chiều cao bảng phải giảm từ 5 xuống 4");
  assert.equal(info.map.problems, null, "TableMap không được dangling hay có problem");

  // Ô tại (1,0) phải giảm rowspan từ 3 xuống 2
  const cellAt10 = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cellAt10?.attrs?.rowspan, 2, "Rowspan phải giảm xuống 2");
  assert.equal(cellAt10?.textContent, "Span R1-R3 Master Content", "Nội dung gốc không được bị mất");

  editor.destroy();
});

test("Phase 3 - 4. Delete Row at Top of Rowspan: Content migrates to next row and rowspan decrements", () => {
  // Table 4×3: Row 1 Col 0 có rowspan=3
  const initialDoc = createTableDoc(4, 3, false, {
    "1,0": { rowspan: 3, text: "Top Span Text To Keep" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);

  // Đặt con trỏ tại Row 1, Col 1 (ô 1 hàng thông thường trong cùng hàng 1 với đỉnh của span)
  // Xóa Row 1: chỉ xóa 1 hàng này, và đỉnh span ở Col 0 di chuyển xuống Row 2 (bây giờ là Row 1 mới)
  editor.commands.setTextSelection(info.getCellDocPos(1, 1) + 2);

  const deleted = deleteRow(editor);
  assert.equal(deleted, true, "deleteRow hàng đầu của span phải thành công");

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 3, "Bảng giảm còn 3 hàng");
  assert.equal(info.map.problems, null, "TableMap không có lỗi sau khi xóa hàng đầu của span");

  // Ô tại Row 1 (trước đây là Row 2) phải kế thừa nội dung và có rowspan = 2
  const migratedCell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(migratedCell?.attrs?.rowspan, 2, "Rowspan giảm từ 3 xuống 2");
  assert.equal(migratedCell?.textContent, "Top Span Text To Keep", "Nội dung phải được di chuyển an toàn sang hàng tiếp theo");

  editor.destroy();
});

/* ==========================================================================
   3. INSERT COLUMN
   ========================================================================== */

test("Phase 3 - 5. Insert Column Through Colspan: Expands colspan and creates no phantom cells", () => {
  // Table 3×4:
  // Row 1 Col 1 có colspan=2 (phủ Col 1..2)
  const initialDoc = createTableDoc(3, 4, false, {
    "1,1": { colspan: 2, text: "Colspan 2 Cell" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);
  assert.equal(info.map.width, 4);

  // Đặt con trỏ tại Row 0, Col 1 (ô đơn lẻ nằm trên cùng cột với ô span)
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);

  // Thêm cột bên phải Col 1 -> chèn vào giữa Col 1 và Col 2 của bảng
  const added = addColumnRight(editor);
  assert.equal(added, true, "addColumnRight phải thành công");

  info = getTablePosInfo(editor);
  assert.equal(info.map.width, 5, "Chiều rộng cột tăng lên 5");
  assert.equal(info.map.problems, null, "Không có phantom cell hay lỗi TableMap");

  // Ô tại Row 1, Col 1 bây giờ phải tự động mở rộng colspan = 3
  const cellMerged = info.tableNode.nodeAt(info.map.map[1 * 5 + 1]);
  assert.equal(cellMerged?.attrs?.colspan, 3, "Colspan phải tự động tăng từ 2 lên 3");

  editor.destroy();
});

/* ==========================================================================
   4. DELETE COLUMN
   ========================================================================== */

test("Phase 3 - 6. Delete Column Through Colspan: Updates colspan cleanly and preserves cell content", () => {
  // Table 3×4: Row 1 Col 1 có colspan=2
  const initialDoc = createTableDoc(3, 4, false, {
    "1,1": { colspan: 2, text: "Preserved Colspan Content" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);

  // Đặt con trỏ tại Row 0, Col 1 (thuộc cột đầu của colspan)
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);

  const deleted = deleteColumn(editor);
  assert.equal(deleted, true, "deleteColumn phải thành công");

  info = getTablePosInfo(editor);
  assert.equal(info.map.width, 3, "Chiều rộng cột giảm từ 4 xuống 3");
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau khi xóa cột qua span");

  // Ô tại Row 1, Col 1 phải giảm colspan về 1 và nội dung giữ nguyên
  const cellAfter = info.tableNode.nodeAt(info.map.map[1 * 3 + 1]);
  assert.equal(cellAfter?.attrs?.colspan, 1, "Colspan giảm về 1");
  assert.equal(cellAfter?.textContent, "Preserved Colspan Content", "Nội dung ô được bảo toàn");

  editor.destroy();
});

/* ==========================================================================
   5. COMBINATION ROWSPAN + COLSPAN (2×2 RECTANGLE)
   ========================================================================== */

test("Phase 3 - 7. Combination Rowspan + Colspan: 2×2 block correctly survives row/col additions and deletions", () => {
  // Table 4×4 với ô 2×2 tại (1,1) (rowspan=2, colspan=2)
  const initialDoc = createTableDoc(4, 4, false, {
    "1,1": { rowspan: 2, colspan: 2, text: "2x2 Mega Block" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4);
  assert.equal(info.map.width, 4);

  // 1. Thêm hàng bên trong 2×2 (con trỏ ở Row 2, Col 0)
  editor.commands.setTextSelection(info.getCellDocPos(2, 0) + 2);
  addRowAbove(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 5);
  let megaCell = info.tableNode.nodeAt(info.map.map[1 * 4 + 1]);
  assert.equal(megaCell?.attrs?.rowspan, 3, "Rowspan mở rộng lên 3");
  assert.equal(megaCell?.attrs?.colspan, 2, "Colspan giữ nguyên 2");
  assert.equal(info.map.problems, null);

  // 2. Thêm cột bên trong 2×2 (con trỏ ở Row 0, Col 1)
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);
  addColumnRight(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.width, 5);
  megaCell = info.tableNode.nodeAt(info.map.map[1 * 5 + 1]);
  assert.equal(megaCell?.attrs?.rowspan, 3, "Rowspan duy trì 3");
  assert.equal(megaCell?.attrs?.colspan, 3, "Colspan mở rộng lên 3");
  assert.equal(info.map.problems, null);

  // 3. Xóa cột (Row 0, Col 1)
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);
  deleteColumn(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.width, 4);
  megaCell = info.tableNode.nodeAt(info.map.map[1 * 4 + 1]);
  assert.equal(megaCell?.attrs?.colspan, 2, "Colspan giảm về 2");
  assert.equal(info.map.problems, null);

  // 4. Xóa hàng (Row 2, Col 0)
  editor.commands.setTextSelection(info.getCellDocPos(2, 0) + 2);
  deleteRow(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4);
  megaCell = info.tableNode.nodeAt(info.map.map[1 * 4 + 1]);
  assert.equal(megaCell?.attrs?.rowspan, 2, "Rowspan giảm về 2");
  assert.equal(megaCell?.textContent, "2x2 Mega Block", "Nội dung khối 2x2 nguyên vẹn");
  assert.equal(info.map.problems, null);

  editor.destroy();
});

/* ==========================================================================
   6. HEADER ROW OPERATIONS & SPAN SAFETY
   ========================================================================== */

test("Phase 3 - 8. Header Row Operations: Toggle header with merged cells & block vertical span bleeding into body", () => {
  // A. Header có horizontal merge colspan=2: Toggle phải chuyển đổi hợp lệ và giữ colspan
  const docWithHeaderSpan = createTableDoc(3, 3, true, {
    "0,0": { colspan: 2, text: "Header Colspan 2" },
  });
  const editorA = createEditor(docWithHeaderSpan);

  let infoA = getTablePosInfo(editorA);
  editorA.commands.setTextSelection(infoA.getCellDocPos(0, 0) + 2);

  assert.equal(canToggleHeaderRow(editorA), true, "Có thể toggle header khi có horizontal merge");
  toggleHeaderRow(editorA);

  infoA = getTablePosInfo(editorA);
  const cellRow0 = infoA.tableNode.nodeAt(infoA.map.map[0]);
  assert.equal(cellRow0?.type?.name, "tableCell", "Các ô header chuyển thành tableCell");
  assert.equal(cellRow0?.attrs?.colspan, 2, "Colspan=2 được bảo tồn");

  // Toggle lại về header
  toggleHeaderRow(editorA);
  infoA = getTablePosInfo(editorA);
  const cellRow0Back = infoA.tableNode.nodeAt(infoA.map.map[0]);
  assert.equal(cellRow0Back?.type?.name, "tableHeader", "Chuyển lại thành tableHeader");
  assert.equal(cellRow0Back?.attrs?.colspan, 2, "Colspan=2 vẫn duy trì");

  editorA.destroy();

  // B. Span Safety: Bảng thường có Row 0 bị merge dọc (rowspan=2) kéo dài xuống Body
  const docWithVerticalSpan = createTableDoc(3, 3, false, {
    "0,0": { rowspan: 2, text: "Vertical Span R0-R1" },
  });
  const editorB = createEditor(docWithVerticalSpan);

  let infoB = getTablePosInfo(editorB);
  editorB.commands.setTextSelection(infoB.getCellDocPos(0, 0) + 2);

  // Không được phép toggle header row khi có ô rowspan kéo dài xuống body!
  assert.equal(
    canToggleHeaderRow(editorB),
    false,
    "canToggleHeaderRow PHẢI trả về false khi hàng 0 có ô rowspan > 1 kéo dài xuống body"
  );

  const toggleDenied = toggleHeaderRow(editorB);
  assert.equal(toggleDenied, false, "toggleHeaderRow PHẢI từ chối để tránh tạo header nửa vời");

  editorB.destroy();
});

test("Phase 3 - 9. Header Adjacent Rows: Add row below header creates regular body row", () => {
  const editor = createEditor(createTableDoc(2, 3, true));
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  addRowBelow(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 3);

  // Hàng 1 mới chèn phải là các ô tableCell thông thường
  const newRowCell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(newRowCell?.type?.name, "tableCell", "Hàng chèn dưới header phải là tableCell thông thường");

  editor.destroy();
});

/* ==========================================================================
   7. TAB / SHIFT+TAB NAVIGATION FOUNDATION
   ========================================================================== */

test("Phase 3 - 10. Tab / Shift+Tab Navigation: Skips covered phantom cells and reaches only genuine cells", () => {
  // Table 3×3 với ô (0,0) có rowspan=2, colspan=2 (chiếm 0,0; 0,1; 1,0; 1,1)
  const initialDoc = createTableDoc(3, 3, false, {
    "0,0": { rowspan: 2, colspan: 2, text: "Mega 2x2" },
    "0,2": { text: "Cell 0,2" },
    "1,2": { text: "Cell 1,2" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);

  // Đặt con trỏ trong ô Mega 2x2 (0,0)
  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);

  // Nhấn Tab: Di chuyển sang ô tiếp theo
  const tab1 = goToNextCell(editor);
  assert.equal(tab1, true);

  // Ô tiếp theo trong AST phải là Cell 0,2 (BỎ QUA hoàn toàn phantom 0,1)
  assert.equal(editor.state.selection.$from.parent.textContent, "Cell 0,2");

  // Nhấn Tab tiếp: Di chuyển tiếp
  const tab2 = goToNextCell(editor);
  assert.equal(tab2, true);

  // Ô tiếp theo phải là Cell 1,2 (BỎ QUA phantom 1,0 và 1,1)
  assert.equal(editor.state.selection.$from.parent.textContent, "Cell 1,2");

  // Nhấn Shift+Tab: Lùi lại Cell 0,2
  const shiftTab1 = goToPreviousCell(editor);
  assert.equal(shiftTab1, true);
  assert.equal(editor.state.selection.$from.parent.textContent, "Cell 0,2");

  // Nhấn Shift+Tab tiếp: Lùi lại Mega 2x2
  const shiftTab2 = goToPreviousCell(editor);
  assert.equal(shiftTab2, true);
  assert.equal(editor.state.selection.$from.parent.textContent, "Mega 2x2");

  editor.destroy();
});

test("Phase 3 - 11. Tab at Last Cell: Extends table with new row without corrupting spans", () => {
  const editor = createEditor(createTableDoc(2, 2, false, {
    "0,0": { rowspan: 2, text: "Span R0-R1" }
  }));

  let info = getTablePosInfo(editor);
  assert.equal(info.map.height, 2);

  // Di chuyển đến ô cuối cùng (Row 1, Col 1)
  editor.commands.setTextSelection(info.getCellDocPos(1, 1) + 2);

  // Thao tác Tab chuẩn khi ở ô cuối cùng (chain addRowAfter + goToNextCell)
  const tabAtEnd =
    editor.commands.goToNextCell() ||
    editor.chain().addRowAfter().goToNextCell().run();
  assert.equal(tabAtEnd, true);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 3, "Nhấn Tab ở ô cuối phải tự động thêm một hàng mới");
  assert.equal(info.map.problems, null, "TableMap sau khi Tab thêm hàng phải hợp lệ");

  editor.destroy();
});

/* ==========================================================================
   8. COPY / PASTE BASELINE & FAIL-SAFE
   ========================================================================== */

test("Phase 3 - 12. Copy/Paste Baseline: Pasting into merged cells preserves structure and TableMap integrity", () => {
  const editor = createEditor(createTableDoc(3, 3, false, {
    "1,0": { rowspan: 2, text: "Target Span Cell" }
  }));

  let info = getTablePosInfo(editor);

  // Đặt con trỏ vào ô span (1,0) và chèn văn bản (mô phỏng paste text/slice an toàn không cần window DOM)
  editor.commands.setTextSelection(info.getCellDocPos(1, 0) + 2);
  const tr = editor.state.tr.insertText(" Nội dung dán bổ sung từ Clipboard");
  editor.view.dispatch(tr);

  info = getTablePosInfo(editor);
  const cell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cell?.attrs?.rowspan, 2, "Rowspan không bị biến dạng khi paste");
  assert.ok(cell?.textContent?.includes("Clipboard"), "Văn bản dán được đưa vào ô");
  assert.equal(info.map.problems, null, "TableMap tuyệt đối nguyên vẹn");

  editor.destroy();
});

/* ==========================================================================
   9. COMMENTS & TRACKED CONTENT PRESERVATION
   ========================================================================== */

test("Phase 3 - 13. Comments & Tracked Content: Structural operations preserve comment marks, track changes and links", () => {
  // Chuẩn bị ô có đầy đủ comment mark, trackChange mark và link mark
  const marks = [
    { type: "comment", attrs: { commentId: "cmt-safe-001" } },
    { type: "trackChange", attrs: { id: "chg-safe-002", changeType: "insert" } },
    { type: "link", attrs: { href: "https://wordeditor.test" } },
  ];

  const initialDoc = createTableDoc(4, 3, false, {
    "1,0": { rowspan: 3, text: "Văn bản có comment và track change", marks },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);

  // 1. Thao tác thêm hàng bên trong span
  editor.commands.setTextSelection(info.getCellDocPos(2, 1) + 2);
  addRowAbove(editor);

  info = getTablePosInfo(editor);
  let cellNode = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  let textNode = cellNode?.content?.firstChild?.firstChild;

  assert.ok(textNode?.marks?.some((m) => m.type.name === "comment" && m.attrs?.commentId === "cmt-safe-001"), "Comment mark phải được bảo tồn sau addRow");
  assert.ok(textNode?.marks?.some((m) => m.type.name === "trackChange" && m.attrs?.id === "chg-safe-002"), "Track change mark phải được bảo tồn sau addRow");
  assert.ok(textNode?.marks?.some((m) => m.type.name === "link" && m.attrs?.href === "https://wordeditor.test"), "Link mark phải được bảo tồn sau addRow");

  // 2. Thao tác xóa hàng đầu của span (khiến ô di chuyển vị trí trong AST)
  editor.commands.setTextSelection(info.getCellDocPos(1, 1) + 2);
  deleteRow(editor);

  info = getTablePosInfo(editor);
  cellNode = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  textNode = cellNode?.content?.firstChild?.firstChild;

  assert.ok(textNode?.marks?.some((m) => m.type.name === "comment" && m.attrs?.commentId === "cmt-safe-001"), "Comment mark phải được giữ khi ô di chuyển do deleteRow");
  assert.ok(textNode?.marks?.some((m) => m.type.name === "trackChange" && m.attrs?.id === "chg-safe-002"), "Track change mark phải được giữ khi ô di chuyển do deleteRow");
  assert.ok(textNode?.marks?.some((m) => m.type.name === "link"), "Link mark được giữ");

  // 3. Thao tác thêm cột
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);
  addColumnRight(editor);

  info = getTablePosInfo(editor);
  cellNode = info.tableNode.nodeAt(info.map.map[1 * 4 + 0]);
  textNode = cellNode?.content?.firstChild?.firstChild;

  assert.ok(textNode?.marks?.some((m) => m.type.name === "comment"), "Comment mark tồn tại sau addColumn");

  editor.destroy();
});

/* ==========================================================================
   10. UNDO / REDO ON STRUCTURAL OPERATIONS
   ========================================================================== */

test("Phase 3 - 14. Undo / Redo: Structural operations with spans produce exact atomic history steps", () => {
  const initialDoc = createTableDoc(4, 3, false, {
    "1,0": { rowspan: 2, text: "Span R1-R2" },
  });
  const editor = createEditor(initialDoc);

  let info = getTablePosInfo(editor);

  // 1. Thêm hàng bên trong span -> rowspan tăng lên 3
  editor.commands.setTextSelection(info.getCellDocPos(2, 1) + 2);
  addRowAbove(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 5);
  let cell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cell?.attrs?.rowspan, 3);

  // 2. Undo đúng 1 lần: khôi phục chính xác rowspan=2 và 4 hàng
  editor.commands.undo();
  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4, "Undo phải đưa số hàng về 4");
  cell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cell?.attrs?.rowspan, 2, "Undo phải phục hồi rowspan=2");

  // 3. Redo đúng 1 lần: áp dụng lại hàng mới và rowspan=3
  editor.commands.redo();
  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 5, "Redo đưa số hàng lên 5");
  cell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cell?.attrs?.rowspan, 3, "Redo phục hồi rowspan=3");

  // 4. Xóa hàng bên trong span -> rowspan giảm về 2
  editor.commands.setTextSelection(info.getCellDocPos(2, 1) + 2);
  deleteRow(editor);

  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 4);
  cell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cell?.attrs?.rowspan, 2);

  // 5. Undo xóa hàng đúng 1 lần: khôi phục hàng và rowspan=3
  editor.commands.undo();
  info = getTablePosInfo(editor);
  assert.equal(info.map.height, 5);
  cell = info.tableNode.nodeAt(info.map.map[1 * 3 + 0]);
  assert.equal(cell?.attrs?.rowspan, 3);

  editor.destroy();
});
