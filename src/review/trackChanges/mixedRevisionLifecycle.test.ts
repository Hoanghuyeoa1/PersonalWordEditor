import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import {
  ensureEditorPlugins,
  toggleBold,
  setFontSize,
  setTextColor,
  setTextAlign,
  undo,
  redo,
  acceptAllChanges,
  rejectAllChanges,
  acceptAllFormatting,
  rejectAllFormatting,
} from "../../editor/editorCommands.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm cho Phase 7 Mixed Revision Lifecycle." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. INSERT / DELETE / FORMAT COEXISTENCE
// -----------------------------------------------------------------------------
test("PHASE 7 — 1. Coexistence: Typing -> Insert, Deleting -> Delete, Formatting -> Format", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra coexistence ba loại revision." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Format revision: "Đoạn văn" -> Bold
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  toggleBold(editor);

  // 2. Delete revision: "kiểm tra " -> Delete
  editor.chain().setTextSelection({ from: 9, to: 18 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  // 3. Insert revision: Chèn văn bản mới ở cuối
  const endPos = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endPos, endPos, " [chèn thêm]");

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 3, "Phải có đúng 3 revision đang chờ duyệt");

  const types = new Set(changes.map((c) => c.type));
  assert.ok(types.has("format"), "Phải có format revision");
  assert.ok(types.has("delete"), "Phải có delete revision");
  assert.ok(types.has("insert"), "Phải có insert revision");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 2. FORMATTING WITHIN TRACKED INSERTION
// -----------------------------------------------------------------------------
test("PHASE 7 — 2.1 Formatting in tracked insertion -> Accept insertion retains format revision", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Gốc: " }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chèn text mới: "nội dung chèn mới"
  TrackChangesService.applyTrackedTextInput(editor, 6, 6, "nội dung chèn mới");
  const insList = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(insList.length, 1);
  const insId = insList[0].id;

  // Format một phần của inserted text ("chèn mới" -> Bold)
  // "Gốc: " (1..6), "nội dung " (6..15), "chèn mới" (15..23)
  editor.chain().setTextSelection({ from: 15, to: 23 }).run();
  toggleBold(editor);

  const changesAfterFmt = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterFmt.length, 2, "Cả insert và format đều tồn tại");
  const fmtRev = changesAfterFmt.find((c) => c.type === "format")!;
  assert.ok(fmtRev, "Format revision phải tồn tại");

  // Chấp nhận Insertion: text được giữ lại, mark insert bị xóa, format revision vẫn PENDING
  const okIns = TrackChangesService.acceptChange(editor, insId);
  assert.equal(okIns, true);

  const remaining = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(remaining.length, 1, "Chỉ còn format revision pending");
  assert.equal(remaining[0].id, fmtRev.id);
  assert.ok(editor.getText().includes("nội dung chèn mới"), "Text chèn vẫn còn nguyên");

  // Chấp nhận nốt format revision
  const okFmt = TrackChangesService.acceptChange(editor, fmtRev.id);
  assert.equal(okFmt, true);

  const finalChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(finalChanges.length, 0, "Không còn revision nào sau khi accept cả hai");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 7 — 2.2 Reject insertion có Format Revision: prune sạch, không để orphan format revision", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản gốc." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chèn text mới ở giữa: pos 8 ("Văn bản " = 1..8)
  TrackChangesService.applyTrackedTextInput(editor, 8, 8, "chèn thêm ");
  const insList = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(insList.length, 1);
  const insId = insList[0].id;

  // Format text vừa chèn thành Bold
  editor.chain().setTextSelection({ from: 8, to: 18 }).run();
  toggleBold(editor);

  const changesBefore = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesBefore.length, 2);

  // Từ chối Insertion: toàn bộ text chèn bị xóa
  const okReject = TrackChangesService.rejectChange(editor, insId);
  assert.equal(okReject, true);

  // Text chèn đã bị xóa hoàn toàn khỏi tài liệu
  assert.equal(editor.getText().trim(), "Văn bản gốc.");

  // Format revision nằm trên text đó cũng tự động biến mất, KHÔNG BỊ ORPHAN
  const changesAfter = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfter.length, 0, "Không còn bất kỳ format revision mồ côi nào");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 7 — 2.3 Reject formatting trên inserted text: khôi phục format, giữ nguyên insert mark", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đầu: " }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chèn text mới: "chữ mới"
  TrackChangesService.applyTrackedTextInput(editor, 6, 6, "chữ mới");
  const insId = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // Format "chữ mới" thành Bold
  editor.chain().setTextSelection({ from: 6, to: 13 }).run();
  toggleBold(editor);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  const fmtId = changes.find((c) => c.type === "format")!.id;

  // Reject formatting
  const okRejectFmt = TrackChangesService.rejectChange(editor, fmtId);
  assert.equal(okRejectFmt, true);

  // Bold bị gỡ bỏ, nhưng text "chữ mới" vẫn còn và vẫn có mark insert
  const remaining = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(remaining.length, 1, "Vẫn còn insert revision");
  assert.equal(remaining[0].id, insId);
  assert.ok(editor.getText().includes("chữ mới"), "Text chèn vẫn còn");

  // Kiểm tra không còn mark bold trên "chữ mới"
  let hasBold = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("chữ mới")) {
      if (node.marks.some((m) => m.type.name === "bold")) hasBold = true;
    }
  });
  assert.equal(hasBold, false, "Mark bold phải bị gỡ sau khi reject format");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 3. DELETE TEXT CÓ PENDING FORMAT REVISION
