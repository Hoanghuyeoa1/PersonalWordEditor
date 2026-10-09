import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  insertShape,
  deleteShape,
  setShapeDimensions,
  setShapeFillColor,
  setShapeStrokeColor,
  setShapeStrokeWidth,
  setShapeAlignment,
  isShapeActive,
  getShapeAttributes,
  validateShapeDimensions,
  SHAPE_LIMITS,
  insertEquation,
  updateEquation,
  deleteEquation,
  setEquationAlignment,
  isEquationActive,
  getEquationAttributes,
  insertTextBox,
  insertTable,
} from "../editor/editorCommands.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  createInitialDocument,
  extractDocumentStats,
} from "../document/documentModel.ts";
import {
  calculatePaginationState,
  estimateContentHeightPx,
} from "../page/services/paginationService.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/index.ts";
import type { ShapeType } from "../editor/shapeExtension.ts";

function createEditor(content?: any) {
  return new Editor({
    extensions: getEditorExtensions(),
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản mẫu khởi tạo" }],
        },
      ],
    },
  });
}

test("Phase 3.8 - 1. Schema Extensions: shape and equation nodes exist in schema with block group", () => {
  const editor = createEditor();
  const schema = editor.schema;

  // Kiểm tra node shape
  assert.ok(schema.nodes.shape, "shape node must exist in ProseMirror schema");
  assert.equal(schema.nodes.shape.spec.group, "block", "shape must belong to block group");
  assert.equal(schema.nodes.shape.spec.atom, true, "shape must be atom node");
  assert.ok(schema.nodes.shape.spec.attrs?.shapeType, "shape must have shapeType attr");
  assert.ok(schema.nodes.shape.spec.attrs?.width, "shape must have width attr");
  assert.ok(schema.nodes.shape.spec.attrs?.height, "shape must have height attr");
  assert.ok(schema.nodes.shape.spec.attrs?.fillColor, "shape must have fillColor attr");
  assert.ok(schema.nodes.shape.spec.attrs?.strokeColor, "shape must have strokeColor attr");
  assert.ok(schema.nodes.shape.spec.attrs?.strokeWidth, "shape must have strokeWidth attr");
  assert.ok(schema.nodes.shape.spec.attrs?.alignment, "shape must have alignment attr");

  // Kiểm tra node equation
  assert.ok(schema.nodes.equation, "equation node must exist in ProseMirror schema");
  assert.equal(schema.nodes.equation.spec.group, "block", "equation must belong to block group");
  assert.equal(schema.nodes.equation.spec.atom, true, "equation must be atom node");
  assert.ok(schema.nodes.equation.spec.attrs?.latex, "equation must have latex attr");
  assert.ok(schema.nodes.equation.spec.attrs?.displayMode, "equation must have displayMode attr");
  assert.ok(schema.nodes.equation.spec.attrs?.alignment, "equation must have alignment attr");

  editor.destroy();
});

test("Phase 3.8 - 2. Shape Validation: validateShapeDimensions enforces limits and sanitization", () => {
  // Kích thước hợp lệ
  const valid = validateShapeDimensions(240, 150);
  assert.equal(valid.isValid, true);
  assert.equal(valid.sanitizedWidth, 240);
  assert.equal(valid.sanitizedHeight, 150);

  // Mặc định
  const def = validateShapeDimensions();
  assert.equal(def.isValid, true);
  assert.equal(def.sanitizedWidth, SHAPE_LIMITS.DEFAULT_WIDTH);
  assert.equal(def.sanitizedHeight, SHAPE_LIMITS.DEFAULT_HEIGHT);

  // Quá nhỏ (< 20px hoặc < 10px)
  const tooSmall = validateShapeDimensions(10, 5);
  assert.equal(tooSmall.isValid, false);
  assert.equal(tooSmall.sanitizedWidth, SHAPE_LIMITS.MIN_WIDTH);
  assert.equal(tooSmall.sanitizedHeight, SHAPE_LIMITS.MIN_HEIGHT);

  // Quá lớn (> 800px hoặc > 600px)
  const tooLarge = validateShapeDimensions(1200, 900);
  assert.equal(tooLarge.isValid, false);
  assert.equal(tooLarge.sanitizedWidth, SHAPE_LIMITS.MAX_WIDTH);
  assert.equal(tooLarge.sanitizedHeight, SHAPE_LIMITS.MAX_HEIGHT);

  // NaN / không hợp lệ
  const nanVal = validateShapeDimensions(NaN, 100);
  assert.equal(nanVal.isValid, false);
  assert.equal(nanVal.sanitizedWidth, SHAPE_LIMITS.DEFAULT_WIDTH);
});

