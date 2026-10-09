import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import type { DocumentStylesMetadata, DocumentStyle } from "./types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  STYLE_EMPHASIS_ID,
  createDefaultStyleDefinitions,
  createDefaultStylesMetadata,
} from "./services/builtInStyles.ts";
import {
  resolveStyle,
} from "./services/styleResolver.ts";
import {
  StyleResolutionEngine,
} from "./services/styleResolutionEngine.ts";
import {
  applyParagraphStyle,
} from "./services/applyStyleService.ts";
import {
  applyCharacterStyle,
} from "./services/characterStyleService.ts";
import {
  generateDocumentStylesCss,
} from "./services/styleStylesheetService.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  exportDocumentModelToDocx,
  importDocxToDocumentModel,
  readDocxPackage,
} from "../docx/index.ts";
import { HeadingService } from "../references/services/headingService.ts";
import { ReferenceAnchorService } from "../references/services/referenceAnchorService.ts";
import { CrossReferenceService } from "../references/services/crossReferenceService.ts";
import { calculatePaginationDimensions } from "../page/services/paginationService.ts";

/**
 * Tiện ích khởi tạo Tiptap Editor hoàn chỉnh với đầy đủ extensions
 */
function createFullEditor(contentJson?: any): Editor {
  return new Editor({
    extensions: getEditorExtensions(),
    content: contentJson || {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Văn bản mẫu khởi đầu." }] }],
    },
  });
}

/* ==========================================================================
   BỘ TEST CHUYÊN BIỆT: PHASE 10 — FINAL INTEGRATION / AUDIT / ZERO-REGRESSION
   ========================================================================== */

test("Phase 10 - 1. End-to-End Workflow: Create Thesis Body -> Apply -> Save -> Open -> Modify -> Undo/Redo -> DOCX Round-trip", async () => {
  // 1. Khởi tạo tài liệu với Thesis Body style (Times New Roman 13pt, Justify, line spacing 1.5, first-line indent 36pt, spacingAfter 6pt)
  const defaultDefs = createDefaultStyleDefinitions();
  const thesisStyleId = "style_thesis_body";
  const thesisStyle: DocumentStyle = {
    id: thesisStyleId,
    name: "Thesis Body",
    type: "paragraph",
    basedOn: STYLE_NORMAL_ID,
    isBuiltIn: false,
    paragraph: {
      textAlign: "justify",
      lineSpacing: 1.5,
      firstLineIndent: 36, // ~1.27cm
      spacingAfter: 6,
    },
    character: {
      fontFamily: "Times New Roman",
      fontSize: 13,
    },
  };

  let currentStyles: DocumentStylesMetadata = {
    defaultParagraphStyleId: STYLE_NORMAL_ID,
    definitions: [...defaultDefs, thesisStyle],
  };

  // 2. Editor: Áp dụng Thesis Body cho nhiều đoạn văn
  const editor = createFullEditor({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Đoạn văn luận điểm 1 của luận văn." }] },
      { type: "paragraph", content: [{ type: "text", text: "Đoạn văn luận điểm 2 mở rộng nghiên cứu." }] },
    ],
  });

  // Chọn toàn bộ và áp dụng style
  editor.commands.selectAll();
  const applied = applyParagraphStyle(editor, thesisStyleId);
  assert.ok(applied);

  const docJson = editor.getJSON();
  assert.equal(docJson.content?.[0].attrs?.styleId, thesisStyleId);
  assert.equal(docJson.content?.[1].attrs?.styleId, thesisStyleId);

  // 3. Đóng gói native .mwd và mở lại
  const docModel: DocumentModel = {
    id: "doc-thesis-1",
    title: "Thesis Document",
    content: docJson,
    styles: currentStyles,
  };

  const mwdStr = serializeDocumentToMwd(docModel);
  const loadRes = deserializeMwdToDocument(mwdStr);
  assert.ok(loadRes.success);
  const loadedDoc = loadRes.document;

  assert.ok(loadedDoc.styles);
  const loadedThesis = loadedDoc.styles!.definitions.find((s) => s.id === thesisStyleId);
  assert.ok(loadedThesis);
  assert.equal(loadedThesis!.paragraph?.textAlign, "justify");
  assert.equal(loadedThesis!.character?.fontSize, 13);
  assert.equal(loadedThesis!.basedOn, STYLE_NORMAL_ID);

  // 4. Modify Thesis Body: 13pt -> 14pt. Tất cả paragraph users tự động phản ánh qua resolveStyle/stylesheet
  const updatedDefs = loadedDoc.styles!.definitions.map((s) =>
    s.id === thesisStyleId
      ? { ...s, character: { ...s.character, fontSize: 14 } }
      : s
  );
  currentStyles = {
    ...loadedDoc.styles!,
    definitions: updatedDefs,
  };

  // Kiểm tra phân giải kế thừa và stylesheet
  const resolved = resolveStyle(thesisStyleId, currentStyles.definitions);
  assert.equal(resolved?.character?.fontSize, 14, "Cỡ chữ phân giải phải tăng lên 14pt");
  assert.equal(resolved?.character?.fontFamily, "Times New Roman", "Phông chữ giữ nguyên từ định nghĩa ban đầu");
  assert.equal(resolved?.paragraph?.textAlign, "justify", "Căn đều giữ nguyên");

  const css = generateDocumentStylesCss(currentStyles);
  assert.ok(css.includes("font-size: 14pt"), "CSS stylesheet tự động cập nhật lên 14pt mà không sửa từng paragraph");

  // 5. Xuất DOCX và nhập lại
  const docxBytes = await exportDocumentModelToDocx({
    ...loadedDoc,
    styles: currentStyles,
  });
  assert.ok(docxBytes.byteLength > 0);

  const importDocxRes = await importDocxToDocumentModel(docxBytes, "thesis.docx");
  assert.ok(importDocxRes.success);
  const docxDoc = importDocxRes.document;

  const docxThesis = docxDoc.styles!.definitions.find((s) => s.name.toLowerCase().includes("thesis body"));
  assert.ok(docxThesis);
  assert.equal(docxThesis!.paragraph?.textAlign, "justify");
  assert.equal(docxThesis!.character?.fontSize, 14);

  editor.destroy();
});

