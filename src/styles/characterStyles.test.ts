import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  applyCharacterStyle,
  removeCharacterStyle,
  getCurrentCharacterStyleId,
} from "./services/characterStyleService.ts";
import {
  getEffectiveCharacterFormatting,
} from "./services/effectiveStyleService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_EMPHASIS_ID,
  STYLE_STRONG_ID,
  createBuiltInCharacterStyles,
  getAllBuiltInStyles,
  createDefaultStyleDefinitions,
} from "./services/builtInStyles.ts";
import {
  validateDocumentStyle,
  validateStyleCollection,
} from "./validation/styleValidator.ts";
import { resolveStyle } from "./services/styleResolver.ts";
import { generateDocumentStylesCss } from "./services/styleStylesheetService.ts";
import type { DocumentStyle } from "./types/styleTypes.ts";
import { undo, redo } from "../editor/editorCommands.ts";

function createTestEditor(initialContent: any): Editor {
  return new Editor({
    extensions: getEditorExtensions(),
    content: initialContent,
  });
}

/* ==========================================================================
   Phase 4 Targeted Tests - Character Styles Core
   ========================================================================== */

test("Phase 4 - 1. Create character style definition and validate", () => {
  // 1. Built-in character styles
  const builtIns = createBuiltInCharacterStyles();
  assert.equal(builtIns.length, 2);

  const emphasis = builtIns.find((s) => s.id === STYLE_EMPHASIS_ID);
  assert.ok(emphasis);
  assert.equal(emphasis.name, "Emphasis");
  assert.equal(emphasis.type, "character");
  assert.equal(emphasis.isBuiltIn, true);
  assert.equal(emphasis.character?.italic, true);

  const strong = builtIns.find((s) => s.id === STYLE_STRONG_ID);
  assert.ok(strong);
  assert.equal(strong.name, "Strong");
  assert.equal(strong.type, "character");
  assert.equal(strong.isBuiltIn, true);
  assert.equal(strong.character?.bold, true);

  const validEmphasis = validateDocumentStyle(emphasis);
  assert.equal(validEmphasis.isValid, true);
  assert.equal(validEmphasis.errors.length, 0);

  // 2. Custom character style
  const customCharStyle: DocumentStyle = {
    id: "style_custom_code",
    name: "Code Keyword",
    type: "character",
    basedOn: null,
    isBuiltIn: false,
    character: {
      fontFamily: "Courier New",
      fontSize: 10,
      color: "#2563eb",
      bold: true,
    },
  };

  const validCustom = validateDocumentStyle(customCharStyle);
  assert.equal(validCustom.isValid, true);
  assert.equal(validCustom.errors.length, 0);

  // 3. Collection validation
  const collection = [...createDefaultStyleDefinitions(), ...builtIns, customCharStyle];
  const colRes = validateStyleCollection(collection);
  assert.equal(colRes.isValid, true);
  assert.equal(colRes.errors.length, 0);
});

test("Phase 4 - 2. Apply character style to selection", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello world" }],
      },
    ],
  });

  // Chọn từ "world" (vị trí từ 7 đến 12)
  editor.commands.setTextSelection({ from: 7, to: 12 });
  const success = applyCharacterStyle(editor, STYLE_EMPHASIS_ID);
  assert.equal(success, true);

  const json = editor.getJSON();
  const para = json.content?.[0];
  assert.ok(para?.content);
  assert.equal(para.content.length, 2);

  // Node 1: "Hello "
  assert.equal(para.content[0].text, "Hello ");
  assert.equal(para.content[0].marks, undefined);

  // Node 2: "world"
  assert.equal(para.content[1].text, "world");
  assert.ok(para.content[1].marks);
  const charMark = para.content[1].marks.find((m: any) => m.type === "characterStyle");
  assert.ok(charMark);
  assert.equal(charMark.attrs?.styleId, STYLE_EMPHASIS_ID);

  // Kiểm tra getCurrentCharacterStyleId
  editor.commands.setTextSelection({ from: 8, to: 10 });
  assert.equal(getCurrentCharacterStyleId(editor), STYLE_EMPHASIS_ID);
});

