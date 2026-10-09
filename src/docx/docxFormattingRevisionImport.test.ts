import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { TrackChangesService } from "../review/trackChanges/trackChangesService.ts";
import { importDocxToDocumentModel } from "./index.ts";
import { STYLE_NORMAL_ID, STYLE_HEADING_1_ID } from "../styles/services/builtInStyles.ts";

/**
 * Helper: Tạo tệp DOCX trong bộ nhớ với các thẻ Track Changes / Formatting Revisions
 */
async function createTestDocx(options: {
  documentBodyXml: string;
  stylesXml?: string;
}): Promise<Uint8Array> {
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
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`
  );

  const defaultStylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
      </w:style>
      <w:style w:type="character" w:styleId="Emphasis">
        <w:name w:val="Emphasis"/>
      </w:style>
    </w:styles>`;

  zip.file("word/styles.xml", options.stylesXml || defaultStylesXml);

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${options.documentBodyXml}
      </w:body>
    </w:document>`
  );

  return await zip.generateAsync({ type: "uint8array" });
}

function createEditorFromContent(content: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content,
  });
  ensureEditorPlugins(editor);
  return editor;
}

// =============================================================================
// PHASE 11 TARGETED FIXTURES TESTS
// =============================================================================

test("PHASE 11 — 1. Font change: w:rPrChange font family and font size", async () => {
  const bodyXml = `
    <w:p>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial"/>
          <w:sz w:val="28"/>
          <w:rPrChange w:id="101" w:author="Nguyễn Văn A" w:date="2026-10-08T08:00:00Z">
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman"/>
              <w:sz w:val="24"/>
            </w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Văn bản đổi phông chữ và cỡ chữ</w:t>
      </w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-font-change.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const doc = result.document;
  const p = doc.content.content?.[0];
  assert.ok(p, "Phải có paragraph");

  const textNode = p.content?.[0];
  assert.ok(textNode, "Phải có text node");
  assert.equal(textNode.text, "Văn bản đổi phông chữ và cỡ chữ");

  // Kiểm tra current formatting (AFTER): Arial 14pt (28 half-points)
  const textStyleMark = textNode.marks?.find((m) => m.type === "textStyle");
  assert.ok(textStyleMark, "Phải có textStyle mark");
  assert.equal(textStyleMark.attrs?.fontFamily, "Arial");
  assert.equal(textStyleMark.attrs?.fontSize, "14pt");

  // Kiểm tra trackChange mark
  const tcMark = textNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(tcMark, "Phải có trackChange mark");
  assert.equal(tcMark.attrs?.changeType, "format");
  assert.equal(tcMark.attrs?.author, "Nguyễn Văn A");
  assert.equal(tcMark.attrs?.scope, "character");

  const diffs = tcMark.attrs?.formatChanges;
  assert.ok(Array.isArray(diffs), "formatChanges phải là mảng");

  const fontDiff = diffs.find((d: any) => d.property === "fontFamily");
  assert.ok(fontDiff, "Phải có diff fontFamily");
  assert.equal(fontDiff.before, "Times New Roman", "Before là phông cũ");
  assert.equal(fontDiff.after, "Arial", "After là phông mới");

  const sizeDiff = diffs.find((d: any) => d.property === "fontSize");
  assert.ok(sizeDiff, "Phải có diff fontSize");
  assert.equal(sizeDiff.before, 12, "Before là cỡ cũ 12pt");
  assert.equal(sizeDiff.after, 14, "After là cỡ mới 14pt");

  // Kiểm tra document trackedChanges list
  assert.ok(doc.trackedChanges && doc.trackedChanges.length > 0);
  const tcItem = doc.trackedChanges.find((c) => c.id === tcMark.attrs?.id);
  assert.ok(tcItem, "Revision phải được ghi vào trackedChanges list");
  assert.equal(tcItem.type, "format");
  assert.equal(tcItem.text, "Văn bản đổi phông chữ và cỡ chữ");
});

