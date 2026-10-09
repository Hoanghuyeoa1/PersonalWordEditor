import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection, NodeSelection } from "@tiptap/pm/state";
import { buildDrawingWrapStyle } from "../docx/drawing/drawingWrapService.ts";
import type { DrawingPosition } from "../docx/drawing/drawingTypes.ts";

export const TEXTBOX_LIMITS = {
  MIN_WIDTH: 120,
  MAX_WIDTH: 800,
  DEFAULT_WIDTH: 320,
  MIN_HEIGHT: 40,
  MAX_HEIGHT: 600,
  DEFAULT_HEIGHT: 80,
} as const;

export type TextBoxAlignment = "left" | "center" | "right";

/**
 * Kiểm tra và chuẩn hóa kích thước Text Box.
 */
export function validateTextBoxDimensions(
  width: number = TEXTBOX_LIMITS.DEFAULT_WIDTH,
  height: number = TEXTBOX_LIMITS.DEFAULT_HEIGHT
): {
  isValid: boolean;
  error?: string;
  sanitizedWidth: number;
  sanitizedHeight: number;
} {
  if (
    typeof width !== "number" ||
    isNaN(width) ||
    typeof height !== "number" ||
    isNaN(height)
  ) {
    return {
      isValid: false,
      error: "Kích thước Hộp văn bản phải là số hợp lệ.",
      sanitizedWidth: TEXTBOX_LIMITS.DEFAULT_WIDTH,
      sanitizedHeight: TEXTBOX_LIMITS.DEFAULT_HEIGHT,
    };
  }

  const w = Math.round(width);
  const h = Math.round(height);

  if (w < TEXTBOX_LIMITS.MIN_WIDTH || h < TEXTBOX_LIMITS.MIN_HEIGHT) {
    return {
      isValid: false,
      error: `Kích thước tối thiểu là ${TEXTBOX_LIMITS.MIN_WIDTH}px rộng × ${TEXTBOX_LIMITS.MIN_HEIGHT}px cao.`,
      sanitizedWidth: Math.max(TEXTBOX_LIMITS.MIN_WIDTH, w),
      sanitizedHeight: Math.max(TEXTBOX_LIMITS.MIN_HEIGHT, h),
    };
  }

  if (w > TEXTBOX_LIMITS.MAX_WIDTH || h > TEXTBOX_LIMITS.MAX_HEIGHT) {
    return {
      isValid: false,
      error: `Kích thước tối đa là ${TEXTBOX_LIMITS.MAX_WIDTH}px rộng × ${TEXTBOX_LIMITS.MAX_HEIGHT}px cao.`,
      sanitizedWidth: Math.min(TEXTBOX_LIMITS.MAX_WIDTH, w),
      sanitizedHeight: Math.min(TEXTBOX_LIMITS.MAX_HEIGHT, h),
    };
  }

  return {
    isValid: true,
    sanitizedWidth: w,
    sanitizedHeight: h,
  };
}

/**
 * Tìm vị trí bắt đầu của node textBox trong document state
 * hỗ trợ cả NodeSelection lẫn TextSelection sâu bên trong các node con.
 */
function findTextBoxPos(state: any, nodeName: string): { pos: number; node: any } | null {
  if (state.selection instanceof NodeSelection && state.selection.node?.type?.name === nodeName) {
    return { pos: state.selection.from, node: state.selection.node };
  }
  const from = state.selection.$from;
  if (!from) return null;
  for (let d = from.depth; d > 0; d--) {
    const n = from.node(d);
    if (n.type.name === nodeName) {
      return { pos: from.before(d), node: n };
    }
  }
  return null;
}

