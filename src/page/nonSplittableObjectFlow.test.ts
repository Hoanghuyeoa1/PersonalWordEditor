import test from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { DEFAULT_PAGE_SETTINGS } from "./services/pageConstants.ts";
import { buildPageLayoutMap, getNodeSize } from "./services/pageLayoutMap.ts";

// ============================================================================
// PHASE 7: NON-SPLITTABLE BLOCK OBJECT FLOW TEST SUITE
// ============================================================================

test("Phase 7 - 1. Image move-next: Entire image moves to next page if it does not fit", () => {
  // Trang A4 usable body height ~960px.
  // Paragraph chiếm 800px -> còn lại ~160px.
  // Image có height = 240px (+ 32px padding/margin = 272px).
  // 272px > 160px -> Image không vừa phần còn lại của trang 1.
  // KẾT QUẢ: Toàn bộ Image chuyển sang Trang 2 (pageIndex = 1), không bị split.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Paragraph occupying top portion" }],
      },
      {
        type: "image",
        attrs: {
          src: "data:image/png;base64,fakeimage",
          alt: "Diagram",
          width: 400,
          height: 240,
          alignment: "center",
        },
      },
    ],
  };

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 800); // Paragraph chiếm 800px

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Tài liệu phải tạo 2 trang");

  const fragments = layoutMap.getAllFragments();
  const imageFrag = fragments.find((f) => f.nodeType === "image");
  assert.ok(imageFrag, "Phải tìm thấy LayoutFragment của image");
  assert.equal(imageFrag.pageIndex, 1, "Image phải nằm trọn vẹn trên Trang 2 (pageIndex = 1)");
  assert.equal(imageFrag.continuedFromPreviousPage, false, "Image không được tiếp nối từ trang trước");
  assert.equal(imageFrag.continuesToNextPage, false, "Image không được tràn sang trang sau");
});

test("Phase 7 - 2. Equation move-next: Equation moves to next page atomically", () => {
  // Paragraph chiếm 920px -> còn lại ~40px.
  // Equation có height = 64px.
  // 64px > 40px -> Equation chuyển sang Trang 2.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Introduction to math formulation" }],
      },
      {
        type: "equation",
        attrs: {
          latex: "E = mc^2",
          displayMode: true,
          alignment: "center",
        },
      },
    ],
  };

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 920);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Tài liệu phải gồm 2 trang");

  const eqFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "equation");
  assert.ok(eqFrag, "Phải có LayoutFragment của equation");
  assert.equal(eqFrag.pageIndex, 1, "Equation phải nằm trên Trang 2 (pageIndex = 1)");
  assert.equal(eqFrag.continuedFromPreviousPage, false);
  assert.equal(eqFrag.continuesToNextPage, false);
});

test("Phase 7 - 3. Shape move-next: Shape moves to next page atomically", () => {
  // Paragraph chiếm 850px -> còn lại ~110px.
  // Shape có height = 120px (+ 32px = 152px).
  // 152px > 110px -> Shape chuyển sang Trang 2.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Geometric illustration description" }],
      },
      {
        type: "shape",
        attrs: {
          shapeType: "rectangle",
          width: 300,
          height: 120,
          fillColor: "#e0e7ff",
          strokeColor: "#4338ca",
          strokeWidth: 2,
          alignment: "center",
        },
      },
    ],
  };

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 850);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Tài liệu phải gồm 2 trang");

  const shapeFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "shape");
  assert.ok(shapeFrag, "Phải có LayoutFragment của shape");
  assert.equal(shapeFrag.pageIndex, 1, "Shape phải nằm trên Trang 2");
  assert.equal(shapeFrag.continuedFromPreviousPage, false);
  assert.equal(shapeFrag.continuesToNextPage, false);
});

test("Phase 7 - 4. TextBox atomic policy: Respects existing architecture without splitting", () => {
  // Paragraph chiếm 800px -> còn lại ~160px.
  // TextBox có minHeight = 220px (+ 32px = 252px).
  // TextBox không vừa -> chuyển nguyên khối sang Trang 2.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Preceding body paragraph" }],
      },
      {
        type: "textBox",
        attrs: {
          width: 320,
          minHeight: 220,
          alignment: "left",
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Editable callout note inside text box" }],
          },
        ],
      },
    ],
  };

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(0, 800);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Phải có 2 trang");

  const textBoxFrags = layoutMap.getAllFragments().filter((f) => f.nodeType === "textBox");
  assert.equal(textBoxFrags.length, 1, "TextBox chỉ có đúng 1 fragment (atomic, không split)");
  assert.equal(textBoxFrags[0].pageIndex, 1, "TextBox nằm trọn vẹn trên Trang 2");
  assert.equal(textBoxFrags[0].continuedFromPreviousPage, false);
  assert.equal(textBoxFrags[0].continuesToNextPage, false);
});

