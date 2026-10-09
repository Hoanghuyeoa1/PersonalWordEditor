import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { CaptionService } from "./services/captionService.ts";
import { CaptionListService } from "./services/captionListService.ts";
import { buildPageLayoutMap } from "../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/services/pageConstants.ts";

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
          content: [{ type: "text", text: "Văn bản thử nghiệm Caption List Semantic Core." }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ: PHASE 2 — CAPTION LIST SEMANTIC CORE
   ========================================================================== */

test("Phase 2 Caption List: 1. Chèn Danh mục hình (List of Figures) thành công", () => {
  const editor = createTestEditor();

  // Chèn 2 hình ảnh kèm caption
  CaptionService.insertCaption(editor, { label: "Figure", text: "Sơ đồ kiến trúc tổng quan" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Mô hình luồng dữ liệu" });

  const res = CaptionListService.insertCaptionList(editor, { label: "Figure" });
  assert.equal(res.success, true);
  assert.ok(res.listId);
  assert.ok(res.listId.startsWith("ref_clist_figure_"));

  const listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(listNodes.length, 1);
  const { node } = listNodes[0];

  assert.equal(node.attrs.label, "Figure");
  assert.equal(node.attrs.title, "Danh mục hình ảnh");
  assert.equal(node.attrs.entries.length, 2);
  assert.equal(node.attrs.entries[0].number, 1);
  assert.equal(node.attrs.entries[0].labelAndNumber, "Figure 1");
  assert.equal(node.attrs.entries[0].text, "Sơ đồ kiến trúc tổng quan");
  assert.equal(node.attrs.entries[1].number, 2);
  assert.equal(node.attrs.entries[1].labelAndNumber, "Figure 2");
  assert.equal(node.attrs.entries[1].text, "Mô hình luồng dữ liệu");
});

test("Phase 2 Caption List: 2. Chèn Danh mục bảng (List of Tables) thành công", () => {
  const editor = createTestEditor();

  // Chèn 2 bảng kèm caption
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng phân bổ ngân sách" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng tổng hợp kết quả" });

  const res = CaptionListService.insertCaptionList(editor, { label: "Table" });
  assert.equal(res.success, true);

  const listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  assert.equal(listNodes.length, 1);
  const { node } = listNodes[0];

  assert.equal(node.attrs.label, "Table");
  assert.equal(node.attrs.title, "Danh mục bảng biểu");
  assert.equal(node.attrs.entries.length, 2);
  assert.equal(node.attrs.entries[0].number, 1);
  assert.equal(node.attrs.entries[0].labelAndNumber, "Table 1");
  assert.equal(node.attrs.entries[1].number, 2);
  assert.equal(node.attrs.entries[1].labelAndNumber, "Table 2");
});

test("Phase 2 Caption List: 3. Chèn Danh mục phương trình (List of Equations)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Equation", text: "Phương trình sóng dừng" });

  const res = CaptionListService.insertCaptionList(editor, { label: "Equation" });
  assert.equal(res.success, true);

  const listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Equation");
  assert.equal(listNodes.length, 1);
  const { node } = listNodes[0];

  assert.equal(node.attrs.title, "Danh mục phương trình");
  assert.equal(node.attrs.entries.length, 1);
  assert.equal(node.attrs.entries[0].labelAndNumber, "Equation 1");
  assert.equal(node.attrs.entries[0].text, "Phương trình sóng dừng");
});

test("Phase 2 Caption List: 4. Hỗ trợ nhãn tùy chỉnh (Custom Caption Label)", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Sơ đồ", text: "Sơ đồ mạng nơ-ron" });
  CaptionService.insertCaption(editor, { label: "Sơ đồ", text: "Sơ đồ khối vi xử lý" });

  const res = CaptionListService.insertCaptionList(editor, { label: "Sơ đồ" });
  assert.equal(res.success, true);

  const listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Sơ đồ");
  assert.equal(listNodes.length, 1);
  const { node } = listNodes[0];

  assert.equal(node.attrs.title, "Danh mục Sơ đồ");
  assert.equal(node.attrs.entries.length, 2);
  assert.equal(node.attrs.entries[0].label, "Sơ đồ");
  assert.equal(node.attrs.entries[0].labelAndNumber, "Sơ đồ 1");
  assert.equal(node.attrs.entries[1].labelAndNumber, "Sơ đồ 2");
});

