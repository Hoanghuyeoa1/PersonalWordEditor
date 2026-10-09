import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { buildDrawingWrapStyle } from "../docx/drawing/drawingWrapService.ts";

export type ImageAlignment = "left" | "center" | "right";

export const IMAGE_LIMITS = {
  MIN_WIDTH: 30,
  MAX_WIDTH: 800,
  DEFAULT_WIDTH: 400,
  MIN_HEIGHT: 30,
  MAX_HEIGHT: 800,
  DEFAULT_HEIGHT: 260,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
} as const;

export interface ImageAttributes {
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  alignment: ImageAlignment;
}

/**
 * Kiểm tra và chuẩn hóa kích thước hình ảnh an toàn
 */
export function validateImageDimensions(
  width: number = IMAGE_LIMITS.DEFAULT_WIDTH,
  height: number = IMAGE_LIMITS.DEFAULT_HEIGHT
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
      error: "Kích thước hình ảnh phải là số hợp lệ.",
      sanitizedWidth: IMAGE_LIMITS.DEFAULT_WIDTH,
      sanitizedHeight: IMAGE_LIMITS.DEFAULT_HEIGHT,
    };
  }

  const w = Math.round(width);
  const h = Math.round(height);
  const clampedW = Math.min(IMAGE_LIMITS.MAX_WIDTH, Math.max(IMAGE_LIMITS.MIN_WIDTH, w));
  const clampedH = Math.min(IMAGE_LIMITS.MAX_HEIGHT, Math.max(IMAGE_LIMITS.MIN_HEIGHT, h));

  if (w < IMAGE_LIMITS.MIN_WIDTH || h < IMAGE_LIMITS.MIN_HEIGHT) {
    return {
      isValid: false,
      error: `Kích thước tối thiểu là ${IMAGE_LIMITS.MIN_WIDTH}px × ${IMAGE_LIMITS.MIN_HEIGHT}px.`,
      sanitizedWidth: clampedW,
      sanitizedHeight: clampedH,
    };
  }

  if (w > IMAGE_LIMITS.MAX_WIDTH || h > IMAGE_LIMITS.MAX_HEIGHT) {
    return {
      isValid: false,
      error: `Kích thước tối đa là ${IMAGE_LIMITS.MAX_WIDTH}px × ${IMAGE_LIMITS.MAX_HEIGHT}px.`,
      sanitizedWidth: clampedW,
      sanitizedHeight: clampedH,
    };
  }

  return {
    isValid: true,
    sanitizedWidth: w,
    sanitizedHeight: h,
  };
}

/**
 * Tìm vị trí node Image trong ProseMirror document
 */
function findImagePos(state: any, nodeName: string): { pos: number; node: any } | null {
  if (state.selection instanceof NodeSelection && state.selection.node?.type?.name === nodeName) {
    return { pos: state.selection.from, node: state.selection.node };
  }
  const from = state.selection.$from;
  if (!from) return null;
  for (let d = from.depth; d >= 0; d--) {
    const n = from.node(d);
    if (n && n.type.name === nodeName) {
      return { pos: from.before(d), node: n };
    }
  }
  if (from.nodeBefore && from.nodeBefore.type.name === nodeName) {
    return { pos: from.pos - from.nodeBefore.nodeSize, node: from.nodeBefore };
  }
  if (from.nodeAfter && from.nodeAfter.type.name === nodeName) {
    return { pos: from.pos, node: from.nodeAfter };
  }
  return null;
}

export interface ImageOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    image: {
      /**
       * Chèn một hình ảnh (Image) semantic vào tài liệu
       */
      insertImage: (options: {
        src: string;
        alt?: string;
        title?: string;
        width?: number;
        height?: number;
        alignment?: ImageAlignment;
      }) => ReturnType;
      /**
       * Xóa hình ảnh hiện tại
       */
      deleteImage: () => ReturnType;
      /**
       * Cập nhật kích thước hình ảnh
       */
      setImageDimensions: (width: number, height: number) => ReturnType;
      /**
       * Căn lề hình ảnh (trái, giữa, phải)
       */
      setImageAlignment: (alignment: ImageAlignment) => ReturnType;
      /**
       * Cập nhật văn bản thay thế (alt text)
       */
      setImageAlt: (alt: string) => ReturnType;
    };
  }
}

/**
 * Image Extension:
 * Semantic ProseMirror atom node cho Hình ảnh (Phase 3.5 & 3.6).
 * - Biểu diễn: image atom block node chứa src (Base64 data URL hoặc link web), alt, title, width, height, alignment
 * - Lưu trữ: Lưu trữ trực tiếp thuộc tính vào document model .mwd
 * - Khả năng tương thích: Tự động co giãn theo khổ trang giấy (max-width: 100%)
 */
