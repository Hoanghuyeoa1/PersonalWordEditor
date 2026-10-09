import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { CaptionService } from "./services/captionService.ts";
import { CaptionListService } from "./services/captionListService.ts";
import {
  insertTableOfFiguresCommand,
  dispatchReferenceCommand,
} from "./commands/referencesCommands.ts";
import { getReferenceItemDescriptor } from "./services/referencesRegistry.ts";

/**
 * Helper khởi tạo headless Tiptap Editor có đầy đủ extensions và plugins
 */
function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm UX chèn Danh mục Chú thích." }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ: PHASE 3 — INSERT CAPTION LIST UX + ENTRY NAVIGATION
   ========================================================================== */

test("Phase 3 UX: 1. Registry & Command: insertTableOfFigures đã active và điều phối chuẩn mực", () => {
  const editor = createTestEditor();
  const desc = getReferenceItemDescriptor("insertTableOfFigures");

  assert.ok(desc);
  assert.equal(desc.status, "active");
  assert.equal(desc.label, "Danh mục hình");

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình ban đầu" });

  // Dispatch command qua central dispatcher
  const res = dispatchReferenceCommand("insertTableOfFigures", editor);
  assert.equal(res.success, true);
  assert.equal(res.itemType, "insertTableOfFigures");
  assert.ok(res.details?.listId);

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 1);
});

test("Phase 3 UX: 2. Chèn Danh mục hình (List of Figures) với cấu hình mặc định", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Sơ đồ kiến trúc" });

  const res = insertTableOfFiguresCommand(editor, {
    label: "Figure",
    title: "Danh mục hình",
  });

  assert.equal(res.success, true);
  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].node.attrs.title, "Danh mục hình");
  assert.equal(lists[0].node.attrs.label, "Figure");
  assert.equal(lists[0].node.attrs.entries.length, 1);
  assert.equal(lists[0].node.attrs.entries[0].labelAndNumber, "Figure 1");
});

test("Phase 3 UX: 3. Chèn Danh mục bảng (List of Tables)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng dữ liệu người dùng" });

  const res = insertTableOfFiguresCommand(editor, {
    label: "Table",
    title: "Danh mục bảng biểu",
  });

  assert.equal(res.success, true);
  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].node.attrs.title, "Danh mục bảng biểu");
  assert.equal(lists[0].node.attrs.entries[0].labelAndNumber, "Table 1");
});

test("Phase 3 UX: 4. Chèn Danh mục phương trình (Equation List)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Equation", text: "Định luật Newton 2" });

  const res = insertTableOfFiguresCommand(editor, {
    label: "Equation",
    title: "Danh mục phương trình",
  });

  assert.equal(res.success, true);
  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Equation");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].node.attrs.title, "Danh mục phương trình");
  assert.equal(lists[0].node.attrs.entries[0].labelAndNumber, "Equation 1");
});

test("Phase 3 UX: 5. Khám phá nhãn tùy chỉnh (Custom Label Discovery) từ AST không scan DOM", () => {
  const editor = createTestEditor();

  // Khám phá ban đầu khi chưa có custom label
  let labels = CaptionListService.getAvailableLabels(editor.state.doc);
  assert.deepEqual(labels, ["Figure", "Table", "Equation"]);

  // Thêm custom caption "Biểu đồ" và "Sơ đồ"
  CaptionService.insertCaption(editor, { label: "Biểu đồ", text: "Tăng trưởng doanh thu" });
  CaptionService.insertCaption(editor, { label: "Sơ đồ", text: "Quy trình xử lý giao dịch" });

  // Khám phá lại: tự động phát hiện đầy đủ các nhãn tùy chỉnh
  labels = CaptionListService.getAvailableLabels(editor.state.doc);
  assert.equal(labels.includes("Figure"), true);
  assert.equal(labels.includes("Table"), true);
  assert.equal(labels.includes("Equation"), true);
  assert.equal(labels.includes("Biểu đồ"), true);
  assert.equal(labels.includes("Sơ đồ"), true);

  // Chèn danh mục cho nhãn tùy chỉnh
  const res = insertTableOfFiguresCommand(editor, {
    label: "Biểu đồ",
    title: "Danh mục Biểu đồ",
  });
  assert.equal(res.success, true);

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Biểu đồ");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].node.attrs.entries[0].labelAndNumber, "Biểu đồ 1");
});

