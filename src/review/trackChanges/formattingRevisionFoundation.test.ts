import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../../editor/editorCommands.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import {
  FormattingDiffService,
  generateFormattingRevisionId,
} from "./formattingDiffService.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import type {
  TrackChangeItem,
  TrackChangeType,
  FormattingRevisionScope,
  FormattingPropertyDiff,
} from "../../document/documentTypes.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm hệ thống Track Changes 2.0." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. UNIFIED REVISION TYPES & DATA MODEL
// -----------------------------------------------------------------------------
test("PHASE 2 — 1. Unified Revision Types: hỗ trợ insert, delete, format, scopes và statuses", () => {
  const types: TrackChangeType[] = ["insert", "delete", "format"];
  const scopes: FormattingRevisionScope[] = ["character", "paragraph", "style"];

  assert.equal(types.length, 3);
  assert.equal(scopes.length, 3);

  const diffs: FormattingPropertyDiff[] = [
    { property: "bold", before: false, after: true },
    { property: "color", before: null, after: "#dc2626" },
  ];

  const item: TrackChangeItem = FormattingDiffService.createFormattingRevisionItem({
    id: "fmt-test-1",
    author: "Hoàng Dev",
    timestamp: "2026-10-08T10:00:00.000Z",
    scope: "character",
    changes: diffs,
    status: "pending",
    text: "văn bản mẫu",
    from: 5,
    to: 16,
  });

  assert.equal(item.id, "fmt-test-1");
  assert.equal(item.type, "format");
  assert.equal(item.scope, "character");
  assert.equal(item.status, "pending");
  assert.equal(item.author, "Hoàng Dev");
  assert.ok(item.formatChange);
  assert.equal(item.formatChange.changes.length, 2);
  assert.equal(item.formatChange.changes[0].property, "bold");
  assert.equal(item.formatChange.changes[1].after, "#dc2626");
});

// -----------------------------------------------------------------------------
// 2. STABLE IDS GENERATION
// -----------------------------------------------------------------------------
test("PHASE 2 — 2. Stable IDs: định dạng tiền tố chuẩn xác theo scope và tính duy nhất", () => {
  const charId1 = generateFormattingRevisionId("character");
  const charId2 = generateFormattingRevisionId("character");
  const paraId = generateFormattingRevisionId("paragraph");
  const styleId = generateFormattingRevisionId("style");

  assert.ok(charId1.startsWith("fmt-char-"), "Character revision phải có tiền tố fmt-char-");
  assert.ok(paraId.startsWith("fmt-para-"), "Paragraph revision phải có tiền tố fmt-para-");
  assert.ok(styleId.startsWith("fmt-style-"), "Style revision phải có tiền tố fmt-style-");
  assert.notEqual(charId1, charId2, "Mỗi lần sinh ID phải đảm bảo tính duy nhất");
});

