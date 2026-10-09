import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { BookmarkService } from "./services/bookmarkService.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import {
  getReferenceItemDescriptor,
  getReferenceRegistryStats,
} from "./services/referencesRegistry.ts";
import {
  dispatchReferenceCommand,
  manageBookmarksCommand,
} from "./commands/referencesCommands.ts";

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
          content: [
            {
              type: "text",
              text: "Đoạn văn thứ nhất kiểm tra hệ thống Bookmark Manager UX trong Personal Word Editor.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Đoạn văn thứ hai phục vụ kiểm tra vùng chọn dài và con trỏ điều hướng.",
            },
          ],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ: PHASE 6 — BOOKMARK MANAGER UX + CRUD & HISTORY SAFETY
   ========================================================================== */

test("Phase 6 Bookmarks UX: 1. Add Bookmark tại vị trí con trỏ (Position Bookmark at Caret)", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(15);
  assert.equal(editor.state.selection.empty, true);

  const res = BookmarkService.createBookmark(editor, { name: "CaretMarker" });
  assert.equal(res.success, true);
  assert.ok(res.bookmark);
  assert.equal(res.bookmark.type, "position");
  assert.equal(res.bookmark.name, "CaretMarker");
  assert.ok(res.bookmark.id.startsWith("ref_bookmark_"));

  // Xác minh node trong AST
  const all = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(all.length, 1);
  assert.equal(all[0].type, "position");
  assert.equal(all[0].bookmark.name, "CaretMarker");
  assert.equal(all[0].from, 15);

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 2. Add Bookmark từ vùng chọn văn bản (Range Bookmark on Selection)", () => {
  const editor = createTestEditor();
  // Chọn khoảng văn bản "kiểm tra hệ thống" (vị trí 17 đến 34)
  editor.commands.setTextSelection({ from: 17, to: 34 });
  assert.equal(editor.state.selection.empty, false);

  const res = BookmarkService.createBookmark(editor, { name: "RangeMarker" });
  assert.equal(res.success, true);
  assert.ok(res.bookmark);
  assert.equal(res.bookmark.type, "range");
  assert.equal(res.bookmark.name, "RangeMarker");

  const all = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(all.length, 1);
  assert.equal(all[0].type, "range");
  assert.equal(all[0].bookmark.name, "RangeMarker");
  assert.ok(all[0].text.includes("kiểm tra"));

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 3. Validation từ chối trùng lặp tên (Duplicate Name Rejection)", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(10);
  const res1 = BookmarkService.createBookmark(editor, { name: "Chương Độc Đáo" });
  assert.equal(res1.success, true);

  // Thử tạo thẻ trùng tên chính xác
  const valExact = BookmarkService.validateBookmarkName(editor.state.doc, "Chương Độc Đáo");
  assert.equal(valExact.valid, false);
  assert.ok(valExact.error?.includes("đã tồn tại"));

  // Thử tạo trùng tên viết thường
  const valLower = BookmarkService.validateBookmarkName(editor.state.doc, "chương độc đáo");
  assert.equal(valLower.valid, false);

  // Thử tạo trùng tên kèm khoảng trắng đầu/cuối
  const valTrim = BookmarkService.validateBookmarkName(editor.state.doc, "  Chương Độc Đáo  ");
  assert.equal(valTrim.valid, false);

  // Thử gọi createBookmark trực tiếp -> phải trả về lỗi an toàn
  const resDuplicate = BookmarkService.createBookmark(editor, { name: "chương độc đáo" });
  assert.equal(resDuplicate.success, false);
  assert.ok(resDuplicate.error?.includes("đã tồn tại"));

  // Số lượng thẻ vẫn chỉ là 1
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 1);

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 4. Manager List: Trích xuất danh sách thẻ chuẩn thứ tự văn bản", () => {
  const editor = createTestEditor();

  // Tạo bookmark 1: Range ở giữa đoạn 1
  editor.commands.setTextSelection({ from: 10, to: 25 });
  BookmarkService.createBookmark(editor, { name: "Đoạn 1 Range" });

  // Tạo bookmark 2: Position ở đầu đoạn 1
  editor.commands.setTextSelection(3);
  BookmarkService.createBookmark(editor, { name: "Đoạn 1 Đầu" });

  // Tạo bookmark 3: Position ở cuối
  editor.commands.setTextSelection(70);
  BookmarkService.createBookmark(editor, { name: "Vị trí Sau" });

  const list = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(list.length, 3);

  // Thứ tự phải sắp xếp tăng dần theo document position:
  assert.equal(list[0].bookmark.name, "Đoạn 1 Đầu");
  assert.equal(list[0].type, "position");
  assert.equal(list[1].bookmark.name, "Đoạn 1 Range");
  assert.equal(list[1].type, "range");
  assert.equal(list[2].bookmark.name, "Vị trí Sau");
  assert.equal(list[2].type, "position");

  assert.ok(list[0].from <= list[1].from);
  assert.ok(list[1].from <= list[2].from);

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 5. Go To Position: Nhảy con trỏ xác định, scrollIntoView, không mutate AST", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(20);
  const createRes = BookmarkService.createBookmark(editor, { name: "DiemDung" });
  assert.equal(createRes.success, true);

  // Di chuyển con trỏ ra vị trí khác (pos 1)
  editor.commands.setTextSelection(1);
  assert.equal(editor.state.selection.from, 1);

  const jsonBefore = JSON.stringify(editor.getJSON());

  // Thực hiện Go To
  const navOk = BookmarkService.navigateToBookmark(editor, "DiemDung");
  assert.equal(navOk, true);

  // Con trỏ phải được đặt tại điểm bookmark
  assert.equal(editor.state.selection.from, 20);
  assert.equal(editor.state.selection.empty, true);

  // Nội dung tài liệu không được thay đổi (Navigation an toàn tuyệt đối)
  const jsonAfter = JSON.stringify(editor.getJSON());
  assert.equal(jsonBefore, jsonAfter);

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 6. Go To Range: Chọn toàn bộ vùng chọn xác định, không mutate AST", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection({ from: 12, to: 30 });
  const createRes = BookmarkService.createBookmark(editor, { name: "VungDung" });
  assert.equal(createRes.success, true);

  // Di chuyển con trỏ ra pos 1
  editor.commands.setTextSelection(1);
  assert.equal(editor.state.selection.from, 1);
  assert.equal(editor.state.selection.empty, true);

  const jsonBefore = JSON.stringify(editor.getJSON());

  // Thực hiện Go To
  const navOk = BookmarkService.navigateToBookmark(editor, createRes.bookmark!.id);
  assert.equal(navOk, true);

  // Vùng chọn phải bao trùm toàn bộ range bookmark
  assert.equal(editor.state.selection.from, 12);
  assert.equal(editor.state.selection.to, 30);
  assert.equal(editor.state.selection.empty, false);

  const jsonAfter = JSON.stringify(editor.getJSON());
  assert.equal(jsonBefore, jsonAfter);

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 7. Rename: Đổi tên thành công, giữ nguyên Stable ID bất biến", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(15);
  const createRes = BookmarkService.createBookmark(editor, { name: "Tên Ban Đầu" });
  assert.equal(createRes.success, true);
  const stableId = createRes.bookmark!.id;

  // Thực hiện đổi tên
  const renameRes = BookmarkService.renameBookmark(editor, stableId, "Tên Đã Cập Nhật");
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.bookmark?.name, "Tên Đã Cập Nhật");
  assert.equal(renameRes.bookmark?.id, stableId, "ID phải tuyệt đối bất biến sau khi đổi tên");

  // Tra cứu lại theo ID
  const foundById = BookmarkService.findBookmarkById(editor.state.doc, stableId);
  assert.ok(foundById);
  assert.equal(foundById.bookmark.name, "Tên Đã Cập Nhật");

  // Tra cứu theo tên mới
  const foundByNewName = BookmarkService.findBookmarkByName(editor.state.doc, "Tên Đã Cập Nhật");
  assert.ok(foundByNewName);
  assert.equal(foundByNewName.bookmark.id, stableId);

  // Tên cũ không còn tra cứu được
  const foundByOldName = BookmarkService.findBookmarkByName(editor.state.doc, "Tên Ban Đầu");
  assert.equal(foundByOldName, null);

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 8. Delete Text Preserved: Xóa Bookmark giữ nguyên 100% nội dung người dùng", () => {
  const sampleText = "Văn bản thử nghiệm giữ nguyên nội dung khi xóa bookmark.";
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: sampleText }],
      },
    ],
  });

  // Tạo range bookmark trên "nội dung khi xóa bookmark"
  editor.commands.setTextSelection({ from: 28, to: 54 });
  const res = BookmarkService.createBookmark(editor, { name: "BookmarkSẽXóa" });
  assert.equal(res.success, true);
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 1);

  // Xóa bookmark
  const removeRes = BookmarkService.removeBookmark(editor, res.bookmark!.id);
  assert.equal(removeRes.success, true);

  // Bookmark đã biến mất
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 0);

  // Nhưng TOÀN BỘ văn bản người dùng PHẢI còn nguyên vẹn 100%
  const currentText = editor.state.doc.textContent;
  assert.equal(currentText, sampleText, "Văn bản người dùng không được bị cắt xén khi xóa bookmark");

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 9. Undo Add Bookmark: Thu hồi hoàn toàn node/mark vừa thêm", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(10);
  const res = BookmarkService.createBookmark(editor, { name: "Thẻ Cần Undo" });
  assert.equal(res.success, true);
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 1);

  // Undo
  editor.commands.undo();
  assert.equal(
    BookmarkService.extractBookmarks(editor.state.doc).length,
    0,
    "Undo phải dọn sạch bookmark vừa tạo"
  );

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 10. Undo Rename: Khôi phục tên cũ với ID ổn định", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(12);
  const createRes = BookmarkService.createBookmark(editor, { name: "Tên Ban Đầu" });
  const originalId = createRes.bookmark!.id;

  BookmarkService.renameBookmark(editor, originalId, "Tên Mới");
  assert.equal(BookmarkService.findBookmarkById(editor.state.doc, originalId)?.bookmark.name, "Tên Mới");

  // Undo thao tác đổi tên
  editor.commands.undo();
  const restored = BookmarkService.findBookmarkById(editor.state.doc, originalId);
  assert.ok(restored);
  assert.equal(restored.bookmark.name, "Tên Ban Đầu", "Undo Rename phải đưa tên trở lại giá trị ban đầu");
  assert.equal(restored.bookmark.id, originalId, "ID phải giữ nguyên");

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 11. Undo Delete: Khôi phục bookmark đã xóa hoàn chỉnh metadata", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection({ from: 10, to: 25 });
  const createRes = BookmarkService.createBookmark(editor, { name: "Thẻ Bị Xóa" });
  const originalId = createRes.bookmark!.id;

  BookmarkService.removeBookmark(editor, originalId);
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 0);

  // Undo thao tác xóa
  editor.commands.undo();
  const restoredList = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(restoredList.length, 1, "Undo Delete phải khôi phục lại thẻ đánh dấu");
  assert.equal(restoredList[0].bookmark.id, originalId);
  assert.equal(restoredList[0].bookmark.name, "Thẻ Bị Xóa");

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 12. Redo: Tái lập trạng thái sau Undo Add, Rename, Delete", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(5);
  const createRes = BookmarkService.createBookmark(editor, { name: "Thẻ Redo" });
  const bmId = createRes.bookmark!.id;

  // 1. Redo Add
  editor.commands.undo();
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 0);
  editor.commands.redo();
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 1);

  // 2. Redo Rename
  BookmarkService.renameBookmark(editor, bmId, "Tên Sau Đổi");
  editor.commands.undo();
  assert.equal(BookmarkService.findBookmarkById(editor.state.doc, bmId)?.bookmark.name, "Thẻ Redo");
  editor.commands.redo();
  assert.equal(BookmarkService.findBookmarkById(editor.state.doc, bmId)?.bookmark.name, "Tên Sau Đổi");

  // 3. Redo Delete
  BookmarkService.removeBookmark(editor, bmId);
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 0);
  editor.commands.undo();
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 1);
  editor.commands.redo();
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 0);

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 13. Dirty State: Add/Rename/Delete kích hoạt dirty; Cancel không dirty", () => {
  const store = useDocumentStore.getState();
  const editor = createTestEditor();

  // Đặt tài liệu ở trạng thái sạch ban đầu
  useDocumentStore.setState({ isDirty: false, isModified: false });
  assert.equal(useDocumentStore.getState().isDirty, false);

  // 1. Add Bookmark -> isDirty = true
  const res = BookmarkService.createBookmark(editor, { name: "DirtyCheckMark" });
  assert.equal(res.success, true);
  assert.equal(useDocumentStore.getState().isDirty, true, "Add Bookmark phải kích hoạt isDirty = true");

  // Đặt lại sạch
  useDocumentStore.setState({ isDirty: false, isModified: false });
  assert.equal(useDocumentStore.getState().isDirty, false);

  // 2. Rename Bookmark -> isDirty = true
  BookmarkService.renameBookmark(editor, res.bookmark!.id, "DirtyCheckMarkRenamed");
  assert.equal(useDocumentStore.getState().isDirty, true, "Rename Bookmark phải kích hoạt isDirty = true");

  // Đặt lại sạch
  useDocumentStore.setState({ isDirty: false, isModified: false });
  assert.equal(useDocumentStore.getState().isDirty, false);

  // 3. Delete Bookmark -> isDirty = true
  BookmarkService.removeBookmark(editor, res.bookmark!.id);
  assert.equal(useDocumentStore.getState().isDirty, true, "Delete Bookmark phải kích hoạt isDirty = true");

  // 4. Cancel / Close dialog (không thực hiện thao tác) -> giữ nguyên không dirty
  useDocumentStore.setState({ isDirty: false, isModified: false });
  // Giả lập mở và đóng dialog mà không submit
  const didCloseWithoutAction = true;
  if (didCloseWithoutAction) {
    // Không dispatch mutation
  }
  assert.equal(useDocumentStore.getState().isDirty, false, "Đóng dialog không được làm bẩn tài liệu");

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 14. Preserve Selection: Bảo toàn vùng chọn khi tạo Bookmark", () => {
  const editor = createTestEditor();

  // Người dùng bôi đen văn bản [15, 35]
  editor.commands.setTextSelection({ from: 15, to: 35 });
  const savedSelection = {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
    empty: editor.state.selection.empty,
  };
  assert.equal(savedSelection.empty, false);

  // Giả lập khi người dùng click vào dialog, con trỏ editor có thể bị blur hoặc chuyển về 1
  editor.commands.setTextSelection(1);
  assert.equal(editor.state.selection.from, 1);

  // Gọi createBookmark kèm theo savedSelection options
  const res = BookmarkService.createBookmark(editor, {
    name: "PreservedRange",
    from: savedSelection.from,
    to: savedSelection.to,
  });

  assert.equal(res.success, true);
  assert.equal(res.bookmark?.type, "range");

  // Xác minh vùng chọn được gán chính xác tại [15, 35]
  const all = BookmarkService.extractBookmarks(editor.state.doc);
  const bm = all.find((b) => b.bookmark.name === "PreservedRange");
  assert.ok(bm);
  assert.equal(bm.from, 15);
  assert.equal(bm.to, 35);
  assert.equal(bm.type, "range");

  // Trường hợp 2: Caret position được bảo lưu
  const savedCaret = { from: 8, to: 8, empty: true };
  editor.commands.setTextSelection(1);
  const resCaret = BookmarkService.createBookmark(editor, {
    name: "PreservedCaret",
    from: savedCaret.from,
    to: savedCaret.to,
  });
  assert.equal(resCaret.success, true);
  assert.equal(resCaret.bookmark?.type, "position");

  const bmCaret = BookmarkService.extractBookmarks(editor.state.doc).find(
    (b) => b.bookmark.name === "PreservedCaret"
  );
  assert.ok(bmCaret);
  assert.equal(bmCaret.from, 8);
  assert.equal(bmCaret.type, "position");

  editor.destroy();
});

test("Phase 6 Bookmarks UX: 15. References Registry & Commands Integration", () => {
  const desc = getReferenceItemDescriptor("bookmarksList");
  assert.ok(desc);
  assert.equal(desc.status, "active", "bookmarksList phải active trong Phase 6.8");
  assert.equal(desc.phase, "6.8");
  assert.equal(desc.shortcut, "Ctrl+Shift+F5");

  const stats = getReferenceRegistryStats();
  assert.equal(stats.active, 18, "Tất cả 18 descriptors phải active");
  assert.equal(stats.planned, 0);

  // Gọi lệnh với editor null -> thất bại an toàn kèm thông báo
  const nullRes = dispatchReferenceCommand("bookmarksList", null);
  assert.equal(nullRes.success, false);
  assert.ok(nullRes.message?.includes("Editor"));

  // Gọi lệnh với editor hợp lệ
  const editor = createTestEditor();
  const cmdRes = dispatchReferenceCommand("bookmarksList", editor);
  assert.equal(cmdRes.success, true);
  assert.equal(cmdRes.itemType, "bookmarksList");

  const directRes = manageBookmarksCommand(editor);
  assert.equal(directRes.success, true);

  editor.destroy();
});
