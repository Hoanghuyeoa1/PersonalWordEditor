import { useState, useEffect, useRef } from "react";
import {
  Clipboard,
  Scissors,
  Copy,
  Paintbrush,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Highlighter,
  Baseline,
  List,
  ListOrdered,
  Indent,
  Outdent,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Search,
  Replace,
  MousePointerClick,
  Undo2,
  Redo2,
  FileCode,
  ChevronDown,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import { useFindReplaceStore } from "../../stores/findReplaceStore";
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrike,
  setFontFamily,
  setFontSize,
  setTextColor,
  unsetTextColor,
  setTextHighlight,
  unsetTextHighlight,
  toggleBulletList,
  toggleOrderedList,
  undo,
  redo,
  canUndo,
  canRedo,
  isMarkActive,
  isListActive,
  getCurrentFontFamily,
  getCurrentFontSize,
  getCurrentTextColor,
  getCurrentHighlight,
  SUPPORTED_FONT_FAMILIES,
  FONT_SIZE_PRESETS,
  validateFontSize,
  setTextAlign,
  LINE_SPACING_PRESETS,
  setLineSpacing,
  indent,
  outdent,
  isAlignActive,
  getCurrentLineSpacing,
} from "../../editor/editorCommands";
import { StylesGallery } from "./StylesGallery";
import { StyleEditorDialog } from "../dialogs/StyleEditorDialog";
import { ManageStylesDialog } from "../dialogs/ManageStylesDialog";

interface HomeRibbonProps {
  onOpenJsonModal: () => void;
}

const TEXT_COLORS = [
  { label: "Mặc định", color: "" },
  { label: "Đen", color: "#0f172a" },
  { label: "Xám đậm", color: "#475569" },
  { label: "Đỏ", color: "#dc2626" },
  { label: "Cam", color: "#ea580c" },
  { label: "Hổ phách", color: "#d97706" },
  { label: "Xanh lá", color: "#16a34a" },
  { label: "Xanh dương", color: "#2563eb" },
  { label: "Chàm", color: "#4f46e5" },
  { label: "Tím", color: "#9333ea" },
];

const HIGHLIGHT_COLORS = [
  { label: "Không màu", color: "" },
  { label: "Vàng", color: "#fef08a" },
  { label: "Xanh lục", color: "#bbf7d0" },
  { label: "Xanh lam", color: "#a5f3fc" },
  { label: "Hồng", color: "#fbcfe8" },
  { label: "Cam nhạt", color: "#fed7aa" },
  { label: "Tím nhạt", color: "#e9d5ff" },
];

