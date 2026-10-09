import { Node, Mark, mergeAttributes } from "@tiptap/core";

export interface BookmarkExtensionOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      /**
       * Thêm Bookmark dạng Position hoặc Range dựa trên vùng chọn
       */
      setBookmark: (name: string, customId?: string) => ReturnType;
      /**
       * Gỡ bỏ Bookmark khỏi tài liệu
       */
      unsetBookmark: (bookmarkId: string) => ReturnType;
    };
  }
}

/**
 * BookmarkAnchorExtension - Node Inline Atom cho Position Bookmark (Caret-only)
 *
 * Đại diện cho điểm đánh dấu vị trí con trỏ trong ProseMirror AST:
 * - atom: true, inline: true (không cho phép gõ ký tự trực tiếp vào marker)
 * - Tự động di chuyển an toàn theo ProseMirror transactions (không persist numeric offset)
 * - Tương thích tuyệt đối với các node lân cận
 */
export const BookmarkAnchorExtension = Node.create<BookmarkExtensionOptions>({
  name: "bookmarkAnchor",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el) =>
          el.getAttribute("data-bookmark-id") || el.getAttribute("id") || "",
        renderHTML: (attrs) => ({
          "data-bookmark-id": attrs.id,
          id: attrs.id || undefined,
        }),
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-bookmark-name") || "",
        renderHTML: (attrs) => ({
          "data-bookmark-name": attrs.name,
        }),
      },
      createdAt: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-created-at") || "",
        renderHTML: (attrs) => ({
          "data-created-at": attrs.createdAt,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="bookmark-anchor"]',
      },
      {
        tag: "span.editor-bookmark-anchor",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "bookmark-anchor",
        "data-bookmark-id": node.attrs.id,
        "data-bookmark-name": node.attrs.name,
        class: "editor-bookmark-anchor",
        title: `Thẻ đánh dấu: ${node.attrs.name}`,
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "editor-bookmark-anchor";
      dom.setAttribute("data-type", "bookmark-anchor");
      dom.setAttribute("data-bookmark-id", node.attrs.id || "");
      dom.setAttribute("data-bookmark-name", node.attrs.name || "");
      dom.title = `Thẻ đánh dấu: ${node.attrs.name || "Không tên"}`;

      // Biểu tượng bookmark nhỏ tinh tế
      const icon = document.createElement("span");
      icon.className = "bookmark-indicator-icon";
      icon.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
      dom.appendChild(icon);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;
          dom.setAttribute("data-bookmark-id", updatedNode.attrs.id || "");
          dom.setAttribute("data-bookmark-name", updatedNode.attrs.name || "");
          dom.title = `Thẻ đánh dấu: ${updatedNode.attrs.name || "Không tên"}`;
          return true;
        },
      };
    };
  },
});

/**
 * BookmarkMarkExtension - Semantic Mark cho Range Bookmark (Selection-based)
 *
 * Đại diện cho vùng văn bản được gắn thẻ đánh dấu:
 * - excludes: "" (cho phép cùng tồn tại với TẤT CẢ các mark khác: bold, italic, link, comment, trackChange, citation)
 * - spanning: true (trải dài trên nhiều inline node)
 * - Tự động co giãn theo thay đổi nội dung (typing, deletion)
 */
export const BookmarkMarkExtension = Mark.create<BookmarkExtensionOptions>({
  name: "bookmark",
  excludes: "",
  spanning: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-bookmark-id") || "",
        renderHTML: (attrs) => ({
          "data-bookmark-id": attrs.id,
        }),
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-bookmark-name") || "",
        renderHTML: (attrs) => ({
          "data-bookmark-name": attrs.name,
        }),
      },
      createdAt: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-created-at") || "",
        renderHTML: (attrs) => ({
          "data-created-at": attrs.createdAt,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="bookmark-range"]',
      },
      {
        tag: "span.editor-bookmark-range",
      },
    ];
  },

  renderHTML({ HTMLAttributes, mark }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "bookmark-range",
        "data-bookmark-id": mark.attrs.id,
        "data-bookmark-name": mark.attrs.name,
        class: "editor-bookmark-range",
        title: `Thẻ đánh dấu: ${mark.attrs.name}`,
      }),
      0,
    ];
  },
});
