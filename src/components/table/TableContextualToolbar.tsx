import { useState, useRef, useEffect } from "react";
import {
  Table as TableIcon,
  Combine,
  Split,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Rows,
  AlignLeft,
  AlignCenter,
  AlignRight,
  PaintBucket,
  Grid,
  Square,
  SquareDashed,
  ChevronDown,
  Check,
  Maximize2,
  Minimize2,
  Columns,
  StretchHorizontal,
  Sliders,
  Palette,
  Repeat,
} from "lucide-react";
import {
  useTableToolbarState,
  preventBlur,
  CELL_MARGIN_PRESETS,
  validateCellMargins,
  validateRowHeight,
} from "./useTableToolbarState.ts";
import type {
  TableStyleId,
  RowHeightRule,
} from "../../editor/editorCommands.ts";

const CELL_COLOR_PALETTE = [
  { label: "Không màu", value: null, bg: "#ffffff", border: "#cbd5e1" },
  { label: "Xám nhạt", value: "#f1f5f9", bg: "#f1f5f9", border: "#cbd5e1" },
  { label: "Đỏ pastel", value: "#fee2e2", bg: "#fee2e2", border: "#fca5a5" },
  { label: "Vàng pastel", value: "#fef3c7", bg: "#fef3c7", border: "#fcd34d" },
  { label: "Xanh lá", value: "#dcfce7", bg: "#dcfce7", border: "#86efac" },
  { label: "Xanh dương", value: "#dbeafe", bg: "#dbeafe", border: "#93c5fd" },
  { label: "Tím pastel", value: "#ede9fe", bg: "#ede9fe", border: "#c4b5fd" },
];

/**
 * TABLE CONTEXTUAL TOOLBAR 2.0 (PHASE 7)
 * Giao diện công cụ Bảng ngữ nghĩa gồm 6 nhóm gọn gàng:
 * 1. Rows & Columns (Thêm/Xóa hàng & cột, Tiêu đề)
 * 2. Merge (Hợp nhất / Tách ô với trạng thái disabled chuẩn)
 * 3. Cell (Căn lề ngang/dọc, Màu nền Shading, Đường viền)
 * 4. Size (Phân phối cột/hàng, Lề ô Margins, Chiều cao hàng Row Height)
 * 5. AutoFit (AutoFit Contents, AutoFit Window, Fixed Column Width)
 * 6. Styles (Thư viện Table Style Gallery và tùy chọn hàng so le)
 */
