import { Node, mergeAttributes } from "@tiptap/core";
import type { NoteType } from "../types/noteTypes.ts";
import { NoteService } from "../services/noteService.ts";

export interface NoteReferenceOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteReference: {
      /**
       * Chèn một Footnote ngữ nghĩa tại vị trí con trỏ
       */
      insertFootnote: (initialContent?: string) => ReturnType;
      /**
       * Chèn một Endnote ngữ nghĩa tại vị trí con trỏ
       */
      insertEndnote: (initialContent?: string) => ReturnType;
      /**
       * Cập nhật nội dung của chú thích
       */
      updateNoteContent: (noteId: string, content: string) => ReturnType;
      /**
       * Xóa chú thích khỏi tài liệu
       */
      deleteNote: (noteId: string) => ReturnType;
      /**
       * Di chuyển tới Footnote kế tiếp
       */
      nextFootnote: () => ReturnType;
      /**
       * Di chuyển tới Footnote phía trước
       */
      previousFootnote: () => ReturnType;
    };
  }
}

/**
 * Note Reference Extension - Personal Word Editor (Phase 6.4 Architecture)
 *
 * Tiptap Inline Atom Node cho chú thích Footnotes và Endnotes:
 * - atom: true, inline: true (không cho phép gõ ký tự trực tiếp vào marker)
 * - Numbering động được giải quyết qua NoteService
 * - Phím tắt chuẩn Microsoft Word: Ctrl+Alt+F (Footnote) và Ctrl+Alt+D (Endnote)
 */
export const NoteReferenceExtension = Node.create<NoteReferenceOptions>({
  name: "noteReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      noteId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-note-id") || "",
        renderHTML: (attributes) => ({ "data-note-id": attributes.noteId }),
      },
      noteType: {
        default: "footnote" as NoteType,
        parseHTML: (element) =>
          (element.getAttribute("data-note-type") as NoteType) || "footnote",
        renderHTML: (attributes) => ({ "data-note-type": attributes.noteType }),
      },
      content: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-note-content") || "",
        renderHTML: (attributes) => ({ "data-note-content": attributes.content }),
      },
      customMark: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-custom-mark") || undefined,
        renderHTML: (attributes) =>
          attributes.customMark ? { "data-custom-mark": attributes.customMark } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "sup.editor-note-reference",
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          return {
            noteId: element.getAttribute("data-note-id") || "",
            noteType: (element.getAttribute("data-note-type") as NoteType) || "footnote",
            content: element.getAttribute("data-note-content") || "",
            customMark: element.getAttribute("data-custom-mark") || undefined,
          };
        },
      },
      {
        tag: "sup[data-note-id]",
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          return {
            noteId: element.getAttribute("data-note-id") || "",
            noteType: (element.getAttribute("data-note-type") as NoteType) || "footnote",
            content: element.getAttribute("data-note-content") || "",
            customMark: element.getAttribute("data-custom-mark") || undefined,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = (node.attrs.noteType as NoteType) || "footnote";
    const customMark = node.attrs.customMark as string | undefined;

    return [
      "sup",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: `editor-note-reference note-reference-${type}`,
        role: "doc-noteref",
        tabindex: 0,
        "data-note-id": node.attrs.noteId,
        "data-note-type": type,
        "data-note-content": node.attrs.content || "",
      }),
      customMark || "•", // Placeholder static HTML fallback
    ];
  },

  addCommands() {
    return {
      insertFootnote:
        (initialContent = "") =>
        ({ editor }) => {
          const res = NoteService.insertNote(editor, "footnote", initialContent);
          return res.success;
        },
      insertEndnote:
        (initialContent = "") =>
        ({ editor }) => {
          const res = NoteService.insertNote(editor, "endnote", initialContent);
          return res.success;
        },
      updateNoteContent:
        (noteId: string, content: string) =>
        ({ editor }) => {
          const res = NoteService.updateNoteContent(editor, noteId, content);
          return res.success;
        },
      deleteNote:
        (noteId: string) =>
        ({ editor }) => {
          const res = NoteService.deleteNote(editor, noteId);
          return res.success;
        },
      nextFootnote:
        () =>
        ({ editor }) => {
          const res = NoteService.navigateToNextNote(editor, "footnote");
          return res.success;
        },
      previousFootnote:
        () =>
        ({ editor }) => {
          const res = NoteService.navigateToPreviousNote(editor, "footnote");
          return res.success;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-f": () => this.editor.commands.insertFootnote(),
      "Mod-Alt-d": () => this.editor.commands.insertEndnote(),
    };
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement("sup");
      const type = (node.attrs.noteType as NoteType) || "footnote";
      const noteId = (node.attrs.noteId as string) || "";

      dom.className = `editor-note-reference note-reference-${type}`;
      dom.setAttribute("data-note-id", noteId);
      dom.setAttribute("data-note-type", type);
      dom.setAttribute("role", "doc-noteref");
      dom.setAttribute("tabindex", "0");

      const updateLabel = () => {
        const label = NoteService.getNoteLabel(editor.state.doc, noteId, type);
        dom.textContent = label;
        const snippet = node.attrs.content
          ? node.attrs.content.substring(0, 60) + (node.attrs.content.length > 60 ? "..." : "")
          : "(Chưa có nội dung)";
        dom.title = `${type === "footnote" ? "Chú thích chân trang" : "Chú thích cuối bài"} [${label}]: ${snippet}`;
      };

      updateLabel();

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        NoteService.navigateToNote(editor, noteId, type);
      });

      dom.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          NoteService.navigateToNote(editor, noteId, type);
        }
      });

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;
          node = updatedNode;
          updateLabel();
          return true;
        },
      };
    };
  },
});
