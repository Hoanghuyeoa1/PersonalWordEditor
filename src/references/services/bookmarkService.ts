import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { ReferenceAnchorService } from "./referenceAnchorService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import type {
  Bookmark,
  BookmarkLocation,
  BookmarkValidationResult,
  CreateBookmarkOptions,
} from "../types/bookmarkTypes.ts";

/**
 * BookmarkService - Personal Word Editor (Phase 5 Bookmark Semantic Core)
 *
 * Dịch vụ cốt lõi quản lý Thẻ đánh dấu (Bookmarks):
 * - Hỗ trợ cả 2 biểu diễn ngữ nghĩa:
 *   1. Position Bookmark: con trỏ đơn (caret-only) dùng inline atom node `bookmarkAnchor`.
 *   2. Range Bookmark: vùng văn bản đã chọn (selection) dùng semantic mark `bookmark`.
 * - Stable ID định danh bất biến: `ref_bookmark_<uuid>`.
 * - Tuyệt đối KHÔNG persist numeric offset `{ from, to }`. Vị trí di chuyển tự nhiên theo ProseMirror transactions.
 * - Hỗ trợ đầy đủ Unicode / Tiếng Việt cho tên thẻ đánh dấu.
 * - Coexist hoàn toàn với các marks định dạng khác (bold, italic, link, comment, trackChange, citation).
 * - Tự động dọn dẹp khi nội dung neo bị xóa hoàn toàn (Self-pruning AST cleanup policy).
 */
export class BookmarkService {
  /**
   * Sinh mã định danh duy nhất và ổn định cho Bookmark: ref_bookmark_<uuid>
   */
  public static generateBookmarkId(customSeed?: string): string {
    return ReferenceAnchorService.generateAnchorId("bookmark", customSeed);
  }

  /**
   * Kiểm tra tính hợp lệ của tên Bookmark:
   * 1. Cắt khoảng trắng (trim).
   * 2. Không được để trống.
   * 3. Phải là duy nhất trong toàn bộ tài liệu (không phân biệt hoa/thường).
   * 4. Hỗ trợ đầy đủ ký tự Unicode và Tiếng Việt có dấu.
   */
  public static validateBookmarkName(
    doc: ProseMirrorNode | JSONContent,
    name: string,
    excludeId?: string
  ): BookmarkValidationResult {
    const trimmed = (name || "").trim();

    if (!trimmed) {
      return {
        valid: false,
        error: "Tên thẻ đánh dấu không được để trống.",
      };
    }

    // Kiểm tra tính duy nhất trong tài liệu
    const existingBookmarks = this.extractBookmarks(doc);
    const normalizedTarget = trimmed.toLowerCase();

    const isDuplicate = existingBookmarks.some((loc) => {
      if (excludeId && loc.bookmark.id === excludeId) return false;
      return loc.bookmark.name.trim().toLowerCase() === normalizedTarget;
    });

    if (isDuplicate) {
      return {
        valid: false,
        error: `Thẻ đánh dấu "${trimmed}" đã tồn tại trong tài liệu.`,
      };
    }

    return {
      valid: true,
      normalizedName: trimmed,
    };
  }

