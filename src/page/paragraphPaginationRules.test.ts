import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import { buildPageLayoutMap } from "./services/pageLayoutMap.ts";
import type { RenderedLineBox } from "./services/lineMeasurementService.ts";
import type { DocumentStyle } from "../styles/types/styleTypes.ts";
import { getEditorExtensions } from "../editor/editorExtensions.ts";
import { setParagraphPagination, undo, redo } from "../editor/editorCommands.ts";

/**
 * Helper tạo RenderedLineBox giả lập
 */
function createFakeLine(
  lineIndex: number,
  blockPos: number,
  lineHeight: number = 22,
  text: string = `Line ${lineIndex}`
): RenderedLineBox {
  const from = blockPos + 1 + lineIndex * 15;
  const to = from + 14;
  return {
    lineIndex,
    from,
    to,
    top: lineIndex * lineHeight,
    bottom: (lineIndex + 1) * lineHeight,
    height: lineHeight,
    left: 0,
    right: 500,
    width: 500,
    text,
  };
}

/**
 * Helper tạo danh sách N dòng giả lập
 */
function createFakeLines(count: number, blockPos: number, lineHeight: number = 22): RenderedLineBox[] {
  return Array.from({ length: count }, (_, i) => createFakeLine(i, blockPos, lineHeight));
}

// ============================================================================
// 1. KEEP WITH NEXT
// ============================================================================

test("Phase 5 - 1.1: keepWithNext moves block to next page if follower does not fit", () => {
  // Trang A4 tiêu chuẩn usable body height khoảng 960px.
  // Block 1: chiếm 920px (đầy gần hết trang 1).
  // Block 2 (Heading hoặc block có keepWithNext): cao 30px (vừa 40px còn lại trên trang 1).
  // Block 3 (Body text follower): cao 60px (3 dòng 20px).
  // Vì Block 2 có keepWithNext, nếu ở lại trang 1 thì Block 3 sẽ bị đẩy sang trang 2 -> vi phạm keepWithNext.
  // Do đó, Block 2 phải chuyển sang trang 2 cùng Block 3.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối đầu chiếm gần hết trang 1." }],
      },
      {
        type: "heading",
        attrs: { level: 2, keepWithNext: true },
        content: [{ type: "text", text: "Tiêu đề Mục 1" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung thân bài của mục 1." }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _width: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      // Khối đầu chiếm 920px (usable height ~960px, còn 40px)
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 30,
          top: 0,
          bottom: 920,
          height: 920,
          left: 0,
          right: 500,
          width: 500,
          text: "Khối đầu",
        },
      ];
    }
    // Block 3: 3 dòng x 22px = 66px (min orphan = 44px > 10px còn trống sau heading)
    return createFakeLines(3, blockPos, 22);
  };

  const measuredHeights = new Map<number, number>();
  // Block 2: pos = 32 (size = 32), height = 30px
  measuredHeights.set(32, 30);

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
    measuredBlockHeights: measuredHeights,
  });

  const headingFrag = map.getAllFragments().find((f) => f.nodeType === "heading");
  assert.ok(headingFrag, "Heading fragment must exist");
  assert.strictEqual(headingFrag.pageIndex, 1, "Heading must be moved to page 2 (0-indexed pageIndex = 1)");

  const bodyFrags = map.getAllFragments().filter((f) => f.nodeType === "paragraph");
  const bodyFrag = bodyFrags[bodyFrags.length - 1];
  assert.ok(bodyFrag, "Body fragment must exist");
  assert.strictEqual(bodyFrag.pageIndex, 1, "Body must also be on page 2");
});

test("Phase 5 - 1.2: Generic keepWithNext applies to non-heading blocks", () => {
  // Generic block policy: Paragraph thường có keepWithNext: true cũng phải hoạt động
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối 1 chiếm 920px" }],
      },
      {
        type: "paragraph",
        attrs: { keepWithNext: true },
        content: [{ type: "text", text: "Đoạn dẫn nhập cần đi liền bảng/ảnh" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn tiếp theo" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 20,
          top: 0,
          bottom: 920,
          height: 920,
          left: 0,
          right: 500,
          width: 500,
          text: "Large block",
        },
      ];
    }
    if (node.attrs?.keepWithNext) {
      return createFakeLines(1, blockPos, 25);
    }
    return createFakeLines(3, blockPos, 22);
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  const introFrag = map.getFragmentsForRange(22, 50)[0];
  assert.ok(introFrag);
  assert.strictEqual(introFrag.pageIndex, 1, "Intro paragraph with keepWithNext must move to page 2");
});

