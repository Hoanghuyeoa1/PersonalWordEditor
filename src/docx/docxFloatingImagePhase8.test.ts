import test from "node:test";
import assert from "node:assert/strict";
import { parseXmlString } from "./utils/xmlUtils.ts";
import { parseDrawingElement } from "./drawing/drawingPositionParser.ts";
import { serializeDrawingContainer } from "./drawing/drawingPositionSerializer.ts";
import { DrawingPositionService, emuToSignedPixels, pixelsToSignedEmu } from "./drawing/drawingPositionService.ts";
import { parseMediaItems, normalizeMediaTargetPaths } from "./media/mediaParser.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import { DocumentSerializer } from "./mapping/documentSerializer.ts";
import type { DocumentMapperContext } from "./mapping/documentMapper.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import type { DrawingPosition } from "./drawing/drawingTypes.ts";
import JSZip from "jszip";

/**
 * Tạo mock context chuẩn cho Mapper
 */
function createMockMapperContext(): DocumentMapperContext {
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const sampleDataUrl = `data:image/png;base64,${samplePngBase64}`;

  const mediaByRelId = new Map<string, { filename: string; zipPath: string; mimeType: string; dataUrl: string }>();
  const mediaByPath = new Map<string, { filename: string; zipPath: string; mimeType: string; dataUrl: string }>();

  const item1 = {
    filename: "logo.png",
    zipPath: "word/media/logo.png",
    mimeType: "image/png",
    dataUrl: sampleDataUrl,
  };
  mediaByRelId.set("rIdLogo", item1);
  mediaByPath.set("word/media/logo.png", item1);
  mediaByPath.set("media/logo.png", item1);
  mediaByPath.set("logo.png", item1);

  const relationships = new Map<string, { id: string; type: string; target: string }>();
  relationships.set("rIdLogo", {
    id: "rIdLogo",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: "media/logo.png",
  });

  return {
    styles: {
      defaultStyles: {
        paragraph: { styleId: "Normal", name: "Normal", type: "paragraph", isDefault: true },
        character: { styleId: "DefaultParagraphFont", name: "Default Paragraph Font", type: "character", isDefault: true },
      },
      paragraphStyles: new Map(),
      characterStyles: new Map(),
      tableStyles: new Map(),
    },
    styleIdMap: new Map(),
    documentStyles: {
      version: 2,
      styles: [],
      defaultParagraphStyleId: "Normal",
      defaultCharacterStyleId: "DefaultParagraphFont",
    },
    relationships,
    mediaByRelId,
    mediaByPath,
    numbering: { abstractNumMap: new Map(), numMap: new Map() },
    warnings: [],
    activeCommentIds: new Set(),
    commentAnchorTexts: new Map(),
    trackedChangesMap: new Map(),
  };
}

// 1. INLINE IMAGE REGRESSION: wp:inline continues importing as inline, not floating
test("PHASE 8 - 1. Inline Image Regression: wp:inline is parsed as inline image, never floating", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="1905000" cy="952500"/>
        <wp:docPr id="10" name="Company Logo" descr="Header Logo"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="10" name="Company Logo"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rIdLogo"/>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></a:xfrm>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed, "Đối tượng drawing phải được parse thành công");
  assert.equal(parsed.payload.kind, "image");
  assert.equal(parsed.position.placement, "inline", "wp:inline phải giữ nguyên placement=inline");
  assert.equal(parsed.position.wrapMode, "inline", "wp:inline phải có wrapMode=inline");
  assert.equal(parsed.position.width, 200, "1,905,000 EMU = 200 px");
  assert.equal(parsed.position.height, 100, "952,500 EMU = 100 px");

  // Export serialization test for inline image
  const serialized = serializeDrawingContainer({
    position: parsed.position,
    docPrId: 10,
    docPrName: "Company Logo",
    docPrDescription: "Header Logo",
    graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
    graphicContentXml: "<pic:pic/>",
  });

  assert.ok(serialized.includes("<wp:inline"), "Phải xuất thẻ <wp:inline>");
  assert.ok(!serialized.includes("<wp:anchor"), "Tuyệt đối không xuất <wp:anchor> cho ảnh inline");
});

