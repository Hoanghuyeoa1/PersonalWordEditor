import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { importDocxToDocumentModel } from "./index.ts";
import {
  mapDocxStylesToDocumentStyles,
} from "./styles/docxStyleMapper.ts";
import { parseStyles } from "./styles/styleParser.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
} from "../styles/services/builtInStyles.ts";
import {
  resolveStyle,
} from "../styles/services/styleResolver.ts";
import {
  getEffectiveParagraphFormatting,
  getEffectiveCharacterFormatting,
} from "../styles/services/effectiveStyleService.ts";
import {
  generateDocumentStylesCss,
} from "../styles/services/styleStylesheetService.ts";
import { applyParagraphStyle } from "../styles/services/applyStyleService.ts";
import { applyCharacterStyle } from "../styles/services/characterStyleService.ts";
import { undo, redo } from "../editor/editorCommands.ts";

/**
 * Tiện ích tạo binary zip DOCX trong bộ nhớ với stylesXml và documentXml tùy chỉnh
 */
async function buildTestDocx(
  documentXml: string,
  stylesXml?: string
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      ${stylesXml ? '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' : ""}
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
      ${stylesXml ? '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' : ""}
    </Relationships>`
  );

  zip.file("word/document.xml", documentXml);
  if (stylesXml) {
    zip.file("word/styles.xml", stylesXml);
  }

  return zip.generateAsync({ type: "uint8array" });
}

/* ==========================================================================
   BỘ TEST CHUYÊN BIỆT: PHASE 8 — DOCX SEMANTIC STYLE IMPORT
   ========================================================================== */

test("Phase 8 - 1. Paragraph custom style import", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="CustomQuote">
        <w:name w:val="Custom Quote"/>
        <w:pPr>
          <w:jc w:val="center"/>
          <w:spacing w:line="360" w:before="240" w:after="240"/>
        </w:pPr>
        <w:rPr>
          <w:i/>
          <w:color w:val="475569"/>
          <w:sz w:val="24"/>
        </w:rPr>
      </w:style>
    </w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="CustomQuote"/></w:pPr>
          <w:r><w:t>Văn bản trích dẫn kiểu CustomQuote.</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, stylesXml);
  const res = await importDocxToDocumentModel(bytes, "QuoteDoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  assert.ok(doc.styles);
  assert.ok(doc.styles.definitions.length >= 4);

  // Tra cứu custom style
  const quoteStyle = doc.styles.definitions.find((s) => s.id === "style_docx_customquote");
  assert.ok(quoteStyle, "CustomQuote style must be imported into styles metadata");
  assert.equal(quoteStyle.type, "paragraph");
  assert.equal(quoteStyle.name, "Custom Quote");
  assert.equal(quoteStyle.paragraph?.textAlign, "center");
  assert.equal(quoteStyle.paragraph?.spacingBefore, 12); // 240 / 20 = 12 pt
  assert.equal(quoteStyle.paragraph?.spacingAfter, 12);
  assert.equal(quoteStyle.character?.italic, true);
  assert.equal(quoteStyle.character?.color, "#475569");
  assert.equal(quoteStyle.character?.fontSize, 12); // 24 half-points = 12 pt

  // Kiểm tra paragraph node trong AST
  const pNode = doc.content.content?.[0];
  assert.equal(pNode?.type, "paragraph");
  assert.equal(pNode?.attrs?.styleId, "style_docx_customquote");
});

test("Phase 8 - 2. Character style import", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="character" w:styleId="CodeKeyword">
        <w:name w:val="Code Keyword"/>
        <w:rPr>
          <w:rFonts w:ascii="Courier New"/>
          <w:b/>
          <w:color w:val="2563EB"/>
          <w:sz w:val="20"/>
        </w:rPr>
      </w:style>
    </w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:t>Trước từ khóa </w:t></w:r>
          <w:r>
            <w:rPr><w:rStyle w:val="CodeKeyword"/></w:rPr>
            <w:t>function</w:t>
          </w:r>
          <w:r><w:t> sau từ khóa</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, stylesXml);
  const res = await importDocxToDocumentModel(bytes, "CharStyleDoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  const codeStyle = doc.styles?.definitions.find((s) => s.id === "style_docx_codekeyword");
  assert.ok(codeStyle, "CodeKeyword character style must be imported");
  assert.equal(codeStyle.type, "character");
  assert.equal(codeStyle.character?.fontFamily, "Courier New");
  assert.equal(codeStyle.character?.bold, true);
  assert.equal(codeStyle.character?.color, "#2563EB");
  assert.equal(codeStyle.character?.fontSize, 10);

  // Kiểm tra marks của text run "function"
  const pNode = doc.content.content?.[0];
  const runs = pNode?.content || [];
  assert.equal(runs.length, 3);

  const keywordRun = runs[1];
  assert.equal(keywordRun.text, "function");
  const charMark = keywordRun.marks?.find((m) => m.type === "characterStyle");
  assert.ok(charMark, "Must have characterStyle mark");
  assert.equal(charMark.attrs?.styleId, "style_docx_codekeyword");
});

test("Phase 8 - 3. basedOn inheritance mapping", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="ParentStyle">
        <w:name w:val="Parent Style"/>
        <w:rPr>
          <w:rFonts w:ascii="Georgia"/>
          <w:sz w:val="28"/>
        </w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="ChildStyle">
        <w:name w:val="Child Style"/>
        <w:basedOn w:val="ParentStyle"/>
        <w:rPr>
          <w:b/>
          <w:color w:val="DC2626"/>
        </w:rPr>
      </w:style>
    </w:styles>`;

  const parsed = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } = mapDocxStylesToDocumentStyles(parsed);

  const parentId = wordStyleIdToInternalId.get("ParentStyle")!;
  const childId = wordStyleIdToInternalId.get("ChildStyle")!;
  assert.ok(parentId);
  assert.ok(childId);

  const childDef = stylesMetadata.definitions.find((s) => s.id === childId);
  assert.ok(childDef);
  assert.equal(childDef.basedOn, parentId, "Child style basedOn must point to mapped parent ID");

  // Kiểm tra resolve kế thừa
  const resolvedChild = resolveStyle(childId, stylesMetadata.definitions);
  assert.equal(resolvedChild.character.fontFamily, "Georgia", "Must inherit fontFamily from parent");
  assert.equal(resolvedChild.character.fontSize, 14, "Must inherit fontSize 14pt from parent");
  assert.equal(resolvedChild.character.bold, true, "Must have child's bold override");
  assert.equal(resolvedChild.character.color, "#DC2626", "Must have child's color override");
});

