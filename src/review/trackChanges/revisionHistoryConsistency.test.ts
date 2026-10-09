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
  setLineSpacing,
  undo,
  redo,
} from "../../editor/editorCommands.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import { applyParagraphStyle } from "../../styles/services/applyStyleService.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm cho Phase 9 Revision History Consistency." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. UNDO / REDO CAPTURE (CHARACTER & PARAGRAPH)
// -----------------------------------------------------------------------------
test("PHASE 9 — 1. Capture History: Undo reverts formatting and removes pending revision; Redo restores both", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Chữ này sẽ được đổi cỡ từ 12 lên 16." }],
      },
    ],
  });

  useReviewStore.setState({
    trackChangesEnabled: true,
    currentUser: { id: "u-auditor", name: "Nguyễn Văn A", color: "#6366f1" },
  });

  // 1.1 Character Formatting: Pos 1..8 -> FontSize 16pt
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  setFontSize(editor, "16pt");

  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Phải có 1 format revision");
  const revId = spans[0].id;
  assert.equal(Number(spans[0].propertyDiffs?.[0]?.after), 16);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1, "DocumentStore phải được đồng bộ");

  // 1.2 Undo: Trở về cỡ chữ ban đầu, revision metadata biến mất
  undo(editor);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0, "Undo phải gỡ bỏ hoàn toàn pending revision");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0, "DocumentStore phải rỗng sau Undo");

  const textNodeAfterUndo = editor.state.doc.child(0).child(0);
  const textStyleAfterUndo = textNodeAfterUndo.marks.find((m) => m.type.name === "textStyle");
  assert.ok(
    !textStyleAfterUndo || !textStyleAfterUndo.attrs.fontSize || textStyleAfterUndo.attrs.fontSize !== "16pt",
    "Cỡ chữ 16pt phải bị hoàn tác"
  );

  // 1.3 Redo: Phục hồi cỡ chữ 16pt VÀ phục hồi revision với đúng ID ban đầu
  redo(editor);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Redo phải khôi phục pending revision");
  assert.equal(spans[0].id, revId, "Revision ID phải giữ nguyên sau Redo, không bị nhân bản");
  assert.equal(Number(spans[0].propertyDiffs?.[0]?.after), 16);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1, "DocumentStore phải khôi phục 1 revision");
});

test("PHASE 9 — 1.2 Paragraph Capture History: Undo/Redo khôi phục chính xác căn lề và block revision", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true });

  // Paragraph formatting: Alignment -> Center
  setTextAlign(editor, "center");

  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Phải có 1 paragraph format revision");
  const revId = spans[0].id;
  assert.equal(editor.state.doc.child(0).attrs.textAlign, "center");

  // Undo
  undo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0, "Undo phải gỡ bỏ block revision");
  assert.ok(
    !editor.state.doc.child(0).attrs.textAlign || editor.state.doc.child(0).attrs.textAlign === "left",
    "Căn lề phải quay về mặc định"
  );
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);

  // Redo
  redo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Redo phải khôi phục block revision");
  assert.equal(spans[0].id, revId, "Block revision ID phải giữ nguyên");
  assert.equal(editor.state.doc.child(0).attrs.textAlign, "center");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1);
});

// -----------------------------------------------------------------------------
// 2. UNDO / REDO ACCEPT (CHARACTER & PARAGRAPH)
// -----------------------------------------------------------------------------
test("PHASE 9 — 2. Accept History: Undo phục hồi revision metadata đang chờ duyệt; Redo chấp nhận lại", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra Accept -> Undo -> Redo." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // 1. Tạo character format revision (Bold)
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  toggleBold(editor);

  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1);
  const revId = spans[0].id;

  // 2. Chấp nhận revision: Bold giữ nguyên, metadata bị gỡ bỏ
  const accepted = TrackChangesService.acceptChange(editor, revId);
  assert.equal(accepted, true);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0, "Không còn revision sau khi Accept");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);

  const formattedNode = editor.state.doc.child(0).child(0);
  assert.ok(formattedNode.marks.some((m) => m.type.name === "bold"), "Bold vẫn phải tồn tại");

  // 3. Undo: Khôi phục pending revision VÀ giữ Bold
  undo(editor);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Undo phải khôi phục revision metadata");
  assert.equal(spans[0].id, revId, "ID của revision được phục hồi phải chính xác");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1, "Store phải cập nhật lại 1 revision");

  // 4. Redo: Chấp nhận lại revision
  redo(editor);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0, "Redo phải gỡ bỏ revision metadata");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);
});

