import { useState, useEffect, useRef, type FormEvent } from "react";
import { Table, AlertCircle, X, Check } from "lucide-react";
import {
  TABLE_LIMITS,
  validateTableDimensions,
} from "../../editor/editorCommands.ts";

export interface TableInsertDialogProps {
  /** Trạng thái mở modal */
  isOpen: boolean;
  /** Callback đóng modal */
  onClose: () => void;
  /** Callback khi người dùng xác nhận chèn bảng */
  onApply: (rows: number, cols: number, withHeaderRow: boolean) => void;
}

/**
 * Hộp thoại tùy chỉnh chèn bảng (Insert Table Dialog)
 * Tuân thủ hệ thống thiết kế chuẩn của ứng dụng.
 */
export function TableInsertDialog({
  isOpen,
  onClose,
  onApply,
}: TableInsertDialogProps) {
  const [rows, setRows] = useState<number>(TABLE_LIMITS.DEFAULT_ROWS);
  const [cols, setCols] = useState<number>(TABLE_LIMITS.DEFAULT_COLS);
  const [withHeaderRow, setWithHeaderRow] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const rowsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setRows(TABLE_LIMITS.DEFAULT_ROWS);
      setCols(TABLE_LIMITS.DEFAULT_COLS);
      setWithHeaderRow(true);
      setErrorMessage(null);

      setTimeout(() => {
        rowsInputRef.current?.focus();
        rowsInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

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

    const val = validateTableDimensions(rows, cols);
    if (!val.isValid) {
      setErrorMessage(val.error || "Kích thước bảng không hợp lệ.");
      return;
    }

    setErrorMessage(null);
    onApply(val.sanitizedRows, val.sanitizedCols, withHeaderRow);
    onClose();
  };

  return (
    <div
      className="custom-margins-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-dialog-title"
      onClick={onClose}
    >
      <div
        className="custom-margins-card table-dialog"
        role="document"
        style={{ maxWidth: "440px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="custom-margins-header">
          <div className="custom-margins-header-icon">
            <Table size={20} color="#1d4ed8" aria-hidden="true" />
          </div>
          <div className="custom-margins-header-text">
            <h2 id="table-dialog-title">Chèn Bảng (Insert Table)</h2>
            <span className="custom-margins-subtitle">
              Cấu trúc bảng semantic ProseMirror · Kích thước tối đa 50 × 20
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

            {/* Field: Số hàng */}
            <div className="custom-margins-field">
              <label htmlFor="table-rows">
                Số hàng (Rows):
              </label>
              <div className="custom-margins-input-wrap">
                <input
                  id="table-rows"
                  ref={rowsInputRef}
                  type="number"
                  min={TABLE_LIMITS.MIN_ROWS}
                  max={TABLE_LIMITS.MAX_ROWS}
                  value={rows}
                  onChange={(e) => {
                    setRows(parseInt(e.target.value, 10));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  required
                />
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                Giới hạn từ {TABLE_LIMITS.MIN_ROWS} đến {TABLE_LIMITS.MAX_ROWS} hàng
              </span>
            </div>

            {/* Field: Số cột */}
            <div className="custom-margins-field">
              <label htmlFor="table-cols">
                Số cột (Columns):
              </label>
              <div className="custom-margins-input-wrap">
                <input
                  id="table-cols"
                  type="number"
                  min={TABLE_LIMITS.MIN_COLS}
                  max={TABLE_LIMITS.MAX_COLS}
                  value={cols}
                  onChange={(e) => {
                    setCols(parseInt(e.target.value, 10));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  required
                />
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                Giới hạn từ {TABLE_LIMITS.MIN_COLS} đến {TABLE_LIMITS.MAX_COLS} cột
              </span>
            </div>

            {/* Option: Dòng tiêu đề */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <input
                id="table-with-header"
                type="checkbox"
                checked={withHeaderRow}
                onChange={(e) => setWithHeaderRow(e.target.checked)}
                style={{ cursor: "pointer", width: "16px", height: "16px" }}
              />
              <label
                htmlFor="table-with-header"
                style={{ fontSize: "12.5px", color: "#334155", cursor: "pointer", userSelect: "none" }}
              >
                Tạo dòng tiêu đề đầu trang (Header Row)
              </label>
            </div>
          </div>

          <div className="custom-margins-actions">
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
              <span>Chèn bảng</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TableInsertDialog;
