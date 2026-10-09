import type { Editor } from "@tiptap/core";
import {
  insertPageBreak,
  insertSectionBreak,
  insertHorizontalRule,
  updateOrInsertLink,
  insertSymbol,
  insertTable,
  insertImage,
  insertTextBox,
  insertShape,
  insertEquation,
} from "../../editor/editorCommands.ts";
import type {
  InsertItemType,
  InsertCommandResult,
  InsertTableOptions,
  InsertImageOptions,
  InsertShapeOptions,
  InsertTextBoxOptions,
  InsertLinkOptions,
  InsertHorizontalRuleOptions,
  InsertSymbolOptions,
  InsertEquationOptions,
} from "../types/insertTypes.ts";

/**
 * Kiểm tra xem kiểu phần tử có được schema ProseMirror hỗ trợ ở thời điểm hiện tại hay không.
 */
export function isItemSupportedInSchema(
  editor: Editor | null,
  itemType: InsertItemType
): boolean {
  if (!editor || !editor.schema) return false;
  const schema = editor.schema;

  switch (itemType) {
    case "pageBreak":
      return Boolean(schema.nodes.pageBreak);
    case "sectionBreak":
      return Boolean(schema.nodes.sectionBreak);
    case "table":
      return Boolean(schema.nodes.table);
    case "image":
      return Boolean(schema.nodes.image);
    case "horizontalRule":
      return Boolean(schema.nodes.horizontalRule);
    case "link":
      return Boolean(schema.marks.link);
    case "textbox":
      return Boolean(schema.nodes.textBox || schema.nodes.textbox);
    case "shape":
      return Boolean(schema.nodes.shape);
    case "symbol":
      // Symbol được chèn trực tiếp dưới dạng ký tự unicode vào text node
      return true;
    case "equation":
      return Boolean(schema.nodes.equation || schema.nodes.math);
    case "header":
    case "footer":
    case "pageNumber":
      // Quản lý qua Section Document Model (Phase 2.8)
      return true;
    default:
      return false;
  }
}

/**
 * Kiểm tra xem editor có sẵn sàng và có thể thực thi lệnh chèn phần tử này không.
 */
export function canInsertItem(
  editor: Editor | null,
  itemType: InsertItemType
): boolean {
  if (!editor) return false;
  if (!editor.isEditable) return false;

  // Đối với các tính năng thuộc Phase 2 đã hoàn thành
  if (itemType === "pageBreak") {
    return isItemSupportedInSchema(editor, "pageBreak");
  }
  if (itemType === "sectionBreak") {
    return isItemSupportedInSchema(editor, "sectionBreak");
  }
  if (itemType === "header" || itemType === "footer" || itemType === "pageNumber") {
    return true;
  }

  // Đối với các tính năng dự kiến trong Phase 3.x
  return isItemSupportedInSchema(editor, itemType);
}

/**
 * Thực thi chèn dấu ngắt trang (Page Break)
 */
export function executeInsertPageBreak(editor: Editor | null): InsertCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "pageBreak",
      message: "Editor chưa được khởi tạo.",
    };
  }

  const success = insertPageBreak(editor);
  return {
    success,
    itemType: "pageBreak",
    message: success ? "Đã chèn dấu ngắt trang thành công." : "Không thể chèn dấu ngắt trang tại vị trí hiện tại.",
  };
}

/**
 * Thực thi chèn dấu ngắt phần (Section Break - Next Page)
 */
export function executeInsertSectionBreak(
  editor: Editor | null,
  options?: { pageSettings?: import("../../page/types/pageTypes.ts").PageSettings }
): InsertCommandResult {
  if (!editor) {
    return {
      success: false,
      itemType: "sectionBreak",
      message: "Editor chưa được khởi tạo.",
    };
  }

  const success = insertSectionBreak(editor, options);
  return {
    success,
    itemType: "sectionBreak",
    message: success ? "Đã chèn dấu ngắt phần thành công." : "Không thể chèn dấu ngắt phần tại vị trí hiện tại.",
  };
}

/**
 * Thực thi chèn Bảng (Table - Phase 3.3)
 */
