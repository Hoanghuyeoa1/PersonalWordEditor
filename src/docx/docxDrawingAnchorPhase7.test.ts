import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseXmlString, getFirstChildByLocalName, findDescendantByLocalName, getAttrValue } from "./utils/xmlUtils.ts";
import { parseDrawingElement } from "./drawing/drawingPositionParser.ts";
import { serializeDrawingContainer } from "./drawing/drawingPositionSerializer.ts";
import { DrawingPositionService, emuToSignedPixels, pixelsToSignedEmu } from "./drawing/drawingPositionService.ts";
import type { DrawingPosition, ParsedDrawingObject } from "./drawing/drawingTypes.ts";
import type { DocumentMapperContext } from "./mapping/documentMapper.ts";
import { DocumentSerializer } from "./mapping/documentSerializer.ts";
import { mapDocxXmlToDocumentModel } from "./mapping/documentMapper.ts";
import { RelationshipAllocator } from "./relationships/relationshipAllocator.ts";
import { DocPrIdAllocator } from "./utils/idAllocator.ts";
import type { DocumentModel } from "../document/documentTypes.ts";

/**
 * Tạo một mock mapper context với relationship và media cho kiểm thử
 */
function createMockMapperContext(): DocumentMapperContext {
  const mediaByRelId = new Map<string, { dataUrl: string; extension: string }>();
  const mediaByPath = new Map<string, { dataUrl: string; extension: string }>();
  const rels = new Map<string, { id: string; type: string; target: string }>();

  // Cài đặt sẵn ảnh mẫu
  const sampleDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  mediaByRelId.set("rIdImg1", { dataUrl: sampleDataUrl, extension: "png" });
  rels.set("rIdImg1", {
    id: "rIdImg1",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: "media/image1.png",
  });
  mediaByPath.set("media/image1.png", { dataUrl: sampleDataUrl, extension: "png" });

  return {
    styles: new Map(),
    relationships: rels,
    mediaByRelId,
    mediaByPath,
    numbering: { abstractNumMap: new Map(), numMap: new Map() },
    headersXmlMap: new Map(),
    footersXmlMap: new Map(),
    warnings: [],
  };
}

test("PHASE 7 - 1. Shared Parser: wp:inline parsing preserves dimensions, distances and payload", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:inline distT="95250" distB="190500" distL="285750" distR="381000">
        <wp:extent cx="1905000" cy="952500"/>
        <wp:docPr id="101" name="Sample Inline Pic" descr="Inline picture description"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="101" name="Sample Inline Pic"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rIdImg1"/>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const drawingEl = doc.documentElement;
  const parsed = parseDrawingElement(drawingEl, ctx);

  assert.ok(parsed, "Đối tượng drawing phải được parse thành công");
  assert.equal(parsed.position.placement, "inline");
  assert.equal(parsed.position.wrapMode, "inline");

  // 1905000 EMUs = 200px, 952500 EMUs = 100px
  assert.equal(parsed.position.width, 200);
  assert.equal(parsed.position.height, 100);

  // Distances: distT=10px, distB=20px, distL=30px, distR=40px
  assert.equal(parsed.position.distT, 10);
  assert.equal(parsed.position.distB, 20);
  assert.equal(parsed.position.distL, 30);
  assert.equal(parsed.position.distR, 40);

  assert.equal(parsed.position.docPrId, 101);
  assert.equal(parsed.position.docPrName, "Sample Inline Pic");
  assert.equal(parsed.position.docPrDescription, "Inline picture description");

  // Payload verification
  assert.equal(parsed.payload.kind, "image");
  if (parsed.payload.kind === "image") {
    assert.ok(parsed.payload.src.startsWith("data:image/png;base64"));
  }
});

test("PHASE 7 - 2. Shared Parser: wp:anchor floating image with alignment and wrapping modes", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor distT="47625" distB="47625" distL="47625" distR="47625"
                 simplePos="0" relativeHeight="251658240"
                 behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
        <wp:simplePos x="0" y="0"/>
        <wp:positionH relativeFrom="margin">
          <wp:align>right</wp:align>
        </wp:positionH>
        <wp:positionV relativeFrom="paragraph">
          <wp:posOffset>190500</wp:posOffset>
        </wp:positionV>
        <wp:extent cx="2857500" cy="1905000"/>
        <wp:wrapSquare wrapText="bothSides"/>
        <wp:docPr id="202" name="Floating Word Art" descr="Floating image test"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:blipFill>
                <a:blip r:embed="rIdImg1"/>
              </pic:blipFill>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.placement, "floating");
  assert.equal(parsed.position.wrapMode, "square");
  assert.equal(parsed.position.behindDoc, false);
  assert.equal(parsed.position.allowOverlap, true);

  // Horizontal: relativeFrom="margin", align="right"
  assert.equal(parsed.position.horizontalRelative, "margin");
  assert.equal(parsed.position.horizontalAlign, "right");

  // Vertical: relativeFrom="paragraph", offset=190500 (20px)
  assert.equal(parsed.position.verticalRelative, "paragraph");
  assert.equal(parsed.position.offsetY, 20);

  // Extent: 300px x 200px
  assert.equal(parsed.position.width, 300);
  assert.equal(parsed.position.height, 200);
});

