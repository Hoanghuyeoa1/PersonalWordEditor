import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  importDocxToDocumentModel,
  readDocxPackage,
  parseRelationships,
  parseStyles,
  parseNumbering,
  parseSectionPageSettings,
  detectPaperSizeFromTwips,
  parseHeaderFooterXml,
} from "./index.ts";
import { parseXmlString } from "./utils/xmlUtils.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import { saveDocumentFile } from "../file/fileOperations.ts";

// Helper: 1x1 transparent PNG binary bytes
const SAMPLE_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/**
 * Tạo một file .docx mẫu trong bộ nhớ với đầy đủ các thành phần kiểm thử
 */
async function createSampleDocxBuffer(): Promise<Uint8Array> {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Default Extension="png" ContentType="image/png"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
      <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
      <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
      <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
    </Types>`
  );

  // 2. _rels/.rels
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );

  // 3. word/_rels/document.xml.rels
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      <Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
      <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
      <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
      <Relationship Id="rIdLink1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://google.com" TargetMode="External"/>
      <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
    </Relationships>`
  );

  // 4. word/styles.xml
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
        <w:rPr>
          <w:rFonts w:ascii="Calibri"/>
          <w:sz w:val="24"/>
        </w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
        <w:basedOn w:val="Normal"/>
        <w:rPr>
          <w:b/>
          <w:sz w:val="36"/>
          <w:color w:val="1E40AF"/>
        </w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading2">
        <w:name w:val="heading 2"/>
        <w:basedOn w:val="Normal"/>
        <w:rPr>
          <w:b/>
          <w:sz w:val="28"/>
        </w:rPr>
      </w:style>
    </w:styles>`
  );

  // 5. word/numbering.xml
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <!-- Bullet list -->
      <w:abstractNum w:abstractNumId="0">
        <w:lvl w:ilvl="0">
          <w:numFmt w:val="bullet"/>
          <w:lvlText w:val=""/>
        </w:lvl>
        <w:lvl w:ilvl="1">
          <w:numFmt w:val="bullet"/>
          <w:lvlText w:val="o"/>
        </w:lvl>
      </w:abstractNum>
      <!-- Ordered list -->
      <w:abstractNum w:abstractNumId="1">
        <w:lvl w:ilvl="0">
          <w:numFmt w:val="decimal"/>
          <w:lvlText w:val="%1."/>
        </w:lvl>
      </w:abstractNum>
      <w:num w:numId="1">
        <w:abstractNumId w:val="0"/>
      </w:num>
      <w:num w:numId="2">
        <w:abstractNumId w:val="1"/>
      </w:num>
    </w:numbering>`
  );

  // 6. word/header1.xml
  zip.file(
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:p>
        <w:pPr>
          <w:jc w:val="center"/>
        </w:pPr>
        <w:r>
          <w:rPr><w:b/></w:rPr>
          <w:t>Tiêu đề đầu trang mẫu</w:t>
        </w:r>
      </w:p>
    </w:hdr>`
  );

  // 7. word/footer1.xml
  zip.file(
    "word/footer1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:p>
        <w:pPr>
          <w:jc w:val="right"/>
        </w:pPr>
        <w:r>
          <w:t>Trang </w:t>
        </w:r>
        <w:fldSimple w:instr="PAGE"/>
        <w:r>
          <w:t> / </w:t>
        </w:r>
        <w:fldSimple w:instr="NUMPAGES"/>
      </w:p>
    </w:ftr>`
  );

  // 8. word/media/image1.png
  zip.file("word/media/image1.png", SAMPLE_PNG_BYTES);

  // 9. word/document.xml
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <w:body>
        <!-- Heading 1 -->
        <w:p>
          <w:pPr>
            <w:pStyle w:val="Heading1"/>
            <w:jc w:val="center"/>
          </w:pPr>
          <w:r>
            <w:t>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</w:t>
          </w:r>
        </w:p>

        <!-- Heading 2 -->
        <w:p>
          <w:pPr>
            <w:pStyle w:val="Heading2"/>
            <w:jc w:val="center"/>
          </w:pPr>
          <w:r>
            <w:t>Độc lập - Tự do - Hạnh phúc</w:t>
          </w:r>
        </w:p>

        <!-- Paragraph với rich formatting (bold, italic, underline, strike, font, color, highlight) -->
        <w:p>
          <w:pPr>
            <w:jc w:val="justify"/>
            <w:spacing w:line="360" w:lineRule="auto"/>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:b/>
              <w:color w:val="DC2626"/>
            </w:rPr>
            <w:t>Chữ in đậm màu đỏ </w:t>
          </w:r>
          <w:r>
            <w:rPr>
              <w:i/>
              <w:u w:val="single"/>
            </w:rPr>
            <w:t>chữ in nghiêng và gạch chân </w:t>
          </w:r>
          <w:r>
            <w:rPr>
              <w:strike/>
              <w:highlight w:val="yellow"/>
            </w:rPr>
            <w:t>chữ gạch ngang highlight vàng</w:t>
          </w:r>
          <w:r>
            <w:br/>
          </w:r>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman"/>
              <w:sz w:val="32"/>
            </w:rPr>
            <w:t>Dòng mới với phông Times New Roman 16pt.</w:t>
          </w:r>
        </w:p>

        <!-- Bullet list item 1 & 2 & nested item -->
        <w:p>
          <w:pPr>
            <w:numPr>
              <w:ilvl w:val="0"/>
              <w:numId w:val="1"/>
            </w:numPr>
          </w:pPr>
          <w:r>
            <w:t>Mục dấu chấm 1</w:t>
          </w:r>
        </w:p>
        <w:p>
          <w:pPr>
            <w:numPr>
              <w:ilvl w:val="1"/>
              <w:numId w:val="1"/>
            </w:numPr>
          </w:pPr>
          <w:r>
            <w:t>Mục dấu chấm cấp 2 con</w:t>
          </w:r>
        </w:p>
        <w:p>
          <w:pPr>
            <w:numPr>
              <w:ilvl w:val="0"/>
              <w:numId w:val="1"/>
            </w:numPr>
          </w:pPr>
          <w:r>
            <w:t>Mục dấu chấm 2</w:t>
          </w:r>
        </w:p>

        <!-- Numbered list -->
        <w:p>
          <w:pPr>
            <w:numPr>
              <w:ilvl w:val="0"/>
              <w:numId w:val="2"/>
            </w:numPr>
          </w:pPr>
          <w:r>
            <w:t>Bước 1: Khởi động hệ thống</w:t>
          </w:r>
        </w:p>
        <w:p>
          <w:pPr>
            <w:numPr>
              <w:ilvl w:val="0"/>
              <w:numId w:val="2"/>
            </w:numPr>
          </w:pPr>
          <w:r>
            <w:t>Bước 2: Nạp dữ liệu</w:t>
          </w:r>
        </w:p>

        <!-- Hyperlink -->
        <w:p>
          <w:r>
            <w:t>Truy cập vào trang: </w:t>
          </w:r>
          <w:hyperlink r:id="rIdLink1">
            <w:r>
              <w:rPr>
                <w:u w:val="single"/>
                <w:color w:val="2563EB"/>
              </w:rPr>
              <w:t>Google Tìm Kiếm</w:t>
            </w:r>
          </w:hyperlink>
        </w:p>

        <!-- Table với Header, Shading, Colspan -->
        <w:tbl>
          <w:tblPr>
            <w:tblBorders>
              <w:top w:val="single"/>
              <w:left w:val="single"/>
              <w:bottom w:val="single"/>
              <w:right w:val="single"/>
            </w:tblBorders>
          </w:tblPr>
          <!-- Row 1: Header -->
          <w:tr>
            <w:trPr>
              <w:tblHeader/>
            </w:trPr>
            <w:tc>
              <w:tcPr>
                <w:shd w:fill="E2E8F0"/>
                <w:vAlign w:val="center"/>
              </w:tcPr>
              <w:p>
                <w:r><w:rPr><w:b/></w:rPr><w:t>Cột A</w:t></w:r>
              </w:p>
            </w:tc>
            <w:tc>
              <w:tcPr>
                <w:shd w:fill="E2E8F0"/>
                <w:vAlign w:val="center"/>
              </w:tcPr>
              <w:p>
                <w:r><w:rPr><w:b/></w:rPr><w:t>Cột B</w:t></w:r>
              </w:p>
            </w:tc>
          </w:tr>
          <!-- Row 2: Data row có colspan -->
          <w:tr>
            <w:tc>
              <w:tcPr>
                <w:gridSpan w:val="2"/>
                <w:shd w:fill="FEF08A"/>
              </w:tcPr>
              <w:p>
                <w:pPr><w:jc w:val="center"/></w:pPr>
                <w:r><w:t>Ô gộp 2 cột (Merged Cell)</w:t></w:r>
              </w:p>
            </w:tc>
          </w:tr>
        </w:tbl>

        <!-- Image -->
        <w:p>
          <w:r>
            <w:drawing>
              <wp:inline>
                <wp:extent cx="1905000" cy="952500"/>
                <a:graphic>
                  <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:pic>
                      <pic:blipFill>
                        <a:blip r:embed="rIdImg1"/>
                      </pic:blipFill>
                    </pic:pic>
                  </a:graphicData>
                </a:graphic>
              </wp:inline>
            </w:drawing>
          </w:r>
        </w:p>

        <!-- Page Break -->
        <w:p>
          <w:r>
            <w:t>Đoạn văn trước ngắt trang</w:t>
          </w:r>
          <w:r>
            <w:br w:type="page"/>
          </w:r>
          <w:r>
            <w:t>Đoạn văn sau ngắt trang</w:t>
          </w:r>
        </w:p>

        <!-- Section 1 kết thúc tại paragraph này với Section Break (Next Page) -->
        <w:p>
          <w:pPr>
            <w:sectPr>
              <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
              <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
              <w:headerReference w:type="default" r:id="rIdHeader1"/>
              <w:footerReference w:type="default" r:id="rIdFooter1"/>
            </w:sectPr>
          </w:pPr>
          <w:r>
            <w:t>Nội dung cuối của Section 1</w:t>
          </w:r>
        </w:p>

        <!-- Section 2: Trang ngang Landscape A4 -->
        <w:p>
          <w:r>
            <w:t>Nội dung trong Section 2 (Khổ ngang)</w:t>
          </w:r>
        </w:p>

        <!-- Section properties cuối cùng của document (áp dụng cho Section cuối) -->
        <w:sectPr>
          <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
          <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
        </w:sectPr>
      </w:body>
    </w:document>`
  );

  return zip.generateAsync({ type: "uint8array" });
}

/* ==========================================================================
   BỘ KIỂM THỬ CHUYÊN BIỆT CHO DOCX IMPORT ENGINE (PHASE 4.1)
   ========================================================================== */

test("DOCX 1: Package Reader reads required parts and handles corrupt zip gracefully", async () => {
  const bytes = await createSampleDocxBuffer();
  const pkg = await readDocxPackage(bytes);

  assert.ok(pkg.documentXml, "Must have documentXml");
  assert.ok(pkg.stylesXml, "Must have stylesXml");
  assert.ok(pkg.numberingXml, "Must have numberingXml");
  assert.ok(pkg.documentRelsXml, "Must have documentRelsXml");
  assert.equal(pkg.mediaFiles.size, 1, "Must find 1 media file");
  assert.ok(pkg.headersXml.size >= 1, "Must have header1.xml");
  assert.ok(pkg.footersXml.size >= 1, "Must have footer1.xml");

  // Invalid zip throws readable error
  await assert.rejects(
    async () => readDocxPackage(new Uint8Array([1, 2, 3, 4, 5])),
    /không thể đọc tệp \.docx/i
  );
});

test("DOCX 2: Relationships Parser maps links, images, and headers/footers accurately", () => {
  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdLink" Type=".../hyperlink" Target="https://antigravity.dev" TargetMode="External"/>
      <Relationship Id="rIdImg" Type=".../image" Target="media/photo.png"/>
      <Relationship Id="rIdHdr" Type=".../header" Target="header1.xml"/>
    </Relationships>`;

  const rels = parseRelationships(relsXml);
  assert.equal(rels.get("rIdLink")?.target, "https://antigravity.dev");
  assert.equal(rels.get("rIdLink")?.targetMode, "External");
  assert.equal(rels.get("rIdImg")?.target, "word/media/photo.png");
  assert.equal(rels.get("rIdHdr")?.target, "word/header1.xml");
});

