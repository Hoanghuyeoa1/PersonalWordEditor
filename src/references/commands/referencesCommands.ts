import type { Editor } from "@tiptap/core";
import { useReferencesStore } from "../../stores/referencesStore.ts";
import type {
  ReferenceItemType,
  ReferenceCommandResult,
  ReferencePanelType,
} from "../types/referencesTypes.ts";
import { getReferenceItemDescriptor } from "../services/referencesRegistry.ts";
import { TocService } from "../services/tocService.ts";
import { NoteService } from "../services/noteService.ts";
import { CaptionService } from "../services/captionService.ts";
import { CrossReferenceService } from "../services/crossReferenceService.ts";
import { CitationService } from "../services/citationService.ts";
import { CaptionListService } from "../services/captionListService.ts";
import type { TocConfig } from "../types/tocTypes.ts";
import type { InsertCaptionOptions } from "../types/captionTypes.ts";
import type { CaptionListConfig } from "../types/captionListTypes.ts";
import type { PageLayoutMap } from "../../page/services/pageLayoutMap.ts";
import type { InsertCrossReferenceOptions } from "../types/crossReferenceTypes.ts";
import type { InsertCitationOptions, InsertBibliographyOptions } from "../types/citationTypes.ts";


/**
 * References Commands - Personal Word Editor (Phase 6.1 Architecture)
 *
 * Tầng trừu tượng hóa các lệnh điều phối trong References Engine.
 * Luồng dữ liệu chuẩn mực:
 * References Ribbon UI -> References Commands -> Tiptap/ProseMirror -> Document Model -> Persistence.
 * Tuyệt đối không mutate DOM editor trực tiếp từ UI.
 */

/**
 * Mở bảng điều khiển tham chiếu phụ trợ bên lề (UI only)
 */
export function openReferencePanelCommand(panel: ReferencePanelType): ReferenceCommandResult {
  useReferencesStore.getState().openReferencePanel(panel);
  return {
    success: true,
    itemType: "headingsOutline",
    details: { panel, isOpen: true },
  };
}

/**
 * Đóng bảng điều khiển tham chiếu phụ trợ
 */
export function closeReferencePanelCommand(): ReferenceCommandResult {
  useReferencesStore.getState().closeReferencePanel();
  return {
    success: true,
    itemType: "headingsOutline",
    details: { isOpen: false },
  };
}

/**
 * Đảo trạng thái mở/đóng của bảng điều khiển tham chiếu
 */
export function toggleReferencePanelCommand(panel: ReferencePanelType): ReferenceCommandResult {
  useReferencesStore.getState().toggleReferencePanel(panel);
  const isOpen = useReferencesStore.getState().isReferencesPanelOpen;
  return {
    success: true,
    itemType: "headingsOutline",
    details: { panel, isOpen },
  };
}

/**
 * Chọn một đối tượng tham chiếu cụ thể trên UI
 */
export function selectReferenceCommand(id: string | null): ReferenceCommandResult {
  useReferencesStore.getState().setSelectedReferenceId(id);
  return {
    success: true,
    itemType: "headingsOutline",
    details: { selectedReferenceId: id },
  };
}

/**
 * Chèn một khối Mục lục vào tài liệu
 */
export function insertTocCommand(
  editor?: Editor | null,
  config?: TocConfig
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "insertToc",
      message: "Editor chưa sẵn sàng để chèn mục lục.",
    };
  }
  return TocService.insertToc(editor, config);
}

/**
 * Cập nhật khối Mục lục (F9 / Update TOC)
 */
export function updateTocCommand(
  editor?: Editor | null,
  options?: { updatePageNumbersOnly?: boolean }
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "updateToc",
      message: "Editor chưa sẵn sàng để cập nhật mục lục.",
    };
  }
  return TocService.updateToc(editor, options);
}

/**
 * Xóa khối Mục lục khỏi tài liệu
 */
export function removeTocCommand(editor?: Editor | null): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "removeToc",
      message: "Editor chưa sẵn sàng để xóa mục lục.",
    };
  }
  return TocService.removeToc(editor);
}

/**
 * Chèn một Footnote ngữ nghĩa vào vị trí con trỏ
 */
export function insertFootnoteCommand(
  editor?: Editor | null,
  initialContent = ""
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "insertFootnote",
      message: "Editor chưa sẵn sàng để chèn chú thích chân trang.",
    };
  }
  return NoteService.insertNote(editor, "footnote", initialContent);
}

/**
 * Chèn một Endnote ngữ nghĩa vào vị trí con trỏ
 */
export function insertEndnoteCommand(
  editor?: Editor | null,
  initialContent = ""
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "insertEndnote",
      message: "Editor chưa sẵn sàng để chèn chú thích cuối tài liệu.",
    };
  }
  return NoteService.insertNote(editor, "endnote", initialContent);
}

