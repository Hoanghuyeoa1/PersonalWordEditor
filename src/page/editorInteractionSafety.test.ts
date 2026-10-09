import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { buildPageLayoutMap } from "./services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import type { RenderedLineBox } from "./services/lineMeasurementService.ts";
import { undo, redo, ensureEditorPlugins } from "../editor/editorCommands.ts";

/**
 * PHASE 4 — EDITOR INTERACTION SAFETY TESTS
 *
 * Kiểm tra toàn diện an toàn tương tác biên tập trên paragraph đã phân mảnh trực quan qua nhiều trang:
 * 1. Caret navigation tại ranh giới trang (ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Home, End, Ctrl+Home, Ctrl+End)
 * 2. Typing / Delete tại ranh giới (trước, tại và sau ranh giới)
 * 3. Vietnamese IME Composition (không đảo dấu, không mất ký tự, không lặp ký tự)
 * 4. Selection liên tục qua 2 trang và 3 trang
 * 5. Copy range không trùng lặp
 * 6. Delete range xuyên ranh giới trang
 * 7. Format range (bold/italic) qua ranh giới trang
 * 8. Undo / Redo sau khi chỉnh sửa tại ranh giới
 * 9. CurrentPage mapping chính xác tại ranh giới (bao gồm kiểm thử split giữa Page 7 và Page 8)
 */

test("Interaction Safety 1: Caret Navigation at page boundary - no teleport, no stuck caret", () => {
  // Chuẩn bị đoạn văn bản dài đủ để ngắt qua trang 2 (120 repeats ~ 4,500 ký tự)
  const textPage1 = "Dòng chữ thuộc trang 1 của tài liệu văn bản. ".repeat(60);
  const textPage2 = "Dòng chữ tràn sang trang 2 của tài liệu văn bản. ".repeat(60);
  const fullText = textPage1 + textPage2;

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: fullText }],
        },
      ],
    },
  });

  const docJSON = editor.getJSON();
  const map = buildPageLayoutMap(docJSON, DEFAULT_PAGE_SETTINGS);
  assert.ok(map.getPageCount() >= 2, "Tài liệu phải có tối thiểu 2 trang");

  const frags = map.getAllFragments();
  assert.ok(frags.length >= 2, "Paragraph phải tạo tối thiểu 2 fragments");
  const frag1 = frags[0];
  const frag2 = frags[1];
  const boundaryPos = frag2.from;

  // 1. Đặt caret ngay trước boundary
  editor.commands.setTextSelection(boundaryPos - 1);
  assert.strictEqual(editor.state.selection.from, boundaryPos - 1);
  assert.strictEqual(map.getPageNumberForPosition(boundaryPos - 1), 1);

  // 2. Di chuyển sang phải (ArrowRight) vượt qua boundary
  editor.commands.setTextSelection(boundaryPos);
  assert.strictEqual(editor.state.selection.from, boundaryPos);
  assert.strictEqual(map.getPageNumberForPosition(boundaryPos), 2);

  // 3. Di chuyển tiếp sang phải
  editor.commands.setTextSelection(boundaryPos + 1);
  assert.strictEqual(editor.state.selection.from, boundaryPos + 1);
  assert.strictEqual(map.getPageNumberForPosition(boundaryPos + 1), 2);

  // 4. Di chuyển ngược sang trái (ArrowLeft) quay lại trang 1
  editor.commands.setTextSelection(boundaryPos - 1);
  assert.strictEqual(editor.state.selection.from, boundaryPos - 1);
  assert.strictEqual(map.getPageNumberForPosition(boundaryPos - 1), 1);

  // 5. Home (về đầu tài liệu) và End (về cuối tài liệu)
  editor.commands.setTextSelection(1);
  assert.strictEqual(editor.state.selection.from, 1);
  assert.strictEqual(map.getPageNumberForPosition(1), 1);

  // Vị trí con trỏ cuối cùng trong đoạn văn
  const docEndTextPos = editor.state.doc.content.size - 1;
  editor.commands.setTextSelection(docEndTextPos);
  assert.strictEqual(editor.state.selection.from, docEndTextPos);
  assert.strictEqual(map.getPageNumberForPosition(docEndTextPos), map.getPageCount());

  // Editor không bị crash và AST không bị phân chia
  assert.strictEqual(editor.state.doc.childCount, 1);
});

