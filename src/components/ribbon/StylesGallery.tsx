import { useState, useRef, useEffect, useMemo } from "react";
import {
  ChevronDown,
  Plus,
  Settings,
  MoreVertical,
  Check,
  RefreshCw,
  Edit2,
  Copy,
  Trash2,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import { useDocumentStore } from "../../stores/documentStore.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
  isBuiltInStyleId,
} from "../../styles/services/builtInStyles.ts";
import {
  applyParagraphStyle,
} from "../../styles/services/applyStyleService.ts";
import {
  applyCharacterStyle,
} from "../../styles/services/characterStyleService.ts";
import {
  updateStyleFromSelection,
  duplicateStyle,
  deleteStyle,
} from "../../styles/services/styleManagementService.ts";
import { getActiveStyleState } from "../../styles/services/effectiveStyleService.ts";
import type { DocumentStyle } from "../../styles/types/styleTypes.ts";

export interface StylesGalleryProps {
  editor: Editor | null;
  onOpenCreateStyle: () => void;
  onOpenModifyStyle: (styleId: string) => void;
  onOpenManageStyles: () => void;
}

export function StylesGallery({
  editor,
  onOpenCreateStyle,
  onOpenModifyStyle,
  onOpenManageStyles,
}: StylesGalleryProps) {
  const definitions = useDocumentStore(
    (state) => state.document.styles?.definitions ?? []
  );

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [contextStyleId, setContextStyleId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Đóng popups khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(target)) {
        setContextStyleId(null);
        setContextMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Tính trạng thái Active / Mixed styles hiện tại của selection
  const activeState = useMemo(() => {
    return getActiveStyleState(editor);
  }, [editor, editor?.state?.selection]);

  // Phân bổ styles cho Gallery chính:
  // Ưu tiên: Normal, Heading 1, Heading 2, Heading 3 + 1-2 custom/character styles (tối đa 5-6 cards)
  const visibleStyles = useMemo(() => {
    const priorityIds = [
      STYLE_NORMAL_ID,
      STYLE_HEADING_1_ID,
      STYLE_HEADING_2_ID,
      STYLE_HEADING_3_ID,
    ];

    const primary: DocumentStyle[] = [];
    const others: DocumentStyle[] = [];

    // Nhặt 4 priority styles trước
    for (const pid of priorityIds) {
      const found = definitions.find((s) => s.id === pid);
      if (found) primary.push(found);
    }

    // Nhặt các styles còn lại
    for (const s of definitions) {
      if (!priorityIds.includes(s.id as any)) {
        others.push(s);
      }
    }

    // Hiển thị tối đa 5 cards trên Ribbon gallery để tránh vỡ thanh công cụ
    const maxVisible = 5;
    const additionalCount = Math.max(0, maxVisible - primary.length);
    return [...primary, ...others.slice(0, additionalCount)];
  }, [definitions]);

  const handleApplyStyle = (style: DocumentStyle) => {
    if (!editor) return;
    if (style.type === "paragraph") {
      applyParagraphStyle(editor, style.id);
    } else {
      applyCharacterStyle(editor, style.id);
    }
  };

  const handleOpenContextMenu = (e: React.MouseEvent, styleId: string) => {
    e.preventDefault();
    setContextStyleId(styleId);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const selectedContextStyle = useMemo(() => {
    return definitions.find((s) => s.id === contextStyleId) ?? null;
  }, [definitions, contextStyleId]);

  return (
    <div className="ribbon-group styles-group" aria-label="Styles" style={{ position: "relative" }}>
      <div className="ribbon-group-controls styles-gallery" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {/* Render visible style cards */}
        {visibleStyles.map((style) => {
          const isActive =
            style.type === "paragraph"
              ? !activeState.isParagraphMixed && activeState.paragraphStyleId === style.id
              : !activeState.isCharacterMixed && activeState.characterStyleId === style.id;

          const c = style.character || {};
          const fontSizePreview = c.fontSize ? Math.min(13, Math.max(10, Number(c.fontSize))) : 12;

          return (
            <div
              key={style.id}
              style={{ position: "relative" }}
              onContextMenu={(e) => handleOpenContextMenu(e, style.id)}
            >
              <button
                type="button"
                className={`style-card ${isActive ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => handleApplyStyle(style)}
                title={`${style.name} (${style.type === "paragraph" ? "Paragraph Style" : "Character Style"}) - Click để áp dụng, chuột phải để tùy chọn`}
                style={{ position: "relative" }}
              >
                <span
                  className="style-card-sample"
                  style={{
                    fontFamily: c.fontFamily || "Calibri",
                    fontSize: `${fontSizePreview}px`,
                    fontWeight: c.bold ? "bold" : 500,
                    fontStyle: c.italic ? "italic" : "normal",
                    color: c.color || "#334155",
                    textDecoration: c.underline ? "underline" : c.strike ? "line-through" : "none",
                  }}
                >
                  AaBb
                </span>
                <span
                  className="style-card-name"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "58px",
                  }}
                >
                  {style.name}
                </span>

                {/* Nút hành động nhanh menu */}
                <button
                  type="button"
                  onMouseDown={preventBlur}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenContextMenu(e, style.id);
                  }}
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "1px",
                    opacity: 0.35,
                    borderRadius: "2px",
                  }}
                  className="style-card-more-btn"
                  title="Tùy chọn style"
                >
                  <MoreVertical size={11} />
                </button>
              </button>
            </div>
          );
        })}

        {/* Nút More / Manage Styles */}
        <div className="popover-anchor" ref={moreMenuRef}>
          <button
            type="button"
            className="style-card"
            style={{ width: "32px", minWidth: "32px", padding: "4px" }}
            onMouseDown={preventBlur}
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title="Xem thêm styles và quản lý"
            aria-expanded={showMoreMenu}
          >
            <ChevronDown size={14} color="#64748b" />
          </button>

          {showMoreMenu && (
            <div
              className="ribbon-dropdown-menu"
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                width: "240px",
                maxHeight: "320px",
                overflowY: "auto",
                zIndex: 1100,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                borderRadius: "6px",
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                padding: "4px 0",
              }}
              role="menu"
            >
              <div style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>
                Styles trong tài liệu
              </div>

              {definitions.map((s) => {
                const isActive =
                  s.type === "paragraph"
                    ? !activeState.isParagraphMixed && activeState.paragraphStyleId === s.id
                    : !activeState.isCharacterMixed && activeState.characterStyleId === s.id;

                return (
                  <button
                    key={s.id}
                    type="button"
                    className="line-spacing-item"
                    onMouseDown={preventBlur}
                    onClick={() => {
                      handleApplyStyle(s);
                      setShowMoreMenu(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 12px",
                      width: "100%",
                      fontSize: "12px",
                      background: isActive ? "#eff6ff" : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontWeight: isActive ? 600 : 400, color: isActive ? "#1d4ed8" : "#334155" }}>
                        {s.name}
                      </span>
                      <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                        ({s.type === "paragraph" ? "¶" : "a"})
                      </span>
                    </div>
                    {isActive && <Check size={14} color="#1d4ed8" />}
                  </button>
                );
              })}

              <div style={{ height: "1px", background: "#e2e8f0", margin: "4px 0" }} />

              <button
                type="button"
                className="line-spacing-item"
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenCreateStyle();
                }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", width: "100%", fontSize: "12px", color: "#2563eb" }}
              >
                <Plus size={14} />
                <span>Tạo Style mới...</span>
              </button>

              <button
                type="button"
                className="line-spacing-item"
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowMoreMenu(false);
                  onOpenManageStyles();
                }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", width: "100%", fontSize: "12px", color: "#475569" }}
              >
                <Settings size={14} />
                <span>Quản lý Styles...</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="ribbon-group-label">Styles</div>

      {/* Context Action Menu khi click phải hoặc bấm nút '...' trên Style card */}
      {selectedContextStyle && contextMenuPos && (
        <div
          ref={contextMenuRef}
          style={{
            position: "fixed",
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
            zIndex: 1300,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
            padding: "4px 0",
            minWidth: "210px",
          }}
        >
          <div style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, color: "#64748b", borderBottom: "1px solid #f1f5f9" }}>
            Tùy chọn: {selectedContextStyle.name}
          </div>

          <button
            type="button"
            className="line-spacing-item"
            onMouseDown={preventBlur}
            onClick={() => {
              handleApplyStyle(selectedContextStyle);
              setContextStyleId(null);
            }}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", width: "100%", fontSize: "12px" }}
          >
            <Check size={14} />
            <span>Áp dụng</span>
          </button>

          <button
            type="button"
            className="line-spacing-item"
            onMouseDown={preventBlur}
            onClick={() => {
              updateStyleFromSelection(selectedContextStyle.id, editor);
              setContextStyleId(null);
            }}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", width: "100%", fontSize: "12px", color: "#0369a1" }}
            title="Lấy toàn bộ định dạng đang chọn gán vào style này"
          >
            <RefreshCw size={14} />
            <span>Cập nhật theo vùng chọn</span>
          </button>

          <button
            type="button"
            className="line-spacing-item"
            onMouseDown={preventBlur}
            onClick={() => {
              setContextStyleId(null);
              onOpenModifyStyle(selectedContextStyle.id);
            }}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", width: "100%", fontSize: "12px" }}
          >
            <Edit2 size={14} />
            <span>Chỉnh sửa...</span>
          </button>

          <button
            type="button"
            className="line-spacing-item"
            onMouseDown={preventBlur}
            onClick={() => {
              duplicateStyle(selectedContextStyle.id, undefined, editor);
              setContextStyleId(null);
            }}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", width: "100%", fontSize: "12px" }}
          >
            <Copy size={14} />
            <span>Nhân bản (Duplicate)</span>
          </button>

          {!isBuiltInStyleId(selectedContextStyle.id) && !selectedContextStyle.isBuiltIn && (
            <>
              <div style={{ height: "1px", background: "#f1f5f9", margin: "4px 0" }} />
              <button
                type="button"
                className="line-spacing-item"
                onMouseDown={preventBlur}
                onClick={() => {
                  deleteStyle(selectedContextStyle.id, {}, editor);
                  setContextStyleId(null);
                }}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", width: "100%", fontSize: "12px", color: "#dc2626" }}
              >
                <Trash2 size={14} />
                <span>Xóa Style</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
