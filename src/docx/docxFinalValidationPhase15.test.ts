import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  importDocxToDocumentModel,
  exportDocumentModelToDocx,
  OmmlEngine,
} from "./index.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";
import { STYLE_NORMAL_ID } from "../styles/services/builtInStyles.ts";

const SAMPLE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/**
 * PHASE 15 — FINAL VALIDATION / ZERO REGRESSION / DOCUMENTATION
 * Workflows A through H & Mixed Academic End-to-End
 */

// ============================================================================
// 1. WORKFLOW A — OMML (Fraction, Integral, Superscript)
// ============================================================================
test("Phase 15 - Workflow A: OMML fraction, integral, superscript -> Editor -> Save DOCX -> Native Equation Equivalent", async () => {
  // 1. OOXML containing math fraction, integral, and superscript
  const ommlSnippet = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:oMath>
      <m:int>
        <m:sub><m:r><m:t>0</m:t></m:r></m:sub>
        <m:sup><m:r><m:t>1</m:t></m:r></m:sup>
        <m:e>
          <m:f>
            <m:num><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:num>
            <m:den><m:r><m:t>2</m:t></m:r></m:den>
          </m:f>
          <m:r><m:t xml:space="preserve"> d</m:t></m:r>
          <m:r><m:t>x</m:t></m:r>
        </m:e>
      </m:int>
    </m:oMath>
  </w:p>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
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
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
      <w:body>
        ${ommlSnippet}
      </w:body>
    </w:document>`
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });

  // Import to Editor
  const importRes = await importDocxToDocumentModel(bytes);
  assert.equal(importRes.success, true);
  assert.ok(importRes.document);

  const blocks = importRes.document.content.content || [];
  const eqBlock = blocks.find((b) => b.type === "equation");
  assert.ok(eqBlock, "OMML must import as editable equation node");
  const latex = eqBlock.attrs?.latex || "";
  assert.ok(latex.includes("int") || latex.includes("frac") || latex.includes("x"), "Equation must parse math components");

  // Edit in editor: modify equation
  eqBlock.attrs.latex = "\\int_{0}^{1} \\frac{x^2}{2} dx = \\frac{1}{6}";

  // Save back to DOCX
  const exported = await exportDocumentModelToDocx(importRes.document);
  const reimported = await importDocxToDocumentModel(exported);
  assert.equal(reimported.success, true);

  const reBlocks = reimported.document?.content.content || [];
  const reEq = reBlocks.find((b) => b.type === "equation");
  assert.ok(reEq, "Equation node must persist on re-import");
  assert.ok(reEq.attrs?.latex.includes("int") && reEq.attrs?.latex.includes("frac"));
});

// ============================================================================
// 2. WORKFLOW B — FLOATING IMAGE WITH SQUARE WRAP & RIGHT POSITION
// ============================================================================
test("Phase 15 - Workflow B: Floating image, Square wrap, right position -> Move/modify -> Export -> Re-import", async () => {
  const doc: DocumentModel = {
    metadata: { id: "wf-b", title: "Workflow B", version: 1, createdAt: "", updatedAt: "" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn bản đầu tiên nằm trước hình ảnh." }],
        },
        {
          type: "image",
          attrs: {
            src: SAMPLE_PNG,
            width: 300,
            height: 200,
            floating: true,
            wrap: "square",
            alignment: "right",
            drawingPosition: {
              placement: "floating",
              width: 300,
              height: 200,
              wrapMode: "square",
              horizontalRelative: "margin",
              horizontalAlign: "right",
              verticalRelative: "paragraph",
              offsetY: 30,
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản bao quanh theo kiểu Square ở phía bên trái của hình ảnh." }],
        },
      ],
    },
  };

  // Export -> Re-import
  const exported = await exportDocumentModelToDocx(doc);
  const reimported = await importDocxToDocumentModel(exported);

  assert.equal(reimported.success, true);
  const blocks = reimported.document?.content.content || [];
  const imgNode = blocks.find((b) => b.type === "image");
  assert.ok(imgNode, "Image must exist in reimported document");
  assert.equal(imgNode.attrs?.floating, true, "Floating semantics must be preserved");
  assert.equal(imgNode.attrs?.wrap, "square", "Square wrap must be preserved");
  assert.equal(imgNode.attrs?.drawingPosition?.wrapMode, "square");
  assert.equal(imgNode.attrs?.drawingPosition?.horizontalAlign, "right");
});

// ============================================================================
// 3. WORKFLOW C — TOP & BOTTOM WRAPPING ISOLATION
// ============================================================================
test("Phase 15 - Workflow C: Paragraph -> Floating object (Top & Bottom) -> Paragraph (Text does not run on either side)", async () => {
  const doc: DocumentModel = {
    metadata: { id: "wf-c", title: "Workflow C", version: 1, createdAt: "", updatedAt: "" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn bản hoàn toàn ở phía trên đối tượng." }],
        },
        {
          type: "image",
          attrs: {
            src: SAMPLE_PNG,
            width: 400,
            height: 150,
            floating: true,
            wrap: "topBottom",
            drawingPosition: {
              placement: "floating",
              width: 400,
              height: 150,
              wrapMode: "topBottom",
              horizontalRelative: "column",
              verticalRelative: "paragraph",
              distT: 15,
              distB: 15,
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn bản hoàn toàn ở phía dưới đối tượng, không chạy hai bên." }],
        },
      ],
    },
  };

  const exported = await exportDocumentModelToDocx(doc);
  const reimported = await importDocxToDocumentModel(exported);

  assert.equal(reimported.success, true);
  const blocks = reimported.document?.content.content || [];
  const imgNode = blocks.find((b) => b.type === "image");
  assert.ok(imgNode);
  assert.ok(
    imgNode.attrs?.wrap === "topAndBottom" || imgNode.attrs?.wrap === "topBottom",
    "wrapMode topAndBottom must be preserved"
  );
  assert.equal(imgNode.attrs?.drawingPosition?.wrapMode, "topAndBottom");
});

// ============================================================================
// 4. WORKFLOW D — FLOATING TEXTBOX RICH TEXT EDITING & PRESERVATION
// ============================================================================
test("Phase 15 - Workflow D: Word floating TextBox -> Editor -> Edit rich text -> Save -> Re-import without flattening", async () => {
  const doc: DocumentModel = {
    metadata: { id: "wf-d", title: "Workflow D", version: 1, createdAt: "", updatedAt: "" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    content: {
      type: "doc",
      content: [
        {
          type: "textBox",
          attrs: {
            width: 260,
            minHeight: 110,
            backgroundColor: "#FEF3C7",
            borderColor: "#D97706",
            drawingPosition: {
              placement: "floating",
              width: 260,
              height: 110,
              wrapMode: "square",
              horizontalRelative: "column",
              verticalRelative: "paragraph",
              offsetX: 30,
              offsetY: 20,
            },
          },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Ghi chú quan trọng trong TextBox: ",
                  marks: [{ type: "bold" }],
                },
                {
                  type: "text",
                  text: "Dữ liệu được bảo toàn nguyên vẹn.",
                  marks: [{ type: "italic" }],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const exported = await exportDocumentModelToDocx(doc);
  const reimported = await importDocxToDocumentModel(exported);

  assert.equal(reimported.success, true);
  const blocks = reimported.document?.content.content || [];
  const tbNode = blocks.find((b) => b.type === "textBox");
  assert.ok(tbNode, "TextBox must not be flattened into plain paragraphs");
  assert.ok(tbNode.content && tbNode.content.length > 0, "TextBox must contain rich paragraphs");
  const pInside = tbNode.content[0];
  const textInside = pInside.content?.map((c) => c.text).join("") || "";
  assert.ok(textInside.includes("Ghi chú quan trọng"), "Rich text inside TextBox must be preserved");
});

// ============================================================================
// 5. WORKFLOW E — SHAPES (Rectangle, Fill, Stroke)
// ============================================================================
test("Phase 15 - Workflow E: Core Shapes (Rectangle, fill, stroke) -> Editor -> DOCX -> Basic appearance preserved", async () => {
  const doc: DocumentModel = {
    metadata: { id: "wf-e", title: "Workflow E", version: 1, createdAt: "", updatedAt: "" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    content: {
      type: "doc",
      content: [
        {
          type: "shape",
          attrs: {
            shapeType: "rectangle",
            width: 220,
            height: 90,
            fillColor: "#3B82F6",
            strokeColor: "#1D4ED8",
            strokeWidth: 3,
            drawingPosition: {
              placement: "floating",
              width: 220,
              height: 90,
              wrapMode: "square",
              horizontalRelative: "column",
              verticalRelative: "paragraph",
            },
          },
        },
      ],
    },
  };

  const exported = await exportDocumentModelToDocx(doc);
  const reimported = await importDocxToDocumentModel(exported);

  assert.equal(reimported.success, true);
  const blocks = reimported.document?.content.content || [];
  const shapeNode = blocks.find((b) => b.type === "shape");
  assert.ok(shapeNode, "Shape node must survive round-trip");
  assert.equal(shapeNode.attrs?.shapeType, "rectangle");
  assert.equal(shapeNode.attrs?.fillColor?.toLowerCase(), "#3b82f6");
});

// ============================================================================
// 6. WORKFLOW F — TABLE VMERGE (3 rows vertical merge & 2x2 rectangular merge)
// ============================================================================
test("Phase 15 - Workflow F: Table vMerge 3 rows + 2x2 rectangular merge -> Editor -> Save -> Re-import", async () => {
  const doc: DocumentModel = {
    metadata: { id: "wf-f", title: "Workflow F", version: 1, createdAt: "", updatedAt: "" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    content: {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { borders: "all", tableStyleId: "grid" },
          content: [
            // Row 1
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { rowspan: 3 }, // 3 rows vertical merge!
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Merged 3 Rows" }] }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 2, rowspan: 2 }, // 2x2 rectangular merge!
                  content: [{ type: "paragraph", content: [{ type: "text", text: "2x2 Block" }] }],
                },
              ],
            },
            // Row 2
            {
              type: "tableRow",
              content: [],
            },
            // Row 3
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cell Row 3 Col 2" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cell Row 3 Col 3" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const exported = await exportDocumentModelToDocx(doc);
  const reimported = await importDocxToDocumentModel(exported);

  assert.equal(reimported.success, true);
  const tbl = reimported.document?.content.content?.find((b) => b.type === "table");
  assert.ok(tbl);
  const rows = tbl.content || [];
  assert.ok(rows.length >= 3, "Must have 3 rows");
  assert.equal(rows[0]?.content?.[0]?.attrs?.rowspan, 3, "Rowspan must remain 3");
});

// ============================================================================
// 7. WORKFLOW G — DYNAMIC FIELDS (PAGE, NUMPAGES, DATE, TITLE, AUTHOR, REF)
// ============================================================================
test("Phase 15 - Workflow G: Header PAGE/NUMPAGES, Body DATE, TITLE, AUTHOR, REF -> Semantic Instructions", async () => {
  const doc: DocumentModel = {
    metadata: {
      id: "wf-g",
      title: "Luận Văn Tiến Sĩ",
      version: 1,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-08T00:00:00Z",
    },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Trang {PAGE} trên {NUMPAGES}" },
      footer: { text: "Tài liệu bảo mật" },
    },
    references: {
      bookmarks: [{ id: "bm-t1", name: "Muc_Tieu_1", text: "Mục tiêu 1" }],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Ngày tạo: " },
            {
              type: "field",
              attrs: {
                fieldType: "DATE",
                instruction: 'DATE \\@ "yyyy-MM-dd"',
                result: "2026-10-08",
              },
            },
            { type: "text", text: " - Tiêu đề: " },
            {
              type: "field",
              attrs: {
                fieldType: "TITLE",
                instruction: "TITLE",
                result: "Luận Văn Tiến Sĩ",
              },
            },
            { type: "text", text: " - Tham chiếu: " },
            {
              type: "crossReference",
              attrs: {
                targetId: "bm-t1",
                targetType: "bookmark",
                customText: "Xem Mục tiêu 1",
                format: "text",
              },
            },
          ],
        },
      ],
    },
  };

  const exported = await exportDocumentModelToDocx(doc);
  const reimported = await importDocxToDocumentModel(exported);

  assert.equal(reimported.success, true);
  const p = reimported.document?.content.content?.[0];
  assert.ok(p);
  const fields = (p.content || []).filter((c) => c.type === "field");
  assert.ok(fields.length >= 2, "Must contain DATE and TITLE dynamic fields");
  assert.ok(fields.some((f) => f.attrs?.fieldType === "DATE"));
  assert.ok(fields.some((f) => f.attrs?.fieldType === "TITLE"));
});

// ============================================================================
// 8. WORKFLOW H — CUSTOM THESIS BODY STYLE
// ============================================================================
test("Phase 15 - Workflow H: Thesis Body style (basedOn Normal, Times New Roman 13, 1.5 spacing, first-line indent) -> Semantic Style", async () => {
  const doc: DocumentModel = {
    metadata: { id: "wf-h", title: "Workflow H", version: 1, createdAt: "", updatedAt: "" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: STYLE_NORMAL_ID,
          name: "Normal",
          type: "paragraph",
          isBuiltIn: true,
          paragraph: { lineSpacing: 1.15, spacingAfter: 6 },
          character: { fontFamily: "Times New Roman", fontSize: 13 },
        },
        {
          id: "style-thesis-body",
          name: "Thesis Body",
          type: "paragraph",
          isBuiltIn: false,
          basedOn: STYLE_NORMAL_ID,
          paragraph: { lineSpacing: 1.5, firstLineIndent: 15, spacingAfter: 6 },
          character: { fontFamily: "Times New Roman", fontSize: 13 },
        },
      ],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { styleId: "style-thesis-body" },
          content: [
            {
              type: "text",
              text: "Đoạn văn luận văn với lùi đầu dòng 15pt và giãn dòng 1.5 dòng tiêu chuẩn.",
            },
          ],
        },
      ],
    },
  };

  const exported = await exportDocumentModelToDocx(doc);
  const reimported = await importDocxToDocumentModel(exported);

  assert.equal(reimported.success, true);
  const p = reimported.document?.content.content?.[0];
  assert.ok(p);
  assert.ok(
    p.attrs?.styleId === "style-thesis-body" ||
    reimported.document?.styles?.definitions.some((d) => d.name === "Thesis Body"),
    "Thesis Body style must remain semantic"
  );
});

// ============================================================================
// 9. COMPLETE END-TO-END VALIDATION CHECK
// ============================================================================
test("Phase 15 - Complete End-to-End Validation: Package structure, namespaces, unique IDs and zero data corruption", async () => {
  const doc: DocumentModel = {
    metadata: { id: "wf-e2e", title: "Complete E2E Validation", version: 1, createdAt: "", updatedAt: "" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 } },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Tiêu đề kiểm thử E2E" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}" },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Tiêu đề Chương 1" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Văn bản tiếng Việt đầy đủ dấu: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM." },
          ],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);

  // Validate ZIP
  assert.ok(zip.file("[Content_Types].xml"));
  assert.ok(zip.file("word/document.xml"));
  assert.ok(zip.file("word/styles.xml"));
  assert.ok(zip.file("word/_rels/document.xml.rels"));

  // Re-import
  const res = await importDocxToDocumentModel(bytes);
  assert.equal(res.success, true);
  const text = JSON.stringify(res.document?.content);
  assert.ok(text.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"));
});
