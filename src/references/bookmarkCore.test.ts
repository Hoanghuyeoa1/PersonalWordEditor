import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { BookmarkService } from "./services/bookmarkService.ts";

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
          content: [{ type: "text", text: "Văn bản thử nghiệm Bookmark Engine Phase 5." }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ: PHASE 5 — BOOKMARK SEMANTIC CORE
   ========================================================================== */

test("Phase 5 Bookmarks: 1. Position Bookmark (Caret-only inline atom node)", () => {
  const editor = createTestEditor();

  // Đặt con trỏ tại vị trí 10 (selection rỗng)
  editor.commands.setTextSelection(10);
  assert.equal(editor.state.selection.empty, true);

  const res = BookmarkService.createBookmark(editor, { name: "Điểm ghi nhớ đầu trang" });
  assert.equal(res.success, true);
  assert.ok(res.bookmark);
  assert.equal(res.bookmark.type, "position");
  assert.equal(res.bookmark.name, "Điểm ghi nhớ đầu trang");
  assert.ok(res.bookmark.id.startsWith("ref_bookmark_"));

  const all = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(all.length, 1);
  assert.equal(all[0].type, "position");
  assert.equal(all[0].bookmark.name, "Điểm ghi nhớ đầu trang");
  assert.equal(all[0].bookmark.id, res.bookmark.id);

  // Xác minh node trong AST là bookmarkAnchor
  let foundNode = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "bookmarkAnchor") {
      foundNode = true;
      assert.equal(node.attrs.id, res.bookmark!.id);
      assert.equal(node.attrs.name, "Điểm ghi nhớ đầu trang");
    }
  });
  assert.equal(foundNode, true);
});

test("Phase 5 Bookmarks: 2. Range Bookmark (Selection-based semantic mark)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Học tập và nghiên cứu công nghệ mới." }],
      },
    ],
  });

  // Chọn khoảng văn bản "nghiên cứu công nghệ" (vị trí 10 đến 30)
  editor.commands.setTextSelection({ from: 10, to: 30 });
  assert.equal(editor.state.selection.empty, false);

  const res = BookmarkService.createBookmark(editor, { name: "Chủ đề chính" });
  assert.equal(res.success, true);
  assert.ok(res.bookmark);
  assert.equal(res.bookmark.type, "range");
  assert.equal(res.bookmark.name, "Chủ đề chính");

  const all = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(all.length, 1);
  assert.equal(all[0].type, "range");
  assert.equal(all[0].bookmark.name, "Chủ đề chính");
  assert.ok(all[0].text.includes("nghiên cứu"));

  // Xác minh mark trong AST là bookmark
  let foundMark = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks) {
      const bm = node.marks.find((m) => m.type.name === "bookmark");
      if (bm) {
        foundMark = true;
        assert.equal(bm.attrs.id, res.bookmark!.id);
        assert.equal(bm.attrs.name, "Chủ đề chính");
      }
    }
  });
  assert.equal(foundMark, true);
});

test("Phase 5 Bookmarks: 3. Stable ID & Rename không thay đổi ID định danh", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(5);

  const createRes = BookmarkService.createBookmark(editor, { name: "Tên ban đầu" });
  assert.equal(createRes.success, true);
  const originalId = createRes.bookmark!.id;

  // Đổi tên Bookmark
  const renameRes = BookmarkService.renameBookmark(editor, originalId, "Tên mới đã cập nhật");
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.bookmark?.id, originalId, "ID phải tuyệt đối giữ nguyên khi đổi tên");
  assert.equal(renameRes.bookmark?.name, "Tên mới đã cập nhật");

  // Kiểm tra tra cứu theo ID và Tên mới
  const byId = BookmarkService.findBookmarkById(editor.state.doc, originalId);
  assert.ok(byId);
  assert.equal(byId.bookmark.name, "Tên mới đã cập nhật");

  const byName = BookmarkService.findBookmarkByName(editor.state.doc, "Tên mới đã cập nhật");
  assert.ok(byName);
  assert.equal(byName.bookmark.id, originalId);
});

test("Phase 5 Bookmarks: 4. Name Validation (Rỗng, khoảng trắng thừa & trùng lặp tên)", () => {
  const editor = createTestEditor();

  // 1. Tên rỗng hoặc toàn dấu cách
  const emptyRes = BookmarkService.createBookmark(editor, { name: "   " });
  assert.equal(emptyRes.success, false);
  assert.ok(emptyRes.error?.includes("trống"));

  // 2. Tạo bookmark hợp lệ
  const validRes = BookmarkService.createBookmark(editor, { name: "  Chương 1  " });
  assert.equal(validRes.success, true);
  assert.equal(validRes.bookmark?.name, "Chương 1", "Tên phải được trim sạch sẽ");

  // 3. Trùng lặp tên (không phân biệt hoa/thường)
  const dupRes = BookmarkService.createBookmark(editor, { name: "chương 1" });
  assert.equal(dupRes.success, false);
  assert.ok(dupRes.error?.includes("đã tồn tại"));
});

