import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  autoFitContents,
  autoFitWindow,
  setFixedColumnWidths,
  getTableLayoutMode,
  setTableLayoutMode,
  getSectionUsableWidthPx,
  calculateAutoFitContentWidths,
  calculateAutoFitWindowWidths,
} from "./editorCommands.ts";
import { TableMap } from "@tiptap/pm/tables";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { useZoomStore } from "../stores/zoomStore.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import { DEFAULT_PAGE_SETTINGS, MARGIN_PRESETS } from "../page/services/pageConstants.ts";

function createEditor(content?: any) {
  return new Editor({
    extensions: getEditorExtensions(),
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table Sizing Test Bed" }],
        },
      ],
    },
  });
}

function createSizingTableDoc(
  rows: number,
  cols: number,
  customCells?: Record<string, { colspan?: number; rowspan?: number; text?: string; colwidth?: number[] }>,
  tableAttrs?: Record<string, any>
) {
  const rowNodes = [];
  const covered = new Set<string>();

  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (covered.has(key)) continue;

      const custom = customCells?.[key];
      const colspan = custom?.colspan ?? 1;
      const rowspan = custom?.rowspan ?? 1;
      const cellText = custom?.text ?? `R${r}C${c}`;
      const colwidth = custom?.colwidth ?? null;

      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          if (dr > 0 || dc > 0) covered.add(`${r + dr},${c + dc}`);
        }
      }

      cells.push({
        type: "tableCell",
        attrs: { colspan, rowspan, colwidth },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: cellText }],
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
        attrs: { borders: "all", repeatHeader: true, layoutMode: "autoWindow", tableWidth: "100%", ...tableAttrs },
        content: rowNodes,
      },
    ],
  };
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
    throw new Error("Không tìm thấy table trong tài liệu");
  }

  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;

  const getCellDocPos = (row: number, col: number): number => {
    const offset = map.map[row * map.width + col];
    return tableStart + offset;
  };

  return { tableNode, tablePos, tableStart, map, getCellDocPos };
}

/* ==========================================================================
   1. AUTOFIT CONTENTS
   ========================================================================== */

test("Phase 4 - 1. AutoFit Contents: Shrinks columns to fit content and sets layoutMode=autoContent", () => {
  // Bảng 2 hàng × 3 cột với nội dung ngắn
  const doc = createSizingTableDoc(2, 3, {
    "0,0": { text: "ID" },
    "0,1": { text: "Tên" },
    "0,2": { text: "Tuổi" },
  });
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  // Đặt con trỏ vào bảng
  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);

  const ok = autoFitContents(editor, { minColumnWidth: 40, maxAvailableWidth: 602 });
  assert.equal(ok, true, "autoFitContents phải thành công");

  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "autoContent", "layoutMode phải là autoContent");

  // Kiểm tra colwidth trên các ô
  const cell0 = info.tableNode.nodeAt(info.map.map[0]);
  const cell1 = info.tableNode.nodeAt(info.map.map[1]);
  const cell2 = info.tableNode.nodeAt(info.map.map[2]);

  assert.ok(Array.isArray(cell0?.attrs?.colwidth) && cell0?.attrs?.colwidth[0] >= 40, "Cột 0 >= minWidth");
  assert.ok(Array.isArray(cell1?.attrs?.colwidth) && cell1?.attrs?.colwidth[0] >= 40, "Cột 1 >= minWidth");
  assert.ok(Array.isArray(cell2?.attrs?.colwidth) && cell2?.attrs?.colwidth[0] >= 40, "Cột 2 >= minWidth");

  // Vì text rất ngắn ("ID", "Tên", "Tuổi"), tổng độ rộng các cột phải nhỏ gọn (< 300px), không bị giãn tràn trang
  const totalW = (cell0?.attrs?.colwidth[0] || 0) + (cell1?.attrs?.colwidth[0] || 0) + (cell2?.attrs?.colwidth[0] || 0);
  assert.ok(totalW < 300, `Tổng độ rộng AutoFit Contents phải nhỏ gọn: ${totalW}px`);
  assert.equal(info.map.problems, null, "TableMap hoàn toàn hợp lệ");

  editor.destroy();
});

/* ==========================================================================
   2. AUTOFIT WINDOW
   ========================================================================== */

