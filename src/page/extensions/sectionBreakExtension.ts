import { Node, mergeAttributes } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import type { PageSettings } from "../types/pageTypes.ts";
import type { SectionBreakType } from "../types/sectionTypes.ts";

export interface SectionBreakOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sectionBreak: {
      /**
       * Chèn một Section Break (Next Page) vào vị trí con trỏ hiện tại
       */
      setSectionBreak: (options?: {
        sectionType?: SectionBreakType;
        pageSettings?: PageSettings;
        headerFooter?: import("../types/headerFooterTypes.ts").SectionHeaderFooter;
      }) => ReturnType;
      /**
       * Alias thuận tiện tương đương setSectionBreak
       */
      insertSectionBreak: (options?: {
        sectionType?: SectionBreakType;
        pageSettings?: PageSettings;
        headerFooter?: import("../types/headerFooterTypes.ts").SectionHeaderFooter;
      }) => ReturnType;
    };
  }
}


/**
 * Extension SectionBreak cho Personal Word Editor (Phase 2.7):
 * - Semantic node block 'sectionBreak', atom: true (không thể gõ text bên trong).
 * - Lưu trữ sectionType ("nextPage") và pageSettings riêng cho section tiếp theo.
 * - Serialize vào AST JSON và deserialize trọn vẹn từ file .mwd.
 * - Hiển thị trực quan qua marker phân cách: ═══ SECTION BREAK (NEXT PAGE) ═══
 */
export const SectionBreak = Node.create<SectionBreakOptions>({
  name: "sectionBreak",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sectionType: {
        default: "nextPage",
        parseHTML: (element) =>
          element.getAttribute("data-section-type") || "nextPage",
        renderHTML: (attributes) => ({
          "data-section-type": attributes.sectionType,
        }),
      },
      sectionId: {
        default: () => "sec-" + Math.random().toString(36).substring(2, 9),
        parseHTML: (element) => element.getAttribute("data-section-id") || "",
        renderHTML: (attributes) => ({
          "data-section-id": attributes.sectionId,
        }),
      },
      pageSettings: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-page-settings");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          if (!attributes.pageSettings) return {};
          return {
            "data-page-settings": JSON.stringify(attributes.pageSettings),
          };
        },
      },
      headerFooter: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-header-footer");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          if (!attributes.headerFooter) return {};
          return {
            "data-header-footer": JSON.stringify(attributes.headerFooter),
          };
        },
      },
    };
  },


  parseHTML() {
    return [
      { tag: 'div[data-type="section-break"]' },
      { tag: "div.section-break" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "section-break",
        class: "section-break page-break",
        contenteditable: "false",
      }),
      ["div", { class: "section-break-line", "aria-hidden": "true" }],
      [
        "span",
        { class: "section-break-label", "aria-label": "Section Break (Next Page)" },
        "Section Break (Next Page)",
      ],
      ["div", { class: "section-break-line", "aria-hidden": "true" }],
    ];
  },

  addCommands() {
    return {
      setSectionBreak:
        (options = {}) =>
        ({ state, dispatch, tr }) => {
          const sectionBreakType = state.schema.nodes[this.name];
          if (!sectionBreakType) return false;

          if (dispatch) {
            const { selection } = state;
            const { $from } = selection;

            // Xóa selection nếu đang bôi đen nhiều ký tự/khối
            if (!selection.empty) {
              tr.deleteSelection();
            }

            const sectionBreakNode = sectionBreakType.create({
              sectionType: options.sectionType || "nextPage",
              sectionId: "sec-" + Math.random().toString(36).substring(2, 9),
              pageSettings: options.pageSettings || null,
              headerFooter: options.headerFooter || null,
            });

            const paragraphType = state.schema.nodes.paragraph;

            // Trường hợp 1: Tài liệu hoàn toàn rỗng
            const isDocEmpty =
              state.doc.childCount === 1 &&
              state.doc.firstChild?.isTextblock &&
              state.doc.firstChild.content.size === 0;

            if (isDocEmpty && paragraphType) {
              tr.replaceWith(0, tr.doc.content.size, [
                paragraphType.create(),
                sectionBreakNode,
                paragraphType.create(),
              ]);
              const safePos = Math.min(4, tr.doc.content.size);
              const sel = Selection.near(tr.doc.resolve(safePos));
              tr.setSelection(sel);
              tr.scrollIntoView();
              return true;
            }

            // Trường hợp 2: Con trỏ đang nằm trong một textblock (paragraph hoặc heading)
            const isTextblock = $from.parent.isTextblock;

            if (isTextblock) {
              const parentOffset = $from.parentOffset;
              const parentSize = $from.parent.content.size;

              if (parentOffset === 0 && paragraphType) {
                // Ở đầu textblock
                const beforePos = $from.before();
                tr.insert(beforePos, [paragraphType.create(), sectionBreakNode]);
                const afterBreakPos = Math.min(
                  beforePos + paragraphType.create().nodeSize + sectionBreakNode.nodeSize + 1,
                  tr.doc.content.size
                );
                const sel = Selection.near(tr.doc.resolve(afterBreakPos));
                tr.setSelection(sel);
              } else if (parentOffset === parentSize && paragraphType) {
                // Ở cuối textblock
                const afterPos = $from.after();
                const isAtDocEnd = afterPos >= tr.doc.content.size;

                if (isAtDocEnd) {
                  tr.insert(afterPos, [sectionBreakNode, paragraphType.create()]);
                  const newParaPos = Math.min(
                    afterPos + sectionBreakNode.nodeSize + 1,
                    tr.doc.content.size
                  );
                  const sel = Selection.near(tr.doc.resolve(newParaPos));
                  tr.setSelection(sel);
                } else {
                  tr.insert(afterPos, sectionBreakNode);
                  const nextPos = Math.min(
                    afterPos + sectionBreakNode.nodeSize + 1,
                    tr.doc.content.size
                  );
                  const sel = Selection.near(tr.doc.resolve(nextPos));
                  tr.setSelection(sel);
                }
              } else {
                // Ở giữa textblock
                tr.split($from.pos);
                const splitPos = $from.pos + 1;
                tr.insert(splitPos, sectionBreakNode);
                const nextBlockPos = Math.min(
                  splitPos + sectionBreakNode.nodeSize + 1,
                  tr.doc.content.size
                );
                const sel = Selection.near(tr.doc.resolve(nextBlockPos));
                tr.setSelection(sel);
              }
            } else {
              // Ngoài textblock
              tr.replaceSelectionWith(sectionBreakNode);
              const targetPos = Math.min(tr.selection.to, tr.doc.content.size);
              const sel = Selection.near(tr.doc.resolve(targetPos));
              tr.setSelection(sel);
            }

            tr.scrollIntoView();
          }

          return true;
        },

      insertSectionBreak:
        (options) =>
        ({ commands }) => {
          return commands.setSectionBreak(options);
        },
    };
  },
});
