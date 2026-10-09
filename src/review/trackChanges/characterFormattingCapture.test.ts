import { test } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../../editor/editorExtensions.ts";
import {
  ensureEditorPlugins,
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  setFontFamily,
  setFontSize,
  setTextColor,
  setTextHighlight,
  applyCharacterFormatting,
  undo,
  redo,
} from "../../editor/editorCommands.ts";
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
          content: [{ type: "text", text: "Văn bản thử nghiệm hệ thống Track Changes 2.0." }],
        },
      ],
    },
  });
  ensureEditorPlugins(editor);
  return editor;
}

// -----------------------------------------------------------------------------
// 1. EIGHT SUPPORTED PROPERTIES TRACKING VIA COMMAND PIPELINE
// -----------------------------------------------------------------------------
test("PHASE 3 — 1. Supported Properties: 8 thuộc tính định dạng ký tự ghi nhận đúng qua command pipeline", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Chữ một chữ hai chữ ba chữ bốn chữ năm chữ sáu chữ bảy chữ tám." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Bold (toggleBold)
  editor.chain().setTextSelection({ from: 1, to: 8 }).run(); // "Chữ một"
  const boldRes = toggleBold(editor);
  assert.equal(boldRes, true);

  // 2. Italic (toggleItalic)
  editor.chain().setTextSelection({ from: 9, to: 16 }).run(); // "chữ hai"
  const italicRes = toggleItalic(editor);
  assert.equal(italicRes, true);

  // 3. Underline (toggleUnderline)
  editor.chain().setTextSelection({ from: 17, to: 23 }).run(); // "chữ ba"
  const underlineRes = toggleUnderline(editor);
  assert.equal(underlineRes, true);

  // 4. Strikethrough (toggleStrike)
  editor.chain().setTextSelection({ from: 24, to: 31 }).run(); // "chữ bốn"
  const strikeRes = toggleStrike(editor);
  assert.equal(strikeRes, true);

  // 5. Font Family (setFontFamily)
  editor.chain().setTextSelection({ from: 32, to: 39 }).run(); // "chữ năm"
  const fontRes = setFontFamily(editor, "Georgia, serif");
  assert.equal(fontRes, true);

  // 6. Font Size (setFontSize)
  editor.chain().setTextSelection({ from: 40, to: 47 }).run(); // "chữ sáu"
  const sizeRes = setFontSize(editor, 18);
  assert.equal(sizeRes, true);

  // 7. Text Color (setTextColor)
  editor.chain().setTextSelection({ from: 48, to: 55 }).run(); // "chữ bảy"
  const colorRes = setTextColor(editor, "#dc2626");
  assert.equal(colorRes, true);

  // 8. Highlight (setTextHighlight)
  editor.chain().setTextSelection({ from: 56, to: 63 }).run(); // "chữ tám"
  const highlightRes = setTextHighlight(editor, "#fef08a");
  assert.equal(highlightRes, true);

  // Kiểm tra danh sách thay đổi trích xuất được
  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 8, "Phải ghi nhận chính xác 8 revisions cho 8 thuộc tính");

  // Kiểm tra từng thay đổi chỉ chứa đúng thuộc tính đã đổi, không chụp toàn bộ snapshot
  for (const c of changes) {
    assert.equal(c.type, "format");
    assert.equal(c.scope, "character");
    assert.ok(c.formatChange);
    assert.equal(c.formatChange.changes.length, 1, "Mỗi revision chỉ ghi nhận thuộc tính thực sự thay đổi");
  }

  assert.equal(changes[0].formatChange?.changes[0].property, "bold");
  assert.equal(changes[0].formatChange?.changes[0].after, true);

  assert.equal(changes[1].formatChange?.changes[0].property, "italic");
  assert.equal(changes[1].formatChange?.changes[0].after, true);

  assert.equal(changes[2].formatChange?.changes[0].property, "underline");
  assert.equal(changes[2].formatChange?.changes[0].after, true);

  assert.equal(changes[3].formatChange?.changes[0].property, "strike");
  assert.equal(changes[3].formatChange?.changes[0].after, true);

  assert.equal(changes[4].formatChange?.changes[0].property, "fontFamily");
  assert.equal(changes[4].formatChange?.changes[0].after, "Georgia, serif");

  assert.equal(changes[5].formatChange?.changes[0].property, "fontSize");
  assert.equal(changes[5].formatChange?.changes[0].after, 18);

  assert.equal(changes[6].formatChange?.changes[0].property, "color");
  assert.equal(changes[6].formatChange?.changes[0].after, "#dc2626");

  assert.equal(changes[7].formatChange?.changes[0].property, "highlight");
  assert.equal(changes[7].formatChange?.changes[0].after, "#fef08a");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 2. KEYBOARD SHORTCUTS CAPTURE (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X)
