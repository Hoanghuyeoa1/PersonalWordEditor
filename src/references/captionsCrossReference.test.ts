import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { ensureEditorPlugins } from "../editor/editorCommands.ts";
import { CaptionService } from "./services/captionService.ts";
import { CrossReferenceService } from "./services/crossReferenceService.ts";
import { HeadingService } from "./services/headingService.ts";
import { NoteService } from "./services/noteService.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import { createInitialDocument } from "../document/documentModel.ts";
import { exportDocumentModelToDocx } from "../docx/export/docxExporter.ts";
import { importDocxToDocumentModel } from "../docx/import/docxImporter.ts";

/**
 * Helper khởi tạo headless Tiptap Editor có đầy đủ extensions và plugins
 */
function createTestEditor(initialContent?: any): Editor {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialContent || {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản thử nghiệm hệ thống Captions và Cross-reference." }],
        },
      ],
    },
  });

  ensureEditorPlugins(editor);
  return editor;
}

/* ==========================================================================
   BỘ KIỂM THỬ TOÀN DIỆN: PHASE 6.5 — CAPTIONS & CROSS-REFERENCE
   ========================================================================== */

test("Phase 6.5 Captions: 1. Gắn chú thích cho Image và gán ID đối tượng tự động", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Xem hình minh họa dưới đây:" }],
      },
      {
        type: "image",
        attrs: {
          src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          alt: "Architecture diagram",
          width: 300,
          height: 200,
          alignment: "center",
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn tiếp theo." }],
      },
    ],
  });

  // Chọn node image (vị trí pos = 29)
  let imagePos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image") {
      imagePos = pos;
      return false;
    }
  });
  assert.ok(imagePos >= 0);

  // Chọn hình ảnh bằng NodeSelection
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, imagePos))
  );

  // Chèn Caption cho hình ảnh
  const res = CaptionService.insertCaption(editor, {
    label: "Figure",
    text: "Architecture Overview",
    positionPolicy: "below",
  });

  assert.equal(res.success, true);
  assert.ok(res.captionId);

  // Kiểm tra danh sách captions
  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 1);
  assert.equal(captions[0].label, "Figure");
  assert.equal(captions[0].number, 1);
  assert.equal(captions[0].text, "Architecture Overview");
  assert.equal(captions[0].labelAndNumber, "Figure 1");
  assert.equal(captions[0].fullTitle, "Figure 1 — Architecture Overview");
  assert.ok(captions[0].targetId); // Đã gán targetId liên kết
});

test("Phase 6.5 Captions: 2. Gắn chú thích cho Table (mặc định position 'above')", () => {
  const editor = createTestEditor({
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
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Cột A" }] }],
              },
              {
                type: "tableHeader",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Cột B" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu 1" }] }],
              },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu 2" }] }],
              },
            ],
          },
        ],
      },
    ],
  });

  // Đặt con trỏ vào ô bên trong bảng
  editor.commands.setTextSelection(5);

  const detected = CaptionService.detectSelectedTarget(editor);
  assert.ok(detected);
  assert.equal(detected.targetType, "table");

  // Chèn Caption Table
  const res = CaptionService.insertCaption(editor, {
    label: "Table",
    text: "Test Results Summary",
    positionPolicy: "above",
  });

  assert.equal(res.success, true);

  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 1);
  assert.equal(captions[0].label, "Table");
  assert.equal(captions[0].number, 1);
  assert.equal(captions[0].fullTitle, "Table 1 — Test Results Summary");
  assert.equal(captions[0].positionPolicy, "above");
});

test("Phase 6.5 Captions: 3. Gắn chú thích cho Equation", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "equation",
        attrs: {
          latex: "E = mc^2",
          displayMode: true,
          alignment: "center",
        },
      },
    ],
  });

  // Đặt con trỏ gần công thức
  editor.commands.setTextSelection(1);

  const res = CaptionService.insertCaption(editor, {
    label: "Equation",
    text: "Mass-energy equivalence",
    positionPolicy: "below",
  });

  assert.equal(res.success, true);
  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 1);
  assert.equal(captions[0].label, "Equation");
  assert.equal(captions[0].number, 1);
  assert.equal(captions[0].fullTitle, "Equation 1 — Mass-energy equivalence");
});

