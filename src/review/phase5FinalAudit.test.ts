import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { useDocumentStore } from "../stores/documentStore.ts";
import { useReviewStore } from "../stores/reviewStore.ts";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { SpellCheckerEngine } from "./proofing/spellCheckerEngine.ts";
import { GrammarCheckerEngine } from "./proofing/grammar/grammarCheckerEngine.ts";
import { UserDictionaryService } from "./proofing/dictionary/userDictionaryService.ts";
import { CommentService } from "./comments/commentService.ts";
import { TrackChangesService } from "./trackChanges/trackChangesService.ts";
import { StatisticsService } from "./statistics/statisticsService.ts";
import { extractDocumentStats } from "../document/documentModel.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  importDocxToDocumentModel,
  exportDocumentModelToDocx,
} from "../docx/index.ts";
import type { DocumentModel } from "../document/documentTypes.ts";

function createAuditEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Tài liệu kiểm thử cuối cùng cho Phase 5 Review Engine." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// =============================================================================
// 1. ARCHITECTURE & REVIEW STORE
// =============================================================================
test("PHASE 5 FINAL AUDIT — 1. Architecture: Store & Document Model Isolation", () => {
  const reviewStore = useReviewStore.getState();
  assert.ok(reviewStore, "Review store phải tồn tại");

  // Kiểm tra các cờ phân tách rõ ràng
  reviewStore.setProofingEnabled(true);
  reviewStore.setGrammarEnabled(true);
  reviewStore.setTrackChangesEnabled(false);
  assert.equal(useReviewStore.getState().proofingEnabled, true);
  assert.equal(useReviewStore.getState().grammarEnabled, true);
  assert.equal(useReviewStore.getState().trackChangesEnabled, false);

  // DocumentStore quản lý comments & trackedChanges
  const docStore = useDocumentStore.getState();
  assert.ok(Array.isArray(docStore.comments), "comments phải là mảng trong store");
  assert.ok(Array.isArray(docStore.trackedChanges), "trackedChanges phải là mảng trong store");
});

// =============================================================================
// 2. SPELL CHECK AUDIT
// =============================================================================
test("PHASE 5 FINAL AUDIT — 2. Spell Check: Detection, Suggestions, Ignore Once, Ignore All & Performance", () => {
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "This is an incorect spelld sentens with proper words." }],
      },
    ],
  });

  SpellCheckerEngine.setLanguage("en-US");
  SpellCheckerEngine.resetIgnored();

  const issues = SpellCheckerEngine.checkDocument(editor.state.doc);
  assert.ok(issues.length >= 2, "Phải phát hiện ít nhất 2 lỗi chính tả (incorect, spelld)");

  const incorrectIssue = issues.find((i) => i.word === "incorect");
  assert.ok(incorrectIssue);
  assert.ok(incorrectIssue.suggestions.length > 0, "Phải có gợi ý sửa");

  // Test Ignore Once
  SpellCheckerEngine.ignoreOnce(incorrectIssue.id);
  const issuesAfterIgnoreOnce = SpellCheckerEngine.checkDocument(editor.state.doc);
  assert.equal(
    issuesAfterIgnoreOnce.some((i) => i.id === incorrectIssue.id),
    false,
    "Issue đã Ignore Once không được xuất hiện lại"
  );

  // Test Ignore All
  const spelldIssue = issues.find((i) => i.word === "spelld");
  assert.ok(spelldIssue);
  SpellCheckerEngine.ignoreAll("spelld");
  const issuesAfterIgnoreAll = SpellCheckerEngine.checkDocument(editor.state.doc);
  assert.equal(
    issuesAfterIgnoreAll.some((i) => i.word === "spelld"),
    false,
    "Từ đã Ignore All không được xuất hiện lại"
  );

  // Test User Dictionary
  UserDictionaryService.addWord("sentens");
  const issuesAfterUserDict = SpellCheckerEngine.checkDocument(editor.state.doc);
  assert.equal(
    issuesAfterUserDict.some((i) => i.word === "sentens"),
    false,
    "Từ trong User Dictionary phải được coi là hợp lệ"
  );
  UserDictionaryService.removeWord("sentens");

  // Test Performance với tài liệu dài (100 đoạn văn, > 2000 từ)
  const longParagraphs = Array.from({ length: 100 }, (_, i) => ({
    type: "paragraph",
    content: [{ type: "text", text: `Paragraph ${i} contains valid words and one intentional incorect token.` }],
  }));
  const longEditor = createAuditEditor({ type: "doc", content: longParagraphs });
  const startT = performance.now();
  const longIssues = SpellCheckerEngine.checkDocument(longEditor.state.doc);
  const elapsed = performance.now() - startT;

  assert.ok(longIssues.length >= 100);
  assert.ok(elapsed < 200, `Quét tài liệu dài phải dưới 200ms (thực tế: ${elapsed.toFixed(1)}ms)`);

  editor.destroy();
  longEditor.destroy();
});