test("Phase 4 - 2. AutoFit Window: Expands columns to fit usable page width exactly", () => {
  const doc = createSizingTableDoc(2, 3);
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);

  const usableWidthPx = 602; // A4 portrait usable width
  const ok = autoFitWindow(editor, { usableWidthPx });
  assert.equal(ok, true, "autoFitWindow phải thành công");

  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "autoWindow", "layoutMode phải là autoWindow");

  const w0 = info.tableNode.nodeAt(info.map.map[0])?.attrs?.colwidth?.[0] || 0;
  const w1 = info.tableNode.nodeAt(info.map.map[1])?.attrs?.colwidth?.[0] || 0;
  const w2 = info.tableNode.nodeAt(info.map.map[2])?.attrs?.colwidth?.[0] || 0;

  assert.equal(w0 + w1 + w2, usableWidthPx, "Tổng các cột phải khớp chính xác usable width của trang");
  assert.equal(info.map.problems, null);

  editor.destroy();
});

/* ==========================================================================
   3. FIXED COLUMN WIDTH
   ========================================================================== */

test("Phase 4 - 3. Fixed Column Width: Assigns explicit widths and sets layoutMode=fixed", () => {
  const doc = createSizingTableDoc(2, 3);
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);

  const requestedWidths = [120, 260, 180];
  const ok = setFixedColumnWidths(editor, requestedWidths);
  assert.equal(ok, true);

  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "fixed", "layoutMode phải là fixed");

  const cell0 = info.tableNode.nodeAt(info.map.map[0]);
  const cell1 = info.tableNode.nodeAt(info.map.map[1]);
  const cell2 = info.tableNode.nodeAt(info.map.map[2]);

  assert.deepEqual(cell0?.attrs?.colwidth, [120]);
  assert.deepEqual(cell1?.attrs?.colwidth, [260]);
  assert.deepEqual(cell2?.attrs?.colwidth, [180]);
  assert.equal(info.map.problems, null);

  editor.destroy();
});

/* ==========================================================================
   4. LONG CONTENT DIFFERENTIAL
   ========================================================================== */

test("Phase 4 - 4. Long Content: AutoFit Contents allocates proportional width based on text length", () => {
  const doc = createSizingTableDoc(2, 2, {
    "0,0": { text: "No." },
    "0,1": { text: "Bản báo cáo chi tiết về tình hình tài chính quý III năm 2026 với nhiều dữ liệu phân tích sâu sắc" },
  });
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  autoFitContents(editor, { minColumnWidth: 40, maxAvailableWidth: 600 });

  info = getTablePosInfo(editor);
  const w0 = info.tableNode.nodeAt(info.map.map[0])?.attrs?.colwidth?.[0] || 0;
  const w1 = info.tableNode.nodeAt(info.map.map[1])?.attrs?.colwidth?.[0] || 0;

  assert.ok(w1 > w0 * 3, `Cột nội dung dài (${w1}px) phải rộng hơn đáng kể cột nội dung ngắn (${w0}px)`);
  assert.ok(w0 + w1 <= 600, "Tổng độ rộng không vượt quá maxAvailableWidth");

  editor.destroy();
});

/* ==========================================================================
   5. UNBROKEN STRING / LONG URL CAPPING
   ========================================================================== */

test("Phase 4 - 5. Unbroken Text / Long URL: Safely capped without producing absurd widths", () => {
  const longUrl = "https://verylongsubdomainname.examplecompanyorganization.internal.network/reports/2026/quarterly/financial_breakdown_full_archive_data.json";
  const doc = createSizingTableDoc(2, 2, {
    "0,0": { text: "URL" },
    "0,1": { text: longUrl },
  });
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  autoFitContents(editor, { minColumnWidth: 40, maxAvailableWidth: 600 });

  info = getTablePosInfo(editor);
  const w1 = info.tableNode.nodeAt(info.map.map[1])?.attrs?.colwidth?.[0] || 0;

  // Chiều rộng phải được khống chế trong giới hạn hợp lý, không bao giờ sinh kích thước hàng nghìn px
  assert.ok(w1 <= 600 * 0.85 + 20, `Cột chứa URL dài (${w1}px) phải được giới hạn hợp lý <= 85% trang`);
  assert.ok(w1 >= 100, `Cột URL (${w1}px) phải đủ chỗ đọc`);

  editor.destroy();
});

