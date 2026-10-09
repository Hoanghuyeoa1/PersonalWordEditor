import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { NoteReferenceExtension } from "./extensions/noteExtension.ts";
import { HeadingAnchorExtension } from "./extensions/headingAnchorExtension.ts";
import { TableOfContentsExtension } from "./extensions/tableOfContentsExtension.ts";
import { CommentExtension } from "../review/comments/commentExtension.ts";
import { TrackChangeExtension } from "../review/trackChanges/trackChangeExtension.ts";
import { NoteService } from "./services/noteService.ts";
import { toRomanNumeral, formatNoteLabel } from "./types/noteTypes.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";
import { exportDocumentModelToDocx } from "../docx/export/docxExporter.ts";
import { importDocxToDocumentModel } from "../docx/import/docxImporter.ts";
import { readDocxPackage } from "../docx/parser/docxPackageReader.ts";

/**
 * Helper khởi tạo headless Tiptap Editor có hỗ trợ NoteReferenceExtension và UndoRedo
 */
function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm chú thích ngữ nghĩa." }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ TOÀN DIỆN: PHASE 6.4 — FOOTNOTES & ENDNOTES ENGINE
   ========================================================================== */

test("Phase 6.4 Footnotes & Endnotes: 1. Chèn Footnote và Endnote marker ngữ nghĩa tại caret", () => {
  const editor = createTestEditor();

  // Đặt con trỏ tại vị trí 10
  editor.commands.setTextSelection(10);

  // Chèn Footnote
  const fnRes = NoteService.insertNote(editor, "footnote", "Nội dung chú thích chân trang số 1");
  assert.equal(fnRes.success, true);
  assert.equal(fnRes.itemType, "insertFootnote");
  assert.ok(fnRes.details?.noteId);

  // Chèn Endnote
  editor.commands.setTextSelection(20);
  const enRes = NoteService.insertNote(editor, "endnote", "Nội dung chú thích cuối bài số 1");
  assert.equal(enRes.success, true);
  assert.equal(enRes.itemType, "insertEndnote");
  assert.ok(enRes.details?.noteId);

  // Kiểm tra AST
  const notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes.length, 1);
  assert.equal(notes.endnotes.length, 1);
  assert.equal(notes.footnotes[0].content, "Nội dung chú thích chân trang số 1");
  assert.equal(notes.endnotes[0].content, "Nội dung chú thích cuối bài số 1");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 2. Nhiều chú thích và phân loại rõ ràng Footnote / Endnote", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn 1 có Footnote A" },
          {
            type: "noteReference",
            attrs: { noteId: "fn_1", noteType: "footnote", content: "Footnote A" },
          },
          { type: "text", text: " và Endnote Alpha" },
          {
            type: "noteReference",
            attrs: { noteId: "en_1", noteType: "endnote", content: "Endnote Alpha" },
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn 2 có Footnote B" },
          {
            type: "noteReference",
            attrs: { noteId: "fn_2", noteType: "footnote", content: "Footnote B" },
          },
          { type: "text", text: " và Endnote Beta" },
          {
            type: "noteReference",
            attrs: { noteId: "en_2", noteType: "endnote", content: "Endnote Beta" },
          },
        ],
      },
    ],
  });

  const notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes.length, 2);
  assert.equal(notes.endnotes.length, 2);
  assert.equal(notes.all.length, 4);

  assert.equal(notes.footnotes[0].id, "fn_1");
  assert.equal(notes.footnotes[1].id, "fn_2");
  assert.equal(notes.endnotes[0].id, "en_1");
  assert.equal(notes.endnotes[1].id, "en_2");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 3. Đánh số tự động liên tục (1, 2, 3... và i, ii, iii...)", () => {
  // Test formatters
  assert.equal(toRomanNumeral(1), "i");
  assert.equal(toRomanNumeral(2), "ii");
  assert.equal(toRomanNumeral(3), "iii");
  assert.equal(toRomanNumeral(4), "iv");
  assert.equal(toRomanNumeral(5), "v");

  assert.equal(formatNoteLabel("footnote", 1), "1");
  assert.equal(formatNoteLabel("footnote", 42), "42");
  assert.equal(formatNoteLabel("endnote", 1), "i");
  assert.equal(formatNoteLabel("endnote", 2), "ii");
  assert.equal(formatNoteLabel("endnote", 3), "iii");
  assert.equal(formatNoteLabel("footnote", 1, "*"), "*");

  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Mục 1" },
          { type: "noteReference", attrs: { noteId: "f1", noteType: "footnote", content: "c1" } },
          { type: "text", text: "Mục 2" },
          { type: "noteReference", attrs: { noteId: "f2", noteType: "footnote", content: "c2" } },
          { type: "text", text: "Mục 3" },
          { type: "noteReference", attrs: { noteId: "f3", noteType: "footnote", content: "c3" } },
          { type: "text", text: "Cuối 1" },
          { type: "noteReference", attrs: { noteId: "e1", noteType: "endnote", content: "e1" } },
          { type: "text", text: "Cuối 2" },
          { type: "noteReference", attrs: { noteId: "e2", noteType: "endnote", content: "e2" } },
        ],
      },
    ],
  });

  const notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes[0].label, "1");
  assert.equal(notes.footnotes[1].label, "2");
  assert.equal(notes.footnotes[2].label, "3");

  assert.equal(notes.endnotes[0].label, "i");
  assert.equal(notes.endnotes[1].label, "ii");

  // Kiểm tra getNoteNumber và getNoteLabel
  assert.equal(NoteService.getNoteNumber(editor.state.doc, "f2", "footnote"), 2);
  assert.equal(NoteService.getNoteLabel(editor.state.doc, "f2", "footnote"), "2");
  assert.equal(NoteService.getNoteLabel(editor.state.doc, "e2", "endnote"), "ii");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 4. Xóa marker ở giữa -> Tự động renumbering các marker sau", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "T1" },
          { type: "noteReference", attrs: { noteId: "fn_1", noteType: "footnote", content: "N1" } },
          { type: "text", text: "T2" },
          { type: "noteReference", attrs: { noteId: "fn_2", noteType: "footnote", content: "N2" } },
          { type: "text", text: "T3" },
          { type: "noteReference", attrs: { noteId: "fn_3", noteType: "footnote", content: "N3" } },
        ],
      },
    ],
  });

  // Ban đầu có 3 notes
  let notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes.length, 3);
  assert.equal(notes.footnotes[2].number, 3);
  assert.equal(notes.footnotes[2].label, "3");

  // Xóa note ở giữa (fn_2)
  const delRes = NoteService.deleteNote(editor, "fn_2");
  assert.equal(delRes.success, true);

  // Sau khi xóa, chỉ còn 2 notes, note 3 cũ (fn_3) tự động trở thành số 2
  notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes.length, 2);
  assert.equal(notes.footnotes[0].id, "fn_1");
  assert.equal(notes.footnotes[0].number, 1);
  assert.equal(notes.footnotes[0].label, "1");

  assert.equal(notes.footnotes[1].id, "fn_3");
  assert.equal(notes.footnotes[1].number, 2);
  assert.equal(notes.footnotes[1].label, "2");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 5. Chỉnh sửa nội dung note (Edit content) qua Transaction", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Nội dung trước" },
          {
            type: "noteReference",
            attrs: { noteId: "fn_edit", noteType: "footnote", content: "Nội dung ban đầu" },
          },
        ],
      },
    ],
  });

  // Cập nhật nội dung
  const updateRes = NoteService.updateNoteContent(
    editor,
    "fn_edit",
    "Nội dung đã được biên tập và giải thích chi tiết hơn."
  );
  assert.equal(updateRes.success, true);

  const notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes.length, 1);
  assert.equal(notes.footnotes[0].content, "Nội dung đã được biên tập và giải thích chi tiết hơn.");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 6. Điều hướng hai chiều (Ref -> Note và Note -> Ref)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn mở đầu dài..." },
          {
            type: "noteReference",
            attrs: { noteId: "fn_nav", noteType: "footnote", content: "Nội dung ghi chú" },
          },
          { type: "text", text: "Đoạn kết thúc..." },
        ],
      },
    ],
  });

  // 1. Ref -> Note
  const navToNoteRes = NoteService.navigateToNote(editor, "fn_nav", "footnote");
  assert.equal(navToNoteRes.success, true);
  assert.equal(navToNoteRes.details?.noteId, "fn_nav");

  // 2. Note -> Ref
  const navToRefRes = NoteService.navigateToNoteReference(editor, "fn_nav");
  assert.equal(navToRefRes.success, true);
  assert.ok(typeof navToRefRes.details?.pos === "number");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 7. Điều hướng Next Footnote và Previous Footnote", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Khởi đầu" },
          { type: "noteReference", attrs: { noteId: "fn_1", noteType: "footnote", content: "c1" } },
          { type: "text", text: "Giữa bài" },
          { type: "noteReference", attrs: { noteId: "fn_2", noteType: "footnote", content: "c2" } },
          { type: "text", text: "Cuối bài" },
          { type: "noteReference", attrs: { noteId: "fn_3", noteType: "footnote", content: "c3" } },
        ],
      },
    ],
  });

  // Đặt con trỏ ở đầu (pos 1)
  editor.commands.setTextSelection(1);

  // Next Footnote -> nhảy tới fn_1
  const next1 = NoteService.navigateToNextNote(editor, "footnote");
  assert.equal(next1.success, true);
  assert.equal(next1.details?.noteId, "fn_1");

  // Di chuyển con trỏ sau fn_1
  editor.commands.setTextSelection(15);
  const next2 = NoteService.navigateToNextNote(editor, "footnote");
  assert.equal(next2.success, true);
  assert.equal(next2.details?.noteId, "fn_2");

  // Previous Footnote từ cuối bài
  editor.commands.setTextSelection(28);
  const prev1 = NoteService.navigateToPreviousNote(editor, "footnote");
  assert.equal(prev1.success, true);
  assert.equal(prev1.details?.noteId, "fn_3");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 8. Hoàn tác / Làm lại (Undo / Redo) cho thao tác chú thích", () => {
  const editor = createTestEditor();

  editor.commands.setTextSelection(1);

  // 1. Chèn Footnote
  NoteService.insertNote(editor, "footnote", "Ghi chú sẽ bị hoàn tác");
  assert.equal(NoteService.extractNotes(editor.state.doc).footnotes.length, 1);

  // 2. Undo -> Marker và note biến mất
  editor.commands.undo();
  assert.equal(NoteService.extractNotes(editor.state.doc).footnotes.length, 0);

  // 3. Redo -> Marker và note được khôi phục nguyên vẹn nội dung
  editor.commands.redo();
  const restoredNotes = NoteService.extractNotes(editor.state.doc);
  assert.equal(restoredNotes.footnotes.length, 1);
  assert.equal(restoredNotes.footnotes[0].content, "Ghi chú sẽ bị hoàn tác");

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 9. Dọn dẹp dữ liệu mồ côi (Zero Orphan Leakage)", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Văn bản mẫu" },
          {
            type: "noteReference",
            attrs: { noteId: "fn_orphan_check", noteType: "footnote", content: "Nội dung tạm" },
          },
        ],
      },
    ],
  });

  // Ban đầu có note
  assert.equal(NoteService.extractNotes(editor.state.doc).footnotes.length, 1);

  // Xóa note thông qua service
  NoteService.deleteNote(editor, "fn_orphan_check");

  // Danh mục trích xuất trực tiếp từ AST không còn chứa bất kỳ dấu vết nào của note này
  const afterNotes = NoteService.extractNotes(editor.state.doc);
  assert.equal(afterNotes.footnotes.length, 0);
  assert.equal(afterNotes.all.length, 0);

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 10. Xử lý an toàn với ID bất thường hoặc tài liệu không có note", () => {
  const editor = createTestEditor();

  // Document rỗng note
  const emptyNotes = NoteService.extractNotes(editor.state.doc);
  assert.equal(emptyNotes.footnotes.length, 0);
  assert.equal(emptyNotes.endnotes.length, 0);
  assert.equal(emptyNotes.all.length, 0);

  // Thao tác với ID không tồn tại
  const badUpdate = NoteService.updateNoteContent(editor, "non_existent_id", "test");
  assert.equal(badUpdate.success, false);

  const badDelete = NoteService.deleteNote(editor, "non_existent_id");
  assert.equal(badDelete.success, false);

  const badNavRef = NoteService.navigateToNoteReference(editor, "non_existent_id");
  assert.equal(badNavRef.success, false);

  editor.destroy();
});

