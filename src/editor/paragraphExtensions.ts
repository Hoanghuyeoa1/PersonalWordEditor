import { Extension } from "@tiptap/core";

export interface LineSpacingOptions {
  types: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineSpacing: {
      /** Thiết lập độ giãn dòng cho đoạn văn hoặc tiêu đề */
      setLineSpacing: (lineSpacing: string) => ReturnType;
      /** Khôi phục độ giãn dòng mặc định */
      unsetLineSpacing: () => ReturnType;
    };
    indent: {
      /** Tăng thụt lề (trong list lồng cấp, ngoài list tăng indent level) */
      indent: () => ReturnType;
      /** Giảm thụt lề */
      outdent: () => ReturnType;
    };
    paragraphStyle: {
      /** Gán styleId ngữ nghĩa cho đoạn văn hoặc tiêu đề */
      setParagraphStyle: (styleId: string) => ReturnType;
      /** Xóa styleId (khôi phục Normal) */
      unsetParagraphStyle: () => ReturnType;
    };
    paragraphSpacing: {
      /** Thiết lập khoảng cách trước và sau đoạn văn (pt) */
      setParagraphSpacing: (spacing: {
        spacingBefore?: number | null;
        spacingAfter?: number | null;
      }) => ReturnType;
    };
    paragraphIndents: {
      /** Thiết lập mức thụt lề chi tiết (pt) */
      setParagraphIndents: (indents: {
        leftIndent?: number | null;
        rightIndent?: number | null;
        firstLineIndent?: number | null;
        hangingIndent?: number | null;
      }) => ReturnType;
    };
    paragraphPagination: {
      /** Thiết lập quy tắc phân trang đoạn văn */
      setParagraphPagination: (pagination: {
        keepWithNext?: boolean | null;
        keepLinesTogether?: boolean | null;
        pageBreakBefore?: boolean | null;
        widowControl?: boolean | null;
      }) => ReturnType;
    };
  }
}

/**
 * Extension quản lý thuộc tính độ giãn dòng (Line Spacing) trên node paragraph và heading.
 * Giá trị được lưu trực tiếp vào AST JSON của tài liệu để phục vụ render và export DOCX sau này.
 */
