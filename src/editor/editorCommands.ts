import type { Editor, JSONContent } from "@tiptap/core";
import type { DrawingPosition } from "../docx/drawing/drawingTypes.ts";
import { searchPluginKey, type SearchPluginState } from "./searchExtensions.ts";
import type { PageSettings } from "../page/types/pageTypes.ts";
import { validateAndNormalizePageSettings } from "../page/services/pageSettingsService.ts";
import { getActiveLinkInfo } from "../insert/services/linkService.ts";
import {
  undoStyle,
  redoStyle,
  canUndoStyle,
  canRedoStyle,
} from "../styles/services/styleHistoryService.ts";
import {
  CellSelection,
  selectedRect,
  TableMap,
  cellNear,
  pointsAtCell,
  inSameTable,
} from "@tiptap/pm/tables";
import { useReviewStore } from "../stores/reviewStore.ts";
import { TrackChangesService } from "../review/trackChanges/trackChangesService.ts";

/**
 * Danh sách phông chữ phổ biến được hỗ trợ kèm CSS fallback an toàn.
 */
export interface FontFamilyOption {
  label: string;
  value: string;
}

export const SUPPORTED_FONT_FAMILIES: FontFamilyOption[] = [
  { label: "Calibri", value: "Calibri, Candara, Segoe UI, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: "\"Times New Roman\", Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "\"Courier New\", Courier, monospace" },
];

/**
 * Danh sách cỡ chữ preset chuẩn.
 */
export const FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72,
];

/**
 * Kiểm tra tính hợp lệ của cỡ chữ: phải là số nguyên dương từ 4 đến 144 pt.
 * Ngăn chặn giá trị NaN, âm, hoặc vô lý phá vỡ cấu trúc document.
 */
export function validateFontSize(size: unknown): number | null {
  if (typeof size === "number") {
    if (isNaN(size) || !isFinite(size) || size < 4 || size > 144) {
      return null;
    }
    return Math.round(size);
  }
  if (typeof size === "string") {
    const trimmed = size.trim().replace(/pt|px$/i, "");
    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed) || !isFinite(parsed) || parsed < 4 || parsed > 144) {
      return null;
    }
    return parsed;
  }
  return null;
}

/* ==========================================================================
   Các lệnh định dạng văn bản (Formatting Commands)
   ========================================================================== */

export function toggleBold(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.toggleBold();
  }
  const target = !editor.isActive("bold");
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { bold: target });
  return res.success || Boolean(res.noOp);
}

export function toggleItalic(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.toggleItalic();
  }
  const target = !editor.isActive("italic");
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { italic: target });
  return res.success || Boolean(res.noOp);
}

export function toggleUnderline(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.toggleUnderline();
  }
  const target = !editor.isActive("underline");
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { underline: target });
  return res.success || Boolean(res.noOp);
}

export function toggleStrike(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.toggleStrike();
  }
  const target = !editor.isActive("strike");
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { strike: target });
  return res.success || Boolean(res.noOp);
}

export function setFontFamily(editor: Editor | null, fontFamily: string): boolean {
  if (!editor || !fontFamily) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.setFontFamily(fontFamily);
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { fontFamily });
  return res.success || Boolean(res.noOp);
}

export function unsetFontFamily(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.unsetFontFamily();
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { fontFamily: null });
  return res.success || Boolean(res.noOp);
}

export function setFontSize(editor: Editor | null, size: number | string): boolean {
  if (!editor) return false;
  const validSize = validateFontSize(size);
  if (validSize === null) {
    return false;
  }
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.setFontSize(`${validSize}pt`);
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { fontSize: validSize });
  return res.success || Boolean(res.noOp);
}

export function unsetFontSize(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.unsetFontSize();
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { fontSize: null });
  return res.success || Boolean(res.noOp);
}

export function setTextColor(editor: Editor | null, color: string): boolean {
  if (!editor || !color) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.setColor(color);
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { color });
  return res.success || Boolean(res.noOp);
}

export function unsetTextColor(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.unsetColor();
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { color: null });
  return res.success || Boolean(res.noOp);
}

export function setTextHighlight(editor: Editor | null, color = "#fef08a"): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.setHighlight({ color });
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { highlight: color });
  return res.success || Boolean(res.noOp);
}

export function toggleTextHighlight(editor: Editor | null, color = "#fef08a"): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.toggleHighlight({ color });
  }
  const target = editor.isActive("highlight") ? null : color;
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { highlight: target });
  return res.success || Boolean(res.noOp);
}

export function unsetTextHighlight(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    return editor.commands.unsetHighlight();
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, { highlight: null });
  return res.success || Boolean(res.noOp);
}

/**
 * Lệnh áp dụng hàng loạt nhiều thuộc tính định dạng ký tự (Multi-Property Command)
 * Tự động ghi nhận revision chính xác nếu Track Changes đang BẬT.
 */
export function applyCharacterFormatting(
  editor: Editor | null,
  properties: Record<string, any>,
  author?: string
): boolean {
  if (!editor || !properties || Object.keys(properties).length === 0) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking || editor.state.selection.empty) {
    const chain = editor.chain();
    if (properties.bold !== undefined) {
      if (properties.bold) chain.setBold();
      else chain.unsetBold();
    }
    if (properties.italic !== undefined) {
      if (properties.italic) chain.setItalic();
      else chain.unsetItalic();
    }
    if (properties.underline !== undefined) {
      if (properties.underline) chain.setUnderline();
      else chain.unsetUnderline();
    }
    if (properties.strike !== undefined) {
      if (properties.strike) chain.setStrike();
      else chain.unsetStrike();
    }
    if (properties.fontFamily !== undefined) {
      if (properties.fontFamily) chain.setFontFamily(properties.fontFamily);
      else chain.unsetFontFamily();
    }
    if (properties.fontSize !== undefined) {
      const validSize = validateFontSize(properties.fontSize);
      if (validSize !== null) chain.setFontSize(`${validSize}pt`);
      else chain.unsetFontSize();
    }
    if (properties.color !== undefined) {
      if (properties.color) chain.setColor(properties.color);
      else chain.unsetColor();
    }
    if (properties.highlight !== undefined) {
      if (properties.highlight) chain.setHighlight({ color: properties.highlight });
      else chain.unsetHighlight();
    }
    return chain.run();
  }
  const res = TrackChangesService.applyTrackedCharacterFormatting(editor, properties, author);
  return res.success || Boolean(res.noOp);
}

/* ==========================================================================
   Các lệnh cấu trúc đoạn văn, khối & lịch sử
   ========================================================================== */

export function setHeading(editor: Editor | null, level: 1 | 2 | 3): boolean {
  if (!editor) return false;
  return editor.commands.setHeading({ level });
}

export function setParagraph(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.commands.setParagraph();
}

export function toggleBulletList(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.commands.toggleBulletList();
}

export function toggleOrderedList(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.commands.toggleOrderedList();
}