export interface TextBoxOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textBox: {
      /**
       * Chèn một hộp văn bản (Text Box) semantic
       */
      insertTextBox: (options?: {
        width?: number;
        initialText?: string;
        alignment?: TextBoxAlignment;
      }) => ReturnType;
      /**
       * Xóa hộp văn bản hiện tại
       */
      deleteTextBox: () => ReturnType;
      /**
       * Thay đổi độ rộng hộp văn bản
       */
      setTextBoxWidth: (width: number) => ReturnType;
      /**
       * Thay đổi vị trí căn lề hộp văn bản (trái / giữa / phải)
       */
      setTextBoxAlignment: (alignment: TextBoxAlignment) => ReturnType;
      /**
       * Thay đổi màu nền hộp văn bản
       */
      setTextBoxBackgroundColor: (color: string | null) => ReturnType;
      /**
       * Thay đổi màu viền hộp văn bản
       */
      setTextBoxBorderColor: (color: string | null) => ReturnType;
      /**
       * Thiết lập hoặc xóa vị trí Floating DrawingPosition của hộp văn bản
       */
      setTextBoxDrawingPosition: (position: DrawingPosition | null) => ReturnType;
      /**
       * Chèn một hộp văn bản nổi (Floating Text Box)
       */
      insertFloatingTextBox: (options?: {
        width?: number;
        height?: number;
        initialText?: string;
        position?: Partial<DrawingPosition>;
      }) => ReturnType;
    };
  }
}

/**
 * TextBox Extension:
 * Semantic ProseMirror node cho Hộp văn bản (Text Box).
 * - Cấu trúc cây: textBox -> paragraph+ -> text
 * - Tái sử dụng trọn vẹn toàn bộ lệnh soạn thảo (Bold, Italic, Color, Font, Align, Lists)
 * - Định vị an toàn dạng block container trong Page Canvas
 * - Kích thước có thể tùy chỉnh với validation bảo vệ tài liệu
 */
