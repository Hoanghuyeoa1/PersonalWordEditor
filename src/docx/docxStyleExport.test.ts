import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  exportDocumentModelToDocx,
  importDocxToDocumentModel,
  readDocxPackage,
  parseStyles,
  buildStylesXml,
  DocumentSerializer,
  buildStyleExportMapping,
  sanitizeToXmlNcName,
} from "./index.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import type { DocumentStylesMetadata, DocumentStyle } from "../styles/types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
} from "../styles/services/builtInStyles.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";

/**
 * Tiện ích tạo DocumentModel cơ bản phục vụ test
 */
function createTestDocument(overrides?: Partial<DocumentModel>): DocumentModel {
  return {
    id: "doc-test-export-phase9",
    title: "Test Phase 9 DOCX Export",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { styleId: STYLE_NORMAL_ID },
          content: [{ type: "text", text: "Nội dung đoạn văn mặc định." }],
        },
      ],
    },
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: STYLE_NORMAL_ID,
          name: "Normal",
          type: "paragraph",
          isBuiltIn: true,
          paragraph: { lineSpacing: 1.15, spacingAfter: 8 },
          character: { fontFamily: "Calibri", fontSize: 11 },
        },
        {
          id: STYLE_HEADING_1_ID,
          name: "Heading 1",
          type: "paragraph",
          isBuiltIn: true,
          basedOn: STYLE_NORMAL_ID,
          paragraph: { lineSpacing: 1.15, spacingBefore: 12, spacingAfter: 6, headingLevel: 1 },
          character: { bold: true, fontSize: 16, color: "#1E40AF" },
        },
      ],
    },
    ...overrides,
  };
}

/* ==========================================================================
   BỘ TEST CHUYÊN BIỆT: PHASE 9 — DOCX STYLE EXPORT + ROUND-TRIP
   ========================================================================== */

test("Phase 9 - 1. buildStylesXml generates semantic paragraph style definitions", () => {
  const stylesMetadata: DocumentStylesMetadata = {
    defaultParagraphStyleId: STYLE_NORMAL_ID,
    definitions: [
      {
        id: STYLE_NORMAL_ID,
        name: "Normal",
        type: "paragraph",
        isBuiltIn: true,
        paragraph: { lineSpacing: 1.25, spacingAfter: 10 },
        character: { fontFamily: "Times New Roman", fontSize: 12 },
      },
      {
        id: "style_quote_custom",
        name: "Custom Quote",
        type: "paragraph",
        isBuiltIn: false,
        basedOn: STYLE_NORMAL_ID,
        paragraph: {
          textAlign: "center",
          lineSpacing: 1.5,
          spacingBefore: 12,
          spacingAfter: 12,
          leftIndent: 24,
          rightIndent: 24,
        },
        character: {
          italic: true,
          color: "#475569",
          fontSize: 11,
        },
      },
    ],
  };

  const xml = buildStylesXml(stylesMetadata);
  assert.ok(xml.includes('w:styleId="Normal"'), "Phải có Normal style");
  assert.ok(xml.includes('w:styleId="CustomQuote"'), "Phải có CustomQuote style");
  assert.ok(xml.includes('<w:name w:val="Custom Quote"/>'), "Phải có tên Custom Quote");
  assert.ok(xml.includes('<w:basedOn w:val="Normal"/>'), "Phải dựa trên Normal");
  assert.ok(xml.includes('<w:jc w:val="center"/>'), "Phải có căn giữa");
  assert.ok(xml.includes('w:before="240"'), "12pt spacingBefore = 240 twips");
  assert.ok(xml.includes('w:after="240"'), "12pt spacingAfter = 240 twips");
  assert.ok(xml.includes('w:left="480"'), "24pt leftIndent = 480 twips");
  assert.ok(xml.includes('w:right="480"'), "24pt rightIndent = 480 twips");
  assert.ok(xml.includes("<w:i/>"), "Phải có định dạng nghiêng");
  assert.ok(xml.includes('w:color w:val="475569"'), "Phải có màu #475569");
});

