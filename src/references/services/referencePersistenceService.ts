import type { JSONContent } from "@tiptap/core";
import type { DocumentReferencesMetadata } from "../../document/documentTypes.ts";
import type { Bookmark, BookmarkType } from "../types/bookmarkTypes.ts";
import { BookmarkService } from "./bookmarkService.ts";
import type {
  CaptionListNodeAttrs,
  CaptionListPreset,
  CaptionListEntry,
} from "../types/captionListTypes.ts";
import { CaptionListService } from "./captionListService.ts";
import type {
  CrossReferenceAttrs,
  CrossReferenceTargetType,
  CrossReferenceFormat,
} from "../types/crossReferenceTypes.ts";

const VALID_CROSS_REF_TARGET_TYPES: ReadonlySet<CrossReferenceTargetType> = new Set([
  "heading",
  "caption",
  "figure",
  "table",
  "equation",
  "footnote",
  "endnote",
  "bookmark",
]);

const VALID_CROSS_REF_FORMATS: ReadonlySet<CrossReferenceFormat> = new Set([
  "text",
  "labelAndNumber",
  "number",
  "pageNumber",
]);

const VALID_CAPTION_LIST_PRESETS: ReadonlySet<CaptionListPreset> = new Set([
  "classic",
  "modern",
  "formal",
]);

/**
 * ReferencePersistenceService - Personal Word Editor (Phase 8 Architecture)
 *
 * Dịch vụ cốt lõi quản lý Lưu trữ và Khôi phục (Persistence & Resilience) cho hệ thống References:
 * - Bảo toàn vẹn toàn Danh mục chú thích (Caption Lists), Thẻ đánh dấu (Bookmarks), và Tham chiếu chéo (Cross-references).
 * - Chuẩn hóa AST an toàn, tự động khắc phục các lỗi hỏng dữ liệu (malformed attrs, duplicate IDs, missing metadata).
 * - Tuyệt đối KHÔNG serialize runtime resolved positions ({ from, to }) của Bookmark.
 * - Áp dụng chính sách Self-pruning AST cleanup: loại bỏ metadata mồ côi (phantom metadata without anchor).
 * - Tự động bổ sung metadata cho anchor thiếu metadata (anchor without metadata).
 * - Đảm bảo tính tương thích ngược 100% với định dạng .mwd cũ không chứa phân hệ References.
 * - Bảo toàn 100% nội dung văn bản của người dùng trong mọi tình huống.
 */
