import React, { useRef } from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { usePageSettings } from "../hooks/usePageSettings.ts";
import { usePagination } from "../hooks/usePagination.ts";
import { PAGE_GAP_PX } from "../services/paginationService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { useHeaderFooterStore } from "../../stores/headerFooterStore.ts";
import { getEffectiveHeaderFooter } from "../services/sectionService.ts";
import { formatHeaderFooterText } from "../types/headerFooterTypes.ts";
import { HeaderFooterEditor } from "./HeaderFooterEditor.tsx";

export interface PageRendererProps {
  /** Nội dung con hiển thị bên trong trang (EditorContent, header, footer, etc.) */
  children?: React.ReactNode;
  /** Tiptap Editor instance để hỗ trợ autofocus khi nhấp vào lề trang */
  editor?: TiptapEditor | null;
  /** ClassName tùy biến gắn vào wrapper ngoài */
  className?: string;
  /** Style tùy biến bổ sung cho sheet giấy */
  style?: React.CSSProperties;
  /** Callback click tùy biến */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * PageRenderer (Phase 2.6 - Basic Real Pagination & Phase 2.8 - Header, Footer, Page Number):
 * Component trung tâm hiển thị hệ thống nhiều trang vật lý (Multi-Page Physical Sheets).
 *
 * Kiến trúc 3 tầng phân lớp rõ ràng (Three-Layer Architecture):
 *   Tầng 1 (Background): Lớp các trang giấy vật lý nền (Background Physical Paper Sheets)
 *                        Mỗi trang hiển thị đúng khổ giấy, hướng, viền đổ bóng, khung lề.
 *   Tầng 2 (Content):    Lớp nội dung ProseMirror đơn nhất (Single ProseMirror Document)
 *                        Bảo toàn 100% caret, selection, typing, IME, undo/redo, Find/Replace.
 *                        Nội dung ngắt sang trang mới qua spacer của node pageBreak / sectionBreak.
 *                        Khi chỉnh sửa Header/Footer, tầng này được làm mờ (dimmed).
 *   Tầng 3 (Header/Footer): Lớp Header & Footer tương tác (Interactive Overlay Layer)
 *                        Hiển thị tiêu đề đầu trang và chân trang với số trang động ({PAGE}, {NUMPAGES}).
 *                        Cho phép nhấp đúp hoặc dùng Insert Ribbon để mở HeaderFooterEditor trực quan.
 */
export function PageRenderer({
  children,
  editor,
  className = "",
  style = {},
  onClick,
}: PageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { pageSettings, dimensions, cssVariables } = usePageSettings();

  const sections = useDocumentStore((state) => state.sections);
  const updateSectionHeader = useDocumentStore((state) => state.updateSectionHeader);
  const updateSectionFooter = useDocumentStore((state) => state.updateSectionFooter);
  const updateSectionHeaderFooter = useDocumentStore((state) => state.updateSectionHeaderFooter);

  const {
    isEditing,
    activeZone,
    activeSectionIndex,
    activePageNumber,
    openHeader,
    openFooter,
    close,
  } = useHeaderFooterStore();

  const { pages, pageCount, currentPage } = usePagination({
    editor,
    editorContainerRef: containerRef,
  });

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) {
      // Khi đang trong chế độ chỉnh sửa Header/Footer, nhấp vào thân trang sẽ đóng và quay về body
      e.stopPropagation();
      close();
      if (editor) {
        editor.commands.focus();
      }
      return;
    }

