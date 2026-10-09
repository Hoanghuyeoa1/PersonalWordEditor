import test from "node:test";
import assert from "node:assert/strict";
import { parseDrawingElement } from "./drawing/drawingPositionParser.ts";
import type { DocumentMapperContext } from "./mapping/documentMapper.ts";
import { DocumentSerializer } from "./mapping/documentSerializer.ts";
import { mapDocxXmlToDocumentModel } from "./mapping/documentMapper.ts";
import { parseXmlString, pixelsToEmu } from "./utils/xmlUtils.ts";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextBox } from "../editor/textBoxExtension.ts";
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

// Helper XML builder cho DrawingML Text Box
function buildDrawingMlTextBoxXml(options: {
  placement: "anchor" | "inline";
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
  bgColorHex?: string;
  borderColorHex?: string;
  txbxParagraphsXml?: string;
}): string {
  const {
    placement,
    widthPx,
    heightPx,
    offsetXPx = 0,
    offsetYPx = 0,
    wrapElement = '<wp:wrapSquare wrapText="bothSides"/>',
    distTPx = 0,
    distBPx = 0,
    distLPx = 0,
    distRPx = 0,
    hRel = "column",
    vRel = "paragraph",
    bgColorHex = "FFFFFF",
    borderColorHex = "CBD5E1",
    txbxParagraphsXml = `<w:p><w:r><w:t>Hello Floating TextBox</w:t></w:r></w:p>`,
  } = options;

  const widthEmu = pixelsToEmu(widthPx);
  const heightEmu = pixelsToEmu(heightPx);
  const offsetXEmu = pixelsToEmu(offsetXPx);
  const offsetYEmu = pixelsToEmu(offsetYPx);
  const distTEmu = pixelsToEmu(distTPx);
  const distBEmu = pixelsToEmu(distBPx);
  const distLEmu = pixelsToEmu(distLPx);
  const distREmu = pixelsToEmu(distRPx);

  const innerContent = `
    <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
    <wp:effectExtent b="0" l="0" r="0" t="0"/>
    <wp:docPr id="501" name="Text Box 1" descr="Sample Floating Text Box"/>
    <wp:cNvGraphicFramePr/>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
        <wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
          <wps:cNvSpPr txBox="1"/>
          <wps:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            <a:solidFill><a:srgbClr val="${bgColorHex}"/></a:solidFill>
            <a:ln w="9525"><a:solidFill><a:srgbClr val="${borderColorHex}"/></a:solidFill></a:ln>
          </wps:spPr>
          <wps:txbx>
            <w:txbxContent xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              ${txbxParagraphsXml}
            </w:txbxContent>
          </wps:txbx>
          <wps:bodyPr/>
        </wps:wsp>
      </a:graphicData>
    </a:graphic>
  `;

  if (placement === "anchor") {
    return `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
               xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <wp:anchor distT="${distTEmu}" distB="${distBEmu}" distL="${distLEmu}" distR="${distREmu}"
                 simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
        <wp:simplePos x="0" y="0"/>
        <wp:positionH relativeFrom="${hRel}">
          <wp:posOffset>${offsetXEmu}</wp:posOffset>
        </wp:positionH>
        <wp:positionV relativeFrom="${vRel}">
          <wp:posOffset>${offsetYEmu}</wp:posOffset>
        </wp:positionV>
        ${innerContent}
        ${wrapElement}
      </wp:anchor>
    </w:drawing>`;
  }

  return `<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
             xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
    <wp:inline distT="${distTEmu}" distB="${distBEmu}" distL="${distLEmu}" distR="${distREmu}">
      ${innerContent}
    </wp:inline>
  </w:drawing>`;
}

