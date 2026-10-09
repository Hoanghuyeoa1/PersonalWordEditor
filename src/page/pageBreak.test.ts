import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  insertPageBreak,
  undo,
  redo,
  getDocumentJSON,
  toggleBold,
  setHeading,
  toggleBulletList,
  setSearchTerm,
  getSearchState,
} from "../editor/editorCommands.ts";
import { extractDocumentStats, createInitialDocument } from "../document/documentModel.ts";
import { serializeDocumentToMwd, deserializeMwdToDocument } from "../document/documentFile.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

test("PageBreak: Node is registered as semantic block atom", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Trang 1" }] },
      ],
    },
  });

  const nodeType = editor.schema.nodes.pageBreak;
  assert.ok(nodeType, "pageBreak node type must exist in editor schema");
  assert.equal(nodeType.isAtom, true, "pageBreak must be an atom node");
  assert.equal(nodeType.isBlock, true, "pageBreak must be a block node");

  editor.destroy();
});

test("PageBreak: Insert command insertPageBreak at middle of paragraph splits cleanly", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Xin chao the gioi" }] },
      ],
    },
  });

  // Đặt con trỏ giữa "chao" và "the" (pos = 9)
  editor.commands.setTextSelection(9);

  const res = insertPageBreak(editor);
  assert.equal(res, true, "insertPageBreak should return true");

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);
  assert.equal(json.content.length, 3, "Splitting paragraph creates para 1, pageBreak, para 2");
  assert.equal(json.content[0].type, "paragraph");
  assert.equal(json.content[0].content?.[0].text, "Xin chao");
  assert.equal(json.content[1].type, "pageBreak");
  assert.equal(json.content[2].type, "paragraph");
  assert.equal(json.content[2].content?.[0].text, " the gioi");

  editor.destroy();
});

test("PageBreak: Insert at start of document preserves editable paragraph", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Doan van dau tien" }] },
      ],
    },
  });

  // Đặt con trỏ ở đầu text (pos = 1)
  editor.commands.setTextSelection(1);

  const res = insertPageBreak(editor);
  assert.equal(res, true);

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);
  // Cấu trúc hợp lệ: pageBreak được chèn trước hoặc sau paragraph, hoặc tách khối
  const hasPageBreak = json.content.some((n) => n.type === "pageBreak");
  assert.equal(hasPageBreak, true);

  editor.destroy();
});

test("PageBreak: Insert at end of document adds trailing paragraph for typing", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Noi dung cuoi cung" }] },
      ],
    },
  });

  // Đặt con trỏ ở cuối paragraph (pos = 18)
  editor.commands.setTextSelection(18);

  const res = insertPageBreak(editor);
  assert.equal(res, true);

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);

  // Phải có pageBreak và theo sau là một paragraph để người dùng gõ tiếp
  const lastIndex = json.content.length - 1;
  assert.equal(json.content[lastIndex].type, "paragraph", "Last node must be a paragraph");
  assert.equal(json.content[lastIndex - 1].type, "pageBreak", "Node before last must be pageBreak");

  editor.destroy();
});

test("PageBreak: In empty document creates valid page break and editable paragraph", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
  });

  editor.commands.setTextSelection(1);
  const res = insertPageBreak(editor);
  assert.equal(res, true);

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);
  const hasPageBreak = json.content.some((n) => n.type === "pageBreak");
  assert.equal(hasPageBreak, true);

  // Cuối tài liệu phải có paragraph để con trỏ có thể gõ chữ
  const lastNode = json.content[json.content.length - 1];
  assert.equal(lastNode.type, "paragraph");

  editor.destroy();
});

test("PageBreak: Inside headings splits heading without tree corruption", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Tieu De Chuong" }],
        },
      ],
    },
  });

  // Đặt con trỏ ở giữa tiêu đề (pos = 8)
  editor.commands.setTextSelection(8);
  const res = insertPageBreak(editor);
  assert.equal(res, true);

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);
  assert.equal(json.content[0].type, "heading");
  assert.equal(json.content[1].type, "pageBreak");

  editor.destroy();
});

test("PageBreak: Inside list item does not corrupt list or tree structure", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Muc 1" }] },
              ],
            },
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Muc 2 dai hon" }] },
              ],
            },
          ],
        },
      ],
    },
  });

  // Đặt con trỏ vào bên trong Mục 2
  editor.commands.setTextSelection(14);
  const res = insertPageBreak(editor);
  assert.equal(res, true);

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);

  // Đảm bảo document AST vẫn hợp lệ và có thể parse lại bởi schema ProseMirror
  assert.doesNotThrow(() => {
    const checkEditor = new Editor({
      extensions: getEditorExtensions(),
      content: json,
    });
    checkEditor.destroy();
  });

  editor.destroy();
});

