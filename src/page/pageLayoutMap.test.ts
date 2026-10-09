import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import { buildPageLayoutMap, PageLayoutMap } from "./services/pageLayoutMap.ts";
import {
  adaptPageLayoutMapToPaginationState,
  syncPageLayoutMapToStore,
} from "./services/pageLayoutBridge.ts";
import { usePaginationStore } from "../stores/paginationStore.ts";

test("PageLayoutMap 1: Empty document produces exactly 1 page with valid geometry", () => {
  // Test with null, undefined and empty array
  const nullMap = buildPageLayoutMap(null, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(nullMap.getPageCount(), 1);
  assert.strictEqual(nullMap.getPages().length, 1);

  const page0 = nullMap.getPage(0);
  assert.ok(page0 !== null);
  assert.strictEqual(page0.pageIndex, 0);
  assert.strictEqual(page0.pageNumber, 1);
  assert.strictEqual(page0.paperSize, "A4");
  assert.strictEqual(page0.orientation, "portrait");

  // Geometry validity (no NaN, no negatives)
  assert.ok(Number.isFinite(page0.widthPx) && page0.widthPx > 700);
  assert.ok(Number.isFinite(page0.heightPx) && page0.heightPx > 1000);
  assert.ok(page0.usableBodyBounds.width > 500);
  assert.ok(page0.usableBodyBounds.height > 800);
  assert.ok(page0.headerBounds.height > 0);
  assert.ok(page0.footerBounds.height > 0);

  // Bounds queries
  const pageBounds = nullMap.getPageBounds(0);
  assert.ok(pageBounds !== null);
  assert.strictEqual(pageBounds.width, page0.widthPx);

  const bodyBounds = nullMap.getUsableBodyBounds(0);
  assert.ok(bodyBounds !== null);
  assert.strictEqual(bodyBounds.width, page0.usableBodyBounds.width);
});

test("PageLayoutMap 2: Page geometry A4 Portrait", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản thử nghiệm A4 tiêu chuẩn." }],
      },
    ],
  };

  const map = buildPageLayoutMap(content, {
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  });

  const page = map.getPage(0);
  assert.ok(page !== null);
  assert.strictEqual(page.widthMm, 210);
  assert.strictEqual(page.heightMm, 297);
  assert.ok(Math.abs(page.widthPx - 793.7) < 2);
  assert.ok(Math.abs(page.heightPx - 1122.5) < 2);

  // Usable area: 210 - (25.4 * 2) = 159.2 mm = ~601.7 px
  assert.ok(Math.abs(page.usableBodyBounds.width - 601.7) < 2);
});

test("PageLayoutMap 3: Page geometry Landscape", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang khổ ngang (Landscape)." }],
      },
    ],
  };

  const map = buildPageLayoutMap(content, {
    paperSize: "A4",
    orientation: "landscape",
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  });

  const page = map.getPage(0);
  assert.ok(page !== null);
  assert.strictEqual(page.widthMm, 297);
  assert.strictEqual(page.heightMm, 210);
  assert.ok(page.widthPx > page.heightPx, "Landscape width must exceed height");
  assert.ok(page.usableBodyBounds.width > page.usableBodyBounds.height);
});

test("PageLayoutMap 4: Margins affect usable body bounds", () => {
  const content: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Test lề" }] }],
  };

  const normalMap = buildPageLayoutMap(content, {
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  });

  const narrowMap = buildPageLayoutMap(content, {
    paperSize: "A4",
    orientation: "portrait",
    margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  });

  const normalBody = normalMap.getUsableBodyBounds(0)!;
  const narrowBody = narrowMap.getUsableBodyBounds(0)!;

  assert.ok(
    narrowBody.width > normalBody.width,
    "Narrow margins should result in larger usable width"
  );
  assert.ok(
    narrowBody.height > normalBody.height,
    "Narrow margins should result in larger usable height"
  );
});

test("PageLayoutMap 5: Multiple sections separated by sectionBreak", () => {
  const multiSecDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1 nội dung" }],
      },
      {
        type: "sectionBreak",
        attrs: { sectionType: "nextPage", sectionId: "sec-2" },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 2 nội dung" }],
      },
    ],
  };

  const map = buildPageLayoutMap(multiSecDoc, DEFAULT_PAGE_SETTINGS);

  assert.strictEqual(map.getPageCount(), 2);
  assert.strictEqual(map.getSectionForPage(0), 1);
  assert.strictEqual(map.getSectionForPage(1), 2);
});

test("PageLayoutMap 6: Mixed paper sizes and orientations across sections", () => {
  const mixedDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Phần 1: Báo cáo văn bản đứng A4." }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionType: "nextPage",
          sectionId: "sec-landscape",
          pageSettings: {
            paperSize: "A3",
            orientation: "landscape",
            margins: { top: 20, right: 20, bottom: 20, left: 20 },
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Phần 2: Bảng vẽ biểu đồ khổ lớn A3 ngang." }],
      },
    ],
  };

  const map = buildPageLayoutMap(mixedDoc, DEFAULT_PAGE_SETTINGS);

  assert.strictEqual(map.getPageCount(), 2);

  const page1 = map.getPage(0)!;
  assert.strictEqual(page1.paperSize, "A4");
  assert.strictEqual(page1.orientation, "portrait");

  const page2 = map.getPage(1)!;
  assert.strictEqual(page2.paperSize, "A3");
  assert.strictEqual(page2.orientation, "landscape");
  assert.strictEqual(page2.widthMm, 420);
  assert.strictEqual(page2.heightMm, 297);
  assert.ok(page2.widthPx > page1.widthPx, "A3 Landscape width must exceed A4 width");
});

