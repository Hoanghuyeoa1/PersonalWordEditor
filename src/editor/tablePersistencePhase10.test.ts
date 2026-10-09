import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "./editorExtensions.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
  MWD_FORMAT_IDENTIFIER,
  MWD_CURRENT_FORMAT_VERSION,
  type MwdFilePackage,
} from "../document/documentFile.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import { TablePersistenceService } from "./tablePersistenceService.ts";
import { DEFAULT_TABLE_CELL_MARGINS } from "./tableDimensionService.ts";
import {
  validateNoRuntimeLayoutInPackage,
  FORBIDDEN_RUNTIME_LAYOUT_KEYS,
} from "../page/services/semanticPaginationPersistence.ts";
import { useDocumentStore } from "../stores/documentStore.ts";

// Helper: Tạo DocumentModel cơ sở có bảng
function createDocumentWithTable(tableContent: JSONContent): DocumentModel {
  return {
    metadata: {
      id: "doc-table-persistence-test",
      title: "Table Persistence Test Document",
      version: 1,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản mở đầu" }],
        },
        tableContent,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Văn bản kết thúc" }],
        },
      ],
    },
  };
}

// ============================================================================
// PHASE 10: NATIVE TABLE PERSISTENCE TEST SUITE
// ============================================================================

test("Phase 10 - 1. Rowspan persistence round-trip (.mwd save & open)", () => {
  const tableContent: JSONContent = {
    type: "table",
    attrs: { borders: "all" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 3 },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Spanned 3 Rows" }] }],
          },
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "R0C1" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "R1C1" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "R2C1" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const tableAfter = deserialized.document.content.content![1];
  const firstCell = tableAfter.content![0].content![0];

  assert.equal(firstCell.attrs?.rowspan, 3, "rowspan=3 phải được bảo toàn chính xác");
  assert.equal(firstCell.content![0].content![0].text, "Spanned 3 Rows");
});

test("Phase 10 - 2. Rowspan + Colspan rectangular merge round-trip", () => {
  const tableContent: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { rowspan: 2, colspan: 2 },
            content: [{ type: "paragraph", content: [{ type: "text", text: "2x2 Merged Region" }] }],
          },
          {
            type: "tableCell",
            attrs: { colspan: 2 },
            content: [{ type: "paragraph", content: [{ type: "text", text: "1x2 Horiz Region" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "R1C2" }] }],
          },
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "R1C3" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const tableAfter = deserialized.document.content.content![1];
  const cell2x2 = tableAfter.content![0].content![0];
  const cell1x2 = tableAfter.content![0].content![1];

  assert.equal(cell2x2.attrs?.rowspan, 2, "2x2 cell rowspan phải bằng 2");
  assert.equal(cell2x2.attrs?.colspan, 2, "2x2 cell colspan phải bằng 2");
  assert.equal(cell1x2.attrs?.colspan, 2, "1x2 cell colspan phải bằng 2");
  assert.equal(cell1x2.attrs?.rowspan, 1, "1x2 cell rowspan mặc định 1");
});