test("Phase 6.5 Auto-Numbering: 4. Đánh số độc lập và xác định theo từng loại nhãn", () => {
  const editor = createTestEditor();

  // Chèn 2 Figure, 2 Table, 1 Equation xen kẽ
  CaptionService.insertCaption(editor, { label: "Figure", text: "Sơ đồ A" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng dữ liệu 1" });
  CaptionService.insertCaption(editor, { label: "Figure", text: "Sơ đồ B" });
  CaptionService.insertCaption(editor, { label: "Equation", text: "Công thức Euler" });
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng dữ liệu 2" });

  const captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 5);

  const figures = captions.filter((c) => c.label === "Figure");
  assert.equal(figures.length, 2);
  assert.equal(figures[0].number, 1);
  assert.equal(figures[0].fullTitle, "Figure 1 — Sơ đồ A");
  assert.equal(figures[1].number, 2);
  assert.equal(figures[1].fullTitle, "Figure 2 — Sơ đồ B");

  const tables = captions.filter((c) => c.label === "Table");
  assert.equal(tables.length, 2);
  assert.equal(tables[0].number, 1);
  assert.equal(tables[0].fullTitle, "Table 1 — Bảng dữ liệu 1");
  assert.equal(tables[1].number, 2);
  assert.equal(tables[1].fullTitle, "Table 2 — Bảng dữ liệu 2");

  const equations = captions.filter((c) => c.label === "Equation");
  assert.equal(equations.length, 1);
  assert.equal(equations[0].number, 1);
  assert.equal(equations[0].fullTitle, "Equation 1 — Công thức Euler");
});

test("Phase 6.5 Auto-Numbering: 5. Xóa chú thích ở giữa tự động đánh số lại các chú thích sau", () => {
  const editor = createTestEditor();

  // Chèn 3 Figure
  const res1 = CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 1" });
  const res2 = CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 2" });
  const res3 = CaptionService.insertCaption(editor, { label: "Figure", text: "Hình 3" });

  let captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 3);
  assert.equal(captions[0].number, 1);
  assert.equal(captions[1].number, 2);
  assert.equal(captions[2].number, 3);

  // Xóa Hình 2 (ở giữa)
  const delRes = CaptionService.deleteCaption(editor, res2.captionId!);
  assert.equal(delRes.success, true);

  // Quét lại: Hình 3 trước đây phải tự động trở thành Hình 2!
  captions = CaptionService.extractCaptions(editor.state.doc);
  assert.equal(captions.length, 2);
  assert.equal(captions[0].id, res1.captionId);
  assert.equal(captions[0].number, 1);
  assert.equal(captions[0].fullTitle, "Figure 1 — Hình 1");

  assert.equal(captions[1].id, res3.captionId);
  assert.equal(captions[1].number, 2); // Tự động giảm từ 3 xuống 2!
  assert.equal(captions[1].fullTitle, "Figure 2 — Hình 3");
});

test("Phase 6.5 Cross-Reference: 6. Tham chiếu chéo tới Heading ngữ nghĩa", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "ref_heading_system_arch", level: 1 },
        content: [{ type: "text", text: "Kiến trúc hệ thống" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Như được mô tả tại " }],
      },
    ],
  });

  // Chèn Cross-reference trỏ tới heading với định dạng text
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  const crRes = CrossReferenceService.insertCrossReference(editor, {
    targetId: "ref_heading_system_arch",
    targetType: "heading",
    format: "text",
  });
  assert.equal(crRes.success, true);

  // Phân giải tham chiếu
  const resolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: "ref_heading_system_arch",
    targetType: "heading",
    format: "text",
  });
  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "Kiến trúc hệ thống");

  // Phân giải tham chiếu với định dạng labelAndNumber
  const resolvedLabel = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: "ref_heading_system_arch",
    targetType: "heading",
    format: "labelAndNumber",
  });
  assert.equal(resolvedLabel.found, true);
  assert.equal(resolvedLabel.text, "Heading 1");
});

test("Phase 6.5 Cross-Reference: 7. Tham chiếu chéo tới Caption (Label & Number, Full title, Number)", () => {
  const editor = createTestEditor();

  const capRes = CaptionService.insertCaption(editor, {
    label: "Figure",
    text: "Mô hình Client-Server",
  });
  assert.ok(capRes.captionId);

  // 1. Format labelAndNumber -> "Figure 1"
  const resLabelNum = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: capRes.captionId!,
    targetType: "figure",
    format: "labelAndNumber",
  });
  assert.equal(resLabelNum.found, true);
  assert.equal(resLabelNum.text, "Figure 1");

  // 2. Format text -> "Figure 1 — Mô hình Client-Server"
  const resText = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: capRes.captionId!,
    targetType: "caption",
    format: "text",
  });
  assert.equal(resText.found, true);
  assert.equal(resText.text, "Figure 1 — Mô hình Client-Server");

  // 3. Format number -> "1"
  const resNum = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: capRes.captionId!,
    targetType: "caption",
    format: "number",
  });
  assert.equal(resNum.found, true);
  assert.equal(resNum.text, "1");
});

