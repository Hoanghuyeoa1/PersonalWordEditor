import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  setTextAlign,
  isAlignActive,
  setLineSpacing,
  unsetLineSpacing,
  getCurrentLineSpacing,
  indent,
  outdent,
  getCurrentIndent,
  setHeading,
  setParagraph,
  isHeadingActive,
  toggleBulletList,
  toggleOrderedList,
  isListActive,
  toggleBold,
  setFontFamily,
  setTextColor,
  undo,
  redo,
  getDocumentJSON,
} from "./editorCommands.ts";
import { isValidDocumentModel, createInitialDocument } from "../document/documentModel.ts";

test("Paragraph: Text alignment (left, center, right, justify) updates document AST", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn kiểm tra canh lề" }],
        },
      ],
    },
  });

  editor.commands.selectAll();

  // Mặc định là left
  assert.equal(isAlignActive(editor, "left"), true);
  assert.equal(isAlignActive(editor, "center"), false);

  // Canh giữa
  setTextAlign(editor, "center");
  assert.equal(isAlignActive(editor, "center"), true);
  let json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.textAlign, "center");

  // Canh phải
  setTextAlign(editor, "right");
  assert.equal(isAlignActive(editor, "right"), true);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.textAlign, "right");

  // Canh đều
  setTextAlign(editor, "justify");
  assert.equal(isAlignActive(editor, "justify"), true);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.textAlign, "justify");

  // Canh trái lại
  setTextAlign(editor, "left");
  assert.equal(isAlignActive(editor, "left"), true);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.textAlign, "left");

  editor.destroy();
});

test("Paragraph: Line spacing presets (1.0, 1.15, 1.5, 2.0) are stored in node attributes", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Kiểm tra độ giãn dòng paragraph" }],
        },
      ],
    },
  });

  editor.commands.selectAll();

  // Mặc định trả về 1.15
  assert.equal(getCurrentLineSpacing(editor), "1.15");

  // Đặt 1.5
  setLineSpacing(editor, "1.5");
  assert.equal(getCurrentLineSpacing(editor), "1.5");
  let json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.lineSpacing, "1.5");

  // Đặt 2.0
  setLineSpacing(editor, "2.0");
  assert.equal(getCurrentLineSpacing(editor), "2.0");
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.lineSpacing, "2.0");

  // Đặt 1.0
  setLineSpacing(editor, "1.0");
  assert.equal(getCurrentLineSpacing(editor), "1.0");
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.lineSpacing, "1.0");

  // Unset khôi phục
  unsetLineSpacing(editor);
  assert.equal(getCurrentLineSpacing(editor), "1.15");

  editor.destroy();
});

test("Paragraph: Increase & Decrease Indent updates indent attribute on block nodes", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Kiểm tra thụt lề paragraph" }],
        },
      ],
    },
  });

  editor.commands.selectAll();
  assert.equal(getCurrentIndent(editor), 0);

  // Tăng thụt lề
  indent(editor);
  assert.equal(getCurrentIndent(editor), 1);
  let json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.indent, 1);

  indent(editor);
  assert.equal(getCurrentIndent(editor), 2);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.indent, 2);

  // Giảm thụt lề
  outdent(editor);
  assert.equal(getCurrentIndent(editor), 1);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.indent, 1);

  outdent(editor);
  assert.equal(getCurrentIndent(editor), 0);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.indent, 0);

  // Không giảm xuống âm
  outdent(editor);
  assert.equal(getCurrentIndent(editor), 0);

  editor.destroy();
});

test("Lists: Bullet and Numbered lists use true ProseMirror tree structure", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Mục danh sách 1" }],
        },
      ],
    },
  });

  editor.commands.selectAll();

  // Bật Bullet List
  toggleBulletList(editor);
  assert.equal(isListActive(editor, "bulletList"), true);
  let json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.type, "bulletList");
  assert.equal(json?.content?.[0]?.content?.[0]?.type, "listItem");

  // Chuyển sang Ordered List
  toggleOrderedList(editor);
  assert.equal(isListActive(editor, "orderedList"), true);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.type, "orderedList");
  assert.equal(json?.content?.[0]?.content?.[0]?.type, "listItem");

  // Tắt danh sách trở về paragraph
  toggleOrderedList(editor);
  assert.equal(isListActive(editor, "orderedList"), false);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.type, "paragraph");

  editor.destroy();
});

