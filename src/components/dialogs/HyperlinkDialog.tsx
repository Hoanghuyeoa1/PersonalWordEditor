import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link2, AlertCircle, X, Check, Trash2 } from "lucide-react";
import { validateAndNormalizeUrl } from "../../insert/services/linkService.ts";

export interface HyperlinkDialogProps {
  /** Trạng thái hiển thị modal */
  isOpen: boolean;
  /** Văn bản ban đầu (nếu có selection hoặc link hiện tại) */
  initialText?: string;
  /** Địa chỉ URL ban đầu (nếu đang chỉnh sửa link hiện có) */
  initialUrl?: string;
  /** Cho biết đang chỉnh sửa link đã tồn tại */
  isEditing?: boolean;
  /** Callback đóng modal */
  onClose: () => void;
  /** Callback áp dụng chèn/cập nhật link */
  onApply: (text: string, url: string) => void;
  /** Callback xóa link */
  onRemove?: () => void;
}

export function HyperlinkDialog({
  isOpen,
  initialText = "",
  initialUrl = "",
  isEditing = false,
  onClose,
  onApply,
  onRemove,
}: HyperlinkDialogProps) {
  const [displayText, setDisplayText] = useState("");
  const [address, setAddress] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addressInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayText(initialText);
      setAddress(initialUrl);
      setErrorMessage(null);

      // Auto focus: Nếu đã có displayText thì focus vào Address; ngược lại focus vào Text
      setTimeout(() => {
        if (initialText && addressInputRef.current) {
          addressInputRef.current.focus();
          addressInputRef.current.select();
        } else if (textInputRef.current) {
          textInputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen, initialText, initialUrl]);

  // Đóng bằng Escape
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

  if (!isOpen) return null;

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setErrorMessage("Vui lòng nhập địa chỉ liên kết (URL).");
      addressInputRef.current?.focus();
      return;
    }

    const valResult = validateAndNormalizeUrl(trimmedAddress);
    if (!valResult.isValid) {
      setErrorMessage(valResult.error || "Địa chỉ URL không hợp lệ.");
      addressInputRef.current?.focus();
      return;
    }

    // Nếu Text to display trống, dùng chính normalized URL làm text
    const finalText = displayText.trim() || valResult.normalizedUrl;

    setErrorMessage(null);
    onApply(finalText, valResult.normalizedUrl);
    onClose();
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
    }
    onClose();
  };

  return (
    <div
      className="custom-margins-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hyperlink-dialog-title"
      onClick={onClose}
    >
      <div
        className="custom-margins-card hyperlink-dialog"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="custom-margins-header">
          <div className="custom-margins-header-icon">
            <Link2 size={20} color="#1d4ed8" aria-hidden="true" />
          </div>
          <div className="custom-margins-header-text">
            <h2 id="hyperlink-dialog-title">
              {isEditing ? "Chỉnh sửa siêu liên kết" : "Chèn siêu liên kết (Hyperlink)"}
            </h2>
            <span className="custom-margins-subtitle">
              Tiptap / ProseMirror Semantic Link Mark
            </span>
          </div>
          <button
            type="button"
            className="custom-margins-close-btn"
            onClick={onClose}
            title="Đóng hộp thoại (Escape)"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="custom-margins-form">
          <div className="custom-margins-body">
            {errorMessage && (
              <div className="custom-margins-error-alert" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Field: Text to display */}
            <div className="custom-margins-field">
              <label htmlFor="link-display-text">
                Văn bản hiển thị (Text to display):
              </label>
              <div className="custom-margins-input-wrap">
                <input
                  id="link-display-text"
                  ref={textInputRef}
                  type="text"
                  value={displayText}
                  onChange={(e) => {
                    setDisplayText(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Ví dụ: Trang chủ Google..."
                />
              </div>
            </div>

            {/* Field: Address */}
            <div className="custom-margins-field">
              <label htmlFor="link-address">
                Địa chỉ liên kết (Address / URL):
              </label>
              <div className="custom-margins-input-wrap">
                <input
                  id="link-address"
                  ref={addressInputRef}
                  type="text"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="https://example.com hoặc mailto:name@example.com"
                />
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                Hỗ trợ <code>https://</code>, <code>http://</code>, và <code>mailto:</code>
              </span>
            </div>
          </div>

          <div className="custom-margins-actions" style={{ justifyContent: "space-between" }}>
            <div>
              {isEditing && (
                <button
                  type="button"
                  className="confirm-btn"
                  style={{
                    color: "#dc2626",
                    borderColor: "#fecaca",
                    background: "#fef2f2",
                  }}
                  onClick={handleRemove}
                  title="Xóa liên kết khỏi văn bản"
                >
                  <Trash2 size={15} />
                  <span>Xóa liên kết</span>
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="confirm-btn confirm-btn-cancel"
                onClick={onClose}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="confirm-btn confirm-btn-save"
              >
                <Check size={16} />
                <span>{isEditing ? "Cập nhật" : "Chèn"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default HyperlinkDialog;
