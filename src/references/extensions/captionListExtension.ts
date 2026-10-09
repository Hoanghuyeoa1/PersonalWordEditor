import { Node, mergeAttributes } from "@tiptap/core";
import type {
  CaptionListConfig,
  CaptionListEntry,
  CaptionListNodeAttrs,
  CaptionListPreset,
} from "../types/captionListTypes.ts";
import { CaptionListService } from "../services/captionListService.ts";
import { CaptionService } from "../services/captionService.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    captionList: {
      /**
       * Chèn một khối Danh mục Chú thích (Caption List / Table of Figures) semantic vào tài liệu
       */
      insertCaptionList: (config?: CaptionListConfig) => ReturnType;
      /**
       * Cập nhật khối Danh mục Chú thích hiện có trong tài liệu
       */
      updateCaptionList: (options?: {
        captionListId?: string;
        label?: string;
        updatePageNumbersOnly?: boolean;
      }) => ReturnType;
      /**
       * Xóa khối Danh mục Chú thích khỏi tài liệu
       */
      removeCaptionList: (captionListId?: string) => ReturnType;
    };
  }
}

export interface CaptionListOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * CaptionListExtension - Personal Word Editor (Phase 2 Architecture)
 *
 * Semantic Block Atom Node cho Danh mục Chú thích (Table of Figures / List of Captions):
 * - Block Atom Node độc lập trong ProseMirror AST (`atom: true`, `group: "block"`).
 * - Lưu trữ cấu hình: id, title, label, showPageNumbers, rightAlignPageNumbers, preset, entries, lastUpdated.
 * - Danh sách mục entries được phân giải động từ CaptionService hiện tại và đồng bộ qua transaction.
 * - Tuyệt đối không querySelector DOM, không lặp transaction trong render loop.
 * - An toàn khi không có caption (empty state) và khi caption bị xóa/hỏng target.
 */
