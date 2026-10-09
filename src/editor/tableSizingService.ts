import type { Editor } from "@tiptap/core";
import { TableMap } from "@tiptap/pm/tables";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { TableLayoutMode } from "./tableExtensions.ts";
import { DEFAULT_PAGE_SETTINGS } from "../page/services/pageConstants.ts";
import { getPageDimensions, mmToPx } from "../page/services/pageSettingsService.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

export interface TableSizingOptions {
  minColumnWidth?: number;
  maxAvailableWidth?: number;
  usableWidthPx?: number;
}

/**
 * Lấy usable content width (px) của section/trang chứa bảng.
 * Tuyệt đối không dùng browser window.innerWidth làm document source of truth.
 * Tuân thủ geometry thực tế của trang (A4 Portrait ~602px, A4 Landscape ~931px).
 */
export function getSectionUsableWidthPx(editor: Editor | null, tablePos?: number): number {
  let settings = { ...DEFAULT_PAGE_SETTINGS };

  try {
    const storeSettings = useDocumentStore?.getState()?.pageSettings;
    if (storeSettings) {
      settings = { ...storeSettings };
    }
  } catch {
    // headless test hoặc chưa khởi tạo store
  }

  // Nếu có tablePos và editor, kiểm tra xem bảng có nằm sau Section Break nào có thiết lập riêng không
  if (editor && typeof tablePos === "number" && tablePos >= 0) {
    const doc = editor.state.doc;
    let foundSectionSettings: any = null;
    doc.nodesBetween(0, tablePos, (node) => {
      if (node.type.name === "sectionBreak" && node.attrs?.settings) {
        foundSectionSettings = node.attrs.settings;
      }
    });
    if (foundSectionSettings) {
      settings = { ...settings, ...foundSectionSettings };
    }
  }

  const dims = getPageDimensions(settings.paperSize, settings.orientation);
  const widthPx = mmToPx(dims.width);
  const leftPx = mmToPx(settings.margins.left);
  const rightPx = mmToPx(settings.margins.right);
  const usable = Math.round(widthPx - leftPx - rightPx);
  return Math.max(200, usable);
}

/**
 * Tìm table node và vị trí tablePos của bảng đang chứa con trỏ hoặc selection.
 */
export function findActiveTable(editor: Editor | null): {
  tableNode: ProsemirrorNode;
  tablePos: number;
} | null {
  if (!editor || !editor.state) return null;
  const { state } = editor;
  const { $from } = state.selection;

  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "table" || node.type.spec.tableRole === "table") {
      return {
        tableNode: node,
        tablePos: $from.before(d),
      };
    }
  }
  return null;
}

/**
 * Trích xuất toàn bộ văn bản thô từ một node
 */
function getNodePlainText(node: ProsemirrorNode): string {
  let text = "";
  node.descendants((child) => {
    if (child.isText && child.text) {
      text += child.text;
    }
    return true;
  });
  return text;
}

/**
 * Tính toán độ rộng từng cột theo nội dung (AutoFit Contents).
 * - Dựa trên đo lường ký tự/từ dài nhất trong từng ô (đơn định).
 * - minColumnWidth (mặc định 40px).
 * - maxAvailableWidth (giới hạn bởi usable page width, không bao giờ sinh kích thước vô hạn).
 * - Long unbroken string / URL: có giới hạn capping hợp lý.
 */
