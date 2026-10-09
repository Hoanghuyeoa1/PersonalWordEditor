import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { TrackChangesService } from "./trackChangesService.ts";

import {
  processBlockAccept,
  processBlockReject,
  processInlineAccept,
  processInlineReject,
  processBulkAcceptAll,
  processBulkRejectAll,
  processBulkAcceptFormatting,
  processBulkRejectFormatting,
} from "./formattingReviewLifecycle.ts";

export interface TrackChangeMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    trackChange: {
      /**
       * Gắn mark trackChange vào vùng chọn hiện tại.
       */
      setTrackChange: (attrs: {
        id: string;
        changeType: "insert" | "delete" | "format";
        author?: string;
        timestamp?: string;
        scope?: "character" | "paragraph" | "style";
        formatChanges?: any[];
        formatDetails?: string;
        status?: "pending" | "accepted" | "rejected";
        targetNodeId?: string;
      }) => ReturnType;
      /**
       * Gắn mark formatting revision với đầy đủ metadata diff
       */
      setTrackedFormatting: (attrs: {
        id: string;
        author?: string;
        timestamp?: string;
        scope?: "character" | "paragraph" | "style";
        formatChanges?: any[];
        formatDetails?: string;
        status?: "pending" | "accepted" | "rejected";
        targetNodeId?: string;
      }) => ReturnType;
      /**
       * Gỡ bỏ mark trackChange có id tương ứng trên toàn bộ tài liệu.
       */
      unsetTrackChange: (id: string) => ReturnType;
      /**
       * Chèn văn bản có theo dõi Track Changes
       */
      insertTrackedText: (text: string, author?: string) => ReturnType;
      /**
       * Đánh dấu xóa vùng chọn có theo dõi Track Changes
       */
      deleteTrackedSelection: (author?: string) => ReturnType;
      /**
       * Backspace có theo dõi Track Changes
       */
      backspaceTracked: (author?: string) => ReturnType;
      /**
       * Delete forward có theo dõi Track Changes
       */
      deleteForwardTracked: (author?: string) => ReturnType;
      /**
       * Paste có theo dõi Track Changes
       */
      pasteTrackedText: (text: string, author?: string) => ReturnType;
      /**
       * Chấp nhận một thay đổi (Accept Change) - Phase 5.6
       */
      acceptChange: (changeId?: string) => ReturnType;
      /**
       * Từ chối một thay đổi (Reject Change) - Phase 5.6
       */
      rejectChange: (changeId?: string) => ReturnType;
      /**
       * Chấp nhận toàn bộ thay đổi (Accept All Changes) - Phase 5.6 & Phase 7
       */
      acceptAllChanges: () => ReturnType;
      /**
       * Từ chối toàn bộ thay đổi (Reject All Changes) - Phase 5.6 & Phase 7
       */
      rejectAllChanges: () => ReturnType;
      /**
       * Chấp nhận toàn bộ thay đổi định dạng (Accept All Formatting) - Phase 7
       */
      acceptAllFormattingChanges: () => ReturnType;
      /**
       * Từ chối toàn bộ thay đổi định dạng (Reject All Formatting) - Phase 7
       */
      rejectAllFormattingChanges: () => ReturnType;
    };
  }
}

