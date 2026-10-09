import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";
import type { JSONContent } from "@tiptap/core";

/**
 * Trợ giúp tạo DocumentModel cơ bản chứa bảng kiểm thử
 */
function createDocWithTable(tableNode: JSONContent, extraBlocks: JSONContent[] = []): DocumentModel {
  return {
    metadata: {
      id: "doc-table-phase12",
      title: "Kiểm thử DOCX Export Table Phase 12",
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
      content: [
        tableNode,
        ...extraBlocks,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn kết thúc tài liệu" }],
        },
      ],
    },
  };
}

function extractCellText(cell: JSONContent): string {
  if (!cell || !Array.isArray(cell.content)) return "";
  const texts: string[] = [];
  for (const block of cell.content) {
    if (Array.isArray(block.content)) {
      for (const inline of block.content) {
        if (inline.text) texts.push(inline.text);
      }
    }
  }
  return texts.join(" ");
}

// ============================================================================
// PHASE 12: DOCX TABLE EXPORT & ROUND-TRIP FIDELITY TEST SUITE
// ============================================================================

test("Phase 12 - 1. Vertical Merge Export: w:vMerge restart & continue with WordprocessingML grid compliance", async () => {
  // Table 3 rows x 2 cols. Col 0 có rowspan=3 (kéo dài qua hàng 1 và hàng 2).
  // Trong AST của TipTap/ProseMirror:
  // Hàng 0 có 2 ô: masterCell (rowspan=3) và R0C1
  // Hàng 1 có 1 ô: R1C1
  // Hàng 2 có 1 ô: R2C1
  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 3, colspan: 1, colwidth: [120] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Merged Col 0" }] }],
          },
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [200] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R0C1" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [200] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R1C1" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [200] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R2C1" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra OOXML document.xml:
  // 1. Phải có w:vMerge restart trên ô master
  assert.ok(
    docXml.includes('<w:vMerge w:val="restart"/>'),
    "Hàng 0 ô 0 phải xuất w:vMerge restart"
  );

  // 2. Phải có w:vMerge continue trên các ô continuation ở hàng 1 và 2
  const continueMatches = docXml.split('<w:vMerge w:val="continue"/>').length - 1;
  assert.equal(
    continueMatches,
    2,
    "Hàng 1 và Hàng 2 mỗi hàng phải có đúng 1 ô continuation với w:vMerge continue"
  );

  // 3. Tuân thủ grid: Không được bỏ continuation cells làm mất cân bằng cột của Word
  const parsedXml = parseXmlString(docXml);
  const trElements = parsedXml.getElementsByTagNameNS("*", "tr");
  assert.equal(trElements.length, 3, "Bảng phải có đủ 3 hàng");

  for (let i = 0; i < 3; i++) {
    const tcElements = trElements[i].getElementsByTagNameNS("*", "tc");
    assert.equal(
      tcElements.length,
      2,
      `Hàng ${i} phải có đủ 2 thẻ w:tc để tuân thủ cấu trúc grid của Word, không làm corrupt tài liệu`
    );
  }

  // 4. Round-trip: Nhập lại file vừa xuất và xác nhận cấu trúc nguyên vẹn
  const reImport = await importDocxToDocumentModel(bytes, "vmerge_roundtrip.docx");
  assert.equal(reImport.success, true);
  if (!reImport.success) return;

  const importedTable = reImport.document.content.content![0];
  assert.equal(importedTable.type, "table");
  assert.equal(importedTable.content!.length, 3);

  // Hàng 0 có master cell với rowspan=3
  const row0 = importedTable.content![0];
  assert.equal(row0.content![0].attrs?.rowspan, 3);
  assert.equal(extractCellText(row0.content![0]), "Merged Col 0");
  assert.equal(extractCellText(row0.content![1]), "R0C1");

  // Hàng 1 và 2 đã được chuẩn hóa gọn gàng (continuation cells đã được tiêu thụ)
  const row1 = importedTable.content![1];
  assert.equal(row1.content!.length, 1);
  assert.equal(extractCellText(row1.content![0]), "R1C1");

  const row2 = importedTable.content![2];
  assert.equal(row2.content!.length, 1);
  assert.equal(extractCellText(row2.content![0]), "R2C1");
});