test("Phase 6.5 Dynamic Update: 8. Cập nhật nội dung đối tượng thì tham chiếu phản ánh động ngay lập tức", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "ref_heading_intro", level: 1 },
        content: [{ type: "text", text: "Mở đầu ban đầu" }],
      },
    ],
  });

  const refAttrs = {
    targetId: "ref_heading_intro",
    targetType: "heading" as const,
    format: "text" as const,
  };

  assert.equal(CrossReferenceService.resolveTarget(editor.state.doc, refAttrs).text, "Mở đầu ban đầu");

  // Đổi tên heading thành "Tổng quan và Giới thiệu"
  editor.commands.command(({ tr }) => {
    let headingPos = 0;
    tr.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        headingPos = pos;
        return false;
      }
    });
    tr.replaceWith(headingPos + 1, headingPos + 1 + "Mở đầu ban đầu".length, editor.schema.text("Tổng quan và Giới thiệu"));
    return true;
  });

  // Cross-reference tự động phân giải văn bản mới mà không cần sửa offset!
  const updatedResolved = CrossReferenceService.resolveTarget(editor.state.doc, refAttrs);
  assert.equal(updatedResolved.found, true);
  assert.equal(updatedResolved.text, "Tổng quan và Giới thiệu");
});

test("Phase 6.5 Broken Target Safety: 9. Xóa mục tiêu hiển thị an toàn [Reference not found], không crash", () => {
  const editor = createTestEditor();

  const capRes = CaptionService.insertCaption(editor, {
    label: "Figure",
    text: "Hình sắp bị xóa",
  });
  assert.ok(capRes.captionId);

  // Chèn Cross-reference trỏ tới hình này
  CrossReferenceService.insertCrossReference(editor, {
    targetId: capRes.captionId!,
    targetType: "figure",
    format: "labelAndNumber",
  });

  // Xóa hình
  CaptionService.deleteCaption(editor, capRes.captionId!);

  // Phân giải đối tượng bị xóa
  const brokenResolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: capRes.captionId!,
    targetType: "figure",
    format: "labelAndNumber",
  });

  assert.equal(brokenResolved.found, false);
  assert.equal(brokenResolved.text, "[Reference not found]");
});

test("Phase 6.5 Navigation: 10. Điều hướng con trỏ tới Heading, Caption và Note an toàn", () => {
  const editor = createTestEditor({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 1 mở đầu." }],
      },
      {
        type: "heading",
        attrs: { id: "ref_heading_nav_target_h", level: 2 },
        content: [{ type: "text", text: "Tiêu đề điều hướng" }],
      },
      {
        type: "caption",
        attrs: { id: "ref_cap_nav_target_c", label: "Figure", text: "Hình điều hướng" },
        content: [{ type: "text", text: "Hình điều hướng" }],
      },
    ],
  });

  const navH = CrossReferenceService.navigateToTarget(editor, "ref_heading_nav_target_h", "heading");
  assert.equal(navH.success, true);

  const navC = CrossReferenceService.navigateToTarget(editor, "ref_cap_nav_target_c", "caption");
  assert.equal(navC.success, true);

  const navMissing = CrossReferenceService.navigateToTarget(editor, "ref_non_existent", "heading");
  assert.equal(navMissing.success, false);
});

test("Phase 6.5 Undo / Redo: 11. Khôi phục hoàn toàn Caption và Cross-reference", () => {
  const editor = createTestEditor();
  const initialDocSize = editor.state.doc.content.size;

  // 1. Chèn Caption
  CaptionService.insertCaption(editor, { label: "Table", text: "Bảng thử nghiệm Undo" });
  assert.equal(CaptionService.extractCaptions(editor.state.doc).length, 1);

  // 2. Undo -> Caption biến mất
  editor.commands.undo();
  assert.equal(CaptionService.extractCaptions(editor.state.doc).length, 0);

  // 3. Redo -> Caption xuất hiện trở lại
  editor.commands.redo();
  assert.equal(CaptionService.extractCaptions(editor.state.doc).length, 1);
  assert.equal(CaptionService.extractCaptions(editor.state.doc)[0].label, "Table");
});

