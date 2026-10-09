import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  exportDocumentModelToDocx,
  buildDocxPackage,
  DocumentSerializer,
  buildStylesXml,
  buildNumberingXml,
  buildSectPrXml,
  buildHeaderFooterXml,
  importDocxToDocumentModel,
} from "./index.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";
import { serializeDocumentToMwd, deserializeMwdToDocument } from "../document/documentFile.ts";

// 1x1 Sample PNG Data URL
const SAMPLE_BASE64_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function createBaseDocument(): DocumentModel {
  return {
    metadata: {
      id: "doc-test-1",
      title: "Tài liệu kiểm thử DOCX Export",
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
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Header Kiểm Thử - Trang {PAGE}", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center" },
          content: [{ type: "text", text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              text: "Độc lập - Tự do - Hạnh phúc",
              marks: [{ type: "bold" }, { type: "italic" }],
            },
          ],
        },
      ],
    },
  };
}

test("DOCX Export 1: Package structure contains all mandatory OOXML parts", async () => {
  const doc = createBaseDocument();
  const bytes = await exportDocumentModelToDocx(doc);

  assert.ok(bytes instanceof Uint8Array, "Export must return a Uint8Array");
  assert.ok(bytes.length > 500, "Package size must be non-trivial");

  // Kiểm tra ZIP header (PK\x03\x04)
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);

  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("[Content_Types].xml"), "Must contain [Content_Types].xml");
  assert.ok(zip.file("_rels/.rels"), "Must contain _rels/.rels");
  assert.ok(zip.file("word/document.xml"), "Must contain word/document.xml");
  assert.ok(zip.file("word/styles.xml"), "Must contain word/styles.xml");
  assert.ok(zip.file("word/numbering.xml"), "Must contain word/numbering.xml");
  assert.ok(zip.file("word/_rels/document.xml.rels"), "Must contain word/_rels/document.xml.rels");
});

test("DOCX Export 2: Basic text, Vietnamese Unicode and Heading 1, 2, 3", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Tiêu đề cấp 1: Xin chào thế giới" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Tiêu đề cấp 2: Khảo sát & Đánh giá" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Tiêu đề cấp 3: Chi tiết kỹ thuật" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Đoạn văn chứa ký tự đặc biệt: <tag> & \"quotes\" 'single' và tiếng Việt có dấu: Ắ, Ằ, Ể, Ố, Ự.",
            },
          ],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes('w:val="Heading1"'), "Must contain Heading1 style reference");
  assert.ok(docXml.includes('w:val="Heading2"'), "Must contain Heading2 style reference");
  assert.ok(docXml.includes('w:val="Heading3"'), "Must contain Heading3 style reference");
  assert.ok(docXml.includes("Tiêu đề cấp 1: Xin chào thế giới"), "Must preserve Vietnamese unicode in Heading 1");
  assert.ok(docXml.includes("&lt;tag&gt; &amp;"), "Must escape XML special characters");
  assert.ok(docXml.includes("Ắ, Ằ, Ể, Ố, Ự"), "Must preserve complex Vietnamese characters");
});

test("DOCX Export 3: Run formatting (Bold, Italic, Underline, Strike, Font, Size, Color, Highlight)", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Chữ đậm",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: " và chữ nghiêng",
              marks: [{ type: "italic" }],
            },
            {
              type: "text",
              text: " và gạch chân",
              marks: [{ type: "underline" }],
            },
            {
              type: "text",
              text: " và gạch ngang",
              marks: [{ type: "strike" }],
            },
            {
              type: "text",
              text: " font Times New Roman 16pt màu đỏ",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    fontFamily: "Times New Roman",
                    fontSize: "16pt",
                    color: "#E11D48",
                  },
                },
              ],
            },
            {
              type: "text",
              text: " highlight vàng",
              marks: [{ type: "highlight", attrs: { color: "yellow" } }],
            },
          ],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes("<w:b/>"), "Must contain bold element");
  assert.ok(docXml.includes("<w:i/>"), "Must contain italic element");
  assert.ok(docXml.includes('<w:u w:val="single"/>'), "Must contain underline element");
  assert.ok(docXml.includes("<w:strike/>"), "Must contain strikethrough element");
  assert.ok(docXml.includes('w:ascii="Times New Roman"'), "Must contain font family Times New Roman");
  assert.ok(docXml.includes('w:sz w:val="32"'), "16pt must convert to 32 half-points");
  assert.ok(docXml.includes('w:color w:val="E11D48"'), "Color must convert to hex E11D48");
  assert.ok(docXml.includes('w:highlight w:val="yellow"'), "Highlight must convert to word highlight yellow");
});

