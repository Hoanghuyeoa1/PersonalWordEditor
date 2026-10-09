import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import {
  createStyle,
  updateStyle,
  duplicateStyle,
  deleteStyle,
  updateStyleFromSelection,
  getStyleUsage,
} from "./services/styleManagementService.ts";
import {
  getActiveStyleState,
  getEffectiveParagraphFormatting,
} from "./services/effectiveStyleService.ts";
import {
  applyParagraphStyle,
} from "./services/applyStyleService.ts";
import {
  applyCharacterStyle,
} from "./services/characterStyleService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  createDefaultStyleDefinitions,
  isBuiltInStyleId,
} from "./services/builtInStyles.ts";
import { resolveStyle } from "./services/styleResolver.ts";
import { clearStyleHistory } from "./services/styleHistoryService.ts";
import type { DocumentStyle } from "./types/styleTypes.ts";

function createTestEditor(initialContent: any): Editor {
  return new Editor({
    extensions: getEditorExtensions(),
    content: initialContent,
  });
}

function resetTestStore(): void {
  clearStyleHistory();
  const defaultDefs = createDefaultStyleDefinitions();
  useDocumentStore.setState({
    document: {
      metadata: { id: "test_doc", title: "Test Doc", createdAt: "", updatedAt: "" },
      pageSettings: {
        paperSize: "A4",
        orientation: "portrait",
        margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
        headerOffset: 12.7,
        footerOffset: 12.7,
      },
      styles: {
        version: "2.0",
        definitions: defaultDefs,
      },
      tableStyles: { defaultStyleId: "table_grid", styles: [] },
      sections: [],
    },
    isDirty: false,
  });
}

test("Phase 6 - 1. Styles Gallery priority allocation and overflow protection", () => {
  resetTestStore();

  // Thêm 15 custom styles vào tài liệu
  for (let i = 1; i <= 15; i++) {
    createStyle({
      name: `Custom Style ${i}`,
      type: "paragraph",
      basedOn: STYLE_NORMAL_ID,
      paragraph: { lineSpacing: "1.5" },
    });
  }

  const definitions = useDocumentStore.getState().document.styles.definitions;
  assert.equal(definitions.length >= 19, true); // 4 built-ins + 15 custom

  // Mô phỏng logic tính toán visible cards trong StylesGallery 2.0
  const priorityIds = [
    STYLE_NORMAL_ID,
    STYLE_HEADING_1_ID,
    STYLE_HEADING_2_ID,
    STYLE_HEADING_3_ID,
  ];

  const primary: DocumentStyle[] = [];
  const others: DocumentStyle[] = [];

  for (const pid of priorityIds) {
    const found = definitions.find((s) => s.id === pid);
    if (found) primary.push(found);
  }

  for (const s of definitions) {
    if (!priorityIds.includes(s.id as any)) {
      others.push(s);
    }
  }

  const maxVisible = 5;
  const additionalCount = Math.max(0, maxVisible - primary.length);
  const visibleStyles = [...primary, ...others.slice(0, additionalCount)];

  // Kiểm tra: Gallery không render hàng chục nút mà bị giới hạn chính xác tối đa 5 nút
  assert.equal(visibleStyles.length, 5);
  // 4 nút đầu tiên là Normal, Heading 1, Heading 2, Heading 3
  assert.equal(visibleStyles[0].id, STYLE_NORMAL_ID);
  assert.equal(visibleStyles[1].id, STYLE_HEADING_1_ID);
  assert.equal(visibleStyles[2].id, STYLE_HEADING_2_ID);
  assert.equal(visibleStyles[3].id, STYLE_HEADING_3_ID);
});

test("Phase 6 - 2. Active style detection on single paragraph and headings", () => {
  resetTestStore();
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: STYLE_NORMAL_ID },
        content: [{ type: "text", text: "Đoạn văn bình thường." }],
      },
      {
        type: "heading",
        attrs: { level: 1, styleId: STYLE_HEADING_1_ID },
        content: [{ type: "text", text: "Tiêu đề cấp 1." }],
      },
    ],
  });

  // Con trỏ trong đoạn văn 1
  editor.commands.setTextSelection(3);
  const state1 = getActiveStyleState(editor);
  assert.equal(state1.isParagraphMixed, false);
  assert.equal(state1.paragraphStyleId, STYLE_NORMAL_ID);

  // Con trỏ trong đề mục 2
  editor.commands.setTextSelection(28);
  const state2 = getActiveStyleState(editor);
  assert.equal(state2.isParagraphMixed, false);
  assert.equal(state2.paragraphStyleId, STYLE_HEADING_1_ID);
});

