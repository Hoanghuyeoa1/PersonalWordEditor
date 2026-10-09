import {
  Maximize2,
  Compass,
  BookOpen,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { useFocusModeStore } from "../../stores/focusModeStore.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import { useZoomStore, MIN_ZOOM, MAX_ZOOM } from "../../stores/zoomStore.ts";

/**
 * ViewRibbon - Thanh công cụ Xem & Hiển thị (Tab View)
 *
 * Cung cấp:
 * 1. Views (Chế độ xem): Chế độ tập trung (Focus Mode - F11 / Ctrl+Shift+D)
 * 2. Show (Hiển thị): Sơ đồ đề mục (Outline), Chú thích (Notes), Bình luận (Comments)
 * 3. Zoom (Thu phóng): Zoom 100%, Phóng to, Thu nhỏ
 */
export function ViewRibbon() {
  const isFocusMode = useFocusModeStore((state) => state.isFocusMode);
  const toggleFocusMode = useFocusModeStore((state) => state.toggleFocusMode);

  const isCommentsSidebarOpen = useReviewStore((state) => state.isCommentsSidebarOpen);
  const setCommentsSidebarOpen = useReviewStore((state) => state.setCommentsSidebarOpen);

  const isReferencesPanelOpen = useReferencesStore((state) => state.isReferencesPanelOpen);
  const activeReferencePanel = useReferencesStore((state) => state.activeReferencePanel);
  const toggleReferencePanel = useReferencesStore((state) => state.toggleReferencePanel);

  const { zoom, zoomIn, zoomOut, resetZoom } = useZoomStore();

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const isOutlineOpen = isReferencesPanelOpen && activeReferencePanel === "outline";
  const isNotesOpen = isReferencesPanelOpen && activeReferencePanel === "notes";

  const handleToggleOutline = () => {
    toggleReferencePanel("outline");
  };

  const handleToggleNotes = () => {
    toggleReferencePanel("notes");
  };

  const handleToggleComments = () => {
    setCommentsSidebarOpen(!isCommentsSidebarOpen);
  };

  return (
    <div className="home-ribbon view-ribbon" role="toolbar" aria-label="View Toolbar">
      {/* 1. Nhóm Views (Chế độ xem) */}
      <div className="ribbon-group" role="group" aria-label="Views">
        <div className="ribbon-group-controls">
          <button
            type="button"
            className={`ribbon-large-btn ${isFocusMode ? "is-active" : ""}`}
            onMouseDown={preventBlur}
            onClick={toggleFocusMode}
            title="Bật/Tắt chế độ soạn thảo tập trung không gây xao nhãng (F11 / Ctrl+Shift+D)"
            aria-label="Chế độ tập trung (Focus Mode)"
          >
            <div className="ribbon-large-icon">
              <Maximize2 size={20} />
            </div>
            <div className="ribbon-large-label">
              <span>Focus Mode</span>
              <div className="ribbon-btn-sublabel">
                <span>F11</span>
              </div>
            </div>
          </button>
        </div>
        <div className="ribbon-group-title">Chế độ xem</div>
      </div>

      {/* 2. Nhóm Show (Hiển thị thanh bên) */}
      <div className="ribbon-group" role="group" aria-label="Show">
        <div className="ribbon-group-controls" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <button
            type="button"
            className={`ribbon-tool-btn small-btn ${isOutlineOpen ? "is-active" : ""}`}
            onMouseDown={preventBlur}
            onClick={handleToggleOutline}
            title="Bật/Tắt sơ đồ đề mục cấu trúc tài liệu bên lề"
            aria-label="Sơ đồ đề mục"
          >
            <Compass size={14} />
            <span>Sơ đồ đề mục</span>
          </button>
          <button
            type="button"
            className={`ribbon-tool-btn small-btn ${isNotesOpen ? "is-active" : ""}`}
            onMouseDown={preventBlur}
            onClick={handleToggleNotes}
            title="Bật/Tắt bảng quản lý Footnotes & Endnotes bên lề"
            aria-label="Bảng chú thích"
          >
            <BookOpen size={14} />
            <span>Bảng chú thích</span>
          </button>
          <button
            type="button"
            className={`ribbon-tool-btn small-btn ${isCommentsSidebarOpen ? "is-active" : ""}`}
            onMouseDown={preventBlur}
            onClick={handleToggleComments}
            title="Bật/Tắt thanh bên quản lý bình luận"
            aria-label="Bảng bình luận"
          >
            <MessageSquare size={14} />
            <span>Bình luận</span>
          </button>
        </div>
        <div className="ribbon-group-title">Hiển thị</div>
      </div>

      {/* 3. Nhóm Zoom (Thu phóng) */}
      <div className="ribbon-group" role="group" aria-label="Zoom">
        <div className="ribbon-group-controls">
          <button
            type="button"
            className={`ribbon-large-btn ${zoom === 100 ? "is-active" : ""}`}
            onMouseDown={preventBlur}
            onClick={resetZoom}
            title="Đặt lại mức thu phóng trang về 100% (Ctrl+0)"
            aria-label="Thu phóng 100%"
          >
            <div className="ribbon-large-icon">
              <RotateCcw size={20} />
            </div>
            <div className="ribbon-large-label">
              <span>100%</span>
              <div className="ribbon-btn-sublabel">
                <span>{zoom}%</span>
              </div>
            </div>
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              title="Phóng to trang tài liệu (Ctrl++)"
              aria-label="Phóng to"
            >
              <ZoomIn size={14} />
              <span>Phóng to</span>
            </button>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              title="Thu nhỏ trang tài liệu (Ctrl+-)"
              aria-label="Thu nhỏ"
            >
              <ZoomOut size={14} />
              <span>Thu nhỏ</span>
            </button>
          </div>
        </div>
        <div className="ribbon-group-title">Thu phóng</div>
      </div>
    </div>
  );
}
