import React, { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  Check,
  Maximize2,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import { usePageSettings } from "../../page/hooks/usePageSettings.ts";
import { useEditorStore } from "../../stores/editorStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import type { PaperSizeName, PageOrientation, MarginPresetName } from "../../page/types/pageTypes.ts";
import {
  MARGIN_PRESETS,
  SUPPORTED_PAPER_SIZES,
} from "../../page/services/pageConstants.ts";
import { getPageDimensions } from "../../page/services/pageSettingsService.ts";
import { insertPageBreak, insertSectionBreak } from "../../editor/editorCommands.ts";

import { CustomMarginsDialog } from "../dialogs/CustomMarginsDialog.tsx";

/**
 * Mô tả nguồn gốc và chuẩn của các khổ giấy văn phòng phổ biến.
 */
const PAPER_SIZE_DESCRIPTIONS: Record<PaperSizeName, { label: string; desc: string }> = {
  A4: {
    label: "A4",
    desc: "Chuẩn quốc tế ISO 216 phổ biến",
  },
  A3: {
    label: "A3",
    desc: "Bản vẽ, bảng tính & báo cáo lớn",
  },
  Letter: {
    label: "Letter",
    desc: "Khổ chuẩn Bắc Mỹ (8.5 × 11 in)",
  },
  Legal: {
    label: "Legal",
    desc: "Tài liệu pháp lý (8.5 × 14 in)",
  },
};

/**
 * LayoutRibbon: Thanh công cụ bố cục trang (Layout) cho Personal Word Editor.
 *
 * Nhóm Page Setup:
 * 1. Orientation dropdown (Portrait / Landscape)
 * 2. Size dropdown (A4, A3, Letter, Legal)
 * 3. Margins dropdown (Normal, Narrow, Wide, Custom Margins...)
 *
 * Tính năng UX:
 * - Đóng menu khi chọn xong
 * - Đóng menu khi nhấn phím Escape
 * - Đóng menu khi nhấp ra bên ngoài
 * - Áp dụng preventBlur ngăn mất focus/selection trong editor
 * - Không can thiệp trực tiếp vào DOM CSS (điều khiển qua Store -> PageRenderer)
 */
export function LayoutRibbon() {
  const {
    pageSettings,
    dimensions,
    setPaperSize,
    setOrientation,
    setMarginPreset,
    setMargins,
  } = usePageSettings();

  const editor = useEditorStore((state) => state.editor);
  const currentSectionIndex = useDocumentStore((state) => state.currentSectionIndex);
  const sections = useDocumentStore((state) => state.sections);

  const [showOrientationMenu, setShowOrientationMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showMarginsMenu, setShowMarginsMenu] = useState(false);
  const [showBreaksMenu, setShowBreaksMenu] = useState(false);
  const [showCustomMarginsDialog, setShowCustomMarginsDialog] = useState(false);

  const orientationRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const marginsRef = useRef<HTMLDivElement>(null);
  const breaksRef = useRef<HTMLDivElement>(null);

  // Đóng popover khi nhấp ra bên ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (orientationRef.current && !orientationRef.current.contains(target)) {
        setShowOrientationMenu(false);
      }
      if (sizeRef.current && !sizeRef.current.contains(target)) {
        setShowSizeMenu(false);
      }
      if (marginsRef.current && !marginsRef.current.contains(target)) {
        setShowMarginsMenu(false);
      }
      if (breaksRef.current && !breaksRef.current.contains(target)) {
        setShowBreaksMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Đóng popover khi nhấn phím Escape và giữ focus cho editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showOrientationMenu || showSizeMenu || showMarginsMenu || showBreaksMenu) {
          e.preventDefault();
          setShowOrientationMenu(false);
          setShowSizeMenu(false);
          setShowMarginsMenu(false);
          setShowBreaksMenu(false);
          if (editor) {
            editor.commands.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showOrientationMenu, showSizeMenu, showMarginsMenu, showBreaksMenu, editor]);

  // Ngăn mất focus của Editor khi nhấp chuột vào công cụ Ribbon
  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Xử lý chọn Orientation
  const handleSelectOrientation = (orient: PageOrientation) => {
    setOrientation(orient);
    setShowOrientationMenu(false);
    if (editor) {
      editor.commands.focus();
    }
  };

  // Xử lý chọn Paper Size
  const handleSelectSize = (size: PaperSizeName) => {
    setPaperSize(size);
    setShowSizeMenu(false);
    if (editor) {
      editor.commands.focus();
    }
  };

  // Xử lý chọn Margin Preset
  const handleSelectMarginPreset = (preset: MarginPresetName) => {
    if (preset === "Custom") return;
    setMarginPreset(preset);
    setShowMarginsMenu(false);
    if (editor) {
      editor.commands.focus();
    }
  };

  // Xử lý chèn ngắt trang semantic (Page Break - Phase 2.5)
  const handleInsertPageBreak = () => {
    setShowBreaksMenu(false);
    if (editor) {
      insertPageBreak(editor);
      editor.commands.focus();
    }
  };

  // Xử lý chèn ngắt phần semantic (Section Break Next Page - Phase 2.7)
  const handleInsertSectionBreak = () => {
    setShowBreaksMenu(false);
    if (editor) {
      insertSectionBreak(editor, {
        pageSettings: { ...pageSettings },
      });
      editor.commands.focus();
    }
  };

  const isPortrait = pageSettings.orientation === "portrait";
  const orientationLabel = isPortrait ? "Dọc (Portrait)" : "Ngang (Landscape)";

  return (
    <div className="ribbon-tab-content layout-ribbon" role="toolbar" aria-label="Layout Tools">
      {/* Group: Page Setup (Thiết lập trang) */}
      <div className="ribbon-group" aria-label="Page Setup">
        <div className="ribbon-group-controls">
          <div className="ribbon-row layout-controls-row">
            {/* 1. Nút chọn Hướng trang (Orientation) */}
            <div className="popover-anchor" ref={orientationRef}>
              <button
                type="button"
                className={`ribbon-large-btn ${showOrientationMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowOrientationMenu(!showOrientationMenu);
                  setShowSizeMenu(false);
                  setShowMarginsMenu(false);
                  setShowBreaksMenu(false);
                }}
                title="Thay đổi hướng trang (Portrait hoặc Landscape)"
                aria-haspopup="menu"
                aria-expanded={showOrientationMenu}
                aria-label={`Hướng trang hiện tại: ${orientationLabel}`}
              >
                <div className="ribbon-large-icon">
                  {isPortrait ? (
                    <svg
                      width="20"
                      height="24"
                      viewBox="0 0 18 22"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <rect x="2" y="2" width="14" height="18" rx="2" />
                      <line x1="5" y1="6" x2="13" y2="6" />
                      <line x1="5" y1="10" x2="13" y2="10" />
                      <line x1="5" y1="14" x2="10" y2="14" />
                    </svg>
                  ) : (
                    <svg
                      width="24"
                      height="20"
                      viewBox="0 0 22 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <rect x="2" y="2" width="18" height="14" rx="2" />
                      <line x1="5" y1="6" x2="17" y2="6" />
                      <line x1="5" y1="10" x2="17" y2="10" />
                    </svg>
                  )}
                </div>
                <div className="ribbon-large-label">
                  <span>Orientation</span>
                  <div className="ribbon-btn-sublabel">
                    <span>{isPortrait ? "Portrait" : "Landscape"}</span>
                    <ChevronDown size={11} style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </button>

              {showOrientationMenu && (
                <div className="ribbon-dropdown-menu layout-dropdown-menu" role="menu" aria-label="Menu chọn hướng trang">
                  <div className="ribbon-dropdown-header">Hướng trang</div>
                  <button
                    type="button"
                    role="menuitem"
                    aria-checked={isPortrait}
                    className={`layout-menu-item ${isPortrait ? "is-active" : ""}`}
                    onMouseDown={preventBlur}
                    onClick={() => handleSelectOrientation("portrait")}
                  >
                    <div className="layout-item-icon">
                      <svg
                        width="18"
                        height="22"
                        viewBox="0 0 18 22"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        aria-hidden="true"
                      >
                        <rect x="2" y="2" width="14" height="18" rx="2" />
                        <line x1="5" y1="6" x2="13" y2="6" />
                        <line x1="5" y1="10" x2="13" y2="10" />
                      </svg>
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Portrait (Dọc)</span>
                      <span className="layout-item-desc">Chiều rộng &lt; Chiều cao (Trang đứng)</span>
                    </div>
                    {isPortrait && <Check size={16} className="layout-item-check" aria-label="Đang chọn" />}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    aria-checked={!isPortrait}
                    className={`layout-menu-item ${!isPortrait ? "is-active" : ""}`}
                    onMouseDown={preventBlur}
                    onClick={() => handleSelectOrientation("landscape")}
                  >
                    <div className="layout-item-icon">
                      <svg
                        width="22"
                        height="18"
                        viewBox="0 0 22 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        aria-hidden="true"
                      >
                        <rect x="2" y="2" width="18" height="14" rx="2" />
                        <line x1="5" y1="6" x2="17" y2="6" />
                        <line x1="5" y1="10" x2="17" y2="10" />
                      </svg>
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Landscape (Ngang)</span>
                      <span className="layout-item-desc">Chiều rộng &gt; Chiều cao (Trang ngang)</span>
                    </div>
                    {!isPortrait && <Check size={16} className="layout-item-check" aria-label="Đang chọn" />}
                  </button>
                </div>
              )}
            </div>

            {/* 2. Nút chọn Khổ giấy (Size) */}
            <div className="popover-anchor" ref={sizeRef}>
              <button
                type="button"
                className={`ribbon-large-btn ${showSizeMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowSizeMenu(!showSizeMenu);
                  setShowOrientationMenu(false);
                  setShowMarginsMenu(false);
                  setShowBreaksMenu(false);
                }}
                title="Chọn khổ giấy (A4, A3, Letter, Legal)"
                aria-haspopup="menu"
                aria-expanded={showSizeMenu}
                aria-label={`Khổ giấy hiện tại: ${pageSettings.paperSize}`}
              >
                <div className="ribbon-large-icon">
                  <FileText size={22} />
                </div>
                <div className="ribbon-large-label">
                  <span>Size</span>
                  <div className="ribbon-btn-sublabel">
                    <span>{pageSettings.paperSize}</span>
                    <ChevronDown size={11} style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </button>

              {showSizeMenu && (
                <div className="ribbon-dropdown-menu layout-dropdown-menu" role="menu" aria-label="Menu chọn khổ giấy">
                  <div className="ribbon-dropdown-header">Khổ giấy tiêu chuẩn</div>
                  {SUPPORTED_PAPER_SIZES.map((size) => {
                    const info = PAPER_SIZE_DESCRIPTIONS[size];
                    const isActive = pageSettings.paperSize === size;
                    // Tính kích thước hiển thị theo hướng trang hiện tại
                    const curDim = getPageDimensions(size, pageSettings.orientation);
                    const dimensionsText = `${curDim.width} × ${curDim.height} mm`;

                    return (
                      <button
                        key={size}
                        type="button"
                        role="menuitem"
                        aria-checked={isActive}
                        className={`layout-menu-item ${isActive ? "is-active" : ""}`}
                        onMouseDown={preventBlur}
                        onClick={() => handleSelectSize(size)}
                      >
                        <div className="layout-item-icon">
                          <Maximize2 size={16} />
                        </div>
                        <div className="layout-item-text">
                          <div className="layout-item-header">
                            <span className="layout-item-title">{info.label}</span>
                            <span className="layout-item-dim">{dimensionsText}</span>
                          </div>
                          <span className="layout-item-desc">{info.desc}</span>
                        </div>
                        {isActive && <Check size={16} className="layout-item-check" aria-label="Đang chọn" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Nút chọn Lề trang (Margins) */}
            <div className="popover-anchor" ref={marginsRef}>
              <button
                type="button"
                className={`ribbon-large-btn ${showMarginsMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowMarginsMenu(!showMarginsMenu);
                  setShowOrientationMenu(false);
                  setShowSizeMenu(false);
                  setShowBreaksMenu(false);
                }}
                title="Chọn khoảng cách lề trang (Margins)"
                aria-haspopup="menu"
                aria-expanded={showMarginsMenu}
                aria-label={`Lề trang hiện tại: ${pageSettings.marginPreset || "Custom"}`}
              >
                <div className="ribbon-large-icon">
                  <SlidersHorizontal size={22} />
                </div>
                <div className="ribbon-large-label">
                  <span>Margins</span>
                  <div className="ribbon-btn-sublabel">
                    <span>{pageSettings.marginPreset || "Custom"}</span>
                    <ChevronDown size={11} style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </button>

              {showMarginsMenu && (
                <div className="ribbon-dropdown-menu layout-dropdown-menu" role="menu" aria-label="Menu chọn khoảng cách lề">
                  <div className="ribbon-dropdown-header">Thiết lập lề trang tiêu chuẩn</div>
                  {(["Normal", "Narrow", "Wide"] as const).map((preset) => {
                    const isActive = pageSettings.marginPreset === preset;
                    const m = MARGIN_PRESETS[preset];
                    return (
                      <button
                        key={preset}
                        type="button"
                        role="menuitem"
                        aria-checked={isActive}
                        className={`layout-menu-item ${isActive ? "is-active" : ""}`}
                        onMouseDown={preventBlur}
                        onClick={() => handleSelectMarginPreset(preset)}
                      >
                        <div className="layout-item-text">
                          <span className="layout-item-title">{preset}</span>
                          <span className="layout-item-desc">
                            Trên: {m.top}mm · Dưới: {m.bottom}mm · Trái: {m.left}mm · Phải: {m.right}mm
                          </span>
                        </div>
                        {isActive && <Check size={16} className="layout-item-check" aria-label="Đang chọn" />}
                      </button>
                    );
                  })}

                  <div className="layout-menu-sep" />

                  {/* Tùy chọn Custom Margins... */}
                  <button
                    type="button"
                    role="menuitem"
                    aria-checked={pageSettings.marginPreset === "Custom"}
                    className={`layout-menu-item ${pageSettings.marginPreset === "Custom" ? "is-active" : ""}`}
                    onMouseDown={preventBlur}
                    onClick={() => {
                      setShowMarginsMenu(false);
                      setShowCustomMarginsDialog(true);
                    }}
                  >
                    <div className="layout-item-icon">
                      <SlidersHorizontal size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Custom Margins...</span>
                      <span className="layout-item-desc">
                        Tùy chỉnh khoảng cách lề trên, dưới, trái, phải (cm)
                      </span>
                    </div>
                    {pageSettings.marginPreset === "Custom" && (
                      <Check size={16} className="layout-item-check" aria-label="Đang chọn" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* 4. Nút chọn Ngắt trang (Breaks) - Phase 2.5 */}
            <div className="popover-anchor" ref={breaksRef}>
              <button
                type="button"
                className={`ribbon-large-btn ${showBreaksMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowBreaksMenu(!showBreaksMenu);
                  setShowOrientationMenu(false);
                  setShowSizeMenu(false);
                  setShowMarginsMenu(false);
                }}
                title="Chèn dấu ngắt trang (Breaks - Ctrl+Enter)"
                aria-haspopup="menu"
                aria-expanded={showBreaksMenu}
                aria-label="Ngắt trang (Breaks)"
              >
                <div className="ribbon-large-icon">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v6" />
                    <path d="M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
                    <path d="M14 2v4a2 2 0 0 0 2 2h4v2" />
                    <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 3" />
                  </svg>
                </div>
                <div className="ribbon-large-label">
                  <span>Breaks</span>
                  <div className="ribbon-btn-sublabel">
                    <span>Page Break</span>
                    <ChevronDown size={11} style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </button>

              {showBreaksMenu && (
                <div className="ribbon-dropdown-menu layout-dropdown-menu" role="menu" aria-label="Menu ngắt trang">
                  <div className="ribbon-dropdown-header">Page Breaks (Ngắt trang)</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={handleInsertPageBreak}
                  >
                    <div className="layout-item-icon">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v6" />
                        <path d="M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
                        <path d="M14 2v4a2 2 0 0 0 2 2h4v2" />
                        <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 3" />
                      </svg>
                    </div>
                    <div className="layout-item-text">
                      <div className="layout-item-header">
                        <span className="layout-item-title">Page Break</span>
                        <span className="layout-shortcut-badge">Ctrl+Enter</span>
                      </div>
                      <span className="layout-item-desc">
                        Đánh dấu kết thúc trang hiện tại và bắt đầu trang tiếp theo
                      </span>
                    </div>
                  </button>

                  <div className="layout-menu-sep" />

                  <div className="ribbon-dropdown-header">Section Breaks (Ngắt phần)</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={handleInsertSectionBreak}
                  >
                    <div className="layout-item-icon">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v6" />
                        <path d="M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
                        <path d="M14 2v4a2 2 0 0 0 2 2h4v2" />
                        <line x1="2" y1="11" x2="22" y2="11" strokeDasharray="2 2" stroke="#2563eb" />
                        <line x1="2" y1="14" x2="22" y2="14" strokeDasharray="2 2" stroke="#2563eb" />
                      </svg>
                    </div>
                    <div className="layout-item-text">
                      <div className="layout-item-header">
                        <span className="layout-item-title">Section Break (Next Page)</span>
                      </div>
                      <span className="layout-item-desc">
                        Bắt đầu phần mới trên trang tiếp theo với cấu hình trang riêng
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="ribbon-group-label">Page Setup</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Group: Thông tin trang hiện tại (Page Status) */}
      <div className="ribbon-group" aria-label="Page Information">
        <div className="ribbon-group-controls">
          <div className="layout-info-panel">
            <div className="layout-info-badge">
              <span className="layout-info-badge-title">Section</span>
              <span className="layout-info-badge-val">
                Mục {currentSectionIndex} / {sections.length || 1}
              </span>
            </div>
            <div className="layout-info-badge">
              <span className="layout-info-badge-title">Kích thước vật lý</span>
              <span className="layout-info-badge-val">
                {dimensions.width} × {dimensions.height} mm
              </span>
            </div>
            <div className="layout-info-badge">
              <span className="layout-info-badge-title">Khổ &amp; Hướng</span>
              <span className="layout-info-badge-val">
                {pageSettings.paperSize} · {orientationLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="ribbon-group-label">Page Status</div>
      </div>


      {/* Hộp thoại Custom Margins Dialog */}
      <CustomMarginsDialog
        isOpen={showCustomMarginsDialog}
        initialMargins={pageSettings.margins}
        paperSize={pageSettings.paperSize}
        orientation={pageSettings.orientation}
        onClose={() => {
          setShowCustomMarginsDialog(false);
          if (editor) {
            editor.commands.focus();
          }
        }}
        onApply={(newMargins) => {
          setMargins(newMargins);
          setShowCustomMarginsDialog(false);
          if (editor) {
            editor.commands.focus();
          }
        }}
      />
    </div>
  );
}

export default LayoutRibbon;