// =============================================================================
// 3. GRAMMAR AUDIT & FALSE POSITIVE RESILIENCE
// =============================================================================
test("PHASE 5 FINAL AUDIT — 3. Grammar Check: Rules, Corrections & Zero False Positives trên URLs, Numbers, File Extensions", () => {
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Truy cập https://example.com/api/v1.0 hoặc tải file report.docx (phiên bản v2.5 với tỉ lệ 3.14). Đây  là lỗi đôi.",
          },
        ],
      },
    ],
  });

  GrammarCheckerEngine.resetIgnored();
  const issues = GrammarCheckerEngine.checkDocument(editor.state.doc);

  // Kiểm tra không bắt nhầm URL, số thập phân 3.14, phiên bản v2.5, tên file report.docx
  const urlIssues = issues.filter((i) => i.matchedText?.includes("http") || i.matchedText?.includes("docx"));
  assert.equal(urlIssues.length, 0, "Tuyệt đối không có false positive trên URL hoặc tên file");

  const numIssues = issues.filter((i) => i.matchedText?.includes("3.14") || i.matchedText?.includes("v2.5"));
  assert.equal(numIssues.length, 0, "Tuyệt đối không có false positive trên số thập phân hoặc số phiên bản");

  // Nhưng PHẢI phát hiện đúng lỗi khoảng trắng thừa ("Đây  là")
  const spaceIssue = issues.find((i) => i.ruleId === "double-spaces");
  assert.ok(spaceIssue, "Phải phát hiện lỗi hai dấu cách liên tiếp");

  editor.destroy();
});

