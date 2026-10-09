import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Hash,
  Trash2,
  Edit3,
  Table as TableIcon,
  Image as ImageIcon,
  Shapes as ShapesIcon,
  Link as LinkIcon,
  BoxSelect as BoxSelectIcon,
  Minus as MinusIcon,
  Sigma as SigmaIcon,
  Omega as OmegaIcon,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Grid,
  Rows,
} from "lucide-react";
import { useEditorStore } from "../../stores/editorStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";
import { useHeaderFooterStore } from "../../stores/headerFooterStore.ts";
import { useInsertDialogStore } from "../../stores/insertDialogStore.ts";
import { useInsertCommands } from "../../insert/hooks/useInsertCommands.ts";
import { getInsertItemDescriptor } from "../../insert/services/insertRegistry.ts";
import { InsertRibbonButton } from "../insert/InsertRibbonButton.tsx";
import type { HeaderFooterAlignment } from "../../page/types/headerFooterTypes.ts";

/**
 * InsertRibbon: Thanh công cụ Chèn (Insert) chuẩn kiến trúc Phase 3.2.
 *
 * Phân chia nhóm chức năng chuẩn Office:
 * 1. Pages: Page Break, Section Break (Tái sử dụng Phase 2 - ACTIVE)
 * 2. Tables: Table (Dự kiến Phase 3.3+ - DISABLED PLACEHOLDER)
 * 3. Illustrations: Pictures, Shapes (Dự kiến Phase 3.x - DISABLED PLACEHOLDER)
 * 4. Links: Link / Hyperlink (Phase 3.2 - ACTIVE)
 * 5. Header & Footer: Header, Footer, Page Number (Tái sử dụng Phase 2.8 - ACTIVE)
 * 6. Text: Text Box (Placeholder), Horizontal Line (Phase 3.2 - ACTIVE)
 * 7. Symbols: Equation (Placeholder), Symbol (Phase 3.2 - ACTIVE)
 */
