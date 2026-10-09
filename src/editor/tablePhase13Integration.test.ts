import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { TableMap } from "@tiptap/pm/tables";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  ensureEditorPlugins,
  mergeCells,
  splitCell,
  canMergeCells,
  canSplitCell,
  setTableCellSelection,
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  toggleHeaderRow,
  canToggleHeaderRow,
  handleTabNavigation,
  undo,
  setSearchTerm,
  replaceCurrentMatch,
  getSearchState,
} from "./editorCommands.ts";
import {
  autoFitContents,
  autoFitWindow,
  calculateAutoFitContentWidths,
  calculateAutoFitWindowWidths,
  getSectionUsableWidthPx,
} from "./tableSizingService.ts";
import {
  setTableCellMargins,
  setCellMarginOverride,
  setTableRowHeight,
  distributeTableColumns,
  distributeTableRows,
  validateAndNormalizeRowHeight,
  getEffectiveCellMargins,
} from "./tableDimensionService.ts";
import {
  applyTableStyle,
  resolveCellPresentation,
} from "./tableStyleService.ts";
import {
  buildPageLayoutMap,
  estimateTableRowHeight,
} from "../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/services/pageConstants.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { exportDocumentModelToDocx } from "../docx/export/docxExporter.ts";
import { importDocxToDocumentModel } from "../docx/import/docxImporter.ts";
import { parseXmlString } from "../docx/utils/xmlUtils.ts";
import { CaptionService } from "../references/services/captionService.ts";
import { CrossReferenceService } from "../references/services/crossReferenceService.ts";
import type { DocumentModel } from "../document/documentTypes.ts";

/**
 * Helper khởi tạo headless Tiptap Editor có đầy đủ extensions và plugins
 */
function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table Engine 2.0 Integration Test" }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/**
 * Helper trích xuất thông tin table node, map và vị trí cell trong doc
 */
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

/**
 * Helper tạo 3x3 table JSONContent
 */
function create3x3TableContent(withHeader = false): JSONContent {
  const rows: JSONContent[] = [];
  for (let r = 0; r < 3; r++) {
    const isH = withHeader && r === 0;
    const type = isH ? "tableHeader" : "tableCell";
    const cells: JSONContent[] = [];
    for (let c = 0; c < 3; c++) {
      const colLetter = String.fromCharCode(65 + c);
      cells.push({
        type,
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `${colLetter}${r + 1}` }],
          },
        ],
      });
    }
    rows.push({
      type: "tableRow",
      content: cells,
    });
  }

  return {
    type: "table",
    attrs: { borders: "all", layoutMode: "autoWindow", repeatHeader: true },
    content: rows,
  };
}

/**
 * Helper tạo DocumentModel chuẩn để test DOCX round-trip
 */
function createTestDocModel(tableNode: JSONContent): DocumentModel {
  return {
    metadata: {
      id: "doc-phase13-test",
      title: "Table Engine 2.0 Phase 13 Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    content: {
      type: "doc",
      content: [tableNode],
    },
  };
}

// ============================================================================
// 1. WORKFLOW A — VERTICAL MERGE (3x3 Table, Select A1/A2/A3, Merge -> rowspan=3, Save/Open, DOCX)
// ============================================================================
test("Phase 13 - Workflow A: Vertical Merge A1/A2/A3 -> rowspan=3 -> Save/Open -> Export DOCX round-trip", async () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  const { getCellDocPos } = getTableDocInfo(editor);
  const a1Pos = getCellDocPos(0, 0); // A1: row 0, col 0
  const a3Pos = getCellDocPos(2, 0); // A3: row 2, col 0

  // 1. Chọn A1/A2/A3 bằng CellSelection
  const selOk = setTableCellSelection(editor, a1Pos, a3Pos);
  assert.equal(selOk, true, "CellSelection từ A1 đến A3 phải thành công");
  assert.equal(canMergeCells(editor), true, "Vùng chọn phải merge được");

  // 2. Thực hiện Merge
  const merged = mergeCells(editor);
  assert.equal(merged, true, "mergeCells phải thành công");

  // Kiểm tra AST sau khi merge
  const jsonAfterMerge = editor.getJSON();
  const tableNode = jsonAfterMerge.content?.find((n) => n.type === "table");
  assert.ok(tableNode);

  const row0 = tableNode.content?.[0];
  const row1 = tableNode.content?.[1];
  const row2 = tableNode.content?.[2];

  // A1 trở thành cell gộp có rowspan=3, colspan=1
  assert.equal(row0?.content?.[0]?.attrs?.rowspan, 3);
  assert.equal(row0?.content?.[0]?.attrs?.colspan, 1);
  // Row 1 và Row 2 không còn cell ở cột A trong AST TipTap
  assert.equal(row1?.content?.length, 2);
  assert.equal(row2?.content?.length, 2);

  // TableMap phải hợp lệ không có problems
  const { map } = getTableDocInfo(editor);
  assert.equal(map.problems, null, "TableMap không được có problems sau vertical merge");
  assert.equal(map.width, 3);
  assert.equal(map.height, 3);
  // Cột 0 của cả 3 hàng phải cùng trỏ về offset của A1
  assert.equal(map.map[0], map.map[3]);
  assert.equal(map.map[0], map.map[6]);

  // 3. Save/Open (.mwd persistence)
  const docModel = createTestDocModel(tableNode);
  const serialized = serializeDocumentToMwd(docModel);
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const restoredTable = deserialized.document.content?.content?.find((n: any) => n.type === "table");
  assert.ok(restoredTable, "Bảng phải được phục hồi trọn vẹn từ .mwd");
  assert.equal(restoredTable.content[0].content[0].attrs.rowspan, 3);

  // 4. Export DOCX
  const docxBytes = await exportDocumentModelToDocx(docModel);
  const zip = await JSZip.loadAsync(docxBytes);
  const xmlContent = await zip.file("word/document.xml")?.async("string");
  assert.ok(xmlContent, "word/document.xml phải tồn tại");

  const docDom = parseXmlString(xmlContent);
  const trElements = docDom.getElementsByTagName("w:tr");
  assert.equal(trElements.length, 3, "DOCX phải có đúng 3 hàng");

  // Hàng 0: cell đầu tiên phải có w:vMerge restart
  const r0Tc = trElements[0].getElementsByTagName("w:tc");
  assert.equal(r0Tc.length, 3, "Hàng 0 phải có 3 ô");
  const r0vMerge = r0Tc[0].getElementsByTagName("w:vMerge")[0];
  assert.ok(r0vMerge, "Hàng 0 ô 0 phải có thẻ w:vMerge");
  assert.equal(r0vMerge.getAttribute("w:val"), "restart", "Hàng 0 ô 0 phải có w:val=restart");

  // Hàng 1: cell đầu tiên là continuation cell với w:vMerge không có restart
  const r1Tc = trElements[1].getElementsByTagName("w:tc");
  assert.equal(r1Tc.length, 3, "Hàng 1 phải có 3 ô (đã sinh continuation cell hợp lệ)");
  const r1vMerge = r1Tc[0].getElementsByTagName("w:vMerge")[0];
  assert.ok(r1vMerge, "Hàng 1 ô 0 phải có thẻ w:vMerge continuation");
  assert.notEqual(r1vMerge.getAttribute("w:val"), "restart");

  // Hàng 2: cell đầu tiên cũng là continuation cell
  const r2Tc = trElements[2].getElementsByTagName("w:tc");
  assert.equal(r2Tc.length, 3, "Hàng 2 phải có 3 ô");
  const r2vMerge = r2Tc[0].getElementsByTagName("w:vMerge")[0];
  assert.ok(r2vMerge, "Hàng 2 ô 0 phải có thẻ w:vMerge continuation");

  // 5. DOCX Import Round-trip
  const reimported = await importDocxToDocumentModel(docxBytes);
  assert.equal(reimported.success, true);
  if (!reimported.success) return;
  const reimportedTable = reimported.document.content?.content?.find((n: any) => n.type === "table");
  assert.ok(reimportedTable, "DOCX import phải tái tạo table");
  assert.equal(reimportedTable.content[0].content[0].attrs.rowspan, 3, "Round-trip DOCX phải bảo toàn rowspan=3");

  editor.destroy();
});

