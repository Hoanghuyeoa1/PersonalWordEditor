import type { Editor } from "@tiptap/core";
import { useReviewStore } from "../../stores/reviewStore.ts";
import type { ReviewItemType, ReviewCommandResult } from "../types/reviewTypes.ts";
import { getReviewItemDescriptor } from "../services/reviewRegistry.ts";
import { TrackChangesService } from "../trackChanges/trackChangesService.ts";

/**
 * Review Commands - Personal Word Editor (Phase 5.1 Architecture)
 *
 * Tầng trừu tượng hóa các lệnh điều phối trong Review Engine.
 * Kết nối giữa Review Ribbon UI và Editor/Store.
 */

/**
 * Mở bảng Thống kê chi tiết tài liệu (Word Count & Document Statistics)
 */
export function openDocumentStatisticsCommand(): ReviewCommandResult {
  useReviewStore.getState().openStatisticsModal();
  return {
    success: true,
    itemType: "documentStatistics",
  };
}

/**
 * Chuyển đổi trạng thái Track Changes (Phase 5.5)
 */
export function toggleTrackChangesCommand(): ReviewCommandResult {
  useReviewStore.getState().toggleTrackChanges();
  const isEnabled = useReviewStore.getState().trackChangesEnabled;
  return {
    success: true,
    itemType: "trackChanges",
    details: { enabled: isEnabled },
  };
}

/**
 * Đi tới thay đổi trước đó (Previous Change)
 */
export function previousChangeCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "previousChange", message: "Editor không khả dụng" };
  }
  const currentId = useReviewStore.getState().activeChangeId;
  const prev = TrackChangesService.findPreviousChange(editor.state.doc, currentId);
  if (!prev) {
    return { success: false, itemType: "previousChange", message: "Không tìm thấy thay đổi nào" };
  }
  TrackChangesService.navigateToChange(editor, prev.id);
  return { success: true, itemType: "previousChange", details: { changeId: prev.id } };
}

/**
 * Đi tới thay đổi tiếp theo (Next Change)
 */
export function nextChangeCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "nextChange", message: "Editor không khả dụng" };
  }
  const currentId = useReviewStore.getState().activeChangeId;
  const next = TrackChangesService.findNextChange(editor.state.doc, currentId);
  if (!next) {
    return { success: false, itemType: "nextChange", message: "Không tìm thấy thay đổi nào" };
  }
  TrackChangesService.navigateToChange(editor, next.id);
  return { success: true, itemType: "nextChange", details: { changeId: next.id } };
}

/**
 * Chấp nhận thay đổi hiện tại (Accept Change - Phase 5.6)
 */
export function acceptChangeCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "acceptChange", message: "Editor không khả dụng" };
  }
  const targetId = TrackChangesService.resolveTargetChangeId(editor);
  if (!targetId) {
    return { success: false, itemType: "acceptChange", message: "Không tìm thấy thay đổi nào để chấp nhận" };
  }
  const success = TrackChangesService.acceptChange(editor, targetId);
  return {
    success,
    itemType: "acceptChange",
    details: { changeId: targetId },
  };
}

/**
 * Từ chối thay đổi hiện tại (Reject Change - Phase 5.6)
 */
export function rejectChangeCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "rejectChange", message: "Editor không khả dụng" };
  }
  const targetId = TrackChangesService.resolveTargetChangeId(editor);
  if (!targetId) {
    return { success: false, itemType: "rejectChange", message: "Không tìm thấy thay đổi nào để từ chối" };
  }
  const success = TrackChangesService.rejectChange(editor, targetId);
  return {
    success,
    itemType: "rejectChange",
    details: { changeId: targetId },
  };
}

/**
 * Chấp nhận toàn bộ thay đổi trong tài liệu (Accept All - Phase 5.6)
 */
export function acceptAllChangesCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "acceptAllChanges", message: "Editor không khả dụng" };
  }
  const success = TrackChangesService.acceptAllChanges(editor);
  return {
    success,
    itemType: "acceptAllChanges",
  };
}

/**
 * Từ chối toàn bộ thay đổi trong tài liệu (Reject All - Phase 5.6)
 */
export function rejectAllChangesCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "rejectAllChanges", message: "Editor không khả dụng" };
  }
  const success = TrackChangesService.rejectAllChanges(editor);
  return {
    success,
    itemType: "rejectAllChanges",
  };
}

/**
 * Chấp nhận toàn bộ thay đổi định dạng (Accept All Formatting - Phase 7)
 */
export function acceptAllFormattingCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "acceptAllFormatting", message: "Editor không khả dụng" };
  }
  const success = TrackChangesService.acceptAllFormatting(editor);
  return {
    success,
    itemType: "acceptAllFormatting",
  };
}

/**
 * Từ chối toàn bộ thay đổi định dạng (Reject All Formatting - Phase 7)
 */
export function rejectAllFormattingCommand(editor?: Editor | null): ReviewCommandResult {
  if (!editor) {
    return { success: false, itemType: "rejectAllFormatting", message: "Editor không khả dụng" };
  }
  const success = TrackChangesService.rejectAllFormatting(editor);
  return {
    success,
    itemType: "rejectAllFormatting",
  };
}

/**
 * Điều phối lệnh Review chung với kiểm tra an toàn trạng thái
 */
export function dispatchReviewCommand(
  itemId: ReviewItemType,
  _editor?: Editor | null
): ReviewCommandResult {
  const descriptor = getReviewItemDescriptor(itemId);

  if (!descriptor) {
    return {
      success: false,
      itemType: itemId,
      message: `Không tìm thấy mô tả cho lệnh ${itemId}`,
    };
  }

  // Nếu là chức năng active
  if (itemId === "documentStatistics") {
    return openDocumentStatisticsCommand();
  }

  if (itemId === "spelling") {
    useReviewStore.getState().toggleProofing();
    if (_editor) {
      _editor.commands.recheckSpelling();
    }
    return {
      success: true,
      itemType: "spelling",
      details: { enabled: useReviewStore.getState().proofingEnabled },
    };
  }

  if (itemId === "trackChanges") {
    return toggleTrackChangesCommand();
  }

  if (itemId === "previousChange") {
    return previousChangeCommand(_editor);
  }

  if (itemId === "nextChange") {
    return nextChangeCommand(_editor);
  }

  if (itemId === "acceptChange") {
    return acceptChangeCommand(_editor);
  }

  if (itemId === "rejectChange") {
    return rejectChangeCommand(_editor);
  }

  if (itemId === "acceptAllChanges") {
    return acceptAllChangesCommand(_editor);
  }

  if (itemId === "rejectAllChanges") {
    return rejectAllChangesCommand(_editor);
  }

  if (itemId === "acceptAllFormatting") {
    return acceptAllFormattingCommand(_editor);
  }

  if (itemId === "rejectAllFormatting") {
    return rejectAllFormattingCommand(_editor);
  }

  // Nếu là tính năng planned
  if (descriptor.status === "planned") {
    return {
      success: false,
      itemType: itemId,
      message: `Chức năng "${descriptor.name}" (${descriptor.nameEn}) dự kiến sẽ được phát triển ở ${descriptor.phase}.`,
    };
  }

  return {
    success: false,
    itemType: itemId,
    message: `Lệnh ${itemId} hiện đang bị vô hiệu hóa.`,
  };
}