// 2. FLOATING IMAGE IMPORT: wp:anchor + Relationship -> Image node + floating metadata
test("PHASE 8 - 2. Floating Image Import: wp:anchor maps to Image node with full floating metadata", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor distT="47625" distB="47625" distL="95250" distR="95250"
                 simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
        <wp:simplePos x="0" y="0"/>
        <wp:positionH relativeFrom="margin">
          <wp:align>right</wp:align>
        </wp:positionH>
        <wp:positionV relativeFrom="paragraph">
          <wp:posOffset>190500</wp:posOffset>
        </wp:positionV>
        <wp:extent cx="2857500" cy="1905000"/>
        <wp:wrapSquare wrapText="bothSides"/>
        <wp:docPr id="42" name="Product Shot" descr="Figure 1: Main Product"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.payload.kind, "image");
  assert.equal(parsed.position.placement, "floating", "wp:anchor phải có placement=floating");
  assert.equal(parsed.position.width, 300, "2,857,500 EMU = 300 px");
  assert.equal(parsed.position.height, 200, "1,905,000 EMU = 200 px");
  assert.equal(parsed.position.wrapMode, "square");
  assert.equal(parsed.position.horizontalRelative, "margin");
  assert.equal(parsed.position.horizontalAlign, "right");
  assert.equal(parsed.position.verticalRelative, "paragraph");
  assert.equal(parsed.position.offsetY, 20, "190,500 EMU = 20 px");
  assert.equal(parsed.position.distT, 5, "47,625 EMU = 5 px");
  assert.equal(parsed.position.distL, 10, "95,250 EMU = 10 px");
  assert.equal(parsed.position.docPrId, 42);
  assert.equal(parsed.position.docPrName, "Product Shot");
  assert.equal(parsed.position.docPrDescription, "Figure 1: Main Product");
});