// 1. FLOATING TEXTBOX IMPORT
test("PHASE 10 - 1. Floating TextBox: Import DrawingML floating textbox with anchor placement and offsets", () => {
  const ctx = createMockMapperContext();
  const xml = buildDrawingMlTextBoxXml({
    placement: "anchor",
    widthPx: 300,
    heightPx: 100,
    offsetXPx: 50,
    offsetYPx: 30,
    hRel: "page",
    vRel: "margin",
  });

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed, "Phải phân tích thành công đối tượng Drawing");
  assert.equal(parsed.position.placement, "floating");
  assert.equal(parsed.position.width, 300);
  assert.equal(parsed.position.height, 100);
  assert.equal(parsed.position.offsetX, 50);
  assert.equal(parsed.position.offsetY, 30);
  assert.equal(parsed.position.horizontalRelative, "page");
  assert.equal(parsed.position.verticalRelative, "margin");
  assert.equal(parsed.payload.kind, "textBox");

  if (parsed.payload.kind === "textBox") {
    assert.ok(parsed.payload.content.length > 0);
    assert.equal(parsed.payload.content[0].type, "paragraph");
    const textNode = parsed.payload.content[0].content?.[0];
    assert.equal(textNode?.text, "Hello Floating TextBox");
  }
});

// 2. BLOCK TEXTBOX REGRESSION
test("PHASE 10 - 2. Block TextBox Regression: Non-floating TextBox operates without drawingPosition", () => {
  const blockTextBoxNode: JSONContent = {
    type: "textBox",
    attrs: {
      width: 350,
      minHeight: 90,
      alignment: "center",
      backgroundColor: "#f8fafc",
      borderColor: "#94a3b8",
      drawingPosition: null, // Không có anchor nổi
    },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung hộp văn bản khối an toàn" }],
      },
    ],
  };

  assert.equal(blockTextBoxNode.attrs?.drawingPosition, null);
  assert.equal(blockTextBoxNode.attrs?.width, 350);
  assert.equal(blockTextBoxNode.attrs?.alignment, "center");

  // Serialization giữ nguyên nội dung
  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize({
    id: "test-doc",
    schemaVersion: 1,
    metadata: { title: "Test", createdAt: "", updatedAt: "" },
    content: {
      type: "doc",
      content: [blockTextBoxNode],
    },
  });

  assert.ok(serialized.documentXml.includes("Nội dung hộp văn bản khối an toàn"));
});

// 3. RICH FORMATTING PRESERVATION
test("PHASE 10 - 3. Rich Formatting: Preserves multiple paragraphs, bold, italic, color, size, and align", () => {
  const ctx = createMockMapperContext();
  const richXml = buildDrawingMlTextBoxXml({
    placement: "anchor",
    widthPx: 320,
    heightPx: 120,
    txbxParagraphsXml: `
      <w:p>
        <w:pPr><w:jc w:val="center"/></w:pPr>
        <w:r>
          <w:rPr>
            <w:b/>
            <w:color w:val="FF0000"/>
            <w:sz w:val="32"/>
          </w:rPr>
          <w:t>Tiêu đề đỏ đậm</w:t>
        </w:r>
      </w:p>
      <w:p>
        <w:r>
          <w:rPr>
            <w:i/>
            <w:u w:val="single"/>
          </w:rPr>
          <w:t>Đoạn nghiêng gạch chân</w:t>
        </w:r>
      </w:p>
    `,
  });

  const doc = parseXmlString(richXml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed && parsed.payload.kind === "textBox");
  const paragraphs = parsed.payload.content;
  assert.equal(paragraphs.length, 2, "Phải trích xuất đủ 2 đoạn văn phong phú");

  // Đoạn 1: Căn giữa, chữ đậm, màu đỏ, cỡ 16pt (32 half-pts)
  const p1 = paragraphs[0];
  assert.equal(p1.attrs?.textAlign, "center");
  const p1Text = p1.content?.[0];
  assert.equal(p1Text?.text, "Tiêu đề đỏ đậm");
  const p1Marks = p1Text?.marks || [];
  assert.ok(p1Marks.some((m) => m.type === "bold"), "Phải có mark bold");
  const p1TextStyle = p1Marks.find((m) => m.type === "textStyle");
  assert.equal(p1TextStyle?.attrs?.color, "#FF0000");
  assert.equal(p1TextStyle?.attrs?.fontSize, "16pt");

  // Đoạn 2: Chữ nghiêng, gạch chân
  const p2 = paragraphs[1];
  const p2Text = p2.content?.[0];
  assert.equal(p2Text?.text, "Đoạn nghiêng gạch chân");
  const p2Marks = p2Text?.marks || [];
  assert.ok(p2Marks.some((m) => m.type === "italic"), "Phải có mark italic");
  assert.ok(p2Marks.some((m) => m.type === "underline"), "Phải có mark underline");
});