test("Phase 6.4 Footnotes & Endnotes: 11. Lưu và nạp tài liệu .mwd bảo toàn cấu trúc chú thích", () => {
  const initialDoc = createInitialDocument("Tài liệu thử nghiệm Footnotes");
  initialDoc.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn có chú thích" },
          {
            type: "noteReference",
            attrs: {
              noteId: "ref_fn_persist_1",
              noteType: "footnote",
              content: "Chú thích chân trang được bảo toàn qua .mwd",
            },
          },
          { type: "text", text: " và chú thích cuối bài" },
          {
            type: "noteReference",
            attrs: {
              noteId: "ref_en_persist_1",
              noteType: "endnote",
              content: "Chú thích cuối bài được bảo toàn qua .mwd",
            },
          },
        ],
      },
    ],
  };

  // Tuần tự hóa sang chuỗi .mwd
  const jsonStr = serializeDocumentToMwd(initialDoc);
  assert.ok(jsonStr.includes("noteReference"));
  assert.ok(jsonStr.includes("ref_fn_persist_1"));
  assert.ok(jsonStr.includes("ref_en_persist_1"));

  // Giải tuần tự hóa trở lại
  const deser = deserializeMwdToDocument(jsonStr);
  assert.equal(deser.success, true);
  if (deser.success) {
    const loadedNotes = NoteService.extractNotes(deser.document.content);
    assert.equal(loadedNotes.footnotes.length, 1);
    assert.equal(loadedNotes.endnotes.length, 1);
    assert.equal(loadedNotes.footnotes[0].id, "ref_fn_persist_1");
    assert.equal(loadedNotes.footnotes[0].content, "Chú thích chân trang được bảo toàn qua .mwd");
    assert.equal(loadedNotes.endnotes[0].id, "ref_en_persist_1");
    assert.equal(loadedNotes.endnotes[0].content, "Chú thích cuối bài được bảo toàn qua .mwd");
  }
});

