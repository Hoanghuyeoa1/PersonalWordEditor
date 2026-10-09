import type { Editor } from "@tiptap/core";
import { useDocumentStore } from "../stores/documentStore.ts";
import { useConfirmDialogStore, type ProtectedActionType } from "../stores/confirmDialogStore.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  importDocxToDocumentModel,
  exportDocumentModelToDocx,
  checkDocxExportReviewCompatibility,
} from "../docx/index.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { generateDocumentId } from "../document/documentModel.ts";
import { TrackChangesService } from "../review/trackChanges/trackChangesService.ts";
import { autosaveEngine } from "../version/services/autosaveEngine.ts";
import { recoveryService } from "../version/services/recoveryService.ts";
import { createSnapshot } from "../version/services/versionService.ts";

export interface FileOperationResult {
  success: boolean;
  filePath?: string;
  error?: string;
  cancelled?: boolean;
}

/**
 * Kiểm tra xem ứng dụng có đang chạy trong môi trường Desktop Tauri hay không.
 */
export function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/**
 * Tạo tài liệu mới (New): đặt lại document model về trạng thái mặc định ban đầu,
 * xóa đường dẫn file và cập nhật lại nội dung trên editor.
 */
export async function createNewDocument(editor: Editor | null): Promise<FileOperationResult> {
  await recoveryService.markCleanShutdown();
  const store = useDocumentStore.getState();
  store.resetDocument();
  autosaveEngine.resetLastSnapshot();

  const freshDoc = useDocumentStore.getState().document;
  await recoveryService.startSession(freshDoc.metadata.id, freshDoc.metadata.title, null);

  if (editor) {
    editor.commands.setContent(freshDoc.content);
    editor.commands.focus();
  }

  return { success: true };
}

/**
 * Mở tài liệu từ file (*.mwd hoặc *.docx) bằng native file dialog của Windows.
 * Kiểm tra tính hợp lệ và phiên bản, ngăn ngừa sập app nếu file bị lỗi.
 */
export async function openDocumentFile(editor: Editor | null): Promise<FileOperationResult> {
  if (!isTauriEnvironment()) {
    const msg = "Tính năng Mở tệp yêu cầu môi trường ứng dụng desktop Tauri.";
    return { success: false, error: msg };
  }

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");

    const selected = await open({
      title: "Mở tài liệu (Personal Word hoặc Word DOCX)",
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Mọi định dạng được hỗ trợ (*.mwd, *.docx)",
          extensions: ["mwd", "docx"],
        },
        {
          name: "Personal Word Document (*.mwd)",
          extensions: ["mwd"],
        },
        {
          name: "Microsoft Word Document (*.docx)",
          extensions: ["docx"],
        },
      ],
    });

    if (!selected || typeof selected !== "string") {
      // Người dùng hủy hộp thoại mở
      return { success: false, cancelled: true };
    }

    const filePath = selected;
    const isDocx = filePath.toLowerCase().endsWith(".docx");

    if (isDocx) {
      // Đọc file nhị phân DOCX qua Rust backend
      const rawBytes = await invoke<number[] | Uint8Array>("read_binary_file", { path: filePath });
      const bytes = new Uint8Array(rawBytes);

      const importResult = await importDocxToDocumentModel(bytes, filePath);
      if (!importResult.success) {
        return { success: false, error: importResult.error };
      }

      const loadedDoc = importResult.document;
      await recoveryService.markCleanShutdown();
      const store = useDocumentStore.getState();

      // Gán filePath đích để Ctrl+S có thể lưu lại .docx
      store.setDocument(loadedDoc, filePath);
      autosaveEngine.resetLastSnapshot();
      await recoveryService.startSession(loadedDoc.metadata.id, loadedDoc.metadata.title, filePath);

      if (editor) {
        editor.commands.setContent(loadedDoc.content);
        editor.commands.focus();
      }

      return { success: true, filePath };
    } else {
      // .mwd -> existing loader đang ổn định 100%
      const rawContent = await invoke<string>("read_document_file", { path: filePath });

      const parseResult = deserializeMwdToDocument(rawContent);
      if (!parseResult.success) {
        return { success: false, error: parseResult.error };
      }

      const loadedDoc = parseResult.document;
      await recoveryService.markCleanShutdown();
      const store = useDocumentStore.getState();
      store.setDocument(loadedDoc, filePath);
      autosaveEngine.resetLastSnapshot();
      await recoveryService.startSession(loadedDoc.metadata.id, loadedDoc.metadata.title, filePath);

      if (editor) {
        editor.commands.setContent(loadedDoc.content);
        editor.commands.focus();
      }

      return { success: true, filePath };
    }
  } catch (err) {
    const errorMsg = `Lỗi khi mở tệp: ${err instanceof Error ? err.message : String(err)}`;
    return { success: false, error: errorMsg };
  }
}

