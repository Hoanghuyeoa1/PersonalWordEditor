import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { HeadingService } from "./headingService.ts";
import { CaptionService } from "./captionService.ts";
import { NoteService } from "./noteService.ts";
import { BookmarkService } from "./bookmarkService.ts";
import type {
  CrossReferenceAttrs,
  CrossReferenceTargetItem,
  CrossReferenceTargetType,
  InsertCrossReferenceOptions,
} from "../types/crossReferenceTypes.ts";
import { buildPageLayoutMap, type PageLayoutMap } from "../../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/services/pageConstants.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";

/**
 * Cross-Reference Service - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Dịch vụ cốt lõi quản lý Tham chiếu chéo (Cross-reference):
 * - Phân giải động (Dynamic Resolution): liên kết tới ID ngữ nghĩa, không copy text tĩnh.
 * - Hỗ trợ các mục tiêu: Heading, Caption (Figure, Table, Equation), Footnote, Endnote.
 * - Chế độ hiển thị: Toàn bộ nội dung, Nhãn & Số, Chỉ số, Số trang.
 * - Trạng thái an toàn khi mất mục tiêu (Broken reference): hiển thị "[Reference not found]".
 * - Điều hướng mượt mà tới mục tiêu mà không làm đột biến AST.
 */
export class CrossReferenceService {
  /**
   * Lấy danh sách đối tượng mục tiêu khả dụng từ tài liệu hiện tại (không dùng cache cũ)
   * Tự động phân giải số trang chính xác qua PageLayoutMap tập trung (Phase 10).
   */
  public static getAvailableTargets(
    doc: ProsemirrorNode | JSONContent,
    targetType: CrossReferenceTargetType,
    layoutMap?: PageLayoutMap | null
  ): CrossReferenceTargetItem[] {
    const results: CrossReferenceTargetItem[] = [];
    if (!doc) return results;

    let effectiveLayout = layoutMap || usePaginationStore.getState().layoutMap;
    if (!effectiveLayout && doc) {
      try {
        const json =
          doc && typeof (doc as any).toJSON === "function"
            ? (doc as any).toJSON()
            : doc;
        if (json && typeof json === "object") {
          effectiveLayout = buildPageLayoutMap(json, DEFAULT_PAGE_SETTINGS);
        }
      } catch {
        // Fallback
      }
    }

    switch (targetType) {
      case "heading": {
        const headings = HeadingService.extractHeadings(doc);
        for (const h of headings) {
          const prefix = h.level === 1 ? "H1" : h.level === 2 ? "H2" : "H3";
          const pageNumber = effectiveLayout
            ? effectiveLayout.getPageNumberForPosition(h.from)
            : 1;
          results.push({
            id: h.id,
            type: "heading",
            title: `[${prefix}] ${h.text}`,
            text: h.text,
            labelAndNumber: `Heading ${h.level}`,
            number: h.level,
            pageNumber,
            pos: h.from,
          });
        }
        break;
      }

      case "figure":
      case "table":
      case "equation":
      case "caption": {
        const captions = CaptionService.extractCaptions(doc);
        for (const c of captions) {
          const lowerLabel = c.label.toLowerCase();
          if (
            targetType === "caption" ||
            (targetType === "figure" && lowerLabel === "figure") ||
            (targetType === "table" && lowerLabel === "table") ||
            (targetType === "equation" && lowerLabel === "equation")
          ) {
            const pageNumber = effectiveLayout
              ? effectiveLayout.getPageNumberForPosition(c.pos)
              : c.pageNumber || 1;
            results.push({
              id: c.id,
              type: targetType,
              title: c.fullTitle,
              text: c.text,
              labelAndNumber: c.labelAndNumber,
              number: c.number,
              pageNumber,
              pos: c.pos,
            });
          }
        }
        break;
      }

      case "footnote": {
        const { footnotes } = NoteService.extractNotes(doc);
        for (const n of footnotes || []) {
          const snippet = n.content ? n.content.substring(0, 30) : "(Trống)";
          const pageNumber = effectiveLayout
            ? effectiveLayout.getPageNumberForPosition(n.pos ?? 0)
            : 1;
          results.push({
            id: n.id,
            type: "footnote",
            title: `Footnote ${n.label}: ${snippet}`,
            text: n.content,
            labelAndNumber: `Footnote ${n.label}`,
            number: n.number,
            pageNumber,
            pos: n.pos ?? 0,
          });
        }
        break;
      }

      case "endnote": {
        const { endnotes } = NoteService.extractNotes(doc);
        for (const n of endnotes || []) {
          const snippet = n.content ? n.content.substring(0, 30) : "(Trống)";
          const pageNumber = effectiveLayout
            ? effectiveLayout.getPageNumberForPosition(n.pos ?? 0)
            : 1;
          results.push({
            id: n.id,
            type: "endnote",
            title: `Endnote ${n.label}: ${snippet}`,
            text: n.content,
            labelAndNumber: `Endnote ${n.label}`,
            number: n.number,
            pageNumber,
            pos: n.pos ?? 0,
          });
        }
        break;
      }

      case "bookmark": {
        const bookmarks = BookmarkService.extractBookmarks(doc);
        for (const b of bookmarks) {
          const pageNumber = effectiveLayout
            ? effectiveLayout.getPageNumberForPosition(b.from)
            : 1;
          const resolvedText = b.type === "range" && b.text ? b.text : b.bookmark.name;
          results.push({
            id: b.bookmark.id,
            type: "bookmark",
            title: b.bookmark.name,
            text: resolvedText,
            pageNumber,
            pos: b.from,
          });
        }
        break;
      }
    }

    return results;
  }

