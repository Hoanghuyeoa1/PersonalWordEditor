import type { Editor } from "@tiptap/core";
import { TextSelection } from "prosemirror-state";
import { commandRegistry } from "./commandRegistry.ts";
import type { CommandExecutionContext } from "./types.ts";

export interface ExecuteCommandOptions {
  /** Tham chiếu editor đang hoạt động */
  editor?: Editor | null;
  /** Vùng ký tự cần xóa trước khi thực thi (ví dụ: chuỗi '/query' của Slash Command) */
  rangeToDelete?: { from: number; to: number } | null;
  /** Selection cần khôi phục trước khi thực thi (ví dụ: bôi đen văn bản trước khi mở Command Palette) */
  savedSelection?: { from: number; to: number; empty?: boolean } | null;
  /** Context bổ sung nếu có */
  customContext?: Record<string, unknown>;
}

/**
 * Thực thi an toàn một command:
 * 1. Dọn dẹp slash query nếu là slash command mà không tạo duplicate history bước thừa.
 * 2. Khôi phục Selection ProseMirror (Selection & Focus Safety).
 * 3. Kiểm tra canExecute().
 * 4. Gọi descriptor.execute().
 * 5. Giữ focus an toàn cho Editor.
 */
export async function executeCommandWithSelection(
  commandId: string,
  options: ExecuteCommandOptions = {}
): Promise<boolean> {
  const descriptor = commandRegistry.get(commandId);
  if (!descriptor) {
    console.warn(`[CommandExecution] Không tìm thấy command với id: "${commandId}"`);
    return false;
  }

  const editor = options.editor ?? null;

  // 1. Dọn dẹp slash query text nếu có (Slash Command cleanup)
  if (editor && options.rangeToDelete) {
    const { from, to } = options.rangeToDelete;
    const docSize = editor.state.doc.content.size;
    const safeFrom = Math.min(Math.max(0, from), docSize);
    const safeTo = Math.min(Math.max(0, to), docSize);

    if (safeFrom < safeTo) {
      const tr = editor.state.tr.delete(safeFrom, safeTo);
      editor.view.dispatch(tr);
    }
  }

  // 2. Khôi phục Selection ProseMirror đã snapshot (Command Palette focus/selection restoration)
  if (editor && options.savedSelection) {
    const { from, to } = options.savedSelection;
    const docSize = editor.state.doc.content.size;
    const safeFrom = Math.min(Math.max(0, from), docSize);
    const safeTo = Math.min(Math.max(0, to), docSize);

    try {
      const tr = editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, safeFrom, safeTo)
      );
      editor.view.dispatch(tr);
    } catch (e) {
      // Bỏ qua nếu cấu trúc document thay đổi khiến pos không hợp lệ
      console.warn("[CommandExecution] Không thể phục hồi selection:", e);
    }
  }

  const ctx: CommandExecutionContext = {
    editor,
    ...options.customContext,
  };

  // 3. Kiểm tra điều kiện canExecute()
  if (descriptor.canExecute && !descriptor.canExecute(ctx)) {
    return false;
  }

  // 4. Thực thi command
  try {
    const res = await descriptor.execute(ctx);
    // Nếu command không mở modal, trả focus lại cho editor
    if (editor && !commandOpensModal(commandId)) {
      editor.commands.focus();
    }
    return res !== false;
  } catch (err) {
    console.error(`[CommandExecution] Lỗi khi thực thi command "${commandId}":`, err);
    return false;
  }
}

/**
 * Kiểm tra xem command có mở dialog modal riêng không (để tránh cướp focus của dialog)
 */
function commandOpensModal(commandId: string): boolean {
  return [
    "insert.link",
    "insert.equation",
    "insert.symbol",
    "review.statistics",
  ].includes(commandId);
}
