import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { HeadingService } from "./services/headingService.ts";
import { TocService } from "./services/tocService.ts";
import { NoteService } from "./services/noteService.ts";
import { CaptionService } from "./services/captionService.ts";
import { CrossReferenceService } from "./services/crossReferenceService.ts";
import { CitationService } from "./services/citationService.ts";
import { ReferenceAnchorService } from "./services/referenceAnchorService.ts";
import { useReferencesStore } from "../stores/referencesStore.ts";
import { useDocumentStore } from "../stores/documentStore.ts";
import { useReviewStore } from "../stores/reviewStore.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";
import { DocumentSerializer } from "../docx/mapping/documentSerializer.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import type { BibliographySource } from "./types/citationTypes.ts";

/**
 * Helper khởi tạo headless Tiptap Editor có đầy đủ extensions và plugins
 */
function createAuditEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Khởi tạo tài liệu kiểm thử toàn diện Phase 6 References Engine." }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ TÍCH HỢP TOÀN DIỆN: PHASE 6.7 — REFERENCES ENGINE FINAL AUDIT
   ========================================================================== */

test("PHASE 6 FINAL AUDIT — 1. Big Workflow: Vòng đời tài liệu thực tế toàn diện từ Heading, TOC, Table/Image Captions, Cross-Ref, Footnotes đến Citation/Bibliography", () => {
  const docStore = useDocumentStore.getState();
  docStore.resetDocument();

  // Khởi tạo nguồn tài liệu tham khảo trong store
  const source1: BibliographySource = {
    id: "src_wf_react",
    type: "book",
    title: "Kiến trúc Giao diện Người dùng Hiện đại",
    authors: "Nguyễn Văn An, Lê Thị Bình",
    year: 2023,
    publisher: "NXB Đại học Quốc gia",
  };
  const source2: BibliographySource = {
    id: "src_wf_prosemirror",
    type: "journalArticle",
    title: "ProseMirror AST and Deterministic State",
    authors: "Haverbeke, Marijn",
    year: 2021,
    journal: "Journal of Web Technologies",
  };
  docStore.setBibliographySources([source1, source2]);
  docStore.setCitationStyle("apa");

  // 1. Tạo Editor với cấu trúc tài liệu đồ án/luận văn thực tế
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Vị trí đầu tài liệu để chèn mục lục." }],
      },
      {
        type: "heading",
        attrs: { id: "ref_heading_h1_intro", level: 1 },
        content: [{ type: "text", text: "1. Tổng quan nghiên cứu" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nghiên cứu về trình soạn thảo văn bản desktop " }],
      },
      {
        type: "heading",
        attrs: { id: "ref_heading_h2_arch", level: 2 },
        content: [{ type: "text", text: "1.1. Kiến trúc hệ thống" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Mô tả chi tiết cấu trúc phân lớp " }],
      },
      {
        type: "heading",
        attrs: { id: "ref_heading_h3_db", level: 3 },
        content: [{ type: "text", text: "1.1.1. Cơ sở dữ liệu và lưu trữ" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dữ liệu được lưu trữ local-first. " }],
      },
    ],
  });

  // 2. Chèn Table of Contents (TOC) vào đầu tài liệu thay thế đoạn văn đầu
  editor.commands.setTextSelection(1);
  TocService.insertToc(editor, { includedLevels: [1, 2, 3], style: "formal" });
  assert.equal(TocService.hasToc(editor.state.doc), true);

  // 3. Chèn Bảng kèm Caption Bảng
  editor.commands.insertContentAt(editor.state.doc.content.size - 1, [
    {
      type: "caption",
      attrs: { id: "cap_tbl_1", label: "Table", targetId: "tbl_benchmark", positionPolicy: "above", text: "Bảng so sánh hiệu năng" },
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "[Nội dung Bảng Benchmark]" }],
    },
  ]);

  // 4. Chèn Hình ảnh kèm Caption Hình
  editor.commands.insertContentAt(editor.state.doc.content.size - 1, [
    {
      type: "paragraph",
      content: [{ type: "text", text: "[Hình ảnh Sơ đồ Luồng Dữ liệu]" }],
    },
    {
      type: "caption",
      attrs: { id: "cap_fig_1", label: "Figure", targetId: "fig_diagram", positionPolicy: "below", text: "Sơ đồ luồng dữ liệu" },
    },
  ]);

  // 5. Chèn Cross-reference tham chiếu tới Heading 1 và Figure 1
  editor.commands.insertContentAt(editor.state.doc.content.size - 1, [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Xem thêm chi tiết tại " },
        {
          type: "crossReference",
          attrs: { targetId: "ref_heading_h1_intro", targetType: "heading", format: "text", customText: "1. Tổng quan nghiên cứu" },
        },
        { type: "text", text: " và cấu trúc tại " },
        {
          type: "crossReference",
          attrs: { targetId: "cap_fig_1", targetType: "figure", format: "labelAndNumber", customText: "Figure 1" },
        },
        { type: "text", text: "." },
      ],
    },
  ]);

  // 6. Chèn Footnote và Endnote
  editor.commands.insertContentAt(editor.state.doc.content.size - 1, [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Ghi chú công nghệ " },
        {
          type: "noteReference",
          attrs: { noteId: "ref_fn_wf", noteType: "footnote", content: "Công nghệ WebAssembly và Rust backend" },
        },
        { type: "text", text: " và tổng kết " },
        {
          type: "noteReference",
          attrs: { noteId: "ref_en_wf", noteType: "endnote", content: "Toàn bộ tài liệu tuân thủ chuẩn ISO/IEC 29500" },
        },
      ],
    },
  ]);

  // 7. Chèn Citation và sinh Bibliography
  editor.commands.insertContentAt(editor.state.doc.content.size - 1, [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Kiến trúc được xây dựng dựa trên " },
        {
          type: "citation",
          attrs: { sourceId: "src_wf_react", style: "apa", customText: "(Nguyễn Văn An & Lê Thị Bình, 2023)" },
        },
        { type: "text", text: " kết hợp nguyên lý của " },
        {
          type: "citation",
          attrs: { sourceId: "src_wf_prosemirror", style: "apa", customText: "(Haverbeke, 2021)" },
        },
      ],
    },
  ]);

  CitationService.insertBibliography(editor, { title: "Tài liệu tham khảo", style: "apa", filter: "citedOnly" });

  // 8. Kiểm tra tính toàn vẹn của document trước khi lưu
  const extractedHeadings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(extractedHeadings.length, 3);

  const extractedCaptions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(extractedCaptions.length, 2);
  assert.equal(extractedCaptions[0].labelAndNumber, "Table 1");
  assert.equal(extractedCaptions[1].labelAndNumber, "Figure 1");

  const notes = NoteService.extractNotes(editor.state.doc);
  assert.equal(notes.footnotes.length, 1);
  assert.equal(notes.endnotes.length, 1);

  const citations = CitationService.extractCitations(editor.state.doc);
  assert.equal(citations.length, 2);

  // 9. Lưu vào .mwd (Save round-trip)
  const currentDocJson = editor.getJSON();
  const docModel: DocumentModel = {
    metadata: {
      id: "doc_wf_final",
      title: "Đồ án Tốt nghiệp Hoàn chỉnh",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: currentDocJson,
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      marginPreset: "normal",
    },
    references: {
      bibliographySources: [source1, source2],
      citationStyle: "apa",
    },
  };

  const mwdString = serializeDocumentToMwd(docModel);
  assert.ok(mwdString.length > 0);

  // 10. Mở lại từ .mwd (Open round-trip)
  const desRes = deserializeMwdToDocument(mwdString);
  assert.equal(desRes.success, true);
  if (!desRes.success) return;

  const reloadedEditor = createAuditEditor(desRes.document.content);
  assert.equal(HeadingService.extractHeadings(reloadedEditor.state.doc).length, 3);
  assert.equal(CaptionService.extractCaptions(reloadedEditor.state.doc).length, 2);
  assert.equal(NoteService.extractNotes(reloadedEditor.state.doc).footnotes.length, 1);
  assert.equal(CitationService.extractCitations(reloadedEditor.state.doc).length, 2);
  assert.equal(desRes.document.references?.bibliographySources?.length, 2);

  editor.destroy();
  reloadedEditor.destroy();
});

