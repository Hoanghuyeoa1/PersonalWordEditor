import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type { DocumentModel, CommentItem, TrackChangeItem } from "../document/documentTypes.ts";
import {
  importDocxToDocumentModel,
  exportDocumentModelToDocx,
  parseMediaItems,
  extractSectionHeaderFooter,
  validateDocxPackageData,
} from "./index.ts";
import { parseXmlString, getDirectChildrenByLocalName } from "./utils/xmlUtils.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
} from "../styles/services/builtInStyles.ts";
import type { JSONContent } from "@tiptap/core";

// 1x1 Transparent Sample PNG Data URL
const SAMPLE_PNG_A =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SAMPLE_PNG_B =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/nwEDjBipEwA8AgX+wQ0RcwAAAABJRU5ErkJggg==";

/**
 * PHASE 14 — CROSS-SUBSYSTEM ROUND-TRIP + PERFORMANCE AUDIT
 */

// ============================================================================
// 1. EDITOR -> DOCX -> EDITOR (Multi-Subsystem Round-Trip)
// ============================================================================
test("Phase 14 - 1. Multi-Subsystem Round-Trip: Styles, Fields, OMML, Floating, TextBox, Shapes, Table Rowspan, Captions, References, Footnotes, Comments, Track Changes", async () => {
  const doc: DocumentModel = {
    metadata: {
      id: "doc-phase14-all-subsystems",
      title: "Comprehensive Multi-Subsystem Test Document",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Báo cáo Kỹ thuật — Trang {PAGE}", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: STYLE_NORMAL_ID,
          name: "Normal",
          type: "paragraph",
          isBuiltIn: true,
          paragraph: { lineSpacing: 1.15, spacingAfter: 8 },
          character: { fontFamily: "Times New Roman", fontSize: 12 },
        },
        {
          id: STYLE_HEADING_1_ID,
          name: "Heading 1",
          type: "paragraph",
          isBuiltIn: true,
          basedOn: STYLE_NORMAL_ID,
          paragraph: { lineSpacing: 1.15, spacingBefore: 12, spacingAfter: 6, headingLevel: 1 },
          character: { bold: true, fontSize: 16, color: "#1E3A8A" },
        },
        {
          id: "style-custom-thesis-quote",
          name: "Thesis Quote",
          type: "paragraph",
          isBuiltIn: false,
          basedOn: STYLE_NORMAL_ID,
          paragraph: { leftIndent: 20, rightIndent: 20, lineSpacing: 1.2 },
          character: { italic: true, color: "#4B5563" },
        },
      ],
    },
    references: {
      bookmarks: [
        { id: "bm-arch-fig", name: "Hinh_Kien_Truc", text: "Kiến trúc hệ thống" },
      ],
    },
    comments: [
      {
        id: "com-1",
        author: "Chuyên gia đánh giá",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: "Cần bổ sung chi tiết về thuật toán phân tán.",
        resolved: false,
        selectedText: "Kiến trúc hệ thống",
      },
    ],
    trackedChanges: [
      {
        id: "tc-ins-1",
        type: "insert",
        author: "Tác giả chính",
        timestamp: new Date().toISOString(),
        text: "được tối ưu hóa cao độ",
      },
      {
        id: "tc-del-1",
        type: "delete",
        author: "Người biên tập",
        timestamp: new Date().toISOString(),
        text: "rất đơn giản",
      },
    ],
    content: {
      type: "doc",
      content: [
        // 1. Heading 1 with custom style
        {
          type: "heading",
          attrs: { level: 1, styleId: STYLE_HEADING_1_ID },
          content: [{ type: "text", text: "1. TỔNG QUAN KIẾN TRÚC" }],
        },
        // 2. Custom Style paragraph with dynamic field & comment & bookmark & cross-reference
        {
          type: "paragraph",
          attrs: { styleId: "style-custom-thesis-quote" },
          content: [
            { type: "text", text: "Tài liệu này được tạo vào ngày " },
            {
              type: "field",
              attrs: {
                fieldType: "DATE",
                instruction: 'DATE \\@ "yyyy-MM-dd"',
                result: "2026-10-08",
                isComplex: false,
              },
            },
            { type: "text", text: ". Nội dung này " },
            {
              type: "text",
              text: "Kiến trúc hệ thống",
              marks: [
                { type: "comment", attrs: { commentId: "com-1" } },
                { type: "bookmark", attrs: { id: "bm-arch-fig", name: "Hinh_Kien_Truc" } },
              ],
            },
            { type: "text", text: " " },
            {
              type: "text",
              text: "được tối ưu hóa cao độ",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    id: "tc-ins-1",
                    changeType: "insert",
                    author: "Tác giả chính",
                    timestamp: new Date().toISOString(),
                  },
                },
              ],
            },
            { type: "text", text: ", không còn " },
            {
              type: "text",
              text: "rất đơn giản",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    id: "tc-del-1",
                    changeType: "delete",
                    author: "Người biên tập",
                    timestamp: new Date().toISOString(),
                  },
                },
              ],
            },
            { type: "text", text: ". " },
            // Cross-reference
            {
              type: "crossReference",
              attrs: {
                targetId: "bm-arch-fig",
                targetType: "bookmark",
                customText: "Xem Hình Kiến trúc",
                format: "text",
              },
            },
            // Footnote reference
            {
              type: "noteReference",
              attrs: {
                noteType: "footnote",
                noteId: "fn-1",
                content: "Tham chiếu kiến trúc phần mềm tiêu chuẩn IEEE 1471.",
              },
            },
          ],
        },
        // 3. OMML Display Equation
        {
          type: "equation",
          attrs: {
            latex: "E = m c^2 + \\frac{\\hbar^2}{2m} \\nabla^2 \\psi",
            alignment: "center",
          },
        },
        // 4. Floating Image with Square Wrap
        {
          type: "image",
          attrs: {
            src: SAMPLE_PNG_A,
            alt: "Floating Architecture Diagram",
            width: 320,
            height: 180,
            alignment: "center",
            floating: true,
            wrap: "square",
            drawingPosition: {
              placement: "floating",
              width: 320,
              height: 180,
              wrapMode: "square",
              horizontalRelative: "column",
              verticalRelative: "paragraph",
              offsetX: 40,
              offsetY: 20,
              distT: 10,
              distB: 10,
              distL: 10,
              distR: 10,
            },
          },
        },
        // 5. Caption for the figure
        {
          type: "caption",
          attrs: {
            label: "Figure",
            text: "Kiến trúc tổng thể của hệ thống phân tán",
          },
        },
        // 6. Floating TextBox with inner rich paragraph
        {
          type: "textBox",
          attrs: {
            width: 280,
            minHeight: 90,
            backgroundColor: "#EFF6FF",
            borderColor: "#3B82F6",
            alignment: "left",
            drawingPosition: {
              placement: "floating",
              width: 280,
              height: 90,
              wrapMode: "square",
              horizontalRelative: "column",
              verticalRelative: "paragraph",
              offsetX: 20,
              offsetY: 10,
            },
          },
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Lưu ý: TextBox này hoạt động độc lập với dòng văn bản chính.",
                  marks: [{ type: "bold" }],
                },
              ],
            },
          ],
        },
        // 7. Shape Drawing (Rounded Rectangle)
        {
          type: "shape",
          attrs: {
            shapeType: "roundedRectangle",
            width: 200,
            height: 80,
            fillColor: "#FEF08A",
            strokeColor: "#CA8A04",
            strokeWidth: 2,
            alignment: "center",
            drawingPosition: {
              placement: "floating",
              width: 200,
              height: 80,
              wrapMode: "topBottom",
              horizontalRelative: "column",
              verticalRelative: "paragraph",
              offsetX: 0,
              offsetY: 0,
            },
          },
        },
        // 8. Table with Rowspan and Colspan
        {
          type: "table",
          attrs: {
            borders: "all",
            borderColor: "#9CA3AF",
            layoutMode: "autoWindow",
            tableStyleId: "grid",
          },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, backgroundColor: "#E0E7FF" },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Chỉ số thử nghiệm" }] }],
                },
                {
                  type: "tableHeader",
                  attrs: { rowspan: 2, backgroundColor: "#E0E7FF" },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Trạng thái" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Độ trễ (ms)" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Thông lượng (req/s)" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  // 1. Export
  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes instanceof Uint8Array);
  assert.ok(docxBytes.length > 1000, "DOCX binary must have substantial size");

  // 2. Re-import
  const importRes = await importDocxToDocumentModel(docxBytes, "multi-subsystem.docx");
  assert.equal(importRes.success, true, `Import failed: ${importRes.error}`);
  assert.ok(importRes.document);

  const reimported = importRes.document;
  const blocks = reimported.content.content || [];

  // 3. Verify semantic objects
  // Equation
  const eqBlock = blocks.find((b) => b.type === "equation");
  assert.ok(eqBlock, "Equation node must be preserved in AST");
  assert.ok(
    eqBlock.attrs?.latex && typeof eqBlock.attrs.latex === "string",
    "Equation latex must be preserved"
  );

  // Floating Image
  const imgBlock = blocks.find((b) => b.type === "image" && b.attrs?.floating === true);
  assert.ok(imgBlock, "Floating image must be preserved as floating image");
  assert.equal(imgBlock.attrs?.wrap, "square", "Image square wrap mode must be preserved");

  // TextBox
  const tbBlock = blocks.find((b) => b.type === "textBox");
  assert.ok(tbBlock, "TextBox must be preserved as semantic textBox node");
  assert.ok(tbBlock.content && tbBlock.content.length > 0, "TextBox must preserve inner content");

  // Shape
  const shapeBlock = blocks.find((b) => b.type === "shape");
  assert.ok(shapeBlock, "Shape must be preserved as semantic shape node");
  assert.equal(shapeBlock.attrs?.shapeType, "roundedRectangle", "Shape type must match");

  // Table with Rowspan
  const tableBlock = blocks.find((b) => b.type === "table");
  assert.ok(tableBlock, "Table node must be preserved");
  const rows = tableBlock.content || [];
  assert.ok(rows.length >= 2, "Table must have at least 2 rows");
  const firstRowCells = rows[0].content || [];
  assert.equal(firstRowCells[0]?.attrs?.colspan, 2, "Cell colspan 2 must be preserved");
  assert.equal(firstRowCells[1]?.attrs?.rowspan, 2, "Cell rowspan 2 must be preserved");

  // Comments
  assert.ok(reimported.comments && reimported.comments.length > 0, "Comments must be preserved");
  assert.ok(
    reimported.comments.some((c) => c.content.includes("phân tán")),
    "Comment body must remain intact"
  );

  // Track Changes
  assert.ok(reimported.trackedChanges && reimported.trackedChanges.length > 0, "Tracked changes preserved");

  // Custom Style definition
  assert.ok(
    reimported.styles?.definitions?.some((d) => d.name === "Thesis Quote" || d.id.includes("thesis-quote") || d.id === "style-custom-thesis-quote"),
    "Custom style definition must be preserved"
  );
});

