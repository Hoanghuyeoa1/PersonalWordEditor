import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE_SETTINGS, MARGIN_PRESETS } from "./services/pageConstants.ts";
import { buildPageLayoutMap } from "./services/pageLayoutMap.ts";
import type { RenderedLineBox } from "./services/lineMeasurementService.ts";
import { formatHeaderFooterText } from "./types/headerFooterTypes.ts";
import { mmToPx } from "./services/pageSettingsService.ts";

/**
 * Helper tạo N RenderedLineBox giả lập
 */
function createFakeLines(count: number, blockPos: number, lineHeight: number = 22): RenderedLineBox[] {
  return Array.from({ length: count }, (_, i) => {
    const from = blockPos + 1 + i * 15;
    const to = from + 14;
    return {
      lineIndex: i,
      from,
      to,
      top: i * lineHeight,
      bottom: (i + 1) * lineHeight,
      height: lineHeight,
      left: 0,
      right: 500,
      width: 500,
      text: `Line ${i}`,
    };
  });
}

// ============================================================================
// 1. EXPLICIT PAGE BREAK
// ============================================================================

test("Phase 6 - 1.1: Explicit pageBreak separates Content A and Content B cleanly", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung Khối A trên Trang 1." }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung Khối B bắt đầu tại đỉnh Trang 2." }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 2, "Must create exactly 2 pages");

  const frags = map.getAllFragments();
  const fragA = frags[0];
  const breakFrag = frags[1];
  const fragB = frags[2];

  // Khối A trên trang 0
  assert.strictEqual(fragA.pageIndex, 0);
  assert.strictEqual(fragA.nodeType, "paragraph");

  // Node pageBreak trên trang 0
  assert.strictEqual(breakFrag.pageIndex, 0);
  assert.strictEqual(breakFrag.nodeType, "pageBreak");

  // Khối B bắt đầu tại đỉnh body area của trang 1
  assert.strictEqual(fragB.pageIndex, 1);
  assert.strictEqual(fragB.nodeType, "paragraph");

  const page1 = map.getPage(1)!;
  assert.strictEqual(
    fragB.top,
    page1.usableBodyBounds.y,
    "Content B must start at top of usable body bounds on page 2"
  );
});

// ============================================================================
// 2. AUTO FLOW + EXPLICIT BREAK
// ============================================================================

test("Phase 6 - 2.1: Flow supports automatic paragraph fragmentation -> explicit break -> auto flow", () => {
  // Paragraph 1 dài, split qua Trang 1 và Trang 2.
  // Trên Trang 2, theo sau là 1 explicit pageBreak.
  // Paragraph 2 sau pageBreak bắt đầu ở Trang 3 và tự động flow.
  // Không có double-break hoặc trang trắng ngoài ý muốn.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { widowControl: false },
        content: [{ type: "text", text: "Paragraph 1 rất dài bị cắt" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Paragraph 2 bắt đầu trang 3" }],
      },
    ],
  };

  const lineProvider = (node: JSONContent, _w: number, blockPos: number): RenderedLineBox[] => {
    if (blockPos === 0) {
      // Usable height ~930px.
      // 45 dòng x 22px = 990px -> 42 dòng ở trang 1 (924px), 3 dòng tràn sang trang 2 (66px)
      return createFakeLines(45, blockPos, 22);
    }
    return createFakeLines(5, blockPos, 22);
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    lineMeasureProvider: lineProvider,
  });

  // Tổng cộng 3 trang:
  // Trang 1: Para 1 phần đầu (42 dòng)
  // Trang 2: Para 1 phần đuôi (3 dòng) + PageBreak
  // Trang 3: Para 2 (5 dòng)
  assert.strictEqual(map.getPageCount(), 3, "Must create exactly 3 pages without extra blank pages");

  const frags = map.getAllFragments();
  const para1Page1 = frags[0];
  const para1Page2 = frags[1];
  const breakFrag = frags[2];
  const para2Page3 = frags[3];

  assert.strictEqual(para1Page1.pageIndex, 0);
  assert.strictEqual(para1Page1.continuesToNextPage, true);

  assert.strictEqual(para1Page2.pageIndex, 1);
  assert.strictEqual(para1Page2.continuedFromPreviousPage, true);

  assert.strictEqual(breakFrag.pageIndex, 1);
  assert.strictEqual(breakFrag.nodeType, "pageBreak");

  assert.strictEqual(para2Page3.pageIndex, 2);
  const page2 = map.getPage(2)!;
  assert.strictEqual(para2Page3.top, page2.usableBodyBounds.y, "Para 2 must start at top of page 3");
});

// ============================================================================
// 3. ADJACENT BREAKS (PageBreak + PageBreak, SectionBreak + PageBreak, PageBreak + SectionBreak)
// ============================================================================