test("Phase 2 Caption List: 5. Lọc đúng nhãn (Label Filtering không lẫn lộn)", () => {
  const editor = createTestEditor();

  // Trộn lẫn các nhãn khác nhau
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng 1" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 2" });
  CaptionService.insertCaption(editor, { label: "Equation", text: "Công thức 1" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng 2" });

  // Danh mục Figure chỉ chứa Figure
  const figureEntries = CaptionListService.generateEntries(editor.state.doc, "Figure");
  assert.equal(figureEntries.length, 2);
  assert.equal(figureEntries[0].label, "Figure");
  assert.equal(figureEntries[1].label, "Figure");
  assert.equal(figureEntries[0].number, 1);
  assert.equal(figureEntries[1].number, 2);

  // Danh mục Table chỉ chứa Table
  const tableEntries = CaptionListService.generateEntries(editor.state.doc, "Table");
  assert.equal(tableEntries.length, 2);
  assert.equal(tableEntries[0].label, "Table");
  assert.equal(tableEntries[1].label, "Table");
  assert.equal(tableEntries[0].number, 1);
  assert.equal(tableEntries[1].number, 2);

  // Danh mục Equation chỉ chứa Equation
  const eqEntries = CaptionListService.generateEntries(editor.state.doc, "Equation");
  assert.equal(eqEntries.length, 1);
  assert.equal(eqEntries[0].label, "Equation");
});

test("Phase 2 Caption List: 6. Number Resolution: Tự động đánh số lại khi xóa caption ở giữa", () => {
  const editor = createTestEditor();

  const c1 = CaptionService.insertCaption(editor, { label: "Figure", text: "Ảnh A" });
  const c2 = CaptionService.insertCaption(editor, { label: "Figure", text: "Ảnh B" });
  const c3 = CaptionService.insertCaption(editor, { label: "Figure", text: "Ảnh C" });

  CaptionListService.insertCaptionList(editor, { label: "Figure" });

  // Kiểm tra trước khi xóa
  let listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(listNodes[0].node.attrs.entries.length, 3);
  assert.equal(listNodes[0].node.attrs.entries[1].text, "Ảnh B");

  // Xóa caption thứ 2 (c2)
  const delRes = CaptionService.deleteCaption(editor, c2.captionId!);
  assert.equal(delRes.success, true);

  // Cập nhật danh mục
  const updateRes = CaptionListService.updateCaptionList(editor, { label: "Figure" });
  assert.equal(updateRes.success, true);
  assert.equal(updateRes.updatedCount, 1);

  // Kiểm tra sau khi cập nhật: danh mục chỉ còn 2 mục và được renumber thành 1 và 2
  listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  const entries = listNodes[0].node.attrs.entries;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].captionId, c1.captionId);
  assert.equal(entries[0].number, 1);
  assert.equal(entries[0].labelAndNumber, "Figure 1");
  assert.equal(entries[0].text, "Ảnh A");

  assert.equal(entries[1].captionId, c3.captionId);
  assert.equal(entries[1].number, 2);
  assert.equal(entries[1].labelAndNumber, "Figure 2");
  assert.equal(entries[1].text, "Ảnh C");
});

test("Phase 2 Caption List: 7. Thứ tự mục tuân thủ chính xác thứ tự xuất hiện trong Document AST", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Vị trí 1" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Vị trí 2" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Vị trí 3" });

  const entries = CaptionListService.generateEntries(editor.state.doc, "Figure");
  assert.equal(entries.length, 3);
  assert.equal(entries[0].text, "Vị trí 1");
  assert.equal(entries[1].text, "Vị trí 2");
  assert.equal(entries[2].text, "Vị trí 3");
});

test("Phase 2 Caption List: 8. Empty State: Xử lý an toàn khi không có Caption nào", () => {
  const editor = createTestEditor();

  // Không có caption nào trong tài liệu
  const entries = CaptionListService.generateEntries(editor.state.doc, "Figure");
  assert.deepEqual(entries, []);

  // Chèn danh mục rỗng không gây crash
  const res = CaptionListService.insertCaptionList(editor, { label: "Figure" });
  assert.equal(res.success, true);

  const listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  assert.equal(listNodes.length, 1);
  assert.equal(listNodes[0].node.attrs.entries.length, 0);
});

test("Phase 2 Caption List: 9. Broken Target Policy: Caption còn nhưng target bị mất", () => {
  const editor = createTestEditor();

  // Gắn caption có targetId là một object giả định
  CaptionService.insertCaption(editor, {
    label: "Figure",
    text: "Caption đối tượng bị mất",
    targetId: "ref_obj_image_orphan_999",
  });

  // Caption List vẫn tạo mục hợp lệ dựa trên caption node trong AST
  const entries = CaptionListService.generateEntries(editor.state.doc, "Figure");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].targetId, "ref_obj_image_orphan_999");
  assert.equal(entries[0].number, 1);
  assert.equal(entries[0].text, "Caption đối tượng bị mất");

  // Điều hướng vẫn đưa con trỏ tới vị trí của Caption node mà không bị crash
  const navRes = CaptionService.navigateToCaption(editor, entries[0].captionId);
  assert.equal(navRes.success, true);
});

