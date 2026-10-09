import test from "node:test";
import assert from "node:assert/strict";
import { parseXmlString } from "./utils/xmlUtils.ts";
import { OmmlEngine } from "./omml/ommlEngine.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import type { DocumentModel } from "../document/documentTypes.ts";

/**
 * PHASE 5 — OMML EQUATION FIDELITY TARGETED TEST SUITE
 */

test("Phase 5 - 1. Fraction (m:f) Import and Export", () => {
  // A. Import: OMML -> LaTeX
  const omml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:f>
      <m:num><m:r><m:t>1</m:t></m:r></m:num>
      <m:den><m:r><m:t>2</m:t></m:r></m:den>
    </m:f>
  </m:oMath>`;
  const el = parseXmlString(omml).documentElement;
  const parsed = OmmlEngine.parseOmml(el);
  assert.equal(parsed.latex, "\\frac{1}{2}");

  // B. Export: LaTeX -> OMML
  const exported = OmmlEngine.exportToOmml("\\frac{1}{2}");
  assert.ok(exported.xml.includes("<m:f>"));
  assert.ok(exported.xml.includes("<m:num>"));
  assert.ok(exported.xml.includes("<m:den>"));
  assert.ok(exported.xml.includes(">1<"));
  assert.ok(exported.xml.includes(">2<"));

  // C. Roundtrip
  const reParsed = OmmlEngine.parseOmml(parseXmlString(exported.xml).documentElement);
  assert.equal(reParsed.latex, "\\frac{1}{2}");
});

test("Phase 5 - 2. Superscript (m:sSup) Import and Export", () => {
  const omml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:sSup>
      <m:e><m:r><m:t>x</m:t></m:r></m:e>
      <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
    </m:sSup>
  </m:oMath>`;
  const parsed = OmmlEngine.parseOmml(parseXmlString(omml).documentElement);
  assert.equal(parsed.latex, "x^{2}");

  const exported = OmmlEngine.exportToOmml("x^{2}");
  assert.ok(exported.xml.includes("<m:sSup>"));
  assert.ok(exported.xml.includes(">x<"));
  assert.ok(exported.xml.includes(">2<"));
});

test("Phase 5 - 3. Subscript (m:sSub) and SubSup (m:sSubSup) Import and Export", () => {
  // Subscript
  const subOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:sSub>
      <m:e><m:r><m:t>a</m:t></m:r></m:e>
      <m:sub><m:r><m:t>i</m:t></m:r></m:sub>
    </m:sSub>
  </m:oMath>`;
  const parsedSub = OmmlEngine.parseOmml(parseXmlString(subOmml).documentElement);
  assert.equal(parsedSub.latex, "a_{i}");

  // SubSup
  const subSupOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:sSubSup>
      <m:e><m:r><m:t>x</m:t></m:r></m:e>
      <m:sub><m:r><m:t>1</m:t></m:r></m:sub>
      <m:sup><m:r><m:t>2</m:t></m:r></m:sup>
    </m:sSubSup>
  </m:oMath>`;
  const parsedSubSup = OmmlEngine.parseOmml(parseXmlString(subSupOmml).documentElement);
  assert.equal(parsedSubSup.latex, "x_{1}^{2}");

  // Export SubSup
  const exported = OmmlEngine.exportToOmml("x_{1}^{2}");
  assert.ok(exported.xml.includes("<m:sSubSup>"));
  assert.ok(exported.xml.includes(">1<"));
  assert.ok(exported.xml.includes(">2<"));
});

test("Phase 5 - 4. Radical / Root (m:rad): square root and nth root", () => {
  // Square root (degHide)
  const sqrtOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:rad>
      <m:radPr><m:degHide m:val="1"/></m:radPr>
      <m:deg/>
      <m:e><m:r><m:t>x</m:t></m:r></m:e>
    </m:rad>
  </m:oMath>`;
  const parsedSqrt = OmmlEngine.parseOmml(parseXmlString(sqrtOmml).documentElement);
  assert.equal(parsedSqrt.latex, "\\sqrt{x}");

  // Cube root (nth root with degree)
  const cubeRootOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:rad>
      <m:deg><m:r><m:t>3</m:t></m:r></m:deg>
      <m:e><m:r><m:t>x</m:t></m:r></m:e>
    </m:rad>
  </m:oMath>`;
  const parsedCube = OmmlEngine.parseOmml(parseXmlString(cubeRootOmml).documentElement);
  assert.equal(parsedCube.latex, "\\sqrt[3]{x}");

  // Export square root
  const exportedSqrt = OmmlEngine.exportToOmml("\\sqrt{x}");
  assert.ok(exportedSqrt.xml.includes("<m:rad>"));
  assert.ok(exportedSqrt.xml.includes("<m:degHide"));

  // Export nth root
  const exportedNth = OmmlEngine.exportToOmml("\\sqrt[3]{x}");
  assert.ok(exportedNth.xml.includes("<m:rad>"));
  assert.ok(exportedNth.xml.includes("<m:deg><m:r><m:t xml:space=\"preserve\">3</m:t></m:r></m:deg>"));
});

