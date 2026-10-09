import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { CaptionService } from "./services/captionService.ts";
import { CaptionListService } from "./services/captionListService.ts";
import { TocService } from "./services/tocService.ts";
import { CitationService } from "./services/citationService.ts";
import { ReferenceUpdateService } from "./services/referenceUpdateService.ts";
import {
  insertTableOfFiguresCommand,
  updateTableOfFiguresCommand,
  dispatchReferenceCommand,
} from "./commands/referencesCommands.ts";
import { getReferenceItemDescriptor } from "./services/referencesRegistry.ts";
import type { CaptionListNodeAttrs } from "./types/captionListTypes.ts";

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
          content: [{ type: "text", text: "Văn bản thử nghiệm Phase 4 Caption List Update." }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ: PHASE 4 — UPDATE CAPTION LIST + F9 INTEGRATION
   ========================================================================== */

test("Phase 4 Update: 1. Thêm Caption mới và Update (Atomically renumbered & ordered)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình ban đầu 1" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình ban đầu 2" });

  const insertRes = insertTableOfFiguresCommand(editor, { label: "Figure" });
  assert.equal(insertRes.success, true);

  let lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].node.attrs.entries.length, 2);

  // Thêm caption thứ 3 vào tài liệu
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình mới bổ sung" });

  // Đặt con trỏ vào bên trong Caption List để cập nhật
  editor.commands.setTextSelection(lists[0].pos + 1);

  const updateRes = updateTableOfFiguresCommand(editor);
  assert.equal(updateRes.success, true);
  assert.equal(updateRes.details?.updatedCount, 1);

  lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  const entries = lists[0].node.attrs.entries;
  assert.equal(entries.length, 3);
  assert.equal(entries[0].labelAndNumber, "Figure 1");
  assert.equal(entries[1].labelAndNumber, "Figure 2");
  assert.equal(entries[2].labelAndNumber, "Figure 3");
  assert.equal(entries[2].text, "Hình mới bổ sung");
});

test("Phase 4 Update: 2. Xóa Caption ở giữa tài liệu (Delete caption & auto renumber)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình A" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình B cần xóa" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình C" });

  insertTableOfFiguresCommand(editor, { label: "Figure" });

  let allCaps = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(allCaps.length, 3);
  const capB = allCaps[1];

  // Xóa Caption B khỏi AST (dùng nodeSize đầy đủ)
  const posB = CaptionService.findCaptionPosition(editor.state.doc, capB.id);
  assert.ok(posB !== null);
  const nodeB = editor.state.doc.nodeAt(posB)!;
  const tr = editor.state.tr.delete(posB, posB + nodeB.nodeSize);
  editor.view.dispatch(tr);

  // Cập nhật danh mục
  const updateRes = updateTableOfFiguresCommand(editor);
  assert.equal(updateRes.success, true);

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  const entries = lists[0].node.attrs.entries;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].labelAndNumber, "Figure 1");
  assert.equal(entries[0].text, "Hình A");
  // Hình C tự động được đánh số lại thành Figure 2
  assert.equal(entries[1].labelAndNumber, "Figure 2");
  assert.equal(entries[1].text, "Hình C");
});

test("Phase 4 Update: 3. Đổi thứ tự Caption (Reorder captions reflection)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Đầu tiên" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Thứ hai" });

  insertTableOfFiguresCommand(editor, { label: "Figure" });

  const caps = CaptionService.extractCaptions(editor.state.doc);
  const pos1 = CaptionService.findCaptionPosition(editor.state.doc, caps[0].id)!;
  const node1 = editor.state.doc.nodeAt(pos1)!;

  // Cắt caption 1 và chèn xuống sau caption 2
  const tr = editor.state.tr;
  tr.delete(pos1, pos1 + node1.nodeSize);
  tr.insert(tr.doc.content.size, node1);
  editor.view.dispatch(tr);

  // Cập nhật
  updateTableOfFiguresCommand(editor);

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  const entries = lists[0].node.attrs.entries;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].text, "Thứ hai");
  assert.equal(entries[0].labelAndNumber, "Figure 1");
  assert.equal(entries[1].text, "Đầu tiên");
  assert.equal(entries[1].labelAndNumber, "Figure 2");
});

