import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseStyles } from "./styles/styleParser.ts";
import { mapDocxStylesToDocumentStyles } from "./styles/docxStyleMapper.ts";
import { buildStylesXml } from "./mapping/styleSerializer.ts";
import { buildStyleExportMapping } from "./styles/docxStyleExportMapper.ts";
import { DocumentSerializer } from "./mapping/documentSerializer.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { buildDocxPackage } from "./export/docxPackageBuilder.ts";
import { resolveStyle } from "../styles/services/styleResolver.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
} from "../styles/services/builtInStyles.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import type { DocumentStyle } from "../styles/types/styleTypes.ts";

/**
 * Helper tạo binary package DOCX giả lập từ stylesXml và documentXml
 */
async function createMockDocxZip(
  stylesXml: string,
  documentXml: string
): Promise<Uint8Array> {
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
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  zip.file("word/styles.xml", stylesXml);
  zip.file("word/document.xml", documentXml);

  return await zip.generateAsync({ type: "uint8array" });
}

// =========================================================================
// TEST SUITE: PHASE 3 — ADVANCED STYLES.XML FIDELITY
// =========================================================================

test("Phase 3 - 1. Style Metadata Fidelity: import/export supported subset (styleId, name, type, basedOn, next, link, default, qFormat)", () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="character" w:styleId="QuoteChar">
    <w:name w:val="Quote Char"/>
    <w:rPr><w:i/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CustomArticle">
    <w:name w:val="Custom Article"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="QuoteChar"/>
    <w:qFormat/>
    <w:pPr>
      <w:jc w:val="justify"/>
      <w:spacing w:line="360" w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman"/>
      <w:sz w:val="28"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const docxStyles = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } =
    mapDocxStylesToDocumentStyles(docxStyles);

  const internalArticleId = wordStyleIdToInternalId.get("CustomArticle");
  assert.ok(internalArticleId, "CustomArticle phải được gán internal ID");

  const articleDef = stylesMetadata.definitions.find(
    (s) => s.id === internalArticleId
  );
  assert.ok(articleDef, "Phải tìm thấy article definition");
  assert.equal(articleDef.name, "Custom Article");
  assert.equal(articleDef.type, "paragraph");
  assert.equal(articleDef.basedOn, STYLE_NORMAL_ID);
  assert.equal(articleDef.nextStyleId, STYLE_NORMAL_ID);
  assert.equal(articleDef.qFormat, true);
  assert.equal(articleDef.wordStyleId, "CustomArticle");

  // Export serialization test
  const mapping = buildStyleExportMapping(stylesMetadata);
  const exportedXml = buildStylesXml(stylesMetadata, mapping);

  assert.ok(
    exportedXml.includes('w:styleId="CustomArticle"'),
    "Phải giữ nguyên w:styleId CustomArticle"
  );
  assert.ok(
    exportedXml.includes('<w:name w:val="Custom Article"/>'),
    "Phải xuất w:name chính xác"
  );
  assert.ok(
    exportedXml.includes('<w:basedOn w:val="Normal"/>'),
    "Phải xuất w:basedOn Normal"
  );
  assert.ok(
    exportedXml.includes('<w:next w:val="Normal"/>'),
    "Phải xuất w:next Normal"
  );
  assert.ok(
    exportedXml.includes("<w:qFormat/>"),
    "Phải xuất thẻ w:qFormat"
  );
});