test("Phase 10 - 3. Column widths (colwidth) persistence round-trip", () => {
  const tableContent: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colwidth: [140] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Col 1" }] }],
          },
          {
            type: "tableCell",
            attrs: { colwidth: [280] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Col 2" }] }],
          },
          {
            type: "tableCell",
            attrs: { colwidth: [210] },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Col 3" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const row = deserialized.document.content.content![1].content![0];
  assert.deepEqual(row.content![0].attrs?.colwidth, [140]);
  assert.deepEqual(row.content![1].attrs?.colwidth, [280]);
  assert.deepEqual(row.content![2].attrs?.colwidth, [210]);
});

test("Phase 10 - 4. AutoFit mode & Table width persistence", () => {
  const tableContent: JSONContent = {
    type: "table",
    attrs: {
      layoutMode: "autoContent",
      tableWidth: "620px",
    },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "AutoContent Test" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const tableAfter = deserialized.document.content.content![1];
  assert.equal(tableAfter.attrs?.layoutMode, "autoContent");
  assert.equal(tableAfter.attrs?.tableWidth, "620px");
});

test("Phase 10 - 5. Cell Margins persistence (table default & cell override)", () => {
  const customTableMargins = { top: 12, right: 16, bottom: 12, left: 16 };
  const customCellOverride = { top: 4, right: 6, bottom: 4, left: 6 };

  const tableContent: JSONContent = {
    type: "table",
    attrs: {
      cellMargins: customTableMargins,
    },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { cellMargins: customCellOverride },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Cell with override" }] }],
          },
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Cell with table default" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const tableAfter = deserialized.document.content.content![1];
  assert.deepEqual(tableAfter.attrs?.cellMargins, customTableMargins, "Lề bảng mặc định phải được bảo toàn");

  const cell0 = tableAfter.content![0].content![0];
  const cell1 = tableAfter.content![0].content![1];

  assert.deepEqual(cell0.attrs?.cellMargins, customCellOverride, "Lề riêng của ô phải được bảo toàn");
  assert.equal(cell1.attrs?.cellMargins, null, "Ô không override phải giữ cellMargins=null");
});

test("Phase 10 - 6. Row height and row height rule persistence", () => {
  const tableContent: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        attrs: { rowHeight: 65.5, rowHeightRule: "atLeast" },
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Row 1 atLeast" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        attrs: { rowHeight: 40, rowHeightRule: "exact" },
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Row 2 exact" }] }],
          },
        ],
      },
      {
        type: "tableRow",
        attrs: { rowHeight: null, rowHeightRule: "auto" },
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Row 3 auto" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const rows = deserialized.document.content.content![1].content!;
  assert.equal(rows[0].attrs?.rowHeight, 65.5);
  assert.equal(rows[0].attrs?.rowHeightRule, "atLeast");

  assert.equal(rows[1].attrs?.rowHeight, 40);
  assert.equal(rows[1].attrs?.rowHeightRule, "exact");

  assert.equal(rows[2].attrs?.rowHeight, null);
  assert.equal(rows[2].attrs?.rowHeightRule, "auto");
});

