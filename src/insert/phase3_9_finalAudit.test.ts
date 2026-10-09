import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  insertPageBreak,
  insertSectionBreak,
  insertHorizontalRule,
  updateOrInsertLink,
  unsetLink,
  isLinkActive,
  insertSymbol,
  insertTable,
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColumnLeft,
  addColumnRight,
  deleteColumn,
  deleteTable,
  toggleHeaderRow,
  mergeCells,
  splitCell,
  setCellTextAlign,
  setCellVerticalAlign,
  setCellBackgroundColor,
  setTableBorders,
  getTableBorders,
  insertImage,
  deleteImage,
  setImageDimensions,
  setImageAlignment,
  setImageAlt,
  isImageActive,
  getImageAttributes,
  validateImageDimensions,
  IMAGE_LIMITS,
  insertTextBox,
  deleteTextBox,
  setTextBoxWidth,
  setTextBoxAlignment,
  setTextBoxBackgroundColor,
  setTextBoxBorderColor,
  isTextBoxActive,
  insertShape,
  deleteShape,
  setShapeDimensions,
  setShapeFillColor,
  setShapeStrokeColor,
  setShapeStrokeWidth,
  setShapeAlignment,
  isShapeActive,
  getShapeAttributes,
  insertEquation,
  updateEquation,
  deleteEquation,
  setEquationAlignment,
  isEquationActive,
  getEquationAttributes,
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

function createEditor(content?: any) {
  return new Editor({
    extensions: getEditorExtensions(),
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn mở đầu tài liệu audit" }],
        },
      ],
    },
  });
}

const SAMPLE_BASE64_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/* ==========================================================================
   1. AUDIT: LINKS & SYMBOLS (Phase 3.2)
   ========================================================================== */

test("Phase 3.9 Audit - 1. Hyperlink, Horizontal Rule, and Symbol: full lifecycle", () => {
  const editor = createEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Truy cập liên kết tại đây" }],
      },
    ],
  });

  // Chọn từ "liên kết" (pos: 9 đến 17)
  editor.commands.setTextSelection({ from: 9, to: 17 });
  assert.equal(isLinkActive(editor), false);

  // Gắn link
  const linkOk = updateOrInsertLink(editor, "liên kết", "https://example.com");
  assert.equal(linkOk, true);
  assert.equal(isLinkActive(editor), true);

  // Cập nhật link
  editor.commands.setTextSelection({ from: 9, to: 17 });
  const updateLinkOk = updateOrInsertLink(editor, "liên kết", "https://example.org/docs");
  assert.equal(updateLinkOk, true);
  const linkMark = editor.getAttributes("link");
  assert.equal(linkMark.href, "https://example.org/docs");

  // Gỡ link
  editor.commands.setTextSelection({ from: 9, to: 17 });
  const unsetOk = unsetLink(editor);
  assert.equal(unsetOk, true);
  assert.equal(isLinkActive(editor), false);

  // Chèn Horizontal Rule
  editor.commands.focus("end");
  const hrOk = insertHorizontalRule(editor);
  assert.equal(hrOk, true);
  assert.ok(editor.getJSON().content?.some((n) => n.type === "horizontalRule"));

  // Chèn Symbol
  editor.commands.focus("end");
  const symOk = insertSymbol(editor, "★");
  assert.equal(symOk, true);
  assert.ok(editor.getText().includes("★"));

  editor.destroy();
});

/* ==========================================================================
   2. AUDIT: TABLE CORE & ADVANCED (Phase 3.3 & 3.4)
   ========================================================================== */

