import React, { useRef, useEffect } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  X,
  Hash,
  Link2,
  Unlink,
} from "lucide-react";
import type {
  HeaderFooterItem,
} from "../types/headerFooterTypes.ts";

export interface HeaderFooterEditorProps {
  zone: "header" | "footer";
  sectionIndex: number;
  pageNumber: number;
  pageCount: number;
  item: HeaderFooterItem;
  isLinked: boolean;
  canLinkToPrevious: boolean;
  onUpdateItem: (partial: Partial<HeaderFooterItem>) => void;
  onToggleLink: () => void;
  onClose: () => void;
}

/**
 * HeaderFooterEditor: Trình chỉnh sửa Header / Footer trực quan ngay trên trang giấy vật lý.
 * - Cho phép nhập văn bản và định dạng căn lề (Left, Center, Right), Bold, Italic.
 * - Chèn số trang semantic {PAGE} và tổng số trang {NUMPAGES}.
 * - Bật/tắt liên kết với section trước (Link to Previous).
 * - Phân định ranh giới rõ ràng bằng đường kẻ viền và huy hiệu trạng thái.
 */
export function HeaderFooterEditor({
  zone,
  sectionIndex,
  pageNumber,
  pageCount,
  item,
  isLinked,
  canLinkToPrevious,
  onUpdateItem,
  onToggleLink,
  onClose,
}: HeaderFooterEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Tự động focus vào ô nhập văn bản khi mở chế độ chỉnh sửa
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [zone]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleInsertPageNumberToken = (e: React.MouseEvent) => {
    e.preventDefault();
    const current = item.text || "";
    if (current.includes("{PAGE}")) return;
    const nextText = current ? `${current} {PAGE}` : "{PAGE}";
    onUpdateItem({ text: nextText });
  };

  const handleInsertPageCountToken = (e: React.MouseEvent) => {
    e.preventDefault();
    const current = item.text || "";
    if (current.includes("{NUMPAGES}")) return;
    const nextText = current ? `${current} / {NUMPAGES}` : "{NUMPAGES}";
    onUpdateItem({ text: nextText });
  };

  const zoneLabel = zone === "header" ? "Header" : "Footer";

  return (
    <div
      className={`header-footer-active-box zone-${zone}`}
      role="region"
      aria-label={`Chỉnh sửa ${zoneLabel} - Section ${sectionIndex}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Thanh công cụ điều khiển Header/Footer */}
      <div className="header-footer-toolbar" aria-label={`Thanh công cụ ${zoneLabel}`}>
        <div className="header-footer-toolbar-left">
          <span className="header-footer-badge">
            {zoneLabel} — Mục {sectionIndex} (Trang {pageNumber}/{pageCount})
          </span>

          {canLinkToPrevious && (
            <button
              type="button"
              className={`header-footer-btn btn-link ${isLinked ? "is-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                onToggleLink();
              }}
              title={
                isLinked
                  ? "Đang liên kết với mục trước. Nhấn để ngắt liên kết và tùy biến riêng."
                  : "Đã ngắt liên kết. Nhấn để kế thừa lại từ mục trước."
              }
            >
              {isLinked ? <Link2 size={13} /> : <Unlink size={13} />}
              <span>{isLinked ? "Đã liên kết mục trước" : "Tùy biến riêng"}</span>
            </button>
          )}
        </div>

        <div className="header-footer-toolbar-right">
          {/* Nhóm căn lề */}
          <div className="header-footer-btn-group" role="group" aria-label="Căn lề">
            <button
              type="button"
              className={`header-footer-btn ${item.alignment === "left" ? "is-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                onUpdateItem({ alignment: "left" });
              }}
              title="Căn trái"
              aria-label="Căn trái"
            >
              <AlignLeft size={13} />
            </button>
            <button
              type="button"
              className={`header-footer-btn ${item.alignment === "center" ? "is-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                onUpdateItem({ alignment: "center" });
              }}
              title="Căn giữa"
              aria-label="Căn giữa"
            >
              <AlignCenter size={13} />
            </button>
            <button
              type="button"
              className={`header-footer-btn ${item.alignment === "right" ? "is-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                onUpdateItem({ alignment: "right" });
              }}
              title="Căn phải"
              aria-label="Căn phải"
            >
              <AlignRight size={13} />
            </button>
          </div>

          {/* Nhóm định dạng kiểu chữ */}
          <div className="header-footer-btn-group" role="group" aria-label="Định dạng">
            <button
              type="button"
              className={`header-footer-btn ${item.bold ? "is-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                onUpdateItem({ bold: !item.bold });
              }}
              title="In đậm"
              aria-label="In đậm"
            >
              <Bold size={13} />
            </button>
            <button
              type="button"
              className={`header-footer-btn ${item.italic ? "is-active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                onUpdateItem({ italic: !item.italic });
              }}
              title="In nghiêng"
              aria-label="In nghiêng"
            >
              <Italic size={13} />
            </button>
          </div>

          {/* Chèn số trang token */}
          <button
            type="button"
            className="header-footer-btn btn-insert-token"
            onClick={handleInsertPageNumberToken}
            title="Chèn trường số trang động ({PAGE})"
          >
            <Hash size={13} />
            <span>+ Số trang</span>
          </button>

          {/* Chèn tổng số trang token */}
          <button
            type="button"
            className="header-footer-btn btn-insert-token"
            onClick={handleInsertPageCountToken}
            title="Chèn trường tổng số trang động ({NUMPAGES})"
          >
            <Hash size={13} />
            <span>+ Tổng trang</span>
          </button>

          {/* Nút đóng */}
          <button
            type="button"
            className="header-footer-btn btn-close"
            onClick={(e) => {
              e.preventDefault();
              onClose();
            }}
            title="Đóng Header & Footer (hoặc nhấn Esc)"
            aria-label="Đóng Header và Footer"
          >
            <X size={13} />
            <span>Đóng (Esc)</span>
          </button>
        </div>
      </div>

      {/* Ô nhập nội dung văn bản trực tiếp */}
      <div className="header-footer-input-row">
        <input
          ref={inputRef}
          type="text"
          className="header-footer-input"
          value={item.text}
          onChange={(e) => onUpdateItem({ text: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder={`Nhập nội dung ${zoneLabel} (hỗ trợ {PAGE} và {NUMPAGES})...`}
          style={{
            textAlign: item.alignment,
            fontWeight: item.bold ? 700 : 400,
            fontStyle: item.italic ? "italic" : "normal",
          }}
        />
      </div>

      {/* Ranh giới phân cách trực quan giữa Header/Footer và trang giấy */}
      <div className="header-footer-separator" aria-hidden="true" />
    </div>
  );
}

export default HeaderFooterEditor;
