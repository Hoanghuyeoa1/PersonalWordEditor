import { Node, mergeAttributes } from "@tiptap/core";
import type { TocConfig, TocEntry, TocNodeAttrs, TocPreset } from "../types/tocTypes.ts";
import { TocService } from "../services/tocService.ts";
import { HeadingService } from "../services/headingService.ts";
import { ReferenceUpdateService } from "../services/referenceUpdateService.ts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      /**
       * Chèn một khối Mục lục (Table of Contents) semantic vào tài liệu
       */
      insertTableOfContents: (config?: TocConfig) => ReturnType;
      /**
       * Cập nhật khối Mục lục hiện có (F9 / Update TOC)
       */
      updateTableOfContents: (options?: { updatePageNumbersOnly?: boolean }) => ReturnType;
      /**
       * Xóa khối Mục lục khỏi tài liệu
       */
      removeTableOfContents: () => ReturnType;
    };
  }
}

export interface TableOfContentsOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * TableOfContents Extension - Personal Word Editor (Phase 6.3)
 *
 * Semantic Block Atom Node cho Mục lục tài liệu:
 * - Không phải là một đoạn HTML snapshot tĩnh.
 * - Lưu trữ cấu hình: title, includedLevels, showPageNumbers, rightAlignPageNumbers, preset, entries, lastUpdated.
 * - Hoàn toàn không lưu vị trí tĩnh của Heading; vị trí được resolve lại khi cập nhật hoặc điều hướng.
 * - Ngăn chặn tuyệt đối hiện tượng đệ quy: tiêu đề TOC không phải là node heading, nên không tự chèn vào chính nó.
 * - Không cho phép lồng TOC con bên trong (atom: true, block).
 */
