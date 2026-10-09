import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  DocumentStyle,
  DocumentStyleType,
  ParagraphStyleProperties,
  CharacterStyleProperties,
} from "../types/styleTypes.ts";
import {
  STYLE_NORMAL_ID,
  isBuiltInStyleId,
  generateCustomStyleId,
} from "./builtInStyles.ts";
import {
  validateDocumentStyle,
  validateParagraphProperties,
  validateCharacterProperties,
} from "../validation/styleValidator.ts";
import {
  detectInheritanceCycle,
} from "./styleResolver.ts";
import { updateDocumentStylesStylesheet } from "./styleStylesheetService.ts";
import { useDocumentStore } from "../../stores/documentStore.ts";
import { styleHistory } from "./styleHistoryService.ts";
import { validateFontSize } from "../../editor/editorCommands.ts";
import { clearDirectParagraphFormatting } from "./applyStyleService.ts";

export interface StyleOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateStyleOptions {
  id?: string;
  name: string;
  type: DocumentStyleType;
  basedOn?: string | null;
  nextStyleId?: string | null;
  paragraph?: ParagraphStyleProperties;
  character?: CharacterStyleProperties;
}

export interface UpdateStyleOptions {
  name?: string;
  basedOn?: string | null;
  nextStyleId?: string | null;
  paragraph?: Partial<ParagraphStyleProperties>;
  character?: Partial<CharacterStyleProperties>;
}

export interface DeleteStyleOptions {
  fallbackStyleId?: string | null;
}

export interface UpdateStyleFromSelectionOptions {
  clearDirectFormatting?: boolean;
}

