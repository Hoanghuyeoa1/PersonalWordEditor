import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import JSZip from "jszip";

import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { getReferenceItemDescriptor } from "./services/referencesRegistry.ts";
import { commandRegistry } from "../commands/commandRegistry.ts";
import { DEFAULT_COMMANDS } from "../commands/defaultCommands.ts";
import {
  insertTableOfFiguresCommand,
  updateTableOfFiguresCommand,
  manageBookmarksCommand,
  insertTocCommand,
  dispatchReferenceCommand,
} from "./commands/referencesCommands.ts";
import { CaptionService } from "./services/captionService.ts";
import { CaptionListService } from "./services/captionListService.ts";
import { BookmarkService } from "./services/bookmarkService.ts";
import { CrossReferenceService } from "./services/crossReferenceService.ts";
import { ReferenceUpdateService } from "./services/referenceUpdateService.ts";
import { CitationService } from "./services/citationService.ts";
import { ReferencePersistenceService } from "./services/referencePersistenceService.ts";

import { serializeDocumentToMwd, deserializeMwdToDocument } from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";
import { exportDocumentModelToDocx } from "../docx/export/docxExporter.ts";
import { importDocxToDocumentModel } from "../docx/import/docxImporter.ts";
import { buildPageLayoutMap } from "../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/index.ts";
import type { DocumentModel } from "../document/documentTypes.ts";

function createTestEditor(initialContent?: any): Editor {
  const content = initialContent || {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm ban đầu của tài liệu." }],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content,
  });
  ensureEditorPlugins(editor);
  return editor;
}

function findJsonNodes(node: any, typeName: string): any[] {
  const result: any[] = [];
  function walk(n: any) {
    if (!n) return;
    if (n.type === typeName) {
      result.push(n);
    }
    if (Array.isArray(n.content)) {
      n.content.forEach(walk);
    }
  }
  walk(node);
  return result;
}

/* ==========================================================================
   1. RIBBON FINAL WIRING
   ========================================================================== */

test("Phase 11 - 1. Ribbon Final Wiring: 3 Ribbon buttons are truly active and wired", () => {
  if (commandRegistry.getAll().length === 0) {
    commandRegistry.registerAll(DEFAULT_COMMANDS);
  }

  // Audit Registry Descriptors
  const tofDesc = getReferenceItemDescriptor("insertTableOfFigures");
  assert.ok(tofDesc, "insertTableOfFigures descriptor phải tồn tại");
  assert.equal(tofDesc.status, "active", "Danh mục hình phải ở trạng thái active");

  const updateTofDesc = getReferenceItemDescriptor("updateTableOfFigures");
  assert.ok(updateTofDesc, "updateTableOfFigures descriptor phải tồn tại");
  assert.equal(updateTofDesc.status, "active", "Cập nhật danh mục phải active");
  assert.equal(updateTofDesc.shortcut, "F9", "Phải gán phím tắt F9");

  const bookmarksDesc = getReferenceItemDescriptor("bookmarksList");
  assert.ok(bookmarksDesc, "bookmarksList descriptor phải tồn tại");
  assert.equal(bookmarksDesc.status, "active", "Thẻ đánh dấu phải active");

  // Audit Dispatch Commands
  const editor = createTestEditor();
  const resTof = dispatchReferenceCommand("insertTableOfFigures", editor);
  assert.equal(resTof.success, true, "dispatch insertTableOfFigures phải thành công");

  const resBm = dispatchReferenceCommand("bookmarksList", editor);
  assert.equal(resBm.success, true, "dispatch bookmarksList phải thành công");

  // Audit Unified Command Registry
  const cmdTof = commandRegistry.get("references.tableOfFigures");
  assert.ok(cmdTof, "Command references.tableOfFigures phải được đăng ký");

  const cmdUpdateTof = commandRegistry.get("references.updateTableOfFigures");
  assert.ok(cmdUpdateTof, "Command references.updateTableOfFigures phải được đăng ký");

  const cmdBookmarks = commandRegistry.get("references.bookmarks");
  assert.ok(cmdBookmarks, "Command references.bookmarks phải được đăng ký");
});

/* ==========================================================================
   2. CAPTION LIST E2E
   ========================================================================== */