test("Phase 9 - 2. buildStylesXml generates semantic character style definitions", () => {
  const stylesMetadata: DocumentStylesMetadata = {
    defaultParagraphStyleId: STYLE_NORMAL_ID,
    definitions: [
      {
        id: "style_code_snippet",
        name: "Code Snippet",
        type: "character",
        isBuiltIn: false,
        character: {
          fontFamily: "Consolas",
          fontSize: 10,
          bold: true,
          color: "#BE185D",
          highlight: "#FEF08A",
        },
      },
    ],
  };

  const xml = buildStylesXml(stylesMetadata);
  assert.ok(xml.includes('<w:style w:type="character" w:styleId="CodeSnippet">'), "Phải có character style CodeSnippet");
  assert.ok(xml.includes('<w:name w:val="Code Snippet"/>'), "Tên style phải là Code Snippet");
  assert.ok(xml.includes('<w:basedOn w:val="DefaultParagraphFont"/>'), "Character style mặc định basedOn DefaultParagraphFont");
  assert.ok(xml.includes('w:ascii="Consolas"'), "Phông chữ Consolas");
  assert.ok(xml.includes('<w:b/>'), "Chữ đậm");
  assert.ok(xml.includes('w:val="20"'), "10pt = 20 half-points");
  assert.ok(xml.includes('w:color w:val="BE185D"'), "Màu chữ BE185D");
  assert.ok(xml.includes('<w:highlight w:val="yellow"/>'), "Màu highlight vàng");
});

test("Phase 9 - 3. Multi-level basedOn inheritance in styles.xml", () => {
  const stylesMetadata: DocumentStylesMetadata = {
    defaultParagraphStyleId: STYLE_NORMAL_ID,
    definitions: [
      {
        id: "style_parent_block",
        name: "Parent Block",
        type: "paragraph",
        isBuiltIn: false,
        basedOn: STYLE_NORMAL_ID,
        paragraph: { spacingBefore: 10 },
      },
      {
        id: "style_child_block",
        name: "Child Block",
        type: "paragraph",
        isBuiltIn: false,
        basedOn: "style_parent_block",
        paragraph: { spacingAfter: 15 },
      },
    ],
  };

  const xml = buildStylesXml(stylesMetadata);
  assert.ok(xml.includes('<w:style w:type="paragraph" w:styleId="ParentBlock">'));
  assert.ok(xml.includes('<w:style w:type="paragraph" w:styleId="ChildBlock">'));
  assert.ok(xml.includes('<w:basedOn w:val="ParentBlock"/>'), "ChildBlock phải basedOn ParentBlock");
});

test("Phase 9 - 4. Paragraph style assignment emits w:pStyle", () => {
  const doc = createTestDocument({
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: "style_callout",
          name: "Callout",
          type: "paragraph",
          isBuiltIn: false,
          paragraph: { leftIndent: 20 },
        },
      ],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { styleId: "style_callout" },
          content: [{ type: "text", text: "Khối Callout văn bản." }],
        },
      ],
    },
  });

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);

  assert.ok(
    serialized.documentXml.includes('<w:pStyle w:val="Callout"/>'),
    "Paragraph phải phát ra w:pStyle w:val='Callout'"
  );
  assert.ok(
    serialized.documentXml.includes("Khối Callout văn bản."),
    "Nội dung văn bản phải được bảo toàn"
  );
});

test("Phase 9 - 5. Character style assignment emits w:rStyle", () => {
  const doc = createTestDocument({
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: "style_lead_kw",
          name: "Lead Keyword",
          type: "character",
          isBuiltIn: false,
          character: { bold: true, color: "#1D4ED8" },
        },
      ],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Văn bản chứa " },
            {
              type: "text",
              text: "từ khóa nổi bật",
              marks: [{ type: "characterStyle", attrs: { styleId: "style_lead_kw" } }],
            },
            { type: "text", text: " trong câu." },
          ],
        },
      ],
    },
  });

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);

  assert.ok(
    serialized.documentXml.includes('<w:rStyle w:val="LeadKeyword"/>'),
    "Run mang mark characterStyle phải phát ra w:rStyle w:val='LeadKeyword'"
  );
  assert.ok(
    serialized.documentXml.includes("từ khóa nổi bật"),
    "Nội dung run phải được bảo toàn"
  );
});