test("Phase 3 UX: 6. Xử lý an toàn khi nhãn chưa có chú thích (Empty Label Source)", () => {
  const editor = createTestEditor();

  // Tài liệu không có bất kỳ Table nào
  const res = insertTableOfFiguresCommand(editor, {
    label: "Table",
    title: "Danh mục bảng biểu",
  });

  assert.equal(res.success, true);
  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  assert.equal(lists.length, 1);
  assert.deepEqual(lists[0].node.attrs.entries, []);
});

test("Phase 3 UX: 7. Nhiều danh mục khác nhau đồng tồn tại (Multiple Lists)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng 1" });
  CaptionService.insertCaption(editor, { label: "Equation", text: "Công thức 1" });

  insertTableOfFiguresCommand(editor, { label: "Figure", title: "Danh mục hình" });
  insertTableOfFiguresCommand(editor, { label: "Table", title: "Danh mục bảng" });
  insertTableOfFiguresCommand(editor, { label: "Equation", title: "Danh mục công thức" });

  const figLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  const tabLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  const eqLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Equation");

  assert.equal(figLists.length, 1);
  assert.equal(tabLists.length, 1);
  assert.equal(eqLists.length, 1);

  assert.equal(figLists[0].node.attrs.label, "Figure");
  assert.equal(tabLists[0].node.attrs.label, "Table");
  assert.equal(eqLists[0].node.attrs.label, "Equation");
});

test("Phase 3 UX: 8. Cho phép hai danh mục cùng nhãn trong cùng tài liệu (Two lists same label)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });

  insertTableOfFiguresCommand(editor, { label: "Figure", title: "Danh mục hình đầu sách", preset: "classic" });
  insertTableOfFiguresCommand(editor, { label: "Figure", title: "Danh mục hình phụ lục", preset: "modern" });

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 2);
  assert.notEqual(lists[0].node.attrs.id, lists[1].node.attrs.id);
  assert.equal(lists[0].node.attrs.preset, "classic");
  assert.equal(lists[1].node.attrs.preset, "modern");
});

test("Phase 3 UX: 9. Hỗ trợ đầy đủ các Presets (Classic, Modern, Formal)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });

  insertTableOfFiguresCommand(editor, { label: "Figure", preset: "formal" });

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].node.attrs.preset, "formal");
});

test("Phase 3 UX: 10. Entry Navigation: Điều hướng chính xác tới Caption node mà không mutate AST", () => {
  const editor = createTestEditor();

  const cap1 = CaptionService.insertCaption(editor, { label: "Figure", text: "Hình mục tiêu A" });
  const cap2 = CaptionService.insertCaption(editor, { label: "Figure", text: "Hình mục tiêu B" });

  insertTableOfFiguresCommand(editor, { label: "Figure" });

  const docSizeBefore = editor.state.doc.nodeSize;

  // Điều hướng tới caption 2
  const navRes = CaptionService.navigateToCaption(editor, cap2.captionId!);
  assert.equal(navRes.success, true);

  // Bảo đảm không làm thay đổi nội dung AST (Zero AST Mutation)
  assert.equal(editor.state.doc.nodeSize, docSizeBefore);

  // Vị trí con trỏ hiện tại nằm ngay sau caption 2
  let targetPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "caption" && node.attrs.id === cap2.captionId) {
      targetPos = pos;
      return false;
    }
  });

  assert.ok(targetPos > 0);
  assert.ok(editor.state.selection.from >= targetPos);
});

test("Phase 3 UX: 11. Undo / Redo: Hoàn tác và làm lại thao tác chèn Danh mục hình bảo toàn AST", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản bài viết." }],
      },
      {
        type: "caption",
        attrs: {
          id: "ref_cap_figure_init_1",
          label: "Figure",
          text: "Minh họa 1",
          positionPolicy: "below",
        },
        content: [{ type: "text", text: "Minh họa 1" }],
      },
    ],
  });

  // 1. Chèn danh mục hình
  insertTableOfFiguresCommand(editor, { label: "Figure", title: "Danh mục hoàn tác" });
  let lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 1);

  // 2. Undo: Khối danh mục bị xóa khỏi AST
  editor.commands.undo();
  lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 0);

  // Caption gốc vẫn còn nguyên vẹn
  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 1);

  // 3. Redo: Khối danh mục được phục hồi toàn vẹn
  editor.commands.redo();
  lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].node.attrs.title, "Danh mục hoàn tác");
  assert.equal(lists[0].node.attrs.entries.length, 1);
});

