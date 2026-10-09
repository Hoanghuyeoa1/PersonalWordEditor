import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { TocService } from "./services/tocService.ts";
import { HeadingService } from "./services/headingService.ts";
import type { TocNodeAttrs } from "./types/tocTypes.ts";
import { serializeDocumentToMwd, deserializeMwdToDocument } from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";

/**
 * Helper khởi tạo headless Tiptap Editor với đầy đủ extensions
 */
function createTestEditor(initialContent?: any): Editor {
  const ed = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "ref_heading_h1_intro", level: 1 },
          content: [{ type: "text", text: "1. Giới thiệu chung" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung mở đầu văn bản." }],
        },
        {
          type: "heading",
          attrs: { id: "ref_heading_h2_arch", level: 2 },
          content: [{ type: "text", text: "1.1 Kiến trúc hệ thống" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Chi tiết kiến trúc hệ thống." }],
        },
        {
          type: "heading",
          attrs: { id: "ref_heading_h3_db", level: 3 },
          content: [{ type: "text", text: "1.1.1 Cơ sở dữ liệu" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Mô hình CSDL và bảng biểu." }],
        },
        {
          type: "heading",
          attrs: { id: "ref_heading_h1_concl", level: 1 },
          content: [{ type: "text", text: "2. Kết luận và Hướng phát triển" }],
        },
      ],
    },
  });
  ensureEditorPlugins(ed);
  return ed;
}

/* ==========================================================================
   1. EMPTY DOCUMENT & NO HEADINGS TEST
   ========================================================================== */
test("Phase 6.3 TOC: Xử lý an toàn khi tài liệu không có Heading", () => {
  const emptyEditor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Đoạn văn bình thường không có tiêu đề." }],
        },
      ],
    },
  });

  // Chèn TOC vào tài liệu không có heading
  const insertRes = TocService.insertToc(emptyEditor);
  assert.equal(insertRes.success, true);
  assert.equal(insertRes.details?.entriesCount, 0);

  const found = TocService.findTocNode(emptyEditor.state.doc);
  assert.ok(found, "Phải tìm thấy node tableOfContents");
  assert.equal(found.node.type.name, "tableOfContents");

  const attrs = found.node.attrs as TocNodeAttrs;
  assert.equal(attrs.title, "Mục lục");
  assert.equal(attrs.entries.length, 0);

  emptyEditor.destroy();
});

/* ==========================================================================
   2. H1, H2, H3 EXTRACTION & HIERARCHY
   ========================================================================== */
test("Phase 6.3 TOC: Trích xuất chính xác đề mục H1, H2, H3 và cấu trúc phả hệ", () => {
  const editor = createTestEditor();

  const insertRes = TocService.insertToc(editor, {
    title: "Mục lục Tài liệu",
    preset: "classic",
    includedLevels: [1, 2, 3],
    showPageNumbers: true,
  });

  assert.equal(insertRes.success, true);
  assert.equal(insertRes.details?.entriesCount, 4);

  const found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  const attrs = found.node.attrs as TocNodeAttrs;

  assert.equal(attrs.title, "Mục lục Tài liệu");
  assert.equal(attrs.preset, "classic");
  assert.equal(attrs.entries.length, 4);

  // Kiểm tra từng entry
  assert.equal(attrs.entries[0].text, "1. Giới thiệu chung");
  assert.equal(attrs.entries[0].level, 1);
  assert.equal(attrs.entries[0].headingId, "ref_heading_h1_intro");

  assert.equal(attrs.entries[1].text, "1.1 Kiến trúc hệ thống");
  assert.equal(attrs.entries[1].level, 2);
  assert.equal(attrs.entries[1].headingId, "ref_heading_h2_arch");

  assert.equal(attrs.entries[2].text, "1.1.1 Cơ sở dữ liệu");
  assert.equal(attrs.entries[2].level, 3);
  assert.equal(attrs.entries[2].headingId, "ref_heading_h3_db");

  assert.equal(attrs.entries[3].text, "2. Kết luận và Hướng phát triển");
  assert.equal(attrs.entries[3].level, 1);
  assert.equal(attrs.entries[3].headingId, "ref_heading_h1_concl");

  editor.destroy();
});

/* ==========================================================================
   3. LEVEL FILTERING CONFIG
   ========================================================================== */