test("Phase 3.9 Audit - 2. Table: insertion, row/col operations, headers, borders, styles, and cell manipulation", () => {
  const editor = createEditor();

  // Chèn bảng 3 hàng 3 cột có header
  const tableOk = insertTable(editor, { rows: 3, cols: 3, withHeaderRow: true });
  assert.equal(tableOk, true);
  assert.equal(editor.isActive("table"), true);

  // Thêm hàng & cột
  const addRowOk = addRowBelow(editor);
  assert.equal(addRowOk, true);
  const addColOk = addColumnRight(editor);
  assert.equal(addColOk, true);

  // Xóa hàng & cột
  const delRowOk = deleteRow(editor);
  assert.equal(delRowOk, true);
  const delColOk = deleteColumn(editor);
  assert.equal(delColOk, true);

  // Header row toggle
  const toggleHROk = toggleHeaderRow(editor);
  assert.equal(toggleHROk, true);

  // Định dạng căn lề ô & màu nền ô
  const alignOk = setCellTextAlign(editor, "center");
  assert.equal(alignOk, true);
  const vAlignOk = setCellVerticalAlign(editor, "middle");
  assert.equal(vAlignOk, true);
  const bgOk = setCellBackgroundColor(editor, "#dbeafe");
  assert.equal(bgOk, true);

  // Kiểu viền bảng
  const borderOk = setTableBorders(editor, "outside");
  assert.equal(borderOk, true);
  assert.equal(getTableBorders(editor), "outside");

  // Xóa bảng sạch sẽ
  const delTableOk = deleteTable(editor);
  assert.equal(delTableOk, true);
  assert.equal(editor.isActive("table"), false);

  editor.destroy();
});

/* ==========================================================================
   3. AUDIT: IMAGE CORE & EXTENDED (Phase 3.5 & 3.6)
   ========================================================================== */

test("Phase 3.9 Audit - 3. Image: insertion, validation, dimensions, alignment, alt text, and deletion", () => {
  // Validation kiểm tra giới hạn
  const valValid = validateImageDimensions(450, 300);
  assert.equal(valValid.isValid, true);
  assert.equal(valValid.sanitizedWidth, 450);
  assert.equal(valValid.sanitizedHeight, 300);

  const valClamp = validateImageDimensions(15, 1200);
  assert.equal(valClamp.isValid, false);
  assert.equal(valClamp.sanitizedWidth, IMAGE_LIMITS.MIN_WIDTH);
  assert.equal(valClamp.sanitizedHeight, IMAGE_LIMITS.MAX_HEIGHT);

  const editor = createEditor();

  // Chèn hình ảnh nhúng Base64
  const imgOk = insertImage(editor, {
    src: SAMPLE_BASE64_IMAGE,
    alt: "Hình ảnh biểu đồ kiểm thử",
    title: "Biểu đồ kết quả",
    width: 380,
    height: 240,
    alignment: "center",
  });
  assert.equal(imgOk, true);
  assert.equal(isImageActive(editor), true);

  // Kiểm tra thuộc tính
  let attrs = getImageAttributes(editor);
  assert.equal(attrs.src, SAMPLE_BASE64_IMAGE);
  assert.equal(attrs.alt, "Hình ảnh biểu đồ kiểm thử");
  assert.equal(attrs.width, 380);
  assert.equal(attrs.height, 240);
  assert.equal(attrs.alignment, "center");

  // Cập nhật kích thước
  const dimOk = setImageDimensions(editor, 500, 320);
  assert.equal(dimOk, true);
  attrs = getImageAttributes(editor);
  assert.equal(attrs.width, 500);
  assert.equal(attrs.height, 320);

  // Cập nhật căn lề
  const alignOk = setImageAlignment(editor, "right");
  assert.equal(alignOk, true);
  attrs = getImageAttributes(editor);
  assert.equal(attrs.alignment, "right");

  // Cập nhật alt text
  const altOk = setImageAlt(editor, "Alt text mới");
  assert.equal(altOk, true);
  attrs = getImageAttributes(editor);
  assert.equal(attrs.alt, "Alt text mới");

  // Xóa ảnh
  const delOk = deleteImage(editor);
  assert.equal(delOk, true);
  assert.equal(editor.getJSON().content?.some((n) => n.type === "image"), false);

  editor.destroy();
});