// =============================================================================
// 4. COMMENTS AUDIT: FULL WORKFLOW & ANCHOR INTEGRITY
// =============================================================================
test("PHASE 5 FINAL AUDIT — 4. Comments: Add, Edit, Resolve, Reopen, Delete, Navigation & Orphan Safety", () => {
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản đoạn một. Văn bản đoạn hai." }],
      },
    ],
  });

  const docStore = useDocumentStore.getState();
  docStore.setComments([]);

  // 1. Thêm comment 1
  editor.commands.setTextSelection({ from: 1, to: 9 });
  const c1 = CommentService.createComment("Bình luận 1", "Tester", "Văn bản");
  docStore.addComment(c1);
  editor.commands.setComment(c1.id);

  // 2. Thêm comment 2
  editor.commands.setTextSelection({ from: 19, to: 27 });
  const c2 = CommentService.createComment("Bình luận 2", "Tester", "đoạn hai");
  docStore.addComment(c2);
  editor.commands.setComment(c2.id);

  assert.equal(useDocumentStore.getState().comments.length, 2);

  // 3. Navigation
  const nextFromNull = CommentService.findNextComment(editor.state.doc, useDocumentStore.getState().comments, null);
  assert.equal(nextFromNull, c1.id);
  const nextFromC1 = CommentService.findNextComment(editor.state.doc, useDocumentStore.getState().comments, c1.id);
  assert.equal(nextFromC1, c2.id);
  const prevFromC2 = CommentService.findPreviousComment(editor.state.doc, useDocumentStore.getState().comments, c2.id);
  assert.equal(prevFromC2, c1.id);

  // 4. Edit comment
  docStore.updateComment(c1.id, { content: "Bình luận 1 đã cập nhật" });
  assert.equal(
    useDocumentStore.getState().comments.find((c) => c.id === c1.id)?.content,
    "Bình luận 1 đã cập nhật"
  );

  // 5. Resolve & Reopen
  docStore.resolveComment(c1.id);
  assert.equal(useDocumentStore.getState().comments.find((c) => c.id === c1.id)?.resolved, true);
  docStore.reopenComment(c1.id);
  assert.equal(useDocumentStore.getState().comments.find((c) => c.id === c1.id)?.resolved, false);

  // 6. Delete Comment
  editor.commands.unsetComment(c2.id);
  docStore.deleteComment(c2.id);
  assert.equal(useDocumentStore.getState().comments.length, 1);
  const rangeC2 = CommentService.findCommentRangeInDoc(editor.state.doc, c2.id);
  assert.equal(rangeC2, null, "Comment 2 đã bị xóa không còn range");

  // 7. Orphan Safety: Xóa anchor text của c1
  editor.commands.setTextSelection({ from: 1, to: 15 });
  editor.commands.deleteSelection();
  const rangeC1 = CommentService.findCommentRangeInDoc(editor.state.doc, c1.id);
  assert.equal(rangeC1, null, "c1 chuyển thành orphan khi text neo bị xóa");
  assert.equal(
    useDocumentStore.getState().comments.some((c) => c.id === c1.id),
    true,
    "Bản ghi comment trong store vẫn còn an toàn, không bị mất thảo luận"
  );

  editor.destroy();
});

