import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { buildDrawingWrapStyle } from "../docx/drawing/drawingWrapService.ts";

export type ShapeType =
  | "rectangle"
  | "roundedRectangle"
  | "ellipse"
  | "line"
  | "arrow";

export const SHAPE_LIMITS = {
  MIN_WIDTH: 20,
  MAX_WIDTH: 800,
  DEFAULT_WIDTH: 200,
  MIN_HEIGHT: 10,
  MAX_HEIGHT: 600,
  DEFAULT_HEIGHT: 120,
  MIN_STROKE_WIDTH: 1,
  MAX_STROKE_WIDTH: 12,
  DEFAULT_STROKE_WIDTH: 2,
} as const;

export type ShapeAlignment = "left" | "center" | "right";

export interface ShapeAttributes {
  shapeType: ShapeType;
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  alignment: ShapeAlignment;
}

/**
 * Kiểm tra và chuẩn hóa kích thước Shape an toàn
 */
export function validateShapeDimensions(
  width: number = SHAPE_LIMITS.DEFAULT_WIDTH,
  height: number = SHAPE_LIMITS.DEFAULT_HEIGHT
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
      error: "Kích thước hình vẽ phải là số hợp lệ.",
      sanitizedWidth: SHAPE_LIMITS.DEFAULT_WIDTH,
      sanitizedHeight: SHAPE_LIMITS.DEFAULT_HEIGHT,
    };
  }

  const w = Math.round(width);
  const h = Math.round(height);

  if (w < SHAPE_LIMITS.MIN_WIDTH || h < SHAPE_LIMITS.MIN_HEIGHT) {
    return {
      isValid: false,
      error: `Kích thước tối thiểu là ${SHAPE_LIMITS.MIN_WIDTH}px × ${SHAPE_LIMITS.MIN_HEIGHT}px.`,
      sanitizedWidth: Math.max(SHAPE_LIMITS.MIN_WIDTH, w),
      sanitizedHeight: Math.max(SHAPE_LIMITS.MIN_HEIGHT, h),
    };
  }

  if (w > SHAPE_LIMITS.MAX_WIDTH || h > SHAPE_LIMITS.MAX_HEIGHT) {
    return {
      isValid: false,
      error: `Kích thước tối đa là ${SHAPE_LIMITS.MAX_WIDTH}px × ${SHAPE_LIMITS.MAX_HEIGHT}px.`,
      sanitizedWidth: Math.min(SHAPE_LIMITS.MAX_WIDTH, w),
      sanitizedHeight: Math.min(SHAPE_LIMITS.MAX_HEIGHT, h),
    };
  }

  return {
    isValid: true,
    sanitizedWidth: w,
    sanitizedHeight: h,
  };
}

/**
 * Tìm vị trí bắt đầu của node Shape trong document
 */