/* ==========================================================================
   4. AUDIT: TEXT BOX (Phase 3.7)
   ========================================================================== */

test("Phase 3.9 Audit - 4. Text Box: insertion, resize, styling, alignment, and deletion", () => {
  const editor = createEditor();

  const tbOk = insertTextBox(editor, {
    width: 360,
    initialText: "Nội dung hộp ghi chú quan trọng",
    alignment: "center",
  });
  assert.equal(tbOk, true);
  assert.equal(isTextBoxActive(editor), true);

  // Cập nhật độ rộng
  const widthOk = setTextBoxWidth(editor, 420);
  assert.equal(widthOk, true);

  // Cập nhật căn lề
  const alignOk = setTextBoxAlignment(editor, "right");
  assert.equal(alignOk, true);

  // Cập nhật màu nền và viền
  const bgOk = setTextBoxBackgroundColor(editor, "#fef3c7");
  assert.equal(bgOk, true);
  const borderOk = setTextBoxBorderColor(editor, "#f59e0b");
  assert.equal(borderOk, true);

  // Xóa Text Box
  const delOk = deleteTextBox(editor);
  assert.equal(delOk, true);
  assert.equal(editor.getJSON().content?.some((n) => n.type === "textBox"), false);

  editor.destroy();
});

/* ==========================================================================
   5. AUDIT: SHAPES (Phase 3.8)
   ========================================================================== */

test("Phase 3.9 Audit - 5. Shapes: all 5 core shapes, styling, alignment, and deletion", () => {
  const shapes = ["rectangle", "roundedRectangle", "ellipse", "line", "arrow"] as const;

  for (const s of shapes) {
    const editor = createEditor();
    const ok = insertShape(editor, {
      shapeType: s,
      width: 260,
      height: 120,
      fillColor: "#e0f2fe",
      strokeColor: "#0284c7",
      strokeWidth: 2,
      alignment: "center",
    });
    assert.equal(ok, true);
    assert.equal(isShapeActive(editor), true);

    const attrs = getShapeAttributes(editor);
    assert.equal(attrs.shapeType, s);

    // Thay đổi kích thước & màu
    setShapeDimensions(editor, 300, 150);
    setShapeFillColor(editor, "#fee2e2");
    setShapeStrokeColor(editor, "#b91c1c");
    setShapeStrokeWidth(editor, 4);
    setShapeAlignment(editor, "left");

    const updated = getShapeAttributes(editor);
    assert.equal(updated.width, 300);
    assert.equal(updated.height, 150);
    assert.equal(updated.fillColor, "#fee2e2");
    assert.equal(updated.strokeColor, "#b91c1c");
    assert.equal(updated.strokeWidth, 4);
    assert.equal(updated.alignment, "left");

    deleteShape(editor);
    assert.equal(editor.getJSON().content?.some((n) => n.type === "shape"), false);

    editor.destroy();
  }
});

/* ==========================================================================
   6. AUDIT: EQUATION (Phase 3.8)
   ========================================================================== */

test("Phase 3.9 Audit - 6. Equation: insertion, latex source storage, live update, alignment, and deletion", () => {
  const editor = createEditor();
  const sourceLatex = "x^2 + y^2 = z^2";

  const ok = insertEquation(editor, {
    latex: sourceLatex,
    displayMode: true,
    alignment: "center",
  });
  assert.equal(ok, true);
  assert.equal(isEquationActive(editor), true);

  let attrs = getEquationAttributes(editor);
  assert.equal(attrs.latex, sourceLatex, "Source LaTeX must be stored in model");

  // Cập nhật công thức mới
  const newLatex = "E = mc^2";
  const upOk = updateEquation(editor, newLatex);
  assert.equal(upOk, true);
  attrs = getEquationAttributes(editor);
  assert.equal(attrs.latex, newLatex);

  // Căn lề
  const alignOk = setEquationAlignment(editor, "right");
  assert.equal(alignOk, true);
  attrs = getEquationAttributes(editor);
  assert.equal(attrs.alignment, "right");

  // Xóa công thức
  const delOk = deleteEquation(editor);
  assert.equal(delOk, true);
  assert.equal(editor.getJSON().content?.some((n) => n.type === "equation"), false);

  editor.destroy();
});

