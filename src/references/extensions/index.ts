/**
 * References Extensions - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Thư mục nền móng cho các Tiptap / ProseMirror extensions của References Subsystem:
 * - Phase 6.2: HeadingAnchorExtension (ID attribute cho heading)
 * - Phase 6.3: TableOfContentsExtension (Semantic atom block node cho mục lục)
 * - Phase 6.4: NoteReferenceExtension (Semantic atom inline node cho Footnote & Endnote)
 * - Phase 6.5: ObjectAnchorExtension, CaptionExtension, CrossReferenceExtension
 * - Phase 6.6: Citation & Bibliography Extensions (Planned)
 */

export const REFERENCES_EXTENSION_VERSION = "6.6.0";

export * from "./headingAnchorExtension.ts";
export * from "./tableOfContentsExtension.ts";
export * from "./noteExtension.ts";
export * from "./objectAnchorExtension.ts";
export * from "./captionExtension.ts";
export * from "./crossReferenceExtension.ts";
export * from "./citationExtension.ts";
export * from "./bibliographyExtension.ts";
export * from "./captionListExtension.ts";
export * from "./bookmarkExtension.ts";

