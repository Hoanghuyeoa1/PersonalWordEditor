import { create } from "zustand";

export type ProtectedActionType = "new" | "open" | "close";
export type ConfirmChoice = "save" | "dontsave" | "cancel";

export interface ConfirmDialogState {
  isOpen: boolean;
  actionType: ProtectedActionType | null;
  documentTitle: string;
  resolvePromise: ((choice: ConfirmChoice) => void) | null;

  promptSaveConfirmation: (
    actionType: ProtectedActionType,
    documentTitle: string
  ) => Promise<ConfirmChoice>;

  confirmChoice: (choice: ConfirmChoice) => void;
  closeDialog: () => void;
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  isOpen: false,
  actionType: null,
  documentTitle: "",
  resolvePromise: null,

  promptSaveConfirmation: (actionType, documentTitle) => {
    return new Promise<ConfirmChoice>((resolve) => {
      set({
        isOpen: true,
        actionType,
        documentTitle,
        resolvePromise: resolve,
      });
    });
  },

  confirmChoice: (choice) => {
    const { resolvePromise } = get();
    if (resolvePromise) {
      resolvePromise(choice);
    }
    set({
      isOpen: false,
      actionType: null,
      documentTitle: "",
      resolvePromise: null,
    });
  },

  closeDialog: () => {
    const { resolvePromise } = get();
    if (resolvePromise) {
      resolvePromise("cancel");
    }
    set({
      isOpen: false,
      actionType: null,
      documentTitle: "",
      resolvePromise: null,
    });
  },
}));