test("PHASE 11 — 2. Bold: w:rPrChange bold toggle correctly preserved", async () => {
  const bodyXml = `
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rPrChange w:id="102" w:author="Trần Thị B" w:date="2026-10-08T08:10:00Z">
            <w:rPr>
              <w:b w:val="0"/>
            </w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Văn bản in đậm có track changes</w:t>
      </w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-bold-change.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const textNode = result.document.content.content?.[0]?.content?.[0];
  assert.ok(textNode);

  // Current formatting: có bold
  const boldMark = textNode.marks?.find((m) => m.type === "bold");
  assert.ok(boldMark, "Text node hiện tại phải có mark bold");

  // Revision mark
  const tcMark = textNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(tcMark);
  assert.equal(tcMark.attrs?.changeType, "format");

  const boldDiff = tcMark.attrs?.formatChanges?.find((d: any) => d.property === "bold");
  assert.ok(boldDiff, "Phải ghi nhận diff cho thuộc tính bold");
  assert.equal(boldDiff.before, false, "Before phải là false");
  assert.equal(boldDiff.after, true, "After phải là true");
});

test("PHASE 11 — 3. Multiple properties: run with bold, italic, color and highlight changes", async () => {
  const bodyXml = `
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:i/>
          <w:color w:val="FF0000"/>
          <w:highlight w:val="yellow"/>
          <w:rPrChange w:id="103" w:author="Lê C" w:date="2026-10-08T08:15:00Z">
            <w:rPr>
              <w:color w:val="000000"/>
            </w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Văn bản nhiều thuộc tính</w:t>
      </w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-multi-props.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const textNode = result.document.content.content?.[0]?.content?.[0];
  assert.ok(textNode);

  // Đầy đủ direct marks
  assert.ok(textNode.marks?.find((m) => m.type === "bold"));
  assert.ok(textNode.marks?.find((m) => m.type === "italic"));
  assert.ok(textNode.marks?.find((m) => m.type === "highlight"));

  const tcMark = textNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(tcMark);
  const diffs = tcMark.attrs?.formatChanges;

  const bDiff = diffs?.find((d: any) => d.property === "bold");
  const iDiff = diffs?.find((d: any) => d.property === "italic");
  const cDiff = diffs?.find((d: any) => d.property === "color");
  const hDiff = diffs?.find((d: any) => d.property === "highlight");

  assert.ok(bDiff && bDiff.before === false && bDiff.after === true);
  assert.ok(iDiff && iDiff.before === false && iDiff.after === true);
  assert.ok(cDiff && cDiff.before === "#000000" && cDiff.after === "#FF0000");
  assert.ok(hDiff && hDiff.before === null && hDiff.after === "#ffff00");
});

test("PHASE 11 — 4. Paragraph alignment: parse w:pPrChange text alignment", async () => {
  const bodyXml = `
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:pPrChange w:id="201" w:author="Hoàng D" w:date="2026-10-08T08:20:00Z">
          <w:pPr>
            <w:jc w:val="left"/>
          </w:pPr>
        </w:pPrChange>
      </w:pPr>
      <w:r><w:t>Đoạn văn căn giữa có theo dõi</w:t></w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-align-change.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const pNode = result.document.content.content?.[0];
  assert.ok(pNode);
  assert.equal(pNode.attrs?.textAlign, "center", "Current alignment phải là center");
  assert.ok(pNode.attrs?.nodeId, "Phải có stable nodeId gán cho block");

  const revs = pNode.attrs?.formatRevisions;
  assert.ok(Array.isArray(revs) && revs.length === 1, "Phải có 1 paragraph format revision");
  const rev = revs[0];
  assert.equal(rev.type, "format");
  assert.equal(rev.scope, "paragraph");
  assert.equal(rev.author, "Hoàng D");

  const alignDiff = rev.formatChange?.changes?.find((c: any) => c.property === "textAlign");
  assert.ok(alignDiff, "Phải có diff textAlign");
  assert.equal(alignDiff.before, "left", "Before là left");
  assert.equal(alignDiff.after, "center", "After là center");

  // Kiểm tra trackedChanges list ở document root
  const rootTc = result.document.trackedChanges?.find((c) => c.id === rev.id);
  assert.ok(rootTc, "Revision phải hiện diện trong document trackedChanges");
  assert.equal(rootTc.text, "Đoạn văn căn giữa có theo dõi");
});

test("PHASE 11 — 5. Spacing and indents: parse w:pPrChange spacing and indent properties", async () => {
  const bodyXml = `
    <w:p>
      <w:pPr>
        <w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/>
        <w:ind w:left="720" w:firstLine="360"/>
        <w:pPrChange w:id="202" w:author="Phạm E" w:date="2026-10-08T08:25:00Z">
          <w:pPr>
            <w:spacing w:before="0" w:after="0" w:line="240"/>
            <w:ind w:left="0" w:firstLine="0"/>
          </w:pPr>
        </w:pPrChange>
      </w:pPr>
      <w:r><w:t>Đoạn văn có khoảng cách và thụt lề thay đổi</w:t></w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-spacing-indent.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const pNode = result.document.content.content?.[0];
  assert.ok(pNode);

  // 240 twips = 12 pt, 120 twips = 6 pt, line 360 = 1.5 line
  assert.equal(pNode.attrs?.spacingBefore, 12);
  assert.equal(pNode.attrs?.spacingAfter, 6);
  assert.equal(pNode.attrs?.lineSpacing, 1.5);
  assert.equal(pNode.attrs?.leftIndent, 36); // 720 twips = 36 pt
  assert.equal(pNode.attrs?.firstLineIndent, 18); // 360 twips = 18 pt

  const rev = pNode.attrs?.formatRevisions?.[0];
  assert.ok(rev);
  const diffs = rev.formatChange?.changes;

  const sbDiff = diffs?.find((c: any) => c.property === "spacingBefore");
  const saDiff = diffs?.find((c: any) => c.property === "spacingAfter");
  const lsDiff = diffs?.find((c: any) => c.property === "lineSpacing");
  const liDiff = diffs?.find((c: any) => c.property === "leftIndent");
  const fiDiff = diffs?.find((c: any) => c.property === "firstLineIndent");

  assert.ok(sbDiff && sbDiff.before === 0 && sbDiff.after === 12);
  assert.ok(saDiff && saDiff.before === 0 && saDiff.after === 6);
  assert.ok(lsDiff && lsDiff.before === "1" && lsDiff.after === "1.5");
  assert.ok(liDiff && liDiff.before === 0 && liDiff.after === 36);
  assert.ok(fiDiff && fiDiff.before === 0 && fiDiff.after === 18);
});

