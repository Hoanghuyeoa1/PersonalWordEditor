import { useEffect, useRef } from "react";
import { AppHeader, StatusBar, Workspace } from "../components/layout/AppLayout";
import { Ribbon } from "../components/ribbon/Ribbon";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { ConfirmSaveDialog } from "../components/dialogs/ConfirmSaveDialog";
import { HyperlinkModal } from "../components/dialogs/HyperlinkModal";
import { SymbolModal } from "../components/dialogs/SymbolModal";
import { TableModal } from "../components/dialogs/TableModal";
import { EquationModal } from "../components/dialogs/EquationModal";
import { TableContextualToolbar } from "../components/table/TableContextualToolbar";
import { DocumentStatisticsModal } from "../review/components/DocumentStatisticsModal";
import { SpellingContextMenu } from "../review/proofing/components/SpellingContextMenu";
import { CommandPalette } from "../components/commands/CommandPalette";
import { SlashCommandMenu } from "../components/commands/SlashCommandMenu";
import { VersionHistoryModal } from "../components/version/VersionHistoryModal";
import { CrashRecoveryDialog } from "../components/version/CrashRecoveryDialog";
import { FocusModeExitButton } from "../components/focus/FocusModeExitButton";
import { useCommandPaletteStore } from "../stores/commandPaletteStore";
import { useFindReplaceStore } from "../stores/findReplaceStore";
import { useInsertDialogStore } from "../stores/insertDialogStore";
import { useEditorStore } from "../stores/editorStore";
import { useDocumentStore } from "../stores/documentStore";
import { useConfirmDialogStore } from "../stores/confirmDialogStore";
import { useZoomStore } from "../stores/zoomStore";
import { useReviewStore } from "../stores/reviewStore";
import { useVersionHistoryStore } from "../stores/versionHistoryStore";
import { useFocusModeStore } from "../stores/focusModeStore";
import { useAutosave } from "../version/hooks/useAutosave";
import { recoveryService } from "../version/services/recoveryService";
import {
  clearSearch,
  toggleBold,
  toggleItalic,
  toggleUnderline,
} from "../editor/editorCommands";
import { ProofingService } from "../review/proofing/proofingService";

import {
  requestCreateNewDocument,
  requestOpenDocumentFile,
  requestCloseApp,
  saveDocumentFile,
  saveAsDocumentFile,
  isTauriEnvironment,
} from "../file/fileOperations";

