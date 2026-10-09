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
  applyParagraphFormatting,
  applyCharacterFormatting,
  undo,
  redo,
} from "../../editor/editorCommands.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";
import { FormattingDiffService } from "./formattingDiffService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
} from "../../styles/services/builtInStyles.ts";

function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm cho Phase 6 Accept và Reject Core." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. ACCEPT SINGLE PROPERTY (CHARACTER & PARAGRAPH)
// -----------------------------------------------------------------------------
test("PHASE 6 — 1. Accept Single Property: Giữ formatting hiện hành, gỡ metadata revision, không xóa text", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra Accept Single Property." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1.1 Character formatting: Font Size 12 -> 16
  editor.chain().setTextSelection({ from: 1, to: 9 }).run(); // "Đoạn văn"
  setFontSize(editor, 16);

  const changes1 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes1.length, 1);
  const charRevId = changes1[0].id;
  assert.equal(changes1[0].formatChange?.changes[0].property, "fontSize");
  assert.equal(changes1[0].formatChange?.changes[0].after, 16);

  // Chấp nhận revision
  const acceptedChar = TrackChangesService.acceptChange(editor, charRevId);
  assert.equal(acceptedChar, true, "Lệnh acceptChange cho character revision phải thành công");

  // Kiểm tra: formatting 16pt vẫn còn nguyên, revision metadata đã bị gỡ bỏ, text nguyên vẹn
  const changesAfterChar = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterChar.length, 0, "Không còn revision metadata nào");
  assert.equal(editor.state.doc.textContent, "Đoạn văn kiểm tra Accept Single Property.");

  let foundFontSize: string | undefined;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Đoạn văn")) {
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      foundFontSize = ts?.attrs?.fontSize;
    }
  });
  assert.equal(foundFontSize, "16pt", "Cỡ chữ 16pt phải được giữ nguyên sau khi Accept");

  // 1.2 Paragraph formatting: Alignment left -> center
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  setTextAlign(editor, "center");

  const changes2 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes2.length, 1);
  const paraRevId = changes2[0].id;
  assert.equal(changes2[0].scope, "paragraph");

  const acceptedPara = TrackChangesService.acceptChange(editor, paraRevId);
  assert.equal(acceptedPara, true, "Lệnh acceptChange cho paragraph revision phải thành công");

  const changesAfterPara = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterPara.length, 0, "Revision paragraph đã được gỡ bỏ");

  const firstPara = editor.state.doc.firstChild;
  assert.equal(firstPara?.attrs?.textAlign, "center", "Căn lề center phải được giữ nguyên");
  assert.equal(firstPara?.attrs?.formatRevisions?.length || 0, 0, "formatRevisions array rỗng");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 2. REJECT SINGLE PROPERTY (CHARACTER & PARAGRAPH)
