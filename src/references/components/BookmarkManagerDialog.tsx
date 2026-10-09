import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bookmark as BookmarkIcon,
  Search,
  Compass,
  Edit2,
  Trash2,
  Check,
  X,
  AlertCircle,
  Plus,
  ArrowUpDown,
  FileText,
  MapPin,
} from "lucide-react";
import { BookmarkService } from "../services/bookmarkService.ts";
import type { BookmarkLocation } from "../types/bookmarkTypes.ts";

export interface BookmarkManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

/**
 * BookmarkManagerDialog - Hộp thoại Quản lý Thẻ đánh dấu (Bookmark Manager)
 * Personal Word Editor (Phase 6 Architecture)
 *
 * Tính năng chính:
 * 1. Add Bookmark:
 *    - Tự động nhận diện selection (Range Bookmark) hoặc caret (Position Bookmark).
 *    - Bảo tồn vùng chọn (Preserve Selection) khi mở hộp thoại qua savedSelection state.
 *    - Validation duy nhất và định danh an toàn từ BookmarkService.
 * 2. Go To (Đến):
 *    - Nhảy đến anchor ngữ nghĩa của thẻ đánh dấu.
 *    - Range: chọn toàn bộ vùng văn bản; Position: đặt con trỏ tại neo.
 *    - scrollIntoView & editor.focus(), tuyệt đối không mutate AST content.
 * 3. Rename (Đổi tên):
 *    - Đổi tên hiển thị, bảo toàn ID ổn định (ref_bookmark_<uuid>).
 *    - Không làm thay đổi nội dung văn bản.
 * 4. Delete (Xóa):
 *    - Gỡ bỏ anchor node hoặc bookmark mark, giữ nguyên toàn bộ văn bản của người dùng.
 * 5. Performance:
 *    - Chỉ scan AST khi dialog mở và khi có transaction liên quan.
 *    - Không scan document trên mỗi React render.
 * 6. History & Dirty State:
 *    - Tích hợp Undo/Redo với ProseMirror history.
 *    - Đánh dấu isDirty = true khi Add/Rename/Delete, không dirty khi chỉ xem hoặc Đóng.
 */
