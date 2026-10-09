import { useState } from "react";
import {
  FileText,
  FileDown,
  X,
  Plus,
  Trash2,
  CornerDownLeft,
  BookOpen,
} from "lucide-react";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import { useEditorStore } from "../../stores/editorStore.ts";
import { NoteService } from "../services/noteService.ts";
import type { NoteItem, NoteType } from "../types/noteTypes.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";

/**
 * Props cho NotesSidebar
 */
export interface NotesSidebarProps {
  editor?: any;
}

/**
 * NotesSidebar - Bảng quản lý Chú thích (Footnotes & Endnotes) bên lề (Phase 6.4 Architecture)
 *
 * Cho phép:
 * - Xem danh sách Footnote và Endnote theo thứ tự ngữ nghĩa liên tục
 * - Chỉnh sửa nội dung chú thích trực tiếp và đồng bộ với ProseMirror AST
 * - Điều hướng hai chiều (Click vào chú thích -> cuộn tới vị trí tham chiếu trong văn bản)
 * - Xóa chú thích an toàn mà không để lại dữ liệu mồ côi (orphan)
 * - Thêm nhanh chú thích mới tại vị trí con trỏ
 */
export function NotesSidebar({ editor: propEditor }: NotesSidebarProps) {
  const storeEditor = useEditorStore((state) => state.editor);
  const editor = propEditor || storeEditor;

  const isReferencesPanelOpen = useReferencesStore((state) => state.isReferencesPanelOpen);
  const activeReferencePanel = useReferencesStore((state) => state.activeReferencePanel);
  const selectedReferenceId = useReferencesStore((state) => state.selectedReferenceId);
  const closeReferencePanel = useReferencesStore((state) => state.closeReferencePanel);
  const setSelectedReferenceId = useReferencesStore((state) => state.setSelectedReferenceId);

  const documentContent = useDocumentStore((state) => state.document.content);

  const [activeTab, setActiveTab] = useState<NoteType>("footnote");
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});

  // Chỉ hiển thị khi panel đang mở và là tab notes
  if (!isReferencesPanelOpen || activeReferencePanel !== "notes") {
    return null;
  }

  // Trích xuất danh sách notes từ AST của editor hoặc document content
  const notesData = editor?.state?.doc
    ? NoteService.extractNotes(editor.state.doc)
    : NoteService.extractNotes(documentContent);

  const activeNotes: NoteItem[] =
    activeTab === "footnote" ? notesData.footnotes : notesData.endnotes;

  const handleTextChange = (noteId: string, val: string) => {
    setEditingContent((prev) => ({ ...prev, [noteId]: val }));
    if (editor) {
      NoteService.updateNoteContent(editor, noteId, val);
    }
  };

  const handleReturnToReference = (noteId: string) => {
    if (editor) {
      NoteService.navigateToNoteReference(editor, noteId);
    }
  };

  const handleDelete = (noteId: string) => {
    if (editor) {
      NoteService.deleteNote(editor, noteId);
    }
  };

  const handleInsertNew = () => {
    if (editor) {
      NoteService.insertNote(editor, activeTab, "");
    }
  };

  return (
    <aside
      className="notes-sidebar references-sidebar"
      role="complementary"
      aria-label="Bảng quản lý chú thích Footnotes và Endnotes"
    >
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-title">
          <BookOpen size={16} className="sidebar-title-icon" />
          <span>Quản lý Chú thích</span>
        </div>
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={closeReferencePanel}
          title="Đóng bảng chú thích"
          aria-label="Đóng bảng chú thích"
        >
          <X size={15} />
        </button>
      </div>

      {/* Tabs chuyển đổi Footnote / Endnote */}
      <div className="notes-tabs-bar">
        <button
          type="button"
          className={`notes-tab-btn ${activeTab === "footnote" ? "active" : ""}`}
          onClick={() => setActiveTab("footnote")}
        >
          <FileText size={14} />
          <span>Footnotes</span>
          <span className="notes-count-badge">{notesData.footnotes.length}</span>
        </button>
        <button
          type="button"
          className={`notes-tab-btn ${activeTab === "endnote" ? "active" : ""}`}
          onClick={() => setActiveTab("endnote")}
        >
          <FileDown size={14} />
          <span>Endnotes</span>
          <span className="notes-count-badge">{notesData.endnotes.length}</span>
        </button>
      </div>

      {/* Danh sách các chú thích */}
      <div className="notes-list-scroll">
        {activeNotes.length === 0 ? (
          <div className="notes-empty-state">
            <p className="empty-title">
              Chưa có {activeTab === "footnote" ? "Footnote" : "Endnote"} nào
            </p>
            <p className="empty-desc">
              Đặt con trỏ tại vị trí cần giải thích trong văn bản và nhấn nút bên dưới hoặc dùng phím tắt{" "}
              <strong>{activeTab === "footnote" ? "Ctrl+Alt+F" : "Ctrl+Alt+D"}</strong>.
            </p>
            <button
              type="button"
              className="notes-add-action-btn"
              onClick={handleInsertNew}
            >
              <Plus size={14} />
              <span>Chèn {activeTab === "footnote" ? "Footnote" : "Endnote"} mới</span>
            </button>
          </div>
        ) : (
          <div className="notes-items-container">
            {activeNotes.map((note) => {
              const isSelected = selectedReferenceId === note.id;
              const contentVal =
                editingContent[note.id] !== undefined
                  ? editingContent[note.id]
                  : note.content;

              return (
                <div
                  key={note.id}
                  id={`note-item-${note.id}`}
                  className={`note-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => setSelectedReferenceId(note.id)}
                >
                  <div className="note-card-header">
                    <div className="note-card-label">
                      <span className="note-marker-badge">{note.label}</span>
                      <span className="note-type-text">
                        {activeTab === "footnote" ? "Footnote" : "Endnote"}
                      </span>
                    </div>
                    <div className="note-card-actions">
                      <button
                        type="button"
                        className="note-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReturnToReference(note.id);
                        }}
                        title="Quay lại vị trí tham chiếu trong văn bản"
                        aria-label="Quay lại vị trí tham chiếu"
                      >
                        <CornerDownLeft size={13} />
                      </button>
                      <button
                        type="button"
                        className="note-action-btn delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(note.id);
                        }}
                        title="Xóa chú thích này"
                        aria-label="Xóa chú thích"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="note-card-body">
                    <textarea
                      className="note-content-input"
                      value={contentVal}
                      placeholder="Nhập nội dung giải thích chú thích..."
                      rows={3}
                      onChange={(e) => handleTextChange(note.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer thanh công cụ */}
      {activeNotes.length > 0 && (
        <div className="notes-sidebar-footer">
          <button
            type="button"
            className="notes-quick-add-btn"
            onClick={handleInsertNew}
          >
            <Plus size={14} />
            <span>Thêm {activeTab === "footnote" ? "Footnote" : "Endnote"}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
