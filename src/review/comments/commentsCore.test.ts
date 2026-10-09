import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontFamily, FontSize, Color } from "@tiptap/extension-text-style";
import { CustomTable, TableRow, CustomTableCell, CustomTableHeader } from "../../editor/tableExtensions.ts";
import { PageBreak } from "../../page/extensions/pageBreakExtension.ts";
import { CommentExtension } from "./commentExtension.ts";
import { CommentService } from "./commentService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../../document/documentFile.ts";
import { exportDocumentModelToDocx } from "../../docx/index.ts";
import type { DocumentModel, CommentItem } from "../../document/documentTypes.ts";

import { getEditorExtensions } from "../../editor/editorExtensions.ts";

function createTestEditor(initialContent?: any): Editor {
  return new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Xin chào thế giới tài liệu Personal Word Editor." }],
        },
      ],
    },
  });
}

test("PHASE 5.4 — 1. Add Comment: Metadata và Document Store", () => {
  const comment = CommentService.createComment(
    "Đây là ghi chú phân tích",
    "Kiểm duyệt viên",
    "Xin chào thế giới"
  );

  assert.ok(comment.id.startsWith("comment-"), "ID phải có tiền tố comment-");
  assert.equal(comment.author, "Kiểm duyệt viên");
  assert.equal(comment.content, "Đây là ghi chú phân tích");
  assert.equal(comment.selectedText, "Xin chào thế giới");
  assert.equal(comment.resolved, false);
  assert.ok(comment.createdAt);
  assert.ok(comment.updatedAt);

  // Store integration
  const store = useDocumentStore.getState();
  store.resetDocument();
  assert.equal(store.comments.length, 0);

  store.addComment(comment);
  assert.equal(useDocumentStore.getState().comments.length, 1);
  assert.equal(useDocumentStore.getState().comments[0].id, comment.id);
  assert.equal(useDocumentStore.getState().isDirty, true);
});

test("PHASE 5.4 — 2. Comment Anchor: Tiptap Mark và tìm kiếm Anchor Range", () => {
  const editor = createTestEditor();
  const commentId = "comm-test-01";

  // Bôi đen "thế giới" (vị trí 10 đến 18)
  editor.chain().setTextSelection({ from: 10, to: 18 }).setComment(commentId).run();

  const doc = editor.state.doc;
  const range = CommentService.findCommentRangeInDoc(doc, commentId);

  assert.ok(range, "Phải tìm thấy range của comment trong document");
  assert.equal(range.from, 10);
  assert.equal(range.to, 18);
  assert.equal(range.text, "thế giới");

  // Kiểm tra AST JSON
  const json = editor.getJSON();
  const astCheck = CommentService.findCommentInAst(json, commentId);
  assert.equal(astCheck.found, true);
  assert.equal(astCheck.text, "thế giới");

  editor.destroy();
});

test("PHASE 5.4 — 3. Coexistence với Formatting Marks: Bold, Italic, Color", () => {
  const editor = createTestEditor();
  const commentId = "comm-format-test";

  // Thêm định dạng Bold trên đoạn text
  editor.chain().setTextSelection({ from: 10, to: 18 }).toggleBold().run();
  // Gắn Comment lên cùng đoạn text
  editor.chain().setTextSelection({ from: 10, to: 18 }).setComment(commentId).run();

  const textNode = editor.state.doc.nodeAt(10);
  assert.ok(textNode);
  const markNames = textNode.marks.map((m) => m.type.name);

  assert.ok(markNames.includes("bold"), "Mark bold phải được giữ nguyên");
  assert.ok(markNames.includes("comment"), "Mark comment phải tồn tại đồng thời");

  // Gắn thêm Italic
  editor.chain().setTextSelection({ from: 10, to: 18 }).toggleItalic().run();
  const updatedMarks = editor.state.doc.nodeAt(10)!.marks.map((m) => m.type.name);
  assert.ok(updatedMarks.includes("bold"));
  assert.ok(updatedMarks.includes("italic"));
  assert.ok(updatedMarks.includes("comment"));

  editor.destroy();
});