test("Phase 6.3 TOC: Hỗ trợ lọc cấp độ đề mục (chỉ chọn H1 hoặc H1+H2)", () => {
  const editor = createTestEditor();

  // Chỉ lấy Level 1
  TocService.insertToc(editor, { includedLevels: [1] });
  let found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  let attrs = found.node.attrs as TocNodeAttrs;
  assert.equal(attrs.entries.length, 2);
  assert.equal(attrs.entries[0].level, 1);
  assert.equal(attrs.entries[1].level, 1);

  // Chỉ lấy Level 1 và 2
  TocService.removeToc(editor);
  TocService.insertToc(editor, { includedLevels: [1, 2] });
  found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  attrs = found.node.attrs as TocNodeAttrs;
  assert.equal(attrs.entries.length, 3);
  assert.ok(attrs.entries.every((e) => e.level === 1 || e.level === 2));

  editor.destroy();
});

/* ==========================================================================
   4. RENAME HEADING -> UPDATE TOC REFLECTION
   ========================================================================== */
test("Phase 6.3 TOC: Đổi tên đề mục (Rename) được phản ánh chuẩn xác sau khi Update", () => {
  const editor = createTestEditor();
  TocService.insertToc(editor);

  // Tìm vị trí của Heading 1 đầu tiên và đổi text
  let h1Pos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.id === "ref_heading_h1_intro") {
      h1Pos = pos;
      return false;
    }
  });
  assert.ok(h1Pos >= 0);

  // Đổi text heading
  const h1Node = editor.state.doc.nodeAt(h1Pos);
  assert.ok(h1Node);
  const textStart = h1Pos + 1;
  const textEnd = textStart + h1Node.content.size;

  const tr = editor.state.tr.replaceWith(
    textStart,
    textEnd,
    editor.schema.text("1. Lời mở đầu đã được chỉnh sửa")
  );
  editor.view.dispatch(tr);

  // Cập nhật TOC (F9)
  const updateRes = TocService.updateToc(editor);
  assert.equal(updateRes.success, true);

  const found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  const attrs = found.node.attrs as TocNodeAttrs;
  assert.equal(attrs.entries[0].text, "1. Lời mở đầu đã được chỉnh sửa");
  assert.equal(attrs.entries[0].headingId, "ref_heading_h1_intro");

  editor.destroy();
});

/* ==========================================================================
   5. ADD & REMOVE HEADING -> UPDATE TOC REFLECTION
   ========================================================================== */
test("Phase 6.3 TOC: Thêm mới và xóa bỏ Heading được phản ánh chuẩn xác sau Update", () => {
  const editor = createTestEditor();
  TocService.insertToc(editor);

  // 1. Thêm Heading mới vào cuối tài liệu
  const newHeading = editor.schema.nodes.heading.create(
    { id: "ref_heading_new_section", level: 2 },
    editor.schema.text("3. Phụ lục kỹ thuật")
  );
  const insertTr = editor.state.tr.insert(editor.state.doc.content.size, newHeading);
  editor.view.dispatch(insertTr);

  // Cập nhật TOC
  TocService.updateToc(editor);
  let found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  let attrs = found.node.attrs as TocNodeAttrs;
  assert.equal(attrs.entries.length, 5);
  assert.equal(attrs.entries[4].text, "3. Phụ lục kỹ thuật");
  assert.equal(attrs.entries[4].level, 2);

  // 2. Xóa Heading 1.1.1 Cơ sở dữ liệu
  let h3Pos = -1;
  let h3Size = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.id === "ref_heading_h3_db") {
      h3Pos = pos;
      h3Size = node.nodeSize;
      return false;
    }
  });
  assert.ok(h3Pos >= 0);

  const deleteTr = editor.state.tr.delete(h3Pos, h3Pos + h3Size);
  editor.view.dispatch(deleteTr);

  // Cập nhật lại TOC
  TocService.updateToc(editor);
  found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  attrs = found.node.attrs as TocNodeAttrs;
  assert.equal(attrs.entries.length, 4);
  assert.equal(
    attrs.entries.some((e) => e.headingId === "ref_heading_h3_db"),
    false,
    "Entry của đề mục bị xóa phải biến mất khỏi mục lục"
  );

  editor.destroy();
});

/* ==========================================================================
   6. HEADING LEVEL CHANGE -> UPDATE TOC REFLECTION
   ========================================================================== */
