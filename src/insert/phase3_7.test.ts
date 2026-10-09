import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  insertTextBox,
  deleteTextBox,
  setTextBoxWidth,
  setTextBoxAlignment,
  setTextBoxBackgroundColor,
  setTextBoxBorderColor,
  isTextBoxActive,
  validateTextBoxDimensions,
  TEXTBOX_LIMITS,
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

function createEditor(content?: any) {
  return new Editor({
    extensions: getEditorExtensions(),
    content: content || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn khởi tạo" }],
        },
      ],
    },
  });
}

test("Phase 3.7 - 1. Schema Extensions: textBox node exists in schema with block content and attributes", () => {
  const editor = createEditor();
  const schema = editor.schema;

  assert.ok(schema.nodes.textBox, "textBox node must exist in ProseMirror schema");
  assert.equal(schema.nodes.textBox.spec.group, "block", "textBox must belong to block group");
  assert.equal(schema.nodes.textBox.spec.isolating, true, "textBox must be isolating");

  // Thuộc tính
  assert.ok(schema.nodes.textBox.spec.attrs?.width, "Must have width attr");
  assert.ok(schema.nodes.textBox.spec.attrs?.minHeight, "Must have minHeight attr");
  assert.ok(schema.nodes.textBox.spec.attrs?.alignment, "Must have alignment attr");
  assert.ok(schema.nodes.textBox.spec.attrs?.backgroundColor, "Must have backgroundColor attr");
  assert.ok(schema.nodes.textBox.spec.attrs?.borderColor, "Must have borderColor attr");

  editor.destroy();
});

test("Phase 3.7 - 2. Validation: validateTextBoxDimensions enforces safe limits and sanitizes bounds", () => {
  // Hợp lệ
  const valid = validateTextBoxDimensions(360, 100);
  assert.equal(valid.isValid, true);
  assert.equal(valid.sanitizedWidth, 360);
  assert.equal(valid.sanitizedHeight, 100);

  // Mặc định
  const def = validateTextBoxDimensions();
  assert.equal(def.isValid, true);
  assert.equal(def.sanitizedWidth, TEXTBOX_LIMITS.DEFAULT_WIDTH);
  assert.equal(def.sanitizedHeight, TEXTBOX_LIMITS.DEFAULT_HEIGHT);

  // Dưới ngưỡng tối thiểu (< 120px hoặc < 40px)
  const tooSmall = validateTextBoxDimensions(80, 20);
  assert.equal(tooSmall.isValid, false);
  assert.equal(tooSmall.sanitizedWidth, TEXTBOX_LIMITS.MIN_WIDTH);
  assert.equal(tooSmall.sanitizedHeight, TEXTBOX_LIMITS.MIN_HEIGHT);

  // Vượt ngưỡng tối đa (> 800px hoặc > 600px)
  const tooLarge = validateTextBoxDimensions(1200, 900);
  assert.equal(tooLarge.isValid, false);
  assert.equal(tooLarge.sanitizedWidth, TEXTBOX_LIMITS.MAX_WIDTH);
  assert.equal(tooLarge.sanitizedHeight, TEXTBOX_LIMITS.MAX_HEIGHT);

  // NaN / không hợp lệ
  const nanVal = validateTextBoxDimensions(NaN, 100);
  assert.equal(nanVal.isValid, false);
});

test("Phase 3.7 - 3. Insert Text Box: inserts semantic node with inner paragraph and caret readiness", () => {
  const editor = createEditor();

  const success = insertTextBox(editor, {
    width: 350,
    initialText: "Nội dung hộp văn bản đầu tiên",
  });
  assert.equal(success, true);

  const json = editor.getJSON();
  const boxNode = json.content?.find((n) => n.type === "textBox");
  assert.ok(boxNode, "Document must contain textBox node");
  assert.equal(boxNode?.attrs?.width, 350);

  // Chứa 1 paragraph con bên trong
  const innerPara = boxNode?.content?.[0];
  assert.equal(innerPara?.type, "paragraph");
  assert.equal(innerPara?.content?.[0]?.text, "Nội dung hộp văn bản đầu tiên");

  editor.destroy();
});

test("Phase 3.7 - 4. Editing & Formatting inside Text Box: typing, bold text, and content stats", () => {
  const editor = createEditor();
  insertTextBox(editor, { width: 300, initialText: "Gốc" });

  // Nhập thêm văn bản vào hộp
  editor.view.dispatch(editor.state.tr.insertText(" và thêm chữ"));
  assert.ok(editor.getText().includes("thêm chữ"));

  // Đếm từ và ký tự bao gồm cả nội dung trong hộp văn bản
  const stats = extractDocumentStats(editor.getJSON());
  assert.ok(stats.words > 0, "Word count must include text box text");
  assert.ok(stats.characters > 0, "Char count must include text box text");

  editor.destroy();
});

test("Phase 3.7 - 5. Positioning & Alignment: left, center, right block positioning", () => {
  const editor = createEditor();
  insertTextBox(editor, { width: 300 });

  // Mặc định căn trái
  let boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.alignment, "left");

  // Đổi sang căn giữa
  setTextBoxAlignment(editor, "center");
  boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.alignment, "center");

  // Đổi sang căn phải
  setTextBoxAlignment(editor, "right");
  boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.alignment, "right");

  editor.destroy();
});

test("Phase 3.7 - 6. Resize: setTextBoxWidth updates width with validation boundaries", () => {
  const editor = createEditor();
  insertTextBox(editor, { width: 280 });

  // Thay đổi độ rộng hợp lệ
  setTextBoxWidth(editor, 450);
  let boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.width, 450);

  // Thay đổi độ rộng quá nhỏ -> tự động kẹp về MIN_WIDTH
  setTextBoxWidth(editor, 50);
  boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.width, TEXTBOX_LIMITS.MIN_WIDTH);

  // Thay đổi độ rộng quá lớn -> tự động kẹp về MAX_WIDTH
  setTextBoxWidth(editor, 1500);
  boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.width, TEXTBOX_LIMITS.MAX_WIDTH);

  editor.destroy();
});

