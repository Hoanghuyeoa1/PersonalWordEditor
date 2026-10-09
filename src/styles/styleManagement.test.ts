import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import {
  createStyle,
  updateStyle,
  renameStyle,
  duplicateStyle,
  deleteStyle,
  updateStyleFromSelection,
  getStyleUsage,
} from "./services/styleManagementService.ts";
import {
  undoStyle,
  redoStyle,
  clearStyleHistory,
} from "./services/styleHistoryService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_EMPHASIS_ID,
  createDefaultStyleDefinitions,
} from "./services/builtInStyles.ts";
import { undo, redo } from "../editor/editorCommands.ts";

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
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Init" }] }] },
      styles: {
        definitions: defaultDefs,
        defaultParagraphStyleId: STYLE_NORMAL_ID,
      },
    },
    isDirty: false,
    isModified: false,
  });
}

/* ==========================================================================
   Phase 5 Targeted Tests - Style Management Core + History Safety
   ========================================================================== */

test("Phase 5 - 1. Create paragraph style with validation and defaults", () => {
  resetTestStore();

  const res = createStyle({
    name: "Thesis Body",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    paragraph: {
      lineSpacing: "1.5",
      spacingAfter: 12,
      leftIndent: 18,
    },
    character: {
      fontFamily: "Times New Roman",
      fontSize: 12,
    },
  });

  assert.equal(res.success, true);
  assert.ok(res.data);
  assert.equal(res.data.name, "Thesis Body");
  assert.equal(res.data.type, "paragraph");
  assert.equal(res.data.basedOn, STYLE_NORMAL_ID);
  assert.equal(res.data.isBuiltIn, false);
  assert.equal(res.data.paragraph?.lineSpacing, "1.5");
  assert.equal(res.data.paragraph?.spacingAfter, 12);
  assert.equal(res.data.character?.fontFamily, "Times New Roman");

  // Đã được lưu vào documentStore
  const defs = useDocumentStore.getState().document.styles.definitions;
  assert.ok(defs.some((s) => s.id === res.data!.id));
});

test("Phase 5 - 2. Create character style with validation", () => {
  resetTestStore();

  const res = createStyle({
    name: "Code Keyword",
    type: "character",
    basedOn: null,
    character: {
      fontFamily: "Courier New",
      fontSize: 10,
      color: "#2563eb",
      bold: true,
    },
  });

  assert.equal(res.success, true);
  assert.ok(res.data);
  assert.equal(res.data.name, "Code Keyword");
  assert.equal(res.data.type, "character");
  assert.equal(res.data.paragraph, undefined);
  assert.equal(res.data.character?.bold, true);
  assert.equal(res.data.character?.color, "#2563eb");
});

test("Phase 5 - 3. Rename style and built-in rename protection", () => {
  resetTestStore();

  // 1. Tạo custom style rồi đổi tên
  const created = createStyle({ name: "Draft Header", type: "paragraph" });
  assert.equal(created.success, true);
  const styleId = created.data!.id;

  const renameRes = renameStyle(styleId, "Final Header");
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.data?.name, "Final Header");
  assert.equal(renameRes.data?.id, styleId); // Stable ID không đổi!

  // 2. Thử đổi tên Built-in style -> Phải bị từ chối
  const builtInRename = renameStyle(STYLE_NORMAL_ID, "Standard Normal");
  assert.equal(builtInRename.success, false);
  assert.ok(builtInRename.error?.includes("Không thể đổi tên Style hệ thống"));

  const normalStyle = useDocumentStore.getState().document.styles.definitions.find((s) => s.id === STYLE_NORMAL_ID);
  assert.equal(normalStyle?.name, "Normal");
});

test("Phase 5 - 4. Duplicate style creates unique ID and copies properties", () => {
  resetTestStore();

  const created = createStyle({
    name: "Special Box",
    type: "paragraph",
    paragraph: { textAlign: "center", spacingBefore: 15 },
    character: { bold: true, color: "#b91c1c" },
  });
  assert.equal(created.success, true);

  // Duplicate với tên tự sinh
  const dupRes = duplicateStyle(created.data!.id);
  assert.equal(dupRes.success, true);
  assert.ok(dupRes.data);
  assert.notEqual(dupRes.data.id, created.data!.id);
  assert.equal(dupRes.data.name, "Special Box (Copy)");
  assert.equal(dupRes.data.isBuiltIn, false);
  assert.equal(dupRes.data.paragraph?.textAlign, "center");
  assert.equal(dupRes.data.paragraph?.spacingBefore, 15);
  assert.equal(dupRes.data.character?.color, "#b91c1c");

  // Duplicate lần 2 tự sinh tên Copy 2
  const dup2 = duplicateStyle(created.data!.id);
  assert.equal(dup2.success, true);
  assert.equal(dup2.data?.name, "Special Box (Copy 2)");
});

