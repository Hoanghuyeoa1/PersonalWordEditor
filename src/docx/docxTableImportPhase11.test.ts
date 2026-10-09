import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
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
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${tableXml}
        <w:p><w:r><w:t>Đoạn văn kết thúc</w:t></w:r></w:p>
      </w:body>
    </w:document>`
  );

  return zip.generateAsync({ type: "uint8array" });
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
// PHASE 11: DOCX ADVANCED TABLE IMPORT TEST SUITE
// ============================================================================

test("Phase 11 - 1. Vertical Merge (w:vMerge restart & continue) -> semantic rowspan", async () => {
  const tableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:vMerge w:val="restart"/>
          </w:tcPr>
          <w:p><w:r><w:t>Merged Col 0</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>R0C1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:vMerge w:val="continue"/>
          </w:tcPr>
          <w:p/>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>R1C1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:vMerge/>
          </w:tcPr>
          <w:p/>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>R2C1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "vmerge_test.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  assert.equal(table.type, "table");
  assert.equal(table.content!.length, 3, "Bảng phải có đủ 3 hàng");

  // Hàng 0: ô đầu có rowspan=3
  const row0 = table.content![0];
  assert.equal(row0.content!.length, 2);
  const masterCell = row0.content![0];
  assert.equal(masterCell.attrs?.rowspan, 3, "vMerge restart kéo dài qua 2 continue -> rowspan=3");
  assert.equal(extractCellText(masterCell), "Merged Col 0");

  // Hàng 1: ô continuation bị loại bỏ triệt để khỏi AST, chỉ còn ô R1C1
  const row1 = table.content![1];
  assert.equal(row1.content!.length, 1, "Hàng 1 không được chứa fake continuation cell");
  assert.equal(extractCellText(row1.content![0]), "R1C1");

  // Hàng 2: ô continuation bị loại bỏ, chỉ còn ô R2C1
  const row2 = table.content![2];
  assert.equal(row2.content!.length, 1, "Hàng 2 không được chứa fake continuation cell");
  assert.equal(extractCellText(row2.content![0]), "R2C1");
});

test("Phase 11 - 2. Continuation cell text preservation (không mất text khi continuation có nội dung)", async () => {
  const tableXml = `
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:vMerge w:val="restart"/>
          </w:tcPr>
          <w:p><w:r><w:t>Tiêu đề ô chính</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:vMerge w:val="continue"/>
          </w:tcPr>
          <w:p><w:r><w:t>Nội dung bổ sung trong ô gộp 2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "vmerge_text_preserve.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  const row0 = table.content![0];
  const masterCell = row0.content![0];
  assert.equal(masterCell.attrs?.rowspan, 2);

  // Kiểm tra văn bản từ ô continuation được nối vào masterCell an toàn
  const texts = masterCell.content!.map((p: JSONContent) => p.content?.[0]?.text).filter(Boolean);
  assert.ok(texts.includes("Tiêu đề ô chính"));
  assert.ok(texts.includes("Nội dung bổ sung trong ô gộp 2"), "Văn bản ô continuation phải được bảo tồn");
});