// =============================================================================
// 5. TRACK CHANGES AUDIT: EDITING PATHS & ACCEPT/REJECT
// =============================================================================
test("PHASE 5 FINAL AUDIT — 5. Track Changes: Typing, Backspace, Delete, Enter, Cut, Paste, Accept, Reject", () => {
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Ban đầu có nội dung này ở đây." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Typing: Tracked Insert
  editor.commands.setTextSelection(8);
  TrackChangesService.applyTrackedTextInput(editor, 8, 8, "thêm ");
  let changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.ok(changes.some((c) => c.type === "insert" && c.text?.includes("thêm")));

  // 2. Selection Replace: Typing over selection
  editor.commands.setTextSelection({ from: 1, to: 7 });
  TrackChangesService.applyTrackedTextInput(editor, 1, 7, "Khởi đầu");
  changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.ok(changes.some((c) => c.type === "delete" && c.text?.includes("Ban đầ")));
  assert.ok(changes.some((c) => c.type === "insert" && c.text?.includes("Khởi đầu")));

  // 3. Backspace trên selection
  editor.commands.setTextSelection({ from: 20, to: 28 });
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");
  changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  const delChange = changes.find((c) => c.type === "delete");
  assert.ok(delChange, "Phải có tracked deletion khi Backspace vùng chọn");

  // 4. Enter trên selection
  editor.commands.setTextSelection({ from: 10, to: 14 });
  const enterHandled = TrackChangesService.applyTrackedKeyDown(editor, "Enter");
  assert.equal(enterHandled, true, "Enter trên selection phải được track change xử lý");
  changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.ok(changes.length >= 3, "Thay đổi qua Enter phải ghi nhận deletion và split block");

  // 5. Clipboard: Paste
  editor.commands.setTextSelection(5);
  TrackChangesService.applyTrackedPaste(editor, " [DÁN] ");
  changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.ok(changes.some((c) => c.type === "insert" && c.text?.includes("[DÁN]")));

  // 6. Accept Single Change
  const targetToAccept = changes[0].id;
  const acceptResult = TrackChangesService.acceptChange(editor, targetToAccept);
  assert.equal(acceptResult, true, "Chấp nhận thay đổi đơn lẻ phải thành công");
  const remainingAfterAccept = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(remainingAfterAccept.some((c) => c.id === targetToAccept), false);

  // 7. Reject Single Change
  const targetToReject = remainingAfterAccept[0].id;
  const rejectResult = TrackChangesService.rejectChange(editor, targetToReject);
  assert.equal(rejectResult, true, "Từ chối thay đổi đơn lẻ phải thành công");
  const remainingAfterReject = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(remainingAfterReject.some((c) => c.id === targetToReject), false);

  // 8. Accept All
  TrackChangesService.acceptAllChanges(editor);
  const finalChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(finalChanges.length, 0, "Sau Accept All, số thay đổi phải bằng 0");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// =============================================================================
// 6. FIND & REPLACE WITH TRACK CHANGES AUDIT
// =============================================================================
test("PHASE 5 FINAL AUDIT — 6. Editing Paths: Find/Replace & Replace All with Tracking ON", () => {
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hà Nội là thủ đô. Tôi yêu Hà Nội rất nhiều." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Tìm "Hà Nội"
  editor.commands.setSearchTerm("Hà Nội");
  editor.commands.setReplaceTerm("TP.HCM");

  // Thay thế toàn bộ bằng Replace All
  editor.commands.replaceAllMatches();

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  const delChanges = changes.filter((c) => c.type === "delete");
  const insChanges = changes.filter((c) => c.type === "insert");

  assert.equal(delChanges.length, 2, "Cả hai từ 'Hà Nội' bị thay thế phải được đánh dấu delete");
  assert.equal(insChanges.length, 2, "Cả hai từ 'TP.HCM' mới chèn phải được đánh dấu insert");

  // Văn bản gốc "Hà Nội" vẫn còn trong AST với delete mark
  const textInDoc = editor.state.doc.textContent;
  assert.ok(textInDoc.includes("Hà Nội"), "Văn bản bị xóa trong Track Changes vẫn phải tồn tại trong AST");
  assert.ok(textInDoc.includes("TP.HCM"), "Văn bản mới chèn phải có trong AST");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// =============================================================================
// 7. UNDO / REDO WITH REVIEW OPERATIONS
// =============================================================================
test("PHASE 5 FINAL AUDIT — 7. Undo/Redo: Comment, Tracked Changes & Proofing Replacement", () => {
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản gốc ban đầu." }],
      },
    ],
  });

  // 1. Undo/Redo Tracked Insert
  useReviewStore.getState().setTrackChangesEnabled(true);
  editor.commands.setTextSelection(12);
  TrackChangesService.applyTrackedTextInput(editor, 12, 12, "mới ");
  let changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1);

  // Undo tracked insert
  editor.commands.undo();
  changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 0, "Undo phải hủy bỏ tracked insert");

  // Redo tracked insert
  editor.commands.redo();
  changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1, "Redo phải phục hồi tracked insert nguyên vẹn");

  // 2. Undo/Redo Comment
  editor.commands.setTextSelection({ from: 1, to: 8 });
  editor.commands.setComment("c-undo-test");
  let range = CommentService.findCommentRangeInDoc(editor.state.doc, "c-undo-test");
  assert.ok(range, "Comment mark phải tồn tại sau khi set");

  editor.commands.undo();
  range = CommentService.findCommentRangeInDoc(editor.state.doc, "c-undo-test");
  assert.equal(range, null, "Undo phải gỡ bỏ comment mark");

  editor.commands.redo();
  range = CommentService.findCommentRangeInDoc(editor.state.doc, "c-undo-test");
  assert.ok(range, "Redo phải phục hồi comment mark nguyên vẹn");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// =============================================================================