// ============================================================================
// 2. CHAIN KEEP WITH NEXT
// ============================================================================

test("Phase 5 - 2.1: Chain keepWithNext (H1 -> H2 -> Paragraph) moves entire chain together", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối đầu trang 1 (900px)" }],
      },
      {
        type: "heading",
        attrs: { level: 1, keepWithNext: true },
        content: [{ type: "text", text: "Heading 1" }],
      },
      {
        type: "heading",
        attrs: { level: 2, keepWithNext: true },
        content: [{ type: "text", text: "Heading 2" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Body content following H2" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 25,
          top: 0,
          bottom: 900,
          height: 900,
          left: 0,
          right: 500,
          width: 500,
          text: "Pre block",
        },
      ];
    }
    return createFakeLines(3, blockPos, 22);
  };

  const measuredHeights = new Map<number, number>();
  // H1 height: 35px, H2 height: 30px
  // Usable height ~960px. Còn lại trên trang 1 là 60px.
  // H1 (35px) vừa, nhưng H2 (30px) và Body không vừa.
  measuredHeights.set(27, 35); // H1 pos
  measuredHeights.set(38, 30); // H2 pos

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
    measuredBlockHeights: measuredHeights,
  });

  const h1Frag = map.getFragmentForPosition(27);
  const h2Frag = map.getFragmentForPosition(38);
  assert.ok(h1Frag);
  assert.ok(h2Frag);
  assert.strictEqual(h1Frag.pageIndex, 1, "H1 must move to page 2");
  assert.strictEqual(h2Frag.pageIndex, 1, "H2 must move to page 2 with H1");
});

// ============================================================================
// 3. KEEP LINES TOGETHER
// ============================================================================

test("Phase 5 - 3.1: keepLinesTogether avoids splitting if paragraph fits entirely on a fresh page", () => {
  // Paragraph có 10 dòng x 22px = 220px.
  // Trang 1 còn trống 80px (vừa 3 dòng, không vừa 10 dòng).
  // Vì keepLinesTogether: true và 220px <= page capacity (~960px),
  // toàn bộ paragraph phải chuyển sang trang 2 và không bị split (chính xác 1 fragment).

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối chiếm 880px ở trang 1" }],
      },
      {
        type: "paragraph",
        attrs: { keepLinesTogether: true },
        content: [{ type: "text", text: "Đoạn văn 10 dòng cần giữ cùng nhau" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 28,
          top: 0,
          bottom: 880,
          height: 880,
          left: 0,
          right: 500,
          width: 500,
          text: "First block",
        },
      ];
    }
    return createFakeLines(10, blockPos, 22);
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  const targetFrags = map.getFragmentsForRange(31, 65);
  assert.strictEqual(targetFrags.length, 1, "Paragraph with keepLinesTogether must not be split");
  assert.strictEqual(targetFrags[0].pageIndex, 1, "Must be placed on page 2");
  assert.strictEqual(targetFrags[0].continuedFromPreviousPage, false);
  assert.strictEqual(targetFrags[0].continuesToNextPage, false);
});