test("Phase 8 - 4. Multi-level inheritance cascade", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Normal">
        <w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/><w:color w:val="111111"/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="BaseDoc">
        <w:basedOn w:val="Normal"/>
        <w:pPr><w:jc w:val="justify"/><w:spacing w:line="276"/></w:pPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="SubDoc">
        <w:basedOn w:val="BaseDoc"/>
        <w:rPr><w:i/><w:color w:val="2563EB"/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="LeafDoc">
        <w:basedOn w:val="SubDoc"/>
        <w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr>
        <w:rPr><w:b/></w:rPr>
      </w:style>
    </w:styles>`;

  const parsed = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } = mapDocxStylesToDocumentStyles(parsed);

  const leafId = wordStyleIdToInternalId.get("LeafDoc")!;
  assert.ok(leafId);

  const resolved = resolveStyle(leafId, stylesMetadata.definitions);
  // Từ Normal:
  assert.equal(resolved.character.fontFamily, "Calibri");
  // Từ BaseDoc:
  assert.equal(resolved.paragraph.textAlign, "justify");
  // Từ SubDoc:
  assert.equal(resolved.character.italic, true);
  assert.equal(resolved.character.color, "#2563EB");
  // Từ LeafDoc:
  assert.equal(resolved.paragraph.spacingBefore, 10);
  assert.equal(resolved.paragraph.spacingAfter, 5);
  assert.equal(resolved.character.bold, true);
});

test("Phase 8 - 5. Built-in Heading style mapping and node preservation", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
        <w:pPr><w:jc w:val="center"/><w:spacing w:before="360" w:after="120"/></w:pPr>
        <w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="48"/><w:b/><w:color w:val="0000FF"/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading2">
        <w:name w:val="heading 2"/>
        <w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr>
        <w:rPr><w:sz w:val="32"/><w:b/></w:rPr>
      </w:style>
    </w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
          <w:r><w:t>Tiêu đề cấp 1 lớn</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
          <w:r><w:t>Tiêu đề cấp 2 nhỏ hơn</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, stylesXml);
  const res = await importDocxToDocumentModel(bytes, "HeadingsDoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  const blocks = doc.content.content || [];
  assert.equal(blocks.length, 2);

  // Block 1: Heading level 1
  const h1 = blocks[0];
  assert.equal(h1.type, "heading", "Node must be semantic heading node, not paragraph");
  assert.equal(h1.attrs?.level, 1);
  assert.equal(h1.attrs?.styleId, STYLE_HEADING_1_ID);

  // Block 2: Heading level 2
  const h2 = blocks[1];
  assert.equal(h2.type, "heading");
  assert.equal(h2.attrs?.level, 2);
  assert.equal(h2.attrs?.styleId, STYLE_HEADING_2_ID);

  // Kiểm tra thuộc tính định nghĩa Heading 1 trong metadata
  const h1Def = doc.styles?.definitions.find((s) => s.id === STYLE_HEADING_1_ID);
  assert.ok(h1Def);
  assert.equal(h1Def.character?.fontFamily, "Arial");
  assert.equal(h1Def.character?.fontSize, 24); // 48 half-points = 24pt
  assert.equal(h1Def.paragraph?.spacingBefore, 18); // 360 twips = 18pt
});

test("Phase 8 - 6. w:pStyle assignment on multiple paragraphs", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="IntroStyle"><w:name w:val="Intro Style"/></w:style>
      <w:style w:type="paragraph" w:styleId="BodyStyle"><w:name w:val="Body Style"/></w:style>
    </w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="IntroStyle"/></w:pPr>
          <w:r><w:t>Đoạn mở đầu</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:pStyle w:val="BodyStyle"/></w:pPr>
          <w:r><w:t>Đoạn thân bài</w:t></w:r>
        </w:p>
        <w:p>
          <w:r><w:t>Đoạn không gắn style (Normal)</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, stylesXml);
  const res = await importDocxToDocumentModel(bytes, "MultiplePStyleDoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const blocks = res.document.content.content || [];
  assert.equal(blocks[0].attrs?.styleId, "style_docx_introstyle");
  assert.equal(blocks[1].attrs?.styleId, "style_docx_bodystyle");
  assert.equal(blocks[2].attrs?.styleId, STYLE_NORMAL_ID);
});

test("Phase 8 - 7. w:rStyle assignment on text runs", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="character" w:styleId="Emphasis">
        <w:name w:val="Emphasis"/>
        <w:rPr><w:i/></w:rPr>
      </w:style>
      <w:style w:type="character" w:styleId="Strong">
        <w:name w:val="Strong"/>
        <w:rPr><w:b/></w:rPr>
      </w:style>
    </w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r>
            <w:rPr><w:rStyle w:val="Emphasis"/></w:rPr>
            <w:t>Nghiêng ngữ nghĩa</w:t>
          </w:r>
          <w:r><w:t> và </w:t></w:r>
          <w:r>
            <w:rPr><w:rStyle w:val="Strong"/></w:rPr>
            <w:t>Đậm ngữ nghĩa</w:t>
          </w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, stylesXml);
  const res = await importDocxToDocumentModel(bytes, "RStyleDoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const runs = res.document.content.content?.[0]?.content || [];
  assert.equal(runs.length, 3);

  const r1 = runs[0];
  const m1 = r1.marks?.find((m) => m.type === "characterStyle");
  assert.ok(m1);
  assert.equal(m1.attrs?.styleId, STYLE_EMPHASIS_ID);

  const r2 = runs[1];
  assert.equal(r2.marks, undefined);

  const r3 = runs[2];
  const m3 = r3.marks?.find((m) => m.type === "characterStyle");
  assert.ok(m3);
  assert.equal(m3.attrs?.styleId, STYLE_STRONG_ID);
});

test("Phase 8 - 8. Direct formatting overrides paragraph and character styles", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="CenterQuote">
        <w:pPr><w:jc w:val="center"/></w:pPr>
      </w:style>
      <w:style w:type="character" w:styleId="BlueText">
        <w:rPr><w:color w:val="0000FF"/></w:rPr>
      </w:style>
    </w:styles>`;

  // Đoạn văn CenterQuote nhưng bị override trực tiếp căn phải (jc=right)
  // Text run BlueText nhưng bị override trực tiếp màu đỏ (color=FF0000) và in đậm (b)
  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr>
            <w:pStyle w:val="CenterQuote"/>
            <w:jc w:val="right"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rStyle w:val="BlueText"/>
              <w:b/>
              <w:color w:val="FF0000"/>
            </w:rPr>
            <w:t>Văn bản ghi đè màu đỏ và đậm</w:t>
          </w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, stylesXml);
  const res = await importDocxToDocumentModel(bytes, "OverrideDoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  const pNode = doc.content.content?.[0];

  // 1. Paragraph styleId được gán kèm direct override textAlign: "right"
  assert.equal(pNode?.attrs?.styleId, "style_docx_centerquote");
  assert.equal(pNode?.attrs?.textAlign, "right");

  const effectivePara = getEffectiveParagraphFormatting(pNode!, doc.styles!.definitions);
  assert.equal(effectivePara.textAlign, "right", "Effective alignment must reflect direct override");
  assert.equal(effectivePara.hasDirectOverrides, true);

  // 2. Run có characterStyle mark VÀ direct marks (bold, textStyle: color)
  const runNode = pNode?.content?.[0];
  assert.ok(runNode);
  const charMark = runNode.marks?.find((m) => m.type === "characterStyle");
  assert.ok(charMark);
  assert.equal(charMark.attrs?.styleId, "style_docx_bluetext");

  const boldMark = runNode.marks?.find((m) => m.type === "bold");
  assert.ok(boldMark, "Must have direct bold mark");

  const colorMark = runNode.marks?.find((m) => m.type === "textStyle");
  assert.equal(colorMark?.attrs?.color, "#FF0000", "Direct color mark must be #FF0000");

  const effectiveChar = getEffectiveCharacterFormatting(runNode, doc.styles!.definitions);
  assert.equal(effectiveChar.color, "#FF0000", "Effective color must be direct override #FF0000");
  assert.equal(effectiveChar.bold, true);
  assert.equal(effectiveChar.hasDirectOverrides, true);
});

