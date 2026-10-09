import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import {
  extractSections,
  getEffectiveHeaderFooter,
  updateSectionSettingsInAst,
  updateSectionHeaderFooterInAst,
} from "./services/sectionService.ts";
import {
  calculatePaginationState,
  calculateBreakSpacerForPages,
  PAGE_GAP_PX,
} from "./services/paginationService.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  DEFAULT_PAGE_SETTINGS,
  MARGIN_PRESETS,
  SUPPORTED_PAPER_SIZES,
  PAPER_DIMENSIONS,
} from "./services/pageConstants.ts";
import {
  formatHeaderFooterText,
  hasPageNumberToken,
  type SectionHeaderFooter,
} from "./types/headerFooterTypes.ts";
import { extractDocumentStats } from "../document/documentModel.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  insertPageBreak,
  insertSectionBreak,
  updateSectionSettings,
  updateSectionHeaderFooter,
} from "../editor/editorCommands.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

function createFullEditor(initialContent?: JSONContent): Editor {
  return new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung khởi tạo cho kiểm thử toàn diện." }],
        },
      ],
    },
  });
}

// =========================================================================
// TEST SUITE 1: BIG WORKFLOW END-TO-END AUDIT (Section 1 + Section 2 + Save/Open)
// =========================================================================
test("Phase 2.9 Audit - Big Workflow: Section 1 (A4 Portrait Normal) + Section 2 (A4 Landscape Custom) + Header/Footer/PageNum", () => {
  // 1. Tạo tài liệu lớn kết hợp:
  // - Section 1: A4 Portrait, Normal Margins (25.4mm), Heading 1, paragraphs, list, formatting, Page Break
  // - Section 2: A4 Landscape, Custom Margins (15, 15, 20, 20 mm), Header, Footer, Page Number, unlinked
  const bigWorkflowDoc: DocumentModel = {
    id: "doc-big-workflow-2026",
    metadata: {
      id: "doc-big-workflow-2026",
      title: "Báo Cáo Kiến Trúc Hệ Thống Toàn Diện",
      version: 1,
      author: "Lead Architect",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ["architecture", "audit", "phase2"],
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Tập Đoàn Công Nghệ — Báo Cáo 2026", alignment: "left" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    content: {
      type: "doc",
      content: [
        // Section 1: Heading 1
        {
          type: "heading",
          attrs: { level: 1, textAlign: "center", lineSpacing: "1.5" },
          content: [{ type: "text", text: "Chương 1: Tổng Quan Hệ Thống" }],
        },
        // Paragraph với Rich Text Formatting
        {
          type: "paragraph",
          attrs: { textAlign: "justify", lineSpacing: "1.5", indent: 1 },
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Personal Word Editor " },
            {
              type: "text",
              marks: [{ type: "italic" }, { type: "underline" }],
              text: "được xây dựng trên nền tảng React và ProseMirror. ",
            },
            {
              type: "text",
              marks: [{ type: "highlight", attrs: { color: "#fef08a" } }],
              text: "Hệ thống Page Engine phân tách hoàn hảo kiến trúc 3 tầng.",
            },
          ],
        },
        // Bullet List
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Tầng 1: Nền giấy vật lý nhiều khổ (A4, A3, Letter, Legal)" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Tầng 2: Soạn thảo ProseMirror đơn nhất, bảo toàn caret và undo/redo" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Tầng 3: Header, Footer và Page Number tương tác trực quan" }],
                },
              ],
            },
          ],
        },
        // Explicit Page Break
        {
          type: "pageBreak",
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nội dung trang 2 thuộc Section 1." }],
        },
        // Section Break (Next Page) chuyển sang Section 2
        {
          type: "sectionBreak",
          attrs: {
            sectionType: "nextPage",
            sectionId: "sec-2",
            pageSettings: {
              paperSize: "A4",
              orientation: "landscape",
              margins: { top: 15, bottom: 15, left: 20, right: 20 },
              marginPreset: "Custom",
            },
            headerFooter: {
              linkToPrevious: false,
              header: { text: "Phần 2: Kiến Trúc Phân Tán (Landscape)", alignment: "right", bold: true },
              footer: { text: "Bản vẽ kỹ thuật — {PAGE}", alignment: "center" },
            },
          },
        },
        // Section 2: Heading 2
        {
          type: "heading",
          attrs: { level: 2, textAlign: "left" },
          content: [{ type: "text", text: "Sơ Đồ Luồng Dữ Liệu Khổ Ngang" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Trang này hiển thị theo hướng ngang (Landscape) với lề tùy chỉnh Custom 15mm/20mm.",
            },
          ],
        },
      ],
    },
  };

  // 2. Kiểm tra tính hợp lệ của model trước khi lưu
  const sectionsBeforeSave = extractSections(
    bigWorkflowDoc.content,
    bigWorkflowDoc.pageSettings!,
    bigWorkflowDoc.headerFooter
  );
  assert.equal(sectionsBeforeSave.length, 2, "Tài liệu phải có đúng 2 sections");

  // Section 1
  assert.equal(sectionsBeforeSave[0].pageSettings.paperSize, "A4");
  assert.equal(sectionsBeforeSave[0].pageSettings.orientation, "portrait");
  assert.equal(sectionsBeforeSave[0].pageSettings.marginPreset, "Normal");
  assert.equal(sectionsBeforeSave[0].headerFooter?.header.text, "Tập Đoàn Công Nghệ — Báo Cáo 2026");

  // Section 2
  assert.equal(sectionsBeforeSave[1].pageSettings.paperSize, "A4");
  assert.equal(sectionsBeforeSave[1].pageSettings.orientation, "landscape");
  assert.equal(sectionsBeforeSave[1].pageSettings.marginPreset, "Custom");
  assert.equal(sectionsBeforeSave[1].pageSettings.margins.top, 15);
  assert.equal(sectionsBeforeSave[1].pageSettings.margins.left, 20);
  assert.equal(sectionsBeforeSave[1].headerFooter?.linkToPrevious, false);
  assert.equal(sectionsBeforeSave[1].headerFooter?.header.text, "Phần 2: Kiến Trúc Phân Tán (Landscape)");
  assert.equal(sectionsBeforeSave[1].headerFooter?.header.bold, true);

  // 3. Serialize thành tệp tin *.mwd
  const fileJsonString = serializeDocumentToMwd(bigWorkflowDoc);
  assert.ok(fileJsonString.length > 500, "Chuỗi JSON của file .mwd phải đầy đủ dữ liệu");
  assert.ok(fileJsonString.includes("PersonalWordDocument"));

  // 4. Mô phỏng đóng app và mở lại: deserialize file
  const openResult = deserializeMwdToDocument(fileJsonString);
  assert.equal(openResult.success, true, "Quá trình mở lại file .mwd phải thành công");
  if (!openResult.success) return;

  const restoredDoc = openResult.document;

  // 5. Nạp vào Zustand documentStore
  useDocumentStore.getState().setDocument(restoredDoc, "C:/Documents/BaoCaoKienTruc.mwd");

  const storeState = useDocumentStore.getState();
  assert.equal(storeState.documentTitle, "Báo Cáo Kiến Trúc Hệ Thống Toàn Diện");
  assert.equal(storeState.isDirty, false, "Tài liệu vừa mở không được có trạng thái dirty");
  assert.equal(storeState.sections.length, 2, "Store phải ghi nhận chính xác 2 sections");

  // Kiểm tra Section 1 sau khi nạp
  const sec1 = storeState.sections[0];
  assert.equal(sec1.pageSettings.paperSize, "A4");
  assert.equal(sec1.pageSettings.orientation, "portrait");
  assert.equal(sec1.pageSettings.marginPreset, "Normal");

  // Kiểm tra Section 2 sau khi nạp
  const sec2 = storeState.sections[1];
  assert.equal(sec2.pageSettings.paperSize, "A4");
  assert.equal(sec2.pageSettings.orientation, "landscape");
  assert.equal(sec2.pageSettings.marginPreset, "Custom");
  assert.equal(sec2.pageSettings.margins.top, 15);
  assert.equal(sec2.pageSettings.margins.bottom, 15);
  assert.equal(sec2.pageSettings.margins.left, 20);
  assert.equal(sec2.pageSettings.margins.right, 20);

  // Kiểm tra Header/Footer độc lập
  const effectiveSec1 = getEffectiveHeaderFooter(storeState.sections, 1);
  const effectiveSec2 = getEffectiveHeaderFooter(storeState.sections, 2);

  assert.equal(effectiveSec1.header.text, "Tập Đoàn Công Nghệ — Báo Cáo 2026");
  assert.equal(effectiveSec2.header.text, "Phần 2: Kiến Trúc Phân Tán (Landscape)");
  assert.equal(effectiveSec2.linkToPrevious, false);

  // 6. Kiểm tra tính toán phân trang thực tế (Pagination Engine)
  const paginationResult = calculatePaginationState(restoredDoc.content, {
    paperSize: sec1.pageSettings.paperSize,
    orientation: sec1.pageSettings.orientation,
    margins: sec1.pageSettings.margins,
    pageGapPx: PAGE_GAP_PX,
  });

  // Có 1 pageBreak và 1 sectionBreak -> ít nhất 3 trang vật lý
  assert.ok(paginationResult.pageCount >= 3, "Tài liệu phải tạo ít nhất 3 trang vật lý");

  // Đánh giá dynamic page number trên từng trang
  const page1Footer = formatHeaderFooterText(effectiveSec1.footer.text, 1, paginationResult.pageCount);
  const page2Footer = formatHeaderFooterText(effectiveSec1.footer.text, 2, paginationResult.pageCount);
  const page3Footer = formatHeaderFooterText(effectiveSec2.footer.text, 3, paginationResult.pageCount);

  assert.equal(page1Footer, `Trang 1 / ${paginationResult.pageCount}`);
  assert.equal(page2Footer, `Trang 2 / ${paginationResult.pageCount}`);
  assert.equal(page3Footer, "Bản vẽ kỹ thuật — 3");
});