export const TextBox = Node.create<TextBoxOptions>({
  name: "textBox",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "editor-text-box",
      },
    };
  },

  addAttributes() {
    return {
      width: {
        default: TEXTBOX_LIMITS.DEFAULT_WIDTH,
        parseHTML: (element) => {
          const w = element.getAttribute("data-width") || element.style.width;
          return w ? parseInt(w, 10) || TEXTBOX_LIMITS.DEFAULT_WIDTH : TEXTBOX_LIMITS.DEFAULT_WIDTH;
        },
        renderHTML: (attributes) => {
          const w = attributes.width || TEXTBOX_LIMITS.DEFAULT_WIDTH;
          return {
            "data-width": w,
            style: `width: ${w}px; max-width: 100%;`,
          };
        },
      },
      minHeight: {
        default: TEXTBOX_LIMITS.DEFAULT_HEIGHT,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-min-height") || String(TEXTBOX_LIMITS.DEFAULT_HEIGHT), 10) ||
          TEXTBOX_LIMITS.DEFAULT_HEIGHT,
        renderHTML: (attributes) => ({
          "data-min-height": attributes.minHeight || TEXTBOX_LIMITS.DEFAULT_HEIGHT,
          style: `min-height: ${attributes.minHeight || TEXTBOX_LIMITS.DEFAULT_HEIGHT}px;`,
        }),
      },
      alignment: {
        default: "left",
        parseHTML: (element) => element.getAttribute("data-alignment") || "left",
        renderHTML: (attributes) => {
          const align = attributes.alignment || "left";
          return {
            "data-alignment": align,
          };
        },
      },
      backgroundColor: {
        default: "#ffffff",
        parseHTML: (element) =>
          element.getAttribute("data-bg-color") || element.style.backgroundColor || "#ffffff",
        renderHTML: (attributes) => {
          const bg = attributes.backgroundColor || "#ffffff";
          return {
            "data-bg-color": bg,
            style: `background-color: ${bg};`,
          };
        },
      },
      borderColor: {
        default: "#cbd5e1",
        parseHTML: (element) =>
          element.getAttribute("data-border-color") || element.style.borderColor || "#cbd5e1",
        renderHTML: (attributes) => {
          const bc = attributes.borderColor || "#cbd5e1";
          return {
            "data-border-color": bc,
            style: `border-color: ${bc};`,
          };
        },
      },
      drawingPosition: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-drawing-position");
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {}
          }
          return null;
        },
        renderHTML: (attributes) => {
          if (!attributes.drawingPosition) return {};
          return { "data-drawing-position": JSON.stringify(attributes.drawingPosition) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-node-type="text-box"]',
      },
      {
        tag: "div.editor-text-box",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const alignment = HTMLAttributes.alignment || "left";
    const wrapStyle = buildDrawingWrapStyle(HTMLAttributes.drawingPosition, alignment);
    const wrapperClass = `editor-text-box textBox-${alignment}${wrapStyle.className ? ` ${wrapStyle.className}` : ""}`;

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-node-type": "text-box",
        class: wrapperClass,
        style: wrapStyle.style,
      }),
      0, // Khe cho nội dung con (child paragraphs)
    ];
  },

  addCommands() {
    return {
      insertTextBox:
        (options) =>
        ({ tr, dispatch, editor }) => {
          const width = options?.width || TEXTBOX_LIMITS.DEFAULT_WIDTH;
          const alignment = options?.alignment || "left";
          const initialText = options?.initialText || "Nhập văn bản vào hộp...";

          const paragraphNode = editor.schema.nodes.paragraph.create(
            null,
            editor.schema.text(initialText)
          );
          const textBoxNode = editor.schema.nodes.textBox.create(
            { width, alignment },
            paragraphNode
          );

          if (dispatch) {
            const offset = tr.selection.from + 1;
            tr.replaceSelectionWith(textBoxNode)
              .scrollIntoView()
              .setSelection(TextSelection.near(tr.doc.resolve(offset)));
          }
          return true;
        },
      deleteTextBox:
        () =>
        ({ tr, dispatch, state }) => {
          const target = findTextBoxPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.delete(target.pos, target.pos + target.node.nodeSize);
            }
            return true;
          }
          return false;
        },
      setTextBoxWidth:
        (width) =>
        ({ tr, dispatch, state }) => {
          const val = validateTextBoxDimensions(width);
          const target = findTextBoxPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                width: val.sanitizedWidth,
              });
            }
            return true;
          }
          return false;
        },
      setTextBoxAlignment:
        (alignment) =>
        ({ tr, dispatch, state }) => {
          const target = findTextBoxPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                alignment,
              });
            }
            return true;
          }
          return false;
        },
      setTextBoxBackgroundColor:
        (color) =>
        ({ tr, dispatch, state }) => {
          const target = findTextBoxPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                backgroundColor: color || "#ffffff",
              });
            }
            return true;
          }
          return false;
        },
      setTextBoxBorderColor:
        (color) =>
        ({ tr, dispatch, state }) => {
          const target = findTextBoxPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                borderColor: color || "#cbd5e1",
              });
            }
            return true;
          }
          return false;
        },
      setTextBoxDrawingPosition:
        (position) =>
        ({ tr, dispatch, state }) => {
          const target = findTextBoxPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                drawingPosition: position,
              });
            }
            return true;
          }
          return false;
        },
      insertFloatingTextBox:
        (options) =>
        ({ tr, dispatch, editor }) => {
          const width = options?.width || TEXTBOX_LIMITS.DEFAULT_WIDTH;
          const minHeight = options?.height || TEXTBOX_LIMITS.DEFAULT_HEIGHT;
          const initialText = options?.initialText || "Nhập văn bản vào hộp...";

          const floatingPos: DrawingPosition = {
            placement: "floating",
            width,
            height: minHeight,
            distT: 0,
            distB: 0,
            distL: 0,
            distR: 0,
            wrapMode: "square",
            horizontalRelative: "column",
            verticalRelative: "paragraph",
            offsetX: 0,
            offsetY: 0,
            ...options?.position,
          };

          const paragraphNode = editor.schema.nodes.paragraph.create(
            null,
            editor.schema.text(initialText)
          );
          const textBoxNode = editor.schema.nodes.textBox.create(
            {
              width,
              minHeight,
              alignment: "left",
              drawingPosition: floatingPos,
            },
            paragraphNode
          );

          if (dispatch) {
            const offset = tr.selection.from + 1;
            tr.replaceSelectionWith(textBoxNode)
              .scrollIntoView()
              .setSelection(TextSelection.near(tr.doc.resolve(offset)));
          }
          return true;
        },
    };
  },
});