    if (onClick) {
      onClick(e);
    }
    // Khi người dùng click vào vùng lề trang trắng hoặc container tiptap bên ngoài dòng chữ
    if (
      editor &&
      (e.target === containerRef.current ||
        (e.target as HTMLElement).classList.contains("tiptap-container") ||
        (e.target as HTMLElement).classList.contains("physical-page-sheet") ||
        (e.target as HTMLElement).classList.contains("pagination-sheets-layer") ||
        (e.target as HTMLElement).classList.contains("editor-page-wrapper"))
    ) {
      editor.commands.focus("end");
    }
  };

  const orientationText = pageSettings.orientation === "portrait" ? "Dọc" : "Ngang";
  const ariaLabel = `Tài liệu soạn thảo ${pageSettings.paperSize} (${dimensions.width} x ${dimensions.height} mm) - ${pageCount} trang - Hướng ${orientationText}`;

  const maxSheetWidthMm =
    pages.length > 0
      ? Math.max(...pages.map((p) => p.widthMm))
      : dimensions.width;

  const mergedStyles: React.CSSProperties = {
    ...cssVariables,
    width: `${maxSheetWidthMm}mm`,
    ...style,
  };

  return (
    <div
      className={`editor-page-wrapper multi-page-workspace ${className}`}
      style={mergedStyles}
      role="region"
      aria-label={ariaLabel}
      data-paper-size={pageSettings.paperSize}
      data-orientation={pageSettings.orientation}
      data-margin-preset={pageSettings.marginPreset}
      data-page-count={pageCount}
      data-current-page={currentPage}
    >
      {/* Tầng 1: Lớp các trang giấy vật lý nền (Background Physical Paper Sheets) */}
      <div className="pagination-sheets-layer" aria-hidden="true">
        {pages.map((page, index) => {
          const sheetMargins = page.margins || pageSettings.margins;
          const sheetPaperSize = page.paperSize || pageSettings.paperSize;

          return (
            <div
              key={page.pageNumber}
              className="physical-page-sheet"
              style={{
                width: `${page.widthMm}mm`,
                height: `${page.heightMm}mm`,
                marginBottom: index < pages.length - 1 ? `${PAGE_GAP_PX}px` : 0,
              }}
              data-page-number={page.pageNumber}
              data-section-index={page.sectionIndex || 1}
              data-paper-size={sheetPaperSize}
              data-orientation={page.orientation || pageSettings.orientation}
            >
              {/* Khung chỉ dẫn lề trang (Subtle margin boundary) */}
              <div
                className="physical-page-margin-box"
                style={{
                  top: `${sheetMargins.top}mm`,
                  bottom: `${sheetMargins.bottom}mm`,
                  left: `${sheetMargins.left}mm`,
                  right: `${sheetMargins.right}mm`,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Tầng 2: Lớp nội dung soạn thảo ProseMirror đơn nhất (Single Editor Content Layer) */}
      <div
        ref={containerRef}
        className={`editor-content-layer page-renderer-sheet ${isEditing ? "is-dimmed" : ""}`}
        style={{
          width: `${maxSheetWidthMm}mm`,
          minHeight: `${dimensions.height}mm`,
          paddingTop: `${pageSettings.margins.top}mm`,
          paddingBottom: `${pageSettings.margins.bottom}mm`,
          paddingLeft: `${pageSettings.margins.left}mm`,
          paddingRight: `${pageSettings.margins.right}mm`,
        }}
        onClick={handlePageClick}
      >
        {children}
      </div>

      {/* Tầng 3: Lớp Header & Footer tương tác (Interactive Overlay Layer - Phase 2.8) */}
      <div className="pagination-headers-footers-layer">
        {pages.map((page, index) => {
          const sectionIndex = page.sectionIndex || 1;
          const sheetMargins = page.margins || pageSettings.margins;
          const effectiveHF = getEffectiveHeaderFooter(sections, sectionIndex);
          const targetSection = sections.find((s) => s.index === sectionIndex);
          const isLinked =
            sectionIndex > 1 &&
            (targetSection?.headerFooter?.linkToPrevious ?? true);
          const canLinkToPrevious = sectionIndex > 1;

          // Xác định trang hiển thị editor trong section (ưu tiên activePageNumber nếu thuộc section này, fallback về trang đầu của section)
          const pagesInThisSection = pages.filter(
            (p) => (p.sectionIndex || 1) === sectionIndex
          );
          const targetEditorPage = pagesInThisSection.some(
            (p) => p.pageNumber === activePageNumber
          )
            ? activePageNumber
            : (pagesInThisSection[0]?.pageNumber ?? page.pageNumber);

          const isEditingHeaderHere =
            isEditing &&
            activeZone === "header" &&
            activeSectionIndex === sectionIndex &&
            page.pageNumber === targetEditorPage;

          const isEditingFooterHere =
            isEditing &&
            activeZone === "footer" &&
            activeSectionIndex === sectionIndex &&
            page.pageNumber === targetEditorPage;

          const headerFormattedText = formatHeaderFooterText(
            effectiveHF.header.text,
            page.pageNumber,
            pageCount
          );

          const footerFormattedText = formatHeaderFooterText(
            effectiveHF.footer.text,
            page.pageNumber,
            pageCount
          );

          return (
            <div
              key={page.pageNumber}
              className="hf-page-slot"
              style={{
                width: `${page.widthMm}mm`,
                height: `${page.heightMm}mm`,
                marginBottom: index < pages.length - 1 ? `${PAGE_GAP_PX}px` : 0,
              }}
              data-page-number={page.pageNumber}
              data-section-index={sectionIndex}
            >
              {/* Header của trang */}
              {isEditingHeaderHere ? (
                <div
                  className="hf-editor-mount"
                  style={{
                    top: `${Math.max(4, sheetMargins.top / 3)}mm`,
                    left: `${sheetMargins.left}mm`,
                    right: `${sheetMargins.right}mm`,
                  }}
                >
                  <HeaderFooterEditor
                    zone="header"
                    sectionIndex={sectionIndex}
                    pageNumber={page.pageNumber}
                    pageCount={pageCount}
                    item={effectiveHF.header}
                    isLinked={isLinked}
                    canLinkToPrevious={canLinkToPrevious}
                    onUpdateItem={(partial) =>
                      updateSectionHeader(sectionIndex, partial)
                    }
                    onToggleLink={() => {
                      updateSectionHeaderFooter(sectionIndex, {
                        linkToPrevious: !isLinked,
                      });
                    }}
                    onClose={() => {
                      close();
                      if (editor) editor.commands.focus();
                    }}
                  />
                </div>
              ) : (
                <div
                  className={`physical-page-header ${
                    headerFormattedText ? "has-content" : "is-empty"
                  }`}
                  style={{
                    top: `${Math.max(6, sheetMargins.top / 2.5)}mm`,
                    left: `${sheetMargins.left}mm`,
                    right: `${sheetMargins.right}mm`,
                    textAlign: effectiveHF.header.alignment,
                    fontWeight: effectiveHF.header.bold ? 700 : 400,
                    fontStyle: effectiveHF.header.italic ? "italic" : "normal",
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openHeader(sectionIndex, page.pageNumber);
                  }}
                  title="Nhấp đúp để chỉnh sửa Header"
                  role="region"
                  aria-label={`Header trang ${page.pageNumber}`}
                >
                  {headerFormattedText ? (
                    <span className="hf-text-content">{headerFormattedText}</span>
                  ) : (
                    <span className="hf-placeholder-hint">
                      Header (nhấp đúp để chỉnh sửa)
                    </span>
                  )}
                </div>
              )}

              {/* Footer của trang */}
              {isEditingFooterHere ? (
                <div
                  className="hf-editor-mount"
                  style={{
                    bottom: `${Math.max(4, sheetMargins.bottom / 3)}mm`,
                    left: `${sheetMargins.left}mm`,
                    right: `${sheetMargins.right}mm`,
                  }}
                >
                  <HeaderFooterEditor
                    zone="footer"
                    sectionIndex={sectionIndex}
                    pageNumber={page.pageNumber}
                    pageCount={pageCount}
                    item={effectiveHF.footer}
                    isLinked={isLinked}
                    canLinkToPrevious={canLinkToPrevious}
                    onUpdateItem={(partial) =>
                      updateSectionFooter(sectionIndex, partial)
                    }
                    onToggleLink={() => {
                      updateSectionHeaderFooter(sectionIndex, {
                        linkToPrevious: !isLinked,
                      });
                    }}
                    onClose={() => {
                      close();
                      if (editor) editor.commands.focus();
                    }}
                  />
                </div>
              ) : (
                <div
                  className={`physical-page-footer ${
                    footerFormattedText ? "has-content" : "is-empty"
                  }`}
                  style={{
                    bottom: `${Math.max(6, sheetMargins.bottom / 2.5)}mm`,
                    left: `${sheetMargins.left}mm`,
                    right: `${sheetMargins.right}mm`,
                    textAlign: effectiveHF.footer.alignment,
                    fontWeight: effectiveHF.footer.bold ? 700 : 400,
                    fontStyle: effectiveHF.footer.italic ? "italic" : "normal",
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openFooter(sectionIndex, page.pageNumber);
                  }}
                  title="Nhấp đúp để chỉnh sửa Footer"
                  role="region"
                  aria-label={`Footer trang ${page.pageNumber}`}
                >
                  {footerFormattedText ? (
                    <span className="hf-text-content">{footerFormattedText}</span>
                  ) : (
                    <span className="hf-placeholder-hint">
                      Footer (nhấp đúp để chỉnh sửa)
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PageRenderer;
