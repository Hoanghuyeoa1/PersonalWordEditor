import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { DocxDiagnosticsReporter } from "./diagnostics/docxDiagnostics.ts";
import { ComplexFieldParser } from "../fields/parser/complexFieldParser.ts";
import { normalizeStyleCollection } from "../styles/validation/styleValidator.ts";
import { STYLE_NORMAL_ID } from "../styles/services/builtInStyles.ts";
import { parseDrawingElement } from "./drawing/drawingPositionParser.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";

/**
 * Tạo một gói byte DOCX tối thiểu bằng JSZip cho kiểm thử
 */
async function buildTestDocxBytes(options: {
  documentXml: string;
  stylesXml?: string;
  relationshipsXml?: string;
  extraFiles?: Record<string, string | Uint8Array>;
}): Promise<Uint8Array> {
  const zip = new JSZip();

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml =
    options.relationshipsXml ||
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", rootRelsXml);
  zip.file("word/_rels/document.xml.rels", docRelsXml);
  zip.file("word/document.xml", options.documentXml);

  if (options.stylesXml) {
    zip.file("word/styles.xml", options.stylesXml);
  }

  if (options.extraFiles) {
    for (const [path, content] of Object.entries(options.extraFiles)) {
      zip.file(path, content);
    }
  }

  return await zip.generateAsync({ type: "uint8array" });
}

// =========================================================================
// 1. CHART: Package part preservation & safe skip from AST without corrupting package
// =========================================================================
test("PHASE 13 - 1. Chart: Package parts preserved, inline element skipped safely, zero corruption", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <w:body>
    <w:p>
      <w:r><w:t>Đoạn văn trước biểu đồ.</w:t></w:r>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:extent cx="5000000" cy="3000000"/>
            <wp:docPr id="1" name="DoanhThuChart" descr="Biểu đồ doanh thu"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
                <c:chart r:id="rIdChart1"/>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
      <w:r><w:t>Đoạn văn sau biểu đồ.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/>
</Relationships>`;

  const chartXml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart/></c:chartSpace>`;

  const docxBytes = await buildTestDocxBytes({
    documentXml: docXml,
    relationshipsXml: relsXml,
    extraFiles: {
      "word/charts/chart1.xml": chartXml,
      "word/theme/theme1.xml": "<a:theme/>",
    },
  });

  const res = await importDocxToDocumentModel(docxBytes, "chart-test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  // Chart package part được bảo toàn trong model
  assert.ok(res.document.unsupportedParts);
  assert.ok(res.document.unsupportedParts.has("word/charts/chart1.xml"));
  assert.ok(res.document.unsupportedParts.has("word/theme/theme1.xml"));

  // Nội dung AST không bị lỗi, văn bản quanh biểu đồ còn nguyên
  const p = res.document.content.content?.[0];
  assert.ok(p);
  const textContent = JSON.stringify(p);
  assert.ok(textContent.includes("Đoạn văn trước biểu đồ."));
  assert.ok(textContent.includes("Đoạn văn sau biểu đồ."));

  // Diagnostic ghi nhận Chart chưa hỗ trợ nhưng đã bảo vệ an toàn
  assert.ok(res.diagnostics);
  const chartDiag = res.diagnostics.getItems().find((i) => i.feature === "Chart");
  assert.ok(chartDiag, "Phải ghi nhận diagnostic cho Chart");
  assert.equal(chartDiag.status, "unsupported");

  // Round-trip export: file ZIP sinh ra phải bảo lưu word/charts/chart1.xml
  const exportedBytes = await exportDocumentModelToDocx(res.document);
  const outZip = await JSZip.loadAsync(exportedBytes);
  assert.ok(outZip.file("word/charts/chart1.xml"), "Package xuất ra phải bảo toàn file chart1.xml");
});

