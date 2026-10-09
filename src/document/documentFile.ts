import type { JSONContent } from "@tiptap/core";
import type {
  DocumentMetadata,
  DocumentModel,
  CommentItem,
  TrackChangeItem,
  DocumentReferencesMetadata,
} from "./documentTypes.ts";
import type { DocumentStylesMetadata } from "../styles/types/styleTypes.ts";
import {
  createDefaultStylesMetadata,
  normalizeStyleCollection,
  normalizeDocumentContentStyles,
} from "../styles/index.ts";
import type { PageSettings } from "../page/types/pageTypes.ts";
import type { SectionHeaderFooter } from "../page/types/headerFooterTypes.ts";
import {
  DEFAULT_HEADER_CONTENT,
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_SECTION_HEADER_FOOTER,
} from "../page/types/headerFooterTypes.ts";
import { DEFAULT_PAGE_SETTINGS, validateAndNormalizePageSettings } from "../page/index.ts";
import { HeadingService } from "../references/services/headingService.ts";
import { ReferencePersistenceService } from "../references/services/referencePersistenceService.ts";
import { sanitizeSemanticPaginationAttributes } from "../page/services/semanticPaginationPersistence.ts";
import { TablePersistenceService } from "../editor/tablePersistenceService.ts";
import { TrackChangesPersistenceService } from "../review/trackChanges/trackChangesPersistenceService.ts";

export const MWD_FORMAT_IDENTIFIER = "PersonalWordDocument" as const;
export const MWD_CURRENT_FORMAT_VERSION = 1;

/**
 * Cấu trúc tệp tin tài liệu cá nhân (*.mwd) chuẩn versioned:
 * {
 *   "format": "PersonalWordDocument",
 *   "version": 1,
 *   "metadata": { id, title, version, createdAt, updatedAt },
 *   "pageSettings": { paperSize, orientation, margins, marginPreset },
 *   "headerFooter": { linkToPrevious, header, footer },
 *   "comments": [ { id, author, createdAt, updatedAt, content, resolved, selectedText } ],
 *   "trackedChanges": [ { id, type, author, timestamp, text } ],
 *   "references": { anchors: { ... } },
 *   "styles": { definitions: [ ... ] },
 *   "document": { type: "doc", content: [...] }
 * }
 */
export interface MwdFilePackage {
  format: typeof MWD_FORMAT_IDENTIFIER;
  version: number;
  metadata: DocumentMetadata;
  pageSettings?: PageSettings;
  headerFooter?: SectionHeaderFooter;
  comments?: CommentItem[];
  trackedChanges?: TrackChangeItem[];
  references?: DocumentReferencesMetadata;
  styles?: DocumentStylesMetadata;
  document: JSONContent;
}

export type DeserializeMwdResult =
  | { success: true; document: DocumentModel; formatVersion: number }
  | { success: false; error: string };

/**
 * Đóng gói và tuần tự hóa DocumentModel thành chuỗi JSON .mwd chuẩn hóa.
 */
export function serializeDocumentToMwd(doc: DocumentModel): string {
  const safeReferences = ReferencePersistenceService.prepareReferencesForSerialization(
    doc.content,
    doc.references
  );

  // Chuẩn hóa và làm sạch AST Track Changes trước khi serialize (Phase 10)
  const safeTrackedAst = TrackChangesPersistenceService.prepareAstForSerialization(doc.content);

  // Chuẩn hóa danh sách trackedChanges: loại bỏ runtime numeric positions (from, to), đồng bộ với AST
  const safeTrackedChanges = TrackChangesPersistenceService.prepareTrackedChangesForSerialization(
    safeTrackedAst,
    doc.trackedChanges
  );

  const filePackage: MwdFilePackage = {
    format: MWD_FORMAT_IDENTIFIER,
    version: MWD_CURRENT_FORMAT_VERSION,
    metadata: {
      ...doc.metadata,
      updatedAt: new Date().toISOString(),
    },
    pageSettings: doc.pageSettings ?? DEFAULT_PAGE_SETTINGS,
    headerFooter: doc.headerFooter,
    comments: doc.comments ?? [],
    trackedChanges: safeTrackedChanges,
    references: safeReferences,
    styles: doc.styles ?? createDefaultStylesMetadata(),
    document: sanitizeSemanticPaginationAttributes(
      TablePersistenceService.normalizeTableAst(safeTrackedAst)
    ),
  };

  return JSON.stringify(filePackage, null, 2);
}

