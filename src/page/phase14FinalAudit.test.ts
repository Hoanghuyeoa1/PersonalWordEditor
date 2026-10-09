import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import {
  PageLayoutMap,
  buildPageLayoutMap,
  type MeasuredLineBox,
} from "./services/pageLayoutMap.ts";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import { reflowManager } from "./services/reflowManager.ts";
import {
  serializeDocumentToMwd,
  deserializeMwdToDocument,
} from "../document/documentFile.ts";
import {
  exportDocumentModelToDocx,
  importDocxToDocumentModel,
} from "../docx/index.ts";
import type { DocumentModel } from "../document/documentTypes.ts";
import {
  STYLE_NORMAL_ID,
  STYLE_HEADING_1_ID,
} from "../styles/services/builtInStyles.ts";
import JSZip from "jszip";

/* ==========================================================================
   BỘ KIỂM THỬ TỔNG THỂ: PHASE 14 — FINAL AUDIT + ZERO REGRESSION
   PAGINATION ENGINE 2.0
   ========================================================================== */

// --------------------------------------------------------------------------
// 1. WORKFLOW A — LONG PARAGRAPH
// --------------------------------------------------------------------------
test("Phase 14 - Workflow A: Long paragraph flows across pages without duplicating AST node, with caret & selection safety", () => {
  // Đoạn văn dài 60 dòng tiếng Việt có dấu
  const totalLines = 60;
  const lineBoxes: MeasuredLineBox[] = [];
  for (let i = 0; i < totalLines; i++) {
    lineBoxes.push({
      lineIndex: i,
      from: i * 20,
      to: (i + 1) * 20,
      topPx: i * 24,
      heightPx: 24,
      text: `Dòng thứ ${i + 1}: Văn bản tiếng Việt có dấu thử nghiệm IME và flow. `,
    });
  }

  const measuredLinesMap = new Map<number, MeasuredLineBox[]>();
  measuredLinesMap.set(0, lineBoxes);

  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { id: "long-p-1" },
        content: [
          {
            type: "text",
            text: lineBoxes.map((l) => l.text).join(""),
          },
        ],
      },
    ],
  };

  const layoutMap = buildPageLayoutMap(content, DEFAULT_PAGE_SETTINGS, {
    measuredBlockLines: measuredLinesMap,
  });

  // 1. Phân bổ nhiều trang
  assert.ok(layoutMap.getPageCount() >= 2, "Đoạn văn dài phải flow qua ít nhất 2 trang");

  // 2. AST vẫn chỉ có đúng 1 paragraph node duy nhất
  assert.equal(content.content?.length, 1, "Semantic AST chỉ có đúng 1 paragraph node");

  // 3. Phân mảnh trực quan: paragraph tạo ít nhất 2 fragments
  const fragments = layoutMap.getAllFragments().filter((f) => f.nodeType === "paragraph");
  assert.ok(fragments.length >= 2, "Paragraph tạo nhiều layout fragments");
  assert.equal(fragments[0].continuesToNextPage, true);
  assert.equal(fragments[1].continuedFromPreviousPage, true);

  // 4. Caret position mapping
  // Vị trí dòng đầu (pos = 5) thuộc Page 0 (trang 1)
  assert.equal(layoutMap.getPageForPosition(5), 0);
  assert.equal(layoutMap.getPageNumberForPosition(5), 1);

  // Vị trí các dòng cuối thuộc Page tiếp theo
  const lastLinePos = lineBoxes[totalLines - 1].from + 2;
  const lastPage = layoutMap.getPageForPosition(lastLinePos);
  assert.ok(lastPage >= 1, "Caret cuối đoạn văn phải thuộc trang thứ 2 trở đi");

  // 5. Cross-page selection: dải chọn từ đầu đoạn tới cuối đoạn
  const selFrom = 10;
  const selTo = lastLinePos;
  const pageFrom = layoutMap.getPageNumberForPosition(selFrom);
  const pageTo = layoutMap.getPageNumberForPosition(selTo);
  assert.ok(pageFrom < pageTo, "Selection xuyên trang nối từ trang trước sang trang sau");
});

