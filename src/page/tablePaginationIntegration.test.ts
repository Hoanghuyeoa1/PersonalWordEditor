import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import {
  buildPageLayoutMap,
  getNodeSize,
  estimateTableRowHeight,
  computeTableRowspanGroups,
} from "./services/pageLayoutMap.ts";
import { extractDocumentStats } from "../document/documentModel.ts";

/**
 * Helper tạo AST Table JSON với các cấu hình linh hoạt phục vụ kiểm thử phân trang
 */
function createIntegrationTable(options: {
  rowCount: number;
  colCount?: number;
  hasHeader?: boolean;
  repeatHeader?: boolean;
  repeatHeaderRow?: boolean;
  objectAnchor?: string;
  targetId?: string;
  rowspans?: Record<number, Record<number, number>>; // { [rowIndex]: { [colIndex]: rowspan } }
  rowHeights?: number[];
}): JSONContent {
  const {
    rowCount,
    colCount = 3,
    hasHeader = true,
    repeatHeader,
    repeatHeaderRow,
    objectAnchor,
    targetId,
    rowspans = {},
  } = options;

  const rows: JSONContent[] = [];

  // Theo dõi các ô bị phủ bởi rowspan ở các hàng trước đó
  const coveredCells = new Set<string>(); // "r,c"

  for (let r = 0; r < rowCount; r++) {
    const isHeaderRow = r === 0 && hasHeader;
    const cellType = isHeaderRow ? "tableHeader" : "tableCell";
    const cells: JSONContent[] = [];

    for (let c = 0; c < colCount; c++) {
      if (coveredCells.has(`${r},${c}`)) {
        // Ô bị phủ bởi rowspan từ hàng trên -> không tạo cell node trong AST ProseMirror
        continue;
      }

      const cellRowspan = rowspans[r]?.[c] ?? 1;
      if (cellRowspan > 1) {
        // Đánh dấu các ô ở các hàng tiếp theo bị phủ
        for (let spanRow = 1; spanRow < cellRowspan; spanRow++) {
          coveredCells.add(`${r + spanRow},${c}`);
        }
      }

      cells.push({
        type: cellType,
        attrs: {
          colspan: 1,
          rowspan: cellRowspan,
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `R${r}C${c}` }],
          },
        ],
      });
    }

    rows.push({
      type: "tableRow",
      attrs: {
        rowHeight: options.rowHeights?.[r] ?? null,
        rowHeightRule: options.rowHeights?.[r] ? "exact" : "auto",
      },
      content: cells,
    });
  }

  const tableAttrs: Record<string, any> = {
    borders: "all",
  };
  if (repeatHeader !== undefined) tableAttrs.repeatHeader = repeatHeader;
  if (repeatHeaderRow !== undefined) tableAttrs.repeatHeaderRow = repeatHeaderRow;
  if (objectAnchor) tableAttrs.objectAnchor = objectAnchor;
  if (targetId) tableAttrs.id = targetId;

  return {
    type: "table",
    attrs: tableAttrs,
    content: rows,
  };
}

// ============================================================================
// 1. TABLE 2 PAGES
// ============================================================================
test("Phase 8 - 1. Table 2 pages: Table flows across 2 pages with continuous positions and fragments", () => {
  // Bảng 16 hàng (mỗi hàng 40px = 640px)
  // Paragraph đầu trang chiếm 600px -> Trang 1 còn lại 360px -> chứa được 9 hàng
  // 7 hàng còn lại chuyển sang Trang 2!
  const table = createIntegrationTable({ rowCount: 16, colCount: 2 });
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Opening introduction paragraph" }],
      },
      table,
    ],
  };

  const pPos = 0;
  const tblPos = getNodeSize(doc.content![0]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 600);

  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (const row of table.content!) {
    measuredRowHeights.set(rPos, 40);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Bảng phải phân thành đúng 2 trang");

  const frags = layoutMap.getTableFragments(tblPos);
  assert.equal(frags.length, 2, "Phải có đúng 2 LayoutFragment cho table");

  assert.equal(frags[0].pageIndex, 0);
  assert.equal(frags[0].continuedFromPreviousPage, false);
  assert.equal(frags[0].continuesToNextPage, true);

  assert.equal(frags[1].pageIndex, 1);
  assert.equal(frags[1].continuedFromPreviousPage, true);
  assert.equal(frags[1].continuesToNextPage, false);

  assert.equal(frags[0].to, frags[1].from, "Vị trí document position phải liên tục tuyệt đối");
  assert.equal(
    frags[0].tableMetadata!.rowCount + frags[1].tableMetadata!.rowCount,
    16,
    "Tổng số hàng phải bảo toàn đủ 16 hàng"
  );
});