test("Phase 3 - 2. Word Style ID Mapping: identity is stable Word styleId, not display name", () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ThesisBodyID">
    <w:name w:val="Thesis Body Display Name"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="both"/></w:pPr>
  </w:style>
</w:styles>`;

  const docxStyles = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } =
    mapDocxStylesToDocumentStyles(docxStyles);

  const styleDef = stylesMetadata.definitions.find(
    (s) => s.wordStyleId === "ThesisBodyID"
  );
  assert.ok(styleDef, "Style definition phải nhớ wordStyleId");
  assert.equal(styleDef.wordStyleId, "ThesisBodyID");

  // Mô phỏng người dùng đổi Display Name trong editor
  styleDef.name = "Khóa Luận Tốt Nghiệp (Đã Đổi Tên)";

  // Khi xuất ra DOCX, Word styleId phải là ThesisBodyID, không phụ thuộc vào Display Name
  const mapping = buildStyleExportMapping(stylesMetadata);
  const wordId = mapping.internalToWordId.get(styleDef.id);
  assert.equal(
    wordId,
    "ThesisBodyID",
    "Word styleId xuất ra phải giữ đúng 'ThesisBodyID' ổn định"
  );

  const exportedXml = buildStylesXml(stylesMetadata, mapping);
  assert.ok(
    exportedXml.includes('w:styleId="ThesisBodyID"'),
    "styles.xml phải chứa w:styleId='ThesisBodyID'"
  );
  assert.ok(
    exportedXml.includes(
      '<w:name w:val="Khóa Luận Tốt Nghiệp (Đã Đổi Tên)"/>'
    ),
    "Display name mới được cập nhật trong w:name"
  );
});

test("Phase 3 - 3. Paragraph Style Properties Mapping: all 12 supported properties", () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="CompleteParaStyle">
    <w:name w:val="Complete Para Style"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:jc w:val="right"/>
      <w:spacing w:line="360" w:before="240" w:after="160"/>
      <w:ind w:left="720" w:right="360" w:firstLine="360" w:hanging="0"/>
      <w:keepNext w:val="1"/>
      <w:keepLines w:val="1"/>
      <w:pageBreakBefore w:val="1"/>
      <w:widowControl w:val="0"/>
    </w:pPr>
  </w:style>
</w:styles>`;

  const docxStyles = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } =
    mapDocxStylesToDocumentStyles(docxStyles);

  const internalId = wordStyleIdToInternalId.get("CompleteParaStyle")!;
  const style = stylesMetadata.definitions.find((s) => s.id === internalId)!;
  const p = style.paragraph!;

  // 12 properties verified
  assert.equal(p.textAlign, "right");
  assert.equal(p.lineSpacing, "1.5"); // 360 / 240
  assert.equal(p.spacingBefore, 12); // 240 / 20
  assert.equal(p.spacingAfter, 8); // 160 / 20
  assert.equal(p.leftIndent, 36); // 720 / 20
  assert.equal(p.rightIndent, 18); // 360 / 20
  assert.equal(p.firstLineIndent, 18); // 360 / 20
  assert.equal(p.keepWithNext, true);
  assert.equal(p.keepLinesTogether, true);
  assert.equal(p.pageBreakBefore, true);
  assert.equal(p.widowControl, false);

  // Serialized XML check
  const exportedXml = buildStylesXml(stylesMetadata);
  assert.ok(exportedXml.includes('<w:jc w:val="right"/>'));
  assert.ok(exportedXml.includes('w:line="360"'));
  assert.ok(exportedXml.includes('w:before="240"'));
  assert.ok(exportedXml.includes('w:after="160"'));
  assert.ok(exportedXml.includes('w:left="720"'));
  assert.ok(exportedXml.includes('w:right="360"'));
  assert.ok(exportedXml.includes('w:firstLine="360"'));
  assert.ok(exportedXml.includes("<w:keepNext/>"));
  assert.ok(exportedXml.includes("<w:keepLines/>"));
  assert.ok(exportedXml.includes("<w:pageBreakBefore/>"));
  assert.ok(exportedXml.includes('<w:widowControl w:val="0"/>'));
});

test("Phase 3 - 4. Character Style Properties Mapping: all 8 supported properties", () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="character" w:styleId="CompleteCharStyle">
    <w:name w:val="Complete Char Style"/>
    <w:rPr>
      <w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/>
      <w:sz w:val="30"/>
      <w:b w:val="1"/>
      <w:i w:val="1"/>
      <w:u w:val="single"/>
      <w:strike w:val="1"/>
      <w:color w:val="DC2626"/>
      <w:highlight w:val="yellow"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const docxStyles = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } =
    mapDocxStylesToDocumentStyles(docxStyles);

  const internalId = wordStyleIdToInternalId.get("CompleteCharStyle")!;
  const style = stylesMetadata.definitions.find((s) => s.id === internalId)!;
  const c = style.character!;

  // 8 properties verified
  assert.equal(c.fontFamily, "Georgia");
  assert.equal(c.fontSize, 15); // 30 half-points = 15pt
  assert.equal(c.bold, true);
  assert.equal(c.italic, true);
  assert.equal(c.underline, true);
  assert.equal(c.strike, true);
  assert.equal(c.color, "#DC2626");
  assert.equal(c.highlight, "#ffff00"); // Yellow hex

  // Serialized XML check
  const exportedXml = buildStylesXml(stylesMetadata);
  assert.ok(exportedXml.includes('w:ascii="Georgia"'));
  assert.ok(exportedXml.includes('w:sz w:val="30"'));
  assert.ok(exportedXml.includes("<w:b/>"));
  assert.ok(exportedXml.includes("<w:i/>"));
  assert.ok(exportedXml.includes('<w:u w:val="single"/>'));
  assert.ok(exportedXml.includes("<w:strike/>"));
  assert.ok(exportedXml.includes('w:color w:val="DC2626"'));
  assert.ok(exportedXml.includes('w:highlight w:val="yellow"'));
});