// --------------------------------------------------------------------------
// 2. WORKFLOW B — WIDOW / ORPHAN CONTROL
// --------------------------------------------------------------------------
test("Phase 14 - Workflow B: Widow/Orphan control prevents single-line orphans/widows", () => {
  // Đoạn văn 5 dòng
  const fiveLineBoxes: MeasuredLineBox[] = [];
  for (let i = 0; i < 5; i++) {
    fiveLineBoxes.push({
      lineIndex: i,
      from: i * 20,
      to: (i + 1) * 20,
      topPx: i * 24,
      heightPx: 24,
      text: `Dòng ${i + 1} của đoạn văn năm dòng kiểm thử widow. `,
    });
  }

  const measuredLines = new Map<number, MeasuredLineBox[]>();
  measuredLines.set(1, fiveLineBoxes); // block index 1

  // Usable height ~931px. Cho block 0 chiếm ~915px, cuối trang 1 chỉ còn ~16px (chỉ vừa 1 dòng)
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { id: "spacer-p" },
        content: [{ type: "text", text: "Khối chiếm khoảng trống đầu trang" }],
      },
      {
        type: "paragraph",
        attrs: { id: "widow-p", widowControl: true },
        content: [{ type: "text", text: "Đoạn 5 dòng có widowControl bật" }],
      },
    ],
  };

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 915); // Chỉ còn ~16px trên trang 1

  const layoutMap = buildPageLayoutMap(content, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
    measuredBlockLines: measuredLines,
  });

  // Với widowControl: true, không thể để 1 dòng mồ côi (16px < 24px) ở trang 1
  // Toàn bộ hoặc ít nhất 2 dòng phải được đẩy sang trang 2
  const p1Frags = layoutMap.getAllFragments().filter((f) => f.nodeType === "paragraph" && f.from >= 30);
  if (p1Frags.length > 1) {
    const linesOnP1 = p1Frags[0].lineRange ? p1Frags[0].lineRange.end - p1Frags[0].lineRange.start : 0;
    assert.ok(linesOnP1 >= 2, "Fragment đầu không được là 1 orphan line đơn độc");
  } else if (p1Frags.length === 1) {
    assert.equal(p1Frags[0].pageIndex, 1, "Toàn bộ đoạn văn được chuyển sang trang tiếp theo");
  } else {
    // Hoặc kiểm tra trang chứa vị trí bắt đầu đoạn văn
    assert.equal(layoutMap.getPageForPosition(35), 1, "Vị trí đoạn 2 phải ở trang 2");
  }
});

// --------------------------------------------------------------------------
// 3. WORKFLOW C — KEEP WITH NEXT
// --------------------------------------------------------------------------
test("Phase 14 - Workflow C: keepWithNext heading moves together with body paragraph", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { id: "filler-1" },
        content: [{ type: "text", text: "Đoạn văn làm đầy trang 1" }],
      },
      {
        type: "heading",
        attrs: { id: "head-1", level: 1, keepWithNext: true },
        content: [{ type: "text", text: "Tiêu đề ở gần chân trang" }],
      },
      {
        type: "paragraph",
        attrs: { id: "body-1" },
        content: [{ type: "text", text: "Nội dung thân bài gắn liền với tiêu đề" }],
      },
    ],
  };

  // Chiều cao usable là ~931px. Filler chiếm 890px. Heading chiếm 40px -> vừa khít trang 1.
  // Nhưng body cần 60px -> không vừa trang 1.
  // Do keepWithNext = true, Heading bắt buộc phải chuyển sang trang 2 cùng body!
  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 890);
  measuredHeights.set(1, 40);
  measuredHeights.set(2, 60);

  const layoutMap = buildPageLayoutMap(content, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  const headFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "heading")!;
  const allParas = layoutMap.getAllFragments().filter((f) => f.nodeType === "paragraph");
  const bodyFrag = allParas[allParas.length - 1];

  assert.equal(headFrag.pageIndex, 1, "Heading phải chuyển sang trang 2 để đi cùng body");
  assert.equal(bodyFrag.pageIndex, 1, "Body nằm trên trang 2");
  assert.equal(headFrag.pageIndex, bodyFrag.pageIndex, "Heading và body cùng chung một trang");
});