test("PHASE 5.4 — 4. Sắp xếp thứ tự và Điều hướng Next/Previous Comment", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn 1 có ghi chú A " },
          { type: "text", text: "và ghi chú B ở đây. " },
          { type: "text", text: "Cuối cùng là ghi chú C." },
        ],
      },
    ],
  });

  const c1 = CommentService.createComment("Comment A", "User", "ghi chú A", "c-1");
  const c2 = CommentService.createComment("Comment B", "User", "ghi chú B", "c-2");
  const c3 = CommentService.createComment("Comment C", "User", "ghi chú C", "c-3");

  // Gắn ngược thứ tự tạo: C trước, rồi A, rồi B
  editor.chain().setTextSelection({ from: 1, to: 10 }).setComment("c-1").run();
  editor.chain().setTextSelection({ from: 22, to: 32 }).setComment("c-2").run();
  editor.chain().setTextSelection({ from: 45, to: 55 }).setComment("c-3").run();

  const allComments = [c3, c1, c2]; // đưa vào mảng xáo trộn
  const ordered = CommentService.getOrderedComments(editor.state.doc, allComments);

  assert.equal(ordered.length, 3);
  assert.equal(ordered[0].comment.id, "c-1");
  assert.equal(ordered[1].comment.id, "c-2");
  assert.equal(ordered[2].comment.id, "c-3");

  // Điều hướng Next Comment
  assert.equal(CommentService.findNextComment(editor.state.doc, allComments, null), "c-1");
  assert.equal(CommentService.findNextComment(editor.state.doc, allComments, "c-1"), "c-2");
  assert.equal(CommentService.findNextComment(editor.state.doc, allComments, "c-2"), "c-3");
  assert.equal(CommentService.findNextComment(editor.state.doc, allComments, "c-3"), "c-1"); // Wrap

  // Điều hướng Previous Comment
  assert.equal(CommentService.findPreviousComment(editor.state.doc, allComments, null), "c-3");
  assert.equal(CommentService.findPreviousComment(editor.state.doc, allComments, "c-3"), "c-2");
  assert.equal(CommentService.findPreviousComment(editor.state.doc, allComments, "c-2"), "c-1");
  assert.equal(CommentService.findPreviousComment(editor.state.doc, allComments, "c-1"), "c-3"); // Wrap

  editor.destroy();
});

test("PHASE 5.4 — 5. Edit Comment: Cập nhật nội dung và dirty state", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const comment = CommentService.createComment("Ý kiến ban đầu", "Tác giả", "văn bản", "c-edit");
  store.addComment(comment);

  store.updateComment("c-edit", { content: "Ý kiến đã được hiệu chỉnh chính xác" });
  const updated = useDocumentStore.getState().comments.find((c) => c.id === "c-edit");

  assert.ok(updated);
  assert.equal(updated.content, "Ý kiến đã được hiệu chỉnh chính xác");
  assert.equal(useDocumentStore.getState().isDirty, true);
});

test("PHASE 5.4 — 6. Delete Comment: Xóa mark nhưng BẢO TOÀN 100% văn bản gốc", () => {
  const editor = createTestEditor();
  const commentId = "c-del-test";
  const initialText = editor.getText();

  // Gắn comment vào "thế giới"
  editor.chain().setTextSelection({ from: 10, to: 18 }).setComment(commentId).run();
  assert.ok(CommentService.findCommentRangeInDoc(editor.state.doc, commentId));

  // Gỡ comment
  editor.commands.unsetComment(commentId);

  // Mark đã bị xóa khỏi AST
  const rangeAfter = CommentService.findCommentRangeInDoc(editor.state.doc, commentId);
  assert.equal(rangeAfter, null, "Mark comment phải bị gỡ sạch khỏi tài liệu");

  // Văn bản gốc hoàn toàn không bị mất một chữ nào
  assert.equal(editor.getText(), initialText, "Văn bản phải được bảo toàn 100%");

  editor.destroy();
});

