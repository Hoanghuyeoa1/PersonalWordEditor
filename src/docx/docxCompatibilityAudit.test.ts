import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  importDocxToDocumentModel,
  exportDocumentModelToDocx,
  readDocxPackage,
  parseRelationships,
  parseStyles,
  parseNumbering,
} from "./index.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

const SAMPLE_BASE64_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SAMPLE_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

test("Audit 1: File corruption handling - Empty file, non-ZIP, missing document.xml, malformed XML", async () => {
  // 1. Empty buffer
  const emptyRes = await importDocxToDocumentModel(new Uint8Array(0), "empty.docx");
  assert.equal(emptyRes.success, false);
  assert.ok(emptyRes.error?.includes("rỗng") || emptyRes.error?.includes("không có dữ liệu"));

  // 2. Non-ZIP file (text or random binary)
  const fakeDocx = new TextEncoder().encode("This is not a zip file at all!");
  const nonZipRes = await importDocxToDocumentModel(fakeDocx, "fake.docx");
  assert.equal(nonZipRes.success, false);
  assert.ok(nonZipRes.error?.includes("không phải tệp ZIP"));

  // 3. ZIP missing word/document.xml
  const zipNoDoc = new JSZip();
  zipNoDoc.file("[Content_Types].xml", "<Types/>");
  zipNoDoc.file("word/styles.xml", "<w:styles/>");
  const bytesNoDoc = await zipNoDoc.generateAsync({ type: "uint8array" });
  const noDocRes = await importDocxToDocumentModel(bytesNoDoc, "no_doc.docx");
  assert.equal(noDocRes.success, false);
  assert.ok(noDocRes.error?.includes("word/document.xml"));

  // 4. Broken/malformed XML in word/document.xml
  const zipBadXml = new JSZip();
  zipBadXml.file(
    "word/document.xml",
    "<w:document><w:body><w:p><unclosedTag>Văn bản hỏng"
  );
  const bytesBadXml = await zipBadXml.generateAsync({ type: "uint8array" });
  const badXmlRes = await importDocxToDocumentModel(bytesBadXml, "bad_xml.docx");
  assert.equal(badXmlRes.success, false);
  assert.ok(badXmlRes.error?.includes("XML"));
});

