import test from "node:test";
import assert from "node:assert/strict";
import { parseXmlString } from "./utils/xmlUtils.ts";
import {
  parseFieldInstruction,
  resolveFieldValue,
  formatFieldInstruction,
} from "../fields/services/fieldEngine.ts";
import { ComplexFieldParser } from "../fields/parser/complexFieldParser.ts";
import type { FieldAttributes, FieldResolutionContext } from "../fields/types/fieldTypes.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { parseHeaderFooterXml } from "./mapping/headerFooterMapper.ts";
import { buildHeaderFooterXml } from "./mapping/headerFooterSerializer.ts";
import { formatHeaderFooterText } from "../page/types/headerFooterTypes.ts";

/**
 * PHASE 4 — SEMANTIC FIELD ENGINE + DOCX FIELD MAPPING TEST SUITE
 */

test("Phase 4 - 1. Simple Fields (w:fldSimple): PAGE and NUMPAGES parsing and resolution", () => {
  const parser = new ComplexFieldParser();
  const xml = `<w:fldSimple xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:instr="PAGE"><w:r><w:t>3</w:t></w:r></w:fldSimple>`;
  const doc = parseXmlString(xml);
  const { fieldAttrs } = parser.parseFldSimple(doc.documentElement);

  assert.equal(fieldAttrs.fieldType, "PAGE");
  assert.equal(fieldAttrs.instruction, "PAGE");
  assert.equal(fieldAttrs.result, "3");
  assert.equal(fieldAttrs.isComplex, false);

  // Resolution context: evaluate at page 7 of 15
  const context: FieldResolutionContext = {
    pageNumber: 7,
    pageCount: 15,
  };
  const resolved = resolveFieldValue(fieldAttrs, context);
  assert.equal(resolved, "7");

  // NUMPAGES
  const numPagesXml = `<w:fldSimple xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:instr="NUMPAGES"><w:r><w:t>15</w:t></w:r></w:fldSimple>`;
  const numPagesDoc = parseXmlString(numPagesXml);
  const numPagesAttrs = parser.parseFldSimple(numPagesDoc.documentElement).fieldAttrs;
  assert.equal(numPagesAttrs.fieldType, "NUMPAGES");
  assert.equal(resolveFieldValue(numPagesAttrs, context), "15");
});