test("Phase 3 - 5. Inheritance Cycle and Broken Parent Protection: no infinite loop", () => {
  // Styles containing:
  // 1. Missing parent: StyleMissingParent basedOn NonExistentParent
  // 2. Self-cycle: StyleSelfCycle basedOn StyleSelfCycle
  // 3. Multi-style cycle: StyleCycleA -> StyleCycleB -> StyleCycleA
  // 4. Deep chain: ChainD -> ChainC -> ChainB -> ChainA -> Normal
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="StyleMissingParent">
    <w:name w:val="Missing Parent"/>
    <w:basedOn w:val="GhostParent999"/>
    <w:rPr><w:b/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="StyleSelfCycle">
    <w:name w:val="Self Cycle"/>
    <w:basedOn w:val="StyleSelfCycle"/>
    <w:rPr><w:i/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="StyleCycleA">
    <w:name w:val="Cycle A"/>
    <w:basedOn w:val="StyleCycleB"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="StyleCycleB">
    <w:name w:val="Cycle B"/>
    <w:basedOn w:val="StyleCycleA"/>
    <w:pPr><w:jc w:val="right"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ChainA">
    <w:name w:val="Chain A"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Arial"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ChainB">
    <w:name w:val="Chain B"/>
    <w:basedOn w:val="ChainA"/>
    <w:rPr><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ChainC">
    <w:name w:val="Chain C"/>
    <w:basedOn w:val="ChainB"/>
    <w:pPr><w:spacing w:before="200"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ChainD">
    <w:name w:val="Chain D"/>
    <w:basedOn w:val="ChainC"/>
    <w:rPr><w:b/></w:rPr>
  </w:style>
</w:styles>`;

  const docxStyles = parseStyles(stylesXml);
  const { stylesMetadata, wordStyleIdToInternalId } =
    mapDocxStylesToDocumentStyles(docxStyles);

  // 1. Missing parent fallback: must fallback to STYLE_NORMAL_ID safely
  const missingParentStyle = stylesMetadata.definitions.find(
    (s) => s.wordStyleId === "StyleMissingParent"
  )!;
  assert.equal(
    missingParentStyle.basedOn,
    STYLE_NORMAL_ID,
    "Missing parent phải fallback về Normal"
  );

  // 2. Self cycle broken: must not have self basedOn
  const selfCycleStyle = stylesMetadata.definitions.find(
    (s) => s.wordStyleId === "StyleSelfCycle"
  )!;
  assert.notEqual(
    selfCycleStyle.basedOn,
    selfCycleStyle.id,
    "Self-cycle phải được ngắt"
  );
  assert.equal(selfCycleStyle.basedOn, STYLE_NORMAL_ID);

  // 3. Multi-style cycle broken safely
  const cycleA = stylesMetadata.definitions.find(
    (s) => s.wordStyleId === "StyleCycleA"
  )!;
  const cycleB = stylesMetadata.definitions.find(
    (s) => s.wordStyleId === "StyleCycleB"
  )!;
  // Sau khi qua normalizeStyleCollection, chu trình A<->B phải bị bẻ gãy
  const hasCycle =
    cycleA.basedOn === cycleB.id && cycleB.basedOn === cycleA.id;
  assert.equal(hasCycle, false, "Chu trình A<->B phải bị bẻ gãy");

  // 4. Deep chain: Resolver kiểm tra kế thừa cascade
  const chainDId = wordStyleIdToInternalId.get("ChainD")!;
  const resolvedD = resolveStyle(chainDId, stylesMetadata.definitions);
  assert.equal(resolvedD.character.fontFamily, "Arial"); // Kế thừa từ ChainA
  assert.equal(resolvedD.character.fontSize, 14); // Kế thừa từ ChainB (28 / 2)
  assert.equal(resolvedD.paragraph.spacingBefore, 10); // Kế thừa từ ChainC (200 / 20)
  assert.equal(resolvedD.character.bold, true); // Trực tiếp từ ChainD
});

test("Phase 3 - 6. Semantic w:pStyle and w:rStyle without flattening to direct formatting", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="SemanticParaStyle">
    <w:name w:val="Semantic Para Style"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Verdana"/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="SemanticCharStyle">
    <w:name w:val="Semantic Char Style"/>
    <w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr>
  </w:style>
</w:styles>`;

  // Đoạn văn chỉ gắn w:pStyle, run chỉ gắn w:rStyle (không có direct overrides)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="SemanticParaStyle"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rStyle w:val="SemanticCharStyle"/>
        </w:rPr>
        <w:t>Semantic Run Text</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const docxBytes = await createMockDocxZip(stylesXml, documentXml);
  const importResult = await importDocxToDocumentModel(docxBytes, "SemanticTest.docx");
  assert.equal(importResult.success, true);

  const doc = importResult.document!;
  const paraNode = doc.content.content![0];

  // Kiểm tra paragraph giữ semantic styleId và KHÔNG bị flatten direct overrides
  assert.equal(paraNode.type, "paragraph");
  assert.ok(paraNode.attrs?.styleId, "Paragraph phải có styleId ngữ nghĩa");
  assert.equal(paraNode.attrs?.textAlign, undefined, "Không được tự ý chép textAlign thành direct attribute khi đã có style");
  assert.equal(paraNode.attrs?.spacingAfter, undefined, "Không được chép spacingAfter thành direct attribute");

  // Kiểm tra text run giữ characterStyle mark và KHÔNG bị flatten direct marks (bold/color)
  const textNode = paraNode.content![0];
  const charStyleMark = textNode.marks?.find((m) => m.type === "characterStyle");
  assert.ok(charStyleMark, "Text run phải có characterStyle mark");
  const directBoldMark = textNode.marks?.find((m) => m.type === "bold");
  assert.equal(directBoldMark, undefined, "Không được flatten bold mark vào direct run khi characterStyle đã có bold");

  // Khi serialize ngược lại ra DOCX, phải phát ra w:pStyle và w:rStyle
  const serializer = new DocumentSerializer(
    new Map([
      [paraNode.attrs!.styleId as string, "SemanticParaStyle"],
      [charStyleMark!.attrs!.styleId as string, "SemanticCharStyle"],
    ])
  );
  const serialized = serializer.serialize(doc);

  assert.ok(
    serialized.documentXml.includes('<w:pStyle w:val="SemanticParaStyle"/>'),
    "Phải phát ra <w:pStyle w:val='SemanticParaStyle'/>"
  );
  assert.ok(
    serialized.documentXml.includes('<w:rStyle w:val="SemanticCharStyle"/>'),
    "Phải phát ra <w:rStyle w:val='SemanticCharStyle'/>"
  );
});

