/**
 * References Engine Module - Personal Word Editor (Phase 6 Architecture)
 *
 * Entry point xuất khẩu toàn bộ hệ thống References Engine:
 * - Types: References, TOC, Notes, Captions, Cross-references, Citations, Bibliography
 * - Services: ReferencesRegistry, ReferenceAnchorService, HeadingService, TocService, NoteService, CaptionService, CrossReferenceService, CitationService
 * - Commands: References Commands & Execution Pipeline
 * - Hooks: useReferencesCommands, useDocumentOutline
 * - Components: ReferencesRibbon, Sidebars, Modals & Dialogs
 * - Utils: Reference, Note, Caption & Citation formatting utilities
 * - Extensions: HeadingAnchor, TOC, NoteReference, ObjectAnchor, Caption, CrossReference, Citation, Bibliography
 */

export * from "./types/referencesTypes.ts";
export * from "./types/tocTypes.ts";
export * from "./types/noteTypes.ts";
export * from "./types/captionTypes.ts";
export * from "./types/captionListTypes.ts";
export * from "./types/crossReferenceTypes.ts";
export * from "./types/citationTypes.ts";
export * from "./types/bookmarkTypes.ts";
export * from "./services/referencesRegistry.ts";
export * from "./services/referenceAnchorService.ts";
export * from "./services/headingService.ts";
export * from "./services/tocService.ts";
export * from "./services/noteService.ts";
export * from "./services/captionService.ts";
export * from "./services/captionListService.ts";
export * from "./services/bookmarkService.ts";
export * from "./services/crossReferenceService.ts";
export * from "./services/citationService.ts";
export * from "./services/referencePersistenceService.ts";
export * from "./services/referenceUpdateService.ts";
export * from "./commands/referencesCommands.ts";
export * from "./hooks/useReferencesCommands.ts";
export * from "./hooks/useDocumentOutline.ts";
export * from "./components/ReferencesRibbonButton.tsx";
export * from "./components/ReferencesRibbon.tsx";
export * from "./components/DocumentOutlineSidebar.tsx";
export * from "./components/TocDialog.tsx";
export * from "./components/NotesSidebar.tsx";
export * from "./components/DocumentNotesView.tsx";
export * from "./components/CaptionDialog.tsx";
export * from "./components/CaptionListDialog.tsx";
export * from "./components/CrossReferenceDialog.tsx";

export * from "./components/ManageSourcesDialog.tsx";
export * from "./components/InsertCitationDialog.tsx";
export * from "./components/CitationStyleDialog.tsx";
export * from "./components/BookmarkManagerDialog.tsx";
export * from "./utils/referenceUtils.ts";
export * from "./extensions/index.ts";
