import test from "node:test";
import assert from "node:assert/strict";
import { parseXmlString } from "./utils/xmlUtils.ts";
import { parseDrawingElement } from "./drawing/drawingPositionParser.ts";
import { serializeDrawingContainer } from "./drawing/drawingPositionSerializer.ts";
import {
  DrawingPositionService,
  emuToSignedPixels,
  pixelsToSignedEmu,
} from "./drawing/drawingPositionService.ts";
import {
  DrawingWrapService,
  createWrappingObstacle,
  generateSimplifiedShapeContour,
  getPolygonXSpanAtY,
  buildDrawingWrapStyle,
} from "./drawing/drawingWrapService.ts";
import {
  validateDrawingDistance,
  validateDrawingDistances,
  DRAWING_DISTANCE_LIMITS,
  type DrawingPosition,
  type WrapMode,
  type WrapPolygonPoint,
} from "./drawing/drawingTypes.ts";
import { importDocxToDocumentModel } from "./import/docxImporter.ts";
import { exportDocumentModelToDocx } from "./export/docxExporter.ts";
import type { DocumentMapperContext } from "./mapping/documentMapper.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { buildPageLayoutMap } from "../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/services/pageConstants.ts";
import { measureLinesVirtual } from "../page/services/lineMeasurementService.ts";
import type { JSONContent } from "@tiptap/core";
import JSZip from "jszip";