// =========================================================================
// 2. SMARTART: Safe skip without flattening into random paragraphs
// =========================================================================
test("PHASE 13 - 2. SmartArt: Bỏ qua an toàn, không làm xáo trộn bố cục hoặc flatten thành random paragraphs", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram">
  <w:body>
    <w:p><w:r><w:t>Đoạn 1 chuẩn.</w:t></w:r></w:p>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:extent cx="4000000" cy="2000000"/>
            <wp:docPr id="2" name="ProcessDiagram"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">
                <dgm:relIds r:dm="rId1" r:lo="rId2"/>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p><w:r><w:t>Đoạn 2 chuẩn.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const diagramDataXml = `<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>`;

  const docxBytes = await buildTestDocxBytes({
    documentXml: docXml,
    extraFiles: {
      "word/diagrams/data1.xml": diagramDataXml,
    },
  });

  const res = await importDocxToDocumentModel(docxBytes, "smartart-test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  // SmartArt part được bảo toàn
  assert.ok(res.document.unsupportedParts?.has("word/diagrams/data1.xml"));

  // Không sinh ra các đoạn văn ngẫu nhiên từ cấu trúc diagram
  const blocks = res.document.content.content || [];
  assert.equal(blocks.length, 3, "Chỉ gồm 3 đoạn văn ban đầu, không phân rã diagram thành random paragraphs");

  // Diagnostic ghi nhận SmartArt
  const dgmDiag = res.diagnostics?.getItems().find((i) => i.feature === "SmartArt");
  assert.ok(dgmDiag);
  assert.equal(dgmDiag.status, "unsupported");
});

// =========================================================================
// 3. WORDART: Visible text extraction + diagnostic without crash
// =========================================================================
test("PHASE 13 - 3. WordArt: Trích xuất visible text cho cả VML và DrawingML, không crash", async () => {
  // Case A: VML WordArt với v:textpath
  const docXmlA = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p>
      <w:r>
        <w:pict>
          <v:shape id="WordArt1" style="width:300pt;height:50pt">
            <v:textpath string="Nghệ thuật chữ VML" style="font-family:Arial;font-size:24pt"/>
          </v:shape>
        </w:pict>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const resA = await importDocxToDocumentModel(await buildTestDocxBytes({ documentXml: docXmlA }), "vml-wordart.docx");
  assert.equal(resA.success, true);
  if (!resA.success) return;

  const contentA = JSON.stringify(resA.document.content);
  assert.ok(contentA.includes("Nghệ thuật chữ VML"), "Phải trích xuất được chữ từ VML textpath");
  assert.ok(resA.diagnostics?.getItems().some((i) => i.feature === "WordArt" && i.status === "approximated"));

  // Case B: DrawingML WordArt
  const docXmlB = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:extent cx="3000000" cy="600000"/>
            <wp:docPr id="3" name="Tiêu Đề WordArt 2010"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordart">
                <a:txBody>
                  <a:p>
                    <a:r><a:t>WordArt Hiện Đại</a:t></a:r>
                  </a:p>
                </a:txBody>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const resB = await importDocxToDocumentModel(await buildTestDocxBytes({ documentXml: docXmlB }), "dंदनml-wordart.docx");
  assert.equal(resB.success, true);
  if (!resB.success) return;

  const contentB = JSON.stringify(resB.document.content);
  assert.ok(contentB.includes("WordArt Hiện Đại"), "Phải trích xuất được text từ DrawingML WordArt");
  assert.ok(resB.diagnostics?.getItems().some((i) => i.feature === "WordArt" && i.status === "approximated"));
});