export function HomeRibbon({ onOpenJsonModal }: HomeRibbonProps) {
  const editor = useEditorStore((state) => state.editor);
  const [, setTx] = useState(0);

  // Trạng thái các popover
  const [showFontFamilyMenu, setShowFontFamilyMenu] = useState(false);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [showLineSpacingMenu, setShowLineSpacingMenu] = useState(false);
  const [customFontSizeInput, setCustomFontSizeInput] = useState("");

  // Trạng thái Modals Style Engine 2.0
  const [isStyleEditorOpen, setIsStyleEditorOpen] = useState(false);
  const [styleEditorMode, setStyleEditorMode] = useState<"create" | "modify">("create");
  const [editingStyleId, setEditingStyleId] = useState<string | undefined>(undefined);
  const [isManageStylesOpen, setIsManageStylesOpen] = useState(false);

  const handleOpenCreateStyle = () => {
    setStyleEditorMode("create");
    setEditingStyleId(undefined);
    setIsStyleEditorOpen(true);
  };

  const handleOpenModifyStyle = (styleId: string) => {
    setStyleEditorMode("modify");
    setEditingStyleId(styleId);
    setIsStyleEditorOpen(true);
  };

  const handleOpenManageStyles = () => {
    setIsManageStylesOpen(true);
  };

  const fontRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const lineSpacingRef = useRef<HTMLDivElement>(null);

  // Lắng nghe thay đổi transaction/selection trong editor để cập nhật trạng thái nút
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      setTx((c) => c + 1);
    };
    editor.on("transaction", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);
    return () => {
      editor.off("transaction", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  // Đóng popover khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (fontRef.current && !fontRef.current.contains(target)) setShowFontFamilyMenu(false);
      if (sizeRef.current && !sizeRef.current.contains(target)) setShowFontSizeMenu(false);
      if (colorRef.current && !colorRef.current.contains(target)) setShowColorMenu(false);
      if (highlightRef.current && !highlightRef.current.contains(target)) setShowHighlightMenu(false);
      if (lineSpacingRef.current && !lineSpacingRef.current.contains(target)) setShowLineSpacingMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Ngăn chặn mousedown làm mất focus/caret của editor
  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Trạng thái active hiện tại
  const hasUndo = canUndo(editor);
  const hasRedo = canRedo(editor);
  const isBold = isMarkActive(editor, "bold");
  const isItalic = isMarkActive(editor, "italic");
  const isUnderline = isMarkActive(editor, "underline");
  const isStrike = isMarkActive(editor, "strike");
  const isBullet = isListActive(editor, "bulletList");
  const isOrdered = isListActive(editor, "orderedList");

  // Trạng thái Paragraph & Alignment
  const isAlignLeft = isAlignActive(editor, "left");
  const isAlignCenter = isAlignActive(editor, "center");
  const isAlignRight = isAlignActive(editor, "right");
  const isAlignJustify = isAlignActive(editor, "justify");
  const currentLineSpacing = getCurrentLineSpacing(editor);

  // Font family & size hiện tại
  const activeFontFamilyValue = getCurrentFontFamily(editor);
  const currentFontFamily =
    SUPPORTED_FONT_FAMILIES.find((f) => f.value === activeFontFamilyValue)?.label ||
    SUPPORTED_FONT_FAMILIES.find((f) => activeFontFamilyValue?.includes(f.label))?.label ||
    "Calibri";

  const currentFontSize = getCurrentFontSize(editor) ?? 12;
  const currentTextColor = getCurrentTextColor(editor) || "#0f172a";
  const currentHighlight = getCurrentHighlight(editor);

  const handleApplyCustomSize = () => {
    if (!customFontSizeInput) return;
    const validated = validateFontSize(customFontSizeInput);
    if (validated !== null) {
      setFontSize(editor, validated);
    }
    setCustomFontSizeInput("");
    setShowFontSizeMenu(false);
  };

  return (
    <div className="ribbon-tab-content home-ribbon" role="toolbar" aria-label="Home Ribbon Toolbar">
      {/* Group: Clipboard */}
      <div className="ribbon-group" aria-label="Clipboard">
        <div className="ribbon-group-controls">
          <button
            type="button"
            className="ribbon-tool-btn large-btn"
            onMouseDown={preventBlur}
            onClick={async () => {
              if (editor) {
                editor.commands.focus();
                if (navigator.clipboard?.readText) {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) editor.commands.insertContent(text);
                  } catch {
                    document.execCommand("paste");
                  }
                } else {
                  document.execCommand("paste");
                }
              }
            }}
            title="Dán nội dung (Paste - Ctrl+V)"
          >
            <Clipboard size={22} />
            <span>Dán</span>
          </button>
          <div className="stacked-tools">
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={() => {
                if (editor) {
                  editor.commands.focus();
                  document.execCommand("cut");
                }
              }}
              title="Cắt vùng chọn (Cut - Ctrl+X)"
            >
              <Scissors size={14} />
              <span>Cắt</span>
            </button>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={() => {
                if (editor) {
                  editor.commands.focus();
                  document.execCommand("copy");
                }
              }}
              title="Sao chép (Copy - Ctrl+C)"
            >
              <Copy size={14} />
              <span>Sao chép</span>
            </button>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={() => {}}
              title="Sao chép định dạng (Format Painter - Phase sau)"
            >
              <Paintbrush size={14} />
              <span>Định dạng</span>
            </button>
          </div>
        </div>
        <div className="ribbon-group-label">Clipboard</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Group: Font (Phase 1.4 Hoàn thiện) */}
      <div className="ribbon-group" aria-label="Font">
        <div className="ribbon-group-controls">
          <div className="ribbon-row">
            {/* Font Family Selector */}
            <div className="popover-anchor" ref={fontRef}>
              <button
                type="button"
                className="ribbon-select-wrapper font-family-select"
                onMouseDown={preventBlur}
                onClick={() => setShowFontFamilyMenu(!showFontFamilyMenu)}
                title="Phông chữ (Font Family)"
                aria-expanded={showFontFamilyMenu}
              >
                <span className="select-text">{currentFontFamily}</span>
                <ChevronDown size={12} />
              </button>
              {showFontFamilyMenu && (
                <div className="ribbon-dropdown-menu font-family-menu" role="menu">
                  {SUPPORTED_FONT_FAMILIES.map((font) => (
                    <button
                      key={font.label}
                      type="button"
                      className={`ribbon-dropdown-item ${currentFontFamily === font.label ? "is-selected" : ""}`}
                      style={{ fontFamily: font.value }}
                      onMouseDown={preventBlur}
                      onClick={() => {
                        setFontFamily(editor, font.value);
                        setShowFontFamilyMenu(false);
                      }}
                    >
                      <span>{font.label}</span>
                      <span className="font-sample">AaBbCc</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Font Size Selector & Custom Input */}
            <div className="popover-anchor" ref={sizeRef}>
              <div className="font-size-combobox">
                <input
                  type="text"
                  className="font-size-input"
                  placeholder={String(currentFontSize)}
                  value={customFontSizeInput}
                  onChange={(e) => setCustomFontSizeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleApplyCustomSize();
                    }
                  }}
                  onBlur={handleApplyCustomSize}
                  title="Nhập cỡ chữ (pt) hoặc chọn từ danh sách"
                />
                <button
                  type="button"
                  className="font-size-dropdown-btn"
                  onMouseDown={preventBlur}
                  onClick={() => setShowFontSizeMenu(!showFontSizeMenu)}
                  title="Danh sách cỡ chữ"
                >
                  <ChevronDown size={11} />
                </button>
              </div>
              {showFontSizeMenu && (
                <div className="ribbon-dropdown-menu font-size-menu" role="menu">
                  {FONT_SIZE_PRESETS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`ribbon-dropdown-item font-size-item ${currentFontSize === size ? "is-selected" : ""}`}
                      onMouseDown={preventBlur}
                      onClick={() => {
                        setFontSize(editor, size);
                        setShowFontSizeMenu(false);
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="ribbon-row">
            {/* Bold */}
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isBold ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => toggleBold(editor)}
              title="In đậm (Bold - Ctrl+B)"
            >
              <Bold size={15} />
            </button>

            {/* Italic */}
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isItalic ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => toggleItalic(editor)}
              title="In nghiêng (Italic - Ctrl+I)"
            >
              <Italic size={15} />
            </button>

            {/* Underline */}
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isUnderline ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => toggleUnderline(editor)}
              title="Gạch chân (Underline - Ctrl+U)"
            >
              <Underline size={15} />
            </button>

            {/* Strikethrough */}
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isStrike ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => toggleStrike(editor)}
              title="Gạch ngang chữ (Strikethrough)"
            >
              <Strikethrough size={15} />
            </button>

            {/* Subscript / Superscript placeholders */}
            <button
              type="button"
              className="ribbon-tool-btn icon-btn"
              onMouseDown={preventBlur}
              onClick={() => {}}
              title="Chỉ số dưới (Subscript)"
            >
              <Subscript size={15} />
            </button>
            <button
              type="button"
              className="ribbon-tool-btn icon-btn"
              onMouseDown={preventBlur}
              onClick={() => {}}
              title="Chỉ số trên (Superscript)"
            >
              <Superscript size={15} />
            </button>

            {/* Highlight Color Picker */}
            <div className="popover-anchor" ref={highlightRef}>
              <button
                type="button"
                className={`ribbon-tool-btn icon-btn color-tool-btn ${currentHighlight ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => setShowHighlightMenu(!showHighlightMenu)}
                title="Màu làm nổi bật văn bản (Highlight)"
              >
                <Highlighter size={15} />
                <span
                  className="color-bar-indicator"
                  style={{ backgroundColor: currentHighlight || "#fef08a" }}
                />
              </button>
              {showHighlightMenu && (
                <div className="ribbon-dropdown-menu color-palette-menu" role="menu">
                  <div className="color-palette-title">Màu Highlight</div>
                  <div className="color-swatches-grid">
                    {HIGHLIGHT_COLORS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="color-swatch-btn"
                        style={{ backgroundColor: item.color || "#ffffff" }}
                        onMouseDown={preventBlur}
                        onClick={() => {
                          if (item.color) {
                            setTextHighlight(editor, item.color);
                          } else {
                            unsetTextHighlight(editor);
                          }
                          setShowHighlightMenu(false);
                        }}
                        title={item.label}
                      >
                        {!item.color && <span className="no-color-slash">/</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Text Color Picker */}
            <div className="popover-anchor" ref={colorRef}>
              <button
                type="button"
                className="ribbon-tool-btn icon-btn color-tool-btn"
                onMouseDown={preventBlur}
                onClick={() => setShowColorMenu(!showColorMenu)}
                title="Màu phông chữ (Font Color)"
              >
                <Baseline size={15} />
                <span
                  className="color-bar-indicator"
                  style={{ backgroundColor: currentTextColor }}
                />
              </button>
              {showColorMenu && (
                <div className="ribbon-dropdown-menu color-palette-menu" role="menu">
                  <div className="color-palette-title">Màu chữ</div>
                  <div className="color-swatches-grid">
                    {TEXT_COLORS.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className="color-swatch-btn"
                        style={{ backgroundColor: item.color || "#253147" }}
                        onMouseDown={preventBlur}
                        onClick={() => {
                          if (item.color) {
                            setTextColor(editor, item.color);
                          } else {
                            unsetTextColor(editor);
                          }
                          setShowColorMenu(false);
                        }}
                        title={item.label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="ribbon-group-label">Font</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Group: Paragraph */}
      <div className="ribbon-group" aria-label="Paragraph">
        <div className="ribbon-group-controls">
          <div className="ribbon-row">
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isBullet ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => toggleBulletList(editor)}
              title="Danh sách dấu chấm (Bullet List)"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isOrdered ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => toggleOrderedList(editor)}
              title="Danh sách đánh số (Numbering)"
            >
              <ListOrdered size={15} />
            </button>
            <button
              type="button"
              className="ribbon-tool-btn icon-btn"
              onMouseDown={preventBlur}
              onClick={() => outdent(editor)}
              title="Giảm thụt lề (Decrease Indent)"
            >
              <Outdent size={15} />
            </button>
            <button
              type="button"
              className="ribbon-tool-btn icon-btn"
              onMouseDown={preventBlur}
              onClick={() => indent(editor)}
              title="Tăng thụt lề (Increase Indent)"
            >
              <Indent size={15} />
            </button>
          </div>
          <div className="ribbon-row">
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isAlignLeft ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => setTextAlign(editor, "left")}
              title="Căn trái (Align Left)"
            >
              <AlignLeft size={15} />
            </button>
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isAlignCenter ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => setTextAlign(editor, "center")}
              title="Căn giữa (Align Center)"
            >
              <AlignCenter size={15} />
            </button>
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isAlignRight ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => setTextAlign(editor, "right")}
              title="Căn phải (Align Right)"
            >
              <AlignRight size={15} />
            </button>
            <button
              type="button"
              className={`ribbon-tool-btn icon-btn ${isAlignJustify ? "is-active" : ""}`}
              onMouseDown={preventBlur}
              onClick={() => setTextAlign(editor, "justify")}
              title="Căn đều hai bên (Justify)"
            >
              <AlignJustify size={15} />
            </button>

            {/* Line Spacing Popover */}
            <div className="popover-anchor" ref={lineSpacingRef}>
              <button
                type="button"
                className={`ribbon-tool-btn icon-btn ${showLineSpacingMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => setShowLineSpacingMenu(!showLineSpacingMenu)}
                title={`Khoảng cách dòng (Line Spacing: ${currentLineSpacing})`}
              >
                <ArrowUpDown size={15} />
              </button>
              {showLineSpacingMenu && (
                <div className="ribbon-dropdown-menu line-spacing-menu" role="menu">
                  <div className="line-spacing-header">Độ giãn dòng</div>
                  {LINE_SPACING_PRESETS.map((spacing) => {
                    const isActive = currentLineSpacing === spacing;
                    return (
                      <button
                        key={spacing}
                        type="button"
                        className={`line-spacing-item ${isActive ? "is-active" : ""}`}
                        onMouseDown={preventBlur}
                        onClick={() => {
                          setLineSpacing(editor, spacing);
                          setShowLineSpacingMenu(false);
                        }}
                      >
                        <span className="line-spacing-label">{spacing}</span>
                        {isActive && <Check size={14} className="line-spacing-check" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="ribbon-group-label">Paragraph</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Group: Styles 2.0 */}
      <StylesGallery
        editor={editor}
        onOpenCreateStyle={handleOpenCreateStyle}
        onOpenModifyStyle={handleOpenModifyStyle}
        onOpenManageStyles={handleOpenManageStyles}
      />

      <div className="ribbon-group-sep" />

      {/* Group: Editing */}
      <div className="ribbon-group" aria-label="Editing">
        <div className="ribbon-group-controls">
          <div className="stacked-tools">
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={() => useFindReplaceStore.getState().openFind()}
              title="Tìm kiếm (Find - Ctrl+F)"
            >
              <Search size={14} />
              <span>Tìm kiếm</span>
            </button>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={() => useFindReplaceStore.getState().openReplace()}
              title="Thay thế (Replace - Ctrl+H)"
            >
              <Replace size={14} />
              <span>Thay thế</span>
            </button>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={() => editor?.commands.selectAll()}
              title="Chọn tất cả (Select All - Ctrl+A)"
            >
              <MousePointerClick size={14} />
              <span>Chọn tất cả</span>
            </button>
          </div>
          <div className="stacked-tools undo-redo-stack">
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              disabled={!hasUndo}
              onMouseDown={preventBlur}
              onClick={() => undo(editor)}
              title="Hoàn tác (Undo - Ctrl+Z)"
            >
              <Undo2 size={14} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              disabled={!hasRedo}
              onMouseDown={preventBlur}
              onClick={() => redo(editor)}
              title="Làm lại (Redo - Ctrl+Y)"
            >
              <Redo2 size={14} />
              <span>Redo</span>
            </button>
            <button
              type="button"
              className="ribbon-tool-btn small-btn debug-json-btn"
              onMouseDown={preventBlur}
              onClick={onOpenJsonModal}
              title="Xem ProseMirror Document AST JSON"
            >
              <FileCode size={14} />
              <span>Xem JSON</span>
            </button>
          </div>
        </div>
        <div className="ribbon-group-label">Editing</div>
      </div>

      {/* Dialogs: Style Engine 2.0 */}
      {isStyleEditorOpen && (
        <StyleEditorDialog
          isOpen={isStyleEditorOpen}
          mode={styleEditorMode}
          styleId={editingStyleId}
          onClose={() => setIsStyleEditorOpen(false)}
          editor={editor}
        />
      )}

      {isManageStylesOpen && (
        <ManageStylesDialog
          isOpen={isManageStylesOpen}
          onClose={() => setIsManageStylesOpen(false)}
          editor={editor}
          onOpenCreateStyle={handleOpenCreateStyle}
          onOpenModifyStyle={handleOpenModifyStyle}
        />
      )}
    </div>
  );
}
