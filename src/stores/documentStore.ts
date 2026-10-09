import { create } from "zustand";
import type { JSONContent } from "@tiptap/core";
import type { DocumentModel, CommentItem, TrackChangeItem } from "../document/documentTypes.ts";
import type { DocumentStyle } from "../styles/types/styleTypes.ts";
import { updateDocumentStylesStylesheet } from "../styles/services/styleStylesheetService.ts";
import type { BibliographySource, CitationStyle } from "../references/types/citationTypes.ts";
import type { PageSettings } from "../page/types/pageTypes.ts";
import type { SectionModel } from "../page/types/sectionTypes.ts";
import type {
  SectionHeaderFooter,
  HeaderFooterItem,
  HeaderFooterAlignment,
} from "../page/types/headerFooterTypes.ts";
import {
  DEFAULT_SECTION_HEADER_FOOTER,
  DEFAULT_HEADER_CONTENT,
  DEFAULT_FOOTER_CONTENT,
} from "../page/types/headerFooterTypes.ts";
import {
  createInitialDocument,
  extractDocumentStats,
  updateDocumentContent,
  updateDocumentPageSettings,
  type DocumentStats,
} from "../document/documentModel.ts";
import {
  DEFAULT_PAGE_SETTINGS,
  validateAndNormalizePageSettings,
} from "../page/index.ts";
import {
  extractSections,
  updateSectionSettingsInAst,
  updateSectionHeaderFooterInAst,
} from "../page/services/sectionService.ts";

export interface DocumentState {
  /** Tài liệu hiện tại đang mở trong phiên làm việc */
  document: DocumentModel;
  /** Thiết lập trang của Section hiện tại (khổ giấy, hướng, lề) */
  pageSettings: PageSettings;
  /** Cấu hình Header và Footer của Section hiện tại (Phase 2.8) */
  headerFooter: SectionHeaderFooter;
  /** Danh sách các Section logic của tài liệu */
  sections: SectionModel[];
  /** Chỉ số section hiện tại của con trỏ (1-indexed) */
  currentSectionIndex: number;
  /** Đường dẫn file trên ổ đĩa (*.mwd) nếu đã lưu hoặc mở từ file */
  filePath: string | null;
  /** Bí danh đồng bộ cho filePath theo chuẩn Phase 1.8 */
  currentFilePath: string | null;
  /** Tiêu đề tài liệu */
  documentTitle: string;
  /** Thống kê số ký tự, từ, đoạn văn */
  stats: DocumentStats;
  /** Cờ đánh dấu tài liệu đã qua chỉnh sửa trong phiên hiện tại */
  isModified: boolean;
  /** Trạng thái bẩn (dirty state): true nếu nội dung khác với bản lưu cuối */
  isDirty: boolean;
  /** Snapshot của nội dung, tiêu đề và pageSettings tại thời điểm lưu/mở/tạo mới gần nhất */
  lastSavedSnapshot: {
    contentJson: string;
    title: string;
    pageSettingsJson: string;
    stylesJson?: string;
  };

