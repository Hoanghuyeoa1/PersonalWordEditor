import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { buildPageLayoutMap, getNodeSize } from "./services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import { adaptPageLayoutMapToPaginationState, syncPageLayoutMapToStore } from "./services/pageLayoutBridge.ts";
import { usePaginationStore } from "../stores/paginationStore.ts";
import { HeadingService } from "../references/services/headingService.ts";
import { TocService } from "../references/services/tocService.ts";
import { CrossReferenceService } from "../references/services/crossReferenceService.ts";
import { CaptionService } from "../references/services/captionService.ts";
import { NoteService } from "../references/services/noteService.ts";
import { formatHeaderFooterText } from "./types/headerFooterTypes.ts";
import type { RenderedLineBox } from "./services/lineMeasurementService.ts";

// ============================================================================
// PHASE 10: CENTRAL PAGE MAPPING INTEGRATION TEST SUITE
// ============================================================================

test("Phase 10 - 1. Status Bar current page and pageCount reflect authoritative PageLayoutMap", () => {
  // Tạo tài liệu 3 trang qua ngắt trang tường minh
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 1 nội dung" }],
      },
      { type: "pageBreak" },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 2 nội dung" }],
      },
      { type: "pageBreak" },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 3 nội dung" }],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.equal(layoutMap.getPageCount(), 3);

  // Đồng bộ vào Zustand store
  syncPageLayoutMapToStore(layoutMap, 2);

  // Vị trí ở Trang 1
  const posPage1 = 2;
  syncPageLayoutMapToStore(layoutMap, posPage1);
  let storeState = usePaginationStore.getState();
  assert.equal(storeState.pageCount, 3);
  assert.equal(storeState.currentPage, 1, "Caret ở Trang 1");
  assert.equal(storeState.layoutMap, layoutMap);

  // Vị trí ở Trang 2 (sau node pageBreak thứ 1)
  const posPage2 = layoutMap.getPage(1)!.docRange.from + 2;
  syncPageLayoutMapToStore(layoutMap, posPage2);
  storeState = usePaginationStore.getState();
  assert.equal(storeState.currentPage, 2, "Caret ở Trang 2");

  // Vị trí ở Trang 3 (sau node pageBreak thứ 2)
  const posPage3 = layoutMap.getPage(2)!.docRange.from + 2;
  syncPageLayoutMapToStore(layoutMap, posPage3);
  storeState = usePaginationStore.getState();
  assert.equal(storeState.currentPage, 3, "Caret ở Trang 3");

  editor.destroy();
});

test("Phase 10 - 2. Split paragraph current page resolves according to fragment containing caret", () => {
  // Đoạn văn dài gồm 6 dòng (mỗi dòng 40px = 240px).
  // Trang 1 còn trống 130px -> vừa đúng 3 dòng đầu (120px) (thỏa mãn orphan rule >= 2).
  // 3 dòng còn lại (120px) tràn sang Trang 2 (thỏa mãn widow rule >= 2).
  const longPara: JSONContent = {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Dòng một của đoạn văn dài. Dòng hai của đoạn văn dài. Dòng ba của đoạn văn dài. Dòng bốn của đoạn văn dài. Dòng năm của đoạn văn dài. Dòng sáu của đoạn văn dài.",
      },
    ],
  };

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn mở đầu chiếm 800px trên trang 1." }],
      },
      longPara,
    ],
  };

  const p0Pos = 0;
  const p1Pos = getNodeSize(doc.content![0]);

  const measuredLines = new Map<number, RenderedLineBox[]>();
  measuredLines.set(p0Pos, [{ from: 0, to: p1Pos, height: 800, width: 600, text: "" }]);
  measuredLines.set(p1Pos, [
    { from: p1Pos, to: p1Pos + 25, height: 40, width: 600, text: "Dòng 1" },
    { from: p1Pos + 25, to: p1Pos + 50, height: 40, width: 600, text: "Dòng 2" },
    { from: p1Pos + 50, to: p1Pos + 75, height: 40, width: 600, text: "Dòng 3" },
    { from: p1Pos + 75, to: p1Pos + 100, height: 40, width: 600, text: "Dòng 4" },
    { from: p1Pos + 100, to: p1Pos + 125, height: 40, width: 600, text: "Dòng 5" },
    { from: p1Pos + 125, to: p1Pos + 160, height: 40, width: 600, text: "Dòng 6" },
  ]);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockLines: measuredLines,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Đoạn văn phải split qua 2 trang");

  const frags = layoutMap.getFragmentsForRange(p1Pos, p1Pos + 160);
  assert.equal(frags.length, 2, "Đoạn văn phải sinh đúng 2 fragments");
  assert.equal(frags[0].pageIndex, 0, "Fragment 1 nằm ở Trang 1");
  assert.equal(frags[1].pageIndex, 1, "Fragment 2 nằm ở Trang 2");

  // KIỂM CHỨNG:
  // Con trỏ ở đầu đoạn văn (trong Fragment 1: pos p1Pos + 10) -> thuộc Trang 1 (pageNumber = 1)
  const pageAtStart = layoutMap.getPageNumberForPosition(p1Pos + 10);
  assert.equal(pageAtStart, 1, "Caret ở đầu đoạn văn phải thuộc Trang 1");

  // Con trỏ ở cuối đoạn văn (trong Fragment 2: pos p1Pos + 110) -> thuộc Trang 2 (pageNumber = 2)
  const pageAtEnd = layoutMap.getPageNumberForPosition(p1Pos + 110);
  assert.equal(pageAtEnd, 2, "Caret ở sau điểm split phải thuộc Trang 2");
});