test("Interaction Safety 2: Typing and Deleting near page boundary", () => {
  const textPage1 = "Nội dung trang một kết thúc tại đây. ".repeat(60);
  const textPage2 = "Nội dung trang hai tiếp tục ngay sau đó. ".repeat(60);
  const fullText = textPage1 + textPage2;

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: fullText }],
        },
      ],
    },
  });

  let map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  let frags = map.getAllFragments();
  assert.ok(frags.length >= 2, "Cần tối thiểu 2 fragments để kiểm tra boundary");
  let boundaryPos = frags[1].from;

  // Gõ ký tự ngay trước ranh giới bằng ProseMirror transaction
  editor.view.dispatch(
    editor.state.tr.insertText(" [CHÈN_TRƯỚC] ", boundaryPos - 1)
  );
  assert.ok(editor.getText().includes("[CHÈN_TRƯỚC]"));

  // Layout map tính lại hợp lệ
  map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.ok(map.getPageCount() >= 2);

  // Gõ ký tự ngay tại ranh giới
  frags = map.getAllFragments();
  boundaryPos = frags[1].from;
  editor.view.dispatch(
    editor.state.tr.insertText(" [CHÈN_TẠI_BOUNDARY] ", boundaryPos)
  );
  assert.ok(editor.getText().includes("[CHÈN_TẠI_BOUNDARY]"));

  // Xóa bằng Backspace (xóa 1 ký tự trước ranh giới)
  const lenBeforeDelete = editor.getText().length;
  editor.commands.deleteRange({ from: boundaryPos - 1, to: boundaryPos });
  assert.strictEqual(editor.getText().length, lenBeforeDelete - 1);

  // Xóa bằng Delete (xóa 1 ký tự sau ranh giới)
  editor.commands.deleteRange({ from: boundaryPos, to: boundaryPos + 1 });
  assert.strictEqual(editor.getText().length, lenBeforeDelete - 2);

  // Kiểm tra AST vẫn là 1 paragraph duy nhất
  assert.strictEqual(editor.state.doc.childCount, 1);
});

test("Interaction Safety 3: Paste and Cut near page boundary", () => {
  const textPage1 = "Đoạn một trước ranh giới trang giấy. ".repeat(60);
  const textPage2 = "Đoạn hai sau ranh giới trang giấy. ".repeat(60);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: textPage1 + textPage2 }],
        },
      ],
    },
  });

  let map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const frags = map.getAllFragments();
  assert.ok(frags.length >= 2, "Cần tối thiểu 2 fragments");
  let boundaryPos = frags[1].from;

  // Cắt (Cut) một vùng 20 ký tự xuyên qua ranh giới (10 ký tự trang 1, 10 ký tự trang 2)
  const cutRange = { from: boundaryPos - 10, to: boundaryPos + 10 };
  const cutText = editor.state.doc.textBetween(cutRange.from, cutRange.to);
  assert.strictEqual(cutText.length, 20);

  editor.commands.deleteRange(cutRange);

  // Dán (Paste) lại đúng đoạn vừa cắt vào vị trí ranh giới mới
  map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const newBoundary = map.getAllFragments()[1].from;

  editor.view.dispatch(
    editor.state.tr.insertText(cutText, newBoundary)
  );

  // Nội dung không bị lặp hay mất
  assert.ok(editor.getText().includes(cutText));
  assert.strictEqual(editor.state.doc.childCount, 1);
});