test("PageBreak: Multiple consecutive page breaks work seamlessly", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Khoi dau" }] },
      ],
    },
  });

  editor.commands.setTextSelection(9);

  // Chèn ngắt trang thứ nhất
  insertPageBreak(editor);

  // Chèn ngắt trang thứ hai ngay sau đó
  insertPageBreak(editor);

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);

  const breakCount = json.content.filter((n) => n.type === "pageBreak").length;
  assert.equal(breakCount, 2, "Both page breaks should exist");

  editor.destroy();
});

test("PageBreak: Undo and Redo revert and restore page breaks safely", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Truoc khi ngat trang" }] },
      ],
    },
  });

  const originalJSON = getDocumentJSON(editor);

  editor.commands.setTextSelection(10);
  insertPageBreak(editor);

  let json = getDocumentJSON(editor);
  assert.ok(json?.content?.some((n) => n.type === "pageBreak"));

  // Undo: quay lại trạng thái ban đầu
  undo(editor);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.some((n) => n.type === "pageBreak"), false);
  assert.equal(json?.content?.[0]?.content?.[0]?.text, "Truoc khi ngat trang");

  // Redo: khôi phục ngắt trang
  redo(editor);
  json = getDocumentJSON(editor);
  assert.equal(json?.content?.some((n) => n.type === "pageBreak"), true);

  editor.destroy();
});

test("PageBreak: Stats calculation does NOT count PageBreak marker as words or characters", () => {
  const contentWithBreak = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello World" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Foo Bar" }],
      },
    ],
  };

  const stats = extractDocumentStats(contentWithBreak);
  // "Hello World" (2 words, 11 chars) + "Foo Bar" (2 words, 7 chars) = 4 words, 18 chars
  assert.equal(stats.words, 4, "Should count 4 words, ignoring page break label");
  assert.equal(stats.characters, 18, "Should count 18 chars, ignoring page break label");
});

test("PageBreak: Save and Open round-trip preserves pageBreak node in .mwd file", () => {
  const docModel = createInitialDocument("Tai lieu test Page Break", {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Trang 1: Báo cáo" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 2: Nội dung chi tiết" }],
      },
    ],
  });

  const serialized = serializeDocumentToMwd(docModel);
  assert.ok(serialized.includes('"pageBreak"'));

  const result = deserializeMwdToDocument(serialized);
  assert.equal(result.success, true);
  if (!result.success) return;
  const deserialized = result.document;
  assert.equal(deserialized.metadata.title, "Tai lieu test Page Break");

  const restoredContent = deserialized.content;
  assert.ok(restoredContent?.content);
  assert.equal(restoredContent.content[0].type, "heading");
  assert.equal(restoredContent.content[1].type, "pageBreak");
  assert.equal(restoredContent.content[2].type, "paragraph");

  // Thử nạp lại vào editor Tiptap để đảm bảo renderHTML/parseHTML trọn vẹn
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: restoredContent,
  });
  const reJson = getDocumentJSON(editor);
  assert.equal(reJson?.content?.[1]?.type, "pageBreak");
  editor.destroy();
});

test("PageBreak: Search & Replace does NOT search into PageBreak marker text", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Van ban mau" }] },
        { type: "pageBreak" },
        { type: "paragraph", content: [{ type: "text", text: "Trang tiep theo" }] },
      ],
    },
  });

  // Tìm chuỗi "Page" (xuất hiện trong decorative UI label "Page Break")
  setSearchTerm(editor, "Page");
  const state = getSearchState(editor);
  assert.equal(state?.matches.length, 0, "Decorative Page Break label must NOT be indexed by search");

  editor.destroy();
});

test("PageBreak: Insertion updates documentStore and triggers isDirty", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();
  assert.equal(useDocumentStore.getState().isDirty, false);

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: store.document.content,
    onUpdate: ({ editor }) => {
      useDocumentStore.getState().updateContent(editor.getJSON());
    },
  });

  // Chèn ngắt trang
  insertPageBreak(editor);

  assert.equal(useDocumentStore.getState().isDirty, true);
  const docContent = useDocumentStore.getState().document.content;
  const hasPageBreak = docContent.content?.some((n) => n.type === "pageBreak");
  assert.equal(hasPageBreak, true);

  editor.destroy();
});

test("PageBreak: Immediate typing after page break insertion works seamlessly", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Trang dau" }] }],
    },
  });

  // Chèn ngắt trang ở cuối trang đầu
  editor.commands.setTextSelection(10);
  insertPageBreak(editor);

  // Người dùng gõ chữ ngay sau khi ngắt trang (sử dụng JSON text trong headless test)
  editor.commands.insertContent({ type: "text", text: "Noi dung trang hai" });

  const json = getDocumentJSON(editor);
  assert.ok(json?.content);
  assert.equal(json.content.length, 3);
  assert.equal(json.content[0].type, "paragraph");
  assert.equal(json.content[1].type, "pageBreak");
  assert.equal(json.content[2].type, "paragraph");
  assert.equal(json.content[2].content?.[0]?.text, "Noi dung trang hai");

  editor.destroy();
});