export class ReferencePersistenceService {
  /**
   * Chuẩn hóa và làm sạch tất cả các node / mark thuộc phân hệ References trong cây AST ProseMirror:
   * 1. Caption List nodes: làm sạch ID trùng lặp, missing title/label/preset/entries.
   * 2. Bookmark Anchors & Marks: chuẩn hóa stable ID, khử trùng lặp ID và tên, phục hồi missing metadata.
   * 3. Cross-reference nodes: bảo toàn targetId, phục hồi trường hợp targetId bị hỏng mà không làm mất text.
   */
  public static normalizeReferencesInAst(content: JSONContent): {
    updatedContent: JSONContent;
    repaired: boolean;
  } {
    if (!content || typeof content !== "object") {
      return { updatedContent: content, repaired: false };
    }

    let repaired = false;

    // Bộ nhớ theo dõi để phát hiện trùng lặp trong toàn bộ AST
    const seenCaptionListIds = new Set<string>();
    const seenBookmarkIds = new Map<string, { type: BookmarkType; name: string }>();
    const seenBookmarkNames = new Map<string, string>(); // normalizedName -> bookmarkId

    /**
     * Sinh tên bookmark duy nhất nếu bị trùng lặp với một bookmark khác
     */
    function disambiguateBookmarkName(baseName: string, bookmarkId: string): string {
      const trimmed = (baseName || "").trim() || "Thẻ không tên";
      let candidate = trimmed;
      let counter = 1;

      while (
        seenBookmarkNames.has(candidate.toLowerCase()) &&
        seenBookmarkNames.get(candidate.toLowerCase()) !== bookmarkId
      ) {
        candidate = `${trimmed} (${counter})`;
        counter++;
        repaired = true;
      }

      seenBookmarkNames.set(candidate.toLowerCase(), bookmarkId);
      return candidate;
    }

    /**
     * Hàm đệ quy duyệt và làm sạch từng node trong cây AST
     */
    function walkNode(node: JSONContent): JSONContent {
      if (!node || typeof node !== "object") return node;

      const clone: JSONContent = { ...node };

      // 1. Chuẩn hóa Caption List node
      if (clone.type === "captionList") {
        const rawAttrs = (clone.attrs || {}) as Partial<CaptionListNodeAttrs>;
        let id = typeof rawAttrs.id === "string" ? rawAttrs.id.trim() : "";
        const label =
          typeof rawAttrs.label === "string" && rawAttrs.label.trim()
            ? rawAttrs.label.trim()
            : "Figure";

        if (!id || seenCaptionListIds.has(id)) {
          id = CaptionListService.generateCaptionListId(label);
          repaired = true;
        }
        seenCaptionListIds.add(id);

        const title =
          typeof rawAttrs.title === "string" && rawAttrs.title.trim()
            ? rawAttrs.title.trim()
            : CaptionListService.getDefaultTitle(label);

        const preset: CaptionListPreset =
          rawAttrs.preset && VALID_CAPTION_LIST_PRESETS.has(rawAttrs.preset)
            ? rawAttrs.preset
            : "classic";

        const showPageNumbers =
          typeof rawAttrs.showPageNumbers === "boolean" ? rawAttrs.showPageNumbers : true;
        const rightAlignPageNumbers =
          typeof rawAttrs.rightAlignPageNumbers === "boolean"
            ? rawAttrs.rightAlignPageNumbers
            : true;

        const entries: CaptionListEntry[] = Array.isArray(rawAttrs.entries)
          ? rawAttrs.entries.map((entry) => ({
              captionId: String(entry?.captionId || ""),
              targetId: entry?.targetId ? String(entry.targetId) : null,
              label: String(entry?.label || label),
              number: typeof entry?.number === "number" ? entry.number : 1,
              text: String(entry?.text || ""),
              fullTitle: String(entry?.fullTitle || ""),
              labelAndNumber: String(entry?.labelAndNumber || ""),
              pageNumber: typeof entry?.pageNumber === "number" ? entry.pageNumber : undefined,
            }))
          : [];

        const lastUpdated =
          typeof rawAttrs.lastUpdated === "string" && rawAttrs.lastUpdated
            ? rawAttrs.lastUpdated
            : new Date().toISOString();

        if (
          rawAttrs.id !== id ||
          rawAttrs.title !== title ||
          rawAttrs.label !== label ||
          rawAttrs.preset !== preset ||
          rawAttrs.showPageNumbers !== showPageNumbers ||
          rawAttrs.rightAlignPageNumbers !== rightAlignPageNumbers ||
          !Array.isArray(rawAttrs.entries)
        ) {
          repaired = true;
        }

        clone.attrs = {
          id,
          title,
          label,
          showPageNumbers,
          rightAlignPageNumbers,
          preset,
          entries,
          lastUpdated,
        };
      }

      // 2. Chuẩn hóa Bookmark Anchor (Position Bookmark node)
      if (clone.type === "bookmarkAnchor") {
        const rawAttrs = (clone.attrs || {}) as Record<string, unknown>;
        let id = typeof rawAttrs.id === "string" ? rawAttrs.id.trim() : "";
        let rawName = typeof rawAttrs.name === "string" ? rawAttrs.name.trim() : "";
        if (!rawName) {
          rawName = "Thẻ không tên";
          repaired = true;
        }

        // Nếu ID thiếu hoặc đã tồn tại trong AST (xung đột ID giữa các bookmark khác nhau)
        if (!id || seenBookmarkIds.has(id)) {
          id = BookmarkService.generateBookmarkId(rawName);
          repaired = true;
        }

        const safeName = disambiguateBookmarkName(rawName, id);
        seenBookmarkIds.set(id, { type: "position", name: safeName });

        const createdAt =
          typeof rawAttrs.createdAt === "string" && rawAttrs.createdAt
            ? rawAttrs.createdAt
            : new Date().toISOString();

        if (rawAttrs.id !== id || rawAttrs.name !== safeName || !rawAttrs.createdAt) {
          repaired = true;
        }

        clone.attrs = {
          id,
          name: safeName,
          createdAt,
        };
      }

      // 3. Chuẩn hóa Bookmark Marks (Range Bookmark trên text nodes)
      if (clone.marks && Array.isArray(clone.marks)) {
        clone.marks = clone.marks.map((mark) => {
          if (!mark || mark.type !== "bookmark") return mark;

          const rawAttrs = (mark.attrs || {}) as Record<string, unknown>;
          let id = typeof rawAttrs.id === "string" ? rawAttrs.id.trim() : "";
          let rawName = typeof rawAttrs.name === "string" ? rawAttrs.name.trim() : "";
          if (!rawName) {
            rawName = "Thẻ không tên";
            repaired = true;
          }

          // Kiểm tra xem ID này đã được ghi nhận trước đó hay chưa
          const existing = seenBookmarkIds.get(id);
          if (!id || (existing && existing.type !== "range")) {
            // Xung đột ID với một position anchor hoặc id rỗng
            id = BookmarkService.generateBookmarkId(rawName);
            repaired = true;
          }

          let safeName = rawName;
          if (existing && existing.type === "range") {
            // Đây là một text span khác thuộc cùng 1 range bookmark, dùng tên đồng bộ
            safeName = existing.name;
          } else {
            safeName = disambiguateBookmarkName(rawName, id);
            seenBookmarkIds.set(id, { type: "range", name: safeName });
          }

          const createdAt =
            typeof rawAttrs.createdAt === "string" && rawAttrs.createdAt
              ? rawAttrs.createdAt
              : new Date().toISOString();

          if (rawAttrs.id !== id || rawAttrs.name !== safeName || !rawAttrs.createdAt) {
            repaired = true;
          }

          return {
            ...mark,
            attrs: {
              id,
              name: safeName,
              createdAt,
            },
          };
        });
      }

      // 4. Chuẩn hóa Cross-Reference node
      if (clone.type === "crossReference") {
        const rawAttrs = (clone.attrs || {}) as Partial<CrossReferenceAttrs>;
        let targetId = typeof rawAttrs.targetId === "string" ? rawAttrs.targetId.trim() : "";
        if (!targetId) {
          targetId = "broken_ref";
          repaired = true;
        }

        const targetType: CrossReferenceTargetType =
          rawAttrs.targetType && VALID_CROSS_REF_TARGET_TYPES.has(rawAttrs.targetType)
            ? rawAttrs.targetType
            : "bookmark";

        const format: CrossReferenceFormat =
          rawAttrs.format && VALID_CROSS_REF_FORMATS.has(rawAttrs.format)
            ? rawAttrs.format
            : "text";

        let customText = rawAttrs.customText ?? null;
        if (targetId === "broken_ref" && !customText) {
          customText = "[Reference not found]";
          repaired = true;
        }

        if (
          rawAttrs.targetId !== targetId ||
          rawAttrs.targetType !== targetType ||
          rawAttrs.format !== format
        ) {
          repaired = true;
        }

        clone.attrs = {
          targetId,
          targetType,
          format,
          customText,
        };
      }

      // Đệ quy bảo toàn toàn bộ cây con và nội dung văn bản
      if (clone.content && Array.isArray(clone.content)) {
        clone.content = clone.content.map(walkNode);
      }

      return clone;
    }

    const updatedContent = walkNode(content);
    return { updatedContent, repaired };
  }

