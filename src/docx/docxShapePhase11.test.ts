import test from "node:test";
import assert from "node:assert/strict";
import { parseDrawingElement } from "./drawing/drawingPositionParser.ts";
import type { DocumentMapperContext } from "./mapping/documentMapper.ts";
import { DocumentSerializer } from "./mapping/documentSerializer.ts";
import { mapDocxXmlToDocumentModel } from "./mapping/documentMapper.ts";
import { parseXmlString, pixelsToEmu } from "./utils/xmlUtils.ts";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { insertFloatingShape } from "../editor/editorCommands.ts";
import type { DrawingPosition } from "./drawing/drawingTypes.ts";

function createMockMapperContext(): DocumentMapperContext {
  const relationships = new Map<string, { id: string; type: string; target: string }>();
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
    mediaByRelId: new Map(),
    mediaByPath: new Map(),
    numbering: { abstractNumMap: new Map(), numMap: new Map() },
    warnings: [],
    activeCommentIds: new Set(),
    commentAnchorTexts: new Map(),
    trackedChangesMap: new Map(),
  };
}

// Helper XML builder cho DrawingML Shape
function buildDrawingMlShapeXml(options: {
  placement: "anchor" | "inline";
  prst: string;
  widthPx: number;
  heightPx: number;
  offsetXPx?: number;
  offsetYPx?: number;
  wrapElement?: string;
  distTPx?: number;
  distBPx?: number;
  distLPx?: number;
  distRPx?: number;
  hRel?: string;
  vRel?: string;
  fillHex?: string;
  isNoFill?: boolean;
  strokeHex?: string;
  strokeWidthPx?: number;
  isStrokeNoFill?: boolean;
  headEndType?: string;
  tailEndType?: string;
  has3d?: boolean;
  hasGradFill?: boolean;
  extraSpPrXml?: string;
}): string {
  const cx = pixelsToEmu(options.widthPx);
  const cy = pixelsToEmu(options.heightPx);
  const distT = pixelsToEmu(options.distTPx ?? 0);
  const distB = pixelsToEmu(options.distBPx ?? 0);
  const distL = pixelsToEmu(options.distLPx ?? 0);
  const distR = pixelsToEmu(options.distRPx ?? 0);

  const isLineOrArrow = options.prst === "line" || options.prst.toLowerCase().includes("arrow");
  const fillXml = (options.isNoFill || (isLineOrArrow && !options.fillHex))
    ? "<a:noFill/>"
    : options.hasGradFill
    ? `<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="${options.fillHex || "FF8800"}"/></a:gs></a:gsLst></a:gradFill>`
    : options.fillHex
    ? `<a:solidFill><a:srgbClr val="${options.fillHex}"/></a:solidFill>`
    : "<a:solidFill><a:srgbClr val=\"3B82F6\"/></a:solidFill>";

  let lnXml = "";
  if (options.isStrokeNoFill) {
    lnXml = "<a:ln><a:noFill/></a:ln>";
  } else {
    const swEmu = pixelsToEmu(options.strokeWidthPx ?? 2);
    const strokeClr = options.strokeHex ? `<a:solidFill><a:srgbClr val="${options.strokeHex}"/></a:solidFill>` : "<a:solidFill><a:srgbClr val=\"1D4ED8\"/></a:solidFill>";
    const headEndXml = options.headEndType ? `<a:headEnd type="${options.headEndType}"/>` : "";
    const tailEndXml = options.tailEndType ? `<a:tailEnd type="${options.tailEndType}"/>` : "";
    lnXml = `<a:ln w="${swEmu}">${strokeClr}${headEndXml}${tailEndXml}</a:ln>`;
  }

  const sp3dXml = options.has3d ? "<a:sp3d/>" : "";
  const extraXml = options.extraSpPrXml || "";

  const spPrXml = `<wps:spPr>
    <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
    <a:prstGeom prst="${options.prst}"><a:avLst/></a:prstGeom>
    ${fillXml}
    ${lnXml}
    ${sp3dXml}
    ${extraXml}
  </wps:spPr>`;

  const graphicXml = `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
    <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
      <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <wps:cNvSpPr/>
        ${spPrXml}
        <wps:bodyPr/>
      </wps:wsp>
    </a:graphicData>
  </a:graphic>`;

  if (options.placement === "inline") {
    return `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <wp:inline distT="${distT}" distB="${distB}" distL="${distL}" distR="${distR}">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="101" name="Shape 101" descr="Shape"/>
        ${graphicXml}
      </wp:inline>
    </w:drawing>`;
  }

  const offX = pixelsToEmu(options.offsetXPx ?? 0);
  const offY = pixelsToEmu(options.offsetYPx ?? 0);
  const hRel = options.hRel || "column";
  const vRel = options.vRel || "paragraph";
  const wrapXml = options.wrapElement || `<wp:wrapSquare wrapText="bothSides"/>`;

  return `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
             xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
    <wp:anchor distT="${distT}" distB="${distB}" distL="${distL}" distR="${distR}" behindDoc="0" allowOverlap="1">
      <wp:simplePos x="0" y="0"/>
      <wp:positionH relativeFrom="${hRel}">
        <wp:posOffset>${offX}</wp:posOffset>
      </wp:positionH>
      <wp:positionV relativeFrom="${vRel}">
        <wp:posOffset>${offY}</wp:posOffset>
      </wp:positionV>
      <wp:extent cx="${cx}" cy="${cy}"/>
      ${wrapXml}
      <wp:docPr id="202" name="Floating Shape 202" descr="Floating Shape"/>
      ${graphicXml}
    </wp:anchor>
  </w:drawing>`;
}