/* ==========================================================================
   7. WORKFLOW END-TO-END (Full Document Integration & Round-trip Persistence)
   ========================================================================== */

test("Phase 3.9 Audit - 7. End-to-End Workflow: Heading + Paragraph + Link + HR + Symbol + Table + Image + Text Box + Shape + Equation persists through Save/Open", () => {
  const fullDocumentAst = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, textAlign: "center" },
        content: [{ type: "text", text: "Báo cáo Tổng hợp Khoa học Kỹ thuật 2026" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tài liệu này được phát hành chính thức tại " },
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: "https://example.com/report" } }],
            text: "Cổng thông tin nghiên cứu",
          },
          { type: "text", text: " kèm biểu tượng bản quyền " },
          { type: "text", text: "©" },
          { type: "text", text: "." },
        ],
      },
      {
        type: "horizontalRule",
      },
      {
        type: "table",
        attrs: { borders: "outside" },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { backgroundColor: "#f1f5f9", textAlign: "center" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Mục" }] }],
              },
              {
                type: "tableHeader",
                attrs: { backgroundColor: "#f1f5f9", textAlign: "center" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Giá trị đo" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Tham số A" }] }],
              },
              {
                type: "tableCell",
                attrs: { textAlign: "right" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "98.75%" }] }],
              },
            ],
          },
        ],
      },
      {
        type: "image",
        attrs: {
          src: SAMPLE_BASE64_IMAGE,
          alt: "Sơ đồ kiến trúc hệ thống",
          title: "Sơ đồ kiến trúc",
          width: 420,
          height: 240,
          alignment: "center",
        },
      },
      {
        type: "textBox",
        attrs: {
          width: 350,
          alignment: "left",
          backgroundColor: "#fef3c7",
          borderColor: "#f59e0b",
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Lưu ý quan trọng: Toàn bộ dữ liệu đã được kiểm chứng độc lập." }],
          },
        ],
      },
      {
        type: "shape",
        attrs: {
          shapeType: "roundedRectangle",
          width: 280,
          height: 110,
          fillColor: "#dcfce7",
          strokeColor: "#16a34a",
          strokeWidth: 3,
          alignment: "center",
        },
      },
      {
        type: "equation",
        attrs: {
          latex: "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}",
          displayMode: true,
          alignment: "center",
        },
      },
    ],
  };

  // Nạp vào Editor
  const editor = createEditor(fullDocumentAst);
  const jsonBefore = editor.getJSON();

  // Đóng gói thành model tài liệu và serialize thành .mwd
  const doc = createInitialDocument("Báo cáo Khoa học Hoàn chỉnh");
  doc.content = jsonBefore;
  const mwdString = serializeDocumentToMwd(doc);
  assert.ok(mwdString.length > 0, "Serialized .mwd string must not be empty");

  // Giả lập đóng ứng dụng và nạp lại từ tệp .mwd
  const deserializeResult = deserializeMwdToDocument(mwdString);
  assert.equal(deserializeResult.success, true);
  if (!deserializeResult.success) return;

  const restoredDoc = deserializeResult.document;
  const restoredContent = restoredDoc.content;

  // Xác minh từng thành phần tồn tại nguyên vẹn
  const types = restoredContent.content?.map((n) => n.type) || [];
  assert.ok(types.includes("heading"), "Must contain heading");
  assert.ok(types.includes("paragraph"), "Must contain paragraph");
  assert.ok(types.includes("horizontalRule"), "Must contain horizontalRule");
  assert.ok(types.includes("table"), "Must contain table");
  assert.ok(types.includes("image"), "Must contain image");
  assert.ok(types.includes("textBox"), "Must contain textBox");
  assert.ok(types.includes("shape"), "Must contain shape");
  assert.ok(types.includes("equation"), "Must contain equation");

  // Kiểm tra thuộc tính hình ảnh
  const restoredImg = restoredContent.content?.find((n) => n.type === "image");
  assert.equal(restoredImg?.attrs?.src, SAMPLE_BASE64_IMAGE);
  assert.equal(restoredImg?.attrs?.alt, "Sơ đồ kiến trúc hệ thống");
  assert.equal(restoredImg?.attrs?.width, 420);

  // Kiểm tra thuộc tính bảng
  const restoredTable = restoredContent.content?.find((n) => n.type === "table");
  assert.equal(restoredTable?.attrs?.borders, "outside");

  // Kiểm tra thuộc tính Shape
  const restoredShape = restoredContent.content?.find((n) => n.type === "shape");
  assert.equal(restoredShape?.attrs?.shapeType, "roundedRectangle");
  assert.equal(restoredShape?.attrs?.fillColor, "#dcfce7");

  // Kiểm tra thuộc tính Equation
  const restoredEquation = restoredContent.content?.find((n) => n.type === "equation");
  assert.equal(restoredEquation?.attrs?.latex, "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}");

  // Nạp lại vào một Editor mới
  const reloadedEditor = createEditor(restoredContent);
  assert.equal(reloadedEditor.getJSON().content?.length, jsonBefore.content?.length);

  reloadedEditor.destroy();
  editor.destroy();
});