test("Phase 4 Update: 4. Đổi nội dung Text của Caption (Rename text reflection)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Tiêu đề ban đầu" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  const cap = CaptionService.extractCaptions(editor.state.doc)[0];
  const capPos = CaptionService.findCaptionPosition(editor.state.doc, cap.id)!;
  const capNode = editor.state.doc.nodeAt(capPos)!;

  // Thay đổi nội dung text của Caption node
  const newText = "Tiêu đề đã được cập nhật hoàn chỉnh";
  const newCaption = editor.schema.nodes.caption.create(
    { ...capNode.attrs, text: newText },
    editor.schema.text(newText)
  );
  const tr = editor.state.tr.replaceWith(capPos, capPos + capNode.nodeSize, newCaption);
  editor.view.dispatch(tr);

  updateTableOfFiguresCommand(editor);

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists[0].node.attrs.entries[0].text, "Tiêu đề đã được cập nhật hoàn chỉnh");
  assert.ok(lists[0].node.attrs.entries[0].fullTitle.includes("Tiêu đề đã được cập nhật hoàn chỉnh"));
});

test("Phase 4 Update: 5. Đổi nhãn Caption (Change label Figure -> Table)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình muốn đổi thành Bảng" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  let figLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(figLists[0].node.attrs.entries.length, 1);

  // Đổi nhãn của Caption sang Table
  const cap = CaptionService.extractCaptions(editor.state.doc)[0];
  const capPos = CaptionService.findCaptionPosition(editor.state.doc, cap.id)!;
  const capNode = editor.state.doc.nodeAt(capPos)!;

  const tr = editor.state.tr.setNodeMarkup(capPos, undefined, {
    ...capNode.attrs,
    label: "Table",
  });
  editor.view.dispatch(tr);

  // Cập nhật Danh mục Figure
  updateTableOfFiguresCommand(editor);

  figLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  // Danh mục hình bây giờ không còn mục nào vì nhãn đã chuyển sang Table
  assert.equal(figLists[0].node.attrs.entries.length, 0);

  // Chèn Danh mục Table -> phát hiện ngay mục mới đổi
  insertTableOfFiguresCommand(editor, { label: "Table" });
  const tabLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  assert.equal(tabLists[0].node.attrs.entries.length, 1);
  assert.equal(tabLists[0].node.attrs.entries[0].labelAndNumber, "Table 1");
});

test("Phase 4 Update: 6. Phản ánh số trang khi có Page Break (Page reflow)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình tại trang 1" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  let lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists[0].node.attrs.entries[0].pageNumber, 1);

  // Chèn ngắt trang vào trước caption
  const pageBreakType = editor.schema.nodes.pageBreak;
  if (pageBreakType) {
    const tr = editor.state.tr.insert(0, pageBreakType.create());
    editor.view.dispatch(tr);

    updateTableOfFiguresCommand(editor);

    lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
    assert.equal(lists[0].node.attrs.entries[0].pageNumber, 2);
  }
});

test("Phase 4 Update: 7. Chế độ chỉ cập nhật số trang (updatePageNumbersOnly mode)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình thử nghiệm mode" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  const res = CaptionListService.updateCaptionList(editor, {
    updatePageNumbersOnly: true,
  });
  assert.equal(res.success, true);
  assert.equal(res.updatedCount, 1);

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists[0].node.attrs.entries.length, 1);
  assert.equal(lists[0].node.attrs.entries[0].text, "Hình thử nghiệm mode");
});