test("Phase 11 - 1. Rectangle DrawingML mapping", () => {
  const xml = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "rect",
    widthPx: 250,
    heightPx: 140,
    offsetXPx: 30,
    offsetYPx: 50,
    fillHex: "3B82F6",
    strokeHex: "1D4ED8",
    strokeWidthPx: 2,
  });

  const doc = parseXmlString(xml);
  const ctx = createMockMapperContext();
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed, "Phải parse được DrawingML shape");
  assert.equal(parsed.payload.kind, "shape");
  if (parsed.payload.kind === "shape") {
    assert.equal(parsed.payload.shapeType, "rectangle");
    assert.equal(parsed.payload.fillColor, "#3B82F6");
    assert.equal(parsed.payload.strokeColor, "#1D4ED8");
    assert.equal(parsed.payload.strokeWidth, 2);
  }
  assert.equal(parsed.position.width, 250);
  assert.equal(parsed.position.height, 140);
  assert.equal(parsed.position.placement, "floating");
});

test("Phase 11 - 2. Rounded Rectangle DrawingML mapping", () => {
  const xml = buildDrawingMlShapeXml({
    placement: "inline",
    prst: "roundRect",
    widthPx: 180,
    heightPx: 90,
    fillHex: "10B981",
    strokeHex: "047857",
    strokeWidthPx: 3,
  });

  const doc = parseXmlString(xml);
  const ctx = createMockMapperContext();
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.payload.kind, "shape");
  if (parsed.payload.kind === "shape") {
    assert.equal(parsed.payload.shapeType, "roundedRectangle");
    assert.equal(parsed.payload.fillColor, "#10B981");
    assert.equal(parsed.payload.strokeColor, "#047857");
    assert.equal(parsed.payload.strokeWidth, 3);
  }
  assert.equal(parsed.position.placement, "inline");
});

