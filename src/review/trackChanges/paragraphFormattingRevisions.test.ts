import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import {
  ensureEditorPlugins,
  setTextAlign,
  setLineSpacing,
  unsetLineSpacing,
  applyParagraphFormatting,
  indent,
  outdent,
  undo,
  redo,
} from "../../editor/editorCommands.ts";
import {
  setParagraphSpacing,
  setParagraphIndents,
} from "../../styles/services/applyStyleService.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import { FormattingDiffService } from "./formattingDiffService.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn thử nghiệm Phase 4 Paragraph Formatting Revisions." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. ALIGNMENT (LEFT / CENTER / RIGHT / JUSTIFY)
// -----------------------------------------------------------------------------
test("PHASE 4 — 1. Alignment: theo dõi chính xác Left, Center, Right, Justify khi Track Changes ON", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra căn lề đoạn văn." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Đổi sang Center
  editor.chain().setTextSelection(5).run(); // Caret trong đoạn văn
  const resCenter = setTextAlign(editor, "center");
  assert.equal(resCenter, true);

  const changes1 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes1.length, 1, "Phải có đúng 1 paragraph revision");
  assert.equal(changes1[0].scope, "paragraph");
  assert.equal(changes1[0].type, "format");
  assert.equal(changes1[0].status, "pending");
  assert.ok(changes1[0].formatDetails?.includes("Căn lề: center"));

  const changeItem1 = changes1[0].formatChange?.changes.find((c) => c.property === "textAlign");
  assert.ok(changeItem1);
  assert.equal(changeItem1.after, "center");

  // 2. Đổi tiếp sang Right
  const resRight = setTextAlign(editor, "right");
  assert.equal(resRight, true);

  const changes2 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes2.length, 2, "Đoạn văn giờ có 2 revisions lịch sử");
  const latestChange = changes2[changes2.length - 1];
  const changeItem2 = latestChange.formatChange?.changes.find((c) => c.property === "textAlign");
  assert.ok(changeItem2);
  assert.equal(changeItem2.before, "center", "Before của lần 2 phải là center");
  assert.equal(changeItem2.after, "right");

  // 3. Đổi sang Justify
  const resJustify = setTextAlign(editor, "justify");
  assert.equal(resJustify, true);

  const changes3 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes3.length, 3);
  const latestChange3 = changes3[changes3.length - 1];
  const changeItem3 = latestChange3.formatChange?.changes.find((c) => c.property === "textAlign");
  assert.ok(changeItem3);
  assert.equal(changeItem3.before, "right");
  assert.equal(changeItem3.after, "justify");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 2. LINE SPACING
// -----------------------------------------------------------------------------
test("PHASE 4 — 2. Line Spacing: ghi nhận thiết lập và hủy độ giãn dòng", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung kiểm tra độ giãn dòng." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Đặt giãn dòng 1.5
  editor.chain().setTextSelection(3).run();
  const res15 = setLineSpacing(editor, "1.5");
  assert.equal(res15, true);

  const changes1 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes1.length, 1);
  assert.equal(changes1[0].scope, "paragraph");
  assert.ok(changes1[0].formatDetails?.includes("Giãn dòng: 1.5"));

  const diff1 = changes1[0].formatChange?.changes.find((c) => c.property === "lineSpacing");
  assert.ok(diff1);
  assert.equal(diff1.after, "1.5");

  // 2. Đổi sang 2.0
  const res20 = setLineSpacing(editor, "2.0");
  assert.equal(res20, true);

  const changes2 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes2.length, 2);
  const diff2 = changes2[1].formatChange?.changes.find((c) => c.property === "lineSpacing");
  assert.ok(diff2);
  assert.equal(diff2.before, "1.5");
  assert.equal(diff2.after, "2.0");

  // 3. Khôi phục giãn dòng mặc định (unset)
  const resUnset = unsetLineSpacing(editor);
  assert.equal(resUnset, true);

  const changes3 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes3.length, 3);
  const diff3 = changes3[2].formatChange?.changes.find((c) => c.property === "lineSpacing");
  assert.ok(diff3);
  assert.equal(diff3.before, "2.0");
  assert.equal(diff3.after, null);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 3. SPACING BEFORE / AFTER
