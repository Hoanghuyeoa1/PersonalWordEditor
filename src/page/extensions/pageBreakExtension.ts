import { Node, mergeAttributes } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

export interface PageBreakOptions {
  /**
   * Thuộc tính HTML tùy biến cho node ngắt trang
   * @default {}
   */
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /**
       * Chèn một semantic Page Break vào vị trí con trỏ hiện tại
       */
      setPageBreak: () => ReturnType;
      /**
       * Lệnh tương đương cho setPageBreak theo đặc tả Phase 2.5
       */
      insertPageBreak: () => ReturnType;
    };
  }
}

/**
 * Extension PageBreak cho Personal Word Editor (Phase 2.5):
 * - Semantic node block 'pageBreak', atom: true (không thể gõ text bên trong).
 * - Serialize vào AST JSON và deserialize trọn vẹn từ file .mwd.
 * - Không fake pagination, không dùng DOM height.
 * - Hiển thị trực quan qua marker phân cách: ──────── Page Break ────────
 * - Hỗ trợ phím tắt Mod-Enter (Ctrl+Enter trên Windows).
 */
export const PageBreak = Node.create<PageBreakOptions>({
  name: "pageBreak",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="page-break"]' },
      { tag: "div.page-break" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "page-break",
        class: "page-break",
        contenteditable: "false",
      }),
      ["div", { class: "page-break-line", "aria-hidden": "true" }],
      [
        "span",
        { class: "page-break-label", "aria-label": "Page Break" },
        "Page Break",
      ],
      ["div", { class: "page-break-line", "aria-hidden": "true" }],
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ state, dispatch, tr }) => {
          const pageBreakType = state.schema.nodes[this.name];
          if (!pageBreakType) return false;

          if (dispatch) {
            const { selection } = state;
            const { $from } = selection;

            // Xóa selection nếu đang bôi đen nhiều ký tự/khối
            if (!selection.empty) {
              tr.deleteSelection();
            }

            const pageBreakNode = pageBreakType.create();
            const paragraphType = state.schema.nodes.paragraph;

            // Trường hợp 1: Tài liệu hoàn toàn rỗng
            const isDocEmpty =
              state.doc.childCount === 1 &&
              state.doc.firstChild?.isTextblock &&
              state.doc.firstChild.content.size === 0;

            if (isDocEmpty && paragraphType) {
              // Trang 1 có 1 paragraph rỗng, ngắt trang, trang 2 có 1 paragraph rỗng
              tr.replaceWith(0, tr.doc.content.size, [
                paragraphType.create(),
                pageBreakNode,
                paragraphType.create(),
              ]);
              // Đặt con trỏ vào paragraph thứ 2
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
                // Ở đầu textblock: chèn paragraph rỗng và pageBreak phía trước
                const beforePos = $from.before();
                tr.insert(beforePos, [paragraphType.create(), pageBreakNode]);
                // Con trỏ giữ ở đầu textblock ban đầu (nay đã bị đẩy sau pageBreak)
                const afterBreakPos = Math.min(
                  beforePos + paragraphType.create().nodeSize + pageBreakNode.nodeSize + 1,
                  tr.doc.content.size
                );
                const sel = Selection.near(tr.doc.resolve(afterBreakPos));
                tr.setSelection(sel);
              } else if (parentOffset === parentSize && paragraphType) {
                // Ở cuối textblock
                const afterPos = $from.after();
                const isAtDocEnd = afterPos >= tr.doc.content.size;

                if (isAtDocEnd) {
                  // Thêm pageBreak và 1 paragraph mới sau nó để người dùng có thể gõ tiếp
                  tr.insert(afterPos, [pageBreakNode, paragraphType.create()]);
                  const newParaPos = Math.min(
                    afterPos + pageBreakNode.nodeSize + 1,
                    tr.doc.content.size
                  );
                  const sel = Selection.near(tr.doc.resolve(newParaPos));
                  tr.setSelection(sel);
                } else {
                  // Đã có block phía sau, chỉ cần chèn pageBreak
                  tr.insert(afterPos, pageBreakNode);
                  const nextPos = Math.min(
                    afterPos + pageBreakNode.nodeSize + 1,
                    tr.doc.content.size
                  );
                  const sel = Selection.near(tr.doc.resolve(nextPos));
                  tr.setSelection(sel);
                }
              } else {
                // Ở giữa textblock: tách textblock thành 2 phần và chèn pageBreak ở giữa
                tr.split($from.pos);
                const splitPos = $from.pos + 1;
                tr.insert(splitPos, pageBreakNode);
                const nextBlockPos = Math.min(
                  splitPos + pageBreakNode.nodeSize + 1,
                  tr.doc.content.size
                );
                const sel = Selection.near(tr.doc.resolve(nextBlockPos));
                tr.setSelection(sel);
              }
            } else {
              // Ngoài textblock (ví dụ NodeSelection hoặc cấu trúc khác)
              tr.replaceSelectionWith(pageBreakNode);
              const targetPos = Math.min(tr.selection.to, tr.doc.content.size);
              const sel = Selection.near(tr.doc.resolve(targetPos));
              tr.setSelection(sel);
            }

            tr.scrollIntoView();
          }

          return true;
        },

      insertPageBreak:
        () =>
        ({ commands }) => {
          return commands.setPageBreak();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => this.editor.commands.setPageBreak(),
    };
  },
});