test("DOCX Export 4: Paragraph formatting (Alignment, Indent, Line Spacing)", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center", lineSpacing: 1.5 },
          content: [{ type: "text", text: "Căn giữa giãn dòng 1.5" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "right" },
          content: [{ type: "text", text: "Căn phải" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "justify", indent: 2 },
          content: [{ type: "text", text: "Căn đều hai bên và thụt lề 2 cấp" }],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes('<w:jc w:val="center"/>'), "Must support center alignment");
  assert.ok(docXml.includes('<w:jc w:val="right"/>'), "Must support right alignment");
  assert.ok(docXml.includes('<w:jc w:val="both"/>'), "Justify must map to w:jc w:val=both");
  assert.ok(docXml.includes('w:spacing w:line="360"'), "1.5 line spacing must convert to 360");
  assert.ok(docXml.includes('w:ind w:left="1440"'), "Indent level 2 must convert to 1440 twips");
});

test("DOCX Export 5: Bullet lists, numbered lists and nested lists", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    content: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bullet cấp 0 - Mục 1" }],
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Bullet con cấp 1" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bullet cấp 0 - Mục 2" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Số thứ tự 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Số thứ tự 2" }],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const numXml = await zip.file("word/numbering.xml")!.async("string");

  // word/document.xml phải chứa numPr
  assert.ok(docXml.includes('<w:numId w:val="1"/>'), "Bullet list items must use numId=1");
  assert.ok(docXml.includes('<w:numId w:val="2"/>'), "Ordered list items must use numId=2");
  assert.ok(docXml.includes('<w:ilvl w:val="0"/>'), "Root list items must have ilvl=0");
  assert.ok(docXml.includes('<w:ilvl w:val="1"/>'), "Nested list item must have ilvl=1");

  // word/numbering.xml phải có abstractNum 1 và 2
  assert.ok(numXml.includes('w:abstractNumId="1"'), "numbering.xml must define abstractNum 1");
  assert.ok(numXml.includes('w:abstractNumId="2"'), "numbering.xml must define abstractNum 2");
  assert.ok(numXml.includes('w:numFmt w:val="bullet"'), "abstractNum 1 must be bullet format");
  assert.ok(numXml.includes('w:numFmt w:val="decimal"'), "abstractNum 2 must be decimal format");
});

test("DOCX Export 6: Hyperlinks mapping to OOXML relationships and elements", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Truy cập " },
            {
              type: "text",
              text: "Google Website",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://www.google.com" },
                },
              ],
            },
            { type: "text", text: " để tìm kiếm." },
          ],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");

  assert.ok(docXml.includes("<w:hyperlink"), "document.xml must contain w:hyperlink tag");
  assert.ok(docXml.includes("Google Website"), "Must contain hyperlink display text");
  assert.ok(relsXml.includes('Target="https://www.google.com"'), "rels must contain target URL");
  assert.ok(relsXml.includes('TargetMode="External"'), "Hyperlink relationship must have TargetMode=External");
});