export const CustomImage = Node.create<ImageOptions>({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "editor-image-wrapper",
      },
    };
  },

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => {
          const img = element.querySelector("img") || element;
          return img.getAttribute("src") || "";
        },
        renderHTML: (attributes) => ({
          src: attributes.src || "",
        }),
      },
      alt: {
        default: "",
        parseHTML: (element) => {
          const img = element.querySelector("img") || element;
          return img.getAttribute("alt") || "";
        },
        renderHTML: (attributes) => ({
          alt: attributes.alt || "",
        }),
      },
      title: {
        default: "",
        parseHTML: (element) => {
          const img = element.querySelector("img") || element;
          return img.getAttribute("title") || "";
        },
        renderHTML: (attributes) => ({
          title: attributes.title || "",
        }),
      },
      width: {
        default: IMAGE_LIMITS.DEFAULT_WIDTH,
        parseHTML: (element) => {
          const w =
            element.getAttribute("data-width") ||
            element.querySelector("img")?.getAttribute("width") ||
            String(IMAGE_LIMITS.DEFAULT_WIDTH);
          return parseInt(w, 10) || IMAGE_LIMITS.DEFAULT_WIDTH;
        },
        renderHTML: (attributes) => ({
          "data-width": attributes.width || IMAGE_LIMITS.DEFAULT_WIDTH,
        }),
      },
      height: {
        default: IMAGE_LIMITS.DEFAULT_HEIGHT,
        parseHTML: (element) => {
          const h =
            element.getAttribute("data-height") ||
            element.querySelector("img")?.getAttribute("height") ||
            String(IMAGE_LIMITS.DEFAULT_HEIGHT);
          return parseInt(h, 10) || IMAGE_LIMITS.DEFAULT_HEIGHT;
        },
        renderHTML: (attributes) => ({
          "data-height": attributes.height || IMAGE_LIMITS.DEFAULT_HEIGHT,
        }),
      },
      alignment: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-alignment") || "center",
        renderHTML: (attributes) => ({
          "data-alignment": attributes.alignment || "center",
        }),
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
        tag: 'div[data-node-type="image"]',
      },
      {
        tag: "div.editor-image-wrapper",
      },
      {
        tag: "img[src]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const alignment: ImageAlignment = HTMLAttributes.alignment || "center";
    const width = Number(HTMLAttributes.width) || IMAGE_LIMITS.DEFAULT_WIDTH;
    const height = Number(HTMLAttributes.height) || IMAGE_LIMITS.DEFAULT_HEIGHT;
    const src = HTMLAttributes.src || "";
    const alt = HTMLAttributes.alt || "";
    const title = HTMLAttributes.title || alt;

    const wrapStyle = buildDrawingWrapStyle(HTMLAttributes.drawingPosition, alignment);
    const wrapperClass = `editor-image-wrapper image-${alignment}${wrapStyle.className ? ` ${wrapStyle.className}` : ""}`;

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-node-type": "image",
        "data-alignment": alignment,
        "data-width": String(width),
        "data-height": String(height),
        class: wrapperClass,
        style: wrapStyle.style,
      }),
      [
        "img",
        {
          src,
          alt,
          title,
          style: `max-width: 100%; width: ${width}px; height: ${height}px; object-fit: contain; border-radius: 4px; display: inline-block; box-shadow: 0 1px 3px rgba(0,0,0,0.1);`,
        },
      ],
    ];
  },

  addCommands() {
    return {
      insertImage:
        (options) =>
        ({ tr, dispatch, editor }) => {
          const val = validateImageDimensions(
            options?.width ?? IMAGE_LIMITS.DEFAULT_WIDTH,
            options?.height ?? IMAGE_LIMITS.DEFAULT_HEIGHT
          );

          const node = editor.schema.nodes[this.name].create({
            src: options.src,
            alt: options.alt || "",
            title: options.title || options.alt || "",
            width: val.sanitizedWidth,
            height: val.sanitizedHeight,
            alignment: options.alignment || "center",
          });

          if (dispatch) {
            const pos = tr.selection.from;
            tr.replaceSelectionWith(node).scrollIntoView();
            const selFrom = tr.selection.from;
            const nodeBefore = tr.selection.$from?.nodeBefore;
            if (nodeBefore && nodeBefore.type.name === this.name) {
              const imgPos = selFrom - nodeBefore.nodeSize;
              try {
                tr.setSelection(NodeSelection.create(tr.doc, imgPos));
              } catch {
                // fallback
              }
            } else {
              for (const checkPos of [pos, pos - 1, pos + 1, selFrom]) {
                if (checkPos >= 0 && checkPos < tr.doc.content.size) {
                  const n = tr.doc.nodeAt(checkPos);
                  if (n && n.type.name === this.name) {
                    try {
                      tr.setSelection(NodeSelection.create(tr.doc, checkPos));
                    } catch {
                      // fallback
                    }
                    break;
                  }
                }
              }
            }
          }
          return true;
        },

      deleteImage:
        () =>
        ({ tr, dispatch, state }) => {
          const target = findImagePos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.delete(target.pos, target.pos + target.node.nodeSize);
            }
            return true;
          }
          return false;
        },

      setImageDimensions:
        (width, height) =>
        ({ tr, dispatch, state }) => {
          const val = validateImageDimensions(width, height);
          const target = findImagePos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                width: val.sanitizedWidth,
                height: val.sanitizedHeight,
              });
            }
            return true;
          }
          return false;
        },

      setImageAlignment:
        (alignment) =>
        ({ tr, dispatch, state }) => {
          const target = findImagePos(state, this.name);
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

      setImageAlt:
        (alt) =>
        ({ tr, dispatch, state }) => {
          const target = findImagePos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                alt,
              });
            }
            return true;
          }
          return false;
        },
    };
  },
});