test("Phase 4 - 2. Complex Fields (w:fldChar): begin -> instrText -> separate -> result -> end", () => {
  const parser = new ComplexFieldParser();
  const xml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText xml:space="preserve"> PAGE  \\* MERGEFORMAT </w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>5</w:t></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>`;

  const doc = parseXmlString(xml);
  const p = doc.documentElement;
  let completedField: FieldAttributes | null = null;

  for (let i = 0; i < p.childNodes.length; i++) {
    const r = p.childNodes[i] as Element;
    if (r.nodeType !== 1) continue;

    for (let k = 0; k < r.childNodes.length; k++) {
      const child = r.childNodes[k] as Element;
      if (child.nodeType !== 1) continue;
      const local = child.localName.toLowerCase();

      if (local === "fldchar") {
        const res = parser.handleFldChar(child, null);
        if (res) completedField = res;
      } else if (local === "instrtext") {
        parser.appendInstructionText(child.textContent || "");
      } else if (local === "t") {
        parser.appendResultText(child.textContent || "");
      }
    }
  }

  assert.ok(completedField, "Complex field must complete on fldChar end");
  assert.equal(completedField.fieldType, "PAGE");
  assert.equal(completedField.result, "5");
  assert.equal(completedField.isComplex, true);
  assert.ok(completedField.switches?.includes("\\* MERGEFORMAT"));
});

test("Phase 4 - 3. Instruction vs Result: instruction is the source of truth, not cached result", () => {
  const attrs: FieldAttributes = {
    fieldType: "PAGE",
    instruction: "PAGE",
    result: "99", // Cached display result is 99 (e.g. from an old render)
    isComplex: true,
  };

  // Resolution context at page 2
  const ctx: FieldResolutionContext = {
    pageNumber: 2,
    pageCount: 10,
  };

  // The engine resolves dynamically using the instruction and context, not sticking to 99
  const resolved = resolveFieldValue(attrs, ctx);
  assert.equal(resolved, "2");
  assert.notEqual(resolved, "99");

  // If no context is provided, fallback to cached result safely
  const fallback = resolveFieldValue(attrs, undefined);
  assert.equal(fallback, "99");
});

test("Phase 4 - 4. Metadata Fields: DATE & TIME with formatting switches", () => {
  const dateField = parseFieldInstruction('DATE \\@ "yyyy-MM-dd"', "2026-01-01");
  assert.equal(dateField.fieldType, "DATE");
  assert.ok(dateField.switches?.some((s) => s.includes("yyyy-MM-dd")));

  const ctx: FieldResolutionContext = {
    createdAt: "2026-10-08T00:00:00Z",
    now: new Date("2026-10-08T15:30:00Z"),
  };

  const resolvedDate = resolveFieldValue(dateField, ctx);
  assert.equal(resolvedDate, "2026-10-08");

  // TIME
  const timeField = parseFieldInstruction('TIME \\@ "HH:mm:ss"', "12:00:00");
  assert.equal(timeField.fieldType, "TIME");
  const resolvedTime = resolveFieldValue(timeField, ctx);
  assert.ok(resolvedTime.length >= 5);
});

test("Phase 4 - 5. Metadata Fields: TITLE and AUTHOR dynamic resolution", () => {
  const titleField = parseFieldInstruction("TITLE", "Draft");
  const authorField = parseFieldInstruction("AUTHOR", "Unknown");

  assert.equal(titleField.fieldType, "TITLE");
  assert.equal(authorField.fieldType, "AUTHOR");

  const ctx: FieldResolutionContext = {
    documentTitle: "Báo cáo thường niên 2026",
    documentAuthor: "Nguyễn Văn A",
  };

  assert.equal(resolveFieldValue(titleField, ctx), "Báo cáo thường niên 2026");
  assert.equal(resolveFieldValue(authorField, ctx), "Nguyễn Văn A");

  // Fallback when metadata not present
  assert.equal(resolveFieldValue(titleField, {}), "Draft");
  assert.equal(resolveFieldValue(authorField, {}), "Unknown");
});

test("Phase 4 - 6. Section Fields: SECTION and SECTIONPAGES dynamic resolution", () => {
  const sectionField = parseFieldInstruction("SECTION", "1");
  const sectionPagesField = parseFieldInstruction("SECTIONPAGES", "5");

  assert.equal(sectionField.fieldType, "SECTION");
  assert.equal(sectionPagesField.fieldType, "SECTIONPAGES");

  const ctx: FieldResolutionContext = {
    sectionIndex: 2, // 3rd section (0-based)
    sectionPageCount: 8,
    pageCount: 20,
  };

  // 1-based section number
  assert.equal(resolveFieldValue(sectionField, ctx), "3");
  assert.equal(resolveFieldValue(sectionPagesField, ctx), "8");
});

test("Phase 4 - 7. Reference Foundation: REF and PAGEREF targeting bookmarks", () => {
  const refField = parseFieldInstruction('REF BookmarkIntro \\h', "[Ref]");
  assert.equal(refField.fieldType, "REF");
  assert.equal(refField.argument, "BookmarkIntro");

  const pageRefField = parseFieldInstruction('PAGEREF BookmarkIntro \\h', "1");
  assert.equal(pageRefField.fieldType, "PAGEREF");
  assert.equal(pageRefField.argument, "BookmarkIntro");

  const bookmarksMap = new Map<string, { text?: string; pageNumber?: number }>([
    ["BookmarkIntro", { text: "Chương 1: Mở đầu", pageNumber: 4 }],
  ]);

  const ctx: FieldResolutionContext = {
    bookmarks: bookmarksMap,
  };

  assert.equal(resolveFieldValue(refField, ctx), "Chương 1: Mở đầu");
  assert.equal(resolveFieldValue(pageRefField, ctx), "4");

  // Missing bookmark fallback
  const missingRef = parseFieldInstruction('REF NonExistent', "[Fallback]");
  assert.equal(resolveFieldValue(missingRef, ctx), "[Fallback]");
});

test("Phase 4 - 8. Unknown Fields: MERGEFIELD, IF, ASK, SEQ safely preserved without crashing", () => {
  const mergeField = parseFieldInstruction('MERGEFIELD CustomerName \\* MERGEFORMAT', "John Doe");
  assert.equal(mergeField.fieldType, "UNKNOWN");
  assert.equal(mergeField.argument, "CustomerName");
  assert.equal(mergeField.result, "John Doe");
  assert.equal(resolveFieldValue(mergeField), "John Doe");

  const ifField = parseFieldInstruction('IF { MERGEFIELD Active } = "1" "Yes" "No"', "Yes");
  assert.equal(ifField.fieldType, "UNKNOWN");
  assert.equal(ifField.result, "Yes");

  const seqField = parseFieldInstruction("SEQ Figure", "1");
  assert.equal(seqField.fieldType, "UNKNOWN");
  assert.equal(seqField.result, "1");

  // formatFieldInstruction preserves raw instruction
  assert.ok(formatFieldInstruction(mergeField).includes("MERGEFIELD CustomerName"));
});

test("Phase 4 - 9. Malformed Fields Fail-Safe Handling", () => {
  // Case A: begin without end in paragraph
  const parserA = new ComplexFieldParser();
  const unclosedXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText>PAGE</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="separate"/></w:r>
    <w:r><w:t>42</w:t></w:r>
  </w:p>`;
  const docA = parseXmlString(unclosedXml);
  const pA = docA.documentElement;

  for (let i = 0; i < pA.childNodes.length; i++) {
    const r = pA.childNodes[i] as Element;
    if (r.nodeType !== 1) continue;
    for (let k = 0; k < r.childNodes.length; k++) {
      const child = r.childNodes[k] as Element;
      if (child.nodeType !== 1) continue;
      const local = child.localName.toLowerCase();
      if (local === "fldchar") parserA.handleFldChar(child, null);
      else if (local === "instrtext") parserA.appendInstructionText(child.textContent || "");
      else if (local === "t") parserA.appendResultText(child.textContent || "");
    }
  }

  assert.equal(parserA.isInField, true);
  const flushed = parserA.flushRemainingFrames();
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0].fieldType, "PAGE");
  assert.equal(flushed[0].result, "42");
  assert.equal(parserA.isInField, false);

  // Case B: missing separate (begin -> instrText -> end)
  const parserB = new ComplexFieldParser();
  const missingSepXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:r><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:instrText>NUMPAGES</w:instrText></w:r>
    <w:r><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>`;
  const docB = parseXmlString(missingSepXml);
  const pB = docB.documentElement;
  let fieldB: FieldAttributes | null = null;

  for (let i = 0; i < pB.childNodes.length; i++) {
    const r = pB.childNodes[i] as Element;
    if (r.nodeType !== 1) continue;
    for (let k = 0; k < r.childNodes.length; k++) {
      const child = r.childNodes[k] as Element;
      if (child.nodeType !== 1) continue;
      const local = child.localName.toLowerCase();
      if (local === "fldchar") {
        const res = parserB.handleFldChar(child, null);
        if (res) fieldB = res;
      } else if (local === "instrtext") {
        parserB.appendInstructionText(child.textContent || "");
      }
    }
  }
  assert.ok(fieldB);
  assert.equal(fieldB.fieldType, "NUMPAGES");

  // Case C: Orphan end / separate does not throw
  const parserC = new ComplexFieldParser();
  const dummyEl = parseXmlString('<w:fldChar xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:fldCharType="end"/>').documentElement;
  assert.doesNotThrow(() => {
    const orphanRes = parserC.handleFldChar(dummyEl, null);
    assert.equal(orphanRes, null);
  });
});

test("Phase 4 - 10. Header/Footer Backward Compatibility & Simple/Complex mapping", () => {
  // Test formatHeaderFooterText
  const formatted = formatHeaderFooterText(
    "Trang {PAGE} / {NUMPAGES} - Phần {SECTION} ({SECTIONPAGES} trang) - {TITLE} - {AUTHOR}",
    3,
    10,
    {
      sectionIndex: 0,
      sectionPageCount: 5,
      title: "Luận văn thạc sĩ",
      author: "Trần B",
    }
  );
  assert.equal(
    formatted,
    "Trang 3 / 10 - Phần 1 (5 trang) - Luận văn thạc sĩ - Trần B"
  );

  // Test parseHeaderFooterXml with complex field
  const complexHfXml = `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>Trang </w:t></w:r>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r>
      <w:r><w:instrText>PAGE</w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r>
      <w:r><w:t>1</w:t></w:r>
      <w:r><w:fldChar w:fldCharType="end"/></w:r>
      <w:r><w:t> trên </w:t></w:r>
      <w:fldSimple w:instr="NUMPAGES"><w:r><w:t>10</w:t></w:r></w:fldSimple>
    </w:p>
  </w:ftr>`;

  const hfItem = parseHeaderFooterXml(complexHfXml);
  assert.ok(hfItem);
  assert.equal(hfItem.alignment, "center");
  assert.ok(hfItem.text.includes("{PAGE}"));
  assert.ok(hfItem.text.includes("{NUMPAGES}"));
  assert.equal(hfItem.text, "Trang {PAGE} trên {NUMPAGES}");

  // Test buildHeaderFooterXml serialization
  const outXml = buildHeaderFooterXml(hfItem, "footer");
  assert.ok(outXml.includes('<w:fldSimple w:instr="PAGE">'));
  assert.ok(outXml.includes('<w:fldSimple w:instr="NUMPAGES">'));
});

test("Phase 4 - 11. End-to-End Round-Trip: Body fields (PAGE, DATE, TITLE, REF, UNKNOWN) in DOCX", async () => {
  const model: DocumentModel = {
    metadata: {
      title: "Field Engine Test",
      author: "AI Assistant",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pageCount: 1,
      wordCount: 10,
      characterCount: 50,
    },
    pageSettings: {
      paperSize: "a4",
      orientation: "portrait",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Tài liệu này có số trang: " },
            {
              type: "field",
              attrs: {
                fieldType: "PAGE",
                instruction: "PAGE",
                result: "1",
                isComplex: false,
              },
            },
            { type: "text", text: " trên tổng số " },
            {
              type: "field",
              attrs: {
                fieldType: "NUMPAGES",
                instruction: "NUMPAGES",
                result: "1",
                isComplex: true,
              },
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Tiêu đề: " },
            {
              type: "field",
              attrs: {
                fieldType: "TITLE",
                instruction: "TITLE",
                result: "Field Engine Test",
                isComplex: false,
              },
            },
            { type: "text", text: " | Tác giả: " },
            {
              type: "field",
              attrs: {
                fieldType: "AUTHOR",
                instruction: "AUTHOR",
                result: "AI Assistant",
                isComplex: false,
              },
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Trường mở rộng: " },
            {
              type: "field",
              attrs: {
                fieldType: "UNKNOWN",
                instruction: "MERGEFIELD CustomerName",
                result: "Tập đoàn ABC",
                argument: "CustomerName",
                isComplex: true,
              },
            },
          ],
        },
      ],
    },
  };

  // Export to DOCX buffer
  const docxBytes = await exportDocumentModelToDocx(model);
  assert.ok(docxBytes.byteLength > 1000, "Exported DOCX must be valid non-empty buffer");

  // Re-import DOCX
  const importRes = await importDocxToDocumentModel(docxBytes, "FieldRoundtrip.docx");
  assert.equal(importRes.success, true);
  const importedDoc = importRes.document;
  assert.ok(importedDoc);

  // Traverse imported blocks and check fields
  const allInlines: any[] = [];
  for (const block of importedDoc.content.content || []) {
    if (block.content) {
      allInlines.push(...block.content);
    }
  }

  const fieldNodes = allInlines.filter((n) => n.type === "field");
  assert.ok(fieldNodes.length >= 4, `Expected at least 4 fields, found ${fieldNodes.length}`);

  const pageField = fieldNodes.find((f) => f.attrs?.fieldType === "PAGE");
  assert.ok(pageField, "PAGE field must be restored");
  assert.equal(pageField.attrs.instruction, "PAGE");

  const numPagesField = fieldNodes.find((f) => f.attrs?.fieldType === "NUMPAGES");
  assert.ok(numPagesField, "NUMPAGES field must be restored");

  const titleField = fieldNodes.find((f) => f.attrs?.fieldType === "TITLE");
  assert.ok(titleField, "TITLE field must be restored");

  const unknownField = fieldNodes.find((f) => f.attrs?.fieldType === "UNKNOWN");
  assert.ok(unknownField, "UNKNOWN (MERGEFIELD) field must be restored");
  assert.ok(unknownField.attrs.instruction.includes("MERGEFIELD"));
  assert.equal(unknownField.attrs.result, "Tập đoàn ABC");
});