/**
 * Lưu tài liệu hiện tại (Save).
 * - Nếu đã có đường dẫn .docx: xuất và ghi đè an toàn vào file .docx đó.
 * - Nếu đã có đường dẫn .mwd: ghi đè trực tiếp vào file .mwd đó.
 * - Nếu chưa có đường dẫn: chuyển tiếp sang Save As.
 */
export async function saveDocumentFile(editor: Editor | null): Promise<FileOperationResult> {
  const { filePath } = useDocumentStore.getState();

  if (!filePath) {
    return saveAsDocumentFile(editor);
  }

  if (!isTauriEnvironment()) {
    return {
      success: false,
      error: "Tính năng Lưu tệp yêu cầu môi trường desktop Tauri.",
    };
  }

  autosaveEngine.setExplicitSaveLock(true);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const store = useDocumentStore.getState();

    // Đồng bộ nội dung mới nhất từ editor nếu có
    const latestContent = editor ? editor.getJSON() : store.document.content;
    const syncedChanges = TrackChangesService.getTrackedChangesFromDoc(
      editor ? editor.state.doc : latestContent
    );
    const currentDoc: DocumentModel = {
      ...store.document,
      content: latestContent,
      trackedChanges: syncedChanges,
    };
    store.setTrackedChanges(syncedChanges);

    const isDocx = filePath.toLowerCase().endsWith(".docx");

    if (isDocx) {
      // Kiểm tra độ tương thích review metadata (Phase 5.8 - Data Loss Safety)
      const compatWarnings = checkDocxExportReviewCompatibility(currentDoc);
      if (compatWarnings.length > 0) {
        console.warn("Cảnh báo tương thích khi xuất DOCX:", compatWarnings);
      }

      // Xuất nội dung hiện tại thành byte DOCX
      const docxBytes = await exportDocumentModelToDocx(currentDoc);
      // Ghi nhị phân an toàn qua Rust backend
      await invoke<void>("write_binary_file", {
        path: filePath,
        content: Array.from(docxBytes),
      });
      store.markSaved(filePath);

      // Ghi nhận milestone snapshot
      void createSnapshot(currentDoc, "explicit-save", {
        description: "Lưu tệp DOCX chính thức",
        filePath,
      }).then((snap) => {
        void recoveryService.recordRecoverySnapshot(
          currentDoc.metadata.id,
          currentDoc.metadata.title,
          filePath,
          snap.metadata.id
        );
      }).catch(() => {});

      return { success: true, filePath };
    } else {
      const serialized = serializeDocumentToMwd(currentDoc);
      await invoke<void>("write_document_file", {
        path: filePath,
        content: serialized,
      });

      store.markSaved(filePath);

      // Ghi nhận milestone snapshot
      void createSnapshot(currentDoc, "explicit-save", {
        description: "Lưu tệp MWD chính thức",
        filePath,
      }).then((snap) => {
        void recoveryService.recordRecoverySnapshot(
          currentDoc.metadata.id,
          currentDoc.metadata.title,
          filePath,
          snap.metadata.id
        );
      }).catch(() => {});

      return { success: true, filePath };
    }
  } catch (err) {
    const errorMsg = `Lỗi khi lưu tệp: ${err instanceof Error ? err.message : String(err)}`;
    return { success: false, error: errorMsg };
  } finally {
    autosaveEngine.setExplicitSaveLock(false);
  }
}

/**
 * Lưu tài liệu với tên mới (Save As) qua native Windows Save Dialog.
 * Cho phép người dùng chọn lưu dưới định dạng Personal Word (*.mwd) hoặc Word Document (*.docx).
 */