test("PHASE 11 — 6. Style assignment revisions: paragraph and character style changes", async () => {
  const bodyXml = `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:pPrChange w:id="301" w:author="Vũ F" w:date="2026-10-08T08:30:00Z">
          <w:pPr>
            <w:pStyle w:val="Normal"/>
          </w:pPr>
        </w:pPrChange>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rStyle w:val="Emphasis"/>
          <w:rPrChange w:id="302" w:author="Vũ F" w:date="2026-10-08T08:31:00Z">
            <w:rPr>
              <w:rStyle w:val="Normal"/>
            </w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Tiêu đề 1 có từ nhấn mạnh</w:t>
      </w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-style-assignment.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const blockNode = result.document.content.content?.[0];
  assert.ok(blockNode);
  // Heading node được tạo
  assert.equal(blockNode.type, "heading");
  assert.equal(blockNode.attrs?.styleId, STYLE_HEADING_1_ID);

  // Paragraph style change revision
  const pRev = blockNode.attrs?.formatRevisions?.[0];
  assert.ok(pRev);
  assert.equal(pRev.scope, "style", "Revision chỉ đổi style phải có scope=style");
  const pStyleDiff = pRev.formatChange?.changes?.find((c: any) => c.property === "paragraphStyleId");
  assert.ok(pStyleDiff, "Phải ghi nhận diff paragraphStyleId");
  assert.equal(pStyleDiff.before, STYLE_NORMAL_ID);
  assert.equal(pStyleDiff.after, STYLE_HEADING_1_ID);

  // Character style change revision
  const textNode = blockNode.content?.[0];
  assert.ok(textNode);
  const tcMark = textNode.marks?.find((m) => m.type === "trackChange");
  assert.ok(tcMark);
  assert.equal(tcMark.attrs?.scope, "style");
  const charStyleDiff = tcMark.attrs?.formatChanges?.find((c: any) => c.property === "characterStyleId");
  assert.ok(charStyleDiff);
  assert.equal(charStyleDiff.before, STYLE_NORMAL_ID);
  assert.equal(charStyleDiff.after, "style_emphasis");
});

test("PHASE 11 — 7. Mixed text and format revisions: w:ins, w:del, w:rPrChange, w:pPrChange co-exist", async () => {
  const bodyXml = `
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
        <w:pPrChange w:id="401" w:author="Kiểm Thử Viên" w:date="2026-10-08T08:35:00Z">
          <w:pPr><w:jc w:val="left"/></w:pPr>
        </w:pPrChange>
      </w:pPr>
      <w:r><w:t>Đầu câu </w:t></w:r>
      <w:ins w:id="402" w:author="Kiểm Thử Viên" w:date="2026-10-08T08:36:00Z">
        <w:r>
          <w:rPr>
            <w:b/>
            <w:rPrChange w:id="403" w:author="Kiểm Thử Viên" w:date="2026-10-08T08:37:00Z">
              <w:rPr><w:b w:val="0"/></w:rPr>
            </w:rPrChange>
          </w:rPr>
          <w:t>chèn đậm</w:t>
        </w:r>
      </w:ins>
      <w:del w:id="404" w:author="Kiểm Thử Viên" w:date="2026-10-08T08:38:00Z">
        <w:r><w:delText> đã xóa</w:delText></w:r>
      </w:del>
      <w:r><w:t> cuối câu.</w:t></w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-mixed-revisions.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const doc = result.document;
  const p = doc.content.content?.[0];
  assert.ok(p);

  // Paragraph revision
  assert.ok(p.attrs?.formatRevisions?.length === 1);

  // Text inserted node phải có CẢ insert mark VÀ format mark
  const insTextNode = p.content?.find((n) => n.text === "chèn đậm");
  assert.ok(insTextNode, "Text node chèn mới phải tồn tại");

  const insMark = insTextNode.marks?.find((m) => m.type === "trackChange" && m.attrs?.changeType === "insert");
  assert.ok(insMark, "Phải có mark insert");

  const fmtMark = insTextNode.marks?.find((m) => m.type === "trackChange" && m.attrs?.changeType === "format");
  assert.ok(fmtMark, "Phải có mark format đồng thời trên vùng text chèn");

  // Text deleted node phải được giữ nguyên trong AST
  const delTextNode = p.content?.find((n) => n.text === " đã xóa");
  assert.ok(delTextNode, "Text node đã xóa phải tồn tại");
  const delMark = delTextNode.marks?.find((m) => m.type === "trackChange" && m.attrs?.changeType === "delete");
  assert.ok(delMark, "Phải có mark delete");

  // Tracked changes list
  assert.ok(doc.trackedChanges);
  const types = doc.trackedChanges.map((t) => t.type);
  assert.ok(types.includes("insert"), "Có insert");
  assert.ok(types.includes("delete"), "Có delete");
  assert.ok(types.includes("format"), "Có format");
});