test("Phase 12 - 2. Rectangular Mixed Merge Export: gridSpan + vMerge combination", async () => {
  // Ô 2x2: colspan=2 và rowspan=2 ở góc trên bên trái
  // Hàng 0: Ô 2x2 (col 0,1) + Ô R0C2 (col 2)
  // Hàng 1: Ô continuation 2-cột + Ô R1C2 (col 2)
  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 2, rowspan: 2, colwidth: [100, 100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "2x2 Merged Box" }] }],
          },
          {
            type: "tableCell",
            attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R0C2" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R1C2" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Hàng 0: gridSpan=2 + vMerge=restart
  assert.ok(
    docXml.includes('<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>') ||
      (docXml.includes('<w:gridSpan w:val="2"/>') && docXml.includes('<w:vMerge w:val="restart"/>')),
    "Hàng 0 phải có gridSpan 2 và vMerge restart"
  );

  // Hàng 1: ô continuation cũng phải có gridSpan=2 và vMerge=continue
  assert.ok(
    docXml.includes('<w:gridSpan w:val="2"/><w:vMerge w:val="continue"/>') ||
      (docXml.includes('<w:gridSpan w:val="2"/>') && docXml.includes('<w:vMerge w:val="continue"/>')),
    "Ô continuation ở hàng 1 phải giữ nguyên gridSpan 2 và vMerge continue"
  );

  // Round-trip test
  const reImport = await importDocxToDocumentModel(bytes, "mixed_merge_roundtrip.docx");
  assert.equal(reImport.success, true);
  if (!reImport.success) return;

  const importedTable = reImport.document.content.content![0];
  const row0 = importedTable.content![0];
  const boxCell = row0.content![0];
  assert.equal(boxCell.attrs?.colspan, 2);
  assert.equal(boxCell.attrs?.rowspan, 2);
  assert.equal(extractCellText(boxCell), "2x2 Merged Box");

  const row1 = importedTable.content![1];
  assert.equal(row1.content!.length, 1);
  assert.equal(extractCellText(row1.content![0]), "R1C2");
});

test("Phase 12 - 3. Repeat Header Export: w:tblHeader semantic vs non-repeated", async () => {
  // Case A: repeatHeader: true
  const tableWithHeader: JSONContent = {
    type: "table",
    attrs: { repeatHeader: true },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableHeader",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Header Col 1" }] }],
          },
          {
            type: "tableHeader",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Header Col 2" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Data Row 1" }] }],
          },
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Data Row 2" }] }],
          },
        ],
      },
    ],
  };

  const docA = createDocWithTable(tableWithHeader);
  const bytesA = await exportDocumentModelToDocx(docA);
  const zipA = await JSZip.loadAsync(bytesA);
  const docXmlA = await zipA.file("word/document.xml")!.async("string");

  assert.ok(docXmlA.includes("<w:tblHeader/>"), "repeatHeader=true phải xuất w:tblHeader");
  const parsedA = parseXmlString(docXmlA);
  const trsA = parsedA.getElementsByTagNameNS("*", "tr");
  assert.ok(trsA[0].getElementsByTagNameNS("*", "tblHeader").length > 0, "Chỉ hàng 0 có w:tblHeader");
  assert.equal(trsA[1].getElementsByTagNameNS("*", "tblHeader").length, 0, "Hàng dữ liệu không được có w:tblHeader");
  assert.equal(trsA.length, 2, "Tuyệt đối không export visual duplicate rows nhân bản");

  // Round-trip A:
  const reImportA = await importDocxToDocumentModel(bytesA, "header_true.docx");
  assert.equal(reImportA.document.content.content![0].attrs?.repeatHeader, true);

  // Case B: repeatHeader: false
  const tableWithoutHeader: JSONContent = {
    type: "table",
    attrs: { repeatHeader: false },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableHeader",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Normal Header" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Data" }] }],
          },
        ],
      },
    ],
  };

  const docB = createDocWithTable(tableWithoutHeader);
  const bytesB = await exportDocumentModelToDocx(docB);
  const zipB = await JSZip.loadAsync(bytesB);
  const docXmlB = await zipB.file("word/document.xml")!.async("string");

  assert.ok(!docXmlB.includes("<w:tblHeader/>"), "Khi repeatHeader=false, không được xuất w:tblHeader");

  // Round-trip B:
  const reImportB = await importDocxToDocumentModel(bytesB, "header_false.docx");
  assert.equal(reImportB.document.content.content![0].attrs?.repeatHeader, false);
});