// ============================================================================
// 2. 40 ROWS TABLE
// ============================================================================
test("Phase 8 - 2. 40 rows table: Clean pagination across sheets with complete row preservation", () => {
  // 40 hàng x 35px = 1400px. Usable height ~960px -> 2 trang
  const rowCount = 40;
  const table = createIntegrationTable({ rowCount, colCount: 3 });
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const tblPos = 0;
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (const row of table.content!) {
    measuredRowHeights.set(rPos, 35);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "40 hàng phải phân bố đều trên 2 trang");

  let totalRows = 0;
  for (let p = 0; p < layoutMap.getPageCount(); p++) {
    const rows = layoutMap.getTableRowsForPage(p);
    assert.ok(rows.length > 0, `Trang ${p + 1} phải có hàng`);
    totalRows += rows.length;
  }
  assert.equal(totalRows, rowCount, "Tất cả 40 hàng phải được bảo toàn đầy đủ");
});

// ============================================================================
// 3. 100 ROWS TABLE
// ============================================================================
test("Phase 8 - 3. 100 rows table: High-density pagination with stable sequential row indices", () => {
  const rowCount = 100;
  const table = createIntegrationTable({ rowCount, colCount: 3 });
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const tblPos = 0;
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (const row of table.content!) {
    measuredRowHeights.set(rPos, 30);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.ok(layoutMap.getPageCount() >= 4, "100 hàng (3000px) phải trải dài trên ít nhất 4 trang");

  // Kiểm tra tính tuần tự liên tục của rowIndex từ 0 đến 99
  let expectedIndex = 0;
  for (let p = 0; p < layoutMap.getPageCount(); p++) {
    const rows = layoutMap.getTableRowsForPage(p);
    for (const r of rows) {
      assert.equal(r.rowIndex, expectedIndex, `Hàng thứ ${expectedIndex} phải có rowIndex chính xác`);
      expectedIndex++;
    }
  }
  assert.equal(expectedIndex, 100, "Đã duyệt đủ 100 hàng không bị nhảy cóc hay trùng lặp");
});

// ============================================================================
// 4. ROW MOVE-NEXT
// ============================================================================
test("Phase 8 - 4. Row move-next: Atomic row pagination moves entire row when remaining space is insufficient", () => {
  // Trang 1 có 960px. Đoạn văn chiếm 900px -> còn lại 60px.
  // Row 0 chiếm 40px -> vừa (còn 20px).
  // Row 1 chiếm 35px -> 35px > 20px -> Row 1 di chuyển trọn vẹn sang Trang 2!
  const table = createIntegrationTable({ rowCount: 3, colCount: 2 });
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Large preceding paragraph" }],
      },
      table,
    ],
  };

  const pPos = 0;
  const tblPos = getNodeSize(doc.content![0]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 880);

  const measuredRowHeights = new Map<number, number>();
  const row0Pos = tblPos + 1;
  const row1Pos = row0Pos + getNodeSize(table.content![0]);
  const row2Pos = row1Pos + getNodeSize(table.content![1]);

  measuredRowHeights.set(row0Pos, 40);
  measuredRowHeights.set(row1Pos, 35);
  measuredRowHeights.set(row2Pos, 35);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageForTableRow(row0Pos), 0, "Row 0 (vừa 60px) phải ở Trang 1");
  assert.equal(layoutMap.getPageForTableRow(row1Pos), 1, "Row 1 (không vừa 20px) phải chuyển trọn vẹn sang Trang 2");
  assert.equal(layoutMap.getPageForTableRow(row2Pos), 1, "Row 2 phải tiếp tục ở Trang 2");
});