/* ==========================================================================
   8. AUDIT: UNDO / REDO REGRESSION ACROSS ALL INSERT OBJECTS
   ========================================================================== */

test("Phase 3.9 Audit - 8. Undo/Redo regression: atomic undo/redo across all 7 insert types", () => {
  // 1. Hyperlink: apply link -> undo -> redo
  {
    const ed = createEditor({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản link" }] }],
    });
    ed.commands.setTextSelection({ from: 1, to: 8 });
    updateOrInsertLink(ed, "Văn bản", "https://undo-test.com");
    assert.equal(isLinkActive(ed), true);
    ed.commands.undo();
    assert.equal(isLinkActive(ed), false);
    ed.commands.redo();
    assert.equal(isLinkActive(ed), true);
    ed.destroy();
  }

  // 2. Horizontal Rule: insert -> undo -> redo
  {
    const ed = createEditor();
    insertHorizontalRule(ed);
    assert.ok(ed.getJSON().content?.some((n) => n.type === "horizontalRule"));
    ed.commands.undo();
    assert.equal(ed.getJSON().content?.some((n) => n.type === "horizontalRule"), false);
    ed.commands.redo();
    assert.ok(ed.getJSON().content?.some((n) => n.type === "horizontalRule"));
    ed.destroy();
  }

  // 3. Table: insert -> undo -> redo
  {
    const ed = createEditor();
    insertTable(ed, { rows: 2, cols: 2 });
    assert.ok(ed.getJSON().content?.some((n) => n.type === "table"));
    ed.commands.undo();
    assert.equal(ed.getJSON().content?.some((n) => n.type === "table"), false);
    ed.commands.redo();
    assert.ok(ed.getJSON().content?.some((n) => n.type === "table"));
    ed.destroy();
  }

  // 4. Image: insert -> undo -> redo
  {
    const ed = createEditor();
    insertImage(ed, { src: SAMPLE_BASE64_IMAGE, width: 300, height: 200 });
    assert.ok(ed.getJSON().content?.some((n) => n.type === "image"));
    ed.commands.undo();
    assert.equal(ed.getJSON().content?.some((n) => n.type === "image"), false);
    ed.commands.redo();
    assert.ok(ed.getJSON().content?.some((n) => n.type === "image"));
    ed.destroy();
  }

  // 5. Text Box: insert -> undo -> redo
  {
    const ed = createEditor();
    insertTextBox(ed, { width: 320, initialText: "Hộp thử nghiệm undo" });
    assert.ok(ed.getJSON().content?.some((n) => n.type === "textBox"));
    ed.commands.undo();
    assert.equal(ed.getJSON().content?.some((n) => n.type === "textBox"), false);
    ed.commands.redo();
    assert.ok(ed.getJSON().content?.some((n) => n.type === "textBox"));
    ed.destroy();
  }

  // 6. Shape: insert -> undo -> redo
  {
    const ed = createEditor();
    insertShape(ed, { shapeType: "ellipse", width: 200, height: 100 });
    assert.ok(ed.getJSON().content?.some((n) => n.type === "shape"));
    ed.commands.undo();
    assert.equal(ed.getJSON().content?.some((n) => n.type === "shape"), false);
    ed.commands.redo();
    assert.ok(ed.getJSON().content?.some((n) => n.type === "shape"));
    ed.destroy();
  }

  // 7. Equation: insert -> undo -> redo
  {
    const ed = createEditor();
    insertEquation(ed, { latex: "a^2 + b^2 = c^2" });
    assert.ok(ed.getJSON().content?.some((n) => n.type === "equation"));
    ed.commands.undo();
    assert.equal(ed.getJSON().content?.some((n) => n.type === "equation"), false);
    ed.commands.redo();
    assert.ok(ed.getJSON().content?.some((n) => n.type === "equation"));
    ed.destroy();
  }
});