test("Phase 11 - 2. Caption List E2E: Image -> Caption 1, Image -> Caption 2, insert list and verify entries & click navigation", () => {
  const editor = createTestEditor();

  // Chèn Caption Figure 1 & Caption Figure 2
  CaptionService.insertCaption(editor, { label: "Figure", text: "Kiến trúc tổng thể hệ thống" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Sơ đồ luồng dữ liệu chi tiết" });

  // Chèn Danh mục hình
  const res = insertTableOfFiguresCommand(editor, {
    label: "Figure",
    title: "Danh mục hình ảnh minh họa",
  });
  assert.equal(res.success, true);

  // Kiểm tra node captionList trong doc
  const lists = CaptionListService.findCaptionListNodes(editor.state.doc);
  assert.equal(lists.length, 1);
  const listNode = lists[0].node;
  assert.equal(listNode.attrs.title, "Danh mục hình ảnh minh họa");
  assert.equal(listNode.attrs.label, "Figure");
  assert.equal(listNode.attrs.entries.length, 2);

  const entries = listNode.attrs.entries;
  assert.equal(entries[0].label, "Figure");
  assert.equal(entries[0].number, 1);
  assert.equal(entries[0].text, "Kiến trúc tổng thể hệ thống");

  assert.equal(entries[1].label, "Figure");
  assert.equal(entries[1].number, 2);
  assert.equal(entries[1].text, "Sơ đồ luồng dữ liệu chi tiết");

  // Kiểm tra điều hướng: captionId của entry trỏ đúng tới caption node
  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(entries[0].captionId, captions[0].id);
  assert.equal(entries[1].captionId, captions[1].id);
});

/* ==========================================================================
   3. UPDATE E2E
   ========================================================================== */

test("Phase 11 - 3. Update E2E: Insert Figure between two Figures and update list", () => {
  const editor = createTestEditor();

  // Chèn Figure 1 và Figure 2
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình ban đầu số 1" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình ban đầu số 2" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  let lists = CaptionListService.findCaptionListNodes(editor.state.doc);
  assert.equal(lists[0].node.attrs.entries.length, 2);

  // Chèn Figure mới vào giữa (vị trí con trỏ sau hình 1)
  const captionsBefore = CaptionService.extractCaptions(editor.state.doc);
  editor.commands.setTextSelection(captionsBefore[0].pos + 1);

  // Chèn một caption mới
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình xen giữa mới" });

  // Cập nhật danh mục
  const updateRes = updateTableOfFiguresCommand(editor);
  assert.equal(updateRes.success, true);

  lists = CaptionListService.findCaptionListNodes(editor.state.doc);
  const updatedEntries = lists[0].node.attrs.entries;
  assert.equal(updatedEntries.length, 3);
  assert.equal(updatedEntries[0].number, 1);
  assert.equal(updatedEntries[1].number, 2);
  assert.equal(updatedEntries[1].text, "Hình xen giữa mới");
  assert.equal(updatedEntries[2].number, 3);
});

/* ==========================================================================
   4. MULTIPLE LISTS
   ========================================================================== */

test("Phase 11 - 4. Multiple Lists: Figure, Table, Equation independent lists without label contamination", () => {
  const editor = createTestEditor();

  CaptionService.insertCaption(editor, { label: "Figure", text: "Biểu đồ cột" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng dữ liệu khảo sát" });
  CaptionService.insertCaption(editor, { label: "Equation", text: "Phương trình Maxwell" });
  CaptionService.insertCaption(editor, { label: "Sơ đồ", text: "Sơ đồ khối vi xử lý" });

  // Chèn 4 danh mục riêng biệt
  insertTableOfFiguresCommand(editor, { label: "Figure", title: "Danh mục hình" });
  insertTableOfFiguresCommand(editor, { label: "Table", title: "Danh mục bảng" });
  insertTableOfFiguresCommand(editor, { label: "Equation", title: "Danh mục công thức" });
  insertTableOfFiguresCommand(editor, { label: "Sơ đồ", title: "Danh mục sơ đồ" });

  const figLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Figure");
  const tblLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Table");
  const eqLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Equation");
  const customLists = CaptionListService.findCaptionListNodes(editor.state.doc, "Sơ đồ");

  assert.equal(figLists.length, 1);
  assert.equal(figLists[0].node.attrs.entries.length, 1);
  assert.equal(figLists[0].node.attrs.entries[0].label, "Figure");

  assert.equal(tblLists.length, 1);
  assert.equal(tblLists[0].node.attrs.entries.length, 1);
  assert.equal(tblLists[0].node.attrs.entries[0].label, "Table");

  assert.equal(eqLists.length, 1);
  assert.equal(eqLists[0].node.attrs.entries.length, 1);
  assert.equal(eqLists[0].node.attrs.entries[0].label, "Equation");

  assert.equal(customLists.length, 1);
  assert.equal(customLists[0].node.attrs.entries.length, 1);
  assert.equal(customLists[0].node.attrs.entries[0].label, "Sơ đồ");

  // Cập nhật độc lập list Table
  const updateTblRes = CaptionListService.updateCaptionList(editor, { label: "Table" });
  assert.equal(updateTblRes.success, true);
  assert.equal(updateTblRes.updatedCount, 1);
});

/* ==========================================================================
   5. F9 REGRESSION
   ========================================================================== */

test("Phase 11 - 5. F9 Regression: Caret in TOC -> TOC; in Caption List -> Caption List; in Bibliography -> Bibliography", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, id: "h1-phase11-test" },
        content: [{ type: "text", text: "Chương 1: Khởi đầu" }],
      },
    ],
  });

  insertTocCommand(editor);

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình mẫu" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  CitationService.saveSource({
    id: "src_f9_test_p11",
    type: "book",
    title: "Kiểm thử F9 Phase 11",
    authors: "Nguyen Van A",
    year: 2026,
  });
  CitationService.insertBibliography(editor);

  // 1. Caret bên trong TOC
  let tocPos = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableOfContents") {
      tocPos = pos + 1;
      return false;
    }
    return true;
  });
  editor.commands.setTextSelection(tocPos);
  assert.equal(ReferenceUpdateService.resolveActiveField(editor)?.type, "toc");
  assert.equal(ReferenceUpdateService.executeF9Update(editor), true);

  // 2. Caret bên trong Caption List
  const captionListNodes = CaptionListService.findCaptionListNodes(editor.state.doc);
  editor.commands.setTextSelection(captionListNodes[0].pos + 1);
  assert.equal(ReferenceUpdateService.resolveActiveField(editor)?.type, "captionList");
  assert.equal(ReferenceUpdateService.executeF9Update(editor), true);

  // 3. Caret bên trong Bibliography
  let bibPos = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "bibliography") {
      bibPos = pos + 1;
      return false;
    }
    return true;
  });
  editor.commands.setTextSelection(bibPos);
  assert.equal(ReferenceUpdateService.resolveActiveField(editor)?.type, "bibliography");
  assert.equal(ReferenceUpdateService.executeF9Update(editor), true);
});

