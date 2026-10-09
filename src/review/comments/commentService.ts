import type { Node as PMNode } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/core";
import type { CommentItem } from "../../document/documentTypes.ts";

export interface CommentAnchorRange {
  from: number;
  to: number;
  text: string;
}

export interface OrderedCommentEntry {
  comment: CommentItem;
  range: CommentAnchorRange | null;
  isOrphan: boolean;
}

/**
 * Comments Service - Personal Word Editor (Phase 5.4 - Comments Core)
 *
 * Quản lý logic xử lý bình luận:
 * - Tạo CommentItem với metadata chuẩn (id, author, createdAt, updatedAt, content, resolved)
 * - Tra cứu anchor range ({ from, to }) trực tiếp từ ProseMirror Document Node hoặc AST JSON
 * - Tự động phát hiện orphan comment khi văn bản bị xóa hoặc undo
 * - Sắp xếp bình luận theo thứ tự xuất hiện thực tế trong trang/tài liệu
 * - Điều hướng Next Comment / Previous Comment
 */
export class CommentService {
  /** Tên tác giả mặc định cho ứng dụng cá nhân */
  public static readonly DEFAULT_AUTHOR = "Tác giả";

  /**
   * Tạo bản ghi CommentItem mới
   */
  public static createComment(
    content: string,
    author: string = CommentService.DEFAULT_AUTHOR,
    selectedText?: string,
    id?: string
  ): CommentItem {
    const timestamp = new Date().toISOString();
    const commentId =
      id ||
      `comment-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    return {
      id: commentId,
      author: author.trim() || CommentService.DEFAULT_AUTHOR,
      createdAt: timestamp,
      updatedAt: timestamp,
      content: content.trim(),
      resolved: false,
      selectedText: selectedText?.trim() || undefined,
    };
  }

  /**
   * Kiểm tra khả năng tạo bình luận từ selection hiện tại
   */
  public static canAddComment(selectionFrom: number, selectionTo: number): boolean {
    return selectionTo > selectionFrom;
  }

  /**
   * Tra cứu vị trí anchor range của comment trong ProseMirror Node
   * Trả về null nếu không tìm thấy (orphan comment do text bị xóa hoặc undo)
   */
  public static findCommentRangeInDoc(
    doc: PMNode | null | undefined,
    commentId: string
  ): CommentAnchorRange | null {
    if (!doc) return null;

    let minFrom = Infinity;
    let maxTo = -Infinity;
    const textParts: string[] = [];

    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;

      const hasMark = node.marks.some(
        (m) => m.type.name === "comment" && m.attrs.commentId === commentId
      );

      if (hasMark) {
        if (pos < minFrom) minFrom = pos;
        const endPos = pos + node.nodeSize;
        if (endPos > maxTo) maxTo = endPos;
        textParts.push(node.text);
      }
    });

    if (minFrom === Infinity || maxTo === -Infinity) {
      return null;
    }

    return {
      from: minFrom,
      to: maxTo,
      text: textParts.join(""),
    };
  }

  /**
   * Tra cứu vị trí anchor của comment từ JSON AST (hỗ trợ kiểm tra khi không có DOM/PMNode)
   */
  public static findCommentInAst(
    content: JSONContent | null | undefined,
    commentId: string
  ): { found: boolean; text: string } {
    if (!content) return { found: false, text: "" };

    const texts: string[] = [];

    const walk = (node: JSONContent) => {
      if (node.type === "text" && node.text) {
        const hasMark = node.marks?.some(
          (m) => m.type === "comment" && m.attrs?.commentId === commentId
        );
        if (hasMark) {
          texts.push(node.text);
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          walk(child);
        }
      }
    };

    walk(content);
    return {
      found: texts.length > 0,
      text: texts.join(""),
    };
  }

  /**
   * Trích xuất danh sách bình luận đã sắp xếp theo thứ tự xuất hiện trong tài liệu
   */
  public static getOrderedComments(
    doc: PMNode | null | undefined,
    comments: CommentItem[]
  ): OrderedCommentEntry[] {
    const entries: OrderedCommentEntry[] = comments.map((comment) => {
      const range = this.findCommentRangeInDoc(doc, comment.id);
      return {
        comment,
        range,
        isOrphan: range === null,
      };
    });

    // Sắp xếp: Các bình luận có vị trí range được xếp từ trên xuống dưới theo `range.from`.
    // Các bình luận mồ côi (range === null) xếp ở cuối theo createdAt.
    return entries.sort((a, b) => {
      if (a.range && b.range) {
        return a.range.from - b.range.from;
      }
      if (a.range && !b.range) return -1;
      if (!a.range && b.range) return 1;
      return new Date(a.comment.createdAt).getTime() - new Date(b.comment.createdAt).getTime();
    });
  }

  /**
   * Tìm ID bình luận tiếp theo theo thứ tự tài liệu
   */
  public static findNextComment(
    doc: PMNode | null | undefined,
    comments: CommentItem[],
    currentCommentId: string | null
  ): string | null {
    if (comments.length === 0) return null;

    const ordered = this.getOrderedComments(doc, comments);
    if (ordered.length === 0) return null;

    if (!currentCommentId) {
      return ordered[0].comment.id;
    }

    const currentIndex = ordered.findIndex((e) => e.comment.id === currentCommentId);
    if (currentIndex === -1 || currentIndex === ordered.length - 1) {
      // Wrap to first
      return ordered[0].comment.id;
    }

    return ordered[currentIndex + 1].comment.id;
  }

  /**
   * Tìm ID bình luận trước đó theo thứ tự tài liệu
   */
  public static findPreviousComment(
    doc: PMNode | null | undefined,
    comments: CommentItem[],
    currentCommentId: string | null
  ): string | null {
    if (comments.length === 0) return null;

    const ordered = this.getOrderedComments(doc, comments);
    if (ordered.length === 0) return null;

    if (!currentCommentId) {
      return ordered[ordered.length - 1].comment.id;
    }

    const currentIndex = ordered.findIndex((e) => e.comment.id === currentCommentId);
    if (currentIndex <= 0) {
      // Wrap to last
      return ordered[ordered.length - 1].comment.id;
    }

    return ordered[currentIndex - 1].comment.id;
  }

  /**
   * Thống kê số lượng bình luận
   */
  public static getCommentsCount(comments: CommentItem[]): {
    total: number;
    active: number;
    resolved: number;
  } {
    const total = comments.length;
    const resolved = comments.filter((c) => c.resolved).length;
    const active = total - resolved;
    return { total, active, resolved };
  }
}