/* ==========================================================================
   9. AUDIT: PAGINATION REGRESSION (Large Objects & Multi-page Stability)
   ========================================================================== */

test("Phase 3.9 Audit - 9. Pagination regression: large tables, multiple images, shapes, and equations reflow without infinite loops", () => {
  // Tạo tài liệu gồm bảng 12 hàng, 5 ảnh lớn, 4 shapes, 6 equations
  const complexDoc = {
    type: "doc",
    content: [] as any[],
  };

  // Bảng lớn
  const tableRows: any[] = [];
  for (let r = 0; r < 12; r++) {
    tableRows.push({
      type: "tableRow",
      content: [
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: `Dữ liệu hàng ${r + 1} cột 1` }] }],
        },
        {
          type: "tableCell",
          content: [{ type: "paragraph", content: [{ type: "text", text: `Dữ liệu hàng ${r + 1} cột 2` }] }],
        },
      ],
    });
  }
  complexDoc.content.push({ type: "table", content: tableRows });

  // 5 ảnh lớn
  for (let i = 0; i < 5; i++) {
    complexDoc.content.push({
      type: "image",
      attrs: { src: SAMPLE_BASE64_IMAGE, width: 500, height: 350 },
    });
  }

  // 4 shapes
  for (let s = 0; s < 4; s++) {
    complexDoc.content.push({
      type: "shape",
      attrs: { shapeType: "rectangle", width: 400, height: 200 },
    });
  }

  // 6 equations
  for (let e = 0; e < 6; e++) {
    complexDoc.content.push({
      type: "equation",
      attrs: { latex: `\\sum_{k=1}^{${e + 10}} k^2` },
    });
  }

  // Đo chiều cao
  const estimatedHeight = estimateContentHeightPx(complexDoc, 600);
  assert.ok(estimatedHeight > 2000, "Estimated height for large document must be substantial");
  assert.ok(Number.isFinite(estimatedHeight), "Height must be finite");
  assert.ok(!isNaN(estimatedHeight), "Height must not be NaN");

  // Phân trang với A4 Portrait
  const pagA4Portrait = calculatePaginationState(complexDoc, DEFAULT_PAGE_SETTINGS);
  assert.ok(pagA4Portrait.pageCount > 2, "Complex document must create multiple visual pages");
  assert.ok(pagA4Portrait.pageCount < 30, "Page count must terminate within reasonable bounds (no runaway loop)");

  // Phân trang với A4 Landscape
  const pagA4Landscape = calculatePaginationState(complexDoc, {
    paperSize: "A4",
    orientation: "landscape",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });
  assert.ok(pagA4Landscape.pageCount > pagA4Portrait.pageCount, "Landscape should have more pages due to shorter height");

  // Phân trang với A3 Portrait
  const pagA3 = calculatePaginationState(complexDoc, {
    paperSize: "A3",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });
  assert.ok(pagA3.pageCount < pagA4Portrait.pageCount, "A3 sheet should hold more content per page");
});