test("Phase 12 - 4. Table Width & Layout: autoContent, autoWindow, fixed, and colwidth exact units", async () => {
  // Test A: AutoFit Contents (layoutMode="autoContent", tableWidth="auto")
  const tableAuto: JSONContent = {
    type: "table",
    attrs: { layoutMode: "autoContent", tableWidth: "auto" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Auto Content" }] }],
          },
        ],
      },
    ],
  };
  const docA = createDocWithTable(tableAuto);
  const bytesA = await exportDocumentModelToDocx(docA);
  const zipA = await JSZip.loadAsync(bytesA);
  const xmlA = await zipA.file("word/document.xml")!.async("string");
  assert.ok(xmlA.includes('w:type="auto"'), "autoContent phải xuất w:type=auto");
  assert.ok(xmlA.includes('w:type="autofit"'), "autoContent phải xuất w:tblLayout autofit");

  const reImportA = await importDocxToDocumentModel(bytesA, "auto_content.docx");
  assert.equal(reImportA.document.content.content![0].attrs?.layoutMode, "autoContent");
  assert.equal(reImportA.document.content.content![0].attrs?.tableWidth, "auto");

  // Test B: AutoFit Window (layoutMode="autoWindow", tableWidth="100%")
  const tableWindow: JSONContent = {
    type: "table",
    attrs: { layoutMode: "autoWindow", tableWidth: "100%" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Auto Window" }] }],
          },
        ],
      },
    ],
  };
  const docB = createDocWithTable(tableWindow);
  const bytesB = await exportDocumentModelToDocx(docB);
  const zipB = await JSZip.loadAsync(bytesB);
  const xmlB = await zipB.file("word/document.xml")!.async("string");
  assert.ok(xmlB.includes('w:w="5000" w:type="pct"'), "100% window width phải xuất 5000 pct units");

  const reImportB = await importDocxToDocumentModel(bytesB, "auto_window.docx");
  assert.equal(reImportB.document.content.content![0].attrs?.layoutMode, "autoWindow");
  assert.equal(reImportB.document.content.content![0].attrs?.tableWidth, "100%");

  // Test C: Fixed Layout with exact column widths (100px = 1500 twips, 200px = 3000 twips, tableWidth=300px = 4500 twips)
  const tableFixed: JSONContent = {
    type: "table",
    attrs: { layoutMode: "fixed", tableWidth: "300px" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colwidth: [100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Col 1" }] }],
          },
          {
            type: "tableCell",
            attrs: { colwidth: [200] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Col 2" }] }],
          },
        ],
      },
    ],
  };
  const docC = createDocWithTable(tableFixed);
  const bytesC = await exportDocumentModelToDocx(docC);
  const zipC = await JSZip.loadAsync(bytesC);
  const xmlC = await zipC.file("word/document.xml")!.async("string");
  assert.ok(xmlC.includes('w:w="4500" w:type="dxa"'), "300px fixed width -> 4500 twips (300*15)");
  assert.ok(xmlC.includes('<w:tblLayout w:type="fixed"/>'), "Fixed mode -> tblLayout fixed");
  assert.ok(xmlC.includes('<w:gridCol w:w="1500"/>'), "100px -> gridCol 1500 twips");
  assert.ok(xmlC.includes('<w:gridCol w:w="3000"/>'), "200px -> gridCol 3000 twips");
  assert.ok(xmlC.includes('w:tcW w:w="1500"'), "tcW ô 1 -> 1500 twips");
  assert.ok(xmlC.includes('w:tcW w:w="3000"'), "tcW ô 2 -> 3000 twips");

  const reImportC = await importDocxToDocumentModel(bytesC, "fixed_colwidths.docx");
  const impC = reImportC.document.content.content![0];
  assert.equal(impC.attrs?.layoutMode, "fixed");
  assert.equal(impC.attrs?.tableWidth, "300px");
  assert.deepEqual(impC.content![0].content![0].attrs?.colwidth, [100]);
  assert.deepEqual(impC.content![0].content![1].attrs?.colwidth, [200]);
});