export interface StyleUsageInfo {
  styleId: string;
  totalUsage: number;
  blockCount: number;
  runCount: number;
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
 * Lấy danh sách định nghĩa Style hiện tại từ Document Store.
 */
function getCurrentDefinitions(): DocumentStyle[] {
  return useDocumentStore.getState().document.styles?.definitions ?? [];
}

/**
 * Kiểm tra tên Style trùng lặp (không phân biệt chữ hoa chữ thường).
 */
function isNameDuplicate(
  name: string,
  definitions: DocumentStyle[],
  excludeStyleId?: string
): boolean {
  const normalized = name.trim().toLowerCase();
  return definitions.some(
    (s) => s.id !== excludeStyleId && s.name.trim().toLowerCase() === normalized
  );
}

/**
 * Thống kê mức độ sử dụng của một Style trong tài liệu (Blocks & Character Runs).
 */
export function getStyleUsage(
  styleId: string,
  editorOrDoc?: Editor | JSONContent | ProseMirrorNode | null
): StyleUsageInfo {
  let blockCount = 0;
  let runCount = 0;

  // 1. Trường hợp là Tiptap Editor
  if (editorOrDoc && "state" in editorOrDoc && (editorOrDoc as Editor).state?.doc) {
    const doc = (editorOrDoc as Editor).state.doc;
    doc.descendants((node) => {
      if (node.isTextblock) {
        if (node.attrs?.styleId === styleId) {
          blockCount++;
        }
      }
      if (node.isText && node.marks) {
        for (const m of node.marks) {
          if (m.type.name === "characterStyle" && m.attrs?.styleId === styleId) {
            runCount++;
            break;
          }
        }
      }
    });
    return {
      styleId,
      totalUsage: blockCount + runCount,
      blockCount,
      runCount,
    };
  }

  // 2. Trường hợp là JSONContent (hoặc từ Document Store)
  const content =
    editorOrDoc && "content" in editorOrDoc
      ? (editorOrDoc as JSONContent)
      : useDocumentStore.getState().document.content;

  function traverseJson(node: any) {
    if (!node || typeof node !== "object") return;

    if (node.type === "paragraph" || node.type === "heading") {
      if (node.attrs?.styleId === styleId) {
        blockCount++;
      }
    }

    if (node.type === "text" && Array.isArray(node.marks)) {
      for (const m of node.marks) {
        if (
          (m.type === "characterStyle" || m.type?.name === "characterStyle") &&
          m.attrs?.styleId === styleId
        ) {
          runCount++;
          break;
        }
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        traverseJson(child);
      }
    }
  }

  traverseJson(content);

  return {
    styleId,
    totalUsage: blockCount + runCount,
    blockCount,
    runCount,
  };
}

/**
 * Tạo một Style mới (Paragraph hoặc Character).
 */
export function createStyle(
  options: CreateStyleOptions,
  _editor?: Editor | null
): StyleOperationResult<DocumentStyle> {
  const trimmedName = options.name?.trim();
  if (!trimmedName) {
    return { success: false, error: "Tên Style không được để trống." };
  }

  const currentDefs = getCurrentDefinitions();

  // Kiểm tra trùng tên (case-insensitive)
  if (isNameDuplicate(trimmedName, currentDefs)) {
    return { success: false, error: `Tên Style "${trimmedName}" đã tồn tại trong tài liệu.` };
  }

  // Tạo ID duy nhất ổn định
  const styleId =
    options.id && options.id.trim()
      ? options.id.trim()
      : generateCustomStyleId(options.type === "character" ? "style_char" : "style_para");

  if (currentDefs.some((s) => s.id === styleId)) {
    return { success: false, error: `Style ID "${styleId}" đã tồn tại.` };
  }

  // Kiểm tra Based On
  let basedOn = options.basedOn ?? null;
  if (basedOn) {
    const parent = currentDefs.find((s) => s.id === basedOn);
    if (!parent) {
      return { success: false, error: `Style cơ sở (basedOn: "${basedOn}") không tồn tại.` };
    }
    if (parent.type !== options.type) {
      return {
        success: false,
        error: `Style kế thừa phải cùng loại (${options.type === "paragraph" ? "Paragraph" : "Character"}).`,
      };
    }
  }

  // Dựng đối tượng Style hoàn chỉnh
  const newStyle: DocumentStyle = {
    id: styleId,
    name: trimmedName,
    type: options.type,
    basedOn,
    nextStyleId: options.type === "paragraph" ? (options.nextStyleId ?? styleId) : null,
    isBuiltIn: false,
    paragraph: options.type === "paragraph" ? { ...(options.paragraph ?? {}) } : undefined,
    character: options.character ? { ...options.character } : undefined,
  };

  // Xác thực toàn diện qua validator
  const validation = validateDocumentStyle(newStyle);
  if (!validation.isValid) {
    return { success: false, error: validation.errors.join("; ") };
  }

  // Kiểm tra vòng lặp kế thừa
  const testCollection = [...currentDefs, newStyle];
  const cycle = detectInheritanceCycle(newStyle.id, testCollection);
  if (cycle.hasCycle) {
    return { success: false, error: `Phát hiện phụ thuộc vòng trong Based On: ${(cycle.cyclePath || []).join(" -> ")}.` };
  }

  // Thực thi cập nhật Store
  const beforeDefs = [...currentDefs];
  const afterDefs = [...currentDefs, newStyle];

  const store = useDocumentStore.getState();
  store.updateStyleDefinitions(afterDefs);
  updateDocumentStylesStylesheet(afterDefs);
  useDocumentStore.setState({ isDirty: true, isModified: true });

  // Ghi nhận lịch sử Undo
  styleHistory.recordAction({
    action: "create",
    description: `Tạo style "${trimmedName}"`,
    styleId: newStyle.id,
    beforeDefinitions: beforeDefs,
    afterDefinitions: afterDefs,
  });

  return { success: true, data: newStyle };
}

/**
 * Cập nhật thuộc tính của một Style đã có.
 */
export function updateStyle(
  styleId: string,
  updates: UpdateStyleOptions,
  _editor?: Editor | null
): StyleOperationResult<DocumentStyle> {
  const currentDefs = getCurrentDefinitions();
  const existingIndex = currentDefs.findIndex((s) => s.id === styleId);
  if (existingIndex < 0) {
    return { success: false, error: `Style "${styleId}" không tồn tại.` };
  }

  const existing = currentDefs[existingIndex];

  // 1. Kiểm tra đổi tên
  let updatedName = existing.name;
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) {
      return { success: false, error: "Tên Style không được để trống." };
    }
    if (existing.isBuiltIn && trimmed !== existing.name) {
      return { success: false, error: `Không thể đổi tên Style hệ thống "${existing.name}".` };
    }
    if (isNameDuplicate(trimmed, currentDefs, styleId)) {
      return { success: false, error: `Tên Style "${trimmed}" đã tồn tại trong tài liệu.` };
    }
    updatedName = trimmed;
  }

  // 2. Kiểm tra Based On
  let updatedBasedOn = existing.basedOn;
  if (updates.basedOn !== undefined) {
    if (existing.id === STYLE_NORMAL_ID && updates.basedOn !== null) {
      return { success: false, error: "Normal Style không thể có basedOn kế thừa." };
    }
    if (updates.basedOn === styleId) {
      return { success: false, error: "Style không thể có basedOn trỏ tới chính nó." };
    }
    if (updates.basedOn) {
      const parent = currentDefs.find((s) => s.id === updates.basedOn);
      if (!parent) {
        return { success: false, error: `Style cơ sở (basedOn: "${updates.basedOn}") không tồn tại.` };
      }
      if (parent.type !== existing.type) {
        return { success: false, error: "Style kế thừa phải cùng loại." };
      }
    }
    updatedBasedOn = updates.basedOn;
  }

  // 3. Thuộc tính Paragraph
  let updatedParagraph = existing.paragraph ? { ...existing.paragraph } : undefined;
  if (updates.paragraph && existing.type === "paragraph") {
    updatedParagraph = {
      ...(updatedParagraph ?? {}),
      ...updates.paragraph,
    };
    const pVal = validateParagraphProperties(updatedParagraph);
    if (!pVal.isValid) {
      return { success: false, error: pVal.errors.join("; ") };
    }
  }

  // 4. Thuộc tính Character
  let updatedCharacter = existing.character ? { ...existing.character } : undefined;
  if (updates.character) {
    updatedCharacter = {
      ...(updatedCharacter ?? {}),
      ...updates.character,
    };
    const cVal = validateCharacterProperties(updatedCharacter);
    if (!cVal.isValid) {
      return { success: false, error: cVal.errors.join("; ") };
    }
  }

  const updatedStyle: DocumentStyle = {
    ...existing,
    name: updatedName,
    basedOn: updatedBasedOn,
    nextStyleId: updates.nextStyleId !== undefined ? updates.nextStyleId : existing.nextStyleId,
    paragraph: updatedParagraph,
    character: updatedCharacter,
  };

  // Kiểm tra vòng lặp nếu có thay đổi basedOn
  const testDefs = [...currentDefs];
  testDefs[existingIndex] = updatedStyle;
  const cycle = detectInheritanceCycle(updatedStyle.id, testDefs);
  if (cycle.hasCycle) {
    return { success: false, error: `Phát hiện phụ thuộc vòng trong Based On: ${(cycle.cyclePath || []).join(" -> ")}.` };
  }

  // Thực thi cập nhật Store
  const beforeDefs = [...currentDefs];
  const afterDefs = [...testDefs];

  const store = useDocumentStore.getState();
  store.updateStyleDefinitions(afterDefs);
  updateDocumentStylesStylesheet(afterDefs);
  useDocumentStore.setState({ isDirty: true, isModified: true });

  // Ghi nhận lịch sử Undo
  styleHistory.recordAction({
    action: "update",
    description: `Cập nhật style "${updatedName}"`,
    styleId: updatedStyle.id,
    beforeDefinitions: beforeDefs,
    afterDefinitions: afterDefs,
  });

  return { success: true, data: updatedStyle };
}