// -----------------------------------------------------------------------------
test("PHASE 3 — 2. Keyboard Shortcuts: bắt phím tắt và ghi nhận Track Changes khi Track ON", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Phím tắt In Đậm, In Nghiêng, Gạch Chân và Gạch Ngang." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Ctrl+B
  editor.chain().setTextSelection({ from: 10, to: 17 }).run(); // "In Đậm"
  const handledB = TrackChangesService.applyTrackedKeyDown(
    editor.view,
    { key: "b", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
    "Keyboard User"
  );
  assert.equal(handledB, true, "Ctrl+B phải được xử lý");

  // 2. Ctrl+I
  editor.chain().setTextSelection({ from: 18, to: 28 }).run(); // "In Nghiêng"
  const handledI = TrackChangesService.applyTrackedKeyDown(
    editor.view,
    { key: "i", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
    "Keyboard User"
  );
  assert.equal(handledI, true, "Ctrl+I phải được xử lý");

  // 3. Ctrl+U
  editor.chain().setTextSelection({ from: 30, to: 39 }).run(); // "Gạch Chân"
  const handledU = TrackChangesService.applyTrackedKeyDown(
    editor.view,
    { key: "u", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
    "Keyboard User"
  );
  assert.equal(handledU, true, "Ctrl+U phải được xử lý");

  // 4. Ctrl+Shift+X
  editor.chain().setTextSelection({ from: 43, to: 53 }).run(); // "Gạch Ngang"
  const handledStrike = TrackChangesService.applyTrackedKeyDown(
    editor.view,
    { key: "x", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
    "Keyboard User"
  );
  assert.equal(handledStrike, true, "Ctrl+Shift+X phải được xử lý");

  // 5. Kiểm tra phím tắt khi vùng chọn rỗng (caret) -> trả về false (không tạo revision)
  editor.chain().setTextSelection({ from: 1, to: 1 }).run();
  const caretB = TrackChangesService.applyTrackedKeyDown(
    editor.view,
    { key: "b", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
    "Keyboard User"
  );
  assert.equal(caretB, false, "Caret không được tạo revision rỗng");

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 4, "Phải ghi nhận đúng 4 revisions từ keyboard shortcuts");
  assert.equal(changes[0].author, "Keyboard User");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 3. MULTI-PROPERTY COMMAND EXECUTION
// -----------------------------------------------------------------------------
test("PHASE 3 — 3. Multi-Property Command: áp dụng nhiều thuộc tính cùng lúc trong 1 revision", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản cần đổi nhiều thuộc tính định dạng." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);
  editor.chain().setTextSelection({ from: 1, to: 15 }).run();

  const success = applyCharacterFormatting(editor, {
    bold: true,
    italic: true,
    fontSize: 16,
    color: "#2563eb",
    fontFamily: "Times New Roman",
  });
  assert.equal(success, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1, "Tất cả thuộc tính trong 1 lệnh tạo đúng 1 revision duy nhất");

  const rev = changes[0];
  assert.equal(rev.type, "format");
  assert.equal(rev.scope, "character");
  assert.ok(rev.formatChange);
  assert.equal(rev.formatChange.changes.length, 5, "Chứa đủ 5 thuộc tính thay đổi");

  const changedProps = rev.formatChange.changes.map((c) => c.property).sort();
  assert.deepEqual(changedProps, ["bold", "color", "fontFamily", "fontSize", "italic"].sort());

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 4. MIXED SELECTION HANDLING
// -----------------------------------------------------------------------------
test("PHASE 3 — 4. Mixed Selection: ghi đúng từng affected range/property, không lấy first run làm before", () => {
  // Tạo doc với Run 1: Arial, 12pt, đỏ (#dc2626), bold: true
  //           Run 2: Georgia, 16pt, xanh (#2563eb), bold: false
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "ĐOẠN ĐỎ ĐẬM ",
            marks: [
              { type: "bold" },
              { type: "textStyle", attrs: { fontFamily: "Arial", fontSize: "12pt", color: "#dc2626" } },
            ],
          },
          {
            type: "text",
            text: "đoạn xanh nhạt",
            marks: [
              { type: "textStyle", attrs: { fontFamily: "Georgia", fontSize: "16pt", color: "#2563eb" } },
            ],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Trường hợp 1: Người dùng bôi đen toàn bộ và đổi màu sang xanh lá (#16a34a)
  // Run 1: color trước là #dc2626 -> sau là #16a34a
  // Run 2: color trước là #2563eb -> sau là #16a34a
  editor.chain().setTextSelection({ from: 1, to: 27 }).run();
  const colorRes = setTextColor(editor, "#16a34a");
  assert.equal(colorRes, true);

  const changesAfterColor = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesAfterColor.length, 2, "Vùng chọn hỗn hợp màu phải tách thành 2 revisions tương ứng với 2 dải");

  const rev1 = changesAfterColor.find((r) => r.from === 1 && r.to === 13);
  const rev2 = changesAfterColor.find((r) => r.from === 13 && r.to === 27);

  assert.ok(rev1, "Revision cho Run 1 phải tồn tại");
  assert.ok(rev2, "Revision cho Run 2 phải tồn tại");

  assert.equal(rev1.formatChange?.changes[0].before, "#dc2626", "Before của Run 1 phải là màu đỏ");
  assert.equal(rev1.formatChange?.changes[0].after, "#16a34a");

  assert.equal(rev2.formatChange?.changes[0].before, "#2563eb", "Before của Run 2 phải là màu xanh, không lấy của Run 1");
  assert.equal(rev2.formatChange?.changes[0].after, "#16a34a");

  // Trường hợp 2: Run 1 đã Bold = true, Run 2 là Bold = false.
  // Người dùng bôi đen toàn bộ và chọn In Đậm:
  // Chỉ có Run 2 bị thay đổi (false -> true). Run 1 đã đậm rồi nên không tạo revision giả!
  editor.chain().setTextSelection({ from: 1, to: 27 }).run();
  const boldRes = toggleBold(editor);
  assert.equal(boldRes, true);

  const allChanges = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  const boldRevs = allChanges.filter((r) => r.formatChange?.changes.some((c) => c.property === "bold"));

  assert.equal(boldRevs.length, 1, "Chỉ có đúng 1 revision bold được tạo");
  assert.equal(boldRevs[0].from, 13, "Revision bold chỉ nằm trên Run 2 (từ vị trí 13)");
  assert.equal(boldRevs[0].to, 27);
  assert.equal(boldRevs[0].formatChange?.changes[0].before, false);
  assert.equal(boldRevs[0].formatChange?.changes[0].after, true);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 5. PARTIAL SELECTION & MULTI-RUN RANGE
// -----------------------------------------------------------------------------
test("PHASE 3 — 5. Partial Selection: chỉ định dạng và gắn revision đúng phần được bôi đen", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "0123456789ABCDEF" }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Chỉ chọn các ký tự từ pos 5 đến 11 ("456789")
  editor.chain().setTextSelection({ from: 5, to: 11 }).run();
  const res = toggleItalic(editor);
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].from, 5);
  assert.equal(changes[0].to, 11);
  assert.equal(changes[0].text, "456789");

  // Các phần ngoài vùng chọn (1..5 và 11..17) không có mark italic hay trackChange
  const $posBefore = editor.state.doc.resolve(3);
  assert.equal($posBefore.marks().length, 0);

  const $posAfter = editor.state.doc.resolve(13);
  assert.equal($posAfter.marks().length, 0);

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 6. MULTI-PARAGRAPH SELECTION
// -----------------------------------------------------------------------------
test("PHASE 3 — 6. Multi-Paragraph: bôi đen qua nhiều đoạn văn không làm hỏng cấu trúc block", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thứ nhất có văn bản." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn thứ hai có nội dung." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // Bôi đen từ giữa đoạn 1 (pos 10) sang giữa đoạn 2 (pos 40)
  editor.chain().setTextSelection({ from: 10, to: 40 }).run();
  const res = setTextColor(editor, "#7c3aed");
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.ok(changes.length >= 1, "Phải ghi nhận format revision");

  // Đảm bảo cấu trúc document vẫn có đủ 2 paragraph nodes
  let paraCount = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "paragraph") paraCount++;
  });
  assert.equal(paraCount, 2, "Cấu trúc 2 paragraph vẫn nguyên vẹn");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 7. CHARACTER FORMATTING IN TABLE CELLS
// -----------------------------------------------------------------------------
test("PHASE 3 — 7. Table Cells: định dạng ký tự bên trong ô bảng ghi nhận revision chuẩn xác", () => {
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
                    content: [{ type: "text", text: "Ô một" }],
                  },
                ],
              },
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Ô hai" }],
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

  // Tìm vị trí text "Ô một" bên trong table
  let cell1TextFrom = -1;
  let cell1TextTo = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === "Ô một") {
      cell1TextFrom = pos;
      cell1TextTo = pos + node.nodeSize;
    }
  });

  assert.ok(cell1TextFrom > 0);
  editor.chain().setTextSelection({ from: cell1TextFrom, to: cell1TextTo }).run();
  const res = toggleBold(editor);
  assert.equal(res, true);

  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "format");
  assert.equal(changes[0].text, "Ô một");
  assert.equal(changes[0].formatChange?.changes[0].property, "bold");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 8. NO-OP & EXCLUSIONS