export function calculateAutoFitContentWidths(
  tableNode: ProsemirrorNode,
  options?: { minColumnWidth?: number; maxAvailableWidth?: number }
): number[] {
  const map = TableMap.get(tableNode);
  const colCount = map.width;
  const minWidth = options?.minColumnWidth ?? 40;
  const maxAvailable = options?.maxAvailableWidth ?? 602;
  const charWidthPx = 8.5;
  const paddingPx = 20;

  const rawColWidths: number[] = new Array(colCount).fill(minWidth);

  for (let col = 0; col < colCount; col++) {
    let maxColRequired = minWidth;

    for (let row = 0; row < map.height; row++) {
      const cellPos = map.map[row * colCount + col];
      const cell = tableNode.nodeAt(cellPos);
      if (!cell) continue;

      const colspan = cell.attrs.colspan || 1;
      const text = getNodePlainText(cell).trim();
      if (!text) {
        continue;
      }

      // Đo chiều dài các từ và các đoạn văn bản
      const words = text.split(/\s+/);
      const longestWordLength = Math.max(0, ...words.map((w) => w.length));

      // Kích thước tối thiểu để không bị tràn từ không gãy (unbroken string)
      const unbrokenWidth = Math.ceil(longestWordLength * charWidthPx) + paddingPx;
      // Kích thước đầy đủ nếu hiển thị trên 1 dòng
      const fullLineWidth = Math.ceil(text.length * charWidthPx) + paddingPx;

      // Giới hạn hợp lý: không vượt quá 85% diện tích trang cho 1 cột đơn lẻ
      const safeMaxWidth = Math.max(minWidth, Math.round(maxAvailable * 0.85));
      const cappedUnbroken = Math.min(unbrokenWidth, safeMaxWidth);
      const cappedFull = Math.min(fullLineWidth, safeMaxWidth);

      // Kích thước mong muốn của ô
      const desiredCellWidth = Math.max(cappedUnbroken, Math.min(cappedFull, safeMaxWidth));

      if (colspan === 1) {
        if (desiredCellWidth > maxColRequired) {
          maxColRequired = desiredCellWidth;
        }
      } else {
        // Ô merge nhiều cột: chia đều yêu cầu cho từng cột
        const perColWidth = Math.ceil(desiredCellWidth / colspan);
        if (perColWidth > maxColRequired) {
          maxColRequired = perColWidth;
        }
      }
    }

    rawColWidths[col] = Math.max(minWidth, Math.min(maxColRequired, maxAvailable));
  }

  // Kiểm tra tổng chiều rộng của các cột
  const total = rawColWidths.reduce((sum, w) => sum + w, 0);

  if (total > maxAvailable) {
    const totalMin = minWidth * colCount;
    if (totalMin >= maxAvailable) {
      // Nếu minWidth của toàn bộ cột đã chạm hoặc vượt usable: chia đều
      const base = Math.max(10, Math.floor(maxAvailable / colCount));
      const res = new Array(colCount).fill(base);
      const remainder = maxAvailable - base * colCount;
      if (remainder > 0) res[res.length - 1] += remainder;
      return res;
    }

    const surplus = maxAvailable - totalMin;
    const excesses = rawColWidths.map((w) => Math.max(0, w - minWidth));
    const totalExcess = excesses.reduce((sum, e) => sum + e, 0);

    const scaledWidths: number[] = new Array(colCount).fill(minWidth);
    if (totalExcess > 0) {
      for (let i = 0; i < colCount; i++) {
        const share = Math.floor(surplus * (excesses[i] / totalExcess));
        scaledWidths[i] += share;
      }
    }

    const currentSum = scaledWidths.reduce((sum, w) => sum + w, 0);
    const diff = maxAvailable - currentSum;
    if (diff > 0) {
      // Thêm phần dư làm tròn vào cột rộng nhất
      let maxIdx = 0;
      for (let i = 1; i < colCount; i++) {
        if (scaledWidths[i] > scaledWidths[maxIdx]) maxIdx = i;
      }
      scaledWidths[maxIdx] += diff;
    }
    return scaledWidths;
  }

  return rawColWidths;
}

/**
 * Tính toán độ rộng các cột để lấp đầy usable width của trang (AutoFit Window).
 * - Usable width lấy từ section/page geometry (A4 Portrait ~602px, Landscape ~931px).
 * - Phân bổ đều hoặc theo tỷ lệ hiện có của các cột.
 */
export function calculateAutoFitWindowWidths(
  tableNode: ProsemirrorNode,
  usableWidthPx: number,
  minColumnWidth = 40
): number[] {
  const map = TableMap.get(tableNode);
  const colCount = map.width;
  if (colCount <= 0) return [];

  const targetWidth = Math.max(minColumnWidth * colCount, usableWidthPx);

  // Lấy các độ rộng cột hiện tại nếu có
  const existingWidths: number[] = [];
  let hasValidExisting = true;

  for (let c = 0; c < colCount; c++) {
    const cellPos = map.map[c];
    const cell = tableNode.nodeAt(cellPos);
    const colwidth = cell?.attrs?.colwidth;
    if (colwidth && Array.isArray(colwidth) && colwidth[0] > 0) {
      existingWidths.push(colwidth[0]);
    } else {
      hasValidExisting = false;
      break;
    }
  }

  if (hasValidExisting && existingWidths.length === colCount) {
    const totalExisting = existingWidths.reduce((sum, w) => sum + w, 0);
    if (totalExisting > 0) {
      const scale = targetWidth / totalExisting;
      const scaled = existingWidths.map((w) => Math.max(minColumnWidth, Math.floor(w * scale)));
      const remainder = targetWidth - scaled.reduce((sum, w) => sum + w, 0);
      scaled[scaled.length - 1] += remainder;
      return scaled;
    }
  }

  // Phân bổ đều cho các cột
  const baseWidth = Math.floor(targetWidth / colCount);
  const remainder = targetWidth - baseWidth * colCount;
  const widths = new Array(colCount).fill(baseWidth);
  widths[colCount - 1] += remainder;
  return widths;
}

/**
 * Tạo một transaction cập nhật colwidth cho toàn bộ ô trong bảng và cập nhật table attributes.
 * Thao tác là 1 bước transaction đơn lẻ (Atomic Undo/Redo).
 */
