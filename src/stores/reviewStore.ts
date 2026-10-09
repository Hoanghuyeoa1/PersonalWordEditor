import { create } from "zustand";
import type { ProofingIssue, SupportedLanguage } from "../review/proofing/proofingTypes.ts";

export type ReviewChangesFilter = "all" | "insertions" | "deletions" | "formatting";
export type ReviewSidebarTab = "comments" | "changes";

export interface ReviewStoreState {
  /** Trạng thái bật/tắt bộ máy kiểm tra chính tả (Spelling) */
  proofingEnabled: boolean;
  /** Trạng thái bật/tắt bộ máy kiểm tra ngữ pháp (Grammar) */
  grammarEnabled: boolean;
  /** Ngôn ngữ kiểm tra chính tả hiện tại */
  spellCheckLanguage: SupportedLanguage;
  /** Trạng thái bật/tắt theo dõi thay đổi (Track Changes) */
  trackChangesEnabled: boolean;
  /** Định danh bình luận đang chọn / active */
  activeCommentId: string | null;
  /** Định danh thay đổi đang chọn / active */
  activeChangeId: string | null;
  /** Bộ lọc hiển thị thay đổi trong Review UI (Phase 8) */
  changesFilter: ReviewChangesFilter;
  /** Tab hiển thị hiện tại trên thanh bên kiểm duyệt (Comments vs Changes) */
  reviewSidebarTab: ReviewSidebarTab;
  /** Trạng thái mở modal Thống kê tài liệu (Document Statistics / Word Count) */
  isStatisticsModalOpen: boolean;

  /** Issue kiểm lỗi (chính tả hoặc ngữ pháp) đang hiển thị context menu */
  activeSpellingIssue: ProofingIssue | null;
  /** Tọa độ hiển thị popover sửa lỗi */
  spellingContextMenuPos: { x: number; y: number } | null;

  /** Trạng thái hiển thị thanh bên bình luận / kiểm duyệt */
  isCommentsSidebarOpen: boolean;
  /** Bản nháp bình luận đang chờ nhập khi bấm Thêm nhận xét */
  pendingCommentDraft: { selectedText: string; from: number; to: number } | null;

  /** Người dùng hiện tại thực hiện thao tác kiểm duyệt / review */
  currentUser: { id: string; name: string; color?: string } | null;

  // Actions
  setCurrentUser: (user: { id: string; name: string; color?: string } | null) => void;
  setProofingEnabled: (enabled: boolean) => void;
  toggleProofing: () => void;
  setGrammarEnabled: (enabled: boolean) => void;
  toggleGrammar: () => void;
  setSpellCheckLanguage: (lang: SupportedLanguage) => void;
  setTrackChangesEnabled: (enabled: boolean) => void;
  toggleTrackChanges: () => void;
  setActiveCommentId: (id: string | null) => void;
  setCommentsSidebarOpen: (open: boolean) => void;
  toggleCommentsSidebar: () => void;
  setPendingCommentDraft: (draft: { selectedText: string; from: number; to: number } | null) => void;
  setActiveChangeId: (id: string | null) => void;
  setChangesFilter: (filter: ReviewChangesFilter) => void;
  setReviewSidebarTab: (tab: ReviewSidebarTab) => void;
  openStatisticsModal: () => void;
  closeStatisticsModal: () => void;
  openSpellingContextMenu: (issue: ProofingIssue, pos: { x: number; y: number }) => void;
  closeSpellingContextMenu: () => void;
  resetReviewState: () => void;
}

export const useReviewStore = create<ReviewStoreState>((set) => ({
  currentUser: { id: "u-current", name: "Author", color: "#3b82f6" },
  proofingEnabled: true, // Mặc định bật kiểm tra chính tả khi vào chế độ kiểm tra
  grammarEnabled: true,  // Mặc định bật kiểm tra ngữ pháp
  spellCheckLanguage: "en-US",
  trackChangesEnabled: false,
  activeCommentId: null,
  activeChangeId: null,
  changesFilter: "all",
  reviewSidebarTab: "comments",
  isStatisticsModalOpen: false,
  activeSpellingIssue: null,
  spellingContextMenuPos: null,
  isCommentsSidebarOpen: false,
  pendingCommentDraft: null,

  setCurrentUser: (user) => set({ currentUser: user }),

  setProofingEnabled: (enabled: boolean) => set({ proofingEnabled: enabled }),
  toggleProofing: () => set((state) => ({ proofingEnabled: !state.proofingEnabled })),

  setGrammarEnabled: (enabled: boolean) => set({ grammarEnabled: enabled }),
  toggleGrammar: () => set((state) => ({ grammarEnabled: !state.grammarEnabled })),

  setSpellCheckLanguage: (lang: SupportedLanguage) => set({ spellCheckLanguage: lang }),

  setTrackChangesEnabled: (enabled: boolean) => set({ trackChangesEnabled: enabled }),
  toggleTrackChanges: () => set((state) => ({ trackChangesEnabled: !state.trackChangesEnabled })),

  setActiveCommentId: (id: string | null) => set({ activeCommentId: id }),
  setCommentsSidebarOpen: (open: boolean) => set({ isCommentsSidebarOpen: open }),
  toggleCommentsSidebar: () => set((state) => ({ isCommentsSidebarOpen: !state.isCommentsSidebarOpen })),
  setPendingCommentDraft: (draft) => set({ pendingCommentDraft: draft }),
  setActiveChangeId: (id: string | null) => set({ activeChangeId: id }),
  setChangesFilter: (filter: ReviewChangesFilter) => set({ changesFilter: filter }),
  setReviewSidebarTab: (tab: ReviewSidebarTab) => set({ reviewSidebarTab: tab }),

  openStatisticsModal: () => set({ isStatisticsModalOpen: true }),
  closeStatisticsModal: () => set({ isStatisticsModalOpen: false }),

  openSpellingContextMenu: (issue: ProofingIssue, pos: { x: number; y: number }) =>
    set({
      activeSpellingIssue: issue,
      spellingContextMenuPos: pos,
    }),
  closeSpellingContextMenu: () =>
    set({
      activeSpellingIssue: null,
      spellingContextMenuPos: null,
    }),

  resetReviewState: () =>
    set({
      proofingEnabled: true,
      grammarEnabled: true,
      spellCheckLanguage: "en-US",
      trackChangesEnabled: false,
      activeCommentId: null,
      activeChangeId: null,
      changesFilter: "all",
      reviewSidebarTab: "comments",
      isStatisticsModalOpen: false,
      activeSpellingIssue: null,
      spellingContextMenuPos: null,
      isCommentsSidebarOpen: false,
      pendingCommentDraft: null,
    }),
}));