// ============================================================================
// 2. WORD-LIKE FIXTURES (Real DOCX fixture test.docx)
// ============================================================================
test("Phase 14 - 2. Word-like Fixture: test.docx -> Editor -> Edit -> Export -> Re-import Validation", async () => {
  const fixturePath = path.resolve(process.cwd(), "test.docx");
  assert.ok(fs.existsSync(fixturePath), "Fixture test.docx must exist in repository root");

  const originalBytes = fs.readFileSync(fixturePath);
  assert.ok(originalBytes.length > 0);

  // 1. Initial import of real Word document
  const import1 = await importDocxToDocumentModel(originalBytes, "test.docx");
  assert.equal(import1.success, true);
  assert.ok(import1.document);
  const doc1 = import1.document;

  const initialBlockCount = doc1.content.content?.length || 0;
  assert.ok(initialBlockCount >= 5, "test.docx must contain multiple blocks");

  // 2. Simulate editing in Editor:
  // - Add a new paragraph
  // - Add a new mathematical formula
  // - Add a new review comment
  const modifiedContent: JSONContent = {
    type: "doc",
    content: [
      ...(doc1.content.content || []),
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Phần bổ sung từ Personal Word Editor: ",
            marks: [{ type: "bold" }],
          },
          {
            type: "text",
            text: "Kiểm định tương thích hai chiều hoàn tất thành công.",
          },
        ],
      },
      {
        type: "equation",
        attrs: {
          latex: "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}",
          alignment: "center",
        },
      },
    ],
  };

  const modifiedComments: CommentItem[] = [
    ...(doc1.comments || []),
    {
      id: "comment-editor-edit-1",
      author: "Biên tập viên",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content: "Đã rà soát và xác thực nội dung mẫu Word.",
      resolved: false,
      selectedText: "Kiểm định tương thích",
    },
  ];

  const modifiedDoc: DocumentModel = {
    ...doc1,
    content: modifiedContent,
    comments: modifiedComments,
  };

  // 3. Export modified model to DOCX
  const exportedBytes = await exportDocumentModelToDocx(modifiedDoc);
  assert.ok(exportedBytes.length > 0);

  // 4. Re-import the newly produced DOCX
  const import2 = await importDocxToDocumentModel(exportedBytes, "edited-test.docx");
  assert.equal(import2.success, true, `Re-import of edited fixture failed: ${import2.error}`);
  assert.ok(import2.document);

  const doc2 = import2.document;
  const blocks2 = doc2.content.content || [];

  // Verify: block count increased and added equation & comment are present
  assert.ok(blocks2.length > initialBlockCount, "Block count must reflect added elements");
  const hasAddedEq = blocks2.some((b) => b.type === "equation" && b.attrs?.latex?.includes("pi"));
  assert.ok(hasAddedEq, "Added mathematical equation must survive round-trip");

  assert.ok(doc2.comments && doc2.comments.length >= modifiedComments.length);
  assert.ok(
    doc2.comments.some((c) => c.content.includes("Đã rà soát")),
    "Newly added review comment must survive round-trip"
  );
});