test("Phase 9 - 6. Direct overrides coexist with semantic styles and retain precedence", () => {
  const doc = createTestDocument({
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: "style_report_p",
          name: "Report Paragraph",
          type: "paragraph",
          isBuiltIn: false,
          paragraph: { textAlign: "left", spacingAfter: 6 },
        },
        {
          id: "style_tag",
          name: "Tag Style",
          type: "character",
          isBuiltIn: false,
          character: { italic: true },
        },
      ],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            styleId: "style_report_p",
            textAlign: "right", // Direct override
            spacingAfter: 18,   // Direct override
          },
          content: [
            {
              type: "text",
              text: "Văn bản override",
              marks: [
                { type: "characterStyle", attrs: { styleId: "style_tag" } },
                { type: "bold" }, // Direct override
                { type: "underline" }, // Direct override
              ],
            },
          ],
        },
      ],
    },
  });

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);

  // Paragraph kiểm tra: có cả w:pStyle và direct overrides
  assert.ok(serialized.documentXml.includes('<w:pStyle w:val="ReportParagraph"/>'));
  assert.ok(serialized.documentXml.includes('<w:jc w:val="right"/>'), "Direct align override phải có trong pPr");
  assert.ok(serialized.documentXml.includes('w:after="360"'), "18pt direct override = 360 twips");

  // Run kiểm tra: có cả w:rStyle và direct marks (bold, underline)
  assert.ok(serialized.documentXml.includes('<w:rStyle w:val="TagStyle"/>'));
  assert.ok(serialized.documentXml.includes("<w:b/>"), "Direct bold override phải có");
  assert.ok(serialized.documentXml.includes('<w:u w:val="single"/>'), "Direct underline override phải có");

  // Thứ tự OOXML: w:rStyle phải đứng trước các thuộc tính direct trong rPr
  const rPrIndex = serialized.documentXml.indexOf("<w:rPr>");
  const rStyleIndex = serialized.documentXml.indexOf('<w:rStyle w:val="TagStyle"/>');
  const bIndex = serialized.documentXml.indexOf("<w:b/>");
  assert.ok(rPrIndex < rStyleIndex && rStyleIndex < bIndex, "w:rStyle phải xuất hiện đầu tiên trong w:rPr");
});

test("Phase 9 - 7. Semantic Headings preserve genuine Heading mapping", () => {
  const doc = createTestDocument({
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, styleId: STYLE_HEADING_1_ID },
          content: [{ type: "text", text: "Tiêu đề cấp 1" }],
        },
        {
          type: "heading",
          attrs: { level: 2, styleId: STYLE_HEADING_2_ID },
          content: [{ type: "text", text: "Tiêu đề cấp 2" }],
        },
        {
          type: "heading",
          attrs: { level: 3, styleId: STYLE_HEADING_3_ID },
          content: [{ type: "text", text: "Tiêu đề cấp 3" }],
        },
      ],
    },
  });

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);

  assert.ok(serialized.documentXml.includes('<w:pStyle w:val="Heading1"/>'));
  assert.ok(serialized.documentXml.includes('<w:pStyle w:val="Heading2"/>'));
  assert.ok(serialized.documentXml.includes('<w:pStyle w:val="Heading3"/>'));
});

test("Phase 9 - 8. Spacing and Indents unit conversion (pt -> twips)", () => {
  const doc = createTestDocument({
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            spacingBefore: 14,     // 14 * 20 = 280 twips
            spacingAfter: 21,      // 21 * 20 = 420 twips
            leftIndent: 36,        // 36 * 20 = 720 twips
            rightIndent: 18,       // 18 * 20 = 360 twips
            firstLineIndent: 10,   // 10 * 20 = 200 twips
            hangingIndent: 5,      // 5 * 20 = 100 twips
          },
          content: [{ type: "text", text: "Kiểm tra đơn vị twips." }],
        },
      ],
    },
  });

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize(doc);

  assert.ok(serialized.documentXml.includes('w:before="280"'), "14pt -> 280 twips");
  assert.ok(serialized.documentXml.includes('w:after="420"'), "21pt -> 420 twips");
  assert.ok(serialized.documentXml.includes('w:left="720"'), "36pt -> 720 twips");
  assert.ok(serialized.documentXml.includes('w:right="360"'), "18pt -> 360 twips");
  assert.ok(serialized.documentXml.includes('w:firstLine="200"'), "10pt -> 200 twips");
  assert.ok(serialized.documentXml.includes('w:hanging="100"'), "5pt -> 100 twips");
});

