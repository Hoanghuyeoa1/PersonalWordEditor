import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  setSearchTerm,
  setReplaceTerm,
  setCaseSensitive,
  goToNextMatch,
  goToPreviousMatch,
  replaceCurrentMatch,
  replaceAllMatches,
  clearSearch,
  getSearchState,
  getDocumentJSON,
  toggleBold,
  undo,
  redo,
} from "./editorCommands.ts";
import { findMatches } from "./searchExtensions.ts";

test("Find: finds occurrences, navigates next and previous, and wraps cleanly", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Táo, cam, chuối, táo xanh và táo đỏ." },
          ],
        },
      ],
    },
  });

  // Tìm kiếm "táo" (không phân biệt hoa/thường)
  setSearchTerm(editor, "táo");
  let state = getSearchState(editor);
  assert.ok(state);
  assert.equal(state.matches.length, 3);
  assert.equal(state.currentIndex, 0);

  // Next -> chuyển sang kết quả thứ 2 (index 1)
  goToNextMatch(editor);
  state = getSearchState(editor);
  assert.equal(state?.currentIndex, 1);

  // Next -> chuyển sang kết quả thứ 3 (index 2)
  goToNextMatch(editor);
  state = getSearchState(editor);
  assert.equal(state?.currentIndex, 2);

  // Next lần nữa -> vòng về kết quả đầu (index 0)
  goToNextMatch(editor);
  state = getSearchState(editor);
  assert.equal(state?.currentIndex, 0);

  // Previous -> vòng về kết quả cuối (index 2)
  goToPreviousMatch(editor);
  state = getSearchState(editor);
  assert.equal(state?.currentIndex, 2);

  // Clear search dọn sạch decorations
  clearSearch(editor);
  state = getSearchState(editor);
  assert.equal(state?.matches.length, 0);
  assert.equal(state?.currentIndex, -1);

  editor.destroy();
});

test("Find: Search state does NOT contaminate document content AST", () => {
  const initialContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm tìm kiếm." }],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent,
  });

  const jsonBefore = JSON.stringify(getDocumentJSON(editor));

  setSearchTerm(editor, "thử nghiệm");
  const state = getSearchState(editor);
  assert.equal(state?.matches.length, 1);
  assert.ok(state?.decorations);

  // AST của document hoàn toàn không thay đổi bởi search
  const jsonDuring = JSON.stringify(getDocumentJSON(editor));
  assert.equal(jsonBefore, jsonDuring);

  clearSearch(editor);
  const jsonAfter = JSON.stringify(getDocumentJSON(editor));
  assert.equal(jsonBefore, jsonAfter);

  editor.destroy();
});

test("Find: Cross-mark search matches text split across different marks", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Xin chào " },
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "Việt",
            },
            { type: "text", text: " Nam!" },
          ],
        },
      ],
    },
  });

  // Tìm "Việt Nam" trải dài qua cả text đậm và text thường
  setSearchTerm(editor, "Việt Nam");
  const state = getSearchState(editor);
  assert.equal(state?.matches.length, 1);
  assert.equal(state?.matches[0].text, "Việt Nam");

  editor.destroy();
});

test("Find: Unicode and Vietnamese diacritics with case sensitivity", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hà Nội là thủ đô. hà nội rất đẹp mùa thu." },
          ],
        },
      ],
    },
  });

  // Không phân biệt hoa/thường: 2 kết quả
  setSearchTerm(editor, "hà nội", false);
  let state = getSearchState(editor);
  assert.equal(state?.matches.length, 2);

  // Có phân biệt hoa/thường: "Hà Nội" chỉ có 1 kết quả
  setCaseSensitive(editor, true);
  setSearchTerm(editor, "Hà Nội", true);
  state = getSearchState(editor);
  assert.equal(state?.matches.length, 1);

  // "hà nội" chỉ có 1 kết quả
  setSearchTerm(editor, "hà nội", true);
  state = getSearchState(editor);
  assert.equal(state?.matches.length, 1);

  editor.destroy();
});

test("Replace: replaces current match and updates document", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Mèo con thích ăn cá. Mèo mẹ cũng vậy." }],
        },
      ],
    },
  });

  setSearchTerm(editor, "Mèo");
  setReplaceTerm(editor, "Chó");

  let state = getSearchState(editor);
  assert.equal(state?.matches.length, 2);
  assert.equal(state?.currentIndex, 0);

  // Thay thế kết quả đầu tiên
  replaceCurrentMatch(editor);

  const json = getDocumentJSON(editor);
  const textContent = json?.content?.[0]?.content?.[0]?.text;
  assert.ok(textContent?.startsWith("Chó con"));

  // Còn lại 1 kết quả "Mèo"
  state = getSearchState(editor);
  assert.equal(state?.matches.length, 1);

  editor.destroy();
});

test("Replace All: replaces all occurrences atomically without infinite loops", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "one two one three one" }],
        },
      ],
    },
  });

  // Tìm "one", thay bằng "one-two" (chuỗi thay thế chứa chuỗi tìm kiếm)
  setSearchTerm(editor, "one");
  setReplaceTerm(editor, "one-two");

  let state = getSearchState(editor);
  assert.equal(state?.matches.length, 3);

  // Thay thế tất cả
  replaceAllMatches(editor);

  const json = getDocumentJSON(editor);
  const text = json?.content?.[0]?.content?.[0]?.text;
  assert.equal(text, "one-two two one-two three one-two");

  editor.destroy();
});

test("Edge cases: empty query, zero matches, and dynamic document updates", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung ban đầu" }],
        },
      ],
    },
  });

  // Query rỗng
  setSearchTerm(editor, "");
  let state = getSearchState(editor);
  assert.equal(state?.matches.length, 0);
  assert.equal(state?.currentIndex, -1);

  // Query không tồn tại
  setSearchTerm(editor, "không-có-trong-bài");
  state = getSearchState(editor);
  assert.equal(state?.matches.length, 0);
  assert.equal(state?.currentIndex, -1);

  // Tìm từ khóa
  setSearchTerm(editor, "Nội dung");
  state = getSearchState(editor);
  assert.equal(state?.matches.length, 1);

  // Thêm nội dung có từ khóa vào tài liệu
  editor.commands.insertContentAt(editor.state.doc.content.size, {
    type: "paragraph",
    content: [{ type: "text", text: "Thêm một Nội dung mới" }],
  });

  // Số lượng kết quả tự động cập nhật lên 2
  state = getSearchState(editor);
  assert.equal(state?.matches.length, 2);

  editor.destroy();
});

test("Regression: Undo reverts replacement and preserves earlier marks", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Văn bản " },
            {
              type: "text",
              marks: [{ type: "bold" }],
              text: "quan trọng",
            },
            { type: "text", text: " cần giữ." },
          ],
        },
      ],
    },
  });

  setSearchTerm(editor, "quan trọng");
  setReplaceTerm(editor, "cần thiết");

  replaceCurrentMatch(editor);

  let json = getDocumentJSON(editor);
  let replacedNode = json?.content?.[0]?.content?.[1];
  assert.equal(replacedNode?.text, "cần thiết");
  assert.ok(replacedNode?.marks?.some((m) => m.type === "bold"));

  // Undo phục hồi lại
  undo(editor);

  json = getDocumentJSON(editor);
  let revertedNode = json?.content?.[0]?.content?.[1];
  assert.equal(revertedNode?.text, "quan trọng");
  assert.ok(revertedNode?.marks?.some((m) => m.type === "bold"));

  editor.destroy();
});