test("Phase 6 - 3. Active style detection on mixed multi-block selection", () => {
  resetTestStore();
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: STYLE_NORMAL_ID },
        content: [{ type: "text", text: "Đoạn 1 Normal." }],
      },
      {
        type: "heading",
        attrs: { level: 2, styleId: STYLE_HEADING_2_ID },
        content: [{ type: "text", text: "Đoạn 2 Heading 2." }],
      },
    ],
  });

  // Chọn từ đoạn 1 xuyên qua đoạn 2
  editor.commands.setTextSelection({ from: 2, to: 25 });
  const mixedState = getActiveStyleState(editor);

  // Phải đánh dấu mixed state rõ ràng, không được giả vờ là một style duy nhất
  assert.equal(mixedState.isParagraphMixed, true);
  assert.equal(mixedState.paragraphStyleId, null);
});

test("Phase 6 - 4. Character style active and mixed state handling", () => {
  resetTestStore();
  createStyle({
    id: "style_char_custom",
    name: "Custom Char",
    type: "character",
    character: { bold: true, color: "#2563eb" },
  });

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: STYLE_NORMAL_ID },
        content: [
          { type: "text", text: "Bình thường " },
          {
            type: "text",
            marks: [{ type: "characterStyle", attrs: { styleId: "style_char_custom" } }],
            text: "được style",
          },
          { type: "text", text: " kết thúc." },
        ],
      },
    ],
  });

  // Chọn toàn bộ từ 'được style' (vị trí 13 -> 23)
  editor.commands.setTextSelection({ from: 13, to: 23 });
  const uniformState = getActiveStyleState(editor);
  assert.equal(uniformState.isCharacterMixed, false);
  assert.equal(uniformState.characterStyleId, "style_char_custom");

  // Chọn từ vị trí 5 đến 18 (bao gồm cả chữ thường và chữ có characterStyle)
  editor.commands.setTextSelection({ from: 5, to: 18 });
  const mixedCharState = getActiveStyleState(editor);
  assert.equal(mixedCharState.isCharacterMixed, true);
  assert.equal(mixedCharState.characterStyleId, null);
});

test("Phase 6 - 5. Validation UX: reject empty names, duplicate names, and invalid basedOn", () => {
  resetTestStore();

  // Empty name
  const resEmpty = createStyle({
    name: "   ",
    type: "paragraph",
  });
  assert.equal(resEmpty.success, false);
  assert.match(resEmpty.error || "", /trống/i);

  // Duplicate name
  const resDup = createStyle({
    name: "Normal", // Tên đã có của built-in Normal
    type: "paragraph",
  });
  assert.equal(resDup.success, false);
  assert.match(resDup.error || "", /đã tồn tại/i);

  // Invalid basedOn (non-existent parent)
  const resParent = createStyle({
    name: "Orphan Child",
    type: "paragraph",
    basedOn: "non_existent_id",
  });
  assert.equal(resParent.success, false);
  assert.match(resParent.error || "", /không tồn tại/i);
});

test("Phase 6 - 6. Live preview inheritance resolution without document mutation", () => {
  resetTestStore();

  // Tạo style cha: Parent Style
  createStyle({
    id: "style_parent",
    name: "Parent Style",
    type: "paragraph",
    character: { fontFamily: "Georgia", fontSize: 14, color: "#1e3a8a" },
    paragraph: { textAlign: "justify", lineSpacing: "1.5" },
  });

  // Draft style con trong StyleEditorDialog: kế thừa style_parent và chỉ đổi bold + color
  const draftChild: DocumentStyle = {
    id: "style_child_draft",
    name: "Child Draft",
    type: "paragraph",
    basedOn: "style_parent",
    character: { bold: true, color: "#dc2626" },
  };

  const definitions = useDocumentStore.getState().document.styles.definitions;
  // Tạo danh sách tạm mô phỏng live preview trong dialog
  const simulatedDefs = [...definitions, draftChild];

  // Resolve Style trong Live Preview
  const preview = resolveStyle(draftChild.id, simulatedDefs);

  // Kế thừa font Georgia và size 14 từ style_parent
  assert.equal(preview.character.fontFamily, "Georgia");
  assert.equal(preview.character.fontSize, 14);
  assert.equal(preview.paragraph?.textAlign, "justify");
  assert.equal(preview.paragraph?.lineSpacing, "1.5");
  // Override bold và color từ child
  assert.equal(preview.character.bold, true);
  assert.equal(preview.character.color, "#dc2626");

  // Kiểm tra tài liệu thực tế KHÔNG bị thay đổi trong lúc user xem live preview
  const actualDefs = useDocumentStore.getState().document.styles.definitions;
  assert.equal(actualDefs.some((s) => s.id === "style_child_draft"), false);
});

