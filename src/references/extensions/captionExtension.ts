import { Node, mergeAttributes } from "@tiptap/core";
import { CaptionService } from "../services/captionService.ts";

/**
 * CaptionExtension - Personal Word Editor (Phase 6.5 Architecture)
 *
 * Định nghĩa node `caption` trong ProseMirror / Tiptap AST:
 * - Block node chứa nội dung inline (`group: "block"`, `content: "inline*"`).
 * - Thuộc tính semantic: `id`, `label`, `text`, `targetId`, `positionPolicy`.
 * - Tiền tố số thứ tự (ví dụ: "Figure 1 — ") được kết xuất động qua NodeView,
 *   tuyệt đối không hardcode số thứ tự vào nguồn chân lý AST.
 */
export const CaptionExtension = Node.create({
  name: "caption",
  group: "block",
  content: "inline*",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-caption-id") || element.getAttribute("id") || "",
        renderHTML: (attributes) => ({
          "data-caption-id": attributes.id || "",
          id: attributes.id || undefined,
        }),
      },
      label: {
        default: "Figure",
        parseHTML: (element) => element.getAttribute("data-label") || "Figure",
        renderHTML: (attributes) => ({
          "data-label": attributes.label || "Figure",
        }),
      },
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text") || "",
        renderHTML: (attributes) => ({
          "data-text": attributes.text || "",
        }),
      },
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-id") || null,
        renderHTML: (attributes) =>
          attributes.targetId ? { "data-target-id": attributes.targetId } : {},
      },
      positionPolicy: {
        default: "below",
        parseHTML: (element) => element.getAttribute("data-position") || "below",
        renderHTML: (attributes) => ({
          "data-position": attributes.positionPolicy || "below",
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "p.editor-caption" },
      { tag: "figcaption.editor-caption" },
      { tag: "div.editor-caption" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "editor-caption",
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      if (typeof document === "undefined") {
        return {
          dom: null as any,
        };
      }

      const dom = document.createElement("p");
      dom.className = "editor-caption";
      dom.setAttribute("data-caption-id", node.attrs.id);
      dom.setAttribute("data-label", node.attrs.label);
      if (node.attrs.targetId) {
        dom.setAttribute("data-target-id", node.attrs.targetId);
      }

      const prefixSpan = document.createElement("span");
      prefixSpan.className = "caption-prefix";
      prefixSpan.contentEditable = "false";

      // Tính toán số thứ tự động từ AST hiện tại
      const num = CaptionService.getCaptionNumber(editor.state.doc, node.attrs.id);
      prefixSpan.textContent = `${node.attrs.label} ${num} — `;

      const contentSpan = document.createElement("span");
      contentSpan.className = "caption-content";

      dom.appendChild(prefixSpan);
      dom.appendChild(contentSpan);

      return {
        dom,
        contentDOM: contentSpan,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "caption") return false;
          const nextNum = CaptionService.getCaptionNumber(editor.state.doc, updatedNode.attrs.id);
          prefixSpan.textContent = `${updatedNode.attrs.label} ${nextNum} — `;
          return true;
        },
      };
    };
  },
});