test("Phase 6.4 Footnotes & Endnotes: 12. DOCX Round-trip OOXML (word/footnotes.xml & word/endnotes.xml)", async () => {
  const doc = createInitialDocument("Test DOCX Footnotes");
  doc.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Văn bản thử nghiệm xuất Footnote" },
          {
            type: "noteReference",
            attrs: {
              noteId: "fn_docx_1",
              noteType: "footnote",
              content: "Nội dung chú thích chân trang xuất ra Word OOXML",
            },
          },
          { type: "text", text: " và Endnote" },
          {
            type: "noteReference",
            attrs: {
              noteId: "en_docx_1",
              noteType: "endnote",
              content: "Nội dung chú thích cuối bài xuất ra Word OOXML",
            },
          },
        ],
      },
    ],
  };

  // 1. Xuất sang DOCX (Uint8Array)
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes.length > 0);

  // 2. Kiểm tra gói ZIP vật lý có chứa footnotes.xml và endnotes.xml chuẩn
  const pkgParts = await readDocxPackage(docxBytes);
  assert.ok(pkgParts.footnotesXml, "Gói ZIP phải chứa word/footnotes.xml");
  assert.ok(pkgParts.endnotesXml, "Gói ZIP phải chứa word/endnotes.xml");
  assert.ok(pkgParts.documentXml?.includes("w:footnoteReference"));
  assert.ok(pkgParts.documentXml?.includes("w:endnoteReference"));
  assert.ok(pkgParts.footnotesXml?.includes("Nội dung chú thích chân trang xuất ra Word OOXML"));
  assert.ok(pkgParts.endnotesXml?.includes("Nội dung chú thích cuối bài xuất ra Word OOXML"));

  // 3. Nạp lại DOCX (Import round-trip)
  const imported = await importDocxToDocumentModel(docxBytes, "TestFootnotes.docx");
  assert.equal(imported.success, true);
  if (imported.success) {
    const importedNotes = NoteService.extractNotes(imported.document.content);
    assert.equal(importedNotes.footnotes.length, 1);
    assert.equal(importedNotes.endnotes.length, 1);
    assert.equal(importedNotes.footnotes[0].content, "Nội dung chú thích chân trang xuất ra Word OOXML");
    assert.equal(importedNotes.endnotes[0].content, "Nội dung chú thích cuối bài xuất ra Word OOXML");
  }
});

