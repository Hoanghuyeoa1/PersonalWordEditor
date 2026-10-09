import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../../editor/editorCommands.ts";
import { CommentService } from "../comments/commentService.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../../document/documentFile.ts";
import { exportDocumentModelToDocx } from "../../docx/index.ts";
import type { DocumentModel } from "../../document/documentTypes.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản mẫu ban đầu dùng để kiểm thử Accept và Reject." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

test("PHASE 5.6 — 1. Accept Insert: Giữ văn bản, xóa metadata, trở thành normal content", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Lời mở đầu: " }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chèn văn bản có tracking
  TrackChangesService.applyTrackedTextInput(editor, 14, 14, "nội dung mới chèn");
  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansBefore.length, 1);
  assert.equal(spansBefore[0].type, "insert");
  const changeId = spansBefore[0].id;

  // Thực hiện Accept Insert
  const ok = TrackChangesService.acceptChange(editor, changeId);
  assert.equal(ok, true, "Lệnh acceptChange phải thành công");

  // Văn bản vẫn phải tồn tại đầy đủ trong document
  const textAfter = editor.getText();
  assert.ok(textAfter.includes("nội dung mới chèn"), "Nội dung chèn phải được giữ lại trong tài liệu");

  // Mark trackChange phải được gỡ bỏ hoàn toàn
  const spansAfter = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansAfter.length, 0, "Không còn change metadata nào trên đoạn vừa accept");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 2. Reject Insert: Xóa nội dung đã chèn và change metadata", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Lời mở đầu: " }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chèn văn bản có tracking
  TrackChangesService.applyTrackedTextInput(editor, 14, 14, "văn bản này sẽ bị từ chối");
  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansBefore.length, 1);
  assert.equal(spansBefore[0].type, "insert");
  const changeId = spansBefore[0].id;

  // Thực hiện Reject Insert
  const ok = TrackChangesService.rejectChange(editor, changeId);
  assert.equal(ok, true, "Lệnh rejectChange phải thành công");

  // Văn bản đã chèn phải bị xóa bỏ hoàn toàn
  const textAfter = editor.getText();
  assert.equal(textAfter.includes("văn bản này sẽ bị từ chối"), false, "Nội dung chèn phải bị xóa khỏi tài liệu");
  assert.equal(textAfter.trim(), "Lời mở đầu:");

  // Mark trackChange cũng không còn
  const spansAfter = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansAfter.length, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 3. Accept Delete: Xóa vĩnh viễn nội dung bị đánh dấu xóa khỏi tài liệu", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn có phần cần xóa bỏ hoàn toàn." }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Bôi đen 'phần cần xóa bỏ' và nhấn Backspace để đánh dấu deleted
  // 'Đoạn văn có ' (1..14), 'phần cần xóa bỏ' (14..29)
  editor.commands.setTextSelection({ from: 14, to: 29 });
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansBefore.length, 1);
  assert.equal(spansBefore[0].type, "delete");
  const delId = spansBefore[0].id;

  // Thực hiện Accept Delete: nội dung này phải biến mất vĩnh viễn khỏi AST
  const ok = TrackChangesService.acceptChange(editor, delId);
  assert.equal(ok, true, "Lệnh acceptChange cho delete phải thành công");

  const textAfter = editor.getText();
  assert.equal(textAfter.includes("phần cần xóa bỏ"), false, "Văn bản bị delete phải bị xóa hẳn khỏi AST");
  assert.ok(textAfter.includes("Đoạn văn có "));
  assert.ok(textAfter.includes("hoàn toàn."));

  // Không còn track change mark
  const spansAfter = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansAfter.length, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 4. Reject Delete: Giữ/khôi phục văn bản, xóa metadata delete, trở về normal content", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn có phần muốn giữ lại sau này." }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Đánh dấu xóa đoạn 'phần muốn giữ lại'
  editor.commands.setTextSelection({ from: 14, to: 31 });
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansBefore.length, 1);
  assert.equal(spansBefore[0].type, "delete");
  const delId = spansBefore[0].id;

  // Thực hiện Reject Delete: giữ nguyên văn bản, gỡ mark delete
  const ok = TrackChangesService.rejectChange(editor, delId);
  assert.equal(ok, true, "Lệnh rejectChange cho delete phải thành công");

  const textAfter = editor.getText();
  assert.ok(textAfter.includes("phần muốn giữ lại"), "Văn bản phải được giữ lại nguyên vẹn");

  // Mark trackChange phải được gỡ bỏ hoàn toàn
  const spansAfter = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansAfter.length, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 5. Current Change Resolution & Navigation: Selection/Caret & activeChangeId", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khởi đầu câu. Phần này sẽ bị xóa. Đoạn cuối." }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Chèn văn bản tại đầu
  TrackChangesService.applyTrackedTextInput(editor, 1, 1, "[Chèn 1] ");
  const spans1 = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const id1 = spans1[0].id;

  // 2. Xóa 'Phần này sẽ bị xóa'
  const textNow = editor.getText();
  const delStart = textNow.indexOf("Phần này sẽ bị xóa") + 1;
  const delEnd = delStart + "Phần này sẽ bị xóa".length;
  editor.commands.setTextSelection({ from: delStart, to: delEnd });
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");
  const spans2 = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const id2 = spans2.find((s) => s.type === "delete")?.id;
  assert.ok(id2);

  // 3. Chèn văn bản tại cuối
  const endPos = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endPos, endPos, " [Chèn 3]");
  const spans3 = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const id3 = spans3.find((s) => s.text.includes("[Chèn 3]"))?.id;
  assert.ok(id3);

  // Kiểm tra navigation Next / Previous
  const nextFrom1 = TrackChangesService.findNextChange(editor.state.doc, id1);
  assert.equal(nextFrom1?.id, id2, "Next từ id1 phải tới id2");

  const nextFrom2 = TrackChangesService.findNextChange(editor.state.doc, id2);
  assert.equal(nextFrom2?.id, id3, "Next từ id2 phải tới id3");

  const prevFrom3 = TrackChangesService.findPreviousChange(editor.state.doc, id3);
  assert.equal(prevFrom3?.id, id2, "Prev từ id3 phải về id2");

  // Kiểm tra con trỏ nhấp nháy tại id2: Accept không truyền ID tường minh phải nhận diện đúng id2
  const range2 = TrackChangesService.findChangeRangeInDoc(editor.state.doc, id2);
  assert.ok(range2);
  editor.commands.setTextSelection(range2.from + 2);

  const resolvedId = TrackChangesService.resolveTargetChangeId(editor);
  assert.equal(resolvedId, id2, "Phải nhận diện đúng changeId tại vị trí con trỏ");

  // Accept id2 (delete) -> nội dung bị xóa hẳn khỏi text
  TrackChangesService.acceptChange(editor);
  assert.equal(editor.getText().includes("Phần này sẽ bị xóa"), false);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 6. Accept All Changes: Chạy batch transaction an toàn, không lệch index", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn gốc. " }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Tạo xen kẽ nhiều thay đổi
  TrackChangesService.applyTrackedTextInput(editor, 12, 12, "Chèn A. ");
  editor.commands.setTextSelection({ from: 1, to: 9 }); // 'Đoạn gốc'
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace"); // Delete 'Đoạn gốc'
  TrackChangesService.applyTrackedTextInput(editor, 20, 20, "Chèn B. ");

  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.ok(spansBefore.length >= 2);

  // Thực hiện Accept All
  const ok = TrackChangesService.acceptAllChanges(editor);
  assert.equal(ok, true);

  // Kết quả:
  // - 'Đoạn gốc' bị xóa vĩnh viễn
  // - 'Chèn A. ' và 'Chèn B. ' được giữ lại và trở thành normal text
  const finalSpans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(finalSpans.length, 0, "Toàn bộ change metadata phải được dọn dẹp sạch sẽ");

  const text = editor.getText();
  assert.equal(text.includes("Đoạn gốc"), false);
  assert.ok(text.includes("Chèn A. "));
  assert.ok(text.includes("Chèn B. "));

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 7. Reject All Changes: Chạy batch transaction an toàn, không lệch index", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản gốc ban đầu. " }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Tạo thay đổi xen kẽ
  TrackChangesService.applyTrackedTextInput(editor, 23, 23, "Chèn thêm mới. ");
  editor.commands.setTextSelection({ from: 1, to: 12 }); // 'Văn bản gốc'
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace"); // Delete 'Văn bản gốc'

  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansBefore.length >= 2, true);

  // Thực hiện Reject All
  const ok = TrackChangesService.rejectAllChanges(editor);
  assert.equal(ok, true);

  // Kết quả:
  // - 'Văn bản gốc' được khôi phục nguyên vẹn
  // - 'Chèn thêm mới. ' bị xóa bỏ hoàn toàn khỏi tài liệu
  const finalSpans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(finalSpans.length, 0);

  const text = editor.getText();
  assert.ok(text.includes("Văn bản gốc"));
  assert.equal(text.includes("Chèn thêm mới"), false);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 8. Undo / Redo: Hoàn tác và làm lại Accept / Reject nguyên vẹn", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm Undo/Redo. " }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  TrackChangesService.applyTrackedTextInput(editor, 31, 31, "Nội dung chèn.");
  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const changeId = spans[0].id;

  // 1. Accept -> Undo -> Redo
  TrackChangesService.acceptChange(editor, changeId);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);

  // Undo: Mark trackChange phải được phục hồi
  editor.commands.undo();
  const spansRestored = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spansRestored.length, 1);
  assert.equal(spansRestored[0].id, changeId);

  // Redo: Lại được accept sạch sẽ
  editor.commands.redo();
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 9. Comments Interaction: Accept Delete đoạn có Comment chuyển thành orphan an toàn không crash", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn chứa bình luận sẽ bị chấp nhận xóa." }],
      },
    ],
  });

  // Gắn một bình luận vào 'bình luận' (pos 15..24)
  const comment = CommentService.createComment("Ghi chú thử nghiệm", "Reviewer", "bình luận");
  useDocumentStore.getState().addComment(comment);
  editor.commands.setTextSelection({ from: 15, to: 24 });
  editor.commands.setComment(comment.id);

  // Bật Track Changes và đánh dấu xóa toàn bộ đoạn
  useReviewStore.getState().setTrackChangesEnabled(true);
  editor.commands.setTextSelection({ from: 1, to: 45 });
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const delId = spans[0].id;

  // Chấp nhận xóa đoạn văn này
  assert.doesNotThrow(() => {
    TrackChangesService.acceptChange(editor, delId);
  }, "Accept delete text chứa comment không được crash");

  // Kiểm tra comment trở thành orphan an toàn
  const orphanEntry = CommentService.getOrderedComments(
    editor.state.doc,
    useDocumentStore.getState().comments
  ).find((c) => c.comment.id === comment.id);

  assert.ok(orphanEntry);
  assert.equal(orphanEntry.isOrphan, true, "Comment phải chuyển thành orphan");
  assert.equal(orphanEntry.range, null);

  // Undo phục hồi text lẫn anchor comment
  editor.commands.undo();
  const restoredEntry = CommentService.getOrderedComments(
    editor.state.doc,
    useDocumentStore.getState().comments
  ).find((c) => c.comment.id === comment.id);
  assert.ok(restoredEntry);
  assert.equal(restoredEntry.isOrphan, false, "Undo phục hồi comment anchor bình thường");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