export function setParagraphPagination(
  editor: Editor | null,
  pagination: {
    keepWithNext?: boolean | null;
    keepLinesTogether?: boolean | null;
    pageBreakBefore?: boolean | null;
    widowControl?: boolean | null;
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setParagraphPagination(pagination);
}

export function undo(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  if (canUndoStyle()) {
    const res = undoStyle(editor);
    TrackChangesService.syncTrackedChangesStore(editor.state.doc);
    return res;
  }
  const res = editor.commands.undo();
  if (res) {
    TrackChangesService.syncTrackedChangesStore(editor.state.doc);
    const remaining = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
    const activeId = useReviewStore.getState().activeChangeId;
    if (activeId && !remaining.some((s) => s.id === activeId)) {
      useReviewStore.getState().setActiveChangeId(remaining.length > 0 ? remaining[0].id : null);
    }
  }
  return res;
}

export function redo(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  if (canRedoStyle()) {
    const res = redoStyle(editor);
    TrackChangesService.syncTrackedChangesStore(editor.state.doc);
    return res;
  }
  const res = editor.commands.redo();
  if (res) {
    TrackChangesService.syncTrackedChangesStore(editor.state.doc);
    const remaining = TrackChangesService.getTrackedSpansFromPMDoc(editor.state.doc);
    const activeId = useReviewStore.getState().activeChangeId;
    if (activeId && !remaining.some((s) => s.id === activeId)) {
      useReviewStore.getState().setActiveChangeId(remaining.length > 0 ? remaining[0].id : null);
    }
  }
  return res;
}

export function canUndo(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return canUndoStyle() || editor.can().undo();
}

export function canRedo(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return canRedoStyle() || editor.can().redo();
}

export function setTextAlign(
  editor: Editor | null,
  alignment: "left" | "center" | "right" | "justify"
): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking) {
    return editor.commands.setTextAlign(alignment);
  }
  const res = TrackChangesService.applyTrackedParagraphFormatting(editor, { textAlign: alignment });
  return res.success || Boolean(res.noOp);
}

export const LINE_SPACING_PRESETS = ["1.0", "1.15", "1.5", "2.0"];

export function setLineSpacing(editor: Editor | null, lineSpacing: string): boolean {
  if (!editor || !lineSpacing) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking) {
    return editor.commands.setLineSpacing(lineSpacing);
  }
  const res = TrackChangesService.applyTrackedParagraphFormatting(editor, { lineSpacing });
  return res.success || Boolean(res.noOp);
}

export function unsetLineSpacing(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking) {
    return editor.commands.unsetLineSpacing();
  }
  const res = TrackChangesService.applyTrackedParagraphFormatting(editor, { lineSpacing: null });
  return res.success || Boolean(res.noOp);
}

/**
 * Lệnh áp dụng định dạng đoạn văn (Multi-Property Paragraph Formatting Command)
 * Tự động ghi nhận revision chính xác nếu Track Changes đang BẬT.
 */
export function applyParagraphFormatting(
  editor: Editor | null,
  properties: Record<string, any> | ((node: any) => Record<string, any>),
  author?: string
): boolean {
  if (!editor || !properties) return false;
  if (typeof properties === "object" && Object.keys(properties).length === 0) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking) {
    const { state, view } = editor;
    const { tr, selection } = state;
    let changed = false;
    const applyToNode = (node: any, pos: number) => {
      if (node.isTextblock && (node.type.name === "paragraph" || node.type.name === "heading")) {
        const targetAttrs = typeof properties === "function" ? properties(node) : properties;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...targetAttrs });
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
      tr.doc.nodesBetween(selection.from, selection.to, applyToNode);
    }
    if (changed) view.dispatch(tr);
    return changed;
  }
  const res = TrackChangesService.applyTrackedParagraphFormatting(editor, properties, author);
  return res.success || Boolean(res.noOp);
}

export function indent(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking) {
    return editor.commands.indent();
  }
  let isInsideListItem = false;
  for (let d = editor.state.selection.$from.depth; d > 0; d--) {
    if (editor.state.selection.$from.node(d).type.name === "listItem") {
      isInsideListItem = true;
      break;
    }
  }
  if (isInsideListItem) {
    return editor.commands.indent();
  }
  return applyParagraphFormatting(editor, (node: any) => {
    const cur = (node.attrs.indent as number) || 0;
    return { indent: Math.min(8, cur + 1) };
  });
}

export function outdent(editor: Editor | null): boolean {
  if (!editor) return false;
  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (!isTracking) {
    return editor.commands.outdent();
  }
  let isInsideListItem = false;
  for (let d = editor.state.selection.$from.depth; d > 0; d--) {
    if (editor.state.selection.$from.node(d).type.name === "listItem") {
      isInsideListItem = true;
      break;
    }
  }
  if (isInsideListItem) {
    return editor.commands.outdent();
  }
  return applyParagraphFormatting(editor, (node: any) => {
    const cur = (node.attrs.indent as number) || 0;
    return { indent: Math.max(0, cur - 1) };
  });
}

export function insertHardBreak(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.commands.setHardBreak();
}

export function focusEditor(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.commands.focus();
}

export {
  applyParagraphStyle,
  setParagraphSpacing,
  setParagraphIndents,
  clearDirectParagraphFormatting,
  type ApplyParagraphStyleOptions,
  type SetParagraphSpacingOptions,
  type SetParagraphIndentsOptions,
} from "../styles/services/applyStyleService.ts";

export {
  applyCharacterStyle,
  removeCharacterStyle,
  getCurrentCharacterStyleId,
} from "../styles/services/characterStyleService.ts";

export {
  createStyle,
  updateStyle,
  renameStyle,
  duplicateStyle,
  deleteStyle,
  updateStyleFromSelection,
  getStyleUsage,
  type CreateStyleOptions,
  type UpdateStyleOptions,
  type DeleteStyleOptions,
  type UpdateStyleFromSelectionOptions,
  type StyleUsageInfo,
  type StyleOperationResult,
} from "../styles/services/styleManagementService.ts";

export {
  undoStyle,
  redoStyle,
  canUndoStyle,
  canRedoStyle,
  clearStyleHistory,
} from "../styles/services/styleHistoryService.ts";



/* ==========================================================================
   Hàm truy vấn trạng thái active của Selection
   ========================================================================== */

export function isMarkActive(
  editor: Editor | null,
  mark: "bold" | "italic" | "strike" | "underline"
): boolean {
  if (!editor) return false;
  return editor.isActive(mark);
}

export function isHeadingActive(
  editor: Editor | null,
  level?: 1 | 2 | 3
): boolean {
  if (!editor) return false;
  return level ? editor.isActive("heading", { level }) : editor.isActive("heading");
}

export function isListActive(
  editor: Editor | null,
  type: "bulletList" | "orderedList"
): boolean {
  if (!editor) return false;
  return editor.isActive(type);
}