test("Phase 4 Update: 8. Đa danh mục độc lập: Cập nhật A không ảnh hưởng B (Multiple lists isolation)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng 1" });

  insertTableOfFiguresCommand(editor, { label: "Figure" });
  insertTableOfFiguresCommand(editor, { label: "Table" });

  const figListBefore = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure")[0];
  const tabListBefore = CaptionListService.findCaptionListNodes(editor.state.doc, "Table")[0];

  // Thêm một Figure mới
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 2 mới" });

  // Đặt con trỏ vào bên trong FigList và gọi update
  editor.commands.setTextSelection(figListBefore.pos + 1);
  const updateRes = updateTableOfFiguresCommand(editor);
  assert.equal(updateRes.success, true);

  const figListAfter = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure")[0];
  const tabListAfter = CaptionListService.findCaptionListNodes(editor.state.doc, "Table")[0];

  // Danh mục Figure được cập nhật lên 2 mục
  assert.equal(figListAfter.node.attrs.entries.length, 2);
  // Danh mục Table giữ nguyên vẹn 1 mục, không bị ảnh hưởng
  assert.equal(tabListAfter.node.attrs.entries.length, 1);
  assert.equal(tabListAfter.node.attrs.entries[0].text, "Bảng 1");
});

test("Phase 4 Update: 9. Phím tắt F9 khi con trỏ ở trong TOC -> Cập nhật TOC chuẩn xác", () => {
  const editor = createTestEditor();

  // Tạo đề mục H1
  const h1 = editor.schema.nodes.heading.create(
    { level: 1, id: "ref_h1_test" },
    editor.schema.text("Đề mục ban đầu")
  );
  editor.view.dispatch(editor.state.tr.insert(0, h1));

  // Chèn TOC
  TocService.insertToc(editor);
  const tocPos = TocService.findTocNode(editor.state.doc)!.pos;

  // Thêm một Caption List ở dưới
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  // Đổi tên đề mục H1
  const tr = editor.state.tr.replaceWith(
    1,
    1 + "Đề mục ban đầu".length,
    editor.schema.text("Đề mục đã sửa tên")
  );
  editor.view.dispatch(tr);

  // Lấy vị trí TOC hiện tại sau khi văn bản phía trước thay đổi
  const currentToc = TocService.findTocNode(editor.state.doc);
  assert.ok(currentToc);
  editor.commands.setNodeSelection(currentToc.pos);

  // Kích hoạt F9 qua shared resolver
  const f9Executed = ReferenceUpdateService.executeF9Update(editor);
  assert.equal(f9Executed, true);

  const tocNode = TocService.findTocNode(editor.state.doc)!;
  assert.equal(tocNode.node.attrs.entries[0].text, "Đề mục đã sửa tên");
});

test("Phase 4 Update: 10. Phím tắt F9 khi con trỏ ở trong Caption List -> Cập nhật Caption List", () => {
  const editor = createTestEditor();

  // Tạo TOC và Caption List cùng tồn tại
  const h1 = editor.schema.nodes.heading.create(
    { level: 1, id: "ref_h1_sample" },
    editor.schema.text("Tiêu đề")
  );
  editor.view.dispatch(editor.state.tr.insert(0, h1));
  TocService.insertToc(editor);

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình A" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  let figList = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure")[0];
  assert.equal(figList.node.attrs.entries.length, 1);

  // Thêm Caption thứ 2
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình B" });

  // Đặt con trỏ BÊN TRONG khối Caption List
  figList = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure")[0];
  editor.commands.setNodeSelection(figList.pos);

  // Kích hoạt F9
  const f9Executed = ReferenceUpdateService.executeF9Update(editor);
  assert.equal(f9Executed, true);

  figList = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure")[0];
  assert.equal(figList.node.attrs.entries.length, 2);
  assert.equal(figList.node.attrs.entries[1].text, "Hình B");
});

