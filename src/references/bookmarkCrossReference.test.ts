import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { BookmarkService } from "./services/bookmarkService.ts";
import { CrossReferenceService } from "./services/crossReferenceService.ts";
import { HeadingService } from "./services/headingService.ts";
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
          content: [
            {
              type: "text",
              text: "Văn bản mẫu kiểm tra tích hợp Cross-reference và Bookmark trong Personal Word Editor.",
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
   BỘ KIỂM THỬ: PHASE 7 — BOOKMARK CROSS-REFERENCE INTEGRATION
   ========================================================================== */

test("Phase 7 Cross-Ref: 1. Target Enumeration (Liệt kê chính xác Bookmarks trong GetAvailableTargets)", () => {
  const editor = createTestEditor();

  // Tạo 1 Position Bookmark tại caret
  editor.commands.setTextSelection(10);
  const posRes = BookmarkService.createBookmark(editor, { name: "DiemDau" });
  assert.equal(posRes.success, true);

  // Tạo 1 Range Bookmark trên selection
  editor.commands.setTextSelection({ from: 20, to: 40 });
  const rangeRes = BookmarkService.createBookmark(editor, { name: "VungChonChinh" });
  assert.equal(rangeRes.success, true);

  // Lấy targets thuộc loại 'bookmark'
  const targets = CrossReferenceService.getAvailableTargets(editor.state.doc, "bookmark");
  assert.equal(targets.length, 2);

  const posTarget = targets.find((t) => t.id === posRes.bookmark!.id);
  assert.ok(posTarget);
  assert.equal(posTarget.type, "bookmark");
  assert.equal(posTarget.title, "DiemDau");
  assert.equal(posTarget.text, "DiemDau"); // Position fallback to name
  assert.equal(posTarget.pos, 10);

  const rangeTarget = targets.find((t) => t.id === rangeRes.bookmark!.id);
  assert.ok(rangeTarget);
  assert.equal(rangeTarget.type, "bookmark");
  assert.equal(rangeTarget.title, "VungChonChinh");
  assert.ok(rangeTarget.text.length > 0);

  editor.destroy();
});

test("Phase 7 Cross-Ref: 2. Range Bookmark Text Resolution (Phân giải chính xác nội dung bôi đen)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tìm hiểu về " },
          { type: "text", text: "Kiến trúc Clean Architecture" },
          { type: "text", text: " trong ứng dụng hiện đại." },
        ],
      },
    ],
  });

  // Gắn Range Bookmark trên cụm từ "Kiến trúc Clean Architecture"
  editor.commands.setTextSelection({ from: 13, to: 41 });
  const bmRes = BookmarkService.createBookmark(editor, { name: "CleanArchBookmark" });
  assert.equal(bmRes.success, true);

  // Phân giải tham chiếu chéo với format="text"
  const resolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: bmRes.bookmark!.id,
    targetType: "bookmark",
    format: "text",
  });

  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "Kiến trúc Clean Architecture");

  // Chèn node crossReference vào cuối tài liệu
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const insRes = CrossReferenceService.insertCrossReference(editor, {
    targetId: bmRes.bookmark!.id,
    targetType: "bookmark",
    format: "text",
  });
  assert.equal(insRes.success, true);

  // Xác minh node crossReference tồn tại trong AST với customText đúng
  let foundCross = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "crossReference") {
      foundCross = true;
      assert.equal(node.attrs.targetId, bmRes.bookmark!.id);
      assert.equal(node.attrs.targetType, "bookmark");
      assert.equal(node.attrs.format, "text");
      assert.equal(node.attrs.customText, "Kiến trúc Clean Architecture");
    }
  });
  assert.equal(foundCross, true);

  editor.destroy();
});

test("Phase 7 Cross-Ref: 3. Position Bookmark Text Fallback (Không sinh hidden text, fallback sang tên)", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection(8);
  const bmRes = BookmarkService.createBookmark(editor, { name: "Cột Mốc 1" });
  assert.equal(bmRes.success, true);

  // Position bookmark không có text bôi đen -> fallback hiển thị tên thẻ
  const resolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: bmRes.bookmark!.id,
    targetType: "bookmark",
    format: "text",
  });

  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "Cột Mốc 1");

  editor.destroy();
});

test("Phase 7 Cross-Ref: 4. Page Number Resolution (Tính số trang thực qua Page Engine / PageLayoutMap)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 1: Nội dung mở đầu tài liệu." }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 2: Điểm neo quan trọng cần tham chiếu số trang." }],
      },
    ],
  });

  // Đặt bookmark tại đoạn văn ở Trang 2
  const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size);
  const trang2Pos = editor.state.doc.content.size - 20;
  editor.commands.setTextSelection(trang2Pos);

  const bmRes = BookmarkService.createBookmark(editor, { name: "DiemTrang2" });
  assert.equal(bmRes.success, true);

  // Xây dựng PageLayoutMap từ AST hiện tại
  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);

  // Phân giải Cross-Reference với format="pageNumber"
  const resolved = CrossReferenceService.resolveTarget(
    editor.state.doc,
    {
      targetId: bmRes.bookmark!.id,
      targetType: "bookmark",
      format: "pageNumber",
    },
    layoutMap
  );

  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "2", "Bookmark sau ngắt trang pageBreak phải phân giải đúng Trang 2");

  editor.destroy();
});