test("Phase 4 - 3. Remove character style from selection", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello " },
          {
            type: "text",
            text: "styled",
            marks: [{ type: "characterStyle", attrs: { styleId: STYLE_EMPHASIS_ID } }],
          },
        ],
      },
    ],
  });

  // Chọn "styled"
  editor.commands.setTextSelection({ from: 7, to: 13 });
  assert.equal(getCurrentCharacterStyleId(editor), STYLE_EMPHASIS_ID);

  // Gỡ bỏ character style
  const success = removeCharacterStyle(editor);
  assert.equal(success, true);

  const json = editor.getJSON();
  const para = json.content?.[0];
  // Toàn bộ text không còn mark characterStyle
  const hasCharMark = para?.content?.some((node: any) =>
    node.marks?.some((m: any) => m.type === "characterStyle")
  );
  assert.equal(hasCharMark, false);

  assert.equal(getCurrentCharacterStyleId(editor), null);
});

test("Phase 4 - 4. Replace character style atomically", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "target",
            marks: [{ type: "characterStyle", attrs: { styleId: STYLE_EMPHASIS_ID } }],
          },
        ],
      },
    ],
  });

  // Chọn "target"
  editor.commands.setTextSelection({ from: 1, to: 7 });
  assert.equal(getCurrentCharacterStyleId(editor), STYLE_EMPHASIS_ID);

  // Thay thế bằng STYLE_STRONG_ID
  applyCharacterStyle(editor, STYLE_STRONG_ID);

  const json = editor.getJSON();
  const textNode = json.content?.[0]?.content?.[0];
  assert.ok(textNode?.marks);

  // Chỉ có đúng 1 mark characterStyle, không bị duplicate/lồng ghép
  const charMarks = textNode.marks.filter((m: any) => m.type === "characterStyle");
  assert.equal(charMarks.length, 1);
  assert.equal(charMarks[0].attrs?.styleId, STYLE_STRONG_ID);
  assert.equal(getCurrentCharacterStyleId(editor), STYLE_STRONG_ID);
});

test("Phase 4 - 5. Multi-level character style inheritance", () => {
  const definitions: DocumentStyle[] = [
    ...createDefaultStyleDefinitions(),
    {
      id: "char_base",
      name: "Code Base",
      type: "character",
      basedOn: null,
      isBuiltIn: false,
      character: {
        fontFamily: "Courier New",
        fontSize: 10,
        color: "#333333",
        bold: false,
        italic: false,
      },
    },
    {
      id: "char_keyword",
      name: "Code Keyword",
      type: "character",
      basedOn: "char_base",
      isBuiltIn: false,
      character: {
        bold: true,
        color: "#2563eb",
      },
    },
    {
      id: "char_keyword_special",
      name: "Special Keyword",
      type: "character",
      basedOn: "char_keyword",
      isBuiltIn: false,
      character: {
        underline: true,
      },
    },
  ];

  // Resolve cấp 3: Special Keyword
  const resolved = resolveStyle("char_keyword_special", definitions);
  assert.equal(resolved.id, "char_keyword_special");
  assert.equal(resolved.character.fontFamily, "Courier New"); // Từ char_base
  assert.equal(resolved.character.fontSize, 10); // Từ char_base
  assert.equal(resolved.character.bold, true); // Từ char_keyword
  assert.equal(resolved.character.color, "#2563eb"); // Từ char_keyword
  assert.equal(resolved.character.underline, true); // Từ char_keyword_special
  assert.equal(resolved.character.italic, false); // Từ char_base

  // Tính effective character formatting
  const effective = getEffectiveCharacterFormatting(
    [{ type: "characterStyle", attrs: { styleId: "char_keyword_special" } }],
    definitions,
    STYLE_NORMAL_ID
  );
  assert.equal(effective.characterStyleId, "char_keyword_special");
  assert.equal(effective.fontFamily, "Courier New");
  assert.equal(effective.fontSize, 10);
  assert.equal(effective.bold, true);
  assert.equal(effective.color, "#2563eb");
  assert.equal(effective.underline, true);
  assert.equal(effective.hasDirectOverrides, false);
});

