import { useEffect, useRef } from "react";
import {
  Check,
  X,
  CheckCheck,
  Ban,
  Clock,
  User,
  SlidersHorizontal,
} from "lucide-react";
import { useReviewStore } from "../../../stores/reviewStore.ts";
import { useEditorStore } from "../../../stores/editorStore.ts";
import { useDocumentStore } from "../../../stores/documentStore.ts";
import { TrackChangesService } from "../trackChangesService.ts";
import type { TrackChangeItem } from "../../../document/documentTypes.ts";
import {
  formatPropertyDiffDisplay,
  getChangeTypeBadge,
  getScopeBadge,
  formatRevisionTimestamp,
} from "../formattingDisplayUtils.ts";

export function ReviewChangesList() {
  const editor = useEditorStore((state) => state.editor);
  const activeChangeId = useReviewStore((state) => state.activeChangeId);
  const setActiveChangeId = useReviewStore((state) => state.setActiveChangeId);
  const changesFilter = useReviewStore((state) => state.changesFilter);
  const setChangesFilter = useReviewStore((state) => state.setChangesFilter);
  const trackedChanges = useDocumentStore((state) => state.trackedChanges) || [];

  const activeCardRef = useRef<HTMLDivElement>(null);

  // Lấy danh sách thay đổi thực tế từ document
  const doc = editor?.state.doc;
  const changes: TrackChangeItem[] = doc
    ? TrackChangesService.getTrackedChangesFromDoc(doc)
    : trackedChanges;

  // Thống kê số lượng theo loại
  const insertCount = changes.filter((c) => c.type === "insert").length;
  const deleteCount = changes.filter((c) => c.type === "delete").length;
  const formatCount = changes.filter((c) => c.type === "format").length;
  const totalCount = changes.length;

  // Lọc theo changesFilter
  const filteredChanges = changes.filter((c) => {
    if (changesFilter === "insertions") return c.type === "insert";
    if (changesFilter === "deletions") return c.type === "delete";
    if (changesFilter === "formatting") return c.type === "format";
    return true; // "all"
  });

  // Tự động cuộn card đang active vào view
  useEffect(() => {
    if (activeChangeId && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeChangeId]);

  const handleSelectChange = (change: TrackChangeItem) => {
    setActiveChangeId(change.id);
    if (!editor) return;
    TrackChangesService.navigateToChange(editor, change.id);
  };

  const handleAcceptSingle = (e: React.MouseEvent, changeId: string) => {
    e.stopPropagation();
    if (!editor) return;
    TrackChangesService.acceptChange(editor, changeId);
  };

  const handleRejectSingle = (e: React.MouseEvent, changeId: string) => {
    e.stopPropagation();
    if (!editor) return;
    TrackChangesService.rejectChange(editor, changeId);
  };

  const handleAcceptAll = () => {
    if (!editor) return;
    if (changesFilter === "formatting") {
      TrackChangesService.acceptAllFormatting(editor);
    } else {
      TrackChangesService.acceptAllChanges(editor);
    }
  };

  const handleRejectAll = () => {
    if (!editor) return;
    if (changesFilter === "formatting") {
      TrackChangesService.rejectAllFormatting(editor);
    } else {
      TrackChangesService.rejectAllChanges(editor);
    }
  };

  return (
    <div className="review-changes-container">
      {/* 1. Bộ lọc Revisions (Review Filters) */}
      <div className="review-filter-bar">
        <button
          type="button"
          className={`review-filter-chip ${changesFilter === "all" ? "is-active" : ""}`}
          onClick={() => setChangesFilter("all")}
          title="Hiển thị tất cả thay đổi"
        >
          <span>Tất cả</span>
          <span className="chip-badge">{totalCount}</span>
        </button>

        <button
          type="button"
          className={`review-filter-chip chip-format ${changesFilter === "formatting" ? "is-active" : ""}`}
          onClick={() => setChangesFilter("formatting")}
          title="Chỉ hiển thị thay đổi định dạng"
        >
          <span>Định dạng</span>
          <span className="chip-badge">{formatCount}</span>
        </button>

        <button
          type="button"
          className={`review-filter-chip chip-insert ${changesFilter === "insertions" ? "is-active" : ""}`}
          onClick={() => setChangesFilter("insertions")}
          title="Chỉ hiển thị văn bản thêm mới"
        >
          <span>Thêm mới</span>
          <span className="chip-badge">{insertCount}</span>
        </button>

        <button
          type="button"
          className={`review-filter-chip chip-delete ${changesFilter === "deletions" ? "is-active" : ""}`}
          onClick={() => setChangesFilter("deletions")}
          title="Chỉ hiển thị văn bản xóa bỏ"
        >
          <span>Xóa bỏ</span>
          <span className="chip-badge">{deleteCount}</span>
        </button>
      </div>

      {/* 2. Thanh thao tác hàng loạt gọn gàng (Bulk actions toolbar) */}
      {changes.length > 0 && (
        <div className="review-bulk-bar">
          <button
            type="button"
            className="review-bulk-btn bulk-accept"
            onClick={handleAcceptAll}
            title={changesFilter === "formatting" ? "Chấp nhận tất cả thay đổi định dạng" : "Chấp nhận tất cả thay đổi"}
          >
            <CheckCheck size={13} />
            <span>{changesFilter === "formatting" ? "Nhận tất cả Đ.dạng" : "Chấp nhận tất cả"}</span>
          </button>
          <button
            type="button"
            className="review-bulk-btn bulk-reject"
            onClick={handleRejectAll}
            title={changesFilter === "formatting" ? "Từ chối tất cả thay đổi định dạng" : "Từ chối tất cả thay đổi"}
          >
            <Ban size={13} />
            <span>{changesFilter === "formatting" ? "Hủy tất cả Đ.dạng" : "Từ chối tất cả"}</span>
          </button>
        </div>
      )}

      {/* 3. Danh sách thẻ thay đổi (Unified Review List) */}
      <div className="review-cards-list">
        {filteredChanges.length === 0 ? (
          <div className="review-empty-state">
            <div className="empty-icon-wrapper">
              <SlidersHorizontal size={28} />
            </div>
            <h4>Không có thay đổi nào</h4>
            <p>
              {totalCount === 0
                ? "Tài liệu hiện không có thay đổi nào đang chờ kiểm duyệt."
                : "Không tìm thấy thay đổi nào phù hợp với bộ lọc hiện tại."}
            </p>
          </div>
        ) : (
          filteredChanges.map((change) => {
            const isActive = change.id === activeChangeId;
            const typeBadge = getChangeTypeBadge(change.type);
            const scopeBadge = change.type === "format" ? getScopeBadge(change.scope) : null;
            const diffs = change.formatChange?.changes || [];

            return (
              <div
                key={change.id}
                ref={isActive ? activeCardRef : undefined}
                className={`review-change-card type-${change.type} ${isActive ? "is-active" : ""}`}
                onClick={() => handleSelectChange(change)}
                data-change-id={change.id}
              >
                {/* Header card: badges, author, timestamp */}
                <div className="review-card-header">
                  <div className="review-badge-group">
                    <span
                      className="review-badge badge-type"
                      style={{ backgroundColor: typeBadge.bg, color: typeBadge.color }}
                    >
                      {typeBadge.label}
                    </span>
                    {scopeBadge && (
                      <span
                        className="review-badge badge-scope"
                        style={{ backgroundColor: scopeBadge.bg, color: scopeBadge.color }}
                      >
                        {scopeBadge.label}
                      </span>
                    )}
                  </div>

                  <div className="review-card-meta">
                    <span className="review-author" title={change.author}>
                      <User size={11} />
                      {change.author || "Tác giả"}
                    </span>
                    {change.timestamp && (
                      <span className="review-time">
                        <Clock size={11} />
                        {formatRevisionTimestamp(change.timestamp)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Trích đoạn nội dung bị ảnh hưởng */}
                {change.text && (
                  <div className="review-card-quote">
                    <span className="quote-mark">“</span>
                    <span className="quote-text">{change.text.trim() || "[Khoảng trắng / Đề mục]"}</span>
                    <span className="quote-mark">”</span>
                  </div>
                )}

                {/* Chi tiết Before -> After cho Formatting Revision */}
                {change.type === "format" && diffs.length > 0 && (
                  <div className="review-diff-list">
                    {diffs.map((diff, idx) => {
                      const display = formatPropertyDiffDisplay(diff);
                      return (
                        <div key={idx} className="review-diff-row">
                          <span className="diff-label">{display.label}:</span>
                          <span className="diff-values">
                            <span className="diff-before">{display.beforeDisplay}</span>
                            <span className="diff-arrow">→</span>
                            <span className="diff-after">{display.afterDisplay}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Format summary nếu không có diff mảng con */}
                {change.type === "format" && diffs.length === 0 && change.formatDetails && (
                  <div className="review-diff-summary">
                    {change.formatDetails}
                  </div>
                )}

                {/* Actions: Chấp nhận & Từ chối */}
                <div className="review-card-actions">
                  <button
                    type="button"
                    className="review-action-btn btn-accept"
                    onClick={(e) => handleAcceptSingle(e, change.id)}
                    title="Chấp nhận thay đổi này (Accept)"
                  >
                    <Check size={13} />
                    <span>Chấp nhận</span>
                  </button>
                  <button
                    type="button"
                    className="review-action-btn btn-reject"
                    onClick={(e) => handleRejectSingle(e, change.id)}
                    title="Từ chối thay đổi này (Reject)"
                  >
                    <X size={13} />
                    <span>Từ chối</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
