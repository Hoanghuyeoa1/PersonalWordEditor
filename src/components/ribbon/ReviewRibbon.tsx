import { useState, useEffect } from "react";
import {
  CheckCheck,
  BookOpen,
  MessageSquarePlus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  History,
  CheckCircle2,
  XCircle,
  BarChart3,
  Globe,
  Ban,
  SlidersHorizontal,
} from "lucide-react";
import { useReviewCommands } from "../../review/hooks/useReviewCommands";
import { useReviewStore } from "../../stores/reviewStore";
import { useEditorStore } from "../../stores/editorStore";
import { useDocumentStore } from "../../stores/documentStore";
import { getReviewItemDescriptor } from "../../review/services/reviewRegistry";
import { ReviewRibbonButton } from "../../review/components/ReviewRibbonButton";
import { SpellCheckerEngine } from "../../review/proofing/spellCheckerEngine";
import { ProofingService } from "../../review/proofing/proofingService";
import { CommentService } from "../../review/comments/commentService";
import { TrackChangesService } from "../../review/trackChanges/trackChangesService";
import type { SupportedLanguage } from "../../review/proofing/proofingTypes";

/**
 * ReviewRibbon - Thanh công cụ Kiểm duyệt & Thống kê (Tab Review)
 *
 * Phân chia thành 5 nhóm công cụ chuẩn Microsoft Word:
 * 1. Proofing (Kiểm lỗi): Chính tả, Ngữ pháp, Ngôn ngữ, Lỗi trước, Lỗi tiếp (F7 / Shift+F7)
 * 2. Comments (Bình luận): Thêm nhận xét (Ctrl+Alt+M), Xóa, Trước, Tiếp
 * 3. Tracking (Theo dõi): Bật/tắt theo dõi thay đổi (Ctrl+Shift+E), Bảng kiểm duyệt
 * 4. Changes (Thay đổi): Chấp nhận, Từ chối, Nhận tất cả, Bỏ tất cả, Trước, Tiếp
 * 5. Document (Tài liệu): Thống kê từ & trang (Word Count / Ctrl+Shift+G)
 */
