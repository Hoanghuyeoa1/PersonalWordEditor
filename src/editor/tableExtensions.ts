import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  type CellMargins,
  DEFAULT_TABLE_CELL_MARGINS,
  validateAndNormalizeCellMargins,
  type RowHeightRule,
} from "./tableDimensionService.ts";

export type TableBorderStyle = "all" | "none" | "outside";
export type CellTextAlign = "left" | "center" | "right";
export type CellVerticalAlign = "top" | "middle" | "bottom";
export type TableLayoutMode = "autoContent" | "autoWindow" | "fixed";
export type TableWidthUnit = "auto" | "percent" | "fixed";
export { type CellMargins, type RowHeightRule };

/**
 * CustomTable Extension:
 * - Kích hoạt kéo thả thay đổi kích thước cột (Column Resizing).
 * - Quản lý kiểu viền bảng (borders: "all" | "none" | "outside").
 * - Quản lý chế độ kích thước bảng (layoutMode: "autoContent" | "autoWindow" | "fixed").
 * - Quản lý độ rộng toàn bảng (tableWidth: "auto" | "100%" | "number").
 * - Quản lý lề mặc định của ô (cellMargins: top, right, bottom, left).
 */
export const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("id") || element.getAttribute("data-id") || null,
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { id: attributes.id, "data-id": attributes.id };
        },
      },
      targetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-target-id") || null,
        renderHTML: (attributes) => {
          if (!attributes.targetId) return {};
          return { "data-target-id": attributes.targetId };
        },
      },
      objectAnchor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-object-anchor") || null,
        renderHTML: (attributes) => {
          if (!attributes.objectAnchor) return {};
          return { "data-object-anchor": attributes.objectAnchor };
        },
      },
      borders: {
        default: "all",
        parseHTML: (element) => element.getAttribute("data-borders") || "all",
        renderHTML: (attributes) => {
          const borders = attributes.borders || "all";
          return {
            "data-borders": borders,
            class: `editor-table table-borders-${borders}`,
          };
        },
      },
      repeatHeader: {
        default: true,
        parseHTML: (element) => {
          const val = element.getAttribute("data-repeat-header");
          return val === "false" ? false : true;
        },
        renderHTML: (attributes) => {
          if (attributes.repeatHeader === false) {
            return { "data-repeat-header": "false" };
          }
          return {};
        },
      },
      layoutMode: {
        default: "autoWindow",
        parseHTML: (element) => {
          const val = element.getAttribute("data-layout-mode");
          if (val === "autoContent" || val === "autoWindow" || val === "fixed") {
            return val;
          }
          return "autoWindow";
        },
        renderHTML: (attributes) => {
          const mode = attributes.layoutMode || "autoWindow";
          return {
            "data-layout-mode": mode,
          };
        },
      },
      tableWidth: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-table-width") || "100%",
        renderHTML: (attributes) => {
          if (!attributes.tableWidth) return {};
          return {
            "data-table-width": attributes.tableWidth,
          };
        },
      },
      cellMargins: {
        default: DEFAULT_TABLE_CELL_MARGINS,
        parseHTML: (element) => {
          const attr = element.getAttribute("data-cell-margins");
          if (attr) {
            try {
              return validateAndNormalizeCellMargins(JSON.parse(attr));
            } catch {
              // fallback
            }
          }
          return DEFAULT_TABLE_CELL_MARGINS;
        },
        renderHTML: (attributes) => {
          const m = attributes.cellMargins || DEFAULT_TABLE_CELL_MARGINS;
          return {
            "data-cell-margins": JSON.stringify(m),
          };
        },
      },
      tableStyleId: {
        default: "grid",
        parseHTML: (element) => element.getAttribute("data-table-style-id") || "grid",
        renderHTML: (attributes) => ({
          "data-table-style-id": attributes.tableStyleId || "grid",
        }),
      },
      tableStyleOptions: {
        default: {
          headerRow: true,
          bandedRows: true,
          firstColumn: false,
          lastColumn: false,
          bandedColumns: false,
        },
        parseHTML: (element) => {
          const raw = element.getAttribute("data-table-style-options");
          if (raw) {
            try {
              return JSON.parse(raw);
            } catch {}
          }
          return {
            headerRow: true,
            bandedRows: true,
            firstColumn: false,
            lastColumn: false,
            bandedColumns: false,
          };
        },
        renderHTML: (attributes) => {
          if (!attributes.tableStyleOptions) return {};
          return {
            "data-table-style-options": JSON.stringify(attributes.tableStyleOptions),
          };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const borders = HTMLAttributes["data-borders"] || "all";
    const styleId = HTMLAttributes["data-table-style-id"] || "grid";
    let opts: Record<string, boolean> = {
      headerRow: true,
      bandedRows: true,
    };
    if (HTMLAttributes["data-table-style-options"]) {
      try {
        opts = JSON.parse(HTMLAttributes["data-table-style-options"]);
      } catch {}
    }

    const classes = [
      "editor-table",
      `table-borders-${borders}`,
      `table-style-${styleId}`,
    ];
    if (opts.bandedRows) classes.push("has-banded-rows");
    if (opts.headerRow) classes.push("has-header-row");
    if (opts.firstColumn) classes.push("has-first-column");
    if (opts.lastColumn) classes.push("has-last-column");
    if (opts.bandedColumns) classes.push("has-banded-columns");
    HTMLAttributes.class = classes.join(" ");

    const styles: string[] = [];
    if (HTMLAttributes["data-cell-margins"]) {
      try {
        const m = JSON.parse(HTMLAttributes["data-cell-margins"]);
        styles.push(`--table-cell-padding-top: ${m.top}px`);
        styles.push(`--table-cell-padding-right: ${m.right}px`);
        styles.push(`--table-cell-padding-bottom: ${m.bottom}px`);
        styles.push(`--table-cell-padding-left: ${m.left}px`);
      } catch {}
    }
    if (HTMLAttributes["data-table-width"]) {
      styles.push(`width: ${HTMLAttributes["data-table-width"]}`);
    }
    if (styles.length > 0) {
      HTMLAttributes.style = styles.join("; ") + ";";
    }

    return ["table", HTMLAttributes, 0];
  },
}).configure({
  resizable: true,
  lastColumnResizable: true,
  cellMinWidth: 25,
  HTMLAttributes: {
    class: "editor-table",
  },
});

