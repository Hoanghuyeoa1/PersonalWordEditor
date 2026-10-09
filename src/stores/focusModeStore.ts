import { create } from "zustand";
import { useReviewStore } from "./reviewStore.ts";
import { useReferencesStore } from "./referencesStore.ts";
import { useFindReplaceStore } from "./findReplaceStore.ts";
import { useCommandPaletteStore } from "./commandPaletteStore.ts";
import { useEditorStore } from "./editorStore.ts";

export interface FocusModeState {
  /** Trạng thái bật/tắt Focus Mode (chế độ tập trung không xao nhãng) */
  isFocusMode: boolean;

  /** Kích hoạt Focus Mode: ẩn UI phụ, đóng sidebar/overlay an toàn, bảo toàn caret */
  enterFocusMode: () => void;

  /** Thoát Focus Mode: khôi phục giao diện đầy đủ */
  exitFocusMode: () => void;

  /** Chuyển đổi trạng thái Focus Mode */
  toggleFocusMode: () => void;
}

/**
  * Focus Mode Store - Quản lý trạng thái giao diện tập trung (Phase 7.3 Architecture)
  *
  * QUY TẮC CỐT LÕI:
  * 1. Focus Mode là UI presentation state, TUYỆT ĐỐI KHÔNG phải document semantic state.
  * 2. Không lưu vào AST và không gắn vào tệp .mwd.
  * 3. Khi bật Focus Mode: đóng các sidebar và overlay không cần thiết một cách tất định (deterministic),
  *    giữ nguyên caret/selection của editor và giữ an toàn cho các dialog xác nhận quan trọng.
  */
export const useFocusModeStore = create<FocusModeState>((set, get) => ({
  isFocusMode: false,

  enterFocusMode: () => {
    // Đóng các sidebars và overlays phụ không cần thiết một cách an toàn
    try {
      useReviewStore.getState().setCommentsSidebarOpen(false);
      useReferencesStore.getState().closeReferencePanel();
      if (useFindReplaceStore.getState().isOpen) {
        useFindReplaceStore.getState().close();
      }
      if (useCommandPaletteStore.getState().isOpen) {
        useCommandPaletteStore.getState().closePalette();
      }
    } catch {
      // Bảo vệ an toàn nếu store chưa khởi tạo
    }

    set({ isFocusMode: true });

    // Đảm bảo editor không bị mất focus/caret
    setTimeout(() => {
      try {
        const editor = useEditorStore.getState().editor;
        if (editor && !editor.isFocused) {
          editor.commands.focus();
        }
      } catch {
        // Safe fallback
      }
    }, 10);
  },

  exitFocusMode: () => {
    set({ isFocusMode: false });

    // Trả lại focus cho editor
    setTimeout(() => {
      try {
        const editor = useEditorStore.getState().editor;
        if (editor && !editor.isFocused) {
          editor.commands.focus();
        }
      } catch {
        // Safe fallback
      }
    }, 10);
  },

  toggleFocusMode: () => {
    if (get().isFocusMode) {
      get().exitFocusMode();
    } else {
      get().enterFocusMode();
    }
  },
}));