export const TableOfContentsExtension = Node.create<TableOfContentsOptions>({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      title: {
        default: "Mục lục",
        parseHTML: (el) => el.getAttribute("data-title") || "Mục lục",
        renderHTML: (attrs) => ({
          "data-title": attrs.title,
        }),
      },
      includedLevels: {
        default: [1, 2, 3],
        parseHTML: (el) => {
          const raw = el.getAttribute("data-levels");
          if (!raw) return [1, 2, 3];
          try {
            return JSON.parse(raw);
          } catch {
            return [1, 2, 3];
          }
        },
        renderHTML: (attrs) => ({
          "data-levels": JSON.stringify(attrs.includedLevels || [1, 2, 3]),
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
        parseHTML: (el) => (el.getAttribute("data-preset") as TocPreset) || "classic",
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
        tag: 'div[data-type="table-of-contents"]',
      },
      {
        tag: "div.editor-toc-block",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as TocNodeAttrs;
    const title = attrs.title || "Mục lục";
    const entries = (attrs.entries || []) as TocEntry[];
    const showPages = attrs.showPageNumbers !== false;
    const preset = attrs.preset || "classic";

    const entryElements =
      entries.length === 0
        ? [
            [
              "div",
              { class: "toc-empty-notice" },
              "(Tài liệu chưa có tiêu đề để hiển thị trong mục lục)",
            ],
          ]
        : entries.map((entry) => {
            const levelClass = `toc-level-${entry.level}`;
            const children: any[] = [
              ["span", { class: "toc-entry-text" }, entry.text],
            ];
            if (showPages) {
              children.push(["span", { class: "toc-entry-leader" }]);
              children.push([
                "span",
                { class: "toc-entry-page" },
                String(entry.pageNumber ?? 1),
              ]);
            }
            return [
              "div",
              {
                class: `toc-entry ${levelClass}`,
                "data-heading-id": entry.headingId,
              },
              ...children,
            ];
          });

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "table-of-contents",
        class: `editor-toc-block toc-preset-${preset}`,
      }),
      [
        "div",
        { class: "toc-header" },
        ["div", { class: "toc-title" }, title],
        ["div", { class: "toc-badge" }, `TOC (${entries.length})`],
      ],
      ["div", { class: "toc-entries-list" }, ...entryElements],
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      if (typeof document === "undefined") {
        return {
          dom: {} as HTMLElement,
        };
      }

      const dom = document.createElement("div");
      const attrs = node.attrs as TocNodeAttrs;
      const preset = attrs.preset || "classic";
      dom.className = `editor-toc-block toc-preset-${preset}`;
      dom.setAttribute("data-type", "table-of-contents");

      // Header
      const headerEl = document.createElement("div");
      headerEl.className = "toc-header";

      const titleEl = document.createElement("div");
      titleEl.className = "toc-title";
      titleEl.textContent = attrs.title || "Mục lục";

      const actionsEl = document.createElement("div");
      actionsEl.className = "toc-actions";

      const updateBtn = document.createElement("button");
      updateBtn.className = "toc-action-btn toc-update-btn";
      updateBtn.title = "Cập nhật mục lục (F9)";
      updateBtn.textContent = "↻ Cập nhật";
      updateBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        TocService.updateToc(editor);
      });

      actionsEl.appendChild(updateBtn);
      headerEl.appendChild(titleEl);
      headerEl.appendChild(actionsEl);
      dom.appendChild(headerEl);

      // Entries list
      const listEl = document.createElement("div");
      listEl.className = "toc-entries-list";

      const entries = (attrs.entries || []) as TocEntry[];
      if (entries.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "toc-empty-notice";
        emptyEl.textContent =
          "(Tài liệu chưa có tiêu đề để hiển thị trong mục lục. Thêm Heading 1-3 và nhấn Cập nhật).";
        listEl.appendChild(emptyEl);
      } else {
        entries.forEach((entry) => {
          const rowEl = document.createElement("div");
          rowEl.className = `toc-entry toc-level-${entry.level}`;
          rowEl.setAttribute("data-heading-id", entry.headingId);

          const textEl = document.createElement("span");
          textEl.className = "toc-entry-text";
          textEl.textContent = entry.text;

          rowEl.appendChild(textEl);

          if (attrs.showPageNumbers !== false) {
            const leaderEl = document.createElement("span");
            leaderEl.className = "toc-entry-leader";
            rowEl.appendChild(leaderEl);

            const pageEl = document.createElement("span");
            pageEl.className = "toc-entry-page";
            pageEl.textContent = String(entry.pageNumber ?? 1);
            rowEl.appendChild(pageEl);
          }

          // Click để điều hướng tới Heading
          rowEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            HeadingService.navigateToHeading(editor, entry.headingId);
          });

          listEl.appendChild(rowEl);
        });
      }

      dom.appendChild(listEl);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;
          // Re-render khi attributes thay đổi
          const nextAttrs = updatedNode.attrs as TocNodeAttrs;
          titleEl.textContent = nextAttrs.title || "Mục lục";
          dom.className = `editor-toc-block toc-preset-${nextAttrs.preset || "classic"}`;

          // Re-populate entries
          listEl.innerHTML = "";
          const nextEntries = (nextAttrs.entries || []) as TocEntry[];
          if (nextEntries.length === 0) {
            const emptyEl = document.createElement("div");
            emptyEl.className = "toc-empty-notice";
            emptyEl.textContent =
              "(Tài liệu chưa có tiêu đề để hiển thị trong mục lục. Thêm Heading 1-3 và nhấn Cập nhật).";
            listEl.appendChild(emptyEl);
          } else {
            nextEntries.forEach((entry) => {
              const rowEl = document.createElement("div");
              rowEl.className = `toc-entry toc-level-${entry.level}`;
              rowEl.setAttribute("data-heading-id", entry.headingId);

              const textEl = document.createElement("span");
              textEl.className = "toc-entry-text";
              textEl.textContent = entry.text;
              rowEl.appendChild(textEl);

              if (nextAttrs.showPageNumbers !== false) {
                const leaderEl = document.createElement("span");
                leaderEl.className = "toc-entry-leader";
                rowEl.appendChild(leaderEl);

                const pageEl = document.createElement("span");
                pageEl.className = "toc-entry-page";
                pageEl.textContent = String(entry.pageNumber ?? 1);
                rowEl.appendChild(pageEl);
              }

              rowEl.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                HeadingService.navigateToHeading(editor, entry.headingId);
              });

              listEl.appendChild(rowEl);
            });
          }
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertTableOfContents:
        (config) =>
        ({ editor }) => {
          const res = TocService.insertToc(editor, config);
          return res.success;
        },
      updateTableOfContents:
        (options) =>
        ({ editor }) => {
          const res = TocService.updateToc(editor, options);
          return res.success;
        },
      removeTableOfContents:
        () =>
        ({ editor }) => {
          const res = TocService.removeToc(editor);
          return res.success;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // F9: Cập nhật trường tham chiếu (TOC, Caption List, Bibliography) giống chuẩn Microsoft Word
      F9: ({ editor }) => {
        return ReferenceUpdateService.executeF9Update(editor);
      },
    };
  },
});
