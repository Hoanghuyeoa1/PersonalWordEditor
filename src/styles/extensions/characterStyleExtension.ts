import { Mark, mergeAttributes } from "@tiptap/core";

export interface CharacterStyleMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    characterStyle: {
      /**
       * Áp dụng Character Style lên vùng chọn
       */
      setCharacterStyle: (styleId: string) => ReturnType;
      /**
       * Gỡ bỏ Character Style khỏi vùng chọn (giữ nguyên các marks định dạng khác)
       */
      unsetCharacterStyle: () => ReturnType;
    };
  }
}

/**
 * CharacterStyleExtension (Phase 4 - Character Styles Core)
 *
 * Mark ngữ nghĩa liên kết vùng ký tự văn bản với một Character Style trong tài liệu:
 * - attrs: { styleId: string }
 * - excludes: "" (cho phép cùng tồn tại với TẤT CẢ các marks khác: bold, italic, comment, trackChange, link...)
 * - spanning: true (cho phép bao phủ mượt mà qua các node text phân mảnh)
 * - Không copy duplicate formatting definitions vào từng text node.
 */
export const CharacterStyleExtension = Mark.create<CharacterStyleMarkOptions>({
  name: "characterStyle",

  // Tuyệt đối không loại trừ bất kỳ mark nào khác (comment, trackChange, bold, italic...)
  excludes: "",

  spanning: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      styleId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-character-style-id") ||
          element.getAttribute("data-style-id") ||
          null,
        renderHTML: (attributes) => {
          if (!attributes.styleId) {
            return {};
          }
          return {
            "data-character-style-id": attributes.styleId,
            class: `word-character-style-${attributes.styleId}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-character-style-id]",
      },
      {
        tag: "span[data-style-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setCharacterStyle:
        (styleId: string) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const markType = state.schema.marks.characterStyle;
          if (!markType || !styleId) return false;

          if (selection.empty) {
            // Con trỏ rỗng: gán vào storedMarks cho các ký tự gõ tiếp theo
            const newMark = markType.create({ styleId });
            const currentMarks = state.storedMarks || selection.$from.marks();
            const filteredMarks = currentMarks.filter(
              (m) => m.type !== markType
            );
            tr.setStoredMarks([...filteredMarks, newMark]);
          } else {
            // Có vùng chọn: thay thế characterStyle cũ bằng styleId mới
            tr.removeMark(selection.from, selection.to, markType);
            tr.addMark(selection.from, selection.to, markType.create({ styleId }));
          }

          if (dispatch) {
            dispatch(tr);
          }
          return true;
        },

      unsetCharacterStyle:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const markType = state.schema.marks.characterStyle;
          if (!markType) return false;

          if (selection.empty) {
            const currentMarks = state.storedMarks || selection.$from.marks();
            tr.setStoredMarks(currentMarks.filter((m) => m.type !== markType));
          } else {
            tr.removeMark(selection.from, selection.to, markType);
          }

          if (dispatch) {
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

