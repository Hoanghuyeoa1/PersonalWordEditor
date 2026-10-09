import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  setFontFamily,
  unsetFontFamily,
  setFontSize,
  unsetFontSize,
  setTextColor,
  unsetTextColor,
  setTextHighlight,
  unsetTextHighlight,
  toggleTextHighlight,
  validateFontSize,
  isMarkActive,
  getCurrentFontFamily,
  getCurrentFontSize,
  getCurrentTextColor,
  getCurrentHighlight,
  getDocumentJSON,
} from "./editorCommands.ts";
import { isValidDocumentModel, createInitialDocument } from "../document/documentModel.ts";

test("Text Formatting: validateFontSize properly sanitizes inputs", () => {
  assert.equal(validateFontSize(12), 12);
  assert.equal(validateFontSize("16"), 16);
  assert.equal(validateFontSize("24pt"), 24);
  assert.equal(validateFontSize("32px"), 32);

  // Invalid values
  assert.equal(validateFontSize(NaN), null);
  assert.equal(validateFontSize(-5), null);
  assert.equal(validateFontSize(0), null);
  assert.equal(validateFontSize(2), null); // below min 4
  assert.equal(validateFontSize(500), null); // above max 144
  assert.equal(validateFontSize("abc"), null);
  assert.equal(validateFontSize(null), null);
  assert.equal(validateFontSize(undefined), null);
});

test("Text Formatting: supports Underline mark and query", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản gạch chân" }] }],
    },
  });

  editor.commands.selectAll();
  assert.equal(isMarkActive(editor, "underline"), false);

  toggleUnderline(editor);
  assert.equal(isMarkActive(editor, "underline"), true);

  const json = getDocumentJSON(editor);
  assert.ok(json);
  const textNode = json.content?.[0]?.content?.[0];
  assert.ok(textNode?.marks?.some((m) => m.type === "underline"));

  toggleUnderline(editor);
  assert.equal(isMarkActive(editor, "underline"), false);

  editor.destroy();
});

test("Text Formatting: sets and unsets font family with fallback", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Thử nghiệm phông chữ" }] }],
    },
  });

  editor.commands.selectAll();
  assert.equal(getCurrentFontFamily(editor), null);

  const arialFallback = "Arial, Helvetica, sans-serif";
  setFontFamily(editor, arialFallback);
  assert.equal(getCurrentFontFamily(editor), arialFallback);

  unsetFontFamily(editor);
  assert.equal(getCurrentFontFamily(editor), null);

  editor.destroy();
});

test("Text Formatting: sets and validates font size, rejects invalid sizes", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Thử nghiệm cỡ chữ" }] }],
    },
  });

  editor.commands.selectAll();

  // Valid size preset
  const success18 = setFontSize(editor, 18);
  assert.equal(success18, true);
  assert.equal(getCurrentFontSize(editor), 18);

  // Valid string input
  const success24 = setFontSize(editor, "24");
  assert.equal(success24, true);
  assert.equal(getCurrentFontSize(editor), 24);

  // Invalid inputs should return false and not change existing size
  const failNegative = setFontSize(editor, -10);
  assert.equal(failNegative, false);
  assert.equal(getCurrentFontSize(editor), 24);

  const failHuge = setFontSize(editor, 9999);
  assert.equal(failHuge, false);
  assert.equal(getCurrentFontSize(editor), 24);

  unsetFontSize(editor);
  assert.equal(getCurrentFontSize(editor), null);

  editor.destroy();
});

test("Text Formatting: sets and unsets text color", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Thử nghiệm màu chữ" }] }],
    },
  });

  editor.commands.selectAll();
  assert.equal(getCurrentTextColor(editor), null);

  setTextColor(editor, "#dc2626");
  assert.equal(getCurrentTextColor(editor), "#dc2626");

  unsetTextColor(editor);
  assert.equal(getCurrentTextColor(editor), null);

  editor.destroy();
});

test("Text Formatting: sets, toggles and unsets highlight color", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Thử nghiệm highlight" }] }],
    },
  });

  editor.commands.selectAll();
  assert.equal(getCurrentHighlight(editor), null);

  setTextHighlight(editor, "#fef08a");
  assert.equal(getCurrentHighlight(editor), "#fef08a");

  toggleTextHighlight(editor, "#fef08a");
  assert.equal(getCurrentHighlight(editor), null);

  setTextHighlight(editor, "#a5f3fc");
  assert.equal(getCurrentHighlight(editor), "#a5f3fc");

  unsetTextHighlight(editor);
  assert.equal(getCurrentHighlight(editor), null);

  editor.destroy();
});

test("Text Formatting: handles mixed formatting selection without corrupting existing marks", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Bold part " },
            { type: "text", marks: [{ type: "italic" }], text: "Italic part " },
            { type: "text", text: "Plain part" },
          ],
        },
      ],
    },
  });

  // Select all text
  editor.commands.selectAll();

  // Apply font family and font size across entire selection
  setFontFamily(editor, "Georgia, serif");
  setFontSize(editor, 14);
  setTextColor(editor, "#2563eb");

  const json = getDocumentJSON(editor);
  assert.ok(json);
  const nodes = json.content?.[0]?.content || [];
  assert.equal(nodes.length, 3);

  // Check node 0: retains bold, gained textStyle
  assert.ok(nodes[0].marks?.some((m) => m.type === "bold"));
  assert.ok(nodes[0].marks?.some((m) => m.type === "textStyle" && m.attrs?.fontFamily === "Georgia, serif"));

  // Check node 1: retains italic, gained textStyle
  assert.ok(nodes[1].marks?.some((m) => m.type === "italic"));
  assert.ok(nodes[1].marks?.some((m) => m.type === "textStyle" && m.attrs?.fontSize === "14pt"));

  // Check document model validity
  const docModel = createInitialDocument("Mixed Formatting Doc", json);
  assert.equal(isValidDocumentModel(docModel), true);

  editor.destroy();
});

test("Text Formatting: repeated formatting changes preserve valid JSON schema", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Chu trình đổi định dạng" }] }],
    },
  });

  editor.commands.selectAll();

  for (let i = 0; i < 5; i++) {
    toggleBold(editor);
    toggleItalic(editor);
    toggleUnderline(editor);
    toggleStrike(editor);
    setFontSize(editor, 10 + i * 2);
    setTextColor(editor, i % 2 === 0 ? "#dc2626" : "#2563eb");
    setTextHighlight(editor, i % 2 === 0 ? "#fef08a" : "#bbf7d0");
  }

  const json = getDocumentJSON(editor);
  assert.ok(json);
  const docModel = createInitialDocument("Repeated formatting", json);
  assert.equal(isValidDocumentModel(docModel), true);

  editor.destroy();
});