test("Phase 6 - 7. Built-in protection: Delete and protected operations are blocked", () => {
  resetTestStore();

  assert.equal(isBuiltInStyleId(STYLE_NORMAL_ID), true);
  assert.equal(isBuiltInStyleId(STYLE_HEADING_1_ID), true);

  // Cố gắng xóa Normal
  const delNormal = deleteStyle(STYLE_NORMAL_ID);
  assert.equal(delNormal.success, false);
  assert.match(delNormal.error || "", /hệ thống/i);

  // Cố gắng xóa Heading 1
  const delH1 = deleteStyle(STYLE_HEADING_1_ID);
  assert.equal(delH1.success, false);
  assert.match(delH1.error || "", /hệ thống/i);
});

test("Phase 6 - 8. Custom style delete flow and usage tracking", () => {
  resetTestStore();

  createStyle({
    id: "style_temp",
    name: "Temporary Style",
    type: "paragraph",
    paragraph: { textAlign: "right" },
  });

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: "style_temp" },
        content: [{ type: "text", text: "Đoạn dùng style_temp." }],
      },
    ],
  });

  const usageBefore = getStyleUsage("style_temp", editor);
  assert.equal(usageBefore.totalUsage, 1);

  // Xóa style_temp có fallback về Normal
  const delRes = deleteStyle("style_temp", { fallbackStyleId: STYLE_NORMAL_ID }, editor);
  assert.equal(delRes.success, true);

  // Kiểm tra node đã được chuyển về Normal (attrs.styleId là null theo chuẩn canon, effective style là style_normal)
  const json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.styleId, null);
  const definitions = useDocumentStore.getState().document.styles.definitions;
  const effective = getEffectiveParagraphFormatting(json.content?.[0], definitions);
  assert.equal(effective.styleId, STYLE_NORMAL_ID);
});

test("Phase 6 - 9. Update Style to Match Selection action", () => {
  resetTestStore();

  createStyle({
    id: "style_quote",
    name: "Custom Quote",
    type: "paragraph",
    character: { fontSize: 11, italic: false },
    paragraph: { textAlign: "left" },
  });

  // Editor có đoạn văn mang direct formatting: căn giữa, lineSpacing 2.0, nghiêng
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "center", lineSpacing: "2.0" },
        content: [
          {
            type: "text",
            marks: [{ type: "italic" }],
            text: "Văn bản mẫu có định dạng đặc biệt.",
          },
        ],
      },
    ],
  });

  editor.commands.setTextSelection(5);

  const res = updateStyleFromSelection("style_quote", editor);
  assert.equal(res.success, true);

  // Kiểm tra style definition đã cập nhật theo định dạng của vùng chọn
  const updated = useDocumentStore
    .getState()
    .document.styles.definitions.find((s) => s.id === "style_quote");
  assert.ok(updated);
  assert.equal(updated.paragraph?.textAlign, "center");
  assert.equal(updated.paragraph?.lineSpacing, "2.0");
  assert.equal(updated.character?.italic, true);
});

test("Phase 6 - 10. Duplicate style creates unique copy", () => {
  resetTestStore();

  const dupRes = duplicateStyle(STYLE_HEADING_1_ID);
  assert.equal(dupRes.success, true);
  assert.ok(dupRes.data);
  assert.notEqual(dupRes.data.id, STYLE_HEADING_1_ID);
  assert.equal(dupRes.data.isBuiltIn, false);
  assert.match(dupRes.data.name, /Heading 1.*Copy/i);
});