test("Phase 5 - 5. Edit style definition updates presentation across store", () => {
  resetTestStore();

  const created = createStyle({
    name: "Banner Text",
    type: "paragraph",
    paragraph: { lineSpacing: "1.0" },
  });
  assert.equal(created.success, true);

  const editRes = updateStyle(created.data!.id, {
    paragraph: { lineSpacing: "2.0", spacingAfter: 20 },
    character: { color: "#475569" },
  });

  assert.equal(editRes.success, true);
  assert.equal(editRes.data?.paragraph?.lineSpacing, "2.0");
  assert.equal(editRes.data?.paragraph?.spacingAfter, 20);
  assert.equal(editRes.data?.character?.color, "#475569");

  const stored = useDocumentStore.getState().document.styles.definitions.find((s) => s.id === created.data!.id);
  assert.equal(stored?.paragraph?.lineSpacing, "2.0");
});

test("Phase 5 - 6. Delete unused custom style cleanly", () => {
  resetTestStore();

  const created = createStyle({ name: "Unused Style", type: "paragraph" });
  assert.equal(created.success, true);
  const id = created.data!.id;

  const delRes = deleteStyle(id);
  assert.equal(delRes.success, true);
  assert.equal(delRes.data?.deletedStyleId, id);
  assert.equal(delRes.data?.reassignedCount, 0);

  const defs = useDocumentStore.getState().document.styles.definitions;
  assert.equal(defs.some((s) => s.id === id), false);
});

test("Phase 5 - 7. Delete used style reassigns blocks without orphan styleId", () => {
  resetTestStore();

  const created = createStyle({ name: "Temporary Quote", type: "paragraph" });
  const customId = created.data!.id;

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: customId },
        content: [{ type: "text", text: "Đoạn 1 sử dụng custom style" }],
      },
      {
        type: "paragraph",
        attrs: { styleId: customId },
        content: [{ type: "text", text: "Đoạn 2 sử dụng custom style" }],
      },
    ],
  });

  // Kiểm tra trước khi xóa: có 2 block sử dụng style
  const usageBefore = getStyleUsage(customId, editor);
  assert.equal(usageBefore.blockCount, 2);

  // Xóa style với editor active
  const delRes = deleteStyle(customId, { fallbackStyleId: STYLE_NORMAL_ID }, editor);
  assert.equal(delRes.success, true);
  assert.equal(delRes.data?.reassignedCount, 2);

  // Không còn orphan styleId trong AST: cả 2 đoạn đã được reassign về null (tương đương Normal)
  const json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.styleId, null);
  assert.equal(json.content?.[1].attrs?.styleId, null);

  const usageAfter = getStyleUsage(customId, editor);
  assert.equal(usageAfter.blockCount, 0);
});

test("Phase 5 - 8. Delete parent style safely rebases descendant styles", () => {
  resetTestStore();

  // Tạo Style Parent A
  const parentRes = createStyle({ name: "Base Parent", type: "paragraph", basedOn: STYLE_NORMAL_ID });
  assert.equal(parentRes.success, true);
  const parentId = parentRes.data!.id;

  // Tạo Style Child B dựa trên A
  const childRes = createStyle({ name: "Sub Child", type: "paragraph", basedOn: parentId });
  assert.equal(childRes.success, true);
  const childId = childRes.data!.id;

  // Xóa Style Parent A
  const delRes = deleteStyle(parentId);
  assert.equal(delRes.success, true);
  assert.equal(delRes.data?.rebasedCount, 1);

  // Child B phải được rebase an toàn về parent của A (tức STYLE_NORMAL_ID)
  const childInStore = useDocumentStore.getState().document.styles.definitions.find((s) => s.id === childId);
  assert.ok(childInStore);
  assert.equal(childInStore.basedOn, STYLE_NORMAL_ID);
});

test("Phase 5 - 9. Built-in styles cannot be deleted", () => {
  resetTestStore();

  const delNormal = deleteStyle(STYLE_NORMAL_ID);
  assert.equal(delNormal.success, false);
  assert.ok(delNormal.error?.includes("Không thể xóa Style hệ thống"));

  const delH1 = deleteStyle(STYLE_HEADING_1_ID);
  assert.equal(delH1.success, false);
  assert.ok(delH1.error?.includes("Không thể xóa Style hệ thống"));

  // Danh sách vẫn giữ nguyên
  const defs = useDocumentStore.getState().document.styles.definitions;
  assert.ok(defs.some((s) => s.id === STYLE_NORMAL_ID));
  assert.ok(defs.some((s) => s.id === STYLE_HEADING_1_ID));
});