// -----------------------------------------------------------------------------
test("PHASE 3 — 8. Exclusions: không sinh revision khi giá trị không đổi hoặc vùng chọn rỗng", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Chữ đã in đậm",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);

  // 1. Áp dụng bold: true trên văn bản đã bold: true
  editor.chain().setTextSelection({ from: 1, to: 14 }).run();
  const noOpRes = applyCharacterFormatting(editor, { bold: true });
  assert.equal(noOpRes, true); // command runs cleanly

  // 2. Vùng chọn rỗng (caret)
  editor.chain().setTextSelection({ from: 5, to: 5 }).run();
  toggleItalic(editor);

  // Xác nhận: Không có bất kỳ revision nào được tạo ra
  const changes = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changes.length, 0, "Tuyệt đối không sinh bất kỳ revision rỗng hay no-op nào");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 9. TRACK ON / OFF BEHAVIOR
// -----------------------------------------------------------------------------
test("PHASE 3 — 9. Track ON / OFF: ON sinh revision, OFF không sinh revision và giữ pending cũ", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn một. Đoạn hai." }],
      },
    ],
  });

  // BẬT Track Changes -> Định dạng Đoạn 1
  useReviewStore.getState().setTrackChangesEnabled(true);
  editor.chain().setTextSelection({ from: 1, to: 9 }).run(); // "Đoạn một"
  toggleBold(editor);

  const changesWhileOn = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesWhileOn.length, 1);
  const initialRevId = changesWhileOn[0].id;

  // TẮT Track Changes -> Định dạng Đoạn 2
  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.chain().setTextSelection({ from: 11, to: 19 }).run(); // "Đoạn hai"
  toggleItalic(editor);

  // Kiểm tra: Đoạn 2 được in nghiêng bình thường, nhưng KHÔNG có revision mới
  const changesWhileOff = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
  assert.equal(changesWhileOff.length, 1, "Số lượng revision không tăng khi Track OFF");
  assert.equal(changesWhileOff[0].id, initialRevId, "Revision cũ vẫn được giữ nguyên vẹn");

  editor.destroy();
});