// -----------------------------------------------------------------------------
test("PHASE 6 — 2. Reject Single Property: Khôi phục chính xác before-value, không replace node, giữ text", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra Reject Single Property an toàn." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 2.1 Character formatting: Bold false -> true
  editor.chain().setTextSelection({ from: 1, to: 9 }).run(); // "Kiểm tra"
  toggleBold(editor);

  const changes1 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes1.length, 1);
  const boldRevId = changes1[0].id;

  // Từ chối revision
  const rejectedBold = TrackChangesService.rejectChange(editor, boldRevId);
  assert.equal(rejectedBold, true, "Lệnh rejectChange cho bold phải thành công");

  // Kiểm tra: Bold mark bị gỡ bỏ, text nguyên vẹn, revision metadata bị gỡ bỏ
  const changesAfterBold = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterBold.length, 0);
  assert.equal(editor.state.doc.textContent, "Kiểm tra Reject Single Property an toàn.");

  let isBold = false;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Kiểm tra")) {
      isBold = node.marks.some((m) => m.type.name === "bold");
    }
  });
  assert.equal(isBold, false, "Chữ không còn in đậm sau khi Reject");

  // 2.2 Paragraph formatting: lineSpacing null -> 2.0
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  setLineSpacing(editor, "2.0");

  const changes2 = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes2.length, 1);
  const lineSpacingRevId = changes2[0].id;

  const rejectedPara = TrackChangesService.rejectChange(editor, lineSpacingRevId);
  assert.equal(rejectedPara, true, "Lệnh rejectChange cho lineSpacing phải thành công");

  const paraAfter = editor.state.doc.firstChild;
  assert.equal(paraAfter?.attrs?.lineSpacing, null, "lineSpacing phải khôi phục về null (inherited)");
  assert.equal(paraAfter?.attrs?.formatRevisions?.length || 0, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 3. ACCEPT / REJECT MULTIPLE PROPERTIES IN SINGLE REVISION
// -----------------------------------------------------------------------------
test("PHASE 6 — 3. Multi-property Revision: Accept và Reject đồng thời nhiều thuộc tính trong 1 revision", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Multi Property Test Content." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 3.1 Character multi-property: Bold + Color + FontSize
  editor.chain().setTextSelection({ from: 1, to: 6 }).run(); // "Multi"
  applyCharacterFormatting(editor, {
    bold: true,
    color: "#e11d48",
    fontSize: 16,
  });

  const changesChar = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesChar.length, 1);
  assert.equal(changesChar[0].formatChange?.changes.length, 3);
  const charRevId = changesChar[0].id;

  // Reject multi-property
  const rej = TrackChangesService.rejectChange(editor, charRevId);
  assert.equal(rej, true);

  // Cả 3 thuộc tính đều phải được khôi phục về trước đó
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Multi")) {
      assert.equal(node.marks.some((m) => m.type.name === "bold"), false, "Bold phải bị gỡ");
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      assert.ok(!ts?.attrs?.color, "Color phải bị gỡ");
      assert.ok(!ts?.attrs?.fontSize, "FontSize phải bị gỡ");
    }
  });

  // 3.2 Paragraph multi-property: textAlign + lineSpacing + spacingBefore
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  applyParagraphFormatting(editor, {
    textAlign: "right",
    lineSpacing: "1.5",
    spacingBefore: 12,
  });

  const changesPara = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesPara.length, 1);
  assert.equal(changesPara[0].formatChange?.changes.length, 3);
  const paraRevId = changesPara[0].id;

  // Accept multi-property
  const acc = TrackChangesService.acceptChange(editor, paraRevId);
  assert.equal(acc, true);

  const paraNode = editor.state.doc.firstChild;
  assert.equal(paraNode?.attrs?.textAlign, "right");
  assert.equal(paraNode?.attrs?.lineSpacing, "1.5");
  assert.equal(paraNode?.attrs?.spacingBefore, 12);
  assert.equal(paraNode?.attrs?.formatRevisions?.length || 0, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 4. DIRECT VS INHERITED (MISSING PREVIOUS VALUE HANDLING)
// -----------------------------------------------------------------------------
test("PHASE 6 — 4. Direct vs Inherited: Reject khôi phục đúng before-value, không tạo override vô ích", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        // Đoạn văn không có attrs lineSpacing (kế thừa hoàn toàn từ stylesheet)
        content: [{ type: "text", text: "Văn bản kế thừa hoàn toàn từ Style Base." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Đoạn văn ban đầu: lineSpacing là null
  assert.equal(editor.state.doc.firstChild?.attrs?.lineSpacing, null);

  // Áp dụng direct formatting: lineSpacing = "1.5"
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  setLineSpacing(editor, "1.5");

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1);
  const diff = changes[0].formatChange?.changes.find((c) => c.property === "lineSpacing");
  assert.equal(diff?.before, null, "Before-value ban đầu phải là null (missing/inherited)");
  assert.equal(diff?.after, "1.5");

  // Reject thay đổi
  TrackChangesService.rejectChange(editor, changes[0].id);

  // Node attrs phải khôi phục về null, bảo toàn kế thừa
  const paraAfterReject = editor.state.doc.firstChild;
  assert.equal(
    paraAfterReject?.attrs?.lineSpacing,
    null,
    "lineSpacing phải được khôi phục về null, bảo toàn tính kế thừa"
  );

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 5. STYLE ASSIGNMENT REVISIONS ACCEPT & REJECT
// -----------------------------------------------------------------------------
test("PHASE 6 — 5. Style Assignment Revisions: Chuyển đổi Normal <-> Heading và Character Style", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tiêu đề kiểm tra Style Revision." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 5.1 Paragraph Style: Normal -> Heading 1
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  TrackChangesService.applyTrackedParagraphStyle(editor, STYLE_HEADING_1_ID);

  let paraNode = editor.state.doc.firstChild;
  assert.equal(paraNode?.type.name, "heading");
  assert.equal(paraNode?.attrs?.level, 1);
  assert.equal(paraNode?.attrs?.styleId, STYLE_HEADING_1_ID);

  const changesHeading = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesHeading.length, 1);

  // Reject: Khôi phục paragraph node type và loại bỏ level
  TrackChangesService.rejectChange(editor, changesHeading[0].id);

  paraNode = editor.state.doc.firstChild;
  assert.equal(paraNode?.type.name, "paragraph", "Phải khôi phục node type về paragraph");
  assert.equal(paraNode?.attrs?.level, undefined, "Level heading phải bị xóa bỏ");
  assert.equal(paraNode?.attrs?.styleId, null, "styleId phải là null/Normal");

  // 5.2 Character Style: Áp dụng và Accept
  editor.chain().setTextSelection({ from: 1, to: 8 }).run(); // "Tiêu đề"
  TrackChangesService.applyTrackedCharacterFormatting(editor, { characterStyleId: "char_strong" });

  const changesCharStyle = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesCharStyle.length, 1);

  TrackChangesService.acceptChange(editor, changesCharStyle[0].id);

  const changesAfterCharStyle = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterCharStyle.length, 0);

  let foundCharStyle: string | undefined;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Tiêu đề")) {
      const cs = node.marks.find((m) => m.type.name === "characterStyle");
      foundCharStyle = cs?.attrs?.styleId;
    }
  });
  assert.equal(foundCharStyle, "char_strong", "Character style được giữ nguyên sau khi Accept");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 6. REPEATED SAME-PROPERTY CHANGES — REBASE ON REJECT A BEFORE B