  /** Cập nhật nội dung tài liệu (từ editor JSON AST) */
  updateContent: (content: JSONContent) => void;
  /** Cập nhật tiêu đề tài liệu */
  updateTitle: (title: string) => void;
  /** Cập nhật thiết lập trang cho Section hiện tại */
  updatePageSettings: (settings: Partial<PageSettings>) => void;
  /** Cập nhật cấu hình Header và Footer cho Section cụ thể (Phase 2.8) */
  updateSectionHeaderFooter: (
    sectionIndex: number,
    partial: {
      linkToPrevious?: boolean;
      header?: Partial<HeaderFooterItem>;
      footer?: Partial<HeaderFooterItem>;
    }
  ) => void;
  /** Cập nhật riêng phần Header cho Section */
  updateSectionHeader: (
    sectionIndex: number,
    headerPartial: Partial<HeaderFooterItem>
  ) => void;
  /** Cập nhật riêng phần Footer cho Section */
  updateSectionFooter: (
    sectionIndex: number,
    footerPartial: Partial<HeaderFooterItem>
  ) => void;
  /** Chèn số trang semantic {PAGE} vào Header hoặc Footer của Section */
  insertPageNumber: (
    sectionIndex: number,
    target: "header" | "footer",
    alignment?: HeaderFooterAlignment
  ) => void;
  /** Ngắt liên kết với section trước (unlink) cho Section k > 1 */
  unlinkSectionHeaderFooter: (sectionIndex: number) => void;
  /** Đặt chỉ số section hiện tại (dựa trên vị trí con trỏ) */
  setCurrentSectionIndex: (index: number) => void;
  /** Đặt đường dẫn file hiện tại */
  setFilePath: (path: string | null) => void;
  /** Đánh dấu tài liệu đã được lưu vào đường dẫn thành công */
  markSaved: (path: string) => void;
  /** Danh sách các bình luận trong tài liệu (Phase 5.4) */
  comments: CommentItem[];
  /** Danh sách các thay đổi được theo dõi (Phase 5.5) */
  trackedChanges: TrackChangeItem[];
  /** Đặt lại danh sách thay đổi được theo dõi */
  setTrackedChanges: (changes: TrackChangeItem[]) => void;
  /** Thêm bình luận mới */
  addComment: (comment: CommentItem) => void;
  /** Cập nhật nội dung hoặc thuộc tính bình luận */
  updateComment: (id: string, partial: Partial<CommentItem>) => void;
  /** Xóa bình luận khỏi tài liệu */
  deleteComment: (id: string) => void;
  /** Đánh dấu bình luận đã giải quyết */
  resolveComment: (id: string) => void;
  /** Mở lại bình luận đã giải quyết */
  reopenComment: (id: string) => void;
  /** Đặt lại toàn bộ danh sách bình luận */
  setComments: (comments: CommentItem[]) => void;
  /** Danh sách nguồn tài liệu tham khảo trong tài liệu (Phase 6.6) */
  bibliographySources: BibliographySource[];
  /** Kiểu trích dẫn mặc định ("apa" | "ieee") */
  citationStyle: CitationStyle;
  /** Thêm nguồn tài liệu tham khảo mới */
  addBibliographySource: (source: BibliographySource) => void;
  /** Cập nhật nguồn tài liệu tham khảo */
  updateBibliographySource: (id: string, partial: Partial<BibliographySource>) => void;
  /** Xóa nguồn tài liệu tham khảo */
  deleteBibliographySource: (id: string) => boolean;
  /** Đặt lại toàn bộ danh sách nguồn */
  setBibliographySources: (sources: BibliographySource[]) => void;
  /** Thay đổi kiểu trích dẫn mặc định */
  setCitationStyle: (style: CitationStyle) => void;
  /** Nạp một tài liệu mới vào store */
  setDocument: (doc: DocumentModel, filePath?: string | null) => void;
  /** Đặt lại tài liệu rỗng ban đầu (New) */
  resetDocument: () => void;
  /** Cập nhật toàn bộ danh sách định nghĩa styles của tài liệu */
  updateStyleDefinitions: (definitions: DocumentStyle[]) => void;
  /** Cập nhật hoặc thêm mới một định nghĩa style cụ thể và live update DOM */
  updateDocumentStyle: (style: DocumentStyle) => void;
}