test("PHASE 5.6 — 10. Persistence: Save/Open sau partial review (chấp nhận một phần, giữ một phần)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thứ nhất. " }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thứ hai. " }],
      },
    ],
  });
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Tạo 2 thay đổi độc lập ở 2 đoạn riêng biệt
  TrackChangesService.applyTrackedTextInput(editor, 1, 1, "Chèn đầu đoạn 1. ");
  const spans1 = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const id1 = spans1[0].id;

  const docSize = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, docSize, docSize, "Chèn đuôi đoạn 2. ");
  const spans2 = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const id2 = spans2.find((s) => s.text.includes("Chèn đuôi đoạn 2"))?.id;
  assert.ok(id2);
  assert.notEqual(id1, id2, "Hai thay đổi phải có ID phân biệt");

  // Chỉ chấp nhận change 1
  TrackChangesService.acceptChange(editor, id1);

  // Lưu tài liệu sang chuỗi .mwd
  const currentDoc: DocumentModel = {
    metadata: {
      id: "doc-test-5-6",
      title: "Test Partial Review",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    },
    content: editor.getJSON(),
    trackedChanges: TrackChangesService.getTrackedChangesFromDoc(editor.state.doc),
  };

  const serialized = serializeDocumentToMwd(currentDoc);
  const deserialized = deserializeMwdToDocument(serialized);

  // Kiểm tra:
  // - id1 không còn trong trackedChanges
  // - id2 vẫn còn nguyên vẹn trong trackedChanges
  assert.equal(deserialized.document.trackedChanges?.some((c) => c.id === id1), false);
  assert.equal(deserialized.document.trackedChanges?.some((c) => c.id === id2), true);

  // Tương thích DOCX: Xuất DOCX không ném ngoại lệ
  assert.doesNotThrow(() => {
    exportDocumentModelToDocx(deserialized.document);
  });

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});
