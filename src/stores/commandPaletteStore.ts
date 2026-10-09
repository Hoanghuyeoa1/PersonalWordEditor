import { create } from "zustand";

export interface SavedSelectionSnapshot {
  from: number;
  to: number;
  empty: boolean;
}

interface CommandPaletteState {
  /** Trạng thái mở/đóng Command Palette */
  isOpen: boolean;
  /** Chuỗi tìm kiếm hiện tại */
  query: string;
  /** Chỉ số mục đang được focus / highlight trong danh sách kết quả */
  selectedIndex: number;
  /** Snapshot selection của editor trước khi mở palette */
  savedSelection: SavedSelectionSnapshot | null;

  openPalette: (selection?: SavedSelectionSnapshot | null) => void;
  closePalette: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (idx: number) => void;
  selectNext: (totalCount: number) => void;
  selectPrev: (totalCount: number) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  query: "",
  selectedIndex: 0,
  savedSelection: null,

  openPalette: (selection = null) =>
    set({
      isOpen: true,
      query: "",
      selectedIndex: 0,
      savedSelection: selection,
    }),

  closePalette: () =>
    set({
      isOpen: false,
      query: "",
      selectedIndex: 0,
      savedSelection: null,
    }),

  setQuery: (query: string) =>
    set({
      query,
      selectedIndex: 0,
    }),

  setSelectedIndex: (selectedIndex: number) =>
    set({ selectedIndex }),

  selectNext: (totalCount: number) =>
    set((state) => {
      if (totalCount <= 0) return { selectedIndex: 0 };
      return {
        selectedIndex: (state.selectedIndex + 1) % totalCount,
      };
    }),

  selectPrev: (totalCount: number) =>
    set((state) => {
      if (totalCount <= 0) return { selectedIndex: 0 };
      return {
        selectedIndex: (state.selectedIndex - 1 + totalCount) % totalCount,
      };
    }),
}));