// ============================================================================
// 5. OVERSIZED ROW
// ============================================================================
test("Phase 8 - 5. Oversized row: Row height > usablePageHeight is handled with controlled overflow without endless loop", () => {
  // Trang A4 usable height = 960px. Row 1 cao 1400px (oversized row).
  const table = createIntegrationTable({ rowCount: 3, colCount: 2 });
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const tblPos = 0;
  const row0Pos = tblPos + 1;
  const row1Pos = row0Pos + getNodeSize(table.content![0]);
  const row2Pos = row1Pos + getNodeSize(table.content![1]);

  const measuredRowHeights = new Map<number, number>();
  measuredRowHeights.set(row0Pos, 40);
  measuredRowHeights.set(row1Pos, 1400); // Oversized!
  measuredRowHeights.set(row2Pos, 40);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.ok(layoutMap.getPageCount() >= 2, "Phân trang an toàn hoàn tất không bị treo");
  const row1Info = layoutMap.getTableRowForPosition(row1Pos);
  assert.ok(row1Info);
  assert.equal(row1Info.isOversized, true, "Row 1 phải được đánh dấu isOversized = true");

  const row2Info = layoutMap.getTableRowForPosition(row2Pos);
  assert.ok(row2Info, "Row 2 tiếp theo vẫn được bố trí hợp lệ");
});

// ============================================================================
// 6. ROWSPAN BOUNDARY
// ============================================================================
test("Phase 8 - 6. Rowspan boundary: Rowspan group is kept together across page boundaries when fitting on next page", () => {
  // Trang 1 có 960px. Đoạn văn chiếm 860px -> còn lại 100px.
  // Row 0 chiếm 40px -> còn lại 60px.
  // Row 1 & Row 2 tạo thành nhóm Rowspan: Row 1 có cell rowspan=2 (cao 45px), Row 2 cao 45px.
  // Tổng chiều cao nhóm = 45 + 45 = 90px.
  // 90px > 60px còn lại -> KHÔNG cắt đôi ô merge!
  // Toàn bộ nhóm Row 1 + Row 2 di chuyển sang Trang 2!
  const table = createIntegrationTable({
    rowCount: 4,
    colCount: 3,
    rowspans: {
      1: { 0: 2 }, // Ô tại Row 1 Col 0 có rowspan=2 (kết nối Row 1 và Row 2)
    },
  });

  // Kiểm tra helper computeTableRowspanGroups
  const groups = computeTableRowspanGroups(table.content!);
  assert.equal(groups.get(1)?.startRow, 1);
  assert.equal(groups.get(1)?.endRow, 2);
  assert.equal(groups.get(2)?.startRow, 1);
  assert.equal(groups.get(2)?.endRow, 2);

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Top paragraph" }],
      },
      table,
    ],
  };

  const pPos = 0;
  const tblPos = getNodeSize(doc.content![0]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 860);

  const measuredRowHeights = new Map<number, number>();
  const row0Pos = tblPos + 1;
  const row1Pos = row0Pos + getNodeSize(table.content![0]);
  const row2Pos = row1Pos + getNodeSize(table.content![1]);
  const row3Pos = row2Pos + getNodeSize(table.content![2]);

  measuredRowHeights.set(row0Pos, 40);
  measuredRowHeights.set(row1Pos, 45);
  measuredRowHeights.set(row2Pos, 45);
  measuredRowHeights.set(row3Pos, 40);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  // Row 0 nằm ở Trang 1
  assert.equal(layoutMap.getPageForTableRow(row0Pos), 0, "Row 0 nằm ở Trang 1");

  // Toàn bộ nhóm rowspan (Row 1 và Row 2) PHẢI cùng nằm ở Trang 2, KHÔNG bị tách rời!
  assert.equal(layoutMap.getPageForTableRow(row1Pos), 1, "Row 1 chuyển sang Trang 2");
  assert.equal(layoutMap.getPageForTableRow(row2Pos), 1, "Row 2 đi cùng Row 1 sang Trang 2");
  assert.equal(
    layoutMap.getPageForTableRow(row1Pos),
    layoutMap.getPageForTableRow(row2Pos),
    "Nhóm rowspan phải nằm trên cùng một trang!"
  );
});