/**
 * Đổi tên một Style (chỉ áp dụng cho custom style).
 */
export function renameStyle(
  styleId: string,
  newName: string,
  editor?: Editor | null
): StyleOperationResult<DocumentStyle> {
  return updateStyle(styleId, { name: newName }, editor);
}

/**
 * Sao chép (Duplicate) một Style hiện có thành một Style mới.
 */
export function duplicateStyle(
  sourceStyleId: string,
  newName?: string,
  editor?: Editor | null
): StyleOperationResult<DocumentStyle> {
  const currentDefs = getCurrentDefinitions();
  const source = currentDefs.find((s) => s.id === sourceStyleId);
  if (!source) {
    return { success: false, error: `Style nguồn "${sourceStyleId}" không tồn tại.` };
  }

  // Sinh tên mới tự động nếu không truyền
  let targetName = newName?.trim();
  if (!targetName) {
    let copyIndex = 1;
    targetName = `${source.name} (Copy)`;
    while (isNameDuplicate(targetName, currentDefs)) {
      copyIndex++;
      targetName = `${source.name} (Copy ${copyIndex})`;
    }
  }

  return createStyle(
    {
      name: targetName,
      type: source.type,
      basedOn: source.basedOn,
      nextStyleId: source.nextStyleId === source.id ? undefined : source.nextStyleId,
      paragraph: source.paragraph ? { ...source.paragraph } : undefined,
      character: source.character ? { ...source.character } : undefined,
    },
    editor
  );
}

