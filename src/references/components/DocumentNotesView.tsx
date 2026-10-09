import type { Editor } from "@tiptap/core";
import { NoteService } from "../services/noteService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";

export interface DocumentNotesViewProps {
  editor?: Editor | null;
}

/**
 * DocumentNotesView - Thành phần hiển thị Chú thích ngữ nghĩa chân trang và cuối bài
 * (Phase 6.4 Architecture)
 *
 * Tích hợp an toàn vào cuối nội dung soạn thảo:
 * - Footnotes: Ngăn cách bởi vạch phân cách chú thích tiêu chuẩn (Footnote Separator Line)
 * - Endnotes: Hiển thị ở cuối tài liệu với tiêu đề phân định rõ ràng
 * - Số thứ tự và nhãn đồng bộ 100% với marker trong AST
 * - Nhấp vào số thứ tự để quay trở lại vị trí marker trong văn bản
 */
export function DocumentNotesView({ editor }: DocumentNotesViewProps) {
  const documentContent = useDocumentStore((state) => state.document.content);

  const notesData = editor?.state?.doc
    ? NoteService.extractNotes(editor.state.doc)
    : NoteService.extractNotes(documentContent);

  const hasFootnotes = notesData.footnotes.length > 0;
  const hasEndnotes = notesData.endnotes.length > 0;

  if (!hasFootnotes && !hasEndnotes) {
    return null;
  }

  const handleReturnToRef = (noteId: string) => {
    if (editor) {
      NoteService.navigateToNoteReference(editor, noteId);
    }
  };

  return (
    <div
      className="document-notes-container"
      role="region"
      aria-label="Vùng hiển thị chú thích Footnotes và Endnotes"
    >
      {/* 1. KHỐI CHÚ THÍCH CHÂN TRANG (FOOTNOTES) */}
      {hasFootnotes && (
        <section className="document-footnotes-section" aria-label="Chú thích chân trang">
          <div className="footnote-separator" />
          <ol className="footnotes-list">
            {notesData.footnotes.map((fn) => (
              <li
                key={fn.id}
                id={`doc-note-${fn.id}`}
                className="footnote-item"
              >
                <button
                  type="button"
                  className="note-number-btn"
                  onClick={() => handleReturnToRef(fn.id)}
                  title="Nhấp để quay lại vị trí chú thích trong văn bản"
                >
                  <sup>{fn.label}</sup>
                </button>
                <span className="note-text-body">
                  {fn.content || (
                    <span className="note-text-empty">(Chưa có nội dung chú thích)</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 2. KHỐI CHÚ THÍCH CUỐI TÀI LIỆU (ENDNOTES) */}
      {hasEndnotes && (
        <section className="document-endnotes-section" aria-label="Chú thích cuối tài liệu">
          <div className="endnote-separator" />
          <h4 className="endnotes-heading">GHI CHÚ CUỐI TÀI LIỆU (ENDNOTES)</h4>
          <ol className="endnotes-list">
            {notesData.endnotes.map((en) => (
              <li
                key={en.id}
                id={`doc-note-${en.id}`}
                className="endnote-item"
              >
                <button
                  type="button"
                  className="note-number-btn"
                  onClick={() => handleReturnToRef(en.id)}
                  title="Nhấp để quay lại vị trí chú thích trong văn bản"
                >
                  <sup>{en.label}</sup>
                </button>
                <span className="note-text-body">
                  {en.content || (
                    <span className="note-text-empty">(Chưa có nội dung chú thích)</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