test("Phase 5 - 5. Integral (m:nary with integral symbol)", () => {
  const intOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:nary>
      <m:naryPr><m:chr m:val="∫"/><m:limLoc m:val="undOvr"/></m:naryPr>
      <m:sub><m:r><m:t>0</m:t></m:r></m:sub>
      <m:sup><m:r><m:t>1</m:t></m:r></m:sup>
      <m:e><m:r><m:t>x dx</m:t></m:r></m:e>
    </m:nary>
  </m:oMath>`;
  const parsed = OmmlEngine.parseOmml(parseXmlString(intOmml).documentElement);
  assert.equal(parsed.latex, "\\int_{0}^{1} x dx");

  const exported = OmmlEngine.exportToOmml("\\int_{0}^{1}");
  assert.ok(exported.xml.includes("<m:nary>"));
  assert.ok(exported.xml.includes('m:val="∫"'));
  assert.ok(exported.xml.includes(">0<"));
  assert.ok(exported.xml.includes(">1<"));
});

test("Phase 5 - 6. Summation (m:nary with sum symbol)", () => {
  const sumOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:nary>
      <m:naryPr><m:chr m:val="∑"/><m:limLoc m:val="undOvr"/></m:naryPr>
      <m:sub><m:r><m:t>i=1</m:t></m:r></m:sub>
      <m:sup><m:r><m:t>n</m:t></m:r></m:sup>
      <m:e><m:r><m:t>i</m:t></m:r></m:e>
    </m:nary>
  </m:oMath>`;
  const parsed = OmmlEngine.parseOmml(parseXmlString(sumOmml).documentElement);
  assert.equal(parsed.latex, "\\sum_{i=1}^{n} i");

  const exported = OmmlEngine.exportToOmml("\\sum_{i=1}^{n}");
  assert.ok(exported.xml.includes("<m:nary>"));
  assert.ok(exported.xml.includes('m:val="∑"'));
});

test("Phase 5 - 7. Limit (m:limLow) and Functions", () => {
  const limOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:limLow>
      <m:e><m:r><m:t>lim</m:t></m:r></m:e>
      <m:lim><m:r><m:t>x → 0</m:t></m:r></m:lim>
    </m:limLow>
  </m:oMath>`;
  const parsed = OmmlEngine.parseOmml(parseXmlString(limOmml).documentElement);
  assert.ok(parsed.latex.includes("\\lim_{x \\to 0}"));

  const exported = OmmlEngine.exportToOmml("\\lim_{x \\to 0}");
  assert.ok(exported.xml.includes("<m:limLow>"));
  assert.ok(exported.xml.includes("<m:lim>"));
});

test("Phase 5 - 8. Delimiters / Brackets (m:d) and Matrix (m:m)", () => {
  // Brackets
  const dOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:d>
      <m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr>
      <m:e><m:r><m:t>x + 1</m:t></m:r></m:e>
    </m:d>
  </m:oMath>`;
  const parsedD = OmmlEngine.parseOmml(parseXmlString(dOmml).documentElement);
  assert.equal(parsedD.latex, "\\left( x + 1 \\right)");

  // Matrix
  const mOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:m>
      <m:mr>
        <m:e><m:r><m:t>1</m:t></m:r></m:e>
        <m:e><m:r><m:t>0</m:t></m:r></m:e>
      </m:mr>
      <m:mr>
        <m:e><m:r><m:t>0</m:t></m:r></m:e>
        <m:e><m:r><m:t>1</m:t></m:r></m:e>
      </m:mr>
    </m:m>
  </m:oMath>`;
  const parsedM = OmmlEngine.parseOmml(parseXmlString(mOmml).documentElement);
  assert.ok(parsedM.latex.includes("\\begin{matrix}"));
  assert.ok(parsedM.latex.includes("1 & 0"));
  assert.ok(parsedM.latex.includes("0 & 1"));

  // Export Matrix
  const exportedMatrix = OmmlEngine.exportToOmml("\\begin{matrix} 1 & 0 \\\\ 0 & 1 \\end{matrix}");
  assert.ok(exportedMatrix.xml.includes("<m:m>"));
  assert.ok(exportedMatrix.xml.includes("<m:mr>"));
});

test("Phase 5 - 9. Greek Symbols and Mathematical Operators", () => {
  const greekOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:r><m:t>α + β = γ ± ∞</m:t></m:r>
  </m:oMath>`;
  const parsed = OmmlEngine.parseOmml(parseXmlString(greekOmml).documentElement);
  assert.ok(parsed.latex.includes("\\alpha"));
  assert.ok(parsed.latex.includes("\\beta"));
  assert.ok(parsed.latex.includes("\\gamma"));
  assert.ok(parsed.latex.includes("\\pm"));
  assert.ok(parsed.latex.includes("\\infty"));

  const exported = OmmlEngine.exportToOmml("\\alpha + \\beta = \\gamma");
  assert.ok(exported.xml.includes("α"));
  assert.ok(exported.xml.includes("β"));
  assert.ok(exported.xml.includes("γ"));
});