test("DOCX Export 7: Tables with header row, cell background, colwidth, colspan", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    content: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colwidth: [120], backgroundColor: "#1e40af" },
                  content: [
                    {
                      type: "paragraph",
                      attrs: { textAlign: "center" },
                      content: [{ type: "text", text: "Tiêu đề cột 1", marks: [{ type: "bold" }] }],
                    },
                  ],
                },
                {
                  type: "tableHeader",
                  attrs: { colwidth: [240], colspan: 2 },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cột gộp (colspan=2)" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { verticalAlign: "middle" },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Dữ liệu hàng 1" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Ô 2" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Ô 3" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes("<w:tbl>"), "Must contain w:tbl");
  assert.ok(docXml.includes("<w:tblHeader/>"), "Header row must contain w:tblHeader");
  assert.ok(docXml.includes('w:tcW w:w="1800"'), "120px colwidth must convert to 1800 twips (120*15)");
  assert.ok(docXml.includes('<w:gridSpan w:val="2"/>'), "Colspan 2 must emit w:gridSpan val=2");
  assert.ok(docXml.includes('w:shd w:val="clear" w:color="auto" w:fill="1E40AF"'), "Shading must emit fill 1E40AF");
  assert.ok(docXml.includes('<w:vAlign w:val="center"/>'), "Vertical align middle must map to center");
});

test("DOCX Export 8: Images (Base64 data URL exported to word/media/* and self-contained DrawingML)", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trước hình ảnh" }],
        },
        {
          type: "image",
          attrs: {
            src: SAMPLE_BASE64_PNG,
            alt: "Hình minh họa 1",
            width: 300,
            height: 150,
            alignment: "center",
          },
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");
  const mediaFile = zip.file("word/media/image1.png");

  assert.ok(mediaFile, "word/media/image1.png must exist in package");
  const mediaBytes = await mediaFile.async("uint8array");
  assert.ok(mediaBytes.length > 0, "Media binary must not be empty");

  assert.ok(docXml.includes("<w:drawing>"), "Must contain w:drawing element");
  assert.ok(docXml.includes('<wp:extent cx="2857500" cy="1428750"/>'), "Extent EMU must match 300px * 9525, 150px * 9525");
  assert.ok(docXml.includes('descr="Hình minh họa 1"'), "Must include alt description in DrawingML");
  assert.ok(relsXml.includes('Target="media/image1.png"'), "rels must point to media/image1.png");
});

test("DOCX Export 9: Page settings (Paper size, Orientation, Margins in twips)", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    pageSettings: {
      paperSize: "Letter",
      orientation: "landscape",
      margins: { top: 20, bottom: 20, left: 30, right: 30 },
      marginPreset: "Custom",
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Letter landscape: portrait is 12240 x 15840 -> landscape: w=15840, h=12240
  assert.ok(docXml.includes('w:w="15840" w:h="12240"'), "Letter landscape dimensions must be 15840x12240");
  assert.ok(docXml.includes('w:orient="landscape"'), "Must have orient=landscape attribute");
  // 20mm ≈ 1134 twips, 30mm ≈ 1701 twips
  assert.ok(docXml.includes('w:top="1134"'), "20mm top margin must convert to 1134 twips");
  assert.ok(docXml.includes('w:left="1701"'), "30mm left margin must convert to 1701 twips");
});