test("Phase 7 Cross-Ref: 5. Rename Bookmark: Giữ nguyên Stable ID, Cross-Reference vẫn giải quyết bình thường", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection({ from: 10, to: 25 });
  const bmRes = BookmarkService.createBookmark(editor, { name: "Tên Cũ" });
  const stableId = bmRes.bookmark!.id;

  // Chèn tham chiếu chéo tới bookmark
  const resolvedBefore = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: stableId,
    targetType: "bookmark",
    format: "text",
  });
  assert.equal(resolvedBefore.found, true);

  // Đổi tên Bookmark
  const renameRes = BookmarkService.renameBookmark(editor, stableId, "Tên Đã Đổi Mới");
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.bookmark?.id, stableId);

  // Tham chiếu chéo (vốn trỏ tới ID) vẫn tìm thấy mục tiêu an toàn
  const resolvedAfter = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: stableId,
    targetType: "bookmark",
    format: "text",
  });
  assert.equal(resolvedAfter.found, true);
  assert.equal(resolvedAfter.fullTitle, "Tên Đã Đổi Mới");

  editor.destroy();
});

test("Phase 7 Cross-Ref: 6. Delete Bookmark: Hiển thị an toàn [Reference not found], không xóa node", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection({ from: 10, to: 25 });
  const bmRes = BookmarkService.createBookmark(editor, { name: "Thẻ Sẽ Bị Xóa" });
  const bmId = bmRes.bookmark!.id;

  // Chèn crossReference node vào tài liệu
  editor.commands.setTextSelection(1);
  CrossReferenceService.insertCrossReference(editor, {
    targetId: bmId,
    targetType: "bookmark",
    format: "text",
  });

  // Xóa bookmark khỏi AST
  BookmarkService.removeBookmark(editor, bmId);
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 0);

  // Phân giải mục tiêu lúc này phải báo [Reference not found]
  const resolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: bmId,
    targetType: "bookmark",
    format: "text",
  });
  assert.equal(resolved.found, false);
  assert.equal(resolved.text, "[Reference not found]");

  // Cập nhật các trường tham chiếu (F9)
  const updRes = CrossReferenceService.updateAllCrossReferences(editor);
  assert.ok(updRes.updatedCount >= 1);

  // Node crossReference vẫn tồn tại trong tài liệu (không bị xóa mất)
  let crossNodeFound = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "crossReference") {
      crossNodeFound = true;
      assert.equal(node.attrs.targetId, bmId);
      assert.equal(node.attrs.customText, "[Reference not found]");
    }
  });
  assert.equal(crossNodeFound, true);

  editor.destroy();
});

test("Phase 7 Cross-Ref: 7. Undo Delete Bookmark: Khôi phục ID cũ, Cross-Reference tự động phân giải lại", () => {
  const editor = createTestEditor();
  editor.commands.setTextSelection({ from: 10, to: 30 });
  const bmRes = BookmarkService.createBookmark(editor, { name: "Thẻ Phục Hồi" });
  const bmId = bmRes.bookmark!.id;

  // Chèn crossReference node
  editor.commands.setTextSelection(1);
  CrossReferenceService.insertCrossReference(editor, {
    targetId: bmId,
    targetType: "bookmark",
    format: "text",
  });

  // Xóa Bookmark
  BookmarkService.removeBookmark(editor, bmId);
  assert.equal(
    CrossReferenceService.resolveTarget(editor.state.doc, {
      targetId: bmId,
      targetType: "bookmark",
      format: "text",
    }).found,
    false
  );

  // THAO TÁC QUAN TRỌNG: Undo thao tác xóa
  editor.commands.undo();

  // Bookmark đã phục hồi lại đúng ID
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc).length, 1);
  assert.equal(BookmarkService.extractBookmarks(editor.state.doc)[0].bookmark.id, bmId);

  // Cross-reference ngay lập tức giải quyết lại thành công
  const restoredResolve = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: bmId,
    targetType: "bookmark",
    format: "text",
  });
  assert.equal(restoredResolve.found, true);
  assert.ok(restoredResolve.text.length > 0);

  // F9 đồng bộ lại
  CrossReferenceService.updateAllCrossReferences(editor);
  editor.state.doc.descendants((node) => {
    if (node.type.name === "crossReference") {
      assert.notEqual(node.attrs.customText, "[Reference not found]");
    }
  });

  editor.destroy();
});