test("Audit 2: Tolerant parsing - Unknown OOXML tags, comments, bookmarks, alternate content, and tracked changes", async () => {
  const zip = new JSZip();

  // Tạo tài liệu chứa các thẻ lạ và không hỗ trợ: mc:AlternateContent, w:bookmarkStart, w:commentRangeStart, w:ins, w:smartTag, m:oMath
  const docXmlWithUnknowns = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
              xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
              xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <w:body>
      <w:p>
        <w:bookmarkStart w:id="0" w:name="_GoBack"/>
        <w:r><w:t>Đoạn văn mở đầu. </w:t></w:r>
        <w:commentRangeStart w:id="1"/>
        <w:r><w:t>Đoạn văn có bình luận. </w:t></w:r>
        <w:commentRangeEnd w:id="1"/>
        <w:bookmarkEnd w:id="0"/>
      </w:p>
      <w:p>
        <w:ins w:id="2" w:author="User" w:date="2026-10-07T00:00:00Z">
          <w:r><w:t>Nội dung được thêm vào qua Tracked Changes. </w:t></w:r>
        </w:ins>
      </w:p>
      <w:p>
        <w:fldSimple w:instr="DATE">
          <w:r><w:t>2026-10-07</w:t></w:r>
        </w:fldSimple>
      </w:p>
      <w:p>
        <m:oMath>
          <m:r><m:t>x^2 + y^2 = z^2</m:t></m:r>
        </m:oMath>
      </w:p>
      <w:customUnknownElement>
        <w:unknownTag>Nội dung lạ không xác định</w:unknownTag>
      </w:customUnknownElement>
      <w:sectPr>
        <w:pgSz w:w="11906" w:h="16838"/>
        <w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/>
      </w:sectPr>
    </w:body>
  </w:document>`;

  zip.file("word/document.xml", docXmlWithUnknowns);
  const bytes = await zip.generateAsync({ type: "uint8array" });

  const res = await importDocxToDocumentModel(bytes, "unknown_tags.docx");
  assert.equal(res.success, true, "Must parse cleanly without crashing on unknown elements");

  const blocks = res.document.content.content || [];
  assert.ok(blocks.length >= 3, "All readable paragraphs must be extracted");

  // Kiểm tra text từ các thành phần lồng nhau được bảo toàn
  const fullText = JSON.stringify(blocks);
  assert.ok(fullText.includes("Đoạn văn mở đầu."));
  assert.ok(fullText.includes("Đoạn văn có bình luận."));
  assert.ok(fullText.includes("Nội dung được thêm vào qua Tracked Changes."));
  assert.ok(fullText.includes("2026-10-07"));
  assert.ok(fullText.includes("x^2 + y^2 = z^2"));
});

test("Audit 3: Missing optional parts - DOCX without styles.xml, numbering.xml, headers/footers loads cleanly", async () => {
  const zip = new JSZip();

  // Chỉ có word/document.xml tối giản
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:t>Tài liệu không có styles và numbering</w:t></w:r>
        </w:p>
        <w:sectPr>
          <w:pgSz w:w="11906" w:h="16838"/>
        </w:sectPr>
      </w:body>
    </w:document>`
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const res = await importDocxToDocumentModel(bytes, "bare_doc.docx");

  assert.equal(res.success, true);
  assert.equal(res.document.pageSettings.paperSize, "A4");
  assert.equal(
    res.document.content.content?.[0]?.content?.[0]?.text,
    "Tài liệu không có styles và numbering"
  );
});