test("Phase 11 - 3. Rectangular Merge (gridSpan + vMerge combination)", async () => {
  const tableXml = `
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:gridSpan w:val="2"/>
            <w:vMerge w:val="restart"/>
          </w:tcPr>
          <w:p><w:r><w:t>2x2 Merged Box</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>R0C2</w:t></w:r></w:p>
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
          <w:p><w:r><w:t>R1C2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "rectangular_merge.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  const row0 = table.content![0];
  const boxCell = row0.content![0];
  assert.equal(boxCell.attrs?.colspan, 2, "gridSpan=2 -> colspan=2");
  assert.equal(boxCell.attrs?.rowspan, 2, "vMerge restart+continue -> rowspan=2");

  const row1 = table.content![1];
  assert.equal(row1.content!.length, 1, "Ô 2-cột continuation bị bỏ, chỉ còn R1C2");
  assert.equal(extractCellText(row1.content![0]), "R1C2");
});

test("Phase 11 - 4. Repeat Header (w:tblHeader) -> semantic repeatHeader property", async () => {
  const tableXml = `
    <w:tbl>
      <w:tr>
        <w:trPr>
          <w:tblHeader/>
        </w:trPr>
        <w:tc>
          <w:p><w:r><w:t>Cột 1</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>Cột 2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>Dữ liệu 1</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:p><w:r><w:t>Dữ liệu 2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "repeat_header.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  assert.equal(table.attrs?.repeatHeader, true, "w:tblHeader phải gán repeatHeader=true trên bảng");

  // Hàng 0 phải là tableHeader
  const row0 = table.content![0];
  assert.equal(row0.content![0].type, "tableHeader");
  assert.equal(row0.content![1].type, "tableHeader");

  // Hàng 1 phải là tableCell
  const row1 = table.content![1];
  assert.equal(row1.content![0].type, "tableCell");

  // Không duplicate hàng header
  assert.equal(table.content!.length, 2, "Số hàng chính xác là 2, không nhân đôi header");
});

test("Phase 11 - 5. Column widths from w:tblGrid & w:tcW with exact unit conversion", async () => {
  // 1500 twips = 100px, 3000 twips = 200px (1 px = 15 twips)
  const tableXml = `
    <w:tbl>
      <w:tblGrid>
        <w:gridCol w:w="1500"/>
        <w:gridCol w:w="3000"/>
      </w:tblGrid>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="1500" w:type="dxa"/>
          </w:tcPr>
          <w:p><w:r><w:t>Col 1</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="3000" w:type="dxa"/>
          </w:tcPr>
          <w:p><w:r><w:t>Col 2</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "col_widths.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  const row0 = table.content![0];
  assert.deepEqual(row0.content![0].attrs?.colwidth, [100], "1500 twips -> 100px");
  assert.deepEqual(row0.content![1].attrs?.colwidth, [200], "3000 twips -> 200px");
});

test("Phase 11 - 6. AutoFit-ish table layout modes and widths (auto, pct, dxa)", async () => {
  // Test A: w:type="auto" -> autoContent
  const xmlAuto = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblLayout w:type="autofit"/>
      </w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>Auto</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;
  const bytesAuto = await createDocxWithTable(xmlAuto);
  const resAuto = await importDocxToDocumentModel(bytesAuto, "tbl_auto.docx");
  assert.equal(resAuto.success, true);
  if (!resAuto.success) return;
  const tableAuto = resAuto.document.content.content![0];
  assert.equal(tableAuto.attrs?.layoutMode, "autoContent");
  assert.equal(tableAuto.attrs?.tableWidth, "auto");

  // Test B: w:type="pct" w:w="5000" (100%) -> autoWindow
  const xmlPct = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
      </w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>Pct</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;
  const bytesPct = await createDocxWithTable(xmlPct);
  const resPct = await importDocxToDocumentModel(bytesPct, "tbl_pct.docx");
  assert.equal(resPct.success, true);
  if (!resPct.success) return;
  const tablePct = resPct.document.content.content![0];
  assert.equal(tablePct.attrs?.layoutMode, "autoWindow");
  assert.equal(tablePct.attrs?.tableWidth, "100%");

  // Test C: w:type="dxa" w:w="9000" (600px) -> fixed
  const xmlDxa = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
      </w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>Fixed</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;
  const bytesDxa = await createDocxWithTable(xmlDxa);
  const resDxa = await importDocxToDocumentModel(bytesDxa, "tbl_fixed.docx");
  assert.equal(resDxa.success, true);
  if (!resDxa.success) return;
  const tableDxa = resDxa.document.content.content![0];
  assert.equal(tableDxa.attrs?.layoutMode, "fixed");
  assert.equal(tableDxa.attrs?.tableWidth, "600px");
});

test("Phase 11 - 7. Cell Margins (w:tblCellMar table default & w:tcMar cell override)", async () => {
  // Table margins: top=120 (8px), bottom=120 (8px), left=180 (12px), right=180 (12px)
  // Cell override: top=60 (4px), bottom=60 (4px), left=90 (6px), right=90 (6px)
  const tableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblCellMar>
          <w:top w:w="120" w:type="dxa"/>
          <w:bottom w:w="120" w:type="dxa"/>
          <w:left w:w="180" w:type="dxa"/>
          <w:right w:w="180" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>Default margins</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcMar>
              <w:top w:w="60" w:type="dxa"/>
              <w:bottom w:w="60" w:type="dxa"/>
              <w:left w:w="90" w:type="dxa"/>
              <w:right w:w="90" w:type="dxa"/>
            </w:tcMar>
          </w:tcPr>
          <w:p><w:r><w:t>Override margins</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "cell_margins.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  assert.deepEqual(table.attrs?.cellMargins, { top: 8, bottom: 8, left: 12, right: 12 });

  const row = table.content![0];
  assert.equal(row.content![0].attrs?.cellMargins, null, "Ô 0 kế thừa mặc định bảng (null)");
  assert.deepEqual(row.content![1].attrs?.cellMargins, { top: 4, bottom: 4, left: 6, right: 6 });
});

test("Phase 11 - 8. Row heights and rules (w:trHeight exact & atLeast)", async () => {
  // 720 twips = 48px exact, 450 twips = 30px atLeast
  const tableXml = `
    <w:tbl>
      <w:tr>
        <w:trPr>
          <w:trHeight w:val="720" w:hRule="exact"/>
        </w:trPr>
        <w:tc><w:p><w:r><w:t>Exact 48px</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:trPr>
          <w:trHeight w:val="450" w:hRule="atLeast"/>
        </w:trPr>
        <w:tc><w:p><w:r><w:t>AtLeast 30px</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Auto height</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "row_heights.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  const row0 = table.content![0];
  assert.equal(row0.attrs?.rowHeight, 48);
  assert.equal(row0.attrs?.rowHeightRule, "exact");

  const row1 = table.content![1];
  assert.equal(row1.attrs?.rowHeight, 30);
  assert.equal(row1.attrs?.rowHeightRule, "atLeast");

  const row2 = table.content![2];
  assert.equal(row2.attrs?.rowHeight, null);
  assert.equal(row2.attrs?.rowHeightRule, "auto");
});