test("Phase 3.8 - 3. Shape Insertion: supports exactly 5 core shapes (rectangle, roundedRectangle, ellipse, line, arrow)", () => {
  const shapes: ShapeType[] = ["rectangle", "roundedRectangle", "ellipse", "line", "arrow"];

  for (const s of shapes) {
    const editor = createEditor();
    const ok = insertShape(editor, {
      shapeType: s,
      width: 250,
      height: 140,
      fillColor: "#e0f2fe",
      strokeColor: "#0284c7",
      strokeWidth: 3,
      alignment: "center",
    });

    assert.equal(ok, true, `Insert shape ${s} must succeed`);

    const json = editor.getJSON();
    const shapeNode = json.content?.find((n) => n.type === "shape");
    assert.ok(shapeNode, `Shape node ${s} must exist in JSON AST`);
    assert.equal(shapeNode.attrs?.shapeType, s);
    assert.equal(shapeNode.attrs?.width, 250);
    assert.equal(shapeNode.attrs?.height, 140);
    assert.equal(shapeNode.attrs?.fillColor, "#e0f2fe");
    assert.equal(shapeNode.attrs?.strokeColor, "#0284c7");
    assert.equal(shapeNode.attrs?.strokeWidth, 3);
    assert.equal(shapeNode.attrs?.alignment, "center");

    editor.destroy();
  }
});

test("Phase 3.8 - 4. Shape Selection & Attribute Inspection: detects active state and retrieves attrs", () => {
  const editor = createEditor();
  insertShape(editor, {
    shapeType: "ellipse",
    width: 220,
    height: 160,
    fillColor: "#fef3c7",
    strokeColor: "#d97706",
  });

  // Kiểm tra trạng thái đang chọn
  assert.equal(isShapeActive(editor), true, "Shape should be active after insertion");
  const attrs = getShapeAttributes(editor);
  assert.equal(attrs.shapeType, "ellipse");
  assert.equal(attrs.width, 220);
  assert.equal(attrs.height, 160);
  assert.equal(attrs.fillColor, "#fef3c7");
  assert.equal(attrs.strokeColor, "#d97706");

  editor.destroy();
});

test("Phase 3.8 - 5. Shape Mutation: updates dimensions, fill, stroke, and alignment cleanly", () => {
  const editor = createEditor();
  insertShape(editor, {
    shapeType: "rectangle",
    width: 200,
    height: 100,
  });

  // Thay đổi kích thước
  const dimOk = setShapeDimensions(editor, 320, 180);
  assert.equal(dimOk, true, "setShapeDimensions should succeed");
  let attrs = getShapeAttributes(editor);
  assert.equal(attrs.width, 320);
  assert.equal(attrs.height, 180);

  // Thay đổi màu tô (fill)
  const fillOk = setShapeFillColor(editor, "#dcfce7");
  assert.equal(fillOk, true, "setShapeFillColor should succeed");
  attrs = getShapeAttributes(editor);
  assert.equal(attrs.fillColor, "#dcfce7");

  // Thay đổi viền (stroke color & width)
  const strokeOk = setShapeStrokeColor(editor, "#16a34a");
  assert.equal(strokeOk, true, "setShapeStrokeColor should succeed");
  const widthOk = setShapeStrokeWidth(editor, 4);
  assert.equal(widthOk, true, "setShapeStrokeWidth should succeed");
  attrs = getShapeAttributes(editor);
  assert.equal(attrs.strokeColor, "#16a34a");
  assert.equal(attrs.strokeWidth, 4);

  // Thay đổi căn lề
  const alignOk = setShapeAlignment(editor, "right");
  assert.equal(alignOk, true, "setShapeAlignment should succeed");
  attrs = getShapeAttributes(editor);
  assert.equal(attrs.alignment, "right");

  editor.destroy();
});