export const BookmarkManagerDialog: React.FC<BookmarkManagerDialogProps> = ({
  isOpen,
  onClose,
  editor,
}) => {
  // 1. Trạng thái input thêm mới
  const [nameInput, setNameInput] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // 2. Bảo lưu vùng chọn của Editor tại thời điểm mở hộp thoại
  const [savedSelection, setSavedSelection] = useState<{
    from: number;
    to: number;
    empty: boolean;
    text: string;
  } | null>(null);

  // 3. Trạng thái danh sách & filter
  const [bookmarks, setBookmarks] = useState<BookmarkLocation[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"docOrder" | "name">("docOrder");
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);

  // 4. Trạng thái đổi tên inline
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [editingError, setEditingError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Trích xuất danh sách bookmarks từ AST (Pure function over AST, không scan DOM)
  const refreshBookmarks = useCallback(() => {
    if (!editor || !isOpen) return;
    const list = BookmarkService.extractBookmarks(editor.state.doc);
    setBookmarks(list);
  }, [editor, isOpen]);

  // Khi mở dialog: lưu selection hiện tại, reset input và nạp danh sách
  useEffect(() => {
    if (isOpen && editor && editor.state) {
      const { selection, doc } = editor.state;
      const isRange = !selection.empty;
      const rangeText = isRange ? doc.textBetween(selection.from, selection.to).trim() : "";

      setSavedSelection({
        from: selection.from,
        to: selection.to,
        empty: selection.empty,
        text: rangeText,
      });

      setNameInput("");
      setValidationError(null);
      setEditingBookmarkId(null);
      setEditingError(null);
      setSearchQuery("");

      refreshBookmarks();

      // Đặt focus vào input tên thẻ đánh dấu
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else if (!isOpen) {
      setSavedSelection(null);
      setEditingBookmarkId(null);
      setEditingError(null);
      setValidationError(null);
    }
  }, [isOpen, editor, refreshBookmarks]);

  // Lắng nghe transaction khi dialog đang mở để tự động đồng bộ danh sách
  useEffect(() => {
    if (!isOpen || !editor) return;

    const handleTransaction = () => {
      refreshBookmarks();
    };

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [isOpen, editor, refreshBookmarks]);

  // Bộ lọc và sắp xếp memoized — không scan lại AST trên mỗi render
  const filteredBookmarks = useMemo(() => {
    let result = bookmarks;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.bookmark.name.toLowerCase().includes(q) ||
          (b.text && b.text.toLowerCase().includes(q))
      );
    }

    if (sortBy === "name") {
      result = [...result].sort((a, b) =>
        a.bookmark.name.localeCompare(b.bookmark.name, "vi", { sensitivity: "base" })
      );
    } else {
      // docOrder: đã được sort theo a.from - b.from từ BookmarkService.extractBookmarks
      result = [...result].sort((a, b) => a.from - b.from);
    }

    return result;
  }, [bookmarks, searchQuery, sortBy]);

  // Xử lý Thêm Bookmark
  const handleAddBookmark = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editor) return;

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setValidationError("Tên thẻ đánh dấu không được để trống.");
      return;
    }

    // Xác thực trùng lặp và cú pháp trước khi dispatch
    const valResult = BookmarkService.validateBookmarkName(editor.state.doc, trimmed);
    if (!valResult.valid) {
      setValidationError(valResult.error || "Tên thẻ đánh dấu không hợp lệ.");
      return;
    }

    // Bảo tồn selection: Khôi phục selection trên Editor nếu cần
    if (savedSelection) {
      const tr = editor.state.tr;
      if (savedSelection.empty) {
        const safePos = Math.min(Math.max(0, savedSelection.from), editor.state.doc.content.size);
        tr.setSelection(TextSelection.near(editor.state.doc.resolve(safePos)));
      } else {
        const safeFrom = Math.min(Math.max(0, savedSelection.from), editor.state.doc.content.size);
        const safeTo = Math.min(Math.max(safeFrom, savedSelection.to), editor.state.doc.content.size);
        tr.setSelection(TextSelection.create(editor.state.doc, safeFrom, safeTo));
      }
      editor.view.dispatch(tr);
    }

    const res = BookmarkService.createBookmark(editor, {
      name: trimmed,
      from: savedSelection ? savedSelection.from : undefined,
      to: savedSelection ? savedSelection.to : undefined,
    });

    if (!res.success) {
      setValidationError(res.error || "Không thể tạo thẻ đánh dấu.");
      return;
    }

    setNameInput("");
    setValidationError(null);
    if (res.bookmark) {
      setSelectedBookmarkId(res.bookmark.id);
    }
    refreshBookmarks();
  };

  // Xử lý Nhảy đến Bookmark (Go To)
  const handleGoTo = (bookmarkId: string) => {
    if (!editor) return;
    const ok = BookmarkService.navigateToBookmark(editor, bookmarkId);
    if (ok) {
      setSelectedBookmarkId(bookmarkId);
    }
  };

  // Bắt đầu chỉnh sửa tên
  const handleStartRename = (loc: BookmarkLocation) => {
    setEditingBookmarkId(loc.bookmark.id);
    setEditingName(loc.bookmark.name);
    setEditingError(null);
  };

  // Lưu tên mới (Rename)
  const handleSaveRename = (bookmarkId: string) => {
    if (!editor) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingError("Tên thẻ đánh dấu không được để trống.");
      return;
    }

    const valResult = BookmarkService.validateBookmarkName(
      editor.state.doc,
      trimmed,
      bookmarkId
    );
    if (!valResult.valid) {
      setEditingError(valResult.error || "Tên thẻ đánh dấu không hợp lệ.");
      return;
    }

    const res = BookmarkService.renameBookmark(editor, bookmarkId, trimmed);
    if (!res.success) {
      setEditingError(res.error || "Không thể đổi tên thẻ đánh dấu.");
      return;
    }

    setEditingBookmarkId(null);
    setEditingName("");
    setEditingError(null);
    refreshBookmarks();
  };

  // Xử lý Xóa Bookmark (Delete)
  const handleDelete = (bookmarkId: string) => {
    if (!editor) return;
    const res = BookmarkService.removeBookmark(editor, bookmarkId);
    if (res.success) {
      if (selectedBookmarkId === bookmarkId) {
        setSelectedBookmarkId(null);
      }
      if (editingBookmarkId === bookmarkId) {
        setEditingBookmarkId(null);
      }
      refreshBookmarks();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookmark-manager-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        className="dialog-content"
        style={{
          backgroundColor: "var(--color-bg-primary, #ffffff)",
          color: "var(--color-text-primary, #111827)",
          borderRadius: "10px",
          width: "560px",
          maxWidth: "94vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
          border: "1px solid var(--color-border, #e5e7eb)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border, #e5e7eb)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: "#e0e7ff",
                color: "#4f46e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BookmarkIcon size={18} />
            </div>
            <div>
              <h2
                id="bookmark-manager-title"
                style={{ fontSize: 16, fontWeight: 600, margin: 0, lineHeight: 1.2 }}
              >
                Thẻ đánh dấu (Bookmarks)
              </h2>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                Ghim vị trí và nhảy nhanh trong tài liệu
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Đóng"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Container */}
        <div
          style={{
            padding: "16px 20px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            flex: 1,
          }}
        >
          {/* Section 1: Thêm Bookmark mới */}
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              backgroundColor: "var(--color-bg-secondary, #f8fafc)",
              border: "1px solid var(--color-border, #e2e8f0)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <label
                htmlFor="bookmark-name-input"
                style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase" }}
              >
                Tên thẻ đánh dấu mới
              </label>

              {/* Selection context badge */}
              {savedSelection && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 12,
                    backgroundColor: savedSelection.empty ? "#e2e8f0" : "#dbeafe",
                    color: savedSelection.empty ? "#475569" : "#1d4ed8",
                    fontWeight: 500,
                  }}
                  title={
                    savedSelection.empty
                      ? "Neo tại vị trí con trỏ hiện tại"
                      : `Bao trùm vùng chọn: "${savedSelection.text}"`
                  }
                >
                  {savedSelection.empty ? (
                    <>
                      <MapPin size={11} />
                      <span>Vị trí con trỏ</span>
                    </>
                  ) : (
                    <>
                      <FileText size={11} />
                      <span>
                        Vùng chọn ({savedSelection.to - savedSelection.from} ký tự)
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <form
              onSubmit={handleAddBookmark}
              style={{ display: "flex", gap: 8, alignItems: "stretch" }}
            >
              <input
                id="bookmark-name-input"
                ref={inputRef}
                type="text"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="Nhập tên thẻ đánh dấu..."
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: validationError ? "1px solid #ef4444" : "1px solid #cbd5e1",
                  fontSize: 13,
                  outline: "none",
                  backgroundColor: "var(--color-bg-primary, #ffffff)",
                  color: "inherit",
                }}
              />
              <button
                type="submit"
                disabled={!nameInput.trim()}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: nameInput.trim() ? "#4f46e5" : "#94a3b8",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: nameInput.trim() ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={15} />
                Thêm
              </button>
            </form>

            {validationError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#ef4444",
                  fontSize: 12,
                  marginTop: 6,
                }}
              >
                <AlertCircle size={13} />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          {/* Section 2: Tìm kiếm & Sắp xếp */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                flex: 1,
                position: "relative",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Search
                size={14}
                style={{ position: "absolute", left: 10, color: "#94a3b8" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm thẻ đánh dấu theo tên..."
                style={{
                  width: "100%",
                  padding: "6px 10px 6px 30px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 12,
                  outline: "none",
                  backgroundColor: "var(--color-bg-primary, #ffffff)",
                  color: "inherit",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "#94a3b8",
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSortBy(sortBy === "docOrder" ? "name" : "docOrder")}
              title={
                sortBy === "docOrder"
                  ? "Đang xếp theo Vị trí trong bài. Bấm để xếp theo Tên (A-Z)."
                  : "Đang xếp theo Tên (A-Z). Bấm để xếp theo Vị trí trong bài."
              }
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                backgroundColor: "var(--color-bg-primary, #ffffff)",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "#475569",
              }}
            >
              <ArrowUpDown size={12} />
              <span>{sortBy === "docOrder" ? "Theo vị trí" : "Tên (A-Z)"}</span>
            </button>
          </div>

          {/* Section 3: Danh sách Bookmarks */}
          <div
            style={{
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: 8,
              minHeight: 180,
              maxHeight: 280,
              overflowY: "auto",
              backgroundColor: "var(--color-bg-primary, #ffffff)",
            }}
          >
            {filteredBookmarks.length === 0 ? (
              <div
                style={{
                  padding: "36px 16px",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: 13,
                }}
              >
                {searchQuery ? (
                  <span>Không tìm thấy thẻ đánh dấu nào khớp với "{searchQuery}".</span>
                ) : (
                  <span>Chưa có thẻ đánh dấu nào trong tài liệu. Hãy nhập tên ở trên và bấm "Thêm".</span>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {filteredBookmarks.map((item, idx) => {
                  const isSelected = selectedBookmarkId === item.bookmark.id;
                  const isEditing = editingBookmarkId === item.bookmark.id;

                  return (
                    <div
                      key={item.bookmark.id}
                      onClick={() => setSelectedBookmarkId(item.bookmark.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderBottom:
                          idx < filteredBookmarks.length - 1
                            ? "1px solid var(--color-border, #f1f5f9)"
                            : "none",
                        backgroundColor: isSelected ? "#eef2ff" : "transparent",
                        transition: "background-color 0.15s ease",
                      }}
                    >
                      {/* Cột trái: Tên & thông tin */}
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRename(item.bookmark.id);
                                  if (e.key === "Escape") setEditingBookmarkId(null);
                                }}
                                autoFocus
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 12,
                                  borderRadius: 4,
                                  border: "1px solid #4f46e5",
                                  outline: "none",
                                  flex: 1,
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveRename(item.bookmark.id)}
                                title="Lưu tên"
                                style={{
                                  border: "none",
                                  background: "#4f46e5",
                                  color: "#ffffff",
                                  padding: 4,
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                <Check size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBookmarkId(null)}
                                title="Hủy"
                                style={{
                                  border: "none",
                                  background: "#94a3b8",
                                  color: "#ffffff",
                                  padding: 4,
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                <X size={13} />
                              </button>
                            </div>
                            {editingError && (
                              <span style={{ fontSize: 11, color: "#ef4444" }}>
                                {editingError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: isSelected ? "#312e81" : "inherit",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.bookmark.name}
                            </span>

                            {/* Badge loại bookmark */}
                            <span
                              style={{
                                fontSize: 10,
                                padding: "1px 6px",
                                borderRadius: 10,
                                backgroundColor:
                                  item.type === "range" ? "#e0e7ff" : "#f1f5f9",
                                color: item.type === "range" ? "#4338ca" : "#64748b",
                                fontWeight: 500,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.type === "range" ? "Đoạn văn" : "Vị trí"}
                            </span>

                            {/* Text snippet nếu là range bookmark */}
                            {item.type === "range" && item.text && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  fontStyle: "italic",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 160,
                                }}
                                title={`Trích dẫn: "${item.text}"`}
                              >
                                "{item.text}"
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Cột phải: Thao tác (Go To, Rename, Delete) */}
                      {!isEditing && (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGoTo(item.bookmark.id);
                            }}
                            title="Nhảy đến vị trí thẻ đánh dấu (Go To)"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 8px",
                              fontSize: 11,
                              borderRadius: 4,
                              border: "1px solid #cbd5e1",
                              backgroundColor: "var(--color-bg-primary, #ffffff)",
                              color: "#334155",
                              cursor: "pointer",
                            }}
                          >
                            <Compass size={12} />
                            <span>Đến</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRename(item);
                            }}
                            title="Đổi tên thẻ đánh dấu"
                            style={{
                              padding: "4px 6px",
                              fontSize: 11,
                              borderRadius: 4,
                              border: "1px solid #cbd5e1",
                              backgroundColor: "var(--color-bg-primary, #ffffff)",
                              color: "#475569",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Edit2 size={12} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.bookmark.id);
                            }}
                            title="Xóa thẻ đánh dấu (Văn bản vẫn được giữ nguyên)"
                            style={{
                              padding: "4px 6px",
                              fontSize: 11,
                              borderRadius: 4,
                              border: "1px solid #fecaca",
                              backgroundColor: "#fff1f2",
                              color: "#e11d48",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderTop: "1px solid var(--color-border, #e5e7eb)",
            backgroundColor: "var(--color-bg-secondary, #f8fafc)",
          }}
        >
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Tổng cộng: {bookmarks.length} thẻ đánh dấu
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              backgroundColor: "var(--color-bg-primary, #ffffff)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              color: "#334155",
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
