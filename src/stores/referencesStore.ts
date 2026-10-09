import { create } from "zustand";
import type { ReferencePanelType } from "../references/types/referencesTypes.ts";

/**
 * References Store - Personal Word Editor (Phase 6.1 Architecture)
 *
 * Quản lý trạng thái giao diện (UI state only) cho hệ thống References:
 * - activeReferencePanel: Bảng công cụ bên lề đang hiển thị ("none" | "outline" | "notes" | "citations")
 * - isReferencesPanelOpen: Cờ mở/đóng thanh panel bên lề
 * - selectedReferenceId: ID đối tượng tham chiếu đang được chọn trên UI
 *
 * NGUYÊN TẮC KIẾN TRÚC:
 * - KHÔNG lưu trữ dữ liệu semantic của tài liệu (như danh sách footnote, citation, TOC) trong Zustand.
 * - Toàn bộ dữ liệu ngữ nghĩa cần persistence được lưu trong ProseMirror AST hoặc DocumentModel metadata.
 * - Triệt tiêu nguy cơ hai nguồn chân lý (Single Source of Truth).
 */

export interface ReferencesStoreState {
  /** Phân loại bảng điều khiển tham chiếu đang mở */
  activeReferencePanel: ReferencePanelType;
  /** Trạng thái mở/đóng thanh panel phụ trợ */
  isReferencesPanelOpen: boolean;
  /** Định danh neo tham chiếu đang được chọn trên giao diện */
  selectedReferenceId: string | null;

  // Actions
  setActiveReferencePanel: (panel: ReferencePanelType) => void;
  openReferencePanel: (panel: ReferencePanelType) => void;
  closeReferencePanel: () => void;
  toggleReferencePanel: (panel: ReferencePanelType) => void;
  setSelectedReferenceId: (id: string | null) => void;
  resetReferencesState: () => void;
}

export const useReferencesStore = create<ReferencesStoreState>((set) => ({
  activeReferencePanel: "none",
  isReferencesPanelOpen: false,
  selectedReferenceId: null,

  setActiveReferencePanel: (panel: ReferencePanelType) =>
    set({
      activeReferencePanel: panel,
      isReferencesPanelOpen: panel !== "none",
    }),

  openReferencePanel: (panel: ReferencePanelType) =>
    set({
      activeReferencePanel: panel,
      isReferencesPanelOpen: true,
    }),

  closeReferencePanel: () =>
    set({
      activeReferencePanel: "none",
      isReferencesPanelOpen: false,
      selectedReferenceId: null,
    }),

  toggleReferencePanel: (panel: ReferencePanelType) =>
    set((state) => {
      const willOpen = !state.isReferencesPanelOpen || state.activeReferencePanel !== panel;
      return {
        activeReferencePanel: willOpen ? panel : "none",
        isReferencesPanelOpen: willOpen,
      };
    }),

  setSelectedReferenceId: (id: string | null) =>
    set({ selectedReferenceId: id }),

  resetReferencesState: () =>
    set({
      activeReferencePanel: "none",
      isReferencesPanelOpen: false,
      selectedReferenceId: null,
    }),
}));