// -----------------------------------------------------------------------------
// 3. CHARACTER & PARAGRAPH SEMANTIC ANCHORS
// -----------------------------------------------------------------------------
test("PHASE 2 — 3. Semantic Anchors: Character bám text range, Paragraph bám semantic block node", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn một có text." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn hai cần định dạng." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Character Formatting Revision
  const charRes = TrackChangesService.applyTrackedCharacterFormatting(
    editor,
    1,
    9, // "Đoạn văn"
    { bold: true, color: "#2563eb" },
    "Reviewer A"
  );

  assert.equal(charRes.success, true);
  assert.ok(charRes.revisionId);

  // Kiểm tra neo Character: range trong doc
  const charRange = TrackChangesService.findChangeRangeInDoc(editor.state.doc, charRes.revisionId!);
  assert.ok(charRange);
  assert.equal(charRange.from, 1);
  assert.equal(charRange.to, 9);

  // 2. Paragraph Formatting Revision
  // Đoạn văn 2 bắt đầu sau đoạn văn 1 (pos ~ 24)
  const posPara2 = 24;
  const paraRes = TrackChangesService.applyTrackedParagraphFormatting(
    editor,
    posPara2,
    { textAlign: "center", lineSpacing: "1.5" },
    "Reviewer B"
  );

  assert.equal(paraRes.success, true);
  assert.ok(paraRes.revisionId);

  // Kiểm tra neo Paragraph: range bao quát cả paragraph node
  const paraRange = TrackChangesService.findChangeRangeInDoc(editor.state.doc, paraRes.revisionId!);
  assert.ok(paraRange);
  assert.ok(paraRange.to > paraRange.from);

  // Kiểm tra trích xuất danh sách thay đổi hợp nhất
  const allChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(allChanges.length, 2);

  const charChange = allChanges.find((c) => c.id === charRes.revisionId);
  assert.ok(charChange);
  assert.equal(charChange.type, "format");
  assert.equal(charChange.scope, "character");

  const paraChange = allChanges.find((c) => c.id === paraRes.revisionId);
  assert.ok(paraChange);
  assert.equal(paraChange.type, "format");
  assert.equal(paraChange.scope, "paragraph");
  assert.ok(paraChange.targetNodeId, "Paragraph revision phải có targetNodeId semantic anchor");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 4. MULTIPLE OVERLAPPING ANCHORS
// -----------------------------------------------------------------------------
test("PHASE 2 — 4. Multiple Overlapping Anchors: Insert + Format và nhiều Format chồng lấn không bị ghi đè", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản cơ sở để thử nghiệm." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Bước 1: Gõ chèn văn bản (Insert Revision)
  TrackChangesService.applyTrackedTextInput(editor, 1, 1, "Thêm ");
  const changesAfterInsert = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterInsert.length, 1);
  const insId = changesAfterInsert[0].id;
  assert.equal(changesAfterInsert[0].type, "insert");

  // Bước 2: Bôi đậm toàn bộ đoạn vừa chèn + 5 ký tự kế tiếp (Format Revision 1: Bold)
  const fmt1Res = TrackChangesService.applyTrackedCharacterFormatting(
    editor,
    1,
    10,
    { bold: true },
    "Author A"
  );
  assert.equal(fmt1Res.success, true);

  // Bước 3: Đổi màu chữ trên vùng chồng lấn ở giữa (Format Revision 2: Color)
  const fmt2Res = TrackChangesService.applyTrackedCharacterFormatting(
    editor,
    3,
    8,
    { color: "#dc2626" },
    "Author B"
  );
  assert.equal(fmt2Res.success, true);

  // Kiểm tra: Cả 3 revision (1 insert, 2 format) cùng tồn tại trong document
  const allRevs = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(allRevs.length, 3, "Phải ghi nhận đủ 3 revision mà không bị đè mất");

  const foundIns = allRevs.find((r) => r.id === insId);
  const foundFmt1 = allRevs.find((r) => r.id === fmt1Res.revisionId);
  const foundFmt2 = allRevs.find((r) => r.id === fmt2Res.revisionId);

  assert.ok(foundIns, "Insert revision vẫn còn");
  assert.ok(foundFmt1, "Format revision 1 vẫn còn");
  assert.ok(foundFmt2, "Format revision 2 vẫn còn");

  // Kiểm tra text node tại vị trí pos 4 (vùng giao thoa cả 3 revision)
  const $pos = editor.state.doc.resolve(4);
  const marks = $pos.marks().filter((m) => m.type.name === "trackChange");
  assert.equal(marks.length, 3, "Tại vùng giao thoa phải có đủ 3 mark trackChange cùng tồn tại");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 5. MIXED-PROPERTY DIFFS & NON-FIRST-CHARACTER INSPECTION
// -----------------------------------------------------------------------------
test("PHASE 2 — 5. Mixed-Property Diffs: không ngộ nhận ký tự đầu, phát hiện vùng chọn hỗn hợp", () => {
  // Tạo doc với đoạn đầu In Đậm, đoạn sau Bình Thường
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "PHẦN ĐẬM ",
            marks: [{ type: "bold" }],
          },
          {
            type: "text",
            text: "phần bình thường",
          },
        ],
      },
    ],
  });

  // Khảo sát vùng chọn từ 1 đến 25 bao phủ cả 2 phần
  const inspection = FormattingDiffService.inspectSelectionCharacterFormatting(
    editor.state.doc,
    1,
    25
  );

  assert.equal(inspection.segments.length, 2, "Phải chia thành 2 segments có định dạng khác nhau");
  assert.equal(inspection.properties.bold.isMixed, true, "Thuộc tính bold phải là mixed");
  assert.deepEqual(inspection.properties.bold.values, [true, false]);
  assert.equal(inspection.properties.bold.uniformValue, null);

  // Khi người dùng muốn đặt Bold = true cho cả vùng:
  const diffResult = FormattingDiffService.computeRangeFormattingDiff(
    editor.state.doc,
    1,
    25,
    { bold: true }
  );

  // Phải phát hiện có thay đổi (chỉ thay đổi trên segment thứ 2)
  assert.equal(diffResult.hasChanges, true);
  assert.equal(diffResult.affectedSegments.length, 1, "Chỉ có segment chưa in đậm mới bị thay đổi");
  assert.equal(diffResult.affectedSegments[0].from, 10, "Vị trí bắt đầu thay đổi phải là 10 (sau phần đã đậm)");

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 6. NO-OP DETECTION
// -----------------------------------------------------------------------------
test("PHASE 2 — 6. No-Op Detection: không tạo revision rỗng khi giá trị không thay đổi", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Văn bản đã in đậm hoàn toàn",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Áp dụng bold: true trên văn bản đã bold: true
  const noOpChar = TrackChangesService.applyTrackedCharacterFormatting(
    editor,
    1,
    15,
    { bold: true }
  );
  assert.equal(noOpChar.success, false);
  assert.equal(noOpChar.noOp, true, "Phải phát hiện No-op đối với character");

  // 2. Áp dụng căn lề mặc định 'left' trên đoạn văn đang 'left'
  const noOpPara = TrackChangesService.applyTrackedParagraphFormatting(
    editor,
    1,
    { textAlign: "left" }
  );
  assert.equal(noOpPara.success, false);
  assert.equal(noOpPara.noOp, true, "Phải phát hiện No-op đối với paragraph");

  // Xác nhận: Không có bất kỳ revision nào được tạo ra
  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 0, "Không được tạo bất kỳ revision rỗng nào");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 7. MISSING VS EXPLICIT VALUES & UNIT NORMALIZATION