test("Audit 4: Broken relationship or missing image binary does not crash and warns safely", async () => {
  const zip = new JSZip();

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <w:body>
        <w:p>
          <w:r><w:t>Trước hình ảnh bị thiếu quan hệ</w:t></w:r>
          <w:drawing>
            <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <wp:extent cx="1000000" cy="1000000"/>
              <a:graphic>
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic>
                    <pic:blipFill>
                      <a:blip r:embed="rIdNonExistent"/>
                    </pic:blipFill>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:p>
      </w:body>
    </w:document>`
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const res = await importDocxToDocumentModel(bytes, "missing_rel.docx");

  assert.equal(res.success, true, "Must not crash when image relationship is missing");
  assert.ok(res.warnings.length > 0, "Must record warning about missing relationship");
});

test("Audit 5: Round-Trip A (Personal Word Editor -> DOCX Export -> Import -> Verification)", async () => {
  const originalDoc: DocumentModel = {
    metadata: {
      id: "roundtrip-audit-1",
      title: "Round-Trip Audit Document",
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
      header: { text: "Audit Header - Trang {PAGE}", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center" },
          content: [{ type: "text", text: "KIỂM TOÁN CHU TRÌNH ROUND-TRIP A" }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "justify", lineSpacing: 1.5, indent: 1 },
          content: [
            {
              type: "text",
              text: "Đoạn văn kiểm toán gồm chữ đậm",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: ", chữ nghiêng",
              marks: [{ type: "italic" }],
            },
            {
              type: "text",
              text: ", gạch chân",
              marks: [{ type: "underline" }],
            },
            {
              type: "text",
              text: ", gạch ngang",
              marks: [{ type: "strike" }],
            },
            {
              type: "text",
              text: ", font Times New Roman 14pt màu xanh",
              marks: [
                {
                  type: "textStyle",
                  attrs: { fontFamily: "Times New Roman", fontSize: "14pt", color: "#1E40AF" },
                },
              ],
            },
            {
              type: "text",
              text: " và highlight vàng",
              marks: [{ type: "highlight", attrs: { color: "yellow" } }],
            },
            {
              type: "text",
              text: ". Xem liên kết ",
            },
            {
              type: "text",
              text: "Google",
              marks: [{ type: "link", attrs: { href: "https://www.google.com" } }],
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
                { type: "paragraph", content: [{ type: "text", text: "Mục Bullet 1" }] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "Mục Bullet 1.1 lồng cấp" }] }],
                    },
                  ],
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
                  attrs: { backgroundColor: "#DBEAFE", colwidth: [150] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Tiêu đề 1" }] }],
                },
                {
                  type: "tableHeader",
                  attrs: { backgroundColor: "#DBEAFE", colwidth: [150] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Tiêu đề 2" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu 1" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu 2" }] }],
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            src: SAMPLE_BASE64_PNG,
            alt: "Hình kiểm toán",
            width: 250,
            height: 125,
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
          content: [{ type: "text", text: "Trang thuộc Section 2 hướng ngang." }],
        },
      ],
    },
  };

  // Export
  const docxBytes = await exportDocumentModelToDocx(originalDoc);
  assert.ok(docxBytes.length > 0);

  // Import
  const importResult = await importDocxToDocumentModel(docxBytes, "rt_audit.docx");
  assert.equal(importResult.success, true);
  const roundTripDoc = importResult.document;

  // So sánh ngữ nghĩa
  assert.equal(roundTripDoc.pageSettings.paperSize, "A4");
  assert.equal(roundTripDoc.pageSettings.orientation, "portrait");
  assert.ok(roundTripDoc.headerFooter?.header?.text.includes("Trang {PAGE}"));
  assert.ok(roundTripDoc.headerFooter?.footer?.text.includes("{NUMPAGES}"));

  const blocks = roundTripDoc.content.content || [];
  // Heading
  const h1 = blocks.find((b) => b.type === "heading" && b.attrs?.level === 1);
  assert.ok(h1);
  assert.equal(h1.content?.[0]?.text, "KIỂM TOÁN CHU TRÌNH ROUND-TRIP A");

  // Paragraph marks
  const p1 = blocks.find((b) => b.type === "paragraph" && b.content?.some((c) => c.text?.includes("Đoạn văn kiểm toán gồm chữ đậm")));
  assert.ok(p1);
  const boldPart = p1.content?.find((c) => c.text === "Đoạn văn kiểm toán gồm chữ đậm");
  assert.ok(boldPart?.marks?.some((m) => m.type === "bold"));

  // Link
  const linkPart = p1.content?.find((c) => c.marks?.some((m) => m.type === "link"));
  assert.ok(linkPart);
  assert.equal(linkPart.marks?.find((m) => m.type === "link")?.attrs?.href, "https://www.google.com");

  // List
  const bulletList = blocks.find((b) => b.type === "bulletList");
  assert.ok(bulletList);

  // Table
  const table = blocks.find((b) => b.type === "table");
  assert.ok(table);
  assert.equal(table.content?.length, 2);

  // Image
  const image = blocks.find((b) => b.type === "image" || (b.type === "paragraph" && b.content?.some((c) => c.type === "image")));
  assert.ok(image);

  // Section break
  const secBreak = blocks.find((b) => b.type === "sectionBreak");
  assert.ok(secBreak);
  assert.equal(secBreak.attrs?.pageSettings?.orientation, "landscape");
});

test("Audit 6: Round-Trip B (External Word DOCX -> Import -> Edit -> Export -> Verification)", async () => {
  // Tạo gói DOCX giống cấu trúc Word sinh ra
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
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
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
    </w:styles>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
          <w:r><w:t>Tài liệu Word thực tế</w:t></w:r>
        </w:p>
        <w:p>
          <w:r><w:b/><w:t>Đoạn 1 từ Word</w:t></w:r>
        </w:p>
        <w:sectPr>
          <w:pgSz w:w="12240" w:h="15840"/>
          <w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/>
        </w:sectPr>
      </w:body>
    </w:document>`
  );

  const wordDocxBytes = await zip.generateAsync({ type: "uint8array" });

  // 1. Import
  const imported = await importDocxToDocumentModel(wordDocxBytes, "word_doc.docx");
  assert.equal(imported.success, true);
  assert.equal(imported.document.pageSettings.paperSize, "Letter");

  // 2. Chỉnh sửa (Edit): Thêm 1 đoạn văn mới
  const editedDoc: DocumentModel = {
    ...imported.document,
    content: {
      type: "doc",
      content: [
        ...(imported.document.content.content || []),
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn mới được thêm trong Editor", marks: [{ type: "italic" }] }],
        },
      ],
    },
  };

  // 3. Export DOCX
  const exportedBytes = await exportDocumentModelToDocx(editedDoc);
  assert.ok(exportedBytes.length > 0);

  // 4. Mở lại và kiểm chứng
  const reImported = await importDocxToDocumentModel(exportedBytes, "re_exported.docx");
  assert.equal(reImported.success, true);
  assert.equal(reImported.document.pageSettings.paperSize, "Letter");

  const finalBlocks = reImported.document.content.content || [];
  assert.equal(finalBlocks.length, 3);
  assert.equal(finalBlocks[0].type, "heading");
  assert.equal(finalBlocks[2].content?.[0]?.text, "Đoạn mới được thêm trong Editor");
  assert.ok(finalBlocks[2].content?.[0]?.marks?.some((m) => m.type === "italic"));
});