test("Phase 7 - 5. Oversized object: Single giant object uses controlled overflow on Page 1 without infinite pages", () => {
  // Usable body height của A4 Portrait khoảng ~960px.
  // Object có height = 1400px (lớn hơn cả trang).
  // Vì đứng ở đầu trang (usedHeight = 0), nó được đặt ngay trên Trang 1 với controlled overflow.
  // KHÔNG lặp tạo trang mới.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "image",
        attrs: {
          src: "data:image/png;base64,large",
          width: 600,
          height: 1368, // + 32 = 1400px
        },
      },
    ],
  };

  const startTime = Date.now();
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 100, `Tính toán phải dưới 100ms (thực tế: ${elapsed}ms)`);
  assert.equal(layoutMap.getPageCount(), 1, "Chỉ tạo đúng 1 trang cho giant object đơn lẻ");

  const frag = layoutMap.getAllFragments()[0];
  assert.equal(frag.pageIndex, 0);
  assert.equal(frag.isOversized, true, "Phải đánh dấu isOversized = true");
  assert.equal(frag.height, 1400);
});

test("Phase 7 - 6. Oversized object after content: Moves once to Page 2 then uses controlled overflow (no infinite loop)", () => {
  // Paragraph 1: cao 200px trên Trang 1.
  // Image: cao 1400px (> 960px usable).
  // Paragraph 2: cao 100px.
  // Diễn biến:
  // - Paragraph 1 ở Trang 1.
  // - Image không vừa Trang 1 -> chuyển sang Trang 2.
  // - Tại Trang 2, Image chiếm toàn bộ và overflow.
  // - Paragraph 2 chuyển sang Trang 3.
  // Tổng: đúng 3 trang. Tuyệt đối không có infinite loop!

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Page 1 intro" }],
      },
      {
        type: "image",
        attrs: {
          src: "data:image/png;base64,huge",
          height: 1368, // 1400px
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Page 3 follower" }],
      },
    ],
  };

  const p1Pos = 0;
  const imgPos = getNodeSize(doc.content![0]);
  const p2Pos = imgPos + getNodeSize(doc.content![1]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(p1Pos, 200);
  measuredHeights.set(imgPos, 1400);
  measuredHeights.set(p2Pos, 100);

  const startTime = Date.now();
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });
  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 100, "Không được bị nghẽn hay lặp vô hạn");
  assert.equal(layoutMap.getPageCount(), 3, "Phải tạo chính xác 3 trang");

  const p1Frag = layoutMap.getFragmentForPosition(p1Pos);
  const imgFrag = layoutMap.getFragmentForPosition(imgPos);
  const p2Frag = layoutMap.getFragmentForPosition(p2Pos);

  assert.equal(p1Frag?.pageIndex, 0, "Paragraph 1 ở Trang 1");
  assert.equal(imgFrag?.pageIndex, 1, "Image ở Trang 2");
  assert.equal(imgFrag?.isOversized, true, "Image phải có isOversized = true");
  assert.equal(p2Frag?.pageIndex, 2, "Paragraph 2 ở Trang 3");
});

test("Phase 7 - 7. No infinite pages with multiple oversized objects", () => {
  // 4 oversized objects liên tiếp, mỗi object 1500px.
  // Phải sinh ra đúng 4 trang, mỗi trang 1 object. Hoàn thành ngay lập tức.

  const doc: JSONContent = {
    type: "doc",
    content: [
      { type: "image", attrs: { height: 1468 } },
      { type: "shape", attrs: { height: 1468 } },
      { type: "image", attrs: { height: 1468 } },
      { type: "shape", attrs: { height: 1468 } },
    ],
  };

  const startTime = Date.now();
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 50, `Thời gian phân trang phải < 50ms (thực tế: ${elapsed}ms)`);
  assert.equal(layoutMap.getPageCount(), 4, "Chính xác 4 trang cho 4 oversized objects");
});

