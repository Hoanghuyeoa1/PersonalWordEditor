import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  toggleBold,
  toggleItalic,
  toggleStrike,
  setHeading,
  setParagraph,
  toggleBulletList,
  toggleOrderedList,
  undo,
  redo,
  canUndo,
  canRedo,
  isHeadingActive,
  isMarkActive,
  isListActive,
  getDocumentJSON,
} from "./editorCommands.ts";
import { createDefaultDocumentContent } from "../document/documentModel.ts";

test("Editor Core: initializes headless Tiptap editor with extensions and default content", () => {
  const initialContent = createDefaultDocumentContent();
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent,
  });

  assert.ok(editor);
  const json = getDocumentJSON(editor);
  assert.ok(json);
  assert.equal(json.type, "doc");
  assert.ok(Array.isArray(json.content));

  editor.destroy();
});

test("Editor Core: supports Heading 1, 2, and 3", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Tiêu đề mẫu" }] }],
    },
  });

  // Focus and select all
  editor.commands.selectAll();

  // Test Heading 1
  setHeading(editor, 1);
  assert.equal(isHeadingActive(editor, 1), true);

  // Test Heading 2
  setHeading(editor, 2);
  assert.equal(isHeadingActive(editor, 2), true);
  assert.equal(isHeadingActive(editor, 1), false);

  // Test Heading 3
  setHeading(editor, 3);
  assert.equal(isHeadingActive(editor, 3), true);
  assert.equal(isHeadingActive(editor, 2), false);

  // Revert to Paragraph
  setParagraph(editor);
  assert.equal(isHeadingActive(editor), false);
  assert.equal(editor.isActive("paragraph"), true);

  editor.destroy();
});

test("Editor Core: supports Bold, Italic, Strike marks", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản định dạng" }] }],
    },
  });

  editor.commands.selectAll();

  // Bold
  toggleBold(editor);
  assert.equal(isMarkActive(editor, "bold"), true);

  // Italic
  toggleItalic(editor);
  assert.equal(isMarkActive(editor, "italic"), true);

  // Strike
  toggleStrike(editor);
  assert.equal(isMarkActive(editor, "strike"), true);

  const json = getDocumentJSON(editor);
  assert.ok(json);
  const textNode = json.content?.[0]?.content?.[0];
  assert.ok(textNode?.marks && textNode.marks.length >= 3);

  editor.destroy();
});

test("Editor Core: supports BulletList and OrderedList", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Mục danh sách" }] }],
    },
  });

  editor.commands.selectAll();

  // Bullet list
  toggleBulletList(editor);
  assert.equal(isListActive(editor, "bulletList"), true);

  // Ordered list
  toggleOrderedList(editor);
  assert.equal(isListActive(editor, "orderedList"), true);
  assert.equal(isListActive(editor, "bulletList"), false);

  editor.destroy();
});

test("Editor Core: supports Undo and Redo without crashing", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản gốc" }] }],
    },
  });

  // Kiểm tra lệnh undo/redo không crash khi gọi trên editor
  assert.doesNotThrow(() => undo(editor));
  assert.doesNotThrow(() => redo(editor));

  // Kiểm tra an toàn khi editor là null
  assert.equal(undo(null), false);
  assert.equal(redo(null), false);
  assert.equal(canUndo(null), false);
  assert.equal(canRedo(null), false);

  editor.destroy();
});