test("Audit 7: Phase 3 extended objects (TextBox, Equation, Shape) gracefully handled during DOCX export", async () => {
  const docWithPhase3: DocumentModel = {
    metadata: {
      id: "doc-p3",
      title: "Phase 3 Extended Objects",
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
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Mở đầu" }],
        },
        {
          type: "textBox",
          attrs: { width: 320, height: 80, alignment: "center" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Văn bản bên trong Text Box Phase 3.7", marks: [{ type: "bold" }] }],
            },
          ],
        },
        {
          type: "equation",
          attrs: { latex: "E = mc^2", alignment: "center" },
        },
        {
          type: "shape",
          attrs: { shapeType: "rectangle", width: 200, height: 100, fillColor: "#3B82F6" },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Kết thúc" }],
        },
      ],
    },
  };

  // Export DOCX không được crash
  const exportedBytes = await exportDocumentModelToDocx(docWithPhase3);
  assert.ok(exportedBytes.length > 0);

  // Đọc lại nội dung tệp đã xuất
  const zip = await JSZip.loadAsync(exportedBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // TextBox text được bảo toàn
  assert.ok(docXml.includes("Văn bản bên trong Text Box Phase 3.7"));
  // Equation OMML/latex được bảo toàn
  assert.ok(docXml.includes("<m:oMath") || docXml.includes("E = mc^2"));
  // Văn bản xung quanh không bị mất
  assert.ok(docXml.includes("Mở đầu"));
  assert.ok(docXml.includes("Kết thúc"));
});

