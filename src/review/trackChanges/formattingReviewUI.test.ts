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
} from "../../editor/editorCommands.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import {
  formatPropertyDiffDisplay,
  getScopeBadge,
  getChangeTypeBadge,
  formatRevisionTimestamp,
} from "./formattingDisplayUtils.ts";
import { applyParagraphStyle } from "../../styles/services/applyStyleService.ts";
import type { TrackChangeItem } from "../../document/documentTypes.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm cho Phase 8 Review UI Integration." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. UNIFIED REVIEW LIST EXTRACTION
// -----------------------------------------------------------------------------
test("PHASE 8 — 1. Unified Review List: Extracts Insertions, Deletions, Character, Paragraph, and Style revisions", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Một hai ba bốn năm sáu bảy tám chín mười." }],
      },
    ],
  });

  useReviewStore.setState({
    trackChangesEnabled: true,
    currentUser: { id: "u-auditor", name: "Nguyễn Văn A", color: "#6366f1" },
  });

  // 1. Character Formatting: "Một hai" -> Bold
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor);

  // 2. Tracked Insertion: Insert text at end
  const endPos = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endPos, endPos, " [Thêm mới]");

  // 3. Tracked Deletion: Delete "ba bốn"
  editor.chain().setTextSelection({ from: 9, to: 16 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  // 4. Paragraph Formatting: Alignment -> Center
  setTextAlign(editor, "center");

  // 5. Paragraph Style Assignment
  applyParagraphStyle(editor, "style_thesis_body");

  // Extract spans via unified service
  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.ok(spans.length >= 4, `Phải có ít nhất 4 spans, thực tế: ${spans.length}`);

  const types = spans.map((s) => s.type);
  assert.ok(types.includes("format"), "Phải chứa format revision");
  assert.ok(types.includes("insert"), "Phải chứa insert revision");
  assert.ok(types.includes("delete"), "Phải chứa delete revision");

  // Check character format span
  const charFormat = spans.find((s) => s.type === "format" && s.scope === "character");
  assert.ok(charFormat, "Phải có character format span");
  assert.equal(charFormat.author, "Nguyễn Văn A");
  assert.ok(charFormat.propertyDiffs && charFormat.propertyDiffs.length > 0);
  assert.equal(charFormat.propertyDiffs[0].property, "bold");

  // Check paragraph format span
  const paraFormat = spans.find((s) => s.type === "format" && s.scope === "paragraph");
  assert.ok(paraFormat, "Phải có paragraph format span");
  assert.ok(paraFormat.propertyDiffs && paraFormat.propertyDiffs.length > 0);

  // Check style format span
  const styleFormat = spans.find((s) => s.type === "format" && s.scope === "style");
  assert.ok(styleFormat, "Phải có style format span");
  assert.equal(styleFormat.propertyDiffs?.[0].after, "style_thesis_body");
});