test("Phase 5 - 10. Duplicate name rejection (case-insensitive)", () => {
  resetTestStore();

  // Trùng với built-in "Normal"
  const res1 = createStyle({ name: "normal", type: "paragraph" });
  assert.equal(res1.success, false);
  assert.ok(res1.error?.includes("đã tồn tại"));

  // Tạo custom "My Style"
  const res2 = createStyle({ name: "My Style", type: "paragraph" });
  assert.equal(res2.success, true);

  // Thử tạo lại "  my style  "
  const res3 = createStyle({ name: "  my style  ", type: "paragraph" });
  assert.equal(res3.success, false);
  assert.ok(res3.error?.includes("đã tồn tại"));
});

test("Phase 5 - 11. Invalid Based On and cycle prevention", () => {
  resetTestStore();

  // 1. Based on style không tồn tại
  const badParent = createStyle({ name: "Ghost Child", type: "paragraph", basedOn: "style_nonexistent" });
  assert.equal(badParent.success, false);
  assert.ok(badParent.error?.includes("không tồn tại"));

  // 2. Mismatch type (Paragraph dựa trên Character style)
  const charStyle = createStyle({ name: "Char Target", type: "character" });
  assert.equal(charStyle.success, true);

  const mismatch = createStyle({
    name: "Illegal Para",
    type: "paragraph",
    basedOn: charStyle.data!.id,
  });
  assert.equal(mismatch.success, false);
  assert.ok(mismatch.error?.includes("phải cùng loại"));

  // 3. Phụ thuộc vòng
  const sA = createStyle({ name: "Cycle A", type: "paragraph", basedOn: STYLE_NORMAL_ID });
  const sB = createStyle({ name: "Cycle B", type: "paragraph", basedOn: sA.data!.id });
  // Thử sửa A dựa trên B
  const cycleUpdate = updateStyle(sA.data!.id, { basedOn: sB.data!.id });
  assert.equal(cycleUpdate.success, false);
  assert.ok(cycleUpdate.error?.includes("phụ thuộc vòng"));
});

test("Phase 5 - 12. Style usage detection in blocks and character runs", () => {
  resetTestStore();

  const pStyle = createStyle({ name: "Usage P", type: "paragraph" }).data!;
  const cStyle = createStyle({ name: "Usage C", type: "character" }).data!;

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: pStyle.id },
        content: [
          { type: "text", text: "Plain in styled paragraph. " },
          {
            type: "text",
            text: "Styled run 1.",
            marks: [{ type: "characterStyle", attrs: { styleId: cStyle.id } }],
          },
        ],
      },
      {
        type: "paragraph",
        attrs: { styleId: pStyle.id },
        content: [
          {
            type: "text",
            text: "Styled run 2.",
            marks: [{ type: "characterStyle", attrs: { styleId: cStyle.id } }],
          },
        ],
      },
    ],
  });

  const pUsage = getStyleUsage(pStyle.id, editor);
  assert.equal(pUsage.blockCount, 2);
  assert.equal(pUsage.runCount, 0);
  assert.equal(pUsage.totalUsage, 2);

  const cUsage = getStyleUsage(cStyle.id, editor);
  assert.equal(cUsage.blockCount, 0);
  assert.equal(cUsage.runCount, 2);
  assert.equal(cUsage.totalUsage, 2);
});

test("Phase 5 - 13. Update paragraph style from selection and clears direct overrides", () => {
  resetTestStore();

  const customPara = createStyle({
    name: "Callout Text",
    type: "paragraph",
    paragraph: { textAlign: "left", lineSpacing: "1.15" },
  }).data!;

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          styleId: customPara.id,
          textAlign: "center",
          lineSpacing: "1.5",
          spacingBefore: 16,
          spacingAfter: 8,
        },
        content: [
          {
            type: "text",
            text: "Đoạn văn được căn giữa và giãn dòng 1.5.",
          },
        ],
      },
    ],
  });

  // Đặt con trỏ trong đoạn văn
  editor.commands.setTextSelection(5);

  // Cập nhật style theo selection
  const updateRes = updateStyleFromSelection(customPara.id, editor, { clearDirectFormatting: true });
  assert.equal(updateRes.success, true);
  assert.ok(updateRes.data);

  // Thuộc tính style được nạp chính xác
  assert.equal(updateRes.data.paragraph?.textAlign, "center");
  assert.equal(updateRes.data.paragraph?.lineSpacing, "1.5");
  assert.equal(updateRes.data.paragraph?.spacingBefore, 16);
  assert.equal(updateRes.data.paragraph?.spacingAfter, 8);

  // Direct formatting trên block đã được dọn sạch để kế thừa thuần túy từ Style
  const json = editor.getJSON();
  assert.equal(json.content?.[0].attrs?.textAlign, null);
  assert.equal(json.content?.[0].attrs?.lineSpacing, null);
  assert.equal(json.content?.[0].attrs?.spacingBefore, null);
});

