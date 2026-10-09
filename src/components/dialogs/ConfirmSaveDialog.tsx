import { useEffect, useRef } from "react";
import { AlertCircle, Save, XCircle, Ban } from "lucide-react";
import { useConfirmDialogStore } from "../../stores/confirmDialogStore";

export function ConfirmSaveDialog() {
  const { isOpen, documentTitle, actionType, confirmChoice, closeDialog } =
    useConfirmDialogStore();
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Tự động focus vào nút Lưu (Save) khi mở modal
    saveBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeDialog();
      } else if (e.key === "Enter" && !e.shiftKey) {
        // Nếu không đang focus ở một nút cụ thể khác, mặc định Enter = Lưu
        const activeEl = document.activeElement;
        if (
          activeEl &&
          activeEl instanceof HTMLButtonElement &&
          activeEl.dataset.choice
        ) {
          // Nút đang focus sẽ tự kích hoạt bởi browser click
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        confirmChoice("save");
      } else if (e.key === "d" || e.key === "D") {
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          confirmChoice("dontsave");
        }
      } else if (e.key === "s" || e.key === "S") {
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          confirmChoice("save");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, confirmChoice, closeDialog]);

  if (!isOpen) return null;

  const actionLabel =
    actionType === "new"
      ? "tạo tài liệu mới"
      : actionType === "open"
      ? "mở tài liệu khác"
      : "đóng ứng dụng";

  return (
    <div
      className="confirm-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div className="confirm-dialog-card">
        <div className="confirm-dialog-header">
          <div className="confirm-dialog-icon">
            <AlertCircle size={24} color="#f59e0b" />
          </div>
          <div className="confirm-dialog-header-text">
            <h2 id="confirm-dialog-title">Personal Word Editor</h2>
            <span className="confirm-dialog-subtitle">Xác nhận lưu thay đổi</span>
          </div>
        </div>

        <div className="confirm-dialog-body" id="confirm-dialog-desc">
          <p className="confirm-dialog-message">
            Bạn có muốn lưu các thay đổi cho tài liệu{" "}
            <strong>&ldquo;{documentTitle}&rdquo;</strong> trước khi {actionLabel} không?
          </p>
          <p className="confirm-dialog-warning">
            Nếu bạn không lưu, mọi nội dung và định dạng đã chỉnh sửa sẽ bị mất vĩnh viễn.
          </p>
        </div>

        <div className="confirm-dialog-actions">
          <button
            ref={saveBtnRef}
            type="button"
            data-choice="save"
            className="confirm-btn confirm-btn-save"
            onClick={() => confirmChoice("save")}
            title="Lưu các thay đổi (Enter hoặc S)"
          >
            <Save size={16} />
            <span>Lưu (Save)</span>
          </button>

          <button
            type="button"
            data-choice="dontsave"
            className="confirm-btn confirm-btn-dontsave"
            onClick={() => confirmChoice("dontsave")}
            title="Bỏ qua không lưu (D)"
          >
            <XCircle size={16} />
            <span>Không lưu (Don&apos;t Save)</span>
          </button>

          <button
            type="button"
            data-choice="cancel"
            className="confirm-btn confirm-btn-cancel"
            onClick={() => confirmChoice("cancel")}
            title="Hủy hành động và giữ nguyên tài liệu (Escape)"
          >
            <Ban size={16} />
            <span>Hủy (Cancel)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