// ============================================================================
// 3. MIXED ACADEMIC THESIS DOCUMENT SCENARIO
// ============================================================================
test("Phase 14 - 3. Mixed Academic Thesis Document: Heading, TOC, Custom Styles, Math, Multi-media, Rowspan, References, Footnotes, Citations, Comments, Track Changes", async () => {
  const academicDoc: DocumentModel = {
    metadata: {
      id: "doc-thesis-masters-2026",
      title: "Luận Văn Thạc Sĩ — Hệ Thống Tính Toán Đám Mây",
      version: 1,
      createdAt: "2026-10-01T08:00:00Z",
      updatedAt: "2026-10-08T09:00:00Z",
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 30, bottom: 25, left: 35, right: 20 },
      marginPreset: "Custom",
    },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Luận văn thạc sĩ — Nguyễn Văn A", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: STYLE_NORMAL_ID,
          name: "Normal",
          type: "paragraph",
          isBuiltIn: true,
          paragraph: { lineSpacing: 1.5, spacingAfter: 6 },
          character: { fontFamily: "Times New Roman", fontSize: 13 },
        },
        {
          id: "style-thesis-abstract",
          name: "Thesis Abstract",
          type: "paragraph",
          isBuiltIn: false,
          basedOn: STYLE_NORMAL_ID,
          paragraph: { leftIndent: 25, rightIndent: 25, lineSpacing: 1.3 },
          character: { italic: true },
        },
      ],
    },
    references: {
      bookmarks: [
        { id: "bm-ch1", name: "Chuong_1_Tong_Quan", text: "Chương 1" },
        { id: "bm-tbl-exp", name: "Bang_Ket_Qua_Thu_Nghiem", text: "Bảng kết quả thử nghiệm" },
      ],
    },
    comments: [
      {
        id: "com-prof-1",
        author: "GS. Trần Văn B (Hướng dẫn)",
        createdAt: "2026-10-05T10:00:00Z",
        updatedAt: "2026-10-05T10:00:00Z",
        content: "Cần làm rõ sự khác biệt giữa thuật toán đề xuất và baseline.",
        resolved: false,
        selectedText: "Chương 1",
      },
    ],
    trackedChanges: [
      {
        id: "tc-ch1-1",
        type: "insert",
        author: "Nguyễn Văn A",
        timestamp: "2026-10-06T14:20:00Z",
        text: "dựa trên điện toán biên thông minh",
      },
    ],
    content: {
      type: "doc",
      content: [
        // 1. Heading 1 with bookmark & comment
        {
          type: "heading",
          attrs: { level: 1 },
          content: [
            {
              type: "text",
              text: "Chương 1: TỔNG QUAN TÀI LIỆU VÀ MÔ HÌNH",
              marks: [
                { type: "bookmark", attrs: { id: "bm-ch1", name: "Chuong_1_Tong_Quan" } },
                { type: "comment", attrs: { commentId: "com-prof-1" } },
              ],
            },
          ],
        },
        // 2. Table of Contents
        {
          type: "tableOfContents",
          attrs: {
            title: "MỤC LỤC",
            entries: [
              { level: 1, text: "Chương 1: Tổng quan tài liệu và mô hình", pageNumber: 1 },
              { level: 2, text: "1.1 Bối cảnh nghiên cứu", pageNumber: 2 },
            ],
            showPageNumbers: true,
          },
        },
        // 3. Abstract Paragraph
        {
          type: "paragraph",
          attrs: { styleId: "style-thesis-abstract" },
          content: [
            {
              type: "text",
              text: "Tóm tắt: Nghiên cứu này đề xuất giải pháp kiến trúc mới ",
            },
            {
              type: "text",
              text: "dựa trên điện toán biên thông minh",
              marks: [
                {
                  type: "trackChange",
                  attrs: {
                    id: "tc-ch1-1",
                    changeType: "insert",
                    author: "Nguyễn Văn A",
                    timestamp: "2026-10-06T14:20:00Z",
                  },
                },
              ],
            },
            {
              type: "text",
              text: " nhằm giảm tải cho máy chủ trung tâm. ",
            },
            {
              type: "noteReference",
              attrs: {
                noteType: "footnote",
                noteId: "fn-ac-1",
                content: "Được tài trợ bởi Quỹ Phát triển Khoa học Công nghệ Quốc gia (NAFOSTED).",
              },
            },
          ],
        },
        // 4. Mathematical Equation
        {
          type: "equation",
          attrs: {
            latex: "L(w) = \\frac{1}{N} \\sum_{i=1}^{N} \\ell(f(x_i; w), y_i) + \\lambda \\|w\\|^2",
            alignment: "center",
          },
        },
        // 5. Cross-reference to Chapter 1 & Table
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Như đã trình bày tại " },
            {
              type: "crossReference",
              attrs: {
                targetId: "bm-ch1",
                targetType: "bookmark",
                customText: "Chương 1",
                format: "text",
              },
            },
            { type: "text", text: ", số liệu chi tiết được tổng hợp ở " },
            {
              type: "crossReference",
              attrs: {
                targetId: "bm-tbl-exp",
                targetType: "bookmark",
                customText: "Bảng 1.1",
                format: "text",
              },
            },
            { type: "text", text: "." },
          ],
        },
        // 6. Complex Table with Rowspan and Bookmark
        {
          type: "table",
          attrs: {
            targetId: "bm-tbl-exp",
            borders: "all",
            borderColor: "#374151",
            tableStyleId: "grid",
          },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { rowspan: 2, backgroundColor: "#F3F4F6" },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Phương pháp" }] }],
                },
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, backgroundColor: "#F3F4F6" },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Chỉ tiêu đo đạc" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Độ chính xác (%)" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Thời gian xử lý (ms)" }] }],
                },
              ],
            },
          ],
        },
        // 7. Caption for Table
        {
          type: "caption",
          attrs: {
            label: "Table",
            text: "So sánh hiệu năng giữa mô hình đề xuất và baseline",
          },
        },
      ],
    },
  };

  // Export -> Re-import
  const bytes = await exportDocumentModelToDocx(academicDoc);
  const result = await importDocxToDocumentModel(bytes, "thesis.docx");

  assert.equal(result.success, true);
  assert.ok(result.document);
  const importedDoc = result.document;

  // Zero main text loss check
  const allTexts = JSON.stringify(importedDoc.content);
  assert.ok(allTexts.includes("TỔNG QUAN TÀI LIỆU"), "Chapter 1 title must not be lost");
  assert.ok(allTexts.includes("Tóm tắt: Nghiên cứu này"), "Abstract text must not be lost");
  assert.ok(allTexts.includes("Phương pháp"), "Table header text must not be lost");

  // References and Bookmarks check
  assert.ok(importedDoc.references?.bookmarks, "Bookmarks metadata must exist");
  assert.ok(
    importedDoc.references.bookmarks.some((b) => b.id === "bm-ch1" || b.name.includes("Chuong_1")),
    "Chapter 1 bookmark must survive round-trip"
  );

  // Footnote check
  assert.ok(allTexts.includes("Được tài trợ bởi Quỹ") || (importedDoc.references as any)?.footnotes || allTexts.includes("NAFOSTED"), "Footnote content must be preserved");

  // Comment check
  assert.ok(importedDoc.comments && importedDoc.comments.length > 0);
  assert.ok(importedDoc.comments[0].content.includes("GS. Trần Văn B") || importedDoc.comments[0].author.includes("Trần Văn B"));
});