test("Phase 6.5 Persistence (.mwd): 12. Lưu và Nạp trọn vẹn Caption và Cross-reference", () => {
  const editor = createTestEditor();

  // Chèn 1 Caption và 1 Cross-reference
  const capRes = CaptionService.insertCaption(editor, {
    label: "Figure",
    text: "Sơ đồ kiến trúc lưu trữ",
  });
  CrossReferenceService.insertCrossReference(editor, {
    targetId: capRes.captionId!,
    targetType: "figure",
    format: "labelAndNumber",
  });

  // Chuyển đổi thành DocumentModel và tuần tự hóa .mwd
  const docModel = createInitialDocument();
  docModel.content = editor.getJSON();

  const mwdBytes = serializeDocumentToMwd(docModel);
  assert.ok(mwdBytes.length > 0);

  // Nạp lại từ .mwd
  const restoredRes = deserializeMwdToDocument(mwdBytes);
  assert.equal(restoredRes.success, true);
  if (!restoredRes.success) return;
  const restoredEditor = createTestEditor(restoredRes.document.content);

  // Xác thực Captions
  const restoredCaptions = CaptionService.extractCaptions(restoredEditor.state.doc);
  assert.equal(restoredCaptions.length, 1);
  assert.equal(restoredCaptions[0].id, capRes.captionId);
  assert.equal(restoredCaptions[0].label, "Figure");
  assert.equal(restoredCaptions[0].text, "Sơ đồ kiến trúc lưu trữ");

  // Xác thực Cross-reference
  let foundCrossRef = false;
  restoredEditor.state.doc.descendants((node) => {
    if (node.type.name === "crossReference") {
      assert.equal(node.attrs.targetId, capRes.captionId);
      assert.equal(node.attrs.format, "labelAndNumber");
      foundCrossRef = true;
    }
  });
  assert.ok(foundCrossRef, "Node crossReference phải được phục hồi trong cây AST");
});

test("Phase 6.5 DOCX Round-Trip: 13. Xuất và Nhập DOCX an toàn không gây corrupt", async () => {
  const docModel = createInitialDocument();
  docModel.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tài liệu kiểm thử DOCX Caption." }],
      },
      {
        type: "caption",
        attrs: {
          id: "ref_cap_fig_docx_1",
          label: "Figure",
          text: "Mô hình tổng quát",
        },
        content: [{ type: "text", text: "Mô hình tổng quát" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Xem thêm tại " },
          {
            type: "crossReference",
            attrs: {
              targetId: "ref_cap_fig_docx_1",
              targetType: "figure",
              format: "labelAndNumber",
              customText: "Figure 1",
            },
          },
        ],
      },
    ],
  };

  // 1. Xuất ra DOCX
  const docxBytes = await exportDocumentModelToDocx(docModel);
  assert.ok(docxBytes.length > 0);

  // 2. Nhập lại từ DOCX
  const importResult = await importDocxToDocumentModel(docxBytes, "test_caption.docx");
  assert.ok(importResult.document);
  assert.ok(importResult.document.content);
  assert.ok(importResult.document.content.content);

  // Kiểm tra khối Caption được nhận diện đúng
  const captionBlock = importResult.document.content.content.find((b: any) => b.type === "caption");
  assert.ok(captionBlock, "DOCX import phải nhận diện khối Caption");
  assert.equal(captionBlock.attrs.label, "Figure");
});

test("Phase 6.5 Coexistence: 14. Đồng tồn tại ổn định cùng Comments, Track Changes và TOC", () => {
  const editor = createTestEditor({
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
        attrs: { id: "h1", level: 1 },
        content: [{ type: "text", text: "Chương 1" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [{ type: "comment", attrs: { commentId: "com_1" } }],
            text: "Đoạn văn có bình luận ",
          },
          {
            type: "text",
            marks: [{ type: "trackChange", attrs: { id: "tc_1", changeType: "insert", author: "User" } }],
            text: "và văn bản được theo dõi thay đổi.",
          },
        ],
      },
    ],
  });

  // Chèn Caption
  const capRes = CaptionService.insertCaption(editor, {
    label: "Figure",
    text: "Sơ đồ đồng tồn tại",
  });
  assert.equal(capRes.success, true);

  // Chèn Cross-reference
  const crRes = CrossReferenceService.insertCrossReference(editor, {
    targetId: "h1",
    targetType: "heading",
    format: "text",
  });
  assert.equal(crRes.success, true);

  // Kiểm tra TOC, Heading, Comment, TrackChange vẫn nguyên vẹn
  let hasToc = false;
  let hasHeading = false;
  let hasComment = false;
  let hasTrackChange = false;

  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableOfContents") hasToc = true;
    if (node.type.name === "heading") hasHeading = true;
    if (node.marks && node.marks.some((m) => m.type.name === "comment")) hasComment = true;
    if (node.marks && node.marks.some((m) => m.type.name === "trackChange")) hasTrackChange = true;
  });

  assert.ok(hasToc);
  assert.ok(hasHeading);
  assert.ok(hasComment);
  assert.ok(hasTrackChange);
});