/**
 * Di chuyển đến Footnote tiếp theo
 */
export function nextFootnoteCommand(editor?: Editor | null): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "nextFootnote",
      message: "Editor chưa sẵn sàng để điều hướng chú thích.",
    };
  }
  return NoteService.navigateToNextNote(editor, "footnote");
}

/**
 * Di chuyển đến Footnote trước đó
 */
export function previousFootnoteCommand(editor?: Editor | null): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "previousFootnote",
      message: "Editor chưa sẵn sàng để điều hướng chú thích.",
    };
  }
  return NoteService.navigateToPreviousNote(editor, "footnote");
}

/**
 * Mở / Đóng thanh quản lý Chú thích bên lề (Show Notes)
 */
export function showNotesCommand(): ReferenceCommandResult {
  return toggleReferencePanelCommand("notes");
}

/**
 * Bộ điều phối trung tâm cho toàn bộ lệnh References (Dispatch Command)
 * Kiểm tra trạng thái registry trước khi kích hoạt.
 * Nếu tính năng là "planned", trả về phản hồi an toàn và không thực hiện thao tác giả.
 */
export function dispatchReferenceCommand(
  id: ReferenceItemType,
  _editor?: Editor | null
): ReferenceCommandResult {
  const descriptor = getReferenceItemDescriptor(id);
  if (!descriptor) {
    return {
      success: false,
      itemType: id,
      message: `Không tìm thấy tính năng "${id}" trong References Registry.`,
    };
  }

  // Nếu tính năng thuộc diện dự kiến phát triển ở phase sau (planned)
  if (descriptor.status === "planned") {
    return {
      success: false,
      itemType: id,
      message: `Tính năng "${descriptor.name}" đang được lên kế hoạch triển khai tại Phase ${descriptor.phase}.`,
      details: { phase: descriptor.phase, status: "planned" },
    };
  }

  // Nếu tính năng bị vô hiệu hóa
  if (descriptor.status === "disabled") {
    return {
      success: false,
      itemType: id,
      message: `Tính năng "${descriptor.name}" hiện đang bị tạm khóa.`,
      details: { status: "disabled" },
    };
  }

  // Các lệnh được kích hoạt
  switch (id) {
    case "headingsOutline":
      return toggleReferencePanelCommand("outline");
    case "insertToc":
      return insertTocCommand(_editor);
    case "updateToc":
      return updateTocCommand(_editor);
    case "removeToc":
      return removeTocCommand(_editor);
    case "insertFootnote":
      return insertFootnoteCommand(_editor);
    case "insertEndnote":
      return insertEndnoteCommand(_editor);
    case "nextFootnote":
      return nextFootnoteCommand(_editor);
    case "previousFootnote":
      return previousFootnoteCommand(_editor);
    case "showNotes":
      return showNotesCommand();
    case "insertCaption":
      return insertCaptionCommand(_editor);
    case "crossReference":
      return insertCrossReferenceCommand(_editor);
    case "insertCitation":
      return insertCitationCommand(_editor);
    case "manageSources":
      return manageSourcesCommand();
    case "citationStyle":
      return citationStyleCommand();
    case "insertBibliography":
      return insertBibliographyCommand(_editor);
    case "insertTableOfFigures":
      return insertTableOfFiguresCommand(_editor);
    case "updateTableOfFigures":
      return updateTableOfFiguresCommand(_editor);
    case "bookmarksList":
      return manageBookmarksCommand(_editor);
    default:
      return {
        success: false,
        itemType: id,
        message: `Chưa có trình xử lý cụ thể cho "${descriptor.name}".`,
      };
  }
}

/**
 * Chèn một khối Danh mục Chú thích (Table of Figures) vào tài liệu
 */
export function insertTableOfFiguresCommand(
  editor?: Editor | null,
  config?: CaptionListConfig
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "insertTableOfFigures",
      message: "Editor chưa sẵn sàng để chèn danh mục hình.",
    };
  }

  const res = CaptionListService.insertCaptionList(editor, config);
  return {
    success: res.success,
    itemType: "insertTableOfFigures",
    message: res.message,
    details: { listId: res.listId },
  };
}

/**
 * Cập nhật khối Danh mục Chú thích (Table of Figures) trong tài liệu
 */