test("Phase 5 Bookmarks: 5. Unicode / Tiếng Việt có dấu và Emoji phong phú", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(3);

  const unicodeName = "Mục 2.3 — Kế hoạch Triển khai & Đánh giá 🚀";
  const res = BookmarkService.createBookmark(editor, { name: unicodeName });
  assert.equal(res.success, true);
  assert.equal(res.bookmark?.name, unicodeName);

  const retrieved = BookmarkService.findBookmarkByName(editor.state.doc, unicodeName);
  assert.ok(retrieved);
  assert.equal(retrieved.bookmark.name, unicodeName);
});

test("Phase 5 Bookmarks: 6. Edit Safety: Chèn text phía trước không làm hỏng vị trí (No Stale Offsets)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dòng số một." }],
      },
    ],
  });

  // Tạo Position Bookmark tại vị trí 5
  editor.commands.setTextSelection(5);
  const res = BookmarkService.createBookmark(editor, { name: "Điểm neo A" });
  assert.equal(res.success, true);
  const bmId = res.bookmark!.id;

  let loc = BookmarkService.findBookmarkById(editor.state.doc, bmId);
  assert.ok(loc);
  const initialFrom = loc.from;

  // Chèn một đoạn văn bản dài 30 ký tự vào ĐẦU tài liệu (vị trí 1)
  const prefixText = "ĐOẠN VĂN MỚI ĐƯỢC CHÈN VÀO TRƯỚC ";
  editor.view.dispatch(editor.state.tr.insertText(prefixText, 1));

  // Tra cứu lại vị trí từ AST: Vị trí tự động dịch chuyển mà không lưu stale offset!
  loc = BookmarkService.findBookmarkById(editor.state.doc, bmId);
  assert.ok(loc);
  assert.equal(loc.from, initialFrom + prefixText.length);
});

test("Phase 5 Bookmarks: 7. Edit Safety: Gõ chữ bên trong Range Bookmark mở rộng phạm vi tự nhiên", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Xin chào thế giới tươi đẹp." }],
      },
    ],
  });

  // Chọn "thế giới" (vị trí 10 đến 18)
  editor.commands.setTextSelection({ from: 10, to: 18 });
  const res = BookmarkService.createBookmark(editor, { name: "Thế giới" });
  assert.equal(res.success, true);

  let loc = BookmarkService.findBookmarkById(editor.state.doc, res.bookmark!.id);
  assert.ok(loc);
  assert.equal(loc.text, "thế giới");

  // Chèn thêm từ "tuyệt vời " vào giữa "thế " và "giới" (vị trí 14)
  editor.view.dispatch(editor.state.tr.insertText("tuyệt vời ", 14));

  loc = BookmarkService.findBookmarkById(editor.state.doc, res.bookmark!.id);
  assert.ok(loc);
  assert.equal(loc.text, "thế tuyệt vời giới");
});

test("Phase 5 Bookmarks: 8. Delete Bookmarked Text Policy: Tự động dọn dẹp khi text bị xóa sạch (Self-pruning)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Phần văn bản này sắp bị xóa." }],
      },
    ],
  });

  // Đặt range bookmark trên "này sắp bị xóa" (vị trí 14 đến 28)
  editor.commands.setTextSelection({ from: 14, to: 28 });
  const res = BookmarkService.createBookmark(editor, { name: "Xóa tôi đi" });
  assert.equal(res.success, true);
  const bmId = res.bookmark!.id;

  let loc = BookmarkService.findBookmarkById(editor.state.doc, bmId);
  assert.ok(loc);

  // Xóa toàn bộ đoạn văn bản chứa bookmark
  editor.view.dispatch(editor.state.tr.delete(1, 29));

  // Policy: Bookmark tự động dọn dẹp khỏi AST, không lưu giữ dangling offset hỏng!
  loc = BookmarkService.findBookmarkById(editor.state.doc, bmId);
  assert.equal(loc, null, "Bookmark phải tự động dọn dẹp khi text neo bị xóa hoàn toàn");

  const resolved = BookmarkService.resolveAnchor(editor.state.doc, bmId);
  assert.equal(resolved, null);
});

test("Phase 5 Bookmarks: 9. Xóa một phần văn bản Range: Bookmark co lại tự nhiên", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Một hai ba bốn năm." }],
      },
    ],
  });

  // Range trên "hai ba bốn" (vị trí 5 đến 15)
  editor.commands.setTextSelection({ from: 5, to: 15 });
  const res = BookmarkService.createBookmark(editor, { name: "Đếm số" });
  assert.equal(res.success, true);

  // Xóa từ "ba " ở giữa
  editor.view.dispatch(editor.state.tr.delete(9, 12));

  const loc = BookmarkService.findBookmarkById(editor.state.doc, res.bookmark!.id);
  assert.ok(loc);
  assert.equal(loc.text, "hai bốn");
});