test("Phase 12 - 5. Cell Margins Export: w:tblCellMar table defaults & w:tcMar cell overrides", async () => {
  // Table margins: top=8, bottom=8, left=12, right=12 (120 twips, 180 twips)
  // Cell override: top=4, bottom=4, left=6, right=6 (60 twips, 90 twips)
  const tableNode: JSONContent = {
    type: "table",
    attrs: {
      cellMargins: { top: 8, bottom: 8, left: 12, right: 12 },
    },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { cellMargins: null }, // Kế thừa mặc định
            content: [{ type: "paragraph", content: [{ type: "text", text: "Default margin cell" }] }],
          },
          {
            type: "tableCell",
            attrs: { cellMargins: { top: 4, bottom: 4, left: 6, right: 6 } }, // Ghi đè riêng
            content: [{ type: "paragraph", content: [{ type: "text", text: "Override margin cell" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");

  assert.ok(xml.includes("<w:tblCellMar>"), "Phải xuất w:tblCellMar trong tblPr");
  assert.ok(xml.includes('<w:top w:w="120" w:type="dxa"/>'), "8px top -> 120 twips");
  assert.ok(xml.includes('<w:left w:w="180" w:type="dxa"/>'), "12px left -> 180 twips");

  assert.ok(xml.includes("<w:tcMar>"), "Ô ghi đè phải có thẻ w:tcMar");
  assert.ok(xml.includes('<w:top w:w="60" w:type="dxa"/>'), "4px top override -> 60 twips");
  assert.ok(xml.includes('<w:left w:w="90" w:type="dxa"/>'), "6px left override -> 90 twips");

  // Round-trip test
  const reImport = await importDocxToDocumentModel(bytes, "margins_roundtrip.docx");
  const imp = reImport.document.content.content![0];
  assert.deepEqual(imp.attrs?.cellMargins, { top: 8, bottom: 8, left: 12, right: 12 });
  assert.equal(imp.content![0].content![0].attrs?.cellMargins, null);
  assert.deepEqual(imp.content![0].content![1].attrs?.cellMargins, { top: 4, bottom: 4, left: 6, right: 6 });
});

test("Phase 12 - 6. Row Height and Rules Export: w:trHeight exact & atLeast semantics", async () => {
  // Row 0: 48px exact (720 twips)
  // Row 1: 30px atLeast (450 twips)
  // Row 2: auto (null / auto)
  const tableNode: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        attrs: { rowHeight: 48, rowHeightRule: "exact" },
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Exact 48px" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        attrs: { rowHeight: 30, rowHeightRule: "atLeast" },
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "AtLeast 30px" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        attrs: { rowHeight: null, rowHeightRule: "auto" },
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Auto height" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");

  assert.ok(xml.includes('<w:trHeight w:val="720" w:hRule="exact"/>'), "48px exact -> 720 exact");
  assert.ok(xml.includes('<w:trHeight w:val="450" w:hRule="atLeast"/>'), "30px atLeast -> 450 atLeast");

  const parsed = parseXmlString(xml);
  const trs = parsed.getElementsByTagNameNS("*", "tr");
  assert.equal(trs[2].getElementsByTagNameNS("*", "trHeight").length, 0, "Hàng auto không xuất w:trHeight");

  // Round-trip test
  const reImport = await importDocxToDocumentModel(bytes, "row_heights_roundtrip.docx");
  const imp = reImport.document.content.content![0];
  assert.equal(imp.content![0].attrs?.rowHeight, 48);
  assert.equal(imp.content![0].attrs?.rowHeightRule, "exact");
  assert.equal(imp.content![1].attrs?.rowHeight, 30);
  assert.equal(imp.content![1].attrs?.rowHeightRule, "atLeast");
  assert.equal(imp.content![2].attrs?.rowHeight, null);
  assert.equal(imp.content![2].attrs?.rowHeightRule, "auto");
});

test("Phase 12 - 7. Table Styles & Shading Export: Built-ins mapping, fallback, and cell shading", async () => {
  // Built-in LightGrid
  const tableLightGrid: JSONContent = {
    type: "table",
    attrs: {
      tableStyleId: "light-grid",
      tableStyleOptions: { headerRow: true, bandedRows: true, firstColumn: true },
      borders: "all",
    },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { backgroundColor: "#FEF08A" }, // Tô vàng
            content: [{ type: "paragraph", content: [{ type: "text", text: "Yellow cell" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableLightGrid);
  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const stylesXml = await zip.file("word/styles.xml")!.async("string");

  // w:tblStyle
  assert.ok(docXml.includes('<w:tblStyle w:val="LightGridAccent1"/>'), "light-grid ánh xạ sang LightGridAccent1");
  assert.ok(docXml.includes('w:firstRow="1"'), "tblLook firstRow=1");
  assert.ok(docXml.includes('w:firstColumn="1"'), "tblLook firstColumn=1");
  assert.ok(docXml.includes('w:noHBand="0"'), "tblLook noHBand=0 (banded rows enabled)");
  assert.ok(docXml.includes('w:fill="FEF08A"'), "Cell shading xuất hex FEF08A");

  // styles.xml chứa định nghĩa table style
  assert.ok(stylesXml.includes('w:styleId="LightGridAccent1"'), "styles.xml phải có định nghĩa LightGridAccent1");

  // Round-trip test
  const reImport = await importDocxToDocumentModel(bytes, "styles_roundtrip.docx");
  const imp = reImport.document.content.content![0];
  assert.equal(imp.attrs?.tableStyleId, "light-grid");
  assert.equal(imp.attrs?.tableStyleOptions?.headerRow, true);
  assert.equal(imp.attrs?.tableStyleOptions?.firstColumn, true);
  assert.equal(imp.content![0].content![0].attrs?.backgroundColor, "#FEF08A");
});

test("Phase 12 - 8. Caption & Object Reference Stability: Table identity preserved without breaking cross-references", async () => {
  const tableId = "tbl_financial_data_2026";
  const bookmarkId = "ref_bm_inside_cell";

  const tableNode: JSONContent = {
    type: "table",
    attrs: {
      id: tableId,
      borders: "outside",
    },
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
                  { type: "text", text: "Báo cáo doanh thu " },
                  {
                    type: "bookmarkAnchor",
                    attrs: { id: bookmarkId, name: "FinancialBookmark" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const captionNode: JSONContent = {
    type: "caption",
    attrs: {
      id: "cap_fin_table",
      targetId: tableId,
      label: "Table",
      text: "Thống kê doanh thu quý 1",
    },
    content: [{ type: "text", text: "Table 1 — Thống kê doanh thu quý 1" }],
  };

  const doc = createDocWithTable(tableNode, [captionNode]);
  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");

  // 1. tblCaption lưu trữ ID bảng
  assert.ok(xml.includes(`w:val="${tableId}"`), "ID bảng được bảo tồn trong tblCaption");

  // 2. Bookmark anchor trong ô bảng được xuất hợp lệ
  assert.ok(xml.includes("<w:bookmarkStart"), "BookmarkStart được xuất trong ô bảng");
  assert.ok(xml.includes("<w:bookmarkEnd"), "BookmarkEnd được xuất trong ô bảng");

  // 3. Caption được xuất dưới dạng Style Caption của Word
  assert.ok(xml.includes('<w:pStyle w:val="Caption"/>'), "Caption được xuất với paragraph style Caption");
  assert.ok(xml.includes("Thống kê doanh thu"), "Nội dung caption được bảo tồn");

  // 4. Round-trip: Table ID và Caption được phục hồi chuẩn xác
  const reImport = await importDocxToDocumentModel(bytes, "caption_ref_stability.docx");
  assert.equal(reImport.success, true);
  if (!reImport.success) return;

  const impTable = reImport.document.content.content![0];
  assert.equal(impTable.attrs?.id, tableId, "Table ID phải được bảo toàn 100% qua round-trip");
});

test("Phase 12 - 9. Full Package Validity: Clean ZIP archive structure and XML validity without corruption", async () => {
  const tableNode: JSONContent = {
    type: "table",
    attrs: {
      borders: "all",
      repeatHeader: true,
      layoutMode: "fixed",
      tableWidth: "500px",
      cellMargins: { top: 6, bottom: 6, left: 10, right: 10 },
      tableStyleId: "academic",
    },
    content: [
      {
        type: "tableRow",
        attrs: { rowHeight: 40, rowHeightRule: "exact" },
        content: [
          {
            type: "tableHeader",
            attrs: { colspan: 2, rowspan: 1, colwidth: [250, 250] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Header" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        attrs: { rowHeight: 30, rowHeightRule: "atLeast" },
        content: [
          {
            type: "tableCell",
            attrs: { colwidth: [250] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Cell 1" }] }],
          },
          {
            type: "tableCell",
            attrs: { colwidth: [250] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Cell 2" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const bytes = await exportDocumentModelToDocx(doc);

  // Validate ZIP integrity
  const zip = await JSZip.loadAsync(bytes);
  const requiredParts = [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/styles.xml",
    "word/numbering.xml",
    "word/_rels/document.xml.rels",
  ];

  for (const part of requiredParts) {
    const file = zip.file(part);
    assert.ok(file, `Package DOCX thiếu thành phần bắt buộc: ${part}`);
    const text = await file.async("string");
    // Đảm bảo cú pháp XML hoàn toàn hợp lệ, không ném ngoại lệ
    assert.doesNotThrow(() => parseXmlString(text), `XML trong ${part} bị lỗi cú pháp`);
  }
});

test("Phase 12 - 10. Complete End-to-End Round-Trip: Word DOCX -> Import -> Edit in Editor -> Export -> Re-import", async () => {
  // 1. Giả lập nhập từ file Word
  const initialTableNode: JSONContent = {
    type: "table",
    attrs: {
      borders: "all",
      repeatHeader: true,
      layoutMode: "fixed",
      tableWidth: "400px",
      cellMargins: { top: 8, bottom: 8, left: 12, right: 12 },
      tableStyleId: "grid",
    },
    content: [
      {
        type: "tableRow",
        attrs: { rowHeight: 45, rowHeightRule: "exact" },
        content: [
          {
            type: "tableHeader",
            attrs: { colspan: 1, rowspan: 2, colwidth: [150], backgroundColor: "#E0E7FF" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Hạng mục gộp dọc" }] }],
          },
          {
            type: "tableHeader",
            attrs: { colspan: 1, rowspan: 1, colwidth: [250] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Chỉ số Q1" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        attrs: { rowHeight: 35, rowHeightRule: "atLeast" },
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 1, rowspan: 1, colwidth: [250] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Chỉ số Q2" }] }],
          },
        ],
      },
    ],
  };

  const doc1 = createDocWithTable(initialTableNode);
  const bytes1 = await exportDocumentModelToDocx(doc1);

  // 2. Editor mở tài liệu lần 1
  const import1 = await importDocxToDocumentModel(bytes1, "first_pass.docx");
  assert.equal(import1.success, true);
  const docModel2 = import1.document;

  // 3. Người dùng thao tác chỉnh sửa trong Editor (User edit):
  // - Sửa nội dung text ô
  // - Thay đổi màu nền của ô
  // - Thêm hàng mới
  const tableToEdit = docModel2.content.content![0];
  tableToEdit.attrs!.tableWidth = "450px";
  // Sửa chữ ô 1 hàng 1
  tableToEdit.content![1].content![0].content![0].content![0].text = "Chỉ số Q2 (Đã cập nhật sau kiểm toán)";
  tableToEdit.content![1].content![0].attrs!.backgroundColor = "#FEF9C3";

  // 4. Xuất tài liệu đã chỉnh sửa ra DOCX lần 2
  const bytes2 = await exportDocumentModelToDocx(docModel2);

  // 5. Mở lại DOCX lần 3 (Second re-import)
  const import2 = await importDocxToDocumentModel(bytes2, "second_pass.docx");
  assert.equal(import2.success, true);

  const finalTable = import2.document.content.content![0];
  assert.equal(finalTable.attrs?.tableWidth, "450px", "Độ rộng bảng đã sửa phải được giữ nguyên");
  assert.equal(finalTable.attrs?.repeatHeader, true);

  // Hàng 0 ô 0 vẫn là rowspan=2
  const finalMaster = finalTable.content![0].content![0];
  assert.equal(finalMaster.attrs?.rowspan, 2, "Rowspan=2 phải sống sót qua 2 vòng export-import");
  assert.equal(finalMaster.attrs?.backgroundColor, "#E0E7FF");

  // Hàng 1 ô 0 mang nội dung đã sửa và màu nền mới
  const finalEditedCell = finalTable.content![1].content![0];
  assert.equal(
    extractCellText(finalEditedCell),
    "Chỉ số Q2 (Đã cập nhật sau kiểm toán)",
    "Nội dung văn bản chỉnh sửa phải được bảo toàn tuyệt đối"
  );
  assert.equal(finalEditedCell.attrs?.backgroundColor, "#FEF9C3", "Màu nền chỉnh sửa phải được bảo toàn");
});