  /**
   * Phân giải chuỗi hiển thị động dựa trên ID và loại target trong AST
   * Khi format="pageNumber", số trang được lấy trực tiếp từ authoritative PageLayoutMap (Phase 10).
   */
  public static resolveTarget(
    doc: ProsemirrorNode | JSONContent,
    attrs: CrossReferenceAttrs,
    layoutMap?: PageLayoutMap | null
  ): { found: boolean; text: string; fullTitle?: string } {
    if (!doc || !attrs || !attrs.targetId) {
      return { found: false, text: "[Reference not found]" };
    }

    const { targetId, targetType, format } = attrs;

    // 1. Tìm trong loại mục tiêu được chỉ định
    let targets = this.getAvailableTargets(doc, targetType, layoutMap);
    let item = targets.find((t) => t.id === targetId);

    // 2. Nếu không tìm thấy, quét tìm qua các nhóm khác (phòng khi targetType bị thay đổi)
    if (!item) {
      const allTypes: CrossReferenceTargetType[] = [
        "caption",
        "heading",
        "footnote",
        "endnote",
        "bookmark",
      ];
      for (const tType of allTypes) {
        if (tType === targetType) continue;
        const otherTargets = this.getAvailableTargets(doc, tType, layoutMap);
        const found = otherTargets.find((t) => t.id === targetId);
        if (found) {
          item = found;
          break;
        }
      }
    }

    if (!item) {
      return { found: false, text: "[Reference not found]" };
    }

    // 3. Định dạng chuỗi hiển thị theo format yêu cầu
    let displayText = "";
    switch (format) {
      case "labelAndNumber":
        displayText = item.labelAndNumber || item.text || item.title;
        break;
      case "number":
        displayText = item.number !== undefined ? String(item.number) : (item.text || item.title);
        break;
      case "pageNumber":
        displayText = String(item.pageNumber ?? 1);
        break;
      case "text":
      default:
        if (item.type === "bookmark") {
          displayText = item.text || item.title;
        } else {
          displayText = item.title.startsWith("[H") ? item.text : item.title;
        }
        break;
    }

    return {
      found: true,
      text: displayText || item.title,
      fullTitle: item.title,
    };
  }

