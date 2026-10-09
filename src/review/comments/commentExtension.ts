import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { useReviewStore } from "../../stores/reviewStore.ts";

export interface CommentMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      /**
       * Gắn mark comment với commentId vào vùng chọn hiện tại.
       */
      setComment: (commentId: string) => ReturnType;
      /**
       * Gỡ bỏ mark comment có commentId tương ứng trên toàn bộ tài liệu.
       */
      unsetComment: (commentId: string) => ReturnType;
    };
  }
}

/**
 * CommentExtension (Phase 5.4 - Comments Core)
 *
 * Mark semantic để liên kết vùng văn bản với bản ghi bình luận (CommentItem).
 * Tự động co giãn theo thay đổi nội dung (typing, deletion), giữ vững định dạng
 * văn bản (bold, italic, font, color, v.v.) và không làm ảnh hưởng DOCX export.
 */
export const CommentExtension = Mark.create<CommentMarkOptions>({
  name: "comment",

  // Cho phép cùng tồn tại với các marks định dạng khác
  excludes: "",

  spanning: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => {
          if (!attributes.commentId) {
            return {};
          }
          return {
            "data-comment-id": attributes.commentId,
            class: "comment-highlight",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-comment-id]",
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
      setComment:
        (commentId: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { commentId });
        },

      unsetComment:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state;
          const markType = state.schema.marks[this.name];
          if (!markType) return false;

          let found = false;
          doc.descendants((node, pos) => {
            if (!node.isText) return;
            const mark = node.marks.find(
              (m) => m.type === markType && m.attrs.commentId === commentId
            );
            if (mark) {
              found = true;
              if (dispatch) {
                tr.removeMark(pos, pos + node.nodeSize, mark);
              }
            }
          });

          if (dispatch && found) {
            dispatch(tr);
          }
          return found;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement | null;
            const commentSpan = target?.closest("[data-comment-id]");
            let foundCommentId: string | null = null;

            if (commentSpan) {
              foundCommentId = commentSpan.getAttribute("data-comment-id");
            } else {
              // Kiểm tra resolved pos trong doc
              const $pos = view.state.doc.resolve(pos);
              const mark = $pos.marks().find((m) => m.type.name === "comment");
              if (mark?.attrs?.commentId) {
                foundCommentId = mark.attrs.commentId;
              }
            }

            if (foundCommentId) {
              const reviewState = useReviewStore.getState();
              reviewState.setActiveCommentId(foundCommentId);
              reviewState.setCommentsSidebarOpen(true);
            }

            return false;
          },
        },
      }),
    ];
  },
});