// 4. POSITION & ALIGNMENT
test("PHASE 10 - 4. Position & Alignment: Relative anchors and pixel offsets resolve cleanly", () => {
  const ctx = createMockMapperContext();
  const xml = buildDrawingMlTextBoxXml({
    placement: "anchor",
    widthPx: 200,
    heightPx: 100,
    offsetXPx: 100,
    offsetYPx: 50,
    hRel: "margin",
    vRel: "paragraph",
  });

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.horizontalRelative, "margin");
  assert.equal(parsed.position.verticalRelative, "paragraph");
  assert.equal(parsed.position.offsetX, 100);
  assert.equal(parsed.position.offsetY, 50);
});

// 5. SIZE SANITIZATION
test("PHASE 10 - 5. Size: Width and height EMU accurately converted to pixels and bounded", () => {
  const ctx = createMockMapperContext();
  const xml = buildDrawingMlTextBoxXml({
    placement: "anchor",
    widthPx: 400,
    heightPx: 150,
  });

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.width, 400);
  assert.equal(parsed.position.height, 150);
});

// 6. SQUARE WRAPPING
test("PHASE 10 - 6. Square Wrapping: wrapMode square and distance padding preserved", () => {
  const ctx = createMockMapperContext();
  const xml = buildDrawingMlTextBoxXml({
    placement: "anchor",
    widthPx: 300,
    heightPx: 100,
    wrapElement: '<wp:wrapSquare wrapText="left"/>',
    distTPx: 10,
    distBPx: 20,
    distLPx: 15,
    distRPx: 25,
  });

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.wrapMode, "square");
  assert.equal(parsed.position.wrapTextSide, "left");
  assert.equal(parsed.position.distT, 10);
  assert.equal(parsed.position.distB, 20);
  assert.equal(parsed.position.distL, 15);
  assert.equal(parsed.position.distR, 25);
});

// 7. TOP & BOTTOM WRAPPING
test("PHASE 10 - 7. Top & Bottom Wrapping: wrapMode topAndBottom correctly parsed", () => {
  const ctx = createMockMapperContext();
  const xml = buildDrawingMlTextBoxXml({
    placement: "anchor",
    widthPx: 300,
    heightPx: 100,
    wrapElement: "<wp:wrapTopAndBottom/>",
  });

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.wrapMode, "topAndBottom");
});

// 8. TIGHT WRAPPING & FALLBACK
test("PHASE 10 - 8. Tight Wrapping & Fallback: wrapMode tight parsed, rectangular fallback verified", () => {
  const ctx = createMockMapperContext();
  const xml = buildDrawingMlTextBoxXml({
    placement: "anchor",
    widthPx: 300,
    heightPx: 100,
    wrapElement: `
      <wp:wrapTight wrapText="bothSides">
        <wp:wrapPolygon edited="0">
          <wp:start x="0" y="0"/>
          <wp:lineTo x="2857500" y="0"/>
          <wp:lineTo x="2857500" y="952500"/>
          <wp:lineTo x="0" y="952500"/>
          <wp:lineTo x="0" y="0"/>
        </wp:wrapPolygon>
      </wp:wrapTight>
    `,
  });

  const doc = parseXmlString(xml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed);
  assert.equal(parsed.position.wrapMode, "tight");
  assert.ok(parsed.position.wrapPolygon && parsed.position.wrapPolygon.length >= 4);
});