test("Phase 11 - 9. Cell shading / background color (w:shd)", async () => {
  const tableXml = `
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr>
            <w:shd w:fill="FEF08A"/>
          </w:tcPr>
          <w:p><w:r><w:t>Yellow cell</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:shd w:fill="auto"/>
          </w:tcPr>
          <w:p><w:r><w:t>Auto cell</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(tableXml);
  const result = await importDocxToDocumentModel(bytes, "shading_test.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  const row = table.content![0];
  assert.equal(row.content![0].attrs?.backgroundColor, "#FEF08A");
  assert.equal(row.content![1].attrs?.backgroundColor, null);
});

test("Phase 11 - 10. Table Borders (w:tblBorders all, outside, none)", async () => {
  // All borders none
  const xmlNone = `
    <w:tbl>
      <w:tblPr>
        <w:tblBorders>
          <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>No borders</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;
  const bytesNone = await createDocxWithTable(xmlNone);
  const resNone = await importDocxToDocumentModel(bytesNone, "borders_none.docx");
  assert.equal(resNone.success, true);
  if (!resNone.success) return;
  assert.equal(resNone.document.content.content![0].attrs?.borders, "none");

  // Outside only
  const xmlOutside = `
    <w:tbl>
      <w:tblPr>
        <w:tblBorders>
          <w:top w:val="single"/><w:left w:val="single"/><w:bottom w:val="single"/><w:right w:val="single"/>
          <w:insideH w:val="none"/><w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>Outside borders</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;
  const bytesOutside = await createDocxWithTable(xmlOutside);
  const resOutside = await importDocxToDocumentModel(bytesOutside, "borders_outside.docx");
  assert.equal(resOutside.success, true);
  if (!resOutside.success) return;
  assert.equal(resOutside.document.content.content![0].attrs?.borders, "outside");
});

test("Phase 11 - 11. Unsupported & Built-in Table Styles resolution", async () => {
  // Built-in LightGrid style
  const xmlLightGrid = `
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="LightGridAccent1"/>
        <w:tblLook w:firstRow="1" w:noHBand="0" w:firstColumn="1"/>
      </w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>Style test</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;
  const bytes1 = await createDocxWithTable(xmlLightGrid);
  const res1 = await importDocxToDocumentModel(bytes1, "style_light.docx");
  assert.equal(res1.success, true);
  if (!res1.success) return;
  const table1 = res1.document.content.content![0];
  assert.equal(table1.attrs?.tableStyleId, "light-grid");
  assert.equal(table1.attrs?.tableStyleOptions?.headerRow, true);
  assert.equal(table1.attrs?.tableStyleOptions?.bandedRows, true);
  assert.equal(table1.attrs?.tableStyleOptions?.firstColumn, true);

  // Unknown custom style fallback without losing content
  const xmlUnknown = `
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="UnknownEnterpriseTheme2026"/>
      </w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:t>Data preserved</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  `;
  const bytes2 = await createDocxWithTable(xmlUnknown);
  const res2 = await importDocxToDocumentModel(bytes2, "style_unknown.docx");
  assert.equal(res2.success, true);
  if (!res2.success) return;
  const table2 = res2.document.content.content![0];
  assert.equal(table2.attrs?.tableStyleId, "grid", "Unknown style ID fallback về grid");
  assert.equal(table2.content![0].content![0].content![0].content![0].text, "Data preserved");
});

