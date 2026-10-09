import { ShieldAlert, RotateCcw, Trash2, Clock, FileText } from "lucide-react";
import { useVersionHistoryStore } from "../../stores/versionHistoryStore.ts";
import { useEditorStore } from "../../stores/editorStore.ts";

function formatTimestamp(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function CrashRecoveryDialog() {
  const {
    isRecoveryOpen,
    pendingRecovery,
    acceptRecovery,
    discardRecoveryAction,
  } = useVersionHistoryStore();

  const editor = useEditorStore((state) => state.editor);

  if (!isRecoveryOpen || !pendingRecovery || !pendingRecovery.session) {
    return null;
  }

  const session = pendingRecovery.session;
  const snapshotMeta = pendingRecovery.snapshot?.metadata;

  return (
    <div
      className="crash-recovery-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="crash-recovery-title"
      aria-describedby="crash-recovery-desc"
    >
      <div className="crash-recovery-dialog">
        <div className="crash-recovery-header">
          <div className="crash-recovery-icon-circle">
            <ShieldAlert size={28} className="crash-recovery-icon" />
          </div>
          <div>
            <h2 id="crash-recovery-title">Phục hồi phiên làm việc chưa lưu</h2>
            <span className="crash-recovery-sub">
              Phát hiện ứng dụng đã đóng đột ngột hoặc chưa được lưu hoàn chỉnh
            </span>
          </div>
        </div>

        <div className="crash-recovery-body" id="crash-recovery-desc">
          <p className="crash-recovery-message">
            Personal Word Editor đã tìm thấy một bản sao lưu phục hồi hợp lệ
            được tạo trước khi ứng dụng kết thúc. Bạn có muốn nạp lại tài liệu
            này để tiếp tục công việc không?
          </p>

          <div className="crash-recovery-card">
            <div className="recovery-card-row">
              <FileText size={16} />
              <span className="recovery-row-label">Tên tài liệu:</span>
              <strong className="recovery-row-val">{session.documentTitle}</strong>
            </div>

            <div className="recovery-card-row">
              <Clock size={16} />
              <span className="recovery-row-label">Thời điểm tự động lưu:</span>
              <span className="recovery-row-val">
                {formatTimestamp(snapshotMeta?.createdAt || session.lastModifiedAt)}
              </span>
            </div>

            {snapshotMeta && (
              <div className="recovery-card-row">
                <span className="recovery-row-label" style={{ marginLeft: "24px" }}>
                  Dung lượng ước tính:
                </span>
                <span className="recovery-row-val">
                  {snapshotMeta.wordCount} từ · {snapshotMeta.characterCount} ký tự
                </span>
              </div>
            )}

            {session.filePath && (
              <div className="recovery-card-row">
                <span className="recovery-row-label" style={{ marginLeft: "24px" }}>
                  Đường dẫn tệp gốc:
                </span>
                <span className="recovery-row-code">{session.filePath}</span>
              </div>
            )}
          </div>

          <div className="crash-recovery-warning">
            Lưu ý: Thao tác này sẽ không ghi đè trực tiếp lên tệp trên đĩa của bạn cho đến khi bạn chủ động nhấn Lưu (Ctrl+S).
          </div>
        </div>

        <div className="crash-recovery-actions">
          <button
            type="button"
            className="crash-btn-discard"
            onClick={() => discardRecoveryAction()}
          >
            <Trash2 size={16} />
            <span>Bỏ qua bản phục hồi</span>
          </button>

          <button
            type="button"
            className="crash-btn-recover"
            onClick={() => acceptRecovery(editor)}
            autoFocus
          >
            <RotateCcw size={16} />
            <span>Khôi phục tài liệu</span>
          </button>
        </div>
      </div>
    </div>
  );
}