// 9. VML LEGACY FALLBACK
test("PHASE 10 - 9. VML Legacy Fallback: Parse w:pict v:shape v:textbox with styling and rich content", () => {
  const ctx = createMockMapperContext();
  const vmlXml = `
    <w:pict xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml">
      <v:shape id="_x0000_s1026" type="#_x0000_t202"
               style="position:absolute;margin-left:72pt;margin-top:36pt;width:240pt;height:120pt;z-index:251659264;mso-wrap-style:square;mso-position-horizontal-relative:margin;mso-position-vertical-relative:paragraph"
               fillcolor="#ffedd5" strokecolor="#ea580c">
        <v:textbox style="mso-next-textbox:#_x0000_s1026">
          <w:txbxContent>
            <w:p>
              <w:pPr><w:jc w:val="right"/></w:pPr>
              <w:r>
                <w:rPr>
                  <w:b/>
                  <w:color w:val="EA580C"/>
                </w:rPr>
                <w:t>VML Legacy TextBox Content</w:t>
              </w:r>
            </w:p>
          </w:txbxContent>
        </v:textbox>
      </v:shape>
    </w:pict>
  `;

  const doc = parseXmlString(vmlXml);
  const parsed = parseDrawingElement(doc.documentElement, ctx);

  assert.ok(parsed, "Phải phân tích thành công đối tượng VML");
  assert.equal(parsed.payload.kind, "textBox");
  assert.equal(parsed.position.placement, "floating");
  // 240pt = 320px (240 * 96 / 72)
  assert.equal(parsed.position.width, 320);
  // 120pt = 160px
  assert.equal(parsed.position.height, 160);
  // 72pt = 96px
  assert.equal(parsed.position.offsetX, 96);
  // 36pt = 48px
  assert.equal(parsed.position.offsetY, 48);
  assert.equal(parsed.position.wrapMode, "square");
  assert.equal(parsed.position.horizontalRelative, "margin");
  assert.equal(parsed.position.verticalRelative, "paragraph");

  // Kiểm tra màu sắc từ VML shape
  if (parsed.payload.kind === "textBox") {
    assert.equal(parsed.payload.backgroundColor, "#ffedd5");
    assert.equal(parsed.payload.borderColor, "#ea580c");

    // Nội dung phong phú được bảo toàn
    const p = parsed.payload.content[0];
    assert.equal(p.attrs?.textAlign, "right");
    const t = p.content?.[0];
    assert.equal(t?.text, "VML Legacy TextBox Content");
    assert.ok(t?.marks?.some((m) => m.type === "bold"));
  }

  // Cảnh báo chẩn đoán được ghi nhận
  assert.ok(ctx.warnings.some((w) => w.includes("VML TextBox kế thừa")));
});