// 3. HORIZONTAL & VERTICAL ALIGNMENT PRESERVATION (Left, Center, Right)
test("PHASE 8 - 3. Position Alignment: left, center, right with various relativeFrom frames", () => {
  const ctx = createMockMapperContext();

  const createAlignXml = (alignH: string, relH: string, alignV: string, relV: string) => `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor behindDoc="0" allowOverlap="1">
        <wp:positionH relativeFrom="${relH}">
          <wp:align>${alignH}</wp:align>
        </wp:positionH>
        <wp:positionV relativeFrom="${relV}">
          <wp:align>${alignV}</wp:align>
        </wp:positionV>
        <wp:extent cx="952500" cy="952500"/>
        <wp:wrapNone/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic><pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill></pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  // Test Left aligned to Margin
  const docLeft = parseXmlString(createAlignXml("left", "margin", "top", "page"));
  const parsedLeft = parseDrawingElement(docLeft.documentElement, ctx);
  assert.equal(parsedLeft?.position.horizontalAlign, "left");
  assert.equal(parsedLeft?.position.horizontalRelative, "margin");
  assert.equal(parsedLeft?.position.verticalAlign, "top");
  assert.equal(parsedLeft?.position.verticalRelative, "page");

  // Test Center aligned to Page
  const docCenter = parseXmlString(createAlignXml("center", "page", "center", "page"));
  const parsedCenter = parseDrawingElement(docCenter.documentElement, ctx);
  assert.equal(parsedCenter?.position.horizontalAlign, "center");
  assert.equal(parsedCenter?.position.horizontalRelative, "page");
  assert.equal(parsedCenter?.position.verticalAlign, "center");
  assert.equal(parsedCenter?.position.verticalRelative, "page");

  // Test Right aligned to Column
  const docRight = parseXmlString(createAlignXml("right", "column", "bottom", "margin"));
  const parsedRight = parseDrawingElement(docRight.documentElement, ctx);
  assert.equal(parsedRight?.position.horizontalAlign, "right");
  assert.equal(parsedRight?.position.horizontalRelative, "column");
  assert.equal(parsedRight?.position.verticalAlign, "bottom");
  assert.equal(parsedRight?.position.verticalRelative, "margin");
});

// 4. SIGNED OFFSETS & COORDINATE CONVERSION (Positive & Negative)
test("PHASE 8 - 4. Signed Offsets: positive and negative offsets round-trip with exact logical px", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor behindDoc="1" allowOverlap="0">
        <wp:positionH relativeFrom="page">
          <wp:posOffset>-476250</wp:posOffset>
        </wp:positionH>
        <wp:positionV relativeFrom="paragraph">
          <wp:posOffset>714375</wp:posOffset>
        </wp:positionV>
        <wp:extent cx="1428750" cy="952500"/>
        <wp:wrapNone/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic><pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill></pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);
  assert.ok(parsed);

  assert.equal(parsed.position.offsetX, -50, "-476,250 EMU = -50 px");
  assert.equal(parsed.position.offsetY, 75, "714,375 EMU = 75 px");
  assert.equal(parsed.position.behindDoc, true, "behindDoc phải là true");
  assert.equal(parsed.position.allowOverlap, false, "allowOverlap phải là false");

  // Serialization test
  const serialized = serializeDrawingContainer({
    position: parsed.position,
    docPrId: 99,
    docPrName: "Watermark",
    graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
    graphicContentXml: "<pic:pic/>",
  });

  assert.ok(serialized.includes("<wp:posOffset>-476250</wp:posOffset>"), "Phải giữ offset âm chính xác");
  assert.ok(serialized.includes("<wp:posOffset>714375</wp:posOffset>"), "Phải giữ offset dương chính xác");
  assert.ok(serialized.includes('behindDoc="1"'));
  assert.ok(serialized.includes('allowOverlap="0"'));
});

// 5. PAGE ENGINE INTEGRATION CONTRACT: resolveLayoutPosition
test("PHASE 8 - 5. Page Engine Integration Contract: FloatingObjectLayoutContract calculates layout coordinates", () => {
  const service = new DrawingPositionService();

  const pageContext = {
    pageWidthPx: 800,
    pageHeightPx: 1100,
    marginsPx: { top: 96, bottom: 96, left: 96, right: 96 },
    paragraphTopPx: 300,
    paragraphLeftPx: 96,
    paragraphWidthPx: 608,
  };

  // Case A: Floating Image Right-aligned to Margin
  const posA: DrawingPosition = {
    placement: "floating",
    width: 200,
    height: 150,
    distT: 10,
    distB: 10,
    distL: 10,
    distR: 10,
    wrapMode: "square",
    horizontalRelative: "margin",
    horizontalAlign: "right",
    verticalRelative: "paragraph",
    offsetY: 20,
  };

  const layoutA = service.resolveLayoutPosition(posA, pageContext);
  assert.equal(layoutA.width, 200);
  assert.equal(layoutA.height, 150);
  assert.equal(layoutA.x, 800 - 96 - 200, "X phải ở lề phải: 504px");
  assert.equal(layoutA.y, 300 + 20, "Y phải ở paragraphTop + offsetY: 320px");

  // Case B: Floating Image Centered on Page
  const posB: DrawingPosition = {
    placement: "floating",
    width: 400,
    height: 300,
    distT: 0,
    distB: 0,
    distL: 0,
    distR: 0,
    wrapMode: "topAndBottom",
    horizontalRelative: "page",
    horizontalAlign: "center",
    verticalRelative: "page",
    verticalAlign: "center",
  };

  const layoutB = service.resolveLayoutPosition(posB, pageContext);
  assert.equal(layoutB.x, (800 - 400) / 2, "X phải ở giữa trang: 200px");
  assert.equal(layoutB.y, (1100 - 300) / 2, "Y phải ở giữa trang: 400px");
});

// 6. MEDIA PARSER & SESSION CACHE: single decode & multi-alias lookup
test("PHASE 8 - 6. Media Parser & Session Cache: no duplicate decode and multi-alias resolution", () => {
  const sampleBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const mediaFiles = new Map<string, Uint8Array>();
  mediaFiles.set("word/media/figure1.png", sampleBytes);

  const relationships = new Map<string, { id: string; type: string; target: string }>();
  // rId1 trỏ theo đường dẫn tương đối từ word/ (media/figure1.png)
  relationships.set("rId1", {
    id: "rId1",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: "media/figure1.png",
  });
  // rId2 trỏ theo tên file (figure1.png)
  relationships.set("rId2", {
    id: "rId2",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: "figure1.png",
  });
  // rId3 trỏ theo đường dẫn đầy đủ (word/media/figure1.png)
  relationships.set("rId3", {
    id: "rId3",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: "word/media/figure1.png",
  });

  const { mediaByPath, mediaByRelId } = parseMediaItems(mediaFiles, relationships);

  assert.ok(mediaByRelId.has("rId1"), "Phải giải quyết được media/figure1.png");
  assert.ok(mediaByRelId.has("rId2"), "Phải giải quyết được figure1.png");
  assert.ok(mediaByRelId.has("rId3"), "Phải giải quyết được word/media/figure1.png");

  // Cả 3 rId đều trỏ về cùng một instance mediaItem (cùng dataUrl, decode 1 lần)
  const item1 = mediaByRelId.get("rId1");
  const item2 = mediaByRelId.get("rId2");
  const item3 = mediaByRelId.get("rId3");
  assert.strictEqual(item1, item2, "Phải tái sử dụng cùng đối tượng media");
  assert.strictEqual(item2, item3, "Phải tái sử dụng cùng đối tượng media");
});

// 7. MISSING MEDIA RESILIENCE: non-fatal, logs warning, loads placeholder, does not drop object
test("PHASE 8 - 7. Missing Media Resilience: non-fatal warning, placeholder image and document loads cleanly", async () => {
  // Tạo package DOCX chứa document.xml có floating image nhưng thiếu tệp media trong ZIP
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <w:body>
        <w:p>
          <w:r><w:t>Đoạn văn có ảnh bị thiếu file media.</w:t></w:r>
          <w:r>
            <w:drawing>
              <wp:anchor behindDoc="0" allowOverlap="1">
                <wp:positionH relativeFrom="margin"><wp:align>right</wp:align></wp:positionH>
                <wp:positionV relativeFrom="paragraph"><wp:posOffset>95250</wp:posOffset></wp:positionV>
                <wp:extent cx="1905000" cy="952500"/>
                <wp:wrapSquare wrapText="bothSides"/>
                <wp:docPr id="55" name="Missing Diagram"/>
                <a:graphic>
                  <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:pic>
                      <pic:blipFill><a:blip r:embed="rIdBrokenMedia"/></pic:blipFill>
                    </pic:pic>
                  </a:graphicData>
                </a:graphic>
              </wp:anchor>
            </w:drawing>
          </w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdBrokenMedia" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/not_exist.png"/>
    </Relationships>`;

  const zip = new JSZip();
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", relsXml);
  // Cố tình KHÔNG đưa word/media/not_exist.png vào zip
  const docxBytes = await zip.generateAsync({ type: "uint8array" });

  const result = await importDocxToDocumentModel(docxBytes);

  // 1. Quá trình import không ném ngoại lệ
  assert.ok(result.document, "DocumentModel phải được tạo thành công");
  // 2. Ghi nhận warning cảnh báo không tìm thấy ảnh
  assert.ok(result.warnings.some((w) => w.includes("rIdBrokenMedia")));
  // 3. Node ảnh không bị drop, được nạp với placeholder
  const blocks = result.document.content.content || [];
  const imgBlock = blocks.find((b: any) => b.type === "image");
  assert.ok(imgBlock, "Node ảnh placeholder phải tồn tại trong document content");
  assert.ok(imgBlock.attrs?.isMissingMedia, "Node ảnh phải được đánh dấu isMissingMedia");
  assert.ok(imgBlock.attrs?.src.includes("data:image/svg+xml"), "src phải là SVG placeholder an toàn");
  assert.ok(imgBlock.attrs?.drawingPosition, "Metadata drawingPosition của ảnh floating phải được bảo toàn");
  assert.equal(imgBlock.attrs.drawingPosition.placement, "floating");
});