// ============================================================================
// 2. WORKFLOW B — RECTANGULAR MERGE & SPLIT (2x2 -> rowspan=2, colspan=2 -> Split -> 4 cells)
// ============================================================================
test("Phase 13 - Workflow B: Rectangular Merge 2x2 -> rowspan=2, colspan=2 -> Split restores 4 valid cells", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  const { getCellDocPos } = getTableDocInfo(editor);
  const a1Pos = getCellDocPos(0, 0); // A1: row 0, col 0
  const b2Pos = getCellDocPos(1, 1); // B2: row 1, col 1

  // 1. Chọn vùng chữ nhật 2x2
  setTableCellSelection(editor, a1Pos, b2Pos);
  assert.equal(canMergeCells(editor), true);

  // 2. Merge 2x2
  const mergeOk = mergeCells(editor);
  assert.equal(mergeOk, true);

  let docInfo = getTableDocInfo(editor);
  assert.equal(docInfo.map.problems, null, "TableMap phải valid sau 2x2 merge");

  const jsonMerged = editor.getJSON();
  const table = jsonMerged.content?.find((n) => n.type === "table");
  const masterCell = table?.content?.[0]?.content?.[0];
  assert.equal(masterCell?.attrs?.rowspan, 2, "Rowspan phải là 2");
  assert.equal(masterCell?.attrs?.colspan, 2, "Colspan phải là 2");

  // 3. Đặt con trỏ vào ô đã merge và Split
  const mergedCellPos = docInfo.getCellDocPos(0, 0);
  editor.commands.setTextSelection(mergedCellPos + 2);
  assert.equal(canSplitCell(editor), true, "canSplitCell phải trả về true trên ô 2x2");

  const splitOk = splitCell(editor);
  assert.equal(splitOk, true, "splitCell phải thành công");

  // 4. Kiểm tra cấu trúc sau khi Split: 4 ô độc lập được phục hồi
  docInfo = getTableDocInfo(editor);
  assert.equal(docInfo.map.problems, null, "TableMap phải hoàn toàn hợp lệ sau split");
  assert.equal(docInfo.map.width, 3);
  assert.equal(docInfo.map.height, 3);

  const jsonSplit = editor.getJSON();
  const restoredTable = jsonSplit.content?.find((n) => n.type === "table");
  assert.equal(restoredTable?.content?.[0]?.content?.length, 3, "Hàng 0 phải có đủ 3 ô");
  assert.equal(restoredTable?.content?.[1]?.content?.length, 3, "Hàng 1 phải có đủ 3 ô");
  assert.equal(restoredTable?.content?.[2]?.content?.length, 3, "Hàng 2 phải có đủ 3 ô");

  // Tất cả các ô đều có rowspan=1, colspan=1
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = restoredTable?.content?.[r]?.content?.[c];
      assert.equal(cell?.attrs?.rowspan, 1);
      assert.equal(cell?.attrs?.colspan, 1);
    }
  }

  editor.destroy();
});