test("Phase 5 - 3.2: keepLinesTogether fallback when paragraph > page capacity (oversized fallback)", () => {
  // Paragraph có 60 dòng x 22px = 1320px > page capacity (~960px).
  // Không thể nhét trọn 1 trang -> Relax rule và split an toàn qua nhiều trang.
  // Không loop, hội tụ ngay lập tức.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { keepLinesTogether: true },
        content: [{ type: "text", text: "Đoạn văn khổng lồ 60 dòng" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    return createFakeLines(60, blockPos, 22);
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  const frags = map.getAllFragments();
  assert.ok(frags.length >= 2, "Oversized paragraph must be safely split across multiple pages");
  assert.ok(map.getPageCount() >= 2, "Must create multiple pages");
  assert.strictEqual(frags[0].pageIndex, 0);
  assert.strictEqual(frags[1].pageIndex, 1);
  assert.strictEqual(frags[0].continuesToNextPage, true);
  assert.strictEqual(frags[1].continuedFromPreviousPage, true);
});

// ============================================================================
// 4. WIDOW / ORPHAN CONTROL
// ============================================================================

test("Phase 5 - 4.1: Orphan rule (minOrphanLines = 2) moves paragraph if only 1 line fits at page bottom", () => {
  // Paragraph 4 dòng (mỗi dòng 22px).
  // Trang 1 còn trống 30px (chỉ vừa 1 dòng 22px, < 2 orphan lines).
  // Orphan rule: Không để 1 line đơn độc ở cuối trang -> Chuyển cả paragraph sang trang 2!

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối làm trang 1 chỉ còn 30px" }],
      },
      {
        type: "paragraph",
        attrs: { widowControl: true },
        content: [{ type: "text", text: "Đoạn văn 4 dòng kiểm tra orphan" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 30,
          top: 0,
          bottom: 935,
          height: 935, // usable ~960px -> còn ~25px
          left: 0,
          right: 500,
          width: 500,
          text: "Block filling page 1",
        },
      ];
    }
    return createFakeLines(4, blockPos, 22);
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  const paraFrags = map.getFragmentsForRange(33, 70);
  assert.strictEqual(paraFrags.length, 1, "Whole paragraph must be on page 2 due to orphan rule");
  assert.strictEqual(paraFrags[0].pageIndex, 1, "Must be placed entirely on page 2");
});

test("Phase 5 - 4.2: Widow rule (minWidowLines = 2) leaves at least 2 lines on next page", () => {
  // Paragraph 4 dòng x 22px.
  // Trang 1 còn trống 70px (vừa 3 dòng = 66px, còn 1 dòng tràn sang trang 2).
  // Nếu lấy 3 dòng ở trang 1 thì trang 2 chỉ còn 1 dòng -> vi phạm widow!
  // Widow rule: Trang 1 chỉ lấy 2 dòng (44px), nhường 1 dòng sang trang 2 để trang 2 có 2 dòng (44px).

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối đầu trang 1" }],
      },
      {
        type: "paragraph",
        attrs: { widowControl: true },
        content: [{ type: "text", text: "Đoạn văn 4 dòng kiểm tra widow" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 20,
          top: 0,
          bottom: 855,
          height: 855, // usable ~930px -> còn ~75px (vừa 3 dòng x 22px = 66px, tràn dòng 4)
          left: 0,
          right: 500,
          width: 500,
          text: "Header block",
        },
      ];
    }
    return createFakeLines(4, blockPos, 22);
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  const allFrags = map.getAllFragments();
  const frags = allFrags.filter((f) => f.from >= 18);
  assert.strictEqual(frags.length, 2, "Paragraph must split into 2 fragments across page boundary");
  assert.strictEqual(frags[0].pageIndex, 0);
  assert.strictEqual(frags[1].pageIndex, 1);

  // Frag 0 ở trang 1 phải có chiều cao 44px (2 dòng), không phải 66px (3 dòng)
  assert.strictEqual(frags[0].height, 44, "Page 1 must hold 2 lines (44px) so that page 2 has 2 lines");
  assert.strictEqual(frags[1].height, 44, "Page 2 must hold 2 lines (44px) to satisfy minWidowLines = 2");
});

// ============================================================================
// 5. PAGE BREAK BEFORE
// ============================================================================

test("Phase 5 - 5.1: pageBreakBefore starts block on new page without inserting AST node", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn ngắn ở trang 1." }],
      },
      {
        type: "heading",
        attrs: { level: 1, pageBreakBefore: true },
        content: [{ type: "text", text: "Chương mới bắt đầu trang 2" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 2, "Must create 2 pages");

  const headingFrag = map.getFragmentForPosition(27);
  assert.ok(headingFrag);
  assert.strictEqual(headingFrag.pageIndex, 1, "Heading with pageBreakBefore must start on page 2");
  assert.strictEqual(headingFrag.nodeType, "heading", "Node type must remain heading");

  // Đảm bảo không có fragment giả dạng pageBreak
  const breakFrags = map.getAllFragments().filter((f) => f.nodeType === "pageBreak");
  assert.strictEqual(breakFrags.length, 0, "No pageBreak AST fragments should be created");
});

