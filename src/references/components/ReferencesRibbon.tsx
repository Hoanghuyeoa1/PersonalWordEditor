import { useState, useEffect } from "react";
import {
  BookOpen,
  RefreshCw,
  Trash2,
  FileText,
  FileDown,
  ChevronRight,
  ChevronLeft,
  ScrollText,
  Quote,
  BookMarked,
  Library,
  Tag,
  ListOrdered,
  ExternalLink,
  Compass,
  Bookmark,
} from "lucide-react";
import { getReferenceItemDescriptor } from "../services/referencesRegistry.ts";
import { ReferencesRibbonButton } from "./ReferencesRibbonButton.tsx";
import { useReferencesCommands } from "../hooks/useReferencesCommands.ts";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import { useEditorStore } from "../../stores/editorStore.ts";
import { TocDialog } from "./TocDialog.tsx";
import { TocService } from "../services/tocService.ts";
import { CaptionDialog } from "./CaptionDialog.tsx";
import { CrossReferenceDialog } from "./CrossReferenceDialog.tsx";
import { CaptionService } from "../services/captionService.ts";
import { CrossReferenceService } from "../services/crossReferenceService.ts";
import { CitationService } from "../services/citationService.ts";
import { ManageSourcesDialog } from "./ManageSourcesDialog.tsx";
import { InsertCitationDialog } from "./InsertCitationDialog.tsx";
import { CitationStyleDialog } from "./CitationStyleDialog.tsx";
import { CaptionListDialog } from "./CaptionListDialog.tsx";
import { CaptionListService } from "../services/captionListService.ts";
import { insertTableOfFiguresCommand } from "../commands/referencesCommands.ts";
import { BookmarkManagerDialog } from "./BookmarkManagerDialog.tsx";



/**
 * ReferencesRibbon - Thanh công cụ Tham chiếu & Trích dẫn (Tab References)
 *
 * Phân chia thành 5 nhóm công cụ chuẩn mực:
 * 1. Table of Contents (Mục lục)
 * 2. Footnotes (Chú thích cuối trang / tài liệu)
 * 3. Citations & Bibliography (Trích dẫn & Thư mục tài liệu)
 * 4. Captions (Chú thích hình ảnh, bảng & Tham chiếu chéo)
 * 5. Navigation (Điều hướng đề mục & Thẻ đánh dấu)
 *
 * Tất cả các nút bấm được đồng bộ với References Registry:
 * - Kích hoạt tính năng Sơ đồ đề mục (Phase 6.2 - Headings Outline Navigation)
 * - Hiển thị badge phase kế hoạch ("6.3", "6.4", "6.5", "6.6", "6.7", "6.8") cho các tính năng tương lai
 * - Bảo toàn focus và dấu nháy của editor qua cơ chế preventBlur
 */