test("Phase 8 - 9. Spacing and Indents accurate unit conversion", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="PreciseSpacing">
        <w:pPr>
          <w:spacing w:before="240" w:after="160" w:line="240"/>
          <w:ind w:left="720" w:right="360" w:firstLine="360"/>
        </w:pPr>
      </w:style>
    </w:styles>`;

  const parsed = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } = mapDocxStylesToDocumentStyles(parsed);

  const styleId = wordStyleIdToInternalId.get("PreciseSpacing")!;
  const s = stylesMetadata.definitions.find((item) => item.id === styleId);
  assert.ok(s);
  assert.ok(s.paragraph);

  // 240 twips / 20 = 12 pt
  assert.equal(s.paragraph.spacingBefore, 12);
  // 160 twips / 20 = 8 pt
  assert.equal(s.paragraph.spacingAfter, 8);
  // 720 twips / 20 = 36 pt
  assert.equal(s.paragraph.leftIndent, 36);
  // 360 twips / 20 = 18 pt
  assert.equal(s.paragraph.rightIndent, 18);
  // 360 twips / 20 = 18 pt
  assert.equal(s.paragraph.firstLineIndent, 18);
  // Hanging indent là 0 vì firstLineIndent đã có
  assert.equal(s.paragraph.hangingIndent, 0);
});

test("Phase 8 - 10. Unsupported property skip and unsupported style types safely ignored", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <!-- Unsupported style type: table -->
      <w:style w:type="table" w:styleId="TableGrid">
        <w:name w:val="Table Grid"/>
      </w:style>
      <!-- Unsupported style type: numbering -->
      <w:style w:type="numbering" w:styleId="ListBullet">
        <w:name w:val="List Bullet"/>
      </w:style>
      <!-- Paragraph style với thuộc tính lạ -->
      <w:style w:type="paragraph" w:styleId="WeirdStyle">
        <w:pPr>
          <w:snapToGrid w:val="0"/>
          <w:contextualSpacing/>
          <w:widowControl/>
          <w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs>
          <w:jc w:val="center"/>
        </w:pPr>
      </w:style>
    </w:styles>`;

  const parsed = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } = mapDocxStylesToDocumentStyles(parsed);

  // TableGrid và ListBullet không được đưa vào styles definitions của Styles Engine
  assert.equal(wordStyleIdToInternalId.has("TableGrid"), false);
  assert.equal(wordStyleIdToInternalId.has("ListBullet"), false);

  // WeirdStyle vẫn được import an toàn và lấy jc=center
  const weirdId = wordStyleIdToInternalId.get("WeirdStyle")!;
  assert.ok(weirdId);
  const weirdDef = stylesMetadata.definitions.find((s) => s.id === weirdId);
  assert.ok(weirdDef);
  assert.equal(weirdDef.paragraph?.textAlign, "center");
});

