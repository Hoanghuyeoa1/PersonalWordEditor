import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  setTableCellMargins,
  setCellMarginOverride,
  getEffectiveCellMargins,
  setTableRowHeight,
  getTableRowHeight,
  distributeTableColumns,
  distributeTableRows,
  validateAndNormalizeCellMargins,
  validateAndNormalizeRowHeight,
  ptToPx,
  pxToPt,
  mmToPxUnit,
  pxToMmUnit,
  DEFAULT_TABLE_CELL_MARGINS,
} from "./tableDimensionService.ts";
import { findActiveTable, ensureEditorPlugins } from "./tableSizingService.ts";
import { estimateTableRowHeight } from "../page/services/pageLayoutMap.ts";
import { reflowManager } from "../page/services/reflowManager.ts";
import { TableMap, CellSelection } from "@tiptap/pm/tables";

function createDimensionTestEditor(options?: {
  rows?: number;
  cols?: number;
  withHeader?: boolean;
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
          colwidth: [100],
        },
        content: [
          {
            type: "paragraph",
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
            tableWidth: "100%",
            cellMargins: DEFAULT_TABLE_CELL_MARGINS,
          },
          content: tableRows,
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

test("Phase 5 - 1. Margins Defaults: Table default margins stored in AST and inherited by cells", () => {
  const editor = createDimensionTestEditor();
  const active = findActiveTable(editor)!;
  assert.ok(active, "Phải tìm thấy table node");

  const initialMargins = active.tableNode.attrs.cellMargins;
  assert.deepEqual(
    initialMargins,
    DEFAULT_TABLE_CELL_MARGINS,
    "Table ban đầu phải có DEFAULT_TABLE_CELL_MARGINS"
  );

  // Cập nhật table default margins
  const newMargins = { top: 12, right: 16, bottom: 12, left: 16 };
  const ok = setTableCellMargins(editor, newMargins);
  assert.equal(ok, true, "setTableCellMargins phải thành công");

  const updatedActive = findActiveTable(editor)!;
  assert.deepEqual(
    updatedActive.tableNode.attrs.cellMargins,
    newMargins,
    "Table attrs cellMargins phải được cập nhật mới"
  );

  // Kiểm tra effective margins của ô đầu tiên (chưa override)
  const firstRow = updatedActive.tableNode.child(0);
  const firstCell = firstRow.child(0);
  assert.equal(firstCell.attrs.cellMargins, null, "Ô chưa override có cellMargins = null");

  const effective = getEffectiveCellMargins(
    updatedActive.tableNode.attrs,
    firstCell.attrs
  );
  assert.deepEqual(
    effective,
    newMargins,
    "Ô chưa override phải kế thừa chính xác table default margins"
  );
});

test("Phase 5 - 2. Cell Override: Specific cell margin override takes precedence over table default", () => {
  const editor = createDimensionTestEditor();

  // Đặt con trỏ vào ô đầu tiên
  editor.commands.setTextSelection(3);

  // Thiết lập override riêng cho ô đang chọn
  const cellOverride = { top: 20, right: 25, bottom: 20, left: 25 };
  const ok = setCellMarginOverride(editor, cellOverride);
  assert.equal(ok, true, "setCellMarginOverride phải thành công");

  const active = findActiveTable(editor)!;
  const firstRow = active.tableNode.child(0);
  const firstCell = firstRow.child(0);
  const secondCell = firstRow.child(1);

  assert.deepEqual(
    firstCell.attrs.cellMargins,
    cellOverride,
    "Ô được chọn phải có cellMargins override riêng"
  );
  assert.equal(
    secondCell.attrs.cellMargins,
    null,
    "Ô kế bên không bị ảnh hưởng, giữ nguyên null"
  );

  const effectiveFirst = getEffectiveCellMargins(
    active.tableNode.attrs,
    firstCell.attrs
  );
  assert.deepEqual(
    effectiveFirst,
    cellOverride,
    "Effective margin của ô override phải ưu tiên cell override"
  );

  const effectiveSecond = getEffectiveCellMargins(
    active.tableNode.attrs,
    secondCell.attrs
  );
  assert.deepEqual(
    effectiveSecond,
    DEFAULT_TABLE_CELL_MARGINS,
    "Effective margin của ô kế bên giữ nguyên table default"
  );

  // Xóa override
  const clearOk = setCellMarginOverride(editor, null, { clearOverride: true });
  assert.equal(clearOk, true, "Xóa override thành công");

  const afterClear = findActiveTable(editor)!;
  assert.equal(
    afterClear.tableNode.child(0).child(0).attrs.cellMargins,
    null,
    "Sau khi xóa override, cellMargins trở về null và kế thừa table default"
  );
});

test("Phase 5 - 3. Validation: Margins reject invalid values and prevent negative content width", () => {
  // Test giá trị âm, NaN, string
  const invalidMargins = {
    top: -15,
    right: NaN,
    bottom: ("20px" as any),
    left: Infinity,
  };
  const normalized = validateAndNormalizeCellMargins(invalidMargins);
  assert.equal(normalized.top, 0, "Giá trị âm phải clamp về 0");
  assert.equal(normalized.right, DEFAULT_TABLE_CELL_MARGINS.right, "NaN phải fallback về mặc định");
  assert.equal(normalized.bottom, 20, "String số hợp lệ parse thành số");
  assert.equal(normalized.left, DEFAULT_TABLE_CELL_MARGINS.left, "Infinity phải fallback về mặc định");

  // Test không tạo negative content width
  // Giả sử column width = 40px, lề trái 25 + phải 25 = 50px (> 40 - 10 = 30px)
  const hugeHoriz = { left: 25, right: 25 };
  const safeHoriz = validateAndNormalizeCellMargins(hugeHoriz, 40);
  assert.ok(
    safeHoriz.left + safeHoriz.right <= 30,
    "Lề trái + phải phải được scale down an toàn để giữ content width >= 10px"
  );

  // Test centralized unit conversion
  assert.equal(ptToPx(12), 16, "12 pt = 16 px chuẩn 96 DPI");
  assert.equal(pxToPt(16), 12, "16 px = 12 pt chuẩn 96 DPI");
  assert.equal(mmToPxUnit(25.4), 96, "25.4 mm (1 inch) = 96 px");
  assert.equal(pxToMmUnit(96), 25.4, "96 px = 25.4 mm");
});

test("Phase 5 - 4. Row Auto: Content-based height calculation without arbitrary hardcoded height", () => {
  const rowNodeShort = {
    type: "tableRow",
    attrs: { rowHeight: null, rowHeightRule: "auto" },
    content: [
      {
        type: "tableCell",
        attrs: { colwidth: [120] },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Short" }] }],
      },
    ],
  };

  const shortH = estimateTableRowHeight(rowNodeShort, 70, 20);
  assert.ok(shortH >= 34, "Hàng ngắn có chiều cao cơ bản tối thiểu");

  const rowNodeLong = {
    type: "tableRow",
    attrs: { rowHeight: null, rowHeightRule: "auto" },
    content: [
      {
        type: "tableCell",
        attrs: { colwidth: [80] },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Đoạn văn bản rất dài trong ô để kiểm tra tính năng tự động tính chiều cao hàng dựa trên content.",
              },
            ],
          },
        ],
      },
    ],
  };

  const longH = estimateTableRowHeight(rowNodeLong, 70, 20);
  assert.ok(
    longH > shortH + 20,
    `Hàng có nội dung nhiều dòng (${longH}px) phải cao hơn hàng ngắn (${shortH}px)`
  );
});