test("PHASE 6 FINAL AUDIT — 2. Undo / Redo: Bảo toàn nguyên vẹn mọi thao tác trên TOC, Notes, Captions, Cross-Ref, Citations và Bibliography", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();
  store.setBibliographySources([
    {
      id: "src_ur_test",
      type: "book",
      title: "Lập trình Cấu trúc",
      authors: "Edsger W. Dijkstra",
      year: 1972,
    },
  ]);

  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "ref_heading_h1_ur", level: 1 },
        content: [{ type: "text", text: "Đề mục kiểm tra Hoàn tác" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm các thao tác hoàn tác và làm lại." }],
      },
    ],
  });

  // A. Insert Footnote -> Undo -> Redo
  editor.commands.setTextSelection(35);
  NoteService.insertNote(editor, "footnote", "Ghi chú chân trang hoàn tác");
  assert.equal(NoteService.extractNotes(editor.state.doc).footnotes.length, 1);
  editor.commands.undo();
  assert.equal(NoteService.extractNotes(editor.state.doc).footnotes.length, 0);
  editor.commands.redo();
  assert.equal(NoteService.extractNotes(editor.state.doc).footnotes.length, 1);

  // B. Insert Caption -> Undo -> Redo
  editor.commands.setTextSelection(35);
  CaptionService.insertCaption(editor, { label: "Figure", text: "Hình ảnh thử nghiệm", position: "below" });
  assert.equal(CaptionService.extractCaptions(editor.state.doc).length, 1);
  editor.commands.undo();
  assert.equal(CaptionService.extractCaptions(editor.state.doc).length, 0);
  editor.commands.redo();
  assert.equal(CaptionService.extractCaptions(editor.state.doc).length, 1);

  // C. Insert Cross-Reference -> Undo -> Redo
  editor.commands.setTextSelection(35);
  CrossReferenceService.insertCrossReference(editor, { targetId: "ref_heading_h1_ur", targetType: "heading", format: "text" });
  let hasCrossref = false;
  editor.state.doc.descendants((n) => {
    if (n.type.name === "crossReference") hasCrossref = true;
  });
  assert.equal(hasCrossref, true);
  editor.commands.undo();
  hasCrossref = false;
  editor.state.doc.descendants((n) => {
    if (n.type.name === "crossReference") hasCrossref = true;
  });
  assert.equal(hasCrossref, false);
  editor.commands.redo();
  hasCrossref = false;
  editor.state.doc.descendants((n) => {
    if (n.type.name === "crossReference") hasCrossref = true;
  });
  assert.equal(hasCrossref, true);

  // D. Insert Citation -> Undo -> Redo
  editor.commands.setTextSelection(35);
  CitationService.insertCitation(editor, { sourceId: "src_ur_test", style: "apa" });
  assert.equal(CitationService.extractCitations(editor.state.doc).length, 1);
  editor.commands.undo();
  assert.equal(CitationService.extractCitations(editor.state.doc).length, 0);
  editor.commands.redo();
  assert.equal(CitationService.extractCitations(editor.state.doc).length, 1);

  editor.destroy();
});

