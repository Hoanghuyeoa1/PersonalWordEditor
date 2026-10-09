import { Node, mergeAttributes } from "@tiptap/core";
import { CrossReferenceService } from "../services/crossReferenceService.ts";
import type { CrossReferenceAttrs } from "../types/crossReferenceTypes.ts";

/**
 * CrossReferenceExtension - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Định nghĩa inline atom node `crossReference` trong ProseMirror AST:
 * - Đại diện cho tham chiếu chéo ngữ nghĩa tới một ID (Heading, Caption, Note).
 * - Kết xuất nội dung động qua NodeView, không sao chép văn bản tĩnh vào AST.
 * - Triệt tiêu 100% rủi ro vòng lặp với Track Changes do không phát sinh text mutations.
 * - An toàn khi đối tượng mục tiêu bị xóa: hiển thị "[Reference not found]".
 */
export const CrossReferenceExtension = Node.create({
  name: "crossReference",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      targetId: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-target-id") || element.getAttribute("href") || "",
        renderHTML: (attributes) => ({
          "data-target-id": attributes.targetId || "",
        }),
      },
      targetType: {
        default: "caption",
        parseHTML: (element) =>
          (element.getAttribute("data-target-type") as any) || "caption",
        renderHTML: (attributes) => ({
          "data-target-type": attributes.targetType || "caption",
        }),
      },
      format: {
        default: "text",
        parseHTML: (element) =>
          (element.getAttribute("data-format") as any) || "text",
        renderHTML: (attributes) => ({
          "data-format": attributes.format || "text",
        }),
      },
      customText: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-custom-text") || null,
        renderHTML: (attributes) =>
          attributes.customText ? { "data-custom-text": attributes.customText } : {},
      },
    };
  },

  parseHTML() {
    return [
      { tag: "span.editor-cross-reference" },
      { tag: "a.editor-cross-reference" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "editor-cross-reference",
      }),
      HTMLAttributes["data-custom-text"] || "[Cross-reference]",
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      if (typeof document === "undefined") {
        return {
          dom: null as any,
        };
      }

      const dom = document.createElement("span");
      const attrs = node.attrs as unknown as CrossReferenceAttrs;
      dom.setAttribute("data-target-id", attrs.targetId);
      dom.setAttribute("data-target-type", attrs.targetType);
      dom.setAttribute("data-format", attrs.format);

      const resolved = CrossReferenceService.resolveTarget(editor.state.doc, attrs);
      if (resolved.found) {
        dom.textContent = resolved.text;
        dom.title = `Nhấp để chuyển tới: ${resolved.text}`;
      } else {
        dom.className = "editor-cross-reference broken";
        dom.textContent = "[Reference not found]";
        dom.title = "Không tìm thấy đối tượng tham chiếu trong tài liệu";
      }

      dom.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        CrossReferenceService.navigateToTarget(
          editor,
          attrs.targetId,
          attrs.targetType
        );
      });

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "crossReference") return false;
          const updatedAttrs = updatedNode.attrs as unknown as CrossReferenceAttrs;
          const nextResolved = CrossReferenceService.resolveTarget(
            editor.state.doc,
            updatedAttrs
          );
          if (nextResolved.found) {
            dom.className = "editor-cross-reference";
            dom.textContent = nextResolved.text;
            dom.title = `Nhấp để chuyển tới: ${nextResolved.text}`;
          } else {
            dom.className = "editor-cross-reference broken";
            dom.textContent = "[Reference not found]";
            dom.title = "Không tìm thấy đối tượng tham chiếu trong tài liệu";
          }
          return true;
        },
      };
    };
  },
});