function generateChangeId(): string {
  return `change-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function getCurrentAuthor(): string {
  return "Author";
}

/**
 * TrackChangeExtension (Phase 5.5 - Track Changes Core & Track Changes 2.0)
 *
 * Mark semantic để ghi nhận mọi thay đổi (thêm mới / xóa bỏ / định dạng) khi chế độ
 * Track Changes đang BẬT.
 *
 * - type: "insert" -> Văn bản thêm mới (gạch chân / màu xanh)
 * - type: "delete" -> Văn bản bị xóa (gạch ngang / màu đỏ, không biến mất khỏi AST)
 * - type: "format" -> Thay đổi định dạng (gạch chấm / metadata diff before-after)
 * - Co-exist với mọi formatting mark khác (bold, italic, font, highlight, comments...)
 * - Tương thích 100% với Undo/Redo nguyên bản của ProseMirror
 */
export const TrackChangeExtension = Mark.create<TrackChangeMarkOptions>({
  name: "trackChange",

  // Cho phép cùng tồn tại với các marks định dạng khác (Bold, Italic, Strike, Comment, v.v.)
  excludes: "",

  spanning: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-change-id"),
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { "data-change-id": attributes.id };
        },
      },
      changeType: {
        default: "insert",
        parseHTML: (element) => element.getAttribute("data-change-type") || "insert",
        renderHTML: (attributes) => {
          const cType = attributes.changeType || "insert";
          return {
            "data-change-type": cType,
            class: `track-change track-${cType}`,
          };
        },
      },
      author: {
        default: "Author",
        parseHTML: (element) => element.getAttribute("data-author") || "Author",
        renderHTML: (attributes) => {
          if (!attributes.author) return {};
          return { "data-author": attributes.author };
        },
      },
      timestamp: {
        default: () => new Date().toISOString(),
        parseHTML: (element) => element.getAttribute("data-timestamp") || new Date().toISOString(),
        renderHTML: (attributes) => {
          if (!attributes.timestamp) return {};
          return { "data-timestamp": attributes.timestamp };
        },
      },
      scope: {
        default: "character",
        parseHTML: (element) => (element.getAttribute("data-format-scope") as any) || "character",
        renderHTML: (attributes) => {
          if (!attributes.scope) return {};
          return { "data-format-scope": attributes.scope };
        },
      },
      formatChanges: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-format-changes");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => {
          if (!attributes.formatChanges) return {};
          const val =
            typeof attributes.formatChanges === "string"
              ? attributes.formatChanges
              : JSON.stringify(attributes.formatChanges);
          return { "data-format-changes": val };
        },
      },
      formatDetails: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-format-details") || null,
        renderHTML: (attributes) => {
          if (!attributes.formatDetails) return {};
          return { "data-format-details": attributes.formatDetails };
        },
      },
      status: {
        default: "pending",
        parseHTML: (element) => (element.getAttribute("data-revision-status") as any) || "pending",
        renderHTML: (attributes) => {
          if (!attributes.status || attributes.status === "pending") return {};
          return { "data-revision-status": attributes.status };
        },
      },
      targetNodeId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-node-id") || null,
        renderHTML: (attributes) => {
          if (!attributes.targetNodeId) return {};
          return { "data-target-node-id": attributes.targetNodeId };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-change-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const changeType = HTMLAttributes["data-change-type"] || "insert";
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: `track-change track-${changeType}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setTrackChange:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, {
            id: attrs.id,
            changeType: attrs.changeType,
            author: attrs.author || getCurrentAuthor(),
            timestamp: attrs.timestamp || new Date().toISOString(),
            scope: attrs.scope || "character",
            formatChanges: attrs.formatChanges || null,
            formatDetails: attrs.formatDetails || null,
            status: attrs.status || "pending",
            targetNodeId: attrs.targetNodeId || null,
          });
        },

      setTrackedFormatting:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, {
            id: attrs.id,
            changeType: "format",
            author: attrs.author || getCurrentAuthor(),
            timestamp: attrs.timestamp || new Date().toISOString(),
            scope: attrs.scope || "character",
            formatChanges: attrs.formatChanges || null,
            formatDetails: attrs.formatDetails || null,
            status: attrs.status || "pending",
            targetNodeId: attrs.targetNodeId || null,
          });
        },

      unsetTrackChange:
        (changeId: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state;
          const markType = state.schema.marks[this.name];
          if (!markType) return false;

          let found = false;
          doc.descendants((node, pos) => {
            if (!node.isText) return;
            const mark = node.marks.find(
              (m) => m.type === markType && m.attrs.id === changeId
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

      insertTrackedText:
        (text: string, author = "Author") =>
        ({ tr, state }) => {
          const markType = state.schema.marks.trackChange;
          if (!markType) return false;

          const { from, to } = state.selection;
          const timestamp = new Date().toISOString();

          if (from < to) {
            const delId = generateChangeId();
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(from, to, delMark);

            const insId = generateChangeId();
            const insMark = markType.create({ id: insId, changeType: "insert", author, timestamp });
            tr.insertText(text, to);
            tr.addMark(to, to + text.length, insMark);
            tr.removeMark(to, to + text.length, delMark);
            tr.setSelection(TextSelection.create(tr.doc, to + text.length));
            return true;
          }

          let insId = generateChangeId();
          if (from > 1) {
            const $prev = state.doc.resolve(from - 1);
            const prevMarks = $prev.marks();
            const prevInsMark = prevMarks.find(
              (m: any) => m.type === markType && m.attrs.changeType === "insert"
            );
            if (prevInsMark) {
              insId = prevInsMark.attrs.id;
            }
          }

          const insMark = markType.create({ id: insId, changeType: "insert", author, timestamp });
          tr.insertText(text, from);
          tr.removeMark(from, from + text.length, markType);
          tr.addMark(from, from + text.length, insMark);
          tr.setSelection(TextSelection.create(tr.doc, from + text.length));
          return true;
        },

      deleteTrackedSelection:
        (author = "Author") =>
        ({ tr, state }) => {
          const markType = state.schema.marks.trackChange;
          if (!markType) return false;

          const { empty, from, to } = state.selection;
          if (empty) return false;

          const timestamp = new Date().toISOString();
          const delId = generateChangeId();
          const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
          tr.addMark(from, to, delMark);
          tr.setSelection(TextSelection.create(tr.doc, to));
          return true;
        },

      backspaceTracked:
        (author = "Author") =>
        ({ tr, state }) => {
          const markType = state.schema.marks.trackChange;
          if (!markType) return false;

          const { empty, from, to } = state.selection;
          const timestamp = new Date().toISOString();

          if (!empty) {
            const delId = generateChangeId();
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(from, to, delMark);
            tr.setSelection(TextSelection.create(tr.doc, to));
            return true;
          }

          if (from <= 1) return false;

          let targetPos = -1;
          for (let p = from - 1; p >= 1; p--) {
            const $p = state.doc.resolve(p);
            const marks = $p.marks();
            const isAlreadyDel = marks.some(
              (m: any) => m.type === markType && m.attrs.changeType === "delete"
            );
            if (!isAlreadyDel) {
              targetPos = p;
              break;
            }
          }

          if (targetPos === -1) return true;

          const delId = generateChangeId();
          const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
          tr.addMark(targetPos, targetPos + 1, delMark);
          tr.setSelection(TextSelection.create(tr.doc, targetPos));
          return true;
        },

      deleteForwardTracked:
        (author = "Author") =>
        ({ tr, state }) => {
          const markType = state.schema.marks.trackChange;
          if (!markType) return false;

          const { empty, from, to } = state.selection;
          const timestamp = new Date().toISOString();

          if (!empty) {
            const delId = generateChangeId();
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(from, to, delMark);
            tr.setSelection(TextSelection.create(tr.doc, to));
            return true;
          }

          const docSize = state.doc.content.size;
          if (from >= docSize - 1) return false;

          let targetPos = -1;
          for (let p = from; p < docSize - 1; p++) {
            const $p = state.doc.resolve(p + 1);
            const marks = $p.marks();
            const isAlreadyDel = marks.some(
              (m: any) => m.type === markType && m.attrs.changeType === "delete"
            );
            if (!isAlreadyDel) {
              targetPos = p;
              break;
            }
          }

          if (targetPos === -1) return true;

          const delId = generateChangeId();
          const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
          tr.addMark(targetPos, targetPos + 1, delMark);
          return true;
        },

      pasteTrackedText:
        (text: string, author = "Author") =>
        ({ tr, state, dispatch }) => {
          const markType = state.schema.marks.trackChange;
          if (!markType) return false;

          const { empty, from, to } = state.selection;
          const timestamp = new Date().toISOString();

          let insertPos = from;
          if (!empty) {
            const delId = generateChangeId();
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(from, to, delMark);
            insertPos = to;
          }

          const insId = generateChangeId();
          const insMark = markType.create({ id: insId, changeType: "insert", author, timestamp });
          tr.insertText(text, insertPos);
          tr.removeMark(insertPos, insertPos + text.length, markType);
          tr.addMark(insertPos, insertPos + text.length, insMark);
          tr.setSelection(TextSelection.create(tr.doc, insertPos + text.length));
          if (dispatch) dispatch(tr);
          return true;
        },

      acceptChange:
        (changeId?: string) =>
        ({ tr, state }) => {
          const targetId = changeId || TrackChangesService.resolveTargetChangeIdFromState(state);
          if (!targetId) return false;

          closeHistory(tr);
          tr.setMeta("trackChangeOperation", { type: "accept", targetId });
          const blockHandled = processBlockAccept(tr, state, targetId);
          const inlineHandled = processInlineAccept(tr, state, targetId);

          return blockHandled || inlineHandled;
        },

      rejectChange:
        (changeId?: string) =>
        ({ tr, state }) => {
          const targetId = changeId || TrackChangesService.resolveTargetChangeIdFromState(state);
          if (!targetId) return false;

          closeHistory(tr);
          tr.setMeta("trackChangeOperation", { type: "reject", targetId });
          const blockHandled = processBlockReject(tr, state, targetId);
          const inlineHandled = processInlineReject(tr, state, targetId);

          return blockHandled || inlineHandled;
        },

      acceptAllChanges:
        () =>
        ({ tr, state }) => {
          closeHistory(tr);
          tr.setMeta("trackChangeOperation", { type: "acceptAll" });
          return processBulkAcceptAll(tr, state);
        },

      rejectAllChanges:
        () =>
        ({ tr, state }) => {
          closeHistory(tr);
          tr.setMeta("trackChangeOperation", { type: "rejectAll" });
          return processBulkRejectAll(tr, state);
        },

      acceptAllFormattingChanges:
        () =>
        ({ tr, state }) => {
          closeHistory(tr);
          tr.setMeta("trackChangeOperation", { type: "acceptAllFormatting" });
          return processBulkAcceptFormatting(tr, state);
        },

      rejectAllFormattingChanges:
        () =>
        ({ tr, state }) => {
          closeHistory(tr);
          tr.setMeta("trackChangeOperation", { type: "rejectAllFormatting" });
          return processBulkRejectFormatting(tr, state);
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleTextInput: (view, from, to, text) => {
            return TrackChangesService.applyTrackedTextInput(view, from, to, text);
          },

          handleKeyDown: (view, event) => {
            return TrackChangesService.applyTrackedKeyDown(view, event);
          },

          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;
            return TrackChangesService.applyTrackedPaste(view, text);
          },

          handleDOMEvents: {
            cut: (view, event) => {
              const text = TrackChangesService.applyTrackedCut(view);
              if (text !== null) {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(text).catch(() => {});
                }
                event.preventDefault();
                return true;
              }
              return false;
            },
          },

          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement | null;
            const changeSpan = target?.closest("[data-change-id]");
            let foundChangeId: string | null = null;

            if (changeSpan) {
              foundChangeId = changeSpan.getAttribute("data-change-id");
            } else {
              const $pos = view.state.doc.resolve(pos);
              const mark = $pos.marks().find((m) => m.type.name === "trackChange");
              if (mark?.attrs?.id) {
                foundChangeId = mark.attrs.id;
              } else {
                for (let d = $pos.depth; d > 0; d--) {
                  const ancestor = $pos.node(d);
                  if (ancestor.attrs && Array.isArray(ancestor.attrs.formatRevisions) && ancestor.attrs.formatRevisions.length > 0) {
                    foundChangeId = ancestor.attrs.formatRevisions[ancestor.attrs.formatRevisions.length - 1].id;
                    break;
                  }
                }
              }
            }

            if (foundChangeId) {
              useReviewStore.getState().setActiveChangeId(foundChangeId);
              if (typeof document !== "undefined") {
                document.querySelectorAll(".track-change.track-active").forEach((el) => {
                  el.classList.remove("track-active");
                });
                document.querySelectorAll(`[data-change-id="${foundChangeId}"]`).forEach((el) => {
                  el.classList.add("track-active");
                });
              }
            }

            return false;
          },
        },
      }),

      // History & Document State Synchronization Plugin (Phase 9)
      // Tự động đồng bộ useDocumentStore.trackedChanges và activeChangeId sau mọi transaction
      // (Bao gồm Undo, Redo, typing, formatting, accept, reject)
      new Plugin({
        key: new PluginKey("trackChangesHistorySync"),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (oldState.doc.eq(newState.doc)) return null;

          // 1. Đồng bộ danh sách trackedChanges trong store với AST thực tế
          TrackChangesService.syncTrackedChangesStore(newState.doc);

          // 2. Reconcile activeChangeId nếu ID hiện tại không còn tồn tại trong tài liệu
          const activeId = useReviewStore.getState().activeChangeId;
          if (activeId) {
            const spans = TrackChangesService.getTrackedSpansFromPMDoc(newState.doc);
            if (!spans.some((s) => s.id === activeId)) {
              useReviewStore.getState().setActiveChangeId(spans.length > 0 ? spans[0].id : null);
            }
          }

          return null;
        },
      }),
    ];
  },
});