  /**
   * Tạo mới một Bookmark ngữ nghĩa vào tài liệu:
   * - Nếu selection rỗng (caret): chèn inline atom node `bookmarkAnchor` (Position Bookmark).
   * - Nếu selection có vùng chọn: gắn semantic mark `bookmark` (Range Bookmark).
   */
  public static createBookmark(
    editor: Editor,
    options: CreateBookmarkOptions
  ): { success: boolean; bookmark?: Bookmark; error?: string } {
    if (!editor || !editor.state) {
      return { success: false, error: "Editor chưa sẵn sàng." };
    }

    const { state } = editor;
    const { doc, selection, schema } = state;

    const validation = this.validateBookmarkName(doc, options.name);
    if (!validation.valid || !validation.normalizedName) {
      return { success: false, error: validation.error };
    }

    const bookmarkName = validation.normalizedName;
    const bookmarkId = options.id || this.generateBookmarkId(bookmarkName);
    const createdAt = new Date().toISOString();

    const tr = state.tr;

    const hasExplicitRange = typeof options.from === "number";
    const from = hasExplicitRange ? options.from! : selection.from;
    const to = hasExplicitRange ? (typeof options.to === "number" ? options.to! : from) : selection.to;
    const isPosition = hasExplicitRange ? from === to : selection.empty;

    if (isPosition) {
      // 1. POSITION BOOKMARK (Caret-only)
      const anchorType = schema.nodes.bookmarkAnchor;
      if (!anchorType) {
        return { success: false, error: "Node 'bookmarkAnchor' chưa được đăng ký trong schema." };
      }

      const safePos = Math.min(Math.max(0, from), doc.content.size);
      const node = anchorType.create({
        id: bookmarkId,
        name: bookmarkName,
        createdAt,
      });

      tr.insert(safePos, node);
      closeHistory(tr);
      tr.setMeta("addToHistory", true);
      editor.view.dispatch(tr);

      try {
        useDocumentStore.setState({ isDirty: true, isModified: true });
      } catch {
        // headless test
      }

      const bookmark: Bookmark = {
        id: bookmarkId,
        name: bookmarkName,
        type: "position",
        createdAt,
      };

      return { success: true, bookmark };
    } else {
      // 2. RANGE BOOKMARK (Selection-based)
      const markType = schema.marks.bookmark;
      if (!markType) {
        return { success: false, error: "Mark 'bookmark' chưa được đăng ký trong schema." };
      }

      const safeFrom = Math.min(Math.max(0, from), doc.content.size);
      const safeTo = Math.min(Math.max(safeFrom, to), doc.content.size);

      const mark = markType.create({
        id: bookmarkId,
        name: bookmarkName,
        createdAt,
      });

      tr.addMark(safeFrom, safeTo, mark);
      closeHistory(tr);
      tr.setMeta("addToHistory", true);
      editor.view.dispatch(tr);

      try {
        useDocumentStore.setState({ isDirty: true, isModified: true });
      } catch {
        // headless test
      }

      const bookmark: Bookmark = {
        id: bookmarkId,
        name: bookmarkName,
        type: "range",
        createdAt,
      };

      return { success: true, bookmark };
    }
  }