test("Phase 3 - 7. Safe Skip for Unknown/Unsupported Style Data without crashing", async () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <!-- Table Style không hỗ trợ trực tiếp trong Styles Engine -->
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr><w:tblBorders><w:top w:val="single"/></w:tblBorders></w:tblPr>
  </w:style>
  <!-- Paragraph style với các thuộc tính lạ: snapToGrid, contextualSpacing, shd -->
  <w:style w:type="paragraph" w:styleId="ModernCallout">
    <w:name w:val="Modern Callout"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:snapToGrid w:val="0"/>
      <w:contextualSpacing/>
      <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:noProof/>
      <w:color w:val="0F172A"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="ModernCallout"/></w:pPr><w:r><w:t>An toàn không sập</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const docxBytes = await createMockDocxZip(stylesXml, documentXml);
  const importResult = await importDocxToDocumentModel(docxBytes, "UnknownStyles.docx");

  assert.equal(importResult.success, true, "Import không được thất bại khi gặp thuộc tính không rõ");
  const calloutDef = importResult.document?.styles.definitions.find(
    (s) => s.wordStyleId === "ModernCallout"
  );
  assert.ok(calloutDef, "Style ModernCallout vẫn được nạp thành công");
  assert.equal(calloutDef.paragraph?.textAlign, "center");
  assert.equal(calloutDef.character?.color, "#0F172A");
});