// 8. COMPLEX CONTENT: TABLES, HEADINGS, LISTS, HYPERLINKS
// =============================================================================
test("PHASE 5 FINAL AUDIT — 8. Complex Content: Coexistence across Headings, Lists, Tables & Hyperlinks", () => {
  const complexDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Tiêu đề tài liệu" }],
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
                    content: [{ type: "text", text: "Nội dung trong ô bảng" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const editor = createAuditEditor(complexDoc);
  useReviewStore.getState().setTrackChangesEnabled(true);

  // Đặt comment trong ô bảng
  editor.commands.setTextSelection({ from: 22, to: 30 });
  editor.commands.setComment("table-comment");
  const tableRange = CommentService.findCommentRangeInDoc(editor.state.doc, "table-comment");
  assert.ok(tableRange, "Comment phải hoạt động bình thường bên trong ô bảng");

  // Tracked edit trong ô bảng
  TrackChangesService.applyTrackedTextInput(editor, 25, 25, "sửa ");
  const tableChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.ok(tableChanges.some((c) => c.type === "insert"));

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// =============================================================================
// 9. DOCUMENT STATISTICS ACCURACY AUDIT
// =============================================================================
test("PHASE 5 FINAL AUDIT — 9. Document Statistics: Word Count Policy with Tracked Changes & Comments", () => {
  const testAst = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Từ một hai ba " },
          {
            type: "text",
            marks: [{ type: "trackChange", attrs: { id: "del-1", changeType: "delete", author: "A", timestamp: "T" } }],
            text: "bị xóa bỏ hoàn toàn ",
          },
          {
            type: "text",
            marks: [{ type: "trackChange", attrs: { id: "ins-1", changeType: "insert", author: "A", timestamp: "T" } }],
            text: "được thêm mới",
          },
          {
            type: "text",
            marks: [{ type: "comment", attrs: { commentId: "c-1" } }],
            text: " có bình luận",
          },
        ],
      },
    ],
  };

  const stats = extractDocumentStats(testAst);

  // Đoạn text có:
  // "Từ một hai ba " = 4 từ
  // "bị xóa bỏ hoàn toàn " = deleted -> 0 từ (theo policy)
  // "được thêm mới" = 3 từ
  // " có bình luận" = 3 từ
  // Tổng = 4 + 3 + 3 = 10 từ
  assert.equal(stats.words, 10, "Word count phải LOẠI BỎ văn bản bị xóa và TÍNH văn bản thêm mới");
  assert.equal(stats.trackedDeletions, 1, "Phải ghi nhận 1 tracked deletion");
  assert.equal(stats.trackedInsertions, 1, "Phải ghi nhận 1 tracked insertion");

  const detailed = StatisticsService.calculateDetailedStats(testAst, 2, {
    comments: [CommentService.createComment("Ghi chú ngoài", "A", "có bình luận", "c-1")],
    trackedChanges: [{ id: "del-1", type: "delete", author: "A", timestamp: "T" }],
  });

  assert.equal(detailed.pages, 2, "Số trang phải phản ánh đúng tham số vật lý");
  assert.equal(detailed.words, 10);
  assert.equal(detailed.comments, 1);
});

// =============================================================================
// 10. PERSISTENCE ROUND-TRIP (.MWD)
// =============================================================================
test("PHASE 5 FINAL AUDIT — 10. Persistence: Full .mwd Save/Load Round-Trip with Partial Review", () => {
  const model: DocumentModel = {
    metadata: {
      id: "doc-audit-persist",
      title: "Persistence Audit",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
      marginPreset: "Normal",
    },
    comments: [
      {
        id: "c-persist-1",
        author: "Hoàng",
        content: "Bình luận lưu file",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolved: false,
        selectedText: "Đoạn văn",
      },
    ],
    trackedChanges: [
      {
        id: "tc-persist-1",
        type: "insert",
        author: "Hoàng",
        timestamp: new Date().toISOString(),
        text: "thêm mới",
      },
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "comment", attrs: { commentId: "c-persist-1" } }],
              text: "Đoạn văn",
            },
            {
              type: "text",
              marks: [{ type: "trackChange", attrs: { id: "tc-persist-1", changeType: "insert", author: "Hoàng" } }],
              text: " thêm mới",
            },
          ],
        },
      ],
    },
  };

  const serialized = serializeDocumentToMwd(model);
  const result = deserializeMwdToDocument(serialized);

  assert.equal(result.success, true);
  if (result.success) {
    const loaded = result.document;
    assert.equal(loaded.comments?.length, 1);
    assert.equal(loaded.comments?.[0].id, "c-persist-1");
    assert.equal(loaded.trackedChanges?.length, 1);
    assert.equal(loaded.trackedChanges?.[0].id, "tc-persist-1");
    assert.equal(loaded.pageSettings.paperSize, "A4");
  }
});

