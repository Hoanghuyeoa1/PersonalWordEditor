import { useState, useMemo, useEffect } from "react";
import {
  X,
  Plus,
  Search,
  Settings,
  Edit2,
  Copy,
  Trash2,
  Check,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import { useDocumentStore } from "../../stores/documentStore.ts";
import {
  deleteStyle,
  duplicateStyle,
  getStyleUsage,
} from "../../styles/services/styleManagementService.ts";
import {
  applyParagraphStyle,
} from "../../styles/services/applyStyleService.ts";
import {
  applyCharacterStyle,
} from "../../styles/services/characterStyleService.ts";
import { isBuiltInStyleId } from "../../styles/services/builtInStyles.ts";

export interface ManageStylesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
  onOpenCreateStyle: () => void;
  onOpenModifyStyle: (styleId: string) => void;
}

export function ManageStylesDialog({
  isOpen,
  onClose,
  editor,
  onOpenCreateStyle,
  onOpenModifyStyle,
}: ManageStylesDialogProps) {
  const definitions = useDocumentStore(
    (state) => state.document.styles?.definitions ?? []
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setDeleteConfirmId(null);
    }
  }, [isOpen]);

  // Đóng modal khi nhấn Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filteredStyles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return definitions;
    return definitions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q)
    );
  }, [definitions, searchQuery]);

  if (!isOpen) return null;

  const handleApply = (styleId: string, type: "paragraph" | "character") => {
    if (!editor) return;
    if (type === "paragraph") {
      applyParagraphStyle(editor, styleId);
    } else {
      applyCharacterStyle(editor, styleId);
    }
    onClose();
  };

  const handleDuplicate = (styleId: string) => {
    duplicateStyle(styleId, undefined, editor);
  };

  const handleDelete = (styleId: string) => {
    deleteStyle(styleId, {}, editor);
    setDeleteConfirmId(null);
  };

  return (
    <div
      className="custom-margins-backdrop"
      style={{ zIndex: 1200 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="custom-margins-dialog"
        style={{ maxWidth: "680px", width: "95%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-styles-title"
      >
        <div className="custom-margins-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Settings size={18} className="text-blue-600" />
            <h3 id="manage-styles-title" style={{ fontSize: "15px", fontWeight: 600 }}>
              Quản lý Style trong tài liệu (Manage Styles)
            </h3>
          </div>
          <button
            type="button"
            className="custom-margins-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "#fff", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 8px", width: "260px" }}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Tìm kiếm style..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: "none", outline: "none", fontSize: "12px", width: "100%" }}
            />
          </div>

          <button
            type="button"
            className="confirm-btn confirm-btn-primary"
            style={{ padding: "6px 12px", fontSize: "12px" }}
            onClick={() => {
              onClose();
              onOpenCreateStyle();
            }}
          >
            <Plus size={14} />
            <span>Tạo Style mới</span>
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px" }}>
          {filteredStyles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#64748b", fontSize: "13px" }}>
              Không tìm thấy Style nào phù hợp.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredStyles.map((style) => {
                const isBuiltIn = isBuiltInStyleId(style.id) || style.isBuiltIn;
                const usage = getStyleUsage(style.id, editor);
                const isConfirmingDelete = deleteConfirmId === style.id;

                return (
                  <div
                    key={style.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#fff",
                      transition: "background 0.1s ease",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, fontSize: "13px", color: "#1e293b" }}>
                          {style.name}
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 6px",
                            borderRadius: "10px",
                            background: style.type === "paragraph" ? "#e0f2fe" : "#fef3c7",
                            color: style.type === "paragraph" ? "#0369a1" : "#b45309",
                            fontWeight: 500,
                          }}
                        >
                          {style.type === "paragraph" ? "¶ Paragraph" : "a Character"}
                        </span>
                        {isBuiltIn && (
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              borderRadius: "10px",
                              background: "#f1f5f9",
                              color: "#64748b",
                            }}
                          >
                            Built-in
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                        {style.basedOn ? `Kế thừa: ${style.basedOn}` : "Style gốc (Root)"} •{" "}
                        {usage.totalUsage > 0
                          ? `Đang sử dụng trong ${style.type === "paragraph" ? `${usage.blockCount} đoạn văn` : `${usage.runCount} cụm từ`}`
                          : "Chưa sử dụng"}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {/* Nút Áp dụng */}
                      <button
                        type="button"
                        className="confirm-btn"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => handleApply(style.id, style.type)}
                        title="Áp dụng style này vào văn bản hiện tại"
                      >
                        <Check size={12} />
                        <span>Áp dụng</span>
                      </button>

                      {/* Nút Chỉnh sửa */}
                      <button
                        type="button"
                        className="confirm-btn"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => {
                          onClose();
                          onOpenModifyStyle(style.id);
                        }}
                        title="Chỉnh sửa thuộc tính style"
                      >
                        <Edit2 size={12} />
                        <span>Sửa</span>
                      </button>

                      {/* Nút Sao chép */}
                      <button
                        type="button"
                        className="confirm-btn"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => handleDuplicate(style.id)}
                        title="Tạo bản sao của style này"
                      >
                        <Copy size={12} />
                        <span>Sao chép</span>
                      </button>

                      {/* Nút Xóa (bị vô hiệu hóa cho Built-in) */}
                      {!isBuiltIn && (
                        <>
                          {isConfirmingDelete ? (
                            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                              <button
                                type="button"
                                style={{
                                  background: "#dc2626",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "4px",
                                  padding: "4px 8px",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                }}
                                onClick={() => handleDelete(style.id)}
                              >
                                Xác nhận xóa
                              </button>
                              <button
                                type="button"
                                style={{
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "4px",
                                  padding: "4px 6px",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                }}
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="confirm-btn"
                              style={{ padding: "4px 8px", fontSize: "11px", color: "#dc2626" }}
                              onClick={() => setDeleteConfirmId(style.id)}
                              title="Xóa style khỏi tài liệu"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="custom-margins-actions" style={{ padding: "10px 16px", background: "#f8fafc" }}>
          <button
            type="button"
            className="confirm-btn confirm-btn-cancel"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
