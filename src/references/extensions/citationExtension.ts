import { Node, mergeAttributes } from "@tiptap/core";
import { CitationService } from "../services/citationService.ts";
import type { CitationAttrs, CitationStyle } from "../types/citationTypes.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";

/**
 * Citation Extension - Personal Word Editor (Phase 6.6 Architecture)
 *
 * Node inline atom đại diện cho dấu trích dẫn ngữ nghĩa (In-text Citation):
 * - Không copy plain text thuần túy: liên kết trực tiếp tới sourceId của nguồn.
 * - Hiển thị động theo kiểu trích dẫn (APA hoặc IEEE).
 * - Tự động cập nhật khi đổi kiểu trích dẫn hoặc metadata của nguồn.
 * - Trạng thái an toàn "[Citation not found]" khi nguồn bị xóa hoặc hỏng, crash-proof.
 */
export const CitationExtension = Node.create({
  name: "citation",

  group: "inline",

  inline: true,

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      sourceId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-source-id") || "",
        renderHTML: (attributes) => ({
          "data-source-id": attributes.sourceId,
        }),
      },
      style: {
        default: "apa",
        parseHTML: (element) => (element.getAttribute("data-style") as CitationStyle) || "apa",
        renderHTML: (attributes) => ({
          "data-style": attributes.style,
        }),
      },
      prefix: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-prefix") || "",
        renderHTML: (attributes) => ({
          "data-prefix": attributes.prefix,
        }),
      },
      suffix: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-suffix") || "",
        renderHTML: (attributes) => ({
          "data-suffix": attributes.suffix,
        }),
      },
      customText: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-custom-text") || "",
        renderHTML: (attributes) => ({
          "data-custom-text": attributes.customText,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-source-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        {
          class: "editor-citation",
        },
        HTMLAttributes
      ),
      HTMLAttributes["data-custom-text"] || "(Citation)",
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      if (typeof document === "undefined") {
        return { dom: null as any };
      }

      const dom = document.createElement("span");
      const attrs = node.attrs as unknown as CitationAttrs;

      const renderCitation = (currentAttrs: CitationAttrs) => {
        dom.setAttribute("data-source-id", currentAttrs.sourceId);
        dom.setAttribute("data-style", currentAttrs.style || "apa");
        if (currentAttrs.prefix) dom.setAttribute("data-prefix", currentAttrs.prefix);
        if (currentAttrs.suffix) dom.setAttribute("data-suffix", currentAttrs.suffix);

        const source = CitationService.getSource(currentAttrs.sourceId);
        const docStyle = useDocumentStore.getState().citationStyle || "apa";
        const style = currentAttrs.style || docStyle;

        const index = style === "ieee"
          ? CitationService.getSourceIndex(editor.state.doc, currentAttrs.sourceId)
          : undefined;

        if (source) {
          const text = CitationService.formatInTextCitation(source, style, {
            prefix: currentAttrs.prefix,
            suffix: currentAttrs.suffix,
            index,
          });
          dom.className = "editor-citation";
          dom.textContent = text;
          dom.title = `${source.title} — ${source.authors} (${source.year})`;
        } else {
          dom.className = "editor-citation broken";
          dom.textContent = "[Citation not found]";
          dom.title = "Nguồn tài liệu tham khảo không tồn tại hoặc đã bị xóa.";
        }
      };

      renderCitation(attrs);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "citation") return false;
          renderCitation(updatedNode.attrs as unknown as CitationAttrs);
          return true;
        },
      };
    };
  },
});