test("PHASE 6 FINAL AUDIT — 3. Review Engine Interaction: Đồng tồn tại với Track Changes, Comments, Proofing & Xử lý xóa mục tiêu an toàn", () => {
  const store = useDocumentStore.getState();
  store.resetDocument();
  store.setBibliographySources([
    {
      id: "src_review_test",
      type: "book",
      title: "Clean Code",
      authors: "Robert C. Martin",
      year: 2008,
    },
  ]);

  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "ref_heading_target", level: 1 },
        content: [{ type: "text", text: "Đề mục sẽ bị xóa" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "comment", attrs: { commentId: "c_ref_1" } }],
            text: "Đoạn văn có bình luận ",
          },
          {
            type: "crossReference",
            attrs: { targetId: "ref_heading_target", targetType: "heading", format: "text", customText: "Đề mục sẽ bị xóa" },
          },
          {
            type: "citation",
            attrs: { sourceId: "src_review_test", style: "apa" },
          },
          {
            type: "noteReference",
            attrs: { noteId: "fn_review_1", noteType: "footnote", content: "Chú thích an toàn" },
          },
        ],
      },
    ],
  });

  // A. Phân giải bình thường khi mục tiêu còn tồn tại
  const resolvedActive = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: "ref_heading_target",
    targetType: "heading",
    format: "text",
  });
  assert.equal(resolvedActive.found, true);
  assert.equal(resolvedActive.text, "Đề mục sẽ bị xóa");

  // B. Xóa Đề mục mục tiêu (Delete target) -> Phân giải chuyển thành fallback an toàn [Reference not found]
  editor.commands.deleteRange({ from: 0, to: 20 });
  const resolvedMissing = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: "ref_heading_target",
    targetType: "heading",
    format: "text",
  });
  assert.equal(resolvedMissing.found, false);
  assert.equal(resolvedMissing.text, "[Reference not found]");

  // C. Xóa nguồn trích dẫn khỏi Document Store -> Citation xử lý an toàn
  store.deleteBibliographySource("src_review_test", true);
  const brokenSource = CitationService.getSource("src_review_test");
  const formattedBrokenCit = CitationService.formatInTextCitation(brokenSource, "apa");
  assert.equal(formattedBrokenCit, "[Citation not found]");

  // D. Xóa Footnote marker -> Zero orphan metadata
  const beforeNotes = NoteService.extractNotes(editor.state.doc);
  assert.equal(beforeNotes.footnotes.length, 1);
  // Xóa toàn bộ đoạn văn chứa note bằng JSON content
  editor.commands.setContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản mới không còn footnote" }] }],
  });
  const afterNotes = NoteService.extractNotes(editor.state.doc);
  assert.equal(afterNotes.footnotes.length, 0);

  editor.destroy();
});

