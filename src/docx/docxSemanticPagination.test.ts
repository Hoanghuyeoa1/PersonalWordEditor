import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  exportDocumentModelToDocx,
  importDocxToDocumentModel,
  DocumentSerializer,
  buildStylesXml,
  parseStyles,
} from "./index.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import type { DocumentStylesMetadata } from "../styles/types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
} from "../styles/services/builtInStyles.ts";

/**
 * Tạo một tệp .docx mẫu dạng buffer in-memory từ document.xml và styles.xml
 */
async function buildDocxZipBuffer(
  documentXml: string,
  stylesXml?: string
): Promise<Uint8Array> {
  const zip = new JSZip();

  // [Content_Types].xml
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

  // _rels/.rels
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );

  // word/_rels/document.xml.rels
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`
  );

  zip.file("word/document.xml", documentXml);

  if (stylesXml) {
    zip.file("word/styles.xml", stylesXml);
  } else {
    zip.file(
      "word/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
          <w:name w:val="Normal"/>
          <w:pPr>
            <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
          </w:pPr>
        </w:style>
      </w:styles>`
    );
  }

  return zip.generateAsync({ type: "uint8array" });
}

/* ==========================================================================
   BỘ KIỂM THỬ CHUYÊN BIỆT: PHASE 13 — DOCX SEMANTIC PAGINATION MAPPING
   ========================================================================== */

test("Phase 13 - 1. keepNext import & export round-trip", async () => {
  // 1. Import OOXML w:keepNext
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:keepNext/></w:pPr>
          <w:r><w:t>Đoạn văn 1 với keepNext</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:keepNext w:val="0"/></w:pPr>
          <w:r><w:t>Đoạn văn 2 tắt keepNext</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const buffer = await buildDocxZipBuffer(docXml);
  const importResult = await importDocxToDocumentModel(buffer, "test.docx");
  assert.equal(importResult.success, true);
  if (!importResult.success) return;

  const blocks = importResult.document.content.content || [];
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].attrs?.keepWithNext, true);
  assert.equal(blocks[1].attrs?.keepWithNext, false);

  // 2. Export lại sang DOCX
  const exportBytes = await exportDocumentModelToDocx(importResult.document);
  const zip = await JSZip.loadAsync(exportBytes);
  const exportedDocXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(exportedDocXml.includes("<w:keepNext/>"), "Export phải có <w:keepNext/> cho đoạn 1");
  assert.ok(exportedDocXml.includes('<w:keepNext w:val="0"/>'), "Export phải có <w:keepNext w:val=\"0\"/> cho đoạn 2");
});

test("Phase 13 - 2. keepLines import & export round-trip", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:keepLines/></w:pPr>
          <w:r><w:t>Đoạn văn giữ liền dòng</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:keepLines w:val="false"/></w:pPr>
          <w:r><w:t>Đoạn văn không giữ liền dòng</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const buffer = await buildDocxZipBuffer(docXml);
  const res = await importDocxToDocumentModel(buffer, "test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const blocks = res.document.content.content || [];
  assert.equal(blocks[0].attrs?.keepLinesTogether, true);
  assert.equal(blocks[1].attrs?.keepLinesTogether, false);

  const exportBytes = await exportDocumentModelToDocx(res.document);
  const zip = await JSZip.loadAsync(exportBytes);
  const exportedDocXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(exportedDocXml.includes("<w:keepLines/>"), "Export phải có <w:keepLines/> cho đoạn 1");
  assert.ok(exportedDocXml.includes('<w:keepLines w:val="0"/>'), "Export phải có <w:keepLines w:val=\"0\"/> cho đoạn 2");
});