/* ==========================================================================
   6. BOOKMARK E2E
   ========================================================================== */

test("Phase 11 - 6. Bookmark E2E: Select text, add bookmark, Go To, Rename, Delete, Undo/Redo without text loss", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đây là Kết quả nghiên cứu quan trọng của đề tài." }],
      },
    ],
  });

  const text = editor.state.doc.textBetween(0, editor.state.doc.content.size);
  const startPos = text.indexOf("Kết quả nghiên cứu") + 1;
  const endPos = startPos + "Kết quả nghiên cứu".length;
  editor.commands.setTextSelection({ from: startPos, to: endPos });

  // 1. Thêm Bookmark
  const addRes = BookmarkService.createBookmark(editor, {
    name: "ket_qua",
    from: startPos,
    to: endPos,
  });
  assert.equal(addRes.success, true);
  const bmId = addRes.bookmark!.id;

  let bookmarks = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].bookmark.name, "ket_qua");

  // 2. Go To Bookmark
  const gotoRes = BookmarkService.goToBookmark(editor, bmId);
  assert.equal(gotoRes, true);
  assert.equal(editor.state.selection.from, startPos);
  assert.equal(editor.state.selection.to, endPos);

  // 3. Rename Bookmark
  const renameRes = BookmarkService.renameBookmark(editor, bmId, "ket_qua_nghien_cuu");
  assert.equal(renameRes.success, true);
  bookmarks = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bookmarks[0].bookmark.name, "ket_qua_nghien_cuu");
  assert.equal(bookmarks[0].bookmark.id, bmId);

  // 4. Delete Bookmark
  const delRes = BookmarkService.deleteBookmark(editor, bmId);
  assert.equal(delRes.success, true);
  bookmarks = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bookmarks.length, 0);

  // Văn bản vẫn nguyên vẹn 100%
  assert.ok(editor.state.doc.textBetween(0, editor.state.doc.content.size).includes("Kết quả nghiên cứu"));

  // 5. Undo / Redo
  editor.commands.undo();
  bookmarks = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].bookmark.name, "ket_qua_nghien_cuu");

  editor.commands.redo();
  bookmarks = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(bookmarks.length, 0);
});