test("Phase 7 Cross-Ref: 8. Heading Coexistence: Bookmark trên Heading không làm đổi hay đè Heading ID", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "ref_heading_test_coexist", level: 1 },
        content: [{ type: "text", text: "Chương 1: Tổng quan lý thuyết" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung đoạn văn đầu tiên." }],
      },
    ],
  });

  // Đặt Range Bookmark bao phủ văn bản của Heading
  editor.commands.setTextSelection({ from: 1, to: 30 });
  const bmRes = BookmarkService.createBookmark(editor, { name: "BookmarkTrenHeading" });
  assert.equal(bmRes.success, true);

  // 1. Heading ID vẫn nguyên vẹn
  const headingNode = editor.state.doc.child(0);
  assert.equal(headingNode.type.name, "heading");
  assert.equal(headingNode.attrs.id, "ref_heading_test_coexist");

  // 2. Bookmark ID là ID riêng biệt
  assert.ok(bmRes.bookmark!.id.startsWith("ref_bookmark_"));
  assert.notEqual(bmRes.bookmark!.id, "ref_heading_test_coexist");

  // 3. Hai mục tiêu xuất hiện độc lập trong Cross-reference
  const headingTargets = CrossReferenceService.getAvailableTargets(editor.state.doc, "heading");
  const bookmarkTargets = CrossReferenceService.getAvailableTargets(editor.state.doc, "bookmark");

  assert.ok(headingTargets.some((h) => h.id === "ref_heading_test_coexist"));
  assert.ok(bookmarkTargets.some((b) => b.id === bmRes.bookmark!.id));

  // 4. Phân giải riêng biệt từng tham chiếu chéo
  const hResolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: "ref_heading_test_coexist",
    targetType: "heading",
    format: "text",
  });
  assert.equal(hResolved.found, true);
  assert.equal(hResolved.text, "Chương 1: Tổng quan lý thuyết");

  const bResolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: bmRes.bookmark!.id,
    targetType: "bookmark",
    format: "text",
  });
  assert.equal(bResolved.found, true);
  assert.equal(bResolved.text, "Chương 1: Tổng quan lý thuyết");

  editor.destroy();
});

test("Phase 7 Cross-Ref: 9. Bookmark in Table Cell: Neo và tham chiếu chéo chuẩn xác trong ô bảng", () => {
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
                    content: [{ type: "text", text: "Dữ liệu đo lường ô 1" }],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Giá trị định mức 99.5%" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  // Đặt bookmark tại ô thứ hai
  const docText = editor.state.doc.textContent;
  assert.ok(docText.includes("Giá trị định mức"));

  // Đặt con trỏ tại vị trí trong ô 2
  let cell2Pos = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text?.includes("Giá trị")) {
      cell2Pos = pos;
    }
  });
  editor.commands.setTextSelection({ from: cell2Pos, to: cell2Pos + 18 });
  const bmRes = BookmarkService.createBookmark(editor, { name: "GiaTriDinhMuc" });
  assert.equal(bmRes.success, true);

  // Phân giải Cross-Reference tới ô bảng
  const resolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: bmRes.bookmark!.id,
    targetType: "bookmark",
    format: "text",
  });

  assert.equal(resolved.found, true);
  assert.ok(resolved.text.includes("Giá trị"));

  // Điều hướng tới Bookmark trong bảng
  const navOk = CrossReferenceService.navigateToTarget(editor, bmRes.bookmark!.id, "bookmark");
  assert.equal(navOk.success, true);

  editor.destroy();
});

test("Phase 7 Cross-Ref: 10. Multiple Bookmarks & No Duplicate Target IDs", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn A: nội dung một." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn B: nội dung hai." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn C: nội dung ba." }],
      },
    ],
  });

  // Tạo 3 bookmarks khác nhau
  editor.commands.setTextSelection(3);
  const bm1 = BookmarkService.createBookmark(editor, { name: "BM_A" });
  editor.commands.setTextSelection(28);
  const bm2 = BookmarkService.createBookmark(editor, { name: "BM_B" });
  editor.commands.setTextSelection(50);
  const bm3 = BookmarkService.createBookmark(editor, { name: "BM_C" });

  assert.equal(bm1.success, true);
  assert.equal(bm2.success, true);
  assert.equal(bm3.success, true);

  const targets = CrossReferenceService.getAvailableTargets(editor.state.doc, "bookmark");
  assert.equal(targets.length, 3);

  // Đảm bảo không trùng lặp ID
  const idSet = new Set(targets.map((t) => t.id));
  assert.equal(idSet.size, targets.length, "Mỗi target ID phải tuyệt đối duy nhất");

  // Kiểm tra từng mục tiêu phân giải đúng tên
  for (const t of targets) {
    const res = CrossReferenceService.resolveTarget(editor.state.doc, {
      targetId: t.id,
      targetType: "bookmark",
      format: "text",
    });
    assert.equal(res.found, true);
    assert.equal(res.text, t.title);
  }

  editor.destroy();
});