test("Phase 5 - 14. Update character style from selection", () => {
  resetTestStore();

  const customChar = createStyle({
    name: "Key Accent",
    type: "character",
    character: { bold: false },
  }).data!;

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Highlighted text",
            marks: [
              { type: "bold" },
              { type: "textStyle", attrs: { color: "#059669", fontSize: "14pt" } },
            ],
          },
        ],
      },
    ],
  });

  editor.commands.setTextSelection({ from: 2, to: 8 });

  const updateRes = updateStyleFromSelection(customChar.id, editor);
  assert.equal(updateRes.success, true);
  assert.ok(updateRes.data);
  assert.equal(updateRes.data.character?.bold, true);
  assert.equal(updateRes.data.character?.color, "#059669");
  assert.equal(updateRes.data.character?.fontSize, 14);
});

test("Phase 5 - 15. Semantic metadata excluded from update-from-selection", () => {
  resetTestStore();

  const customStyle = createStyle({ name: "Strict Clean", type: "paragraph" }).data!;

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: customStyle.id },
        content: [
          {
            type: "text",
            text: "Text with review and comments",
            marks: [
              { type: "comment", attrs: { commentId: "c_exclusive_999" } },
              { type: "trackChange", attrs: { id: "tc_change_777", changeType: "insert" } },
              { type: "link", attrs: { href: "https://example.com" } },
              { type: "bold" },
            ],
          },
        ],
      },
    ],
  });

  editor.commands.setTextSelection({ from: 2, to: 10 });
  const updateRes = updateStyleFromSelection(customStyle.id, editor);
  assert.equal(updateRes.success, true);
  const updated = updateRes.data!;

  // Chỉ nạp presentation thuộc tính (bold), tuyệt đối không nạp comment/trackChange/link
  assert.equal(updated.character?.bold, true);
  assert.equal((updated as any).commentId, undefined);
  assert.equal((updated as any).changeId, undefined);
  assert.equal((updated as any).href, undefined);
  assert.equal((updated.character as any)?.commentId, undefined);
});

test("Phase 5 - 16. Undo and Redo style definitions atomically", () => {
  resetTestStore();

  // 1. Create -> Undo -> Redo
  const created = createStyle({ name: "Undoable Style", type: "paragraph" });
  assert.equal(created.success, true);
  const styleId = created.data!.id;

  assert.ok(useDocumentStore.getState().document.styles.definitions.some((s) => s.id === styleId));

  // Undo Create
  const undoneCreate = undoStyle();
  assert.equal(undoneCreate, true);
  assert.equal(
    useDocumentStore.getState().document.styles.definitions.some((s) => s.id === styleId),
    false
  );

  // Redo Create
  const redoneCreate = redoStyle();
  assert.equal(redoneCreate, true);
  assert.ok(useDocumentStore.getState().document.styles.definitions.some((s) => s.id === styleId));

  // 2. Edit -> Undo -> Redo
  updateStyle(styleId, { paragraph: { lineSpacing: "2.0" } });
  assert.equal(
    useDocumentStore.getState().document.styles.definitions.find((s) => s.id === styleId)?.paragraph?.lineSpacing,
    "2.0"
  );

  // Undo Edit
  undoStyle();
  assert.equal(
    useDocumentStore.getState().document.styles.definitions.find((s) => s.id === styleId)?.paragraph?.lineSpacing,
    undefined
  );

  // Redo Edit
  redoStyle();
  assert.equal(
    useDocumentStore.getState().document.styles.definitions.find((s) => s.id === styleId)?.paragraph?.lineSpacing,
    "2.0"
  );

  // 3. Delete -> Undo -> Redo
  deleteStyle(styleId);
  assert.equal(
    useDocumentStore.getState().document.styles.definitions.some((s) => s.id === styleId),
    false
  );

  // Undo Delete -> style được phục hồi
  undoStyle();
  assert.ok(useDocumentStore.getState().document.styles.definitions.some((s) => s.id === styleId));

  // Redo Delete -> style lại bị xóa
  redoStyle();
  assert.equal(
    useDocumentStore.getState().document.styles.definitions.some((s) => s.id === styleId),
    false
  );
});

test("Phase 5 - 17. Dirty state marks document dirty and cancel does not dirty", () => {
  resetTestStore();
  useDocumentStore.setState({ isDirty: false, isModified: false });

  // Thao tác thất bại (trùng tên) -> KHÔNG được làm bẩn tài liệu
  const failRes = createStyle({ name: "Normal", type: "paragraph" });
  assert.equal(failRes.success, false);
  assert.equal(useDocumentStore.getState().isDirty, false);

  // Thao tác thành công -> Đánh dấu isDirty = true
  const successRes = createStyle({ name: "Dirty Trigger", type: "paragraph" });
  assert.equal(successRes.success, true);
  assert.equal(useDocumentStore.getState().isDirty, true);
  assert.equal(useDocumentStore.getState().isModified, true);
});