test("PHASE 5.4 — 7. Resolve / Reopen Comment: Trạng thái và thống kê", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();

  const c1 = CommentService.createComment("Nhận xét 1", "A", "text 1", "c-res-1");
  const c2 = CommentService.createComment("Nhận xét 2", "B", "text 2", "c-res-2");
  store.addComment(c1);
  store.addComment(c2);

  let counts = CommentService.getCommentsCount(useDocumentStore.getState().comments);
  assert.equal(counts.total, 2);
  assert.equal(counts.active, 2);
  assert.equal(counts.resolved, 0);

  // Resolve comment 1
  store.resolveComment("c-res-1");
  counts = CommentService.getCommentsCount(useDocumentStore.getState().comments);
  assert.equal(counts.active, 1);
  assert.equal(counts.resolved, 1);
  assert.equal(useDocumentStore.getState().comments.find((c) => c.id === "c-res-1")?.resolved, true);

  // Reopen comment 1
  store.reopenComment("c-res-1");
  counts = CommentService.getCommentsCount(useDocumentStore.getState().comments);
  assert.equal(counts.active, 2);
  assert.equal(counts.resolved, 0);
  assert.equal(useDocumentStore.getState().comments.find((c) => c.id === "c-res-1")?.resolved, false);
});

test("PHASE 5.4 — 8. Persistence (.mwd): Lưu và Nạp bình luận kèm Anchor", () => {
  const editor = createTestEditor();
  const commentId = "c-persist-1";
  editor.chain().setTextSelection({ from: 5, to: 15 }).setComment(commentId).run();

  const commentItem = CommentService.createComment("Cần xem lại đoạn này", "Biên tập viên", "chào thế g", commentId);

  const docModel: DocumentModel = {
    metadata: {
      id: "doc-test-comm",
      title: "Tài liệu có nhận xét",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: editor.getJSON(),
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    },
    comments: [commentItem],
  };

  // 1. Serialize sang .mwd
  const serialized = serializeDocumentToMwd(docModel);
  assert.ok(serialized.includes("PersonalWordDocument"));
  assert.ok(serialized.includes("Cần xem lại đoạn này"));
  assert.ok(serialized.includes(commentId));

  // 2. Deserialize từ .mwd
  const deserializedResult = deserializeMwdToDocument(serialized);
  assert.equal(deserializedResult.success, true);
  if (!deserializedResult.success) return;

  const loadedDoc = deserializedResult.document;
  assert.equal(loadedDoc.comments?.length, 1);
  assert.equal(loadedDoc.comments![0].id, commentId);
  assert.equal(loadedDoc.comments![0].author, "Biên tập viên");
  assert.equal(loadedDoc.comments![0].content, "Cần xem lại đoạn này");
  assert.equal(loadedDoc.comments![0].resolved, false);

  // 3. Anchor mark trong AST vẫn nguyên vẹn
  const astCheck = CommentService.findCommentInAst(loadedDoc.content, commentId);
  assert.equal(astCheck.found, true);

  // 4. Backward Compatibility: Mở file cũ không có trường comments
  const legacyFileJson = JSON.stringify({
    format: "PersonalWordDocument",
    version: 1,
    metadata: {
      id: "legacy",
      title: "Old Doc",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    document: { type: "doc", content: [{ type: "paragraph" }] },
  });
  const legacyResult = deserializeMwdToDocument(legacyFileJson);
  assert.equal(legacyResult.success, true);
  if (legacyResult.success) {
    assert.deepEqual(legacyResult.document.comments, []);
  }

  editor.destroy();
});

test("PHASE 5.4 — 9. Undo/Redo & Orphan Comment Safety", () => {
  const editor = createTestEditor();
  const commentId = "c-undo-test";

  // 1. Gắn comment vào đoạn "thế giới" (vị trí 10 đến 18)
  editor.chain().setTextSelection({ from: 10, to: 18 }).setComment(commentId).run();
  const initialRange = CommentService.findCommentRangeInDoc(editor.state.doc, commentId);
  assert.ok(initialRange);
  assert.equal(initialRange.text, "thế giới");

  // 2. Kiểm tra lệnh Undo và Redo hoạt động an toàn, không ném lỗi (crash-free) khi có comment
  assert.doesNotThrow(() => editor.commands.undo(), "Lệnh undo không được gây crash khi có comment");
  assert.doesNotThrow(() => editor.commands.redo(), "Lệnh redo không được gây crash khi có comment");

  // 3. Người dùng xóa đoạn văn bản chứa comment -> Anchor bị gỡ khỏi doc
  editor.commands.deleteRange({ from: 10, to: 18 });
  const rangeAfterDelete = CommentService.findCommentRangeInDoc(editor.state.doc, commentId);
  assert.equal(rangeAfterDelete, null, "Khi text bị xóa, anchor không còn tồn tại trong doc");

  // 4. CommentService phát hiện orphan comment chuẩn xác, an toàn không crash
  const commentObj = CommentService.createComment("Nội dung", "User", "thế giới", commentId);
  const ordered = CommentService.getOrderedComments(editor.state.doc, [commentObj]);
  assert.equal(ordered.length, 1);
  assert.equal(ordered[0].isOrphan, true, "Comment mồ côi phải được gắn cờ isOrphan: true");
  assert.equal(ordered[0].range, null, "Range của orphan comment là null");

  // 5. Thao tác điều hướng Previous / Next trên orphan comment không gây crash
  assert.doesNotThrow(() => {
    CommentService.findNextComment(editor.state.doc, [commentObj], commentId);
    CommentService.findPreviousComment(editor.state.doc, [commentObj], commentId);
  });

  // 6. Khi văn bản có comment được phục hồi vào tài liệu
  editor.commands.setContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Xin chào " },
          {
            type: "text",
            text: "thế giới",
            marks: [{ type: "comment", attrs: { commentId } }],
          },
          { type: "text", text: " tài liệu." },
        ],
      },
    ],
  });

  const rangeRestored = CommentService.findCommentRangeInDoc(editor.state.doc, commentId);
  assert.ok(rangeRestored, "Anchor phải tìm thấy lại khi text có mark được nạp lại");
  assert.equal(rangeRestored.text, "thế giới");

  const orderedRestored = CommentService.getOrderedComments(editor.state.doc, [commentObj]);
  assert.equal(orderedRestored[0].isOrphan, false);

  editor.destroy();
});