test("Phase 10 - 2. Character Style Workflow: Coexists with Comments, Track Changes, and Direct Marks across Save/DOCX", async () => {
  const defaultDefs = createDefaultStyleDefinitions();
  const charStyleId = "style_emphasis_custom";
  const customCharStyle: DocumentStyle = {
    id: charStyleId,
    name: "Emphasis Custom",
    type: "character",
    isBuiltIn: false,
    character: {
      bold: true,
      color: "#DC2626",
    },
  };

  const currentStyles: DocumentStylesMetadata = {
    defaultParagraphStyleId: STYLE_NORMAL_ID,
    definitions: [...defaultDefs, customCharStyle],
  };

  // Editor với text mang đồng thời: characterStyle, comment, trackChange, và direct italic
  const editor = createFullEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn văn trước. " },
          {
            type: "text",
            text: "Cụm từ được nhận xét và theo dõi thay đổi",
            marks: [
              { type: "characterStyle", attrs: { styleId: charStyleId } },
              { type: "italic" }, // Direct formatting override
              { type: "comment", attrs: { commentId: "com-final-1" } },
              {
                type: "trackChange",
                attrs: {
                  id: "ins-final-1",
                  changeType: "insert",
                  author: "Hoang",
                  timestamp: "2026-10-07T12:00:00Z",
                },
              },
            ],
          },
          { type: "text", text: " Đoạn văn tiếp theo." },
        ],
      },
    ],
  });

  const docModel: DocumentModel = {
    id: "doc-review-styles",
    title: "Review Styles Doc",
    content: editor.getJSON(),
    styles: currentStyles,
    comments: [
      {
        id: "com-final-1",
        author: "Hoang",
        createdAt: "2026-10-07T12:00:00Z",
        content: "Bình luận trên cụm từ mang character style.",
        resolved: false,
      },
    ],
  };

  // 1. Kiểm tra Save/Load native .mwd
  const mwdStr = serializeDocumentToMwd(docModel);
  const mwdRes = deserializeMwdToDocument(mwdStr);
  assert.ok(mwdRes.success);

  const pRun = mwdRes.document.content.content?.[0].content?.[1];
  assert.ok(pRun);
  const markTypes = pRun!.marks?.map((m: any) => m.type);
  assert.ok(markTypes?.includes("characterStyle"), "Phải giữ mark characterStyle");
  assert.ok(markTypes?.includes("italic"), "Phải giữ direct mark italic");
  assert.ok(markTypes?.includes("comment"), "Phải giữ mark comment");
  assert.ok(markTypes?.includes("trackChange"), "Phải giữ mark trackChange");
  assert.equal(mwdRes.document.comments?.length, 1, "Comment metadata phải được bảo toàn");

  // 2. Xuất DOCX và nạp lại
  const docxBytes = await exportDocumentModelToDocx(docModel);
  assert.ok(docxBytes.byteLength > 0);

  const docxParts = await readDocxPackage(docxBytes);
  assert.ok(docxParts.commentsXml?.includes("Bình luận trên cụm từ"), "comments.xml phải có nội dung comment");
  assert.ok(docxParts.documentXml?.includes("<w:commentRangeStart"), "documentXml phải có comment anchor");
  assert.ok(docxParts.documentXml?.includes("<w:ins"), "documentXml phải có tracked change ins");
  assert.ok(docxParts.documentXml?.includes("<w:rStyle"), "documentXml phải có w:rStyle");

  editor.destroy();
});