test("Phase 8 - 11. Missing parent fallback safe", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="OrphanStyle">
        <w:basedOn w:val="NonExistentStyle_12345"/>
        <w:rPr><w:b/></w:rPr>
      </w:style>
      <w:style w:type="character" w:styleId="OrphanCharStyle">
        <w:basedOn w:val="NonExistentCharParent_999"/>
        <w:rPr><w:i/></w:rPr>
      </w:style>
    </w:styles>`;

  const parsed = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } = mapDocxStylesToDocumentStyles(parsed);

  const orphanPId = wordStyleIdToInternalId.get("OrphanStyle")!;
  const orphanP = stylesMetadata.definitions.find((s) => s.id === orphanPId);
  assert.ok(orphanP);
  // Paragraph style missing parent phải fallback về STYLE_NORMAL_ID
  assert.equal(orphanP.basedOn, STYLE_NORMAL_ID);

  const orphanCId = wordStyleIdToInternalId.get("OrphanCharStyle")!;
  const orphanC = stylesMetadata.definitions.find((s) => s.id === orphanCId);
  assert.ok(orphanC);
  // Character style missing parent phải fallback về null
  assert.equal(orphanC.basedOn, null);
});

test("Phase 8 - 12. Malformed inheritance cycle broken safely", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="CycleA">
        <w:basedOn w:val="CycleB"/>
        <w:rPr><w:b/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="CycleB">
        <w:basedOn w:val="CycleA"/>
        <w:rPr><w:i/></w:rPr>
      </w:style>
    </w:styles>`;

  const parsed = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } = mapDocxStylesToDocumentStyles(parsed);

  const aId = wordStyleIdToInternalId.get("CycleA")!;
  const bId = wordStyleIdToInternalId.get("CycleB")!;

  // normalizeStyleCollection phá vỡ chu trình vòng
  const aDef = stylesMetadata.definitions.find((s) => s.id === aId);
  const bDef = stylesMetadata.definitions.find((s) => s.id === bId);
  assert.ok(aDef);
  assert.ok(bDef);

  // Không bị treo hoặc lỗi khi resolve
  const resolvedA = resolveStyle(aId, stylesMetadata.definitions);
  assert.ok(resolvedA);
  assert.equal(resolvedA.id, aId);
});