test("Phase 11 - 12. Malformed DOCX Table handling (broken vMerge, invalid widths, negative values)", async () => {
  // Bảng lỗi:
  // - vMerge="continue" ngay ở hàng đầu tiên (orphan continue mà không có restart trước)
  // - trHeight âm
  // - col width âm
  const malformedTableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="-500" w:type="dxa"/>
      </w:tblPr>
      <w:tr>
        <w:trPr>
          <w:trHeight w:val="-200" w:hRule="unknownRule"/>
        </w:trPr>
        <w:tc>
          <w:tcPr>
            <w:vMerge w:val="continue"/>
            <w:tcW w:w="-1000"/>
          </w:tcPr>
          <w:p><w:r><w:t>Orphan continue cell</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:gridSpan w:val="-5"/>
          </w:tcPr>
          <w:p><w:r><w:t>Negative gridSpan</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  `;

  const bytes = await createDocxWithTable(malformedTableXml);
  const result = await importDocxToDocumentModel(bytes, "malformed_test.docx");
  assert.equal(result.success, true, "Importer không bao giờ được crash khi gặp XML dị thường");
  if (!result.success) return;

  const table = result.document.content.content![0];
  assert.equal(table.type, "table");

  // Hàng 0:
  const row0 = table.content![0];
  assert.equal(row0.content!.length, 2, "Cả 2 ô đều không bị mất văn bản");
  assert.equal(row0.content![0].attrs?.rowspan, 1, "Orphan continue fallback thành rowspan=1");
  assert.equal(row0.content![0].content![0].content![0].text, "Orphan continue cell");

  assert.equal(row0.content![1].attrs?.colspan, 1, "Negative gridSpan fallback thành colspan=1");
  assert.equal(row0.content![1].content![0].content![0].text, "Negative gridSpan");

  // Chiều cao hàng âm tự hồi phục về null/auto
  assert.equal(row0.attrs?.rowHeight, null);
  assert.equal(row0.attrs?.rowHeightRule, "auto");
});