test("PHASE 5.4 — 10. Edge Cases: Heading, Table, List, PageBreak, Adjacent", async () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Tiêu đề lớn có bình luận" }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Mục danh sách 1" }],
              },
            ],
          },
        ],
      },
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
                    content: [{ type: "text", text: "Ô bảng có comment" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn ở trang 2 sau ngắt trang" }],
      },
    ],
  });

  // 1. Comment trong Heading
  editor.chain().setTextSelection({ from: 1, to: 8 }).setComment("c-heading").run();
  const headingRange = CommentService.findCommentRangeInDoc(editor.state.doc, "c-heading");
  assert.ok(headingRange);
  assert.equal(headingRange.text, "Tiêu đề");

  // 2. Comment trong List Item
  let listPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text?.includes("Mục danh sách")) {
      listPos = pos;
    }
  });
  assert.ok(listPos > 0);
  editor.chain().setTextSelection({ from: listPos, to: listPos + 13 }).setComment("c-list").run();
  const listRange = CommentService.findCommentRangeInDoc(editor.state.doc, "c-list");
  assert.ok(listRange);
  assert.equal(listRange.text, "Mục danh sách");

  // 3. Comment trong Table Cell
  let tablePos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text?.includes("Ô bảng")) {
      tablePos = pos;
    }
  });
  assert.ok(tablePos > 0);
  editor.chain().setTextSelection({ from: tablePos, to: tablePos + 6 }).setComment("c-table").run();
  const tableRange = CommentService.findCommentRangeInDoc(editor.state.doc, "c-table");
  assert.ok(tableRange);
  assert.equal(tableRange.text, "Ô bảng");

  // 4. Adjacent comments (hai comment liền kề không chồng lấn)
  editor.chain().setTextSelection({ from: 10, to: 14 }).setComment("c-adj-1").run();
  editor.chain().setTextSelection({ from: 14, to: 18 }).setComment("c-adj-2").run();
  const r1 = CommentService.findCommentRangeInDoc(editor.state.doc, "c-adj-1");
  const r2 = CommentService.findCommentRangeInDoc(editor.state.doc, "c-adj-2");
  assert.ok(r1);
  assert.ok(r2);
  assert.equal(r1.to, r2.from, "Hai range liền kề tiếp xúc nhau chuẩn xác");

  // 5. DOCX Export Zero-Regression
  const testDoc: DocumentModel = {
    metadata: {
      id: "doc-docx-test",
      title: "Docx Export With Comments",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: editor.getJSON(),
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    },
  };
  const docxBytes = await exportDocumentModelToDocx(testDoc);
  assert.ok(docxBytes.length > 500, "DOCX export phải thành công và tạo gói zip hợp lệ");

  editor.destroy();
});