test("Phase 5 - 5.2: pageBreakBefore at top of first page does not create unnecessary empty page", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, pageBreakBefore: true },
        content: [{ type: "text", text: "Đầu tài liệu" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 1, "Must not create empty page when block is already at top of page");
  assert.strictEqual(map.getAllFragments()[0].pageIndex, 0);
});

// ============================================================================
// 6. CONFLICT POLICY & OVERSIZED KEEP-GROUP CONVERGENCE
// ============================================================================

test("Phase 5 - 6.1: Conflict policy relaxes lowest priority constraint when keep-group > page capacity", () => {
  // Heading (keepWithNext) + Heading (keepWithNext) + Oversized Paragraph (keepLinesTogether)
  // Tổng chiều cao vượt quá 1 trang -> Relax keepLinesTogether của paragraph follower -> hội tụ không loop!

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung trang 1 (900px)" }],
      },
      {
        type: "heading",
        attrs: { level: 1, keepWithNext: true },
        content: [{ type: "text", text: "Heading 1" }],
      },
      {
        type: "heading",
        attrs: { level: 2, keepWithNext: true },
        content: [{ type: "text", text: "Heading 2" }],
      },
      {
        type: "paragraph",
        attrs: { keepLinesTogether: true },
        content: [{ type: "text", text: "Paragraph follower rất dài" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 26,
          top: 0,
          bottom: 900,
          height: 900,
          left: 0,
          right: 500,
          width: 500,
          text: "Fill page 1",
        },
      ];
    }
    // Follower paragraph 50 dòng x 22px = 1100px (> 1 page ~960px)
    return createFakeLines(50, blockPos, 22);
  };

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(28, 35); // H1
  measuredHeights.set(39, 30); // H2

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
    measuredBlockHeights: measuredHeights,
  });

  // Kiểm tra kết quả:
  // H1 & H2 di chuyển sang trang 2 cùng phần đầu của paragraph
  const h1Frag = map.getFragmentForPosition(28);
  const h2Frag = map.getFragmentForPosition(39);
  assert.ok(h1Frag);
  assert.ok(h2Frag);
  assert.strictEqual(h1Frag.pageIndex, 1, "H1 moved to page 2");
  assert.strictEqual(h2Frag.pageIndex, 1, "H2 moved to page 2");

  // Paragraph follower bị split sang trang 3
  const paraFrags = map.getAllFragments().filter((f) => f.from >= 45);
  assert.ok(paraFrags.length >= 2, "Paragraph must be split across pages 2 and 3");
  assert.strictEqual(paraFrags[0].pageIndex, 1);
  assert.strictEqual(paraFrags[1].pageIndex, 2);
});

// ============================================================================
// 7. MIXED STYLE & DIRECT PROPERTY PRECEDENCE
// ============================================================================

test("Phase 5 - 7.1: Direct property overrides style definition", () => {
  // Style định nghĩa keepWithNext: true, nhưng direct attrs ghi đè keepWithNext: false
  const customStyle: DocumentStyle = {
    id: "style_custom_callout",
    name: "Callout",
    type: "paragraph",
    isBuiltIn: false,
    paragraph: {
      keepWithNext: true,
      widowControl: true,
    },
  };

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 1 gần đầy (920px)" }],
      },
      {
        type: "paragraph",
        attrs: {
          styleId: "style_custom_callout",
          keepWithNext: false, // DIRECT OVERRIDE ghi đè style!
        },
        content: [{ type: "text", text: "Callout block vừa 30px trang 1" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối kế tiếp bị đẩy sang trang 2" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 26,
          top: 0,
          bottom: 880,
          height: 880, // usable ~930px -> còn ~50px (vừa callout 25px, nhưng không vừa block tiếp theo 66px)
          left: 0,
          right: 500,
          width: 500,
          text: "Page 1 block",
        },
      ];
    }
    if (node.attrs?.styleId === "style_custom_callout") {
      return createFakeLines(1, blockPos, 25); // vừa 50px còn lại
    }
    return createFakeLines(3, blockPos, 22);
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
    documentStyles: [customStyle],
  });

  const allFrags = map.getAllFragments();
  const calloutFrag = allFrags.find((f) => f.from >= 25 && f.to <= 57);
  assert.ok(calloutFrag, "Callout frag must exist");
  assert.strictEqual(calloutFrag.pageIndex, 0, "Direct keepWithNext: false must keep block on page 1");
});