/**
 * CustomTableRow Extension (Phase 5):
 * - rowHeight: Chiều cao chỉ định (px) hoặc null nếu auto.
 * - rowHeightRule: "auto" | "atLeast" | "exact".
 */
export const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute("data-row-height");
          const num = val ? parseFloat(val) : NaN;
          return Number.isFinite(num) && num > 0 ? num : null;
        },
        renderHTML: (attributes) => {
          if (attributes.rowHeight && attributes.rowHeight > 0) {
            return {
              "data-row-height": attributes.rowHeight,
            };
          }
          return {};
        },
      },
      rowHeightRule: {
        default: "auto",
        parseHTML: (element) => {
          const val = element.getAttribute("data-row-height-rule");
          if (val === "atLeast" || val === "exact") return val;
          return "auto";
        },
        renderHTML: (attributes) => {
          const rule = attributes.rowHeightRule || "auto";
          if (rule !== "auto") {
            return { "data-row-height-rule": rule };
          }
          return {};
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const styles: string[] = [];
    if (HTMLAttributes["data-row-height"]) {
      const h = HTMLAttributes["data-row-height"];
      const rule = HTMLAttributes["data-row-height-rule"] || "auto";
      if (rule === "exact") {
        styles.push(`height: ${h}px`);
      } else if (rule === "atLeast") {
        styles.push(`min-height: ${h}px`);
        styles.push(`height: ${h}px`);
      }
    }
    if (styles.length > 0) {
      HTMLAttributes.style = styles.join("; ") + ";";
    }
    return ["tr", HTMLAttributes, 0];
  },
});