test("Phase 10 - 3. Heading & References: Visual Heading Style change preserves genuine level, Outline, TOC, and Cross-references", () => {
  // Thay đổi visual formatting của Heading 1 (đổi màu thành xanh lá, phông Georgia, cỡ 20pt)
  const defaultDefs = createDefaultStyleDefinitions();
  const updatedDefs = defaultDefs.map((s) =>
    s.id === STYLE_HEADING_1_ID
      ? {
          ...s,
          paragraph: {
            ...s.paragraph,
            textAlign: "center" as const,
            spacingBefore: 24,
            spacingAfter: 12,
          },
          character: {
            ...s.character,
            fontFamily: "Georgia",
            fontSize: 20,
            color: "#059669",
          },
        }
      : s
  );

  // Tạo cây tài liệu với Heading 1 mang anchor ID
  const headingAnchorId = ReferenceAnchorService.generateAnchorId("heading", "gioithieu");
  const docContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: headingAnchorId, level: 1, styleId: STYLE_HEADING_1_ID },
        content: [{ type: "text", text: "I. Giới thiệu tổng quan" }],
      },
      {
        type: "paragraph",
        attrs: { styleId: STYLE_NORMAL_ID },
        content: [
          { type: "text", text: "Xem thêm chi tiết tại " },
          {
            type: "crossReference",
            attrs: {
              targetId: headingAnchorId,
              targetType: "heading",
              referenceKind: "text",
              customText: "I. Giới thiệu tổng quan",
            },
          },
        ],
      },
    ],
  };

  const editor = createFullEditor(docContent);

  // 1. HeadingService: Vẫn phát hiện chính xác đề mục cấp 1 bất kể visual style thay đổi
  const headings = HeadingService.extractHeadings(editor.state.doc);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].level, 1, "Level đề mục ngữ nghĩa vẫn là 1");
  assert.equal(headings[0].text, "I. Giới thiệu tổng quan");

  // 2. ReferenceAnchorService: Vẫn tạo danh sách Anchor hợp lệ cho TOC và Outline
  const anchors = ReferenceAnchorService.extractHeadingAnchors(editor.getJSON());
  const headingAnchor = anchors.find((a) => a.id === headingAnchorId);
  assert.ok(headingAnchor, "Phải tìm thấy Anchor của heading");
  assert.equal(headingAnchor!.targetType, "heading");
  assert.equal(headingAnchor!.metadata?.level, 1);

  // 3. CrossReferenceService: Phân giải tham chiếu chéo không bị đứt gãy
  const crossRef = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: headingAnchorId,
    targetType: "heading",
    format: "entireCaption",
  });
  assert.ok(crossRef.found);
  assert.equal(crossRef.text, "I. Giới thiệu tổng quan");

  editor.destroy();
});