test("Phase 4 - 6. Direct formatting precedence over character style", () => {
  const definitions: DocumentStyle[] = [
    ...createDefaultStyleDefinitions(),
    {
      id: "style_quote_char",
      name: "Quote Char",
      type: "character",
      basedOn: null,
      isBuiltIn: false,
      character: {
        fontFamily: "Georgia",
        fontSize: 12,
        color: "#1d4ed8",
        italic: true,
        bold: false,
      },
    },
  ];

  // Text mang style "style_quote_char", nhưng người dùng bấm Bold trực tiếp và đổi màu chữ đỏ "#dc2626"
  const marks = [
    { type: "characterStyle", attrs: { styleId: "style_quote_char" } },
    { type: "bold" },
    { type: "textStyle", attrs: { color: "#dc2626" } },
  ];

  const effective = getEffectiveCharacterFormatting(marks, definitions, STYLE_NORMAL_ID);

  assert.equal(effective.characterStyleId, "style_quote_char");
  assert.equal(effective.fontFamily, "Georgia"); // Kế thừa từ style
  assert.equal(effective.italic, true); // Kế thừa từ style
  assert.equal(effective.bold, true); // Direct formatting BOLD ghi đè!
  assert.equal(effective.color, "#dc2626"); // Direct formatting COLOR ghi đè!
  assert.equal(effective.hasDirectOverrides, true);
  assert.ok(effective.directOverrideFields.includes("bold"));
  assert.ok(effective.directOverrideFields.includes("color"));
});

test("Phase 4 - 7. Comment mark coexistence without data loss", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Commented text",
            marks: [{ type: "comment", attrs: { commentId: "comment_xyz_123" } }],
          },
        ],
      },
    ],
  });

  // Chọn toàn bộ text có comment
  editor.commands.setTextSelection({ from: 1, to: 15 });

  // Áp dụng Character Style
  applyCharacterStyle(editor, STYLE_EMPHASIS_ID);

  const json = editor.getJSON();
  const textNode = json.content?.[0]?.content?.[0];
  assert.ok(textNode?.marks);

  // Cả hai mark đều cùng tồn tại
  const commentMark = textNode.marks.find((m: any) => m.type === "comment");
  const charMark = textNode.marks.find((m: any) => m.type === "characterStyle");

  assert.ok(commentMark, "Comment mark must be preserved");
  assert.equal(commentMark.attrs?.commentId, "comment_xyz_123");
  assert.ok(charMark, "Character style mark must be applied");
  assert.equal(charMark.attrs?.styleId, STYLE_EMPHASIS_ID);
});

test("Phase 4 - 8. TrackChange mark coexistence and changeId preservation", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Tracked insert text",
            marks: [
              {
                type: "trackChange",
                attrs: {
                  id: "tc_change_888",
                  changeType: "insert",
                  author: "Hoang",
                  timestamp: "2026-10-07T00:00:00Z",
                },
              },
            ],
          },
        ],
      },
    ],
  });

  editor.commands.setTextSelection({ from: 1, to: 20 });
  applyCharacterStyle(editor, STYLE_STRONG_ID);

  const json = editor.getJSON();
  const textNode = json.content?.[0]?.content?.[0];
  assert.ok(textNode?.marks);

  // trackChange mark phải được bảo toàn nguyên vẹn
  const trackMark = textNode.marks.find((m: any) => m.type === "trackChange");
  const charMark = textNode.marks.find((m: any) => m.type === "characterStyle");

  assert.ok(trackMark, "trackChange mark must NOT be removed or flattened");
  assert.equal(trackMark.attrs?.id, "tc_change_888");
  assert.equal(trackMark.attrs?.changeType, "insert");
  assert.equal(trackMark.attrs?.author, "Hoang");

  assert.ok(charMark, "characterStyle mark must be applied alongside");
  assert.equal(charMark.attrs?.styleId, STYLE_STRONG_ID);
});