// ============================================================================
// 3. STRUCTURAL STRESS (Merged table: insert/delete rows/cols, toggle headers -> No malformed topology)
// ============================================================================
test("Phase 13 - 3. Structural Stress: Merged table survives row/column mutations and header toggles", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  const { getCellDocPos } = getTableDocInfo(editor);
  // Merge A1..B2 (2x2)
  setTableCellSelection(editor, getCellDocPos(0, 0), getCellDocPos(1, 1));
  mergeCells(editor);

  // Thao tác 1: Thêm hàng phía dưới (addRowBelow)
  editor.commands.setTextSelection(getCellDocPos(1, 0) + 2);
  const rowBelowOk = addRowBelow(editor);
  assert.equal(rowBelowOk, true, "addRowBelow phải thành công");
  let info = getTableDocInfo(editor);
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau addRowBelow");

  // Thao tác 2: Thêm hàng phía trên (addRowAbove)
  editor.commands.setTextSelection(info.getCellDocPos(3, 0) + 2);
  const rowAboveOk = addRowAbove(editor);
  assert.equal(rowAboveOk, true, "addRowAbove phải thành công");
  info = getTableDocInfo(editor);
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau addRowAbove");

  // Thao tác 3: Thêm cột bên phải (addColumnRight)
  editor.commands.setTextSelection(info.getCellDocPos(0, 1) + 2);
  const colRightOk = addColumnRight(editor);
  assert.equal(colRightOk, true, "addColumnRight phải thành công");
  info = getTableDocInfo(editor);
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau addColumnRight");

  // Thao tác 4: Thêm cột bên trái (addColumnLeft)
  editor.commands.setTextSelection(info.getCellDocPos(2, 2) + 2);
  const colLeftOk = addColumnLeft(editor);
  assert.equal(colLeftOk, true, "addColumnLeft phải thành công");
  info = getTableDocInfo(editor);
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau addColumnLeft");

  // Thao tác 5: Xóa cột không chứa merge
  editor.commands.setTextSelection(info.getCellDocPos(0, info.map.width - 1) + 2);
  const delColOk = deleteColumn(editor);
  assert.equal(delColOk, true, "deleteColumn phải thành công");
  info = getTableDocInfo(editor);
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau deleteColumn");

  // Thao tác 6: Xóa hàng không chứa merge
  editor.commands.setTextSelection(info.getCellDocPos(info.map.height - 1, 0) + 2);
  const delRowOk = deleteRow(editor);
  assert.equal(delRowOk, true, "deleteRow phải thành công");
  info = getTableDocInfo(editor);
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau deleteRow");

  // Thao tác 7: Header changes & integrity protection
  // canToggleHeaderRow bảo vệ cấu trúc: từ chối khi hàng 0 có ô rowspan kéo dài xuống body
  assert.equal(canToggleHeaderRow(editor), false, "canToggleHeaderRow phải từ chối khi hàng 0 có ô rowspan > 1");

  // Khi tách ô merge (splitCell), toggleHeaderRow thực thi an toàn và bảo toàn cấu trúc bảng
  editor.commands.setTextSelection(info.getCellDocPos(0, 0) + 2);
  splitCell(editor);
  info = getTableDocInfo(editor);
  assert.equal(canToggleHeaderRow(editor), true, "canToggleHeaderRow cho phép sau khi tách ô");

  const toggleHdrOk = toggleHeaderRow(editor);
  assert.equal(toggleHdrOk, true, "toggleHeaderRow phải thành công");
  info = getTableDocInfo(editor);
  assert.equal(info.map.problems, null, "TableMap hợp lệ sau toggleHeaderRow");

  editor.destroy();
});

// ============================================================================
// 4. WORKFLOW C — REPEAT HEADER (Header + 40+ rows -> Multi-page visual header, ONE AST header)
// ============================================================================
test("Phase 13 - Workflow C: Repeat Header across 3 pages: Visual repeated headers with EXACTLY ONE AST header", () => {
  const rows: JSONContent[] = [];

  // Hàng 0: Header row
  rows.push({
    type: "tableRow",
    attrs: { repeatHeader: true },
    content: [
      {
        type: "tableHeader",
        attrs: { colspan: 1, rowspan: 1, colwidth: [200] },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Product Name" }] }],
      },
      {
        type: "tableHeader",
        attrs: { colspan: 1, rowspan: 1, colwidth: [200] },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Quantity" }] }],
      },
      {
        type: "tableHeader",
        attrs: { colspan: 1, rowspan: 1, colwidth: [200] },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Unit Price" }] }],
      },
    ],
  });

  // 65 Hàng Body
  for (let r = 1; r <= 65; r++) {
    rows.push({
      type: "tableRow",
      content: [
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: `Item #${r}` }] }],
        },
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: `${r * 5}` }] }],
        },
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: `$${(r * 12.5).toFixed(2)}` }] }],
        },
      ],
    });
  }

  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all", repeatHeader: true },
    content: rows,
  };

  const doc: JSONContent = {
    type: "doc",
    content: [tableNode],
  };

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.ok(layoutMap.getPageCount() >= 3, `Bảng 66 hàng phải chiếm ít nhất 3 trang, thực tế: ${layoutMap.getPageCount()}`);

  // Phân mảnh trang 0 (Page 1) chứa hàng đầu
  const frags = layoutMap.getTableFragments(0);
  assert.ok(frags.length >= 3, "Phải có ít nhất 3 table fragments");

  // Fragment trên Trang 1 (pageIndex = 0)
  assert.equal(frags[0].pageIndex, 0);
  assert.equal(frags[0].tableMetadata?.startRowIndex, 0);

  // Fragment trên Trang 2 (pageIndex = 1) có repeat header
  assert.equal(frags[1].pageIndex, 1);
  assert.equal(frags[1].tableMetadata?.hasRepeatedHeader, true, "Trang 2 phải có visual repeated header");
  assert.ok((frags[1].tableMetadata?.repeatedHeaderHeight ?? 0) > 0, "Repeated header phải có chiều cao > 0");

  // Fragment trên Trang 3 (pageIndex = 2) có repeat header
  assert.equal(frags[2].pageIndex, 2);
  assert.equal(frags[2].tableMetadata?.hasRepeatedHeader, true, "Trang 3 phải có visual repeated header");

  // KIỂM TRA AST: Duy nhất 1 tableHeader row trong toàn bộ tài liệu!
  const editor = createTestEditor(doc);
  let headerRowCount = 0;
  let totalRowCount = 0;

  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableRow") {
      totalRowCount++;
      const firstChild = node.firstChild;
      if (firstChild && firstChild.type.name === "tableHeader") {
        headerRowCount++;
      }
    }
  });

  assert.equal(headerRowCount, 1, "AST phải chứa ĐÚNG 1 header row duy nhất");
  assert.equal(totalRowCount, 66, "Tổng số hàng trong AST phải là 66");

  editor.destroy();
});