// -----------------------------------------------------------------------------
test("PHASE 2 — 7. Missing vs Explicit Values & Normalization: chuẩn hóa màu, đơn vị pt và boolean", () => {
  // 1. Chuẩn hóa màu sắc
  assert.equal(FormattingDiffService.normalizeColor("#FFF"), "#ffffff");
  assert.equal(FormattingDiffService.normalizeColor("#1E293B"), "#1e293b");
  assert.equal(FormattingDiffService.normalizeColor("rgb(220, 38, 38)"), "#dc2626");
  assert.equal(FormattingDiffService.normalizeColor(""), null);

  // 2. So sánh bằng nhau về mặt ngữ nghĩa (Semantically Equal)
  assert.equal(FormattingDiffService.areValuesEqual("color", "#FFF", "#ffffff"), true);
  assert.equal(FormattingDiffService.areValuesEqual("fontSize", 12, "12pt"), true);
  assert.equal(FormattingDiffService.areValuesEqual("fontSize", "14px", 14), true);
  assert.equal(FormattingDiffService.areValuesEqual("lineSpacing", 1.5, "1.5"), true);
  assert.equal(FormattingDiffService.areValuesEqual("bold", true, 1), true);

  // 3. Phân biệt Missing vs Explicit
  const diffMissingToExplicit = FormattingDiffService.computePropertyDiff("color", null, "#dc2626");
  assert.ok(diffMissingToExplicit);
  assert.equal(diffMissingToExplicit.before, null);
  assert.equal(diffMissingToExplicit.after, "#dc2626");

  const diffExplicitToMissing = FormattingDiffService.computePropertyDiff("color", "#dc2626", null);
  assert.ok(diffExplicitToMissing);
  assert.equal(diffExplicitToMissing.before, "#dc2626");
  assert.equal(diffExplicitToMissing.after, null);
});