export function TableContextualToolbar() {
  const {
    isTableActive,
    canMerge,
    canSplit,
    canDistributeCols,
    canDistributeRows,
    layoutMode,
    tableStyleInfo,
    allTableStyles,
    currentBorders,
    currentMargins,
    currentRowHeight,
    repeatHeader,
    // Actions
    onMergeCells,
    onSplitCell,
    onAutoFitContents,
    onAutoFitWindow,
    onSetFixedColumnWidths,
    onDistributeColumns,
    onDistributeRows,
    onSetCellMargins,
    onSetRowHeight,
    onApplyTableStyle,
    onSetTableStyleOptions,
    onToggleHeaderRow,
    onToggleRepeatHeader,
    onAddRowAbove,
    onAddRowBelow,
    onDeleteRow,
    onAddColumnLeft,
    onAddColumnRight,
    onDeleteColumn,
    onDeleteTable,
    onSetCellTextAlign,
    onSetCellVerticalAlign,
    onSetCellBackgroundColor,
    onSetTableBorders,
  } = useTableToolbarState();

  // Dropdown states
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBorderMenu, setShowBorderMenu] = useState(false);
  const [showAutoFitMenu, setShowAutoFitMenu] = useState(false);
  const [showMarginsDialog, setShowMarginsDialog] = useState(false);
  const [showRowHeightDialog, setShowRowHeightDialog] = useState(false);
  const [showStyleGallery, setShowStyleGallery] = useState(false);

  // Form states cho Margins
  const [customMargins, setCustomMargins] = useState({
    top: currentMargins.top,
    bottom: currentMargins.bottom,
    left: currentMargins.left,
    right: currentMargins.right,
  });
  const [cellOverrideOnly, setCellOverrideOnly] = useState(false);

  // Form states cho Row Height
  const [rowHeightRule, setRowHeightRule] = useState<RowHeightRule>(
    currentRowHeight.rule || "auto"
  );
  const [rowHeightVal, setRowHeightVal] = useState<number>(
    currentRowHeight.height || 36
  );

  // Đồng bộ form khi currentMargins hoặc currentRowHeight thay đổi
  useEffect(() => {
    setCustomMargins({
      top: currentMargins.top,
      bottom: currentMargins.bottom,
      left: currentMargins.left,
      right: currentMargins.right,
    });
  }, [currentMargins]);

  useEffect(() => {
    setRowHeightRule(currentRowHeight.rule || "auto");
    if (currentRowHeight.height) {
      setRowHeightVal(currentRowHeight.height);
    }
  }, [currentRowHeight]);

  // Click outside listener
  const colorRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const autoFitRef = useRef<HTMLDivElement>(null);
  const marginsRef = useRef<HTMLDivElement>(null);
  const rowHeightRef = useRef<HTMLDivElement>(null);
  const styleGalleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (colorRef.current && !colorRef.current.contains(target)) setShowColorPicker(false);
      if (borderRef.current && !borderRef.current.contains(target)) setShowBorderMenu(false);
      if (autoFitRef.current && !autoFitRef.current.contains(target)) setShowAutoFitMenu(false);
      if (marginsRef.current && !marginsRef.current.contains(target)) setShowMarginsDialog(false);
      if (rowHeightRef.current && !rowHeightRef.current.contains(target)) setShowRowHeightDialog(false);
      if (styleGalleryRef.current && !styleGalleryRef.current.contains(target)) setShowStyleGallery(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowColorPicker(false);
        setShowBorderMenu(false);
        setShowAutoFitMenu(false);
        setShowMarginsDialog(false);
        setShowRowHeightDialog(false);
        setShowStyleGallery(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!isTableActive) {
    return null;
  }

  return (
    <div
      className="table-contextual-bar"
      role="toolbar"
      aria-label="Công cụ thiết kế và bố cục bảng (Table Tools)"
      onMouseDown={preventBlur}
    >
      <div className="table-contextual-badge">
        <TableIcon size={14} color="#2563eb" />
        <span>Công cụ Bảng</span>
      </div>

      <div className="table-contextual-divider" />

      {/* ===================================================================
          NHÓM 1: MERGE & SPLIT
          =================================================================== */}
      <div className="table-contextual-group" title="Hợp nhất / Tách ô">
        <button
          type="button"
          className="table-tool-btn"
          disabled={!canMerge}
          onClick={onMergeCells}
          onMouseDown={preventBlur}
          title={
            canMerge
              ? "Hợp nhất các ô đang chọn thành 1 ô (Merge Cells)"
              : "Hợp nhất ô (Chọn từ 2 ô trở lên để hợp nhất)"
          }
          aria-label="Hợp nhất ô"
        >
          <Combine size={14} />
          <span>Hợp ô</span>
        </button>

        <button
          type="button"
          className="table-tool-btn"
          disabled={!canSplit}
          onClick={onSplitCell}
          onMouseDown={preventBlur}
          title={
            canSplit
              ? "Tách ô đã gộp thành các ô đơn ban đầu (Split Cell)"
              : "Tách ô (Chỉ khả dụng trên ô đã hợp nhất)"
          }
          aria-label="Tách ô"
        >
          <Split size={14} />
          <span>Tách ô</span>
        </button>
      </div>

      <div className="table-contextual-divider" />

      {/* ===================================================================
          NHÓM 2: CELL (CĂN LỀ, MÀU NỀN, VIỀN)
          =================================================================== */}
      <div className="table-contextual-group" title="Căn lề và Màu sắc">
        <button
          type="button"
          className="table-tool-btn table-tool-icon-only"
          onClick={() => onSetCellTextAlign("left")}
          onMouseDown={preventBlur}
          title="Căn trái ô"
          aria-label="Căn trái"
        >
          <AlignLeft size={14} />
        </button>
        <button
          type="button"
          className="table-tool-btn table-tool-icon-only"
          onClick={() => onSetCellTextAlign("center")}
          onMouseDown={preventBlur}
          title="Căn giữa ô"
          aria-label="Căn giữa"
        >
          <AlignCenter size={14} />
        </button>
        <button
          type="button"
          className="table-tool-btn table-tool-icon-only"
          onClick={() => onSetCellTextAlign("right")}
          onMouseDown={preventBlur}
          title="Căn phải ô"
          aria-label="Căn phải"
        >
          <AlignRight size={14} />
        </button>

        <div className="table-mini-sep" />

        <button
          type="button"
          className="table-tool-btn"
          onClick={() => onSetCellVerticalAlign("top")}
          onMouseDown={preventBlur}
          title="Căn đỉnh ô (Top)"
        >
          <span>Đỉnh</span>
        </button>
        <button
          type="button"
          className="table-tool-btn"
          onClick={() => onSetCellVerticalAlign("middle")}
          onMouseDown={preventBlur}
          title="Căn giữa dọc ô (Middle)"
        >
          <span>Giữa</span>
        </button>
        <button
          type="button"
          className="table-tool-btn"
          onClick={() => onSetCellVerticalAlign("bottom")}
          onMouseDown={preventBlur}
          title="Căn đáy ô (Bottom)"
        >
          <span>Đáy</span>
        </button>
      </div>

      {/* Màu nền Shading */}
      <div className="table-contextual-group" ref={colorRef}>
        <button
          type="button"
          className={`table-tool-btn ${showColorPicker ? "active" : ""}`}
          onClick={() => setShowColorPicker((prev) => !prev)}
          onMouseDown={preventBlur}
          title="Màu nền ô (Cell Shading)"
          aria-haspopup="true"
          aria-expanded={showColorPicker}
        >
          <PaintBucket size={14} />
          <span>Màu nền</span>
          <ChevronDown size={10} style={{ marginLeft: 2 }} />
        </button>

        {showColorPicker && (
          <div className="table-color-picker-dropdown" role="menu">
            <span className="table-dropdown-header">Chọn màu nền ô</span>
            <div className="table-palette-grid">
              {CELL_COLOR_PALETTE.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="table-color-swatch"
                  style={{ backgroundColor: item.bg, borderColor: item.border }}
                  onClick={() => {
                    onSetCellBackgroundColor(item.value);
                    setShowColorPicker(false);
                  }}
                  onMouseDown={preventBlur}
                  title={item.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Viền Bảng */}
      <div className="table-contextual-group" ref={borderRef}>
        <button
          type="button"
          className={`table-tool-btn ${showBorderMenu ? "active" : ""}`}
          onClick={() => setShowBorderMenu((prev) => !prev)}
          onMouseDown={preventBlur}
          title="Kiểu viền bảng (Table Borders)"
          aria-haspopup="true"
          aria-expanded={showBorderMenu}
        >
          <Grid size={14} />
          <span>
            {currentBorders === "none"
              ? "Không viền"
              : currentBorders === "outside"
              ? "Viền ngoài"
              : "Tất cả viền"}
          </span>
          <ChevronDown size={10} style={{ marginLeft: 2 }} />
        </button>

        {showBorderMenu && (
          <div className="table-borders-dropdown" role="menu">
            <button
              type="button"
              className={`table-dropdown-item ${currentBorders === "all" ? "selected" : ""}`}
              onClick={() => {
                onSetTableBorders("all");
                setShowBorderMenu(false);
              }}
              onMouseDown={preventBlur}
            >
              <Grid size={14} />
              <span>Tất cả viền (All)</span>
            </button>
            <button
              type="button"
              className={`table-dropdown-item ${currentBorders === "outside" ? "selected" : ""}`}
              onClick={() => {
                onSetTableBorders("outside");
                setShowBorderMenu(false);
              }}
              onMouseDown={preventBlur}
            >
              <Square size={14} />
              <span>Chỉ viền ngoài (Outside)</span>
            </button>
            <button
              type="button"
              className={`table-dropdown-item ${currentBorders === "none" ? "selected" : ""}`}
              onClick={() => {
                onSetTableBorders("none");
                setShowBorderMenu(false);
              }}
              onMouseDown={preventBlur}
            >
              <SquareDashed size={14} />
              <span>Không viền (None)</span>
            </button>
          </div>
        )}
      </div>

      <div className="table-contextual-divider" />

      {/* ===================================================================
          NHÓM 3: AUTOFIT
          =================================================================== */}
      <div className="table-contextual-group" ref={autoFitRef}>
        <button
          type="button"
          className={`table-tool-btn ${showAutoFitMenu ? "active" : ""}`}
          onClick={() => setShowAutoFitMenu((prev) => !prev)}
          onMouseDown={preventBlur}
          title="Tự động căn chỉnh kích thước bảng (AutoFit)"
          aria-haspopup="true"
          aria-expanded={showAutoFitMenu}
        >
          <Maximize2 size={14} />
          <span>
            {layoutMode === "autoContent"
              ? "Vừa nội dung"
              : layoutMode === "fixed"
              ? "Cột cố định"
              : "Vừa trang"}
          </span>
          <ChevronDown size={10} style={{ marginLeft: 2 }} />
        </button>

        {showAutoFitMenu && (
          <div className="table-popover-dropdown" role="menu" style={{ minWidth: 210 }}>
            <span className="table-popover-title">Chế độ kích thước bảng</span>
            <button
              type="button"
              className={`table-dropdown-item ${layoutMode === "autoContent" ? "selected" : ""}`}
              onClick={() => {
                onAutoFitContents();
                setShowAutoFitMenu(false);
              }}
              onMouseDown={preventBlur}
            >
              <Minimize2 size={14} />
              <span>AutoFit Contents (Vừa nội dung)</span>
              {layoutMode === "autoContent" && <Check size={14} style={{ marginLeft: "auto" }} />}
            </button>
            <button
              type="button"
              className={`table-dropdown-item ${layoutMode === "autoWindow" ? "selected" : ""}`}
              onClick={() => {
                onAutoFitWindow();
                setShowAutoFitMenu(false);
              }}
              onMouseDown={preventBlur}
            >
              <Maximize2 size={14} />
              <span>AutoFit Window (Vừa chiều rộng trang)</span>
              {layoutMode === "autoWindow" && <Check size={14} style={{ marginLeft: "auto" }} />}
            </button>
            <button
              type="button"
              className={`table-dropdown-item ${layoutMode === "fixed" ? "selected" : ""}`}
              onClick={() => {
                onSetFixedColumnWidths();
                setShowAutoFitMenu(false);
              }}
              onMouseDown={preventBlur}
            >
              <Columns size={14} />
              <span>Fixed Column Width (Khóa độ rộng cột)</span>
              {layoutMode === "fixed" && <Check size={14} style={{ marginLeft: "auto" }} />}
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================
          NHÓM 4: SIZE (DISTRIBUTE, MARGINS, ROW HEIGHT)
          =================================================================== */}
      <div className="table-contextual-group">
        <button
          type="button"
          className="table-tool-btn"
          disabled={!canDistributeCols}
          onClick={onDistributeColumns}
          onMouseDown={preventBlur}
          title="Chia đều độ rộng các cột (Distribute Columns)"
        >
          <Columns size={14} />
          <span>Chia cột</span>
        </button>

        <button
          type="button"
          className="table-tool-btn"
          disabled={!canDistributeRows}
          onClick={onDistributeRows}
          onMouseDown={preventBlur}
          title="Chia đều chiều cao các hàng (Distribute Rows)"
        >
          <StretchHorizontal size={14} />
          <span>Chia hàng</span>
        </button>

        {/* Lề ô (Cell Margins Dialog) */}
        <div style={{ position: "relative" }} ref={marginsRef}>
          <button
            type="button"
            className={`table-tool-btn ${showMarginsDialog ? "active" : ""}`}
            onClick={() => setShowMarginsDialog((prev) => !prev)}
            onMouseDown={preventBlur}
            title="Thiết lập lề trong của ô (Cell Margins)"
            aria-haspopup="true"
            aria-expanded={showMarginsDialog}
          >
            <Sliders size={14} />
            <span>Lề ô</span>
            <ChevronDown size={10} style={{ marginLeft: 2 }} />
          </button>

          {showMarginsDialog && (
            <div className="table-popover-dropdown" style={{ minWidth: 230 }} role="dialog">
              <span className="table-popover-title">Thiết lập Lề Ô (Cell Margins)</span>

              {/* Nút Preset nhanh */}
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                <button
                  type="button"
                  className="table-btn-secondary"
                  onClick={() => setCustomMargins(CELL_MARGIN_PRESETS.normal)}
                >
                  Chuẩn (Normal)
                </button>
                <button
                  type="button"
                  className="table-btn-secondary"
                  onClick={() => setCustomMargins(CELL_MARGIN_PRESETS.narrow)}
                >
                  Hẹp (Narrow)
                </button>
                <button
                  type="button"
                  className="table-btn-secondary"
                  onClick={() => setCustomMargins(CELL_MARGIN_PRESETS.wide)}
                >
                  Rộng (Wide)
                </button>
              </div>

              <div className="table-margins-grid">
                <div className="table-input-field">
                  <label>Đỉnh (Top - px)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customMargins.top}
                    onChange={(e) =>
                      setCustomMargins({ ...customMargins, top: Math.max(0, parseInt(e.target.value, 10) || 0) })
                    }
                  />
                </div>
                <div className="table-input-field">
                  <label>Đáy (Bottom - px)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customMargins.bottom}
                    onChange={(e) =>
                      setCustomMargins({ ...customMargins, bottom: Math.max(0, parseInt(e.target.value, 10) || 0) })
                    }
                  />
                </div>
                <div className="table-input-field">
                  <label>Trái (Left - px)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customMargins.left}
                    onChange={(e) =>
                      setCustomMargins({ ...customMargins, left: Math.max(0, parseInt(e.target.value, 10) || 0) })
                    }
                  />
                </div>
                <div className="table-input-field">
                  <label>Phải (Right - px)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customMargins.right}
                    onChange={(e) =>
                      setCustomMargins({ ...customMargins, right: Math.max(0, parseInt(e.target.value, 10) || 0) })
                    }
                  />
                </div>
              </div>

              <label className="table-checkbox-row">
                <input
                  type="checkbox"
                  checked={cellOverrideOnly}
                  onChange={(e) => setCellOverrideOnly(e.target.checked)}
                />
                <span>Chỉ áp dụng ô đang chọn (Cell Override)</span>
              </label>

              <div className="table-popover-actions">
                <button
                  type="button"
                  className="table-btn-primary"
                  onClick={() => {
                    const validated = validateCellMargins(customMargins);
                    onSetCellMargins(validated, cellOverrideOnly);
                    setShowMarginsDialog(false);
                  }}
                >
                  Áp dụng
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chiều cao hàng (Row Height Dialog) */}
        <div style={{ position: "relative" }} ref={rowHeightRef}>
          <button
            type="button"
            className={`table-tool-btn ${showRowHeightDialog ? "active" : ""}`}
            onClick={() => setShowRowHeightDialog((prev) => !prev)}
            onMouseDown={preventBlur}
            title="Thiết lập chiều cao hàng (Row Height)"
            aria-haspopup="true"
            aria-expanded={showRowHeightDialog}
          >
            <span>Cao hàng</span>
            <ChevronDown size={10} style={{ marginLeft: 2 }} />
          </button>

          {showRowHeightDialog && (
            <div className="table-popover-dropdown" style={{ minWidth: 220 }} role="dialog">
              <span className="table-popover-title">Chiều cao hàng (Row Height)</span>

              <div className="table-input-field" style={{ marginBottom: 8 }}>
                <label>Quy tắc (Rule)</label>
                <select
                  value={rowHeightRule}
                  onChange={(e) => setRowHeightRule(e.target.value as RowHeightRule)}
                >
                  <option value="auto">Tự động (Auto)</option>
                  <option value="atLeast">Tối thiểu (At Least)</option>
                  <option value="exact">Chính xác (Exact)</option>
                </select>
              </div>

              {rowHeightRule !== "auto" && (
                <div className="table-input-field" style={{ marginBottom: 8 }}>
                  <label>Chiều cao (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="600"
                    value={rowHeightVal}
                    onChange={(e) => setRowHeightVal(Math.max(10, parseInt(e.target.value, 10) || 10))}
                  />
                </div>
              )}

              <div className="table-popover-actions">
                <button
                  type="button"
                  className="table-btn-primary"
                  onClick={() => {
                    const validated = validateRowHeight(rowHeightVal, rowHeightRule);
                    onSetRowHeight(validated.height, validated.rule);
                    setShowRowHeightDialog(false);
                  }}
                >
                  Lưu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="table-contextual-divider" />

      {/* ===================================================================
          NHÓM 5: TABLE STYLES GALLERY
          =================================================================== */}
      <div className="table-contextual-group" ref={styleGalleryRef}>
        <button
          type="button"
          className={`table-tool-btn ${showStyleGallery ? "active" : ""}`}
          onClick={() => setShowStyleGallery((prev) => !prev)}
          onMouseDown={preventBlur}
          title="Thư viện kiểu bảng (Table Styles Gallery)"
          aria-haspopup="true"
          aria-expanded={showStyleGallery}
        >
          <Palette size={14} />
          <span>
            {tableStyleInfo?.style.name || "Kiểu Bảng"}
          </span>
          <ChevronDown size={10} style={{ marginLeft: 2 }} />
        </button>

        {showStyleGallery && (
          <div className="table-popover-dropdown" style={{ minWidth: 260 }} role="dialog">
            <span className="table-popover-title">Thư viện Kiểu Bảng</span>

            <div className="table-styles-gallery-grid">
              {allTableStyles.map((s) => {
                const isActive = tableStyleInfo?.styleId === s.id;
                return (
                  <div
                    key={s.id}
                    className={`table-style-preview-card ${isActive ? "active" : ""}`}
                    onClick={() => {
                      onApplyTableStyle(s.id as TableStyleId);
                    }}
                    onMouseDown={preventBlur}
                    title={s.description || s.name}
                  >
                    <table className="table-style-mini-table">
                      <thead>
                        <tr style={{ background: s.headerRow?.backgroundColor || "#f1f5f9" }}>
                          <th style={{ color: s.headerRow?.textColor || "#1e293b" }}>A</th>
                          <th style={{ color: s.headerRow?.textColor || "#1e293b" }}>B</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ background: s.bodyCell?.backgroundColor || "#ffffff" }}>
                          <td>1</td>
                          <td>2</td>
                        </tr>
                        <tr
                          style={{
                            background:
                              s.bandedRows?.enabled && s.bandedRows.evenBackgroundColor
                                ? s.bandedRows.evenBackgroundColor
                                : "#ffffff",
                          }}
                        >
                          <td>3</td>
                          <td>4</td>
                        </tr>
                      </tbody>
                    </table>
                    <span className="table-style-card-name">{s.name}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6, marginTop: 4 }}>
              <label className="table-checkbox-row">
                <input
                  type="checkbox"
                  checked={tableStyleInfo?.options.headerRow ?? true}
                  onChange={(e) => onSetTableStyleOptions({ headerRow: e.target.checked })}
                />
                <span>Hàng tiêu đề (Header Row)</span>
              </label>

              <label className="table-checkbox-row">
                <input
                  type="checkbox"
                  checked={tableStyleInfo?.options.bandedRows ?? true}
                  onChange={(e) => onSetTableStyleOptions({ bandedRows: e.target.checked })}
                />
                <span>Hàng xen kẽ màu (Banded Rows)</span>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="table-contextual-divider" />

      {/* ===================================================================
          NHÓM 6: ROWS & COLUMNS (THÊM, XÓA, LẶP TIÊU ĐỀ)
          =================================================================== */}
      <div className="table-contextual-group">
        <button
          type="button"
          className="table-tool-btn table-tool-icon-only"
          onClick={onAddRowAbove}
          onMouseDown={preventBlur}
          title="Thêm hàng phía trên"
          aria-label="Thêm hàng trên"
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          className="table-tool-btn table-tool-icon-only"
          onClick={onAddRowBelow}
          onMouseDown={preventBlur}
          title="Thêm hàng phía dưới"
          aria-label="Thêm hàng dưới"
        >
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          className="table-tool-btn table-tool-icon-only"
          onClick={onAddColumnLeft}
          onMouseDown={preventBlur}
          title="Thêm cột bên trái"
          aria-label="Thêm cột trái"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          className="table-tool-btn table-tool-icon-only"
          onClick={onAddColumnRight}
          onMouseDown={preventBlur}
          title="Thêm cột bên phải"
          aria-label="Thêm cột phải"
        >
          <ArrowRight size={14} />
        </button>

        <button
          type="button"
          className="table-tool-btn"
          onClick={onToggleHeaderRow}
          onMouseDown={preventBlur}
          title="Bật / tắt hàng tiêu đề (Header Row)"
        >
          <Rows size={14} />
          <span>Tiêu đề</span>
        </button>

        <button
          type="button"
          className={`table-tool-btn ${repeatHeader ? "active" : ""}`}
          onClick={onToggleRepeatHeader}
          onMouseDown={preventBlur}
          title="Lặp lại hàng tiêu đề ở đầu mỗi trang mới (Repeat Header Row)"
        >
          <Repeat size={14} />
          <span>Lặp tiêu đề</span>
        </button>
      </div>

      <div className="table-contextual-divider" />

      {/* Xóa Hàng, Cột, Bảng */}
      <div className="table-contextual-group">
        <button
          type="button"
          className="table-tool-btn danger"
          onClick={onDeleteRow}
          onMouseDown={preventBlur}
          title="Xóa hàng hiện tại"
        >
          <Trash2 size={13} />
          <span>Hàng</span>
        </button>
        <button
          type="button"
          className="table-tool-btn danger"
          onClick={onDeleteColumn}
          onMouseDown={preventBlur}
          title="Xóa cột hiện tại"
        >
          <Trash2 size={13} />
          <span>Cột</span>
        </button>
        <button
          type="button"
          className="table-tool-btn danger"
          onClick={onDeleteTable}
          onMouseDown={preventBlur}
          title="Xóa toàn bộ bảng"
        >
          <Trash2 size={13} />
          <span>Bảng</span>
        </button>
      </div>
    </div>
  );
}

export default TableContextualToolbar;