test("DOCX 3: Styles Parser handles inheritance and heading levels", () => {
  const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Normal">
        <w:rPr>
          <w:rFonts w:ascii="Calibri"/>
          <w:sz w:val="24"/>
        </w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
        <w:basedOn w:val="Normal"/>
        <w:rPr>
          <w:b/>
          <w:sz w:val="40"/>
          <w:color w:val="2563EB"/>
        </w:rPr>
      </w:style>
    </w:styles>`;

  const styles = parseStyles(stylesXml);
  const h1 = styles.get("Heading1");
  assert.ok(h1);
  assert.equal(h1.headingLevel, 1);
  assert.equal(h1.runFormatting.bold, true);
  assert.equal(h1.runFormatting.fontSizePt, 20); // 40 half-points -> 20pt
  assert.equal(h1.runFormatting.color, "#2563EB");
  // Inherited from Normal:
  assert.equal(h1.runFormatting.fontFamily, "Calibri");
});

test("DOCX 4: Numbering Parser identifies bullet and decimal lists", () => {
  const numberingXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:abstractNum w:abstractNumId="10">
        <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val=""/></w:lvl>
      </w:abstractNum>
      <w:abstractNum w:abstractNumId="20">
        <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
      </w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
      <w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
    </w:numbering>`;

  const reg = parseNumbering(numberingXml);
  const bullet = reg.abstractNums.get("10")?.levels.get(0);
  assert.equal(bullet?.isBullet, true);

  const decimal = reg.abstractNums.get("20")?.levels.get(0);
  assert.equal(decimal?.isBullet, false);
});