export function executeInsertTable(
  editor: Editor | null,
  options?: InsertTableOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "table", message: "Editor chưa được khởi tạo." };
  }

  const rows = options?.rows ?? 3;
  const cols = options?.cols ?? 3;
  const withHeaderRow = options?.withHeaderRow ?? true;

  const success = insertTable(editor, { rows, cols, withHeaderRow });
  return {
    success,
    itemType: "table",
    message: success
      ? `Đã chèn bảng ${rows} × ${cols} thành công.`
      : "Không thể chèn bảng (kích thước không hợp lệ hoặc vị trí không phù hợp).",
  };
}

/**
 * Thực thi chèn Hình ảnh (Image / Picture - Phase 3.5 & 3.6)
 */
export function executeInsertImage(
  editor: Editor | null,
  options?: InsertImageOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "image", message: "Editor chưa được khởi tạo." };
  }
  if (!isItemSupportedInSchema(editor, "image")) {
    return {
      success: false,
      itemType: "image",
      message: "Tính năng Chèn Hình ảnh (Picture) chưa sẵn sàng.",
    };
  }
  if (!options?.src) {
    return {
      success: false,
      itemType: "image",
      message: "Vui lòng cung cấp nguồn hình ảnh (src).",
    };
  }
  const ok = insertImage(editor, {
    src: options.src,
    alt: options.alt,
    title: options.title,
    width: options.width,
    height: options.height,
    alignment: options.alignment,
  });
  return {
    success: ok,
    itemType: "image",
    message: ok ? "Đã chèn hình ảnh thành công." : "Không thể chèn hình ảnh.",
    details: options ? { ...options } : undefined,
  };
}

/**
 * Thực thi chèn Hình vẽ (Shape - Phase 3.8)
 */
export function executeInsertShape(
  editor: Editor | null,
  options?: InsertShapeOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "shape", message: "Editor chưa được khởi tạo." };
  }
  if (!isItemSupportedInSchema(editor, "shape")) {
    return {
      success: false,
      itemType: "shape",
      message: "Tính năng Chèn Hình vẽ (Shape) chưa sẵn sàng.",
    };
  }
  const shapeType = options?.shapeKind === "circle" ? "ellipse" : (options?.shapeKind || "rectangle");
  const ok = insertShape(editor, {
    shapeType,
    width: options?.width,
    height: options?.height,
    fillColor: options?.fillColor,
    strokeColor: options?.strokeColor,
    strokeWidth: options?.strokeWidth,
    alignment: options?.alignment,
  });
  return {
    success: ok,
    itemType: "shape",
    message: ok ? "Đã chèn hình vẽ thành công." : "Không thể chèn hình vẽ.",
    details: options ? { ...options } : undefined,
  };
}

/**
 * Command Layer Stub: Chèn Hộp văn bản (Text Box - Dự kiến Phase 3.x)
 */
export function executeInsertTextBox(
  editor: Editor | null,
  options?: InsertTextBoxOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "textbox", message: "Editor chưa được khởi tạo." };
  }
  if (!isItemSupportedInSchema(editor, "textbox")) {
    return {
      success: false,
      itemType: "textbox",
      message: "Tính năng Chèn Hộp văn bản (Text Box) chưa sẵn sàng.",
    };
  }
  const ok = insertTextBox(editor, {
    width: options?.width,
    initialText: options?.initialText,
  });
  return {
    success: ok,
    itemType: "textbox",
    message: ok ? "Đã chèn Hộp văn bản thành công." : "Không thể chèn Hộp văn bản.",
    details: options ? { ...options } : undefined,
  };
}

/**
 * Thực thi chèn hoặc cập nhật siêu liên kết (Hyperlink - Phase 3.2)
 */
export function executeInsertLink(
  editor: Editor | null,
  options?: InsertLinkOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "link", message: "Editor chưa được khởi tạo." };
  }
  if (!options?.url) {
    return {
      success: false,
      itemType: "link",
      message: "Vui lòng cung cấp địa chỉ URL liên kết.",
    };
  }
  const text = options.text || options.url;
  const success = updateOrInsertLink(editor, text, options.url);
  return {
    success,
    itemType: "link",
    message: success ? "Đã chèn siêu liên kết thành công." : "Không thể chèn siêu liên kết.",
  };
}