// -----------------------------------------------------------------------------
test("PHASE 4 — 3. Spacing Before / After: ghi nhận chính xác chỉ các thuộc tính được thay đổi", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra khoảng cách trước và sau đoạn văn." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  editor.chain().setTextSelection(5).run();
  const res = setParagraphSpacing(editor, { spacingBefore: 12, spacingAfter: 6 });
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1);
  const diffs = changes[0].formatChange?.changes || [];
  assert.equal(diffs.length, 2, "Chỉ ghi nhận đúng 2 thuộc tính spacingBefore và spacingAfter");

  const beforeDiff = diffs.find((c) => c.property === "spacingBefore");
  const afterDiff = diffs.find((c) => c.property === "spacingAfter");

  assert.ok(beforeDiff);
  assert.equal(beforeDiff.after, 12);

  assert.ok(afterDiff);
  assert.equal(afterDiff.after, 6);

  // Đảm bảo không gắn cờ các thuộc tính khác như textAlign hay lineSpacing
  const otherDiff = diffs.find((c) => c.property !== "spacingBefore" && c.property !== "spacingAfter");
  assert.equal(otherDiff, undefined, "Không được đánh dấu các paragraph attributes khác là đã đổi");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 4. LEFT / RIGHT INDENT
// -----------------------------------------------------------------------------
test("PHASE 4 — 4. Left / Right Indent: ghi nhận mức thụt lề trái và phải", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra thụt lề trái và phải." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  editor.chain().setTextSelection(5).run();
  const res = setParagraphIndents(editor, { leftIndent: 28.3, rightIndent: 14.2 });
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1);
  const diffs = changes[0].formatChange?.changes || [];

  const leftDiff = diffs.find((c) => c.property === "leftIndent");
  const rightDiff = diffs.find((c) => c.property === "rightIndent");

  assert.ok(leftDiff);
  assert.equal(leftDiff.after, 28.3);

  assert.ok(rightDiff);
  assert.equal(rightDiff.after, 14.2);

  assert.ok(changes[0].formatDetails?.includes("Thụt lề trái: 28.3pt"));
  assert.ok(changes[0].formatDetails?.includes("Thụt lề phải: 14.2pt"));

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 5. FIRST-LINE & HANGING INDENT
// -----------------------------------------------------------------------------
test("PHASE 4 — 5. First-line / Hanging Indent: kiểm tra thụt đầu dòng và nhô lề dòng đầu", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra thụt đầu dòng và nhô lề." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Thụt dòng đầu (First-line) 18pt
  editor.chain().setTextSelection(5).run();
  const res1 = setParagraphIndents(editor, { firstLineIndent: 18 });
  assert.equal(res1, true);

  const changes1 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes1.length, 1);
  const flDiff = changes1[0].formatChange?.changes.find((c) => c.property === "firstLineIndent");
  assert.ok(flDiff);
  assert.equal(flDiff.after, 18);
  assert.ok(changes1[0].formatDetails?.includes("Thụt đầu dòng: 18pt"));

  // 2. Chuyển sang nhô lề treo (Hanging) 20pt -> FirstLine phải trở thành null
  const res2 = setParagraphIndents(editor, { hangingIndent: 20 });
  assert.equal(res2, true);

  const changes2 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes2.length, 2);
  const diffs2 = changes2[1].formatChange?.changes || [];

  const hgDiff = diffs2.find((c) => c.property === "hangingIndent");
  assert.ok(hgDiff);
  assert.equal(hgDiff.after, 20);

  const flResetDiff = diffs2.find((c) => c.property === "firstLineIndent");
  assert.ok(flResetDiff);
  assert.equal(flResetDiff.before, 18);
  assert.equal(flResetDiff.after, null);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 6. MULTI-PROPERTY BATCH COMMAND
