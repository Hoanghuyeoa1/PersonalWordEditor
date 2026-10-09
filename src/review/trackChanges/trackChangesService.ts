import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import type { TrackingState } from "../types/reviewTypes.ts";
import type {
  TrackChangeItem,
  TrackChangeType,
  FormattingRevisionScope,
  FormattingRevisionDetails,
  FormattingPropertyDiff,
  RevisionStatus,
} from "../../document/documentTypes.ts";
import { useReviewStore, type ReviewChangesFilter } from "../../stores/reviewStore.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import {
  FormattingDiffService,
  generateFormattingRevisionId,
} from "./formattingDiffService.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
} from "../../styles/services/builtInStyles.ts";

export interface TrackChangeSpan {
  id: string;
  type: TrackChangeType;
  author: string;
  timestamp: string;
  from: number;
  to: number;
  text: string;
  scope?: FormattingRevisionScope;
  formatDetails?: string;
  formatChange?: FormattingRevisionDetails;
  propertyDiffs?: FormattingPropertyDiff[];
  status?: RevisionStatus;
  targetNodeId?: string;
}

function generateChangeId(): string {
  return `change-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function getCurrentAuthor(): string {
  try {
    const user = useReviewStore.getState().currentUser;
    if (user?.name) return user.name;
  } catch {}
  return "Author";
}

/**
 * Kiểm tra xem một transaction có nguồn gốc từ Review Operation (Accept/Reject)
 * hoặc ProseMirror History (Undo/Redo) để phòng ngừa feedback loop / transaction loop.
 */
export function isReviewOrHistoryTransaction(tr: any): boolean {
  if (!tr) return false;
  if (tr.getMeta("trackChangeOperation")) return true;
  if (tr.getMeta("trackChangeRevision")) return true;
  if (tr.getMeta("history$")) return true;
  if (tr.getMeta("isUndoRedo")) return true;
  return false;
}

function executeWithContext<T>(
  ctx: any,
  callback: (state: any, tr: any, dispatch: (tr: any) => void) => T
): T | false {
  if (!ctx) return false;

  // 1. Nếu ctx là EditorView hoặc đối tượng có state & dispatch trực tiếp
  if (ctx.state && typeof ctx.dispatch === "function") {
    const tr = ctx.state.tr;
    return callback(ctx.state, tr, ctx.dispatch);
  }

  // 2. Nếu ctx là Editor Tiptap
  if (typeof ctx.commands?.command === "function") {
    let result: any = false;
    ctx.commands.command(({ tr, dispatch, state }: any) => {
      result = callback(state, tr, dispatch);
      return Boolean(result);
    });
    return result;
  }

  if (ctx.view && typeof ctx.view.dispatch === "function") {
    const tr = ctx.state.tr;
    return callback(ctx.state, tr, ctx.view.dispatch.bind(ctx.view));
  }

  return false;
}

function arePropertyDiffsEqual(
  a: FormattingPropertyDiff[],
  b: FormattingPropertyDiff[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const da = a[i];
    const db = b.find((x) => x.property === da.property);
    if (!db) return false;
    if (!FormattingDiffService.areValuesEqual(da.property, da.before, db.before)) return false;
    if (!FormattingDiffService.areValuesEqual(da.property, da.after, db.after)) return false;
  }
  return true;
}

/**
 * Track Changes Service - Personal Word Editor (Phase 5.5 Architecture)
 *
 * Cung cấp các tiện ích xử lý Track Changes:
 * - Trích xuất danh sách thay đổi từ ProseMirror Node hoặc JSON AST
 * - Định vị phạm vi (from/to) của thay đổi trong tài liệu
 * - Điều hướng: Next Change / Previous Change
 * - Thống kê số lượng thay đổi (insertions, deletions)
 * - Xử lý input an toàn với Undo/Redo cho cả browser DOM view và Node unit tests
 */
export class TrackChangesService {
  /**
   * Tạo cấu trúc ban đầu của trạng thái theo dõi thay đổi
   */
  public static getInitialState(): TrackingState {
    return {
      trackChangesEnabled: false,
      activeChangeId: null,
      changes: [],
    };
  }

  /**
   * Thống kê các thay đổi đang chờ xử lý (Pending Changes)
   * Tương thích cả kiểu "insert" / "insertion" và "delete" / "deletion"
   */
  public static getChangesSummary(changes: Array<{ type: string }>): {
    total: number;
    insertions: number;
    deletions: number;
    formatting: number;
  } {
    const total = changes.length;
    const insertions = changes.filter(
      (c) => c.type === "insert" || c.type === "insertion"
    ).length;
    const deletions = changes.filter(
      (c) => c.type === "delete" || c.type === "deletion"
    ).length;
    const formatting = changes.filter((c) => c.type === "format").length;

    return { total, insertions, deletions, formatting };
  }

  /**
   * Áp dụng nhập văn bản (Text Input) có theo dõi Track Changes
   */
  public static applyTrackedTextInput(
    ctx: any,
    from: number,
    to: number,
    text: string,
    author = "Author"
  ): boolean {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return false;

    if (ctx && typeof ctx.commands?.insertTrackedText === "function") {
      return ctx
        .chain()
        .setTextSelection({ from, to })
        .insertTrackedText(text, author)
        .run();
    }

    return Boolean(
      executeWithContext(ctx, (state, tr, dispatch) => {
        const markType = state.schema.marks.trackChange;
        if (!markType) return false;

        const timestamp = new Date().toISOString();

        if (from < to) {
          // Vùng chọn không rỗng: đánh dấu đoạn chọn là delete
          const delId = generateChangeId();
          const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
          tr.addMark(from, to, delMark);

          // Chèn text mới sau vùng bị xóa với insert mark
          const insId = generateChangeId();
          const insMark = markType.create({ id: insId, changeType: "insert", author, timestamp });
          tr.insertText(text, to);
          tr.addMark(to, to + text.length, insMark);
          tr.removeMark(to, to + text.length, delMark);
          tr.setSelection(TextSelection.create(tr.doc, to + text.length));
          if (dispatch) dispatch(tr);
          return true;
        }

        // Vùng chọn rỗng: kiểm tra ký tự trước đó có đang là tracked insert không để gộp id
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
        if (dispatch) dispatch(tr);
        return true;
      })
    );
  }

  /**
   * Áp dụng phím nhấn Backspace / Delete hoặc phím tắt định dạng có theo dõi Track Changes
   */
  public static applyTrackedKeyDown(ctx: any, keyOrEvent: any, author = "Author"): boolean {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return false;

    // 1. Kiểm tra nếu là phím tắt định dạng ký tự (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X, Alt+Shift+5)
    if (typeof keyOrEvent === "object" && keyOrEvent !== null) {
      const isCtrlOrMeta = Boolean(keyOrEvent.ctrlKey || keyOrEvent.metaKey);
      const k = (keyOrEvent.key || "").toLowerCase();

      if (isCtrlOrMeta) {
        if (!keyOrEvent.shiftKey && !keyOrEvent.altKey) {
          if (k === "b") return this.handleTrackedKeyboardShortcut(ctx, "bold", author);
          if (k === "i") return this.handleTrackedKeyboardShortcut(ctx, "italic", author);
          if (k === "u") return this.handleTrackedKeyboardShortcut(ctx, "underline", author);
        }
        if (
          (keyOrEvent.shiftKey && k === "x") ||
          (keyOrEvent.altKey && keyOrEvent.shiftKey && k === "5")
        ) {
          return this.handleTrackedKeyboardShortcut(ctx, "strike", author);
        }
      }
    }

    const key = typeof keyOrEvent === "string" ? keyOrEvent : keyOrEvent?.key;
    if (!key) return false;

    if (key === "Backspace" && typeof ctx?.commands?.backspaceTracked === "function") {
      return ctx.commands.backspaceTracked(author);
    }
    if (key === "Delete" && typeof ctx?.commands?.deleteForwardTracked === "function") {
      return ctx.commands.deleteForwardTracked(author);
    }
    if (key === "Enter") {
      const state = ctx?.state;
      if (state && !state.selection.empty) {
        if (typeof ctx?.chain === "function" && typeof ctx?.commands?.deleteTrackedSelection === "function") {
          return ctx.chain().deleteTrackedSelection(author).splitBlock().run();
        }
      } else {
        return false;
      }
    }

    return Boolean(
      executeWithContext(ctx, (state, tr, dispatch) => {
        const markType = state.schema.marks.trackChange;
        if (!markType) return false;

        const { empty, from, to } = state.selection;
        const timestamp = new Date().toISOString();

        if (key === "Enter") {
          if (!empty) {
            const delId = generateChangeId();
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(from, to, delMark);
            tr.setSelection(TextSelection.create(tr.doc, to));
            try {
              tr.split(to);
            } catch {
              // fallback an toàn nếu vị trí to không thể split trực tiếp
            }
            if (dispatch) dispatch(tr);
            return true;
          }
          return false;
        }

        if (key === "Backspace") {
          if (!empty) {
            const delId = generateChangeId();
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(from, to, delMark);
            tr.setSelection(TextSelection.create(tr.doc, to));
            if (dispatch) dispatch(tr);
            return true;
          } else {
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
            if (dispatch) dispatch(tr);
            return true;
          }
        }

        if (key === "Delete") {
          if (!empty) {
            const delId = generateChangeId();
            const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });
            tr.addMark(from, to, delMark);
            tr.setSelection(TextSelection.create(tr.doc, to));
            if (dispatch) dispatch(tr);
            return true;
          } else {
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
            if (dispatch) dispatch(tr);
            return true;
          }
        }

        return false;
      })
    );
  }

  /**
   * Áp dụng dán văn bản (Paste) có theo dõi Track Changes
   */
  public static applyTrackedPaste(ctx: any, text: string, author = "Author"): boolean {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return false;

    if (typeof ctx?.commands?.pasteTrackedText === "function") {
      return ctx.commands.pasteTrackedText(text, author);
    }

    return Boolean(
      executeWithContext(ctx, (state, tr, dispatch) => {
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
      })
    );
  }

  /**
   * Áp dụng cắt văn bản (Cut) có theo dõi Track Changes
   */
  public static applyTrackedCut(ctx: any, author = "Author"): string | null {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return null;

    if (typeof ctx?.commands?.deleteTrackedSelection === "function") {
      const state = ctx.state;
      if (state && !state.selection.empty) {
        const cutText = state.doc.textBetween(state.selection.from, state.selection.to, "\n");
        ctx.commands.deleteTrackedSelection(author);
        return cutText;
      }
    }

    let cutText: string | null = null;
    executeWithContext(ctx, (state, tr, dispatch) => {
      const { empty, from, to } = state.selection;
      if (empty) return false;

      const markType = state.schema.marks.trackChange;
      if (!markType) return false;

      cutText = state.doc.textBetween(from, to, "\n");
      const timestamp = new Date().toISOString();
      const delId = generateChangeId();
      const delMark = markType.create({ id: delId, changeType: "delete", author, timestamp });

      tr.addMark(from, to, delMark);
      tr.setSelection(TextSelection.create(tr.doc, to));
      if (dispatch) dispatch(tr);
      return true;
    });

    return cutText;
  }

  /**
   * Trích xuất danh sách tất cả các spans thay đổi từ ProseMirror Doc
   */
  public static getTrackedSpansFromPMDoc(doc: PMNode): TrackChangeSpan[] {
    const spans: TrackChangeSpan[] = [];

    doc.descendants((node, pos) => {
      if (!node.isText) {
        if (node.attrs && Array.isArray(node.attrs.formatRevisions)) {
          for (const rev of node.attrs.formatRevisions) {
            if (!rev || !rev.id) continue;
            const diffs = rev.propertyDiffs || rev.formatChange?.changes || (Array.isArray(rev.formatChanges) ? rev.formatChanges : undefined);
            spans.push({
              id: rev.id,
              type: "format",
              author: rev.author || "Author",
              timestamp: rev.timestamp || new Date().toISOString(),
              from: pos,
              to: pos + node.nodeSize,
              text: rev.text || node.textContent || "",
              scope: rev.scope || "paragraph",
              formatDetails: rev.formatDetails || rev.formatChange?.summary,
              formatChange: rev.formatChange,
              propertyDiffs: diffs,
              status: rev.status || "pending",
              targetNodeId: rev.targetNodeId || node.attrs.nodeId,
            });
          }
        }
        return;
      }

      const trackMarks = node.marks.filter((m) => m.type.name === "trackChange");
      for (const trackMark of trackMarks) {
        if (!trackMark.attrs.id) continue;

        const id = trackMark.attrs.id as string;
        const rawType = trackMark.attrs.changeType as string;
        let type: TrackChangeType = "insert";
        if (rawType === "delete" || rawType === "deletion") {
          type = "delete";
        } else if (rawType === "format") {
          type = "format";
        }

        const author = (trackMark.attrs.author as string) || "Author";
        const timestamp = (trackMark.attrs.timestamp as string) || new Date().toISOString();
        const text = node.text || "";
        const scope = (trackMark.attrs.scope as FormattingRevisionScope) || "character";
        const formatDetails = (trackMark.attrs.formatDetails as string) || undefined;
        const status = (trackMark.attrs.status as RevisionStatus) || "pending";
        const targetNodeId = (trackMark.attrs.targetNodeId as string) || undefined;

        let formatChange: FormattingRevisionDetails | undefined = undefined;
        let diffs: FormattingPropertyDiff[] | undefined = undefined;
        if (trackMark.attrs.formatChanges) {
          const rawChanges = trackMark.attrs.formatChanges;
          if (Array.isArray(rawChanges)) {
            diffs = rawChanges;
            formatChange = {
              scope,
              changes: rawChanges,
              summary: formatDetails,
              targetNodeId,
            };
          } else if (typeof rawChanges === "object") {
            formatChange = rawChanges as FormattingRevisionDetails;
            diffs = formatChange.changes;
          }
        }

        // Kiểm tra xem có thể gộp với span liền kề cùng id không
        const last = spans[spans.length - 1];
        if (last && last.id === id && last.to === pos) {
          last.to = pos + node.nodeSize;
          last.text += text;
          if (!last.propertyDiffs && diffs) {
            last.propertyDiffs = diffs;
          }
        } else {
          spans.push({
            id,
            type,
            author,
            timestamp,
            from: pos,
            to: pos + node.nodeSize,
            text,
            scope,
            formatDetails,
            formatChange,
            propertyDiffs: diffs,
            status,
            targetNodeId,
          });
        }
      }
    });

    return spans;
  }

  /**
   * Trích xuất danh sách TrackChangeItem duy nhất từ ProseMirror Node hoặc JSON AST
   * Hỗ trợ đầy đủ: insert, delete, character format revisions, và paragraph format revisions.
   */
  public static getTrackedChangesFromDoc(doc: PMNode | JSONContent): TrackChangeItem[] {
    const map = new Map<string, TrackChangeItem>();

    // 1. Nếu là ProseMirror Node
    if (doc && typeof (doc as PMNode).descendants === "function") {
      const pmDoc = doc as PMNode;
      const spans = this.getTrackedSpansFromPMDoc(pmDoc);

      for (const span of spans) {
        const existing = map.get(span.id);
        if (existing) {
          existing.text = (existing.text || "") + span.text;
        } else {
          map.set(span.id, {
            id: span.id,
            type: span.type,
            author: span.author,
            timestamp: span.timestamp,
            text: span.text,
            scope: span.scope,
            formatDetails: span.formatDetails,
            formatChange: span.formatChange,
            status: span.status,
            targetNodeId: span.targetNodeId,
            from: span.from,
            to: span.to,
          });
        }
      }

      // Quét thêm block nodes (paragraph, heading) cho paragraph formatting revisions
      pmDoc.descendants((node, pos) => {
        if (!node.isText && node.attrs && Array.isArray(node.attrs.formatRevisions)) {
          for (const rev of node.attrs.formatRevisions) {
            if (rev && rev.id && !map.has(rev.id)) {
              map.set(rev.id, {
                ...rev,
                from: pos,
                to: pos + node.nodeSize,
              });
            }
          }
        }
      });

      return Array.from(map.values());
    }

    // 2. Nếu là JSON AST
    function traverse(node: JSONContent) {
      // 2.1 Quét text node marks
      if (node.type === "text" && Array.isArray(node.marks)) {
        for (const trackMark of node.marks) {
          if (trackMark.type === "trackChange" && trackMark.attrs?.id) {
            const id = trackMark.attrs.id as string;
            const rawType = trackMark.attrs.changeType as string;
            let type: TrackChangeType = "insert";
            if (rawType === "delete" || rawType === "deletion") {
              type = "delete";
            } else if (rawType === "format") {
              type = "format";
            }
            const author = (trackMark.attrs.author as string) || "Author";
            const timestamp = (trackMark.attrs.timestamp as string) || new Date().toISOString();
            const text = node.text || "";
            const scope = (trackMark.attrs.scope as FormattingRevisionScope) || "character";
            const formatDetails = (trackMark.attrs.formatDetails as string) || undefined;
            const status = (trackMark.attrs.status as RevisionStatus) || "pending";
            const targetNodeId = (trackMark.attrs.targetNodeId as string) || undefined;

            let formatChange: FormattingRevisionDetails | undefined = undefined;
            if (trackMark.attrs.formatChanges) {
              const rawChanges = trackMark.attrs.formatChanges;
              if (Array.isArray(rawChanges)) {
                formatChange = { scope, changes: rawChanges, summary: formatDetails, targetNodeId };
              } else if (typeof rawChanges === "object") {
                formatChange = rawChanges as FormattingRevisionDetails;
              }
            }

            const existing = map.get(id);
            if (existing) {
              existing.text = (existing.text || "") + text;
            } else {
              map.set(id, {
                id,
                type,
                author,
                timestamp,
                text,
                scope,
                formatDetails,
                formatChange,
                status,
                targetNodeId,
              });
            }
          }
        }
      }

      // 2.2 Quét block nodes cho paragraph formatting revisions
      if (node.attrs && Array.isArray(node.attrs.formatRevisions)) {
        for (const rev of node.attrs.formatRevisions) {
          if (rev && rev.id && !map.has(rev.id)) {
            map.set(rev.id, rev);
          }
        }
      }

      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          traverse(child);
        }
      }
    }

    if (doc) {
      traverse(doc as JSONContent);
    }

    return Array.from(map.values());
  }

  /**
   * Tìm phạm vi (from/to) của một thay đổi có ID trong ProseMirror doc
   * Hỗ trợ tìm kiếm cả inline text marks và block node formatRevisions.
   */
  public static findChangeRangeInDoc(
    doc: PMNode,
    changeId: string
  ): { from: number; to: number } | null {
    let minPos = -1;
    let maxPos = -1;

    doc.descendants((node, pos) => {
      // 1. Quét inline text marks
      if (node.isText) {
        const trackMark = node.marks.find(
          (m) => m.type.name === "trackChange" && m.attrs.id === changeId
        );
        if (trackMark) {
          if (minPos === -1 || pos < minPos) {
            minPos = pos;
          }
          const endPos = pos + node.nodeSize;
          if (endPos > maxPos) {
            maxPos = endPos;
          }
        }
      } else {
        // 2. Quét block node formatRevisions
        if (node.attrs && Array.isArray(node.attrs.formatRevisions)) {
          const hasRev = node.attrs.formatRevisions.some((r: any) => r && r.id === changeId);
          if (hasRev) {
            if (minPos === -1 || pos < minPos) {
              minPos = pos;
            }
            const endPos = pos + node.nodeSize;
            if (endPos > maxPos) {
              maxPos = endPos;
            }
          }
        }
      }
    });

    if (minPos !== -1 && maxPos !== -1) {
      return { from: minPos, to: maxPos };
    }
    return null;
  }

  /**
   * Xử lý phím tắt định dạng ký tự (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X) khi Track Changes đang BẬT.
   * Nếu vùng chọn rỗng (caret), trả về false để ProseMirror xử lý stored marks bình thường mà không sinh revision.
   */
  public static handleTrackedKeyboardShortcut(
    ctx: any,
    shortcut: "bold" | "italic" | "underline" | "strike",
    author?: string
  ): boolean {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return false;

    const state = ctx?.state || ctx?.editor?.state;
    if (!state || state.selection.empty) {
      return false;
    }

    const inspection = FormattingDiffService.inspectSelectionCharacterFormatting(
      state.doc,
      state.selection.from,
      state.selection.to
    );
    const isUniformlyActive = inspection.properties[shortcut]?.uniformValue === true;
    const target = !isUniformlyActive;

    const res = this.applyTrackedCharacterFormatting(ctx, { [shortcut]: target }, author);
    return res.success || Boolean(res.noOp);
  }

  /**
   * Áp dụng định dạng ký tự (Character Formatting) có theo dõi revision trong một transaction nguyên tử duy nhất.
   * - Tự động phát hiện No-op (không tạo revision nếu giá trị không đổi).
   * - Hỗ trợ vùng chọn hỗn hợp (mixed selection): ghi đúng từng affected range/property, không gán bừa trước đó.
   * - Hỗ trợ dải chọn qua nhiều đoạn văn và ô bảng (table cell).
   * - Bảo toàn toàn bộ marks khác (comments, hyperlinks, citations, Track Changes trước đó).
   * - Hoàn toàn tương thích và đồng bộ với Undo/Redo của ProseMirror trong 1 bước duy nhất.
   */
  public static applyTrackedCharacterFormatting(
    ctx: any,
    fromOrProps: number | Record<string, any>,
    toOrAuthor?: number | string,
    targetProperties?: Record<string, any>,
    author?: string
  ): { success: boolean; revisionId?: string; revisionIds?: string[]; noOp?: boolean } {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return { success: false };

    let selectionRanges: Array<{ from: number; to: number }> = [];
    let targetProps: Record<string, any> = {};
    let actualAuthor = "Author";

    if (typeof fromOrProps === "number") {
      const from = fromOrProps;
      const to = typeof toOrAuthor === "number" ? toOrAuthor : fromOrProps;
      targetProps = targetProperties || {};
      actualAuthor = author || getCurrentAuthor();
      selectionRanges = [{ from, to }];
    } else {
      targetProps = fromOrProps || {};
      actualAuthor = typeof toOrAuthor === "string" ? toOrAuthor : (author || getCurrentAuthor());
      const state = ctx?.state || ctx?.editor?.state;
      if (!state || state.selection.empty) {
        return { success: false, noOp: true };
      }
      if (state.selection.ranges && state.selection.ranges.length > 0) {
        selectionRanges = state.selection.ranges.map((r: any) => ({
          from: r.$from.pos,
          to: r.$to.pos,
        }));
      } else {
        selectionRanges = [{ from: state.selection.from, to: state.selection.to }];
      }
    }

    selectionRanges = selectionRanges.filter((r) => r.to > r.from);
    if (selectionRanges.length === 0) {
      return { success: false, noOp: true };
    }

    const allRevisionIds: string[] = [];
    let isNoOp = false;

    const executed = executeWithContext(ctx, (state, tr, dispatch) => {
      // 1. Thu thập tất cả các segments bị ảnh hưởng và gom nhóm liền kề có cùng diff
      interface MergedAffectedRange {
        from: number;
        to: number;
        changes: FormattingPropertyDiff[];
      }
      const mergedRanges: MergedAffectedRange[] = [];

      for (const selRange of selectionRanges) {
        const diffResult = FormattingDiffService.computeRangeFormattingDiff(
          state.doc,
          selRange.from,
          selRange.to,
          targetProps
        );

        for (const seg of diffResult.affectedSegments) {
          const last = mergedRanges[mergedRanges.length - 1];
          if (
            last &&
            last.to === seg.from &&
            arePropertyDiffsEqual(last.changes, seg.changes)
          ) {
            last.to = seg.to;
          } else {
            mergedRanges.push({
              from: seg.from,
              to: seg.to,
              changes: [...seg.changes],
            });
          }
        }
      }

      if (mergedRanges.length === 0) {
        isNoOp = true;
        return false;
      }

      const timestamp = new Date().toISOString();
      const markType = state.schema.marks.trackChange;

      // 2. Với mỗi vùng thực sự thay đổi, áp dụng formatting mutations và gắn format revision mark
      for (const mRange of mergedRanges) {
        // Bold
        if (targetProps.bold !== undefined) {
          const boldMark = state.schema.marks.bold;
          if (boldMark) {
            if (targetProps.bold) {
              tr.addMark(mRange.from, mRange.to, boldMark.create());
            } else {
              tr.removeMark(mRange.from, mRange.to, boldMark);
            }
          }
        }
        // Italic
        if (targetProps.italic !== undefined) {
          const italicMark = state.schema.marks.italic;
          if (italicMark) {
            if (targetProps.italic) {
              tr.addMark(mRange.from, mRange.to, italicMark.create());
            } else {
              tr.removeMark(mRange.from, mRange.to, italicMark);
            }
          }
        }
        // Underline
        if (targetProps.underline !== undefined) {
          const underlineMark = state.schema.marks.underline;
          if (underlineMark) {
            if (targetProps.underline) {
              tr.addMark(mRange.from, mRange.to, underlineMark.create());
            } else {
              tr.removeMark(mRange.from, mRange.to, underlineMark);
            }
          }
        }
        // Strike
        if (targetProps.strike !== undefined) {
          const strikeMark = state.schema.marks.strike;
          if (strikeMark) {
            if (targetProps.strike) {
              tr.addMark(mRange.from, mRange.to, strikeMark.create());
            } else {
              tr.removeMark(mRange.from, mRange.to, strikeMark);
            }
          }
        }
        // Highlight
        if (targetProps.highlight !== undefined) {
          const highlightMark = state.schema.marks.highlight;
          if (highlightMark) {
            if (targetProps.highlight) {
              tr.addMark(mRange.from, mRange.to, highlightMark.create({ color: targetProps.highlight }));
            } else {
              tr.removeMark(mRange.from, mRange.to, highlightMark);
            }
          }
        }
        // Character Style
        if (targetProps.characterStyleId !== undefined) {
          const charStyleMark = state.schema.marks.characterStyle;
          if (charStyleMark) {
            tr.removeMark(mRange.from, mRange.to, charStyleMark);
            if (targetProps.characterStyleId) {
              tr.addMark(mRange.from, mRange.to, charStyleMark.create({ styleId: targetProps.characterStyleId }));
            }
          }
        }
        // textStyle (color, fontSize, fontFamily) với merge attributes an toàn cho từng text node
        if (
          targetProps.color !== undefined ||
          targetProps.fontSize !== undefined ||
          targetProps.fontFamily !== undefined
        ) {
          const textStyleMark = state.schema.marks.textStyle;
          if (textStyleMark) {
            state.doc.nodesBetween(mRange.from, mRange.to, (node: any, pos: number) => {
              if (!node.isText) return;
              const nodeFrom = Math.max(mRange.from, pos);
              const nodeTo = Math.min(mRange.to, pos + node.nodeSize);
              if (nodeFrom >= nodeTo) return;

              const existingTextStyle = node.marks.find((m: any) => m.type === textStyleMark);
              const mergedAttrs: Record<string, any> = { ...(existingTextStyle?.attrs || {}) };

              if (targetProps.color !== undefined) {
                if (targetProps.color) mergedAttrs.color = targetProps.color;
                else delete mergedAttrs.color;
              }
              if (targetProps.fontSize !== undefined) {
                const validSize = FormattingDiffService.normalizeFontSize(targetProps.fontSize);
                if (validSize !== null) mergedAttrs.fontSize = `${validSize}pt`;
                else delete mergedAttrs.fontSize;
              }
              if (targetProps.fontFamily !== undefined) {
                if (targetProps.fontFamily) mergedAttrs.fontFamily = targetProps.fontFamily;
                else delete mergedAttrs.fontFamily;
              }

              if (Object.keys(mergedAttrs).length > 0) {
                tr.addMark(nodeFrom, nodeTo, textStyleMark.create(mergedAttrs));
              } else if (existingTextStyle) {
                tr.removeMark(nodeFrom, nodeTo, textStyleMark);
              }
            });
          }
        }

        // Gắn trackChange mark type = "format"
        if (markType) {
          const revScope: FormattingRevisionScope =
            targetProps.characterStyleId !== undefined ? "style" : "character";
          const revId = generateFormattingRevisionId(revScope);
          allRevisionIds.push(revId);

          const fmtMark = markType.create({
            id: revId,
            changeType: "format",
            author: actualAuthor,
            timestamp,
            scope: revScope,
            formatChanges: mRange.changes,
            formatDetails: FormattingDiffService.formatDiffSummary(mRange.changes, revScope),
            status: "pending",
          });
          tr.addMark(mRange.from, mRange.to, fmtMark);
        }
      }

      if (allRevisionIds.length > 0) {
        closeHistory(tr);
        tr.setMeta("trackChangeRevision", allRevisionIds[0]);
      }

      if (dispatch) {
        dispatch(tr);
      }
      return true;
    });

    if (executed && allRevisionIds.length > 0) {
      const doc = ctx?.state?.doc || ctx?.editor?.state?.doc;
      if (doc) {
        this.syncTrackedChangesStore(doc);
      }
      return {
        success: true,
        revisionId: allRevisionIds[0],
        revisionIds: allRevisionIds,
      };
    }

    return { success: false, noOp: isNoOp };
  }

  /**
   * Áp dụng định dạng đoạn văn (Paragraph Formatting) có theo dõi revision trong một transaction nguyên tử duy nhất.
   * - Hỗ trợ cả caret trong 1 đoạn văn lẫn vùng chọn bao quát nhiều đoạn văn / tiêu đề / ô bảng / danh sách.
   * - Bám semantic anchor vào paragraph/heading node (bằng stable nodeId).
   * - Lưu trữ diff riêng biệt cho từng block trong thuộc tính formatRevisions của node.
   * - Tự động phát hiện No-op (không tạo revision nếu giá trị không đổi).
   * - Hoàn toàn tương thích và đồng bộ với Undo/Redo của ProseMirror.
   */
  public static applyTrackedParagraphFormatting(
    ctx: any,
    posOrAttrs: number | Record<string, any> | ((node: any) => Record<string, any>),
    attrsOrAuthor?: Record<string, any> | string,
    authorOrEmpty?: string
  ): { success: boolean; revisionId?: string; revisionIds?: string[]; noOp?: boolean } {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return { success: false };

    let targetBlocks: Array<{ node: any; pos: number }> = [];
    let targetAttrs: Record<string, any> | ((node: any) => Record<string, any>) = {};
    let actualAuthor = "Author";

    const state = ctx?.state || ctx?.editor?.state;
    if (!state) return { success: false };

    if (typeof posOrAttrs === "number") {
      const pos = posOrAttrs;
      targetAttrs = (attrsOrAuthor as Record<string, any>) || {};
      actualAuthor = (authorOrEmpty as string) || getCurrentAuthor();

      const $pos = state.doc.resolve(pos);
      let node =
        $pos.nodeAfter &&
        ($pos.nodeAfter.isTextblock || $pos.nodeAfter.type.name === "paragraph" || $pos.nodeAfter.type.name === "heading")
          ? $pos.nodeAfter
          : null;
      let actualPos = node ? pos : -1;

      if (!node) {
        for (let d = $pos.depth; d > 0; d--) {
          const ancestor = $pos.node(d);
          if (ancestor.isTextblock || ancestor.type.name === "paragraph" || ancestor.type.name === "heading") {
            node = ancestor;
            actualPos = $pos.before(d);
            break;
          }
        }
      }

      if (node && actualPos !== -1) {
        targetBlocks.push({ node, pos: actualPos });
      }
    } else {
      targetAttrs = (posOrAttrs as any) || {};
      actualAuthor = typeof attrsOrAuthor === "string" ? attrsOrAuthor : getCurrentAuthor();

      const { from, to, empty } = state.selection;

      if (empty) {
        // Caret trong một paragraph / heading
        const $pos = state.selection.$from;
        for (let d = $pos.depth; d > 0; d--) {
          const ancestor = $pos.node(d);
          if (ancestor.isTextblock && (ancestor.type.name === "paragraph" || ancestor.type.name === "heading")) {
            targetBlocks.push({ node: ancestor, pos: $pos.before(d) });
            break;
          }
        }
      } else {
        // Selection qua nhiều paragraphs / headings / lists / table cells
        const seenPos = new Set<number>();
        state.doc.nodesBetween(from, to, (node: any, pos: number) => {
          if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
            if (!seenPos.has(pos)) {
              seenPos.add(pos);
              targetBlocks.push({ node, pos });
            }
          }
        });
      }
    }

    if (targetBlocks.length === 0) {
      return { success: false, noOp: true };
    }

    const allRevisionIds: string[] = [];
    let isNoOp = false;

    const executed = executeWithContext(ctx, (_state, tr, dispatch) => {
      const timestamp = new Date().toISOString();
      const docStyles = useDocumentStore.getState().document?.styles as any;
      const styles = Array.isArray(docStyles)
        ? docStyles
        : Array.isArray(docStyles?.definitions)
        ? docStyles.definitions
        : undefined;

      for (const block of targetBlocks) {
        const blockAttrs = typeof targetAttrs === "function" ? targetAttrs(block.node) : targetAttrs;
        const diff = FormattingDiffService.computeParagraphDiff(block.node, blockAttrs, styles);
        if (!diff.hasChanges) {
          continue;
        }

        const revisionId = generateFormattingRevisionId("paragraph");
        allRevisionIds.push(revisionId);

        const stableNodeId =
          block.node.attrs.nodeId ||
          block.node.attrs.id ||
          `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        const existingRevs: TrackChangeItem[] = Array.isArray(block.node.attrs.formatRevisions)
          ? [...block.node.attrs.formatRevisions]
          : [];

        const newRevItem: TrackChangeItem = FormattingDiffService.createFormattingRevisionItem({
          id: revisionId,
          author: actualAuthor,
          timestamp,
          scope: "paragraph",
          changes: diff.changes,
          summary: diff.summary,
          targetNodeId: stableNodeId,
          text: block.node.textContent || "",
          status: "pending",
        });

        existingRevs.push(newRevItem);

        tr.setNodeMarkup(block.pos, undefined, {
          ...block.node.attrs,
          ...blockAttrs,
          nodeId: stableNodeId,
          formatRevisions: existingRevs,
        });
      }

      if (allRevisionIds.length === 0) {
        isNoOp = true;
        return false;
      }

      closeHistory(tr);
      tr.setMeta("trackChangeRevision", allRevisionIds[0]);

      if (dispatch) {
        dispatch(tr);
      }
      return true;
    });

    if (executed && allRevisionIds.length > 0) {
      const doc = ctx?.state?.doc || ctx?.editor?.state?.doc;
      if (doc) {
        this.syncTrackedChangesStore(doc);
      }
      return {
        success: true,
        revisionId: allRevisionIds[0],
        revisionIds: allRevisionIds,
      };
    }

    return { success: false, noOp: isNoOp };
  }

  /**
   * Áp dụng Paragraph Style có theo dõi revision (scope: "style") trong 1 transaction nguyên tử.
   * - Hỗ trợ cả caret và multi-block selection
   * - Bảo toàn cấu trúc semantic heading và cấp độ level
   * - Lưu trữ stable style ID trước và sau
   * - Hỗ trợ xóa direct formatting nếu options.clearDirectFormatting = true
   * - Tự động phát hiện No-op nếu styleId không đổi
   * - Hoàn toàn tương thích và đồng bộ với Undo/Redo trong 1 bước duy nhất
   */
  public static applyTrackedParagraphStyle(
    ctx: any,
    styleId: string,
    options?: { clearDirectFormatting?: boolean },
    author?: string
  ): { success: boolean; revisionId?: string; revisionIds?: string[]; noOp?: boolean } {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return { success: false };

    const state = ctx?.state || ctx?.editor?.state;
    if (!state) return { success: false };

    const { from, to, empty } = state.selection;
    interface TargetBlock {
      node: PMNode;
      pos: number;
    }
    const targetBlocks: TargetBlock[] = [];

    if (empty) {
      const $pos = state.selection.$from;
      for (let d = $pos.depth; d > 0; d--) {
        const ancestor = $pos.node(d);
        if (ancestor.isTextblock && (ancestor.type.name === "paragraph" || ancestor.type.name === "heading")) {
          targetBlocks.push({ node: ancestor, pos: $pos.before(d) });
          break;
        }
      }
    } else {
      const seenPos = new Set<number>();
      state.doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
        if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
          if (!seenPos.has(pos)) {
            seenPos.add(pos);
            targetBlocks.push({ node, pos });
          }
        }
      });
    }

    if (targetBlocks.length === 0) {
      return { success: false, noOp: true };
    }

    const actualAuthor = author || getCurrentAuthor();
    const allRevisionIds: string[] = [];
    let isNoOp = false;

    const executed = executeWithContext(ctx, (state, tr, dispatch) => {
      const timestamp = new Date().toISOString();

      for (const block of targetBlocks) {
        let currentStyleId = block.node.attrs.styleId || null;
        if (block.node.type.name === "heading") {
          if (!currentStyleId) {
            const lvl = block.node.attrs.level;
            currentStyleId = lvl === 2 ? STYLE_HEADING_2_ID : lvl === 3 ? STYLE_HEADING_3_ID : STYLE_HEADING_1_ID;
          }
        } else {
          if (!currentStyleId) {
            currentStyleId = STYLE_NORMAL_ID;
          }
        }

        const targetStyleId = styleId;
        let targetNodeType = block.node.type;
        let targetLevel = block.node.attrs.level ?? null;

        if (styleId === STYLE_HEADING_1_ID) {
          targetNodeType = state.schema.nodes.heading;
          targetLevel = 1;
        } else if (styleId === STYLE_HEADING_2_ID) {
          targetNodeType = state.schema.nodes.heading;
          targetLevel = 2;
        } else if (styleId === STYLE_HEADING_3_ID) {
          targetNodeType = state.schema.nodes.heading;
          targetLevel = 3;
        } else if (styleId === STYLE_NORMAL_ID && block.node.type.name === "heading") {
          targetNodeType = state.schema.nodes.paragraph;
          targetLevel = null;
        } else {
          // Custom style: giữ nguyên semantic node type & level
          targetNodeType = block.node.type;
          targetLevel = block.node.attrs.level ?? null;
        }

        const isSameStyle =
          currentStyleId === targetStyleId &&
          block.node.type === targetNodeType &&
          block.node.attrs.level === (targetLevel ?? undefined);

        const directPropsToCheck = [
          "textAlign",
          "lineSpacing",
          "spacingBefore",
          "spacingAfter",
          "leftIndent",
          "rightIndent",
          "firstLineIndent",
          "hangingIndent",
        ];

        let hasDirectToClear = false;
        if (options?.clearDirectFormatting) {
          hasDirectToClear = directPropsToCheck.some(
            (p) => block.node.attrs[p] !== null && block.node.attrs[p] !== undefined
          );
        }

        if (isSameStyle && !hasDirectToClear) {
          continue;
        }

        const changes: FormattingPropertyDiff[] = [];

        if (currentStyleId !== targetStyleId) {
          changes.push({
            property: "paragraphStyleId",
            before: currentStyleId,
            after: targetStyleId,
          });
        }

        const currentLevel = block.node.attrs.level ?? null;
        if (currentLevel !== targetLevel) {
          changes.push({
            property: "headingLevel",
            before: currentLevel,
            after: targetLevel,
          });
        }

        if (options?.clearDirectFormatting) {
          for (const prop of directPropsToCheck) {
            if (block.node.attrs[prop] !== null && block.node.attrs[prop] !== undefined) {
              changes.push({
                property: prop,
                before: block.node.attrs[prop],
                after: null,
              });
            }
          }
        }

        if (changes.length === 0) {
          continue;
        }

        const revisionId = generateFormattingRevisionId("style");
        allRevisionIds.push(revisionId);

        const stableNodeId =
          block.node.attrs.nodeId ||
          block.node.attrs.id ||
          `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        const summary = FormattingDiffService.formatDiffSummary(changes, "style");

        const newRevItem: TrackChangeItem = FormattingDiffService.createFormattingRevisionItem({
          id: revisionId,
          author: actualAuthor,
          timestamp,
          scope: "style",
          changes,
          summary,
          targetNodeId: stableNodeId,
          styleId: targetStyleId,
          text: block.node.textContent || "",
          status: "pending",
        });

        const existingRevs = Array.isArray(block.node.attrs.formatRevisions)
          ? [...block.node.attrs.formatRevisions]
          : [];
        existingRevs.push(newRevItem);

        const newAttrs: Record<string, any> = {
          ...block.node.attrs,
          styleId: targetStyleId === STYLE_NORMAL_ID ? null : targetStyleId,
          nodeId: stableNodeId,
          formatRevisions: existingRevs,
        };

        if (targetNodeType.name === "heading") {
          newAttrs.level = targetLevel;
        } else {
          delete newAttrs.level;
        }

        if (options?.clearDirectFormatting) {
          newAttrs.textAlign = null;
          newAttrs.lineSpacing = null;
          newAttrs.spacingBefore = null;
          newAttrs.spacingAfter = null;
          newAttrs.leftIndent = null;
          newAttrs.rightIndent = null;
          newAttrs.firstLineIndent = null;
          newAttrs.hangingIndent = null;
          newAttrs.indent = 0;
        }

        tr.setNodeMarkup(block.pos, targetNodeType, newAttrs);
      }

      if (allRevisionIds.length === 0) {
        isNoOp = true;
        return false;
      }

      closeHistory(tr);
      tr.setMeta("trackChangeRevision", allRevisionIds[0]);

      if (dispatch) {
        dispatch(tr);
      }
      return true;
    });

    if (executed && allRevisionIds.length > 0) {
      const doc = ctx?.state?.doc || ctx?.editor?.state?.doc;
      if (doc) {
        this.syncTrackedChangesStore(doc);
      }
      return {
        success: true,
        revisionId: allRevisionIds[0],
        revisionIds: allRevisionIds,
      };
    }

    return { success: false, noOp: isNoOp };
  }

  /**
   * Áp dụng Character Style có theo dõi revision (scope: "style")
   */
  public static applyTrackedCharacterStyle(
    ctx: any,
    styleId: string,
    author?: string
  ): { success: boolean; revisionId?: string; revisionIds?: string[]; noOp?: boolean } {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return { success: false };

    const state = ctx?.state || ctx?.editor?.state;
    if (!state) return { success: false };

    // Con trỏ rỗng: để editor lưu storedMarks cho ký tự gõ tiếp theo
    if (state.selection.empty) {
      if (typeof ctx?.commands?.setCharacterStyle === "function") {
        ctx.commands.setCharacterStyle(styleId);
      }
      return { success: true, noOp: true };
    }

    return this.applyTrackedCharacterFormatting(ctx, { characterStyleId: styleId }, author);
  }

  /**
   * Gỡ bỏ Character Style có theo dõi revision (scope: "style")
   */
  public static removeTrackedCharacterStyle(
    ctx: any,
    author?: string
  ): { success: boolean; revisionId?: string; revisionIds?: string[]; noOp?: boolean } {
    const isTracking = useReviewStore.getState().trackChangesEnabled;
    if (!isTracking) return { success: false };

    const state = ctx?.state || ctx?.editor?.state;
    if (!state) return { success: false };

    if (state.selection.empty) {
      if (typeof ctx?.commands?.unsetCharacterStyle === "function") {
        ctx.commands.unsetCharacterStyle();
      }
      return { success: true, noOp: true };
    }

    return this.applyTrackedCharacterFormatting(ctx, { characterStyleId: null }, author);
  }

  /**
   * Tìm thay đổi tiếp theo trong tài liệu (Next Change)
   */
  /**
   * Lọc danh sách tracked spans theo filter presentation (không mutate document)
   */
  public static filterTrackedSpans(
    spans: TrackChangeSpan[],
    filter: ReviewChangesFilter = "all"
  ): TrackChangeSpan[] {
    if (!filter || filter === "all") return spans;
    if (filter === "insertions") return spans.filter((s) => s.type === "insert");
    if (filter === "deletions") return spans.filter((s) => s.type === "delete");
    if (filter === "formatting") return spans.filter((s) => s.type === "format");
    return spans;
  }

  /**
   * Tìm thay đổi tiếp theo trong tài liệu (Next Change) - tôn trọng visible filter và document position
   */
  public static findNextChange(
    doc: PMNode,
    currentChangeId: string | null,
    filter?: ReviewChangesFilter
  ): TrackChangeSpan | null {
    const filterMode = filter || useReviewStore.getState().changesFilter || "all";
    let spans = this.getTrackedSpansFromPMDoc(doc);
    if (spans.length === 0) return null;

    // Sắp xếp deterministic theo document position và id
    spans.sort((a, b) => (a.from !== b.from ? a.from - b.from : a.id.localeCompare(b.id)));

    // Lọc theo filterMode
    spans = this.filterTrackedSpans(spans, filterMode);

    if (spans.length === 0) return null;

    // Lọc danh sách unique theo changeId
    const uniqueChanges: TrackChangeSpan[] = [];
    const seen = new Set<string>();
    for (const span of spans) {
      if (!seen.has(span.id)) {
        seen.add(span.id);
        uniqueChanges.push(span);
      }
    }

    if (!currentChangeId) {
      return uniqueChanges[0];
    }

    const currentIndex = uniqueChanges.findIndex((c) => c.id === currentChangeId);
    if (currentIndex === -1) {
      return uniqueChanges[0];
    }

    const nextIndex = (currentIndex + 1) % uniqueChanges.length;
    return uniqueChanges[nextIndex];
  }

  /**
   * Tìm thay đổi phía trước trong tài liệu (Previous Change) - tôn trọng visible filter và document position
   */
  public static findPreviousChange(
    doc: PMNode,
    currentChangeId: string | null,
    filter?: ReviewChangesFilter
  ): TrackChangeSpan | null {
    const filterMode = filter || useReviewStore.getState().changesFilter || "all";
    let spans = this.getTrackedSpansFromPMDoc(doc);
    if (spans.length === 0) return null;

    // Sắp xếp deterministic theo document position và id
    spans.sort((a, b) => (a.from !== b.from ? a.from - b.from : a.id.localeCompare(b.id)));

    // Lọc theo filterMode
    spans = this.filterTrackedSpans(spans, filterMode);

    if (spans.length === 0) return null;

    const uniqueChanges: TrackChangeSpan[] = [];
    const seen = new Set<string>();
    for (const span of spans) {
      if (!seen.has(span.id)) {
        seen.add(span.id);
        uniqueChanges.push(span);
      }
    }

    if (!currentChangeId) {
      return uniqueChanges[uniqueChanges.length - 1];
    }

    const currentIndex = uniqueChanges.findIndex((c) => c.id === currentChangeId);
    if (currentIndex === -1) {
      return uniqueChanges[0];
    }

    const prevIndex = (currentIndex - 1 + uniqueChanges.length) % uniqueChanges.length;
    return uniqueChanges[prevIndex];
  }

  /**
   * Điều hướng editor đến một changeId cụ thể
   */
  public static navigateToChange(editor: Editor, changeId: string): boolean {
    const range = this.findChangeRangeInDoc(editor.state.doc, changeId);
    if (!range) return false;

    editor
      .chain()
      .focus()
      .setTextSelection({ from: range.from, to: range.to })
      .scrollIntoView()
      .run();

    useReviewStore.getState().setActiveChangeId(changeId);
    useReviewStore.getState().setReviewSidebarTab("changes");

    if (typeof document !== "undefined") {
      document.querySelectorAll(".track-change.track-active").forEach((el) => {
        el.classList.remove("track-active");
      });
      document.querySelectorAll(`[data-change-id="${changeId}"]`).forEach((el) => {
        el.classList.add("track-active");
      });
    }

    return true;
  }

  /**
   * Xác định changeId mục tiêu từ EditorState
   * Khi caret/selection nằm trong nhiều revisions:
   * - Ưu tiên active revision đã chọn nếu có trong danh sách candidates;
   * - Nếu chưa có, áp dụng deterministic resolution (revision mới nhất).
   */
  public static resolveTargetChangeIdFromState(state: any): string | null {
    if (!state || !state.schema) return null;
    const markType = state.schema.marks.trackChange;
    if (!markType) return null;

    const { from, to, empty } = state.selection;
    const activeId = useReviewStore.getState().activeChangeId;

    // Thu thập toàn bộ các revision ID ứng viên trong vùng chọn / caret
    const candidateIds: string[] = [];

    // 1. Kiểm tra vùng bôi đen (selection không rỗng)
    if (!empty) {
      state.doc.nodesBetween(from, to, (node: any) => {
        if (node.isText) {
          const marks = node.marks.filter((m: any) => m.type === markType);
          for (const mark of marks) {
            if (mark?.attrs?.id && !candidateIds.includes(mark.attrs.id)) {
              candidateIds.push(mark.attrs.id);
            }
          }
        } else if (
          node.attrs &&
          Array.isArray(node.attrs.formatRevisions) &&
          node.attrs.formatRevisions.length > 0
        ) {
          for (const rev of node.attrs.formatRevisions) {
            if (rev?.id && !candidateIds.includes(rev.id)) {
              candidateIds.push(rev.id);
            }
          }
        }
      });
    } else {
      // 2. Con trỏ nhấp nháy tại vị trí (caret)
      const $pos = state.selection.$from;
      const directMarks = $pos.marks().filter((m: any) => m.type === markType);
      for (const m of directMarks) {
        if (m.attrs?.id && !candidateIds.includes(m.attrs.id)) {
          candidateIds.push(m.attrs.id);
        }
      }

      // Ký tự liền trước con trỏ
      if ($pos.pos > 1) {
        const prevMarks = state.doc.resolve($pos.pos - 1).marks().filter((m: any) => m.type === markType);
        for (const prevMark of prevMarks) {
          if (prevMark?.attrs?.id && !candidateIds.includes(prevMark.attrs.id)) {
            candidateIds.push(prevMark.attrs.id);
          }
        }
      }

      // Ký tự liền sau con trỏ
      if ($pos.pos < state.doc.content.size - 1) {
        const nextMarks = state.doc.resolve($pos.pos + 1).marks().filter((m: any) => m.type === markType);
        for (const nextMark of nextMarks) {
          if (nextMark?.attrs?.id && !candidateIds.includes(nextMark.attrs.id)) {
            candidateIds.push(nextMark.attrs.id);
          }
        }
      }

      // Kiểm tra block node cha tại caret nếu có formatRevisions
      for (let d = $pos.depth; d > 0; d--) {
        const ancestor = $pos.node(d);
        if (
          ancestor.attrs &&
          Array.isArray(ancestor.attrs.formatRevisions) &&
          ancestor.attrs.formatRevisions.length > 0
        ) {
          for (const rev of ancestor.attrs.formatRevisions) {
            if (rev?.id && !candidateIds.includes(rev.id)) {
              candidateIds.push(rev.id);
            }
          }
        }
      }
    }

    // 1. Ưu tiên active revision đã chọn nếu nó nằm trong vùng chọn / caret
    if (activeId && candidateIds.includes(activeId)) {
      return activeId;
    }

    // 2. Nếu có candidate: áp dụng deterministic resolution (chọn revision mới nhất/cuối cùng)
    if (candidateIds.length > 0) {
      return candidateIds[candidateIds.length - 1];
    }

    // 3. Fallback: activeChangeId từ reviewStore nếu vẫn còn tồn tại trong doc
    if (activeId) {
      let stillExists = false;
      state.doc.descendants((node: any) => {
        if (stillExists) return false;
        if (node.isText && node.marks.some((m: any) => m.type === markType && m.attrs.id === activeId)) {
          stillExists = true;
        } else if (
          node.attrs &&
          Array.isArray(node.attrs.formatRevisions) &&
          node.attrs.formatRevisions.some((r: any) => r.id === activeId)
        ) {
          stillExists = true;
        }
      });
      if (stillExists) {
        return activeId;
      }
    }

    // 4. Fallback cuối: Thay đổi đầu tiên trong tài liệu
    const spans = this.getTrackedSpansFromPMDoc(state.doc);
    if (spans.length > 0) {
      return spans[0].id;
    }

    return null;
  }

  /**
   * Xác định changeId mục tiêu từ Editor
   */
  public static resolveTargetChangeId(editor: Editor): string | null {
    return this.resolveTargetChangeIdFromState(editor.state);
  }

  /**
   * Đồng bộ danh sách trackedChanges vào DocumentStore
   */
  public static syncTrackedChangesStore(doc: PMNode | JSONContent): void {
    const changes = this.getTrackedChangesFromDoc(doc);
    useDocumentStore.getState().setTrackedChanges(changes);
  }

  /**
   * Chấp nhận một thay đổi cụ thể hoặc thay đổi tại con trỏ (Accept Change)
   */
  public static acceptChange(editor: Editor, changeId?: string): boolean {
    const targetId = changeId || this.resolveTargetChangeId(editor);
    if (!targetId) return false;

    let success = false;
    if (typeof editor.commands?.acceptChange === "function") {
      success = editor.commands.acceptChange(targetId);
    }

    if (success) {
      this.syncTrackedChangesStore(editor.state.doc);

      // Cập nhật activeChangeId: chuyển sang thay đổi tiếp theo hoặc xóa nếu hết
      const next = this.findNextChange(editor.state.doc, targetId);
      if (next && next.id !== targetId) {
        useReviewStore.getState().setActiveChangeId(next.id);
      } else {
        const remaining = this.getTrackedSpansFromPMDoc(editor.state.doc);
        useReviewStore.getState().setActiveChangeId(remaining.length > 0 ? remaining[0].id : null);
      }
    }

    return success;
  }

  /**
   * Từ chối một thay đổi cụ thể hoặc thay đổi tại con trỏ (Reject Change)
   */
  public static rejectChange(editor: Editor, changeId?: string): boolean {
    const targetId = changeId || this.resolveTargetChangeId(editor);
    if (!targetId) return false;

    let success = false;
    if (typeof editor.commands?.rejectChange === "function") {
      success = editor.commands.rejectChange(targetId);
    }

    if (success) {
      this.syncTrackedChangesStore(editor.state.doc);

      // Cập nhật activeChangeId: chuyển sang thay đổi tiếp theo hoặc xóa nếu hết
      const next = this.findNextChange(editor.state.doc, targetId);
      if (next && next.id !== targetId) {
        useReviewStore.getState().setActiveChangeId(next.id);
      } else {
        const remaining = this.getTrackedSpansFromPMDoc(editor.state.doc);
        useReviewStore.getState().setActiveChangeId(remaining.length > 0 ? remaining[0].id : null);
      }
    }

    return success;
  }

  /**
   * Chấp nhận toàn bộ thay đổi còn lại trong tài liệu (Accept All)
   */
  public static acceptAllChanges(editor: Editor): boolean {
    let success = false;
    if (typeof editor.commands?.acceptAllChanges === "function") {
      success = editor.commands.acceptAllChanges();
    }

    if (success) {
      useDocumentStore.getState().setTrackedChanges([]);
      useReviewStore.getState().setActiveChangeId(null);
    }

    return success;
  }

  /**
   * Từ chối toàn bộ thay đổi còn lại trong tài liệu (Reject All)
   */
  public static rejectAllChanges(editor: Editor): boolean {
    let success = false;
    if (typeof editor.commands?.rejectAllChanges === "function") {
      success = editor.commands.rejectAllChanges();
    }

    if (success) {
      useDocumentStore.getState().setTrackedChanges([]);
      useReviewStore.getState().setActiveChangeId(null);
    }

    return success;
  }

  /**
   * Chấp nhận toàn bộ thay đổi định dạng (Accept All Formatting) - Phase 7
   */
  public static acceptAllFormatting(editor: Editor): boolean {
    let success = false;
    if (typeof editor.commands?.acceptAllFormattingChanges === "function") {
      success = editor.commands.acceptAllFormattingChanges();
    }

    if (success) {
      const remaining = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
      useDocumentStore.getState().setTrackedChanges(remaining);
      const activeId = useReviewStore.getState().activeChangeId;
      if (activeId && !remaining.some((c) => c.id === activeId)) {
        useReviewStore.getState().setActiveChangeId(null);
      }
    }

    return success;
  }

  /**
   * Từ chối toàn bộ thay đổi định dạng (Reject All Formatting) - Phase 7
   */
  public static rejectAllFormatting(editor: Editor): boolean {
    let success = false;
    if (typeof editor.commands?.rejectAllFormattingChanges === "function") {
      success = editor.commands.rejectAllFormattingChanges();
    }

    if (success) {
      const remaining = TrackChangesService.getTrackedChangesFromDoc(editor.state.doc);
      useDocumentStore.getState().setTrackedChanges(remaining);
      const activeId = useReviewStore.getState().activeChangeId;
      if (activeId && !remaining.some((c) => c.id === activeId)) {
        useReviewStore.getState().setActiveChangeId(null);
      }
    }

    return success;
  }

  /**
   * Kiểm tra transaction có nguồn gốc từ Review Operation hoặc ProseMirror History
   */
  public static isReviewOrHistoryTransaction(tr: any): boolean {
    return isReviewOrHistoryTransaction(tr);
  }
}