export const useDocumentStore = create<DocumentState>((set) => {
  const initial = createInitialDocument();
  const initialContentJson = JSON.stringify(initial.content);
  const initialPageSettings = initial.pageSettings ?? DEFAULT_PAGE_SETTINGS;
  const initialPageSettingsJson = JSON.stringify(initialPageSettings);
  const initialHeaderFooter = initial.headerFooter ?? DEFAULT_SECTION_HEADER_FOOTER;
  const initialSections = extractSections(
    initial.content,
    initialPageSettings,
    initialHeaderFooter
  );

  return {
    document: {
      ...initial,
      sections: initialSections,
      headerFooter: initialHeaderFooter,
    },
    pageSettings: initialPageSettings,
    headerFooter: initialHeaderFooter,
    sections: initialSections,
    currentSectionIndex: 1,
    filePath: null,
    currentFilePath: null,
    documentTitle: initial.metadata.title,
    stats: extractDocumentStats(initial.content),
    comments: initial.comments ?? [],
    trackedChanges: initial.trackedChanges ?? [],
    bibliographySources: initial.references?.bibliographySources ?? [],
    citationStyle: initial.references?.citationStyle ?? "apa",
    isModified: false,
    isDirty: false,
    lastSavedSnapshot: {
      contentJson: initialContentJson,
      title: initial.metadata.title,
      pageSettingsJson: initialPageSettingsJson,
      stylesJson: JSON.stringify(initial.styles?.definitions ?? []),
    },

    updateContent: (newContent: JSONContent) =>
      set((state) => {
        const updated = updateDocumentContent(state.document, newContent);
        const newJson = JSON.stringify(newContent);
        const currentSettingsJson = JSON.stringify(state.pageSettings);
        const currentStylesJson = JSON.stringify(state.document.styles?.definitions ?? []);
        const isDirty =
          newJson !== state.lastSavedSnapshot.contentJson ||
          state.documentTitle !== state.lastSavedSnapshot.title ||
          currentSettingsJson !== state.lastSavedSnapshot.pageSettingsJson ||
          (state.lastSavedSnapshot.stylesJson ? currentStylesJson !== state.lastSavedSnapshot.stylesJson : false);

        const sections = extractSections(
          newContent,
          state.document.pageSettings,
          state.document.headerFooter
        );
        const safeSectionIndex = Math.min(
          sections.length,
          Math.max(1, state.currentSectionIndex)
        );
        const activeSec =
          sections.find((s) => s.index === safeSectionIndex) || sections[0];

        return {
          document: { ...updated, sections },
          sections,
          currentSectionIndex: safeSectionIndex,
          pageSettings: activeSec.pageSettings,
          headerFooter: activeSec.headerFooter || DEFAULT_SECTION_HEADER_FOOTER,
          stats: extractDocumentStats(newContent),
          isModified: isDirty,
          isDirty,
        };
      }),

    updateTitle: (title: string) =>
      set((state) => {
        const currentContentJson = JSON.stringify(state.document.content);
        const currentSettingsJson = JSON.stringify(state.pageSettings);
        const isDirty =
          currentContentJson !== state.lastSavedSnapshot.contentJson ||
          title !== state.lastSavedSnapshot.title ||
          currentSettingsJson !== state.lastSavedSnapshot.pageSettingsJson;

        return {
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              title,
              updatedAt: new Date().toISOString(),
            },
          },
          documentTitle: title,
          isModified: isDirty,
          isDirty,
        };
      }),

    setCurrentSectionIndex: (index: number) =>
      set((state) => {
        if (state.currentSectionIndex === index) return state;
        const sections = extractSections(
          state.document.content,
          state.document.pageSettings,
          state.document.headerFooter
        );
        const safeIndex = Math.min(sections.length, Math.max(1, index));
        const activeSec = sections.find((s) => s.index === safeIndex) || sections[0];
        return {
          currentSectionIndex: safeIndex,
          pageSettings: activeSec.pageSettings,
          headerFooter: activeSec.headerFooter || DEFAULT_SECTION_HEADER_FOOTER,
        };
      }),

    updatePageSettings: (partialSettings: Partial<PageSettings>) =>
      set((state) => {
        const currentSecIndex = state.currentSectionIndex;

        let updatedDoc: DocumentModel;
        let newActiveSettings: PageSettings;

        if (currentSecIndex <= 1) {
          // Cập nhật cho Section 1 (document-level settings)
          const merged: PageSettings = {
            ...state.document.pageSettings,
            ...partialSettings,
            margins: partialSettings.margins
              ? { ...state.document.pageSettings.margins, ...partialSettings.margins }
              : state.document.pageSettings.margins,
          };
          newActiveSettings = validateAndNormalizePageSettings(merged);
          updatedDoc = updateDocumentPageSettings(state.document, newActiveSettings);
        } else {
          // Cập nhật cho Section k > 1 (trong AST node sectionBreak)
          const { updatedContent } = updateSectionSettingsInAst(
            state.document.content,
            currentSecIndex,
            partialSettings,
            state.document.pageSettings
          );
          updatedDoc = updateDocumentContent(state.document, updatedContent);

          const updatedSections = extractSections(
            updatedContent,
            state.document.pageSettings,
            state.document.headerFooter
          );
          const activeSec =
            updatedSections.find((s) => s.index === currentSecIndex) || updatedSections[0];
          newActiveSettings = activeSec.pageSettings;
        }

        const updatedSections = extractSections(
          updatedDoc.content,
          updatedDoc.pageSettings,
          updatedDoc.headerFooter
        );
        const currentContentJson = JSON.stringify(updatedDoc.content);
        const newPageSettingsJson = JSON.stringify(newActiveSettings);
        const isDirty =
          currentContentJson !== state.lastSavedSnapshot.contentJson ||
          state.documentTitle !== state.lastSavedSnapshot.title ||
          newPageSettingsJson !== state.lastSavedSnapshot.pageSettingsJson;

        return {
          document: { ...updatedDoc, sections: updatedSections },
          pageSettings: newActiveSettings,
          sections: updatedSections,
          isModified: isDirty,
          isDirty,
        };
      }),

    updateSectionHeaderFooter: (sectionIndex, partial) =>
      set((state) => {
        let updatedDoc: DocumentModel;

        if (sectionIndex <= 1) {
          const currentHdrFtr = state.document.headerFooter || DEFAULT_SECTION_HEADER_FOOTER;
          const merged: SectionHeaderFooter = {
            linkToPrevious: false,
            header: {
              ...currentHdrFtr.header,
              ...(partial.header || {}),
            },
            footer: {
              ...currentHdrFtr.footer,
              ...(partial.footer || {}),
            },
          };
          updatedDoc = {
            ...state.document,
            headerFooter: merged,
          };
        } else {
          const { updatedContent, updatedDefaultHeaderFooter } =
            updateSectionHeaderFooterInAst(
              state.document.content,
              sectionIndex,
              partial,
              state.document.headerFooter
            );
          updatedDoc = {
            ...state.document,
            content: updatedContent,
            headerFooter: updatedDefaultHeaderFooter,
          };
        }

        const sections = extractSections(
          updatedDoc.content,
          updatedDoc.pageSettings,
          updatedDoc.headerFooter
        );
        const safeIndex = Math.min(sections.length, Math.max(1, state.currentSectionIndex));
        const activeSec = sections.find((s) => s.index === safeIndex) || sections[0];

        return {
          document: { ...updatedDoc, sections },
          sections,
          headerFooter: activeSec.headerFooter || DEFAULT_SECTION_HEADER_FOOTER,
          isModified: true,
          isDirty: true,
        };
      }),

    updateSectionHeader: (sectionIndex, headerPartial) => {
      useDocumentStore.getState().updateSectionHeaderFooter(sectionIndex, {
        header: headerPartial,
      });
    },

    updateSectionFooter: (sectionIndex, footerPartial) => {
      useDocumentStore.getState().updateSectionHeaderFooter(sectionIndex, {
        footer: footerPartial,
      });
    },

    insertPageNumber: (sectionIndex, target, alignment = "center") => {
      const state = useDocumentStore.getState();
      const sec = state.sections.find((s) => s.index === sectionIndex) || state.sections[0];
      const currentItem =
        target === "header"
          ? sec.headerFooter?.header || DEFAULT_HEADER_CONTENT
          : sec.headerFooter?.footer || DEFAULT_FOOTER_CONTENT;

      const newText = currentItem.text
        ? currentItem.text.includes("{PAGE}")
          ? currentItem.text
          : `${currentItem.text} {PAGE}`
        : "{PAGE}";

      useDocumentStore.getState().updateSectionHeaderFooter(sectionIndex, {
        [target]: {
          ...currentItem,
          text: newText,
          alignment,
        },
      });
    },

    unlinkSectionHeaderFooter: (sectionIndex) => {
      useDocumentStore.getState().updateSectionHeaderFooter(sectionIndex, {
        linkToPrevious: false,
      });
    },


    setFilePath: (path: string | null) =>
      set({
        filePath: path,
        currentFilePath: path,
      }),

    markSaved: (path: string) =>
      set((state) => {
        const filenameBase =
          path.split(/[/\\]/).pop()?.replace(/\.mwd$/i, "") ||
          state.document.metadata.title;
        const currentContentJson = JSON.stringify(state.document.content);
        const currentPageSettingsJson = JSON.stringify(state.pageSettings);

        return {
          filePath: path,
          currentFilePath: path,
          documentTitle: filenameBase,
          isModified: false,
          isDirty: false,
          lastSavedSnapshot: {
            contentJson: currentContentJson,
            title: filenameBase,
            pageSettingsJson: currentPageSettingsJson,
            stylesJson: JSON.stringify(state.document.styles?.definitions ?? []),
          },
          document: {
            ...state.document,
            metadata: {
              ...state.document.metadata,
              title: filenameBase,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }),

    addComment: (comment: CommentItem) =>
      set((state) => {
        const nextComments = [...(state.document.comments || []), comment];
        return {
          comments: nextComments,
          document: {
            ...state.document,
            comments: nextComments,
          },
          isModified: true,
          isDirty: true,
        };
      }),

    updateComment: (id: string, partial: Partial<CommentItem>) =>
      set((state) => {
        const nextComments = (state.document.comments || []).map((c) =>
          c.id === id ? { ...c, ...partial, updatedAt: new Date().toISOString() } : c
        );
        return {
          comments: nextComments,
          document: {
            ...state.document,
            comments: nextComments,
          },
          isModified: true,
          isDirty: true,
        };
      }),

    deleteComment: (id: string) =>
      set((state) => {
        const nextComments = (state.document.comments || []).filter((c) => c.id !== id);
        return {
          comments: nextComments,
          document: {
            ...state.document,
            comments: nextComments,
          },
          isModified: true,
          isDirty: true,
        };
      }),

    resolveComment: (id: string) =>
      set((state) => {
        const nextComments = (state.document.comments || []).map((c) =>
          c.id === id ? { ...c, resolved: true, updatedAt: new Date().toISOString() } : c
        );
        return {
          comments: nextComments,
          document: {
            ...state.document,
            comments: nextComments,
          },
          isModified: true,
          isDirty: true,
        };
      }),

    reopenComment: (id: string) =>
      set((state) => {
        const nextComments = (state.document.comments || []).map((c) =>
          c.id === id ? { ...c, resolved: false, updatedAt: new Date().toISOString() } : c
        );
        return {
          comments: nextComments,
          document: {
            ...state.document,
            comments: nextComments,
          },
          isModified: true,
          isDirty: true,
        };
      }),

    setComments: (comments: CommentItem[]) =>
      set((state) => ({
        comments,
        document: {
          ...state.document,
          comments,
        },
        isModified: true,
        isDirty: true,
      })),

    setTrackedChanges: (changes: TrackChangeItem[]) =>
      set((state) => ({
        trackedChanges: changes,
        document: {
          ...state.document,
          trackedChanges: changes,
        },
        isModified: true,
        isDirty: true,
      })),

    addBibliographySource: (source: BibliographySource) =>
      set((state) => {
        const existing = state.bibliographySources || [];
        const updated = [...existing, source];
        return {
          bibliographySources: updated,
          document: {
            ...state.document,
            references: {
              ...(state.document.references || {}),
              bibliographySources: updated,
            },
          },
          isModified: true,
          isDirty: true,
        };
      }),

    updateBibliographySource: (id: string, partial: Partial<BibliographySource>) =>
      set((state) => {
        const existing = state.bibliographySources || [];
        const updated = existing.map((s) => (s.id === id ? { ...s, ...partial } : s));
        return {
          bibliographySources: updated,
          document: {
            ...state.document,
            references: {
              ...(state.document.references || {}),
              bibliographySources: updated,
            },
          },
          isModified: true,
          isDirty: true,
        };
      }),

    deleteBibliographySource: (id: string) => {
      let deleted = false;
      set((state) => {
        const existing = state.bibliographySources || [];
        const updated = existing.filter((s) => s.id !== id);
        deleted = updated.length !== existing.length;
        return {
          bibliographySources: updated,
          document: {
            ...state.document,
            references: {
              ...(state.document.references || {}),
              bibliographySources: updated,
            },
          },
          isModified: true,
          isDirty: true,
        };
      });
      return deleted;
    },

    setBibliographySources: (sources: BibliographySource[]) =>
      set((state) => ({
        bibliographySources: sources,
        document: {
          ...state.document,
          references: {
            ...(state.document.references || {}),
            bibliographySources: sources,
          },
        },
        isModified: true,
        isDirty: true,
      })),

    setCitationStyle: (style: CitationStyle) =>
      set((state) => ({
        citationStyle: style,
        document: {
          ...state.document,
          references: {
            ...(state.document.references || {}),
            citationStyle: style,
          },
        },
        isModified: true,
        isDirty: true,
      })),

    setDocument: (doc: DocumentModel, filePath: string | null = null) => {
      const pageSettings = validateAndNormalizePageSettings(doc.pageSettings);
      const headerFooter = doc.headerFooter || DEFAULT_SECTION_HEADER_FOOTER;
      const sections = extractSections(doc.content, pageSettings, headerFooter);
      const docComments = doc.comments ?? [];
      const docTrackedChanges = doc.trackedChanges ?? [];
      const docSources = doc.references?.bibliographySources ?? [];
      const docCitationStyle = doc.references?.citationStyle ?? "apa";
      const normalizedDoc: DocumentModel = {
        ...doc,
        pageSettings,
        headerFooter,
        sections,
        comments: docComments,
        trackedChanges: docTrackedChanges,
        references: {
          ...(doc.references || {}),
          bibliographySources: docSources,
          citationStyle: docCitationStyle,
        },
      };
      set({
        document: normalizedDoc,
        pageSettings,
        headerFooter: sections[0].headerFooter || headerFooter,
        sections,
        currentSectionIndex: 1,
        filePath,
        currentFilePath: filePath,
        documentTitle: doc.metadata.title,
        stats: extractDocumentStats(doc.content),
        comments: docComments,
        trackedChanges: docTrackedChanges,
        bibliographySources: docSources,
        citationStyle: docCitationStyle,
        isModified: false,
        isDirty: false,
        lastSavedSnapshot: {
          contentJson: JSON.stringify(doc.content),
          title: doc.metadata.title,
          pageSettingsJson: JSON.stringify(pageSettings),
          stylesJson: JSON.stringify(doc.styles?.definitions ?? []),
        },
      });
      updateDocumentStylesStylesheet(doc.styles?.definitions ?? []);
    },

    resetDocument: () => {
      const fresh = createInitialDocument();
      const freshSettings = fresh.pageSettings ?? DEFAULT_PAGE_SETTINGS;
      const freshHeaderFooter = fresh.headerFooter ?? DEFAULT_SECTION_HEADER_FOOTER;
      const freshSections = extractSections(fresh.content, freshSettings, freshHeaderFooter);
      set({
        document: {
          ...fresh,
          sections: freshSections,
          headerFooter: freshHeaderFooter,
          comments: [],
          trackedChanges: [],
          references: {
            bibliographySources: [],
            citationStyle: "apa",
          },
        },
        pageSettings: freshSettings,
        headerFooter: freshHeaderFooter,
        sections: freshSections,
        currentSectionIndex: 1,
        filePath: null,
        currentFilePath: null,
        documentTitle: fresh.metadata.title,
        stats: extractDocumentStats(fresh.content),
        comments: [],
        trackedChanges: [],
        bibliographySources: [],
        citationStyle: "apa",
        isModified: false,
        isDirty: false,
        lastSavedSnapshot: {
          contentJson: JSON.stringify(fresh.content),
          title: fresh.metadata.title,
          pageSettingsJson: JSON.stringify(freshSettings),
          stylesJson: JSON.stringify(fresh.styles?.definitions ?? []),
        },
      });
      updateDocumentStylesStylesheet(fresh.styles?.definitions ?? []);
    },

    updateStyleDefinitions: (definitions: DocumentStyle[]) => {
      set((state) => {
        const updatedStyles = {
          ...state.document.styles,
          definitions,
        };
        updateDocumentStylesStylesheet(definitions);
        const currentContentJson = JSON.stringify(state.document.content);
        const currentSettingsJson = JSON.stringify(state.pageSettings);
        const currentStylesJson = JSON.stringify(definitions);
        const isDirty =
          currentContentJson !== state.lastSavedSnapshot.contentJson ||
          state.documentTitle !== state.lastSavedSnapshot.title ||
          currentSettingsJson !== state.lastSavedSnapshot.pageSettingsJson ||
          (state.lastSavedSnapshot.stylesJson
            ? currentStylesJson !== state.lastSavedSnapshot.stylesJson
            : true);
        return {
          document: {
            ...state.document,
            styles: updatedStyles,
          },
          isModified: isDirty,
          isDirty,
        };
      });
    },

    updateDocumentStyle: (style: DocumentStyle) => {
      set((state) => {
        const currentDefs = state.document.styles?.definitions ?? [];
        const index = currentDefs.findIndex((s) => s.id === style.id);
        let newDefs: DocumentStyle[];
        if (index >= 0) {
          newDefs = [...currentDefs];
          newDefs[index] = style;
        } else {
          newDefs = [...currentDefs, style];
        }
        const updatedStyles = {
          ...state.document.styles,
          definitions: newDefs,
        };
        updateDocumentStylesStylesheet(newDefs);
        return {
          document: {
            ...state.document,
            styles: updatedStyles,
          },
          isModified: true,
          isDirty: true,
        };
      });
    },

  };
});