// -----------------------------------------------------------------------------
test("PHASE 7 — 3.1 Delete text có format revision -> Accept deletion xóa sạch, không để orphan", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Phần 1: mục quan trọng cần xóa." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Format "mục quan trọng" -> Bold
  // "Phần 1: " (1..9), "mục quan trọng" (9..23)
  editor.chain().setTextSelection({ from: 9, to: 23 }).run();
  toggleBold(editor);

  const fmtChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(fmtChanges.length, 1);
  assert.equal(fmtChanges[0].type, "format");

  // Xóa "mục quan trọng" khi Track Changes ON -> tạo delete revision
  editor.chain().setTextSelection({ from: 9, to: 23 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const bothChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(bothChanges.length, 2, "Cả format và delete revision đều tồn tại");
  const delRev = bothChanges.find((c) => c.type === "delete")!;

  // Chấp nhận xóa (Accept Delete)
  const okDel = TrackChangesService.acceptChange(editor, delRev.id);
  assert.equal(okDel, true);

  // "mục quan trọng" bị xóa vĩnh viễn khỏi doc
  assert.equal(editor.getText().includes("mục quan trọng"), false);

  // Format revision liên quan cũng tự động biến mất, KHÔNG BỊ ORPHAN
  const finalChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(finalChanges.length, 0, "Không còn revision nào tồn tại sau khi delete được accept");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 7 — 3.2 Delete text có format revision -> Reject deletion khôi phục text và giữ pending format", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung ban đầu của đoạn văn." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Format "ban đầu" -> Bold (pos 10..17)
  editor.chain().setTextSelection({ from: 10, to: 17 }).run();
  toggleBold(editor);

  const fmtId = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // Xóa "ban đầu" -> tạo delete revision
  editor.chain().setTextSelection({ from: 10, to: 17 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  const delId = changes.find((c) => c.type === "delete")!.id;

  // Từ chối xóa (Reject Delete)
  const okRejectDel = TrackChangesService.rejectChange(editor, delId);
  assert.equal(okRejectDel, true);

  // Văn bản vẫn đầy đủ, không bị xóa
  assert.ok(editor.getText().includes("ban đầu"));

  // Format revision vẫn PENDING và mark bold vẫn tồn tại
  const remaining = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, fmtId);

  let hasBold = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("ban đầu")) {
      if (node.marks.some((m) => m.type.name === "bold")) hasBold = true;
    }
  });
  assert.equal(hasBold, true, "Bold vẫn được giữ trên văn bản khôi phục");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 4. FORMATTING TRONG TRACKED DELETION
// -----------------------------------------------------------------------------
test("PHASE 7 — 4. Formatting trong tracked deletion: text bị xóa được format thêm", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản sắp bị xóa hoàn toàn." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Xóa "sắp bị xóa" (pos 9..19)
  editor.chain().setTextSelection({ from: 9, to: 19 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const delId = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // Format "sắp bị xóa" -> Font Size 18
  editor.chain().setTextSelection({ from: 9, to: 19 }).run();
  setFontSize(editor, 18);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 2, "Cả delete và format revision đều có mặt");

  // Reject delete -> Text phục hồi, format revision vẫn còn
  TrackChangesService.rejectChange(editor, delId);
  const afterRejectDel = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(afterRejectDel.length, 1);
  assert.equal(afterRejectDel[0].type, "format");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 5. COMMENTS, BOOKMARKS, HYPERLINKS PRESERVATION
// -----------------------------------------------------------------------------
test("PHASE 7 — 5. Preservation: Comments và Semantic Marks không bị xóa khi thao tác revisions", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Phần " },
          {
            type: "text",
            text: "bình luận quan trọng",
            marks: [
              { type: "comment", attrs: { commentId: "comm-xyz" } },
              { type: "link", attrs: { href: "https://example.com" } },
            ],
          },
          { type: "text", text: " của bài viết." },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Format "bình luận" (pos 6..15) -> Bold
  editor.chain().setTextSelection({ from: 6, to: 15 }).run();
  toggleBold(editor);

  const fmtId = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // Chấp nhận Format
  TrackChangesService.acceptChange(editor, fmtId);

  // Kiểm tra comment mark và link mark vẫn còn 100% nguyên vẹn
  let commentFound = false;
  let linkFound = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("bình luận")) {
      if (node.marks.some((m) => m.type.name === "comment" && m.attrs.commentId === "comm-xyz")) {
        commentFound = true;
      }
      if (node.marks.some((m) => m.type.name === "link" && m.attrs.href === "https://example.com")) {
        linkFound = true;
      }
    }
  });

  assert.equal(commentFound, true, "Comment mark phải còn nguyên sau accept format");
  assert.equal(linkFound, true, "Link mark phải còn nguyên sau accept format");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 6. ACCEPT ALL (MIXED: INSERT, DELETE, FORMAT, BLOCK)
// -----------------------------------------------------------------------------
test("PHASE 7 — 6. Accept All: xử lý đồng thời Insert, Delete, Format, Block trong một batch an toàn", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 1 cần căn giữa và in đậm." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 2 có phần cần xóa bỏ." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Block formatting trên Đoạn 1: Center
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  setTextAlign(editor, "center");

  // 2. Character formatting trên Đoạn 1: "in đậm" -> Bold
  editor.chain().setTextSelection({ from: 24, to: 31 }).run();
  toggleBold(editor);

  // 3. Delete revision trên Đoạn 2: "cần xóa bỏ"
  // Đoạn 1 length = 31 + 2 node = 33. Đoạn 2 start = 34.
  // "Đoạn 2 có phần " (34..49), "cần xóa bỏ" (49..59)
  editor.chain().setTextSelection({ from: 49, to: 59 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  // 4. Insert revision ở cuối Đoạn 2
  const endDoc = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endDoc, endDoc, " đã thêm");

  const pendingBefore = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(pendingBefore.length, 4, "Phải có đúng 4 pending revisions trước khi Accept All");

  // Thực hiện Accept All
  const ok = acceptAllChanges(editor);
  assert.equal(ok, true, "acceptAllChanges phải thành công");

  // Kiểm tra kết quả:
  // - Không còn revision nào
  const pendingAfter = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(pendingAfter.length, 0, "Không còn bất kỳ revision nào sau Accept All");

  // - Text đã chèn được giữ lại
  assert.ok(editor.getText().includes("đã thêm"), "Text chèn phải còn");

  // - Text bị xóa đã biến mất
  assert.equal(editor.getText().includes("cần xóa bỏ"), false, "Text bị xóa phải biến mất");

  // - Format in đậm được giữ
  let boldFound = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("in đậm")) {
      if (node.marks.some((m) => m.type.name === "bold")) boldFound = true;
    }
  });
  assert.equal(boldFound, true, "Bold formatting phải được giữ");

  // - Block format center được giữ
  let alignCenterFound = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph" && node.attrs.textAlign === "center") {
      alignCenterFound = true;
    }
  });
  assert.equal(alignCenterFound, true, "Block align center phải được giữ");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 7. REJECT ALL (MIXED) — TRIỆT TIÊU INDEX DRIFT