test("Phase 10 - 3. Heading page via HeadingService.getPageForHeading resolves via layout map without persisting page index into AST", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "ref_heading_intro", level: 1 },
        content: [{ type: "text", text: "Giới thiệu tổng quan" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung chương 1" }],
      },
      { type: "pageBreak" },
      {
        type: "heading",
        attrs: { id: "ref_heading_arch", level: 1 },
        content: [{ type: "text", text: "Kiến trúc hệ thống" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung chương 2" }],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.equal(layoutMap.getPageCount(), 2);

  // 1. Phân giải số trang qua HeadingService
  const h1Page = HeadingService.getPageForHeading("ref_heading_intro", editor.state.doc, layoutMap);
  const h2Page = HeadingService.getPageForHeading("ref_heading_arch", editor.state.doc, layoutMap);

  assert.equal(h1Page, 1, "Heading 1 phải ở Trang 1");
  assert.equal(h2Page, 2, "Heading 2 phải ở Trang 2");

  // 2. KIỂM CHỨNG: AST của Heading hoàn toàn KHÔNG bị ghi thêm thuộc tính page hay pageIndex
  const json = editor.getJSON();
  const heading1Node = json.content![0];
  const heading2Node = json.content![3];

  assert.equal(heading1Node.attrs?.id, "ref_heading_intro");
  assert.equal(heading1Node.attrs?.page, undefined, "AST không được lưu thuộc tính page");
  assert.equal(heading1Node.attrs?.pageNumber, undefined, "AST không được lưu thuộc tính pageNumber");

  assert.equal(heading2Node.attrs?.id, "ref_heading_arch");
  assert.equal(heading2Node.attrs?.page, undefined);
  assert.equal(heading2Node.attrs?.pageNumber, undefined);

  editor.destroy();
});

test("Phase 10 - 4. TOC reflow: inserting text before Heading pushes it to next page and TOC update reflects new page without stale cache", () => {
  // Ban đầu: Heading nằm ở Trang 1
  const initialDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "ref_heading_guide", level: 1 },
        content: [{ type: "text", text: "Hướng dẫn sử dụng" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung ban đầu" }],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: initialDoc,
  });

  // Chèn TOC
  TocService.insertToc(editor, { title: "Mục lục" });
  let tocNode = TocService.findTocNode(editor.state.doc);
  assert.ok(tocNode);
  let entry = tocNode.node.attrs.entries.find((e: any) => e.headingId === "ref_heading_guide");
  assert.ok(entry);
  assert.equal(entry.pageNumber, 1, "Ban đầu Heading ở Trang 1");

  // ĐỘT BIẾN: Chèn ngắt trang vào trước Heading đẩy nó sang Trang 2!
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.id === "ref_heading_guide") {
      editor.view.dispatch(
        editor.state.tr.insert(pos, editor.state.schema.nodes.pageBreak.create())
      );
      return false;
    }
  });

  // Gọi F9 / Update TOC
  const updateRes = TocService.updateToc(editor);
  assert.equal(updateRes.success, true);

  // KIỂM CHỨNG: TOC entry được cập nhật lên Trang 2, không bị lưu stale cache trang 1
  tocNode = TocService.findTocNode(editor.state.doc);
  assert.ok(tocNode);
  entry = tocNode.node.attrs.entries.find((e: any) => e.headingId === "ref_heading_guide");
  assert.ok(entry);
  assert.equal(entry.pageNumber, 2, "Sau khi chèn ngắt trang, TOC phải cập nhật lên Trang 2");

  editor.destroy();
});