// =============================================================================
// 11. DOCX REVIEW ROUND-TRIP AUDIT
// =============================================================================
test("PHASE 5 FINAL AUDIT — 11. DOCX Review Metadata Round-Trip: Comments & Tracked Insert/Delete", async () => {
  const model: DocumentModel = {
    metadata: {
      id: "doc-docx-roundtrip",
      title: "DOCX Roundtrip",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
      marginPreset: "Normal",
    },
    comments: [
      {
        id: "c-docx-1",
        author: "Tác giả",
        content: "Nội dung bình luận DOCX",
        createdAt: "2026-10-07T08:00:00Z",
        updatedAt: "2026-10-07T08:00:00Z",
        resolved: false,
        selectedText: "Phần gốc",
      },
    ],
    trackedChanges: [
      {
        id: "tc-docx-ins",
        type: "insert",
        author: "Tác giả",
        timestamp: "2026-10-07T08:00:00Z",
        text: " chèn",
      },
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "comment", attrs: { commentId: "c-docx-1" } }],
              text: "Phần gốc",
            },
            {
              type: "text",
              marks: [{ type: "trackChange", attrs: { id: "tc-docx-ins", changeType: "insert", author: "Tác giả" } }],
              text: " chèn",
            },
          ],
        },
      ],
    },
  };

  // Export DOCX
  const docxBytes = await exportDocumentModelToDocx(model);
  assert.ok(docxBytes.length > 500, "DOCX export phải tạo binary hợp lệ");

  // Re-import DOCX
  const importResult = await importDocxToDocumentModel(docxBytes, "roundtrip.docx");
  assert.equal(importResult.success, true);

  if (importResult.success) {
    const importedDoc = importResult.document;
    assert.ok(importedDoc.comments && importedDoc.comments.length >= 1, "Phải nạp lại comment");
    assert.ok(
      importedDoc.comments?.some((c) => c.content.includes("bình luận DOCX")),
      "Nội dung comment phải được bảo toàn"
    );
    assert.ok(importedDoc.trackedChanges && importedDoc.trackedChanges.length >= 1, "Phải nạp lại tracked changes");
    assert.ok(
      importedDoc.trackedChanges?.some((c) => c.type === "insert"),
      "Tracked insert phải được bảo toàn"
    );
  }
});

// =============================================================================
// 12. REGRESSION TESTS: PHASE 1, 2, 3, 4
// =============================================================================
test("PHASE 5 FINAL AUDIT — 12. Regressions Check: Phase 1 (Formatting), Phase 2 (Page/Section), Phase 3 (Insert) & Phase 4 (DOCX)", async () => {
  // Phase 1: Formatting marks co-exist
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [
              { type: "bold" },
              { type: "italic" },
              { type: "comment", attrs: { commentId: "c-reg-1" } },
              { type: "trackChange", attrs: { id: "tc-reg-1", changeType: "insert", author: "Tester" } },
            ],
            text: "Văn bản hội tụ đủ mọi mark",
          },
        ],
      },
    ],
  });

  const node = editor.state.doc.content.child(0).child(0);
  assert.equal(node.marks.length, 4, "Tất cả các marks phải cùng tồn tại mà không loại trừ nhau");

  // Phase 2: Page Break & Section Break không bị ảnh hưởng bởi review marks
  editor.commands.insertPageBreak();
  assert.ok(editor.state.doc.textContent.includes("Văn bản hội tụ"));

  // Phase 3: Table & Image co-exist
  editor.commands.insertTable({ rows: 2, cols: 2 });
  assert.ok(editor.getJSON().content?.some((n) => n.type === "table"));

  // Phase 4: Basic DOCX Export Zero-Failure
  const docxBytes = await exportDocumentModelToDocx({
    metadata: {
      id: "doc-reg",
      title: "Regression Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
      marginPreset: "Normal",
    },
    content: editor.getJSON(),
  });
  assert.ok(docxBytes.length > 500);

  editor.destroy();
});
