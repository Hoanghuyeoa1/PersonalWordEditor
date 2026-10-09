import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { CaptionService } from "./captionService.ts";

import type {
  CaptionListConfig,
  CaptionListEntry,
  CaptionListNodeAttrs,
} from "../types/captionListTypes.ts";
import { buildPageLayoutMap, type PageLayoutMap } from "../../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/services/pageConstants.ts";

/**
 * Caption List Service - Personal Word Editor (Phase 2 Semantic Core)
 *
 * Dịch vụ cốt lõi quản lý Danh mục Chú thích (Table of Figures / List of Captions):
 * - Tái sử dụng 100% nguồn chân lý từ Document AST và CaptionService hiện tại.
 * - Hỗ trợ lọc theo bất kỳ nhãn nào: Figure (Hình), Table (Bảng), Equation (Công thức), custom label.
 * - Tự động đồng bộ số thứ tự động và số trang từ PageLayoutMap mà không tạo thêm pagination logic mới.
 * - Hỗ trợ nhiều danh mục độc lập trong cùng một tài liệu (ví dụ: Danh mục hình + Danh mục bảng).
 * - Hoàn toàn không quét DOM bằng querySelector, không dispatch transaction trong render loop.
 */
export class CaptionListService {
  /**
   * Sinh mã định danh duy nhất cho CaptionList node: ref_clist_<label>_<timestamp>_<suffix>
   */
  public static generateCaptionListId(label: string = "Figure"): string {
    const cleanLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `ref_clist_${cleanLabel || "item"}_${Date.now()}_${randomSuffix}`;
  }

  /**
   * Lấy tiêu đề mặc định phù hợp với nhãn chú thích
   */
  public static getDefaultTitle(label: string = "Figure"): string {
    const normalized = label.trim().toLowerCase();
    switch (normalized) {
      case "figure":
        return "Danh mục hình ảnh";
      case "table":
        return "Danh mục bảng biểu";
      case "equation":
        return "Danh mục phương trình";
      default:
        return `Danh mục ${label.trim() || "đối tượng"}`;
    }
  }

  /**
   * Khám phá toàn bộ các nhãn Caption khả dụng trong tài liệu (Semantic Discovery):
   * - Luôn bắt đầu bằng 3 nhãn chuẩn: "Figure", "Table", "Equation".
   * - Quét động các node Caption trong AST để phát hiện các custom labels (ví dụ: "Sơ đồ", "Biểu đồ").
   * - Hoàn toàn không quét DOM, không lưu global state trong Zustand.
   */
  public static getAvailableLabels(doc?: ProsemirrorNode | JSONContent | null): string[] {
    const defaultLabels = ["Figure", "Table", "Equation"];
    if (!doc) return defaultLabels;

    const existingCaptions = CaptionService.extractCaptions(doc);
    const seen = new Set(defaultLabels.map((l) => l.toLowerCase()));
    const result = [...defaultLabels];

    for (const cap of existingCaptions) {
      const clean = (cap.label || "").trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        result.push(clean);
      }
    }