/**
 * Giải tuần tự hóa chuỗi nội dung .mwd, kiểm tra tính toàn vẹn, phiên bản và cấu trúc AST.
 * Xử lý mọi lỗi corrupt/invalid mà không làm sập ứng dụng.
 * Tương thích ngược 100% với file Phase 1 chưa có khối pageSettings (tự động áp dụng default).
 */
export function deserializeMwdToDocument(fileContent: string): DeserializeMwdResult {
  if (!fileContent || typeof fileContent !== "string" || !fileContent.trim()) {
    return {
      success: false,
      error: "Tệp tin rỗng hoặc không có dữ liệu văn bản.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (err) {
    return {
      success: false,
      error: `Tệp tin bị hỏng hoặc không đúng định dạng JSON hợp lệ (${err instanceof Error ? err.message : String(err)}).`,
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      success: false,
      error: "Cấu trúc tệp tin không hợp lệ (không phải là đối tượng JSON).",
    };
  }

  const data = parsed as Record<string, unknown>;

  // Kiểm tra định dạng
  if (data.format !== MWD_FORMAT_IDENTIFIER) {
    return {
      success: false,
      error: `Định dạng tệp không được hỗ trợ (nhận diện: "${String(data.format)}", yêu cầu: "${MWD_FORMAT_IDENTIFIER}").`,
    };
  }

  // Kiểm tra phiên bản định dạng
  if (typeof data.version !== "number" || data.version <= 0) {
    return {
      success: false,
      error: "Thông tin phiên bản tệp tin (version) không hợp lệ.",
    };
  }

  if (data.version > MWD_CURRENT_FORMAT_VERSION) {
    return {
      success: false,
      error: `Tệp tin được tạo bởi phiên bản mới hơn (v${data.version}), ứng dụng hiện tại chỉ hỗ trợ tối đa v${MWD_CURRENT_FORMAT_VERSION}.`,
    };
  }

  // Kiểm tra Metadata
  if (!data.metadata || typeof data.metadata !== "object") {
    return {
      success: false,
      error: "Tệp tin thiếu khối thông tin metadata bắt buộc.",
    };
  }

  const rawMeta = data.metadata as Partial<DocumentMetadata>;
  const meta: DocumentMetadata = {
    id: typeof rawMeta.id === "string" ? rawMeta.id : `doc-${Date.now()}`,
    title: typeof rawMeta.title === "string" ? rawMeta.title : "Tài liệu",
    version: typeof rawMeta.version === "number" ? rawMeta.version : 1,
    createdAt: typeof rawMeta.createdAt === "string" ? rawMeta.createdAt : new Date().toISOString(),
    updatedAt: typeof rawMeta.updatedAt === "string" ? rawMeta.updatedAt : new Date().toISOString(),
  };

  // Kiểm tra cây Document ProseMirror JSON
  if (!data.document || typeof data.document !== "object") {
    return {
      success: false,
      error: "Tệp tin thiếu khối nội dung văn bản (document content).",
    };
  }

  const docAst = data.document as JSONContent;
  if (docAst.type !== "doc" || !Array.isArray(docAst.content)) {
    return {
      success: false,
      error: "Cấu trúc cây AST ProseMirror không hợp lệ (root node phải có type='doc' và mảng content).",
    };
  }

  // Migration & Backward Compatibility:
  // Nếu tệp cũ không có pageSettings hoặc bị hỏng, validateAndNormalizePageSettings sẽ tự động áp dụng preset mặc định (A4, Portrait, Normal Margins)
  const pageSettings = validateAndNormalizePageSettings(data.pageSettings);
  const rawHf = data.headerFooter as Partial<SectionHeaderFooter> | undefined;
  const headerFooter: SectionHeaderFooter = rawHf
    ? {
        linkToPrevious: Boolean(rawHf.linkToPrevious),
        header: {
          ...DEFAULT_HEADER_CONTENT,
          ...(rawHf.header || {}),
        },
        footer: {
          ...DEFAULT_FOOTER_CONTENT,
          ...(rawHf.footer || {}),
        },
      }
    : { ...DEFAULT_SECTION_HEADER_FOOTER };

  const rawComments = Array.isArray(data.comments)
    ? (data.comments as CommentItem[])
    : [];

  const rawTrackedChanges = Array.isArray(data.trackedChanges)
    ? (data.trackedChanges as TrackChangeItem[])
    : undefined;

  const rawReferences =
    data.references && typeof data.references === "object"
      ? (data.references as DocumentReferencesMetadata)
      : undefined;

  // Chuẩn hóa Styles Metadata (Phase 1 Foundation): tương thích ngược 100% với file cũ thiếu styles
  const rawStyles =
    data.styles && typeof data.styles === "object"
      ? normalizeStyleCollection((data.styles as DocumentStylesMetadata).definitions)
      : createDefaultStylesMetadata();

  // Chuẩn hóa Heading IDs & Semantic Pagination (Phase 6.2 & Phase 12):
  // Khử thuộc tính runtime rò rỉ, khử ID trùng lặp và gán ID an toàn
  const safePaginationContent = sanitizeSemanticPaginationAttributes(docAst);
  const { updatedContent: normalizedHeadingContent } = HeadingService.normalizeHeadingIds(safePaginationContent);

  // Chuẩn hóa Style assignments trong AST (Phase 7): khử unknown styleId trên block & character marks mà không làm mất text
  const validStyleIds = new Set<string>(rawStyles.definitions.map((s) => s.id));
  const safeStyledContent = normalizeDocumentContentStyles(normalizedHeadingContent, validStyleIds);

  // Chuẩn hóa và bảo toàn hệ thống Tham chiếu (Phase 8): Caption Lists, Bookmarks, Cross-references
  const { updatedContent: safeContent } =
    ReferencePersistenceService.normalizeReferencesInAst(safeStyledContent);
  const safeReferences = ReferencePersistenceService.reconcileReferencesMetadata(
    safeContent,
    rawReferences
  );

  // Chuẩn hóa Table Engine 2.0 (Phase 10): bảo toàn rowspan, colspan, sizing, margins, styles, loại bỏ runtime fragments
  const safeTableContent = TablePersistenceService.normalizeTableAst(safeContent);

  // Chuẩn hóa Track Changes 2.0 & Formatting Revisions trong AST (Phase 10): xử lý malformed metadata, duplicate IDs, missing anchors
  const { updatedContent: safeTrackedContent, detectedRevisions } =
    TrackChangesPersistenceService.normalizeTrackChangesInAst(safeTableContent, validStyleIds);

  // Đối chiếu và đồng bộ siêu dữ liệu trackedChanges với AST (tương thích ngược file cũ, khử orphan metadata, partial review)
  const safeTrackedChanges = TrackChangesPersistenceService.reconcileTrackedChangesMetadata(
    safeTrackedContent,
    rawTrackedChanges,
    detectedRevisions
  );

  const documentModel: DocumentModel = {
    metadata: {
      id: meta.id,
      title: meta.title,
      version: meta.version,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    },
    content: safeTrackedContent,
    pageSettings,
    headerFooter,
    comments: rawComments,
    trackedChanges: safeTrackedChanges,
    references: safeReferences,
    styles: rawStyles,
  };


  return {
    success: true,
    document: documentModel,
    formatVersion: data.version,
  };
}