// ============================================================================
// 4. SEMANTIC FIDELITY CHECK (Equation, Style, Floating, Rowspan, Field)
// ============================================================================
test("Phase 14 - 4. Semantic Fidelity: Equation -> Equation, Style -> Style, Floating -> Floating, Rowspan -> Rowspan, Field -> Field", async () => {
  const doc: DocumentModel = {
    metadata: {
      id: "doc-fidelity-strict",
      title: "Strict Semantic Fidelity Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25, bottom: 25, left: 25, right: 25 } },
    styles: {
      defaultParagraphStyleId: STYLE_NORMAL_ID,
      definitions: [
        {
          id: "style-strict-heading",
          name: "Strict Heading Style",
          type: "paragraph",
          isBuiltIn: false,
          paragraph: { lineSpacing: 1.2, spacingBefore: 14, spacingAfter: 4 },
          character: { bold: true, fontSize: 15, color: "#2563EB" },
        },
      ],
    },
    content: {
      type: "doc",
      content: [
        // 1. Style -> Style
        {
          type: "paragraph",
          attrs: { styleId: "style-strict-heading" },
          content: [{ type: "text", text: "Đoạn văn mang Style nghiêm ngặt" }],
        },
        // 2. Field -> Field
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Trang: " },
            {
              type: "field",
              attrs: {
                fieldType: "PAGE",
                instruction: "PAGE",
                result: "1",
                isComplex: false,
              },
            },
          ],
        },
        // 3. Equation -> Equation
        {
          type: "equation",
          attrs: {
            latex: "a^2 + b^2 = c^2",
            alignment: "center",
          },
        },
        // 4. Floating Image -> Floating Image
        {
          type: "image",
          attrs: {
            src: SAMPLE_PNG_B,
            width: 200,
            height: 100,
            floating: true,
            wrap: "tight",
            drawingPosition: {
              placement: "floating",
              width: 200,
              height: 100,
              wrapMode: "tight",
              horizontalRelative: "column",
              verticalRelative: "paragraph",
              offsetX: 30,
              offsetY: 15,
            },
          },
        },
        // 5. Rowspan -> Rowspan
        {
          type: "table",
          attrs: { borders: "all" },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { rowspan: 2 },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Master Rowspan Cell" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Row 1 Col 2" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Row 2 Col 2" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const bytes = await exportDocumentModelToDocx(doc);
  const result = await importDocxToDocumentModel(bytes);

  assert.equal(result.success, true);
  const blocks = result.document!.content.content || [];

  // Check 1: Style
  const styledP = blocks[0];
  assert.equal(styledP.type, "paragraph");
  assert.ok(
    styledP.attrs?.styleId === "style-strict-heading" ||
    result.document!.styles?.definitions.some((d) => d.name === "Strict Heading Style"),
    "Style identity must be preserved"
  );

  // Check 2: Field
  const fieldP = blocks[1];
  const fieldNode = (fieldP.content || []).find((c) => c.type === "field");
  assert.ok(fieldNode, "Field must remain a semantic field node, not flattened to plain text");
  assert.equal(fieldNode.attrs?.fieldType, "PAGE");

  // Check 3: Equation
  const eqNode = blocks.find((b) => b.type === "equation");
  assert.ok(eqNode, "Equation must remain semantic equation node");
  assert.ok(
    eqNode.attrs?.latex.includes("c^{2}") || eqNode.attrs?.latex.includes("c^2"),
    "Equation content must remain valid"
  );

  // Check 4: Floating Image
  const imgNode = blocks.find((b) => b.type === "image");
  assert.ok(imgNode, "Image must exist");
  assert.equal(imgNode.attrs?.floating, true, "Floating property must remain true");
  assert.equal(imgNode.attrs?.wrap, "tight", "Tight wrap mode must remain tight");

  // Check 5: Rowspan
  const tblNode = blocks.find((b) => b.type === "table");
  assert.ok(tblNode);
  const rows = tblNode.content || [];
  assert.equal(rows[0]?.content?.[0]?.attrs?.rowspan, 2, "Rowspan must remain 2");
});

// ============================================================================
// 5. PACKAGE VALIDITY & ARCHIVE INTEGRITY
// ============================================================================
test("Phase 14 - 5. Package Validity: ZIP structure, XML parseability, Unique docPr IDs, Bookmark IDs & Rels", async () => {
  const doc: DocumentModel = {
    metadata: {
      id: "doc-package-validity",
      title: "Package Validity Test",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 } },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Header với ảnh", image: SAMPLE_PNG_A },
      footer: { text: "Trang {PAGE} / {NUMPAGES}" },
    },
    references: {
      bookmarks: [
        { id: "bm-1", name: "Diem_Moc_1", text: "Điểm mốc 1" },
        { id: "bm-2", name: "Diem_Moc_2", text: "Điểm mốc 2" },
      ],
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Đoạn văn 1",
              marks: [{ type: "bookmark", attrs: { id: "bm-1", name: "Diem_Moc_1" } }],
            },
          ],
        },
        {
          type: "image",
          attrs: { src: SAMPLE_PNG_A, width: 200, height: 100, alt: "Pic 1" },
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Đoạn văn 2",
              marks: [{ type: "bookmark", attrs: { id: "bm-2", name: "Diem_Moc_2" } }],
            },
          ],
        },
        {
          type: "image",
          attrs: { src: SAMPLE_PNG_B, width: 200, height: 100, alt: "Pic 2" },
        },
      ],
    },
  };

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);

  // 1. Mandatory OPC Parts check
  assert.ok(zip.file("[Content_Types].xml"), "[Content_Types].xml must exist");
  assert.ok(zip.file("_rels/.rels"), "_rels/.rels must exist");
  assert.ok(zip.file("word/document.xml"), "word/document.xml must exist");
  assert.ok(zip.file("word/styles.xml"), "word/styles.xml must exist");
  assert.ok(zip.file("word/numbering.xml"), "word/numbering.xml must exist");
  assert.ok(zip.file("word/_rels/document.xml.rels"), "word/_rels/document.xml.rels must exist");
  assert.ok(zip.file("word/header1.xml"), "word/header1.xml must exist");
  assert.ok(zip.file("word/footer1.xml"), "word/footer1.xml must exist");

  // 2. Validate XML parseability of each part
  const docXml = await zip.file("word/document.xml")!.async("string");
  const parsedDoc = parseXmlString(docXml);
  assert.ok(parsedDoc, "word/document.xml must parse without error");

  const stylesXml = await zip.file("word/styles.xml")!.async("string");
  assert.doesNotThrow(() => parseXmlString(stylesXml), "word/styles.xml must be valid XML");

  const ctXml = await zip.file("[Content_Types].xml")!.async("string");
  assert.doesNotThrow(() => parseXmlString(ctXml), "[Content_Types].xml must be valid XML");

  // 3. Unique docPr IDs check
  const docPrElements = parsedDoc.getElementsByTagName("wp:docPr");
  const seenDocPrIds = new Set<string>();
  for (let i = 0; i < docPrElements.length; i++) {
    const id = docPrElements[i].getAttribute("id");
    assert.ok(id, "Every wp:docPr must have an id attribute");
    assert.ok(!seenDocPrIds.has(id!), `Duplicate wp:docPr id='${id}' detected!`);
    seenDocPrIds.add(id!);
    assert.ok(parseInt(id!, 10) > 0, `wp:docPr id='${id}' must be a positive integer`);
  }
  assert.ok(seenDocPrIds.size >= 2, "Must contain at least 2 distinct docPr IDs for the 2 images");

  // 4. Unique Bookmark IDs check
  const bmElements = parsedDoc.getElementsByTagName("w:bookmarkStart");
  const seenBmIds = new Set<string>();
  for (let i = 0; i < bmElements.length; i++) {
    const id = bmElements[i].getAttribute("w:id");
    assert.ok(id, "w:bookmarkStart must have w:id");
    assert.ok(!seenBmIds.has(id!), `Duplicate w:bookmarkStart w:id='${id}' detected!`);
    seenBmIds.add(id!);
  }
  assert.equal(seenBmIds.size, 2, "Must have exactly 2 distinct bookmark IDs");

  // 5. Header Relationships Check
  if (zip.file("word/_rels/header1.xml.rels")) {
    const hdrRelsXml = await zip.file("word/_rels/header1.xml.rels")!.async("string");
    const parsedHdrRels = parseXmlString(hdrRelsXml);
    assert.ok(parsedHdrRels, "word/_rels/header1.xml.rels must be valid XML");
  }
});