export function ReviewRibbon() {
  const { openDocumentStatistics } = useReviewCommands();
  const proofingEnabled = useReviewStore((state) => state.proofingEnabled);
  const toggleProofing = useReviewStore((state) => state.toggleProofing);
  const spellCheckLanguage = useReviewStore((state) => state.spellCheckLanguage);
  const setSpellCheckLanguage = useReviewStore((state) => state.setSpellCheckLanguage);
  const editor = useEditorStore((state) => state.editor);

  const activeCommentId = useReviewStore((state) => state.activeCommentId);
  const setActiveCommentId = useReviewStore((state) => state.setActiveCommentId);
  const isCommentsSidebarOpen = useReviewStore((state) => state.isCommentsSidebarOpen);
  const setCommentsSidebarOpen = useReviewStore((state) => state.setCommentsSidebarOpen);
  const reviewSidebarTab = useReviewStore((state) => state.reviewSidebarTab);
  const setReviewSidebarTab = useReviewStore((state) => state.setReviewSidebarTab);
  const setPendingCommentDraft = useReviewStore((state) => state.setPendingCommentDraft);
  const comments = useDocumentStore((state) => state.comments);
  const deleteComment = useDocumentStore((state) => state.deleteComment);

  const trackChangesEnabled = useReviewStore((state) => state.trackChangesEnabled);
  const toggleTrackChanges = useReviewStore((state) => state.toggleTrackChanges);
  const activeChangeId = useReviewStore((state) => state.activeChangeId);
  const trackedChanges = useDocumentStore((state) => state.trackedChanges) || [];

  // Theo dõi số lượng lỗi chính tả / ngữ pháp để kích hoạt / vô hiệu hóa nút Next / Prev Issue
  const [issueCount, setIssueCount] = useState(0);

  useEffect(() => {
    if (!editor) {
      setIssueCount(0);
      return;
    }
    const updateIssueCount = () => {
      const issues = ProofingService.getIssuesFromEditor(editor);
      setIssueCount(issues.length);
    };
    updateIssueCount();
    editor.on("transaction", updateIssueCount);
    return () => {
      editor.off("transaction", updateIssueCount);
    };
  }, [editor]);

  // Kiểm tra tài liệu có thay đổi đang theo dõi nào không để quản lý disabled state nhóm Changes
  const hasChanges =
    trackedChanges.length > 0 ||
    Boolean(editor && TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc).length > 0);

  const handleToggleSpelling = () => {
    toggleProofing();
    if (editor) {
      setTimeout(() => {
        editor.commands.recheckSpelling();
      }, 50);
    }
  };

  const handleToggleLanguage = () => {
    const nextLang: SupportedLanguage = spellCheckLanguage === "en-US" ? "vi-VN" : "en-US";
    setSpellCheckLanguage(nextLang);
    SpellCheckerEngine.setLanguage(nextLang);
    if (editor) {
      editor.commands.recheckSpelling();
    }
  };

  const grammarEnabled = useReviewStore((state) => state.grammarEnabled);
  const toggleGrammar = useReviewStore((state) => state.toggleGrammar);

  const handleToggleGrammar = () => {
    toggleGrammar();
    if (editor) {
      setTimeout(() => {
        editor.commands.recheckSpelling();
      }, 50);
    }
  };

  const handlePreviousIssue = () => {
    if (!editor) return;
    const prev = ProofingService.findPreviousIssue(editor);
    if (prev) {
      ProofingService.navigateToIssue(editor, prev);
    }
  };

  const handleNextIssue = () => {
    if (!editor) return;
    const next = ProofingService.findNextIssue(editor);
    if (next) {
      ProofingService.navigateToIssue(editor, next);
    }
  };

  const handleNewComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      // Mở sidebar để người dùng xem bình luận hoặc bôi đen văn bản
      setCommentsSidebarOpen(true);
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    setCommentsSidebarOpen(true);
    setPendingCommentDraft({
      from,
      to,
      selectedText,
    });
  };

  const handleDeleteComment = () => {
    let targetId = activeCommentId;
    if (!targetId && editor) {
      const $from = editor.state.selection.$from;
      const mark = $from.marks().find((m) => m.type.name === "comment");
      if (mark?.attrs.commentId) {
        targetId = mark.attrs.commentId;
      }
    }

    if (targetId) {
      if (editor) {
        editor.commands.unsetComment(targetId);
      }
      deleteComment(targetId);
      if (activeCommentId === targetId) {
        setActiveCommentId(null);
      }
    }
  };

  const handlePreviousComment = () => {
    if (!editor || comments.length === 0) return;
    const prevId = CommentService.findPreviousComment(
      editor.state.doc,
      comments,
      activeCommentId
    );
    if (prevId) {
      setActiveCommentId(prevId);
      setCommentsSidebarOpen(true);
      const range = CommentService.findCommentRangeInDoc(editor.state.doc, prevId);
      if (range) {
        editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).scrollIntoView().run();
      }
    }
  };

  const handleNextComment = () => {
    if (!editor || comments.length === 0) return;
    const nextId = CommentService.findNextComment(
      editor.state.doc,
      comments,
      activeCommentId
    );
    if (nextId) {
      setActiveCommentId(nextId);
      setCommentsSidebarOpen(true);
      const range = CommentService.findCommentRangeInDoc(editor.state.doc, nextId);
      if (range) {
        editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).scrollIntoView().run();
      }
    }
  };

  const handleToggleTrackChanges = () => {
    toggleTrackChanges();
  };

  const handleAcceptChange = () => {
    if (!editor) return;
    TrackChangesService.acceptChange(editor);
  };

  const handleRejectChange = () => {
    if (!editor) return;
    TrackChangesService.rejectChange(editor);
  };

  const handleAcceptAllChanges = () => {
    if (!editor) return;
    TrackChangesService.acceptAllChanges(editor);
  };

  const handleRejectAllChanges = () => {
    if (!editor) return;
    TrackChangesService.rejectAllChanges(editor);
  };

  const handleToggleChangesPane = () => {
    if (isCommentsSidebarOpen && reviewSidebarTab === "changes") {
      setCommentsSidebarOpen(false);
    } else {
      setReviewSidebarTab("changes");
      setCommentsSidebarOpen(true);
    }
  };

  const handlePreviousChange = () => {
    if (!editor) return;
    const filter = useReviewStore.getState().changesFilter;
    const prev = TrackChangesService.findPreviousChange(editor.state.doc, activeChangeId, filter);
    if (prev) {
      TrackChangesService.navigateToChange(editor, prev.id);
      setCommentsSidebarOpen(true);
      setReviewSidebarTab("changes");
    }
  };

  const handleNextChange = () => {
    if (!editor) return;
    const filter = useReviewStore.getState().changesFilter;
    const next = TrackChangesService.findNextChange(editor.state.doc, activeChangeId, filter);
    if (next) {
      TrackChangesService.navigateToChange(editor, next.id);
      setCommentsSidebarOpen(true);
      setReviewSidebarTab("changes");
    }
  };

  // Descriptors từ Registry
  const spellingDesc = getReviewItemDescriptor("spelling")!;
  const grammarDesc = getReviewItemDescriptor("grammar")!;
  const prevIssueDesc = getReviewItemDescriptor("previousIssue")!;
  const nextIssueDesc = getReviewItemDescriptor("nextIssue")!;

  const newCommentDesc = getReviewItemDescriptor("newComment")!;
  const deleteCommentDesc = getReviewItemDescriptor("deleteComment")!;
  const prevCommentDesc = getReviewItemDescriptor("previousComment")!;
  const nextCommentDesc = getReviewItemDescriptor("nextComment")!;

  const trackChangesDesc = getReviewItemDescriptor("trackChanges")!;

  const acceptDesc = getReviewItemDescriptor("acceptChange")!;
  const rejectDesc = getReviewItemDescriptor("rejectChange")!;
  const acceptAllDesc = getReviewItemDescriptor("acceptAllChanges")!;
  const rejectAllDesc = getReviewItemDescriptor("rejectAllChanges")!;
  const prevChangeDesc = getReviewItemDescriptor("previousChange")!;
  const nextChangeDesc = getReviewItemDescriptor("nextChange")!;

  const docStatsDesc = getReviewItemDescriptor("documentStatistics")!;

  return (
    <div className="home-ribbon review-ribbon" role="toolbar" aria-label="Review Toolbar">
      {/* 1. Nhóm Proofing (Kiểm lỗi) */}
      <div className="ribbon-group" role="group" aria-label="Proofing">
        <div className="ribbon-group-controls">
          <ReviewRibbonButton
            descriptor={spellingDesc}
            icon={<CheckCheck size={20} />}
            size="large"
            isActive={proofingEnabled}
            onClick={handleToggleSpelling}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              title={`Ngôn ngữ kiểm tra: ${spellCheckLanguage === "en-US" ? "English (US)" : "Tiếng Việt"}. Nhấn để chuyển đổi.`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleToggleLanguage}
              style={{ minWidth: "82px" }}
            >
              <Globe size={13} style={{ color: "#2563eb" }} />
              <span style={{ fontWeight: 600 }}>{spellCheckLanguage === "en-US" ? "EN (US)" : "VI (Việt)"}</span>
            </button>
            <ReviewRibbonButton
              descriptor={grammarDesc}
              icon={<BookOpen size={13} />}
              size="small"
              isActive={grammarEnabled}
              onClick={handleToggleGrammar}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <ReviewRibbonButton
              descriptor={prevIssueDesc}
              icon={<ChevronLeft size={13} />}
              size="small"
              onClick={handlePreviousIssue}
              disabled={issueCount === 0}
            />
            <ReviewRibbonButton
              descriptor={nextIssueDesc}
              icon={<ChevronRight size={13} />}
              size="small"
              onClick={handleNextIssue}
              disabled={issueCount === 0}
            />
          </div>
        </div>
        <span className="ribbon-group-label">Kiểm lỗi</span>
      </div>

      <div className="ribbon-group-sep" />

      {/* 2. Nhóm Comments (Bình luận) */}
      <div className="ribbon-group" role="group" aria-label="Comments">
        <div className="ribbon-group-controls">
          <ReviewRibbonButton
            descriptor={newCommentDesc}
            icon={<MessageSquarePlus size={20} />}
            size="large"
            onClick={handleNewComment}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <ReviewRibbonButton
              descriptor={deleteCommentDesc}
              icon={<Trash2 size={13} />}
              size="small"
              onClick={handleDeleteComment}
              disabled={comments.length === 0}
            />
            <div style={{ display: "flex", gap: "2px" }}>
              <ReviewRibbonButton
                descriptor={prevCommentDesc}
                icon={<ChevronLeft size={13} />}
                size="small"
                onClick={handlePreviousComment}
                disabled={comments.length === 0}
              />
              <ReviewRibbonButton
                descriptor={nextCommentDesc}
                icon={<ChevronRight size={13} />}
                size="small"
                onClick={handleNextComment}
                disabled={comments.length === 0}
              />
            </div>
          </div>
        </div>
        <span className="ribbon-group-label">Bình luận</span>
      </div>

      <div className="ribbon-group-sep" />

      {/* 3. Nhóm Tracking (Theo dõi) */}
      <div className="ribbon-group" role="group" aria-label="Tracking">
        <div className="ribbon-group-controls">
          <ReviewRibbonButton
            descriptor={trackChangesDesc}
            icon={<History size={20} />}
            size="large"
            isActive={trackChangesEnabled}
            onClick={handleToggleTrackChanges}
          />
          <button
            type="button"
            className={`ribbon-tool-btn large-btn ${isCommentsSidebarOpen && reviewSidebarTab === "changes" ? "active" : ""}`}
            title="Bảng duyệt thay đổi (Reviewing Pane)"
            onClick={handleToggleChangesPane}
            onMouseDown={(e) => e.preventDefault()}
          >
            <SlidersHorizontal size={20} />
            <span style={{ fontSize: "11px", fontWeight: 500, marginTop: "2px" }}>Bảng duyệt</span>
          </button>
        </div>
        <span className="ribbon-group-label">Theo dõi</span>
      </div>

      <div className="ribbon-group-sep" />

      {/* 4. Nhóm Changes (Xử lý thay đổi) */}
      <div className="ribbon-group" role="group" aria-label="Changes">
        <div className="ribbon-group-controls">
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <ReviewRibbonButton
              descriptor={acceptDesc}
              icon={<CheckCircle2 size={13} />}
              size="small"
              onClick={handleAcceptChange}
              disabled={!hasChanges}
            />
            <ReviewRibbonButton
              descriptor={rejectDesc}
              icon={<XCircle size={13} />}
              size="small"
              onClick={handleRejectChange}
              disabled={!hasChanges}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <ReviewRibbonButton
              descriptor={acceptAllDesc}
              icon={<CheckCheck size={13} />}
              size="small"
              onClick={handleAcceptAllChanges}
              disabled={!hasChanges}
            />
            <ReviewRibbonButton
              descriptor={rejectAllDesc}
              icon={<Ban size={13} />}
              size="small"
              onClick={handleRejectAllChanges}
              disabled={!hasChanges}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <ReviewRibbonButton
              descriptor={prevChangeDesc}
              icon={<ChevronLeft size={13} />}
              size="small"
              onClick={handlePreviousChange}
              disabled={!hasChanges}
            />
            <ReviewRibbonButton
              descriptor={nextChangeDesc}
              icon={<ChevronRight size={13} />}
              size="small"
              onClick={handleNextChange}
              disabled={!hasChanges}
            />
          </div>
        </div>
        <span className="ribbon-group-label">Thay đổi</span>
      </div>

      <div className="ribbon-group-sep" />

      {/* 5. Nhóm Document (Thống kê tài liệu) */}
      <div className="ribbon-group" role="group" aria-label="Document Statistics">
        <div className="ribbon-group-controls">
          <ReviewRibbonButton
            descriptor={docStatsDesc}
            icon={<BarChart3 size={20} />}
            size="large"
            onClick={openDocumentStatistics}
          />
        </div>
        <span className="ribbon-group-label">Tài liệu</span>
      </div>
    </div>
  );
}
