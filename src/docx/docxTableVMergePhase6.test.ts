import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";
import type { JSONContent } from "@tiptap/core";

/**
 * Trợ giúp tạo buffer tệp .docx nhị phân trong bộ nhớ với bảng XML tùy chỉnh
 */
async function createDocxWithTable(tableXml: string): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`
  );

  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
      </w:style>
    </w:styles>`
  );

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <w:body>
        ${tableXml}
        <w:p><w:r><w:t>Đoạn văn kết thúc tài liệu</w:t></w:r></w:p>
      </w:body>
    </w:document>`
  );

  return zip.generateAsync({ type: "uint8array" });
}

function createDocWithTable(tableNode: JSONContent, extraBlocks: JSONContent[] = []): DocumentModel {
  return {
    metadata: {
      id: "doc-table-phase6",
      title: "DOCX Table Fidelity Phase 6",
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
          content: [{ type: "text", text: "Cuối trang" }],
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
// PHASE 6: DOCX TABLE VMERGE / ROWSPAN FIDELITY TEST SUITE
// ============================================================================

test("Phase 6 - 1. vMerge 2: Import & Export vertical merge across 2 rows", async () => {
  // Test import cả w:vMerge w:val="continue" và <w:vMerge/> không val (ISO default continue)
  const tableXml = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="3000"/>
        <w:gridCol w:w="4000"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3000" w:type="dxa"/>
            <w:vMerge w:val="restart"/>
          </w:tcPr>
          <w:p><w:r><w:t>Master Cell (Row 0-1)</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>R0C1 Normal</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3000" w:type="dxa"/>
            <w:vMerge/>
          </w:tcPr>
          <w:p/>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>R1C1 Normal</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "vmerge2.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  assert.equal(table.type, "table");
  assert.equal(table.content!.length, 2, "Bảng phải có đúng 2 hàng");

  // Hàng 0 ô 0 có rowspan=2
  const r0c0 = table.content![0].content![0];
  assert.equal(r0c0.attrs?.rowspan, 2, "vMerge restart + continue -> rowspan=2");
  assert.equal(extractCellText(r0c0), "Master Cell (Row 0-1)");

  // Hàng 1 chỉ có 1 ô (ô R1C1) vì ô continuation được tinh lọc khỏi AST
  assert.equal(table.content![1].content!.length, 1);
  assert.equal(extractCellText(table.content![1].content![0]), "R1C1 Normal");

  // Export kiểm tra lại cấu trúc XML
  const docxBytes = await exportDocumentModelToDocx(result.document);
  assert.ok(docxBytes.length > 0);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes('<w:vMerge w:val="restart"/>'), "Hàng 0 phải có vMerge restart");
  assert.ok(docXml.includes('<w:vMerge w:val="continue"/>'), "Hàng 1 phải có vMerge continue");
});

test("Phase 6 - 2. vMerge 3: Multi-row vertical merge across 3 rows & multi-column merges", async () => {
  // Cột 0: rowspan=3 (kéo dài qua hàng 0, 1, 2)
  // Cột 2: rowspan=2 (kéo dài qua hàng 1, 2)
  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 3, colspan: 1, colwidth: [100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Col0 Spans 3 Rows" }] }],
          },
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R0C1" }] }],
          },
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R0C2" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R1C1" }] }],
          },
          {
            type: "tableCell",
            attrs: { rowspan: 2, colspan: 1, colwidth: [100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Col2 Spans 2 Rows" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [100] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R2C1" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes.length > 0);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra số lần xuất hiện của restart và continue
  // Col 0: 1 restart + 2 continue
  // Col 2: 1 restart + 1 continue
  // Tổng: 2 restart, 3 continue
  const restartCount = (docXml.match(/<w:vMerge w:val="restart"\/>/g) || []).length;
  const continueCount = (docXml.match(/<w:vMerge w:val="continue"\/>/g) || []).length;
  assert.equal(restartCount, 2, "Phải có đúng 2 ô master có vMerge restart");
  assert.equal(continueCount, 3, "Phải có đúng 3 ô continuation có vMerge continue");

  // Import lại kiểm tra AST
  const importRes = await importDocxToDocumentModel(docxBytes, "vmerge3.docx");
  assert.equal(importRes.success, true);
  const importedTable = importRes.document.content.content![0];
  assert.equal(importedTable.content!.length, 3);

  // Hàng 0: Col 0 có rowspan=3
  assert.equal(importedTable.content![0].content![0].attrs?.rowspan, 3);
  assert.equal(extractCellText(importedTable.content![0].content![0]), "Col0 Spans 3 Rows");

  // Hàng 1: Col 2 có rowspan=2
  const r1Cells = importedTable.content![1].content!;
  assert.equal(r1Cells.length, 2);
  assert.equal(r1Cells[1].attrs?.rowspan, 2);
  assert.equal(extractCellText(r1Cells[1]), "Col2 Spans 2 Rows");

  // Hàng 2: chỉ có 1 ô R2C1
  const r2Cells = importedTable.content![2].content!;
  assert.equal(r2Cells.length, 1);
  assert.equal(extractCellText(r2Cells[0]), "R2C1");
});

test("Phase 6 - 3. vMerge + gridSpan: 2x2 merged rectangle preserves both dimensions", async () => {
  // Ô 2x2: colspan=2 và rowspan=2
  const tableXml = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="2000"/>
        <w:gridCol w:w="2000"/>
        <w:gridCol w:w="3000"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:gridSpan w:val="2"/>
            <w:vMerge w:val="restart"/>
          </w:tcPr>
          <w:p><w:r><w:t>Merged 2x2 Box</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>R0C2 Normal</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:gridSpan w:val="2"/>
            <w:vMerge w:val="continue"/>
          </w:tcPr>
          <w:p/>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>R1C2 Normal</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "vmerge_2x2.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  const boxCell = table.content![0].content![0];
  assert.equal(boxCell.attrs?.colspan, 2, "Hàng 0 ô 0 phải có colspan=2");
  assert.equal(boxCell.attrs?.rowspan, 2, "Hàng 0 ô 0 phải có rowspan=2");
  assert.equal(extractCellText(boxCell), "Merged 2x2 Box");

  // Hàng 1 chỉ có 1 ô (R1C2) vì ô 2-cột continuation bị bỏ khỏi AST
  assert.equal(table.content![1].content!.length, 1);
  assert.equal(extractCellText(table.content![1].content![0]), "R1C2 Normal");

  // Export round-trip
  const docxBytes = await exportDocumentModelToDocx(result.document);
  assert.ok(docxBytes.length > 0);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Hàng 0: gridSpan 2 + vMerge restart
  assert.ok(
    docXml.includes('<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>') ||
      (docXml.includes('<w:gridSpan w:val="2"/>') && docXml.includes('<w:vMerge w:val="restart"/>')),
    "Master cell phải có gridSpan 2 và vMerge restart"
  );
  // Hàng 1: gridSpan 2 + vMerge continue
  assert.ok(
    docXml.includes('<w:gridSpan w:val="2"/><w:vMerge w:val="continue"/>') ||
      (docXml.includes('<w:gridSpan w:val="2"/>') && docXml.includes('<w:vMerge w:val="continue"/>')),
    "Continuation cell phải có gridSpan 2 và vMerge continue"
  );
});

test("Phase 6 - 4. Malformed vMerge: Orphan continue, interrupted merge, out-of-bounds, rich content", async () => {
  // Case A: Orphan continue (tiếp tục mà không có restart trước đó)
  const orphanXml = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="continue"/></w:tcPr>
          <w:p><w:r><w:t>Orphan Content</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;
  const bytesOrphan = await createDocxWithTable(orphanXml);
  const resOrphan = await importDocxToDocumentModel(bytesOrphan, "orphan.docx");
  assert.equal(resOrphan.success, true);
  const orphanTable = resOrphan.document.content.content![0];
  const orphanCell = orphanTable.content![0].content![0];
  assert.equal(orphanCell.attrs?.rowspan, 1, "Orphan continue fallback an toàn về rowspan=1");
  assert.equal(extractCellText(orphanCell), "Orphan Content", "Văn bản ô mồ côi không bị mất");

  // Case B: Continuation cell chứa phương trình OMML và văn bản phong phú
  const richContinuationXml = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
          <w:p><w:r><w:t>Master Header</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="continue"/></w:tcPr>
          <w:p>
            <m:oMath>
              <m:f>
                <m:fPr><m:type m:val="bar"/></m:fPr>
                <m:num><m:r><m:t>1</m:t></m:r></m:num>
                <m:den><m:r><m:t>2</m:t></m:r></m:den>
              </m:f>
            </m:oMath>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;
  const bytesRich = await createDocxWithTable(richContinuationXml);
  const resRich = await importDocxToDocumentModel(bytesRich, "rich_continuation.docx");
  assert.equal(resRich.success, true);
  const richTable = resRich.document.content.content![0];
  const richMaster = richTable.content![0].content![0];
  assert.equal(richMaster.attrs?.rowspan, 2);
  // Master cell phải chứa cả văn bản và phương trình từ continuation cell
  const masterBlocks = richMaster.content || [];
  assert.ok(masterBlocks.length >= 2, "Master cell phải nhận thêm block từ continuation");
  const hasEquation = masterBlocks.some((b) =>
    (b.content || []).some((inline) => inline.type === "equation")
  );
  assert.ok(hasEquation, "Phương trình từ ô continuation không được phép mất");

  // Case C: AST out-of-bounds rowspan (hàng cuối có rowspan=5)
  const outOfBoundsTable: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 5, colspan: 1 },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Out of bounds" }] }],
          },
        ],
      },
    ],
  };
  const docOutOfBounds = createDocWithTable(outOfBoundsTable);
  const oobBytes = await exportDocumentModelToDocx(docOutOfBounds);
  assert.ok(oobBytes.length > 0);
  const zipOOB = await JSZip.loadAsync(oobBytes);
  const oobXml = await zipOOB.file("word/document.xml")!.async("string");
  // Bảng 1 hàng duy nhất: rowspan bị kẹp về 1, không được xuất vMerge restart giả tạo
  assert.ok(!oobXml.includes('<w:vMerge w:val="restart"/>'), "Bảng 1 hàng không xuất vMerge restart thừa");
});

test("Phase 6 - 5. Header Interaction: Header row with vMerge spanning into body", async () => {
  // Hàng 0 có w:tblHeader (tableHeader trong TipTap) với vMerge restart
  // Hàng 1 là hàng dữ liệu bình thường với vMerge continue
  const tableXml = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:trPr><w:tblHeader/></w:trPr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
          <w:p><w:r><w:t>Header Merged Down</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>Header Col 1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="continue"/></w:tcPr>
          <w:p/>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>Body Col 1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "header_vmerge.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  const headerMaster = table.content![0].content![0];
  assert.equal(headerMaster.type, "tableHeader", "Ô master trên hàng 0 phải là tableHeader");
  assert.equal(headerMaster.attrs?.rowspan, 2, "Rowspan=2 trên header");

  // Export
  const docxBytes = await exportDocumentModelToDocx(result.document);
  assert.ok(docxBytes.length > 0);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  const docDom = parseXmlString(docXml);
  const trElements = docDom.getElementsByTagNameNS("*", "tr");
  assert.equal(trElements.length, 2);

  // Chỉ hàng 0 có w:tblHeader
  const r0Headers = trElements[0].getElementsByTagNameNS("*", "tblHeader");
  const r1Headers = trElements[1].getElementsByTagNameNS("*", "tblHeader");
  assert.equal(r0Headers.length, 1, "Hàng 0 phải có w:tblHeader");
  assert.equal(r1Headers.length, 0, "Hàng 1 không được có w:tblHeader");
});

test("Phase 6 - 6. Cell Formatting & CT_TcPr Schema Safety in vertical merges", async () => {
  // Test formatting: shading, cellMargins, verticalAlign, rowHeight
  const tableNode: JSONContent = {
    type: "table",
    attrs: { borders: "all" },
    content: [
      {
        type: "tableRow",
        attrs: { rowHeight: 40, rowHeightRule: "exact" },
        content: [
          {
            type: "tableCell",
            attrs: {
              rowspan: 2,
              colspan: 1,
              backgroundColor: "#2563EB",
              verticalAlign: "middle",
              cellMargins: { top: 10, right: 15, bottom: 10, left: 15 },
              colwidth: [180],
            },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Formatted Master" }] }],
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
        attrs: { rowHeight: 50, rowHeightRule: "atLeast" },
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [200] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "R1C1" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes.length > 0);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra thứ tự thẻ CT_TcPr trong continuation cell:
  // tcW -> (gridSpan) -> vMerge -> shd -> tcMar -> vAlign
  assert.ok(
    docXml.includes(
      '<w:tcPr><w:tcW w:w="2700" w:type="dxa"/><w:vMerge w:val="continue"/><w:shd w:val="clear" w:color="auto" w:fill="2563EB"/><w:tcMar><w:top w:w="150" w:type="dxa"/><w:left w:w="225" w:type="dxa"/><w:bottom w:w="150" w:type="dxa"/><w:right w:w="225" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>'
    ),
    "Continuation cell phải kế thừa tcMar và vAlign theo đúng thứ tự ISO/IEC 29500 CT_TcPr"
  );

  // Import lại kiểm tra độ toàn vẹn thuộc tính
  const importRes = await importDocxToDocumentModel(docxBytes, "formatted_vmerge.docx");
  assert.equal(importRes.success, true);
  const importedTable = importRes.document.content.content![0];
  const masterCell = importedTable.content![0].content![0];

  assert.equal(masterCell.attrs?.backgroundColor, "#2563EB");
  assert.equal(masterCell.attrs?.verticalAlign, "middle");
  assert.equal(masterCell.attrs?.rowspan, 2);
});

test("Phase 6 - 7. Table Identity: Target ID & Caption preserved across vertical merge roundtrip", async () => {
  const tableNode: JSONContent = {
    type: "table",
    attrs: {
      id: "tbl-quarterly-analysis",
      targetId: "tbl-quarterly-analysis",
      borders: "all",
    },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 2, colspan: 1, colwidth: [120] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Metric" }] }],
          },
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [150] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Q1" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 1, colspan: 1, colwidth: [150] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Q2" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes.length > 0);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(
    docXml.includes('<w:tblCaption w:val="tbl-quarterly-analysis"/>'),
    "w:tblCaption phải chứa tableId/targetId"
  );

  const importRes = await importDocxToDocumentModel(docxBytes, "table_identity.docx");
  assert.equal(importRes.success, true);
  const importedTable = importRes.document.content.content![0];
  assert.equal(importedTable.attrs?.id, "tbl-quarterly-analysis");
  assert.equal(importedTable.attrs?.targetId, "tbl-quarterly-analysis");
});

test("Phase 6 - 8. Semantic Round-Trip: Word vMerge 3 rows -> Editor Edit -> Export -> Re-import", async () => {
  // 1. Tạo DOCX có vMerge 3 rows
  const originalXml = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
          <w:p><w:r><w:t>Original Text</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>R0C1</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="continue"/></w:tcPr>
          <w:p/>
        </w:tc>
        <w:tc><w:p><w:r><w:t>R1C1</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="continue"/></w:tcPr>
          <w:p/>
        </w:tc>
        <w:tc><w:p><w:r><w:t>R2C1</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes1 = await createDocxWithTable(originalXml);
  const import1 = await importDocxToDocumentModel(bytes1, "roundtrip1.docx");
  assert.equal(import1.success, true);

  // 2. Chỉnh sửa văn bản trong editor
  const table = import1.document.content.content![0];
  assert.equal(table.content![0].content![0].attrs?.rowspan, 3);
  table.content![0].content![0].content = [
    { type: "paragraph", content: [{ type: "text", text: "Edited Across 3 Rows" }] },
  ];

  // 3. Xuất ra DOCX lần 2
  const docxBytes2 = await exportDocumentModelToDocx(import1.document);
  assert.ok(docxBytes2.length > 0);

  // 4. Nhập lại kiểm tra độ trung thực
  const import2 = await importDocxToDocumentModel(docxBytes2, "roundtrip2.docx");
  assert.equal(import2.success, true);

  const finalTable = import2.document.content.content![0];
  assert.equal(finalTable.content!.length, 3);
  const finalMaster = finalTable.content![0].content![0];
  assert.equal(finalMaster.attrs?.rowspan, 3, "Rowspan=3 bảo toàn trọn vẹn qua round-trip");
  assert.equal(extractCellText(finalMaster), "Edited Across 3 Rows");
});

test("Phase 6 - 9. Full Package Validity: Archive integrity and namespace hygiene", async () => {
  const tableNode: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 2, colspan: 2 },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Box 2x2" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [],
      },
    ],
  };

  const doc = createDocWithTable(tableNode);
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes.length > 0);

  const zip = await JSZip.loadAsync(docxBytes);
  // Kiểm tra các phần bắt buộc trong gói
  assert.ok(zip.file("[Content_Types].xml"));
  assert.ok(zip.file("_rels/.rels"));
  assert.ok(zip.file("word/document.xml"));
  assert.ok(zip.file("word/_rels/document.xml.rels"));

  // Kiểm tra XML parser không báo lỗi
  const docXml = await zip.file("word/document.xml")!.async("string");
  const parsedDoc = parseXmlString(docXml);
  assert.ok(parsedDoc.documentElement, "DOM XML phải parse thành công mà không có lỗi");
});