// -----------------------------------------------------------------------------
test("PHASE 7 — 7. Reject All: hoàn tác chính xác text và format, không bị index drift", () => {
  const initialText = "Đoạn văn ban đầu chuẩn để kiểm tra Reject All.";
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: initialText }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Format Đoạn văn thành Alignment Center
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  setTextAlign(editor, "center");

  // 2. Format "ban đầu" -> Bold & Font Size 18
  // "Đoạn văn " (1..10), "ban đầu" (10..17)
  editor.chain().setTextSelection({ from: 10, to: 17 }).run();
  toggleBold(editor);
  setFontSize(editor, 18);

  // 3. Xóa "chuẩn " (pos 17..23)
  editor.chain().setTextSelection({ from: 17, to: 23 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  // 4. Chèn text ở đầu và cuối để gây áp lực index drift
  TrackChangesService.applyTrackedTextInput(editor, 1, 1, "[ĐẦU] ");
  const endPos = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endPos, endPos, " [CUỐI]");

  const changesBefore = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.ok(changesBefore.length >= 4, "Phải có nhiều revisions trước Reject All");

  // Thực hiện Reject All
  const ok = rejectAllChanges(editor);
  assert.equal(ok, true, "rejectAllChanges phải thành công");

  // Kiểm tra:
  // - 0 revisions còn lại
  const changesAfter = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfter.length, 0, "Không còn revisions nào sau Reject All");

  // - Text chèn ở đầu và cuối bị xóa, text bị xóa 'chuẩn ' được phục hồi
  const finalContent = editor.getText().trim();
  assert.equal(finalContent, initialText, "Văn bản phải khôi phục 100% nguyên gốc không lệch ký tự");

  // - Block alignment trở về ban đầu (null / left)
  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph") {
      assert.notEqual(node.attrs.textAlign, "center", "Alignment center phải bị hoàn tác");
    }
  });

  // - Bold và FontSize 18 bị hoàn tác
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("ban đầu")) {
      const hasBold = node.marks.some((m) => m.type.name === "bold");
      assert.equal(hasBold, false, "Bold phải bị hoàn tác");
      const tsMark = node.marks.find((m) => m.type.name === "textStyle");
      assert.notEqual(tsMark?.attrs?.fontSize, "18pt", "FontSize 18pt phải bị hoàn tác");
    }
  });

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 8. SELECTIVE BULK COMMANDS (ACCEPT/REJECT ALL FORMATTING)
// -----------------------------------------------------------------------------
test("PHASE 7 — 8. Selective Bulk: Accept All Formatting và Reject All Formatting giữ nguyên Insert/Delete", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm selective bulk commands." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Tạo 1 Format revision: "Văn bản" -> Bold
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor);

  // 2. Tạo 1 Delete revision: "thử nghiệm " -> Delete
  editor.chain().setTextSelection({ from: 8, to: 19 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  // 3. Tạo 1 Insert revision ở cuối
  const endPos = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endPos, endPos, " [mới]");

  const changesBefore = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesBefore.length, 3);

  // Test Selective: Accept All Formatting
  const okFmt = acceptAllFormatting(editor);
  assert.equal(okFmt, true, "acceptAllFormatting phải thành công");

  // Kiểm tra: format revision đã được accept (không còn trong pending),
  // nhưng insert và delete vẫn CÒN NGUYÊN!
  const changesAfterFmt = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterFmt.length, 2, "Chỉ còn lại 2 revisions (insert và delete)");
  const types = changesAfterFmt.map((c) => c.type);
  assert.ok(!types.includes("format"), "Không còn format revision");
  assert.ok(types.includes("delete"), "Delete revision vẫn còn");
  assert.ok(types.includes("insert"), "Insert revision vẫn còn");

  // Test Selective Reject Formatting trên một editor mới
  const editor2 = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản cho reject all formatting." }],
      },
    ],
  });

  // Tạo format bold
  editor2.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor2);

  // Tạo delete
  editor2.chain().setTextSelection({ from: 8, to: 12 }).run();
  TrackChangesService.applyTrackedKeyDown(editor2, "Backspace");

  assert.equal(TrackChangesService.getTrackedChangesFromDoc(editor2.state.doc).length, 2);

  // Reject all formatting
  const okRejFmt = rejectAllFormatting(editor2);
  assert.equal(okRejFmt, true);

  const remaining2 = TrackChangesService.getTrackedChangesFromDoc(editor2.state.doc);
  assert.equal(remaining2.length, 1, "Chỉ còn delete revision");
  assert.equal(remaining2[0].type, "delete");

  // Bold đã bị gỡ
  let boldFound2 = false;
  editor2.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === "bold")) boldFound2 = true;
  });
  assert.equal(boldFound2, false, "Bold phải bị hoàn tác bởi rejectAllFormatting");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
  editor2.destroy();
});