    return result;
  }


  /**
   * Sinh danh sách các mục (CaptionListEntry[]) từ cây AST hiện tại và nhãn chỉ định.
   * Tái sử dụng hoàn toàn CaptionService.extractCaptions() để đảm bảo:
   * 1. Số thứ tự đánh số tự động được phân giải chính xác (Figure 1, Figure 2...).
   * 2. Số trang được lấy qua authoritative PageLayoutMap tập trung.
   * 3. Xử lý an toàn trường hợp không có caption nào (trả về mảng rỗng []).
   */
  public static generateEntries(
    doc: ProsemirrorNode | JSONContent,
    label: string = "Figure",
    layoutMap?: PageLayoutMap | null
  ): CaptionListEntry[] {
    if (!doc) return [];

    const allCaptions = CaptionService.extractCaptions(doc, layoutMap);
    const targetLabel = label.trim().toLowerCase();

    // Lọc theo nhãn được chỉ định (không phân biệt chữ hoa/thường)
    const filtered = allCaptions.filter(
      (c) => c.label.trim().toLowerCase() === targetLabel
    );

    return filtered.map((c) => ({
      captionId: c.id,
      targetId: c.targetId,
      label: c.label,
      number: c.number,
      text: c.text,
      fullTitle: c.fullTitle,
      labelAndNumber: c.labelAndNumber,
      pageNumber: c.pageNumber ?? 1,
    }));
  }

  /**
   * Tìm tất cả các node captionList trong tài liệu (hỗ trợ lọc theo nhãn nếu cần)
   */
  public static findCaptionListNodes(
    doc: ProsemirrorNode,
    filterLabel?: string
  ): Array<{ pos: number; node: ProsemirrorNode }> {
    const results: Array<{ pos: number; node: ProsemirrorNode }> = [];
    if (!doc || typeof doc.descendants !== "function") return results;

    const targetLabel = filterLabel ? filterLabel.trim().toLowerCase() : null;

    doc.descendants((node, pos) => {
      if (node.type.name === "captionList") {
        if (
          !targetLabel ||
          (typeof node.attrs.label === "string" &&
            node.attrs.label.trim().toLowerCase() === targetLabel)
        ) {
          results.push({ pos, node });
        }
        return false; // Atom block node, không duyệt con
      }
      return true;
    });

    return results;
  }

  /**
   * Kiểm tra tài liệu hiện có khối CaptionList (cho nhãn cụ thể hoặc bất kỳ) hay chưa
   */
  public static hasCaptionList(
    doc: ProsemirrorNode,
    filterLabel?: string
  ): boolean {
    return this.findCaptionListNodes(doc, filterLabel).length > 0;
  }

  /**
   * Phân giải Caption List đang hoạt động dựa trên ngữ cảnh con trỏ / selection:
   * 1. Ưu tiên: Selection hoặc caret nằm bên trong khối captionList -> trả về khối đó.
   * 2. Nếu con trỏ đang nằm trong TOC hoặc Bibliography -> trả về null (tránh cập nhật nhầm).
   * 3. Nếu con trỏ ở ngoài nhưng toàn tài liệu chỉ có đúng 1 Caption List -> deterministic fallback.
   * 4. Nếu có nhiều Caption List nhưng con trỏ ở ngoài -> trả về null.
   */
  public static resolveActiveCaptionList(
    editor?: Editor | null
  ): { pos: number; node: ProsemirrorNode } | null {
    if (!editor || !editor.state) return null;
    const { doc, selection } = editor.state;
    const allLists = this.findCaptionListNodes(doc);
    if (allLists.length === 0) return null;

    const from = selection.from;
    const to = selection.to;

    // 1. Kiểm tra nếu selection là NodeSelection trên captionList
    if ((selection as any).node && (selection as any).node.type.name === "captionList") {
      const found = allLists.find((item) => item.pos === selection.from);
      if (found) return found;
      return { pos: selection.from, node: (selection as any).node };
    }

    // 2. Kiểm tra nếu caret/selection nằm trong phạm vi của một captionList
    for (const item of allLists) {
      const start = item.pos;
      const end = item.pos + item.node.nodeSize;
      if ((from >= start && to <= end) || (Math.max(from, start) < Math.min(to, end))) {
        return item;
      }
    }

    // Kiểm tra xem selection có nằm trong TOC hoặc Bibliography hay không
    let isInOtherField = false;
    doc.descendants((node, pos) => {
      if (node.type.name === "tableOfContents" || node.type.name === "bibliography") {
        const start = pos;
        const end = pos + node.nodeSize;
        if ((from >= start && to <= end) || (Math.max(from, start) < Math.min(to, end))) {
          isInOtherField = true;
          return false;
        }
      }
      return true;
    });

    if (isInOtherField) {
      return null;
    }

    // 3. Deterministic fallback: Nếu trong toàn bộ tài liệu chỉ có đúng 1 Caption List
    if (allLists.length === 1) {
      return allLists[0];
    }

    return null;
  }

  /**
   * Chèn khối Danh mục Chú thích (CaptionList) semantic vào tài liệu
   */
  public static insertCaptionList(
    editor: Editor,
    config?: CaptionListConfig
  ): { success: boolean; listId?: string; message?: string } {
    if (!editor || !editor.state) {
      return { success: false, message: "Editor chưa sẵn sàng." };
    }

    const { state } = editor;
    const { schema } = state;
    const listType = schema.nodes.captionList;

    if (!listType) {
      return {
        success: false,
        message: "Node schema 'captionList' chưa được đăng ký trong editor.",
      };
    }

    const label = (config?.label || "Figure").trim() || "Figure";
    const title = (config?.title || "").trim() || this.getDefaultTitle(label);
    const id = config?.id || this.generateCaptionListId(label);
    const preset = config?.preset || "classic";
    const showPageNumbers = config?.showPageNumbers !== false;
    const rightAlignPageNumbers = config?.rightAlignPageNumbers !== false;

    // Sinh các mục từ cây AST hiện tại
    const entries = this.generateEntries(state.doc, label);

    const listNode = listType.create({
      id,
      title,
      label,
      showPageNumbers,
      rightAlignPageNumbers,
      preset,
      entries,
      lastUpdated: new Date().toISOString(),
    });

    const { tr, selection } = state;
    const $to = selection.$to;
    let insertPos = selection.to;
    if ($to && $to.depth > 0) {
      insertPos = $to.after(1);
    }

    tr.insert(insertPos, listNode);

    try {
      const nextPos = Math.min(insertPos + listNode.nodeSize, tr.doc.content.size);
      tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos)));
    } catch {
      // ignore
    }

    tr.setMeta("addToHistory", true);
    editor.view.dispatch(tr);


    try {
      if (editor.view && typeof (editor.view as any).focus === "function") {
        editor.view.focus();
      }
    } catch {
      // headless test
    }

    return {
      success: true,
      listId: id,
      message: `Đã chèn "${title}" (${entries.length} mục) thành công.`,
    };
  }

  /**
   * Cập nhật khối Danh mục Chú thích hiện có trong tài liệu
   * - Nếu truyền `captionListId`: chỉ cập nhật node có ID đó.
   * - Nếu truyền `label`: cập nhật tất cả danh mục của nhãn đó.
   * - Nếu không truyền: cập nhật tất cả các danh mục trong tài liệu.
   * Hỗ trợ cập nhật chỉ số trang (`updatePageNumbersOnly`).
   */
  public static updateCaptionList(
    editor: Editor,
    options?: {
      captionListId?: string;
      label?: string;
      updatePageNumbersOnly?: boolean;
      layoutMap?: PageLayoutMap | null;
    }
  ): { success: boolean; updatedCount: number; message?: string } {
    if (!editor || !editor.state) {
      return { success: false, updatedCount: 0, message: "Editor chưa sẵn sàng." };
    }

    const { doc } = editor.state;
    const allLists = this.findCaptionListNodes(doc);

    if (allLists.length === 0) {
      return {
        success: false,
        updatedCount: 0,
        message: "Không tìm thấy danh mục chú thích nào trong tài liệu.",
      };
    }

    // Lọc các node mục tiêu cần cập nhật
    const targetNodes = allLists.filter(({ node }) => {
      if (options?.captionListId) {
        return node.attrs.id === options.captionListId;
      }
      if (options?.label) {
        return (
          typeof node.attrs.label === "string" &&
          node.attrs.label.trim().toLowerCase() === options.label.trim().toLowerCase()
        );
      }
      return true;
    });

    if (targetNodes.length === 0) {
      return {
        success: false,
        updatedCount: 0,
        message: "Không tìm thấy danh mục chú thích phù hợp với điều kiện cập nhật.",
      };
    }

    const freshLayout =
      options?.layoutMap ??
      buildPageLayoutMap(editor.getJSON(), DEFAULT_PAGE_SETTINGS);

    const tr = editor.state.tr;
    let updatedCount = 0;

    for (const { pos, node } of targetNodes) {
      const currentAttrs = node.attrs as CaptionListNodeAttrs;
      const nodeLabel = currentAttrs.label || "Figure";

      // Sinh danh sách mục mới từ AST hiện tại
      const freshEntries = this.generateEntries(
        doc,
        nodeLabel,
        freshLayout
      );

      let finalEntries: CaptionListEntry[] = freshEntries;

      if (options?.updatePageNumbersOnly) {
        // Chỉ cập nhật số trang, giữ nguyên cấu trúc text/title cũ nếu có
        const pageNumberMap = new Map<string, number>();
        for (const e of freshEntries) {
          pageNumberMap.set(e.captionId, e.pageNumber ?? 1);
        }
        finalEntries = (currentAttrs.entries || []).map((entry) => ({
          ...entry,
          pageNumber: pageNumberMap.get(entry.captionId) ?? entry.pageNumber ?? 1,
        }));
      }

      tr.setNodeMarkup(pos, undefined, {
        ...currentAttrs,
        entries: finalEntries,
        lastUpdated: new Date().toISOString(),
      });
      updatedCount++;
    }

    if (updatedCount > 0) {
      tr.setMeta("addToHistory", true);
      tr.setMeta("isCaptionListUpdate", true);
      editor.view.dispatch(tr);
    }

    return {
      success: true,
      updatedCount,
      message: `Đã cập nhật ${updatedCount} danh mục chú thích thành công.`,
    };
  }

  /**
   * Xóa một hoặc tất cả khối Danh mục Chú thích khỏi tài liệu
   */
  public static removeCaptionList(
    editor: Editor,
    captionListId?: string
  ): { success: boolean; removedCount: number } {
    if (!editor || !editor.state) return { success: false, removedCount: 0 };

    const { doc } = editor.state;
    const allLists = this.findCaptionListNodes(doc);

    const targets = allLists.filter(({ node }) =>
      captionListId ? node.attrs.id === captionListId : true
    );

    if (targets.length === 0) return { success: false, removedCount: 0 };

    // Xóa từ dưới lên để không làm lệch vị trí offset
    const tr = editor.state.tr;
    targets.sort((a, b) => b.pos - a.pos);

    for (const { pos, node } of targets) {
      tr.delete(pos, pos + node.nodeSize);
    }

    tr.setMeta("addToHistory", true);
    editor.view.dispatch(tr);

    return { success: true, removedCount: targets.length };
  }
}