test("Phase 9 - 9. XML-safe IDs and collision resolution with duplicate names", () => {
  // Test hàm sanitizeToXmlNcName độc lập
  assert.equal(sanitizeToXmlNcName("Đoạn trích dẫn đặc biệt"), "DoanTrichDanDacBiet");
  assert.equal(sanitizeToXmlNcName("123 Heading"), "Style_123Heading");
  assert.equal(sanitizeToXmlNcName("My-Custom.Style!"), "MyCustomStyle");
  assert.equal(sanitizeToXmlNcName(""), "CustomStyle");

  // Test collision resolution với 2 style có cùng tên
  const stylesMetadata: DocumentStylesMetadata = {
    defaultParagraphStyleId: STYLE_NORMAL_ID,
    definitions: [
      {
        id: "style_quote_1",
        name: "Quote Box",
        type: "paragraph",
        isBuiltIn: false,
      },
      {
        id: "style_quote_2",
        name: "Quote Box", // Trùng tên hiển thị
        type: "paragraph",
        isBuiltIn: false,
      },
      {
        id: "style_fake_normal",
        name: "Normal", // Trùng tên với built-in
        type: "paragraph",
        isBuiltIn: false,
      },
    ],
  };

  const mapping = buildStyleExportMapping(stylesMetadata);
  const wordId1 = mapping.internalToWordId.get("style_quote_1");
  const wordId2 = mapping.internalToWordId.get("style_quote_2");
  const fakeNormalWordId = mapping.internalToWordId.get("style_fake_normal");

  assert.equal(wordId1, "QuoteBox");
  assert.equal(wordId2, "QuoteBox_2", "Style trùng tên phải có suffix khử trùng lặp");
  assert.notEqual(fakeNormalWordId, "Normal", "Không được trùng lặp với built-in Normal đã bảo lưu");
  assert.equal(fakeNormalWordId, "Normal_2");
});