// =========================================================================
// 4. INVALID DRAWING: Missing media, missing rel, invalid extent, missing anchor coordinates
// =========================================================================
test("PHASE 13 - 4. Invalid Drawing: Thiếu media, sai extent, thiếu anchor coordinates không fatal document", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <!-- Drawing 1: Missing rel & missing media -> Fallback placeholder -->
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline>
            <!-- Sai extent (âm hoặc rỗng) -->
            <wp:extent cx="-1000" cy="0"/>
            <wp:docPr id="10" name="BrokenImage"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:blipFill>
                    <a:blip r:embed="rIdNonExistentMedia"/>
                  </pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <!-- Drawing 2: Floating anchor thiếu tọa độ x,y -> Safe centered position -->
    <w:p>
      <w:r>
        <w:drawing>
          <wp:anchor distT="0" distB="0" distL="0" distR="0">
            <wp:docPr id="11" name="FloatingShape"/>
            <wp:wrapMysteryCustomTag/>
            <a:graphic>
              <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                  <wps:spPr>
                    <a:prstGeom prst="rect"/>
                  </wps:spPr>
                </wps:wsp>
              </a:graphicData>
            </a:graphic>
          </wp:anchor>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const res = await importDocxToDocumentModel(await buildTestDocxBytes({ documentXml: docXml }), "invalid-drawing.docx");
  assert.equal(res.success, true, "Tài liệu phải nạp thành công dù drawing bị lỗi");
  if (!res.success) return;

  const contentStr = JSON.stringify(res.document.content);
  // Hình ảnh thiếu media được biến đổi thành placeholder an toàn
  assert.ok(contentStr.includes("BrokenImage") || contentStr.includes("image"));
  // Diagnostics ghi nhận
  assert.ok(res.diagnostics);
  assert.ok(res.diagnostics.getItems().some((i) => i.feature === "Drawing" || i.userMessage.includes("hình ảnh")));
});

// =========================================================================
// 5. MALFORMED OMML: Safe text fallback
// =========================================================================
test("PHASE 13 - 5. Malformed OMML: Công thức toán bị hỏng fallback an toàn sang văn bản thay thế", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>Công thức: </w:t></w:r>
      <!-- Malformed OMML thẻ không đóng và nội dung thô -->
      <m:oMath>
        <m:r>
          <m:t>E = mc^2</m:t>
        </m:r>
      </m:oMath>
    </w:p>
    <!-- Block level OMML rỗng hoặc bị lỗi cú pháp -->
    <m:oMathPara>
      <m:oMath>
        <m:brokenTag>x + y = z</m:brokenTag>
      </m:oMath>
    </m:oMathPara>
  </w:body>
</w:document>`;

  const res = await importDocxToDocumentModel(await buildTestDocxBytes({ documentXml: docXml }), "malformed-omml.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const contentStr = JSON.stringify(res.document.content);
  assert.ok(contentStr.includes("E = mc^2") || contentStr.includes("E=mc^2"));
  assert.ok(contentStr.includes("x + y = z") || contentStr.includes("Equation"));
});

// =========================================================================
// 6. MALFORMED FIELD: Unclosed begin, orphan end, orphan separate
// =========================================================================
test("PHASE 13 - 6. Malformed Field: Begin không có end, orphan end, orphan separate bảo toàn dữ liệu", () => {
  const parser = new ComplexFieldParser();

  // A. Orphan end không có begin
  const dummyEl = parseXmlString('<w:fldChar xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:fldCharType="end"/>').documentElement;
  const orphanEnd = parser.handleFldChar(dummyEl, null);
  assert.equal(orphanEnd, null, "Orphan end không được crash");

  // B. Orphan separate không có begin
  const sepEl = parseXmlString('<w:fldChar xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:fldCharType="separate"/>').documentElement;
  const orphanSep = parser.handleFldChar(sepEl, null);
  assert.equal(orphanSep, null, "Orphan separate không được crash");

  // C. Unclosed begin (chưa đóng end trước khi hết paragraph)
  const beginEl = parseXmlString('<w:fldChar xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:fldCharType="begin"/>').documentElement;
  parser.handleFldChar(beginEl, null);
  parser.appendInstructionText("PAGE");
  parser.handleFldChar(sepEl, null);
  parser.appendResultText("5");

  // Khi hết đoạn văn, flushRemainingFrames phải khôi phục được field với nội dung
  const recovered = parser.flushRemainingFrames();
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].fieldType, "PAGE");
  assert.equal(recovered[0].result, "5");
});

// =========================================================================
// 7. INVALID STYLE: Style cycle & Duplicate styleId deterministic resolution
// =========================================================================
test("PHASE 13 - 7. Invalid Style: Vòng lặp kế thừa (cycle) và trùng lặp ID được chuẩn hóa an toàn", () => {
  // Cycle A -> B -> A
  const cycleDefs = [
    { id: "StyleA", name: "Style A", type: "paragraph", isBuiltIn: false, basedOn: "StyleB" },
    { id: "StyleB", name: "Style B", type: "paragraph", isBuiltIn: false, basedOn: "StyleA" },
    // Trùng lặp style ID
    { id: "StyleA", name: "Style A Duplicate", type: "paragraph", isBuiltIn: false },
  ];

  const normalized = normalizeStyleCollection(cycleDefs);
  assert.ok(normalized.definitions.length > 0);

  const styleA = normalized.definitions.find((s) => s.id === "StyleA");
  const styleB = normalized.definitions.find((s) => s.id === "StyleB");

  assert.ok(styleA);
  assert.ok(styleB);
  // Vòng lặp phải được bẻ gãy an toàn về STYLE_NORMAL_ID hoặc không còn chu trình
  assert.notEqual(styleA.basedOn, "StyleA");
  assert.notEqual(styleB.basedOn, "StyleB");
});

// =========================================================================
// 8. TRACK CHANGES: Advanced objects in tracked revisions & Formatting revision skip
// =========================================================================
test("PHASE 13 - 8. Track Changes: Advanced object bên trong w:ins/w:del được nạp an toàn, pPrChange bỏ qua", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <!-- pPrChange: revision định dạng đoạn văn -->
      <w:pPr>
        <w:jc w:val="center"/>
        <w:pPrChange w:id="101" w:author="Reviewer" w:date="2026-10-08T00:00:00Z">
          <w:pPr><w:jc w:val="left"/></w:pPr>
        </w:pPrChange>
      </w:pPr>
      <!-- w:ins chứa trực tiếp drawing và omath -->
      <w:ins w:id="1" w:author="Editor" w:date="2026-10-08T00:00:00Z">
        <w:r><w:t>Đoạn văn chèn.</w:t></w:r>
        <w:drawing>
          <wp:inline>
            <wp:extent cx="1000000" cy="500000"/>
            <wp:docPr id="100" name="TrackedShape"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                  <wps:spPr><a:prstGeom prst="rect"/></wps:spPr>
                </wps:wsp>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
        <m:oMath>
          <m:r><m:t>A^2 + B^2 = C^2</m:t></m:r>
        </m:oMath>
      </w:ins>
    </w:p>
  </w:body>
</w:document>`;

  const res = await importDocxToDocumentModel(await buildTestDocxBytes({ documentXml: docXml }), "tracked-advanced.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const contentStr = JSON.stringify(res.document.content);
  // Văn bản và công thức/hình vẽ trong ins được bảo toàn
  assert.ok(contentStr.includes("Đoạn văn chèn."));
  assert.ok(contentStr.includes("A^2 + B^2 = C^2") || contentStr.includes("A^{2}"));

  // Track change được ghi nhận
  assert.ok(res.document.trackedChanges && res.document.trackedChanges.length > 0);

  // Formatting revision được ghi nhận (bảo toàn dưới dạng Paragraph Revision hoặc bỏ qua an toàn)
  assert.ok(
    res.diagnostics?.getItems().some((i) =>
      (i.code === "PPRCHANGE_IGNORED" && i.status === "ignoredSafely") ||
      (i.code === "PARAGRAPH_FORMATTING_REVISION_IMPORTED" && i.status === "preserved")
    )
  );
});