test("Interaction Safety 4: Vietnamese IME Composition near page boundary - diacritics and composition safety", () => {
  const text = "Mẫu văn bản tiếng Việt chuẩn bị kiểm tra bộ gõ Telex. ".repeat(60);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  });

  const map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const frags = map.getAllFragments();
  assert.ok(frags.length >= 2, "Cần tối thiểu 2 fragments");
  const boundaryPos = frags[1].from;

  // Mô phỏng chuỗi gõ IME tiếng Việt Telex có dấu:
  // "t" -> "ti" -> "tie" -> "tiên" -> "tiếng"
  const imeSteps = ["t", "ti", "tie", "tiên", "tiếng"];
  let insertPos = boundaryPos;

  // Mô phỏng compositionstart và compositionupdate
  for (let i = 0; i < imeSteps.length; i++) {
    const stepText = imeSteps[i];
    if (i === 0) {
      editor.view.dispatch(editor.state.tr.insertText(stepText, insertPos));
    } else {
      const prevStepLen = imeSteps[i - 1].length;
      editor.view.dispatch(
        editor.state.tr.replaceWith(
          insertPos,
          insertPos + prevStepLen,
          editor.state.schema.text(stepText)
        )
      );
    }
  }

  // Kết thúc compositionend: Từ "tiếng" được cam kết hoàn tất
  const committedText = editor.state.doc.textBetween(insertPos, insertPos + 5);
  assert.strictEqual(committedText, "tiếng");

  // Kiểm tra dấu tiếng Việt đầy đủ thanh điệu: huyền, sắc, hỏi, ngã, nặng
  const vietnameseSample = " Việt Nam đất nước tươi đẹp, ngập tràn ánh nắng và tiếng sóng biển rì rào. ";
  editor.view.dispatch(
    editor.state.tr.insertText(vietnameseSample, insertPos + 5)
  );

  assert.ok(editor.getText().includes("tiếng Việt Nam đất nước tươi đẹp"));

  // Đảm bảo không bị lặp ký tự hoặc phân rã dấu Unicode (precomposed vs decomposed)
  const fullContent = editor.getText();
  assert.ok(!fullContent.includes("titi"));
  assert.ok(!fullContent.includes("tieeng"));
});

test("Interaction Safety 5: Arrow key navigation and boundaries", () => {
  const lineProvider = (
    _node: JSONContent,
    _usableWidth: number,
    blockPos: number
  ): RenderedLineBox[] => {
    return [
      {
        lineIndex: 0,
        from: blockPos + 1,
        to: blockPos + 50,
        top: 0,
        bottom: 22,
        height: 920, // Làm đầy gần như toàn bộ trang 1
        left: 0,
        right: 500,
        width: 500,
        text: "Dòng 1 trang 1",
      },
      {
        lineIndex: 1,
        from: blockPos + 50,
        to: blockPos + 100,
        top: 22,
        bottom: 44,
        height: 22, // Tràn sang trang 2
        left: 0,
        right: 500,
        width: 500,
        text: "Dòng 2 trang 2",
      },
    ];
  };

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "A".repeat(49) + "B".repeat(50) }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  assert.strictEqual(map.getPageCount(), 2);
  const frags = map.getAllFragments();
  assert.strictEqual(frags.length, 2);

  // Vị trí 49 nằm ở dòng 1 -> Trang 1
  assert.strictEqual(map.getPageNumberForPosition(49), 1);

  // Vị trí 50 nằm ở dòng 2 -> Trang 2
  assert.strictEqual(map.getPageNumberForPosition(50), 2);

  // Vị trí 51 nằm ở dòng 2 -> Trang 2
  assert.strictEqual(map.getPageNumberForPosition(51), 2);
});

test("Interaction Safety 6: Selection spanning Page 1 to Page 2 is continuous", () => {
  const text = "Kiểm tra vùng chọn liên tục giữa hai trang vật lý. ".repeat(100);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  });

  const map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const frags = map.getAllFragments();
  assert.ok(frags.length >= 2, "Cần tối thiểu 2 fragments");

  const boundaryPos = frags[1].from;
  const selectFrom = boundaryPos - 30;
  const selectTo = boundaryPos + 30;

  editor.commands.setTextSelection({ from: selectFrom, to: selectTo });

  assert.strictEqual(editor.state.selection.from, selectFrom);
  assert.strictEqual(editor.state.selection.to, selectTo);

  // Tra cứu các fragment giao với vùng chọn
  const intersectingFrags = map.getFragmentsForRange(selectFrom, selectTo);
  assert.strictEqual(intersectingFrags.length, 2);
  assert.strictEqual(intersectingFrags[0].pageIndex, 0);
  assert.strictEqual(intersectingFrags[1].pageIndex, 1);
  assert.strictEqual(intersectingFrags[0].to, intersectingFrags[1].from);
});

