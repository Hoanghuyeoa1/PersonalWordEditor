import { create } from "zustand";

interface SlashCommandState {
  /** Trạng thái hiển thị Slash Menu */
  isOpen: boolean;
  /** Chuỗi query sau dấu '/' (ví dụ: 'hea' trong '/hea') */
  query: string;
  /** Chỉ số mục đang được chọn bằng phím mũi tên */
  selectedIndex: number;
  /** Tọa độ hiển thị popover menu trên màn hình (viewport px) */
  position: { x: number; y: number } | null;
  /** Vị trí ký tự bắt đầu dấu '/' và con trỏ hiện tại trong ProseMirror document */
  triggerRange: { from: number; to: number } | null;

  openSlashMenu: (
    pos: { x: number; y: number },
    range: { from: number; to: number },
    query: string
  ) => void;
  updateSlashQuery: (query: string, range: { from: number; to: number }) => void;
  closeSlashMenu: () => void;
  setSelectedIndex: (idx: number) => void;
  selectNext: (totalCount: number) => void;
  selectPrev: (totalCount: number) => void;
}

export const useSlashCommandStore = create<SlashCommandState>((set) => ({
  isOpen: false,
  query: "",
  selectedIndex: 0,
  position: null,
  triggerRange: null,

  openSlashMenu: (position, triggerRange, query) =>
    set({
      isOpen: true,
      position,
      triggerRange,
      query,
      selectedIndex: 0,
    }),

  updateSlashQuery: (query, triggerRange) =>
    set({
      query,
      triggerRange,
      selectedIndex: 0,
    }),

  closeSlashMenu: () =>
    set({
      isOpen: false,
      query: "",
      selectedIndex: 0,
      position: null,
      triggerRange: null,
    }),

  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),

  selectNext: (totalCount) =>
    set((state) => {
      if (totalCount <= 0) return { selectedIndex: 0 };
      return {
        selectedIndex: (state.selectedIndex + 1) % totalCount,
      };
    }),

  selectPrev: (totalCount) =>
    set((state) => {
      if (totalCount <= 0) return { selectedIndex: 0 };
      return {
        selectedIndex: (state.selectedIndex - 1 + totalCount) % totalCount,
      };
    }),
}));