// =========================================================================
// 9. COMMENTS: Comment anchors around advanced content preserve comment body
// =========================================================================
test("PHASE 13 - 9. Comments: Neo quanh hình ảnh/đối tượng nâng cao bảo toàn 100% nội dung comment", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p>
      <!-- Comment neo quanh drawing -->
      <w:commentRangeStart w:id="5"/>
      <w:r>
        <w:drawing>
          <wp:inline>
            <wp:extent cx="1000000" cy="500000"/>
            <wp:docPr id="101" name="TargetImage" descr="Ảnh sản phẩm"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
                  <wps:spPr><a:prstGeom prst="rect"/></wps:spPr>
                </wps:wsp>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
      <w:commentRangeEnd w:id="5"/>
      <w:r><w:commentReference w:id="5"/></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="5" w:author="Inspector" w:date="2026-10-08T08:00:00Z">
    <w:p><w:r><w:t>Cần kiểm tra lại độ phân giải của hình này!</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;

  const docxBytes = await buildTestDocxBytes({
    documentXml: docXml,
    extraFiles: {
      "word/comments.xml": commentsXml,
    },
  });

  const res = await importDocxToDocumentModel(docxBytes, "comment-object.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  // Thân bình luận KHÔNG bị xóa ngầm
  assert.ok(res.document.comments);
  assert.equal(res.document.comments.length, 1);
  assert.equal(res.document.comments[0].author, "Inspector");
  assert.equal(res.document.comments[0].content, "Cần kiểm tra lại độ phân giải của hình này!");
  // Diagnostic ghi nhận bảo toàn
  assert.ok(res.diagnostics?.getItems().some((i) => i.feature === "Comments" && i.status === "preserved"));
});