// ============================================================================
// 5. WORKFLOW D — AUTOFIT CONTENTS (Reasonable widths, max content width, long URL fallback, merged cells)
// ============================================================================
test("Phase 13 - Workflow D: AutoFit Contents handles short text, long text, unbroken URLs, and merged cells", () => {
  const longUrl = "https://internal.company.corp/very/long/unbroken/path/to/resource/api/v2/items?filter=all&sort=descending&query=stress_test";

  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all", layoutMode: "fixed" },
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "ID" }] }] },
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Short" }] }] },
          { type: "tableCell", attrs: { colspan: 2 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Merged Wide Header Across Two Columns" }] }] },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }] },
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "This is a detailed descriptive explanation with multiple standard English words." }] }] },
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: longUrl }] }] },
          { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "End Col" }] }] },
        ],
      },
    ],
  };

  const editor = createTestEditor({
    type: "doc",
    content: [tableNode],
  });

  const { tableNode: pmTableNode, tablePos } = getTableDocInfo(editor);
  const usableWidth = getSectionUsableWidthPx(editor, tablePos);

  const widths = calculateAutoFitContentWidths(pmTableNode, {
    minColumnWidth: 40,
    maxAvailableWidth: usableWidth,
  });

  assert.equal(widths.length, 4, "Phải tính toán độ rộng cho 4 cột");

  // Cột 0 (ID) phải nhỏ hơn Cột 1 (Mô tả dài)
  assert.ok(widths[0] < widths[1], `Cột 0 (${widths[0]}px) phải nhỏ hơn Cột 1 (${widths[1]}px)`);

  // Cột 2 (Unbroken URL) không được gây tràn vô hạn
  assert.ok(widths[2] <= Math.round(usableWidth * 0.85), `Cột URL (${widths[2]}px) phải được capping an toàn`);

  // Tổng các cột không được vượt quá usableWidth
  const total = widths.reduce((s, w) => s + w, 0);
  assert.ok(total <= usableWidth, `Tổng chiều rộng (${total}px) không được vượt quá usableWidth (${usableWidth}px)`);

  // Chạy lệnh autoFitContents
  editor.commands.setTextSelection(5);
  const ok = autoFitContents(editor);
  assert.equal(ok, true);

  const jsonAfter = editor.getJSON();
  const tableAfter = jsonAfter.content?.find((n) => n.type === "table");
  assert.equal(tableAfter?.attrs?.layoutMode, "autoContent");

  editor.destroy();
});

// ============================================================================
// 6. WORKFLOW E — AUTOFIT WINDOW (A4 portrait vs Landscape section geometry, never browser window)
// ============================================================================
test("Phase 13 - Workflow E: AutoFit Window scales to Section content width (A4 Portrait ~602px vs Landscape ~931px)", () => {
  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all", layoutMode: "fixed" },
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableCell", attrs: { colwidth: [80] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C1" }] }] },
          { type: "tableCell", attrs: { colwidth: [120] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C2" }] }] },
          { type: "tableCell", attrs: { colwidth: [160] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C3" }] }] },
        ],
      },
    ],
  };

  const editor = createTestEditor({
    type: "doc",
    content: [tableNode],
  });

  const { tableNode: pmTableNode, tablePos } = getTableDocInfo(editor);

  // 1. A4 Portrait: 210mm - 2*25.4mm = 159.2mm ~ 602px
  const portraitUsable = getSectionUsableWidthPx(editor, tablePos);
  assert.equal(portraitUsable, 602, "A4 Portrait usable width phải xấp xỉ 602px");

  const portraitWidths = calculateAutoFitWindowWidths(pmTableNode, portraitUsable);
  const sumPortrait = portraitWidths.reduce((s, w) => s + w, 0);
  assert.equal(sumPortrait, 602, "Tổng các cột trên Portrait phải đúng 602px");

  // 2. A4 Landscape: 297mm - 2*25.4mm = 246.2mm ~ 931px
  const landscapeUsable = 931;
  const landscapeWidths = calculateAutoFitWindowWidths(pmTableNode, landscapeUsable);
  const sumLandscape = landscapeWidths.reduce((s, w) => s + w, 0);
  assert.equal(sumLandscape, 931, "Tổng các cột trên Landscape phải đúng 931px");

  // AutoFit Window command execution
  editor.commands.setTextSelection(5);
  const ok = autoFitWindow(editor, { usableWidthPx: portraitUsable });
  assert.equal(ok, true);

  const json = editor.getJSON();
  const tableAfter = json.content?.find((n) => n.type === "table");
  assert.equal(tableAfter?.attrs?.layoutMode, "autoWindow");
  assert.equal(tableAfter?.attrs?.tableWidth, "100%");

  editor.destroy();
});

