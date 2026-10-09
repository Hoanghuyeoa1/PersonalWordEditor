import type { Editor } from "@tiptap/core";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
  STYLE_HEADING_2_ID,
  STYLE_HEADING_3_ID,
} from "./builtInStyles.ts";
import {
  validateAndClampSpacing,
  validateAndClampIndent,
  normalizeFirstLineAndHanging,
} from "../utils/unitConversion.ts";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { TrackChangesService } from "../../review/trackChanges/trackChangesService.ts";

export interface ApplyParagraphStyleOptions {
  /** Xóa toàn bộ direct formatting trên block khi áp dụng style mới (mặc định: false) */
  clearDirectFormatting?: boolean;
}

export interface SetParagraphSpacingOptions {
  spacingBefore?: number | null;
  spacingAfter?: number | null;
}

export interface SetParagraphIndentsOptions {
  leftIndent?: number | null;
  rightIndent?: number | null;
  firstLineIndent?: number | null;
  hangingIndent?: number | null;
}

/**
 * Đảm bảo các plugins (như undo/redo history) được gắn vào ProseMirror state trong môi trường headless/testing.
 */
function ensureEditorPlugins(editor: Editor | null): void {
  if (!editor) return;
  if (editor.state.plugins.length === 0 && (editor.extensionManager?.plugins?.length ?? 0) > 0) {
    const newState = editor.state.reconfigure({ plugins: editor.extensionManager.plugins });
    editor.view.updateState(newState);
  }
}

/**
 * Dịch vụ áp dụng Paragraph Style lên khối văn bản (Apply Paragraph Style Service).
 *
 * Tính năng chính:
 * 1. Caret trong 1 block → áp dụng cho block hiện tại.
 * 2. Multi-block selection → áp dụng atomic trong 1 transaction cho toàn bộ các block hợp lệ.
 * 3. Hỗ trợ an toàn khối trong List và Table: chỉ áp dụng cho textblock bên trong, không corrupt cấu trúc table/list.
 * 4. Bảo tồn semantic Heading khi áp dụng custom style vào block heading.
 * 5. Tự động chuyển đổi node type khi áp dụng các built-in Heading / Normal styles.
 */
export function applyParagraphStyle(
  editor: Editor | null,
  styleId: string,
  options?: ApplyParagraphStyleOptions
): boolean {
  if (!editor || !styleId) return false;
  ensureEditorPlugins(editor);

  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (isTracking) {
    const res = TrackChangesService.applyTrackedParagraphStyle(editor, styleId, options);
    return res.success || Boolean(res.noOp);
  }

  const { state, view } = editor;
  const { tr, selection } = state;
  const { from, to } = selection;

  let changed = false;

  tr.doc.nodesBetween(from, to, (node, pos) => {
    // Chỉ áp dụng lên các textblock (paragraph hoặc heading)
    if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
      const currentAttrs = { ...node.attrs };

      let newType = node.type;
      const newAttrs: Record<string, any> = {
        ...currentAttrs,
        styleId: styleId === STYLE_NORMAL_ID ? null : styleId,
      };

      // Chuyển đổi semantic node type cho built-in styles
      if (styleId === STYLE_HEADING_1_ID) {
        newType = state.schema.nodes.heading;
        newAttrs.level = 1;
        newAttrs.styleId = STYLE_HEADING_1_ID;
      } else if (styleId === STYLE_HEADING_2_ID) {
        newType = state.schema.nodes.heading;
        newAttrs.level = 2;
        newAttrs.styleId = STYLE_HEADING_2_ID;
      } else if (styleId === STYLE_HEADING_3_ID) {
        newType = state.schema.nodes.heading;
        newAttrs.level = 3;
        newAttrs.styleId = STYLE_HEADING_3_ID;
      } else if (styleId === STYLE_NORMAL_ID && node.type.name === "heading") {
        // Chuyển Heading về Paragraph thông thường
        newType = state.schema.nodes.paragraph;
        delete newAttrs.level;
        newAttrs.styleId = null;
      } else {
        // Custom Style: Giữ nguyên semantic node type!
        // Heading vẫn giữ type=heading & level, paragraph giữ type=paragraph.
        newAttrs.styleId = styleId;
      }

      // Xóa direct paragraph formatting overrides nếu được yêu cầu
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

      tr.setNodeMarkup(pos, newType, newAttrs);
      changed = true;
    }
  });

  if (changed) {
    view.dispatch(tr);
    return true;
  }
  return false;
}