test("Phase 4 - 9. Hyperlink mark coexistence and URL preservation", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Google Search",
            marks: [{ type: "link", attrs: { href: "https://www.google.com" } }],
          },
        ],
      },
    ],
  });

  editor.commands.setTextSelection({ from: 1, to: 14 });
  applyCharacterStyle(editor, STYLE_EMPHASIS_ID);

  const json = editor.getJSON();
  const textNode = json.content?.[0]?.content?.[0];
  assert.ok(textNode?.marks);

  const linkMark = textNode.marks.find((m: any) => m.type === "link");
  const charMark = textNode.marks.find((m: any) => m.type === "characterStyle");

  assert.ok(linkMark, "Link mark must be preserved");
  assert.equal(linkMark.attrs?.href, "https://www.google.com");
  assert.ok(charMark, "characterStyle mark must be present");
});

test("Phase 4 - 10. Citation and Cross-Reference inline atom node safety", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "According to " },
          {
            type: "citation",
            attrs: {
              sourceId: "source_knuth_1984",
              style: "apa",
              prefix: "(see ",
              suffix: ")",
            },
          },
          { type: "text", text: ", literate programming is powerful." },
        ],
      },
    ],
  });

  // Chọn toàn bộ đoạn văn bao gồm cả citation node
  editor.commands.setTextSelection({ from: 1, to: 55 });
  applyCharacterStyle(editor, STYLE_EMPHASIS_ID);

  const json = editor.getJSON();
  const para = json.content?.[0];
  assert.ok(para?.content);

  // Citation node phải nguyên vẹn cấu trúc và attrs
  const citationNode = para.content.find((n: any) => n.type === "citation");
  assert.ok(citationNode, "Citation inline atom node must remain intact");
  assert.equal(citationNode.attrs?.sourceId, "source_knuth_1984");
  assert.equal(citationNode.attrs?.prefix, "(see ");
  assert.equal(citationNode.attrs?.suffix, ")");

  // Các text nodes xung quanh có characterStyle
  const textNodes = para.content.filter((n: any) => n.type === "text");
  assert.ok(textNodes.length >= 2);
  for (const tn of textNodes) {
    const hasCharStyle = tn.marks?.some((m: any) => m.type === "characterStyle");
    assert.equal(hasCharStyle, true);
  }
});

test("Phase 4 - 11. Partial text selection formatting isolation", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "The quick brown fox" }],
      },
    ],
  });

  // Chọn từ "brown" (từ pos 11 đến 16)
  editor.commands.setTextSelection({ from: 11, to: 16 });
  applyCharacterStyle(editor, STYLE_EMPHASIS_ID);

  const json = editor.getJSON();
  const para = json.content?.[0];
  assert.ok(para?.content);
  assert.equal(para.content.length, 3);

  // 1: "The quick "
  assert.equal(para.content[0].text, "The quick ");
  assert.equal(para.content[0].marks, undefined);

  // 2: "brown" -> có characterStyle
  assert.equal(para.content[1].text, "brown");
  const charMark = para.content[1].marks?.find((m: any) => m.type === "characterStyle");
  assert.ok(charMark);
  assert.equal(charMark.attrs?.styleId, STYLE_EMPHASIS_ID);

  // 3: " fox" -> không có characterStyle
  assert.equal(para.content[2].text, " fox");
  assert.equal(para.content[2].marks, undefined);
});

test("Phase 4 - 12. Empty selection (caret) fail-safe with storedMarks", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Prefix " }],
      },
    ],
  });

  // Đặt caret ở cuối văn bản (empty selection)
  editor.commands.setTextSelection(8);
  assert.equal(editor.state.selection.empty, true);

  // Áp dụng character style khi caret rỗng -> không crash!
  const success = applyCharacterStyle(editor, STYLE_STRONG_ID);
  assert.equal(success, true);

  // Phải được ghi nhận vào storedMarks
  assert.equal(getCurrentCharacterStyleId(editor), STYLE_STRONG_ID);

  // Gõ tiếp văn bản: văn bản mới phải mang style Strong (nhờ storedMarks)!
  const tr = editor.state.tr.insertText("bolded");
  editor.view.dispatch(tr);

  const json = editor.getJSON();
  const para = json.content?.[0];
  assert.ok(para?.content);
  const secondText = para.content.find((n: any) => n.text === "bolded");
  assert.ok(secondText);
  const charMark = secondText.marks?.find((m: any) => m.type === "characterStyle");
  assert.ok(charMark);
  assert.equal(charMark.attrs?.styleId, STYLE_STRONG_ID);
});