test("Phase 13 - 3. pageBreakBefore import & export preserves paragraph attribute without creating fake pageBreak node", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pageBreakBefore/></w:pPr>
          <w:r><w:t>Bắt đầu ở đầu trang mới</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const buffer = await buildDocxZipBuffer(docXml);
  const res = await importDocxToDocumentModel(buffer, "test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const blocks = res.document.content.content || [];
  // Phải chỉ có 1 node paragraph, KHÔNG được có node type "pageBreak" giả mạo chèn phía trước
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[0].attrs?.pageBreakBefore, true);

  // Khi export ra OOXML, thuộc tính phải nằm trong <w:pPr><w:pageBreakBefore/></w:pPr>
  const exportBytes = await exportDocumentModelToDocx(res.document);
  const zip = await JSZip.loadAsync(exportBytes);
  const exportedDocXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(exportedDocXml.includes("<w:pageBreakBefore/>"));
  // Không được chứa <w:br w:type="page"/> giả mạo
  assert.equal(exportedDocXml.includes('<w:br w:type="page"/>'), false);
});

test("Phase 13 - 4. widowControl import & export: toggle policy preserves on and off", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:widowControl w:val="0"/></w:pPr>
          <w:r><w:t>Đoạn văn tắt widowControl</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:widowControl/></w:pPr>
          <w:r><w:t>Đoạn văn bật widowControl</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const buffer = await buildDocxZipBuffer(docXml);
  const res = await importDocxToDocumentModel(buffer, "test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const blocks = res.document.content.content || [];
  assert.equal(blocks[0].attrs?.widowControl, false);
  assert.equal(blocks[1].attrs?.widowControl, true);

  const exportBytes = await exportDocumentModelToDocx(res.document);
  const zip = await JSZip.loadAsync(exportBytes);
  const exportedDocXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(exportedDocXml.includes('<w:widowControl w:val="0"/>'));
  assert.ok(exportedDocXml.includes("<w:widowControl/>"));
});

test("Phase 13 - 5. Style vs Direct property: inherits via Styles Engine without flattening", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
        <w:pPr><w:widowControl/></w:pPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="CustomNotice">
        <w:name w:val="Custom Notice"/>
        <w:basedOn w:val="Normal"/>
        <w:pPr>
          <w:keepNext/>
          <w:keepLines/>
          <w:pageBreakBefore/>
          <w:widowControl w:val="0"/>
        </w:pPr>
      </w:style>
    </w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <!-- Đoạn 1: Dùng CustomNotice style thuần túy (không có direct override) -->
        <w:p>
          <w:pPr><w:pStyle w:val="CustomNotice"/></w:pPr>
          <w:r><w:t>Đoạn văn dùng style thuần túy</w:t></w:r>
        </w:p>
        <!-- Đoạn 2: Dùng CustomNotice style nhưng override direct keepNext = false -->
        <w:p>
          <w:pPr>
            <w:pStyle w:val="CustomNotice"/>
            <w:keepNext w:val="0"/>
          </w:pPr>
          <w:r><w:t>Đoạn văn override keepNext</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const buffer = await buildDocxZipBuffer(docXml, stylesXml);
  const res = await importDocxToDocumentModel(buffer, "test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const defs = res.document.styles?.definitions || [];
  const noticeStyle = defs.find((d) => d.name === "Custom Notice");
  assert.ok(noticeStyle, "Style Custom Notice phải được map vào Styles Engine");
  assert.equal(noticeStyle?.paragraph?.keepWithNext, true);
  assert.equal(noticeStyle?.paragraph?.keepLinesTogether, true);
  assert.equal(noticeStyle?.paragraph?.pageBreakBefore, true);
  assert.equal(noticeStyle?.paragraph?.widowControl, false);

  const blocks = res.document.content.content || [];
  // Đoạn 1: Không được flatten thuộc tính vào paraAttrs, để Styles Engine xử lý kế thừa!
  assert.equal(blocks[0].attrs?.keepWithNext, undefined);
  assert.equal(blocks[0].attrs?.keepLinesTogether, undefined);
  assert.equal(blocks[0].attrs?.pageBreakBefore, undefined);
  assert.equal(blocks[0].attrs?.widowControl, undefined);

  // Đoạn 2: Ghi nhận đúng direct override keepWithNext = false
  assert.equal(blocks[1].attrs?.keepWithNext, false);
  // Các thuộc tính khác không override thì không bị flatten
  assert.equal(blocks[1].attrs?.keepLinesTogether, undefined);

  // Export lại sang DOCX:
  const exportBytes = await exportDocumentModelToDocx(res.document);
  const zip = await JSZip.loadAsync(exportBytes);
  const exportedStylesXml = await zip.file("word/styles.xml")!.async("string");
  const exportedDocXml = await zip.file("word/document.xml")!.async("string");

  // styles.xml phải chứa đầy đủ định nghĩa
  assert.ok(exportedStylesXml.includes("<w:keepNext/>"));
  assert.ok(exportedStylesXml.includes("<w:keepLines/>"));
  assert.ok(exportedStylesXml.includes("<w:pageBreakBefore/>"));
  assert.ok(exportedStylesXml.includes('<w:widowControl w:val="0"/>'));

  // document.xml: đoạn 2 có direct override
  assert.ok(exportedDocXml.includes('<w:keepNext w:val="0"/>'));
});