/**
 * Thiết lập khoảng cách trực tiếp (Direct Paragraph Spacing) cho vùng chọn.
 */
export function setParagraphSpacing(
  editor: Editor | null,
  spacing: SetParagraphSpacingOptions
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);

  const validBefore = validateAndClampSpacing(spacing.spacingBefore);
  const validAfter = validateAndClampSpacing(spacing.spacingAfter);
  const targetAttrs: Record<string, any> = {};
  if (spacing.spacingBefore !== undefined) targetAttrs.spacingBefore = validBefore;
  if (spacing.spacingAfter !== undefined) targetAttrs.spacingAfter = validAfter;

  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (isTracking) {
    const res = TrackChangesService.applyTrackedParagraphFormatting(editor, targetAttrs);
    return res.success || Boolean(res.noOp);
  }

  const { state, view } = editor;
  const { tr, selection } = state;
  const { from, to } = selection;

  let changed = false;

  const applyToNode = (node: any, pos: number) => {
    if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
      const nextAttrs = { ...node.attrs, ...targetAttrs };
      tr.setNodeMarkup(pos, undefined, nextAttrs);
      changed = true;
    }
  };

  if (selection.empty) {
    for (let d = selection.$from.depth; d > 0; d--) {
      const ancestor = selection.$from.node(d);
      if (ancestor.isTextblock && (ancestor.type.name === "paragraph" || ancestor.type.name === "heading")) {
        applyToNode(ancestor, selection.$from.before(d));
        break;
      }
    }
  } else {
    tr.doc.nodesBetween(from, to, applyToNode);
  }

  if (changed) {
    view.dispatch(tr);
    return true;
  }
  return false;
}

/**
 * Thiết lập thụt lề trực tiếp (Direct Indentation) cho vùng chọn.
 */
export function setParagraphIndents(
  editor: Editor | null,
  indents: SetParagraphIndentsOptions
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);

  const validLeft = validateAndClampIndent(indents.leftIndent);
  const validRight = validateAndClampIndent(indents.rightIndent);
  const { firstLineIndent: normFl, hangingIndent: normHg } = normalizeFirstLineAndHanging(
    indents.firstLineIndent,
    indents.hangingIndent
  );

  const targetAttrs: Record<string, any> = {};
  if (indents.leftIndent !== undefined) targetAttrs.leftIndent = validLeft;
  if (indents.rightIndent !== undefined) targetAttrs.rightIndent = validRight;
  if (indents.firstLineIndent !== undefined || indents.hangingIndent !== undefined) {
    targetAttrs.firstLineIndent = normFl > 0 ? normFl : null;
    targetAttrs.hangingIndent = normHg > 0 ? normHg : null;
  }

  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (isTracking) {
    const res = TrackChangesService.applyTrackedParagraphFormatting(editor, targetAttrs);
    return res.success || Boolean(res.noOp);
  }

  const { state, view } = editor;
  const { tr, selection } = state;
  const { from, to } = selection;

  let changed = false;

  const applyToNode = (node: any, pos: number) => {
    if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
      const nextAttrs = { ...node.attrs, ...targetAttrs };
      tr.setNodeMarkup(pos, undefined, nextAttrs);
      changed = true;
    }
  };

  if (selection.empty) {
    for (let d = selection.$from.depth; d > 0; d--) {
      const ancestor = selection.$from.node(d);
      if (ancestor.isTextblock && (ancestor.type.name === "paragraph" || ancestor.type.name === "heading")) {
        applyToNode(ancestor, selection.$from.before(d));
        break;
      }
    }
  } else {
    tr.doc.nodesBetween(from, to, applyToNode);
  }

  if (changed) {
    view.dispatch(tr);
    return true;
  }
  return false;
}

/**
 * Xóa toàn bộ direct paragraph formatting trên các block được chọn,
 * đưa các thuộc tính đoạn văn về đúng định nghĩa của Style hiện tại.
 */
export function clearDirectParagraphFormatting(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  const { state, view } = editor;
  const { tr, selection } = state;
  const { from, to } = selection;

  let changed = false;

  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        textAlign: null,
        lineSpacing: null,
        spacingBefore: null,
        spacingAfter: null,
        leftIndent: null,
        rightIndent: null,
        firstLineIndent: null,
        hangingIndent: null,
        indent: 0,
      });
      changed = true;
    }
  });

  if (changed) {
    view.dispatch(tr);
    return true;
  }
  return false;
}
