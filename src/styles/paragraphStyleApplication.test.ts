import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  applyParagraphStyle,
  setParagraphSpacing,
  setParagraphIndents,
  clearDirectParagraphFormatting,
} from "./services/applyStyleService.ts";
import {
  getEffectiveParagraphFormatting,
  getDefaultStyleIdForNode,
} from "./services/effectiveStyleService.ts";
import {
  generateDocumentStylesCss,
  updateDocumentStylesStylesheet,
} from "./services/styleStylesheetService.ts";
import {
  validateAndClampSpacing,
  validateAndClampIndent,
  normalizeFirstLineAndHanging,
  ptToCm,
  cmToPt,
} from "./utils/unitConversion.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  createDefaultStyleDefinitions,
} from "./services/builtInStyles.ts";
import type { DocumentStyle } from "./types/styleTypes.ts";
import { undo, redo } from "../editor/editorCommands.ts";

function createTestEditor(initialContent: any): Editor {
  return new Editor({
    extensions: getEditorExtensions(),
    content: initialContent,
  });
}

test("Phase 3 - 1. Apply style to single paragraph at caret", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra áp dụng style." }],
      },
    ],
  });

  // Đặt con trỏ tại vị trí 5
  editor.commands.setTextSelection(5);

  const applied = applyParagraphStyle(editor, "style_custom_lead");
  assert.equal(applied, true);

  const json = editor.getJSON();
  const p = json.content?.[0];
  assert.equal(p?.type, "paragraph");
  assert.equal(p?.attrs?.styleId, "style_custom_lead");
});

test("Phase 3 - 2. Apply Heading style retains semantic heading level", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn sẽ chuyển thành Heading 1" }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Tiêu đề cấp 2 sẽ áp dụng custom style" }],
      },
    ],
  });

  // 2.1 Áp dụng Heading 1 vào paragraph: chuyển thành node heading level=1
  editor.commands.setTextSelection(5);
  applyParagraphStyle(editor, STYLE_HEADING_1_ID);

  let json = editor.getJSON();
  assert.equal(json.content?.[0].type, "heading");
  assert.equal(json.content?.[0].attrs?.level, 1);
  assert.equal(json.content?.[0].attrs?.styleId, STYLE_HEADING_1_ID);

  // 2.2 Áp dụng custom paragraph style vào heading level 2: GIỮ NGUYÊN type=heading và level=2!
  const h2Pos = json.content?.[0].content?.[0].text!.length + 5;
  editor.commands.setTextSelection(h2Pos);
  applyParagraphStyle(editor, "style_academic_heading");

  json = editor.getJSON();
  assert.equal(json.content?.[1].type, "heading");
  assert.equal(json.content?.[1].attrs?.level, 2);
  assert.equal(json.content?.[1].attrs?.styleId, "style_academic_heading");
});

test("Phase 3 - 3. Multi-paragraph selection updates all selected blocks atomically", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 1" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 2" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 3 ngoài vùng chọn" }],
      },
    ],
  });

  // Chọn từ đoạn 1 sang đoạn 2 (pos 1 đến 12)
  editor.commands.setTextSelection({ from: 1, to: 12 });

  applyParagraphStyle(editor, "style_body");

  const json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.styleId, "style_body");
  assert.equal(json.content?.[1].attrs?.styleId, "style_body");
  assert.equal(json.content?.[2].attrs?.styleId, null);
});

test("Phase 3 - 4. Selection across paragraph + heading preserves respective node types", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn mở đầu" }],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Tiêu đề con cấp 3" }],
      },
    ],
  });

  editor.commands.selectAll();
  applyParagraphStyle(editor, "style_custom_section");

  const json = editor.getJSON();
  // Paragraph vẫn là paragraph
  assert.equal(json.content?.[0].type, "paragraph");
  assert.equal(json.content?.[0].attrs?.styleId, "style_custom_section");

  // Heading vẫn là heading level 3
  assert.equal(json.content?.[1].type, "heading");
  assert.equal(json.content?.[1].attrs?.level, 3);
  assert.equal(json.content?.[1].attrs?.styleId, "style_custom_section");
});