// -----------------------------------------------------------------------------
test("PHASE 4 — 6. Multi-property Command: áp dụng nhiều thuộc tính đoạn văn cùng lúc", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn được định dạng nhiều thuộc tính một lượt." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  editor.chain().setTextSelection(5).run();
  const res = applyParagraphFormatting(editor, {
    textAlign: "center",
    lineSpacing: "1.5",
    spacingBefore: 10,
  });
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1, "Chỉ tạo 1 revision duy nhất gom nhóm thay đổi");
  assert.equal(changes[0].scope, "paragraph");

  const diffs = changes[0].formatChange?.changes || [];
  assert.equal(diffs.length, 3, "Ghi nhận đúng 3 thuộc tính");

  assert.ok(diffs.some((d) => d.property === "textAlign" && d.after === "center"));
  assert.ok(diffs.some((d) => d.property === "lineSpacing" && d.after === "1.5"));
  assert.ok(diffs.some((d) => d.property === "spacingBefore" && d.after === 10));

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 7. MULTI-PARAGRAPH SELECTION
// -----------------------------------------------------------------------------
test("PHASE 4 — 7. Multi-paragraph Selection: bôi đen qua nhiều đoạn văn tạo revision độc lập cho từng block", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { nodeId: "p1" },
        content: [{ type: "text", text: "Đoạn 1 có nội dung dài." }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: "p2" },
        content: [{ type: "text", text: "Đoạn 2 có nội dung thứ hai." }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: "p3" },
        content: [{ type: "text", text: "Đoạn 3 có nội dung thứ ba." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Bôi đen từ đầu đoạn 1 sang cuối đoạn 3
  editor.chain().setTextSelection({ from: 1, to: 70 }).run();
  const res = setTextAlign(editor, "center");
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 3, "Phải sinh đúng 3 revisions cho 3 paragraphs");

  const nodeIds = changes.map((c) => c.targetNodeId);
  assert.ok(nodeIds.includes("p1"));
  assert.ok(nodeIds.includes("p2"));
  assert.ok(nodeIds.includes("p3"));

  // Đảm bảo tất cả 3 đoạn đều có textAlign = "center"
  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph") {
      assert.equal(node.attrs.textAlign, "center");
      assert.equal(node.attrs.formatRevisions.length, 1);
    }
  });

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 8. PARAGRAPH + HEADING SELECTION (SEMANTIC SAFETY)
// -----------------------------------------------------------------------------
test("PHASE 4 — 8. Paragraph + Heading: bảo toàn semantic heading và cấp độ level", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2, nodeId: "h1" },
        content: [{ type: "text", text: "Tiêu đề cấp hai" }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: "p1" },
        content: [{ type: "text", text: "Đoạn văn bên dưới tiêu đề." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  editor.chain().setTextSelection({ from: 1, to: 35 }).run();
  const res = setTextAlign(editor, "center");
  assert.equal(res, true);

  let foundHeading = false;
  let foundParagraph = false;

  editor.state.doc.descendants((node) => {
    if (node.type.name === "heading") {
      foundHeading = true;
      assert.equal(node.attrs.level, 2, "Cấp độ heading level 2 phải được bảo toàn 100%");
      assert.equal(node.attrs.textAlign, "center");
      assert.equal(node.attrs.formatRevisions.length, 1);
    }
    if (node.type.name === "paragraph") {
      foundParagraph = true;
      assert.equal(node.attrs.textAlign, "center");
      assert.equal(node.attrs.formatRevisions.length, 1);
    }
  });

  assert.ok(foundHeading, "Heading node vẫn là heading semantic");
  assert.ok(foundParagraph, "Paragraph node vẫn là paragraph");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 9. NESTED LISTS (SEMANTIC SAFETY)
// -----------------------------------------------------------------------------
test("PHASE 4 — 9. Nested Lists: định dạng đoạn văn bên trong danh sách không phá vỡ cấu trúc list", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { nodeId: "li1_p" },
                content: [{ type: "text", text: "Mục danh sách một" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                attrs: { nodeId: "li2_p" },
                content: [{ type: "text", text: "Mục danh sách hai" }],
              },
            ],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Tìm vị trí text của 2 item danh sách
  let text1Pos = -1;
  let text2Pos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === "Mục danh sách một") {
      text1Pos = pos + 2;
    }
    if (node.isText && node.text === "Mục danh sách hai") {
      text2Pos = pos + 2;
    }
  });

  editor.chain().setTextSelection({ from: text1Pos, to: text2Pos }).run();
  const res = setLineSpacing(editor, "1.5");
  assert.equal(res, true);

  // Kiểm tra cấu trúc danh sách còn nguyên vẹn
  let bulletListCount = 0;
  let listItemCount = 0;

  editor.state.doc.descendants((node) => {
    if (node.type.name === "bulletList") bulletListCount++;
    if (node.type.name === "listItem") {
      listItemCount++;
      const p = node.child(0);
      assert.equal(p.type.name, "paragraph");
      assert.equal(p.attrs.lineSpacing, "1.5");
      assert.equal(p.attrs.formatRevisions.length, 1);
    }
  });

  assert.equal(bulletListCount, 1, "Cấu trúc bulletList không thay đổi");
  assert.equal(listItemCount, 2, "Cấu trúc listItem không thay đổi");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 10. TABLE CELLS (SEMANTIC SAFETY)