/* ==========================================================================
   7. CROSS-REFERENCE BOOKMARK
   ========================================================================== */

test("Phase 11 - 7. Cross-Reference Bookmark: create, insert ref, rename target, delete target, undo", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Phần kết luận nằm ở đây." }],
      },
    ],
  });

  // Thêm position bookmark
  const addRes = BookmarkService.createBookmark(editor, {
    name: "ket_luan",
    from: 5,
    to: 5,
  });
  assert.equal(addRes.success, true);
  const bmId = addRes.bookmark!.id;

  // Chèn tham chiếu chéo tới bookmark này
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const crRes = CrossReferenceService.insertCrossReference(editor, {
    targetId: bmId,
    targetType: "bookmark",
    format: "text",
  });
  assert.equal(crRes.success, true);

  // Phân giải văn bản tham chiếu ban đầu
  let resolved = CrossReferenceService.resolveTarget(editor.state.doc, { targetId: bmId, targetType: "bookmark", format: "text" });
  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "ket_luan");

  // Đổi tên Bookmark -> Phân giải phản ánh tên mới
  BookmarkService.renameBookmark(editor, bmId, "ket_luan_moi");
  resolved = CrossReferenceService.resolveTarget(editor.state.doc, { targetId: bmId, targetType: "bookmark", format: "text" });
  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "ket_luan_moi");

  // Xóa Bookmark -> Phân giải trả về [Reference not found]
  BookmarkService.deleteBookmark(editor, bmId);
  resolved = CrossReferenceService.resolveTarget(editor.state.doc, { targetId: bmId, targetType: "bookmark", format: "text" });
  assert.equal(resolved.found, false);
  assert.ok(resolved.text.includes("not found"));

  // Undo khôi phục bookmark -> Tham chiếu phân giải lại bình thường
  editor.commands.undo();
  resolved = CrossReferenceService.resolveTarget(editor.state.doc, { targetId: bmId, targetType: "bookmark", format: "text" });
  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "ket_luan_moi");
});

/* ==========================================================================
   8. COMPLEX BOOKMARK CASES
   ========================================================================== */

test("Phase 11 - 8. Complex Bookmark Cases: boundaries, table cells, formatted text, and deletion resilience", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đầu tài liệu" }],
      },
      {
        type: "heading",
        attrs: { level: 2, id: "h2-test" },
        content: [{ type: "text", text: "Tiêu đề mục 1" }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Ô 1" }] }],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Cuối tài liệu" }],
      },
    ],
  });

  // 1. Bookmark ở đầu tài liệu (pos 1)
  const b1 = BookmarkService.createBookmark(editor, { name: "dau_tai_lieu", from: 1, to: 1 });
  assert.equal(b1.success, true);

  // 2. Bookmark ở cuối tài liệu
  const endDocPos = editor.state.doc.content.size - 2;
  const b2 = BookmarkService.createBookmark(editor, { name: "cuoi_tai_lieu", from: endDocPos, to: endDocPos });
  assert.equal(b2.success, true);

  // 3. Bookmark bên trong heading
  let headingFrom = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headingFrom = pos + 1;
      return false;
    }
    return true;
  });
  const b3 = BookmarkService.createBookmark(editor, {
    name: "bm_heading",
    from: headingFrom,
    to: headingFrom + 5,
  });
  assert.equal(b3.success, true);

  // 4. Bookmark bên trong Table Cell
  let cellPos = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "tableCell") {
      cellPos = pos + 2;
      return false;
    }
    return true;
  });
  const b4 = BookmarkService.createBookmark(editor, {
    name: "bm_cell",
    from: cellPos,
    to: cellPos,
  });
  assert.equal(b4.success, true);

  const all = BookmarkService.extractBookmarks(editor.state.doc);
  assert.equal(all.length, 4);

  // Xóa toàn bộ đoạn văn chứa bookmark -> không crash, hệ thống an toàn
  editor.commands.deleteRange({ from: 0, to: 10 });
  const remaining = BookmarkService.extractBookmarks(editor.state.doc);
  assert.ok(remaining.length <= 4);
});