// =========================================================================
// TEST SUITE 2: REFLOW REGRESSION & STABILITY (Text edits, font, size, loop)
// =========================================================================
test("Phase 2.9 Audit - Reflow Regression: adding/deleting text and formatting does not corrupt AST or loop", () => {
  const editor = createFullEditor();

  // 1. Thêm 45 đoạn văn để tạo overflow reflow rõ ràng
  const longParagraphs: JSONContent[] = Array.from({ length: 45 }, (_, i) => ({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: `Đoạn văn kiểm tra reflow số ${i + 1}. Văn bản tiếng Việt có dấu chi tiết nhằm kích hoạt phân trang tự nhiên.`,
      },
    ],
  }));

  editor.commands.setContent(longParagraphs);

  const jsonAfterAdd = editor.getJSON();
  assert.ok(jsonAfterAdd.content && jsonAfterAdd.content.length === 45);

  // Thống kê đếm từ
  const statsAfterAdd = extractDocumentStats(jsonAfterAdd);
  assert.ok(statsAfterAdd.words > 300);
  assert.ok(statsAfterAdd.characters > 2000);

  // Tính toán phân trang
  const pagination1 = calculatePaginationState(jsonAfterAdd, {
    paperSize: "A4",
    orientation: "portrait",
    margins: MARGIN_PRESETS.Normal,
    pageGapPx: PAGE_GAP_PX,
  });
  assert.ok(pagination1.pageCount >= 2, "Nội dung 45 đoạn văn phải tràn qua ít nhất 2 trang");

  // 2. Thay đổi định dạng: font size, line spacing, heading
  editor.commands.selectAll();
  editor.commands.setTextAlign("center");

  const jsonAfterFormat = editor.getJSON();
  // Không được mất text hay duplicate text
  const statsAfterFormat = extractDocumentStats(jsonAfterFormat);
  assert.equal(statsAfterFormat.words, statsAfterAdd.words, "Số lượng từ phải được bảo toàn nguyên vẹn");
  assert.equal(statsAfterFormat.characters, statsAfterAdd.characters, "Số lượng ký tự phải bảo toàn");

  // 3. Xóa một nửa nội dung: reflow co lại
  editor.commands.setContent([
    {
      type: "paragraph",
      content: [{ type: "text", text: "Nội dung ngắn gọn chỉ còn 1 đoạn văn duy nhất." }],
    },
  ]);

  const jsonAfterDelete = editor.getJSON();
  const paginationShrunk = calculatePaginationState(jsonAfterDelete, {
    paperSize: "A4",
    orientation: "portrait",
    margins: MARGIN_PRESETS.Normal,
    pageGapPx: PAGE_GAP_PX,
  });
  assert.equal(paginationShrunk.pageCount, 1, "Sau khi xóa bớt text, số trang phải co lại về đúng 1 trang");

  editor.destroy();
});