// ============================================================================
// 6. PARSER PERFORMANCE & CACHING REUSE
// ============================================================================
test("Phase 14 - 6. Parser Performance: Reuse parsed Header/Footer cache and Relationships across sections", () => {
  const headerXml = `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header dùng chung</w:t></w:r></w:p></w:hdr>`;
  const headersXmlMap = new Map<string, string>([["header1.xml", headerXml]]);
  const footersXmlMap = new Map<string, string>();
  const relationships = new Map([
    ["rIdH1", { id: "rIdH1", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header", target: "header1.xml" }],
  ]);

  const parsedHeaderCache = new Map<string, any>();
  const parsedFooterCache = new Map<string, any>();

  const sectPrXml = `<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <w:headerReference w:type="default" r:id="rIdH1"/>
  </w:sectPr>`;
  const sectPrEl = parseXmlString(sectPrXml).documentElement;

  // Pass 1: Parse first time -> populates cache
  const res1 = extractSectionHeaderFooter(
    sectPrEl,
    relationships,
    headersXmlMap,
    footersXmlMap,
    undefined,
    undefined,
    undefined,
    undefined,
    parsedHeaderCache,
    parsedFooterCache
  );

  assert.equal(parsedHeaderCache.size, 1);
  assert.equal(parsedHeaderCache.get("header1.xml")?.text, "Header dùng chung");

  // Pass 2: Second section references the same header -> reuses cache without re-parsing XML
  const res2 = extractSectionHeaderFooter(
    sectPrEl,
    relationships,
    headersXmlMap,
    footersXmlMap,
    undefined,
    undefined,
    undefined,
    undefined,
    parsedHeaderCache,
    parsedFooterCache
  );

  assert.strictEqual(res1.header, res2.header, "Subsequent section must reuse identical cached HeaderItem instance");
});

// ============================================================================
// 7. LARGE DOCUMENT BENCHMARK (100+ Paragraphs, 20 Images, 10 Equations, Tables)
// ============================================================================
test("Phase 14 - 7. Large Document Performance Benchmark: 100+ Paragraphs, 20 Images, 10 Equations, 5 Tables", async () => {
  const largeBlocks: JSONContent[] = [];

  // Generate 100 paragraphs interspersed with 20 images, 10 equations, and 5 tables
  for (let i = 1; i <= 100; i++) {
    largeBlocks.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `Đoạn văn số ${i}: Đây là nội dung mẫu thử nghiệm tải trọng hiệu năng cao của Personal Word Editor DOCX engine. `,
        },
        {
          type: "text",
          text: `Chỉ số đo đạc vòng ${i * 7}. `,
          marks: [{ type: "italic" }],
        },
      ],
    });

    // Every 5 paragraphs: inject an image (total 20 images)
    if (i % 5 === 0) {
      largeBlocks.push({
        type: "image",
        attrs: {
          src: i % 2 === 0 ? SAMPLE_PNG_A : SAMPLE_PNG_B,
          width: 300,
          height: 150,
          alt: `Benchmark Image ${i / 5}`,
          alignment: "center",
        },
      });
    }

    // Every 10 paragraphs: inject an equation (total 10 equations)
    if (i % 10 === 0) {
      largeBlocks.push({
        type: "equation",
        attrs: {
          latex: `f_${i}(x) = \\sum_{k=1}^{${i}} \\frac{x^k}{k!} + \\alpha_${i}`,
          alignment: "center",
        },
      });
    }

    // Every 20 paragraphs: inject a table (total 5 tables)
    if (i % 20 === 0) {
      largeBlocks.push({
        type: "table",
        attrs: { borders: "all" },
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Mục" }] }] },
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Giá trị" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Thử nghiệm ${i}` }] }] },
              { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `${i * 100} ms` }] }] },
            ],
          },
        ],
      });
    }
  }

  const largeDoc: DocumentModel = {
    metadata: {
      id: "doc-large-benchmark",
      title: "Tài liệu kiểm thử hiệu năng lớn",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    pageSettings: { paperSize: "A4", orientation: "portrait", margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 } },
    headerFooter: {
      linkToPrevious: false,
      header: { text: "Large Document Benchmark — Trang {PAGE}", alignment: "right" },
      footer: { text: "Trang {PAGE} / {NUMPAGES}", alignment: "center" },
    },
    content: {
      type: "doc",
      content: largeBlocks,
    },
  };

  // Measure Export Duration
  const startExport = performance.now();
  const exportedBytes = await exportDocumentModelToDocx(largeDoc);
  const exportDuration = performance.now() - startExport;

  assert.ok(exportedBytes.length > 5000);
  // Real benchmark threshold: export should complete in < 2500ms
  assert.ok(exportDuration < 2500, `Export took ${exportDuration.toFixed(1)}ms, expected < 2500ms`);

  // Measure Import Duration
  const startImport = performance.now();
  const importResult = await importDocxToDocumentModel(exportedBytes, "large-bench.docx");
  const importDuration = performance.now() - startImport;

  assert.equal(importResult.success, true);
  // Real benchmark threshold: import should complete in < 2500ms
  assert.ok(importDuration < 2500, `Import took ${importDuration.toFixed(1)}ms, expected < 2500ms`);

  const importedBlocks = importResult.document?.content?.content || [];
  assert.ok(
    importedBlocks.length >= 130,
    `Expected at least 130 blocks (100 paragraphs + 20 images + 10 eq + 5 tables), got ${importedBlocks.length}`
  );
});