test("Phase 5 Bookmarks: 10. Mark Coexistence: Cùng tồn tại với Comment (Comment Mark)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản có cả bình luận lẫn thẻ đánh dấu." }],
      },
    ],
  });

  // 1. Gắn comment mark
  const commentType = editor.schema.marks.comment;
  assert.ok(commentType);
  editor.view.dispatch(
    editor.state.tr.addMark(1, 20, commentType.create({ commentId: "ref_comment_sample_1" }))
  );

  // 2. Gắn bookmark mark trên cùng vùng [1, 20]
  editor.commands.setTextSelection({ from: 1, to: 20 });
  const res = BookmarkService.createBookmark(editor, { name: "Bookmark cùng Comment" });
  assert.equal(res.success, true);

  // 3. Kiểm tra văn bản đồng thời mang cả 2 marks
  let hasBoth = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks) {
      const hasComment = node.marks.some((m) => m.type.name === "comment");
      const hasBookmark = node.marks.some((m) => m.type.name === "bookmark");
      if (hasComment && hasBookmark) {
        hasBoth = true;
      }
    }
  });
  assert.equal(hasBoth, true, "Comment và Bookmark phải cùng tồn tại hòa hợp trên text");
});

test("Phase 5 Bookmarks: 11. Mark Coexistence: Cùng tồn tại với Track Changes (TrackChange Mark)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản sửa đổi được theo dõi." }],
      },
    ],
  });

  const tcType = editor.schema.marks.trackChange;
  if (tcType) {
    editor.view.dispatch(
      editor.state.tr.addMark(1, 15, tcType.create({ id: "tc_123", type: "insert" }))
    );

    editor.commands.setTextSelection({ from: 1, to: 15 });
    const res = BookmarkService.createBookmark(editor, { name: "Bookmark cùng TrackChange" });
    assert.equal(res.success, true);

    let hasBoth = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks) {
        const hasTc = node.marks.some((m) => m.type.name === "trackChange");
        const hasBm = node.marks.some((m) => m.type.name === "bookmark");
        if (hasTc && hasBm) hasBoth = true;
      }
    });
    assert.equal(hasBoth, true);
  }
});

test("Phase 5 Bookmarks: 12. Mark Coexistence: Cùng tồn tại với Bold, Italic, Link (Formatting Marks)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản định dạng phức hợp." }],
      },
    ],
  });

  // Gắn Bold và Link
  const boldType = editor.schema.marks.bold;
  const linkType = editor.schema.marks.link;
  editor.view.dispatch(editor.state.tr.addMark(1, 15, boldType.create()));
  editor.view.dispatch(editor.state.tr.addMark(1, 15, linkType.create({ href: "https://example.com" })));

  // Gắn Bookmark
  editor.commands.setTextSelection({ from: 1, to: 15 });
  const res = BookmarkService.createBookmark(editor, { name: "Bookmark Formatting" });
  assert.equal(res.success, true);

  let hasAllThree = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks) {
      const hasBold = node.marks.some((m) => m.type.name === "bold");
      const hasLink = node.marks.some((m) => m.type.name === "link");
      const hasBm = node.marks.some((m) => m.type.name === "bookmark");
      if (hasBold && hasLink && hasBm) hasAllThree = true;
    }
  });
  assert.equal(hasAllThree, true, "Bold, Link và Bookmark phải cùng tồn tại nguyên vẹn");
});

test("Phase 5 Bookmarks: 13. Navigation an toàn: Di chuyển con trỏ mà không làm mutate AST", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(12);

  const res = BookmarkService.createBookmark(editor, { name: "Mục cần nhảy tới" });
  assert.equal(res.success, true);

  const docBefore = JSON.stringify(editor.getJSON());

  // Di chuyển con trỏ ra chỗ khác
  editor.commands.setTextSelection(1);

  // Điều hướng tới bookmark
  const navSuccess = BookmarkService.navigateToBookmark(editor, "Mục cần nhảy tới");
  assert.equal(navSuccess, true);

  const docAfter = JSON.stringify(editor.getJSON());
  assert.equal(docBefore, docAfter, "Thao tác Navigation tuyệt đối không mutate cấu trúc AST");
});

test("Phase 5 Bookmarks: 14. Hoàn tác (Undo) và Làm lại (Redo) tạo Bookmark", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(5);

  const res = BookmarkService.createBookmark(editor, { name: "Thử nghiệm Undo" });
  assert.equal(res.success, true);
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 1);

  // Undo tạo bookmark
  editor.commands.undo();
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 0);

  // Redo khôi phục bookmark
  editor.commands.redo();
  const restored = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].bookmark.name, "Thử nghiệm Undo");
  assert.equal(restored[0].bookmark.id, res.bookmark!.id);
});