test("DOCX 5: Page Settings and Paper Dimensions conversion", () => {
  // A4 Portrait: 11906 x 16838
  const a4 = detectPaperSizeFromTwips(11906, 16838);
  assert.equal(a4.paperSize, "A4");
  assert.equal(a4.orientation, "portrait");

  // A4 Landscape: 16838 x 11906
  const a4L = detectPaperSizeFromTwips(16838, 11906);
  assert.equal(a4L.paperSize, "A4");
  assert.equal(a4L.orientation, "landscape");

  // Letter: 12240 x 15840
  const letter = detectPaperSizeFromTwips(12240, 15840);
  assert.equal(letter.paperSize, "Letter");

  // Margins
  const sectXml = `<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
  </w:sectPr>`;
  const doc = parseXmlString(sectXml);
  const settings = parseSectionPageSettings(doc.documentElement);
  assert.equal(settings.paperSize, "A4");
  assert.equal(settings.orientation, "portrait");
  assert.equal(settings.margins.top, 25.4);
  assert.equal(settings.marginPreset, "Normal");
});

test("DOCX 6: Header/Footer XML parses text and {PAGE}/{NUMPAGES} tokens", () => {
  const hfXml = `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:t>Trang </w:t></w:r>
      <w:fldSimple w:instr="PAGE"/>
      <w:r><w:t> trên </w:t></w:r>
      <w:fldSimple w:instr="NUMPAGES"/>
    </w:p>
  </w:ftr>`;

  const item = parseHeaderFooterXml(hfXml);
  assert.ok(item);
  assert.equal(item.alignment, "right");
  assert.ok(item.text.includes("{PAGE}"));
  assert.ok(item.text.includes("{NUMPAGES}"));
});