/* ==========================================================================
   6. MERGED CELLS (COLSPAN) SIZING
   ========================================================================== */

test("Phase 4 - 6. Merged Cells: Multi-column spans properly receive arrays of column widths", () => {
  // Table 3×3 với ô (0,0) có colspan=2
  const doc = createSizingTableDoc(3, 3, {
    "0,0": { colspan: 2, text: "Merged Header Colspan 2" },
    "0,2": { text: "Single Cell 0,2" },
  });
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  autoFitWindow(editor, { usableWidthPx: 600 });

  info = getTablePosInfo(editor);
  const mergedCell = info.tableNode.nodeAt(info.map.map[0]);
  assert.equal(mergedCell?.attrs?.colspan, 2);

  // Ô colspan=2 phải có colwidth chứa đúng 2 phần tử tương ứng 2 cột
  assert.ok(Array.isArray(mergedCell?.attrs?.colwidth));
  assert.equal(mergedCell?.attrs?.colwidth?.length, 2, "colwidth của ô colspan=2 phải có 2 phần tử");

  const [col0W, col1W] = mergedCell?.attrs?.colwidth;
  const singleCell = info.tableNode.nodeAt(info.map.map[2]);
  const [col2W] = singleCell?.attrs?.colwidth;

  assert.equal(col0W + col1W + col2W, 600, "Tổng các cột phải đúng bằng 600px");
  assert.equal(info.map.problems, null);

  editor.destroy();
});

/* ==========================================================================
   7. SECTION USABLE WIDTH & GEOMETRY
   ========================================================================== */

test("Phase 4 - 7. Section Width Geometry: Respects page margins without touching window.innerWidth", () => {
  useDocumentStore.getState().updatePageSettings({
    paperSize: "A4",
    orientation: "portrait",
    margins: { ...MARGIN_PRESETS.Normal }, // 25.4mm = 96px each side
  });

  const editor = createEditor(createSizingTableDoc(2, 2));
  const portraitUsable = getSectionUsableWidthPx(editor, 0);

  // A4: 210mm (~794px) - 2 * 96px = ~602px
  assert.ok(portraitUsable >= 600 && portraitUsable <= 605, `Portrait usable width: ${portraitUsable}px`);

  // Đổi sang Narrow margins (12.7mm = 48px each side)
  useDocumentStore.getState().updatePageSettings({
    margins: { ...MARGIN_PRESETS.Narrow },
  });

  const narrowUsable = getSectionUsableWidthPx(editor, 0);
  // Narrow margins: 794 - 2 * 48 = ~698px
  assert.ok(narrowUsable >= 695 && narrowUsable <= 700, `Narrow margins usable width: ${narrowUsable}px`);
  assert.ok(narrowUsable > portraitUsable, "Narrow margins phải cho usable width lớn hơn Normal margins");

  // Reset về Normal
  useDocumentStore.getState().updatePageSettings({
    margins: { ...MARGIN_PRESETS.Normal },
  });
  editor.destroy();
});

/* ==========================================================================
   8. LANDSCAPE VS PORTRAIT GEOMETRY
   ========================================================================== */

test("Phase 4 - 8. Landscape Geometry: A4 Landscape yields significantly wider usable width than Portrait", () => {
  // Portrait
  useDocumentStore.getState().updatePageSettings({
    paperSize: "A4",
    orientation: "portrait",
    margins: { ...MARGIN_PRESETS.Normal },
  });
  const editorP = createEditor(createSizingTableDoc(2, 2));
  const portraitWidth = getSectionUsableWidthPx(editorP, 0);

  // Landscape
  useDocumentStore.getState().updatePageSettings({
    paperSize: "A4",
    orientation: "landscape",
    margins: { ...MARGIN_PRESETS.Normal },
  });
  const editorL = createEditor(createSizingTableDoc(2, 2));
  const landscapeWidth = getSectionUsableWidthPx(editorL, 0);

  // A4 Landscape width = 297mm (~1123px) - 192px margins = ~931px
  assert.ok(landscapeWidth >= 925 && landscapeWidth <= 935, `Landscape width: ${landscapeWidth}px`);
  assert.ok(landscapeWidth > portraitWidth + 300, "Landscape phải rộng hơn Portrait hơn 300px");

  // Khi AutoFit Window trên Landscape, bảng mở rộng đầy đủ theo geometry trang ngang
  autoFitWindow(editorL);
  const infoL = getTablePosInfo(editorL);
  const w0 = infoL.tableNode.nodeAt(infoL.map.map[0])?.attrs?.colwidth?.[0] || 0;
  const w1 = infoL.tableNode.nodeAt(infoL.map.map[1])?.attrs?.colwidth?.[0] || 0;
  assert.equal(w0 + w1, landscapeWidth, "AutoFit Window trên Landscape phải lấp đầy 931px của trang ngang");

  // Reset về portrait
  useDocumentStore.getState().updatePageSettings({
    orientation: "portrait",
  });
  editorP.destroy();
  editorL.destroy();
});