test("Phase 5 - 5. Row At Least: Row expands when content exceeds configured height, respects height when small", () => {
  const editor = createDimensionTestEditor();
  editor.commands.setTextSelection(3);

  // Đặt rowHeight = 70px với rule = "atLeast"
  const ok = setTableRowHeight(editor, 70, "atLeast", { rowIndex: 0 });
  assert.equal(ok, true, "setTableRowHeight atLeast thành công");

  const heightInfo = getTableRowHeight(editor, 0);
  assert.equal(heightInfo.height, 70);
  assert.equal(heightInfo.rule, "atLeast");

  // Trường hợp nội dung nhỏ: estimateTableRowHeight phải cho đúng 70px
  const rowNodeSmall = {
    type: "tableRow",
    attrs: { rowHeight: 70, rowHeightRule: "atLeast" },
    content: [
      {
        type: "tableCell",
        attrs: { colwidth: [120] },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
      },
    ],
  };
  assert.equal(
    estimateTableRowHeight(rowNodeSmall, 70, 20),
    70,
    "Nội dung nhỏ phải giữ đúng cấu hình atLeast 70px"
  );

  // Trường hợp nội dung lớn hơn 70px: hàng phải tự động mở rộng
  const rowNodeLarge = {
    type: "tableRow",
    attrs: { rowHeight: 70, rowHeightRule: "atLeast" },
    content: [
      {
        type: "tableCell",
        attrs: { colwidth: [60] },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Văn bản cực dài yêu cầu nhiều dòng vượt quá 70px chiều cao cấu hình tối thiểu của hàng này",
              },
            ],
          },
        ],
      },
    ],
  };
  const measuredLargeH = estimateTableRowHeight(rowNodeLarge, 70, 20);
  assert.ok(
    measuredLargeH > 70,
    `Nội dung lớn phải tự động mở rộng vượt qua 70px (thực tế: ${measuredLargeH}px)`
  );
});