test("Phase 8 - 6. Rowspan boundary: Oversized rowspan group larger than a full page falls back safely without loop", () => {
  // Nhóm rowspan quá lớn (> 960px): Row 0 có cell rowspan=3, tổng chiều cao 1200px.
  const table = createIntegrationTable({
    rowCount: 3,
    colCount: 2,
    rowspans: { 0: { 0: 3 } },
  });

  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const tblPos = 0;
  const row0Pos = tblPos + 1;
  const row1Pos = row0Pos + getNodeSize(table.content![0]);
  const row2Pos = row1Pos + getNodeSize(table.content![1]);

  const measuredRowHeights = new Map<number, number>();
  measuredRowHeights.set(row0Pos, 400);
  measuredRowHeights.set(row1Pos, 400);
  measuredRowHeights.set(row2Pos, 400);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.ok(layoutMap.getPageCount() >= 2, "Phân trang an toàn hoàn tất không bị infinite loop");
  assert.ok(layoutMap.getTableRowForPosition(row0Pos));
  assert.ok(layoutMap.getTableRowForPosition(row1Pos));
});

// ============================================================================
// 7. REPEAT HEADER
// ============================================================================
test("Phase 8 - 7. Repeat header: Visual repeated header metadata present on Page 2+ and absent when disabled", () => {
  // Case A: repeatHeader: true
  const tableEnabled = createIntegrationTable({
    rowCount: 25,
    colCount: 2,
    hasHeader: true,
    repeatHeader: true,
  });
  const docEnabled: JSONContent = { type: "doc", content: [tableEnabled] };

  const tblPos = 0;
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (let i = 0; i < tableEnabled.content!.length; i++) {
    measuredRowHeights.set(rPos, i === 0 ? 50 : 40);
    rPos += getNodeSize(tableEnabled.content![i]);
  }

  const layoutMapEnabled = buildPageLayoutMap(docEnabled, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.ok(layoutMapEnabled.getPageCount() >= 2);
  const repHeader = layoutMapEnabled.getRepeatedHeaderForPage(1);
  assert.ok(repHeader, "Trang 2 phải có repeated header");
  assert.equal(repHeader.height, 50, "Chiều cao lặp lại phải là 50px");
  assert.equal(repHeader.rowIndex, 0, "Trỏ về row 0");

  // Case B: repeatHeader: false
  const tableDisabled = createIntegrationTable({
    rowCount: 25,
    colCount: 2,
    hasHeader: true,
    repeatHeader: false,
  });
  const docDisabled: JSONContent = { type: "doc", content: [tableDisabled] };
  const layoutMapDisabled = buildPageLayoutMap(docDisabled, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(
    layoutMapDisabled.getRepeatedHeaderForPage(1),
    null,
    "Khi repeatHeader = false, Trang 2 không được có repeated header"
  );
});

// ============================================================================
// 8. ONE SEMANTIC HEADER ROW
// ============================================================================
test("Phase 8 - 8. One semantic header row: AST strictly contains only 1 header row, no duplicate positions", () => {
  const table = createIntegrationTable({
    rowCount: 35,
    colCount: 2,
    hasHeader: true,
    repeatHeader: true,
  });
  const doc: JSONContent = { type: "doc", content: [table] };

  const originalJSON = JSON.stringify(doc);
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  // Khẳng định AST không bị biến đổi
  assert.equal(JSON.stringify(doc), originalJSON);

  // Đếm số hàng header trong AST
  const headerRows = table.content!.filter((row) =>
    row.content?.some((cell) => cell.type === "tableHeader")
  );
  assert.equal(headerRows.length, 1, "AST chỉ được chứa đúng 1 hàng semantic header duy nhất");
  assert.equal(layoutMap.getPageCount() >= 2, true, "Bảng trải dài trên nhiều trang");
});

// ============================================================================
// 9. CAPTION + TABLE
// ============================================================================
test("Phase 8 - 9. Caption + table: keepWithNext keeps caption together with table start on next page", () => {
  // Trang 1 có 960px. Nội dung trước chiếm 910px -> còn lại 50px.
  // Caption paragraph (cao 25px) có keepWithNext: true.
  // Table row 0 cao 40px -> 25 + 40 = 65px > 50px còn lại!
  // KẾT QUẢ MONG MUỐN: Caption KHÔNG bị bỏ rơi ở cuối Trang 1, mà đi cùng bảng sang Trang 2!
  const captionNode: JSONContent = {
    type: "paragraph",
    attrs: {
      keepWithNext: true,
    },
    content: [{ type: "text", text: "Bảng 1.1: Bảng thống kê số liệu" }],
  };

  const table = createIntegrationTable({ rowCount: 10, colCount: 2 });
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Preceding large text" }],
      },
      captionNode,
      table,
    ],
  };

  const p0Pos = 0;
  const p0Size = getNodeSize(doc.content![0]);
  const capPos = p0Pos + p0Size;
  const capSize = getNodeSize(captionNode);
  const tblPos = capPos + capSize;

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(p0Pos, 910);
  measuredHeights.set(capPos, 25);

  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (const row of table.content!) {
    measuredRowHeights.set(rPos, 40);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2);

  // Caption phải nằm ở Trang 2 (pageIndex = 1)
  const capFrag = layoutMap.getAllFragments().find((f) => f.from === capPos);
  assert.ok(capFrag, "Phải tìm thấy fragment của caption");
  assert.equal(capFrag.pageIndex, 1, "Caption có keepWithNext phải chuyển sang Trang 2 cùng Table");

  // Hàng đầu của Table cũng phải nằm ở Trang 2
  const tableRow0Page = layoutMap.getPageForTableRow(tblPos + 1);
  assert.equal(tableRow0Page, 1, "Row 0 của table phải bắt đầu ở Trang 2 cùng Caption");
});

