import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  MessageSquarePlus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Edit2,
  X,
  ChevronLeft,
  ChevronRight,
  Quote,
  Check,
  AlertCircle,
  History,
} from "lucide-react";
import { useDocumentStore } from "../../../stores/documentStore.ts";
import { useReviewStore } from "../../../stores/reviewStore.ts";
import { useEditorStore } from "../../../stores/editorStore.ts";
import { CommentService, type OrderedCommentEntry } from "../commentService.ts";
import type { CommentItem } from "../../../document/documentTypes.ts";
import { TrackChangesService } from "../../trackChanges/trackChangesService.ts";
import { ReviewChangesList } from "../../trackChanges/components/ReviewChangesList.tsx";

export function CommentsSidebar() {
  const comments = useDocumentStore((state) => state.comments);
  const addComment = useDocumentStore((state) => state.addComment);
  const updateComment = useDocumentStore((state) => state.updateComment);
  const deleteComment = useDocumentStore((state) => state.deleteComment);
  const resolveComment = useDocumentStore((state) => state.resolveComment);
  const reopenComment = useDocumentStore((state) => state.reopenComment);
  const trackedChanges = useDocumentStore((state) => state.trackedChanges) || [];

  const activeCommentId = useReviewStore((state) => state.activeCommentId);
  const setActiveCommentId = useReviewStore((state) => state.setActiveCommentId);
  const activeChangeId = useReviewStore((state) => state.activeChangeId);
  const isCommentsSidebarOpen = useReviewStore((state) => state.isCommentsSidebarOpen);
  const setCommentsSidebarOpen = useReviewStore((state) => state.setCommentsSidebarOpen);
  const pendingCommentDraft = useReviewStore((state) => state.pendingCommentDraft);
  const setPendingCommentDraft = useReviewStore((state) => state.setPendingCommentDraft);
  const reviewSidebarTab = useReviewStore((state) => state.reviewSidebarTab);
  const setReviewSidebarTab = useReviewStore((state) => state.setReviewSidebarTab);

  const editor = useEditorStore((state) => state.editor);

  // Local states
  const [draftContent, setDraftContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "active" | "resolved">("all");

  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);

  // Focus textarea khi có pending draft
  useEffect(() => {
    if (pendingCommentDraft) {
      setTimeout(() => {
        draftTextareaRef.current?.focus();
      }, 60);
    }
  }, [pendingCommentDraft]);

  // Cuộn card đang active vào view
  useEffect(() => {
    if (activeCommentId && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Đồng bộ class .comment-active lên text highlight trong editor
    document.querySelectorAll(".comment-highlight.comment-active").forEach((el) => {
      el.classList.remove("comment-active");
    });
    if (activeCommentId) {
      document.querySelectorAll(`[data-comment-id="${activeCommentId}"]`).forEach((el) => {
        el.classList.add("comment-active");
      });
    }
  }, [activeCommentId]);

  // Đồng bộ class .comment-resolved lên text highlight trong editor
  useEffect(() => {
    const resolvedIds = new Set(comments.filter((c) => c.resolved).map((c) => c.id));
    document.querySelectorAll(".comment-highlight").forEach((el) => {
      const cid = el.getAttribute("data-comment-id");
      if (cid && resolvedIds.has(cid)) {
        el.classList.add("comment-resolved");
      } else {
        el.classList.remove("comment-resolved");
      }
    });
  }, [comments]);

  // Đồng bộ tab thanh bên khi click vào comment hoặc change
  useEffect(() => {
    if (activeCommentId) {
      setReviewSidebarTab("comments");
    }
  }, [activeCommentId, setReviewSidebarTab]);

  useEffect(() => {
    if (activeChangeId) {
      setReviewSidebarTab("changes");
    }
  }, [activeChangeId, setReviewSidebarTab]);

  if (!isCommentsSidebarOpen) {
    return null;
  }

  const docNode = editor?.state.doc;
  const orderedEntries: OrderedCommentEntry[] = CommentService.getOrderedComments(
    docNode,
    comments
  );

  const counts = CommentService.getCommentsCount(comments);
  const changesCount = docNode
    ? TrackChangesService.getTrackedChangesFromDoc(docNode).length
    : trackedChanges.length;

  const filteredEntries = orderedEntries.filter((entry) => {
    if (filterMode === "active") return !entry.comment.resolved;
    if (filterMode === "resolved") return entry.comment.resolved;
    return true;
  });

  // Xử lý tạo nhận xét mới từ Draft
  const handleSaveDraft = () => {
    if (!pendingCommentDraft || !draftContent.trim() || !editor) return;

    const newComment = CommentService.createComment(
      draftContent.trim(),
      CommentService.DEFAULT_AUTHOR,
      pendingCommentDraft.selectedText
    );

    // 1. Áp dụng mark vào selection của editor
    editor
      .chain()
      .focus()
      .setTextSelection({ from: pendingCommentDraft.from, to: pendingCommentDraft.to })
      .setComment(newComment.id)
      .run();

    // 2. Thêm vào document store
    addComment(newComment);
    setActiveCommentId(newComment.id);

    // 3. Reset draft
    setDraftContent("");
    setPendingCommentDraft(null);
  };

  const handleCancelDraft = () => {
    setDraftContent("");
    setPendingCommentDraft(null);
  };

  // Nhảy tới vùng comment trong tài liệu
  const handleJumpToComment = (entry: OrderedCommentEntry) => {
    setActiveCommentId(entry.comment.id);
    if (!editor) return;

    if (entry.range) {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: entry.range.from, to: entry.range.to })
        .scrollIntoView()
        .run();
    }
  };

  // Xử lý điều hướng trước / sau
  const handleNavigateNext = () => {
    const nextId = CommentService.findNextComment(docNode, comments, activeCommentId);
    if (nextId) {
      setActiveCommentId(nextId);
      const targetEntry = orderedEntries.find((e) => e.comment.id === nextId);
      if (targetEntry?.range && editor) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: targetEntry.range.from, to: targetEntry.range.to })
          .scrollIntoView()
          .run();
      }
    }
  };

  const handleNavigatePrevious = () => {
    const prevId = CommentService.findPreviousComment(docNode, comments, activeCommentId);
    if (prevId) {
      setActiveCommentId(prevId);
      const targetEntry = orderedEntries.find((e) => e.comment.id === prevId);
      if (targetEntry?.range && editor) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: targetEntry.range.from, to: targetEntry.range.to })
          .scrollIntoView()
          .run();
      }
    }
  };

  // Bắt đầu chỉnh sửa
  const handleStartEdit = (comment: CommentItem) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  // Lưu chỉnh sửa
  const handleSaveEdit = (commentId: string) => {
    if (!editContent.trim()) return;
    updateComment(commentId, { content: editContent.trim() });
    setEditingCommentId(null);
    setEditContent("");
  };

  // Hủy chỉnh sửa
  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent("");
  };

  // Xóa bình luận
  const handleDelete = (commentId: string) => {
    // 1. Gỡ bỏ mark khỏi văn bản editor (văn bản gốc được giữ nguyên)
    if (editor) {
      editor.commands.unsetComment(commentId);
    }
    // 2. Xóa khỏi store
    deleteComment(commentId);
    if (activeCommentId === commentId) {
      setActiveCommentId(null);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }) + " " + d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <aside
      className="comments-sidebar"
      role="complementary"
      aria-label="Khung danh sách nhận xét"
    >
      {/* 1. Header with Unified Review Tab Switcher */}
      <div className="comments-sidebar-header review-unified-header">
        <div className="review-tab-nav">
          <button
            type="button"
            className={`review-tab-btn ${reviewSidebarTab === "comments" ? "is-active" : ""}`}
            onClick={() => setReviewSidebarTab("comments")}
            title="Xem danh sách nhận xét"
          >
            <MessageSquare size={13} />
            <span>Nhận xét</span>
            <span className="review-tab-badge">{counts.total}</span>
          </button>

          <button
            type="button"
            className={`review-tab-btn ${reviewSidebarTab === "changes" ? "is-active" : ""}`}
            onClick={() => setReviewSidebarTab("changes")}
            title="Xem danh sách thay đổi theo dõi"
          >
            <History size={13} />
            <span>Thay đổi</span>
            <span className="review-tab-badge">{changesCount}</span>
          </button>
        </div>

        <div className="comments-header-actions">
          {reviewSidebarTab === "comments" && (
            <>
              <button
                type="button"
                className="comments-nav-btn"
                title="Bình luận trước đó"
                onClick={handleNavigatePrevious}
                disabled={comments.length === 0}
                aria-label="Bình luận trước đó"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="comments-nav-btn"
                title="Bình luận tiếp theo"
                onClick={handleNavigateNext}
                disabled={comments.length === 0}
                aria-label="Bình luận tiếp theo"
              >
                <ChevronRight size={15} />
              </button>
            </>
          )}
          <button
            type="button"
            className="comments-close-btn"
            title="Đóng bảng kiểm duyệt"
            onClick={() => setCommentsSidebarOpen(false)}
            aria-label="Đóng bảng kiểm duyệt"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {reviewSidebarTab === "changes" ? (
        <ReviewChangesList />
      ) : (
        <>
          {/* 2. Filter tabs */}
      <div className="comments-filter-tabs">
        <button
          type="button"
          className={`comments-filter-tab ${filterMode === "all" ? "active" : ""}`}
          onClick={() => setFilterMode("all")}
        >
          Tất cả ({counts.total})
        </button>
        <button
          type="button"
          className={`comments-filter-tab ${filterMode === "active" ? "active" : ""}`}
          onClick={() => setFilterMode("active")}
        >
          Chờ xử lý ({counts.active})
        </button>
        <button
          type="button"
          className={`comments-filter-tab ${filterMode === "resolved" ? "active" : ""}`}
          onClick={() => setFilterMode("resolved")}
        >
          Đã xong ({counts.resolved})
        </button>
      </div>

      {/* 3. New Comment Draft Box (khi bấm New Comment) */}
      {pendingCommentDraft && (
        <div className="comment-draft-card">
          <div className="comment-draft-header">
            <span className="comment-draft-title">
              <MessageSquarePlus size={14} /> Thêm nhận xét mới
            </span>
          </div>
          {pendingCommentDraft.selectedText && (
            <div className="comment-quote-preview">
              <Quote size={12} className="quote-icon" />
              <span>{pendingCommentDraft.selectedText}</span>
            </div>
          )}
          <textarea
            ref={draftTextareaRef}
            className="comment-textarea"
            placeholder="Nhập nội dung nhận xét... (Ctrl+Enter để lưu)"
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSaveDraft();
              } else if (e.key === "Escape") {
                handleCancelDraft();
              }
            }}
            rows={3}
          />
          <div className="comment-draft-actions">
            <button
              type="button"
              className="comment-btn-cancel"
              onClick={handleCancelDraft}
            >
              Hủy
            </button>
            <button
              type="button"
              className="comment-btn-save"
              onClick={handleSaveDraft}
              disabled={!draftContent.trim()}
            >
              <Check size={13} /> Lưu nhận xét
            </button>
          </div>
        </div>
      )}

      {/* 4. Danh sách các bình luận */}
      <div className="comments-list">
        {filteredEntries.length === 0 && !pendingCommentDraft && (
          <div className="comments-empty-state">
            <MessageSquare size={36} className="empty-icon" />
            <p className="empty-title">Không có nhận xét nào</p>
            <p className="empty-desc">
              Bôi đen đoạn văn bản và chọn <strong>Review → Thêm nhận xét</strong> (hoặc nhấn Ctrl+Alt+M) để đính kèm ghi chú.
            </p>
          </div>
        )}

        {filteredEntries.map((entry) => {
          const { comment, range, isOrphan } = entry;
          const isActive = activeCommentId === comment.id;
          const isEditing = editingCommentId === comment.id;

          return (
            <div
              key={comment.id}
              ref={isActive ? activeCardRef : null}
              className={`comment-card ${isActive ? "active" : ""} ${
                comment.resolved ? "resolved" : ""
              } ${isOrphan ? "orphan" : ""}`}
              onClick={() => handleJumpToComment(entry)}
            >
              {/* Card Header: Author, Time, Status */}
              <div className="comment-card-header">
                <div className="comment-card-author">
                  <div className="comment-avatar">
                    {comment.author.charAt(0).toUpperCase()}
                  </div>
                  <div className="comment-meta">
                    <span className="author-name">{comment.author}</span>
                    <span className="comment-time">{formatTime(comment.createdAt)}</span>
                  </div>
                </div>

                <div className="comment-card-badges">
                  {comment.resolved ? (
                    <span className="badge-resolved" title="Nhận xét đã được giải quyết">
                      <CheckCircle2 size={11} /> Đã xong
                    </span>
                  ) : isOrphan ? (
                    <span
                      className="badge-orphan"
                      title="Đoạn văn bản gốc đã bị xóa hoặc thay đổi trong tài liệu"
                    >
                      <AlertCircle size={11} /> Mồ côi
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Quoted Text Preview */}
              {(comment.selectedText || range?.text) && (
                <div
                  className="comment-quote-preview"
                  title="Đoạn văn bản được gắn bình luận"
                >
                  <Quote size={11} className="quote-icon" />
                  <span>{range?.text || comment.selectedText}</span>
                </div>
              )}

              {/* Orphan warning message */}
              {isOrphan && (
                <div className="comment-orphan-notice">
                  (Văn bản gắn kèm không còn trong tài liệu)
                </div>
              )}

              {/* Card Body: Content or Edit Mode */}
              {isEditing ? (
                <div
                  className="comment-edit-box"
                  onClick={(e) => e.stopPropagation()}
                >
                  <textarea
                    className="comment-textarea"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSaveEdit(comment.id);
                      } else if (e.key === "Escape") {
                        handleCancelEdit();
                      }
                    }}
                  />
                  <div className="comment-edit-actions">
                    <button
                      type="button"
                      className="comment-btn-cancel"
                      onClick={handleCancelEdit}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      className="comment-btn-save"
                      onClick={() => handleSaveEdit(comment.id)}
                      disabled={!editContent.trim()}
                    >
                      <Check size={12} /> Cập nhật
                    </button>
                  </div>
                </div>
              ) : (
                <div className="comment-content">{comment.content}</div>
              )}

              {/* Card Footer Actions */}
              {!isEditing && (
                <div
                  className="comment-card-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  {comment.resolved ? (
                    <button
                      type="button"
                      className="comment-action-btn"
                      title="Mở lại nhận xét"
                      onClick={() => reopenComment(comment.id)}
                    >
                      <RotateCcw size={12} /> Mở lại
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="comment-action-btn"
                      title="Đánh dấu đã giải quyết"
                      onClick={() => resolveComment(comment.id)}
                    >
                      <CheckCircle2 size={12} /> Giải quyết
                    </button>
                  )}

                  <button
                    type="button"
                    className="comment-action-btn"
                    title="Chỉnh sửa nội dung"
                    onClick={() => handleStartEdit(comment)}
                  >
                    <Edit2 size={12} /> Sửa
                  </button>

                  <button
                    type="button"
                    className="comment-action-btn delete-btn"
                    title="Xóa nhận xét này (giữ nguyên văn bản)"
                    onClick={() => handleDelete(comment.id)}
                  >
                    <Trash2 size={12} /> Xóa
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
        </>
      )}
    </aside>
  );
}