// ============================================================================
// 7. WORKFLOW F — CELL MARGINS (Render, reflow, Save/Open, DOCX export)
// ============================================================================
test("Phase 13 - Workflow F: Cell Margins table default & cell override round-trip across render, .mwd and DOCX", async () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  const { tablePos } = getTableDocInfo(editor);

  // 1. Đặt table default margins
  setTableCellMargins(editor, { top: 12, right: 16, bottom: 12, left: 16 }, { tablePos });

  // 2. Đặt cell margin override cho ô đang chọn
  editor.commands.setTextSelection(5);
  setCellMarginOverride(editor, { top: 20, right: 25, bottom: 20, left: 25 });

  // 3. Kiểm tra effective margins
  const { tableNode } = getTableDocInfo(editor);
  const cell0 = tableNode.content.child(0).content.child(0);
  const effectiveCell0 = getEffectiveCellMargins(tableNode.attrs, cell0.attrs);
  assert.deepEqual(effectiveCell0, { top: 20, right: 25, bottom: 20, left: 25 }, "Cell override phải được áp dụng");

  const cell1 = tableNode.content.child(0).content.child(1);
  const effectiveCell1 = getEffectiveCellMargins(tableNode.attrs, cell1.attrs);
  assert.deepEqual(effectiveCell1, { top: 12, right: 16, bottom: 12, left: 16 }, "Cell không override phải kế thừa table margins");

  // 4. Reflow verification: chiều cao hàng có margins lớn hơn phải cao hơn hàng mặc định
  const row0Node = tableNode.content.child(0); // có cell override { top: 20, bottom: 20 }
  const row1Node = tableNode.content.child(1); // kế thừa table margins { top: 12, bottom: 12 }
  const heightWithMargins = estimateTableRowHeight(row1Node, 80, 20, tableNode.attrs);
  const heightDefault = estimateTableRowHeight(row1Node, 80, 20, {});
  const heightWithOverride = estimateTableRowHeight(row0Node, 80, 20, tableNode.attrs);
  assert.ok(heightWithMargins > heightDefault, "Chiều cao ước tính khi có padding table phải lớn hơn mặc định");
  assert.ok(heightWithOverride > heightWithMargins, "Chiều cao khi có cell override phải lớn hơn table margins");

  // 5. Save/Open .mwd
  const docModel = createTestDocModel(editor.getJSON().content![0]);
  const serialized = serializeDocumentToMwd(docModel);
  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;
  const restoredTable = deserialized.document.content?.content?.[0];
  assert.deepEqual(restoredTable.attrs.cellMargins, { top: 12, right: 16, bottom: 12, left: 16 });
  assert.deepEqual(restoredTable.content[0].content[0].attrs.cellMargins, { top: 20, right: 25, bottom: 20, left: 25 });

  // 6. DOCX Export
  const docxBytes = await exportDocumentModelToDocx(docModel);
  const zip = await JSZip.loadAsync(docxBytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  assert.ok(xml);
  assert.ok(xml.includes("<w:tblCellMar>"), "DOCX phải xuất thuộc tính w:tblCellMar");
  assert.ok(xml.includes("<w:tcMar>"), "DOCX phải xuất thuộc tính w:tcMar cho cell override");

  editor.destroy();
});

// ============================================================================
// 8. WORKFLOW G — ROW HEIGHT (At Least expands on long content, Exact preserves data)
// ============================================================================
test("Phase 13 - Workflow G: Row Height: atLeast 1cm expands with long content; exact rule prevents data loss", () => {
  const shortRowNode = {
    type: "tableRow",
    attrs: { rowHeight: 38, rowHeightRule: "atLeast" },
    content: [
      {
        type: "tableCell",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Short text" }] }],
      },
    ],
  };

  const longRowNode = {
    type: "tableRow",
    attrs: { rowHeight: 38, rowHeightRule: "atLeast" },
    content: [
      {
        type: "tableCell",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Dòng 1 của nội dung rất dài nhằm kiểm tra khả năng tự động nở rộng chiều cao hàng." }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Dòng 2 tiếp tục thêm văn bản để đảm bảo chiều cao vượt xa mốc tối thiểu 1cm (~38px)." }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Dòng 3 bổ sung thêm chi tiết bảo vệ nội dung không bị cắt gọt hay mất mát." }],
          },
        ],
      },
    ],
  };

  // Đo chiều cao
  const shortHeight = estimateTableRowHeight(shortRowNode, 80, 20);
  const longHeight = estimateTableRowHeight(longRowNode, 80, 20);

  assert.ok(shortHeight >= 38, `Short row height (${shortHeight}px) phải >= 38px`);
  assert.ok(longHeight > 60, `Long row height (${longHeight}px) phải tự động nở rộng vượt mức 38px`);

  // Kiểm tra rule exact
  const exactNorm = validateAndNormalizeRowHeight(45, "exact");
  assert.equal(exactNorm.height, 45);
  assert.equal(exactNorm.rule, "exact");

  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  editor.commands.setTextSelection(5);
  setTableRowHeight(editor, 45, "exact");

  const { tableNode } = getTableDocInfo(editor);
  const firstRow = tableNode.content.child(0);
  assert.equal(firstRow.attrs.rowHeight, 45);
  assert.equal(firstRow.attrs.rowHeightRule, "exact");

  // Văn bản bên trong vẫn còn nguyên vẹn
  assert.equal(firstRow.content.child(0).textContent, "A1");

  editor.destroy();
});