test("Phase 8 - 13. Missing styles.xml handles gracefully with default styles", async () => {
  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="UnknownStyle123"/></w:pPr>
          <w:r><w:t>Tài liệu không có styles.xml</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, undefined); // stylesXml = undefined
  const res = await importDocxToDocumentModel(bytes, "NoStylesXml.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  assert.ok(doc.styles);
  assert.ok(doc.styles.definitions.length >= 4, "Must provide default built-in styles");

  const pNode = doc.content.content?.[0];
  assert.equal(pNode?.type, "paragraph");
  // Text không bị mất:
  assert.equal(pNode?.content?.[0]?.text, "Tài liệu không có styles.xml");
  // UnknownStyle123 được fallback an toàn thành STYLE_NORMAL_ID hoặc null
  assert.ok(
    pNode?.attrs?.styleId === STYLE_NORMAL_ID || pNode?.attrs?.styleId === null,
    "Unknown styleId must fallback cleanly"
  );
});

test("Phase 8 - 14. Imported document remains fully editable and styled", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="ThemeBody">
        <w:name w:val="Theme Body"/>
        <w:pPr><w:jc w:val="justify"/></w:pPr>
        <w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="24"/></w:rPr>
      </w:style>
      <w:style w:type="character" w:styleId="HighlightWord">
        <w:name w:val="Highlight Word"/>
        <w:rPr><w:color w:val="DC2626"/><w:b/></w:rPr>
      </w:style>
    </w:styles>`;

  const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="ThemeBody"/></w:pPr>
          <w:r><w:t>Đoạn văn có thể chỉnh sửa tự do.</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const bytes = await buildTestDocx(docXml, stylesXml);
  const res = await importDocxToDocumentModel(bytes, "EditableDoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;

  // 1. Tạo editor với extensions và nạp content của DOCX import
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc.content,
  });

  const initialJson = editor.getJSON();
  assert.equal(initialJson.content?.[0]?.type, "paragraph");
  assert.equal(initialJson.content?.[0]?.attrs?.styleId, "style_docx_themebody");

  // 2. Thao tác chỉnh sửa: Thay đổi style của đoạn văn sang Heading 1
  editor.commands.setTextSelection(5);
  const appliedH1 = applyParagraphStyle(editor, STYLE_HEADING_1_ID);
  assert.equal(appliedH1, true);

  const afterH1Json = editor.getJSON();
  assert.equal(afterH1Json.content?.[0]?.attrs?.styleId, STYLE_HEADING_1_ID);

  // 3. Thao tác chỉnh sửa: Áp dụng character style
  editor.commands.setTextSelection({ from: 1, to: 8 });
  const appliedChar = applyCharacterStyle(editor, "style_docx_highlightword");
  assert.equal(appliedChar, true);

  const afterCharJson = editor.getJSON();
  const run1 = afterCharJson.content?.[0]?.content?.[0];
  const charMark = run1?.marks?.find((m: any) => m.type === "characterStyle");
  assert.ok(charMark);
  assert.equal(charMark.attrs?.styleId, "style_docx_highlightword");

  // 4. Undo / Redo an toàn
  undo(editor);
  const afterUndoJson = editor.getJSON();
  const runAfterUndo = afterUndoJson.content?.[0]?.content?.[0];
  const hadCharMark = runAfterUndo?.marks?.some((m: any) => m.type === "characterStyle");
  assert.equal(hadCharMark, false);

  redo(editor);
  const afterRedoJson = editor.getJSON();
  const runAfterRedo = afterRedoJson.content?.[0]?.content?.[0];
  assert.ok(runAfterRedo?.marks?.some((m: any) => m.type === "characterStyle"));

  // 5. CSS Stylesheet sinh ra đầy đủ các quy tắc style
  const css = generateDocumentStylesCss(doc.styles!.definitions);
  assert.ok(css.includes(".word-style-style_docx_themebody"));
  assert.ok(css.includes(".word-character-style-style_docx_highlightword"));
  assert.ok(css.includes("Times New Roman"));
  assert.ok(css.includes("#DC2626"));

  editor.destroy();
});