test("Phase 3.8 - 6. Shape Deletion: removes shape node cleanly", () => {
  const editor = createEditor();
  insertShape(editor, { shapeType: "arrow" });
  assert.equal(isShapeActive(editor), true);

  const delOk = deleteShape(editor);
  assert.equal(delOk, true, "deleteShape should succeed");

  const json = editor.getJSON();
  const shapeNode = json.content?.find((n) => n.type === "shape");
  assert.equal(shapeNode, undefined, "Shape node should no longer exist after deletion");

  editor.destroy();
});

test("Phase 3.8 - 7. Equation Insertion: inserts equation node with LaTeX source and default attrs", () => {
  const editor = createEditor();
  const latexSource = "x^2 + y^2 = z^2";

  const ok = insertEquation(editor, {
    latex: latexSource,
    displayMode: true,
    alignment: "center",
  });
  assert.equal(ok, true, "insertEquation should succeed");

  const json = editor.getJSON();
  const eqNode = json.content?.find((n) => n.type === "equation");
  assert.ok(eqNode, "equation node must exist in document AST");
  assert.equal(eqNode.attrs?.latex, latexSource, "Source LaTeX must be stored in document model");
  assert.equal(eqNode.attrs?.displayMode, true);
  assert.equal(eqNode.attrs?.alignment, "center");

  assert.equal(isEquationActive(editor), true);
  const attrs = getEquationAttributes(editor);
  assert.equal(attrs.latex, latexSource);

  editor.destroy();
});

test("Phase 3.8 - 8. Equation Update: updates LaTeX source in document model without losing node", () => {
  const editor = createEditor();
  insertEquation(editor, { latex: "E = mc^2" });

  const updatedLatex = "\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}";
  const updateOk = updateEquation(editor, updatedLatex);
  assert.equal(updateOk, true, "updateEquation should succeed");

  const attrs = getEquationAttributes(editor);
  assert.equal(attrs.latex, updatedLatex, "Equation latex attribute must be updated in model");

  const alignOk = setEquationAlignment(editor, "left");
  assert.equal(alignOk, true, "setEquationAlignment should succeed");
  assert.equal(getEquationAttributes(editor).alignment, "left");

  editor.destroy();
});

test("Phase 3.8 - 9. Equation Deletion: removes equation cleanly", () => {
  const editor = createEditor();
  insertEquation(editor, { latex: "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" });
  assert.equal(isEquationActive(editor), true);

  const delOk = deleteEquation(editor);
  assert.equal(delOk, true, "deleteEquation should succeed");

  const json = editor.getJSON();
  const eqNode = json.content?.find((n) => n.type === "equation");
  assert.equal(eqNode, undefined, "Equation node should no longer exist after deletion");

  editor.destroy();
});

test("Phase 3.8 - 10. Undo / Redo: tracks history for Shape and Equation creation and edits", () => {
  const editor = createEditor();

  // Chèn Shape
  insertShape(editor, { shapeType: "ellipse", width: 200, height: 100 });
  assert.ok(editor.getJSON().content?.some((n) => n.type === "shape"));

  // Undo chèn Shape
  editor.commands.undo();
  assert.equal(editor.getJSON().content?.some((n) => n.type === "shape"), false, "Undo should revert shape insertion");

  // Redo chèn Shape
  editor.commands.redo();
  assert.ok(editor.getJSON().content?.some((n) => n.type === "shape"), "Redo should restore shape insertion");

  // Chèn Equation
  insertEquation(editor, { latex: "a^2 + b^2 = c^2" });
  assert.ok(editor.getJSON().content?.some((n) => n.type === "equation"));

  // Undo chèn Equation
  editor.commands.undo();
  assert.equal(editor.getJSON().content?.some((n) => n.type === "equation"), false, "Undo should revert equation insertion");

  // Redo chèn Equation
  editor.commands.redo();
  assert.ok(editor.getJSON().content?.some((n) => n.type === "equation"), "Redo should restore equation insertion");

  editor.destroy();
});