test("Phase 6.4 Footnotes & Endnotes: 13. Cùng tồn tại hòa bình (Coexistence) với Comments, Track Changes & TOC", () => {
  const docContent = {
    type: "doc",
    content: [
      {
        type: "tableOfContents",
        attrs: {
          title: "Mục lục",
          includedLevels: [1, 2, 3],
          entries: [{ headingId: "h1", level: 1, text: "Chương 1", pageNumber: 1 }],
        },
      },
      {
        type: "heading",
        attrs: { level: 1, id: "h1" },
        content: [{ type: "text", text: "Chương 1" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Đoạn có bình luận",
            marks: [{ type: "comment", attrs: { commentId: "c_1" } }],
          },
          {
            type: "noteReference",
            attrs: {
              noteId: "fn_coexist",
              noteType: "footnote",
              content: "Footnote bên cạnh comment",
            },
          },
          {
            type: "text",
            text: " và thay đổi được theo dõi",
            marks: [{ type: "trackChange", attrs: { id: "tc_1", changeType: "insert" } }],
          },
        ],
      },
    ],
  };

  const editor = createTestEditor(docContent);

  // 1. Trích xuất TOC không bị lẫn note text vào
  const notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes.length, 1);
  assert.equal(notes.footnotes[0].id, "fn_coexist");

  // 2. Cập nhật note không phá vỡ marks xung quanh
  const updateRes = NoteService.updateNoteContent(editor, "fn_coexist", "Đã cập nhật");
  assert.equal(updateRes.success, true);

  const json = editor.getJSON();
  const paraNode = json.content?.[2];
  assert.equal(paraNode?.type, "paragraph");

  // Kiểm tra comment mark và trackChange mark vẫn nguyên vẹn
  const textWithComment = paraNode?.content?.[0];
  assert.equal(textWithComment?.marks?.[0]?.type, "comment");

  const textWithTc = paraNode?.content?.[2];
  assert.equal(textWithTc?.marks?.[0]?.type, "trackChange");

  editor.destroy();
});