// -----------------------------------------------------------------------------
// 10. MARKS COEXISTENCE (Comments, Links, Track Changes)
// -----------------------------------------------------------------------------
test("PHASE 3 — 10. Marks Coexistence: không xóa comments, hyperlinks hay insert revisions hiện tại", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Văn bản đặc biệt",
            marks: [
              { type: "comment", attrs: { commentId: "comm-123" } },
              { type: "link", attrs: { href: "https://example.com" } },
              { type: "trackChange", attrs: { id: "ins-999", changeType: "insert", author: "Author" } },
            ],
          },
        ],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);
  editor.chain().setTextSelection({ from: 1, to: 17 }).run();

  // Áp dụng đổi màu chữ khi Track ON
  setTextColor(editor, "#dc2626");

  // Kiểm tra text node tại pos 5
  const $pos = editor.state.doc.resolve(5);
  const markNames = $pos.marks().map((m) => m.type.name);

  assert.ok(markNames.includes("comment"), "Comment mark phải còn nguyên");
  assert.ok(markNames.includes("link"), "Link mark phải còn nguyên");
  assert.ok(markNames.includes("textStyle"), "textStyle màu mới phải được thêm");

  // Phải có 2 mark trackChange: 1 insert và 1 format
  const trackMarks = $pos.marks().filter((m) => m.type.name === "trackChange");
  assert.equal(trackMarks.length, 2, "Cả insert mark và format mark cùng tồn tại song song");

  const insMark = trackMarks.find((m) => m.attrs.changeType === "insert");
  const fmtMark = trackMarks.find((m) => m.attrs.changeType === "format");

  assert.ok(insMark);
  assert.ok(fmtMark);
  assert.equal(insMark.attrs.id, "ins-999");

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});

