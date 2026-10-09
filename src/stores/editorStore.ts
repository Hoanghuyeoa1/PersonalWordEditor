import { create } from "zustand";
import type { Editor } from "@tiptap/core";

export interface EditorStoreState {
  /** Tham chiếu đến instance Tiptap Editor đang hoạt động */
  editor: Editor | null;
  /** Cập nhật instance editor khi khởi tạo hoặc hủy */
  setEditor: (editor: Editor | null) => void;
}

export const useEditorStore = create<EditorStoreState>((set) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),
}));
