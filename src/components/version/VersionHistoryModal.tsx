import React, { useState } from "react";
import {
  History,
  RotateCcw,
  Plus,
  Trash2,
  X,
  Clock,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useVersionHistoryStore } from "../../stores/versionHistoryStore.ts";
import { useEditorStore } from "../../stores/editorStore.ts";
import type { SnapshotReason } from "../../version/types.ts";

function formatTimestamp(isoString: string): string {
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

function getReasonBadge(reason: SnapshotReason): { text: string; className: string } {
  switch (reason) {
    case "autosave":
      return { text: "Tự động lưu", className: "badge-autosave" };
    case "manual":
      return { text: "Thủ công", className: "badge-manual" };
    case "recovery":
      return { text: "Cứu hộ", className: "badge-recovery" };
    case "pre-restore":
      return { text: "Trước khôi phục", className: "badge-pre-restore" };
    case "explicit-save":
      return { text: "Lưu chính thức", className: "badge-explicit-save" };
    default:
      return { text: reason, className: "badge-default" };
  }
}

export function VersionHistoryModal() {
  const {
    isHistoryOpen,
    closeHistory,
    snapshots,
    selectedSnapshotId,
    selectedSnapshot,
    isLoading,
    errorMessage,
    selectSnapshot,
    createManualSnapshot,
    deleteSnapshot,
    restoreSnapshotAction,
  } = useVersionHistoryStore();

  const editor = useEditorStore((state) => state.editor);
  const [descriptionInput, setDescriptionInput] = useState("");
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  if (!isHistoryOpen) return null;

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    await createManualSnapshot(descriptionInput.trim() || undefined);
    setDescriptionInput("");
    setShowAddPrompt(false);
  };

  const handleRestore = async (id: string) => {
    const ok = await restoreSnapshotAction(id, editor);
    if (ok) {
      setConfirmRestoreId(null);
    }
  };

  return (
    <div
      className="version-history-backdrop"
      onClick={closeHistory}
      role="dialog"
      aria-modal="true"
      aria-label="Lịch sử phiên bản tài liệu"
    >
      <div
        className="version-history-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="version-history-header">
          <div className="version-history-title-group">
            <History size={20} className="version-header-icon" />
            <h2>Lịch sử phiên bản & Bản sao lưu</h2>
          </div>
          <button
            type="button"
            className="version-close-btn"
            onClick={closeHistory}
            title="Đóng hộp thoại (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Thông báo lỗi nếu có */}
        {errorMessage && (
          <div className="version-alert-error" role="alert">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Nội dung 2 cột: Danh sách bên trái, Chi tiết bên phải */}
        <div className="version-history-body">
          {/* Cột trái: Danh sách snapshot */}
          <div className="version-list-column">
            <div className="version-list-toolbar">
              <span className="version-count-label">
                {isLoading ? "Đang tải..." : `${snapshots.length} bản sao lưu`}
              </span>
              <button
                type="button"
                className="version-btn-create"
                onClick={() => setShowAddPrompt(!showAddPrompt)}
              >
                <Plus size={14} />
                <span>Tạo bản chụp</span>
              </button>
            </div>

            {showAddPrompt && (
              <form onSubmit={handleCreateSnapshot} className="version-create-form">
                <input
                  type="text"
                  placeholder="Ghi chú bản chụp (tùy chọn)..."
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  autoFocus
                  className="version-create-input"
                />
                <div className="version-create-actions">
                  <button type="submit" className="version-btn-submit">
                    Lưu
                  </button>
                  <button
                    type="button"
                    className="version-btn-cancel"
                    onClick={() => setShowAddPrompt(false)}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            )}

            <div className="version-snapshots-scroll">
              {snapshots.length === 0 ? (
                <div className="version-empty-state">
                  <Clock size={28} className="version-empty-icon" />
                  <p>Chưa có bản sao lưu nào cho tài liệu này.</p>
                  <span className="version-empty-hint">
                    Hệ thống sẽ tự động tạo bản lưu phục hồi khi bạn soạn thảo.
                  </span>
                </div>
              ) : (
                snapshots.map((snap) => {
                  const isSelected = snap.id === selectedSnapshotId;
                  const badge = getReasonBadge(snap.reason);
                  return (
                    <div
                      key={snap.id}
                      className={`version-item ${isSelected ? "is-selected" : ""}`}
                      onClick={() => selectSnapshot(snap.id)}
                    >
                      <div className="version-item-top">
                        <span className="version-item-time">
                          {formatTimestamp(snap.createdAt)}
                        </span>
                        <span className={`version-badge ${badge.className}`}>
                          {badge.text}
                        </span>
                      </div>
                      <div className="version-item-title">
                        {snap.documentTitle}
                      </div>
                      <div className="version-item-meta">
                        <span>{snap.wordCount} từ</span>
                        <span>·</span>
                        <span>{snap.characterCount} ký tự</span>
                        {snap.description && (
                          <>
                            <span>·</span>
                            <span className="version-item-desc" title={snap.description}>
                              {snap.description}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Cột phải: Xem chi tiết & Thao tác khôi phục */}
          <div className="version-detail-column">
            {selectedSnapshot ? (
              <div className="version-detail-content">
                <div className="version-detail-header">
                  <h3>Chi tiết bản chụp</h3>
                  <div className="version-detail-actions">
                    <button
                      type="button"
                      className="version-btn-delete"
                      onClick={() => deleteSnapshot(selectedSnapshot.metadata.id)}
                      title="Xóa bản chụp này"
                    >
                      <Trash2 size={15} />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>

                <div className="version-detail-cards">
                  <div className="version-card">
                    <span className="version-card-label">Tiêu đề</span>
                    <span className="version-card-value">
                      {selectedSnapshot.metadata.documentTitle}
                    </span>
                  </div>

                  <div className="version-card">
                    <span className="version-card-label">Thời điểm ghi nhận</span>
                    <span className="version-card-value">
                      {formatTimestamp(selectedSnapshot.metadata.createdAt)}
                    </span>
                  </div>

                  <div className="version-card">
                    <span className="version-card-label">Phân loại</span>
                    <span className="version-card-value">
                      {getReasonBadge(selectedSnapshot.metadata.reason).text}
                    </span>
                  </div>

                  <div className="version-stats-grid">
                    <div className="version-stat-box">
                      <span className="stat-number">
                        {selectedSnapshot.metadata.wordCount}
                      </span>
                      <span className="stat-label">Số từ</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-number">
                        {selectedSnapshot.metadata.characterCount}
                      </span>
                      <span className="stat-label">Ký tự</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-number">
                        {selectedSnapshot.metadata.paragraphCount}
                      </span>
                      <span className="stat-label">Đoạn văn</span>
                    </div>
                  </div>

                  {selectedSnapshot.metadata.description && (
                    <div className="version-card">
                      <span className="version-card-label">Ghi chú</span>
                      <span className="version-card-value">
                        {selectedSnapshot.metadata.description}
                      </span>
                    </div>
                  )}

                  {selectedSnapshot.metadata.originalFilePath && (
                    <div className="version-card">
                      <span className="version-card-label">File gốc</span>
                      <span className="version-card-code">
                        {selectedSnapshot.metadata.originalFilePath}
                      </span>
                    </div>
                  )}
                </div>

                <div className="version-restore-box">
                  <div className="version-restore-note">
                    <AlertCircle size={15} />
                    <span>
                      Khi khôi phục, tài liệu hiện tại sẽ quay về trạng thái bản chụp này.
                      Nếu tài liệu hiện tại có thay đổi chưa lưu, một bản sao lưu an toàn
                      sẽ được tạo tự động trước khi khôi phục.
                    </span>
                  </div>

                  {confirmRestoreId === selectedSnapshot.metadata.id ? (
                    <div className="version-confirm-restore">
                      <span>Bạn có chắc chắn muốn khôi phục về bản chụp này?</span>
                      <div className="version-confirm-buttons">
                        <button
                          type="button"
                          className="version-btn-confirm"
                          onClick={() => handleRestore(selectedSnapshot.metadata.id)}
                        >
                          <CheckCircle2 size={16} />
                          <span>Đồng ý khôi phục</span>
                        </button>
                        <button
                          type="button"
                          className="version-btn-cancel"
                          onClick={() => setConfirmRestoreId(null)}
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="version-btn-restore"
                      onClick={() => setConfirmRestoreId(selectedSnapshot.metadata.id)}
                    >
                      <RotateCcw size={16} />
                      <span>Khôi phục phiên bản này</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="version-detail-empty">
                <FileText size={32} />
                <p>Chọn một bản sao lưu ở danh sách bên trái để xem thông tin chi tiết.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