test("Phase 13 - 6. Explicit PageBreak node remains separate from paragraph pageBreakBefore", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:t>Đoạn 1 trước ngắt trang thủ công</w:t></w:r>
        </w:p>
        <w:p>
          <w:r><w:br w:type="page"/></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:pageBreakBefore/></w:pPr>
          <w:r><w:t>Đoạn 2 có thuộc tính pageBreakBefore</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const buffer = await buildDocxZipBuffer(docXml);
  const res = await importDocxToDocumentModel(buffer, "test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const blocks = res.document.content.content || [];
  // Phải có 1 node type "pageBreak" tường minh và 1 node paragraph có attrs.pageBreakBefore: true
  const pageBreakNode = blocks.find((b) => b.type === "pageBreak");
  assert.ok(pageBreakNode, "Explicit PageBreak node phải tồn tại");

  const p2Node = blocks.find((b) => b.attrs?.pageBreakBefore === true);
  assert.ok(p2Node, "Đoạn văn 2 có pageBreakBefore phải tồn tại");

  // Export lại: PageBreak node xuất ra <w:br w:type="page"/> còn paragraph xuất ra <w:pageBreakBefore/>
  const exportBytes = await exportDocumentModelToDocx(res.document);
  const zip = await JSZip.loadAsync(exportBytes);
  const exportedDocXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(exportedDocXml.includes('<w:br w:type="page"/>'), "PageBreak node phải ra <w:br w:type=\"page\"/>");
  assert.ok(exportedDocXml.includes("<w:pageBreakBefore/>"), "pageBreakBefore phải ra <w:pageBreakBefore/>");
});

test("Phase 13 - 7. DO NOT export runtime automatic pagination as explicit page breaks", async () => {
  // Tài liệu giả lập nhiều trang với các thuộc tính phân trang ngữ nghĩa
  const docModel: DocumentModel = {
    id: "doc-no-auto-breaks",
    title: "Document Without Runtime Breaks",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, keepWithNext: true, keepLinesTogether: true },
          content: [{ type: "text", text: "Chương 1: Mở đầu" }],
        },
        {
          type: "paragraph",
          attrs: { widowControl: true },
          content: [{ type: "text", text: "Đoạn văn dài trang 1..." }],
        },
        {
          type: "paragraph",
          attrs: { widowControl: true, keepLinesTogether: true },
          content: [{ type: "text", text: "Đoạn văn dài trang 2..." }],
        },
        {
          type: "paragraph",
          attrs: { widowControl: true },
          content: [{ type: "text", text: "Đoạn văn dài trang 3..." }],
        },
      ],
    },
    metadata: {
      title: "No Runtime Breaks",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  const exportBytes = await exportDocumentModelToDocx(docModel);
  const zip = await JSZip.loadAsync(exportBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Tuyệt đối không được chứa <w:br w:type="page"/> khi người dùng không chủ động chèn PageBreak!
  assert.equal(
    docXml.includes('<w:br w:type="page"/>'),
    false,
    "Automatic pagination KHÔNG được serialization thành explicit page breaks!"
  );

  // Các semantic properties phải có mặt trong docXml
  assert.ok(docXml.includes("<w:keepNext/>"));
  assert.ok(docXml.includes("<w:keepLines/>"));
  assert.ok(docXml.includes("<w:widowControl/>"));
});

