import { create } from "zustand";

interface InsertDialogState {
  /** Trạng thái mở hộp thoại Hyperlink */
  isLinkDialogOpen: boolean;
  /** Trạng thái mở hộp thoại Symbol Picker */
  isSymbolDialogOpen: boolean;
  /** Trạng thái mở hộp thoại Chèn Bảng */
  isTableDialogOpen: boolean;
  /** Trạng thái mở hộp thoại Equation */
  isEquationDialogOpen: boolean;
  /** Biểu thức LaTeX ban đầu khi mở dialog (để sửa) */
  equationInitialLatex: string;

  /** Mở hộp thoại Hyperlink */
  openLinkDialog: () => void;
  /** Đóng hộp thoại Hyperlink */
  closeLinkDialog: () => void;
  /** Mở hộp thoại Symbol Picker */
  openSymbolDialog: () => void;
  /** Đóng hộp thoại Symbol Picker */
  closeSymbolDialog: () => void;
  /** Mở hộp thoại Chèn Bảng */
  openTableDialog: () => void;
  /** Đóng hộp thoại Chèn Bảng */
  closeTableDialog: () => void;
  /** Mở hộp thoại Equation */
  openEquationDialog: (initialLatex?: string) => void;
  /** Đóng hộp thoại Equation */
  closeEquationDialog: () => void;
}

export const useInsertDialogStore = create<InsertDialogState>((set) => ({
  isLinkDialogOpen: false,
  isSymbolDialogOpen: false,
  isTableDialogOpen: false,
  isEquationDialogOpen: false,
  equationInitialLatex: "x^2 + y^2 = z^2",

  openLinkDialog: () => set({ isLinkDialogOpen: true }),
  closeLinkDialog: () => set({ isLinkDialogOpen: false }),
  openSymbolDialog: () => set({ isSymbolDialogOpen: true }),
  closeSymbolDialog: () => set({ isSymbolDialogOpen: false }),
  openTableDialog: () => set({ isTableDialogOpen: true }),
  closeTableDialog: () => set({ isTableDialogOpen: false }),
  openEquationDialog: (initialLatex?: string) =>
    set({
      isEquationDialogOpen: true,
      equationInitialLatex: initialLatex ?? "x^2 + y^2 = z^2",
    }),
  closeEquationDialog: () => set({ isEquationDialogOpen: false }),
}));