// -----------------------------------------------------------------------------
test("PHASE 4 — 10. Table Cells: định dạng đoạn văn trong các ô bảng giữ nguyên cấu trúc table", () => {
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
                    attrs: { nodeId: "cell1_p" },
                    content: [{ type: "text", text: "Ô số 1" }],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    attrs: { nodeId: "cell2_p" },
                    content: [{ type: "text", text: "Ô số 2" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Tìm vị trí text trong 2 ô bảng
  let cell1TextPos = -1;
  let cell2TextPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === "Ô số 1") {
      cell1TextPos = pos + 1;
    }
    if (node.isText && node.text === "Ô số 2") {
      cell2TextPos = pos + 1;
    }
  });

  editor.chain().setTextSelection({ from: cell1TextPos, to: cell2TextPos }).run();
  const res = setTextAlign(editor, "right");
  assert.equal(res, true);

  let cellCount = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableCell") {
      cellCount++;
      const p = node.child(0);
      assert.equal(p.type.name, "paragraph");
      assert.equal(p.attrs.textAlign, "right");
      assert.equal(p.attrs.formatRevisions.length, 1);
    }
  });

  assert.equal(cellCount, 2, "Cấu trúc 2 ô bảng vẫn giữ nguyên vẹn và 2 đoạn trong ô đều được định dạng");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 11. MIXED VALUES BEFOREHAND & PER-BLOCK PRECISION
