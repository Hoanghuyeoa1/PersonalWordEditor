import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import {
  buildPageLayoutMap,
  getNodeSize,
  estimateTableRowHeight,
} from "./services/pageLayoutMap.ts";

// Helper: Tạo bảng JSON AST với số hàng và cột tùy chọn
function createTestTable(
  rowCount: number,
  colCount: number = 2,
  options: {
    hasHeader?: boolean;
    repeatHeader?: boolean;
    rowHeight?: number;
    customRowTexts?: Record<number, string[]>;
  } = {}
): JSONContent {
  const { hasHeader = true, repeatHeader, customRowTexts = {} } = options;
  const rows: JSONContent[] = [];

  for (let r = 0; r < rowCount; r++) {
    const isHeaderRow = r === 0 && hasHeader;
    const cellType = isHeaderRow ? "tableHeader" : "tableCell";
    const cells: JSONContent[] = [];

    for (let c = 0; c < colCount; c++) {
      const text =
        customRowTexts[r]?.[c] ??
        (isHeaderRow ? `Header ${c + 1}` : `Row ${r + 1} Col ${c + 1}`);

      cells.push({
        type: cellType,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      });
    }

    rows.push({
      type: "tableRow",
      content: cells,
    });
  }

  const attrs: Record<string, any> = {
    borders: "all",
  };
  if (repeatHeader !== undefined) {
    attrs.repeatHeader = repeatHeader;
  }

  return {
    type: "table",
    attrs,
    content: rows,
  };
}

// ============================================================================
// PHASE 8: MULTI-PAGE TABLE FLOW CORE TEST SUITE
// ============================================================================

test("Phase 8 - 1. Short table: Table fits on one page and produces exactly one fragment", () => {
  // Bảng 3 hàng ngắn gọn (1 header, 2 data rows)
  // Ước tính chiều cao ~100-120px < usableBodyBounds ~960px trên A4 portrait
  const table = createTestTable(3, 2);
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Introduction paragraph" }],
      },
      table,
    ],
  };

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  assert.equal(layoutMap.getPageCount(), 1, "Short table phải nằm gọn trên 1 trang");

  const tableFrags = layoutMap.getTableFragments();
  assert.equal(tableFrags.length, 1, "Chỉ tạo đúng 1 LayoutFragment cho table");

  const frag = tableFrags[0];
  assert.equal(frag.nodeType, "table");
  assert.equal(frag.pageIndex, 0);
  assert.equal(frag.continuedFromPreviousPage, false);
  assert.equal(frag.continuesToNextPage, false);
  assert.ok(frag.tableMetadata, "Phải có tableMetadata");
  assert.equal(frag.tableMetadata.rowCount, 3);
  assert.equal(frag.tableMetadata.startRowIndex, 0);
  assert.equal(frag.tableMetadata.endRowIndex, 2);
  assert.equal(frag.tableMetadata.hasRepeatedHeader, undefined);
});

test("Phase 8 - 2. Table 2 pages: Long table flows cleanly across 2 pages at row boundaries", () => {
  // Giả lập trang A4 có usable height = 960px.
  // Paragraph đầu trang chiếm 600px -> còn lại 360px.
  // Bảng 15 hàng, mỗi hàng đo được 40px -> tổng 600px.
  // 360px chứa được tối đa Math.floor(360 / 40) = 9 hàng.
  // Hàng thứ 10 không vừa -> di chuyển sang Trang 2!
  const table = createTestTable(15, 2);
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Intro text occupying space" }],
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

  assert.equal(layoutMap.getPageCount(), 2, "Tài liệu phải có đúng 2 trang");

  const tableFrags = layoutMap.getTableFragments(tblPos);
  assert.equal(tableFrags.length, 2, "Table phải tạo 2 phân mảnh layout");

  const frag1 = tableFrags[0];
  const frag2 = tableFrags[1];

  assert.equal(frag1.pageIndex, 0, "Phân mảnh 1 nằm ở Trang 1");
  assert.equal(frag1.continuedFromPreviousPage, false);
  assert.equal(frag1.continuesToNextPage, true);

  assert.equal(frag2.pageIndex, 1, "Phân mảnh 2 nằm ở Trang 2");
  assert.equal(frag2.continuedFromPreviousPage, true);
  assert.equal(frag2.continuesToNextPage, false);

  // Ranh giới vị trí liên tục: frag1.to === frag2.from
  assert.equal(frag1.to, frag2.from, "Ranh giới ProseMirror position giữa các phân mảnh phải liên tục tuyệt đối");

  // Tổng số hàng trên 2 phân mảnh phải bằng 15
  const totalRows = frag1.tableMetadata!.rowCount + frag2.tableMetadata!.rowCount;
  assert.equal(totalRows, 15, "Tổng số hàng qua các phân mảnh phải bảo toàn đầy đủ 15 hàng");
});