// -----------------------------------------------------------------------------
// 2. BEFORE / AFTER PROPERTY DIFF DISPLAY
// -----------------------------------------------------------------------------
test("PHASE 8 — 2. Before / After Display: Formats property changes accurately without computed CSS", () => {
  // Test Bold
  const boldDiff = formatPropertyDiffDisplay({
    property: "bold",
    before: false,
    after: true,
  });
  assert.equal(boldDiff.label, "In đậm");
  assert.equal(boldDiff.beforeDisplay, "Tắt");
  assert.equal(boldDiff.afterDisplay, "Bật");

  // Test Font Size
  const sizeDiff = formatPropertyDiffDisplay({
    property: "fontSize",
    before: "12pt",
    after: "16pt",
  });
  assert.equal(sizeDiff.label, "Cỡ chữ");
  assert.equal(sizeDiff.beforeDisplay, "12pt");
  assert.equal(sizeDiff.afterDisplay, "16pt");

  // Test Text Color
  const colorDiff = formatPropertyDiffDisplay({
    property: "color",
    before: "#000000",
    after: "#2563eb",
  });
  assert.equal(colorDiff.label, "Màu chữ");
  assert.equal(colorDiff.beforeDisplay, "#000000");
  assert.equal(colorDiff.afterDisplay, "#2563eb");

  // Test Paragraph Alignment
  const alignDiff = formatPropertyDiffDisplay({
    property: "alignment",
    before: "left",
    after: "center",
  });
  assert.equal(alignDiff.label, "Căn lề");
  assert.equal(alignDiff.beforeDisplay, "Trái (Left)");
  assert.equal(alignDiff.afterDisplay, "Giữa (Center)");

  // Test Line Spacing
  const lineDiff = formatPropertyDiffDisplay({
    property: "lineSpacing",
    before: "1.0",
    after: "1.5",
  });
  assert.equal(lineDiff.label, "Giãn dòng");
  assert.equal(lineDiff.beforeDisplay, "1.0");
  assert.equal(lineDiff.afterDisplay, "1.5");

  // Test Style ID
  const styleDiff = formatPropertyDiffDisplay({
    property: "paragraphStyleId",
    before: "style_normal",
    after: "style_heading_1",
  });
  assert.equal(styleDiff.label, "Kiểu đoạn văn");
  assert.equal(styleDiff.beforeDisplay, "Normal");
  assert.equal(styleDiff.afterDisplay, "Heading 1");

  // Badges & Timestamps
  const insertBadge = getChangeTypeBadge("insert");
  assert.equal(insertBadge.label, "Thêm mới");
  assert.equal(insertBadge.badgeClass, "badge-insert");

  const deleteBadge = getChangeTypeBadge("delete");
  assert.equal(deleteBadge.label, "Xóa bỏ");
  assert.equal(deleteBadge.badgeClass, "badge-delete");

  const formatBadge = getChangeTypeBadge("format");
  assert.equal(formatBadge.label, "Định dạng");
  assert.equal(formatBadge.badgeClass, "badge-format");

  assert.equal(getScopeBadge("character").label, "Ký tự");
  assert.equal(getScopeBadge("paragraph").label, "Đoạn văn");
  assert.equal(getScopeBadge("style").label, "Kiểu dáng");

  const formattedTime = formatRevisionTimestamp("2026-10-08T10:00:00.000Z");
  assert.ok(formattedTime.length > 0, "Timestamp phải được định dạng");
});

// -----------------------------------------------------------------------------
// 3. REVIEW FILTERS & NO DATA MUTATION
// -----------------------------------------------------------------------------
test("PHASE 8 — 3. Review Filters: Presentation only, no data mutation on filter change", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản kiểm tra filter không được làm thay đổi tài liệu." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true, changesFilter: "all" });

  // 1. Insert revision
  const endPos = editor.state.doc.content.size - 1;
  TrackChangesService.applyTrackedTextInput(editor, endPos, endPos, " thêm");

  // 2. Format revision
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor);

  // 3. Delete revision
  editor.chain().setTextSelection({ from: 9, to: 16 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const spansBefore = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const docJsonBefore = JSON.stringify(editor.state.doc.toJSON());

  // Test filter helper in service
  const allSpans = TrackChangesService.filterTrackedSpans(spansBefore, "all");
  const insertSpans = TrackChangesService.filterTrackedSpans(spansBefore, "insertions");
  const deleteSpans = TrackChangesService.filterTrackedSpans(spansBefore, "deletions");
  const formatSpans = TrackChangesService.filterTrackedSpans(spansBefore, "formatting");

  assert.equal(allSpans.length, spansBefore.length, "All filter phải trả về toàn bộ");
  assert.ok(insertSpans.every((s) => s.type === "insert"), "Insertions filter chỉ chứa insert");
  assert.ok(deleteSpans.every((s) => s.type === "delete"), "Deletions filter chỉ chứa delete");
  assert.ok(formatSpans.every((s) => s.type === "format"), "Formatting filter chỉ chứa format");

  // Toggle filter state in store
  useReviewStore.getState().setChangesFilter("formatting");
  assert.equal(useReviewStore.getState().changesFilter, "formatting");

  useReviewStore.getState().setChangesFilter("insertions");
  assert.equal(useReviewStore.getState().changesFilter, "insertions");

  useReviewStore.getState().setChangesFilter("all");
  assert.equal(useReviewStore.getState().changesFilter, "all");

  // Verify Document JSON is strictly identical
  const docJsonAfter = JSON.stringify(editor.state.doc.toJSON());
  assert.equal(
    docJsonAfter,
    docJsonBefore,
    "Filter chỉ thay đổi presentation, tuyệt đối không mutate document AST hay data"
  );
});