// -----------------------------------------------------------------------------
test("PHASE 6 — 6. Overlapping: Reject A trước B -> Document giữ B (16pt), Rebase B.before thành 12pt", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm chuỗi thay đổi kích thước chữ." }],
      },
    ],
  });

  // Đặt cỡ chữ ban đầu là 12pt trước khi bật Track Changes
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  setFontSize(editor, 12);

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Revision A: Font Size 12 -> 14
  editor.chain().setTextSelection({ from: 1, to: 8 }).run(); // "Văn bản"
  setFontSize(editor, 14);

  const changesA = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesA.length, 1);
  const idA = changesA[0].id;

  // Revision B: Font Size 14 -> 16 trên cùng đoạn text
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  setFontSize(editor, 16);

  const changesAB = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAB.length, 2, "Có 2 revision cùng tồn tại trên text");
  const idB = changesAB.find((c) => c.id !== idA)!.id;

  // REJECT A TRƯỚC B
  const rejA = TrackChangesService.rejectChange(editor, idA);
  assert.equal(rejA, true, "Reject A thành công");

  // Document vẫn phải giữ 16pt (vì B là thay đổi mới nhất đang active)
  let activeFontSize: string | undefined;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Văn bản")) {
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      activeFontSize = ts?.attrs?.fontSize;
    }
  });
  assert.equal(activeFontSize, "16pt", "Văn bản vẫn giữ 16pt của revision B");

  // Kiểm tra revision B đã được REBASE: before chuyển từ 14 -> 12
  const changesAfterRejA = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterRejA.length, 1);
  assert.equal(changesAfterRejA[0].id, idB);
  const rebasedDiff = changesAfterRejA[0].formatChange?.changes.find((c) => c.property === "fontSize");
  assert.equal(
    FormattingDiffService.normalizeFontSize(rebasedDiff?.before),
    12,
    "Revision B đã được REBASE: before = 12 (giá trị trước Revision A)"
  );
  assert.equal(FormattingDiffService.normalizeFontSize(rebasedDiff?.after), 16);

  // Nếu sau đó Reject tiếp B: văn bản phải quay về 12pt!
  const rejB = TrackChangesService.rejectChange(editor, idB);
  assert.equal(rejB, true, "Reject B thành công");

  let finalFontSize: string | undefined;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Văn bản")) {
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      finalFontSize = ts?.attrs?.fontSize;
    }
  });
  assert.equal(finalFontSize, "12pt", "Văn bản quay về đúng 12pt sau khi reject B");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 7. REPEATED SAME-PROPERTY CHANGES — SUPERSEDE ON ACCEPT B BEFORE A