// -----------------------------------------------------------------------------
// 8. SOURCE IMMUTABILITY
// -----------------------------------------------------------------------------
test("PHASE 2 — 8. Source Immutability: đối tượng revision bất biến, deep-clone không làm hỏng state", () => {
  const originalChanges: FormattingPropertyDiff[] = [
    { property: "fontSize", before: 11, after: 16 },
  ];

  const revItem = FormattingDiffService.createFormattingRevisionItem({
    scope: "character",
    changes: originalChanges,
  });

  // Thay đổi mảng ban đầu
  originalChanges.push({ property: "bold", before: false, after: true });
  originalChanges[0].after = 999;

  // Kiểm tra: revItem vẫn giữ nguyên bản copy ban đầu
  assert.equal(revItem.formatChange?.changes.length, 1);
  assert.equal(revItem.formatChange?.changes[0].after, 16);
});

// -----------------------------------------------------------------------------
// 9. TRANSACTION MAPPING & ATOMIC UNDO/REDO
// -----------------------------------------------------------------------------
test("PHASE 2 — 9. Transaction Mapping: phối hợp mutation và metadata trong 1 transaction, Undo/Redo nguyên tử", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra tính nguyên tử của Undo Redo." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Áp dụng định dạng có tracking
  const res = TrackChangesService.applyTrackedCharacterFormatting(
    editor,
    1,
    9,
    { italic: true, color: "#16a34a" },
    "User Undo Test"
  );
  assert.equal(res.success, true);

  // Sau khi apply: Có 1 revision và text node có mark italic + color + trackChange
  assert.equal(TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length, 1);
  const $after = editor.state.doc.resolve(2);
  assert.ok($after.marks().some((m) => m.type.name === "italic"));
  assert.ok($after.marks().some((m) => m.type.name === "trackChange"));

  // Thực hiện UNDO (1 bước duy nhất)
  editor.commands.undo();

  // Kiểm tra: CẢ định dạng (italic, color) VÀ revision mark đều được gỡ bỏ hoàn toàn
  assert.equal(
    TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length,
    0,
    "Undo phải xóa bỏ cả revision lẫn formatting marks"
  );
  const $undone = editor.state.doc.resolve(2);
  assert.equal($undone.marks().some((m) => m.type.name === "italic"), false);
  assert.equal($undone.marks().some((m) => m.type.name === "trackChange"), false);

  // Thực hiện REDO
  editor.commands.redo();

  // Kiểm tra: CẢ định dạng VÀ revision mark được khôi phục đồng bộ
  assert.equal(
    TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length,
    1,
    "Redo phải khôi phục cả revision lẫn formatting marks"
  );
  const $redone = editor.state.doc.resolve(2);
  assert.ok($redone.marks().some((m) => m.type.name === "italic"));
  assert.ok($redone.marks().some((m) => m.type.name === "trackChange"));

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 10. LEGACY INSERT / DELETE COMPATIBILITY
// -----------------------------------------------------------------------------
test("PHASE 2 — 10. Legacy Compatibility: Insert/Delete và Accept/Reject cũ hoạt động 100% không suy suyển", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung ban đầu." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Insert tracking
  TrackChangesService.applyTrackedTextInput(editor, 1, 1, "Chèn ");
  // 2. Delete tracking
  editor.commands.setTextSelection({ from: 6, to: 10 });
  TrackChangesService.applyTrackedKeyDown(editor, "Backspace");

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 2);

  const insChange = changes.find((c) => c.type === "insert");
  const delChange = changes.find((c) => c.type === "delete");

  assert.ok(insChange);
  assert.ok(delChange);

  // Accept Insert
  const okAccept = TrackChangesService.acceptChange(editor, insChange.id);
  assert.equal(okAccept, true);

  // Reject Delete
  const okReject = TrackChangesService.rejectChange(editor, delChange.id);
  assert.equal(okReject, true);

  // Toàn bộ thay đổi đã được giải quyết sạch sẽ
  const remaining = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(remaining.length, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});