// ============================================================================
// 8. BUILT-IN HEADING DEFAULT POLICIES
// ============================================================================

test("Phase 5 - 8.1: Built-in Heading 1 defaults to keepWithNext without hardcoding in HeadingService", () => {
  // Không cần direct attrs. Heading 1 tự động kế thừa keepWithNext từ builtInStyles
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối đầy trang 1 (920px)" }],
      },
      {
        type: "heading",
        attrs: { level: 1 }, // KHÔNG CÓ direct keepWithNext
        content: [{ type: "text", text: "Tiêu đề Heading 1 tự động keepWithNext" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Thân bài" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      return [
        {
          lineIndex: 0,
          from: 1,
          to: 26,
          top: 0,
          bottom: 920,
          height: 920,
          left: 0,
          right: 500,
          width: 500,
          text: "Full block",
        },
      ];
    }
    return createFakeLines(3, blockPos, 22);
  };

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(28, 30); // Heading height: 30px (vừa 40px còn lại nhưng thân bài không vừa)

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
    measuredBlockHeights: measuredHeights,
  });

  const h1Frag = map.getFragmentForPosition(28);
  assert.ok(h1Frag);
  assert.strictEqual(
    h1Frag.pageIndex,
    1,
    "Heading 1 must automatically move to page 2 due to built-in style default keepWithNext"
  );
});

// ============================================================================
// 9. NO INFINITE LOOP / CONVERGENCE ASSURANCE
// ============================================================================

test("Phase 5 - 9.1: Edge case small usable capacity converges deterministically without hanging", () => {
  const start = Date.now();

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { keepLinesTogether: true, widowControl: true },
        content: [{ type: "text", text: "A".repeat(500) }],
      },
    ],
  };

  // Trang cực nhỏ chỉ cao 100px, 1 dòng cao 30px
  const customPageSettings = {
    ...DEFAULT_PAGE_SETTINGS,
    margins: { top: 120, bottom: 120, left: 25, right: 25 },
  };

  const map = buildPageLayoutMap(doc, customPageSettings);
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 2000, "Pagination with edge case capacity must terminate quickly (< 2s)");
  assert.ok(map.getPageCount() >= 1, "Must generate valid pages");
});

// ============================================================================
// 10. UNDO / REDO PAGINATION PROPERTY CHANGES
// ============================================================================

test("Phase 5 - 10.1: Undo/Redo property changes for paragraph pagination rules", () => {
  const editor = new Editor({
    extensions: getEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Paragraph test undo redo" }],
        },
      ],
    },
  });

  // Ban đầu attrs chưa có override
  let node = editor.state.doc.child(0);
  assert.strictEqual(node.attrs.keepWithNext, null);
  assert.strictEqual(node.attrs.keepLinesTogether, null);
  assert.strictEqual(node.attrs.pageBreakBefore, null);

  // 1. Áp dụng setParagraphPagination
  setParagraphPagination(editor, {
    keepWithNext: true,
    keepLinesTogether: true,
    pageBreakBefore: true,
    widowControl: false,
  });

  node = editor.state.doc.child(0);
  assert.strictEqual(node.attrs.keepWithNext, true);
  assert.strictEqual(node.attrs.keepLinesTogether, true);
  assert.strictEqual(node.attrs.pageBreakBefore, true);
  assert.strictEqual(node.attrs.widowControl, false);

  // 2. Undo
  undo(editor);
  node = editor.state.doc.child(0);
  assert.strictEqual(node.attrs.keepWithNext, null);
  assert.strictEqual(node.attrs.keepLinesTogether, null);
  assert.strictEqual(node.attrs.pageBreakBefore, null);

  // 3. Redo
  redo(editor);
  node = editor.state.doc.child(0);
  assert.strictEqual(node.attrs.keepWithNext, true);
  assert.strictEqual(node.attrs.keepLinesTogether, true);
  assert.strictEqual(node.attrs.pageBreakBefore, true);
  assert.strictEqual(node.attrs.widowControl, false);
});