// --------------------------------------------------------------------------
// 4. WORKFLOW D — PAGE BREAK BEFORE
// --------------------------------------------------------------------------
test("Phase 14 - Workflow D: pageBreakBefore starts on new page without synthesizing AST pageBreak node", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn trang 1" }],
      },
      {
        type: "heading",
        attrs: { level: 2, pageBreakBefore: true },
        content: [{ type: "text", text: "Tiêu đề có pageBreakBefore" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Đoạn văn sau tiêu đề" }],
      },
    ],
  };

  const layoutMap = buildPageLayoutMap(content, DEFAULT_PAGE_SETTINGS);

  // Heading phải bắt đầu tại trang 2 (pageIndex = 1)
  const headFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "heading")!;
  assert.equal(headFrag.pageIndex, 1, "Heading phải nằm ở đầu trang 2");

  // Semantic AST không bao giờ được chèn thêm node type 'pageBreak'
  assert.equal(content.content?.length, 3, "AST content giữ nguyên đúng 3 nodes");
  assert.equal(content.content?.some((n) => n.type === "pageBreak"), false, "Không có pageBreak node tự sinh");
});

// --------------------------------------------------------------------------
// 5. WORKFLOW E — MULTI-PAGE TABLE
// --------------------------------------------------------------------------
test("Phase 14 - Workflow E: Table with 45 rows flows over multiple pages with single semantic table AST", () => {
  const rows: JSONContent[] = [];
  const rowCount = 45;

  // Header row
  rows.push({
    type: "tableRow",
    content: [
      { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "STT" }] }] },
      { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Tên Hàng Hóa" }] }] },
      { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Đơn Giá" }] }] },
    ],
  });

  // 44 Data rows
  for (let i = 1; i < rowCount; i++) {
    rows.push({
      type: "tableRow",
      content: [
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: String(i) }] }] },
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Mặt hàng số ${i}` }] }] },
        { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `${i * 10}.000đ` }] }] },
      ],
    });
  }

  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { id: "large-table" },
        content: rows,
      },
    ],
  };

  // Mỗi hàng bảng cao ~40px. 45 hàng = 1800px -> flow qua ít nhất 2 trang (usableHeight = 931px)
  const tableRowHeights = new Map<number, number[]>();
  tableRowHeights.set(0, new Array(rowCount).fill(40));

  const layoutMap = buildPageLayoutMap(content, DEFAULT_PAGE_SETTINGS, {
    measuredTableRowHeights: tableRowHeights,
  });

  // 1. Số trang >= 2
  assert.ok(layoutMap.getPageCount() >= 2, "Bảng 45 hàng phải flow qua ít nhất 2 trang");

  // 2. Semantic AST vẫn là 1 table duy nhất
  assert.equal(content.content?.length, 1, "Semantic AST chỉ chứa 1 node table duy nhất");
  assert.equal(content.content?.[0].content?.length, rowCount, "Table giữ nguyên 45 rows trong AST");

  // 3. Phân mảnh bảng theo ranh giới hàng (row-boundary pagination)
  const tableFrags = layoutMap.getTableFragments();
  assert.ok(tableFrags.length >= 2, "Bảng tạo nhiều visual table fragments");
  assert.equal(tableFrags[0].pageIndex, 0);
  assert.equal(tableFrags[1].pageIndex, 1);

  // 4. Tra cứu vị trí hàng bảng
  assert.ok(tableFrags[0].tableMetadata?.rows.length! > 0);
  assert.ok(tableFrags[1].tableMetadata?.rows.length! > 0);
  const totalAllocatedRows = tableFrags.reduce((acc, f) => acc + (f.tableMetadata?.rows.length || 0), 0);
  assert.equal(totalAllocatedRows, rowCount, "Tất cả các hàng được phân bổ đầy đủ");
});

// --------------------------------------------------------------------------
// 6. WORKFLOW F — SECTIONS & GEOMETRY BOUNDARIES
// --------------------------------------------------------------------------
test("Phase 14 - Workflow F: Section 1 Portrait -> Section 2 Landscape maintains strict geometry boundaries", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang phần 1: A4 đứng (Portrait)" }],
      },
      {
        type: "sectionBreak",
        attrs: {
          sectionId: "sec-2",
          pageSettings: {
            paperSize: "A4",
            orientation: "landscape",
            margins: { top: 20, right: 20, bottom: 20, left: 20 },
          },
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trang phần 2: A4 ngang (Landscape)" }],
      },
    ],
  };

  const layoutMap = buildPageLayoutMap(content, DEFAULT_PAGE_SETTINGS);

  assert.equal(layoutMap.getPageCount(), 2, "Có 2 trang cho 2 sections");

  const page1 = layoutMap.getPage(0)!;
  const page2 = layoutMap.getPage(1)!;

  // Section 1: Portrait A4 (~794 x ~1123 px)
  assert.equal(page1.orientation, "portrait");
  assert.equal(Math.round(page1.widthPx), 794);
  assert.equal(Math.round(page1.heightPx), 1123);
  assert.equal(page1.sectionIndex, 1);

  // Section 2: Landscape A4 (~1123 x ~794 px)
  assert.equal(page2.orientation, "landscape");
  assert.equal(Math.round(page2.widthPx), 1123);
  assert.equal(Math.round(page2.heightPx), 794);
  assert.equal(page2.sectionIndex, 2);

  // Fragments nằm riêng biệt trên mỗi trang
  const allFrags = layoutMap.getAllFragments();
  const frag1 = allFrags[0];
  const frag2 = allFrags[allFrags.length - 1];
  assert.equal(frag1.pageIndex, 0);
  assert.equal(frag2.pageIndex, 1);
});

// --------------------------------------------------------------------------
// 7. WORKFLOW G — REFERENCES (TOC & CROSS-REFERENCE INTEGRATION)
// --------------------------------------------------------------------------
test("Phase 14 - Workflow G: Heading moving across pages updates PageLayoutMap query for TOC and Cross-Reference", () => {
  // Trạng thái ban đầu: Heading ở ngay đầu tài liệu (Trang 1)
  const initialDoc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "target-heading", level: 1 },
        content: [{ type: "text", text: "Kết quả nghiên cứu" }],
      },
    ],
  };

  const initialLayout = buildPageLayoutMap(initialDoc, DEFAULT_PAGE_SETTINGS);
  assert.equal(initialLayout.getPageNumberForPosition(2), 1, "Ban đầu heading ở trang 1");

  // Sau khi chèn 3 trang nội dung phía trước:
  const shiftedDoc: JSONContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Nội dung trang 1" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Nội dung trang 2" }] },
      { type: "pageBreak" },
      { type: "paragraph", content: [{ type: "text", text: "Nội dung trang 3" }] },
      { type: "pageBreak" },
      {
        type: "heading",
        attrs: { id: "target-heading", level: 1 },
        content: [{ type: "text", text: "Kết quả nghiên cứu" }],
      },
    ],
  };

  const shiftedLayout = buildPageLayoutMap(shiftedDoc, DEFAULT_PAGE_SETTINGS);
  const headingFrag = shiftedLayout.getAllFragments().find((f) => f.nodeType === "heading")!;
  const targetPos = headingFrag.from + 2;

  // Cả TOC và Cross-reference cùng gọi getPageNumberForPosition
  const resolvedPage = shiftedLayout.getPageNumberForPosition(targetPos);
  assert.equal(resolvedPage, 4, "Heading đã chuyển sang trang 4 chính xác");
});

// --------------------------------------------------------------------------
// 8. WORKFLOW H — NON-SPLITTABLE OBJECTS & CAPTION GROUPING
// --------------------------------------------------------------------------
test("Phase 14 - Workflow H: Image + Caption move together as a semantic group without infinite loop", () => {
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Văn bản làm đầy trang 1" }],
      },
      {
        type: "image",
        attrs: { id: "img-1", width: 400, height: 200, src: "data:image/png;base64,123" },
      },
      {
        type: "caption",
        attrs: { id: "cap-1", targetId: "img-1", label: "Figure", text: "Biểu đồ phát triển", positionPolicy: "below" },
      },
    ],
  };

  // Trang 1 còn trống 210px. Image cần 232px, Caption cần 36px (Tổng nhóm = 268px).
  // Image đơn lẻ không vừa và Image + Caption liên kết thành nhóm ngữ nghĩa
  // -> Cả hai phải di chuyển cùng nhau sang trang 2 nguyên khối.
  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 725); // Usable: 931 -> còn 206px

  const layoutMap = buildPageLayoutMap(content, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  const imgFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "image")!;
  const capFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "caption")!;

  assert.equal(imgFrag.pageIndex, 1, "Ảnh phải di chuyển sang trang 2");
  assert.equal(capFrag.pageIndex, 1, "Caption phải đi cùng ảnh sang trang 2");
  assert.equal(imgFrag.pageIndex, capFrag.pageIndex, "Ảnh và Caption cùng nằm trên 1 trang");
});

// --------------------------------------------------------------------------
// 9. WORKFLOW I — NATIVE PERSISTENCE (.MWD ROUND TRIP)
// --------------------------------------------------------------------------
test("Phase 14 - Workflow I: Save & Open .mwd preserves all semantic pagination properties and excludes runtime layout keys", async () => {
  const model: DocumentModel = {
    id: "doc-audit-p14",
    title: "Document Final Audit",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
            styleId: STYLE_HEADING_1_ID,
            keepWithNext: true,
            keepLinesTogether: true,
            pageBreakBefore: true,
            widowControl: true,
            // Giả lập runtime layout keys vô tình gắn vào
            pageIndex: 99,
            domRect: { x: 0, y: 0, width: 100, height: 20 },
          },
          content: [{ type: "text", text: "Tiêu đề trang mới" }],
        },
        {
          type: "paragraph",
          attrs: {
            styleId: STYLE_NORMAL_ID,
            keepWithNext: false,
            keepLinesTogether: false,
            pageBreakBefore: false,
            widowControl: true,
          },
          content: [{ type: "text", text: "Đoạn văn thông thường." }],
        },
      ],
    },
    metadata: {
      title: "Audit Title",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  // 1. Serialize sang .mwd chuỗi JSON
  const mwdString = serializeDocumentToMwd(model);

  // 2. Kiểm tra chuỗi tuần tự hóa không chứa bất kỳ forbidden runtime keys nào
  assert.equal(mwdString.includes('"pageIndex"'), false, "Tệp .mwd không được chứa pageIndex");
  assert.equal(mwdString.includes('"domRect"'), false, "Tệp .mwd không được chứa domRect");

  // 3. Deserialize lại từ .mwd
  const restored = deserializeMwdToDocument(mwdString);
  assert.equal(restored.success, true);
  if (!restored.success) return;
  const hNode = restored.document.content.content?.[0];
  const pNode = restored.document.content.content?.[1];

  // Semantic properties phải bảo toàn 100%
  assert.equal(hNode?.attrs?.keepWithNext, true);
  assert.equal(hNode?.attrs?.keepLinesTogether, true);
  assert.equal(hNode?.attrs?.pageBreakBefore, true);
  assert.equal(hNode?.attrs?.widowControl, true);

  assert.equal(pNode?.attrs?.keepWithNext, false);
  assert.equal(pNode?.attrs?.widowControl, true);
});

// --------------------------------------------------------------------------
// 10. WORKFLOW J — DOCX SEMANTIC MAPPING
// --------------------------------------------------------------------------
test("Phase 14 - Workflow J: DOCX export preserves semantics without serializing runtime fragments as explicit breaks", async () => {
  const model: DocumentModel = {
    id: "doc-docx-audit",
    title: "DOCX Audit",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1, keepWithNext: true, pageBreakBefore: true },
          content: [{ type: "text", text: "Tiêu đề OOXML" }],
        },
        {
          type: "paragraph",
          attrs: { keepLinesTogether: true, widowControl: false },
          content: [{ type: "text", text: "Đoạn văn OOXML với widowControl = false." }],
        },
      ],
    },
    metadata: {
      title: "DOCX Title",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  const docxBytes = await exportDocumentModelToDocx(model);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Semantic tags có mặt trong OOXML
  assert.ok(docXml.includes("<w:keepNext/>"));
  assert.ok(docXml.includes("<w:pageBreakBefore/>"));
  assert.ok(docXml.includes("<w:keepLines/>"));
  assert.ok(docXml.includes('<w:widowControl w:val="0"/>'));

  // Không có <w:br w:type="page"/> tự động
  assert.equal(docXml.includes('<w:br w:type="page"/>'), false);

  // Round-trip import lại
  const imported = await importDocxToDocumentModel(docxBytes, "audit.docx");
  assert.equal(imported.success, true);
  if (!imported.success) return;

  const blocks = imported.document.content.content || [];
  assert.equal(blocks[0].attrs?.keepWithNext, true);
  assert.equal(blocks[0].attrs?.pageBreakBefore, true);
  assert.equal(blocks[1].attrs?.keepLinesTogether, true);
  assert.equal(blocks[1].attrs?.widowControl, false);
});

// --------------------------------------------------------------------------
// 11. FAILURE SAFETY & RESILIENCE
// --------------------------------------------------------------------------
test("Phase 14 - Failure Safety: Corrupted layout input falls back gracefully without corrupting AST or crashing", () => {
  // Test với null content
  const mapNull = buildPageLayoutMap(null, DEFAULT_PAGE_SETTINGS);
  assert.ok(mapNull.getPageCount() >= 1, "Null content vẫn tạo tối thiểu 1 trang an toàn");

  // Test với content rỗng
  const mapEmpty = buildPageLayoutMap({ type: "doc", content: [] }, DEFAULT_PAGE_SETTINGS);
  assert.ok(mapEmpty.getPageCount() >= 1, "Empty content tạo 1 trang an toàn");

  // Test với node dị dạng
  const malformedContent: JSONContent = {
    type: "doc",
    content: [
      {
        type: "unknown_corrupt_type",
        attrs: { height: NaN, width: -999 },
      },
    ],
  };

  const mapMalformed = buildPageLayoutMap(malformedContent, DEFAULT_PAGE_SETTINGS);
  assert.ok(mapMalformed.getPageCount() >= 1, "Malformed node không làm sập layout map");
  assert.equal(malformedContent.content?.length, 1, "AST gốc không bị đột biến");
});

// --------------------------------------------------------------------------
// 12. PERFORMANCE BENCHMARK & MEASUREMENTS
// --------------------------------------------------------------------------
test("Phase 14 - Performance: Benchmarking Pagination Engine on large documents", () => {
  // 1. Scenario 50 paragraphs
  const content50: JSONContent = {
    type: "doc",
    content: Array.from({ length: 50 }, (_, i) => ({
      type: "paragraph",
      attrs: { id: `p-${i}` },
      content: [{ type: "text", text: `Đoạn văn thứ ${i + 1} phục vụ kiểm thử benchmark hiệu năng.` }],
    })),
  };

  const start50 = performance.now();
  const map50 = buildPageLayoutMap(content50, DEFAULT_PAGE_SETTINGS);
  const dur50 = performance.now() - start50;
  assert.ok(map50.getPageCount() >= 1);
  assert.ok(dur50 < 100, `50 paragraphs layout mất ${dur50.toFixed(2)}ms (ngưỡng an toàn < 100ms)`);

  // 2. Scenario 200 paragraphs
  const content200: JSONContent = {
    type: "doc",
    content: Array.from({ length: 200 }, (_, i) => ({
      type: "paragraph",
      attrs: { id: `p200-${i}` },
      content: [{ type: "text", text: `Đoạn văn ${i + 1} trong tài liệu quy mô lớn 200 đoạn.` }],
    })),
  };

  const start200 = performance.now();
  const map200 = buildPageLayoutMap(content200, DEFAULT_PAGE_SETTINGS);
  const dur200 = performance.now() - start200;
  assert.ok(map200.getPageCount() >= 5);
  assert.ok(dur200 < 300, `200 paragraphs layout mất ${dur200.toFixed(2)}ms (ngưỡng an toàn < 300ms)`);

  // 3. Scenario 60-row Table
  const tableRows: JSONContent[] = Array.from({ length: 60 }, (_, i) => ({
    type: "tableRow",
    content: [
      { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Hàng ${i + 1}` }] }] },
      { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: `Dữ liệu ${i + 1}` }] }] },
    ],
  }));

  const contentTable: JSONContent = {
    type: "doc",
    content: [{ type: "table", content: tableRows }],
  };

  const startTable = performance.now();
  const mapTable = buildPageLayoutMap(contentTable, DEFAULT_PAGE_SETTINGS);
  const durTable = performance.now() - startTable;
  assert.ok(mapTable.getPageCount() >= 2);
  assert.ok(durTable < 100, `60-row table layout mất ${durTable.toFixed(2)}ms (ngưỡng an toàn < 100ms)`);

  // 4. Reflow Manager check
  reflowManager.resetDiagnostics();
  assert.equal(reflowManager.getDiagnostics().layoutPassCount, 0);
});