/* ==========================================================================
   9. ZOOM INVARIANCE
   ========================================================================== */

test("Phase 4 - 9. Zoom Invariance: UI zoom level changes do not mutate AST colwidth", () => {
  const doc = createSizingTableDoc(2, 2, {
    "0,0": { colwidth: [180] },
    "0,1": { colwidth: [250] },
  });
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  const initialJson = JSON.stringify(editor.getJSON());

  // Đổi zoom từ 100% -> 150% -> 200% -> 75%
  useZoomStore.getState().setZoom(150);
  assert.equal(useZoomStore.getState().zoom, 150);

  useZoomStore.getState().setZoom(200);
  assert.equal(useZoomStore.getState().zoom, 200);

  useZoomStore.getState().setZoom(75);
  assert.equal(useZoomStore.getState().zoom, 75);

  // Kiểm tra lại AST: colwidth phải nguyên vẹn 100%
  info = getTablePosInfo(editor);
  const cell0 = info.tableNode.nodeAt(info.map.map[0]);
  const cell1 = info.tableNode.nodeAt(info.map.map[1]);

  assert.deepEqual(cell0?.attrs?.colwidth, [180], "colwidth không được thay đổi khi zoom");
  assert.deepEqual(cell1?.attrs?.colwidth, [250], "colwidth không được thay đổi khi zoom");
  assert.equal(JSON.stringify(editor.getJSON()), initialJson, "Tài liệu JSON phải bất biến đối với zoom");

  useZoomStore.getState().resetZoom();
  editor.destroy();
});

/* ==========================================================================
   10. MANUAL RESIZE PERSISTENCE (NO AUTO-OVERWRITE)
   ========================================================================== */

test("Phase 4 - 10. Manual Resize Persistence: User defined fixed widths are preserved and not auto-overwritten", () => {
  const doc = createSizingTableDoc(2, 3);
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);

  // User thiết lập độ rộng thủ công cho các cột
  const manualWidths = [110, 290, 150];
  setFixedColumnWidths(editor, manualWidths);

  info = getTablePosInfo(editor);
  assert.equal(getTableLayoutMode(editor), "fixed");

  // Thực hiện thêm thao tác soạn thảo (gõ văn bản vào ô)
  editor.commands.setTextSelection(info.getCellDocPos(1, 0) + 2);
  const tr = editor.state.tr.insertText(" Dữ liệu mới thêm vào");
  editor.view.dispatch(tr);

  // Kiểm tra: độ rộng cột vẫn giữ nguyên chính xác kích thước do user chỉ định
  info = getTablePosInfo(editor);
  const cell0 = info.tableNode.nodeAt(info.map.map[0]);
  const cell1 = info.tableNode.nodeAt(info.map.map[1]);
  const cell2 = info.tableNode.nodeAt(info.map.map[2]);

  assert.deepEqual(cell0?.attrs?.colwidth, [110], "Độ rộng cột thủ công phải được bảo lưu");
  assert.deepEqual(cell1?.attrs?.colwidth, [290], "Độ rộng cột thủ công phải được bảo lưu");
  assert.deepEqual(cell2?.attrs?.colwidth, [150], "Độ rộng cột thủ công phải được bảo lưu");
  assert.equal(info.tableNode.attrs.layoutMode, "fixed");

  editor.destroy();
});

/* ==========================================================================
   11. OVERFLOW POLICY
   ========================================================================== */

