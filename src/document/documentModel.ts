import type { JSONContent } from "@tiptap/core";
import type { DocumentModel } from "./documentTypes.ts";
import type { PageSettings } from "../page/types/pageTypes.ts";
import {
  DEFAULT_PAGE_SETTINGS,
  validateAndNormalizePageSettings,
  isValidPaperSize,
  isValidOrientation,
} from "../page/index.ts";
import { createDefaultStylesMetadata } from "../styles/services/builtInStyles.ts";

/**
 * Sinh UUID ngẫu nhiên cho tài liệu.
 */
export function generateDocumentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "doc-" + Math.random().toString(36).substring(2, 11) + "-" + Date.now().toString(36);
}

/**
 * Khởi tạo nội dung mặc định của cây ProseMirror JSON document.
 * Tối thiểu gồm 1 root node type="doc" và 1 node type="paragraph".
 */
export function createDefaultDocumentContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Chào mừng bạn đến với Personal Word Editor. Hãy bắt đầu nhập văn bản tại đây...",
          },
        ],
      },
    ],
  };
}

/**
 * Tạo một DocumentModel mới kèm metadata cơ bản, PageSettings chuẩn và Styles định nghĩa mặc định.
 */
export function createInitialDocument(
  title = "Tài liệu chưa đặt tên",
  initialContent?: JSONContent,
  pageSettings?: PageSettings
): DocumentModel {
  const now = new Date().toISOString();
  return {
    metadata: {
      id: generateDocumentId(),
      title,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    content: initialContent ?? createDefaultDocumentContent(),
    pageSettings: pageSettings
      ? validateAndNormalizePageSettings(pageSettings)
      : {
          paperSize: DEFAULT_PAGE_SETTINGS.paperSize,
          orientation: DEFAULT_PAGE_SETTINGS.orientation,
          margins: { ...DEFAULT_PAGE_SETTINGS.margins },
          marginPreset: DEFAULT_PAGE_SETTINGS.marginPreset,
        },
    comments: [],
    styles: createDefaultStylesMetadata(),
  };
}

/**
 * Kiểm tra tính hợp lệ tối thiểu của một DocumentModel.
 */
export function isValidDocumentModel(data: unknown): data is DocumentModel {
  if (!data || typeof data !== "object") return false;
  const doc = data as Partial<DocumentModel>;
  if (!doc.metadata || typeof doc.metadata !== "object") return false;
  const { id, title, version, createdAt, updatedAt } = doc.metadata;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof version !== "number" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return false;
  }
  if (!doc.content || typeof doc.content !== "object") return false;
  if (doc.content.type !== "doc") return false;

  // Nếu có pageSettings, kiểm tra tính hợp lệ cơ bản
  if (doc.pageSettings) {
    if (
      !isValidPaperSize(doc.pageSettings.paperSize) ||
      !isValidOrientation(doc.pageSettings.orientation)
    ) {
      return false;
    }
  }

  // Nếu có styles, kiểm tra cấu trúc cơ bản
  if (doc.styles !== undefined && doc.styles !== null) {
    if (typeof doc.styles !== "object" || !Array.isArray(doc.styles.definitions)) {
      return false;
    }
  }

  return true;
}

/**
 * Thống kê định lượng cơ bản của tài liệu.
 */
export interface DocumentStats {
  characters: number;
  words: number;
  paragraphs: number;
  charactersNoSpaces?: number;
  headings?: number;
  tables?: number;
  images?: number;
  trackedDeletions?: number;
  trackedInsertions?: number;
}

/** Cache memoize thống kê tài liệu theo object reference của JSONContent (O(1) tránh scan lặp lại) */
const statsCache = new WeakMap<JSONContent, DocumentStats>();

/**
 * Trích xuất số lượng ký tự, từ và đoạn văn bản từ cấu trúc JSONContent thực tế.
 * Không tính HTML tags, metadata hay khoảng trắng thừa.
 * Word Count Policy:
 * - Bỏ qua văn bản đã đánh dấu xóa khi Track Changes bật (trackChange: delete).
 * - Tính văn bản được chèn mới (trackChange: insert).
 * - Văn bản neo của bình luận (comment) được tính 1 lần như văn bản thông thường.
 * - Thống kê thêm: tiêu đề (headings), bảng (tables), hình ảnh (images).
 * Xử lý chính xác các đoạn văn (paragraph), tiêu đề (heading), danh sách (lists),
 * văn bản phân mảnh qua nhiều mark/định dạng (cross-mark), ký tự Unicode và Tiếng Việt có dấu.
 */