test("PageLayoutMap 7: getPageForPosition basic mapping", () => {
  const docWithPages: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn 1 nằm trên trang 1" }],
      },
      {
        type: "pageBreak",
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn 2 nằm trên trang 2" }],
      },
    ],
  };

  const map = buildPageLayoutMap(docWithPages, DEFAULT_PAGE_SETTINGS);
  assert.strictEqual(map.getPageCount(), 2);

  // Vị trí ở đầu tài liệu -> trang 0 (trang số 1)
  assert.strictEqual(map.getPageForPosition(0), 0);
  assert.strictEqual(map.getPageNumberForPosition(0), 1);

  // Vị trí nằm bên trong đoạn 1
  assert.strictEqual(map.getPageForPosition(15), 0);

  // Vị trí sau pageBreak (đoạn 2) -> trang 1 (trang số 2)
  const allFrags = map.getAllFragments();
  const para2Frag = allFrags.find((f) => f.pageIndex === 1 && f.nodeType === "paragraph");
  assert.ok(para2Frag !== undefined);

  assert.strictEqual(map.getPageForPosition(para2Frag.from + 5), 1);
  assert.strictEqual(map.getPageNumberForPosition(para2Frag.from + 5), 2);

  // Vị trí vượt quá tài liệu -> clamp về trang cuối
  assert.strictEqual(map.getPageForPosition(99999), 1);
});

test("PageLayoutMap 8: Fragment lookup via getFragmentsForRange and getFragmentsForNode", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Tiêu đề lớn" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Nội dung đoạn văn giải thích chi tiết." }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const frags = map.getAllFragments();

  assert.strictEqual(frags.length, 2);
  assert.strictEqual(frags[0].nodeType, "heading");
  assert.strictEqual(frags[1].nodeType, "paragraph");

  // Tra cứu theo range phủ cả hai khối
  const rangeFrags = map.getFragmentsForRange(0, 50);
  assert.strictEqual(rangeFrags.length, 2);

  // Tra cứu theo node đầu tiên
  const nodeFrags = map.getFragmentsForNode(frags[0].from, frags[0].to - frags[0].from);
  assert.strictEqual(nodeFrags.length, 1);
  assert.strictEqual(nodeFrags[0].nodeType, "heading");
});

test("PageLayoutMap 9: AST Immutability - calculation does NOT mutate input AST", () => {
  const originalDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Không được mutate" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Bảo toàn nguyên trạng 100%." }],
      },
    ],
  };

  const snapshotBefore = JSON.stringify(originalDoc);

  // Thực hiện build layout map nhiều lần
  const map1 = buildPageLayoutMap(originalDoc, DEFAULT_PAGE_SETTINGS);
  const map2 = buildPageLayoutMap(originalDoc, DEFAULT_PAGE_SETTINGS);

  const snapshotAfter = JSON.stringify(originalDoc);

  assert.strictEqual(
    snapshotBefore,
    snapshotAfter,
    "Input AST JSON must be 100% strictly identical before and after layout calculation"
  );
  assert.strictEqual(map1.getPageCount(), map2.getPageCount());
});

test("PageLayoutMap 10: Layout state is NOT serialized into document model", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Dữ liệu lưu trữ tài liệu" }],
      },
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const frags = map.getAllFragments();

  // Kiểm tra thuộc tính runtime fragments
  assert.ok(frags.length > 0);
  assert.ok("blockId" in frags[0]);
  assert.ok("top" in frags[0]);

  // Kiểm tra AST doc không bị gắn thêm bất kỳ thuộc tính layout nào
  const serialized = JSON.stringify(doc);
  assert.ok(!serialized.includes("blockId"));
  assert.ok(!serialized.includes("pageIndex"));
  assert.ok(!serialized.includes("usableBodyBounds"));
  assert.ok(!serialized.includes("LayoutFragment"));
});

test("PageLayoutMap 11: Old Pagination Bridge adapts safely to PaginationState and store", () => {
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
    ],
  };

  const map = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  // Test adaptPageLayoutMapToPaginationState
  const legacyState = adaptPageLayoutMapToPaginationState(map, 0);
  assert.strictEqual(legacyState.pageCount, 2);
  assert.strictEqual(legacyState.currentPage, 1);
  assert.strictEqual(legacyState.pages.length, 2);
  assert.strictEqual(legacyState.pages[0].pageNumber, 1);
  assert.strictEqual(legacyState.pages[1].pageNumber, 2);

  // Test syncPageLayoutMapToStore
  const syncResult = syncPageLayoutMapToStore(map, 0);
  assert.strictEqual(syncResult.pageCount, 2);
  assert.strictEqual(syncResult.currentPage, 1);
  assert.strictEqual(usePaginationStore.getState().pageCount, 2);
  assert.strictEqual(usePaginationStore.getState().currentPage, 1);

  // Test sync with cursor on Page 2
  const fragPage2 = map.getAllFragments().find((f) => f.pageIndex === 1);
  assert.ok(fragPage2 !== undefined);
  const syncPage2 = syncPageLayoutMapToStore(map, fragPage2.from + 2);
  assert.strictEqual(syncPage2.currentPage, 2);
  assert.strictEqual(usePaginationStore.getState().currentPage, 2);
});