// -----------------------------------------------------------------------------
// 11. ATOMIC UNDO / REDO
// -----------------------------------------------------------------------------
test("PHASE 3 — 11. Undo / Redo: hoàn tác và làm lại formatting action đồng bộ trong đúng 1 bước", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản để kiểm tra hoàn tác định dạng." }],
      },
    ],
  });

  useReviewStore.getState().setTrackChangesEnabled(true);
  editor.chain().setTextSelection({ from: 1, to: 15 }).run();

  // Bước 1: Áp dụng In Đậm khi Track ON
  toggleBold(editor);
  assert.equal(TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length, 1);
  assert.equal(editor.isActive("bold"), true);

  // Bước 2: Gọi Undo -> Trong ĐÚNG 1 BƯỚC, cả bold và trackChange format mark đều bị gỡ bỏ!
  undo(editor);
  assert.equal(editor.isActive("bold"), false, "Undo phải gỡ bỏ in đậm");
  assert.equal(
    TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length,
    0,
    "Undo phải gỡ bỏ luôn cả trackChange format revision trong đúng 1 bước"
  );

  // Bước 3: Gọi Redo -> Trong ĐÚNG 1 BƯỚC, cả bold và trackChange format mark đều được khôi phục!
  redo(editor);
  assert.equal(editor.isActive("bold"), true, "Redo phải phục hồi in đậm");
  assert.equal(
    TrackChangesService.getTrackedChangesFromDoc(editor.state.doc).length,
    1,
    "Redo phải phục hồi lại format revision"
  );

  useReviewStore.getState().setTrackChangesEnabled(false);
  editor.destroy();
});