test("Phase 8 - 3. Table 3+ pages: Very long table flows across 3 or more physical sheets", () => {
  // Bảng 70 hàng. Mỗi hàng 40px -> tổng 2800px.
  // Usable height ~960px -> 2800 / 960 ~ 3 trang.
  const table = createTestTable(70, 2);
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const tblPos = 0;
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (const row of table.content!) {
    measuredRowHeights.set(rPos, 40);
    rPos += getNodeSize(row);
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.ok(layoutMap.getPageCount() >= 3, `Phải có ít nhất 3 trang, thực tế: ${layoutMap.getPageCount()}`);

  const tableFrags = layoutMap.getTableFragments(tblPos);
  assert.equal(tableFrags.length, layoutMap.getPageCount(), "Số phân mảnh table phải khớp với số trang chứa bảng");

  // Kiểm tra tính liên tục của tất cả các phân mảnh
  for (let i = 0; i < tableFrags.length; i++) {
    const frag = tableFrags[i];
    assert.equal(frag.pageIndex, i, `Phân mảnh ${i} phải nằm ở pageIndex ${i}`);
    if (i > 0) {
      assert.equal(frag.continuedFromPreviousPage, true);
      assert.equal(frag.from, tableFrags[i - 1].to, `Vị trí from của frag ${i} phải nối tiếp to của frag ${i - 1}`);
    } else {
      assert.equal(frag.continuedFromPreviousPage, false);
    }

    if (i < tableFrags.length - 1) {
      assert.equal(frag.continuesToNextPage, true);
    } else {
      assert.equal(frag.continuesToNextPage, false);
    }
  }
});

test("Phase 8 - 4. 50–100 rows table: High-density long table flow with stable row indexing", () => {
  const rowCount = 85;
  const table = createTestTable(rowCount, 3);
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

  // Kiểm tra ánh xạ từng hàng về đúng trang qua API tập trung
  let verifiedRowsCount = 0;
  for (let p = 0; p < layoutMap.getPageCount(); p++) {
    const rowsOnPage = layoutMap.getTableRowsForPage(p);
    assert.ok(rowsOnPage.length > 0, `Trang ${p + 1} phải chứa ít nhất 1 hàng`);
    for (const rInfo of rowsOnPage) {
      assert.equal(rInfo.pageIndex, p);
      const pageFound = layoutMap.getPageForTableRow(rInfo.from);
      assert.equal(pageFound, p, `Hàng ${rInfo.rowIndex} tại pos ${rInfo.from} phải ánh xạ về đúng trang ${p}`);
      verifiedRowsCount++;
    }
  }

  assert.equal(verifiedRowsCount, rowCount, `Phải kiểm chứng đủ ${rowCount} hàng qua tất cả các trang`);
});

test("Phase 8 - 5. Row moved next page: Row is atomic pagination unit and never gets cut halfway", () => {
  // Trang 1 có usable height = 960px.
  // Paragraph đầu trang chiếm 880px -> còn lại 80px.
  // Row 0 chiếm 50px -> vừa (80 - 50 = 30px còn lại).
  // Row 1 chiếm 45px -> 45px > 30px -> Row 1 di chuyển trọn vẹn sang Trang 2!
  const table = createTestTable(3, 2);
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
  measuredHeights.set(pPos, 880);

  const measuredRowHeights = new Map<number, number>();
  const row0Pos = tblPos + 1;
  const row0Size = getNodeSize(table.content![0]);
  const row1Pos = row0Pos + row0Size;
  const row1Size = getNodeSize(table.content![1]);
  const row2Pos = row1Pos + row1Size;

  measuredRowHeights.set(row0Pos, 50);
  measuredRowHeights.set(row1Pos, 45);
  measuredRowHeights.set(row2Pos, 40);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Bảng phải ngắt sang 2 trang");

  // Row 0 phải nằm ở Trang 1 (pageIndex = 0)
  const row0Page = layoutMap.getPageForTableRow(row0Pos);
  assert.equal(row0Page, 0, "Row 0 (vừa 80px còn lại) phải nằm ở Trang 1");

  // Row 1 phải nằm ở Trang 2 (pageIndex = 1)
  const row1Page = layoutMap.getPageForTableRow(row1Pos);
  assert.equal(row1Page, 1, "Row 1 (không vừa 30px) phải chuyển trọn vẹn sang Trang 2");

  // Row 2 phải nằm ở Trang 2 (pageIndex = 1)
  const row2Page = layoutMap.getPageForTableRow(row2Pos);
  assert.equal(row2Page, 1, "Row 2 phải tiếp tục ở Trang 2");
});

test("Phase 8 - 6. Oversized row: Row taller than usablePageHeight is safely placed without infinite loop", () => {
  // Trang A4 usable height = 960px.
  // Row 0: 40px (header)
  // Row 1: 1300px (oversized row > 960px)
  // Row 2: 50px
  // KẾT QUẢ MONG MUỐN:
  // - Row 0 nằm ở Trang 1
  // - Row 1 không loop, được chuyển sang Trang 2 với controlled overflow (isOversized = true)
  // - Row 2 chuyển tiếp sang Trang 3
  const table = createTestTable(3, 2);
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const tblPos = 0;
  const row0Pos = tblPos + 1;
  const row0Size = getNodeSize(table.content![0]);
  const row1Pos = row0Pos + row0Size;
  const row1Size = getNodeSize(table.content![1]);
  const row2Pos = row1Pos + row1Size;

  const measuredRowHeights = new Map<number, number>();
  measuredRowHeights.set(row0Pos, 40);
  measuredRowHeights.set(row1Pos, 1300); // Oversized!
  measuredRowHeights.set(row2Pos, 50);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  // Không được loop và phải chia trang có kiểm soát
  assert.ok(layoutMap.getPageCount() >= 2, "Tài liệu phải phân trang an toàn");

  const row1Info = layoutMap.getTableRowForPosition(row1Pos);
  assert.ok(row1Info, "Phải tìm thấy TableRowLayoutInfo cho hàng oversized");
  assert.equal(row1Info.isOversized, true, "Hàng 1300px phải được đánh dấu isOversized = true");

  // Toàn bộ các hàng vẫn có vị trí hợp lệ
  const row2Info = layoutMap.getTableRowForPosition(row2Pos);
  assert.ok(row2Info, "Hàng tiếp theo phải tồn tại và được bố trí bình thường");
});

test("Phase 8 - 7. Semantic AST immutability: Table AST is strictly untouched across pagination cycles", () => {
  const table = createTestTable(25, 2);
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Preamble paragraph" }],
      },
      table,
    ],
  };

  const originalDocSnapshot = JSON.stringify(doc);

  // Chạy layout calculation
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  const afterDocSnapshot = JSON.stringify(doc);
  assert.equal(afterDocSnapshot, originalDocSnapshot, "AST ProseMirror không được bị biến đổi dưới bất kỳ hình thức nào");

  // Kiểm tra cấu trúc AST
  assert.equal(doc.content!.length, 2, "Doc vẫn chỉ chứa đúng 2 block (paragraph + table)");
  assert.equal(doc.content![1].type, "table", "Block thứ 2 vẫn là một table duy nhất");
  assert.equal(doc.content![1].content!.length, 25, "Bảng vẫn chứa đúng 25 tableRow nodes, không chèn fake rows");
});