function findShapePos(state: any, nodeName: string): { pos: number; node: any } | null {
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

/**
 * Tạo cây DOMOutputSpec biểu diễn SVG cho hình vẽ
 */
export function buildShapeSvgSpec(attrs: ShapeAttributes): any {
  const { shapeType, width, height, fillColor, strokeColor, strokeWidth } = attrs;
  const sw = Math.max(1, strokeWidth);

  switch (shapeType) {
    case "rectangle":
      return [
        "svg",
        {
          width: String(width),
          height: String(height),
          viewBox: `0 0 ${width} ${height}`,
          xmlns: "http://www.w3.org/2000/svg",
          class: "editor-shape-svg",
        },
        [
          "rect",
          {
            x: String(sw / 2),
            y: String(sw / 2),
            width: String(Math.max(1, width - sw)),
            height: String(Math.max(1, height - sw)),
            fill: fillColor,
            stroke: strokeColor,
            "stroke-width": String(sw),
          },
        ],
      ];

    case "roundedRectangle":
      return [
        "svg",
        {
          width: String(width),
          height: String(height),
          viewBox: `0 0 ${width} ${height}`,
          xmlns: "http://www.w3.org/2000/svg",
          class: "editor-shape-svg",
        },
        [
          "rect",
          {
            x: String(sw / 2),
            y: String(sw / 2),
            width: String(Math.max(1, width - sw)),
            height: String(Math.max(1, height - sw)),
            rx: "12",
            ry: "12",
            fill: fillColor,
            stroke: strokeColor,
            "stroke-width": String(sw),
          },
        ],
      ];

    case "ellipse":
      return [
        "svg",
        {
          width: String(width),
          height: String(height),
          viewBox: `0 0 ${width} ${height}`,
          xmlns: "http://www.w3.org/2000/svg",
          class: "editor-shape-svg",
        },
        [
          "ellipse",
          {
            cx: String(width / 2),
            cy: String(height / 2),
            rx: String(Math.max(1, (width - sw) / 2)),
            ry: String(Math.max(1, (height - sw) / 2)),
            fill: fillColor,
            stroke: strokeColor,
            "stroke-width": String(sw),
          },
        ],
      ];

    case "line":
      return [
        "svg",
        {
          width: String(width),
          height: String(height),
          viewBox: `0 0 ${width} ${height}`,
          xmlns: "http://www.w3.org/2000/svg",
          class: "editor-shape-svg",
        },
        [
          "line",
          {
            x1: String(sw),
            y1: String(height / 2),
            x2: String(Math.max(sw, width - sw)),
            y2: String(height / 2),
            stroke: strokeColor,
            "stroke-width": String(sw),
            "stroke-linecap": "round",
          },
        ],
      ];

    case "arrow":
      const arrowBodyEnd = Math.max(sw, width - 16);
      return [
        "svg",
        {
          width: String(width),
          height: String(height),
          viewBox: `0 0 ${width} ${height}`,
          xmlns: "http://www.w3.org/2000/svg",
          class: "editor-shape-svg",
        },
        [
          "line",
          {
            x1: String(sw),
            y1: String(height / 2),
            x2: String(arrowBodyEnd),
            stroke: strokeColor,
            "stroke-width": String(sw),
            "stroke-linecap": "round",
          },
        ],
        [
          "polygon",
          {
            points: `${arrowBodyEnd},${height / 2 - 7} ${width - 2},${height / 2} ${arrowBodyEnd},${height / 2 + 7}`,
            fill: strokeColor,
          },
        ],
      ];

    default:
      return [
        "svg",
        {
          width: String(width),
          height: String(height),
          viewBox: `0 0 ${width} ${height}`,
          xmlns: "http://www.w3.org/2000/svg",
          class: "editor-shape-svg",
        },
        [
          "rect",
          {
            x: "2",
            y: "2",
            width: String(Math.max(1, width - 4)),
            height: String(Math.max(1, height - 4)),
            fill: fillColor,
            stroke: strokeColor,
            "stroke-width": "2",
          },
        ],
      ];
  }
}

export interface ShapeOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    shape: {
      /**
       * Chèn một hình vẽ (Shape) semantic vào vị trí hiện tại
       */
      insertShape: (options?: {
        shapeType?: ShapeType;
        width?: number;
        height?: number;
        fillColor?: string;
        strokeColor?: string;
        strokeWidth?: number;
        alignment?: ShapeAlignment;
      }) => ReturnType;
      /**
       * Xóa hình vẽ hiện tại
       */
      deleteShape: () => ReturnType;
      /**
       * Cập nhật kích thước hình vẽ
       */
      setShapeDimensions: (width: number, height: number) => ReturnType;
      /**
       * Cập nhật màu tô (fill color)
       */
      setShapeFillColor: (fillColor: string) => ReturnType;
      /**
       * Cập nhật màu viền (stroke color)
       */
      setShapeStrokeColor: (strokeColor: string) => ReturnType;
      /**
       * Cập nhật độ dày viền (stroke width)
       */
      setShapeStrokeWidth: (strokeWidth: number) => ReturnType;
      /**
       * Cập nhật căn lề hình vẽ (trái, giữa, phải)
       */
      setShapeAlignment: (alignment: ShapeAlignment) => ReturnType;
      /**
       * Cập nhật vị trí DrawingPosition (Floating/Inline Anchor)
       */
      setShapeDrawingPosition: (position: import("../docx/drawing/drawingTypes.ts").DrawingPosition | null) => ReturnType;
      /**
       * Chèn một hình vẽ (Shape) ở chế độ Floating (Drawing Anchor)
       */
      insertFloatingShape: (options?: {
        shapeType?: ShapeType;
        width?: number;
        height?: number;
        fillColor?: string;
        strokeColor?: string;
        strokeWidth?: number;
        position?: Partial<import("../docx/drawing/drawingTypes.ts").DrawingPosition>;
      }) => ReturnType;
    };
  }
}

/**
 * Shape Extension:
 * Semantic ProseMirror atom node cho Hình vẽ vector cơ bản (Phase 3.8).
 * - Tập hình hỗ trợ: Rectangle, Rounded Rectangle, Ellipse, Line, Arrow
 * - Thuộc tính: shapeType, width, height, fillColor, strokeColor, strokeWidth, alignment
 * - Lưu trữ 100% trong document AST (.mwd)
 */