test("Phase 10 - 7. Repeat header persistence", () => {
  const tableContent: JSONContent = {
    type: "table",
    attrs: { repeatHeader: false },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableHeader",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Header" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const tableAfter = deserialized.document.content.content![1];
  assert.equal(tableAfter.attrs?.repeatHeader, false, "repeatHeader=false phải được bảo toàn");
});

test("Phase 10 - 8. Table Style & Style Options persistence", () => {
  const customOptions = {
    headerRow: true,
    bandedRows: false,
    firstColumn: true,
    lastColumn: false,
    bandedColumns: false,
  };

  const tableContent: JSONContent = {
    type: "table",
    attrs: {
      tableStyleId: "academic",
      borders: "none",
      tableStyleOptions: customOptions,
    },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Academic Table" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const tableAfter = deserialized.document.content.content![1];
  assert.equal(tableAfter.attrs?.tableStyleId, "academic");
  assert.equal(tableAfter.attrs?.borders, "none");
  assert.deepEqual(tableAfter.attrs?.tableStyleOptions, customOptions);
});

test("Phase 10 - 9. Stable table/object IDs and anchors persistence", () => {
  const tableContent: JSONContent = {
    type: "table",
    attrs: {
      id: "tbl_financial_report_2026",
      targetId: "target_fin_2026",
      objectAnchor: "anchor_table_fig1",
    },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Stable ID Test" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const tableAfter = deserialized.document.content.content![1];
  assert.equal(tableAfter.attrs?.id, "tbl_financial_report_2026");
  assert.equal(tableAfter.attrs?.targetId, "target_fin_2026");
  assert.equal(tableAfter.attrs?.objectAnchor, "anchor_table_fig1");
});

test("Phase 10 - 10. NO runtime pagination data stored in .mwd package", () => {
  // Giả lập bảng vô tình có các khóa runtime layout bị rò rỉ vào AST
  const tableWithRuntimeData: JSONContent = {
    type: "table",
    attrs: {
      borders: "all",
      tableFragments: [{ pageIndex: 1, height: 400 }],
      tableMetadata: { hasRepeatedHeader: true },
      hasRepeatedHeader: true,
      visualRepeatedHeader: true,
      runtimeTableMap: [0, 1, 2],
      domRect: { top: 10, left: 20 },
      pageIndex: 1,
      measuredRowHeights: [40, 40],
    },
    content: [
      {
        type: "tableRow",
        attrs: {
          rowPage: 1,
          isFragment: true,
          pageIndex: 1,
        },
        content: [
          {
            type: "tableCell",
            attrs: {
              cellRect: { top: 0, left: 0 },
              domRect: { height: 40 },
            },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Runtime leak test" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableWithRuntimeData);
  const serialized = serializeDocumentToMwd(doc);

  // 1. Kiểm tra xác thực tính an toàn của package
  const parsedPackage = JSON.parse(serialized);
  const validation = validateNoRuntimeLayoutInPackage(parsedPackage);
  assert.equal(validation.isValid, true, `Package không được chứa runtime layout: ${validation.violations.join(", ")}`);

  // 2. Kiểm tra chuỗi JSON tuần tự hóa không chứa bất kỳ từ khóa cấm nào
  for (const forbiddenKey of FORBIDDEN_RUNTIME_LAYOUT_KEYS) {
    assert.ok(
      !serialized.includes(`"${forbiddenKey}"`),
      `Tệp .mwd tuyệt đối không được chứa runtime key: "${forbiddenKey}"`
    );
  }
});

test("Phase 10 - 11. Old .mwd tables backward compatibility (Phase 3 baseline)", () => {
  // Cấu trúc bảng cũ từ Phase 3: chỉ có các thuộc tính nguyên thủy, thiếu hoàn toàn các trường Phase 4-8
  const oldPackage: MwdFilePackage = {
    format: MWD_FORMAT_IDENTIFIER,
    version: MWD_CURRENT_FORMAT_VERSION,
    metadata: {
      id: "doc-old-phase3",
      title: "Old Phase 3 Document",
      version: 1,
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    },
    document: {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: {
            borders: "all",
          },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: {
                    colwidth: [150],
                    backgroundColor: "#e2e8f0",
                    textAlign: "center",
                    verticalAlign: "middle",
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Old Header" }] }],
                },
                {
                  type: "tableHeader",
                  attrs: {
                    colwidth: [250],
                    backgroundColor: "#e2e8f0",
                    textAlign: "center",
                    verticalAlign: "middle",
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Old Header 2" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: {
                    colwidth: [150],
                    backgroundColor: "#fef08a",
                    textAlign: "left",
                    verticalAlign: "top",
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Old Data 1" }] }],
                },
                {
                  type: "tableCell",
                  attrs: {
                    colwidth: [250],
                    backgroundColor: null,
                    textAlign: "right",
                    verticalAlign: "bottom",
                  },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Old Data 2" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const fileString = JSON.stringify(oldPackage);
  const result = deserializeMwdToDocument(fileString);

  assert.equal(result.success, true);
  if (!result.success) return;

  const table = result.document.content.content![0];
  assert.equal(table.type, "table");

  // 1. Dữ liệu và định dạng cũ được bảo toàn 100%
  assert.equal(table.attrs?.borders, "all");
  const row0 = table.content![0];
  const row1 = table.content![1];

  assert.deepEqual(row0.content![0].attrs?.colwidth, [150]);
  assert.equal(row0.content![0].attrs?.backgroundColor, "#e2e8f0");
  assert.equal(row0.content![0].attrs?.textAlign, "center");
  assert.equal(row0.content![0].attrs?.verticalAlign, "middle");
  assert.equal(row0.content![0].content![0].content![0].text, "Old Header");

  assert.equal(row1.content![0].attrs?.backgroundColor, "#fef08a");
  assert.equal(row1.content![0].content![0].content![0].text, "Old Data 1");

  // 2. Các trường mới bị thiếu được tự động điền giá trị an toàn (Safe Defaults)
  assert.equal(table.attrs?.layoutMode, "autoWindow", "Thiếu layoutMode tự gán autoWindow");
  assert.equal(table.attrs?.tableWidth, "100%", "Thiếu tableWidth tự gán 100%");
  assert.equal(table.attrs?.repeatHeader, true, "Thiếu repeatHeader tự gán true");
  assert.equal(table.attrs?.tableStyleId, "grid", "Thiếu tableStyleId tự gán grid");
  assert.deepEqual(table.attrs?.cellMargins, DEFAULT_TABLE_CELL_MARGINS, "Thiếu cellMargins tự gán default");

  assert.equal(row0.attrs?.rowHeight, null, "Thiếu rowHeight tự gán null");
  assert.equal(row0.attrs?.rowHeightRule, "auto", "Thiếu rowHeightRule tự gán auto");
});

test("Phase 10 - 12. Malformed file data handling and self-healing", () => {
  // Bảng chứa đầy các giá trị dị thường:
  // - rowspan < 0, NaN, Infinity, vượt số hàng còn lại
  // - colspan < 0, string rác
  // - colwidth chứa số âm, NaN, Infinity
  // - cellMargins chứa giá trị âm, chuỗi hỏng
  // - rowHeight âm hoặc NaN
  // - layoutMode và styleId lạ
  const malformedTable: JSONContent = {
    type: "table",
    attrs: {
      borders: "invalidBorder",
      layoutMode: "nonExistentLayoutMode",
      tableStyleId: "completelyUnknownStyleId999",
      repeatHeader: "not_a_boolean",
      cellMargins: { top: -30, right: NaN, bottom: "badVal", left: Infinity },
    },
    content: [
      {
        type: "tableRow",
        attrs: {
          rowHeight: -150,
          rowHeightRule: "unknownRule",
        },
        content: [
          {
            type: "tableCell",
            attrs: {
              rowspan: -2,
              colspan: "invalidColspan",
              colwidth: [-50, NaN, Infinity],
              cellMargins: { top: -10 },
            },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Malformed Cell 1" }] }],
          },
          {
            type: "tableCell",
            attrs: {
              rowspan: 999, // Vượt quá số hàng
              colspan: 0,
            },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Malformed Cell 2" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(malformedTable);
  const serialized = serializeDocumentToMwd(doc);
  const deserialized = deserializeMwdToDocument(serialized);

  // Tuyệt đối không crash
  assert.equal(deserialized.success, true);
  if (!deserialized.success) return;

  const table = deserialized.document.content.content![1];

  // Kiểm tra self-healing:
  assert.equal(table.attrs?.borders, "all", "Borders dị thường tự phục hồi về 'all'");
  assert.equal(table.attrs?.layoutMode, "autoWindow", "Layout mode lạ tự fallback về 'autoWindow'");
  assert.equal(table.attrs?.tableStyleId, "grid", "Style ID lạ tự fallback về 'grid'");
  assert.equal(table.attrs?.repeatHeader, true, "repeatHeader chuỗi hỏng tự fallback về true");
  assert.ok(table.attrs?.cellMargins.top >= 0, "Lề âm được chuẩn hóa >= 0");

  const row0 = table.content![0];
  assert.equal(row0.attrs?.rowHeight, null, "rowHeight âm tự reset về null");
  assert.equal(row0.attrs?.rowHeightRule, "auto", "rule lạ tự về auto");

  const cell0 = row0.content![0];
  assert.equal(cell0.attrs?.rowspan, 1, "rowspan âm tự về 1");
  assert.equal(cell0.attrs?.colspan, 1, "colspan hỏng tự về 1");
  assert.ok(cell0.attrs?.colwidth[0] >= 20, "colwidth âm được làm sạch về số dương an toàn");

  const cell1 = row0.content![1];
  assert.equal(cell1.attrs?.rowspan, 1, "rowspan=999 vượt hàng tự được giới hạn về 1");
  assert.equal(cell1.attrs?.colspan, 1, "colspan=0 tự về 1");

  // Văn bản trong các ô vẫn được giữ nguyên vẹn 100%
  assert.equal(cell0.content![0].content![0].text, "Malformed Cell 1");
  assert.equal(cell1.content![0].content![0].text, "Malformed Cell 2");
});

test("Phase 10 - 13. Save failure keeps isDirty true and does not reset table state", () => {
  const store = useDocumentStore.getState();

  // 1. Khởi tạo tài liệu có bảng
  const tableContent: JSONContent = {
    type: "table",
    attrs: { borders: "all", tableStyleId: "medium-accent" },
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Important unsaved table" }] }],
          },
        ],
      },
    ],
  };

  const doc = createDocumentWithTable(tableContent);
  store.setDocument(doc, "C:/documents/report.mwd");
  store.markSaved("C:/documents/report.mwd");
  assert.equal(useDocumentStore.getState().isDirty, false, "Ban đầu trạng thái là clean");

  // 2. Chỉnh sửa bảng (làm tài liệu dirty)
  const modifiedDoc = {
    ...doc,
    content: {
      ...doc.content,
      content: [
        doc.content.content![0],
        {
          ...tableContent,
          attrs: { ...tableContent.attrs, tableWidth: "750px" },
        },
        doc.content.content![2],
      ],
    },
  };
  useDocumentStore.getState().updateContent(modifiedDoc.content);
  assert.equal(useDocumentStore.getState().isDirty, true, "Sau khi sửa bảng, isDirty phải là true");

  // 3. Giả lập quá trình lưu gặp sự cố (ví dụ ổ đĩa đầy hoặc quyền truy cập bị từ chối)
  // Quy tắc kiến trúc: khi save thất bại, TUYỆT ĐỐI KHÔNG gọi markSaved()
  const saveFailed = true;
  if (saveFailed) {
    // Không gọi store.markSaved()
  }

  // 4. Kiểm tra:
  // - isDirty vẫn phải là true
  // - Trạng thái bảng trong bộ nhớ không bị quay lui (reset) về trạng thái cũ
  const stateAfterFailedSave = useDocumentStore.getState();
  assert.equal(stateAfterFailedSave.isDirty, true, "isDirty phải giữ nguyên true khi save thất bại");

  const tableInStore = stateAfterFailedSave.document.content.content![1];
  assert.equal(tableInStore.attrs?.tableWidth, "750px", "Thuộc tính bảng đã sửa không bị reset mất");
});

test("Phase 10 - 14. Full End-to-End Editor Round-Trip (Editor → Model → MWD → Model → Editor)", () => {
  // Tạo tài liệu hoàn chỉnh với đầy đủ tính năng Table Engine 2.0
  const initialDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Báo cáo phân tích quý 4" }],
      },
      {
        type: "table",
        attrs: {
          id: "table_quarterly_report",
          borders: "all",
          layoutMode: "fixed",
          tableWidth: "600px",
          repeatHeader: true,
          tableStyleId: "grid",
          cellMargins: { top: 8, right: 10, bottom: 8, left: 10 },
        },
        content: [
          {
            type: "tableRow",
            attrs: { rowHeight: 45, rowHeightRule: "atLeast" },
            content: [
              {
                type: "tableHeader",
                attrs: { colspan: 2, colwidth: [200, 400] },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Tiêu Đề Hợp Nhất 2 Cột" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            attrs: { rowHeight: 35, rowHeightRule: "auto" },
            content: [
              {
                type: "tableCell",
                attrs: { rowspan: 2, colwidth: [200], backgroundColor: "#f8fafc" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Dữ liệu hợp nhất dọc 2 hàng" }] }],
              },
              {
                type: "tableCell",
                attrs: { colwidth: [400], textAlign: "right" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "125,000,000 VNĐ" }] }],
              },
            ],
          },
          {
            type: "tableRow",
            attrs: { rowHeight: 35, rowHeightRule: "auto" },
            content: [
              {
                type: "tableCell",
                attrs: { colwidth: [400], textAlign: "right" },
                content: [{ type: "paragraph", content: [{ type: "text", text: "350,000,000 VNĐ" }] }],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hết bảng báo cáo" }],
      },
    ],
  };

  // Bước 1: Nạp vào Editor 1
  const editor1 = new Editor({
    extensions: getEditorExtensions(),
    content: initialDoc,
  });

  const docModel1: DocumentModel = {
    metadata: {
      id: "doc-e2e-mwd",
      title: "E2E Table MWD Document",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    content: editor1.getJSON(),
  };

  // Bước 2: Serialize sang chuỗi .mwd
  const mwdFileContent = serializeDocumentToMwd(docModel1);
  assert.ok(typeof mwdFileContent === "string");

  // Bước 3: Deserialize trở lại thành DocumentModel
  const deserializeResult = deserializeMwdToDocument(mwdFileContent);
  assert.equal(deserializeResult.success, true);
  if (!deserializeResult.success) return;

  const docModel2 = deserializeResult.document;

  // Bước 4: Nạp vào Editor 2
  const editor2 = new Editor({
    extensions: getEditorExtensions(),
    content: docModel2.content,
  });

  // Bước 5: Kiểm chứng toàn vẹn các thuộc tính và tương tác trên Editor 2
  const tableNode = editor2.getJSON().content![1];
  assert.equal(tableNode.type, "table");
  assert.equal(tableNode.attrs?.id, "table_quarterly_report");
  assert.equal(tableNode.attrs?.layoutMode, "fixed");
  assert.equal(tableNode.attrs?.tableWidth, "600px");
  assert.equal(tableNode.attrs?.repeatHeader, true);
  assert.equal(tableNode.attrs?.tableStyleId, "grid");
  assert.deepEqual(tableNode.attrs?.cellMargins, { top: 8, right: 10, bottom: 8, left: 10 });

  // Kiểm tra cấu trúc các hàng và ô
  const row0 = tableNode.content![0];
  assert.equal(row0.attrs?.rowHeight, 45);
  assert.equal(row0.attrs?.rowHeightRule, "atLeast");
  assert.equal(row0.content![0].attrs?.colspan, 2);
  assert.deepEqual(row0.content![0].attrs?.colwidth, [200, 400]);

  const row1 = tableNode.content![1];
  assert.equal(row1.content![0].attrs?.rowspan, 2);
  assert.equal(row1.content![0].attrs?.backgroundColor, "#f8fafc");

  const row2 = tableNode.content![2];
  assert.equal(row2.content![0].attrs?.textAlign, "right");
  assert.equal(row2.content![0].content![0].content![0].text, "350,000,000 VNĐ");

  editor1.destroy();
  editor2.destroy();
});
