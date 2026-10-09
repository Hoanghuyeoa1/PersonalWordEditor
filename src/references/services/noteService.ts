import type { Editor, JSONContent } from "@tiptap/core";
import { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { NoteType, NoteItem } from "../types/noteTypes.ts";
import { formatNoteLabel } from "../types/noteTypes.ts";
import type { ReferenceCommandResult } from "../types/referencesTypes.ts";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import { usePaginationStore } from "../../stores/paginationStore.ts";
import { buildPageLayoutMap, type PageLayoutMap } from "../../page/services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "../../page/services/pageConstants.ts";

/**
 * Note Service - Personal Word Editor (Phase 6.4 Architecture)
 *
 * Quản lý toàn diện hệ thống chú thích Footnotes và Endnotes:
 * - Trích xuất chú thích trực tiếp từ AST (Single Source of Truth)
 * - Đánh số thứ tự liên tục, tự động và có tính quyết định (Deterministic continuous numbering)
 * - Chèn, cập nhật nội dung, xóa chú thích an toàn qua ProseMirror Transaction
 * - Điều hướng hai chiều (Ref -> Note và Note -> Ref)
 * - Tự động tái lập số khi thêm/xóa chú thích ở giữa tài liệu mà không để lại orphan metadata
 */
export class NoteService {
  /**
   * Sinh định danh ngữ nghĩa duy nhất cho chú thích
   */
  public static generateNoteId(type: NoteType): string {
    const prefix = type === "footnote" ? "ref_fn" : "ref_en";
    const randPart = Math.random().toString(36).substring(2, 8);
    const timePart = Date.now().toString(36);
    return `${prefix}_${timePart}_${randPart}`;
  }

  /**
   * Trích xuất danh sách tất cả Footnotes và Endnotes từ ProseMirror Node hoặc JSONContent
   * Số thứ tự được tính toán động theo thứ tự xuất hiện thực tế trong tài liệu.
   */
  public static extractNotes(doc: ProsemirrorNode | JSONContent): {
    footnotes: NoteItem[];
    endnotes: NoteItem[];
    all: NoteItem[];
  } {
    const footnotes: NoteItem[] = [];
    const endnotes: NoteItem[] = [];

    if (!doc) {
      return { footnotes, endnotes, all: [] };
    }

    if (doc instanceof ProsemirrorNode) {
      // Trường hợp ProseMirror Node
      let fnIndex = 0;
      let enIndex = 0;

      doc.descendants((node, pos) => {
        if (node.type.name === "noteReference") {
          const type = (node.attrs.noteType as NoteType) || "footnote";
          const rawId = (node.attrs.noteId as string) || `note_${pos}`;
          const content = (node.attrs.content as string) || "";
          const customMark = (node.attrs.customMark as string) || undefined;

          if (type === "endnote") {
            enIndex++;
            endnotes.push({
              id: rawId,
              type: "endnote",
              number: enIndex,
              label: formatNoteLabel("endnote", enIndex, customMark),
              content,
              pos,
              customMark,
            });
          } else {
            fnIndex++;
            footnotes.push({
              id: rawId,
              type: "footnote",
              number: fnIndex,
              label: formatNoteLabel("footnote", fnIndex, customMark),
              content,
              pos,
              customMark,
            });
          }
        }
      });
    } else {
      // Trường hợp JSONContent AST (khi load file, export hoặc test headless)
      let fnIndex = 0;
      let enIndex = 0;

      function traverse(n: JSONContent) {
        if (!n) return;
        if (n.type === "noteReference") {
          const type = (n.attrs?.noteType as NoteType) || "footnote";
          const rawId = (n.attrs?.noteId as string) || `note_${fnIndex + enIndex + 1}`;
          const content = (n.attrs?.content as string) || "";
          const customMark = (n.attrs?.customMark as string) || undefined;

          if (type === "endnote") {
            enIndex++;
            endnotes.push({
              id: rawId,
              type: "endnote",
              number: enIndex,
              label: formatNoteLabel("endnote", enIndex, customMark),
              content,
              customMark,
            });
          } else {
            fnIndex++;
            footnotes.push({
              id: rawId,
              type: "footnote",
              number: fnIndex,
              label: formatNoteLabel("footnote", fnIndex, customMark),
              content,
              customMark,
            });
          }
        }

        if (n.content && Array.isArray(n.content)) {
          for (const child of n.content) {
            traverse(child);
          }
        }
      }

      traverse(doc);
    }

    return {
      footnotes,
      endnotes,
      all: [...footnotes, ...endnotes],
    };
  }

  /**
   * Lấy số thứ tự động của một chú thích dựa trên ID và Type trong document
   */
  public static getNoteNumber(
    doc: ProsemirrorNode | JSONContent,
    noteId: string,
    type: NoteType
  ): number {
    const { footnotes, endnotes } = this.extractNotes(doc);
    const list = type === "endnote" ? endnotes : footnotes;
    const found = list.find((item) => item.id === noteId);
    return found ? found.number : 1;
  }

  /**
   * Lấy nhãn hiển thị định dạng của một chú thích (1, 2, 3... hoặc i, ii, iii...)
   */
  public static getNoteLabel(
    doc: ProsemirrorNode | JSONContent,
    noteId: string,
    type: NoteType
  ): string {
    const { footnotes, endnotes } = this.extractNotes(doc);
    const list = type === "endnote" ? endnotes : footnotes;
    const found = list.find((item) => item.id === noteId);
    return found ? found.label : (type === "endnote" ? "i" : "1");
  }

  /**
   * Chèn một chú thích ngữ nghĩa (Footnote hoặc Endnote) tại vị trí con trỏ hiện tại
   */
  public static insertNote(
    editor: Editor,
    type: NoteType,
    initialContent = ""
  ): ReferenceCommandResult {
    if (!editor || !editor.view) {
      return {
        success: false,
        itemType: type === "footnote" ? "insertFootnote" : "insertEndnote",
        message: "Editor chưa sẵn sàng để chèn chú thích.",
      };
    }

    const { state, view } = editor;
    const { tr } = state;

    const noteNodeType = state.schema.nodes.noteReference;
    if (!noteNodeType) {
      return {
        success: false,
        itemType: type === "footnote" ? "insertFootnote" : "insertEndnote",
        message: "Lược đồ (Schema) của tài liệu chưa hỗ trợ node noteReference.",
      };
    }

    const noteId = this.generateNoteId(type);

    const noteNode = noteNodeType.create({
      noteId,
      noteType: type,
      content: initialContent,
    });

    // Thay thế vùng chọn hoặc chèn tại caret
    tr.replaceSelectionWith(noteNode);
    view.dispatch(tr);

    // Kích hoạt giao diện hiển thị chú thích bên lề
    try {
      const store = useReferencesStore.getState();
      store.openReferencePanel("notes");
      store.setSelectedReferenceId(noteId);
    } catch {
      // Bỏ qua nếu store chưa gắn kết trong headless test
    }

    return {
      success: true,
      itemType: type === "footnote" ? "insertFootnote" : "insertEndnote",
      message: `Đã chèn ${type === "footnote" ? "Footnote" : "Endnote"} thành công.`,
      details: { noteId, noteType: type },
    };
  }

  /**
   * Cập nhật nội dung văn bản của một chú thích thông qua ProseMirror Transaction
   * Giúp việc chỉnh sửa note ghi nhận vào Undo/Redo và dirty state.
   */
  public static updateNoteContent(
    editor: Editor,
    noteId: string,
    content: string
  ): ReferenceCommandResult {
    if (!editor || !editor.view) {
      return {
        success: false,
        itemType: "showNotes",
        message: "Editor chưa sẵn sàng.",
      };
    }

    const { state, view } = editor;
    let targetPos: number | null = null;
    let targetNode: ProsemirrorNode | null = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === "noteReference" && node.attrs.noteId === noteId) {
        targetPos = pos;
        targetNode = node;
        return false;
      }
    });

    if (targetPos === null || !targetNode) {
      return {
        success: false,
        itemType: "showNotes",
        message: `Không tìm thấy chú thích có ID "${noteId}".`,
      };
    }

    const tr = state.tr.setNodeMarkup(targetPos, undefined, {
      ...(targetNode as ProsemirrorNode).attrs,
      content,
    });

    view.dispatch(tr);

    return {
      success: true,
      itemType: "showNotes",
      message: "Đã cập nhật nội dung chú thích thành công.",
      details: { noteId, content },
    };
  }

  /**
   * Xóa một chú thích khỏi tài liệu
   * Gỡ bỏ cả marker reference và nội dung, hoàn toàn không để lại orphan metadata.
   */
  public static deleteNote(editor: Editor, noteId: string): ReferenceCommandResult {
    if (!editor || !editor.view) {
      return {
        success: false,
        itemType: "showNotes",
        message: "Editor chưa sẵn sàng.",
      };
    }

    const { state, view } = editor;
    let targetPos: number | null = null;
    let targetNode: ProsemirrorNode | null = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === "noteReference" && node.attrs.noteId === noteId) {
        targetPos = pos;
        targetNode = node;
        return false;
      }
    });

    if (targetPos === null || !targetNode) {
      return {
        success: false,
        itemType: "showNotes",
        message: `Không tìm thấy chú thích có ID "${noteId}".`,
      };
    }

    const nodeSize = (targetNode as ProsemirrorNode).nodeSize;
    const tr = state.tr.delete(targetPos, targetPos + nodeSize);
    view.dispatch(tr);

    return {
      success: true,
      itemType: "showNotes",
      message: "Đã xóa chú thích khỏi tài liệu.",
      details: { noteId },
    };
  }

  /**
   * Điều hướng con trỏ từ danh sách Note trở lại vị trí marker trong tài liệu
   */
  public static navigateToNoteReference(editor: Editor, noteId: string): ReferenceCommandResult {
    if (!editor || !editor.view) {
      return {
        success: false,
        itemType: "showNotes",
        message: "Editor chưa sẵn sàng.",
      };
    }

    const { state, view } = editor;
    let targetPos: number | null = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === "noteReference" && node.attrs.noteId === noteId) {
        targetPos = pos;
        return false;
      }
    });

    if (targetPos === null) {
      return {
        success: false,
        itemType: "showNotes",
        message: `Không tìm thấy vị trí tham chiếu của chú thích "${noteId}".`,
      };
    }

    try {
      editor.commands.focus();
      const sel = TextSelection.create(state.doc, targetPos);
      view.dispatch(state.tr.setSelection(sel));

      // Cuộn tới phần tử DOM nếu có
      if (typeof document !== "undefined") {
        const el = document.querySelector(`sup.editor-note-reference[data-note-id="${noteId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    } catch {
      // Fallback an toàn nếu môi trường test không có layout DOM
    }

    return {
      success: true,
      itemType: "showNotes",
      message: "Đã chuyển đến vị trí tham chiếu của chú thích.",
      details: { noteId, pos: targetPos },
    };
  }

  /**
   * Điều hướng từ marker tới phần hiển thị của Note (trong panel bên lề hoặc chân trang)
   */
  public static navigateToNote(
    _editor: Editor,
    noteId: string,
    _type: NoteType
  ): ReferenceCommandResult {
    try {
      const store = useReferencesStore.getState();
      store.openReferencePanel("notes");
      store.setSelectedReferenceId(noteId);

      if (typeof document !== "undefined") {
        const noteCard = document.getElementById(`note-item-${noteId}`);
        if (noteCard) {
          noteCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
          const textarea = noteCard.querySelector("textarea, input");
          if (textarea instanceof HTMLElement) {
            textarea.focus();
          }
        }
      }
    } catch {
      // Bỏ qua nếu môi trường test
    }

    return {
      success: true,
      itemType: "showNotes",
      message: "Đã điều hướng tới chú thích.",
      details: { noteId },
    };
  }

  /**
   * Điều hướng tới chú thích tiếp theo (Next Footnote / Next Note)
   */
  public static navigateToNextNote(
    editor: Editor,
    type: NoteType = "footnote"
  ): ReferenceCommandResult {
    if (!editor || !editor.view) {
      return {
        success: false,
        itemType: "nextFootnote",
        message: "Editor chưa sẵn sàng.",
      };
    }

    const { state, view } = editor;
    const currentPos = state.selection.from;
    const { footnotes, endnotes } = this.extractNotes(state.doc);
    const targetList = type === "endnote" ? endnotes : footnotes;

    if (targetList.length === 0) {
      return {
        success: false,
        itemType: "nextFootnote",
        message: `Tài liệu chưa có ${type === "footnote" ? "Footnote" : "Endnote"} nào.`,
      };
    }

    // Tìm note có pos > currentPos
    const nextNote = targetList.find((n) => n.pos !== undefined && n.pos > currentPos);
    const chosenNote = nextNote || targetList[0]; // Vòng lại đầu tài liệu nếu ở cuối

    if (chosenNote.pos !== undefined) {
      editor.commands.focus();
      const sel = TextSelection.create(state.doc, chosenNote.pos);
      view.dispatch(state.tr.setSelection(sel));

      if (typeof document !== "undefined") {
        const el = document.querySelector(
          `sup.editor-note-reference[data-note-id="${chosenNote.id}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }

      try {
        useReferencesStore.getState().setSelectedReferenceId(chosenNote.id);
      } catch {
        // Safe fallback
      }
    }

    return {
      success: true,
      itemType: "nextFootnote",
      message: `Đã di chuyển tới ${type === "footnote" ? "Footnote" : "Endnote"} số ${chosenNote.label}.`,
      details: { noteId: chosenNote.id, number: chosenNote.number },
    };
  }

  /**
   * Điều hướng tới chú thích phía trước (Previous Footnote / Previous Note)
   */
  public static navigateToPreviousNote(
    editor: Editor,
    type: NoteType = "footnote"
  ): ReferenceCommandResult {
    if (!editor || !editor.view) {
      return {
        success: false,
        itemType: "previousFootnote",
        message: "Editor chưa sẵn sàng.",
      };
    }

    const { state, view } = editor;
    const currentPos = state.selection.from;
    const { footnotes, endnotes } = this.extractNotes(state.doc);
    const targetList = type === "endnote" ? endnotes : footnotes;

    if (targetList.length === 0) {
      return {
        success: false,
        itemType: "previousFootnote",
        message: `Tài liệu chưa có ${type === "footnote" ? "Footnote" : "Endnote"} nào.`,
      };
    }

    // Tìm note có pos < currentPos gần nhất
    const prevNotes = targetList.filter((n) => n.pos !== undefined && n.pos < currentPos);
    const chosenNote = prevNotes.length > 0 ? prevNotes[prevNotes.length - 1] : targetList[targetList.length - 1];

    if (chosenNote.pos !== undefined) {
      editor.commands.focus();
      const sel = TextSelection.create(state.doc, chosenNote.pos);
      view.dispatch(state.tr.setSelection(sel));

      if (typeof document !== "undefined") {
        const el = document.querySelector(
          `sup.editor-note-reference[data-note-id="${chosenNote.id}"]`
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }

      try {
        useReferencesStore.getState().setSelectedReferenceId(chosenNote.id);
      } catch {
        // Safe fallback
      }
    }

    return {
      success: true,
      itemType: "previousFootnote",
      message: `Đã di chuyển tới ${type === "footnote" ? "Footnote" : "Endnote"} số ${chosenNote.label}.`,
      details: { noteId: chosenNote.id, number: chosenNote.number },
    };
  }

  /**
   * Lấy số trang gắn neo của một chú thích (Footnote/Endnote)
   * Phục vụ tương thích tham chiếu chéo và future footnote integration (Phase 10).
   *
   * Hạn chế trung thực (Honest limitation):
   * Trong giai đoạn này, Footnotes chưa có cơ chế chia cắt layout động ở đáy từng trang riêng biệt
   * (Bottom-of-page Flow Box). Hàm này xác định trang của dấu neo (Note Reference Marker) trong văn bản.
   */
  public static getPageForNote(
    noteId: string,
    doc?: ProsemirrorNode | JSONContent,
    layoutMap?: PageLayoutMap | null
  ): number {
    if (!doc || !noteId) return 1;
    const { all } = this.extractNotes(doc);
    const note = all.find((n) => n.id === noteId);
    if (!note || note.pos === undefined) return 1;

    let effectiveLayout = layoutMap || usePaginationStore.getState().layoutMap;
    if (!effectiveLayout && doc) {
      try {
        const json =
          doc && typeof (doc as any).toJSON === "function"
            ? (doc as any).toJSON()
            : doc;
        if (json && typeof json === "object") {
          effectiveLayout = buildPageLayoutMap(json, DEFAULT_PAGE_SETTINGS);
        }
      } catch {
        // Fallback
      }
    }

    return effectiveLayout ? effectiveLayout.getPageNumberForPosition(note.pos) : 1;
  }
}