  /**
   * Đối soát và tái tạo DocumentReferencesMetadata từ AST nguồn:
   * - Tự động trích xuất các Bookmarks đang hiện diện trong AST.
   * - KHÔNG serialize runtime resolved positions (from, to, text).
   * - Loại bỏ metadata mồ côi không còn neo trong AST (Self-pruning).
   * - Bổ sung metadata cho anchor nếu trong tệp bị thiếu metadata.
   * - Bảo toàn các trường anchors, bibliographySources, citationStyle.
   */
  public static reconcileReferencesMetadata(
    content: JSONContent,
    rawReferences?: DocumentReferencesMetadata
  ): DocumentReferencesMetadata | undefined {
    // Trích xuất bookmarks từ AST đã chuẩn hóa
    const locations = BookmarkService.extractBookmarks(content);

    // Thu thập danh sách Bookmark duy nhất theo ID (loại bỏ trùng do span chia nhỏ)
    const bookmarkMap = new Map<string, Bookmark>();
    for (const loc of locations) {
      if (!bookmarkMap.has(loc.bookmark.id)) {
        // Chỉ lưu thông tin metadata cần thiết, TUYỆT ĐỐI KHÔNG lưu { from, to, text }
        bookmarkMap.set(loc.bookmark.id, {
          id: loc.bookmark.id,
          name: loc.bookmark.name,
          type: loc.bookmark.type,
          createdAt: loc.bookmark.createdAt,
        });
      }
    }

    const cleanBookmarks: Bookmark[] = Array.from(bookmarkMap.values());

    // Tương thích ngược tuyệt đối: nếu file cũ không có references và AST không có bookmark
    if (!rawReferences && cleanBookmarks.length === 0) {
      return undefined;
    }

    return {
      anchors: rawReferences?.anchors ? { ...rawReferences.anchors } : {},
      bibliographySources: Array.isArray(rawReferences?.bibliographySources)
        ? [...rawReferences.bibliographySources]
        : [],
      citationStyle: rawReferences?.citationStyle ?? "apa",
      bookmarks: cleanBookmarks,
    };
  }

  /**
   * Chuẩn bị DocumentReferencesMetadata sẵn sàng trước khi serialize thành tệp tin .mwd:
   * Đảm bảo bookmarks metadata đồng bộ 100% với AST hiện tại và không chứa runtime offsets.
   */
  public static prepareReferencesForSerialization(
    content: JSONContent,
    references?: DocumentReferencesMetadata
  ): DocumentReferencesMetadata | undefined {
    return this.reconcileReferencesMetadata(content, references);
  }
}