/**
 * Shared cell attributes cho cả TableCell và TableHeader:
 * - backgroundColor: Màu nền/highlight ô
 * - verticalAlign: Căn dọc ô (top, middle, bottom)
 * - textAlign: Căn ngang ô (left, center, right)
 * - cellMargins: Lề ô tùy chỉnh riêng (Cell Margin Override)
 */
const sharedCellAttributes = {
  colspan: {
    default: 1,
    parseHTML: (element: HTMLElement) => {
      const val = element.getAttribute("colspan");
      const num = val ? parseInt(val, 10) : 1;
      return Number.isFinite(num) && num > 0 ? num : 1;
    },
    renderHTML: (attributes: Record<string, any>) => {
      if (attributes.colspan && attributes.colspan > 1) {
        return { colspan: attributes.colspan };
      }
      return {};
    },
  },
  rowspan: {
    default: 1,
    parseHTML: (element: HTMLElement) => {
      const val = element.getAttribute("rowspan");
      const num = val ? parseInt(val, 10) : 1;
      return Number.isFinite(num) && num > 0 ? num : 1;
    },
    renderHTML: (attributes: Record<string, any>) => {
      if (attributes.rowspan && attributes.rowspan > 1) {
        return { rowspan: attributes.rowspan };
      }
      return {};
    },
  },
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.style.backgroundColor || element.getAttribute("data-bg-color") || null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.backgroundColor) return {};
      return {
        "data-bg-color": attributes.backgroundColor,
      };
    },
  },
  verticalAlign: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.style.verticalAlign || element.getAttribute("data-valign") || null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.verticalAlign) return {};
      return {
        "data-valign": attributes.verticalAlign,
      };
    },
  },
  textAlign: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.style.textAlign || element.getAttribute("data-align") || null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.textAlign) return {};
      return {
        "data-align": attributes.textAlign,
      };
    },
  },
  cellMargins: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const attr = element.getAttribute("data-cell-margins");
      if (attr) {
        try {
          return validateAndNormalizeCellMargins(JSON.parse(attr));
        } catch {
          return null;
        }
      }
      return null;
    },
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.cellMargins) return {};
      const m = attributes.cellMargins;
      return {
        "data-cell-margins": JSON.stringify(m),
      };
    },
  },
};

/**
 * Hợp nhất và tạo style cho TableCell và TableHeader mà không bị ghi đè thuộc tính
 */
function compileCellStyles(HTMLAttributes: Record<string, any>): void {
  const styles: string[] = [];
  if (HTMLAttributes["data-bg-color"]) {
    styles.push(`background-color: ${HTMLAttributes["data-bg-color"]}`);
  }
  if (HTMLAttributes["data-valign"]) {
    styles.push(`vertical-align: ${HTMLAttributes["data-valign"]}`);
  }
  if (HTMLAttributes["data-align"]) {
    styles.push(`text-align: ${HTMLAttributes["data-align"]}`);
  }
  if (HTMLAttributes["data-cell-margins"]) {
    try {
      const m = JSON.parse(HTMLAttributes["data-cell-margins"]);
      styles.push(`padding: ${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`);
    } catch {}
  }
  if (styles.length > 0) {
    HTMLAttributes.style = styles.join("; ") + ";";
  }
}

/**
 * CustomTableCell:
 * Mở rộng thuộc tính ô dữ liệu với màu nền, căn chỉnh và lề ô riêng biệt.
 */
export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...sharedCellAttributes,
    };
  },
  renderHTML({ HTMLAttributes }) {
    compileCellStyles(HTMLAttributes);
    return ["td", HTMLAttributes, 0];
  },
}).configure({
  HTMLAttributes: {
    class: "editor-table-cell",
  },
});

/**
 * CustomTableHeader:
 * Mở rộng thuộc tính ô tiêu đề với màu nền, căn chỉnh và lề ô riêng biệt.
 */
export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...sharedCellAttributes,
    };
  },
  renderHTML({ HTMLAttributes }) {
    compileCellStyles(HTMLAttributes);
    return ["th", HTMLAttributes, 0];
  },
}).configure({
  HTMLAttributes: {
    class: "editor-table-header",
  },
});

export { CustomTableRow as TableRow };
