import { create } from "zustand";

export type FindReplaceMode = "find" | "replace";

export interface FindReplaceState {
  isOpen: boolean;
  mode: FindReplaceMode;
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  matchCount: number;
  currentIndex: number;
  statusMessage: string | null;

  openFind: () => void;
  openReplace: () => void;
  close: () => void;
  setMode: (mode: FindReplaceMode) => void;
  setSearchTerm: (term: string) => void;
  setReplaceTerm: (term: string) => void;
  toggleCaseSensitive: () => void;
  setResults: (count: number, current: number, message?: string | null) => void;
  setStatusMessage: (message: string | null) => void;
}

export const useFindReplaceStore = create<FindReplaceState>((set) => ({
  isOpen: false,
  mode: "find",
  searchTerm: "",
  replaceTerm: "",
  caseSensitive: false,
  matchCount: 0,
  currentIndex: -1,
  statusMessage: null,

  openFind: () =>
    set({
      isOpen: true,
      mode: "find",
      statusMessage: null,
    }),

  openReplace: () =>
    set({
      isOpen: true,
      mode: "replace",
      statusMessage: null,
    }),

  close: () =>
    set({
      isOpen: false,
      statusMessage: null,
    }),

  setMode: (mode) =>
    set({
      mode,
      statusMessage: null,
    }),

  setSearchTerm: (searchTerm) =>
    set({
      searchTerm,
      statusMessage: null,
    }),

  setReplaceTerm: (replaceTerm) =>
    set({
      replaceTerm,
      statusMessage: null,
    }),

  toggleCaseSensitive: () =>
    set((state) => ({
      caseSensitive: !state.caseSensitive,
      statusMessage: null,
    })),

  setResults: (matchCount, currentIndex, statusMessage = null) =>
    set({
      matchCount,
      currentIndex,
      statusMessage,
    }),

  setStatusMessage: (statusMessage) =>
    set({
      statusMessage,
    }),
}));