test("Phase 11 - 3. Ellipse DrawingML mapping", () => {
  const xml = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "ellipse",
    widthPx: 220,
    heightPx: 160,
    fillHex: "EF4444",
    strokeHex: "B91C1C",
    strokeWidthPx: 4,
  });

  const doc = parseXmlString(xml);
  const ctx = createMockMapperContext();
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.payload.kind, "shape");
  if (parsed.payload.kind === "shape") {
    assert.equal(parsed.payload.shapeType, "ellipse");
    assert.equal(parsed.payload.fillColor, "#EF4444");
    assert.equal(parsed.payload.strokeColor, "#B91C1C");
    assert.equal(parsed.payload.strokeWidth, 4);
  }
});

test("Phase 11 - 4. Line DrawingML mapping", () => {
  const xml = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "line",
    widthPx: 300,
    heightPx: 30,
    strokeHex: "475569",
    strokeWidthPx: 2,
  });

  const doc = parseXmlString(xml);
  const ctx = createMockMapperContext();
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.payload.kind, "shape");
  if (parsed.payload.kind === "shape") {
    assert.equal(parsed.payload.shapeType, "line");
    assert.equal(parsed.payload.fillColor, "none");
    assert.equal(parsed.payload.strokeColor, "#475569");
    assert.equal(parsed.payload.strokeWidth, 2);
  }
});

test("Phase 11 - 5. Arrow DrawingML mapping (rightArrow and line with arrowhead)", () => {
  // Case A: prst="rightArrow"
  const xmlA = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "rightArrow",
    widthPx: 240,
    heightPx: 50,
    fillHex: "8B5CF6",
    strokeHex: "6D28D9",
  });
  const parsedA = parseDrawingElement(parseXmlString(xmlA).documentElement, createMockMapperContext());
  assert.ok(parsedA);
  assert.equal(parsedA.payload.kind, "shape");
  if (parsedA.payload.kind === "shape") {
    assert.equal(parsedA.payload.shapeType, "arrow");
  }

  // Case B: prst="line" with headEnd type="triangle"
  const xmlB = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "line",
    widthPx: 200,
    heightPx: 40,
    strokeHex: "000000",
    strokeWidthPx: 2,
    headEndType: "triangle",
  });
  const parsedB = parseDrawingElement(parseXmlString(xmlB).documentElement, createMockMapperContext());
  assert.ok(parsedB);
  assert.equal(parsedB.payload.kind, "shape");
  if (parsedB.payload.kind === "shape") {
    assert.equal(parsedB.payload.shapeType, "arrow");
  }
});

test("Phase 11 - 6. Fill Color, Scheme Colors, and noFill", () => {
  // Case A: Scheme color "accent1"
  const xmlScheme = `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="1905000" cy="952500"/>
      <wp:docPr id="101" name="Shape 1"/>
      <a:graphic>
        <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
          <wps:wsp>
            <wps:spPr>
              <a:prstGeom prst="rect"/>
              <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
            </wps:spPr>
          </wps:wsp>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>`;

  const parsedScheme = parseDrawingElement(parseXmlString(xmlScheme).documentElement, createMockMapperContext());
  assert.ok(parsedScheme);
  if (parsedScheme.payload.kind === "shape") {
    assert.equal(parsedScheme.payload.fillColor, "#4f46e5");
  }

  // Case B: noFill
  const xmlNoFill = buildDrawingMlShapeXml({
    placement: "inline",
    prst: "rect",
    widthPx: 200,
    heightPx: 100,
    isNoFill: true,
  });
  const parsedNoFill = parseDrawingElement(parseXmlString(xmlNoFill).documentElement, createMockMapperContext());
  assert.ok(parsedNoFill);
  if (parsedNoFill.payload.kind === "shape") {
    assert.equal(parsedNoFill.payload.fillColor, "none");
  }
});

test("Phase 11 - 7. Stroke Width and noFill stroke", () => {
  const xmlStrokeNoFill = buildDrawingMlShapeXml({
    placement: "inline",
    prst: "rect",
    widthPx: 200,
    heightPx: 100,
    isStrokeNoFill: true,
  });
  const parsed = parseDrawingElement(parseXmlString(xmlStrokeNoFill).documentElement, createMockMapperContext());
  assert.ok(parsed);
  if (parsed.payload.kind === "shape") {
    assert.equal(parsed.payload.strokeColor, "none");
  }
});