test("Phase 3 - 5. Apply style inside list targets inner textblock without breaking list schema", () => {
  const editor = createTestEditor({
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
                content: [{ type: "text", text: "Mục danh sách 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Mục danh sách 2" }],
              },
            ],
          },
        ],
      },
    ],
  });

  // Đặt con trỏ trong mục 1
  editor.commands.setTextSelection(4);
  applyParagraphStyle(editor, "style_list_item_custom");

  const json = editor.getJSON();
  // Cấu trúc danh sách hoàn toàn nguyên vẹn
  assert.equal(json.content?.[0].type, "bulletList");
  assert.equal(json.content?.[0].content?.[0].type, "listItem");
  assert.equal(json.content?.[0].content?.[1].type, "listItem");

  // Chỉ có paragraph bên trong listItem 1 nhận styleId
  const innerP = json.content?.[0].content?.[0].content?.[0];
  assert.equal(innerP?.type, "paragraph");
  assert.equal(innerP?.attrs?.styleId, "style_list_item_custom");

  // ListItem 2 không bị ảnh hưởng
  const innerP2 = json.content?.[0].content?.[1].content?.[0];
  assert.equal(innerP2?.attrs?.styleId, null);
});

test("Phase 3 - 6. Apply style inside table targets inner textblock without breaking table schema", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Ô bảng 1" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  editor.commands.setTextSelection(5);
  applyParagraphStyle(editor, "style_table_text");

  const json = editor.getJSON();
  // Cấu trúc bảng nguyên vẹn
  assert.equal(json.content?.[0].type, "table");
  assert.equal(json.content?.[0].content?.[0].type, "tableRow");
  assert.equal(json.content?.[0].content?.[0].content?.[0].type, "tableCell");

  // Paragraph trong ô nhận styleId
  const cellP = json.content?.[0].content?.[0].content?.[0].content?.[0];
  assert.equal(cellP?.attrs?.styleId, "style_table_text");
});

test("Phase 3 - 7. Style reference stored instead of copied formatting definitions", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản tham chiếu style." }],
      },
    ],
  });

  editor.commands.selectAll();
  applyParagraphStyle(editor, "style_heavy_definition");

  const json = editor.getJSON();
  const p = json.content?.[0];

  // Chỉ chứa styleId, KHÔNG copy fontFamily, fontSize, color, bold vào attributes của node
  assert.equal(p?.attrs?.styleId, "style_heavy_definition");
  assert.equal(p?.attrs?.fontFamily, undefined);
  assert.equal(p?.attrs?.fontSize, undefined);
  assert.equal(p?.attrs?.color, undefined);
});

test("Phase 3 - 8. Definition update automatically reflects across all referencing blocks", () => {
  const defs: DocumentStyle[] = [
    ...createDefaultStyleDefinitions(),
    {
      id: "style_shared",
      name: "Shared Body",
      type: "paragraph",
      basedOn: STYLE_NORMAL_ID,
      isBuiltIn: false,
      paragraph: { lineSpacing: "1.5" },
      character: { fontSize: 12 },
    },
  ];

  const node1 = {
    type: "paragraph",
    attrs: { styleId: "style_shared" },
  };
  const node2 = {
    type: "paragraph",
    attrs: { styleId: "style_shared" },
  };

  // Ban đầu: cả 2 node đều resolve ra fontSize: 12, lineSpacing: 1.5
  const eff1 = getEffectiveParagraphFormatting(node1, defs);
  const eff2 = getEffectiveParagraphFormatting(node2, defs);
  assert.equal(eff1.fontSize, 12);
  assert.equal(eff1.lineSpacing, "1.5");
  assert.equal(eff2.fontSize, 12);

  // Cập nhật definition mà KHÔNG sửa node AST
  const updatedDefs = defs.map((s) =>
    s.id === "style_shared"
      ? {
          ...s,
          paragraph: { lineSpacing: "2.0" },
          character: { fontSize: 14 },
        }
      : s
  );

  const updatedEff1 = getEffectiveParagraphFormatting(node1, updatedDefs);
  const updatedEff2 = getEffectiveParagraphFormatting(node2, updatedDefs);

  // Cả 2 block đều tự động cập nhật
  assert.equal(updatedEff1.fontSize, 14);
  assert.equal(updatedEff1.lineSpacing, "2.0");
  assert.equal(updatedEff2.fontSize, 14);
  assert.equal(updatedEff2.lineSpacing, "2.0");

  // Kiểm tra chuỗi CSS động được sinh ra
  const css = generateDocumentStylesCss(updatedDefs);
  assert.ok(css.includes(".word-style-style_shared"));
  assert.ok(css.includes("line-height: 2.0;"));
  assert.ok(css.includes("font-size: 14pt;"));
});