test("DOCX 7: End-to-end importDocxToDocumentModel with all rich objects", async () => {
  const bytes = await createSampleDocxBuffer();
  const res = await importDocxToDocumentModel(bytes, "BaoCaoKhoaHoc.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const doc = res.document;
  assert.ok(doc, "Document must be defined");
  assert.equal(doc.metadata.title, "BaoCaoKhoaHoc");
  assert.equal(doc.content.type, "doc");

  const blocks = doc.content.content || [];
  assert.ok(blocks.length > 5, "Must contain multiple blocks");

  // 1. Heading 1 & Heading 2
  const h1 = blocks.find((b) => b.type === "heading" && b.attrs?.level === 1);
  assert.ok(h1, "Heading 1 must exist");
  assert.equal(h1.attrs?.textAlign, "center");
  const h1Text = h1.content?.[0]?.text;
  assert.equal(h1Text, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM");

  const h2 = blocks.find((b) => b.type === "heading" && b.attrs?.level === 2);
  assert.ok(h2, "Heading 2 must exist");
  assert.equal(h2.content?.[0]?.text, "Độc lập - Tự do - Hạnh phúc");

  // 2. Rich paragraph
  const richPara = blocks.find(
    (b) =>
      b.type === "paragraph" &&
      b.content?.some((r) => r.text?.includes("Chữ in đậm màu đỏ"))
  );
  assert.ok(richPara, "Rich paragraph must exist");
  const boldRedRun = richPara.content?.find((r) => r.text?.includes("Chữ in đậm màu đỏ"));
  assert.ok(boldRedRun?.marks?.some((m) => m.type === "bold"));
  assert.ok(
    boldRedRun?.marks?.some((m) => m.type === "textStyle" && m.attrs?.color === "#DC2626")
  );

  const italicUnderlineRun = richPara.content?.find((r) =>
    r.text?.includes("chữ in nghiêng và gạch chân")
  );
  assert.ok(italicUnderlineRun?.marks?.some((m) => m.type === "italic"));
  assert.ok(italicUnderlineRun?.marks?.some((m) => m.type === "underline"));

  const strikeHlRun = richPara.content?.find((r) =>
    r.text?.includes("chữ gạch ngang highlight vàng")
  );
  assert.ok(strikeHlRun?.marks?.some((m) => m.type === "strike"));
  assert.ok(strikeHlRun?.marks?.some((m) => m.type === "highlight"));

  // 3. Bullet & Ordered Lists
  const bulletList = blocks.find((b) => b.type === "bulletList");
  assert.ok(bulletList, "Bullet list must exist");
  assert.ok(bulletList.content && bulletList.content.length >= 2);
  assert.equal(bulletList.content[0].type, "listItem");

  const orderedList = blocks.find((b) => b.type === "orderedList");
  assert.ok(orderedList, "Ordered list must exist");
  assert.equal(orderedList.content?.[0]?.type, "listItem");

  // 4. Hyperlink
  const linkPara = blocks.find((b) =>
    b.content?.some((r) => r.marks?.some((m) => m.type === "link"))
  );
  assert.ok(linkPara, "Hyperlink paragraph must exist");
  const linkRun = linkPara.content?.find((r) =>
    r.marks?.some((m) => m.type === "link")
  );
  assert.equal(
    linkRun?.marks?.find((m) => m.type === "link")?.attrs?.href,
    "https://google.com"
  );

  // 5. Table
  const table = blocks.find((b) => b.type === "table");
  assert.ok(table, "Table must exist");
  assert.equal(table.content?.length, 2, "Table must have 2 rows");
  const headerRow = table.content?.[0];
  assert.equal(headerRow?.content?.[0]?.type, "tableHeader");
  const mergedRow = table.content?.[1];
  assert.equal(mergedRow?.content?.[0]?.attrs?.colspan, 2, "Merged cell colspan must be 2");

  // 6. Image
  const imgNode = blocks.find((b) => b.type === "image");
  assert.ok(imgNode, "Image node must exist");
  assert.ok(imgNode.attrs?.src?.startsWith("data:image/png;base64,"));
  assert.ok(imgNode.attrs?.width > 0);
  assert.ok(imgNode.attrs?.height > 0);

  // 7. Page Break
  const pageBreakNode = blocks.find((b) => b.type === "pageBreak");
  assert.ok(pageBreakNode, "Page break node must exist");

  // 8. Section Break
  const secBreakNode = blocks.find((b) => b.type === "sectionBreak");
  assert.ok(secBreakNode, "Section break node must exist");

  // 9. Page Settings & Header/Footer
  assert.equal(doc.pageSettings.paperSize, "A4");
  assert.ok(doc.headerFooter?.header?.text.includes("Tiêu đề đầu trang mẫu"));
  assert.ok(doc.headerFooter?.footer?.text.includes("{PAGE}"));

  // 10. Multi-section detection
  assert.ok(doc.sections && doc.sections.length >= 2, "Must detect 2 sections");
});

test("DOCX 8: Save As .mwd -> Close -> Open .mwd Round-Trip Verification", async () => {
  const bytes = await createSampleDocxBuffer();
  const res = await importDocxToDocumentModel(bytes, "ChuyenDoiDinhDang.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  const originalDoc = res.document;

  // 1. Serialize sang tệp chuẩn .mwd
  const serializedMwd = serializeDocumentToMwd(originalDoc);
  assert.ok(serializedMwd.length > 500);

  // 2. Deserialize lại từ chuỗi .mwd
  const deserialized = deserializeMwdToDocument(serializedMwd);
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const roundtripDoc = deserialized.document;

  // 3. Kiểm tra tính toàn vẹn 100% của AST và Metadata
  assert.equal(roundtripDoc.metadata.title, originalDoc.metadata.title);
  assert.deepEqual(roundtripDoc.content, originalDoc.content);
  assert.deepEqual(roundtripDoc.pageSettings, originalDoc.pageSettings);
  assert.deepEqual(roundtripDoc.headerFooter, originalDoc.headerFooter);
});

test("DOCX 9: DocumentStore Dirty State and Save Protection against DOCX overwriting", async () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const bytes = await createSampleDocxBuffer();
  const res = await importDocxToDocumentModel(bytes, "KiemTraDirtyState.docx");
  assert.equal(res.success, true);
  if (!res.success) return;

  // Nạp vào DocumentStore
  store.setDocument(res.document, null);

  // Ngay sau khi import / open:
  assert.equal(useDocumentStore.getState().isDirty, false, "Must NOT be dirty immediately after open");
  assert.equal(useDocumentStore.getState().documentTitle, "KiemTraDirtyState");

  // Sau khi user chỉnh sửa nội dung:
  store.updateContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản đã qua chỉnh sửa" }],
      },
    ],
  });
  assert.equal(useDocumentStore.getState().isDirty, true, "Must become dirty after modification");
});