test("Phase 11 - 8. Size and Floating Position offsets", () => {
  const xml = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "roundRect",
    widthPx: 320,
    heightPx: 180,
    offsetXPx: 75,
    offsetYPx: 110,
    hRel: "page",
    vRel: "margin",
  });

  const parsed = parseDrawingElement(parseXmlString(xml).documentElement, createMockMapperContext());
  assert.ok(parsed);
  assert.equal(parsed.position.width, 320);
  assert.equal(parsed.position.height, 180);
  assert.equal(parsed.position.offsetX, 75);
  assert.equal(parsed.position.offsetY, 110);
  assert.equal(parsed.position.horizontalRelative, "page");
  assert.equal(parsed.position.verticalRelative, "margin");
});

test("Phase 11 - 9. Text Wrapping modes on Shape (Square, Top & Bottom, Tight)", () => {
  // Square
  const xmlSquare = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "rect",
    widthPx: 200,
    heightPx: 100,
    wrapElement: `<wp:wrapSquare wrapText="bothSides"/>`,
    distTPx: 10,
    distBPx: 15,
    distLPx: 20,
    distRPx: 25,
  });
  const parsedSquare = parseDrawingElement(parseXmlString(xmlSquare).documentElement, createMockMapperContext());
  assert.ok(parsedSquare);
  assert.equal(parsedSquare.position.wrapMode, "square");
  assert.equal(parsedSquare.position.distT, 10);
  assert.equal(parsedSquare.position.distB, 15);
  assert.equal(parsedSquare.position.distL, 20);
  assert.equal(parsedSquare.position.distR, 25);

  // Top and Bottom
  const xmlTopBottom = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "ellipse",
    widthPx: 200,
    heightPx: 100,
    wrapElement: `<wp:wrapTopAndBottom/>`,
  });
  const parsedTopBottom = parseDrawingElement(parseXmlString(xmlTopBottom).documentElement, createMockMapperContext());
  assert.ok(parsedTopBottom);
  assert.equal(parsedTopBottom.position.wrapMode, "topAndBottom");

  // Tight with Polygon
  const xmlTight = buildDrawingMlShapeXml({
    placement: "anchor",
    prst: "ellipse",
    widthPx: 200,
    heightPx: 100,
    wrapElement: `<wp:wrapTight wrapText="bothSides">
      <wp:wrapPolygon>
        <wp:start x="0" y="0"/>
        <wp:lineTo x="952500" y="0"/>
        <wp:lineTo x="952500" y="952500"/>
        <wp:lineTo x="0" y="952500"/>
      </wp:wrapPolygon>
    </wp:wrapTight>`,
  });
  const parsedTight = parseDrawingElement(parseXmlString(xmlTight).documentElement, createMockMapperContext());
  assert.ok(parsedTight);
  assert.equal(parsedTight.position.wrapMode, "tight");
  assert.ok(parsedTight.position.wrapPolygon && parsedTight.position.wrapPolygon.length >= 3);
});