export const LineSpacing = Extension.create<LineSpacingOptions>({
  name: "lineSpacing",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineSpacing) return {};
              return {
                style: `line-height: ${attributes.lineSpacing}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (lineSpacing: string) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                lineSpacing,
              });
              changed = true;
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },
      unsetLineSpacing:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                lineSpacing: null,
              });
              changed = true;
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },
    };
  },
});

export interface IndentOptions {
  types: string[];
  minLevel: number;
  maxLevel: number;
}

/**
 * Extension quản lý thụt lề (Increase / Decrease Indent).
 * - Nếu đang ở trong ListItem: gọi sinkListItem / liftListItem để lồng cấp danh sách ProseMirror thật.
 * - Nếu ở paragraph / heading thông thường: tăng giảm thuộc tính indent (0 - 8).
 */
export const Indent = Extension.create<IndentOptions>({
  name: "indent",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
      minLevel: 0,
      maxLevel: 8,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const attr = element.getAttribute("data-indent");
              return attr ? parseInt(attr, 10) : 0;
            },
            renderHTML: (attributes) => {
              const level = attributes.indent;
              if (!level || level <= 0) return {};
              return {
                "data-indent": level,
                style: `margin-left: ${level * 2}rem`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch, commands }) => {
          // Ưu tiên lồng cấp danh sách nếu đang trong list
          if (commands.sinkListItem("listItem")) {
            return true;
          }

          // Nếu đang ở trong listItem mà không thể sink (như item đầu), không làm thụt paragraph bên trong
          let isInsideListItem = false;
          for (let d = state.selection.$from.depth; d > 0; d--) {
            if (state.selection.$from.node(d).type.name === "listItem") {
              isInsideListItem = true;
              break;
            }
          }
          if (isInsideListItem) {
            return false;
          }

          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const current = (node.attrs.indent as number) || 0;
              if (current < this.options.maxLevel) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: current + 1,
                });
                changed = true;
              }
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },

      outdent:
        () =>
        ({ tr, state, dispatch, commands }) => {
          // Ưu tiên nhấc cấp danh sách nếu đang trong list
          if (commands.liftListItem("listItem")) {
            return true;
          }

          let isInsideListItem = false;
          for (let d = state.selection.$from.depth; d > 0; d--) {
            if (state.selection.$from.node(d).type.name === "listItem") {
              isInsideListItem = true;
              break;
            }
          }
          if (isInsideListItem) {
            return false;
          }

          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const current = (node.attrs.indent as number) || 0;
              if (current > this.options.minLevel) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: current - 1,
                });
                changed = true;
              }
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },
    };
  },
});

export interface ParagraphStyleExtensionOptions {
  types: string[];
}

/**
 * Extension quản lý thuộc tính Style ngữ nghĩa và khoảng cách/thụt lề chi tiết trên node paragraph và heading.
 *
 * Thuộc tính lưu trữ trong AST JSON:
 * - styleId: ID kiểu dáng tham chiếu (không copy duplicate properties vào node)
 * - spacingBefore: khoảng cách trước đoạn (pt)
 * - spacingAfter: khoảng cách sau đoạn (pt)
 * - leftIndent: thụt lề trái (pt)
 * - rightIndent: thụt lề phải (pt)
 * - firstLineIndent: thụt lề dòng đầu (pt)
 * - hangingIndent: nhô lề dòng đầu (pt)
 */
export const ParagraphStyleExtension = Extension.create<ParagraphStyleExtensionOptions>({
  name: "paragraphStyle",

  addOptions() {
    return {
      types: ["paragraph", "heading"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          styleId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-style-id") || null,
            renderHTML: (attributes) => {
              if (!attributes.styleId) return {};
              return {
                "data-style-id": attributes.styleId,
                class: `word-style-${attributes.styleId}`,
              };
            },
          },
          spacingBefore: {
            default: null,
            parseHTML: (element) => {
              const attr = element.getAttribute("data-spacing-before");
              if (attr) return parseFloat(attr);
              return null;
            },
            renderHTML: (attributes) => {
              if (attributes.spacingBefore === null || attributes.spacingBefore === undefined) return {};
              return {
                "data-spacing-before": attributes.spacingBefore,
                style: `margin-top: ${attributes.spacingBefore}pt`,
              };
            },
          },
          spacingAfter: {
            default: null,
            parseHTML: (element) => {
              const attr = element.getAttribute("data-spacing-after");
              if (attr) return parseFloat(attr);
              return null;
            },
            renderHTML: (attributes) => {
              if (attributes.spacingAfter === null || attributes.spacingAfter === undefined) return {};
              return {
                "data-spacing-after": attributes.spacingAfter,
                style: `margin-bottom: ${attributes.spacingAfter}pt`,
              };
            },
          },
          leftIndent: {
            default: null,
            parseHTML: (element) => {
              const attr = element.getAttribute("data-left-indent");
              if (attr) return parseFloat(attr);
              return null;
            },
            renderHTML: (attributes) => {
              if (attributes.leftIndent === null || attributes.leftIndent === undefined) return {};
              return {
                "data-left-indent": attributes.leftIndent,
                style: `margin-left: ${attributes.leftIndent}pt`,
              };
            },
          },
          rightIndent: {
            default: null,
            parseHTML: (element) => {
              const attr = element.getAttribute("data-right-indent");
              if (attr) return parseFloat(attr);
              return null;
            },
            renderHTML: (attributes) => {
              if (attributes.rightIndent === null || attributes.rightIndent === undefined) return {};
              return {
                "data-right-indent": attributes.rightIndent,
                style: `margin-right: ${attributes.rightIndent}pt`,
              };
            },
          },
          firstLineIndent: {
            default: null,
            parseHTML: (element) => {
              const attr = element.getAttribute("data-first-line-indent");
              if (attr) return parseFloat(attr);
              return null;
            },
            renderHTML: (attributes) => {
              if (attributes.firstLineIndent === null || attributes.firstLineIndent === undefined) return {};
              return {
                "data-first-line-indent": attributes.firstLineIndent,
                style: `text-indent: ${attributes.firstLineIndent}pt`,
              };
            },
          },
          hangingIndent: {
            default: null,
            parseHTML: (element) => {
              const attr = element.getAttribute("data-hanging-indent");
              if (attr) return parseFloat(attr);
              return null;
            },
            renderHTML: (attributes) => {
              if (attributes.hangingIndent === null || attributes.hangingIndent === undefined) return {};
              return {
                "data-hanging-indent": attributes.hangingIndent,
                style: `text-indent: -${attributes.hangingIndent}pt; padding-left: ${attributes.hangingIndent}pt`,
              };
            },
          },
          keepWithNext: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-keep-with-next") === "true",
            renderHTML: (attributes) => {
              if (attributes.keepWithNext === null || attributes.keepWithNext === undefined) return {};
              return { "data-keep-with-next": String(attributes.keepWithNext) };
            },
          },
          keepLinesTogether: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-keep-lines-together") === "true",
            renderHTML: (attributes) => {
              if (attributes.keepLinesTogether === null || attributes.keepLinesTogether === undefined) return {};
              return { "data-keep-lines-together": String(attributes.keepLinesTogether) };
            },
          },
          pageBreakBefore: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-page-break-before") === "true",
            renderHTML: (attributes) => {
              if (attributes.pageBreakBefore === null || attributes.pageBreakBefore === undefined) return {};
              return { "data-page-break-before": String(attributes.pageBreakBefore) };
            },
          },
          widowControl: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-widow-control") !== "false",
            renderHTML: (attributes) => {
              if (attributes.widowControl === null || attributes.widowControl === undefined) return {};
              return { "data-widow-control": String(attributes.widowControl) };
            },
          },
          nodeId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-node-id") || null,
            renderHTML: (attributes) => {
              if (!attributes.nodeId) return {};
              return { "data-node-id": attributes.nodeId };
            },
          },
          formatRevisions: {
            default: null,
            parseHTML: (element) => {
              const raw = element.getAttribute("data-format-revisions");
              if (!raw) return null;
              try {
                return JSON.parse(raw);
              } catch {
                return null;
              }
            },
            renderHTML: (attributes) => {
              if (!attributes.formatRevisions) return {};
              const val =
                typeof attributes.formatRevisions === "string"
                  ? attributes.formatRevisions
                  : JSON.stringify(attributes.formatRevisions);
              return { "data-format-revisions": val };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphStyle:
        (styleId: string) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                styleId,
              });
              changed = true;
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },

      unsetParagraphStyle:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                styleId: null,
              });
              changed = true;
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },

      setParagraphSpacing:
        (spacing: { spacingBefore?: number | null; spacingAfter?: number | null }) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const newAttrs = { ...node.attrs };
              if (spacing.spacingBefore !== undefined) newAttrs.spacingBefore = spacing.spacingBefore;
              if (spacing.spacingAfter !== undefined) newAttrs.spacingAfter = spacing.spacingAfter;
              tr.setNodeMarkup(pos, undefined, newAttrs);
              changed = true;
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },

      setParagraphIndents:
        (indents: {
          leftIndent?: number | null;
          rightIndent?: number | null;
          firstLineIndent?: number | null;
          hangingIndent?: number | null;
        }) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const newAttrs = { ...node.attrs };
              if (indents.leftIndent !== undefined) newAttrs.leftIndent = indents.leftIndent;
              if (indents.rightIndent !== undefined) newAttrs.rightIndent = indents.rightIndent;
              if (indents.firstLineIndent !== undefined) newAttrs.firstLineIndent = indents.firstLineIndent;
              if (indents.hangingIndent !== undefined) newAttrs.hangingIndent = indents.hangingIndent;
              tr.setNodeMarkup(pos, undefined, newAttrs);
              changed = true;
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },

      setParagraphPagination:
        (pagination: {
          keepWithNext?: boolean | null;
          keepLinesTogether?: boolean | null;
          pageBreakBefore?: boolean | null;
          widowControl?: boolean | null;
        }) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          let changed = false;
          tr.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (this.options.types.includes(node.type.name)) {
              const newAttrs = { ...node.attrs };
              if (pagination.keepWithNext !== undefined) newAttrs.keepWithNext = pagination.keepWithNext;
              if (pagination.keepLinesTogether !== undefined) newAttrs.keepLinesTogether = pagination.keepLinesTogether;
              if (pagination.pageBreakBefore !== undefined) newAttrs.pageBreakBefore = pagination.pageBreakBefore;
              if (pagination.widowControl !== undefined) newAttrs.widowControl = pagination.widowControl;
              tr.setNodeMarkup(pos, undefined, newAttrs);
              changed = true;
            }
          });
          if (changed && dispatch) {
            dispatch(tr);
          }
          return changed;
        },
    };
  },
});