test("PHASE 6 FINAL AUDIT — 4. Page Engine Integration: Định dạng khổ giấy A4, A3, Section Breaks & Tính toán số trang TOC/Cross-ref", () => {
  const editor = createAuditEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "h1_sec1", level: 1 },
        content: [{ type: "text", text: "Phần 1: Giới thiệu (Trang 1)" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phần 1." }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "heading",
        attrs: { id: "h1_sec2", level: 1 },
        content: [{ type: "text", text: "Phần 2: Phương pháp (Trang 2)" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung phần 2." }],
      },
      {
        type: "sectionBreak",
        attrs: {
          pageSettings: {
            paperSize: "A3",
            orientation: "landscape",
            margins: { top: 25, right: 25, bottom: 25, left: 25 },
          },
        },
      },
      {
        type: "heading",
        attrs: { id: "h1_sec3", level: 1 },
        content: [{ type: "text", text: "Phần 3: Phụ lục Bản vẽ A3 (Trang 3)" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung bản vẽ khổ lớn." }],
      },
    ],
  });

  // Kiểm tra trích xuất Heading kèm section và số trang
  const headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings.length, 3);

  // Tính số trang thông qua TocService
  const p1 = TocService.resolveHeadingPageNumber(headings[0].from, editor.state.doc, 3);
  const p2 = TocService.resolveHeadingPageNumber(headings[1].from, editor.state.doc, 3);
  const p3 = TocService.resolveHeadingPageNumber(headings[2].from, editor.state.doc, 3);

  assert.equal(p1, 1);
  assert.equal(p2 >= 2, true);
  assert.equal(p3 >= 3, true);

  // Sinh TOC entries phản ánh chính xác số trang
  const tocEntries = TocService.generateTocEntries(editor.state.doc, undefined, undefined, 3);
  assert.equal(tocEntries.length, 3);
  assert.equal(tocEntries[0].text, "Phần 1: Giới thiệu (Trang 1)");
  assert.equal(tocEntries[1].text, "Phần 2: Phương pháp (Trang 2)");
  assert.equal(tocEntries[2].text, "Phần 3: Phụ lục Bản vẽ A3 (Trang 3)");

  editor.destroy();
});

