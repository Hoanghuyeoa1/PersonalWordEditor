import { create } from "zustand";

export interface HeaderFooterStoreState {
  /** Có đang trong chế độ chỉnh sửa Header hoặc Footer không */
  isEditing: boolean;
  /** Vùng đang được chỉnh sửa: "header" hoặc "footer" */
  activeZone: "header" | "footer" | null;
  /** Section đang được chỉnh sửa (1-indexed) */
  activeSectionIndex: number;
  /** Trang đang được chỉnh sửa (1-indexed) */
  activePageNumber: number;
  /** Mở chế độ chỉnh sửa Header */
  openHeader: (sectionIndex?: number, pageNumber?: number) => void;
  /** Mở chế độ chỉnh sửa Footer */
  openFooter: (sectionIndex?: number, pageNumber?: number) => void;
  /** Đóng chế độ chỉnh sửa Header/Footer và quay về document body */
  close: () => void;
}

export const useHeaderFooterStore = create<HeaderFooterStoreState>((set) => ({
  isEditing: false,
  activeZone: null,
  activeSectionIndex: 1,
  activePageNumber: 1,
  openHeader: (sectionIndex = 1, pageNumber = 1) =>
    set({
      isEditing: true,
      activeZone: "header",
      activeSectionIndex: sectionIndex,
      activePageNumber: pageNumber,
    }),
  openFooter: (sectionIndex = 1, pageNumber = 1) =>
    set({
      isEditing: true,
      activeZone: "footer",
      activeSectionIndex: sectionIndex,
      activePageNumber: pageNumber,
    }),
  close: () =>
    set({
      isEditing: false,
      activeZone: null,
    }),
}));