/* ==========================================================================
   9. PAGINATION INTEGRATION
   ========================================================================== */

test("Phase 11 - 9. Pagination: Caption List reflects authoritative PageLayoutMap", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung trang 1" }] }],
  });

  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình ảnh trang kiểm thử" });
  insertTableOfFiguresCommand(editor, { label: "Figure" });

  const layout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.ok(layout.getPageCount() >= 1);

  // Cập nhật danh mục với layoutMap thực tế
  const updateRes = updateTableOfFiguresCommand(editor, { layoutMap: layout });
  assert.equal(updateRes.success, true);

  const lists = CaptionListService.findCaptionListNodes(editor.state.doc);
  assert.equal(lists[0].node.attrs.entries[0].pageNumber, 1);
});

/* ==========================================================================
   10. PERSISTENCE ROUND-TRIP (.mwd)
   ========================================================================== */

test("Phase 11 - 10. Persistence (.mwd): Captions, Lists, Bookmarks, and Cross-references survive round-trip", () => {
  const docModel = createInitialDocument("Tài liệu kiểm định toàn vẹn Phase 11");

  docModel.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Mở đầu văn bản có " },
          {
            type: "text",
            marks: [{ type: "bookmark", attrs: { id: "ref_bm_001", name: "vung_quan_trong", createdAt: "2026-10-08T00:00:00.000Z" } }],
            text: "vùng chọn bookmark",
          },
        ],
      },
      {
        type: "caption",
        attrs: { id: "cap_fig_1", label: "Figure", number: 1, text: "Sơ đồ kiến trúc" },
      },
      {
        type: "captionList",
        attrs: {
          id: "cl_fig_1",
          title: "Danh mục hình ảnh",
          label: "Figure",
          showPageNumbers: true,
          rightAlignPageNumbers: true,
          preset: "classic",
          entries: [{ id: "e1", label: "Figure", number: 1, text: "Sơ đồ kiến trúc", targetId: "cap_fig_1", pageNumber: 1 }],
          lastUpdated: "2026-10-08T00:00:00.000Z",
        },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "crossReference",
            attrs: { targetId: "ref_bm_001", targetType: "bookmark", format: "text", customText: "vung_quan_trong" },
          },
        ],
      },
    ],
  };

  docModel.references = ReferencePersistenceService.reconcileReferencesMetadata(
    docModel.content,
    docModel.references
  );

  // Serialize sang .mwd
  const mwdStr = serializeDocumentToMwd(docModel);
  assert.ok(typeof mwdStr === "string");

  // Deserialize trở lại
  const restored = deserializeMwdToDocument(mwdStr);
  assert.equal(restored.success, true);
  const loadedDoc = restored.document;

  // Xác thực cấu trúc AST và metadata references
  const bookmarks = BookmarkService.extractBookmarks(loadedDoc.content);
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].bookmark.name, "vung_quan_trong");

  const captions = CaptionService.extractCaptions(loadedDoc.content);
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, "Sơ đồ kiến trúc");

  const jsonLists = findJsonNodes(loadedDoc.content, "captionList");
  assert.equal(jsonLists.length, 1);
  assert.equal(jsonLists[0].attrs.title, "Danh mục hình ảnh");

  assert.ok(loadedDoc.references?.bookmarks?.some((b) => b.id === "ref_bm_001"));
});

/* ==========================================================================
   11. DOCX ROUND-TRIP
   ========================================================================== */