test("Phase 6 - 3.1: Adjacent PageBreaks create exactly 1 blank page without runaway pages", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối A trên trang 1" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Khối B trên trang 3" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  // Trang 1: Khối A + Break 1
  // Trang 2: Break 2 (trang trắng)
  // Trang 3: Khối B
  assert.strictEqual(map.getPageCount(), 3, "Adjacent page breaks must create exactly 3 pages");

  const frags = map.getAllFragments();
  const fragA = frags[0];
  const break1 = frags[1];
  const break2 = frags[2];
  const fragB = frags[3];

  assert.strictEqual(fragA.pageIndex, 0);
  assert.strictEqual(break1.pageIndex, 0);
  assert.strictEqual(break2.pageIndex, 1, "Second break must be placed on page 2");
  assert.strictEqual(fragB.pageIndex, 2, "Content B must be placed on page 3");
});

test("Phase 6 - 3.2: Adjacent SectionBreak + PageBreak behavior is deterministic", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1 nội dung" }],
      },
      {
        type: "sectionBreak",
        attrs: { sectionId: "sec-2" },
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 2 nội dung sau PageBreak" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  // Section 1: Trang 1 (chứa para + sectionBreak)
  // Section 2: Trang 2 (chứa pageBreak) -> Trang 3 (chứa paragraph)
  assert.strictEqual(map.getPageCount(), 3);
  assert.strictEqual(map.getSectionForPage(0), 1);
  assert.strictEqual(map.getSectionForPage(1), 2);
  assert.strictEqual(map.getSectionForPage(2), 2);
});

test("Phase 6 - 3.3: Adjacent PageBreak + SectionBreak behavior is deterministic", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1 khối A" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "sectionBreak",
        attrs: { sectionId: "sec-2" },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 2 khối B" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  // Section 1: Trang 1 (para A + pageBreak) -> Trang 2 (trang trống chứa sectionBreak)
  // Section 2: Trang 3 (para B)
  assert.strictEqual(map.getPageCount(), 3);
  assert.strictEqual(map.getSectionForPage(0), 1);
  assert.strictEqual(map.getSectionForPage(1), 1);
  assert.strictEqual(map.getSectionForPage(2), 2);
});

// ============================================================================
// 4. SECTION BOUNDARY & NO CROSSING FRAGMENTS
// ============================================================================

test("Phase 6 - 4.1: No visual fragment crosses Section Break boundary", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1 paragraph" }],
      },
      {
        type: "sectionBreak",
        attrs: { sectionId: "sec-2" },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 2 paragraph" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 2);

  const frags = map.getAllFragments();
  const sec1Frags = frags.filter((f) => f.pageIndex === 0);
  const sec2Frags = frags.filter((f) => f.pageIndex === 1);

  // Không fragment nào của Sec 1 mang continuesToNextPage sang Sec 2
  for (const f of sec1Frags) {
    assert.strictEqual(
      f.continuesToNextPage,
      false,
      "No fragment in Section 1 should continue across Section Break"
    );
  }

  // Không fragment nào của Sec 2 mang continuedFromPreviousPage từ Sec 1
  for (const f of sec2Frags) {
    assert.strictEqual(
      f.continuedFromPreviousPage,
      false,
      "No fragment in Section 2 should continue from Section 1"
    );
  }
});

// ============================================================================
// 5. MIXED PAGE GEOMETRY (Portrait -> Landscape, Margins, Paper Size)
// ============================================================================

test("Phase 6 - 5.1: Section transition from A4 Portrait to A4 Landscape resolves geometry per-section", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1: A4 Dọc tiêu chuẩn." }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-landscape",
          pageSettings: {
            paperSize: "A4",
            orientation: "landscape",
            margins: MARGIN_PRESETS.Normal,
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 2: A4 Ngang với chiều rộng lớn hơn." }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 2);

  const page1 = map.getPage(0)!;
  const page2 = map.getPage(1)!;

  // Page 1: Portrait
  assert.strictEqual(page1.orientation, "portrait");
  assert.strictEqual(page1.widthMm, 210);
  assert.strictEqual(page1.heightMm, 297);
  assert.ok(page1.widthPx < page1.heightPx);

  // Page 2: Landscape
  assert.strictEqual(page2.orientation, "landscape");
  assert.strictEqual(page2.widthMm, 297);
  assert.strictEqual(page2.heightMm, 210);
  assert.ok(page2.widthPx > page2.heightPx);

  // Usable bounds resolution
  assert.ok(
    page2.usableBodyBounds.width > page1.usableBodyBounds.width,
    "Landscape page must have wider usable body bounds than portrait page"
  );
  assert.ok(
    page1.usableBodyBounds.height > page2.usableBodyBounds.height,
    "Portrait page must have taller usable body bounds than landscape page"
  );
});

test("Phase 6 - 5.2: Different paper sizes (Letter -> Legal -> A3) resolved dynamically without global constants", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Sec 1: Letter" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-legal",
          pageSettings: {
            paperSize: "Legal",
            orientation: "portrait",
            margins: MARGIN_PRESETS.Normal,
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Sec 2: Legal" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-a3",
          pageSettings: {
            paperSize: "A3",
            orientation: "portrait",
            margins: MARGIN_PRESETS.Normal,
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Sec 3: A3" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, {
    paperSize: "Letter",
    orientation: "portrait",
    margins: MARGIN_PRESETS.Normal,
  });

  assert.strictEqual(map.getPageCount(), 3);

  const p1 = map.getPage(0)!;
  const p2 = map.getPage(1)!;
  const p3 = map.getPage(2)!;

  assert.strictEqual(p1.paperSize, "Letter");
  assert.strictEqual(p2.paperSize, "Legal");
  assert.strictEqual(p3.paperSize, "A3");

  // Legal (355.6mm) cao hơn Letter (279.4mm)
  assert.ok(p2.heightPx > p1.heightPx);
  // A3 (297x420mm) lớn hơn cả Letter và Legal
  assert.ok(p3.widthPx > p1.widthPx);
  assert.ok(p3.heightPx > p2.heightPx);
});