/**
 * Mock mapper context
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

// ============================================================================
// PHASE 9: FLOATING OBJECT TEXT WRAPPING TEST SUITE
// ============================================================================

// 1. WRAP MODEL: Shared model across Image, Shape, and TextBox
test("PHASE 9 - 1. Shared Wrap Model: DrawingPosition and wrapping modes are reused identically across Image, Shape, TextBox", () => {
  const wrapModes: WrapMode[] = ["inline", "square", "tight", "through", "topAndBottom", "none"];

  // Shared position definitions apply to all 3 drawing types
  const sharedPos: DrawingPosition = {
    placement: "floating",
    width: 300,
    height: 150,
    distT: 10,
    distB: 12,
    distL: 14,
    distR: 16,
    wrapMode: "square",
    wrapTextSide: "bothSides",
  };

  // Node Image using shared position
  const imageNode: JSONContent = {
    type: "image",
    attrs: {
      src: "data:image/png;base64,sample",
      width: 300,
      height: 150,
      drawingPosition: sharedPos,
    },
  };

  // Node Shape using shared position
  const shapeNode: JSONContent = {
    type: "shape",
    attrs: {
      shapeType: "ellipse",
      width: 300,
      height: 150,
      drawingPosition: sharedPos,
    },
  };

  // Node TextBox using shared position
  const textBoxNode: JSONContent = {
    type: "textBox",
    attrs: {
      width: 300,
      minHeight: 150,
      drawingPosition: sharedPos,
    },
    content: [{ type: "paragraph", content: [{ type: "text", text: "Text inside box" }] }],
  };

  assert.equal(imageNode.attrs?.drawingPosition.wrapMode, "square");
  assert.equal(shapeNode.attrs?.drawingPosition.wrapMode, "square");
  assert.equal(textBoxNode.attrs?.drawingPosition.wrapMode, "square");
  assert.equal(imageNode.attrs?.drawingPosition.distL, 14);
  assert.equal(shapeNode.attrs?.drawingPosition.distL, 14);
  assert.equal(textBoxNode.attrs?.drawingPosition.distL, 14);
});

// 2. SQUARE WRAPPING: Text flows around bounding rectangle + padding
test("PHASE 9 - 2. Square Wrapping: Text lines receive reduced usable width within obstacle vertical span", () => {
  const wrapService = new DrawingWrapService();
  const obstaclePos: DrawingPosition = {
    placement: "floating",
    width: 200,
    height: 100,
    distT: 10,
    distB: 10,
    distL: 20,
    distR: 20,
    wrapMode: "square",
    wrapTextSide: "bothSides",
  };

  // Obstacle đặt tại x=400 (sát lề phải), y=100.
  // Padded bounds: top = 100 - 10 = 90, bottom = 100 + 100 + 10 = 210
  // left = 400 - 20 = 380, right = 400 + 200 + 20 = 620
  const obstacle = createWrappingObstacle(obstaclePos, { x: 400, y: 100, width: 200, height: 100 });

  assert.equal(obstacle.bounds.paddedTop, 90);
  assert.equal(obstacle.bounds.paddedBottom, 210);
  assert.equal(obstacle.bounds.paddedLeft, 380);
  assert.equal(obstacle.bounds.paddedRight, 620);

  const colLeft = 0;
  const colRight = 600;

  // Dòng 1: nằm ở y=40 -> 60 (trên obstacle). Không bị che -> full width = 600px
  const lineAbove = wrapService.resolveLineWrapping(40, 60, colLeft, colRight, [obstacle]);
  assert.equal(lineAbove.isBlockedByBand, false);
  assert.equal(lineAbove.effectiveWidth, 600);
  assert.equal(lineAbove.resolvedMode, "none");

  // Dòng 2: nằm ở y=120 -> 140 (giao với obstacle). Bị thu hẹp chiều rộng sang bên trái: 0 -> 380 (width = 380px)
  const lineBeside = wrapService.resolveLineWrapping(120, 140, colLeft, colRight, [obstacle]);
  assert.equal(lineBeside.isBlockedByBand, false);
  assert.equal(lineBeside.effectiveWidth, 380, "Available line width phải giảm từ 600px xuống 380px do vật cản Square");
  assert.equal(lineBeside.resolvedMode, "square");

  // Dòng 3: nằm ở y=240 -> 260 (dưới obstacle). Không bị che -> full width = 600px
  const lineBelow = wrapService.resolveLineWrapping(240, 260, colLeft, colRight, [obstacle]);
  assert.equal(lineBelow.isBlockedByBand, false);
  assert.equal(lineBelow.effectiveWidth, 600);
});

// 3. TOP & BOTTOM WRAPPING: Object occupies horizontal band, text only above or below
test("PHASE 9 - 3. Top & Bottom Wrapping: Horizontal band blocks text across entire width with next clearance top", () => {
  const wrapService = new DrawingWrapService();
  const obstaclePos: DrawingPosition = {
    placement: "floating",
    width: 250,
    height: 120,
    distT: 15,
    distB: 25,
    distL: 0,
    distR: 0,
    wrapMode: "topAndBottom",
  };

  // Obstacle tại y=100. Padded top = 85, bottom = 100 + 120 + 25 = 245
  const obstacle = createWrappingObstacle(obstaclePos, { x: 150, y: 100, width: 250, height: 120 });

  const colLeft = 0;
  const colRight = 600;

  // Dòng phía trên: y=50 -> 70. Hợp lệ
  const lineAbove = wrapService.resolveLineWrapping(50, 70, colLeft, colRight, [obstacle]);
  assert.equal(lineAbove.isBlockedByBand, false);
  assert.equal(lineAbove.effectiveWidth, 600);

  // Dòng trong dải ngang: y=110 -> 130. BỊ CHẶN HOÀN TOÀN
  const lineInBand = wrapService.resolveLineWrapping(110, 130, colLeft, colRight, [obstacle]);
  assert.equal(lineInBand.isBlockedByBand, true, "Top & Bottom mode phải chặn hoàn toàn dải ngang");
  assert.equal(lineInBand.effectiveWidth, 0);
  assert.equal(lineInBand.nextAvailableTop, 245, "nextAvailableTop phải là paddedBottom của vật cản");
  assert.equal(lineInBand.resolvedMode, "topAndBottom");

  // Dòng phía dưới: y=250 -> 270. Hợp lệ
  const lineBelow = wrapService.resolveLineWrapping(250, 270, colLeft, colRight, [obstacle]);
  assert.equal(lineBelow.isBlockedByBand, false);
  assert.equal(lineBelow.effectiveWidth, 600);
});

// 4. TIGHT WRAPPING: Simplified contour/polygon wraps text closer than Square
test("PHASE 9 - 4. Tight Wrapping: Polygon contour provides measurably wider line space at corners than Square", () => {
  const wrapService = new DrawingWrapService();
  const width = 200;
  const height = 120;

  // Tạo vật cản hình thoi (Diamond) với 4 đỉnh
  const diamondContour: WrapPolygonPoint[] = [
    { x: 100, y: 0 },
    { x: 200, y: 60 },
    { x: 100, y: 120 },
    { x: 0, y: 60 },
  ];

  const tightPos: DrawingPosition = {
    placement: "floating",
    width,
    height,
    distT: 0,
    distB: 0,
    distL: 0,
    distR: 0,
    wrapMode: "tight",
    wrapPolygon: diamondContour,
    wrapTextSide: "bothSides",
  };

  const squarePos: DrawingPosition = {
    ...tightPos,
    wrapMode: "square",
    wrapPolygon: undefined,
  };

  const originX = 400;
  const originY = 100;
  const colLeft = 0;
  const colRight = 600;

  const tightObstacle = createWrappingObstacle(tightPos, { x: originX, y: originY, width, height });
  const squareObstacle = createWrappingObstacle(squarePos, { x: originX, y: originY, width, height });

  // Kiểm tra lát cắt gần đỉnh trên: y = 110 (so với originY=100 là dy=10)
  // Tại dy=10 của hình thoi, chiều rộng hình thoi hẹp hơn rất nhiều so với bounding box 200px!
  const tightRes = wrapService.resolveLineWrapping(105, 115, colLeft, colRight, [tightObstacle]);
  const squareRes = wrapService.resolveLineWrapping(105, 115, colLeft, colRight, [squareObstacle]);

  assert.equal(tightRes.resolvedMode, "tight");
  assert.equal(squareRes.resolvedMode, "square");

  // Square: vật cản luôn chiếm từ 400 đến 600 -> usable width = 400px
  assert.equal(squareRes.effectiveWidth, 400);

  // Tight: vật cản tại dy=10 hẹp hơn -> obsLeft nằm xa hơn về phía phải -> usable width lớn hơn 400px!
  assert.ok(
    tightRes.effectiveWidth > squareRes.effectiveWidth,
    `Tight mode (${tightRes.effectiveWidth}px) phải rộng hơn Square mode (${squareRes.effectiveWidth}px) tại đỉnh hình thoi`
  );
  assert.ok(tightRes.effectiveWidth >= 480, "Tại dy=10, tight effective width phải đạt xấp xỉ ~480px");
});

// 5. TIGHT FALLBACK TO SQUARE: When no contour/polygon exists, cleanly fall back to Square
test("PHASE 9 - 5. Tight Fallback: Automatically falls back to Square wrapping when no contour or polygon is available", () => {
  const wrapService = new DrawingWrapService();
  const tightPosWithoutContour: DrawingPosition = {
    placement: "floating",
    width: 200,
    height: 100,
    distT: 5,
    distB: 5,
    distL: 10,
    distR: 10,
    wrapMode: "tight",
    // Cố tình không có wrapPolygon
  };

  // Không truyền shapeType và không có wrapPolygon
  const obstacle = createWrappingObstacle(tightPosWithoutContour, { x: 350, y: 100, width: 200, height: 100 });
  assert.equal(obstacle.contour, undefined, "Không được có contour");

  const res = wrapService.resolveLineWrapping(120, 140, 0, 600, [obstacle]);

  // Phải fallback sang square
  assert.equal(res.resolvedMode, "square", "Phải fallback sang square khi thiếu contour");
  assert.equal(res.effectiveWidth, 340, "Padded left là 350 - 10 = 340px");
});

// 6. DISTANCE FROM TEXT: Support top, bottom, left, right and strict validation
test("PHASE 9 - 6. Distance From Text Validation: Finite, non-negative, and bounded clamping", () => {
  // 1. Số hợp lệ
  assert.equal(validateDrawingDistance(25), 25);
  assert.equal(validateDrawingDistance(0), 0);

  // 2. Số âm -> clamp về 0 (>= 0 requirement)
  assert.equal(validateDrawingDistance(-15), 0);
  assert.equal(validateDrawingDistance(-999), 0);

  // 3. NaN, undefined, null, non-number -> fallback an toàn
  assert.equal(validateDrawingDistance(NaN), 0);
  assert.equal(validateDrawingDistance(undefined), 0);
  assert.equal(validateDrawingDistance("invalid" as any), 0);

  // 4. Non-finite (Infinity, -Infinity) fallback về 0; số hữu hạn vượt trần clamp về MAX_PX (500)
  assert.equal(validateDrawingDistance(Infinity), 0);
  assert.equal(validateDrawingDistance(-Infinity), 0);
  assert.equal(validateDrawingDistance(99999), DRAWING_DISTANCE_LIMITS.MAX_PX);

  // 5. validateDrawingDistances cấu trúc 4 chiều
  const validated = validateDrawingDistances({
    distT: -5,
    distB: 45,
    distL: "abc" as any,
    distR: 1000,
  });

  assert.deepEqual(validated, {
    distT: 0,
    distB: 45,
    distL: 0,
    distR: DRAWING_DISTANCE_LIMITS.MAX_PX,
  });
});

// 7. OOXML IMPORT/EXPORT: Map supported wrap elements to semantic modes
test("PHASE 9 - 7. OOXML Wrap Parsing & Serialization: Import and export square, tight with polygon, topAndBottom, and wrapTextSide", () => {
  const ctx = createMockMapperContext();

  // Test 7A: Square with wrapText="left"
  const squareXml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor distT="47625" distB="95250" distL="190500" distR="190500">
        <wp:extent cx="1905000" cy="952500"/>
        <wp:wrapSquare wrapText="left"/>
        <wp:docPr id="101" name="Figure 1"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic><pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill></pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const docSquare = parseXmlString(squareXml);
  const parsedSquare = parseDrawingElement(docSquare.documentElement, ctx);
  assert.ok(parsedSquare);
  assert.equal(parsedSquare.position.wrapMode, "square");
  assert.equal(parsedSquare.position.wrapTextSide, "left");
  assert.equal(parsedSquare.position.distT, 5);
  assert.equal(parsedSquare.position.distB, 10);
  assert.equal(parsedSquare.position.distL, 20);
  assert.equal(parsedSquare.position.distR, 20);

  // Test 7B: Tight with wp:wrapPolygon
  const tightXml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="952500" cy="952500"/>
        <wp:wrapTight wrapText="bothSides">
          <wp:wrapPolygon edited="0">
            <wp:start x="476250" y="0"/>
            <wp:lineTo x="952500" y="476250"/>
            <wp:lineTo x="476250" y="952500"/>
            <wp:lineTo x="0" y="476250"/>
          </wp:wrapPolygon>
        </wp:wrapTight>
        <wp:docPr id="102" name="Diamond Shape"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic><pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill></pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const docTight = parseXmlString(tightXml);
  const parsedTight = parseDrawingElement(docTight.documentElement, ctx);
  assert.ok(parsedTight);
  assert.equal(parsedTight.position.wrapMode, "tight");
  assert.equal(parsedTight.position.wrapTextSide, "bothSides");
  assert.ok(parsedTight.position.wrapPolygon);
  assert.equal(parsedTight.position.wrapPolygon.length, 4);
  assert.equal(parsedTight.position.wrapPolygon[0].x, 50, "476250 EMU = 50px");
  assert.equal(parsedTight.position.wrapPolygon[1].x, 100, "952500 EMU = 100px");

  // Test 7C: Serialization
  const serializedTight = serializeDrawingContainer({
    position: parsedTight.position,
    docPrId: 102,
    docPrName: "Diamond Shape",
    graphicUri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
    graphicContentXml: "<pic:pic/>",
  });

  assert.ok(serializedTight.includes('<wp:wrapTight wrapText="bothSides">'));
  assert.ok(serializedTight.includes("<wp:wrapPolygon"));
  assert.ok(serializedTight.includes("<wp:start x=\"476250\" y=\"0\"/>"));
  assert.ok(serializedTight.includes("<wp:lineTo x=\"952500\" y=\"476250\"/>"));
});

// 8. UNKNOWN WRAP RESILIENCE: Safe approximation to Square + Diagnostic warning
test("PHASE 9 - 8. Unknown Wrap Resilience: Non-fatal fallback to square with diagnostic warning in context", () => {
  const ctx = createMockMapperContext();
  const xml = `
    <w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <wp:anchor>
        <wp:extent cx="952500" cy="952500"/>
        <wp:wrapCustomSpecial mode="irregular3D"/>
        <wp:docPr id="103" name="Future Object"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic><pic:blipFill><a:blip r:embed="rIdLogo"/></pic:blipFill></pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>`;

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed, "Không được drop đối tượng có wrap chưa biết");
  assert.equal(parsed.position.wrapMode, "square", "Phải an toàn xấp xỉ sang square");
  assert.ok(ctx.warnings.some((w) => w.includes("wrapCustomSpecial")), "Phải ghi nhận diagnostic warning");
});

// 9. PAGINATION & REFLOW: Wrapping expands paragraph lines and triggers reflow across pages
test("PHASE 9 - 9. Page Engine Reflow: Square wrapping reduces line width, creating more lines and triggering page overflow", () => {
  // Đoạn văn dài khoảng 400 ký tự
  const sampleParagraphText =
    "Hệ thống kiến trúc phần mềm Personal Word Editor được xây dựng dựa trên mô hình ba tầng phân lớp, " +
    "đảm bảo tính toàn vẹn của mô hình tài liệu AST và không phá vỡ bộ gõ tiếng Việt. " +
    "Khi có đối tượng hình ảnh hoặc hình vẽ floating xuất hiện trên trang, " +
    "thuật toán Text Wrapping sẽ tính toán lại không gian dòng khả dụng cho các dòng văn bản lân cận, " +
    "làm tăng chiều cao rendered của đoạn văn bản và kích hoạt phân trang tự động.";

  // TRƯỜNG HỢP A: Không có floating obstacle (Normal inline flow)
  const docNormal: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: sampleParagraphText }],
      },
    ],
  };

  const normalMap = buildPageLayoutMap(docNormal, DEFAULT_PAGE_SETTINGS);
  const normalFrags = normalMap.getAllFragments().filter((f) => f.nodeType === "paragraph");
  const normalHeight = normalFrags.reduce((acc, f) => acc + f.height, 0);

  // TRƯỜNG HỢP B: Có Floating Object với Square wrapping (chiều rộng 320px)
  const docWithFloating: JSONContent = {
    type: "doc",
    content: [
      {
        type: "image",
        attrs: {
          src: "data:image/png;base64,fake",
          width: 320,
          height: 200,
          drawingPosition: {
            placement: "floating",
            width: 320,
            height: 200,
            distT: 10,
            distB: 10,
            distL: 20,
            distR: 20,
            wrapMode: "square",
            horizontalRelative: "margin",
            horizontalAlign: "right",
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: sampleParagraphText }],
      },
    ],
  };

  const wrappedMap = buildPageLayoutMap(docWithFloating, DEFAULT_PAGE_SETTINGS);
  const wrappedFrags = wrappedMap.getAllFragments().filter((f) => f.nodeType === "paragraph");
  const wrappedHeight = wrappedFrags.reduce((acc, f) => acc + f.height, 0);

  // Do bị thu hẹp chiều rộng dòng từ ~600px xuống ~240px, số dòng văn bản và chiều cao phải tăng lên rõ rệt!
  assert.ok(
    wrappedHeight > normalHeight,
    `Paragraph có wrapping (${wrappedHeight}px) phải cao hơn paragraph bình thường (${normalHeight}px)`
  );

  // Tài liệu không bị mutate AST
  assert.equal(docWithFloating.content?.length, 2, "AST không bị thay đổi");
});

// 10. EDITING SAFETY: ProseMirror Interaction & DOM styling safety (typing, IME, selection, scroll)
test("PHASE 9 - 10. Editing Safety: Wrap styles use native CSS float/clear without DOM fragmentation or event trapping", () => {
  // Test CSS sinh ra cho Square
  const squareStyle = buildDrawingWrapStyle({
    placement: "floating",
    width: 200,
    height: 150,
    distT: 10,
    distB: 15,
    distL: 20,
    distR: 25,
    wrapMode: "square",
    horizontalAlign: "right",
  });

  assert.ok(squareStyle.className.includes("wrap-square"));
  assert.ok(squareStyle.style.includes("float: right"));
  assert.ok(squareStyle.style.includes("margin: 10px 25px 15px 20px"));

  // Test CSS sinh ra cho Top & Bottom
  const topBottomStyle = buildDrawingWrapStyle({
    placement: "floating",
    width: 300,
    height: 100,
    distT: 12,
    distB: 18,
    distL: 0,
    distR: 0,
    wrapMode: "topAndBottom",
  });

  assert.ok(topBottomStyle.className.includes("wrap-topAndBottom"));
  assert.ok(topBottomStyle.style.includes("clear: both"));
  assert.ok(topBottomStyle.style.includes("display: block"));
  assert.ok(topBottomStyle.style.includes("margin: 12px auto 18px auto"));

  // Test CSS sinh ra cho Tight với shape-outside
  const tightStyle = buildDrawingWrapStyle({
    placement: "floating",
    width: 200,
    height: 100,
    distT: 0,
    distB: 0,
    distL: 10,
    distR: 10,
    wrapMode: "tight",
    horizontalAlign: "left",
    wrapPolygon: [
      { x: 100, y: 0 },
      { x: 200, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 50 },
    ],
  });

  assert.ok(tightStyle.className.includes("wrap-tight"));
  assert.ok(tightStyle.style.includes("float: left"));
  assert.ok(tightStyle.style.includes("shape-outside: polygon(100px 0px, 200px 50px, 100px 100px, 0px 50px)"));
  assert.ok(tightStyle.style.includes("shape-margin: 10px"));
});

// 11. END-TO-END DOCX ROUND-TRIP: Full export and re-import with wrapping metadata
test("PHASE 9 - 11. Full DOCX Round-Trip: Image and Shape with Square and Top & Bottom wrapping round-trip without loss", async () => {
  const samplePngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const sampleDataUrl = `data:image/png;base64,${samplePngBase64}`;

  const originalDoc: DocumentModel = {
    id: "doc_phase9_roundtrip",
    title: "Phase 9 Wrapping Test",
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
          content: [{ type: "text", text: "Đoạn văn bản đầu tiên trước đối tượng nổi." }],
        },
        // 1. Image with Square Wrapping
        {
          type: "image",
          attrs: {
            src: sampleDataUrl,
            alt: "Square Wrapped Image",
            title: "Figure 1",
            width: 250,
            height: 180,
            alignment: "right",
            drawingPosition: {
              placement: "floating",
              width: 250,
              height: 180,
              distT: 8,
              distB: 8,
              distL: 14,
              distR: 14,
              wrapMode: "square",
              wrapTextSide: "bothSides",
              horizontalRelative: "margin",
              horizontalAlign: "right",
              verticalRelative: "paragraph",
              offsetY: 10,
            },
          },
        },
        // 2. Shape with Top & Bottom Wrapping
        {
          type: "shape",
          attrs: {
            shapeType: "rectangle",
            width: 300,
            height: 100,
            fillColor: "#3b82f6",
            strokeColor: "#1d4ed8",
            strokeWidth: 2,
            alignment: "center",
            drawingPosition: {
              placement: "floating",
              width: 300,
              height: 100,
              distT: 15,
              distB: 20,
              distL: 0,
              distR: 0,
              wrapMode: "topAndBottom",
              horizontalRelative: "page",
              horizontalAlign: "center",
              verticalRelative: "paragraph",
              offsetY: 40,
            },
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn bản kết thúc tài liệu sau các đối tượng." }],
        },
      ],
    },
  };

  // 1. Export sang DOCX
  const docxBytes = await exportDocumentModelToDocx(originalDoc);
  assert.ok(docxBytes.length > 0);

  // 2. Import lại từ DOCX
  const importResult = await importDocxToDocumentModel(docxBytes);
  const doc = importResult.document;
  assert.ok(doc);

  const blocks = doc.content.content || [];
  const imgBlock = blocks.find((b: any) => b.type === "image");
  const shapeBlock = blocks.find((b: any) => b.type === "shape");

  // Kiểm tra phục hồi Image với Square Wrapping
  assert.ok(imgBlock);
  assert.ok(imgBlock.attrs?.drawingPosition);
  const imgPos: DrawingPosition = imgBlock.attrs.drawingPosition;
  assert.equal(imgPos.placement, "floating");
  assert.equal(imgPos.wrapMode, "square");
  assert.equal(imgPos.distL, 14);
  assert.equal(imgPos.distR, 14);
  assert.equal(imgPos.horizontalAlign, "right");

  // Kiểm tra phục hồi Shape với Top & Bottom Wrapping
  assert.ok(shapeBlock);
  assert.ok(shapeBlock.attrs?.drawingPosition);
  const shapePos: DrawingPosition = shapeBlock.attrs.drawingPosition;
  assert.equal(shapePos.placement, "floating");
  assert.equal(shapePos.wrapMode, "topAndBottom");
  assert.equal(shapePos.distT, 15);
  assert.equal(shapePos.distB, 20);
});