test("Phase 11 - 10. Unsupported Geometry & Effects protection policy", () => {
  // Case A: Custom geometry <a:custGeom> -> KHÔNG map thành rectangle!
  const xmlCustGeom = `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="1905000" cy="952500"/>
      <wp:docPr id="101" name="CustGeom"/>
      <a:graphic>
        <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
          <wps:wsp>
            <wps:spPr>
              <a:custGeom><a:avLst/></a:custGeom>
            </wps:spPr>
          </wps:wsp>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>`;
  const ctxA = createMockMapperContext();
  const parsedA = parseDrawingElement(parseXmlString(xmlCustGeom).documentElement, ctxA);
  assert.ok(parsedA);
  assert.notEqual(parsedA.payload.kind, "shape", "Custom geometry không được map thành shape");
  assert.equal(parsedA.payload.kind, "unknown");
  assert.ok(ctxA.warnings.some((w) => w.includes("custom geometry")), "Phải có cảnh báo custom geometry");

  // Case B: Unsupported preset geometry: "heart" or "star5" -> KHÔNG map thành rectangle!
  const xmlHeart = buildDrawingMlShapeXml({
    placement: "inline",
    prst: "heart",
    widthPx: 200,
    heightPx: 100,
  });
  const ctxB = createMockMapperContext();
  const parsedB = parseDrawingElement(parseXmlString(xmlHeart).documentElement, ctxB);
  assert.ok(parsedB);
  assert.notEqual(parsedB.payload.kind, "shape", "Heart không được map thành rectangle");
  assert.equal(parsedB.payload.kind, "unknown");
  assert.ok(ctxB.warnings.some((w) => w.includes("heart")), "Phải có cảnh báo loại hình vẽ heart không hỗ trợ");

  // Case C: 3D and Gradient fill on supported shape -> an toàn, không crash, log warning
  const xml3dGrad = buildDrawingMlShapeXml({
    placement: "inline",
    prst: "rect",
    widthPx: 200,
    heightPx: 100,
    has3d: true,
    hasGradFill: true,
  });
  const ctxC = createMockMapperContext();
  const parsedC = parseDrawingElement(parseXmlString(xml3dGrad).documentElement, ctxC);
  assert.ok(parsedC);
  assert.equal(parsedC.payload.kind, "shape");
  assert.ok(ctxC.warnings.some((w) => w.includes("3D")), "Phải có cảnh báo hiệu ứng 3D");
  assert.ok(ctxC.warnings.some((w) => w.includes("gradient")), "Phải có cảnh báo dải màu gradient");
});

test("Phase 11 - 11. Legacy VML Shape fallback", () => {
  const vmlXml = `<w:pict xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
           xmlns:v="urn:schemas-microsoft-com:vml">
    <v:rect style="position:absolute;margin-left:45pt;margin-top:60pt;width:150pt;height:90pt;z-index:251658240"
            fillcolor="#FF5722"
            strokecolor="#009688"
            strokeweight="3pt"/>
  </w:pict>`;

  const ctx = createMockMapperContext();
  const parsed = parseDrawingElement(parseXmlString(vmlXml).documentElement, ctx);

  assert.ok(parsed, "Phải parse được VML legacy shape");
  assert.equal(parsed.payload.kind, "shape");
  if (parsed.payload.kind === "shape") {
    assert.equal(parsed.payload.shapeType, "rectangle");
    assert.equal(parsed.payload.fillColor, "#FF5722");
    assert.equal(parsed.payload.strokeColor, "#009688");
    assert.equal(parsed.payload.strokeWidth, 4); // 3pt * 4/3 ~ 4px
  }
  assert.equal(parsed.position.placement, "floating");
  assert.equal(parsed.position.width, 200); // 150pt * 4/3 = 200px
  assert.equal(parsed.position.height, 120); // 90pt * 4/3 = 120px
  assert.ok(ctx.warnings.some((w) => w.includes("VML Shape kế thừa")));
});