export default function App() {
  const { isOpen, openFind, openReplace, close } = useFindReplaceStore();
  const editor = useEditorStore((state) => state.editor);
  const filePath = useDocumentStore((state) => state.filePath);
  const documentTitle = useDocumentStore((state) => state.documentTitle);
  const isDirty = useDocumentStore((state) => state.isDirty);
  const isConfirmOpen = useConfirmDialogStore((state) => state.isOpen);
  const isFocusMode = useFocusModeStore((state) => state.isFocusMode);

  // Kích hoạt Autosave ngầm debounced
  useAutosave();

  // Kiểm tra Crash Recovery khi khởi động app
  useEffect(() => {
    void recoveryService.checkPendingRecovery().then((result) => {
      if (result.hasRecovery) {
        useVersionHistoryStore.getState().openRecoveryDialog(result);
      }
    });
  }, []);

  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Cập nhật tiêu đề cửa sổ Desktop & Document Title theo định dạng:
  // "report.mwd * - Personal Word Editor" hoặc "Tài liệu mới - Personal Word Editor"
  useEffect(() => {
    const displayBase = filePath
      ? filePath.split(/[/\\]/).pop() || documentTitle
      : documentTitle;
    const windowTitle = `${displayBase}${isDirty ? " *" : ""} - Personal Word Editor`;
    document.title = windowTitle;

    if (isTauriEnvironment()) {
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => {
          getCurrentWindow().setTitle(windowTitle).catch(() => {});
        })
        .catch(() => {});
    }
  }, [filePath, documentTitle, isDirty]);

  // Bảo vệ đóng cửa sổ (Close Protection) khi isDirty = true
  useEffect(() => {
    if (!isTauriEnvironment()) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (useDocumentStore.getState().isDirty) {
          e.preventDefault();
          e.returnValue = "";
        } else {
          void recoveryService.markAllCleanShutdown();
        }
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }

    let unlistenFn: (() => void) | null = null;
    let isMounted = true;

    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        if (!isMounted) return;
        const appWindow = getCurrentWindow();
        appWindow
          .onCloseRequested(async (event) => {
            if (useDocumentStore.getState().isDirty) {
              // Ngăn chặn đóng cửa sổ ngay lập tức
              event.preventDefault();
              // Kích hoạt dialog xác nhận lưu
              requestCloseApp(editorRef.current);
            } else {
              await recoveryService.markAllCleanShutdown();
            }
          })
          .then((unlisten) => {
            if (isMounted) {
              unlistenFn = unlisten;
            } else {
              unlisten();
            }
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // Lắng nghe phím tắt toàn cục thống nhất, tránh xung đột và trigger 2 lần
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nếu hộp thoại xác nhận đang mở, để hộp thoại tự xử lý phím tắt
      if (isConfirmOpen) {
        return;
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;
      const isInsideEditor = Boolean(target?.closest(".ProseMirror"));

      // 0. Phím tắt Bảng lệnh Thống nhất (Command Palette: Ctrl+Shift+P)
      if (isCtrlOrMeta && e.shiftKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        const selection = editor
          ? {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
              empty: editor.state.selection.empty,
            }
          : null;
        useCommandPaletteStore.getState().openPalette(selection);
        return;
      }

      // 0.1. Phím tắt Lịch sử phiên bản (Version History: Ctrl+Shift+H)
      if (isCtrlOrMeta && e.shiftKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        useVersionHistoryStore.getState().openHistory();
        return;
      }

      // 1. Phím tắt quản lý tệp (File System & App Protection)
      if (isCtrlOrMeta && !e.shiftKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        requestCreateNewDocument(editor);
        return;
      }

      if (isCtrlOrMeta && !e.shiftKey && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        requestOpenDocumentFile(editor);
        return;
      }

      if (isCtrlOrMeta && e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveAsDocumentFile(editor);
        return;
      }

      if (isCtrlOrMeta && !e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveDocumentFile(editor);
        return;
      }

      // 2. Phím tắt Tìm kiếm / Thay thế (Find & Replace)
      if (isCtrlOrMeta && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        openFind();
        return;
      }

      if (isCtrlOrMeta && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        openReplace();
        return;
      }

      // 3. Phím tắt Siêu liên kết (Insert / Edit Hyperlink: Ctrl+K)
      if (isCtrlOrMeta && !e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        useInsertDialogStore.getState().openLinkDialog();
        return;
      }

      // 4. Phím tắt Thêm nhận xét (New Comment: Ctrl+Alt+M)
      if (isCtrlOrMeta && e.altKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        useReviewStore.getState().setCommentsSidebarOpen(true);
        if (editor) {
          const { from, to } = editor.state.selection;
          if (from < to) {
            const selectedText = editor.state.doc.textBetween(from, to, " ");
            useReviewStore.getState().setPendingCommentDraft({
              from,
              to,
              selectedText,
            });
          }
        }
        return;
      }

      // 5. Phím tắt Bật/Tắt Theo dõi thay đổi (Track Changes: Ctrl+Shift+E)
      if (isCtrlOrMeta && e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        useReviewStore.getState().toggleTrackChanges();
        return;
      }

      // 6. Phím tắt Mở Thống kê tài liệu / Đếm từ (Word Count: Ctrl+Shift+G)
      if (isCtrlOrMeta && e.shiftKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        useReviewStore.getState().openStatisticsModal();
        return;
      }

      // 7. Phím F7 / Shift+F7: Điều hướng lỗi chính tả & ngữ pháp (Proofing Issue Navigation)
      if (e.key === "F7") {
        e.preventDefault();
        if (editor) {
          const issue = e.shiftKey
            ? ProofingService.findPreviousIssue(editor)
            : ProofingService.findNextIssue(editor);
          if (issue) {
            ProofingService.navigateToIssue(editor, issue);
          }
        }
        return;
      }

      // 7.1. Phím F11 hoặc Ctrl+Shift+D: Bật/Tắt Chế độ tập trung (Focus Mode - Phase 7.3)
      if (e.key === "F11") {
        e.preventDefault();
        useFocusModeStore.getState().toggleFocusMode();
        return;
      }

      if (isCtrlOrMeta && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        useFocusModeStore.getState().toggleFocusMode();
        return;
      }

      // 8. Phím Escape: Đóng hộp thoại tìm kiếm hoặc Thoát chế độ tập trung (Focus Mode)
      if (e.key === "Escape") {
        if (isOpen) {
          e.preventDefault();
          if (editor) {
            clearSearch(editor);
            editor.commands.focus();
          }
          close();
          return;
        }

        if (useFocusModeStore.getState().isFocusMode) {
          e.preventDefault();
          useFocusModeStore.getState().exitFocusMode();
          return;
        }
      }

      // 4. Các phím tắt Soạn thảo / Định dạng khi focus KHÔNG nằm trong editor và KHÔNG nằm trong input
      // (Khi đang gõ trong editor, ProseMirror đã tự xử lý mà không cần listener ngoài)
      if (!isInsideEditor && !isInput && editor) {
        if (isCtrlOrMeta && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          editor.commands.undo();
          return;
        }

        if (
          isCtrlOrMeta &&
          (e.key === "y" || e.key === "Y" || (e.shiftKey && (e.key === "z" || e.key === "Z")))
        ) {
          e.preventDefault();
          editor.commands.redo();
          return;
        }

        if (isCtrlOrMeta && !e.shiftKey && (e.key === "b" || e.key === "B")) {
          e.preventDefault();
          toggleBold(editor);
          return;
        }

        if (isCtrlOrMeta && !e.shiftKey && (e.key === "i" || e.key === "I")) {
          e.preventDefault();
          toggleItalic(editor);
          return;
        }

        if (isCtrlOrMeta && !e.shiftKey && (e.key === "u" || e.key === "U")) {
          e.preventDefault();
          toggleUnderline(editor);
          return;
        }
      }

      // 5. Phím tắt Thu phóng trang (Zoom In / Zoom Out / Reset Zoom: Ctrl+=, Ctrl+-, Ctrl+0)
      if (isCtrlOrMeta && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        useZoomStore.getState().zoomIn();
        return;
      }

      if (isCtrlOrMeta && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        useZoomStore.getState().zoomOut();
        return;
      }

      if (isCtrlOrMeta && e.key === "0") {
        e.preventDefault();
        useZoomStore.getState().resetZoom();
        return;
      }

      // Lưu ý: Ctrl+X, Ctrl+C, Ctrl+V luôn sử dụng cơ chế Clipboard gốc của trình duyệt/editor,
      // tuyệt đối không preventDefault để đảm bảo hoạt động tự nhiên và an toàn.
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isConfirmOpen, openFind, openReplace, close, editor]);

  return (
    <div className={`app-shell ${isFocusMode ? "is-focus-mode" : ""}`}>
      <FocusModeExitButton />
      <AppHeader />
      <Ribbon />
      <TableContextualToolbar />
      <Workspace />
      <StatusBar />
      <FindReplaceDialog />
      <ConfirmSaveDialog />
      <HyperlinkModal />
      <SymbolModal />
      <TableModal />
      <EquationModal />
      <DocumentStatisticsModal />
      <SpellingContextMenu />
      <CommandPalette />
      <SlashCommandMenu />
      <VersionHistoryModal />
      <CrashRecoveryDialog />
    </div>
  );
}