test("PHASE 7 - 3. Logical units and signed coordinates: positive and negative offsets", () => {
  // Test conversion functions
  assert.equal(emuToSignedPixels(95250), 10);
  assert.equal(emuToSignedPixels(-95250), -10);
  assert.equal(pixelsToSignedEmu(15), 142875);
  assert.equal(pixelsToSignedEmu(-15), -142875);

  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor behindDoc="1" allowOverlap="0">
        <wp:positionH relativeFrom="column">
          <wp:posOffset>-190500</wp:posOffset>
        </wp:positionH>
        <wp:positionV relativeFrom="page">
          <wp:posOffset>476250</wp:posOffset>
        </wp:positionV>
        <wp:extent cx="952500" cy="952500"/>
        <wp:wrapNone/>
        <wp:docPr id="303" name="Bleed Image"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:blipFill><a:blip r:embed="rIdImg1"/></pic:blipFill>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.offsetX, -20);
  assert.equal(parsed.position.offsetY, 50);
  assert.equal(parsed.position.behindDoc, true);
  assert.equal(parsed.position.allowOverlap, false);

  // Serialization retains signed offsets
  const serializedXml = serializeDrawingContainer({
    position: parsed.position,
    docPrId: 303,
    docPrName: "Bleed Image",
    graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
    graphicContentXml: "<pic:pic/>",
  });

  assert.ok(serializedXml.includes('<wp:posOffset>-190500</wp:posOffset>'));
  assert.ok(serializedXml.includes('<wp:posOffset>476250</wp:posOffset>'));
  assert.ok(serializedXml.includes('behindDoc="1"'));
  assert.ok(serializedXml.includes('allowOverlap="0"'));
});

test("PHASE 7 - 4. Reference frames: Page-relative vs Paragraph-relative", () => {
  const service = new DrawingPositionService();

  const pageAnchor: DrawingPosition = {
    placement: "floating",
    width: 200,
    height: 100,
    horizontalRelative: "page",
    offsetX: 120,
    verticalRelative: "page",
    offsetY: 80,
    wrapMode: "none",
  };

  const pageLayoutBox = service.resolveLayoutPosition(pageAnchor, {
    pageWidthPx: 816,
    pageHeightPx: 1056,
    marginsPx: { left: 96, top: 96, right: 96, bottom: 96 },
    paragraphLeftPx: 96,
    paragraphTopPx: 300,
    paragraphWidthPx: 624,
  });

  assert.equal(pageLayoutBox.x, 120);
  assert.equal(pageLayoutBox.y, 80);
  assert.equal(pageLayoutBox.width, 200);
  assert.equal(pageLayoutBox.height, 100);

  const paraAnchor: DrawingPosition = {
    placement: "floating",
    width: 150,
    height: 90,
    horizontalRelative: "column",
    offsetX: 30,
    verticalRelative: "paragraph",
    offsetY: 15,
    wrapMode: "square",
  };

  const paraLayoutBox = service.resolveLayoutPosition(paraAnchor, {
    pageWidthPx: 816,
    pageHeightPx: 1056,
    marginsPx: { left: 96, top: 96, right: 96, bottom: 96 },
    paragraphLeftPx: 96,
    paragraphTopPx: 300,
    paragraphWidthPx: 624,
  });

  // Paragraph relative: x = para.left + 30 = 96 + 30 = 126; y = para.top + 15 = 300 + 15 = 315
  assert.equal(paraLayoutBox.x, 126);
  assert.equal(paraLayoutBox.y, 315);
  assert.equal(paraLayoutBox.width, 150);
  assert.equal(paraLayoutBox.height, 90);
});

test("PHASE 7 - 5. Safe fallback for missing anchor data without dropping object", () => {
  const ctx = createMockMapperContext();
  // Malformed anchor thiếu positionH, positionV, dist attributes
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor>
        <wp:extent cx="1428750" cy="952500"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:blipFill><a:blip r:embed="rIdImg1"/></pic:blipFill>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed, "Không được drop đối tượng ngay cả khi anchor thiếu dữ liệu");
  assert.equal(parsed.position.placement, "floating");
  assert.equal(parsed.position.width, 150);
  assert.equal(parsed.position.height, 100);

  // Fallback defaults
  assert.equal(parsed.position.distT, 0);
  assert.equal(parsed.position.distB, 0);
  assert.equal(parsed.position.horizontalRelative, "column");
  assert.equal(parsed.position.offsetX, 0);
  assert.equal(parsed.position.verticalRelative, "paragraph");
  assert.equal(parsed.position.offsetY, 0);
  assert.equal(parsed.payload.kind, "image");
});