test("Phase 2 Caption List: 10. Page-Number Resolver: Tích hợp chuẩn xác PageLayoutMap", () => {
  const editor = createTestEditor();

  // Tạo tài liệu có 2 caption
  CaptionService.insertCaption(editor, { label: "Figure", text: "Trang 1" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Trang 2" });

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const entries = CaptionListService.generateEntries(editor.state.doc, "Figure", layoutMap);

  assert.equal(entries.length, 2);
  assert.equal(typeof entries[0].pageNumber, "number");
  assert.equal(typeof entries[1].pageNumber, "number");
  assert.ok(entries[0].pageNumber! >= 1);
  assert.ok(entries[1].pageNumber! >= 1);
});

test("Phase 2 Caption List: 11. Stable Semantic IDs: Giữ vững định danh bền vững", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng dữ liệu" });
  const res = CaptionListService.insertCaptionList(editor, { label: "Table" });

  const listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  const node = listNodes[0].node;

  assert.ok(node.attrs.id.startsWith("ref_clist_table_"));
  assert.ok(node.attrs.entries[0].captionId.startsWith("ref_cap_table_"));

  // Cập nhật không làm thay đổi ID của list node
  const listIdBefore = node.attrs.id;
  CaptionListService.updateCaptionList(editor, { label: "Table" });

  const listNodesAfter = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  assert.equal(listNodesAfter[0].node.attrs.id, listIdBefore);
});

test("Phase 2 Caption List: 12. Multiple Independent Lists: Đồng tồn tại độc lập trong cùng tài liệu", () => {
  const editor = createTestEditor();

  // Chèn cả Figure và Table
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng 1" });

  // Chèn 2 danh mục độc lập
  const resFig = CaptionListService.insertCaptionList(editor, { label: "Figure" });
  const resTab = CaptionListService.insertCaptionList(editor, { label: "Table" });

  assert.equal(resFig.success, true);
  assert.equal(resTab.success, true);

  let figLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  let tabLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");

  assert.equal(figLists.length, 1);
  assert.equal(tabLists.length, 1);
  assert.notEqual(figLists[0].node.attrs.id, tabLists[0].node.attrs.id);

  // Thêm mới 1 Figure và cập nhật riêng danh mục Figure
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 2" });
  CaptionListService.updateCaptionList(editor, { label: "Figure" });

  figLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  tabLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");

  // Danh mục Figure được cập nhật lên 2 mục
  assert.equal(figLists[0].node.attrs.entries.length, 2);
  // Danh mục Table vẫn giữ nguyên 1 mục, không bị nhiễm bẩn chéo
  assert.equal(tabLists[0].node.attrs.entries.length, 1);
});

test("Phase 2 Caption List: 13. AST Source of Truth: Bảo toàn cấu trúc qua chu trình JSON Serialization", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình thử nghiệm" });
  CaptionListService.insertCaptionList(editor, {
    label: "Figure",
    title: "Danh mục minh họa đặc thù",
    preset: "modern",
  });

  const json = editor.getJSON();
  const captionListNode = json.content?.find((n) => n.type === "captionList");

  assert.ok(captionListNode);
  assert.equal(captionListNode.attrs?.label, "Figure");
  assert.equal(captionListNode.attrs?.title, "Danh mục minh họa đặc thù");
  assert.equal(captionListNode.attrs?.preset, "modern");
  assert.equal(captionListNode.attrs?.entries?.length, 1);

  // Nạp lại vào editor mới
  const newEditor = createTestEditor(json);
  const reloadedLists = CaptionListService.findCaptionListNodes(newEditor.state.doc, "Figure");
  assert.equal(reloadedLists.length, 1);
  assert.equal(reloadedLists[0].node.attrs.title, "Danh mục minh họa đặc thù");
  assert.equal(reloadedLists[0].node.attrs.entries.length, 1);
});

test("Phase 2 Caption List: 14. Render Safety: NodeView không dispatch transaction trong render", () => {
  const editor = createTestEditor();
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình an toàn render" });
  CaptionListService.insertCaptionList(editor, { label: "Figure" });

  const listNodes = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  const node = listNodes[0].node;

  // Lấy schema và extension definition
  const ext = getEditorExtensions().find((e) => e.name === "captionList") as any;
  assert.ok(ext);

  const nodeViewFactory = ext.config.addNodeView.call({ name: "captionList" });
  const nodeView = nodeViewFactory({ node, editor });

  // NodeView trả về dom và update method hợp lệ
  assert.ok(nodeView.dom);
  assert.equal(typeof nodeView.update, "function");

  // Gọi update không làm ném lỗi và không dispatch transaction
  const stateDocSizeBefore = editor.state.doc.nodeSize;
  const updated = nodeView.update(node);
  assert.equal(updated, true);
  assert.equal(editor.state.doc.nodeSize, stateDocSizeBefore);
});
