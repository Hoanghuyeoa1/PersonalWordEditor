import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import {
  calculatePaginationDimensions,
  calculateExplicitBreakSpacer,
  countExplicitPageBreaks,
  estimateContentHeightPx,
  calculatePaginationState,
  PAGE_GAP_PX,
} from "./services/paginationService.ts";
import { usePaginationStore } from "../stores/paginationStore.ts";
import { useZoomStore } from "../stores/zoomStore.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";

test("Pagination 1: Document with < 1 page produces exactly 1 page", () => {
  const shortDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Tài liệu ngắn gọn dưới một trang A4 tiêu chuẩn." }],
      },
    ],
  };

  const state = calculatePaginationState(shortDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.strictEqual(state.pageCount, 1);
  assert.strictEqual(state.pages.length, 1);
  assert.strictEqual(state.pages[0].pageNumber, 1);
  assert.strictEqual(state.pages[0].breakType, "start");
  assert.strictEqual(state.pages[0].widthMm, 210);
  assert.strictEqual(state.pages[0].heightMm, 297);
  assert.ok(state.usableHeightPx > 800, "Usable height should accommodate full content");
});

test("Pagination 2: Document with ~2 pages of content overflows to 2 pages", () => {
  const longParagraphText = "Đây là đoạn văn bản mẫu có độ dài đáng kể nhằm kiểm tra tràn trang tự động. ".repeat(15);
  const twoPageDoc: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: longParagraphText }] },
      { type: "paragraph", content: [{ type: "text", text: longParagraphText }] },
      { type: "paragraph", content: [{ type: "text", text: longParagraphText }] },
      { type: "paragraph", content: [{ type: "text", text: longParagraphText }] },
      { type: "paragraph", content: [{ type: "text", text: longParagraphText }] },
    ],
  };

  const state = calculatePaginationState(twoPageDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.ok(
    state.pageCount >= 2,
    `Expected at least 2 pages for ~2 page content, got ${state.pageCount}`
  );
  assert.strictEqual(state.pages.length, state.pageCount);
  assert.strictEqual(state.pages[0].pageNumber, 1);
  assert.strictEqual(state.pages[1].pageNumber, 2);
  assert.strictEqual(state.pages[1].breakType, "overflow");
});

test("Pagination 3: Nhiều paragraph (15+ paragraphs) creates multiple visual pages", () => {
  const paragraphs: JSONContent[] = [];
  for (let i = 1; i <= 20; i++) {
    paragraphs.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `Đoạn văn thứ ${i}: Personal Word Editor kiểm tra hệ thống phân trang đa trang tự động dựa trên rendered dimensions thực tế mà không mutate AST. Phân trang nhiều trang trực quan giúp người dùng dễ dàng theo dõi bố cục chuẩn desktop. `.repeat(3),
        },
      ],
    });
  }

  const multiParaDoc: JSONContent = {
    type: "doc",
    content: paragraphs,
  };

  const state = calculatePaginationState(multiParaDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.ok(state.pageCount >= 2, `Multi-paragraph document should require multiple pages (got ${state.pageCount})`);
  assert.strictEqual(state.pages.length, state.pageCount);

  // Kiểm tra tọa độ của từng trang
  for (let i = 0; i < state.pages.length; i++) {
    const page = state.pages[i];
    assert.strictEqual(page.pageNumber, i + 1);
    const expectedTop = i * (state.pageHeightPx + state.pageGapPx);
    assert.strictEqual(page.topPx, expectedTop);
    assert.strictEqual(page.bottomPx, expectedTop + state.pageHeightPx);
  }
});

test("Pagination 4: Headings level 1, 2, 3 contribute to height and layout calculation", () => {
  const headingDoc: JSONContent = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Tiêu đề Chương 1" }] },
      { type: "paragraph", content: [{ type: "text", text: "Nội dung mở đầu chương 1." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Mục 1.1 Khái quát" }] },
      { type: "paragraph", content: [{ type: "text", text: "Chi tiết các nguyên lý kiến trúc." }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Tiểu mục 1.1.1 Yêu cầu kỹ thuật" }] },
    ],
  };

  const height = estimateContentHeightPx(headingDoc, 600);
  assert.ok(height > 200, "Headings with margins and font size must have significant height");

  const state = calculatePaginationState(headingDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });
  assert.strictEqual(state.pageCount, 1);
});

test("Pagination 5: Lists (bulletList and orderedList) are included in content measurement", () => {
  const listDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Mục gạch đầu dòng 1" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Mục gạch đầu dòng 2" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Mục gạch đầu dòng 3" }] }] },
        ],
      },
      {
        type: "orderedList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Mục đánh số 1" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Mục đánh số 2" }] }] },
        ],
      },
    ],
  };

  const height = estimateContentHeightPx(listDoc, 600);
  assert.ok(height > 100, "List items should contribute height");

  const state = calculatePaginationState(listDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });
  assert.strictEqual(state.pageCount, 1);
});

test("Pagination 6: Explicit Page Break starts a new physical sheet deterministically", () => {
  const docWithBreak: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Nội dung phần A nằm ở Trang 1." }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Nội dung phần B bắt đầu ở Trang 2." }] },
    ],
  };

  assert.strictEqual(countExplicitPageBreaks(docWithBreak), 1);

  const state = calculatePaginationState(docWithBreak, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  // Có 1 pageBreak -> pageCount chắc chắn >= 2
  assert.ok(state.pageCount >= 2, `Explicit page break must produce at least 2 pages, got ${state.pageCount}`);
  assert.strictEqual(state.pages[1].breakType, "explicit");

  // Kiểm tra công thức spacer ngắt trang
  const pageHeightPx = state.pageHeightPx;
  const marginTopPx = state.marginsPx.top;
  const breakOffsetTop = 300; // Giả định vị trí ngắt trang tại Y = 300px

  const spacer = calculateExplicitBreakSpacer(
    breakOffsetTop,
    pageHeightPx,
    PAGE_GAP_PX,
    marginTopPx
  );

  // Điểm kết thúc của spacer phải trùng khớp với lề trên của Trang 2
  const targetTop = breakOffsetTop + spacer;
  const expectedPage2ContentTop = (pageHeightPx + PAGE_GAP_PX) + marginTopPx;
  assert.strictEqual(
    targetTop,
    expectedPage2ContentTop,
    `Spacer must land exactly at page 2 top margin (expected ${expectedPage2ContentTop}, got ${targetTop})`
  );
});

