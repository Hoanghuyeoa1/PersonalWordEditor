import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import katex from "katex";

export type EquationAlignment = "left" | "center" | "right";

export interface EquationAttributes {
  latex: string;
  displayMode: boolean;
  alignment: EquationAlignment;
}

/**
 * Tìm vị trí bắt đầu của node Equation trong document
 */
function findEquationPos(state: any, nodeName: string): { pos: number; node: any } | null {
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

export interface EquationOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    equation: {
      /**
       * Chèn một phương trình / công thức toán học (Equation) semantic
       */
      insertEquation: (options?: {
        latex?: string;
        displayMode?: boolean;
        alignment?: EquationAlignment;
      }) => ReturnType;
      /**
       * Cập nhật mã nguồn LaTeX của phương trình
       */
      updateEquation: (latex: string) => ReturnType;
      /**
       * Xóa phương trình hiện tại
       */
      deleteEquation: () => ReturnType;
      /**
       * Căn lề phương trình (trái, giữa, phải)
       */
      setEquationAlignment: (alignment: EquationAlignment) => ReturnType;
    };
  }
}

/**
 * Equation Extension:
 * Semantic ProseMirror atom node cho Phương trình / Công thức toán học (Phase 3.8).
 * - Biểu diễn: equation node -> lưu trữ mã nguồn LaTeX -> kết xuất qua KaTeX
 * - Bảo mật: Không sử dụng eval, kết xuất an toàn qua katex engine
 * - Lưu trữ: Lưu trực tiếp thuộc tính latex trong document model .mwd
 */
export const Equation = Node.create<EquationOptions>({
  name: "equation",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "editor-equation-block",
      },
    };
  },

  addAttributes() {
    return {
      latex: {
        default: "x^2 + y^2 = z^2",
        parseHTML: (element) => element.getAttribute("data-latex") || "x^2 + y^2 = z^2",
        renderHTML: (attributes) => ({
          "data-latex": attributes.latex || "x^2 + y^2 = z^2",
        }),
      },
      displayMode: {
        default: true,
        parseHTML: (element) => element.getAttribute("data-display-mode") !== "false",
        renderHTML: (attributes) => ({
          "data-display-mode": String(attributes.displayMode !== false),
        }),
      },
      alignment: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-alignment") || "center",
        renderHTML: (attributes) => ({
          "data-alignment": attributes.alignment || "center",
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-node-type="equation"]',
      },
      {
        tag: "div.editor-equation-block",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const latex = HTMLAttributes.latex || "x^2 + y^2 = z^2";
    const alignment: EquationAlignment = HTMLAttributes.alignment || "center";
    const displayMode = HTMLAttributes.displayMode !== false;

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-node-type": "equation",
        "data-latex": latex,
        "data-display-mode": String(displayMode),
        "data-alignment": alignment,
        class: `editor-equation-block equation-${alignment}`,
        style: `text-align: ${alignment}; margin: 1rem 0; cursor: pointer;`,
      }),
      ["span", { class: "editor-equation-source" }, latex],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      const alignment = node.attrs.alignment || "center";
      dom.className = `editor-equation-block equation-${alignment}`;
      dom.setAttribute("data-node-type", "equation");
      dom.setAttribute("data-latex", node.attrs.latex || "");
      dom.setAttribute("data-alignment", alignment);
      dom.style.textAlign = alignment;
      dom.style.margin = "1rem 0";
      dom.style.cursor = "pointer";

      const renderContainer = document.createElement("div");
      renderContainer.className = "editor-equation-rendered";
      
      const renderMath = (latexText: string, isBlock: boolean) => {
        try {
          katex.render(latexText || "", renderContainer, {
            throwOnError: false,
            displayMode: isBlock,
          });
        } catch {
          renderContainer.textContent = latexText || "";
        }
      };

      renderMath(node.attrs.latex || "", node.attrs.displayMode !== false);
      dom.appendChild(renderContainer);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;
          const newAlign = updatedNode.attrs.alignment || "center";
          dom.setAttribute("data-latex", updatedNode.attrs.latex || "");
          dom.setAttribute("data-alignment", newAlign);
          dom.style.textAlign = newAlign;
          dom.className = `editor-equation-block equation-${newAlign}`;
          renderContainer.innerHTML = "";
          renderMath(updatedNode.attrs.latex || "", updatedNode.attrs.displayMode !== false);
          return true;
        },
        selectNode: () => {
          dom.classList.add("ProseMirror-selectednode");
        },
        deselectNode: () => {
          dom.classList.remove("ProseMirror-selectednode");
        },
      };
    };
  },

  addCommands() {
    return {
      insertEquation:
        (options) =>
        ({ tr, dispatch, editor }) => {
          const latex = options?.latex ?? "x^2 + y^2 = z^2";
          const displayMode = options?.displayMode !== false;
          const alignment = options?.alignment || "center";

          const node = editor.schema.nodes[this.name].create({
            latex,
            displayMode,
            alignment,
          });

          if (dispatch) {
            const pos = tr.selection.from;
            tr.replaceSelectionWith(node).scrollIntoView();
            const selFrom = tr.selection.from;
            const nodeBefore = tr.selection.$from?.nodeBefore;
            if (nodeBefore && nodeBefore.type.name === this.name) {
              const eqPos = selFrom - nodeBefore.nodeSize;
              try {
                tr.setSelection(NodeSelection.create(tr.doc, eqPos));
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

      updateEquation:
        (latex) =>
        ({ tr, dispatch, state }) => {
          const target = findEquationPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.setNodeMarkup(target.pos, undefined, {
                ...target.node.attrs,
                latex,
              });
            }
            return true;
          }
          return false;
        },

      deleteEquation:
        () =>
        ({ tr, dispatch, state }) => {
          const target = findEquationPos(state, this.name);
          if (target) {
            if (dispatch) {
              tr.delete(target.pos, target.pos + target.node.nodeSize);
            }
            return true;
          }
          return false;
        },

      setEquationAlignment:
        (alignment) =>
        ({ tr, dispatch, state }) => {
          const target = findEquationPos(state, this.name);
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
    };
  },
});