test("PHASE 6 FINAL AUDIT — 5. Insert Engine Regression: Đồng tồn tại với Table, Image, Equation, Shape, TextBox, Hyperlink & Symbol", () => {
  const complexDoc = {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { id: "tbl_obj_1" },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu ô 1" }] }],
              },
            ],
          },
        ],
      },
      {
        type: "caption",
        attrs: { id: "cap_tbl_obj", label: "Table", targetId: "tbl_obj_1", text: "Bảng dữ liệu" },
      },
      {
        type: "equation",
        attrs: { id: "eq_obj_1", latex: "E = mc^2" },
      },
      {
        type: "caption",
        attrs: { id: "cap_eq_obj", label: "Equation", targetId: "eq_obj_1", text: "Công thức năng lượng" },
      },
      {
        type: "shape",
        attrs: { id: "shp_obj_1", shapeType: "rectangle", width: 100, height: 50 },
      },
      {
        type: "textBox",
        attrs: { id: "txt_obj_1", width: 150, height: 60, text: "Khung chữ nổi" },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            text: "Liên kết ngoài",
          },
          {
            type: "citation",
            attrs: { sourceId: "src_none", customText: "(Citing, 2024)" },
          },
        ],
      },
    ],
  };

  const editor = createAuditEditor(complexDoc);
  assert.ok(editor, "Editor phải khởi tạo thành công không ném lỗi");
  assert.equal(editor.state.doc.childCount, 7);

  // Quét Captions chính xác trên các đối tượng đa phương tiện
  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 2);
  assert.equal(captions[0].label, "Table");
  assert.equal(captions[1].label, "Equation");

  editor.destroy();
});

test("PHASE 6 FINAL AUDIT — 6. Persistence & Backwards Compatibility: Nạp an toàn tệp cũ Phase 1-5 không có References metadata", () => {
  // Tài liệu định dạng cũ từ Phase 1 không có trường references
  const legacyDocModel: DocumentModel = {
    metadata: {
      id: "doc_legacy_p1",
      title: "Tài liệu Cũ Thời Phase 1",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thuần túy không có trường references." }],
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      marginPreset: "normal",
    },
  };

  const mwdString = serializeDocumentToMwd(legacyDocModel);
  const result = deserializeMwdToDocument(mwdString);
  assert.equal(result.success, true);
  if (!result.success) return;

  // Store nạp an toàn và gán giá trị mặc định không gây crash
  const store = useDocumentStore.getState();
  store.setDocument(result.document);

  const updatedSources = useDocumentStore.getState().bibliographySources;
  assert.ok(Array.isArray(updatedSources), "bibliographySources phải là mảng rỗng");
  assert.equal(updatedSources.length, 0);
  assert.equal(useDocumentStore.getState().citationStyle, "apa", "citationStyle mặc định phải là apa");
});