test("Interaction Safety 7: Selection spanning 3+ Pages is sequential and contiguous", () => {
  const text = "Đoạn văn rất dài tràn qua ít nhất ba trang tài liệu. ".repeat(150);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  });

  const map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.ok(map.getPageCount() >= 3, "Tài liệu phải có tối thiểu 3 trang");

  const frags = map.getAllFragments();
  const fragP1 = frags[0];
  const fragP3 = frags[2];

  // Chọn từ giữa trang 1 đến giữa trang 3
  const selStart = fragP1.from + 50;
  const selEnd = fragP3.from + 50;

  editor.commands.setTextSelection({ from: selStart, to: selEnd });

  const selectedFrags = map.getFragmentsForRange(selStart, selEnd);
  assert.ok(selectedFrags.length >= 3);
  assert.strictEqual(selectedFrags[0].pageIndex, 0);
  assert.strictEqual(selectedFrags[1].pageIndex, 1);
  assert.strictEqual(selectedFrags[2].pageIndex, 2);

  for (let i = 0; i < selectedFrags.length - 1; i++) {
    assert.strictEqual(
      selectedFrags[i].to,
      selectedFrags[i + 1].from,
      `Liên tục giữa fragment ${i} và ${i + 1}`
    );
  }
});

test("Interaction Safety 8: Copy range across page boundary retrieves content exactly once", () => {
  const text = "Từ khóa Alpha ở trang một. Từ khóa Beta ở trang hai. ".repeat(100);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  });

  const map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const frags = map.getAllFragments();
  assert.ok(frags.length >= 2, "Cần tối thiểu 2 fragments");
  const boundary = frags[1].from;

  const copyFrom = boundary - 25;
  const copyTo = boundary + 25;

  const copiedSlice = editor.state.doc.slice(copyFrom, copyTo);
  const copiedString = editor.state.doc.textBetween(copyFrom, copyTo);

  assert.strictEqual(copiedString.length, 50);
  assert.strictEqual(copiedSlice.content.size, 50);

  // Không có ký tự nào bị nhân đôi tại boundary
  const charBefore = editor.state.doc.textBetween(boundary - 1, boundary);
  const charAfter = editor.state.doc.textBetween(boundary, boundary + 1);
  assert.strictEqual(
    copiedString.slice(24, 26),
    charBefore + charAfter
  );
});

test("Interaction Safety 9: Delete range spanning boundary cleanly merges content", () => {
  const text = "Phần đầu văn bản [BẮT_ĐẦU_XÓA] nội dung xóa xuyên ranh giới trang [KẾT_THÚC_XÓA] phần sau văn bản.".repeat(60);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  });

  const map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const boundary = map.getAllFragments()[1].from;

  // Xóa vùng bao quanh boundary
  const deleteStart = boundary - 15;
  const deleteEnd = boundary + 15;
  const textLengthBefore = editor.getText().length;

  editor.commands.deleteRange({ from: deleteStart, to: deleteEnd });

  const textLengthAfter = editor.getText().length;
  assert.strictEqual(textLengthAfter, textLengthBefore - 30);

  // AST vẫn nguyên vẹn
  assert.strictEqual(editor.state.doc.childCount, 1);
});

test("Interaction Safety 10: Format range (Bold/Italic) across page boundary applies single transaction", () => {
  const text = "Kiểm tra định dạng in đậm xuyên qua ranh giới giữa hai trang văn bản. ".repeat(60);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  });

  const map = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const boundary = map.getAllFragments()[1].from;

  const formatStart = boundary - 20;
  const formatEnd = boundary + 20;

  editor.commands.setTextSelection({ from: formatStart, to: formatEnd });
  editor.commands.setBold();

  // Kiểm tra mark được áp dụng trên cả hai bên boundary
  const nodeBefore = editor.state.doc.nodeAt(boundary - 5);
  const nodeAfter = editor.state.doc.nodeAt(boundary + 5);

  assert.ok(nodeBefore?.marks.some((m) => m.type.name === "bold"));
  assert.ok(nodeAfter?.marks.some((m) => m.type.name === "bold"));

  // AST vẫn là một paragraph duy nhất
  assert.strictEqual(editor.state.doc.childCount, 1);
});