test("Pagination 6b: Multiple consecutive Page Breaks create corresponding physical sheets", () => {
  const multiBreakDoc: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Trang 1" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Trang 2" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Trang 3" }] },
    ],
  };

  assert.strictEqual(countExplicitPageBreaks(multiBreakDoc), 2);

  const state = calculatePaginationState(multiBreakDoc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.strictEqual(state.pageCount, 3);
  assert.strictEqual(state.pages.length, 3);
  assert.strictEqual(state.pages[0].breakType, "start");
  assert.strictEqual(state.pages[1].breakType, "explicit");
  assert.strictEqual(state.pages[2].breakType, "explicit");
});

test("Pagination 7: Large font increases estimated content height", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn dài để kiểm tra độ cao tương ứng kích thước font chữ.".repeat(10) }],
      },
    ],
  };

  const normalHeight = estimateContentHeightPx(doc, 600, 11);
  const largeHeight = estimateContentHeightPx(doc, 600, 24);

  assert.ok(
    largeHeight > normalHeight,
    `Large font height (${largeHeight}) must exceed normal font height (${normalHeight})`
  );
});

test("Pagination 8: Narrow vs Wide Margins affect usable dimensions and capacity", () => {
  const dimNormal = calculatePaginationDimensions({
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  });

  const dimNarrow = calculatePaginationDimensions({
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  });

  const dimWide = calculatePaginationDimensions({
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 },
  });

  // Narrow margin có usable width và usable height lớn hơn Normal
  assert.ok(dimNarrow.usableWidthPx > dimNormal.usableWidthPx);
  assert.ok(dimNarrow.usableHeightPx > dimNormal.usableHeightPx);

  // Wide margin có usable width nhỏ hơn Normal
  assert.ok(dimWide.usableWidthPx < dimNormal.usableWidthPx);
});

test("Pagination 9: Landscape orientation recalculates dimensions and layout", () => {
  const portraitState = calculatePaginationState(null, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  const landscapeState = calculatePaginationState(null, {
    paperSize: "A4",
    orientation: "landscape",
  margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.strictEqual(portraitState.pageWidthPx < portraitState.pageHeightPx, true);
  assert.strictEqual(landscapeState.pageWidthPx > landscapeState.pageHeightPx, true);

  // Chiều rộng Landscape bằng chiều cao Portrait
  assert.strictEqual(landscapeState.pageWidthPx, portraitState.pageHeightPx);
  assert.strictEqual(landscapeState.pageHeightPx, portraitState.pageWidthPx);
});

test("Pagination 10: Zoom scale independence (visual zoom does not alter pagination)", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Kiểm tra zoom không đổi số trang." }] },
    ],
  };

  const state100 = calculatePaginationState(doc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  // Thay đổi zoom trong zoomStore
  const zoomStore = useZoomStore.getState();
  zoomStore.setZoom(50);
  assert.strictEqual(useZoomStore.getState().zoom, 50);

  const state50 = calculatePaginationState(doc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  zoomStore.setZoom(200);
  assert.strictEqual(useZoomStore.getState().zoom, 200);

  const state200 = calculatePaginationState(doc, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.strictEqual(state50.pageCount, state100.pageCount);
  assert.strictEqual(state200.pageCount, state100.pageCount);
  assert.strictEqual(state50.pageWidthPx, state100.pageWidthPx);

  // Reset zoom
  zoomStore.resetZoom();
});

test("Pagination 11: Document AST is strictly preserved without mutation", () => {
  const docAst: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Kiểm tra bất biến AST: " },
          { type: "text", marks: [{ type: "bold" }], text: "không bị sửa đổi" },
        ],
      },
    ],
  };

  const astClone = JSON.parse(JSON.stringify(docAst));

  calculatePaginationState(docAst, {
    paperSize: "A4",
    orientation: "portrait",
    margins: DEFAULT_PAGE_SETTINGS.margins,
  });

  assert.deepStrictEqual(docAst, astClone, "Pagination calculations must NEVER mutate document AST");
});

test("Pagination 12: PaginationStore updates, clamps, and resets safely", () => {
  const store = usePaginationStore.getState();
  store.resetPagination();

  assert.strictEqual(usePaginationStore.getState().pageCount, 1);
  assert.strictEqual(usePaginationStore.getState().currentPage, 1);

  // Cập nhật hợp lệ
  usePaginationStore.getState().setPagination(3, 2);
  assert.strictEqual(usePaginationStore.getState().pageCount, 3);
  assert.strictEqual(usePaginationStore.getState().currentPage, 2);

  // Giới hạn an toàn (currentPage không vượt quá pageCount)
  usePaginationStore.getState().setPagination(3, 10);
  assert.strictEqual(usePaginationStore.getState().pageCount, 3);
  assert.strictEqual(usePaginationStore.getState().currentPage, 3);

  // Reset
  usePaginationStore.getState().resetPagination();
  assert.strictEqual(usePaginationStore.getState().pageCount, 1);
  assert.strictEqual(usePaginationStore.getState().currentPage, 1);
});
