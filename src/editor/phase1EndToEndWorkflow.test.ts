import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import { useConfirmDialogStore } from "../stores/confirmDialogStore.ts";
import { executeWithProtection } from "../file/fileOperations.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  setHeading,
  setTextAlign,
  setLineSpacing,
  indent,
  toggleBulletList,
  toggleOrderedList,
  setSearchTerm,
  setReplaceTerm,
  getSearchState,
  replaceAllMatches,
  ensureEditorPlugins,
} from "./editorCommands.ts";
import { findMatches } from "./searchExtensions.ts";
import { extractDocumentStats } from "../document/documentModel.ts";
import type { JSONContent } from "@tiptap/core";

test("Phase 1 End-to-End Workflow: New -> Edit -> Format -> Headings -> Lists -> Find/Replace -> Save .mwd -> Open -> Dirty -> Protection", async () => {
  // -------------------------------------------------------------------------
  // Bước 1: Khởi động app / Tạo mới tài liệu (New)
  // -------------------------------------------------------------------------
  const store = useDocumentStore.getState();
  store.resetDocument();

  assert.equal(useDocumentStore.getState().isDirty, false, "Khởi tạo tài liệu ban đầu phải clean (isDirty = false)");
  assert.equal(useDocumentStore.getState().filePath, null, "Chưa có đường dẫn tệp");
  assert.equal(useDocumentStore.getState().documentTitle, "Tài liệu chưa đặt tên");

  // -------------------------------------------------------------------------
  // Bước 2: Khởi tạo editor engine và nhập nội dung phong phú (Paragraphs, Formatting, Headings, Lists)
  // -------------------------------------------------------------------------
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center", lineSpacing: "1.5" },
          content: [{ type: "text", text: "Báo cáo tổng kết dự án Phase 1" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "1. Thông tin chung" }],
        },
        {
          type: "paragraph",
          attrs: { lineSpacing: "1.15", indent: 1 },
          content: [
            { type: "text", text: "Văn bản mẫu chứa nội dung " },
            { type: "text", marks: [{ type: "bold" }], text: "quan trọng" },
            { type: "text", text: " và thông tin " },
            { type: "text", marks: [{ type: "italic" }], text: "ghi chú đặc biệt" },
            { type: "text", text: ", cùng từ " },
            {
              type: "text",
              marks: [
                { type: "underline" },
                { type: "textStyle", attrs: { color: "#dc2626", fontFamily: "Arial", fontSize: "14pt" } },
                { type: "highlight", attrs: { color: "#fef08a" } },
              ],
              text: "khẩn cấp",
            },
            { type: "text", text: "." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục tiêu A: Hoàn thiện Phase 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Mục tiêu B: Ổn định trải nghiệm" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bước 1: Kiểm thử hồi quy" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bước 2: Đóng gói desktop build" }],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.ok(editor, "Editor phải được khởi tạo thành công");
  store.updateContent(editor.getJSON());
  assert.equal(useDocumentStore.getState().isDirty, true, "Nội dung thay đổi so với tài liệu trống ban đầu -> isDirty = true");

  // -------------------------------------------------------------------------
  // Bước 3: Kiểm tra định lượng nội dung (Words, Characters, Paragraphs)
  // -------------------------------------------------------------------------
  const stats = extractDocumentStats(editor.getJSON());
  assert.ok(stats.words > 10, `Số từ phải > 10 (thực tế: ${stats.words})`);
  assert.ok(stats.characters > 50, `Số ký tự phải > 50 (thực tế: ${stats.characters})`);
  assert.ok(stats.paragraphs >= 4, `Số khối đoạn văn/tiêu đề phải >= 4 (thực tế: ${stats.paragraphs})`);

  // -------------------------------------------------------------------------
  // Bước 4: Kiểm tra Find & Replace trên nội dung thực tế
  // -------------------------------------------------------------------------
  ensureEditorPlugins(editor);
  setSearchTerm(editor, "quan trọng");
  setReplaceTerm(editor, "đặc biệt thiết yếu");

  const searchState = getSearchState(editor);
  assert.equal(searchState?.matches.length, 1, "Phải tìm thấy 1 kết quả cho từ 'quan trọng'");

  // Thực hiện Replace All "quan trọng" -> "đặc biệt thiết yếu"
  replaceAllMatches(editor);
  store.updateContent(editor.getJSON());

  const matchesAfter = findMatches(editor.state.doc, "quan trọng");
  assert.equal(matchesAfter.length, 0, "Từ 'quan trọng' đã được thay thế sạch sẽ");
  const matchesNew = findMatches(editor.state.doc, "đặc biệt thiết yếu");
  assert.equal(matchesNew.length, 1, "Từ thay thế 'đặc biệt thiết yếu' phải có mặt");

  // -------------------------------------------------------------------------
  // Bước 5: Lưu tài liệu thành gói file *.mwd (mô phỏng Save As)
  // -------------------------------------------------------------------------
  const testFilePath = "C:/Documents/BaoCaoTongKet.mwd";
  store.updateTitle("BaoCaoTongKet");
  const currentDoc = useDocumentStore.getState().document;
  const serializedMwd = serializeDocumentToMwd(currentDoc);
  assert.ok(serializedMwd.length > 100, "Chuỗi .mwd phải hợp lệ");

  store.markSaved(testFilePath);

  assert.equal(useDocumentStore.getState().isDirty, false, "Sau khi lưu thành công, isDirty phải là false");
  assert.equal(useDocumentStore.getState().filePath, testFilePath);
  assert.equal(useDocumentStore.getState().documentTitle, "BaoCaoTongKet");

  // -------------------------------------------------------------------------
  // Bước 6: Giả lập đóng ứng dụng và khởi động lại phiên mới
  // -------------------------------------------------------------------------
  editor.destroy();
  store.resetDocument();
  assert.equal(useDocumentStore.getState().filePath, null);
  assert.equal(useDocumentStore.getState().isDirty, false);

  // -------------------------------------------------------------------------
  // Bước 7: Mở lại file *.mwd và kiểm tra bảo toàn nội dung & formatting
  // -------------------------------------------------------------------------
  const parseResult = deserializeMwdToDocument(serializedMwd);
  assert.equal(parseResult.success, true, "Giải tuần tự hóa .mwd phải thành công");
  if (!parseResult.success) return;

  const restoredDoc = parseResult.document;
  assert.equal(parseResult.formatVersion, 1);
  assert.equal(restoredDoc.metadata.title, "BaoCaoTongKet");

  // Khởi tạo editor mới với nội dung đã phục hồi
  const reloadedEditor = new Editor({
    extensions: getEditorExtensions(),
    content: restoredDoc.content,
  });
  store.setDocument(restoredDoc, testFilePath);

  assert.equal(useDocumentStore.getState().isDirty, false, "Tài liệu vừa mở từ đĩa phải clean (isDirty = false)");
  assert.equal(useDocumentStore.getState().filePath, testFilePath);

  // Xác nhận các định dạng được bảo toàn 100%:
  const reloadedJson = reloadedEditor.getJSON();
  assert.equal(reloadedJson.type, "doc");
  const nodes = reloadedJson.content || [];
  assert.equal(nodes[0].type, "heading");
  assert.equal(nodes[0].attrs?.level, 1);
  assert.equal(nodes[0].attrs?.textAlign, "center");
  assert.equal(nodes[0].attrs?.lineSpacing, "1.5");

  assert.equal(nodes[1].type, "heading");
  assert.equal(nodes[1].attrs?.level, 2);

  assert.equal(nodes[2].type, "paragraph");
  assert.equal(nodes[2].attrs?.lineSpacing, "1.15");
  assert.equal(nodes[2].attrs?.indent, 1);

  // Kiểm tra text nodes và marks bên trong paragraph
  const pInline = nodes[2].content || [];
  const boldTextNode = pInline.find((n) => n.text === "đặc biệt thiết yếu");
  assert.ok(boldTextNode, "Nội dung sau khi replace phải được bảo toàn trong file");
  assert.ok(boldTextNode?.marks?.some((m) => m.type === "bold"), "Định dạng in đậm phải được bảo toàn");

  const styledNode = pInline.find((n) => n.text === "khẩn cấp");
  assert.ok(styledNode, "Ký tự định dạng phức hợp phải được bảo toàn");
  assert.ok(styledNode?.marks?.some((m) => m.type === "underline"), "Underline mark");
  assert.ok(styledNode?.marks?.some((m) => m.type === "highlight" && m.attrs?.color === "#fef08a"), "Highlight color");
  assert.ok(styledNode?.marks?.some((m) => m.type === "textStyle" && m.attrs?.color === "#dc2626"), "Text color");

  // Kiểm tra Lists
  assert.equal(nodes[3].type, "bulletList");
  assert.equal(nodes[4].type, "orderedList");

  // -------------------------------------------------------------------------
  // Bước 8: Sửa đổi nội dung -> Kích hoạt Dirty State
  // -------------------------------------------------------------------------
  reloadedEditor.commands.insertContent({
    type: "paragraph",
    content: [{ type: "text", text: "Dòng mới được bổ sung sau khi mở tệp." }],
  });
  store.updateContent(reloadedEditor.getJSON());
  assert.equal(useDocumentStore.getState().isDirty, true, "Nội dung vừa sửa phải kích hoạt isDirty = true");

  // -------------------------------------------------------------------------
  // Bước 9: Kiểm tra Close Protection với 3 lựa chọn (Cancel, Don't Save, Save)
  // -------------------------------------------------------------------------
  let actionExecuted = false;
  const mockProtectedAction = async () => {
    actionExecuted = true;
  };

  // 9a. Người dùng chọn Cancel -> Action bị hủy, không thực hiện, tài liệu giữ nguyên
  actionExecuted = false;
  const cancelPromise = executeWithProtection("close", mockProtectedAction, reloadedEditor);
  assert.equal(useConfirmDialogStore.getState().isOpen, true);
  useConfirmDialogStore.getState().confirmChoice("cancel");
  const cancelRes = await cancelPromise;
  assert.equal(cancelRes.cancelled, true);
  assert.equal(actionExecuted, false, "Action không được thực hiện khi chọn Cancel");
  assert.equal(useDocumentStore.getState().isDirty, true, "Tài liệu vẫn giữ nguyên trạng thái bẩn");

  // 9b. Người dùng chọn Don't Save -> Action được thực hiện bỏ qua lưu
  actionExecuted = false;
  const dontSavePromise = executeWithProtection("close", mockProtectedAction, reloadedEditor);
  assert.equal(useConfirmDialogStore.getState().isOpen, true);
  useConfirmDialogStore.getState().confirmChoice("dontsave");
  const dontSaveRes = await dontSavePromise;
  assert.equal(dontSaveRes.success, true);
  assert.equal(actionExecuted, true, "Action được thực hiện thành công khi chọn Don't Save");

  reloadedEditor.destroy();
});