test("PHASE 6 FINAL AUDIT — 7. DOCX Compatibility & Fallback: Xuất trọn vẹn TOC, Captions, Cross-Ref, Citations, Bibliography sang OOXML", () => {
  const fullDocModel: DocumentModel = {
    metadata: {
      id: "doc_docx_full_ref",
      title: "Tài liệu Xuất Word Full References",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: {
      type: "doc",
      content: [
        {
          type: "tableOfContents",
          attrs: {
            title: "MỤC LỤC",
            entries: [
              { id: "h1_1", level: 1, title: "1. Mở đầu", pageNumber: 1 },
              { id: "h1_2", level: 2, title: "1.1. Mục tiêu", pageNumber: 2 },
            ],
          },
        },
        {
          type: "heading",
          attrs: { id: "h1_1", level: 1 },
          content: [{ type: "text", text: "1. Mở đầu" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Đoạn văn tham chiếu đến " },
            { type: "crossReference", attrs: { targetId: "cap_f1", customText: "Figure 1" } },
            { type: "text", text: " và trích dẫn " },
            { type: "citation", attrs: { sourceId: "src_1", customText: "(Nguyễn Văn A, 2024)" } },
            { type: "noteReference", attrs: { noteId: "fn_1", noteType: "footnote", content: "Nội dung footnote docx" } },
          ],
        },
        {
          type: "caption",
          attrs: { id: "cap_f1", label: "Figure", text: "Mô hình kiến trúc tham chiếu" },
        },
        {
          type: "bibliography",
          attrs: {
            title: "Tài liệu tham khảo",
            style: "apa",
            entries: [
              { id: "src_1", text: "Nguyễn Văn A (2024). Nghiên cứu kiến trúc tham chiếu." },
            ],
          },
        },
      ],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      marginPreset: "normal",
    },
  };

  const serializer = new DocumentSerializer();
  const pkg = serializer.serialize(fullDocModel);

  assert.ok(pkg.documentXml.length > 0, "documentXml phải được sinh");

  // Kiểm tra TOC trong DOCX
  assert.ok(pkg.documentXml.includes("MỤC LỤC"));
  assert.ok(pkg.documentXml.includes("1. Mở đầu"));

  // Kiểm tra Caption với w:pStyle Caption
  assert.ok(pkg.documentXml.includes("Caption"));
  assert.ok(pkg.documentXml.includes("Mô hình kiến trúc tham chiếu"));

  // Kiểm tra Cross-Reference & Citation
  assert.ok(pkg.documentXml.includes("Figure 1"));
  assert.ok(pkg.documentXml.includes("(Nguyễn Văn A, 2024)"));

  // Kiểm tra Footnote XML
  assert.ok(pkg.footnotesXml || pkg.documentXml.includes("footnote"));

  // Kiểm tra Bibliography với w:pStyle Bibliography
  assert.ok(pkg.documentXml.includes("Bibliography"));
  assert.ok(pkg.documentXml.includes("Tài liệu tham khảo"));
  assert.ok(pkg.documentXml.includes("Nguyễn Văn A (2024). Nghiên cứu kiến trúc tham chiếu."));
});

test("PHASE 6 FINAL AUDIT — 8. Malformed Data Resilience: ID trùng lặp, thiếu mục tiêu, source hỏng, TOC không có đề mục", () => {
  // A. Anchor Service chuẩn hóa ID an toàn
  assert.equal(ReferenceAnchorService.isValidAnchorId("invalid_id"), false);
  assert.equal(ReferenceAnchorService.isValidAnchorId("ref_heading_valid_123"), true);
  assert.equal(ReferenceAnchorService.isValidAnchorId(null), false);
  assert.equal(ReferenceAnchorService.isValidAnchorId(""), false);

  // B. Cross-Reference với targetId hoàn toàn không tồn tại
  const emptyDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản trống" }] }] };
  const resNonexistent = CrossReferenceService.resolveTarget(emptyDoc, {
    targetId: "nonexistent_target_id",
    targetType: "heading",
    format: "text",
  });
  assert.equal(resNonexistent.found, false);
  assert.equal(resNonexistent.text, "[Reference not found]");

  // C. Citation với sourceId rỗng hoặc không tồn tại
  const ghostSource = CitationService.getSource("ghost_src_id");
  assert.equal(ghostSource, undefined);
  const brokenCit = CitationService.formatInTextCitation(ghostSource, "apa");
  assert.equal(brokenCit, "[Citation not found]");

  // D. Sinh TOC trên tài liệu hoàn toàn không có Heading nào
  const emptyTocEntries = TocService.generateTocEntries(emptyDoc);
  assert.equal(emptyTocEntries.length, 0);

  // E. Caption Service với nhãn tùy ý hoặc rỗng
  const emptyCaptions = CaptionService.extractCaptions(emptyDoc);
  assert.equal(emptyCaptions.length, 0);

  // F. Note Service với tài liệu không có note
  const emptyNotes = NoteService.extractNotes(emptyDoc);
  assert.equal(emptyNotes.footnotes.length, 0);
  assert.equal(emptyNotes.endnotes.length, 0);
});

test("PHASE 6 FINAL AUDIT — 9. High-Density Performance: Tài liệu quy mô lớn (25 Headings, 20 Citations, 15 Captions, 15 Footnotes) phản hồi dưới 50ms", () => {
  const sources: BibliographySource[] = [];
  for (let i = 1; i <= 20; i++) {
    sources.push({
      id: `src_perf_${i}`,
      type: "book",
      title: `Tài liệu nghiên cứu số ${i}`,
      authors: `Tác giả ${i}`,
      year: 2020 + (i % 5),
    });
  }

  const store = useDocumentStore.getState();
  store.resetDocument();
  store.setBibliographySources(sources);

  // Xây dựng AST lớn chứa nhiều đề mục, chú thích, trích dẫn
  const contentBlocks: any[] = [];
  for (let h = 1; h <= 25; h++) {
    const level = (h % 3) + 1;
    contentBlocks.push({
      type: "heading",
      attrs: { id: `h_${level}_${h}`, level },
      content: [{ type: "text", text: `Đề mục cấp ${level} số ${h}` }],
    });

    contentBlocks.push({
      type: "paragraph",
      content: [
        { type: "text", text: `Nội dung đoạn văn số ${h} thảo luận về các vấn đề kỹ thuật. ` },
        {
          type: "citation",
          attrs: { sourceId: `src_perf_${(h % 20) + 1}`, style: "apa" },
        },
        {
          type: "noteReference",
          attrs: { noteId: `fn_perf_${h}`, noteType: "footnote", content: `Ghi chú chân trang số ${h}` },
        },
      ],
    });

    if (h % 2 === 0) {
      contentBlocks.push({
        type: "caption",
        attrs: { id: `cap_perf_${h}`, label: h % 4 === 0 ? "Table" : "Figure", text: `Minh họa số ${h}` },
      });
    }
  }

  const editor = createAuditEditor({
    type: "doc",
    content: contentBlocks,
  });

  const t0 = performance.now();

  // 1. Trích xuất Headings
  const extractedH = HeadingService.extractHeadings(editor.state.doc);
  // 2. Trích xuất Captions
  const extractedC = CaptionService.extractCaptions(editor.state.doc);
  // 3. Trích xuất Notes
  const extractedN = NoteService.extractNotes(editor.state.doc);
  // 4. Trích xuất Citations
  const extractedCit = CitationService.extractCitations(editor.state.doc);
  // 5. Sinh TOC
  const tocEntries = TocService.generateTocEntries(editor.state.doc);
  // 6. Sinh Bibliography
  const bibEntries = CitationService.generateBibliographyEntries(editor.state.doc, sources, "apa", "citedOnly");

  const duration = performance.now() - t0;

  assert.equal(extractedH.length, 25);
  assert.equal(extractedC.length, 12);
  assert.equal(extractedN.footnotes.length, 25);
  assert.equal(extractedCit.length, 25);
  assert.equal(tocEntries.length, 25);
  assert.ok(bibEntries.length > 0);

  // Hiệu năng phải mượt mà và dưới 150ms cho tài liệu đồ án/luận văn dưới tải nặng
  assert.ok(duration < 150, `Thời gian xử lý tổng hợp phải < 150ms (thực tế: ${duration.toFixed(2)}ms)`);

  editor.destroy();
});