  /**
   * Trích xuất danh sách tất cả các Bookmarks trong tài liệu theo thứ tự xuất hiện (Document Order).
   * Phân giải hoàn toàn từ cây AST hiện tại (Pure function over AST, không scan DOM).
   */
  public static extractBookmarks(doc: ProseMirrorNode | JSONContent): BookmarkLocation[] {
    const results: BookmarkLocation[] = [];
    if (!doc) return results;

    // Xử lý cả ProseMirror Node instance lẫn JSONContent thuần
    const isNodeInstance = typeof (doc as ProseMirrorNode).descendants === "function";

    if (isNodeInstance) {
      const pmDoc = doc as ProseMirrorNode;

      // 1. Thu thập Position Bookmarks (nodes)
      pmDoc.descendants((node, pos) => {
        if (node.type.name === "bookmarkAnchor") {
          const id = (node.attrs.id as string) || "";
          const name = (node.attrs.name as string) || "Thẻ không tên";
          const createdAt = (node.attrs.createdAt as string) || "";
          if (id) {
            results.push({
              bookmark: { id, name, type: "position", createdAt },
              from: pos,
              to: pos + node.nodeSize,
              type: "position",
              text: "",
            });
          }
          return false;
        }
        return true;
      });

      // 2. Thu thập Range Bookmarks (marks trên text spans)
      interface MarkRangeAggregator {
        id: string;
        name: string;
        createdAt: string;
        from: number;
        to: number;
        textParts: string[];
      }
      const rangeMap = new Map<string, MarkRangeAggregator>();

      pmDoc.descendants((node, pos) => {
        if (node.isText && node.marks) {
          for (const mark of node.marks) {
            if (mark.type.name === "bookmark") {
              const id = (mark.attrs.id as string) || "";
              const name = (mark.attrs.name as string) || "";
              const createdAt = (mark.attrs.createdAt as string) || "";
              if (!id) continue;

              const existing = rangeMap.get(id);
              if (!existing) {
                rangeMap.set(id, {
                  id,
                  name,
                  createdAt,
                  from: pos,
                  to: pos + node.nodeSize,
                  textParts: [node.text || ""],
                });
              } else {
                existing.from = Math.min(existing.from, pos);
                existing.to = Math.max(existing.to, pos + node.nodeSize);
                existing.textParts.push(node.text || "");
              }
            }
          }
        }
        return true;
      });

      for (const item of rangeMap.values()) {
        results.push({
          bookmark: {
            id: item.id,
            name: item.name,
            type: "range",
            createdAt: item.createdAt,
          },
          from: item.from,
          to: item.to,
          type: "range",
          text: item.textParts.join(""),
        });
      }
    } else {
      // JSONContent Fallback
      let currentOffset = 0;
      const scanJson = (node: JSONContent) => {
        if (!node) return;

        if (node.type === "bookmarkAnchor" && node.attrs) {
          const id = (node.attrs.id as string) || "";
          const name = (node.attrs.name as string) || "";
          const createdAt = (node.attrs.createdAt as string) || "";
          if (id) {
            results.push({
              bookmark: { id, name, type: "position", createdAt },
              from: currentOffset,
              to: currentOffset + 1,
              type: "position",
              text: "",
            });
          }
        }

        if (node.text && node.marks) {
          for (const mark of node.marks) {
            if (mark.type === "bookmark" && mark.attrs) {
              const id = (mark.attrs.id as string) || "";
              const name = (mark.attrs.name as string) || "";
              const createdAt = (mark.attrs.createdAt as string) || "";
              if (id) {
                results.push({
                  bookmark: { id, name, type: "range", createdAt },
                  from: currentOffset,
                  to: currentOffset + (node.text?.length || 0),
                  type: "range",
                  text: node.text || "",
                });
              }
            }
          }
        }

        if (node.content && Array.isArray(node.content)) {
          for (const child of node.content) {
            scanJson(child);
          }
        }
      };

      scanJson(doc as JSONContent);
    }

    // Sắp xếp thứ tự tự nhiên theo vị trí xuất hiện trong tài liệu
    results.sort((a, b) => a.from - b.from);
    return results;
  }

  /**
   * Tra cứu Bookmark theo ID định danh ổn định (ref_bookmark_<uuid>)
   */
  public static findBookmarkById(
    doc: ProseMirrorNode | JSONContent,
    id: string
  ): BookmarkLocation | null {
    if (!doc || !id) return null;
    const all = this.extractBookmarks(doc);
    return all.find((loc) => loc.bookmark.id === id) || null;
  }

  /**
   * Tra cứu Bookmark theo tên hiển thị (Không phân biệt hoa/thường)
   */
  public static findBookmarkByName(
    doc: ProseMirrorNode | JSONContent,
    name: string
  ): BookmarkLocation | null {
    if (!doc || !name) return null;
    const normalized = name.trim().toLowerCase();
    const all = this.extractBookmarks(doc);
    return all.find((loc) => loc.bookmark.name.trim().toLowerCase() === normalized) || null;
  }

  /**
   * Phân giải vị trí neo tham chiếu của Bookmark (hỗ trợ cả tìm theo ID hoặc theo Tên)
   */
  public static resolveAnchor(
    doc: ProseMirrorNode | JSONContent,
    idOrName: string
  ): BookmarkLocation | null {
    if (!doc || !idOrName) return null;
    // Thử theo ID trước
    const byId = this.findBookmarkById(doc, idOrName);
    if (byId) return byId;
    // Thử theo Tên
    return this.findBookmarkByName(doc, idOrName);
  }

