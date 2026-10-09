import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import type {
  CaptionAttrs,
  CaptionItem,
  CaptionLabel,
  InsertCaptionOptions,
} from "../types/captionTypes.ts";
import { buildPageLayoutMap, type PageLayoutMap } from "../../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/services/pageConstants.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";

/**
 * Caption Service - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Dịch vụ cốt lõi quản lý Chú thích đối tượng (Captions):
 * - Đánh số tự động xác định (Deterministic continuous numbering per label).
 * - Nguồn chân lý duy nhất trong ProseMirror AST (Single Source of Truth).
 * - Phát hiện và gắn kết với các đối tượng Image, Table, Equation, Shape.
 * - Điều hướng và tương tác an toàn không gây lệch vị trí hay mồ côi metadata.
 */
export class CaptionService {
  /**
   * Sinh mã định danh bền vững cho Caption: ref_cap_<label>_<uuid>
   */
  public static generateCaptionId(label: string = "figure"): string {
    const cleanLabel = label.toLowerCase().replace(/[^a-z0-9]/g, "");
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `ref_cap_${cleanLabel || "item"}_${Date.now()}_${randomSuffix}`;
  }

  /**
   * Sinh mã định danh bền vững cho đối tượng: ref_obj_<type>_<uuid>
   */
  public static generateObjectId(objectType: string): string {
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `ref_obj_${objectType}_${Date.now()}_${randomSuffix}`;
  }

  /**
   * Quét toàn bộ cây AST và trích xuất danh sách tất cả Captions theo thứ tự xuất hiện.
   * Số thứ tự được đánh độc lập theo từng loại nhãn (Figure 1, 2... Table 1, 2... Equation 1, 2...).
   * Tự động phân giải số trang chính xác qua PageLayoutMap tập trung (Phase 10).
   */
  public static extractCaptions(
    doc: ProsemirrorNode | JSONContent,
    layoutMap?: PageLayoutMap | null
  ): CaptionItem[] {
    const results: CaptionItem[] = [];
    const labelCounters = new Map<string, number>();

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

    // Trường hợp ProsemirrorNode (runtime state)
    if (typeof (doc as ProsemirrorNode).descendants === "function") {
      (doc as ProsemirrorNode).descendants((node, pos) => {
        if (node.type.name === "caption") {
          const id = (node.attrs.id as string) || `cap_${pos}`;
          const label = ((node.attrs.label as string) || "Figure").trim();
          const targetId = (node.attrs.targetId as string) || null;
          const positionPolicy = (node.attrs.positionPolicy as any) || "below";

          // Lấy văn bản caption từ nội dung inline hoặc attrs.text
          const text = (node.textContent || (node.attrs.text as string) || "").trim();

          const currentCount = (labelCounters.get(label) || 0) + 1;
          labelCounters.set(label, currentCount);

          const labelAndNumber = `${label} ${currentCount}`;
          const fullTitle = text ? `${labelAndNumber} — ${text}` : labelAndNumber;
          const pageNumber = effectiveLayout
            ? effectiveLayout.getPageNumberForPosition(pos)
            : 1;

          results.push({
            id,
            label,
            number: currentCount,
            text,
            labelAndNumber,
            fullTitle,
            targetId,
            positionPolicy,
            pos,
            pageNumber,
          });
          return false;
        }
      });
      return results;
    }

    // Trường hợp JSONContent (persistence hoặc serialization)
    const scanJson = (node: JSONContent, currentOffset: number = 0) => {
      if (node.type === "caption") {
        const attrs = (node.attrs as CaptionAttrs) || {};
        const id = attrs.id || `cap_${currentOffset}`;
        const label = (attrs.label || "Figure").trim();
        const targetId = attrs.targetId || null;
        const positionPolicy = attrs.positionPolicy || "below";

        // Trích xuất text từ mảng content con
        let text = (attrs.text as string) || "";
        if (node.content && Array.isArray(node.content)) {
          text = node.content
            .map((c) => c.text || "")
            .join("")
            .trim();
        }

        const currentCount = (labelCounters.get(label) || 0) + 1;
        labelCounters.set(label, currentCount);

        const labelAndNumber = `${label} ${currentCount}`;
        const fullTitle = text ? `${labelAndNumber} — ${text}` : labelAndNumber;
        const pageNumber = effectiveLayout
          ? effectiveLayout.getPageNumberForPosition(currentOffset)
          : 1;

        results.push({
          id,
          label,
          number: currentCount,
          text,
          labelAndNumber,
          fullTitle,
          targetId,
          positionPolicy,
          pos: currentOffset,
          pageNumber,
        });
        return;
      }

      if (node.content && Array.isArray(node.content)) {
        let childOffset = currentOffset + 1;
        for (const child of node.content) {
          scanJson(child, childOffset);
          childOffset += 1;
        }
      }
    };

    scanJson(doc as JSONContent);
    return results;
  }