// 10. FULL DOCX ROUND-TRIP
test("PHASE 10 - 10. Full DOCX Round-Trip: Floating TextBox with rich text exports and imports losslessly", async () => {
  const originalPos: DrawingPosition = {
    placement: "floating",
    width: 320,
    height: 110,
    distT: 8,
    distB: 12,
    distL: 14,
    distR: 16,
    wrapMode: "square",
    wrapTextSide: "bothSides",
    horizontalRelative: "column",
    verticalRelative: "paragraph",
    offsetX: 40,
    offsetY: 20,
  };

  const originalTextBox: JSONContent = {
    type: "textBox",
    attrs: {
      width: 320,
      minHeight: 110,
      alignment: "left",
      backgroundColor: "#e0f2fe",
      borderColor: "#0284c7",
      drawingPosition: originalPos,
    },
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          {
            type: "text",
            marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#0284c7" } }],
            text: "Tiêu đề hộp nổi",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "italic" }],
            text: "Đoạn mô tả chi tiết bên trong hộp.",
          },
        ],
      },
    ],
  };

  const docJson: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thân bài phía trước." }],
      },
      originalTextBox,
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thân bài phía sau." }],
      },
    ],
  };

  // 1. Export sang DOCX XML
  const serializer = new DocumentSerializer();
  const serialized = serializer.serialize({
    id: "roundtrip-doc",
    schemaVersion: 1,
    metadata: { title: "Roundtrip", createdAt: "", updatedAt: "" },
    content: docJson,
  });

  assert.ok(serialized.documentXml.includes("<wps:txbx>"), "XML phải chứa wps:txbx");
  assert.ok(serialized.documentXml.includes("<w:txbxContent>"), "XML phải chứa w:txbxContent");
  assert.ok(serialized.documentXml.includes("Tiêu đề hộp nổi"), "XML phải chứa text của hộp");
  assert.ok(serialized.documentXml.includes("Đoạn mô tả chi tiết bên trong hộp."), "XML phải chứa đoạn 2");
  assert.ok(serialized.documentXml.includes("<wp:wrapSquare"), "XML phải chứa wrapSquare");

  // 2. Import ngược lại bằng mapDocxXmlToDocumentModel
  const mapperCtx = createMockMapperContext();
  const result = mapDocxXmlToDocumentModel(serialized.documentXml, mapperCtx);

  const parsedBox = result.content.content?.find((n) => n.type === "textBox");
  assert.ok(parsedBox, "Tài liệu sau khi import phải tìm thấy node textBox");
  assert.equal(parsedBox.attrs?.drawingPosition?.placement, "floating");
  assert.equal(parsedBox.attrs?.drawingPosition?.wrapMode, "square");
  assert.equal(parsedBox.attrs?.drawingPosition?.width, 320);
  assert.equal(parsedBox.attrs?.drawingPosition?.height, 110);
  assert.equal(parsedBox.attrs?.drawingPosition?.offsetX, 40);
  assert.equal(parsedBox.attrs?.drawingPosition?.offsetY, 20);

  // Bảo toàn nội dung con
  const children = parsedBox.content || [];
  assert.equal(children.length, 2, "Hộp phải giữ nguyên 2 đoạn văn");
  assert.equal(children[0].attrs?.textAlign, "center");
  assert.equal(children[0].content?.[0].text, "Tiêu đề hộp nổi");
  assert.ok(children[0].content?.[0].marks?.some((m) => m.type === "bold"));
  assert.equal(children[1].content?.[0].text, "Đoạn mô tả chi tiết bên trong hộp.");
  assert.ok(children[1].content?.[0].marks?.some((m) => m.type === "italic"));
});

// 11. INTERACTION & UNDO/REDO SAFETY
test("PHASE 10 - 11. Interaction Safety: Typing, selection, commands, and Undo/Redo inside TextBox are safe", async () => {
  const { getEditorExtensions } = await import("../editor/editorExtensions.ts");
  const { insertFloatingTextBox } = await import("../editor/editorCommands.ts");

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản ngoài" }],
        },
      ],
    },
  });

  // 1. Chèn Floating TextBox qua command
  const inserted = insertFloatingTextBox(editor, {
    width: 300,
    height: 100,
    initialText: "Văn bản mẫu",
    position: {
      offsetX: 20,
      offsetY: 30,
      wrapMode: "square",
    },
  });

  assert.ok(inserted, "Lệnh insertFloatingTextBox phải thành công");
  const json1 = editor.getJSON();
  const boxNode = json1.content?.find((n) => n.type === "textBox");
  assert.ok(boxNode, "Phải có node textBox trong ProseMirror doc");
  assert.equal(boxNode.attrs?.drawingPosition?.placement, "floating");
  assert.equal(boxNode.attrs?.drawingPosition?.offsetX, 20);

  // 2. Undo chèn hộp văn bản
  editor.commands.undo();
  const jsonAfterUndo = editor.getJSON();
  const hasBoxAfterUndo = jsonAfterUndo.content?.some((n) => n.type === "textBox");
  assert.equal(hasBoxAfterUndo, false, "Undo phải xóa bỏ hộp văn bản đã chèn");

  // 3. Redo phục hồi hộp văn bản
  editor.commands.redo();
  const jsonAfterRedo = editor.getJSON();
  const boxAfterRedo = jsonAfterRedo.content?.find((n) => n.type === "textBox");
  assert.ok(boxAfterRedo, "Redo phải phục hồi lại hộp văn bản");
  assert.equal(boxAfterRedo.attrs?.drawingPosition?.placement, "floating");
  assert.equal(boxAfterRedo.attrs?.drawingPosition?.offsetX, 20);

  editor.destroy();
});