test("PHASE 9 — 2.2 Paragraph Accept History: Undo khôi phục block format revision", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true });

  setLineSpacing(editor, "1.5");
  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1);
  const revId = spans[0].id;

  // Accept
  TrackChangesService.acceptChange(editor, revId);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
  assert.equal(editor.state.doc.child(0).attrs.lineSpacing, "1.5");

  // Undo
  undo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Undo phải khôi phục block revision");
  assert.equal(spans[0].id, revId);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1);

  // Redo
  redo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
});

// -----------------------------------------------------------------------------
// 3. UNDO / REDO REJECT (CHARACTER & PARAGRAPH)
// -----------------------------------------------------------------------------
test("PHASE 9 — 3. Reject History: Undo phục hồi lại formatting và pending revision; Redo từ chối lại", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra Reject -> Undo -> Redo." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // 1. Tạo character format revision: TextColor đỏ
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  setTextColor(editor, "#dc2626");

  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1);
  const revId = spans[0].id;

  // 2. Từ chối revision: Màu chữ trở về trước, metadata gỡ bỏ
  const rejected = TrackChangesService.rejectChange(editor, revId);
  assert.equal(rejected, true);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);

  // 3. Undo: Màu chữ trở lại màu đỏ VÀ pending revision được khôi phục
  undo(editor);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Undo phải phục hồi pending revision");
  assert.equal(spans[0].id, revId, "ID revision phải khớp chính xác");

  const restoredTextNode = editor.state.doc.child(0).child(0);
  const textStyle = restoredTextNode.marks.find((m) => m.type.name === "textStyle");
  assert.equal(textStyle?.attrs?.color, "#dc2626", "Màu chữ đỏ phải được khôi phục sau Undo");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1);

  // 4. Redo: Từ chối lại
  redo(editor);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);
});

// -----------------------------------------------------------------------------
// 4. UNDO / REDO BULK (ACCEPT ALL & REJECT ALL ATOMIC STEP)
// -----------------------------------------------------------------------------
test("PHASE 9 — 4. Bulk History: Accept All và Reject All hoàn tác/làm lại trong đúng 1 bước atomic", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn một hai ba bốn năm sáu bảy." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // 1. Tạo 3 loại revision khác nhau:
  // - Revision 1 (Format): "Đoạn một" -> Bold
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  toggleBold(editor);

  // - Revision 2 (Delete): "hai ba"
  editor.chain().setTextSelection({ from: 9, to: 15 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  // - Revision 3 (Insert): chèn ở cuối
  const endPos = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endPos, endPos, " [thêm]");

  let initialSpans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(initialSpans.length, 3, "Phải có đúng 3 revisions ban đầu");
  const initialIds = initialSpans.map((s) => s.id);

  // 4.1 Accept All
  TrackChangesService.acceptAllChanges(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);

  // 4.2 Undo Accept All trong ĐÚNG 1 BƯỚC
  undo(editor);

  let restoredSpans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(restoredSpans.length, 3, "Undo phải khôi phục toàn bộ 3 revisions trong 1 bước");
  const restoredIds = restoredSpans.map((s) => s.id);
  assert.deepEqual(restoredIds, initialIds, "Toàn bộ ID phải khớp chính xác");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 3, "Store phải có đúng 3 items");

  // 4.3 Redo Accept All trong ĐÚNG 1 BƯỚC
  redo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);

  // 4.4 Undo lại để chuẩn bị test Reject All
  undo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 3);

  // 4.5 Reject All
  TrackChangesService.rejectAllChanges(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);

  // 4.6 Undo Reject All
  undo(editor);
  restoredSpans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(restoredSpans.length, 3, "Undo Reject All phải phục hồi đủ 3 revisions");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 3);

  // 4.7 Redo Reject All
  redo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
});

// -----------------------------------------------------------------------------
// 5. MULTIPLE SEQUENTIAL PENDING REVISIONS
// -----------------------------------------------------------------------------
test("PHASE 9 — 5. Sequential Revisions: Multi-step Undo/Redo khôi phục từng revision theo đúng thứ tự", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "TừMột TừHai TừBa kết thúc." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // Step 1: Format TừMột -> Bold
  editor.chain().setTextSelection({ from: 1, to: 6 }).run();
  toggleBold(editor);

  // Step 2: Format TừHai -> Color
  editor.chain().setTextSelection({ from: 7, to: 12 }).run();
  setTextColor(editor, "#2563eb");

  // Step 3: Format TừBa -> Size
  editor.chain().setTextSelection({ from: 13, to: 17 }).run();
  setFontSize(editor, "18pt");

  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 3);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 3);

  // Undo Step 3 -> còn 2
  undo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 2);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 2);

  // Undo Step 2 -> còn 1
  undo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 1);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1);

  // Undo Step 1 -> còn 0
  undo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);

  // Redo Step 1 -> có 1
  redo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 1);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 1);

  // Redo Step 2 -> có 2
  redo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 2);

  // Redo Step 3 -> có 3
  redo(editor);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 3);
  assert.equal(useDocumentStore.getState().trackedChanges.length, 3);
});