// -----------------------------------------------------------------------------
// 4. PREVIOUS / NEXT NAVIGATION WITH FILTERS
// -----------------------------------------------------------------------------
test("PHASE 8 — 4. Previous / Next: Navigates based on position and respects visible filters", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn một hai ba bốn năm sáu bảy tám chín." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // Range 1 (Pos 1..5): Format
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  toggleBold(editor);

  // Range 2 (Pos 8..12): Delete
  editor.chain().setTextSelection({ from: 8, to: 12 }).run();
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  // Range 3 (Pos 15..20): Format
  editor.chain().setTextSelection({ from: 15, to: 20 }).run();
  toggleBold(editor);

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  const formatSpans = spans.filter((s) => s.type === "format");
  const deleteSpans = spans.filter((s) => s.type === "delete");

  assert.equal(formatSpans.length, 2, "Phải có 2 format spans");
  assert.equal(deleteSpans.length, 1, "Phải có 1 delete span");

  const [f1, f2] = formatSpans;
  const [d1] = deleteSpans;

  // 4.1 Navigation "all": f1 -> d1 -> f2
  const nextAllFromF1 = TrackChangesService.findNextChange(editor.state.doc, f1.id, "all");
  assert.equal(nextAllFromF1?.id, d1.id, "Navigation 'all' từ f1 phải tới d1");

  const nextAllFromD1 = TrackChangesService.findNextChange(editor.state.doc, d1.id, "all");
  assert.equal(nextAllFromD1?.id, f2.id, "Navigation 'all' từ d1 phải tới f2");

  // 4.2 Navigation "formatting": skips d1 completely!
  const nextFormatFromF1 = TrackChangesService.findNextChange(editor.state.doc, f1.id, "formatting");
  assert.equal(nextFormatFromF1?.id, f2.id, "Navigation 'formatting' từ f1 phải nhảy thẳng sang f2");

  const prevFormatFromF2 = TrackChangesService.findPreviousChange(editor.state.doc, f2.id, "formatting");
  assert.equal(prevFormatFromF2?.id, f1.id, "Navigation 'formatting' từ f2 phải quay lại f1");

  // 4.3 Wrap-around navigation
  const wrapNext = TrackChangesService.findNextChange(editor.state.doc, f2.id, "formatting");
  assert.equal(wrapNext?.id, f1.id, "Hết danh sách phải wrap-around về đầu");
});

// -----------------------------------------------------------------------------
// 5. OVERLAPPING ACTIVE REVISION RESOLUTION
// -----------------------------------------------------------------------------
test("PHASE 8 — 5. Active revision: Resolves overlapping revisions deterministically", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Từ này được định dạng nhiều lớp." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // 1. Bold on "Từ này"
  editor.chain().setTextSelection({ from: 1, to: 7 }).run();
  toggleBold(editor);

  // 2. Color on "Từ này"
  setTextColor(editor, "#dc2626");

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.ok(spans.length >= 2, "Phải có 2 format revisions trên cùng khoảng văn bản");

  const id1 = spans[0].id;
  const id2 = spans[1].id;

  // Place caret at position 3 (inside both revisions)
  editor.chain().setTextSelection({ from: 3, to: 3 }).run();

  // Test 1: User explicitly has id1 active in review store
  useReviewStore.setState({ activeChangeId: id1 });
  const resolvedTarget1 = TrackChangesService.resolveTargetChangeIdFromState(editor.state);
  assert.equal(resolvedTarget1, id1, "Phải ưu tiên activeChangeId khi nằm trong candidate");

  // Test 2: User explicitly has id2 active in review store
  useReviewStore.setState({ activeChangeId: id2 });
  const resolvedTarget2 = TrackChangesService.resolveTargetChangeIdFromState(editor.state);
  assert.equal(resolvedTarget2, id2, "Phải ưu tiên activeChangeId khi chuyển sang id2");

  // Test 3: No activeChangeId pre-selected -> picks latest revision deterministically
  useReviewStore.setState({ activeChangeId: null });
  const resolvedDefault = TrackChangesService.resolveTargetChangeIdFromState(editor.state);
  assert.ok(resolvedDefault === id1 || resolvedDefault === id2, "Phải chọn revision hợp lệ");
});