test("Phase 8 - 8. Page count stability: Multiple layout runs produce deterministic and stable page count", () => {
  const table = createTestTable(45, 3);
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const layoutMap1 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const layoutMap2 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const layoutMap3 = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  assert.equal(layoutMap1.getPageCount(), layoutMap2.getPageCount(), "Page count phải ổn định giữa lần 1 và lần 2");
  assert.equal(layoutMap2.getPageCount(), layoutMap3.getPageCount(), "Page count phải ổn định giữa lần 2 và lần 3");
  assert.equal(layoutMap1.getAllFragments().length, layoutMap2.getAllFragments().length, "Fragment count phải nhất quán");
});

test("Phase 8 - 9. Repeated table header representation: Visual repeated header metadata on Page 2+ without AST duplication", () => {
  // Bảng 30 hàng với row 0 là tableHeader (repeatHeader: true mặc định)
  // Trải dài trên 2+ trang
  const table = createTestTable(30, 2, { hasHeader: true, repeatHeader: true });
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const tblPos = 0;
  const row0Pos = tblPos + 1;
  const measuredRowHeights = new Map<number, number>();
  let rPos = tblPos + 1;
  for (let i = 0; i < table.content!.length; i++) {
    // Header row cao 50px, các hàng khác 40px
    const h = i === 0 ? 50 : 40;
    measuredRowHeights.set(rPos, h);
    rPos += getNodeSize(table.content![i]);
  }

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: measuredRowHeights,
  });

  assert.ok(layoutMap.getPageCount() >= 2, "Bảng phải tràn sang ít nhất 2 trang");

  const frags = layoutMap.getTableFragments(tblPos);
  assert.ok(frags.length >= 2, "Table phải có ít nhất 2 fragments");

  // Fragment 1 (Trang 1): Chứa semantic header gốc, không cần repeatedHeader
  const frag1 = frags[0];
  assert.equal(frag1.tableMetadata?.hasRepeatedHeader, undefined, "Trang 1 có header thật nên không đánh dấu hasRepeatedHeader");

  // Fragment 2 (Trang 2): Phải có visual repeated header metadata!
  const frag2 = frags[1];
  assert.equal(frag2.tableMetadata?.hasRepeatedHeader, true, "Trang 2+ phải có hasRepeatedHeader = true");
  assert.equal(frag2.tableMetadata?.repeatedHeaderHeight, 50, "Chiều cao visual repeated header phải khớp với row 0 (50px)");
  assert.equal(frag2.tableMetadata?.repeatedHeaderRowIndex, 0, "Repeated header index phải trỏ về row 0");

  // Kiểm tra API tra cứu repeated header trên trang
  const repHeaderInfo = layoutMap.getRepeatedHeaderForPage(1);
  assert.ok(repHeaderInfo, "Trang 2 (pageIndex 1) phải trả về RepeatedHeaderInfo");
  assert.equal(repHeaderInfo.height, 50);
  assert.equal(repHeaderInfo.rowIndex, 0);

  // Đảm bảo không tạo AST row mới hay ProseMirror position mới
  assert.equal(doc.content![0].content!.length, 30, "AST vẫn giữ nguyên đúng 30 rows gốc, không nhân bản");
});

test("Phase 8 - 10. Repeated header disabled: When repeatHeader is explicitly false, Page 2+ does not reserve header space", () => {
  const table = createTestTable(30, 2, { hasHeader: true, repeatHeader: false });
  const doc: JSONContent = {
    type: "doc",
    content: [table],
  };

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);

  const frags = layoutMap.getTableFragments();
  if (frags.length >= 2) {
    const frag2 = frags[1];
    assert.equal(frag2.tableMetadata?.hasRepeatedHeader, undefined, "Khi repeatHeader = false, Page 2+ không được có repeated header");
  }
});