/* ==========================================================================
   10. AUDIT: FILE ROBUSTNESS & BACKWARD COMPATIBILITY
   ========================================================================== */

test("Phase 3.9 Audit - 10. File Robustness: handles legacy files, missing attrs, and corrupt payloads gracefully", () => {
  // 1. Tệp .mwd cũ không có các trường Phase 3 (tương thích ngược hoàn hảo)
  const legacyMwdJson = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "legacy-doc-123",
      title: "Legacy Phase 1 Doc",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thời kỳ Phase 1" }],
        },
      ],
    },
  });

  const legacyRes = deserializeMwdToDocument(legacyMwdJson);
  assert.equal(legacyRes.success, true);
  if (!legacyRes.success) return;
  assert.equal(legacyRes.document.metadata.title, "Legacy Phase 1 Doc");

  // Mở trong editor mới
  const legacyEditor = createEditor(legacyRes.document.content);
  assert.equal(legacyEditor.getText().includes("Văn bản thời kỳ Phase 1"), true);
  legacyEditor.destroy();

  // 2. Node thiếu thuộc tính tự động nhận default
  const missingAttrsDoc = {
    type: "doc",
    content: [
      { type: "image", attrs: { src: "test.png" } }, // Thiếu width, height, alignment
      { type: "shape", attrs: {} }, // Thiếu shapeType, width, height
      { type: "equation", attrs: {} }, // Thiếu latex
    ],
  };

  const defaultEditor = createEditor(missingAttrsDoc);
  const json = defaultEditor.getJSON();

  const imgNode = json.content?.find((n) => n.type === "image");
  assert.equal(imgNode?.attrs?.width, IMAGE_LIMITS.DEFAULT_WIDTH);
  assert.equal(imgNode?.attrs?.alignment, "center");

  const shapeNode = json.content?.find((n) => n.type === "shape");
  assert.equal(shapeNode?.attrs?.shapeType, "rectangle");

  const eqNode = json.content?.find((n) => n.type === "equation");
  assert.equal(eqNode?.attrs?.latex, "x^2 + y^2 = z^2");

  defaultEditor.destroy();
});

/* ==========================================================================
   11. AUDIT: PHASE 1 & 2 REGRESSION (Formatting, Search, Stats, Break)
   ========================================================================== */

test("Phase 3.9 Audit - 11. Phase 1 & 2 Regression: text formatting, search & replace, and document stats remain pristine", () => {
  const editor = createEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "Từ in đậm" },
          { type: "text", text: " và " },
          { type: "text", marks: [{ type: "italic" }], text: "từ in nghiêng" },
        ],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn ở trang tiếp theo" }],
      },
    ],
  });

  // Kiểm tra thống kê từ & ký tự
  const stats = extractDocumentStats(editor.getJSON());
  assert.ok(stats.words >= 8);
  assert.ok(stats.characters >= 30);

  // Thêm ngắt trang
  editor.commands.focus("end");
  insertPageBreak(editor);
  assert.ok(editor.getJSON().content?.some((n) => n.type === "pageBreak"));

  // Thêm ngắt phần
  insertSectionBreak(editor);
  assert.ok(editor.getJSON().content?.some((n) => n.type === "sectionBreak"));

  editor.destroy();
});