test("DOCX Export 10: Page breaks & Multi-section breaks with distinct orientations", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trang 1 Section 1 Portrait" }],
        },
        {
          type: "pageBreak",
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trang 2 Section 1 Portrait" }],
        },
        {
          type: "sectionBreak",
          attrs: {
            sectionType: "nextPage",
            pageSettings: {
              paperSize: "A4",
              orientation: "landscape",
              margins: { top: 20, bottom: 20, left: 20, right: 20 },
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trang 3 Section 2 Landscape" }],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra pageBreak
  assert.ok(docXml.includes('<w:br w:type="page"/>'), "Must contain page break br tag");

  // Kiểm tra 2 khối sectPr: Section 1 Portrait và Section 2 Landscape
  const sectPrOccurrences = docXml.split("<w:sectPr>").length - 1;
  assert.equal(sectPrOccurrences, 2, "Document must have exactly 2 sectPr blocks");

  // Section 1 Portrait: 11906 x 16838
  assert.ok(docXml.includes('w:w="11906" w:h="16838"'), "Section 1 must be A4 Portrait");
  // Section 2 Landscape: 16838 x 11906 với orient=landscape
  assert.ok(docXml.includes('w:w="16838" w:h="11906" w:orient="landscape"'), "Section 2 must be A4 Landscape");
});

test("DOCX Export 11: Header and Footer with dynamic {PAGE} and {NUMPAGES} fields", async () => {
  const doc: DocumentModel = {
    ...createBaseDocument(),
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Công ty ABC - Báo cáo thường niên", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");

  assert.ok(docXml.includes("<w:headerReference"), "document.xml must contain headerReference");
  assert.ok(docXml.includes("<w:footerReference"), "document.xml must contain footerReference");

  const headerFile = zip.file("word/header1.xml");
  const footerFile = zip.file("word/footer1.xml");

  assert.ok(headerFile, "Must generate word/header1.xml");
  assert.ok(footerFile, "Must generate word/footer1.xml");

  const headerXml = await headerFile.async("string");
  const footerXml = await footerFile.async("string");

  assert.ok(headerXml.includes("Công ty ABC - Báo cáo thường niên"), "Header XML must contain text");
  assert.ok(headerXml.includes('<w:jc w:val="right"/>'), "Header alignment must be right");

  // Footer phải chứa trường động fldSimple PAGE và NUMPAGES thay vì số literal tĩnh
  assert.ok(footerXml.includes('<w:fldSimple w:instr="PAGE"'), "Footer must have dynamic PAGE field");
  assert.ok(footerXml.includes('<w:fldSimple w:instr="NUMPAGES"'), "Footer must have dynamic NUMPAGES field");
  assert.ok(footerXml.includes('<w:jc w:val="center"/>'), "Footer alignment must be center");
});

test("DOCX Export 12: Empty or minimal DocumentModel exports safely", async () => {
  const minimalDoc: DocumentModel = {
    metadata: {
      id: "min-doc",
      title: "Trống",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    },
    content: {
      type: "doc",
      content: [],
    },
  };

  const bytes = await exportDocumentModelToDocx(minimalDoc);
  assert.ok(bytes.length > 0, "Minimal doc export should not fail");

  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");
  assert.ok(docXml.includes("<w:body>"), "Must have w:body");
});

test("DOCX Export 13: Full Round-Trip (DocumentModel -> DOCX Export -> DOCX Import -> Verification)", async () => {
  // Tạo tài liệu toàn diện với tất cả tính năng của Personal Word Editor
  const richDoc: DocumentModel = {
    metadata: {
      id: "roundtrip-doc-1",
      title: "Kiểm thử Round-Trip Toàn Diện",
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
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Tiêu đề đầu trang {PAGE}", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center" },
          content: [{ type: "text", text: "HỆ THỐNG BIÊN TẬP TÀI LIỆU WORD CÁ NHÂN" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "left", lineSpacing: 1.5 },
          content: [
            {
              type: "text",
              text: "Đoạn văn có chữ đậm",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: ", chữ nghiêng",
              marks: [{ type: "italic" }],
            },
            {
              type: "text",
              text: " và liên kết ",
            },
            {
              type: "text",
              text: "GitHub",
              marks: [{ type: "link", attrs: { href: "https://github.com" } }],
            },
            {
              type: "text",
              text: ".",
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Danh sách gạch đầu dòng 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Danh sách gạch đầu dòng 2" }],
                },
              ],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cột A" }],
                    },
                  ],
                },
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Cột B" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Dữ liệu 1" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Dữ liệu 2" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            src: SAMPLE_BASE64_PNG,
            alt: "Ảnh logo",
            width: 200,
            height: 100,
            alignment: "center",
          },
        },
        {
          type: "pageBreak",
        },
        {
          type: "sectionBreak",
          attrs: {
            sectionType: "nextPage",
            pageSettings: {
              paperSize: "A4",
              orientation: "landscape",
              margins: { top: 20, bottom: 20, left: 20, right: 20 },
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung phần 2 nằm ở hướng ngang (Landscape)" }],
        },
      ],
    },
  };

  // 1. Export DocumentModel -> DOCX
  const exportedDocxBytes = await exportDocumentModelToDocx(richDoc);
  assert.ok(exportedDocxBytes.length > 0, "Exported bytes must not be empty");

  // 2. Import DOCX -> DocumentModel
  const importResult = await importDocxToDocumentModel(exportedDocxBytes, "roundtrip.docx");
  assert.equal(importResult.success, true, "DOCX Import must succeed on exported file");

  const importedDoc = importResult.document;
  assert.ok(importedDoc, "Imported document must exist");

  // 3. Kiểm tra tính toàn vẹn ngữ nghĩa (Semantic Equivalence)
  // Page Settings Section 1
  assert.equal(importedDoc.pageSettings.paperSize, "A4");
  assert.equal(importedDoc.pageSettings.orientation, "portrait");

  // Header & Footer
  assert.ok(importedDoc.headerFooter?.header?.text.includes("Tiêu đề đầu trang {PAGE}"));
  assert.ok(importedDoc.headerFooter?.footer?.text.includes("{PAGE}"));
  assert.ok(importedDoc.headerFooter?.footer?.text.includes("{NUMPAGES}"));

  // Nội dung AST
  const blocks = importedDoc.content.content || [];
  assert.ok(blocks.length >= 5, "Imported AST must contain all major blocks");

  // Heading 1
  const h1 = blocks.find((b) => b.type === "heading" && b.attrs?.level === 1);
  assert.ok(h1, "Heading 1 must be preserved");
  assert.equal(h1.content?.[0]?.text, "HỆ THỐNG BIÊN TẬP TÀI LIỆU WORD CÁ NHÂN");

  // Paragraph & formatting
  const p1 = blocks.find((b) => b.type === "paragraph" && b.content?.some((c) => c.text?.includes("Đoạn văn có chữ đậm")));
  assert.ok(p1, "Formatted paragraph must exist");
  const boldText = p1.content?.find((c) => c.text === "Đoạn văn có chữ đậm");
  assert.ok(boldText?.marks?.some((m) => m.type === "bold"), "Bold mark must be preserved");

  // Hyperlink
  const linkText = p1.content?.find((c) => c.marks?.some((m) => m.type === "link"));
  assert.ok(linkText, "Hyperlink must be preserved");
  assert.equal(linkText.marks?.find((m) => m.type === "link")?.attrs?.href, "https://github.com");

  // Bullet list
  const bulletList = blocks.find((b) => b.type === "bulletList");
  assert.ok(bulletList, "Bullet list must be preserved");
  assert.ok(bulletList.content && bulletList.content.length >= 2, "Bullet list must have 2 items");

  // Table
  const table = blocks.find((b) => b.type === "table");
  assert.ok(table, "Table must be preserved");
  assert.equal(table.content?.length, 2, "Table must have 2 rows");

  // Image
  const image = blocks.find((b) => b.type === "image" || (b.type === "paragraph" && b.content?.some((c) => c.type === "image")));
  assert.ok(image, "Image must be preserved");

  // Section break
  const sectionBreak = blocks.find((b) => b.type === "sectionBreak");
  assert.ok(sectionBreak, "Section break must be preserved");
  assert.equal(sectionBreak.attrs?.pageSettings?.orientation, "landscape", "Section 2 landscape orientation must be preserved");
});

test("DOCX Export 14: Regression check - .mwd format serialization remains intact", () => {
  const doc = createBaseDocument();
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  assert.equal(deserialized.document.metadata.title, doc.metadata.title);
  assert.equal(deserialized.document.pageSettings.paperSize, "A4");
});