test("Phase 7 - 8. Caption + Image grouping ('below'): Image moves to Page 2 so caption does not get orphaned", () => {
  // Trang 1 đã dùng 750px (còn ~210px).
  // Image có chiều cao 180px.
  // Caption ("below") có chiều cao 40px.
  // Nếu không có grouping: Image vừa 210px (ở lại Trang 1), Caption không vừa (nhảy sang Trang 2) -> mồ côi!
  // VỚI GENERIC CAPTION GROUPING:
  // Image + Caption = 220px > 210px còn lại.
  // Vì 220px <= 960px (vừa 1 trang mới), cả Image và Caption cùng chuyển sang Trang 2!

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Top content taking 750px" }],
      },
      {
        type: "image",
        attrs: {
          id: "fig-arch",
          src: "data:image/png;base64,arch",
          height: 148, // + 32 = 180px
        },
      },
      {
        type: "caption",
        attrs: {
          id: "cap-arch",
          targetId: "fig-arch",
          label: "Figure",
          positionPolicy: "below",
        },
        content: [{ type: "text", text: "System Architecture Flow" }],
      },
    ],
  };

  const pPos = 0;
  const imgPos = getNodeSize(doc.content![0]);
  const capPos = imgPos + getNodeSize(doc.content![1]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 750);
  measuredHeights.set(imgPos, 180);
  measuredHeights.set(capPos, 40);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Tài liệu chia 2 trang");

  const imgFrag = layoutMap.getFragmentForPosition(imgPos);
  const capFrag = layoutMap.getFragmentForPosition(capPos);

  assert.equal(imgFrag?.pageIndex, 1, "Image phải chuyển sang Trang 2 cùng với caption");
  assert.equal(capFrag?.pageIndex, 1, "Caption phải nằm trên Trang 2 cùng với Image");
});

test("Phase 7 - 9. Caption + Table target grouping ('above'): Caption moves to Page 2 so table stays with it", () => {
  // Trang 1 đã dùng 850px (còn ~110px).
  // Caption ("above") có chiều cao 36px (vừa 110px).
  // Table có chiều cao 150px.
  // Nếu không có grouping: Caption ở cuối Trang 1, Table ở đầu Trang 2 -> mồ côi!
  // VỚI GENERIC CAPTION GROUPING:
  // Caption + Table = 186px > 110px còn lại.
  // Cả Caption và Table cùng chuyển sang Trang 2!

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Top content taking 850px" }],
      },
      {
        type: "caption",
        attrs: {
          id: "cap-tbl",
          targetId: "tbl-metrics",
          label: "Table",
          positionPolicy: "above",
        },
        content: [{ type: "text", text: "Summary Metrics Table" }],
      },
      {
        type: "table",
        attrs: {
          id: "tbl-metrics",
        },
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Cell 1" }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  const pPos = 0;
  const capPos = getNodeSize(doc.content![0]);
  const tblPos = capPos + getNodeSize(doc.content![1]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 850);
  measuredHeights.set(capPos, 36);
  measuredHeights.set(tblPos, 150);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  assert.equal(layoutMap.getPageCount(), 2, "Tài liệu chia 2 trang");

  const capFrag = layoutMap.getFragmentForPosition(capPos);
  const tblFrag = layoutMap.getFragmentForPosition(tblPos);

  assert.equal(capFrag?.pageIndex, 1, "Caption phải chuyển sang Trang 2 cùng với Table");
  assert.equal(tblFrag?.pageIndex, 1, "Table phải nằm trên Trang 2 cùng với Caption");
});

test("Phase 7 - 10. Caption grouping oversized fallback: Relaxes grouping if group > usablePageHeight", () => {
  // Trang 1 đã dùng 300px.
  // Image oversized cao 1200px + Caption cao 40px = 1240px > 960px.
  // Vì tổng nhóm lớn hơn cả 1 trang mới (oversized group),
  // grouping policy tự động relax: không cố ép chuyển nhóm vô hạn.
  // Image chuyển sang Trang 2 (usedHeight = 0, controlled overflow).
  // Caption chuyển sang Trang 3.

  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Section 1 content" }],
      },
      {
        type: "image",
        attrs: {
          id: "fig-massive",
          height: 1168, // 1200px
        },
      },
      {
        type: "caption",
        attrs: {
          targetId: "fig-massive",
          positionPolicy: "below",
        },
        content: [{ type: "text", text: "Huge chart" }],
      },
    ],
  };

  const pPos = 0;
  const imgPos = getNodeSize(doc.content![0]);
  const capPos = imgPos + getNodeSize(doc.content![1]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 300);
  measuredHeights.set(imgPos, 1200);
  measuredHeights.set(capPos, 40);

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  assert.equal(layoutMap.getPageCount(), 3, "Phải tạo đúng 3 trang ổn định");
  assert.equal(layoutMap.getFragmentForPosition(imgPos)?.pageIndex, 1);
  assert.equal(layoutMap.getFragmentForPosition(capPos)?.pageIndex, 2);
});

