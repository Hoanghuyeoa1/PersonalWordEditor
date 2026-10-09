import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TocService } from "./tocService.ts";
import { CaptionListService } from "./captionListService.ts";
import { CitationService } from "./citationService.ts";

export interface ActiveReferenceField {
  type: "toc" | "captionList" | "bibliography";
  pos: number;
  node: ProseMirrorNode;
}

/**
 * ReferenceUpdateService - Quản lý Cập nhật Trường Tham chiếu & Phím tắt F9 (Phase 4 Architecture)
 *
 * Tích hợp điều phối F9 và cập nhật trường tham chiếu tập trung:
 * - Phân giải chính xác ngữ cảnh con trỏ / selection đang nằm trong:
 *   1. TOC (tableOfContents)
 *   2. Caption List (captionList - Figure, Table, Equation...)
 *   3. Bibliography (bibliography)
 * - F9 bên trong TOC -> Cập nhật TOC.
 * - F9 bên trong Caption List -> Cập nhật Caption List đó.
 * - F9 bên trong Bibliography -> Cập nhật Bibliography.
 * - Nếu con trỏ nằm ngoài các khối nhưng toàn tài liệu chỉ có duy nhất 1 trường -> Deterministic fallback cập nhật trường đó.
 * - Tuyệt đối không tạo listener F9 thứ hai, không tự ý "update all" gây mất dữ liệu hoặc sai lệch tài liệu.
 */
export class ReferenceUpdateService {
  /**
   * Xác định trường tham chiếu (Block Atom Node) mà con trỏ / selection hiện tại đang nằm bên trong.
   */
  public static resolveActiveField(editor?: Editor | null): ActiveReferenceField | null {
    if (!editor || !editor.state) return null;
    const { doc, selection } = editor.state;
    const from = selection.from;
    const to = selection.to;

    // Helper kiểm tra xem selection có giao thoa hoặc nằm trong phạm vi node hay không
    const isInside = (pos: number, node: ProseMirrorNode): boolean => {
      if ((selection as any).node && (selection as any).node === node) return true;
      if ((selection as any).node && selection.from === pos) return true;
      const start = pos;
      const end = pos + node.nodeSize;
      return (from >= start && to <= end) || (Math.max(from, start) < Math.min(to, end));
    };

    // 1. Kiểm tra Caption List
    const captionLists = CaptionListService.findCaptionListNodes(doc);
    for (const item of captionLists) {
      if (isInside(item.pos, item.node)) {
        return { type: "captionList", pos: item.pos, node: item.node };
      }
    }

    // 2. Kiểm tra TOC
    const tocItem = TocService.findTocNode(doc);
    if (tocItem && isInside(tocItem.pos, tocItem.node)) {
      return { type: "toc", pos: tocItem.pos, node: tocItem.node };
    }

    // 3. Kiểm tra Bibliography
    let bibItem: { pos: number; node: ProseMirrorNode } | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === "bibliography") {
        bibItem = { pos, node };
        return false;
      }
      return true;
    });
    if (bibItem && isInside((bibItem as any).pos, (bibItem as any).node)) {
      return { type: "bibliography", pos: (bibItem as any).pos, node: (bibItem as any).node };
    }

    return null;
  }

  /**
   * Bộ xử lý F9 thống nhất cho toàn bộ hệ thống References:
   * - inside TOC -> update TOC
   * - inside Caption List -> update Caption List
   * - inside Bibliography -> update Bibliography
   * - Nếu con trỏ bên ngoài nhưng tài liệu chỉ có 1 trường duy nhất -> deterministic update
   * - Trả về boolean chỉ định việc cập nhật có được thực hiện hay không.
   */
  public static executeF9Update(editor?: Editor | null): boolean {
    if (!editor || !editor.state) return false;

    const activeField = this.resolveActiveField(editor);

    if (activeField) {
      switch (activeField.type) {
        case "toc":
          return TocService.updateToc(editor).success;
        case "captionList": {
          const listId = activeField.node.attrs.id;
          return CaptionListService.updateCaptionList(editor, { captionListId: listId }).success;
        }
        case "bibliography":
          return CitationService.updateBibliography(editor).success;
      }
    }

    // Nếu con trỏ bên ngoài các khối: Kiểm tra nếu toàn tài liệu chỉ có duy nhất 1 trường
    const { doc } = editor.state;
    const hasToc = TocService.hasToc(doc);
    const captionLists = CaptionListService.findCaptionListNodes(doc);
    let bibCount = 0;
    doc.descendants((node) => {
      if (node.type.name === "bibliography") {
        bibCount++;
        return false;
      }
      return true;
    });

    const totalFields = (hasToc ? 1 : 0) + captionLists.length + bibCount;

    if (totalFields === 1) {
      if (hasToc) {
        return TocService.updateToc(editor).success;
      }
      if (captionLists.length === 1) {
        return CaptionListService.updateCaptionList(editor, {
          captionListId: captionLists[0].node.attrs.id,
        }).success;
      }
      if (bibCount === 1) {
        return CitationService.updateBibliography(editor).success;
      }
    }

    return false;
  }
}