export function applyTableColumnWidths(
  tr: Transaction,
  tablePos: number,
  tableNode: ProsemirrorNode,
  colWidths: number[],
  layoutMode: TableLayoutMode,
  tableWidth = "100%"
): Transaction {
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const seenPos = new Set<number>();

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const cellOffset = map.map[row * map.width + col];
      if (seenPos.has(cellOffset)) continue;
      seenPos.add(cellOffset);

      const cell = tableNode.nodeAt(cellOffset);
      if (!cell) continue;

      const colspan = cell.attrs.colspan || 1;
      const cellColWidths = colWidths.slice(col, col + colspan);

      tr.setNodeMarkup(tableStart + cellOffset, null, {
        ...cell.attrs,
        colwidth: cellColWidths,
      });
    }
  }

  // Cập nhật thuộc tính table
  tr.setNodeMarkup(tablePos, null, {
    ...tableNode.attrs,
    layoutMode,
    tableWidth,
  });

  return tr;
}

export function ensureEditorPlugins(editor: Editor | null): void {
  if (!editor) return;
  if (editor.state.plugins.length === 0 && (editor.extensionManager?.plugins?.length ?? 0) > 0) {
    const newState = editor.state.reconfigure({ plugins: editor.extensionManager.plugins });
    editor.view.updateState(newState);
  }
}

/**
 * Command: AutoFit Contents
 */
export function autoFitContents(editor: Editor | null, options?: TableSizingOptions): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  const active = findActiveTable(editor);
  if (!active) return false;

  const { tableNode, tablePos } = active;
  const maxAvailable = options?.maxAvailableWidth ?? getSectionUsableWidthPx(editor, tablePos);
  const minWidth = options?.minColumnWidth ?? 40;

  const colWidths = calculateAutoFitContentWidths(tableNode, {
    minColumnWidth: minWidth,
    maxAvailableWidth: maxAvailable,
  });

  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
  const tr = editor.state.tr;
  applyTableColumnWidths(tr, tablePos, tableNode, colWidths, "autoContent", `${totalWidth}px`);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Command: AutoFit Window
 */
export function autoFitWindow(editor: Editor | null, options?: TableSizingOptions): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  const active = findActiveTable(editor);
  if (!active) return false;

  const { tableNode, tablePos } = active;
  const usableWidth = options?.usableWidthPx ?? getSectionUsableWidthPx(editor, tablePos);
  const minWidth = options?.minColumnWidth ?? 40;

  const colWidths = calculateAutoFitWindowWidths(tableNode, usableWidth, minWidth);

  const tr = editor.state.tr;
  applyTableColumnWidths(tr, tablePos, tableNode, colWidths, "autoWindow", "100%");
  editor.view.dispatch(tr);
  return true;
}

/**
 * Command: Set Fixed Column Widths (hoặc chuyển sang chế độ Fixed)
 */
export function setFixedColumnWidths(
  editor: Editor | null,
  widths?: number[],
  options?: TableSizingOptions
): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  const active = findActiveTable(editor);
  if (!active) return false;

  const { tableNode, tablePos } = active;
  const map = TableMap.get(tableNode);
  const colCount = map.width;
  const minWidth = options?.minColumnWidth ?? 40;

  let targetWidths: number[];

  if (widths && widths.length === colCount) {
    targetWidths = widths.map((w) => Math.max(minWidth, Math.round(w)));
  } else {
    // Nếu không truyền widths, lấy widths hiện tại hoặc fallback sang đều nhau
    const existing = calculateAutoFitWindowWidths(
      tableNode,
      options?.usableWidthPx ?? getSectionUsableWidthPx(editor, tablePos),
      minWidth
    );
    targetWidths = existing;
  }

  const totalWidth = targetWidths.reduce((sum, w) => sum + w, 0);
  const tr = editor.state.tr;
  applyTableColumnWidths(tr, tablePos, tableNode, targetWidths, "fixed", `${totalWidth}px`);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Lấy layoutMode hiện tại của bảng
 */
export function getTableLayoutMode(editor: Editor | null): TableLayoutMode | null {
  const active = findActiveTable(editor);
  if (!active) return null;
  return active.tableNode.attrs.layoutMode || "autoWindow";
}

/**
 * Thiết lập layoutMode của bảng
 */
export function setTableLayoutMode(editor: Editor | null, mode: TableLayoutMode): boolean {
  if (!editor || !editor.isActive("table")) return false;
  ensureEditorPlugins(editor);
  const active = findActiveTable(editor);
  if (!active) return false;

  if (mode === "autoContent") {
    return autoFitContents(editor);
  }
  if (mode === "autoWindow") {
    return autoFitWindow(editor);
  }
  return setFixedColumnWidths(editor);
}