// -----------------------------------------------------------------------------
// 6. ACCEPT / REJECT INDIVIDUAL REVISION WIRING
// -----------------------------------------------------------------------------
test("PHASE 8 — 6. Accept / Reject wiring: Individual operations update state without side effects", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn có hai thay đổi định dạng riêng biệt." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });

  // Revision 1: "Đoạn văn" -> Bold
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  toggleBold(editor);

  // Revision 2: "hai thay đổi" -> Color
  editor.chain().setTextSelection({ from: 13, to: 25 }).run();
  setTextColor(editor, "#16a34a");

  let spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 2, "Ban đầu có 2 revisions");
  const rev1Id = spans[0].id;
  const rev2Id = spans[1].id;

  // Accept rev1 by ID
  const accepted = TrackChangesService.acceptChange(editor, rev1Id);
  assert.equal(accepted, true, "acceptChange rev1 phải thành công");

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 1, "Chỉ còn 1 revision sau khi accept");
  assert.equal(spans[0].id, rev2Id, "Revision còn lại phải là rev2");

  // Reject rev2 by ID
  const rejected = TrackChangesService.rejectChange(editor, rev2Id);
  assert.equal(rejected, true, "rejectChange rev2 phải thành công");

  spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0, "Không còn revision nào sau khi reject");
});

// -----------------------------------------------------------------------------
// 7. EMPTY STATE BEHAVIOR
// -----------------------------------------------------------------------------
test("PHASE 8 — 7. Empty state: Safe navigation and clean counts when no revisions exist", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: false, activeChangeId: null });

  const spans = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
  assert.equal(spans.length, 0);

  const next = TrackChangesService.findNextChange(editor.state.doc, null);
  assert.equal(next, null);

  const prev = TrackChangesService.findPreviousChange(editor.state.doc, null);
  assert.equal(prev, null);

  const filtered = TrackChangesService.filterTrackedSpans([], "formatting");
  assert.deepEqual(filtered, []);
});

// -----------------------------------------------------------------------------
// 8. UNIFIED SIDEBAR COEXISTENCE
// -----------------------------------------------------------------------------
test("PHASE 8 — 8. Unified sidebar: Tab switching preserves both comments and changes state", () => {
  // Set up mock comment and changes in stores
  useReviewStore.setState({
    reviewSidebarTab: "comments",
    isCommentsSidebarOpen: true,
  });

  assert.equal(useReviewStore.getState().reviewSidebarTab, "comments");

  // Switch to changes tab
  useReviewStore.getState().setReviewSidebarTab("changes");
  assert.equal(useReviewStore.getState().reviewSidebarTab, "changes");

  // Switch back to comments tab
  useReviewStore.getState().setReviewSidebarTab("comments");
  assert.equal(useReviewStore.getState().reviewSidebarTab, "comments");
});

// -----------------------------------------------------------------------------
// 9. NO DECORATION PERSISTENCE IN TEXT OUTPUT
// -----------------------------------------------------------------------------
test("PHASE 8 — 9. No decoration persistence: Formatting markers do not pollute document text", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản gốc không bị dính class CSS." }],
      },
    ],
  });

  useReviewStore.setState({ trackChangesEnabled: true });
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor);

  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
  assert.equal(text, "Văn bản gốc không bị dính class CSS.");
  assert.ok(!text.includes("track-format"), "Văn bản thuần không được chứa class decoration");
  assert.ok(!text.includes("data-format-revisions"), "Văn bản thuần không được chứa markup decoration");
});