export const Shape = Node.create<ShapeOptions>({
  name: "shape",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "editor-shape-wrapper",
      },
    };
  },

  addAttributes() {
    return {
      shapeType: {
        default: "rectangle",
        parseHTML: (element) => element.getAttribute("data-shape-type") || "rectangle",
        renderHTML: (attributes) => ({
          "data-shape-type": attributes.shapeType || "rectangle",
        }),
      },
      width: {
        default: SHAPE_LIMITS.DEFAULT_WIDTH,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-width") || String(SHAPE_LIMITS.DEFAULT_WIDTH), 10) ||
          SHAPE_LIMITS.DEFAULT_WIDTH,
        renderHTML: (attributes) => ({
          "data-width": attributes.width || SHAPE_LIMITS.DEFAULT_WIDTH,
        }),
      },
      height: {
        default: SHAPE_LIMITS.DEFAULT_HEIGHT,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-height") || String(SHAPE_LIMITS.DEFAULT_HEIGHT), 10) ||
          SHAPE_LIMITS.DEFAULT_HEIGHT,
        renderHTML: (attributes) => ({
          "data-height": attributes.height || SHAPE_LIMITS.DEFAULT_HEIGHT,
        }),
      },
      fillColor: {
        default: "#3b82f6",
        parseHTML: (element) => element.getAttribute("data-fill-color") || "#3b82f6",
        renderHTML: (attributes) => ({
          "data-fill-color": attributes.fillColor || "#3b82f6",
        }),
      },
      strokeColor: {
        default: "#1d4ed8",
        parseHTML: (element) => element.getAttribute("data-stroke-color") || "#1d4ed8",
        renderHTML: (attributes) => ({
          "data-stroke-color": attributes.strokeColor || "#1d4ed8",
        }),
      },
      strokeWidth: {
        default: SHAPE_LIMITS.DEFAULT_STROKE_WIDTH,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-stroke-width") || String(SHAPE_LIMITS.DEFAULT_STROKE_WIDTH), 10) ||
          SHAPE_LIMITS.DEFAULT_STROKE_WIDTH,
        renderHTML: (attributes) => ({
          "data-stroke-width": attributes.strokeWidth || SHAPE_LIMITS.DEFAULT_STROKE_WIDTH,
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
        tag: 'div[data-node-type="shape"]',
      },
      {
        tag: "div.editor-shape-wrapper",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const shapeType: ShapeType = HTMLAttributes.shapeType || "rectangle";
    const width = Number(HTMLAttributes.width) || SHAPE_LIMITS.DEFAULT_WIDTH;
    const height = Number(HTMLAttributes.height) || SHAPE_LIMITS.DEFAULT_HEIGHT;
    const fillColor = HTMLAttributes.fillColor || (shapeType === "line" || shapeType === "arrow" ? "none" : "#3b82f6");
    const strokeColor = HTMLAttributes.strokeColor || "#1d4ed8";
    const strokeWidth = Number(HTMLAttributes.strokeWidth) || SHAPE_LIMITS.DEFAULT_STROKE_WIDTH;
    const alignment: ShapeAlignment = HTMLAttributes.alignment || "center";

    const svgSpec = buildShapeSvgSpec({
      shapeType,
      width,
      height,
      fillColor,
      strokeColor,
      strokeWidth,
      alignment,
    });

    const wrapStyle = buildDrawingWrapStyle(HTMLAttributes.drawingPosition, alignment);
    const wrapperClass = `editor-shape-wrapper shape-${alignment}${wrapStyle.className ? ` ${wrapStyle.className}` : ""}`;

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-node-type": "shape",
        "data-shape-type": shapeType,
        "data-width": String(width),
        "data-height": String(height),
        "data-fill-color": fillColor,
        "data-stroke-color": strokeColor,
        "data-stroke-width": String(strokeWidth),
        "data-alignment": alignment,
        class: wrapperClass,
        style: wrapStyle.style,
      }),
      svgSpec,
    ];
  },

  addCommands() {
    return {
      insertShape:
        (options) =>
        ({ tr, dispatch, editor }) => {
          const shapeType: ShapeType = options?.shapeType || "rectangle";
          const isLineOrArrow = shapeType === "line" || shapeType === "arrow";
          const defaultW = isLineOrArrow ? 240 : SHAPE_LIMITS.DEFAULT_WIDTH;
          const defaultH = isLineOrArrow ? 36 : SHAPE_LIMITS.DEFAULT_HEIGHT;
          const defaultFill = isLineOrArrow ? "none" : "#3b82f6";

          const val = validateShapeDimensions(
            options?.width ?? defaultW,
            options?.height ?? defaultH
          );

          const node = editor.schema.nodes[this.name].create({
            shapeType,
            width: val.sanitizedWidth,
            height: val.sanitizedHeight,
            fillColor: options?.fillColor ?? defaultFill,
            strokeColor: options?.strokeColor ?? "#1d4ed8",
            strokeWidth: options?.strokeWidth ?? SHAPE_LIMITS.DEFAULT_STROKE_WIDTH,
            alignment: options?.alignment ?? "center",
          });

          if (dispatch) {
            const pos = tr.selection.from;
            tr.replaceSelectionWith(node).scrollIntoView();
            const selFrom = tr.selection.from;
            const nodeBefore = tr.selection.$from?.nodeBefore;
            if (nodeBefore && nodeBefore.type.name === this.name) {
              const shapePos = selFrom - nodeBefore.nodeSize;
              try {
                tr.setSelection(NodeSelection.create(tr.doc, shapePos));
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

      deleteShape:
        () =>
        ({ tr, dispatch, state }) => {
          const target = findShapePos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.delete(target.pos, target.pos + target.node.nodeSize);
            }
            return true;
          }
          return false;
        },

      setShapeDimensions:
        (width, height) =>
        ({ tr, dispatch, state }) => {
          const val = validateShapeDimensions(width, height);
          const target = findShapePos(state, this.name);
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

      setShapeFillColor:
        (fillColor) =>
        ({ tr, dispatch, state }) => {
          const target = findShapePos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                fillColor,
              });
            }
            return true;
          }
          return false;
        },

      setShapeStrokeColor:
        (strokeColor) =>
        ({ tr, dispatch, state }) => {
          const target = findShapePos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                strokeColor,
              });
            }
            return true;
          }
          return false;
        },

      setShapeStrokeWidth:
        (strokeWidth) =>
        ({ tr, dispatch, state }) => {
          const sw = Math.min(
            SHAPE_LIMITS.MAX_STROKE_WIDTH,
            Math.max(SHAPE_LIMITS.MIN_STROKE_WIDTH, Math.round(strokeWidth))
          );
          const target = findShapePos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                strokeWidth: sw,
              });
            }
            return true;
          }
          return false;
        },

      setShapeAlignment:
        (alignment) =>
        ({ tr, dispatch, state }) => {
          const target = findShapePos(state, this.name);
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

      setShapeDrawingPosition:
        (position) =>
        ({ tr, dispatch, state }) => {
          const target = findShapePos(state, this.name);
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

      insertFloatingShape:
        (options) =>
        ({ tr, dispatch, editor }) => {
          const shapeType: ShapeType = options?.shapeType || "rectangle";
          const isLineOrArrow = shapeType === "line" || shapeType === "arrow";
          const defaultW = isLineOrArrow ? 240 : SHAPE_LIMITS.DEFAULT_WIDTH;
          const defaultH = isLineOrArrow ? 36 : SHAPE_LIMITS.DEFAULT_HEIGHT;
          const defaultFill = isLineOrArrow ? "none" : "#3b82f6";

          const val = validateShapeDimensions(
            options?.width ?? defaultW,
            options?.height ?? defaultH
          );

          const floatingPos: import("../docx/drawing/drawingTypes.ts").DrawingPosition = {
            placement: "floating",
            width: val.sanitizedWidth,
            height: val.sanitizedHeight,
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

          const node = editor.schema.nodes[this.name].create({
            shapeType,
            width: val.sanitizedWidth,
            height: val.sanitizedHeight,
            fillColor: options?.fillColor ?? defaultFill,
            strokeColor: options?.strokeColor ?? "#1d4ed8",
            strokeWidth: options?.strokeWidth ?? SHAPE_LIMITS.DEFAULT_STROKE_WIDTH,
            alignment: "center",
            drawingPosition: floatingPos,
          });

          if (dispatch) {
            const pos = tr.selection.from;
            tr.replaceSelectionWith(node).scrollIntoView();
            const selFrom = tr.selection.from;
            for (const checkPos of [pos, pos - 1, pos + 1, selFrom]) {
              if (checkPos >= 0 && checkPos < tr.doc.content.size) {
                const n = tr.doc.nodeAt(checkPos);
                if (n && n.type.name === this.name) {
                  try {
                    tr.setSelection(NodeSelection.create(tr.doc, checkPos));
                  } catch {}
                  break;
                }
              }
            }
          }
          return true;
        },
    };
  },
});
