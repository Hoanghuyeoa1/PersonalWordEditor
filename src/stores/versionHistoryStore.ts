import { create } from "zustand";
import type { Editor } from "@tiptap/core";
import type {
  DocumentSnapshot,
  DocumentSnapshotMetadata,
} from "../version/types.ts";
import {
  listSnapshots,
  loadSnapshot,
  createSnapshot,
  deleteSnapshot as removeSnapshot,
  restoreSnapshot,
} from "../version/services/versionService.ts";
import {
  recoveryService,
  type PendingRecoveryResult,
} from "../version/services/recoveryService.ts";
import { useDocumentStore } from "./documentStore.ts";

export interface VersionHistoryState {
  // Trạng thái modal Version History
  isHistoryOpen: boolean;
  openHistory: () => void;
  closeHistory: () => void;

  snapshots: DocumentSnapshotMetadata[];
  selectedSnapshotId: string | null;
  selectedSnapshot: DocumentSnapshot | null;
  isLoading: boolean;
  errorMessage: string | null;

  refreshSnapshots: () => Promise<void>;
  selectSnapshot: (snapshotId: string) => Promise<void>;
  createManualSnapshot: (description?: string) => Promise<boolean>;
  deleteSnapshot: (snapshotId: string) => Promise<void>;
  restoreSnapshotAction: (snapshotId: string, editor: Editor | null) => Promise<boolean>;

  // Trạng thái hộp thoại Crash Recovery khi khởi động app
  isRecoveryOpen: boolean;
  pendingRecovery: PendingRecoveryResult | null;
  openRecoveryDialog: (result: PendingRecoveryResult) => void;
  closeRecoveryDialog: () => void;
  acceptRecovery: (editor: Editor | null) => Promise<boolean>;
  discardRecoveryAction: () => Promise<void>;
}

export const useVersionHistoryStore = create<VersionHistoryState>((set, get) => ({
  isHistoryOpen: false,
  snapshots: [],
  selectedSnapshotId: null,
  selectedSnapshot: null,
  isLoading: false,
  errorMessage: null,

  openHistory: () => {
    set({ isHistoryOpen: true, errorMessage: null });
    void get().refreshSnapshots();
  },

  closeHistory: () => {
    set({
      isHistoryOpen: false,
      selectedSnapshotId: null,
      selectedSnapshot: null,
      errorMessage: null,
    });
  },

  refreshSnapshots: async () => {
    const docId = useDocumentStore.getState().document.metadata.id;
    set({ isLoading: true, errorMessage: null });
    try {
      const list = await listSnapshots(docId);
      set({ snapshots: list, isLoading: false });

      // Nếu đang chọn một snapshot, tải lại nội dung của nó
      const currentSelectedId = get().selectedSnapshotId;
      if (currentSelectedId && list.some((s) => s.id === currentSelectedId)) {
        await get().selectSnapshot(currentSelectedId);
      } else if (list.length > 0) {
        // Tự động chọn snapshot mới nhất
        await get().selectSnapshot(list[0].id);
      } else {
        set({ selectedSnapshotId: null, selectedSnapshot: null });
      }
    } catch (err) {
      set({
        isLoading: false,
        errorMessage: `Không thể tải danh sách bản chụp: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  selectSnapshot: async (snapshotId: string) => {
    const docId = useDocumentStore.getState().document.metadata.id;
    set({ selectedSnapshotId: snapshotId, isLoading: true });
    try {
      const res = await loadSnapshot(docId, snapshotId);
      if (res.success) {
        set({ selectedSnapshot: res.snapshot, isLoading: false, errorMessage: null });
      } else {
        set({
          selectedSnapshot: null,
          isLoading: false,
          errorMessage: res.error,
        });
      }
    } catch (err) {
      set({
        selectedSnapshot: null,
        isLoading: false,
        errorMessage: `Lỗi tải bản chụp: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  createManualSnapshot: async (description?: string) => {
    const store = useDocumentStore.getState();
    const doc = store.document;
    try {
      await createSnapshot(doc, "manual", {
        description: description || "Bản sao lưu thủ công",
        filePath: store.filePath,
      });
      await get().refreshSnapshots();
      return true;
    } catch (err) {
      set({
        errorMessage: `Không thể tạo bản chụp: ${err instanceof Error ? err.message : String(err)}`,
      });
      return false;
    }
  },

  deleteSnapshot: async (snapshotId: string) => {
    const docId = useDocumentStore.getState().document.metadata.id;
    try {
      await removeSnapshot(docId, snapshotId);
      await get().refreshSnapshots();
    } catch (err) {
      set({
        errorMessage: `Lỗi khi xóa bản chụp: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },

  restoreSnapshotAction: async (snapshotId: string, editor: Editor | null) => {
    try {
      const res = await restoreSnapshot(snapshotId, editor);
      if (res.success) {
        set({ isHistoryOpen: false, selectedSnapshotId: null, selectedSnapshot: null });
        return true;
      } else {
        set({ errorMessage: res.error || "Khôi phục bản chụp thất bại." });
        return false;
      }
    } catch (err) {
      set({
        errorMessage: `Lỗi khi khôi phục: ${err instanceof Error ? err.message : String(err)}`,
      });
      return false;
    }
  },

  // Quản lý hộp thoại Crash Recovery
  isRecoveryOpen: false,
  pendingRecovery: null,

  openRecoveryDialog: (result: PendingRecoveryResult) => {
    set({ isRecoveryOpen: true, pendingRecovery: result });
  },

  closeRecoveryDialog: () => {
    set({ isRecoveryOpen: false, pendingRecovery: null });
  },

  acceptRecovery: async (editor: Editor | null) => {
    const pending = get().pendingRecovery;
    if (!pending || !pending.session) return false;

    const ok = await recoveryService.applyRecovery(pending.session, editor);
    if (ok) {
      set({ isRecoveryOpen: false, pendingRecovery: null });
      return true;
    }
    return false;
  },

  discardRecoveryAction: async () => {
    const pending = get().pendingRecovery;
    if (pending && pending.session) {
      await recoveryService.discardRecovery(pending.session);
    }
    set({ isRecoveryOpen: false, pendingRecovery: null });
  },
}));