test("Lists: Nested list hierarchy is created via ProseMirror sink/lift", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục cấp 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục cấp 2 sắp lồng" }],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  // Đặt con trỏ vào mục thứ hai (pos = 16)
  editor.commands.setTextSelection(16);

  // Thụt lề: lồng cấp danh sách thành bulletList bên trong listItem thứ nhất
  indent(editor);
  let json = getDocumentJSON(editor);
  const firstItemContent = json?.content?.[0]?.content?.[0]?.content;
  // Cấu trúc lồng cấp phải có 1 paragraph và 1 bulletList con
  assert.equal(firstItemContent?.[0]?.type, "paragraph");
  assert.equal(firstItemContent?.[1]?.type, "bulletList");
  const nestedItem = firstItemContent?.[1]?.content?.[0];
  assert.equal(nestedItem?.type, "listItem");
  assert.equal(nestedItem?.content?.[0]?.content?.[0]?.text, "Mục cấp 2 sắp lồng");

  // Giảm thụt lề: nhấc mục lồng cấp trở lại cấp 1
  outdent(editor);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.content?.length, 2);
  assert.equal(json?.content?.[0]?.content?.[0]?.type, "listItem");
  assert.equal(json?.content?.[0]?.content?.[1]?.type, "listItem");

  editor.destroy();
});

test("Styles: Semantic heading nodes level 1, 2, 3 and Normal paragraph", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Tiêu đề tài liệu" }],
        },
      ],
    },
  });

  editor.commands.selectAll();

  // Đặt Heading 1
  setHeading(editor, 1);
  assert.equal(isHeadingActive(editor, 1), true);
  assert.equal(isHeadingActive(editor, 2), false);
  let json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.type, "heading");
  assert.equal(json?.content?.[0]?.attrs?.level, 1);

  // Đặt Heading 2
  setHeading(editor, 2);
  assert.equal(isHeadingActive(editor, 2), true);
  assert.equal(isHeadingActive(editor, 1), false);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.level, 2);

  // Đặt Heading 3
  setHeading(editor, 3);
  assert.equal(isHeadingActive(editor, 3), true);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.attrs?.level, 3);

  // Chuyển lại Normal paragraph
  setParagraph(editor);
  assert.equal(isHeadingActive(editor), false);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.[0]?.type, "paragraph");

  editor.destroy();
});

test("Regression: Phase 1.4 formatting is preserved alongside Paragraph alignment & styles", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản định dạng kết hợp" }],
        },
      ],
    },
  });

  editor.commands.selectAll();

  // Định dạng ký tự từ Phase 1.4
  toggleBold(editor);
  setFontFamily(editor, "Georgia");
  setTextColor(editor, "#dc2626");

  // Áp dụng tính năng Paragraph từ Phase 1.5
  setHeading(editor, 2);
  setTextAlign(editor, "center");
  setLineSpacing(editor, "1.5");

  const json = getDocumentJSON(editor);
  assert.ok(json);

  // Kiểm tra node Heading 2
  const blockNode = json.content?.[0];
  assert.equal(blockNode?.type, "heading");
  assert.equal(blockNode?.attrs?.level, 2);
  assert.equal(blockNode?.attrs?.textAlign, "center");
  assert.equal(blockNode?.attrs?.lineSpacing, "1.5");

  // Kiểm tra text marks từ Phase 1.4 còn nguyên vẹn
  const textNode = blockNode?.content?.[0];
  const marks = textNode?.marks || [];
  assert.ok(marks.some((m) => m.type === "bold"));
  assert.ok(marks.some((m) => m.type === "textStyle" && m.attrs?.fontFamily === "Georgia"));
  assert.ok(marks.some((m) => m.type === "textStyle" && m.attrs?.color === "#dc2626"));

  // Đảm bảo document model hợp lệ
  assert.equal(
    isValidDocumentModel(createInitialDocument("Test", json)),
    true
  );

  editor.destroy();
});

test("Paragraph: Undo and Redo execute safely on paragraph formatting", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Kiểm tra Undo/Redo paragraph" }],
        },
      ],
    },
  });

  editor.commands.selectAll();
  setTextAlign(editor, "center");
  assert.equal(isAlignActive(editor, "center"), true);

  assert.doesNotThrow(() => undo(editor));
  assert.doesNotThrow(() => redo(editor));

  editor.destroy();
});