test("Phase 3 - 9. Direct formatting precedence over style definition", () => {
  const defs: DocumentStyle[] = [
    ...createDefaultStyleDefinitions(),
    {
      id: "style_precedence_test",
      name: "Test Style",
      type: "paragraph",
      basedOn: STYLE_NORMAL_ID,
      isBuiltIn: false,
      paragraph: {
        textAlign: "justify",
        lineSpacing: "1.5",
        spacingBefore: 10,
      },
    },
  ];

  // Node có styleId nhưng đồng thời có direct override lineSpacing = "2.0"
  const node = {
    type: "paragraph",
    attrs: {
      styleId: "style_precedence_test",
      lineSpacing: "2.0", // Direct override!
    },
  };

  const effective = getEffectiveParagraphFormatting(node, defs);

  // textAlign kế thừa từ style
  assert.equal(effective.textAlign, "justify");
  // spacingBefore kế thừa từ style
  assert.equal(effective.spacingBefore, 10);
  // lineSpacing từ direct override PHẢI THẮNG style!
  assert.equal(effective.lineSpacing, "2.0");
  assert.equal(effective.hasDirectOverrides, true);
  assert.deepEqual(effective.directOverrideFields, ["lineSpacing"]);
});

test("Phase 3 - 10. Paragraph Spacing before and after commands", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra spacing" }],
      },
    ],
  });

  editor.commands.selectAll();

  // Đặt spacingBefore = 18, spacingAfter = 12
  const success = setParagraphSpacing(editor, { spacingBefore: 18, spacingAfter: 12 });
  assert.equal(success, true);

  const json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.spacingBefore, 18);
  assert.equal(json.content?.[0].attrs?.spacingAfter, 12);
});

test("Phase 3 - 11. Indentation: Left and Right indent commands", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra thụt lề" }],
      },
    ],
  });

  editor.commands.selectAll();
  setParagraphIndents(editor, { leftIndent: 36, rightIndent: 18 });

  const json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.leftIndent, 36);
  assert.equal(json.content?.[0].attrs?.rightIndent, 18);
});

test("Phase 3 - 12. Indentation: First-line and Hanging indent mutual exclusion", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra first-line và hanging" }],
      },
    ],
  });

  editor.commands.selectAll();

  // 12.1 First line indent
  setParagraphIndents(editor, { firstLineIndent: 20 });
  let json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.firstLineIndent, 20);
  assert.equal(json.content?.[0].attrs?.hangingIndent, null);

  // 12.2 Hanging indent ghi đè first line
  setParagraphIndents(editor, { hangingIndent: 28 });
  json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.firstLineIndent, null);
  assert.equal(json.content?.[0].attrs?.hangingIndent, 28);
});

test("Phase 3 - 13. Unit conversion and invalid indent fail-safe", () => {
  // Conversion
  assert.equal(ptToCm(72), 2.54);
  assert.equal(cmToPt(2.54), 72);

  // Validation clamping
  assert.equal(validateAndClampSpacing(-10), 0);
  assert.equal(validateAndClampSpacing(9999), 500);
  assert.equal(validateAndClampSpacing("invalid"), null);

  assert.equal(validateAndClampIndent(-5), 0);
  assert.equal(validateAndClampIndent(2000), 1000);

  // Normalization
  const norm = normalizeFirstLineAndHanging(15, 25);
  // Nếu có cả 2, first line ưu tiên hoặc loại trừ an toàn
  assert.equal(norm.firstLineIndent > 0 || norm.hangingIndent > 0, true);
  assert.equal(norm.firstLineIndent > 0 && norm.hangingIndent > 0, false);
});

test("Phase 3 - 14. Clear direct paragraph formatting restores pure style definition", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          styleId: "style_body",
          lineSpacing: "2.0",
          textAlign: "center",
          spacingBefore: 20,
        },
        content: [{ type: "text", text: "Văn bản có direct overrides" }],
      },
    ],
  });

  editor.commands.selectAll();
  clearDirectParagraphFormatting(editor);

  const json = editor.getJSON();
  const p = json.content?.[0];
  // styleId vẫn được giữ nguyên
  assert.equal(p?.attrs?.styleId, "style_body");
  // Tất cả direct overrides bị xóa về null
  assert.equal(p?.attrs?.lineSpacing, null);
  assert.equal(p?.attrs?.textAlign, null);
  assert.equal(p?.attrs?.spacingBefore, null);
});

test("Phase 3 - 15. Undo and Redo Apply Paragraph Style atomically", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 1" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 2" }],
      },
    ],
  });

  editor.commands.selectAll();
  applyParagraphStyle(editor, "style_test_undo");

  let json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.styleId, "style_test_undo");
  assert.equal(json.content?.[1].attrs?.styleId, "style_test_undo");

  // Undo: cả 2 đoạn phải quay về trạng thái ban đầu
  undo(editor);
  json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.styleId, null);
  assert.equal(json.content?.[1].attrs?.styleId, null);

  // Redo: cả 2 đoạn được áp dụng lại style
  redo(editor);
  json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.styleId, "style_test_undo");
  assert.equal(json.content?.[1].attrs?.styleId, "style_test_undo");
});