test("DOCX 10: Robustness - missing image, unknown style, or empty paragraph does not crash", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="UnknownNonExistentStyle"/></w:pPr>
          <w:r><w:t>Văn bản với style không tồn tại</w:t></w:r>
        </w:p>
        <w:p/> <!-- Empty paragraph -->
        <w:p>
          <w:r>
            <w:drawing>
              <a:blip r:embed="rIdMissingImage999"/>
            </w:drawing>
          </w:r>
        </w:p>
        <w:p>
          <w:r><w:t>Văn bản tiếp theo</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const res = await importDocxToDocumentModel(bytes, "RobustnessTest.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  assert.ok(res.warnings.length > 0, "Must record warning for missing image");
  const paragraphs = res.document.content.content || [];
  assert.ok(paragraphs.length >= 2, "Must safely import remaining paragraphs");
});

test("DOCX 11: Complex Nested Lists (3 levels deep) are properly structured", async () => {
  const zip = new JSZip();
  zip.file(
    "word/numbering.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:abstractNum w:abstractNumId="5">
        <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
        <w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/></w:lvl>
        <w:lvl w:ilvl="2"><w:numFmt w:val="lowerRoman"/><w:lvlText w:val="%3."/></w:lvl>
      </w:abstractNum>
      <w:num w:numId="100"><w:abstractNumId w:val="5"/></w:num>
    </w:numbering>`
  );

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="100"/></w:numPr></w:pPr>
          <w:r><w:t>Cấp 1</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="100"/></w:numPr></w:pPr>
          <w:r><w:t>Cấp 2</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:numPr><w:ilvl w:val="2"/><w:numId w:val="100"/></w:numPr></w:pPr>
          <w:r><w:t>Cấp 3</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const res = await importDocxToDocumentModel(bytes, "NestedListTest.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const rootList = res.document.content.content?.[0];
  assert.equal(rootList?.type, "orderedList");
  assert.equal(rootList?.content?.[0]?.type, "listItem");
});

test("DOCX 12: Paragraph formatting variations (alignments, line spacings, indents)", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:jc w:val="right"/><w:spacing w:line="240"/><w:ind w:left="720"/></w:pPr>
          <w:r><w:t>Căn phải, giãn 1.0, thụt lề cấp 1</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:jc w:val="both"/><w:spacing w:line="480"/><w:ind w:left="1440"/></w:pPr>
          <w:r><w:t>Căn đều, giãn 2.0, thụt lề cấp 2</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const res = await importDocxToDocumentModel(bytes, "ParagraphFormatTest.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const blocks = res.document.content.content || [];
  assert.equal(blocks[0].attrs?.textAlign, "right");
  assert.equal(blocks[0].attrs?.lineSpacing, 1.0);
  assert.equal(blocks[0].attrs?.indent, 1);

  assert.equal(blocks[1].attrs?.textAlign, "justify");
  assert.equal(blocks[1].attrs?.lineSpacing, 2.0);
  assert.equal(blocks[1].attrs?.indent, 2);
});

test("DOCX 13: Full Vietnamese Unicode content and symbols preservation", async () => {
  const zip = new JSZip();
  const vietnameseSample = "Kính gửi Ban Giám đốc: Báo cáo kết quả dự án quý III/2026. Chúc sức khỏe và thành công!";

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:t>${vietnameseSample}</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>`
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const res = await importDocxToDocumentModel(bytes, "BaoCaoTiengViet.docx");

  assert.equal(res.success, true);
  if (!res.success) return;

  const extracted = res.document.content.content?.[0]?.content?.[0]?.text;
  assert.equal(extracted, vietnameseSample);
});