test("Phase 3.7 - 7. Background & Border Color: customizable styling attributes", () => {
  const editor = createEditor();
  insertTextBox(editor);

  // Đổi màu nền
  setTextBoxBackgroundColor(editor, "#eff6ff");
  let boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.backgroundColor, "#eff6ff");

  // Đổi màu viền
  setTextBoxBorderColor(editor, "#3b82f6");
  boxAttrs = editor.getAttributes("textBox");
  assert.equal(boxAttrs.borderColor, "#3b82f6");

  editor.destroy();
});

test("Phase 3.7 - 8. Delete Text Box: removes the entire text box node cleanly", () => {
  const editor = createEditor();
  insertTextBox(editor, { width: 300 });
  assert.equal(isTextBoxActive(editor), true);

  const delOk = deleteTextBox(editor);
  assert.equal(delOk, true);
  assert.equal(isTextBoxActive(editor), false);

  const hasBox = editor.getJSON().content?.some((n) => n.type === "textBox");
  assert.equal(hasBox, false);

  editor.destroy();
});

test("Phase 3.7 - 9. Undo & Redo: full history support for text box insertion and mutation", () => {
  const editor = createEditor();

  insertTextBox(editor, { width: 320 });
  assert.equal(isTextBoxActive(editor), true);

  // Undo
  editor.commands.undo();
  assert.equal(isTextBoxActive(editor), false);
  const hasBoxAfterUndo = editor.getJSON().content?.some((n) => n.type === "textBox");
  assert.equal(hasBoxAfterUndo, false);

  // Redo
  editor.commands.redo();
  const hasBoxAfterRedo = editor.getJSON().content?.some((n) => n.type === "textBox");
  assert.equal(hasBoxAfterRedo, true);

  editor.destroy();
});

test("Phase 3.7 - 10. Regression with Paragraph, Heading, Table: coexists harmoniously in document", () => {
  const mixedDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Tiêu đề tài liệu" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn mở đầu trước hộp văn bản." }],
      },
      {
        type: "textBox",
        attrs: {
          width: 360,
          alignment: "center",
          backgroundColor: "#fef3c7",
          borderColor: "#f59e0b",
        },
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", marks: [{ type: "bold" }], text: "Lưu ý quan trọng: " },
              { type: "text", text: "Hộp ghi chú nổi bật." },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn tiếp nối sau hộp văn bản." }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Ô bảng 1" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Ô bảng 2" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = createEditor(mixedDoc);
  const json = editor.getJSON();
  const nodeTypes = json.content?.map((n) => n.type);
  assert.deepEqual(nodeTypes, ["heading", "paragraph", "textBox", "paragraph", "table"]);

  // Kiểm tra văn bản trích xuất
  const text = editor.getText();
  assert.ok(text.includes("Tiêu đề tài liệu"));
  assert.ok(text.includes("Lưu ý quan trọng"));
  assert.ok(text.includes("Ô bảng 1"));

  editor.destroy();
});

test("Phase 3.7 - 11. Persistence (.mwd): Save and Open round-trip preserves textBox, size, alignment, styling", () => {
  const docWithBox = {
    type: "doc",
    content: [
      {
        type: "textBox",
        attrs: {
          width: 420,
          minHeight: 120,
          alignment: "center",
          backgroundColor: "#eff6ff",
          borderColor: "#3b82f6",
        },
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", marks: [{ type: "bold" }], text: "Trích dẫn: " },
              { type: "text", text: "Nội dung hộp văn bản đã lưu" },
            ],
          },
        ],
      },
    ],
  };

  const doc = createInitialDocument("Hộp văn bản đã lưu", docWithBox);
  const serialized = serializeDocumentToMwd(doc);

  const restored = deserializeMwdToDocument(serialized);
  assert.equal(restored.success, true);
  assert.ok(restored.document);

  const newEditor = createEditor(restored.document.content);
  const restoredJson = newEditor.getJSON();

  const restoredBox = restoredJson.content?.find((n) => n.type === "textBox");
  assert.ok(restoredBox, "Restored document must contain textBox");
  assert.equal(restoredBox?.attrs?.width, 420);
  assert.equal(restoredBox?.attrs?.alignment, "center");
  assert.equal(restoredBox?.attrs?.backgroundColor, "#eff6ff");
  assert.equal(restoredBox?.attrs?.borderColor, "#3b82f6");

  const restoredText = newEditor.getText();
  assert.ok(restoredText.includes("Trích dẫn:"));
  assert.ok(restoredText.includes("Nội dung hộp văn bản đã lưu"));

  newEditor.destroy();
});

test("Phase 3.7 - 12. Pagination Safety: textBox integrates smoothly without loop or crash", () => {
  const docWithBoxes = {
    type: "doc",
    content: [
      {
        type: "textBox",
        attrs: { width: 400 },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hộp văn bản trang đầu tiên." }],
          },
        ],
      },
      {
        type: "textBox",
        attrs: { width: 500 },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hộp văn bản thứ hai với nội dung dài hơn một chút để tính chiều cao." }],
          },
        ],
      },
    ],
  };

  const height = estimateContentHeightPx(docWithBoxes);
  assert.ok(height > 150, "Estimated height must account for text boxes");

  const pagination = calculatePaginationState(docWithBoxes, {
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
  });

  assert.ok(pagination.pageCount >= 1);
  assert.equal(pagination.pages.length, pagination.pageCount);
});
