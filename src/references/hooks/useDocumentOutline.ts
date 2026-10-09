import { useState, useEffect, useCallback, useRef } from "react";
import { useEditorStore } from "../../stores/editorStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { HeadingService, type HeadingItem } from "../services/headingService.ts";

/**
 * useDocumentOutline - Hook quản lý sơ đồ đề mục trực tiếp (Live Document Outline)
 *
 * Tự động cập nhật khi:
 * - Thêm / xóa heading
 * - Đổi đoạn văn thường -> Heading (hoặc ngược lại)
 * - Đổi level Heading (H1 <-> H2 <-> H3)
 * - Sửa nội dung text của Heading
 * - Undo / Redo
 * - Mở tệp tin mới
 *
 * Áp dụng debounce hợp lý để không gây giật lag khi gõ nhanh.
 */
export function useDocumentOutline() {
  const editor = useEditorStore((state) => state.editor);
  const document = useDocumentStore((state) => state.document);
  const sections = useDocumentStore((state) => state.sections);

  const [headings, setHeadings] = useState<HeadingItem[]>(() => {
    return HeadingService.extractHeadings(document.content, sections);
  });

  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeHeadings = useCallback(() => {
    if (!editor || !editor.state) {
      setHeadings(HeadingService.extractHeadings(document.content, sections));
      return;
    }

    const currentHeadings = HeadingService.extractHeadings(editor.state.doc, sections);
    setHeadings(currentHeadings);

    // Xác định heading gần nhất với con trỏ hiện tại
    const { from } = editor.state.selection;
    let closestId: string | null = null;
    let minDistance = Infinity;

    for (const h of currentHeadings) {
      if (from >= h.from && from <= h.to) {
        closestId = h.id;
        break;
      }
      if (from >= h.from) {
        const dist = from - h.from;
        if (dist < minDistance) {
          minDistance = dist;
          closestId = h.id;
        }
      }
    }

    setActiveHeadingId(closestId);
  }, [editor, document.content, sections]);

  useEffect(() => {
    if (!editor) {
      computeHeadings();
      return;
    }

    computeHeadings();

    const handleTransaction = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        computeHeadings();
      }, 100);
    };

    const handleSelection = () => {
      // Cập nhật activeHeadingId ngay lập tức khi di chuyển chuột / phím mũi tên
      const { from } = editor.state.selection;
      let closestId: string | null = null;
      let minDistance = Infinity;

      for (const h of headings) {
        if (from >= h.from && from <= h.to) {
          closestId = h.id;
          break;
        }
        if (from >= h.from) {
          const dist = from - h.from;
          if (dist < minDistance) {
            minDistance = dist;
            closestId = h.id;
          }
        }
      }

      setActiveHeadingId(closestId);
    };

    editor.on("transaction", handleTransaction);
    editor.on("selectionUpdate", handleSelection);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      editor.off("transaction", handleTransaction);
      editor.off("selectionUpdate", handleSelection);
    };
  }, [editor, computeHeadings, headings]);

  // Cập nhật khi nạp tài liệu mới (document.metadata.id thay đổi)
  useEffect(() => {
    computeHeadings();
  }, [document.metadata.id, computeHeadings]);

  const navigateToHeading = useCallback(
    (heading: HeadingItem) => {
      if (!editor) return false;
      const success = HeadingService.navigateToHeading(editor, heading);
      if (success) {
        setActiveHeadingId(heading.id);
      }
      return success;
    },
    [editor]
  );

  const headingTree = HeadingService.buildHeadingHierarchy(headings);

  return {
    headings,
    headingTree,
    activeHeadingId,
    navigateToHeading,
    refreshHeadings: computeHeadings,
    isEmpty: headings.length === 0,
  };
}