  /**
   * Cập nhật toàn bộ các node Tham chiếu chéo trong tài liệu (F9 / Update Fields)
   * Đồng bộ lại văn bản hiển thị và số trang từ PageLayoutMap mới nhất (Phase 10).
   */
  public static updateAllCrossReferences(
    editor: Editor,
    layoutMap?: PageLayoutMap | null
  ): { updatedCount: number } {
    if (!editor || !editor.state) return { updatedCount: 0 };

    const effectiveLayout =
      layoutMap ||
      usePaginationStore.getState().layoutMap ||
      buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);

    let updatedCount = 0;
    const { tr } = editor.state;

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "crossReference") {
        const attrs = node.attrs as CrossReferenceAttrs;
        const resolved = this.resolveTarget(editor.state.doc, attrs, effectiveLayout);
        const newText = resolved.found ? resolved.text : "[Reference not found]";
        if (node.attrs.customText !== newText) {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            customText: newText,
          });
          updatedCount++;
        }
      }
    });

    if (updatedCount > 0) {
      tr.setMeta("addToHistory", true);
      tr.setMeta("isCrossReferenceUpdate", true);
      editor.view.dispatch(tr);
    }

    return { updatedCount };
  }

  /**
   * Chèn một node Tham chiếu chéo semantic vào vị trí con trỏ
   */
  public static insertCrossReference(
    editor: Editor,
    options: InsertCrossReferenceOptions
  ): { success: boolean; message?: string } {
    if (!editor || !editor.state) {
      return { success: false, message: "Editor chưa sẵn sàng." };
    }

    const { schema } = editor.state;
    const crossRefType = schema.nodes.crossReference;

    if (!crossRefType) {
      return { success: false, message: "Node schema 'crossReference' chưa được đăng ký." };
    }

    // Phân giải trước chuỗi hiển thị để lưu dự phòng (customText)
    const resolved = this.resolveTarget(editor.state.doc, {
      targetId: options.targetId,
      targetType: options.targetType,
      format: options.format,
    });

    const crossRefNode = crossRefType.create({
      targetId: options.targetId,
      targetType: options.targetType,
      format: options.format,
      customText: resolved.found ? resolved.text : "[Reference not found]",
    });

    const tr = editor.state.tr.replaceSelectionWith(crossRefNode);
    editor.view.dispatch(tr);
    try {
      if (editor.view && typeof (editor.view as any).focus === "function") {
        editor.view.focus();
      }
    } catch {
      // Bỏ qua focus trong headless test
    }

    return {
      success: true,
      message: `Đã chèn tham chiếu chéo thành công.`,
    };
  }

  /**
   * Điều hướng con trỏ tới đối tượng mục tiêu khi người dùng nhấp vào Cross-reference
   */
  public static navigateToTarget(
    editor: Editor,
    targetId: string,
    targetType: CrossReferenceTargetType
  ): { success: boolean } {
    if (!editor || !editor.state) return { success: false };

    // Thử theo loại mục tiêu khai báo
    if (targetType === "heading") {
      const ok = HeadingService.navigateToHeading(editor, targetId);
      if (ok) return { success: true };
    } else if (["caption", "figure", "table", "equation"].includes(targetType)) {
      const res = CaptionService.navigateToCaption(editor, targetId);
      if (res.success) return res;
    } else if (["footnote", "endnote"].includes(targetType)) {
      const res = NoteService.navigateToNoteReference(editor, targetId);
      if (res.success) return res;
    } else if (targetType === "bookmark") {
      const ok = BookmarkService.navigateToBookmark(editor, targetId);
      if (ok) return { success: true };
    }

    // Quét tổng quát qua tất cả nếu loại mục tiêu chưa xác định đúng
    if (HeadingService.navigateToHeading(editor, targetId)) return { success: true };
    if (CaptionService.navigateToCaption(editor, targetId).success) return { success: true };
    if (NoteService.navigateToNoteReference(editor, targetId).success) return { success: true };
    if (BookmarkService.navigateToBookmark(editor, targetId)) return { success: true };

    return { success: false };
  }
}
