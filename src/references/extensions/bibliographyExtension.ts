import { Node, mergeAttributes } from "@tiptap/core";
import { CitationService } from "../services/citationService.ts";
import type { BibliographyAttrs, BibliographyEntry, CitationStyle } from "../types/citationTypes.ts";

/**
 * Bibliography Extension - Personal Word Editor (Phase 6.6 Architecture)
 *
 * Block node đại diện cho Thư mục tài liệu tham khảo (Bibliography):
 * - Block Atom Node độc lập trong ProseMirror AST.
 * - Tự động biên soạn danh sách nguồn trích dẫn từ tài liệu.
 * - Sắp xếp theo quy cách style (APA: bảng chữ cái; IEEE: số thứ tự [1], [2]...).
 * - Nút "Cập nhật" trực quan để làm mới danh mục khi metadata thay đổi.
 */
export const BibliographyExtension = Node.create({
  name: "bibliography",

  group: "block",

  atom: true,

  defining: true,

  isolating: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      title: {
        default: "Tài liệu tham khảo",
        parseHTML: (element) => element.getAttribute("data-title") || "Tài liệu tham khảo",
        renderHTML: (attributes) => ({
          "data-title": attributes.title,
        }),
      },
      style: {
        default: "apa",
        parseHTML: (element) => (element.getAttribute("data-style") as CitationStyle) || "apa",
        renderHTML: (attributes) => ({
          "data-style": attributes.style,
        }),
      },
      filter: {
        default: "citedOnly",
        parseHTML: (element) => element.getAttribute("data-filter") || "citedOnly",
        renderHTML: (attributes) => ({
          "data-filter": attributes.filter,
        }),
      },
      lastUpdated: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-last-updated") || "",
        renderHTML: (attributes) => ({
          "data-last-updated": attributes.lastUpdated,
        }),
      },
      entries: {
        default: [],
        parseHTML: (element) => {
          try {
            const raw = element.getAttribute("data-entries");
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          "data-entries": JSON.stringify(attributes.entries || []),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div.editor-bibliography",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        {
          class: "editor-bibliography",
        },
        HTMLAttributes
      ),
      [
        "h2",
        { class: "bibliography-title" },
        HTMLAttributes["data-title"] || "Tài liệu tham khảo",
      ],
      [
        "div",
        { class: "bibliography-list" },
        "",
      ],
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      if (typeof document === "undefined") {
        return { dom: null as any };
      }

      const dom = document.createElement("div");
      dom.className = "editor-bibliography";

      const renderContent = (attrs: BibliographyAttrs) => {
        dom.innerHTML = "";

        // Thanh tiêu đề & nút điều khiển
        const header = document.createElement("div");
        header.className = "bibliography-header";

        const title = document.createElement("h2");
        title.className = "bibliography-title";
        title.textContent = attrs.title || "Tài liệu tham khảo";
        header.appendChild(title);

        const actions = document.createElement("div");
        actions.className = "bibliography-actions";

        const updateBtn = document.createElement("button");
        updateBtn.type = "button";
        updateBtn.className = "bibliography-update-btn";
        updateBtn.textContent = "Cập nhật (F9)";
        updateBtn.title = "Làm mới danh mục tài liệu tham khảo theo nội dung hiện tại";
        updateBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          CitationService.updateBibliography(editor);
        });
        actions.appendChild(updateBtn);
        header.appendChild(actions);
        dom.appendChild(header);

        // Danh sách các mục
        const entries = (attrs.entries as BibliographyEntry[]) || [];

        if (entries.length === 0) {
          const empty = document.createElement("div");
          empty.className = "bibliography-empty";
          empty.textContent = "(Chưa có tài liệu tham khảo nào được trích dẫn trong tài liệu)";
          dom.appendChild(empty);
          return;
        }

        const list = document.createElement(attrs.style === "ieee" ? "ol" : "ul");
        list.className = `bibliography-list bibliography-${attrs.style}`;

        for (const item of entries) {
          const li = document.createElement("li");
          li.className = "bibliography-item";
          li.setAttribute("data-source-id", item.id);
          li.textContent = item.text;
          list.appendChild(li);
        }

        dom.appendChild(list);
      };

      renderContent(node.attrs as unknown as BibliographyAttrs);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "bibliography") return false;
          renderContent(updatedNode.attrs as unknown as BibliographyAttrs);
          return true;
        },
      };
    };
  },
});