test("Phase 11 - 12. Full Round-trip Serialization & Deserialization", () => {
  const originalShapeNode: JSONContent = {
    type: "shape",
    attrs: {
      shapeType: "ellipse",
      width: 280,
      height: 160,
      fillColor: "#9333ea",
      strokeColor: "#581c87",
      strokeWidth: 3,
      alignment: "center",
      drawingPosition: {
        placement: "floating",
        width: 280,
        height: 160,
        distT: 12,
        distB: 12,
        distL: 16,
        distR: 16,
        wrapMode: "square",
        horizontalRelative: "column",
        verticalRelative: "paragraph",
        offsetX: 45,
        offsetY: 70,
      } as DrawingPosition,
    },
  };

  const docJson: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thân bài phía trước." }],
      },
      originalShapeNode,
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thân bài phía sau." }],
      },
    ],
  };

  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize({
    id: "roundtrip-doc-shape",
    schemaVersion: 1,
    metadata: { title: "Roundtrip Shape", createdAt: "", updatedAt: "" },
    content: docJson,
  });

  assert.ok(serialized.documentXml.includes("<wp:anchor"), "Phải xuất thẻ <wp:anchor>");
  assert.ok(serialized.documentXml.includes('prst="ellipse"'), "Phải xuất prst='ellipse'");
  assert.ok(serialized.documentXml.includes('val="9333EA"'), "Phải xuất mã màu fill 9333EA");
  assert.ok(serialized.documentXml.includes('val="581C87"'), "Phải xuất mã màu stroke 581C87");
  assert.ok(serialized.documentXml.includes("<wp:wrapSquare"), "Phải xuất thẻ <wp:wrapSquare>");

  // Deserialization
  const mapperCtx = createMockMapperContext();
  const result = mapDocxXmlToDocumentModel(serialized.documentXml, mapperCtx);

  const restored = result.content.content?.find((n) => n.type === "shape");
  assert.ok(restored, "Tài liệu sau khi import phải tìm thấy node shape");
  assert.equal(restored.attrs?.shapeType, "ellipse");
  assert.equal(restored.attrs?.fillColor?.toLowerCase(), "#9333ea");
  assert.equal(restored.attrs?.strokeColor?.toLowerCase(), "#581c87");
  assert.equal(restored.attrs?.strokeWidth, 3);
  assert.equal(restored.attrs?.drawingPosition?.placement, "floating");
  assert.equal(restored.attrs?.drawingPosition?.width, 280);
  assert.equal(restored.attrs?.drawingPosition?.height, 160);
  assert.equal(restored.attrs?.drawingPosition?.offsetX, 45);
  assert.equal(restored.attrs?.drawingPosition?.offsetY, 70);
  assert.equal(restored.attrs?.drawingPosition?.wrapMode, "square");
});

test("Phase 11 - 13. Headless Editor Interaction & Undo/Redo Safety", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm." }],
        },
      ],
    },
  });

  // 1. Chèn floating shape
  const inserted = insertFloatingShape(editor, {
    shapeType: "roundedRectangle",
    width: 240,
    height: 120,
    fillColor: "#3b82f6",
    strokeColor: "#1d4ed8",
    position: {
      offsetX: 50,
      offsetY: 60,
    },
  });
  assert.ok(inserted, "Phải chèn thành công floating shape");

  const shapeNode = editor.getJSON().content?.find((c) => c.type === "shape");
  assert.ok(shapeNode, "Node shape phải tồn tại trong document AST");
  assert.equal(shapeNode.attrs?.shapeType, "roundedRectangle");
  assert.equal(shapeNode.attrs?.drawingPosition?.placement, "floating");
  assert.equal(shapeNode.attrs?.drawingPosition?.offsetX, 50);

  // 2. Undo chèn shape
  editor.commands.undo();
  const jsonAfterUndo = editor.getJSON();
  const hasShapeAfterUndo = jsonAfterUndo.content?.some((n) => n.type === "shape");
  assert.equal(hasShapeAfterUndo, false, "Undo phải xóa bỏ shape đã chèn");

  // 3. Redo phục hồi shape
  editor.commands.redo();
  const jsonAfterRedo = editor.getJSON();
  const shapeAfterRedo = jsonAfterRedo.content?.find((n) => n.type === "shape");
  assert.ok(shapeAfterRedo, "Redo phải phục hồi lại shape");
  assert.equal(shapeAfterRedo.attrs?.shapeType, "roundedRectangle");
  assert.equal(shapeAfterRedo.attrs?.drawingPosition?.placement, "floating");
  assert.equal(shapeAfterRedo.attrs?.drawingPosition?.offsetX, 50);

  editor.destroy();
});