test("Phase 5 - 6. Row Exact: Preserves content without silent truncation or data destruction", () => {
  const editor = createDimensionTestEditor();
  editor.commands.setTextSelection(3);

  const ok = setTableRowHeight(editor, 50, "exact", { rowIndex: 0 });
  assert.equal(ok, true);

  const heightInfo = getTableRowHeight(editor, 0);
  assert.equal(heightInfo.height, 50);
  assert.equal(heightInfo.rule, "exact");

  // Kiểm tra chính sách data-preservation của Exact:
  // Nếu content lớn hơn 50px, hệ thống ước tính layout an toàn không cắt bỏ text
  const rowNodeExactLarge = {
    type: "tableRow",
    attrs: { rowHeight: 50, rowHeightRule: "exact" },
    content: [
      {
        type: "tableCell",
        attrs: { colwidth: [60] },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Dữ liệu quan trọng nhiều dòng trong ô có exact height",
              },
            ],
          },
        ],
      },
    ],
  };
  const exactH = estimateTableRowHeight(rowNodeExactLarge, 70, 20);
  assert.ok(
    exactH >= 50,
    "Exact height đảm bảo không phá vỡ hoặc làm mất nội dung người dùng"
  );
});

test("Phase 5 - 7. Large Content: Cell with tall multi-line text cleanly expands row", () => {
  const rowNode = {
    type: "tableRow",
    attrs: { rowHeight: null, rowHeightRule: "auto" },
    content: [
      {
        type: "tableCell",
        attrs: { colwidth: [50] },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Dòng 1, dòng 2, dòng 3, dòng 4, dòng 5, dòng 6, dòng 7, dòng 8 của bảng",
              },
            ],
          },
        ],
      },
    ],
  };
  const h = estimateTableRowHeight(rowNode, 70, 20);
  assert.ok(h > 80, `Chiều cao hàng phải đạt ít nhất 80px khi có nhiều dòng (thực tế: ${h}px)`);
});

test("Phase 5 - 8. Distribute Columns: Distributes column widths evenly and sets layoutMode=fixed", () => {
  const editor = createDimensionTestEditor({ rows: 2, cols: 3 });
  const active = findActiveTable(editor)!;

  // Giả lập 3 cột có độ rộng bất đối xứng [50, 150, 400] = tổng 600px
  const tr = editor.state.tr;
  active.tableNode.forEach((row, _offset) => {
    row.forEach((cell, cellOffset) => {
      let w = 100;
      if (cellOffset === 0) w = 50;
      else if (cellOffset === row.child(0).nodeSize) w = 150;
      else w = 400;
      tr.setNodeMarkup(active.tablePos + 1 + _offset + 1 + cellOffset, undefined, {
        ...cell.attrs,
        colwidth: [w],
      });
    });
  });
  editor.view.dispatch(tr);

  // Phân phối toàn bộ các cột trong bảng
  editor.commands.setTextSelection(3);
  const ok = distributeTableColumns(editor);
  assert.equal(ok, true, "distributeTableColumns thành công");

  const updatedActive = findActiveTable(editor)!;
  assert.equal(
    updatedActive.tableNode.attrs.layoutMode,
    "fixed",
    "Bảng phải chuyển sang layoutMode=fixed sau khi phân phối cột"
  );

  // Kiểm tra độ rộng các cột của hàng đầu tiên
  const firstRow = updatedActive.tableNode.child(0);
  const c0 = firstRow.child(0).attrs.colwidth[0];
  const c1 = firstRow.child(1).attrs.colwidth[0];
  const c2 = firstRow.child(2).attrs.colwidth[0];

  assert.equal(c0, 200, "Cột 0 phải có độ rộng 200px");
  assert.equal(c1, 200, "Cột 1 phải có độ rộng 200px");
  assert.equal(c2, 200, "Cột 2 phải có độ rộng 200px");
});

test("Phase 5 - 9. Distribute Rows: Distributes row heights with deterministic policy and content guard", () => {
  const editor = createDimensionTestEditor({ rows: 3, cols: 2 });
  const active = findActiveTable(editor)!;

  // Thiết lập chiều cao bất đối xứng cho 3 hàng: [30, 90, 30] = tổng 150px
  const tr = editor.state.tr;
  let offset = active.tablePos + 1;
  const heights = [30, 90, 30];
  let idx = 0;
  for (let i = 0; i < active.tableNode.childCount; i++) {
    const child = active.tableNode.child(i);
    if (child.type.name === "tableRow") {
      tr.setNodeMarkup(offset, undefined, {
        ...child.attrs,
        rowHeight: heights[idx],
        rowHeightRule: "atLeast",
      });
      idx++;
    }
    offset += child.nodeSize;
  }
  editor.view.dispatch(tr);

  // Thực thi distributeTableRows
  editor.commands.setTextSelection(3);
  const ok = distributeTableRows(editor);
  assert.equal(ok, true, "distributeTableRows thành công");

  const updatedActive = findActiveTable(editor)!;
  // Trung bình: 150 / 3 = 50px
  for (let i = 0; i < 3; i++) {
    const row = updatedActive.tableNode.child(i);
    assert.equal(row.attrs.rowHeight, 50, `Hàng ${i} phải nhận chiều cao trung bình 50px`);
    assert.equal(row.attrs.rowHeightRule, "atLeast", `Hàng ${i} phải có rule atLeast để bảo vệ content`);
  }
});