  /**
   * Lấy số trang của một Caption dựa trên ID ngữ nghĩa
   * Sử dụng authoritative PageLayoutMap (Phase 10).
   */
  public static getPageForCaption(
    captionId: string,
    doc?: ProsemirrorNode | JSONContent,
    layoutMap?: PageLayoutMap | null
  ): number {
    if (!doc || !captionId) return 1;
    const captions = this.extractCaptions(doc, layoutMap);
    const target = captions.find((c) => c.id === captionId);
    return target?.pageNumber ?? 1;
  }

  /**
   * Tính toán số thứ tự động cho một caption cụ thể trong tài liệu
   */
  public static getCaptionNumber(
    doc: ProsemirrorNode | JSONContent,
    captionId: string
  ): number {
    const list = this.extractCaptions(doc);
    const item = list.find((c) => c.id === captionId);
    return item ? item.number : 1;
  }

  /**
   * Tìm vị trí (offset) của một Caption node trong tài liệu dựa trên ID ngữ nghĩa
   */
  public static findCaptionPosition(
    doc: ProsemirrorNode,
    captionId: string
  ): number | null {
    if (!doc || !captionId) return null;
    let found: number | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === "caption" && node.attrs.id === captionId) {
        found = pos;
        return false;
      }
      return true;
    });
    return found;
  }

  /**
   * Phát hiện đối tượng đang chọn (Image, Table, Equation, Shape, TextBox)
   */
  public static detectSelectedTarget(editor: Editor): {
    targetType: "image" | "table" | "equation" | "shape" | "textBox";
    targetPos: number;
    targetNode: ProsemirrorNode;
    targetId: string | null;
  } | null {
    if (!editor || !editor.state) return null;
    const { state } = editor;
    const { selection } = state;

    // 1. Kiểm tra NodeSelection
    if (selection instanceof NodeSelection && selection.node) {
      const nodeName = selection.node.type.name;
      if (["image", "table", "equation", "shape", "textBox"].includes(nodeName)) {
        return {
          targetType: nodeName as any,
          targetPos: selection.from,
          targetNode: selection.node,
          targetId: (selection.node.attrs.id as string) || null,
        };
      }
    }

    // 2. Kiểm tra nếu con trỏ đang nằm bên trong bảng (Table)
    const { $from } = selection;
    for (let d = $from.depth; d >= 0; d--) {
      const n = $from.node(d);
      if (n && n.type.name === "table") {
        return {
          targetType: "table",
          targetPos: $from.before(d),
          targetNode: n,
          targetId: (n.attrs.id as string) || null,
        };
      }
    }

    // 3. Kiểm tra node liền kề trước hoặc sau con trỏ
    if ($from.nodeBefore && ["image", "equation", "shape"].includes($from.nodeBefore.type.name)) {
      return {
        targetType: $from.nodeBefore.type.name as any,
        targetPos: $from.pos - $from.nodeBefore.nodeSize,
        targetNode: $from.nodeBefore,
        targetId: ($from.nodeBefore.attrs.id as string) || null,
      };
    }
    if ($from.nodeAfter && ["image", "equation", "shape"].includes($from.nodeAfter.type.name)) {
      return {
        targetType: $from.nodeAfter.type.name as any,
        targetPos: $from.pos,
        targetNode: $from.nodeAfter,
        targetId: ($from.nodeAfter.attrs.id as string) || null,
      };
    }

    return null;
  }

  /**
   * Gán nhãn mặc định phù hợp theo loại đối tượng
   */
  public static getDefaultLabelForType(targetType?: string): CaptionLabel {
    switch (targetType) {
      case "table":
        return "Table";
      case "equation":
        return "Equation";
      case "image":
      case "shape":
      default:
        return "Figure";
    }
  }

  /**
   * Chèn một Caption semantic vào tài liệu
   */
  public static insertCaption(
    editor: Editor,
    options: InsertCaptionOptions
  ): { success: boolean; captionId?: string; message?: string } {
    if (!editor || !editor.state) {
      return { success: false, message: "Editor chưa sẵn sàng." };
    }

    const { state } = editor;
    const { schema } = state;
    const captionType = schema.nodes.caption;

    if (!captionType) {
      return { success: false, message: "Node schema 'caption' chưa được đăng ký." };
    }

    const detected = this.detectSelectedTarget(editor);
    let targetId = options.targetId || (detected ? detected.targetId : null);
    let insertPos = state.selection.to;
    const positionPolicy =
      options.positionPolicy || (options.label === "Table" ? "above" : "below");

    const tr = state.tr;

    // Nếu có đối tượng mục tiêu nhưng chưa có ID, tự động gán ID bền vững
    if (detected) {
      if (!targetId) {
        targetId = this.generateObjectId(detected.targetType);
        tr.setNodeMarkup(detected.targetPos, undefined, {
          ...detected.targetNode.attrs,
          id: targetId,
        });
      }

      // Xác định vị trí chèn theo positionPolicy
      if (positionPolicy === "above") {
        insertPos = detected.targetPos;
      } else {
        insertPos = detected.targetPos + detected.targetNode.nodeSize;
      }
    } else {
      const $to = state.selection.$to;
      if ($to && $to.depth > 0) {
        insertPos = $to.after(1);
      } else {
        insertPos = state.selection.to;
      }
    }

    const captionId = this.generateCaptionId(options.label);
    const textContent = (options.text || "").trim();

    // Tạo node caption với inline text nếu có
    const textNode = textContent ? schema.text(textContent) : null;
    const captionNode = captionType.create(
      {
        id: captionId,
        label: options.label || "Figure",
        text: textContent,
        targetId,
        positionPolicy,
      },
      textNode ? [textNode] : []
    );

    tr.insert(insertPos, captionNode);

    // Di chuyển con trỏ vào bên trong caption vừa tạo
    const targetCaretPos = insertPos + (textContent ? textContent.length + 1 : 1);
    try {
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(targetCaretPos, tr.doc.content.size))));
    } catch {
      // Bỏ qua nếu vị trí ngoài lề
    }

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
      captionId,
      message: `Đã chèn chú thích ${options.label} thành công.`,
    };
  }

  /**
   * Xóa một Caption khỏi tài liệu bằng ID
   */
  public static deleteCaption(
    editor: Editor,
    captionId: string
  ): { success: boolean; message?: string } {
    if (!editor || !editor.state) return { success: false };

    let foundPos: number | null = null;
    let foundNodeSize = 0;

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "caption" && node.attrs.id === captionId) {
        foundPos = pos;
        foundNodeSize = node.nodeSize;
        return false;
      }
    });

    if (foundPos !== null) {
      const tr = editor.state.tr.delete(foundPos, foundPos + foundNodeSize);
      editor.view.dispatch(tr);
      return { success: true };
    }

    return { success: false, message: "Không tìm thấy chú thích để xóa." };
  }

  /**
   * Điều hướng con trỏ tới vị trí của Caption
   */
  public static navigateToCaption(
    editor: Editor,
    captionId: string
  ): { success: boolean } {
    if (!editor || !editor.state) return { success: false };

    let targetPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "caption" && node.attrs.id === captionId) {
        targetPos = pos;
        return false;
      }
    });

    if (targetPos === null) return { success: false };

    try {
      const tr = editor.state.tr.setSelection(
        TextSelection.near(editor.state.doc.resolve(targetPos + 1))
      );
      editor.view.dispatch(tr);
      if (editor.view && typeof (editor.view as any).focus === "function") {
        editor.view.focus();
      }

      // Cuộn mượt vào viewport
      const domNode = editor.view?.nodeDOM ? (editor.view.nodeDOM(targetPos) as HTMLElement | null) : null;
      if (domNode && typeof domNode.scrollIntoView === "function") {
        domNode.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      return { success: true };
    } catch {
      return { success: true };
    }
  }
}