test("Phase 5 - 10. Nested Basic Expressions: Quadratic Formula", () => {
  const quadraticLatex = "\\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}";
  const exported = OmmlEngine.exportToOmml(quadraticLatex);
  assert.ok(exported.xml.includes("<m:f>"));
  assert.ok(exported.xml.includes("<m:rad>"));
  assert.ok(exported.xml.includes("<m:sSup>"));

  // Re-import
  const reParsed = OmmlEngine.parseOmml(parseXmlString(exported.xml).documentElement);
  assert.ok(reParsed.latex.includes("\\frac"));
  assert.ok(reParsed.latex.includes("\\sqrt"));
  assert.ok(reParsed.latex.includes("2a"));
});

test("Phase 5 - 11. Unsupported LaTeX Fallback & Invalid OMML Resilience", () => {
  // A. Unsupported LaTeX
  const unsupported = "\\unknownCustomMacro{test}";
  const expRes = OmmlEngine.exportToOmml(unsupported);
  assert.ok(expRes.xml.includes("<m:oMath"));
  assert.ok(expRes.warnings.length > 0);
  // Không tạo XML hỏng
  assert.doesNotThrow(() => parseXmlString(expRes.xml));

  // B. Invalid / Malformed OMML
  const malformedOmml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <m:unknownTag attr="val">
      <m:r><m:t>Văn bản bảo toàn</m:t></m:r>
    </m:unknownTag>
  </m:oMath>`;
  assert.doesNotThrow(() => {
    const res = OmmlEngine.parseOmml(parseXmlString(malformedOmml).documentElement);
    assert.ok(res.latex.includes("Văn bản bảo toàn"));
  });
});

test("Phase 5 - 12. Comments & Track Changes context compatibility", () => {
  const docxXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
    <w:commentRangeStart w:id="1"/>
    <m:oMath>
      <m:f>
        <m:num><m:r><m:t>a</m:t></m:r></m:num>
        <m:den><m:r><m:t>b</m:t></m:r></m:den>
      </m:f>
    </m:oMath>
    <w:commentRangeEnd w:id="1"/>
  </w:p>`;

  const pEl = parseXmlString(docxXml).documentElement;
  // Trích xuất oMath bên trong paragraph có comment
  const mathEl = pEl.getElementsByTagNameNS("http://schemas.openxmlformats.org/officeDocument/2006/math", "oMath")[0];
  assert.ok(mathEl);
  const parsed = OmmlEngine.parseOmml(mathEl);
  assert.equal(parsed.latex, "\\frac{a}{b}");
});

test("Phase 5 - 13. End-to-End Semantic Round-Trip: Word OMML -> Editor -> Export -> Native OMML", async () => {
  const model: DocumentModel = {
    metadata: {
      title: "OMML Round-Trip Test",
      author: "Hoang",
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
          content: [{ type: "text", text: "Phương trình sóng:" }],
        },
        {
          type: "equation",
          attrs: {
            latex: "\\frac{1}{2} x^{2} + y = z",
            displayMode: true,
            alignment: "center",
          },
        },
      ],
    },
  };

  // 1. Export sang DOCX
  const docxBytes = await exportDocumentModelToDocx(model);
  assert.ok(docxBytes.byteLength > 1000);

  // 2. Re-import DOCX
  const importRes = await importDocxToDocumentModel(docxBytes, "EquationTest.docx");
  assert.equal(importRes.success, true);
  const importedDoc = importRes.document;
  assert.ok(importedDoc);

  // 3. Kiểm tra block equation đã được khôi phục nguyên vẹn
  const blocks = importedDoc.content.content || [];
  const eqBlock = blocks.find((b) => b.type === "equation");
  assert.ok(eqBlock, "Block Equation phải tồn tại trong DocumentModel");
  assert.ok(eqBlock.attrs?.latex, "Latex phải tồn tại");
  assert.ok(eqBlock.attrs.latex.includes("\\frac{1}{2}"));
  assert.ok(eqBlock.attrs.latex.includes("x^{2}"));
});