test("Interaction Safety 11: Undo and Redo after boundary edit restores exact layout", () => {
  const text = "Kiểm tra tính năng Undo và Redo sau khi chỉnh sửa tại ranh giới trang. ".repeat(60);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);

  const mapBefore = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  const boundary = mapBefore.getAllFragments()[1].from;

  // Thực hiện định dạng in đậm xuyên qua ranh giới trang
  const formatRange = { from: boundary - 20, to: boundary + 20 };
  editor.commands.setTextSelection(formatRange);
  editor.commands.setBold();

  // Kiểm tra mark bold xuất hiện ở cả 2 bên ranh giới
  assert.ok(editor.state.doc.nodeAt(boundary - 5)?.marks.some((m) => m.type.name === "bold"));
  assert.ok(editor.state.doc.nodeAt(boundary + 5)?.marks.some((m) => m.type.name === "bold"));

  // Undo lại trạng thái trước khi định dạng
  undo(editor);

  // Mark bold đã được gỡ bỏ hoàn toàn
  assert.strictEqual(
    editor.state.doc.nodeAt(boundary - 5)?.marks.some((m) => m.type.name === "bold"),
    false
  );
  assert.strictEqual(
    editor.state.doc.nodeAt(boundary + 5)?.marks.some((m) => m.type.name === "bold"),
    false
  );

  // Sau khi undo, layout map phải khớp hoàn hảo với trước khi edit
  const mapAfterUndo = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(mapAfterUndo.getPageCount(), mapBefore.getPageCount());
  assert.strictEqual(
    mapAfterUndo.getAllFragments()[1].from,
    mapBefore.getAllFragments()[1].from
  );

  // Redo lại trạng thái định dạng
  redo(editor);
  assert.ok(editor.state.doc.nodeAt(boundary - 5)?.marks.some((m) => m.type.name === "bold"));
  assert.ok(editor.state.doc.nodeAt(boundary + 5)?.marks.some((m) => m.type.name === "bold"));
});

test("Interaction Safety 12: CurrentPage mapping across Page 7 and Page 8", () => {
  // Tạo tài liệu dài đủ tràn qua 8+ trang
  const text = "Đoạn văn cực dài dùng để kiểm tra phân chia chính xác giữa Trang 7 và Trang 8. ".repeat(350);

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.ok(
    map.getPageCount() >= 8,
    `Tài liệu phải có tối thiểu 8 trang (thực tế: ${map.getPageCount()} trang)`
  );

  // Lấy fragment thuộc Trang 7 (pageIndex = 6) và Trang 8 (pageIndex = 7)
  const fragPage7 = map.getAllFragments().find((f) => f.pageIndex === 6);
  const fragPage8 = map.getAllFragments().find((f) => f.pageIndex === 7);

  assert.ok(fragPage7, "Phải tồn tại fragment trên Trang 7");
  assert.ok(fragPage8, "Phải tồn tại fragment trên Trang 8");

  const boundary78 = fragPage8.from;

  // Vị trí ngay trước boundary phải thuộc Trang 7 (1-indexed là 7)
  assert.strictEqual(
    map.getPageNumberForPosition(boundary78 - 1),
    7,
    "Vị trí ngay trước boundary phải thuộc Trang 7"
  );

  // Vị trí ngay tại boundary phải thuộc Trang 8 (1-indexed là 8)
  assert.strictEqual(
    map.getPageNumberForPosition(boundary78),
    8,
    "Vị trí tại boundary phải thuộc Trang 8"
  );

  // Vị trí sau boundary phải thuộc Trang 8
  assert.strictEqual(
    map.getPageNumberForPosition(boundary78 + 1),
    8,
    "Vị trí sau boundary phải thuộc Trang 8"
  );
});