test("Phase 6 - 5.3: Custom margins resolve correctly per-section without global usablePageHeight", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Sec 1: Lề rộng (Wide)" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-narrow",
          pageSettings: {
            paperSize: "A4",
            orientation: "portrait",
            margins: { top: 10, right: 10, bottom: 10, left: 10 },
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Sec 2: Lề hẹp 10mm" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: MARGIN_PRESETS.Wide,
  });

  const p1 = map.getPage(0)!;
  const p2 = map.getPage(1)!;

  // Lề 10mm cho usable area rộng và cao hơn nhiều so với Wide margins (top/bottom 25.4, left/right 50.8)
  assert.ok(p2.usableBodyBounds.width > p1.usableBodyBounds.width);
  assert.ok(p2.usableBodyBounds.height > p1.usableBodyBounds.height);
});

// ============================================================================
// 6. HEADER / FOOTER BODY BOUNDS EXCLUSION
// ============================================================================

test("Phase 6 - 6.1: Body usable area properly excludes header region, footer region and margins", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm vùng thân trang." }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const p0 = map.getPage(0)!;

  const topMarginPx = mmToPx(DEFAULT_PAGE_SETTINGS.margins.top);
  const bottomMarginPx = mmToPx(DEFAULT_PAGE_SETTINGS.margins.bottom);

  // Usable body bắt đầu đúng sau lề trên
  assert.strictEqual(Math.round(p0.usableBodyBounds.y), Math.round(topMarginPx));

  // Chiều cao usable body = tổng chiều cao trang - (lề trên + lề dưới)
  const expectedHeight = p0.heightPx - (topMarginPx + bottomMarginPx);
  assert.strictEqual(Math.round(p0.usableBodyBounds.height), Math.round(expectedHeight));

  // Vùng Header nằm hoàn toàn phía trên Usable Body Bounds
  assert.ok(
    p0.headerBounds.y + p0.headerBounds.height <= p0.usableBodyBounds.y,
    "Header bounds must lie strictly above or within top margin, outside body"
  );

  // Vùng Footer nằm hoàn toàn phía dưới Usable Body Bounds
  assert.ok(
    p0.footerBounds.y >= p0.usableBodyBounds.y + p0.usableBodyBounds.height,
    "Footer bounds must lie strictly below usable body bounds"
  );

  // Không có fragment nào của header/footer text bị nhầm vào body fragments
  const frags = map.getAllFragments();
  for (const f of frags) {
    assert.notStrictEqual(f.nodeType, "header");
    assert.notStrictEqual(f.nodeType, "footer");
  }
});

// ============================================================================
// 7. DYNAMIC PAGE NUMBER TOKENS ({PAGE}, {NUMPAGES})
// ============================================================================

test("Phase 6 - 7.1: {PAGE} and {NUMPAGES} dynamically reflect computed page count without persistence", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 1" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 2" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang 3" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const totalPages = map.getPageCount();
  assert.strictEqual(totalPages, 3);

  const template = "Trang {PAGE} / {NUMPAGES}";

  // Trang 1
  const t1 = formatHeaderFooterText(template, map.getPage(0)!.pageNumber, totalPages);
  assert.strictEqual(t1, "Trang 1 / 3");

  // Trang 2
  const t2 = formatHeaderFooterText(template, map.getPage(1)!.pageNumber, totalPages);
  assert.strictEqual(t2, "Trang 2 / 3");

  // Trang 3
  const t3 = formatHeaderFooterText(template, map.getPage(2)!.pageNumber, totalPages);
  assert.strictEqual(t3, "Trang 3 / 3");

  // Computed page count không được lưu vào AST doc
  assert.strictEqual(
    (doc.attrs as Record<string, unknown> | undefined)?.pageCount,
    undefined,
    "Page count must not be persisted into AST doc attrs"
  );
});

// ============================================================================
// 8. OLD PAGE BREAK REGRESSION
// ============================================================================

test("Phase 6 - 8.1: Legacy page break document round-trip without regressions", () => {
  const legacyDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 1 trước ngắt trang cũ" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn 2 sau ngắt trang cũ" }],
      },
    ],
  };

  const map = buildPageLayoutMap(legacyDoc, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 2);

  // Position query
  assert.strictEqual(map.getPageNumberForPosition(5), 1);
  const frag2 = map.getAllFragments().find((f) => f.pageIndex === 1 && f.nodeType === "paragraph");
  assert.ok(frag2);
  assert.strictEqual(map.getPageNumberForPosition(frag2.from + 2), 2);
});