test("Phase 7 - 11. TOC and Bibliography: Atom blocks respect height estimation and atomic movement", () => {
  // Kiểm tra TOC và Bibliography là atom blocks, di chuyển nguyên khối.
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Document header block taking 750px" }],
      },
      {
        type: "tableOfContents",
        attrs: {
          title: "Mục lục",
          entries: [
            { id: "h1", level: 1, text: "Chương 1", page: 1 },
            { id: "h2", level: 2, text: "1.1 Giới thiệu", page: 1 },
            { id: "h3", level: 2, text: "1.2 Phương pháp", page: 2 },
            { id: "h4", level: 1, text: "Chương 2", page: 3 },
          ],
        },
      },
      {
        type: "bibliography",
        attrs: {
          title: "Tài liệu tham khảo",
          style: "apa",
          entries: [
            { id: "ref1", key: "knuth1984", text: "Knuth, D. (1984)..." },
            { id: "ref2", key: "lamport1994", text: "Lamport, L. (1994)..." },
          ],
        },
      },
    ],
  };

  const pPos = 0;
  const tocPos = getNodeSize(doc.content![0]);

  const measuredHeights = new Map<number, number>();
  measuredHeights.set(pPos, 750); // Còn ~210px

  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS, {
    measuredBlockHeights: measuredHeights,
  });

  // TOC ước tính: 40 + 4*24 + 16 = 152px -> có thể vừa 210px hoặc chuyển trang.
  // Quan trọng: cả TOC và Bibliography đều là atom fragments nguyên vẹn.
  const tocFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "tableOfContents");
  const bibFrag = layoutMap.getAllFragments().find((f) => f.nodeType === "bibliography");

  assert.ok(tocFrag, "Phải có LayoutFragment của tableOfContents");
  assert.ok(bibFrag, "Phải có LayoutFragment của bibliography");
  assert.equal(tocFrag.continuedFromPreviousPage, false, "TOC không được split");
  assert.equal(tocFrag.continuesToNextPage, false, "TOC không được split");
  assert.equal(bibFrag.continuedFromPreviousPage, false, "Bibliography không được split");
  assert.equal(bibFrag.continuesToNextPage, false, "Bibliography không được split");
});

test("Phase 7 - 12. AST Unchanged: Input document AST is strictly immutable", () => {
  // Tạo tài liệu tổng hợp đầy đủ các đối tượng non-splittable của Phase 7:
  // Image, Shape, Equation, TextBox, Caption, TOC, Bibliography, Oversized image.
  const doc: JSONContent = {
    type: "doc",
    content: [
      {
        type: "tableOfContents",
        attrs: { title: "Mục lục", entries: [] },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Some text" }],
      },
      {
        type: "image",
        attrs: { id: "img-1", src: "fake", width: 400, height: 1200 },
      },
      {
        type: "caption",
        attrs: { id: "cap-1", targetId: "img-1", label: "Figure", positionPolicy: "below" },
        content: [{ type: "text", text: "Figure 1" }],
      },
      {
        type: "equation",
        attrs: { latex: "x^2 + y^2 = r^2" },
      },
      {
        type: "shape",
        attrs: { shapeType: "ellipse", width: 200, height: 100 },
      },
      {
        type: "textBox",
        attrs: { width: 300, minHeight: 100 },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Inside box" }] }],
      },
      {
        type: "horizontalRule",
      },
      {
        type: "bibliography",
        attrs: { title: "Tài liệu", entries: [] },
      },
    ],
  };

  const astSnapshotBefore = JSON.stringify(doc);

  // Chạy layout calculation
  const layoutMap = buildPageLayoutMap(doc, DEFAULT_PAGE_SETTINGS);
  assert.ok(layoutMap.getPageCount() >= 1);

  const astSnapshotAfter = JSON.stringify(doc);
  assert.equal(
    astSnapshotAfter,
    astSnapshotBefore,
    "AST ProseMirror phải giữ nguyên 100% không bị thay đổi thuộc tính hay cấu trúc!"
  );
});