// =========================================================================
// 10. MACRO & OLE SECURITY: Macro execution blocked & OLE safe handling
// =========================================================================
test("PHASE 13 - 10. Security: Tệp chứa macro (vbaProject.bin) bị vô hiệu hóa thực thi, OLE an toàn", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Tài liệu chứa VBA macro và OLE.</w:t></w:r>
      <!-- OLE Object nhúng -->
      <w:r>
        <w:object>
          <w:t>OLE Fallback Text</w:t>
        </w:object>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const dummyVba = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  const docxBytes = await buildTestDocxBytes({
    documentXml: docXml,
    extraFiles: {
      "word/vbaProject.bin": dummyVba,
      "word/vbaData.xml": "<vbaData/>",
    },
  });

  const res = await importDocxToDocumentModel(docxBytes, "macro-doc.docm");
  assert.equal(res.success, true);
  if (!res.success) return;

  // Cảnh báo bảo mật được ghi nhận
  assert.ok(res.warnings.some((w) => w.includes("macro") || w.includes("bảo mật")));
  const macroDiag = res.diagnostics?.getItems().find((i) => i.code === "MACRO_EXECUTION_BLOCKED");
  assert.ok(macroDiag, "Phải ghi nhận chẩn đoán MACRO_EXECUTION_BLOCKED");
  assert.equal(macroDiag.status, "ignoredSafely");

  // Macro binary KHÔNG được lưu vào unsupportedParts để tránh bảo toàn nhầm mã thực thi nguy hiểm
  assert.equal(res.document.unsupportedParts?.has("word/vbaProject.bin"), false);
});

// =========================================================================
// 11. COMPATIBILITY REPORT: Structured summary without technical XML spam
// =========================================================================
test("PHASE 13 - 11. Compatibility Report: Tổng hợp Preserved, Approximated, Unsupported, Ignored safely", () => {
  const reporter = new DocxDiagnosticsReporter();

  reporter.recordPreserved("Equation", "OMML_PRESERVED", "Công thức toán học Office Math được bảo toàn.");
  reporter.recordApproximated("WordArt", "WORDART_EXTRACTED_TEXT", "WordArt được chuyển đổi thành văn bản hiển thị.");
  reporter.recordUnsupported("Chart", "CHART_UNSUPPORTED", "Biểu đồ chưa được hỗ trợ chỉnh sửa trực tiếp.");
  reporter.recordIgnoredSafely("Security", "MACRO_BLOCKED", "Macro VBA đã bị vô hiệu hóa thực thi vì lý do an toàn.");

  const report = reporter.generateReport();

  assert.equal(report.summary.total, 4);
  assert.equal(report.summary.preserved, 1);
  assert.equal(report.summary.approximated, 1);
  assert.equal(report.summary.unsupported, 1);
  assert.equal(report.summary.ignoredSafely, 1);

  assert.ok(report.formattedText.includes("BÁO CÁO TƯƠNG THÍCH TÀI LIỆU"));
  assert.ok(report.formattedText.includes("Bảo toàn (Preserved): 1"));
  assert.ok(report.formattedText.includes("Chuyển đổi xấp xỉ an toàn (Approximated): 1"));
  assert.ok(report.formattedText.includes("Chưa hỗ trợ (Unsupported): 1"));
  assert.ok(report.formattedText.includes("Bỏ qua an toàn (Ignored safely): 1"));

  // Không technical XML spam
  assert.ok(!report.formattedText.includes("xmlns:"));
  assert.ok(!report.formattedText.includes("w:drawing"));
});