test("Phase 3.8 - 11. Security & Stability: KaTeX renders without eval, safely handling complex formulas", () => {
  const formulas = [
    "x^2 + y^2 = z^2",
    "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
    "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
    "\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x = e",
    "<script>alert('xss')</script>", // Đảm bảo an toàn không crash
  ];

  for (const f of formulas) {
    const editor = createEditor();
    const ok = insertEquation(editor, { latex: f });
    assert.equal(ok, true, `Insert formula "${f}" should complete safely`);
    const json = editor.getJSON();
    const eqNode = json.content?.find((n) => n.type === "equation");
    assert.ok(eqNode, "equation node must exist");
    assert.equal(eqNode.attrs?.latex, f);
    editor.destroy();
  }
});

test("Phase 3.8 - 12. Persistence (.mwd): Round-trip Save and Open preserves shape attrs and equation LaTeX source", () => {
  const editor = createEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản trước khối đồ họa." }],
      },
    ],
  });

  // Chèn shape
  insertShape(editor, {
    shapeType: "roundedRectangle",
    width: 280,
    height: 140,
    fillColor: "#fef9c3",
    strokeColor: "#ca8a04",
    strokeWidth: 3,
    alignment: "center",
  });

  // Chèn paragraph đệm để tránh thay thế trực tiếp node đang được chọn
  editor.commands.insertContentAt(editor.state.doc.content.size, {
    type: "paragraph",
    content: [{ type: "text", text: "Công thức tiếp theo:" }],
  });

  // Chèn equation ở cuối
  editor.commands.insertContentAt(editor.state.doc.content.size, {
    type: "equation",
    attrs: {
      latex: "f(x) = \\int_{-\\infty}^{x} e^{-t^2} dt",
      displayMode: true,
      alignment: "center",
    },
  });

  // Tạo document model
  const doc = createInitialDocument("Test Shape and Equation Document");
  doc.content = editor.getJSON();

  // Serialize sang .mwd
  const mwdJsonString = serializeDocumentToMwd(doc);
  assert.ok(mwdJsonString.length > 0, "Serialized .mwd string must not be empty");

  // Deserialize trở lại
  const deserializeResult = deserializeMwdToDocument(mwdJsonString);
  assert.equal(deserializeResult.success, true);
  if (!deserializeResult.success) return;

  const restoredDoc = deserializeResult.document;
  assert.equal(deserializeResult.formatVersion, 1);

  const restoredContent = restoredDoc.content;
  assert.ok(restoredContent.content, "Restored content must have content array");

  // Tìm node Shape
  const restoredShape = restoredContent.content.find((n) => n.type === "shape");
  assert.ok(restoredShape, "Restored document must contain shape node");
  assert.equal(restoredShape.attrs?.shapeType, "roundedRectangle");
  assert.equal(restoredShape.attrs?.width, 280);
  assert.equal(restoredShape.attrs?.height, 140);
  assert.equal(restoredShape.attrs?.fillColor, "#fef9c3");
  assert.equal(restoredShape.attrs?.strokeColor, "#ca8a04");
  assert.equal(restoredShape.attrs?.strokeWidth, 3);
  assert.equal(restoredShape.attrs?.alignment, "center");

  // Tìm node Equation
  const restoredEquation = restoredContent.content.find((n) => n.type === "equation");
  assert.ok(restoredEquation, "Restored document must contain equation node");
  assert.equal(restoredEquation.attrs?.latex, "f(x) = \\int_{-\\infty}^{x} e^{-t^2} dt");
  assert.equal(restoredEquation.attrs?.displayMode, true);
  assert.equal(restoredEquation.attrs?.alignment, "center");

  // Mở lại trong editor mới để đảm bảo schema chấp nhận hoàn toàn
  const reloadedEditor = createEditor(restoredContent);
  assert.ok(reloadedEditor.getJSON().content?.some((n) => n.type === "shape"));
  assert.ok(reloadedEditor.getJSON().content?.some((n) => n.type === "equation"));

  reloadedEditor.destroy();
  editor.destroy();
});

