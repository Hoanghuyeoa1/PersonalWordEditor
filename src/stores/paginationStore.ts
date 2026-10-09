import { create } from "zustand";
import type { PageLayoutMap } from "../page/services/pageLayoutMap.ts";

export interface PaginationStoreState {
  /** Tổng số trang vật lý hiện tại của tài liệu */
  pageCount: number;
  /** Trang hiện tại dựa trên vị trí con trỏ hoặc viewport */
  currentPage: number;
  /** Chỉ số section hiện tại của con trỏ (1-indexed) */
  currentSectionIndex: number;
  /** Bản đồ layout phân trang tập trung PageLayoutMap (nguồn chân lý duy nhất - Phase 10) */
  layoutMap: PageLayoutMap | null;
  /** Cập nhật thông số phân trang */
  setPagination: (
    pageCount: number,
    currentPage: number,
    currentSectionIndex?: number,
    layoutMap?: PageLayoutMap | null
  ) => void;
  /** Cập nhật trực tiếp PageLayoutMap */
  setLayoutMap: (layoutMap: PageLayoutMap | null) => void;
  /** Đặt lại trạng thái phân trang mặc định (1 trang) */
  resetPagination: () => void;
}

export const usePaginationStore = create<PaginationStoreState>((set) => ({
  pageCount: 1,
  currentPage: 1,
  currentSectionIndex: 1,
  layoutMap: null,

  setPagination: (
    pageCount: number,
    currentPage: number,
    currentSectionIndex = 1,
    layoutMap?: PageLayoutMap | null
  ) =>
    set((state) => {
      const safePageCount = Math.max(1, pageCount);
      const safeCurrentPage = Math.min(safePageCount, Math.max(1, currentPage));
      const safeSection = Math.max(1, currentSectionIndex);
      const nextLayoutMap = layoutMap !== undefined ? layoutMap : state.layoutMap;

      if (
        state.pageCount === safePageCount &&
        state.currentPage === safeCurrentPage &&
        state.currentSectionIndex === safeSection &&
        state.layoutMap === nextLayoutMap
      ) {
        return state;
      }
      return {
        pageCount: safePageCount,
        currentPage: safeCurrentPage,
        currentSectionIndex: safeSection,
        layoutMap: nextLayoutMap,
      };
    }),

  setLayoutMap: (layoutMap: PageLayoutMap | null) =>
    set((state) => {
      if (state.layoutMap === layoutMap) return state;
      return { layoutMap };
    }),

  resetPagination: () =>
    set({
      pageCount: 1,
      currentPage: 1,
      currentSectionIndex: 1,
      layoutMap: null,
    }),
}));