test("Phase 4 - 11. Overflow Policy: Fixed table exceeding page width is not silently crushed, supports AutoFit Window recovery", () => {
  const doc = createSizingTableDoc(2, 3);
  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);

  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);

  // User đặt các cột rất rộng: [350, 400, 350] = 1100px (vượt xa usable width 602px của A4 Portrait)
  const wideWidths = [350, 400, 350];
  setFixedColumnWidths(editor, wideWidths);

  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "fixed");

  const cell0 = info.tableNode.nodeAt(info.map.map[0]);
  const cell1 = info.tableNode.nodeAt(info.map.map[1]);
  const cell2 = info.tableNode.nodeAt(info.map.map[2]);

  // Hệ thống KHÔNG được tự động bóp nghẹt độ rộng cột của user
  assert.deepEqual(cell0?.attrs?.colwidth, [350], "Không được tự ý ép nhỏ cột người dùng");
  assert.deepEqual(cell1?.attrs?.colwidth, [400], "Không được tự ý ép nhỏ cột người dùng");
  assert.deepEqual(cell2?.attrs?.colwidth, [350], "Không được tự ý ép nhỏ cột người dùng");

  // User có thể chọn AutoFit Window để đưa bảng về vừa khít trang
  autoFitWindow(editor, { usableWidthPx: 602 });
  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "autoWindow");

  const w0 = info.tableNode.nodeAt(info.map.map[0])?.attrs?.colwidth?.[0] || 0;
  const w1 = info.tableNode.nodeAt(info.map.map[1])?.attrs?.colwidth?.[0] || 0;
  const w2 = info.tableNode.nodeAt(info.map.map[2])?.attrs?.colwidth?.[0] || 0;
  assert.equal(w0 + w1 + w2, 602, "AutoFit Window thu gọn bảng vừa vặn 602px của trang");

  editor.destroy();
});

/* ==========================================================================
   12. UNDO / REDO ON SIZING OPERATIONS
   ========================================================================== */

test("Phase 4 - 12. Undo / Redo: Sizing operations produce exactly one atomic history transaction", () => {
  const doc = createSizingTableDoc(2, 3, {
    "0,0": { colwidth: [200] },
    "0,1": { colwidth: [200] },
    "0,2": { colwidth: [200] },
  }, { layoutMode: "autoWindow" });

  const editor = createEditor(doc);
  let info = getTablePosInfo(editor);
  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);

  // 1. Chuyển sang Fixed [100, 300, 200]
  setFixedColumnWidths(editor, [100, 300, 200]);
  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "fixed");
  let cell0 = info.tableNode.nodeAt(info.map.map[0]);
  assert.deepEqual(cell0?.attrs?.colwidth, [100]);

  // 2. Undo đúng 1 lần: quay lại trạng thái autoWindow ban đầu với colwidth [200, 200, 200]
  const undoResult = editor.commands.undo();
  assert.equal(undoResult, true, "Lệnh undo phải thành công");
  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "autoWindow", "Undo phải phục hồi layoutMode autoWindow");
  cell0 = info.tableNode.nodeAt(info.map.map[0]);
  assert.deepEqual(cell0?.attrs?.colwidth, [200], "Undo phải phục hồi colwidth ban đầu");

  // 3. Redo đúng 1 lần: áp dụng lại [100, 300, 200] và fixed
  editor.commands.redo();
  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "fixed");
  cell0 = info.tableNode.nodeAt(info.map.map[0]);
  assert.deepEqual(cell0?.attrs?.colwidth, [100]);

  // 4. Áp dụng AutoFit Contents
  autoFitContents(editor, { minColumnWidth: 40, maxAvailableWidth: 602 });
  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "autoContent");

  // 5. Undo đúng 1 lần: quay lại Fixed [100, 300, 200]
  editor.commands.undo();
  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "fixed");
  cell0 = info.tableNode.nodeAt(info.map.map[0]);
  assert.deepEqual(cell0?.attrs?.colwidth, [100]);

  // 6. Redo đúng 1 lần: tái lập lại AutoFit Contents
  editor.commands.redo();
  info = getTablePosInfo(editor);
  assert.equal(info.tableNode.attrs.layoutMode, "autoContent");

  editor.destroy();
});