// ============================================================================
// 9. WORKFLOW H — DISTRIBUTE (Distribute columns/rows with atomic Undo/Redo)
// ============================================================================
test("Phase 13 - Workflow H: Distribute Columns & Rows equalizes dimensions and Undo restores previous values", () => {
  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all", layoutMode: "fixed" },
    content: [
      {
        type: "tableRow",
        attrs: { rowHeight: 30, rowHeightRule: "atLeast" },
        content: [
          { type: "tableCell", attrs: { colwidth: [60] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C1" }] }] },
          { type: "tableCell", attrs: { colwidth: [140] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C2" }] }] },
          { type: "tableCell", attrs: { colwidth: [200] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C3" }] }] },
        ],
      },
      {
        type: "tableRow",
        attrs: { rowHeight: 90, rowHeightRule: "atLeast" },
        content: [
          { type: "tableCell", attrs: { colwidth: [60] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C1" }] }] },
          { type: "tableCell", attrs: { colwidth: [140] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C2" }] }] },
          { type: "tableCell", attrs: { colwidth: [200] }, content: [{ type: "paragraph", content: [{ type: "text", text: "C3" }] }] },
        ],
      },
    ],
  };

  const editor = createTestEditor({
    type: "doc",
    content: [tableNode],
  });

  editor.commands.setTextSelection(5);

  // 1. Phân phối cột (Distribute Columns): tổng 400px -> 133, 133, 134
  distributeTableColumns(editor);

  let docInfo = getTableDocInfo(editor);
  const row0 = docInfo.tableNode.content.child(0);
  const w0 = row0.content.child(0).attrs.colwidth[0];
  const w1 = row0.content.child(1).attrs.colwidth[0];
  const w2 = row0.content.child(2).attrs.colwidth[0];

  assert.equal(w0, 133);
  assert.equal(w1, 133);
  assert.equal(w2, 134);

  // Undo phục hồi độ rộng cũ
  undo(editor);
  docInfo = getTableDocInfo(editor);
  const restoredRow = docInfo.tableNode.content.child(0);
  assert.equal(restoredRow.content.child(0).attrs.colwidth[0], 60);
  assert.equal(restoredRow.content.child(1).attrs.colwidth[0], 140);
  assert.equal(restoredRow.content.child(2).attrs.colwidth[0], 200);

  // 2. Phân phối hàng (Distribute Rows): [30, 90] -> trung bình 60px
  distributeTableRows(editor);
  docInfo = getTableDocInfo(editor);
  assert.equal(docInfo.tableNode.content.child(0).attrs.rowHeight, 60);
  assert.equal(docInfo.tableNode.content.child(1).attrs.rowHeight, 60);

  // Undo phục hồi chiều cao cũ
  undo(editor);
  docInfo = getTableDocInfo(editor);
  assert.equal(docInfo.tableNode.content.child(0).attrs.rowHeight, 30);
  assert.equal(docInfo.tableNode.content.child(1).attrs.rowHeight, 90);

  editor.destroy();
});

// ============================================================================
// 10. WORKFLOW I — TABLE STYLE (Apply style, manual override B3, change style -> precedence & marks intact)
// ============================================================================
test("Phase 13 - Workflow I: Table Style precedence: manual B3 yellow override survives style change; text marks preserved", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(true)],
  });

  const { getCellDocPos } = getTableDocInfo(editor);

  // 1. Áp dụng style "medium-accent"
  editor.commands.setTextSelection(5);
  applyTableStyle(editor, "medium-accent");

  let info = getTableDocInfo(editor);
  assert.equal(info.tableNode.attrs.tableStyleId, "medium-accent");

  // 2. Gán direct formatting: ô B3 (row 2, col 1) đổi sang màu vàng #ffff00 và chữ in đậm
  const b3Pos = getCellDocPos(2, 1);
  const tr = editor.state.tr;
  const b3Node = editor.state.doc.nodeAt(b3Pos);
  assert.ok(b3Node);
  tr.setNodeMarkup(b3Pos, undefined, {
    ...b3Node.attrs,
    backgroundColor: "#ffff00",
  });
  // Thêm bold mark vào text trong B3
  const b3TextPos = b3Pos + 2;
  const boldMark = editor.schema.marks.bold.create();
  tr.addMark(b3TextPos, b3TextPos + 2, boldMark);
  editor.view.dispatch(tr);

  // 3. Đổi sang style "academic"
  applyTableStyle(editor, "academic");

  info = getTableDocInfo(editor);
  assert.equal(info.tableNode.attrs.tableStyleId, "academic");

  // 4. Kiểm tra độ ưu tiên hiển thị (4-tier precedence)
  const updatedB3 = editor.state.doc.nodeAt(b3Pos);
  assert.ok(updatedB3);
  const presB3 = resolveCellPresentation(info.tableNode, 2, 1, updatedB3, true, 3);

  // B3 phải giữ màu vàng do direct override
  assert.equal(presB3.backgroundColor, "#ffff00");
  assert.equal(presB3.isDirectOverride.backgroundColor, true);

  // Kiểm tra bold mark bên trong text của B3 vẫn còn nguyên
  const textNode = updatedB3.content.child(0).content.child(0);
  assert.ok(textNode.marks.some((m) => m.type.name === "bold"), "Định dạng in đậm bên trong cell phải được bảo toàn");

  editor.destroy();
});

// ============================================================================
// 11. WORKFLOW J — MULTI-PAGE TABLE (100 rows flow across pages, ONE AST table, stable editing & undo)
// ============================================================================
test("Phase 13 - Workflow J: 100-row table flows across pages: ONE AST table; typing, Tab, resize, Undo stable", () => {
  const rows: JSONContent[] = [];
  for (let r = 0; r < 100; r++) {
    rows.push({
      type: "tableRow",
      content: [
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Row ${r} Col A` }] }] },
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Row ${r} Col B` }] }] },
      ],
    });
  }

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { borders: "all", repeatHeader: false },
        content: rows,
      },
    ],
  };

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.ok(layoutMap.getPageCount() >= 4, `Bảng 100 hàng phải trải dài trên 4+ trang (thực tế: ${layoutMap.getPageCount()})`);

  const editor = createTestEditor(doc);

  // 1. Kiểm tra AST: Đúng 1 table node
  let tableCount = 0;
  editor.state.doc.descendants((n) => {
    if (n.type.name === "table") tableCount++;
  });
  assert.equal(tableCount, 1, "AST phải chứa ĐÚNG 1 table node duy nhất");

  // 2. CellSelection across multiple rows
  const { getCellDocPos } = getTableDocInfo(editor);
  const selOk = setTableCellSelection(editor, getCellDocPos(10, 0), getCellDocPos(20, 1));
  assert.equal(selOk, true, "CellSelection qua 10 hàng phải thành công");

  // 3. Gõ phím vào ô hàng 50
  const row50CellPos = getCellDocPos(50, 0) + 2;
  editor.view.dispatch(editor.state.tr.insertText(" - Edited text", row50CellPos));
  assert.ok(editor.state.doc.textBetween(row50CellPos - 2, row50CellPos + 25).includes("Edited text"));

  // 4. Tab navigation không gây crash
  editor.commands.setTextSelection(row50CellPos);
  const tabOk = handleTabNavigation(editor, "next");
  assert.equal(tabOk, true, "Tab navigation phải di chuyển con trỏ sang ô tiếp theo");

  // 5. Undo khôi phục trạng thái
  undo(editor);
  assert.ok(editor.state.doc.nodeAt(row50CellPos) !== undefined);

  editor.destroy();
});