export function InsertRibbon() {
  const editor = useEditorStore((state) => state.editor);
  const currentSectionIndex = useDocumentStore((state) => state.currentSectionIndex);
  const updateSectionHeader = useDocumentStore((state) => state.updateSectionHeader);
  const updateSectionFooter = useDocumentStore((state) => state.updateSectionFooter);
  const insertPageNumber = useDocumentStore((state) => state.insertPageNumber);
  const pageSettings = useDocumentStore((state) => state.pageSettings);
  const currentPage = usePaginationStore((state) => state.currentPage);

  const { openHeader, openFooter } = useHeaderFooterStore();
  const {
    insertPageBreak,
    insertSectionBreak,
    insertHorizontalRule,
    isLinkActive,
    insertTable,
    addRowAbove,
    addRowBelow,
    deleteRow,
    addColumnLeft,
    addColumnRight,
    deleteColumn,
    deleteTable,
    toggleHeaderRow,
    isTableActive,
    insertImage,
    insertTextBox,
    insertShape,
  } = useInsertCommands();

  const openLinkDialog = useInsertDialogStore((state) => state.openLinkDialog);
  const openSymbolDialog = useInsertDialogStore((state) => state.openSymbolDialog);
  const openTableDialog = useInsertDialogStore((state) => state.openTableDialog);
  const openEquationDialog = useInsertDialogStore((state) => state.openEquationDialog);

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showFooterMenu, setShowFooterMenu] = useState(false);
  const [showPageNumMenu, setShowPageNumMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [hoverGrid, setHoverGrid] = useState({ rows: 0, cols: 0 });

  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const pageNumRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleOpenImagePicker = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const maxBytes = 10 * 1024 * 1024; // 10MB
      if (file.size > maxBytes) {
        alert("Dung lượng tệp tin hình ảnh vượt quá giới hạn 10MB.");
        e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          insertImage({
            src: dataUrl,
            alt: file.name.replace(/\.[^/.]+$/, ""),
            title: file.name,
            alignment: "center",
          });
        }
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    },
    [insertImage]
  );

  // Đóng popover khi nhấp chuột ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (headerRef.current && !headerRef.current.contains(target)) {
        setShowHeaderMenu(false);
      }
      if (footerRef.current && !footerRef.current.contains(target)) {
        setShowFooterMenu(false);
      }
      if (pageNumRef.current && !pageNumRef.current.contains(target)) {
        setShowPageNumMenu(false);
      }
      if (tableMenuRef.current && !tableMenuRef.current.contains(target)) {
        setShowTableMenu(false);
      }
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(target)) {
        setShowShapeMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Đóng popover khi nhấn phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (
          showHeaderMenu ||
          showFooterMenu ||
          showPageNumMenu ||
          showTableMenu ||
          showShapeMenu
        ) {
          e.preventDefault();
          setShowHeaderMenu(false);
          setShowFooterMenu(false);
          setShowPageNumMenu(false);
          setShowTableMenu(false);
          setShowShapeMenu(false);
          if (editor) {
            editor.commands.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showHeaderMenu,
    showFooterMenu,
    showPageNumMenu,
    showTableMenu,
    showShapeMenu,
    editor,
  ]);

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Chèn ngắt trang Page Break (qua Insert Command Layer)
  const handleInsertPageBreak = () => {
    if (editor) {
      insertPageBreak();
      editor.commands.focus();
    }
  };

  // Chèn ngắt phần Section Break (qua Insert Command Layer)
  const handleInsertSectionBreak = () => {
    if (editor) {
      insertSectionBreak({
        pageSettings: { ...pageSettings },
      });
      editor.commands.focus();
    }
  };

  // Chèn đường kẻ ngang (Horizontal Rule - Phase 3.2)
  const handleInsertHorizontalRule = () => {
    if (editor) {
      insertHorizontalRule();
      editor.commands.focus();
    }
  };

  // Chèn Hộp văn bản (Text Box - Phase 3.7)
  const handleInsertTextBox = () => {
    if (editor) {
      insertTextBox();
      editor.commands.focus();
    }
  };

  // Chèn Hình vẽ (Shape - Phase 3.8)
  const handleInsertShape = (
    shapeType: import("../../editor/shapeExtension.ts").ShapeType
  ) => {
    insertShape({ shapeType });
    setShowShapeMenu(false);
    if (editor) editor.commands.focus();
  };

  // Mở hộp thoại Equation (Phase 3.8)
  const handleOpenEquationDialog = () => {
    const currentAttrs = editor?.getAttributes("equation");
    openEquationDialog(currentAttrs?.latex);
  };

  // Chèn bảng từ Grid Picker (Phase 3.3)
  const handleGridInsert = (rows: number, cols: number) => {
    insertTable({ rows, cols, withHeaderRow: true });
    setShowTableMenu(false);
    setHoverGrid({ rows: 0, cols: 0 });
    if (editor) editor.commands.focus();
  };

  // Mở hộp thoại Hyperlink (Phase 3.2)
  const handleOpenLinkDialog = () => {
    openLinkDialog();
  };

  // Mở hộp thoại Symbol Picker (Phase 3.2)
  const handleOpenSymbolDialog = () => {
    openSymbolDialog();
  };

  // Mở chế độ chỉnh sửa Header
  const handleOpenHeader = (alignment?: HeaderFooterAlignment) => {
    if (alignment) {
      updateSectionHeader(currentSectionIndex, { alignment });
    }
    openHeader(currentSectionIndex, currentPage);
    setShowHeaderMenu(false);
  };

  // Mở chế độ chỉnh sửa Footer
  const handleOpenFooter = (alignment?: HeaderFooterAlignment) => {
    if (alignment) {
      updateSectionFooter(currentSectionIndex, { alignment });
    }
    openFooter(currentSectionIndex, currentPage);
    setShowFooterMenu(false);
  };

  // Xóa Header
  const handleRemoveHeader = () => {
    updateSectionHeader(currentSectionIndex, { text: "" });
    setShowHeaderMenu(false);
    if (editor) editor.commands.focus();
  };

  // Xóa Footer
  const handleRemoveFooter = () => {
    updateSectionFooter(currentSectionIndex, { text: "" });
    setShowFooterMenu(false);
    if (editor) editor.commands.focus();
  };

  // Chèn số trang vào vị trí xác định
  const handleApplyPageNumber = (
    target: "header" | "footer",
    alignment: HeaderFooterAlignment
  ) => {
    insertPageNumber(currentSectionIndex, target, alignment);
    setShowPageNumMenu(false);
    if (editor) editor.commands.focus();
  };

  // Xóa số trang khỏi tài liệu
  const handleRemovePageNumber = () => {
    updateSectionFooter(currentSectionIndex, { text: "" });
    updateSectionHeader(currentSectionIndex, { text: "" });
    setShowPageNumMenu(false);
    if (editor) editor.commands.focus();
  };

  return (
    <div className="ribbon-tab-content insert-ribbon" role="toolbar" aria-label="Insert Tools">
      {/* Nhóm 1: Pages (Trang & Ngắt trang/phần - Tái sử dụng Phase 2) */}
      <div className="ribbon-group" aria-label="Pages">
        <div className="ribbon-group-controls">
          <div className="stacked-tools">
            {/* Page Break */}
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={handleInsertPageBreak}
              title="Chèn dấu ngắt trang tại con trỏ (Ctrl+Enter)"
              aria-label="Page Break"
            >
              <FileText size={15} />
              <span>Page Break</span>
            </button>

            {/* Section Break */}
            <button
              type="button"
              className="ribbon-tool-btn small-btn"
              onMouseDown={preventBlur}
              onClick={handleInsertSectionBreak}
              title="Chèn dấu ngắt phần sang trang mới (Section Break)"
              aria-label="Section Break"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
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
              <span>Section Break</span>
            </button>
          </div>
        </div>
        <div className="ribbon-group-label">Pages</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Nhóm 2: Tables (Bảng biểu - Phase 3.3) */}
      <div className="ribbon-group" aria-label="Tables">
        <div className="ribbon-group-controls">
          {/* Nút Table chính với popover lựa chọn kích thước (8x8 Grid & Custom Dialog) */}
          <div className="layout-dropdown-wrapper" ref={tableMenuRef}>
            <button
              type="button"
              className={`ribbon-btn ribbon-btn-large ${showTableMenu ? "active" : ""}`}
              onClick={() => setShowTableMenu((prev) => !prev)}
              title="Chèn Bảng (Insert Table)"
              aria-haspopup="true"
              aria-expanded={showTableMenu}
            >
              <div className="ribbon-btn-icon-wrapper">
                <TableIcon size={24} />
              </div>
              <span className="ribbon-btn-label">
                Bảng
                <ChevronDown size={12} style={{ marginLeft: 3 }} />
              </span>
            </button>

            {showTableMenu && (
              <div className="layout-dropdown-menu table-popover" role="menu">
                <div className="table-popover-header">
                  <span className="table-popover-title">
                    {hoverGrid.rows > 0 && hoverGrid.cols > 0
                      ? `${hoverGrid.rows} × ${hoverGrid.cols} Bảng`
                      : "Chèn Bảng"}
                  </span>
                </div>

                {/* 8x8 Interactive Grid */}
                <div
                  className="table-grid-picker"
                  onMouseLeave={() => setHoverGrid({ rows: 0, cols: 0 })}
                  role="grid"
                  aria-label="Chọn kích thước bảng"
                >
                  {Array.from({ length: 8 }, (_, r) => (
                    <div key={r} className="table-grid-row" role="row">
                      {Array.from({ length: 8 }, (_, c) => {
                        const rowNum = r + 1;
                        const colNum = c + 1;
                        const isHighlighted =
                          rowNum <= hoverGrid.rows && colNum <= hoverGrid.cols;
                        return (
                          <div
                            key={c}
                            className={`table-grid-cell ${isHighlighted ? "is-highlighted" : ""}`}
                            onMouseEnter={() =>
                              setHoverGrid({ rows: rowNum, cols: colNum })
                            }
                            onClick={() => handleGridInsert(rowNum, colNum)}
                            role="gridcell"
                            title={`${rowNum} × ${colNum}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="layout-menu-sep" />

                <button
                  type="button"
                  role="menuitem"
                  className="layout-menu-item"
                  onClick={() => {
                    setShowTableMenu(false);
                    openTableDialog();
                  }}
                >
                  <div className="layout-item-icon">
                    <Grid size={16} />
                  </div>
                  <div className="layout-item-text">
                    <span className="layout-item-title">Chèn Bảng... (Custom)</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Công cụ thao tác bảng ngữ cảnh khi con trỏ đang trong Table */}
          {isTableActive() && (
            <div className="contextual-table-tools" style={{ display: "flex", gap: "2px", alignItems: "center" }}>
              <div className="stacked-tools">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  onClick={() => {
                    addRowAbove();
                    if (editor) editor.commands.focus();
                  }}
                  title="Thêm hàng phía trên (Add Row Above)"
                >
                  <ArrowUp size={14} />
                  <span>+ Hàng trên</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  onClick={() => {
                    addRowBelow();
                    if (editor) editor.commands.focus();
                  }}
                  title="Thêm hàng phía dưới (Add Row Below)"
                >
                  <ArrowDown size={14} />
                  <span>+ Hàng dưới</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  style={{ color: "#ef4444" }}
                  onClick={() => {
                    deleteRow();
                    if (editor) editor.commands.focus();
                  }}
                  title="Xóa hàng hiện tại (Delete Row)"
                >
                  <Trash2 size={14} />
                  <span>Xóa hàng</span>
                </button>
              </div>

              <div className="stacked-tools">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  onClick={() => {
                    addColumnLeft();
                    if (editor) editor.commands.focus();
                  }}
                  title="Thêm cột bên trái (Add Column Left)"
                >
                  <ArrowLeft size={14} />
                  <span>+ Cột trái</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  onClick={() => {
                    addColumnRight();
                    if (editor) editor.commands.focus();
                  }}
                  title="Thêm cột bên phải (Add Column Right)"
                >
                  <ArrowRight size={14} />
                  <span>+ Cột phải</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  style={{ color: "#ef4444" }}
                  onClick={() => {
                    deleteColumn();
                    if (editor) editor.commands.focus();
                  }}
                  title="Xóa cột hiện tại (Delete Column)"
                >
                  <Trash2 size={14} />
                  <span>Xóa cột</span>
                </button>
              </div>

              <div className="stacked-tools">
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  onClick={() => {
                    toggleHeaderRow();
                    if (editor) editor.commands.focus();
                  }}
                  title="Bật / tắt dòng tiêu đề (Toggle Header Row)"
                >
                  <Rows size={14} />
                  <span>Dòng tiêu đề</span>
                </button>
                <button
                  type="button"
                  className="ribbon-btn ribbon-btn-small"
                  style={{ color: "#ef4444" }}
                  onClick={() => {
                    deleteTable();
                    if (editor) editor.commands.focus();
                  }}
                  title="Xóa toàn bộ bảng (Delete Table)"
                >
                  <Trash2 size={14} />
                  <span>Xóa bảng</span>
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="ribbon-group-label">Tables {isTableActive() && "(Editing)"}</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Nhóm 3: Illustrations (Hình ảnh & Đồ họa - Dự kiến Phase 3.x) */}
      <div className="ribbon-group" aria-label="Illustrations">
        <div className="ribbon-group-controls">
          <input
            type="file"
            ref={imageInputRef}
            onChange={handleImageFileChange}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            style={{ display: "none" }}
          />
          <InsertRibbonButton
            item={getInsertItemDescriptor("image")}
            label="Pictures"
            icon={ImageIcon}
            variant="large"
            disabled={false}
            onClick={handleOpenImagePicker}
          />

          <div className="layout-dropdown-wrapper" ref={shapeMenuRef}>
            <button
              type="button"
              className={`ribbon-btn ribbon-btn-large ${showShapeMenu ? "active" : ""}`}
              onClick={() => setShowShapeMenu((prev) => !prev)}
              title="Chèn hình vẽ cơ bản (Insert Shapes)"
              aria-haspopup="true"
              aria-expanded={showShapeMenu}
            >
              <div className="ribbon-btn-icon-wrapper">
                <ShapesIcon size={24} />
              </div>
              <span className="ribbon-btn-label">
                Shapes
                <ChevronDown size={12} style={{ marginLeft: 3 }} />
              </span>
            </button>

            {showShapeMenu && (
              <div
                className="layout-dropdown-menu shapes-dropdown-menu"
                role="menu"
                style={{ minWidth: "220px", padding: "6px" }}
              >
                <div className="ribbon-dropdown-header">Hình vẽ cơ bản (Basic Shapes)</div>

                <button
                  type="button"
                  role="menuitem"
                  className="layout-menu-item"
                  onMouseDown={preventBlur}
                  onClick={() => handleInsertShape("rectangle")}
                >
                  <div className="layout-item-icon">
                    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                      <rect x="1" y="1" width="18" height="14" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="layout-item-text">
                    <span className="layout-item-title">Hình chữ nhật</span>
                    <span className="layout-item-desc">Rectangle</span>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="layout-menu-item"
                  onMouseDown={preventBlur}
                  onClick={() => handleInsertShape("roundedRectangle")}
                >
                  <div className="layout-item-icon">
                    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                      <rect x="1" y="1" width="18" height="14" rx="4" ry="4" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="layout-item-text">
                    <span className="layout-item-title">Hình chữ nhật bo tròn</span>
                    <span className="layout-item-desc">Rounded Rectangle</span>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="layout-menu-item"
                  onMouseDown={preventBlur}
                  onClick={() => handleInsertShape("ellipse")}
                >
                  <div className="layout-item-icon">
                    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                      <ellipse cx="10" cy="8" rx="9" ry="6.5" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="layout-item-text">
                    <span className="layout-item-title">Hình elip / Hình tròn</span>
                    <span className="layout-item-desc">Ellipse / Circle</span>
                  </div>
                </button>

                <div className="layout-menu-sep" />
                <div className="ribbon-dropdown-header">Đường nét &amp; Mũi tên</div>

                <button
                  type="button"
                  role="menuitem"
                  className="layout-menu-item"
                  onMouseDown={preventBlur}
                  onClick={() => handleInsertShape("line")}
                >
                  <div className="layout-item-icon">
                    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                      <line x1="2" y1="13" x2="18" y2="3" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="layout-item-text">
                    <span className="layout-item-title">Đường thẳng</span>
                    <span className="layout-item-desc">Straight Line</span>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="layout-menu-item"
                  onMouseDown={preventBlur}
                  onClick={() => handleInsertShape("arrow")}
                >
                  <div className="layout-item-icon">
                    <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                      <line x1="2" y1="8" x2="13" y2="8" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
                      <polygon points="12,4 18,8 12,12" fill="#1d4ed8" />
                    </svg>
                  </div>
                  <div className="layout-item-text">
                    <span className="layout-item-title">Mũi tên ngang</span>
                    <span className="layout-item-desc">Arrow</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="ribbon-group-label">Illustrations</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Nhóm 4: Links (Liên kết - Hoàn thành Phase 3.2) */}
      <div className="ribbon-group" aria-label="Links">
        <div className="ribbon-group-controls">
          <InsertRibbonButton
            item={getInsertItemDescriptor("link")}
            label="Link"
            icon={LinkIcon}
            shortcut="Ctrl+K"
            variant="large"
            disabled={false}
            className={isLinkActive() ? "is-active" : ""}
            onClick={handleOpenLinkDialog}
          />
        </div>
        <div className="ribbon-group-label">Links</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Nhóm 5: Header & Footer (Đầu trang & Chân trang - Tái sử dụng Phase 2.8) */}
      <div className="ribbon-group" aria-label="Header & Footer">
        <div className="ribbon-group-controls">
          <div className="ribbon-row layout-controls-row">
            {/* Nút Header */}
            <div className="popover-anchor" ref={headerRef}>
              <button
                type="button"
                className={`ribbon-large-btn ${showHeaderMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowHeaderMenu(!showHeaderMenu);
                  setShowFooterMenu(false);
                  setShowPageNumMenu(false);
                }}
                title="Chèn hoặc chỉnh sửa Header đầu trang"
                aria-haspopup="menu"
                aria-expanded={showHeaderMenu}
              >
                <div className="ribbon-large-icon">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="8" x2="21" y2="8" stroke="#2563eb" strokeWidth="2" />
                    <line x1="7" y1="5.5" x2="17" y2="5.5" stroke="#2563eb" strokeWidth="1.5" />
                  </svg>
                </div>
                <div className="ribbon-large-label">
                  <span>Header</span>
                  <div className="ribbon-btn-sublabel">
                    <span>Đầu trang</span>
                    <ChevronDown size={11} style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </button>

              {showHeaderMenu && (
                <div className="ribbon-dropdown-menu layout-dropdown-menu" role="menu">
                  <div className="ribbon-dropdown-header">Chỉnh sửa Header</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenHeader()}
                  >
                    <div className="layout-item-icon">
                      <Edit3 size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Chỉnh sửa Header (Mục {currentSectionIndex})</span>
                      <span className="layout-item-desc">Mở vùng nhập tiêu đề đầu trang</span>
                    </div>
                  </button>

                  <div className="layout-menu-sep" />
                  <div className="ribbon-dropdown-header">Căn lề Header</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenHeader("left")}
                  >
                    <div className="layout-item-icon">
                      <AlignLeft size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Căn trái (Left)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenHeader("center")}
                  >
                    <div className="layout-item-icon">
                      <AlignCenter size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Căn giữa (Center)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenHeader("right")}
                  >
                    <div className="layout-item-icon">
                      <AlignRight size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Căn phải (Right)</span>
                    </div>
                  </button>

                  <div className="layout-menu-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={handleRemoveHeader}
                  >
                    <div className="layout-item-icon" style={{ color: "#ef4444" }}>
                      <Trash2 size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title" style={{ color: "#ef4444" }}>
                        Xóa Header
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Nút Footer */}
            <div className="popover-anchor" ref={footerRef}>
              <button
                type="button"
                className={`ribbon-large-btn ${showFooterMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowFooterMenu(!showFooterMenu);
                  setShowHeaderMenu(false);
                  setShowPageNumMenu(false);
                }}
                title="Chèn hoặc chỉnh sửa Footer chân trang"
                aria-haspopup="menu"
                aria-expanded={showFooterMenu}
              >
                <div className="ribbon-large-icon">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="16" x2="21" y2="16" stroke="#2563eb" strokeWidth="2" />
                    <line x1="7" y1="18.5" x2="17" y2="18.5" stroke="#2563eb" strokeWidth="1.5" />
                  </svg>
                </div>
                <div className="ribbon-large-label">
                  <span>Footer</span>
                  <div className="ribbon-btn-sublabel">
                    <span>Chân trang</span>
                    <ChevronDown size={11} style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </button>

              {showFooterMenu && (
                <div className="ribbon-dropdown-menu layout-dropdown-menu" role="menu">
                  <div className="ribbon-dropdown-header">Chỉnh sửa Footer</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenFooter()}
                  >
                    <div className="layout-item-icon">
                      <Edit3 size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Chỉnh sửa Footer (Mục {currentSectionIndex})</span>
                      <span className="layout-item-desc">Mở vùng nhập chân trang</span>
                    </div>
                  </button>

                  <div className="layout-menu-sep" />
                  <div className="ribbon-dropdown-header">Căn lề Footer</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenFooter("left")}
                  >
                    <div className="layout-item-icon">
                      <AlignLeft size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Căn trái (Left)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenFooter("center")}
                  >
                    <div className="layout-item-icon">
                      <AlignCenter size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Căn giữa (Center)</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleOpenFooter("right")}
                  >
                    <div className="layout-item-icon">
                      <AlignRight size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Căn phải (Right)</span>
                    </div>
                  </button>

                  <div className="layout-menu-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={handleRemoveFooter}
                  >
                    <div className="layout-item-icon" style={{ color: "#ef4444" }}>
                      <Trash2 size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title" style={{ color: "#ef4444" }}>
                        Xóa Footer
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Nút Page Number */}
            <div className="popover-anchor" ref={pageNumRef}>
              <button
                type="button"
                className={`ribbon-large-btn ${showPageNumMenu ? "is-active" : ""}`}
                onMouseDown={preventBlur}
                onClick={() => {
                  setShowPageNumMenu(!showPageNumMenu);
                  setShowHeaderMenu(false);
                  setShowFooterMenu(false);
                }}
                title="Chèn số trang tự động vào Header hoặc Footer"
                aria-haspopup="menu"
                aria-expanded={showPageNumMenu}
              >
                <div className="ribbon-large-icon">
                  <Hash size={22} />
                </div>
                <div className="ribbon-large-label">
                  <span>Page Number</span>
                  <div className="ribbon-btn-sublabel">
                    <span>Số trang</span>
                    <ChevronDown size={11} style={{ marginLeft: "2px" }} />
                  </div>
                </div>
              </button>

              {showPageNumMenu && (
                <div className="ribbon-dropdown-menu layout-dropdown-menu" role="menu">
                  <div className="ribbon-dropdown-header">Cuối trang (Bottom of Page - Footer)</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleApplyPageNumber("footer", "left")}
                  >
                    <div className="layout-item-icon">
                      <AlignLeft size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Chân trang - Căn trái</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleApplyPageNumber("footer", "center")}
                  >
                    <div className="layout-item-icon">
                      <AlignCenter size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Chân trang - Căn giữa</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleApplyPageNumber("footer", "right")}
                  >
                    <div className="layout-item-icon">
                      <AlignRight size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Chân trang - Căn phải</span>
                    </div>
                  </button>

                  <div className="layout-menu-sep" />
                  <div className="ribbon-dropdown-header">Đầu trang (Top of Page - Header)</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleApplyPageNumber("header", "left")}
                  >
                    <div className="layout-item-icon">
                      <AlignLeft size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Đầu trang - Căn trái</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleApplyPageNumber("header", "center")}
                  >
                    <div className="layout-item-icon">
                      <AlignCenter size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Đầu trang - Căn giữa</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={() => handleApplyPageNumber("header", "right")}
                  >
                    <div className="layout-item-icon">
                      <AlignRight size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title">Đầu trang - Căn phải</span>
                    </div>
                  </button>

                  <div className="layout-menu-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="layout-menu-item"
                    onMouseDown={preventBlur}
                    onClick={handleRemovePageNumber}
                  >
                    <div className="layout-item-icon" style={{ color: "#ef4444" }}>
                      <Trash2 size={16} />
                    </div>
                    <div className="layout-item-text">
                      <span className="layout-item-title" style={{ color: "#ef4444" }}>
                        Xóa số trang
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="ribbon-group-label">Header &amp; Footer</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Nhóm 6: Text (Hộp văn bản & Kẻ ngang - Phase 3.2) */}
      <div className="ribbon-group" aria-label="Text">
        <div className="ribbon-group-controls">
          <div className="stacked-tools">
            <InsertRibbonButton
              item={getInsertItemDescriptor("textbox")}
              label="Text Box"
              icon={BoxSelectIcon}
              variant="small"
              disabled={false}
              onClick={handleInsertTextBox}
            />
            <InsertRibbonButton
              item={getInsertItemDescriptor("horizontalRule")}
              label="Horizontal Line"
              icon={MinusIcon}
              variant="small"
              disabled={false}
              onClick={handleInsertHorizontalRule}
            />
          </div>
        </div>
        <div className="ribbon-group-label">Text</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* Nhóm 7: Symbols (Công thức & Ký hiệu - Phase 3.2) */}
      <div className="ribbon-group" aria-label="Symbols">
        <div className="ribbon-group-controls">
          <div className="stacked-tools">
            <InsertRibbonButton
              item={getInsertItemDescriptor("equation")}
              label="Equation"
              icon={SigmaIcon}
              variant="small"
              disabled={false}
              onClick={handleOpenEquationDialog}
            />
            <InsertRibbonButton
              item={getInsertItemDescriptor("symbol")}
              label="Symbol"
              icon={OmegaIcon}
              variant="small"
              disabled={false}
              onClick={handleOpenSymbolDialog}
            />
          </div>
        </div>
        <div className="ribbon-group-label">Symbols</div>
      </div>
    </div>
  );
}

export default InsertRibbon;