  /**
   * Đổi tên Bookmark (Rename bookmark metadata) mà bảo toàn tuyệt đối ID định danh
   */
  public static renameBookmark(
    editor: Editor,
    bookmarkId: string,
    newName: string
  ): { success: boolean; bookmark?: Bookmark; error?: string } {
    if (!editor || !editor.state) {
      return { success: false, error: "Editor chưa sẵn sàng." };
    }

    const { doc, schema } = editor.state;
    const validation = this.validateBookmarkName(doc, newName, bookmarkId);
    if (!validation.valid || !validation.normalizedName) {
      return { success: false, error: validation.error };
    }

    const location = this.findBookmarkById(doc, bookmarkId);
    if (!location) {
      return { success: false, error: "Không tìm thấy thẻ đánh dấu cần đổi tên." };
    }

    const updatedName = validation.normalizedName;
    const tr = editor.state.tr;

    if (location.type === "position") {
      const node = doc.nodeAt(location.from);
      if (node && node.type.name === "bookmarkAnchor") {
        tr.setNodeMarkup(location.from, undefined, {
          ...node.attrs,
          name: updatedName,
        });
      }
    } else {
      // Range bookmark: thay thế mark trên toàn bộ khoảng [from, to]
      const markType = schema.marks.bookmark;
      if (markType) {
        tr.removeMark(location.from, location.to, markType);
        tr.addMark(
          location.from,
          location.to,
          markType.create({
            ...location.bookmark,
            name: updatedName,
          })
        );
      }
    }

    closeHistory(tr);
    tr.setMeta("addToHistory", true);
    editor.view.dispatch(tr);

    try {
      useDocumentStore.setState({ isDirty: true, isModified: true });
    } catch {
      // headless test
    }

    return {
      success: true,
      bookmark: {
        ...location.bookmark,
        name: updatedName,
      },
    };
  }

  /**
   * Xóa Bookmark khỏi tài liệu:
   * - Nếu là Position Bookmark: xóa node `bookmarkAnchor`.
   * - Nếu là Range Bookmark: gỡ bỏ mark `bookmark` (bảo toàn nguyên vẹn văn bản và các formatting marks khác).
   */
  public static removeBookmark(
    editor: Editor,
    bookmarkId: string
  ): { success: boolean; error?: string } {
    if (!editor || !editor.state) {
      return { success: false, error: "Editor chưa sẵn sàng." };
    }

    const { doc, schema } = editor.state;
    const location = this.findBookmarkById(doc, bookmarkId);
    if (!location) {
      return { success: false, error: "Không tìm thấy thẻ đánh dấu cần xóa." };
    }

    const tr = editor.state.tr;

    if (location.type === "position") {
      tr.delete(location.from, location.to);
    } else {
      const markType = schema.marks.bookmark;
      if (markType) {
        tr.removeMark(location.from, location.to, markType);
      }
    }

    closeHistory(tr);
    tr.setMeta("addToHistory", true);
    editor.view.dispatch(tr);

    try {
      useDocumentStore.setState({ isDirty: true, isModified: true });
    } catch {
      // headless test
    }

    return { success: true };
  }

  /**
   * Điều hướng con trỏ và cuộn màn hình tới vị trí Bookmark:
   * - Position: đặt con trỏ tại vị trí anchor.
   * - Range: chọn toàn bộ vùng văn bản của bookmark.
   * - Tuyệt đối không mutate nội dung tài liệu AST khi navigation.
   */
  public static navigateToBookmark(
    editor: Editor,
    idOrName: string
  ): boolean {
    if (!editor || !editor.state) return false;

    const location = this.resolveAnchor(editor.state.doc, idOrName);
    if (!location) return false;

    const { doc } = editor.state;
    const tr = editor.state.tr;

    try {
      if (location.type === "position") {
        const safePos = Math.min(Math.max(0, location.from), doc.content.size);
        tr.setSelection(TextSelection.near(doc.resolve(safePos)));
      } else {
        const safeFrom = Math.min(Math.max(0, location.from), doc.content.size);
        const safeTo = Math.min(Math.max(safeFrom, location.to), doc.content.size);
        tr.setSelection(TextSelection.create(doc, safeFrom, safeTo));
      }

      tr.scrollIntoView();
      editor.view.dispatch(tr);

      try {
        if (editor.view && typeof (editor.view as any).focus === "function") {
          editor.view.focus();
        }
      } catch {
        // headless test
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Bí danh cho navigateToBookmark
   */
  public static goToBookmark(editor: Editor, idOrName: string): boolean {
    return this.navigateToBookmark(editor, idOrName);
  }

  /**
   * Bí danh cho removeBookmark
   */
  public static deleteBookmark(
    editor: Editor,
    bookmarkId: string
  ): { success: boolean; error?: string } {
    return this.removeBookmark(editor, bookmarkId);
  }
}