test("PHASE 7 - 6. Relationship resolution and missing binary warning safety", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:inline>
        <wp:extent cx="952500" cy="952500"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:blipFill><a:blip r:embed="rIdNonExistent999"/></pic:blipFill>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  // Missing media item warns safely without crashing
  assert.ok(parsed, "Không làm sập tiến trình khi thiếu relationship media");
  assert.equal(parsed.payload.kind, "unknown");
  assert.ok(ctx.warnings.some((w) => w.includes("rIdNonExistent999")));
});

test("PHASE 7 - 7. Vector Shape floating anchor parsing and export", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
      <wp:anchor behindDoc="0" allowOverlap="1">
        <wp:positionH relativeFrom="column">
          <wp:posOffset>95250</wp:posOffset>
        </wp:positionH>
        <wp:positionV relativeFrom="paragraph">
          <wp:posOffset>190500</wp:posOffset>
        </wp:positionV>
        <wp:extent cx="1905000" cy="952500"/>
        <wp:wrapSquare wrapText="bothSides"/>
        <wp:docPr id="501" name="Callout Arrow"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
            <wps:wsp>
              <wps:spPr>
                <a:prstGeom prst="rightArrow"/>
                <a:solidFill><a:srgbClr val="10B981"/></a:solidFill>
                <a:ln w="19050"><a:solidFill><a:srgbClr val="047857"/></a:solidFill></a:ln>
              </wps:spPr>
            </wps:wsp>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.placement, "floating");
  assert.equal(parsed.payload.kind, "shape");
  if (parsed.payload.kind === "shape") {
    assert.equal(parsed.payload.shapeType, "arrow");
  }

  // Roundtrip export check
  const serializer = new DocumentSerializer();
  const testDoc: DocumentModel = {
    metadata: { title: "Shape Test", createdAt: "", updatedAt: "" },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      width: 794,
      height: 1123,
      marginTop: 75,
      marginBottom: 75,
      marginLeft: 75,
      marginRight: 75,
    },
    headerFooter: {},
    content: {
      type: "doc",
      content: [
        {
          type: "shape",
          attrs: {
            shapeType: "arrow",
            width: 200,
            height: 100,
            fillColor: "#10b981",
            strokeColor: "#047857",
            strokeWidth: 2,
            alignment: "center",
            drawingPosition: parsed.position,
          },
        },
      ],
    },
  };

  const serialized = serializer.serialize(testDoc);
  assert.ok(serialized.documentXml.includes("<wps:wsp>"));
  assert.ok(serialized.documentXml.includes('prst="rightArrow"'));
  assert.ok(serialized.documentXml.includes("<wp:anchor"));
});

test("PHASE 7 - 8. Text Box floating anchor parsing and export", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
      <wp:anchor behindDoc="0" allowOverlap="1">
        <wp:positionH relativeFrom="page">
          <wp:posOffset>285750</wp:posOffset>
        </wp:positionH>
        <wp:positionV relativeFrom="page">
          <wp:posOffset>381000</wp:posOffset>
        </wp:positionV>
        <wp:extent cx="3048000" cy="762000"/>
        <wp:wrapTopAndBottom/>
        <wp:docPr id="601" name="Sidebar Note"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
            <wps:wsp>
              <wps:txbx>
                <w:txbxContent>
                  <w:p><w:r><w:t>Ghi chú quan trọng trong hộp chữ</w:t></w:r></w:p>
                </w:txbxContent>
              </wps:txbx>
            </wps:wsp>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.placement, "floating");
  assert.equal(parsed.position.wrapMode, "topAndBottom");
  assert.equal(parsed.payload.kind, "textBox");
  if (parsed.payload.kind === "textBox") {
    assert.ok(parsed.payload.content);
    assert.equal(parsed.payload.content[0].type, "paragraph");
    assert.equal(parsed.payload.content[0].content?.[0].text, "Ghi chú quan trọng trong hộp chữ");
  }

  // Export check
  const serializer = new DocumentSerializer();
  const testDoc: DocumentModel = {
    metadata: { title: "TextBox Test", createdAt: "", updatedAt: "" },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      width: 794,
      height: 1123,
      marginTop: 75,
      marginBottom: 75,
      marginLeft: 75,
      marginRight: 75,
    },
    headerFooter: {},
    content: {
      type: "doc",
      content: [
        {
          type: "textBox",
          attrs: {
            width: 320,
            minHeight: 80,
            alignment: "left",
            backgroundColor: "#ffffff",
            borderColor: "#cbd5e1",
            drawingPosition: parsed.position,
          },
          content: parsed.payload.content,
        },
      ],
    },
  };

  const serialized = serializer.serialize(testDoc);
  assert.ok(serialized.documentXml.includes("<w:txbxContent>"));
  assert.ok(serialized.documentXml.includes("Ghi chú quan trọng trong hộp chữ"));
  assert.ok(serialized.documentXml.includes("<wp:wrapTopAndBottom/>"));
});