// 8. EXPORT INTEGRITY: inline image -> wp:inline, floating image -> wp:anchor
test("PHASE 8 - 8. Export Integrity: correctly emits wp:inline for inline and wp:anchor for floating", async () => {
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const sampleDataUrl = `data:image/png;base64,${samplePngBase64}`;

  const docModel: DocumentModel = {
    id: "doc_test_export_p8",
    title: "Test Image Export",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    styles: {
      version: 2,
      styles: [],
      defaultParagraphStyleId: "Normal",
      defaultCharacterStyleId: "DefaultParagraphFont",
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    },
    content: {
      type: "doc",
      content: [
        // 1. Inline Image
        {
          type: "image",
          attrs: {
            src: sampleDataUrl,
            alt: "Inline Banner",
            width: 400,
            height: 100,
            alignment: "center",
            drawingPosition: {
              placement: "inline",
              width: 400,
              height: 100,
              distT: 0,
              distB: 0,
              distL: 0,
              distR: 0,
              wrapMode: "inline",
            },
          },
        },
        // 2. Floating Image
        {
          type: "image",
          attrs: {
            src: sampleDataUrl,
            alt: "Floating Sidebar",
            width: 250,
            height: 180,
            alignment: "right",
            drawingPosition: {
              placement: "floating",
              width: 250,
              height: 180,
              distT: 10,
              distB: 10,
              distL: 10,
              distR: 10,
              wrapMode: "square",
              horizontalRelative: "margin",
              horizontalAlign: "right",
              verticalRelative: "paragraph",
              offsetY: 15,
            },
          },
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(docModel);
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra document.xml chứa cả 2 loại wp:inline và wp:anchor
  assert.ok(docXml.includes("<wp:inline"), "Phải chứa thẻ wp:inline cho ảnh inline");
  assert.ok(docXml.includes("<wp:anchor"), "Phải chứa thẻ wp:anchor cho ảnh floating");
  assert.ok(docXml.includes('<wp:wrapSquare wrapText="bothSides"/>'), "wp:anchor phải có wrapSquare");
  assert.ok(docXml.includes('<wp:positionH relativeFrom="margin"><wp:align>right</wp:align></wp:positionH>'));

  // Kiểm tra relationships và tệp media
  const relsXml = await zip.file("word/_rels/document.xml.rels")!.async("string");
  assert.ok(relsXml.includes('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"'));
  assert.ok(zip.file("word/media/image1.png") !== null, "Tệp media image1.png phải tồn tại");
});

// 9. FULL END-TO-END ROUND-TRIP: Word Floating Image -> Editor AST -> DOCX Export -> Re-import
test("PHASE 8 - 9. Complete End-to-End Round-Trip: Word Floating Image retains all layout semantics", async () => {
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const sampleDataUrl = `data:image/png;base64,${samplePngBase64}`;

  // Chuẩn bị DocumentModel ban đầu
  const originalDoc: DocumentModel = {
    id: "doc_roundtrip_floating_p8",
    title: "Roundtrip Floating Image",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    styles: {
      version: 2,
      styles: [],
      defaultParagraphStyleId: "Normal",
      defaultCharacterStyleId: "DefaultParagraphFont",
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn bản mở đầu báo cáo kỹ thuật." }],
        },
        {
          type: "image",
          attrs: {
            src: sampleDataUrl,
            alt: "Sơ đồ kiến trúc",
            title: "Hình 1: Kiến trúc",
            width: 320,
            height: 240,
            alignment: "right",
            drawingPosition: {
              placement: "floating",
              width: 320,
              height: 240,
              distT: 8,
              distB: 8,
              distL: 12,
              distR: 12,
              wrapMode: "square",
              horizontalRelative: "margin",
              horizontalAlign: "right",
              verticalRelative: "paragraph",
              offsetY: 25,
              behindDoc: false,
              allowOverlap: true,
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản bao quanh hình ảnh nổi bên phải." }],
        },
      ],
    },
  };

  // Bước 1: Export DocumentModel sang file DOCX
  const docxBytes = await exportDocumentModelToDocx(originalDoc);
  assert.ok(docxBytes.length > 0);

  // Bước 2: Import lại file DOCX vừa tạo
  const importedResult = await importDocxToDocumentModel(docxBytes);
  const importedDoc = importedResult.document;

  assert.ok(importedDoc);
  const blocks = importedDoc.content.content || [];
  const imgNode = blocks.find((b: any) => b.type === "image");

  assert.ok(imgNode, "Ảnh phải được phục hồi trong cây nội dung");
  assert.ok(imgNode.attrs?.drawingPosition, "Metadata drawingPosition phải được bảo toàn");

  const pos: DrawingPosition = imgNode.attrs.drawingPosition;
  assert.equal(pos.placement, "floating", "Vị trí phải giữ nguyên floating");
  assert.equal(pos.width, 320, "Chiều rộng phải bảo toàn 320px");
  assert.equal(pos.height, 240, "Chiều cao phải bảo toàn 240px");
  assert.equal(pos.wrapMode, "square", "wrapMode phải bảo toàn square");
  assert.equal(pos.horizontalRelative, "margin", "horizontalRelative phải bảo toàn margin");
  assert.equal(pos.horizontalAlign, "right", "horizontalAlign phải bảo toàn right");
  assert.equal(pos.verticalRelative, "paragraph", "verticalRelative phải bảo toàn paragraph");
  assert.equal(pos.offsetY, 25, "offsetY phải bảo toàn 25px");
  assert.equal(pos.distT, 8, "distT phải bảo toàn 8px");
  assert.equal(pos.distL, 12, "distL phải bảo toàn 12px");
  assert.equal(imgNode.attrs.src.startsWith("data:image/png;base64,"), true, "Dữ liệu ảnh base64 phải nguyên vẹn");
});