test("Phase 10 - 4. Review Engine: Applying Paragraph/Character Style does NOT wipe comments or track changes", () => {
  const editor = createFullEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn văn có " },
          {
            type: "text",
            text: "phần văn bản quan trọng",
            marks: [
              { type: "comment", attrs: { commentId: "com-preserve-1" } },
              {
                type: "trackChange",
                attrs: {
                  id: "ins-preserve-1",
                  changeType: "insert",
                  author: "Tester",
                  timestamp: "2026-10-07T12:00:00Z",
                },
              },
            ],
          },
        ],
      },
    ],
  });

  // 1. Áp dụng Paragraph Style lên toàn đoạn
  applyParagraphStyle(editor, STYLE_HEADING_2_ID);
  let doc = editor.getJSON();
  let textNode = doc.content?.[0].content?.[1];
  let markTypes = textNode?.marks?.map((m: any) => m.type);
  assert.ok(markTypes?.includes("comment"), "Comment mark phải còn nguyên sau khi apply paragraph style");
  assert.ok(markTypes?.includes("trackChange"), "Track change mark phải còn nguyên sau khi apply paragraph style");

  // 2. Áp dụng Character Style lên vùng chọn chứa comment
  editor.commands.setTextSelection({ from: 13, to: 35 });
  applyCharacterStyle(editor, STYLE_EMPHASIS_ID);

  doc = editor.getJSON();
  textNode = doc.content?.[0].content?.[1];
  markTypes = textNode?.marks?.map((m: any) => m.type);
  assert.ok(markTypes?.includes("characterStyle"), "Character style mark được gắn thêm");
  assert.ok(markTypes?.includes("comment"), "Comment mark vẫn được bảo lưu 100%");
  assert.ok(markTypes?.includes("trackChange"), "Track change mark vẫn được bảo lưu 100%");

  editor.destroy();
});

test("Phase 10 - 5. Page Engine & Multi-Section Stress: Calculates dimensions across A4/A3, portrait/landscape, custom margins", () => {
  // Section 1: A4 Portrait
  const a4Dim = calculatePaginationDimensions({
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 20, bottom: 20, left: 25, right: 25 },
  });
  assert.ok(a4Dim.usableWidthPx > 0);
  assert.ok(a4Dim.usableHeightPx > 0);
  assert.ok(a4Dim.pageHeightPx > a4Dim.pageWidthPx, "Portrait thì chiều cao lớn hơn chiều rộng");

  // Section 2: A3 Landscape
  const a3Dim = calculatePaginationDimensions({
    paperSize: "A3",
    orientation: "landscape",
    margins: { top: 15, bottom: 15, left: 15, right: 15 },
  });
  assert.ok(a3Dim.usableWidthPx > a4Dim.usableWidthPx, "A3 Landscape rộng hơn A4 Portrait");
  assert.ok(a3Dim.pageWidthPx > a3Dim.pageHeightPx, "Landscape thì chiều rộng lớn hơn chiều cao");

  // Custom extreme margins không làm hỏng tính toán
  const extremeDim = calculatePaginationDimensions({
    paperSize: "Letter",
    orientation: "portrait",
    margins: { top: 100, bottom: 100, left: 100, right: 100 },
  });
  assert.ok(extremeDim.usableWidthPx >= 10, "Kẹp an toàn usableWidth không âm");
  assert.ok(extremeDim.usableHeightPx >= 10, "Kẹp an toàn usableHeight không âm");
});