test("Phase 3 - 8. End-to-End Round-trip: Word Custom Style 'Thesis Body' -> Editor -> Modify -> Export DOCX -> Semantic Intact", async () => {
  // Input: File Word có Custom Style 'Thesis Body'
  // - basedOn Normal
  // - Times New Roman 13pt (sz=26)
  // - spacing: line=312 (1.3), before=120 (6pt), after=240 (12pt)
  // - indent: left=720 (36pt), firstLine=360 (18pt)
  const inputStylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ThesisBody">
    <w:name w:val="Thesis Body"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:jc w:val="both"/>
      <w:spacing w:line="312" w:before="120" w:after="240"/>
      <w:ind w:left="720" w:firstLine="360"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
      <w:sz w:val="26"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const inputDocumentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="ThesisBody"/>
      </w:pPr>
      <w:r>
        <w:t>Chương 1: Tổng quan nghiên cứu luận văn thạc sĩ khoa học máy tính.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const inputDocxBytes = await createMockDocxZip(inputStylesXml, inputDocumentXml);

  // 1. Nhập vào Editor
  const imported = await importDocxToDocumentModel(inputDocxBytes, "ThesisDocument.docx");
  assert.equal(imported.success, true);
  const doc = imported.document!;

  // Xác minh style đã được map chuẩn xác vào Styles Engine 2.0
  const thesisDef = doc.styles.definitions.find(
    (s) => s.wordStyleId === "ThesisBody" || s.name === "Thesis Body"
  );
  assert.ok(thesisDef, "Thesis Body phải tồn tại trong definitions");
  assert.equal(thesisDef.character?.fontFamily, "Times New Roman");
  assert.equal(thesisDef.character?.fontSize, 13);
  assert.equal(thesisDef.paragraph?.textAlign, "justify");
  assert.equal(thesisDef.paragraph?.spacingBefore, 6);
  assert.equal(thesisDef.paragraph?.spacingAfter, 12);
  assert.equal(thesisDef.paragraph?.leftIndent, 36);
  assert.equal(thesisDef.paragraph?.firstLineIndent, 18);

  const paraBlock = doc.content.content![0];
  assert.equal(paraBlock.attrs?.styleId, thesisDef.id);

  // 2. Chỉnh sửa style trong Editor:
  // - Cập nhật cỡ chữ lên 14pt
  // - Cập nhật khoảng cách sau lên 14pt
  // - Thêm keepWithNext = true
  thesisDef.character!.fontSize = 14;
  thesisDef.paragraph!.spacingAfter = 14;
  thesisDef.paragraph!.keepWithNext = true;

  // 3. Xuất ra tệp DOCX mới
  const exportedDocxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(exportedDocxBytes.byteLength > 0, "Mảng byte xuất ra không rỗng");

  // 4. Nhập lại tệp vừa xuất để kiểm chứng tính bảo toàn hai chiều (Round-trip Fidelity)
  const roundtripImported = await importDocxToDocumentModel(
    exportedDocxBytes,
    "ThesisRoundtrip.docx"
  );
  assert.equal(roundtripImported.success, true);
  const rtDoc = roundtripImported.document!;

  const rtThesisDef = rtDoc.styles.definitions.find(
    (s) => s.wordStyleId === "ThesisBody" || s.name === "Thesis Body"
  );
  assert.ok(rtThesisDef, "Roundtrip: Thesis Body phải được tìm thấy");
  assert.equal(rtThesisDef.character?.fontFamily, "Times New Roman");
  assert.equal(rtThesisDef.character?.fontSize, 14, "Cỡ chữ 14pt đã sửa phải được giữ nguyên");
  assert.equal(rtThesisDef.paragraph?.spacingBefore, 6);
  assert.equal(rtThesisDef.paragraph?.spacingAfter, 14, "spacingAfter 14pt đã sửa phải được giữ nguyên");
  assert.equal(rtThesisDef.paragraph?.keepWithNext, true, "keepWithNext đã sửa phải được giữ nguyên");

  // Kiểm tra paragraph vẫn tham chiếu semantic styleId, không bị vỡ định dạng
  const rtParaBlock = rtDoc.content.content![0];
  assert.equal(rtParaBlock.attrs?.styleId, rtThesisDef.id);
  assert.equal(
    rtParaBlock.content![0].text,
    "Chương 1: Tổng quan nghiên cứu luận văn thạc sĩ khoa học máy tính."
  );
});