export const CaptionListExtension = Node.create<CaptionListOptions>({
  name: "captionList",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  isolating: true,

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
          el.getAttribute("data-caption-list-id") || el.getAttribute("id") || "",
        renderHTML: (attrs) => ({
          "data-caption-list-id": attrs.id || "",
          id: attrs.id || undefined,
        }),
      },
      title: {
        default: "Danh mục hình ảnh",
        parseHTML: (el) => el.getAttribute("data-title") || "Danh mục hình ảnh",
        renderHTML: (attrs) => ({
          "data-title": attrs.title,
        }),
      },
      label: {
        default: "Figure",
        parseHTML: (el) => el.getAttribute("data-label") || "Figure",
        renderHTML: (attrs) => ({
          "data-label": attrs.label || "Figure",
        }),
      },
      showPageNumbers: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-pages") !== "false",
        renderHTML: (attrs) => ({
          "data-show-pages": String(attrs.showPageNumbers !== false),
        }),
      },
      rightAlignPageNumbers: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-right-align") !== "false",
        renderHTML: (attrs) => ({
          "data-right-align": String(attrs.rightAlignPageNumbers !== false),
        }),
      },
      preset: {
        default: "classic",
        parseHTML: (el) =>
          (el.getAttribute("data-preset") as CaptionListPreset) || "classic",
        renderHTML: (attrs) => ({
          "data-preset": attrs.preset || "classic",
        }),
      },
      entries: {
        default: [],
        parseHTML: (el) => {
          const raw = el.getAttribute("data-entries");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          "data-entries": JSON.stringify(attrs.entries || []),
        }),
      },
      lastUpdated: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-last-updated") || "",
        renderHTML: (attrs) => ({
          "data-last-updated": attrs.lastUpdated || "",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="caption-list"]',
      },
      {
        tag: "div.editor-caption-list-block",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as CaptionListNodeAttrs;
    const title = attrs.title || CaptionListService.getDefaultTitle(attrs.label || "Figure");
    const entries = (attrs.entries || []) as CaptionListEntry[];
    const showPages = attrs.showPageNumbers !== false;
    const preset = attrs.preset || "classic";
    const label = attrs.label || "Figure";

    const entryElements =
      entries.length === 0
        ? [
            [
              "div",
              { class: "caption-list-empty-notice" },
              `(Chưa có chú thích nào cho nhãn "${label}" trong tài liệu)`,
            ],
          ]
        : entries.map((entry) => {
            const children: any[] = [
              [
                "span",
                { class: "caption-list-entry-text" },
                entry.fullTitle || `${entry.labelAndNumber} — ${entry.text}`,
              ],
            ];
            if (showPages) {
              children.push(["span", { class: "caption-list-entry-leader" }]);
              children.push([
                "span",
                { class: "caption-list-entry-page" },
                String(entry.pageNumber ?? 1),
              ]);
            }
            return [
              "div",
              {
                class: "caption-list-entry",
                "data-caption-id": entry.captionId,
              },
              ...children,
            ];
          });

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "caption-list",
        "data-caption-list-id": attrs.id,
        "data-label": label,
        class: `editor-caption-list-block caption-list-preset-${preset}`,
      }),
      [
        "div",
        { class: "caption-list-header" },
        ["div", { class: "caption-list-title" }, title],
        ["div", { class: "caption-list-badge" }, `${label} (${entries.length})`],
      ],
      ["div", { class: "caption-list-entries-list" }, ...entryElements],
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      if (typeof document === "undefined") {
        return {
          dom: {} as HTMLElement,
          update: () => true,
        };
      }

      const dom = document.createElement("div");
      const attrs = node.attrs as CaptionListNodeAttrs;
      const preset = attrs.preset || "classic";
      const label = attrs.label || "Figure";
      dom.className = `editor-caption-list-block caption-list-preset-${preset}`;
      dom.setAttribute("data-type", "caption-list");
      dom.setAttribute("data-caption-list-id", attrs.id || "");
      dom.setAttribute("data-label", label);

      // Header
      const headerEl = document.createElement("div");
      headerEl.className = "caption-list-header";

      const titleEl = document.createElement("div");
      titleEl.className = "caption-list-title";
      titleEl.textContent = attrs.title || CaptionListService.getDefaultTitle(label);
      headerEl.appendChild(titleEl);

      const badgeEl = document.createElement("div");
      badgeEl.className = "caption-list-badge";
      const entries = (attrs.entries || []) as CaptionListEntry[];
      badgeEl.textContent = `${label} (${entries.length})`;

      const actionsEl = document.createElement("div");
      actionsEl.className = "caption-list-actions";

      const updateBtn = document.createElement("button");
      updateBtn.type = "button";
      updateBtn.className = "caption-list-update-btn";
      updateBtn.textContent = "Cập nhật (F9)";
      updateBtn.title = "Cập nhật danh mục này (F9)";
      updateBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        CaptionListService.updateCaptionList(editor, { captionListId: attrs.id });
      });

      actionsEl.appendChild(updateBtn);
      actionsEl.appendChild(badgeEl);
      headerEl.appendChild(actionsEl);

      dom.appendChild(headerEl);

      // Entries list
      const listEl = document.createElement("div");
      listEl.className = "caption-list-entries-list";

      const populateEntries = (currentAttrs: CaptionListNodeAttrs) => {
        listEl.innerHTML = "";
        const currentEntries = (currentAttrs.entries || []) as CaptionListEntry[];
        const currentLabel = currentAttrs.label || "Figure";

        if (currentEntries.length === 0) {
          const emptyEl = document.createElement("div");
          emptyEl.className = "caption-list-empty-notice";
          emptyEl.textContent = `(Chưa có chú thích nào cho nhãn "${currentLabel}" trong tài liệu)`;
          listEl.appendChild(emptyEl);
          return;
        }

        currentEntries.forEach((entry) => {
          const rowEl = document.createElement("div");
          rowEl.className = "caption-list-entry";
          rowEl.setAttribute("data-caption-id", entry.captionId);

          const textEl = document.createElement("span");
          textEl.className = "caption-list-entry-text";
          textEl.textContent =
            entry.fullTitle || (entry.text ? `${entry.labelAndNumber} — ${entry.text}` : entry.labelAndNumber);
          rowEl.appendChild(textEl);

          if (currentAttrs.showPageNumbers !== false) {
            const leaderEl = document.createElement("span");
            leaderEl.className = "caption-list-entry-leader";
            rowEl.appendChild(leaderEl);

            const pageEl = document.createElement("span");
            pageEl.className = "caption-list-entry-page";
            pageEl.textContent = String(entry.pageNumber ?? 1);
            rowEl.appendChild(pageEl);
          }

          // Điều hướng an toàn tới Caption khi click
          rowEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            CaptionService.navigateToCaption(editor, entry.captionId);
          });

          listEl.appendChild(rowEl);
        });
      };

      populateEntries(attrs);
      dom.appendChild(listEl);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;
          const nextAttrs = updatedNode.attrs as CaptionListNodeAttrs;
          titleEl.textContent = nextAttrs.title || CaptionListService.getDefaultTitle(nextAttrs.label || "Figure");
          badgeEl.textContent = `${nextAttrs.label || "Figure"} (${(nextAttrs.entries || []).length})`;
          dom.className = `editor-caption-list-block caption-list-preset-${nextAttrs.preset || "classic"}`;
          dom.setAttribute("data-caption-list-id", nextAttrs.id || "");
          dom.setAttribute("data-label", nextAttrs.label || "Figure");
          populateEntries(nextAttrs);
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertCaptionList:
        (config) =>
        ({ editor }) => {
          const res = CaptionListService.insertCaptionList(editor, config);
          return res.success;
        },
      updateCaptionList:
        (options) =>
        ({ editor }) => {
          const res = CaptionListService.updateCaptionList(editor, options);
          return res.success;
        },
      removeCaptionList:
        (captionListId) =>
        ({ editor }) => {
          const res = CaptionListService.removeCaptionList(editor, captionListId);
          return res.success;
        },
    };
  },
});