export function updateTableOfFiguresCommand(
  editor?: Editor | null,
  options?: {
    captionListId?: string;
    label?: string;
    updatePageNumbersOnly?: boolean;
    layoutMap?: PageLayoutMap | null;
  }
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "updateTableOfFigures",
      message: "Editor chưa sẵn sàng để cập nhật danh mục chú thích.",
    };
  }

  // 1. Nếu caller chỉ định cụ thể captionListId hoặc label
  if (options?.captionListId || options?.label) {
    const res = CaptionListService.updateCaptionList(editor, options);
    return {
      success: res.success,
      itemType: "updateTableOfFigures",
      message: res.message,
      details: { updatedCount: res.updatedCount },
    };
  }

  // 2. Tự động phân giải khối Caption List hợp lệ theo ngữ cảnh con trỏ
  const resolved = CaptionListService.resolveActiveCaptionList(editor);
  if (!resolved) {
    return {
      success: false,
      itemType: "updateTableOfFigures",
      message:
        "Không tìm thấy danh mục chú thích hợp lệ để cập nhật. Vui lòng đặt con trỏ vào danh mục cần cập nhật.",
    };
  }

  const res = CaptionListService.updateCaptionList(editor, {
    captionListId: resolved.node.attrs.id,
    updatePageNumbersOnly: options?.updatePageNumbersOnly,
    layoutMap: options?.layoutMap,
  });

  return {
    success: res.success,
    itemType: "updateTableOfFigures",
    message: res.message,
    details: { updatedCount: res.updatedCount, listId: resolved.node.attrs.id },
  };
}


/**
 * Chèn một Caption semantic vào tài liệu
 */
export function insertCaptionCommand(
  editor?: Editor | null,
  options?: InsertCaptionOptions
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "insertCaption",
      message: "Editor chưa sẵn sàng để chèn chú thích.",
    };
  }

  // Nếu có options cụ thể (từ Dialog)
  if (options) {
    const res = CaptionService.insertCaption(editor, options);
    return {
      success: res.success,
      itemType: "insertCaption",
      message: res.message,
      details: { captionId: res.captionId },
    };
  }

  // Tự động phát hiện đối tượng đang chọn hoặc liền kề
  const detected = CaptionService.detectSelectedTarget(editor);
  const defaultLabel = CaptionService.getDefaultLabelForType(detected?.targetType);
  const res = CaptionService.insertCaption(editor, {
    label: defaultLabel,
    targetId: detected?.targetId,
  });

  return {
    success: res.success,
    itemType: "insertCaption",
    message: res.message,
    details: { captionId: res.captionId },
  };
}

/**
 * Chèn một Tham chiếu chéo (Cross-reference) semantic
 */
export function insertCrossReferenceCommand(
  editor?: Editor | null,
  options?: InsertCrossReferenceOptions
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "crossReference",
      message: "Editor chưa sẵn sàng để chèn tham chiếu chéo.",
    };
  }

  if (!options) {
    return {
      success: false,
      itemType: "crossReference",
      message: "Cần chọn đối tượng mục tiêu để chèn tham chiếu chéo.",
    };
  }

  const res = CrossReferenceService.insertCrossReference(editor, options);
  return {
    success: res.success,
    itemType: "crossReference",
    message: res.message,
  };
}

/**
 * Chèn một dấu trích dẫn (Citation) vào tài liệu
 */
export function insertCitationCommand(
  editor?: Editor | null,
  options?: InsertCitationOptions
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "insertCitation",
      message: "Editor chưa sẵn sàng để chèn trích dẫn.",
    };
  }

  if (!options) {
    return {
      success: false,
      itemType: "insertCitation",
      message: "Cần chọn nguồn để chèn trích dẫn.",
    };
  }

  const res = CitationService.insertCitation(editor, options);
  return {
    success: res.success,
    itemType: "insertCitation",
    message: res.message,
  };
}

/**
 * Mở hộp thoại Quản lý nguồn tài liệu tham khảo
 */
export function manageSourcesCommand(): ReferenceCommandResult {
  return {
    success: true,
    itemType: "manageSources",
    message: "Mở hộp thoại quản lý nguồn tài liệu.",
  };
}

/**
 * Mở hộp thoại Chọn kiểu trích dẫn
 */
export function citationStyleCommand(): ReferenceCommandResult {
  return {
    success: true,
    itemType: "citationStyle",
    message: "Mở hộp thoại chọn kiểu trích dẫn.",
  };
}

/**
 * Chèn hoặc cập nhật khối Thư mục tài liệu tham khảo (Bibliography)
 */
export function insertBibliographyCommand(
  editor?: Editor | null,
  options?: InsertBibliographyOptions
): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "insertBibliography",
      message: "Editor chưa sẵn sàng để chèn Thư mục tài liệu.",
    };
  }

  const res = CitationService.insertBibliography(editor, options);
  return {
    success: res.success,
    itemType: "insertBibliography",
    message: res.message,
  };
}

/**
 * Mở hộp thoại Quản lý Thẻ đánh dấu (Bookmark Manager)
 */
export function manageBookmarksCommand(editor?: Editor | null): ReferenceCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "bookmarksList",
      message: "Editor chưa sẵn sàng để quản lý thẻ đánh dấu.",
    };
  }
  return {
    success: true,
    itemType: "bookmarksList",
    message: "Mở hộp thoại quản lý thẻ đánh dấu.",
  };
}