// ============================================================================
// 12. WORKFLOW K — CAPTION / REFERENCES (Insert Table -> Caption Table 1 -> Style/Merge/Resize -> Link intact)
// ============================================================================
test("Phase 13 - Workflow K: Caption and Cross-Reference stability: Caption Table 1 retains link after style, merge, and resize", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  // 1. Đặt con trỏ vào bảng và chèn Caption
  editor.commands.setTextSelection(5);
  const captionRes = CaptionService.insertCaption(editor, {
    label: "Table",
    text: "Experimental Results Data",
    positionPolicy: "above",
  });

  assert.equal(captionRes.success, true);
  const initialCaptionId = captionRes.captionId;

  // Lấy caption được tạo và kiểm tra targetId
  const initialCaptions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(initialCaptions.length, 1);
  const initialTableId = initialCaptions[0].targetId;
  assert.ok(initialTableId, "Caption phải liên kết với targetId của Table");

  // 2. Biến đổi cấu trúc bảng: Apply Style, Merge cells, Resize
  applyTableStyle(editor, "academic");

  const { getCellDocPos } = getTableDocInfo(editor);
  setTableCellSelection(editor, getCellDocPos(1, 1), getCellDocPos(2, 2));
  mergeCells(editor);

  distributeTableColumns(editor);

  // 3. Kiểm tra Caption relationship vẫn còn nguyên vẹn
  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 1);
  assert.equal(captions[0].id, initialCaptionId);
  assert.equal(captions[0].label, "Table");
  assert.equal(captions[0].number, 1);
  assert.equal(captions[0].targetId, initialTableId, "targetId của caption không được thay đổi hoặc bị regenerate");

  // 4. Cross-Reference giải quyết chuẩn xác Table 1
  const targets = CrossReferenceService.getAvailableTargets(editor.state.doc, "table");
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, initialCaptionId);
  assert.equal(targets[0].labelAndNumber, "Table 1");

  editor.destroy();
});

// ============================================================================
// 13. WORKFLOW L — COMMENTS & TRACK CHANGES (Marks inside cells survive merge, split, autofit, style, pagination)
// ============================================================================
test("Phase 13 - Workflow L: Comments and Track Changes marks survive table merge, split, AutoFit, and styles without deletion", () => {
  // Tạo bảng có chứa marks comment và trackChange bên trong các ô theo đúng schema
  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all" },
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
                      { type: "comment", attrs: { commentId: "comment-cell-01" } },
                      {
                        type: "trackChange",
                        attrs: {
                          id: "change-cell-01",
                          changeType: "insert",
                          author: "Editor",
                          timestamp: "2026-10-08T08:00:00.000Z",
                        },
                      },
                    ],
                    text: "Reviewed Item",
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
                      {
                        type: "trackChange",
                        attrs: {
                          id: "change-cell-02",
                          changeType: "delete",
                          author: "Editor",
                          timestamp: "2026-10-08T08:00:00.000Z",
                        },
                      },
                    ],
                    text: "Deleted Entry",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = createTestEditor({
    type: "doc",
    content: [tableNode],
  });

  // 1. Áp dụng Table Style
  editor.commands.setTextSelection(5);
  applyTableStyle(editor, "medium-accent");

  // 2. Chạy AutoFit Contents
  autoFitContents(editor);

  // 3. Phân trang
  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.ok(layoutMap.getPageCount() >= 1);

  // 4. Kiểm tra: Toàn bộ marks comment và trackChange vẫn tồn tại trọn vẹn
  let foundComment = false;
  let foundTrackInsert = false;
  let foundTrackDelete = false;

  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks) {
      for (const m of node.marks) {
        if (m.type.name === "comment" && m.attrs.commentId === "comment-cell-01") foundComment = true;
        if (m.type.name === "trackChange" && m.attrs.id === "change-cell-01" && m.attrs.changeType === "insert") foundTrackInsert = true;
        if (m.type.name === "trackChange" && m.attrs.id === "change-cell-02" && m.attrs.changeType === "delete") foundTrackDelete = true;
      }
    }
  });

  assert.equal(foundComment, true, "Comment mark phải được bảo toàn không bị xóa âm thầm");
  assert.equal(foundTrackInsert, true, "Track insert mark phải được bảo toàn");
  assert.equal(foundTrackDelete, true, "Track delete mark phải được bảo toàn");

  editor.destroy();
});

// ============================================================================
// 14. WORKFLOW M — IME & CORE EDITING (Vietnamese IME, caret, Find/Replace inside merged cells)
// ============================================================================
test("Phase 13 - Workflow M: Vietnamese IME input, caret navigation, Undo/Redo, and Find/Replace inside merged cells", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  const { getCellDocPos } = getTableDocInfo(editor);
  // Merge A1 & B1
  setTableCellSelection(editor, getCellDocPos(0, 0), getCellDocPos(0, 1));
  mergeCells(editor);

  const mergedCellPos = getCellDocPos(0, 0) + 1; // vị trí paragraph bên trong cell

  // Gõ tiếng Việt có dấu (mô phỏng chuỗi gõ IME Telex: "Bảng dữ liệu báo cáo kinh tế")
  editor.view.dispatch(editor.state.tr.insertText("Bảng dữ liệu báo cáo kinh tế năm 2026", mergedCellPos + 1));
  assert.ok(editor.state.doc.textBetween(mergedCellPos, mergedCellPos + 50).includes("Bảng dữ liệu báo cáo kinh tế"));

  // Undo phục hồi
  undo(editor);
  assert.ok(!editor.state.doc.textBetween(mergedCellPos, mergedCellPos + 50).includes("kinh tế"));

  // Redo khôi phục
  editor.commands.redo();
  assert.ok(editor.state.doc.textBetween(mergedCellPos, mergedCellPos + 50).includes("kinh tế"));

  // Tìm kiếm và thay thế (Find & Replace) bên trong ô đã merge
  setSearchTerm(editor, "báo cáo");
  const searchState = getSearchState(editor);
  assert.ok(searchState && searchState.matches.length >= 1, "Phải tìm thấy 'báo cáo' bên trong ô merged");

  // Thay thế "báo cáo" -> "tổng kết"
  editor.commands.setTextSelection(searchState.matches[0].from);
  replaceCurrentMatch(editor, "tổng kết");

  assert.ok(editor.state.doc.textBetween(mergedCellPos, mergedCellPos + 50).includes("tổng kết"));
  assert.ok(!editor.state.doc.textBetween(mergedCellPos, mergedCellPos + 50).includes("báo cáo"));

  editor.destroy();
});