test("Phase 6.3 TOC: Thay đổi cấp độ Heading (Level Change) được cập nhật đúng", () => {
  const editor = createTestEditor();
  TocService.insertToc(editor);

  // Đổi H3 Cơ sở dữ liệu thành H1
  let targetPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.id === "ref_heading_h3_db") {
      targetPos = pos;
      return false;
    }
  });
  assert.ok(targetPos >= 0);

  const changeLevelTr = editor.state.tr.setNodeMarkup(targetPos, undefined, {
    id: "ref_heading_h3_db",
    level: 1,
  });
  editor.view.dispatch(changeLevelTr);

  // Cập nhật TOC
  TocService.updateToc(editor);
  const found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  const attrs = found.node.attrs as TocNodeAttrs;

  const targetEntry = attrs.entries.find((e) => e.headingId === "ref_heading_h3_db");
  assert.ok(targetEntry);
  assert.equal(targetEntry.level, 1, "Cấp độ trong mục lục phải đổi thành 1");

  editor.destroy();
});

/* ==========================================================================
   7. REMOVE TOC COMMAND
   ========================================================================== */
test("Phase 6.3 TOC: Lệnh Remove TOC xóa sạch khối Mục lục khỏi AST", () => {
  const editor = createTestEditor();
  TocService.insertToc(editor);
  assert.equal(TocService.hasToc(editor.state.doc), true);

  const removeRes = TocService.removeToc(editor);
  assert.equal(removeRes.success, true);
  assert.equal(TocService.hasToc(editor.state.doc), false);
  assert.equal(TocService.findTocNode(editor.state.doc), null);

  editor.destroy();
});

/* ==========================================================================
   8. TOC NAVIGATION WITHOUT MUTATING DOCUMENT
   ========================================================================== */
test("Phase 6.3 TOC: Điều hướng đến đề mục không làm thay đổi nội dung tài liệu", () => {
  const editor = createTestEditor();
  TocService.insertToc(editor);

  const contentBefore = JSON.stringify(editor.getJSON());

  // Điều hướng tới Heading 2
  const navSuccess = TocService.navigateToEntry(editor, "ref_heading_h2_arch");
  assert.equal(navSuccess, true);

  // Kiểm tra selection con trỏ
  const { selection } = editor.state;
  assert.ok(selection.from > 0);

  // Đảm bảo không làm thay đổi tài liệu
  const contentAfter = JSON.stringify(editor.getJSON());
  assert.equal(contentAfter, contentBefore, "Điều hướng TOC không được đột biến AST");

  editor.destroy();
});

/* ==========================================================================
   9. PAGE NUMBERS RECOMPUTATION
   ========================================================================== */
test("Phase 6.3 TOC: Tính toán và cập nhật số trang khi có Page Break", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "h1_p1", level: 1 },
          content: [{ type: "text", text: "Trang 1: Mở đầu" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Văn bản trang 1." }] },
        { type: "pageBreak" },
        {
          type: "heading",
          attrs: { id: "h1_p2", level: 1 },
          content: [{ type: "text", text: "Trang 2: Chi tiết" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Văn bản trang 2." }] },
        { type: "pageBreak" },
        {
          type: "heading",
          attrs: { id: "h1_p3", level: 1 },
          content: [{ type: "text", text: "Trang 3: Tổng kết" }],
        },
      ],
    },
  });

  TocService.insertToc(editor, { showPageNumbers: true });
  const found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  const attrs = found.node.attrs as TocNodeAttrs;

  assert.equal(attrs.entries.length, 3);
  assert.equal(attrs.entries[0].pageNumber, 1);
  assert.equal(attrs.entries[1].pageNumber, 2);
  assert.equal(attrs.entries[2].pageNumber, 3);

  // Thử cập nhật chỉ số trang (updatePageNumbersOnly)
  const updatePagesRes = TocService.updateToc(editor, { updatePageNumbersOnly: true });
  assert.equal(updatePagesRes.success, true);
  assert.equal(updatePagesRes.details?.isPageNumbersOnly, true);

  editor.destroy();
});

/* ==========================================================================
   10. SAVE / OPEN PERSISTENCE ROUND-TRIP (.MWD)
   ========================================================================== */
