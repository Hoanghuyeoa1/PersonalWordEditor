/**
 * PAGINATION ENGINE 2.0 — OLD PAGINATION BRIDGE
 *
 * Cầu nối chuyển đổi (Adapter Bridge) từ PageLayoutMap mới sang các hệ thống hiện tại:
 * - usePaginationStore
 * - PageRenderer (PaginationState)
 * - StatusBar
 *
 * Mục tiêu: Đảm bảo tương thích ngược 100% trong quá trình migration
 * mà không để hai nguồn tính toán cạnh tranh không kiểm soát.
 */

import type { PaginationState, PageLayoutInfo } from "../types/paginationTypes.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";
import type { PageLayoutMap } from "./pageLayoutMap.ts";
import { PAGE_GAP_PX } from "./paginationService.ts";

/**
 * Chuyển đổi PageLayoutMap thành PaginationState legacy để PageRenderer tiêu thụ trực tiếp
 */
export function adaptPageLayoutMapToPaginationState(
  layoutMap: PageLayoutMap,
  cursorPos = 0,
  pageGapPx = PAGE_GAP_PX
): PaginationState {
  const pages = layoutMap.getPages();
  const pageCount = layoutMap.getPageCount();
  const currentPage = layoutMap.getPageNumberForPosition(cursorPos);
  const currentSectionIndex = layoutMap.getSectionForPage(currentPage - 1);

  let prevSectionIndex = 1;
  const legacyPages: PageLayoutInfo[] = pages.map((p) => {
    let breakType: PageLayoutInfo["breakType"] = "overflow";
    if (p.pageNumber === 1) {
      breakType = "start";
    } else if (p.sectionIndex !== prevSectionIndex) {
      breakType = "section";
    }
    prevSectionIndex = p.sectionIndex;

    return {
      pageNumber: p.pageNumber,
      sectionIndex: p.sectionIndex,
      sectionId: p.sectionId,
      paperSize: p.paperSize,
      orientation: p.orientation,
      margins: p.marginsMm,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      topPx: p.topPx,
      bottomPx: p.bottomPx,
      breakType,
    };
  });

  const firstPage = pages[0];
  const usableWidthPx = firstPage ? firstPage.usableBodyBounds.width : 600;
  const usableHeightPx = firstPage ? firstPage.usableBodyBounds.height : 900;
  const pageWidthPx = firstPage ? firstPage.widthPx : 794;
  const pageHeightPx = firstPage ? firstPage.heightPx : 1123;
  const marginsPx = firstPage
    ? {
        top: firstPage.marginsPx.top,
        bottom: firstPage.marginsPx.bottom,
        left: firstPage.marginsPx.left,
        right: firstPage.marginsPx.right,
      }
    : { top: 96, bottom: 96, left: 96, right: 96 };

  return {
    pageCount,
    currentPage,
    currentSectionIndex,
    pages: legacyPages,
    usableWidthPx,
    usableHeightPx,
    pageWidthPx,
    pageHeightPx,
    pageGapPx,
    marginsPx,
  };
}

/**
 * Đồng bộ trạng thái từ PageLayoutMap vào Zustand usePaginationStore
 */
export function syncPageLayoutMapToStore(
  layoutMap: PageLayoutMap,
  cursorPos?: number
): { pageCount: number; currentPage: number; sectionIndex: number } {
  const pageCount = layoutMap.getPageCount();
  const currentPage = typeof cursorPos === "number"
    ? layoutMap.getPageNumberForPosition(cursorPos)
    : 1;
  const sectionIndex = layoutMap.getSectionForPage(currentPage - 1);

  usePaginationStore.getState().setPagination(pageCount, currentPage, sectionIndex, layoutMap);

  return { pageCount, currentPage, sectionIndex };
}