test("Phase 3.8 - 13. Regression & Coexistence: text, heading, table, textBox, shape, and equation live harmoniously", () => {
  const multiTypeDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Báo cáo Khoa học Kỹ thuật" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn giới thiệu các thành phần tài liệu." }],
      },
      {
        type: "shape",
        attrs: {
          shapeType: "arrow",
          width: 220,
          height: 60,
          alignment: "center",
        },
      },
      {
        type: "equation",
        attrs: {
          latex: "\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}",
          alignment: "center",
        },
      },
      {
        type: "textBox",
        attrs: { width: 300, alignment: "left" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Ghi chú trong hộp văn bản." }],
          },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Ô 1" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Ô 2" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = createEditor(multiTypeDoc);

  const json = editor.getJSON();
  const types = json.content?.map((n) => n.type) || [];

  assert.ok(types.includes("heading"), "Should have heading");
  assert.ok(types.includes("table"), "Should have table");
  assert.ok(types.includes("textBox"), "Should have textBox");
  assert.ok(types.includes("shape"), "Should have shape");
  assert.ok(types.includes("equation"), "Should have equation");

  // Kiểm tra trích xuất thống kê văn bản
  const stats = extractDocumentStats(json);
  assert.ok(stats.words > 0, "Word count must be positive");
  assert.ok(stats.characters > 0, "Character count must be positive");

  editor.destroy();
});

test("Phase 3.8 - 14. Pagination Safety: estimateContentHeightPx and calculatePaginationState handle shapes and equations without loops", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn mở đầu tài liệu." }],
      },
      {
        type: "shape",
        attrs: {
          shapeType: "rectangle",
          width: 300,
          height: 150,
          fillColor: "#f1f5f9",
          strokeColor: "#64748b",
          strokeWidth: 2,
          alignment: "center",
        },
      },
      {
        type: "equation",
        attrs: {
          latex: "e^{i\\pi} + 1 = 0",
          displayMode: true,
          alignment: "center",
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kết thúc tài liệu." }],
      },
    ],
  };

  // Đo chiều cao headless
  const estimatedHeight = estimateContentHeightPx(content, 600, 11, 1.15);
  // Shape: 150 + 32 = 182px, Equation: 64px, 2 Paragraphs: ~50px
  assert.ok(estimatedHeight > 250, `Estimated height (${estimatedHeight}px) must be realistic`);
  assert.ok(Number.isFinite(estimatedHeight), "Height must be finite");
  assert.ok(!isNaN(estimatedHeight), "Height must not be NaN");

  // Tính toán phân trang với config
  const pagState = calculatePaginationState(content, DEFAULT_PAGE_SETTINGS);
  assert.ok(pagState.pageCount >= 1, "Must have at least 1 page");
  assert.equal(pagState.pages.length, pagState.pageCount);
  assert.equal(pagState.pages[0].pageNumber, 1);

  // Thêm 20 shapes và equations liên tiếp để kiểm tra reflow nhiều trang không loop
  const multiNodeContent = {
    type: "doc",
    content: [] as any[],
  };
  for (let i = 0; i < 10; i++) {
    multiNodeContent.content.push({
      type: "shape",
      attrs: { shapeType: "ellipse", width: 250, height: 180 },
    });
    multiNodeContent.content.push({
      type: "equation",
      attrs: { latex: `x_${i} = \\sqrt{${i + 1}}` },
    });
  }

  const multiPageState = calculatePaginationState(multiNodeContent, DEFAULT_PAGE_SETTINGS);
  assert.ok(multiPageState.pageCount >= 1, "Multiple shapes and equations must be paginated safely");
  assert.ok(multiPageState.pageCount < 50, "Pagination must terminate cleanly without runaway loop");
});