test("PHASE 11 — 8. Revision anchors and run segmentation: merge runs sharing same revision ID", async () => {
  const bodyXml = `
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rPrChange w:id="500" w:author="Đoàn G" w:date="2026-10-08T08:40:00Z">
            <w:rPr><w:b w:val="0"/></w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Xin </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rPrChange w:id="500" w:author="Đoàn G" w:date="2026-10-08T08:40:00Z">
            <w:rPr><w:b w:val="0"/></w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>chào </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rPrChange w:id="500" w:author="Đoàn G" w:date="2026-10-08T08:40:00Z">
            <w:rPr><w:b w:val="0"/></w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Việt Nam!</w:t>
      </w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-run-segmentation.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  const doc = result.document;
  // Trong danh sách trackedChanges của tài liệu, chỉ được phép có DUY NHẤT 1 revision với id "fmt-r-500"
  const revsFor500 = doc.trackedChanges?.filter((c) => c.id.includes("500"));
  assert.equal(revsFor500?.length, 1, "Không được tạo nhiều revision giả do OOXML run segmentation");
  assert.equal(revsFor500?.[0].text, "Xin chào Việt Nam!", "Text phải được cộng dồn liền mạch");
});

test("PHASE 11 — 9. Fail-safe & Malformed OOXML: missing metadata and duplicate IDs", async () => {
  const bodyXml = `
    <w:p>
      <!-- Revision thiếu author và date -->
      <w:r>
        <w:rPr>
          <w:i/>
          <w:rPrChange w:id="601">
            <w:rPr><w:i w:val="0"/></w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Text thiếu metadata </w:t>
      </w:r>
      <!-- Thẻ rPrChange rỗng không có rPr con -->
      <w:r>
        <w:rPr>
          <w:u w:val="single"/>
          <w:rPrChange w:id="602" w:author="Tác Giả" w:date="2026-10-08T08:45:00Z"/>
        </w:rPr>
        <w:t>Text rPrChange rỗng </w:t>
      </w:r>
      <!-- Hai revisions khác nhau nhưng bị duplicate ID "603" do lỗi generator -->
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rPrChange w:id="603" w:author="User 1" w:date="2026-10-08T08:46:00Z">
            <w:rPr><w:b w:val="0"/></w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Dup 1 </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:color w:val="FF0000"/>
          <w:rPrChange w:id="603" w:author="User 2" w:date="2026-10-08T08:47:00Z">
            <w:rPr><w:color w:val="0000FF"/></w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Dup 2</w:t>
      </w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-malformed.docx");
  assert.equal(result.success, true, "Phải import an toàn không crash");
  if (!result.success) return;

  const doc = result.document;
  const p = doc.content.content?.[0];
  assert.ok(p);

  // 1. Revision thiếu author/date được fallback an toàn
  const text1 = p.content?.[0];
  const tc1 = text1?.marks?.find((m) => m.type === "trackChange");
  assert.ok(tc1);
  assert.equal(tc1.attrs?.author, "Unknown Author");
  assert.ok(tc1.attrs?.timestamp, "Phải có fallback timestamp ISO");

  // 2. Thẻ rPrChange rỗng không làm mất text hay crash
  const text2 = p.content?.[1];
  assert.equal(text2?.text, "Text rPrChange rỗng ");
  assert.ok(text2?.marks?.find((m) => m.type === "underline"));

  // 3. Duplicate IDs được phân giải (disambiguated) để bảo toàn cả 2 revision
  const text3 = p.content?.[2];
  const text4 = p.content?.[3];
  assert.ok(text3 && text4);

  const tc3 = text3.marks?.find((m) => m.type === "trackChange");
  const tc4 = text4.marks?.find((m) => m.type === "trackChange");
  assert.ok(tc3 && tc4);
  assert.notEqual(tc3.attrs?.id, tc4.attrs?.id, "Phải phân giải ID khác nhau để không ghi đè");
  assert.equal(tc3.attrs?.author, "User 1");
  assert.equal(tc4.attrs?.author, "User 2");
});

