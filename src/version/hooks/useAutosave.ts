import { useEffect, useRef } from "react";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { autosaveEngine } from "../services/autosaveEngine.ts";
import { recoveryService } from "../services/recoveryService.ts";

/**
 * Hook quản lý vòng đời Tự động lưu (Autosave) và ghi nhận phiên làm việc cho React:
 * - Lắng nghe thay đổi nội dung và thuộc tính tài liệu trong store.
 * - Kích hoạt debounce autosave khi isDirty = true.
 * - Khởi tạo/chuyển đổi phiên làm việc khi ID tài liệu thay đổi (New/Open/Save As).
 */
export function useAutosave(): void {
  const documentId = useDocumentStore((state) => state.document.metadata.id);
  const documentTitle = useDocumentStore((state) => state.documentTitle);
  const filePath = useDocumentStore((state) => state.filePath);
  const isDirty = useDocumentStore((state) => state.isDirty);
  const content = useDocumentStore((state) => state.document.content);
  const pageSettings = useDocumentStore((state) => state.pageSettings);

  const prevDocIdRef = useRef<string | null>(null);

  // 1. Khởi tạo/chuyển đổi phiên làm việc khi ID tài liệu thay đổi
  useEffect(() => {
    if (prevDocIdRef.current !== documentId) {
      prevDocIdRef.current = documentId;
      autosaveEngine.resetLastSnapshot();
      void recoveryService.startSession(documentId, documentTitle, filePath);
    }
  }, [documentId, documentTitle, filePath]);

  // 2. Kích hoạt thông báo thay đổi cho Autosave Engine khi tài liệu dirty
  useEffect(() => {
    if (isDirty) {
      autosaveEngine.notifyDocumentChange();
    }
  }, [content, pageSettings, documentTitle, isDirty]);

  // 3. Dọn dẹp khi unmount
  useEffect(() => {
    return () => {
      autosaveEngine.cancelPending();
    };
  }, []);
}