test("Phase 5 - 10. Merged Cells: Distribute and margins handle rowspan and colspan cleanly", () => {
  // Tạo bảng có ô gộp colspan=2
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { layoutMode: "autoWindow", cellMargins: DEFAULT_TABLE_CELL_MARGINS },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 2, rowspan: 1, colwidth: [100, 100] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Merged 2 cols" }] }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Col 3" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "R1C0" }] }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "R1C1" }] }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: [100] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "R1C2" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  editor.commands.setTextSelection(3);

  // Phân phối cột khi có ô gộp
  const ok = distributeTableColumns(editor);
  assert.equal(ok, true, "distributeTableColumns thành công với ô gộp");

  const active = findActiveTable(editor)!;
  const mergedCell = active.tableNode.child(0).child(0);
  assert.equal(mergedCell.attrs.colspan, 2);
  assert.ok(Array.isArray(mergedCell.attrs.colwidth));
  assert.equal(mergedCell.attrs.colwidth.length, 2, "Ô gộp 2 cột nhận mảng colwidth 2 phần tử");
  assert.equal(mergedCell.attrs.colwidth[0], mergedCell.attrs.colwidth[1], "Hai cột gộp được phân phối đều");
});

test("Phase 5 - 11. Pagination Invalidation: Dimension changes notify reflowManager and clear cache", () => {
  const editor = createDimensionTestEditor();
  const active = findActiveTable(editor)!;

  // Giả lập ghi cache table rows vào reflowManager
  reflowManager.setCachedTableRowHeight(active.tablePos + 1, 45);
  assert.equal(reflowManager.getCachedTableRowHeight(active.tablePos + 1), 45);

  // Thay đổi chiều cao hàng
  editor.commands.setTextSelection(3);
  setTableRowHeight(editor, 80, "atLeast", { rowIndex: 0 });

  // Kiểm tra reflowManager đã bị invalidate cache từ tablePos trở đi
  assert.equal(
    reflowManager.getCachedTableRowHeight(active.tablePos + 1),
    undefined,
    "Measurement cache của table row phải bị xóa khi dimension thay đổi"
  );

  const pendingDirty = reflowManager.getPendingDirtyRange();
  assert.ok(pendingDirty !== null, "reflowManager phải có pending dirty range");
  assert.equal(pendingDirty!.scope, "block");
  assert.equal(pendingDirty!.reason, "table-dimension-change");
});

test("Phase 5 - 12. Undo / Redo: Each dimension action produces exactly one atomic history transaction", () => {
  const editor = createDimensionTestEditor();
  editor.commands.setTextSelection(3);

  const activeInitial = findActiveTable(editor)!;
  const initialMargins = activeInitial.tableNode.attrs.cellMargins;

  // Thao tác 1: Cập nhật table margins
  setTableCellMargins(editor, { top: 15, right: 20, bottom: 15, left: 20 });
  const afterSetMargins = findActiveTable(editor)!;
  assert.deepEqual(afterSetMargins.tableNode.attrs.cellMargins, {
    top: 15,
    right: 20,
    bottom: 15,
    left: 20,
  });

  // Undo 1 bước -> trở về initialMargins
  assert.equal(editor.can().undo(), true);
  editor.commands.undo();

  const afterUndoMargins = findActiveTable(editor)!;
  assert.deepEqual(
    afterUndoMargins.tableNode.attrs.cellMargins,
    initialMargins,
    "Undo phải khôi phục chính xác margins ban đầu"
  );

  // Redo -> trở lại margins mới
  editor.commands.redo();
  const afterRedoMargins = findActiveTable(editor)!;
  assert.deepEqual(afterRedoMargins.tableNode.attrs.cellMargins, {
    top: 15,
    right: 20,
    bottom: 15,
    left: 20,
  });

  // Thao tác 2: Đặt row height
  setTableRowHeight(editor, 65, "atLeast", { rowIndex: 0 });
  assert.equal(getTableRowHeight(editor, 0).height, 65);

  // Undo row height
  editor.commands.undo();
  assert.equal(getTableRowHeight(editor, 0).height, null, "Undo khôi phục rowHeight=null");
});