test("PHASE 7 - 9. Centralized Allocators: No hardcoded IDs in drawing serialization", () => {
  const serializer = new DocumentSerializer();
  const testDoc: DocumentModel = {
    metadata: { title: "Allocators Test", createdAt: "", updatedAt: "" },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      width: 794,
      height: 1123,
      marginTop: 75,
      marginBottom: 75,
      marginLeft: 75,
      marginRight: 75,
    },
    headerFooter: {},
    content: {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            width: 100,
            height: 100,
            alignment: "center",
          },
        },
        {
          type: "image",
          attrs: {
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            width: 120,
            height: 120,
            alignment: "center",
            drawingPosition: {
              placement: "floating",
              width: 120,
              height: 120,
              wrapMode: "square",
              horizontalRelative: "margin",
              verticalRelative: "paragraph",
              offsetX: 10,
              offsetY: 20,
            },
          },
        },
      ],
    },
  };

  const res = serializer.serialize(testDoc);
  // Verify docPr IDs are allocated sequentially
  assert.ok(res.documentXml.includes('wp:docPr id="1" name="Picture 1"'));
  assert.ok(res.documentXml.includes('wp:docPr id="2" name="Picture 2"'));

  // Verify relationships are tracked via centralized RelationshipAllocator
  const docRels = res.relationships;
  assert.ok(docRels.length >= 2);
  const imgRel1 = docRels.find((r) => r.target === "media/image1.png");
  const imgRel2 = docRels.find((r) => r.target === "media/image2.png");
  assert.ok(imgRel1 && imgRel2);
  assert.notEqual(imgRel1.id, imgRel2.id);
});

test("PHASE 7 - 10. End-to-End Round-Trip: Word Floating Anchor -> Editor AST -> DOCX Export", async () => {
  const ctx = createMockMapperContext();
  const wordDocumentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r><w:t>Đoạn văn có hình vẽ floating:</w:t></w:r>
      <w:r>
        <w:drawing>
          <wp:anchor behindDoc="0" allowOverlap="1">
            <wp:positionH relativeFrom="margin">
              <wp:posOffset>476250</wp:posOffset>
            </wp:positionH>
            <wp:positionV relativeFrom="paragraph">
              <wp:posOffset>952500</wp:posOffset>
            </wp:positionV>
            <wp:extent cx="1905000" cy="952500"/>
            <wp:wrapSquare wrapText="bothSides"/>
            <wp:docPr id="77" name="Figure 1" descr="Ảnh trôi dạt"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:blipFill><a:blip r:embed="rIdImg1"/></pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:anchor>
        </w:drawing>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const mapped = mapDocxXmlToDocumentModel(wordDocumentXml, ctx);
  assert.ok(mapped.content.content);

  // Tìm node ảnh trong AST
  const imgBlock = mapped.content.content.find((b) => b.type === "image");
  assert.ok(imgBlock, "Phải nhập thành công node image trong AST");
  assert.ok(imgBlock.attrs?.drawingPosition, "Node image phải bảo toàn metadata drawingPosition");
  const pos = imgBlock.attrs.drawingPosition as DrawingPosition;
  assert.equal(pos.placement, "floating");
  assert.equal(pos.horizontalRelative, "margin");
  assert.equal(pos.offsetX, 50);
  assert.equal(pos.verticalRelative, "paragraph");
  assert.equal(pos.offsetY, 100);
  assert.equal(pos.wrapMode, "square");

  // Xuất lại sang DOCX
  const serializer = new DocumentSerializer();
  const exported = serializer.serialize({
    metadata: { title: "Roundtrip Floating", createdAt: "", updatedAt: "" },
    pageSettings: mapped.initialPageSettings,
    headerFooter: mapped.initialHeaderFooter,
    content: mapped.content,
  });

  assert.ok(exported.documentXml.includes("<wp:anchor"));
  assert.ok(exported.documentXml.includes('relativeFrom="margin"'));
  assert.ok(exported.documentXml.includes("<wp:posOffset>476250</wp:posOffset>"));
  assert.ok(exported.documentXml.includes('relativeFrom="paragraph"'));
  assert.ok(exported.documentXml.includes("<wp:posOffset>952500</wp:posOffset>"));
  assert.ok(exported.documentXml.includes("<wp:wrapSquare"));
});