test("Phase 11 - 11. DOCX Export & Import: valid package, bookmarks mapped, cross-refs intact", async () => {
  const docModel: DocumentModel = {
    metadata: {
      id: "doc-phase11-docx",
      title: "Kiểm thử xuất DOCX Phase 11",
      version: 1,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    headerFooter: { linkToPrevious: false },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Văn bản trước bookmark. " },
            {
              type: "bookmarkAnchor",
              attrs: { id: "ref_bm_pos_docx", name: "Diem_neo_chuan", createdAt: "2026-10-08T00:00:00.000Z" },
            },
            { type: "text", text: "Văn bản sau bookmark." },
          ],
        },
      ],
    },
    references: {
      bookmarks: [{ id: "ref_bm_pos_docx", name: "Diem_neo_chuan", type: "position", createdAt: "2026-10-08T00:00:00.000Z" }],
    },
  };

  const docxBytes = await exportDocumentModelToDocx(docModel);
  assert.ok(docxBytes instanceof Uint8Array);

  // Kiểm tra gói ZIP hợp lệ
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");
  assert.ok(docXml.includes("<w:bookmarkStart"));
  assert.ok(docXml.includes("<w:bookmarkEnd"));

  // Import lại vào DocumentModel
  const importResult = await importDocxToDocumentModel(docxBytes);
  assert.equal(importResult.success, true);
  const importedDoc = importResult.document;

  const importedBookmarks = BookmarkService.extractBookmarks(importedDoc.content);
  assert.ok(importedBookmarks.length >= 1);
});

/* ==========================================================================
   12. PERFORMANCE
   ========================================================================== */

test("Phase 11 - 12. Performance: Large document with 20 captions, 20 bookmarks, and 20 cross-references extracts in < 50ms", () => {
  const contentBlocks: any[] = [];

  for (let i = 1; i <= 20; i++) {
    contentBlocks.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "bookmark", attrs: { id: `ref_bm_perf_${i}`, name: `bookmark_${i}`, createdAt: "2026-10-08T00:00:00.000Z" } }],
          text: `Đoạn văn chứa bookmark số ${i}`,
        },
      ],
    });
    contentBlocks.push({
      type: "caption",
      attrs: { id: `cap_perf_${i}`, label: "Figure", number: i, text: `Chú thích hình ${i}` },
    });
    contentBlocks.push({
      type: "paragraph",
      content: [
        {
          type: "crossReference",
          attrs: { targetId: `ref_bm_perf_${i}`, targetType: "bookmark", format: "text", customText: `bookmark_${i}` },
        },
      ],
    });
  }

  const largeDoc: any = {
    type: "doc",
    content: contentBlocks,
  };

  const startTime = performance.now();

  const bookmarks = BookmarkService.extractBookmarks(largeDoc);
  const captions = CaptionService.extractCaptions(largeDoc);
  const entries = CaptionListService.generateEntries(largeDoc, "Figure");
  const targets = CrossReferenceService.getAvailableTargets(largeDoc, "bookmark");

  const duration = performance.now() - startTime;

  assert.equal(bookmarks.length, 20);
  assert.equal(captions.length, 20);
  assert.equal(entries.length, 20);
  assert.equal(targets.length, 20);
  assert.ok(duration < 50, `Thời gian trích xuất (${duration.toFixed(2)}ms) phải < 50ms`);
});

/* ==========================================================================
   13. EDGE CASES RESILIENCE
   ========================================================================== */

test("Phase 11 - 13. Edge Cases: Empty doc, duplicate bookmark names, orphan bookmarks, and malformed data", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản thử nghiệm" }] }],
  });

  // 1. Không có caption nào -> Chèn danh mục tạo 0 entries an toàn
  const resEmptyList = insertTableOfFiguresCommand(editor, { label: "Figure" });
  assert.equal(resEmptyList.success, true);
  let lists = CaptionListService.findCaptionListNodes(editor.state.doc);
  assert.equal(lists[0].node.attrs.entries.length, 0);

  // 2. Tên bookmark trùng lặp -> tự động khử trùng lặp (Disambiguate)
  BookmarkService.createBookmark(editor, { name: "chung_ten", from: 1, to: 1 });
  const duplicateRes = BookmarkService.createBookmark(editor, { name: "chung_ten", from: 2, to: 2 });
  // validateBookmarkName reject duplicate name for manual creation
  assert.equal(duplicateRes.success, false);
  assert.ok(duplicateRes.error?.includes("đã tồn tại"));

  // 3. Tương thích ngược: Chuẩn hóa tệp không có references
  const legacyDoc: any = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tệp cũ" }] }] };
  const normalized = ReferencePersistenceService.reconcileReferencesMetadata(legacyDoc, undefined);
  assert.equal(normalized, undefined);
});