// -----------------------------------------------------------------------------
test("PHASE 4 — 11. Mixed Values: mỗi block giữ before-value riêng biệt và bỏ qua block không đổi", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { nodeId: "p_left", textAlign: "left" },
        content: [{ type: "text", text: "Đoạn vốn căn trái." }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: "p_right", textAlign: "right" },
        content: [{ type: "text", text: "Đoạn vốn căn phải." }],
      },
      {
        type: "paragraph",
        attrs: { nodeId: "p_center", textAlign: "center" },
        content: [{ type: "text", text: "Đoạn vốn căn giữa sẵn." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Bôi đen cả 3 đoạn và chọn căn giữa (center):
  // Đoạn 1: left -> center (sinh revision before: left)
  // Đoạn 2: right -> center (sinh revision before: right)
  // Đoạn 3: center -> center (NO-OP! Không sinh revision)
  editor.chain().setTextSelection({ from: 1, to: 65 }).run();
  const res = setTextAlign(editor, "center");
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 2, "Chỉ tạo revision cho 2 đoạn thực sự thay đổi");

  const rev1 = changes.find((c) => c.targetNodeId === "p_left");
  const rev2 = changes.find((c) => c.targetNodeId === "p_right");
  const rev3 = changes.find((c) => c.targetNodeId === "p_center");

  assert.ok(rev1, "Revision cho p_left phải tồn tại");
  assert.ok(rev2, "Revision cho p_right phải tồn tại");
  assert.equal(rev3, undefined, "Đoạn p_center vốn đã là center không được có revision");

  const diff1 = rev1.formatChange?.changes.find((c) => c.property === "textAlign");
  const diff2 = rev2.formatChange?.changes.find((c) => c.property === "textAlign");

  assert.equal(diff1?.before, "left", "Before của p_left phải là left");
  assert.equal(diff1?.after, "center");

  assert.equal(diff2?.before, "right", "Before của p_right phải là right");
  assert.equal(diff2?.after, "center");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 12. NO-OP CHANGES
// -----------------------------------------------------------------------------
test("PHASE 4 — 12. No-op Changes: áp dụng giá trị giống hệt không sinh revision hay transaction dư thừa", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "center", lineSpacing: "1.5" },
        content: [{ type: "text", text: "Đoạn văn đã căn giữa và giãn 1.5." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Áp dụng lại đúng giá trị đã có
  editor.chain().setTextSelection(5).run();
  const res = setTextAlign(editor, "center");
  assert.equal(res, true, "Lệnh trả về true biểu thị no-op thành công");

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 0, "Không sinh bất kỳ revision nào");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 13. TRACK CHANGES ON VS OFF
// -----------------------------------------------------------------------------
test("PHASE 4 — 13. Track ON / OFF: ON sinh revision, OFF không sinh revision và bảo toàn pending cũ", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { nodeId: "p1" },
        content: [{ type: "text", text: "Văn bản thử nghiệm bật tắt track." }],
      },
    ],
  });

  // BƯỚC 1: Track ON -> đổi sang center -> sinh revision
  useReviewStore.getState().setTrackChangesEnabled(true);
  editor.chain().setTextSelection(5).run();
  setTextAlign(editor, "center");

  const changesOn = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesOn.length, 1);
  const revId1 = changesOn[0].id;

  // BƯỚC 2: Track OFF -> đổi sang right
  useReviewStore.getState().setTrackChangesEnabled(false);
  setTextAlign(editor, "right");

  const changesOff = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  // Đoạn văn đã sang "right"
  const pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.textAlign, "right");
  // Revision cũ (revId1) vẫn được bảo toàn nguyên vẹn trong formatRevisions
  assert.equal(changesOff.length, 1);
  assert.equal(changesOff[0].id, revId1);

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 14. MARKS COEXISTENCE (COMMENTS, TRACK INSERT/DELETE, LINKS)
// -----------------------------------------------------------------------------
test("PHASE 4 — 14. Marks Coexistence: định dạng đoạn văn không xóa comments, track marks hay hyperlinks", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Đoạn có ",
          },
          {
            type: "text",
            text: "chèn mới ",
            marks: [{ type: "trackChange", attrs: { id: "ins-1", changeType: "insert", author: "Bob" } }],
          },
          {
            type: "text",
            text: "bình luận ",
            marks: [{ type: "comment", attrs: { commentId: "c-1" } }],
          },
          {
            type: "text",
            text: "liên kết",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Đổi căn lề đoạn văn
  editor.chain().setTextSelection(5).run();
  const res = setTextAlign(editor, "center");
  assert.equal(res, true);

  // Kiểm tra paragraph có revision
  const pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.textAlign, "center");
  assert.equal(pNode.attrs.formatRevisions.length, 1);

  // Kiểm tra tất cả inline marks bên trong text nodes vẫn 100% nguyên vẹn
  let foundInsert = false;
  let foundComment = false;
  let foundLink = false;

  pNode.descendants((node) => {
    if (node.isText) {
      if (node.marks.some((m) => m.type.name === "trackChange" && m.attrs.id === "ins-1")) {
        foundInsert = true;
      }
      if (node.marks.some((m) => m.type.name === "comment" && m.attrs.commentId === "c-1")) {
        foundComment = true;
      }
      if (node.marks.some((m) => m.type.name === "link" && m.attrs.href === "https://example.com")) {
        foundLink = true;
      }
    }
  });

  assert.ok(foundInsert, "Insert trackChange mark vẫn nguyên vẹn");
  assert.ok(foundComment, "Comment mark vẫn nguyên vẹn");
  assert.ok(foundLink, "Link mark vẫn nguyên vẹn");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 15. ATOMIC UNDO / REDO