// -----------------------------------------------------------------------------
// 9. ATOMIC UNDO / REDO FOR BULK COMMANDS
// -----------------------------------------------------------------------------
test("PHASE 7 — 9. Undo/Redo Batch: Hoàn tác và làm lại Accept All / Reject All trong đúng 1 bước", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra atomic undo redo cho bulk command." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Format "Kiểm tra" -> Bold
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  toggleBold(editor);

  // Insert text ở cuối
  const end = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, end, end, " [thêm]");

  assert.equal(TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length, 2);

  // Accept All
  acceptAllChanges(editor);
  assert.equal(TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length, 0);

  // Undo trong 1 bước duy nhất
  undo(editor);
  const changesAfterUndo = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterUndo.length, 2, "Undo phải khôi phục chính xác 2 revisions ban đầu");

  // Redo trong 1 bước duy nhất
  redo(editor);
  const changesAfterRedo = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterRedo.length, 0, "Redo phải hoàn tất Accept All trở lại");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 10. REPEATED BULK COMMAND NO-OP
// -----------------------------------------------------------------------------
test("PHASE 7 — 10. Repeated Bulk Command No-op: Gọi nhiều lần không sinh dirty transaction", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tài liệu sạch không có revisions nào." }],
      },
    ],
  });

  // Gọi acceptAllChanges khi không có gì
  const res1 = acceptAllChanges(editor);
  assert.equal(res1, false, "acceptAllChanges khi không có thay đổi phải trả về false");

  // Gọi rejectAllChanges khi không có gì
  const res2 = rejectAllChanges(editor);
  assert.equal(res2, false, "rejectAllChanges khi không có thay đổi phải trả về false");

  // Gọi acceptAllFormatting khi không có gì
  const res3 = acceptAllFormatting(editor);
  assert.equal(res3, false, "acceptAllFormatting khi không có thay đổi phải trả về false");

  // Gọi rejectAllFormatting khi không có gì
  const res4 = rejectAllFormatting(editor);
  assert.equal(res4, false, "rejectAllFormatting khi không có thay đổi phải trả về false");

  // Document text không bị biến dạng
  assert.equal(editor.getText().trim(), "Tài liệu sạch không có revisions nào.");

  editor.destroy();
});