test("Phase 6.3 TOC: Bảo toàn toàn vẹn cấu trúc và cấu hình TOC qua chu trình .mwd", () => {
  const doc = createInitialDocument();
  doc.content = {
    type: "doc",
    content: [
      {
        type: "tableOfContents",
        attrs: {
          title: "Mục lục Báo cáo 2026",
          preset: "modern",
          includedLevels: [1, 2],
          showPageNumbers: true,
          rightAlignPageNumbers: false,
          entries: [
            { headingId: "ref_h1", level: 1, text: "Chương I", pageNumber: 1 },
            { headingId: "ref_h2", level: 2, text: "Mục 1.1", pageNumber: 2 },
          ],
          lastUpdated: "2026-10-07T08:00:00.000Z",
        },
      },
      {
        type: "heading",
        attrs: { id: "ref_h1", level: 1 },
        content: [{ type: "text", text: "Chương I" }],
      },
      {
        type: "heading",
        attrs: { id: "ref_h2", level: 2 },
        content: [{ type: "text", text: "Mục 1.1" }],
      },
    ],
  };

  const serialized = serializeDocumentToMwd(doc);
  assert.ok(serialized.includes('"tableOfContents"'));
  assert.ok(serialized.includes('"Mục lục Báo cáo 2026"'));
  assert.ok(serialized.includes('"modern"'));

  const deserialized = deserializeMwdToDocument(serialized);
  assert.equal(deserialized.success, true);
  assert.ok(deserialized.document);

  const blocks = deserialized.document.content.content || [];
  const restoredToc = blocks.find((b: any) => b.type === "tableOfContents");
  assert.ok(restoredToc, "Khối tableOfContents phải tồn tại sau khi mở file");

  assert.equal(restoredToc.attrs?.title, "Mục lục Báo cáo 2026");
  assert.equal(restoredToc.attrs?.preset, "modern");
  assert.deepEqual(restoredToc.attrs?.includedLevels, [1, 2]);
  assert.equal(restoredToc.attrs?.showPageNumbers, true);
  assert.equal(restoredToc.attrs?.rightAlignPageNumbers, false);
  assert.equal(restoredToc.attrs?.entries?.length, 2);
  assert.equal(restoredToc.attrs?.entries?.[0]?.text, "Chương I");
  assert.equal(restoredToc.attrs?.entries?.[1]?.text, "Mục 1.1");
});

/* ==========================================================================
   11. UNDO / REDO SAFETY
   ========================================================================== */
test("Phase 6.3 TOC: Hoàn tác (Undo) và Làm lại (Redo) thao tác chèn Mục lục", () => {
  const editor = createTestEditor();
  assert.equal(TocService.hasToc(editor.state.doc), false);

  // 1. Chèn TOC
  TocService.insertToc(editor);
  assert.equal(TocService.hasToc(editor.state.doc), true);

  // 2. Undo -> TOC phải biến mất
  editor.commands.undo();
  assert.equal(TocService.hasToc(editor.state.doc), false);

  // 3. Redo -> TOC phải quay trở lại nguyên vẹn
  editor.commands.redo();
  assert.equal(TocService.hasToc(editor.state.doc), true);
  const found = TocService.findTocNode(editor.state.doc);
  assert.ok(found);
  assert.equal(found.node.attrs.entries.length, 4);

  editor.destroy();
});

/* ==========================================================================
   12. SAFETY: NO RECURSION & NO MALFORMED ID CRASH
   ========================================================================== */
test("Phase 6.3 TOC: Chống đệ quy (No Recursion) và an toàn với ID bất thường", () => {
  const editor = createTestEditor();

  // Chèn TOC
  TocService.insertToc(editor, { title: "Tiêu đề Mục lục Cực Dài" });

  // Kiểm tra: HeadingService trích xuất không bao giờ coi tiêu đề TOC là heading
  const headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(
    headings.some((h) => h.text.includes("Mục lục Cực Dài")),
    false,
    "Tiêu đề của TOC không được coi là Heading"
  );
  assert.equal(headings.length, 4, "Số heading phải giữ nguyên, không tự nhân bản");

  // Kiểm tra điều hướng với ID rác / malformed ID không crash
  const resBadId = TocService.navigateToEntry(editor, "non_existent_ref_heading_xyz");
  assert.equal(resBadId, false, "ID không tồn tại phải trả về false an toàn");

  editor.destroy();
});