/**
 * Thực thi chèn đường kẻ ngang (Horizontal Rule - Phase 3.2)
 */
export function executeInsertHorizontalRule(
  editor: Editor | null,
  _options?: InsertHorizontalRuleOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "horizontalRule", message: "Editor chưa được khởi tạo." };
  }
  const success = insertHorizontalRule(editor);
  return {
    success,
    itemType: "horizontalRule",
    message: success ? "Đã chèn đường kẻ ngang thành công." : "Không thể chèn đường kẻ ngang.",
  };
}

/**
 * Thực thi chèn ký hiệu đặc biệt Unicode (Symbol - Phase 3.2)
 */
export function executeInsertSymbol(
  editor: Editor | null,
  options?: InsertSymbolOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "symbol", message: "Editor chưa được khởi tạo." };
  }
  if (!options?.symbol) {
    return {
      success: false,
      itemType: "symbol",
      message: "Vui lòng chọn ký hiệu đặc biệt cần chèn.",
    };
  }
  const success = insertSymbol(editor, options.symbol);
  return {
    success,
    itemType: "symbol",
    message: success ? `Đã chèn ký hiệu ${options.symbol}` : "Không thể chèn ký hiệu.",
  };
}

/**
 * Thực thi chèn Công thức / Phương trình (Equation - Phase 3.8)
 */
export function executeInsertEquation(
  editor: Editor | null,
  options?: InsertEquationOptions
): InsertCommandResult {
  if (!editor) {
    return { success: false, itemType: "equation", message: "Editor chưa được khởi tạo." };
  }
  if (!isItemSupportedInSchema(editor, "equation")) {
    return {
      success: false,
      itemType: "equation",
      message: "Tính năng Chèn Công thức / Phương trình (Equation) chưa sẵn sàng.",
    };
  }
  const ok = insertEquation(editor, {
    latex: options?.latex,
    displayMode: options?.displayMode,
    alignment: options?.alignment,
  });
  return {
    success: ok,
    itemType: "equation",
    message: ok ? "Đã chèn công thức toán học thành công." : "Không thể chèn công thức toán học.",
    details: options ? { ...options } : undefined,
  };
}

/**
 * Điều phối lệnh chèn tổng thể (Unified Insert Command Dispatcher)
 * Luồng: Ribbon UI -> dispatchInsertCommand -> Command Implementation -> ProseMirror / Doc Model
 */
export function dispatchInsertCommand(
  editor: Editor | null,
  itemType: InsertItemType,
  payload?: unknown
): InsertCommandResult {
  switch (itemType) {
    case "pageBreak":
      return executeInsertPageBreak(editor);
    case "sectionBreak":
      return executeInsertSectionBreak(editor);
    case "table":
      return executeInsertTable(editor, payload as InsertTableOptions | undefined);
    case "image":
      return executeInsertImage(editor, payload as InsertImageOptions | undefined);
    case "shape":
      return executeInsertShape(editor, payload as InsertShapeOptions | undefined);
    case "textbox":
      return executeInsertTextBox(editor, payload as InsertTextBoxOptions | undefined);
    case "link":
      return executeInsertLink(editor, payload as InsertLinkOptions | undefined);
    case "horizontalRule":
      return executeInsertHorizontalRule(editor, payload as InsertHorizontalRuleOptions | undefined);
    case "symbol":
      return executeInsertSymbol(editor, payload as InsertSymbolOptions | undefined);
    case "equation":
      return executeInsertEquation(editor, payload as InsertEquationOptions | undefined);
    case "header":
    case "footer":
    case "pageNumber":
      return {
        success: true,
        itemType,
        message: "Tính năng Header & Footer được điều khiển qua Document Store và HeaderFooterEditor (Phase 2.8).",
      };
    default:
      return {
        success: false,
        itemType,
        message: `Lệnh chèn không xác định: ${itemType}`,
      };
  }
}