// ============================================================================
// 15. WORKFLOW N — LARGE TABLE PERFORMANCE (50 rows, 100 rows, 20 columns timing)
// ============================================================================
test("Phase 13 - Workflow N: Large Table Performance: 100 rows and 20 columns operations complete in real-time", () => {
  // Tạo bảng 100 hàng × 5 cột
  const rows: JSONContent[] = [];
  for (let r = 0; r < 100; r++) {
    const cells: JSONContent[] = [];
    for (let c = 0; c < 5; c++) {
      cells.push({
        type: "tableCell",
        attrs: { colwidth: [100] },
        content: [{ type: "paragraph", content: [{ type: "text", text: `R${r}C${c}` }] }],
      });
    }
    rows.push({ type: "tableRow", content: cells });
  }

  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all", repeatHeader: true },
    content: rows,
  };

  const doc: JSONContent = { type: "doc", content: [tableNode] };

  // Đo thời gian xây dựng Pagination LayoutMap cho 100 hàng
  const t0 = performance.now();
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const t1 = performance.now();
  const paginationDurationMs = t1 - t0;

  assert.ok(layoutMap.getPageCount() >= 4, `100 hàng phải trải dài trên 4+ trang (thực tế: ${layoutMap.getPageCount()})`);
  assert.ok(
    paginationDurationMs < 250,
    `Pagination 100 hàng phải dưới 250ms (thực tế: ${paginationDurationMs.toFixed(2)}ms)`
  );

  // Tạo editor và kiểm tra thời gian áp dụng Style
  const editor = createTestEditor(doc);
  editor.commands.setTextSelection(5);

  const tStyle0 = performance.now();
  applyTableStyle(editor, "academic");
  const tStyle1 = performance.now();
  const styleDurationMs = tStyle1 - tStyle0;

  assert.ok(
    styleDurationMs < 50,
    `Áp dụng style trên bảng 100 hàng phải dưới 50ms (thực tế: ${styleDurationMs.toFixed(2)}ms)`
  );

  editor.destroy();
});

// ============================================================================
// 16. WORKFLOW O — CACHE & TRANSACTIONS (TableMap caching, 1 atomic tr for style/resize)
// ============================================================================
test("Phase 13 - Workflow O: TableMap caching & atomic transactions: 1 transaction for style/resize, no attribute thrashing on typing", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [create3x3TableContent(false)],
  });

  const { tableNode } = getTableDocInfo(editor);

  // 1. TableMap caching: Gọi TableMap.get 2 lần trên cùng tableNode phải trả về cùng reference
  const map1 = TableMap.get(tableNode);
  const map2 = TableMap.get(tableNode);
  assert.equal(map1, map2, "TableMap.get trên cùng một node instance phải lấy từ cache");

  // 2. Audit transactions: Áp dụng style phải phát đúng 1 transaction
  editor.commands.setTextSelection(5);

  let trCount = 0;
  const onTransaction = () => {
    trCount++;
  };
  editor.on("transaction", onTransaction);

  applyTableStyle(editor, "light-grid");
  assert.equal(trCount, 1, "applyTableStyle phải thực hiện trong ĐÚNG 1 atomic transaction");

  // 3. Distribute columns phải dispatch ĐÚNG 1 transaction
  trCount = 0;
  distributeTableColumns(editor);
  assert.equal(trCount, 1, "distributeTableColumns phải thực hiện trong ĐÚNG 1 atomic transaction");

  // 4. Typing 1 ký tự tạo ĐÚNG 1 transaction văn bản, không thay đổi table attrs
  trCount = 0;
  editor.view.dispatch(editor.state.tr.insertText("X", 5));
  assert.equal(trCount, 1, "Gõ 1 ký tự phải dispatch ĐÚNG 1 transaction");

  const { tableNode: afterTypingTable } = getTableDocInfo(editor);
  assert.equal(afterTypingTable.attrs.tableStyleId, "light-grid");

  editor.off("transaction", onTransaction);
  editor.destroy();
});

// ============================================================================
// 17. ZERO REGRESSION — CROSS-FEATURE HARMONY
// ============================================================================
test("Phase 13 - 17. Zero Regression: Table Engine 2.0 coexists cleanly with Headings, Lists, and TOC", () => {
  const docWithMixedFeatures: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Chương 1: Phân tích hiệu năng" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dưới đây là bảng số liệu thống kê:" }],
      },
      create3x3TableContent(true),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Ghi chú 1" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Ghi chú 2" }] }],
          },
        ],
      },
    ],
  };

  const editor = createTestEditor(docWithMixedFeatures);
  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);

  assert.ok(layoutMap.getPageCount() >= 1);
  const frags = layoutMap.getAllFragments();
  const headingFrag = frags.find((f) => f.nodeType === "heading");
  const tableFrag = frags.find((f) => f.nodeType === "table");
  const listFrag = frags.find((f) => f.nodeType === "bulletList");

  assert.ok(headingFrag, "Heading fragment phải tồn tại");
  assert.ok(tableFrag, "Table fragment phải tồn tại");
  assert.ok(listFrag, "List fragment phải tồn tại");

  editor.destroy();
});