// -----------------------------------------------------------------------------
test("PHASE 6 — 7. Overlapping: Accept B trước A -> B được chấp nhận (16pt), A bị supersede/retire", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản kiểm tra Accept B trước A." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Revision A: Font Size 12 -> 14
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  setFontSize(editor, 14);

  const changesA = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesA.length, 1);
  const idA = changesA[0].id;

  // Revision B: Font Size 14 -> 16
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  setFontSize(editor, 16);

  const changesAB = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAB.length, 2);
  const idB = changesAB.find((c) => c.id !== idA)!.id;

  // ACCEPT B TRƯỚC A
  const accB = TrackChangesService.acceptChange(editor, idB);
  assert.equal(accB, true, "Accept B thành công");

  // Văn bản giữ 16pt
  let currentFontSize: string | undefined;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Văn bản")) {
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      currentFontSize = ts?.attrs?.fontSize;
    }
  });
  assert.equal(currentFontSize, "16pt", "Văn bản giữ 16pt của B");

  // Revision A đã bị SUPERSEDE hoàn toàn vì chỉ có thuộc tính fontSize -> A tự động retire!
  const changesAfterAccB = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterAccB.length, 0, "Không còn revision pending nào (A đã bị supersede)");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 8. OVERLAPPING: ACCEPT A TRƯỚC B & REJECT B TRƯỚC A
// -----------------------------------------------------------------------------
test("PHASE 6 — 8. Overlapping: Accept A trước B và Reject B trước A", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra Accept A trước B và Reject B trước A." }],
      },
    ],
  });

  // Ban đầu đặt 12pt
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  setFontSize(editor, 12);

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Revision A: Font Size 12 -> 14
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  setFontSize(editor, 14);

  const idA = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // Revision B: Font Size 14 -> 16
  editor.chain().setTextSelection({ from: 1, to: 9 }).run();
  setFontSize(editor, 16);

  const idB = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).find((c) => c.id !== idA)!.id;

  // 8.1 ACCEPT A TRƯỚC B:
  // A được accept. Document vẫn là 16 (do B đang active). B vẫn pending (14 -> 16).
  const accA = TrackChangesService.acceptChange(editor, idA);
  assert.equal(accA, true);

  const changesAfterAccA = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterAccA.length, 1);
  assert.equal(changesAfterAccA[0].id, idB);
  assert.equal(
    FormattingDiffService.normalizeFontSize(changesAfterAccA[0].formatChange?.changes[0].before),
    14
  );
  assert.equal(
    FormattingDiffService.normalizeFontSize(changesAfterAccA[0].formatChange?.changes[0].after),
    16
  );

  // Sau đó Reject B: Văn bản quay về 14pt (giá trị đã accept của A)!
  const rejB = TrackChangesService.rejectChange(editor, idB);
  assert.equal(rejB, true);

  let finalFontSize: string | undefined;
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Kiểm tra")) {
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      finalFontSize = ts?.attrs?.fontSize;
    }
  });
  assert.equal(finalFontSize, "14pt", "Văn bản quay về 14pt (giá trị đã accept của A)");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 9. OVERLAPPING INDEPENDENT PROPERTIES (A: fontSize, C: bold)