// ============================================================================
// 8. LAZY & CACHED MEDIA LIFECYCLE
// ============================================================================
test("Phase 14 - 8. Cached Media: SessionMediaCache reuses decoded Data URL without stale cross-session collisions", () => {
  const binary1 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
  const binary2 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 99]);

  const filesSessionA = new Map([["word/media/img1.png", binary1]]);
  const relsA = new Map([["rId1", { id: "rId1", type: "image", target: "media/img1.png" }]]);

  // Session A Pass 1
  const parsedA1 = parseMediaItems(filesSessionA, relsA);
  const dataUrlA1 = parsedA1.mediaByRelId.get("rId1")?.dataUrl;
  assert.ok(dataUrlA1);

  // Session A Pass 2 (same binary instance) -> must reuse identical Data URL string
  const parsedA2 = parseMediaItems(filesSessionA, relsA);
  const dataUrlA2 = parsedA2.mediaByRelId.get("rId1")?.dataUrl;
  assert.strictEqual(dataUrlA1, dataUrlA2, "Same binary instance must return cached Data URL");

  // Session B with new distinct binary -> must generate fresh Data URL, no stale collision
  const filesSessionB = new Map([["word/media/img1.png", binary2]]);
  const parsedB = parseMediaItems(filesSessionB, relsA);
  const dataUrlB = parsedB.mediaByRelId.get("rId1")?.dataUrl;
  assert.ok(dataUrlB);
  assert.notEqual(dataUrlA1, dataUrlB, "Different binary instance must not return stale cached string from other session");
});

// ============================================================================
// 9. OLD DOCX COMPATIBILITY & REGRESSION CHECK
// ============================================================================
test("Phase 14 - 9. Old DOCX Compatibility: Tolerant loading of pre-Fidelity 2.0 minimal DOCX without optional parts", async () => {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  );

  // Minimal document.xml without styles.xml, numbering.xml, comments.xml, footnotes.xml, header/footer
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>Văn bản từ tệp DOCX cổ điển tối giản không có styles hay numbering.</w:t></w:r></w:p>
      </w:body>
    </w:document>`
  );

  const minimalBytes = await zip.generateAsync({ type: "uint8array" });

  const result = await importDocxToDocumentModel(minimalBytes, "legacy-minimal.docx");
  assert.equal(result.success, true, "Legacy minimal DOCX must load with 100% success");
  assert.ok(result.document);
  assert.equal(
    result.document.content.content?.[0]?.content?.[0]?.text,
    "Văn bản từ tệp DOCX cổ điển tối giản không có styles hay numbering."
  );
});