test("Phase 13 - 8. Unknown / malformed OOXML values fallback safely without crash or text loss", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr>
            <w:keepNext w:val="invalid_nonsense"/>
            <w:keepLines w:val="random"/>
            <w:pageBreakBefore w:val="999"/>
            <w:unknownCustomOoxmlTag foo="bar"/>
          </w:pPr>
          <w:r><w:t>Văn bản với thuộc tính dị dạng vẫn an toàn</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const buffer = await buildDocxZipBuffer(docXml);
  const res = await importDocxToDocumentModel(buffer, "test.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const blocks = res.document.content.content || [];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].content?.[0]?.text, "Văn bản với thuộc tính dị dạng vẫn an toàn");
  // Các giá trị không phải false ("0", "false", "off") được fallback an toàn thành true theo quy chuẩn OOXML
  assert.equal(blocks[0].attrs?.keepWithNext, true);
  assert.equal(blocks[0].attrs?.keepLinesTogether, true);
  assert.equal(blocks[0].attrs?.pageBreakBefore, true);
});

test("Phase 13 - 9. Comprehensive Round-Trip: Word-like fixture preserves all 4 pagination properties across Import -> Export -> Import", async () => {
  const initialModel: DocumentModel = {
    id: "doc-comprehensive-roundtrip",
    title: "Comprehensive Round-Trip",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
            styleId: STYLE_HEADING_1_ID,
            keepWithNext: true,
            keepLinesTogether: true,
            pageBreakBefore: true,
            widowControl: true,
          },
          content: [{ type: "text", text: "Tiêu đề lớn sang trang mới" }],
        },
        {
          type: "paragraph",
          attrs: {
            styleId: STYLE_NORMAL_ID,
            keepWithNext: true,
            keepLinesTogether: false,
            pageBreakBefore: false,
            widowControl: true,
          },
          content: [{ type: "text", text: "Đoạn văn gắn với đoạn kế tiếp." }],
        },
        {
          type: "paragraph",
          attrs: {
            styleId: STYLE_NORMAL_ID,
            keepWithNext: false,
            keepLinesTogether: true,
            pageBreakBefore: false,
            widowControl: false,
          },
          content: [{ type: "text", text: "Đoạn văn không chia dòng và tắt widow control." }],
        },
      ],
    },
    metadata: {
      title: "Round Trip",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  // 1. Export sang DOCX bytes
  const bytes = await exportDocumentModelToDocx(initialModel);

  // 2. Import lại từ DOCX bytes
  const reimported = await importDocxToDocumentModel(bytes, "reimported.docx");
  assert.equal(reimported.success, true);
  if (!reimported.success) return;

  const blocks = reimported.document.content.content || [];
  assert.equal(blocks.length, 3);

  // Kiểm tra khối 1 (Heading 1)
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].attrs?.level, 1);
  assert.equal(blocks[0].attrs?.keepWithNext, true);
  assert.equal(blocks[0].attrs?.keepLinesTogether, true);
  assert.equal(blocks[0].attrs?.pageBreakBefore, true);
  assert.equal(blocks[0].attrs?.widowControl, true);

  // Kiểm tra khối 2 (Paragraph keepWithNext)
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(blocks[1].attrs?.keepWithNext, true);
  assert.equal(blocks[1].attrs?.keepLinesTogether, false);
  assert.equal(blocks[1].attrs?.widowControl, true);

  // Kiểm tra khối 3 (Paragraph keepLinesTogether, widowControl = false)
  assert.equal(blocks[2].type, "paragraph");
  assert.equal(blocks[2].attrs?.keepWithNext, false);
  assert.equal(blocks[2].attrs?.keepLinesTogether, true);
  assert.equal(blocks[2].attrs?.widowControl, false);
});