export async function saveAsDocumentFile(editor: Editor | null): Promise<FileOperationResult> {
  if (!isTauriEnvironment()) {
    return {
      success: false,
      error: "Tính năng Lưu tệp yêu cầu môi trường desktop Tauri.",
    };
  }

  autosaveEngine.setExplicitSaveLock(true);
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const store = useDocumentStore.getState();

    const currentTitle = store.documentTitle || store.document.metadata.title || "Tai_lieu";
    const sanitizedTitle = currentTitle.replace(/[\\/:*?"<>|]/g, "_");
    const currentFilePath = store.filePath;
    const isCurrentlyDocx = currentFilePath ? currentFilePath.toLowerCase().endsWith(".docx") : false;

    const defaultFileName = isCurrentlyDocx
      ? (sanitizedTitle.endsWith(".docx") ? sanitizedTitle : `${sanitizedTitle}.docx`)
      : (sanitizedTitle.endsWith(".mwd") ? sanitizedTitle : `${sanitizedTitle}.mwd`);

    const selected = await save({
      title: "Lưu bản sao tài liệu (Save As)",
      defaultPath: defaultFileName,
      filters: [
        {
          name: "Personal Word Document (*.mwd)",
          extensions: ["mwd"],
        },
        {
          name: "Microsoft Word Document (*.docx)",
          extensions: ["docx"],
        },
      ],
    });

    if (!selected || typeof selected !== "string") {
      // Người dùng hủy hộp thoại lưu
      return { success: false, cancelled: true };
    }

    let finalPath = selected;
    const isDocx = finalPath.toLowerCase().endsWith(".docx");
    const isMwd = finalPath.toLowerCase().endsWith(".mwd");

    // Nếu người dùng không nhập đuôi file, gán đuôi theo ngữ cảnh hiện tại
    if (!isDocx && !isMwd) {
      finalPath = isCurrentlyDocx ? `${finalPath}.docx` : `${finalPath}.mwd`;
    }

    const latestContent = editor ? editor.getJSON() : store.document.content;
    const syncedChanges = TrackChangesService.getTrackedChangesFromDoc(
      editor ? editor.state.doc : latestContent
    );

    // Save As: Thiết lập định danh tài liệu độc lập (New Document Identity)
    // để lịch sử snapshot của tệp mới không bị trộn lẫn với tệp cũ
    const newDocId = generateDocumentId();
    const filenameBase = finalPath.split(/[/\\]/).pop()?.replace(/\.(docx|mwd)$/i, "");
    const updatedTitle = filenameBase || currentTitle;
    const updatedMetadata = {
      ...store.document.metadata,
      id: newDocId,
      title: updatedTitle,
    };

    const currentDoc: DocumentModel = {
      ...useDocumentStore.getState().document,
      metadata: updatedMetadata,
      content: latestContent,
      trackedChanges: syncedChanges,
    };
    store.setTrackedChanges(syncedChanges);

    useDocumentStore.setState((s) => ({
      document: {
        ...s.document,
        metadata: updatedMetadata,
      },
      documentTitle: updatedTitle,
    }));

    if (finalPath.toLowerCase().endsWith(".docx")) {
      // Kiểm tra độ tương thích review metadata (Phase 5.8 - Data Loss Safety)
      const compatWarnings = checkDocxExportReviewCompatibility(currentDoc);
      if (compatWarnings.length > 0) {
        console.warn("Cảnh báo tương thích khi xuất DOCX:", compatWarnings);
      }

      const docxBytes = await exportDocumentModelToDocx(currentDoc);
      await invoke<void>("write_binary_file", {
        path: finalPath,
        content: Array.from(docxBytes),
      });

      store.markSaved(finalPath);
      autosaveEngine.resetLastSnapshot();
      await recoveryService.startSession(newDocId, updatedTitle, finalPath);

      void createSnapshot(currentDoc, "explicit-save", {
        description: "Lưu bản sao tệp DOCX chính thức (Save As)",
        filePath: finalPath,
      }).then((snap) => {
        void recoveryService.recordRecoverySnapshot(
          newDocId,
          updatedTitle,
          finalPath,
          snap.metadata.id
        );
      }).catch(() => {});

      return { success: true, filePath: finalPath };
    } else {
      const serialized = serializeDocumentToMwd(currentDoc);
      await invoke<void>("write_document_file", {
        path: finalPath,
        content: serialized,
      });

      store.markSaved(finalPath);
      autosaveEngine.resetLastSnapshot();
      await recoveryService.startSession(newDocId, updatedTitle, finalPath);

      void createSnapshot(currentDoc, "explicit-save", {
        description: "Lưu bản sao tệp MWD chính thức (Save As)",
        filePath: finalPath,
      }).then((snap) => {
        void recoveryService.recordRecoverySnapshot(
          newDocId,
          updatedTitle,
          finalPath,
          snap.metadata.id
        );
      }).catch(() => {});

      return { success: true, filePath: finalPath };
    }
  } catch (err) {
    const errorMsg = `Lỗi khi lưu bản sao tệp: ${err instanceof Error ? err.message : String(err)}`;
    return { success: false, error: errorMsg };
  } finally {
    autosaveEngine.setExplicitSaveLock(false);
  }
}

/**
 * Xuất trực tiếp tài liệu thành file Microsoft Word (.docx)
 */
export async function exportDocxFile(editor: Editor | null): Promise<FileOperationResult> {
  if (!isTauriEnvironment()) {
    return {
      success: false,
      error: "Tính năng Xuất DOCX yêu cầu môi trường desktop Tauri.",
    };
  }

  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { invoke } = await import("@tauri-apps/api/core");
    const store = useDocumentStore.getState();

    const currentTitle = store.documentTitle || store.document.metadata.title || "Tai_lieu";
    const sanitizedTitle = currentTitle.replace(/[\\/:*?"<>|]/g, "_").replace(/\.mwd$/i, "");
    const defaultFileName = sanitizedTitle.endsWith(".docx") ? sanitizedTitle : `${sanitizedTitle}.docx`;

    const selected = await save({
      title: "Xuất tài liệu Word (.docx)",
      defaultPath: defaultFileName,
      filters: [
        {
          name: "Microsoft Word Document (*.docx)",
          extensions: ["docx"],
        },
      ],
    });

    if (!selected || typeof selected !== "string") {
      return { success: false, cancelled: true };
    }

    const finalPath = selected.toLowerCase().endsWith(".docx") ? selected : `${selected}.docx`;

    const latestContent = editor ? editor.getJSON() : store.document.content;
    const currentDoc: DocumentModel = {
      ...store.document,
      content: latestContent,
    };

    const docxBytes = await exportDocumentModelToDocx(currentDoc);
    await invoke<void>("write_binary_file", {
      path: finalPath,
      content: Array.from(docxBytes),
    });

    return { success: true, filePath: finalPath };
  } catch (err) {
    const errorMsg = `Lỗi khi xuất tệp DOCX: ${err instanceof Error ? err.message : String(err)}`;
    return { success: false, error: errorMsg };
  }
}

/**
 * Thực hiện một hành động có bảo vệ trạng thái bẩn (Dirty State Protection):
 * Nếu tài liệu có thay đổi chưa lưu, hộp thoại Save / Don't Save / Cancel sẽ xuất hiện.
 * - Save: Lưu thành công rồi mới tiếp tục hành động. Nếu Save hủy hoặc lỗi -> dừng lại, không mất dữ liệu.
 * - Don't Save: Tiếp tục thực hiện hành động mà không lưu.
 * - Cancel: Hủy bỏ hành động, giữ nguyên tài liệu hiện tại.
 */
export async function executeWithProtection(
  actionType: ProtectedActionType,
  actionCallback: () => Promise<FileOperationResult | void>,
  editor: Editor | null
): Promise<FileOperationResult> {
  const store = useDocumentStore.getState();
  const { isDirty, documentTitle, filePath } = store;

  // Nếu không dirty, tiến hành hành động ngay lập tức
  if (!isDirty) {
    const res = await actionCallback();
    return res || { success: true };
  }

  // Tài liệu đang dirty: hỏi người dùng
  const displayTitle = filePath
    ? filePath.split(/[/\\]/).pop() || documentTitle
    : documentTitle;

  const choice = await useConfirmDialogStore
    .getState()
    .promptSaveConfirmation(actionType, displayTitle);

  if (choice === "cancel") {
    return { success: false, cancelled: true };
  }

  if (choice === "save") {
    const saveRes = await saveDocumentFile(editor);
    if (!saveRes.success) {
      // Save bị cancel hoặc lỗi -> giữ nguyên tài liệu, không tiếp tục hành động!
      return {
        success: false,
        cancelled: saveRes.cancelled,
        error: saveRes.error,
      };
    }
    // Save thành công -> tiếp tục hành động
    const res = await actionCallback();
    return res || { success: true };
  }

  if (choice === "dontsave") {
    const res = await actionCallback();
    return res || { success: true };
  }

  return { success: false, cancelled: true };
}

/**
 * Yêu cầu tạo tài liệu mới có bảo vệ Dirty State
 */
export async function requestCreateNewDocument(editor: Editor | null): Promise<FileOperationResult> {
  return executeWithProtection("new", () => createNewDocument(editor), editor);
}

/**
 * Yêu cầu mở tài liệu có bảo vệ Dirty State
 */
export async function requestOpenDocumentFile(editor: Editor | null): Promise<FileOperationResult> {
  return executeWithProtection("open", () => openDocumentFile(editor), editor);
}

/**
 * Yêu cầu đóng ứng dụng có bảo vệ Dirty State
 */
export async function requestCloseApp(editor: Editor | null): Promise<FileOperationResult> {
  return executeWithProtection(
    "close",
    async () => {
      await recoveryService.markAllCleanShutdown();
      if (isTauriEnvironment()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("exit_app");
      } else {
        window.close();
      }
    },
    editor
  );
}
