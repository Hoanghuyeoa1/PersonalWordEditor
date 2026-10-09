import { useState, useEffect } from "react";
import { FileText, Minus, Plus } from "lucide-react";
import { Editor } from "../../editor/Editor";
import { useDocumentStore } from "../../stores/documentStore";
import { usePaginationStore } from "../../stores/paginationStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useEditorStore } from "../../stores/editorStore";
import { CommentsSidebar } from "../../review/comments/components/CommentsSidebar";
import { DocumentOutlineSidebar } from "../../references/components/DocumentOutlineSidebar";
import { NotesSidebar } from "../../references/components/NotesSidebar";
import {
  useZoomStore,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../../stores/zoomStore";

export function AppHeader() {
  const filePath = useDocumentStore((state) => state.filePath);
  const documentTitle = useDocumentStore((state) => state.documentTitle);
  const isDirty = useDocumentStore((state) => state.isDirty);

  const displayTitle = filePath
    ? filePath.split(/[/\\]/).pop() || documentTitle
    : documentTitle;

  return (
    <header className="app-header">
      <FileText size={22} aria-hidden="true" />
      <div className="app-header-info">
        <h1>Personal Word Editor</h1>
        <span className="app-header-title-sep">—</span>
        <span className="app-header-doc-title">
          {displayTitle}
          {isDirty && <span title="Có thay đổi chưa lưu"> *</span>}
        </span>
      </div>
      <span className="phase-badge">Phase 7.3 · Focus Mode &amp; Final Audit</span>
    </header>
  );
}

export function Workspace() {
  const initialContent = useDocumentStore((state) => state.document.content);
  const updateContent = useDocumentStore((state) => state.updateContent);
  const zoom = useZoomStore((state) => state.zoom);
  const activeCommentId = useReviewStore((state) => state.activeCommentId);

  return (
    <main
      className="workspace-container"
      data-active-comment-id={activeCommentId || undefined}
      aria-label="Khu vực không gian làm việc trang soạn thảo"
      style={{ "--editor-zoom": zoom / 100 } as React.CSSProperties}
    >
      <DocumentOutlineSidebar />
      <NotesSidebar />
      <div className="workspace-canvas">
        <Editor
          initialContent={initialContent}
          onContentChange={updateContent}
        />
      </div>
      <CommentsSidebar />
    </main>
  );
}

export function StatusBar() {
  const stats = useDocumentStore((state) => state.stats);
  const filePath = useDocumentStore((state) => state.filePath);
  const isDirty = useDocumentStore((state) => state.isDirty);
  const pageSettings = useDocumentStore((state) => state.pageSettings);
  const currentSectionIndex = useDocumentStore((state) => state.currentSectionIndex);
  const sections = useDocumentStore((state) => state.sections);
  const { zoom, setZoom, zoomIn, zoomOut, resetZoom } = useZoomStore();
  const { pageCount, currentPage } = usePaginationStore();

  const editor = useEditorStore((state) => state.editor);
  const trackChangesEnabled = useReviewStore((state) => state.trackChangesEnabled);
  const toggleTrackChanges = useReviewStore((state) => state.toggleTrackChanges);
  const openStatisticsModal = useReviewStore((state) => state.openStatisticsModal);

  // Theo dõi vùng chọn văn bản (Selection Statistics)
  const [selectionStats, setSelectionStats] = useState<{ words: number; chars: number } | null>(null);

  useEffect(() => {
    if (!editor) {
      setSelectionStats(null);
      return;
    }

    const updateSelection = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || from === to) {
        setSelectionStats(null);
        return;
      }
      const text = editor.state.doc.textBetween(from, to, " ");
      const trimmed = text.trim();
      if (!trimmed) {
        setSelectionStats(null);
        return;
      }
      const words = trimmed.split(/\s+/).filter(Boolean).length;
      const chars = text.length;
      setSelectionStats({ words, chars });
    };

    updateSelection();
    editor.on("selectionUpdate", updateSelection);
    return () => {
      editor.off("selectionUpdate", updateSelection);
    };
  }, [editor]);

  const orientationLabel = pageSettings.orientation === "portrait" ? "Dọc" : "Ngang";

  return (
    <footer className="status-bar" aria-label="Thanh trạng thái">
      <div className="status-bar-left">
        <span
          className="status-item status-page-badge"
          title={`Section ${currentSectionIndex} trên tổng số ${sections?.length || 1} phần logic (Phase 2.7)`}
        >
          Section {currentSectionIndex} / {sections?.length || 1}
        </span>
        <span className="status-sep">|</span>
        <span
          className="status-item status-page-badge"
          title={`Trang ${currentPage} trên tổng số ${pageCount} trang vật lý (Hệ thống phân trang đa trang Phase 2.6)`}
        >
          Trang {currentPage} / {pageCount}
        </span>
        <span className="status-sep">|</span>
        <span
          className="status-item"
          title={`Khổ giấy: ${pageSettings.paperSize} · Hướng: ${orientationLabel} · Lề: ${pageSettings.marginPreset || "Custom"} (T:${pageSettings.margins.top}mm R:${pageSettings.margins.right}mm B:${pageSettings.margins.bottom}mm L:${pageSettings.margins.left}mm)`}
        >
          {pageSettings.paperSize} · {orientationLabel}
        </span>
        <span className="status-sep">|</span>
        <button
          type="button"
          className="status-item status-btn-interactive"
          title={
            selectionStats
              ? `Đang chọn: ${selectionStats.words.toLocaleString()} từ (${selectionStats.chars.toLocaleString()} ký tự) trên tổng số ${stats.words.toLocaleString()} từ. Nhấn để mở Thống kê tài liệu.`
              : "Số từ tính toán từ nội dung thực tế. Nhấn để mở Thống kê tài liệu (Ctrl+Shift+G)"
          }
          onClick={openStatisticsModal}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
            padding: "0 2px",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {selectionStats
            ? `Words: ${selectionStats.words.toLocaleString()} / ${stats.words.toLocaleString()}`
            : `Words: ${stats.words.toLocaleString()}`}
        </button>
        <span className="status-sep">|</span>
        <button
          type="button"
          className="status-item status-btn-interactive"
          title={
            selectionStats
              ? `Đang chọn: ${selectionStats.chars.toLocaleString()} ký tự trên tổng số ${stats.characters.toLocaleString()} ký tự. Nhấn để mở Thống kê tài liệu.`
              : "Số ký tự tính toán từ nội dung thực tế. Nhấn để mở Thống kê tài liệu"
          }
          onClick={openStatisticsModal}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "inherit",
            color: "inherit",
            padding: "0 2px",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {selectionStats
            ? `Characters: ${selectionStats.chars.toLocaleString()} / ${stats.characters.toLocaleString()}`
            : `Characters: ${stats.characters.toLocaleString()}`}
        </button>
        <span className="status-sep">|</span>
        <button
          type="button"
          className={`status-item status-btn-interactive ${trackChangesEnabled ? "status-track-active" : ""}`}
          title={
            trackChangesEnabled
              ? "Theo dõi thay đổi đang BẬT. Nhấp để TẮT (Ctrl+Shift+E)"
              : "Theo dõi thay đổi đang TẮT. Nhấp để BẬT (Ctrl+Shift+E)"
          }
          onClick={toggleTrackChanges}
          onMouseDown={(e) => e.preventDefault()}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "inherit",
            color: trackChangesEnabled ? "#2563eb" : "inherit",
            fontWeight: trackChangesEnabled ? 600 : "normal",
            padding: "0 2px",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {trackChangesEnabled ? "Track Changes: ON" : "Track Changes: OFF"}
        </button>
        <span className="status-sep">|</span>
        <span className="status-item" title="Đường dẫn tệp hiện tại">
          <span className="status-dot" aria-hidden="true" />
          <span style={{ marginLeft: "4px" }}>
            {filePath ? filePath.split(/[/\\]/).pop() : "Chưa lưu tệp"}
          </span>
          {isDirty && (
            <span
              style={{ color: "#f59e0b", marginLeft: "4px" }}
              title="Có thay đổi chưa lưu"
            >
              ●
            </span>
          )}
        </span>
      </div>

      <div className="status-bar-right">
        <div className="status-zoom-controls" aria-label="Bộ điều khiển thu phóng trang">
          <button
            type="button"
            className="status-zoom-val-btn"
            onClick={resetZoom}
            title="Mức thu phóng hiện tại. Nhấn để đặt lại 100%"
            onMouseDown={(e) => e.preventDefault()}
          >
            {zoom}%
          </button>
          <button
            type="button"
            className="status-zoom-btn"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            title="Thu nhỏ (50% - 200%)"
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Thu nhỏ trang"
          >
            <Minus size={13} />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="status-zoom-slider"
            title={`Mức thu phóng: ${zoom}%`}
            aria-label="Thanh trượt thu phóng trang"
          />
          <button
            type="button"
            className="status-zoom-btn"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            title="Phóng to (50% - 200%)"
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Phóng to trang"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </footer>
  );
}