test("PHASE 11 — 10. Accept & Reject after import: live editor lifecycle verification", async () => {
  const bodyXml = `
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:pPrChange w:id="701" w:author="Reviewer" w:date="2026-10-08T08:50:00Z">
          <w:pPr><w:jc w:val="left"/></w:pPr>
        </w:pPrChange>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:rPrChange w:id="702" w:author="Reviewer" w:date="2026-10-08T08:51:00Z">
            <w:rPr><w:b w:val="0"/></w:rPr>
          </w:rPrChange>
        </w:rPr>
        <w:t>Văn bản kiểm thử Accept/Reject</w:t>
      </w:r>
    </w:p>
  `;

  const bytes = await createTestDocx({ documentBodyXml: bodyXml });
  const result = await importDocxToDocumentModel(bytes, "test-accept-reject.docx");
  assert.equal(result.success, true);
  if (!result.success) return;

  // Khởi tạo live editor từ tài liệu vừa import
  const editor = createEditorFromContent(result.document.content);

  const pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.textAlign, "center");
  const pRevId = pNode.attrs.formatRevisions[0].id;

  const textNode = pNode.child(0);
  assert.ok(textNode.marks.some((m) => m.type.name === "bold"));
  const charRevMark = textNode.marks.find((m) => m.type.name === "trackChange");
  assert.ok(charRevMark);
  const charRevId = charRevMark.attrs.id;

  // 10.1 REJECT PARAGRAPH FORMATTING: khôi phục về căn lề trái (left)
  const pRejectOk = TrackChangesService.rejectChange(editor, pRevId);
  assert.equal(pRejectOk, true, "Reject paragraph change thành công");
  const pAfterReject = editor.state.doc.child(0);
  assert.equal(pAfterReject.attrs.textAlign, "left", "Khôi phục chính xác căn lề trước đó (left)");
  assert.equal(pAfterReject.attrs.formatRevisions?.length || 0, 0, "Dọn dẹp revision khỏi node");

  // 10.2 REJECT CHARACTER FORMATTING: khôi phục về không in đậm (unbold)
  const charRejectOk = TrackChangesService.rejectChange(editor, charRevId);
  assert.equal(charRejectOk, true, "Reject character change thành công");
  const textAfterReject = editor.state.doc.child(0).child(0);
  assert.equal(textAfterReject.marks.some((m) => m.type.name === "bold"), false, "Khôi phục bỏ in đậm");
  assert.equal(textAfterReject.marks.some((m) => m.type.name === "trackChange"), false, "Gỡ bỏ trackChange mark");

  editor.destroy();
});