test("Phase 9 - 10. Complete Round-trip: Editor -> DOCX -> Editor", async () => {
  const initialDoc = createTestDocument({
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: STYLE_NORMAL_ID,
          name: "Normal",
          type: "paragraph",
          isBuiltIn: true,
          paragraph: { lineSpacing: 1.15, spacingAfter: 8 },
          character: { fontFamily: "Calibri", fontSize: 11 },
        },
        {
          id: STYLE_HEADING_1_ID,
          name: "Heading 1",
          type: "paragraph",
          isBuiltIn: true,
          basedOn: STYLE_NORMAL_ID,
          paragraph: { lineSpacing: 1.15, spacingBefore: 12, spacingAfter: 6, headingLevel: 1 },
          character: { bold: true, fontSize: 16, color: "#1E40AF" },
        },
        {
          id: "style_custom_thesis",
          name: "Thesis Abstract",
          type: "paragraph",
          isBuiltIn: false,
          basedOn: STYLE_NORMAL_ID,
          paragraph: {
            textAlign: "justify",
            spacingBefore: 14,
            spacingAfter: 14,
            leftIndent: 36,
            rightIndent: 36,
          },
          character: {
            fontFamily: "Georgia",
            fontSize: 10.5,
            italic: true,
          },
        },
        {
          id: "style_custom_badge",
          name: "Badge Text",
          type: "character",
          isBuiltIn: false,
          character: {
            bold: true,
            color: "#059669",
            highlight: "#D1FAE5",
          },
        },
      ],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, styleId: STYLE_HEADING_1_ID },
          content: [{ type: "text", text: "Chương I: Tổng quan" }],
        },
        {
          type: "paragraph",
          attrs: { styleId: "style_custom_thesis" },
          content: [
            { type: "text", text: "Đây là tóm tắt luận văn có gắn " },
            {
              type: "text",
              text: "nhãn phân loại",
              marks: [{ type: "characterStyle", attrs: { styleId: "style_custom_badge" } }],
            },
            { type: "text", text: " rất quan trọng." },
          ],
        },
      ],
    },
  });

  // 1. Xuất DOCX binary
  const docxBytes = await exportDocumentModelToDocx(initialDoc);
  assert.ok(docxBytes && docxBytes.byteLength > 0, "DOCX bytes phải tồn tại");

  // 2. Nhập lại vào DocumentModel
  const importResult = await importDocxToDocumentModel(docxBytes, "roundtrip.docx");
  assert.ok(importResult.success, "Nhập DOCX phải thành công");
  if (!importResult.success) return;

  const importedDoc = importResult.document;

  // 3. Kiểm tra bảo toàn Style Definitions
  assert.ok(importedDoc.styles, "Styles metadata phải được nạp");
  const importedDefs = importedDoc.styles!.definitions;

  // Tìm style paragraph tùy biến
  const importedThesis = importedDefs.find(
    (s) => s.name.toLowerCase().includes("thesis abstract") || s.id.includes("thesis")
  );
  assert.ok(importedThesis, "Style Thesis Abstract phải được bảo toàn trong definitions");
  assert.equal(importedThesis!.type, "paragraph");
  assert.equal(importedThesis!.paragraph?.textAlign, "justify");
  assert.equal(importedThesis!.paragraph?.spacingBefore, 14);
  assert.equal(importedThesis!.paragraph?.spacingAfter, 14);
  assert.equal(importedThesis!.paragraph?.leftIndent, 36);
  assert.equal(importedThesis!.paragraph?.rightIndent, 36);
  assert.equal(importedThesis!.character?.italic, true);

  // Tìm style character tùy biến
  const importedBadge = importedDefs.find(
    (s) => s.name.toLowerCase().includes("badge text") || s.id.includes("badge")
  );
  assert.ok(importedBadge, "Style Badge Text phải được bảo toàn trong definitions");
  assert.equal(importedBadge!.type, "character");
  assert.equal(importedBadge!.character?.bold, true);
  assert.equal(importedBadge!.character?.color, "#059669");

  // 4. Kiểm tra bảo toàn Paragraph & Character assignments trên cây AST
  const blocks = importedDoc.content.content || [];
  assert.equal(blocks.length, 2);

  // Block 1: Heading 1
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].attrs?.level, 1);
  assert.equal(blocks[0].attrs?.styleId, STYLE_HEADING_1_ID);

  // Block 2: Paragraph sử dụng Thesis style
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(blocks[1].attrs?.styleId, importedThesis!.id, "Block phải gán đúng ID của imported Thesis style");

  // Run trong Block 2: có mark characterStyle trỏ tới Badge style
  const runs = blocks[1].content || [];
  const badgeRun = runs.find((r) => r.text === "nhãn phân loại");
  assert.ok(badgeRun, "Phải tìm thấy run 'nhãn phân loại'");
  const charMark = badgeRun!.marks?.find((m) => m.type === "characterStyle");
  assert.ok(charMark, "Run phải mang mark characterStyle");
  assert.equal(charMark!.attrs?.styleId, importedBadge!.id, "Mark characterStyle phải trỏ đúng imported Badge style ID");
});