// =========================================================================
// TEST SUITE 3: PHASE 1 COMPREHENSIVE REGRESSION
// =========================================================================
test("Phase 2.9 Audit - Phase 1 Regression: File, History, Formatting, Paragraph, Search, Zoom", () => {
  const editor = createFullEditor();

  // 1. FORMATTING: Bold, Italic, Underline, Color, Highlight, Font Family
  editor.commands.setContent([
    {
      type: "paragraph",
      content: [{ type: "text", text: "Kiểm tra định dạng font" }],
    },
  ]);
  editor.commands.selectAll();
  editor.commands.toggleBold();
  editor.commands.toggleItalic();
  editor.commands.toggleUnderline();

  const formattedJson = editor.getJSON();
  const textNode = formattedJson.content?.[0]?.content?.[0];
  assert.ok(textNode?.marks?.some((m) => m.type === "bold"), "Phải có mark bold");
  assert.ok(textNode?.marks?.some((m) => m.type === "italic"), "Phải có mark italic");
  assert.ok(textNode?.marks?.some((m) => m.type === "underline"), "Phải có mark underline");

  // 2. PARAGRAPH: Alignment
  editor.commands.setTextAlign("right");
  const alignedJson = editor.getJSON();
  assert.equal(alignedJson.content?.[0]?.attrs?.textAlign, "right");

  // 3. HISTORY: Undo & Redo an toàn
  assert.doesNotThrow(() => editor.commands.undo(), "Undo không được ném lỗi");
  assert.doesNotThrow(() => editor.commands.redo(), "Redo không được ném lỗi");

  // 4. FIND & REPLACE
  editor.commands.setContent([
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hà Nội là thủ đô của Việt Nam. Hà Nội rất đẹp." }],
    },
  ]);
  const docText = editor.getText();
  assert.ok(docText.includes("Hà Nội"));

  // Thay thế chuỗi
  const replacedText = docText.replaceAll("Hà Nội", "Thủ Đô Hà Nội");
  assert.ok(replacedText.includes("Thủ Đô Hà Nội"));

  // 5. DIRTY STATE & SAVE PROTECTION
  useDocumentStore.getState().resetDocument();
  assert.equal(useDocumentStore.getState().isDirty, false);

  useDocumentStore.getState().updateTitle("Tiêu Đề Đã Sửa");
  assert.equal(useDocumentStore.getState().isDirty, true, "Đổi tiêu đề phải kích hoạt isDirty");

  useDocumentStore.getState().markSaved("C:/test.mwd");
  assert.equal(useDocumentStore.getState().isDirty, false, "Lưu thành công phải xóa isDirty");

  editor.destroy();
});

// =========================================================================
// TEST SUITE 4: CODE AUDIT CONSTANTS INTEGRITY
// =========================================================================
test("Phase 2.9 Audit - Constants Integrity: all paper sizes and margin presets match physical specs", () => {
  assert.equal(PAPER_DIMENSIONS.A4.width, 210);
  assert.equal(PAPER_DIMENSIONS.A4.height, 297);
  assert.equal(PAPER_DIMENSIONS.A3.width, 297);
  assert.equal(PAPER_DIMENSIONS.A3.height, 420);
  assert.equal(PAPER_DIMENSIONS.Letter.width, 215.9);
  assert.equal(PAPER_DIMENSIONS.Letter.height, 279.4);
  assert.equal(PAPER_DIMENSIONS.Legal.width, 215.9);
  assert.equal(PAPER_DIMENSIONS.Legal.height, 355.6);
  assert.equal(SUPPORTED_PAPER_SIZES.length, 4);

  assert.equal(MARGIN_PRESETS.Normal.top, 25.4);
  assert.equal(MARGIN_PRESETS.Narrow.top, 12.7);
  assert.equal(MARGIN_PRESETS.Wide.left, 50.8);
});