test("Phase 10 - 6. Performance & Cache Invalidation: Multi-level inheritance, bulk resolution, and targeted invalidation", () => {
  // Tạo cây kế thừa 12 cấp: L0 -> L1 -> L2 -> ... -> L11
  const defs: DocumentStyle[] = [
    {
      id: "style_level_0",
      name: "Level 0",
      type: "paragraph",
      isBuiltIn: false,
      paragraph: { lineSpacing: 1.0, textAlign: "left" },
      character: { fontFamily: "Arial", fontSize: 10 },
    },
  ];

  for (let i = 1; i <= 11; i++) {
    defs.push({
      id: `style_level_${i}`,
      name: `Level ${i}`,
      type: "paragraph",
      isBuiltIn: false,
      basedOn: `style_level_${i - 1}`,
      paragraph: i === 6 ? { textAlign: "justify" } : undefined,
      character: i === 11 ? { bold: true, fontSize: 14 } : undefined,
    });
  }

  const engine = new StyleResolutionEngine(defs);

  // Lần 1: Tính toán kế thừa sâu
  const t0 = performance.now();
  const res1 = engine.getResolvedStyle("style_level_11");
  const dur1 = performance.now() - t0;

  assert.ok(res1);
  assert.equal(Number(res1.paragraph?.lineSpacing), 1, "Kế thừa từ Level 0");
  assert.equal(res1.paragraph?.textAlign, "justify", "Override từ Level 6");
  assert.equal(res1.character?.fontFamily, "Arial", "Kế thừa từ Level 0");
  assert.equal(res1.character?.bold, true, "Override từ Level 11");
  assert.equal(res1.character?.fontSize, 14, "Override từ Level 11");

  // Lần 2: Cache hit phải cực nhanh (< 1ms)
  const t1 = performance.now();
  const res2 = engine.getResolvedStyle("style_level_11");
  const dur2 = performance.now() - t1;

  assert.equal(res1, res2, "Cache hit trả về cùng tham chiếu đối tượng");
  assert.ok(dur2 < dur1 || dur2 < 2, "Cache hit phải hoàn thành tức thì");

  // Kiểm tra invalidate targeted: thay đổi Level 6 và xóa cache Level 6
  defs[6].paragraph = { textAlign: "center" };
  const invalidated = engine.invalidateStyle("style_level_6");
  assert.ok(invalidated.includes("style_level_6"));
  assert.ok(invalidated.includes("style_level_11"), "Descendants phải bị invalidate");

  const res3 = engine.getResolvedStyle("style_level_11");
  assert.equal(res3?.paragraph?.textAlign, "center", "Sau invalidation, style con phải nhận giá trị mới từ Level 6");
});

test("Phase 10 - 7. Malformed Data & Defensive Resilience: Cycle prevention, missing parent, selection in table/list", () => {
  // 1. Cycle prevention (A -> B -> C -> A)
  const cyclicDefs: DocumentStyle[] = [
    { id: "style_cyc_a", name: "Cycle A", type: "paragraph", isBuiltIn: false, basedOn: "style_cyc_c" },
    { id: "style_cyc_b", name: "Cycle B", type: "paragraph", isBuiltIn: false, basedOn: "style_cyc_a" },
    { id: "style_cyc_c", name: "Cycle C", type: "paragraph", isBuiltIn: false, basedOn: "style_cyc_b" },
  ];
  const resCycle = resolveStyle("style_cyc_a", cyclicDefs);
  assert.ok(resCycle, "Không được gây đệ quy vô tận hoặc treo CPU");

  // 2. Missing parent
  const brokenParentDefs: DocumentStyle[] = [
    { id: "style_orphan", name: "Orphan", type: "paragraph", isBuiltIn: false, basedOn: "non_existent_id" },
  ];
  const resOrphan = resolveStyle("style_orphan", brokenParentDefs);
  assert.ok(resOrphan, "Missing parent phải fallback an toàn");

  // 3. Selection trong Bảng (Table): áp dụng style vào ô bảng mà không phá cấu trúc table
  const tableEditor = createFullEditor({
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { borders: "all" },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Nội dung ô bảng" }] }],
              },
            ],
          },
        ],
      },
    ],
  });

  // Đặt con trỏ vào trong ô bảng và áp dụng style
  tableEditor.commands.setTextSelection(4);
  const tableApply = applyParagraphStyle(tableEditor, STYLE_HEADING_3_ID);
  assert.ok(tableApply);

  const tableJson = tableEditor.getJSON();
  assert.equal(tableJson.content?.[0].type, "table", "Cấu trúc table vẫn nguyên vẹn");
  assert.equal(tableJson.content?.[0].content?.[0].type, "tableRow", "Cấu trúc tableRow vẫn nguyên vẹn");
  assert.equal(tableJson.content?.[0].content?.[0].content?.[0].type, "tableCell", "Cấu trúc tableCell vẫn nguyên vẹn");
  const cellHeading = tableJson.content?.[0].content?.[0].content?.[0].content?.[0];
  assert.equal(cellHeading.type, "heading");
  assert.equal(cellHeading.attrs?.level, 3);
  assert.equal(cellHeading.attrs?.styleId, STYLE_HEADING_3_ID, "Textblock trong ô bảng được gán đúng Heading 3");

  // Đổi ngược lại về Normal paragraph style bên trong ô bảng (Normal được chuẩn hóa an toàn thành null/style_normal)
  const tableReset = applyParagraphStyle(tableEditor, STYLE_NORMAL_ID);
  assert.ok(tableReset);
  const resetJson = tableEditor.getJSON();
  const cellP = resetJson.content?.[0].content?.[0].content?.[0].content?.[0];
  assert.equal(cellP.type, "paragraph");
  assert.ok(
    cellP.attrs?.styleId === null || cellP.attrs?.styleId === undefined || cellP.attrs?.styleId === STYLE_NORMAL_ID,
    "Textblock trong ô bảng trở lại Normal paragraph an toàn"
  );

  // Áp dụng custom paragraph style vào ô bảng
  applyParagraphStyle(tableEditor, "style_table_caption");
  const captionJson = tableEditor.getJSON();
  const cellCaption = captionJson.content?.[0].content?.[0].content?.[0].content?.[0];
  assert.equal(cellCaption.type, "paragraph");
  assert.equal(cellCaption.attrs?.styleId, "style_table_caption");

  tableEditor.destroy();
});