// ============================================================================
// 10. CROSS-REFERENCE / OBJECT ID STABILITY
// ============================================================================
test("Phase 8 - 10. Cross-reference / object ID: objectAnchor and targetId remain strictly stable across pagination", () => {
  const table = createIntegrationTable({
    rowCount: 40,
    colCount: 2,
    objectAnchor: "tbl-anchor-system-arch",
    targetId: "tbl_target_001",
  });

  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.ok(layoutMap.getPageCount() >= 2);

  // Kiểm tra thuộc tính trên AST node
  assert.equal(table.attrs?.objectAnchor, "tbl-anchor-system-arch");
  assert.equal(table.attrs?.id, "tbl_target_001");

  // Kiểm tra các LayoutFragment trỏ về đúng table
  const frags = layoutMap.getTableFragments(0);
  for (const frag of frags) {
    assert.equal(frag.nodeType, "table");
    assert.ok(frag.from >= 0);
  }
});

// ============================================================================
// 11. STATISTICS ONE TABLE
// ============================================================================
test("Phase 8 - 11. Statistics one table: Multi-page table spanning multiple sheets counts as ONE semantic table", () => {
  const table = createIntegrationTable({ rowCount: 50, colCount: 3 });
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Introduction" }],
      },
      table,
    ],
  };

  // Phân trang chứng minh bảng dàn trên 2+ trang
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.ok(layoutMap.getPageCount() >= 2);

  // Trích xuất thống kê từ AST
  const stats = extractDocumentStats(doc);
  assert.equal(stats.tables, 1, "Bảng đa trang vẫn phải được tính là đúng 1 bảng semantic");
});

// ============================================================================
// 12. NO INFINITE PAGINATION
// ============================================================================
test("Phase 8 - 12. No infinite pagination: Stress layout completes rapidly with deterministic page count", () => {
  const startTime = Date.now();

  // Bảng kết hợp: 60 hàng, có oversized row, có rowspan group, có repeatHeader
  const table = createIntegrationTable({
    rowCount: 60,
    colCount: 3,
    repeatHeader: true,
    rowspans: {
      5: { 0: 3 },
      15: { 1: 2 },
    },
  });

  const doc: JSONContent = { type: "doc", content: [table] };

  const measuredRowHeights = new Map<number, number>();
  let rPos = 1;
  for (let i = 0; i < table.content!.length; i++) {
    // Cho row 25 là oversized
    const h = i === 25 ? 1500 : 35;
    measuredRowHeights.set(rPos, h);
    rPos += getNodeSize(table.content![i]);
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  const duration = Date.now() - startTime;
  assert.ok(duration < 200, `Quá trình phân trang phải hoàn tất cực nhanh, thực tế: ${duration}ms`);
  assert.ok(layoutMap.getPageCount() >= 3, "Phải sinh ra số trang xác định");
  assert.ok(layoutMap.getAllFragments().length > 0);
});