test("Phase 4 Update: 11. Phím tắt F9 khi con trỏ ở trong Bibliography -> Cập nhật Bibliography", () => {
  const editor = createTestEditor();

  CitationService.saveSource({
    id: "src_test_1",
    type: "book",
    authors: "Nguyễn Văn A",
    title: "Lập trình TypeScript",
    year: 2026,
  });

  CitationService.insertCitation(editor, { sourceId: "src_test_1" });
  CitationService.insertBibliography(editor);

  // Thêm nguồn thứ 2
  CitationService.saveSource({
    id: "src_test_2",
    type: "book",
    authors: "Trần Thị B",
    title: "Cấu trúc dữ liệu",
    year: 2025,
  });
  CitationService.insertCitation(editor, { sourceId: "src_test_2" });

  let bibPos = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "bibliography") {
      bibPos = pos;
      return false;
    }
    return true;
  });

  // Đặt con trỏ vào bên trong Bibliography
  editor.commands.setNodeSelection(bibPos);

  const f9Executed = ReferenceUpdateService.executeF9Update(editor);
  assert.equal(f9Executed, true);

  editor.state.doc.descendants((node) => {
    if (node.type.name === "bibliography") {
      assert.equal(node.attrs.entries.length, 2);
      return false;
    }
    return true;
  });
});

test("Phase 4 Update: 12. Hoàn tác (Undo) và Làm lại (Redo) cập nhật Caption List bảo toàn AST", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình khởi tạo" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  let lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists[0].node.attrs.entries.length, 1);

  // Thêm hình 2 và cập nhật
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình mới 2" });
  editor.commands.setTextSelection(lists[0].pos + 1);
  updateTableOfFiguresCommand(editor);

  lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists[0].node.attrs.entries.length, 2);

  // Undo thao tác Update
  editor.commands.undo();

  lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  // Khối Caption List khôi phục về trạng thái 1 entry
  assert.equal(lists[0].node.attrs.entries.length, 1);
  // Source caption trong tài liệu KHÔNG bị mất
  const remainingCaps = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(remainingCaps.length, 2);

  // Redo lại thao tác Update
  editor.commands.redo();
  lists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(lists[0].node.attrs.entries.length, 2);
});

test("Phase 4 Update: 13. Disabled State & Resolution Safety (Không update nhầm khi ngoài ngữ cảnh)", () => {
  const editor = createTestEditor();

  // 1. Khi chưa có Caption List nào trong tài liệu
  let resolved = CaptionListService.resolveActiveCaptionList(editor);
  assert.equal(resolved, null);

  let res = updateTableOfFiguresCommand(editor);
  assert.equal(res.success, false);
  assert.ok(res.message?.includes("Không tìm thấy"));

  // 2. Khi có 2 Caption List khác nhau và con trỏ ở đoạn văn thông thường
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng 1" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });
  insertTableOfFiguresCommand(editor, { label: "Table" });

  // Đặt con trỏ tại vị trí text ngoài 2 danh mục
  editor.commands.setTextSelection(1);
  resolved = CaptionListService.resolveActiveCaptionList(editor);
  // Không được tự ý đoán 1 trong 2 -> trả về null để button disabled an toàn!
  assert.equal(resolved, null);

  res = updateTableOfFiguresCommand(editor);
  assert.equal(res.success, false);

  // 3. Khi chỉ có 1 Caption List duy nhất trong tài liệu -> Fallback deterministic an toàn
  const editorSingle = createTestEditor();
  CaptionService.insertCaption(editorSingle, { label: "Figure", text: "Hình duy nhất" });
  insertTableOfFiguresCommand(editorSingle, { label: "Figure" });
  editorSingle.commands.setTextSelection(1);

  resolved = CaptionListService.resolveActiveCaptionList(editorSingle);
  assert.ok(resolved !== null);
  assert.equal(resolved.node.attrs.label, "Figure");

  // Descriptor trong registry đã active với phím tắt F9
  const desc = getReferenceItemDescriptor("updateTableOfFigures");
  assert.ok(desc);
  assert.equal(desc.status, "active");
  assert.equal(desc.shortcut, "F9");
});