test("Phase 10 - 5. Cross-reference format=pageNumber resolves exact page number via centralized PageLayoutMap", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Xem chi tiết tại " }],
      },
      { type: "pageBreak" },
      {
        type: "heading",
        attrs: { id: "ref_heading_specs", level: 2 },
        content: [{ type: "text", text: "Thông số kỹ thuật" }],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.equal(layoutMap.getPageCount(), 2);

  // Phân giải tham chiếu chéo với format "pageNumber"
  const resolved = CrossReferenceService.resolveTarget(
    editor.state.doc,
    {
      targetId: "ref_heading_specs",
      targetType: "heading",
      format: "pageNumber",
    },
    layoutMap
  );

  assert.equal(resolved.found, true);
  assert.equal(resolved.text, "2", "Tham chiếu chéo phải hiển thị đúng số trang 2 từ PageLayoutMap");

  editor.destroy();
});

test("Phase 10 - 6. Content insertion changes target page: updateAllCrossReferences updates display text dynamically", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tham khảo biểu đồ tại trang " },
          {
            type: "crossReference",
            attrs: {
              targetId: "ref_caption_fig_1",
              targetType: "figure",
              format: "pageNumber",
              customText: "1",
            },
          },
        ],
      },
      {
        type: "caption",
        attrs: {
          id: "ref_caption_fig_1",
          label: "Figure",
          text: "Sơ đồ luồng phân trang",
        },
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  // Ban đầu caption nằm ở Trang 1
  let initialLayout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.equal(initialLayout.getPageCount(), 1);

  // Chèn ngắt trang vào trước Caption để đẩy nó sang Trang 2
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "caption") {
      editor.view.dispatch(
        editor.state.tr.insert(pos, editor.state.schema.nodes.pageBreak.create())
      );
      return false;
    }
  });

  // Cập nhật toàn bộ tham chiếu chéo trong tài liệu (F9 / Update Fields)
  const result = CrossReferenceService.updateAllCrossReferences(editor);
  assert.equal(result.updatedCount, 1, "Phải cập nhật đúng 1 cross reference");

  // KIỂM CHỨNG: Thuộc tính customText của node crossReference trong AST đã đổi thành "2"
  let updatedCrossrefText = "";
  editor.state.doc.descendants((node) => {
    if (node.type.name === "crossReference") {
      updatedCrossrefText = node.attrs.customText;
    }
  });

  assert.equal(updatedCrossrefText, "2", "customText của tham chiếu chéo phải tự động cập nhật sang 2");

  editor.destroy();
});

test("Phase 10 - 7. Broken cross-reference target safety: nonexistent target returns [Reference not found]", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản mẫu" }],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const resolved = CrossReferenceService.resolveTarget(editor.state.doc, {
    targetId: "ref_heading_ghost_999",
    targetType: "heading",
    format: "pageNumber",
  });

  assert.equal(resolved.found, false);
  assert.equal(resolved.text, "[Reference not found]");

  editor.destroy();
});

test("Phase 10 - 8. Header / Footer total pages and current page from authoritative layout", () => {
  // Tạo tài liệu 4 trang
  const doc: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Trang 1" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Trang 2" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Trang 3" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Trang 4" }] },
    ],
  };

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const totalPages = layoutMap.getPageCount();
  assert.equal(totalPages, 4);

  const template = "Trang {PAGE} / {NUMPAGES}";

  // Kiểm tra định dạng cho từng trang lấy từ authoritative layout
  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const pageGeometry = layoutMap.getPage(pIdx)!;
    const formatted = formatHeaderFooterText(template, pageGeometry.pageNumber, totalPages);
    assert.equal(formatted, `Trang ${pIdx + 1} / 4`);
  }
});

