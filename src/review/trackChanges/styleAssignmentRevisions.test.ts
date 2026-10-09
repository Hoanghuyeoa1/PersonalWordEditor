import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../../editor/editorCommands.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import { applyParagraphStyle } from "../../styles/services/applyStyleService.ts";
import {
  applyCharacterStyle,
  removeCharacterStyle,
} from "../../styles/services/characterStyleService.ts";
import {
  createStyle,
  renameStyle,
} from "../../styles/services/styleManagementService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
} from "../../styles/services/builtInStyles.ts";
import type { TrackChangeItem } from "../../document/documentTypes.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm Style Assignment Revisions Phase 5." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. APPLY / CHANGE / REMOVE PARAGRAPH STYLE (STABLE IDS)
// -----------------------------------------------------------------------------
test("PHASE 5 — 1. Apply, change, and remove Paragraph Style with stable IDs", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true, currentUser: { id: "u1", name: "Hoàng Dev", color: "#3b82f6" } });

  // 1.1 Apply Paragraph Style (Normal -> Thesis Body)
  const applied = applyParagraphStyle(editor, "style_thesis_body");
  assert.equal(applied, true, "applyParagraphStyle phải thành công");

  let pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.styleId, "style_thesis_body");
  assert.equal(Array.isArray(pNode.attrs.formatRevisions), true);
  assert.equal(pNode.attrs.formatRevisions.length, 1);

  const rev1: TrackChangeItem = pNode.attrs.formatRevisions[0];
  assert.equal(rev1.scope, "style");
  assert.equal(rev1.id.startsWith("fmt-style-"), true);
  assert.equal(rev1.author, "Hoàng Dev");
  assert.equal(rev1.status, "pending");

  const diff1 = rev1.formatChange?.changes.find((c) => c.property === "paragraphStyleId");
  assert.ok(diff1, "Phải ghi nhận diff cho paragraphStyleId");
  assert.equal(diff1.before, STYLE_NORMAL_ID);
  assert.equal(diff1.after, "style_thesis_body");

  // 1.2 Change Paragraph Style (Thesis Body -> Callout)
  const changed = applyParagraphStyle(editor, "style_callout");
  assert.equal(changed, true);

  pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.styleId, "style_callout");
  assert.equal(pNode.attrs.formatRevisions.length, 2);

  const rev2: TrackChangeItem = pNode.attrs.formatRevisions[1];
  assert.equal(rev2.scope, "style");
  const diff2 = rev2.formatChange?.changes.find((c) => c.property === "paragraphStyleId");
  assert.ok(diff2);
  assert.equal(diff2.before, "style_thesis_body");
  assert.equal(diff2.after, "style_callout");

  // 1.3 Remove / Reset Paragraph Style back to Normal
  const reset = applyParagraphStyle(editor, STYLE_NORMAL_ID);
  assert.equal(reset, true);

  pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.styleId, null, "Normal style attrs.styleId phải là null");
  assert.equal(pNode.attrs.formatRevisions.length, 3);

  const rev3: TrackChangeItem = pNode.attrs.formatRevisions[2];
  const diff3 = rev3.formatChange?.changes.find((c) => c.property === "paragraphStyleId");
  assert.ok(diff3);
  assert.equal(diff3.before, "style_callout");
  assert.equal(diff3.after, STYLE_NORMAL_ID);

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 2. APPLY / CHANGE / REMOVE CHARACTER STYLE (TEXT RANGES)
// -----------------------------------------------------------------------------
test("PHASE 5 — 2. Apply, change, and remove Character Style on text ranges", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản mẫu có một từ quan trọng tại đây." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true, currentUser: { id: "u1", name: "Linh Test", color: "#10b981" } });

  // Chọn từ "quan trọng" (từ pos 23 đến 33)
  editor.chain().setTextSelection({ from: 23, to: 33 }).run();

  // 2.1 Apply Character Style
  const applied = applyCharacterStyle(editor, "char_strong");
  assert.equal(applied, true);

  // Kiểm tra mark characterStyle và mark trackChange
  let textNode = editor.state.doc.nodeAt(23);
  assert.ok(textNode);
  const charMark = textNode.marks.find((m) => m.type.name === "characterStyle");
  assert.ok(charMark, "Ký tự phải có mark characterStyle");
  assert.equal(charMark.attrs.styleId, "char_strong");

  const trackMark = textNode.marks.find((m) => m.type.name === "trackChange");
  assert.ok(trackMark, "Ký tự phải có mark trackChange");
  assert.equal(trackMark.attrs.changeType, "format");
  assert.equal(trackMark.attrs.scope, "style");
  assert.equal(trackMark.attrs.id.startsWith("fmt-style-"), true);
  assert.equal(trackMark.attrs.author, "Linh Test");

  const diff1 = trackMark.attrs.formatChanges.find((c: any) => c.property === "characterStyleId");
  assert.ok(diff1);
  assert.equal(diff1.before, null);
  assert.equal(diff1.after, "char_strong");

  // 2.2 Change Character Style (char_strong -> char_emphasis)
  editor.chain().setTextSelection({ from: 23, to: 33 }).run();
  const changed = applyCharacterStyle(editor, "char_emphasis");
  assert.equal(changed, true);

  textNode = editor.state.doc.nodeAt(23);
  const updatedCharMark = textNode?.marks.find((m) => m.type.name === "characterStyle");
  assert.equal(updatedCharMark?.attrs.styleId, "char_emphasis");

  const trackMarks = textNode?.marks.filter((m) => m.type.name === "trackChange") || [];
  const updatedTrackMark = trackMarks[trackMarks.length - 1];
  const diff2 = updatedTrackMark?.attrs.formatChanges.find((c: any) => c.property === "characterStyleId");
  assert.ok(diff2);
  assert.equal(diff2.before, "char_strong");
  assert.equal(diff2.after, "char_emphasis");

  // 2.3 Remove Character Style
  editor.chain().setTextSelection({ from: 23, to: 33 }).run();
  const removed = removeCharacterStyle(editor);
  assert.equal(removed, true);

  textNode = editor.state.doc.nodeAt(23);
  const removedCharMark = textNode?.marks.find((m) => m.type.name === "characterStyle");
  assert.equal(removedCharMark, undefined, "Mark characterStyle phải bị gỡ bỏ");

  const latestTrackMarks = textNode?.marks.filter((m) => m.type.name === "trackChange") || [];
  const removeTrackMark = latestTrackMarks[latestTrackMarks.length - 1];
  const diff3 = removeTrackMark?.attrs.formatChanges.find((c: any) => c.property === "characterStyleId");
  assert.ok(diff3);
  assert.equal(diff3.before, "char_emphasis");
  assert.equal(diff3.after, null);

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 3. SAME-STYLE NO-OP DETECTION
// -----------------------------------------------------------------------------
test("PHASE 5 — 3. Same-style No-Op detection: không tạo revision rỗng khi style không đổi", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: "style_thesis_body" },
        content: [{ type: "text", text: "Đoạn văn đã có style thesis body." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // 3.1 Paragraph style no-op
  const appliedAgain = applyParagraphStyle(editor, "style_thesis_body");
  assert.equal(appliedAgain, true, "Lệnh trả về true biểu thị trạng thái mong muốn");

  const p = editor.state.doc.child(0);
  assert.equal(p.attrs.formatRevisions?.length || 0, 0, "Không được tạo revision rỗng cho paragraph style");

  // 3.2 Character style no-op
  editor.commands.setContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "characterStyle", attrs: { styleId: "char_strong" } }],
            text: "chữ đậm kiểu",
          },
        ],
      },
    ],
  });

  editor.chain().setTextSelection({ from: 1, to: 13 }).run();
  const charAppliedAgain = applyCharacterStyle(editor, "char_strong");
  assert.equal(charAppliedAgain, true);

  const textNode = editor.state.doc.nodeAt(1);
  const trackMark = textNode?.marks.find((m) => m.type.name === "trackChange");
  assert.equal(trackMark, undefined, "Không được gắn trackChange mark khi characterStyle giống hệt");

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 4. STABLE IDS AFTER RENAME IN STYLE DEFINITION
// -----------------------------------------------------------------------------
test("PHASE 5 — 4. Stable IDs after rename: style.id bất biến khi đổi tên hiển thị", () => {
  const editor = createTestEditor();
  useReviewStore.setState({ trackChangesEnabled: true });

  // Tạo custom style
  const created = createStyle({
    id: "style_tech_report",
    name: "Báo Cáo Kỹ Thuật Ban Đầu",
    type: "paragraph",
  });
  assert.equal(created.success, true);

  // Áp dụng style vào đoạn văn
  applyParagraphStyle(editor, "style_tech_report");
  const p = editor.state.doc.child(0);
  const rev = p.attrs.formatRevisions[0];
  assert.equal(rev.formatChange?.changes[0].after, "style_tech_report");

  // Đổi tên Style trong definitions
  const renamed = renameStyle("style_tech_report", "Báo Cáo Đã Đổi Tên", editor);
  assert.equal(renamed.success, true);

  // ID trong definitions và trong revision phải hoàn toàn bất biến
  const defs = useDocumentStore.getState().document.styles.definitions;
  const foundDef = defs.find((s) => s.id === "style_tech_report");
  assert.ok(foundDef);
  assert.equal(foundDef.name, "Báo Cáo Đã Đổi Tên");

  const pAfter = editor.state.doc.child(0);
  assert.equal(pAfter.attrs.styleId, "style_tech_report", "Paragraph attrs.styleId giữ nguyên");
  assert.equal(pAfter.attrs.formatRevisions[0].formatChange?.changes[0].after, "style_tech_report");

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 5. MISSING OR DELETED STYLE FALLBACK & SAFE REJECTION
// -----------------------------------------------------------------------------
test("PHASE 5 — 5. Missing or deleted style fallback and safe rejection", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: "style_phantom_missing" },
        content: [{ type: "text", text: "Đoạn văn trỏ tới style không tồn tại." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // Áp dụng Normal để thay thế style phantom
  applyParagraphStyle(editor, STYLE_NORMAL_ID);
  const p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, null);
  const rev = p.attrs.formatRevisions[0];
  assert.equal(rev.formatChange?.changes[0].before, "style_phantom_missing");
  assert.equal(rev.formatChange?.changes[0].after, STYLE_NORMAL_ID);

  // Reject change -> khôi phục reference styleId cũ mà không bị crash
  const rejected = TrackChangesService.rejectChange(editor, rev.id);
  assert.equal(rejected, true);

  const restoredP = editor.state.doc.child(0);
  assert.equal(restoredP.attrs.styleId, "style_phantom_missing", "Khôi phục đúng style reference trước đó");
  assert.equal(restoredP.attrs.formatRevisions.length, 0);

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 6. DIRECT OVERRIDES PRESERVED
// -----------------------------------------------------------------------------
test("PHASE 5 — 6. Direct overrides preserved: không xóa mất direct marks và paragraph overrides", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "center", lineSpacing: "1.5" },
        content: [
          {
            type: "text",
            marks: [
              { type: "bold" },
              { type: "textStyle", attrs: { color: "#dc2626" } },
            ],
            text: "Chữ in đậm màu đỏ có căn giữa.",
          },
        ],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // 6.1 Áp dụng paragraph style (options.clearDirectFormatting = false)
  applyParagraphStyle(editor, "style_thesis_body");
  let p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, "style_thesis_body");
  assert.equal(p.attrs.textAlign, "center", "textAlign direct override được giữ nguyên");
  assert.equal(p.attrs.lineSpacing, "1.5", "lineSpacing direct override được giữ nguyên");

  // Diff chỉ ghi nhận paragraphStyleId
  const pDiffs = p.attrs.formatRevisions[0].formatChange?.changes;
  assert.equal(pDiffs?.length, 1);
  assert.equal(pDiffs?.[0].property, "paragraphStyleId");

  // 6.2 Áp dụng character style lên dải chữ
  editor.chain().setTextSelection({ from: 1, to: 15 }).run();
  applyCharacterStyle(editor, "char_emphasis");

  const textNode = editor.state.doc.nodeAt(1);
  assert.ok(textNode?.marks.some((m) => m.type.name === "bold"), "Direct bold mark được giữ nguyên");
  assert.ok(
    textNode?.marks.some((m) => m.type.name === "textStyle" && m.attrs.color === "#dc2626"),
    "Direct color mark được giữ nguyên"
  );
  assert.ok(
    textNode?.marks.some((m) => m.type.name === "characterStyle" && m.attrs.styleId === "char_emphasis"),
    "Character style mark được áp dụng đồng thời"
  );

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 7. INHERITANCE PRESERVATION ON REJECT / ACCEPT (REVIEW LIFECYCLE)
// -----------------------------------------------------------------------------
test("PHASE 5 — 7. Inheritance preservation on Reject / Accept (Review Lifecycle)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { styleId: "style_thesis_body" },
        content: [{ type: "text", text: "Đoạn văn kiểm tra Accept/Reject Lifecycle." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // Áp dụng style mới
  applyParagraphStyle(editor, "style_callout");
  let p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, "style_callout");
  const revId = p.attrs.formatRevisions[0].id;

  // 7.1 REJECT REVISION
  const rejected = TrackChangesService.rejectChange(editor, revId);
  assert.equal(rejected, true, "Reject thành công");

  p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, "style_thesis_body", "Khôi phục lại styleId trước đó");
  assert.equal(p.attrs.formatRevisions.length, 0, "Revision được dọn dẹp khỏi pending list");
  // Không làm phẳng inherited properties vào direct attrs
  assert.equal(p.attrs.lineSpacing, null);
  assert.equal(p.attrs.spacingBefore, null);

  // 7.2 ACCEPT REVISION
  applyParagraphStyle(editor, "style_callout");
  p = editor.state.doc.child(0);
  const newRevId = p.attrs.formatRevisions[0].id;

  const accepted = TrackChangesService.acceptChange(editor, newRevId);
  assert.equal(accepted, true, "Accept thành công");

  p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, "style_callout", "Giữ assignment mới sau Accept");
  assert.equal(p.attrs.formatRevisions.length, 0, "Revision được hoàn tất và xóa khỏi list");

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 8. HEADING SEMANTICS AND LEVEL TRANSITIONS
// -----------------------------------------------------------------------------
test("PHASE 5 — 8. Heading semantics and level transitions: Heading 1/2/3 và TOC/Outline", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tiêu đề nghiên cứu tổng quan" }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // 8.1 Chuyển Paragraph -> Heading 1
  applyParagraphStyle(editor, STYLE_HEADING_1_ID);
  let node = editor.state.doc.child(0);
  assert.equal(node.type.name, "heading", "Node type phải chuyển thành semantic heading");
  assert.equal(node.attrs.level, 1, "Level phải là 1");
  assert.equal(node.attrs.styleId, STYLE_HEADING_1_ID);

  const rev1 = node.attrs.formatRevisions[0];
  const hLevelDiff1 = rev1.formatChange?.changes.find((c) => c.property === "headingLevel");
  assert.ok(hLevelDiff1);
  assert.equal(hLevelDiff1.before, null);
  assert.equal(hLevelDiff1.after, 1);

  // 8.2 Chuyển Heading 1 -> Heading 2
  applyParagraphStyle(editor, STYLE_HEADING_2_ID);
  node = editor.state.doc.child(0);
  assert.equal(node.type.name, "heading");
  assert.equal(node.attrs.level, 2);
  assert.equal(node.attrs.styleId, STYLE_HEADING_2_ID);

  const rev2 = node.attrs.formatRevisions[1];
  const hLevelDiff2 = rev2.formatChange?.changes.find((c) => c.property === "headingLevel");
  assert.ok(hLevelDiff2);
  assert.equal(hLevelDiff2.before, 1);
  assert.equal(hLevelDiff2.after, 2);

  // 8.3 Reject chuyển đổi Heading 2 -> phục hồi lại Heading 1
  TrackChangesService.rejectChange(editor, rev2.id);
  node = editor.state.doc.child(0);
  assert.equal(node.type.name, "heading");
  assert.equal(node.attrs.level, 1, "Phục hồi về cấp 1");
  assert.equal(node.attrs.styleId, STYLE_HEADING_1_ID);

  // 8.4 Chuyển Heading 1 về Normal -> phục hồi node type paragraph
  applyParagraphStyle(editor, STYLE_NORMAL_ID);
  node = editor.state.doc.child(0);
  assert.equal(node.type.name, "paragraph", "Node type chuyển về paragraph");
  assert.equal(node.attrs.level, undefined);
  assert.equal(node.attrs.styleId, null);

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 9. MULTI-BLOCK SELECTION
// -----------------------------------------------------------------------------
test("PHASE 5 — 9. Multi-block selection: áp dụng style đồng thời cho nhiều blocks", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn 1" }],
      },
      {
        type: "heading",
        attrs: { level: 2, styleId: STYLE_HEADING_2_ID },
        content: [{ type: "text", text: "Tiêu đề cấp 2" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn 2" }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // Chọn từ đầu đoạn 1 tới cuối đoạn 2 (toàn bộ tài liệu)
  editor.chain().setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 }).run();

  // Áp dụng custom paragraph style
  const applied = applyParagraphStyle(editor, "style_custom_section");
  assert.equal(applied, true);

  const b0 = editor.state.doc.child(0);
  const b1 = editor.state.doc.child(1);
  const b2 = editor.state.doc.child(2);

  // Cả 3 blocks đều có styleId mới
  assert.equal(b0.attrs.styleId, "style_custom_section");
  assert.equal(b0.type.name, "paragraph");
  assert.equal(b0.attrs.formatRevisions.length, 1);

  // Block 1 bảo toàn semantic heading type và level 2!
  assert.equal(b1.attrs.styleId, "style_custom_section");
  assert.equal(b1.type.name, "heading");
  assert.equal(b1.attrs.level, 2);
  assert.equal(b1.attrs.formatRevisions.length, 1);

  assert.equal(b2.attrs.styleId, "style_custom_section");
  assert.equal(b2.type.name, "paragraph");
  assert.equal(b2.attrs.formatRevisions.length, 1);

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 10. ATOMIC UNDO / REDO
// -----------------------------------------------------------------------------
test("PHASE 5 — 10. Atomic Undo / Redo: hoàn tác và làm lại thao tác trong đúng 1 bước", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Thử nghiệm Undo Redo Style Revisions." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // 10.1 Áp dụng paragraph style
  applyParagraphStyle(editor, "style_thesis_body");
  let p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, "style_thesis_body");
  assert.equal(p.attrs.formatRevisions.length, 1);

  // Undo 1 bước
  editor.commands.undo();
  p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, null, "Undo khôi phục styleId về null");
  assert.equal(p.attrs.formatRevisions?.length || 0, 0, "Undo xóa sạch formatRevisions");

  // Redo 1 bước
  editor.commands.redo();
  p = editor.state.doc.child(0);
  assert.equal(p.attrs.styleId, "style_thesis_body", "Redo khôi phục lại styleId");
  assert.equal(p.attrs.formatRevisions.length, 1, "Redo khôi phục lại revision");

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 11. CHARACTER STYLE ACCEPT & REJECT LIFECYCLE
// -----------------------------------------------------------------------------
test("PHASE 5 — 11. Character Style Accept & Reject Lifecycle", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm Accept Reject Character Style." }],
      },
    ],
  });
  useReviewStore.setState({ trackChangesEnabled: true });

  // Chọn từ "nghiệm" (pos 13 đến 19)
  editor.chain().setTextSelection({ from: 13, to: 19 }).run();

  // 11.1 Áp dụng char_strong
  applyCharacterStyle(editor, "char_strong");
  let textNode = editor.state.doc.nodeAt(13);
  assert.ok(textNode?.marks.some((m) => m.type.name === "characterStyle" && m.attrs.styleId === "char_strong"));
  const trackMark = textNode?.marks.find((m) => m.type.name === "trackChange");
  assert.ok(trackMark);
  const revId = trackMark.attrs.id;

  // 11.2 Reject Character Style Revision -> khôi phục về không có styleId
  const rejected = TrackChangesService.rejectChange(editor, revId);
  assert.equal(rejected, true);

  textNode = editor.state.doc.nodeAt(13);
  assert.equal(
    textNode?.marks.some((m) => m.type.name === "characterStyle"),
    false,
    "Reject phải gỡ bỏ mark characterStyle"
  );
  assert.equal(
    textNode?.marks.some((m) => m.type.name === "trackChange"),
    false,
    "Reject phải gỡ bỏ mark trackChange"
  );

  // 11.3 Áp dụng lại và Accept
  editor.chain().setTextSelection({ from: 13, to: 19 }).run();
  applyCharacterStyle(editor, "char_strong");
  textNode = editor.state.doc.nodeAt(13);
  const newTrackMark = textNode?.marks.find((m) => m.type.name === "trackChange");
  assert.ok(newTrackMark);

  const accepted = TrackChangesService.acceptChange(editor, newTrackMark.attrs.id);
  assert.equal(accepted, true);

  textNode = editor.state.doc.nodeAt(13);
  assert.equal(
    textNode?.marks.some((m) => m.type.name === "characterStyle" && m.attrs.styleId === "char_strong"),
    true,
    "Accept phải giữ lại characterStyle"
  );
  assert.equal(
    textNode?.marks.some((m) => m.type.name === "trackChange"),
    false,
    "Accept phải gỡ bỏ mark trackChange"
  );

  editor.destroy();
});