export function ReferencesRibbon() {
  const { dispatchCommand } = useReferencesCommands();
  const editor = useEditorStore((state) => state.editor);
  const [isTocDialogOpen, setIsTocDialogOpen] = useState(false);
  const [isCaptionDialogOpen, setIsCaptionDialogOpen] = useState(false);
  const [isCrossRefDialogOpen, setIsCrossRefDialogOpen] = useState(false);
  const [isManageSourcesDialogOpen, setIsManageSourcesDialogOpen] = useState(false);
  const [isInsertCitationDialogOpen, setIsInsertCitationDialogOpen] = useState(false);
  const [isCitationStyleDialogOpen, setIsCitationStyleDialogOpen] = useState(false);
  const [isCaptionListDialogOpen, setIsCaptionListDialogOpen] = useState(false);
  const [isBookmarksDialogOpen, setIsBookmarksDialogOpen] = useState(false);
  const [, setEditorTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => setEditorTick((t) => t + 1);
    editor.on("transaction", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);
    return () => {
      editor.off("transaction", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  const isReferencesPanelOpen = useReferencesStore((state) => state.isReferencesPanelOpen);
  const activeReferencePanel = useReferencesStore((state) => state.activeReferencePanel);
  const isOutlineOpen = isReferencesPanelOpen && activeReferencePanel === "outline";
  const hasExistingToc = editor && editor.state ? TocService.hasToc(editor.state.doc) : false;
  const canUpdateCaptionList = !!(
    editor && CaptionListService.resolveActiveCaptionList(editor)
  );

  // 1. Table of Contents Descriptors
  const insertTocDesc = getReferenceItemDescriptor("insertToc");
  const updateTocDesc = getReferenceItemDescriptor("updateToc");
  const removeTocDesc = getReferenceItemDescriptor("removeToc");

  // 2. Footnotes & Endnotes Descriptors
  const insertFootnoteDesc = getReferenceItemDescriptor("insertFootnote");
  const insertEndnoteDesc = getReferenceItemDescriptor("insertEndnote");
  const nextFootnoteDesc = getReferenceItemDescriptor("nextFootnote");
  const prevFootnoteDesc = getReferenceItemDescriptor("previousFootnote");
  const showNotesDesc = getReferenceItemDescriptor("showNotes");

  // 3. Citations & Bibliography Descriptors
  const insertCitationDesc = getReferenceItemDescriptor("insertCitation");
  const insertBibDesc = getReferenceItemDescriptor("insertBibliography");
  const manageSourcesDesc = getReferenceItemDescriptor("manageSources");
  const citationStyleDesc = getReferenceItemDescriptor("citationStyle");

  // 4. Captions & Cross-reference Descriptors
  const insertCaptionDesc = getReferenceItemDescriptor("insertCaption");
  const insertTofDesc = getReferenceItemDescriptor("insertTableOfFigures");
  const updateTofDesc = getReferenceItemDescriptor("updateTableOfFigures");
  const crossRefDesc = getReferenceItemDescriptor("crossReference");

  // 5. Navigation & Headings Outline Descriptors
  const outlineDesc = getReferenceItemDescriptor("headingsOutline");
  const bookmarksDesc = getReferenceItemDescriptor("bookmarksList");

  return (
    <div
      className="ribbon-tab-content ribbon-references-tab"
      role="region"
      aria-label="References & Citations Tools"
      style={{ display: "flex", alignItems: "stretch", height: "100%", overflowX: "auto" }}
    >
      {/* =====================================================================
          1. NHÓM TABLE OF CONTENTS (MỤC LỤC)
         ===================================================================== */}
      <div className="ribbon-group" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div className="ribbon-group-tools" style={{ display: "flex", gap: "4px", alignItems: "center", flex: 1 }}>
          {insertTocDesc && (
            <ReferencesRibbonButton
              descriptor={insertTocDesc}
              icon={<BookOpen size={20} />}
              size="large"
              onClick={() => setIsTocDialogOpen(true)}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {updateTocDesc && (
              <ReferencesRibbonButton
                descriptor={updateTocDesc}
                icon={<RefreshCw size={12} />}
                size="small"
                onClick={() => dispatchCommand("updateToc")}
              />
            )}
            {removeTocDesc && (
              <ReferencesRibbonButton
                descriptor={removeTocDesc}
                icon={<Trash2 size={12} />}
                size="small"
                onClick={() => dispatchCommand("removeToc")}
              />
            )}
          </div>
        </div>
        <div className="ribbon-group-title">Mục lục</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* =====================================================================
          2. NHÓM FOOTNOTES & ENDNOTES (CHÚ THÍCH CHÂN TRANG / CUỐI BÀI)
         ===================================================================== */}
      <div className="ribbon-group" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div className="ribbon-group-tools" style={{ display: "flex", gap: "4px", alignItems: "center", flex: 1 }}>
          {insertFootnoteDesc && (
            <ReferencesRibbonButton
              descriptor={insertFootnoteDesc}
              icon={<FileText size={20} />}
              size="large"
              onClick={() => dispatchCommand("insertFootnote")}
            />
          )}
          {insertEndnoteDesc && (
            <ReferencesRibbonButton
              descriptor={insertEndnoteDesc}
              icon={<FileDown size={20} />}
              size="large"
              onClick={() => dispatchCommand("insertEndnote")}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {nextFootnoteDesc && (
              <ReferencesRibbonButton
                descriptor={nextFootnoteDesc}
                icon={<ChevronRight size={12} />}
                size="small"
                onClick={() => dispatchCommand("nextFootnote")}
              />
            )}
            {prevFootnoteDesc && (
              <ReferencesRibbonButton
                descriptor={prevFootnoteDesc}
                icon={<ChevronLeft size={12} />}
                size="small"
                onClick={() => dispatchCommand("previousFootnote")}
              />
            )}
            {showNotesDesc && (
              <ReferencesRibbonButton
                descriptor={showNotesDesc}
                icon={<ScrollText size={12} />}
                size="small"
                onClick={() => dispatchCommand("showNotes")}
              />
            )}
          </div>
        </div>
        <div className="ribbon-group-title">Chú thích</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* =====================================================================
          3. NHÓM CITATIONS & BIBLIOGRAPHY (TRÍCH DẪN & THƯ MỤC TÀI LIỆU)
         ===================================================================== */}
      <div className="ribbon-group" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div className="ribbon-group-tools" style={{ display: "flex", gap: "4px", alignItems: "center", flex: 1 }}>
          {insertCitationDesc && (
            <ReferencesRibbonButton
              descriptor={insertCitationDesc}
              icon={<Quote size={20} />}
              size="large"
              onClick={() => setIsInsertCitationDialogOpen(true)}
            />
          )}
          {insertBibDesc && (
            <ReferencesRibbonButton
              descriptor={insertBibDesc}
              icon={<BookMarked size={20} />}
              size="large"
              onClick={() => {
                if (editor) {
                  CitationService.insertBibliography(editor);
                }
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {manageSourcesDesc && (
              <ReferencesRibbonButton
                descriptor={manageSourcesDesc}
                icon={<Library size={12} />}
                size="small"
                onClick={() => setIsManageSourcesDialogOpen(true)}
              />
            )}
            {citationStyleDesc && (
              <ReferencesRibbonButton
                descriptor={citationStyleDesc}
                icon={<Tag size={12} />}
                size="small"
                onClick={() => setIsCitationStyleDialogOpen(true)}
              />
            )}
          </div>
        </div>
        <div className="ribbon-group-title">Trích dẫn & Thư mục</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* =====================================================================
          4. NHÓM CAPTIONS & CROSS-REFERENCE (CHÚ THÍCH HÌNH, BẢNG & THAM CHIẾU)
         ===================================================================== */}
      <div className="ribbon-group" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div className="ribbon-group-tools" style={{ display: "flex", gap: "4px", alignItems: "center", flex: 1 }}>
          {insertCaptionDesc && (
            <ReferencesRibbonButton
              descriptor={insertCaptionDesc}
              icon={<Tag size={20} />}
              size="large"
              onClick={() => setIsCaptionDialogOpen(true)}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {insertTofDesc && (
              <ReferencesRibbonButton
                descriptor={insertTofDesc}
                icon={<ListOrdered size={12} />}
                size="small"
                onClick={() => setIsCaptionListDialogOpen(true)}
              />
            )}
            {updateTofDesc && (
              <ReferencesRibbonButton
                descriptor={updateTofDesc}
                icon={<RefreshCw size={12} />}
                size="small"
                disabled={!canUpdateCaptionList}
                tooltip={
                  !canUpdateCaptionList && editor && CaptionListService.hasCaptionList(editor.state.doc)
                    ? "Đặt con trỏ vào danh mục cần cập nhật (F9)"
                    : undefined
                }
                onClick={() => dispatchCommand("updateTableOfFigures")}
              />
            )}
            {crossRefDesc && (
              <ReferencesRibbonButton
                descriptor={crossRefDesc}
                icon={<ExternalLink size={12} />}
                size="small"
                onClick={() => setIsCrossRefDialogOpen(true)}
              />
            )}
          </div>
        </div>
        <div className="ribbon-group-title">Nhãn & Tham chiếu</div>
      </div>

      <div className="ribbon-group-sep" />

      {/* =====================================================================
          5. NHÓM NAVIGATION (ĐIỀU HƯỚNG ĐỀ MỤC & THẺ ĐÁNH DẤU)
         ===================================================================== */}
      <div className="ribbon-group" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div className="ribbon-group-tools" style={{ display: "flex", gap: "4px", alignItems: "center", flex: 1 }}>
          {outlineDesc && (
            <ReferencesRibbonButton
              descriptor={outlineDesc}
              icon={<Compass size={20} />}
              size="large"
              isActive={isOutlineOpen}
              onClick={() => dispatchCommand("headingsOutline")}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {bookmarksDesc && (
              <ReferencesRibbonButton
                descriptor={bookmarksDesc}
                icon={<Bookmark size={12} />}
                size="small"
                onClick={() => setIsBookmarksDialogOpen(true)}
              />
            )}
          </div>
        </div>
        <div className="ribbon-group-title">Điều hướng</div>
      </div>

      {/* Dialog chèn / tùy chỉnh Mục lục */}
      <TocDialog
        isOpen={isTocDialogOpen}
        onClose={() => setIsTocDialogOpen(false)}
        hasExistingToc={hasExistingToc}
        onInsert={(config) => {
          if (editor) {
            TocService.insertToc(editor, config);
          }
        }}
        onUpdate={(options) => {
          if (editor) {
            TocService.updateToc(editor, options);
          }
        }}
      />

      {/* Dialog chèn chú thích (Caption) */}
      <CaptionDialog
        isOpen={isCaptionDialogOpen}
        onClose={() => setIsCaptionDialogOpen(false)}
        editor={editor}
        onInsert={(options) => {
          if (editor) {
            CaptionService.insertCaption(editor, options);
          }
        }}
      />

      {/* Dialog chèn tham chiếu chéo (Cross-reference) */}
      <CrossReferenceDialog
        isOpen={isCrossRefDialogOpen}
        onClose={() => setIsCrossRefDialogOpen(false)}
        editor={editor}
        onInsert={(options) => {
          if (editor) {
            CrossReferenceService.insertCrossReference(editor, options);
          }
        }}
      />

      {/* Dialog Quản lý Nguồn tài liệu tham khảo */}
      <ManageSourcesDialog
        isOpen={isManageSourcesDialogOpen}
        onClose={() => setIsManageSourcesDialogOpen(false)}
        editor={editor}
      />

      {/* Dialog chèn Trích dẫn */}
      <InsertCitationDialog
        isOpen={isInsertCitationDialogOpen}
        onClose={() => setIsInsertCitationDialogOpen(false)}
        editor={editor}
        onInsert={(options) => {
          if (editor) {
            CitationService.insertCitation(editor, options);
          }
        }}
        onOpenManageSources={() => setIsManageSourcesDialogOpen(true)}
      />

      {/* Dialog chọn Kiểu trích dẫn */}
      <CitationStyleDialog
        isOpen={isCitationStyleDialogOpen}
        onClose={() => setIsCitationStyleDialogOpen(false)}
        editor={editor}
      />

      {/* Dialog chèn Danh mục hình (Table of Figures) */}
      <CaptionListDialog
        isOpen={isCaptionListDialogOpen}
        onClose={() => setIsCaptionListDialogOpen(false)}
        editor={editor}
        initialLabel="Figure"
        initialTitle="Danh mục hình"
        onInsert={(config) => {
          if (editor) {
            insertTableOfFiguresCommand(editor, config);
          }
        }}
      />

      {/* Dialog Quản lý Thẻ đánh dấu (Bookmark Manager) */}
      <BookmarkManagerDialog
        isOpen={isBookmarksDialogOpen}
        onClose={() => setIsBookmarksDialogOpen(false)}
        editor={editor}
      />
    </div>
  );
}