/**
 * Xóa an toàn một Style (Delete Safety & Rebase Policy).
 *
 * Chính sách xóa an toàn:
 * 1. Tuyệt đối không cho phép xóa Built-in Style.
 * 2. Rebase an toàn toàn bộ descendant styles đang Based On style này về parent của nó (hoặc null).
 * 3. Nếu tài liệu đang sử dụng style: Reassign toàn bộ blocks/text runs về fallbackStyleId
 *    (mặc định: parent của style bị xóa hoặc STYLE_NORMAL_ID) để tránh orphan styleId.
 */
export function deleteStyle(
  styleId: string,
  options?: DeleteStyleOptions,
  editor?: Editor | null
): StyleOperationResult<{ deletedStyleId: string; reassignedCount: number; rebasedCount: number }> {
  const currentDefs = getCurrentDefinitions();
  const target = currentDefs.find((s) => s.id === styleId);
  if (!target) {
    return { success: false, error: `Style "${styleId}" không tồn tại.` };
  }

  if (target.isBuiltIn || isBuiltInStyleId(styleId)) {
    return { success: false, error: `Không thể xóa Style hệ thống "${target.name}".` };
  }

  const targetType = target.type;
  const targetName = target.name;
  const targetBasedOn = target.basedOn;

  // Xác định Fallback Style Id
  const fallbackId: string | null =
    options?.fallbackStyleId !== undefined
      ? options.fallbackStyleId
      : targetBasedOn ?? (targetType === "paragraph" ? STYLE_NORMAL_ID : null);

  const beforeDefs = [...currentDefs];
  let beforeContent: JSONContent | undefined;
  let afterContent: JSONContent | undefined;

  let reassignedCount = 0;
  let rebasedCount = 0;

  // 1. Reassign các khối / runs trong Editor AST (nếu có editor)
  if (editor && editor.state) {
    ensureEditorPlugins(editor);
    beforeContent = editor.getJSON();
    const { state, view } = editor;
    const { tr } = state;

    if (targetType === "paragraph") {
      tr.doc.descendants((node, pos) => {
        if (node.isTextblock && node.attrs?.styleId === styleId) {
          const nextStyleId = fallbackId === STYLE_NORMAL_ID ? null : fallbackId;
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            styleId: nextStyleId,
          });
          reassignedCount++;
        }
      });
    } else if (targetType === "character") {
      const markType = state.schema.marks.characterStyle;
      if (markType) {
        tr.doc.descendants((node, pos) => {
          if (node.isText && node.marks) {
            const hasCharStyle = node.marks.some(
              (m) => m.type === markType && m.attrs?.styleId === styleId
            );
            if (hasCharStyle) {
              tr.removeMark(pos, pos + node.nodeSize, markType);
              if (fallbackId) {
                tr.addMark(pos, pos + node.nodeSize, markType.create({ styleId: fallbackId }));
              }
              reassignedCount++;
            }
          }
        });
      }
    }

    if (reassignedCount > 0) {
      view.dispatch(tr);
      afterContent = editor.getJSON();
      useDocumentStore.getState().updateContent(afterContent);
    }
  } else {
    // Headless fallback khi không có editor: reassign trực tiếp trong Document Store content
    const storeContent = useDocumentStore.getState().document.content;
    beforeContent = JSON.parse(JSON.stringify(storeContent));

    function reassignJson(node: any) {
      if (!node || typeof node !== "object") return;
      if (targetType === "paragraph" && (node.type === "paragraph" || node.type === "heading")) {
        if (node.attrs?.styleId === styleId) {
          node.attrs.styleId = fallbackId === STYLE_NORMAL_ID ? null : fallbackId;
          reassignedCount++;
        }
      }
      if (targetType === "character" && node.type === "text" && Array.isArray(node.marks)) {
        const markIndex = node.marks.findIndex(
          (m: any) =>
            (m.type === "characterStyle" || m.type?.name === "characterStyle") &&
            m.attrs?.styleId === styleId
        );
        if (markIndex >= 0) {
          if (fallbackId) {
            node.marks[markIndex].attrs.styleId = fallbackId;
          } else {
            node.marks.splice(markIndex, 1);
          }
          reassignedCount++;
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) reassignJson(child);
      }
    }

    const modifiedContent = JSON.parse(JSON.stringify(storeContent));
    reassignJson(modifiedContent);
    if (reassignedCount > 0) {
      afterContent = modifiedContent;
      useDocumentStore.getState().updateContent(modifiedContent);
    }
  }

  // 2. Rebase an toàn các styles con (children) đang kế thừa từ style bị xóa
  const safeParentForChildren = targetBasedOn ?? (targetType === "paragraph" ? STYLE_NORMAL_ID : null);
  const afterDefs = currentDefs
    .filter((s) => s.id !== styleId)
    .map((s) => {
      if (s.basedOn === styleId) {
        rebasedCount++;
        return {
          ...s,
          basedOn: safeParentForChildren,
        };
      }
      return s;
    });

  // 3. Cập nhật Store & Stylesheet
  const store = useDocumentStore.getState();
  store.updateStyleDefinitions(afterDefs);
  updateDocumentStylesStylesheet(afterDefs);
  useDocumentStore.setState({ isDirty: true, isModified: true });

  // 4. Ghi nhận lịch sử Undo
  styleHistory.recordAction({
    action: "delete",
    description: `Xóa style "${targetName}"`,
    styleId,
    beforeDefinitions: beforeDefs,
    afterDefinitions: afterDefs,
    beforeContent,
    afterContent,
  });

  return {
    success: true,
    data: {
      deletedStyleId: styleId,
      reassignedCount,
      rebasedCount,
    },
  };
}