// -----------------------------------------------------------------------------
// 6. OVERLAPPING REVISIONS HISTORY INTEGRITY
// -----------------------------------------------------------------------------
test("PHASE 9 — 6. Overlapping Revisions: Undo/Redo bảo toàn các lớp định dạng chồng lấn", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản chồng lấn hai định dạng." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // Layer 1: Bold trên "Văn bản"
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor);

  // Layer 2: Color trên "Văn bản"
  setTextColor(editor, "#dc2626");

  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 2, "Có 2 format revisions");
  const [rev1, rev2] = spans;

  // Reject Layer 2 (Color)
  TrackChangesService.rejectChange(editor, rev2.id);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Chỉ còn Layer 1");
  assert.equal(spans[0].id, rev1.id);

  // Undo Reject Layer 2
  undo(editor);

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 2, "Cả hai layer được khôi phục sau Undo");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 2);

  // Undo Layer 2 creation
  undo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Chỉ còn Layer 1 sau khi Undo creation Layer 2");

  // Undo Layer 1 creation
  undo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0, "Không còn layer nào sau khi Undo toàn bộ");
  assert.equal(useDocumentStore.getState().trackedChanges.length, 0);
});

// -----------------------------------------------------------------------------
// 7. STYLE ASSIGNMENT HISTORY CONSISTENCY
// -----------------------------------------------------------------------------
test("PHASE 9 — 7. Style Assignment History: Undo/Redo khôi phục stable style reference và inheritance", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true });

  // Apply Paragraph Style
  applyParagraphStyle(editor, "style_thesis_body");

  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1);
  assert.equal(editor.state.doc.child(0).attrs.styleId, "style_thesis_body");
  const revId = spans[0].id;

  // Undo -> styleId trở về mặc định
  undo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0);
  assert.ok(
    !editor.state.doc.child(0).attrs.styleId || editor.state.doc.child(0).attrs.styleId === "style_normal",
    "Style ID phải quay về mặc định"
  );

  // Redo -> styleId trở lại style_thesis_body
  redo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].id, revId, "Revision ID style assignment phải khớp");
  assert.equal(editor.state.doc.child(0).attrs.styleId, "style_thesis_body");

  // Accept Style Revision
  TrackChangesService.acceptChange(editor, revId);
  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
  assert.equal(editor.state.doc.child(0).attrs.styleId, "style_thesis_body");

  // Undo Accept
  undo(editor);
  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].id, revId);
});

// -----------------------------------------------------------------------------
// 8. NO TRANSACTION FEEDBACK LOOP / ORIGIN GUARD
// -----------------------------------------------------------------------------
test("PHASE 9 — 8. Feedback Loop Guard: isReviewOrHistoryTransaction nhận diện chính xác metadata", () => {
  const editor = createTestEditor();

  const tr = editor.state.tr;
  assert.equal(TrackChangesService.isReviewOrHistoryTransaction(tr), false, "Normal transaction không có guard");

  tr.setMeta("trackChangeOperation", { type: "accept", targetId: "rev-1" });
  assert.equal(TrackChangesService.isReviewOrHistoryTransaction(tr), true, "Review operation transaction có guard");

  const trHist = editor.state.tr;
  trHist.setMeta("history$", true);
  assert.equal(TrackChangesService.isReviewOrHistoryTransaction(trHist), true, "History transaction có guard");

  const trRev = editor.state.tr;
  trRev.setMeta("trackChangeRevision", "rev-2");
  assert.equal(TrackChangesService.isReviewOrHistoryTransaction(trRev), true, "Revision creation transaction có guard");
});

// -----------------------------------------------------------------------------
// 9. RECONCILIATION OF ACTIVE CHANGE ID ON UNDO
// -----------------------------------------------------------------------------
test("PHASE 9 — 9. Active Change ID Reconciliation: Reconciled cleanly when undone", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true });

  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  toggleBold(editor);

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1);
  const revId = spans[0].id;

  useReviewStore.setState({ activeChangeId: revId });
  assert.equal(useReviewStore.getState().activeChangeId, revId);

  // Undo revision creation
  undo(editor);

  assert.equal(TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length, 0);
  assert.equal(
    useReviewStore.getState().activeChangeId,
    null,
    "activeChangeId phải được reset về null khi revision tương ứng bị Undo"
  );
});