export function extractDocumentStats(content: JSONContent): DocumentStats {
  if (!content || typeof content !== "object") {
    return {
      characters: 0,
      words: 0,
      paragraphs: 0,
      charactersNoSpaces: 0,
      headings: 0,
      tables: 0,
      images: 0,
      trackedDeletions: 0,
      trackedInsertions: 0,
    };
  }

  const cached = statsCache.get(content);
  if (cached) {
    return cached;
  }

  let characters = 0;
  let charactersNoSpaces = 0;
  let words = 0;
  let paragraphs = 0;
  let headings = 0;
  let tables = 0;
  let images = 0;
  let trackedDeletions = 0;
  let trackedInsertions = 0;

  function isDeletedTrackChange(node: JSONContent): boolean {
    if (!node.marks || !Array.isArray(node.marks)) return false;
    return node.marks.some((m) => {
      if (m.type !== "trackChange") return false;
      const cType = m.attrs?.changeType;
      return cType === "delete" || cType === "deletion";
    });
  }

  function isInsertedTrackChange(node: JSONContent): boolean {
    if (!node.marks || !Array.isArray(node.marks)) return false;
    return node.marks.some((m) => {
      if (m.type !== "trackChange") return false;
      const cType = m.attrs?.changeType;
      return cType === "insert" || cType === "insertion";
    });
  }

  function collectBlockText(node: JSONContent): string {
    let text = "";
    if (node.text) {
      if (isDeletedTrackChange(node)) {
        trackedDeletions++;
        return "";
      }
      if (isInsertedTrackChange(node)) {
        trackedInsertions++;
      }
      text += node.text;
    }
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        text += collectBlockText(child);
      }
    }
    return text;
  }

  function traverse(node: JSONContent) {
    if (!node) return;

    if (node.type === "heading") {
      headings++;
      paragraphs++;
      const blockText = collectBlockText(node);
      characters += blockText.length;
      charactersNoSpaces += blockText.replace(/\s/g, "").length;
      const trimmed = blockText.trim();
      if (trimmed) {
        words += trimmed.split(/\s+/).filter(Boolean).length;
      }
      return;
    }

    if (node.type === "paragraph") {
      paragraphs++;
      const blockText = collectBlockText(node);
      characters += blockText.length;
      charactersNoSpaces += blockText.replace(/\s/g, "").length;
      const trimmed = blockText.trim();
      if (trimmed) {
        words += trimmed.split(/\s+/).filter(Boolean).length;
      }
      return;
    }

    if (node.type === "table") {
      tables++;
    }

    if (node.type === "image" || node.type === "customImage") {
      images++;
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
    } else if (node.text) {
      if (isDeletedTrackChange(node)) {
        trackedDeletions++;
        return;
      }
      if (isInsertedTrackChange(node)) {
        trackedInsertions++;
      }
      characters += node.text.length;
      charactersNoSpaces += node.text.replace(/\s/g, "").length;
      const trimmed = node.text.trim();
      if (trimmed) {
        words += trimmed.split(/\s+/).filter(Boolean).length;
      }
    }
  }

  traverse(content);

  const result: DocumentStats = {
    characters,
    charactersNoSpaces,
    words,
    paragraphs: Math.max(1, paragraphs),
    headings,
    tables,
    images,
    trackedDeletions,
    trackedInsertions,
  };

  statsCache.set(content, result);
  return result;
}

/**
 * Cập nhật nội dung tài liệu và tăng version / thời gian cập nhật.
 */
export function updateDocumentContent(
  currentDoc: DocumentModel,
  newContent: JSONContent
): DocumentModel {
  return {
    ...currentDoc,
    metadata: {
      ...currentDoc.metadata,
      version: currentDoc.metadata.version + 1,
      updatedAt: new Date().toISOString(),
    },
    content: newContent,
  };
}

/**
 * Cập nhật thiết lập trang của tài liệu và tăng version / thời gian cập nhật.
 */
export function updateDocumentPageSettings(
  currentDoc: DocumentModel,
  newPageSettings: PageSettings
): DocumentModel {
  return {
    ...currentDoc,
    metadata: {
      ...currentDoc.metadata,
      version: currentDoc.metadata.version + 1,
      updatedAt: new Date().toISOString(),
    },
    pageSettings: validateAndNormalizePageSettings(newPageSettings),
  };
}
