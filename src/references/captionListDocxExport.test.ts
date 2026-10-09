import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { DocumentModel } from "../document/documentTypes.ts";
import { exportDocumentModelToDocx } from "../docx/export/docxExporter.ts";
import type { CaptionListNodeAttrs } from "./types/captionListTypes.ts";

function createBaseDocument(content: any[]): DocumentModel {
  return {
    metadata: {
      id: "doc-test-docx-caption-list",
      title: "Kiểm thử DOCX Export Caption List",
      version: 1,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
    },
    pageSettings: {
      paperSize: "A4",
      orientation: "portrait",
      margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
      marginPreset: "Normal",
    },
    content: {
      type: "doc",
      content,
    },
  };
}

test("Phase 9 - 1. List of Figures export: preserves title, entry text, dot leader, TableofFigures style and page numbers", async () => {
  const figureListAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_fig_001",
    title: "Danh mục hình ảnh kiến trúc",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "cap_fig_1",
        targetId: "img_001",
        label: "Figure",
        number: 1,
        text: "Sơ đồ kiến trúc tổng quan hệ thống",
        fullTitle: "Figure 1 — Sơ đồ kiến trúc tổng quan hệ thống",
        labelAndNumber: "Figure 1",
        pageNumber: 2,
      },
      {
        captionId: "cap_fig_2",
        targetId: "img_002",
        label: "Figure",
        number: 2,
        text: "Biểu đồ luồng dữ liệu",
        fullTitle: "Figure 2 — Biểu đồ luồng dữ liệu",
        labelAndNumber: "Figure 2",
        pageNumber: 5,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const doc = createBaseDocument([
    {
      type: "paragraph",
      content: [{ type: "text", text: "Phần mở đầu tài liệu." }],
    },
    {
      type: "captionList",
      attrs: figureListAttrs,
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Nội dung sau danh mục hình." }],
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  assert.ok(docxBytes instanceof Uint8Array);

  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // 1. Tiêu đề danh mục có style TOCHeading
  assert.ok(docXml.includes('w:pStyle w:val="TOCHeading"'), "Tiêu đề danh mục phải dùng style TOCHeading");
  assert.ok(docXml.includes("Danh mục hình ảnh kiến trúc"), "Tiêu đề danh mục tiếng Việt phải được bảo toàn");

  // 2. Các mục danh mục dùng style TableofFigures
  assert.ok(docXml.includes('w:pStyle w:val="TableofFigures"'), "Các mục phải có style TableofFigures");
  assert.ok(docXml.includes("Figure 1 — Sơ đồ kiến trúc tổng quan hệ thống"));
  assert.ok(docXml.includes("Figure 2 — Biểu đồ luồng dữ liệu"));

  // 3. Dot leader và căn phải số trang
  assert.ok(docXml.includes('w:tab w:val="right" w:leader="dot" w:pos="9360"'), "Phải có tab right căn lề với dot leader");
  assert.ok(docXml.includes("<w:tab/><w:t>2</w:t>"), "Mục 1 phải có số trang 2 sau tab");
  assert.ok(docXml.includes("<w:tab/><w:t>5</w:t>"), "Mục 2 phải có số trang 5 sau tab");
});

test("Phase 9 - 2. List of Tables export: preserves table entries and Table label", async () => {
  const tableListAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_tbl_001",
    title: "Danh mục bảng biểu thống kê",
    label: "Table",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "cap_tbl_1",
        targetId: "tbl_001",
        label: "Table",
        number: 1,
        text: "Bảng tổng hợp tham số mô hình",
        fullTitle: "Table 1 — Bảng tổng hợp tham số mô hình",
        labelAndNumber: "Table 1",
        pageNumber: 3,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const doc = createBaseDocument([
    {
      type: "captionList",
      attrs: tableListAttrs,
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes("Danh mục bảng biểu thống kê"));
  assert.ok(docXml.includes("Table 1 — Bảng tổng hợp tham số mô hình"));
  assert.ok(docXml.includes("<w:tab/><w:t>3</w:t>"));
});

test("Phase 9 - 3. Multiple lists: Figure and Table lists export independently without mixing entries", async () => {
  const figAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_fig_m",
    title: "Danh mục hình ảnh",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "cap_f1",
        targetId: null,
        label: "Figure",
        number: 1,
        text: "Hình ảnh một",
        fullTitle: "Figure 1 — Hình ảnh một",
        labelAndNumber: "Figure 1",
        pageNumber: 1,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const tblAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_tbl_m",
    title: "Danh mục bảng biểu",
    label: "Table",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "cap_t1",
        targetId: null,
        label: "Table",
        number: 1,
        text: "Bảng biểu một",
        fullTitle: "Table 1 — Bảng biểu một",
        labelAndNumber: "Table 1",
        pageNumber: 4,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const doc = createBaseDocument([
    { type: "captionList", attrs: figAttrs },
    { type: "paragraph", content: [{ type: "text", text: "Đoạn văn phân cách giữa hai danh mục." }] },
    { type: "captionList", attrs: tblAttrs },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra thứ tự xuất hiện độc lập
  const figIndex = docXml.indexOf("Danh mục hình ảnh");
  const sepIndex = docXml.indexOf("Đoạn văn phân cách giữa hai danh mục.");
  const tblIndex = docXml.indexOf("Danh mục bảng biểu");

  assert.ok(figIndex !== -1);
  assert.ok(sepIndex !== -1);
  assert.ok(tblIndex !== -1);
  assert.ok(figIndex < sepIndex, "Danh mục hình phải xuất hiện trước đoạn phân cách");
  assert.ok(sepIndex < tblIndex, "Danh mục bảng phải xuất hiện sau đoạn phân cách");

  // Đảm bảo không trộn entries
  const fEntryPos = docXml.indexOf("Figure 1 — Hình ảnh một");
  const tEntryPos = docXml.indexOf("Table 1 — Bảng biểu một");
  assert.ok(fEntryPos < sepIndex);
  assert.ok(tEntryPos > sepIndex);
});

test("Phase 9 - 4. Custom label support: exports custom caption labels seamlessly", async () => {
  const customAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_custom_001",
    title: "Danh mục sơ đồ thuật toán",
    label: "Sơ đồ",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "cap_cust_1",
        targetId: null,
        label: "Sơ đồ",
        number: 1,
        text: "Thuật toán tối ưu hóa bầy đàn",
        fullTitle: "Sơ đồ 1 — Thuật toán tối ưu hóa bầy đàn",
        labelAndNumber: "Sơ đồ 1",
        pageNumber: 7,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const doc = createBaseDocument([{ type: "captionList", attrs: customAttrs }]);
  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes("Danh mục sơ đồ thuật toán"));
  assert.ok(docXml.includes("Sơ đồ 1 — Thuật toán tối ưu hóa bầy đàn"));
  assert.ok(docXml.includes("<w:tab/><w:t>7</w:t>"));
});

test("Phase 9 - 5. Formatting & Presets: classic (dot), modern (none), formal (hyphen), showPageNumbers and rightAlignPageNumbers", async () => {
  // Preset Modern: leader none
  const modernAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_mod",
    title: "Danh mục Modern",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "modern",
    entries: [
      {
        captionId: "cap_m1",
        targetId: null,
        label: "Figure",
        number: 1,
        text: "Ảnh Modern",
        fullTitle: "Figure 1 — Ảnh Modern",
        labelAndNumber: "Figure 1",
        pageNumber: 10,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  // Preset Formal: leader hyphen
  const formalAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_form",
    title: "Danh mục Formal",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "formal",
    entries: [
      {
        captionId: "cap_f1",
        targetId: null,
        label: "Figure",
        number: 1,
        text: "Ảnh Formal",
        fullTitle: "Figure 1 — Ảnh Formal",
        labelAndNumber: "Figure 1",
        pageNumber: 12,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  // Ẩn số trang (showPageNumbers = false)
  const noPageNumAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_nopage",
    title: "Danh mục không số trang",
    label: "Figure",
    showPageNumbers: false,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "cap_np1",
        targetId: null,
        label: "Figure",
        number: 1,
        text: "Ảnh không số trang",
        fullTitle: "Figure 1 — Ảnh không số trang",
        labelAndNumber: "Figure 1",
        pageNumber: 99,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  // Không căn phải số trang (rightAlignPageNumbers = false)
  const inlinePageNumAttrs: CaptionListNodeAttrs = {
    id: "ref_clist_inlinepage",
    title: "Danh mục số trang liền kề",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: false,
    preset: "classic",
    entries: [
      {
        captionId: "cap_ip1",
        targetId: null,
        label: "Figure",
        number: 1,
        text: "Ảnh số trang liền kề",
        fullTitle: "Figure 1 — Ảnh số trang liền kề",
        labelAndNumber: "Figure 1",
        pageNumber: 15,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const doc = createBaseDocument([
    { type: "captionList", attrs: modernAttrs },
    { type: "captionList", attrs: formalAttrs },
    { type: "captionList", attrs: noPageNumAttrs },
    { type: "captionList", attrs: inlinePageNumAttrs },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // 1. Modern: leader none
  assert.ok(docXml.includes('w:leader="none"'), "Preset modern phải dùng w:leader=none");

  // 2. Formal: leader hyphen
  assert.ok(docXml.includes('w:leader="hyphen"'), "Preset formal phải dùng w:leader=hyphen");

  // 3. No page number: không có chuỗi "<w:t>99</w:t>"
  assert.equal(docXml.includes("<w:t>99</w:t>"), false, "Không được xuất số trang khi showPageNumbers=false");

  // 4. Inline page number: số trang đặt trong ngoặc đơn (15), không có right-aligned tab
  assert.ok(docXml.includes("(15)"), "Khi rightAlignPageNumbers=false phải xuất số trang liền kề (15)");
});

test("Phase 9 - 6. Page numbers preservation: correctly reflects assigned page numbers", async () => {
  const attrs: CaptionListNodeAttrs = {
    id: "ref_clist_page_check",
    title: "Danh mục kiểm tra trang",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [
      {
        captionId: "c1",
        targetId: null,
        label: "Figure",
        number: 1,
        text: "Trang 42",
        fullTitle: "Figure 1 — Trang 42",
        labelAndNumber: "Figure 1",
        pageNumber: 42,
      },
    ],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const doc = createBaseDocument([{ type: "captionList", attrs }]);
  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  assert.ok(docXml.includes("<w:tab/><w:t>42</w:t>"), "Số trang 42 phải được bảo toàn chính xác");
});

test("Phase 9 - 7. DOCX package validity: word/styles.xml contains TableofFigures style and valid ZIP parts", async () => {
  const attrs: CaptionListNodeAttrs = {
    id: "ref_clist_validity",
    title: "Danh mục hợp lệ",
    label: "Figure",
    showPageNumbers: true,
    rightAlignPageNumbers: true,
    preset: "classic",
    entries: [],
    lastUpdated: "2026-10-08T00:00:00.000Z",
  };

  const doc = createBaseDocument([{ type: "captionList", attrs }]);
  const docxBytes = await exportDocumentModelToDocx(doc);

  // Mở ZIP kiểm tra tính toàn vẹn
  const zip = await JSZip.loadAsync(docxBytes);
  assert.ok(zip.file("[Content_Types].xml"));
  assert.ok(zip.file("_rels/.rels"));
  assert.ok(zip.file("word/document.xml"));
  assert.ok(zip.file("word/styles.xml"));
  assert.ok(zip.file("word/_rels/document.xml.rels"));

  // Kiểm tra styles.xml chứa định nghĩa TableofFigures
  const stylesXml = await zip.file("word/styles.xml")!.async("string");
  assert.ok(
    stylesXml.includes('w:styleId="TableofFigures"'),
    "styles.xml phải chứa định nghĩa paragraph style TableofFigures"
  );
  assert.ok(
    stylesXml.includes('w:name w:val="table of figures"'),
    "Style TableofFigures phải có tên 'table of figures'"
  );

  // Empty state paragraph
  const docXml = await zip.file("word/document.xml")!.async("string");
  assert.ok(
    docXml.includes('(Chưa có chú thích nào cho nhãn "Figure" trong tài liệu)'),
    "Empty state phải xuất thông báo placeholder an toàn"
  );
});

test("Phase 9 - 8. Zero Regression: Existing TOC and Caption export operate flawlessly alongside Caption List", async () => {
  const doc = createBaseDocument([
    // 1. Table of Contents
    {
      type: "tableOfContents",
      attrs: {
        title: "Mục lục tài liệu",
        entries: [
          { level: 1, text: "1. Giới thiệu", pageNumber: 1 },
          { level: 2, text: "1.1. Bối cảnh", pageNumber: 2 },
        ],
        showPageNumbers: true,
      },
    },
    // 2. Caption List
    {
      type: "captionList",
      attrs: {
        title: "Danh mục hình ảnh",
        label: "Figure",
        showPageNumbers: true,
        rightAlignPageNumbers: true,
        preset: "classic",
        entries: [
          {
            captionId: "cap_fig_reg_1",
            targetId: "img_reg_1",
            label: "Figure",
            number: 1,
            text: "Sơ đồ minh họa",
            fullTitle: "Figure 1 — Sơ đồ minh họa",
            labelAndNumber: "Figure 1",
            pageNumber: 3,
          },
        ],
        lastUpdated: "2026-10-08T00:00:00.000Z",
      },
    },
    // 3. Caption Node trong tài liệu
    {
      type: "caption",
      attrs: {
        id: "cap_fig_reg_1",
        label: "Figure",
        number: 1,
        text: "Sơ đồ minh họa",
      },
    },
  ]);

  const docxBytes = await exportDocumentModelToDocx(doc);
  const zip = await JSZip.loadAsync(docxBytes);
  const docXml = await zip.file("word/document.xml")!.async("string");

  // Kiểm tra TOC export regression: TOC1 và TOC2 phải tồn tại
  assert.ok(docXml.includes("Mục lục tài liệu"));
  assert.ok(docXml.includes('w:pStyle w:val="TOC1"'));
  assert.ok(docXml.includes('w:pStyle w:val="TOC2"'));
  assert.ok(docXml.includes("1. Giới thiệu"));

  // Kiểm tra Caption List export: TableofFigures phải tồn tại
  assert.ok(docXml.includes("Danh mục hình ảnh"));
  assert.ok(docXml.includes('w:pStyle w:val="TableofFigures"'));
  assert.ok(docXml.includes("Figure 1 — Sơ đồ minh họa"));

  // Kiểm tra Caption node export regression: Style Caption căn giữa phải tồn tại
  assert.ok(docXml.includes('w:pStyle w:val="Caption"'));
  assert.ok(docXml.includes('w:jc w:val="center"'));
});