test("Phase 4 - 13. Save-model representation: styleId reference without duplicated formatting", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Standard document text" }],
      },
    ],
  });

  editor.commands.setTextSelection({ from: 10, to: 18 });
  applyCharacterStyle(editor, STYLE_EMPHASIS_ID);

  const json = editor.getJSON();
  const styledNode = json.content?.[0]?.content?.find((n: any) =>
    n.marks?.some((m: any) => m.type === "characterStyle")
  );
  assert.ok(styledNode);

  const mark = styledNode.marks.find((m: any) => m.type === "characterStyle");
  assert.ok(mark);

  // Mark chỉ chứa đúng thuộc tính styleId, KHÔNG copy cồng kềnh fontFamily, fontSize, italic...
  assert.deepEqual({ ...mark.attrs }, { styleId: STYLE_EMPHASIS_ID });
  assert.equal(mark.attrs.styleId, STYLE_EMPHASIS_ID);
  assert.equal(mark.attrs.fontFamily, undefined);
  assert.equal(mark.attrs.fontSize, undefined);
  assert.equal(mark.attrs.italic, undefined);
});

test("Phase 4 - 14. Undo and Redo Apply Character Style atomically", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Undo test paragraph" }],
      },
    ],
  });

  // Chọn và áp dụng style
  editor.commands.setTextSelection({ from: 1, to: 10 });
  applyCharacterStyle(editor, STYLE_EMPHASIS_ID);

  let json = editor.getJSON();
  let firstNode = json.content?.[0]?.content?.[0];
  assert.ok(firstNode?.marks?.some((m: any) => m.type === "characterStyle"));

  // Undo -> trở về không có characterStyle
  undo(editor);

  json = editor.getJSON();
  const hasCharMarkAfterUndo = json.content?.[0]?.content?.some((n: any) =>
    n.marks?.some((m: any) => m.type === "characterStyle")
  );
  assert.equal(hasCharMarkAfterUndo, false);

  // Redo -> khôi phục lại characterStyle
  redo(editor);

  json = editor.getJSON();
  firstNode = json.content?.[0]?.content?.[0];
  assert.ok(firstNode?.marks?.some((m: any) => m.type === "characterStyle"));
  const charMark = firstNode.marks.find((m: any) => m.type === "characterStyle");
  assert.equal(charMark.attrs?.styleId, STYLE_EMPHASIS_ID);
});

test("Phase 4 - 15. Dynamic stylesheet generation for character styles", () => {
  const definitions: DocumentStyle[] = [
    {
      id: STYLE_EMPHASIS_ID,
      name: "Emphasis",
      type: "character",
      basedOn: null,
      isBuiltIn: true,
      character: {
        italic: true,
      },
    },
    {
      id: "char_alert",
      name: "Alert Text",
      type: "character",
      basedOn: null,
      isBuiltIn: false,
      character: {
        fontFamily: "Arial",
        fontSize: 14,
        color: "#b91c1c",
        bold: true,
        highlight: "#fee2e2",
      },
    },
  ];

  const css = generateDocumentStylesCss(definitions);

  // Selector phải là .word-character-style-${styleId}
  assert.ok(css.includes(".word-character-style-style_emphasis"));
  assert.ok(css.includes("font-style: italic;"));

  assert.ok(css.includes(".word-character-style-char_alert"));
  assert.ok(css.includes("font-family: Arial;"));
  assert.ok(css.includes("font-size: 14pt;"));
  assert.ok(css.includes("color: #b91c1c;"));
  assert.ok(css.includes("font-weight: bold;"));
  assert.ok(css.includes("background-color: #fee2e2;"));
});