export function isAlignActive(
  editor: Editor | null,
  alignment: "left" | "center" | "right" | "justify"
): boolean {
  if (!editor) return false;
  if (alignment === "left") {
    return (
      editor.isActive({ textAlign: "left" }) ||
      (!editor.isActive({ textAlign: "center" }) &&
        !editor.isActive({ textAlign: "right" }) &&
        !editor.isActive({ textAlign: "justify" }))
    );
  }
  return editor.isActive({ textAlign: alignment });
}

export function getCurrentLineSpacing(editor: Editor | null): string {
  if (!editor) return "1.15";
  const pAttr = editor.getAttributes("paragraph").lineSpacing;
  const hAttr = editor.getAttributes("heading").lineSpacing;
  return pAttr || hAttr || "1.15";
}

export function getCurrentIndent(editor: Editor | null): number {
  if (!editor) return 0;
  const pIndent = editor.getAttributes("paragraph").indent;
  const hIndent = editor.getAttributes("heading").indent;
  return pIndent || hIndent || 0;
}

export function getCurrentFontFamily(editor: Editor | null): string | null {
  if (!editor) return null;
  const attrs = editor.getAttributes("textStyle");
  return attrs.fontFamily || null;
}

export function getCurrentFontSize(editor: Editor | null): number | null {
  if (!editor) return null;
  const attrs = editor.getAttributes("textStyle");
  if (!attrs.fontSize) return null;
  return validateFontSize(attrs.fontSize);
}

export function getCurrentTextColor(editor: Editor | null): string | null {
  if (!editor) return null;
  const attrs = editor.getAttributes("textStyle");
  return attrs.color || null;
}

export function getCurrentHighlight(editor: Editor | null): string | null {
  if (!editor) return null;
  const attrs = editor.getAttributes("highlight");
  return attrs.color || null;
}

export function getDocumentJSON(editor: Editor | null): JSONContent | null {
  if (!editor) return null;
  return editor.getJSON();
}

/* ==========================================================================
   Các lệnh Tìm kiếm & Thay thế (Phase 1.6 - Find & Replace)
   ========================================================================== */

/**
 * Đảm bảo các plugin của ProseMirror được nạp vào editor state (đặc biệt khi chạy headless test).
 */
export function ensureEditorPlugins(editor: Editor | null): void {
  if (!editor) return;
  if (editor.state.plugins.length === 0 && (editor.extensionManager?.plugins?.length ?? 0) > 0) {
    const newState = editor.state.reconfigure({ plugins: editor.extensionManager.plugins });
    editor.view.updateState(newState);
  }
}

export function setSearchTerm(
  editor: Editor | null,
  term: string,
  caseSensitive?: boolean
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setSearchTerm(term, caseSensitive);
}

export function setReplaceTerm(editor: Editor | null, term: string): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setReplaceTerm(term);
}

export function setCaseSensitive(editor: Editor | null, caseSensitive: boolean): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setCaseSensitive(caseSensitive);
}

export function goToNextMatch(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.goToNextMatch();
}

export function goToPreviousMatch(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.goToPreviousMatch();
}

export function replaceCurrentMatch(
  editor: Editor | null,
  replacement?: string
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.replaceCurrentMatch(replacement);
}

export function replaceAllMatches(
  editor: Editor | null,
  replacement?: string
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.replaceAllMatches(replacement);
}

export function clearSearch(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.clearSearch();
}

export function getSearchState(editor: Editor | null): SearchPluginState | null {
  if (!editor) return null;
  ensureEditorPlugins(editor);
  return searchPluginKey.getState(editor.state) || null;
}

/* ==========================================================================
   Các lệnh Phân trang & Ngắt trang (Phase 2.5 - Page Breaks)
   ========================================================================== */

/**
 * Chèn một ngắt trang semantic (Page Break) vào vị trí con trỏ hiện tại.
 * UI/Ribbon gọi abstraction này thay vì trực tiếp can thiệp DOM document.
 */
export function insertPageBreak(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setPageBreak();
}

/* ==========================================================================
   Các lệnh Phân phần & Ngắt phần (Phase 2.7 - Section Breaks)
   ========================================================================== */

/**
 * Chèn một ngắt phần semantic (Section Break - Next Page) vào vị trí con trỏ hiện tại.
 * UI/Ribbon gọi abstraction này thay vì trực tiếp can thiệp DOM document.
 */
