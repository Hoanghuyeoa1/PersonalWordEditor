import type { Editor } from "@tiptap/core";
import { useReviewStore } from "../../stores/reviewStore.ts";
import { TrackChangesService } from "../../review/trackChanges/trackChangesService.ts";

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
 * Áp dụng Character Style lên vùng chọn hiện tại trong Editor.
 *
 * Tính năng chính:
 * 1. Range selection: Gán mark `characterStyle` với `styleId` tương ứng.
 *    - Tự động thay thế characterStyle cũ nếu có mà KHÔNG xóa các direct marks khác (bold, italic, color, comment...).
 *    - Giữ nguyên toàn bộ inline atom nodes (citation, crossReference).
 * 2. Empty selection (con trỏ rỗng/caret): Lưu vào `storedMarks` để áp dụng cho ký tự gõ tiếp theo mà không gây lỗi.
 * 3. Atomic transaction: Có thể Undo/Redo hoàn toàn trong 1 bước lịch sử ProseMirror.
 */
export function applyCharacterStyle(
  editor: Editor | null,
  styleId: string
): boolean {
  if (!editor || !styleId) return false;
  ensureEditorPlugins(editor);

  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (isTracking) {
    const res = TrackChangesService.applyTrackedCharacterStyle(editor, styleId);
    return res.success || Boolean(res.noOp);
  }

  return editor.commands.setCharacterStyle(styleId);
}

/**
 * Gỡ bỏ Character Style khỏi vùng chọn hiện tại trong Editor.
 *
 * Giữ nguyên 100% các định dạng trực tiếp khác (bold, italic, comment, trackChange, link...).
 */
export function removeCharacterStyle(editor: Editor | null): boolean {
  if (!editor) return false;
  ensureEditorPlugins(editor);

  const isTracking = useReviewStore.getState().trackChangesEnabled;
  if (isTracking) {
    const res = TrackChangesService.removeTrackedCharacterStyle(editor);
    return res.success || Boolean(res.noOp);
  }

  return editor.commands.unsetCharacterStyle();
}

/**
 * Lấy styleId của Character Style đang áp dụng tại vị trí con trỏ hoặc vùng chọn hiện tại.
 */
export function getCurrentCharacterStyleId(editor: Editor | null): string | null {
  if (!editor) return null;
  const { state } = editor;
  const markType = state.schema.marks.characterStyle;
  if (!markType) return null;

  // 1. Kiểm tra storedMarks (nếu caret vừa áp dụng style)
  if (state.storedMarks) {
    const found = state.storedMarks.find((m) => m.type === markType);
    if (found?.attrs?.styleId) return found.attrs.styleId;
  }

  // 2. Kiểm tra marks tại caret hoặc selection
  const { $from, empty } = state.selection;
  if (empty) {
    const found = $from.marks().find((m) => m.type === markType);
    if (found?.attrs?.styleId) return found.attrs.styleId;
  } else {
    const attrs = editor.getAttributes("characterStyle");
    if (attrs?.styleId) return attrs.styleId;
    // Fallback duyệt qua marks của node tại selection from
    const found = $from.marks().find((m) => m.type === markType);
    if (found?.attrs?.styleId) return found.attrs.styleId;
  }

  return null;
}