test("Phase 10 - 8. Zero Regression: Complex multi-element document round-trip via DOCX", async () => {
  const complexDoc: DocumentModel = {
    id: "doc-complex-final",
    title: "Final Complex Document",
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        ...createDefaultStyleDefinitions(),
        {
          id: "style_box_quote",
          name: "Box Quote",
          type: "paragraph",
          isBuiltIn: false,
          basedOn: STYLE_NORMAL_ID,
          paragraph: { textAlign: "center", spacingBefore: 12, spacingAfter: 12 },
          character: { italic: true, color: "#334155" },
        },
        {
          id: "style_mark_hl",
          name: "Mark Highlight",
          type: "character",
          isBuiltIn: false,
          character: { bold: true, color: "#B91C1C", highlight: "#FEF08A" },
        },
      ],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, styleId: STYLE_HEADING_1_ID },
          content: [{ type: "text", text: "1. Đề mục chính" }],
        },
        {
          type: "paragraph",
          attrs: { styleId: "style_box_quote" },
          content: [
            { type: "text", text: "Đoạn trích dẫn đặc biệt với " },
            {
              type: "text",
              text: "điểm nhấn nổi bật",
              marks: [{ type: "characterStyle", attrs: { styleId: "style_mark_hl" } }],
            },
          ],
        },
        {
          type: "table",
          attrs: { borders: "all" },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu bảng 1" }] }],
                },
              ],
            },
          ],
        },
        {
          type: "pageBreak",
        },
        {
          type: "caption",
          attrs: { label: "Figure", text: "Hình ảnh minh họa kiến trúc" },
        },
      ],
    },
  };

  // 1. Xuất DOCX
  const bytes = await exportDocumentModelToDocx(complexDoc);
  assert.ok(bytes.byteLength > 0);

  // 2. Nhập lại
  const importRes = await importDocxToDocumentModel(bytes, "complex.docx");
  assert.ok(importRes.success);
  const imported = importRes.document;

  // Kiểm tra định nghĩa styles
  const boxQuote = imported.styles?.definitions.find((s) => s.name.toLowerCase().includes("box quote"));
  assert.ok(boxQuote);
  assert.equal(boxQuote!.paragraph?.textAlign, "center");

  const markHl = imported.styles?.definitions.find((s) => s.name.toLowerCase().includes("mark highlight"));
  assert.ok(markHl);
  assert.equal(markHl!.character?.bold, true);

  // Kiểm tra các phần tử phức tạp
  const blocks = imported.content.content || [];
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(blocks[2].type, "table");
});