export function insertSectionBreak(
  editor: Editor | null,
  options?: {
    pageSettings?: import("../page/types/pageTypes.ts").PageSettings;
    headerFooter?: import("../page/types/headerFooterTypes.ts").SectionHeaderFooter;
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setSectionBreak(options);
}


/**
 * Cập nhật thuộc tính pageSettings của một SectionBreak node trong ProseMirror editor.
 * Đảm bảo đồng bộ 2 chiều giữa Ribbon và Editor ProseMirror AST (Phase 2.7).
 */
export function updateSectionSettings(
  editor: Editor | null,
  sectionIndex: number,
  partialSettings: Partial<PageSettings>,
  defaultSettings: PageSettings
): boolean {
  if (!editor || !editor.state) return false;
  if (sectionIndex <= 1) {
    // Section 1 nằm ở document-level pageSettings
    return true;
  }

  const { state, view } = editor;
  let breakCount = 0;
  const targetIndex = sectionIndex - 1;
  let targetPos: number | null = null;
  let targetNode: any = null;

  state.doc.descendants((node, pos) => {
    if (node.type.name === "sectionBreak") {
      breakCount++;
      if (breakCount === targetIndex) {
        targetPos = pos;
        targetNode = node;
        return false;
      }
    }
    return true;
  });

  if (targetPos !== null && targetNode) {
    const existingSettings = (targetNode.attrs?.pageSettings as PageSettings) || defaultSettings;
    const merged = validateAndNormalizePageSettings({
      ...existingSettings,
      ...partialSettings,
      margins: partialSettings.margins
        ? { ...existingSettings.margins, ...partialSettings.margins }
        : existingSettings.margins,
    });

    const tr = state.tr.setNodeMarkup(targetPos, undefined, {
      ...targetNode.attrs,
      pageSettings: merged,
    });
    view.dispatch(tr);
    return true;
  }

  return false;
}

/**
 * Cập nhật thuộc tính headerFooter của một SectionBreak node trong ProseMirror editor.
 * Đảm bảo đồng bộ 2 chiều giữa UI HeaderFooter và Editor ProseMirror AST (Phase 2.8).
 */
export function updateSectionHeaderFooter(
  editor: Editor | null,
  sectionIndex: number,
  partialHeaderFooter: {
    linkToPrevious?: boolean;
    header?: Partial<import("../page/types/headerFooterTypes.ts").HeaderFooterItem>;
    footer?: Partial<import("../page/types/headerFooterTypes.ts").HeaderFooterItem>;
  }
): boolean {
  if (!editor || !editor.state) return false;
  if (sectionIndex <= 1) {
    // Section 1 nằm ở document-level headerFooter
    return true;
  }

  const { state, view } = editor;
  let breakCount = 0;
  const targetIndex = sectionIndex - 1;
  let targetPos: number | null = null;
  let targetNode: any = null;

  state.doc.descendants((node, pos) => {
    if (node.type.name === "sectionBreak") {
      breakCount++;
      if (breakCount === targetIndex) {
        targetPos = pos;
        targetNode = node;
        return false;
      }
    }
    return true;
  });

  if (targetPos !== null && targetNode) {
    const existing = (targetNode.attrs?.headerFooter as import("../page/types/headerFooterTypes.ts").SectionHeaderFooter) || {
      linkToPrevious: true,
      header: { text: "", alignment: "center" },
      footer: { text: "", alignment: "center" },
    };

    const merged = {
      linkToPrevious:
        partialHeaderFooter.linkToPrevious !== undefined
          ? partialHeaderFooter.linkToPrevious
          : existing.linkToPrevious,
      header: {
        ...existing.header,
        ...(partialHeaderFooter.header || {}),
      },
      footer: {
        ...existing.footer,
        ...(partialHeaderFooter.footer || {}),
      },
    };

    const tr = state.tr.setNodeMarkup(targetPos, undefined, {
      ...targetNode.attrs,
      headerFooter: merged,
    });
    view.dispatch(tr);
    return true;
  }

  return false;
}

/* ==========================================================================
   Các lệnh Insert Phase 3.2: Hyperlink, Horizontal Line, Symbol
   ========================================================================== */

/**
 * Chèn một đường kẻ ngang semantic (Horizontal Rule) vào vị trí con trỏ hiện tại.
 */
export function insertHorizontalRule(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setHorizontalRule();
}

/**
 * Gán hyperlink lên vùng chọn hiện tại.
 */
export function setLink(editor: Editor | null, href: string): boolean {
  if (!editor || !href) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setLink({ href });
}

/**
 * Hủy bỏ hyperlink khỏi vùng chọn hoặc liên kết hiện tại.
 */
export function unsetLink(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.unsetLink();
}

/**
 * Kiểm tra xem vị trí con trỏ hoặc vùng chọn hiện tại có chứa link hay không.
 */
export function isLinkActive(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.isActive("link");
}

/**
 * Lấy các thuộc tính của link hiện tại.
 */
export function getLinkAttributes(editor: Editor | null): { href?: string } {
  if (!editor) return {};
  return editor.getAttributes("link");
}

/**
 * Chèn hoặc cập nhật hyperlink (Hyperlink Dialog submission).
 */
export function updateOrInsertLink(
  editor: Editor | null,
  text: string,
  href: string
): boolean {
  if (!editor || !editor.state) return false;
  ensureEditorPlugins(editor);

  const { state } = editor;
  const linkInfo = getActiveLinkInfo(editor);

  if (linkInfo) {
    // Đang sửa link hiện có: giữ lại các mark khác (bold, italic...) và áp dụng link mới
    const otherMarks = state.doc
      .resolve(linkInfo.from)
      .marks()
      .filter((m) => m.type.name !== "link");
    const tr = state.tr;
    tr.delete(linkInfo.from, linkInfo.to);
    const linkMark = state.schema.marks.link.create({ href });
    const textNode = state.schema.text(text, [...otherMarks, linkMark]);
    tr.insert(linkInfo.from, textNode);
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  const { from, to, empty } = state.selection;
  if (!empty) {
    const selectedText = state.doc.textBetween(from, to, " ");
    if (selectedText === text) {
      // Chỉ gán link lên vùng chọn hiện tại
      return editor.commands.setLink({ href });
    }
    // Văn bản hiển thị bị thay đổi so với vùng chọn ban đầu
    const otherMarks = state.selection.$from.marks().filter((m) => m.type.name !== "link");
    const tr = state.tr;
    tr.delete(from, to);
    const linkMark = state.schema.marks.link.create({ href });
    const textNode = state.schema.text(text, [...otherMarks, linkMark]);
    tr.insert(from, textNode);
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  // Caret đang ở vị trí rỗng: chèn nội dung text mới kèm link
  const otherMarks = (state.storedMarks || state.selection.$from.marks() || []).filter(
    (m) => m.type.name !== "link"
  );
  const tr = state.tr;
  const linkMark = state.schema.marks.link.create({ href });
  const textNode = state.schema.text(text, [...otherMarks, linkMark]);
  tr.insert(from, textNode);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Chèn một ký hiệu đặc biệt Unicode (Symbol) vào vị trí con trỏ hiện tại,
 * bảo toàn đầy đủ các mark/định dạng (bold, italic, font...) đang kích hoạt tại caret.
 */
export function insertSymbol(editor: Editor | null, symbol: string): boolean {
  if (!editor || !symbol) return false;
  ensureEditorPlugins(editor);
  const { state, view } = editor;
  const { from, to, empty } = state.selection;
  const tr = state.tr;

  // Lấy các marks đang active (storedMarks hoặc marks tại caret)
  const marks = state.storedMarks || (empty ? state.selection.$from.marks() : undefined);

  if (!empty) {
    tr.delete(from, to);
  }

  if (marks && marks.length > 0) {
    const textNode = state.schema.text(symbol, marks);
    tr.replaceSelectionWith(textNode);
  } else {
    tr.insertText(symbol);
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

/* ==========================================================================
   Các lệnh Bảng (Table Commands - Phase 3.3)
   ========================================================================== */

export interface InsertTableCommandOptions {
  rows: number;
  cols: number;
  withHeaderRow?: boolean;
}

/**
 * Giới hạn an toàn cho kích thước bảng:
 * Tránh tạo bảng quá lớn làm treo trình duyệt hoặc tràn bộ nhớ.
 */
export const TABLE_LIMITS = {
  MIN_ROWS: 1,
  MAX_ROWS: 50,
  MIN_COLS: 1,
  MAX_COLS: 20,
  DEFAULT_ROWS: 3,
  DEFAULT_COLS: 3,
} as const;

/**
 * Xác thực thông số chèn bảng.
 */
export function validateTableDimensions(
  rows: number = TABLE_LIMITS.DEFAULT_ROWS,
  cols: number = TABLE_LIMITS.DEFAULT_COLS
): {
  isValid: boolean;
  error?: string;
  sanitizedRows: number;
  sanitizedCols: number;
} {
  if (typeof rows !== "number" || isNaN(rows) || typeof cols !== "number" || isNaN(cols)) {
    return {
      isValid: false,
      error: "Số hàng và số cột phải là số hợp lệ.",
      sanitizedRows: TABLE_LIMITS.DEFAULT_ROWS,
      sanitizedCols: TABLE_LIMITS.DEFAULT_COLS,
    };
  }

  const r = Math.floor(rows);
  const c = Math.floor(cols);

  if (r < TABLE_LIMITS.MIN_ROWS || c < TABLE_LIMITS.MIN_COLS) {
    return {
      isValid: false,
      error: `Bảng phải có tối thiểu ${TABLE_LIMITS.MIN_ROWS} hàng và ${TABLE_LIMITS.MIN_COLS} cột.`,
      sanitizedRows: Math.max(TABLE_LIMITS.MIN_ROWS, r),
      sanitizedCols: Math.max(TABLE_LIMITS.MIN_COLS, c),
    };
  }

  if (r > TABLE_LIMITS.MAX_ROWS || c > TABLE_LIMITS.MAX_COLS) {
    return {
      isValid: false,
      error: `Kích thước tối đa cho phép là ${TABLE_LIMITS.MAX_ROWS} hàng × ${TABLE_LIMITS.MAX_COLS} cột.`,
      sanitizedRows: Math.min(TABLE_LIMITS.MAX_ROWS, r),
      sanitizedCols: Math.min(TABLE_LIMITS.MAX_COLS, c),
    };
  }

  return {
    isValid: true,
    sanitizedRows: r,
    sanitizedCols: c,
  };
}

/**
 * Chèn một bảng semantic mới vào vị trí con trỏ hiện tại.
 */
export function insertTable(
  editor: Editor | null,
  options?: Partial<InsertTableCommandOptions>
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);

  const rawRows = options?.rows ?? TABLE_LIMITS.DEFAULT_ROWS;
  const rawCols = options?.cols ?? TABLE_LIMITS.DEFAULT_COLS;
  const withHeaderRow = options?.withHeaderRow ?? true;

  const validation = validateTableDimensions(rawRows, rawCols);
  if (!validation.isValid) {
    return false;
  }

  return editor.commands.insertTable({
    rows: validation.sanitizedRows,
    cols: validation.sanitizedCols,
    withHeaderRow,
  });
}

/**
 * Kiểm tra xem con trỏ hoặc vùng chọn hiện tại có nằm trong bảng hay không.
 */
export function isTableActive(editor: Editor | null): boolean {
  if (!editor) return false;
  return editor.isActive("table");
}

export function canAddRowAbove(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  return editor.can().addRowBefore();
}

/**
 * Thêm một hàng phía trên hàng hiện tại (Add Row Above).
 */
export function addRowAbove(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.addRowBefore();
}

export function canAddRowBelow(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  return editor.can().addRowAfter();
}

/**
 * Thêm một hàng phía dưới hàng hiện tại (Add Row Below).
 */
export function addRowBelow(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.addRowAfter();
}

export function canDeleteRow(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  return editor.can().deleteRow();
}

/**
 * Xóa hàng hiện tại chứa con trỏ (Delete Row).
 */
export function deleteRow(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.deleteRow();
}

export function canAddColumnLeft(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  return editor.can().addColumnBefore();
}

/**
 * Thêm một cột bên trái cột hiện tại (Add Column Left).
 */
export function addColumnLeft(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.addColumnBefore();
}

export function canAddColumnRight(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  return editor.can().addColumnAfter();
}

/**
 * Thêm một cột bên phải cột hiện tại (Add Column Right).
 */
export function addColumnRight(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.addColumnAfter();
}

export function canDeleteColumn(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  return editor.can().deleteColumn();
}

/**
 * Xóa cột hiện tại chứa con trỏ (Delete Column).
 */
export function deleteColumn(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.deleteColumn();
}

/**
 * Xóa toàn bộ bảng hiện tại (Delete Table).
 */
export function deleteTable(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.deleteTable();
}

/**
 * Kiểm tra xem có thể chuyển đổi trạng thái dòng tiêu đề hay không.
 * Disallows toggleHeaderRow nếu bất kỳ ô nào ở hàng 0 đang có rowspan > 1 kéo dài xuống hàng body
 * để bảo vệ tính toàn vẹn của Header Row và quy tắc lặp tiêu đề phân trang.
 */
export function canToggleHeaderRow(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  try {
    const rect = selectedRect(editor.state);
    const { map, table } = rect;
    for (let col = 0; col < map.width; col++) {
      const cellPos = map.map[col];
      const cell = table.nodeAt(cellPos);
      if (cell && (cell.attrs?.rowspan || 1) > 1) {
        return false;
      }
    }
    return editor.can().toggleHeaderRow();
  } catch {
    return false;
  }
}

/**
 * Chuyển đổi trạng thái dòng tiêu đề (Toggle Header Row).
 */
export function toggleHeaderRow(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  if (!canToggleHeaderRow(editor)) {
    return false;
  }
  return editor.commands.toggleHeaderRow();
}

/**
 * Di chuyển con trỏ sang ô tiếp theo (hỗ trợ phím Tab).
 */
export function goToNextCell(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.goToNextCell();
}

/**
 * Di chuyển con trỏ sang ô trước đó (hỗ trợ phím Shift+Tab).
 */
export function goToPreviousCell(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.goToPreviousCell();
}

/* ==========================================================================
   Lệnh thao tác bảng nâng cao (Table Advanced Commands - Phase 3.4)
   ========================================================================== */

/**
 * Kiểm tra xem vùng chọn hiện tại có hợp lệ để thực hiện hợp ô (Merge Cells) không:
 * 1. Con trỏ phải ở trong bảng và đang chọn ít nhất 2 ô qua CellSelection.
 * 2. Vùng chọn phải là một hình chữ nhật hợp lệ trên ma trận TableMap.
 * 3. Header Merge Policy: Không cho phép trộn ô theo chiều dọc vượt ranh giới Header và Body
 *    (tránh tạo ra ô tableHeader trải dài vào body row hoặc ngược lại, gây lỗi lặp tiêu đề và phân trang).
 */
export function isSelectionMergeable(editor: Editor | null): boolean {
  if (!editor || !editor.state) return false;
  if (!editor.isActive("table")) return false;

  const { state } = editor;
  const { selection } = state;

  if (!(selection instanceof CellSelection)) {
    return false;
  }

  if (selection.$anchorCell.pos === selection.$headCell.pos) {
    return false;
  }

  if (!editor.can().mergeCells()) {
    return false;
  }

  try {
    const rect = selectedRect(state);
    if (rect.top < rect.bottom - 1) {
      // Vùng chọn trải dài qua từ 2 hàng trở lên theo chiều dọc
      const { map, table } = rect;
      let hasHeaderCell = false;
      let hasBodyCell = false;

      for (let row = rect.top; row < rect.bottom; row++) {
        for (let col = rect.left; col < rect.right; col++) {
          const cellPos = map.map[row * map.width + col];
          const cellNode = table.nodeAt(cellPos);
          if (cellNode) {
            if (
              cellNode.type.name === "tableHeader" ||
              cellNode.type.spec.tableRole === "header_cell"
            ) {
              hasHeaderCell = true;
            } else if (
              cellNode.type.name === "tableCell" ||
              cellNode.type.spec.tableRole === "cell"
            ) {
              hasBodyCell = true;
            }
          }
        }
      }

      if (hasHeaderCell && hasBodyCell) {
        // Cấm merge dọc vượt ranh giới Header <-> Body!
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Kiểm tra xem các ô đang chọn có thể trộn/hợp nhất (Merge Cells) được không.
 */
export function canMergeCells(editor: Editor | null): boolean {
  return isSelectionMergeable(editor);
}

/**
 * Hợp nhất các ô đang chọn thành một ô duy nhất (Merge Cells).
 */
export function mergeCells(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  if (!isSelectionMergeable(editor)) return false;
  return editor.commands.mergeCells();
}

/**
 * Kiểm tra xem ô hiện tại có thể tách ô (Split Cell) được không.
 * Hỗ trợ các ô có colspan > 1, rowspan > 1, hoặc cả hai.
 */
export function canSplitCell(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  return editor.can().splitCell();
}

/**
 * Tách ô đã hợp nhất trở lại thành các ô ban đầu (Split Cell 2.0).
 * Bảo toàn nội dung ở ô đầu tiên và tạo ô trống hợp lệ cho các ô còn lại.
 */
export function splitCell(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  if (!editor.can().splitCell()) return false;
  return editor.commands.splitCell();
}

/**
 * Tự động hợp nhất hoặc tách ô tùy theo ngữ cảnh vùng chọn (Merge or Split).
 */
export function mergeOrSplit(editor: Editor | null): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  if (canMergeCells(editor)) {
    return mergeCells(editor);
  }
  if (canSplitCell(editor)) {
    return splitCell(editor);
  }
  return false;
}

/**
 * Chuẩn hóa một vị trí trong document thành vị trí bắt đầu của TableCell hoặc TableHeader.
 * Hỗ trợ vị trí bên trong cell (paragraph, text) hoặc ngay trước cell.
 */
export function normalizeCellPosition(
  doc: import("@tiptap/pm/model").Node,
  pos: number
): number | null {
  try {
    if (pos < 0 || pos > doc.content.size) return null;
    const $pos = doc.resolve(pos);
    if (pointsAtCell($pos)) {
      return $pos.pos;
    }
    // Nếu pos nằm bên trong cell, tìm node cell ở các cấp depth phía trên
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d);
      if (
        node.type.spec.tableRole === "cell" ||
        node.type.spec.tableRole === "header_cell"
      ) {
        return $pos.before(d);
      }
    }
    // Fallback qua cellNear
    const near = cellNear($pos);
    if (near && pointsAtCell(near)) {
      return near.pos;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Thiết lập CellSelection trong bảng giữa ô anchor và ô head.
 * Tự động chuẩn hóa vị trí nếu trỏ vào trong ô, và kiểm tra tính hợp lệ cùng bảng.
 */
export function setTableCellSelection(
  editor: Editor | null,
  anchorCell: number,
  headCell?: number
): boolean {
  if (!editor || !editor.state) return false;
  try {
    const doc = editor.state.doc;
    const normAnchor = normalizeCellPosition(doc, anchorCell);
    const normHead = headCell !== undefined ? normalizeCellPosition(doc, headCell) : normAnchor;
    if (normAnchor === null || normHead === null) return false;

    const $anchor = doc.resolve(normAnchor);
    const $head = doc.resolve(normHead);
    if (!inSameTable($anchor, $head)) return false;

    return editor.commands.setCellSelection({
      anchorCell: normAnchor,
      headCell: normHead,
    });
  } catch {
    return false;
  }
}

/**
 * Di chuyển con trỏ sang ô tiếp theo với xử lý phím Tab chuẩn:
 * - Nếu còn ô: nhảy sang ô tiếp theo (bỏ qua covered cells).
 * - Nếu đang ở ô cuối cùng: thêm một hàng mới phía dưới và nhảy vào ô đầu tiên của hàng mới.
 */
export function handleTabNavigation(
  editor: Editor | null,
  options: { addRowOnFinalCell?: boolean } = { addRowOnFinalCell: true }
): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  if (editor.commands.goToNextCell()) {
    return true;
  }
  if (options.addRowOnFinalCell) {
    return editor.chain().addRowAfter().goToNextCell().run();
  }
  return false;
}

/**
 * Lấy cấu trúc TableMap của một table node.
 */
export function getTableMap(tableNode: import("@tiptap/pm/model").Node): TableMap {
  return TableMap.get(tableNode);
}

/* ==========================================================================
   Lệnh Table Sizing Engine (Phase 4)
   ========================================================================== */
export {
  autoFitContents,
  autoFitWindow,
  setFixedColumnWidths,
  getTableLayoutMode,
  setTableLayoutMode,
  getSectionUsableWidthPx,
  calculateAutoFitContentWidths,
  calculateAutoFitWindowWidths,
} from "./tableSizingService.ts";
export type { TableSizingOptions } from "./tableSizingService.ts";

/* ==========================================================================
   Lệnh Table Dimension Controls (Phase 5)
   ========================================================================== */
export {
  setTableCellMargins,
  setCellMarginOverride,
  getEffectiveCellMargins,
  setTableRowHeight,
  getTableRowHeight,
  distributeTableColumns,
  distributeTableRows,
  validateAndNormalizeCellMargins,
  validateAndNormalizeRowHeight,
  ptToPx,
  pxToPt,
  mmToPxUnit,
  pxToMmUnit,
  DEFAULT_TABLE_CELL_MARGINS,
  DEFAULT_ROW_HEIGHT_SETTINGS,
} from "./tableDimensionService.ts";
export type {
  CellMargins,
  RowHeightRule,
  RowHeightSettings,
} from "./tableDimensionService.ts";

/* ==========================================================================
   Lệnh Table Styles Engine (Phase 6)
   ========================================================================== */
export {
  applyTableStyle,
  setTableStyleOptions,
  getTableStyleInfo,
  getTableStyle,
  getAllTableStyles,
  registerTableStyle,
  resolveCellPresentation,
  BUILT_IN_TABLE_STYLES,
  DEFAULT_TABLE_STYLE_OPTIONS,
} from "./tableStyleService.ts";
export type {
  TableStyleId,
  TableStyleOptions,
  TableStyleDefinition,
  TablePartStyle,
  ResolvedCellPresentation,
} from "./tableStyleService.ts";


/**
 * Căn chỉnh lề ngang nội dung ô (Left / Center / Right).
 */
export function setCellTextAlign(
  editor: Editor | null,
  alignment: "left" | "center" | "right"
): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setCellAttribute("textAlign", alignment);
}

/**
 * Căn chỉnh lề dọc nội dung ô (Top / Middle / Bottom).
 */
export function setCellVerticalAlign(
  editor: Editor | null,
  vAlignment: "top" | "middle" | "bottom"
): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setCellAttribute("verticalAlign", vAlignment);
}

/**
 * Thiết lập màu nền / highlight cho ô hoặc nhóm ô đang chọn.
 * Truyền null hoặc "" để xóa màu nền.
 */
export function setCellBackgroundColor(
  editor: Editor | null,
  color: string | null
): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setCellAttribute("backgroundColor", color || null);
}

/**
 * Thiết lập kiểu viền cho bảng ("all" | "none" | "outside").
 */
export function setTableBorders(
  editor: Editor | null,
  borders: "all" | "none" | "outside"
): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  return editor.commands.updateAttributes("table", { borders });
}

/**
 * Lấy kiểu viền hiện tại của bảng ("all" | "none" | "outside").
 */
export function getTableBorders(
  editor: Editor | null
): "all" | "none" | "outside" {
  if (!editor || !editor.isActive("table")) return "all";
  const attrs = editor.getAttributes("table");
  return (attrs?.borders as "all" | "none" | "outside") || "all";
}

/* ==========================================================================
   Lệnh thao tác Hình ảnh (Image Commands - Phase 3.5 & 3.6)
   ========================================================================== */

export {
  IMAGE_LIMITS,
  validateImageDimensions,
} from "./imageExtension.ts";
export type { ImageAlignment } from "./imageExtension.ts";

/**
 * Kiểm tra xem con trỏ hoặc vùng chọn có đang nằm trong / chọn Image hay không.
 */
export function isImageActive(editor: Editor | null): boolean {
  if (!editor || !editor.state) return false;
  if (editor.isActive("image")) return true;
  const sel = editor.state.selection as any;
  if (sel?.node?.type?.name === "image") return true;
  if (sel?.$from?.nodeBefore?.type?.name === "image") return true;
  if (sel?.$from?.nodeAfter?.type?.name === "image") return true;
  return false;
}

/**
 * Lấy thuộc tính của Image đang chọn.
 */
export function getImageAttributes(editor: Editor | null): Record<string, any> {
  if (!editor || !isImageActive(editor)) return {};
  const sel = editor.state.selection as any;
  if (sel?.node?.type?.name === "image") {
    return sel.node.attrs || {};
  }
  if (sel?.$from?.nodeBefore?.type?.name === "image") {
    return sel.$from.nodeBefore.attrs || {};
  }
  if (sel?.$from?.nodeAfter?.type?.name === "image") {
    return sel.$from.nodeAfter.attrs || {};
  }
  return editor.getAttributes("image") || {};
}

/**
 * Chèn một Hình ảnh (Image) semantic vào tài liệu.
 */
export function insertImage(
  editor: Editor | null,
  options: {
    src: string;
    alt?: string;
    title?: string;
    width?: number;
    height?: number;
    alignment?: import("./imageExtension.ts").ImageAlignment;
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.insertImage(options);
}

/**
 * Xóa Hình ảnh hiện tại.
 */
export function deleteImage(editor: Editor | null): boolean {
  if (!editor || !isImageActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.deleteImage();
}

/**
 * Cập nhật kích thước Hình ảnh.
 */
export function setImageDimensions(
  editor: Editor | null,
  width: number,
  height: number
): boolean {
  if (!editor || !isImageActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setImageDimensions(width, height);
}

/**
 * Cập nhật căn lề Hình ảnh (trái, giữa, phải).
 */
export function setImageAlignment(
  editor: Editor | null,
  alignment: import("./imageExtension.ts").ImageAlignment
): boolean {
  if (!editor || !isImageActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setImageAlignment(alignment);
}

/**
 * Cập nhật văn bản thay thế (alt text) của Hình ảnh.
 */
export function setImageAlt(
  editor: Editor | null,
  alt: string
): boolean {
  if (!editor || !isImageActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setImageAlt(alt);
}

/* ==========================================================================
   Lệnh thao tác Hộp văn bản (Text Box Commands - Phase 3.7)
   ========================================================================== */

export {
  TEXTBOX_LIMITS,
  validateTextBoxDimensions,
} from "./textBoxExtension.ts";
export type { TextBoxAlignment } from "./textBoxExtension.ts";

/**
 * Kiểm tra xem con trỏ hoặc vùng chọn có đang nằm trong Text Box hay không.
 */
export function isTextBoxActive(editor: Editor | null): boolean {
  if (!editor || !editor.state) return false;
  if (editor.isActive("textBox")) return true;
  const sel = editor.state.selection as any;
  if (sel?.node?.type?.name === "textBox") return true;
  return false;
}

/**
 * Chèn một Text Box semantic vào vị trí hiện tại của tài liệu.
 */
export function insertTextBox(
  editor: Editor | null,
  options?: {
    width?: number;
    initialText?: string;
    alignment?: "left" | "center" | "right";
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.insertTextBox(options);
}

/**
 * Xóa Text Box hiện tại đang chọn hoặc chứa con trỏ.
 */
export function deleteTextBox(editor: Editor | null): boolean {
  if (!editor || !isTextBoxActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.deleteTextBox();
}

/**
 * Thay đổi độ rộng của Text Box hiện tại với validation an toàn.
 */
export function setTextBoxWidth(
  editor: Editor | null,
  width: number
): boolean {
  if (!editor || !isTextBoxActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setTextBoxWidth(width);
}

/**
 * Thay đổi vị trí căn lề (left / center / right) của Text Box.
 */
export function setTextBoxAlignment(
  editor: Editor | null,
  alignment: "left" | "center" | "right"
): boolean {
  if (!editor || !isTextBoxActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setTextBoxAlignment(alignment);
}

/**
 * Thay đổi màu nền của Text Box.
 */
export function setTextBoxBackgroundColor(
  editor: Editor | null,
  color: string | null
): boolean {
  if (!editor || !isTextBoxActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setTextBoxBackgroundColor(color);
}

/**
 * Thay đổi màu viền của Text Box.
 */
export function setTextBoxBorderColor(
  editor: Editor | null,
  color: string | null
): boolean {
  if (!editor || !isTextBoxActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setTextBoxBorderColor(color);
}

/**
 * Thiết lập hoặc cập nhật thuộc tính DrawingPosition cho Floating Text Box.
 */
export function setTextBoxDrawingPosition(
  editor: Editor | null,
  position: DrawingPosition | null
): boolean {
  if (!editor || !isTextBoxActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setTextBoxDrawingPosition(position);
}

/**
 * Chèn một Floating Text Box với vị trí neo nổi.
 */
export function insertFloatingTextBox(
  editor: Editor | null,
  options?: {
    width?: number;
    height?: number;
    initialText?: string;
    position?: Partial<DrawingPosition>;
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.insertFloatingTextBox(options);
}

/* ==========================================================================
   Lệnh thao tác Hình vẽ (Shape Commands - Phase 3.8)
   ========================================================================== */

export {
  SHAPE_LIMITS,
  validateShapeDimensions,
} from "./shapeExtension.ts";
export type { ShapeType, ShapeAlignment } from "./shapeExtension.ts";

/**
 * Kiểm tra xem con trỏ hoặc vùng chọn có đang nằm trong / chọn Shape hay không.
 */
export function isShapeActive(editor: Editor | null): boolean {
  if (!editor || !editor.state) return false;
  if (editor.isActive("shape")) return true;
  const sel = editor.state.selection as any;
  if (sel?.node?.type?.name === "shape") return true;
  if (sel?.$from?.nodeBefore?.type?.name === "shape") return true;
  if (sel?.$from?.nodeAfter?.type?.name === "shape") return true;
  return false;
}

/**
 * Lấy thuộc tính của Shape đang chọn.
 */
export function getShapeAttributes(editor: Editor | null): Record<string, any> {
  if (!editor || !isShapeActive(editor)) return {};
  const sel = editor.state.selection as any;
  if (sel?.node?.type?.name === "shape") {
    return sel.node.attrs || {};
  }
  if (sel?.$from?.nodeBefore?.type?.name === "shape") {
    return sel.$from.nodeBefore.attrs || {};
  }
  if (sel?.$from?.nodeAfter?.type?.name === "shape") {
    return sel.$from.nodeAfter.attrs || {};
  }
  return editor.getAttributes("shape") || {};
}

/**
 * Chèn một Hình vẽ (Shape) semantic vào tài liệu.
 */
export function insertShape(
  editor: Editor | null,
  options?: {
    shapeType?: import("./shapeExtension.ts").ShapeType;
    width?: number;
    height?: number;
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    alignment?: "left" | "center" | "right";
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.insertShape(options);
}

/**
 * Xóa Hình vẽ hiện tại.
 */
export function deleteShape(editor: Editor | null): boolean {
  if (!editor || !isShapeActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.deleteShape();
}

/**
 * Cập nhật kích thước Hình vẽ.
 */
export function setShapeDimensions(
  editor: Editor | null,
  width: number,
  height: number
): boolean {
  if (!editor || !isShapeActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setShapeDimensions(width, height);
}

/**
 * Cập nhật màu tô Hình vẽ.
 */
export function setShapeFillColor(
  editor: Editor | null,
  fillColor: string
): boolean {
  if (!editor || !isShapeActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setShapeFillColor(fillColor);
}

/**
 * Cập nhật màu viền Hình vẽ.
 */
export function setShapeStrokeColor(
  editor: Editor | null,
  strokeColor: string
): boolean {
  if (!editor || !isShapeActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setShapeStrokeColor(strokeColor);
}

/**
 * Cập nhật độ dày viền Hình vẽ.
 */
export function setShapeStrokeWidth(
  editor: Editor | null,
  strokeWidth: number
): boolean {
  if (!editor || !isShapeActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setShapeStrokeWidth(strokeWidth);
}

/**
 * Cập nhật căn lề Hình vẽ (trái, giữa, phải).
 */
export function setShapeAlignment(
  editor: Editor | null,
  alignment: "left" | "center" | "right"
): boolean {
  if (!editor || !isShapeActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setShapeAlignment(alignment);
}

/**
 * Cập nhật cấu hình vị trí DrawingPosition (Floating/Inline) cho Shape đang chọn.
 */
export function setShapeDrawingPosition(
  editor: Editor | null,
  position: import("../docx/drawing/drawingTypes.ts").DrawingPosition | null
): boolean {
  if (!editor || !isShapeActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setShapeDrawingPosition(position);
}

/**
 * Chèn một Hình vẽ ở chế độ Floating (DrawingML Anchor).
 */
export function insertFloatingShape(
  editor: Editor | null,
  options?: {
    shapeType?: import("./shapeExtension.ts").ShapeType;
    width?: number;
    height?: number;
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    position?: Partial<import("../docx/drawing/drawingTypes.ts").DrawingPosition>;
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.insertFloatingShape(options);
}

/* ==========================================================================
   Lệnh thao tác Công thức / Phương trình (Equation Commands - Phase 3.8)
   ========================================================================== */

export type { EquationAlignment } from "./equationExtension.ts";

/**
 * Kiểm tra xem con trỏ hoặc vùng chọn có đang nằm trong / chọn Equation hay không.
 */
export function isEquationActive(editor: Editor | null): boolean {
  if (!editor || !editor.state) return false;
  if (editor.isActive("equation")) return true;
  const sel = editor.state.selection as any;
  if (sel?.node?.type?.name === "equation") return true;
  if (sel?.$from?.nodeBefore?.type?.name === "equation") return true;
  if (sel?.$from?.nodeAfter?.type?.name === "equation") return true;
  return false;
}

/**
 * Lấy thuộc tính của Equation đang chọn.
 */
export function getEquationAttributes(editor: Editor | null): Record<string, any> {
  if (!editor || !isEquationActive(editor)) return {};
  const sel = editor.state.selection as any;
  if (sel?.node?.type?.name === "equation") {
    return sel.node.attrs || {};
  }
  if (sel?.$from?.nodeBefore?.type?.name === "equation") {
    return sel.$from.nodeBefore.attrs || {};
  }
  if (sel?.$from?.nodeAfter?.type?.name === "equation") {
    return sel.$from.nodeAfter.attrs || {};
  }
  return editor.getAttributes("equation") || {};
}

/**
 * Chèn một Phương trình / Công thức toán học (Equation) semantic.
 */
export function insertEquation(
  editor: Editor | null,
  options?: {
    latex?: string;
    displayMode?: boolean;
    alignment?: "left" | "center" | "right";
  }
): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.insertEquation(options);
}

/**
 * Cập nhật mã nguồn LaTeX của phương trình đang chọn.
 */
export function updateEquation(
  editor: Editor | null,
  latex: string
): boolean {
  if (!editor || !isEquationActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.updateEquation(latex);
}

/**
 * Xóa phương trình hiện tại.
 */
export function deleteEquation(editor: Editor | null): boolean {
  if (!editor || !isEquationActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.deleteEquation();
}

/**
 * Căn lề phương trình (trái, giữa, phải).
 */
export function setEquationAlignment(
  editor: Editor | null,
  alignment: "left" | "center" | "right"
): boolean {
  if (!editor || !isEquationActive(editor)) return false;
  ensureEditorPlugins(editor);
  return editor.commands.setEquationAlignment(alignment);
}

/* ==========================================================================
   Các lệnh Track Changes - Accept & Reject (Phase 5.6)
   ========================================================================== */

/**
 * Chấp nhận một thay đổi Track Changes (Accept Change)
 */
export function acceptChange(editor: Editor | null, changeId?: string): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.acceptChange(changeId);
}

/**
 * Từ chối một thay đổi Track Changes (Reject Change)
 */
export function rejectChange(editor: Editor | null, changeId?: string): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.rejectChange(changeId);
}

/**
 * Chấp nhận toàn bộ thay đổi Track Changes trong tài liệu (Accept All)
 */
export function acceptAllChanges(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.acceptAllChanges();
}

/**
 * Từ chối toàn bộ thay đổi Track Changes trong tài liệu (Reject All)
 */
export function rejectAllChanges(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.rejectAllChanges();
}

/**
 * Chấp nhận toàn bộ thay đổi định dạng Track Changes trong tài liệu (Accept All Formatting)
 */
export function acceptAllFormatting(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.acceptAllFormattingChanges();
}

/**
 * Từ chối toàn bộ thay đổi định dạng Track Changes trong tài liệu (Reject All Formatting)
 */
export function rejectAllFormatting(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);
  return editor.commands.rejectAllFormattingChanges();
}