/**
 * Cập nhật Style hiện tại theo định dạng của vùng chọn (Update Style to Match Selection).
 *
 * Workflow:
 * 1. Trích xuất thuộc tính định dạng trình bày hợp lệ từ vùng chọn hiện tại.
 * 2. Loại trừ tuyệt đối: comments, track changes, citations, cross-references, decorations.
 * 3. Cập nhật Style definition trong documentStore.
 * 4. Toàn bộ các đoạn/vùng ký tự tham chiếu styleId này tự động cập nhật qua dynamic stylesheet.
 * 5. Tùy chọn làm sạch direct formatting trên block hiện tại để tránh redundant overrides.
 */
export function updateStyleFromSelection(
  styleId: string,
  editor: Editor | null,
  options?: UpdateStyleFromSelectionOptions
): StyleOperationResult<DocumentStyle> {
  if (!editor || !editor.state) {
    return { success: false, error: "Editor không khả dụng." };
  }

  const currentDefs = getCurrentDefinitions();
  const target = currentDefs.find((s) => s.id === styleId);
  if (!target) {
    return { success: false, error: `Style "${styleId}" không tồn tại.` };
  }

  ensureEditorPlugins(editor);
  const { state } = editor;
  const { selection } = state;

  const capturedParagraph: ParagraphStyleProperties = {};
  const capturedCharacter: CharacterStyleProperties = {};

  if (target.type === "paragraph") {
    // 1. Trích xuất Paragraph Properties từ textblock tại selection
    const $from = selection.$from;
    const parentBlock = $from.parent;
    if (parentBlock && parentBlock.isTextblock) {
      const attrs = parentBlock.attrs || {};
      if (attrs.textAlign) capturedParagraph.textAlign = attrs.textAlign;
      if (attrs.lineSpacing) capturedParagraph.lineSpacing = attrs.lineSpacing;
      if (typeof attrs.spacingBefore === "number") capturedParagraph.spacingBefore = attrs.spacingBefore;
      if (typeof attrs.spacingAfter === "number") capturedParagraph.spacingAfter = attrs.spacingAfter;
      if (typeof attrs.leftIndent === "number") capturedParagraph.leftIndent = attrs.leftIndent;
      if (typeof attrs.rightIndent === "number") capturedParagraph.rightIndent = attrs.rightIndent;
      if (typeof attrs.firstLineIndent === "number") capturedParagraph.firstLineIndent = attrs.firstLineIndent;
      if (typeof attrs.hangingIndent === "number") capturedParagraph.hangingIndent = attrs.hangingIndent;
      if (typeof attrs.keepWithNext === "boolean") capturedParagraph.keepWithNext = attrs.keepWithNext;
    }

    // 2. Trích xuất Character Properties nền tảng từ selection
    const textStyleAttrs = editor.getAttributes("textStyle");
    if (textStyleAttrs.fontFamily) capturedCharacter.fontFamily = textStyleAttrs.fontFamily;
    if (textStyleAttrs.fontSize) {
      const validSize = validateFontSize(textStyleAttrs.fontSize);
      if (validSize) capturedCharacter.fontSize = validSize;
    }
    if (textStyleAttrs.color) capturedCharacter.color = textStyleAttrs.color;

    const highlightAttrs = editor.getAttributes("highlight");
    if (highlightAttrs.color) capturedCharacter.highlight = highlightAttrs.color;

    capturedCharacter.bold = editor.isActive("bold");
    capturedCharacter.italic = editor.isActive("italic");
    capturedCharacter.underline = editor.isActive("underline");
    capturedCharacter.strike = editor.isActive("strike");
  } else if (target.type === "character") {
    // Trích xuất Character Properties cho Character Style
    const textStyleAttrs = editor.getAttributes("textStyle");
    if (textStyleAttrs.fontFamily) capturedCharacter.fontFamily = textStyleAttrs.fontFamily;
    if (textStyleAttrs.fontSize) {
      const validSize = validateFontSize(textStyleAttrs.fontSize);
      if (validSize) capturedCharacter.fontSize = validSize;
    }
    if (textStyleAttrs.color) capturedCharacter.color = textStyleAttrs.color;

    const highlightAttrs = editor.getAttributes("highlight");
    if (highlightAttrs.color) capturedCharacter.highlight = highlightAttrs.color;

    capturedCharacter.bold = editor.isActive("bold");
    capturedCharacter.italic = editor.isActive("italic");
    capturedCharacter.underline = editor.isActive("underline");
    capturedCharacter.strike = editor.isActive("strike");
  }

  // Dựng bản cập nhật style
  const updatedStyle: DocumentStyle = {
    ...target,
    paragraph:
      target.type === "paragraph"
        ? { ...(target.paragraph ?? {}), ...capturedParagraph }
        : undefined,
    character: {
      ...(target.character ?? {}),
      ...capturedCharacter,
    },
  };

  const beforeDefs = [...currentDefs];
  const afterDefs = currentDefs.map((s) => (s.id === styleId ? updatedStyle : s));

  // Tùy chọn xóa direct formatting trên block hiện tại để nó hoàn toàn tuân thủ theo style mới
  if (options?.clearDirectFormatting !== false && target.type === "paragraph") {
    clearDirectParagraphFormatting(editor);
  }

  // Cập nhật Store & Stylesheet
  const store = useDocumentStore.getState();
  store.updateStyleDefinitions(afterDefs);
  updateDocumentStylesStylesheet(afterDefs);
  useDocumentStore.setState({ isDirty: true, isModified: true });

  // Ghi nhận lịch sử Undo
  styleHistory.recordAction({
    action: "update_from_selection",
    description: `Cập nhật style "${target.name}" từ vùng chọn`,
    styleId,
    beforeDefinitions: beforeDefs,
    afterDefinitions: afterDefs,
  });

  return { success: true, data: updatedStyle };
}