test("Phase 9 - 11. Word Fixture -> Editor -> Modify Style -> DOCX -> Parse Again", async () => {
  // Tạo fixture Word thủ công
  const wordStylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ImportantNotice">
    <w:name w:val="Important Notice"/>
    <w:pPr>
      <w:jc w:val="center"/>
      <w:spacing w:before="160" w:after="160"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="DC2626"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const wordDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="ImportantNotice"/></w:pPr>
      <w:r><w:t>Lưu ý quan trọng từ Word fixture.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/document.xml", wordDocXml);
  zip.file("word/styles.xml", wordStylesXml);
  const fixtureBytes = await zip.generateAsync({ type: "uint8array" });

  // 1. Nhập Word fixture vào Editor
  const imported1 = await importDocxToDocumentModel(fixtureBytes, "fixture.docx");
  assert.ok(imported1.success);
  if (!imported1.success) return;

  const doc = imported1.document;
  const noticeStyle = doc.styles!.definitions.find((s) => s.name.toLowerCase().includes("important notice"));
  assert.ok(noticeStyle, "Phải tìm thấy Important Notice style sau khi import");

  // 2. Sửa style trong Editor (đổi màu thành xanh lá, thêm gạch chân và tăng khoảng cách)
  noticeStyle!.character = {
    ...noticeStyle!.character,
    color: "#16A34A",
    underline: true,
  };
  noticeStyle!.paragraph = {
    ...noticeStyle!.paragraph,
    spacingBefore: 24, // 24 * 20 = 480 twips
  };

  // 3. Xuất ra DOCX mới
  const exportedBytes = await exportDocumentModelToDocx(doc);
  assert.ok(exportedBytes.byteLength > 0);

  // 4. Đọc gói DOCX vừa xuất để kiểm tra trực tiếp styles.xml
  const parts = await readDocxPackage(exportedBytes);
  assert.ok(parts.stylesXml, "Phải có stylesXml trong gói DOCX");
  assert.ok(parts.stylesXml!.includes('w:color w:val="16A34A"'), "Styles.xml phải phản ánh màu đã sửa #16A34A");
  assert.ok(parts.stylesXml!.includes('<w:u w:val="single"/>'), "Styles.xml phải có underline");
  assert.ok(parts.stylesXml!.includes('w:before="480"'), "Styles.xml phải có 24pt = 480 twips");

  // 5. Parse lại qua importDocxToDocumentModel
  const imported2 = await importDocxToDocumentModel(exportedBytes, "reparsed.docx");
  assert.ok(imported2.success);
  if (!imported2.success) return;

  const reloadedNotice = imported2.document.styles!.definitions.find(
    (s) => s.name.toLowerCase().includes("important notice")
  );
  assert.ok(reloadedNotice, "Phải tìm lại được Important Notice style sau vòng round-trip");
  assert.equal(reloadedNotice!.character?.color, "#16A34A");
  assert.equal(reloadedNotice!.character?.underline, true);
  assert.equal(reloadedNotice!.paragraph?.spacingBefore, 24);
});

test("Phase 9 - 12. Fallback safely when document has missing or empty styles metadata", async () => {
  const docWithoutStyles: DocumentModel = {
    id: "doc-empty-styles",
    title: "Document Without Styles",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản không có khối styles." }],
        },
      ],
    },
  };

  // Xuất DOCX không được crash
  const bytes = await exportDocumentModelToDocx(docWithoutStyles);
  assert.ok(bytes && bytes.byteLength > 0);

  // Kiểm tra styles.xml sinh ra có chứa Normal và các default built-in
  const parts = await readDocxPackage(bytes);
  assert.ok(parts.stylesXml);
  assert.ok(parts.stylesXml!.includes('w:styleId="Normal"'));
  assert.ok(parts.stylesXml!.includes('w:styleId="Heading1"'));
});

test("Phase 9 - 13. Zero Regression: Existing DOCX features (tables, images, lists, breaks) export flawlessly", async () => {
  const richDoc = createTestDocument({
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, styleId: STYLE_HEADING_1_ID },
          content: [{ type: "text", text: "Báo cáo thử nghiệm" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục danh sách 1" }],
                },
              ],
            },
          ],
        },
        {
          type: "table",
          attrs: { borders: "all" },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cột 1" }] }],
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Ô 1" }] }],
                },
              ],
            },
          ],
        },
        {
          type: "caption",
          attrs: { label: "Figure", text: "Mô tả hình ảnh" },
        },
        {
          type: "pageBreak",
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Đoạn có chú thích cuối trang" },
            {
              type: "noteReference",
              attrs: { noteId: "fn-1", noteType: "footnote", content: "Nội dung footnote." },
            },
          ],
        },
      ],
    },
    comments: [
      {
        id: "com-1",
        author: "Hoang",
        createdAt: "2026-10-07T12:00:00Z",
        content: "Bình luận thử nghiệm.",
        resolved: false,
      },
    ],
  });

  const bytes = await exportDocumentModelToDocx(richDoc);
  assert.ok(bytes && bytes.byteLength > 0);

  const parts = await readDocxPackage(bytes);
  assert.ok(parts.documentXml, "Phải có documentXml");
  assert.ok(parts.stylesXml, "Phải có stylesXml");
  assert.ok(parts.commentsXml, "Phải có commentsXml");
  assert.ok(parts.footnotesXml, "Phải có footnotesXml");
  assert.ok(parts.documentXml!.includes("<w:tbl>"), "Bảng phải tồn tại trong documentXml");
  assert.ok(parts.documentXml!.includes('<w:pStyle w:val="Caption"/>'), "Caption style phải tồn tại");
  assert.ok(parts.documentXml!.includes('<w:br w:type="page"/>'), "Page break phải tồn tại");
});