// -----------------------------------------------------------------------------
test("PHASE 4 — 15. Undo / Redo: hoàn tác và làm lại thao tác định dạng đoạn văn trong đúng 1 bước", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "left" },
        content: [{ type: "text", text: "Văn bản kiểm tra hoàn tác định dạng đoạn." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  editor.chain().setTextSelection(5).run();
  setTextAlign(editor, "center");

  // Kiểm tra trước khi undo
  let pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.textAlign, "center");
  assert.equal(pNode.attrs.formatRevisions.length, 1);

  // 1. Undo trong 1 bước
  const undoRes = undo(editor);
  assert.equal(undoRes, true);

  pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.textAlign, "left", "Căn lề hoàn tác về left");
  assert.equal(pNode.attrs.formatRevisions?.length || 0, 0, "Revision đã bị xóa sau undo");

  // 2. Redo trong 1 bước
  const redoRes = redo(editor);
  assert.equal(redoRes, true);

  pNode = editor.state.doc.child(0);
  assert.equal(pNode.attrs.textAlign, "center", "Căn lề khôi phục về center");
  assert.equal(pNode.attrs.formatRevisions.length, 1, "Revision được khôi phục sau redo");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 16. INDENTATION COMMANDS (INDENT / OUTDENT) OUTSIDE VS INSIDE LIST
// -----------------------------------------------------------------------------
test("PHASE 4 — 16. Indentation Commands: thụt lề ngoài list tạo revision, trong list bảo toàn cấu trúc", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { indent: 0 },
        content: [{ type: "text", text: "Đoạn văn thông thường tăng giảm lề." }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Mục list 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Mục list 2" }],
              },
            ],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Gọi indent() trên đoạn văn thông thường -> tạo paragraph format revision indent 0 -> 1
  editor.chain().setTextSelection(5).run();
  const indRes = indent(editor);
  assert.equal(indRes, true);

  let p1 = editor.state.doc.child(0);
  assert.equal(p1.attrs.indent, 1);
  assert.equal(p1.attrs.formatRevisions.length, 1);
  const rev1 = p1.attrs.formatRevisions[0];
  assert.ok(rev1.formatChange?.changes.some((c: any) => c.property === "indent" && c.before === 0 && c.after === 1));

  // 2. Gọi outdent() trên đoạn văn thông thường -> tạo revision indent 1 -> 0
  const outRes = outdent(editor);
  assert.equal(outRes, true);

  p1 = editor.state.doc.child(0);
  assert.equal(p1.attrs.indent, 0);
  assert.equal(p1.attrs.formatRevisions.length, 2);

  // 3. Đặt con trỏ vào Mục list 2 và gọi indent() -> lồng cấp danh sách (sinkListItem)
  editor.chain().setTextSelection(55).run();
  const listIndentRes = indent(editor);
  assert.equal(listIndentRes, true);

  // Kiểm tra danh sách vẫn có cấu trúc bulletList hợp lệ
  let hasNestedList = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "listItem" && node.childCount > 1) {
      if (node.child(1).type.name === "bulletList") {
        hasNestedList = true;
      }
    }
  });
  assert.ok(hasNestedList, "Mục list 2 đã lồng cấp thành công vào danh sách con");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});