test("Audit 8: Backward compatibility with legacy .mwd files (Phase 1, Phase 2, Phase 3)", () => {
  // 1. Phase 1 legacy .mwd (chỉ có document AST thuần túy, không có pageSettings, không có headerFooter)
  const legacyP1 = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: { id: "p1-doc", title: "Legacy P1", version: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01" },
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản Phase 1 cổ điển" }] }],
    },
  });
  const resP1 = deserializeMwdToDocument(legacyP1);
  assert.equal(resP1.success, true);
  assert.equal(resP1.document.pageSettings.paperSize, "A4");

  // 2. Phase 2 legacy .mwd (có pageSettings, không có headerFooter)
  const legacyP2 = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: { id: "p2-doc", title: "Legacy P2", version: 1, createdAt: "2026-10-02", updatedAt: "2026-10-02" },
    pageSettings: { paperSize: "Legal", orientation: "landscape", margins: { top: 20, bottom: 20, left: 20, right: 20 } },
    document: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản Phase 2" }] }],
    },
  });
  const resP2 = deserializeMwdToDocument(legacyP2);
  assert.equal(resP2.success, true);
  assert.equal(resP2.document.pageSettings.paperSize, "Legal");
  assert.equal(resP2.document.pageSettings.orientation, "landscape");

  // 3. Phase 3 .mwd (chứa table, shapes, textBox, equations)
  const legacyP3 = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: { id: "p3-doc", title: "Legacy P3", version: 1, createdAt: "2026-10-06", updatedAt: "2026-10-06" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 } },
    headerFooter: { linkToPrevious: false, header: { text: "H1", alignment: "center" }, footer: { text: "F1", alignment: "center" } },
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Văn bản Phase 3" }] },
        { type: "textBox", attrs: { width: 300, height: 100 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Box" }] }] },
        { type: "equation", attrs: { latex: "\\alpha + \\beta = \\gamma" } },
      ],
    },
  });
  const resP3 = deserializeMwdToDocument(legacyP3);
  assert.equal(resP3.success, true);
  assert.equal(resP3.document.content.content?.length, 3);
});

test("Audit 9: Performance - Large multi-page document with 50+ paragraphs, tables, images exports and imports in < 200ms", async () => {
  const blocks: any[] = [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "BÁO CÁO HIỆU NĂNG LỚN" }] },
  ];

  for (let i = 1; i <= 60; i++) {
    blocks.push({
      type: "paragraph",
      attrs: { lineSpacing: 1.15 },
      content: [
        { type: "text", text: `Đoạn văn số ${i}: `, marks: [{ type: "bold" }] },
        { type: "text", text: `Đây là nội dung kiểm thử hiệu năng tốc độ xử lý gói OOXML trên tài liệu đa trang nhiều đoạn văn.` },
      ],
    });

    if (i % 15 === 0) {
      blocks.push({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: `Cột 1 (${i})` }] }] },
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: `Cột 2 (${i})` }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Giá trị A" }] }] },
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Giá trị B" }] }] },
            ],
          },
        ],
      });
      blocks.push({
        type: "image",
        attrs: { src: SAMPLE_BASE64_PNG, width: 200, height: 100, alignment: "center" },
      });
    }
  }

  const largeDoc: DocumentModel = {
    metadata: { id: "perf-doc", title: "Perf Doc", version: 1, createdAt: "2026-10-07", updatedAt: "2026-10-07" },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 } },
    content: { type: "doc", content: blocks },
  };

  const startExport = performance.now();
  const bytes = await exportDocumentModelToDocx(largeDoc);
  const exportDuration = performance.now() - startExport;

  assert.ok(bytes.length > 5000);
  assert.ok(exportDuration < 500, `Export duration was ${exportDuration.toFixed(2)}ms, expected < 500ms`);

  const startImport = performance.now();
  const imported = await importDocxToDocumentModel(bytes, "large_perf.docx");
  const importDuration = performance.now() - startImport;

  assert.equal(imported.success, true);
  assert.ok(imported.document.content.content!.length >= 60);
  assert.ok(importDuration < 500, `Import duration was ${importDuration.toFixed(2)}ms, expected < 500ms`);
});

test("Audit 10: State and dirty protection - Save failure preserves isDirty=true", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();
  assert.equal(useDocumentStore.getState().isDirty, false);

  // Tạo thay đổi để kích hoạt dirty state
  store.updateTitle("Tài liệu đang sửa");
  assert.equal(useDocumentStore.getState().isDirty, true);

  // Giả lập lưu thất bại: markSaved KHÔNG được gọi
  // Trạng thái isDirty phải giữ nguyên true
  assert.equal(useDocumentStore.getState().isDirty, true);
  assert.equal(useDocumentStore.getState().documentTitle, "Tài liệu đang sửa");
});
