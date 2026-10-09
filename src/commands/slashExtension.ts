import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { commandRegistry } from "./commandRegistry.ts";
import { useSlashCommandStore } from "../stores/slashCommandStore.ts";
import { executeCommandWithSelection } from "./commandExecution.ts";

export const slashCommandPluginKey = new PluginKey("personalWordSlashCommand");

export interface SlashTriggerResult {
  valid: boolean;
  from: number;
  to: number;
  slashPos: number;
  query: string;
}

/**
 * Kiểm tra xem vị trí con trỏ hiện tại có phải là ngữ cảnh hợp lệ để kích hoạt Slash Command hay không.
 *
 * Tiêu chí an toàn:
 * 1. Không trigger khi đang compose IME tiếng Việt (view?.composing).
 * 2. Selection phải là con trỏ rỗng (collapsed), không phải vùng bôi đen.
 * 3. Node cha phải là paragraph thông thường (loại trừ code, equation, atom node, table, TOC...).
 * 4. Không nằm trong mark 'link' (Hyperlink).
 * 5. Ký tự '/' phải nằm ở đầu đoạn văn bản (index 0) hoặc ngay sau một ký tự khoảng trắng (whitespace).
 * 6. Không nằm trong URL (http://, https://, ftp://).
 * 7. Query không chứa khoảng trắng hoặc dấu phân cách.
 */
export function isValidSlashTriggerContext(
  state: EditorState,
  pos: number,
  view?: EditorView | null
): SlashTriggerResult {
  const invalidResult: SlashTriggerResult = {
    valid: false,
    from: 0,
    to: 0,
    slashPos: 0,
    query: "",
  };

  // 1. IME Safety (Tiếng Việt Telex/VNI composing)
  if (view && (view.composing || (view as unknown as { isComposing?: boolean }).isComposing)) {
    return invalidResult;
  }

  // 2. Selection phải là con trỏ đơn (không phải vùng bôi đen)
  if (!state.selection.empty) {
    return invalidResult;
  }

  const docSize = state.doc.content.size;
  if (pos < 0 || pos > docSize) {
    return invalidResult;
  }

  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;

  // 3. Chỉ cho phép trong paragraph thông thường
  if (parent.type.name !== "paragraph") {
    return invalidResult;
  }

  // Không cho phép nếu node cha là atom
  if (parent.isAtom) {
    return invalidResult;
  }

  // 4. Link & Mark Safety: Không kích hoạt bên trong Hyperlink
  const marksAtPos = $pos.marks();
  if (marksAtPos.some((m) => m.type.name === "link")) {
    return invalidResult;
  }
  if ($pos.parentOffset > 0) {
    const marksBefore = $pos.marksAcross($pos);
    if (marksBefore && marksBefore.some((m) => m.type.name === "link")) {
      return invalidResult;
    }
  }

  // 5. Kiểm tra chuỗi văn bản trước con trỏ trong paragraph
  const textBefore = parent.textBetween(0, $pos.parentOffset, null, "\ufffc");
  const lastSlash = textBefore.lastIndexOf("/");

  if (lastSlash === -1) {
    return invalidResult;
  }

  // Phải ở đầu block (lastSlash === 0) hoặc ngay sau khoảng trắng
  if (lastSlash > 0) {
    const charBefore = textBefore[lastSlash - 1];
    if (!/\s/.test(charBefore)) {
      // Ví dụ: https://, a/b, 1/2, word/other -> Bị từ chối an toàn
      return invalidResult;
    }
  }

  // 6. Kiểm tra URL pattern trong textBefore
  if (/[a-zA-Z0-9+.-]+:\/\/[^\s]*$/.test(textBefore)) {
    return invalidResult;
  }

  // 7. Query validation: không chứa dấu cách, độ dài hợp lý
  const query = textBefore.slice(lastSlash + 1);
  if (query.includes(" ") || query.includes("\n") || query.length > 25) {
    return invalidResult;
  }

  // Không chứa các ký tự đặc biệt gây false positive
  if (/[\\:?*#"<>|]/.test(query)) {
    return invalidResult;
  }

  const slashDocPos = $pos.start() + lastSlash;
  const currentDocPos = pos;

  return {
    valid: true,
    from: slashDocPos,
    to: currentDocPos,
    slashPos: slashDocPos,
    query,
  };
}

let lastDismissedPos: number | null = null;

export const SlashCommandExtension = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: slashCommandPluginKey,

        props: {
          handleKeyDown(view, event) {
            const slashState = useSlashCommandStore.getState();

            if (!slashState.isOpen) {
              return false;
            }

            // Keyboard navigation khi Slash Menu đang mở
            if (event.key === "ArrowDown") {
              event.preventDefault();
              const items = commandRegistry.search(slashState.query, { slashOnly: true });
              slashState.selectNext(items.length);
              return true;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              const items = commandRegistry.search(slashState.query, { slashOnly: true });
              slashState.selectPrev(items.length);
              return true;
            }

            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              const items = commandRegistry.search(slashState.query, { slashOnly: true });
              const selectedItem = items[slashState.selectedIndex] || items[0];

              if (selectedItem) {
                const range = slashState.triggerRange;
                slashState.closeSlashMenu();
                executeCommandWithSelection(selectedItem.id, {
                  editor,
                  rangeToDelete: range,
                });
              } else {
                slashState.closeSlashMenu();
              }
              return true;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              lastDismissedPos = view.state.selection.from;
              slashState.closeSlashMenu();
              return true;
            }

            return false;
          },

          handleClick() {
            if (useSlashCommandStore.getState().isOpen) {
              useSlashCommandStore.getState().closeSlashMenu();
            }
            return false;
          },

          handleDOMEvents: {
            compositionstart() {
              if (useSlashCommandStore.getState().isOpen) {
                useSlashCommandStore.getState().closeSlashMenu();
              }
              return false;
            },
          },
        },

        view() {
          return {
            update(view, prevState) {
              const { state } = view;

              // Nếu state không đổi, bỏ qua
              if (state === prevState) {
                return;
              }

              const currentPos = state.selection.from;

              // Nếu người dùng vừa nhấn Escape tại chính vị trí này và chưa di chuyển/gõ tiếp
              if (lastDismissedPos !== null && lastDismissedPos === currentPos) {
                return;
              }
              if (lastDismissedPos !== null && lastDismissedPos !== currentPos) {
                lastDismissedPos = null;
              }

              const trigger = isValidSlashTriggerContext(state, currentPos, view);

              if (trigger.valid) {
                let coords = { x: 0, y: 0 };
                try {
                  const domCoords = view.coordsAtPos(trigger.slashPos);
                  coords = {
                    x: domCoords.left,
                    y: domCoords.bottom + 4,
                  };
                } catch {
                  coords = { x: 100, y: 100 };
                }

                const slashStore = useSlashCommandStore.getState();
                if (!slashStore.isOpen) {
                  slashStore.openSlashMenu(
                    coords,
                    { from: trigger.from, to: trigger.to },
                    trigger.query
                  );
                } else {
                  slashStore.updateSlashQuery(trigger.query, {
                    from: trigger.from,
                    to: trigger.to,
                  });
                }
              } else {
                if (useSlashCommandStore.getState().isOpen) {
                  useSlashCommandStore.getState().closeSlashMenu();
                }
              }
            },

            destroy() {
              if (useSlashCommandStore.getState().isOpen) {
                useSlashCommandStore.getState().closeSlashMenu();
              }
            },
          };
        },
      }),
    ];
  },
});