test("Phase 10 - 9. Footnote boundary hook: NoteService.getPageForNote accurately resolves anchor page via PageLayoutMap", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn văn trang 1 có chú thích " },
          {
            type: "noteReference",
            attrs: {
              noteId: "ref_footnote_page_1",
              noteType: "footnote",
              content: "Nội dung chú thích trang 1",
            },
          },
        ],
      },
      { type: "pageBreak" },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Đoạn văn trang 2 có chú thích " },
          {
            type: "noteReference",
            attrs: {
              noteId: "ref_footnote_page_2",
              noteType: "footnote",
              content: "Nội dung chú thích trang 2",
            },
          },
        ],
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  const layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.equal(layoutMap.getPageCount(), 2);

  // Phân giải trang của footnote anchor
  const fn1Page = NoteService.getPageForNote("ref_footnote_page_1", editor.state.doc, layoutMap);
  const fn2Page = NoteService.getPageForNote("ref_footnote_page_2", editor.state.doc, layoutMap);
  const fnGhostPage = NoteService.getPageForNote("ref_footnote_ghost", editor.state.doc, layoutMap);

  assert.equal(fn1Page, 1, "Footnote 1 phải gắn neo tại Trang 1");
  assert.equal(fn2Page, 2, "Footnote 2 phải gắn neo tại Trang 2");
  assert.equal(fnGhostPage, 1, "Footnote không tồn tại trả về fallback 1 an toàn");

  editor.destroy();
});

test("Phase 10 - 10. No stale mappings across mutations and multiple updates: all consumers stay 100% in sync with PageLayoutMap", () => {
  // Bắt đầu với tài liệu có TOC, Heading, Caption, Note, CrossRef
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Tham chiếu Heading: " },
          {
            type: "crossReference",
            attrs: {
              targetId: "ref_heading_topic",
              targetType: "heading",
              format: "pageNumber",
              customText: "1",
            },
          },
        ],
      },
      {
        type: "heading",
        attrs: { id: "ref_heading_topic", level: 1 },
        content: [{ type: "text", text: "Chủ đề nghiên cứu" }],
      },
      {
        type: "caption",
        attrs: { id: "ref_caption_chart", label: "Figure", text: "Biểu đồ phân tích" },
      },
    ],
  };

  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: doc,
  });

  // Ban đầu tất cả ở Trang 1
  let layoutMap = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.equal(layoutMap.getPageCount(), 1);
  assert.equal(HeadingService.getPageForHeading("ref_heading_topic", editor.state.doc, layoutMap), 1);
  assert.equal(CaptionService.getPageForCaption("ref_caption_chart", editor.state.doc, layoutMap), 1);

  // Đột biến 1: Chèn pageBreak trước Heading
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.attrs.id === "ref_heading_topic") {
      editor.view.dispatch(
        editor.state.tr.insert(pos, editor.state.schema.nodes.pageBreak.create())
      );
      return false;
    }
  });

  // Đột biến 2: Chèn pageBreak trước Caption
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "caption" && node.attrs.id === "ref_caption_chart") {
      editor.view.dispatch(
        editor.state.tr.insert(pos, editor.state.schema.nodes.pageBreak.create())
      );
      return false;
    }
  });

  // Tái tính toán layout map
  const updatedLayout = buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);
  assert.equal(updatedLayout.getPageCount(), 3, "Tài liệu phải phân thành 3 trang");

  // Cập nhật tất cả Cross-references
  CrossReferenceService.updateAllCrossReferences(editor, updatedLayout);

  // KIỂM CHỨNG TẤT CẢ CONSUMERS ĐỒNG BỘ 100%:
  // 1. Heading ở Trang 2
  assert.equal(HeadingService.getPageForHeading("ref_heading_topic", editor.state.doc, updatedLayout), 2);

  // 2. Caption ở Trang 3
  assert.equal(CaptionService.getPageForCaption("ref_caption_chart", editor.state.doc, updatedLayout), 3);

  // 3. CrossRef text tự động cập nhật lên "2"
  let crossRefText = "";
  editor.state.doc.descendants((node) => {
    if (node.type.name === "crossReference") {
      crossRefText = node.attrs.customText;
    }
  });
  assert.equal(crossRefText, "2", "Tham chiếu chéo phải cập nhật đúng số trang 2");

  editor.destroy();
});