// -----------------------------------------------------------------------------
test("PHASE 6 — 9. Independent Properties: Accept/Reject Bold không ảnh hưởng đến FontSize pending", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn kiểm tra tính độc lập của các thuộc tính." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Revision A: Font Size 12 -> 16
  editor.chain().setTextSelection({ from: 1, to: 8 }).run(); // "Đoạn văn"
  setFontSize(editor, 16);

  const idA = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // Revision C: Bold false -> true (độc lập hoàn toàn với fontSize)
  editor.chain().setTextSelection({ from: 1, to: 8 }).run();
  toggleBold(editor);

  const allChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(allChanges.length, 2);
  const idC = allChanges.find((c) => c.id !== idA)!.id;

  // REJECT C (Bold):
  // Bold bị gỡ bỏ, nhưng FontSize 16 và Revision A vẫn NGUYÊN VẸN!
  const rejC = TrackChangesService.rejectChange(editor, idC);
  assert.equal(rejC, true);

  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Đoạn văn")) {
      assert.equal(node.marks.some((m) => m.type.name === "bold"), false, "Bold đã bị gỡ");
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      assert.equal(ts?.attrs?.fontSize, "16pt", "FontSize 16pt vẫn nguyên vẹn");
    }
  });

  const changesAfterRejC = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterRejC.length, 1);
  assert.equal(changesAfterRejC[0].id, idA, "Revision A vẫn pending bình thường");

  // ACCEPT A (FontSize):
  const accA = TrackChangesService.acceptChange(editor, idA);
  assert.equal(accA, true);

  const changesFinal = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesFinal.length, 0);

  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Đoạn văn")) {
      assert.equal(node.marks.some((m) => m.type.name === "bold"), false);
      const ts = node.marks.find((m) => m.type.name === "textStyle");
      assert.equal(ts?.attrs?.fontSize, "16pt");
    }
  });

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 10. PARAGRAPH BLOCK REBASE & SUPERSEDE
// -----------------------------------------------------------------------------
test("PHASE 6 — 10. Paragraph Block: Reject A trước B rebase B.before, Accept B trước A supersede A", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung đoạn văn kiểm tra paragraph block lifecycle." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Revision A: textAlign "left" -> "center"
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  setTextAlign(editor, "center");

  const idA = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // Revision B: textAlign "center" -> "right"
  editor.chain().setTextSelection({ from: 1, to: 5 }).run();
  setTextAlign(editor, "right");

  const changesAB = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAB.length, 2);
  const idB = changesAB.find((c) => c.id !== idA)!.id;

  // Reject A trước B:
  // Node giữ textAlign="right", B được rebase before="left"
  TrackChangesService.rejectChange(editor, idA);

  let para = editor.state.doc.firstChild;
  assert.equal(para?.attrs?.textAlign, "right", "Giữ alignment của revision B");
  assert.equal(para?.attrs?.formatRevisions?.length, 1);
  const rebasedParaDiff = para?.attrs?.formatRevisions[0].formatChange?.changes[0];
  assert.equal(rebasedParaDiff?.before, "left", "B.before được rebase về 'left' (giá trị trước A)");

  // Reject B:
  TrackChangesService.rejectChange(editor, idB);

  para = editor.state.doc.firstChild;
  assert.equal(para?.attrs?.textAlign, "left", "Khôi phục về 'left' hoàn toàn");
  assert.equal(para?.attrs?.formatRevisions?.length || 0, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 11. ZERO TEXT MUTATION & PRESERVATION OF OTHER MARKS
// -----------------------------------------------------------------------------
test("PHASE 6 — 11. Mark Coexistence: Accept/Reject định dạng không xóa text và không làm mất Comment / Link", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            text: "Liên kết",
          },
          {
            type: "text",
            text: " và ",
          },
          {
            type: "text",
            marks: [{ type: "comment", attrs: { commentId: "comm-123" } }],
            text: "bình luận mẫu",
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Đổi font size toàn bộ đoạn văn (từ pos 1 đến pos 26)
  editor.chain().setTextSelection({ from: 1, to: 26 }).run();
  setFontSize(editor, 18);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1);
  const revId = changes[0].id;

  // Reject thay đổi
  TrackChangesService.rejectChange(editor, revId);

  // 1. Text hoàn toàn nguyên vẹn
  assert.equal(editor.state.doc.textContent, "Liên kết và bình luận mẫu");

  // 2. Link mark vẫn nguyên vẹn
  let linkPreserved = false;
  let commentPreserved = false;

  editor.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("Liên kết")) {
      linkPreserved = node.marks.some((m) => m.type.name === "link" && m.attrs.href === "https://example.com");
    }
    if (node.isText && node.text?.includes("bình luận")) {
      commentPreserved = node.marks.some((m) => m.type.name === "comment" && m.attrs.commentId === "comm-123");
    }
  });

  assert.equal(linkPreserved, true, "Hyperlink mark phải được bảo toàn nguyên vẹn");
  assert.equal(commentPreserved, true, "Comment mark phải được bảo toàn nguyên vẹn");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 12. ATOMIC UNDO / REDO INDIVIDUAL LIFECYCLE (1 STEP)
// -----------------------------------------------------------------------------
test("PHASE 6 — 12. Atomic Undo / Redo: Hoàn tác và làm lại Accept / Reject trong đúng 1 bước", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Kiểm tra Undo/Redo cho Accept và Reject." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Áp dụng định dạng màu sắc
  editor.chain().setTextSelection({ from: 1, to: 9 }).run(); // "Kiểm tra"
  setTextColor(editor, "#16a34a");

  const revId = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc)[0].id;

  // 12.1 Reject -> Undo -> Redo
  const rej = TrackChangesService.rejectChange(editor, revId);
  assert.equal(rej, true);

  // Sau khi reject: không còn revision
  assert.equal(TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length, 0);

  // Undo 1 bước: revision và màu sắc quay trở lại
  undo(editor);
  const restoredChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(restoredChanges.length, 1, "Revision phải được khôi phục sau 1 bước Undo");
  assert.equal(restoredChanges[0].id, revId);

  // Redo 1 bước: revision lại bị reject sạch sẽ
  redo(editor);
  assert.equal(TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length, 0, "Revision bị reject lại sau 1 bước Redo");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});
